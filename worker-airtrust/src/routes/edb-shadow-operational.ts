import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv } from '../types';
import { ApiError } from '../middleware/error-handler';
import { checkPermission, getEmpresaId } from '../middleware/tenant';
import edbShadowRoutes from './edb-shadow';

const router = new Hono<AppEnv>();
type EdbContext = Context<AppEnv>;

function isManager(c: EdbContext): boolean {
  return checkPermission(c, 'manager');
}

async function resolveActorEmployeeId(c: EdbContext): Promise<number> {
  const direct = Number(c.get('funcionarioId') || 0);
  if (Number.isInteger(direct) && direct > 0) return direct;

  const userId = Number(c.get('userId') || 0);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ApiError('Vínculo funcional necessário', 403, 'EDB_ACTOR_EMPLOYEE_REQUIRED');
  }
  const row = await c.env.DB
    .prepare('SELECT funcionario_id FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1')
    .bind(userId)
    .first<{ funcionario_id: number | null }>();
  const employeeId = Number(row?.funcionario_id || 0);
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    throw new ApiError('Vínculo funcional necessário', 403, 'EDB_ACTOR_EMPLOYEE_REQUIRED');
  }
  return employeeId;
}

async function assertFlightPic(c: EdbContext, vooId: number): Promise<void> {
  const empresaId = getEmpresaId(c);
  const funcionarioId = await resolveActorEmployeeId(c);
  const row = await c.env.DB
    .prepare(
      `SELECT id
         FROM cv_voo_tripulantes
        WHERE empresa_id = ?
          AND voo_id = ?
          AND funcionario_id = ?
          AND UPPER(TRIM(funcao)) = 'PIC'
          AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(empresaId, vooId, funcionarioId)
    .first<{ id: number }>();
  if (!row) {
    throw new ApiError(
      'Apenas o PIC escalado para o voo pode executar esta assinatura',
      403,
      'EDB_PIC_ACTOR_NOT_ASSIGNED_TO_FLIGHT',
    );
  }
}

async function revisionFlightId(c: EdbContext, revisionId: string): Promise<number> {
  const row = await c.env.DB
    .prepare(
      `SELECT voo_id
         FROM edb_registro_revisoes
        WHERE empresa_id = ? AND id = ?
        LIMIT 1`,
    )
    .bind(getEmpresaId(c), revisionId)
    .first<{ voo_id: number }>();
  if (!row || !Number.isInteger(row.voo_id) || row.voo_id <= 0) {
    throw new ApiError('Revisão não encontrada', 404, 'EDB_REVISION_NOT_FOUND');
  }
  return row.voo_id;
}

function managerRequired(): never {
  throw new ApiError('Permissão de gestor necessária', 403, 'EDB_SHADOW_MANAGER_REQUIRED');
}

router.use('*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const method = c.req.method.toUpperCase();

  const preflightAck = /^\/api\/edb\/voos\/(\d+)\/preflight\/ack$/.exec(path);
  if (method === 'POST' && preflightAck) {
    await assertFlightPic(c, Number(preflightAck[1]));
    await next();
    return;
  }

  const preflightSigningPayload = /^\/api\/edb\/voos\/(\d+)\/preflight\/signing-payload$/.exec(path);
  if (method === 'GET' && preflightSigningPayload && !isManager(c)) {
    await assertFlightPic(c, Number(preflightSigningPayload[1]));
    await next();
    return;
  }

  const finalSigningPayload = /^\/api\/edb\/revisions\/([^/]+)\/signing-payload\/PIC_FLIGHT_RECORD$/.exec(path);
  if (method === 'GET' && finalSigningPayload && !isManager(c)) {
    await assertFlightPic(c, await revisionFlightId(c, decodeURIComponent(finalSigningPayload[1])));
    await next();
    return;
  }

  const finalSignature = /^\/api\/edb\/revisions\/([^/]+)\/signatures$/.exec(path);
  if (method === 'POST' && finalSignature) {
    const cloned = c.req.raw.clone();
    const body = (await cloned.json().catch(() => null)) as {
      signature?: { type?: unknown };
    } | null;
    const type = body?.signature?.type;
    if (type === 'PIC_FLIGHT_RECORD') {
      await assertFlightPic(c, await revisionFlightId(c, decodeURIComponent(finalSignature[1])));
      await next();
      return;
    }
    if (type === 'OPERATOR_RECORD') {
      if (!isManager(c)) managerRequired();
      await next();
      return;
    }
    throw new ApiError('Tipo de assinatura final inválido', 400, 'EDB_FINAL_SIGNATURE_TYPE_INVALID');
  }

  if (!isManager(c)) managerRequired();
  await next();
});

router.route('/', edbShadowRoutes);

export default router;
