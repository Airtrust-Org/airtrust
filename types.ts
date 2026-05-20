// worker-airtrust/src/lib/sgso/types.ts
// ============================================================
// Tipos centrais do módulo SGSO
// Importar em routes e services — NUNCA definir tipos inline nas rotas
// ============================================================

// ── Enums / Literais ─────────────────────────────────────────

export type SgsoRelatoTipo = 'OCORRENCIA' | 'PERIGO' | 'INCIDENTE' | 'ACIDENTE';

export type SgsoRelatoStatus =
  | 'ABERTO'
  | 'EM_ANALISE'
  | 'AGUARDANDO_ACAO'
  | 'FECHADO';

export type SgsoFaseVoo =
  | 'PREFLIGHT' | 'TAXI' | 'DECOLAGEM' | 'SUBIDA'
  | 'CRUZEIRO' | 'DESCIDA' | 'APROXIMACAO' | 'POUSO'
  | 'POS_VOO' | 'SOLO' | 'MANUTENCAO' | 'NAO_APLICAVEL';

export type SgsoCondicaoMet =
  | 'VMC' | 'IMC' | 'NOITE_VMC' | 'NOITE_IMC' | 'DEGRADADA' | 'NAO_APLICAVEL';

// Probabilidade da Matriz de Risco 5×5
// A = Frequente (mais provável), E = Improvável (menos provável)
export type SgsoProbabilidade = 'A' | 'B' | 'C' | 'D' | 'E';

// Severidade da Matriz de Risco 5×5
// 1 = Insignificante, 5 = Catastrófico
export type SgsoSeveridade = 1 | 2 | 3 | 4 | 5;

export type SgsoNivelRisco = 'BAIXO' | 'MEDIO' | 'ALTO' | 'CRITICO';

export type SgsoTipoAvaliacao = 'INICIAL' | 'RESIDUAL';

export type SgsoAcaoTipo = 'CORRETIVA' | 'PREVENTIVA';
export type SgsoAcaoStatus = 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';
export type SgsoAcaoCategoria =
  | 'TREINAMENTO' | 'PROCEDIMENTO' | 'EQUIPAMENTO'
  | 'SUPERVISAO' | 'COMUNICACAO' | 'OUTRO';

export type SgsoNivelHfacs =
  | 'ACOES_INSEGURAS'
  | 'PRECONDICOES'
  | 'SUPERVISAO'
  | 'INFLUENCIAS_ORGANIZACIONAIS';

export type SgsoAuditoriaStatus = 'PROGRAMADA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';
export type SgsoNcTipo = 'MAJOR' | 'MINOR' | 'OBSERVACAO';
export type SgsoNcStatus = 'ABERTA' | 'EM_RESOLUCAO' | 'AGUARDANDO_VERIFICACAO' | 'FECHADA' | 'CANCELADA';

// ── Interfaces de domínio ─────────────────────────────────────

