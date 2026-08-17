import { supabase } from './supabase';

export type WorkspaceRole = 'owner' | 'admin' | 'member';
export interface ChatWorkspace { id: string; name: string; ownerId: string; role: WorkspaceRole; createdAt: string }
export interface ChatChannel { id: string; workspaceId: string; name: string; slug: string; description: string }
export interface ChatAttachment { path: string; name: string; type: string; size: number }
export interface ChatMessage { id: string; channelId: string; authorId: string; author: string; content: string; createdAt: string; attachment: ChatAttachment | null }
interface MessageRow { id: string; channel_id: string; author_id: string; content: string; created_at: string; attachment_path?: string | null; attachment_name?: string | null; attachment_type?: string | null; attachment_size?: number | null }
interface ChatProfileRow { id: string; nickname: string | null; username: string | null }

export const CHAT_MESSAGE_MAX = 1000;
export const CHAT_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const CHAT_FILE_BUCKET = 'chat-files';
const MESSAGE_COLUMNS = 'id, channel_id, author_id, content, created_at, attachment_path, attachment_name, attachment_type, attachment_size';

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
  const attachment: ChatAttachment | null = row.attachment_path
    ? { path: row.attachment_path, name: row.attachment_name || '첨부 파일', type: row.attachment_type || 'application/octet-stream', size: row.attachment_size ?? 0 }
    : null;
  return { id: row.id, channelId: row.channel_id, authorId: row.author_id, author: authors.get(row.author_id) ?? '동료', content: row.content, createdAt: row.created_at, attachment };
}

export async function fetchChannelMessages(channelId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase.from('chat_messages').select(MESSAGE_COLUMNS).eq('channel_id', channelId).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  const rows = ((data ?? []) as MessageRow[]).reverse();
  const authors = await fetchChatProfiles(rows.map((row) => row.author_id));
  return rows.map((row) => toMessage(row, authors));
}

export async function createChannelMessage(channelId: string, content: string, attachment?: ChatAttachment | null): Promise<ChatMessage> {
  const cleanContent = content.trim();
  if (!cleanContent && !attachment) throw new Error('메시지나 파일 중 하나는 있어야 합니다.');
  if (cleanContent.length > CHAT_MESSAGE_MAX) throw new Error(`메시지는 ${CHAT_MESSAGE_MAX}자까지 입력할 수 있습니다.`);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인 후 메시지를 보낼 수 있습니다.');
  const payload = {
    channel_id: channelId,
    author_id: user.id,
    content: cleanContent,
    attachment_path: attachment?.path ?? null,
    attachment_name: attachment?.name ?? null,
    attachment_type: attachment?.type ?? null,
    attachment_size: attachment?.size ?? null,
  };
  const { data, error } = await supabase.from('chat_messages').insert(payload).select(MESSAGE_COLUMNS).single();
  if (error) throw error;
  const row = data as MessageRow;
  const authors = await fetchChatProfiles([row.author_id]);
  return toMessage(row, authors);
}

function fileKey(name: string) {
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) : '';
  // 한글·공백이 섞인 원본 이름은 Storage 키로 쓰지 않고 DB 컬럼에만 남깁니다.
  return extension ? `${crypto.randomUUID()}.${extension}` : crypto.randomUUID();
}

export function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

export function isImageAttachment(attachment: ChatAttachment) {
  return attachment.type.startsWith('image/');
}

export async function uploadChatFile(workspaceId: string, channelId: string, file: File): Promise<ChatAttachment> {
  if (!file.size) throw new Error('빈 파일은 보낼 수 없습니다.');
  if (file.size > CHAT_FILE_MAX_BYTES) throw new Error(`파일은 ${formatFileSize(CHAT_FILE_MAX_BYTES)}까지 보낼 수 있습니다.`);
  const path = `${workspaceId}/${channelId}/${fileKey(file.name)}`;
  const { error } = await supabase.storage.from(CHAT_FILE_BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) throw new Error(`파일을 올리지 못했습니다. ${error.message}`);
  return { path, name: file.name.slice(0, 120), type: file.type || 'application/octet-stream', size: file.size };
}

export async function signChatFiles(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)];
  if (!unique.length) return new Map();
  const { data, error } = await supabase.storage.from(CHAT_FILE_BUCKET).createSignedUrls(unique, 3600);
  if (error) throw error;
  const signed = new Map<string, string>();
  (data ?? []).forEach((item) => { if (item.path && item.signedUrl) signed.set(item.path, item.signedUrl); });
  return signed;
}

export async function hydrateRealtimeMessage(row: MessageRow): Promise<ChatMessage> {
  const authors = await fetchChatProfiles([row.author_id]);
  return toMessage(row, authors);
}
