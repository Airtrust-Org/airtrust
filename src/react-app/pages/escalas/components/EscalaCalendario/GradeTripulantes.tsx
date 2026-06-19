import { endOfMonth, eachDayOfInterval, format, startOfMonth } from 'date-fns';
import { Fragment, useEffect, useMemo } from 'react';
import { Pencil } from 'lucide-react';
import { cn } from '@/react-app/lib/utils';
import { useEscalaStore } from '../../hooks/useEscalaStore';
import { getQuinzenaBadgeClasses, getQuinzenaShortLabel } from '../../quinzena-tokens';
import type { DayEvent } from '../../utils/buildDayCellState';
import type {
  EscalaAlocacao,
  EscalaCoberturaTripulante,
  QuinzenaEscala,
} from '../../hooks/queries/useEscalasQuery';
import type { EscalaEvento } from '../../hooks/queries/useEscalasQuery';
import {
  buildSyntheticAlocacoesFromEventos,
  buildTripulanteAlocacoesMap,
  chooseTripulanteDayAlocacao,
  isAlocacaoOperacionalComAeronave,
  isSyntheticAlocacao,
} from './GradeTripulantes.utils';
import { DayCell } from './DayCell';
import { CabecalhoDiasSituacao } from './LinhaSituacao';
import {
  DISPONIVEL_PLACEHOLDER_COLOR,
  FOLGA_PLACEHOLDER_COLOR,
  isDiaDentroQuinzenaAtiva,
} from './activeFortnightBase';

interface Props {
  cobertura: {
    tripulantes: EscalaCoberturaTripulante[];
    resumo: {
      total: number;
      completos: number;
      parciais: number;
      livres: number;
    };
  };
  alocacoes: EscalaAlocacao[];
  eventos?: EscalaEvento[]; // eventos da escala (ex: treinamento_simulador)
  escalaId: string; // ID da escala atual (necessário para filtrar eventos sintéticos)
  quinzenas: QuinzenaEscala[];
  escalaMes: number;
  escalaAno: number;
  filtroQuinzena?: 'todas' | 'q1' | 'q2';
  tripulanteFocadoId?: string | null;
  onAlocarLivre: (payload: {
    tripulanteId: string;
    quinzenaNumero: 1 | 2;
    quinzenaId?: number;
    dataInicio: string;
    dataFim: string;
  }) => void;
  onEditarSituacao: (situacaoId: string) => void;
  onEditarFuncionario: (tripulanteId: string) => void;
  onFocarAlocacaoAeronave: (alocacao: {
    aeronave?: string | null;
    aeronave_id?: number | string | null;
  }) => void;
}

interface GrupoTripulante {
  chave: string;
  label: string;
  total: number;
  subgrupos: Array<{
    modelo: string;
    items: EscalaCoberturaTripulante[];
  }>;
}

const MODEL_ORDER = ['AW139', 'SK76'];
function getNome(tripulante: EscalaCoberturaTripulante, modo: 'completo' | 'guerra') {
  return modo === 'guerra' && tripulante.nome_guerra ? tripulante.nome_guerra : tripulante.nome;
}

function getPriority(status: EscalaCoberturaTripulante['status_geral']) {
  return status === 'livre' ? 0 : status === 'parcial' ? 1 : 2;
}

function getModeloBadgeClass(modelo: string) {
  const up = modelo.toUpperCase();
  if (up.includes('AW139')) {
    return 'bg-emerald-100 text-emerald-800 border-emerald-300 ring-emerald-200';
  }
  if (up.includes('SK76') || up.includes('S76')) {
    return 'bg-yellow-100 text-yellow-800 border-yellow-300 ring-yellow-200';
  }
  return 'bg-slate-100 text-slate-600 border-slate-200 ring-slate-100';
}

function getModeloSubheaderClass(modelo: string) {
  const up = modelo.toUpperCase();
  if (up.includes('AW139')) {
    return { bar: 'bg-emerald-500', label: 'text-emerald-700', bg: 'bg-emerald-50/60' };
  }
  if (up.includes('SK76') || up.includes('S76')) {
    return { bar: 'bg-yellow-500', label: 'text-yellow-700', bg: 'bg-yellow-50/60' };
  }
  return { bar: 'bg-slate-400', label: 'text-slate-500', bg: 'bg-slate-50/40' };
}

