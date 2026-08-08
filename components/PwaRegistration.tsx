'use client';

import { useEffect, useState } from 'react';

export default function PwaRegistration() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // 개발 모드에서 SW를 등록하면 캐시가 next dev의 재컴파일보다 오래 살아남아,
    // 코드를 고쳐도 브라우저가 예전 번들을 계속 보여주는 문제가 생긴다.
    if (process.env.NODE_ENV !== 'production') return;
    let refreshing = false;
    const handleControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        if (registration.waiting && navigator.serviceWorker.controller) setWaitingWorker(registration.waiting);
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaitingWorker(worker);
          });
        });
      } catch { /* Progressive enhancement: registration failure does not block the app. */ }
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    void register();
    return () => navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
  }, []);

  if (!waitingWorker) return null;
  return (
    <aside aria-live="polite" className="fixed inset-x-3 top-[calc(.75rem+env(safe-area-inset-top))] z-[80] mx-auto flex max-w-lg items-center gap-3 rounded-2xl bg-slate-900 p-4 text-white shadow-2xl">
      <p className="min-w-0 flex-1 text-sm font-semibold">새 버전을 사용할 수 있어요.</p>
      <button type="button" onClick={() => waitingWorker.postMessage({ type: 'SKIP_WAITING' })} className="min-h-10 rounded-xl bg-white px-4 text-sm font-bold text-slate-900">지금 업데이트</button>
      <button type="button" aria-label="업데이트 안내 닫기" onClick={() => setWaitingWorker(null)} className="min-h-10 px-2 text-xl text-slate-300">×</button>
    </aside>
  );
}
