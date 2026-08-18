'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, LoaderCircle, Palmtree, X } from 'lucide-react';
import { localDate } from '@/lib/remoteWork';
import {
  fetchLeaveBalance, fetchLeaves, LEAVE_KIND_LABEL, LEAVE_STATUS_LABEL, leaveRangeLabel,
  reviewLeave, setLeaveGrant, type LeaveBalance, type LeaveRequest,
} from '@/lib/leave';

// 연차 발생 일수는 자동 산정하지 않습니다. 근로기준법 산정은 취업규칙마다 다르고 법 해석이
// 들어가서, 잘못 넣으면 그대로 임금 분쟁이 됩니다. 관리자가 연도별 부여 일수를 입력합니다.

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800',
  approved: 'bg-emerald-50 text-emerald-800',
  rejected: 'bg-rose-50 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

export default function LeaveAdminPanel({ workspaceId, onChanged }: { workspaceId: string; onChanged?: () => void }) {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const year = new Date().getFullYear();

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const today = new Date();
      const [items, list] = await Promise.all([
        fetchLeaves(workspaceId, localDate(new Date(today.getFullYear(), 0, 1)), localDate(new Date(today.getFullYear() + 1, 0, 31))),
        fetchLeaveBalance(workspaceId, today.getFullYear()),
      ]);
      setRequests(items);
      setBalances(list);
    } catch (cause) {
      setRequests([]); setBalances([]);
      setError(cause instanceof Error ? cause.message : '휴가 정보를 불러오지 못했습니다.');
    } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);

  const decide = async (id: string, approve: boolean) => {
    setBusy(id); setError(''); setNotice('');
    try {
      await reviewLeave(id, approve);
      setNotice(approve ? '승인했습니다. 해당 근무일에 휴가 기록이 만들어졌습니다.' : '반려했습니다.');
      await load();
      onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '신청을 처리하지 못했습니다.');
    } finally { setBusy(''); }
  };

  const editGrant = async (item: LeaveBalance) => {
    const input = window.prompt(`${item.nickname}님의 ${year}년 연차 부여 일수를 입력하세요.\n(근로기준법 자동 산정은 하지 않습니다 — 취업규칙에 따라 직접 정해 주세요)`, String(item.grantedDays));
    if (input === null) return;
    const days = Number(input);
    if (!Number.isFinite(days) || days < 0 || days > 365) { setError('0~365 사이 숫자를 입력해 주세요.'); return; }
    setBusy(item.userId); setError(''); setNotice('');
    try {
      await setLeaveGrant(workspaceId, item.userId, year, days);
      setNotice(`${item.nickname}님의 ${year}년 연차를 ${days}일로 정했습니다.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '부여 일수를 저장하지 못했습니다.');
    } finally { setBusy(''); }
  };

  const pending = requests.filter((item) => item.status === 'pending');
  const reviewed = requests.filter((item) => item.status !== 'pending').slice(0, 10);

  return (
    <section className="card overflow-hidden">
      <header className="border-b border-slate-200 px-5 py-4">
        <h2 className="flex items-center gap-2 font-black"><Palmtree size={17} />휴가 · 연차</h2>
        <p className="mt-1 text-xs text-slate-500">
          승인하면 그 기간의 <strong>근무일마다 휴가 기록이 자동으로</strong> 만들어집니다(주말·공휴일 제외).
          연차 부여 일수는 자동 산정하지 않으니 취업규칙에 맞게 직접 정해 주세요.
        </p>
      </header>

      {error && <p role="alert" className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {notice && <p className="border-b border-emerald-100 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800">{notice}</p>}

      {loading ? (
        <div className="grid min-h-32 place-items-center"><LoaderCircle className="animate-spin text-[#611f69]" aria-label="불러오는 중" /></div>
      ) : (
        <>
          <div className="overflow-x-auto border-b border-slate-200">
            <table className="w-full min-w-[520px] text-left text-sm">
              <caption className="px-5 pt-4 text-left text-xs font-bold text-slate-500">{year}년 연차 현황</caption>
              <thead className="text-xs text-slate-500"><tr>
                <th className="px-5 py-2">구성원</th><th className="px-4 py-2">부여</th><th className="px-4 py-2">사용</th>
                <th className="px-4 py-2">대기</th><th className="px-4 py-2">잔여</th><th className="px-4 py-2"></th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {balances.map((item) => (
                  <tr key={item.userId} className={item.grantedDays === 0 ? 'bg-amber-50/50' : ''}>
                    <td className="px-5 py-2 font-bold">{item.nickname}</td>
                    <td className="px-4 py-2">{item.grantedDays}일</td>
                    <td className="px-4 py-2">{item.usedDays}일</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{item.pendingDays}일</td>
                    <td className="px-4 py-2 font-bold">{item.remainingDays}일</td>
                    <td className="px-4 py-2 text-right">
                      <button type="button" onClick={() => void editGrant(item)} disabled={!!busy}
                        className="h-8 rounded-lg border border-slate-300 px-2.5 text-xs font-bold disabled:opacity-40">
                        {busy === item.userId ? '저장 중…' : '부여 일수'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pending.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-slate-500">검토할 휴가 신청이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {pending.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm">{item.nickname}</strong>
                      <span className="text-sm">{leaveRangeLabel(item)}</span>
                      <span className="text-xs text-slate-500">{LEAVE_KIND_LABEL[item.leaveType]} · {item.days}일</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{item.reason}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => void decide(item.id, false)} disabled={!!busy}
                      className="flex h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-bold disabled:opacity-40"><X size={14} />반려</button>
                    <button type="button" onClick={() => void decide(item.id, true)} disabled={!!busy}
                      className="flex h-9 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white disabled:opacity-40">
                      {busy === item.id ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}승인
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {reviewed.length > 0 && (
            <ul className="divide-y divide-slate-100 border-t border-slate-200">
              {reviewed.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-xs">
                  <span className="min-w-0 truncate"><strong>{item.nickname}</strong> · {leaveRangeLabel(item)} · {item.days}일</span>
                  <span className="flex items-center gap-2">
                    {item.selfApproved && <span className="text-[11px] text-amber-700">본인 승인</span>}
                    <span className={`rounded-full px-2 py-0.5 font-bold ${STATUS_STYLE[item.status]}`}>{LEAVE_STATUS_LABEL[item.status]}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
