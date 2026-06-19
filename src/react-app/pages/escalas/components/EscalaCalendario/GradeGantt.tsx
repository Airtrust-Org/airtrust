// FIX: [BUG 5] - Gantt containers now favor full-width horizontal scrolling without compressing columns.

import { Fragment, useMemo, useState } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, startOfMonth } from 'date-fns';
import { ChevronDown, ChevronUp, Clock3, Plane, Plus } from 'lucide-react';
import { useEscalaStore } from '../../hooks/useEscalaStore';
import { SEM_AERONAVE_LABEL, SEM_AERONAVE_VALUE } from '../../alocacao-operacional-constants';
import { EVENTO_CONFIG, TIPOS_EVENTO_ATIVOS } from '../../constants/tiposEvento';
import type {
  CMAStatus,
  ConflitosData,
  EscalaAlocacao,
  EscalaCoberturaAeronave,
  EscalaCoberturaTripulante,
  EscalaEvento,
  EscalaTripulacao,
  QuinzenaEscala,
} from '../../hooks/queries/useEscalasQuery';
import { useCMAStatusQuery } from '../../hooks/queries/useEscalasQuery';
import BlocoAeronave, { type LinhaAlocacaoGantt } from './BlocoAeronave';
import LinhaSituacao, {
  CabecalhoDiasSituacao,
  type LinhaSituacaoTripulante,
} from './LinhaSituacao';
import { buildSyntheticAlocacoesFromEventos } from './GradeTripulantes.utils';

export { EVENTO_CONFIG, TIPOS_EVENTO_ATIVOS };

const CORES_GRUPO = ['#0EA5E9', '#2563EB', '#F97316', '#14B8A6', '#8B5CF6', '#DC2626'];

export function getAeronaveColor(aeronave: string | null | undefined): string {
  const prefix = (aeronave || '').split(' ')[0];
  if (!prefix) return CORES_GRUPO[0];
  let hash = 0;
  for (let index = 0; index < prefix.length; index += 1) {
    hash = (hash * 31 + prefix.charCodeAt(index)) & 0x7fffffff;
  }
  return CORES_GRUPO[hash % CORES_GRUPO.length];
}

interface GradeGanttProps {
  escala: {
    id: string;
    mes: number;
    ano: number;
    status: string;
  };
  tripulacoes?: EscalaTripulacao[];
  alocacoes?: EscalaAlocacao[];
  cobertura?: EscalaCoberturaAeronave[];
  tripulantesCobertura?: EscalaCoberturaTripulante[];
  eventos: EscalaEvento[];
  quinzenas?: QuinzenaEscala[];
  filtroAeronave?: string | null;
  filtroModelo?: string | null;
  filtroQuinzena?: 'todas' | 'q1' | 'q2';
  filtroNome?: string;
  highlightAlocacao?: string | null;
  isLoading?: boolean;
  onPrevMes?: () => void;
  onNextMes?: () => void;
  onMoverEvento?: (eventoId: string, novaDataInicio: string, novaDataFim: string) => void;
  conflitosData?: ConflitosData | null;
  onAlocarTripulante?: (payload: {
    aeronaveLabel: string;
    funcao: string;
    aeronaveId: number | string;
    modoGestaoAeronave?: boolean;
    modoFluxoB?: boolean;
    funcionarioInicialId?: string | null;
    quinzenaId?: number;
    dataInicioInicial?: string;
    dataFimInicial?: string;
  }) => void;
  onEditarFuncionario?: (funcionarioId: string) => void;
  onEditarAlocacao?: (alocacaoId: string) => void;
  onRemoverAlocacao?: (alocacaoId: string, nome: string) => void;
  onEditarSituacao?: (situacaoId: string) => void;
  onRemoverSituacao?: (situacaoId: string, nome: string) => void;
  onRegistrarSituacao?: (payload: {
    funcionarioInicialId: string;
    quinzenaInicial?: number;
    dataInicioInicial?: string;
    dataFimInicial?: string;
    modoFluxoB?: boolean;
  }) => void;
  isRefreshingAlocacao?: boolean;
  onAlocarPrimeiraTripulacao?: () => void;
  onAlocarPrimeiraAeronave?: () => void;
}

/** Format a Date as YYYY-MM-DD using local time (avoids UTC offset rollback) */
function localDateIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function inferirFuncaoCobertura(
  cargo: EscalaCoberturaTripulante['cargo'] | string | null | undefined,
) {
  const normalized = String(cargo || '')
    .trim()
    .toLowerCase();
  if (normalized === 'comandante') return 'PIC';
  if (normalized === 'copiloto') return 'SIC';
  return null;
}

