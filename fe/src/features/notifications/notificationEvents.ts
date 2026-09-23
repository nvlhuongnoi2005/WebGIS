export type NotificationKind = "welcome" | "quota" | "share" | "info";

export interface NewNotification {
  kind: NotificationKind;
  titleKey: string;
  descriptionKey: string;
  values?: Record<string, string | number>;
  /** Prevent repeated API failures from filling the notification inbox. */
  dedupeKey?: string;
  actionHref?: string;
  actionLabelKey?: string;
}

export interface AppNotification extends NewNotification {
  id: string;
  createdAt: number;
  read: boolean;
}

type Listener = (notification: NewNotification) => void;

const listeners = new Set<Listener>();

/**
 * Lets non-React code, such as the authenticated fetch client, add an inbox
 * item. A future GeoJSON-sharing flow can use this same function.
 */
export function publishNotification(notification: NewNotification): void {
  listeners.forEach(listener => listener(notification));
}

export function subscribeToNotifications(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
