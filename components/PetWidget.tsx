'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Pause, Play, Heart } from 'lucide-react';
import { useAppData } from '@/lib/useAppData';
import {
  generatePetMessage,
  generateIdleChat,
  generatePlayMessage,
  generatePokeMessage,
} from '@/lib/gemini';
import {
  detectPetTrigger,
  isPetQuiet,
  markSpokenToday,
} from '@/lib/petTriggers';
import { getTimeSegment } from '@/lib/petMessages';
import { STAGE_NAMES } from '@/lib/characterStages';
import { showOsNotification } from '@/lib/notifications';
import CharacterIcon from './CharacterIcon';

const CHECK_INTERVAL_MS = 60 * 1000;
const WANDER_INTERVAL_MS = 9 * 1000;
const IDLE_CHAT_CHANCE = 0.12;
const IDLE_CHAT_COOLDOWN_MS = 5 * 60 * 1000;
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

  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStage = useRef<string | null>(null);
  const lastIdleChatAt = useRef(0);
  const busy = useRef(false);
  const reactingRef = useRef(false);

  // 렌더 타이밍과 무관하게 "말하는 중 / 생각하는 중 / 드래그 중"을 항상 즉시 반영하는 ref들.
  // (렌더에서 동기화하면 setInterval 콜백이 한 틱 묵은 값을 읽는 레이스가 생겨서,
  //  상태를 바꾸는 지점에서 직접 ref도 같이 갱신한다.)
  const messageRef = useRef<string | null>(null);
  const thinkingRef = useRef(false);
  const draggingRef = useRef(false);
  const wanderingRef = useRef(true);
  wanderingRef.current = wandering; // 메뉴 클릭으로만 바뀌므로 렌더 동기화로도 충분

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 떠다니기: 한 번만 설정되는 안정적인 인터벌. 매 tick마다 최신 ref 값을 확인
  useEffect(() => {
    setPos((p) => p ?? randomPosition());

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
    const trigger = detectPetTrigger(records, now);

    if (trigger) {
      busy.current = true;
      markSpokenToday(trigger, now);
      const text = await generatePetMessage(trigger, user.character_stage);
      speak(text, true);
      busy.current = false;
      return;
    }

    const sinceLastIdle = Date.now() - lastIdleChatAt.current;
    if (
      !messageRef.current &&
      sinceLastIdle > IDLE_CHAT_COOLDOWN_MS &&
      Math.random() < IDLE_CHAT_CHANCE
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
    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
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

  return (
    <>
      <div
        className="fixed z-30 pointer-events-none"
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
              <p className="text-[12px] text-neutral-700 leading-snug flex-1">
                {message}
              </p>
              <button
                onClick={() => setMessageBoth(null)}
                className="text-neutral-300 hover:text-neutral-500 shrink-0"
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
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onClick={(e) => {
              if (e.button === 0 && !movedRef.current) handlePoke();
            }}
            onContextMenu={handleContextMenu}
            className={`absolute inset-0 pointer-events-auto w-12 h-12 rounded-full bg-gradient-to-b from-blue-500 to-blue-600 shadow-lg flex items-center justify-center text-white cursor-grab active:cursor-grabbing touch-none ${
              happy ? 'pet-happy' : poked ? 'pet-poke' : !dragging && wandering ? 'pet-float' : ''
            }`}
            title="캐릭터 (우클릭: 메뉴 / 드래그: 이동)"
          >
            <CharacterIcon
              stage={user.character_stage}
              size={22}
              strokeWidth={1.75}
            />
          </button>
        </div>
      </div>

      {menu && (
        <div
          className="fixed z-40 card p-1.5 min-w-[120px]"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setWandering((w) => !w);
              setMenu(null);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[8px] text-[12px] text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            {wandering ? <Pause size={13} /> : <Play size={13} />}
            {wandering ? '멈추기' : '움직이기'}
          </button>
          <button
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
