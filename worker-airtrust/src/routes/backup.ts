/**
 * Rotas de Backup & Restore
 *
 * Endpoints para gerenciar backups do sistema:
 * - GET /api/backup - Lista backups disponíveis
 * - GET /api/backup/:uuid - Detalhes de um backup
 * - POST /api/backup/manual - Cria backup manual
 * - POST /api/backup/:uuid/restore - Restaura um backup
 * - DELETE /api/backup/:uuid - Remove um backup
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { BackupOrchestrator } from '../services/backup/orchestrator';
import { RestoreService } from '../services/backup/restore';
import { TODOS_MODULOS, type ModuloBackup } from '../config/backup-modules';
import { z } from 'zod';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { createLogger, toError } from '../utils/logger';

const backup = new Hono<{ Bindings: Env }>();

function applyNoStoreHeaders(c: Parameters<typeof backupErrorResponse>[0]) {
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  c.header('Vary', 'Authorization');
}

function backupErrorResponse(
  c: Record<string, any>,
  error: unknown,
  message: string,
  code: string,
  status: number = 500,
  details?: string,
) {
  const logger = createLogger(c, 'BackupRoutes');
  logger.error(message, toError(error), {
    route: c.req.path,
    status,
  });

  return c.json(
    {
      success: false,
      error: message,
      ...(details ? { details } : {}),
      code,
    },
    status,
  );
}

backup.use('*', auth(), requireRole('admin', 'manager'));
backup.use('*', async (c, next) => {
  await next();
  applyNoStoreHeaders(c);
});

// Schema de validação
const criarBackupSchema = z.object({
  tipo: z.enum(['COMPLETO', 'MODULAR', 'INCREMENTAL']),
  modulos: z.array(z.string()).optional(),
  descricao: z.string().optional(),
  retention_policy: z.enum(['30_DIAS', '1_ANO', '7_ANOS']).optional(),
});

const restaurarSchema = z.object({
  modulos: z.array(z.string()).optional(),
});

/**
 * POST /api/backup/manual
 * Cria um novo backup manual
 * ⚠️ DEVE ser registrada ANTES de /:uuid para evitar conflito de rotas
 */
backup.post('/manual', async (c) => {
  // Graceful error if BUCKET is not bound
  if (!c.env.BUCKET) {
    return c.json(
      {
        success: false,
        error: 'Serviço de armazenamento (R2 Bucket) não está configurado neste ambiente',
        code: 'BUCKET_NOT_BOUND',
      },
      503,
    );
  }

  try {
    const body = await c.req.json();
    const validacao = criarBackupSchema.safeParse(body);

    if (!validacao.success) {
      return c.json(
        {
          success: false,
          error: 'Dados inválidos',
          details: validacao.error.errors,
          code: 'VALIDATION_ERROR',
        },
        400,
      );
    }

    const { tipo, modulos, descricao, retention_policy } = validacao.data;

    // Validar módulos se fornecidos
    const modulosValidos = modulos ? (modulos as ModuloBackup[]) : undefined;
    if (modulosValidos) {
      const invalidos = modulosValidos.filter((m) => !TODOS_MODULOS.includes(m));
      if (invalidos.length > 0) {
        return c.json(
          {
            success: false,
            error: `Módulos inválidos: ${invalidos.join(', ')}`,
            code: 'INVALID_MODULES',
          },
          400,
        );
      }
    }

    const orchestrator = new BackupOrchestrator(c.env);

    const rawUserId = (c.get as (key: string) => string | undefined)('userId');
    const usuarioId = rawUserId ? Number(rawUserId) : undefined;

    const backupId = await orchestrator.executarBackupManual({
      tipo,
      modulos: modulosValidos,
      triggered_by: 'MANUAL_API',
      usuarios_id: usuarioId,
      descricao,
      retention_policy,
    });

    return c.json(
      {
        success: true,
        data: { id: backupId },
        message: 'Backup iniciado com sucesso',
      },
      201,
    );
  } catch (error) {
    return backupErrorResponse(
      c,
      error,
      'Erro ao criar backup',
      'BACKUP_CREATE_ERROR',
      500,
      toError(error).message,
    );
  }
});

/**
 * POST /api/backup/:uuid/restore
 * Restaura um backup (completo ou parcial)
 */
