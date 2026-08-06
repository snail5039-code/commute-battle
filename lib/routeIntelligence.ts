export type RouteBadge = 'fastest' | 'least-walking' | 'fewest-transfers';
export type RouteWarningKind = 'long-walk' | 'tight-transfer' | 'geometry-unavailable' | 'long-segment' | 'arrival-risk';

export interface IntelligenceSegment {
  trafficType: number;
  distance: number;
  sectionTime: number;
  startName?: string | null;
  endName?: string | null;
  routeName?: string | null;
  label?: string;
  points?: unknown[];
  geometrySource?: string | null;
  estimatedGeometry?: boolean;
}

export interface RouteWarning {
  kind: RouteWarningKind;
  title: string;
  detail: string;
  segmentIndex?: number;
}

export interface RouteIntelligence {
  badges: RouteBadge[];
  warnings: RouteWarning[];
  transferCount: number;
  arrivalConfidence: 'normal' | 'caution';
}

export interface CandidateMetric {
  key: string;
  totalTime: number;
  totalWalk: number;
  transferCount: number;
}

export { calculateDetailedRouteProgress } from './routeProgress';
export type { DetailedRouteProgress as RouteProgress } from './routeProgress';

export function selectCandidateKeys(candidates: CandidateMetric[], limit = 3) {
  const unique = [...new Map(candidates.map((candidate) => [candidate.key, candidate])).values()];
  const picks: Array<{ key: string; badges: RouteBadge[] }> = [];
  const add = (candidate: CandidateMetric | undefined, badge: RouteBadge) => {
    if (!candidate) return;
    const existing = picks.find((pick) => pick.key === candidate.key);
    if (existing) existing.badges.push(badge);
    else picks.push({ key: candidate.key, badges: [badge] });
  };
  add([...unique].sort((a, b) => a.totalTime - b.totalTime)[0], 'fastest');
  add([...unique].sort((a, b) => a.totalWalk - b.totalWalk || a.totalTime - b.totalTime)[0], 'least-walking');
  add([...unique].sort((a, b) => a.transferCount - b.transferCount || a.totalTime - b.totalTime)[0], 'fewest-transfers');
  return picks.slice(0, limit);
}

export function analyzeRoute(segments: IntelligenceSegment[], badges: RouteBadge[]): RouteIntelligence {
  const warnings: RouteWarning[] = [];
  const transit = segments.filter((segment) => segment.trafficType !== 3);
  const transferCount = Math.max(0, transit.length - 1);
  segments.forEach((segment, index) => {
    if (segment.trafficType === 3 && segment.distance >= 800) warnings.push({ kind: 'long-walk', title: '긴 도보', detail: `도보 ${Math.round(segment.distance)}m · 약 ${Math.round(segment.sectionTime)}분`, segmentIndex: index });
    if (segment.trafficType !== 3 && segment.distance >= 20_000) warnings.push({ kind: 'long-segment', title: '장거리 구간', detail: `${segment.label || segment.routeName || '대중교통'} ${Math.round(segment.distance / 1000)}km · 약 ${Math.round(segment.sectionTime)}분`, segmentIndex: index });
    const missingGeometry = segment.trafficType !== 3 && ((segment.points?.length || 0) < 3 || segment.estimatedGeometry || /unavailable|endpoint|estimate/i.test(segment.geometrySource || ''));
    if (missingGeometry) warnings.push({ kind: 'geometry-unavailable', title: '상세 이동선 확인 불가', detail: `${segment.startName || '승차 지점'}–${segment.endName || '하차 지점'}은 확인된 두 지점을 점선으로 표시합니다.`, segmentIndex: index });
    if (segment.trafficType === 3 && index > 0 && index < segments.length - 1 && segment.sectionTime <= 4) warnings.push({ kind: 'tight-transfer', title: '촉박한 환승', detail: `환승 이동 예상 시간이 ${Math.max(1, Math.round(segment.sectionTime))}분입니다.`, segmentIndex: index });
  });
  const uncertainMinutes = segments.filter((segment) => segment.trafficType === 3 || segment.estimatedGeometry || (segment.points?.length || 0) < 3).reduce((sum, segment) => sum + segment.sectionTime, 0);
  const arrivalConfidence = warnings.some((warning) => warning.kind === 'tight-transfer') || uncertainMinutes >= 15 ? 'caution' : 'normal';
  if (arrivalConfidence === 'caution') warnings.push({ kind: 'arrival-risk', title: '예상 도착 시각 주의', detail: `상세 이동선을 확인할 수 없는 구간이 약 ${Math.round(uncertainMinutes)}분 포함되어 실제 도착이 늦어질 수 있습니다.` });
  const uniqueWarnings = [...new Map(warnings.map((warning) => [`${warning.kind}:${warning.segmentIndex ?? 'route'}`, warning])).values()];
  return { badges, warnings: uniqueWarnings, transferCount, arrivalConfidence };
}
