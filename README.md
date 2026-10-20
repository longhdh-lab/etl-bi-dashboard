```markdown
# ETL BI Dashboard

Pipeline ETL đa nguồn + API .NET + dashboard React để theo dõi doanh số theo ngày.

## Tổng quan

Project gồm 3 phần:

| Thành phần | Thư mục | Vai trò |
|---|---|---|
| **ETL** | `etl/` | Extract nhiều nguồn MySQL + CSV/JSON/Excel → Load từng bảng vào SQLite, đồng thời aggregate doanh thu theo ngày |
| **Backend** | `backend/` | ASP.NET Core API đọc `warehouse.db`, trả KPI + chart data |
| **Frontend** | `frontend/` | React (Vite) dashboard hiển thị KPI và biểu đồ doanh thu |

Luồng dữ liệu:

```
MySQL + etl/data/*  →  etl_pipeline.py  →  warehouse.db (nhiều bảng + fact_daily_sales)
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

```bash
pip install -r etl/requirements.txt
```

`openpyxl` được dùng khi đọc file `.xlsx`.

### Bước 2 — Cấu hình ETL

Chỉnh `etl/pipeline_config.yaml`:

- Thêm một mục vào `file_sources` cho mỗi CSV/JSON/Excel; `path` nhận file hoặc folder và `target_table` là bảng warehouse.
- Thêm một mục vào `db_sources` cho mỗi bảng DB. Cấu hình MySQL mẫu kế thừa thông tin kết nối trong mục `mysql`; có thể thêm bảng khác với `table` và `target_table` riêng.
- Các nguồn cùng `target_table` được nối theo tên cột; cột không có ở một nguồn được để trống.
- Mỗi bảng nguồn được ghi đè (`replace`) khi chạy lại. `sales_raw.csv` tiếp tục tạo `fact_daily_sales` theo `schema_mapping`.

### Bước 3 — Chạy ETL

Từ thư mục gốc project:

```bash
python etl/etl_pipeline.py
```

Kết quả: tạo/ghi đè các bảng cấu hình trong `warehouse.db`, bao gồm `dim_customers`, `dim_products`, `fact_orders`, `fact_order_details`, `raw_sales` và `fact_daily_sales` (`date`, `total_revenue`, `total_orders`, `avg_order_value`).

> Nếu một nguồn MySQL không kết nối/đọc được, pipeline in cảnh báo và tiếp tục nạp các nguồn còn lại.

### Bước 4 — Chạy Backend (.NET)

```bash
cd backend
dotnet restore
dotnet run
```

- Profile mặc định (`launchSettings.json`): `http://localhost:5136`
- Swagger (Development): `http://localhost:5136/swagger`
- API chính: `GET /api/dashboard/summary`

### Bước 5 — Chạy Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

Frontend mặc định gọi backend tại `http://localhost:5136`, khớp với profile BE. Để dùng địa chỉ khác, tạo `frontend/.env.local` với nội dung:

```dotenv
VITE_API_BASE_URL=http://localhost:5136
```

Khởi động lại Vite sau khi sửa biến môi trường. Mở URL Vite in ra terminal (thường `http://localhost:5173`).

### Kiểm tra nhanh local

1. ETL chạy xong → có file `warehouse.db` ở root  
2. Backend trả dữ liệu từ `GET /api/dashboard/overview`, `GET /api/dashboard/tables`, và `GET /api/dashboard/summary`
3. Dashboard hiển thị overview các bảng, preview từng bảng và tab doanh thu ngày

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

Trước khi build production, cấu hình URL backend trong `frontend/.env.production`:

```dotenv
VITE_API_BASE_URL=https://api.example.com
```

Vite sẽ nhúng URL này vào frontend khi chạy `npm run build`.

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
| Frontend lỗi kết nối API | Backend chưa chạy, hoặc `VITE_API_BASE_URL` không khớp URL backend |
| ETL `KeyError` cột | File trong `etl/data` không khớp `schema_mapping` (cần `order_id`, `timestamp`, `amount`) |
| MySQL extract trống | Sai credential / DB chưa tạo — pipeline vẫn tiếp tục với file source |

## License

Private / PlayTime project.
```

---

### Điểm cần lưu ý khi viết README (đã gắn trong nội dung trên)

1. **Backend URL:** Frontend mặc định gọi `http://localhost:5136`; đổi bằng `VITE_API_BASE_URL` nếu backend chạy ở địa chỉ khác.
2. **Schema ETL:** `sales_raw.csv` dùng mapping timestamp/amount; các CSV Northwind được nạp riêng theo schema nguồn.

Nếu muốn tôi tạo file `README.md` sẵn trong repo, hãy chuyển sang **Agent mode** và nhờ lại.
