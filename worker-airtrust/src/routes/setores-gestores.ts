import { Hono } from 'hono';
import { ApiError } from '../middleware/error-handler';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import type { Env } from '../types';
import { getEmpresaId } from '../middleware/tenant';
import { createLogger, toError } from '../utils/logger';
import { registrarAuditoria, extrairUsuarioAuditoria } from '../utils/auditoria';
import {
  setorGestorSchema,
  setorGestorUpdateSchema,
  createSetorGestor,
  getSetorGestorById,
  getSetorGestoresBySetor,
  getSetorGestoresByGestor,
  getAllSetorGestores,
  updateSetorGestor,
  deleteSetorGestor,
  getGestoresByFuncionarioSetor,
  listEligibleGestorUsers,
  SetorGestorValidationError,
  SetorGestorConflictError,
  assertBulkReassignmentDoesNotStripLastSector,
} from '../services/setores-gestores';

const setoresGestores = new Hono<{ Bindings: Env }>();

// Converte os erros tipados do serviço em respostas 4xx; não faz nada para
// outros erros, deixando o catch original tratá-los (ex.: UNIQUE constraint).
function rethrowAsApiError(error: unknown): void {
  if (error instanceof SetorGestorValidationError) throw new ApiError(error.message, 400);
  if (error instanceof SetorGestorConflictError) throw new ApiError(error.message, 409);
}

const logger = (c: any) => createLogger(c, 'SetoresGestores');

setoresGestores.use('/*', auth());
setoresGestores.use('/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  c.header('Vary', 'Authorization');
});

// ===== GET /api/setores-gestores =====
setoresGestores.get('/', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);

  try {
    const results = await getAllSetorGestores(db, empresaId, true);
    return c.json({
      success: true,
      data: results,
    });
  } catch (error) {
    logger(c).error('Erro ao listar setores-gestores', toError(error));
    throw new ApiError('Erro ao listar setores-gestores', 500);
  }
});

// ===== GET /api/setores-gestores/por-setor/:setor_id =====
setoresGestores.get('/por-setor/:setor_id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const setorId = parseInt(c.req.param('setor_id'), 10);

  if (isNaN(setorId)) {
    throw new ApiError('ID do setor inválido', 400);
  }

  try {
    const results = await getSetorGestoresBySetor(db, empresaId, setorId, true);
    return c.json({
      success: true,
      data: results,
    });
  } catch (error) {
    logger(c).error('Erro ao listar gestores por setor', toError(error));
    throw new ApiError('Erro ao listar gestores por setor', 500);
  }
});

// ===== GET /api/setores-gestores/por-gestor/:gestor_id =====
setoresGestores.get('/por-gestor/:gestor_id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const gestorId = parseInt(c.req.param('gestor_id'), 10);

  if (isNaN(gestorId)) {
    throw new ApiError('ID do gestor inválido', 400);
  }

  try {
    const results = await getSetorGestoresByGestor(db, empresaId, gestorId, true);
    return c.json({
      success: true,
      data: results,
    });
  } catch (error) {
    logger(c).error('Erro ao listar setores por gestor', toError(error));
    throw new ApiError('Erro ao listar setores por gestor', 500);
  }
});

// ===== GET /api/setores-gestores/do-funcionario/:funcionario_id =====
setoresGestores.get('/do-funcionario/:funcionario_id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const funcionarioId = parseInt(c.req.param('funcionario_id'), 10);

  if (isNaN(funcionarioId)) {
    throw new ApiError('ID do funcionário inválido', 400);
  }

  try {
    const results = await getGestoresByFuncionarioSetor(db, empresaId, funcionarioId);
    return c.json({
      success: true,
      data: results,
    });
  } catch (error) {
    logger(c).error('Erro ao listar gestores do funcionário', toError(error));
    throw new ApiError('Erro ao listar gestores do funcionário', 500);
  }
});

// ===== GET /api/setores-gestores/usuarios-elegiveis =====
setoresGestores.get('/usuarios-elegiveis/lista', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);

  try {
    const results = await listEligibleGestorUsers(db, empresaId);
    return c.json({
      success: true,
      data: results,
    });
  } catch (error) {
    logger(c).error('Erro ao listar usuários gestores elegíveis', toError(error));
    throw new ApiError('Erro ao listar usuários gestores elegíveis', 500);
  }
});

// ===== GET /api/setores-gestores/:id =====
setoresGestores.get('/:id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = parseInt(c.req.param('id'), 10);

  if (isNaN(id)) {
    throw new ApiError('ID inválido', 400);
  }

  try {
    const result = await getSetorGestorById(db, empresaId, id);

    if (!result) {
      throw new ApiError('Relação setor-gestor não encontrada', 404);
    }

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger(c).error('Erro ao buscar setor-gestor', toError(error));
    throw new ApiError('Erro ao buscar setor-gestor', 500);
  }
});

// ===== POST /api/setores-gestores =====
setoresGestores.post('/', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);

  try {
    const body = await c.req.json();
    const parsed = setorGestorSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError('Dados inválidos: ' + parsed.error.message, 400);
    }

    const id = await createSetorGestor(db, empresaId, parsed.data);
    const result = await getSetorGestorById(db, empresaId, id);

    const ua = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'setores_gestores',
      acao: 'INSERT',
      registro_id: id,
      dados_novos: parsed.data,
      ...ua,
    });

    return c.json(
      {
        success: true,
        data: result,
      },
      201,
    );
  } catch (error: unknown) {
    if (error instanceof ApiError) throw error;
    rethrowAsApiError(error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger(c).error('Erro ao criar setor-gestor', toError(error));

    if (errorMsg.includes('UNIQUE constraint failed')) {
      throw new ApiError('Este gestor já está atribuído a este setor', 409);
    }

    throw new ApiError(`Erro ao criar setor-gestor: ${errorMsg}`, 500);
  }
});

