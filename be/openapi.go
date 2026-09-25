package main

// openAPISpec documents the public HTTP contract. It deliberately lives next
// to the handlers so the browser documentation at /swagger always describes
// the controller version currently running.
func openAPISpec() map[string]any {
	jsonResponse := map[string]any{"200": map[string]any{"description": "Thành công", "content": map[string]any{"application/json": map[string]any{}}}, "401": map[string]any{"description": "Chưa xác thực hoặc token đã hết hạn"}, "403": map[string]any{"description": "Không đủ quyền"}}
	return map[string]any{
		"openapi": "3.0.3",
		"info": map[string]any{
			"title":       "WebGIS Controller API",
			"version":     "1.0.0",
			"description": "API cho xác thực, bản đồ, tìm kiếm, định tuyến và quản trị. Billing hiện là quota usage, không phải thanh toán tiền thật.",
		},
		"servers": []map[string]string{{"url": "/", "description": "Cùng origin với WebGIS"}},
		"tags":    []map[string]string{{"name": "Authentication"}, {"name": "Map"}, {"name": "Billing"}, {"name": "Sharing"}, {"name": "Administration"}},
		"components": map[string]any{
			"securitySchemes": map[string]any{"bearerAuth": map[string]any{"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}},
			"schemas": map[string]any{
				"Error":       map[string]any{"type": "object", "properties": map[string]any{"error": map[string]string{"type": "string"}}},
				"Credentials": map[string]any{"type": "object", "required": []string{"email", "password"}, "properties": map[string]any{"email": map[string]string{"type": "string", "format": "email"}, "password": map[string]string{"type": "string", "format": "password"}}},
				"Billing": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"userId":     map[string]string{"type": "string"},
						"plan":       map[string]string{"type": "string"},
						"limitUnits": map[string]string{"type": "integer"},
						"usedUnits":  map[string]string{"type": "integer"},
						"dailyRequests": map[string]any{
							"type": "array",
							"items": map[string]any{
								"type": "object",
								"properties": map[string]any{
									"date":     map[string]string{"type": "string", "format": "date"},
									"requests": map[string]string{"type": "integer"},
								},
							},
						},
						"apiRequests": map[string]any{
							"type": "array",
							"items": map[string]any{
								"type": "object",
								"properties": map[string]any{
									"api":      map[string]any{"type": "string", "enum": []string{"route", "search"}},
									"requests": map[string]string{"type": "integer"},
								},
							},
						},
					},
				},
			},
		},
		"paths": map[string]any{
			"/health":                map[string]any{"get": operation("Map", "Kiểm tra tình trạng controller", nil, map[string]any{"responses": map[string]any{"200": map[string]any{"description": "Controller sẵn sàng"}}})},
			"/auth/register":         map[string]any{"post": operation("Authentication", "Đăng ký tài khoản", requestBody("Credentials", map[string]any{"name": "Tên hiển thị", "dateOfBirth": "YYYY-MM-DD", "phone": "string", "organization": "string"}), nil)},
			"/auth/login":            map[string]any{"post": operation("Authentication", "Đăng nhập; trả access token và refresh cookie", requestBody("Credentials", nil), nil)},
			"/auth/refresh":          map[string]any{"post": operation("Authentication", "Đổi refresh token lấy access token mới", nil, nil)},
			"/auth/logout":           map[string]any{"post": securedOperation("Authentication", "Đăng xuất phiên hiện tại", nil, nil)},
			"/auth/logout-all":       map[string]any{"post": securedOperation("Authentication", "Thu hồi toàn bộ phiên", nil, nil)},
			"/auth/me":               map[string]any{"get": securedOperation("Authentication", "Xem hồ sơ", nil, nil), "patch": securedOperation("Authentication", "Cập nhật email, điện thoại hoặc avatar", requestBody("Profile", map[string]any{"email": "email", "phone": "string", "avatarUrl": "url"}), nil)},
			"/api/suggestions":       map[string]any{"get": queryOperation("Map", "Gợi ý địa điểm; tính quota search", "q", "Chuỗi tìm kiếm (2–120 ký tự)", nil)},
			"/api/nominatim/search":  map[string]any{"get": queryOperation("Map", "Tìm kiếm Nominatim qua gateway; tính quota search", "q", "Địa điểm cần tìm", nil)},
			"/api/gateway/route":     map[string]any{"post": securedOperation("Map", "Tính tuyến Valhalla; yêu cầu scope route:calculate", requestBody("Route request", map[string]any{"locations": "[{lat, lon}]", "costing": "auto|bicycle|pedestrian"}), nil)},
			"/api/gateway/elevation": map[string]any{"post": securedOperation("Map", "Lấy profile độ cao", requestBody("Elevation request", map[string]any{"shape": "[{lat, lon}]", "resample_distance": "number"}), nil)},
			"/api/shares": map[string]any{
				"post": securedOperation("Sharing", "Create a view-only map snapshot that expires after 30 days", requestBody("Map share", map[string]any{"geojson": map[string]any{"type": "object", "description": "GeoJSON FeatureCollection"}, "map_state": map[string]any{"type": "object", "description": "Selected basemap and overlay dataset IDs"}}), map[string]any{"responses": map[string]any{"201": map[string]string{"description": "Share created"}, "400": map[string]string{"description": "Invalid map snapshot"}, "429": map[string]string{"description": "Active share limit reached"}}}),
				"get":  securedOperation("Sharing", "List active share links owned by the current user", nil, nil),
			},
			"/api/shares/{identifier}": map[string]any{
				"get":    operation("Sharing", "Read a shared GeoJSON snapshot using its public token", nil, map[string]any{"parameters": []map[string]any{{"name": "identifier", "in": "path", "required": true, "description": "Public share token", "schema": map[string]string{"type": "string"}}}}),
				"delete": securedOperation("Sharing", "Revoke a share link owned by the current user", nil, map[string]any{"parameters": []map[string]any{{"name": "identifier", "in": "path", "required": true, "description": "Share id", "schema": map[string]string{"type": "string", "format": "uuid"}}}}),
			},
			"/api/tile-catalog":                        map[string]any{"get": operation("Map", "Đọc catalog Tile Server", nil, nil)},
			"/api/tiles/{path}":                        map[string]any{"get": operation("Map", "Proxy tile server", nil, map[string]any{"parameters": []map[string]any{{"name": "path", "in": "path", "required": true, "schema": map[string]string{"type": "string"}}}})},
			"/api/billing":                             map[string]any{"get": securedOperation("Billing", "Xem quota usage của chính tài khoản", nil, map[string]any{"parameters": []map[string]any{{"name": "range", "in": "query", "schema": map[string]any{"type": "integer", "enum": []int{1, 7, 30}, "default": 7}}}, "responses": map[string]any{"200": map[string]any{"description": "Quota usage", "content": map[string]any{"application/json": map[string]any{"schema": map[string]string{"$ref": "#/components/schemas/Billing"}}}}}})},
			"/api/admin/dashboard":                     map[string]any{"get": adminOperation("Tổng quan tài khoản, online user, độ tuổi và đơn vị", nil)},
			"/api/admin/billing":                       map[string]any{"get": adminOperation("Danh sách quota usage của người dùng", nil)},
			"/api/admin/billing/{userId}":              map[string]any{"get": adminOperation("Chi tiết quota usage một người dùng", map[string]any{"parameters": []map[string]any{{"name": "userId", "in": "path", "required": true, "schema": map[string]string{"type": "string"}}, {"name": "range", "in": "query", "schema": map[string]any{"type": "integer", "enum": []int{1, 7, 30}, "default": 7}}}})},
			"/api/admin/users":                         map[string]any{"get": adminOperation("Danh sách người dùng", nil), "post": adminOperation("Tạo người dùng", requestBody("Create user", map[string]any{"email": "email", "password": "string", "name": "string", "dateOfBirth": "YYYY-MM-DD", "phone": "string", "organization": "string", "role": "user|admin", "status": "ACTIVE|DISABLED|LOCKED", "plan": "string", "limitUnits": "integer"}))},
			"/api/admin/users/{userId}":                map[string]any{"patch": adminOperation("Cập nhật người dùng", requestBody("Update user", map[string]any{"name": "string", "email": "email", "role": "user|admin", "status": "ACTIVE|DISABLED|LOCKED", "plan": "string", "limitUnits": "integer"})), "delete": adminOperation("Xóa người dùng", nil)},
			"/api/admin/users/{userId}/reset-password": map[string]any{"post": adminOperation("Đặt lại mật khẩu tạm và thu hồi các phiên của người dùng", requestBody("Password reset", map[string]any{"newPassword": "string"}))},
			"/api/admin/audit":                         map[string]any{"get": adminOperation("Nhật ký tạo, sửa, xóa người dùng", nil)},
		},
		"x-default-responses": jsonResponse,
	}
}

