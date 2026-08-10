import Link from 'next/link';
import {
  ArrowRight,
  Award,
  BarChart3,
  Bot,
  Bus,
  Check,
  Clock3,
  MapPin,
  MessageCircle,
  Siren,
} from 'lucide-react';

const features = [
  { icon: MapPin, title: '출퇴근 기록', text: '출발과 도착 시간을 기록하고 오늘의 이동을 확인해요.' },
  { icon: Bus, title: '이동 경로', text: '도보와 대중교통 경로를 한 화면에서 비교해요.' },
  { icon: Award, title: '펫과 배지', text: '꾸준히 기록하며 펫을 키우고 새로운 배지를 모아요.' },
  { icon: BarChart3, title: '캘린더 통계', text: '출근, 퇴근, 지각과 휴가 기록을 기간별로 살펴보고, 주간 리캡은 이미지로 저장하거나 공유해요.' },
  { icon: Bot, title: '기록 비서', text: '내 기록을 바탕으로 칭찬과 개선점을 알려줘요.' },
  { icon: MessageCircle, title: '커뮤니티', text: '공지와 의견을 확인하고 출퇴근 이야기를 나눠요.' },
];

export default function LandingPage({ onStart }: { onStart: () => void }) {
  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-2.5 font-black">
            <span className="grid size-10 place-items-center bg-[#611f69] text-white"><Siren size={19} /></span>
            출퇴근 생존일지
          </Link>
          <Link href="/login" className="inline-flex min-h-10 items-center border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-100">로그인</Link>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-8 px-5 py-12 md:grid-cols-[1fr_25rem] md:items-center md:px-8 md:py-20">
          <div>
            <p className="text-sm font-bold text-[#611f69]">매일 쓰는 출퇴근 기록장</p>
            <h1 className="mt-3 text-4xl font-black leading-tight tracking-tight md:text-5xl">오늘의 출근부터<br />무사 귀가까지</h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">출퇴근 시간을 기록하고, 이동 경로를 확인하고, 나만의 펫과 함께 꾸준한 생활 습관을 만들어 보세요.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button type="button" onClick={onStart} className="inline-flex min-h-12 items-center gap-2 bg-[#611f69] px-5 text-sm font-bold text-white hover:bg-[#4a154b]">시작하기 <ArrowRight size={16} /></button>
              <a href="#features" className="inline-flex min-h-12 items-center border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700">기능 보기</a>
            </div>
            <div className="mt-5 flex flex-wrap gap-4 text-xs text-slate-500">
              {['기본 기능 무료', '모바일·PC 지원', '간편 아이디 가입'].map((text) => <span key={text} className="flex items-center gap-1"><Check size={13} className="text-emerald-600" />{text}</span>)}
            </div>
          </div>

          <div className="border border-slate-300 bg-white p-5">
            <div className="flex items-center justify-between">
              <div><p className="text-xs text-slate-400">오늘의 근무</p><p className="mt-1 font-black">8월 6일 목요일</p></div>
              <span className="bg-[#f4eaf5] px-2.5 py-1.5 text-xs font-bold text-[#611f69]">출근 전</span>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              {[['출근', '09:00'], ['현재', '08:12'], ['퇴근', '18:00']].map(([label, time], index) => <div key={label} className={index === 1 ? 'bg-[#f4eaf5] p-3' : 'bg-slate-50 p-3'}><p className={index === 1 ? 'text-[10px] text-[#7b2b84]' : 'text-[10px] text-slate-400'}>{label}</p><p className={index === 1 ? 'mt-1 font-mono text-sm font-bold text-[#611f69]' : 'mt-1 font-mono text-sm font-bold'}>{time}</p></div>)}
            </div>
            <div className="mt-4 border border-slate-200 p-4">
              <div className="flex items-center gap-2"><Clock3 size={16} className="text-[#611f69]" /><p className="text-sm font-bold">출근까지 48분</p></div>
              <div className="mt-3 h-1.5 overflow-hidden bg-slate-100"><div className="h-full w-2/3 bg-[#611f69]" /></div>
              <p className="mt-3 text-xs leading-5 text-slate-500">경로를 확인하고 여유 있게 준비해 보세요.</p>
            </div>
            <div className="mt-3 flex items-center gap-3 border-l-4 border-emerald-500 bg-emerald-50 p-3"><span className="grid size-9 place-items-center bg-white">🌱</span><p className="text-xs font-semibold text-emerald-900">오늘 기록도 내가 잘 챙겨볼게!</p></div>
          </div>
        </section>

        <section id="features" className="border-y border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-5 py-14 md:px-8">
            <p className="text-sm font-bold text-[#611f69]">주요 기능</p>
            <h2 className="mt-2 text-2xl font-black">출퇴근에 필요한 것만 담았어요</h2>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon: Icon, title, text }) => <article key={title} className="border border-slate-300 p-5 transition-colors hover:border-[#611f69]"><span className="grid size-9 place-items-center bg-[#f4eaf5] text-[#611f69]"><Icon size={18} /></span><h3 className="mt-4 text-sm font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></article>)}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-14 md:px-8">
          <div className="flex flex-col items-start justify-between gap-5 bg-[#3f0e40] p-7 text-white sm:flex-row sm:items-center">
            <div><h2 className="text-xl font-black">내 출퇴근 기록을 시작해 보세요</h2><p className="mt-2 text-sm text-slate-300">아이디, 비밀번호, 닉네임만 입력하면 됩니다.</p></div>
            <button type="button" onClick={onStart} className="min-h-11 shrink-0 bg-white px-5 text-sm font-black text-[#3f0e40]">간편 회원가입</button>
          </div>
        </section>
      </main>
      <footer className="border-t border-slate-200 bg-white px-5 py-7 text-center text-xs text-slate-400">출퇴근 생존일지 · 매일의 이동과 꾸준함을 기록으로</footer>
    </div>
  );
}
