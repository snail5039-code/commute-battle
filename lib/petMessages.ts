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
  ],
  afternoon: [
    '슬슬 나른해지는 시간이네',
    '조금만 더 힘내자',
    '물 한 잔 마시고 와',
  ],
  evening: [
    '해 질 때가 됐네',
    '오늘도 거의 다 왔어',
    '조금만 더 버티면 끝이야',
  ],
  night: ['늦었다, 얼른 쉬어야지', '오늘 하루도 고생했어', '잘 자, 내일 또 보자'],
};
