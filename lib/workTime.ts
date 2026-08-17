import { supabase } from './supabase';

// 근무시간 집계는 서버(get_attendance_summary)에서만 계산합니다. 여기서는 표시와 내보내기만 담당합니다.

export type AttendanceStatus = 'complete' | 'incomplete' | 'vacation' | 'sick' | 'absence' | 'early_leave';

export interface WorkPolicy {
  workspaceId: string;
  workStart: string;
  workEnd: string;
  dailyRegularMinutes: number;
  weeklyRegularMinutes: number;
  weeklyLimitMinutes: number;
  breakMinutes: number;
  nightStart: string;
  nightEnd: string;
  updatedAt: string | null;
}

export interface AttendanceDay {
  userId: string;
  nickname: string;
  date: string;
  workIn: string | null;
  workOut: string | null;
  workedMinutes: number;
  breakMinutes: number;
  overtimeMinutes: number;
  nightMinutes: number;
  holidayMinutes: number;
  lateMinutes: number;
  earlyOutMinutes: number;
  isHoliday: boolean;
  isRemote: boolean;
  status: AttendanceStatus;
  openRecords: number;
}

export interface AttendanceWeek {
  userId: string;
  nickname: string;
  weekStart: string;
  workedMinutes: number;
  overtimeMinutes: number;
  overLimit: boolean;
}

export interface AttendanceSummary {
  policy: WorkPolicy;
  scopedToSelf: boolean;
  days: AttendanceDay[];
  weeks: AttendanceWeek[];
}

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  complete: '정상',
  incomplete: '기록 미완료',
  vacation: '휴가',
  sick: '병가',
  absence: '결근',
  early_leave: '조퇴',
};

export function formatMinutes(minutes: number) {
  const total = Math.max(0, Math.round(minutes));
  if (!total) return '0분';
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest}분`;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

export function formatHours(minutes: number) {
  return `${(Math.max(0, minutes) / 60).toFixed(1)}h`;
}

export function formatClock(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function monthRange(base = new Date()) {
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const last = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { from: key(first), to: key(last) };
}

function rpcError(cause: { code?: string; message?: string }, fallback: string) {
  if (cause.code === 'PGRST202') return new Error('근무시간 집계 서버 설정(202608170007 마이그레이션)이 아직 적용되지 않았습니다.');
  if (cause.code === '42501') return new Error('권한이 없습니다. 로그인 상태를 확인해 주세요.');
  return new Error(cause.message || fallback);
}

export async function fetchAttendanceSummary(workspaceId: string, from: string, to: string, userId?: string): Promise<AttendanceSummary> {
  const { data, error } = await supabase.rpc('get_attendance_summary', {
    target_workspace_id: workspaceId,
    from_date: from,
    to_date: to,
    target_user_id: userId ?? null,
  });
  if (error) throw rpcError(error, '근태 집계를 불러오지 못했습니다.');
  return data as AttendanceSummary;
}

export async function saveWorkPolicy(workspaceId: string, policy: Omit<WorkPolicy, 'workspaceId' | 'updatedAt'>) {
  const { error } = await supabase.rpc('upsert_work_policy', {
    target_workspace_id: workspaceId,
    new_work_start: policy.workStart,
    new_work_end: policy.workEnd,
    new_daily_regular_minutes: policy.dailyRegularMinutes,
    new_weekly_regular_minutes: policy.weeklyRegularMinutes,
    new_weekly_limit_minutes: policy.weeklyLimitMinutes,
    new_break_minutes: policy.breakMinutes,
    new_night_start: policy.nightStart,
    new_night_end: policy.nightEnd,
  });
  if (error) throw rpcError(error, '근무 정책을 저장하지 못했습니다.');
}

// 급여 담당자에게 넘기는 용도라 엑셀에서 바로 열리는 CSV로 만듭니다(BOM 포함).
export function attendanceCsv(days: AttendanceDay[]) {
  const header = ['이름', '날짜', '근무형태', '출근', '퇴근', '근무(분)', '휴게(분)', '연장(분)', '야간(분)', '휴일(분)', '지각(분)', '조기퇴근(분)', '상태'];
  const rows = days.map((day) => [
    day.nickname,
    day.date,
    day.isRemote ? '재택' : '사무실',
    formatClock(day.workIn),
    formatClock(day.workOut),
    day.workedMinutes,
    day.breakMinutes,
    day.overtimeMinutes,
    day.nightMinutes,
    day.holidayMinutes,
    day.lateMinutes,
    day.earlyOutMinutes,
    STATUS_LABEL[day.status],
  ]);
  const escape = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `﻿${[header, ...rows].map((row) => row.map(escape).join(',')).join('\r\n')}`;
}

export function downloadCsv(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
