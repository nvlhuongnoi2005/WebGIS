package main

import (
	"bufio"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port                                      string
	DatabaseURL, AppOrigins, Issuer, Audience string
	KeyID, PrivateKeyPEM, PublicKeyPEM        string
	AllowEphemeral                            bool
	AccessTTL, RefreshDays                    int
	RefreshPepper                             string
	SecureCookies                             bool
	ArgonMemory, ArgonTime, ArgonParallelism  uint32
	ArgonHashLength                           uint32
	LoginMaxConcurrent, LoginMaxAttempts      int
	LoginWindowSeconds                        int
	GatewayConsumer, ValhallaURL              string
}

func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	for scanner := bufio.NewScanner(f); scanner.Scan(); {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok || os.Getenv(strings.TrimSpace(key)) != "" {
			continue
		}
		value = strings.Trim(strings.TrimSpace(value), "\"'")
		_ = os.Setenv(strings.TrimSpace(key), strings.ReplaceAll(value, `\n`, "\n"))
	}
}

func env(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func envInt(name string, fallback, minimum int) (int, error) {
	value := env(name, "")
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < minimum {
		return 0, fmt.Errorf("%s must be at least %d", name, minimum)
	}
	return parsed, nil
}

func envBool(name string, fallback bool) bool {
	value := env(name, "")
	if value == "" {
		return fallback
	}
	return strings.EqualFold(value, "true")
}

func loadConfig() (Config, error) {
	loadDotEnv("be/.env")
	loadDotEnv(".env")
	nodeEnv := env("NODE_ENV", "development")
	if nodeEnv != "development" && nodeEnv != "test" && nodeEnv != "production" {
		return Config{}, fmt.Errorf("NODE_ENV must be development, test, or production")
	}
	databaseURL := env("DATABASE_URL", "")
	if databaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required. Set it in be/.env (copy be/.env.example first)")
	}
	accessTTL, err := envInt("AUTH_ACCESS_TOKEN_TTL_SECONDS", 900, 60)
	if err != nil {
		return Config{}, err
	}
	refreshDays, err := envInt("AUTH_REFRESH_TOKEN_TTL_DAYS", 30, 1)
	if err != nil {
		return Config{}, err
	}
	memory, err := envInt("AUTH_ARGON2_MEMORY_KIB", 19456, 8192)
	if err != nil {
		return Config{}, err
	}
	timeCost, err := envInt("AUTH_ARGON2_TIME_COST", 2, 1)
	if err != nil {
		return Config{}, err
	}
	parallelism, err := envInt("AUTH_ARGON2_PARALLELISM", 1, 1)
	if err != nil {
		return Config{}, err
	}
	hashLength, err := envInt("AUTH_ARGON2_HASH_LENGTH", 32, 32)
	if err != nil {
		return Config{}, err
	}
	maxConcurrent, err := envInt("AUTH_LOGIN_MAX_CONCURRENT", 4, 1)
	if err != nil {
		return Config{}, err
	}
	maxAttempts, err := envInt("AUTH_LOGIN_MAX_ATTEMPTS", 10, 1)
	if err != nil {
		return Config{}, err
	}
	window, err := envInt("AUTH_LOGIN_RATE_WINDOW_MS", 60000, 1000)
	if err != nil {
		return Config{}, err
	}
	pepper := env("AUTH_REFRESH_TOKEN_PEPPER", "")
	if pepper == "" {
		if nodeEnv == "production" {
			return Config{}, fmt.Errorf("AUTH_REFRESH_TOKEN_PEPPER is required in production")
		}
		bytes := make([]byte, 32)
		if _, err := rand.Read(bytes); err != nil {
			return Config{}, err
		}
		pepper = base64.RawURLEncoding.EncodeToString(bytes)
	}
	config := Config{
		Port: env("AUTH_PORT", "3001"), DatabaseURL: databaseURL, AppOrigins: env("APP_ORIGINS", "http://localhost:5173"),
		Issuer: env("AUTH_JWT_ISSUER", "auth-service"), Audience: env("AUTH_JWT_AUDIENCE", "api-gateway"), KeyID: env("AUTH_JWT_KID", "dev-1"),
		PrivateKeyPEM: strings.ReplaceAll(env("AUTH_JWT_PRIVATE_KEY", ""), `\n`, "\n"), PublicKeyPEM: strings.ReplaceAll(env("AUTH_JWT_PUBLIC_KEY", ""), `\n`, "\n"),
		AllowEphemeral: envBool("AUTH_DEV_EPHEMERAL_KEYS", false), AccessTTL: accessTTL, RefreshDays: refreshDays, RefreshPepper: pepper,
		SecureCookies: envBool("AUTH_SECURE_COOKIES", nodeEnv == "production"), ArgonMemory: uint32(memory), ArgonTime: uint32(timeCost), ArgonParallelism: uint32(parallelism), ArgonHashLength: uint32(hashLength),
		LoginMaxConcurrent: maxConcurrent, LoginMaxAttempts: maxAttempts, LoginWindowSeconds: window / 1000, GatewayConsumer: env("AUTH_GATEWAY_CONSUMER", "local-gateway-1"), ValhallaURL: strings.TrimRight(env("VALHALLA_INTERNAL_URL", "http://localhost:8002"), "/"),
	}
	if (config.PrivateKeyPEM == "" || config.PublicKeyPEM == "") && !config.AllowEphemeral {
		return Config{}, fmt.Errorf("AUTH_JWT_PRIVATE_KEY and AUTH_JWT_PUBLIC_KEY are required")
	}
	return config, nil
}
