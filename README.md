# BookStore — Website quản lý cửa hàng sách

Dự án mẫu Node.js + Express + SQLite, tách riêng thư mục `frontend` và `backend`.

## 1. Cấu trúc thư mục

```text
bookstore-management/
├── frontend/                         # Giao diện người dùng
│   ├── index.html                    # Khung trang và các khu vực giao diện
│   ├── css/
│   │   └── styles.css                # Bố cục, màu sắc, responsive
│   ├── js/
│   │   └── app.js                    # Điều hướng, gọi API, xử lý giao diện
│   └── assets/                       # Có thể đặt ảnh/logo/font tại đây
├── backend/                          # Máy chủ và xử lý nghiệp vụ
│   ├── server.js                     # Express, API, nghiệp vụ và khởi tạo DB
│   ├── config/                       # Có thể tách cấu hình môi trường tại đây
│   ├── routes/                       # Có thể tách định tuyến API theo chức năng
│   ├── controllers/                  # Có thể tách xử lý yêu cầu HTTP
│   ├── services/                     # Có thể tách nghiệp vụ bán hàng/kho
│   ├── models/                       # Có thể tách truy vấn dữ liệu
│   └── data/                         # SQLite tự tạo khi chạy; không đưa lên Git
├── package.json                      # Thư viện và lệnh chạy dự án
├── package-lock.json                 # Tạo ra sau khi chạy npm install
├── .env.example                      # Mẫu biến môi trường (nếu cần)
├── .gitignore                        # Bỏ qua node_modules và dữ liệu cục bộ
└── README.md                         # Hướng dẫn sử dụng
```

**Lưu ý:** Các thư mục `config`, `routes`, `controllers`, `services`, `models`, `assets` được tạo sẵn để dễ mở rộng; logic backend hiện tại vẫn nằm trong `backend/server.js` nhằm giữ bản demo đơn giản và dễ chạy.

## 2. Chức năng hiện có

- Tổng quan: số đầu sách, khách hàng, doanh thu trong ngày, cảnh báo tồn kho và hóa đơn gần đây.
- Quản lý sách, tác giả/thể loại trong hồ sơ sách.
- Quản lý khách hàng, điểm tích lũy và hạng thành viên.
- Quản lý nhà cung cấp.
- Nhập hàng và cập nhật tồn kho.
- Lập hóa đơn bán hàng, nhiều đầu sách, giảm giá và phương thức thanh toán demo.
- Ghi nhận đổi/trả hàng.
- Báo cáo doanh thu, sách bán chạy và tồn kho.

## 3. Yêu cầu

- Node.js 18 trở lên (khuyến nghị bản LTS).
- npm đi kèm Node.js.

## 4. Chạy trên Windows / VS Code

1. Giải nén ZIP.
2. Trong VS Code, mở thư mục gốc `bookstore-management` (thư mục chứa `package.json`).
3. Mở Terminal tại thư mục gốc và cài thư viện:

   ```bash
   npm install
   ```

4. Chạy máy chủ:

   ```bash
   npm start
   ```

5. Truy cập `http://localhost:3000`.

Backend sẽ phục vụ giao diện từ thư mục `frontend`. Cơ sở dữ liệu `backend/data/bookstore.db` và dữ liệu mẫu được tạo tự động khi chạy lần đầu. Không mở `index.html` trực tiếp bằng cách nhấp đúp; hãy truy cập qua địa chỉ localhost ở trên.

## 5. API chính

| Phương thức | Đường dẫn | Chức năng |
|---|---|---|
| GET | `/api/health` | Kiểm tra máy chủ |
| GET, POST | `/api/books` | Danh sách / thêm sách |
| PUT, DELETE | `/api/books/:id` | Sửa / xóa hoặc ngừng kinh doanh sách |
| GET, POST | `/api/customers` | Danh sách / thêm khách hàng |
| PUT, DELETE | `/api/customers/:id` | Sửa / xóa khách hàng |
| GET, POST | `/api/suppliers` | Danh sách / thêm nhà cung cấp |
| PUT, DELETE | `/api/suppliers/:id` | Sửa / xóa hoặc ngừng hoạt động nhà cung cấp |
| GET, POST | `/api/invoices` | Danh sách / tạo hóa đơn |
| GET | `/api/invoices/:id` | Chi tiết hóa đơn |
| GET, POST | `/api/purchases` | Danh sách / tạo phiếu nhập |
| POST | `/api/returns` | Ghi nhận đổi/trả hàng |
| GET | `/api/reports/summary` | Báo cáo doanh thu, sách bán chạy, tồn kho |
| GET | `/api/dashboard` | Dữ liệu tổng quan |

## 6. Lưu ý

Đây là bản học tập/demo, chưa có đăng nhập và phân quyền, chưa kết nối cổng thanh toán thật và cần gia cố bảo mật trước khi triển khai công khai. Nếu muốn làm mới dữ liệu demo, hãy dừng máy chủ, xóa `backend/data/bookstore.db`, rồi chạy lại `npm start`.