export function buildTripulantesSemAeronaveRows(params: {
  situacoes: EscalaAlocacao[];
  tripulantesCobertura?: EscalaCoberturaTripulante[];
  funcionariosComAeronaveAtiva: Set<string>;
  filtroNomeNormalizado: string;
  filtroModeloNormalizado: string;
  quinzenasMes: QuinzenaEscala[];
  intervaloVisivelInicio: string | null;
  intervaloVisivelFim: string | null;
}): LinhaSituacaoTripulante[] {
  const {
    situacoes,
    tripulantesCobertura = [],
    funcionariosComAeronaveAtiva,
    filtroNomeNormalizado,
    filtroModeloNormalizado,
    quinzenasMes,
    intervaloVisivelInicio,
    intervaloVisivelFim,
  } = params;

  const porFuncionario = new Map<
    string,
    {
      funcionarioId: string;
      nome: string;
      nomeGuerra: string | null;
      matricula: string | null;
      funcao: string | null;
      quinzenaPreferencial: 1 | 2 | null;
      modelos: Set<string>;
      situacoes: EscalaAlocacao[];
    }
  >();

  for (const tripulante of tripulantesCobertura) {
    if (funcionariosComAeronaveAtiva.has(tripulante.id)) continue;

    const textoFiltro = [tripulante.nome, tripulante.nome_guerra || '', tripulante.matricula || '']
      .join(' ')
      .toLowerCase();

    if (filtroNomeNormalizado && !textoFiltro.includes(filtroNomeNormalizado)) {
      continue;
    }

    porFuncionario.set(tripulante.id, {
      funcionarioId: tripulante.id,
      nome: tripulante.nome,
      nomeGuerra: tripulante.nome_guerra,
      matricula: tripulante.matricula,
      funcao: inferirFuncaoCobertura(tripulante.cargo),
      quinzenaPreferencial: tripulante.quinzena_numero,
      modelos: new Set((tripulante.modelos_habilitados || []).filter(Boolean)),
      situacoes: [],
    });
  }

  for (const situacao of situacoes) {
    const funcionarioId =
      situacao.funcionario_id ||
      `${situacao.funcionario_nome || situacao.funcionario?.nome || 'tripulante'}::${situacao.id}`;

    if (funcionariosComAeronaveAtiva.has(funcionarioId)) {
      continue;
    }

    const nome = situacao.funcionario_nome || situacao.funcionario?.nome || 'Tripulante';
    const nomeGuerra = situacao.funcionario_guerra || situacao.funcionario?.nome_guerra || null;
    const matricula = situacao.funcionario_matricula || situacao.funcionario?.matricula || null;
    const textoFiltro = [nome, nomeGuerra || '', matricula || ''].join(' ').toLowerCase();

    if (filtroNomeNormalizado && !textoFiltro.includes(filtroNomeNormalizado)) {
      continue;
    }

    if (!porFuncionario.has(funcionarioId)) {
      porFuncionario.set(funcionarioId, {
        funcionarioId,
        nome,
        nomeGuerra,
        matricula,
        funcao: situacao.funcao || situacao.funcionario_role || null,
        quinzenaPreferencial: normalizeQuinzenaPreferencial(situacao.funcionario_quinzena),
        modelos: new Set<string>(),
        situacoes: [],
      });
    }

    const row = porFuncionario.get(funcionarioId)!;
    const modelo =
      situacao.funcionario_modelo_aeronave ||
      situacao.aeronave_modelo ||
      situacao.modelo_aeronave ||
      null;

    if (modelo) {
      row.modelos.add(modelo);
    }
    if (!row.funcao && (situacao.funcao || situacao.funcionario_role)) {
      row.funcao = situacao.funcao || situacao.funcionario_role || null;
    }
    if (row.quinzenaPreferencial == null) {
      row.quinzenaPreferencial = normalizeQuinzenaPreferencial(situacao.funcionario_quinzena);
    }
    row.situacoes.push(situacao);
  }

  return Array.from(porFuncionario.values())
    .map((row) => {
      const situacoesOrdenadas = [...row.situacoes].sort((a, b) => {
        const quinzenaA = inferirNumeroQuinzenaSituacao(a, quinzenasMes) ?? 99;
        const quinzenaB = inferirNumeroQuinzenaSituacao(b, quinzenasMes) ?? 99;
        return (
          quinzenaA - quinzenaB ||
          a.data_inicio.localeCompare(b.data_inicio) ||
          getSituacaoPrioridade(a) - getSituacaoPrioridade(b) ||
          a.updated_at.localeCompare(b.updated_at)
        );
      });

      const modelo = Array.from(row.modelos).join(' / ') || null;
      const referenciaNaoFolga =
        situacoesOrdenadas.find((situacao) => situacao.situacao_tipo !== 'FOLGA') ||
        situacoesOrdenadas[0] ||
        null;

      const quinzenaPreferencialInferida =
        row.quinzenaPreferencial ??
        (referenciaNaoFolga
          ? inferirNumeroQuinzenaSituacao(referenciaNaoFolga, quinzenasMes)
          : null) ??
        null;

      const quinzenaFolgaEsperada = getQuinzenaOposta(quinzenaPreferencialInferida);

      const situacoesVisiveis = situacoesOrdenadas.filter((situacao) => {
        if (situacao.situacao_tipo !== 'FOLGA') return true;
        const folgaManual = !(situacao.auto_gerado === 1 || situacao.auto_gerado === true);
        if (folgaManual) return true;
        const quinzenaSituacao = inferirNumeroQuinzenaSituacao(situacao, quinzenasMes);
        if (quinzenaFolgaEsperada == null) return true;
        return quinzenaSituacao === quinzenaFolgaEsperada;
      });

      const situacaoReferencia =
        situacoesVisiveis.find((situacao) => {
          if (!intervaloVisivelInicio || !intervaloVisivelFim) return false;
          return !(
            situacao.data_fim < intervaloVisivelInicio || situacao.data_inicio > intervaloVisivelFim
          );
        }) ||
        situacoesVisiveis.find((situacao) => situacao.situacao_tipo !== 'FOLGA') ||
        situacoesVisiveis[0] ||
        referenciaNaoFolga;

      return {
        funcionarioId: row.funcionarioId,
        nome: row.nome,
        nomeGuerra: row.nomeGuerra,
        matricula: row.matricula,
        funcao: row.funcao,
        modelo,
        quinzenaPreferencial: quinzenaPreferencialInferida,
        situacoes: situacoesOrdenadas,
        situacaoReferencia,
        situacoesVisiveis,
      };
    })
    .filter((row) => {
      if (!filtroModeloNormalizado) return true;
      const modeloNormalizado = (row.modelo || '').trim().toUpperCase();
      return (
        modeloNormalizado === filtroModeloNormalizado ||
        modeloNormalizado.includes(filtroModeloNormalizado)
      );
    })
    .sort((a, b) => {
      const aSemSituacao = a.situacoesVisiveis.length === 0 ? 1 : 0;
      const bSemSituacao = b.situacoesVisiveis.length === 0 ? 1 : 0;
      const quinzenaA = a.situacaoReferencia
        ? (inferirNumeroQuinzenaSituacao(a.situacaoReferencia, quinzenasMes) ??
          Number.MAX_SAFE_INTEGER)
        : (a.quinzenaPreferencial ?? Number.MAX_SAFE_INTEGER);
      const quinzenaB = b.situacaoReferencia
        ? (inferirNumeroQuinzenaSituacao(b.situacaoReferencia, quinzenasMes) ??
          Number.MAX_SAFE_INTEGER)
        : (b.quinzenaPreferencial ?? Number.MAX_SAFE_INTEGER);
      const dataA = a.situacaoReferencia?.data_inicio || '9999-12-31';
      const dataB = b.situacaoReferencia?.data_inicio || '9999-12-31';
      return (
        aSemSituacao - bSemSituacao ||
        quinzenaA - quinzenaB ||
        dataA.localeCompare(dataB) ||
        a.nome.localeCompare(b.nome, 'pt-BR')
      );
    });
}

