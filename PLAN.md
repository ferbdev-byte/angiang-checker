# Kế hoạch Triển khai: Ứng dụng Quản lý Trạng thái Gửi Email An Giang

Mục tiêu: Xây dựng công cụ Web GIS tĩnh chạy trên trình duyệt client, hỗ trợ theo dõi quản lý gửi email ở cấp đơn vị xã/phường tỉnh An Giang (105 đơn vị). Hệ thống phải cho phép cập nhật trạng thái ngay lập tức trên bản đồ và lưu vết bằng `localStorage`.

## User Review Required

> [!IMPORTANT]
> - Do tệp `angiang.geojson` (105 đơn vị) hiện chưa có sẵn trên hệ thống, tôi sẽ tạo một **file GeoJSON mẫu (mock data)** chứa 3-5 đơn vị (polygon / hcn) đại diện nằm trong phạm vi tọa độ tỉnh An Giang để dựng logic và test chức năng. Bạn có thể chép đè dữ liệu thật sau này.
> - Về mặt giao diện, tôi sẽ dùng phong cách ưu tiên trải nghiệm người dùng (**Modern UI/UX**): Bản đồ tràn toàn màn hình (full-screen) cùng một bảng điều khiển nổi (Floating Panel) hiển thị Legend / Thống kê số lượng theo thời gian thực + Glassmorphism style. Xin phép ý kiến đóng góp của bạn?

## Proposed Changes

Giải pháp sẽ áp dụng nền tảng Vanila JS/HTML/CSS với thư viện bản đồ siêu nhẹ [Leaflet.js]. Do đây là một ứng dụng Web GIS dạng "Status Dashboard", sẽ ưu tiên render nhanh chóng và sử dụng DOM Event logic thuần.

### Cấu trúc dự án

#### [NEW] `index.html`
- Chứa Layout chính của ứng dụng.
- Load thư viện Leaflet (CSS & JS qua CND).
- Mount point `<div id="map"></div>` cho bản đồ.
- Mount point `<div id="dashboard"></div>` cho bảng thống kê.

#### [NEW] `style.css`
- Định dạng full-screen layout.
- Styling màu sắc của dashboard, legend nổi và popup hiển thị khi bấm vào từng quận/huyện/xã.
- Thêm hiệu ứng transition nhấp nháy / chuyển màu mềm mại cho polygon bản đồ.

#### [NEW] `app.js`
- Khởi tạo Leaflet Map căn giữa tọa độ An Giang (khoảng [10.50, 105.10]), mức zoom ~10.
- `fetch()` file dữ liệu `angiang.geojson`.
- Parse logic trạng thái từng xã từ `localStorage` để quyết định thuộc tính `fillColor` (Màu Light Gray cho chưa gửi, màu Green Style cho đã gửi).
- Xây dựng event `onEachFeature` để gắn Popup:
  - Hiển thị tên xã.
  - Phím chức năng: "Đánh dấu đã gửi email" / "Hoàn tác".
- Hàm update trạng thái vào `localStorage` -> Gọi hàm refresh mảng màu + tính toán lại / cập nhật các số liệu trên `dashboard`.

#### [NEW] `data/angiang.geojson`
- File JSON chứa object `FeatureCollection` mẫu định dạng chuẩn EPSG:4326.
- Tạo một số Feature hình đa giác quanh Long Xuyên / Châu Đốc làm mẫu test hiển thị. 
- Schema properties yêu cầu có `id` (duy nhất) và `name` (tên xã).

## Open Questions

> [!NOTE]
> Bạn có muốn mặc định base map là nền sáng (như OpenStreetMap carto tiêu chuẩn) hay nền tối (Dark mode map) để các mảng màu xã/phường/huyện hiển thị nổi bật hơn? Theo tôi, nền tối CartoDB Dark Matter hoặc sáng nhạt Positron sẽ rất sang trọng và UI sẽ trông cao cấp hơn so với OSM gốc.

## Verification Plan

### Manual Verification
1. Sau khi code, khởi chạy bằng tiện ích Live Server (để bypass strict CORS API fetch `file://`) -> tôi sẽ tạo thêm một simple local webserver script ngắn (`serve.js` hoặc dùng `npx htp-server`) hoặc hướng dẫn chi tiết cho bạn.
2. Kiểm tra log web console để đảm bảo không có lỗi parse GeoJSON.
3. Click test vào các block bản đồ -> Bấm lưu -> Kiểm tra đổi màu và thống kê đổi trạng thái.
4. Refresh trang F5 để xác nhận trạng thái vẫn còn hiệu lực.
