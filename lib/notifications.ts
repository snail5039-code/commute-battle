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
  if (localStorage.getItem('petQuiet') === 'true') return;

  try {
    new Notification(title, { body, icon: '/favicon.ico' });
  } catch (error) {
    console.error('OS notification error:', error);
  }
}

const delivered = new Set<string>();

function deliveryKey(key: string) {
  const today = new Intl.DateTimeFormat('en-CA').format(new Date());
  return `commute-notification:${today}:${key}`;
}

export function showRouteNotificationOnce(key: string, title: string, body: string): boolean {
  if (!key || delivered.has(key) || getNotificationPermission() !== 'granted') return false;
  if (localStorage.getItem('petQuiet') === 'true') return false;
  delivered.add(key);
  showOsNotification(title, body);
  return true;
}

export function showPersistentNotificationOnce(key: string, title: string, body: string): boolean {
  if (typeof window === 'undefined' || !key || getNotificationPermission() !== 'granted') return false;
  if (localStorage.getItem('petQuiet') === 'true') return false;
  const storedKey = deliveryKey(key);
  if (localStorage.getItem(storedKey) === 'true') return false;
  localStorage.setItem(storedKey, 'true');
  showOsNotification(title, body);
  return true;
}

export function resetRouteNotifications(): void {
  delivered.clear();
}
