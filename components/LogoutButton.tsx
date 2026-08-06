'use client';

import { LogOut } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/lib/store';
import { useRouter } from 'next/navigation';

export default function LogoutButton({ compact = false }: { compact?: boolean }) {
  const setUser = useStore((state) => state.setUser);
  const router = useRouter();
  const logout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('userId');
    setUser(null);
    router.replace('/');
    router.refresh();
  };
  return <button type="button" onClick={() => void logout()} aria-label="로그아웃" className={compact ? 'group relative flex size-11 items-center justify-center rounded-[14px] text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900' : 'inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700'}><LogOut size={18}/>{compact ? <span className="sidebar-tooltip">로그아웃</span> : '로그아웃'}</button>;
}
