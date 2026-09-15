package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type registerInput struct{ Email, Password, Name, DateOfBirth, Phone, Organization string }
type loginInput struct{ Email, Password string }
type refreshInput struct {
	RefreshToken string `json:"refresh_token"`
}
type changePasswordInput struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}
type profileInput struct {
	Email     *string `json:"email"`
	Phone     *string `json:"phone"`
	AvatarURL *string `json:"avatarUrl"`
}

type Server struct {
	config       Config
	repository   *Repository
	passwords    PasswordService
	tokens       *TokenService
	revocations  *RevocationStore
	loginLimiter *RateLimiter
	loginSlots   chan struct{}
	dummyHash    string
	workerClient *http.Client
}

func NewServer(config Config, repository *Repository, passwords PasswordService, tokens *TokenService, revocations *RevocationStore) (*Server, error) {
	dummyHash, err := passwords.Hash("not-a-real-password-37B2!")
	if err != nil {
		return nil, err
	}
	return &Server{config: config, repository: repository, passwords: passwords, tokens: tokens, revocations: revocations, loginLimiter: NewRateLimiter(time.Duration(config.LoginWindowSeconds)*time.Second, config.LoginMaxAttempts), loginSlots: make(chan struct{}, config.LoginMaxConcurrent), dummyHash: dummyHash, workerClient: &http.Client{Timeout: 30 * time.Second}}, nil
}

func writeJSON(response http.ResponseWriter, status int, body any) {
	response.Header().Set("Content-Type", "application/json; charset=utf-8")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(body)
}
func clientError(response http.ResponseWriter, status int, message string) {
	writeJSON(response, status, map[string]string{"error": message})
}
func unauthorized(response http.ResponseWriter) {
	clientError(response, http.StatusUnauthorized, "Unauthorized")
}

func decodeJSON(request *http.Request, target any) error {
	decoder := json.NewDecoder(io.LimitReader(request.Body, 128*1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("unexpected JSON values")
	}
	return nil
}

func normalizedEmail(value string) (string, bool) {
	value = strings.ToLower(strings.TrimSpace(value))
	if len(value) == 0 || len(value) > 254 {
		return "", false
	}
	address, err := mail.ParseAddress(value)
	return value, err == nil && address.Address == value
}

func remoteIP(request *http.Request) string {
	host, _, err := net.SplitHostPort(request.RemoteAddr)
	if err == nil {
		return host
	}
	return request.RemoteAddr
}
func userAgent(request *http.Request) string {
	value := request.UserAgent()
	if len(value) > 500 {
		return value[:500]
	}
	return value
}

func hasScope(claims Claims, scope string) bool {
	for _, current := range claims.Scopes {
		if current == scope {
			return true
		}
	}
	return false
}

func (server *Server) authenticate(response http.ResponseWriter, request *http.Request, scopes ...string) (Claims, bool) {
	if !server.revocations.Ready() {
		clientError(response, http.StatusServiceUnavailable, "Authentication temporarily unavailable")
		return Claims{}, false
	}
	claims, err := server.tokens.Verify(bearerToken(request.Header.Get("Authorization")))
	if err != nil || server.revocations.Rejects(claims) {
		unauthorized(response)
		return Claims{}, false
	}
	for _, scope := range scopes {
		if !hasScope(claims, scope) {
			clientError(response, http.StatusForbidden, "Forbidden")
			return Claims{}, false
		}
	}
	return claims, true
}

func cookieOptions(server *Server, maxAge int) *http.Cookie {
	return &http.Cookie{Name: "refresh_token", HttpOnly: true, Secure: server.config.SecureCookies, SameSite: http.SameSiteStrictMode, Path: "/auth", MaxAge: maxAge}
}
func (server *Server) setRefreshCookies(response http.ResponseWriter, token string) {
	cookie := cookieOptions(server, server.config.RefreshDays*86400)
	cookie.Value = token
	http.SetCookie(response, cookie)
	http.SetCookie(response, &http.Cookie{Name: "csrf_token", Value: newRequestID(), Secure: server.config.SecureCookies, SameSite: http.SameSiteStrictMode, Path: "/", MaxAge: server.config.RefreshDays * 86400})
}
func (server *Server) clearRefreshCookies(response http.ResponseWriter) {
	http.SetCookie(response, cookieOptions(server, -1))
	http.SetCookie(response, &http.Cookie{Name: "csrf_token", Value: "", Secure: server.config.SecureCookies, SameSite: http.SameSiteStrictMode, Path: "/", MaxAge: -1})
}
func newRequestID() string {
	value, err := randomURLToken(16)
	if err != nil {
		return "unavailable"
	}
	return value
}

func csrfValid(request *http.Request) bool {
	cookie, err := request.Cookie("csrf_token")
	if err != nil {
		return false
	}
	header := request.Header.Get("X-CSRF-Token")
	return header != "" && len(cookie.Value) == len(header) && subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(header)) == 1
}

