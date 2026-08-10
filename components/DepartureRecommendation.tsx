'use client';

import { useEffect, useState } from 'react';
import { Bell, Clock3, ShieldCheck } from 'lucide-react';
import { DepartureRecommendation as Recommendation } from '@/lib/weather';
import { DEFAULT_NOTIFICATION_SETTINGS, getNotificationPermission, loadNotificationSettings, showPersistentNotificationOnce } from '@/lib/notifications';

export default function DepartureRecommendation({ recommendation, compact = false }: { recommendation: Recommendation; compact?: boolean }) {
  // 서버 렌더링 시엔 localStorage가 없어 기본값으로 그리고, 마운트 후에 실제 저장된 설정으로 갈아끼운다
  // (렌더링 중에 바로 읽으면 SSR과 클라이언트 텍스트가 달라져 하이드레이션 오류가 난다).
  const [settings, setSettings] = useState(DEFAULT_NOTIFICATION_SETTINGS);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettings(loadNotificationSettings()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (getNotificationPermission() !== 'granted' || !settings.categories.departure) return;
    const lead = settings.leadMinutes;
    const check = () => {
      const [hours, minutes] = recommendation.departureTime.split(':').map(Number);
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;
      const departure = new Date();
      departure.setHours(hours, minutes, 0, 0);
      const remaining = Math.ceil((departure.getTime() - Date.now()) / 60_000);
      const notice = remaining <= 0 && remaining > -2 ? { key: 'now', title: '지금 출발하세요', body: '추천 출발 시각입니다. 안전하게 이동하세요.' }
        : remaining <= 5 && remaining > 0 && lead > 5 ? { key: '5', title: '출발 5분 전', body: '곧 추천 출발 시각입니다. 마지막 준비를 확인하세요.' }
        : remaining <= lead && remaining > (lead > 5 ? 5 : 0) ? { key: String(lead), title: `출발 ${lead}분 전`, body: `추천 출발 시각이 ${lead}분 이내로 남았습니다.` } : null;
      if (notice) showPersistentNotificationOnce(`departure:${recommendation.departureTime}:${notice.key}`, notice.title, notice.body);
    };
    check();
    const timer = window.setInterval(check, 30_000);
    return () => window.clearInterval(timer);
  }, [recommendation.departureTime, settings]);

  const noticeText = !settings.categories.departure
    ? '출발 알림이 꺼져 있어요. 설정에서 켤 수 있어요.'
    : `알림 허용 시 ${settings.leadMinutes > 5 ? `${settings.leadMinutes}분 전 · ` : ''}5분 전 · 출발 시 안내`;

  return (
    <div className={`border border-[var(--border)] bg-[var(--surface-muted)] ${compact ? 'p-3' : 'p-3.5'}`}>
      <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--brand)]"><Clock3 size={14} />추천 출발</span><strong className="text-lg text-[var(--foreground)]">{recommendation.departureTime}</strong></div>
      <p className="mt-1 text-[10px] text-[var(--brand)]">예상 이동 {recommendation.tripMinutes}분 + 안전 여유 {recommendation.bufferMinutes}분</p>
      <p className="mt-1 flex items-center gap-1 text-[10px] text-[var(--muted)]"><Bell size={10} />{noticeText}</p>
      {!compact && <ul className="mt-2 space-y-1">{recommendation.reasons.map((reason) => <li key={reason} className="flex gap-1.5 text-[10px] text-slate-600"><ShieldCheck size={11} className="mt-0.5 shrink-0 text-indigo-500" />{reason}</li>)}</ul>}
    </div>
  );
}
