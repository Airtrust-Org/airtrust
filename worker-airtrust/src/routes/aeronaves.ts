import { Hono } from 'hono';
import { ApiError } from '../middleware/error-handler';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import type { Env } from '../types';
import { registrarAuditoria, extrairUsuarioAuditoria } from '../utils/auditoria';
import { getEmpresaIdSafe } from './escalas-shared';
import { desalocarAeronaveInativa } from './escalas-alocacoes';

const aeronaves = new Hono<{ Bindings: Env }>();

// ===== GET /api/aeronaves =====
aeronaves.get('/', auth(), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const somenteAtivas = ['1', 'true', 'sim'].includes(
    String(c.req.query('somente_ativas') || '')
      .trim()
      .toLowerCase(),
  );

  try {
    const filters = ['deleted_at IS NULL', 'empresa_id = ?'];
    if (somenteAtivas) {
      // Alinha com isAeronaveAtiva() do frontend: aeronave é ativa quando NÃO está
      // em status de indisponibilidade. Status NULL/vazio é tratado como ATIVO.
      // Status como 'D' (Disponível), 'ATIVO', ou qualquer outro não-indisponível
      // devem aparecer na EVD.
      filters.push(
        "UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) NOT IN ('I', 'INATIVO', 'INDISPONIVEL', 'INDISPONÍVEL')",
      );
    }

    const { results } = await db
      .prepare(
        `
        SELECT id, codigo, modelo, prefixo, ano_fabricacao, status, observacoes, created_at, updated_at
        FROM aeronaves
        WHERE ${filters.join(' AND ')}
        ORDER BY modelo ASC
        `,
      )
      .bind(empresaId)
      .all();

    return c.json({
      success: true,
      data: results || [],
    });
  } catch (error) {
    console.error('[AERONAVES] Erro ao listar:', error);
    throw new ApiError('Erro ao listar aeronaves', 500);
  }
});

