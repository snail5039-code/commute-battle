'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useAppData } from '@/lib/useAppData';
import { generatePetMessage } from '@/lib/gemini';
import {
  detectPetTrigger,
  hasSpokenToday,
  isPetQuiet,
  markSpokenToday,
} from '@/lib/petTriggers';
import CharacterIcon from './CharacterIcon';

const CHECK_INTERVAL_MS = 60 * 1000;

export default function PetWidget() {
  const { user, records } = useAppData();
  const [message, setMessage] = useState<string | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = useCallback(async () => {
    if (!user || isPetQuiet()) return;

    const now = new Date();
    const trigger = detectPetTrigger(records, now);
    if (!trigger || hasSpokenToday(trigger, now)) return;

    markSpokenToday(trigger, now);
    const text = await generatePetMessage(trigger, user.character_stage);
    setMessage(text);

    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => setMessage(null), 12000);
  }, [user, records]);

  useEffect(() => {
    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [check]);

  if (!user) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-30 flex flex-col items-end gap-2">
      {message && (
        <div className="pet-bubble max-w-[220px] card p-3 flex items-start gap-2">
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
        onClick={() => setMessage((m) => (m ? null : m))}
        className="pet-float w-12 h-12 rounded-full bg-gradient-to-b from-blue-500 to-blue-600 shadow-lg flex items-center justify-center text-white"
        title="캐릭터"
      >
        <CharacterIcon stage={user.character_stage} size={22} strokeWidth={1.75} />
      </button>
    </div>
  );
}
