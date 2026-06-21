import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL, fetchWithAuth } from '@/react-app/config/api';

export type FrmsOperationalSnapshotAlertCode =
  | 'CHECKIN_PENDENTE'
  | 'CHECKIN_CRITICO'
  | 'SONO_ESTIMADO'
  | 'SONO_INSUFICIENTE'
  | 'KSS_ALTO'
  | 'EFETIVIDADE_BAIXA'
  | 'JORNADA_SEM_FATORIZACAO'
  | 'ESCALADO_SEM_JORNADA_FRMS'
  | 'JORNADA_FRMS_SEM_ESCALA'
  | 'DADO_INCONSISTENTE';

export type FrmsOperationalSnapshotStatus = 'OK' | 'ATENCAO' | 'CRITICO' | 'INCOMPLETO';

export type FrmsFortnightDataSource = 'REAL' | 'DERIVADO' | 'ESTIMADO' | 'AUSENTE' | 'INCOMPLETO';
export type FrmsFortnightStatus = 'OK' | 'ATENCAO' | 'CRITICO' | 'INCOMPLETO';
export type FrmsFortnightTendencia = 'ESTAVEL' | 'CRESCENTE' | 'REDUZINDO' | 'INDETERMINADA';
export type FrmsFortnightFreshness = 'COMPLETO' | 'PARCIAL' | 'ESTIMADO' | 'AUSENTE';
export type FrmsFortnightNaturezaDado =
  | 'PROJECAO'
  | 'CHECKIN_SUBJETIVO'
  | 'JORNADA_PLANEJADA'
  | 'JORNADA_REALIZADA'
  | 'ACUMULADO_LEGAL';
export type FrmsFortnightDecisaoCodigo = 'INFORMA' | 'ALERTA' | 'EXIGE_OVERRIDE' | 'BLOQUEIA';
export type FrmsFortnightMitigacaoRecomendada =
  | 'TROCAR_TRIPULANTE'
  | 'REDUZIR_JORNADA'
  | 'INSERIR_REPOUSO'
  | 'REVISAR_CHECKIN'
  | 'AGUARDAR_SIGVOOS'
  | 'ACEITAR_COM_RESSALVA'
  | 'SEM_ACAO';

export interface FrmsFortnightModifier {
  codigo: string;
  descricao: string;
  impacto_score: number;
}

export interface FrmsFortnightLimiteReferencia {
  tipo: 'QUINZENA_DUTY' | 'DUTY_168H' | 'VOO_168H';
  valor_atual: number;
  valor_limite: number;
  pct_atingido: number;
}

export interface FrmsFortnightIndicator {
  periodo_inicio: string | null;
  periodo_fim: string | null;
  dia_periodo: number | null;
  total_dias_periodo: number | null;
  dias_consecutivos_com_jornada: number | null;
  dias_com_checkin_pendente: number | null;
  dias_com_dado_estimado: number | null;
  duty_time_periodo_min: number | null;
  duty_time_168h_min: number | null;
  horas_voo_periodo_min: number | null;
  horas_voo_168h_min: number | null;
  jornadas_periodo: number | null;
  apresentacoes_antes_0600: number | null;
  apresentacoes_antes_0700: number | null;
  menor_descanso_entre_jornadas_min: number | null;
  setores_periodo: number | null;
  sit_periods_estimados: number | null;
  fonte_periodo: FrmsFortnightDataSource;
  freshness_dado?: FrmsFortnightFreshness;
  status_quinzena: FrmsFortnightStatus;
  score_acumulado?: number | null;
  tendencia?: FrmsFortnightTendencia;
  atenuadores_aplicados?: FrmsFortnightModifier[];
  agravantes_aplicados?: FrmsFortnightModifier[];
  natureza_dado?: FrmsFortnightNaturezaDado;
  explicacao_operacional?: string;
  mitigacao_recomendada?: FrmsFortnightMitigacaoRecomendada;
  decisao?: FrmsFortnightDecisaoCodigo;
  limite_referencia?: FrmsFortnightLimiteReferencia | null;
  alertas_quinzena: string[];
  limitation_notes: string[];
}

export interface FrmsOperationalSnapshotItem {
  empresa_id: number;
  data_operacional: string;
  funcionario_id: number;
  tripulante_id: number;
  nome: string | null;
  nome_guerra: string | null;
  funcao: string | null;
  base: string | null;
  aeronave: string | null;

  escalado: boolean;
  escala_source: 'SIGVOOS' | 'MANUAL' | 'EVD' | 'AUSENTE';
  hora_apresentacao: string | null;
  hora_termino: string | null;
  horas_voo_minutos: number;
  duracao_jornada_minutos: number;
  teve_jornada: boolean;

  checkin_status: 'RECEBIDO' | 'PENDENTE' | 'AUSENTE' | 'NAO_APLICAVEL';
  checkin_horario: string | null;
  kss_score: number | null;
  horas_sono: number | null;
  qualidade_sono: number | null;
  hora_acordar: string | null;
  fadiga_score: number | null;
  status_operacional_checkin: string | null;