function mapAlocacaoPlaceholderType(alocacao: EscalaAlocacao): DayEvent['type'] {
  const situacaoTipo = alocacao.situacao_tipo as string | null | undefined;

  if (isAlocacaoOperacionalComAeronave(alocacao)) return 'ALOCACAO';

  switch (situacaoTipo) {
    case 'FOLGA':
      return 'FOLGA';
    case 'FERIAS':
      return 'FERIAS';
    case 'SIM':
      return 'SIMULADOR';
    case 'CURSO':
      return 'CURSO';
    case 'MED':
      return 'EXAME_MEDICO';
    case 'STB':
      return 'STANDBY';
    default:
      return 'LICENCA';
  }
}

function getAlocacaoCor(alocacao: EscalaAlocacao) {
  if (isAlocacaoOperacionalComAeronave(alocacao)) return '#3B82F6';
  return alocacao.situacao_cor || '#64748B';
}

function getAlocacaoLabel(alocacao: EscalaAlocacao) {
  if (isAlocacaoOperacionalComAeronave(alocacao)) {
    const funcao = (alocacao.funcao || alocacao.funcionario_role || '').toUpperCase();
    if (funcao === 'PIC') return '1P';
    if (funcao === 'SIC') return '2P';
    return 'P';
  }
  // Prefer the short situacao_tipo code (e.g. "STB", "FERIAS") over the long nome
  // so that cell badges remain readable at small size
  return alocacao.situacao_tipo || alocacao.situacao_nome || 'Sit';
}

function getAlocacaoExtra(alocacao: EscalaAlocacao) {
  if (isAlocacaoOperacionalComAeronave(alocacao)) {
    const prefixo = alocacao.aeronave_prefixo || alocacao.aeronave?.prefixo;
    const funcao = alocacao.funcao || alocacao.funcionario_role;

    if (prefixo && funcao) return `${prefixo} · ${funcao}`;
    return prefixo || funcao || undefined;
  }
  const nome = alocacao.situacao_nome?.trim();
  const tipo = String(alocacao.situacao_tipo || '').trim();
  return nome && nome !== tipo ? nome : undefined;
}

function getQuinzenaByDia(quinzenas: QuinzenaEscala[], diaIso: string) {
  return quinzenas.find((item) => item.data_inicio <= diaIso && item.data_fim >= diaIso) || null;
}

function StatusBar({ status }: { status: EscalaCoberturaTripulante['status_geral'] }) {
  return (
    <div
      className={cn(
        'absolute bottom-0 left-0 top-0 w-0.5 rounded-r',
        status === 'completo'
          ? 'bg-emerald-400'
          : status === 'parcial'
            ? 'bg-amber-400'
            : 'bg-red-400',
      )}
    />
  );
}

