import { Link, useParams } from 'react-router-dom';
import { Clock, Users, FileText, Shield, CheckCircle, XCircle } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import ControleVoosBreadcrumb from './components/ControleVoosBreadcrumb';
import ControleVoosStatusBadge from './components/ControleVoosStatusBadge';
import {
  getVooById,
  getAeroportoById,
  getAeronaveById,
  getTipoVooById,
  getNaturezaVooById,
  getTripulacaoByVooId,
  getRdvByVooId,
} from './data/controleVoosMockData';
import { formatDate, formatDateTime, funcaoLabel } from './data/controleVoosUtils';

export default function ControleVoosVooDetalhe() {
  const { id } = useParams<{ id: string }>();
  const voo = id ? getVooById(id) : undefined;

  if (!voo) {
    return (
      <AppLayout>
        <div className="w-full">
          <ControleVoosPageShell>
            <ControleVoosPageHeader title="Voo não encontrado" />
            <p className="text-slate-500">O voo solicitado não existe nos dados demonstrativos.</p>
            <Link to="/controle-voos/voos" className="text-blue-600 hover:underline text-sm">← Voltar para lista de voos</Link>
          </ControleVoosPageShell>
        </div>
      </AppLayout>
    );
  }

  const origem = getAeroportoById(voo.origemId);
  const destino = getAeroportoById(voo.destinoId);
  const aeronave = getAeronaveById(voo.aeronaveId);
  const tipoVoo = getTipoVooById(voo.tipoId);
  const naturezaVoo = getNaturezaVooById(voo.naturezaId);
  const tripulacao = getTripulacaoByVooId(voo.id);
  const rdv = getRdvByVooId(voo.id);

  const statusTimeline = [
    { status: 'planejado', label: 'Planejado', done: true },
    { status: 'liberado', label: 'Liberado', done: ['liberado', 'em_voo', 'pousado', 'concluido'].includes(voo.status) },
    { status: 'em_voo', label: 'Em Voo', done: ['em_voo', 'pousado', 'concluido'].includes(voo.status) },
    { status: 'pousado', label: 'Pousado', done: ['pousado', 'concluido'].includes(voo.status) },
    { status: voo.status === 'cancelado' ? 'cancelado' : 'concluido', label: voo.status === 'cancelado' ? 'Cancelado' : 'Concluído', done: voo.status === 'concluido', isCancel: voo.status === 'cancelado' },
  ];

  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosBreadcrumb items={[
            { label: 'Controle de Voos', to: '/controle-voos' },
            { label: 'Voos', to: '/controle-voos/voos' },
            { label: voo.prefixo },
          ]} />
          <ControleVoosPageHeader title={`Voo ${voo.prefixo}`} description={`${origem?.codigoIcao || '—'} → ${destino?.codigoIcao || '—'} | ${formatDate(voo.dataProgramacao)}`}>
            <ControleVoosStatusBadge status={voo.status} className="text-sm px-3 py-1" />
          </ControleVoosPageHeader>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Coluna principal */}
            <div className="lg:col-span-2 space-y-6">
              {/* Dados gerais */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">Dados gerais</h2>
                <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                  <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Prefixo</dt><dd className="text-slate-800 dark:text-slate-200 font-medium">{voo.prefixo}</dd></div>
                  <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Aeronave</dt><dd className="text-slate-800 dark:text-slate-200">{aeronave?.matricula || '—'} — {aeronave?.modelo || ''}</dd></div>
                  <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Origem</dt><dd className="text-slate-800 dark:text-slate-200">{origem?.codigoIcao} — {origem?.nome}</dd></div>
                  <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Destino</dt><dd className="text-slate-800 dark:text-slate-200">{destino?.codigoIcao} — {destino?.nome}</dd></div>
                  <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Tipo de Voo</dt><dd className="text-slate-800 dark:text-slate-200">{tipoVoo?.nome || '—'}</dd></div>
                  <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Natureza</dt><dd className="text-slate-800 dark:text-slate-200">{naturezaVoo?.nome || '—'}</dd></div>
                  <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Horário Previsto</dt><dd className="text-slate-800 dark:text-slate-200 font-mono">{formatDateTime(voo.horarioPrevisto)}</dd></div>
                  <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Chegada Prevista</dt><dd className="text-slate-800 dark:text-slate-200 font-mono">{formatDateTime(voo.horarioChegadaPrevisto)}</dd></div>
                  {voo.horarioRealPartida && (
                    <>
                      <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Partida Real</dt><dd className="text-emerald-700 dark:text-emerald-300 font-mono">{formatDateTime(voo.horarioRealPartida)}</dd></div>
                      <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Chegada Real</dt><dd className="text-emerald-700 dark:text-emerald-300 font-mono">{formatDateTime(voo.horarioRealChegada)}</dd></div>
                    </>
                  )}
                </dl>
                {voo.observacoes && (
                  <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3 dark:bg-amber-950/20 dark:border-amber-800">
                    <p className="text-sm text-amber-800 dark:text-amber-200"><strong>Observações:</strong> {voo.observacoes}</p>
                  </div>
                )}
              </div>

              {/* Timeline de status */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">Status do voo</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  {statusTimeline.map((step, i) => (
                    <span key={i} className="flex items-center gap-2">
                      {i > 0 && <span className={`h-0.5 w-8 ${step.done || step.isCancel ? 'bg-emerald-300 dark:bg-emerald-600' : 'bg-slate-200 dark:bg-slate-700'}`} />}
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                        step.isCancel ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                        step.done ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' :
                        'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                      }`}>
                        {step.isCancel ? <XCircle className="h-3.5 w-3.5" /> : step.done ? <CheckCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                        {step.label}
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Tripulação */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">Tripulação</h2>
                {tripulacao.length > 0 ? (
                  <div className="space-y-2">
                    {tripulacao.map((tv) => {
                      const t = tv.tripulante;
                      return (
                        <div key={tv.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                          <div className="flex items-center gap-3">
                            <Users className="h-4 w-4 text-slate-400" />
                            <div>
                              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{t.nome}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{funcaoLabel(tv.funcao)} · {t.designacao} · Mat. {t.matricula}</p>
                            </div>
                          </div>
                          <ControleVoosStatusBadge status={t.frmsStatus === 'bloqueado' ? 'bloqueado' : t.frmsStatus === 'atencao' ? 'atencao' : 'ok'} />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 dark:text-slate-500">Nenhum tripulante alocado.</p>
                )}
              </div>
            </div>

            {/* Coluna lateral */}
            <div className="space-y-6">
              {/* Verificações informativas — demonstrativas, hardcoded no protótipo N0 */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2"><Shield className="h-4 w-4 text-blue-500" /> Verificações (demonstrativo)</h2>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between"><span className="text-slate-600 dark:text-slate-400">Qualificações</span><span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">✅ Tripulantes aptos</span></div>
                  <div className="flex items-center justify-between"><span className="text-slate-600 dark:text-slate-400">CMA / ASO</span><span className="text-amber-600 dark:text-amber-400 text-xs font-medium">⚠️ 1 vence em 7 dias</span></div>
                  <div className="flex items-center justify-between"><span className="text-slate-600 dark:text-slate-400">FRMS</span><span className="text-red-600 dark:text-red-400 text-xs font-medium">🚫 1 tripulante BLOQUEADO</span></div>
                  <div className="flex items-center justify-between"><span className="text-slate-600 dark:text-slate-400">Disponibilidade da aeronave</span><span className={`text-xs font-medium ${aeronave?.status === 'disponivel' || aeronave?.status === 'em_voo' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{aeronave?.status === 'disponivel' || aeronave?.status === 'em_voo' ? '✅ Disponível' : '🚫 Indisponível'}</span></div>
                  <div className="flex items-center justify-between"><span className="text-slate-600 dark:text-slate-400">Conflito de Escala</span><span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">✅ Sem conflitos</span></div>
                </div>
              </div>

              {/* Link RDV */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2"><FileText className="h-4 w-4 text-purple-500" /> RDV</h2>
                {rdv ? (
                  <div className="space-y-2">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Nº {rdv.numero}</p>
                    <ControleVoosStatusBadge status={rdv.status} />
                    <div className="mt-3">
                      <Link to={`/controle-voos/rdv/${rdv.id}`} className="inline-flex items-center text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">Abrir RDV →</Link>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 dark:text-slate-500">RDV ainda não criado. Disponível após conclusão do voo.</p>
                )}
              </div>

              {/* Botões operacionais (desabilitados) */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">Ações</h2>
                <div className="space-y-2">
                  <button disabled className="w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500" title="Protótipo — liberação de voo indisponível nesta prévia">Liberar Voo</button>
                  <button disabled className="w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500" title="Protótipo — cancelamento de voo indisponível nesta prévia">Cancelar Voo</button>
                  <button disabled className="w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500" title="Protótipo — alteração de tripulação indisponível nesta prévia">Alterar Tripulação</button>
                  <button disabled className="w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500" title="Protótipo — atualização operacional indisponível nesta prévia">Atualizar Status</button>
                </div>
              </div>
            </div>
          </div>
        </ControleVoosPageShell>
      </div>
    </AppLayout>
  );
}
