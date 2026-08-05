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

function distanceToSegment(p: LatLng, a: LatLng, b: LatLng): number {
  const latRef = toRad((a.lat + b.lat) / 2);
  const P = toLocalXY(p, latRef);
  const A = toLocalXY(a, latRef);
  const B = toLocalXY(b, latRef);

  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const lenSq = dx * dx + dy * dy;

  let t = lenSq === 0 ? 0 : ((P.x - A.x) * dx + (P.y - A.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const ddx = P.x - (A.x + t * dx);
  const ddy = P.y - (A.y + t * dy);

  return EARTH_RADIUS_M * Math.sqrt(ddx * ddx + ddy * ddy);
}

function nearestSegmentIndex(point: LatLng, polyline: LatLng[]): number {
  let bestIndex = 0;
  let bestDist = Infinity;

  for (let i = 0; i < polyline.length - 1; i++) {
    const d = distanceToSegment(point, polyline[i], polyline[i + 1]);
    if (d < bestDist) {
      bestDist = d;
      bestIndex = i;
    }
  }

  return bestIndex;
}

export function distanceToPolyline(point: LatLng, polyline: LatLng[]): number {
  if (polyline.length === 0) return Infinity;
  if (polyline.length === 1) return haversineDistance(point, polyline[0]);

  const i = nearestSegmentIndex(point, polyline);
  return distanceToSegment(point, polyline[i], polyline[i + 1]);
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
