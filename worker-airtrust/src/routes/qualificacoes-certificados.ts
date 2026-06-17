import { Hono } from 'hono';
import type { Env, ApiResponse } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';
import { registrarAuditoria, extrairUsuarioAuditoria } from '../utils/auditoria';
import { getEmployeeSectorAccess } from '../services/employee-sector-access';
import {
  assertScopedHistoricoAccess,
  tableHasColumn,
  type Documento,
  getCertificadosStorageColumns,
  resolveCertificadoContext,
} from './qualificacoes-certificados-helpers';
import certificadosWriteRoutes from './qualificacoes-certificados-write';

const app = new Hono<{ Bindings: Env }>();

app.get('/historico/:id/certificados', auth(), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'));
  const empresaId = getEmpresaId(c);

  if (isNaN(id)) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }

  try {
    const access = await getEmployeeSectorAccess(c, empresaId);
    await assertScopedHistoricoAccess(db, {
      historicoId: id,
      empresaId,
      access,
    });
    const context = await resolveCertificadoContext(db, id);

    console.log(
      `[LISTAR CERTIFICADOS] historico_id=${id}, funcionario_id=${context.historico.funcionario_id}, codigo=${context.codigo}`,
    );

    const certificadoId = context.historico.certificado_arquivo_id;
    const storageColumns = await getCertificadosStorageColumns(db);

    if (!certificadoId && !storageColumns.pastaVirtualHasCertificacaoId) {
      console.log(`[LISTAR CERTIFICADOS] Nenhum certificado vinculado ao historico_id=${id}`);
      return c.json({ success: true, data: [] });
    }

    const { results } = await db
      .prepare(
        storageColumns.pastaVirtualHasCertificacaoId
          ? `SELECT DISTINCT
               d.id,
               d.uuid,
               d.funcionario_id,
               d.nome_arquivo,
               d.tipo,
               d.tamanho,
               d.r2_key,
               d.created_at,
               d.updated_at,
               COALESCE(qh_link.numero_certificado, qh_current.numero_certificado, REPLACE(d.nome_arquivo, '.pdf', '')) AS numero_certificado
             FROM documentos d
             JOIN funcionarios fd
               ON fd.id = d.funcionario_id
              AND fd.deleted_at IS NULL
              AND fd.empresa_id = ?
             LEFT JOIN pasta_virtual pv
               ON pv.certificacao_id = ?
              AND pv.deleted_at IS NULL
              ${storageColumns.pastaVirtualHasEmpresaId ? 'AND pv.empresa_id = ?' : ''}
              AND pv.funcionario_id = d.funcionario_id
              AND pv.caminho_arquivo = d.r2_key
             LEFT JOIN qualificacoes_historico qh_link
               ON qh_link.id = pv.certificacao_id
              AND qh_link.deleted_at IS NULL
             LEFT JOIN qualificacoes_historico qh_current
               ON qh_current.certificado_arquivo_id = d.id
              AND qh_current.deleted_at IS NULL
             WHERE d.deleted_at IS NULL
               AND (
                 pv.id IS NOT NULL
                 OR (d.funcionario_id = ? AND d.id = ?)
               )
             ORDER BY d.created_at DESC, d.id DESC`
          : `SELECT
               d.id,
               d.uuid,
               d.funcionario_id,
               d.nome_arquivo,
               d.tipo,
               d.tamanho,
               d.r2_key,
               d.created_at,
               d.updated_at,
               qh.numero_certificado
             FROM documentos d
             JOIN funcionarios fd
               ON fd.id = d.funcionario_id
              AND fd.deleted_at IS NULL
              AND fd.empresa_id = ?
             LEFT JOIN qualificacoes_historico qh ON qh.certificado_arquivo_id = d.id
             WHERE d.deleted_at IS NULL
               AND d.id = ?
             ORDER BY d.created_at DESC, d.id DESC`,
      )
      .bind(
        ...(storageColumns.pastaVirtualHasCertificacaoId
          ? [
              empresaId,
              id,
              ...(storageColumns.pastaVirtualHasEmpresaId ? [empresaId] : []),
              context.historico.funcionario_id,
              certificadoId ?? 0,
            ]
          : [empresaId, certificadoId ?? 0]),
      )
      .all<Documento>();

    console.log(
      `[LISTAR CERTIFICADOS] Encontrado ${
        results?.length || 0
      } certificado(s) para historico_id=${id}`,
    );
    if ((!results || results.length === 0) && certificadoId) {
      console.warn(
        `[LISTAR CERTIFICADOS] Referência órfã detectada em historico_id=${id} para certificado_arquivo_id=${certificadoId}; limpando vínculo.`,
      );
      await db
        .prepare(
          `UPDATE qualificacoes_historico
              SET certificado_arquivo_id = NULL,
                  arquivo_url = NULL,
                  numero_certificado = NULL,
                  updated_at = datetime('now')
            WHERE id = ?
              AND empresa_id = ?
              AND deleted_at IS NULL
              AND certificado_arquivo_id = ?`,
        )
        .bind(id, empresaId, certificadoId)
        .run();
      if (!storageColumns.pastaVirtualHasCertificacaoId) {
        return c.json({ success: true, data: [] });
      }
    }

    if (results && results.length > 0) {
      console.log(`[LISTAR CERTIFICADOS] Certificado:`, results[0]);
    }

    const response: ApiResponse<Documento[]> = {
      success: true,
      data: results || [],
    };

    return c.json(response);
  } catch (error) {
    console.error('[LISTAR CERTIFICADOS] Erro:', error);
    const rawStatus =
      typeof (error as { status?: unknown }).status === 'number'
        ? Number((error as { status: number }).status)
        : typeof (error as { statusCode?: unknown }).statusCode === 'number'
          ? Number((error as { statusCode: number }).statusCode)
          : null;
    const handledStatus =
      rawStatus && rawStatus >= 400 && rawStatus < 500 ? rawStatus : null;
    const handledCode =
      typeof (error as { code?: unknown }).code === 'string'
        ? String((error as { code: string }).code)
        : undefined;
    const handledMessage =
      typeof (error as { message?: unknown }).message === 'string'
        ? String((error as { message: string }).message)
        : 'Erro ao listar certificados';

    if (handledStatus && handledStatus >= 400 && handledStatus < 500) {
      return c.json(
        {
          success: false,
          error: handledMessage,
          code: handledCode,
        },
        handledStatus as 400 | 403 | 404,
      );
    }

    return c.json(
      {
        success: false,
        error: 'Erro ao listar certificados',
        details: 'Detalhes internos omitidos',
      },
      500,
    );
  }
});

