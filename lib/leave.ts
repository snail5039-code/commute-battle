import { supabase } from './supabase';

// 휴가는 신청 → 관리자 승인으로만 잡힙니다. 승인되면 그 기간의 근무일마다 휴가 기록을
// 서버가 직접 만듭니다(직원이 버튼으로 만들 수 있게 두면 승인 없는 휴가가 다시 생깁니다).
//
// 며칠을 쓰는지도 서버가 셉니다 — 주말과 등록된 공휴일은 빼고 셉니다.
// 연차 발생 일수는 자동 산정하지 않습니다. 관리자가 연도별로 부여 일수를 입력합니다.

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type LeaveKind = 'annual' | 'half_am' | 'half_pm';

export interface LeaveRequest {
  id: string;
  userId: string;
  nickname: string;
  startDate: string;
  endDate: string;
  leaveType: LeaveKind;
  days: number;
  reason: string;
  status: LeaveStatus;
  reviewerNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  isMine: boolean;
  selfApproved: boolean;
}

export interface LeaveBalance {
  userId: string;
  nickname: string;
  year: number;
  grantedDays: number;
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
  note: string | null;
}

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: '승인 대기',
  approved: '승인',
  rejected: '반려',
  cancelled: '취소',
};

export const LEAVE_KIND_LABEL: Record<LeaveKind, string> = {
  annual: '연차',
  half_am: '반차(오전)',
  half_pm: '반차(오후)',
};

function rpcError(cause: { code?: string; message?: string }, fallback: string) {
  if (cause.code === 'PGRST202') return new Error('휴가 서버 설정(202608180002 마이그레이션)이 아직 적용되지 않았습니다.');
  if (cause.code === '42501') return new Error('권한이 없습니다. 로그인 상태를 확인해 주세요.');
  return new Error(cause.message || fallback);
}

export function formatDays(days: number) {
  return Number.isInteger(days) ? `${days}일` : `${days}일`;
}

export function leaveRangeLabel(request: Pick<LeaveRequest, 'startDate' | 'endDate'>) {
  return request.startDate === request.endDate ? request.startDate : `${request.startDate} ~ ${request.endDate}`;
}

export async function fetchLeaves(workspaceId: string, from: string, to: string, onlyPending = false): Promise<LeaveRequest[]> {
  const { data, error } = await supabase.rpc('list_leaves', {
    target_workspace_id: workspaceId, from_date: from, to_date: to, only_pending: onlyPending,
  });
  if (error) throw rpcError(error, '휴가 신청을 불러오지 못했습니다.');
  return (data ?? []) as LeaveRequest[];
}

export async function fetchLeaveBalance(workspaceId: string, year: number, userId?: string): Promise<LeaveBalance[]> {
  const { data, error } = await supabase.rpc('get_leave_balance', {
    target_workspace_id: workspaceId, target_year: year, target_user_id: userId ?? null,
  });
  if (error) throw rpcError(error, '연차 잔여를 불러오지 못했습니다.');
  return (data ?? []) as LeaveBalance[];
}

export async function requestLeave(workspaceId: string, from: string, to: string, kind: LeaveKind, reason: string) {
  const { data, error } = await supabase.rpc('request_leave', {
    target_workspace_id: workspaceId, from_date: from, to_date: to, kind, reason,
  });
  if (error) throw rpcError(error, '휴가를 신청하지 못했습니다.');
  return data as string;
}

export async function cancelLeave(requestId: string) {
  const { error } = await supabase.rpc('cancel_leave', { target_request_id: requestId });
  if (error) throw rpcError(error, '신청을 취소하지 못했습니다.');
}

export async function reviewLeave(requestId: string, approve: boolean, note?: string) {
  const { error } = await supabase.rpc('review_leave', {
    target_request_id: requestId, approve, note: note?.trim() || null,
  });
  if (error) throw rpcError(error, '신청을 처리하지 못했습니다.');
}

export async function setLeaveGrant(workspaceId: string, userId: string, year: number, days: number, note?: string) {
  const { error } = await supabase.rpc('set_leave_grant', {
    target_workspace_id: workspaceId, target_user_id: userId, target_year: year, days, note: note?.trim() || null,
  });
  if (error) throw rpcError(error, '연차 부여 일수를 저장하지 못했습니다.');
}
