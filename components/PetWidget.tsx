'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Pause, Play, Heart } from 'lucide-react';
import { useAppData } from '@/lib/useAppData';
import {
  generatePetMessage,
  generateIdleChat,
  generateCoachMessage,
  generatePlayMessage,
  generatePokeMessage,
} from '@/lib/gemini';
import {
  detectPetTrigger,
  isPetQuiet,
  markSpokenToday,
} from '@/lib/petTriggers';
import { getTimeSegment, PET_SMALL_TALK_LINES, pickPetLine, recordCoachLines } from '@/lib/petMessages';
import { loadLocalSettings } from '@/lib/store';
import { STAGE_NAMES, STAGE_RING_CLASS } from '@/lib/characterStages';
import { showOsNotification } from '@/lib/notifications';
import { getBadgeSummary } from '@/lib/badges';
import { readQuestLedger } from '@/lib/quests';
import CharacterIcon from './CharacterIcon';
import {
  getAccessoryById,
  isAccessoryUnlocked,
  PET_CATALOG,
  useEquippedAccessoryId,
  useSelectedPetId,
} from '@/lib/petCatalog';

const CHECK_INTERVAL_MS = 25 * 1000;
const WANDER_INTERVAL_MS = 9 * 1000;
const PET_SIZE = 48;
const DRAG_THRESHOLD = 4;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function randomPosition() {
  const marginX = 90;
  const marginTopY = 80;
  const marginBottomY = 130;
  const maxX = Math.max(marginX, window.innerWidth - marginX - PET_SIZE);
  const maxY = Math.max(
    marginTopY,
    window.innerHeight - marginBottomY - PET_SIZE
  );
  return {
    x: marginX + Math.random() * (maxX - marginX),
    y: marginTopY + Math.random() * (maxY - marginTopY),
  };
}

