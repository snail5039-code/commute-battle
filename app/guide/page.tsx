import type { Metadata } from 'next';
import Link from 'next/link';
import {
  AlertTriangle, Bot, Building2, CalendarDays, Check, Clock3, House, MapPin, Palmtree,
  Play, Settings, ShieldAlert, ShieldCheck, Sparkles, Thermometer, UserCog, UserPlus,
} from 'lucide-react';
import TopBar from '@/components/TopBar';

export const metadata: Metadata = {
  title: '사용법 | 출퇴근 생존일지',
  description: '직원·부서장·관리자별로 무엇을 언제 누르면 되는지 안내합니다. 출퇴근 기록, 휴가·재택 신청, 근태 정정, 승인, 초기 설정까지.',
};

// 역할마다 볼 것이 다릅니다. 한 화면에 전부 늘어놓으면 직원은 자기와 상관없는 관리자 항목을
// 스크롤로 넘겨야 합니다. 위에서 자기 역할로 바로 뛰게 해 뒀습니다.

const JUMP = [
  { href: '#everyone', label: '직원', hint: '매일 쓰는 것' },
  { href: '#head', label: '부서장', hint: '승인하기' },
  { href: '#admin', label: '관리자', hint: '처음 설정' },
  { href: '#faq', label: '이럴 땐?', hint: '자주 막히는 것' },
];

const DAILY = [
  {
    icon: Play,
    title: '출근 — 두 번 누릅니다',
    body: '집을 나설 때 **출근**, 회사에 닿으면 **무사 도착**. 근무시간은 도착을 누른 시각부터 셉니다.',
    detail: '도착을 안 누르면 그 기록이 열린 채로 남아 다음 출근이 시작되지 않습니다. 깜빡했다면 정정 요청으로 바로잡으세요.',
  },
  {
    icon: House,
    title: '퇴근 — 똑같이 두 번',
    body: '회사를 나설 때 **퇴근**, 집에 닿으면 **무사 도착**. 근무시간은 퇴근을 누른 시각까지입니다.',
    detail: '자정을 넘겨 퇴근해도 괜찮습니다. 출근한 날의 근무로 잡힙니다.',
  },
  {
    icon: Clock3,
    title: '조퇴',
    body: '출근한 날에만, 하루 한 번.',
    detail: '일하다 몸이 안 좋아 먼저 나가는 경우입니다.',
  },
  {
    icon: Thermometer,
    title: '병가',
    body: '승인 없이 바로 기록됩니다. 하루 한 번, 퇴근한 뒤에는 누를 수 없습니다.',
    detail: '아파서 못 나오는 건 그날 아침에 벌어지는 일이라 승인을 기다리게 하지 않았습니다. 연차도 깎이지 않습니다.',
  },
  {
    icon: Palmtree,
    title: '휴가 — 신청하고 승인받습니다',
    body: '대시보드의 휴가 버튼을 누르면 신청 화면으로 갑니다. 승인되면 그 기간의 근무일마다 기록이 자동으로 생깁니다.',
    detail: '주말과 공휴일은 사용 일수에서 빠집니다. 반차는 0.5일이고 하루만 신청할 수 있습니다.',
  },
  {
    icon: MapPin,
    title: '재택근무 — 미리 신청합니다',
    body: '설정 → 근무에서 날짜를 골라 신청하고 승인받으면, 그날은 출근 버튼이 바로 완료 처리됩니다.',
    detail: '승인 없이 재택으로 기록할 수는 없습니다. 요일별 근무 형태를 바꿔도 마찬가지입니다.',
  },
];

const HEAD_CAN = [
  '내 부서원의 근무시간·연장·야간·지각 보기',
  '내 부서원의 연차 잔여 보기',
  '휴가 신청 승인·반려',
  '재택근무 신청 승인·반려',
  '근태 정정 요청 승인·반려',
];

