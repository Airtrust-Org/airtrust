/**
 * SIMULADORES MODELOS — operational-domain RBAC helper.
 *
 * Extracted out of simuladores-modelos.ts (which grew past the
 * architecture guardrail's line cap). Simuladores (tipos/modelos de
 * sessão, manobras) are fixed-domain OPERACOES by business rule — see
 * docs/rbac/gestor-operational-autonomy.md.
 */
import { requireOperationalAccess } from '../services/operational-domain-access';

export const requireOperacoes = (action: 'create' | 'update' | 'delete' | 'import') =>
  requireOperationalAccess({ domain: 'OPERACOES', action });
