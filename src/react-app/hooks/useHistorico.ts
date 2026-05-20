/**
 * useHistorico.ts - Novo hook canônico para histórico de qualificações
 *
 * Preferir este hook no código novo. O legado `useHabilitacoes` continuará disponível
 * por compatibilidade, mas será removido em futuras versões.
 */

export { useQualificacoesHistorico as useHistorico } from './useQualificacoesExt';
export type { HistoricoQualificacao } from './useQualificacoesExt';