app.route('/', certificadosWriteRoutes);


app.delete('/historico/:id/certificados/:certId', auth(), async (c) => {
  const db = c.env.DB;
  const bucket = c.env.BUCKET;
  const historicoId = parseInt(c.req.param('id'));
  const certId = parseInt(c.req.param('certId'));
  const empresaId = getEmpresaId(c);

  if (isNaN(historicoId) || isNaN(certId)) {
    return c.json({ success: false, error: 'ID de certificado inválido' }, 400);
  }

  try {
    const documento = await db
      .prepare(
        `SELECT d.*
         FROM documentos d
         INNER JOIN funcionarios f ON f.id = d.funcionario_id AND f.deleted_at IS NULL
         LEFT JOIN qualificacoes_historico qh
           ON qh.id = ?
          AND qh.funcionario_id = d.funcionario_id
          AND qh.certificado_arquivo_id = d.id
          AND qh.deleted_at IS NULL
         WHERE d.id = ?
           AND f.empresa_id = ?
           AND (qh.id IS NOT NULL OR NOT EXISTS (
             SELECT 1 FROM qualificacoes_historico qh_check
             WHERE qh_check.id = ? AND qh_check.deleted_at IS NULL
           ))`,
      )
      .bind(historicoId, certId, empresaId, historicoId)
      .first<Documento>();

    if (!documento) {
      console.warn(`[DELETE CERT] Certificado ID ${certId} não encontrado`);
      return c.json({ success: false, error: 'Certificado não encontrado' }, 404);
    }

    if (!documento.deleted_at) {
      // GAP #8: Mover para pasta "deleted/" antes de soft delete
      const oldKey = documento.r2_key;
      const newKey = oldKey.replace('certificados/', 'certificados/deleted/');

      console.log(`🗑️  [SOFT DELETE CASCATA] Movendo: ${oldKey} → ${newKey}`);

      try {
        // Copiar para pasta deleted
        const existingObj = await bucket.get(oldKey);
        if (existingObj) {
          await bucket.put(newKey, existingObj.body, {
            httpMetadata: existingObj.httpMetadata,
            customMetadata: {
              ...(existingObj.customMetadata || {}),
              deleted_at: new Date().toISOString(),
              original_key: oldKey,
            },
          });

          // Deletar arquivo original
          await bucket.delete(oldKey);
          console.log(`✅ [SOFT DELETE] Arquivo movido para ${newKey}`);
        } else {
          console.warn(
            `⚠️  [SOFT DELETE] Arquivo ${oldKey} não encontrado no R2, apenas marcando no D1`,
          );
        }
      } catch (r2Error) {
        console.error('❌ [SOFT DELETE] Erro ao mover arquivo no R2:', r2Error);
        // Continua mesmo se R2 falhar (soft delete no D1 é mais importante)
      }

      // EXCLUSÃO EM CASCATA:
      // 1. Soft delete na tabela documentos
      await db
        .prepare(
          "UPDATE documentos SET deleted_at = datetime('now') WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL",
        )
        .bind(certId, empresaId)
        .run();
    } else {
      console.log(
        `ℹ️ [DELETE CERT] Documento ${certId} já estava soft-deletado; concluindo limpeza.`,
      );
    }

    // 2. Remover de pasta_virtual (se existir)
    console.log(`🗑️  [CASCATA] Verificando pasta_virtual para documento ID ${certId}...`);
    const pastaVirtualHasDocumentoId = await tableHasColumn(db, 'pasta_virtual', 'documento_id');
    const pastaVirtualResult = pastaVirtualHasDocumentoId
      ? await db
          .prepare(
            "UPDATE pasta_virtual SET deleted_at = datetime('now') WHERE documento_id = ? AND empresa_id = ? AND deleted_at IS NULL",
          )
          .bind(certId, empresaId)
          .run()
      : await db
          .prepare(
            `UPDATE pasta_virtual
                SET deleted_at = datetime('now')
              WHERE funcionario_id = ?
                AND caminho_arquivo = ?
                AND nome_arquivo = ?
                AND empresa_id = ?
                AND deleted_at IS NULL`,
          )
          .bind(documento.funcionario_id, documento.r2_key, documento.nome_arquivo, empresaId)
          .run();

    if (pastaVirtualResult.meta.changes > 0) {
      console.log(
        `✅ [CASCATA] ${pastaVirtualResult.meta.changes} registro(s) removido(s) de pasta_virtual`,
      );
    }

    // 3. Limpar referência em qualificacoes_historico (SET NULL, não deletar o histórico)
    console.log(
      `🗑️  [CASCATA] Limpando referência de certificado_arquivo_id em qualificacoes_historico...`,
    );
    const historicoResult = await db
      .prepare(
        `UPDATE qualificacoes_historico
            SET certificado_arquivo_id = NULL,
                arquivo_url = NULL,
                numero_certificado = NULL,
                updated_at = datetime('now')
          WHERE certificado_arquivo_id = ?
            AND empresa_id = ?
            AND deleted_at IS NULL`,
      )
      .bind(certId, empresaId)
      .run();

    if (historicoResult.meta.changes > 0) {
      console.log(
        `✅ [CASCATA] ${historicoResult.meta.changes} registro(s) atualizado(s) em qualificacoes_historico`,
      );
    }

    console.log(
      `✅ [DELETE CERT] Certificado ID ${certId} removido com sucesso (cascata completa)`,
    );

    try {
      const uaDel = extrairUsuarioAuditoria(c);
      await registrarAuditoria({
        db,
        tabela: 'documentos',
        acao: 'DELETE',
        registro_id: certId,
        dados_anteriores: { r2_key: documento.r2_key },
        ...uaDel,
      });
    } catch (auditError) {
      console.error('[DELETE CERT] Falha ao registrar auditoria de exclusão:', auditError);
    }

    const response: ApiResponse = {
      success: true,
      message: 'Certificado removido com sucesso (exclusão em cascata)',
    };

    return c.json(response);
  } catch (error) {
    console.error('[DELETE CERT] Erro:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao remover certificado',
        details: 'Detalhes internos omitidos',
      },
      500,
    );
  }
});

