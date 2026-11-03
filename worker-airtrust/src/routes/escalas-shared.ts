/**
 * ESCALAS — Shared utilities, helpers, and schemas
 * Imported by escalas-core.ts and all sub-module files.
 *
 * Fachada: a implementação vive fora de routes/ (utils/tenant-resolution,
 * services/escalas/*, repositories/escalas-eventos-repository). Os sub-módulos de
 * Escalas continuam importando daqui.
 */

// Tenant (compartilhado por todos os domínios)
export { getEmpresaIdSafe, getEmpresaIdOptional } from '../utils/tenant-resolution';

// Escala verificada (IDOR guard) e geração de eventos base (VOO/FOL)
export {
  getEscalaVerificada,
  getEscalaVerificadaParaMutacao,
  gerarEventosBase,
  removerEventosAutoGerados,
} from '../services/escalas/eventos-base';

// Schemas Zod e parse de body
export {
  parseBody,
  TIPOS_EVENTO,
  EscalaMensalSchema,
  TripulacaoSchema,
  EventoSchema,
  AlterarStatusSchema,
  PadraoEscalaSchema,
  RestricaoTripulacaoSchema,
} from '../services/escalas/escala-schemas';
