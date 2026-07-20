/**
 * RBAC por capability e máquina de estados do fluxo Piloto -> Coordenação
 * do RDV. Reaproveita o mecanismo de overrides já existente no projeto
 * (`usuario_permissoes`, colunas `permissao`/`tipo` GRANT|DENY — o mesmo
 * usado em `routes/auth.ts` para montar o JWT e em
 * `routes/simuladores-fichas.ts::hasSimuladoresEvaluateCapability`), em vez
 * de criar um sistema de permissões paralelo. Não eleva globalmente o
 * perfil `student`: mesmo com a capability de acesso próprio concedida, o
 * acesso a um RDV específico exige vínculo de tripulação (ver
 * `assertRdvSelfScope`).
 */
import type { Context, MiddlewareHandler } from 'hono';
import { ApiError } from '../../middleware/error-handler';
import type { Env } from '../../types';
import {
  getActorId,
  getFuncionarioIdForUser,
  isCrewOnFlight,
  type RdvRow,
  type RdvWorkflowStatus,
} from '../../repositories/controle-voos/rdv-repository';

export const RDV_CAPABILITIES = {
  visualizarProprio: 'voos.rdv.visualizar_proprio',
  criarProprio: 'voos.rdv.criar_proprio',
  editarRascunhoProprio: 'voos.rdv.editar_rascunho_proprio',
  enviar: 'voos.rdv.enviar',
  visualizarTodos: 'voos.rdv.visualizar_todos',
  revisar: 'voos.rdv.revisar',
  corrigir: 'voos.rdv.corrigir',
  devolver: 'voos.rdv.devolver',
  aprovarCoordenacao: 'voos.rdv.aprovar_coordenacao',
  aprovarComercial: 'voos.rdv.aprovar_comercial',
  reabrir: 'voos.rdv.reabrir',
  exportarPetrobras: 'voos.rdv.exportar_petrobras',
  cancelar: 'voos.rdv.cancelar',
} as const;

export type RdvCapability = (typeof RDV_CAPABILITIES)[keyof typeof RDV_CAPABILITIES];

// Capabilities de acesso próprio: default concedido a partir de `student`
// (o vínculo de tripulação é sempre exigido à parte — ver assertRdvSelfScope).
const OWN_SCOPE_CAPABILITIES = new Set<string>([
  RDV_CAPABILITIES.visualizarProprio,
  RDV_CAPABILITIES.criarProprio,
  RDV_CAPABILITIES.editarRascunhoProprio,
  RDV_CAPABILITIES.enviar,
  RDV_CAPABILITIES.cancelar,
]);

// Capabilities de Coordenação: default concedido a partir de `manager`.
const COORDENACAO_CAPABILITIES = new Set<string>([
  RDV_CAPABILITIES.visualizarTodos,
  RDV_CAPABILITIES.revisar,
  RDV_CAPABILITIES.corrigir,
  RDV_CAPABILITIES.devolver,
  RDV_CAPABILITIES.aprovarCoordenacao,
  RDV_CAPABILITIES.reabrir,
  RDV_CAPABILITIES.exportarPetrobras,
]);

// `voos.rdv.aprovar_comercial` não tem default por role — só é concedida
// por GRANT explícito em `usuario_permissoes` (gate futuro, ver seção 8 do
// enunciado: "quando exigido").

async function readPermissionOverride(
  db: D1Database,
  userId: number | string,
  capability: string,
): Promise<'GRANT' | 'DENY' | null> {
  const rows = await db
    .prepare(`SELECT tipo FROM usuario_permissoes WHERE usuario_id = ? AND permissao = ?`)
    .bind(userId, capability)
    .all<{ tipo: string }>()
    .catch(() => ({ results: [] as Array<{ tipo: string }> }));

  const results = rows.results || [];
  if (results.some((r) => String(r.tipo).toUpperCase() === 'DENY')) return 'DENY';
  if (results.some((r) => String(r.tipo).toUpperCase() === 'GRANT')) return 'GRANT';
  return null;
}

