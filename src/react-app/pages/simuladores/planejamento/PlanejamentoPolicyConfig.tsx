import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Loader2, Settings2 } from 'lucide-react';
import { apiJson, frontendErrorMessage } from '@/react-app/lib/api-contract';
import { showToast } from '@/react-app/utils/toast';

type RosterPolicy = 'FOLGA' | 'TRABALHO' | 'AMBAS';

type PlanningConfig = {
  roster_policy: RosterPolicy;
  planning_horizon_days: number;
  preferred_sessions_per_day: number;
  preferred_minutes_per_day: number;
  allow_shared_session: boolean;
  source: string;
  warnings: string[];
};

const OPTIONS: Array<{
  value: RosterPolicy;
  title: string;
  description: string;
}> = [
  {
    value: 'FOLGA',
    title: 'Fora da quinzena',
    description: 'Planejar somente em dias de folga na escala publicada.',
  },
  {
    value: 'TRABALHO',
    title: 'Dentro da quinzena',
    description: 'Planejar somente em dias da quinzena de trabalho.',
  },
  {
    value: 'AMBAS',
    title: 'Indiferente',
    description: 'Aceitar dias de trabalho ou de folga.',
  },
];

function policyLabel(value: RosterPolicy | null) {
  return OPTIONS.find((option) => option.value === value)?.title || 'Carregando…';
}

export default function PlanejamentoPolicyConfig() {
  const [config, setConfig] = useState<PlanningConfig | null>(null);
  const [selected, setSelected] = useState<RosterPolicy>('AMBAS');
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await apiJson<PlanningConfig>('/api/simuladores/planejamento-v2/config');
        if (!active) return;
        setConfig(data);
        setSelected(data.roster_policy);
      } catch (error) {
        if (active) showToast.error(frontendErrorMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const save = async () => {
    if (!config || selected === config.roster_policy) {
      setExpanded(false);
      return;
    }

    try {
      setSaving(true);
      const data = await apiJson<PlanningConfig>('/api/simuladores/planejamento-v2/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roster_policy: selected }),
      });
      setConfig(data);
      setSelected(data.roster_policy);
      setExpanded(false);
      showToast.success('Regra do planejamento de simulador atualizada.');
      window.setTimeout(() => window.location.reload(), 250);
    } catch (error) {
      showToast.error(frontendErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-900/60"
        aria-expanded={expanded}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Regra da empresa para simulador
            </div>
            <div className="mt-0.5 truncate text-sm font-semibold text-slate-900 dark:text-white">
              {policyLabel(config?.roster_policy || null)}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs font-medium text-slate-500">
          <span className="hidden sm:inline">Alterar</span>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-200 px-4 py-4 dark:border-slate-800">
          <p className="mb-3 text-sm text-slate-500">
            Esta regra vale para todas as propostas da empresa e é conferida contra a escala publicada em cada data candidata.
          </p>
          <div className="grid gap-2 md:grid-cols-3">
            {OPTIONS.map((option) => {
              const active = selected === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelected(option.value)}
                  className={`rounded-lg border px-3 py-3 text-left transition ${
                    active
                      ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">{option.title}</span>
                    {active && <Check className="h-4 w-4 text-emerald-600" />}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{option.description}</div>
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setSelected(config?.roster_policy || 'AMBAS');
                setExpanded(false);
              }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || loading || !config}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar regra
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