interface GrupoAeronave {
  chave: string;
  prefixo: string;
  modelo: string | null;
  aeronaveId: number | string;
  cor: string;
  linhas: LinhaAlocacaoGantt[];
  cobertura: EscalaCoberturaAeronave | null;
}

function inferirNumeroQuinzenaLinha(
  linha: LinhaAlocacaoGantt,
  quinzenas: QuinzenaEscala[],
): number | null {
  const porId = quinzenas.find((item) => item.id === linha.quinzenaId);
  if (porId) return porId.numero;

  const porPeriodo = quinzenas.find(
    (item) => linha.dataInicio <= item.data_fim && linha.dataFim >= item.data_inicio,
  );

  return porPeriodo?.numero ?? null;
}

function getLinhaOrdenacao(linha: LinhaAlocacaoGantt, quinzenas: QuinzenaEscala[]): number {
  const numeroQuinzena = inferirNumeroQuinzenaLinha(linha, quinzenas) ?? 99;
  const ordemFuncao = linha.funcao.startsWith('PIC') ? 0 : linha.funcao.startsWith('SIC') ? 1 : 2;

  return numeroQuinzena * 10 + ordemFuncao;
}

function inferirNumeroQuinzenaSituacao(
  situacao: EscalaAlocacao,
  quinzenas: QuinzenaEscala[],
): number | null {
  const porId = quinzenas.find((item) => item.id === situacao.quinzena_id);
  if (porId) return porId.numero;

  const porPeriodo = quinzenas.find(
    (item) => situacao.data_inicio <= item.data_fim && situacao.data_fim >= item.data_inicio,
  );

  return porPeriodo?.numero ?? null;
}

function getSituacaoPrioridade(situacao: EscalaAlocacao): number {
  switch (situacao.situacao_tipo) {
    case 'FERIAS':
      return 0;
    case 'SIM':
    case 'CURSO':
    case 'MED':
    case 'AFT':
      return 1;
    case 'FOLGA':
      return 2;
    case 'STB':
      return 3;
    default:
      return 4;
  }
}

function escolherMelhorSituacao(atual: EscalaAlocacao, candidata: EscalaAlocacao): EscalaAlocacao {
  const prioridadeAtual = getSituacaoPrioridade(atual);
  const prioridadeCandidata = getSituacaoPrioridade(candidata);

  if (prioridadeCandidata !== prioridadeAtual) {
    return prioridadeCandidata < prioridadeAtual ? candidata : atual;
  }

  const atualTemQuinzena = atual.quinzena_id != null;
  const candidataTemQuinzena = candidata.quinzena_id != null;
  if (atualTemQuinzena !== candidataTemQuinzena) {
    return candidataTemQuinzena ? candidata : atual;
  }

  const atualManual = !(atual.auto_gerado === 1 || atual.auto_gerado === true);
  const candidataManual = !(candidata.auto_gerado === 1 || candidata.auto_gerado === true);
  if (atualManual !== candidataManual) {
    return candidataManual ? candidata : atual;
  }

  return candidata.updated_at > atual.updated_at ? candidata : atual;
}

