import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarRange,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  Save,
  Upload,
  Users,
} from 'lucide-react';
import { apiJson, frontendErrorMessage } from '@/react-app/lib/api-contract';
import { showToast } from '@/react-app/utils/toast';

type PlanningStatus =
  | 'PROPOSTO'
  | 'PLANEJADO'
  | 'AGUARDANDO_DISPONIBILIDADE'
  | 'CONFIRMADO'
  | 'AGENDADO'
  | 'REALIZADO'
  | 'REPLANEJAR'
  | 'CANCELADO';

type WindowPolicy = 'FOLGA' | 'QUINZENA_ATIVA' | 'AMBOS';
type WindowType = 'FOLGA' | 'QUINZENA_ATIVA';

type Participant = {
  funcionario_id: number;
  funcionario_nome: string;
  funcionario_funcao: string | null;
  funcionario_quinzena: string | null;
};

type PlanningItem = {
  id: number;
  empresa_id?: number;
  qualificacao_tipo_id: number;
  qualificacao_codigo: string | null;
  qualificacao_nome: string | null;
  data_prevista: string;
  data_inicio: string | null;
  data_fim: string | null;
  status: string;
  titulo: string | null;
  observacoes: string | null;
  carga_horaria_prevista: number | null;
  planejamento_status: PlanningStatus;
  planejamento_editado_manualmente: number;
  planejamento_aprovacao_status?: 'RASCUNHO' | 'PENDENTE' | 'APROVADO' | 'DEVOLVIDO' | 'NAO_EXIGIDO';
  planejamento_aprovacao_observacoes?: string | null;
  planejamento_aprovado_por?: number | null;
  planejamento_aprovado_em?: string | null;
  planejamento_vencimento_referencia: string | null;
  planejamento_margem_dias: number | null;
  planejamento_quinzena_numero: number | null;
  planejamento_politica_janela: WindowPolicy | null;
  planejamento_tipo_janela: WindowType | null;
  planejamento_janela_inicio: string | null;
  planejamento_janela_fim: string | null;
  planejamento_modelo_aeronave: string | null;
  planejamento_conflitos: unknown;
  planejamento_snapshot: {
    curriculum?: {
      estimated_session_count?: number | null;
      typical_session_minutes?: number | null;
      models?: Array<{ codigo?: string; nome?: string; duracao_estimada?: number | null }>;
    };
    participants?: Array<{ funcionario_id?: number; vencimento?: string }>;
  } | null;
  updated_at?: string | null;
  planejamento_recalculado_em?: string | null;
  participantes: Participant[];
};

type DraftRow = {
  status: PlanningStatus;
  dataPrevista: string;
  janelaInicio: string;
  janelaFim: string;
};

type PreviewProposal = {
  need_id?: string;
  status: PlanningStatus;
  qualificacao_tipo_id: number;
  qualificacao_codigo: string | null;
  qualificacao_nome: string | null;
  modelo_aeronave: string;
  vencimento_referencia: string;
  janela_tipo: WindowType | null;
  janela_inicio: string | null;
  janela_fim: string | null;
  carga_horaria_prevista: number | null;
  curriculo: {
    estimated_session_count?: number | null;
    typical_session_minutes?: number | null;
  } | null;
  participantes: Array<{
    funcionario_id: number;
    funcionario_nome: string;
    funcionario_funcao: string | null;
    funcionario_quinzena: number | null;
    vencimento: string;
  }>;
};

type CaeAvailabilitySlot = {
  external_ref?: string | null;
  equipment: 'AW139' | 'SK76';
  date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  duration_minutes: number;
  state: 'OFFERED' | 'CONFIRMED' | 'HELD' | 'UNKNOWN';
  company?: string | null;
  confidence: number;
  source_ref?: { page?: number | null; section?: string | null } | null;
};

type CaeAvailabilityValidation = {
  document: {
    schema_version: 'airtrust.cae_availability.v1';
    provider: 'CAE';
    slots: CaeAvailabilitySlot[];
    warnings: string[];
  };
  warnings: Array<{ path: string; code: string; message: string }>;
  mode: 'PREVIEW_ONLY';
};


type CaePlanningRecommendation = PreviewProposal & {
  need_id: string;
  match_status: 'MATCHED' | 'INSUFFICIENT_AVAILABILITY' | 'INVALID_NEED';
  selected_slots: CaeAvailabilitySlot[];
  assignments: Array<{
    session_index: number;
    session_duration_minutes: number;
    slot_key: string;
  }>;
  outside_preferred_window: boolean;
  total_required_minutes: number;
  total_reserved_minutes: number;
  unused_reserved_minutes: number;
  latest_training_date: string | null;
  days_before_expiry: number | null;
  reasons: string[];
  conflicts: Array<Record<string, unknown>>;
  requires_human_review: boolean;
};

type CaePlanningComparison = {
  mode: 'PREVIEW_ONLY';
  data_referencia: string;
  availability_warnings: Array<{ path: string; code: string; message: string }>;
  recommendations: CaePlanningRecommendation[];
  remaining_slots: CaeAvailabilitySlot[];
  summary: {
    total_needs: number;
    matched: number;
    insufficient: number;
    invalid_needs: number;
    with_conflicts: number;
    outside_preferred_window: number;
  };
};

type CaeAvailabilityImportPayload = {
  status: 'RECEBIDO' | 'EXTRAIDO' | 'AGUARDANDO_REVISAO' | 'VALIDADO' | 'REJEITADO';
  document: CaeAvailabilityValidation['document'] | null;
  warnings: Array<{ path: string; code: string; message: string }>;
  errors: Array<{ path: string; code: string; message: string }>;
  requires_human_review: boolean;
  source_file_name: string;
};

