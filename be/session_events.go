package main

import "sync"

// SessionEventHub delivers account-change notifications to the browser
// connections for a user. Each controller receives the durable auth event, so
// this in-memory fan-out remains correct when the deployment has many pods.
type SessionEventHub struct {
	mu          sync.Mutex
	subscribers map[string]map[chan struct{}]struct{}
}

func NewSessionEventHub() *SessionEventHub {
	return &SessionEventHub{subscribers: make(map[string]map[chan struct{}]struct{})}
}

func (hub *SessionEventHub) Subscribe(userID string) (<-chan struct{}, func()) {
	updates := make(chan struct{}, 1)
	hub.mu.Lock()
	if hub.subscribers[userID] == nil {
		hub.subscribers[userID] = make(map[chan struct{}]struct{})
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

func (hub *SessionEventHub) Notify(userID string) {
	if userID == "" {
		return
	}
	hub.mu.Lock()
	defer hub.mu.Unlock()
	for subscriber := range hub.subscribers[userID] {
		select {
		case subscriber <- struct{}{}:
		default:
		}
	}
}

func (hub *SessionEventHub) NotifyRevocation(event RevocationEvent) {
	switch event.Type {
	case "UserDisabled", "UserAccessChanged":
		hub.Notify(event.UserID)
	}
}