export default function GradeTripulantes({
  cobertura,
  alocacoes,
  eventos,
  escalaId,
  quinzenas,
  escalaMes,
  escalaAno,
  filtroQuinzena = 'todas',
  tripulanteFocadoId,
  onAlocarLivre,
  onEditarSituacao,
  onEditarFuncionario,
  onFocarAlocacaoAeronave,
}: Props) {
  const { exibirNome } = useEscalaStore();

  const quinzenasMes = useMemo(
    () =>
      [...quinzenas]
        .filter((quinzena) => quinzena.mes === escalaMes && quinzena.ano === escalaAno)
        .sort((a, b) => a.numero - b.numero),
    [escalaAno, escalaMes, quinzenas],
  );

  const q1Fim = quinzenasMes.find((quinzena) => quinzena.numero === 1)?.data_fim;

  const diasDoMes = useMemo(() => {
    const inicio = startOfMonth(new Date(escalaAno, escalaMes - 1, 1));
    const fim = endOfMonth(inicio);
    return eachDayOfInterval({ start: inicio, end: fim });
  }, [escalaAno, escalaMes]);

  const diasFiltrados = useMemo(() => {
    if (filtroQuinzena === 'todas') return diasDoMes;

    const numero = filtroQuinzena === 'q1' ? 1 : 2;
    const quinzena = quinzenasMes.find((item) => item.numero === numero);
    if (!quinzena) return diasDoMes;

    return diasDoMes.filter((dia) => {
      const diaIso = format(dia, 'yyyy-MM-dd');
      return diaIso >= quinzena.data_inicio && diaIso <= quinzena.data_fim;
    });
  }, [diasDoMes, filtroQuinzena, quinzenasMes]);

  const intervaloInicio = diasFiltrados[0] ? format(diasFiltrados[0], 'yyyy-MM-dd') : '';
  const intervaloFim = diasFiltrados[diasFiltrados.length - 1]
    ? format(diasFiltrados[diasFiltrados.length - 1], 'yyyy-MM-dd')
    : '';

  // Merge synthetic alocacoes from simulator eventos (treinamento_simulador)
  // so they appear in the GradeTripulantes grid alongside real alocacoes.
  const alocacoesComSimulador = useMemo(() => {
    if (!eventos || eventos.length === 0) return alocacoes;

    const ids = new Set(cobertura.tripulantes.map((t) => t.id));
    const synthetic = buildSyntheticAlocacoesFromEventos({
      eventos,
      escalaId,
      tripulanteIds: ids,
    });

    if (synthetic.length === 0) return alocacoes;

    // Prepend synthetic entries — real alocacoes have higher priority
    // in chooseTripulanteDayAlocacao, so they'll win if there's overlap
    return [...synthetic, ...alocacoes];
  }, [alocacoes, eventos, cobertura.tripulantes]);

  const alocacoesPorTripulante = useMemo(
    () =>
      buildTripulanteAlocacoesMap({
        tripulantes: cobertura.tripulantes,
        alocacoes: alocacoesComSimulador,
        intervaloInicio,
        intervaloFim,
      }),
    [alocacoesComSimulador, cobertura.tripulantes, intervaloFim, intervaloInicio],
  );

  const grupos = useMemo<GrupoTripulante[]>(() => {
    const sort = (items: EscalaCoberturaTripulante[]) =>
      [...items].sort(
        (a, b) =>
          getPriority(a.status_geral) - getPriority(b.status_geral) ||
          getNome(a, exibirNome).localeCompare(getNome(b, exibirNome), 'pt-BR'),
      );

    const makeSubgrupos = (tripulantes: EscalaCoberturaTripulante[]) => {
      const byModel = new Map<string, EscalaCoberturaTripulante[]>();

      for (const tripulante of tripulantes) {
        const modeloPrincipal = tripulante.modelos_habilitados?.[0] ?? 'Outros';
        if (!byModel.has(modeloPrincipal)) byModel.set(modeloPrincipal, []);
        byModel.get(modeloPrincipal)?.push(tripulante);
      }

      const result: GrupoTripulante['subgrupos'] = [];
      for (const modelo of MODEL_ORDER) {
        if (!byModel.has(modelo)) continue;
        result.push({ modelo, items: sort(byModel.get(modelo) || []) });
        byModel.delete(modelo);
      }
      for (const [modelo, items] of byModel) {
        result.push({ modelo, items: sort(items) });
      }
      return result;
    };

    return ['comandante', 'copiloto'].map((cargo) => {
      const tripulantes = cobertura.tripulantes.filter((tripulante) => tripulante.cargo === cargo);
      return {
        chave: cargo,
        label: cargo === 'comandante' ? 'Comandantes' : 'Copilotos',
        total: tripulantes.length,
        subgrupos: makeSubgrupos(tripulantes),
      };
    });
  }, [cobertura.tripulantes, exibirNome]);

  useEffect(() => {
    if (!tripulanteFocadoId) return;
    document
      .getElementById(`tcov-${tripulanteFocadoId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [tripulanteFocadoId]);

  const { completos, parciais, livres } = cobertura.resumo;
  const total = cobertura.tripulantes.length;

  const statsModelos = useMemo(() => {
    const byModelo = new Map<string, { cmd: number; cop: number }>();

    for (const tripulante of cobertura.tripulantes) {
      const modeloPrincipal = tripulante.modelos_habilitados?.[0] ?? 'Outros';
      if (!byModelo.has(modeloPrincipal)) byModelo.set(modeloPrincipal, { cmd: 0, cop: 0 });
      const entry = byModelo.get(modeloPrincipal);
      if (!entry) continue;
      if (tripulante.cargo === 'comandante') entry.cmd += 1;
      else entry.cop += 1;
    }

    const result: Array<{ modelo: string; cmd: number; cop: number; total: number }> = [];
    for (const modelo of MODEL_ORDER) {
      if (!byModelo.has(modelo)) continue;
      const entry = byModelo.get(modelo);
      if (!entry) continue;
      result.push({ modelo, ...entry, total: entry.cmd + entry.cop });
      byModelo.delete(modelo);
    }
    for (const [modelo, entry] of byModelo) {
      result.push({ modelo, ...entry, total: entry.cmd + entry.cop });
    }
    return result;
  }, [cobertura.tripulantes]);

  const tableMinWidth = useMemo(
    () => `${diasFiltrados.length * 28 + 220}px`,
    [diasFiltrados.length],
  );

  return (
    <section
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
      data-testid="grade-tripulantes"
    >
      <div className="border-b border-gray-100 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h3 className="text-sm font-bold tracking-tight text-gray-800">
            Cobertura de Tripulantes
          </h3>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {completos} completos
            </span>
            <span className="flex items-center gap-1.5 font-semibold text-amber-600">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              {parciais} parciais
            </span>
            {livres > 0 ? (
              <span className="flex items-center gap-1.5 font-bold text-red-600">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                {livres} sem alocação
              </span>
            ) : (
              <span className="flex items-center gap-1 font-semibold text-emerald-600">
                <span className="text-sm">✓</span>
                Todos alocados
              </span>
            )}
          </div>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] text-gray-400">
          <span className="font-medium text-gray-500">{total} ativos</span>
          {statsModelos.map((item) => (
            <span key={item.modelo} className="flex items-center gap-1">
              <span className="text-gray-300">·</span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded border px-1.5 py-px font-semibold',
                  item.modelo.toUpperCase().includes('AW139')
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : item.modelo.toUpperCase().includes('SK76') ||
                        item.modelo.toUpperCase().includes('S76')
                      ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
                      : 'border-gray-200 bg-gray-50 text-gray-500',
                )}
              >
                {item.modelo}
                <span className="opacity-60">{item.total}</span>
              </span>
              <span className="text-gray-400">
                ({item.cmd} CMD · {item.cop} COP)
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="w-full overflow-x-auto overflow-y-visible">
        <table
          className="w-full table-fixed border-collapse text-xs"
          style={{ minWidth: tableMinWidth }}
        >
          <thead>
            <CabecalhoDiasSituacao diasDoMes={diasFiltrados} q1Fim={q1Fim} />
          </thead>
          <tbody>
            {grupos.map((grupo) => (
              <TripulanteGrupoRows
                key={grupo.chave}
                grupo={grupo}
                diasDoMes={diasFiltrados}
                escalaMes={escalaMes}
                escalaAno={escalaAno}
                q1Fim={q1Fim}
                quinzenasMes={quinzenasMes}
                exibirNome={exibirNome}
                tripulanteFocadoId={tripulanteFocadoId}
                alocacoesPorTripulante={alocacoesPorTripulante}
                onAlocarLivre={onAlocarLivre}
                onEditarSituacao={onEditarSituacao}
                onEditarFuncionario={onEditarFuncionario}
                onFocarAlocacaoAeronave={onFocarAlocacaoAeronave}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TripulanteGrupoRows({
  grupo,
  diasDoMes,
  escalaMes,
  escalaAno,
  q1Fim,
  quinzenasMes,
  exibirNome,
  tripulanteFocadoId,
  alocacoesPorTripulante,
  onAlocarLivre,
  onEditarSituacao,
  onEditarFuncionario,
  onFocarAlocacaoAeronave,
}: {
  grupo: GrupoTripulante;
  diasDoMes: Date[];
  escalaMes: number;
  escalaAno: number;
  q1Fim?: string;
  quinzenasMes: QuinzenaEscala[];
  exibirNome: 'completo' | 'guerra';
  tripulanteFocadoId?: string | null;
  alocacoesPorTripulante: Map<string, EscalaAlocacao[]>;
  onAlocarLivre: Props['onAlocarLivre'];
  onEditarSituacao: Props['onEditarSituacao'];
  onEditarFuncionario: Props['onEditarFuncionario'];
  onFocarAlocacaoAeronave: Props['onFocarAlocacaoAeronave'];
}) {
  return (
    <>
      <tr>
        <td
          colSpan={diasDoMes.length + 1}
          className="border-y border-gray-200 bg-gray-100/80 px-4 py-1.5"
        >
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-gray-500">
            {grupo.label}
          </span>
          <span className="ml-2 text-[10px] font-normal text-gray-400">({grupo.total})</span>
        </td>
      </tr>

      {grupo.subgrupos.map((subgrupo) => {
        const style = getModeloSubheaderClass(subgrupo.modelo);
        return (
          <Fragment key={`${grupo.chave}-${subgrupo.modelo}`}>
            <tr>
              <td
                colSpan={diasDoMes.length + 1}
                className={cn('border-b border-gray-100 px-4 py-1', style.bg)}
              >
                <div className="flex items-center gap-2">
                  <div className={cn('h-2.5 w-0.5 rounded-full', style.bar)} />
                  <span
                    className={cn('text-[10px] font-bold uppercase tracking-wider', style.label)}
                  >
                    {subgrupo.modelo}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {subgrupo.items.length} tripulante{subgrupo.items.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </td>
            </tr>

            {subgrupo.items.map((tripulante) => (
              <TripulanteRow
                key={tripulante.id}
                tripulante={tripulante}
                cargo={grupo.chave as 'comandante' | 'copiloto'}
                diasDoMes={diasDoMes}
                escalaMes={escalaMes}
                escalaAno={escalaAno}
                q1Fim={q1Fim}
                quinzenasMes={quinzenasMes}
                exibirNome={exibirNome}
                focused={tripulante.id === tripulanteFocadoId}
                alocacoes={alocacoesPorTripulante.get(tripulante.id) || []}
                onAlocarLivre={onAlocarLivre}
                onEditarSituacao={onEditarSituacao}
                onEditarFuncionario={onEditarFuncionario}
                onFocarAlocacaoAeronave={onFocarAlocacaoAeronave}
              />
            ))}
          </Fragment>
        );
      })}
    </>
  );
}

function TripulanteRow({
  tripulante,
  cargo,
  diasDoMes,
  escalaMes,
  escalaAno,
  q1Fim,
  quinzenasMes,
  exibirNome,
  focused,
  alocacoes,
  onAlocarLivre,
  onEditarSituacao,
  onEditarFuncionario,
  onFocarAlocacaoAeronave,
}: {
  tripulante: EscalaCoberturaTripulante;
  cargo: 'comandante' | 'copiloto';
  diasDoMes: Date[];
  escalaMes: number;
  escalaAno: number;
  q1Fim?: string;
  quinzenasMes: QuinzenaEscala[];
  exibirNome: 'completo' | 'guerra';
  focused: boolean;
  alocacoes: EscalaAlocacao[];
  onAlocarLivre: Props['onAlocarLivre'];
  onEditarSituacao: Props['onEditarSituacao'];
  onEditarFuncionario: Props['onEditarFuncionario'];
  onFocarAlocacaoAeronave: Props['onFocarAlocacaoAeronave'];
}) {
  const nome = getNome(tripulante, exibirNome);
  const quinzenaLabel = getQuinzenaShortLabel(tripulante.quinzena_numero);

  return (
    <tr
      id={`tcov-${tripulante.id}`}
      className={cn(
        'group border-b border-gray-100 transition-colors',
        focused ? 'bg-blue-50' : 'bg-white hover:bg-gray-50/50',
      )}
    >
      <td className="relative border-r border-gray-100 px-3 py-2 align-top">
        <StatusBar status={tripulante.status_geral} />
        <div className="min-w-0 pl-2">
          <div className="flex items-center gap-0.5">
            <span className="truncate text-xs font-semibold leading-snug text-gray-900">
              {nome}
            </span>
            <button
              type="button"
              onClick={() => onEditarFuncionario(tripulante.id)}
              className="shrink-0 rounded p-0.5 text-gray-300 opacity-0 transition-all hover:bg-gray-100 hover:text-gray-500 group-hover:opacity-100"
              title="Editar"
            >
              <Pencil className="h-2.5 w-2.5" />
            </button>
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
              {cargo === 'comandante' ? 'CMD' : 'COP'}
            </span>
            <span
              className={cn(
                'inline-flex items-center rounded border px-1 py-px text-[9px] font-bold uppercase tracking-wide',
                quinzenaLabel
                  ? getQuinzenaBadgeClasses(tripulante.quinzena_numero)
                  : 'border-slate-200 bg-slate-100 text-slate-500',
              )}
            >
              {quinzenaLabel ?? 'Sem Q'}
            </span>
            {(tripulante.modelos_habilitados || []).map((modelo) => (
              <span
                key={modelo}
                className={cn(
                  'inline-flex items-center rounded border px-1 py-px text-[9px] font-bold uppercase tracking-wide ring-1',
                  getModeloBadgeClass(modelo),
                )}
              >
                {modelo}
              </span>
            ))}
          </div>
        </div>
      </td>

      {diasDoMes.map((dia) => {
        const diaIso = format(dia, 'yyyy-MM-dd');
        const quinzena = getQuinzenaByDia(quinzenasMes, diaIso);
        const quinzenaNumero = (
          quinzena?.numero === 1 || quinzena?.numero === 2
            ? quinzena.numero
            : tripulante.quinzena_numero || 1
        ) as 1 | 2;
        const payloadBase = {
          tripulanteId: tripulante.id,
          quinzenaNumero,
          quinzenaId: quinzena?.id,
          dataInicio: diaIso,
          dataFim: diaIso,
        };

        const alocacaoAtiva = chooseTripulanteDayAlocacao(alocacoes, diaIso);
        if (!alocacaoAtiva) {
          const dentroQuinzenaAtiva = isDiaDentroQuinzenaAtiva(
            tripulante.quinzena_numero,
            diaIso,
            quinzenasMes,
          );
          return (
            <DayCell
              key={`${tripulante.id}-${diaIso}`}
              date={dia}
              isBoundary={diaIso === q1Fim}
              mesReferencia={escalaMes}
              anoReferencia={escalaAno}
              ativo
              corAtivo={
                dentroQuinzenaAtiva ? DISPONIVEL_PLACEHOLDER_COLOR : FOLGA_PLACEHOLDER_COLOR
              }
              eventos={[]}
              placeholderType={dentroQuinzenaAtiva ? 'DISPONIVEL' : 'FOLGA'}
              placeholderLabel={dentroQuinzenaAtiva ? 'Disponível' : 'Folga'}
              placeholderExtra={dentroQuinzenaAtiva ? 'Em escala' : undefined}
              onClick={() => onAlocarLivre(payloadBase)}
            />
          );
        }

        const aeronaveAtiva = isAlocacaoOperacionalComAeronave(alocacaoAtiva);
        const folgaAtiva = (alocacaoAtiva.situacao_tipo as string | null | undefined) === 'FOLGA';
        const synthetic = isSyntheticAlocacao(alocacaoAtiva);

        return (
          <DayCell
            key={`${tripulante.id}-${diaIso}`}
            date={dia}
            isBoundary={diaIso === q1Fim}
            mesReferencia={escalaMes}
            anoReferencia={escalaAno}
            ativo
            corAtivo={getAlocacaoCor(alocacaoAtiva)}
            eventos={[]}
            placeholderType={mapAlocacaoPlaceholderType(alocacaoAtiva)}
            placeholderLabel={getAlocacaoLabel(alocacaoAtiva)}
            placeholderExtra={getAlocacaoExtra(alocacaoAtiva)}
            // Synthetic (external) events are READ-ONLY — they cannot be edited as alocacoes
            onClick={() => {
              if (synthetic) {
                // External events: no-op (read-only in monthly grid)
                return;
              }

              if (folgaAtiva) {
                onAlocarLivre(payloadBase);
                return;
              }

              if (aeronaveAtiva) {
                onFocarAlocacaoAeronave({
                  aeronave:
                    alocacaoAtiva.aeronave_prefixo || alocacaoAtiva.aeronave?.prefixo || null,
                  aeronave_id: alocacaoAtiva.aeronave_id,
                });
                return;
              }

              onEditarSituacao(alocacaoAtiva.id);
            }}
          />
        );
      })}
    </tr>
  );
}
