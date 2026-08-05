'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { HardDrive, MessageSquarePlus, X } from 'lucide-react';
import { COMMUNITY_CATEGORIES, DEFAULT_NOTICES, formatCommunityDate, readLocalCommunityPosts, saveLocalCommunityPosts, type CommunityCategory, type CommunityPost } from '@/lib/community';

const TITLE_MAX = 60;
const CONTENT_MAX = 1200;

export default function CommunityBoard() {
  const [category, setCategory] = useState<CommunityCategory>('notice');
  const [localPosts, setLocalPosts] = useState<CommunityPost[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(DEFAULT_NOTICES[0].id);
  const [isWriting, setIsWriting] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setLocalPosts(readLocalCommunityPosts()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const posts = useMemo(() => {
    const source = category === 'notice' ? DEFAULT_NOTICES : localPosts.filter((post) => post.category === category);
    return [...source].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [category, localPosts]);
  const selected = posts.find((post) => post.id === selectedId) ?? null;
  const categoryInfo = COMMUNITY_CATEGORIES.find((item) => item.id === category)!;

  const changeCategory = (next: CommunityCategory) => {
    setCategory(next); setSelectedId(next === 'notice' ? DEFAULT_NOTICES[0].id : null);
    setIsWriting(false); setError('');
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanContent = content.trim();
    if (cleanTitle.length < 2) return setError('제목을 2자 이상 입력해 주세요.');
    if (cleanContent.length < 5) return setError('내용을 5자 이상 입력해 주세요.');
    const post: CommunityPost = { id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, category, title: cleanTitle, content: cleanContent, author: '나', createdAt: new Date().toISOString(), isLocal: true };
    const next = [post, ...localPosts];
    try {
      saveLocalCommunityPosts(next); setLocalPosts(next); setSelectedId(post.id);
      setTitle(''); setContent(''); setError(''); setIsWriting(false);
    } catch { setError('브라우저 저장 공간을 사용할 수 없습니다. 설정을 확인해 주세요.'); }
  };

  return <div className="space-y-5">
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950" role="note"><div className="flex gap-3"><HardDrive className="mt-0.5 size-5 shrink-0 text-blue-600" aria-hidden="true" /><div><strong>내 브라우저에만 저장돼요</strong><p className="mt-1 leading-relaxed text-blue-800">자유글과 의견은 서버로 전송되지 않으며 다른 기기와 동기화되지 않습니다. 브라우저 데이터를 삭제하면 글도 사라질 수 있어요.</p></div></div></div>

    <div className="overflow-x-auto" aria-label="게시판 분류"><div className="flex min-w-max gap-2" role="tablist">{COMMUNITY_CATEGORIES.map((item) => <button key={item.id} type="button" role="tab" aria-selected={category === item.id} aria-controls="community-panel" onClick={() => changeCategory(item.id)} className={`min-h-11 rounded-xl px-4 text-sm font-bold ${category === item.id ? 'bg-blue-600 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{item.label}</button>)}</div></div>

    <section id="community-panel" role="tabpanel" className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="card overflow-hidden"><div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4 sm:p-5"><div><h2 className="font-bold text-slate-950">{categoryInfo.label}</h2><p className="mt-1 text-xs text-slate-500">{categoryInfo.description}</p></div>{category !== 'notice' && <button type="button" onClick={() => { setIsWriting(true); setSelectedId(null); setError(''); }} className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-3.5 text-sm font-bold text-white"><MessageSquarePlus size={17} aria-hidden="true" />글쓰기</button>}</div>
        {posts.length === 0 ? <div className="grid min-h-64 place-items-center p-8 text-center"><div><MessageSquarePlus className="mx-auto size-9 text-slate-300" aria-hidden="true" /><p className="mt-3 font-bold text-slate-700">아직 작성된 글이 없어요</p><p className="mt-1 text-sm text-slate-500">첫 번째 글을 이 브라우저에 남겨보세요.</p></div></div> : <ul className="divide-y divide-slate-100">{posts.map((post) => <li key={post.id}><button type="button" onClick={() => { setSelectedId(post.id); setIsWriting(false); }} aria-pressed={selectedId === post.id} className={`w-full p-4 text-left sm:p-5 ${selectedId === post.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}><span className="line-clamp-2 text-sm font-bold text-slate-900">{post.title}</span><span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500"><span>{post.author}</span><span aria-hidden="true">·</span><time dateTime={post.createdAt}>{formatCommunityDate(post.createdAt)}</time>{post.isLocal && <span className="rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-700">로컬 저장</span>}</span></button></li>)}</ul>}
      </div>

      <div className="card min-h-80 p-5 sm:p-7">{isWriting ? <form onSubmit={submit} noValidate><div className="flex items-center justify-between"><div><h2 className="text-lg font-black text-slate-950">{categoryInfo.label} 글쓰기</h2><p className="mt-1 text-xs text-slate-500">작성 내용은 현재 브라우저에만 저장됩니다.</p></div><button type="button" onClick={() => setIsWriting(false)} aria-label="작성 취소" className="grid size-11 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"><X aria-hidden="true" /></button></div>
        <label className="mt-6 block text-sm font-bold text-slate-800" htmlFor="community-title">제목</label><input id="community-title" value={title} onChange={(e) => { setTitle(e.target.value); setError(''); }} maxLength={TITLE_MAX} required className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900" placeholder="제목을 입력하세요" /><p className="mt-1 text-right text-xs text-slate-400">{title.length}/{TITLE_MAX}</p>
        <label className="mt-3 block text-sm font-bold text-slate-800" htmlFor="community-content">내용</label><textarea id="community-content" value={content} onChange={(e) => { setContent(e.target.value); setError(''); }} maxLength={CONTENT_MAX} required rows={8} className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-sm leading-relaxed text-slate-900" placeholder="개인정보를 제외하고 내용을 입력하세요" /><p className="mt-1 text-right text-xs text-slate-400">{content.length}/{CONTENT_MAX}</p>
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setIsWriting(false)} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700">취소</button><button type="submit" className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white">이 브라우저에 저장</button></div>
      </form> : selected ? <article><div className="flex flex-wrap items-center gap-2 text-xs font-bold text-blue-700"><span>{categoryInfo.label}</span>{selected.isLocal && <span className="rounded-full bg-blue-100 px-2 py-1">로컬 저장</span>}</div><h2 className="mt-3 text-xl font-black leading-snug text-slate-950 sm:text-2xl">{selected.title}</h2><div className="mt-3 flex flex-wrap gap-x-2 text-xs text-slate-500"><span>{selected.author}</span><span aria-hidden="true">·</span><time dateTime={selected.createdAt}>{formatCommunityDate(selected.createdAt)}</time></div><div className="mt-6 whitespace-pre-wrap border-t border-slate-100 pt-6 text-sm leading-7 text-slate-700">{selected.content}</div></article> : <div className="grid min-h-72 place-items-center text-center text-sm text-slate-500"><p>목록에서 읽을 글을 선택하거나 새 글을 작성해 주세요.</p></div>}</div>
    </section>
  </div>;
}
