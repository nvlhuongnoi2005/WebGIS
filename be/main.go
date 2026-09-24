package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	config, err := loadConfig()
	if err != nil {
		slog.Error("configuration failed", "error", err.Error())
		os.Exit(1)
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	if len(os.Args) == 2 && os.Args[1] == "index-suggestions" {
		if err := runSuggestionIndexer(ctx, config); err != nil {
			slog.Error("suggestion indexing failed", "error", err.Error())
			os.Exit(1)
		}
		slog.Info("suggestion indexing completed")
		return
	}
	repository, err := NewRepository(ctx, config)
	if err != nil {
		slog.Error("database connection failed", "error", err.Error())
		os.Exit(1)
	}
	defer repository.Close()
	if len(os.Args) == 2 && os.Args[1] == "migrate" {
		if err := repository.Migrate(ctx); err != nil {
			slog.Error("migration failed", "error", err.Error())
			os.Exit(1)
		}
		slog.Info("migration completed")
		return
	}
	revocations := NewRevocationStore()
	if err := startRevocationSynchronizer(ctx, repository, revocations, config.GatewayConsumer); err != nil {
		slog.Error("revocation sync failed", "error", err.Error())
		os.Exit(1)
	}
	tokens, err := NewTokenService(config)
	if err != nil {
		slog.Error("token setup failed", "error", err.Error())
		os.Exit(1)
	}
	server, err := NewServer(config, repository, NewPasswordService(config), tokens, revocations)
	if err != nil {
		slog.Error("server setup failed", "error", err.Error())
		os.Exit(1)
	}
	httpServer := &http.Server{
		Addr:              ":" + config.Port,
		Handler:           server,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      35 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	go func() {
		slog.Info("auth gateway listening", "port", config.Port)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("http server failed", "error", err.Error())
			cancel()
		}
	}()
	<-ctx.Done()
	shutdown, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	_ = httpServer.Shutdown(shutdown)
}
