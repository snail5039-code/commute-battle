'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Siren } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => { if (data.session) router.replace('/'); });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setStatus('');

    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;

        if (data.user && data.session) {
          const { error: profileError } = await supabase.from('users').upsert({
            id: data.user.id,
            character_level: 1,
            character_exp: 0,
            character_stage: 'alg',
            total_commute_starts: 0,
            total_commute_arrivals: 0,
          }, { onConflict: 'id' });
          if (profileError) throw profileError;
          localStorage.setItem('userId', data.user.id);
        } else {
          setStatus('가입 확인 메일을 보냈습니다. 이메일 인증 후 로그인해 주세요.');
          setMode('signin');
          return;
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;

        if (data.user) {
          localStorage.setItem('userId', data.user.id);
          const { data: profile } = await supabase.from('users').select('id').eq('id', data.user.id).maybeSingle();
          if (!profile) {
            const { error: profileError } = await supabase.from('users').insert({ id: data.user.id, character_level: 1, character_exp: 0, character_stage: 'alg', total_commute_starts: 0, total_commute_arrivals: 0 });
            if (profileError) throw profileError;
          }
        }
      }

      const next = new URLSearchParams(window.location.search).get('next');
      router.replace(next?.startsWith('/') && !next.startsWith('//') ? next : '/');
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다';
      setError(message.includes('Invalid login credentials') ? '이메일 또는 비밀번호를 확인해 주세요.' : message.includes('already registered') ? '이미 가입된 이메일입니다.' : '로그인 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#f5f6f8]">
      <div className="card p-8 max-w-sm w-full mx-4">
        <div className="w-10 h-10 rounded-[10px] bg-gradient-to-b from-blue-500 to-blue-600 flex items-center justify-center shadow-sm mx-auto mb-4">
          <Siren size={20} className="text-white" strokeWidth={2.25} />
        </div>
        <h1 className="text-xl font-semibold text-center text-neutral-900">
          출퇴근전쟁봇
        </h1>
        <p className="text-sm text-neutral-500 text-center mt-1 mb-6">
          {mode === 'signin' ? '로그인' : '계정 만들기'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일"
            required
            className="w-full px-3 py-2 border border-neutral-200 rounded-[10px] text-sm focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 focus:outline-none"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            required
            minLength={8}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            className="w-full px-3 py-2 border border-neutral-200 rounded-[10px] text-sm focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 focus:outline-none"
          />

          {error && <p className="text-xs text-red-600">{error}</p>}
          {status && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">{status}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-[10px] text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {loading ? '처리 중...' : mode === 'signin' ? '로그인' : '가입하기'}
          </button>
        </form>

        <button
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          className="w-full text-center text-xs text-neutral-500 mt-4 hover:text-neutral-700"
        >
          {mode === 'signin'
            ? '계정이 없으신가요? 가입하기'
            : '이미 계정이 있으신가요? 로그인'}
        </button>

        <button type="button" onClick={() => router.push('/')} className="mt-6 w-full text-center text-xs text-neutral-400 underline hover:text-neutral-600">서비스 소개로 돌아가기</button>
      </div>
    </div>
  );
}
