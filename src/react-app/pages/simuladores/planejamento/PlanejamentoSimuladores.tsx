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
  participantes: Participant[];
};

type DraftRow = {
  status: PlanningStatus;
  dataPrevista: string;
  janelaInicio: string;
  janelaFim: string;
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
  const [fim, setFim] = useState(() => addDaysIso(now, 365));
  const [margem, setMargem] = useState('');
  const [windowPolicy, setWindowPolicy] = useState<WindowPolicy>('FOLGA');
  const [statusFilter, setStatusFilter] = useState('');
  const [items, setItems] = useState<PlanningItem[]>([]);
  const [drafts, setDrafts] = useState<Record<number, DraftRow>>({});
  const [loading, setLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);

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

  const recalculate = async () => {
    if (!inicio || !fim || inicio > fim) {
      showToast.error('Informe um intervalo de vencimento válido.');
      return;
    }
    const marginNumber = margem.trim() === '' ? null : Number(margem);
    if (marginNumber !== null && (!Number.isInteger(marginNumber) || marginNumber < 0)) {
      showToast.error('A margem deve ser um número inteiro não negativo ou ficar em branco.');
      return;
    }
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
        body: JSON.stringify({
          vencimento_inicio: inicio,
          vencimento_fim: fim,
          margem_dias: marginNumber,
          politica_janela: windowPolicy,
        }),
      });
      showToast.success(
        `Planejamento recalculado: ${result.pares} dupla(s), ${result.pendencias} pendência(s), ${result.preservados} edição(ões) preservada(s).`,
      );
      await load();
    } catch (error) {
      showToast.error(frontendErrorMessage(error));
    } finally {
      setRecalculating(false);
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

      const widths = [30, 26, 44, 20, 55, 34, 23, 18, 18];
      const headers = [
        'Status',
        'Vencimento',
        'Qualificação',
        'Aeronave',
        'Tripulação',
        'Janela',
        'Carga',
        'Sessões',
        'Avisos',
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
        doc.setFontSize(7.5);
        headers.forEach((header, index) => {
          doc.text(header, x + 1, startY + 4.7);
          x += widths[index];
        });
        return startY + 7;
      };

      let y = drawHeader(30);
      doc.setFont('helvetica', 'normal');
      for (const item of items) {
        const cells = [
          STATUS_OPTIONS.find((option) => option.value === item.planejamento_status)?.label ||
            item.planejamento_status,
          formatDate(item.planejamento_vencimento_referencia),
          item.qualificacao_nome || item.qualificacao_codigo || '-',
          item.planejamento_modelo_aeronave || '-',
          participantNames(item) || 'Aguardando dupla',
          item.planejamento_janela_inicio && item.planejamento_janela_fim
            ? `${formatDate(item.planejamento_janela_inicio)} – ${formatDate(item.planejamento_janela_fim)}`
            : 'A definir',
          item.carga_horaria_prevista == null ? '-' : `${item.carga_horaria_prevista} h`,
          sessionDescription(item),
          conflictsCount(item.planejamento_conflitos) > 0
            ? `${conflictsCount(item.planejamento_conflitos)} conflito(s)`
            : '—',
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
              placeholder="Sem margem fixa"
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
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => void recalculate()}
              disabled={recalculating}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {recalculating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarRange className="h-4 w-4" />
              )}
              Recalcular
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
