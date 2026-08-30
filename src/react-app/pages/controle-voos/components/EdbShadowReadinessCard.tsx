import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardList, RefreshCw } from 'lucide-react';
import api from '@/react-app/services/api';

type RegulatoryStage = {
  etapa_id: number;
  versao: number;
  tempo_voo_diurno_minutos: number | null;
  tempo_voo_noturno_minutos: number | null;
  tempo_voo_total_minutos: number | null;
  tempo_ifr_real_minutos: number | null;
  tempo_ifr_simulado_minutos: number | null;
  tempo_ifr_nao_classificado_minutos: number | null;
  pousos_total: number | null;
  ciclos: number | null;
  combustivel_antes_partida_motor: number | null;
  pessoas_a_bordo_total: number | null;
  carga_regulatoria_kg: number | null;
  ocorrencias_json: string | null;
};

type StageReadiness = {
  stageId: number;
  stageNumber: number;
  origin: string | null;
  destination: string | null;
  regulatory: RegulatoryStage | null;
  missingFields: string[];
  crewMissingFunction: number[];
  complete: boolean;
};

type RevisionReadiness = {
  revisionId: string | null;
  logicalRecordId: string | null;
  stageId: number;
  revision: number;
  stateVersion: number;
  readiness: {
    nextAction: string;
    complete: boolean;
    steps: Array<{ id: string; status: string; issues: string[] }>;
  };
};

type ReadinessPayload = {
  mode: string;
  stages: StageReadiness[];
  crew: Array<{
    tripulante_voo_id: number;
    etapa_id: number | null;
    funcionario_id: number;
    codigo_funcao_anac: string | null;
  }>;
  preflight: {
    technicalSituationId: string | null;
    technicalSnapshotPresent: boolean;
    technicalAcknowledgementPresent: boolean;
    technicalAcknowledgementSignatureId: string | null;
  };
  revisions: RevisionReadiness[];
  nextAction: string;
};

type CapabilityResponse = {
  success: boolean;
  data?: { enabled?: boolean };
};

type ReadinessResponse = {
  success: boolean;
  data?: ReadinessPayload;
};

const ACTION_LABELS: Record<string, string> = {
  SOURCE_STAGE: 'Registrar etapa operacional do voo',
  REGULATORY_STAGE: 'Completar dados regulatórios da etapa',
  CREW_FUNCTION: 'Informar função ANAC da tripulação',
  TECHNICAL_SNAPSHOT: 'Registrar situação técnica pré-voo',
  PIC_TECHNICAL_ACK: 'Coletar ciência técnica do PIC',
  FLIGHT_RECORD: 'Gerar revisão do Diário de Bordo',
  PIC_FLIGHT_SIGNATURE: 'Coletar assinatura final do PIC',
  OPERATOR_SIGNATURE: 'Coletar assinatura do operador',
  ANAC_SYNC: 'Aguardar futura integração oficial ANAC',
  COMPLETE: 'Fluxo interno completo',
};

const FIELD_LABELS: Record<string, string> = {
  tempo_voo_diurno_minutos: 'tempo diurno',
  tempo_voo_noturno_minutos: 'tempo noturno',
  tempo_voo_total_minutos: 'tempo total',
  tempo_ifr_real_minutos: 'IFR real',
  tempo_ifr_simulado_minutos: 'IFR simulado',
  pousos_total: 'pousos',
  ciclos: 'ciclos',
  combustivel_antes_partida_motor: 'combustível antes da partida',
  pessoas_a_bordo_total: 'pessoas a bordo',
  carga_regulatoria_kg: 'carga',
  ocorrencias_json: 'ocorrências',
};

export default function EdbShadowReadinessCard({ flightId }: { flightId: number }) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReadinessPayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const capability = await api.get<CapabilityResponse>('/edb/capability');
      if (!capability.data?.data?.enabled) {
        setEnabled(false);
        setData(null);
        return;
      }
      setEnabled(true);
      const response = await api.get<ReadinessResponse>(`/edb/voos/${flightId}/readiness`);
      if (!response.data?.success || !response.data.data) throw new Error('EDB_READINESS_UNAVAILABLE');
      setData(response.data.data);
    } catch (loadError) {
      setEnabled(false);
      setData(null);
      const status = typeof loadError === 'object' && loadError && 'response' in loadError
        ? Number((loadError as { response?: { status?: number } }).response?.status || 0)
        : 0;
      if (status !== 403 && status !== 404) setError('Não foi possível carregar o shadow eDB.');
    } finally {
      setLoading(false);
    }
  }, [flightId]);

  useEffect(() => {
    void load();
  }, [load]);

  const blockers = useMemo(() => {
    if (!data) return [] as string[];
    const items: string[] = [];
    for (const stage of data.stages) {
      for (const field of stage.missingFields) {
        items.push(`Etapa ${stage.stageNumber}: ${FIELD_LABELS[field] ?? field}`);
      }
      if (stage.crewMissingFunction.length > 0) {
        items.push(`Etapa ${stage.stageNumber}: função ANAC de ${stage.crewMissingFunction.length} tripulante(s)`);
      }
    }
    if (!data.preflight.technicalSnapshotPresent) items.push('Situação técnica pré-voo');
    else if (!data.preflight.technicalAcknowledgementPresent) items.push('Ciência técnica do PIC');
    return items;
  }, [data]);

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

  if (!data) return null;
  const complete = blockers.length === 0 && data.revisions.some((revision) => revision.readiness.complete);

  return (
    <div className="rounded-xl border border-blue-200 bg-white p-5 dark:border-blue-900 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Diário de Bordo Digital — Shadow</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Somente staging. Não substitui o Diário oficial e não transmite dados à ANAC.
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
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Próxima ação</p>
        <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
          {ACTION_LABELS[data.nextAction] ?? data.nextAction}
        </p>
      </div>

      {blockers.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">O que falta</p>
          <ul className="mt-2 space-y-1.5">
            {blockers.slice(0, 10).map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                {item}
              </li>
            ))}
            {blockers.length > 10 && (
              <li className="text-xs text-slate-400">+ {blockers.length - 10} pendência(s)</li>
            )}
          </ul>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          {complete ? 'Fluxo interno shadow completo.' : 'Dados de origem/preflight completos; seguir lifecycle da revisão.'}
        </div>
      )}

      {data.revisions.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {data.revisions.length} revisão(ões) persistida(s) no shadow. Última: {data.revisions.at(-1)?.readiness.nextAction ?? '—'}.
          </p>
        </div>
      )}
    </div>
  );
}