const HEAD_CANNOT = [
  '부서·직급 만들기와 배정 (관리자만)',
  '다음 부서장 지정 (관리자만)',
  '연차 부여 일수 입력 (관리자만)',
  '공휴일·근무 정책·월 마감 (관리자만)',
  '내 기록의 정정을 스스로 승인하기',
];

const SETUP_STEPS = [
  {
    title: '1. 사람을 워크스페이스에 넣습니다',
    body: '부서 채팅에서 초대 코드를 만들어 전달하면, 받은 사람이 같은 화면의 초대 참여에 코드를 넣어 들어옵니다.',
    note: '가입만 하고 워크스페이스에 안 들어온 계정은 조직도에 나타나지 않습니다. 배정도 되지 않습니다.',
    href: '/chat',
    action: '부서 채팅 열기',
  },
  {
    title: '2. 근무 정책과 사업장 위치를 정합니다',
    body: '관리자 현황 → 근무시간 집계 → 근무 정책에서 소정근로 시간, 휴게, 야간 시간대를 정합니다. 같은 화면에서 사업장 위치를 지도로 찍습니다.',
    note: '사업장을 지정하기 전까지 출근 위치 인증은 꺼져 있습니다. 회사에서 현재 위치 버튼을 한 번 누르면 끝납니다.',
    href: '/admin',
    action: '관리자 현황 열기',
  },
  {
    title: '3. 부서와 직급을 만들고 배정합니다',
    body: '관리자 현황 → 조직에서 부서·직급을 만들고 구성원마다 지정합니다.',
    note: '직급은 표시 순서일 뿐 권한이 아닙니다. 승인 권한은 다음 단계의 부서장이 가집니다.',
    href: '/admin',
    action: '조직 설정하기',
  },
  {
    title: '4. 부서마다 부서장을 지정합니다',
    body: '조직 카드의 부서 목록에서 부서장을 고릅니다. 그 사람은 자기 부서원의 승인을 맡게 됩니다.',
    note: '관리자가 한 명뿐이면 본인 기록의 정정을 아무도 승인할 수 없습니다. 부서장이나 두 번째 관리자가 꼭 필요합니다.',
    href: '/admin',
    action: '부서장 지정하기',
  },
  {
    title: '5. 연차 부여 일수를 입력합니다',
    body: '관리자 현황 → 휴가·연차에서 사람마다 그 해에 줄 연차를 넣습니다.',
    note: '0일이면 아무도 휴가를 신청할 수 없습니다. 발생 일수는 취업규칙마다 달라 시스템이 자동으로 계산하지 않습니다.',
    href: '/admin',
    action: '연차 부여하기',
  },
];

const FAQ = [
  {
    q: '출근 버튼이 안 눌려요',
    a: '어제나 오늘 기록 중에 도착을 안 찍은 것이 남아 있으면 새 출근이 시작되지 않습니다. 오류 메시지에 그 날짜가 나옵니다. 무사 도착을 눌러 닫거나, 잘못된 기록이면 정정 요청을 보내세요. 오늘이 휴무일로 설정돼 있어도 눌리지 않습니다.',
  },
  {
    q: '기록 시간이 틀렸어요',
    a: '근무 캘린더에서 그 기록을 열어 정정 요청을 보내세요. 승인되면 기록이 바뀌고 원래 값과 승인한 사람이 이력에 남습니다. 직접 고치거나 지울 수는 없습니다 — 임금 계산의 근거라서 그렇습니다.',
  },
  {
    q: '내 정정 요청을 내가 승인할 수 없나요',
    a: '없습니다. 본인 기록의 정정은 다른 관리자나 부서장이 승인해야 합니다. 자기 출퇴근 시각을 스스로 고칠 수 있으면 기록이 근거가 되지 못합니다.',
  },
  {
    q: "'위치 미인증'이 떴어요",
    a: '사업장 반경 밖에서 도착을 눌렀거나, GPS 정확도가 떨어졌거나, 위치 권한이 꺼져 있는 경우입니다. 기록은 정상으로 남고 미인증 표시만 붙습니다. 사정이 있었다면 정정 요청에 적어 주세요.',
  },
  {
    q: '휴가를 신청했는데 기록이 안 생겨요',
    a: '승인되어야 생깁니다. 승인되면 그 기간의 근무일마다 자동으로 만들어집니다. 주말과 공휴일에는 생기지 않습니다.',
  },
  {
    q: '지난달 기록을 고칠 수 없어요',
    a: '그 달이 마감되었기 때문입니다. 급여 지급 근거를 확정하면 정정이 막힙니다. 꼭 고쳐야 하면 관리자에게 마감 해제를 요청하세요.',
  },
  {
    q: '공휴일을 매년 등록해야 하나요',
    a: '아닙니다. 관리자가 앱을 열면 그해와 다음 해 공휴일을 알아서 채웁니다. 임시공휴일이 중간에 생겨도 주기적으로 다시 확인합니다. 창립기념일처럼 회사만의 휴일은 직접 추가하면 됩니다.',
  },
];

