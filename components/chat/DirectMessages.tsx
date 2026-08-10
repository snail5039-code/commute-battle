'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { LoaderCircle, MessageCircle, Plus, Search, Send, X } from 'lucide-react';
import { fetchChatWorkspaces, type ChatWorkspace } from '@/lib/departmentChat';
import { fetchDirectMessages, fetchDirectThreads, fetchWorkspaceMembers, sendDirectMessage, startDirectThread, type DirectMember, type DirectMessage, type DirectThread } from '@/lib/directMessages';
import { supabase } from '@/lib/supabase';

export default function DirectMessages() {
  const [workspaces, setWorkspaces] = useState<ChatWorkspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [threads, setThreads] = useState<DirectThread[]>([]);
  const [threadId, setThreadId] = useState('');
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [members, setMembers] = useState<DirectMember[]>([]);
  const [userId, setUserId] = useState('');
  const [content, setContent] = useState('');
  const [query, setQuery] = useState('');
  const [picker, setPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const thread = threads.find((item) => item.id === threadId);

  useEffect(() => { void Promise.all([fetchChatWorkspaces(), supabase.auth.getUser()]).then(([items, auth]) => { setWorkspaces(items); setWorkspaceId(items[0]?.id ?? ''); setUserId(auth.data.user?.id ?? ''); }).catch(() => setError('개인 채팅을 불러오지 못했습니다.')).finally(() => setLoading(false)); }, []);
  useEffect(() => { if (!workspaceId) return; let active = true; void Promise.all([fetchDirectThreads(workspaceId), fetchWorkspaceMembers(workspaceId)]).then(([nextThreads, nextMembers]) => { if (active) { setThreads(nextThreads); setMembers(nextMembers); setThreadId(nextThreads[0]?.id ?? ''); } }).catch(() => setError('워크스페이스 멤버를 불러오지 못했습니다.')); return () => { active = false; }; }, [workspaceId]);
  useEffect(() => {
    if (!threadId) return; let active = true;
    void fetchDirectMessages(threadId).then((items) => { if (active) setMessages(items); }).catch(() => setError('메시지를 불러오지 못했습니다.'));
    const channel = supabase.channel(`direct:${threadId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_direct_messages', filter: `thread_id=eq.${threadId}` }, (payload) => { const row = payload.new as { id: string; thread_id: string; author_id: string; content: string; created_at: string }; const message = { id: row.id, threadId: row.thread_id, authorId: row.author_id, content: row.content, createdAt: row.created_at }; if (active) setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]); }).subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [threadId]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const begin = async (memberId: string) => {
    try { const id = await startDirectThread(workspaceId, memberId); const next = await fetchDirectThreads(workspaceId); setThreads(next); setThreadId(id); setPicker(false); setMessages([]); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '개인 채팅을 시작하지 못했습니다.'); }
  };
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!threadId || !content.trim()) return; try { const message = await sendDirectMessage(threadId, content); setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]); setContent(''); } catch (cause) { setError(cause instanceof Error ? cause.message : '메시지를 보내지 못했습니다.'); } };
  const visibleThreads = threads.filter((item) => item.otherName.toLocaleLowerCase('ko').includes(query.toLocaleLowerCase('ko')));

  return <div className="grid h-[calc(100dvh-4.5rem)] min-h-[38rem] overflow-hidden bg-white md:h-screen lg:grid-cols-[16.5rem_minmax(0,1fr)]">
    <aside className="chat-nav flex min-h-0 flex-col bg-[#3f0e40] text-white"><div className="flex h-14 items-center border-b border-white/15 px-3"><select value={workspaceId} onChange={(event) => { setWorkspaceId(event.target.value); setThreadId(''); setMessages([]); }} className="h-9 w-full bg-transparent text-sm font-black outline-none [&>option]:text-slate-950">{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="p-2.5"><label className="flex h-8 items-center gap-2 border border-white/25 px-2 text-white/60"><Search size={14}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="대화 검색" className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none"/></label></div><div className="flex h-8 items-center justify-between px-4 text-xs font-bold text-white/70"><span>다이렉트 메시지</span><button type="button" onClick={() => setPicker(true)} aria-label="새 개인 채팅" className="grid size-6 place-items-center hover:bg-white/10"><Plus size={15}/></button></div><nav className="min-h-0 flex-1 overflow-y-auto">{visibleThreads.map((item) => <button key={item.id} type="button" onClick={() => { setThreadId(item.id); setMessages([]); }} className={`flex h-9 w-full items-center gap-2 px-4 text-left text-sm ${threadId === item.id ? 'chat-nav-active bg-[#1164a3] text-white' : 'text-white/75 hover:bg-white/10'}`}><span className="size-2 rounded-full bg-emerald-400"/><span className="truncate">{item.otherName}</span></button>)}{!threads.length && <p className="px-4 py-4 text-xs leading-5 text-white/50">+ 버튼을 눌러 같은 워크스페이스 동료와 대화를 시작하세요.</p>}</nav></aside>
    <section className="flex min-h-0 flex-col"><header className="flex h-14 shrink-0 items-center border-b border-slate-200 px-4"><div className="flex items-center gap-2"><span className="grid size-8 place-items-center bg-[#2eb67d] font-black text-white">{thread?.otherName.slice(0,1) ?? '?'}</span><div><h1 className="text-sm font-black">{thread?.otherName ?? '개인 채팅'}</h1><p className="text-[10px] text-slate-500">이 대화는 두 사람만 볼 수 있습니다.</p></div></div></header><div className="min-h-0 flex-1 overflow-y-auto py-4">{loading ? <div className="grid h-full place-items-center"><LoaderCircle className="animate-spin text-[#611f69]"/></div> : !thread ? <div className="grid h-full place-items-center text-center"><div><MessageCircle className="mx-auto text-slate-300" size={42}/><p className="mt-3 font-bold">대화할 동료를 선택해 주세요.</p></div></div> : messages.map((message) => <article key={message.id} className={`flex px-4 py-1.5 ${message.authorId === userId ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[75%] px-3 py-2 text-sm ${message.authorId === userId ? 'bg-[#611f69] text-white' : 'bg-slate-100 text-slate-800'}`}><p className="whitespace-pre-wrap break-words">{message.content}</p><time className={`mt-1 block text-[9px] ${message.authorId === userId ? 'text-white/60' : 'text-slate-400'}`}>{new Date(message.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</time></div></article>)}<div ref={endRef}/></div><form onSubmit={(event) => void submit(event)} className="shrink-0 p-4"><div className="flex border border-slate-400"><textarea value={content} onChange={(event) => setContent(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={2} maxLength={1000} disabled={!threadId} placeholder={thread ? `${thread.otherName}에게 메시지 보내기` : '대화를 선택해 주세요'} className="min-h-14 flex-1 resize-none border-0 p-3 text-sm outline-none"/><button type="submit" disabled={!threadId || !content.trim()} className="m-2 grid size-9 place-items-center bg-[#007a5a] text-white disabled:bg-slate-200"><Send size={16}/></button></div>{error && <p className="mt-2 text-xs font-bold text-red-600">{error}</p>}</form></section>
    {picker && <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/55 p-4"><section className="w-full max-w-sm bg-white shadow-2xl"><header className="flex h-14 items-center justify-between border-b px-4"><h2 className="font-black">새 개인 채팅</h2><button type="button" onClick={() => setPicker(false)} className="grid size-8 place-items-center"><X size={18}/></button></header><div className="max-h-80 overflow-y-auto py-2">{members.map((member) => <button key={member.userId} type="button" onClick={() => void begin(member.userId)} className="flex h-11 w-full items-center gap-3 px-4 text-left text-sm font-bold hover:bg-slate-100"><span className="grid size-7 place-items-center bg-[#2eb67d] text-white">{member.name.slice(0,1)}</span>{member.name}</button>)}{!members.length && <p className="p-5 text-center text-sm text-slate-500">초대된 다른 멤버가 없습니다.</p>}</div></section></div>}
  </div>;
}
