'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'pwa-install-prompt-dismissed';

export default function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const dismissed = sessionStorage.getItem(DISMISSED_KEY) === 'true';
    if (!standalone && !dismissed && isIos) {
      const showHelp = window.setTimeout(() => { setShowIosHelp(true); setHidden(false); }, 0);
      return () => window.clearTimeout(showHelp);
    }
    const handlePrompt = (event: Event) => {
      event.preventDefault(); setInstallEvent(event as BeforeInstallPromptEvent);
      if (!dismissed) setHidden(false);
    };
    const handleInstalled = () => setHidden(true);
    window.addEventListener('beforeinstallprompt', handlePrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', handlePrompt); window.removeEventListener('appinstalled', handleInstalled); };
  }, []);

  if (hidden || (!installEvent && !showIosHelp)) return null;
  const dismiss = () => { sessionStorage.setItem(DISMISSED_KEY, 'true'); setHidden(true); };
  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === 'accepted') setHidden(true);
    setInstallEvent(null);
  };

  return (
    <aside aria-label="앱 설치 안내" className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[70] mx-auto max-w-md rounded-2xl border border-blue-200 bg-white p-4 shadow-2xl md:bottom-5">
      <div className="flex gap-3">
        <div aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-xl text-white">⚔️</div>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold">홈 화면에서 바로 시작하세요</p>
          <p className="mt-1 text-sm leading-5 text-slate-600">{showIosHelp && !installEvent ? 'Safari의 공유 버튼을 누른 뒤 ‘홈 화면에 추가’를 선택하세요.' : '출퇴근 배틀을 앱처럼 빠르게 열 수 있어요.'}</p>
          <div className="mt-3 flex gap-2">
            {installEvent && <button type="button" onClick={install} className="min-h-10 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">설치하기</button>}
            <button type="button" onClick={dismiss} className="min-h-10 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">나중에</button>
          </div>
        </div>
      </div>
    </aside>
  );
}
