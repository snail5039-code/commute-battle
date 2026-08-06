import { supabase } from './supabase';

export type CommunityCategory = 'notice' | 'free' | 'feedback';
export interface CommunityPost { id: string; category: CommunityCategory; title: string; content: string; author: string; createdAt: string; isLocal?: boolean }
interface PostRow { id: string; category: CommunityCategory; title: string; content: string; created_at: string }

export const COMMUNITY_STORAGE_KEY = 'commute-battle-community-posts-v1';
export const COMMUNITY_MIGRATION_DISMISSED_KEY = 'commute-battle-community-migration-dismissed-v1';
export const TITLE_MIN = 2, TITLE_MAX = 60, CONTENT_MIN = 5, CONTENT_MAX = 1200;
export const WRITABLE_CATEGORIES = ['free', 'feedback'] as const;
export const COMMUNITY_CATEGORIES: ReadonlyArray<{ id: CommunityCategory; label: string; description: string }> = [
  { id: 'notice', label: '공지사항', description: '서비스 이용 안내와 업데이트 소식' },
  { id: 'free', label: '자유게시판', description: '출퇴근 이야기를 자유롭게 나누는 공간' },
  { id: 'feedback', label: '의견·설명', description: '서비스 개선 아이디어를 남기는 공간' },
];
export const DEFAULT_NOTICES: CommunityPost[] = [
  { id: 'notice-welcome', category: 'notice', title: '출퇴근 배틀 커뮤니티에 오신 것을 환영합니다', content: '출퇴근 경험과 유용한 정보를 편안하게 나누는 공간입니다. 서로를 배려하는 표현으로 즐겁게 참여해 주세요.', author: '운영팀', createdAt: '2026-08-05T09:00:00+09:00' },
  { id: 'notice-shared', category: 'notice', title: '게시판이 모든 기기에서 공유됩니다', content: '자유게시판과 의견·설명에 작성한 글은 서버에 저장되어 다른 사용자와 공유됩니다.', author: '운영팀', createdAt: '2026-08-04T09:00:00+09:00' },
  { id: 'notice-guide', category: 'notice', title: '커뮤니티 이용 기본 안내', content: '개인정보, 정확한 집 주소, 연락처처럼 민감한 정보는 작성하지 마세요. 다른 이용자를 배려해 주세요.', author: '운영팀', createdAt: '2026-08-03T09:00:00+09:00' },
  { id: 'notice-feedback', category: 'notice', title: '서비스 아이디어를 의견·설명에 남겨주세요', content: '추가되었으면 하는 기능이나 불편했던 점이 있다면 의견·설명 분류에 남겨 주세요.', author: '운영팀', createdAt: '2026-08-02T09:00:00+09:00' },
  { id: 'notice-safety', category: 'notice', title: '이동 중에는 안전을 먼저 확인하세요', content: '게시판 확인과 글 작성은 정차 중이거나 안전한 장소에서 해주세요. 운전 중 스마트폰 사용은 삼가 주세요.', author: '운영팀', createdAt: '2026-08-01T09:00:00+09:00' },
];

export function isWritableCategory(value: unknown): value is (typeof WRITABLE_CATEGORIES)[number] { return typeof value === 'string' && WRITABLE_CATEGORIES.includes(value as (typeof WRITABLE_CATEGORIES)[number]); }
export function readLocalCommunityPosts(): CommunityPost[] {
  if (typeof window === 'undefined') return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(COMMUNITY_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((value): value is CommunityPost => { const p = value as Partial<CommunityPost>; return !!p && typeof p === 'object' && typeof p.id === 'string' && isWritableCategory(p.category) && typeof p.title === 'string' && p.title.trim().length >= TITLE_MIN && p.title.length <= TITLE_MAX && typeof p.content === 'string' && p.content.trim().length >= CONTENT_MIN && p.content.length <= CONTENT_MAX && typeof p.createdAt === 'string'; }).map((p) => ({ ...p, author: '나의 이전 글', isLocal: true }));
  } catch { return []; }
}
export async function fetchCommunityPosts(): Promise<CommunityPost[]> {
  const { data, error } = await supabase.from('community_posts').select('id, category, title, content, created_at').order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as PostRow[]).map((p) => ({ id: p.id, category: p.category, title: p.title, content: p.content, createdAt: p.created_at, author: p.category === 'notice' ? '운영팀' : '익명 사용자' }));
}
async function authenticatedUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  const appUserId = typeof window === 'undefined' ? null : localStorage.getItem('userId');
  if (!user || user.id !== appUserId) throw new Error('로그인한 사용자만 글을 작성할 수 있습니다.');
  return user.id;
}
function validate(category: CommunityCategory, title: string, content: string) {
  if (!isWritableCategory(category)) throw new Error('작성할 수 없는 카테고리입니다.');
  const cleanTitle = title.trim(), cleanContent = content.trim();
  if (cleanTitle.length < TITLE_MIN || cleanTitle.length > TITLE_MAX) throw new Error(`제목은 ${TITLE_MIN}~${TITLE_MAX}자로 입력해 주세요.`);
  if (cleanContent.length < CONTENT_MIN || cleanContent.length > CONTENT_MAX) throw new Error(`내용은 ${CONTENT_MIN}~${CONTENT_MAX}자로 입력해 주세요.`);
  return { cleanTitle, cleanContent };
}
export async function createCommunityPost(category: CommunityCategory, title: string, content: string): Promise<CommunityPost> {
  const { cleanTitle, cleanContent } = validate(category, title, content), author_id = await authenticatedUserId();
  const { data, error } = await supabase.from('community_posts').insert({ category, title: cleanTitle, content: cleanContent, author_id }).select('id, category, title, content, created_at').single();
  if (error) throw error;
  const p = data as PostRow; return { id: p.id, category: p.category, title: p.title, content: p.content, createdAt: p.created_at, author: '익명 사용자' };
}
export async function importLocalCommunityPosts(posts: CommunityPost[]) {
  const author_id = await authenticatedUserId();
  const values = posts.map((p) => { const v = validate(p.category, p.title, p.content); return { category: p.category, title: v.cleanTitle, content: v.cleanContent, author_id }; });
  if (!values.length) return 0;
  const { error } = await supabase.from('community_posts').insert(values); if (error) throw error;
  localStorage.removeItem(COMMUNITY_STORAGE_KEY); return values.length;
}
export function formatCommunityDate(value: string) { const d = new Date(value); return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d); }
