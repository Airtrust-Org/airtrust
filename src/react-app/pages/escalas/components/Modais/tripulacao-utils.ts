import type {
  EscalaAlocacao,
  QuinzenaEscala,
  TripulanteOperacional,
} from '../../hooks/queries/useEscalasQuery';
import {
  fmtDateShort,
  getQuinzenaBadgeClasses,
  getQuinzenaShortLabel,
} from '../../quinzena-tokens';

export function formatarAeronave(prefixo?: string | null, modelo?: string | null) {
  return [prefixo, modelo].filter(Boolean).join(' ').trim() || 'Aeronave';
}

export function normalizeText(value?: string | null) {
  return (value || '').trim().toUpperCase();
}

export function normalizeModeloOperacional(value?: string | null) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');

  if (!normalized) return '';
  if (normalized.includes('SK76') || normalized.includes('S76')) return 'SK76';
  if (normalized.includes('AW139')) return 'AW139';
  return normalized;
}

export function getFuncaoPreferidaFluxoB(role?: string | null) {
  const normalized = String(role || '')
    .trim()
    .toUpperCase();

  if (normalized.includes('COP')) return 'SIC' as const;
  return 'PIC' as const;
}

export function isFuncaoCompativelFluxoB(role?: string | null, funcao?: string | null) {
  const normalizedRole = String(role || '')
    .trim()
    .toUpperCase();
  const normalizedFuncao = String(funcao || '')
    .trim()
    .toUpperCase();

  if (!normalizedFuncao) return false;
  if (normalizedRole.includes('COP')) return normalizedFuncao === 'SIC';
  if (normalizedRole.includes('COM') || normalizedRole.includes('CMT')) {
    return normalizedFuncao === 'PIC' || normalizedFuncao === 'SIC';
  }
  return normalizedFuncao === 'PIC' || normalizedFuncao === 'SIC';
}

export function funcaoExigeComandante(funcao?: string | null) {
  const normalizedFuncao = String(funcao || '')
    .trim()
    .toUpperCase();

  return ['PIC', 'PIC_CHK', 'INSTRUTOR', 'FLEX'].includes(normalizedFuncao);
}

export function isTripulanteCompativelComFuncao(role?: string | null, funcao?: string | null) {
  const normalizedRole = String(role || '')
    .trim()
    .toUpperCase();

  if (!funcaoExigeComandante(funcao)) {
    return true;
  }

  return !normalizedRole.includes('COP');
}

export function intervaloSobrepoe(aInicio: string, aFim: string, bInicio: string, bFim: string) {
  return aFim >= bInicio && aInicio <= bFim;
}

type PeriodoModo = '1q' | '2q' | 'custom';

export function inferirModoPeriodo(
  dataInicio: string,
  dataFim: string,
  quinzenas: QuinzenaEscala[] | undefined,
  mes: number,
): PeriodoModo {
  const quinzenasMes = (quinzenas || []).filter((q) => q.mes === mes);
  const primeira = quinzenasMes.find((q) => q.numero === 1);
  const segunda = quinzenasMes.find((q) => q.numero === 2);

  if (primeira && dataInicio === primeira.data_inicio && dataFim === primeira.data_fim) {
    return '1q';
  }
  if (segunda && dataInicio === segunda.data_inicio && dataFim === segunda.data_fim) {
    return '2q';
  }
  return 'custom';
}

export function getQuinzenaSelecionada(
  modo: PeriodoModo,
  quinzenas: QuinzenaEscala[] | undefined,
  mes: number,
  dataInicio: string,
  dataFim: string,
) {
  const quinzenasMes = (quinzenas || []).filter((q) => q.mes === mes);
  if (modo === '1q') return quinzenasMes.find((q) => q.numero === 1) ?? null;
  if (modo === '2q') return quinzenasMes.find((q) => q.numero === 2) ?? null;
  return (
    quinzenasMes.find((q) => intervaloSobrepoe(q.data_inicio, q.data_fim, dataInicio, dataFim)) ??
    null
  );
}

export function getQuinzenaPreset(
  modo: Exclude<PeriodoModo, 'custom'>,
  quinzenas: QuinzenaEscala[] | undefined,
  mes: number,
) {
  return (quinzenas || []).find((q) => q.mes === mes && q.numero === (modo === '1q' ? 1 : 2));
}

export function getQuinzenaFiltro(
  modo: PeriodoModo,
): 'primeira' | 'segunda' | 'personalizada' | null {
  if (modo === '1q') return 'primeira';
  if (modo === '2q') return 'segunda';
  return 'personalizada';
}

export function getQuinzenaBadge(
  quinzena: string | null | undefined,
): { label: string; className: string } | null {
  const label = getQuinzenaShortLabel(quinzena);
  if (!label) return null;
  return { label, className: getQuinzenaBadgeClasses(quinzena) };
}

export function normalizeQuinzena(
  quinzena: string | null | undefined,
): 'primeira' | 'segunda' | null {
  const normalized = String(quinzena || '')
    .trim()
    .toLowerCase();

  if (['primeira', '1', '1q', '1a', '1ª', 'primeira quinzena'].includes(normalized)) {
    return 'primeira';
  }

  if (['segunda', '2', '2q', '2a', '2ª', 'segunda quinzena'].includes(normalized)) {
    return 'segunda';
  }

  return null;
}

export function getQuinzenaLabel(numero: number | null | undefined): string | null {
  if (numero === 1) return '1Q';
  if (numero === 2) return '2Q';
  return null;
}

