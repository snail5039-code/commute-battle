'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, Lock, LockOpen, LoaderCircle } from 'lucide-react';
import {
  closeMonth, fetchClosings, fetchSnapshot, isMonthOver, monthLabel, recentMonths, reopenMonth,
  type MonthClosing,
} from '@/lib/closing';
import { attendanceCsv, downloadCsv } from '@/lib/workTime';

// 마감하면 그 달 정정 요청이 막히고 집계가 스냅샷으로 박제됩니다.
// 새 기록은 막지 않습니다 — 월말 야근이 자정을 넘겨 지난달로 귀속될 수 있어서, 퇴근을 못 찍게
// 하면 더 큰 문제가 됩니다. 대신 '마감 후 변경됨'을 띄워 소급 처리하게 합니다.

export default function MonthlyClosingPanel({ workspaceId, onChanged }: {
  workspaceId: string;
  onChanged?: () => void;
}) {
  const months = useMemo(() => recentMonths(12), []);
  const [states, setStates] = useState<Map<string, MonthClosing>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const items = await fetchClosings(workspaceId, months[months.length - 1], months[0]);
      setStates(new Map(items.map((item) => [item.month.slice(0, 10), item])));
    } catch (cause) {
      setStates(new Map());
      setError(cause instanceof Error ? cause.message : '마감 내역을 불러오지 못했습니다.');
    } finally { setLoading(false); }
  }, [workspaceId, months]);

  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);

  const run = async (month: string, job: () => Promise<void>, done: string) => {
    setBusy(month); setError(''); setNotice('');
    try {
      await job();
      setNotice(done);
      await load();
      onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '처리하지 못했습니다.');
    } finally { setBusy(''); }
  };

  const handleClose = (month: string) => {
    const note = window.prompt(`${monthLabel(month)} 근태를 마감합니다.\n마감하면 이 달의 정정 요청이 막히고, 지금 집계가 지급 근거로 저장됩니다.\n\n메모(선택):`);
    if (note === null) return;
    void run(month, () => closeMonth(workspaceId, month, note), `${monthLabel(month)}을 마감했습니다.`);
  };

  const handleReopen = (month: string) => {
    const reason = window.prompt(`${monthLabel(month)} 마감을 해제합니다.\n해제 사유를 5자 이상 적어 주세요(기록에 남습니다):`);
    if (reason === null) return;
    void run(month, () => reopenMonth(workspaceId, month, reason), `${monthLabel(month)} 마감을 해제했습니다.`);
  };

  const handleDownload = async (month: string) => {
    setBusy(month); setError('');
    try {
      const snapshot = await fetchSnapshot(workspaceId, month);
      downloadCsv(`근태마감_${month.slice(0, 7)}.csv`, attendanceCsv(snapshot.days));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '스냅샷을 불러오지 못했습니다.');
    } finally { setBusy(''); }
  };

  return (
    <section className="card overflow-hidden">
      <header className="border-b border-slate-200 px-5 py-4">
        <h2 className="flex items-center gap-2 font-black"><Lock size={17} />월 마감</h2>
        <p className="mt-1 text-xs text-slate-500">
          마감하면 그 달의 <strong>정정 요청이 막히고</strong>, 마감 시점 집계가 지급 근거로 저장됩니다.
          출퇴근 기록 자체는 계속 남길 수 있고, 마감 뒤에 바뀐 게 있으면 아래에 표시됩니다.
        </p>
      </header>

      {error && <p role="alert" className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {notice && <p className="border-b border-emerald-100 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800">{notice}</p>}

      {loading ? (
        <div className="grid min-h-32 place-items-center"><LoaderCircle className="animate-spin text-[#611f69]" aria-label="불러오는 중" /></div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {months.map((month) => {
            const state = states.get(month);
            const closed = state?.closed ?? false;
            const closable = isMonthOver(month);
            const working = busy === month;
            return (
              <li key={month} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <strong className="text-sm">{monthLabel(month)}</strong>
                    {closed ? (
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-white">마감</span>
                    ) : !closable ? (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">진행 중</span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">미마감</span>
                    )}
                  </div>
                  {state && (
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {closed ? '마감' : '해제'} · {new Date(state.actedAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })} · {state.actor}
                      {state.note && ` · ${state.note}`}
                    </p>
                  )}
                  {closed && state && state.changedAfter > 0 && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-amber-800">
                      <AlertTriangle size={12} />
                      마감 후 {state.changedAfter}건이 추가·변경됐습니다. 소급 정산이 필요할 수 있습니다.
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {closed && (
                    <button type="button" onClick={() => void handleDownload(month)} disabled={!!busy}
                      className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-bold disabled:opacity-40">
                      {working ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />}마감 CSV
                    </button>
                  )}
                  {closed ? (
                    <button type="button" onClick={() => handleReopen(month)} disabled={!!busy}
                      className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-bold disabled:opacity-40">
                      <LockOpen size={14} />해제
                    </button>
                  ) : (
                    <button type="button" onClick={() => handleClose(month)} disabled={!!busy || !closable}
                      title={closable ? undefined : '아직 끝나지 않은 달은 마감할 수 없습니다'}
                      className="flex h-9 items-center gap-1.5 rounded-lg bg-[#611f69] px-3 text-xs font-bold text-white disabled:opacity-30">
                      <Lock size={14} />마감
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400">
        마감·해제는 지워지지 않고 쌓입니다. 해제한 뒤 다시 마감해도 이전 스냅샷은 그대로 남습니다.
        &apos;마감 CSV&apos;는 지금 값이 아니라 <strong>마감하던 시점의 값</strong>을 내려받습니다 — 위 근무시간 집계와 다를 수 있고, 다르다면 그게 마감 후 변경이 있었다는 뜻입니다.
      </p>
    </section>
  );
}
