import os
import glob
import sqlite3
import yaml
import pandas as pd
from sqlalchemy import URL, create_engine
from sqlalchemy.exc import SQLAlchemyError

# 1. Đọc và tải file cấu hình YAML
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "pipeline_config.yaml")

def load_config():
    if not os.path.exists(CONFIG_PATH):
        raise FileNotFoundError(f"Không tìm thấy file cấu hình tại: {CONFIG_PATH}")
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)

# ==========================================
# EXTRACT 1: MySQL Source
# ==========================================
def extract_from_mysql(config):
    db_cfg = config['mysql']
    print(f"📥 [MySQL] Đang kết nối tới DB '{db_cfg['database']}', bảng '{db_cfg['table_name']}'...")
    
    try:
        connection_url = URL.create(
            drivername="mysql+pymysql",
            username="root",
            password="root",
            host="localhost",
            port=3306,
            database="sales_db",
        )
        # connection_url = f"mysql+pymysql://{db_cfg['user']}:{db_cfg['password']}@{db_cfg['host']}:{db_cfg['port']}/{db_cfg['database']}"
        engine = create_engine(connection_url)
        
        # Đọc dữ liệu dựa trên bảng và cột watermark định nghĩa từ config
        query = f"SELECT * FROM {db_cfg['table_name']}"
        df = pd.read_sql(query, engine)
        print(f" -> [MySQL] Lấy thành công {len(df)} bản ghi.")
        return df
    except Exception as e:
        print(f" ⚠️ [MySQL] Kết nối thất bại hoặc chưa cấu hình DB: {e}")
        return pd.DataFrame()

# ==========================================
# EXTRACT 2: Multi-format Folder Source (Batching/Chunking)
# ==========================================
def read_single_file(file_path):
    """Đọc file theo định dạng extension tự động"""
    ext = os.path.splitext(file_path)[1].lower()
    if ext == '.csv':
        return pd.read_csv(file_path)
    elif ext in ['.xlsx', '.xls']:
        return pd.read_excel(file_path)
    elif ext == '.json':
        return pd.read_json(file_path)
    raise ValueError(f"Định dạng file không được hỗ trợ: {file_path}")

def resolve_project_path(path):
    if os.path.isabs(path):
        return path
    project_root = os.path.dirname(BASE_DIR)
    return os.path.abspath(os.path.join(project_root, path))

def extract_from_file_source(source):
    source_path = resolve_project_path(source['path'])
    if not os.path.exists(source_path):
        raise FileNotFoundError(f"Không tìm thấy file source: {source_path}")

    if os.path.isfile(source_path):
        return read_single_file(source_path)

    supported_extensions = ('*.csv', '*.json', '*.xlsx', '*.xls')
    files = []
    for extension in supported_extensions:
        files.extend(glob.glob(os.path.join(source_path, extension)))
    files.sort()
    if not files:
        raise FileNotFoundError(f"Không tìm thấy file CSV/JSON/Excel trong folder: {source_path}")

    batch_size = source.get('batch_size', 5)
    if batch_size < 1:
        raise ValueError(f"batch_size phải lớn hơn 0 cho source '{source['name']}'")

    batches = []
    for start in range(0, len(files), batch_size):
        batch = [read_single_file(path) for path in files[start:start + batch_size]]
        batches.extend(frame for frame in batch if not frame.empty)

    if not batches:
        return pd.DataFrame()
    return pd.concat(batches, ignore_index=True, sort=False)

def extract_from_db_source(source):
    source_type = source.get('type', 'mysql').lower()
    if source_type != 'mysql':
        raise ValueError(f"Loại DB source chưa được hỗ trợ: {source_type}")

    table_name = source.get('table', source.get('table_name'))
    if not table_name:
        raise KeyError(f"Thiếu 'table' trong DB source '{source['name']}'")

    connection_url = URL.create(
        drivername="mysql+pymysql",
        username=source['user'],
        password=source['password'],
        host=source['host'],
        port=source.get('port', 3306),
        database=source['database'],
    )
    engine = create_engine(connection_url)
    try:
        return pd.read_sql_table(table_name, engine)
    except SQLAlchemyError as error:
        print(f" ⚠️ [DB:{source['name']}] Không thể đọc bảng '{table_name}': {error}")
        return pd.DataFrame()
    finally:
        engine.dispose()

