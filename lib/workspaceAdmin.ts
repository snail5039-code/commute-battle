import { supabase } from './supabase';

export interface AdminMemberStatus {
  userId: string; role: 'owner' | 'admin' | 'member'; nickname: string;
  commuteType: string | null; startTime: string | null; endTime: string | null;
  latitude: number | null; longitude: number | null; accuracy: number | null; locationUpdatedAt: string | null;
}
export interface AdminRequest { userId: string; nickname: string; requestedAt: string }
export interface AdminDashboardData { members: AdminMemberStatus[]; requests: AdminRequest[] }

export async function fetchAdminDashboard(workspaceId: string): Promise<AdminDashboardData> {
  const { data, error } = await supabase.rpc('get_chat_admin_dashboard', { target_workspace_id: workspaceId });
  if (error) throw error;
  return data as AdminDashboardData;
}

export async function reviewAdminRequest(workspaceId: string, userId: string, approve: boolean) {
  const { error } = await supabase.rpc('review_chat_admin_request', { target_workspace_id: workspaceId, target_user_id: userId, approve });
  if (error) throw error;
}

export async function updateCommuteLocation(workspaceId: string, position: GeolocationPosition) {
  const { error } = await supabase.rpc('update_chat_commute_location', { target_workspace_id: workspaceId, lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy });
  if (error) throw error;
}

export async function stopCommuteLocation() {
  const { error } = await supabase.rpc('stop_chat_commute_location');
  if (error) throw error;
}

export function locationShareKey(userId: string) { return `commute-battle:exact-location-share:${userId}`; }
