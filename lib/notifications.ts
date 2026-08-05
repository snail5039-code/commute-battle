export const NOTIFICATION_SETTINGS_STORAGE_KEY = 'commute-battle:notification-settings';

export type NotificationCategory = 'departure' | 'weather' | 'eta' | 'quest';
export type NotificationLeadMinutes = 5 | 10 | 15;

export interface NotificationSettings {
  categories: Record<NotificationCategory, boolean>;
  leadMinutes: NotificationLeadMinutes;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  categories: { departure: true, weather: true, eta: true, quest: true },
  leadMinutes: 10,
};

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

/** Call only from a direct user action such as a button click. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied';
  return Notification.requestPermission();
}

export function loadNotificationSettings(): NotificationSettings {
  if (typeof window === 'undefined') return DEFAULT_NOTIFICATION_SETTINGS;

  try {
    const parsed = JSON.parse(localStorage.getItem(NOTIFICATION_SETTINGS_STORAGE_KEY) ?? '{}') as Partial<NotificationSettings>;
    const leadMinutes = [5, 10, 15].includes(Number(parsed.leadMinutes))
      ? parsed.leadMinutes as NotificationLeadMinutes
      : DEFAULT_NOTIFICATION_SETTINGS.leadMinutes;
    return {
      categories: { ...DEFAULT_NOTIFICATION_SETTINGS.categories, ...parsed.categories },
      leadMinutes,
    };
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

export function saveNotificationSettings(settings: NotificationSettings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(NOTIFICATION_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function clearNotificationData(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(NOTIFICATION_SETTINGS_STORAGE_KEY);
  Object.keys(localStorage)
    .filter((key) => key.startsWith('commute-notification:'))
    .forEach((key) => localStorage.removeItem(key));
  resetRouteNotifications();
}

export function showOsNotification(title: string, body: string): void {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return;
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

export function showArrivalSuggestionOnce(key: string): boolean {
  return showRouteNotificationOnce(
    key,
    '목적지 근처에 도착했어요',
    '도착 반경에 들어왔습니다. 실제 도착했다면 앱에서 도착 버튼을 눌러 기록하세요.',
  );
}
