# ETL BI Dashboard — Tài liệu thuyết trình

## 1. Giới thiệu dự án

ETL BI Dashboard là một ứng dụng mẫu xây dựng luồng dữ liệu từ nhiều nguồn vào một kho dữ liệu tập trung, sau đó cung cấp API và giao diện web để tra cứu, xem tổng quan và theo dõi doanh thu.

Project gồm ba phần chính:

| Thành phần | Công nghệ | Nhiệm vụ |
|---|---|---|
| ETL | Python, Pandas, SQLAlchemy | Đọc dữ liệu từ file và MySQL, xử lý dữ liệu, ghi vào warehouse |
| Data warehouse | SQLite (`warehouse.db`) | Lưu các bảng dữ liệu đã thu thập và bảng tổng hợp doanh thu |
| Backend API | ASP.NET Core Web API | Đọc warehouse, cung cấp API cho overview, danh sách bảng, preview và doanh thu |
| Frontend | React, Vite, Axios, Recharts | Hiển thị dashboard, dữ liệu bảng và biểu đồ doanh thu |

### Cách giới thiệu ngắn

> Dự án nhận dữ liệu từ CSV và MySQL, đưa từng bộ dữ liệu vào các bảng riêng trong SQLite. Một phần dữ liệu bán hàng được tổng hợp theo ngày để tính doanh thu và số đơn. Backend cung cấp các API đọc warehouse, còn frontend dùng các API đó để hiển thị overview, xem trước dữ liệu từng bảng và xem báo cáo doanh thu.

---

## 2. Bài toán và mục tiêu

Trong thực tế, dữ liệu phục vụ báo cáo thường nằm ở nhiều nơi và có nhiều cấu trúc khác nhau. Nếu mỗi báo cáo truy cập trực tiếp từng nguồn thì việc theo dõi và mở rộng sẽ khó khăn.

Dự án giải quyết bài toán ở quy mô mẫu bằng cách:

1. Thu thập dữ liệu từ nhiều file và nguồn MySQL.
2. Giữ schema riêng của từng nguồn/bảng thay vì ép mọi dữ liệu vào một schema chung.
3. Tập trung dữ liệu trong một warehouse SQLite.
4. Tạo bảng tổng hợp doanh thu theo ngày từ dữ liệu bán hàng phù hợp.
5. Cung cấp API và dashboard để xem dữ liệu warehouse.

---

## 3. Kiến trúc tổng thể

```text
CSV / JSON / Excel ─┐
                    ├──> Python ETL ───> warehouse.db (SQLite) ───> ASP.NET Core API ───> React Dashboard
MySQL tables ───────┘                         │
                                              └── fact_daily_sales
                                                   (tổng hợp doanh thu)
```

Luồng xử lý đi từ trái sang phải:

- ETL đọc các nguồn đã khai báo trong YAML.
- Mỗi nguồn được đưa vào bảng đích tương ứng trong SQLite.
- Các nguồn cùng `target_table` được nối dữ liệu trước khi ghi.
- Riêng dữ liệu `sales_raw` được dùng thêm để tạo bảng `fact_daily_sales`.
- Backend truy vấn warehouse và trả JSON qua HTTP API.
- Frontend gọi API rồi trình bày KPI, danh sách bảng, preview và biểu đồ.

---

## 4. ETL được thực hiện như thế nào?

ETL là phần thu thập và chuẩn bị dữ liệu trước khi dashboard sử dụng. Pipeline chính nằm trong `etl/etl_pipeline.py`; cấu hình nguồn và đích nằm trong `etl/pipeline_config.yaml`.

### 4.1 Extract — thu thập dữ liệu

**Nguồn file**

- Có thể khai báo nhiều mục `file_sources`.
- Mỗi mục có tên nguồn, đường dẫn và `target_table`.
- Đường dẫn có thể là một file hoặc một folder.
- Hỗ trợ CSV, JSON, Excel (`.xlsx`, `.xls`).
- Nếu đường dẫn là folder, các file được đọc theo batch rồi nối lại.

**Nguồn cơ sở dữ liệu**

