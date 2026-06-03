/**
 * PASTA VIRTUAL — Extra Routes
 * GET /download-certificados/:funcionario_id
 * GET /:id/documentos  (compatibilidade com auditoria legada)
 * POST /:id/upload     (compatibilidade com auditoria legada)
 */

import { Hono } from 'hono';
import { jsonOk, jsonError } from '../middleware/response';
import { AppError } from '../utils/errors';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';

const app = new Hono<{ Bindings: Env }>();

/**
 * GET /api/pasta-virtual/download-certificados/:funcionario_id
 * Download de todos os certificados de um funcionário em formato ZIP
 * Apenas certificados (CERT-*.pdf), exclui fichas, exames e outros documentos
 */
app.get('/download-certificados/:funcionario_id', auth(), async (c) => {
  const db = c.env.DB;
  const bucket = c.env.BUCKET;
  const funcionarioId = parseInt(c.req.param('funcionario_id'));
  const empresaId = getEmpresaId(c);

  if (isNaN(funcionarioId)) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }

  try {
    console.log(
      `[DOWNLOAD ZIP] Iniciando download de certificados para funcionário ${funcionarioId}`,
    );

    // Buscar apenas certificados (nome começa com CERT-)
    const query = `
      SELECT
        d.id,
        d.nome_arquivo,
        d.r2_key,
        d.tamanho
      FROM documentos d
      INNER JOIN funcionarios f ON f.id = d.funcionario_id AND f.deleted_at IS NULL
      WHERE d.funcionario_id = ?
        AND f.empresa_id = ?
        AND d.deleted_at IS NULL
        AND (
          d.nome_arquivo LIKE 'CERT-%'
          OR d.nome_arquivo LIKE 'Certificado%'
          OR d.r2_key LIKE '%certificados/%'
        )
      ORDER BY d.created_at DESC
    `;

    const { results } = await db.prepare(query).bind(funcionarioId, empresaId).all<{
      id: number;
      nome_arquivo: string;
      r2_key: string;
      tamanho: number;
    }>();

    if (!results || results.length === 0) {
      return c.json({ success: false, error: 'Nenhum certificado encontrado' }, 404);
    }

    console.log(`[DOWNLOAD ZIP] Encontrados ${results.length} certificados`);

    // Importar fflate dinamicamente
    const { zipSync } = await import('fflate');

    // Objeto para armazenar arquivos do ZIP
    const zipFiles: Record<string, Uint8Array> = {};

    // Baixar cada certificado do R2 e adicionar ao ZIP
    for (const cert of results) {
      try {
        const obj = await bucket.get(cert.r2_key);

        if (obj) {
          const arrayBuffer = await obj.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);

          // Adicionar ao ZIP com nome original
          zipFiles[cert.nome_arquivo] = uint8Array;
          console.log(`[DOWNLOAD ZIP] Adicionado: ${cert.nome_arquivo} (${cert.tamanho} bytes)`);
        } else {
          console.warn(`[DOWNLOAD ZIP] Arquivo não encontrado no R2: ${cert.r2_key}`);
        }
      } catch (err) {
        console.error(`[DOWNLOAD ZIP] Erro ao baixar ${cert.nome_arquivo}:`, err);
        // Continua mesmo se um arquivo falhar
      }
    }

    if (Object.keys(zipFiles).length === 0) {
      return c.json({ success: false, error: 'Nenhum certificado pôde ser baixado' }, 500);
    }

    // Criar ZIP
    const zipped = zipSync(zipFiles, {
      level: 6, // Compressão média
    });

    console.log(
      `[DOWNLOAD ZIP] ZIP criado: ${zipped.byteLength} bytes com ${
        Object.keys(zipFiles).length
      } arquivos`,
    );

    // Buscar nome do funcionário para o nome do arquivo
    const funcionario = await db
      .prepare(
        'SELECT nome, matricula FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(funcionarioId, empresaId)
      .first<{ nome: string; matricula: string }>();

    const nomeArquivo = funcionario
      ? `Certificados-${funcionario.matricula}-${funcionario.nome.replace(/\s+/g, '_')}.zip`
      : `Certificados-Funcionario-${funcionarioId}.zip`;

    // Retornar ZIP
    return new Response(zipped, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
        'Content-Length': zipped.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error('[DOWNLOAD ZIP] Erro:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao gerar arquivo ZIP',
        details: 'Detalhes internos omitidos',
      },
      500,
    );
  }
});

