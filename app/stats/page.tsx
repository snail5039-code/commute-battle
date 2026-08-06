'use client';

import { useEffect, useMemo, useState } from 'react';
/* eslint-disable react-hooks/exhaustive-deps -- version refreshes localStorage-backed exclusions */
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Info } from 'lucide-react';
import TopBar from '@/components/TopBar';
import StatsCharts from '@/components/StatsCharts';
import { qualitySummary } from '@/lib/dataQuality';
import { comparisonPercent, computePeriodStats, StatsPeriod } from '@/lib/stats';
import { useAppData } from '@/lib/useAppData';
import { loadWorkSchedule, useStore } from '@/lib/store';
import { loadExcludedRecordIds, RECORD_OVERRIDES_EVENT } from '@/lib/recordOverrides';

const PERIODS: { id: StatsPeriod; label: string }[] = [
  { id: 'week', label: '주' },
  { id: 'month', label: '월' },
  { id: 'year', label: '년' },
];

function Tile({ label, value, change }: { label: string; value: string; change: number | null }) {
  return <div className="card p-5">
    <p className="text-xs text-slate-500">{label}</p>
    <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
    <p className={`mt-1 text-xs ${change === null ? 'text-slate-400' : change > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
      {change === null ? '이전 기간 비교 없음' : `이전 기간 대비 ${change > 0 ? '+' : ''}${change}%`}
    </p>
  </div>;
}

function statsComment(stats: ReturnType<typeof computePeriodStats>) {
  if (!stats.monthRecords.length) return '아직 통계에 반영된 기록이 없어요. 출근 후 도착까지 완료하면 리포트가 만들어집니다.';
  if (!stats.evaluatedCommutes) return '도착 시간이 있는 출근 기록이 더 필요해요. 출근 시작만 누른 기록은 완료 전이라 통계에서 제외됩니다.';
  if (!stats.lateCount) return `평가 가능한 출근 ${stats.evaluatedCommutes}건이 모두 정시 도착이에요.`;
  return `평가 가능한 출근 ${stats.evaluatedCommutes}건 중 ${stats.lateCount}건이 지각으로 계산됐어요. 평균 ${stats.avgLateMinutes ?? 0}분의 여유를 더해 보세요.`;
}

export default function StatsPage() {
  const { user, records, loading } = useAppData();
  const schedule = useStore((state) => state.workSchedule);
  const setSchedule = useStore((state) => state.setWorkSchedule);
  const [period, setPeriod] = useState<StatsPeriod>('month');
  const [offset, setOffset] = useState(0);
  const [version, setVersion] = useState(0);

  useEffect(() => setSchedule(loadWorkSchedule(user?.id)), [setSchedule, user?.id]);
  useEffect(() => {
    const update = () => setVersion((value) => value + 1);
    window.addEventListener(RECORD_OVERRIDES_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(RECORD_OVERRIDES_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);

  const anchor = useMemo(() => {
    const date = new Date();
    if (period === 'week') date.setDate(date.getDate() + offset * 7);
    else if (period === 'month') date.setMonth(date.getMonth() + offset);
    else date.setFullYear(date.getFullYear() + offset);
    return date;
  }, [period, offset]);

  const excluded = useMemo(() => loadExcludedRecordIds(user?.id), [user?.id, version]);
  const stats = useMemo(() => computePeriodStats(records, period, anchor, schedule, excluded), [records, period, anchor, schedule, excluded]);
  const previous = useMemo(() => computePeriodStats(records, period, stats.previousRange.start, schedule, excluded), [records, period, stats.previousRange.start, schedule, excluded]);
  const rawPeriodRecords = useMemo(() => records.filter((record) => {
    const date = new Date(`${record.date}T12:00:00`);
    return date >= stats.range.start && date <= stats.range.end;
  }), [records, stats.range.end, stats.range.start]);
  const issues = qualitySummary(stats.quality);

  const exportCsv = () => {
    const warning = '이 파일에는 출퇴근 시각 등 개인정보가 포함될 수 있습니다.';
    if (!window.confirm(`${warning}\n개인 기기에만 안전하게 저장하세요. 계속할까요?`)) return;
    const header = ['기록 ID', '날짜', '유형', '시작 시각', '종료 시각', '이동시간(분)'];
    const rows = stats.monthRecords.map((record) => [record.id, record.date, record.type, record.start_time ?? '', record.end_time ?? '', record.duration_minutes ?? '']);
    const csv = `\uFEFF${[header, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchorElement = document.createElement('a');
    anchorElement.href = url;
    anchorElement.download = `commute-${period}-${stats.range.start.toISOString().slice(0, 10)}.csv`;
    anchorElement.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return null;

  return <div className="flex min-h-screen flex-col">
    <TopBar title="통계" subtitle="출퇴근 기록 리포트" />
    <main className="flex-1 p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-4">
        {!user ? <div className="card p-8 text-sm text-slate-500">먼저 로그인해 주세요.</div> : <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-xl bg-slate-100 p-1">{PERIODS.map((item) => <button key={item.id} onClick={() => { setPeriod(item.id); setOffset(0); }} className={`rounded-lg px-4 py-2 text-sm font-semibold ${period === item.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>{item.label}</button>)}</div>
            <div className="flex items-center gap-2">
              <button aria-label="이전 기간" onClick={() => setOffset((value) => value - 1)} className="rounded-lg border p-2"><ChevronLeft size={16} /></button>
              <strong className="min-w-32 text-center text-sm">{stats.range.label}</strong>
              <button aria-label="다음 기간" disabled={offset >= 0} onClick={() => setOffset((value) => value + 1)} className="rounded-lg border p-2 disabled:opacity-30"><ChevronRight size={16} /></button>
            </div>
            <button onClick={exportCsv} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold"><Download size={15} />CSV 내보내기</button>
          </div>

          <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5 text-sm text-blue-950">{statsComment(stats)}</section>

          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600 md:grid-cols-3">
            <p><strong className="block text-sm text-slate-950">전체 기록</strong>{rawPeriodRecords.length}건</p>
            <p><strong className="block text-sm text-slate-950">통계 반영</strong>{stats.monthRecords.length}건</p>
            <p><strong className="block text-sm text-slate-950">자동 제외</strong>{stats.quality.excludedRecords.length + excluded.size}건</p>
          </div>

          {(issues.length > 0 || excluded.size > 0) && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            <p className="font-bold"><Info size={14} className="mr-1 inline" />일부 기록은 통계에서 제외됐어요.</p>
            {issues.length > 0 && <p className="mt-1">자동 제외: {issues.join(', ')}</p>}
            <p className="mt-1">출근·퇴근은 도착까지 완료되어야 통계에 반영됩니다. 장거리 출퇴근과 하루 여러 번의 출퇴근은 정상 기록으로 반영하며, 완료되지 않았거나 이동시간 값이 잘못된 기록만 제외합니다.</p>
            {excluded.size > 0 && <p className="mt-1">캘린더에서 직접 제외한 기록 {excluded.size}건은 이 기기 통계에 포함되지 않습니다.</p>}
          </div>}

          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><AlertTriangle size={14} className="mr-1 inline" />CSV에는 출퇴근 시각 등 개인정보가 포함될 수 있으니 공유와 보관에 주의하세요.</p>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Tile label="출근 완료" value={`${stats.commuteArrivals.length}건`} change={comparisonPercent(stats.commuteArrivals.length, previous.commuteArrivals.length)} />
            <Tile label="평균 출근" value={stats.avgCommuteDuration === null ? '-' : `${stats.avgCommuteDuration}분`} change={comparisonPercent(stats.avgCommuteDuration, previous.avgCommuteDuration)} />
            <Tile label="지각률" value={stats.lateRate === null ? '-' : `${stats.lateRate}%`} change={comparisonPercent(stats.lateRate, previous.lateRate)} />
            <Tile label="왕복" value={`${stats.roundTripDays}일`} change={comparisonPercent(stats.roundTripDays, previous.roundTripDays)} />
          </div>

          <StatsCharts points={stats.trend} weather={stats.weatherBreakdown} transport={stats.transportBreakdown} />
        </>}
      </div>
    </main>
  </div>;
}