- Có thể khai báo nhiều mục `db_sources`.
- Loại nguồn hiện được hỗ trợ trong pipeline đa nguồn là MySQL.
- Mỗi mục khai báo bảng nguồn và bảng đích tương ứng.
- Khi không đọc được một bảng MySQL, ETL in cảnh báo và trả về DataFrame rỗng để các nguồn khác vẫn có thể tiếp tục.

Ví dụ mô tả cấu hình, không bao gồm thông tin kết nối:

```yaml
file_sources:
  - name: customers
    path: etl/data/customers.csv
    target_table: dim_customers
  - name: products
    path: etl/data/products.csv
    target_table: dim_products

db_sources:
  - name: mysql_orders
    type: mysql
    table: orders
    target_table: fact_orders
```

### 4.2 Transform — chuẩn hóa và tổng hợp

Các bảng như customers, products, orders, order details, employees, suppliers và categories được đọc theo schema của chính chúng. Pipeline không yêu cầu các bảng này phải có cùng bộ cột.

Phần tổng hợp doanh thu áp dụng riêng cho nguồn `sales_raw`:

1. Lấy tên cột mã đơn, ngày và số tiền từ `schema_mapping`.
2. Kiểm tra các cột bắt buộc có trong dữ liệu.
3. Bỏ các dòng thiếu ngày hoặc số tiền.
4. Chuyển số tiền sang kiểu số và chuẩn hóa ngày về `YYYY-MM-DD`.
5. Nhóm theo ngày để tính:
   - `total_revenue`: tổng doanh thu trong ngày.
   - `total_orders`: số bản ghi có mã đơn, được đếm theo cột mã đơn; đây không phải phép đếm mã đơn duy nhất.
   - `avg_order_value`: số tiền trung bình trong ngày.

Kết quả được làm tròn đến hai chữ số thập phân cho doanh thu và giá trị trung bình.

### 4.3 Merge — gộp nguồn cùng bảng đích

Nếu nhiều nguồn cùng khai báo một `target_table`, ETL nối DataFrame của các nguồn đó theo tên cột. Cột chỉ có ở một nguồn vẫn được giữ; những dòng đến từ nguồn không có cột đó sẽ nhận giá trị rỗng.

Ví dụ hiện tại, dữ liệu file `orders.csv` và dữ liệu bảng MySQL `orders` cùng được đưa vào `fact_orders`.

### 4.4 Load — ghi vào warehouse

- Warehouse là file SQLite `warehouse.db`.
- Mỗi bảng đích được ghi riêng.
- Chiến lược hiện tại là `replace`: khi chạy ETL, bảng đích được thay thế bằng dữ liệu của lần chạy đó.
- Bảng tổng hợp doanh thu được ghi vào `fact_daily_sales`.

Với cấu hình hiện tại, warehouse có các bảng nguồn như `dim_customers`, `dim_products`, `fact_orders`, `fact_order_details`, `dim_categories` và các bảng Northwind khác, cùng `raw_sales` và `fact_daily_sales`.

### 4.5 Chạy ETL

Từ thư mục gốc project:

```bash
pip install -r etl/requirements.txt
python etl/etl_pipeline.py
```

ETL sử dụng cấu hình trong `etl/pipeline_config.yaml`. Muốn thêm hoặc đổi nguồn, cập nhật `file_sources`/`db_sources` và `target_table` tương ứng.

---

## 5. Backend làm gì?

Backend là lớp trung gian giữa warehouse và frontend. Nó tìm file SQLite, đọc metadata và dữ liệu, sau đó trả response dạng JSON.

Các endpoint chính:

| Endpoint | Mục đích |
|---|---|
| `GET /api/dashboard/overview` | Tổng số bảng, tổng số dòng, lần cập nhật gần nhất và thông tin tóm tắt các bảng |
| `GET /api/dashboard/tables?page=1&pageSize=20` | Liệt kê bảng theo trang |
| `GET /api/dashboard/tables/{tableName}?page=1&pageSize=20` | Trả tên cột, số dòng và preview dữ liệu của một bảng |
| `GET /api/dashboard/summary` | Trả KPI và dữ liệu doanh thu theo ngày từ `fact_daily_sales` |
| `GET /health` | Kiểm tra backend đang phản hồi |

