# VGIS — Nền tảng WebGIS full-stack

VGIS là ứng dụng bản đồ web phục vụ hiển thị dữ liệu không gian, tìm kiếm địa điểm, định tuyến, đo đạc, biên tập GeoJSON và chia sẻ bản đồ. Dự án gồm frontend React/MapLibre, backend Go đóng vai trò API gateway, cơ sở dữ liệu PostgreSQL/PostGIS và các dịch vụ địa lý Nominatim, Valhalla, Tile Server, Elasticsearch.

Ứng dụng có thể chạy trong môi trường phát triển local hoặc triển khai bằng Docker/Kubernetes. Trong mô hình production, trình duyệt chỉ giao tiếp với frontend và Go Controller; các dịch vụ địa lý và cơ sở dữ liệu được giữ trong mạng nội bộ.

## Tính năng

### Bản đồ và lớp dữ liệu

- Hiển thị bản đồ bằng MapLibre GL JS.
- Đọc catalog động từ Tile Server, hỗ trợ tile raster và vector.
- Chọn một dataset làm bản đồ nền và bật đồng thời nhiều overlay.
- Hiển thị ảnh xem trước, trạng thái tải và thao tác tải lại catalog.
- Đặt marker tại tâm bản đồ và xem tọa độ con trỏ theo CRS đang chọn.
- Giữ các lớp tìm kiếm, tuyến đường, đo đạc và hình vẽ khi đổi style bản đồ.

### Tìm kiếm địa điểm

- Gợi ý khi nhập bằng Elasticsearch; tìm kiếm chính xác và lấy geometry đầy đủ bằng Nominatim.
- Tìm không dấu, alias phổ biến và ưu tiên kết quả theo loại địa danh khi index Elasticsearch đã được cấu hình.
- Hiển thị tên, địa chỉ, tọa độ, vùng bao và geometry của kết quả.
- Zoom tới điểm hoặc vùng tìm được; có thể dùng kết quả làm điểm đến cho công cụ tìm đường.
- Hỗ trợ kết quả Point, đường, Polygon, MultiPolygon và các geometry do Nominatim trả về.

### Tìm đường và độ cao

- Chọn điểm A/B bằng tìm kiếm hoặc trực tiếp trên bản đồ.
- Định tuyến qua Valhalla cho ô tô, xe máy, xe đạp, đi bộ, xe buýt, xe tải và taxi.
- Hiển thị tuyến đường, tổng quãng đường, thời gian dự kiến và chỉ dẫn theo từng chặng.
- Hiển thị mặt cắt độ cao, điểm cao nhất/thấp nhất, tổng leo dốc và tổng xuống dốc khi bộ dữ liệu Valhalla có elevation.
- Toàn bộ request route/elevation đi qua Controller; trình duyệt không truy cập Valhalla trực tiếp.

### Vẽ, biên tập và đo đạc

- Vẽ `Point`, `MultiPoint`, `LineString` và `Polygon`.
- Chọn hình, kéo đỉnh để chỉnh sửa, đổi tên/thuộc tính, ẩn/hiện, xóa hoặc tải riêng từng feature.
- Tự tính và cập nhật độ dài/diện tích trong properties của geometry phù hợp.
- Undo/redo bằng nút hoặc phím tắt; xóa toàn bộ bản vẽ khi cần.
- Đo khoảng cách hoặc diện tích, xem kết quả trong lúc vẽ và phát hiện polygon tự cắt.
- Import, chỉnh sửa trực tiếp và export `FeatureCollection` GeoJSON.
- Khi import, hỗ trợ đầy đủ `Point`, `MultiPoint`, `LineString`, `MultiLineString`, `Polygon`, `MultiPolygon` và `GeometryCollection`; giữ lại properties hợp lệ.

### Hệ tọa độ

- Chuyển đổi tọa độ và GeoJSON bằng `proj4`.
- Nhận biết trường `crs` khi import và ghi CRS vào dữ liệu export.
- Các hệ được hỗ trợ:

