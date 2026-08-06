import Link from 'next/link';
import { Settings } from 'lucide-react';
import { SETTINGS_SECTIONS } from './SettingsSections';

export default function DashboardSettingsShortcuts() {
  return (
    <section className="card self-start p-5" aria-label="빠른 설정">
      <h3 className="flex items-center gap-2 text-sm font-bold"><Settings size={17} className="text-blue-600" />빠른 설정</h3>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {SETTINGS_SECTIONS.map(({ id, label, icon: Icon }) => (
          <Link key={id} href={`/settings#${id}`} className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-100 bg-slate-50 py-3 text-center text-xs font-semibold text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </div>
    </section>
  );
}
