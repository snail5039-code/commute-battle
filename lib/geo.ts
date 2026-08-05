export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6371000;

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function haversineDistance(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function toLocalXY(point: LatLng, latRef: number) {
  return {
    x: toRad(point.lng) * Math.cos(latRef),
    y: toRad(point.lat),
  };
}

function projectOntoSegment(p: LatLng, a: LatLng, b: LatLng) {
  const latRef = toRad((a.lat + b.lat) / 2);
  const P = toLocalXY(p, latRef);
  const A = toLocalXY(a, latRef);
  const B = toLocalXY(b, latRef);

  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const lenSq = dx * dx + dy * dy;

  let t = lenSq === 0 ? 0 : ((P.x - A.x) * dx + (P.y - A.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = A.x + t * dx;
  const projY = A.y + t * dy;
  const ddx = P.x - projX;
  const ddy = P.y - projY;

  return { t, dist: EARTH_RADIUS_M * Math.sqrt(ddx * ddx + ddy * ddy) };
}

function nearestSegmentIndex(point: LatLng, polyline: LatLng[]): number {
  let bestIndex = 0;
  let bestDist = Infinity;

  for (let i = 0; i < polyline.length - 1; i++) {
    const { dist } = projectOntoSegment(point, polyline[i], polyline[i + 1]);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }

  return bestIndex;
}

export function distanceToPolyline(point: LatLng, polyline: LatLng[]): number {
  if (polyline.length === 0) return Infinity;
  if (polyline.length === 1) return haversineDistance(point, polyline[0]);

  const i = nearestSegmentIndex(point, polyline);
  return projectOntoSegment(point, polyline[i], polyline[i + 1]).dist;
}

export function remainingDistanceAlongPolyline(
  point: LatLng,
  polyline: LatLng[]
): number {
  if (polyline.length < 2) return 0;

  const i = nearestSegmentIndex(point, polyline);

  let remaining = haversineDistance(point, polyline[i + 1]);
  for (let j = i + 1; j < polyline.length - 1; j++) {
    remaining += haversineDistance(polyline[j], polyline[j + 1]);
  }
  return remaining;
}

// polyline 시작점부터 distance(m)만큼 이동한 지점의 좌표
export function pointAtDistance(polyline: LatLng[], distance: number): LatLng {
  if (polyline.length === 0) return { lat: 0, lng: 0 };
  if (polyline.length === 1) return polyline[0];

  let remaining = Math.max(0, distance);
  for (let i = 0; i < polyline.length - 1; i++) {
    const segLen = haversineDistance(polyline[i], polyline[i + 1]);
    if (remaining <= segLen || i === polyline.length - 2) {
      const t = segLen === 0 ? 0 : Math.max(0, Math.min(1, remaining / segLen));
      return {
        lat: polyline[i].lat + (polyline[i + 1].lat - polyline[i].lat) * t,
        lng: polyline[i].lng + (polyline[i + 1].lng - polyline[i].lng) * t,
      };
    }
    remaining -= segLen;
  }
  return polyline[polyline.length - 1];
}

// point에서 polyline 위로 투영했을 때 가장 가까운 지점 + 그 지점의 시작점 기준 누적거리(m)
export function nearestPointOnPolyline(
  point: LatLng,
  polyline: LatLng[]
): { point: LatLng; distanceFromStart: number } {
  if (polyline.length === 0) return { point, distanceFromStart: 0 };
  if (polyline.length === 1) return { point: polyline[0], distanceFromStart: 0 };

  let bestIndex = 0;
  let bestT = 0;
  let bestDist = Infinity;

  for (let i = 0; i < polyline.length - 1; i++) {
    const { t, dist } = projectOntoSegment(point, polyline[i], polyline[i + 1]);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
      bestT = t;
    }
  }

  let distanceFromStart = 0;
  for (let j = 0; j < bestIndex; j++) {
    distanceFromStart += haversineDistance(polyline[j], polyline[j + 1]);
  }
  const segLen = haversineDistance(polyline[bestIndex], polyline[bestIndex + 1]);
  distanceFromStart += segLen * bestT;

  return {
    point: {
      lat: polyline[bestIndex].lat + (polyline[bestIndex + 1].lat - polyline[bestIndex].lat) * bestT,
      lng: polyline[bestIndex].lng + (polyline[bestIndex + 1].lng - polyline[bestIndex].lng) * bestT,
    },
    distanceFromStart,
  };
}