export interface ResumoConflitoSubstituicao {
  aeronave_prefixo?: string | null;
  aeronave_modelo?: string | null;
  funcionario_nome?: string | null;
  data_inicio: string;
  data_fim: string;
  situacao_tipo?: string | null;
  situacao_nome?: string | null;
  funcao?: string | null;
  quinzena_numero?: number | null;
}

export function formatarResumoConflitoSubstituicao(
  conflito: ResumoConflitoSubstituicao | null | undefined,
): string | null {
  if (!conflito) return null;

  const origem =
    conflito.situacao_nome ||
    conflito.situacao_tipo ||
    conflito.aeronave_prefixo ||
    conflito.aeronave_modelo ||
    'Sem aeronave';

  const detalhes = [getQuinzenaLabel(conflito.quinzena_numero), conflito.funcao, origem]
    .filter(Boolean)
    .join(' · ');
  const periodo = `${fmtDateShort(conflito.data_inicio)} → ${fmtDateShort(conflito.data_fim)}`;

  return detalhes ? `${detalhes} · ${periodo}` : periodo;
}

export function getResumoAlocacaoExistente(tripulante: TripulanteOperacional): string | null {
  if (!tripulante.ja_alocado_em) return null;

  const alocacao = tripulante.ja_alocado_em;
  if (
    (alocacao.origem === 'escala_situacao' || alocacao.origem === 'funcionario_ferias') &&
    tripulante.pode_ser_alocado !== true
  ) {
    return null;
  }

  const origemSituacao = alocacao.situacao_nome || alocacao.situacao_tipo;
  if (!alocacao.aeronave_prefixo && !alocacao.quinzena_numero && !alocacao.funcao) {
    if (!origemSituacao) return null;

    const periodoSituacao = `${fmtDateShort(alocacao.data_inicio)} → ${fmtDateShort(alocacao.data_fim)}`;
    return `Já alocado em ${origemSituacao} · ${periodoSituacao}`;
  }

  const onde = [
    getQuinzenaLabel(alocacao.quinzena_numero),
    origemSituacao,
    alocacao.aeronave_prefixo,
    alocacao.funcao,
  ]
    .filter(Boolean)
    .join(' · ');
  const periodo = `${fmtDateShort(alocacao.data_inicio)} → ${fmtDateShort(alocacao.data_fim)}`;

  return onde ? `Já alocado em ${onde} · ${periodo}` : `Já alocado em ${periodo}`;
}

export function getAvisoQuinzenaCruzada(
  tripulante: TripulanteOperacional | null | undefined,
  quinzenaSelecionada: 'primeira' | 'segunda' | 'personalizada' | null,
): string | null {
  if (!tripulante || !quinzenaSelecionada || quinzenaSelecionada === 'personalizada') {
    return null;
  }

  const quinzenaTripulante = normalizeQuinzena(tripulante.quinzena);
  if (!quinzenaTripulante || quinzenaTripulante === quinzenaSelecionada) {
    return null;
  }

  const origem = quinzenaTripulante === 'primeira' ? '1Q' : '2Q';
  const destino = quinzenaSelecionada === 'primeira' ? '1Q' : '2Q';
  const nome = tripulante.nome_guerra || tripulante.nome;

  return `${nome} é da ${origem} e está sendo alocado na ${destino}.`;
}

export function buildFallbackTripulante(
  alocacao: EscalaAlocacao | undefined,
): TripulanteOperacional | null {
  if (!alocacao) return null;

  return {
    funcionario_id: alocacao.funcionario_id,
    nome: alocacao.funcionario_nome || 'Tripulante atual',
    nome_guerra: alocacao.funcionario_guerra,
    matricula: alocacao.funcionario_matricula || '—',
    empresa_id: 0,
    role: alocacao.funcionario_role || alocacao.funcao,
    cma_valido: true,
    cma_dias_restantes: null,
    cma_validade_fim: null,
    frms_score: null,
    frms_status: null,
    frms_avaliacao_data: null,
    simuladores_pendentes: 0,
    proximo_simulador_data: null,
    habilitacoes: [],
    status_operacional: 'APTO',
    pode_ser_alocado: true,
    ja_alocado_nesta_escala: true,
    motivo_bloqueio: null,
    ja_alocado_em: null,
    quinzena: null,
  };
}

export interface SlotGerencialSelecao {
  key: string;
  funcao: string | null;
  quinzena: Pick<QuinzenaEscala, 'numero' | 'data_inicio' | 'data_fim'>;
}

export function getSlotGerencialKeysDaFuncao<
  T extends Pick<SlotGerencialSelecao, 'key' | 'funcao'>,
>(slots: T[], funcao?: string | null): string[] {
  const funcaoNormalizada = normalizeText(funcao);
  if (!funcaoNormalizada) return [];

  return slots
    .filter((slot) => normalizeText(slot.funcao) === funcaoNormalizada)
    .map((slot) => slot.key);
}

export function getPrimeiroSlotGerencialDaFuncao<T extends Pick<SlotGerencialSelecao, 'funcao'>>(
  slots: T[],
  funcao?: string | null,
): T | null {
  const funcaoNormalizada = normalizeText(funcao);
  if (!funcaoNormalizada) return null;

  return slots.find((slot) => normalizeText(slot.funcao) === funcaoNormalizada) ?? null;
}

export function getResumoSlotsGerenciaisSelecionados<
  T extends Pick<SlotGerencialSelecao, 'key' | 'funcao' | 'quinzena'>,
>(slots: T[], selectedKeys: string[]): string {
  if (selectedKeys.length === 0) return '';

  const selectedSet = new Set(selectedKeys);

  return slots
    .filter((slot) => selectedSet.has(slot.key))
    .map((slot) => `${slot.quinzena.numero}Q ${slot.funcao}`.trim())
    .join(', ');
}
