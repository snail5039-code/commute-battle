'use client';

import { Bookmark, RotateCcw } from 'lucide-react';
import type { CommuteDirection, FavoriteRoute } from '@/lib/routePreferences';

interface Props {
  direction: CommuteDirection;
  favorites: FavoriteRoute[];
  learningEnabled: boolean;
  onToggleLearning: () => void;
  onResetLearning: () => void;
}

export default function RouteFavoritesPanel({ direction, favorites, learningEnabled, onToggleLearning, onResetLearning }: Props) {
  return <section className="mb-3 rounded-xl border border-neutral-200 bg-white p-3" aria-label="경로 저장 및 자동 추천 설정">
    <div className="flex items-center justify-between gap-2"><p className="flex items-center gap-1.5 text-[11px] font-bold text-neutral-700"><Bookmark size={13} />{direction === 'commute' ? '출근' : '퇴근'} 즐겨찾기 {favorites.length}개</p><button type="button" onClick={onToggleLearning} aria-pressed={learningEnabled} className={`rounded-full px-2 py-1 text-[10px] font-bold ${learningEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-500'}`}>자동 추천 {learningEnabled ? '켜짐' : '꺼짐'}</button></div>
    {favorites.length > 0 && <p className="mt-1 truncate text-[10px] text-neutral-500">최근 저장: {favorites[0].signature}</p>}
    <button type="button" onClick={onResetLearning} className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-neutral-500"><RotateCcw size={11} />선택 학습 기록 초기화</button>
  </section>;
}
