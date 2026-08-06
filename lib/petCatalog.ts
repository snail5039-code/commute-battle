import type { CharacterStage } from './characterStages';
import { useSyncExternalStore } from 'react';

export const PET_IDS = ['cat', 'dog', 'rabbit', 'bird', 'turtle'] as const;
export type PetId = (typeof PET_IDS)[number];

export interface PetDefinition {
  id: PetId; name: string; personality: string; color: string; softColor: string;
  stageNames: Record<CharacterStage, string>;
}

export type AccessoryUnlock =
  | { type: 'level'; level: number }
  | { type: 'badge'; badgeKey: string }
  | { type: 'quest'; questKey: string };

export interface PetAccessory {
  id: string; name: string; emoji: string; description: string; unlock: AccessoryUnlock;
}

export const PET_ACCESSORIES: PetAccessory[] = [
  { id: 'sprout-pin', name: '새싹 핀', emoji: '🌱', description: '첫 진화를 기념하는 머리핀', unlock: { type: 'level', level: 3 } },
  { id: 'commuter-cap', name: '통근 모자', emoji: '🧢', description: '꾸준한 출근자의 모자', unlock: { type: 'level', level: 6 } },
  { id: 'veteran-crown', name: '베테랑 왕관', emoji: '♛', description: '최종 진화의 상징', unlock: { type: 'level', level: 10 } },
  { id: 'first-flag', name: '첫걸음 깃발', emoji: '⚑', description: '첫 출근 배지 보상', unlock: { type: 'badge', badgeKey: 'first_step' } },
  { id: 'streak-scarf', name: '연속 출근 목도리', emoji: '◆', description: '7일 연속 출근 보상', unlock: { type: 'badge', badgeKey: 'streak_7' } },
  { id: 'quest-star', name: '퀘스트 별', emoji: '★', description: '주간 출근 퀘스트 보상', unlock: { type: 'quest', questKey: 'weekly_commutes' } },
  { id: 'early-bell', name: '정시 벨', emoji: '●', description: '일일 정시 출근 퀘스트 보상', unlock: { type: 'quest', questKey: 'daily_on_time' } },
  { id: 'door-key', name: '탈출 열쇠', emoji: '🔑', description: '첫 퇴근 배지 보상', unlock: { type: 'badge', badgeKey: 'first_escape' } },
  { id: 'rain-boots', name: '레인부츠', emoji: '👢', description: '궂은 날 출근 배지 보상', unlock: { type: 'badge', badgeKey: 'weather_runner' } },
  { id: 'monday-medal', name: '월요일 메달', emoji: '🥇', description: '월요병 생존자 배지 보상', unlock: { type: 'badge', badgeKey: 'monday_survivor' } },
  { id: 'friday-shades', name: '불금 선글라스', emoji: '🕶️', description: '히든 배지 보상', unlock: { type: 'badge', badgeKey: 'hidden_friday' } },
  { id: 'speed-sneakers', name: '스피드 스니커즈', emoji: '👟', description: '히든 배지 보상', unlock: { type: 'badge', badgeKey: 'hidden_speed' } },
  { id: 'legend-cape', name: '전설의 망토', emoji: '🦸', description: '30일 연속 출근 전설 배지 보상', unlock: { type: 'badge', badgeKey: 'streak_30' } },
  { id: 'round-trip-medal', name: '왕복 챌린지 메달', emoji: '🏅', description: '주간 왕복 챌린지 퀘스트 보상', unlock: { type: 'quest', questKey: 'weekly_round_trips' } },
];

export function isAccessoryUnlocked(accessory: PetAccessory, level: number, badges: ReadonlySet<string>, quests: ReadonlySet<string>) {
  if (accessory.unlock.type === 'level') return level >= accessory.unlock.level;
  if (accessory.unlock.type === 'badge') return badges.has(accessory.unlock.badgeKey);
  return quests.has(accessory.unlock.questKey);
}

export function getAccessoryById(id: string | null): PetAccessory | undefined {
  return id ? PET_ACCESSORIES.find((item) => item.id === id) : undefined;
}

