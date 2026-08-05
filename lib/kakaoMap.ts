const KAKAO_MAP_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY!;

let loadPromise: Promise<typeof window.kakao> | null = null;

export function loadKakaoMapSdk(): Promise<typeof window.kakao> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Kakao Map SDK는 브라우저에서만 로드할 수 있습니다'));
  }

  if (window.kakao?.maps) {
    return Promise.resolve(window.kakao);
  }

  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('kakao-map-sdk') as HTMLScriptElement | null;

    const onLoad = () => {
      window.kakao.maps.load(() => resolve(window.kakao));
    };

    if (existing) {
      existing.addEventListener('load', onLoad, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = 'kakao-map-sdk';
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_KEY}&libraries=services&autoload=false`;
    script.async = true;
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', () => reject(new Error('Kakao Map SDK 로드 실패')), { once: true });
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function geocodeAddress(
  kakao: typeof window.kakao,
  address: string
): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    const geocoder = new kakao.maps.services.Geocoder();
    geocoder.addressSearch(address, (result, status) => {
      if (status === kakao.maps.services.Status.OK && result[0]) {
        resolve({ lat: Number(result[0].y), lng: Number(result[0].x) });
      } else {
        resolve(null);
      }
    });
  });
}
