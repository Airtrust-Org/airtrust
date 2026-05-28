import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import Button from '@/react-app/components/Button';
import { useFrmsReadAckEvents, type FrmsReadAckEvent } from '@/react-app/hooks/useFrmsReadAckEvents';
import {
  type FrmsOperationalSnapshotAlertCode,
  type FrmsOperationalSnapshotFilters,
  type FrmsOperationalSnapshotItem,
  type FrmsOperationalSnapshotStatus,
  useFrmsOperationalSnapshot,
} from '@/react-app/hooks/useFrmsOperationalSnapshot';

function getTodayLocalIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const STATUS_OPTIONS: Array<{ value: FrmsOperationalSnapshotStatus | ''; label: string }> = [
  { value: '', label: 'Todos os status' },
  { value: 'OK', label: 'OK' },
  { value: 'ATENCAO', label: 'ATENÇÃO' },
  { value: 'CRITICO', label: 'CRÍTICO' },
  { value: 'INCOMPLETO', label: 'INCOMPLETO' },
];

const ALERT_LABELS: Record<FrmsOperationalSnapshotAlertCode, string> = {
  CHECKIN_PENDENTE: 'Check-in pendente',
  CHECKIN_CRITICO: 'Check-in crítico',
  SONO_ESTIMADO: 'Sono estimado',
  SONO_INSUFICIENTE: 'Sono insuficiente',
  KSS_ALTO: 'KSS alto',
  EFETIVIDADE_BAIXA: 'Índice de efetividade baixo',
  JORNADA_SEM_FATORIZACAO: 'Sem fatorização',
  ESCALADO_SEM_JORNADA_FRMS: 'Escalado sem jornada FRMS',
  JORNADA_FRMS_SEM_ESCALA: 'Jornada FRMS sem escala',
  DADO_INCONSISTENTE: 'Dado inconsistente',
};

const READ_ACK_EVENT_LABELS: Record<string, string> = {
  CHECKIN_PENDENTE: 'Check-in pendente',
  CHECKIN_CRITICO: 'Check-in critico',
  DADO_ESTIMADO: 'Dado estimado',
  DADO_INCONSISTENTE: 'Dado inconsistente',
  JORNADA_SEM_FATORIZACAO: 'Jornada sem fatorizacao',
  EFETIVIDADE_BAIXA: 'Indice de efetividade baixo',
  QUINZENA_INCOMPLETA: 'Quinzena incompleta',
  OUTRO_CONTEXTUAL: 'Contexto operacional',
};

const SOURCE_BADGE_STYLES: Record<string, string> = {
  REAL: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ESTIMADO: 'bg-amber-50 text-amber-700 border-amber-200',
  AUSENTE: 'bg-slate-100 text-slate-700 border-slate-200',
  INCONSISTENTE: 'bg-rose-50 text-rose-700 border-rose-200',
  MANUAL: 'bg-sky-50 text-sky-700 border-sky-200',
};

function toneBySnapshotStatus(status: FrmsOperationalSnapshotStatus): string {
  switch (status) {
    case 'CRITICO':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'ATENCAO':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'INCOMPLETO':
      return 'bg-violet-50 text-violet-700 border-violet-200';
    default:
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
}

function toneByCheckinStatus(status: string): string {
  if (status === 'RECEBIDO') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'PENDENTE') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'AUSENTE') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function formatPercentage(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1)}%`;
}

function formatSleep(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1)}h`;
}

function formatQuality(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return String(value);
}

function formatKss(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return String(value);
}

function formatTripulante(item: FrmsOperationalSnapshotItem): string {
  return item.nome_guerra || item.nome || `#${item.funcionario_id}`;
}

function formatMinutesAsHours(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value / 60).toFixed(1)}h`;
}

function toneByFortnightStatus(status: string | null | undefined): string {
  if (status === 'CRITICO') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'ATENCAO') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'INCOMPLETO') return 'bg-violet-50 text-violet-700 border-violet-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

function SnapshotMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function SourceBadge({ value }: { value: string }) {
  const style = SOURCE_BADGE_STYLES[value] || 'bg-slate-100 text-slate-700 border-slate-200';
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${style}`}>{value}</span>;
}

function toneByReadAckSeverity(severity: FrmsReadAckEvent['severity']): string {
  if (severity === 'CRITICO') return 'bg-red-50 text-red-700 border-red-200';
  if (severity === 'ATENCAO') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (severity === 'INCOMPLETO') return 'bg-violet-50 text-violet-700 border-violet-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function formatReadAckEventLabel(event: FrmsReadAckEvent): string {
  return READ_ACK_EVENT_LABELS[event.event_type] || event.event_type;
}

