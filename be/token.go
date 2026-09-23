package main

import (
	"crypto/ed25519"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type TokenService struct {
	config     Config
	privateKey ed25519.PrivateKey
	publicKeys map[string]ed25519.PublicKey
}

func parsePrivateKey(value string) (ed25519.PrivateKey, error) {
	block, _ := pem.Decode([]byte(value))
	if block == nil {
		return nil, fmt.Errorf("invalid JWT private key")
	}
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	edKey, ok := key.(ed25519.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("JWT private key must be Ed25519")
	}
	return edKey, nil
}

func parsePublicKey(value string) (ed25519.PublicKey, error) {
	block, _ := pem.Decode([]byte(value))
	if block == nil {
		return nil, fmt.Errorf("invalid JWT public key")
	}
	key, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	edKey, ok := key.(ed25519.PublicKey)
	if !ok {
		return nil, fmt.Errorf("JWT public key must be Ed25519")
	}
	return edKey, nil
}

func NewTokenService(config Config) (*TokenService, error) {
	if config.PrivateKeyPEM != "" && config.PublicKeyPEM != "" {
		privateKey, err := parsePrivateKey(config.PrivateKeyPEM)
		if err != nil {
			return nil, err
		}
		publicKey, err := parsePublicKey(config.PublicKeyPEM)
		if err != nil {
			return nil, err
		}
		publicKeys := map[string]ed25519.PublicKey{config.KeyID: publicKey}
		for _, previous := range config.PreviousPublicKeys {
			key, err := parsePublicKey(previous.PublicKey)
			if err != nil {
				return nil, err
			}
			if _, exists := publicKeys[previous.KeyID]; exists {
				return nil, fmt.Errorf("duplicate JWT key id")
			}
			publicKeys[previous.KeyID] = key
		}
		return &TokenService{config: config, privateKey: privateKey, publicKeys: publicKeys}, nil
	}
	if !config.AllowEphemeral {
		return nil, fmt.Errorf("AUTH_JWT_PRIVATE_KEY and AUTH_JWT_PUBLIC_KEY are required")
	}
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	return &TokenService{config: config, privateKey: privateKey, publicKeys: map[string]ed25519.PublicKey{config.KeyID: publicKey}}, nil
}

func randomURLToken(bytes int) (string, error) {
	buffer := make([]byte, bytes)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}

func (service *TokenService) Issue(user User, sessionID string) (string, int, error) {
	now := time.Now()
	jti, err := randomURLToken(16)
	if err != nil {
		return "", 0, err
	}
	claims := jwt.MapClaims{
		"sub": user.ID, "sid": sessionID, "av": user.AuthVersion, "scope": user.Scopes, "plan": user.Plan, "role": normalizedRole(user.Role), "must_change_password": user.MustChangePassword,
		"iss": service.config.Issuer, "aud": service.config.Audience, "iat": now.Unix(), "exp": now.Add(time.Duration(service.config.AccessTTL) * time.Second).Unix(), "jti": jti,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	token.Header["kid"] = service.config.KeyID
	token.Header["typ"] = "JWT"
	encoded, err := token.SignedString(service.privateKey)
	return encoded, service.config.AccessTTL, err
}

func stringClaim(claims jwt.MapClaims, name string) (string, bool) {
	value, ok := claims[name].(string)
	return value, ok && value != ""
}

func integerClaim(claims jwt.MapClaims, name string) (int, bool) {
	value, ok := claims[name].(float64)
	if !ok || value != float64(int(value)) {
		return 0, false
	}
	return int(value), true
}

func stringSliceClaim(claims jwt.MapClaims, name string) ([]string, bool) {
	value, ok := claims[name].([]interface{})
	if !ok {
		return nil, false
	}
	result := make([]string, len(value))
	for index, item := range value {
		text, ok := item.(string)
		if !ok || text == "" {
			return nil, false
		}
		result[index] = text
	}
	return result, true
}

func (service *TokenService) Verify(encoded string) (Claims, error) {
	parser := jwt.NewParser(jwt.WithValidMethods([]string{jwt.SigningMethodEdDSA.Alg()}), jwt.WithIssuer(service.config.Issuer), jwt.WithAudience(service.config.Audience), jwt.WithExpirationRequired())
	claims := jwt.MapClaims{}
	_, err := parser.ParseWithClaims(encoded, claims, func(token *jwt.Token) (interface{}, error) {
		kid, ok := token.Header["kid"].(string)
		if !ok {
			return nil, fmt.Errorf("invalid token key")
		}
		key, ok := service.publicKeys[kid]
		if !ok {
			return nil, fmt.Errorf("unknown token key")
		}
		return key, nil
	})
	if err != nil {
		return Claims{}, fmt.Errorf("invalid access token")
	}
	sub, ok := stringClaim(claims, "sub")
	if !ok {
		return Claims{}, fmt.Errorf("invalid access token")
	}
	sid, ok := stringClaim(claims, "sid")
	if !ok {
		return Claims{}, fmt.Errorf("invalid access token")
	}
	jti, ok := stringClaim(claims, "jti")
	if !ok {
		return Claims{}, fmt.Errorf("invalid access token")
	}
	version, ok := integerClaim(claims, "av")
	if !ok {
		return Claims{}, fmt.Errorf("invalid access token")
	}
	scopes, ok := stringSliceClaim(claims, "scope")
	if !ok {
		return Claims{}, fmt.Errorf("invalid access token")
	}
	plan, ok := stringClaim(claims, "plan")
	if !ok {
		return Claims{}, fmt.Errorf("invalid access token")
	}
	role := "user"
	if _, exists := claims["role"]; exists {
		var valid bool
		role, valid = stringClaim(claims, "role")
		if !valid || role != "user" && role != "admin" {
			return Claims{}, fmt.Errorf("invalid access token")
		}
	}
	mustChangePassword := false
	if value, exists := claims["must_change_password"]; exists {
		var valid bool
		mustChangePassword, valid = value.(bool)
		if !valid {
			return Claims{}, fmt.Errorf("invalid access token")
		}
	}
	return Claims{Subject: sub, SessionID: sid, TokenID: jti, AuthVersion: version, MustChangePassword: mustChangePassword, Scopes: scopes, Plan: plan, Role: role}, nil
}

func normalizedRole(role string) string {
	if role == "admin" {
		return "admin"
	}
	return "user"
}

func (service *TokenService) CreateRefreshToken() (string, error) { return randomURLToken(48) }

func (service *TokenService) HashRefreshToken(token string) string {
	hash := hmac.New(sha256.New, []byte(service.config.RefreshPepper))
	_, _ = hash.Write([]byte(token))
	return base64.RawURLEncoding.EncodeToString(hash.Sum(nil))
}

func matchesRefreshToken(expected, candidate string) bool {
	return hmac.Equal([]byte(expected), []byte(candidate))
}

func (service *TokenService) PublicJWKS() map[string]any {
	keys := make([]map[string]string, 0, len(service.publicKeys))
	for kid, key := range service.publicKeys {
		keys = append(keys, map[string]string{"kty": "OKP", "crv": "Ed25519", "x": base64.RawURLEncoding.EncodeToString(key), "kid": kid, "alg": "EdDSA", "use": "sig"})
	}
	return map[string]any{"keys": keys}
}

func bearerToken(header string) string {
	if !strings.HasPrefix(header, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
}
