import { supabase } from './supabase';
import { fetchChatWorkspaces } from './departmentChat';
import { captureLocation, locationParams, NO_LOCATION } from './geofence';
import type { CommuteRecord } from './types';

// 근태 기록은 모두 서버 RPC를 통해서만 만들어집니다. 브라우저가 시각을 정하면 PC 시계만 바꿔도
// 출퇴근 시각을 조작할 수 있어서, 임금 근거로 쓸 수 있는 데이터가 되지 못합니다.
//
// 위치도 같은 이유로 서버가 판정합니다. 여기서는 근무시간 산정에 실제로 쓰이는 두 시점에만
// 좌표를 실어 보냅니다 — 출근의 '도착'(근무 시작)과 퇴근의 '출발'(근무 종료).

export type CorrectionStatus = 'pending' | 'approved' | 'rejected';

export interface CorrectionRequest {
  id: string;
  recordId: string;
  userId: string;
  nickname: string;
  status: CorrectionStatus;
  reason: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewerNote: string | null;
  requestedStart: string | null;
  requestedEnd: string | null;
  requestedType: string | null;
  currentDate: string | null;
  currentType: string | null;
  currentStart: string | null;
  currentEnd: string | null;
  isMine: boolean;
}

export interface MyCorrectionRequest {
  id: string;
  recordId: string;
  status: CorrectionStatus;
  reason: string;
  createdAt: string;
  reviewerNote: string | null;
  requestedStart: string | null;
  requestedEnd: string | null;
  requestedType: string | null;
}

const MISSING_FUNCTION = 'PGRST202';
const SETUP_MESSAGE = '근태 기록 서버 설정(202608170002 마이그레이션)이 아직 적용되지 않았습니다. Supabase SQL Editor에서 실행해 주세요.';

function toError(cause: unknown, fallback: string): Error {
  const error = cause as { code?: string; message?: string } | null;
  if (error?.code === MISSING_FUNCTION) return new Error(SETUP_MESSAGE);
  // 42501은 Postgres 권한 오류입니다. 원문(영문)을 그대로 보여주면 사용자가 이해하기 어렵습니다.
  if (error?.code === '42501') return new Error('권한이 없습니다. 로그인 상태를 확인해 주세요.');
  return new Error(error?.message || fallback);
}

// 기록이 어느 회사(워크스페이스) 것인지 남겨야 관리자가 확인하고 정정을 승인할 수 있습니다.
let workspaceCache: { id: string | null; loadedAt: number } | null = null;

export async function attendanceWorkspaceId(): Promise<string | null> {
  if (workspaceCache && Date.now() - workspaceCache.loadedAt < 300_000) return workspaceCache.id;
  const id = await fetchChatWorkspaces().then((items) => items[0]?.id ?? null).catch(() => null);
  workspaceCache = { id, loadedAt: Date.now() };
  return id;
}

export function clearAttendanceWorkspaceCache() {
  workspaceCache = null;
}

async function callRecordRpc(name: string, params: Record<string, unknown>): Promise<CommuteRecord> {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw toError(error, '근태 기록에 실패했습니다.');
  return data as CommuteRecord;
}

// 출근의 '출발'은 집을 나서는 순간이라 사업장 밖이 정상입니다. 퇴근 출발만 위치를 확인합니다.
export async function startAttendance(type: 'commute' | 'return'): Promise<CommuteRecord> {
  const fix = type === 'return' ? await captureLocation() : NO_LOCATION;
  return callRecordRpc('attendance_start', {
    record_type: type,
    target_workspace_id: await attendanceWorkspaceId(),
    ...locationParams(fix),
  });
}

// 반대로 퇴근의 '도착'은 집에 들어가는 순간이라 확인하지 않습니다.
export async function finishAttendance(recordId: string, selfOnTime: boolean, recordType: CommuteRecord['type']): Promise<CommuteRecord> {
  const fix = recordType === 'commute' ? await captureLocation() : NO_LOCATION;
  return callRecordRpc('attendance_finish', {
    target_record_id: recordId,
    self_on_time: selfOnTime,
    ...locationParams(fix),
  });
}

export async function recordInstantAttendance(type: 'commute' | 'return'): Promise<CommuteRecord> {
  return callRecordRpc('attendance_record_instant', { record_type: type, target_workspace_id: await attendanceWorkspaceId() });
}

export async function recordAttendanceEvent(type: 'early_leave' | 'vacation' | 'sick' | 'absence'): Promise<CommuteRecord> {
  return callRecordRpc('attendance_record_event', { record_type: type, target_workspace_id: await attendanceWorkspaceId() });
}

export async function requestCorrection(input: { recordId: string; start?: string | null; end?: string | null; type?: string | null; reason: string }) {
  const { data, error } = await supabase.rpc('request_commute_correction', {
    target_record_id: input.recordId,
    new_start: input.start ?? null,
    new_end: input.end ?? null,
    new_type: input.type ?? null,
    reason: input.reason,
  });
  if (error) throw toError(error, '정정 요청을 보내지 못했습니다.');
  return data as string;
}

export async function fetchMyCorrections(recordIds?: string[]): Promise<MyCorrectionRequest[]> {
  let query = supabase
    .from('commute_correction_requests')
    .select('id, record_id, status, reason, created_at, reviewer_note, requested_start, requested_end, requested_type')
    .order('created_at', { ascending: false })
    .limit(100);
  if (recordIds?.length) query = query.in('record_id', recordIds);
  const { data, error } = await query;
  if (error) throw toError(error, '정정 요청 내역을 불러오지 못했습니다.');
  return (data ?? []).map((row) => ({
    id: row.id,
    recordId: row.record_id,
    status: row.status as CorrectionStatus,
    reason: row.reason,
    createdAt: row.created_at,
    reviewerNote: row.reviewer_note,
    requestedStart: row.requested_start,
    requestedEnd: row.requested_end,
    requestedType: row.requested_type,
  }));
}

export async function fetchWorkspaceCorrections(workspaceId: string, includeReviewed = false): Promise<CorrectionRequest[]> {
  const { data, error } = await supabase.rpc('list_commute_corrections', { target_workspace_id: workspaceId, include_reviewed: includeReviewed });
  if (error) throw toError(error, '정정 요청을 불러오지 못했습니다.');
  return (data ?? []) as CorrectionRequest[];
}

export async function reviewCorrection(requestId: string, approve: boolean, note?: string) {
  const { error } = await supabase.rpc('review_commute_correction', { target_request_id: requestId, approve, note: note ?? null });
  if (error) throw toError(error, '정정 요청을 처리하지 못했습니다.');
}

export interface AuditEntry {
  id: number;
  recordId: string;
  userId: string;
  action: 'insert' | 'update' | 'delete';
  actorId: string | null;
  loggedAt: string;
  beforeStart: string | null;
  afterStart: string | null;
  beforeEnd: string | null;
  afterEnd: string | null;
  beforeType: string | null;
  afterType: string | null;
}

export async function fetchAttendanceAudit(workspaceId: string, userId?: string, maxRows = 100): Promise<AuditEntry[]> {
  const { data, error } = await supabase.rpc('get_commute_audit', { target_workspace_id: workspaceId, target_user_id: userId ?? null, max_rows: maxRows });
  if (error) throw toError(error, '변경 이력을 불러오지 못했습니다.');
  return (data ?? []) as AuditEntry[];
}