func operation(tag, summary string, body, extra map[string]any) map[string]any {
	value := map[string]any{"tags": []string{tag}, "summary": summary, "responses": map[string]any{"200": map[string]string{"description": "Thành công"}, "400": map[string]string{"description": "Yêu cầu không hợp lệ"}}}
	if body != nil {
		value["requestBody"] = body
	}
	for key, item := range extra {
		value[key] = item
	}
	return value
}

func securedOperation(tag, summary string, body, extra map[string]any) map[string]any {
	value := operation(tag, summary, body, extra)
	value["security"] = []map[string][]string{{"bearerAuth": {}}}
	return value
}
func adminOperation(summary string, body map[string]any) map[string]any {
	return securedOperation("Administration", summary, body, nil)
}
func queryOperation(tag, summary, name, description string, body map[string]any) map[string]any {
	value := securedOperation(tag, summary, body, nil)
	value["parameters"] = []map[string]any{{"name": name, "in": "query", "required": true, "description": description, "schema": map[string]string{"type": "string"}}}
	return value
}
func requestBody(title string, properties map[string]any) map[string]any {
	if properties == nil {
		properties = map[string]any{}
	}
	schemaProperties := make(map[string]any, len(properties))
	for key, value := range properties {
		if example, ok := value.(string); ok {
			schemaProperties[key] = map[string]any{"type": "string", "example": example}
			continue
		}
		schemaProperties[key] = value
	}
	return map[string]any{"required": true, "content": map[string]any{"application/json": map[string]any{"schema": map[string]any{"type": "object", "title": title, "properties": schemaProperties}}}}
}
