import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '출퇴근 배틀', short_name: '출퇴근 배틀',
    description: '매일의 출퇴근을 기록하고 캐릭터와 함께 성장하세요.',
    start_url: '/', scope: '/', display: 'standalone',
    background_color: '#111315', theme_color: '#111315', lang: 'ko-KR',
    icons: [
      { src: '/icons/app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icons/app-icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
