// KST 등 UTC+지역에서는 toISOString()이 자정~09시 사이 날짜를 하루 전으로 잘못 반환하므로,
// 로컬(브라우저) 시간대 기준 날짜 문자열은 항상 이 함수로 계산한다.
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
