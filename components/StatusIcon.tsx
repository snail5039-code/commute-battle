import type { LucideIcon } from 'lucide-react';

type Tone = 'blue' | 'sky' | 'indigo' | 'emerald' | 'amber' | 'slate';

const TONES: Record<Tone, string> = {
  blue: 'bg-blue-50 text-blue-700 ring-blue-100',
  sky: 'bg-sky-50 text-sky-700 ring-sky-100',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  slate: 'bg-slate-50 text-slate-700 ring-slate-200',
};

const SIZES = {
  sm: 'size-8 rounded-[10px] [&_svg]:size-4',
  md: 'size-10 rounded-xl [&_svg]:size-[19px]',
  lg: 'size-11 rounded-[14px] [&_svg]:size-5',
};

interface StatusIconProps {
  icon: LucideIcon;
  tone?: Tone;
  size?: keyof typeof SIZES;
  label?: string;
  className?: string;
  inverted?: boolean;
}

export default function StatusIcon({ icon: Icon, tone = 'blue', size = 'md', label, className = '', inverted = false }: StatusIconProps) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ring-1 ring-inset ${SIZES[size]} ${inverted ? 'bg-white/15 text-white ring-white/20' : TONES[tone]} ${className}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'}>
      <Icon strokeWidth={2.2} />
    </span>
  );
}
