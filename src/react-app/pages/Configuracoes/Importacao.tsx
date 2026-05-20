import { useMemo, useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  Layers3,
  Loader2,
  RefreshCw,
  Tags,
  Upload,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { ExportButton } from '@/react-app/components/ExportButton';
import { apiFetch } from '@/react-app/lib/apiFetch';
import { getAccessToken } from '@/react-app/config/api';
import { SettingsSectionIntro } from './components/SettingsSectionIntro';

type ImportEntity = 'funcionarios' | 'tipos' | 'categorias' | 'historico';
type ImportMode = 'INSERT' | 'UPDATE' | 'UPSERT';
type ExportEntity = 'funcionarios' | 'qualificacoes-historico' | 'qualificacoes-tipos';

interface ValidationIssue {
  line?: number;
  linha?: number;
  field?: string;
  erro?: string;
  message?: string;
  erros?: string[];
  [key: string]: unknown;
}

interface ValidationSummary {
  total: number;
  valid: number;
  invalid: number;
  issues: ValidationIssue[];
  preview: Array<Record<string, unknown>>;
}

interface ImportSummary {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  issues: ValidationIssue[];
}

interface EntityConfig {
  key: ImportEntity;
  apiEntity: string;
  title: string;
  subtitle: string;
  description: string;
  destination: string;
  icon: typeof Users;
  accent: string;
  supportedModes: ImportMode[];
  fields: string[];
  exportType?: ExportEntity;
  exportLabel?: string;
  exportVariant?: 'primary' | 'secondary' | 'emerald' | 'amber';
}

interface SpecialOperation {
  title: string;
  description: string;
  destination: string;
  anchorId: string;
}

const MAX_FILE_SIZE = 12 * 1024 * 1024;

const ENTITY_CONFIGS: EntityConfig[] = [
  {
    key: 'funcionarios',
    apiEntity: 'funcionarios',
    title: 'Funcionários',
    subtitle: 'Base de pessoas e vínculos operacionais',
    description: 'Nome, e-mail, CPF, matrícula, cargo, telefone e data de admissão.',
    destination: '/funcionarios',
    icon: Users,
    accent: 'border-blue-200 bg-blue-50 text-blue-700',
    supportedModes: ['UPSERT', 'INSERT', 'UPDATE'],
    fields: ['nome', 'email', 'cpf', 'matricula', 'cargo', 'telefone', 'data_admissao'],
    exportType: 'funcionarios',
    exportLabel: 'Exportar Funcionários',
    exportVariant: 'emerald',
  },
  {
    key: 'tipos',
    apiEntity: 'tipos',
    title: 'Modelos de Qualificação',
    subtitle: 'Tipos, códigos, validade e carga horária',
    description: 'Importa os modelos usados em qualificações e certificações.',
    destination: '/qualificacoes',
    icon: Layers3,
    accent: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    supportedModes: ['UPSERT', 'INSERT', 'UPDATE'],
    fields: ['tipo', 'codigo', 'nome', 'descricao', 'categoria', 'carga_horaria', 'validade'],
    exportType: 'qualificacoes-tipos',
    exportLabel: 'Exportar Modelos',
    exportVariant: 'emerald',
  },
  {
    key: 'categorias',
    apiEntity: 'categorias',
    title: 'Categorias',
    subtitle: 'Agrupadores para qualificação e operação',
    description: 'Gerencia categorias com código, nome, tipo, descrição e observações.',
    destination: '/qualificacoes',
    icon: Tags,
    accent: 'border-amber-200 bg-amber-50 text-amber-700',
    supportedModes: ['UPSERT', 'INSERT', 'UPDATE'],
    fields: ['codigo', 'nome', 'descricao', 'tipo', 'observacoes'],
  },
  {
    key: 'historico',
    apiEntity: 'historico',
    title: 'Histórico de Qualificações',
    subtitle: 'Carga massiva de realizados e vencimentos',
    description: 'Usa CPF do funcionário, código da qualificação e data de conclusão.',
    destination: '/qualificacoes',
    icon: History,
    accent: 'border-purple-200 bg-purple-50 text-purple-700',
    supportedModes: ['UPSERT', 'INSERT'],
    fields: ['funcionario_cpf', 'qualificacao_codigo', 'data_conclusao'],
    exportType: 'qualificacoes-historico',
    exportLabel: 'Exportar Histórico',
    exportVariant: 'amber',
  },
];

const SPECIAL_OPERATIONS: SpecialOperation[] = [
  {
    title: 'Certificações - Importação legada',
    description: 'Entrada central para a carga histórica de qualificações do módulo legado.',
    destination: '/certificacoes',
    anchorId: 'fluxo-certificacoes',
  },
  {
    title: 'FRMS - Importação FIRA',
    description: 'Fluxo guiado para importar jornadas FIRA com histórico e validações próprias.',
    destination: '/frms/importacao/fira',
    anchorId: 'fluxo-frms-fira',
  },
  {
    title: 'Qualificações - Reclassificação CSV',
    description: 'Exportação e tratamento dedicados para reclassificação operacional.',
    destination: '/qualificacoes/reclassificacao',
    anchorId: 'fluxo-reclassificacao',
  },
  {
    title: 'Relatórios operacionais',
    description: 'Exports contextuais dos dashboards gerais e de acompanhamento.',
    destination: '/relatorios',
    anchorId: 'fluxo-relatorios',
  },
  {
    title: 'Simuladores - Relatórios',
    description: 'Exports CSV específicos do módulo de simuladores.',
    destination: '/simuladores/relatorios',
    anchorId: 'fluxo-simuladores-relatorios',
  },
  {
    title: 'Simuladores - Manobras',
    description: 'Entrada dedicada para a importação operacional de manobras.',
    destination: '/simuladores/cadastros/manobras',
    anchorId: 'fluxo-manobras',
  },
];

function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getAccessToken();
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  return apiFetch(input, {
    ...init,
    headers: {
      ...authHeaders,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeIssues(raw: unknown): ValidationIssue[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is ValidationIssue => !!item && typeof item === 'object');
}

function getIssueMessage(issue: ValidationIssue): string {
  if (typeof issue.erro === 'string' && issue.erro) return issue.erro;
  if (typeof issue.message === 'string' && issue.message) return issue.message;
  if (Array.isArray(issue.erros) && issue.erros.length > 0) return issue.erros.join('; ');
  return 'Erro de validação';
}

export default function ImportacaoPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedEntity, setSelectedEntity] = useState<ImportEntity>('funcionarios');
  const [selectedMode, setSelectedMode] = useState<ImportMode>('UPSERT');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [validationSummary, setValidationSummary] = useState<ValidationSummary | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  const config = useMemo(
    () => ENTITY_CONFIGS.find((entity) => entity.key === selectedEntity) || ENTITY_CONFIGS[0],
    [selectedEntity],
  );

  const handleEntityChange = (entity: ImportEntity) => {
    const nextConfig = ENTITY_CONFIGS.find((item) => item.key === entity) || ENTITY_CONFIGS[0];
    setSelectedEntity(entity);
    setSelectedMode(nextConfig.supportedModes.includes(selectedMode) ? selectedMode : 'UPSERT');
    setFile(null);
    setValidationSummary(null);
    setImportSummary(null);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] || null;
    if (event.target) event.target.value = '';
    if (!nextFile) return;

    const ext = nextFile.name.split('.').pop()?.toLowerCase();
    if (!ext || !['csv', 'xlsx', 'xls'].includes(ext)) {
      toast.error('Formato inválido. Use CSV, XLSX ou XLS.');
      return;
    }
    if (nextFile.size > MAX_FILE_SIZE) {
      toast.error(`Arquivo muito grande. Máximo ${formatFileSize(MAX_FILE_SIZE)}.`);
      return;
    }

    setFile(nextFile);
    setValidationSummary(null);
    setImportSummary(null);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const droppedFile = event.dataTransfer.files?.[0];
    if (!droppedFile) return;

    const fakeEvent = {
      target: { files: [droppedFile], value: '' },
    } as unknown as ChangeEvent<HTMLInputElement>;
    handleFileChange(fakeEvent);
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await authFetch(`/api/importacao/template/${config.apiEntity}`, {
        headers: { 'X-AirTrust-Bypass-Cache': '1' },
      });
      if (!response.ok) throw new Error('Não foi possível baixar o template.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `template-${config.apiEntity}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao baixar template');
    }
  };

  const handleValidate = async () => {
    if (!file) {
      toast.error('Selecione um arquivo antes de validar.');
      return;
    }

    setValidating(true);
    setImportSummary(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await authFetch(`/api/importacao/validar/${config.apiEntity}`, {
        method: 'POST',
        body: formData,
      });
      const data = (await response.json()) as Record<string, unknown>;

      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Erro ao validar arquivo');
      }

      const issues = normalizeIssues(data.errors || data.lista_erros);
      const totalRows = Number(data.totalRows || data.total || 0);
      const validRows = Number(data.validos || totalRows - issues.length || 0);

      setValidationSummary({
        total: totalRows,
        valid: validRows,
        invalid: issues.length,
        issues,
        preview: Array.isArray(data.preview)
          ? (data.preview as Array<Record<string, unknown>>)
          : [],
      });

      if (issues.length === 0) {
        toast.success('Validação concluída sem erros.');
      } else {
        toast.warning(`Validação concluída com ${issues.length} inconsistência(s).`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao validar arquivo');
    } finally {
      setValidating(false);
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast.error('Selecione um arquivo antes de importar.');
      return;
    }

    setImporting(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', selectedMode);

      const response = await authFetch(`/api/importacao/executar/${config.apiEntity}`, {
        method: 'POST',
        body: formData,
      });
      const data = (await response.json()) as Record<string, unknown>;

      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Erro ao importar arquivo');
      }

      const issues = normalizeIssues(data.errors);
      const summary: ImportSummary = {
        total: Number(data.totalRows || validationSummary?.total || 0),
        inserted: Number(data.inserted || 0),
        updated: Number(data.updated || 0),
        skipped: Number(data.skipped || 0),
        failed: issues.length,
        issues,
      };

      setImportSummary(summary);

      if (summary.failed === 0) {
        toast.success('Importação concluída com sucesso.');
      } else {
        toast.warning(`Importação parcial: ${summary.failed} inconsistência(s).`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao importar arquivo');
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setValidationSummary(null);
    setImportSummary(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-4">
        <SettingsSectionIntro
          badge="Fluxos centralizados"
          title="Importações e Exportações"
          description="Centralize os fluxos principais de carga e extração de dados usando os templates e exports oficiais do sistema."
          icon={<FileSpreadsheet className="h-5 w-5" />}
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {ENTITY_CONFIGS.map((entity) => {
            const Icon = entity.icon;
            const active = entity.key === selectedEntity;

            return (
              <button
                key={entity.key}
                type="button"
                onClick={() => handleEntityChange(entity.key)}
                className={`rounded-2xl border p-4 text-left transition-all ${
                  active
                    ? `${entity.accent} shadow-sm ring-2 ring-offset-2 ring-offset-white ring-slate-200`
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-white/70 p-2">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">{entity.title}</p>
                    <p className="text-xs opacity-80">{entity.subtitle}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm opacity-90">{entity.description}</p>
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Entidade selecionada
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">{config.title}</h2>
                <p className="mt-1 text-sm text-slate-500">{config.description}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-4 w-4 text-blue-600" />
                  Baixar template
                </button>
                {config.exportType && (
                  <ExportButton
                    type={config.exportType}
                    label={config.exportLabel}
                    variant={config.exportVariant}
                    className="rounded-xl"
                  />
                )}
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className="h-4 w-4" />
                  Limpar
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Campos esperados
                </p>
                <p className="mt-2 text-sm text-slate-700">{config.fields.join(', ')}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Modos disponíveis
                </p>
                <p className="mt-2 text-sm text-slate-700">{config.supportedModes.join(' / ')}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Formatos suportados
                </p>
                <p className="mt-2 text-sm text-slate-700">CSV, XLSX e XLS até 12 MB</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Exportação disponível
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  {config.exportType
                    ? 'A extração CSV desta entidade fica centralizada aqui, usando o mesmo fluxo estável já validado no módulo original.'
                    : 'Esta entidade ainda não possui exportação dedicada. Quando houver dependência de contexto operacional, use o atalho do fluxo especializado.'}
                </p>
              </div>
            </div>

            <div
              className={`mt-6 rounded-2xl border-2 border-dashed p-5 text-center transition-colors ${
                dragging
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-slate-300 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/60'
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
              />

              {file ? (
                <div className="flex flex-col items-center gap-3">
                  <FileSpreadsheet className="h-12 w-12 text-emerald-500" />
                  <div>
                    <p className="text-lg font-semibold text-slate-900">{file.name}</p>
                    <p className="text-sm text-slate-500">{formatFileSize(file.size)}</p>
                  </div>
                  <p className="text-xs text-slate-400">Clique para trocar o arquivo</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100">
                    <Upload className="h-8 w-8 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-slate-800">
                      Arraste um arquivo ou clique para selecionar
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      O sistema valida no servidor usando o schema real de{' '}
                      {config.title.toLowerCase()}.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm font-medium text-slate-600">Modo:</label>
                <select
                  value={selectedMode}
                  onChange={(event) => setSelectedMode(event.target.value as ImportMode)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  {config.supportedModes.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleValidate}
                  disabled={!file || validating || importing}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {validating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  Validar arquivo
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={!file || importing}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {importing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Importar agora
                </button>
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Hub operacional
              </p>
              <h3 className="mt-1 text-lg font-bold text-slate-900">Fluxos centralizados</h3>
            </div>

            <div className="space-y-3 text-sm text-slate-600">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                A validação usa o backend real, então planilhas CSV e Excel seguem as mesmas regras
                aplicadas na produção.
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                Use UPSERT para atualizar registros existentes sem perder o que já está cadastrado.
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                Para histórico, informe CPF do funcionário, código da qualificação e data de
                conclusão. O vencimento é calculado quando aplicável.
              </div>
            </div>

            <Link
              to={config.destination}
              className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Abrir destino após importação
            </Link>

            <div id="fluxos-especializados" className="border-t border-slate-200 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Fluxos especializados
              </p>
              <div className="mt-3 space-y-3">
                {SPECIAL_OPERATIONS.map((operation) => (
                  <Link
                    key={operation.destination}
                    id={operation.anchorId}
                    to={operation.destination}
                    className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left hover:border-slate-300 hover:bg-white"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{operation.title}</p>
                      <p className="mt-1 text-sm text-slate-600">{operation.description}</p>
                    </div>
                    <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </div>

        {validationSummary && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Validação
                </p>
                <h3 className="text-lg font-bold text-slate-900">Resumo do arquivo</h3>
              </div>
              <span
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                  validationSummary.invalid === 0
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                {validationSummary.invalid === 0 ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                {validationSummary.invalid === 0
                  ? 'Pronto para importar'
                  : 'Revisar inconsistências'}
              </span>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Total
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{validationSummary.total}</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Válidas
                </p>
                <p className="mt-2 text-2xl font-bold text-emerald-700">
                  {validationSummary.valid}
                </p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  Inconsistências
                </p>
                <p className="mt-2 text-2xl font-bold text-amber-700">
                  {validationSummary.invalid}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-700">Prévia</p>
                {validationSummary.preview.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    O backend não retornou preview para este arquivo.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          {Object.keys(validationSummary.preview[0]).map((column) => (
                            <th
                              key={column}
                              className="px-3 py-2 text-left font-semibold text-slate-600"
                            >
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {validationSummary.preview.map((row, index) => (
                          <tr key={index} className="border-t border-slate-100">
                            {Object.keys(validationSummary.preview[0]).map((column) => (
                              <td key={column} className="px-3 py-2 text-slate-700">
                                {String(row[column] ?? '') || '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold text-slate-700">
                  Principais inconsistências
                </p>
                <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200">
                  {validationSummary.issues.length === 0 ? (
                    <div className="p-4 text-sm text-emerald-700">
                      Nenhuma inconsistência encontrada.
                    </div>
                  ) : (
                    validationSummary.issues.slice(0, 30).map((issue, index) => (
                      <div
                        key={index}
                        className="border-b border-slate-100 p-4 text-sm last:border-b-0"
                      >
                        <p className="font-semibold text-slate-800">
                          Linha {issue.line || issue.linha || '—'}
                        </p>
                        <p className="mt-1 text-slate-600">{getIssueMessage(issue)}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {importSummary && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Resultado
                </p>
                <h3 className="text-lg font-bold text-slate-900">Importação executada</h3>
              </div>
              <span
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                  importSummary.failed === 0
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                {importSummary.failed === 0 ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                {importSummary.failed === 0 ? 'Concluída' : 'Parcial'}
              </span>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-5">
              {[
                {
                  label: 'Total',
                  value: importSummary.total,
                  tone: 'border-slate-200 bg-slate-50 text-slate-900',
                },
                {
                  label: 'Inseridos',
                  value: importSummary.inserted,
                  tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
                },
                {
                  label: 'Atualizados',
                  value: importSummary.updated,
                  tone: 'border-blue-200 bg-blue-50 text-blue-700',
                },
                {
                  label: 'Ignorados',
                  value: importSummary.skipped,
                  tone: 'border-slate-200 bg-slate-50 text-slate-700',
                },
                {
                  label: 'Falhas',
                  value: importSummary.failed,
                  tone: 'border-red-200 bg-red-50 text-red-700',
                },
              ].map((item) => (
                <div key={item.label} className={`rounded-xl border p-4 ${item.tone}`}>
                  <p className="text-xs font-semibold uppercase tracking-wide">{item.label}</p>
                  <p className="mt-2 text-2xl font-bold">{item.value}</p>
                </div>
              ))}
            </div>

            {importSummary.issues.length > 0 && (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-800">Falhas reportadas</p>
                <div className="mt-3 max-h-56 overflow-y-auto space-y-2">
                  {importSummary.issues.slice(0, 30).map((issue, index) => (
                    <div key={index} className="rounded-lg bg-white/70 p-3 text-sm text-red-700">
                      <span className="font-semibold">
                        Linha {issue.line || issue.linha || '—'}:
                      </span>{' '}
                      {getIssueMessage(issue)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
    </div>
  );
}
