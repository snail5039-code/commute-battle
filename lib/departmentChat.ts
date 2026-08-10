import { supabase } from './supabase';

export type WorkspaceRole = 'owner' | 'admin' | 'member';
export interface ChatWorkspace { id: string; name: string; ownerId: string; role: WorkspaceRole; createdAt: string }
export interface ChatChannel { id: string; workspaceId: string; name: string; slug: string; description: string }
export interface ChatMessage { id: string; channelId: string; authorId: string; author: string; content: string; createdAt: string }
interface MessageRow { id: string; channel_id: string; author_id: string; content: string; created_at: string }
interface ChatProfileRow { id: string; nickname: string | null; username: string | null }

export const CHAT_MESSAGE_MAX = 1000;

export async function fetchChatWorkspaces(): Promise<ChatWorkspace[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');
  const { data: memberships, error: memberError } = await supabase.from('chat_workspace_members').select('workspace_id, role').eq('user_id', user.id);
  if (memberError) throw memberError;
  const roleById = new Map((memberships ?? []).map((item) => [item.workspace_id, item.role as WorkspaceRole]));
  const { data, error } = await supabase.from('chat_workspaces').select('id, name, owner_id, created_at').order('created_at');
  if (error) throw error;
  return (data ?? []).map((item) => ({ id: item.id, name: item.name, ownerId: item.owner_id, role: roleById.get(item.id) ?? 'admin', createdAt: item.created_at }));
}

export async function fetchWorkspaceChannels(workspaceId: string): Promise<ChatChannel[]> {
  const { data, error } = await supabase.from('chat_channels').select('id, workspace_id, name, slug, description').eq('workspace_id', workspaceId).order('sort_order');
  if (error) throw error;
  return (data ?? []).map((item) => ({ id: item.id, workspaceId: item.workspace_id, name: item.name, slug: item.slug, description: item.description }));
}

export async function createChatWorkspace(name: string) {
  const { data, error } = await supabase.rpc('create_chat_workspace', { workspace_name: name.trim() });
  if (error) throw error;
  return data as string;
}

export async function createChatChannel(workspaceId: string, name: string) {
  const { data, error } = await supabase.rpc('create_chat_channel', { target_workspace_id: workspaceId, channel_name: name.trim() });
  if (error) throw error;
  return data as string;
}

export async function createWorkspaceInvite(workspaceId: string) {
  const { data, error } = await supabase.rpc('create_chat_workspace_invite', { target_workspace_id: workspaceId });
  if (error) throw error;
  return data as string;
}

export async function acceptWorkspaceInvite(code: string) {
  const { data, error } = await supabase.rpc('accept_chat_workspace_invite', { invite_code: code.trim() });
  if (error) throw error;
  return data as string;
}

export async function fetchChatProfiles(ids: string[]) {
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length) return new Map<string, string>();
  const { data, error } = await supabase.rpc('get_chat_member_profiles', { target_user_ids: uniqueIds });
  if (error) throw error;
  return new Map<string, string>(((data ?? []) as ChatProfileRow[]).map((user) => [user.id, user.nickname || user.username || '동료']));
}

function toMessage(row: MessageRow, authors: Map<string, string>): ChatMessage {
  return { id: row.id, channelId: row.channel_id, authorId: row.author_id, author: authors.get(row.author_id) ?? '동료', content: row.content, createdAt: row.created_at };
}

export async function fetchChannelMessages(channelId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase.from('chat_messages').select('id, channel_id, author_id, content, created_at').eq('channel_id', channelId).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  const rows = ((data ?? []) as MessageRow[]).reverse();
  const authors = await fetchChatProfiles(rows.map((row) => row.author_id));
  return rows.map((row) => toMessage(row, authors));
}

export async function createChannelMessage(channelId: string, content: string): Promise<ChatMessage> {
  const cleanContent = content.trim();
  if (!cleanContent || cleanContent.length > CHAT_MESSAGE_MAX) throw new Error(`메시지는 1~${CHAT_MESSAGE_MAX}자로 입력해 주세요.`);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인 후 메시지를 보낼 수 있습니다.');
  const { data, error } = await supabase.from('chat_messages').insert({ channel_id: channelId, author_id: user.id, content: cleanContent }).select('id, channel_id, author_id, content, created_at').single();
  if (error) throw error;
  const row = data as MessageRow;
  const authors = await fetchChatProfiles([row.author_id]);
  return toMessage(row, authors);
}

export async function hydrateRealtimeMessage(row: MessageRow): Promise<ChatMessage> {
  const authors = await fetchChatProfiles([row.author_id]);
  return toMessage(row, authors);
}