/**
 * ENDPOINTS COMPATÍVEIS COM AUDITORIA LEGADA
 * A auditoria espera rotas: GET /pasta-virtual/:id/documentos e POST /pasta-virtual/:id/upload
 * Adicionadas para manter compatibilidade sem quebrar rotas já existentes.
 */

app.get('/:id/documentos', auth(), async (c) => {
  try {
    const db = c.env.DB;
    const id = parseInt(c.req.param('id'));
    const empresaId = getEmpresaId(c);
    if (isNaN(id)) return jsonError(c, 'ID inválido', 400, 'ID_INVALIDO');
    const { results } = await db
      .prepare(
        `SELECT d.id, d.uuid, d.funcionario_id, d.nome_arquivo as nome, d.tipo, d.tamanho,
                d.r2_key, d.created_at, d.updated_at
         FROM documentos d
         INNER JOIN funcionarios f ON f.id = d.funcionario_id AND f.deleted_at IS NULL
         WHERE d.funcionario_id = ? AND f.empresa_id = ? AND d.deleted_at IS NULL
         ORDER BY d.created_at DESC LIMIT 100`,
      )
      .bind(id, empresaId) // aqui usamos id como funcionario_id por compatibilidade
      .all();
    return jsonOk(c, results || []);
  } catch (e) {
    const err = e as AppError;
    return jsonError(c, err.message || 'Falha ao listar documentos', err.status || 500, err.code);
  }
});

app.post('/:id/upload', auth(), async (c) => {
  try {
    const db = c.env.DB;
    const bucket = c.env.BUCKET;
    const funcionarioId = parseInt(c.req.param('id'));
    const empresaId = getEmpresaId(c);
    if (isNaN(funcionarioId)) return jsonError(c, 'ID inválido', 400, 'ID_INVALIDO');
    const funcionario = await db
      .prepare(
        'SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(funcionarioId, empresaId)
      .first<{ id: number }>();
    if (!funcionario) {
      return jsonError(c, 'Funcionário não encontrado', 404, 'FUNCIONARIO_NOT_FOUND');
    }
    const contentType = c.req.header('Content-Type') || '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      // Auditoria envia POST sem corpo -> responder 400 para indicar validação ok
      return jsonError(
        c,
        'Content-Type multipart/form-data obrigatório',
        400,
        'CONTENT_TYPE_INVALIDO',
      );
    }
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return jsonError(c, 'Arquivo não enviado', 400, 'ARQUIVO_OBRIGATORIO');
    if (file.size > 10_000_000)
      return jsonError(c, 'Arquivo excede limite de 10MB', 422, 'ARQUIVO_GRANDE');
    if (!file.name.toLowerCase().endsWith('.pdf'))
      return jsonError(c, 'Somente PDF é permitido', 422, 'ARQUIVO_INVALIDO');
    const uuid = crypto.randomUUID();
    const r2Key = `funcionarios/${funcionarioId}/${uuid}.pdf`;
    const buf = await file.arrayBuffer();
    const uint8 = new Uint8Array(buf);

    // Calcular hash SHA-256
    const hashBuffer = await crypto.subtle.digest('SHA-256', uint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    await bucket.put(r2Key, uint8, { httpMetadata: { contentType: 'application/pdf' } });

    let insertResult;
    try {
      insertResult = await db
        .prepare(
          `INSERT INTO documentos (uuid, funcionario_id, nome_arquivo, tipo, tamanho, r2_key, sha256_hash, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        )
        .bind(uuid, funcionarioId, file.name, 'application/pdf', file.size, r2Key, hashHex)
        .run();
    } catch (insertError) {
      const errorMsg = String(insertError);
      // Se coluna sha256_hash não existir, tentar sem ela
      if (errorMsg.includes('no column named sha256_hash')) {
        console.warn(
          '[pasta-virtual/:id/upload] Coluna sha256_hash não existe, inserindo sem hash',
        );
        insertResult = await db
          .prepare(
            `INSERT INTO documentos (uuid, funcionario_id, nome_arquivo, tipo, tamanho, r2_key, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          )
          .bind(uuid, funcionarioId, file.name, 'application/pdf', file.size, r2Key)
          .run();
      } else {
        throw insertError;
      }
    }

    return jsonOk(
      c,
      { id: insertResult.meta.last_row_id, uuid, r2_key: r2Key },
      'Upload realizado com sucesso',
    );
  } catch (e) {
    const err = e as AppError;
    return jsonError(c, err.message || 'Falha ao fazer upload', err.status || 500, err.code);
  }
});

export default app;
