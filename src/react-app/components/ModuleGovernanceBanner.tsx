import {
  AlertTriangle,
  CheckCircle2,
  Info,
  LucideIcon,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import type { ModuleEvidenceLevel, ModuleMaturityLevel } from '@/react-app/lib/modules';
import { cn } from '@/react-app/lib/utils';

interface ModuleGovernanceBannerProps {
  maturityLevel: ModuleMaturityLevel;
  evidenceLevel: ModuleEvidenceLevel;
  title?: string;
  moduleName?: string;
  description?: string;
  isPrototype?: boolean;
  isRegulated?: boolean;
  className?: string;
}

interface BannerConfig {
  icon: LucideIcon;
  tone: string;
  iconTone: string;
  label: string;
  description: string;
}

const BANNER_CONFIG: Record<ModuleMaturityLevel, BannerConfig> = {
  N0: {
    icon: AlertTriangle,
    tone:
      'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100',
    iconTone: 'text-amber-500 dark:text-amber-400',
    label: 'Protótipo — não regulado',
    description:
      'Dados demonstrativos. Não utilizar como fonte oficial ou registro operacional/regulatório.',
  },
  N1: {
    icon: Info,
    tone:
      'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100',
    iconTone: 'text-sky-500 dark:text-sky-300',
    label: 'Operacional interno',
    description: 'Não substitui registro regulado.',
  },
  N2: {
    icon: ShieldAlert,
    tone:
      'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100',
    iconTone: 'text-amber-500 dark:text-amber-300',
    label: 'Evidência operacional',
    description: 'Não substitui registro regulado.',
  },
  N3: {
    icon: ShieldCheck,
    tone:
      'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100',
    iconTone: 'text-emerald-600 dark:text-emerald-300',
    label: 'Registro regulado',
    description: 'A substituição do papel exige autorização formal do POI por operador e escopo.',
  },
  N4: {
    icon: CheckCircle2,
    tone:
      'border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-50',
    iconTone: 'text-emerald-700 dark:text-emerald-200',
    label: 'Registro aceito/autorizado',
    description: 'Uso restrito ao escopo autorizado.',
  },
};

export default function ModuleGovernanceBanner({
  maturityLevel,
  evidenceLevel,
  title,
  moduleName,
  description,
  className,
}: ModuleGovernanceBannerProps) {
  const resolvedTitle = title ?? moduleName ?? 'Módulo';
  const config = BANNER_CONFIG[maturityLevel];
  const Icon = config.icon;
  const chips = [maturityLevel, evidenceLevel];

  return (
    <div
      className={cn(
        'mb-4 flex min-w-0 flex-col gap-2 rounded-lg border px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:gap-3',
        config.tone,
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', config.iconTone)} />
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-5">
            {resolvedTitle}: {config.label}.
          </p>
          <p className="leading-5 text-current/90">{description ?? config.description}</p>
        </div>
      </div>
      <div className="flex min-w-0 shrink-0 flex-wrap gap-1.5 pl-7 sm:justify-end sm:pl-0">
        {chips.map((chip) => (
          <span
            key={chip}
            className="inline-flex max-w-full items-center rounded-full border border-current/15 bg-white/60 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-current dark:bg-black/10"
          >
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
}
