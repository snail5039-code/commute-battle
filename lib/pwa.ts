'use client';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type PwaPlatform = 'ios' | 'android' | 'desktop' | 'other';
export type InstallResult = 'accepted' | 'dismissed' | 'unavailable';

export interface PwaSnapshot {
  canPrompt: boolean;
  installed: boolean;
  platform: PwaPlatform;
}

const SERVER_SNAPSHOT: PwaSnapshot = { canPrompt: false, installed: false, platform: 'other' };
let snapshot = SERVER_SNAPSHOT;
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;
const listeners = new Set<() => void>();

function detectPlatform(): PwaPlatform {
  const userAgent = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(userAgent)) return 'ios';
  if (/android/.test(userAgent)) return 'android';
  if (/windows|macintosh|linux|cros/.test(userAgent)) return 'desktop';
  return 'other';
}

function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

function publish(next: Partial<PwaSnapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((listener) => listener());
}

export function initializePwaInstall() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  snapshot = { canPrompt: false, installed: isInstalled(), platform: detectPlatform() };

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    publish({ canPrompt: true });
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    publish({ canPrompt: false, installed: true });
  });
}

export function subscribePwa(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPwaSnapshot() {
  return snapshot;
}

export function getPwaServerSnapshot() {
  return SERVER_SNAPSHOT;
}

export async function requestPwaInstall(): Promise<InstallResult> {
  const event = deferredPrompt;
  if (!event) return 'unavailable';

  // A BeforeInstallPromptEvent is single-use. Clear it before awaiting so a
  // second click cannot call prompt() on an already consumed event.
  deferredPrompt = null;
  publish({ canPrompt: false });
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'accepted') publish({ installed: true });
    return outcome;
  } catch {
    return 'unavailable';
  }
}
