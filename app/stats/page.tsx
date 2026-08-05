'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock3, Lightbulb, Sparkles } from 'lucide-react';
import { useAppData } from '@/lib/useAppData';
import {
  computeMonthlyStats,
  formatMinutesOfDay,
  getStatsFallbackComment,
} from '@/lib/stats';
import { generateStatsComment } from '@/lib/gemini';
import TopBar from '@/components/TopBar';

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-5">
      <p className="text-[12px] text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">{value}</p>
      {sub && <p className="mt-1 text-[11px] leading-relaxed text-neutral-400">{sub}</p>}
    </div>
  );
}

export default function StatsPage() {
  const { user, records, loading } = useAppData();
  const [comment, setComment] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);
  const stats = useMemo(() => computeMonthlyStats(records, now), [records, now]);
  const monthLabel = `${now.getMonth() + 1}월`;
  const hasQualityNotice =
    stats.incompleteCommutes + stats.invalidArrivalTimes + stats.excludedDurationCount > 0;

  useEffect(() => {
    if (!user || stats.monthRecords.length === 0) return;
    let cancelled = false;
    generateStatsComment(stats, monthLabel).then((text) => {
      if (!cancelled) setComment(text);
    });
    return () => {
      cancelled = true;
    };
  }, [user, stats, monthLabel]);

  if (loading) return null;
  if (!user) {
    return (
      <div className="flex min-h-screen flex-col">
        <TopBar title="통계" />
        <div className="p-8 text-sm text-neutral-500">게임을 먼저 시작해 주세요.</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar title="통계" subtitle={`${monthLabel} 기록 리포트`} />
      <div className="flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-3xl space-y-4">
          <section className="overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 shadow-sm">
            <div className="flex items-start gap-3 p-5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                <Sparkles size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-600">AI 기록 코치</p>
                <p className="mt-1 text-[14px] font-medium leading-relaxed text-neutral-800">
                  {comment ?? getStatsFallbackComment(stats)}
                </p>
              </div>
            </div>
            {stats.evaluatedCommutes > 0 && (
              <div className="grid grid-cols-2 border-t border-blue-100/80 bg-white/60">
                <div className="p-4">
                  <p className="flex items-center gap-1.5 text-[11px] text-neutral-500"><Clock3 size={13} />핵심 지표</p>
                  <p className="mt-1 text-lg font-semibold text-neutral-900">지각률 {stats.lateRate}%</p>
                </div>
                <div className="border-l border-blue-100/80 p-4">
                  <p className="flex items-center gap-1.5 text-[11px] text-neutral-500"><Lightbulb size={13} />짧은 제안</p>
                  <p className="mt-1 text-[13px] font-medium text-neutral-800">
                    {stats.lateCount > 0 ? `평균 ${stats.avgLateMinutes}분 일찍 출발` : '지금 리듬을 유지해요'}
                  </p>
                </div>
              </div>
            )}
          </section>

          {hasQualityNotice && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-900">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <p>
                데이터 품질 안내: 미완료 출근 {stats.incompleteCommutes}건, 해석할 수 없는 도착 시각 {stats.invalidArrivalTimes}건은 지각 통계에서 제외했고, 4시간을 초과하거나 잘못된 이동시간 {stats.excludedDurationCount}건은 시간 통계에서 제외했어요.
              </p>
            </div>
          )}

          {stats.monthRecords.length === 0 ? (
            <div className="card px-6 py-12 text-center">
              <p className="text-[14px] font-medium text-neutral-700">아직 이번 달 기록이 없어요.</p>
              <p className="mt-2 text-[12px] text-neutral-400">출근이나 퇴근을 완료하면 통계가 채워져요.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <StatTile label="출근 완료" value={`${stats.commuteArrivals.length}건`} />
              <StatTile label="퇴근 완료" value={`${stats.returnArrivals.length}건`} />
              <StatTile label="왕복 기록" value={`${stats.roundTripDays}일`} sub="같은 날 출근·퇴근 완료" />
              <StatTile label="지각 횟수" value={`${stats.lateCount}회`} sub={`도착 시각 확인 ${stats.evaluatedCommutes}건 기준`} />
              <StatTile label="지각률" value={stats.lateRate === null ? '판단 불가' : `${stats.lateRate}%`} sub={`${formatMinutesOfDay(stats.workStartMinutes)} 업무 시작 기준`} />
              <StatTile label="평균 지각" value={stats.avgLateMinutes === null ? '해당 없음' : `${stats.avgLateMinutes}분`} sub="지각한 기록만 계산" />
              <StatTile label="휴가·병가" value={`${stats.vacations.length + stats.sickDays.length}일`} />
              <StatTile label="평균 출근 시간" value={stats.avgCommuteDuration === null ? '기록 없음' : `${stats.avgCommuteDuration}분`} />
              <StatTile label="평균 퇴근 시간" value={stats.avgReturnDuration === null ? '기록 없음' : `${stats.avgReturnDuration}분`} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
