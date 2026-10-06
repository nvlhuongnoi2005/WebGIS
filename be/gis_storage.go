package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// RawStorage keeps source files outside PostgreSQL.  The filesystem adapter is
// deliberately useful for local development; the S3 adapter targets Ceph RGW
// and other path-style S3-compatible gateways.
type RawStorage interface {
	Put(context.Context, string, io.Reader) error
	Open(context.Context, string) (io.ReadCloser, error)
	Stat(context.Context, string) (int64, error)
	Delete(context.Context, string) error
}

func newRawStorage(config Config) (RawStorage, error) {
	if config.GISRawStorageDriver == "s3" {
		endpoint, err := url.Parse(config.GISS3Endpoint)
		if err != nil || endpoint.Scheme == "" || endpoint.Host == "" {
			return nil, fmt.Errorf("invalid GIS_S3_ENDPOINT")
		}
		return &s3RawStorage{endpoint: endpoint, region: config.GISS3Region, bucket: config.GISS3Bucket, accessKey: config.GISS3AccessKey, secretKey: config.GISS3SecretKey, client: &http.Client{Timeout: 2 * time.Minute}}, nil
	}
	if err := os.MkdirAll(config.GISRawStoragePath, 0o750); err != nil {
		return nil, err
	}
	return &filesystemRawStorage{root: config.GISRawStoragePath}, nil
}

type filesystemRawStorage struct{ root string }

func safeStoragePath(root, key string) (string, error) {
	if key == "" || strings.HasPrefix(key, "/") || strings.Contains(key, "\\") {
		return "", fmt.Errorf("invalid storage key")
	}
	clean := filepath.Clean(key)
	if clean == "." || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("invalid storage key")
	}
	return filepath.Join(root, clean), nil
}

func (storage *filesystemRawStorage) Put(_ context.Context, key string, source io.Reader) error {
	target, err := safeStoragePath(storage.root, key)
	if err != nil {
		return err
	}
	if err = os.MkdirAll(filepath.Dir(target), 0o750); err != nil {
		return err
	}
	temporary := target + ".uploading"
	file, err := os.OpenFile(temporary, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o640)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(file, source)
	closeErr := file.Close()
	if copyErr != nil {
		_ = os.Remove(temporary)
		return copyErr
	}
	if closeErr != nil {
		_ = os.Remove(temporary)
		return closeErr
	}
	return os.Rename(temporary, target)
}
func (storage *filesystemRawStorage) Open(_ context.Context, key string) (io.ReadCloser, error) {
	target, err := safeStoragePath(storage.root, key)
	if err != nil {
		return nil, err
	}
	return os.Open(target)
}
func (storage *filesystemRawStorage) Stat(_ context.Context, key string) (int64, error) {
	target, err := safeStoragePath(storage.root, key)
	if err != nil {
		return 0, err
	}
	info, err := os.Stat(target)
	if err != nil {
		return 0, err
	}
	return info.Size(), nil
}
func (storage *filesystemRawStorage) Delete(_ context.Context, key string) error {
	target, err := safeStoragePath(storage.root, key)
	if err != nil {
		return err
	}
	return os.Remove(target)
}

type s3RawStorage struct {
	endpoint                             *url.URL
	region, bucket, accessKey, secretKey string
	client                               *http.Client
}

func (storage *s3RawStorage) objectURL(key string) (*url.URL, error) {
	if key == "" || strings.Contains(key, "..") || strings.Contains(key, "\\") {
		return nil, fmt.Errorf("invalid storage key")
	}
	copy := *storage.endpoint
	parts := []string{strings.Trim(copy.EscapedPath(), "/"), url.PathEscape(storage.bucket)}
	for _, segment := range strings.Split(key, "/") {
		if segment == "" || segment == "." || segment == ".." {
			return nil, fmt.Errorf("invalid storage key")
		}
		parts = append(parts, url.PathEscape(segment))
	}
	copy.Path = "/" + strings.Join(parts, "/")
	copy.RawPath = copy.Path
	return &copy, nil
}

func (storage *s3RawStorage) request(ctx context.Context, method, key string, body io.Reader) (*http.Response, error) {
	target, err := storage.objectURL(key)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, method, target.String(), body)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	req.Header.Set("Host", target.Host)
	req.Header.Set("X-Amz-Date", now.Format("20060102T150405Z"))
	req.Header.Set("X-Amz-Content-Sha256", "UNSIGNED-PAYLOAD")
	storage.sign(req, now)
	return storage.client.Do(req)
}

func (storage *s3RawStorage) sign(request *http.Request, now time.Time) {
	date := now.Format("20060102")
	service := "s3"
	signedHeaders := "host;x-amz-content-sha256;x-amz-date"
	canonicalHeaders := "host:" + request.URL.Host + "\n" + "x-amz-content-sha256:" + request.Header.Get("X-Amz-Content-Sha256") + "\n" + "x-amz-date:" + request.Header.Get("X-Amz-Date") + "\n"
	canonical := strings.Join([]string{request.Method, request.URL.EscapedPath(), request.URL.Query().Encode(), canonicalHeaders, signedHeaders, request.Header.Get("X-Amz-Content-Sha256")}, "\n")
	scope := date + "/" + storage.region + "/" + service + "/aws4_request"
	stringToSign := "AWS4-HMAC-SHA256\n" + request.Header.Get("X-Amz-Date") + "\n" + scope + "\n" + hashText(canonical)
	key := hmacSHA256([]byte("AWS4"+storage.secretKey), date)
	key = hmacSHA256(key, storage.region)
	key = hmacSHA256(key, service)
	key = hmacSHA256(key, "aws4_request")
	signature := hex.EncodeToString(hmacSHA256(key, stringToSign))
	request.Header.Set("Authorization", "AWS4-HMAC-SHA256 Credential="+storage.accessKey+"/"+scope+", SignedHeaders="+signedHeaders+", Signature="+signature)
}
func hmacSHA256(key []byte, value string) []byte {
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(value))
	return mac.Sum(nil)
}
func hashText(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func (storage *s3RawStorage) Put(ctx context.Context, key string, source io.Reader) error {
	response, err := storage.request(ctx, http.MethodPut, key, source)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("raw storage upload failed: %s", response.Status)
	}
	return nil
}
func (storage *s3RawStorage) Open(ctx context.Context, key string) (io.ReadCloser, error) {
	response, err := storage.request(ctx, http.MethodGet, key, nil)
	if err != nil {
		return nil, err
	}
	if response.StatusCode != http.StatusOK {
		response.Body.Close()
		return nil, fmt.Errorf("raw storage read failed: %s", response.Status)
	}
	return response.Body, nil
}
func (storage *s3RawStorage) Stat(ctx context.Context, key string) (int64, error) {
	response, err := storage.request(ctx, http.MethodHead, key, nil)
	if err != nil {
		return 0, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("raw storage stat failed: %s", response.Status)
	}
	if response.ContentLength < 0 {
		return 0, fmt.Errorf("raw storage did not report content length")
	}
	return response.ContentLength, nil
}
func (storage *s3RawStorage) Delete(ctx context.Context, key string) error {
	response, err := storage.request(ctx, http.MethodDelete, key, nil)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("raw storage delete failed: %s", response.Status)
	}
	return nil
}
