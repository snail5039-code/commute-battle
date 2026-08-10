'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Hash, LoaderCircle, MessageSquareText, Send, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CHAT_MESSAGE_MAX, createDepartmentMessage, fetchDepartmentMessages, fetchDepartments, hydrateRealtimeMessage, type ChatMessage, type Department } from '@/lib/departmentChat';

export default function DepartmentChat() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const selected = departments.find((department) => department.id === selectedId);

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

  return <div className="grid min-h-[calc(100dvh-8rem)] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[17rem_minmax(0,1fr)]">
    <aside className="border-b border-slate-200 bg-slate-950 p-4 text-white lg:border-b-0 lg:border-r">
      <div className="flex items-center gap-3 border-b border-white/10 px-2 pb-4"><div className="grid size-10 place-items-center rounded-xl bg-blue-600"><MessageSquareText size={20}/></div><div><h2 className="font-black">Commute Battle</h2><p className="text-xs text-slate-400">부서 워크스페이스</p></div></div>
      <div className="mt-5 flex items-center gap-2 px-2 text-xs font-bold uppercase tracking-wider text-slate-400"><Users size={14}/>부서 채널</div>
      <nav className="mt-2 space-y-1" aria-label="부서 채널">
        {departments.map((department) => <button key={department.id} type="button" onClick={() => { setLoading(true); setError(''); setSelectedId(department.id); }} className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold transition ${selectedId === department.id ? 'bg-white text-slate-950' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}><Hash size={17}/><span className="truncate">{department.name}</span></button>)}
      </nav>
    </aside>

    <section className="flex min-h-[36rem] min-w-0 flex-col">
      <header className="border-b border-slate-200 px-5 py-4"><div className="flex items-center gap-2"><Hash className="text-blue-600" size={21}/><h1 className="font-black text-slate-950">{selected?.name ?? '부서 채팅'}</h1></div><p className="mt-1 truncate text-xs text-slate-500">{selected?.description ?? '부서 채널을 선택해 주세요.'}</p></header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6" aria-live="polite">
        {loading ? <div className="grid h-full place-items-center"><LoaderCircle className="animate-spin text-blue-600" aria-label="메시지 불러오는 중"/></div> : messages.length === 0 ? <div className="grid h-full place-items-center text-center"><div><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Hash size={28}/></div><p className="mt-4 font-bold text-slate-800">#{selected?.name} 채널의 첫 메시지를 남겨보세요.</p><p className="mt-1 text-sm text-slate-500">업무 소식과 가벼운 대화를 동료들과 나눌 수 있어요.</p></div></div> : <div className="space-y-1">{messages.map((message, index) => { const grouped = index > 0 && messages[index - 1].authorId === message.authorId && Date.parse(message.createdAt) - Date.parse(messages[index - 1].createdAt) < 300000; return <article key={message.id} className={`group flex gap-3 rounded-xl px-2 py-2 hover:bg-slate-50 ${grouped ? 'pt-0' : 'mt-3'}`}>{grouped ? <div className="w-10 shrink-0 text-center text-[10px] text-slate-400 opacity-0 group-hover:opacity-100">{new Date(message.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</div> : <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-black text-white">{message.author.slice(0, 1)}</div>}<div className="min-w-0 flex-1">{!grouped && <div className="flex flex-wrap items-baseline gap-2"><strong className="text-sm text-slate-950">{message.author}</strong><time className="text-[11px] text-slate-400" dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></div>}<p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{message.content}</p></div></article>; })}<div ref={endRef}/></div>}
      </div>
      <form onSubmit={(event) => void submit(event)} className="border-t border-slate-200 p-4 sm:p-5"><div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100"><textarea value={content} onChange={(event) => { setContent(event.target.value); setError(''); }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} maxLength={CHAT_MESSAGE_MAX} rows={1} placeholder={selected ? `#${selected.name}에 메시지 보내기` : '부서를 선택해 주세요'} disabled={!selectedId || sending} className="max-h-32 min-h-10 flex-1 resize-none border-0 px-2 py-2 text-sm outline-none disabled:bg-transparent"/><button type="submit" disabled={!content.trim() || !selectedId || sending} aria-label="메시지 보내기" className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white disabled:bg-slate-200 disabled:text-slate-400"><Send size={18}/></button></div>{error && <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{error}</p>}<p className="mt-2 text-[11px] text-slate-400">Enter로 전송 · Shift+Enter로 줄바꿈</p></form>
    </section>
  </div>;
}
