import { Link, useParams } from 'react-router-dom';
import { Clock, FileText, Shield, CheckCircle, XCircle } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import ControleVoosBreadcrumb from './components/ControleVoosBreadcrumb';
import ControleVoosStatusBadge from './components/ControleVoosStatusBadge';
import EdbShadowReadinessCard from './components/EdbShadowReadinessCard';
import {
  useControleVoosVoo,
  useControleVoosRdv,
  useControleVoosAeroportos,
  type CvAeroporto,
  type CvFlightStatus,
} from '@/react-app/hooks/useControleVoos';
import { formatDate, formatDateTime } from './data/controleVoosUtils';

function buildAeroMap(aeroportos: CvAeroporto[]) {
  return new Map(aeroportos.map((a) => [a.id, a]));
}

const N1_STATUS_ORDER: CvFlightStatus[] = [
  'planejado',
  'liberado_operacionalmente',
  'em_andamento',
  'pousado',
  'concluido_operacionalmente',
];

function StatusTimeline({ status }: { status: CvFlightStatus }) {
  const isCanceled = status === 'cancelado';
  const isAlternated = status === 'alternado_divergido';
  const currentIdx = N1_STATUS_ORDER.indexOf(status);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {N1_STATUS_ORDER.map((step, i) => {
        const done = isCanceled ? i === 0 : isAlternated ? i <= 3 : currentIdx >= i;
        const isTerminal = i === N1_STATUS_ORDER.length - 1;
        return (
          <span key={step} className="flex items-center gap-2">
            {i > 0 && (
              <span className={`h-0.5 w-8 ${done ? 'bg-emerald-300 dark:bg-emerald-600' : 'bg-slate-200 dark:bg-slate-700'}`} />
            )}
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              done
                ? isTerminal
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
            }`}>
              {done ? <CheckCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
              <ControleVoosStatusBadge status={step} className="bg-transparent text-inherit px-0 py-0 text-xs" />
            </span>
          </span>
        );
      })}
      {(isCanceled || isAlternated) && (
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-8 bg-red-300 dark:bg-red-600" />
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            isCanceled
              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
          }`}>
            <XCircle className="h-3.5 w-3.5" />
            {isCanceled ? 'Cancelado' : 'Alternado/Divergido'}
          </span>
        </span>
      )}
    </div>
  );
}

