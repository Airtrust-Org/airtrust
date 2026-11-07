import type { Context, MiddlewareHandler } from 'hono';
import {
  getFuncionarioIdForUser,
  isCrewOnFlight,
  type RdvRow,
  type RdvWorkflowStatus,
} from '../repositories/controle-voos/rdv-repository';
import {
  COORDENACAO_CAPABILITIES,
  OWN_SCOPE_CAPABILITIES,
  RDV_CAPABILITIES,
  defaultGrantForRole,
  type RdvCapability,
} from '../services/controle-voos/rdv-workflow';
import type { EtapaEditMode } from '../services/controle-voos/rdv-etapas';
import type { Env } from '../types';
import { ApiError } from './error-handler';
import { getUserPermissionOverride } from './rbac';
import { getActorId } from './controle-voos-rdv-context';

// Guards e verificações de capability do RDV que dependem do Context do Hono.
// Máquina de estados e regras puras ficam em services/controle-voos/rdv-workflow.

async function hasViewerStudentProfileOwnScopeFallback(
  c: Context<{ Bindings: Env }>,
): Promise<boolean> {
  const userId = Number((c.get as (key: string) => unknown)('userId'));
  const empresaId = Number((c.get as (key: string) => unknown)('empresaId'));
  if (!Number.isInteger(userId) || userId <= 0) return false;
  if (!Number.isInteger(empresaId) || empresaId <= 0) return false;

  try {
    const row = await c.env.DB.prepare(
      `SELECT u.perfil
         FROM usuarios u
         JOIN usuarios_empresas ue
           ON ue.usuario_id = u.id
          AND ue.empresa_id = ?
        WHERE u.id = ?
          AND u.deleted_at IS NULL
          AND LOWER(TRIM(COALESCE(ue.role, ''))) = 'viewer'
        LIMIT 1`,
    )
      .bind(empresaId, userId)
      .first<{ perfil: string | null }>();

    const profile = String(row?.perfil || '').trim().toUpperCase();
    return profile === 'ALUNO' || profile === 'STUDENT' || profile === 'MEMBER';
  } catch {
    // Fallback de compatibilidade: qualquer indisponibilidade mantém o acesso
    // negado em vez de ampliar autorização ou quebrar rotas com 500.
    return false;
  }
}

/**
 * Resolve se o usuário autenticado tem a capability, com a mesma
 * precedência já usada pelo restante do backend: DENY explícito > GRANT
 * explícito > default do role. Nunca consulta o frontend/JWT diretamente
 * — sempre re-lê `usuario_permissoes` no momento da requisição.
 */
export async function hasRdvCapability(
  c: Context<{ Bindings: Env }>,
  capability: RdvCapability,
): Promise<boolean> {
  const userId = getActorId(c);
  if (userId === null) return false;

  const tenantContext = (c.get as (key: string) => { role?: string } | undefined)('tenantContext');
  const resolvedRole = String(
    tenantContext?.role || (c.get as (key: string) => unknown)('userRole') || 'viewer',
  ).toLowerCase();

  const sessionRole = String((c.get as (key: string) => unknown)('userRole') || '').trim().toUpperCase();
  const override = await getUserPermissionOverride(c, capability);
  if (override === 'DENY') return false;
  if (override === 'GRANT') return true;
  if (sessionRole === 'COORDENACAO_VOO' && COORDENACAO_CAPABILITIES.has(capability)) {
    return (await getUserPermissionOverride(c, 'controle_voos.edit')) !== 'DENY';
  }

  // A permissão operacional canônica da Coordenação também concede as
  // capabilities de RDV. Isso mantém frontend/backend alinhados para contas
  // de Coordenação com role base VIEWER e grant individual, sem elevar o role.
  if (COORDENACAO_CAPABILITIES.has(capability)) {
    const coordinationOverride = await getUserPermissionOverride(c, 'controle_voos.edit');
    if (coordinationOverride === 'DENY') return false;
    if (coordinationOverride === 'GRANT') return true;
  }

  // Alguns usuários operacionais permanecem com membership tenant `viewer`
  // enquanto o perfil canônico da identidade é ALUNO. Para capabilities
  // estritamente próprias do piloto, esse par deve equivaler a `student`;
  // nunca amplia escopo de Coordenação e o vínculo de tripulação continua
  // obrigatório em `assertRdvSelfScope`.
  if (
    resolvedRole === 'viewer' &&
    OWN_SCOPE_CAPABILITIES.has(capability) &&
    (await hasViewerStudentProfileOwnScopeFallback(c))
  ) {
    return true;
  }

  return defaultGrantForRole(capability, resolvedRole);
}

export function requireRdvCapability(
  capability: RdvCapability,
): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const allowed = await hasRdvCapability(c, capability);
    if (!allowed) {
      throw new ApiError(
        `Permissao insuficiente (${capability})`,
        403,
        'CONTROLE_VOOS_RDV_RBAC_FORBIDDEN',
      );
    }
    await next();
  };
}

// Guard genérico de entrada para as rotas de RDV do piloto: qualquer uma
// das capabilities de acesso próprio já basta para passar da porta; o
// escopo real (o quê o usuário pode ver/fazer) é decidido depois por
// `assertRdvSelfScope` (ownership) e pelas capabilities específicas de cada
// ação.
export function requireAnyRdvAccess(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const capabilities = [
      RDV_CAPABILITIES.visualizarProprio,
      RDV_CAPABILITIES.visualizarTodos,
    ] as const;

    for (const capability of capabilities) {
      if (await hasRdvCapability(c, capability)) {
        await next();
        return;
      }
    }

    throw new ApiError('Permissao insuficiente', 403, 'CONTROLE_VOOS_RDV_RBAC_FORBIDDEN');
  };
}

