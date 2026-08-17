'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, LoaderCircle, RefreshCw, Settings2 } from 'lucide-react';
import {
  attendanceCsv, downloadCsv, fetchAttendanceSummary, formatClock, formatHours, formatMinutes, monthRange,
  saveWorkPolicy, STATUS_LABEL, type AttendanceSummary, type WorkPolicy,
} from '@/lib/workTime';

const STATUS_STYLE: Record<string, string> = {
  complete: 'bg-slate-100 text-slate-600',
  incomplete: 'bg-amber-50 text-amber-800',
  vacation: 'bg-blue-50 text-blue-700',
  sick: 'bg-violet-50 text-violet-700',
  absence: 'bg-rose-50 text-rose-700',
  early_leave: 'bg-orange-50 text-orange-800',
};

export default function AttendanceReport({ workspaceId, adminMode }: { workspaceId: string; adminMode: boolean }) {
  const initial = useMemo(() => monthRange(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [member, setMember] = useState('');
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [policyOpen, setPolicyOpen] = useState(false);
  const [draft, setDraft] = useState<WorkPolicy | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const next = await fetchAttendanceSummary(workspaceId, from, to, member || undefined);
      setSummary(next); setDraft(next.policy);
    } catch (cause) {
      setSummary(null);
      setError(cause instanceof Error ? cause.message : '근태 집계를 불러오지 못했습니다.');
    } finally { setLoading(false); }
  }, [workspaceId, from, to, member]);

  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);

  const members = useMemo(() => {
    const map = new Map<string, string>();
    summary?.days.forEach((day) => map.set(day.userId, day.nickname));
    return [...map].map(([userId, nickname]) => ({ userId, nickname }));
  }, [summary]);

  const totals = useMemo(() => {
    const days = summary?.days ?? [];
    return {
      worked: days.reduce((sum, day) => sum + day.workedMinutes, 0),
      overtime: days.reduce((sum, day) => sum + day.overtimeMinutes, 0),
      night: days.reduce((sum, day) => sum + day.nightMinutes, 0),
      holiday: days.reduce((sum, day) => sum + day.holidayMinutes, 0),
      late: days.filter((day) => day.lateMinutes > 0).length,
      incomplete: days.filter((day) => day.status === 'incomplete').length,
    };
  }, [summary]);

  const overLimitWeeks = summary?.weeks.filter((week) => week.overLimit) ?? [];

  const savePolicy = async () => {
    if (!draft) return;
    setSaving(true); setError('');
    try { await saveWorkPolicy(workspaceId, draft); setPolicyOpen(false); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '근무 정책을 저장하지 못했습니다.'); }
    finally { setSaving(false); }
  };

  const numberField = (label: string, key: keyof WorkPolicy, hint?: string) => (
    <label className="block text-xs font-bold text-slate-600">{label}
      <input type="number" min={0} value={Number(draft?.[key] ?? 0)}
        onChange={(event) => setDraft((current) => current && { ...current, [key]: Number(event.target.value) })}
        className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 text-sm" />
      {hint && <span className="mt-0.5 block text-[10px] font-normal text-slate-400">{hint}</span>}
    </label>
  );

  const timeField = (label: string, key: keyof WorkPolicy) => (
    <label className="block text-xs font-bold text-slate-600">{label}
      <input type="time" value={String(draft?.[key] ?? '').slice(0, 5)}
        onChange={(event) => setDraft((current) => current && { ...current, [key]: event.target.value })}
        className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 text-sm" />
    </label>
  );

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="font-black">근무시간 집계</h2>
          <p className="mt-1 text-xs text-slate-500">
            출근 기록의 <strong>도착 시각</strong>부터 퇴근 기록의 <strong>출발 시각</strong>까지를 근무시간으로 봅니다. 휴게는 정책값으로 자동 차감됩니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="시작일" className="h-10 rounded-lg border border-slate-300 px-2 text-xs" />
          <span className="text-xs text-slate-400">~</span>
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="종료일" className="h-10 rounded-lg border border-slate-300 px-2 text-xs" />
          {adminMode && members.length > 0 && (
            <select value={member} onChange={(event) => setMember(event.target.value)} aria-label="구성원" className="h-10 rounded-lg border border-slate-300 px-2 text-xs font-bold">
              <option value="">전체 구성원</option>
              {members.map((item) => <option key={item.userId} value={item.userId}>{item.nickname}</option>)}
            </select>
          )}
          <button type="button" onClick={() => void load()} aria-label="새로고침" className="grid size-10 place-items-center rounded-lg border border-slate-300"><RefreshCw size={16} /></button>
          {adminMode && (
            <button type="button" onClick={() => setPolicyOpen((open) => !open)} aria-expanded={policyOpen} className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-bold"><Settings2 size={15} />근무 정책</button>
          )}
          <button type="button" onClick={() => summary && downloadCsv(`근태_${from}_${to}.csv`, attendanceCsv(summary.days))} disabled={!summary?.days.length} className="flex h-10 items-center gap-1.5 rounded-lg bg-[#611f69] px-3 text-xs font-bold text-white disabled:opacity-40"><Download size={15} />CSV</button>
        </div>
      </header>

      {policyOpen && draft && (
        <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-5 sm:grid-cols-3">
          {timeField('소정근로 시작', 'workStart')}
          {timeField('소정근로 종료', 'workEnd')}
          {numberField('1일 소정근로(분)', 'dailyRegularMinutes', '초과분은 연장근로로 계산됩니다')}
          {numberField('1주 소정근로(분)', 'weeklyRegularMinutes', '기본 2400분 = 40시간')}
          {numberField('1주 한도(분)', 'weeklyLimitMinutes', '기본 3120분 = 52시간, 넘으면 경고')}
          {numberField('휴게(분)', 'breakMinutes', '8시간 이상 근무 시 차감, 4시간 이상은 최대 30분')}
          {timeField('야간 시작', 'nightStart')}
          {timeField('야간 종료', 'nightEnd')}
          <div className="flex items-end gap-2">
            <button type="button" onClick={() => void savePolicy()} disabled={saving} className="h-10 flex-1 rounded-lg bg-blue-600 text-xs font-bold text-white disabled:opacity-50">{saving ? '저장 중…' : '정책 저장'}</button>
            <button type="button" onClick={() => { setPolicyOpen(false); setDraft(summary?.policy ?? null); }} className="h-10 rounded-lg border border-slate-300 px-3 text-xs font-bold">취소</button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">{error}</p>}

      {loading ? <div className="grid min-h-56 place-items-center"><LoaderCircle className="animate-spin text-[#611f69]" aria-label="불러오는 중" /></div> : !summary ? null : (
        <>
          <div className="grid gap-3 border-b border-slate-200 p-5 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['총 근무', formatMinutes(totals.worked)],
              ['연장', formatMinutes(totals.overtime)],
              ['야간', formatMinutes(totals.night)],
              ['휴일', formatMinutes(totals.holiday)],
              ['지각 일수', `${totals.late}일`],
              ['기록 미완료', `${totals.incomplete}일`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] font-bold text-slate-500">{label}</p>
                <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
              </div>
            ))}
          </div>

          {overLimitWeeks.length > 0 && (
            <div className="flex gap-2 border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-900">
              <AlertTriangle size={15} className="mt-px shrink-0" />
              <div>
                <strong className="block">주 {formatHours(summary.policy.weeklyLimitMinutes)} 한도를 넘긴 주가 {overLimitWeeks.length}건 있습니다.</strong>
                {overLimitWeeks.map((week) => <span key={`${week.userId}-${week.weekStart}`} className="mr-3">{week.nickname} · {week.weekStart} 주 {formatHours(week.workedMinutes)}</span>)}
              </div>
            </div>
          )}

          {summary.weeks.length > 0 && (
            <div className="overflow-x-auto border-b border-slate-200">
              <table className="w-full min-w-[520px] text-left text-sm">
                <caption className="px-5 pt-4 text-left text-xs font-bold text-slate-500">주간 합계 (월요일 시작)</caption>
                <thead className="text-xs text-slate-500"><tr><th className="px-5 py-2">구성원</th><th className="px-4 py-2">주 시작</th><th className="px-4 py-2">근무</th><th className="px-4 py-2">연장</th><th className="px-4 py-2">한도</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.weeks.map((week) => (
                    <tr key={`${week.userId}-${week.weekStart}`} className={week.overLimit ? 'bg-amber-50/60' : ''}>
                      <td className="px-5 py-2 font-bold">{week.nickname}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">{week.weekStart}</td>
                      <td className="px-4 py-2">{formatMinutes(week.workedMinutes)}</td>
                      <td className="px-4 py-2">{formatMinutes(week.overtimeMinutes)}</td>
                      <td className="px-4 py-2 text-xs font-bold">{week.overLimit ? <span className="text-red-700">초과</span> : <span className="text-slate-400">이내</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {summary.days.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">이 기간에는 워크스페이스에 연결된 근태 기록이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <caption className="px-5 pt-4 text-left text-xs font-bold text-slate-500">일별 상세</caption>
                <thead className="text-xs text-slate-500"><tr>
                  <th className="px-5 py-2">날짜</th><th className="px-4 py-2">구성원</th><th className="px-4 py-2">출근</th><th className="px-4 py-2">퇴근</th>
                  <th className="px-4 py-2">근무</th><th className="px-4 py-2">연장</th><th className="px-4 py-2">야간</th><th className="px-4 py-2">지각</th><th className="px-4 py-2">상태</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.days.map((day) => (
                    <tr key={`${day.userId}-${day.date}`} className={day.isHoliday ? 'bg-slate-50/70' : ''}>
                      <td className="px-5 py-2 text-xs font-bold">{day.date}{day.isHoliday && <span className="ml-1 text-[10px] font-normal text-rose-600">휴일</span>}</td>
                      <td className="px-4 py-2 text-xs">{day.nickname}</td>
                      <td className="px-4 py-2 text-xs">{formatClock(day.workIn)}</td>
                      <td className="px-4 py-2 text-xs">{formatClock(day.workOut)}</td>
                      <td className="px-4 py-2 font-bold">{formatMinutes(day.workedMinutes)}</td>
                      <td className="px-4 py-2 text-xs">{day.overtimeMinutes ? formatMinutes(day.overtimeMinutes) : '-'}</td>
                      <td className="px-4 py-2 text-xs">{day.nightMinutes ? formatMinutes(day.nightMinutes) : '-'}</td>
                      <td className="px-4 py-2 text-xs">{day.lateMinutes ? `${day.lateMinutes}분` : '-'}</td>
                      <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[day.status]}`}>{STATUS_LABEL[day.status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="px-5 py-3 text-[11px] text-slate-400">
            공휴일 달력과 교대·유연근무제는 아직 반영되지 않습니다. 자정을 넘겨 퇴근한 날은 두 날짜로 나뉘어 &apos;기록 미완료&apos;로 표시될 수 있습니다.
          </p>
        </>
      )}
    </section>
  );
}
