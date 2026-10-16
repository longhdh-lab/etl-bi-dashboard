# Project Tasks — ETL BI Dashboard

Theo dõi công việc đã hoàn thành và còn lại. Cập nhật status khi làm xong từng mục.

**Legend:** `[x]` Done · `[ ]` Todo · `[~]` In progress

**Mục tiêu hiện tại (P0):** Thu gom data từ **CSV + database** (config nhiều `file_source` / source table trong YAML) → merge → ghi `warehouse.db` → FE báo cáo **tổng hợp mọi bảng**, không chỉ doanh thu bảng orders.

---

## Đã hoàn thành

### Nền tảng & cấu trúc
- [x] Khởi tạo monorepo 3 phần: `etl/`, `backend/`, `frontend/`
- [x] Tạo `warehouse.db` (SQLite) làm data warehouse
- [x] Thêm dữ liệu mẫu `etl/data/` (CSV Northwind + `sales_raw.csv`)
- [x] Thêm script MySQL mẫu `Northwind_mysql.sql`
- [x] Viết `README.md` (giới thiệu, build local, release)

### ETL (`etl/`) — MVP hiện tại (chỉ sales / orders)
- [x] Pipeline Extract → Transform → Load (`etl_pipeline.py`)
- [x] YAML cơ bản: 1 MySQL table + 1 folder file + schema mapping sales
- [x] Extract MySQL (fallback khi DB lỗi) + extract folder (CSV/JSON/Excel, batch)
- [x] Transform aggregate → `fact_daily_sales`
- [x] Load vào `warehouse.db`

### Backend (`backend/`) — MVP hiện tại
- [x] ASP.NET Core Web API (`net10.0`) + Swagger + CORS
- [x] `GET /api/dashboard/summary` — KPI + chart doanh thu ngày
- [x] DTO: `DailySalesDto`, `KpiDto`, `DashboardSummaryResponse`

### Frontend (`frontend/`) — MVP hiện tại (chỉ doanh thu)
- [x] React + Vite, Axios, Recharts
- [x] KPI: Total Revenue / Total Orders / Avg Order Value + line chart doanh thu

> Ghi chú: phần hoàn thành ở trên là **slice doanh thu (orders)**. P0 bên dưới mở rộng sang đa bảng / đa nguồn.

---

## Cần làm tiếp

### P0 — Đa nguồn YAML → Warehouse → FE tổng hợp (ưu tiên cao nhất)

#### 1. ETL: config & thu gom CSV + DB
- [ ] Mở rộng `pipeline_config.yaml` hỗ trợ **nhiều** nguồn file, ví dụ:
  ```yaml
  file_sources:
    - name: customers
      path: etl/data/customers.csv   # file hoặc folder
      target_table: dim_customers
    - name: products
      path: etl/data/products.csv
      target_table: dim_products
    - name: orders
      path: etl/data/orders.csv
      target_table: fact_orders
  ```
- [ ] Mở rộng YAML hỗ trợ **nhiều** source table từ DB, ví dụ:
  ```yaml
  db_sources:
    - name: mysql_orders
      type: mysql
      host: localhost
      port: 3306
      user: root
      password: root
      database: sales_db
      table: orders
      target_table: fact_orders
    # thêm tables khác: customers, products, order_details, ...
  ```
- [ ] Extract từng nguồn độc lập (schema riêng từng bảng — **không** ép chung `order_id/timestamp/amount`)
- [ ] Merge cùng `target_table` nếu vừa CSV vừa DB (union / concat, xử lý trùng cột)
- [ ] Load từng bảng vào `warehouse.db` (`if_exists=replace` hoặc strategy rõ ràng)
- [ ] Giữ / mở rộng fact tổng hợp doanh thu (`fact_daily_sales`) nếu vẫn cần cho chart orders
- [ ] Thêm `etl/requirements.txt`

#### 2. Backend: API đa bảng
- [ ] Đọc `warehouse.db` path từ YAML runtime (sửa YAML + restart là ăn, **không rebuild**)
- [ ] API liệt kê bảng trong warehouse (vd. `GET /api/dashboard/tables`)
- [ ] API summary / count / preview theo bảng (vd. `GET /api/dashboard/tables/{name}`)
- [ ] Giữ endpoint sales summary hiện tại (hoặc gộp vào overview) để không mất chart doanh thu
- [ ] Overview KPI đa bảng: số bảng, tổng row, last refreshed, …

#### 3. Frontend: báo cáo tổng hợp mọi bảng
- [ ] Đổi FE từ “chỉ doanh thu orders” → **dashboard tổng hợp warehouse**
- [ ] Overview: danh sách bảng + số bản ghi + KPI tổng quan
- [ ] Xem chi tiết / preview từng bảng (table view)
- [ ] Giữ (hoặc tab riêng) báo cáo doanh thu cho bảng orders / `fact_daily_sales`
- [ ] Biểu đồ / thống kê theo từng loại bảng khi có dữ liệu phù hợp

---

### P1 — Tiếp theo (sau P0)

#### ETL
- [ ] Incremental extract theo `watermark_column`
- [ ] Logging rõ (file log, thời gian chạy, số row mỗi nguồn)
- [ ] Dọn helper chết trong `etl_pipeline.py` hoặc tách module
- [ ] Schedule chạy định kỳ (cron / Task Scheduler / Airflow)

#### Backend
- [ ] Health check (`/health`)
- [ ] Validation khi warehouse trống / thiếu bảng
- [ ] Unit / integration tests

#### Frontend
- [ ] `VITE_API_BASE_URL` thay URL hard-code
- [ ] Date range filter
- [ ] Loading skeleton / empty state / responsive / retry

#### DevOps & docs
- [ ] Root `.gitignore`
- [ ] Script `scripts/run-local.*`
- [ ] Cập nhật `README.md` theo luồng đa bảng
- [ ] Ghi chú schema warehouse chính thức

---

## Gợi ý thứ tự làm

1. **YAML đa `file_sources` + `db_sources`** + extract/merge/load từng `target_table` → `warehouse.db`
2. **`requirements.txt`**
3. **Backend API đa bảng** + path DB từ YAML
4. **FE dashboard tổng hợp** (overview mọi bảng) + giữ tab/section doanh thu
5. P1: incremental, polish UI, gitignore, docs

---

*Cập nhật lần cuối: 2026-10-16*
