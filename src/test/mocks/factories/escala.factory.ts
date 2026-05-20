import type {
  EscalaMensal,
  CalendarioData,
  EscalaAlocacao,
  ConflitosData,
  TipoEventoConfig,
  QuinzenaEscala,
  TripulanteOperacional,
} from '@/react-app/pages/escalas/hooks/queries/escalas-types';

// ── EscalaMensal ───────────────────────────────────────────────────────────
export function makeEscalaMensal(overrides: Partial<EscalaMensal> = {}): EscalaMensal {
  return {
    id: 'escala-1',
    empresa_id: 6,
    ano: 2026,
    mes: 5,
    status: 'rascunho',
    nome: 'Escala Maio/2026',
    periodo: null,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    deleted_at: null,
    ...overrides,
  } as EscalaMensal;
}

// ── CalendarioData ─────────────────────────────────────────────────────────
export function makeCalendarioData(overrides: Partial<CalendarioData> = {}): CalendarioData {
  return {
    escala: makeEscalaMensal(),
    alocacoes: [makeAlocacao()],
    eventos: [makeEvento()],
    aeronaves: [],
    tripulacoes: [],
    quinzenas: [
      {
        id: 'q1',
        numero: 1,
        mes: 5,
        ano: 2026,
        data_inicio: '2026-05-01',
        data_fim: '2026-05-16',
        empresa_id: 6,
      },
      {
        id: 'q2',
        numero: 2,
        mes: 5,
        ano: 2026,
        data_inicio: '2026-05-17',
        data_fim: '2026-05-31',
        empresa_id: 6,
      },
    ],
    ...overrides,
  } as CalendarioData;
}

// ── EscalaAlocacao ─────────────────────────────────────────────────────────
export function makeAlocacao(overrides: Partial<EscalaAlocacao> = {}): EscalaAlocacao {
  return {
    id: 'aloc-1',
    escala_id: 'escala-1',
    funcionario_id: '10',
    funcionario_nome: 'João Silva',
    funcionario_guerra: 'Silva',
    funcionario_matricula: 'MAT001',
    funcionario_role: 'PILOTO_CMT',
    aeronave_id: 24,
    aeronave_prefixo: 'PS-CDV',
    aeronave_modelo: 'AW139',
    funcao: 'PIC',
    situacao_tipo: null,
    quinzena_id: 'q1',
    quinzena_numero: 1,
    data_inicio: '2026-05-01',
    data_fim: '2026-05-16',
    auto_gerado: false,
    deleted_at: null,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    ...overrides,
  } as EscalaAlocacao;
}

// ── EscalaEvento (como CalendarioData.eventos[]) ───────────────────────────
export function makeEvento(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 'ev-1',
    escala_id: 'escala-1',
    funcionario_id: '10',
    funcionario_nome: 'João Silva',
    tipo_evento_id: 'te-1',
    tipo_evento_codigo: 'TRN',
    tipo_evento_nome: 'Treinamento',
    tipo_evento_cor: '#3B82F6',
    data_inicio: '2026-05-05',
    data_fim: '2026-05-05',
    auto_gerado: false,
    deleted_at: null,
    ...overrides,
  };
}

// ── TipoEventoConfig ───────────────────────────────────────────────────────
export function makeTipoEvento(overrides: Partial<TipoEventoConfig> = {}): TipoEventoConfig {
  return {
    id: 'te-1',
    codigo: 'TRN',
    nome: 'Treinamento',
    cor: '#3B82F6',
    icone: null,
    ativo: 1,
    ordem: 1,
    empresa_id: 6,
    ...overrides,
  } as TipoEventoConfig;
}

// ── ConflitosData ──────────────────────────────────────────────────────────
export function makeConflitosData(overrides: Partial<ConflitosData> = {}): ConflitosData {
  return {
    conflitos_eventos: [],
    conflitos_tripulacoes: [],
    total: 0,
    ...overrides,
  } as ConflitosData;
}

// ── QuinzenaEscala ─────────────────────────────────────────────────────────
export function makeQuinzena(overrides: Partial<QuinzenaEscala> = {}): QuinzenaEscala {
  return {
    id: 'q1',
    numero: 1,
    mes: 5,
    ano: 2026,
    data_inicio: '2026-05-01',
    data_fim: '2026-05-16',
    empresa_id: 6,
    ...overrides,
  } as QuinzenaEscala;
}

// ── TripulanteOperacional ─────────────────────────────────────────────────
export function makeTripulante(
  overrides: Partial<TripulanteOperacional> = {},
): TripulanteOperacional {
  return {
    funcionario_id: '10',
    nome: 'João Silva',
    nome_guerra: 'Silva',
    matricula: 'MAT001',
    empresa_id: 6,
    role: 'PILOTO_CMT',
    cma_valido: true,
    cma_dias_restantes: 180,
    cma_validade_fim: '2026-12-31',
    frms_score: null,
    frms_status: null,
    frms_avaliacao_data: null,
    simuladores_pendentes: 0,
    proximo_simulador_data: null,
    habilitacoes: [],
    status_operacional: 'APTO',
    pode_ser_alocado: true,
    ja_alocado_nesta_escala: false,
    motivo_bloqueio: null,
    ja_alocado_em: null,
    quinzena: 'primeira',
    ...overrides,
  } as TripulanteOperacional;
}
