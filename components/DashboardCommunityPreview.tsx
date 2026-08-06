'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageSquare, MessageSquarePlus } from 'lucide-react';
import { COMMUNITY_CATEGORIES, fetchCommunityPosts, formatCommunityDate, type CommunityPost } from '@/lib/community';

const PREVIEW_COUNT = 3;

export default function DashboardCommunityPreview() {
  const [posts, setPosts] = useState<CommunityPost[] | null>(null);

  useEffect(() => {
    let active = true;
    fetchCommunityPosts()
      .then((all) => { if (active) setPosts(all.toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, PREVIEW_COUNT)); })
      .catch(() => { if (active) setPosts([]); });
    return () => { active = false; };
  }, []);

  return (
    <section className="card self-start p-5" aria-label="커뮤니티 미리보기">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold"><MessageSquare size={17} className="text-blue-600" />커뮤니티</h3>
        <Link href="/community" className="text-xs font-semibold text-blue-600 hover:underline">전체보기</Link>
      </div>
      {posts === null ? (
        <p className="mt-4 text-sm text-slate-400">불러오는 중…</p>
      ) : posts.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed p-5 text-center text-sm text-slate-500">
          <MessageSquarePlus className="mx-auto mb-2 size-6 text-slate-300" />
          아직 작성된 글이 없어요.
          <Link href="/community" className="mt-2 block text-xs font-semibold text-blue-600 hover:underline">먼저 글 남기기</Link>
        </div>
      ) : (
        <ul className="mt-4 space-y-1">
          {posts.map((post) => (
            <li key={post.id}>
              <Link href="/community" className="block rounded-lg px-2 py-2 -mx-2 hover:bg-slate-50">
                <span className="line-clamp-1 text-sm font-semibold text-slate-800">{post.title}</span>
                <span className="mt-0.5 flex gap-2 text-[11px] text-slate-400">
                  <span>{COMMUNITY_CATEGORIES.find((c) => c.id === post.category)?.label ?? post.category}</span>
                  <span>·</span>
                  <time dateTime={post.createdAt}>{formatCommunityDate(post.createdAt)}</time>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