function inferirFuncaoOperacional(value: string | null | undefined): 'PIC' | 'SIC' | undefined {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();

  if (!normalized) return undefined;
  if (normalized.startsWith('PIC') || normalized.includes('COMAND')) return 'PIC';
  if (normalized.startsWith('SIC') || normalized.includes('COP')) return 'SIC';

  return undefined;
}

function normalizeQuinzenaPreferencial(value: string | null | undefined): 1 | 2 | null {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  if (!normalized) return null;
  if (normalized === 'primeira' || normalized === '1' || normalized === 'q1') return 1;
  if (normalized === 'segunda' || normalized === '2' || normalized === 'q2') return 2;

  return null;
}

function getQuinzenaOposta(quinzena: 1 | 2 | null): 1 | 2 | null {
  if (quinzena === 1) return 2;
  if (quinzena === 2) return 1;
  return null;
}

function normalizarEventosDoDia(eventos: EscalaEvento[]): EscalaEvento[] {
  if (eventos.length <= 1) return eventos;

  const existeEventoNaoFolga = eventos.some((evento) => evento.tipo_evento !== 'folga');
  const filtrados = existeEventoNaoFolga
    ? eventos.filter((evento) => evento.tipo_evento !== 'folga')
    : eventos;

  return [...filtrados].sort((a, b) => {
    if (a.gerado_automaticamente !== b.gerado_automaticamente) {
      return a.gerado_automaticamente - b.gerado_automaticamente;
    }
    return a.tipo_evento.localeCompare(b.tipo_evento, 'pt-BR');
  });
}

function buildEventosPorFuncData(
  eventos: EscalaEvento[],
  tiposEventoVisiveis?: string[],
): Map<string, EscalaEvento[]> {
  const mapa = new Map<string, EscalaEvento[]>();

  eventos.forEach((evento) => {
    if (tiposEventoVisiveis && !tiposEventoVisiveis.includes(evento.tipo_evento)) return;
    const inicio = new Date(`${evento.data_inicio.slice(0, 10)}T00:00:00`);
    const fim = new Date(`${evento.data_fim.slice(0, 10)}T00:00:00`);

    for (let cursor = new Date(inicio); cursor <= fim; cursor.setDate(cursor.getDate() + 1)) {
      const dia = localDateIso(cursor);
      const key = `${evento.funcionario_id}__${dia}`;
      const existentes = mapa.get(key) || [];
      existentes.push(evento);
      mapa.set(key, existentes);
    }
  });

  for (const [key, lista] of mapa.entries()) {
    mapa.set(key, normalizarEventosDoDia(lista));
  }

  return mapa;
}

function mapTripulacoesLegadas(tripulacoes: EscalaTripulacao[] = []): EscalaAlocacao[] {
  return tripulacoes.flatMap((tripulacao) => {
    const aeronavePrefixo = tripulacao.aeronave?.split(' ')[0] || 'Equipamento';
    const aeronaveModelo = tripulacao.aeronave?.split(' ').slice(1).join(' ') || null;

    const linhas: EscalaAlocacao[] = [];

    if (tripulacao.pic_id) {
      linhas.push({
        id: `${tripulacao.id}:PIC`,
        escala_id: tripulacao.escala_id,
        funcao: 'PIC',
        quinzena_id: null,
        data_inicio: tripulacao.data_inicio,
        data_fim: tripulacao.data_fim,
        padrao_escala_id: tripulacao.padrao_escala_id || null,
        base: tripulacao.base || null,
        observacoes: tripulacao.observacoes || null,

        status: 'planejado',
        created_by: null,
        created_at: tripulacao.data_inicio,
        updated_at: tripulacao.data_fim,
        funcionario: {
          id: tripulacao.pic_id,
          nome: tripulacao.pic_nome,
          nome_guerra: tripulacao.pic_nome_guerra || null,
          matricula: tripulacao.pic_matricula,
          role: tripulacao.pic_funcao || tripulacao.pic_cargo || 'PIC',
        },
        aeronave: {
          id: -1,
          prefixo: aeronavePrefixo,
          modelo: aeronaveModelo,
        },
        funcionario_id: tripulacao.pic_id,
        funcionario_nome: tripulacao.pic_nome,
        funcionario_guerra: tripulacao.pic_nome_guerra || null,
        funcionario_matricula: tripulacao.pic_matricula,
        funcionario_role: tripulacao.pic_funcao || tripulacao.pic_cargo || 'PIC',
        aeronave_id: -1,
        aeronave_prefixo: aeronavePrefixo,
        aeronave_modelo: aeronaveModelo,
      });
    }

    if (tripulacao.sic_id) {
      linhas.push({
        id: `${tripulacao.id}:SIC`,
        escala_id: tripulacao.escala_id,
        funcao: 'SIC',
        quinzena_id: null,
        data_inicio: tripulacao.data_inicio,
        data_fim: tripulacao.data_fim,
        padrao_escala_id: tripulacao.padrao_escala_id || null,
        base: tripulacao.base || null,
        observacoes: tripulacao.observacoes || null,
        status: 'planejado',
        created_by: null,
        created_at: tripulacao.data_inicio,
        updated_at: tripulacao.data_fim,
        funcionario: {
          id: tripulacao.sic_id,
          nome: tripulacao.sic_nome || 'SIC',
          nome_guerra: tripulacao.sic_nome_guerra || null,
          matricula: tripulacao.sic_matricula || null,
          role: tripulacao.sic_funcao || tripulacao.sic_cargo || 'SIC',
        },
        aeronave: {
          id: -1,
          prefixo: aeronavePrefixo,
          modelo: aeronaveModelo,
        },
        funcionario_id: tripulacao.sic_id,
        funcionario_nome: tripulacao.sic_nome || 'SIC',
        funcionario_guerra: tripulacao.sic_nome_guerra || null,
        funcionario_matricula: tripulacao.sic_matricula || null,
        funcionario_role: tripulacao.sic_funcao || tripulacao.sic_cargo || 'SIC',
        aeronave_id: -1,
        aeronave_prefixo: aeronavePrefixo,
        aeronave_modelo: aeronaveModelo,
      });
    }

    return linhas;
  });
}

