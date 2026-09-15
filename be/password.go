package main

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

type passwordParams struct{ memory, time, parallelism, keyLength uint32 }

type PasswordService struct{ params passwordParams }

func NewPasswordService(config Config) PasswordService {
	return PasswordService{params: passwordParams{config.ArgonMemory, config.ArgonTime, config.ArgonParallelism, config.ArgonHashLength}}
}

func (service PasswordService) Hash(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	hash := argon2.IDKey([]byte(password), salt, service.params.time, service.params.memory, uint8(service.params.parallelism), service.params.keyLength)
	return fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s", service.params.memory, service.params.time, service.params.parallelism, base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(hash)), nil
}

func parseHash(encoded string) (passwordParams, []byte, []byte, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" || parts[2] != "v=19" {
		return passwordParams{}, nil, nil, fmt.Errorf("invalid password hash")
	}
	var params passwordParams
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &params.memory, &params.time, &params.parallelism); err != nil || params.memory < 8192 || params.time < 1 || params.parallelism < 1 {
		return passwordParams{}, nil, nil, fmt.Errorf("invalid password hash")
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) < 16 {
		return passwordParams{}, nil, nil, fmt.Errorf("invalid password hash")
	}
	hash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(hash) < 32 {
		return passwordParams{}, nil, nil, fmt.Errorf("invalid password hash")
	}
	params.keyLength = uint32(len(hash))
	return params, salt, hash, nil
}

func (service PasswordService) Verify(encoded, password string) bool {
	params, salt, expected, err := parseHash(encoded)
	if err != nil {
		return false
	}
	actual := argon2.IDKey([]byte(password), salt, params.time, params.memory, uint8(params.parallelism), params.keyLength)
	return subtle.ConstantTimeCompare(expected, actual) == 1
}

func (service PasswordService) NeedsRehash(encoded string) bool {
	params, _, _, err := parseHash(encoded)
	return err != nil || params.memory < service.params.memory || params.time < service.params.time || params.parallelism < service.params.parallelism || params.keyLength < service.params.keyLength
}

func validatePassword(password string) string {
	if len(password) < 8 || len(password) > 128 {
		return "Password must be between 8 and 128 characters."
	}
	var lower, upper, digit bool
	for _, r := range password {
		lower = lower || r >= 'a' && r <= 'z'
		upper = upper || r >= 'A' && r <= 'Z'
		digit = digit || r >= '0' && r <= '9'
	}
	if !lower || !upper || !digit {
		return "Password must include lowercase, uppercase, and a number."
	}
	return ""
}
