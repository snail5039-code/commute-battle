'use client';

import { useMemo } from 'react';
import { AlertTriangle, CalendarDays, Lightbulb, TrendingUp } from 'lucide-react';
import TopBar from '@/components/TopBar';
import { qualitySummary } from '@/lib/dataQuality';
import { computeMonthlyStats, formatMinutesOfDay, getStatsFallbackComment } from '@/lib/stats';
import { useAppData } from '@/lib/useAppData';

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="card p-5"><p className="text-xs text-neutral-500">{label}</p><p className="mt-1 text-2xl font-semibold text-neutral-900">{value}</p>{sub && <p className="mt-1 text-xs text-neutral-400">{sub}</p>}</div>;
}

export default function StatsPage() {
  const { user, records, loading } = useAppData();
  const now = useMemo(() => new Date(), []);
  const stats = useMemo(() => computeMonthlyStats(records, now), [records, now]);
  const issues = qualitySummary(stats.quality);
  if (loading) return null;
  return <div className="flex min-h-screen flex-col">
    <TopBar title="통계" subtitle={`${now.getMonth() + 1}월 기록 리포트`} />
    <div className="flex-1 p-4 md:p-8"><div className="mx-auto max-w-4xl space-y-4">
      {!user ? <div className="card p-8 text-sm text-neutral-500">먼저 게임을 시작해 주세요.</div> : <>
        <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5">
          <p className="text-xs font-semibold text-blue-600">데이터 기반 코치</p><p className="mt-2 text-sm font-medium leading-6 text-neutral-800">{getStatsFallbackComment(stats)}</p>
        </section>
        {issues.length > 0 && <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900"><AlertTriangle className="mt-0.5 shrink-0" size={15}/><p><strong>통계·AI 입력에서 제외:</strong> {issues.join(', ')}. 잘못된 기록이 추천에 영향을 주지 않도록 제외했어요.</p></div>}
        <section className="card p-5">
          <div className="flex items-center gap-2"><CalendarDays size={17} className="text-blue-600"/><h2 className="text-sm font-semibold">최근 7일 리포트</h2></div>
          {stats.weekly.sampleSize ? <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-neutral-50 p-4 text-sm"><p className="text-xs text-neutral-500">평균 · 변동성</p><p className="mt-1 font-semibold">평균 {stats.weekly.averageMinutes}분 · ±{stats.weekly.variabilityMinutes}분</p><p className="mt-2 text-xs text-neutral-500">가장 안정적인 요일: {stats.weekly.stableWeekday ?? '판단 보류'}</p></div>
            <div className="rounded-xl bg-neutral-50 p-4 text-sm"><p className="flex items-center gap-1 text-xs text-neutral-500"><TrendingUp size={13}/>지각 원인 후보</p><p className="mt-1 font-medium">{stats.weekly.lateCauseCandidates.join(', ') || '뚜렷한 후보 없음'}</p><p className="mt-2 flex items-start gap-1 text-xs text-blue-700"><Lightbulb size={13} className="mt-0.5 shrink-0"/>{stats.weekly.actions.join(' · ')}</p></div>
          </div> : <p className="mt-4 text-sm text-neutral-500">최근 7일의 신뢰 가능한 완료 기록이 아직 없어요.</p>}
        </section>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Tile label="출근 완료" value={`${stats.commuteArrivals.length}건`}/><Tile label="퇴근 완료" value={`${stats.returnArrivals.length}건`}/><Tile label="왕복 기록" value={`${stats.roundTripDays}일`}/>
          <Tile label="지각률" value={stats.lateRate === null ? '-' : `${stats.lateRate}%`} sub={`${formatMinutesOfDay(stats.workStartMinutes)} 기준`}/><Tile label="평균 출근" value={stats.avgCommuteDuration === null ? '-' : `${stats.avgCommuteDuration}분`}/><Tile label="평균 퇴근" value={stats.avgReturnDuration === null ? '-' : `${stats.avgReturnDuration}분`}/>
        </div>
      </>}
    </div></div>
  </div>;
}