function overlapsPeriodo(
  dataInicio: string,
  dataFim: string,
  intervaloInicio: string | null,
  intervaloFim: string | null,
): boolean {
  if (!intervaloInicio || !intervaloFim) return true;
  return !(dataFim < intervaloInicio || dataInicio > intervaloFim);
}

function isAlocacaoOperacionalComAeronave(alocacao: EscalaAlocacao): boolean {
  if (alocacao.situacao_tipo) return false;

  return Boolean(
    alocacao.aeronave_id != null ||
    alocacao.aeronave_prefixo ||
    alocacao.aeronave?.prefixo ||
    alocacao.aeronave_modelo ||
    alocacao.aeronave?.modelo,
  );
}

export function collectFuncionariosComAeronaveAtiva(
  alocacoes: EscalaAlocacao[],
  intervaloInicio: string | null,
  intervaloFim: string | null,
): Set<string> {
  const funcionarios = new Set<string>();

  for (const alocacao of alocacoes) {
    if (!isAlocacaoOperacionalComAeronave(alocacao)) {
      continue;
    }

    if (!overlapsPeriodo(alocacao.data_inicio, alocacao.data_fim, intervaloInicio, intervaloFim)) {
      continue;
    }

    if (alocacao.funcionario_id) {
      funcionarios.add(alocacao.funcionario_id);
    }
  }

  return funcionarios;
}

