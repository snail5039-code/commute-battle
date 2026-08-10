import { supabase } from './supabase';

export interface Department {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
}

export interface ChatMessage {
  id: string;
  departmentId: string;
  authorId: string;
  author: string;
  content: string;
  createdAt: string;
}

interface MessageRow {
  id: string;
  department_id: string;
  author_id: string;
  content: string;
  created_at: string;
}

export const CHAT_MESSAGE_MAX = 1000;

export async function fetchDepartments(): Promise<Department[]> {
  const { data, error } = await supabase
    .from('departments')
    .select('id, name, slug, description, color')
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as Department[];
}

async function fetchAuthors(ids: string[]) {
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length) return new Map<string, string>();
  const { data } = await supabase.from('users').select('id, nickname, username').in('id', uniqueIds);
  return new Map((data ?? []).map((user) => [user.id, user.nickname || user.username || '동료']));
}

function toMessage(row: MessageRow, authors: Map<string, string>): ChatMessage {
  return {
    id: row.id,
    departmentId: row.department_id,
    authorId: row.author_id,
    author: authors.get(row.author_id) ?? '동료',
    content: row.content,
    createdAt: row.created_at,
  };
}

export async function fetchDepartmentMessages(departmentId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('department_messages')
    .select('id, department_id, author_id, content, created_at')
    .eq('department_id', departmentId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  const rows = ((data ?? []) as MessageRow[]).reverse();
  const authors = await fetchAuthors(rows.map((row) => row.author_id));
  return rows.map((row) => toMessage(row, authors));
}

export async function createDepartmentMessage(departmentId: string, content: string): Promise<ChatMessage> {
  const cleanContent = content.trim();
  if (!cleanContent || cleanContent.length > CHAT_MESSAGE_MAX) throw new Error(`메시지는 1~${CHAT_MESSAGE_MAX}자로 입력해 주세요.`);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인 후 메시지를 보낼 수 있습니다.');
  const { data, error } = await supabase
    .from('department_messages')
    .insert({ department_id: departmentId, author_id: user.id, content: cleanContent })
    .select('id, department_id, author_id, content, created_at')
    .single();
  if (error) throw error;
  const row = data as MessageRow;
  const authors = await fetchAuthors([row.author_id]);
  return toMessage(row, authors);
}

export async function hydrateRealtimeMessage(row: MessageRow): Promise<ChatMessage> {
  const authors = await fetchAuthors([row.author_id]);
  return toMessage(row, authors);
}