Đường dẫn SQLite hiện được cấu hình cho backend qua `Warehouse:DbPath` trong `backend/appsettings.json` hoặc biến môi trường `WAREHOUSE_DB_PATH`.

### Chạy backend

Yêu cầu .NET SDK tương thích với `net10.0`.

```bash
cd backend
dotnet restore
dotnet run
```

Profile HTTP mặc định chạy tại `http://localhost:5136`. Swagger được bật trong môi trường Development.

---

## 6. Frontend hiển thị những gì?

Frontend là giao diện dashboard chạy trên trình duyệt. Các lệnh gọi HTTP và adapter ánh xạ response BE sang cấu trúc FE được đặt trong `frontend/src/dashboardApi.js`.

### Tab Overview

- KPI tổng số bảng, tổng số dòng và thời gian cập nhật warehouse.
- Biểu đồ so sánh số lượng dòng giữa các bảng.
- Danh sách bảng, số dòng, số cột và thời gian cập nhật.
- Khi chọn bảng, giao diện hiển thị danh sách cột, preview có phân trang và phân tích nhanh dựa trên dữ liệu preview hiện tại.

### Tab Revenue

- KPI tổng doanh thu, tổng số đơn và giá trị đơn trung bình.
- Biểu đồ doanh thu theo ngày từ `fact_daily_sales`.

Frontend mặc định gọi backend tại `http://localhost:5136`. Có thể đổi URL bằng biến môi trường `VITE_API_BASE_URL`.

### Chạy frontend

```bash
cd frontend
npm ci
npm run dev
```

Mở địa chỉ Vite in ra trong terminal, thường là `http://localhost:5173`.

---

## 7. Kịch bản demo đề xuất

1. **Giới thiệu bài toán:** dữ liệu đến từ nhiều file và MySQL, cần một nơi tập trung trước khi báo cáo.
2. **Mở YAML:** chỉ ra cấu hình có nhiều file source, DB source và bảng đích.
3. **Chạy ETL:** cho thấy từng nguồn được đọc, nối nếu dùng chung đích và ghi vào SQLite.
4. **Giải thích transform doanh thu:** chỉ `sales_raw` có mapping ngày/số tiền để tạo `fact_daily_sales`; các bảng Northwind được nạp riêng.
5. **Mở warehouse:** dùng SQLite browser hoặc công cụ truy vấn SQLite để xem các bảng đã được tạo.
6. **Mở Swagger:** gọi overview, danh sách bảng, chi tiết bảng và sales summary.
7. **Mở dashboard:** xem KPI tổng quan, chọn một bảng để xem preview, sau đó chuyển qua tab Revenue.

---

## 8. Phạm vi và lưu ý khi thuyết trình

- Đây là pipeline ETL theo lịch chạy thủ công; hiện chưa có scheduler tự động.
- Mỗi lần chạy hiện thay thế các bảng đích (`replace`), chưa phải incremental load.
- Cấu hình có `watermark_column`, nhưng pipeline đa nguồn hiện tại chưa dùng watermark để lấy dữ liệu tăng dần.
- Các bảng Northwind hiện được thu thập và nạp theo schema riêng; chưa có bước join các bảng thành một mô hình dữ liệu tích hợp.
- Bảng `fact_daily_sales` được tổng hợp từ nguồn `sales_raw`, không tự suy ra từ `orders.csv` và `order_details.csv`.
- Biểu đồ/quick analysis trên preview bảng dựa trên số dòng được tải ở trang hiện tại; không đại diện cho phép tổng hợp toàn bộ bảng.
- Đường dẫn warehouse phía BE đang cấu hình qua `appsettings.json` hoặc biến môi trường, không đọc trực tiếp từ file YAML của ETL.

---

## 9. Kết luận

Dự án thể hiện một luồng BI end-to-end ở quy mô mẫu:

> **Nhiều nguồn dữ liệu → ETL → SQLite warehouse → REST API → Dashboard**

Phần quan trọng nhất là tách riêng trách nhiệm: ETL chịu trách nhiệm thu thập và nạp dữ liệu; warehouse lưu trữ dữ liệu tập trung; backend cung cấp giao diện dữ liệu ổn định; frontend biến dữ liệu thành thông tin trực quan để người dùng tra cứu.

