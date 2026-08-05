'use client';

import { useEffect } from 'react';
import { Bell, Clock3, ShieldCheck } from 'lucide-react';
import { DepartureRecommendation as Recommendation } from '@/lib/weather';
import { getNotificationPermission, showPersistentNotificationOnce } from '@/lib/notifications';

export default function DepartureRecommendation({ recommendation, compact = false }: { recommendation: Recommendation; compact?: boolean }) {
  useEffect(() => {
    if (getNotificationPermission() !== 'granted') return;
    const check = () => {
      const [hours, minutes] = recommendation.departureTime.split(':').map(Number);
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;
      const departure = new Date();
      departure.setHours(hours, minutes, 0, 0);
      const remaining = Math.ceil((departure.getTime() - Date.now()) / 60_000);
      const notice = remaining <= 0 && remaining > -2 ? { key: 'now', title: '지금 출발하세요', body: '추천 출발 시각입니다. 안전하게 이동하세요.' }
        : remaining <= 5 && remaining > 0 ? { key: '5', title: '출발 5분 전', body: '곧 추천 출발 시각입니다. 마지막 준비를 확인하세요.' }
        : remaining <= 15 && remaining > 5 ? { key: '15', title: '출발 15분 전', body: '추천 출발 시각이 15분 이내로 남았습니다.' } : null;
      if (notice) showPersistentNotificationOnce(`departure:${recommendation.departureTime}:${notice.key}`, notice.title, notice.body);
    };
    check();
    const timer = window.setInterval(check, 30_000);
    return () => window.clearInterval(timer);
  }, [recommendation.departureTime]);

  return (
    <div className={`rounded-xl border border-indigo-100 bg-indigo-50/70 ${compact ? 'p-3' : 'p-3.5'}`}>
      <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-700"><Clock3 size={14} />추천 출발</span><strong className="text-lg text-indigo-950">{recommendation.departureTime}</strong></div>
      <p className="mt-1 text-[10px] text-indigo-700">예상 이동 {recommendation.tripMinutes}분 + 안전 여유 {recommendation.bufferMinutes}분</p>
      <p className="mt-1 flex items-center gap-1 text-[10px] text-indigo-600"><Bell size={10} />알림 허용 시 15분 전 · 5분 전 · 출발 시 안내</p>
      {!compact && <ul className="mt-2 space-y-1">{recommendation.reasons.map((reason) => <li key={reason} className="flex gap-1.5 text-[10px] text-slate-600"><ShieldCheck size={11} className="mt-0.5 shrink-0 text-indigo-500" />{reason}</li>)}</ul>}
    </div>
  );
}
