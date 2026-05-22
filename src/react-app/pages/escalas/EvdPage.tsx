/**
 * EvdPage — Escala Diária de Voo (EDV) — PRC-OPS-009 §4.3
 *
 * Atribuição diária de tripulação por aeronave. Estrutura por prefixo/matrícula,
 * não por voo/trecho. Visualização em tabela por aeronave com publicação versionada.
 */
import { useState, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Plane,
  Plus,
  Trash2,
  CheckCircle,
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Send,
  History,
  FileText,
  Printer,
  Settings,
  User,
  X,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import Button from '@/react-app/components/Button';
import { useApi } from '@/react-app/hooks/useApi';
import { apiFetch } from '@/react-app/lib/apiFetch';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

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

interface TripulanteOperacionalItem {
  funcionario_id: string;
  nome: string;
  nome_guerra: string | null;
  role: string;
  status_operacional: 'APTO' | 'ATENCAO_CMA' | 'ATENCAO_FRMS' | 'BLOQUEADO_CMA' | 'BLOQUEADO_FRMS';
  pode_ser_alocado: boolean;
  motivo_bloqueio?: string | null;
  quinzena?: string | null;
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

function isAeronaveAtiva(statusRaw: string | null | undefined): boolean {
  const meta = getAircraftStatusMeta(statusRaw);
  return meta.code !== 'I';
}

function getFrmsRosterLabel(signal: FrmsTripulanteSignal | null | undefined): {
  short: string;
  long: 'FRMS OK' | 'Atenção' | 'Revisão operacional' | 'Sem check-in' | 'Indisponível';
} {
  if (!signal) {
    return { short: 'SC', long: 'Sem check-in' };
  }
  if (signal.status === 'critical' || signal.status === 'unfit_for_duty') {
    return { short: 'REV', long: 'Revisão operacional' };
  }
  if (signal.status === 'attention') {
    return { short: 'ATN', long: 'Atenção' };
  }
  if (signal.status === 'not_submitted') {
    return { short: 'SC', long: 'Sem check-in' };
  }
  if (signal.requiresReview || signal.hasAlert) {
    return { short: 'REV', long: 'Revisão operacional' };
  }
  return { short: 'OK', long: 'FRMS OK' };
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

  let horaTexto = '';
  let minutoTexto = '';

  if (value.includes(':')) {
    const [h = '', m = ''] = value.split(':');
    if (!h || !m) return null;
    horaTexto = h;
    minutoTexto = m;
  } else {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 2) {
      horaTexto = digits;
      minutoTexto = '00';
    } else if (digits.length === 3) {
      horaTexto = digits.slice(0, 1);
      minutoTexto = digits.slice(1);
    } else if (digits.length === 4) {
      horaTexto = digits.slice(0, 2);
      minutoTexto = digits.slice(2);
    } else {
      return null;
    }
  }

  const hora = Number(horaTexto);
  const minuto = Number(minutoTexto);
  if (!Number.isInteger(hora) || !Number.isInteger(minuto)) return null;
  if (hora < 0 || hora > 23 || minuto < 0 || minuto > 59) return null;
  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}

export default function EvdPage() {
  const queryClient = useQueryClient();
  const [data, setData] = useState(toLocalDateStr(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [selectedAircraftForForm, setSelectedAircraftForForm] = useState('');
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotDetail, setSnapshotDetail] = useState<EvdPublicacaoDetalhe | null>(null);
  const [publishingDay, setPublishingDay] = useState(false);

  const { data: voosRaw, loading } = useApi<EvdVoo[]>(`/api/evd?data=${data}`);
  const voos = voosRaw || [];
  const { data: publicacoesRaw, loading: loadingPublicacoes } = useApi<EvdPublicacaoResumo[]>(
    `/api/evd/publicacoes?data=${data}`,
  );
  const publicacoes = publicacoesRaw || [];
  const ultimaPublicacao = publicacoes[0] || null;
  const { data: frmsDailyRaw, error: frmsDailyError } = useApi<{ items?: FrmsDailyFatigueItem[] }>(
    `/api/frms/daily-fatigue?date=${data}&scope=team`,
  );
  const { data: frmsAlertsRaw, error: frmsAlertsError } = useApi<{
    items?: FrmsDailyFatigueAlertItem[];
  }>(`/api/frms/daily-fatigue/alerts?date=${data}`);
  const { data: aeronavesRaw, loading: loadingAeronaves } = useApi<AeronaveAtiva[]>(
    '/api/aeronaves?somente_ativas=1',
  );

  const selectedDate = new Date(data + 'T12:00:00');
  const weekday = WEEKDAY_LABELS[selectedDate.getDay()];
  const frmsDailyItems = frmsDailyRaw?.items || [];
  const frmsAlertItems = frmsAlertsRaw?.items || [];
  const frmsUnavailable = Boolean(frmsDailyError || frmsAlertsError);
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

  const resumoAeronavesDoDia = useMemo(() => {
    const alocadasPorPrefixo = new Map(
      voos
        .map((item) => [normalizePrefixo(item.aeronave_prefixo), item] as const)
        .filter(([prefixo]) => prefixo.length > 0),
    );

    return aeronavesAtivas.map((aeronave) => {
      const prefixo = normalizePrefixo(aeronave.prefixo);
      const alocacao = alocadasPorPrefixo.get(prefixo);
      return {
        aeronave,
        alocacao,
      };
    });
  }, [aeronavesAtivas, voos]);

  function changeDay(delta: number) {
    const d = new Date(data + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    setData(toLocalDateStr(d));
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
        headers: { 'Content-Type': 'application/json' },
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

      queryClient.invalidateQueries({ queryKey: ['/api/evd'] });
      queryClient.invalidateQueries({ queryKey: [`/api/evd/publicacoes?data=${data}`] });
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
        headers: { 'Content-Type': 'application/json' },
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/evd'] });
      toast.success('Escala diária publicada');
    },
  });

  // Delete voo
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/evd/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao excluir');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/evd'] });
      toast.success('Registro removido');
    },
    onError: () => {
      toast.error('Erro ao excluir');
    },
  });

  async function handlePublish(voo: EvdVoo) {
    const picSignal = toNumericId(voo.pic_id) ? frmsByTripulante.get(Number(voo.pic_id)) : null;
    const sicSignal = toNumericId(voo.sic_id) ? frmsByTripulante.get(Number(voo.sic_id)) : null;
    const needsJustificativa = isFrmsRelevant(picSignal) || isFrmsRelevant(sicSignal);

    let publishPayload: { require_justificativa?: boolean; justificativa?: EvdJustificativaPayload } = {};
    if (needsJustificativa) {
      const existingRes = await apiFetch(`/api/evd/${voo.id}/justificativas`);
      const existingJson = (await existingRes.json().catch(() => ({}))) as {
        success?: boolean;
        data?: unknown[];
      };
      const hasStructured = existingRes.ok && existingJson.success && (existingJson.data || []).length > 0;

      if (!hasStructured) {
        const justificativaTxt = window.prompt(
          'FRMS requer revisão operacional para este tripulante. Informe justificativa operacional estruturada para publicar:',
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
                if (!selectedAircraftForForm && resumoAeronavesDoDia[0]?.aeronave?.prefixo) {
                  setSelectedAircraftForForm(normalizePrefixo(resumoAeronavesDoDia[0].aeronave.prefixo));
                }
                setShowForm(!showForm);
              }}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> Designar tripulação
            </Button>
          </div>
        }
      />

        {/* Subnavegação do módulo Escalas */}
        <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <NavLink
            to="/escalas"
            end
            className={({ isActive }) =>
              [
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap',
                isActive
                  ? 'bg-slate-900 text-white dark:bg-slate-700'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
              ].join(' ')
            }
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Escala Mensal
          </NavLink>
          <NavLink
            to="/escalas/diaria"
            className={({ isActive }) =>
              [
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap',
                isActive
                  ? 'bg-slate-900 text-white dark:bg-slate-700'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
              ].join(' ')
            }
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Escala Diária de Voo
          </NavLink>
          <NavLink
            to="/escalas/minha-escala"
            className={({ isActive }) =>
              [
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap',
                isActive
                  ? 'bg-slate-900 text-white dark:bg-slate-700'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
              ].join(' ')
            }
          >
            <User className="w-3.5 h-3.5" />
            Minha Escala
          </NavLink>
          <div className="ml-auto">
            <NavLink
              to="/escalas/configuracoes"
              className={({ isActive }) =>
                [
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap',
                  isActive
                    ? 'bg-slate-900 text-white dark:bg-slate-700'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                ].join(' ')
              }
            >
              <Settings className="w-3.5 h-3.5" />
              Configurações
            </NavLink>
          </div>
        </div>

      <div className="space-y-4">
        {/* Date navigation */}
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <button
            onClick={() => changeDay(-1)}
            className="p-2 rounded-lg hover:bg-slate-100 transition dark:hover:bg-slate-800"
          >
            <ChevronLeft className="h-5 w-5 text-slate-600" />
          </button>
          <div className="text-center">
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="text-lg font-bold text-slate-900 bg-transparent border-none text-center cursor-pointer dark:text-slate-100"
            />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {weekday}, {formatDateBR(data)}
            </p>
          </div>
          <button
            onClick={() => changeDay(1)}
            className="p-2 rounded-lg hover:bg-slate-100 transition dark:hover:bg-slate-800"
          >
            <ChevronRight className="h-5 w-5 text-slate-600" />
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Aeronaves do dia
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Selecione uma aeronave ativa para iniciar a designação
              </p>
            </div>
            <span className="text-xs text-slate-500">
              {resumoAeronavesDoDia.length} ativas
            </span>
          </div>
          {loadingAeronaves ? (
            <p className="text-sm text-slate-500">Carregando aeronaves ativas...</p>
          ) : resumoAeronavesDoDia.length === 0 ? (
            <div className="space-y-1">
              <p className="text-sm text-amber-700">Não há aeronaves ativas cadastradas para a empresa.</p>
              <p className="text-xs text-slate-500">
                Cadastre ou reative uma aeronave para montar a escala diária.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {resumoAeronavesDoDia.map(({ aeronave, alocacao }) => {
                const meta = getAircraftStatusMeta(aeronave.status);
                const prefixo = normalizePrefixo(aeronave.prefixo) || 'SEM-PREFIXO';
                return (
                  <button
                    key={`${aeronave.id}-${prefixo}`}
                    type="button"
                    onClick={() => {
                      setSelectedAircraftForForm(prefixo);
                      setShowForm(true);
                    }}
                    className="flex items-start justify-between rounded-xl border border-slate-200 px-3 py-2 text-left hover:border-slate-300 hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-mono text-sm font-semibold text-slate-900">{prefixo}</p>
                      <p className="text-xs text-slate-500">{aeronave.modelo || 'Modelo não informado'}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {alocacao
                          ? `${alocacao.pic_guerra || alocacao.pic_nome || 'PIC pendente'} / ${alocacao.sic_guerra || alocacao.sic_nome || 'SIC pendente'}`
                          : 'Sem tripulação designada'}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.tone}`}
                    >
                      {meta.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {frmsUnavailable && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            FRMS indisponível no momento. A escala segue visível, mas o status resumido de fadiga
            pode ficar incompleto.
          </div>
        )}

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
            <p className="text-sm text-slate-500">Carregando revisões...</p>
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
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4 shadow-sm">
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

        {/* Create form (simple inline) */}
        {showForm && (
          <EvdCreateForm
            data={data}
            selectedAircraftPrefix={selectedAircraftForForm}
            aeronavesAtivas={aeronavesAtivas}
            onClose={() => setShowForm(false)}
            onCreated={() => {
              setShowForm(false);
              setSelectedAircraftForForm('');
              queryClient.invalidateQueries({ queryKey: ['/api/evd'] });
            }}
            frmsByTripulante={frmsByTripulante}
            frmsUnavailable={frmsUnavailable}
          />
        )}

        {/* Tabela de atribuições por aeronave */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : voos.length === 0 ? (
            <div className="text-center py-20 text-slate-400 dark:text-slate-500">
              <Plane className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhuma aeronave escalada para {formatDateBR(data)}</p>
              <button
                onClick={() => {
                  if (resumoAeronavesDoDia[0]?.aeronave?.prefixo) {
                    setSelectedAircraftForForm(
                      normalizePrefixo(resumoAeronavesDoDia[0].aeronave.prefixo),
                    );
                  }
                  setShowForm(true);
                }}
                className="mt-4 text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                Designar primeira aeronave
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                Fadiga (F): `OK` = FRMS OK, `ATN` = Atenção, `REV` = Revisão operacional, `SC`
                = Sem check-in, `IND` = FRMS indisponível.
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
                    const picFrms = frmsUnavailable
                      ? { short: 'IND', long: 'Indisponível' as const }
                      : getFrmsRosterLabel(picSignal);
                    const sicFrms = frmsUnavailable
                      ? { short: 'IND', long: 'Indisponível' as const }
                      : getFrmsRosterLabel(sicSignal);
                    const prefixoNormalizado = normalizePrefixo(voo.aeronave_prefixo);
                    const aeronaveCadastro = aeronavesByPrefix.get(prefixoNormalizado);
                    const statusAnv = getAircraftStatusMeta(aeronaveCadastro?.status);
                    return (
                      <tr
                        key={voo.id}
                        className={[
                          'align-top transition-colors',
                          hasFrmsAlert ? 'bg-amber-50/40 dark:bg-amber-500/5' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
                        ].join(' ')}
                      >
                        <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">
                          {voo.aeronave_modelo || aeronaveCadastro?.modelo || '—'}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded dark:bg-blue-500/10 dark:text-blue-300">
                            {voo.aeronave_prefixo || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${statusAnv.tone}`}>
                            {statusAnv.code}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="text-xs font-medium text-slate-800 dark:text-slate-100">
                            {voo.pic_guerra || voo.pic_nome || '—'}
                          </span>
                          {voo.repouso_minimo_ok === 0 && (
                            <div className="mt-0.5 flex items-center gap-1 text-[10px] text-red-600">
                              <AlertTriangle className="h-3 w-3" /> Repouso &lt;12h30
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                            {picFrms.short}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{voo.pic_funcao || 'a validar'}</td>
                        <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">PIC</td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="text-xs font-medium text-slate-800 dark:text-slate-100">
                            {voo.sic_guerra || voo.sic_nome || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                            {sicFrms.short}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{voo.sic_funcao || 'a validar'}</td>
                        <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">SIC</td>
                        <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{voo.origem || '—'}</td>
                        <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{voo.hora_apresentacao || '—'}</td>
                        <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{voo.hora_decolagem_prevista || '—'}</td>
                        <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{voo.hora_pouso_previsto || '—'}</td>
                        <td className="px-3 py-3 text-xs text-slate-600">
                          <div>{voo.observacoes || '—'}</div>
                          {hasFrmsAlert && (
                            <div className="mt-0.5 flex items-center gap-0.5 text-[10px] text-amber-600">
                              <AlertTriangle className="h-3 w-3" /> revisão FRMS
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            {voo.status === 'RASCUNHO' && (
                              <>
                                <button
                                  onClick={() => handlePublish(voo)}
                                  disabled={publicarMutation.isPending}
                                  className="flex items-center gap-1 text-[11px] text-emerald-600 hover:text-emerald-800 transition px-2 py-1 rounded hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                                >
                                  <Send className="h-3 w-3" /> Publicar
                                </button>
                                <button
                                  onClick={() => deleteMutation.mutate(voo.id)}
                                  disabled={deleteMutation.isPending}
                                  className="flex items-center gap-1 text-[11px] text-red-500 hover:text-red-700 transition px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-500/10"
                                >
                                  <Trash2 className="h-3 w-3" /> Excluir
                                </button>
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
  onClose,
  onCreated,
  frmsByTripulante,
  frmsUnavailable,
}: {
  data: string;
  selectedAircraftPrefix: string;
  aeronavesAtivas: AeronaveAtiva[];
  onClose: () => void;
  onCreated: () => void;
  frmsByTripulante: Map<number, FrmsTripulanteSignal>;
  frmsUnavailable: boolean;
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

  const aeronaveSelecionada = useMemo(() => {
    const alvo = normalizePrefixo(form.aeronave_prefixo);
    return aeronavesAtivas.find((item) => normalizePrefixo(item.prefixo) === alvo) || null;
  }, [aeronavesAtivas, form.aeronave_prefixo]);

  const tripulantesUrl = aeronaveSelecionada
    ? `/api/escalas/tripulantes-operacionais?aeronave_id=${aeronaveSelecionada.id}&incluir_bloqueados=true&data_inicio=${data}&data_fim=${data}&quinzena=${quinzena}`
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

  const frmsPicLabel = frmsUnavailable ? 'FRMS indisponível' : getFrmsRosterLabel(frmsPic).long;
  const frmsSicLabel = frmsUnavailable ? 'FRMS indisponível' : getFrmsRosterLabel(frmsSic).long;

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
        setError(
          'FRMS requer revisão operacional para PIC/SIC selecionado. Informe justificativa operacional (mínimo 10 caracteres).',
        );
        setSubmitting(false);
        return;
      }

      const body = {
        data,
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
        headers: { 'Content-Type': 'application/json' },
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
          headers: { 'Content-Type': 'application/json' },
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
        toast.success('Escala criada com justificativa operacional estruturada.');
      }

      onCreated();
    } catch {
      setError('Erro de rede');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/20 p-4 shadow-sm dark:border-blue-500/30 dark:bg-blue-500/5">
      <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
        <Plus className="h-4 w-4 text-blue-600" />
        Designar tripulação para aeronave — {formatDateBR(data)}
      </h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Aeronave</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-slate-500">Aeronave ativa (obrigatório)</label>
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
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  required
                >
                  <option value="">Selecione</option>
                  {aeronavesAtivas.map((aeronave) => {
                    const prefixo = normalizePrefixo(aeronave.prefixo);
                    const meta = getAircraftStatusMeta(aeronave.status);
                    return (
                      <option key={aeronave.id} value={prefixo}>
                        {prefixo} — {aeronave.modelo || 'Sem modelo'} ({meta.label})
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Status</label>
                <input
                  type="text"
                  value={
                    aeronaveSelecionada ? getAircraftStatusMeta(aeronaveSelecionada.status).label : '—'
                  }
                  readOnly
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Modelo</label>
                <input
                  type="text"
                  value={aeronaveSelecionada?.modelo || '—'}
                  readOnly
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Quinzena operacional</label>
                <input
                  type="text"
                  value={quinzena === 'primeira' ? '1ª' : '2ª'}
                  readOnly
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                />
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tripulação</h4>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="mb-1 block text-xs text-slate-500">PIC</label>
                <select
                  value={form.pic_id}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      pic_id: e.target.value,
                      sic_id: prev.sic_id === e.target.value ? '' : prev.sic_id,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  disabled={!aeronaveSelecionada || bloqueioElegibilidade || loadingTripulantes}
                >
                  <option value="">Selecione</option>
                  {picCandidatos.map((p) => {
                    const frms = frmsUnavailable
                      ? 'FRMS indisponível'
                      : getFrmsRosterLabel(frmsByTripulante.get(Number(p.funcionario_id))).long;
                    return (
                      <option key={p.funcionario_id} value={p.funcionario_id}>
                        {(p.nome_guerra || p.nome).trim()} ({p.role || 'a validar'}) — {frms}
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
                <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-600">
                  <span className="rounded bg-slate-100 px-2 py-0.5">
                    Qualificação: {picSelecionado?.role || 'a validar'}
                  </span>
                  <span className="rounded bg-slate-100 px-2 py-0.5">Assento: PIC</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5">
                    FRMS: {selectedPicId ? frmsPicLabel : '—'}
                  </span>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-500">SIC</label>
                <select
                  value={form.sic_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, sic_id: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  disabled={!aeronaveSelecionada || bloqueioElegibilidade || loadingTripulantes}
                >
                  <option value="">Selecione</option>
                  {sicCandidatos.map((p) => {
                    const frms = frmsUnavailable
                      ? 'FRMS indisponível'
                      : getFrmsRosterLabel(frmsByTripulante.get(Number(p.funcionario_id))).long;
                    return (
                      <option key={`sic-${p.funcionario_id}`} value={p.funcionario_id}>
                        {(p.nome_guerra || p.nome).trim()} ({p.role || 'a validar'}) — {frms}
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
                <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-600">
                  <span className="rounded bg-slate-100 px-2 py-0.5">
                    Qualificação: {sicSelecionado?.role || 'a validar'}
                  </span>
                  <span className="rounded bg-slate-100 px-2 py-0.5">Assento: SIC</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5">
                    FRMS: {selectedSicId ? frmsSicLabel : '—'}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Horários</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs text-slate-500">Apresentação</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.hora_apresentacao}
                  onChange={(e) => setForm((prev) => ({ ...prev, hora_apresentacao: e.target.value }))}
                  onBlur={() => handleHorarioBlur('hora_apresentacao', 'Apresentação')}
                  placeholder="0730 ou 07:30"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Início</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.hora_decolagem_prevista}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, hora_decolagem_prevista: e.target.value }))
                  }
                  onBlur={() => handleHorarioBlur('hora_decolagem_prevista', 'Início')}
                  placeholder="0730 ou 07:30"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Término</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.hora_pouso_previsto}
                  onChange={(e) => setForm((prev) => ({ ...prev, hora_pouso_previsto: e.target.value }))}
                  onBlur={() => handleHorarioBlur('hora_pouso_previsto', 'Término')}
                  placeholder="0730 ou 07:30"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Base e observações
            </h4>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Base</label>
              <input
                type="text"
                value={form.base}
                onChange={(e) => setForm((prev) => ({ ...prev, base: e.target.value.toUpperCase() }))}
                placeholder="SBCB / Base"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Observações</label>
              <textarea
                value={form.observacoes}
                onChange={(e) => setForm((prev) => ({ ...prev, observacoes: e.target.value }))}
                rows={2}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </section>
        </div>

        {tripulantesRaw?.resumo?.sem_habilitacao && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {tripulantesRaw.resumo.sem_habilitacao}
          </div>
        )}

        {(picFallbackHeuristico || sicFallbackHeuristico) && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Cadastro de função não canônico para toda a tripulação elegível deste modelo. Foi
            aplicado fallback heurístico com validação operacional.
          </div>
        )}

        {tripulantesError && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
            Disponibilidade/quinzena indisponível para validação. Seleção de tripulantes bloqueada
            para evitar escala cega.
          </div>
        )}

        {frmsUnavailable && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            FRMS indisponível. O status exibido será “FRMS indisponível” até retorno do serviço.
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs text-slate-500">Observações</label>
          <textarea
            value={form.observacoes}
            onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        {needsStructuredJustificativa && (
          <div>
            <label className="mb-1 block text-xs text-slate-500">
              Justificativa operacional FRMS (estruturada)
            </label>
            <textarea
              value={form.justificativa_operacional}
              onChange={(e) => setForm({ ...form, justificativa_operacional: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-amber-300 bg-amber-50/40 px-3 py-2 text-sm"
              placeholder="Descreva decisão operacional sem incluir dados sensíveis do check-in."
            />
          </div>
        )}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        {warnings.length > 0 && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            <p className="font-medium">Avisos:</p>
            {warnings.map((w, i) => (
              <p key={i}>• {w}</p>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 transition hover:text-slate-900"
          >
            Cancelar
          </button>
          <Button type="submit" disabled={submitting || bloqueioElegibilidade}>
            {submitting ? 'Salvando...' : 'Salvar designação'}
          </Button>
        </div>
      </form>
    </div>
  );
}