export const DEFAULT_PET_ID: PetId = 'cat';
export const PET_STORAGE_KEY = 'commute-battle:selected-pet';
export const PET_CHANGED_EVENT = 'commute-battle:pet-changed';

export const PET_CATALOG: Record<PetId, PetDefinition> = {
  cat: { id: 'cat', name: '모닝', personality: '도도하지만 눈치 빠른 고양이', color: '#2563eb', softColor: '#dbeafe', stageNames: { alg: '몽글알', seedling: '새싹냥', warrior: '질주냥', veteran: '대장냥' } },
  dog: { id: 'dog', name: '해리', personality: '언제나 힘을 주는 응원단장', color: '#ea580c', softColor: '#ffedd5', stageNames: { alg: '꼬마멍', seedling: '새싹멍', warrior: '용감멍', veteran: '수호멍' } },
  rabbit: { id: 'rabbit', name: '보름', personality: '민첩하고 계획적인 토끼', color: '#db2777', softColor: '#fce7f3', stageNames: { alg: '콩알토끼', seedling: '새싹토끼', warrior: '번개토끼', veteran: '달빛토끼' } },
  bird: { id: 'bird', name: '파랑', personality: '수다스럽고 긍정적인 길잡이', color: '#0891b2', softColor: '#cffafe', stageNames: { alg: '새알', seedling: '새싹새', warrior: '바람새', veteran: '하늘대장' } },
  turtle: { id: 'turtle', name: '차근', personality: '꾸준하고 든든한 거북이', color: '#059669', softColor: '#d1fae5', stageNames: { alg: '조약돌', seedling: '이끼돌', warrior: '철갑이', veteran: '숲의 현자' } },
};

export function isPetId(value: unknown): value is PetId { return typeof value === 'string' && PET_IDS.includes(value as PetId); }
export function readStoredPetId(): PetId { if (typeof window === 'undefined') return DEFAULT_PET_ID; const value = window.localStorage.getItem(PET_STORAGE_KEY); return isPetId(value) ? value : DEFAULT_PET_ID; }
export function storePetId(petId: PetId): void { if (typeof window === 'undefined') return; window.localStorage.setItem(PET_STORAGE_KEY, petId); window.dispatchEvent(new CustomEvent<PetId>(PET_CHANGED_EVENT, { detail: petId })); }
function subscribeToPet(callback: () => void) { if (typeof window === 'undefined') return () => undefined; window.addEventListener(PET_CHANGED_EVENT, callback); window.addEventListener('storage', callback); return () => { window.removeEventListener(PET_CHANGED_EVENT, callback); window.removeEventListener('storage', callback); }; }
export function useSelectedPetId(): PetId { return useSyncExternalStore(subscribeToPet, readStoredPetId, () => DEFAULT_PET_ID); }

export const ACCESSORY_STORAGE_KEY = 'commute-battle:equipped-accessory';
export const ACCESSORY_CHANGED_EVENT = 'commute-battle:accessory-changed';

export function readStoredAccessoryId(): string | null { if (typeof window === 'undefined') return null; return window.localStorage.getItem(ACCESSORY_STORAGE_KEY); }
export function storeAccessoryId(accessoryId: string | null): void {
  if (typeof window === 'undefined') return;
  if (accessoryId) window.localStorage.setItem(ACCESSORY_STORAGE_KEY, accessoryId);
  else window.localStorage.removeItem(ACCESSORY_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent<string | null>(ACCESSORY_CHANGED_EVENT, { detail: accessoryId }));
}
function subscribeToAccessory(callback: () => void) { if (typeof window === 'undefined') return () => undefined; window.addEventListener(ACCESSORY_CHANGED_EVENT, callback); window.addEventListener('storage', callback); return () => { window.removeEventListener(ACCESSORY_CHANGED_EVENT, callback); window.removeEventListener('storage', callback); }; }
export function useEquippedAccessoryId(): string | null { return useSyncExternalStore(subscribeToAccessory, readStoredAccessoryId, () => null); }