func (server *Server) issueLoginResponse(response http.ResponseWriter, user User, sessionID, refreshToken string) {
	access, expiresIn, err := server.tokens.Issue(user, sessionID)
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	server.setRefreshCookies(response, refreshToken)
	writeJSON(response, 200, map[string]any{"access_token": access, "token_type": "Bearer", "expires_in": expiresIn, "user": publicUser(user)})
}

func (server *Server) register(response http.ResponseWriter, request *http.Request) {
	var input registerInput
	if decodeJSON(request, &input) != nil {
		clientError(response, 400, "Invalid registration request")
		return
	}
	email, valid := normalizedEmail(input.Email)
	if !valid || validatePassword(input.Password) != "" || len(strings.TrimSpace(input.Name)) > 120 || len(input.Phone) > 32 || len(input.Organization) > 160 {
		clientError(response, 400, "Invalid registration request")
		return
	}
	if input.DateOfBirth != "" {
		if _, err := time.Parse("2006-01-02", input.DateOfBirth); err != nil {
			clientError(response, 400, "Invalid registration request")
			return
		}
	}
	hash, err := server.passwords.Hash(input.Password)
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	ctx := request.Context()
	tx, err := server.repository.pool.Begin(ctx)
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	defer tx.Rollback(ctx)
	if _, err := server.repository.UserByEmail(ctx, tx, email); err == nil {
		clientError(response, 409, "Email is already registered")
		return
	} else if !errors.Is(err, pgx.ErrNoRows) {
		clientError(response, 500, "Internal server error")
		return
	}
	input.Email = email
	input.Name = strings.TrimSpace(input.Name)
	user, err := server.repository.CreateUser(ctx, tx, email, hash, input)
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	_, err = tx.Exec(ctx, `INSERT INTO user_quotas (user_id,period_start,period_end,limit_units) VALUES ($1,date_trunc('month',now()),date_trunc('month',now()) + interval '1 month',1000)`, user.ID)
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	writeJSON(response, 201, map[string]any{"user": publicUser(user)})
}

func (server *Server) login(response http.ResponseWriter, request *http.Request) {
	var input loginInput
	if decodeJSON(request, &input) != nil {
		clientError(response, 400, "Invalid credentials")
		return
	}
	email, valid := normalizedEmail(input.Email)
	if !valid || len(input.Password) == 0 || len(input.Password) > 128 {
		clientError(response, 400, "Invalid credentials")
		return
	}
	if !server.loginLimiter.Allow("ip:"+remoteIP(request)) || !server.loginLimiter.Allow("identity:"+email) {
		clientError(response, 429, "Too many attempts. Try again later.")
		return
	}
	select {
	case server.loginSlots <- struct{}{}:
		defer func() { <-server.loginSlots }()
	case <-request.Context().Done():
		clientError(response, 503, "Authentication temporarily unavailable")
		return
	}
	ctx := request.Context()
	user, err := server.repository.UserByEmail(ctx, server.repository.pool, email)
	hash := server.dummyHash
	if err == nil {
		hash = user.PasswordHash
	}
	validPassword := server.passwords.Verify(hash, input.Password)
	if err != nil || !validPassword || user.Status != "ACTIVE" {
		clientError(response, 401, "Invalid credentials")
		return
	}
	if server.passwords.NeedsRehash(user.PasswordHash) {
		if upgraded, hashErr := server.passwords.Hash(input.Password); hashErr == nil {
			_, _ = server.repository.pool.Exec(ctx, `UPDATE users SET password_hash=$1 WHERE id=$2`, upgraded, user.ID)
		}
	}
	refresh, err := server.tokens.CreateRefreshToken()
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	tx, err := server.repository.pool.Begin(ctx)
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	defer tx.Rollback(ctx)
	session, err := server.repository.CreateSession(ctx, tx, user.ID, server.tokens.HashRefreshToken(refresh), userAgent(request), remoteIP(request), time.Now().AddDate(0, 0, server.config.RefreshDays))
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	if _, err = tx.Exec(ctx, `UPDATE users SET last_login_at=now() WHERE id=$1`, user.ID); err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	if err = tx.Commit(ctx); err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	slog.Info("login_success", "user_id", user.ID, "request_id", request.Header.Get("X-Request-Id"))
	server.issueLoginResponse(response, user, session.ID, refresh)
}

