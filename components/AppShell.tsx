'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import Sidebar from './Sidebar';
import MobileTabBar from './MobileTabBar';
import SwipeNav from './SwipeNav';
import PetWidget from './PetWidget';
import { applyTheme, loadTheme } from '@/lib/theme';
import ChatNotifications from './ChatNotifications';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const isLoginPage = pathname === '/login';
  const isLandingPage = pathname === '/';

  useEffect(() => {
    const root = document.documentElement;
    applyTheme(loadTheme());
    root.dataset.density = localStorage.getItem('uiCompact') === 'true' ? 'compact' : '';
    root.dataset.contrast = localStorage.getItem('uiContrast') === 'true' ? 'high' : '';
    root.dataset.motion = localStorage.getItem('uiReducedMotion') === 'true' ? 'reduced' : '';
  }, []);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setAuthLoading(false);
      if (!data.session && !isLandingPage && !isLoginPage) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setAuthLoading(false);
      if (!next && !isLandingPage && !isLoginPage) router.replace('/login');
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [isLandingPage, isLoginPage, pathname, router]);

  if (isLoginPage || (isLandingPage && !session)) {
    return <>{children}</>;
  }

  if (authLoading || !session) return <div className="grid min-h-screen place-items-center text-sm font-semibold text-slate-500">로그인 상태를 확인하고 있어요…</div>;

  return (
    <div className="flex min-h-screen bg-transparent">
      <Sidebar />
      <main id="main-content" className="relative min-w-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <SwipeNav>{children}</SwipeNav>
      </main>
      <MobileTabBar />
      <PetWidget />
      {session.user && <ChatNotifications userId={session.user.id} />}
    </div>
  );
}
