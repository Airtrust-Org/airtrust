import { useEffect, useState } from 'react';
import { AlertTriangle, Calendar, Loader2, RefreshCw } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import { fetchWithAuth } from '@/react-app/config/api';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import ControleVoosStatusBadge from './components/ControleVoosStatusBadge';
import { formatDate, formatHours } from './data/controleVoosUtils';

type SnapshotStatus = 'OK' | 'ATENCAO' | 'CRITICO' | 'INCOMPLETO';
type JornadaDataSource = 'REAL' | 'MANUAL' | 'ESTIMADO' | 'AUSENTE' | 'INCONSISTENTE';
type SnapshotResponse = {
  success: boolean;
  data?: SnapshotItem[];
  error?: string;
};

type SnapshotItem = {
  data_operacional: string;
  funcionario_id: number;
  nome: string | null;
  funcao: string | null;
  aeronave: string | null;
  hora_apresentacao: string | null;
  hora_termino: string | null;
  horas_voo_minutos: number;
  duracao_jornada_minutos: number;
  teve_jornada: boolean;
  escalado: boolean;
  escala_source: 'SIGVOOS' | 'MANUAL' | 'EVD' | 'AUSENTE';
  jornada_data_source: JornadaDataSource;
  jornada_origem: string | null;
  snapshot_status: SnapshotStatus;
  alertas: string[];
};

type AcumuloFrotaResponse = {
  success: boolean;
  data?: Array<{
    tripulante_id: string;
    hv_mes_min: number;
  }>;
  error?: string;
};

type JornadaViewRow = {
  data: string;
  funcionarioId: number;
  nome: string;
  funcao: string;
  aeronave: string | null;
  horaApresentacao: string | null;
  horaTermino: string | null;
  horasVooMinutos: number;
  duracaoJornadaMinutos: number;
  horasVooMesMin: number | null;
  origemDado: string;
  qualidadeDado: JornadaDataSource;
  estado: 'realizado' | 'planejado' | 'estimado' | 'incompleto' | 'inconsistente' | 'ausente';
  statusFrms: SnapshotStatus;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; rows: JornadaViewRow[] };

const STATUS_OPTIONS: Array<{ value: '' | SnapshotStatus; label: string }> = [
  { value: '', label: 'Todos os status' },
  { value: 'OK', label: 'OK' },
  { value: 'ATENCAO', label: 'Atenção' },
  { value: 'CRITICO', label: 'Crítico' },
  { value: 'INCOMPLETO', label: 'Incompleto' },
];

function getDefaultDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function mapEstado(item: SnapshotItem): JornadaViewRow['estado'] {
  if (item.jornada_data_source === 'INCONSISTENTE' || item.alertas.includes('DADO_INCONSISTENTE')) {
    return 'inconsistente';
  }
  if (item.snapshot_status === 'INCOMPLETO') return 'incompleto';
  if (item.jornada_data_source === 'ESTIMADO') return 'estimado';
  if (item.teve_jornada) return 'realizado';
  if (item.escalado) return 'planejado';
  return 'ausente';
}

function formatClock(value: string | null): string {
  return value || '—';
}

function formatSource(item: SnapshotItem): string {
  if (item.jornada_origem?.trim()) return item.jornada_origem.trim();
  return item.escala_source;
}

function formatQualityLabel(value: JornadaDataSource): string {
  switch (value) {
    case 'REAL':
      return 'Real';
    case 'MANUAL':
      return 'Manual';
    case 'ESTIMADO':
      return 'Estimado';
    case 'INCONSISTENTE':
      return 'Inconsistente';
    default:
      return 'Ausente';
  }
}

function qualityBadgeClass(value: JornadaDataSource): string {
  switch (value) {
    case 'REAL':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
    case 'MANUAL':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    case 'ESTIMADO':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    case 'INCONSISTENTE':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  }
}

function formatEstadoLabel(value: JornadaViewRow['estado']): string {
  switch (value) {
    case 'realizado':
      return 'Realizado';
    case 'planejado':
      return 'Planejado';
    case 'estimado':
      return 'Estimado';
    case 'incompleto':
      return 'Incompleto';
    case 'inconsistente':
      return 'Inconsistente';
    default:
      return 'Ausente';
  }
}

function formatEstadoClass(value: JornadaViewRow['estado']): string {
  switch (value) {
    case 'realizado':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
    case 'planejado':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    case 'estimado':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    case 'incompleto':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
    case 'inconsistente':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  }
}

function mapFrmsStatus(status: SnapshotStatus): 'ok' | 'atencao' | 'critico' | 'alerta' {
  switch (status) {
    case 'OK':
      return 'ok';
    case 'ATENCAO':
      return 'atencao';
    case 'CRITICO':
      return 'critico';
    default:
      return 'alerta';
  }
}

