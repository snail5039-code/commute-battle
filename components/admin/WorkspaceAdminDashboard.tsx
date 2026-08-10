'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Clock3, ExternalLink, LoaderCircle, MapPin, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { fetchChatWorkspaces, type ChatWorkspace } from '@/lib/departmentChat';
import { fetchAdminDashboard, reviewAdminRequest, type AdminDashboardData } from '@/lib/workspaceAdmin';

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
  const [workspaces, setWorkspaces] = useState<ChatWorkspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [data, setData] = useState<AdminDashboardData>({ members: [], requests: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async (id: string) => {
    setLoading(true); setError('');
    try { setData(await fetchAdminDashboard(id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '현황을 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void fetchChatWorkspaces().then((items) => {
      const manageable = items.filter((item) => item.role === 'owner' || item.role === 'admin');
      setWorkspaces(manageable); setWorkspaceId(manageable[0]?.id ?? '');
      if (manageable[0]) void loadDashboard(manageable[0].id); else setLoading(false);
    }).catch(() => { setError('관리 가능한 워크스페이스를 불러오지 못했습니다.'); setLoading(false); });
  }, [loadDashboard]);

  const review = async (userId: string, approve: boolean) => {
    if (!workspaceId) return;
    try { await reviewAdminRequest(workspaceId, userId, approve); await loadDashboard(workspaceId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '승인 요청을 처리하지 못했습니다.'); }
  };

  return <div className="space-y-5">
    <section className="card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><ShieldCheck className="text-blue-600" size={20}/><h2 className="font-black text-slate-950">워크스페이스 관리</h2></div><p className="mt-1 text-xs text-slate-500">관리자 현황 열람은 보안을 위해 기록됩니다.</p></div><div className="flex gap-2"><select value={workspaceId} onChange={(event) => { setWorkspaceId(event.target.value); void loadDashboard(event.target.value); }} className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold"><option value="">워크스페이스 선택</option>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" onClick={() => workspaceId && void loadDashboard(workspaceId)} aria-label="새로고침" className="grid size-10 place-items-center rounded-xl border border-slate-300"><RefreshCw size={17}/></button></div></div></section>

    {!workspaceId && <div className="card p-8 text-center text-sm text-slate-500">소유자 또는 승인된 관리자 권한이 있는 워크스페이스가 없습니다.</div>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
    {workspaceId && data.requests.length > 0 && <section className="card overflow-hidden"><header className="border-b border-slate-200 px-5 py-4"><h2 className="font-black">관리자 승인 대기</h2><p className="mt-1 text-xs text-slate-500">워크스페이스 소유자와 관리자가 승인하거나 거절할 수 있습니다.</p></header><ul className="divide-y divide-slate-100">{data.requests.map((request) => <li key={request.userId} className="flex items-center justify-between gap-3 px-5 py-3"><div><strong className="text-sm">{request.nickname}</strong><p className="text-xs text-slate-400">{new Date(request.requestedAt).toLocaleString('ko-KR')} 신청</p></div><div className="flex gap-2"><button type="button" onClick={() => void review(request.userId, false)} className="flex h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-bold"><X size={14}/>거절</button><button type="button" onClick={() => void review(request.userId, true)} className="flex h-9 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white"><Check size={14}/>승인</button></div></li>)}</ul></section>}

    {workspaceId && <section className="card overflow-hidden"><header className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-black">오늘의 부서원 현황</h2><p className="mt-1 text-xs text-slate-500">정확한 위치는 직원이 출근 시 동의한 동안에만 표시됩니다.</p></div><span className="text-xs font-bold text-slate-500">{data.members.length}명</span></header>{loading ? <div className="grid min-h-56 place-items-center"><LoaderCircle className="animate-spin text-blue-600"/></div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3">부서원</th><th className="px-4 py-3">권한</th><th className="px-4 py-3">출퇴근 상태</th><th className="px-4 py-3">시작 시각</th><th className="px-4 py-3">현재 위치</th><th className="px-4 py-3">갱신</th></tr></thead><tbody className="divide-y divide-slate-100">{data.members.map((member) => { const sharing = member.latitude !== null && member.longitude !== null; return <tr key={member.userId} className="hover:bg-slate-50"><td className="px-5 py-3 font-bold text-slate-950">{member.nickname}</td><td className="px-4 py-3 text-xs text-slate-500">{member.role === 'owner' ? '소유자' : member.role === 'admin' ? '관리자' : '멤버'}</td><td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-bold ${sharing ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{sharing && <span className="size-1.5 animate-pulse rounded-full bg-emerald-500"/>}{statusLabel(member.commuteType, member.endTime, sharing)}</span></td><td className="px-4 py-3 text-xs text-slate-500">{member.startTime ? new Date(member.startTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'}</td><td className="px-4 py-3">{sharing ? <a href={`https://map.kakao.com/link/map/${encodeURIComponent(member.nickname)},${member.latitude},${member.longitude}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-blue-700"><MapPin size={14}/>{member.latitude?.toFixed(6)}, {member.longitude?.toFixed(6)}<ExternalLink size={12}/></a> : <span className="text-xs text-slate-400">공유 안 함</span>}</td><td className="px-4 py-3 text-xs text-slate-500">{member.locationUpdatedAt ? <span className="flex items-center gap-1"><Clock3 size={13}/>{new Date(member.locationUpdatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span> : '-'}</td></tr>; })}</tbody></table></div>}</section>}
  </div>;
}
