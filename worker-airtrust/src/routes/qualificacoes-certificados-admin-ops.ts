/**
 * QUALIFICACOES CERTIFICADOS ADMIN — Operações
 * POST /recuperar-orfaos
 * POST /limpar-refs-orfas
 * POST /historico/export-zip
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';
import { requireControlledAdminOrSupportAccess } from '../middleware/platform-support';
import {
  buildAuditMetadata,
  buildLegacyAuditoriaActor,
  buildLegacyAuditPayload,
} from '../lib/audit/context';
import { recordLegacyAndCanonicalAudit } from '../lib/audit/record-legacy-and-canonical-audit';
import { ensureCertificateForQualification } from '../services/ensure-certificate';

const opsRouter = new Hono<{ Bindings: Env }>();

async function recordCertificadosAdminOperationAudit(
  c: {
    env: Env;
    get: (key: string) => unknown;
    req: { header: (name: string) => string | undefined; path: string; method: string };
  },
  params: {
    action: string;
    entityId?: string | number | null;
    metadata?: Record<string, unknown>;
    legacyPayload?: Record<string, unknown>;
  },
) {
  const actorUserId = Number(c.get('userId') || 0) || null;
  const actorEmpresaId = Number(c.get('empresaId') || 0) || null;
  const actorRole = typeof c.get('userRole') === 'string' ? String(c.get('userRole')) : null;
  const empresaId = actorEmpresaId;
  const metadata = buildAuditMetadata(c, {
    request_path: c.req.path,
    http_method: c.req.method,
    operation: params.action,
    ...params.metadata,
  });

  await recordLegacyAndCanonicalAudit({
    db: c.env.DB,
    legacyAuditoria: {
      tabela: 'certificados_admin_ops',
      acao: 'BULK_UPDATE',
      registro_id: params.entityId ?? params.action,
      dados_novos: buildLegacyAuditPayload(c, params.legacyPayload || {}, metadata),
      ...buildLegacyAuditoriaActor(c),
    },
    canonicalEvent: {
      empresaId,
      targetEmpresaId: empresaId,
      actorUserId,
      actorEmpresaId,
      actorRole,
      eventCategory: 'ADMIN_OPERATION',
      eventAction: params.action,
      entityType: 'certificados_admin_ops',
      entityId: params.entityId ?? params.action,
      riskLevel: 'high',
      metadata: {
        module: 'qualificacoes_certificados',
        source: 'certificados_admin_ops',
        operation: params.action,
        request_path: c.req.path,
        http_method: c.req.method,
        scope: 'tenant',
        result: 'success',
        approximate_count:
          typeof params.metadata?.approximate_count === 'number'
            ? params.metadata.approximate_count
            : undefined,
        count: typeof params.metadata?.count === 'number' ? params.metadata.count : undefined,
      },
      retentionClass: 'SECURITY_LONG',
    },
  });
}

// 🔧 Endpoint para recuperar certificados órfãos (não linkados)
opsRouter.post(
  '/recuperar-orfaos',
  auth(),
  requireControlledAdminOrSupportAccess({
    action: 'CERTIFICADOS_RECUPERAR_ORFAOS',
    access: 'mutation',
    entityType: 'certificados_admin_ops',
    module: 'qualificacoes_certificados',
  }),
  async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);

  try {
    console.log('🔧 [RECUPERAR ORFAOS] Iniciando busca de certificados órfãos...');

    // Buscar documentos CERTIFICADO_QUALIFICACAO que não estão linkados
    const { results: orfaos } = await db
      .prepare(
        `
        SELECT
          d.id as documento_id,
          d.nome_arquivo,
          d.funcionario_id,
          d.created_at as documento_data,
          d.r2_key
        FROM documentos d
        JOIN funcionarios f
          ON f.id = d.funcionario_id
         AND f.deleted_at IS NULL
        WHERE d.deleted_at IS NULL
          AND f.empresa_id = ?
          AND d.nome_arquivo LIKE 'CERT-%'
          AND NOT EXISTS (
            SELECT 1
            FROM qualificacoes_historico qh_link
            WHERE qh_link.certificado_arquivo_id = d.id
              AND qh_link.deleted_at IS NULL
          )
        ORDER BY d.funcionario_id, d.created_at DESC
        `,
      )
      .bind(empresaId)
      .all<{
        documento_id: number;
        nome_arquivo: string;
        funcionario_id: number;
        documento_data: string;
        r2_key: string;
      }>();

    console.log(`📋 Encontrados ${orfaos?.length || 0} certificados órfãos`);

    if (!orfaos || orfaos.length === 0) {
      return c.json({
        success: true,
        message: 'Nenhum certificado órfão encontrado',
        data: { linkedCount: 0, orfaosCount: 0 },
      });
    }

    let linkedCount = 0;

    // Para cada orfão, tentar linkar à qualificação mais provável
    for (const orfao of orfaos) {
      try {
        // Extrair código do nome: CERT-{NOME}-{CODIGO}-{CPF}-{DATA}...
        // Exemplo: CERT-Fernando-D2-68712920123-20230930-cb3548e0.pdf
        const parts = orfao.nome_arquivo.split('-');
        if (parts.length < 3) {
          console.log(`⚠️  Nome inválido: ${orfao.nome_arquivo} (${parts.length} partes)`);
          continue;
        }

        const codigo = parts[2]; // D2, D1, etc

        console.log(
          `🔍 [RECUPERAR] Documento ${orfao.documento_id} (${orfao.nome_arquivo}) → buscando qual ${codigo}`,
        );

        // Buscar qualificação com:
        // - mesmo funcionario_id
        // - mesmo código
        // - SEM certificado linkado
        // - MAIS RECENTE (ORDER BY id DESC para pegar a última)
        const { results: candidatos } = await db
          .prepare(
            `
            SELECT
              qh.id,
              qh.data_conclusao
            FROM qualificacoes_historico qh
            JOIN funcionarios f
              ON f.id = qh.funcionario_id
             AND f.deleted_at IS NULL
            WHERE qh.funcionario_id = ?
              AND qh.codigo = ?
              AND f.empresa_id = ?
              AND qh.certificado_arquivo_id IS NULL
              AND qh.deleted_at IS NULL
            ORDER BY qh.id DESC
            LIMIT 1
            `,
          )
          .bind(orfao.funcionario_id, codigo, empresaId)
          .all<{ id: number; data_conclusao: string }>();

        if (!candidatos || candidatos.length === 0) {
          console.log(
            `⚠️  Nenhuma qualificação encontrada: func=${orfao.funcionario_id}, codigo=${codigo}`,
          );
          continue;
        }

        const melhorCandidato = candidatos[0];

        console.log(
          `📌 [RECUPERAR] Linkando documento ${orfao.documento_id} → historico ${melhorCandidato.id}`,
        );

        // Linkar!
        await db
          .prepare(
            `UPDATE qualificacoes_historico
             SET certificado_arquivo_id = ?, updated_at = datetime('now')
             WHERE id = ?
               AND funcionario_id = ?
               AND deleted_at IS NULL
               AND EXISTS (
                 SELECT 1
                 FROM funcionarios f
                 WHERE f.id = qualificacoes_historico.funcionario_id
                   AND f.empresa_id = ?
                   AND f.deleted_at IS NULL
               )`,
          )
          .bind(orfao.documento_id, melhorCandidato.id, orfao.funcionario_id, empresaId)
          .run();

        console.log(
          `✅ [RECUPERAR] Linked documento ${orfao.documento_id} → historico ${melhorCandidato.id}`,
        );

        linkedCount++;
      } catch (e) {
        console.error(
          `❌ Erro ao linkar documento ${orfao.documento_id}:`,
          e instanceof Error ? e.message : e,
        );
      }
    }

    console.log(`✅ [RECUPERAR ORFAOS] Recuperados ${linkedCount} certificados`);

    await recordCertificadosAdminOperationAudit(c, {
      action: 'CERTIFICADOS_RECUPERAR_ORFAOS',
      metadata: {
        count: linkedCount,
        approximate_count: orfaos.length,
      },
      legacyPayload: {
        linkedCount,
        orfaosCount: orfaos.length,
        remainingOrfaos: orfaos.length - linkedCount,
      },
    });

    return c.json({
      success: true,
      message: `Recuperados ${linkedCount} certificados`,
      data: {
        linkedCount,
        orfaosCount: orfaos.length,
        remainingOrfaos: orfaos.length - linkedCount,
      },
    });
  } catch (error) {
    console.error('❌ [RECUPERAR ORFAOS] Erro:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao recuperar certificados',
        details: 'Detalhes internos omitidos',
      },
      500,
    );
  }
  },
);

// 🧹 Endpoint para limpar referências órfãs (certificado_arquivo_id apontando para documento inexistente)
opsRouter.post(
  '/limpar-refs-orfas',
  auth(),
  requireControlledAdminOrSupportAccess({
    action: 'CERTIFICADOS_LIMPAR_REFS_ORFAS',
    access: 'mutation',
    entityType: 'certificados_admin_ops',
    module: 'qualificacoes_certificados',
  }),
  async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);

  try {
    console.log('🧹 [LIMPAR REFS] Iniciando limpeza de referências órfãs...');

    // Buscar qualificacoes_historico com certificado_arquivo_id que não existe em documentos
    const { results: refsOrfas } = await db
      .prepare(
        `
        SELECT
          qh.id as historico_id,
          qh.funcionario_id,
          qh.codigo,
          qh.certificado_arquivo_id
        FROM qualificacoes_historico qh
        JOIN funcionarios f
          ON f.id = qh.funcionario_id
         AND f.deleted_at IS NULL
        LEFT JOIN documentos d
          ON d.id = qh.certificado_arquivo_id
         AND d.deleted_at IS NULL
        LEFT JOIN funcionarios fd
          ON fd.id = d.funcionario_id
         AND fd.deleted_at IS NULL
        WHERE qh.certificado_arquivo_id IS NOT NULL
          AND f.empresa_id = ?
          AND qh.deleted_at IS NULL
          AND (
            d.id IS NULL
            OR fd.empresa_id IS NULL
            OR fd.empresa_id != f.empresa_id
          )
        `,
      )
      .bind(empresaId)
      .all<{
        historico_id: number;
        funcionario_id: number;
        codigo: string;
        certificado_arquivo_id: number;
      }>();

    console.log(`📋 Encontradas ${refsOrfas?.length || 0} referências órfãs`);

    if (!refsOrfas || refsOrfas.length === 0) {
      return c.json({
        success: true,
        message: 'Nenhuma referência órfã encontrada',
        data: { cleanedCount: 0, refsCount: 0 },
      });
    }

    let cleanedCount = 0;

    // Limpar cada referência
    for (const ref of refsOrfas) {
      try {
        console.log(
          `🧹 [LIMPAR] Removendo ref órfã: historico ${ref.historico_id} → documento inexistente ${ref.certificado_arquivo_id}`,
        );

        await db
          .prepare(
            `UPDATE qualificacoes_historico
             SET certificado_arquivo_id = NULL, updated_at = datetime('now')
             WHERE id = ?
               AND deleted_at IS NULL
               AND EXISTS (
                 SELECT 1
                 FROM funcionarios f
                 WHERE f.id = qualificacoes_historico.funcionario_id
                   AND f.empresa_id = ?
                   AND f.deleted_at IS NULL
               )`,
          )
          .bind(ref.historico_id, empresaId)
          .run();

        console.log(`✅ [LIMPAR] Limpado historico ${ref.historico_id}`);

        cleanedCount++;
      } catch (e) {
        console.error(
          `❌ Erro ao limpar historico ${ref.historico_id}:`,
          e instanceof Error ? e.message : e,
        );
      }
    }

    console.log(`✅ [LIMPAR REFS] ${cleanedCount} referências órfãs removidas`);

    await recordCertificadosAdminOperationAudit(c, {
      action: 'CERTIFICADOS_LIMPAR_REFS_ORFAS',
      metadata: {
        count: cleanedCount,
        approximate_count: refsOrfas.length,
      },
      legacyPayload: {
        cleanedCount,
        refsCount: refsOrfas.length,
      },
    });

    return c.json({
      success: true,
      message: `${cleanedCount} referências órfãs removidas`,
      data: {
        cleanedCount,
        refsCount: refsOrfas.length,
        details: refsOrfas.map((r) => ({
          historico_id: r.historico_id,
          codigo: r.codigo,
          documento_inexistente: r.certificado_arquivo_id,
        })),
      },
    });
  } catch (error) {
    console.error('❌ [LIMPAR REFS] Erro:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao limpar referências órfãs',
        details: 'Detalhes internos omitidos',
      },
      500,
    );
  }
  },
);

/**
 * POST /historico/export-zip
 * Exporta certificados filtrados como ZIP
 */
