import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Clock, Plane, Droplets, AlertTriangle, CheckCircle, Download, Ban } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import ControleVoosBreadcrumb from './components/ControleVoosBreadcrumb';
import ControleVoosStatusBadge from './components/ControleVoosStatusBadge';
import {
  useControleVoosVoo,
  useControleVoosRdv,
  useControleVoosAeroportos,
  useFinalizarPreenchimentoRdv,
  type CvAeroporto,
} from '@/react-app/hooks/useControleVoos';
import { formatDate, formatDateTime, formatTime, formatHours, formatCombustivel } from './data/controleVoosUtils';

function buildAeroMap(aeroportos: CvAeroporto[]) {
  return new Map(aeroportos.map((a) => [a.id, a]));
}

export default function ControleVoosRdvDetalhe() {
  const { id } = useParams<{ id: string }>();
  const [finalizarConfirm, setFinalizarConfirm] = useState(false);

  const { data: voo, isLoading: vooLoading, error: vooError } = useControleVoosVoo(id);
  const { data: rdv, isLoading: rdvLoading } = useControleVoosRdv(id);
  const { data: aeroportos = [] } = useControleVoosAeroportos();
  const finalizarMutation = useFinalizarPreenchimentoRdv();

  const aeroMap = buildAeroMap(aeroportos);
  const isLoading = vooLoading || rdvLoading;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="w-full">
          <ControleVoosPageShell>
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
              <p className="text-sm text-slate-500 dark:text-slate-400">Carregando RDV…</p>
            </div>
          </ControleVoosPageShell>
        </div>
      </AppLayout>
    );
  }

  if (vooError || !voo) {
    return (
      <AppLayout>
        <div className="w-full">
          <ControleVoosPageShell>
            <ControleVoosPageHeader title="Voo não encontrado" />
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              {vooError ? `Erro: ${vooError.message}` : 'O voo solicitado não existe.'}
            </p>
            <Link to="/controle-voos/rdv" className="text-blue-600 hover:underline text-sm dark:text-blue-400">
              ← Voltar para lista de RDVs
            </Link>
          </ControleVoosPageShell>
        </div>
      </AppLayout>
    );
  }

  const origem = aeroMap.get(voo.origem_id);
  const destino = aeroMap.get(voo.destino_id);

  const canFinalizar = rdv && rdv.status === 'rascunho' && !finalizarMutation.isPending;

  function handleFinalizar() {
    if (!finalizarConfirm) {
      setFinalizarConfirm(true);
      return;
    }
    if (!id) return;
    finalizarMutation.mutate(id, {
      onSuccess: () => setFinalizarConfirm(false),
      onError: () => setFinalizarConfirm(false),
    });
  }

  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosBreadcrumb items={[
            { label: 'Controle de Voos', to: '/controle-voos' },
            { label: 'RDVs', to: '/controle-voos/rdv' },
            { label: rdv ? rdv.numero : `Voo ${voo.prefixo}` },
          ]} />
          <ControleVoosPageHeader
            title={rdv ? rdv.numero : `RDV — Voo ${voo.prefixo}`}
            description={`Voo ${voo.prefixo} | ${formatDate(rdv?.data_voo || voo.data_programacao)}`}
          >
            {rdv && <ControleVoosStatusBadge status={rdv.status} className="text-sm px-3 py-1" />}
          </ControleVoosPageHeader>

          {!rdv && (
            <div className="mb-6 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-6 text-center dark:border-amber-700 dark:bg-amber-950/20">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Nenhum RDV criado para este voo.</p>
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">O RDV será criado automaticamente ao salvar os dados. Criação manual em desenvolvimento.</p>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Coluna principal */}
            <div className="lg:col-span-2 space-y-6">
              {/* Dados do voo */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Plane className="h-4 w-4 text-blue-500" /> Dados do voo
                </h2>
                <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Voo</dt>
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
                    <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Horário previsto (saída)</dt>
                    <dd className="text-slate-800 dark:text-slate-200 font-mono">{formatDateTime(voo.horario_previsto_partida)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Chegada prevista</dt>
                    <dd className="text-slate-800 dark:text-slate-200 font-mono">{formatDateTime(voo.horario_previsto_chegada)}</dd>
                  </div>
                </dl>
              </div>

              {/* Dados realizados */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-emerald-500" /> Dados realizados
                </h2>
                {rdv ? (
                  <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                    <div>
                      <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Decolagem real</dt>
                      <dd className="text-emerald-700 dark:text-emerald-300 font-mono">{formatTime(rdv.horario_decolagem_real)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Pouso real</dt>
                      <dd className="text-emerald-700 dark:text-emerald-300 font-mono">{formatTime(rdv.horario_pouso_real)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Horas voadas</dt>
                      <dd className="text-slate-800 dark:text-slate-200 font-mono">{formatHours(rdv.horas_voadas)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Pousos</dt>
                      <dd className="text-slate-800 dark:text-slate-200 font-mono">{rdv.numero_pousos ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Ciclos</dt>
                      <dd className="text-slate-800 dark:text-slate-200 font-mono">{rdv.ciclos ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">POB</dt>
                      <dd className="text-slate-800 dark:text-slate-200 font-mono">{rdv.pob ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Carga</dt>
                      <dd className="text-slate-800 dark:text-slate-200 font-mono">{rdv.carga_kg != null ? `${rdv.carga_kg} kg` : '—'}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-sm text-slate-400 dark:text-slate-500">Aguardando preenchimento do RDV.</p>
                )}
              </div>

              {/* Combustível */}
              {rdv && (
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                  <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <Droplets className="h-4 w-4 text-amber-500" /> Combustível
                  </h2>
                  <dl className="grid gap-3 sm:grid-cols-3 text-sm">
                    <div>
                      <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Decolagem</dt>
                      <dd className="text-slate-800 dark:text-slate-200 font-mono">{formatCombustivel(rdv.combustivel_decolagem)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Pouso</dt>
                      <dd className="text-slate-800 dark:text-slate-200 font-mono">{formatCombustivel(rdv.combustivel_pouso)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Consumo total</dt>
                      <dd className="text-slate-800 dark:text-slate-200 font-mono">{formatCombustivel(rdv.combustivel_consumo)}</dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Ocorrências e Divergências */}
              {rdv && (
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                  <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" /> Ocorrências e divergências
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mb-1">Ocorrências</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 rounded-lg p-3 dark:bg-slate-800">
                        {rdv.ocorrencias || 'Nenhuma ocorrência registrada.'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mb-1">Divergências do planejado</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 rounded-lg p-3 dark:bg-slate-800">
                        {rdv.divergencias || 'Nenhuma divergência registrada.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Coluna lateral */}
            <div className="space-y-6">
              {/* Preenchimento operacional */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">Preenchimento operacional</h2>
                <div className="space-y-3 text-sm">
                  {rdv?.responsavel_preenchimento_id && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Responsável (ID)</span>
                      <span className="text-slate-800 dark:text-slate-200 font-medium">{rdv.responsavel_preenchimento_id}</span>
                    </div>
                  )}
                  {rdv?.preenchido_em && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Preenchido em</span>
                      <span className="text-slate-800 dark:text-slate-200 font-medium">{formatDateTime(rdv.preenchido_em)}</span>
                    </div>
                  )}
                  {rdv?.finalizado_operacionalmente_em && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Finalizado em</span>
                      <span className="text-slate-800 dark:text-slate-200 font-medium">{formatDateTime(rdv.finalizado_operacionalmente_em)}</span>
                    </div>
                  )}
                  <p className="text-xs text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-2 mt-2">
                    Uso operacional interno — sem valor jurídico. Não é RDV oficial, DB, eDB ou registro ANAC.
                  </p>
                </div>
              </div>

              {/* Botões */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">Ações</h2>
                <div className="space-y-2">
                  {/* Finalizar preenchimento — habilitado se rascunho */}
                  {canFinalizar ? (
                    <button
                      onClick={handleFinalizar}
                      disabled={finalizarMutation.isPending}
                      className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        finalizarConfirm
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600'
                          : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-800/40'
                      }`}
                    >
                      <CheckCircle className="h-4 w-4" />
                      {finalizarMutation.isPending ? 'Finalizando…' : finalizarConfirm ? 'Confirmar finalização' : 'Finalizar preenchimento'}
                    </button>
                  ) : (
                    <button
                      disabled
                      className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500"
                      title={rdv?.status === 'preenchimento_finalizado' ? 'RDV já finalizado' : 'Nenhum RDV para finalizar'}
                    >
                      <CheckCircle className="h-4 w-4" />Finalizar preenchimento
                    </button>
                  )}

                  {finalizarConfirm && (
                    <button
                      onClick={() => setFinalizarConfirm(false)}
                      className="w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                    >
                      Cancelar
                    </button>
                  )}

                  {finalizarMutation.isError && (
                    <p className="text-xs text-red-600 dark:text-red-400">{finalizarMutation.error?.message}</p>
                  )}

                  <button
                    disabled
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500"
                    title="N1 — cancelamento em desenvolvimento"
                  >
                    <Ban className="h-4 w-4" />Cancelar RDV
                  </button>
                  <button
                    disabled
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500"
                    title="Exportação não fiscal em desenvolvimento"
                  >
                    <Download className="h-4 w-4" />Exportar (não fiscal)
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <Link to={`/controle-voos/voos/${voo.id}`} className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
                  ← Ver detalhe do voo
                </Link>
              </div>
            </div>
          </div>
        </ControleVoosPageShell>
      </div>
    </AppLayout>
  );
}
