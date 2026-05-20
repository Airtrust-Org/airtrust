/**
 * Qualificações Service - Compatibilidade retroativa
 *
 * @deprecated Use qualificacoesService from './qualificacoes' para novos códigos
 */

export { default as qualificacoesService } from './qualificacoes';
export type {
  Qualificacao,
  QualificacaoCreate,
  QualificacaoUpdate,
  ImportResult,
  FiltrosQualificacoes,
  PaginacaoParams,
  DashboardStats,
} from './qualificacoes';