export default function PetWidget() {
  const { user, records } = useAppData();
  const [message, setMessage] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [wandering, setWandering] = useState(true);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [happy, setHappy] = useState(false);
  const [poked, setPoked] = useState(false);
  const [showHeart, setShowHeart] = useState(false);
  const petId = useSelectedPetId();
  const equippedAccessoryId = useEquippedAccessoryId();

  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStage = useRef<string | null>(null);
  const lastIdleChatAt = useRef(0);
  const lastCoachAt = useRef(0);
  const busy = useRef(false);
  const reactingRef = useRef(false);

  // 렌더 타이밍과 무관하게 "말하는 중 / 생각하는 중 / 드래그 중"을 항상 즉시 반영하는 ref들.
  // (렌더에서 동기화하면 setInterval 콜백이 한 틱 묵은 값을 읽는 레이스가 생겨서,
  //  상태를 바꾸는 지점에서 직접 ref도 같이 갱신한다.)
  const messageRef = useRef<string | null>(null);
  const thinkingRef = useRef(false);
  const draggingRef = useRef(false);
  const wanderingRef = useRef(true);

  const setMessageBoth = (v: string | null) => {
    messageRef.current = v;
    setMessage(v);
  };
  const setThinkingBoth = (v: boolean) => {
    thinkingRef.current = v;
    setThinking(v);
  };
  const setDraggingBoth = (v: boolean) => {
    draggingRef.current = v;
    setDragging(v);
  };

  const dragStart = useRef<{
    x: number;
    y: number;
    posX: number;
    posY: number;
  } | null>(null);
  const movedRef = useRef(false);

  const speak = useCallback((text: string, notify = false) => {
    setMessageBoth(text);
    setThinkingBoth(false);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => setMessageBoth(null), 12000);
    if (notify) showOsNotification('출퇴근전쟁봇', text);
  }, []);

  // 떠다니기: 한 번만 설정되는 안정적인 인터벌. 매 tick마다 최신 ref 값을 확인
  useEffect(() => {
    const positionTimer = setTimeout(() => {
      setPos((p) => p ?? randomPosition());
    }, 0);

    const interval = setInterval(() => {
      if (
        draggingRef.current ||
        messageRef.current ||
        thinkingRef.current ||
        !wanderingRef.current
      )
        return;
      setPos(randomPosition());
    }, WANDER_INTERVAL_MS);

    const onResize = () => setPos((p) => p ?? randomPosition());
    window.addEventListener('resize', onResize);

    return () => {
      clearTimeout(positionTimer);
      clearInterval(interval);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // 컨텍스트 메뉴 바깥 클릭 시 닫기
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menu]);

  // 진화 감지: 캐릭터 단계가 바뀌면 항상 같은 새 모습으로 축하 멘트
  useEffect(() => {
    if (!user) return;

    if (prevStage.current && prevStage.current !== user.character_stage) {
      speak(`진화했다! 이제 나는 ${STAGE_NAMES[user.character_stage]}야!`, true);
    }
    prevStage.current = user.character_stage;
  }, [user, speak]);

  // 출퇴근 상태 체크(칭찬/단계별 잔소리) + 랜덤 잡담
  const check = useCallback(async () => {
    if (!user || isPetQuiet() || busy.current) return;

    const now = new Date();
    const frequency = loadLocalSettings(user.id).petMessageFrequency;
    if (frequency === 'quiet') return;
    const trigger = detectPetTrigger(records, now);

    if (trigger) {
      busy.current = true;
      markSpokenToday(trigger, now);
      const text = await generatePetMessage(trigger, user.character_stage);
      speak(text, true);
      busy.current = false;
      return;
    }

    const cooldown = frequency === 'frequent' ? 30_000 : 90_000;
    const chance = frequency === 'frequent' ? 1 : 0.62;
    const smallTalkCooldown = frequency === 'frequent' ? 45_000 : 140_000;
    const coachLines = recordCoachLines(records, now);
    if (!messageRef.current && coachLines.length && Date.now() - lastCoachAt.current > cooldown && Math.random() < chance) {
      busy.current = true;
      lastCoachAt.current = Date.now();
      const text = await generateCoachMessage(records, now, user.character_stage, coachLines);
      speak(text);
      busy.current = false;
      return;
    }

    const sinceLastIdle = Date.now() - lastIdleChatAt.current;
    if (!messageRef.current && sinceLastIdle > smallTalkCooldown && Math.random() < (frequency === 'frequent' ? 0.75 : 0.35)) {
      lastIdleChatAt.current = Date.now();
      speak(pickPetLine(PET_SMALL_TALK_LINES));
      return;
    }

    if (
      !messageRef.current &&
      sinceLastIdle > cooldown &&
      Math.random() < chance
    ) {
      busy.current = true;
      lastIdleChatAt.current = Date.now();
      const text = await generateIdleChat(
        getTimeSegment(now),
        user.character_stage
      );
      speak(text);
      busy.current = false;
    }
  }, [user, records, speak]);

  useEffect(() => {
    const initialCheck = setTimeout(check, 0);
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      clearTimeout(initialCheck);
      clearInterval(interval);
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [check]);

  const lastPokeAt = useRef(0);

  const handlePoke = async () => {
    const now = Date.now();
    if (now - lastPokeAt.current < 500) return; // 중복 트리거 방지 (pointer+click 동시 발생 대응)
    lastPokeAt.current = now;

    if (!user || reactingRef.current) return;
    reactingRef.current = true;

    setPoked(true);
    setTimeout(() => setPoked(false), 400);
    setThinkingBoth(true);
    setMessageBoth(null);

    const text = await generatePokeMessage(user.character_stage);
    speak(text);
    reactingRef.current = false;
  };

  const handlePlay = async () => {
    setMenu(null);
    if (!user || reactingRef.current) return;
    reactingRef.current = true;

    setHappy(true);
    setShowHeart(true);
    setThinkingBoth(true);
    setMessageBoth(null);
    setTimeout(() => setHappy(false), 700);
    setTimeout(() => setShowHeart(false), 1000);

    const text = await generatePlayMessage(user.character_stage);
    speak(text);
    reactingRef.current = false;
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const menuWidth = 140;
    const menuHeight = 90;
    setMenu({
      x: Math.min(e.clientX, window.innerWidth - menuWidth),
      y: Math.min(e.clientY, window.innerHeight - menuHeight),
    });
  };

  // 드래그: 왼쪽 버튼만 처리 (우클릭은 컨텍스트 메뉴 전용, 클릭 반응과 겹치면 안 됨)
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!pos || e.button !== 0) return;
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // 일부 환경에서 pointerId가 유효하지 않을 수 있음 — 무시하고 계속
    }
    dragStart.current = { x: e.clientX, y: e.clientY, posX: pos.x, posY: pos.y };
    movedRef.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;

    if (!movedRef.current && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      movedRef.current = true;
      setDraggingBoth(true);
    }

    if (movedRef.current) {
      setPos({
        x: clamp(dragStart.current.posX + dx, 10, window.innerWidth - PET_SIZE - 10),
        y: clamp(dragStart.current.posY + dy, 10, window.innerHeight - PET_SIZE - 10),
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (!dragStart.current) return; // 왼쪽 버튼 pointerdown이 없었으면(우클릭 등) 아무것도 안 함

    const wasDragging = movedRef.current;
    dragStart.current = null;
    setDraggingBoth(false);

    if (!wasDragging) {
      handlePoke();
    }
  };

  if (!user || !pos) return null;

  const pet = PET_CATALOG[petId];
  const equippedAccessory = getAccessoryById(equippedAccessoryId);
  const completedBadges = new Set(getBadgeSummary(records).progress.filter((item) => item.completed).map((item) => item.badge.key));
  const completedQuests = new Set(readQuestLedger().claimKeys.map((key) => key.split(':')[0]));
  const accessoryEmoji = equippedAccessory && isAccessoryUnlocked(equippedAccessory, user.character_level, completedBadges, completedQuests) ? equippedAccessory.emoji : undefined;

  return (
    <>
      <div
        className="fixed z-50 pointer-events-none"
        style={{
          left: pos.x,
          top: pos.y,
          width: PET_SIZE,
          height: PET_SIZE,
          transition: dragging
            ? 'none'
            : 'left 3.5s ease-in-out, top 3.5s ease-in-out',
        }}
      >
        {/* 이 relative 박스는 항상 PET_SIZE x PET_SIZE 고정 — 말풍선은 absolute라
            이 박스의 크기에 영향을 주지 않는다. 그래야 말풍선이 뜨거나 사라져도
            버튼(=이동 기준점)의 화면 좌표가 옆으로 밀리지 않는다. */}
        <div className="relative w-full h-full">
          {message ? (
            <div className="pet-bubble pointer-events-auto absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[200px] card p-3 flex items-start gap-2">
              <p className="flex-1 text-[12px] leading-snug text-[var(--foreground)]">
                {message}
              </p>
              <button
                type="button"
                aria-label="펫 말풍선 닫기"
                onClick={() => setMessageBoth(null)}
                className="shrink-0 text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <X size={13} />
              </button>
            </div>
          ) : thinking ? (
            <div className="pet-bubble pointer-events-auto absolute bottom-full left-1/2 -translate-x-1/2 mb-2 card p-2.5 flex items-center gap-1">
              <span className="pet-dot w-1.5 h-1.5 rounded-full bg-neutral-300" style={{ animationDelay: '0ms' }} />
              <span className="pet-dot w-1.5 h-1.5 rounded-full bg-neutral-300" style={{ animationDelay: '150ms' }} />
              <span className="pet-dot w-1.5 h-1.5 rounded-full bg-neutral-300" style={{ animationDelay: '300ms' }} />
            </div>
          ) : null}

          {showHeart && (
            <Heart
              size={16}
              className="heart-pop absolute -top-4 left-1/2 -translate-x-1/2 text-pink-500 fill-pink-500 pointer-events-none"
            />
          )}

          <button
            type="button"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onClick={(e) => {
              if (e.button === 0 && !movedRef.current) handlePoke();
            }}
            onContextMenu={handleContextMenu}
            className={`absolute inset-0 pointer-events-auto w-12 h-12 rounded-full shadow-lg flex items-center justify-center cursor-grab active:cursor-grabbing touch-none transition-shadow ${STAGE_RING_CLASS[user.character_stage]} ${
              happy ? 'pet-happy' : poked ? 'pet-poke' : !dragging && wandering ? 'pet-float' : ''
            }`}
            style={{ backgroundColor: pet.softColor, color: pet.color }}
            aria-label={`${pet.name} ${pet.stageNames[user.character_stage]}. 누르면 대화하고, 드래그하면 이동합니다.`}
            title={`${pet.name} (우클릭: 메뉴 / 드래그: 이동)`}
          >
            <CharacterIcon
              stage={user.character_stage}
              petId={petId}
              size={22}
              strokeWidth={1.75}
              accessoryEmoji={accessoryEmoji}
            />
          </button>
        </div>
      </div>

      {menu && (
        <div
          className="fixed z-[60] card p-1.5 min-w-[120px]"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              setWandering((w) => {
                const next = !w;
                wanderingRef.current = next;
                return next;
              });
              setMenu(null);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[8px] text-[12px] text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            {wandering ? <Pause size={13} /> : <Play size={13} />}
            {wandering ? '멈추기' : '움직이기'}
          </button>
          <button
            type="button"
            onClick={handlePlay}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[8px] text-[12px] text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <Heart size={13} />
            놀아주기
          </button>
        </div>
      )}
    </>
  );
}
