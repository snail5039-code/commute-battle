'use client';

interface TopBarProps {
  title: string;
  subtitle?: string;
}

export default function TopBar({ title, subtitle }: TopBarProps) {
  return (
    <header className="h-16 bg-white/60 backdrop-blur-xl border-b border-black/[0.06] flex items-center px-6 md:px-8 shrink-0 sticky top-0 z-10">
      <div>
        <h1 className="text-[15px] font-semibold text-neutral-900 tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[12px] text-neutral-500">{subtitle}</p>
        )}
      </div>
    </header>
  );
}
