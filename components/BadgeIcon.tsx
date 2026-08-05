'use client';

import { CalendarDays, CloudLightning, DoorOpen, Flag, Flame, Moon, Palmtree, Pill, Repeat2, Route, Sparkles, Sunrise, Timer, Trophy } from 'lucide-react';
import { BadgeIconKey } from '@/lib/badges';

const ICON_MAP: Record<BadgeIconKey, typeof Flag> = { flag: Flag, calendar: CalendarDays, timer: Timer, storm: CloudLightning, door: DoorOpen, pill: Pill, palm: Palmtree, trophy: Trophy, route: Route, flame: Flame, sunrise: Sunrise, moon: Moon, repeat: Repeat2, sparkles: Sparkles };

export default function BadgeIcon({ icon, size = 20, className }: { icon: BadgeIconKey; size?: number; className?: string }) {
  const Icon = ICON_MAP[icon];
  return <Icon size={size} className={className} aria-hidden="true" />;
}