---

## 10. Câu hỏi và trả lời thường gặp

### Câu 1: Dự án giải quyết vấn đề gì?

**Trả lời:** Dự án minh họa cách thu thập dữ liệu từ nhiều nguồn file và MySQL, tập trung vào warehouse SQLite, sau đó cung cấp API và dashboard để xem dữ liệu. Thay vì truy cập từng nguồn riêng khi xem báo cáo, người dùng có thể tra cứu các bảng đã được nạp trong cùng một nơi.

### Câu 2: Luồng dữ liệu từ nguồn đến giao diện diễn ra như thế nào?

**Trả lời:** Người vận hành khai báo nguồn và bảng đích trong `etl/pipeline_config.yaml`, sau đó chạy `python etl/etl_pipeline.py`. ETL đọc dữ liệu, gộp các nguồn có cùng bảng đích và ghi vào `warehouse.db`. Backend đọc SQLite qua các API; frontend gọi API và hiển thị overview, preview bảng và biểu đồ doanh thu.

### Câu 3: ETL hiện hỗ trợ những loại nguồn nào?

**Trả lời:** Cấu hình đa nguồn hiện hỗ trợ file CSV, JSON, Excel (`.xlsx`, `.xls`) và các bảng MySQL. File source có thể trỏ đến một file hoặc một folder. Muốn hỗ trợ một loại cơ sở dữ liệu khác cần bổ sung logic extract tương ứng; khai báo `type` khác `mysql` hiện sẽ không được pipeline hỗ trợ.

### Câu 4: Mỗi bảng có schema riêng hay tất cả dữ liệu phải cùng cấu trúc?

**Trả lời:** Mỗi bảng nguồn được nạp theo các cột vốn có của nó, không bị ép dùng chung schema doanh thu. Chỉ nguồn được chọn để tạo `fact_daily_sales` mới cần có các cột được khai báo trong `schema_mapping`, hiện là mã đơn, ngày và số tiền.

### Câu 5: Nếu CSV và MySQL cùng ghi vào một bảng đích thì xử lý ra sao?

**Trả lời:** ETL nối các DataFrame theo tên cột trước khi ghi bảng. Nếu một nguồn thiếu một cột có ở nguồn khác, các dòng của nguồn thiếu cột đó sẽ có giá trị rỗng tại cột tương ứng. Ví dụ `orders.csv` và bảng MySQL `orders` cùng được nạp vào `fact_orders`.

### Câu 6: `fact_daily_sales` được tính như thế nào và dữ liệu đến từ đâu?

**Trả lời:** Bảng hiện được tính từ nguồn `sales_raw`, không tự join hoặc suy ra từ `orders.csv` và `order_details.csv`. Pipeline chuẩn hóa ngày, chuyển số tiền sang kiểu số, rồi nhóm theo ngày để tính tổng doanh thu, số bản ghi có mã đơn và số tiền trung bình. Vì đếm theo bản ghi mã đơn chứ không đếm mã đơn duy nhất, nếu một đơn có nhiều dòng thì chỉ số `total_orders` hiện tại có thể lớn hơn số đơn thực tế.

### Câu 7: Chạy ETL nhiều lần có bị nhân đôi dữ liệu không?

**Trả lời:** Với cấu hình hiện tại, mỗi bảng đích được ghi bằng chế độ `replace`, tức là bảng cũ được thay bằng kết quả lần chạy mới; dữ liệu không được cộng dồn qua các lần chạy. Pipeline hiện chưa triển khai incremental load, dù YAML có trường `watermark_column`.

### Câu 8: Warehouse lưu ở đâu và backend kết nối đến đó thế nào?

**Trả lời:** ETL mặc định ghi file `warehouse.db` ở thư mục gốc project. Backend lấy đường dẫn theo `Warehouse:DbPath` trong `backend/appsettings.json`, hoặc biến môi trường `WAREHOUSE_DB_PATH`. Hiện backend chưa đọc cấu hình đích trực tiếp từ file YAML của ETL.