| Mã           | Hệ tọa độ              |
| ------------ | ---------------------- |
| `EPSG:4326`  | WGS 84                 |
| `EPSG:3857`  | Web Mercator           |
| `EPSG:32648` | WGS 84 / UTM zone 48N  |
| `EPSG:32649` | WGS 84 / UTM zone 49N  |
| `EPSG:4756`  | VN-2000 địa lý         |
| `EPSG:3405`  | VN-2000 / UTM zone 48N |
| `EPSG:3406`  | VN-2000 / UTM zone 49N |
| `EPSG:9209`  | VN-2000 / TM-3 105-30  |

### Chia sẻ GeoJSON

- Tạo snapshot chỉ xem từ các hình đã vẽ, kèm bản đồ nền và danh sách overlay đang bật.
- Mỗi snapshot hết hạn sau 30 ngày; một tài khoản có tối đa 50 snapshot còn hiệu lực.
- Chia sẻ bằng liên kết công khai hoặc tìm và gửi trực tiếp cho tối đa 50 người dùng trong hệ thống.
- Người nhận có khu vực **Được chia sẻ với tôi** và nhận thông báo thời gian thực qua Server-Sent Events.
- Trang xem chung tự khôi phục các lớp còn tồn tại, cảnh báo lớp không còn khả dụng, tự fit geometry và cho phép tải GeoJSON.
- Người tạo có thể xem thumbnail SVG, số lượng feature, ngày tạo, hiện lại liên kết hoặc thu hồi snapshot từ menu hồ sơ.
- Snapshot là bất biến; thu hồi, hết hạn hoặc xóa tài khoản chủ sở hữu sẽ làm dữ liệu không còn truy cập được.

### Tài khoản và phiên làm việc

- Đăng ký bằng họ tên, email, mật khẩu, ngày sinh, số điện thoại và đơn vị công tác.
- Đăng nhập, tự làm mới access token và đăng xuất phiên hiện tại.
- Backend hỗ trợ đăng xuất toàn bộ phiên và đổi mật khẩu; khi đổi mật khẩu, các phiên cũ bị thu hồi.
- Xem hồ sơ, cập nhật email/số điện thoại và tải ảnh đại diện JPEG/PNG.
- Tài khoản được quản trị viên đặt lại mật khẩu phải đổi mật khẩu tạm trước khi tiếp tục.
- Phiên mặc định hết hiệu lực sau 2 giờ không hoạt động; thời gian này có thể cấu hình.
- Thay đổi vai trò/trạng thái tài khoản được đẩy tới trình duyệt để yêu cầu đăng nhập lại.

### Quota, thông báo và khả năng tiếp cận

- Theo dõi quota tháng và số request tìm kiếm/định tuyến theo ngày.
- Xem báo cáo hôm nay, 7 ngày hoặc 30 ngày; có biểu đồ tổng request và phân bố theo API.
- Thông báo trong ứng dụng cho lần đăng nhập đầu, quota đã hết và bản đồ vừa được chia sẻ.
- Giao diện tiếng Việt/tiếng Anh.
- Chế độ màu theo hệ thống, sáng hoặc tối; hỗ trợ tương phản cao, chữ lớn, giảm chuyển động và skip link cho bàn phím.
- Thiết lập giao diện và ngôn ngữ được lưu ở trình duyệt; access/refresh token không được lưu trong `localStorage`.

> **Lưu ý:** mục “Billing” hiện là báo cáo gói dịch vụ và quota API. Dự án không xử lý thanh toán tiền thật, giao dịch hay hóa đơn.

### Quản trị

- Dashboard tổng số tài khoản, người dùng trực tuyến, phân bố độ tuổi và đơn vị công tác.
- Danh sách quota của mọi tài khoản và báo cáo chi tiết theo 1/7/30 ngày.
- Tìm kiếm, lọc theo vai trò/trạng thái, phân trang danh sách người dùng.
- Tạo, sửa và xóa tài khoản; cấu hình vai trò, trạng thái, gói dịch vụ và hạn mức tháng.
- Đặt lại mật khẩu tạm, bắt buộc đổi mật khẩu ở lần đăng nhập kế tiếp và thu hồi toàn bộ phiên cũ.
- Nhật ký quản trị lưu người thao tác, tài khoản đích, loại hành động và giá trị trước/sau.

