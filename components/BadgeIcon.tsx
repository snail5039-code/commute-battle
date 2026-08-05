'use client';

import {
  Flag,
  CalendarDays,
  Timer,
  CloudLightning,
  DoorOpen,
  Pill,
  Palmtree,
  Trophy,
} from 'lucide-react';
import { BadgeIconKey } from '@/lib/badges';

const ICON_MAP: Record<BadgeIconKey, typeof Flag> = {
  flag: Flag,
  calendar: CalendarDays,
  timer: Timer,
  storm: CloudLightning,
  door: DoorOpen,
  pill: Pill,
  palm: Palmtree,
  trophy: Trophy,
};

export default function BadgeIcon({
  icon,
  size = 20,
  className,
}: {
  icon: BadgeIconKey;
  size?: number;
  className?: string;
}) {
  const Icon = ICON_MAP[icon];
  return <Icon size={size} className={className} />;
}
