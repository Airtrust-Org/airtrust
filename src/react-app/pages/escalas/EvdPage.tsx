/**
 * EvdPage — Escala Diária de Voo (EDV) — PRC-OPS-009 §4.3
 *
 * Atribuição diária de tripulação por aeronave. Estrutura por prefixo/matrícula,
 * não por voo/trecho. Visualização em tabela por aeronave com publicação versionada.
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Plane,
  Plus,
  Trash2,
  CheckCircle,
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Send,
  History,
  FileText,
  Printer,
  Eye,
  Settings,
  X,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import TimeInput from '@/react-app/components/TimeInput';
import RowActionsMenu from '@/react-app/components/UI/RowActionsMenu';
import EscalasTabBar from './components/EscalasTabBar';
import Button from '@/react-app/components/Button';
import { useAuth } from '@/react-app/hooks/useAuth';
import { useApi } from '@/react-app/hooks/useApi';
import { apiFetch } from '@/react-app/lib/apiFetch';
import { getAccessToken } from '@/react-app/config/api';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import { normalizeTimeInput } from '@/react-app/lib/time-input';
import { canManageEscalaOperations } from './utils/operationalPermissions';
import {
  buildFrmsInlineSummary,
  buildFrmsLink as buildFrmsLinkFromModule,
  buildFrmsTooltipLabel,
  getFrmsVerboseLabel as getFrmsVerboseLabelFromModule,
} from './evdFrmsTooltip';
import type { FrmsFortnightIndicator } from '@/react-app/hooks/useFrmsOperationalSnapshot';

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface EvdVoo {
  id: string;
  data: string;
  status: string;
  pic_id: number | null;
  sic_id: number | null;
  pic_nome: string | null;
  pic_guerra: string | null;
  sic_nome: string | null;
  sic_guerra: string | null;
  pic_funcao: string | null;
  sic_funcao: string | null;
  aeronave_prefixo: string | null;
  aeronave_modelo: string | null;
  hora_apresentacao: string | null;
  hora_decolagem_prevista: string | null;
  hora_pouso_previsto: string | null;
  hora_decolagem_real: string | null;
  hora_pouso_real: string | null;
  hora_corte_motor: string | null;
  repouso_anterior_minutos: number | null;
  repouso_minimo_ok: number;
  origem: string | null;
  destino: string | null;
  tipo_missao: string;
  observacoes: string | null;
}

interface AeronaveAtiva {
  id: number;
  modelo: string | null;
  prefixo: string | null;
  status: string | null;
}

interface EscalaMensal {
  id: string;
  mes: number;
  ano: number;
  status: string;
}

interface TripulanteOperacionalItem {
  funcionario_id: string;
  nome: string;
  nome_guerra: string | null;
  role: string;
  status_operacional: 'APTO' | 'ATENCAO_CMA' | 'ATENCAO_FRMS' | 'BLOQUEADO_CMA' | 'BLOQUEADO_FRMS';
  pode_ser_alocado: boolean;
  motivo_bloqueio?: string | null;
  quinzena?: string | null;
  /** Conflito suave com escala mensal (selecionavel mas requer justificativa). */
  soft_conflict?: boolean;
  conflict_reason?: string | null;
  conflict_code?: string | null;
}

interface TripulantesOperacionaisData {
  tripulantes: TripulanteOperacionalItem[];
  resumo?: {
    total_aptos: number;
    total_bloqueados: number;
    sem_habilitacao?: string | null;
  };
}

interface FrmsDailyFatigueItem {
  funcionario_id: number | string;
  funcionario_nome?: string;
  status:
    | 'normal'
    | 'attention'
    | 'critical'
    | 'unfit_for_duty'
    | 'not_submitted'
    | 'no_duty';
  status_label?: string;
  requires_operational_review?: number | boolean;
  data_source?: 'crew_reported' | 'default_estimate' | 'not_applicable' | string;
}

interface FrmsDailyFatigueAlertItem {
  tripulante_id: number | string;
  nivel?: string;
  tipo_limite?: string;
  alert_type?: string;
  requires_operational_review?: number | boolean;
}

interface FrmsTripulanteSignal {
  status: FrmsDailyFatigueItem['status'];
  statusLabel: string;
  dataSource: string;
  requiresReview: boolean;
  hasAlert: boolean;
}

interface FrmsOperationalSnapshotLiteItem {
  funcionario_id: number;
  fortnight_indicator: FrmsFortnightIndicator | null;
}

interface FrmsOperationalSnapshotLiteResponse {
  success?: boolean;
  data?: FrmsOperationalSnapshotLiteItem[];
}

interface EvdJustificativaPayload {
  funcionario_id?: number | null;
  papel?: 'PIC' | 'SIC' | 'OUTRO' | null;
  origem_alerta: 'FRMS' | 'REPOUSO' | 'DUPLICIDADE' | 'OPERACIONAL' | 'OUTRO';
  tipo_alerta?: string | null;
  nivel_alerta?: string | null;
  decisao:
    | 'MANTER_ESCALA'
    | 'SUBSTITUIR'
    | 'ACIONAR_STANDBY'
    | 'ADICIONAR_OBSERVACAO'
    | 'OUTRO';
  justificativa: string;
  alerta_ref_id?: string | null;
}

interface PublishApiError {
  message: string;
  code?: string;
  requiresJustificativa?: boolean;
  warnings?: string[];
}

interface EvdPublicacaoResumo {
  id: string;
  empresa_id: string;
  data_ref: string;
  revisao: number;
  status: string;
  checksum: string;
  observacoes: string | null;
  publicado_por: string | null;
  publicado_em: string;
  created_at: string;
}

interface EvdPublicacaoJustificativa {
  id: string;
  funcionario_id: number | null;
  papel: string | null;
  origem_alerta: string;
  tipo_alerta: string | null;
  nivel_alerta: string | null;
  decisao: string;
  justificativa: string;
  alerta_ref_id: string | null;
  criado_por: string | null;
  created_at: string;
}

interface EvdPublicacaoSnapshotItem {
  id: string;
  status: string;
  data: string;
  aeronave_prefixo: string | null;
  aeronave_modelo: string | null;
  tripulacao?: {
    pic?: { id: number | null; nome: string | null; nome_guerra: string | null; funcao: string | null };
    sic?: { id: number | null; nome: string | null; nome_guerra: string | null; funcao: string | null };
  };
  horarios?: {
    hora_apresentacao: string | null;
    hora_decolagem_prevista: string | null;
    hora_pouso_previsto: string | null;
    hora_decolagem_real?: string | null;
    hora_pouso_real?: string | null;
    hora_corte_motor?: string | null;
  };
  rota?: {
    origem: string | null;
    destino: string | null;
    tipo_missao: string | null;
  };
  observacoes_gerais?: string | null;
  justificativas?: EvdPublicacaoJustificativa[];
}

interface EvdPublicacaoSnapshot {
  schema_version?: string;
  empresa_id?: string;
  data_ref?: string;
  revisao?: number;
  status?: string;
  publicado_por?: string | null;
  publicado_em?: string | null;
  observacoes?: string | null;
  frms_resumo?: { included?: boolean; reason?: string };
  itens?: EvdPublicacaoSnapshotItem[];
}

interface EvdPublicacaoDetalhe extends EvdPublicacaoResumo {
  payload_json: EvdPublicacaoSnapshot | null;
}

function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isIsoDate(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function getTomorrowDateStr() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return toLocalDateStr(tomorrow);
}

function resolveInitialEvdDate(searchParams: URLSearchParams): string {
  const byData = searchParams.get('data');
  if (isIsoDate(byData)) return byData;
  const byDate = searchParams.get('date');
  if (isIsoDate(byDate)) return byDate;
  return getTomorrowDateStr();
}

function formatDateBR(dateStr: string) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function formatDateTimeBR(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('pt-BR');
}

function shortChecksum(value: string | null | undefined) {
  const normalized = String(value || '').trim();
  if (!normalized) return '—';
  if (normalized.length <= 12) return normalized;
  return `${normalized.slice(0, 8)}...${normalized.slice(-4)}`;
}