const STATUS_OPTIONS: Array<{ value: PlanningStatus; label: string }> = [
  { value: 'PROPOSTO', label: 'Proposto' },
  { value: 'PLANEJADO', label: 'Planejado' },
  { value: 'AGUARDANDO_DISPONIBILIDADE', label: 'Aguardando disponibilidade' },
  { value: 'CONFIRMADO', label: 'Confirmado' },
  { value: 'AGENDADO', label: 'Agendado' },
  { value: 'REALIZADO', label: 'Realizado' },
  { value: 'REPLANEJAR', label: 'Replanejar' },
  { value: 'CANCELADO', label: 'Cancelado' },
];

const inputClass =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

function addDaysIso(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function endOfYearIso(value: Date) {
  return `${value.getFullYear()}-12-31`;
}

function formatDate(value?: string | null) {
  const raw = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '—';
  const [year, month, day] = raw.split('-');
  return `${day}/${month}/${year}`;
}

function conflictsCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function filenameDate() {
  return new Date().toISOString().slice(0, 10);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function sessionDescription(item: PlanningItem) {
  const count = item.planejamento_snapshot?.curriculum?.estimated_session_count;
  const minutes = item.planejamento_snapshot?.curriculum?.typical_session_minutes;
  if (count && minutes) return `${count} × ${minutes} min`;
  if (count) return `${count} sessão${count === 1 ? '' : 'ões'}`;
  return 'Conforme currículo';
}

function participantNames(item: PlanningItem) {
  return item.participantes.map((participant) => participant.funcionario_nome).join(' + ');
}

export default function PlanejamentoSimuladores() {
  const now = useMemo(() => new Date(), []);
  const [inicio, setInicio] = useState(() => addDaysIso(now, 0));
  const [fim, setFim] = useState(() => endOfYearIso(now));
  const [margem, setMargem] = useState('');
  const [windowPolicy, setWindowPolicy] = useState<WindowPolicy>('FOLGA');
  const [statusFilter, setStatusFilter] = useState('');
  const [items, setItems] = useState<PlanningItem[]>([]);
  const [drafts, setDrafts] = useState<Record<number, DraftRow>>({});
  const [loading, setLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewProposal[]>([]);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [devolverObs, setDevolverObs] = useState<Record<number, string>>({});
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);
  const [caeUploadName, setCaeUploadName] = useState<string | null>(null);
  const [caeValidating, setCaeValidating] = useState(false);
  const [caeComparing, setCaeComparing] = useState(false);
  const [caeValidation, setCaeValidation] = useState<CaeAvailabilityValidation | null>(null);
  const [caeComparison, setCaeComparison] = useState<CaePlanningComparison | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const query = new URLSearchParams({ inicio, fim });
      if (statusFilter) query.set('status', statusFilter);
      const data = await apiJson<PlanningItem[]>(
        `/api/simuladores/planejamento?${query.toString()}`,
      );
      setItems(Array.isArray(data) ? data : []);
      setDrafts(
        Object.fromEntries(
          (Array.isArray(data) ? data : []).map((item) => [
            item.id,
            {
              status: item.planejamento_status,
              dataPrevista: item.data_prevista || '',
              janelaInicio: item.planejamento_janela_inicio || '',
              janelaFim: item.planejamento_janela_fim || '',
            },
          ]),
        ),
      );
    } catch (error) {
      showToast.error(frontendErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [fim, inicio, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const planningInput = () => {
    if (!inicio || !fim || inicio > fim) {
      showToast.error('Informe um intervalo de vencimento válido.');
      return null;
    }
    const marginNumber = margem.trim() === '' ? null : Number(margem);
    if (marginNumber !== null && (!Number.isInteger(marginNumber) || marginNumber < 0)) {
      showToast.error('A margem deve ser um número inteiro não negativo ou ficar em branco.');
      return null;
    }
    return {
      vencimento_inicio: inicio,
      vencimento_fim: fim,
      margem_dias: marginNumber,
      politica_janela: windowPolicy,
    };
  };

  const previewPlanning = async () => {
    const input = planningInput();
    if (!input) return;
    try {
      setPreviewing(true);
      const result = await apiJson<{
        candidatos: number;
        pares: number;
        pendencias: number;
        preservados: number;
        propostas: PreviewProposal[];
      }>('/api/simuladores/planejamento/recalcular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, dry_run: true }),
      });
      setPreview(Array.isArray(result.propostas) ? result.propostas : []);
      showToast.success(
        `Prévia: ${result.candidatos} tripulante(s), ${result.pares} dupla(s) e ${result.pendencias} pendência(s). Nenhum dado foi alterado.`,
      );
    } catch (error) {
      showToast.error(frontendErrorMessage(error));
    } finally {
      setPreviewing(false);
    }
  };

  const recalculate = async () => {
    const input = planningInput();
    if (!input) return;
    try {
      setRecalculating(true);
      const result = await apiJson<{
        candidatos: number;
        pares: number;
        pendencias: number;
        preservados: number;
      }>('/api/simuladores/planejamento/recalcular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      showToast.success(
        `Planejamento recalculado: ${result.pares} dupla(s), ${result.pendencias} pendência(s), ${result.preservados} edição(ões) preservada(s).`,
      );
      setPreview([]);
      await load();
    } catch (error) {
      showToast.error(frontendErrorMessage(error));
    } finally {
      setRecalculating(false);
    }
  };

  const uploadCaePdf = async (file: File | null) => {
    if (!file) return;
    if (!file.type.toLowerCase().includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      showToast.error('Selecione o PDF recebido da CAE.');
      return;
    }

    const form = new FormData();
    form.append('file', file);

    try {
      setCaeValidating(true);
      setCaeUploadName(file.name);
      const imported = await apiJson<CaeAvailabilityImportPayload>(
        '/api/simuladores/planejamento/cae-disponibilidade/importar',
        { method: 'POST', body: form },
      );
      if (!imported.document) {
        setCaeValidation(null);
        setCaeComparison(null);
        showToast.warning('PDF recebido, mas sem documento validado para comparação.');
        return;
      }
      setCaeValidation({
        document: imported.document,
        warnings: imported.warnings,
        mode: 'PREVIEW_ONLY',
      });
      setCaeComparison(null);
      showToast.success(
        `PDF processado: ${imported.document.slots.length} slot(s) CAE normalizados.`,
      );
    } catch (error) {
      setCaeUploadName(file.name);
      setCaeValidation(null);
      setCaeComparison(null);
      showToast.error(frontendErrorMessage(error));
    } finally {
      setCaeValidating(false);
    }
  };


  const compareCaeWithNeeds = async () => {
    const input = planningInput();
    if (!input) return;
    if (!caeValidation) {
      showToast.error('Valide primeiro a disponibilidade CAE.');
      return;
    }
    try {
      setCaeComparing(true);
      const result = await apiJson<{
        candidatos: number;
        pares: number;
        pendencias: number;
        propostas: PreviewProposal[];
        cae_comparison: CaePlanningComparison | null;
      }>('/api/simuladores/planejamento/recalcular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...input,
          dry_run: true,
          data_referencia: new Date().toISOString().slice(0, 10),
          cae_availability: caeValidation.document,
        }),
      });
      setPreview(Array.isArray(result.propostas) ? result.propostas : []);
      setCaeComparison(result.cae_comparison);
      const summary = result.cae_comparison?.summary;
      if (summary) {
        showToast.success(
          `Comparação CAE: ${summary.matched}/${summary.total_needs} necessidade(s) atendida(s), ${summary.with_conflicts} com conflito(s). Nenhum dado foi alterado.`,
        );
      }
    } catch (error) {
      setCaeComparison(null);
      showToast.error(frontendErrorMessage(error));
    } finally {
      setCaeComparing(false);
    }
  };

  
  const handleSubmeter = async (id: number) => {
    if (!window.confirm('Enviar proposta para aprovação?')) return;
    setActioningId(id);
    try {
      await apiJson(`/api/simuladores/planejamento/${id}/submeter`, { method: 'POST' });
      await load();
    } catch (error) {
      showToast.error(frontendErrorMessage(error));
    } finally {
      setActioningId(null);
    }
  };

  const handleAprovar = async (id: number) => {
    if (!window.confirm('Confirma a aprovação desta proposta CAE? O status será alterado para APROVADO.')) return;
    setActioningId(id);
    try {
      await apiJson(`/api/simuladores/planejamento/${id}/aprovar`, { method: 'POST' });
      await load();
    } catch (error: unknown) {
      alert('Erro ao aprovar proposta: ' + frontendErrorMessage(error));
    } finally {
      setActioningId(null);
    }
  };

  const handleDevolver = async (id: number) => {
    const obs = devolverObs[id] || '';
    if (!obs) {
      alert('Informe o motivo da devolução antes de continuar.');
      return;
    }
    setActioningId(id);
    try {
      await apiJson(`/api/simuladores/planejamento/${id}/devolver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ observacoes: obs }),
      });
      await load();
    } catch (error: unknown) {
      alert('Erro ao devolver proposta: ' + frontendErrorMessage(error));
    } finally {
      setActioningId(null);
    }
  };

  const updateDraft = (id: number, patch: Partial<DraftRow>) => {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  };

  const saveRow = async (item: PlanningItem) => {
    const draft = drafts[item.id];
    if (!draft) return;
    try {
      setSavingId(item.id);
      await apiJson(`/api/simuladores/planejamento/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planejamento_status: draft.status,
          data_prevista: draft.dataPrevista,
          janela_inicio: draft.janelaInicio || null,
          janela_fim: draft.janelaFim || null,
        }),
      });
      showToast.success(
        'Planejamento atualizado. Edições manuais serão preservadas no próximo recálculo.',
      );
      await load();
    } catch (error) {
      showToast.error(frontendErrorMessage(error));
    } finally {
      setSavingId(null);
    }
  };

  const exportExcel = async () => {
    try {
      setExporting('excel');
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'AirTrust';
      const summary = workbook.addWorksheet('Resumo');
      const plannedHours = items.reduce(
        (sum, item) => sum + Number(item.carga_horaria_prevista || 0),
        0,
      );
      summary.addRows([
        ['Relatório', 'Planejamento Futuro de Simuladores'],
        ['Vencimentos', `${formatDate(inicio)} a ${formatDate(fim)}`],
        ['Margem pré-vencimento', margem.trim() === '' ? 'Sem margem fixa' : `${margem} dias`],
        [
          'Política de janela',
          windowPolicy === 'FOLGA'
            ? 'Folga'
            : windowPolicy === 'QUINZENA_ATIVA'
              ? 'Quinzena ativa'
              : 'Folga ou quinzena ativa',
        ],
        ['Registros', items.length],
        ['Carga prevista (h)', plannedHours],
        ['Gerado em', new Date().toLocaleString('pt-BR')],
      ]);
      summary.getColumn(1).font = { bold: true };
      summary.getColumn(1).width = 28;
      summary.getColumn(2).width = 60;

      const sheet = workbook.addWorksheet('Planejamento', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });
      sheet.columns = [
        { header: 'Status', key: 'status', width: 28 },
        { header: 'Vencimento', key: 'expiry', width: 15 },
        { header: 'Qualificação', key: 'qualification', width: 34 },
        { header: 'Aeronave', key: 'aircraft', width: 16 },
        { header: 'Tripulação', key: 'crew', width: 52 },
        { header: 'Quinzena', key: 'fortnight', width: 12 },
        { header: 'Tipo de janela', key: 'windowType', width: 18 },
        { header: 'Janela', key: 'window', width: 28 },
        { header: 'Data prevista', key: 'planned', width: 15 },
        { header: 'Carga (h)', key: 'hours', width: 12 },
        { header: 'Sessões', key: 'sessions', width: 22 },
        { header: 'Conflitos escala', key: 'conflicts', width: 18 },
        { header: 'Editado manualmente', key: 'manual', width: 20 },
      ];
      sheet.getRow(1).font = { bold: true };
      sheet.autoFilter = { from: 'A1', to: 'M1' };
      for (const item of items) {
        sheet.addRow({
          status: STATUS_OPTIONS.find((option) => option.value === item.planejamento_status)?.label,
          expiry: formatDate(item.planejamento_vencimento_referencia),
          qualification: item.qualificacao_nome || item.qualificacao_codigo || '-',
          aircraft: item.planejamento_modelo_aeronave || '-',
          crew: participantNames(item) || 'Aguardando dupla',
          fortnight: item.planejamento_quinzena_numero || '-',
          windowType:
            item.planejamento_tipo_janela === 'FOLGA'
              ? 'Folga'
              : item.planejamento_tipo_janela === 'QUINZENA_ATIVA'
                ? 'Quinzena ativa'
                : 'A definir',
          window:
            item.planejamento_janela_inicio && item.planejamento_janela_fim
              ? `${formatDate(item.planejamento_janela_inicio)} a ${formatDate(item.planejamento_janela_fim)}`
              : 'A definir',
          planned: formatDate(item.data_prevista),
          hours: item.carga_horaria_prevista,
          sessions: sessionDescription(item),
          conflicts: conflictsCount(item.planejamento_conflitos),
          manual: item.planejamento_editado_manualmente ? 'Sim' : 'Não',
        });
      }
      const buffer = await workbook.xlsx.writeBuffer();
      downloadBlob(
        new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        `planejamento-simuladores-${filenameDate()}.xlsx`,
      );
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Falha ao exportar Excel.');
    } finally {
      setExporting(null);
    }
  };

  const exportPdf = async () => {
    try {
      setExporting('pdf');
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text('Planejamento Futuro de Simuladores', margin, 13);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Vencimentos: ${formatDate(inicio)} a ${formatDate(fim)}`, margin, 19);
      doc.text(
        `Margem: ${margem.trim() === '' ? 'sem margem fixa' : `${margem} dias`} | Política: ${windowPolicy === 'FOLGA' ? 'Folga' : windowPolicy === 'QUINZENA_ATIVA' ? 'Quinzena ativa' : 'Ambos'} | Registros: ${items.length}`,
        margin,
        24,
      );

      const widths = [12, 22, 22, 40, 45, 20, 25, 20, 20, 44];
      const headers = [
        'ID',
        'Status',
        'Aprovação',
        'Qualificação',
        'Tripulação (Escala)',
        'Sessões',
        'Equipamento',
        'CAE Datas',
        'Vencimento',
        'Notas',
      ];
      const drawHeader = (startY: number) => {
        let x = margin;
        doc.setFillColor(232, 237, 243);
        doc.rect(
          margin,
          startY,
          widths.reduce((sum, width) => sum + width, 0),
          7,
          'F',
        );
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        headers.forEach((header, index) => {
          doc.text(header, x + 1, startY + 4.7);
          x += widths[index];
        });
        return startY + 7;
      };

      let y = drawHeader(30);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      for (const item of items) {
        const snap = (item.planejamento_snapshot || {}) as {
          mode?: 'NORMAL' | 'COMPARTILHADA';
          generated_at?: string;
          participants?: Array<{
            employee_id?: number;
            funcionario_id?: number;
            qualification_expiry_date?: string;
            vencimento?: string;
            training_id?: string | number;
            session_model_ids?: Array<string | number>;
            roster_by_date?: Record<string, string>;
          }>;
          cae_slots?: Array<{ date?: string; start_time?: string; end_time?: string }>;
          config?: { warnings?: string[]; roster_policy?: string };
        };
        const isShared =
          snap.mode === 'COMPARTILHADA' ||
          (Array.isArray(snap.participants) && snap.participants.length > 1);

        let caeDates = 'A definir';
        const snapshotSlots = snap.cae_slots || [];
        if (snapshotSlots.length > 0) {
          caeDates = snapshotSlots
            .map((slot) => `${slot.date || '—'} ${slot.start_time || '--:--'}-${slot.end_time || '--:--'}`)
            .join('\n');
        } else if (item.data_prevista) {
          caeDates = formatDate(item.data_prevista) || 'A definir';
        }

        const participantDetails = (snap.participants || []).map((participant) => {
          const participantId = Number(participant.employee_id ?? participant.funcionario_id ?? 0);
          const label =
            item.participantes.find((entry) => Number(entry.funcionario_id) === participantId)
              ?.funcionario_nome || `ID ${participantId || '—'}`;
          const expiry = participant.qualification_expiry_date || participant.vencimento || '—';
          const training = participant.training_id == null ? '—' : String(participant.training_id);
          const sessionModels = (participant.session_model_ids || []).map(String).join('/') || '—';
          const rosterStates = Object.entries(participant.roster_by_date || {})
            .map(([date, state]) => `${date}:${state}`)
            .join(', ');
          return `${label} | venc ${expiry} | tre ${training} | sessões ${sessionModels}${rosterStates ? ` | escala ${rosterStates}` : ''}`;
        });

        const notes: string[] = [];
        notes.push(`Empresa: ${item.empresa_id ?? '—'}`);
        notes.push(`Proposta: #${item.id}`);
        notes.push(`Revisão: ${item.updated_at || item.planejamento_recalculado_em || snap.generated_at || '—'}`);
        notes.push(`Tipo: ${isShared ? 'COMPARTILHADA' : 'NORMAL'}`);
        if (participantDetails.length > 0) notes.push(...participantDetails);
        if (snap.config?.roster_policy) notes.push(`Regra escala: ${snap.config.roster_policy}`);
        if (Array.isArray(snap.config?.warnings) && snap.config?.warnings.length > 0) {
          notes.push(`Warnings: ${snap.config.warnings.join(' | ')}`);
        }
        if (item.planejamento_aprovacao_observacoes) notes.push(`Obs: ${item.planejamento_aprovacao_observacoes}`);
        if (item.planejamento_aprovado_por) notes.push(`Aprovador ID: ${item.planejamento_aprovado_por}`);
        if (item.planejamento_aprovado_em) notes.push(`Data Apr: ${formatDate(item.planejamento_aprovado_em)}`);
        if (conflictsCount(item.planejamento_conflitos) > 0) notes.push(`${conflictsCount(item.planejamento_conflitos)} conflitos`);

        const cells = [
          String(item.id),
          STATUS_OPTIONS.find((option) => option.value === item.planejamento_status)?.label || item.planejamento_status,
          item.planejamento_aprovacao_status || 'RASCUNHO',
          item.qualificacao_nome || item.qualificacao_codigo || '-',
          participantNames(item) || 'Aguardando dupla',
          isShared ? 'Compartilhada\n' + sessionDescription(item) : 'Normal\n' + sessionDescription(item),
          item.planejamento_modelo_aeronave || '-',
          caeDates,
          formatDate(item.planejamento_vencimento_referencia),
          notes.join('\n') || '—',
        ];
        const wrapped = cells.map((cell, index) =>
          doc.splitTextToSize(String(cell), widths[index] - 2),
        );
        const height = Math.max(6, Math.max(...wrapped.map((lines) => lines.length)) * 3.2 + 2);
        if (y + height > pageHeight - 12) {
          doc.addPage();
          y = drawHeader(12);
          doc.setFont('helvetica', 'normal');
        }
        let x = margin;
        wrapped.forEach((lines, index) => {
          doc.text(lines, x + 1, y + 3.7);
          x += widths[index];
        });
        doc.setDrawColor(225, 228, 232);
        doc.line(margin, y + height, pageWidth - margin, y + height);
        y += height;
      }
      const pages = doc.getNumberOfPages();
      for (let page = 1; page <= pages; page += 1) {
        doc.setPage(page);
        doc.setFontSize(7);
        doc.text('AirTrust', margin, pageHeight - 5);
        doc.text(`Página ${page} de ${pages}`, pageWidth - margin, pageHeight - 5, {
          align: 'right',
        });
      }
      doc.save(`planejamento-simuladores-${filenameDate()}.pdf`);
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Falha ao exportar PDF.');
    } finally {
      setExporting(null);
    }
  };

  const summary = useMemo(() => {
    const result: Record<PlanningStatus, number> = Object.fromEntries(
      STATUS_OPTIONS.map((option) => [option.value, 0]),
    ) as Record<PlanningStatus, number>;
    items.forEach((item) => {
      result[item.planejamento_status] += 1;
    });
    return result;
  }, [items]);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CalendarRange className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Planejamento futuro
              </h2>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
              Projeta treinamentos pela validade da qualificação, currículo de simulador e janela
              operacional configurada. Escalas publicadas geram avisos, sem impedir o planejamento
              futuro.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void exportExcel()}
              disabled={exporting !== null || items.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {exporting === 'excel' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              Excel
            </button>
            <button
              type="button"
              onClick={() => void exportPdf()}
              disabled={exporting !== null || items.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {exporting === 'pdf' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              PDF
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Vencimento — início
            <input
              type="date"
              className={`${inputClass} mt-1 w-full`}
              value={inicio}
              onChange={(event) => setInicio(event.target.value)}
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Vencimento — fim
            <input
              type="date"
              className={`${inputClass} mt-1 w-full`}
              value={fim}
              onChange={(event) => setFim(event.target.value)}
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Margem pré-vencimento
            <input
              type="number"
              min={0}
              max={365}
              className={`${inputClass} mt-1 w-full`}
              value={margem}
              onChange={(event) => setMargem(event.target.value)}
              placeholder="Ex.: 30 (opcional)"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Planejar em
            <select
              className={`${inputClass} mt-1 w-full`}
              value={windowPolicy}
              onChange={(event) => setWindowPolicy(event.target.value as WindowPolicy)}
            >
              <option value="FOLGA">Folga</option>
              <option value="QUINZENA_ATIVA">Quinzena ativa</option>
              <option value="AMBOS">Folga ou quinzena ativa</option>
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Status
            <select
              className={`${inputClass} mt-1 w-full`}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">Todos</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2 xl:col-span-1">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white p-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              title="Atualizar planejamentos salvos"
              aria-label="Atualizar planejamentos salvos"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => void previewPlanning()}
              disabled={previewing || recalculating}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
              title="Calcula necessidades e duplas sem alterar o planejamento salvo"
            >
              {previewing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Users className="h-4 w-4" />
              )}
              Pré-visualizar
            </button>
            <button
              type="button"
              onClick={() => void recalculate()}
              disabled={recalculating || previewing}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
              title="Grava as propostas do planejamento no AirTrust"
            >
              {recalculating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarRange className="h-4 w-4" />
              )}
              Gerar
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Deixe a margem vazia para usar a janela configurada mais próxima e anterior ao vencimento.
          Em Folga, o sistema usa a quinzena oposta à quinzena ativa do funcionário; em Ambos,
          escolhe a alternativa válida mais próxima. Nenhum valor de 30 dias é assumido
          automaticamente.
        </p>
      </div>

      {preview.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-primary/20 bg-white dark:border-primary/30 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Prévia das necessidades</h3>
              <p className="text-xs text-slate-500">Somente leitura — ainda não cria nem altera planejamentos.</p>
            </div>
            <button
              type="button"
              onClick={() => setPreview([])}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              Fechar prévia
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1000px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/70">
                <tr>
                  <th className="px-3 py-3">Vencimento</th>
                  <th className="px-3 py-3">Qualificação</th>
                  <th className="px-3 py-3">Aeronave</th>
                  <th className="px-3 py-3">Tripulante(s)</th>
                  <th className="px-3 py-3">Janela sugerida</th>
                  <th className="px-3 py-3">Carga / sessões</th>
                  <th className="px-3 py-3">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {preview.map((proposal, index) => (
                  <tr key={`${proposal.qualificacao_tipo_id}-${proposal.vencimento_referencia}-${index}`}>
                    <td className="px-3 py-3 font-medium">{formatDate(proposal.vencimento_referencia)}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{proposal.qualificacao_nome || proposal.qualificacao_codigo || '—'}</div>
                      <div className="text-xs text-slate-400">{proposal.qualificacao_codigo}</div>
                    </td>
                    <td className="px-3 py-3 font-medium">{proposal.modelo_aeronave || '—'}</td>
                    <td className="px-3 py-3">
                      {proposal.participantes.map((participant) => (
                        <div key={participant.funcionario_id}>
                          {participant.funcionario_nome}
                          {participant.funcionario_funcao ? (
                            <span className="ml-1 text-xs text-slate-400">{participant.funcionario_funcao}</span>
                          ) : null}
                        </div>
                      ))}
                    </td>
                    <td className="px-3 py-3">
                      {proposal.janela_inicio && proposal.janela_fim
                        ? `${formatDate(proposal.janela_inicio)} a ${formatDate(proposal.janela_fim)}`
                        : 'A definir'}
                    </td>
                    <td className="px-3 py-3">
                      <div>{proposal.carga_horaria_prevista == null ? '—' : `${proposal.carga_horaria_prevista} h`}</div>
                      <div className="text-xs text-slate-500">
                        {proposal.curriculo?.estimated_session_count
                          ? `${proposal.curriculo.estimated_session_count} sessão(ões)`
                          : 'Conforme currículo'}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {proposal.status === 'AGUARDANDO_DISPONIBILIDADE' ? (
                        <span className="text-amber-700">Aguardando dupla/janela</span>
                      ) : (
                        <span className="text-emerald-700">Dupla compatível</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Disponibilidade CAE</h3>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Faça upload do PDF recebido da CAE. O backend persiste o arquivo e tenta extrair os slots server-side; quando o extrator não estiver disponível, a tela informa e não aceita JSON manual como substituto.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
            <Upload className="h-4 w-4" />
            Enviar PDF CAE
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(event) => void uploadCaePdf(event.target.files?.[0] || null)}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {caeValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          <span className="text-xs text-slate-500">
            {caeUploadName ? `Arquivo: ${caeUploadName}` : 'Nenhum PDF enviado ainda'}
          </span>
          <button
            type="button"
            onClick={() => void compareCaeWithNeeds()}
            disabled={caeComparing || !caeValidation}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {caeComparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            Comparar com necessidades
          </button>
          <span className="text-xs text-slate-500">Preview only · sem D1 write</span>
        </div>

        {caeValidation ? (
          <div className="mt-4 overflow-hidden rounded-lg border border-emerald-200 dark:border-emerald-900">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-950/30">
              <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                {caeValidation.document.slots.length} slot(s) CAE validados
              </span>
              <span className="text-xs text-emerald-700 dark:text-emerald-400">
                {caeValidation.warnings.length} aviso(s) de revisão
              </span>
            </div>
            <div className="max-h-80 overflow-auto">
              <table className="min-w-[850px] w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/70">
                  <tr>
                    <th className="px-3 py-2">Aeronave</th>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">Horário</th>
                    <th className="px-3 py-2">Duração</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2">Confiança</th>
                    <th className="px-3 py-2">Fonte</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {caeValidation.document.slots.map((slot) => (
                    <tr key={slot.external_ref || `${slot.equipment}-${slot.date}-${slot.start_time}`}>
                      <td className="px-3 py-2 font-semibold">{slot.equipment}</td>
                      <td className="px-3 py-2">{formatDate(slot.date)}</td>
                      <td className="px-3 py-2">{slot.start_time}–{slot.end_time}</td>
                      <td className="px-3 py-2">{slot.duration_minutes} min</td>
                      <td className="px-3 py-2">{slot.state}</td>
                      <td className="px-3 py-2">{Math.round(slot.confidence * 100)}%</td>
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {slot.source_ref?.page ? `p. ${slot.source_ref.page}` : '—'}
                        {slot.source_ref?.section ? ` · ${slot.source_ref.section}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {caeComparison ? (
          <div className="mt-4 overflow-hidden rounded-lg border border-primary/20 dark:border-primary/30">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-primary/5 px-3 py-3">
              <div>
                <p className="font-semibold text-slate-900 dark:text-slate-100">Comparação CAE × necessidades reais</p>
                <p className="text-xs text-slate-500">
                  {caeComparison.summary.matched}/{caeComparison.summary.total_needs} necessidade(s) atendida(s) · {caeComparison.summary.insufficient} sem capacidade · {caeComparison.summary.with_conflicts} com conflito de escala
                </p>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-primary shadow-sm dark:bg-slate-950">
                somente leitura
              </span>
            </div>
            <div className="max-h-[34rem] overflow-auto">
              <table className="min-w-[1100px] w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/70">
                  <tr>
                    <th className="px-3 py-2">Tripulação</th>
                    <th className="px-3 py-2">Aeronave</th>
                    <th className="px-3 py-2">Vencimento</th>
                    <th className="px-3 py-2">Currículo</th>
                    <th className="px-3 py-2">Slots recomendados</th>
                    <th className="px-3 py-2">Margem</th>
                    <th className="px-3 py-2">Conflitos</th>
                    <th className="px-3 py-2">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {caeComparison.recommendations.map((recommendation) => (
                    <tr key={recommendation.need_id}>
                      <td className="px-3 py-3 font-semibold">
                        {recommendation.participantes.map((participant) => participant.funcionario_nome).join(' + ') || 'Aguardando dupla'}
                      </td>
                      <td className="px-3 py-3">{recommendation.modelo_aeronave}</td>
                      <td className="px-3 py-3">{formatDate(recommendation.vencimento_referencia)}</td>
                      <td className="px-3 py-3">
                        {recommendation.total_required_minutes > 0
                          ? `${recommendation.assignments.length} sessão(ões) · ${recommendation.total_required_minutes / 60} h`
                          : 'Currículo incompleto'}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {recommendation.selected_slots.length > 0 ? (
                          <div className="space-y-1">
                            {recommendation.selected_slots.map((slot) => (
                              <div key={slot.external_ref || `${slot.equipment}-${slot.date}-${slot.start_time}`}>
                                {formatDate(slot.date)} · {slot.start_time}–{slot.end_time} ({slot.duration_minutes} min)
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-amber-700">Nenhum slot compatível</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {recommendation.days_before_expiry == null
                          ? '—'
                          : `${recommendation.days_before_expiry} dia(s)`}
                        {recommendation.outside_preferred_window ? (
                          <div className="mt-1 text-xs text-amber-700">fora da janela preferida</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        {recommendation.conflicts.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-amber-700">
                            <AlertTriangle className="h-4 w-4" />
                            {recommendation.conflicts.length}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            recommendation.match_status === 'MATCHED' && !recommendation.requires_human_review
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                              : recommendation.match_status === 'MATCHED'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                          }`}
                        >
                          {recommendation.match_status === 'MATCHED'
                            ? recommendation.requires_human_review
                              ? 'Atende · revisar'
                              : 'Atende'
                            : recommendation.match_status === 'INVALID_NEED'
                              ? 'Currículo incompleto'
                              : 'Sem disponibilidade'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {caeComparison.remaining_slots.length > 0 ? (
              <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-800">
                Sobra após a alocação prioritária: {caeComparison.remaining_slots.length} bloco(s) CAE ainda disponível(is). A mesma capacidade não é reutilizada para tripulações diferentes.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {STATUS_OPTIONS.map((option) => (
          <div
            key={option.value}
            className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="text-xs text-slate-500">{option.label}</p>
            <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">
              {summary[option.value]}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex h-56 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarRange className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-3 font-semibold text-slate-800 dark:text-slate-100">
              Nenhum planejamento no intervalo
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Recalcule para gerar propostas a partir das qualificações vigentes e janelas
              operacionais configuradas.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1500px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/70">
                <tr>
                  <th className="px-3 py-3">Aprovação</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Vencimento</th>
                  <th className="px-3 py-3">Qualificação</th>
                  <th className="px-3 py-3">Aeronave</th>
                  <th className="px-3 py-3">Tripulação</th>
                  <th className="px-3 py-3">Quinzena / janela</th>
                  <th className="px-3 py-3">Data prevista</th>
                  <th className="px-3 py-3">Carga / sessões</th>
                  <th className="px-3 py-3">Escala publicada</th>
                  <th className="px-3 py-3">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((item) => {
                  const draft = drafts[item.id];
                  const conflictTotal = conflictsCount(item.planejamento_conflitos);
                  return (
                    <tr key={item.id} className="align-top">
<td className="px-3 py-3">
                        {item.planejamento_aprovacao_status === 'RASCUNHO' && (
                          <div className="flex flex-col gap-2">
                            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300/60">
                              Rascunho
                            </span>
                            <button
                              onClick={() => handleSubmeter(item.id)}
                              disabled={actioningId === item.id}
                              className="rounded bg-slate-700 px-2 py-1 text-xs text-white hover:bg-slate-600 disabled:opacity-50"
                            >
                              Submeter
                            </button>
                          </div>
                        )}
                        {item.planejamento_aprovacao_status === 'PENDENTE' && (
                          <div className="flex flex-col gap-2">
                            <span className="inline-flex items-center rounded-md bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-800 ring-1 ring-inset ring-yellow-600/20">
                              Aguardando Aprovação
                            </span>
                            <button
                              onClick={() => handleAprovar(item.id)}
                              disabled={actioningId === item.id}
                              className="rounded bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-500 disabled:opacity-50"
                            >
                              Aprovar
                            </button>
                            <div className="flex flex-col gap-1">
                              <input
                                type="text"
                                placeholder="Motivo devolução"
                                className="w-full rounded-md border-0 py-1.5 px-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700 text-xs"
                                value={devolverObs[item.id] || ''}
                                onChange={(e) => setDevolverObs({ ...devolverObs, [item.id]: e.target.value })}
                              />
                              <button
                                onClick={() => handleDevolver(item.id)}
                                disabled={actioningId === item.id || !devolverObs[item.id]}
                                className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-500 disabled:opacity-50"
                              >
                                Devolver
                              </button>
                            </div>
                          </div>
                        )}
                        {item.planejamento_aprovacao_status === 'APROVADO' && (
                          <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                            Aprovado
                          </span>
                        )}
                        {item.planejamento_aprovacao_status === 'DEVOLVIDO' && (
                          <div className="flex flex-col gap-1">
                            <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">
                              Devolvido
                            </span>
                            <span className="text-[10px] text-slate-500">{item.planejamento_aprovacao_observacoes}</span>
                            <button
                              onClick={() => handleSubmeter(item.id)}
                              disabled={actioningId === item.id}
                              className="rounded bg-slate-700 px-2 py-1 text-xs text-white hover:bg-slate-600 disabled:opacity-50"
                            >
                              Submeter novamente
                            </button>
                          </div>
                        )}
                        {item.planejamento_aprovacao_status === 'NAO_EXIGIDO' && (
                          <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                            Aprovação não exigida
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <select
                          className={`${inputClass} w-48`}
                          value={draft?.status || item.planejamento_status}
                          onChange={(event) =>
                            updateDraft(item.id, { status: event.target.value as PlanningStatus })
                          }
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {item.planejamento_editado_manualmente ? (
                          <span className="mt-1 block text-[11px] font-medium text-violet-600">
                            edição preservada
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-800 dark:text-slate-100">
                        {formatDate(item.planejamento_vencimento_referencia)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-slate-800 dark:text-slate-100">
                          {item.qualificacao_nome || item.qualificacao_codigo || '—'}
                        </div>
                        <div className="text-xs text-slate-400">{item.qualificacao_codigo}</div>
                      </td>
                      <td className="px-3 py-3 font-medium">
                        {item.planejamento_modelo_aeronave || '—'}
                      </td>
                      <td className="px-3 py-3">
                        {item.participantes.length > 0 ? (
                          item.participantes.map((participant) => (
                            <div
                              key={participant.funcionario_id}
                              className="mb-1 flex items-center gap-1.5"
                            >
                              <Users className="h-3.5 w-3.5 text-slate-400" />
                              <span>{participant.funcionario_nome}</span>
                              <span className="text-xs text-slate-400">
                                {participant.funcionario_funcao || ''}
                              </span>
                            </div>
                          ))
                        ) : (
                          <span className="text-slate-400">Aguardando dupla</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="mb-1 text-xs text-slate-500">
                          Q{item.planejamento_quinzena_numero || '—'} ativa ·{' '}
                          {item.planejamento_tipo_janela === 'FOLGA'
                            ? 'folga'
                            : item.planejamento_tipo_janela === 'QUINZENA_ATIVA'
                              ? 'quinzena ativa'
                              : 'janela a definir'}
                        </div>
                        <div className="flex gap-1">
                          <input
                            type="date"
                            className={`${inputClass} w-36 px-2`}
                            value={draft?.janelaInicio || ''}
                            onChange={(event) =>
                              updateDraft(item.id, { janelaInicio: event.target.value })
                            }
                          />
                          <input
                            type="date"
                            className={`${inputClass} w-36 px-2`}
                            value={draft?.janelaFim || ''}
                            onChange={(event) =>
                              updateDraft(item.id, { janelaFim: event.target.value })
                            }
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="date"
                          className={`${inputClass} w-36 px-2`}
                          value={draft?.dataPrevista || ''}
                          onChange={(event) =>
                            updateDraft(item.id, { dataPrevista: event.target.value })
                          }
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium">
                          {item.carga_horaria_prevista == null
                            ? '—'
                            : `${item.carga_horaria_prevista} h`}
                        </div>
                        <div className="text-xs text-slate-500">{sessionDescription(item)}</div>
                      </td>
                      <td className="px-3 py-3">
                        {conflictTotal > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {conflictTotal} aviso(s)
                          </span>
                        ) : (
                          <span className="text-xs text-emerald-600">Sem conflito publicado</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => void saveRow(item)}
                          disabled={savingId === item.id}
                          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
                        >
                          {savingId === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          Salvar
                        </button>
                        {['CONFIRMADO', 'AGENDADO'].includes(
                          draft?.status || item.planejamento_status,
                        ) ? (
                          <a
                            href="/treinamentos/planejados"
                            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                            title={`Abrir a turma #${item.id} no cronograma canônico para informar datas, horários, simulador e sessões`}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Agendar sessões
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
        <Download className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          PDF e Excel refletem exatamente o planejamento visível. PROPOSTO e
          AGUARDANDO_DISPONIBILIDADE não geram histórico nem evento de escala. Após o fornecedor
          confirmar, use o cronograma canônico de Treinamentos Planejados para informar datas,
          horários, simulador e sessões; AGENDADO só é aceito quando todas as sessões do currículo
          estiverem cadastradas.
        </span>
      </div>
    </div>
  );
}