### Câu 9: Người dùng xem được gì trên dashboard?

**Trả lời:** Tab Overview hiển thị tổng số bảng, tổng số dòng, thời điểm cập nhật, biểu đồ số dòng theo bảng và danh sách bảng. Chọn một bảng sẽ xem tên cột, preview có phân trang và phân tích nhanh trên phần dữ liệu preview đã tải. Tab Revenue hiển thị KPI doanh thu và biểu đồ doanh thu theo ngày từ `fact_daily_sales`.

### Câu 10: Nếu cần thêm một bảng hoặc nguồn dữ liệu mới thì cần làm gì?

**Trả lời:** Với file, thêm một mục `file_sources` gồm `name`, `path` và `target_table`. Với MySQL, thêm mục `db_sources` có cấu hình kết nối, `table` nguồn và `target_table`. Đảm bảo đường dẫn/tên bảng và thông tin kết nối chính xác, rồi chạy lại ETL. Nếu muốn nguồn mới cũng góp vào báo cáo doanh thu, dữ liệu cần có các cột phù hợp với `schema_mapping` và cần được nối vào luồng tạo `fact_daily_sales`.

---

## 11. Những điều khán giả có thể muốn biết thêm

Phần này giúp trả lời các câu hỏi sâu hơn về giá trị, phạm vi và khả năng phát triển của project. Khi thuyết trình, nên phân biệt rõ chức năng đang có với hướng phát triển đề xuất.

### 11.1 Project chứng minh điều gì ngoài việc hiển thị biểu đồ?

Project minh họa một luồng dữ liệu end-to-end có thể theo dõi: cấu hình nguồn, extract dữ liệu, nạp vào warehouse, cung cấp API và trực quan hóa trên frontend. Dashboard không chỉ là biểu đồ doanh thu; người dùng còn có thể khám phá các bảng warehouse và xem preview của từng bảng.

### 11.2 Vì sao dùng SQLite? Có dùng cho dữ liệu production lớn không?

SQLite phù hợp với bản demo vì gọn, không cần chạy một database server riêng và warehouse được lưu trong một file dễ tạo để trình diễn. Đây là lựa chọn đơn giản cho project mẫu; nếu dữ liệu tăng lớn, nhiều người cần truy cập đồng thời hoặc cần phân quyền và vận hành tập trung, có thể chuyển warehouse sang PostgreSQL, SQL Server hoặc một nền tảng phân tích dữ liệu phù hợp hơn.

### 11.3 Dữ liệu mẫu có đại diện cho hoạt động bán hàng thực tế không?

Trong project có các CSV mẫu kiểu Northwind và `sales_raw.csv`. `sales_raw.csv` có cấu trúc phù hợp với phép tổng hợp doanh thu hiện tại. Các CSV Northwind được nạp thành những bảng riêng để minh họa ingestion đa bảng; chúng không được tự động nối thành một bộ số liệu doanh thu nhất quán. Vì vậy, số doanh thu trên dashboard là kết quả của dữ liệu demo `sales_raw`, không nên diễn giải như số liệu kinh doanh thực tế.

### 11.4 ETL có đảm bảo dữ liệu đúng và có thể truy nguyên không?

Pipeline hiện kiểm tra các cột cần thiết khi tạo sales summary và báo lỗi nếu thiếu cột mapping; lỗi đọc một số nguồn MySQL được ghi cảnh báo. Tuy nhiên, đây chưa phải một hệ thống data quality/audit đầy đủ: chưa có bảng lưu lịch sử từng lần chạy, lineage chi tiết, báo cáo lỗi theo từng dòng hay bộ quy tắc nghiệp vụ toàn diện. Trong production cần bổ sung các cơ chế này.

### 11.5 Cấu hình kết nối database có an toàn để đưa lên môi trường thật không?

Không nên lưu mật khẩu thật trong YAML được commit vào source control. Bản demo hiện có thông tin kết nối trong file cấu hình, nên khi triển khai thực tế cần chuyển credential sang biến môi trường hoặc secret manager, giới hạn quyền tài khoản database và thay thông tin đã bị lộ nếu đó là credential đang hoạt động.