opsRouter.post(
  '/historico/export-zip',
  auth(),
  requireControlledAdminOrSupportAccess({
    action: 'CERTIFICADOS_EXPORT_ZIP',
    access: 'sensitive_export',
    entityType: 'certificados_admin_ops',
    module: 'qualificacoes_certificados',
  }),
  async (c) => {
  const db = c.env.DB;
  const bucket = c.env.BUCKET;
  const empresaId = getEmpresaId(c);

  // Obter filtros do body (para não poluir URL com muitos params)
  const body = await c.req.json();
  const {
    search = '',
    status = '',
    funcionario_id = '',
    tipo_id = '',
    aeronave_id = '',
    ids = [], // Array opcional de IDs específicos
  } = body;

  try {
    console.log('[EXPORT ZIP] Iniciando exportação...', { filters: body });

    // Construir query similar ao historico.ts mas join com documentos
    const conditions: string[] = [
      'qh.deleted_at IS NULL',
      'qh.certificado_arquivo_id IS NOT NULL', // Só quem tem certificado
      'd.deleted_at IS NULL', // Documento válido
      'd.r2_key IS NOT NULL',
      'f.empresa_id = ?',
      'f.deleted_at IS NULL',
    ];
    const params: unknown[] = [empresaId];

    // Se forneceu IDs específicos, ignorar outros filtros
    if (ids && ids.length > 0) {
      conditions.push(`qh.id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    } else {
      // Aplicar filtros normais
      if (search) {
        conditions.push(
          '(f.nome LIKE ? OR f.matricula LIKE ? OR qt.nome LIKE ? OR qt.codigo LIKE ?)',
        );
        const pattern = `%${search}%`;
        params.push(pattern, pattern, pattern, pattern);
      }
      if (funcionario_id) {
        conditions.push('qh.funcionario_id = ?');
        params.push(funcionario_id);
      }
      if (tipo_id) {
        conditions.push('qh.qualificacao_id = ?');
        params.push(tipo_id);
      }
      if (aeronave_id) {
        conditions.push('f.modelo_aeronave_id = ?');
        params.push(aeronave_id);
      }

      switch (status) {
        case 'VALIDA':
          conditions.push("qh.data_vencimento >= date('now')");
          break;
        case 'VENCIDA':
          conditions.push("qh.data_vencimento < date('now')");
          break;
        case 'VENCENDO_30':
          conditions.push(
            "qh.data_vencimento >= date('now') AND qh.data_vencimento <= date('now','+30 days')",
          );
          break;
        case 'RENOVADA':
          conditions.push('qh.renovada = 1');
          break;
      }
    }

    const whereClause = conditions.join(' AND ');

    // Query para buscar arquivos
    const query = `
      SELECT
        d.id,
        d.nome_arquivo,
        d.r2_key,
        d.tamanho,
        f.nome as funcionario_nome,
        f.matricula as funcionario_matricula,
        qt.codigo as qualif_codigo
      FROM qualificacoes_historico qh
      JOIN documentos d ON d.id = qh.certificado_arquivo_id
      INNER JOIN funcionarios f ON f.id = qh.funcionario_id
      LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
      WHERE ${whereClause}
      ORDER BY qh.data_vencimento DESC
      LIMIT 50
    `; // Limitando a 50 arquivos por segurança/performance

    const { results } = await db
      .prepare(query)
      .bind(...params)
      .all<{
        id: number;
        nome_arquivo: string;
        r2_key: string;
        tamanho: number;
        funcionario_nome: string;
        funcionario_matricula: string;
        qualif_codigo: string;
      }>();

    if (!results || results.length === 0) {
      return c.json(
        { success: false, error: 'Nenhum certificado encontrado para os filtros' },
        404,
      );
    }

    // Importar fflate dinamicamente
    const { zipSync } = await import('fflate');

    // Objeto para armazenar arquivos do ZIP
    const zipFiles: Record<string, Uint8Array> = {};
    let successCount = 0;

    // Baixar cada certificado
    for (const cert of results) {
      try {
        const obj = await bucket.get(cert.r2_key);
        if (obj) {
          const arrayBuffer = await obj.arrayBuffer();
          // Usar nome legível se possível
          let filename = cert.nome_arquivo;
          if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';

          // Evitar colisão de nomes
          while (zipFiles[filename]) {
            filename = `copy_${filename}`;
          }

          zipFiles[filename] = new Uint8Array(arrayBuffer);
          successCount++;
        }
      } catch (e) {
        console.error(`Erro ao baixar ${cert.r2_key}:`, e);
      }
    }

    if (successCount === 0) {
      return c.json({ success: false, error: 'Falha ao baixar arquivos do storage' }, 500);
    }

    await recordCertificadosAdminOperationAudit(c, {
      action: 'CERTIFICADOS_EXPORT_ZIP',
      metadata: {
        count: successCount,
        approximate_count: results.length,
      },
      legacyPayload: {
        successCount,
        requestedCount: results.length,
        filtersApplied: Array.isArray(ids) && ids.length > 0 ? 'ids' : 'query',
      },
    });

    // Criar ZIP
    const zipped = zipSync(zipFiles, { level: 6 });

    // Retornar via blob/stream
    return new Response(zipped, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="Certificados_Export_${
          new Date().toISOString().split('T')[0]
        }.zip"`,
        'X-Total-Count': successCount.toString(),
      },
    });
  } catch (err) {
    console.error('[EXPORT ZIP] Error:', err);
    return c.json({ success: false, error: 'Erro ao gerar ZIP' }, 500);
  }
  },
);

