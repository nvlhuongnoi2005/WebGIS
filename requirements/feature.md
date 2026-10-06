Hãy triển khai chức năng quản lý GIS data vào repository hiện tại, tích hợp với Go Controller, JWT, PostgreSQL, React + MapLibre và tile server sẵn có.

Hãy sửa code để hoàn thiện luồng sử dụng; không chỉ trả về kế hoạch hoặc tạo giao diện mock.

## Mục tiêu

Admin có thể upload và quản lý raw geodata, tạo tileset bằng GDAL, tạo style, publish map và cấp/thu hồi ACL. Người dùng chỉ thấy publication được phép trong catalog và chỉ tải được style/tile thuộc publication mà họ có quyền truy cập.

Luồng chính:

```text
Admin upload
→ raw file lưu trong storage
→ tạo dataset version và processing job
→ GDAL worker validate, chuẩn hóa và build MBTiles
→ artifact được promote sang published storage
→ admin preview, gắn style và publish
→ admin cấp ACL
→ user reload, nhận catalog theo quyền
→ frontend tải style/tile qua Go Controller
```

## 1. Khảo sát source trước khi sửa

Đọc `AGENTS.md` và khảo sát cấu trúc thật của repository, đặc biệt:

```text
be/authorization.go
be/server.go
be/types.go
be/config.go
be/repository.go
be/migrations/
fe/src/admin/
fe/src/tools/map/MapStyleTool.ts
fe/src/features/map/components/TileServerBaseMapPanel.tsx
fe/src/i18n/locales/vi.json
fe/src/i18n/locales/en.json
deployment/
```

Các đường dẫn có thể khác với mô tả. Hãy tìm module tương ứng và theo convention hiện có. Xác định:

- Cách đăng ký route, middleware JWT, lấy user ID và role.
- Cách lưu và truy vấn PostgreSQL.
- Cách migration runner tìm và áp dụng migration.
- Cách frontend gọi API và kiểm tra quyền.
- Cách `/api/tile-catalog` và `/api/tiles/...` hiện proxy tới tile server.
- Tile server hiện nhận diện tileset, đọc thư mục nào và có cần reload/register sau khi thêm MBTiles không.
- Cấu hình Kubernetes/ArgoCD và PVC đang được dùng.

Trước khi chỉnh sửa, trình bày ngắn gọn các phát hiện về source và kế hoạch triển khai. Sau đó tiếp tục code trong cùng lượt. Giữ nguyên thay đổi sẵn có và các chức năng bản đồ hiện tại.

## 2. Phạm vi Phase 1

Hỗ trợ upload và build vector tiles từ:

- GeoJSON.
- GeoPackage.
- Shapefile ZIP.

Một dataset version có thể chứa nhiều layer. Cho phép admin chọn layer đầu vào khi tạo tileset. Phase 1 chưa cần hỗ trợ KML, CSV, GeoTIFF/raster, editor style nâng cao hoặc approval workflow nhiều bước.

Raw file lưu trong Ceph RGW/S3-compatible. MBTiles và dữ liệu staging/published lưu trên CephFS. Với local dev, cung cấp cấu hình filesystem adapter hoặc cách chạy local tương thích với worker; không yêu cầu dựng Ceph để chạy smoke test cơ bản.

Không dùng database Nominatim/geocoding để lưu raw data hoặc metadata do admin upload.

## 3. Model và migration

Tạo migration mới theo convention hiện có. Không sửa migration đã được áp dụng. Cập nhật migration runner nếu hiện chỉ hỗ trợ một file migration.

Các bảng tối thiểu:

```text
datasets
dataset_versions
tilesets
tileset_versions
map_styles
map_style_versions
map_publications
resource_acl
processing_jobs
```

Dùng UUID, foreign key, index, unique constraint và timestamps phù hợp. Gắn owner/creator theo mô hình user hiện có.

Quan hệ dữ liệu:

```text
Dataset
  → Dataset Version
    → Tileset Version
      → Style Version
        → Map Publication
          → ACL
```

Model phải giữ được các liên kết sau:

