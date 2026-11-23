# An Giang Email Status

Bản đồ web (Web GIS) theo dõi việc gửi email tới **105 xã, phường, đặc khu của tỉnh An Giang** sau sắp xếp đơn vị hành chính. Mỗi đơn vị là một vùng trên bản đồ, đổi màu theo trạng thái. Nhiều người cùng cập nhật, ai sửa gì thì người khác thấy ngay.

## Tính năng

- **Bản đồ toàn màn hình** (Leaflet) với ranh giới từng xã/phường, tô màu theo trạng thái: chưa gửi, đã gửi, đã ký hợp đồng.
- **Thống kê trực tiếp**: tổng số, đã gửi, chưa gửi, đã ký, kèm tỉ lệ phần trăm.
- **Tìm kiếm và thao tác hàng loạt**: lọc theo tên, chọn nhiều đơn vị để cập nhật cùng lúc.
- **Ghi chú, số điện thoại** cho từng đơn vị.
- **Cảnh báo dữ liệu**: liệt kê đơn vị thiếu ranh giới hoặc thiếu email.
- **Xuất dữ liệu** để báo cáo.
- **Đăng nhập và đồng bộ thời gian thực** bằng Supabase (Auth + Realtime). Bảng dữ liệu bật Row Level Security: chỉ người đã đăng nhập mới đọc và ghi được.

## Công nghệ

HTML, CSS, JavaScript thuần · Leaflet · Supabase (Postgres, Auth, Realtime) · Vercel (serverless function cấp cấu hình)

## Chạy thử

```bash
npm install
npm run dev            # http://localhost:3000
```

Biến môi trường (đặt trên Vercel hoặc máy chạy):

| Biến | Ý nghĩa |
|---|---|
| `SUPABASE_URL` | URL dự án Supabase |
| `SUPABASE_ANON_KEY` | Khoá public (anon) của Supabase |

Khoá không nằm trong mã nguồn: `api/config.js` đọc từ biến môi trường rồi trả về cho trình duyệt. Tạo bảng bằng [supabase_schema.sql](supabase_schema.sql).

## Dữ liệu

- Ranh giới hành chính: các file GeoJSON trong `data/` và `public/data/`, kèm script trích xuất trong `scripts/`.
- Danh sách đơn vị và email công vụ (`@angiang.gov.vn`): file Excel ở thư mục gốc.