function defaultGrantForRole(capability: string, role: string): boolean {
  const hierarchy: Record<string, number> = {
    admin: 100,
    manager: 80,
    instructor: 60,
    editor: 50,
    student: 20,
    viewer: 10,
  };
  const level = hierarchy[role] ?? 0;

  if (OWN_SCOPE_CAPABILITIES.has(capability)) return level >= hierarchy.student;
  if (COORDENACAO_CAPABILITIES.has(capability)) return level >= hierarchy.manager;
  return false; // aprovar_comercial e quaisquer capabilities futuras: sem default, exige GRANT explícito
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

  const override = await readPermissionOverride(c.env.DB, userId, capability);
  if (override === 'DENY') return false;
  if (override === 'GRANT') return true;

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

export async function assertFuncionarioBelongsToEmpresa(
  db: D1Database,
  funcionarioId: number,
  empresaId: number,
): Promise<void> {
  const row = await db
    .prepare(
      'SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
    )
    .bind(funcionarioId, empresaId)
    .first();
  if (!row) {
    throw new ApiError(
      'Funcionario nao encontrado nesta empresa',
      400,
      'CONTROLE_VOOS_TRIPULANTE_FUNCIONARIO_INVALIDO',
    );
  }
}

// ---------------------------------------------------------------------------
// Máquina de estados do fluxo. DEVOLVIDO e REABERTO são estados reais e
// independentemente consultáveis (não são colapsados em RASCUNHO/EM_REVISAO).
// ---------------------------------------------------------------------------
const rdvWorkflowTransitions: Record<RdvWorkflowStatus, RdvWorkflowStatus[]> = {
  rascunho: ['enviado', 'cancelado'],
  enviado: ['em_revisao', 'cancelado'],
  em_revisao: ['devolvido', 'aprovado_coordenacao', 'cancelado'],
  devolvido: ['rascunho', 'enviado', 'cancelado'],
  aprovado_coordenacao: ['finalizado'],
  finalizado: ['reaberto'],
  reaberto: ['em_revisao', 'cancelado'],
  cancelado: [],
};

export function assertRdvWorkflowTransition(from: RdvWorkflowStatus, to: RdvWorkflowStatus): void {
  if (from === to) return;
  if (!rdvWorkflowTransitions[from].includes(to)) {
    throw new ApiError(
      `Transicao de fluxo do RDV nao permitida: ${from} -> ${to}`,
      409,
      'CONTROLE_VOOS_RDV_INVALID_WORKFLOW_TRANSITION',
    );
  }
}

export function assertRdvVersion(existing: RdvRow, expectedVersion: unknown): void {
  const parsed = typeof expectedVersion === 'number' ? expectedVersion : Number(expectedVersion);
  if (!Number.isInteger(parsed) || parsed !== existing.versao) {
    throw new ApiError(
      'Versao do RDV desatualizada. Recarregue os dados antes de continuar.',
      409,
      'CONTROLE_VOOS_RDV_VERSION_CONFLICT',
    );
  }
}

export function requireNonEmptyText(value: unknown, field: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    throw new ApiError(
      `${field} e obrigatorio`,
      400,
      'CONTROLE_VOOS_RDV_JUSTIFICATIVA_OBRIGATORIA',
    );
  }
  return text;
}

const RDV_DIFF_FIELDS = [
  'numero',
  'data_voo',
  'horario_decolagem_real',
  'horario_pouso_real',
  'horas_voadas',
  'numero_pousos',
  'ciclos',
  'combustivel_decolagem',
  'combustivel_pouso',
  'combustivel_consumo',
  'pob',
  'carga_kg',
  'ocorrencias',
  'divergencias',
] as const;

// Registra diferenças campo-a-campo entre duas versões do RDV, com
// justificativa obrigatória. Alimenta a tela de "diferenças" da
// Coordenação (complementa, não substitui, a auditoria genérica em
// `auditoria`).
export async function recordRdvFieldRevisions(params: {
  db: D1Database;
  empresaId: number;
  rdvId: number;
  versao: number;
  before: object;
  after: object;
  usuarioId: number | string | null;
  justificativa: string;
  estadoAnterior: string;
  estadoNovo: string;
}): Promise<number> {
  const {
    db,
    empresaId,
    rdvId,
    versao,
    before,
    after,
    usuarioId,
    justificativa,
    estadoAnterior,
    estadoNovo,
  } = params;
  let changed = 0;

  for (const field of RDV_DIFF_FIELDS) {
    const previousValue = Reflect.get(before, field) ?? null;
    const nextValue = Reflect.get(after, field) ?? null;
    if (String(previousValue ?? '') === String(nextValue ?? '')) continue;

    changed += 1;
    await db
      .prepare(
        `
        INSERT INTO cv_rdv_revisoes (
          empresa_id, rdv_id, versao, entidade, registro_id, campo,
          valor_anterior, valor_novo, usuario_id, justificativa,
          estado_anterior, estado_novo, created_at
        ) VALUES (?, ?, ?, 'rdv', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `,
      )
      .bind(
        empresaId,
        rdvId,
        versao,
        rdvId,
        field,
        previousValue === null ? null : String(previousValue),
        nextValue === null ? null : String(nextValue),
        usuarioId,
        justificativa,
        estadoAnterior,
        estadoNovo,
      )
      .run();
  }

  return changed;
}