### 11.6 Thêm nguồn dữ liệu mới có cần sửa backend và frontend không?

Với một bảng mới có schema bất kỳ, thông thường chỉ cần cấu hình nguồn và bảng đích rồi chạy ETL; backend liệt kê bảng từ warehouse và frontend dùng metadata/preview động để hiển thị. Nếu muốn tạo KPI hoặc biểu đồ nghiệp vụ riêng cho bảng mới, cần bổ sung logic tổng hợp ở backend hoặc frontend phù hợp với ý nghĩa của dữ liệu đó.

### 11.7 Các biểu đồ phân tích nhanh phản ánh toàn bộ dữ liệu không?

Không. Biểu đồ quick analysis theo ngày hoặc nhóm danh mục được tính từ các dòng preview đã tải trên trang hiện tại (mặc định tối đa 20 dòng), còn biểu đồ row count dùng số lượng do backend truy vấn cho từng bảng. Vì thế quick analysis hữu ích để khám phá sơ bộ cấu trúc dữ liệu, không thay thế báo cáo tổng hợp chính xác trên toàn bộ bảng.

### 11.8 Nếu chạy ETL nhiều lần hoặc chạy khi MySQL tạm ngắt thì chuyện gì xảy ra?

ETL hiện thay thế từng bảng đích bằng dữ liệu của lần chạy đó (`replace`), không cộng dồn bản ghi qua các lần chạy. Khi một nguồn MySQL lỗi, pipeline đa nguồn ghi cảnh báo và tiếp tục với các nguồn khác, nên kết quả lần chạy có thể thiếu dữ liệu từ MySQL. Trước khi sử dụng số liệu, cần kiểm tra log đầu ra và trạng thái các nguồn; cơ chế retry, đánh dấu lần chạy thành công/thất bại và atomic load là các hướng nên bổ sung.

### 11.9 Dự án có thể mở rộng lên lịch chạy tự động và dữ liệu tăng dần không?

Có thể phát triển theo hướng đó, nhưng hiện chưa được triển khai. Các bước phù hợp gồm dùng watermark thật sự để extract phần dữ liệu mới, lưu trạng thái watermark, ghi nhận kết quả từng lần chạy, và lập lịch bằng Windows Task Scheduler, cron hoặc workflow orchestration như Airflow. Trước khi bật tự động, cần xác định rõ xử lý cập nhật/xóa bản ghi và cách khôi phục khi một lần chạy thất bại.

### 11.10 Nếu phát triển tiếp, nên ưu tiên những gì?

Một lộ trình hợp lý là: (1) đưa credential ra khỏi cấu hình được commit; (2) làm rõ mô hình dữ liệu và cách tính chỉ số bán hàng, đặc biệt là đếm đơn duy nhất; (3) thêm data quality checks và lịch sử chạy ETL; (4) triển khai incremental load; (5) chuyển sang warehouse server khi nhu cầu truy cập/tải tăng; và (6) bổ sung phân quyền, logging/monitoring cùng triển khai tự động. Đây là đề xuất roadmap, không phải các chức năng đã có sẵn.

---

## 12. Technical deep-dive — ghi chú cho người thuyết trình

Phần này dành cho khi người xem muốn đi từ kiến trúc xuống cách triển khai. Không nhất thiết trình bày hết; có thể dùng như speaker notes và chọn nội dung theo câu hỏi.

### 12.1 Walkthrough code trong khoảng 3 phút

