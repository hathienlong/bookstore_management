# Bản vá đồng bộ Hóa đơn và Báo cáo & thống kê

## File cần chép đè
- `backend/server.js`
- `frontend/js/app.js`

Không cần thay `backend/data/bookstore.db` và không cần chạy `npm install` lại vì không thêm thư viện mới.

## Cách áp dụng
1. Sao lưu 2 file hiện tại.
2. Giải nén gói bản vá.
3. Chép đè đúng đường dẫn `backend/server.js` và `frontend/js/app.js` trong dự án.
4. Dừng server đang chạy bằng `Ctrl + C`, sau đó chạy lại `npm run dev` (hoặc `npm start`).

## Nội dung sửa
- Số hóa đơn, doanh thu và giảm giá chỉ tính hóa đơn có trạng thái `Đã thanh toán`.
- Bảng Sách bán chạy chỉ tổng hợp chi tiết thuộc hóa đơn `Đã thanh toán`.
- Bảng Sách bán chạy có mã sách, tên sách, số lượng đã bán và tổng doanh thu.
- Thêm phần đối chiếu số hóa đơn theo 3 trạng thái trong khoảng ngày đang chọn.
- Sửa cách tạo giá trị ngày mặc định theo giờ địa phương, tránh lệch ngày do `toISOString()`.

## Lưu ý về ngày
Báo cáo vẫn lọc theo khoảng ngày người dùng chọn. Nếu trong khoảng ngày đó không có hóa đơn đã thanh toán, doanh thu, số hóa đơn đã thanh toán và sách bán chạy sẽ bằng 0/không có dữ liệu — đây là kết quả đúng, không phải lỗi.
