import Link from 'next/link';

export default function OfflinePage() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-5 py-[calc(2rem+env(safe-area-inset-top))]">
      <section className="card w-full max-w-md p-7 text-center sm:p-9">
        <div aria-hidden="true" className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-blue-50 text-3xl">🚇</div>
        <h1 className="text-2xl font-black tracking-tight">지금은 오프라인이에요</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">네트워크 연결을 확인한 뒤 다시 시도해 주세요. 개인 기록과 계정 정보는 기기에 캐시하지 않습니다.</p>
        <Link href="/" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 font-bold text-white hover:bg-blue-700">다시 연결하기</Link>
      </section>
    </main>
  );
}
