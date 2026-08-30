import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Link2,
  Loader2,
  RefreshCw,
  Save,
  Server,
  Users,
  X,
} from 'lucide-react';
import { API_BASE_URL, getAccessToken } from '../../../config/api';
import { useFuncionariosAtivos } from '@/react-app/hooks/qualificacoes/useFuncionariosAtivos';
import type { FuncionarioResumo } from '@/react-app/services/qualificacoes';
import { showToast } from '../../../utils/toast';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import { SettingsSectionIntro } from '../components/SettingsSectionIntro';

type SigvoosStatus = 'PROCESSANDO' | 'SUCESSO' | 'ERRO' | string;

interface SigvoosConfig {
  username: string;
  system: string;
  base_url: string;
  hasPassword: boolean;
  password_configured?: boolean;
  auto_sync_enabled: boolean;
  auto_sync_hora_utc: number;
  last_sync_to?: string | null;
}

interface SigvoosSummary {
  totalRegistrosBrutos?: number;
  totalImportados?: number;
  totalErros?: number;
  totalRegistrosNormalizados?: number;
}

interface SigvoosManualMapping {
  id: string;
  nome_sigvoos: string;
  canac_sigvoos: string | null;
  funcionario_id: string;
  funcionario_nome: string;
  funcionario_matricula: string | null;
  created_at: string;
  updated_at: string;
}

interface SigvoosJornadaPendente {
  id: string;
  nome_sigvoos: string;
  identificador_sigvoos: string | null;
  canac_sigvoos: string | null;
  competencia: string;
  jornadas: number;
  motivo: string;
  status: 'PENDENTE' | 'RESOLVIDO';
  created_at: string;
  updated_at: string;
}

interface SigvoosUnmappedTripulante {
  nome_sigvoos: string;
  identificador_sigvoos: string | null;
  jornadas_perdidas: number;
  primeira_competencia: string | null;
  ultima_competencia: string | null;
  ultimo_evento_em: string | null;
}

interface SigvoosPayload {
  from?: string;
  to?: string;
}

interface SigvoosEvent {
  id: string;
  tipo_evento: string;
  status: SigvoosStatus;
  payload_json: string | null;
  resposta_json: string | null;
  erro_ultima: string | null;
  created_at: string;
  updated_at: string;
}

interface SigvoosEventParsed extends SigvoosEvent {
  payload: SigvoosPayload;
  summary: SigvoosSummary;
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR');
}

function formatIsoDatePtBr(value?: string): string {
  if (!value) return '-';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function formatPeriodPtBr(from?: string, to?: string): string {
  const fromLabel = formatIsoDatePtBr(from);
  const toLabel = formatIsoDatePtBr(to);
  return `${fromLabel} ate ${toLabel}`;
}

function compareSigvoosEventsByPeriodDesc(a: SigvoosEventParsed, b: SigvoosEventParsed): number {
  const fromCompare = String(b.payload.from || '').localeCompare(String(a.payload.from || ''));
  if (fromCompare !== 0) return fromCompare;

  const toCompare = String(b.payload.to || '').localeCompare(String(a.payload.to || ''));
  if (toCompare !== 0) return toCompare;

  return String(b.created_at || '').localeCompare(String(a.created_at || ''));
}

function parseIsoDayToMs(value?: string): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRangeCoveredBySuccesses(
  erro: SigvoosEventParsed,
  successEvents: SigvoosEventParsed[],
): boolean {
  const erroFrom = parseIsoDayToMs(erro.payload.from);
  const erroTo = parseIsoDayToMs(erro.payload.to);
  if (erroFrom == null || erroTo == null || erroFrom > erroTo) return false;

  const intervals = successEvents
    .map((item) => {
      const from = parseIsoDayToMs(item.payload.from);
      const to = parseIsoDayToMs(item.payload.to);
      if (from == null || to == null || from > to) return null;
      return { from, to };
    })
    .filter((value): value is { from: number; to: number } => Boolean(value))
    .sort((a, b) => a.from - b.from);

  let cursor = erroFrom;
  for (const interval of intervals) {
    if (interval.to < cursor) continue;
    if (interval.from > cursor) return false;
    cursor = Math.max(cursor, interval.to + 86400000);
    if (cursor > erroTo) return true;
  }

  return cursor > erroTo;
}

function filterUnresolvedSigvoosErrors(eventos: SigvoosEventParsed[]): SigvoosEventParsed[] {
  const ordered = [...eventos].sort(
    (a, b) => Date.parse(String(a.created_at || '')) - Date.parse(String(b.created_at || '')),
  );
  const successEvents = ordered.filter((item) => item.status === 'SUCESSO');

  const unresolved: SigvoosEventParsed[] = [];
  for (let index = 0; index < ordered.length; index++) {
    const evento = ordered[index];
    if (evento.status !== 'ERRO') {
      unresolved.push(evento);
      continue;
    }

    const covered = isRangeCoveredBySuccesses(evento, successEvents);
    if (!covered) {
      unresolved.push(evento);
    }
  }

  return unresolved.sort(compareSigvoosEventsByPeriodDesc);
}

function addIsoDays(value: string, days: number): string {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function statusBadge(status: SigvoosStatus): string {
  if (status === 'SUCESSO') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (status === 'ERRO') return 'bg-rose-100 text-rose-700 border-rose-200';
  return 'bg-amber-100 text-amber-800 border-amber-200';
}

export function SigvoosEventDetail({
  error,
  status,
}: {
  error?: string | null;
  status: SigvoosStatus;
}) {
  if (error) {
    return (
      <span className="inline-flex items-start gap-1 text-xs text-rose-700">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5" /> Falha na sincronização
      </span>
    );
  }

  if (status === 'SUCESSO') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> Sem erro
      </span>
    );
  }

  return <span className="text-xs text-amber-700">Execucao em andamento</span>;
}