/**
 * GET /admin/dry-run-inventory
 * Inventário read-only de qualificações com e sem certificado, por empresa e origem.
 * Não gera nenhum certificado.
 */
opsRouter.get(
  '/admin/dry-run-inventory',
  auth(),
  requireControlledAdminOrSupportAccess({
    action: 'CERTIFICADOS_DRY_RUN_INVENTORY',
    access: 'query',
    entityType: 'certificados_admin_ops',
    module: 'qualificacoes_certificados',
  }),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);

    try {
      const hasOrigemTipo = await db
        .prepare(`SELECT COUNT(*) as n FROM pragma_table_info('qualificacoes_historico') WHERE name='origem_tipo'`)
        .first<{ n: number }>();
      const origemCol = hasOrigemTipo?.n ? 'COALESCE(qh.origem_tipo, \'MANUAL\')' : "'MANUAL'";

      const { results: rows } = await db
        .prepare(
          `SELECT
             ${origemCol} AS origem_tipo,
             COUNT(*) AS total,
             SUM(CASE WHEN qh.certificado_arquivo_id IS NOT NULL THEN 1 ELSE 0 END) AS com_certificado,
             SUM(CASE WHEN qh.certificado_arquivo_id IS NULL THEN 1 ELSE 0 END) AS sem_certificado
           FROM qualificacoes_historico qh
           INNER JOIN funcionarios f ON f.id = qh.funcionario_id AND f.deleted_at IS NULL
           WHERE qh.deleted_at IS NULL
             AND f.empresa_id = ?
             AND qh.status NOT IN ('PLANEJADA', 'CANCELADA', 'RENOVADA')
           GROUP BY ${origemCol}
           ORDER BY total DESC`,
        )
        .bind(empresaId)
        .all<{ origem_tipo: string; total: number; com_certificado: number; sem_certificado: number }>();

      const totals = (rows || []).reduce(
        (acc, r) => ({
          total: acc.total + r.total,
          com_certificado: acc.com_certificado + r.com_certificado,
          sem_certificado: acc.sem_certificado + r.sem_certificado,
        }),
        { total: 0, com_certificado: 0, sem_certificado: 0 },
      );

      return c.json({
        success: true,
        data: {
          empresa_id: empresaId,
          totals,
          por_origem: rows || [],
          note: 'Dry-run: nenhum certificado foi gerado. Use /admin/backfill-dry-run para ver IDs específicos.',
        },
      });
    } catch (err) {
      console.error('[DRY-RUN INVENTORY] Error:', err);
      return c.json({ success: false, error: 'Erro ao executar inventário' }, 500);
    }
  },
);