backup.post('/:uuid/restore', async (c) => {
  // Graceful error if BUCKET is not bound
  if (!c.env.BUCKET) {
    return c.json(
      {
        success: false,
        error: 'Serviço de armazenamento (R2 Bucket) não está configurado neste ambiente',
        code: 'BUCKET_NOT_BOUND',
      },
      503,
    );
  }

  try {
    const { uuid } = c.req.param();
    const body = await c.req.json();
    const validacao = restaurarSchema.safeParse(body);

    if (!validacao.success) {
      return c.json(
        {
          success: false,
          error: 'Dados inválidos',
          details: validacao.error.errors,
          code: 'VALIDATION_ERROR',
        },
        400,
      );
    }

    const { modulos } = validacao.data;
    const modulosValidos = modulos as ModuloBackup[] | undefined;

    const restoreService = new RestoreService(c.env);
    const resultados = await restoreService.restaurarBackup(uuid, modulosValidos);

    const sucesso = resultados.every((r) => r.status === 'SUCCESS');

    return c.json({
      success: sucesso,
      data: resultados,
      message: sucesso ? 'Restauração concluída com sucesso' : 'Restauração parcial ou com erros',
    });
  } catch (error) {
    return backupErrorResponse(
      c,
      error,
      'Erro ao restaurar backup',
      'RESTORE_ERROR',
      500,
      toError(error).message,
    );
  }
});

/**
 * DELETE /api/backup/:uuid
 * Remove um backup (soft delete)
 */
backup.delete('/:uuid', async (c) => {
  try {
    const { uuid } = c.req.param();

    await c.env.DB.prepare(
      `UPDATE backups_controle 
       SET deleted_at = CURRENT_TIMESTAMP 
       WHERE uuid = ? AND deleted_at IS NULL`,
    )
      .bind(uuid)
      .run();

    return c.json({
      success: true,
      message: 'Backup marcado para remoção',
    });
  } catch (error) {
    return backupErrorResponse(c, error, 'Erro ao deletar backup', 'BACKUP_DELETE_ERROR');
  }
});

/**
 * GET /api/backup
 * Lista todos os backups
 * ⚠️ Registrada APÓS rotas específicas para evitar conflitos
 */
backup.get('/', async (c) => {
  try {
    const limit = Number(c.req.query('limit')) || 20;
    const offset = Number(c.req.query('offset')) || 0;

    const { results } = await c.env.DB.prepare(
      `SELECT * FROM backups_controle
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(limit, offset)
      .all();

    const { results: countResult } = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM backups_controle WHERE deleted_at IS NULL`,
    ).all();

    const total = (countResult[0] as { total: number } | undefined)?.total ?? 0;

    return c.json({
      success: true,
      data: results,
      meta: { limit, offset, total },
    });
  } catch (error) {
    return backupErrorResponse(c, error, 'Erro ao listar backups', 'BACKUP_LIST_ERROR');
  }
});

/**
 * GET /api/backup/:uuid/download
 * Download do backup como arquivo JSON
 */
backup.get('/:uuid/download', async (c) => {
  // Graceful error if BUCKET is not bound
  if (!c.env.BUCKET) {
    return c.json(
      {
        success: false,
        error: 'Serviço de armazenamento (R2 Bucket) não está configurado neste ambiente',
        code: 'BUCKET_NOT_BOUND',
      },
      503,
    );
  }

  try {
    const { uuid } = c.req.param();
    const restoreService = new RestoreService(c.env);

    // Coletar dados de todos os módulos do R2
    const backupData = await restoreService.exportarBackupCompleto(uuid);

    // Preparar arquivo para download
    const filename = `backup-${uuid}-${new Date().toISOString().split('T')[0]}.json`;

    return c.json(backupData, 200, {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'application/json',
    });
  } catch (error) {
    return backupErrorResponse(
      c,
      error,
      'Erro ao fazer download do backup',
      'BACKUP_DOWNLOAD_ERROR',
      500,
      toError(error).message,
    );
  }
});
/**
 * GET /api/backup/:uuid
 * Obtém detalhes de um backup específico
 * ⚠️ Registrada por último para não conflitar com rotas específicas
 */
backup.get('/:uuid', async (c) => {
  try {
    const { uuid } = c.req.param();
    const restoreService = new RestoreService(c.env);
    const detalhes = await restoreService.obterDetalhesBackup(uuid);

    return c.json({
      success: true,
      data: detalhes,
    });
  } catch (error) {
    return backupErrorResponse(
      c,
      error,
      'Erro ao obter detalhes do backup',
      'BACKUP_NOT_FOUND',
      404,
      toError(error).message,
    );
  }
});

export default backup;
