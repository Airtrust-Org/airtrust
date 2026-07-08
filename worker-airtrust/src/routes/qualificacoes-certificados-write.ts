/**
 * QUALIFICACOES CERTIFICADOS — Write Routes
 * POST /historico/:id/certificados/gerar
 * POST /historico/:id/certificados/upload
 */

import { Hono } from 'hono';
import type { Env, ApiResponse } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';
import { getEmployeeSectorAccess } from '../services/employee-sector-access';
import { gerarNomeArquivoPadronizado } from '../utils/nomenclatura-padronizada';
import { registrarAuditoria, extrairUsuarioAuditoria } from '../utils/auditoria';
import {
  assertScopedHistoricoAccess,
  getCertificadosStorageColumns,
  insertCertificadoNaPastaVirtual,
  backfillCertificadoAtualNaPastaVirtual,
  resolveCertificadoContext,
} from './qualificacoes-certificados-helpers';
import { generateCertificateForHistorico, buildCertificadoR2Key } from '../services/generate-certificate';

const app = new Hono<{ Bindings: Env }>();

/**
 * POST /historico/:id/certificados/gerar
 *
 * Idempotente por padrão: se já houver certificado ativo vinculado ao histórico,
 * devolve o existente com estado="EXISTS" (HTTP 200) sem criar novo documento.
 *
 * Para regenerar: enviar body { "force_regenerate": true }.
 * Nesse caso, o documento anterior é soft-deleted antes de ser substituído.
 */
app.post(
  '/historico/:id/certificados/gerar',
  auth(),
  requireRole('admin', 'manager'),
  async (c) => {
    const id = parseInt(c.req.param('id'));
    const empresaId = getEmpresaId(c);
    const db = c.env.DB;

    if (isNaN(id)) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    const body = await c.req.json().catch(() => ({}));
    const forceRegenerate = Boolean(body?.force_regenerate || body?.regenerate);
    const ua = extrairUsuarioAuditoria(c);

    try {
      // 1. Verificar que o histórico pertence ao tenant
      const currentHistorico = await db
        .prepare(
          `SELECT qh.id, qh.certificado_arquivo_id
             FROM qualificacoes_historico qh
             INNER JOIN funcionarios f
               ON f.id = qh.funcionario_id
              AND f.empresa_id = ?
              AND f.deleted_at IS NULL
            WHERE qh.id = ?
              AND qh.deleted_at IS NULL
            LIMIT 1`,
        )
        .bind(empresaId, id)
        .first<{ id: number; certificado_arquivo_id: number | null }>();

      if (!currentHistorico) {
        return c.json(
          { success: false, error: 'Qualificação não encontrada para esta empresa' },
          404,
        );
      }

      const existingDocId = currentHistorico.certificado_arquivo_id ?? null;

      // 2. Idempotência: devolver existente se não for force_regenerate
      if (existingDocId && !forceRegenerate) {
        const existingDoc = await db
          .prepare(
            `SELECT id, uuid, r2_key, tamanho
               FROM documentos
              WHERE id = ?
                AND deleted_at IS NULL
              LIMIT 1`,
          )
          .bind(existingDocId)
          .first<{ id: number; uuid: string; r2_key: string; tamanho: number }>();

        if (existingDoc) {
          return c.json(
            {
              success: true,
              estado: 'EXISTS' as const,
              data: {
                id: existingDoc.id,
                uuid: existingDoc.uuid,
                r2_key: existingDoc.r2_key,
                tamanho: existingDoc.tamanho,
              },
              message: 'Certificado já existe. Use force_regenerate=true para regenerar.',
            },
            200,
          );
        }
        // Documento órfão (deleted_at setado) — prosseguir para regenerar
      }

      // 3. Gerar novo certificado
      const generated = await generateCertificateForHistorico(c.env, id, empresaId, {
        paraInstrutor: Boolean(body?.para_instrutor),
        nomeInstrutor: String(body?.nome_instrutor || '').trim(),
        cpfInstrutor: String(body?.cpf_instrutor || '').trim(),
        matriculaInstrutor: String(body?.matricula_instrutor || '').trim(),
        actorUserId: ua.usuario_id ? Number(ua.usuario_id) : undefined,
      });

      // 4. Soft-delete do documento anterior após geração bem-sucedida
      if (existingDocId && generated.documentoId !== existingDocId) {
        try {
          const storageColumns = await getCertificadosStorageColumns(db);
          const whereEmpresa = storageColumns.documentosHasEmpresaId ? ' AND empresa_id = ?' : '';
          const bindArgs: Array<number> = storageColumns.documentosHasEmpresaId
            ? [existingDocId, empresaId]
            : [existingDocId];
          await db
            .prepare(
              `UPDATE documentos
                  SET deleted_at = datetime('now'),
                      updated_at = datetime('now')
                WHERE id = ?
                  AND deleted_at IS NULL${whereEmpresa}`,
            )
            .bind(...bindArgs)
            .run();
          await registrarAuditoria({
            db,
            tabela: 'documentos',
            acao: 'UPDATE',
            registro_id: existingDocId,
            dados_novos: {
              substituido_por: generated.documentoId,
              motivo: 'force_regenerate via /gerar',
            },
            usuario_id: ua.usuario_id ?? undefined,
          });
        } catch (cleanupErr) {
          console.error('[gerar] Aviso: falha ao marcar doc anterior como substituído:', cleanupErr);
        }
      }

      const estado = forceRegenerate && existingDocId ? ('REGENERATED' as const) : ('CREATED' as const);
      const response: ApiResponse<{ id: number; uuid: string; r2_key: string; tamanho: number }> & {
        estado: typeof estado;
      } = {
        success: true,
        estado,
        data: {
          id: generated.documentoId,
          uuid: generated.uuid,
          r2_key: generated.r2Key,
          tamanho: generated.tamanho,
        },
        message:
          estado === 'REGENERATED'
            ? 'Certificado regenerado com sucesso'
            : 'Certificado gerado com sucesso',
      };

      return c.json(response, 201);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('❌ [GERAR PDF] Erro:', msg);
      const is404 = msg.includes('não encontrada') || msg.includes('not found');
      return c.json(
        {
          success: false,
          error: is404 ? msg : 'Erro ao gerar certificado',
          code: 'INTERNAL_ERROR',
        },
        is404 ? 404 : 500,
      );
    }
  },
);