func (server *Server) refresh(response http.ResponseWriter, request *http.Request) {
	var input refreshInput
	_ = decodeJSON(request, &input)
	token := input.RefreshToken
	fromCookie := false
	if token == "" {
		if cookie, err := request.Cookie("refresh_token"); err == nil {
			token = cookie.Value
			fromCookie = true
		}
	}
	if token == "" || (fromCookie && !csrfValid(request)) {
		unauthorized(response)
		return
	}
	ctx := request.Context()
	hash := server.tokens.HashRefreshToken(token)
	tx, err := server.repository.pool.Begin(ctx)
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	defer tx.Rollback(ctx)
	session, sessionErr := server.repository.SessionForRefresh(ctx, tx, hash)
	if sessionErr != nil {
		sid, uid, historyErr := server.repository.RefreshHistory(ctx, tx, hash)
		if historyErr == nil {
			_, _ = tx.Exec(ctx, `UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1`, sid)
			event := RevocationEvent{Type: "SessionRevoked", SessionID: sid, UserID: uid, Timestamp: time.Now().UTC().Format(time.RFC3339Nano)}
			if err := server.repository.Publish(ctx, tx, event); err == nil {
				server.revocations.Apply(event)
			}
		}
		_ = tx.Commit(ctx)
		server.clearRefreshCookies(response)
		unauthorized(response)
		return
	}
	if !matchesRefreshToken(session.RefreshTokenHash, hash) || session.RevokedAt != nil || !session.ExpiresAt.After(time.Now()) {
		server.clearRefreshCookies(response)
		unauthorized(response)
		return
	}
	user, err := server.repository.UserByID(ctx, tx, session.UserID)
	if err != nil || user.Status != "ACTIVE" {
		server.clearRefreshCookies(response)
		unauthorized(response)
		return
	}
	next, err := server.tokens.CreateRefreshToken()
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	if err = server.repository.RotateRefresh(ctx, tx, session, server.tokens.HashRefreshToken(next)); err != nil {
		clientError(response, 401, "Unauthorized")
		return
	}
	if err = tx.Commit(ctx); err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	server.issueLoginResponse(response, user, session.ID, next)
}

func (server *Server) logout(response http.ResponseWriter, request *http.Request, all bool) {
	claims, ok := server.authenticate(response, request)
	if !ok {
		return
	}
	ctx := request.Context()
	tx, err := server.repository.pool.Begin(ctx)
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	defer tx.Rollback(ctx)
	if all {
		if _, err = tx.Exec(ctx, `UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1 AND revoked_at IS NULL`, claims.Subject); err != nil {
			clientError(response, 500, "Internal server error")
			return
		}
		var version int
		if err = tx.QueryRow(ctx, `UPDATE users SET auth_version=auth_version+1 WHERE id=$1 RETURNING auth_version`, claims.Subject).Scan(&version); err != nil {
			clientError(response, 500, "Internal server error")
			return
		}
		event := RevocationEvent{Type: "UserSessionsRevoked", UserID: claims.Subject, AuthVersion: version, Timestamp: time.Now().UTC().Format(time.RFC3339Nano)}
		if err = server.repository.Publish(ctx, tx, event); err != nil {
			clientError(response, 500, "Internal server error")
			return
		}
		server.revocations.Apply(event)
	} else {
		var userID string
		err = tx.QueryRow(ctx, `UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 RETURNING user_id`, claims.SessionID).Scan(&userID)
		if err == nil {
			event := RevocationEvent{Type: "SessionRevoked", SessionID: claims.SessionID, UserID: userID, Timestamp: time.Now().UTC().Format(time.RFC3339Nano)}
			if err = server.repository.Publish(ctx, tx, event); err != nil {
				clientError(response, 500, "Internal server error")
				return
			}
			server.revocations.Apply(event)
		} else if !errors.Is(err, pgx.ErrNoRows) {
			clientError(response, 500, "Internal server error")
			return
		}
	}
	if err = tx.Commit(ctx); err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	server.clearRefreshCookies(response)
	response.WriteHeader(http.StatusNoContent)
}