/**
 * POST /admin/backfill-dry-run
 * Lista (sem gerar) os primeiros N registros sem certificado para a empresa.
 * Parâmetro: ?limit=50 (padrão 50, máximo 500)
 */
opsRouter.post(
  '/admin/backfill-dry-run',
  auth(),
  requireControlledAdminOrSupportAccess({
    action: 'CERTIFICADOS_BACKFILL_DRY_RUN',
    access: 'query',
    entityType: 'certificados_admin_ops',
    module: 'qualificacoes_certificados',
  }),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const rawLimit = Number(new URL(c.req.url).searchParams.get('limit') || '50');
    const limit = Math.min(Math.max(1, rawLimit), 500);

    try {
      const { results: rows } = await db
        .prepare(
          `SELECT
             qh.id AS historico_id,
             qh.data_conclusao,
             qh.status,
             f.id AS funcionario_id,
             f.nome AS funcionario_nome,
             qt.codigo AS qualificacao_codigo,
             qt.nome AS qualificacao_nome
           FROM qualificacoes_historico qh
           INNER JOIN funcionarios f ON f.id = qh.funcionario_id AND f.deleted_at IS NULL
           LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
           WHERE qh.deleted_at IS NULL
             AND f.empresa_id = ?
             AND qh.certificado_arquivo_id IS NULL
             AND qh.data_conclusao IS NOT NULL
             AND qh.status NOT IN ('PLANEJADA', 'CANCELADA', 'RENOVADA')
           ORDER BY qh.id DESC
           LIMIT ?`,
        )
        .bind(empresaId, limit)
        .all<{
          historico_id: number;
          data_conclusao: string;
          status: string;
          funcionario_id: number;
          funcionario_nome: string;
          qualificacao_codigo: string;
          qualificacao_nome: string;
        }>();

      return c.json({
        success: true,
        data: {
          empresa_id: empresaId,
          count: rows?.length || 0,
          limit,
          registros: rows || [],
          note: 'Dry-run: nenhum certificado foi gerado. Para executar o backfill, use POST /admin/backfill-apply com autorização explícita.',
        },
      });
    } catch (err) {
      console.error('[BACKFILL DRY-RUN] Error:', err);
      return c.json({ success: false, error: 'Erro ao listar registros para backfill' }, 500);
    }
  },
);