// ===== PUT /api/setores-gestores/:id =====
setoresGestores.put('/:id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = parseInt(c.req.param('id'), 10);

  if (isNaN(id)) {
    throw new ApiError('ID inválido', 400);
  }

  try {
    const body = await c.req.json();
    const parsed = setorGestorUpdateSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError('Dados inválidos: ' + parsed.error.message, 400);
    }

    const currentData = await getSetorGestorById(db, empresaId, id);
    if (!currentData) {
      throw new ApiError('Relação setor-gestor não encontrada', 404);
    }

    await updateSetorGestor(db, empresaId, id, parsed.data);
    const updated = await getSetorGestorById(db, empresaId, id);

    const ua = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'setores_gestores',
      acao: 'UPDATE',
      registro_id: id,
      dados_anteriores: currentData,
      dados_novos: parsed.data,
      ...ua,
    });

    return c.json({
      success: true,
      data: updated,
    });
  } catch (error: unknown) {
    if (error instanceof ApiError) throw error;
    rethrowAsApiError(error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger(c).error('Erro ao atualizar setor-gestor', toError(error));
    throw new ApiError(`Erro ao atualizar setor-gestor: ${errorMsg}`, 500);
  }
});

// ===== DELETE /api/setores-gestores/:id =====
setoresGestores.delete('/:id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = parseInt(c.req.param('id'), 10);

  if (isNaN(id)) {
    throw new ApiError('ID inválido', 400);
  }

  try {
    const currentData = await getSetorGestorById(db, empresaId, id);
    if (!currentData) {
      throw new ApiError('Relação setor-gestor não encontrada', 404);
    }

    await deleteSetorGestor(db, empresaId, id);

    const ua = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'setores_gestores',
      acao: 'DELETE',
      registro_id: id,
      dados_anteriores: currentData,
      ...ua,
    });

    return c.json({
      success: true,
      data: { id },
    });
  } catch (error: unknown) {
    if (error instanceof ApiError) throw error;
    rethrowAsApiError(error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger(c).error('Erro ao deletar setor-gestor', toError(error));
    throw new ApiError(`Erro ao deletar setor-gestor: ${errorMsg}`, 500);
  }
});

// ===== POST /api/setores-gestores/bulk-assign =====
setoresGestores.post('/bulk-assign/:setor_id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const setorId = parseInt(c.req.param('setor_id'), 10);

  if (isNaN(setorId)) {
    throw new ApiError('ID do setor inválido', 400);
  }

  try {
    const body = (await c.req.json()) as { usuario_ids?: number[]; gestor_ids?: number[] };
    const usuarioIds = Array.isArray(body.usuario_ids)
      ? body.usuario_ids
      : Array.isArray(body.gestor_ids)
        ? body.gestor_ids
        : [];

    if (!Array.isArray(usuarioIds)) {
      throw new ApiError('usuario_ids deve ser um array', 400);
    }

    // Gestores atualmente vinculados a este setor que NÃO estão na nova
    // lista ficarão sem vínculo aqui — bloquear se for o último setor ativo
    // de algum deles enquanto permanecerem gestores ativos.
    const vinculosAtuais = await db
      .prepare(
        `SELECT usuario_id FROM setores_gestores
           WHERE setor_id = ? AND empresa_id = ? AND ativo = 1 AND deleted_at IS NULL
             AND usuario_id IS NOT NULL`,
      )
      .bind(setorId, empresaId)
      .all<{ usuario_id: number }>();

    const usuarioIdsSendoRemovidos = (vinculosAtuais.results || [])
      .map((row) => Number(row.usuario_id))
      .filter((uid) => !usuarioIds.includes(uid));

    await assertBulkReassignmentDoesNotStripLastSector(
      db,
      empresaId,
      setorId,
      usuarioIdsSendoRemovidos,
    );

    // Delete existing assignments
    await db
      .prepare(
        `
        UPDATE setores_gestores 
        SET deleted_at = datetime('now')
        WHERE setor_id = ? AND empresa_id = ? AND deleted_at IS NULL
        `,
      )
      .bind(setorId, empresaId)
      .run();

    // Create new assignments
    const created = [];
    for (const usuarioId of usuarioIds) {
      const id = await createSetorGestor(db, empresaId, {
        setor_id: setorId,
        usuario_id: usuarioId,
        role: 'manager',
        ativo: true,
      });
      const detail = await getSetorGestorById(db, empresaId, id);
      if (detail) {
        created.push(detail);
      }
    }

    const ua = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'setores_gestores',
      acao: 'BULK_UPDATE',
      registro_id: setorId,
      dados_novos: { usuario_ids: usuarioIds },
      ...ua,
    });

    return c.json({
      success: true,
      data: created,
    });
  } catch (error: unknown) {
    if (error instanceof ApiError) throw error;
    rethrowAsApiError(error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger(c).error('Erro ao fazer bulk assign', toError(error));
    throw new ApiError(`Erro ao fazer bulk assign: ${errorMsg}`, 500);
  }
});

export default setoresGestores;