/**
 * GET /api/certificados/funcionario/:id
 * Lista todos os certificados de um funcionário (AGORA RETORNA DO NOVO ENDPOINT)
 */
app.get('/funcionario/:id', auth(), async (c) => {
  const db = c.env.DB;
  const funcionarioId = parseInt(c.req.param('id'));
  const empresaId = getEmpresaId(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const scopeConditions: string[] = [];
  const scopeBindings: unknown[] = [];
  appendEmployeeSectorFilter(scopeConditions, scopeBindings, access, 'f');

  if (isNaN(funcionarioId)) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }

  try {
    // Buscar documentos agrupados por categoria
    const query = `
      SELECT
        d.id,
        d.uuid,
        d.nome_arquivo,
        d.r2_key as arquivo_url,
        d.created_at as uploaded_at,
        d.created_at as data_upload,
        d.created_at as data_documento,
        d.tamanho as arquivo_tamanho,
        d.tipo,
        'CERTIFICADO_QUALIFICACAO' as categoria
      FROM documentos d
      INNER JOIN funcionarios f ON f.id = d.funcionario_id AND f.deleted_at IS NULL
      WHERE d.funcionario_id = ?
        AND f.empresa_id = ?
        AND ${scopeConditions.join(' AND ')}
        AND d.deleted_at IS NULL
      ORDER BY d.created_at DESC
    `;

    const { results } = await db.prepare(query).bind(funcionarioId, empresaId, ...scopeBindings).all();

    const response: ApiResponse = {
      success: true,
      data: results || [],
    };

    return c.json(response);
  } catch (error) {
    console.error('[certificados/funcionario] Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

    // Se for erro de "no such table", retornar vazio ao invés de 500
    if (errorMessage.includes('no such table')) {
      console.warn('[certificados/funcionario] Tabela documentos não existe');
      return c.json({
        success: true,
        data: [],
        message: 'Tabela documentos ainda não criada',
      });
    }

    return c.json(
      {
        success: false,
        error: 'Erro ao buscar certificados',
        code: 'INTERNAL_ERROR',
      },
      500,
    );
  }
});

/**
 * Download de certificado
 * GET /download/:id
 * Retorna URL de streaming do R2 (mesmo padrão de pasta-virtual)
 */
app.get('/download/:id', auth(), async (c) => {
  const db = c.env.DB;
  const docId = parseInt(c.req.param('id'));
  const empresaId = getEmpresaId(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const scopeConditions: string[] = [];
  const scopeBindings: unknown[] = [];
  appendEmployeeSectorFilter(scopeConditions, scopeBindings, access, 'f');

  if (isNaN(docId)) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }

  try {
    // Buscar documento
    const query = `
      SELECT d.id, d.uuid, d.r2_key, d.nome_arquivo, d.funcionario_id
      FROM documentos d
      INNER JOIN funcionarios f ON f.id = d.funcionario_id AND f.deleted_at IS NULL
      WHERE d.id = ? AND d.deleted_at IS NULL AND f.empresa_id = ? AND ${scopeConditions.join(' AND ')}
    `;

    const doc = await db.prepare(query).bind(docId, empresaId, ...scopeBindings).first();

    if (!doc) {
      return c.json({ success: false, error: 'Certificado não encontrado' }, 404);
    }

    // Retornar URL de streaming usando endpoint centralizado de pasta-virtual
    const streamUrl = `/api/pasta-virtual/stream/${docId}`;

    const response: ApiResponse<{ url: string; nome: string }> = {
      success: true,
      data: {
        url: streamUrl,
        nome: doc.nome_arquivo as string,
      },
    };

    return c.json(response);
  } catch (error) {
    console.error('[certificados/download] Erro:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao obter URL de download',
        details: 'Detalhes internos omitidos',
      },
      500,
    );
  }
});

/**

/**
 * ⚠️ ATENÇÃO: ENDPOINT DE DOWNLOAD REMOVIDO
 * 
 * Downloads de certificados devem SEMPRE usar:
 *   GET /api/pasta-virtual/stream/:documento_id
 * 
 * Isso garante:
 * - Auditoria centralizada de downloads
 * - Validação de integridade (magic bytes) em um único lugar
 * - Sem duplicação de lógica
 */

export default app;
