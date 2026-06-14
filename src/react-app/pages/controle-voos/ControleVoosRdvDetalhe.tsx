import { Link, useParams } from 'react-router-dom';
import { Clock, Plane, Droplets, AlertTriangle, CheckCircle, Download, Ban } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import ControleVoosBreadcrumb from './components/ControleVoosBreadcrumb';
import ControleVoosStatusBadge from './components/ControleVoosStatusBadge';
import { MOCK_RDVS, getVooById, getAeroportoById, getAeronaveById, getTripulacaoByVooId } from './data/controleVoosMockData';
import { formatDate, formatDateTime, formatTime, formatHours, formatCombustivel, funcaoLabel } from './data/controleVoosUtils';

export default function ControleVoosRdvDetalhe() {
  const { id } = useParams<{ id: string }>();
  const rdv = id ? MOCK_RDVS.find((r) => r.id === id) : undefined;

  if (!rdv) {
    return (
      <AppLayout>
        <div className="w-full">
          <ControleVoosPageShell>
            <ControleVoosPageHeader title="RDV não encontrado" />
            <p className="text-slate-500">O RDV solicitado não existe nos dados demonstrativos.</p>
            <Link to="/controle-voos/rdv" className="text-blue-600 hover:underline text-sm">← Voltar para lista de RDVs</Link>
          </ControleVoosPageShell>
        </div>
      </AppLayout>
    );
  }

  const voo = getVooById(rdv.vooId);
  const origem = voo ? getAeroportoById(voo.origemId) : undefined;
  const destino = voo ? getAeroportoById(voo.destinoId) : undefined;
  const aeronave = voo ? getAeronaveById(voo.aeronaveId) : undefined;
  const tripulacao = voo ? getTripulacaoByVooId(voo.id) : [];

  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosBreadcrumb items={[
            { label: 'Controle de Voos', to: '/controle-voos' },
            { label: 'RDVs', to: '/controle-voos/rdv' },
            { label: rdv.numero },
          ]} />
          <ControleVoosPageHeader title={rdv.numero} description={voo ? `Voo ${voo.prefixo} | ${formatDate(rdv.dataVoo)}` : ''}>
            <ControleVoosStatusBadge status={rdv.status} className="text-sm px-3 py-1" />
          </ControleVoosPageHeader>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Coluna principal */}
            <div className="lg:col-span-2 space-y-6">
              {/* Dados planejados */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2"><Plane className="h-4 w-4 text-blue-500" /> Dados do voo</h2>
                <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                  <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Voo</dt><dd className="text-slate-800 dark:text-slate-200 font-medium">{voo?.prefixo || '—'}</dd></div>
                  <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Aeronave</dt><dd className="text-slate-800 dark:text-slate-200">{aeronave?.matricula || '—'} — {aeronave?.modelo || ''}</dd></div>
                  <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Origem</dt><dd className="text-slate-800 dark:text-slate-200">{origem?.codigoIcao} — {origem?.nome}</dd></div>
                  <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Destino</dt><dd className="text-slate-800 dark:text-slate-200">{destino?.codigoIcao} — {destino?.nome}</dd></div>
                  <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Horário previsto</dt><dd className="text-slate-800 dark:text-slate-200 font-mono">{voo ? formatDateTime(voo.horarioPrevisto) : '—'}</dd></div>
                  <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Chegada prevista</dt><dd className="text-slate-800 dark:text-slate-200 font-mono">{voo ? formatDateTime(voo.horarioChegadaPrevisto) : '—'}</dd></div>
                </dl>
              </div>

              {/* Dados reais */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2"><Clock className="h-4 w-4 text-emerald-500" /> Dados realizados</h2>
                <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                  <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Decolagem real</dt><dd className="text-emerald-700 dark:text-emerald-300 font-mono">{formatDateTime(rdv.horarioDecolagemReal)}</dd></div>
                  <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Pouso real</dt><dd className="text-emerald-700 dark:text-emerald-300 font-mono">{formatDateTime(rdv.horarioPousoReal)}</dd></div>
                  <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Horas voadas</dt><dd className="text-slate-800 dark:text-slate-200 font-mono">{formatHours(rdv.horasVoadas)}</dd></div>
                  <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Número de pousos / ciclos</dt><dd className="text-slate-800 dark:text-slate-200 font-mono">{rdv.numeroPousos ?? '—'}</dd></div>
                </dl>
              </div>

              {/* Combustível */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2"><Droplets className="h-4 w-4 text-amber-500" /> Combustível</h2>
                <dl className="grid gap-3 sm:grid-cols-3 text-sm">
                  <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Decolagem</dt><dd className="text-slate-800 dark:text-slate-200 font-mono">{formatCombustivel(rdv.combustivelDecolagem)}</dd></div>
                  <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Pouso</dt><dd className="text-slate-800 dark:text-slate-200 font-mono">{formatCombustivel(rdv.combustivelPouso)}</dd></div>
                  <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Consumo total</dt><dd className="text-slate-800 dark:text-slate-200 font-mono">{formatCombustivel(rdv.combustivelConsumo)}</dd></div>
                </dl>
              </div>

              {/* Ocorrências e Divergências */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Ocorrências e divergências</h2>
                <div className="space-y-4">
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-slate-500 mb-1">Ocorrências</dt>
                    <dd className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 rounded-lg p-3 dark:bg-slate-800">{rdv.ocorrencias || 'Nenhuma ocorrência registrada.'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-slate-500 mb-1">Divergências do planejado</dt>
                    <dd className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 rounded-lg p-3 dark:bg-slate-800">{rdv.divergencias || 'Nenhuma divergência registrada.'}</dd>
                  </div>
                </div>
              </div>

              {/* Tripulação */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">Tripulação no voo</h2>
                {tripulacao.length > 0 ? (
                  <div className="space-y-2">
                    {tripulacao.map((tv) => (
                      <div key={tv.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                        <div>
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{tv.tripulante.nome}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{funcaoLabel(tv.funcao)}</p>
                        </div>
                        <span className="text-xs text-slate-400 dark:text-slate-500">Apres. {formatTime(tv.horarioApresentacao)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 dark:text-slate-500">Nenhum tripulante registrado.</p>
                )}
              </div>
            </div>

            {/* Coluna lateral */}
            <div className="space-y-6">
              {/* Preenchimento operacional — sem valor jurídico */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">Preenchimento operacional</h2>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Responsável</span>
                    <span className="text-slate-800 dark:text-slate-200 font-medium">{rdv.responsavelPreenchimentoNome || 'Pendente'}</span>
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-2 mt-2">Uso operacional interno — sem valor jurídico. Não é RDV oficial, DB, eDB ou registro ANAC.</p>
                </div>
              </div>

              {/* Botões (desabilitados) */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">Ações</h2>
                <div className="space-y-2">
                  <button disabled className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500" title="Protótipo — finalização de RDV indisponível nesta prévia"><CheckCircle className="h-4 w-4" />Finalizar preenchimento</button>
                  <button disabled className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500" title="Protótipo — cancelamento de RDV indisponível nesta prévia"><Ban className="h-4 w-4" />Cancelar RDV</button>
                  <button disabled className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500" title="Protótipo — exportação indisponível nesta prévia"><Download className="h-4 w-4" />Exportar (não fiscal)</button>
                </div>
              </div>
            </div>
          </div>
        </ControleVoosPageShell>
      </div>
    </AppLayout>
  );
}
