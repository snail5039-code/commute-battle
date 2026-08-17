import { supabase } from './supabase';
import { attendanceWorkspaceId } from './attendance';

// 재택근무는 승인된 날만 기록됩니다. 요일별 근무 형태(기기 설정)와 달리, 이 승인은 서버에 남고
// 재택 기록 RPC가 직접 확인합니다.

export type RemoteWorkStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface RemoteWorkRequest {
  id: string;
  userId: string;
  nickname: string;
  workDate: string;
  reason: string;
  status: RemoteWorkStatus;
  reviewerNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  isMine: boolean;
  selfApproved: boolean;
}

export const REMOTE_STATUS_LABEL: Record<RemoteWorkStatus, string> = {
  pending: '승인 대기',
  approved: '승인',
  rejected: '반려',
  cancelled: '취소',
};

function rpcError(cause: { code?: string; message?: string }, fallback: string) {
  if (cause.code === 'PGRST202') return new Error('재택근무 승인 서버 설정(202608170008 마이그레이션)이 아직 적용되지 않았습니다.');
  if (cause.code === '42501') return new Error('권한이 없습니다. 로그인 상태를 확인해 주세요.');
  return new Error(cause.message || fallback);
}

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export async function requestRemoteWork(workspaceId: string, workDate: string, reason: string) {
  const { data, error } = await supabase.rpc('request_remote_work', { target_workspace_id: workspaceId, target_date: workDate, reason });
  if (error) throw rpcError(error, '재택근무를 신청하지 못했습니다.');
  return data as string;
}

export async function cancelRemoteWork(requestId: string) {
  const { error } = await supabase.rpc('cancel_remote_work', { target_request_id: requestId });
  if (error) throw rpcError(error, '신청을 취소하지 못했습니다.');
}

export async function reviewRemoteWork(requestId: string, approve: boolean, note?: string) {
  const { error } = await supabase.rpc('review_remote_work', { target_request_id: requestId, approve, note: note ?? null });
  if (error) throw rpcError(error, '신청을 처리하지 못했습니다.');
}

export async function fetchRemoteWork(workspaceId: string, from: string, to: string, onlyPending = false): Promise<RemoteWorkRequest[]> {
  const { data, error } = await supabase.rpc('list_remote_work', {
    target_workspace_id: workspaceId, from_date: from, to_date: to, only_pending: onlyPending,
  });
  if (error) throw rpcError(error, '재택근무 신청을 불러오지 못했습니다.');
  return (data ?? []) as RemoteWorkRequest[];
}

// 오늘 승인된 재택근무가 있으면 기기 설정과 상관없이 재택으로 취급합니다.
export async function isRemoteApprovedToday(): Promise<boolean> {
  const workspaceId = await attendanceWorkspaceId();
  if (!workspaceId) return false;
  const today = localDate();
  const { data, error } = await supabase
    .from('remote_work_requests')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('work_date', today)
    .eq('status', 'approved')
    .limit(1);
  if (error) return false;
  return Boolean(data?.length);
}
