/**
 * FRMS — Serviço de banco de dados (D1)
 *
 * Barrel: re-exports de todos os sub-módulos para retrocompatibilidade.
 * Importadores existentes continuam usando 'lib/frms/db-service' sem alterações.
 */

export {
  carregarLimites,
  buscarConfiguracoes,
  atualizarConfiguracao,
  restaurarConfiguracoesPadrao,
  createRevisionAndRecalcRun,
  loadFrmsRecalcRun,
  runGovernedRecalc,
} from './db-service-config';
export type {
  CreateFrmsRevisionInput,
  FrmsConfigParameter,
  FrmsConfigRevision,
  FrmsRecalcRun,
  ResolvedFrmsParameterSet,
} from './db-service-config';
export type { NotificacaoDestinatario } from './db-service-notificacoes';
export {
  buscarNotificacoes,
  marcarNotificacaoLida,
  marcarTodasNotificacoesLidas,
  despacharNotificacoes,
} from './db-service-notificacoes';
export type {
  PeriodoEmbarcadoCalculado,
  SalvarJornadaInput,
  SalvarJornadaResult,
} from './db-service-jornadas';
export {
  calcularPeriodoEmbarcadoPorFaixa,
  salvarJornada,
  recalcularAcumuloRolling,
  buscarJornadas,
  importarApus,
  importarSimulador,
  listarTripulantesAtivos,
  reprocessarTripulanteCompleto,
  reprocessarTodosTripulantes,
} from './db-service-jornadas';
export {
  atualizarJornadaConfiavel as atualizarJornada,
  deletarJornadaConfiavel as deletarJornada,
} from './db-service-jornadas-safe';
export { buscarAcumuloTripulante } from './db-service-acumulo-period-guard';
export { buscarAcumuloFrota } from './db-service-acumulo';
export type { BuscarAlertasFiltro } from './db-service-alertas';
export {
  buscarAlertas,
  marcarAlertaVisualizado,
  marcarAlertaResolvido,
} from './db-service-alertas';
export type { SalvarEscalaInput } from './db-service-escalas';
export { salvarEscala, buscarEscalas, atualizarEscala, deletarEscala } from './db-service-escalas';
export {
  relatorioIndividual,
  relatorioCompliance,
  relatorioMapaFadiga,
} from './db-service-relatorios';
