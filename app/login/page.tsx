'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff, Siren } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const USERNAME_PATTERN = /^[a-z0-9_]{4,20}$/;
const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9_ ]{2,12}$/;
const AUTH_DOMAIN = 'users.commute-battle.local';

function authEmail(loginId: string) {
  const normalized = loginId.trim().toLowerCase();
  return normalized.includes('@') ? normalized : `${normalized}@${AUTH_DOMAIN}`;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [loginId, setLoginId] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [requestAdmin, setRequestAdmin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => { if (data.session) router.replace('/'); });
  }, [router]);

  const switchMode = () => {
    setMode((current) => current === 'signin' ? 'signup' : 'signin');
    setError(''); setPassword('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const normalizedId = loginId.trim().toLowerCase();
    if (mode === 'signup' && !USERNAME_PATTERN.test(normalizedId)) return setError('아이디는 영문 소문자, 숫자, 밑줄로 4~20자 입력해 주세요.');
    if (mode === 'signup' && !NICKNAME_PATTERN.test(nickname.trim())) return setError('닉네임은 한글·영문·숫자로 2~12자 입력해 주세요.');
    if (password.length < 8) return setError('비밀번호는 8자 이상 입력해 주세요.');
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { data, error: authError } = await supabase.auth.signUp({
          email: authEmail(normalizedId), password,
          options: { data: { username: normalizedId, nickname: nickname.trim(), admin_requested: requestAdmin } },
        });
        if (authError) throw authError;
        if (!data.user || !data.session) {
          setError('간편 가입 설정이 아직 적용되지 않았습니다. 관리자에게 문의해 주세요.');
          return;
        }
        const { error: profileError } = await supabase.from('users').upsert({
          id: data.user.id, username: normalizedId, nickname: nickname.trim(),
          character_level: 1, character_exp: 0, character_stage: 'alg',
          total_commute_starts: 0, total_commute_arrivals: 0,
        }, { onConflict: 'id' });
        if (profileError) throw profileError;
        localStorage.setItem('userId', data.user.id);
      } else {
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email: authEmail(normalizedId), password });
        if (authError) throw authError;
        if (!data.user) throw new Error('NO_USER');
        localStorage.setItem('userId', data.user.id);
      }
      const next = new URLSearchParams(window.location.search).get('next');
      router.replace(next?.startsWith('/') && !next.startsWith('//') ? next : '/');
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message.toLowerCase() : '';
      setError(message.includes('invalid login') ? '아이디 또는 비밀번호를 확인해 주세요.' : message.includes('already registered') || message.includes('already been registered') ? '이미 사용 중인 아이디입니다.' : '처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally { setLoading(false); }
  };

  return <main className="grid min-h-[100dvh] place-items-center bg-slate-50 px-4 py-10">
    <div className="w-full max-w-md">
      <button type="button" onClick={() => router.push('/')} className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-slate-500 hover:bg-white"><ArrowLeft size={16}/>소개로 돌아가기</button>
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-blue-600 text-white"><Siren size={21}/></span><div><h1 className="text-lg font-black text-slate-950">출퇴근 생존일지</h1><p className="text-xs text-slate-500">{mode === 'signin' ? '내 기록 이어보기' : '새 생존일지 만들기'}</p></div></div>
        <div className="mt-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="로그인 방식"><button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => mode !== 'signin' && switchMode()} className={`min-h-10 rounded-lg text-sm font-bold ${mode === 'signin' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>로그인</button><button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => mode !== 'signup' && switchMode()} className={`min-h-10 rounded-lg text-sm font-bold ${mode === 'signup' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>회원가입</button></div>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <label className="block text-xs font-bold text-slate-700">아이디<input value={loginId} onChange={(e) => { setLoginId(e.target.value); setError(''); }} autoComplete="username" placeholder={mode === 'signin' ? '아이디 입력' : '영문 소문자·숫자 4~20자'} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-3.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" required/></label>
          {mode === 'signup' && <label className="block text-xs font-bold text-slate-700">닉네임<input value={nickname} onChange={(e) => { setNickname(e.target.value); setError(''); }} autoComplete="nickname" placeholder="서비스에서 사용할 이름" maxLength={12} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-3.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" required/></label>}
          {mode === 'signup' && <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"><input type="checkbox" checked={requestAdmin} onChange={(e) => setRequestAdmin(e.target.checked)} className="mt-0.5 size-4 accent-blue-600"/><span><strong className="block text-slate-800">관리자 권한 신청</strong><span className="mt-1 block leading-5">워크스페이스에 참여하면 소유자의 승인을 받은 뒤 부서 현황을 볼 수 있습니다.</span></span></label>}
          <label className="block text-xs font-bold text-slate-700">비밀번호<span className="relative mt-2 block"><input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} placeholder="8자 이상 입력" minLength={8} className="min-h-12 w-full rounded-xl border border-slate-200 px-3.5 pr-12 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" required/><button type="button" onClick={() => setShowPassword((show) => !show)} aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'} className="absolute inset-y-0 right-0 grid w-12 place-items-center text-slate-400">{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span></label>
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs font-semibold leading-5 text-red-700">{error}</p>}
          <button type="submit" disabled={loading} className="min-h-12 w-full rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">{loading ? '처리 중…' : mode === 'signin' ? '로그인' : '가입하고 시작하기'}</button>
        </form>
        <p className="mt-5 text-center text-[11px] leading-5 text-slate-400">비밀번호는 Supabase 인증 시스템에서 안전하게 관리되며 앱 DB에 저장되지 않습니다.</p>
      </section>
    </div>
  </main>;
}
