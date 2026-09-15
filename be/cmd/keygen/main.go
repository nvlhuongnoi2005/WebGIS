package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/x509"
	"encoding/pem"
	"flag"
	"fmt"
	"os"
	"path/filepath"
)

func writePEM(path, kind string, bytes []byte, permission os.FileMode) error {
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, permission)
	if err != nil {
		return err
	}
	defer file.Close()
	return pem.Encode(file, &pem.Block{Type: kind, Bytes: bytes})
}

func main() {
	outputDir := flag.String("out-dir", "deployment/.secrets", "directory for generated PEM files")
	flag.Parse()
	if err := os.MkdirAll(*outputDir, 0700); err != nil {
		panic(err)
	}
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		panic(err)
	}
	privateDER, err := x509.MarshalPKCS8PrivateKey(privateKey)
	if err != nil {
		panic(err)
	}
	publicDER, err := x509.MarshalPKIXPublicKey(publicKey)
	if err != nil {
		panic(err)
	}
	privatePath := filepath.Join(*outputDir, "auth-jwt-private.pem")
	publicPath := filepath.Join(*outputDir, "auth-jwt-public.pem")
	if err := writePEM(privatePath, "PRIVATE KEY", privateDER, 0600); err != nil {
		panic(fmt.Errorf("write private key: %w", err))
	}
	if err := writePEM(publicPath, "PUBLIC KEY", publicDER, 0644); err != nil {
		_ = os.Remove(privatePath)
		panic(fmt.Errorf("write public key: %w", err))
	}
	fmt.Printf("Created %s and %s\n", privatePath, publicPath)
}