### Tài liệu API

- OpenAPI 3.0 được sinh trực tiếp từ Controller tại `/api/openapi.json`.
- Trang tài liệu tích hợp tại `/swagger`, phân nhóm Authentication, Map, Sharing, Billing và Administration.

## Kiến trúc

```mermaid
flowchart LR
  B[Browser\nReact + MapLibre] --> F[Frontend\nVite hoặc Nginx]
  F --> C[Go Controller\nAuth + API gateway]
  C --> A[(Auth PostgreSQL/PostGIS)]
  C --> T[Tile Server]
  C --> N[Nominatim]
  C --> V[Valhalla]
  C --> E[Elasticsearch]
  N --> ND[(Nominatim PostGIS)]
```

Controller chịu trách nhiệm xác thực, quota, chia sẻ GeoJSON, quản trị và proxy có kiểm soát tới các worker. Tile Server, Nominatim, Valhalla, Elasticsearch và hai database không cần được public ra ngoài cluster.

## Công nghệ

| Thành phần                   | Công nghệ chính                                             |
| ---------------------------- | ----------------------------------------------------------- |
| Frontend                     | React 19, TypeScript 6, Vite 8, Material UI, MapLibre GL JS |
| Xử lý không gian phía client | Turf, proj4, GeoJSON                                        |
| Backend                      | Go 1.25, `net/http`, pgx                                    |
| Dữ liệu                      | PostgreSQL/PostGIS, JSONB                                   |
| Tìm kiếm                     | Elasticsearch autocomplete, Nominatim geocoding             |
| Định tuyến                   | Valhalla route và height API                                |
| Xác thực                     | Argon2id, JWT Ed25519, rotating refresh token, CSRF         |
| Triển khai                   | Docker multi-stage, Nginx, Kubernetes, Kustomize, Argo CD   |
| CI/CD                        | GitHub Actions, GHCR, image tag bất biến theo commit SHA    |

## Cấu trúc dự án

```text
.
├── fe/                           # React frontend
│   ├── src/features/map/         # Màn hình bản đồ, chia sẻ và các panel
│   ├── src/features/auth/        # Auth context, đăng nhập, đổi mật khẩu tạm
│   ├── src/features/billing/     # Báo cáo quota người dùng
│   ├── src/features/notifications/
│   ├── src/features/accessibility/
│   ├── src/admin/                # Dashboard quản trị
│   ├── src/swagger/              # OpenAPI viewer
│   ├── src/hooks/                # Map, draw, measure, routing hooks
│   └── src/tools/                # GeoJSON, CRS, geocoding, routing
├── be/                           # Go Controller/API gateway
│   ├── migrations/               # Schema auth, quota, share, audit
│   └── cmd/keygen/               # Sinh cặp khóa Ed25519
├── deployment/                   # Kubernetes/Kustomize/Argo CD
│   ├── db/                       # Auth PostgreSQL riêng
│   ├── overlays/local/           # Ingress cho Docker Desktop
│   └── README.md                 # Hướng dẫn triển khai và nhập dữ liệu worker
├── package.json                  # Lệnh phát triển, test và build
└── .env.example                  # Cấu hình proxy frontend local
```

## Chạy local

### Yêu cầu

- Node.js 24+ và npm.
- Go 1.25+.
- PostgreSQL/PostGIS với database tên `webgis` cho dữ liệu tài khoản.
- Các worker dưới đây nếu muốn dùng đầy đủ chức năng bản đồ:

| Dịch vụ       | Địa chỉ mặc định        | Bắt buộc cho                         |
| ------------- | ----------------------- | ------------------------------------ |
| Tile Server   | `http://localhost:8080` | Basemap và overlay                   |
| Valhalla      | `http://localhost:8002` | Tìm đường và độ cao                  |
| Nominatim     | `http://localhost:8083` | Tìm kiếm địa điểm                    |
| Elasticsearch | `http://localhost:9200` | Autocomplete; có thể bỏ trống để tắt |

### 1. Cài dependency

```powershell
npm install
```

### 2. Tạo file cấu hình

