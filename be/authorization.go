package main

// Permissions are evaluated centrally so endpoints do not need to know the
// implementation details of roles or legacy token scopes.
const (
	permissionMapRead      = "map:read"
	permissionRoute        = "route:calculate"
	permissionAccountRead  = "account:read"
	permissionAccountWrite = "account:write"
	permissionBillingRead  = "billing:read"
	permissionShareRead    = "share:read"
	permissionShareWrite   = "share:write"
	permissionAdminManage  = "admin:manage"
)

var rolePermissions = map[string]map[string]struct{}{
	"user": {
		permissionMapRead: {}, permissionRoute: {}, permissionAccountRead: {},
		permissionAccountWrite: {}, permissionBillingRead: {}, permissionShareRead: {},
		permissionShareWrite: {},
	},
	"admin": {"*": {}},
}

func hasPermission(claims Claims, permission string) bool {
	if hasScope(claims, permission) {
		return true
	}
	permissions, ok := rolePermissions[normalizedRole(claims.Role)]
	if !ok {
		return false
	}
	_, allowed := permissions[permission]
	if allowed {
		return true
	}
	_, allowed = permissions["*"]
	return allowed
}
