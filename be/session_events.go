package main

import (
	"encoding/json"
	"fmt"
	"io"
	"sync"
)

// SessionEventHub delivers account-change notifications to the browser
// connections for a user. Each controller receives the durable auth event, so
// this in-memory fan-out remains correct when the deployment has many pods.
type SessionEventHub struct {
	mu          sync.Mutex
	subscribers map[string]map[chan browserEvent]struct{}
}

type browserEvent struct {
	Type      string `json:"type"`
	ShareID   string `json:"share_id,omitempty"`
	OwnerName string `json:"owner_name,omitempty"`
}

func NewSessionEventHub() *SessionEventHub {
	return &SessionEventHub{subscribers: make(map[string]map[chan browserEvent]struct{})}
}

func (hub *SessionEventHub) Subscribe(userID string) (<-chan browserEvent, func()) {
	updates := make(chan browserEvent, 8)
	hub.mu.Lock()
	if hub.subscribers[userID] == nil {
		hub.subscribers[userID] = make(map[chan browserEvent]struct{})
	}
	hub.subscribers[userID][updates] = struct{}{}
	hub.mu.Unlock()

	return updates, func() {
		hub.mu.Lock()
		if subscribers := hub.subscribers[userID]; subscribers != nil {
			delete(subscribers, updates)
			if len(subscribers) == 0 {
				delete(hub.subscribers, userID)
			}
		}
		hub.mu.Unlock()
	}
}

func (hub *SessionEventHub) Notify(userID string, event browserEvent) {
	if userID == "" {
		return
	}
	hub.mu.Lock()
	defer hub.mu.Unlock()
	for subscriber := range hub.subscribers[userID] {
		select {
		case subscriber <- event:
		default:
		}
	}
}

func (hub *SessionEventHub) NotifyEvent(event RevocationEvent) {
	switch event.Type {
	case "UserDisabled", "UserAccessChanged":
		hub.Notify(event.UserID, browserEvent{Type: "session-updated"})
	case "ShareReceived":
		hub.Notify(event.UserID, browserEvent{Type: "share-received", ShareID: event.ShareID, OwnerName: event.OwnerName})
	}
}

func writeSSE(response io.Writer, event browserEvent) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(response, "event: %s\ndata: %s\n\n", event.Type, payload)
	return err
}