/**
 * POST /historico/:id/certificados/upload
 * Upload manual de PDF de certificado para uma qualificação.
 */
app.post(
  '/historico/:id/certificados/upload',
  auth(),
  requireRole('admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const bucket = c.env.BUCKET;
    const id = parseInt(c.req.param('id'));
    const empresaId = getEmpresaId(c);

    if (isNaN(id)) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    let uploadedR2Key: string | null = null;
    let documentoId: number | null = null;
    let funcionarioId: number | null = null;
    let storageColumns:
      | Awaited<ReturnType<typeof getCertificadosStorageColumns>>
      | null = null;

    try {
      const access = await getEmployeeSectorAccess(c, empresaId);
      const scopedHistorico = await assertScopedHistoricoAccess(db, {
        historicoId: id,
        empresaId,
        access,
      });
      const { historico, nomeFuncionario, cpf, codigo } = await resolveCertificadoContext(db, id);
      storageColumns = await getCertificadosStorageColumns(db);
      funcionarioId = scopedHistorico.funcionario_id;
      await backfillCertificadoAtualNaPastaVirtual(db, storageColumns, {
        historicoId: id,
        funcionarioId: historico.funcionario_id,
        certificadoArquivoId: historico.certificado_arquivo_id ?? null,
        empresaId,
      });

      const form = await c.req.formData();
      const file = form.get('file') as File | null;
      const descricao = (form.get('descricao') as string) || null;
      const dataRealizacaoStr = (form.get('data_realizacao') as string) || null;

      if (!file) {
        return c.json({ success: false, error: 'Campo "file" é obrigatório' }, 400);
      }

      const MAX_SIZE = 10 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        return c.json(
          {
            success: false,
            error: `Arquivo muito grande. Máximo: 10MB (enviado: ${(
              file.size /
              1024 /
              1024
            ).toFixed(2)}MB)`,
          },
          400,
        );
      }

      if (file.size < 1024) {
        return c.json({ success: false, error: 'Arquivo muito pequeno (mínimo: 1KB)' }, 400);
      }

      const arrayBuffer = await file.arrayBuffer();
      const header = new Uint8Array(arrayBuffer.slice(0, 5));
      const isPDF =
        header[0] === 0x25 &&
        header[1] === 0x50 &&
        header[2] === 0x44 &&
        header[3] === 0x46 &&
        header[4] === 0x2d;

      if (!isPDF) {
        return c.json(
          {
            success: false,
            error: 'Arquivo inválido. Não é um PDF real (magic bytes inválidos)',
          },
          400,
        );
      }

      let dataRealização: Date;
      if (dataRealizacaoStr) {
        dataRealização = new Date(dataRealizacaoStr);
      } else if (historico.data_conclusao) {
        dataRealização = new Date(historico.data_conclusao);
      } else if (historico.data_vencimento) {
        dataRealização = new Date(historico.data_vencimento);
      } else {
        return c.json(
          {
            success: false,
            error:
              'Impossível fazer upload: qualificação não possui data de conclusão ou vencimento.',
          },
          400,
        );
      }

      const uuid = crypto.randomUUID().substring(0, 8);

      // Nome do arquivo (usado como metadado/display, não como path R2)
      const nomeArquivo = gerarNomeArquivoPadronizado({
        tipo: 'CERTIFICADO_QUALIFICACAO',
        nomeFuncionario: nomeFuncionario,
        cpf,
        data: dataRealização,
        codigo,
        uuid,
      });

      console.log('[UPLOAD CERT] Gerando certificado:', {
        historicoId: id,
        codigo,
        nomeArquivoGerado: nomeArquivo,
      });

      // R2 key tenant-scoped sem PII no path
      const r2Key = buildCertificadoR2Key(empresaId, historico.funcionario_id, id, uuid);
      const uint8Array = new Uint8Array(arrayBuffer);
      const fileType = file.type || 'application/pdf';

      const hashBuffer = await crypto.subtle.digest('SHA-256', uint8Array);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

      await bucket.put(r2Key, uint8Array, {
        httpMetadata: {
          contentType: fileType,
        },
        customMetadata: {
          tipo: 'CERTIFICADO_QUALIFICACAO',
          codigo,
          historico_id: String(historico.id),
          data_referencia: dataRealização.toISOString(),
          origem: 'upload_manual',
          hash_sha256: hash,
        },
      });
      uploadedR2Key = r2Key;

      const result = await db
        .prepare(
          storageColumns.documentosHasEmpresaId
            ? `INSERT INTO documentos (
                 uuid, funcionario_id, nome_arquivo, tipo, tamanho, r2_key,
                 descricao, empresa_id, created_at, updated_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
            : `INSERT INTO documentos (
                 uuid, funcionario_id, nome_arquivo, tipo, tamanho, r2_key,
                 descricao, created_at, updated_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        )
        .bind(
          ...(storageColumns.documentosHasEmpresaId
            ? [
                uuid,
                historico.funcionario_id,
                nomeArquivo,
                fileType,
                uint8Array.byteLength,
                r2Key,
                descricao ||
                  `Certificado anexado para qualificação ${codigo} em ${
                    dataRealização.toISOString().split('T')[0]
                  }`,
                empresaId,
              ]
            : [
                uuid,
                historico.funcionario_id,
                nomeArquivo,
                fileType,
                uint8Array.byteLength,
                r2Key,
                descricao ||
                  `Certificado anexado para qualificação ${codigo} em ${
                    dataRealização.toISOString().split('T')[0]
                  }`,
              ]),
        )
        .run();

      documentoId = Number(result.meta.last_row_id || 0);
      if (Number(result.meta.changes || 0) !== 1 || !documentoId) {
        throw new Error('Falha ao registrar documento do certificado no tenant');
      }

      console.log(`✅ [UPLOAD CERT] Certificado salvo: ID ${documentoId}`);

      await insertCertificadoNaPastaVirtual(db, storageColumns, {
        funcionarioId: historico.funcionario_id,
        documentoId,
        historicoId: id,
        empresaId,
        r2Key,
        nomeArquivo,
        descricao: `Certificado ${codigo} - ${nomeFuncionario}`,
      });
      console.log('✅ [UPLOAD CERT] Certificado inserido na pasta_virtual');

      const numeroCertificado = nomeArquivo.replace('.pdf', '');
      const updateResult = await db
        .prepare(
          `UPDATE qualificacoes_historico
           SET certificado_arquivo_id = ?,
               arquivo_url = ?,
               numero_certificado = ?,
               updated_at = datetime('now')
           WHERE id = ?
             AND empresa_id = ?
             AND deleted_at IS NULL`,
        )
        .bind(
          documentoId,
          `/api/pasta-virtual/stream/${documentoId}`,
          numeroCertificado,
          id,
          empresaId,
        )
        .run();

      if (Number(updateResult.meta.changes || 0) !== 1) {
        throw new Error('Falha ao vincular o certificado principal ao histórico do tenant');
      }

      const visibleAfterUpload = await db
        .prepare(
          `SELECT d.id
             FROM qualificacoes_historico qh
             INNER JOIN funcionarios f
               ON f.id = qh.funcionario_id
              AND f.empresa_id = ?
              AND f.deleted_at IS NULL
             INNER JOIN documentos d
               ON d.id = qh.certificado_arquivo_id
              AND d.deleted_at IS NULL
            WHERE qh.id = ?
              AND qh.empresa_id = ?
              AND qh.deleted_at IS NULL
              AND d.id = ?
            LIMIT 1`,
        )
        .bind(empresaId, id, empresaId, documentoId)
        .first<{ id: number }>();

      if (!visibleAfterUpload?.id) {
        throw new Error('Upload concluído, mas o certificado não ficou visível após o vínculo');
      }

      console.log(`✅ [UPLOAD CERT] Linked documento ${documentoId} to historico ${id}`);

      const ua2 = extrairUsuarioAuditoria(c);
      await registrarAuditoria({
        db,
        tabela: 'documentos',
        acao: 'INSERT',
        registro_id: documentoId,
        dados_novos: { historico_id: id, r2_key: r2Key, nome_arquivo: nomeArquivo },
        ...ua2,
      });

      const response: ApiResponse<{ id: number; uuid: string; r2_key: string }> = {
        success: true,
        data: {
          id: documentoId,
          uuid,
          r2_key: r2Key,
        },
        message: 'Certificado anexado com sucesso',
      };

      return c.json(response, 201);
    } catch (error) {
      if (documentoId && storageColumns) {
        try {
          await db
            .prepare(
              storageColumns.documentosHasEmpresaId
                ? `UPDATE documentos
                     SET deleted_at = datetime('now'),
                         updated_at = datetime('now')
                   WHERE id = ?
                     AND empresa_id = ?
                     AND deleted_at IS NULL`
                : `UPDATE documentos
                     SET deleted_at = datetime('now'),
                         updated_at = datetime('now')
                   WHERE id = ?
                     AND deleted_at IS NULL`,
            )
            .bind(
              ...(storageColumns.documentosHasEmpresaId
                ? [documentoId, empresaId]
                : [documentoId]),
            )
            .run();
        } catch (cleanupError) {
          console.error('[UPLOAD CERT] Falha ao reverter documento após erro:', cleanupError);
        }

        try {
          if (funcionarioId && uploadedR2Key) {
            const filters = [
              'funcionario_id = ?',
              'caminho_arquivo = ?',
              'deleted_at IS NULL',
            ];
            const bindings: Array<number | string> = [funcionarioId, uploadedR2Key];

            if (storageColumns.pastaVirtualHasCertificacaoId) {
              filters.push('certificacao_id = ?');
              bindings.push(id);
            }

            if (storageColumns.pastaVirtualHasEmpresaId) {
              filters.push('empresa_id = ?');
              bindings.push(empresaId);
            }

            await db
              .prepare(
                `UPDATE pasta_virtual
                    SET deleted_at = datetime('now'),
                        updated_at = datetime('now')
                  WHERE ${filters.join(' AND ')}`,
              )
              .bind(...bindings)
              .run();
          }
        } catch (cleanupError) {
          console.error('[UPLOAD CERT] Falha ao reverter pasta_virtual após erro:', cleanupError);
        }
      }

      if (uploadedR2Key) {
        try {
          await bucket.delete(uploadedR2Key);
        } catch (cleanupError) {
          console.error('[UPLOAD CERT] Falha ao remover objeto R2 após erro:', cleanupError);
        }
      }

      console.error('[UPLOAD CERT] Erro:', error);
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
          : 'Erro ao fazer upload do certificado';

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
          error: 'Erro ao fazer upload do certificado',
          details: 'Detalhes internos omitidos',
        },
        500,
      );
    }
  },
);

export default app;