- Dataset có nhiều dataset version.
- Tileset có nhiều tileset version.
- Tileset version tham chiếu chính xác dataset version và cấu hình build.
- Style version bất biến sau khi được tạo, lưu MapLibre Style JSON và tham chiếu chính xác tileset version.
- Publication tham chiếu style version đang được publish.
- ACL gắn với publication; nếu source hiện có mô hình ACL resource tổng quát thì mở rộng mô hình đó theo convention hiện tại.

Một style có thể có nhiều source/layer nếu kiến trúc MapLibre hiện tại hỗ trợ; không giả định mọi style chỉ tham chiếu đúng một tileset.

Trạng thái cần được định nghĩa rõ theo từng loại đối tượng:

- Dataset version: `uploading`, `uploaded`, `validating`, `ready`, `failed`, `archived`.
- Processing job: `queued`, `running`, `succeeded`, `failed`, `canceled`.
- Tileset version: `processing`, `ready`, `failed`, `archived`.
- Style version: `draft`, `ready`, `archived`.
- Publication: `draft`, `published`, `unpublished`, `archived`.

Không dùng chung một state machine cho mọi bảng. Không ghi đè tileset version hoặc style version đã `ready`.

Lưu metadata cần thiết: filename gốc, storage key, file size, checksum và thuật toán checksum, format, CRS, bbox kèm thông tin CRS, layer, geometry type, feature count, build config, artifact path, TileJSON, log và lỗi xử lý.

## 4. Storage và upload

Tạo interface storage cho raw data, tối thiểu hỗ trợ upload/stream, open/read, stat và delete.

Cung cấp:

- Adapter S3-compatible cấu hình được để chạy với Ceph RGW.
- Adapter filesystem cho local dev.

Không hard-code endpoint, credential, bucket hoặc đường dẫn. Storage key do backend sinh từ UUID; không dùng tên file người dùng làm path.

Upload phải:

- Stream file thay vì nạp toàn bộ file lớn vào RAM.
- Giới hạn kích thước và chỉ chấp nhận định dạng được hỗ trợ.
- Tính checksum trong lúc upload.
- Ghi nhận trạng thái upload thành công/thất bại.
- Kiểm tra nội dung thực tế ở worker, không chỉ dựa vào phần mở rộng hoặc MIME type.
- Cấp endpoint download raw qua backend có kiểm tra quyền.

Shapefile ZIP phải được kiểm tra an toàn: chặn path traversal/Zip Slip, absolute path và symlink; giới hạn số file, dung lượng sau giải nén và tỷ lệ nén; kiểm tra các file thành phần cần thiết. Nếu thiếu CRS, trả lỗi rõ ràng hoặc yêu cầu admin cung cấp CRS hợp lệ, không tự đoán.

## 5. GDAL worker và xử lý job

Source hiện tại chưa có Kubernetes Job client hoặc message queue. Phase 1 dùng worker dạng deployment poll PostgreSQL:

```text
Controller tạo processing_jobs(status='queued')
Worker claim job bằng transaction ngắn và SELECT ... FOR UPDATE SKIP LOCKED
Worker xử lý ngoài transaction
Worker cập nhật trạng thái, log và kết quả
```

Không giữ row lock hoặc transaction mở trong suốt quá trình GDAL chạy. Dùng lease/claim metadata phù hợp để phát hiện job bị bỏ dở khi worker chết. Tránh hai worker xử lý trùng một job.

Tạo entry point riêng, ưu tiên:

```text
be/cmd/gdal-worker/main.go
```

Tuân theo Go module và cấu trúc thật nếu khác. Tác vụ GDAL phải chạy ngoài HTTP controller.

Pipeline tối thiểu:

1. Claim job.
2. Đọc raw file từ S3-compatible storage vào workspace riêng của job.
3. Dùng `ogrinfo` để đọc vector metadata; dùng `gdalinfo` khi phù hợp.
4. Validate format, layer, CRS, geometry và input.
5. Chuẩn hóa bằng `ogr2ogr` theo cấu hình được hỗ trợ.
6. Tạo vector MBTiles/MVT bằng GDAL driver phù hợp.
7. Validate output và tile mẫu.
8. Ghi TileJSON, metadata và build log.
9. Promote artifact từ staging sang version path.
10. Cập nhật job và tileset version thành `ready` hoặc `failed`.

Worker phải chạy process bằng argument array, không ghép input người dùng vào shell command. Chỉ cho phép các tham số GDAL đã được validate/whitelist.

