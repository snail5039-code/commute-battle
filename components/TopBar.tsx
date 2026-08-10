'use client';

interface TopBarProps {
  title: string;
  subtitle?: string;
}

export default function TopBar({ title, subtitle }: TopBarProps) {
  return (
    <header className="sticky top-0 z-20 shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-4 md:px-6">
      <div className="shell-content flex min-h-14 min-w-0 items-center py-2">
        <div className="min-w-0">
        <h1 className="text-[15px] font-extrabold tracking-tight text-slate-950 md:text-base">
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
