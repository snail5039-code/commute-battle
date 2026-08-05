'use client';

interface TopBarProps {
  title: string;
  subtitle?: string;
}

export default function TopBar({ title, subtitle }: TopBarProps) {
  return (
    <header className="sticky top-0 z-20 shrink-0 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl md:px-8">
      <div className="shell-content flex min-h-16 min-w-0 items-center py-3">
        <div className="min-w-0">
        <h1 className="text-base font-bold tracking-tight text-slate-950 md:text-lg">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 truncate text-xs text-slate-500 md:text-[13px]">{subtitle}</p>
        )}
        </div>
      </div>
    </header>
  );
}
