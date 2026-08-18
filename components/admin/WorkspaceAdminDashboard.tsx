'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Clock3, ExternalLink, LoaderCircle, MapPin, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { fetchWorkspaceAccess, type WorkspaceAccess } from '@/lib/org';
import { fetchAdminDashboard, reviewAdminRequest, type AdminDashboardData } from '@/lib/workspaceAdmin';
import { fetchWorkspaceCorrections, reviewCorrection, type CorrectionRequest } from '@/lib/attendance';
import { fetchRemoteWork, localDate, REMOTE_STATUS_LABEL, reviewRemoteWork, type RemoteWorkRequest } from '@/lib/remoteWork';
import AttendanceReport from '../AttendanceReport';
import HolidayPanel from './HolidayPanel';
import OrgPanel from './OrgPanel';
import MonthlyClosingPanel from './MonthlyClosingPanel';
import LeaveAdminPanel from './LeaveAdminPanel';

const REMOTE_STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800',
  approved: 'bg-emerald-50 text-emerald-800',
  rejected: 'bg-rose-50 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const TYPE_LABEL: Record<string, string> = { commute: '출근', return: '퇴근', early_leave: '조퇴', vacation: '휴가', sick: '병가', absence: '결근' };

function clock(value: string | null) {
  if (!value) return '미기록';
  return new Date(value).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusLabel(type: string | null, endTime: string | null, hasLocation: boolean) {
  if (hasLocation) return '출근 중';
  if (type === 'vacation') return '휴가';
  if (type === 'absence') return '결근';
  if (type === 'sick') return '병가';
  if (type === 'commute' && endTime) return '도착 완료';
  if (type === 'return' && endTime) return '퇴근 완료';
  return '출근 전';
}

export default function WorkspaceAdminDashboard() {
  // 관리자와 부서장을 함께 담습니다. 부서장은 role이 member라 예전 필터에서 통째로 빠졌고,
  // 그래서 0005로 준 승인 권한을 쓸 화면이 아예 없었습니다.
  const [workspaces, setWorkspaces] = useState<WorkspaceAccess[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [data, setData] = useState<AdminDashboardData>({ members: [], requests: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [corrections, setCorrections] = useState<CorrectionRequest[]>([]);
  const [correctionError, setCorrectionError] = useState('');
  const [remoteRequests, setRemoteRequests] = useState<RemoteWorkRequest[]>([]);
  const [remoteError, setRemoteError] = useState('');
  // 공휴일이 바뀌면 근무시간 집계를 다시 계산해야 해서 리포트를 새로 마운트합니다.
  const [holidayVersion, setHolidayVersion] = useState(0);

  const loadCorrections = useCallback(async (id: string) => {
    setCorrectionError('');
    try { setCorrections(await fetchWorkspaceCorrections(id)); }
    catch (cause) { setCorrections([]); setCorrectionError(cause instanceof Error ? cause.message : '정정 요청을 불러오지 못했습니다.'); }
  }, []);

  const loadRemote = useCallback(async (id: string) => {
    setRemoteError('');
    try {
      const today = new Date();
      const from = localDate(new Date(today.getFullYear(), today.getMonth() - 1, 1));
      const to = localDate(new Date(today.getFullYear(), today.getMonth() + 2, 0));
      setRemoteRequests(await fetchRemoteWork(id, from, to));
    } catch (cause) { setRemoteRequests([]); setRemoteError(cause instanceof Error ? cause.message : '재택근무 신청을 불러오지 못했습니다.'); }
  }, []);

  const decideRemote = async (requestId: string, approve: boolean) => {
    if (!workspaceId) return;
    try { await reviewRemoteWork(requestId, approve); await loadRemote(workspaceId); }
    catch (cause) { setRemoteError(cause instanceof Error ? cause.message : '신청을 처리하지 못했습니다.'); }
  };

  const loadDashboard = useCallback(async (id: string) => {
    setLoading(true); setError('');
    try { setData(await fetchAdminDashboard(id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '현황을 불러오지 못했습니다.'); }
    finally { setLoading(false); }
    await loadCorrections(id);
    await loadRemote(id);
  }, [loadCorrections, loadRemote]);

  const decide = async (requestId: string, approve: boolean) => {
    if (!workspaceId) return;
    try { await reviewCorrection(requestId, approve); await loadCorrections(workspaceId); }
    catch (cause) { setCorrectionError(cause instanceof Error ? cause.message : '정정 요청을 처리하지 못했습니다.'); }
  };

  useEffect(() => {
    void fetchWorkspaceAccess().then((items) => {
      const manageable = items.filter((item) => item.isAdmin || item.isHead);
      setWorkspaces(manageable); setWorkspaceId(manageable[0]?.id ?? '');
      // '오늘의 부서원 현황'은 관리자 전용 RPC라, 부서장이 부르면 오류 배너만 뜹니다.
      if (manageable[0]?.isAdmin) void loadDashboard(manageable[0].id); else setLoading(false);
    }).catch(() => { setError('관리 가능한 워크스페이스를 불러오지 못했습니다.'); setLoading(false); });
  }, [loadDashboard]);

  // 고른 워크스페이스에서 내가 관리자인가. 부서장이면 승인만 열고 조직·공휴일·마감·정책은 닫습니다.
  const isAdmin = workspaces.find((item) => item.id === workspaceId)?.isAdmin ?? false;

  const review = async (userId: string, approve: boolean) => {
    if (!workspaceId) return;
    try { await reviewAdminRequest(workspaceId, userId, approve); await loadDashboard(workspaceId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '승인 요청을 처리하지 못했습니다.'); }
  };

  return <div className="space-y-5">
    <section className="card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><ShieldCheck className="text-blue-600" size={20}/><h2 className="font-black text-slate-950">워크스페이스 관리</h2></div><p className="mt-1 text-xs text-slate-500">{workspaceId && !isAdmin ? '부서장으로 들어와 있습니다 — 내 부서원의 승인과 근무시간만 보입니다.' : '관리자 현황 열람은 보안을 위해 기록됩니다.'}</p></div><div className="flex gap-2"><select value={workspaceId} onChange={(event) => { const next = event.target.value; setWorkspaceId(next); if (workspaces.find((item) => item.id === next)?.isAdmin) void loadDashboard(next); }} className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold"><option value="">워크스페이스 선택</option>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" onClick={() => { if (workspaceId && isAdmin) void loadDashboard(workspaceId); if (workspaceId) { void loadCorrections(workspaceId); void loadRemote(workspaceId); } }} aria-label="새로고침" className="grid size-10 place-items-center rounded-xl border border-slate-300"><RefreshCw size={17}/></button></div></div></section>

    {!workspaceId && <div className="card p-8 text-center text-sm text-slate-500">관리자 권한이 있거나 부서장으로 지정된 워크스페이스가 없습니다.</div>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
    {workspaceId && isAdmin && data.requests.length > 0 && <section className="card overflow-hidden"><header className="border-b border-slate-200 px-5 py-4"><h2 className="font-black">관리자 승인 대기</h2><p className="mt-1 text-xs text-slate-500">워크스페이스 소유자와 관리자가 승인하거나 거절할 수 있습니다.</p></header><ul className="divide-y divide-slate-100">{data.requests.map((request) => <li key={request.userId} className="flex items-center justify-between gap-3 px-5 py-3"><div><strong className="text-sm">{request.nickname}</strong><p className="text-xs text-slate-400">{new Date(request.requestedAt).toLocaleString('ko-KR')} 신청</p></div><div className="flex gap-2"><button type="button" onClick={() => void review(request.userId, false)} className="flex h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-bold"><X size={14}/>거절</button><button type="button" onClick={() => void review(request.userId, true)} className="flex h-9 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white"><Check size={14}/>승인</button></div></li>)}</ul></section>}

    {workspaceId && <section className="card overflow-hidden"><header className="border-b border-slate-200 px-5 py-4"><h2 className="font-black">재택근무 신청</h2><p className="mt-1 text-xs text-slate-500">승인된 날만 재택으로 기록됩니다. 승인하지 않으면 그날은 사무실 출퇴근으로만 기록할 수 있습니다.</p></header>
      {remoteError && <p role="alert" className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">{remoteError}</p>}
      {remoteRequests.length === 0 && !remoteError ? <p className="px-5 py-6 text-center text-sm text-slate-500">최근 재택근무 신청이 없습니다.</p> : <ul className="divide-y divide-slate-100">{remoteRequests.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="min-w-0">
          <strong className="text-sm">{item.nickname}</strong>
          <span className="ml-2 text-xs font-bold text-slate-600">{item.workDate}</span>
          <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold ${REMOTE_STATUS_STYLE[item.status]}`}>{REMOTE_STATUS_LABEL[item.status]}</span>
          {item.selfApproved && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">본인 승인</span>}
          <p className="mt-0.5 truncate text-xs text-slate-500">{item.reason}{item.reviewerNote ? ` · ${item.reviewerNote}` : ''}</p>
        </div>
        {(item.status === 'pending' || item.status === 'approved') && <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => void decideRemote(item.id, false)} className="flex h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-bold"><X size={14}/>{item.status === 'approved' ? '승인 취소' : '반려'}</button>
          {item.status === 'pending' && <button type="button" onClick={() => void decideRemote(item.id, true)} className="flex h-9 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white"><Check size={14}/>승인</button>}
        </div>}
      </li>)}</ul>}
    </section>}

    {workspaceId && isAdmin && <OrgPanel workspaceId={workspaceId} onChanged={() => setHolidayVersion((value) => value + 1)} />}

    {/* 부서장에게는 근무 정책 편집을 열지 않습니다(adminMode=false). 부서·구성원 필터는
        볼 사람이 둘 이상이면 AttendanceReport가 알아서 보여 줍니다. */}
    {workspaceId && <AttendanceReport key={`report-${holidayVersion}`} workspaceId={workspaceId} adminMode={isAdmin} />}

    {/* 휴일을 바꾸면 휴일근로·지각 계산이 달라지므로 집계를 다시 불러옵니다. */}
    {workspaceId && isAdmin && <HolidayPanel workspaceId={workspaceId} year={new Date().getFullYear()} onChanged={() => setHolidayVersion((value) => value + 1)} />}

    {workspaceId && isAdmin && <MonthlyClosingPanel workspaceId={workspaceId} onChanged={() => { setHolidayVersion((value) => value + 1); void loadCorrections(workspaceId); }} />}

    {workspaceId && <LeaveAdminPanel workspaceId={workspaceId} onChanged={() => setHolidayVersion((value) => value + 1)} />}

    {workspaceId && <section className="card overflow-hidden"><header className="border-b border-slate-200 px-5 py-4"><h2 className="font-black">근태 정정 요청</h2><p className="mt-1 text-xs text-slate-500">승인하면 기록이 바뀌고, 원본 값과 승인자가 변경 이력에 남습니다. 본인 기록은 다른 관리자만 승인할 수 있습니다.</p></header>
      {correctionError && <p role="alert" className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">{correctionError}</p>}
      {corrections.length === 0 && !correctionError ? <p className="px-5 py-6 text-center text-sm text-slate-500">검토할 정정 요청이 없습니다.</p> : <ul className="divide-y divide-slate-100">{corrections.map((item) => <li key={item.id} className="px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <strong className="text-sm">{item.nickname}</strong>
            <span className="ml-2 text-xs text-slate-500">{item.currentDate} · {TYPE_LABEL[item.currentType ?? ''] ?? item.currentType}</span>
            <p className="mt-1 text-xs text-slate-600">사유: {item.reason}</p>
            <dl className="mt-2 grid gap-1 text-[11px] text-slate-600 sm:grid-cols-2">
              <div><dt className="inline font-bold">현재</dt> <dd className="inline">{clock(item.currentStart)} → {clock(item.currentEnd)}</dd></div>
              <div><dt className="inline font-bold text-blue-700">요청</dt> <dd className="inline text-blue-700">{clock(item.requestedStart ?? item.currentStart)} → {clock(item.requestedEnd ?? item.currentEnd)}</dd></div>
            </dl>
            <p className="mt-1 text-[10px] text-slate-400">{new Date(item.createdAt).toLocaleString('ko-KR')} 요청</p>
          </div>
          <div className="flex shrink-0 gap-2">
            {item.isMine ? <span className="rounded-lg bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-500">본인 요청 · 다른 관리자를 초대해 승인받아야 합니다</span> : <>
              <button type="button" onClick={() => void decide(item.id, false)} className="flex h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-bold"><X size={14}/>반려</button>
              <button type="button" onClick={() => void decide(item.id, true)} className="flex h-9 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white"><Check size={14}/>승인</button>
            </>}
          </div>
        </div>
      </li>)}</ul>}
    </section>}

    {workspaceId && isAdmin && <section className="card overflow-hidden"><header className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-black">오늘의 부서원 현황</h2><p className="mt-1 text-xs text-slate-500">정확한 위치는 직원이 출근 시 동의한 동안에만 표시됩니다.</p></div><span className="text-xs font-bold text-slate-500">{data.members.length}명</span></header>{loading ? <div className="grid min-h-56 place-items-center"><LoaderCircle className="animate-spin text-blue-600"/></div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3">부서원</th><th className="px-4 py-3">권한</th><th className="px-4 py-3">출퇴근 상태</th><th className="px-4 py-3">시작 시각</th><th className="px-4 py-3">현재 위치</th><th className="px-4 py-3">갱신</th></tr></thead><tbody className="divide-y divide-slate-100">{data.members.map((member) => { const sharing = member.latitude !== null && member.longitude !== null; return <tr key={member.userId} className="hover:bg-slate-50"><td className="px-5 py-3 font-bold text-slate-950">{member.nickname}</td><td className="px-4 py-3 text-xs text-slate-500">{member.role === 'owner' ? '소유자' : member.role === 'admin' ? '관리자' : '멤버'}</td><td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-bold ${sharing ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{sharing && <span className="size-1.5 animate-pulse rounded-full bg-emerald-500"/>}{statusLabel(member.commuteType, member.endTime, sharing)}</span></td><td className="px-4 py-3 text-xs text-slate-500">{member.startTime ? new Date(member.startTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'}</td><td className="px-4 py-3">{sharing ? <a href={`https://map.kakao.com/link/map/${encodeURIComponent(member.nickname)},${member.latitude},${member.longitude}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-blue-700"><MapPin size={14}/>{member.latitude?.toFixed(6)}, {member.longitude?.toFixed(6)}<ExternalLink size={12}/></a> : <span className="text-xs text-slate-400">공유 안 함</span>}</td><td className="px-4 py-3 text-xs text-slate-500">{member.locationUpdatedAt ? <span className="flex items-center gap-1"><Clock3 size={13}/>{new Date(member.locationUpdatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span> : '-'}</td></tr>; })}</tbody></table></div>}</section>}
  </div>;
}