function escapeHtml(value: string | null | undefined) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function statusBadge(status: string) {
  switch (status) {
    case 'PUBLICADA':
      return 'bg-emerald-100 text-emerald-700';
    case 'CANCELADA':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function toNumericId(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function isFrmsRelevant(signal: FrmsTripulanteSignal | null | undefined): boolean {
  if (!signal) return false;
  return (
    signal.status === 'attention' ||
    signal.status === 'critical' ||
    signal.status === 'unfit_for_duty' ||
    signal.requiresReview ||
    signal.hasAlert
  );
}

function frmsTone(status: FrmsDailyFatigueItem['status']) {
  if (status === 'critical' || status === 'unfit_for_duty') {
    return 'bg-red-50 text-red-700 border-red-200';
  }
  if (status === 'attention') {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  if (status === 'not_submitted') {
    return 'bg-violet-50 text-violet-700 border-violet-200';
  }
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

function frmsSeverity(signal: FrmsTripulanteSignal | null | undefined): string {
  if (!signal) return 'NONE';
  if (signal.status === 'unfit_for_duty') return 'UNFIT_FOR_DUTY';
  if (signal.status === 'critical') return 'CRITICAL';
  if (signal.status === 'attention') return 'ATTENTION';
  if (signal.requiresReview) return 'REVIEW_REQUIRED';
  if (signal.hasAlert) return 'ALERT';
  return 'NORMAL';
}

function buildFrmsJustificativaPayload(params: {
  justificativa: string;
  picId: number | null;
  sicId: number | null;
  picSignal: FrmsTripulanteSignal | null | undefined;
  sicSignal: FrmsTripulanteSignal | null | undefined;
}): EvdJustificativaPayload {
  let funcionarioId: number | null = null;
  let papel: 'PIC' | 'SIC' | 'OUTRO' = 'OUTRO';
  let signal: FrmsTripulanteSignal | null | undefined = null;

  if (isFrmsRelevant(params.picSignal) && params.picId) {
    funcionarioId = params.picId;
    papel = 'PIC';
    signal = params.picSignal;
  } else if (isFrmsRelevant(params.sicSignal) && params.sicId) {
    funcionarioId = params.sicId;
    papel = 'SIC';
    signal = params.sicSignal;
  }

  return {
    funcionario_id: funcionarioId,
    papel,
    origem_alerta: 'FRMS',
    tipo_alerta: signal?.hasAlert ? 'DAILY_ALERT' : 'DAILY_STATUS_REVIEW',
    nivel_alerta: frmsSeverity(signal),
    decisao: 'MANTER_ESCALA',
    justificativa: params.justificativa.trim(),
    alerta_ref_id: null,
  };
}

function buildOperationalJustificativaPayload(params: {
  justificativa: string;
  picId: number | null;
}): EvdJustificativaPayload {
  return {
    funcionario_id: params.picId,
    papel: params.picId ? 'PIC' : 'OUTRO',
    origem_alerta: 'OPERACIONAL',
    tipo_alerta: 'ROLE_TEXT_REVIEW',
    nivel_alerta: 'REVIEW_REQUIRED',
    decisao: 'MANTER_ESCALA',
    justificativa: params.justificativa.trim(),
    alerta_ref_id: null,
  };
}

function normalizePrefixo(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function getQuinzenaByDate(dateStr: string): 'primeira' | 'segunda' {
  const [_, __, day] = String(dateStr).split('-');
  return Number(day || 1) <= 15 ? 'primeira' : 'segunda';
}

function getFrmsReferenceDate(dataEscala: string): string {
  const today = toLocalDateStr(new Date());
  return dataEscala > today ? today : dataEscala;
}

function getAircraftStatusMeta(statusRaw: string | null | undefined): {
  code: 'D' | 'I' | 'M';
  label: 'Disponível' | 'Indisponível' | 'Manutenção';
  tone: string;
} {
  const status = String(statusRaw || 'ATIVO').trim().toUpperCase();
  if (
    status.includes('MANUT') ||
    status === 'M' ||
    status === 'MX' ||
    status === 'MAINTENANCE'
  ) {
    return {
      code: 'M',
      label: 'Manutenção',
      tone: 'bg-amber-100 text-amber-700',
    };
  }
  if (
    status === 'INATIVO' ||
    status === 'INDISPONIVEL' ||
    status === 'INDISPONÍVEL' ||
    status === 'I'
  ) {
    return {
      code: 'I',
      label: 'Indisponível',
      tone: 'bg-rose-100 text-rose-700',
    };
  }
  return {
    code: 'D',
    label: 'Disponível',
    tone: 'bg-emerald-100 text-emerald-700',
  };
}

function getDesignationStatusMeta(params: {
  hasDesignation: boolean;
  hasFrmsAlert: boolean;
  aircraftStatus: ReturnType<typeof getAircraftStatusMeta>;
}): { label: string; tone: string } {
  if (params.hasDesignation) {
    if (params.hasFrmsAlert) {
      return {
        label: 'Tripulação designada • alerta',
        tone: 'bg-amber-100 text-amber-700',
      };
    }
    return {
      label: 'Tripulação designada',
      tone: 'bg-emerald-100 text-emerald-700',
    };
  }
  if (params.aircraftStatus.code === 'M') {
    return {
      label: 'Manutenção',
      tone: 'bg-amber-100 text-amber-700',
    };
  }
  if (params.aircraftStatus.code === 'I') {
    return {
      label: 'Indisponível',
      tone: 'bg-rose-100 text-rose-700',
    };
  }
  return {
    label: 'Pendente de tripulação',
    tone: 'bg-sky-100 text-sky-700',
  };
}

function isAeronaveAtiva(statusRaw: string | null | undefined): boolean {
  const meta = getAircraftStatusMeta(statusRaw);
  return meta.code !== 'I';
}

function getFrmsRosterLabel(signal: FrmsTripulanteSignal | null | undefined): {
  short: string;
  long:
    | 'FRMS OK'
    | 'Atenção'
    | 'Revisão operacional'
    | 'Sem check-in'
    | 'Sem check-in · estimativa padrão'
    | 'Sem jornada'
    | 'Sem referência'
    | 'Indisponível';
  isEstimated?: boolean;
} {
  if (!signal) {
    return { short: '—', long: 'Sem referência' };
  }
  if (signal.status === 'no_duty') {
    return { short: '—', long: 'Sem jornada' };
  }
  if (signal.status === 'critical' || signal.status === 'unfit_for_duty') {
    return { short: 'REV', long: 'Revisão operacional' };
  }
  if (signal.status === 'attention') {
    return { short: 'ATN', long: 'Atenção' };
  }
  if (signal.status === 'not_submitted') {
    if (signal.dataSource === 'default_estimate') {
      return { short: 'SC', long: 'Sem check-in · estimativa padrão', isEstimated: true };
    }
    return { short: 'SC', long: 'Sem check-in' };
  }
  if (signal.requiresReview || signal.hasAlert) {
    return { short: 'REV', long: 'Revisão operacional' };
  }
  return { short: 'OK', long: 'FRMS OK' };
}

function getFrmsBadgeTone(short: string): string {
  if (short === 'OK') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (short === 'ATN') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (short === 'REV') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (short === 'SC') return 'border-slate-200 bg-slate-100 text-slate-700';
  if (short === '?') return 'border-slate-200 bg-slate-100 text-slate-500';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export function getFrmsVerboseLabel(signal: FrmsTripulanteSignal | null | undefined): string {
  return getFrmsVerboseLabelFromModule(signal);
}

export function buildFrmsLink(data: string, funcionarioId?: number | string | null): string {
  return buildFrmsLinkFromModule(data, funcionarioId);
}

function getQualificacaoBadgeTone(funcao: string | null | undefined): string {
  if (!funcao || funcao.toLowerCase().includes('a validar')) {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  return 'border-sky-200 bg-sky-50 text-sky-700';
}

function getFrmsReasonLine(
  signal: FrmsTripulanteSignal | null | undefined,
  frmsReferenceDate: string,
): string {
  const dateRef = formatDateBR(frmsReferenceDate);
  if (!signal) return `Sem referência FRMS para ${dateRef}`;
  if (signal.status === 'not_submitted') return `Sem check-in na data de referência FRMS ${dateRef}`;
  if (signal.status === 'no_duty') return `Sem jornada registrada na data de referência FRMS ${dateRef}`;
  if (signal.status === 'attention') return `Atenção FRMS na data de referência ${dateRef}`;
  if (signal.status === 'critical' || signal.status === 'unfit_for_duty') {
    return `Status FRMS crítico/inapto na data de referência ${dateRef}`;
  }
  if (signal.requiresReview || signal.hasAlert) return `Alerta FRMS ativo na referência ${dateRef}`;
  return `FRMS OK em ${dateRef}`;
}

function normalizeCrewRole(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function roleCanBePic(value: string | null | undefined): boolean {
  const role = normalizeCrewRole(value);
  if (!role) return false;
  return (
    role.includes('COMANDANTE') ||
    role.includes('COMMANDER') ||
    role.includes('PIC') ||
    role.includes('CMT')
  );
}

function roleCanBeSic(value: string | null | undefined): boolean {
  const role = normalizeCrewRole(value);
  if (!role) return false;
  return (
    role.includes('COPILOTO') ||
    role === 'COP' ||
    role.includes('SIC') ||
    role.includes('COPILOT') ||
    roleCanBePic(role)
  );
}

function normalizeHorarioInput(raw: string): string | null {
  const value = String(raw || '').trim();
  if (!value) return '';
  return normalizeTimeInput(value);
}

export default function EvdPage() {
  const { user } = useAuth();
  const podeGerenciarOperacoes = canManageEscalaOperations(user?.role);
  const [searchParams] = useSearchParams();
  const [data, setData] = useState(() => resolveInitialEvdDate(searchParams));
  const [showForm, setShowForm] = useState(false);
  const [selectedAircraftForForm, setSelectedAircraftForForm] = useState('');
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotDetail, setSnapshotDetail] = useState<EvdPublicacaoDetalhe | null>(null);
  const [publishingDay, setPublishingDay] = useState(false);

  const {
    data: voosRaw,
    loading,
    refetch: refetchVoos,
  } = useApi<EvdVoo[]>(`/api/evd?data=${data}`);
  const voos = voosRaw || [];
  const {
    data: publicacoesRaw,
    loading: loadingPublicacoes,
    refetch: refetchPublicacoes,
  } = useApi<EvdPublicacaoResumo[]>(`/api/evd/publicacoes?data=${data}`);
  const frmsReferenceDate = getFrmsReferenceDate(data);
  const frmsUsingPreviousDayContext = frmsReferenceDate !== data;
  const [frmsFetchReady, setFrmsFetchReady] = useState(false);
  useEffect(() => {
    // Defer FRMS fetch a little to prioritize EVD core data on first paint.
    setFrmsFetchReady(false);
    const timer = window.setTimeout(() => setFrmsFetchReady(true), 200);
    return () => window.clearTimeout(timer);
  }, [frmsReferenceDate]);
  const publicacoes = publicacoesRaw || [];
  const ultimaPublicacao = publicacoes[0] || null;
  const {
    data: frmsDailyRaw,
    error: frmsDailyError,
    loading: loadingFrmsDaily,
  } = useApi<{ items?: FrmsDailyFatigueItem[] }>(
    `/api/frms/daily-fatigue?date=${frmsReferenceDate}&scope=team`,
    {
      enabled: frmsFetchReady,
      staleTime: 60_000,
    },
  );
  const {
    data: frmsAlertsRaw,
    error: frmsAlertsError,
    loading: loadingFrmsAlerts,
  } = useApi<{
    items?: FrmsDailyFatigueAlertItem[];
  }>(`/api/frms/daily-fatigue/alerts?date=${frmsReferenceDate}`, {
    enabled: frmsFetchReady,
    staleTime: 60_000,
  });
  const { data: frmsSnapshotRaw } = useApi<FrmsOperationalSnapshotLiteResponse>(
    `/api/frms/operational-snapshot?data_inicio=${frmsReferenceDate}&data_fim=${frmsReferenceDate}&include_inconsistencies=true`,
    {
      enabled: frmsFetchReady,
      staleTime: 60_000,
    },
  );
  const {
    data: aeronavesRaw,
    loading: loadingAeronaves,
    refetch: refetchAeronaves,
  } = useApi<AeronaveAtiva[]>('/api/aeronaves?somente_ativas=1');

  const selectedDate = new Date(data + 'T12:00:00');
  const weekday = WEEKDAY_LABELS[selectedDate.getDay()];
  const escalaMes = selectedDate.getMonth() + 1;
  const escalaAno = selectedDate.getFullYear();
  const todayStr = toLocalDateStr(new Date());
  const tomorrowStr = getTomorrowDateStr();
  const isDPlusOne = data === tomorrowStr;

  const { data: escalasDoMesRaw } = useApi<EscalaMensal[]>(
    `/api/escalas?mes=${escalaMes}&ano=${escalaAno}`,
  );
  const escalaAtiva = useMemo(() => {
    const lista = escalasDoMesRaw || [];
    if (lista.length === 0) return null;
    for (const s of ['publicada', 'aprovada', 'rascunho']) {
      const found = lista.find((e) => e.status === s);
      if (found) return found;
    }
    return lista[0];
  }, [escalasDoMesRaw]);

  const frmsDailyItems = frmsDailyRaw?.items || [];
  const frmsAlertItems = frmsAlertsRaw?.items || [];
  const frmsLoading = !frmsFetchReady || loadingFrmsDaily || loadingFrmsAlerts;
  const frmsDailyUnavailable = Boolean(frmsDailyError);
  const frmsAlertsUnavailable = Boolean(frmsAlertsError) && !frmsDailyError;
  const frmsUnavailable = frmsDailyUnavailable;
  const aeronavesAtivas = useMemo(
    () => (aeronavesRaw || []).filter((a) => isAeronaveAtiva(a.status)),
    [aeronavesRaw],
  );
  const aeronavesByPrefix = useMemo(() => {
    const map = new Map<string, AeronaveAtiva>();
    for (const aeronave of aeronavesAtivas) {
      const key = normalizePrefixo(aeronave.prefixo);
      if (key) map.set(key, aeronave);
    }
    return map;
  }, [aeronavesAtivas]);

  const frmsByTripulante = useMemo(() => {
    const map = new Map<number, FrmsTripulanteSignal>();

    for (const item of frmsDailyItems) {
      const id = toNumericId(item.funcionario_id);
      if (!id) continue;
      map.set(id, {
        status: item.status,
        statusLabel: item.status_label || item.status,
        dataSource: String(item.data_source || 'not_applicable'),
        requiresReview:
          item.requires_operational_review === true || Number(item.requires_operational_review) === 1,
        hasAlert: false,
      });
    }

    for (const alert of frmsAlertItems) {
      const id = toNumericId(alert.tripulante_id);
      if (!id) continue;
      const existing = map.get(id);
      if (existing) {
        existing.hasAlert = true;
        map.set(id, existing);
        continue;
      }
      map.set(id, {
        status: 'attention',
        statusLabel: 'Atenção',
        dataSource: 'not_applicable',
        requiresReview:
          alert.requires_operational_review === true ||
          Number(alert.requires_operational_review) === 1,
        hasAlert: true,
      });
    }

    return map;
  }, [frmsAlertItems, frmsDailyItems]);

  const fortnightByTripulante = useMemo(() => {
    const map = new Map<number, FrmsFortnightIndicator>();
    for (const item of frmsSnapshotRaw?.data || []) {
      const id = toNumericId(item.funcionario_id);
      if (!id || !item.fortnight_indicator) continue;
      map.set(id, item.fortnight_indicator);
    }
    return map;
  }, [frmsSnapshotRaw?.data]);

  const resumoAeronavesDoDia = useMemo(() => {
    const alocadasPorPrefixo = new Map(
      voos
        .map((item) => [normalizePrefixo(item.aeronave_prefixo), item] as const)
        .filter(([prefixo]) => prefixo.length > 0),
    );

    return aeronavesAtivas.map((aeronave) => {
      const prefixo = normalizePrefixo(aeronave.prefixo);
      const alocacao = alocadasPorPrefixo.get(prefixo);
      const picSignal = toNumericId(alocacao?.pic_id)
        ? frmsByTripulante.get(Number(alocacao?.pic_id))
        : null;
      const sicSignal = toNumericId(alocacao?.sic_id)
        ? frmsByTripulante.get(Number(alocacao?.sic_id))
        : null;
      const hasFrmsAlert = isFrmsRelevant(picSignal) || isFrmsRelevant(sicSignal);
      const picNumericId = toNumericId(alocacao?.pic_id);
      const sicNumericId = toNumericId(alocacao?.sic_id);
      return {
        aeronave,
        alocacao,
        hasFrmsAlert,
        frmsAlertedCrewId: hasFrmsAlert
          ? isFrmsRelevant(picSignal)
            ? picNumericId
            : sicNumericId
          : null,
      };
    });
  }, [aeronavesAtivas, frmsByTripulante, voos]);

  const assignedAircraftPrefixes = useMemo(() => {
    const set = new Set<string>();
    for (const voo of voos) {
      const prefixo = normalizePrefixo(voo.aeronave_prefixo);
      if (prefixo) set.add(prefixo);
    }
    return set;
  }, [voos]);

  const firstPendingAircraftPrefix = useMemo(() => {
    const firstPending = resumoAeronavesDoDia.find(
      ({ aeronave, alocacao }) => !alocacao && getAircraftStatusMeta(aeronave.status).code === 'D',
    );
    return firstPending ? normalizePrefixo(firstPending.aeronave.prefixo) : '';
  }, [resumoAeronavesDoDia]);

  const resumoOperacional = useMemo(() => {
    const totalAtivas = resumoAeronavesDoDia.length;
    const designadas = resumoAeronavesDoDia.filter(({ alocacao }) => Boolean(alocacao)).length;
    const pendentes = resumoAeronavesDoDia.filter(
      ({ aeronave, alocacao }) => !alocacao && getAircraftStatusMeta(aeronave.status).code === 'D',
    ).length;
    const alertas = resumoAeronavesDoDia.filter(({ hasFrmsAlert }) => hasFrmsAlert).length;
    return { totalAtivas, designadas, pendentes, alertas };
  }, [resumoAeronavesDoDia]);
  const hasPendingAircraft = resumoOperacional.pendentes > 0;

  const refreshEvdData = useCallback(
    async ({ includePublicacoes = false }: { includePublicacoes?: boolean } = {}) => {
      const tasks: Array<Promise<unknown>> = [refetchVoos(), refetchAeronaves()];
      if (includePublicacoes) tasks.push(refetchPublicacoes());
      await Promise.allSettled(tasks);
    },
    [refetchAeronaves, refetchPublicacoes, refetchVoos],
  );

  function changeDay(delta: number) {
    const d = new Date(data + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    setData(toLocalDateStr(d));
  }

  function openDesignationPanel(prefix?: string) {
    const targetPrefix = normalizePrefixo(prefix) || firstPendingAircraftPrefix;
    if (!targetPrefix) {
      toast.info('Todas as aeronaves ativas já estão designadas para esta data.');
      return;
    }
    setSelectedAircraftForForm(targetPrefix);
    setShowForm(true);
  }

  function buildPrintHtml(publicacao: EvdPublicacaoDetalhe) {
    const payload = publicacao.payload_json;
    const itens = payload?.itens || [];
    const rows = itens
      .map((item) => {
        const pic = item.tripulacao?.pic?.nome_guerra || item.tripulacao?.pic?.nome || '—';
        const sic = item.tripulacao?.sic?.nome_guerra || item.tripulacao?.sic?.nome || '—';
        const apres = item.horarios?.hora_apresentacao || '—';
        const inicio = item.horarios?.hora_decolagem_prevista || '—';
        const termino = item.horarios?.hora_pouso_previsto || '—';
        const base = item.rota?.origem || '—';
        return `<tr>
          <td>${escapeHtml(item.aeronave_prefixo || '—')}</td>
          <td>${escapeHtml(item.aeronave_modelo || '—')}</td>
          <td>${escapeHtml(pic)}</td>
          <td>${escapeHtml(sic)}</td>
          <td>${escapeHtml(apres)}</td>
          <td>${escapeHtml(inicio)}</td>
          <td>${escapeHtml(termino)}</td>
          <td>${escapeHtml(base)}</td>
          <td>${escapeHtml(item.rota?.tipo_missao || '—')}</td>
          <td>${escapeHtml(item.observacoes_gerais || '')}</td>
        </tr>`;
      })
      .join('');

    const justificativas = itens
      .flatMap((item) =>
        (item.justificativas || []).map(
          (just) => `<li><strong>${escapeHtml(item.aeronave_prefixo || item.id)}</strong> — ${
            just.papel ? `${escapeHtml(just.papel)}: ` : ''
          }${escapeHtml(just.justificativa)}</li>`,
        ),
      )
      .join('');

    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Escala Diária de Voo</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 18px; color: #0f172a; font-size: 12px; }
    h1 { margin: 0 0 6px; font-size: 20px; }
    .meta { margin-bottom: 14px; color: #334155; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; }
    .section { margin-top: 14px; }
    @media print { body { margin: 8mm; } }
  </style>
</head>
<body>
  <h1>Escala Diária de Voo</h1>
  <div class="meta">
    Data: ${escapeHtml(payload?.data_ref || publicacao.data_ref)} |
    Revisão: ${publicacao.revisao} |
    Status: ${escapeHtml(publicacao.status)} |
    Publicado em: ${escapeHtml(formatDateTimeBR(publicacao.publicado_em))} |
    Checksum: ${escapeHtml(publicacao.checksum)}
  </div>
  <table>
    <thead>
      <tr>
        <th>Matrícula</th>
        <th>Modelo</th>
        <th>Comandante (PIC)</th>
        <th>Copiloto (SIC)</th>
        <th>Apresentação</th>
        <th>Início</th>
        <th>Término</th>
        <th>Base/Local</th>
        <th>Tipo Operação</th>
        <th>Observações</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="10">Sem itens na revisão.</td></tr>'}</tbody>
  </table>
  <div class="section">
    <strong>Justificativas operacionais</strong>
    <ul>${justificativas || '<li>Sem justificativas estruturadas.</li>'}</ul>
  </div>
  <div class="section">
    <em>Este documento contém apenas status operacional e justificativas da escala. Dados sensíveis do check-in FRMS não são incluídos.</em>
  </div>
</body>
</html>`;
  }

  async function loadPublicacao(id: string) {
    setSnapshotLoading(true);
    try {
      const res = await apiFetch(`/api/evd/publicacoes/${id}`);
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: EvdPublicacaoDetalhe;
      };
      if (!res.ok || !json.success || !json.data) {
        toast.error(json.error || 'Erro ao carregar revisão');
        return null;
      }
      setSnapshotDetail(json.data);
      setSnapshotOpen(true);
      setTimeout(() => {
        document.getElementById('evd-snapshot-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      return json.data;
    } finally {
      setSnapshotLoading(false);
    }
  }

  async function handlePrintPublicacao(id: string) {
    const current = snapshotDetail?.id === id ? snapshotDetail : await loadPublicacao(id);
    if (!current) return;
    const html = buildPrintHtml(current);
    const win = window.open('', '_blank');
    if (!win) {
      toast.error('Não foi possível abrir janela de impressão.');
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  async function handlePublishDay() {
    if (voos.length === 0) {
      toast.error('Não há itens para publicar neste dia.');
      return;
    }
    const confirm = window.confirm(
      `Publicar a escala diária completa de ${formatDateBR(data)}?\nIsso criará uma nova revisão.`,
    );
    if (!confirm) return;
    const observacoes = window.prompt('Observações da publicação (opcional):', '');
    if (observacoes === null) return;

    setPublishingDay(true);
    try {
      const res = await apiFetch('/api/evd/publicacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ data_ref: data, observacoes: observacoes.trim() || undefined }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: {
          id: string;
          revisao: number;
          checksum: string;
          publicado_em: string;
          publicado_por: string | null;
        };
      };
      if (!res.ok || !json.success || !json.data) {
        toast.error(json.error || 'Erro ao publicar escala do dia');
        return;
      }

      await refreshEvdData({ includePublicacoes: true });
      toast.success(
        `Escala do dia publicada. Rev ${json.data.revisao} • checksum ${shortChecksum(json.data.checksum)}`,
      );
    } finally {
      setPublishingDay(false);
    }
  }

  // Publicar voo
  const publicarMutation = useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload?: {
        require_justificativa?: boolean;
        justificativa?: EvdJustificativaPayload;
      };
    }) => {
      const res = await apiFetch(`/api/evd/${id}/publicar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload || {}),
      });
      const responseJson = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        code?: string;
        requires_justificativa?: boolean;
        warnings?: string[];
      };
      if (!res.ok) {
        const publishError: PublishApiError = {
          message: responseJson.error || 'Erro ao publicar',
          code: responseJson.code,
          requiresJustificativa: Boolean(responseJson.requires_justificativa),
          warnings: Array.isArray(responseJson.warnings) ? responseJson.warnings : [],
        };
        throw publishError;
      }
      return responseJson;
    },
    onSuccess: async () => {
      await refreshEvdData();
      toast.success('Escala diária publicada');
    },
  });

  // Delete voo
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/evd/${id}`, { method: 'DELETE', headers: { ...authHeaders() } });
      if (!res.ok) throw new Error('Erro ao excluir');
      return res.json();
    },
    onSuccess: async () => {
      await refreshEvdData();
      toast.success('Registro removido');
    },
    onError: () => {
      toast.error('Erro ao excluir');
    },
  });

  async function handleDelete(voo: EvdVoo) {
    const confirmed = await confirmDialog(
      `Confirma exclusão do voo ${voo.origem || '—'} → ${voo.destino || '—'}?`,
    );
    if (!confirmed) return;
    deleteMutation.mutate(voo.id);
  }

  async function handlePublish(voo: EvdVoo) {
    const picSignal = toNumericId(voo.pic_id) ? frmsByTripulante.get(Number(voo.pic_id)) : null;
    const sicSignal = toNumericId(voo.sic_id) ? frmsByTripulante.get(Number(voo.sic_id)) : null;
    const needsJustificativa = isFrmsRelevant(picSignal) || isFrmsRelevant(sicSignal);

    let publishPayload: { require_justificativa?: boolean; justificativa?: EvdJustificativaPayload } = {};
    if (needsJustificativa) {
      const existingRes = await apiFetch(`/api/evd/${voo.id}/justificativas`, { headers: { ...authHeaders() } });
      const existingJson = (await existingRes.json().catch(() => ({}))) as {
        success?: boolean;
        data?: unknown[];
      };
      const hasStructured = existingRes.ok && existingJson.success && (existingJson.data || []).length > 0;

      if (!hasStructured) {
        const justificativaTxt = window.prompt(
          `FRMS requer revisão operacional para este tripulante (referência ${formatDateBR(frmsReferenceDate)}). Informe justificativa operacional estruturada para publicar:`,
        );
        if (!justificativaTxt || justificativaTxt.trim().length < 10) {
          toast.error('Justificativa operacional obrigatória (mínimo 10 caracteres).');
          return;
        }
        publishPayload.justificativa = buildFrmsJustificativaPayload({
          justificativa: justificativaTxt,
          picId: toNumericId(voo.pic_id),
          sicId: toNumericId(voo.sic_id),
          picSignal,
          sicSignal,
        });
      }

      publishPayload.require_justificativa = true;
    }

    try {
      await publicarMutation.mutateAsync({ id: voo.id, payload: publishPayload });
    } catch (err) {
      const publishErr = err as PublishApiError;
      if (publishErr?.requiresJustificativa && publishErr.code === 'OPERATIONAL_ROLE_REVIEW_REQUIRED') {
        const warningLabel =
          publishErr.warnings && publishErr.warnings.length > 0
            ? `\n\n${publishErr.warnings.join('\n')}`
            : '';
        const justificativaTxt = window.prompt(
          `${publishErr.message || 'Revisão operacional obrigatória para função PIC.'}${warningLabel}\n\nInforme justificativa operacional estruturada para publicar:`,
        );
        if (!justificativaTxt || justificativaTxt.trim().length < 10) {
          toast.error('Justificativa operacional obrigatória (mínimo 10 caracteres).');
          return;
        }
        const payload = {
          require_justificativa: true,
          justificativa: buildOperationalJustificativaPayload({
            justificativa: justificativaTxt,
            picId: toNumericId(voo.pic_id),
          }),
        };
        await publicarMutation.mutateAsync({ id: voo.id, payload });
        return;
      }

      toast.error(publishErr?.message || 'Erro ao publicar');
    }
  }

  return (
    <AppLayout>
      <PageHeader
        title="Escala Diária de Voo"
        subtitle="Designação diária de tripulação por aeronave"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handlePublishDay}
              disabled={publishingDay || voos.length === 0}
              className="flex items-center gap-2"
            >
              <Send className="h-4 w-4" />
              {publishingDay ? 'Publicando...' : 'Publicar escala do dia'}
            </Button>
            <Button
              onClick={() => {
                if (showForm) {
                  setShowForm(false);
                  return;
                }
                openDesignationPanel();
              }}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> {showForm ? 'Fechar designação' : 'Nova designação'}
            </Button>
          </div>
        }
      />

        <EscalasTabBar />

      <div className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => changeDay(-1)}
                className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                title="Dia anterior"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Escala do dia
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-2xl font-bold leading-none text-slate-900 dark:text-slate-100">
                    {formatDateBR(data)}
                  </p>
                  {isDPlusOne && (
                    <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                      D+1 (padrão)
                    </span>
                  )}
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
                    Hoje: {formatDateBR(todayStr)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {weekday}, {formatDateBR(data)}
                </p>
              </div>
              <button
                onClick={() => changeDay(1)}
                className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                title="Próximo dia"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-start gap-3">
              <div className="text-right">
                <p className="text-xs font-medium text-slate-500">
                  {isDPlusOne ? 'Planejamento D+1' : 'Data selecionada manualmente'}
                </p>
                <input
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  className="mt-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-1 text-slate-500">
                <Plane className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">Aeronaves ativas</span>
              </div>
              <p className="mt-1 text-xl font-bold text-slate-900">{resumoOperacional.totalAtivas}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="flex items-center gap-1 text-emerald-700">
                <CheckCircle className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">Designadas</span>
              </div>
              <p className="mt-1 text-xl font-bold text-emerald-800">{resumoOperacional.designadas}</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
              <div className="flex items-center gap-1 text-sky-700">
                <Plus className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">Pendentes</span>
              </div>
              <p className="mt-1 text-xl font-bold text-sky-800">{resumoOperacional.pendentes}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center gap-1 text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">Alertas FRMS</span>
              </div>
              <p className="mt-1 text-xl font-bold text-amber-800">{resumoOperacional.alertas}</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,1fr)] xl:items-start">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Aeronaves do dia
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Acompanhe pendências de tripulação por aeronave e inicie designação diretamente pelo card.
                </p>
              </div>
              <span className="text-xs text-slate-500">{resumoAeronavesDoDia.length} ativas</span>
            </div>
            {loadingAeronaves ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="animate-pulse rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="h-5 w-20 bg-slate-200 rounded" />
                        <div className="h-3 w-28 bg-slate-100 rounded" />
                      </div>
                      <div className="space-y-1">
                        <div className="h-4 w-16 bg-slate-200 rounded-full" />
                        <div className="h-4 w-12 bg-slate-100 rounded-full" />
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="h-12 bg-slate-100 rounded" />
                      <div className="h-12 bg-slate-100 rounded" />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="h-4 w-24 bg-slate-100 rounded-full" />
                      <div className="h-7 w-32 bg-slate-200 rounded-lg" />
                    </div>
                  </div>
                ))}
              </div>
            ) : resumoAeronavesDoDia.length === 0 ? (
              <div className="space-y-1">
                <p className="text-sm text-amber-700">
                  Não há aeronaves ativas cadastradas para a empresa.
                </p>
                <p className="text-xs text-slate-500">
                  Cadastre ou reative uma aeronave para montar a escala diária.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {resumoAeronavesDoDia.map(({ aeronave, alocacao, hasFrmsAlert, frmsAlertedCrewId }) => {
                  const metaAnv = getAircraftStatusMeta(aeronave.status);
                  const prefixo = normalizePrefixo(aeronave.prefixo) || 'SEM-PREFIXO';
                  const statusDesignacao = getDesignationStatusMeta({
                    hasDesignation: Boolean(alocacao),
                    hasFrmsAlert,
                    aircraftStatus: metaAnv,
                  });
                  const canDesignar = !alocacao && metaAnv.code === 'D';

                  return (
                    <article
                      key={`${aeronave.id}-${prefixo}`}
                      className={[
                        'rounded-xl border p-3 cursor-pointer transition-shadow hover:shadow-md',
                        alocacao
                          ? hasFrmsAlert
                            ? 'border-amber-200 bg-amber-50/40 hover:shadow-amber-100/50'
                            : 'border-emerald-200 bg-emerald-50/30 hover:shadow-emerald-100/50'
                          : 'border-slate-200 bg-white hover:border-slate-300',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-mono text-lg font-semibold leading-none text-slate-900">
                            {prefixo}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {aeronave.modelo || 'Modelo não informado'}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusDesignacao.tone}`}
                          >
                            {statusDesignacao.label}
                          </span>
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600">
                            ANV: {metaAnv.label === 'Disponível' ? 'Ativa' : metaAnv.label}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-slate-100 bg-white p-2">
                        <div className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                            PIC
                          </p>
                          <p className="mt-0.5 text-xs font-medium text-slate-800">
                            {alocacao?.pic_guerra || alocacao?.pic_nome || 'Pendente'}
                          </p>
                        </div>
                        <div className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                            SIC
                          </p>
                          <p className="mt-0.5 text-xs font-medium text-slate-800">
                            {alocacao?.sic_guerra || alocacao?.sic_nome || 'Pendente'}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        {hasFrmsAlert ? (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                              <AlertTriangle className="h-3 w-3" />
                              Alerta FRMS
                            </span>
                            <Link
                              to={buildFrmsLink(frmsReferenceDate, frmsAlertedCrewId)}
                              className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 hover:text-blue-600 transition-colors"
                              title="Ver no Controle Operacional FRMS"
                            >
                              <ExternalLink className="h-2.5 w-2.5" />
                              Ver FRMS
                            </Link>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-500">
                            {canDesignar ? 'Pendente de tripulação' : 'Tripulação definida'}
                          </span>
                        )}
                        {canDesignar ? (
                          <button
                            type="button"
                            onClick={() => openDesignationPanel(prefixo)}
                            className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100 transition-colors"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Designar tripulação
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              document
                                .getElementById('evd-escala-dia')
                                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Ver na escala
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="space-y-4 xl:sticky xl:top-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Nova designação
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Selecione aeronave pendente, PIC/SIC, horários e salve a designação do dia.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  onClick={() => {
                    if (showForm) {
                      setShowForm(false);
                      return;
                    }
                    openDesignationPanel();
                  }}
                  className="flex items-center gap-2"
                  disabled={!hasPendingAircraft && !showForm}
                >
                  <Plus className="h-4 w-4" />
                  {showForm ? 'Recolher formulário' : 'Abrir formulário'}
                </Button>
                {showForm && (
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-100"
                  >
                    Fechar
                  </button>
                )}
              </div>
            </div>

            {!showForm ? (
              hasPendingAircraft ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-sm font-medium text-slate-800">
                    {resumoOperacional.pendentes} pendente(s) aguardando tripulação.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Clique em “Abrir formulário” ou use “Designar tripulação” no card da aeronave.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                  <p className="text-sm font-medium text-emerald-800">
                    Todas as aeronaves do dia já possuem tripulação designada.
                  </p>
                  <p className="mt-1 text-xs text-emerald-700">
                    Para alterar uma aeronave já designada, use o fluxo explícito de edição/substituição.
                  </p>
                </div>
              )
            ) : (
              <div className="animate-slide-down">
                <EvdCreateForm
                  data={data}
                  selectedAircraftPrefix={selectedAircraftForForm}
                  aeronavesAtivas={aeronavesAtivas}
                  assignedAircraftPrefixes={assignedAircraftPrefixes}
                  onClose={() => setShowForm(false)}
                  onCreated={async (createdPrefix) => {
                    await refreshEvdData();
                    setShowForm(false);
                    setSelectedAircraftForForm(createdPrefix || '');
                  }}
                  frmsByTripulante={frmsByTripulante}
                  frmsUnavailable={frmsUnavailable}
                  frmsReferenceDate={frmsReferenceDate}
                  escalaId={escalaAtiva?.id ?? null}
                />
              </div>
            )}
          </aside>
        </section>

        {frmsDailyUnavailable && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            FRMS indisponível na referência {formatDateBR(frmsReferenceDate)}. A escala segue
            visível, mas o status resumido de fadiga pode ficar incompleto.
          </div>
        )}
        {frmsLoading && !frmsDailyUnavailable && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Carregando status FRMS para {formatDateBR(frmsReferenceDate)}...
          </div>
        )}
        {frmsAlertsUnavailable && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Alertas FRMS indisponíveis na referência {formatDateBR(frmsReferenceDate)}; status
            diário carregado.
          </div>
        )}
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          FRMS referência: {formatDateBR(frmsReferenceDate)} para escala de {formatDateBR(data)}.
          {frmsUsingPreviousDayContext
            ? ' Ausência de check-in do dia futuro não gera alerta na montagem D-1.'
            : ' Como a montagem é no mesmo dia da operação, a referência FRMS é a própria data.'}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <History className="h-4 w-4 text-slate-500" />
              Histórico de publicações ({formatDateBR(data)})
            </h2>
            {ultimaPublicacao ? (
              <span className="text-xs text-slate-500">
                Última revisão: <strong>R{ultimaPublicacao.revisao}</strong>
              </span>
            ) : null}
          </div>

          {loadingPublicacoes ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-8 bg-slate-200 rounded" />
                      <div className="h-3 w-14 bg-slate-200 rounded" />
                      <div className="h-3 w-24 bg-slate-200 rounded" />
                    </div>
                    <div className="h-3 w-48 bg-slate-100 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : publicacoes.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma publicação diária registrada para esta data.</p>
          ) : (
            <div className="space-y-2">
              {publicacoes.slice(0, 5).map((pub) => (
                <div
                  key={pub.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="text-xs text-slate-600 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800">R{pub.revisao}</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                        {pub.status}
                      </span>
                      <span>checksum {shortChecksum(pub.checksum)}</span>
                    </div>
                    <div>
                      Publicado em {formatDateTimeBR(pub.publicado_em)}
                      {pub.publicado_por ? ` • por ${pub.publicado_por}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => loadPublicacao(pub.id)}
                      disabled={snapshotLoading}
                      className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Ver revisão
                    </button>
                    <button
                      onClick={() => void handlePrintPublicacao(pub.id)}
                      disabled={snapshotLoading}
                      className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Imprimir revisão
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {snapshotOpen && snapshotDetail && (
          <div id="evd-snapshot-panel" className="animate-fade-in rounded-xl border border-slate-200 bg-white p-4 space-y-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-600" />
                  Revisão R{snapshotDetail.revisao} • {formatDateBR(snapshotDetail.data_ref)}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Status <strong>{snapshotDetail.status}</strong> • Publicado em{' '}
                  {formatDateTimeBR(snapshotDetail.publicado_em)}
                  {snapshotDetail.publicado_por ? ` • por ${snapshotDetail.publicado_por}` : ''}
                </p>
                <p className="text-xs text-slate-500">
                  Checksum: <span className="font-mono">{snapshotDetail.checksum}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSnapshotOpen(false);
                  setSnapshotDetail(null);
                }}
                className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
              >
                <X className="h-3.5 w-3.5" />
                Fechar
              </button>
            </div>

            {snapshotDetail.payload_json?.frms_resumo?.included === false && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                Resumo FRMS não incluído no snapshot desta revisão.
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full text-xs border border-slate-200">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-2 py-2 text-left">Matrícula</th>
                    <th className="px-2 py-2 text-left">Modelo</th>
                    <th className="px-2 py-2 text-left">Comandante (PIC)</th>
                    <th className="px-2 py-2 text-left">Copiloto (SIC)</th>
                    <th className="px-2 py-2 text-left">Apresentação</th>
                    <th className="px-2 py-2 text-left">Início</th>
                    <th className="px-2 py-2 text-left">Término</th>
                    <th className="px-2 py-2 text-left">Base/Missão</th>
                    <th className="px-2 py-2 text-left">Observações</th>
                  </tr>
                </thead>
                <tbody>
                  {(snapshotDetail.payload_json?.itens || []).length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-2 py-3 text-center text-slate-500">
                        Sem itens neste snapshot.
                      </td>
                    </tr>
                  ) : (
                    (snapshotDetail.payload_json?.itens || []).map((item) => (
                      <tr key={item.id} className="border-t border-slate-100 align-top">
                        <td className="px-2 py-2 font-mono">{item.aeronave_prefixo || '—'}</td>
                        <td className="px-2 py-2">{item.aeronave_modelo || '—'}</td>
                        <td className="px-2 py-2">
                          {item.tripulacao?.pic?.nome_guerra ||
                            item.tripulacao?.pic?.nome ||
                            '—'}
                        </td>
                        <td className="px-2 py-2">
                          {item.tripulacao?.sic?.nome_guerra ||
                            item.tripulacao?.sic?.nome ||
                            '—'}
                        </td>
                        <td className="px-2 py-2">{item.horarios?.hora_apresentacao || '—'}</td>
                        <td className="px-2 py-2">{item.horarios?.hora_decolagem_prevista || '—'}</td>
                        <td className="px-2 py-2">{item.horarios?.hora_pouso_previsto || '—'}</td>
                        <td className="px-2 py-2">
                          <div>{item.rota?.origem || '—'}</div>
                          <div className="text-slate-500">{item.rota?.tipo_missao || '—'}</div>
                        </td>
                        <td className="px-2 py-2">{item.observacoes_gerais || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-xs font-medium text-slate-700 mb-2">Justificativas operacionais</p>
              <div className="space-y-2">
                {(snapshotDetail.payload_json?.itens || []).flatMap((item) => {
                  const justificativas = item.justificativas || [];
                  if (justificativas.length === 0) return [];
                  return justificativas.map((just) => (
                    <div key={just.id} className="text-xs text-slate-700 rounded border border-slate-200 bg-white px-2 py-2">
                      <p className="font-medium">
                        {item.aeronave_prefixo || item.id}
                        {just.papel ? ` • ${just.papel}` : ''}
                        {just.origem_alerta ? ` • ${just.origem_alerta}` : ''}
                      </p>
                      <p>{just.justificativa}</p>
                    </div>
                  ));
                })}
                {(snapshotDetail.payload_json?.itens || []).every(
                  (item) => (item.justificativas || []).length === 0,
                ) && <p className="text-xs text-slate-500">Sem justificativas estruturadas.</p>}
              </div>
            </div>
          </div>
        )}

        {/* Tabela de atribuições por aeronave */}
        <div
          id="evd-escala-dia"
          className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex flex-col gap-1 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">
                Escala do dia ({formatDateBR(data)})
              </h3>
              <p className="text-xs text-slate-500">
                Designações publicadas e em rascunho para o dia selecionado.
              </p>
            </div>
            <span className="text-xs font-medium text-slate-500">
              {voos.length} {voos.length === 1 ? 'designação' : 'designações'}
            </span>
          </div>
          {loading ? (
            <div className="animate-pulse p-4">
              <div className="h-7 w-full bg-slate-100 rounded mb-3" />
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4 py-3 border-b border-slate-100">
                  <div className="h-4 w-12 bg-slate-200 rounded" />
                  <div className="h-4 w-16 bg-slate-200 rounded" />
                  <div className="h-4 w-12 bg-slate-200 rounded" />
                  <div className="h-4 w-28 bg-slate-100 rounded" />
                  <div className="h-4 w-8 bg-slate-200 rounded" />
                  <div className="h-4 w-8 bg-slate-200 rounded" />
                  <div className="h-4 w-28 bg-slate-100 rounded" />
                  <div className="h-4 w-8 bg-slate-200 rounded" />
                  <div className="h-4 w-8 bg-slate-200 rounded" />
                  <div className="h-4 w-14 bg-slate-100 rounded" />
                  <div className="h-4 w-16 bg-slate-200 rounded ml-auto" />
                </div>
              ))}
            </div>
          ) : voos.length === 0 ? (
            <div className="py-16 text-center text-slate-400 dark:text-slate-500">
              <Plane className="h-12 w-12 mx-auto mb-3 opacity-30 animate-pulse" />
              <p className="text-sm font-medium">Nenhuma aeronave escalada para {formatDateBR(data)}</p>
              <button
                onClick={() => {
                  openDesignationPanel();
                }}
                className="mt-4 text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                Designar primeira aeronave
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                Fadiga (F): <code>OK</code> = Check-in recebido / FRMS OK, <code>ATN</code> = Atenção, <code>REV</code> = Revisar com gestor, <code>SC</code> = Check-in pendente (<code>SC Est.</code> = sem check-in, estimativa padrão aplicada), <code>IND</code> = FRMS indisponível.{' '}
                Clique no badge F para abrir o Controle Operacional FRMS filtrado pelo tripulante.
              </div>
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Tipo</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Matrícula</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Status ANV</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Comandante</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">F</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Q</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">P</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Copiloto</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">F</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Q</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">P</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Base</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Apresentação</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Início</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Término</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600">Observações</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-300">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {voos.map((voo) => {
                    const picSignal = toNumericId(voo.pic_id) ? frmsByTripulante.get(Number(voo.pic_id)) : null;
                    const sicSignal = toNumericId(voo.sic_id) ? frmsByTripulante.get(Number(voo.sic_id)) : null;
                    const hasFrmsAlert = isFrmsRelevant(picSignal) || isFrmsRelevant(sicSignal);
                    const picFrms = frmsDailyUnavailable
                      ? { short: '?', long: 'Indisponível' as const }
                      : getFrmsRosterLabel(picSignal);
                    const sicFrms = frmsDailyUnavailable
                      ? { short: '?', long: 'Indisponível' as const }
                      : getFrmsRosterLabel(sicSignal);
                    const picFortnight = voo.pic_id
                      ? fortnightByTripulante.get(toNumericId(voo.pic_id) || 0) ?? null
                      : null;
                    const sicFortnight = voo.sic_id
                      ? fortnightByTripulante.get(toNumericId(voo.sic_id) || 0) ?? null
                      : null;
                    const picFrmsSummary = buildFrmsInlineSummary(picSignal, picFortnight);
                    const sicFrmsSummary = buildFrmsInlineSummary(sicSignal, sicFortnight);
                    const prefixoNormalizado = normalizePrefixo(voo.aeronave_prefixo);
                    const aeronaveCadastro = aeronavesByPrefix.get(prefixoNormalizado);
                    const statusAnv = getAircraftStatusMeta(aeronaveCadastro?.status);
                    return (
                      <tr
                        key={voo.id}
                        className={[
                          'align-top transition-colors',
                          hasFrmsAlert
                            ? 'bg-amber-50/40 hover:bg-amber-100/60 dark:bg-amber-500/5 dark:hover:bg-amber-500/10'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
                        ].join(' ')}
                      >
                        <td className="px-3 py-3.5 text-xs text-slate-600 whitespace-nowrap">
                          {voo.aeronave_modelo || aeronaveCadastro?.modelo || '—'}
                        </td>
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded dark:bg-blue-500/10 dark:text-blue-300">
                            {voo.aeronave_prefixo || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${statusAnv.tone}`}>
                            {statusAnv.code}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          <span className="text-xs font-medium text-slate-800 dark:text-slate-100">
                            {voo.pic_guerra || voo.pic_nome || '—'}
                          </span>
                          {voo.repouso_minimo_ok === 0 && (
                            <div className="mt-0.5 flex items-center gap-1 text-[10px] text-red-600">
                              <AlertTriangle className="h-3 w-3" /> Repouso &lt;12h30
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="space-y-1">
                            <Link
                              to={buildFrmsLink(frmsReferenceDate, voo.pic_id)}
                              className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-semibold hover:opacity-80 transition-opacity ${getFrmsBadgeTone(picFrms.short)}`}
                              title={buildFrmsTooltipLabel(picSignal, picFortnight)}
                            >
                              {picFrms.short}
                              {picFrms.isEstimated && (
                                <span className="font-normal opacity-70">Est.</span>
                              )}
                              <ExternalLink className="h-2 w-2 opacity-50" />
                            </Link>
                            {picFrmsSummary ? (
                              <div className="max-w-40 text-[10px] leading-tight text-slate-500">
                                {picFrmsSummary}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${getQualificacaoBadgeTone(voo.pic_funcao)}`}
                          >
                            {voo.pic_funcao || 'a validar'}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          <span className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                            PIC
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="text-xs font-medium text-slate-800 dark:text-slate-100">
                            {voo.sic_guerra || voo.sic_nome || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="space-y-1">
                            <Link
                              to={buildFrmsLink(frmsReferenceDate, voo.sic_id)}
                              className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-semibold hover:opacity-80 transition-opacity ${getFrmsBadgeTone(sicFrms.short)}`}
                              title={buildFrmsTooltipLabel(sicSignal, sicFortnight)}
                            >
                              {sicFrms.short}
                              {sicFrms.isEstimated && (
                                <span className="font-normal opacity-70">Est.</span>
                              )}
                              <ExternalLink className="h-2 w-2 opacity-50" />
                            </Link>
                            {sicFrmsSummary ? (
                              <div className="max-w-40 text-[10px] leading-tight text-slate-500">
                                {sicFrmsSummary}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${getQualificacaoBadgeTone(voo.sic_funcao)}`}
                          >
                            {voo.sic_funcao || 'a validar'}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          <span className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                            SIC
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-xs text-slate-600 whitespace-nowrap">{voo.origem || '—'}</td>
                        <td className="px-3 py-3.5 text-xs text-slate-600 whitespace-nowrap">{voo.hora_apresentacao || '—'}</td>
                        <td className="px-3 py-3.5 text-xs text-slate-600 whitespace-nowrap">{voo.hora_decolagem_prevista || '—'}</td>
                        <td className="px-3 py-3.5 text-xs text-slate-600 whitespace-nowrap">{voo.hora_pouso_previsto || '—'}</td>
                        <td className="px-3 py-3.5 text-xs text-slate-600">
                          <div>{voo.observacoes || '—'}</div>
                          {hasFrmsAlert && (
                            <div className="mt-0.5 flex items-center gap-0.5 text-[10px] text-amber-600">
                              <AlertTriangle className="h-3 w-3" /> revisão FRMS
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {podeGerenciarOperacoes && voo.status === 'RASCUNHO' && (
                              <>
                                <button
                                  onClick={() => handlePublish(voo)}
                                  disabled={publicarMutation.isPending}
                                  className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                                >
                                  <Send className="h-3.5 w-3.5" /> Publicar
                                </button>
                                <RowActionsMenu
                                  label={`Ações do voo ${voo.origem || ''} ${voo.destino || ''}`.trim()}
                                  actions={[
                                    {
                                      label: 'Excluir voo',
                                      destructive: true,
                                      disabled: deleteMutation.isPending,
                                      icon: Trash2,
                                      onSelect: () => handleDelete(voo),
                                    },
                                  ]}
                                />
                              </>
                            )}
                            {voo.status === 'PUBLICADA' && (
                              <span className="flex items-center gap-1 text-[11px] text-emerald-600">
                                <CheckCircle className="h-3.5 w-3.5" /> Publicada
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

// ── Inline Create Form ────────────────────────

function EvdCreateForm({
  data,
  selectedAircraftPrefix,
  aeronavesAtivas,
  assignedAircraftPrefixes,
  onClose,
  onCreated,
  frmsByTripulante,
  frmsUnavailable,
  frmsReferenceDate,
  escalaId,
}: {
  data: string;
  selectedAircraftPrefix: string;
  aeronavesAtivas: AeronaveAtiva[];
  assignedAircraftPrefixes: Set<string>;
  onClose: () => void;
  onCreated: (createdPrefix: string) => Promise<void> | void;
  frmsByTripulante: Map<number, FrmsTripulanteSignal>;
  frmsUnavailable: boolean;
  frmsReferenceDate: string;
  escalaId: string | null;
}) {
  const [form, setForm] = useState({
    aeronave_prefixo: selectedAircraftPrefix || '',
    pic_id: '',
    sic_id: '',
    base: '',
    hora_apresentacao: '',
    hora_decolagem_prevista: '',
    hora_pouso_previsto: '',
    observacoes: '',
    justificativa_operacional: '',
  });
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const quinzena = getQuinzenaByDate(data);
  const selectedAircraftNormalized = normalizePrefixo(selectedAircraftPrefix);
  const aeronavesDisponiveis = useMemo(
    () =>
      aeronavesAtivas.filter((item) => {
        const prefixo = normalizePrefixo(item.prefixo);
        if (!prefixo) return false;
        const status = getAircraftStatusMeta(item.status);
        if (status.code !== 'D') return false;
        if (prefixo === selectedAircraftNormalized) return true;
        return !assignedAircraftPrefixes.has(prefixo);
      }),
    [aeronavesAtivas, assignedAircraftPrefixes, selectedAircraftNormalized],
  );

  const aeronaveSelecionada = useMemo(() => {
    const alvo = normalizePrefixo(form.aeronave_prefixo);
    return aeronavesDisponiveis.find((item) => normalizePrefixo(item.prefixo) === alvo) || null;
  }, [aeronavesDisponiveis, form.aeronave_prefixo]);
  const aeronaveJaDesignada = Boolean(
    form.aeronave_prefixo && assignedAircraftPrefixes.has(normalizePrefixo(form.aeronave_prefixo)),
  );

  const tripulantesUrl = aeronaveSelecionada
    ? `/api/escalas/tripulantes-operacionais?aeronave_id=${aeronaveSelecionada.id}&incluir_bloqueados=true&data_inicio=${data}&data_fim=${data}&quinzena=${quinzena}${escalaId ? `&escala_id=${encodeURIComponent(escalaId)}` : ''}`
    : '';
  const {
    data: tripulantesRaw,
    loading: loadingTripulantes,
    error: tripulantesError,
  } = useApi<TripulantesOperacionaisData>(tripulantesUrl, {
    enabled: Boolean(aeronaveSelecionada),
  });

  const tripulantes = tripulantesRaw?.tripulantes || [];
  const tripulantesAptos = tripulantes.filter((item) => item.pode_ser_alocado);
  const tripulantesBloqueados = tripulantes.filter((item) => !item.pode_ser_alocado);

  const picCandidatosCanonicos = tripulantesAptos.filter((item) => roleCanBePic(item.role));
  const sicCandidatosCanonicos = tripulantesAptos.filter((item) => roleCanBeSic(item.role));
  const picFallbackHeuristico = picCandidatosCanonicos.length === 0 && tripulantesAptos.length > 0;
  const sicFallbackHeuristico = sicCandidatosCanonicos.length === 0 && tripulantesAptos.length > 0;
  const picCandidatos = picFallbackHeuristico ? tripulantesAptos : picCandidatosCanonicos;
  const sicCandidatos = sicFallbackHeuristico ? tripulantesAptos : sicCandidatosCanonicos;
  const picBloqueados = tripulantesBloqueados.filter((item) =>
    picFallbackHeuristico ? true : roleCanBePic(item.role),
  );
  const sicBloqueados = tripulantesBloqueados.filter((item) =>
    sicFallbackHeuristico ? true : roleCanBeSic(item.role),
  );

  const selectedPicId = form.pic_id ? Number(form.pic_id) : null;
  const selectedSicId = form.sic_id ? Number(form.sic_id) : null;
  const frmsPic = selectedPicId ? frmsByTripulante.get(selectedPicId) : null;
  const frmsSic = selectedSicId ? frmsByTripulante.get(selectedSicId) : null;
  const needsStructuredJustificativa = isFrmsRelevant(frmsPic) || isFrmsRelevant(frmsSic);
  const bloqueioElegibilidade = Boolean(tripulantesError);

  const picSelecionado = tripulantesAptos.find((item) => Number(item.funcionario_id) === selectedPicId);
  const sicSelecionado = tripulantesAptos.find((item) => Number(item.funcionario_id) === selectedSicId);

  const frmsPicLabel = frmsUnavailable
    ? 'FRMS indisponível'
    : getFrmsReasonLine(frmsPic, frmsReferenceDate);
  const frmsSicLabel = frmsUnavailable
    ? 'FRMS indisponível'
    : getFrmsReasonLine(frmsSic, frmsReferenceDate);

  function handleHorarioBlur(
    campo: 'hora_apresentacao' | 'hora_decolagem_prevista' | 'hora_pouso_previsto',
    label: string,
  ) {
    const normalizado = normalizeHorarioInput(form[campo]);
    if (normalizado === null) {
      setError(`${label} inválido. Use HHmm ou HH:mm.`);
      return;
    }

    setForm((prev) => ({ ...prev, [campo]: normalizado }));
    setError((prev) => (prev.startsWith(label) ? '' : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setWarnings([]);
    setSubmitting(true);

    try {
      if (!aeronaveSelecionada) {
        setError('Selecione uma aeronave ativa.');
        setSubmitting(false);
        return;
      }
      if (aeronaveJaDesignada) {
        setError(
          'Esta aeronave já possui designação nesta data. Use o fluxo explícito de edição/substituição.',
        );
        setSubmitting(false);
        return;
      }

      if (bloqueioElegibilidade) {
        setError(
          'Fonte de disponibilidade indisponível. Não é permitido escalar tripulante sem validação de quinzena/disponibilidade.',
        );
        setSubmitting(false);
        return;
      }

      const picId = form.pic_id ? Number(form.pic_id) : null;
      const sicId = form.sic_id ? Number(form.sic_id) : null;
      if (!picId || !sicId) {
        setError('Selecione PIC e SIC para salvar a designação.');
        setSubmitting(false);
        return;
      }
      if (picId && sicId && picId === sicId) {
        setError('Comandante e copiloto não podem ser o mesmo tripulante.');
        setSubmitting(false);
        return;
      }

      if (!picCandidatos.some((item) => Number(item.funcionario_id) === picId)) {
        setError('PIC selecionado não está elegível para esta aeronave/modelo na data.');
        setSubmitting(false);
        return;
      }

      if (!sicCandidatos.some((item) => Number(item.funcionario_id) === sicId)) {
        setError('SIC selecionado não está elegível para esta aeronave/modelo na data.');
        setSubmitting(false);
        return;
      }

      const horaApresentacao = normalizeHorarioInput(form.hora_apresentacao);
      if (horaApresentacao === null) {
        setError('Apresentação inválida. Use HHmm ou HH:mm.');
        setSubmitting(false);
        return;
      }
      const horaInicio = normalizeHorarioInput(form.hora_decolagem_prevista);
      if (horaInicio === null) {
        setError('Início inválido. Use HHmm ou HH:mm.');
        setSubmitting(false);
        return;
      }
      const horaTermino = normalizeHorarioInput(form.hora_pouso_previsto);
      if (horaTermino === null) {
        setError('Término inválido. Use HHmm ou HH:mm.');
        setSubmitting(false);
        return;
      }

      const needsJustificativa = isFrmsRelevant(frmsPic) || isFrmsRelevant(frmsSic);

      if (needsJustificativa && form.justificativa_operacional.trim().length < 10) {
        const frmsReasons: string[] = [];
        if (isFrmsRelevant(frmsPic) && picSelecionado) {
          const nome = (picSelecionado.nome_guerra || picSelecionado.nome).trim();
          frmsReasons.push(`PIC ${nome}: ${getFrmsReasonLine(frmsPic, frmsReferenceDate)}`);
        }
        if (isFrmsRelevant(frmsSic) && sicSelecionado) {
          const nome = (sicSelecionado.nome_guerra || sicSelecionado.nome).trim();
          frmsReasons.push(`SIC ${nome}: ${getFrmsReasonLine(frmsSic, frmsReferenceDate)}`);
        }
        const motivoTexto = frmsReasons.length > 0 ? ` Motivos: ${frmsReasons.join('; ')}.` : '';
        setError(
          `Justificativa operacional obrigatoria (min. 10 caracteres).${motivoTexto}`,
        );
        setSubmitting(false);
        return;
      }

      const body = {
        data,
        escala_id: escalaId || undefined,
        pic_id: picId,
        sic_id: sicId,
        pic_funcao: picSelecionado?.role || 'Qualificação: a validar',
        sic_funcao: sicSelecionado?.role || 'Qualificação: a validar',
        aeronave_prefixo: aeronaveSelecionada.prefixo || undefined,
        aeronave_modelo: aeronaveSelecionada.modelo || undefined,
        hora_apresentacao: horaApresentacao || undefined,
        hora_decolagem_prevista: horaInicio || undefined,
        hora_pouso_previsto: horaTermino || undefined,
        origem: form.base || undefined,
        tipo_missao: 'OFFSHORE',
        observacoes: form.observacoes.trim() || undefined,
      };

      const res = await apiFetch('/api/evd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as {
        success: boolean;
        error?: string;
        data?: { id: string; warnings?: string[] };
      };

      if (!res.ok || !json.success) {
        setError(json.error || 'Erro ao criar atribuição');
        return;
      }

      if (json.data?.warnings?.length) {
        setWarnings(json.data.warnings);
      }

      if (needsJustificativa && json.data?.id) {
        const justificativaPayload = buildFrmsJustificativaPayload({
          justificativa: form.justificativa_operacional,
          picId,
          sicId,
          picSignal: frmsPic,
          sicSignal: frmsSic,
        });
        const justRes = await apiFetch(`/api/evd/${json.data.id}/justificativas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify(justificativaPayload),
        });
        if (!justRes.ok) {
          const err = await justRes.json().catch(() => ({}));
          setError(
            (err as { error?: string }).error ||
              'Escala criada, mas falhou ao registrar justificativa operacional estruturada.',
          );
          setSubmitting(false);
          return;
        }
      }

      const createdPrefix = normalizePrefixo(aeronaveSelecionada.prefixo);
      toast.success(
        needsJustificativa
          ? `Designação salva para ${createdPrefix} com justificativa operacional FRMS.`
          : `Designação salva para ${createdPrefix}.`,
      );
      await onCreated(createdPrefix);
    } catch {
      setError('Erro de rede');
    } finally {
      setSubmitting(false);
    }
  }

  const semAeronavesPendentes = aeronavesDisponiveis.length === 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Plus className="h-4 w-4 text-blue-600" />
            Nova designação — {formatDateBR(data)}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Preencha aeronave, tripulação e horários para salvar.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
        >
          Fechar
        </button>
      </div>

      {semAeronavesPendentes ? (
        <div className="space-y-3 p-4">
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Todas as aeronaves do dia já possuem tripulação designada.
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Use o fluxo explícito de edição/substituição para alterar tripulação já designada.
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5 p-4">
          {/* ── AERONAVE ── */}
          <section>
            <h4 className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
              Aeronave
            </h4>
            <select
              value={form.aeronave_prefixo}
              onChange={(e) => {
                setForm((prev) => ({
                  ...prev,
                  aeronave_prefixo: e.target.value,
                  pic_id: '',
                  sic_id: '',
                }));
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              required
            >
              <option value="">Selecione uma aeronave pendente</option>
              {aeronavesDisponiveis.map((aeronave) => {
                const prefixo = normalizePrefixo(aeronave.prefixo);
                const meta = getAircraftStatusMeta(aeronave.status);
                return (
                  <option key={aeronave.id} value={prefixo}>
                    {prefixo} — {aeronave.modelo || 'Sem modelo'} ({meta.label})
                  </option>
                );
              })}
            </select>
            {aeronaveSelecionada && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                  {normalizePrefixo(aeronaveSelecionada.prefixo)}
                </span>
                <span className="text-[11px] text-slate-300">·</span>
                <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                  {aeronaveSelecionada.modelo || 'Sem modelo'}
                </span>
                <span className="text-[11px] text-slate-300">·</span>
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  <CheckCircle className="h-3 w-3" />
                  {getAircraftStatusMeta(aeronaveSelecionada.status).label === 'Disponível'
                    ? 'Ativa'
                    : getAircraftStatusMeta(aeronaveSelecionada.status).label}
                </span>
                <span className="text-[11px] text-slate-300">·</span>
                <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                  {quinzena === 'primeira' ? '1ª Quinzena' : '2ª Quinzena'}
                </span>
              </div>
            )}
            {aeronaveJaDesignada && (
              <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
                Esta aeronave já está designada para o dia selecionado.
              </div>
            )}
          </section>

          {/* ── TRIPULAÇÃO ── */}
          <section>
            <h4 className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
              Tripulação
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* PIC */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Comandante <span className="text-slate-400 font-normal">PIC</span>
                </label>
                {loadingTripulantes ? (
                  <div className="animate-pulse space-y-2">
                    <div className="h-9 w-full bg-slate-200 rounded-lg dark:bg-slate-700" />
                    <div className="h-4 w-3/4 bg-slate-100 rounded dark:bg-slate-700" />
                  </div>
                ) : (
                  <>
                    <select
                      value={form.pic_id}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          pic_id: e.target.value,
                          sic_id: prev.sic_id === e.target.value ? '' : prev.sic_id,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      disabled={!aeronaveSelecionada || bloqueioElegibilidade}
                    >
                      <option value="">Selecionar comandante</option>
                      {picCandidatos.map((p) => {
                        const frms = frmsUnavailable
                          ? '?'
                          : getFrmsRosterLabel(frmsByTripulante.get(Number(p.funcionario_id))).short;
                        const conflictNote = p.soft_conflict
                          ? p.conflict_code === 'FRMS_CRITICAL'
                            ? ' [!] FRMS'
                            : ' [!] Conflito'
                          : '';
                        return (
                          <option key={p.funcionario_id} value={p.funcionario_id}>
                            {(p.nome_guerra || p.nome).trim()} — FRMS {frms}{conflictNote}
                          </option>
                        );
                      })}
                      {picBloqueados.length > 0 && (
                        <optgroup label="Indisponíveis (bloqueados)">
                          {picBloqueados.map((p) => (
                            <option key={`b-pic-${p.funcionario_id}`} value="" disabled>
                              {(p.nome_guerra || p.nome).trim()} — {p.motivo_bloqueio || 'Indisponível'}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    {selectedPicId && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
                          Função: {picSelecionado?.role || 'a validar'}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold dark:border-slate-600"
                          style={{
                            borderColor: frmsPic?.hasAlert || isFrmsRelevant(frmsPic) ? '#fbbf24' : '#d1d5db',
                            backgroundColor: frmsPic?.hasAlert || isFrmsRelevant(frmsPic) ? '#fef3c7' : '#f9fafb',
                            color: frmsPic?.hasAlert || isFrmsRelevant(frmsPic) ? '#b45309' : '#4b5563',
                          }}>
                          {isFrmsRelevant(frmsPic) && <AlertTriangle className="h-3 w-3" />}
                          FRMS: {frmsPicLabel}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* SIC */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Copiloto <span className="text-slate-400 font-normal">SIC</span>
                </label>
                {loadingTripulantes ? (
                  <div className="animate-pulse space-y-2">
                    <div className="h-9 w-full bg-slate-200 rounded-lg dark:bg-slate-700" />
                    <div className="h-4 w-3/4 bg-slate-100 rounded dark:bg-slate-700" />
                  </div>
                ) : (
                  <>
                    <select
                      value={form.sic_id}
                      onChange={(e) => setForm((prev) => ({ ...prev, sic_id: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      disabled={!aeronaveSelecionada || bloqueioElegibilidade}
                    >
                      <option value="">Selecionar copiloto</option>
                      {sicCandidatos.map((p) => {
                        const frms = frmsUnavailable
                          ? '?'
                          : getFrmsRosterLabel(frmsByTripulante.get(Number(p.funcionario_id))).short;
                        const conflictNote = p.soft_conflict
                          ? p.conflict_code === 'FRMS_CRITICAL'
                            ? ' [!] FRMS'
                            : ' [!] Conflito'
                          : '';
                        return (
                          <option key={`sic-${p.funcionario_id}`} value={p.funcionario_id}>
                            {(p.nome_guerra || p.nome).trim()} — FRMS {frms}{conflictNote}
                          </option>
                        );
                      })}
                      {sicBloqueados.length > 0 && (
                        <optgroup label="Indisponíveis (bloqueados)">
                          {sicBloqueados.map((p) => (
                            <option key={`b-sic-${p.funcionario_id}`} value="" disabled>
                              {(p.nome_guerra || p.nome).trim()} — {p.motivo_bloqueio || 'Indisponível'}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    {selectedSicId && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
                          Função: {sicSelecionado?.role || 'a validar'}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold dark:border-slate-600"
                          style={{
                            borderColor: frmsSic?.hasAlert || isFrmsRelevant(frmsSic) ? '#fbbf24' : '#d1d5db',
                            backgroundColor: frmsSic?.hasAlert || isFrmsRelevant(frmsSic) ? '#fef3c7' : '#f9fafb',
                            color: frmsSic?.hasAlert || isFrmsRelevant(frmsSic) ? '#b45309' : '#4b5563',
                          }}>
                          {isFrmsRelevant(frmsSic) && <AlertTriangle className="h-3 w-3" />}
                          FRMS: {frmsSicLabel}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>

          {/* ── HORÁRIOS ── */}
          <section>
            <h4 className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
              Horários
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-500">
                  Apresentação <span className="text-slate-400">HH:MM</span>
                </label>
                <TimeInput
                  value={form.hora_apresentacao}
                  onChange={(value) => setForm((prev) => ({ ...prev, hora_apresentacao: value }))}
                  onBlur={() => handleHorarioBlur('hora_apresentacao', 'Apresentação')}
                  placeholder="06:00"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-center font-mono transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 placeholder:text-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-500">
                  Início <span className="text-slate-400">HH:MM</span>
                </label>
                <TimeInput
                  value={form.hora_decolagem_prevista}
                  onChange={(value) =>
                    setForm((prev) => ({ ...prev, hora_decolagem_prevista: value }))
                  }
                  onBlur={() => handleHorarioBlur('hora_decolagem_prevista', 'Início')}
                  placeholder="06:30"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-center font-mono transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 placeholder:text-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-500">
                  Término <span className="text-slate-400">HH:MM</span>
                </label>
                <TimeInput
                  value={form.hora_pouso_previsto}
                  onChange={(value) => setForm((prev) => ({ ...prev, hora_pouso_previsto: value }))}
                  onBlur={() => handleHorarioBlur('hora_pouso_previsto', 'Término')}
                  placeholder="07:15"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-center font-mono transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 placeholder:text-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>
          </section>

          {/* ── BASE E OBSERVAÇÕES ── */}
          <section>
            <h4 className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
              Base e observações
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-500">Base</label>
                <input
                  type="text"
                  value={form.base}
                  onChange={(e) => setForm((prev) => ({ ...prev, base: e.target.value.toUpperCase() }))}
                  placeholder="SBME"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 placeholder:text-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-500">Observações</label>
                <textarea
                  value={form.observacoes}
                  onChange={(e) => setForm((prev) => ({ ...prev, observacoes: e.target.value }))}
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 placeholder:text-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>
          </section>

          {/* ── ALERTAS E AVISOS (consolidados) ── */}
          {(aeronaveJaDesignada ||
            tripulantesRaw?.resumo?.sem_habilitacao ||
            picFallbackHeuristico ||
            sicFallbackHeuristico ||
            tripulantesError ||
            frmsUnavailable ||
            !escalaId ||
            picSelecionado?.soft_conflict ||
            sicSelecionado?.soft_conflict) && (
            <div className="space-y-2">
              {tripulantesRaw?.resumo?.sem_habilitacao && (
                <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
                  {tripulantesRaw.resumo.sem_habilitacao}
                </div>
              )}
              {(picFallbackHeuristico || sicFallbackHeuristico) && (
                <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
                  Cadastro de função não canônico para tripulação deste modelo. Fallback heurístico aplicado.
                </div>
              )}
              {tripulantesError && (
                <div className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                  <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
                  Disponibilidade/quinzena indisponível. Seleção de tripulantes bloqueada.
                </div>
              )}
              {frmsUnavailable && (
                <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
                  FRMS indisponível na data {formatDateBR(frmsReferenceDate)}. Status de fadiga indisponível.
                </div>
              )}
              {!escalaId && (
                <div className="flex items-start gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                  <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
                  Escala mensal não identificada para esta data; disponibilidade pode ficar restritiva.
                </div>
              )}
              {(picSelecionado?.soft_conflict || sicSelecionado?.soft_conflict) && (
                <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
                    <span className="font-semibold">Conflito com escala mensal:</span>
                  </div>
                  {picSelecionado?.soft_conflict && (
                    <p className="ml-5">• PIC: {picSelecionado.conflict_reason || 'Alocado em outra escala'}</p>
                  )}
                  {sicSelecionado?.soft_conflict && (
                    <p className="ml-5">• SIC: {sicSelecionado.conflict_reason || 'Alocado em outra escala'}</p>
                  )}
                  <p className="ml-5 text-amber-600 dark:text-amber-400">
                    A designação será salva com aviso. Registre a decisão nas observações.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── JUSTIFICATIVA FRMS ── */}
          {needsStructuredJustificativa && (
            <div className="animate-slide-down rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-800 dark:bg-amber-950/60">
              <div className="mb-1 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                  Justificativa operacional obrigatória
                </span>
              </div>
              <p className="mb-2 text-[11px] text-amber-700 dark:text-amber-400">
                Referência FRMS: {formatDateBR(frmsReferenceDate)} (escala para {formatDateBR(data)}).
              </p>
              {isFrmsRelevant(frmsPic) && picSelecionado && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  • PIC {(picSelecionado.nome_guerra || picSelecionado.nome).trim()}: {getFrmsReasonLine(frmsPic, frmsReferenceDate)}
                </p>
              )}
              {isFrmsRelevant(frmsSic) && sicSelecionado && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  • SIC {(sicSelecionado.nome_guerra || sicSelecionado.nome).trim()}: {getFrmsReasonLine(frmsSic, frmsReferenceDate)}
                </p>
              )}
              <textarea
                value={form.justificativa_operacional}
                onChange={(e) => setForm({ ...form, justificativa_operacional: e.target.value })}
                rows={3}
                className="mt-2 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm transition-colors focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 placeholder:text-slate-400 dark:border-amber-700 dark:bg-slate-800 dark:text-slate-100"
                placeholder="Descreva a decisão operacional sem incluir dados sensíveis do check-in (mín. 10 caracteres)."
              />
            </div>
          )}

          {/* ── ERROR / WARNINGS ── */}
          {error && (
            <div className="flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-300">
              <AlertTriangle className="h-4 w-4 mt-px shrink-0" />
              {error}
            </div>
          )}
          {warnings.length > 0 && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              <p className="font-medium">Avisos:</p>
              {warnings.map((w, i) => (
                <p key={i}>• {w}</p>
              ))}
            </div>
          )}

          {/* ── FOOTER ── */}
          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <Button
              type="submit"
              loading={submitting}
              disabled={
                submitting ||
                bloqueioElegibilidade ||
                aeronaveJaDesignada ||
                !aeronaveSelecionada
              }
            >
              {submitting ? 'Salvando...' : 'Salvar designação'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
