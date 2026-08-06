export interface ProgressPoint { lat: number; lng: number }

export interface LocationSample extends ProgressPoint {
  accuracy: number;
  timestamp: number;
}

export interface AcceptedLocation extends LocationSample {
  speedEma: number | null;
}

export interface ProgressSegment {
  trafficType: number;
  distance: number;
  sectionTime: number;
  points: ProgressPoint[];
  startName?: string | null;
  endName?: string | null;
  label?: string;
  estimatedGeometry?: boolean;
  geometrySource?: string | null;
}

export interface SegmentProgress {
  index: number;
  trafficType: number;
  progress: number;
  remainingDistance: number;
  nextName: string;
  estimated: boolean;
}

export interface DetailedRouteProgress {
  remainingDistance: number;
  remainingMinutes: number;
  distanceFromRoute: number;
  progress: number;
  source: 'route-geometry' | 'endpoint-estimate' | 'direct-fallback';
  currentSegment: SegmentProgress | null;
  nextTransitionDistance: number | null;
  destinationDistance: number;
  speedEma: number | null;
  lowAccuracy: boolean;
  arrivalSuggested: boolean;
}

const EARTH_RADIUS_M = 6_371_000;
export const MAX_GPS_ACCURACY_M = 2_000;
export const MAX_GPS_AGE_MS = 15_000;
export const ARRIVAL_RADIUS_M = 80;

export function distanceMetres(a: ProgressPoint, b: ProgressPoint) {
  const latitude = ((a.lat + b.lat) / 2) * Math.PI / 180;
  const x = (b.lng - a.lng) * Math.PI / 180 * Math.cos(latitude);
  const y = (b.lat - a.lat) * Math.PI / 180;
  return Math.sqrt(x * x + y * y) * EARTH_RADIUS_M;
}

export function acceptLocationSample(sample: LocationSample, previous: AcceptedLocation | null, now = Date.now()): AcceptedLocation | null {
  if (!Number.isFinite(sample.lat) || !Number.isFinite(sample.lng) || !Number.isFinite(sample.accuracy) || !Number.isFinite(sample.timestamp)) return null;
  if (sample.accuracy <= 0 || sample.accuracy > MAX_GPS_ACCURACY_M || now - sample.timestamp > MAX_GPS_AGE_MS || sample.timestamp > now + 1_000) return null;
  if (previous && sample.timestamp <= previous.timestamp) return null;

  let speedEma = previous?.speedEma ?? null;
  if (previous) {
    const seconds = (sample.timestamp - previous.timestamp) / 1_000;
    const travelled = distanceMetres(previous, sample);
    // Ignore movement that fits inside the combined GPS uncertainty.
    const speed = seconds > 0 ? Math.max(0, travelled - Math.max(previous.accuracy, sample.accuracy)) / seconds : 0;
    if (Number.isFinite(speed) && speed <= 45) speedEma = speedEma === null ? speed : speedEma * 0.7 + speed * 0.3;
  }
  return { ...sample, speedEma };
}

function project(point: ProgressPoint, path: ProgressPoint[]) {
  const lengths = path.slice(1).map((item, index) => distanceMetres(path[index], item));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let passed = 0;
  let best = { distance: Number.POSITIVE_INFINITY, along: 0 };
  lengths.forEach((length, index) => {
    const start = path[index];
    const end = path[index + 1];
    const latitude = ((start.lat + end.lat + point.lat) / 3) * Math.PI / 180;
    const scaleX = Math.cos(latitude);
    const vx = (end.lng - start.lng) * scaleX;
    const vy = end.lat - start.lat;
    const wx = (point.lng - start.lng) * scaleX;
    const wy = point.lat - start.lat;
    const denominator = vx * vx + vy * vy;
    const ratio = denominator ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / denominator)) : 0;
    const projected = { lat: start.lat + (end.lat - start.lat) * ratio, lng: start.lng + (end.lng - start.lng) * ratio };
    const distance = distanceMetres(point, projected);
    if (distance < best.distance) best = { distance, along: passed + length * ratio };
    passed += length;
  });
  return { ...best, total };
}

function segmentPath(segment: ProgressSegment) {
  const unavailable = segment.estimatedGeometry || /unavailable|endpoint|estimate|missing|none/i.test(segment.geometrySource || '');
  if (!unavailable && segment.points.length >= 2) return { path: segment.points, estimated: false };
  const start = segment.points[0];
  const end = segment.points.at(-1);
  return { path: start && end && start !== end ? [start, end] : [], estimated: true };
}

export function calculateDetailedRouteProgress(current: AcceptedLocation, segments: ProgressSegment[], totalMinutes: number, destination?: ProgressPoint): DetailedRouteProgress | null {
  const usable = segments.map((segment, index) => ({ segment, index, ...segmentPath(segment) })).filter((item) => item.path.length >= 2);
  const destinationDistance = destination ? distanceMetres(current, destination) : Number.POSITIVE_INFINITY;
  if (!usable.length) {
    if (!destination) return null;
    return { remainingDistance: destinationDistance, remainingMinutes: totalMinutes, distanceFromRoute: 0, progress: 0, source: 'direct-fallback', currentSegment: null, nextTransitionDistance: null, destinationDistance, speedEma: current.speedEma, lowAccuracy: false, arrivalSuggested: destinationDistance <= ARRIVAL_RADIUS_M };
  }

  const measured = usable.map((item) => ({ ...item, projection: project(current, item.path) }));
  const active = measured.reduce((best, item) => item.projection.distance < best.projection.distance ? item : best);
  const totalDistance = measured.reduce((sum, item) => sum + item.projection.total, 0);
  const before = measured.filter((item) => item.index < active.index).reduce((sum, item) => sum + item.projection.total, 0);
  const along = before + active.projection.along;
  const remainingDistance = Math.max(0, totalDistance - along);
  const scheduledMinutes = Math.max(0, totalMinutes * (1 - (totalDistance ? along / totalDistance : 0)));
  const speedMinutes = current.speedEma && current.speedEma >= 0.5 ? remainingDistance / current.speedEma / 60 : null;
  const remainingMinutes = speedMinutes === null ? scheduledMinutes : Math.max(scheduledMinutes * 0.5, Math.min(scheduledMinutes * 2, scheduledMinutes * 0.45 + speedMinutes * 0.55));
  const nextName = active.segment.endName || active.segment.label || (active.index === segments.length - 1 ? '목적지' : '다음 환승 지점');
  const segmentRemaining = Math.max(0, active.projection.total - active.projection.along);
  return {
    remainingDistance,
    remainingMinutes,
    distanceFromRoute: active.projection.distance,
    progress: totalDistance ? Math.min(1, along / totalDistance) : 0,
    source: measured.some((item) => item.estimated) ? 'endpoint-estimate' : 'route-geometry',
    currentSegment: { index: active.index, trafficType: active.segment.trafficType, progress: active.projection.total ? active.projection.along / active.projection.total : 0, remainingDistance: segmentRemaining, nextName, estimated: active.estimated },
    nextTransitionDistance: segmentRemaining,
    destinationDistance,
    speedEma: current.speedEma,
    lowAccuracy: false,
    arrivalSuggested: destinationDistance <= ARRIVAL_RADIUS_M,
  };
}
