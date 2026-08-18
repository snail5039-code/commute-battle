import { supabase } from './supabase';

// 조직(부서·직급). 서버 정의는 `supabase/migrations/202608180004_org.sql`.
//
// 직급은 권한이 아닙니다. rank는 늘어놓는 순서일 뿐이고, 무엇을 보고 무엇을 승인할 수 있는지는
// 지금처럼 role(owner/admin/member)이 정합니다. 이 둘을 섞으면 권한이 어디서 오는지
// 아무도 설명하지 못하게 됩니다.
//
// 근무시간 집계(get_attendance_summary)는 이 정보를 모릅니다. 화면이 여기서 따로 받아
// userId로 맞춰 붙입니다 — 임금이 걸린 함수를 부서 표시 때문에 고치지 않으려고 그렇게 뒀습니다.

export interface OrgDepartment {
  id: string;
  name: string;
  sortOrder: number;
  memberCount: number;
}

export interface OrgPosition {
  id: string;
  name: string;
  rank: number;
  memberCount: number;
}

export interface OrgMember {
  userId: string;
  nickname: string;
  role: 'owner' | 'admin' | 'member';
  departmentId: string | null;
  departmentName: string | null;
  positionId: string | null;
  positionName: string | null;
  positionRank: number | null;
}

export interface Org {
  departments: OrgDepartment[];
  positions: OrgPosition[];
  members: OrgMember[];
}

export const EMPTY_ORG: Org = { departments: [], positions: [], members: [] };

function rpcError(cause: { code?: string; message?: string }, fallback: string) {
  if (cause.code === 'PGRST202') return new Error('조직 서버 설정(202608180004 마이그레이션)이 아직 적용되지 않았습니다.');
  if (cause.code === '42501') return new Error('권한이 없습니다. 로그인 상태를 확인해 주세요.');
  return new Error(cause.message || fallback);
}

// 부서·직급·배정을 한 번에 받습니다. 셋을 따로 부르면 그 사이에 바뀐 배정이 어긋나 보입니다.
export async function fetchOrg(workspaceId: string): Promise<Org> {
  const { data, error } = await supabase.rpc('list_org', { target_workspace_id: workspaceId });
  if (error) throw rpcError(error, '조직 정보를 불러오지 못했습니다.');
  return { ...EMPTY_ORG, ...(data as Partial<Org> | null) };
}

// id가 null이면 새로 만들고, 있으면 그 부서를 고칩니다.
export async function saveDepartment(
  workspaceId: string, id: string | null, name: string, sortOrder: number
): Promise<string> {
  const { data, error } = await supabase.rpc('save_department', {
    target_workspace_id: workspaceId, target_id: id, new_name: name, new_sort_order: sortOrder,
  });
  if (error) throw rpcError(error, '부서를 저장하지 못했습니다.');
  return data as string;
}

export async function deleteDepartment(workspaceId: string, id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_department', { target_workspace_id: workspaceId, target_id: id });
  if (error) throw rpcError(error, '부서를 삭제하지 못했습니다.');
}

export async function savePosition(
  workspaceId: string, id: string | null, name: string, rank: number
): Promise<string> {
  const { data, error } = await supabase.rpc('save_position', {
    target_workspace_id: workspaceId, target_id: id, new_name: name, new_rank: rank,
  });
  if (error) throw rpcError(error, '직급을 저장하지 못했습니다.');
  return data as string;
}

export async function deletePosition(workspaceId: string, id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_position', { target_workspace_id: workspaceId, target_id: id });
  if (error) throw rpcError(error, '직급을 삭제하지 못했습니다.');
}

export async function assignMemberOrg(
  workspaceId: string, userId: string, departmentId: string | null, positionId: string | null
): Promise<void> {
  const { error } = await supabase.rpc('assign_member_org', {
    target_workspace_id: workspaceId, target_user_id: userId,
    new_department_id: departmentId, new_position_id: positionId,
  });
  if (error) throw rpcError(error, '배정을 저장하지 못했습니다.');
}

// 근태 집계 행(userId를 가진 것이면 무엇이든)에 부서·직급을 붙일 때 씁니다.
export function orgByUserId(org: Org): Map<string, OrgMember> {
  return new Map(org.members.map((member) => [member.userId, member]));
}

export const UNASSIGNED = '미지정';
