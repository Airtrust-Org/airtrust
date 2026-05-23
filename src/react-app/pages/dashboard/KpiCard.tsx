import React from 'react';
import { Link } from 'react-router-dom';

interface KpiCardProps {
  label: string;
  value: string | number;
  suffix?: string;
  icon: React.ReactNode;
  tone: 'green' | 'amber' | 'blue' | 'red';
  detail: string;
  href: string;
  progress?: number;
}

const colorsMap = {
  green: { value: 'text-emerald-700 dark:text-emerald-400', bar: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  amber: { value: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' },
  blue: { value: 'text-blue-700 dark:text-blue-400', bar: 'bg-blue-500', chip: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' },
  red: { value: 'text-red-700 dark:text-red-400', bar: 'bg-red-500', chip: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400' },
};

export const KpiCard = React.memo(function KpiCard({ label, value, suffix, icon, tone, detail, href, progress }: KpiCardProps) {
  const colors = colorsMap[tone];

  return (
    <Link
      to={href}
      className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</p>
        <div className={`rounded-xl p-1.5 ${colors.chip}`}>{icon}</div>
      </div>
      <div className="flex items-end gap-1.5">
        <span className={`text-3xl font-extrabold leading-none tracking-tight ${colors.value}`}>{value}</span>
        {suffix ? <span className="pb-0.5 text-sm font-bold text-slate-400 dark:text-slate-500">{suffix}</span> : null}
      </div>
      <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
      {typeof progress === 'number' ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className={`h-full transition-all ${colors.bar}`} style={{ width: `${Math.max(4, Math.min(100, progress))}%` }} />
        </div>
      ) : null}
    </Link>
  );
});
