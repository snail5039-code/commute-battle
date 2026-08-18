'use client';

import { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, Palmtree, Send, X } from 'lucide-react';
import { attendanceWorkspaceId } from '@/lib/attendance';
import { localDate } from '@/lib/remoteWork';
import {
  cancelLeave, fetchLeaveBalance, fetchLeaves, LEAVE_KIND_LABEL, LEAVE_STATUS_LABEL,
  leaveRangeLabel, requestLeave, type LeaveBalance, type LeaveKind, type LeaveRequest,
} from '@/lib/leave';

// 휴가는 신청 → 승인으로만 잡힙니다. 승인되면 그 기간의 근무일마다 휴가 기록이 자동으로 생깁니다.
// 며칠 쓰는지는 서버가 세고(주말·공휴일 제외), 잔여도 서버가 계산합니다.

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800',
  approved: 'bg-emerald-50 text-emerald-800',
  rejected: 'bg-rose-50 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

export default function LeavePanel() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [from, setFrom] = useState(() => localDate());
  const [to, setTo] = useState(() => localDate());
  const [kind, setKind] = useState<LeaveKind>('annual');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const year = new Date().getFullYear();

  const load = useCallback(async (id: string) => {
    setError('');
    try {
      const today = new Date();
      const rangeFrom = localDate(new Date(today.getFullYear(), 0, 1));
      const rangeTo = localDate(new Date(today.getFullYear() + 1, 0, 31));
      const [items, balances] = await Promise.all([
        fetchLeaves(id, rangeFrom, rangeTo),
        fetchLeaveBalance(id, today.getFullYear()),
      ]);
      setRequests(items.filter((item) => item.isMine));
      setBalance(balances[0] ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '휴가 정보를 불러오지 못했습니다.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void attendanceWorkspaceId().then((id) => {
        setWorkspaceId(id);
        if (id) void load(id); else setLoading(false);
      }).catch(() => setLoading(false));
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  // 반차는 하루짜리라 종료일을 시작일에 맞춥니다(서버도 같은 규칙으로 막습니다).
  const changeKind = (next: LeaveKind) => {
    setKind(next);
    if (next !== 'annual') setTo(from);
  };
  const changeFrom = (next: string) => {
    setFrom(next);
    if (kind !== 'annual' || to < next) setTo(next);
  };

  const submit = async () => {
    if (!workspaceId) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await requestLeave(workspaceId, from, kind === 'annual' ? to : from, kind, reason);
      setReason('');
      setNotice('휴가를 신청했습니다. 관리자 승인 후 기록에 반영됩니다.');
      await load(workspaceId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '휴가를 신청하지 못했습니다.');
    } finally { setSaving(false); }
  };

  const drop = async (id: string) => {
    if (!workspaceId) return;
    setError(''); setNotice('');
    try {
      await cancelLeave(id);
      setNotice('신청을 취소했습니다.');
      await load(workspaceId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '신청을 취소하지 못했습니다.');
    }
  };

  if (!loading && !workspaceId) return null;

  return (
    <section id="leave" aria-labelledby="leave-title" className="card p-5 md:p-7">
      <h2 id="leave-title" className="flex items-center gap-2 text-lg font-bold"><Palmtree size={18} />휴가 신청</h2>
      <p className="mt-1 text-sm text-slate-500">
        신청하고 <strong>승인받은 날만</strong> 휴가로 기록됩니다. 주말과 공휴일은 사용 일수에서 빠집니다.
      </p>

      {balance && (
        <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-4">
          {[
            [`${year}년 부여`, `${balance.grantedDays}일`],
            ['사용', `${balance.usedDays}일`],
            ['승인 대기', `${balance.pendingDays}일`],
            ['잔여', `${balance.remainingDays}일`],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-[11px] font-bold text-slate-500">{label}</p>
              <p className="mt-0.5 text-sm font-black text-slate-900">{value}</p>
            </div>
          ))}
          {balance.grantedDays === 0 && (
            <p className="text-[11px] text-amber-800 sm:col-span-4">
              올해 부여된 연차가 0일입니다. 관리자가 /admin에서 부여 일수를 입력해야 신청할 수 있습니다.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-[auto_auto_auto_1fr_auto] sm:items-end">
        <label className="text-xs font-bold text-slate-600">종류
          <select value={kind} onChange={(event) => changeKind(event.target.value as LeaveKind)}
            className="settings-control mt-1 block w-full rounded-xl border border-slate-200 px-3">
            {(Object.keys(LEAVE_KIND_LABEL) as LeaveKind[]).map((item) => (
              <option key={item} value={item}>{LEAVE_KIND_LABEL[item]}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-600">시작일
          <input type="date" value={from} onChange={(event) => changeFrom(event.target.value)}
            className="settings-control mt-1 block w-full rounded-xl border border-slate-200 px-3" />
        </label>
        <label className="text-xs font-bold text-slate-600">종료일
          <input type="date" value={kind === 'annual' ? to : from} min={from} disabled={kind !== 'annual'}
            onChange={(event) => setTo(event.target.value)}
            title={kind === 'annual' ? undefined : '반차는 하루만 신청할 수 있습니다'}
            className="settings-control mt-1 block w-full rounded-xl border border-slate-200 px-3 disabled:opacity-50" />
        </label>
        <label className="text-xs font-bold text-slate-600">사유
          <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300}
            placeholder="예: 가족 여행, 병원 진료"
            className="settings-control mt-1 block w-full rounded-xl border border-slate-200 px-3" />
        </label>
        <button type="button" onClick={() => void submit()} disabled={saving || !reason.trim()}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-50">
          {saving ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}신청
        </button>
      </div>

      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{notice}</p>}

      {loading ? (
        <div className="mt-4 grid min-h-20 place-items-center"><LoaderCircle className="animate-spin text-blue-600" aria-label="불러오는 중" /></div>
      ) : requests.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed p-5 text-center text-sm text-slate-500">최근 휴가 신청이 없습니다.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {requests.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">{leaveRangeLabel(item)}</strong>
                  <span className="text-xs text-slate-500">{LEAVE_KIND_LABEL[item.leaveType]} · {item.days}일</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[item.status]}`}>
                    {LEAVE_STATUS_LABEL[item.status]}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {item.reason}{item.reviewerNote && ` · 검토 의견: ${item.reviewerNote}`}
                </p>
              </div>
              {item.status === 'pending' && (
                <button type="button" onClick={() => void drop(item.id)}
                  className="flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-bold">
                  <X size={13} />취소
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