/**
 * Coordenação (capability de escopo amplo) enxerga tudo; piloto precisa da
 * capability de acesso próprio E do vínculo de tripulação no voo. A
 * capability nunca substitui o vínculo — ambos são obrigatórios para o
 * piloto.
 */
export async function assertRdvSelfScope(
  c: Context<{ Bindings: Env }>,
  db: D1Database,
  empresaId: number,
  vooId: number,
  capability: RdvCapability,
): Promise<void> {
  if (await hasRdvCapability(c, RDV_CAPABILITIES.visualizarTodos)) return;

  const hasOwnCapability = await hasRdvCapability(c, capability);
  if (!hasOwnCapability) {
    throw new ApiError(
      `Permissao insuficiente (${capability})`,
      403,
      'CONTROLE_VOOS_RDV_RBAC_FORBIDDEN',
    );
  }

  const userId = getActorId(c);
  const funcionarioId = await getFuncionarioIdForUser(db, userId);
  if (!funcionarioId) {
    throw new ApiError(
      `Usuario sem vinculo de funcionario (${capability})`,
      403,
      'CONTROLE_VOOS_RDV_NO_FUNCIONARIO_LINK',
    );
  }

  const isCrew = await isCrewOnFlight(db, empresaId, vooId, funcionarioId);
  if (!isCrew) {
    throw new ApiError(
      `Acesso restrito a tripulantes do voo (${capability})`,
      403,
      'CONTROLE_VOOS_RDV_NOT_CREW',
    );
  }
}

/**
 * Separação de funções: mesmo tendo a capability de aprovação e sendo
 * Coordenação, o usuário não pode aprovar um RDV do qual ele próprio é o
 * responsável pelo preenchimento (piloto e aprovador não podem ser a
 * mesma pessoa no mesmo RDV).
 */
export async function assertNotSelfApproval(
  c: Context<{ Bindings: Env }>,
  db: D1Database,
  rdv: RdvRow,
): Promise<void> {
  // `responsavel_preenchimento_id` é gravado com o userId do ator (ver PUT/finalizar
  // em controle-voos.ts). Também aceita o caso legado em que a coluna tenha
  // armazenado funcionario_id.
  const userId = getActorId(c);
  if (userId !== null && Number(userId) === Number(rdv.responsavel_preenchimento_id)) {
    throw new ApiError(
      'Separacao de funcoes: nao e permitido aprovar um RDV do qual voce e o responsavel pelo preenchimento',
      403,
      'CONTROLE_VOOS_RDV_SELF_APPROVAL_FORBIDDEN',
    );
  }

  const funcionarioId = await getFuncionarioIdForUser(db, userId);
  if (funcionarioId !== null && funcionarioId === rdv.responsavel_preenchimento_id) {
    throw new ApiError(
      'Separacao de funcoes: nao e permitido aprovar um RDV do qual voce e o responsavel pelo preenchimento',
      403,
      'CONTROLE_VOOS_RDV_SELF_APPROVAL_FORBIDDEN',
    );
  }
}

export async function assertEtapaEditable(
  c: Context<{ Bindings: Env }>,
  rdv: RdvRow,
  mode: EtapaEditMode,
  justificativa?: unknown,
): Promise<string | null> {
  if (mode === 'pilot') {
    const allowed: RdvWorkflowStatus[] = ['rascunho', 'devolvido'];
    if (!allowed.includes(rdv.workflow_status)) {
      throw new ApiError(
        `Etapas so podem ser editadas pelo piloto em rascunho/devolvido (atual: ${rdv.workflow_status})`,
        409,
        'CONTROLE_VOOS_ETAPA_WORKFLOW_BLOQUEADO',
      );
    }
    return null;
  }

  if (rdv.workflow_status !== 'em_revisao') {
    throw new ApiError(
      `Correcao de etapas pela Coordenacao so e permitida em em_revisao (atual: ${rdv.workflow_status})`,
      409,
      'CONTROLE_VOOS_ETAPA_WORKFLOW_BLOQUEADO',
    );
  }
  if (!(await hasRdvCapability(c, RDV_CAPABILITIES.corrigir))) {
    throw new ApiError(
      `Permissao insuficiente (${RDV_CAPABILITIES.corrigir})`,
      403,
      'CONTROLE_VOOS_RDV_RBAC_FORBIDDEN',
    );
  }
  const text = typeof justificativa === 'string' ? justificativa.trim() : '';
  if (!text) {
    throw new ApiError(
      'justificativa e obrigatoria para correcao de etapa pela Coordenacao',
      400,
      'CONTROLE_VOOS_RDV_JUSTIFICATIVA_OBRIGATORIA',
    );
  }
  return text;
}

export async function resolveEtapaEditMode(
  c: Context<{ Bindings: Env }>,
  rdv: RdvRow,
  explicitMode?: unknown,
): Promise<EtapaEditMode> {
  if (explicitMode === 'coordenacao' || explicitMode === 'pilot') {
    return explicitMode;
  }
  if (
    rdv.workflow_status === 'em_revisao' &&
    (await hasRdvCapability(c, RDV_CAPABILITIES.corrigir))
  ) {
    return 'coordenacao';
  }
  return 'pilot';
}