```powershell
Copy-Item .env.example .env
Copy-Item be/.env.example be/.env
```

Cập nhật tối thiểu các giá trị sau trong `be/.env`:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/webgis
AUTH_REFRESH_TOKEN_PEPPER=thay-bang-chuoi-ngau-nhien-it-nhat-32-byte
AUTH_DEV_EPHEMERAL_KEYS=true
AUTH_SECURE_COOKIES=false
AUTH_SESSION_IDLE_TIMEOUT_SECONDS=7200

VALHALLA_INTERNAL_URL=http://localhost:8002
TILE_SERVER_INTERNAL_URL=http://localhost:8080
NOMINATIM_INTERNAL_URL=http://localhost:8083
ELASTICSEARCH_URL=http://localhost:9200
```

`AUTH_DEV_EPHEMERAL_KEYS=true` chỉ phù hợp cho development. Không commit `be/.env` hoặc `.env`.

### 3. Khởi tạo schema

Sau khi database `webgis` đã tồn tại và `DATABASE_URL` kết nối được:

```powershell
npm run auth:migrate
```

Migration tạo bảng người dùng, phiên, lịch sử refresh token, event thu hồi, quota, thống kê request, chia sẻ GeoJSON và audit log. Script có thể chạy lại an toàn khi nâng cấp schema.

### 4. Khởi động

```powershell
npm start
```

| Thành phần    | URL                             |
| ------------- | ------------------------------- |
| Frontend Vite | `http://localhost:5173`         |
| Go Controller | `http://localhost:3001`         |
| OpenAPI UI    | `http://localhost:5173/swagger` |
| Health check  | `http://localhost:3001/health`  |

Vite proxy các đường dẫn `/auth` và `/api` sang Controller, vì vậy trình duyệt vẫn dùng cùng cấu trúc URL như production.

## Các lệnh thường dùng

```powershell
npm start              # Chạy frontend và backend
npm run dev            # Chỉ chạy frontend
npm run auth:dev       # Chỉ chạy Go Controller
npm run auth:migrate   # Chạy database migration
npm test               # Go unit tests
npm run lint           # ESLint
npm run format:check   # Kiểm tra Prettier
npm run build          # Build backend và frontend production
npm run preview        # Xem thử frontend đã build
```

Benchmark Valhalla và dữ liệu testcase nằm trong `fe/src/test/Valhalla/`.

## API chính

Các endpoint ghi “Bearer” yêu cầu `Authorization: Bearer <access_token>`. Refresh token được gửi bằng cookie `HttpOnly`; các thao tác dùng cookie được bảo vệ bằng CSRF token.

### Hệ thống và xác thực

| Method      | Endpoint                      | Quyền         | Chức năng                                            |
| ----------- | ----------------------------- | ------------- | ---------------------------------------------------- |
| `GET`       | `/health`                     | Công khai     | Kiểm tra Controller và bộ đồng bộ event đã sẵn sàng. |
| `GET`       | `/api/openapi.json`           | Công khai     | OpenAPI schema của phiên bản đang chạy.              |
| `GET`       | `/auth/.well-known/jwks.json` | Công khai     | Public JWKS dùng xác minh JWT.                       |
| `POST`      | `/auth/register`              | Công khai     | Đăng ký tài khoản.                                   |
| `POST`      | `/auth/login`                 | Công khai     | Đăng nhập, nhận access token và refresh cookie.      |
| `POST`      | `/auth/refresh`               | Cookie + CSRF | Rotate refresh token và cấp access token mới.        |
| `POST`      | `/auth/logout`                | Bearer        | Thu hồi phiên hiện tại.                              |
| `POST`      | `/auth/logout-all`            | Bearer        | Thu hồi mọi phiên của tài khoản.                     |
| `POST`      | `/auth/change-password`       | Bearer        | Đổi mật khẩu và thu hồi các phiên.                   |
| `GET/PATCH` | `/auth/me`                    | Bearer        | Xem hoặc cập nhật hồ sơ.                             |
| `GET`       | `/auth/session-events`        | Cookie        | Luồng SSE cho thay đổi phiên và chia sẻ mới.         |

### Bản đồ và chia sẻ