export default function ControleVoosVooDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { data: voo, isLoading, error } = useControleVoosVoo(id);
  const { data: rdv } = useControleVoosRdv(id);
  const { data: aeroportos = [] } = useControleVoosAeroportos();

  const aeroMap = buildAeroMap(aeroportos);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="w-full">
          <ControleVoosPageShell>
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
              <p className="text-sm text-slate-500 dark:text-slate-400">Carregando voo…</p>
            </div>
          </ControleVoosPageShell>
        </div>
      </AppLayout>
    );
  }

  if (error || !voo) {
    return (
      <AppLayout>
        <div className="w-full">
          <ControleVoosPageShell>
            <ControleVoosPageHeader title="Voo não encontrado" />
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              {error ? `Erro: ${error.message}` : 'O voo solicitado não existe.'}
            </p>
            <Link to="/controle-voos/voos" className="text-blue-600 hover:underline text-sm dark:text-blue-400">
              ← Voltar para lista de voos
            </Link>
          </ControleVoosPageShell>
        </div>
      </AppLayout>
    );
  }

  const origem = aeroMap.get(voo.origem_id);
  const destino = aeroMap.get(voo.destino_id);

  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosBreadcrumb items={[
            { label: 'Controle de Voos', to: '/controle-voos' },
            { label: 'Voos', to: '/controle-voos/voos' },
            { label: voo.prefixo },
          ]} />
          <ControleVoosPageHeader
            title={`Voo ${voo.prefixo}`}
            description={`${origem?.codigo_icao || `ID:${voo.origem_id}`} → ${destino?.codigo_icao || `ID:${voo.destino_id}`} | ${formatDate(voo.data_programacao)}`}
          >
            <ControleVoosStatusBadge status={voo.status} className="text-sm px-3 py-1" />
          </ControleVoosPageHeader>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">Dados gerais</h2>
                <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Prefixo</dt>
                    <dd className="text-slate-800 dark:text-slate-200 font-medium">{voo.prefixo}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Aeronave (ID)</dt>
                    <dd className="text-slate-800 dark:text-slate-200">{voo.aeronave_id ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Origem</dt>
                    <dd className="text-slate-800 dark:text-slate-200">
                      {origem ? `${origem.codigo_icao} — ${origem.nome}` : `ID:${voo.origem_id}`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Destino</dt>
                    <dd className="text-slate-800 dark:text-slate-200">
                      {destino ? `${destino.codigo_icao} — ${destino.nome}` : `ID:${voo.destino_id}`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Tipo de voo (ID)</dt>
                    <dd className="text-slate-800 dark:text-slate-200">{voo.tipo_voo_id}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Natureza (ID)</dt>
                    <dd className="text-slate-800 dark:text-slate-200">{voo.natureza_voo_id}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Horário previsto (saída)</dt>
                    <dd className="text-slate-800 dark:text-slate-200 font-mono">{formatDateTime(voo.horario_previsto_partida)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Chegada prevista</dt>
                    <dd className="text-slate-800 dark:text-slate-200 font-mono">{formatDateTime(voo.horario_previsto_chegada)}</dd>
                  </div>
                  {voo.horario_real_partida && (
                    <>
                      <div>
                        <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Partida real</dt>
                        <dd className="text-emerald-700 dark:text-emerald-300 font-mono">{formatDateTime(voo.horario_real_partida)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Chegada real</dt>
                        <dd className="text-emerald-700 dark:text-emerald-300 font-mono">{formatDateTime(voo.horario_real_chegada)}</dd>
                      </div>
                    </>
                  )}
                </dl>
                {voo.observacoes && (
                  <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3 dark:bg-amber-950/20 dark:border-amber-800">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      <strong>Observações:</strong> {voo.observacoes}
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">Status do voo</h2>
                <StatusTimeline status={voo.status} />
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">Tripulação</h2>
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  Dados de tripulação não disponíveis nesta versão N1 — endpoint em desenvolvimento.
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-500" /> Verificações (demonstrativo)
                </h2>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Qualificações</span>
                    <span className="text-slate-400 dark:text-slate-500 text-xs">—</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400">CMA / ASO</span>
                    <span className="text-slate-400 dark:text-slate-500 text-xs">—</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400">FRMS</span>
                    <span className="text-slate-400 dark:text-slate-500 text-xs">—</span>
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-2 mt-2">
                    Verificações automáticas não disponíveis no N1 — implementação futura.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-purple-500" /> RDV
                </h2>
                {rdv ? (
                  <div className="space-y-2">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Nº {rdv.numero}</p>
                    <ControleVoosStatusBadge status={rdv.status} />
                    <div className="mt-3">
                      <Link
                        to={`/controle-voos/rdv/${voo.id}`}
                        className="inline-flex items-center text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Abrir RDV →
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-400 dark:text-slate-500">Nenhum RDV criado para este voo.</p>
                    <Link
                      to={`/controle-voos/rdv/${voo.id}`}
                      className="inline-flex items-center text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Ir para RDV →
                    </Link>
                  </div>
                )}
              </div>

              <EdbShadowReadinessCard flightId={voo.id} />

              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">Ações</h2>
                <div className="space-y-2">
                  {(['Liberar Voo', 'Cancelar Voo', 'Alterar Tripulação', 'Atualizar Status'] as const).map((label) => (
                    <button
                      key={label}
                      disabled
                      className="w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500"
                      title="N1 — ação em desenvolvimento"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </ControleVoosPageShell>
      </div>
    </AppLayout>
  );
}
