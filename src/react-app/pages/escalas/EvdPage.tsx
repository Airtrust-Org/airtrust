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
  Clock,
  Users,
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

export default function EvdPage() {
  const queryClient = useQueryClient();
  const [data, setData] = useState(toLocalDateStr(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotDetail, setSnapshotDetail] = useState<EvdPublicacaoDetalhe | null>(null);
  const [publishingDay, setPublishingDay] = useState(false);

  const { data: voosRaw, loading } = useApi<{ success: boolean; data: EvdVoo[] }>(
    `/api/evd?data=${data}`,
  );
  const voos = voosRaw?.data || [];
  const { data: publicacoesRaw, loading: loadingPublicacoes } = useApi<{
    success: boolean;
    data: EvdPublicacaoResumo[];
  }>(`/api/evd/publicacoes?data=${data}`);
  const publicacoes = publicacoesRaw?.data || [];
  const ultimaPublicacao = publicacoes[0] || null;
  const { data: frmsDailyRaw } = useApi<{
    success: boolean;
    data?: { items?: FrmsDailyFatigueItem[] };
  }>(`/api/frms/daily-fatigue?date=${data}&scope=team`);
  const { data: frmsAlertsRaw } = useApi<{
    success: boolean;
    data?: { items?: FrmsDailyFatigueAlertItem[] };
  }>(`/api/frms/daily-fatigue/alerts?date=${data}`);

  const selectedDate = new Date(data + 'T12:00:00');
  const weekday = WEEKDAY_LABELS[selectedDate.getDay()];
  const frmsDailyItems = frmsDailyRaw?.data?.items || [];
  const frmsAlertItems = frmsAlertsRaw?.data?.items || [];

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
        subtitle="Atribuição diária de tripulação por aeronave — PRC-OPS-009 §4.3"
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
            <Button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> Nova Atribuição
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
            onClose={() => setShowForm(false)}
            onCreated={() => {
              setShowForm(false);
              queryClient.invalidateQueries({ queryKey: ['/api/evd'] });
            }}
            frmsByTripulante={frmsByTripulante}
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
                onClick={() => setShowForm(true)}
                className="mt-4 text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                Adicionar primeira aeronave à escala
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Matrícula</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">Modelo</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Comandante (PIC)</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">FRMS</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Copiloto (SIC)</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">FRMS</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Apresentação</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">Início</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">Término</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">Base</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">Status</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-300">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {voos.map((voo) => {
                    const picSignal = toNumericId(voo.pic_id) ? frmsByTripulante.get(Number(voo.pic_id)) : null;
                    const sicSignal = toNumericId(voo.sic_id) ? frmsByTripulante.get(Number(voo.sic_id)) : null;
                    const hasFrmsAlert = isFrmsRelevant(picSignal) || isFrmsRelevant(sicSignal);
                    return (
                      <tr
                        key={voo.id}
                        className={[
                          'align-top transition-colors',
                          hasFrmsAlert ? 'bg-amber-50/40 dark:bg-amber-500/5' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
                        ].join(' ')}
                      >
                        {/* Matrícula */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded dark:bg-blue-500/10 dark:text-blue-300">
                            {voo.aeronave_prefixo || '—'}
                          </span>
                        </td>
                        {/* Modelo */}
                        <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {voo.aeronave_modelo || '—'}
                        </td>
                        {/* PIC */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="text-xs font-medium text-slate-800 dark:text-slate-100">
                            {voo.pic_guerra || voo.pic_nome || '—'}
                          </span>
                          {voo.pic_funcao && (
                            <span className="ml-1 text-[10px] text-slate-400">({voo.pic_funcao})</span>
                          )}
                          {voo.repouso_minimo_ok === 0 && (
                            <div className="mt-0.5 flex items-center gap-1 text-[10px] text-red-600">
                              <AlertTriangle className="h-3 w-3" /> Repouso &lt;12h30
                            </div>
                          )}
                        </td>
                        {/* FRMS PIC */}
                        <td className="px-3 py-3">
                          {picSignal ? (
                            <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${frmsTone(picSignal.status)}`}>
                              {picSignal.statusLabel}
                              {picSignal.requiresReview ? ' ⚑' : ''}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-300">—</span>
                          )}
                        </td>
                        {/* SIC */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="text-xs font-medium text-slate-800 dark:text-slate-100">
                            {voo.sic_guerra || voo.sic_nome || '—'}
                          </span>
                          {voo.sic_funcao && (
                            <span className="ml-1 text-[10px] text-slate-400">({voo.sic_funcao})</span>
                          )}
                        </td>
                        {/* FRMS SIC */}
                        <td className="px-3 py-3">
                          {sicSignal ? (
                            <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${frmsTone(sicSignal.status)}`}>
                              {sicSignal.statusLabel}
                              {sicSignal.requiresReview ? ' ⚑' : ''}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-300">—</span>
                          )}
                        </td>
                        {/* Apresentação */}
                        <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap dark:text-slate-300">
                          {voo.hora_apresentacao || '—'}
                        </td>
                        {/* Início */}
                        <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap dark:text-slate-300">
                          {voo.hora_decolagem_prevista || '—'}
                          {voo.hora_decolagem_real && (
                            <div className="text-[10px] text-emerald-600">R: {voo.hora_decolagem_real}</div>
                          )}
                        </td>
                        {/* Término */}
                        <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap dark:text-slate-300">
                          {voo.hora_pouso_previsto || '—'}
                          {voo.hora_pouso_real && (
                            <div className="text-[10px] text-emerald-600">R: {voo.hora_pouso_real}</div>
                          )}
                        </td>
                        {/* Base/Local */}
                        <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap dark:text-slate-300">
                          {voo.origem || '—'}
                        </td>
                        {/* Status */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${statusBadge(voo.status)}`}>
                            {voo.status}
                          </span>
                          {hasFrmsAlert && (
                            <div className="mt-0.5 flex items-center gap-0.5 text-[10px] text-amber-600">
                              <AlertTriangle className="h-3 w-3" /> revisão FRMS
                            </div>
                          )}
                        </td>
                        {/* Ações */}
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
  onClose,
  onCreated,
  frmsByTripulante,
}: {
  data: string;
  onClose: () => void;
  onCreated: () => void;
  frmsByTripulante: Map<number, FrmsTripulanteSignal>;
}) {
  const [form, setForm] = useState({
    pic_id: '',
    sic_id: '',
    aeronave_prefixo: '',
    hora_apresentacao: '',
    hora_decolagem_prevista: '',
    hora_pouso_previsto: '',
    origem: '',
    destino: '',
    tipo_missao: 'OFFSHORE',
    observacoes: '',
    justificativa_operacional: '',
  });
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Load funcionarios for picker
  const { data: funcRaw } = useApi<{
    data: { id: number; nome: string; guerra: string | null; funcao: string | null }[];
  }>('/api/funcionarios?limit=200&page=1&status=ativos&orderBy=nome&order=ASC');
  const pilotos = useMemo(() => {
    const all = funcRaw?.data || [];
    return all.filter((f) => {
      const fn = (f.funcao || '').toUpperCase();
      return (
        fn.includes('PILOT') || fn.includes('COMAND') || fn === 'PIC' || fn === 'SIC' || !f.funcao
      );
    });
  }, [funcRaw]);

  const selectedPicId = form.pic_id ? Number(form.pic_id) : null;
  const selectedSicId = form.sic_id ? Number(form.sic_id) : null;
  const frmsPic = selectedPicId ? frmsByTripulante.get(selectedPicId) : null;
  const frmsSic = selectedSicId ? frmsByTripulante.get(selectedSicId) : null;
  const needsStructuredJustificativa = isFrmsRelevant(frmsPic) || isFrmsRelevant(frmsSic);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setWarnings([]);
    setSubmitting(true);

    try {
      const picId = form.pic_id ? Number(form.pic_id) : null;
      const sicId = form.sic_id ? Number(form.sic_id) : null;
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
        pic_id: form.pic_id ? Number(form.pic_id) : undefined,
        sic_id: form.sic_id ? Number(form.sic_id) : undefined,
        aeronave_prefixo: form.aeronave_prefixo || undefined,
        hora_apresentacao: form.hora_apresentacao || undefined,
        hora_decolagem_prevista: form.hora_decolagem_prevista || undefined,
        hora_pouso_previsto: form.hora_pouso_previsto || undefined,
        origem: form.origem || undefined,
        destino: form.destino || undefined,
        tipo_missao: form.tipo_missao,
        observacoes: form.observacoes || undefined,
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
              'Voo criado, mas falhou ao registrar justificativa operacional estruturada.',
          );
          setSubmitting(false);
          return;
        }
        toast.success('Escala criada com justificativa operacional estruturada.');
      }

      onCreated();
    } catch (err) {
      setError('Erro de rede');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/30 p-5 shadow-sm dark:border-blue-500/30 dark:bg-blue-500/5">
      <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2 dark:text-slate-100">
        <Plus className="h-4 w-4 text-blue-600" />
        Nova Atribuição — {formatDateBR(data)}
      </h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Comandante */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Comandante (PIC)</label>
            <select
              value={form.pic_id}
              onChange={(e) => setForm({ ...form, pic_id: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Selecione</option>
              {pilotos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.guerra || p.nome} {p.funcao ? `(${p.funcao})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Copiloto */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Copiloto (SIC)</label>
            <select
              value={form.sic_id}
              onChange={(e) => setForm({ ...form, sic_id: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Selecione</option>
              {pilotos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.guerra || p.nome} {p.funcao ? `(${p.funcao})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Aeronave */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Aeronave (prefixo)</label>
            <input
              type="text"
              value={form.aeronave_prefixo}
              onChange={(e) => setForm({ ...form, aeronave_prefixo: e.target.value.toUpperCase() })}
              placeholder="PR-ABC"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {/* Hora apresentação */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Apresentação</label>
            <input
              type="time"
              value={form.hora_apresentacao}
              onChange={(e) => setForm({ ...form, hora_apresentacao: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {/* Início */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Início</label>
            <input
              type="time"
              value={form.hora_decolagem_prevista}
              onChange={(e) => setForm({ ...form, hora_decolagem_prevista: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {/* Término */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Término</label>
            <input
              type="time"
              value={form.hora_pouso_previsto}
              onChange={(e) => setForm({ ...form, hora_pouso_previsto: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {/* Base/Local */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Base / Local</label>
            <input
              type="text"
              value={form.origem}
              onChange={(e) => setForm({ ...form, origem: e.target.value.toUpperCase() })}
              placeholder="SBCB / Plataforma / Base"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {/* Localidade de operação */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Localidade de operação</label>
            <input
              type="text"
              value={form.destino}
              onChange={(e) => setForm({ ...form, destino: e.target.value.toUpperCase() })}
              placeholder="Plataforma / ICAO destino"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {/* Tipo de operação */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Tipo de operação</label>
            <select
              value={form.tipo_missao}
              onChange={(e) => setForm({ ...form, tipo_missao: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="OFFSHORE">Offshore</option>
              <option value="INSTRUCAO">Instrução</option>
              <option value="CHECK">Check</option>
              <option value="FERRY">Ferry</option>
              <option value="OUTRO">Outro</option>
            </select>
          </div>
        </div>

        {/* Observações */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Observações gerais</label>
          <textarea
            value={form.observacoes}
            onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        {needsStructuredJustificativa && (
          <div>
            <label className="block text-xs text-slate-500 mb-1">
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

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        {warnings.length > 0 && (
          <div className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
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
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition"
          >
            Cancelar
          </button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Criando...' : 'Criar Atribuição'}
          </Button>
        </div>
      </form>
    </div>
  );
}
