import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Mail, Settings2, X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/react-app/config/api';
import { useAuth } from '@/react-app/hooks/useAuth';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import {
  buildComplianceNarrative,
  downloadTrainingCompliancePdf,
  generateTrainingCompliancePdf,
  type TrainingCompliancePendingRow,
  type TrainingComplianceReportSummary,
} from '@/react-app/services/training-compliance-report';

export type TrainingComplianceReportCatalogs = {
  setores: Array<{ id: number; nome: string }>;
  funcoes: Array<{ id: number; nome: string }>;
  funcionarios?: Array<{
    id: number;
    nome: string;
    matricula?: string | null;
    setor_id?: number | null;
    funcao_id?: number | null;
  }>;
  setor_funcoes: Array<{ setor_id: number; funcao_id: number }>;
};

type TrainingTypeOption = { id: string | number; nome: string; codigo?: string | null };
type ReportStatus = TrainingCompliancePendingRow['status_compliance'];
type AutomationFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
type AutomationPolicy = {
  enabled: boolean;
  frequency: AutomationFrequency;
  weekday: number;
  day_of_month: number;
  time: string;
  timezone: string;
  sector_ids: number[];
  statuses: ReportStatus[];
  critical_only: boolean;
  due_within_days: number | null;
};

const ALL_STATUSES: ReportStatus[] = [
  'CONFORME',
  'EM_ANDAMENTO',
  'VENCENDO',
  'VENCIDO',
  'NAO_REALIZADO',
];
const PENDING_STATUSES: ReportStatus[] = ['EM_ANDAMENTO', 'VENCENDO', 'VENCIDO', 'NAO_REALIZADO'];
const STATUS_LABELS: Record<ReportStatus, string> = {
  CONFORME: 'Realizados',
  EM_ANDAMENTO: 'Em andamento',
  VENCENDO: 'Vencendo',
  VENCIDO: 'Vencidos',
  NAO_REALIZADO: 'Nunca fez',
};
const WEEKDAYS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    data?: T;
    error?: string;
  };
  if (!response.ok || json.success === false) throw new Error(json.error || 'Falha na operação');
  return json.data as T;
}

