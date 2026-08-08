'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Cloud, LoaderCircle, MessageSquarePlus, Upload, X } from 'lucide-react';
import { COMMUNITY_CATEGORIES, COMMUNITY_MIGRATION_DISMISSED_KEY, CONTENT_MAX, createCommunityPost, DEFAULT_NOTICES, fetchCommunityPosts, formatCommunityDate, importLocalCommunityPosts, readLocalCommunityPosts, TITLE_MAX, type CommunityCategory, type CommunityPost } from '@/lib/community';

export default function CommunityBoard() {
  const [category, setCategory] = useState<CommunityCategory>('notice');
  const [remotePosts, setRemotePosts] = useState<CommunityPost[]>([]);
  const [legacyPosts, setLegacyPosts] = useState<CommunityPost[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isWriting, setIsWriting] = useState(false);
  const [title, setTitle] = useState(''), [content, setContent] = useState('');
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [importing, setImporting] = useState(false);
  const [loadError, setLoadError] = useState(''), [error, setError] = useState('');
  const loadPosts = useCallback(async () => { setLoading(true); setLoadError(''); try { setRemotePosts(await fetchCommunityPosts()); } catch { setLoadError('게시판을 불러오지 못했습니다. 연결을 확인해 주세요.'); } finally { setLoading(false); } }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPosts();
      if (localStorage.getItem(COMMUNITY_MIGRATION_DISMISSED_KEY) !== 'true') setLegacyPosts(readLocalCommunityPosts());
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadPosts]);
  const posts = useMemo(() => { const db = remotePosts.filter((p) => p.category === category); return (category === 'notice' && db.length === 0 ? DEFAULT_NOTICES : db).toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)); }, [category, remotePosts]);
  const selected = posts.find((p) => p.id === selectedId) ?? null;
  const categoryInfo = COMMUNITY_CATEGORIES.find((item) => item.id === category)!;
  const changeCategory = (next: CommunityCategory) => { setCategory(next); setSelectedId(null); setIsWriting(false); setError(''); };
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSaving(true); setError(''); try { const post = await createCommunityPost(category, title, content); setRemotePosts((all) => [post, ...all]); setSelectedId(post.id); setTitle(''); setContent(''); setIsWriting(false); } catch (cause) { setError(cause instanceof Error ? cause.message : '저장하지 못했습니다.'); } finally { setSaving(false); } };
  const importLegacy = async () => { setImporting(true); setError(''); try { await importLocalCommunityPosts(legacyPosts); setLegacyPosts([]); await loadPosts(); } catch (cause) { setError(cause instanceof Error ? cause.message : '이전 글을 전송하지 못했습니다.'); } finally { setImporting(false); } };
  const dismissLegacy = () => { localStorage.setItem(COMMUNITY_MIGRATION_DISMISSED_KEY, 'true'); setLegacyPosts([]); };

  return <div className="space-y-5">
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950" role="note"><div className="flex gap-3"><Cloud className="mt-0.5 size-5 shrink-0 text-blue-600" /><div><strong>함께 보는 공유 게시판</strong><p className="mt-1 leading-relaxed text-blue-800">글은 Supabase에 저장됩니다. 개인정보는 적지 말아 주세요. 게시판은 로그인 후 이용할 수 있어요.</p></div></div></div>
    {legacyPosts.length > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="status"><strong>이 브라우저에 이전 글 {legacyPosts.length}개가 있습니다.</strong><p className="mt-1 text-amber-800">원할 때만 DB로 전송하며 자동 업로드하지 않습니다.</p><div className="mt-3 flex gap-2"><button type="button" disabled={importing} onClick={() => void importLegacy()} className="flex min-h-10 items-center gap-2 rounded-xl bg-amber-700 px-3 font-bold text-white disabled:opacity-50"><Upload size={16} />{importing ? '전송 중…' : 'DB로 전송'}</button><button type="button" onClick={dismissLegacy} className="min-h-10 rounded-xl border border-amber-300 px-3 font-bold">나중에</button></div></div>}
    {loadError && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700"><span className="flex items-center gap-2"><AlertCircle size={18} />{loadError}</span><button type="button" onClick={() => void loadPosts()} className="min-h-10 rounded-lg border border-red-200 px-3">다시 시도</button></div>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
    <div className="overflow-x-auto" aria-label="게시판 분류"><div className="flex min-w-max gap-2" role="tablist">{COMMUNITY_CATEGORIES.map((item) => <button key={item.id} type="button" role="tab" aria-selected={category === item.id} aria-controls="community-panel" onClick={() => changeCategory(item.id)} className={`min-h-11 rounded-xl px-4 text-sm font-bold ${category === item.id ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{item.label}</button>)}</div></div>
    <section id="community-panel" role="tabpanel" className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="card overflow-hidden"><div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4 sm:p-5"><div><h2 className="font-bold text-slate-950">{categoryInfo.label}</h2><p className="mt-1 text-xs text-slate-500">{categoryInfo.description}</p></div>{category !== 'notice' && <button type="button" onClick={() => { setIsWriting(true); setSelectedId(null); setError(''); }} className="flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-3.5 text-sm font-bold text-white"><MessageSquarePlus size={17} />글쓰기</button>}</div>
        {loading ? <div className="grid min-h-64 place-items-center"><LoaderCircle className="size-8 animate-spin text-blue-600" aria-label="게시글 불러오는 중" /></div> : posts.length === 0 ? <div className="grid min-h-64 place-items-center p-8 text-center"><div><MessageSquarePlus className="mx-auto size-9 text-slate-300" /><p className="mt-3 font-bold text-slate-700">아직 작성된 글이 없어요</p></div></div> : <ul className="divide-y divide-slate-100">{posts.map((post) => <li key={post.id}><button type="button" onClick={() => { setSelectedId(post.id); setIsWriting(false); }} aria-pressed={selectedId === post.id} className={`w-full p-4 text-left sm:p-5 ${selectedId === post.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}><span className="line-clamp-2 text-sm font-bold text-slate-900">{post.title}</span><span className="mt-2 flex gap-2 text-xs text-slate-500"><span>{post.author}</span><span>·</span><time dateTime={post.createdAt}>{formatCommunityDate(post.createdAt)}</time></span></button></li>)}</ul>}
      </div>
      <div className="card min-h-80 p-5 sm:p-7">{isWriting ? <form onSubmit={(e) => void submit(e)} noValidate><div className="flex items-center justify-between"><div><h2 className="text-lg font-black text-slate-950">{categoryInfo.label} 글쓰기</h2><p className="mt-1 text-xs text-slate-500">작성자 정보는 공개되지 않고 익명으로 표시됩니다.</p></div><button type="button" onClick={() => setIsWriting(false)} aria-label="작성 취소" className="grid size-11 place-items-center"><X /></button></div>
        <label className="mt-6 block text-sm font-bold" htmlFor="community-title">제목</label><input id="community-title" value={title} onChange={(e) => { setTitle(e.target.value); setError(''); }} maxLength={TITLE_MAX} required className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" /><p className="mt-1 text-right text-xs text-slate-400">{title.length}/{TITLE_MAX}</p>
        <label className="mt-3 block text-sm font-bold" htmlFor="community-content">내용</label><textarea id="community-content" value={content} onChange={(e) => { setContent(e.target.value); setError(''); }} maxLength={CONTENT_MAX} required rows={8} className="mt-2 w-full resize-y rounded-xl border border-slate-300 p-3 text-sm" placeholder="개인정보를 제외하고 내용을 입력하세요" /><p className="mt-1 text-right text-xs text-slate-400">{content.length}/{CONTENT_MAX}</p>
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setIsWriting(false)} className="min-h-11 rounded-xl border px-4 text-sm font-bold">취소</button><button type="submit" disabled={saving} className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white disabled:opacity-50">{saving ? '저장 중…' : '공유 게시판에 저장'}</button></div>
      </form> : selected ? <article><div className="text-xs font-bold text-blue-700">{categoryInfo.label}</div><h2 className="mt-3 text-xl font-black sm:text-2xl">{selected.title}</h2><div className="mt-3 flex gap-2 text-xs text-slate-500"><span>{selected.author}</span><span>·</span><time dateTime={selected.createdAt}>{formatCommunityDate(selected.createdAt)}</time></div><div className="mt-6 whitespace-pre-wrap border-t pt-6 text-sm leading-7 text-slate-700">{selected.content}</div></article> : <div className="grid min-h-72 place-items-center text-center text-sm text-slate-500"><p>목록에서 읽을 글을 선택하거나 새 글을 작성해 주세요.</p></div>}</div>
    </section>
  </div>;
}
