# Đo hiệu năng bằng PowerShell

`Measure-WebGIS.ps1` gửi request trực tiếp tới Controller đang chạy và in các
chỉ số: số request, thành công/thất bại, request/giây, mean, min, p50, p95,
p99, max, kích thước response và mã HTTP. Script không cần Prometheus,
Grafana, Docker hoặc Kubernetes manifest.

## Health và Tile Server không cần đăng nhập

```powershell
./test/performance/Measure-WebGIS.ps1 -BaseUrl http://webgis.localhost -Scenario health,tile -Warmup 3 -Iterations 30
```

Để đo một tile cụ thể, truyền đường dẫn qua Controller:

```powershell
./test/performance/Measure-WebGIS.ps1 -BaseUrl http://webgis.localhost -Scenario tile -TilePath /api/tiles/PASTE_A_REAL_TILE_PATH -Iterations 30
```

## Search, Nominatim và route cần access token

Tạo một tài khoản test có quota đủ lớn, đăng nhập để lấy access token ngắn hạn,
rồi đặt token trong biến môi trường. Không ghi token vào source code hoặc file
kết quả.

```powershell
$env:WEBGIS_ACCESS_TOKEN = "PASTE_TEST_ACCESS_TOKEN"
./test/performance/Measure-WebGIS.ps1 -BaseUrl http://webgis.localhost -Scenario suggestions,nominatim,route -Warmup 5 -Iterations 30 -OutputPath test/performance/results/run-01.json
```

Script chạy tuần tự để số liệu ít bị ảnh hưởng bởi chính client tạo tải. Dùng
`-Iterations 100` khi cần mẫu lớn hơn. `RequestsPerSecond` là throughput của
một client; nó không đại diện cho benchmark đồng thời nhiều người dùng.