Dùng các đường dẫn bất biến:

```text
/staging/<job-id>/
/tilesets/<tileset-id>/v<version>/data.mbtiles
/tilesets/<tileset-id>/v<version>/tilejson.json
/tilesets/<tileset-id>/v<version>/metadata.json
/tilesets/<tileset-id>/v<version>/build.log
```

Worker chỉ ghi vào staging trong lúc build. Chỉ promote sau khi output hợp lệ. Không ghi đè version đã sẵn sàng. Có xử lý job timeout, lỗi GDAL, retry và artifact mồ côi khi worker bị dừng giữa chừng.

Retry phải giữ lịch sử attempt/lỗi và không làm mất log của lần chạy trước. Chặn retry khi trạng thái không hợp lệ.

## 6. RBAC, ACL và audit

Mở rộng hệ thống authorization hiện có, tiếp tục dùng JWT và user/role từ source. Không tạo hệ thống đăng nhập hoặc role song song.

Bổ sung permission theo convention hiện có:

```text
dataset:read
dataset:upload
dataset:edit
dataset:delete
tileset:read
tileset:build
style:read
style:write
map:read
map:publish
map:manage-access
gis-job:read
gis-job:retry
```

Có thể điều chỉnh tên permission để khớp convention hiện hữu, nhưng phải ghi rõ ánh xạ và dùng nhất quán ở backend, frontend và test.

ACL hỗ trợ subject:

```text
subject_type = user | role | group
subject_id
resource_type
resource_id
action
```

Chỉ hỗ trợ group nếu source có membership model hoặc triển khai đủ membership lookup để kiểm tra thực sự. Không lưu ACL group nhưng bỏ qua việc xác định user thuộc group nào.

Nguyên tắc:

- Deny by default.
- Admin được phép toàn quyền theo mô hình hiện tại.
- RBAC xác định user có được thực hiện loại thao tác đó không.
- ACL xác định user/role/group có quyền trên publication cụ thể không.
- User thường cần cả permission `map:read` và ACL cho publication.
- Mọi endpoint raw, metadata, job, preview, style, TileJSON và tile phải kiểm tra quyền phía backend.
- Ẩn nút hoặc layer ở frontend không thay thế kiểm tra backend.

Ghi audit log cho upload, build, retry, publish/unpublish, grant/revoke ACL. Ghi actor, action, resource, kết quả và thời gian. Không ghi token, password, credential hoặc nội dung nhạy cảm của file vào log.

## 7. API và bảo vệ proxy

Tuân theo router, response schema và naming hiện có. Triển khai đủ các endpoint tương ứng:

```text
POST   /api/admin/datasets
GET    /api/admin/datasets
GET    /api/admin/datasets/{id}
PATCH  /api/admin/datasets/{id}
POST   /api/admin/datasets/{id}/versions
GET    /api/admin/datasets/{id}/versions
GET    /api/admin/datasets/{id}/versions/{version}
GET    /api/admin/datasets/{id}/versions/{version}/download

POST   /api/admin/tilesets
GET    /api/admin/tilesets
GET    /api/admin/tilesets/{id}
POST   /api/admin/tilesets/{id}/build
GET    /api/admin/tilesets/{id}/versions

POST   /api/admin/styles
GET    /api/admin/styles
POST   /api/admin/styles/{id}/versions

POST   /api/admin/maps
GET    /api/admin/maps
GET    /api/admin/maps/{id}
PATCH  /api/admin/maps/{id}
POST   /api/admin/maps/{id}/publish
POST   /api/admin/maps/{id}/unpublish
GET    /api/admin/maps/{id}/acl
PUT    /api/admin/maps/{id}/acl

GET    /api/admin/jobs
GET    /api/admin/jobs/{id}
GET    /api/admin/jobs/{id}/logs
POST   /api/admin/jobs/{id}/retry

GET    /api/maps/catalog
GET    /api/maps/{publicationId}/style
GET    /api/maps/{publicationId}/tilesets/{tilesetId}/versions/{version}/tilejson.json
GET    /api/maps/{publicationId}/tilesets/{tilesetId}/versions/{version}/{z}/{x}/{y}.pbf
```