def load_table(df, target_table, config):
    destination = config['destination']
    db_path = resolve_project_path(destination['db_path'])
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    connection = sqlite3.connect(db_path)
    try:
        df.to_sql(target_table, connection, if_exists="replace", index=False)
    finally:
        connection.close()
    print(f"✅ Đã ghi {len(df)} bản ghi vào '{target_table}' ({db_path}).")

def run_multi_source_pipeline(config):
    frames_by_table = {}
    sales_frames = []

    for source in config.get('file_sources', []):
        frame = extract_from_file_source(source)
        target_table = source['target_table']
        frames_by_table.setdefault(target_table, []).append(frame)
        if source['name'].lower() == 'sales_raw':
            sales_frames.append(frame)
        print(f"📁 [File:{source['name']}] Đã đọc {len(frame)} bản ghi.")

    for source in config.get('db_sources', []):
        frame = extract_from_db_source(source)
        target_table = source['target_table']
        frames_by_table.setdefault(target_table, []).append(frame)
        if source['name'].lower() == 'sales_raw':
            sales_frames.append(frame)
        print(f"🗄️ [DB:{source['name']}] Đã đọc {len(frame)} bản ghi.")

    for target_table, frames in frames_by_table.items():
        combined = pd.concat(frames, ignore_index=True, sort=False)
        load_table(combined, target_table, config)

    if sales_frames:
        sales_data = pd.concat(sales_frames, ignore_index=True, sort=False)
        daily_summary = transform(sales_data, config)
        load_table(daily_summary, config['destination']['target_table'], config)

def extract_from_folder(config):
    folder_cfg = config['file_source']
    folder_path = os.path.join(BASE_DIR, "..", folder_cfg['folder_path'])
    batch_size = folder_cfg.get('batch_size', 5)

    if not os.path.exists(folder_path):
        print(f" ⚠️ Thư mục '{folder_path}' không tồn tại.")
        return pd.DataFrame()

    # Thu thập toàn bộ các file thuộc các định dạng csv, json, excel
    supported_extensions = ('*.csv', '*.json', '*.xlsx', '*.xls')
    all_files = []
    for ext in supported_extensions:
        all_files.extend(glob.glob(os.path.join(folder_path, ext)))

    print(f"📁 [Folder] Tìm thấy tổng cộng {len(all_files)} file hợp lệ trong thư mục.")

    if not all_files:
        return pd.DataFrame()

    # Chia nhỏ danh sách file thành từng Batch (Nhóm nhỏ) để xử lý
    all_dataframes = []
    for i in range(0, len(all_files), batch_size):
        batch_files = all_files[i:i + batch_size]
        print(f" 🔄 Đang xử lý Batch {i//batch_size + 1} ({len(batch_files)} file)...")
        
        batch_dfs = []
        for file in batch_files:
            df = read_single_file(file)
            if not df.empty:
                batch_dfs.append(df)
        
        if batch_dfs:
            combined_batch_df = pd.concat(batch_dfs, ignore_index=True)
            all_dataframes.append(combined_batch_df)

    if all_dataframes:
        final_folder_df = pd.concat(all_dataframes, ignore_index=True)
        print(f" -> [Folder] Tổng hợp thành công {len(final_folder_df)} bản ghi từ tất cả các file.")
        return final_folder_df
    
    return pd.DataFrame()

