'use client';

import { useCallback, useEffect, useState } from 'react';
import { House, LoaderCircle, Send, X } from 'lucide-react';
import { attendanceWorkspaceId } from '@/lib/attendance';
import { cancelRemoteWork, fetchRemoteWork, localDate, REMOTE_STATUS_LABEL, requestRemoteWork, type RemoteWorkRequest } from '@/lib/remoteWork';

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800',
  approved: 'bg-emerald-50 text-emerald-800',
  rejected: 'bg-rose-50 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

export default function RemoteWorkPanel() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [requests, setRequests] = useState<RemoteWorkRequest[]>([]);
  const [workDate, setWorkDate] = useState(() => localDate());
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (id: string) => {
    setError('');
    try {
      const today = new Date();
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      // 내 것만 남깁니다. 서버는 관리자에게 전원을, 부서장에게 부서원을 돌려주는데
      // (202608180005) 여기는 '내 재택근무 신청' 카드입니다. 승인은 /admin에서 합니다.
      const items = await fetchRemoteWork(id, localDate(from), localDate(new Date(today.getFullYear(), today.getMonth() + 2, 0)));
      setRequests(items.filter((item) => item.isMine));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '재택근무 신청을 불러오지 못했습니다.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void attendanceWorkspaceId().then((id) => {
        setWorkspaceId(id);
        if (id) void load(id); else setLoading(false);
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const submit = async () => {
    if (!workspaceId) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await requestRemoteWork(workspaceId, workDate, reason);
      setReason(''); setNotice('신청했습니다. 관리자 승인 후 재택으로 기록할 수 있어요.');
      await load(workspaceId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '재택근무를 신청하지 못했습니다.');
    } finally { setSaving(false); }
  };

  const cancel = async (id: string) => {
    if (!workspaceId) return;
    setError('');
    try { await cancelRemoteWork(id); await load(workspaceId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '신청을 취소하지 못했습니다.'); }
  };

  if (loading) return <div className="card grid min-h-32 place-items-center"><LoaderCircle className="animate-spin text-blue-600" aria-label="불러오는 중" /></div>;

  if (!workspaceId) {
    return <section className="card p-5 text-sm text-slate-500">
      <strong className="flex items-center gap-2 text-slate-900"><House size={16} />재택근무 신청</strong>
      <p className="mt-1">워크스페이스에 참여하면 재택근무를 신청하고 승인받을 수 있어요. 개인 기록에는 승인이 필요하지 않습니다.</p>
    </section>;
  }

  return (
    <section className="card p-5 md:p-7" aria-labelledby="remote-work-title">
      <h2 id="remote-work-title" className="flex items-center gap-2 text-lg font-bold"><House size={18} />재택근무 신청</h2>
      <p className="mt-1 text-sm text-slate-500">
        요일별 근무 형태를 재택으로 바꿔도, <strong>승인된 날만</strong> 재택으로 기록됩니다. 승인되면 그날은 자동으로 재택 모드가 됩니다.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-end">
        <label className="block text-xs font-bold text-slate-600">날짜
          <input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" />
        </label>
        <label className="block text-xs font-bold text-slate-600">사유
          <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder="예: 집 인터넷 공사, 자녀 돌봄" className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" />
        </label>
        <button type="button" onClick={() => void submit()} disabled={saving || reason.trim().length < 2} className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-50">
          <Send size={15} />{saving ? '신청 중…' : '신청'}
        </button>
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">{notice}</p>}

      <ul className="mt-5 space-y-2">
        {requests.length === 0 && <li className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">최근 재택근무 신청이 없습니다.</li>}
        {requests.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
            <div className="min-w-0">
              <strong className="text-sm">{item.workDate}</strong>
              <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[item.status]}`}>{REMOTE_STATUS_LABEL[item.status]}</span>
              <p className="mt-0.5 truncate text-xs text-slate-500">{item.reason}{item.reviewerNote ? ` · 검토 의견: ${item.reviewerNote}` : ''}</p>
            </div>
            {item.status === 'pending' && (
              <button type="button" onClick={() => void cancel(item.id)} className="flex h-8 items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-[11px] font-bold"><X size={12} />취소</button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
