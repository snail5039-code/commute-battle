'use client';

import { Bell, BellOff, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  clearNotificationData,
  DEFAULT_NOTIFICATION_SETTINGS,
  getNotificationPermission,
  loadNotificationSettings,
  type NotificationCategory,
  type NotificationLeadMinutes,
  requestNotificationPermission,
  saveNotificationSettings,
} from '@/lib/notifications';
import { detectPushCapabilities, unsubscribeFromPush, type PushCapabilities } from '@/lib/pushNotifications';

const CATEGORY_LABELS: Record<NotificationCategory, { title: string; description: string }> = {
  departure: { title: '출발 알림', description: '추천 출발 시각을 알려드려요.' },
  weather: { title: '날씨 알림', description: '출발 전 날씨 변화를 알려드려요.' },
  eta: { title: '도착 예정 알림', description: '예상 도착 시각 변화를 알려드려요.' },
  quest: { title: '퀘스트 알림', description: '진행 중인 퀘스트를 잊지 않게 알려드려요.' },
};

const EMPTY_CAPABILITIES: PushCapabilities = {
  notifications: false,
  serviceWorker: false,
  pushManager: false,
  persistentPushReady: false,
};

export default function NotificationSettingsPanel() {
  const [settings, setSettings] = useState(DEFAULT_NOTIFICATION_SETTINGS);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [capabilities, setCapabilities] = useState(EMPTY_CAPABILITIES);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettings(loadNotificationSettings());
      setPermission(getNotificationPermission());
      setCapabilities(detectPushCapabilities());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function updateCategory(category: NotificationCategory) {
    setSettings((current) => {
      const next = { ...current, categories: { ...current.categories, [category]: !current.categories[category] } };
      saveNotificationSettings(next);
      return next;
    });
  }

  function updateLeadMinutes(leadMinutes: NotificationLeadMinutes) {
    setSettings((current) => {
      const next = { ...current, leadMinutes };
      saveNotificationSettings(next);
      return next;
    });
  }

  async function enableNotifications() {
    const nextPermission = await requestNotificationPermission();
    setPermission(nextPermission);
    setMessage(nextPermission === 'granted' ? '이 브라우저에서 로컬 알림을 허용했습니다.' : '브라우저 설정에서 알림 권한을 허용해 주세요.');
  }

  async function resetAll() {
    await unsubscribeFromPush().catch(() => false);
    clearNotificationData();
    setSettings(DEFAULT_NOTIFICATION_SETTINGS);
    setMessage('푸시 구독과 이 기기에 저장된 알림 설정을 초기화했습니다.');
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4" aria-labelledby="notification-settings-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="notification-settings-title" className="flex items-center gap-2 text-sm font-bold text-neutral-900"><Bell size={16} /> 알림 설정</h2>
          <p className="mt-1 text-xs leading-5 text-neutral-500">현재는 앱이 열린 동안의 로컬 알림만 지원합니다. 앱을 닫으면 알림이 오지 않습니다.</p>
        </div>
        {permission !== 'granted' && (
          <button type="button" onClick={enableNotifications} disabled={!capabilities.notifications} className="shrink-0 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-bold text-white disabled:bg-neutral-300">
            알림 허용
          </button>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {(Object.keys(CATEGORY_LABELS) as NotificationCategory[]).map((category) => (
          <label key={category} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-neutral-50 px-3 py-2.5">
            <span><span className="block text-xs font-bold text-neutral-800">{CATEGORY_LABELS[category].title}</span><span className="text-[11px] text-neutral-500">{CATEGORY_LABELS[category].description}</span></span>
            <input type="checkbox" checked={settings.categories[category]} onChange={() => updateCategory(category)} className="h-4 w-4 accent-emerald-600" />
          </label>
        ))}
      </div>

      <fieldset className="mt-4">
        <legend className="text-xs font-bold text-neutral-700">출발 전 알림</legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {([5, 10, 15] as NotificationLeadMinutes[]).map((minutes) => (
            <button key={minutes} type="button" aria-pressed={settings.leadMinutes === minutes} onClick={() => updateLeadMinutes(minutes)} className={`rounded-lg border px-2 py-2 text-xs font-bold ${settings.leadMinutes === minutes ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-neutral-200 text-neutral-500'}`}>{minutes}분 전</button>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 rounded-xl bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">
        <p className="font-bold">백그라운드 푸시는 아직 연결되지 않았어요.</p>
        <p>무료 Supabase Edge Function과 Web Push 서버를 연결한 뒤에만 브라우저를 닫은 상태의 알림을 지원할 수 있습니다.</p>
        <p className="mt-1 text-amber-700">기능 감지: 알림 {capabilities.notifications ? '지원' : '미지원'} · 서비스 워커 {capabilities.serviceWorker ? '지원' : '미지원'} · PushManager {capabilities.pushManager ? '지원' : '미지원'}</p>
      </div>

      {message && <p role="status" className="mt-3 text-xs text-neutral-600">{message}</p>}
      <button type="button" onClick={resetAll} className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-neutral-500"><RotateCcw size={13} /> 구독 해제 및 로컬 데이터 초기화</button>
      {permission === 'denied' && <p className="mt-2 flex items-center gap-1 text-[11px] text-red-600"><BellOff size={12} /> 알림이 차단되어 있습니다. 브라우저 사이트 설정에서 직접 허용해 주세요.</p>}
    </section>
  );
}