| Method     | Endpoint                       | Quyền     | Chức năng                                      |
| ---------- | ------------------------------ | --------- | ---------------------------------------------- |
| `GET`      | `/api/suggestions?q=...`       | Bearer    | Autocomplete Elasticsearch; tính quota search. |
| `GET`      | `/api/nominatim/search?q=...`  | Bearer    | Proxy Nominatim; tính quota search.            |
| `POST`     | `/api/gateway/route`           | Bearer    | Proxy Valhalla route; tính quota route.        |
| `POST`     | `/api/gateway/elevation`       | Bearer    | Lấy mặt cắt độ cao đã giới hạn số điểm.        |
| `GET/HEAD` | `/api/tile-catalog`            | Công khai | Đọc catalog Tile Server.                       |
| `GET/HEAD` | `/api/tiles/...`               | Công khai | Proxy tile/font/TileJSON; không tính quota.    |
| `POST/GET` | `/api/shares`                  | Bearer    | Tạo snapshot hoặc liệt kê snapshot của mình.   |
| `POST`     | `/api/shares/{id}/link`        | Bearer    | Lấy hoặc tạo liên kết công khai cho snapshot.  |
| `DELETE`   | `/api/shares/{id}`             | Bearer    | Thu hồi snapshot của mình.                     |
| `GET`      | `/api/shares/{token}`          | Công khai | Mở snapshot bằng token công khai.              |
| `GET`      | `/api/shares/recipients?q=...` | Bearer    | Tìm người nhận theo tên/email.                 |
| `POST`     | `/api/shares/{id}/recipients`  | Bearer    | Gửi snapshot cho các tài khoản đã chọn.        |
| `GET`      | `/api/shares/received`         | Bearer    | Danh sách snapshot được chia sẻ với mình.      |
| `GET`      | `/api/shares/received/{id}`    | Bearer    | Mở snapshot theo quyền người nhận.             |

### Quota và quản trị

| Method         | Endpoint                                   | Quyền  | Chức năng                                          |
| -------------- | ------------------------------------------ | ------ | -------------------------------------------------- |
| `GET`          | `/api/billing?range=1\|7\|30`              | Bearer | Xem gói, quota và thống kê request của chính mình. |
| `GET`          | `/api/admin/dashboard`                     | Admin  | Số liệu tổng quan tài khoản.                       |
| `GET`          | `/api/admin/billing`                       | Admin  | Quota của toàn bộ người dùng.                      |
| `GET`          | `/api/admin/billing/{userId}?range=...`    | Admin  | Báo cáo chi tiết một người dùng.                   |
| `GET/POST`     | `/api/admin/users`                         | Admin  | Liệt kê hoặc tạo tài khoản.                        |
| `PATCH/DELETE` | `/api/admin/users/{userId}`                | Admin  | Cập nhật hoặc xóa tài khoản.                       |
| `POST`         | `/api/admin/users/{userId}/reset-password` | Admin  | Cấp mật khẩu tạm và thu hồi phiên cũ.              |
| `GET`          | `/api/admin/audit`                         | Admin  | Đọc 100 audit log mới nhất.                        |

## Bảo mật

- Mật khẩu được băm bằng Argon2id; chính sách mặc định yêu cầu ít nhất 8 ký tự gồm chữ hoa, chữ thường và số.
- Access token JWT ký Ed25519, có `issuer`, `audience`, `kid`, scope, session ID và thời hạn mặc định 15 phút.
- Refresh token ngẫu nhiên được đặt trong cookie `HttpOnly`; database chỉ lưu HMAC hash với pepper phía server.
- Refresh token được rotate mỗi lần dùng. Việc tái sử dụng token cũ được xem là replay và làm phiên liên quan bị thu hồi.
- Các endpoint ghi dùng cookie được bảo vệ bằng double-submit CSRF token.
- Login có giới hạn đồng thời và rate limit theo IP/identity; quota được cập nhật atomically trong PostgreSQL.
- Event thu hồi được lưu bền vững để nhiều Controller pod có thể đồng bộ trạng thái sau restart.
- Payload proxy, GeoJSON và response từ worker đều được giới hạn kích thước; đường dẫn tile được kiểm tra trước khi chuyển tiếp.
- NetworkPolicy giới hạn kết nối tới database và worker; Controller không tin các identity header do client tự gửi.
- Production bắt buộc dùng cặp khóa Ed25519 ổn định, secret manager, HTTPS và cookie `Secure`.