// ===== GET /api/aeronaves/:id =====
aeronaves.get('/:id', auth(), async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const empresaId = getEmpresaIdSafe(c);

  try {
    const { results } = await db
      .prepare(
        `
        SELECT id, codigo, modelo, prefixo, ano_fabricacao, status, observacoes, created_at, updated_at
        FROM aeronaves
        WHERE id = ? AND deleted_at IS NULL AND empresa_id = ?
        `,
      )
      .bind(id, empresaId)
      .all();

    if (!results || results.length === 0) {
      throw new ApiError('Aeronave não encontrada', 404);
    }

    return c.json({
      success: true,
      data: results[0],
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('[AERONAVES] Erro ao buscar:', error);
    throw new ApiError('Erro ao buscar aeronave', 500);
  }
});

// ===== POST /api/aeronaves =====
aeronaves.post('/', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const body = (await c.req.json()) as {
    modelo: string;
    prefixo?: string;
    ano_fabricacao?: number;
    status?: string;
    observacoes?: string;
  };

  if (!body.modelo || body.modelo.trim().length === 0) {
    throw new ApiError('Modelo da aeronave é obrigatório', 400);
  }

  const empresaId = getEmpresaIdSafe(c);
  const prefixoNormalizado = body.prefixo?.trim().toUpperCase() || null;
  const codigo = prefixoNormalizado || `${body.modelo.trim().toUpperCase()}_${Date.now()}`;

  try {
    if (prefixoNormalizado) {
      const duplicate = await db
        .prepare(
          'SELECT id FROM aeronaves WHERE empresa_id = ? AND codigo = ? COLLATE NOCASE AND deleted_at IS NULL LIMIT 1',
        )
        .bind(empresaId, codigo)
        .first<{ id: number }>();
      if (duplicate) throw new ApiError('Aeronave com esse prefixo já existe', 409);
    }

    const result = await db
      .prepare(
        `
        INSERT INTO aeronaves (codigo, modelo, prefixo, ano_fabricacao, status, observacoes, empresa_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `,
      )
      .bind(
        codigo,
        body.modelo.trim(),
        prefixoNormalizado,
        body.ano_fabricacao || null,
        body.status || 'ATIVO',
        body.observacoes || null,
        empresaId,
      )
      .run();

    const newId = result.meta.last_row_id;
    const ua = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'aeronaves',
      acao: 'INSERT',
      registro_id: newId,
      dados_novos: body,
      ...ua,
    });

    return c.json(
      {
        success: true,
        data: {
          id: newId,
          codigo,
          modelo: body.modelo.trim(),
          prefixo: prefixoNormalizado,
          ano_fabricacao: body.ano_fabricacao || null,
          status: body.status || 'ATIVO',
          observacoes: body.observacoes || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
      201,
    );
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[AERONAVES] Erro ao criar:', errorMsg, error);
    if (errorMsg.includes('UNIQUE constraint failed')) {
      throw new ApiError('Aeronave com esse prefixo já existe', 409);
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError('Erro ao criar aeronave', 500);
  }
});

// ===== PUT /api/aeronaves/:id =====
aeronaves.put('/:id', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const empresaIdPut = getEmpresaIdSafe(c);
  const body = (await c.req.json()) as {
    modelo?: string;
    prefixo?: string;
    ano_fabricacao?: number;
    status?: string;
    observacoes?: string;
  };

  if (Object.keys(body).length === 0) {
    throw new ApiError('Nenhum campo para atualizar', 400);
  }

  try {
    // Verifica se existe E pertence à empresa do usuário autenticado
    const { results: existing } = await db
      .prepare(
        'SELECT id, codigo, status, prefixo, modelo FROM aeronaves WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(id, empresaIdPut)
      .all<{
        id: number;
        codigo: string;
        status: string | null;
        prefixo: string | null;
        modelo: string | null;
      }>();

    if (!existing || existing.length === 0) {
      throw new ApiError('Aeronave não encontrada', 404);
    }

    const aeronaveAtual = existing[0];
    const statusAnterior =
      String(aeronaveAtual.status || 'ATIVO')
        .trim()
        .toUpperCase() || 'ATIVO';
    const prefixoNormalizado =
      body.prefixo !== undefined ? body.prefixo.trim().toUpperCase() || null : undefined;
    if (prefixoNormalizado) {
      const duplicate = await db
        .prepare(
          'SELECT id FROM aeronaves WHERE empresa_id = ? AND id <> ? AND codigo = ? COLLATE NOCASE AND deleted_at IS NULL LIMIT 1',
        )
        .bind(empresaIdPut, id, prefixoNormalizado)
        .first<{ id: number }>();
      if (duplicate) throw new ApiError('Aeronave com esse prefixo já existe', 409);
    }

    // Monta query dinâmica
    const fields = [];
    const values = [];

    if (body.modelo !== undefined) {
      fields.push('modelo = ?');
      values.push(body.modelo ? body.modelo.trim() : null);
    }
    if (body.prefixo !== undefined) {
      const codigoAtualizado =
        prefixoNormalizado ||
        `${String(body.modelo ?? aeronaveAtual.modelo ?? 'AERONAVE')
          .trim()
          .toUpperCase()}_${Date.now()}`;
      fields.push('prefixo = ?');
      values.push(prefixoNormalizado);
      fields.push('codigo = ?');
      values.push(codigoAtualizado);
    }
    if (body.ano_fabricacao !== undefined) {
      fields.push('ano_fabricacao = ?');
      values.push(body.ano_fabricacao || null);
    }
    if (body.status !== undefined) {
      fields.push('status = ?');
      values.push(body.status);
    }
    if (body.observacoes !== undefined) {
      fields.push('observacoes = ?');
      values.push(body.observacoes || null);
    }

    fields.push('updated_at = datetime("now")');
    values.push(id);
    values.push(empresaIdPut);

    const query = `UPDATE aeronaves SET ${fields.join(', ')} WHERE id = ? AND empresa_id = ?`;

    await db
      .prepare(query)
      .bind(...values)
      .run();

    const statusNovo =
      body.status !== undefined
        ? String(body.status || '')
            .trim()
            .toUpperCase() || 'ATIVO'
        : statusAnterior;

    if (statusAnterior === 'ATIVO' && statusNovo !== 'ATIVO') {
      const empresaId = getEmpresaIdSafe(c);

      if (empresaId) {
        await desalocarAeronaveInativa(db, {
          empresaId,
          aeronaveId: Number(id),
          userId: String(c.get('userId' as never) || 'system'),
          motivo: `Aeronave ${aeronaveAtual.prefixo || aeronaveAtual.modelo || id} inativada`,
        });

        const aeronaveLabels = [aeronaveAtual.prefixo, aeronaveAtual.modelo]
          .filter(Boolean)
          .map((value) => String(value).trim().toUpperCase());

        for (const label of aeronaveLabels) {
          await db
            .prepare(
              `UPDATE escala_tripulacoes
                  SET pic_id = NULL,
                      sic_id = NULL,
                      aeronave = NULL,
                      observacoes = TRIM(COALESCE(observacoes || ' ', '') || '[Aeronave inativada]'),
                      updated_at = datetime('now')
                WHERE deleted_at IS NULL
                  AND escala_id IN (
                    SELECT id
                      FROM escalas_mensais
                     WHERE empresa_id = ?
                       AND status != 'arquivada'
                       AND deleted_at IS NULL
                  )
                  AND (
                    UPPER(TRIM(COALESCE(aeronave, ''))) = ?
                    OR UPPER(TRIM(COALESCE(aeronave, ''))) LIKE ?
                  )`,
            )
            .bind(empresaId, label, `${label}%`)
            .run();
        }
      }
    }

    // Busca o registro atualizado
    const { results: updated } = await db
      .prepare('SELECT * FROM aeronaves WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL')
      .bind(id, empresaIdPut)
      .all();

    const ua2 = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'aeronaves',
      acao: 'UPDATE',
      registro_id: id,
      dados_novos: body,
      ...ua2,
    });

    return c.json({
      success: true,
      data: updated && updated.length > 0 ? updated[0] : null,
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.message?.includes('UNIQUE constraint')) {
      throw new ApiError('Aeronave com esse prefixo já existe', 409);
    }
    console.error('[AERONAVES] Erro ao atualizar:', error);
    throw new ApiError('Erro ao atualizar aeronave', 500);
  }
});

