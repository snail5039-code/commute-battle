export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission():
  | NotificationPermission
  | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied';
  return Notification.requestPermission();
}

export function showOsNotification(title: string, body: string): void {
  if (!isNotificationSupported()) return;
  if (Notification.permission !== 'granted') return;

  try {
    new Notification(title, { body, icon: '/favicon.ico' });
  } catch (error) {
    console.error('OS notification error:', error);
  }
}

const delivered = new Set<string>();

export function showRouteNotificationOnce(key: string, title: string, body: string): boolean {
  if (!key || delivered.has(key) || getNotificationPermission() !== 'granted') return false;
  delivered.add(key);
  showOsNotification(title, body);
  return true;
}

export function resetRouteNotifications(): void {
  delivered.clear();
}