function numericOrNull(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function sameStatuses(left: ReportStatus[], right: ReportStatus[]) {
  return left.length === right.length && left.every((item) => right.includes(item));
}

export function TrainingComplianceReportBuilder({
  catalogs,
  trainingTypes = [],
  initialSectorId,
  initialFunctionId,
}: {
  catalogs: TrainingComplianceReportCatalogs | undefined;
  trainingTypes?: TrainingTypeOption[];
  initialSectorId: number | null;
  initialFunctionId: number | null;
}) {
  const queryClient = useQueryClient();
  const { user, empresas, empresaAtualId } = useAuth();
  const { isAdmin } = usePermissions();
  const [sectorId, setSectorId] = useState(initialSectorId ? String(initialSectorId) : '');
  const [functionId, setFunctionId] = useState(initialFunctionId ? String(initialFunctionId) : '');
  const [employeeId, setEmployeeId] = useState('');
  const [trainingTypeId, setTrainingTypeId] = useState('');
  const [statuses, setStatuses] = useState<ReportStatus[]>(PENDING_STATUSES);
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [windowDays, setWindowDays] = useState('');
  const [managerModalOpen, setManagerModalOpen] = useState(false);
  const [managerSectorIds, setManagerSectorIds] = useState<Set<number>>(new Set());
  const [automationDraft, setAutomationDraft] = useState<AutomationPolicy | null>(null);

  useEffect(() => {
    setSectorId(initialSectorId ? String(initialSectorId) : '');
    setFunctionId(initialFunctionId ? String(initialFunctionId) : '');
  }, [initialFunctionId, initialSectorId]);

  const reportFunctions = useMemo(() => {
    const all = catalogs?.funcoes || [];
    const selectedSector = numericOrNull(sectorId);
    if (!selectedSector) return all;
    const allowed = new Set(
      (catalogs?.setor_funcoes || [])
        .filter((pair) => pair.setor_id === selectedSector)
        .map((pair) => pair.funcao_id),
    );
    return all.filter((item) => allowed.has(item.id));
  }, [catalogs, sectorId]);

  const reportEmployees = useMemo(() => {
    const selectedSector = numericOrNull(sectorId);
    const selectedFunction = numericOrNull(functionId);
    return (catalogs?.funcionarios || []).filter(
      (item) =>
        (!selectedSector || item.setor_id === selectedSector) &&
        (!selectedFunction || item.funcao_id === selectedFunction),
    );
  }, [catalogs?.funcionarios, functionId, sectorId]);

  useEffect(() => {
    if (functionId && !reportFunctions.some((item) => item.id === Number(functionId)))
      setFunctionId('');
  }, [functionId, reportFunctions]);
  useEffect(() => {
    if (employeeId && !reportEmployees.some((item) => item.id === Number(employeeId)))
      setEmployeeId('');
  }, [employeeId, reportEmployees]);

  const params = useMemo(() => {
    const value = new URLSearchParams();
    if (sectorId) value.set('setor_id', sectorId);
    if (functionId) value.set('funcao_id', functionId);
    if (employeeId) value.set('funcionario_id', employeeId);
    if (trainingTypeId) value.set('qualificacao_tipo_id', trainingTypeId);
    value.set('status', statuses.join(','));
    if (criticalOnly) value.set('critico', 'true');
    if (windowDays) value.set('ate_dias', windowDays);
    return value;
  }, [criticalOnly, employeeId, functionId, sectorId, statuses, trainingTypeId, windowDays]);

  const reportRows = useQuery({
    queryKey: ['training-compliance', 'report-builder', params.toString()],
    enabled: statuses.length > 0,
    queryFn: async () =>
      readJson<TrainingCompliancePendingRow[]>(
        await fetchWithAuth(`/api/compliance-treinamentos/pendencias?${params.toString()}`),
      ),
  });
  const rows = reportRows.data || [];
  const empresaNome =
    empresas.find((item) => Number(item.id) === Number(empresaAtualId))?.nome || 'Empresa atual';
  const setorNome = catalogs?.setores.find((item) => item.id === Number(sectorId))?.nome || null;
  const funcaoNome = catalogs?.funcoes.find((item) => item.id === Number(functionId))?.nome || null;
  const funcionarioNome =
    (catalogs?.funcionarios || []).find((item) => item.id === Number(employeeId))?.nome || null;
  const treinamentoNome =
    trainingTypes.find((item) => Number(item.id) === Number(trainingTypeId))?.nome || null;
  const allStatusesSelected = sameStatuses(statuses, ALL_STATUSES);
  const summary = useMemo<TrainingComplianceReportSummary>(() => {
    const compliant = rows.filter(
      (row) => row.status_compliance === 'CONFORME' || row.status_compliance === 'VENCENDO',
    ).length;
    return {
      pessoas: new Set(rows.map((row) => row.funcionario_id)).size,
      requisitos_obrigatorios: rows.length,
      conformes: compliant,
      vencendo: rows.filter((row) => row.status_compliance === 'VENCENDO').length,
      vencidos: rows.filter((row) => row.status_compliance === 'VENCIDO').length,
      nao_realizados: rows.filter((row) => row.status_compliance === 'NAO_REALIZADO').length,
      em_andamento: rows.filter((row) => row.status_compliance === 'EM_ANDAMENTO').length,
      compliance_pct:
        allStatusesSelected && rows.length
          ? Math.round((compliant / rows.length) * 1000) / 10
          : null,
    };
  }, [allStatusesSelected, rows]);
  const reportContext = {
    empresaNome,
    usuarioNome: user?.nome || user?.email || 'Usuário autenticado',
    setorNome,
    funcaoNome,
    funcionarioNome,
    treinamentoNome,
    statusScope: statuses.map((item) => STATUS_LABELS[item]).join(', '),
  };

  const exportPdf = async () => {
    const report = await generateTrainingCompliancePdf(rows, summary, reportContext);
    downloadTrainingCompliancePdf(report.blob, report.filename);
  };

  const sendManagers = useMutation({
    mutationFn: async () =>
      readJson<{ setores: number; setores_enviados: number; destinatarios: number }>(
        await fetchWithAuth('/api/compliance-treinamentos/relatorios/enviar-gestores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            setor_ids: [...managerSectorIds],
            filters: {
              funcao_id: numericOrNull(functionId),
              funcionario_id: numericOrNull(employeeId),
              qualificacao_tipo_id: numericOrNull(trainingTypeId),
              statuses,
              critico: criticalOnly,
              ate_dias: windowDays ? Number(windowDays) : null,
            },
          }),
        }),
      ),
    onSuccess: (result) => {
      toast.success(
        `Relatório enviado para ${result.destinatarios} gestor(es) em ${result.setores_enviados} setor(es).`,
      );
      setManagerModalOpen(false);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Falha ao enviar relatórios'),
  });

  const automation = useQuery({
    queryKey: ['training-compliance', 'report-automation'],
    queryFn: async () =>
      readJson<AutomationPolicy>(
        await fetchWithAuth('/api/compliance-treinamentos/relatorios/automacao'),
      ),
  });
  useEffect(() => {
    if (automation.data) setAutomationDraft(automation.data);
  }, [automation.data]);
  const saveAutomation = useMutation({
    mutationFn: async (policy: AutomationPolicy) =>
      readJson<AutomationPolicy>(
        await fetchWithAuth('/api/compliance-treinamentos/relatorios/automacao', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(policy),
        }),
      ),
    onSuccess: (data) => {
      setAutomationDraft(data);
      toast.success(
        data.enabled
          ? 'Envio automático de relatórios ativado.'
          : 'Envio automático de relatórios desativado.',
      );
      void queryClient.invalidateQueries({
        queryKey: ['training-compliance', 'report-automation'],
      });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Falha ao salvar automação'),
  });

  const toggleStatus = (status: ReportStatus) => {
    setStatuses((current) => {
      if (current.includes(status))
        return current.length === 1 ? current : current.filter((item) => item !== status);
      return ALL_STATUSES.filter((item) => item === status || current.includes(item));
    });
  };
  const openManagerModal = () => {
    const selected = numericOrNull(sectorId);
    setManagerSectorIds(new Set(selected ? [selected] : []));
    setManagerModalOpen(true);
  };
  const canEditAutomation = isAdmin;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-slate-900">Gerador de relatórios</h2>
          <p className="mt-1 text-sm text-slate-500">
            Combine setor, função, funcionário, treinamento e situação. O PDF reflete exatamente o
            recorte selecionado.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void exportPdf()}
            disabled={reportRows.isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Exportar PDF
          </button>
          <button
            type="button"
            onClick={openManagerModal}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white"
          >
            <Mail className="h-4 w-4" /> Enviar ao gestor
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <ReportSelect
          label="Setor"
          value={sectorId}
          onChange={setSectorId}
          options={(catalogs?.setores || []).map((item) => ({
            value: String(item.id),
            label: item.nome,
          }))}
          allLabel="Todos os setores"
        />
        <ReportSelect
          label="Função"
          value={functionId}
          onChange={setFunctionId}
          options={reportFunctions.map((item) => ({ value: String(item.id), label: item.nome }))}
          allLabel="Todas as funções"
        />
        <ReportSelect
          label="Funcionário"
          value={employeeId}
          onChange={setEmployeeId}
          options={reportEmployees.map((item) => ({ value: String(item.id), label: item.nome }))}
          allLabel="Todos os funcionários"
        />
        <ReportSelect
          label="Treinamento"
          value={trainingTypeId}
          onChange={setTrainingTypeId}
          options={trainingTypes.map((item) => ({
            value: String(item.id),
            label: item.codigo ? `${item.codigo} — ${item.nome}` : item.nome,
          }))}
          allLabel="Todos os treinamentos"
        />
        <ReportSelect
          label="Prazo"
          value={windowDays}
          onChange={setWindowDays}
          options={[7, 15, 30, 60, 90].map((days) => ({
            value: String(days),
            label: `Até ${days} dias`,
          }))}
          allLabel="Qualquer prazo"
        />
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Situações incluídas
          </span>
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => setStatuses(PENDING_STATUSES)}
              className="rounded-md border bg-white px-2 py-1"
            >
              Pendências
            </button>
            <button
              type="button"
              onClick={() => setStatuses(ALL_STATUSES)}
              className="rounded-md border bg-white px-2 py-1"
            >
              Completo
            </button>
            <button
              type="button"
              onClick={() => setStatuses(['CONFORME'])}
              className="rounded-md border bg-white px-2 py-1"
            >
              Realizados
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          {ALL_STATUSES.map((item) => (
            <label key={item} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={statuses.includes(item)}
                onChange={() => toggleStatus(item)}
              />{' '}
              {STATUS_LABELS[item]}
            </label>
          ))}
          <label className="ml-auto flex items-center gap-2 text-sm font-medium text-red-700">
            <input
              type="checkbox"
              checked={criticalOnly}
              onChange={(event) => setCriticalOnly(event.target.checked)}
            />{' '}
            Só críticos
          </label>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Pessoas no recorte" value={summary.pessoas} />
        <Metric label="Requisitos" value={summary.requisitos_obrigatorios} />
        <Metric label="Vencidos" value={summary.vencidos} />
        <Metric label="Nunca realizou" value={summary.nao_realizados} />
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-700">
        {buildComplianceNarrative(summary, rows, reportContext)}
      </p>

      <div className="mt-6 border-t border-slate-100 pt-5">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-slate-900">Envio automático aos gestores</h3>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Cada setor selecionado gera seu próprio PDF e o envia somente aos gestores vinculados
          àquele setor.
        </p>
        {automationDraft ? (
          <AutomationEditor
            policy={automationDraft}
            setPolicy={setAutomationDraft}
            catalogs={catalogs}
            canEdit={canEditAutomation}
            saving={saveAutomation.isPending}
            onSave={() => saveAutomation.mutate(automationDraft)}
            onToggleEnabled={(enabled) => {
              const next = { ...automationDraft, enabled };
              setAutomationDraft(next);
              saveAutomation.mutate(next);
            }}
          />
        ) : (
          <p className="mt-3 text-sm text-slate-500">Carregando configuração...</p>
        )}
      </div>

      {managerModalOpen ? (
        <SectorSelectionModal
          sectors={catalogs?.setores || []}
          selected={managerSectorIds}
          setSelected={setManagerSectorIds}
          sending={sendManagers.isPending}
          onClose={() => setManagerModalOpen(false)}
          onSend={() => sendManagers.mutate()}
        />
      ) : null}
    </section>
  );
}

function ReportSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  allLabel: string;
}) {
  return (
    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case text-slate-800"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

function SectorSelectionModal({
  sectors,
  selected,
  setSelected,
  sending,
  onClose,
  onSend,
}: {
  sectors: Array<{ id: number; nome: string }>;
  selected: Set<number>;
  setSelected: (value: Set<number>) => void;
  sending: boolean;
  onClose: () => void;
  onSend: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">Enviar relatório ao gestor</h3>
            <p className="mt-1 text-sm text-slate-500">
              Selecione os setores. Cada gestor recebe apenas o PDF do setor ao qual está vinculado.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-3">
          {sectors.map((sector) => (
            <label
              key={sector.id}
              className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selected.has(sector.id)}
                onChange={(event) => {
                  const next = new Set(selected);
                  if (event.target.checked) next.add(sector.id);
                  else next.delete(sector.id);
                  setSelected(next);
                }}
              />
              <span className="text-sm text-slate-800">{sector.nome}</span>
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!selected.size || sending}
            onClick={onSend}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {sending ? 'Enviando...' : `Enviar ${selected.size ? `(${selected.size})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function AutomationEditor({
  policy,
  setPolicy,
  catalogs,
  canEdit,
  saving,
  onSave,
  onToggleEnabled,
}: {
  policy: AutomationPolicy;
  setPolicy: (value: AutomationPolicy) => void;
  catalogs: TrainingComplianceReportCatalogs | undefined;
  canEdit: boolean;
  saving: boolean;
  onSave: () => void;
  onToggleEnabled: (enabled: boolean) => void;
}) {
  const set = <K extends keyof AutomationPolicy>(key: K, value: AutomationPolicy[K]) =>
    setPolicy({ ...policy, [key]: value });
  const toggleSector = (id: number) =>
    set(
      'sector_ids',
      policy.sector_ids.includes(id)
        ? policy.sector_ids.filter((item) => item !== id)
        : [...policy.sector_ids, id],
    );
  const toggleAutomationStatus = (status: ReportStatus) => {
    const next = policy.statuses.includes(status)
      ? policy.statuses.filter((item) => item !== status)
      : [...policy.statuses, status];
    if (next.length)
      set(
        'statuses',
        ALL_STATUSES.filter((item) => next.includes(item)),
      );
  };
  return (
    <div className="mt-4 space-y-4 rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-800">Modo automático</div>
          <div className="text-xs text-slate-500">Ative ou desative sem apagar a programação.</div>
        </div>
        <button
          type="button"
          disabled={!canEdit || saving || (!policy.enabled && !policy.sector_ids.length)}
          onClick={() => onToggleEnabled(!policy.enabled)}
          title={
            !policy.enabled && !policy.sector_ids.length
              ? 'Selecione ao menos um setor antes de ativar'
              : undefined
          }
          className={`relative h-7 w-12 rounded-full transition ${policy.enabled ? 'bg-primary' : 'bg-slate-300'} disabled:opacity-50`}
          aria-pressed={policy.enabled}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${policy.enabled ? 'left-6' : 'left-1'}`}
          />
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <ReportSelect
          label="Frequência"
          value={policy.frequency}
          onChange={(value) => set('frequency', value as AutomationFrequency)}
          options={[
            { value: 'DAILY', label: 'Diariamente' },
            { value: 'WEEKLY', label: 'Semanalmente' },
            { value: 'MONTHLY', label: 'Mensalmente' },
          ]}
          allLabel="Frequência"
        />
        {policy.frequency === 'WEEKLY' ? (
          <ReportSelect
            label="Dia da semana"
            value={String(policy.weekday)}
            onChange={(value) => set('weekday', Number(value))}
            options={WEEKDAYS.map((label, index) => ({ value: String(index), label }))}
            allLabel="Dia"
          />
        ) : policy.frequency === 'MONTHLY' ? (
          <ReportSelect
            label="Dia do mês"
            value={String(policy.day_of_month)}
            onChange={(value) => set('day_of_month', Number(value))}
            options={Array.from({ length: 28 }, (_, index) => ({
              value: String(index + 1),
              label: `Dia ${index + 1}`,
            }))}
            allLabel="Dia"
          />
        ) : (
          <div />
        )}
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Horário
          <input
            type="time"
            value={policy.time}
            onChange={(event) => set('time', event.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
          />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <ReportSelect
          label="Prazo no relatório automático"
          value={policy.due_within_days == null ? '' : String(policy.due_within_days)}
          onChange={(value) => set('due_within_days', value ? Number(value) : null)}
          options={[7, 15, 30, 60, 90].map((days) => ({
            value: String(days),
            label: `Até ${days} dias`,
          }))}
          allLabel="Qualquer prazo"
        />
        <div className="self-end rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Fuso horário: {policy.timezone}
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Setores que receberão relatório
        </div>
        <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
          {(catalogs?.setores || []).map((sector) => (
            <label
              key={sector.id}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={policy.sector_ids.includes(sector.id)}
                onChange={() => toggleSector(sector.id)}
              />
              {sector.nome}
            </label>
          ))}
        </div>
      </div>
      {canEdit && !policy.sector_ids.length ? (
        <p className="text-xs text-amber-700">
          Selecione ao menos um setor para habilitar o modo automático.
        </p>
      ) : null}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Situações no PDF automático
        </div>
        <div className="mt-2 flex flex-wrap gap-3">
          {ALL_STATUSES.map((status) => (
            <label key={status} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={policy.statuses.includes(status)}
                onChange={() => toggleAutomationStatus(status)}
              />
              {STATUS_LABELS[status]}
            </label>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-red-700">
          <input
            type="checkbox"
            checked={policy.critical_only}
            onChange={(event) => set('critical_only', event.target.checked)}
          />
          Somente requisitos críticos
        </label>
        <button
          type="button"
          disabled={!canEdit || saving || (policy.enabled && !policy.sector_ids.length)}
          onClick={onSave}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar programação'}
        </button>
      </div>
      {!canEdit ? (
        <p className="text-xs text-slate-500">
          A programação automática pode ser alterada apenas por administradores.
        </p>
      ) : null}
    </div>
  );
}
