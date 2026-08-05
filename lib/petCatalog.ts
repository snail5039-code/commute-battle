import type { CharacterStage } from './characterStages';
import { useSyncExternalStore } from 'react';

export const PET_IDS = ['cat', 'dog', 'rabbit', 'bird', 'turtle'] as const;
export type PetId = (typeof PET_IDS)[number];

export interface PetDefinition {
  id: PetId;
  name: string;
  personality: string;
  color: string;
  softColor: string;
  stageNames: Record<CharacterStage, string>;
}

export const DEFAULT_PET_ID: PetId = 'cat';
export const PET_STORAGE_KEY = 'commute-battle:selected-pet';
export const PET_CHANGED_EVENT = 'commute-battle:pet-changed';

export const PET_CATALOG: Record<PetId, PetDefinition> = {
  cat: {
    id: 'cat', name: '모닝', personality: '느긋하지만 눈치 빠른 고양이', color: '#2563eb', softColor: '#dbeafe',
    stageNames: { alg: '몽글냥', seedling: '새싹냥', warrior: '질주냥', veteran: '대장냥' },
  },
  dog: {
    id: 'dog', name: '두리', personality: '언제나 신나는 응원단장', color: '#ea580c', softColor: '#ffedd5',
    stageNames: { alg: '꼬마멍', seedling: '산책멍', warrior: '용감멍', veteran: '수호멍' },
  },
  rabbit: {
    id: 'rabbit', name: '보름', personality: '민첩하고 계획적인 토끼', color: '#db2777', softColor: '#fce7f3',
    stageNames: { alg: '콩알토끼', seedling: '새싹토끼', warrior: '번개토끼', veteran: '달빛토끼' },
  },
  bird: {
    id: 'bird', name: '파랑', personality: '수다스럽고 긍정적인 길잡이', color: '#0891b2', softColor: '#cffafe',
    stageNames: { alg: '솜털새', seedling: '새싹새', warrior: '바람새', veteran: '하늘대장' },
  },
  turtle: {
    id: 'turtle', name: '차근', personality: '꾸준하고 든든한 거북이', color: '#059669', softColor: '#d1fae5',
    stageNames: { alg: '조약돌', seedling: '이끼등', warrior: '튼튼등', veteran: '숲의 현자' },
  },
};

export function isPetId(value: unknown): value is PetId {
  return typeof value === 'string' && PET_IDS.includes(value as PetId);
}

export function readStoredPetId(): PetId {
  if (typeof window === 'undefined') return DEFAULT_PET_ID;
  const value = window.localStorage.getItem(PET_STORAGE_KEY);
  return isPetId(value) ? value : DEFAULT_PET_ID;
}

export function storePetId(petId: PetId): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PET_STORAGE_KEY, petId);
  window.dispatchEvent(new CustomEvent<PetId>(PET_CHANGED_EVENT, { detail: petId }));
}

function subscribeToPet(callback: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(PET_CHANGED_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(PET_CHANGED_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

export function useSelectedPetId(): PetId {
  return useSyncExternalStore(subscribeToPet, readStoredPetId, () => DEFAULT_PET_ID);
}