export default function FrmsControleOperacional() {
  const today = useMemo(() => getTodayLocalIsoDate(), []);

  const [draft, setDraft] = useState<FrmsOperationalSnapshotFilters>({
    data_inicio: today,
    data_fim: today,
    funcionario_id: '',
    base: '',
    aeronave: '',
    status: '',
    include_inconsistencies: true,
  });

  const [appliedFilters, setAppliedFilters] = useState<FrmsOperationalSnapshotFilters>(draft);

  const { data, summary, loading, error, unauthorized, refetch } =
    useFrmsOperationalSnapshot(appliedFilters);
  const readAck = useFrmsReadAckEvents(appliedFilters);

  const hasEstimatedData = useMemo(
    () =>
      data.some(
        (item) => item.sleep_data_source === 'ESTIMADO' || item.wake_data_source === 'ESTIMADO',
      ),
    [data],
  );

  const handleApplyFilters = () => {
    setAppliedFilters({ ...draft });
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">Controle Operacional de Fadiga</h1>
          <p className="mt-1 text-sm text-slate-500">
            Visão consolidada de escala, check-in, jornada e fadiga para apoio à coordenação.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm text-slate-700">
              Data início
              <input
                type="date"
                value={draft.data_inicio}
                onChange={(e) => setDraft((prev) => ({ ...prev, data_inicio: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-700">
              Data fim
              <input
                type="date"
                value={draft.data_fim}
                onChange={(e) => setDraft((prev) => ({ ...prev, data_fim: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-700">
              Base
              <input
                type="text"
                value={draft.base || ''}
                placeholder="Ex.: SBSP"
                onChange={(e) => setDraft((prev) => ({ ...prev, base: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-700">
              Aeronave
              <input
                type="text"
                value={draft.aeronave || ''}
                placeholder="Ex.: AW139"
                onChange={(e) => setDraft((prev) => ({ ...prev, aeronave: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-700">
              Status
              <select
                value={draft.status || ''}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    status: e.target.value as FrmsOperationalSnapshotStatus | '',
                  }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-700">
              Funcionário (ID)
              <input
                type="text"
                value={draft.funcionario_id || ''}
                placeholder="Ex.: 123"
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, funcionario_id: e.target.value.replace(/[^\d]/g, '') }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-7 inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(draft.include_inconsistencies)}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, include_inconsistencies: e.target.checked }))
                }
              />
              Incluir inconsistências
            </label>
            <div className="mt-6 flex items-center gap-2">
              <Button onClick={handleApplyFilters}>Atualizar</Button>
              <Button variant="secondary" onClick={() => void refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>

        {hasEstimatedData && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            Há dados estimados neste período (sono e/ou hora de acordar).
          </div>
        )}

        {unauthorized && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Sem autorização para visualizar este snapshot. Faça login novamente ou valide seu perfil.
          </div>
        )}

        {error && !unauthorized && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <SnapshotMetric label="Tripulantes no snapshot" value={summary.total_tripulantes} />
          <SnapshotMetric label="Escalados" value={summary.total_escalados} />
          <SnapshotMetric label="Check-ins recebidos" value={summary.checkins_recebidos} />
          <SnapshotMetric label="Check-ins pendentes" value={summary.checkins_pendentes} />
          <SnapshotMetric label="Alertas críticos" value={summary.alertas_criticos} />
          <SnapshotMetric label="Alertas de atenção" value={summary.alertas_atencao} />
          <SnapshotMetric label="Dados estimados" value={summary.dados_estimados} />
          <SnapshotMetric label="Inconsistências" value={summary.inconsistencias} />
          <SnapshotMetric label="Sem fatorização" value={summary.sem_fatorizacao} />
          <SnapshotMetric label="Quinzena incompleta" value={summary.quinzena_incompleta} />
          <SnapshotMetric label="Quinzena atenção" value={summary.quinzena_atencao} />
          <SnapshotMetric label="Quinzena crítica" value={summary.quinzena_critica} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Ciência operacional FRMS</h2>
              <p className="mt-1 text-sm text-slate-500">
                Eventos D1 derivados do snapshot. Registro de ciência, sem mitigação ou decisão automática.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                Pendentes {readAck.summary.pending}
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                Cientes {readAck.summary.acked}
              </span>
              <Button size="sm" variant="secondary" onClick={() => void readAck.refetch()} disabled={readAck.loading}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={() => void readAck.generateEvents()} loading={readAck.mutating}>
                Gerar eventos
              </Button>
            </div>
          </div>

          {readAck.error && (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {readAck.error}
            </div>
          )}

          <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {readAck.loading ? (
              <div className="p-4 text-sm text-slate-500">Carregando eventos D1...</div>
            ) : readAck.events.length === 0 ? (
              <div className="p-4 text-sm text-slate-500">
                Nenhum evento D1 persistido para os filtros atuais.
              </div>
            ) : (
              readAck.events.slice(0, 8).map((event) => (
                <div key={event.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneByReadAckSeverity(event.severity)}`}
                      >
                        {event.severity}
                      </span>
                      <span className="text-sm font-semibold text-slate-900">
                        {formatReadAckEventLabel(event)}
                      </span>
                      <span className="text-xs text-slate-500">
                        {event.data_operacional} · {event.funcionario_nome || `ID ${event.funcionario_id}`}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Fonte: {event.source}; status snapshot {event.snapshot_status}; fontes sono/despertar/jornada:{' '}
                      {event.sleep_data_source}/{event.wake_data_source}/{event.jornada_data_source}.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {event.status === 'ACKED' ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Ciente
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void readAck.acknowledgeEvent(event.id)}
                        loading={readAck.mutating}
                      >
                        Registrar ciência
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-0 shadow-sm">
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">Carregando snapshot operacional...</div>
          ) : data.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Nenhum dado para os filtros informados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3 text-left">Data</th>
                    <th className="px-3 py-3 text-left">Tripulante</th>
                    <th className="px-3 py-3 text-left">Função</th>
                    <th className="px-3 py-3 text-left">Base</th>
                    <th className="px-3 py-3 text-left">Aeronave</th>
                    <th className="px-3 py-3 text-left">Escalado</th>
                    <th className="px-3 py-3 text-left">Jornada</th>
                    <th className="px-3 py-3 text-left">Check-in</th>
                    <th className="px-3 py-3 text-left">Sono</th>
                    <th className="px-3 py-3 text-left">Qualidade</th>
                    <th className="px-3 py-3 text-left">KSS</th>
                    <th className="px-3 py-3 text-left">Índice de efetividade</th>
                    <th className="px-3 py-3 text-left">Quinzena</th>
                    <th className="px-3 py-3 text-left">Status</th>
                    <th className="px-3 py-3 text-left">Alertas</th>
                    <th className="px-3 py-3 text-left">Fonte dos dados</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item) => (
                    <tr key={`${item.data_operacional}-${item.funcionario_id}`} className="border-t border-slate-200 align-top">
                      <td className="px-3 py-3 text-slate-700">{item.data_operacional}</td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-slate-900">{formatTripulante(item)}</div>
                        <div className="text-xs text-slate-500">ID {item.funcionario_id}</div>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{item.funcao || '—'}</td>
                      <td className="px-3 py-3 text-slate-700">{item.base || '—'}</td>
                      <td className="px-3 py-3 text-slate-700">{item.aeronave || '—'}</td>
                      <td className="px-3 py-3 text-slate-700">{item.escalado ? 'Sim' : 'Não'}</td>
                      <td className="px-3 py-3 text-slate-700">
                        {item.teve_jornada
                          ? `${item.hora_apresentacao || '--:--'} → ${item.hora_termino || '--:--'}`
                          : 'Sem jornada'}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneByCheckinStatus(item.checkin_status)}`}>
                          {item.checkin_status}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-slate-700">{formatSleep(item.horas_sono)}</div>
                        {item.sleep_data_source === 'ESTIMADO' && (
                          <div className="text-xs text-amber-700">Sono estimado</div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-700">{formatQuality(item.qualidade_sono)}</td>
                      <td className="px-3 py-3 text-slate-700">{formatKss(item.kss_score)}</td>
                      <td className="px-3 py-3">
                        <div className="text-slate-700">{formatPercentage(item.effectiveness_pct)}</div>
                        {item.fatorizacao_status === 'AUSENTE' && item.teve_jornada && (
                          <div className="text-xs text-rose-700">Sem fatorização</div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {item.fortnight_indicator ? (
                          <div className="space-y-1">
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneByFortnightStatus(item.fortnight_indicator.status_quinzena)}`}
                            >
                              {item.fortnight_indicator.status_quinzena === 'ATENCAO'
                                ? 'ATENÇÃO'
                                : item.fortnight_indicator.status_quinzena}
                            </span>
                            <div className="text-xs text-slate-700">
                              Dia {item.fortnight_indicator.dia_periodo ?? '—'}/
                              {item.fortnight_indicator.total_dias_periodo ?? '—'}
                            </div>
                            <div className="text-xs text-slate-500">
                              Jornadas: {item.fortnight_indicator.jornadas_periodo ?? '—'} · Duty:{' '}
                              {formatMinutesAsHours(item.fortnight_indicator.duty_time_periodo_min)}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              <SourceBadge value={item.fortnight_indicator.fonte_periodo} />
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneBySnapshotStatus(item.snapshot_status)}`}>
                          {item.snapshot_status === 'ATENCAO' ? 'ATENÇÃO' : item.snapshot_status}
                        </span>
                        {item.snapshot_status === 'CRITICO' && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-red-700">
                            <ShieldAlert className="h-3 w-3" /> Requer avaliação da coordenação
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {item.alertas.length > 0 ? (
                            item.alertas.map((alerta) => (
                              <span
                                key={`${item.funcionario_id}-${item.data_operacional}-${alerta}`}
                                className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700"
                              >
                                {ALERT_LABELS[alerta] || alerta}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          <SourceBadge value={item.sleep_data_source} />
                          <SourceBadge value={item.wake_data_source} />
                          <SourceBadge value={item.jornada_data_source} />
                        </div>
                        {item.wake_data_source === 'ESTIMADO' && (
                          <div className="mt-1 text-xs text-amber-700">Acordar estimado</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
