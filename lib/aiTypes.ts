import type { PetTriggerKey } from './petTriggers';
import type { RouteGuideResponse } from './types';
import type { TimeSegment } from './petMessages';

export interface RouteCommentSegment {
  trafficType: number;
  label: string;
  distance: number;
  sectionTime: number;
  startName?: string | null;
  endName?: string | null;
  laneName?: string | null;
  congestion?: string | number | null;
  transfer?: boolean;
}

export interface RouteCommentInput {
  segments: RouteCommentSegment[];
  totalTime: number;
  totalDistance: number;
  totalWalk: number;
  departureTime: Date;
}

export interface RouteComment {
  summary: string;
  caution: string;
  actions: string[];
  source: 'ai' | 'route';
}

export interface RouteGuideInput {
  home_address: string;
  work_address: string;
  commute_type: 'commute' | 'return';
  weather: { precipitation_mm_h: number; probability: number; condition: string };
  recent_avg_departure_time?: string;
  recent_avg_arrival_time?: string;
}

export type RouteGuideAiInput = Omit<RouteGuideInput, 'home_address' | 'work_address'>;

export type CharacterMessageInput = (
  | { mode: 'trigger'; trigger: PetTriggerKey; characterStage: string }
  | { mode: 'idle'; segment: TimeSegment; characterStage: string }
  | { mode: 'coach'; characterStage: string; summary: {
    todayCommuteDone: boolean;
    todayReturnDone: boolean;
    recentCommutes: number;
    onTimeCount: number;
    lateCount: number;
    averageMinutes: number | null;
    currentHour: number;
    hints: string[];
  } }
  | { mode: 'play' | 'poke'; characterStage: string }) & { variant?: number };

export interface StatsCommentInput {
  stats: {
    commuteArrivals: number;
    evaluatedCommutes: number;
    workStartMinutes: number;
    lateCount: number;
    lateRate: number | null;
    avgLateMinutes: number | null;
    avgCommuteDuration: number | null;
    excludedRecords: number;
  };
  monthLabel: string;
}

export interface AssistantHistoryTurn {
  question: string;
  answer: string;
}

export interface AssistantInput {
  question: string;
  context: { averageMinutes: number | null; variabilityMinutes: number | null; lateRate: number | null; weather?: string; routeMinutes?: number | null };
  history?: AssistantHistoryTurn[];
}
export type AiEvidenceKind = 'realtime' | 'record' | 'estimate';
export interface AiEvidence { label: string; kind: AiEvidenceKind; checkedAt?: string; values?: string[]; fallback?: boolean; source?: string }
export interface AssistantAnswer { text: string; details: string[]; conclusion?: string; evidence?: AiEvidence[]; sources?: string[]; cautions?: string[]; generatedAt?: string; fallback?: boolean }

export type AiRequest =
  | { kind: 'route-comment'; input: Omit<RouteCommentInput, 'departureTime'> & { departureTime: string } }
  | { kind: 'route-guide'; input: RouteGuideAiInput }
  | { kind: 'character-message'; input: CharacterMessageInput }
  | { kind: 'stats-comment'; input: StatsCommentInput }
  | { kind: 'assistant'; input: AssistantInput };

export type AiResultMap = {
  'route-comment': RouteComment;
  'route-guide': RouteGuideResponse;
  'character-message': string;
  'stats-comment': string[];
  'assistant': AssistantAnswer;
};

export interface Enhancement<T> {
  fallback: T;
  enhancement: Promise<T>;
}