export interface SgsoRelato {
  id: string;
  empresa_id: number;
  numero_protocolo: string;
  tipo: SgsoRelatoTipo;
  anonimo: 0 | 1;
  relator_id: number | null;
  aeronave_id: number | null;
  aeronave_matricula: string | null;
  aeronave_modelo: string | null;
  data_ocorrencia: string;
  local_icao: string | null;
  local_descricao: string | null;
  fase_voo: SgsoFaseVoo | null;
  condicao_meteorologica: SgsoCondicaoMet | null;
  descricao: string;
  consequencia: string | null;
  accao_imediata: string | null;
  categoria_adrep: string | null;
  subcategoria_adrep: string | null;
  status: SgsoRelatoStatus;
  gso_responsavel_id: number | null;
  // Integração AirTrust
  escala_id: string | null;
  escala_quinzena: 1 | 2 | null;
  frms_jornada_id: number | null;
  efetividade_cognitiva: number | null;
  horas_acumuladas_7d: number | null;
  horas_acumuladas_28d: number | null;
  qualificacoes_vencidas: number;
  dias_embarcado: number | null;
  // Evidências
  arquivo_url: string | null;
  arquivo_nome: string | null;
  // Fechamento
  fechado_por: number | null;
  fechado_em: string | null;
  observacoes_fechamento: string | null;
  // Auditoria
  created_by: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SgsoAvaliacaoRisco {
  id: number;
  relato_id: string;
  empresa_id: number;
  tipo_avaliacao: SgsoTipoAvaliacao;
  probabilidade: SgsoProbabilidade;
  severidade: SgsoSeveridade;
  nivel_risco: SgsoNivelRisco;
  probabilidade_original: SgsoProbabilidade | null;
  elevado_por_fadiga: 0 | 1;
  justificativa_elevacao: string | null;
  justificativa: string | null;
  avaliador_id: number;
  data_avaliacao: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SgsoAcaoMitigacao {
  id: number;
  empresa_id: number;
  relato_id: string | null;
  nc_id: number | null;
  tipo: SgsoAcaoTipo;
  descricao: string;
  categoria: SgsoAcaoCategoria | null;
  responsavel_id: number;
  prazo: string;
  status: SgsoAcaoStatus;
  percentual_conclusao: number;
  evidencia_url: string | null;
  evidencia_descricao: string | null;
  data_conclusao: string | null;
  concluida_por: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SgsoFatorHumano {
  id: number;
  relato_id: string;
  empresa_id: number;
  nivel_hfacs: SgsoNivelHfacs;
  categoria: string;
  subcategoria: string | null;
  descricao: string | null;
  efetividade_cognitiva_capturada: number | null;
  fonte_automatica: 0 | 1;
  created_at: string;
}

// ── DTOs de entrada (Zod schemas no arquivo de rotas) ─────────

export interface CreateRelatoDto {
  tipo: SgsoRelatoTipo;
  anonimo?: boolean;
  aeronave_id?: number;
  data_ocorrencia: string;
  local_icao?: string;
  local_descricao?: string;
  fase_voo?: SgsoFaseVoo;
  condicao_meteorologica?: SgsoCondicaoMet;
  descricao: string;                // mínimo 50 chars
  consequencia?: string;
  accao_imediata?: string;
  categoria_adrep?: string;
  subcategoria_adrep?: string;
}

export interface CreateAvaliacaoRiscoDto {
  tipo_avaliacao: SgsoTipoAvaliacao;
  probabilidade: SgsoProbabilidade;
  severidade: SgsoSeveridade;
  justificativa?: string;
}

export interface CreateAcaoDto {
  tipo: SgsoAcaoTipo;
  descricao: string;
  categoria?: SgsoAcaoCategoria;
  responsavel_id: number;
  prazo: string;
}

// ── Matriz de Risco — lógica pura ────────────────────────────

/**
 * Tabela da Matriz de Risco 5×5 (ICAO Doc 9859)
 * Chave: `${probabilidade}${severidade}` — ex: "A5", "C3"
 */
export const MATRIZ_RISCO: Record<string, SgsoNivelRisco> = {
  // Probabilidade A (Frequente)
  A1: 'MEDIO', A2: 'ALTO',   A3: 'ALTO',   A4: 'CRITICO', A5: 'CRITICO',
  // Probabilidade B (Provável)
  B1: 'MEDIO', B2: 'MEDIO',  B3: 'ALTO',   B4: 'ALTO',    B5: 'CRITICO',
  // Probabilidade C (Ocasional)
  C1: 'BAIXO', C2: 'MEDIO',  C3: 'MEDIO',  C4: 'ALTO',    C5: 'ALTO',
  // Probabilidade D (Remoto)
  D1: 'BAIXO', D2: 'BAIXO',  D3: 'MEDIO',  D4: 'MEDIO',   D5: 'ALTO',
  // Probabilidade E (Improvável)
  E1: 'BAIXO', E2: 'BAIXO',  E3: 'BAIXO',  E4: 'MEDIO',   E5: 'MEDIO',
};

/**
 * Ordem das probabilidades para elevar/reduzir um nível
 * A = mais provável, E = menos provável
 */
export const PROBABILIDADE_ORDEM: SgsoProbabilidade[] = ['E', 'D', 'C', 'B', 'A'];

/**
 * Threshold de efetividade cognitiva (FRMS) que dispara elevação
 * automática de probabilidade na Matriz de Risco
 */
export const FRMS_FADIGA_THRESHOLD = 70;

/**
 * Calcula o nível de risco a partir dos eixos da matriz
 */
export function calcularNivelRisco(
  probabilidade: SgsoProbabilidade,
  severidade: SgsoSeveridade
): SgsoNivelRisco {
  const chave = `${probabilidade}${severidade}`;
  return MATRIZ_RISCO[chave] ?? 'MEDIO';
}

/**
 * Eleva a probabilidade em um nível (ex: C → B)
 * Retorna a mesma probabilidade se já estiver no máximo (A)
 */
export function elevarProbabilidade(prob: SgsoProbabilidade): SgsoProbabilidade {
  const idx = PROBABILIDADE_ORDEM.indexOf(prob);
  // Índice maior = mais provável. Clamp no máximo (A = índice 4)
  return PROBABILIDADE_ORDEM[Math.min(idx + 1, PROBABILIDADE_ORDEM.length - 1)];
}

/**
 * Prazo máximo de resposta em horas por nível de risco
 */
export const PRAZO_RESPOSTA: Record<SgsoNivelRisco, string> = {
  CRITICO: '24 horas — Operação suspensa imediatamente',
  ALTO:    '48 horas — Ação corretiva imediata obrigatória',
  MEDIO:   '30 dias — Ação planejada necessária',
  BAIXO:   'Próximo ciclo de revisão',
};

// ── SPIs — códigos padrão ─────────────────────────────────────

export const SPI_CODIGOS = {
  TAXA_RELATOS:               'TAXA_RELATOS',
  TAXA_OCORRENCIAS_SERIAS:    'TAXA_OCORRENCIAS_SERIAS',
  FECHAMENTO_ACOES:           'FECHAMENTO_ACOES',
  NCS_ABERTAS_30D:            'NCS_ABERTAS_30D',
  EXECUCAO_AUDITORIAS:        'EXECUCAO_AUDITORIAS',
  EFETIVIDADE_COGNITIVA_MEDIA:'EFETIVIDADE_COGNITIVA_MEDIA',
  RELATOS_ANONIMOS_PERC:      'RELATOS_ANONIMOS_PERC',
} as const;
