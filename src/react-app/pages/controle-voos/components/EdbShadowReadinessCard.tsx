import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardList, RefreshCw } from 'lucide-react';
import api from '@/react-app/services/api';
import {
  summarizeEdbShadowReadiness,
  type EdbShadowReadinessAssessment,
} from './edbShadowReadiness';

type CapabilityResponse = {
  success: boolean;
  data?: {
    enabled?: boolean;
    classification?: string;
    officialLogbook?: boolean;
    replacesPaper?: boolean;
  };
};

type ReadinessResponse = {
  success: boolean;
  data?: {
    classification: 'NON_OFFICIAL_SHADOW_READINESS';
    officialLogbook: false;
    replacesPaper: false;
    assessment: EdbShadowReadinessAssessment;
  };
};

export default function EdbShadowReadinessCard({ flightId }: { flightId: number }) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<EdbShadowReadinessAssessment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const capability = await api.get<CapabilityResponse>('/edb/capability');
      const capabilityData = capability.data?.data;
      if (
        !capabilityData?.enabled ||
        capabilityData.officialLogbook !== false ||
        capabilityData.replacesPaper !== false
      ) {
        setEnabled(false);
        setAssessment(null);
        return;
      }

      setEnabled(true);
      const readiness = await api.get<ReadinessResponse>(`/edb/voos/${flightId}/readiness`);
      const data = readiness.data?.data;
      if (
        !readiness.data?.success ||
        !data ||
        data.classification !== 'NON_OFFICIAL_SHADOW_READINESS' ||
        data.officialLogbook !== false ||
        data.replacesPaper !== false
      ) {
        throw new Error('EDB_SHADOW_READINESS_CONTRACT_INVALID');
      }
      setAssessment(data.assessment);
    } catch (loadError) {
      setAssessment(null);
      const status =
        typeof loadError === 'object' && loadError && 'response' in loadError
          ? Number((loadError as { response?: { status?: number } }).response?.status || 0)
          : 0;

      if (status === 403 || status === 404) {
        setEnabled(false);
        return;
      }
      setError('Não foi possível carregar a pré-avaliação shadow do eDB.');
    } finally {
      setLoading(false);
    }
  }, [flightId]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(
    () => (assessment ? summarizeEdbShadowReadiness(assessment) : null),
    [assessment],
  );

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <RefreshCw className="h-4 w-4 animate-spin" /> Verificando eDB shadow…
        </div>
      </div>
    );
  }

  if (!enabled && !error) return null;

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
        <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!assessment || !summary) return null;

  const statusClass =
    summary.tone === 'ok'
      ? 'text-emerald-700 dark:text-emerald-300'
      : summary.tone === 'blocked'
        ? 'text-red-700 dark:text-red-300'
        : 'text-amber-700 dark:text-amber-300';

  return (
    <div className="rounded-xl border border-blue-200 bg-white p-5 dark:border-blue-900 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
              Diário de Bordo Digital — Shadow
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Pré-avaliação não oficial. Não substitui o diário em papel, não assina registros e não transmite dados à ANAC.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          title="Atualizar"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
        <div className={`flex items-center gap-2 text-sm font-semibold ${statusClass}`}>
          {summary.tone === 'ok' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          {summary.title}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="text-slate-400">Readiness</dt>
            <dd className="mt-0.5 font-medium text-slate-700 dark:text-slate-200">
              {summary.readinessScore}%
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Completude</dt>
            <dd className="mt-0.5 font-medium text-slate-700 dark:text-slate-200">
              {summary.completenessPercent}%
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Achados</dt>
            <dd className="mt-0.5 font-medium text-slate-700 dark:text-slate-200">
              {summary.findingCount}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Referência oficial comparada</dt>
            <dd className="mt-0.5 font-medium text-slate-700 dark:text-slate-200">Não</dd>
          </div>
        </dl>
      </div>

      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        {summary.technicalMessage} A conferência com a referência oficial em papel continua obrigatória.
      </p>
    </div>
  );
}
