import { Hono } from 'hono';
import type { Env, ApiResponse } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';
import { registrarAuditoria, extrairUsuarioAuditoria } from '../utils/auditoria';
import { getEmployeeSectorAccess } from '../services/employee-sector-access';
import {
  assertScopedHistoricoAccess,
  listHistoricoCertificados,
  tableHasColumn,
  type Documento,
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
    const results = await listHistoricoCertificados(db, {
      historicoId: id,
      empresaId,
      funcionarioId: context.historico.funcionario_id,
      certificadoArquivoId: certificadoId,
    });

    console.log(
      `[LISTAR CERTIFICADOS] Encontrado ${results.length || 0} certificado(s) para historico_id=${id}`,
    );
    if (results.length === 0 && certificadoId) {
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
      return c.json({ success: true, data: [] });
    }

    if (results.length > 0) {
      console.log(`[LISTAR CERTIFICADOS] Certificado:`, results[0]);
    }

    const response: ApiResponse<Documento[]> = {
      success: true,
      data: results,
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


app.delete('/historico/:id/certificados/:certId', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const historicoId = parseInt(c.req.param('id'));
  const certId = parseInt(c.req.param('certId'));
  const empresaId = getEmpresaId(c);

  if (isNaN(historicoId) || isNaN(certId)) {
    return c.json({ success: false, error: 'ID de certificado inválido' }, 400);
  }

  try {
    const access = await getEmployeeSectorAccess(c, empresaId);
    const scopedHistorico = await assertScopedHistoricoAccess(db, {
      historicoId,
      empresaId,
      access,
    });
    const context = await resolveCertificadoContext(db, historicoId);
    const certificados = await listHistoricoCertificados(db, {
      historicoId,
      empresaId,
      funcionarioId: scopedHistorico.funcionario_id,
      certificadoArquivoId: context.historico.certificado_arquivo_id,
    });
    const documento = certificados.find(
      (item) =>
        item.id === certId ||
        item.documento_id === certId ||
        (typeof item.pasta_virtual_id === 'number' && item.pasta_virtual_id === certId),
    );

    if (!documento?.documento_id) {
      console.warn(
        `[DELETE CERT] Certificado ID ${certId} não encontrado no historico_id=${historicoId}`,
      );
      return c.json({ success: false, error: 'Certificado não encontrado' }, 404);
    }

    // Soft-delete apenas no D1; o binário em R2 permanece intacto.
    await db
      .prepare(
        `UPDATE documentos
            SET deleted_at = datetime('now'),
                updated_at = datetime('now')
          WHERE id = ?
            AND funcionario_id = ?
            AND deleted_at IS NULL`,
      )
      .bind(documento.documento_id, scopedHistorico.funcionario_id)
      .run();

    const pastaVirtualHasDocumentoId = await tableHasColumn(db, 'pasta_virtual', 'documento_id');
    const pastaVirtualHasEmpresaId = await tableHasColumn(db, 'pasta_virtual', 'empresa_id');
    const pastaVirtualResult = pastaVirtualHasDocumentoId
      ? await db
          .prepare(
            `UPDATE pasta_virtual
                SET deleted_at = datetime('now')
              WHERE funcionario_id = ?
                AND certificacao_id = ?
                AND documento_id = ?
                ${pastaVirtualHasEmpresaId ? 'AND empresa_id = ?' : ''}
                AND deleted_at IS NULL`,
          )
          .bind(
            scopedHistorico.funcionario_id,
            historicoId,
            documento.documento_id,
            ...(pastaVirtualHasEmpresaId ? [empresaId] : []),
          )
          .run()
      : await db
          .prepare(
            `UPDATE pasta_virtual
                SET deleted_at = datetime('now')
              WHERE funcionario_id = ?
                AND certificacao_id = ?
                AND caminho_arquivo = ?
                ${pastaVirtualHasEmpresaId ? 'AND empresa_id = ?' : ''}
                AND deleted_at IS NULL`,
          )
          .bind(
            scopedHistorico.funcionario_id,
            historicoId,
            documento.r2_key,
            ...(pastaVirtualHasEmpresaId ? [empresaId] : []),
          )
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
      .bind(documento.documento_id, empresaId)
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
        registro_id: documento.documento_id,
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
        : 'Erro ao remover certificado';

    if (handledStatus) {
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
