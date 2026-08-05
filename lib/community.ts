export type CommunityCategory = 'notice' | 'free' | 'feedback';

export interface CommunityPost {
  id: string;
  category: CommunityCategory;
  title: string;
  content: string;
  author: string;
  createdAt: string;
  isLocal?: boolean;
}

export const COMMUNITY_STORAGE_KEY = 'commute-battle-community-posts-v1';

export const COMMUNITY_CATEGORIES: ReadonlyArray<{ id: CommunityCategory; label: string; description: string }> = [
  { id: 'notice', label: '공지사항', description: '서비스 이용 안내와 업데이트 소식' },
  { id: 'free', label: '자유게시판', description: '출퇴근 이야기를 자유롭게 나누는 공간' },
  { id: 'feedback', label: '의견수렴', description: '서비스 개선 아이디어를 남기는 공간' },
];

export const DEFAULT_NOTICES: CommunityPost[] = [
  { id: 'notice-welcome', category: 'notice', title: '출퇴근 배틀 커뮤니티에 오신 것을 환영합니다', content: '출퇴근 경험과 유용한 팁을 편안하게 나누는 공간입니다. 서로를 배려하는 표현으로 즐겁게 참여해 주세요.', author: '운영팀', createdAt: '2026-08-05T09:00:00+09:00' },
  { id: 'notice-local', category: 'notice', title: '게시글은 이 브라우저에만 저장됩니다', content: '현재 자유게시판과 의견수렴에 작성한 글은 서버로 전송되지 않고 사용 중인 브라우저의 로컬 저장소에만 보관됩니다. 다른 기기나 브라우저에서는 보이지 않으며, 브라우저 데이터를 지우면 삭제될 수 있습니다.', author: '운영팀', createdAt: '2026-08-04T09:00:00+09:00' },
  { id: 'notice-guide', category: 'notice', title: '커뮤니티 이용 기본 안내', content: '개인정보, 정확한 집 주소, 연락처처럼 민감한 정보는 작성하지 마세요. 다른 이용자를 비방하거나 불쾌하게 만드는 표현은 피해주세요.', author: '운영팀', createdAt: '2026-08-03T09:00:00+09:00' },
  { id: 'notice-feedback', category: 'notice', title: '서비스 아이디어는 의견수렴에 남겨주세요', content: '추가되었으면 하는 기능이나 불편했던 점은 의견수렴 분류에 남길 수 있습니다. 현재는 내 브라우저에만 저장되는 체험 기능입니다.', author: '운영팀', createdAt: '2026-08-02T09:00:00+09:00' },
  { id: 'notice-safety', category: 'notice', title: '이동 중에는 안전을 먼저 확인하세요', content: '게시판 확인과 글 작성은 정차 중이거나 안전한 장소에서 해주세요. 보행 중 또는 운전 중 스마트폰 사용은 삼가주세요.', author: '운영팀', createdAt: '2026-08-01T09:00:00+09:00' },
];

export function readLocalCommunityPosts(): CommunityPost[] {
  if (typeof window === 'undefined') return [];
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(COMMUNITY_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((post): post is CommunityPost => {
      if (!post || typeof post !== 'object') return false;
      const item = post as Partial<CommunityPost>;
      return typeof item.id === 'string' && (item.category === 'free' || item.category === 'feedback') && typeof item.title === 'string' && typeof item.content === 'string' && typeof item.author === 'string' && typeof item.createdAt === 'string';
    }).map((post) => ({ ...post, isLocal: true }));
  } catch { return []; }
}

export function saveLocalCommunityPosts(posts: CommunityPost[]) {
  window.localStorage.setItem(COMMUNITY_STORAGE_KEY, JSON.stringify(posts));
}

export function formatCommunityDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