1. **Cấu hình:** mở `etl/pipeline_config.yaml`, giải thích mỗi source khai báo `name`, `path` hoặc thông tin bảng DB và `target_table`. Chỉ ra rằng file có thể đi thẳng vào bảng riêng, còn nhiều nguồn có thể cùng đích.
2. **Điểm vào pipeline:** trong `etl/etl_pipeline.py`, hàm `load_config()` đọc YAML; block `if __name__ == "__main__"` chọn luồng đa nguồn khi cấu hình có `file_sources` hoặc `db_sources`.
3. **Extract:** `extract_from_file_source()` phân biệt file và folder; `read_single_file()` chọn reader theo extension. `extract_from_db_source()` tạo kết nối SQLAlchemy và đọc bảng MySQL.
4. **Merge/load:** `run_multi_source_pipeline()` gom DataFrame theo `target_table`, nối bằng `pd.concat(..., sort=False)`, rồi `load_table()` ghi SQLite với `if_exists="replace"`.
5. **Transform doanh thu:** các source có `name: sales_raw` được gom riêng. `transform()` chuẩn hóa ngày và amount, group theo ngày rồi tạo `fact_daily_sales`.
6. **Backend:** `DashboardController` khai báo route; `DashboardService` kiểm tra warehouse và điều phối; `WarehouseRepository` truy vấn `sqlite_master`, metadata bảng, row count, preview và sales summary.
7. **Frontend:** `dashboardApi.js` gom các request Axios và ánh xạ response; `App.jsx` dùng dữ liệu đó để render Overview và Revenue.

### 12.2 Giải thích các quyết định kỹ thuật

- **Vì sao cấu hình nguồn bằng YAML?** Thêm file hoặc bảng DB thường chỉ cần khai báo source và target thay vì viết thêm một pipeline riêng cho từng bảng.
- **Vì sao giữ schema riêng?** Customer, product, order và order detail mang ý nghĩa/cột khác nhau. Chỉ dữ liệu đi vào một phép biến đổi cụ thể như sales aggregation mới cần thỏa schema mapping của phép biến đổi đó.
- **Vì sao merge theo tên cột?** `pd.concat` căn các cột theo nhãn; các cột không có ở một nguồn được điền giá trị thiếu. Đây là union theo schema, không phải join theo khóa nghiệp vụ.
- **Vì sao có cả raw/source table lẫn bảng aggregate?** Bảng nguồn giữ dữ liệu dạng chi tiết để tra cứu; `fact_daily_sales` phục vụ trực tiếp biểu đồ doanh thu theo ngày.
- **Vì sao dùng API thay vì cho browser đọc SQLite?** Trình duyệt không nên truy cập trực tiếp file database. Backend giữ trách nhiệm truy cập warehouse và trả response có cấu trúc qua HTTP.
- **Phân trang ở đâu?** API table list trả `page`, `pageSize`, `totalItems`, `totalPages`, `items`; API detail trả metadata và preview của trang được yêu cầu. FE tải thêm các trang của danh sách bảng và gọi API khi người dùng đổi trang preview.

### 12.3 Câu hỏi technical có thể được hỏi

#### Câu 1: `pd.concat` có thực hiện join giữa orders và order details không?

**Trả lời:** Không. Đây là phép nối các dòng theo cột tương ứng, không ghép bản ghi theo khóa như `order_id`. Nếu muốn kết hợp header và line item thành một fact table thì cần viết phép join riêng, xác định cardinality và quy tắc tính tiền trước.

#### Câu 2: Folder extraction có xử lý dữ liệu streaming hoặc file rất lớn không?

**Trả lời:** Chưa. Folder được chia file thành batch để đọc và gom, nhưng dữ liệu của source cuối cùng vẫn được nối thành DataFrame trong bộ nhớ. Đây là cách đơn giản cho dữ liệu mẫu; với file lớn cần chunked read, xử lý tuần tự, staging hoặc một engine phân tán.

#### Câu 3: Nếu một file lỗi thì ETL bỏ qua riêng file đó hay dừng?

**Trả lời:** Trong luồng multi-source, lỗi đọc file được báo lên và có thể làm lần chạy dừng; không có cơ chế quarantine/skip file lỗi ở luồng này. Với MySQL, lỗi SQLAlchemy khi đọc source được in cảnh báo và source đó trả DataFrame rỗng để các source còn lại tiếp tục. Do đó cần xem output của lần chạy trước khi coi warehouse là đầy đủ.

#### Câu 4: ETL có transaction bao trùm toàn bộ warehouse không?

**Trả lời:** Không. Mỗi bảng được ghi bằng một kết nối SQLite riêng và chế độ `replace`; không có transaction chung bao tất cả các bảng. Nếu lỗi giữa chừng, warehouse có thể chứa một phần bảng đã được cập nhật và một phần chưa chạy. Với hệ thống cần tính nhất quán giữa nhiều bảng, nên thêm staging và cơ chế publish/rollback có kiểm soát.

