import { supabase } from './supabase';
import type { AttendanceSummary } from './workTime';

// 월 마감은 "이 달 급여는 이 숫자"를 못 박는 장치입니다. 마감하면 그 달 정정 요청이 막히고,
// 마감 시점 집계가 스냅샷으로 박제됩니다. 나중에 원본이 바뀌어도 지급 근거는 남습니다.
//
// 마감/해제는 원장에 쌓입니다(덮어쓰지 않음). 재마감해도 이전 스냅샷이 지워지지 않습니다.

export interface MonthClosing {
  month: string;          // YYYY-MM-01
  closed: boolean;
  actedAt: string;
  actor: string;
  note: string | null;
  // 마감 이후에 새로 생기거나 바뀐 기록 수. 0이 아니면 스냅샷과 현재 값이 다릅니다.
  changedAfter: number;
}

function rpcError(cause: { code?: string; message?: string }, fallback: string) {
  if (cause.code === 'PGRST202') return new Error('월 마감 서버 설정(202608180001 마이그레이션)이 아직 적용되지 않았습니다.');
  if (cause.code === '42501') return new Error('권한이 없습니다. 로그인 상태를 확인해 주세요.');
  return new Error(cause.message || fallback);
}

export function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

export function monthLabel(month: string) {
  const [year, mon] = month.split('-');
  return `${year}년 ${Number(mon)}월`;
}

// 최근 n개월을 최신순으로. 이번 달은 아직 안 끝나서 마감할 수 없지만 상태는 보여 줍니다.
export function recentMonths(count = 12, base = new Date()) {
  return Array.from({ length: count }, (_, i) => monthKey(new Date(base.getFullYear(), base.getMonth() - i, 1)));
}

export function isMonthOver(month: string, now = new Date()) {
  const [year, mon] = month.split('-').map(Number);
  return new Date(year, mon, 1) <= new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function fetchClosings(workspaceId: string, fromMonth: string, toMonth: string): Promise<MonthClosing[]> {
  const { data, error } = await supabase.rpc('list_attendance_closings', {
    target_workspace_id: workspaceId, from_month: fromMonth, to_month: toMonth,
  });
  if (error) throw rpcError(error, '마감 내역을 불러오지 못했습니다.');
  return (data ?? []) as MonthClosing[];
}

export async function closeMonth(workspaceId: string, month: string, note?: string) {
  const { error } = await supabase.rpc('close_attendance_month', {
    target_workspace_id: workspaceId, target_month: month, note: note?.trim() || null,
  });
  if (error) throw rpcError(error, '마감하지 못했습니다.');
}

export async function reopenMonth(workspaceId: string, month: string, reason: string) {
  const { error } = await supabase.rpc('reopen_attendance_month', {
    target_workspace_id: workspaceId, target_month: month, reason,
  });
  if (error) throw rpcError(error, '마감을 해제하지 못했습니다.');
}

// 마감 시점에 박제된 집계. 급여 대장을 다시 뽑을 때 씁니다.
export async function fetchSnapshot(workspaceId: string, month: string): Promise<AttendanceSummary> {
  const { data, error } = await supabase.rpc('get_closing_snapshot', {
    target_workspace_id: workspaceId, target_month: month,
  });
  if (error) throw rpcError(error, '마감 스냅샷을 불러오지 못했습니다.');
  return data as AttendanceSummary;
}