Sinh cặp khóa production:

```powershell
go run ./be/cmd/keygen -out-dir deployment/.secrets
```

Sau đó đưa `AUTH_JWT_PRIVATE_KEY`, `AUTH_JWT_PUBLIC_KEY` và `AUTH_REFRESH_TOKEN_PEPPER` vào secret manager; không commit khóa vào Git.

## Docker và Kubernetes

Build hai image ứng dụng từ thư mục gốc:

```powershell
docker build -f be/Dockerfile -t REGISTRY/webgis/controller:TAG .
docker build -f fe/Dockerfile -t REGISTRY/webgis/frontend:TAG .
```

Kustomize base triển khai namespace, frontend, Controller, migration Job, ingress và NetworkPolicy. Auth PostgreSQL được quản lý riêng trong `deployment/db/`. Các worker và PVC được tách khỏi base để tránh tự động prune hoặc khởi động trước khi dữ liệu bản đồ sẵn sàng.

Trình tự core tối thiểu:

```powershell
Copy-Item deployment/secret.example.yaml deployment/secret.yaml
# Điền secret thật vào deployment/secret.yaml

kubectl apply -f deployment/namespace.yaml
kubectl apply -f deployment/secret.yaml
kubectl apply -k deployment/db
kubectl -n webgis rollout status statefulset/auth-postgres
kubectl apply -k deployment
kubectl -n webgis wait --for=condition=complete job/auth-migrate --timeout=180s
```

Với Docker Desktop, áp dụng overlay local rồi mở `http://webgis.localhost`:

```powershell
kubectl apply -k deployment/overlays/local
kubectl -n webgis rollout restart deployment/controller
```

Quy trình đầy đủ để tạo secret, nhập dữ liệu từ Docker vào PVC, chạy Nominatim/Valhalla/Tile Server và vận hành Argo CD được mô tả tại [deployment/README.md](deployment/README.md). Autocomplete tùy chọn dùng manifest `deployment/elasticsearch.yaml`; chỉ áp dụng manifest này sau khi Nominatim DB và secret `nominatim-db-credentials` đã sẵn sàng vì Job `search-indexer` đọc dữ liệu trực tiếp từ Nominatim.

## CI/CD

Workflow `.github/workflows/ci.yaml` thực hiện:

1. Chạy Go test, ESLint, build backend/frontend và render Kustomize trên pull request.
2. Khi merge vào `main`, chỉ build các image có source thay đổi.
3. Push image lên GHCR với tag bất biến `sha-<commit>`.
4. Cập nhật image tag trong manifest GitOps nếu nhánh `main` chưa thay đổi trong lúc build.

## Kịch bản kiểm thử nhanh

1. Đăng ký, đăng nhập, đổi ngôn ngữ/chế độ màu và cập nhật hồ sơ.
2. Chọn basemap, bật nhiều overlay, tìm một địa điểm và zoom tới geometry kết quả.
3. Chọn điểm A/B, thử nhiều phương tiện, kiểm tra chỉ dẫn, quãng đường, thời gian và biểu đồ độ cao.
4. Vẽ Point/MultiPoint/LineString/Polygon, sửa đỉnh và properties, ẩn/hiện, undo/redo.
5. Đo khoảng cách/diện tích; export GeoJSON, đổi CRS rồi import lại để kiểm tra geometry và properties.
6. Tạo snapshot, mở link công khai, gửi cho tài khoản khác, kiểm tra thông báo và mục **Được chia sẻ với tôi**, sau đó thu hồi.
7. Xem quota theo 1/7/30 ngày và xác nhận search/route được phân loại đúng.
8. Với tài khoản admin, kiểm tra dashboard, CRUD người dùng, reset mật khẩu tạm và audit log.
9. Mở `/swagger` để đối chiếu contract API đang chạy.
