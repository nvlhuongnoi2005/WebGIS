package main

import "testing"

func TestRolePermissions(t *testing.T) {
	user := Claims{Role: "user"}
	if !hasPermission(user, permissionShareWrite) || !hasPermission(user, permissionBillingRead) {
		t.Fatal("user role is missing an assigned permission")
	}
	if hasPermission(user, permissionAdminManage) {
		t.Fatal("user role must not manage administration")
	}
	if !hasPermission(Claims{Role: "admin"}, permissionAdminManage) {
		t.Fatal("admin role must manage administration")
	}
	if !hasPermission(Claims{Role: "user", Scopes: []string{"custom:read"}}, "custom:read") {
		t.Fatal("legacy token scopes must remain supported")
	}
}