/**
 * POST /admin/backfill-apply
 * Gera certificados em lote para qualificações sem certificado.
 * Requer header X-Backfill-Authorization: CONFIRM_BACKFILL_<empresaId>
 * Processa em lotes de batch_size (padrão 10, máximo 50).
 */
opsRouter.post(
  '/admin/backfill-apply',
  auth(),
  requireControlledAdminOrSupportAccess({
    action: 'CERTIFICADOS_BACKFILL_APPLY',
    access: 'mutation',
    entityType: 'certificados_admin_ops',
    module: 'qualificacoes_certificados',
  }),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);

    // Autorização explícita obrigatória
    const authHeader = c.req.header('X-Backfill-Authorization') || '';
    const expectedToken = `CONFIRM_BACKFILL_${empresaId}`;
    if (authHeader !== expectedToken) {
      return c.json(
        {
          success: false,
          error: `Backfill requer header X-Backfill-Authorization: ${expectedToken}`,
          code: 'EXPLICIT_AUTHORIZATION_REQUIRED',
        },
        403,
      );
    }

    const rawBatch = Number(new URL(c.req.url).searchParams.get('batch_size') || '10');
    const batchSize = Math.min(Math.max(1, rawBatch), 50);
    const rawLimit = Number(new URL(c.req.url).searchParams.get('limit') || '100');
    const limit = Math.min(Math.max(1, rawLimit), 1000);

    try {
      const { results: candidatos } = await db
        .prepare(
          `SELECT qh.id AS historico_id
           FROM qualificacoes_historico qh
           INNER JOIN funcionarios f ON f.id = qh.funcionario_id AND f.deleted_at IS NULL
           WHERE qh.deleted_at IS NULL
             AND f.empresa_id = ?
             AND qh.certificado_arquivo_id IS NULL
             AND qh.data_conclusao IS NOT NULL
             AND qh.status NOT IN ('PLANEJADA', 'CANCELADA', 'RENOVADA')
           ORDER BY qh.id ASC
           LIMIT ?`,
        )
        .bind(empresaId, limit)
        .all<{ historico_id: number }>();

      const ids = (candidatos || []).map((r) => r.historico_id);
      const results: Array<{ historico_id: number; state: string; error?: string }> = [];

      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (hid) => {
            const result = await ensureCertificateForQualification(c.env, hid, empresaId);
            results.push({ historico_id: hid, state: result.state, error: result.error });
          }),
        );
      }

      const summary = results.reduce(
        (acc, r) => {
          acc[r.state] = (acc[r.state] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      await recordCertificadosAdminOperationAudit(c, {
        action: 'BACKFILL_APPLY',
        metadata: { empresa_id: empresaId, processed: ids.length, summary },
      });

      return c.json({
        success: true,
        data: { empresa_id: empresaId, processed: ids.length, summary, results },
      });
    } catch (err) {
      console.error('[BACKFILL APPLY] Error:', err);
      return c.json({ success: false, error: 'Erro ao executar backfill' }, 500);
    }
  },
);

export default opsRouter;
