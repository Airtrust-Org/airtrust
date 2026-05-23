import React from 'react';

export const DashboardSkeleton = React.memo(function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-screen-2xl animate-pulse space-y-5 px-4 py-6 md:px-6">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4 lg:p-5 dark:border-slate-700 dark:bg-slate-800/50">
        <div className="mb-3 h-4 w-32 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-[124px] rounded-2xl bg-slate-200 dark:bg-slate-700 sm:h-[132px]" />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="h-4 w-48 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="flex gap-3">
          <div className="h-9 w-36 rounded-xl bg-slate-200 dark:bg-slate-700" />
          <div className="h-9 w-24 rounded-xl bg-slate-200 dark:bg-slate-700" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="h-56 rounded-2xl bg-slate-200 dark:bg-slate-700 lg:col-span-4" />
        <div className="h-56 rounded-2xl bg-slate-200 dark:bg-slate-700 lg:col-span-4" />
        <div className="grid grid-cols-3 gap-3 lg:col-span-4 lg:grid-cols-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-slate-200 dark:bg-slate-700 lg:h-auto lg:flex-1" />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="h-72 rounded-2xl bg-slate-200 dark:bg-slate-700 lg:col-span-5" />
        <div className="space-y-4 lg:col-span-4">
          <div className="h-44 rounded-2xl bg-slate-200 dark:bg-slate-700" />
          <div className="h-28 rounded-2xl bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="space-y-4 lg:col-span-3">
          <div className="h-32 rounded-2xl bg-slate-200 dark:bg-slate-700" />
          <div className="h-40 rounded-2xl bg-slate-200 dark:bg-slate-700" />
        </div>
      </div>

      <div className="h-16 rounded-2xl bg-slate-200 dark:bg-slate-700" />
    </div>
  );
});
