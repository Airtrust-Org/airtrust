// src/react-app/pages/escalas/views/EscalasListagemView.tsx
//
// List-mode view for the Escalas module.
// Consumed only when no escala is selected (escalaAtualId == null).

import {
  ArrowRight,
  CalendarMinus,
  ChevronLeft,
  ChevronRight,
  Plus,
  Settings,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import { Button } from '@/react-app/components/UI';
import ModalCriarEscala from '../components/Modais/ModalCriarEscala';
import ModalFeriasAfastamentoGlobal from '../components/Modais/ModalFeriasAfastamentoGlobal';
import EscalasTabBar from '../components/EscalasTabBar';
import { STATUS_CONFIG } from '../utils/statusConfig';
import { MESES, MESES_CURTOS } from '../EscalaPageContext';
import { useEscalaPageCtx } from '../EscalaPageContext';
import {
  ordenarEscalasCronologicamente,
  proximasCompetenciasSemEscala,
} from '../utils/ordenarEscalas';

function formatarContagem(valor: number, singular: string, plural: string) {
  return `${valor} ${valor === 1 ? singular : plural}`;
}

export default function EscalasListagemView() {
  const {
    escalas,
    loadingLista,
    refetchLista,
    filtroAno,
    setFiltroAno,
    filtroStatus,
    setFiltroStatus,
    confirmarExcluirId,
    setConfirmarExcluirId,
    deletarEscala,
    podeGerenciarOperacoes,
    abrirEscala,
    abrirModal,
    fecharModal,
    modalAberto,
    navigate,
  } = useEscalaPageCtx();

  const listaEscalas = escalas || [];
  // "Linha do ano operacional" e a seção de criação são sempre relativas ao ano
  // filtrado; escopar por filtroAno mantém o comportamento previsível mesmo se a
  // lista trouxer competências de mais de um ano.
  const escalasDoAno = listaEscalas.filter((escala) => escala.ano === filtroAno);
  const escalasPorMes = new Map<number, (typeof listaEscalas)[number]>();
  for (const escala of escalasDoAno) {
    escalasPorMes.set(escala.mes, escala);
  }
  // Cards de competências existentes: ordem cronológica estável (ano, depois
  // mês) — nunca lexicográfica, previsível com múltiplos anos.
  const mesesOrdenados = ordenarEscalasCronologicamente(listaEscalas);
  // Ação `Criar mês` fica sempre em seção própria, derivada dos meses do ano
  // filtrado que ainda não têm escala.
  const mesesSemEscala = proximasCompetenciasSemEscala(listaEscalas, filtroAno);

  return (
    <AppLayout>
      <PageHeader
        title="Escalas"
        subtitle="Planejamento operacional mensal"
        actions={
          <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">
            {podeGerenciarOperacoes && (
              <Button
                leftIcon={<Plus className="w-4 h-4" />}
                className="border-transparent bg-primary text-white hover:bg-primary-700 focus:ring-primary"
                onClick={() => abrirModal({ tipo: 'criar-escala' })}
              >
                Incluir Escala
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<CalendarMinus className="w-4 h-4" />}
              onClick={() => abrirModal({ tipo: 'ferias-afastamento-global' })}
            >
              Férias / Afast.
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Settings className="w-4 h-4" />}
              onClick={() => navigate('/escalas/configuracoes')}
            >
              Config
            </Button>
          </div>
        }
      />

      <EscalasTabBar />

      {/* Filtros */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Seletor de ano */}
          <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:shadow-none">
            <button
              className="flex h-8 w-8 items-center justify-center text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              onClick={() => setFiltroAno((y) => y - 1)}
              aria-label="Ano anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="min-w-[3rem] px-3 text-center text-sm font-semibold text-slate-800 dark:text-slate-100">
              {filtroAno}
            </span>
            <button
              className="flex h-8 w-8 items-center justify-center text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              onClick={() => setFiltroAno((y) => y + 1)}
              aria-label="Próximo ano"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Filtro status */}
          {(['todos', 'rascunho', 'em_revisao', 'aprovada', 'publicada', 'arquivada'] as const).map(
            (s) => {
              const count =
                s === 'todos'
                  ? listaEscalas.length
                  : listaEscalas.filter((e) => e.status === s).length;
              return (
                <button
                  key={s}
                  onClick={() => setFiltroStatus(s)}
                  className={[
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                    filtroStatus === s
                      ? 'border-slate-900 bg-slate-900 text-white shadow-sm dark:border-slate-600 dark:bg-slate-800'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-slate-600',
                  ].join(' ')}
                >
                  {s === 'todos' ? 'Todos' : STATUS_CONFIG[s].label}
                  {count > 0 && (
                    <span
                      className={`ml-1.5 text-[10px] ${filtroStatus === s ? 'text-white/70' : 'text-gray-400'}`}
                    >
                      ({count})
                    </span>
                  )}
                </button>
              );
            },
          )}
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Linha do ano operacional</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Clique em um mês para abrir a escala ou iniciar a criação
          </p>
        </div>
        <div className="flex items-center overflow-x-auto gap-1.5 scrollbar-thin">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((mesNumero) => {
            const escalaMes = escalasPorMes.get(mesNumero);
            const mesAtual = new Date().getMonth() + 1;
            const isPast = mesNumero < mesAtual;
            const isCurrent = mesNumero === mesAtual;
            const isEmpty = !escalaMes;
            return (
              <button
                key={mesNumero}
                title={`${MESES[mesNumero - 1]} ${filtroAno}${escalaMes ? ` — ${STATUS_CONFIG[escalaMes.status].label}` : ' — sem escala'}`}
                onClick={() => {
                  if (escalaMes) {
                    abrirEscala(escalaMes.id, escalaMes.status);
                    return;
                  }
                  abrirModal({ tipo: 'criar-escala' });
                }}
                className={[
                  'flex min-w-[56px] flex-col items-center rounded-xl px-2 py-2 text-xs font-semibold uppercase tracking-wide transition-all',
                  isCurrent && !isEmpty
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                    : isCurrent && isEmpty
                      ? 'border border-dashed border-emerald-200 bg-emerald-50 text-emerald-400'
                      : isEmpty
                        ? 'text-gray-400 hover:bg-gray-50 border border-transparent hover:border-gray-200 dark:text-slate-500 dark:hover:bg-slate-800/80 dark:hover:border-slate-700' +
                          (isPast ? ' opacity-40' : '')
                        : isPast
                          ? 'text-gray-500 opacity-50 hover:opacity-80 border border-transparent dark:text-slate-400'
                          : 'text-gray-700 hover:bg-gray-50 border border-transparent dark:text-slate-200 dark:hover:bg-slate-800/80',
                ].join(' ')}
              >
                <span className="text-[10px]">{MESES_CURTOS[mesNumero - 1]}</span>
                <span
                  className={`mt-1 w-1.5 h-1.5 rounded-full ${
                    escalaMes?.status === 'publicada'
                      ? 'bg-emerald-500'
                      : escalaMes?.status === 'aprovada'
                        ? 'bg-sky-500'
                        : escalaMes?.status === 'em_revisao'
                          ? 'bg-amber-500'
                          : escalaMes
                            ? 'bg-gray-400'
                            : 'border border-dashed border-gray-300'
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid de cards */}
      {loadingLista ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-52 rounded-xl border border-slate-200 bg-white animate-pulse dark:border-slate-800 dark:bg-slate-900"
            />
          ))}
        </div>
      ) : listaEscalas.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 py-20 text-center dark:border-slate-700 dark:bg-slate-900/40">
          <div className="text-5xl mb-3">📅</div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-slate-100">Nenhuma escala encontrada</h3>
          <p className="mt-1 text-sm text-gray-400 dark:text-slate-400">Crie a primeira escala do ano manualmente.</p>
          <div className="flex items-center justify-center gap-3 mt-5">
            <Button
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => abrirModal({ tipo: 'criar-escala' })}
            >
              Criar manualmente
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div
            data-testid="lista-escalas"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4"
          >
            {mesesOrdenados.map((escala) => {
              const conf = STATUS_CONFIG[escala.status];
              const mesNome = MESES[(escala.mes - 1) % 12];

              return (
                <div
                  key={escala.id}
                  data-testid={`card-escala-${escala.id}`}
                  className={[
                    'group cursor-pointer overflow-hidden rounded-2xl border bg-gradient-to-b from-white to-slate-50/70 transition-all hover:-translate-y-0.5 hover:shadow-md dark:from-slate-900 dark:to-slate-800/70 dark:hover:shadow-none',
                    escala.status === 'publicada'
                      ? 'border-emerald-200 dark:border-emerald-500/30'
                      : 'border-gray-100 hover:border-gray-200 dark:border-slate-800 dark:hover:border-slate-700',
                  ].join(' ')}
                  onClick={() => abrirEscala(escala.id, escala.status)}
                >
                  <div className={`h-1.5 w-full ${conf.barColor}`} />

                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-lg font-bold leading-tight text-gray-900 dark:text-slate-100">{mesNome}</h3>
                        <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-400">
                          Escala {escala.mes}/{escala.ano}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                          escala.status === 'rascunho'
                            ? 'bg-gray-100 text-gray-600 border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            : escala.status === 'em_revisao'
                              ? 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-200'
                              : escala.status === 'aprovada'
                                ? 'bg-blue-50 text-blue-700 border-blue-200 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200'
                                : escala.status === 'publicada'
                                  ? 'bg-green-50 text-green-700 border-green-200 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-200'
                                  : 'bg-gray-50 text-gray-400 border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${conf.dotColor}`} />
                        {conf.label}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-300">
                      {((escala.conflitos_count || 0) > 0 ||
                        (escala.tripulantes_sem_aeronave_count || 0) > 0 ||
                        (escala.afastamentos_medicos_count || 0) > 0 ||
                        (escala.afastamentos_count || 0) > 0) && (
                        <>
                          {(escala.conflitos_count || 0) > 0 && (
                            <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 font-medium text-red-700">
                              {formatarContagem(escala.conflitos_count || 0, 'conflito', 'conflitos')}
                            </span>
                          )}
                          {(escala.tripulantes_sem_aeronave_count || 0) > 0 && (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
                              {formatarContagem(
                                escala.tripulantes_sem_aeronave_count || 0,
                                'tripulante sem aeronave',
                                'tripulantes sem aeronave',
                              )}
                            </span>
                          )}
                          {(escala.afastamentos_medicos_count || 0) > 0 && (
                            <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 font-medium text-rose-700">
                              {formatarContagem(
                                escala.afastamentos_medicos_count || 0,
                                'afastamento médico',
                                'afastamentos médicos',
                              )}
                            </span>
                          )}
                          {(escala.afastamentos_count || 0) > 0 && (
                            <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 font-medium text-orange-700">
                              {formatarContagem(
                                escala.afastamentos_count || 0,
                                'afastamento',
                                'afastamentos',
                              )}
                            </span>
                          )}
                        </>
                      )}
                      {(escala.conflitos_count || 0) === 0 &&
                        (escala.tripulantes_sem_aeronave_count || 0) === 0 &&
                        (escala.afastamentos_medicos_count || 0) === 0 &&
                        (escala.afastamentos_count || 0) === 0 && (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                            Sem alertas operacionais
                          </span>
                        )}
                      {escala.status === 'publicada' && (escala.numero_revisao ?? 0) > 0 && (
                        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 font-medium text-indigo-700">
                          Rev. {escala.numero_revisao}
                        </span>
                      )}
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-slate-800">
                      <div className="text-[11px] text-slate-400 dark:text-slate-500">
                        {escala.status === 'publicada'
                          ? 'Pronta para consulta da tripulação'
                          : 'Escala em construção operacional'}
                      </div>
                      <div className="flex items-center gap-2">
                        {podeGerenciarOperacoes && confirmarExcluirId === escala.id ? (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-red-600 font-medium">Confirmar?</span>
                            <button
                              className="text-[10px] px-2 py-0.5 rounded bg-red-500 text-white font-semibold hover:bg-red-600 disabled:opacity-50"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const btn = e.currentTarget;
                                btn.disabled = true;
                                try {
                                  await deletarEscala(escala.id);
                                  toast.success('Escala excluída');
                                  refetchLista();
                                } catch (err) {
                                  toast.error(
                                    err instanceof Error ? err.message : 'Erro ao excluir escala',
                                  );
                                } finally {
                                  btn.disabled = false;
                                  setConfirmarExcluirId(null);
                                }
                              }}
                            >
                              Sim
                            </button>
                            <button
                              className="rounded border border-slate-200 px-2 py-0.5 text-[10px] text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmarExcluirId(null);
                              }}
                            >
                              Não
                            </button>
                          </div>
                        ) : podeGerenciarOperacoes ? (
                          <button
                            className="rounded p-1 text-slate-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:text-slate-500 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                            title="Excluir escala"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmarExcluirId(escala.id);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : null}
                        <button
                          className="text-xs text-primary font-medium group-hover:underline flex items-center gap-0.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            abrirEscala(escala.id, escala.status);
                          }}
                        >
                          {escala.status === 'publicada' ? 'Visualizar' : 'Abrir'}
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {podeGerenciarOperacoes && mesesSemEscala.length > 0 && (
            <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Próximas competências
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ações de criação ficam separadas das escalas já existentes.
                </p>
              </div>
              <div
                data-testid="criar-proximas-competencias"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
              >
                {mesesSemEscala.map((mesNumero) => (
                  <button
                    key={`ghost-${mesNumero}`}
                    onClick={() => abrirModal({ tipo: 'criar-escala' })}
                    className="group rounded-xl border border-dashed border-slate-300 bg-white p-4 text-left transition-all hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800/80"
                  >
                    <p className="text-sm font-semibold text-slate-600 group-hover:text-slate-800 dark:text-slate-300 dark:group-hover:text-slate-100">
                      + Criar {MESES[mesNumero - 1]}
                    </p>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      Sem escala para este mês
                    </p>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {modalAberto?.tipo === 'criar-escala' && (
        <ModalCriarEscala onClose={fecharModal} onSuccess={() => refetchLista()} />
      )}

      {modalAberto?.tipo === 'ferias-afastamento-global' && (
        <ModalFeriasAfastamentoGlobal
          onClose={fecharModal}
          onSaved={() => {
            refetchLista();
          }}
        />
      )}
    </AppLayout>
  );
}
