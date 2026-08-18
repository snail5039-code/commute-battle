'use client';

import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { getPwaServerSnapshot, getPwaSnapshot, initializePwaInstall, requestPwaInstall, subscribePwa } from '@/lib/pwa';
import { supabase } from '@/lib/supabase';

const HIDDEN_TODAY_KEY = 'pwa-install-prompt-hidden-until';

function hiddenUntilTomorrow() {
  const tomorrow = new Date();
  tomorrow.setHours(24, 0, 0, 0);
  localStorage.setItem(HIDDEN_TODAY_KEY, String(tomorrow.getTime()));
}

export default function PwaInstallPrompt() {
  const pwa = useSyncExternalStore(subscribePwa, getPwaSnapshot, getPwaServerSnapshot);
  const [closed, setClosed] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    initializePwaInstall();
    void supabase.auth.getSession().then(({ data }) => setAuthenticated(Boolean(data.session)));
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => setAuthenticated(Boolean(session)));
    const hiddenUntil = Number(localStorage.getItem(HIDDEN_TODAY_KEY) ?? 0);
    const reveal = window.setTimeout(() => setClosed(hiddenUntil > Date.now()), 0);
    return () => { window.clearTimeout(reveal); authListener.subscription.unsubscribe(); };
  }, []);

  const manualHelp = pwa.platform === 'ios';
  if (!authenticated || closed || pwa.installed || (!pwa.canPrompt && !manualHelp)) return null;

  const install = async () => {
    const result = await requestPwaInstall();
    if (result !== 'dismissed') setClosed(true);
  };
  const hideToday = () => {
    hiddenUntilTomorrow();
    setClosed(true);
  };

  return (
    <aside aria-label="앱 설치 안내" className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[70] mx-auto max-w-md rounded-2xl border border-blue-200 bg-white p-4 shadow-2xl md:bottom-5">
      <div className="flex gap-3">
        <div aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-xl text-white">📲</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="flex-1 font-extrabold">홈 화면에서 바로 시작하세요</p>
            <button type="button" aria-label="설치 안내 닫기" onClick={() => setClosed(true)} className="-mr-2 -mt-2 min-h-10 min-w-10 rounded-lg text-xl text-slate-500 hover:bg-slate-100">×</button>
          </div>
          <p className="mt-1 text-sm leading-5 text-slate-600">{manualHelp && !pwa.canPrompt ? 'Safari의 공유 버튼을 누른 뒤 ‘홈 화면에 추가’를 선택하세요.' : '출퇴근 생존일지을 앱처럼 빠르게 열 수 있어요.'}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {pwa.canPrompt && <button type="button" onClick={() => void install()} className="min-h-10 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">설치하기</button>}
            <Link href="/install" onClick={() => setClosed(true)} className="inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">설치 방법</Link>
            <button type="button" onClick={hideToday} className="min-h-10 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">오늘 하루 보지 않기</button>
          </div>
        </div>
      </div>
    </aside>
  );
}
