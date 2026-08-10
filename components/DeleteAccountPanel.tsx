'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { clearAllLocalSettings } from '@/lib/store';

export default function DeleteAccountPanel({ userId }: { userId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (confirmation !== '회원탈퇴') return setError('확인란에 회원탈퇴를 정확히 입력해 주세요.');
    if (password.length < 8) return setError('현재 비밀번호를 입력해 주세요.');
    setLoading(true); setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('로그인 정보를 확인할 수 없습니다.');
      const { error: passwordError } = await supabase.auth.signInWithPassword({ email: user.email, password });
      if (passwordError) throw new Error('현재 비밀번호가 올바르지 않습니다.');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('로그인 세션을 확인할 수 없습니다.');
      const response = await fetch('/api/account', { method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` } });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || '계정을 삭제하지 못했습니다.');
      clearAllLocalSettings(userId);
      localStorage.clear();
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      router.replace('/login');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '계정을 삭제하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return <div className="border border-red-300 bg-red-50 p-4"><div className="flex items-start gap-3"><Trash2 className="mt-0.5 shrink-0 text-red-600" size={18}/><div className="flex-1"><h3 className="text-sm font-bold text-red-800">회원탈퇴</h3><p className="mt-1 text-xs leading-5 text-red-700">계정과 출퇴근 기록을 영구 삭제합니다. 소유한 워크스페이스는 다른 구성원에게 승계됩니다.</p><button type="button" onClick={() => setOpen(true)} className="mt-3 min-h-10 border border-red-500 px-3 text-xs font-bold text-red-700">회원탈퇴 진행</button></div></div></div>;

  return <form onSubmit={submit} className="border border-red-400 bg-red-50 p-4"><h3 className="text-sm font-bold text-red-800">회원탈퇴 최종 확인</h3><p className="mt-1 text-xs leading-5 text-red-700">이 작업은 되돌릴 수 없습니다. 현재 비밀번호와 확인 문구를 입력해 주세요.</p><label className="mt-4 block text-xs font-bold text-red-800">현재 비밀번호<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" minLength={8} className="mt-2 min-h-11 w-full border border-red-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-red-600" required/></label><label className="mt-3 block text-xs font-bold text-red-800">확인 문구<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="회원탈퇴" className="mt-2 min-h-11 w-full border border-red-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-red-600" required/></label>{error && <p role="alert" className="mt-3 text-xs font-bold text-red-700">{error}</p>}<div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => { setOpen(false); setPassword(''); setConfirmation(''); setError(''); }} disabled={loading} className="min-h-10 border border-slate-300 px-3 text-xs font-bold">취소</button><button type="submit" disabled={loading || confirmation !== '회원탈퇴'} className="inline-flex min-h-10 items-center gap-2 bg-red-600 px-3 text-xs font-bold text-white disabled:opacity-50">{loading && <LoaderCircle size={14} className="animate-spin"/>}계정 영구 삭제</button></div></form>;
}
