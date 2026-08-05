import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  Check,
  Clock3,
  Leaf,
  LockKeyhole,
  MapPin,
  ShieldCheck,
  Siren,
  Sparkles,
  Trophy,
} from 'lucide-react';

interface LandingPageProps {
  onStart: () => void;
}

const features = [
  {
    icon: Clock3,
    title: '오늘의 출발 타이밍',
    description: '날씨와 이동 상황을 한눈에 보고, 여유로운 출근 시간을 준비해요.',
    tone: 'bg-sky-50 text-sky-600',
  },
  {
    icon: Trophy,
    title: '매일 쌓이는 성장 기록',
    description: '출발과 도착을 기록할수록 캐릭터와 배지가 함께 성장해요.',
    tone: 'bg-amber-50 text-amber-600',
  },
  {
    icon: Bot,
    title: '나만의 AI 출근 코치',
    description: '내 기록을 바탕으로 더 나은 출근 루틴을 친절하게 제안해요.',
    tone: 'bg-violet-50 text-violet-600',
  },
];

export default function LandingPage({ onStart }: LandingPageProps) {
  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#f7f9fd] text-slate-900">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[42rem] overflow-hidden" aria-hidden="true">
        <div className="absolute -left-32 top-10 size-80 rounded-full bg-sky-200/40 blur-3xl" />
        <div className="absolute -right-28 -top-24 size-96 rounded-full bg-indigo-200/45 blur-3xl" />
      </div>

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <Link href="/" className="flex items-center gap-2.5 rounded-lg font-bold tracking-tight" aria-label="출퇴근 생존일지 홈">
          <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-lg shadow-blue-200">
            <Siren size={20} aria-hidden="true" />
          </span>
          <span>출퇴근 생존일지</span>
        </Link>
        <Link
          href="/login"
          className="rounded-xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:border-blue-200 hover:text-blue-700"
        >
          로그인
        </Link>
      </header>

      <main className="relative">
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 sm:px-8 sm:pt-16 lg:grid-cols-[1.02fr_.98fr] lg:px-10 lg:pb-28 lg:pt-20">
          <div className="text-center lg:text-left">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/80 px-3.5 py-2 text-xs font-bold text-blue-700 shadow-sm backdrop-blur">
              <Sparkles size={14} aria-hidden="true" />
              지루한 출근길을 작은 성취로
            </div>
            <h1 className="text-balance text-4xl font-black leading-[1.12] tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-6xl">
              오늘도 무사히,
              <br />
              <span className="bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 bg-clip-text text-transparent">출근 퀘스트 완료!</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-pretty text-base leading-7 text-slate-600 sm:text-lg lg:mx-0">
              매일 반복되는 출퇴근을 기록하고, 캐릭터를 키우고, AI 코치와 더 나은 루틴을 만들어 보세요.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
              <button
                type="button"
                onClick={onStart}
                className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700"
              >
                무료로 시작하기
                <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
              <a
                href="#features"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                기능 둘러보기
              </a>
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs font-medium text-slate-500 lg:justify-start">
              <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-emerald-500" />카드 등록 없음</span>
              <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-emerald-500" />기본 기능 무료</span>
              <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-emerald-500" />1분 만에 시작</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-lg" aria-label="서비스 대시보드 미리보기">
            <div className="absolute -inset-5 rotate-2 rounded-[2rem] bg-gradient-to-br from-blue-200/50 to-violet-200/30 blur-sm" aria-hidden="true" />
            <div className="relative rounded-[1.75rem] border border-white/80 bg-white/90 p-4 shadow-2xl shadow-blue-950/10 backdrop-blur sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-400">8월 6일 목요일</p>
                  <p className="mt-1 text-lg font-extrabold">좋은 아침이에요! 👋</p>
                </div>
                <div className="flex size-10 items-center justify-center rounded-full bg-blue-50 text-blue-600"><Siren size={19} /></div>
              </div>
              <div className="mt-5 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-5 text-white shadow-lg shadow-blue-200">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-blue-100">AI 추천 출발 시간</p>
                    <p className="mt-2 text-3xl font-black tracking-tight">오전 7:42</p>
                    <p className="mt-2 text-xs text-blue-100">평소보다 8분 일찍 출발해요</p>
                  </div>
                  <div className="rounded-xl bg-white/15 p-3"><Clock3 size={24} /></div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><MapPin size={18} /></div>
                  <p className="mt-3 text-xs text-slate-400">이번 달 기록</p><p className="mt-1 text-xl font-black">18일</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Trophy size={18} /></div>
                  <p className="mt-3 text-xs text-slate-400">현재 연속 기록</p><p className="mt-1 text-xl font-black">7일 🔥</p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3 rounded-2xl bg-slate-50 p-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600"><Bot size={21} /></div>
                <p className="text-xs leading-5 text-slate-600"><strong className="block text-slate-900">오늘의 AI 코치</strong>비 소식이 있어요. 작은 우산을 챙겨 보세요!</p>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-8 border-y border-slate-200/70 bg-white/70 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-10">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-bold text-blue-600">매일 쓰고 싶은 출근 도구</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">출근길에 필요한 것을 한곳에</h2>
              <p className="mt-4 leading-7 text-slate-600">복잡한 정보는 줄이고, 오늘의 행동에 꼭 필요한 것만 보여드려요.</p>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {features.map(({ icon: Icon, title, description, tone }) => (
                <article key={title} className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                  <div className={`flex size-11 items-center justify-center rounded-xl ${tone}`}><Icon size={21} aria-hidden="true" /></div>
                  <h3 className="mt-5 text-lg font-extrabold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24 lg:px-10">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 p-7 sm:p-9">
              <Leaf className="text-emerald-600" size={26} aria-hidden="true" />
              <h2 className="mt-5 text-2xl font-black">부담 없이, 무료로</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">핵심 출퇴근 기록 기능은 결제 정보 없이 시작할 수 있어요. 오늘부터 가볍게 루틴을 만들어 보세요.</p>
            </div>
            <div className="rounded-3xl border border-blue-100 bg-blue-50/70 p-7 sm:p-9">
              <ShieldCheck className="text-blue-600" size={26} aria-hidden="true" />
              <h2 className="mt-5 text-2xl font-black">내 기록은 조심스럽게</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">서비스에 필요한 정보만 사용하고, 로그인 없이도 먼저 시작할 수 있어요. 내 출퇴근 기록의 주인은 나예요.</p>
            </div>
          </div>
          <div className="mt-16 rounded-3xl bg-slate-950 px-6 py-10 text-center text-white sm:px-10 sm:py-14">
            <LockKeyhole className="mx-auto text-sky-400" size={26} aria-hidden="true" />
            <h2 className="mt-4 text-2xl font-black sm:text-3xl">내일의 출근을 오늘보다 가볍게</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-300">첫 기록부터 캐릭터의 성장이 시작됩니다.</p>
            <button type="button" onClick={onStart} className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-sky-50">
              지금 무료로 시작하기 <ArrowRight size={17} aria-hidden="true" />
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200/80 bg-white/60 px-5 py-7 text-center text-xs text-slate-500">
        © 2026 출퇴근 생존일지 · 매일의 이동을 나다운 기록으로
      </footer>
    </div>
  );
}