Nếu source có convention endpoint khác, giữ convention đó nhưng bảo đảm có cùng khả năng.

Catalog chỉ trả publication đã `published` mà user có quyền đọc.

Style, TileJSON và tile phải kiểm tra:

1. User đã xác thực.
2. Publication đang published.
3. User có RBAC permission và ACL `map:read`.
4. Tileset version được yêu cầu thực sự được tham chiếu bởi style version đang active của publication.

Không cho user đổi tileset ID hoặc version trên URL để truy cập tài nguyên ngoài publication đã được cấp quyền.

Trong `be/server.go`, rà soát `/api/tile-catalog` và `/api/tiles/...` hiện có. Không để các route proxy tổng quát trở thành đường vòng bỏ qua ACL. Giữ tương thích với các basemap và chức năng bản đồ đang dùng; phân biệt rõ tile public hiện tại với tileset private do admin quản lý. Mọi request tới tileset private phải qua route có publication context và kiểm tra ACL.

Tile proxy cần streaming, timeout và giữ đúng Content-Type/Content-Encoding theo upstream. Validate publication ID, tileset ID, version và `{z}/{x}/{y}`. Không ghép URL input thành filesystem path. Phân biệt tile rỗng hợp lệ với lỗi proxy.

Dùng status code nhất quán với backend hiện tại; tối thiểu phân biệt unauthenticated, forbidden, not found, invalid input, conflict và upstream failure.

## 8. Publish, style và version

Phase 1 cho phép admin tạo style MapLibre cơ bản hoặc chỉnh Style JSON có validation. Style version phải lưu source binding tới đúng tileset version bất biến.

Không cho style riêng tư tải tile bằng URL trực tiếp đến tile server hoặc URL ngoài do user cung cấp. Không tạo khả năng SSRF qua style JSON.

Publish phải xác nhận:

- Style version hợp lệ.
- Tất cả tileset version đã `ready`.
- Artifact tồn tại và tile server đọc được.
- Tile server đã nhận diện được tileset theo cơ chế thực tế của source.

Chỉ sau khi publish thành công mới chuyển publication sang `published` và cập nhật active style version. Nếu đăng ký/reload tile server lỗi, giữ publication cũ hoạt động và trả lỗi rõ ràng.

Không thay nội dung `v7` khi publish `v8`; chỉ đổi binding active của publication. Có thể rollback bằng cách chọn lại version đã `ready` nếu API hiện tại hỗ trợ.

Tile URL phải có version bất biến, ví dụ:

```text
/api/maps/{publicationId}/tilesets/{tilesetId}/versions/7/{z}/{x}/{y}.pbf
```

## 9. Frontend Admin và MapLibre

Tích hợp vào Admin Console hiện có. Cập nhật navigation, shell, dashboard, routing và i18n tiếng Việt/tiếng Anh theo convention source.

Tạo các màn hình tương ứng:

```text
/admin/data       danh sách, tạo dataset, upload, metadata, version
/admin/tilesets   chọn dataset version/layer, cấu hình build, preview
/admin/maps      publication, style, publish/unpublish, cấp/thu hồi ACL
/admin/jobs      trạng thái, tiến độ, log, lỗi, retry
```

Có thể tổ chức component như sau nếu phù hợp source:

```text
fe/src/admin/gisAdminApi.ts
fe/src/admin/AdminDataPage.tsx
fe/src/admin/AdminTilesetsPage.tsx
fe/src/admin/AdminMapsPage.tsx
fe/src/admin/AdminJobsPage.tsx
fe/src/admin/components/DatasetUploadDialog.tsx
fe/src/admin/components/PublicationAclDialog.tsx
fe/src/admin/components/JobStatusChip.tsx
```

Frontend cần loading, empty, success và error states; hiển thị trạng thái backend thực tế, không dùng mock data.

Cập nhật `MapStyleTool.ts` và `TileServerBaseMapPanel.tsx` hoặc component tương ứng để:

- Fetch catalog từ backend sau login và khi tải/reload ứng dụng.
- Chỉ hiển thị publication được backend trả về.
- Tải style và tile qua API proxy.
- Dùng auth hiện có cho mọi request có bảo vệ.
- Xử lý 401/403 bằng cách thông báo phù hợp và gỡ layer không còn truy cập được.
- Giữ nguyên basemap và công cụ map hiện có.

