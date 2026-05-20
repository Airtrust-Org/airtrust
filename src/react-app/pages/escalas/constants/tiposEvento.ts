import type { TipoEvento } from '../hooks/useEscalaStore';

export const EVENTO_CONFIG: Record<
  TipoEvento,
  {
    label: string;
    labelCurto: string;
    sigla: string;
    cor: string;
    corTexto: string;
    corBg: string;
    prioridade: number;
    ativo?: boolean;
  }
> = {
  voo: {
    label: 'Voo Operacional',
    labelCurto: 'VOO',
    sigla: 'V',
    cor: '#3B82F6',
    corTexto: '#fff',
    corBg: '#EFF6FF',
    prioridade: 1,
    ativo: true,
  },
  viagem: {
    label: 'Viagem',
    labelCurto: 'VGM',
    sigla: 'V',
    cor: '#64748B',
    corTexto: '#fff',
    corBg: '#F8FAFC',
    prioridade: 2,
    ativo: false,
  },
  treinamento_solo: {
    label: 'Trein. Solo',
    labelCurto: 'TSO',
    sigla: 'T',
    cor: '#C2410C',
    corTexto: '#fff',
    corBg: '#FFF7ED',
    prioridade: 3,
    ativo: false,
  },
  treinamento_simulador: {
    label: 'Simulador',
    labelCurto: 'SIM',
    sigla: 'S',
    cor: '#6366F1',
    corTexto: '#fff',
    corBg: '#EEF2FF',
    prioridade: 3,
    ativo: true,
  },
  medico: {
    label: 'Exame Médico',
    labelCurto: 'MED',
    sigla: 'M',
    cor: '#EF4444',
    corTexto: '#fff',
    corBg: '#FEF2F2',
    prioridade: 0,
    ativo: true,
  },
  cheque: {
    label: 'Cheque Prof.',
    labelCurto: 'CHK',
    sigla: 'C',
    cor: '#D97706',
    corTexto: '#fff',
    corBg: '#FEFCE8',
    prioridade: 0,
    ativo: true,
  },
  reaquisi: {
    label: 'Reaquisição',
    labelCurto: 'REA',
    sigla: 'R',
    cor: '#0F766E',
    corTexto: '#fff',
    corBg: '#F0FDFA',
    prioridade: 2,
    ativo: false,
  },
  trabalho: {
    label: 'Trabalho',
    labelCurto: 'TRB',
    sigla: 'T',
    cor: '#6B7280',
    corTexto: '#fff',
    corBg: '#F9FAFB',
    prioridade: 5,
    ativo: false,
  },
  folga: {
    label: 'Folga',
    labelCurto: 'FOL',
    sigla: 'F',
    cor: '#16A34A',
    corTexto: '#fff',
    corBg: '#F0FDF4',
    prioridade: 6,
    ativo: true,
  },
  standby: {
    label: 'Standby',
    labelCurto: 'STB',
    sigla: 'S',
    cor: '#B45309',
    corTexto: '#fff',
    corBg: '#FFFBEB',
    prioridade: 4,
    ativo: false,
  },
  ferias: {
    label: 'Férias',
    labelCurto: 'FER',
    sigla: 'F',
    cor: '#059669',
    corTexto: '#fff',
    corBg: '#ECFDF5',
    prioridade: 6,
    ativo: true,
  },
  licenca: {
    label: 'Licença',
    labelCurto: 'LIC',
    sigla: 'L',
    cor: '#94A3B8',
    corTexto: '#fff',
    corBg: '#F8FAFC',
    prioridade: 5,
    ativo: true,
  },
};

export const TODOS_TIPOS_EVENTO = Object.keys(EVENTO_CONFIG) as TipoEvento[];

export const TIPOS_EVENTO_ATIVOS = TODOS_TIPOS_EVENTO.filter((k) => EVENTO_CONFIG[k].ativo);

export const TIPO_TO_CODIGO_MAP: Record<TipoEvento, string> = {
  voo: 'VOO',
  viagem: 'VIM',
  treinamento_solo: 'TSO',
  treinamento_simulador: 'SIM',
  medico: 'MED',
  cheque: 'CHK',
  reaquisi: 'REA',
  trabalho: 'TRB',
  folga: 'FOL',
  standby: 'SMH',
  ferias: 'FER',
  licenca: 'LIC',
};

const TIPO_CODIGO_MAP: Record<string, TipoEvento> = {
  VOO: 'voo',
  VIM: 'viagem',
  TSO: 'treinamento_solo',
  SIM: 'treinamento_simulador',
  MED: 'medico',
  CHK: 'cheque',
  REA: 'reaquisi',
  TRB: 'trabalho',
  FOL: 'folga',
  SMH: 'standby',
  FER: 'ferias',
  LIC: 'licenca',
};

export function getTipoCodigo(tipo: TipoEvento): string {
  return TIPO_TO_CODIGO_MAP[tipo];
}

export function normalizeTipoCodigo(codigo: string): TipoEvento | null {
  const normalized = codigo.trim().toUpperCase();
  if (TIPO_CODIGO_MAP[normalized]) return TIPO_CODIGO_MAP[normalized];
  const lowered = codigo.trim().toLowerCase();
  return TODOS_TIPOS_EVENTO.includes(lowered as TipoEvento) ? (lowered as TipoEvento) : null;
}
