import type { ReactNode } from 'react';

type Tone = 'default' | 'danger';

interface SettingsSectionIntroProps {
  badge?: ReactNode;
  title: string;
  description: string;
  icon: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  tone?: Tone;
}

const TONE_STYLES: Record<Tone, { surface: string; badge: string; icon: string; divider: string }> =
  {
    default: {
      surface: 'border-slate-200 bg-white shadow-sm',
      badge: 'border-slate-200 bg-slate-50 text-slate-600',
      icon: 'bg-primary/10 text-primary',
      divider: 'border-slate-200',
    },
    danger: {
      surface: 'border-red-200 bg-white shadow-sm',
      badge: 'border-red-200 bg-red-50 text-red-700',
      icon: 'bg-red-100 text-red-600',
      divider: 'border-red-100',
    },
  };

export function SettingsSectionIntro({
  badge,
  title,
  description,
  icon,
  action,
  children,
  tone = 'default',
}: SettingsSectionIntroProps) {
  const styles = TONE_STYLES[tone];

  return (
    <section className={`rounded-2xl border ${styles.surface}`}>
      <div className="flex flex-col gap-4 px-6 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          {badge ? (
            <div
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${styles.badge}`}
            >
              {badge}
            </div>
          ) : null}

          <div className="mt-3 flex items-start gap-4">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${styles.icon}`}
            >
              {icon}
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">{title}</h2>
              <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-600">{description}</p>
            </div>
          </div>
        </div>

        {action ? <div className="flex shrink-0 items-center gap-3">{action}</div> : null}
      </div>

      {children ? <div className={`border-t px-6 py-5 ${styles.divider}`}>{children}</div> : null}
    </section>
  );
}