export default function GradeGantt({
  escala,
  tripulacoes = [],
  alocacoes,
  cobertura = [],
  tripulantesCobertura = [],
  eventos,
  quinzenas = [],
  filtroAeronave,
  filtroModelo,
  filtroQuinzena = 'todas',
  filtroNome = '',
  highlightAlocacao,
  isLoading,
  onMoverEvento,
  onAlocarTripulante,
  onEditarFuncionario,
  onEditarAlocacao,
  onRemoverAlocacao,
  onEditarSituacao,
  onRemoverSituacao,
  onRegistrarSituacao,
  isRefreshingAlocacao,
  onAlocarPrimeiraTripulacao,
  onAlocarPrimeiraAeronave,
}: GradeGanttProps) {
  const q1Fim = quinzenas?.find((q) => q.numero === 1)?.data_fim;
  const filtroAeronaveNormalizado =
    typeof filtroAeronave === 'string' ? filtroAeronave.trim().toUpperCase() : '';
  const filtroModeloNormalizado =
    typeof filtroModelo === 'string' ? filtroModelo.trim().toUpperCase() : '';
  const filtroNomeNormalizado = filtroNome.trim().toLowerCase();

  const { tiposEventoVisiveis, visaoContinua } = useEscalaStore();
  const [situacoesExpandidas, setSituacoesExpandidas] = useState(true);

  const diasDoMes = useMemo(() => {
    const mesBase = new Date(escala.ano, escala.mes - 1, 1);
    const inicio = visaoContinua ? new Date(escala.ano, escala.mes - 2, 1) : startOfMonth(mesBase);
    const fim = visaoContinua ? endOfMonth(addMonths(mesBase, 1)) : endOfMonth(mesBase);
    return eachDayOfInterval({ start: inicio, end: fim });
  }, [escala.ano, escala.mes, visaoContinua]);

  const diasFiltrados = useMemo(() => {
    if (filtroQuinzena === 'todas') return diasDoMes;
    const quinzena = quinzenas.find(
      (q) =>
        q.numero === (filtroQuinzena === 'q1' ? 1 : 2) &&
        q.mes === escala.mes &&
        q.ano === escala.ano,
    );
    if (!quinzena) return diasDoMes;
    return diasDoMes.filter((dia) => {
      const iso = localDateIso(dia);
      return iso >= quinzena.data_inicio && iso <= quinzena.data_fim;
    });
  }, [diasDoMes, filtroQuinzena, quinzenas, escala.mes, escala.ano]);

  // Build synthetic alocacoes from escala_eventos (CRM, simulator) so they appear
  // in LinhaSituacao rows — same bridge used by GradeTripulantes.
  const syntheticAlocacoes = useMemo(() => {
    if (!eventos || eventos.length === 0) return [] as EscalaAlocacao[];
    const ids = new Set((tripulantesCobertura || []).map((t) => t.id));
    if (ids.size === 0) return [] as EscalaAlocacao[];
    return buildSyntheticAlocacoesFromEventos({
      eventos,
      escalaId: escala.id,
      tripulanteIds: ids,
    });
  }, [eventos, tripulantesCobertura, escala.id]);

  const fonteAlocacoes = useMemo(() => {
    const base = alocacoes && alocacoes.length > 0 ? alocacoes : mapTripulacoesLegadas(tripulacoes);
    if (syntheticAlocacoes.length === 0) return base;
    // Prepend synthetic — real alocacoes win in conflict resolution because
    // grupos skips items with situacao_tipo, and situacoes deduplicates by chave.
    return [...syntheticAlocacoes, ...base];
  }, [alocacoes, tripulacoes, syntheticAlocacoes]);

  const quinzenasMes = useMemo(
    () =>
      [...quinzenas]
        .filter((q) => q.mes === escala.mes && q.ano === escala.ano)
        .sort((a, b) => a.numero - b.numero),
    [quinzenas, escala.mes, escala.ano],
  );

  const intervaloVisivelInicio = diasFiltrados[0] ? localDateIso(diasFiltrados[0]) : null;
  const intervaloVisivelFim = diasFiltrados[diasFiltrados.length - 1]
    ? localDateIso(diasFiltrados[diasFiltrados.length - 1])
    : null;

  const funcionariosComAeronaveAtiva = useMemo(
    () =>
      collectFuncionariosComAeronaveAtiva(
        fonteAlocacoes,
        intervaloVisivelInicio,
        intervaloVisivelFim,
      ),
    [fonteAlocacoes, intervaloVisivelFim, intervaloVisivelInicio],
  );

  const situacoes = useMemo(() => {
    const unicas = new Map<string, EscalaAlocacao>();

    fonteAlocacoes
      .filter((alocacao) => {
        if (!alocacao.situacao_tipo) return false;
        const folgaAutomatica =
          String(alocacao.situacao_tipo).toUpperCase() === 'FOLGA' &&
          (alocacao.auto_gerado === 1 || alocacao.auto_gerado === true);
        return !folgaAutomatica;
      })
      .forEach((alocacao) => {
        const quinzenaNumero = inferirNumeroQuinzenaSituacao(alocacao, quinzenasMes) ?? 'sem-q';
        const chave = [
          alocacao.funcionario_id,
          alocacao.data_inicio,
          alocacao.data_fim,
          quinzenaNumero,
        ].join('::');
        const existente = unicas.get(chave);
        unicas.set(chave, existente ? escolherMelhorSituacao(existente, alocacao) : alocacao);
      });

    return Array.from(unicas.values()).sort((a, b) => {
      const quinzenaA = inferirNumeroQuinzenaSituacao(a, quinzenasMes) ?? 99;
      const quinzenaB = inferirNumeroQuinzenaSituacao(b, quinzenasMes) ?? 99;
      return (
        quinzenaA - quinzenaB ||
        a.data_inicio.localeCompare(b.data_inicio) ||
        (a.funcionario_nome || '').localeCompare(b.funcionario_nome || '', 'pt-BR')
      );
    });
  }, [fonteAlocacoes, quinzenasMes]);

  const situacoesAgrupadas = useMemo<LinhaSituacaoTripulante[]>(() => {
    return buildTripulantesSemAeronaveRows({
      situacoes,
      tripulantesCobertura,
      funcionariosComAeronaveAtiva,
      filtroNomeNormalizado,
      filtroModeloNormalizado,
      quinzenasMes,
      intervaloVisivelInicio,
      intervaloVisivelFim,
    });
  }, [
    filtroModeloNormalizado,
    filtroNomeNormalizado,
    funcionariosComAeronaveAtiva,
    intervaloVisivelFim,
    intervaloVisivelInicio,
    quinzenasMes,
    situacoes,
    tripulantesCobertura,
  ]);

  const eventosPorFuncData = useMemo(
    () => buildEventosPorFuncData(eventos, tiposEventoVisiveis),
    [eventos, tiposEventoVisiveis],
  );

  const eventosPorFuncDataTodos = useMemo(() => buildEventosPorFuncData(eventos), [eventos]);

  // Agrupa por PREFIXO de aeronave (PS-CDU, PS-CDV, etc.) para sub-blocos independentes.
  const grupos = useMemo<GrupoAeronave[]>(() => {
    const agrupado = new Map<string, GrupoAeronave>();

    fonteAlocacoes.forEach((alocacao) => {
      if (alocacao.situacao_tipo) {
        return;
      }

      const modelo =
        alocacao.modelo_aeronave || alocacao.aeronave_modelo || alocacao.aeronave?.modelo || null;
      const semAeronave = alocacao.aeronave_id == null && !alocacao.aeronave_prefixo;
      const prefixoAlocacao = alocacao.aeronave_prefixo || alocacao.aeronave?.prefixo || null;

      // Chave de agrupamento é por PREFIXO (PS-CDU, PS-CDV) ou sem aeronave
      const chave = semAeronave
        ? SEM_AERONAVE_VALUE
        : `prefixo:${(prefixoAlocacao || modelo || '').toUpperCase()}`;

      if (filtroAeronaveNormalizado) {
        const prefixoNorm = (prefixoAlocacao || '').trim().toUpperCase();
        const modeloNorm = (modelo || '').trim().toUpperCase();
        if (
          !(
            prefixoNorm.includes(filtroAeronaveNormalizado) ||
            modeloNorm.includes(filtroAeronaveNormalizado)
          )
        ) {
          return;
        }
      }

      if (filtroModeloNormalizado) {
        const modeloNormalizado = (modelo || '').trim().toUpperCase();
        if (
          !(
            modeloNormalizado === filtroModeloNormalizado ||
            modeloNormalizado.includes(filtroModeloNormalizado)
          )
        ) {
          return;
        }
      }

      if (!agrupado.has(chave)) {
        const labelPrefixo = prefixoAlocacao || modelo || SEM_AERONAVE_LABEL;
        const coberturaAeronave = semAeronave
          ? null
          : cobertura.find(
              (item) =>
                (item.prefixo &&
                  item.prefixo.toUpperCase() === (prefixoAlocacao || '').toUpperCase()) ||
                (item.modelo && item.modelo.toUpperCase() === (modelo || '').toUpperCase()),
            ) || null;

        agrupado.set(chave, {
          chave,
          prefixo: labelPrefixo,
          modelo,
          aeronaveId: semAeronave ? SEM_AERONAVE_VALUE : chave,
          cor: semAeronave ? '#f59e0b' : getAeronaveColor(prefixoAlocacao || modelo || ''),
          linhas: [],
          cobertura: coberturaAeronave,
        });
      }

      agrupado.get(chave)?.linhas.push({
        id: alocacao.id,
        funcionarioId: alocacao.funcionario_id,
        nome: alocacao.funcionario_nome || alocacao.funcionario?.nome || 'Tripulante',
        matricula: alocacao.funcionario_matricula || alocacao.funcionario?.matricula || null,
        nomeGuerra: alocacao.funcionario_guerra || alocacao.funcionario?.nome_guerra || null,
        aeronavePrefixo: prefixoAlocacao,
        funcao: alocacao.funcao || 'N/A',
        quinzenaId: alocacao.quinzena_id ?? null,
        dataInicio: alocacao.data_inicio,
        dataFim: alocacao.data_fim,
        observacoes: alocacao.observacoes,
        status: alocacao.status,
        isInstrutor: !!alocacao.funcionario_is_instrutor,
      });
    });

    return Array.from(agrupado.values())
      .map((grupo) => ({
        ...grupo,
        linhas: grupo.linhas.sort((a, b) => {
          return (
            getLinhaOrdenacao(a, quinzenasMes) - getLinhaOrdenacao(b, quinzenasMes) ||
            a.dataInicio.localeCompare(b.dataInicio) ||
            a.nome.localeCompare(b.nome, 'pt-BR')
          );
        }),
      }))
      .sort((a, b) => {
        if (a.aeronaveId === SEM_AERONAVE_VALUE) return -1;
        if (b.aeronaveId === SEM_AERONAVE_VALUE) return 1;
        // Ordenar por modelo primeiro, depois por prefixo
        const modeloComp = (a.modelo || '').localeCompare(b.modelo || '', 'pt-BR');
        if (modeloComp !== 0) return modeloComp;
        return a.prefixo.localeCompare(b.prefixo, 'pt-BR');
      })
      .map((grupo) => {
        if (!filtroNomeNormalizado) return grupo;
        return {
          ...grupo,
          linhas: grupo.linhas.filter((l) =>
            [l.nome, l.nomeGuerra || '', l.matricula || '']
              .join(' ')
              .toLowerCase()
              .includes(filtroNomeNormalizado),
          ),
        };
      })
      .filter((grupo) => !filtroNomeNormalizado || grupo.linhas.length > 0);
  }, [
    cobertura,
    filtroAeronaveNormalizado,
    filtroModeloNormalizado,
    filtroNomeNormalizado,
    fonteAlocacoes,
    quinzenasMes,
  ]);

  // CMA status
  const allFuncionarioIds = useMemo(() => {
    const ids = new Set<string>();
    grupos.forEach((g) =>
      g.linhas.forEach((l) => {
        if (l.funcionarioId) ids.add(l.funcionarioId);
      }),
    );
    return Array.from(ids);
  }, [grupos]);
  const { data: cmaData } = useCMAStatusQuery(allFuncionarioIds);
  const cmaMap = useMemo(() => {
    const m = new Map<string, CMAStatus>();
    if (cmaData) cmaData.forEach((c) => m.set(c.funcionario_id, c));
    return m;
  }, [cmaData]);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  if (grupos.length === 0 && situacoesAgrupadas.length === 0 && filtroNomeNormalizado) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <div className="mx-auto max-w-md space-y-2">
          <div className="text-3xl">🔍</div>
          <h3 className="text-base font-semibold text-slate-900">Nenhum tripulante encontrado</h3>
          <p className="text-sm text-slate-500">
            Nenhum tripulante corresponde ao filtro &ldquo;{filtroNome}&rdquo;.
          </p>
        </div>
      </div>
    );
  }

  if (grupos.length === 0 && situacoesAgrupadas.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <div className="mx-auto max-w-xl space-y-3">
          <div className="text-4xl">✈</div>
          <h3 className="text-lg font-semibold text-slate-900">Nenhuma alocação operacional</h3>
          <p className="text-sm text-slate-500">
            A grade é montada por equipamento e tripulante. Crie a primeira alocação para começar o
            planejamento do mês.
          </p>
          {(onAlocarPrimeiraTripulacao || onAlocarPrimeiraAeronave) && (
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {onAlocarPrimeiraTripulacao && (
                <button
                  type="button"
                  onClick={onAlocarPrimeiraTripulacao}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" />
                  Alocar por Tripulante
                </button>
              )}
              {onAlocarPrimeiraAeronave && (
                <button
                  type="button"
                  onClick={onAlocarPrimeiraAeronave}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                >
                  <Plane className="h-4 w-4" />
                  Alocar por Aeronave
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 overflow-visible" data-testid="grade-gantt">
      {isRefreshingAlocacao && (
        <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold text-sky-700 shadow-sm">
          <Clock3 className="h-3.5 w-3.5 animate-spin" />
          Atualizando alocações e cobertura...
        </div>
      )}

      {grupos.map((grupo) => (
        <BlocoAeronave
          key={grupo.chave}
          escala={escala}
          prefixo={grupo.prefixo}
          modelo={grupo.modelo}
          aeronaveId={grupo.aeronaveId}
          cor={grupo.cor}
          linhas={grupo.linhas}
          quinzenas={quinzenasMes}
          diasDoMes={diasFiltrados}
          cobertura={grupo.cobertura}
          cmaMap={cmaMap}
          highlight={
            highlightAlocacao != null && String(grupo.aeronaveId) === String(highlightAlocacao)
          }
          eventosPorFuncData={eventosPorFuncData}
          eventosPorFuncDataTodos={eventosPorFuncDataTodos}
          onAdicionarAlocacao={onAlocarTripulante}
          onEditarFuncionario={onEditarFuncionario}
          onEditarAlocacao={onEditarAlocacao}
          onRemoverAlocacao={onRemoverAlocacao}
          onMoverEvento={onMoverEvento}
        />
      ))}

      {situacoesAgrupadas.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setSituacoesExpandidas((value) => !value)}
            className="flex w-full items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 text-left"
            data-export-hide="true"
          >
            <div>
              <div className="text-sm font-semibold text-slate-900">Tripulantes sem Aeronaves</div>
              <div className="text-xs text-slate-500">
                {situacoesAgrupadas.length}{' '}
                {situacoesAgrupadas.length === 1 ? 'tripulante listado' : 'tripulantes listados'}
              </div>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {situacoesExpandidas ? 'Ocultar' : 'Exibir'}
              {situacoesExpandidas ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </span>
          </button>

          {situacoesExpandidas &&
            (() => {
              const gruposSit = new Map<string, LinhaSituacaoTripulante[]>();
              for (const tripulante of situacoesAgrupadas) {
                const modelo = tripulante.modelo || 'Sem habilitação';
                if (!gruposSit.has(modelo)) gruposSit.set(modelo, []);
                gruposSit.get(modelo)!.push(tripulante);
              }
              return (
                <div className="w-full overflow-x-auto overflow-y-visible">
                  <table
                    className="w-full table-fixed border-collapse"
                    style={{ minWidth: `${diasFiltrados.length * 28 + 160}px` }}
                  >
                    {Array.from(gruposSit.entries()).map(([modelo, lista], gi) => (
                      <Fragment key={`grupo-situacao-${modelo}-${gi}`}>
                        {/* Model group header */}
                        <thead>
                          {gi === 0 && (
                            <CabecalhoDiasSituacao diasDoMes={diasFiltrados} q1Fim={q1Fim} />
                          )}
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <th
                              className="sticky left-0 z-10 bg-slate-50 border-r border-slate-200 px-3 py-1 text-left"
                              colSpan={diasFiltrados.length + 1}
                            >
                              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                {modelo}
                              </span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {lista.map((tripulante) => (
                            <LinhaSituacao
                              key={tripulante.funcionarioId}
                              tripulante={tripulante}
                              diasDoMes={diasFiltrados}
                              quinzenasMes={quinzenasMes}
                              mesReferencia={escala.mes}
                              anoReferencia={escala.ano}
                              q1Fim={q1Fim}
                              onEditarSituacao={onEditarSituacao}
                              onRegistrarSituacao={
                                onRegistrarSituacao
                                  ? () => {
                                      const quinzenaInicial = quinzenasMes.find(
                                        (quinzena) =>
                                          quinzena.numero === tripulante.quinzenaPreferencial,
                                      );
                                      onRegistrarSituacao({
                                        funcionarioInicialId: tripulante.funcionarioId,
                                        modoFluxoB: true,
                                        quinzenaInicial: quinzenaInicial?.id,
                                        dataInicioInicial:
                                          quinzenaInicial?.data_inicio ||
                                          tripulante.situacaoReferencia?.data_inicio ||
                                          intervaloVisivelInicio ||
                                          undefined,
                                        dataFimInicial:
                                          quinzenaInicial?.data_fim ||
                                          tripulante.situacaoReferencia?.data_fim ||
                                          intervaloVisivelFim ||
                                          undefined,
                                      });
                                    }
                                  : undefined
                              }
                              onRemover={
                                onRemoverSituacao && tripulante.situacoes.length === 1
                                  ? () =>
                                      onRemoverSituacao(
                                        tripulante.situacoes[0].id,
                                        tripulante.nomeGuerra || tripulante.nome || 'Tripulante',
                                      )
                                  : undefined
                              }
                            />
                          ))}
                        </tbody>
                      </Fragment>
                    ))}
                  </table>
                </div>
              );
            })()}
        </section>
      )}
    </div>
  );
}