function buildRows(snapshot: SnapshotItem[], monthlyFlightByCrew: Map<string, number>): JornadaViewRow[] {
  return snapshot
    .map((item) => ({
      data: item.data_operacional,
      funcionarioId: item.funcionario_id,
      nome: item.nome || `Tripulante #${item.funcionario_id}`,
      funcao: item.funcao || '—',
      aeronave: item.aeronave,
      horaApresentacao: item.hora_apresentacao,
      horaTermino: item.hora_termino,
      horasVooMinutos: item.horas_voo_minutos || 0,
      duracaoJornadaMinutos: item.duracao_jornada_minutos || 0,
      horasVooMesMin: monthlyFlightByCrew.get(String(item.funcionario_id)) ?? null,
      origemDado: formatSource(item),
      qualidadeDado: item.jornada_data_source,
      estado: mapEstado(item),
      statusFrms: item.snapshot_status,
    }))
    .sort((a, b) => {
      const statusOrder = { CRITICO: 0, INCOMPLETO: 1, ATENCAO: 2, OK: 3 };
      const byStatus = statusOrder[a.statusFrms] - statusOrder[b.statusFrms];
      if (byStatus !== 0) return byStatus;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
}

async function loadJornadas(selectedDate: string, statusFilter: '' | SnapshotStatus, signal?: AbortSignal) {
  const snapshotParams = new URLSearchParams({
    data_inicio: selectedDate,
    data_fim: selectedDate,
    include_inconsistencies: 'true',
  });
  if (statusFilter) snapshotParams.set('status', statusFilter);

  const [snapshotResponse, monthlyResponse] = await Promise.all([
    fetchWithAuth(`/api/frms/operational-snapshot?${snapshotParams.toString()}`, { signal }),
    fetchWithAuth(`/api/frms/acumulo-frota?mes=${selectedDate.slice(0, 7)}`, { signal }),
  ]);

  const snapshotPayload = (await snapshotResponse.json()) as SnapshotResponse;
  const monthlyPayload = (await monthlyResponse.json()) as AcumuloFrotaResponse;

  if (!snapshotResponse.ok || !snapshotPayload.success || !snapshotPayload.data) {
    throw new Error(snapshotPayload.error || `Erro HTTP ${snapshotResponse.status}`);
  }

  if (!monthlyResponse.ok || !monthlyPayload.success || !monthlyPayload.data) {
    throw new Error(monthlyPayload.error || `Erro HTTP ${monthlyResponse.status}`);
  }

  const monthlyFlightByCrew = new Map(
    monthlyPayload.data.map((item) => [String(item.tripulante_id), Number(item.hv_mes_min) || 0]),
  );

  return buildRows(snapshotPayload.data, monthlyFlightByCrew);
}

export default function ControleVoosJornadas() {
  const [selectedDate, setSelectedDate] = useState(getDefaultDate);
  const [statusFilter, setStatusFilter] = useState<'' | SnapshotStatus>('');
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    void loadJornadas(selectedDate, statusFilter, controller.signal)
      .then((rows) => setState({ status: 'success', rows }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Falha ao carregar jornadas operacionais.',
        });
      });

    return () => controller.abort();
  }, [reloadKey, selectedDate, statusFilter]);

  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosPageHeader
            title="Jornadas Operacionais"
            description="Contrato real atual: snapshot operacional FRMS do dia selecionado, com horas de voo mensais vindas do acumulado de frota."
          >
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <Calendar className="h-4 w-4 text-slate-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="bg-transparent outline-none"
                />
              </label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as '' | SnapshotStatus)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setReloadKey((current) => current + 1)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <RefreshCw className="h-4 w-4" />
                Atualizar
              </button>
            </div>
          </ControleVoosPageHeader>

          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-200">
            Exibe apenas tripulantes operacionais filtrados no backend FRMS. Voo/RDV e evidência documental ainda não fazem parte deste contrato.
          </div>

          {state.status === 'loading' && (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-400" />
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Carregando jornadas operacionais…</p>
            </div>
          )}

          {state.status === 'error' && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-950/20">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">Erro ao carregar jornadas operacionais.</p>
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{state.message}</p>
            </div>
          )}

          {state.status === 'success' && state.rows.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center dark:border-slate-700 dark:bg-slate-900">
              <AlertTriangle className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                Nenhuma jornada operacional encontrada para {formatDate(selectedDate)} com os filtros atuais.
              </p>
            </div>
          )}

          {state.status === 'success' && state.rows.length > 0 && (
            <>
              <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
                Data operacional: {formatDate(selectedDate)}. Horas de voo do mês referem-se a {selectedDate.slice(5, 7)}/{selectedDate.slice(0, 4)}.
              </p>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Data</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Tripulante</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Função</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Apresentação</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Término</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-300">Horas voo (dia)</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-300">Jornada (dia)</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-300">Horas voo (mês)</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Aeronave</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Fonte</th>
                        <th className="px-4 py-3 text-center font-medium text-slate-600 dark:text-slate-300">Qualidade</th>
                        <th className="px-4 py-3 text-center font-medium text-slate-600 dark:text-slate-300">Estado</th>
                        <th className="px-4 py-3 text-center font-medium text-slate-600 dark:text-slate-300">Status FRMS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {state.rows.map((row) => (
                        <tr key={`${row.funcionarioId}-${row.data}`} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatDate(row.data)}</td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-800 dark:text-slate-200">{row.nome}</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500">ID {row.funcionarioId}</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{row.funcao}</td>
                          <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">{formatClock(row.horaApresentacao)}</td>
                          <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">{formatClock(row.horaTermino)}</td>
                          <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300">
                            {formatHours(row.horasVooMinutos / 60)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300">
                            {formatHours(row.duracaoJornadaMinutos / 60)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-slate-600 dark:text-slate-400">
                            {row.horasVooMesMin == null ? '—' : formatHours(row.horasVooMesMin / 60)}
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{row.aeronave || '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{row.origemDado}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${qualityBadgeClass(row.qualidadeDado)}`}>
                              {formatQualityLabel(row.qualidadeDado)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${formatEstadoClass(row.estado)}`}>
                              {formatEstadoLabel(row.estado)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <ControleVoosStatusBadge status={mapFrmsStatus(row.statusFrms)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </ControleVoosPageShell>
      </div>
    </AppLayout>
  );
}