function Bold({ text }: { text: string }) {
  // 본문에 **강조**를 쓰기 위한 최소한의 처리입니다. 굳이 마크다운 라이브러리를 넣을 일은 아닙니다.
  return (
    <>
      {text.split('**').map((part, index) =>
        index % 2 === 1 ? <strong key={index} className="font-bold text-slate-900">{part}</strong> : part
      )}
    </>
  );
}

export default function GuidePage() {
  return (
    <div className="min-h-screen">
      <TopBar title="사용법" subtitle="무엇을 언제 누르면 되는지 역할별로 정리했습니다" />
      <main className="shell-content p-4 md:p-8">
        <div className="mx-auto max-w-4xl space-y-6">

          {/* ── 무엇을 하는 앱인가 ── */}
          <section className="card p-6 md:p-8">
            <div className="flex items-center gap-2 text-blue-600">
              <Sparkles size={18} aria-hidden="true" />
              <span className="text-xs font-bold tracking-widest">시작하기 전에</span>
            </div>
            <h1 className="mt-3 break-keep text-2xl font-black text-slate-950 md:text-3xl">
              출퇴근을 기록하면, 근무시간은 회사 기준으로 자동 계산됩니다
            </h1>
            <p className="mt-3 break-keep text-sm leading-7 text-slate-600">
              버튼을 누른 시각은 <strong className="font-bold text-slate-900">서버 시각으로만</strong> 기록되고, 직원이 직접 고치거나 지울 수 없습니다.
              고쳐야 할 일이 생기면 정정 요청을 보내고, 다른 사람이 승인하면 바뀐 내용과 승인한 사람이 이력에 남습니다.
              소정근로·휴게·연장·야간·휴일근로·지각은 이 기록에서 회사가 정한 기준으로 계산됩니다.
            </p>
            <nav aria-label="역할별 바로가기" className="mt-5 grid gap-2 sm:grid-cols-4">
              {JUMP.map((item) => (
                <a key={item.href} href={item.href}
                  className="flex min-w-0 flex-col rounded-xl bg-slate-100 px-3 py-2.5 hover:bg-slate-200">
                  <span className="truncate text-sm font-black text-slate-900">{item.label}</span>
                  <span className="truncate text-[11px] text-slate-500">{item.hint}</span>
                </a>
              ))}
            </nav>
          </section>

          {/* ── 직원 ── */}
          <section aria-labelledby="everyone-title" className="scroll-mt-4" id="everyone">
            <h2 id="everyone-title" className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
              <Play size={19} aria-hidden="true" className="text-blue-600" />직원 — 매일 쓰는 것
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {DAILY.map(({ icon: Icon, title, body, detail }) => (
                <article key={title} className="card flex min-w-0 flex-col p-5">
                  <div className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                    <Icon size={19} aria-hidden="true" />
                  </div>
                  <h3 className="mt-3 break-keep font-extrabold text-slate-900">{title}</h3>
                  <p className="mt-1.5 break-keep text-sm leading-6 text-slate-600"><Bold text={body} /></p>
                  <p className="mt-2 break-keep border-t border-slate-100 pt-2 text-[12px] leading-5 text-slate-500">{detail}</p>
                </article>
              ))}
            </div>

            <div className="card mt-3 flex items-start gap-3 p-5">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700">
                <ShieldAlert size={19} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h3 className="break-keep font-extrabold text-slate-900">출근 위치 인증</h3>
                <p className="mt-1 break-keep text-sm leading-6 text-slate-600">
                  회사가 사업장 위치를 지정해 두면, 출근 <strong className="font-bold text-slate-900">도착</strong>을 누를 때 반경 안에 있는지 확인합니다.
                  반경 밖이거나 GPS가 부정확하면 <strong className="font-bold text-slate-900">기록은 그대로 남고</strong> &lsquo;위치 미인증&rsquo;으로만 표시됩니다.
                  출근을 막지는 않습니다 — 사정이 있으면 정정 요청에 적어 주세요.
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/" className="inline-flex min-h-11 items-center rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700 hover:bg-slate-200">홈에서 기록하기</Link>
              <Link href="/stats" className="inline-flex min-h-11 items-center rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700 hover:bg-slate-200">내 근무시간 보기</Link>
              <Link href="/settings" className="inline-flex min-h-11 items-center rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700 hover:bg-slate-200">휴가·재택 신청</Link>
            </div>
          </section>

          {/* ── 부서장 ── */}
          <section aria-labelledby="head-title" className="scroll-mt-4" id="head">
            <h2 id="head-title" className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
              <UserCog size={19} aria-hidden="true" className="text-indigo-600" />부서장 — 승인하기
            </h2>
            <p className="mt-2 break-keep text-sm leading-6 text-slate-600">
              관리자가 부서장으로 지정하면 <strong className="font-bold text-slate-900">관리자 현황</strong> 화면이 열립니다.
              보이는 것은 <strong className="font-bold text-slate-900">내 부서원뿐</strong>입니다. 다른 부서는 목록에도 나오지 않습니다.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <article className="card min-w-0 p-5">
                <h3 className="flex items-center gap-1.5 font-extrabold text-emerald-800"><Check size={16} aria-hidden="true" />할 수 있는 것</h3>
                <ul className="mt-2 space-y-1.5">
                  {HEAD_CAN.map((item) => (
                    <li key={item} className="break-keep text-sm leading-6 text-slate-600">· {item}</li>
                  ))}
                </ul>
              </article>
              <article className="card min-w-0 p-5">
                <h3 className="flex items-center gap-1.5 font-extrabold text-slate-700"><ShieldCheck size={16} aria-hidden="true" />할 수 없는 것</h3>
                <ul className="mt-2 space-y-1.5">
                  {HEAD_CANNOT.map((item) => (
                    <li key={item} className="break-keep text-sm leading-6 text-slate-600">· {item}</li>
                  ))}
                </ul>
              </article>
            </div>
            <p className="mt-3 break-keep rounded-xl bg-slate-100 p-4 text-[12px] leading-6 text-slate-600">
              <strong className="font-bold text-slate-900">직급과 부서장은 다릅니다.</strong> &lsquo;부장&rsquo;이라는 직급을 받아도 승인 권한은 생기지 않습니다.
              승인은 부서마다 지정된 부서장만 합니다. 직급은 화면에 늘어놓는 순서일 뿐입니다.
            </p>
            <Link href="/admin" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700 hover:bg-slate-200">관리자 현황 열기</Link>
          </section>

          {/* ── 관리자 ── */}
          <section aria-labelledby="admin-title" className="scroll-mt-4" id="admin">
            <h2 id="admin-title" className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
              <Building2 size={19} aria-hidden="true" className="text-violet-600" />관리자 — 처음 설정 (순서대로)
            </h2>
            <ol className="mt-3 space-y-3">
              {SETUP_STEPS.map((step) => (
                <li key={step.title} className="card min-w-0 p-5">
                  <h3 className="break-keep font-extrabold text-slate-900">{step.title}</h3>
                  <p className="mt-1.5 break-keep text-sm leading-6 text-slate-600">{step.body}</p>
                  <p className="mt-2 flex items-start gap-1.5 break-keep rounded-lg bg-amber-50 p-2.5 text-[12px] leading-5 text-amber-900">
                    <AlertTriangle size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
                    <span>{step.note}</span>
                  </p>
                  <Link href={step.href} className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700 hover:bg-slate-200">
                    {step.action}
                  </Link>
                </li>
              ))}
            </ol>

            <div className="card mt-3 flex items-start gap-3 p-5">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600">
                <CalendarDays size={19} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h3 className="break-keep font-extrabold text-slate-900">매달 하는 일은 하나입니다 — 월 마감</h3>
                <p className="mt-1 break-keep text-sm leading-6 text-slate-600">
                  달이 끝나면 관리자 현황 → 월 마감에서 그달을 확정합니다. 마감하면 그달의 정정이 막히고,
                  <strong className="font-bold text-slate-900"> 그 시점의 집계가 그대로 보관</strong>됩니다. 나중에 값이 달라져도 무엇을 보고 지급했는지 남습니다.
                  해제하려면 사유를 적어야 하고, 마감·해제 이력은 지워지지 않습니다.
                </p>
                <p className="mt-2 break-keep text-[12px] leading-5 text-slate-500">
                  공휴일은 손댈 필요가 없습니다. 관리자가 앱을 열면 그해와 다음 해 것을 알아서 채웁니다.
                </p>
              </div>
            </div>
          </section>

          {/* ── FAQ ── */}
          <section aria-labelledby="faq-title" className="scroll-mt-4" id="faq">
            <h2 id="faq-title" className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
              <AlertTriangle size={19} aria-hidden="true" className="text-amber-600" />이럴 땐?
            </h2>
            <div className="card mt-3 divide-y divide-slate-100">
              {FAQ.map((item) => (
                <details key={item.q} className="group min-w-0 p-5">
                  <summary className="cursor-pointer list-none break-keep font-bold text-slate-900 marker:content-none">
                    <span className="text-blue-600">Q. </span>{item.q}
                  </summary>
                  <p className="mt-2 break-keep text-sm leading-6 text-slate-600">{item.a}</p>
                </details>
              ))}
            </div>
          </section>

          {/* ── 곁들이 ── */}
          <section className="card flex items-start gap-3 p-5 md:p-6">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600">
              <Bot size={19} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="break-keep font-extrabold text-slate-900">그 밖에</h2>
              <p className="mt-1 break-keep text-sm leading-6 text-slate-600">
                <strong className="font-bold text-slate-900">출퇴근 비서</strong>에게 출발 시간이나 최근 기록을 물어볼 수 있고,
                <strong className="font-bold text-slate-900"> 이동</strong> 화면에서 도보·대중교통 경로를 비교할 수 있습니다.
                기록이 쌓이면 캐릭터가 자라고 배지가 열립니다 — 근태와는 상관없는, 매일 누르는 걸 덜 지겹게 하려고 만든 것들입니다.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/assistant" className="inline-flex min-h-11 items-center rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700 hover:bg-slate-200">출퇴근 비서</Link>
                <Link href="/map" className="inline-flex min-h-11 items-center rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700 hover:bg-slate-200">이동 경로</Link>
                <Link href="/badges" className="inline-flex min-h-11 items-center rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700 hover:bg-slate-200">배지</Link>
              </div>
            </div>
          </section>

          <p className="flex items-center justify-center gap-1.5 pb-2 text-[12px] text-slate-500">
            <UserPlus size={13} aria-hidden="true" />
            처음이라면 <Link href="/settings" className="font-bold text-slate-600 underline">설정</Link>에서 집·회사 주소와 근무 요일부터 넣어 주세요.
            <Settings size={13} aria-hidden="true" />
          </p>
        </div>
      </main>
    </div>
  );
}
