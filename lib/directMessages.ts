import { supabase } from './supabase';
import { fetchChatProfiles } from './departmentChat';

export interface DirectMember { userId: string; name: string }
export interface DirectThread { id: string; workspaceId: string; otherUserId: string; otherName: string }
export interface DirectMessage { id: string; threadId: string; authorId: string; content: string; createdAt: string }

export async function fetchWorkspaceMembers(workspaceId: string): Promise<DirectMember[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');
  const { data: members, error } = await supabase.from('chat_workspace_members').select('user_id').eq('workspace_id', workspaceId).neq('user_id', user.id);
  if (error) throw error;
  const ids = (members ?? []).map((item) => item.user_id);
  if (!ids.length) return [];
  const names = await fetchChatProfiles(ids);
  return ids.map((userId) => ({ userId, name: names.get(userId) ?? '동료' }));
}

export async function fetchDirectThreads(workspaceId: string): Promise<DirectThread[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');
  const { data, error } = await supabase.from('chat_direct_threads').select('id, workspace_id, user_low, user_high').eq('workspace_id', workspaceId).or(`user_low.eq.${user.id},user_high.eq.${user.id}`).order('created_at');
  if (error) throw error;
  const rows = data ?? [];
  const otherIds = rows.map((item) => item.user_low === user.id ? item.user_high : item.user_low);
  const names = await fetchChatProfiles(otherIds);
  return rows.map((item) => { const otherUserId = item.user_low === user.id ? item.user_high : item.user_low; return { id: item.id, workspaceId: item.workspace_id, otherUserId, otherName: names.get(otherUserId) ?? '동료' }; });
}

export async function startDirectThread(workspaceId: string, userId: string) {
  const { data, error } = await supabase.rpc('start_direct_thread', { target_workspace_id: workspaceId, target_user_id: userId });
  if (error) throw error;
  return data as string;
}

export async function fetchDirectMessages(threadId: string): Promise<DirectMessage[]> {
  const { data, error } = await supabase.from('chat_direct_messages').select('id, thread_id, author_id, content, created_at').eq('thread_id', threadId).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []).reverse().map((item) => ({ id: item.id, threadId: item.thread_id, authorId: item.author_id, content: item.content, createdAt: item.created_at }));
}

export async function sendDirectMessage(threadId: string, content: string): Promise<DirectMessage> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');
  const clean = content.trim(); if (!clean || clean.length > 1000) throw new Error('메시지는 1~1000자로 입력해 주세요.');
  const { data, error } = await supabase.from('chat_direct_messages').insert({ thread_id: threadId, author_id: user.id, content: clean }).select('id, thread_id, author_id, content, created_at').single();
  if (error) throw error;
  return { id: data.id, threadId: data.thread_id, authorId: data.author_id, content: data.content, createdAt: data.created_at };
}