func (server *Server) changePassword(response http.ResponseWriter, request *http.Request) {
	claims, ok := server.authenticate(response, request)
	if !ok {
		return
	}
	var input changePasswordInput
	if decodeJSON(request, &input) != nil || validatePassword(input.NewPassword) != "" {
		clientError(response, 400, "Invalid password change request")
		return
	}
	ctx := request.Context()
	user, err := server.repository.UserByID(ctx, server.repository.pool, claims.Subject)
	if err != nil || user.Status != "ACTIVE" || !server.passwords.Verify(user.PasswordHash, input.CurrentPassword) {
		clientError(response, 401, "Invalid credentials")
		return
	}
	nextHash, err := server.passwords.Hash(input.NewPassword)
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	tx, err := server.repository.pool.Begin(ctx)
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1 AND revoked_at IS NULL`, user.ID); err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	var version int
	if err = tx.QueryRow(ctx, `UPDATE users SET password_hash=$1,auth_version=auth_version+1 WHERE id=$2 RETURNING auth_version`, nextHash, user.ID).Scan(&version); err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	event := RevocationEvent{Type: "PasswordChanged", UserID: user.ID, AuthVersion: version, Timestamp: time.Now().UTC().Format(time.RFC3339Nano)}
	if err = server.repository.Publish(ctx, tx, event); err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	if err = tx.Commit(ctx); err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	server.revocations.Apply(event)
	server.clearRefreshCookies(response)
	slog.Info("password_changed", "user_id", user.ID)
	response.WriteHeader(http.StatusNoContent)
}

func (server *Server) profile(response http.ResponseWriter, request *http.Request, update bool) {
	claims, ok := server.authenticate(response, request)
	if !ok {
		return
	}
	ctx := request.Context()
	if !update {
		user, err := server.repository.UserByID(ctx, server.repository.pool, claims.Subject)
		if err != nil || user.Status != "ACTIVE" {
			unauthorized(response)
			return
		}
		writeJSON(response, 200, map[string]any{"user": publicUser(user)})
		return
	}
	var input profileInput
	if decodeJSON(request, &input) != nil || (input.Email == nil && input.Phone == nil && input.AvatarURL == nil) {
		clientError(response, 400, "Invalid profile update")
		return
	}
	if input.Email != nil {
		email, valid := normalizedEmail(*input.Email)
		if !valid {
			clientError(response, 400, "Invalid profile update")
			return
		}
		input.Email = &email
	}
	if input.Phone != nil && len(*input.Phone) > 32 || input.AvatarURL != nil && len(*input.AvatarURL) > 1_000_000 {
		clientError(response, 400, "Invalid profile update")
		return
	}
	user, err := scanUser(server.repository.pool.QueryRow(ctx, `UPDATE users SET email=COALESCE($1,email),phone=COALESCE($2,phone),avatar_url=COALESCE($3,avatar_url) WHERE id=$4 RETURNING `+userColumns, input.Email, input.Phone, input.AvatarURL, claims.Subject))
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") {
			clientError(response, 409, "Email is already registered")
		} else {
			clientError(response, 500, "Internal server error")
		}
		return
	}
	writeJSON(response, 200, map[string]any{"user": publicUser(user)})
}

func (server *Server) route(response http.ResponseWriter, request *http.Request) {
	claims, ok := server.authenticate(response, request, "route:calculate")
	if !ok {
		return
	}
	ctx := request.Context()
	quota, err := server.repository.pool.Exec(ctx, `UPDATE user_quotas SET used_units=used_units+1,updated_at=now() WHERE user_id=$1 AND period_start<=now() AND period_end>now() AND used_units+1<=limit_units`, claims.Subject)
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	if quota.RowsAffected() != 1 {
		clientError(response, 429, "Quota exceeded")
		return
	}
	body, err := io.ReadAll(io.LimitReader(request.Body, 128*1024))
	if err != nil {
		clientError(response, 400, "Invalid route request")
		return
	}
	workerRequest, err := http.NewRequestWithContext(ctx, http.MethodPost, server.config.ValhallaURL+"/route", strings.NewReader(string(body)))
	if err != nil {
		clientError(response, 502, "Worker unavailable")
		return
	}
	workerRequest.Header.Set("Content-Type", "application/json")
	workerRequest.Header.Set("X-Internal-User-Id", claims.Subject)
	workerRequest.Header.Set("X-Internal-Session-Id", claims.SessionID)
	workerRequest.Header.Set("X-Internal-Scopes", strings.Join(claims.Scopes, " "))
	workerRequest.Header.Set("X-Internal-Plan", claims.Plan)
	workerRequest.Header.Set("X-Request-Id", request.Header.Get("X-Request-Id"))
	workerResponse, err := server.workerClient.Do(workerRequest)
	if err != nil {
		clientError(response, 502, "Worker unavailable")
		return
	}
	defer workerResponse.Body.Close()
	response.Header().Set("Content-Type", workerResponse.Header.Get("Content-Type"))
	response.WriteHeader(workerResponse.StatusCode)
	_, _ = io.Copy(response, io.LimitReader(workerResponse.Body, 10*1024*1024))
}

func (server *Server) disableUser(response http.ResponseWriter, request *http.Request, userID string) {
	_, ok := server.authenticate(response, request, "admin:manage-users")
	if !ok {
		return
	}
	ctx := request.Context()
	tx, err := server.repository.pool.Begin(ctx)
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	defer tx.Rollback(ctx)
	var version int
	err = tx.QueryRow(ctx, `UPDATE users SET status='DISABLED',auth_version=auth_version+1 WHERE id=$1 AND status <> 'DISABLED' RETURNING auth_version`, userID).Scan(&version)
	if errors.Is(err, pgx.ErrNoRows) {
		clientError(response, 404, "User not found")
		return
	}
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	event := RevocationEvent{Type: "UserDisabled", UserID: userID, AuthVersion: version, Timestamp: time.Now().UTC().Format(time.RFC3339Nano)}
	if err = server.repository.Publish(ctx, tx, event); err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	if err = tx.Commit(ctx); err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	server.revocations.Apply(event)
	response.WriteHeader(http.StatusNoContent)
}

func (server *Server) cors(response http.ResponseWriter, request *http.Request) bool {
	origin := request.Header.Get("Origin")
	if origin == "" {
		return true
	}
	allowed := false
	for _, value := range strings.Split(server.config.AppOrigins, ",") {
		if strings.TrimSpace(value) == origin {
			allowed = true
			break
		}
	}
	if !allowed {
		clientError(response, http.StatusForbidden, "Origin not allowed")
		return false
	}
	response.Header().Set("Access-Control-Allow-Origin", origin)
	response.Header().Set("Access-Control-Allow-Credentials", "true")
	response.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-CSRF-Token, X-Request-Id")
	response.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
	return true
}

func (server *Server) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	requestID := newRequestID()
	request.Header.Set("X-Request-Id", requestID)
	response.Header().Set("X-Request-Id", requestID)
	response.Header().Set("X-Content-Type-Options", "nosniff")
	if !server.cors(response, request) {
		return
	}
	if request.Method == http.MethodOptions {
		response.WriteHeader(http.StatusNoContent)
		return
	}
	switch {
	case request.Method == http.MethodGet && request.URL.Path == "/health":
		if server.revocations.Ready() {
			writeJSON(response, 200, map[string]bool{"ok": true})
		} else {
			writeJSON(response, 503, map[string]bool{"ok": false})
		}
	case request.Method == http.MethodGet && request.URL.Path == "/auth/.well-known/jwks.json":
		writeJSON(response, 200, server.tokens.PublicJWKS())
	case request.Method == http.MethodPost && request.URL.Path == "/auth/register":
		server.register(response, request)
	case request.Method == http.MethodPost && request.URL.Path == "/auth/login":
		server.login(response, request)
	case request.Method == http.MethodPost && request.URL.Path == "/auth/refresh":
		server.refresh(response, request)
	case request.Method == http.MethodPost && request.URL.Path == "/auth/logout":
		server.logout(response, request, false)
	case request.Method == http.MethodPost && request.URL.Path == "/auth/logout-all":
		server.logout(response, request, true)
	case request.Method == http.MethodPost && request.URL.Path == "/auth/change-password":
		server.changePassword(response, request)
	case request.Method == http.MethodGet && request.URL.Path == "/auth/me":
		server.profile(response, request, false)
	case request.Method == http.MethodPatch && request.URL.Path == "/auth/me":
		server.profile(response, request, true)
	case request.Method == http.MethodPost && request.URL.Path == "/api/gateway/route":
		server.route(response, request)
	case request.Method == http.MethodGet && request.URL.Path == "/api/gateway/map":
		if claims, ok := server.authenticate(response, request, "map:read"); ok {
			writeJSON(response, 200, map[string]any{"user_id": claims.Subject, "plan": claims.Plan, "request_id": request.Header.Get("X-Request-Id")})
		}
	case request.Method == http.MethodPost && strings.HasPrefix(request.URL.Path, "/api/admin/users/") && strings.HasSuffix(request.URL.Path, "/disable"):
		userID := strings.TrimSuffix(strings.TrimPrefix(request.URL.Path, "/api/admin/users/"), "/disable")
		if userID == "" || strings.Contains(userID, "/") {
			clientError(response, 400, "Invalid user id")
		} else {
			server.disableUser(response, request, userID)
		}
	default:
		clientError(response, 404, "Not found")
	}
}

func (server *Server) Shutdown(context.Context) error { return nil }
