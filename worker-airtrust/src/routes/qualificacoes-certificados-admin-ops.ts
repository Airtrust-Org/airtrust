/**
 * QUALIFICACOES CERTIFICADOS ADMIN — Operações
 * POST /recuperar-orfaos
 * POST /limpar-refs-orfas
 * POST /historico/export-zip
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';

const opsRouter = new Hono<{ Bindings: Env }>();

// 🔧 Endpoint para recuperar certificados órfãos (não linkados)
opsRouter.post('/recuperar-orfaos', auth(), requireRole('admin'), async (c) => {
  const db = c.env.DB;

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
        WHERE d.deleted_at IS NULL
          AND d.nome_arquivo LIKE 'CERT-%'
          AND d.id NOT IN (
            SELECT certificado_arquivo_id FROM qualificacoes_historico
            WHERE certificado_arquivo_id IS NOT NULL AND deleted_at IS NULL
          )
        ORDER BY d.funcionario_id, d.created_at DESC
        `,
      )
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
            WHERE qh.funcionario_id = ?
              AND qh.codigo = ?
              AND qh.certificado_arquivo_id IS NULL
              AND qh.deleted_at IS NULL
            ORDER BY qh.id DESC
            LIMIT 1
            `,
          )
          .bind(orfao.funcionario_id, codigo)
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
             WHERE id = ?`,
          )
          .bind(orfao.documento_id, melhorCandidato.id)
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
});

// 🧹 Endpoint para limpar referências órfãs (certificado_arquivo_id apontando para documento inexistente)
opsRouter.post('/limpar-refs-orfas', auth(), requireRole('admin'), async (c) => {
  const db = c.env.DB;

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
        WHERE qh.certificado_arquivo_id IS NOT NULL
          AND qh.deleted_at IS NULL
          AND qh.certificado_arquivo_id NOT IN (
            SELECT id FROM documentos WHERE deleted_at IS NULL
          )
        `,
      )
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
             WHERE id = ?`,
          )
          .bind(ref.historico_id)
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
});

/**
 * POST /historico/export-zip
 * Exporta certificados filtrados como ZIP
 */
opsRouter.post('/historico/export-zip', auth(), async (c) => {
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
});


export default opsRouter;
