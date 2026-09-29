# Danh mục chức năng VGIS

Tài liệu này là danh mục các chức năng có trong mã nguồn hiện tại của dự án.

## 1. Bản đồ và dữ liệu không gian

| Chức năng | Trạng thái | Ghi chú |
| --- | --- | --- |
| Hiển thị bản đồ web MapLibre | Có | Trang chính: `/map`. |
| Đọc catalog Tile Server | Có | Catalog được tải động qua Controller. |
| Chọn basemap (raster) | Có | Dataset mặc định hiện là `asia_full`. |
| Bật/tắt nhiều overlay | Có | Hỗ trợ raster overlay và vector overlay. |
| Preview, tải lại và báo lỗi catalog tile | Có | Có ở panel Basemap/Layers. |
| Đổi ngôn ngữ nhãn vector | Có, phụ thuộc thuộc tính tile | Ưu tiên `name`, `name:latin`, `name_int` theo style hiện hành. |
| Đặt marker và xem tọa độ | Có | Click bản đồ hoặc dùng vị trí hiện tại của trình duyệt. |

## 2. Tìm kiếm địa điểm

- Gợi ý khi gõ bằng Elasticsearch.
- Tìm kiếm địa danh/địa chỉ chính xác và geometry đầy đủ bằng Nominatim.
- Hỗ trợ truy vấn không dấu và alias phổ biến khi Elasticsearch đã được index phù hợp.
- Hiển thị tên, địa chỉ, tọa độ, bounding box và geometry của kết quả.
- Hỗ trợ Point, LineString, Polygon, MultiPolygon và các geometry Nominatim trả về.
- Zoom/focus tới kết quả; dùng kết quả làm điểm A hoặc B của định tuyến.
- Tính quota cho request tìm kiếm.

## 3. Định tuyến và độ cao tuyến

| Chức năng | Trạng thái | Ghi chú |
| --- | --- | --- |
| Chọn điểm đầu/cuối A-B | Có | Chọn trên bản đồ hoặc từ kết quả tìm kiếm. |
| Định tuyến Valhalla | Có, phụ thuộc worker | Request đi qua Controller. |
| Chế độ di chuyển | Có | Ô tô, xe máy, xe đạp, đi bộ, xe buýt, xe tải và taxi. |
| Hiện tuyến, tổng quãng đường và ETA | Có | Có chỉ dẫn theo từng chặng. |
| Vẽ route trên bản đồ | Có | Có marker/line route riêng. |
| Elevation profile | Có, phụ thuộc dữ liệu elevation | Hiện cao/thấp nhất, tổng leo và tổng xuống. |
| API elevation qua Controller | Có | `POST /api/gateway/elevation`. |

## 4. Vẽ, biên tập và đo đạc GeoJSON

- Vẽ `Point`, `MultiPoint`, `LineString` và `Polygon`.
- Chọn đối tượng, kéo đỉnh để biên tập, ẩn/hiện và xoá feature.
- Đổi tên và thuộc tính feature.
- Tính/cập nhật độ dài và diện tích vào properties phù hợp.
- Undo/redo bằng nút hoặc phím tắt; xoá toàn bộ bản vẽ.
- Đo khoảng cách hoặc diện tích trong lúc vẽ.
- Import GeoJSON, biên tập trực tiếp và export `FeatureCollection` GeoJSON.
- Import được `Point`, `MultiPoint`, `LineString`, `MultiLineString`, `Polygon`, `MultiPolygon` và `GeometryCollection` cùng properties hợp lệ.

## 5. Hệ tọa độ (CRS)

- Chuyển đổi tọa độ và GeoJSON phía client bằng `proj4`.
- Nhận biết trường `crs` lúc import và ghi CRS vào dữ liệu export.
- Các CRS: `EPSG:4326`, `EPSG:3857`, `EPSG:32648`, `EPSG:32649`, `EPSG:4756`, `EPSG:3405`, `EPSG:3406`, `EPSG:9209`.

## 6. Chia sẻ bản đồ/GeoJSON

