package main

import (
	"sync"
	"time"
)

type attemptBucket struct {
	started time.Time
	count   int
}
type RateLimiter struct {
	mu      sync.Mutex
	buckets map[string]attemptBucket
	window  time.Duration
	max     int
}

func NewRateLimiter(window time.Duration, max int) *RateLimiter {
	return &RateLimiter{buckets: map[string]attemptBucket{}, window: window, max: max}
}
func (limiter *RateLimiter) Allow(key string) bool {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	now := time.Now()
	bucket := limiter.buckets[key]
	if bucket.started.IsZero() || now.Sub(bucket.started) >= limiter.window {
		limiter.buckets[key] = attemptBucket{started: now, count: 1}
		return true
	}
	if bucket.count >= limiter.max {
		return false
	}
	bucket.count++
	limiter.buckets[key] = bucket
	return true
}