// ===== DELETE /api/aeronaves/:id =====
aeronaves.delete('/:id', auth(), requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const empresaIdDelete = getEmpresaIdSafe(c);

  try {
    const { results: existing } = await db
      .prepare('SELECT id FROM aeronaves WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL')
      .bind(id, empresaIdDelete)
      .all();

    if (!existing || existing.length === 0) {
      throw new ApiError('Aeronave não encontrada', 404);
    }

    const inUse = await db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM treinamentos_dias td
             WHERE td.empresa_id = ? AND td.aeronave_id = ? AND td.deleted_at IS NULL AND td.status = 'ATIVO') +
           (SELECT COUNT(*) FROM funcionarios f
             INNER JOIN aeronaves a ON a.id = ? AND a.empresa_id = f.empresa_id
            WHERE f.empresa_id = ? AND f.deleted_at IS NULL
              AND UPPER(COALESCE(f.status, 'ATIVO')) = 'ATIVO'
              AND NULLIF(TRIM(COALESCE(f.aeronave, '')), '') IS NOT NULL
              AND (
                (NULLIF(TRIM(COALESCE(a.prefixo, '')), '') IS NOT NULL
                  AND UPPER(TRIM(f.aeronave)) = UPPER(TRIM(a.prefixo)))
                OR UPPER(TRIM(f.aeronave)) = UPPER(TRIM(a.modelo))
              ))
           AS total`,
      )
      .bind(empresaIdDelete, id, id, empresaIdDelete)
      .first<{ total: number }>();
    if (Number(inUse?.total || 0) > 0) {
      throw new ApiError(
        'Aeronave em uso não pode ser excluída. Inative ou remova os vínculos primeiro.',
        409,
      );
    }

    // Soft delete
    await db
      .prepare('UPDATE aeronaves SET deleted_at = datetime("now") WHERE id = ? AND empresa_id = ?')
      .bind(id, empresaIdDelete)
      .run();

    const ua3 = extrairUsuarioAuditoria(c);
    await registrarAuditoria({ db, tabela: 'aeronaves', acao: 'DELETE', registro_id: id, ...ua3 });

    return c.json({
      success: true,
      message: 'Aeronave deletada com sucesso',
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('[AERONAVES] Erro ao deletar:', error);
    throw new ApiError('Erro ao deletar aeronave', 500);
  }
});

export default aeronaves;