#### Câu 5: `total_orders` thực sự đếm gì? Average order value được tính ra sao?

**Trả lời:** ETL đang đếm số bản ghi có mã đơn theo từng ngày, không dùng `nunique()` để đếm mã đơn duy nhất. Ở backend, KPI tổng đơn là tổng các giá trị `total_orders` theo ngày. KPI average order value hiện là trung bình cộng các `avg_order_value` theo ngày, không phải trung bình gia quyền theo số đơn trên toàn kỳ. Đây là định nghĩa triển khai hiện tại và cần được thống nhất với nghiệp vụ trước khi dùng như KPI chính thức.

#### Câu 6: “Last refreshed” chính xác là thời điểm chạy ETL hay thời điểm bảng được cập nhật?

**Trả lời:** Backend lấy thời gian sửa đổi cuối cùng của file SQLite bằng file modification time. Đây là mốc gần đúng cho lần file được ghi, không phải lịch sử riêng cho từng bảng và cũng không lưu trạng thái bắt đầu/kết thúc của một ETL run.

#### Câu 7: Backend bảo vệ câu truy vấn preview như thế nào khi tên bảng đến từ URL?

**Trả lời:** Service kiểm tra tên bảng có nằm trong danh sách bảng thực tế của warehouse trước khi truy vấn. Repository đặt identifier trong dấu nháy kép và escape ký tự nháy kép; các giá trị `LIMIT`/`OFFSET` được truyền bằng parameter. Tên bảng là identifier nên không thể truyền như một SQL value parameter thông thường.

#### Câu 8: Có xác thực người dùng hoặc giới hạn CORS không?

**Trả lời:** Cấu hình hiện tại chưa có authentication/authorization; CORS dùng policy cho phép mọi origin, method và header. Đây là cấu hình thuận tiện cho demo local, không nên mặc định mang nguyên trạng lên môi trường public. Khi deploy cần chốt origin được phép, thêm cơ chế xác thực và giới hạn quyền truy cập.

#### Câu 9: FE phân biệt camelCase và tên cột có dấu gạch dưới của BE thế nào?

**Trả lời:** `dashboardApi.js` chuẩn hóa tên key bằng cách bỏ dấu gạch dưới, khoảng trắng và dấu gạch nối, rồi so sánh không phân biệt kiểu viết. Adapter chuyển response overview/table/summary thành cấu trúc FE đang dùng. Với chart row, các cột doanh thu được chuyển về key mà Recharts khai báo trong `App.jsx`.

#### Câu 10: Các chỉ số phân loại/ngày trên preview có phải kết quả query toàn bảng từ server không?

**Trả lời:** Không. Backend chỉ trả một trang preview; FE tính quick analysis trên trang preview hiện đang tải. Ngược lại, row count của từng bảng được backend thực hiện bằng `COUNT(*)` trên toàn bảng. Hai loại số liệu này có phạm vi khác nhau và giao diện có ghi rõ quick analysis dựa trên preview page.

### 12.4 Những điểm nên nói rõ để tránh hiểu nhầm

- `file_sources` và `db_sources` là ingestion cấu hình được; không đồng nghĩa project đã có scheduler hay tự động theo dõi file thay đổi.
- Trường `watermark_column` có trong YAML nhưng chưa được dùng trong luồng multi-source để lọc dữ liệu incremental.
- Ghi `replace` có nghĩa là thay bảng đích; không phải upsert, merge theo primary key hay lưu lịch sử.
- `fact_orders` có thể chứa các dòng đến từ CSV và MySQL cùng schema được nối cột, nhưng không tự loại trùng.
- `$` trên giao diện là ký hiệu trình bày hiện tại; dữ liệu chưa có metadata currency hay quy tắc quy đổi tiền tệ.
- `lastRefreshed` là timestamp của file SQLite; không thể suy ra chính xác bảng nào được cập nhật thành công trong một lần ETL.
- Cấu hình demo có trường credential. Khi trình chiếu, không mở hoặc chia sẻ giá trị bí mật; với triển khai thật cần đưa credential vào secret/environment management.
