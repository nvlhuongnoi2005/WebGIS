# WebGIS – Nền tảng bản đồ, dữ liệu không gian và dịch vụ địa lý

Ứng dụng WebGIS mã nguồn mở phục vụ hiển thị và tương tác bản đồ, đo đạc, vẽ dữ liệu không gian, trao đổi GeoJSON/CRS, tìm kiếm địa điểm và tìm đường. Dự án được tổ chức theo kiến trúc frontend–backend, có thể chạy local hoặc triển khai trên Kubernetes.

> Map engine của dự án là **MapLibre GL JS**. MapLibre đáp ứng nhu cầu hiển thị vector/raster tile, layer, tương tác bản đồ và được kết hợp với React + TypeScript.

## Mục tiêu đề tài

| Giai đoạn | Nội dung đã hiện thực |
| --- | --- |
| 1. Ứng dụng WebGIS và đo đạc | Basemap, layer, marker; vẽ và chỉnh sửa Point/LineString/Polygon; đo khoảng cách/diện tích; undo/redo và xóa dữ liệu. |
| 2. GeoJSON và hệ tọa độ | Import/export FeatureCollection GeoJSON, giữ properties, kiểm tra dữ liệu đầu vào, chuyển đổi CRS bằng `proj4`. |
| 3. Geospatial API full-stack | Geocoding Nominatim có autocomplete; routing Valhalla qua backend gateway; hiển thị tuyến, chỉ dẫn, khoảng cách và thời gian. |
| 4. Kiến trúc và triển khai | React/TypeScript, Go API gateway, PostGIS, Nominatim, Valhalla, tile server, Docker và Kubernetes. |

## Chức năng chính

- Hiển thị basemap và tile dataset; bật/tắt base layer và overlay.
- Tìm kiếm địa điểm qua Nominatim, gợi ý khi nhập và zoom tới kết quả.
- Chọn điểm A–B, tính tuyến đường bằng Valhalla, hiển thị đường đi, chỉ dẫn, quãng đường và thời gian.
- Vẽ Point, LineString, Polygon; chọn, sửa đỉnh, xóa, ẩn/hiện và cập nhật thuộc tính feature.
- Đo chiều dài và diện tích; hoàn tác/làm lại, reset; kiểm tra polygon tự cắt.
- Import/export GeoJSON, gồm MultiGeometry và GeometryCollection.
- Hiển thị/chuyển đổi tọa độ EPSG:4326, EPSG:3857, WGS84 UTM 48N/49N và một số hệ VN-2000.
- Đăng ký, đăng nhập, quản lý hồ sơ, đổi mật khẩu, đăng xuất một/all session.
- Session hết hạn khi không có hoạt động trong 2 giờ; access token ngắn hạn được refresh an toàn khi người dùng còn hoạt động.
- Giao diện tiếng Việt/tiếng Anh, light/dark mode và một số tùy chọn accessibility.

## Kiến trúc

```text
Browser
  │
  ├── React + TypeScript + MapLibre
  │      ├── Draw / Measure / GeoJSON / CRS
  │      ├── Search → /api/nominatim
  │      └── Route  → /api/gateway/route
  │
  └── Nginx / Ingress
           │
           └── Go Controller (auth + API gateway)
                 ├── Auth PostGIS: users, sessions, refresh history, quotas
                 ├── Nominatim: geocoding
                 ├── Valhalla: routing
                 └── Tile server: map tiles and catalog
```

Các worker bản đồ chỉ là `ClusterIP`; browser không gọi trực tiếp Nominatim, Valhalla hoặc tile server trong môi trường Kubernetes.

## Công nghệ

| Thành phần | Công nghệ |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Material UI, MapLibre GL JS, Turf, proj4, i18next |
| Backend | Go, `net/http`, pgx, PostgreSQL/PostGIS |
| Xác thực | Argon2id, Ed25519 JWT, HttpOnly rotating refresh cookie, CSRF token |
| Dịch vụ địa lý | Nominatim, Valhalla, tile server |
| Triển khai | Docker, Kubernetes, ingress-nginx, NetworkPolicy, PVC |

## Cấu trúc thư mục

```text
fe/                         # React client
  src/features/map/         # MapView và các panel bản đồ
  src/hooks/                # Draw, measure, route, layer, map hooks
  src/tools/                # GeoJSON, CRS, geocoding, routing
  src/features/auth/        # Client auth context và login UI
be/                         # Go controller / API gateway
  migrations/               # Schema auth PostGIS
  cmd/keygen/               # Tạo Ed25519 key pair
deployment/                 # Manifest Kubernetes
  workers.yaml              # Nominatim, Valhalla, tile-server
  worker-storage.yaml       # PVC worker
```

## API

| Method | Endpoint | Mô tả |
| --- | --- | --- |
| `POST` | `/auth/register` | Đăng ký người dùng. |
| `POST` | `/auth/login` | Đăng nhập; trả access token và refresh cookie. |
| `POST` | `/auth/refresh` | Xoay refresh token, cấp access token mới. |
| `POST` | `/auth/logout` | Đăng xuất session hiện tại. |
| `POST` | `/auth/logout-all` | Thu hồi toàn bộ session của người dùng. |
| `POST` | `/auth/change-password` | Đổi mật khẩu và thu hồi session cũ. |
| `GET/PATCH` | `/auth/me` | Xem/cập nhật hồ sơ. |
| `GET` | `/auth/.well-known/jwks.json` | Public JWKS cho JWT EdDSA. |
| `GET` | `/api/nominatim/search` | Proxy geocoding Nominatim. |
| `POST` | `/api/gateway/route` | Routing có xác thực và quota. |
| `GET` | `/api/tiles/...` | Proxy tile server. |
| `GET` | `/health` | Health check controller. |

