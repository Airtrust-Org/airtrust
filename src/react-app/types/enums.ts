/**
 * ENUMS DO SISTEMA AIRTRUST
 *
 * ⚠️  Para constantes com mais metadados (labels, cores, etc),
 * use as constantes em @/constants/index.ts
 */

// ============================================
// FUNCIONÁRIO
// ============================================
export enum StatusFuncionario {
  ATIVO = 'ATIVO',
  INATIVO = 'INATIVO',
  AFASTADO = 'AFASTADO',
  FERIAS = 'FERIAS',
}

// ============================================
// QUALIFICAÇÃO
// ============================================
export enum CategoriaQualificacao {
  HABILITACAO = 'HABILITACAO',
  MEDICO = 'MEDICO',
  TREINAMENTO = 'TREINAMENTO',
  LICENCA = 'LICENCA',
  CERTIFICADO = 'CERTIFICADO',
}

export enum StatusQualificacao {
  ATIVO = 'ATIVO',
  VENCIDO = 'VENCIDO',
  A_VENCER = 'A_VENCER',
  INATIVO = 'INATIVO',
}

// ============================================
// TREINAMENTO
// ============================================
export enum StatusTreinamento {
  PLANEJADO = 'PLANEJADO',
  EM_ANDAMENTO = 'EM_ANDAMENTO',
  CONCLUIDO = 'CONCLUIDO',
  CANCELADO = 'CANCELADO',
}

// ============================================
// SIMULADOR
// ============================================
export enum StatusSimulador {
  DISPONIVEL = 'DISPONIVEL',
  MANUTENCAO = 'MANUTENCAO',
  INATIVO = 'INATIVO',
}

export enum TipoSimulador {
  FULL_FLIGHT = 'FULL_FLIGHT',
  FTD = 'FTD',
  FNPT = 'FNPT',
  BASIC = 'BASIC',
}

// ============================================
// FICHA DE VOO / SESSÃO
// ============================================
export enum StatusFicha {
  PENDENTE = 'PENDENTE',
  EM_PREENCHIMENTO = 'EM_PREENCHIMENTO',
  ASSINADA_ALUNO = 'ASSINADA_ALUNO',
  ASSINADA_TOTAL = 'ASSINADA_TOTAL',
  CANCELADA = 'CANCELADA',
}

export enum StatusSessao {
  AGENDADA = 'AGENDADA',
  EM_ANDAMENTO = 'EM_ANDAMENTO',
  CONCLUIDA = 'CONCLUIDA',
  CANCELADA = 'CANCELADA',
}

export enum FuncaoSessao {
  PIC = 'PIC',
  SIC = 'SIC',
  OBS = 'OBS',
}