Catalog và style cá nhân hóa theo quyền nên dùng cache phù hợp để user reload nhận quyền/version mới. Tile private cũng phải kiểm tra quyền trên mỗi request mới. Không cấu hình cache browser dài hạn cho private tile theo cách khiến browser tiếp tục phục vụ tile sau khi ACL bị thu hồi; nếu hỗ trợ cache dài hạn thì chỉ áp dụng cho dữ liệu public hoặc cache có cơ chế authorization/revocation phù hợp.

## 10. Kubernetes và CephFS

Bổ sung manifest theo cấu trúc deployment/ArgoCD hiện có.

PVC `tile-data` hiện tại là `ReadWriteOnce`; không giả định worker và tile server có thể cùng mount PVC đó. Tạo PVC CephFS `ReadWriteMany` riêng:

```text
gis-workspace:
  worker: read-write

gis-published-data:
  worker: read-write
  tile-server: read-only
```

Cấu hình StorageClass qua values/configuration, không hard-code tên storage class nếu repository đã có cơ chế values.

Raw data lớn nằm trong Ceph RGW/S3; CephFS dành cho workspace, staging và MBTiles đã promote. Tile server mount published data chỉ đọc. Browser và người dùng không truy cập trực tiếp CephFS, RGW private bucket hoặc tile server nội bộ.

Tạo deployment cho `gdal-worker`, config/secret cần thiết và quyền PostgreSQL tối thiểu. Không đặt credential trong manifest dạng plain text. Nêu rõ prerequisite để Ceph RGW/CephFS hoạt động; không tự cài hoặc cấu hình cluster Ceph thật.

Nếu worker hoặc tile server cần restart/reload để nhận version mới, triển khai cơ chế phù hợp với tile server hiện có và tài liệu hóa. Không mở tile server ra public ingress/node port.

## 11. Kiểm thử

Viết test cho các luồng quan trọng, theo test framework đang dùng:

- Migration tạo schema và ràng buộc version.
- Permission RBAC và ACL user/role/group/admin.
- Catalog lọc theo published status và ACL.
- URL truy cập trực tiếp style/TileJSON/tile vẫn bị kiểm tra quyền.
- Tile route chỉ cho phép tileset/version thuộc publication.
- Revoke ACL hoặc unpublish chặn request tiếp theo.
- Upload validation, checksum, filename/path traversal và ZIP an toàn.
- Worker claim job không trùng giữa nhiều worker.
- Job thành công, lỗi, timeout và retry.
- Publish lỗi không làm mất publication/version đang hoạt động.
- Version mới không ghi đè artifact cũ.

Tạo fixture GeoJSON nhỏ và smoke test GDAL thật nếu môi trường có GDAL. Nếu không có GDAL/Kubernetes/Ceph trong môi trường, vẫn chạy test khả dụng và nêu chính xác phần nào chưa chạy.

Chạy các lệnh kiểm tra phù hợp repository, tối thiểu:

```text
go test ./...
npm run build:fe
```

Nếu lệnh/script hoặc working directory khác, xác định lệnh thực tế từ source. Không khẳng định test pass nếu chưa chạy.

## 12. Tài liệu và báo cáo hoàn thành

Viết tài liệu hướng dẫn luồng:

```text
upload → validate → build → preview → publish → cấp ACL → user xem map
```

Tài liệu cần nêu migration, cấu hình local, Ceph RGW/CephFS prerequisites, cách chạy worker, GDAL driver cần thiết, cách tile server nhận tileset mới, API chính và troubleshooting.

Chia implementation theo các mốc:

1. Migration/schema và permission.
2. Dataset API, upload và storage.
3. Worker polling PostgreSQL, GDAL build và tileset version.
4. Publication/catalog và ACL.
5. Bảo vệ style/tile proxy hiện tại.
6. Admin UI, MapLibre, deployment, test và tài liệu.

Kết thúc bằng báo cáo ngắn gồm chức năng đã làm, module/file chính, cấu hình/migration cần áp dụng và kết quả test thực tế. Ghi rõ giới hạn hoặc dependency bên ngoài chưa thể xác minh. Không để endpoint giả, màn hình mock hoặc TODO thay cho phần cốt lõi.