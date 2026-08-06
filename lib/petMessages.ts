export type TimeSegment = 'morning' | 'afternoon' | 'evening' | 'night';

export function getTimeSegment(now: Date): TimeSegment {
  const h = now.getHours();
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'afternoon';
  if (h >= 17 && h < 23) return 'evening';
  return 'night';
}

export const TIME_SEGMENT_LABELS: Record<TimeSegment, string> = {
  morning: '아침',
  afternoon: '낮',
  evening: '저녁',
  night: '밤',
};

export const IDLE_CHAT_FALLBACK: Record<TimeSegment, string[]> = {
  morning: [
    '좋은 아침이야, 오늘도 잘해보자',
    '커피 한 잔 하고 시작할까?',
    '오늘 컨디션 어때?',
    '출발 전에 날씨랑 경로를 한 번 확인하자.',
    '오늘 기록도 내가 옆에서 챙겨볼게.',
  ],
  afternoon: [
    '슬슬 나른해지는 시간이네',
    '조금만 더 힘내자',
    '물 한 잔 마시고 와',
    '오전 기록은 잘 남겼는지 확인해볼까?',
    '오래 앉아 있었다면 잠깐 몸을 풀어줘.',
  ],
  evening: [
    '해 질 때가 됐네',
    '오늘도 거의 다 왔어',
    '조금만 더 버티면 끝이야',
    '퇴근 기록까지 남기면 오늘 하루 완성!',
    '퇴근 경로를 미리 보면 마음이 조금 편해져.',
  ],
  night: ['늦었다, 얼른 쉬어야지', '오늘 하루도 고생했어', '잘 자, 내일 또 보자', '오늘 기록은 여기까지, 이제 푹 쉬자.', '내일은 오늘보다 조금 더 여유롭게 출발해보자.'],
};

import type { CommuteRecord } from './types';

const LAST_LINE_KEY = 'commute-battle:pet:last-line';

export const PET_SMALL_TALK_LINES = [
  '나 오늘도 출근 감시 중이야.',
  '주머니에 넣고 다니면 안 돼?',
  '늦으면 내가 먼저 삐질 거야.',
  '오늘은 왠지 정시 느낌인데?',
  '출근 버튼 누르는 손, 아주 소중해.',
  '퇴근 버튼은 행복 버튼이야.',
  '나도 커피 냄새 맡고 싶다.',
  '길 막히면 내가 같이 화내줄게.',
  '기록 쌓이는 거 보면 기분 좋아.',
  '오늘도 무사 도착이 제일 중요해.',
  '잠깐 스트레칭하고 가자.',
  '나 심심해. 한 번 눌러줘.',
  '퇴근 생각만 해도 꼬리가 흔들려.',
  '출근길 BGM 골랐어?',
  '오늘 신발 편한 거 신었지?',
  '비 오면 우산 챙겨. 잔소리 맞아.',
  '정시 도착하면 내가 박수 칠게.',
  '기록 안 하면 내가 서운해.',
  '오늘도 내가 옆에서 따라갈게.',
  '집에 가는 길은 언제나 옳아.',
];

export function pickPetLine(lines: string[]) {
  if (lines.length === 0) return '오늘도 내가 옆에서 지켜볼게.';
  const previous = typeof window === 'undefined' ? '' : sessionStorage.getItem(LAST_LINE_KEY) || '';
  const candidates = lines.filter((line) => line !== previous);
  const selected = (candidates.length ? candidates : lines)[Math.floor(Math.random() * (candidates.length || lines.length))];
  if (typeof window !== 'undefined') sessionStorage.setItem(LAST_LINE_KEY, selected);
  return selected;
}

export function recordCoachLines(records: CommuteRecord[], now: Date): string[] {
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const commute = records.find((record) => record.date === localDate && record.type === 'commute');
  const returned = records.find((record) => record.date === localDate && record.type === 'return');
  const recentCommutes = records.filter((record) => record.type === 'commute' && record.end_time).slice(0, 10);
  const onTime = recentCommutes.filter((record) => record.is_on_time).length;
  const durations = recentCommutes.map((record) => record.duration_minutes).filter((value): value is number => typeof value === 'number' && value > 0 && value < 1440);
  const average = durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null;
  const lines: string[] = [];
  if (!commute && now.getHours() >= 7 && now.getHours() < 12) lines.push('아직 오늘 출근 기록이 없네. 출발할 때 꼭 눌러줘!', '출근 준비 끝났어? 늦기 전에 경로부터 확인하자.');
  if (commute?.end_time && commute.is_on_time) lines.push('오늘 정시 도착, 아주 잘했어!', '제시간에 도착했네. 이런 흐름 정말 좋아!');
  if (commute?.end_time && !commute.is_on_time) lines.push('오늘은 조금 늦었지만 기록한 건 잘했어. 내일은 10분만 일찍!', '지각 기록도 다음 출발 시간을 고치는 힌트야. 기죽지 마!');
  if (commute?.end_time && !returned && now.getHours() >= 17) lines.push('퇴근 기록을 잊지 마! 오늘 하루를 완성하자.', '이제 퇴근할 시간이 가까워. 경로를 먼저 확인해보자.');
  if (returned?.end_time) lines.push('출퇴근 기록을 모두 채웠네. 오늘도 수고했어!', '무사 귀가까지 완료! 오늘 기록은 완벽해.');
  if (recentCommutes.length >= 3) lines.push(`최근 출근 ${recentCommutes.length}번 중 정시 ${onTime}번이야. ${onTime >= Math.ceil(recentCommutes.length * 0.7) ? '꾸준함이 멋져!' : '내일은 조금만 더 여유롭게 출발하자.'}`);
  if (average !== null) lines.push(`최근 평균 이동시간은 ${average}분이야. 출발 계획에 써먹자!`);
  return lines;
}
