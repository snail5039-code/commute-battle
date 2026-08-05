'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useAppData } from '@/lib/useAppData';
import { computeMonthlyStats, getStatsFallbackComment } from '@/lib/stats';
import { generateStatsComment } from '@/lib/gemini';
import TopBar from '@/components/TopBar';

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="card p-5"><p className="text-[12px] text-neutral-500">{label}</p><p className="text-2xl font-semibold text-neutral-900 mt-1 tracking-tight">{value}</p>{sub && <p className="text-[11px] text-neutral-400 mt-1">{sub}</p>}</div>;
}

export default function StatsPage() {
  const { user, records, loading } = useAppData();
  const [comment, setComment] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);
  const stats = useMemo(() => computeMonthlyStats(records, now), [records, now]);
  const monthLabel = `${now.getMonth() + 1}월`;

  useEffect(() => {
    if (!user || stats.monthRecords.length === 0) return;
    let cancelled = false;
    generateStatsComment(stats, monthLabel).then((text) => { if (!cancelled) setComment(text); });
    return () => { cancelled = true; };
  }, [user, stats, monthLabel]);

  if (loading) return null;
  if (!user) return <div className="flex flex-col min-h-screen"><TopBar title="통계" /><div className="p-8 text-sm text-neutral-500">게임을 먼저 시작해주세요.</div></div>;

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="통계" subtitle={`${monthLabel} 기록 리포트`} />
      <div className="flex-1 p-4 md:p-8"><div className="max-w-3xl mx-auto space-y-4">
        <div className="card p-5 flex items-start gap-3"><div className="w-8 h-8 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center shrink-0"><Sparkles size={15} /></div><div className="flex-1"><p className="text-[11px] font-semibold text-blue-500 mb-1">기록 코멘트</p><p className="text-[13px] text-neutral-700 leading-relaxed">{comment ?? getStatsFallbackComment(stats)}</p></div></div>
        {stats.monthRecords.length === 0 ? (
          <div className="card px-6 py-12 text-center"><p className="text-[14px] font-medium text-neutral-700">아직 이번 달 기록이 없어요</p><p className="text-[12px] text-neutral-400 mt-2">출근이나 퇴근을 완료하면 횟수와 소요 시간 통계가 여기에 쌓여요.</p></div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatTile label="출근 완료" value={`${stats.commuteArrivals.length}회`} />
            <StatTile label="퇴근 완료" value={`${stats.returnArrivals.length}회`} />
            <StatTile label="왕복 기록" value={`${stats.roundTripDays}일`} sub="같은 날 출근·퇴근 완료" />
            <StatTile label="기록한 날" value={`${stats.activeDays}일`} />
            <StatTile label="휴가·병가" value={`${stats.vacations.length + stats.sickDays.length}일`} />
            <StatTile label="조퇴·결근" value={`${stats.earlyLeaves.length + stats.absences.length}회`} />
            <StatTile label="평균 출근 시간" value={stats.avgCommuteDuration === null ? '기록 없음' : `${stats.avgCommuteDuration}분`} />
            <StatTile label="평균 퇴근 시간" value={stats.avgReturnDuration === null ? '기록 없음' : `${stats.avgReturnDuration}분`} />
            <StatTile label="가장 짧은 이동" value={stats.fastestTripDuration === null ? '기록 없음' : `${stats.fastestTripDuration}분`} sub={`${stats.timedTrips}개의 시간 기록 기준`} />
          </div>
        )}
      </div></div>
    </div>
  );
}
