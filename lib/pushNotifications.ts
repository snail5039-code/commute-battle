export const PUSH_SUBSCRIPTION_STORAGE_KEY = 'commute-battle:push-subscription';

export interface PushCapabilities {
  notifications: boolean;
  serviceWorker: boolean;
  pushManager: boolean;
  persistentPushReady: boolean;
}

export interface SerializedPushSubscription {
  endpoint: string;
  expirationTime: number | null;
  keys: { auth: string; p256dh: string };
}

/** Contract for a future Supabase Edge Function/Web Push adapter. No network call is made here. */
export interface PushSubscriptionTransport {
  save(subscription: SerializedPushSubscription): Promise<void>;
  remove(endpoint: string): Promise<void>;
}

export function detectPushCapabilities(): PushCapabilities {
  if (typeof window === 'undefined') {
    return { notifications: false, serviceWorker: false, pushManager: false, persistentPushReady: false };
  }
  const notifications = 'Notification' in window;
  const serviceWorker = 'serviceWorker' in navigator;
  const pushManager = 'PushManager' in window;
  return {
    notifications,
    serviceWorker,
    pushManager,
    persistentPushReady: notifications && serviceWorker && pushManager,
  };
}

export function serializePushSubscription(subscription: PushSubscription): SerializedPushSubscription {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.auth || !json.keys.p256dh) {
    throw new Error('푸시 구독 정보에 필수 키가 없습니다.');
  }
  return {
    endpoint: json.endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: { auth: json.keys.auth, p256dh: json.keys.p256dh },
  };
}

export function storeSerializedSubscription(subscription: SerializedPushSubscription): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PUSH_SUBSCRIPTION_STORAGE_KEY, JSON.stringify(subscription));
}

export function loadSerializedSubscription(): SerializedPushSubscription | null {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem(PUSH_SUBSCRIPTION_STORAGE_KEY) ?? 'null') as SerializedPushSubscription | null;
  } catch {
    return null;
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  let unsubscribed = false;
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    unsubscribed = subscription ? await subscription.unsubscribe() : false;
  }
  localStorage.removeItem(PUSH_SUBSCRIPTION_STORAGE_KEY);
  return unsubscribed;
}

export function clearStoredPushSubscription(): void {
  if (typeof window !== 'undefined') localStorage.removeItem(PUSH_SUBSCRIPTION_STORAGE_KEY);
}
