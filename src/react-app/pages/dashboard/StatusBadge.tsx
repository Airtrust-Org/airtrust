import React from 'react';

interface StatusBadgeProps {
  label: string;
  tone: string;
}

export const StatusBadge = React.memo(function StatusBadge({ label, tone }: StatusBadgeProps) {
  return (
    <div className={`rounded-r-xl border-l-4 px-4 py-2 bg-white shadow-sm dark:bg-slate-900 ${tone}`}>
      <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Status</p>
      <p className="text-sm font-bold uppercase">{label}</p>
    </div>
  );
});
