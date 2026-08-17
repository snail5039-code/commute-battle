import type { CommuteRecord } from './types';

// 출근 위치 인증(지오펜스)의 클라이언트 쪽입니다. 여기서 하는 일은 좌표와 정확도를 읽어서
// 그대로 서버에 넘기는 것뿐입니다. "반경 안인지"는 서버(attendance_location_check)만 판단합니다.
// 브라우저가 판정하면 응답을 고쳐서 인증을 통과시킬 수 있어 근거로 쓸 수 없습니다.

export type LocationStatus = 'verified' | 'out_of_range' | 'low_accuracy' | 'unavailable' | 'denied' | 'no_policy';

export interface LocationFix {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  denied: boolean;
}

export const NO_LOCATION: LocationFix = { lat: null, lng: null, accuracy: null, denied: false };

export const LOCATION_STATUS_LABEL: Record<LocationStatus, string> = {
  verified: '사업장에서 확인됨',
  out_of_range: '사업장 반경 밖',
  low_accuracy: 'GPS 정확도 부족',
  unavailable: '위치를 확인할 수 없음',
  denied: '위치 권한 거부',
  no_policy: '위치 인증 미사용',
};

const REASON_HINT: Partial<Record<LocationStatus, string>> = {
  out_of_range: '사업장 반경 밖에서 기록되었습니다. 관리자 확인 대상으로 표시됩니다.',
  low_accuracy: 'GPS 정확도가 낮아 위치를 인증하지 못했습니다. 실외에서 다시 시도하면 정확해집니다.',
  unavailable: '위치 신호를 받지 못했습니다. 기록은 남았고 관리자 확인 대상으로 표시됩니다.',
  denied: '위치 권한이 꺼져 있어 인증하지 못했습니다. 기록은 남았고 관리자 확인 대상으로 표시됩니다.',
};

// 위치를 못 잡아도 기록 자체는 막지 않습니다(현장에서 출근을 못 하는 쪽이 더 큰 사고입니다).
// 그래서 이 함수는 절대 throw 하지 않고, 실패를 실패인 채로 서버에 알립니다.
export function captureLocation(timeoutMs = 10_000): Promise<LocationFix> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(NO_LOCATION);

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy * 10) / 10 : null,
        denied: false,
      }),
      (error) => resolve({ ...NO_LOCATION, denied: error.code === error.PERMISSION_DENIED }),
      // maximumAge를 짧게 둡니다. 오래된 캐시 좌표를 쓰면 다른 장소에서 잡힌 위치로 인증될 수 있습니다.
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 10_000 }
    );
  });
}

export function locationParams(fix: LocationFix) {
  return { lat: fix.lat, lng: fix.lng, accuracy_m: fix.accuracy, location_denied: fix.denied };
}

export interface LocationNotice {
  status: LocationStatus;
  label: string;
  hint: string;
  distanceM: number | null;
}

// 인증에 실패한 기록만 사용자에게 알립니다. 성공했거나 검증 대상이 아니면 조용히 넘어갑니다.
export function locationNotice(record: Pick<CommuteRecord, 'location_verified' | 'location_status' | 'location_distance_m'>): LocationNotice | null {
  if (record.location_verified !== false) return null;
  const status = (record.location_status ?? 'unavailable') as LocationStatus;
  return {
    status,
    label: LOCATION_STATUS_LABEL[status] ?? LOCATION_STATUS_LABEL.unavailable,
    hint: REASON_HINT[status] ?? REASON_HINT.unavailable!,
    distanceM: record.location_distance_m ?? null,
  };
}

export function formatDistance(meters: number | null) {
  if (meters === null) return '-';
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`;
}