export default function IntegracoesEdApp() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [config, setConfig] = useState<SigvoosConfig>({
    username: '',
    system: 'sigtrip',
    base_url: 'https://api.sigvoos.com.br/api',
    hasPassword: false,
    auto_sync_enabled: true,
    auto_sync_hora_utc: 19,
  });
  const [password, setPassword] = useState('');

  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [clearExisting, setClearExisting] = useState(false);
  const [pageSize, setPageSize] = useState(200);
  const [maxPages, setMaxPages] = useState(2);

  const [eventos, setEventos] = useState<SigvoosEventParsed[]>([]);
  const [mapeamentos, setMapeamentos] = useState<SigvoosManualMapping[]>([]);
  const [naoMapeados, setNaoMapeados] = useState<SigvoosUnmappedTripulante[]>([]);
  const [pendencias, setPendencias] = useState<SigvoosJornadaPendente[]>([]);
  const [mappingTarget, setMappingTarget] = useState<SigvoosUnmappedTripulante | null>(null);
  const [selectedFuncionarioId, setSelectedFuncionarioId] = useState('');
  const [savingMapping, setSavingMapping] = useState(false);
  const [providerReady, setProviderReady] = useState<boolean | null>(null);
  const { data: funcionariosAtivos = [] } = useFuncionariosAtivos();

  const token = getAccessToken() || '';

  const fetchConfigAndHealth = useCallback(async () => {
    const [configRes, pingRes] = await Promise.all([
      fetch(`${API_BASE_URL}/integracoes/sigvoos/config`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`${API_BASE_URL}/integracoes/sigvoos/ping`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    const [configData, pingData] = await Promise.all([configRes.json(), pingRes.json()]);

    if (configData?.success) {
      setConfig({
        username: configData.data?.username || '',
        system: configData.data?.system || 'sigtrip',
        base_url: configData.data?.base_url || 'https://api.sigvoos.com.br/api',
        hasPassword: Boolean(configData.data?.hasPassword ?? configData.data?.password_configured),
        password_configured: Boolean(
          configData.data?.password_configured ?? configData.data?.hasPassword,
        ),
        auto_sync_enabled: Boolean(configData.data?.auto_sync_enabled ?? true),
        auto_sync_hora_utc: Number(configData.data?.auto_sync_hora_utc ?? 19),
        last_sync_to: configData.data?.last_sync_to || null,
      });

      const today = new Date().toISOString().slice(0, 10);
      const suggestedFrom = configData.data?.last_sync_to
        ? addIsoDays(String(configData.data.last_sync_to), 1)
        : today;
      setFrom(suggestedFrom);
      setTo(today);
    }

    setProviderReady(Boolean(pingData?.success));
  }, [token]);

  const fetchHistorico = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/integracoes/sigvoos/historico?limit=30`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!data?.success) {
      throw new Error(data?.error || 'Falha ao carregar historico SIGVOOS.');
    }

    const parsed = (data.data || []).map((item: SigvoosEvent) => ({
      ...item,
      payload: safeJsonParse<SigvoosPayload>(item.payload_json, {}),
      summary: safeJsonParse<SigvoosSummary>(item.resposta_json, {}),
    }));

    setEventos(parsed.sort(compareSigvoosEventsByPeriodDesc));
  }, [token]);

  const fetchMappings = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/integracoes/sigvoos/mapeamento-manual`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!data?.success) {
      throw new Error(data?.error || 'Falha ao carregar mapeamentos SIGVOOS.');
    }

    setMapeamentos(Array.isArray(data.data?.mapeamentos) ? data.data.mapeamentos : []);
    setNaoMapeados(Array.isArray(data.data?.naoMapeados) ? data.data.naoMapeados : []);
  }, [token]);

  const fetchPendencias = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/integracoes/sigvoos/pendentes?limit=200`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data?.success) {
      setPendencias(Array.isArray(data.data) ? data.data : []);
    }
  }, [token]);

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        fetchConfigAndHealth(),
        fetchHistorico(),
        fetchMappings(),
        fetchPendencias(),
      ]);
    } catch (error) {
      console.error(error);
      showToast.error('Falha ao carregar central SIGVOOS.');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [fetchConfigAndHealth, fetchHistorico, fetchMappings, fetchPendencias]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const eventosVisiveis = useMemo(() => filterUnresolvedSigvoosErrors(eventos), [eventos]);

  const metricas = useMemo(() => {
    const total = eventosVisiveis.length;
    const sucesso = eventosVisiveis.filter((e) => e.status === 'SUCESSO').length;
    const erro = eventosVisiveis.filter((e) => e.status === 'ERRO').length;
    const processando = eventosVisiveis.filter((e) => e.status === 'PROCESSANDO').length;

    const totais = eventosVisiveis.reduce(
      (acc, evento) => {
        acc.brutos += Number(evento.summary.totalRegistrosBrutos || 0);
        acc.importados += Number(evento.summary.totalImportados || 0);
        acc.erros += Number(evento.summary.totalErros || 0);
        return acc;
      },
      { brutos: 0, importados: 0, erros: 0 },
    );

    return { total, sucesso, erro, processando, ...totais };
  }, [eventosVisiveis]);

  const salvarConfig = async () => {
    setSaving(true);
    try {
      const payload: Record<string, string | boolean | number> = {
        username: config.username,
        system: config.system,
        base_url: config.base_url,
        auto_sync_enabled: config.auto_sync_enabled,
        auto_sync_hora_utc: config.auto_sync_hora_utc,
      };
      if (password.trim()) {
        payload.password = password.trim();
      }

      const res = await fetch(`${API_BASE_URL}/integracoes/sigvoos/config`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!data?.success) {
        throw new Error(data?.error || 'Nao foi possivel salvar configuracao SIGVOOS.');
      }

      setConfig((prev) => ({
        ...prev,
        hasPassword: Boolean(data.data?.hasPassword ?? data.data?.password_configured),
        password_configured: Boolean(data.data?.password_configured ?? data.data?.hasPassword),
        auto_sync_enabled: Boolean(data.data?.auto_sync_enabled ?? prev.auto_sync_enabled),
        auto_sync_hora_utc: Number(data.data?.auto_sync_hora_utc ?? prev.auto_sync_hora_utc),
      }));
      setPassword('');
      showToast.success('Configuracao SIGVOOS salva com sucesso.');
    } catch (error) {
      console.error(error);
      showToast.error(error instanceof Error ? error.message : 'Falha ao salvar configuracao.');
    } finally {
      setSaving(false);
    }
  };

  const executarSincronizacao = async () => {
    const fromFinal =
      from || (config.last_sync_to ? addIsoDays(String(config.last_sync_to), 1) : '');
    const toFinal = to || new Date().toISOString().slice(0, 10);

    if (!fromFinal || !toFinal) {
      showToast.error('Nao foi possivel determinar o periodo de sincronizacao.');
      return;
    }

    if (fromFinal > toFinal) {
      showToast.error('A data inicial nao pode ser maior que a final.');
      return;
    }

    if (clearExisting) {
      const ok = await confirmDialog(
        'Esta operacao remove registros existentes no intervalo antes de importar o SIGVOOS. Deseja continuar?',
        {
          title: 'Substituir base FRMS do periodo?',
          confirmText: 'Sim, substituir',
          cancelText: 'Cancelar',
        },
      );
      if (!ok) return;
    }

    setSyncing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/integracoes/sigvoos/sincronizar-frms`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromFinal,
          to: toFinal,
          clearExisting,
          pageSize,
          maxPages,
          chunkDays: 1,
          retryAttempts: 1,
          username: config.username,
          password: password.trim() || undefined,
          system: config.system,
          baseUrl: config.base_url,
        }),
      });

      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || 'Falha na sincronizacao SIGVOOS.');
      }

      const resumo = data.data || {};
      showToast.success(
        `Sync concluido: ${resumo.totalImportados || 0} importados, ${resumo.totalErros || 0} erros.`,
      );
      await Promise.all([fetchHistorico(), fetchMappings()]);
    } catch (error) {
      console.error(error);
      showToast.error(error instanceof Error ? error.message : 'Erro ao sincronizar SIGVOOS.');
    } finally {
      setSyncing(false);
    }
  };

  const reconciliarPendencias = async () => {
    setReconciling(true);
    try {
      const res = await fetch(`${API_BASE_URL}/integracoes/sigvoos/reconciliar-pendencias`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pageSize: Math.min(pageSize, 100),
          maxPages: Math.min(maxPages, 1),
          chunkDays: 1,
          retryAttempts: 1,
          maxWindows: 3,
          username: config.username,
          password: password.trim() || undefined,
          system: config.system,
          baseUrl: config.base_url,
        }),
      });

      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || 'Falha ao reconciliar pendencias SIGVOOS.');
      }

      const reconciliado = Number(data?.data?.totalJanelasExecutadas || 0);
      const importados = Number(data?.data?.totalImportados || 0);
      const restantes = Number(data?.data?.totalPendenciasRestantes || 0);
      showToast.success(
        `Reconciliação concluída: ${reconciliado} janelas, ${importados} importados, ${restantes} pendências restantes.`,
      );
      await Promise.all([fetchHistorico(), fetchMappings()]);
    } catch (error) {
      console.error(error);
      showToast.error(error instanceof Error ? error.message : 'Erro ao reconciliar pendências.');
    } finally {
      setReconciling(false);
    }
  };

  const salvarMapeamentoManual = async () => {
    if (!mappingTarget || !selectedFuncionarioId) {
      showToast.error('Selecione um funcionário ativo para concluir o vínculo.');
      return;
    }

    setSavingMapping(true);
    try {
      const res = await fetch(`${API_BASE_URL}/integracoes/sigvoos/mapear`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nome_sigvoos: mappingTarget.nome_sigvoos,
          canac_sigvoos: mappingTarget.identificador_sigvoos,
          funcionario_id: selectedFuncionarioId,
        }),
      });
      const data = await res.json();

      if (!data?.success) {
        throw new Error(data?.error || 'Falha ao salvar o vínculo manual.');
      }

      const resolvidos = Number(data?.data?.reprocessamento?.totalResolvidos || 0);
      const importados = Number(data?.data?.reprocessamento?.totalImportados || 0);
      showToast.success(
        `Vínculo salvo e reprocessado: ${resolvidos} pendências resolvidas, ${importados} jornadas importadas.`,
      );
      setMappingTarget(null);
      setSelectedFuncionarioId('');
      await Promise.all([fetchMappings(), fetchHistorico(), fetchPendencias()]);
    } catch (error) {
      console.error(error);
      showToast.error(error instanceof Error ? error.message : 'Falha ao salvar vínculo manual.');
    } finally {
      setSavingMapping(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando central SIGVOOS...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsSectionIntro
        icon={<Activity className="h-5 w-5" />}
        title="Integracao SIGVOOS"
        description="Monitore a ingestao de voos no FRMS, configure credenciais e execute sincronizacoes controladas por periodo."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Status provider
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Server className="h-4 w-4" />
            {providerReady ? 'Conectado' : 'Indisponivel'}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Execucoes</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{metricas.total}</p>
          <p className="mt-1 text-xs text-slate-500">
            {metricas.sucesso} sucesso, {metricas.erro} erro, {metricas.processando} processando
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Registros brutos
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{metricas.brutos}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Importados FRMS
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{metricas.importados}</p>
          <p className="mt-1 text-xs text-slate-500">Erros reportados: {metricas.erros}</p>
        </div>
        <div
          className={`rounded-2xl border p-4 shadow-sm ${pendencias.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Pendências FRMS
          </p>
          <p
            className={`mt-2 text-2xl font-semibold ${pendencias.length > 0 ? 'text-amber-700' : 'text-slate-900'}`}
          >
            {pendencias.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {pendencias.length > 0 ? 'Tripulantes sem vínculo ativo' : 'Nenhuma pendência'}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Credenciais e endpoint</h3>
            <button
              type="button"
              onClick={fetchAll}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Atualizar
            </button>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              Usuario SIGVOOS
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={config.username}
                onChange={(e) => setConfig((prev) => ({ ...prev, username: e.target.value }))}
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Senha SIGVOOS {config.hasPassword ? '(ja cadastrada)' : ''}
              <input
                type="password"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Preencha para atualizar"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Sistema
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={config.system}
                onChange={(e) => setConfig((prev) => ({ ...prev, system: e.target.value }))}
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Base URL
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={config.base_url}
                onChange={(e) => setConfig((prev) => ({ ...prev, base_url: e.target.value }))}
              />
            </label>

            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
                Sincronização automática (cron diário)
              </p>
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded"
                    checked={config.auto_sync_enabled}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, auto_sync_enabled: e.target.checked }))
                    }
                  />
                  Ativar sync automático
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  Hora UTC
                  <input
                    type="number"
                    min={0}
                    max={23}
                    className="w-16 rounded-xl border border-slate-200 px-2 py-1 text-sm"
                    value={config.auto_sync_hora_utc}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        auto_sync_hora_utc: Math.min(23, Math.max(0, Number(e.target.value) || 0)),
                      }))
                    }
                    disabled={!config.auto_sync_enabled}
                  />
                  <span className="text-xs text-slate-400">
                    (
                    {config.auto_sync_hora_utc - 3 < 0
                      ? config.auto_sync_hora_utc - 3 + 24
                      : config.auto_sync_hora_utc - 3}
                    h BRT)
                  </span>
                </label>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Quando ativo, a coleta de voos do dia anterior + reprocessamento FRMS rodará
                automaticamente todo dia às {config.auto_sync_hora_utc}h UTC.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={salvarConfig}
            disabled={saving}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            <Save className="h-4 w-4" /> {saving ? 'Salvando...' : 'Salvar configuracao'}
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-base font-semibold text-slate-900">Sincronizacao FRMS</h3>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Data inicial
              <input
                type="date"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Data final
              <input
                type="date"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              pageSize
              <input
                type="number"
                min={1}
                max={500}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={pageSize}
                onChange={(e) =>
                  setPageSize(Math.min(500, Math.max(1, Number(e.target.value) || 1)))
                }
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              maxPages
              <input
                type="number"
                min={1}
                max={500}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={maxPages}
                onChange={(e) =>
                  setMaxPages(Math.min(500, Math.max(1, Number(e.target.value) || 1)))
                }
              />
            </label>
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={clearExisting}
              onChange={(e) => setClearExisting(e.target.checked)}
            />
            Limpar registros existentes no periodo antes de importar
          </label>

          <button
            type="button"
            onClick={executarSincronizacao}
            disabled={syncing}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Activity className="h-4 w-4" />
            )}
            {syncing ? 'Sincronizando...' : 'Executar sincronizacao'}
          </button>

          <button
            type="button"
            onClick={reconciliarPendencias}
            disabled={reconciling || syncing}
            className="mt-2 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {reconciling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {reconciling ? 'Reconciliando...' : 'Reconciliar pendencias nao resolvidas'}
          </button>

          <p className="mt-3 text-xs text-slate-500">
            Dica operacional: mantenha lotes diarios na reconciliacao. O backend agora trava em
            janelas pequenas para respeitar o limite de subrequests do Worker.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-base font-semibold text-slate-900">
          Campos que o SIGVOOS fornece
        </h3>
        <div className="grid gap-2 text-sm text-slate-700 md:grid-cols-2">
          <div>- Tripulante: id interno, nome, inscricao/CANAC</div>
          <div>- Data da etapa e numero da perna</div>
          <div>- Aeronave: matricula (registration)</div>
          <div>- Operacao: tipo de voo, numero de relatorio, numero do voo</div>
          <div>- Origem e destino (ICAO)</div>
          <div>- Horarios: acionamento, decolagem, pouso, corte</div>
          <div>- Tempos: total, navegacao, ifr, noturno, decolagem/pouso</div>
          <div>- Landings e starts: pousos dia/noite, partidas</div>
          <div>- Carga operacional: passageiros, payload</div>
          <div>- Combustivel: inicio e fim</div>
          <div>- Cliente e contrato</div>
          <div>- Payload bruto completo para auditoria/reprocessamento</div>
        </div>
      </div>

      {pendencias.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-amber-900">
                Fila de pendências estruturadas
              </h3>
              <p className="mt-1 text-sm text-amber-700">
                Jornadas SIGVOOS aguardando vínculo. Use "Vincular ao funcionário" abaixo para
                resolver cada entrada e reprocessar automaticamente.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-800">
              <AlertTriangle className="h-4 w-4" /> {pendencias.length} pendente
              {pendencias.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-amber-200 text-left text-xs uppercase tracking-wide text-amber-700">
                  <th className="px-3 py-2">Tripulante SIGVOOS</th>
                  <th className="px-3 py-2">Identificador</th>
                  <th className="px-3 py-2">Competência</th>
                  <th className="px-3 py-2">Jornadas</th>
                  <th className="px-3 py-2">Motivo</th>
                  <th className="px-3 py-2">Atualizado</th>
                  <th className="px-3 py-2">Ação</th>
                </tr>
              </thead>
              <tbody>
                {pendencias.map((p) => (
                  <tr key={p.id} className="border-b border-amber-100 text-slate-700">
                    <td className="px-3 py-2 font-medium">{p.nome_sigvoos}</td>
                    <td className="px-3 py-2">
                      {p.identificador_sigvoos || p.canac_sigvoos || 'Sem identificador'}
                    </td>
                    <td className="px-3 py-2">{p.competencia}</td>
                    <td className="px-3 py-2">{p.jornadas}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{p.motivo}</td>
                    <td className="px-3 py-2 text-xs">{formatDateTime(p.updated_at)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          setMappingTarget({
                            nome_sigvoos: p.nome_sigvoos,
                            identificador_sigvoos: p.identificador_sigvoos || p.canac_sigvoos,
                            jornadas_perdidas: p.jornadas,
                            primeira_competencia: p.competencia,
                            ultima_competencia: p.competencia,
                            ultimo_evento_em: p.updated_at,
                          });
                          setSelectedFuncionarioId('');
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50"
                      >
                        <Link2 className="h-3.5 w-3.5" /> Vincular
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Tripulantes nao mapeados no AirTrust
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Quando o match automatico falha, vincule manualmente o nome/identificador SIGVOOS a um
              funcionario ativo e rode a reconciliacao em seguida.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
            <Users className="h-4 w-4" /> {naoMapeados.length} pendencias abertas
          </div>
        </div>

        {naoMapeados.length === 0 ? (
          <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-800">
            Nenhum tripulante SIGVOOS segue sem mapeamento nas ultimas execucoes registradas.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Tripulante SIGVOOS</th>
                  <th className="px-3 py-2">Identificador</th>
                  <th className="px-3 py-2">Jornadas perdidas</th>
                  <th className="px-3 py-2">Competencias</th>
                  <th className="px-3 py-2">Ultimo evento</th>
                  <th className="px-3 py-2">Acao</th>
                </tr>
              </thead>
              <tbody>
                {naoMapeados.map((item) => (
                  <tr
                    key={`${item.nome_sigvoos}-${item.identificador_sigvoos || 'sem-id'}`}
                    className="border-b border-slate-100 text-slate-700"
                  >
                    <td className="px-3 py-2 font-medium">{item.nome_sigvoos}</td>
                    <td className="px-3 py-2">
                      {item.identificador_sigvoos || 'Sem identificador'}
                    </td>
                    <td className="px-3 py-2">{item.jornadas_perdidas}</td>
                    <td className="px-3 py-2">
                      {item.primeira_competencia && item.ultima_competencia
                        ? `${item.primeira_competencia} ate ${item.ultima_competencia}`
                        : '-'}
                    </td>
                    <td className="px-3 py-2">{formatDateTime(item.ultimo_evento_em)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          setMappingTarget(item);
                          setSelectedFuncionarioId('');
                        }}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Link2 className="h-3.5 w-3.5" /> Vincular ao funcionario
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {mapeamentos.length > 0 ? (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <h4 className="text-sm font-semibold text-slate-900">Mapeamentos manuais ativos</h4>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">SIGVOOS</th>
                    <th className="px-3 py-2">Identificador</th>
                    <th className="px-3 py-2">Funcionario</th>
                    <th className="px-3 py-2">Atualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {mapeamentos.slice(0, 10).map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-slate-100 text-slate-700 last:border-b-0"
                    >
                      <td className="px-3 py-2 font-medium">{item.nome_sigvoos}</td>
                      <td className="px-3 py-2">{item.canac_sigvoos || 'Sem identificador'}</td>
                      <td className="px-3 py-2">
                        {item.funcionario_nome}
                        {item.funcionario_matricula ? ` (${item.funcionario_matricula})` : ''}
                      </td>
                      <td className="px-3 py-2">{formatDateTime(item.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-base font-semibold text-slate-900">Historico de execucoes</h3>

        {eventosVisiveis.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
            Nenhum evento SIGVOOS encontrado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Periodo</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Brutos</th>
                  <th className="px-3 py-2">Importados</th>
                  <th className="px-3 py-2">Erros</th>
                  <th className="px-3 py-2">Criado em</th>
                  <th className="px-3 py-2">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {eventosVisiveis.map((evento) => (
                  <tr
                    key={evento.id}
                    className="border-b border-slate-100 align-top text-slate-700"
                  >
                    <td className="px-3 py-2 font-medium">
                      {formatPeriodPtBr(evento.payload.from, evento.payload.to)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadge(evento.status)}`}
                      >
                        {evento.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">{evento.summary.totalRegistrosBrutos || 0}</td>
                    <td className="px-3 py-2">{evento.summary.totalImportados || 0}</td>
                    <td className="px-3 py-2">{evento.summary.totalErros || 0}</td>
                    <td className="px-3 py-2">{formatDateTime(evento.created_at)}</td>
                    <td className="px-3 py-2">
                      <SigvoosEventDetail error={evento.erro_ultima} status={evento.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {mappingTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Vinculo manual SIGVOOS
                </p>
                <h3 className="mt-1 text-lg font-semibold text-slate-950">
                  {mappingTarget.nome_sigvoos}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Identificador SIGVOOS:{' '}
                  {mappingTarget.identificador_sigvoos || 'Sem identificador'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (savingMapping) return;
                  setMappingTarget(null);
                  setSelectedFuncionarioId('');
                }}
                className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Funcionario ativo
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={selectedFuncionarioId}
                  onChange={(e) => setSelectedFuncionarioId(e.target.value)}
                >
                  <option value="">Selecione um funcionario</option>
                  {(funcionariosAtivos as FuncionarioResumo[]).map((funcionario) => (
                    <option key={funcionario.id} value={String(funcionario.id)}>
                      {funcionario.nome}
                      {funcionario.matricula ? ` (${funcionario.matricula})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-slate-500">
                O vinculo manual tem prioridade sobre CANAC, matricula e nome. Use apenas quando o
                match automatico nao for suficiente.
              </p>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (savingMapping) return;
                  setMappingTarget(null);
                  setSelectedFuncionarioId('');
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvarMapeamentoManual}
                disabled={savingMapping || !selectedFuncionarioId}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {savingMapping ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                {savingMapping ? 'Salvando...' : 'Salvar vinculo'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
