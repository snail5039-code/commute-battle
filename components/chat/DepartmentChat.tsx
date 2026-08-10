'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { AtSign, Bell, Check, ChevronDown, Copy, Hash, Headphones, LoaderCircle, LogIn, MessageSquareText, Plus, Search, Send, UserPlus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { acceptWorkspaceInvite, CHAT_MESSAGE_MAX, createChannelMessage, createChatChannel, createChatWorkspace, createWorkspaceInvite, fetchChannelMessages, fetchChatWorkspaces, fetchWorkspaceChannels, hydrateRealtimeMessage, type ChatChannel, type ChatMessage, type ChatWorkspace } from '@/lib/departmentChat';

type Dialog = 'workspace' | 'channel' | 'invite' | 'join' | null;

export default function DepartmentChat() {
  const [workspaces, setWorkspaces] = useState<ChatWorkspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [channelId, setChannelId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [content, setContent] = useState('');
  const [channelQuery, setChannelQuery] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [formValue, setFormValue] = useState('');
  const [generatedInvite, setGeneratedInvite] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const workspace = workspaces.find((item) => item.id === workspaceId);
  const channel = channels.find((item) => item.id === channelId);
  const canManage = workspace?.role === 'owner' || workspace?.role === 'admin';
  const visibleChannels = channels.filter((item) => item.name.toLocaleLowerCase('ko').includes(channelQuery.trim().toLocaleLowerCase('ko')));

  const loadWorkspaces = useCallback(async (preferredId?: string) => {
    const items = await fetchChatWorkspaces();
    setWorkspaces(items);
    setWorkspaceId((current) => preferredId && items.some((item) => item.id === preferredId) ? preferredId : items.some((item) => item.id === current) ? current : items[0]?.id ?? '');
    return items;
  }, []);

  useEffect(() => {
    void fetchChatWorkspaces()
      .then((items) => {
        setWorkspaces(items); setWorkspaceId(items[0]?.id ?? '');
        const invite = new URLSearchParams(window.location.search).get('invite');
        if (invite) { setFormValue(invite); setDialog('join'); }
      })
      .catch(() => setError('워크스페이스를 불러오지 못했습니다. 새 SQL 마이그레이션을 확인해 주세요.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    let active = true;
    void fetchWorkspaceChannels(workspaceId)
      .then((items) => { if (active) { setChannels(items); setChannelId(items[0]?.id ?? ''); } })
      .catch(() => setError('채널 목록을 불러오지 못했습니다.'));
    return () => { active = false; };
  }, [workspaceId]);

  useEffect(() => {
    if (!channelId) return;
    let active = true;
    void fetchChannelMessages(channelId).then((items) => { if (active) setMessages(items); }).catch(() => setError('메시지를 불러오지 못했습니다.')).finally(() => { if (active) setLoading(false); });
    const realtime = supabase.channel(`chat:${channelId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${channelId}` }, (payload) => {
      void hydrateRealtimeMessage(payload.new as Parameters<typeof hydrateRealtimeMessage>[0]).then((message) => { if (active) setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]); });
    }).subscribe();
    return () => { active = false; void supabase.removeChannel(realtime); };
  }, [channelId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const openDialog = (next: Dialog) => { setDialog(next); setFormValue(''); setGeneratedInvite(''); setCopied(false); setError(''); };
  const closeDialog = () => { if (!saving) setDialog(null); };

  const submitDialog = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      if (dialog === 'workspace') {
        const id = await createChatWorkspace(formValue); await loadWorkspaces(id); setDialog(null);
      } else if (dialog === 'channel' && workspaceId) {
        const id = await createChatChannel(workspaceId, formValue); const items = await fetchWorkspaceChannels(workspaceId); setChannels(items); setChannelId(id); setDialog(null);
      } else if (dialog === 'join') {
        const id = await acceptWorkspaceInvite(formValue); await loadWorkspaces(id); window.history.replaceState(null, '', '/chat'); setDialog(null);
      }
      setFormValue('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '요청을 처리하지 못했습니다.'); }
    finally { setSaving(false); }
  };

  const makeInvite = async () => {
    if (!workspaceId) return;
    setSaving(true); setError('');
    try { setGeneratedInvite(await createWorkspaceInvite(workspaceId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '초대 코드를 만들지 못했습니다.'); }
    finally { setSaving(false); }
  };

  const copyInvite = async () => {
    const link = `${window.location.origin}/chat?invite=${generatedInvite}`;
    await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  };

  const submitMessage = async (event: FormEvent) => {
    event.preventDefault(); if (!channelId || !content.trim()) return;
    setSending(true); setError('');
    try { const message = await createChannelMessage(channelId, content); setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]); setContent(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '메시지를 보내지 못했습니다.'); }
    finally { setSending(false); }
  };

  return <div className="grid h-[calc(100dvh-4.5rem)] min-h-[38rem] overflow-hidden bg-white md:h-screen lg:grid-cols-[16.5rem_minmax(0,1fr)]">
    <aside className="chat-nav flex min-h-0 flex-col border-b border-[var(--nav-border)] bg-[var(--nav-bg)] text-[var(--nav-text)] lg:border-b-0 lg:border-r">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-white/15 px-3">
        <label className="min-w-0 flex-1"><span className="sr-only">워크스페이스 선택</span><select value={workspaceId} onChange={(event) => { setLoading(true); setChannels([]); setChannelId(''); setMessages([]); setWorkspaceId(event.target.value); }} className="h-9 w-full truncate bg-transparent px-1 text-[15px] font-black text-white outline-none [&>option]:text-slate-950"><option value="">워크스페이스 선택</option>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <button type="button" onClick={() => openDialog('workspace')} aria-label="워크스페이스 만들기" className="grid size-8 place-items-center hover:bg-white/10"><Plus size={18}/></button>
      </div>
      <div className="grid grid-cols-2 border-b border-white/10 text-[11px] font-bold"><button type="button" onClick={() => openDialog('join')} className="flex h-9 items-center justify-center gap-1.5 border-r border-white/10 text-white/75 hover:bg-white/10 hover:text-white"><LogIn size={13}/>초대 참여</button><button type="button" onClick={() => openDialog('invite')} disabled={!canManage} className="flex h-9 items-center justify-center gap-1.5 text-white/75 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"><UserPlus size={13}/>멤버 초대</button></div>
      <div className="border-b border-white/10 p-2.5"><label className="chat-nav-search flex h-8 items-center gap-2 border border-white/25 bg-[#260027]/40 px-2 text-white/60 focus-within:border-white/70 focus-within:text-white"><Search size={14}/><span className="sr-only">채널 검색</span><input value={channelQuery} onChange={(event) => setChannelQuery(event.target.value)} placeholder="채널 검색" className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/50"/></label></div>
      <nav className="min-h-0 flex-1 overflow-y-auto py-2" aria-label="워크스페이스 채널">
        <div className="flex h-8 items-center justify-between px-4 text-xs font-bold text-white/70"><span className="flex items-center gap-2"><ChevronDown size={13}/>채널</span>{canManage && <button type="button" onClick={() => openDialog('channel')} aria-label="채널 추가" className="grid size-6 place-items-center hover:bg-white/10"><Plus size={15}/></button>}</div>
        {visibleChannels.map((item) => <button key={item.id} type="button" onClick={() => { setLoading(true); setError(''); setChannelId(item.id); }} className={`flex h-8 w-full items-center gap-2 px-5 text-left text-[13px] transition ${channelId === item.id ? 'chat-nav-active bg-[#1164a3] font-bold text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}><Hash size={15}/><span className="truncate">{item.name}</span></button>)}
        {!workspaceId && <div className="px-5 py-5 text-xs leading-5 text-white/55">워크스페이스를 만들거나<br/>초대 코드로 참여해 주세요.</div>}
        {workspaceId && !visibleChannels.length && <p className="px-5 py-3 text-xs text-white/50">채널이 없습니다.</p>}
      </nav>
      <div className="hidden border-t border-white/10 px-4 py-3 text-xs text-white/60 lg:flex lg:items-center lg:gap-2"><span className="size-2 rounded-full bg-emerald-400"/>{workspace ? `${workspace.role === 'owner' ? '소유자' : workspace.role === 'admin' ? '관리자' : '멤버'} · 온라인` : '워크스페이스 없음'}</div>
    </aside>

    <section className="flex min-h-0 min-w-0 flex-col bg-white">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4"><div className="min-w-0"><div className="flex items-center gap-1"><Hash size={18} className="text-slate-600"/><h1 className="truncate text-[15px] font-black text-slate-950">{channel?.name ?? '채널을 선택해 주세요'}</h1><ChevronDown size={15} className="text-slate-400"/></div><p className="mt-0.5 hidden truncate text-[11px] text-slate-500 sm:block">{channel?.description ?? '워크스페이스에서 채널을 선택해 주세요.'}</p></div><div className="flex items-center text-slate-500"><button type="button" aria-label="알림" className="grid size-9 place-items-center hover:bg-slate-100"><Bell size={17}/></button><button type="button" aria-label="허들" className="grid size-9 place-items-center hover:bg-slate-100"><Headphones size={17}/></button><button type="button" aria-label="채널 검색" className="grid size-9 place-items-center hover:bg-slate-100"><Search size={17}/></button></div></header>
      <div className="flex h-9 shrink-0 items-end gap-5 border-b border-slate-200 px-4 text-xs font-bold text-slate-500"><span className="flex h-full items-center border-b-2 border-[#611f69] text-slate-950"><MessageSquareText size={14} className="mr-1.5"/>메시지</span><span className="flex h-full items-center">파일 및 링크</span></div>
      <div className="min-h-0 flex-1 overflow-y-auto py-4" aria-live="polite">
        {loading ? <div className="grid h-full place-items-center"><LoaderCircle className="animate-spin text-[#611f69]" aria-label="불러오는 중"/></div> : !channel ? <div className="grid h-full place-items-center px-6 text-center"><div><MessageSquareText className="mx-auto text-slate-300" size={42}/><h2 className="mt-4 text-lg font-black text-slate-900">대화를 시작할 공간을 선택하세요</h2><p className="mt-1 text-sm text-slate-500">새 워크스페이스를 만들거나 초대 코드로 참여할 수 있습니다.</p><div className="mt-5 flex justify-center gap-2"><button type="button" onClick={() => openDialog('workspace')} className="h-9 bg-[#611f69] px-3 text-xs font-bold text-white">워크스페이스 만들기</button><button type="button" onClick={() => openDialog('join')} className="h-9 border border-slate-300 px-3 text-xs font-bold">초대 코드 입력</button></div></div></div> : messages.length === 0 ? <div className="flex h-full items-end px-5 pb-6"><div><Hash size={38} className="text-slate-800"/><h2 className="mt-3 text-xl font-black text-slate-950">#{channel.name} 채널에 오신 것을 환영합니다</h2><p className="mt-1 text-sm text-slate-500">이 채널의 시작입니다. 워크스페이스 멤버들과 대화를 나눠보세요.</p></div></div> : <div>{messages.map((message, index) => { const grouped = index > 0 && messages[index - 1].authorId === message.authorId && Date.parse(message.createdAt) - Date.parse(messages[index - 1].createdAt) < 300000; return <article key={message.id} className={`group flex gap-2.5 px-4 hover:bg-[#f8f8f8] ${grouped ? 'py-0.5' : 'mt-2 py-1.5'}`}>{grouped ? <time className="w-9 shrink-0 pt-1 text-right text-[9px] text-slate-400 opacity-0 group-hover:opacity-100" dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</time> : <div className="grid size-9 shrink-0 place-items-center bg-[#2eb67d] text-sm font-black text-white">{message.author.slice(0, 1)}</div>}<div className="min-w-0 flex-1">{!grouped && <div className="flex flex-wrap items-baseline gap-2"><strong className="text-[14px] text-slate-950">{message.author}</strong><time className="text-[10px] text-slate-400" dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></div>}<p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-slate-800">{message.content}</p></div></article>; })}<div ref={endRef}/></div>}
      </div>
      <form onSubmit={(event) => void submitMessage(event)} className="shrink-0 px-4 pb-4"><div className="border border-slate-400 bg-white focus-within:border-slate-700 focus-within:shadow-[0_0_0_1px_#334155]"><textarea value={content} onChange={(event) => { setContent(event.target.value); setError(''); }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} maxLength={CHAT_MESSAGE_MAX} rows={2} placeholder={channel ? `#${channel.name}에 메시지 보내기` : '채널을 선택해 주세요'} disabled={!channelId || sending} className="max-h-32 min-h-14 w-full resize-none border-0 px-3 py-2.5 text-[13px] outline-none disabled:bg-slate-50"/><div className="flex h-9 items-center justify-between border-t border-slate-100 px-1.5 text-slate-500"><div className="flex items-center"><span className="grid size-7 place-items-center text-base font-black">B</span><span className="grid size-7 place-items-center text-sm italic">I</span><span className="grid size-7 place-items-center"><AtSign size={15}/></span></div><button type="submit" disabled={!content.trim() || !channelId || sending} aria-label="메시지 보내기" className="grid size-7 place-items-center bg-[#007a5a] text-white disabled:bg-slate-200 disabled:text-slate-400"><Send size={15}/></button></div></div>{error && !dialog && <p role="alert" className="mt-1.5 text-xs font-semibold text-red-600">{error}</p>}<p className="mt-1 text-[10px] text-slate-400">Enter로 전송 · Shift+Enter로 줄바꿈</p></form>
    </section>

    {dialog && <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/55 p-4" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeDialog(); }}><section role="dialog" aria-modal="true" aria-labelledby="chat-dialog-title" className="w-full max-w-md border border-slate-300 bg-white shadow-2xl"><header className="flex h-14 items-center justify-between border-b border-slate-200 px-5"><h2 id="chat-dialog-title" className="font-black text-slate-950">{dialog === 'workspace' ? '새 워크스페이스' : dialog === 'channel' ? '새 채널' : dialog === 'join' ? '워크스페이스 참여' : '멤버 초대'}</h2><button type="button" onClick={closeDialog} aria-label="닫기" className="grid size-8 place-items-center hover:bg-slate-100"><X size={18}/></button></header>
      {dialog === 'invite' ? <div className="p-5"><p className="text-sm leading-6 text-slate-600"><strong className="text-slate-950">{workspace?.name}</strong>에 동료를 초대합니다. 초대 코드는 7일 동안 유효합니다.</p>{generatedInvite ? <><div className="mt-5 border border-slate-300 bg-slate-50 p-4 text-center font-mono text-xl font-black tracking-[0.2em] text-[#611f69]">{generatedInvite}</div><button type="button" onClick={() => void copyInvite()} className="mt-3 flex h-10 w-full items-center justify-center gap-2 bg-[#611f69] text-sm font-bold text-white">{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? '초대 링크 복사됨' : '초대 링크 복사'}</button></> : <button type="button" onClick={() => void makeInvite()} disabled={saving} className="mt-5 h-10 w-full bg-[#611f69] text-sm font-bold text-white disabled:opacity-50">{saving ? '생성 중...' : '7일 초대 코드 만들기'}</button>}{error && <p role="alert" className="mt-3 text-xs font-semibold text-red-600">{error}</p>}</div> : <form onSubmit={(event) => void submitDialog(event)} className="p-5"><p className="text-sm text-slate-600">{dialog === 'workspace' ? '팀이나 프로젝트 이름을 입력하세요.' : dialog === 'channel' ? `${workspace?.name}에 새 채널을 추가합니다.` : '전달받은 초대 코드 또는 초대 링크의 코드를 입력하세요.'}</p><label className="mt-4 block text-xs font-bold text-slate-700">{dialog === 'workspace' ? '워크스페이스 이름' : dialog === 'channel' ? '채널 이름' : '초대 코드'}<input autoFocus value={formValue} onChange={(event) => { setFormValue(event.target.value); setError(''); }} minLength={2} maxLength={dialog === 'workspace' ? 40 : 30} placeholder={dialog === 'workspace' ? '예: 프로덕트 팀' : dialog === 'channel' ? '예: 프로젝트-알파' : '예: A1B2C3D4E5'} className="mt-2 h-11 w-full border border-slate-300 px-3 text-sm outline-none focus:border-[#611f69] focus:shadow-[0_0_0_1px_#611f69]" required/></label>{error && <p role="alert" className="mt-3 text-xs font-semibold text-red-600">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={closeDialog} className="h-10 border border-slate-300 px-4 text-sm font-bold">취소</button><button type="submit" disabled={saving || !formValue.trim()} className="h-10 bg-[#611f69] px-4 text-sm font-bold text-white disabled:opacity-50">{saving ? '처리 중...' : dialog === 'join' ? '참여하기' : '만들기'}</button></div></form>}
    </section></div>}
  </div>;
}