- Tạo snapshot chỉ xem gồm GeoJSON, basemap và các overlay đang bật.
- Public link xem snapshot tại `/share/{token}`.
- Chia sẻ trực tiếp cho người dùng trong hệ thống và trang “Được chia sẻ với tôi”.
- Nhận thông báo chia sẻ theo thời gian thực qua Server-Sent Events.
- Snapshot tự hết hạn sau 30 ngày; một tài khoản tối đa 50 snapshot còn hiệu lực.
- Trang xem chung khôi phục lớp còn tồn tại, cảnh báo lớp không khả dụng, tự fit geometry và cho tải GeoJSON.
- Chủ sở hữu xem thumbnail SVG, số feature, ngày tạo, copy lại link hoặc thu hồi snapshot.
- Snapshot là bất biến; không truy cập được sau khi hết hạn, bị thu hồi hoặc chủ sở hữu bị xoá.

## 7. Tài khoản, bảo mật và hồ sơ

- Đăng ký với họ tên, email, mật khẩu, ngày sinh, điện thoại và đơn vị.
- Đăng nhập, refresh access token và đăng xuất phiên hiện tại.
- Đăng xuất toàn bộ phiên; đổi mật khẩu thu hồi các phiên cũ.
- Hồ sơ người dùng: xem/sửa email, điện thoại, avatar JPEG/PNG.
- Bắt buộc đổi mật khẩu khi quản trị viên đặt mật khẩu tạm.
- JWT Ed25519, Argon2id, rotating refresh token, CSRF và kiểm soát phiên ở backend.
- Token truy cập/refresh không lưu trong `localStorage`.
- Khi role hoặc trạng thái tài khoản đổi, trình duyệt được yêu cầu xác thực lại.

## 8. Quota, thông báo và khả năng tiếp cận

- Theo dõi quota tháng và request tìm kiếm/định tuyến theo ngày.
- Báo cáo ngày hiện tại, 7 ngày hoặc 30 ngày; biểu đồ tổng request và theo API.
- Billing chỉ là báo cáo quota, không có thanh toán, giao dịch hay hoá đơn thực.
- Notification in-app cho đăng nhập đầu tiên, hết quota và bản đồ được chia sẻ.
- Giao diện tiếng Việt và tiếng Anh.
- Theme theo hệ thống, sáng/tối; tương phản cao, chữ lớn, giảm chuyển động và skip link cho bàn phím.
- Lưu lựa chọn ngôn ngữ/giao diện tại trình duyệt.

## 9. Quản trị viên

| Khu vực | Chức năng |
| --- | --- |
| `/admin` | Tổng số tài khoản, người dùng online, phân bố độ tuổi và đơn vị. |
| `/admin/billing` | Danh sách quota của mọi người dùng và báo cáo chi tiết 1/7/30 ngày. |
| `/admin/users` | Tìm kiếm, lọc role/trạng thái, phân trang, tạo/sửa/xoá tài khoản, đặt plan và hạn mức. |
| `/admin/audit` | Nhật ký thao tác tạo/sửa/xoá tài khoản và reset mật khẩu. |

- Quản trị viên có thể đặt/reset mật khẩu tạm; thao tác này thu hồi các phiên cũ của người dùng.
- Role: `user`, `admin`. Trạng thái: `ACTIVE`, `DISABLED`, `LOCKED`.

## 10. API công khai trong Controller

| Nhóm | Endpoint chính |
| --- | --- |
| Health | `GET /health` |
| Authentication | `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`, `/auth/me` |
| Map/search | `GET /api/suggestions`, `GET /api/nominatim/search`, `POST /api/gateway/route`, `POST /api/gateway/elevation` |
| Tiles | `GET /api/tile-catalog`, `GET /api/tiles/{path}` |
| Sharing | `POST/GET /api/shares`, `GET/DELETE /api/shares/{identifier}` |
| Billing | `GET /api/billing?range=1|7|30` |
| Administration | `/api/admin/dashboard`, `/api/admin/billing`, `/api/admin/users`, `/api/admin/audit` |
| API reference | `GET /api/openapi.json`, giao diện `/swagger` |