## Bảo mật

- Mật khẩu lưu bằng Argon2id; không lưu mật khẩu, token hay hash trong `localStorage`.
- Access token ký Ed25519, có issuer/audience/key-id và thời hạn ngắn.
- Refresh token là giá trị ngẫu nhiên; database chỉ lưu HMAC hash với pepper phía server.
- Refresh rotation phát hiện token replay và thu hồi session liên quan.
- Cookie refresh là `HttpOnly`, `Secure` ở production và bảo vệ thao tác ghi bằng CSRF token.
- Login có rate-limit theo IP và identity; routing có quota atomic trong Postgres.
- Controller chỉ tự tạo các internal identity header khi gọi Valhalla, không tin header do client tự gửi.
- NetworkPolicy giữ Postgres và geospatial worker ở mạng riêng.

## Chạy local

### Yêu cầu

- Node.js 24+ và npm
- Go 1.25+
- PostgreSQL/PostGIS cho authentication
- Docker Desktop nếu chạy các geospatial worker

### Cấu hình backend

```powershell
Copy-Item be/.env.example be/.env
```

Điền tối thiểu trong `be/.env`:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/webgis
AUTH_REFRESH_TOKEN_PEPPER=thay-bang-chuoi-ngau-nhien-it-nhat-32-byte
AUTH_DEV_EPHEMERAL_KEYS=true
AUTH_SECURE_COOKIES=false
AUTH_SESSION_IDLE_TIMEOUT_SECONDS=7200
```

Với production, đặt `AUTH_DEV_EPHEMERAL_KEYS=false` và cung cấp `AUTH_JWT_PRIVATE_KEY`, `AUTH_JWT_PUBLIC_KEY` từ secret manager. Không commit file `be/.env`.

### Cài dependency và khởi chạy

```powershell
npm install
npm run auth:migrate
npm start
```

- Frontend Vite: `http://localhost:5173`
- Backend controller: `http://localhost:3001`

## Kiểm thử và build

```powershell
npm test       # Go unit tests
npm run lint   # ESLint
npm run build  # Go build + TypeScript/Vite production build
```

Ngoài unit test backend, thư mục `fe/src/test/Valhalla` có dữ liệu và script benchmark routing để kiểm tra Valhalla.

## Kubernetes

### Thành phần core

Thư mục `deployment/` có Kustomize base cho:

- `frontend`
- `controller`
- `auth-postgres`
- ingress, config map và network policy

Tạo secret từ mẫu, tuyệt đối không commit secret thật:

```powershell
Copy-Item deployment/secret.example.yaml deployment/secret.yaml
# Điền password DB, refresh-token pepper và cặp Ed25519 key vào secret.yaml
kubectl apply -f deployment/secret.yaml
```

Triển khai core và chạy migration:

```powershell
kubectl apply -k deployment
kubectl -n webgis rollout status statefulset/auth-postgres
kubectl -n webgis apply -f deployment/migration-job.yaml
kubectl -n webgis wait --for=condition=complete job/auth-migrate --timeout=180s
kubectl -n webgis rollout status deployment/controller
kubectl -n webgis rollout status deployment/frontend
```

### Worker geospatial

`workers.yaml`, `worker-storage.yaml` và `worker-networkpolicy.yaml` được tách khỏi `kustomization.yaml` vì cần chuẩn bị dữ liệu tile, graph Valhalla và database Nominatim trước khi chạy. Sau khi dữ liệu/PVC/secret Nominatim sẵn sàng:

```powershell
kubectl -n webgis apply -f deployment/worker-storage.yaml
kubectl -n webgis apply -f deployment/worker-networkpolicy.yaml
kubectl -n webgis apply -f deployment/workers.yaml
```

Khi dùng Argo CD, nên tạo Application riêng `webgis-workers` hoặc đưa các manifest worker vào Kustomize sau khi kiểm soát được PVC và secret. Không bật prune đối với worker trước khi kiểm tra kỹ dữ liệu persistent.

### Local ingress

Sau khi ingress-nginx sẵn sàng, áp dụng overlay local:

```powershell
kubectl apply -k deployment/overlays/local
kubectl -n webgis rollout restart deployment/controller
```

Mở `http://webgis.localhost`. Nếu trình duyệt không tự phân giải `*.localhost`, thêm dòng sau vào file hosts của Windows:

```text
127.0.0.1 webgis.localhost
```

### Kiểm tra vận hành

```powershell
kubectl -n webgis get pods,svc,pvc,ingress
kubectl -n webgis logs deployment/controller --tail=100
kubectl -n webgis rollout status deployment/controller
kubectl -n webgis rollout status deployment/frontend
```

## Kịch bản demo

1. Đăng ký/đăng nhập, mở bản đồ và đổi ngôn ngữ/giao diện.
2. Vẽ Point, LineString, Polygon; chỉnh sửa đỉnh, cập nhật properties và xóa feature.
3. Đo khoảng cách/diện tích; thể hiện undo/redo và reset.
4. Xuất GeoJSON, đổi CRS, import lại và kiểm tra properties/hình học.
5. Tìm địa điểm bằng autocomplete Nominatim, chọn kết quả và zoom tới vị trí.
6. Chọn điểm đi/đến, tính route Valhalla, trình bày distance/time/instructions.
7. Trình bày luồng Browser → Controller → PostGIS/Nominatim/Valhalla/Tile server và NetworkPolicy.
