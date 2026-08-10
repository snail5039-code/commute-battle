'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { AtSign, Bell, ChevronDown, Hash, Headphones, LoaderCircle, MessageSquareText, Plus, Search, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CHAT_MESSAGE_MAX, createDepartmentMessage, fetchDepartmentMessages, fetchDepartments, hydrateRealtimeMessage, type ChatMessage, type Department } from '@/lib/departmentChat';

export default function DepartmentChat() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [content, setContent] = useState('');
  const [channelQuery, setChannelQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const selected = departments.find((department) => department.id === selectedId);
  const visibleDepartments = departments.filter((department) => department.name.toLocaleLowerCase('ko').includes(channelQuery.trim().toLocaleLowerCase('ko')));

  useEffect(() => {
    void fetchDepartments()
      .then((items) => { setDepartments(items); setSelectedId(items[0]?.id ?? ''); })
      .catch(() => setError('부서 목록을 불러오지 못했습니다. Supabase 마이그레이션을 확인해 주세요.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    void fetchDepartmentMessages(selectedId)
      .then((items) => { if (active) setMessages(items); })
      .catch(() => setError('메시지를 불러오지 못했습니다.'))
      .finally(() => { if (active) setLoading(false); });

    const channel = supabase.channel(`department:${selectedId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'department_messages', filter: `department_id=eq.${selectedId}` }, (payload) => {
        void hydrateRealtimeMessage(payload.new as Parameters<typeof hydrateRealtimeMessage>[0]).then((message) => {
          if (active) setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
        });
      }).subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [selectedId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId || !content.trim()) return;
    setSending(true); setError('');
    try {
      const message = await createDepartmentMessage(selectedId, content);
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      setContent('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '메시지를 보내지 못했습니다.');
    } finally { setSending(false); }
  };

  return <div className="grid h-[calc(100dvh-4.5rem)] min-h-[38rem] overflow-hidden bg-white md:h-screen lg:grid-cols-[16.5rem_minmax(0,1fr)]">
    <aside className="flex min-h-0 flex-col border-b border-[#5f3567] bg-[#3f0e40] text-white lg:border-b-0 lg:border-r">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/15 px-4">
        <div className="min-w-0"><h2 className="truncate text-[15px] font-black">Commute Battle</h2><p className="text-[11px] text-white/60">부서 워크스페이스</p></div>
        <button type="button" aria-label="워크스페이스 메뉴" className="grid size-8 place-items-center hover:bg-white/10"><ChevronDown size={17}/></button>
      </div>
      <div className="border-b border-white/10 p-2.5">
        <label className="flex h-8 items-center gap-2 border border-white/25 bg-[#260027]/40 px-2 text-white/60 focus-within:border-white/70 focus-within:text-white"><Search size={14}/><span className="sr-only">채널 검색</span><input value={channelQuery} onChange={(event) => setChannelQuery(event.target.value)} placeholder="채널 검색" className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/50"/></label>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto py-2" aria-label="부서 채널">
        <div className="flex h-8 items-center justify-between px-4 text-xs font-bold text-white/70"><span className="flex items-center gap-2"><ChevronDown size={13}/>채널</span><Plus size={15}/></div>
        {visibleDepartments.map((department) => <button key={department.id} type="button" onClick={() => { setLoading(true); setError(''); setSelectedId(department.id); }} className={`flex h-8 w-full items-center gap-2 px-5 text-left text-[13px] transition ${selectedId === department.id ? 'bg-[#1164a3] font-bold text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}><Hash size={15}/><span className="truncate">{department.name}</span></button>)}
        {!visibleDepartments.length && <p className="px-5 py-3 text-xs text-white/50">검색 결과가 없습니다.</p>}
        <div className="mt-3 flex h-8 items-center justify-between px-4 text-xs font-bold text-white/70"><span className="flex items-center gap-2"><ChevronDown size={13}/>다이렉트 메시지</span><Plus size={15}/></div>
        <div className="flex h-8 items-center gap-2 px-5 text-xs text-white/45"><span className="size-2 rounded-full bg-emerald-400"/>동료 목록 준비 중</div>
      </nav>
      <div className="hidden border-t border-white/10 px-4 py-3 text-xs text-white/60 lg:flex lg:items-center lg:gap-2"><span className="size-2 rounded-full bg-emerald-400"/>온라인</div>
    </aside>

    <section className="flex min-h-0 min-w-0 flex-col bg-white">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4">
        <div className="min-w-0"><div className="flex items-center gap-1"><Hash size={18} className="text-slate-600"/><h1 className="truncate text-[15px] font-black text-slate-950">{selected?.name ?? '부서 채팅'}</h1><ChevronDown size={15} className="text-slate-400"/></div><p className="mt-0.5 hidden truncate text-[11px] text-slate-500 sm:block">{selected?.description ?? '부서 채널을 선택해 주세요.'}</p></div>
        <div className="flex items-center text-slate-500"><button type="button" aria-label="알림" className="grid size-9 place-items-center hover:bg-slate-100"><Bell size={17}/></button><button type="button" aria-label="허들" className="grid size-9 place-items-center hover:bg-slate-100"><Headphones size={17}/></button><button type="button" aria-label="채널 검색" className="grid size-9 place-items-center hover:bg-slate-100"><Search size={17}/></button></div>
      </header>
      <div className="flex h-9 shrink-0 items-end gap-5 border-b border-slate-200 px-4 text-xs font-bold text-slate-500"><span className="flex h-full items-center border-b-2 border-[#611f69] text-slate-950"><MessageSquareText size={14} className="mr-1.5"/>메시지</span><span className="flex h-full items-center">파일 및 링크</span></div>

      <div className="min-h-0 flex-1 overflow-y-auto py-4" aria-live="polite">
        {loading ? <div className="grid h-full place-items-center"><LoaderCircle className="animate-spin text-[#611f69]" aria-label="메시지 불러오는 중"/></div> : messages.length === 0 ? <div className="flex h-full items-end px-5 pb-6"><div><Hash size={38} className="text-slate-800"/><h2 className="mt-3 text-xl font-black text-slate-950">#{selected?.name} 채널에 오신 것을 환영합니다</h2><p className="mt-1 text-sm text-slate-500">이 채널의 시작입니다. 업무 소식과 대화를 동료들과 나눠보세요.</p></div></div> : <div>{messages.map((message, index) => { const grouped = index > 0 && messages[index - 1].authorId === message.authorId && Date.parse(message.createdAt) - Date.parse(messages[index - 1].createdAt) < 300000; return <article key={message.id} className={`group flex gap-2.5 px-4 hover:bg-[#f8f8f8] ${grouped ? 'py-0.5' : 'mt-2 py-1.5'}`}>{grouped ? <time className="w-9 shrink-0 pt-1 text-right text-[9px] text-slate-400 opacity-0 group-hover:opacity-100" dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</time> : <div className="grid size-9 shrink-0 place-items-center bg-[#2eb67d] text-sm font-black text-white">{message.author.slice(0, 1)}</div>}<div className="min-w-0 flex-1">{!grouped && <div className="flex flex-wrap items-baseline gap-2"><strong className="text-[14px] text-slate-950">{message.author}</strong><time className="text-[10px] text-slate-400" dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></div>}<p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-slate-800">{message.content}</p></div></article>; })}<div ref={endRef}/></div>}
      </div>

      <form onSubmit={(event) => void submit(event)} className="shrink-0 px-4 pb-4">
        <div className="border border-slate-400 bg-white focus-within:border-slate-700 focus-within:shadow-[0_0_0_1px_#334155]">
          <textarea value={content} onChange={(event) => { setContent(event.target.value); setError(''); }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} maxLength={CHAT_MESSAGE_MAX} rows={2} placeholder={selected ? `#${selected.name}에 메시지 보내기` : '부서를 선택해 주세요'} disabled={!selectedId || sending} className="max-h-32 min-h-14 w-full resize-none border-0 px-3 py-2.5 text-[13px] outline-none disabled:bg-transparent"/>
          <div className="flex h-9 items-center justify-between border-t border-slate-100 px-1.5 text-slate-500"><div className="flex items-center"><span className="grid size-7 place-items-center text-base font-black">B</span><span className="grid size-7 place-items-center text-sm italic">I</span><span className="grid size-7 place-items-center"><AtSign size={15}/></span></div><button type="submit" disabled={!content.trim() || !selectedId || sending} aria-label="메시지 보내기" className="grid size-7 place-items-center bg-[#007a5a] text-white disabled:bg-slate-200 disabled:text-slate-400"><Send size={15}/></button></div>
        </div>
        {error && <p role="alert" className="mt-1.5 text-xs font-semibold text-red-600">{error}</p>}
        <p className="mt-1 text-[10px] text-slate-400">Enter로 전송 · Shift+Enter로 줄바꿈</p>
      </form>
    </section>
  </div>;
}