# ==========================================
# TRANSFORM STEP (Dynamic Schema via Mapping)
# ==========================================
def transform(df, config):
    print("⚙️ Transforming data dựa trên Schema Mapping trong Config...")
    if df.empty:
        print(" ⚠️ Dữ liệu đầu vào trống!")
        return pd.DataFrame(columns=["date", "total_revenue", "total_orders", "avg_order_value"])

    mapping = config['schema_mapping']
    
    # 1. Trích xuất tên cột từ Config (tránh Hard-coding)
    col_id = mapping['id_col']
    col_date = mapping['date_col']
    col_amount = mapping['amount_col']

    # Kiểm tra tính hợp lệ của các cột trong dataframe
    for col in [col_id, col_date, col_amount]:
        if col not in df.columns:
            raise KeyError(f"Cột '{col}' không tồn tại trong Dataset. Hãy kiểm tra lại schema_mapping!")

    # 2. Xử lý chuẩn hóa dữ liệu
    df = df.dropna(subset=[col_amount, col_date])
    df[col_amount] = pd.to_numeric(df[col_amount], errors='coerce')
    df['date'] = pd.to_datetime(df[col_date]).dt.strftime('%Y-%m-%d')

    # 3. Tính toán Aggregations cho BI Dashboard
    daily_summary = df.groupby('date').agg(
        total_revenue=(col_amount, 'sum'),
        total_orders=(col_id, 'count'),
        avg_order_value=(col_amount, 'mean')
    ).reset_index()

    daily_summary['total_revenue'] = daily_summary['total_revenue'].round(2)
    daily_summary['avg_order_value'] = daily_summary['avg_order_value'].round(2)

    return daily_summary

# ==========================================
# LOAD STEP
# ==========================================
def load(df_summary, config):
    dest_cfg = config['destination']
    db_path = os.path.join(BASE_DIR, "..", dest_cfg['db_path'])
    
    print(f"📤 Loading data vào Data Warehouse SQLite ('{dest_cfg['target_table']}')...")
    conn = sqlite3.connect(db_path)
    
    df_summary.to_sql(dest_cfg['target_table'], conn, if_exists="replace", index=False)
    conn.close()
    print(f"✅ Pipeline hoàn tất thành công! Đã ghi dữ liệu ra file: {db_path}")

# ==========================================
# MAIN EXECUTION
# ==========================================
if __name__ == "__main__":
    # Tải cấu hình
    config = load_config()

    if 'file_sources' in config or 'db_sources' in config:
        run_multi_source_pipeline(config)
    else:
        df_mysql = extract_from_mysql(config)
        df_folder = extract_from_folder(config)
        raw_df = pd.concat([df_mysql, df_folder], ignore_index=True)
        summary_df = transform(raw_df, config)
        load(summary_df, config)

# ==========================================
# 3. HELPER FUNCTIONS
# ==========================================

def extract_from_csv(file_path):
    # Đọc dữ liệu từ file CSV
    df = pd.read_csv(file_path)
    return df

def extract_from_excel(file_path):
    # Đọc dữ liệu từ file Excel (.xlsx)
    df = pd.read_excel(file_path, sheet_name='SalesData')
    return df

def extract_from_json(file_path):
    # Đọc dữ liệu từ file JSON
    df = pd.read_json(file_path)
    return df

def extract_from_api():
    url = "https://api.coindesk.com/v1/bpi/historical/close.json" # Ví dụ public API
    response = requests.get(url)
    
    if response.status_code == 200:
        data = response.json()
        # Chuyển đổi response JSON sang DataFrame
        bpi_data = data.get('bpi', {})
        df = pd.DataFrame(list(bpi_data.items()), columns=['date', 'price'])
        return df
    else:
        raise Exception(f"API Error: {response.status_code}")

def extract_from_postgres():
    # Chuỗi kết nối tới Production Database
    # Format: postgresql://user:password@localhost:5432/dbname
    engine = create_engine("postgresql://postgres:root@localhost:5432/sales_db")
    
    query = """
        SELECT order_id, created_at AS timestamp, amount, category
        FROM raw_orders
        WHERE created_at >= NOW() - INTERVAL '30 days'
    """
    df = pd.read_sql(query, engine)
    return df