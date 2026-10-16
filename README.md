Bạn đang ở **Ask mode** — tôi không thể tạo file trên disk. Dưới đây là nội dung `README.md` đầy đủ; bạn có thể copy vào root project, hoặc chuyển sang **Agent mode** để tôi tạo giúp.

---

```markdown
# ETL BI Dashboard

Pipeline ETL đa nguồn + API .NET + dashboard React để theo dõi doanh số theo ngày.

## Tổng quan

Project gồm 3 phần:

| Thành phần | Thư mục | Vai trò |
|---|---|---|
| **ETL** | `etl/` | Extract (MySQL + file CSV/JSON/Excel) → Transform (aggregate theo ngày) → Load vào SQLite |
| **Backend** | `backend/` | ASP.NET Core API đọc `warehouse.db`, trả KPI + chart data |
| **Frontend** | `frontend/` | React (Vite) dashboard hiển thị KPI và biểu đồ doanh thu |

Luồng dữ liệu:

```
MySQL / etl/data/*  →  etl_pipeline.py  →  warehouse.db (fact_daily_sales)
                                              ↓
                                    DashboardController API
                                              ↓
                                      React Dashboard
```

## Yêu cầu môi trường

- **Python** 3.10+
- **.NET SDK** 10.0 (`net10.0`)
- **Node.js** 18+ (khuyến nghị LTS)
- *(Tùy chọn)* MySQL nếu dùng nguồn DB trong `pipeline_config.yaml`

## Cấu trúc thư mục

```
etl-bi-dashboard/
├── etl/
│   ├── etl_pipeline.py          # Pipeline ETL chính
│   ├── pipeline_config.yaml     # Cấu hình nguồn / mapping / destination
│   └── data/                    # File nguồn (CSV, JSON, Excel)
├── backend/                     # ASP.NET Core Web API
├── frontend/                    # React + Vite dashboard
├── warehouse.db                 # SQLite data warehouse (sinh bởi ETL)
└── Northwind_mysql.sql          # Script mẫu MySQL (nếu cần)
```

## 1. Build & chạy local

### Bước 1 — Cài dependency Python (ETL)

Chưa có `requirements.txt` trong repo; cài các package sau:

```bash
pip install pandas pyyaml sqlalchemy pymysql openpyxl
```

> `openpyxl` cần nếu đọc file `.xlsx`. PostgreSQL helper (nếu dùng) cần thêm `psycopg2-binary` và `requests` cho API helper.

### Bước 2 — Cấu hình ETL

Chỉnh `etl/pipeline_config.yaml`:

- **MySQL**: `host`, `port`, `user`, `password`, `database`, `table_name`
- **File source**: `folder_path` (mặc định `etl/data`), `batch_size`
- **Schema mapping**: cột nguồn map sang warehouse  
  - Mặc định: `order_id`, `timestamp`, `amount`  
  - File mẫu đúng schema: `etl/data/sales_raw.csv`
- **Destination**: `warehouse.db` → bảng `fact_daily_sales`

### Bước 3 — Chạy ETL

Từ thư mục gốc project:

```bash
python etl/etl_pipeline.py
```

Kết quả: tạo/ghi đè `warehouse.db` với bảng `fact_daily_sales`  
(`date`, `total_revenue`, `total_orders`, `avg_order_value`).

> MySQL không bắt buộc. Nếu kết nối MySQL thất bại, pipeline vẫn chạy với dữ liệu từ thư mục file.

### Bước 4 — Chạy Backend (.NET)

```bash
cd backend
dotnet restore
dotnet run
```

- Profile mặc định (`launchSettings.json`): `http://localhost:5136`
- Swagger (Development): `http://localhost:5136/swagger`
- API chính: `GET /api/dashboard/summary`

**Lưu ý port:** Frontend đang gọi `http://localhost:5000`. Có 2 cách khớp:

```bash
# Cách A: chạy backend đúng port frontend đang gọi
dotnet run --urls "http://localhost:5000"

# Cách B: sửa URL trong frontend/src/App.jsx cho khớp port 5136
```

### Bước 5 — Chạy Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

Mở URL Vite in ra terminal (thường `http://localhost:5173`).

### Kiểm tra nhanh local

1. ETL chạy xong → có file `warehouse.db` ở root  
2. `GET http://localhost:<port>/api/dashboard/summary` trả JSON KPI + `chartData`  
3. Dashboard hiển thị Total Revenue / Total Orders / Avg Order Value + line chart  

## 2. Build release / production

### ETL

ETL là script Python — không cần “build”. Khi deploy:

1. Đóng gói `etl/` + dependency (`pip freeze > requirements.txt` rồi `pip install -r requirements.txt`)
2. Chỉnh `pipeline_config.yaml` theo môi trường production
3. Schedule chạy định kỳ (cron / Task Scheduler / Airflow…)

```bash
python etl/etl_pipeline.py
```

### Backend (.NET) — publish

```bash
cd backend

# Publish self-contained (Windows x64)
dotnet publish -c Release -r win-x64 --self-contained true -o ../dist/backend

# Hoặc framework-dependent (máy đích đã cài .NET runtime)
dotnet publish -c Release -o ../dist/backend
```

Chạy bản publish:

```bash
cd dist/backend
# Đảm bảo warehouse.db nằm đúng relative path: ../warehouse.db so với thư mục chạy API
# (Controller đọc Path.Combine(GetCurrentDirectory(), "..", "warehouse.db"))
dotnet backend.dll --urls "http://0.0.0.0:5000"
# hoặc chạy backend.exe nếu publish self-contained
```

### Frontend (Vite) — production build

```bash
cd frontend
npm ci
npm run build
```

Output: `frontend/dist/`

Preview local:

```bash
npm run preview
```

Deploy static (`dist/`) lên Nginx, IIS, Cloudflare Pages, S3+CloudFront, v.v.

Trước khi release, đổi API URL cứng trong `App.jsx` sang biến môi trường / URL production, ví dụ:

```js
axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/dashboard/summary`)
```

và set `VITE_API_BASE_URL` khi build.

### Gợi ý layout release

```
dist/
├── warehouse.db          # do ETL ghi
├── backend/              # dotnet publish
└── frontend/             # nội dung frontend/dist (static)
```

## 3. API reference

### `GET /api/dashboard/summary`

**Response (rút gọn):**

```json
{
  "kpis": {
    "totalRevenue": 1234.56,
    "totalOrders": 42,
    "avgOrderValue": 29.39
  },
  "chartData": [
    {
      "date": "2026-03-01",
      "total_Revenue": 239.5,
      "total_Orders": 2,
      "avg_Order_Value": 119.75
    }
  ]
}
```

**404** nếu chưa có `warehouse.db` — cần chạy ETL trước.

## 4. Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| `warehouse.db not found` | Chưa chạy `etl_pipeline.py`, hoặc backend chạy sai working directory |
| Frontend lỗi kết nối API | Port mismatch (5000 vs 5136) hoặc CORS/backend chưa chạy |
| ETL `KeyError` cột | File trong `etl/data` không khớp `schema_mapping` (cần `order_id`, `timestamp`, `amount`) |
| MySQL extract trống | Sai credential / DB chưa tạo — pipeline vẫn tiếp tục với file source |

## License

Private / PlayTime project.
```

---

### Điểm cần lưu ý khi viết README (đã gắn trong nội dung trên)

1. **Port lệch:** Frontend gọi `:5000`, backend mặc định `:5136`.
2. **Schema ETL:** Chỉ file kiểu `sales_raw.csv` khớp mapping; các CSV Northwind khác (`orders.csv`, …) không có `timestamp`/`amount` — có thể làm transform lỗi nếu nằm chung thư mục `etl/data`.
3. **Chưa có `requirements.txt`** — README hướng dẫn cài tay.

Nếu muốn tôi tạo file `README.md` sẵn trong repo, hãy chuyển sang **Agent mode** và nhờ lại.