  effectiveness_pct: number | null;
  nivel_fadiga_calculado: string | null;
  fatorizacao_status: 'CALCULADA' | 'AUSENTE';

  sleep_data_source: 'REAL' | 'ESTIMADO' | 'AUSENTE';
  wake_data_source: 'REAL' | 'ESTIMADO' | 'AUSENTE';
  jornada_data_source: 'REAL' | 'MANUAL' | 'ESTIMADO' | 'AUSENTE' | 'INCONSISTENTE';
  jornada_origem: string | null;
  snapshot_status: FrmsOperationalSnapshotStatus;
  fortnight_indicator: FrmsFortnightIndicator | null;

  alertas: FrmsOperationalSnapshotAlertCode[];
}

export interface FrmsOperationalSnapshotSummary {
  total_tripulantes: number;
  total_escalados: number;
  checkins_recebidos: number;
  checkins_pendentes: number;
  alertas_criticos: number;
  alertas_atencao: number;
  dados_estimados: number;
  inconsistencias: number;
  sem_fatorizacao: number;
  quinzena_incompleta: number;
  quinzena_atencao: number;
  quinzena_critica: number;
}

export interface FrmsOperationalSnapshotMeta {
  scope: 'team' | 'self';
  forced_funcionario_id?: number;
}

export interface FrmsOperationalSnapshotFilters {
  data_inicio: string;
  data_fim: string;
  funcionario_id?: string;
  base?: string;
  aeronave?: string;
  status?: FrmsOperationalSnapshotStatus | '';
  include_inconsistencies?: boolean;
}

interface SnapshotApiResponse {
  success: boolean;
  data: FrmsOperationalSnapshotItem[];
  summary: FrmsOperationalSnapshotSummary;
  meta?: FrmsOperationalSnapshotMeta;
  error?: string;
}

interface UseFrmsOperationalSnapshotResult {
  data: FrmsOperationalSnapshotItem[];
  summary: FrmsOperationalSnapshotSummary;
  meta: FrmsOperationalSnapshotMeta | null;
  loading: boolean;
  error: string | null;
  unauthorized: boolean;
  refetch: () => Promise<void>;
}

const EMPTY_SUMMARY: FrmsOperationalSnapshotSummary = {
  total_tripulantes: 0,
  total_escalados: 0,
  checkins_recebidos: 0,
  checkins_pendentes: 0,
  alertas_criticos: 0,
  alertas_atencao: 0,
  dados_estimados: 0,
  inconsistencias: 0,
  sem_fatorizacao: 0,
  quinzena_incompleta: 0,
  quinzena_atencao: 0,
  quinzena_critica: 0,
};

function buildSnapshotUrl(filters: FrmsOperationalSnapshotFilters): string {
  const params = new URLSearchParams({
    data_inicio: filters.data_inicio,
    data_fim: filters.data_fim,
    include_inconsistencies: String(filters.include_inconsistencies ?? true),
  });

  if (filters.funcionario_id?.trim()) params.set('funcionario_id', filters.funcionario_id.trim());
  if (filters.base?.trim()) params.set('base', filters.base.trim());
  if (filters.aeronave?.trim()) params.set('aeronave', filters.aeronave.trim());
  if (filters.status?.trim()) params.set('status', filters.status.trim());

  return `${API_BASE_URL}/frms/operational-snapshot?${params.toString()}`;
}

export function useFrmsOperationalSnapshot(
  filters: FrmsOperationalSnapshotFilters,
): UseFrmsOperationalSnapshotResult {
  const [data, setData] = useState<FrmsOperationalSnapshotItem[]>([]);
  const [summary, setSummary] = useState<FrmsOperationalSnapshotSummary>(EMPTY_SUMMARY);
  const [meta, setMeta] = useState<FrmsOperationalSnapshotMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  const fetchSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnauthorized(false);

    try {
      const response = await fetchWithAuth(buildSnapshotUrl(filters), {
        method: 'GET',
      });

      const payload = (await response.json()) as SnapshotApiResponse;

      if (!response.ok || !payload?.success) {
        const errorMessage = payload?.error || `Erro ao carregar snapshot (HTTP ${response.status})`;
        if (response.status === 401 || response.status === 403) {
          setUnauthorized(true);
        }
        throw new Error(errorMessage);
      }

      setData(Array.isArray(payload.data) ? payload.data : []);
      setSummary({
        ...EMPTY_SUMMARY,
        ...(payload.summary || {}),
      });
      setMeta(payload.meta || null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar snapshot operacional';
      if (
        /session expired|auth|unauthorized|token|sessão expirada/i.test(message) ||
        /Authentication required/i.test(message)
      ) {
        setUnauthorized(true);
      }
      setData([]);
      setSummary(EMPTY_SUMMARY);
      setMeta(null);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [
    filters.aeronave,
    filters.base,
    filters.data_fim,
    filters.data_inicio,
    filters.funcionario_id,
    filters.include_inconsistencies,
    filters.status,
  ]);

  useEffect(() => {
    void fetchSnapshot();
  }, [fetchSnapshot]);

  return {
    data,
    summary,
    meta,
    loading,
    error,
    unauthorized,
    refetch: fetchSnapshot,
  };
}
