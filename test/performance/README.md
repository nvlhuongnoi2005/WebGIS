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

## Stress-test đồng thời bằng k6

`k6-webgis.js` mô phỏng nhiều người dùng gọi **Controller**. Vì toàn bộ endpoint
được gọi qua Controller, kết quả phản ánh cả Controller và service phía sau:
Tile Server, Elasticsearch, Nominatim hoặc Valhalla. Không chạy stress-test trên
production; hãy dùng môi trường staging/local có dữ liệu bản đồ tương đương.

### 1. Cài k6 trên Windows

```powershell
winget install k6 --source winget
k6 version
```

Hoặc chạy k6 bằng Docker nếu Docker Desktop đã hoạt động:

```powershell
docker pull grafana/k6
```

### 2. Chạy smoke test trước

Mặc định `WORKLOAD=public` chỉ gọi `/health` và `/api/tile-catalog`, nên không
cần token. Luôn bắt đầu bằng smoke test để xác nhận URL, ingress và Tile Server.

```powershell
k6 run -e BASE_URL=http://webgis.localhost -e VUS=2 -e RAMP_UP=10s -e DURATION=30s test/performance/k6-webgis.js
```

### 3. Chạy theo từng service

`search`, `route` và `mixed` cần `WEBGIS_ACCESS_TOKEN` của tài khoản test có
quota đủ cao. Đặt token trong biến môi trường, không đưa vào source code hay
file kết quả.

```powershell
$loginEmail = Read-Host "Email tài khoản load-test"
$loginPassword = Read-Host "Mật khẩu" -AsSecureString
$loginPasswordText = [System.Net.NetworkCredential]::new("", $loginPassword).Password

$loginResponse = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1/auth/login" `
  -ContentType "application/json" `
  -Body (@{ email = $loginEmail; password = $loginPasswordText } | ConvertTo-Json -Compress)

$env:WEBGIS_ACCESS_TOKEN = $loginResponse.access_token
Remove-Variable loginPasswordText
$loginResponse.expires_in

# Elasticsearch autocomplete + Nominatim qua Controller
k6 run -e BASE_URL=http://webgis.localhost -e WORKLOAD=search -e VUS=25 -e DURATION=5m test/performance/k6-webgis.js

# Valhalla route qua Controller
k6 run -e BASE_URL=http://webgis.localhost -e WORKLOAD=route -e VUS=25 -e DURATION=5m test/performance/k6-webgis.js

# 40% tile, 25% suggestions, 20% Nominatim, 15% route
k6 run -e BASE_URL=http://webgis.localhost -e WORKLOAD=mixed -e VUS=50 -e DURATION=10m `
  --summary-export=test/performance/results/mixed-50vu-summary.json `
  test/performance/k6-webgis.js
```

Để đo một tile thật thay vì tile catalog, truyền đường dẫn được Controller cho
phép qua `TILE_PATH`:

```powershell
k6 run -e BASE_URL=http://webgis.localhost -e TILE_PATH=/api/tiles/PASTE_A_REAL_TILE_PATH -e VUS=25 test/performance/k6-webgis.js
```

### 4. Kế hoạch tăng tải và đọc kết quả

Chạy lần lượt `VUS=10`, `25`, `50`, `100`; mỗi lần warm-up 1 phút và giữ tải ít
nhất 5 phút. Ghi `http_req_duration`, `webgis_response_duration_ms` theo tag
`service`, `http_reqs`, `webgis_request_errors` và `checks`. Kịch bản đặt ngưỡng
mặc định: lỗi dưới 1%, p95 health dưới 500 ms, tile/suggestions dưới 1.5 s,
Nominatim dưới 3 s và route dưới 4 s. Điều chỉnh các ngưỡng đó theo SLA thực tế
của đề tài trước khi kết luận.

Khi p95/p99 tăng hoặc tỉ lệ lỗi vượt ngưỡng, đối chiếu cùng thời điểm với CPU,
RAM, số kết nối database và log của Controller/worker để xác định nút thắt.
