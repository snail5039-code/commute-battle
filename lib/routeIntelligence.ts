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

interface Point { lat: number; lng: number }

export interface RouteProgress {
  remainingDistance: number;
  remainingMinutes: number;
  distanceFromRoute: number;
  progress: number;
  source: 'route-geometry' | 'direct-fallback';
}

function metres(a: Point, b: Point) {
  const latitude = ((a.lat + b.lat) / 2) * Math.PI / 180;
  const x = (b.lng - a.lng) * Math.PI / 180 * Math.cos(latitude);
  const y = (b.lat - a.lat) * Math.PI / 180;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

export function calculateRouteProgress(current: Point, polyline: Point[], totalMinutes: number, fallbackDestination?: Point): RouteProgress | null {
  if (polyline.length < 2) {
    if (!fallbackDestination) return null;
    return { remainingDistance: metres(current, fallbackDestination), remainingMinutes: totalMinutes, distanceFromRoute: 0, progress: 0, source: 'direct-fallback' };
  }
  const lengths = polyline.slice(1).map((point, index) => metres(polyline[index], point));
  const totalDistance = lengths.reduce((sum, length) => sum + length, 0);
  let travelled = 0;
  let best = { distance: Number.POSITIVE_INFINITY, along: 0 };
  lengths.forEach((length, index) => {
    const start = polyline[index];
    const end = polyline[index + 1];
    const latitude = ((start.lat + end.lat + current.lat) / 3) * Math.PI / 180;
    const scaleX = Math.cos(latitude);
    const vx = (end.lng - start.lng) * scaleX;
    const vy = end.lat - start.lat;
    const wx = (current.lng - start.lng) * scaleX;
    const wy = current.lat - start.lat;
    const denominator = vx * vx + vy * vy;
    const t = denominator ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / denominator)) : 0;
    const projected = { lat: start.lat + (end.lat - start.lat) * t, lng: start.lng + (end.lng - start.lng) * t };
    const distance = metres(current, projected);
    if (distance < best.distance) best = { distance, along: travelled + length * t };
    travelled += length;
  });
  const progress = totalDistance ? Math.min(1, best.along / totalDistance) : 0;
  return { remainingDistance: Math.max(0, totalDistance - best.along), remainingMinutes: Math.max(0, totalMinutes * (1 - progress)), distanceFromRoute: best.distance, progress, source: 'route-geometry' };
}

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
    if (missingGeometry) warnings.push({ kind: 'geometry-unavailable', title: '상세 geometry 미제공', detail: `${segment.startName || '승차 지점'}–${segment.endName || '하차 지점'}은 endpoint만 확인할 수 있습니다.`, segmentIndex: index });
    if (segment.trafficType === 3 && index > 0 && index < segments.length - 1 && segment.sectionTime <= 4) warnings.push({ kind: 'tight-transfer', title: '촉박한 환승', detail: `환승 이동 예상 시간이 ${Math.max(1, Math.round(segment.sectionTime))}분입니다.`, segmentIndex: index });
  });
  const uncertainMinutes = segments.filter((segment) => segment.trafficType === 3 || segment.estimatedGeometry || (segment.points?.length || 0) < 3).reduce((sum, segment) => sum + segment.sectionTime, 0);
  const arrivalConfidence = warnings.some((warning) => warning.kind === 'tight-transfer') || uncertainMinutes >= 15 ? 'caution' : 'normal';
  if (arrivalConfidence === 'caution') warnings.push({ kind: 'arrival-risk', title: '예상 도착 시각 주의', detail: `도보·미제공 geometry 구간이 약 ${Math.round(uncertainMinutes)}분 포함되어 실제 도착이 늦어질 수 있습니다.` });
  return { badges, warnings, transferCount, arrivalConfidence };
}
