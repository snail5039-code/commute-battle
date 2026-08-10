'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Clock3, MapPin, Navigation } from 'lucide-react';
import { useAppData } from '@/lib/useAppData';
import { summarizeReturnRoute, summarizeWorkClock } from '@/lib/dashboardSummary';
import { loadWorkSchedule, useStore } from '@/lib/store';
import CalendarView from './CalendarView';
import CharacterCard from './CharacterCard';
import CommuteButton from './CommuteButton';
import DashboardCommunityPreview from './DashboardCommunityPreview';
import DashboardSettingsShortcuts from './DashboardSettingsShortcuts';
import StatsSummaryWidget from './StatsSummaryWidget';
import TopBar from './TopBar';

export default function DashBoard() {
  const { user, records, refetch } = useAppData();
  const schedule = useStore((state) => state.workSchedule);
  const setSchedule = useStore((state) => state.setWorkSchedule);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (user) setSchedule(loadWorkSchedule(user.id));
  }, [setSchedule, user]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const clock = useMemo(() => summarizeWorkClock(schedule, now), [schedule, now]);
  const returnRoute = useMemo(() => user ? summarizeReturnRoute(user) : null, [user]);

  if (!user) return null;

  return <div className="flex min-h-screen min-w-0 flex-col">
    <TopBar title="대시보드" subtitle="오늘의 근무와 이동" />
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 md:px-8 md:py-8">
      <div className="grid min-w-0 gap-4 lg:grid-cols-[1fr_2fr] lg:items-start lg:gap-5">
        <CommuteButton user={user} records={records} onChange={refetch} />
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-5">
          <CharacterCard user={user} records={records} />
          <StatsSummaryWidget user={user} records={records} />
          <DashboardSettingsShortcuts />
          <DashboardCommunityPreview />
        </div>
      </div>

      <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:mt-5 lg:gap-5">
        <section className="card p-5" aria-label="오늘의 근무 시간">
          <div className="flex items-center gap-2"><Clock3 size={17} className="text-blue-600"/><h3 className="text-sm font-bold">근무 시간</h3></div>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[["현재 시각", clock.currentTime], ["근무 시작", clock.startTime], ["퇴근 예정", clock.endTime]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 px-2 py-3"><dt className="text-[11px] text-slate-500">{label}</dt><dd className="mt-1 font-mono text-sm font-bold tabular-nums">{value}</dd></div>)}
          </dl>
          <p className="mt-3 text-sm font-semibold text-slate-800">{clock.remainingLabel}</p>
          <p className="mt-1 text-xs text-slate-500">{clock.modeLabel} · 설정에 저장된 오늘의 근무시간 기준</p>
        </section>

        <section className="card min-w-0 p-5" aria-label="퇴근 경로 요약">
          <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Navigation size={17} className="text-indigo-600"/><h3 className="text-sm font-bold">퇴근 경로 요약</h3></div><Link href="/map" className="text-xs font-bold text-blue-700">지도에서 확인</Link></div>
          {!returnRoute?.origin || !returnRoute.destination ? <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">저장된 회사·집 주소가 모두 있어야 퇴근 경로를 요약할 수 있어요. 설정에서 주소를 등록해 주세요.</div> : <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-[1fr_1.4fr]">
            <div className="min-w-0 rounded-xl bg-slate-50 p-4"><p className="flex items-center gap-1 text-xs text-slate-500"><MapPin size={13}/>저장 주소(축약)</p><p className="mt-2 break-words text-sm font-semibold">{returnRoute.origin} → {returnRoute.destination}</p></div>
            {returnRoute.route ? <div className="min-w-0 border border-[var(--border)] bg-[var(--surface-muted)] p-4"><p className="text-xs text-slate-500">{returnRoute.route.source === 'favorite' ? '즐겨찾기한 퇴근 경로' : '최근 선택한 퇴근 경로'}</p><p className="mt-1 truncate text-sm font-bold" title={returnRoute.route.signature}>{returnRoute.route.signature}</p><p className="mt-2 text-xs text-slate-600">예상 {Math.round(returnRoute.route.totalTime)}분 · 도보 {Math.round(returnRoute.route.totalWalk)}m · 환승 {returnRoute.route.transferCount}회</p></div> : <div className="min-w-0 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">아직 저장된 퇴근 경로 기록이 없어요. 퇴근 경로를 선택하거나 즐겨찾기하면 최근 예상 정보가 여기에 표시됩니다.</div>}
          </div>}
        </section>

        <div className="sm:col-span-2"><CalendarView records={records} /></div>
      </div>
    </main>
  </div>;
}
