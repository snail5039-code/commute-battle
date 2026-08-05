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
  hasSpokenToday,
  isPetQuiet,
  markSpokenToday,
} from '@/lib/petTriggers';
import { getTimeSegment } from '@/lib/petMessages';
import { STAGE_NAMES } from '@/lib/characterStages';
import CharacterIcon from './CharacterIcon';

const CHECK_INTERVAL_MS = 60 * 1000;
const WANDER_INTERVAL_MS = 9 * 1000;
const IDLE_CHAT_CHANCE = 0.12;
const IDLE_CHAT_COOLDOWN_MS = 5 * 60 * 1000;
const PET_SIZE = 48;

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
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [wandering, setWandering] = useState(true);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [reacting, setReacting] = useState(false);

  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStage = useRef<string | null>(null);
  const lastIdleChatAt = useRef(0);
  const busy = useRef(false);

  const speak = useCallback((text: string) => {
    setMessage(text);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => setMessage(null), 12000);
  }, []);

  // 떠다니기: 주기적으로 화면 안 랜덤 위치로 이동 (멈추기 상태면 정지)
  useEffect(() => {
    setPos((p) => p ?? randomPosition());

    if (!wandering) return;

    const wander = () => {
      if (message) return; // 말하는 중엔 가만히 있기
      setPos(randomPosition());
    };

    const interval = setInterval(wander, WANDER_INTERVAL_MS);
    const onResize = () => setPos((p) => p ?? randomPosition());
    window.addEventListener('resize', onResize);

    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', onResize);
    };
  }, [message, wandering]);

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
      speak(`진화했다! 이제 나는 ${STAGE_NAMES[user.character_stage]}야!`);
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
      speak(text);
      busy.current = false;
      return;
    }

    const sinceLastIdle = Date.now() - lastIdleChatAt.current;
    if (
      !message &&
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
  }, [user, records, message, speak]);

  useEffect(() => {
    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [check]);

  const handleClick = async () => {
    if (!user || reacting) return;
    setReacting(true);
    const text = await generatePokeMessage(user.character_stage);
    speak(text);
    setReacting(false);
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

  const handlePlay = async () => {
    setMenu(null);
    if (!user || reacting) return;
    setReacting(true);
    const text = await generatePlayMessage(user.character_stage);
    speak(text);
    setReacting(false);
  };

  if (!user || !pos) return null;

  return (
    <>
      <div
        className="fixed z-30 flex flex-col items-center gap-2 pointer-events-none"
        style={{
          left: pos.x,
          top: pos.y,
          transition: 'left 3.5s ease-in-out, top 3.5s ease-in-out',
        }}
      >
        {message && (
          <div className="pet-bubble pointer-events-auto max-w-[200px] card p-3 flex items-start gap-2">
            <p className="text-[12px] text-neutral-700 leading-snug flex-1">
              {message}
            </p>
            <button
              onClick={() => setMessage(null)}
              className="text-neutral-300 hover:text-neutral-500 shrink-0"
            >
              <X size={13} />
            </button>
          </div>
        )}

        <button
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          className={`pointer-events-auto w-12 h-12 rounded-full bg-gradient-to-b from-blue-500 to-blue-600 shadow-lg flex items-center justify-center text-white ${
            wandering ? 'pet-float' : ''
          }`}
          title="캐릭터 (우클릭: 메뉴)"
        >
          <CharacterIcon
            stage={user.character_stage}
            size={22}
            strokeWidth={1.75}
          />
        </button>
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
