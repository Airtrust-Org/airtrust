/**
 * ========================================
 * ENDPOINT: AUDITORIA PRÉ-CORREÇÃO
 * GET /api/qualificacoes-historico/auditoria
 * ========================================
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';

const app = new Hono<{ Bindings: Env }>();

app.use('*', auth(), requireRole('admin'));

/**
 * GET /auditoria
 * Executa auditoria completa dos dados antes de correções
 */
app.get('/', async (c) => {
  try {
    const db = c.env.DB;
    const schemaInfo = await db.prepare("PRAGMA table_info('qualificacoes_historico')").all();
    const schemaColumns = new Set(
      (schemaInfo.results || []).map((row) => String((row as { name?: string }).name || '')),
    );
    const hasRenovacaoDe = schemaColumns.has('renovacao_de');
    const hasRenovada = schemaColumns.has('renovada');
    const vinculoExpr = hasRenovacaoDe
      ? 'h.renovacao_de IS NOT NULL'
      : hasRenovada
        ? 'COALESCE(h.renovada, 0) = 1'
        : '0 = 1';
    const vinculoExprSemAlias = hasRenovacaoDe
      ? 'renovacao_de IS NOT NULL'
      : hasRenovada
        ? 'COALESCE(renovada, 0) = 1'
        : '0 = 1';

    const cpfsQuery = c.req.query('cpfs') || '';
    const cpfsFormatados = cpfsQuery
      .split(',')
      .map((cpf) => cpf.trim())
      .filter(Boolean);

    if (cpfsFormatados.length === 0) {
      return c.json(
        {
          success: false,
          error: 'Informe o parâmetro cpfs com lista separada por vírgula',
          code: 'CPFS_REQUIRED',
        },
        400,
      );
    }

    // Remover formatação (só números)
    const cpfsSemFormatacao = cpfsFormatados.map((cpf) => cpf.replace(/[.-]/g, ''));

    // Tentar ambos os formatos
    const cpfs = [...cpfsFormatados, ...cpfsSemFormatacao];

    // Lista de códigos de qualificação do CSV
    const codigos = [
      'B',
      'C',
      'CMA',
      'D1',
      'D2',
      'D3',
      'D4',
      'E1',
      'E2',
      'E3',
      'E4',
      'E5',
      'E6',
      'F1',
      'F2',
      'FAP05.2',
      'FAP06',
      'FAP06SEM',
      'FAP14',
      'G1',
      'G2',
      'H',
      'CHTIFR',
      'IFR',
      'LOFT',
      'NOT',
      'OFEXCRED',
      'OPC',
      'ASO.P',
      'SAEFAP06',
      'SAEFAP14',
      'TIPO',
    ];

    // 1. VERIFICAR FUNCIONÁRIOS
    const { results: funcionarios } = await db
      .prepare(
        `
      SELECT 
        f.cpf,
        f.nome,
        f.codigo_anac,
        CASE 
          WHEN f.deleted_at IS NOT NULL THEN 'DELETADO'
          ELSE 'OK'
        END AS status
      FROM funcionarios f
      WHERE f.cpf IN (${cpfs.map(() => '?').join(',')})
      ORDER BY status DESC, f.cpf
    `,
      )
      .bind(...cpfs)
      .all();

    const cpfsNaoEncontrados = cpfsFormatados.filter((cpf) => {
      const cpfSemFormatacao = cpf.replace(/[.-]/g, '');
      return !funcionarios.find(
        (f) =>
          (f as { cpf: string }).cpf === cpf || (f as { cpf: string }).cpf === cpfSemFormatacao,
      );
    });

    // 2. VERIFICAR QUALIFICAÇÕES
    const { results: qualificacoes } = await db
      .prepare(
        `
      SELECT 
        qt.codigo,
        qt.descricao,
        CASE 
          WHEN qt.deleted_at IS NOT NULL THEN 'DELETADO'
          ELSE 'OK'
        END AS status
      FROM qualificacoes_tipos qt
      WHERE qt.codigo IN (${codigos.map(() => '?').join(',')})
      ORDER BY status DESC, qt.codigo
    `,
      )
      .bind(...codigos)
      .all();

    const codigosNaoEncontrados = codigos.filter(
      (cod) => !qualificacoes.find((q) => (q as { codigo: string }).codigo === cod),
    );

    // 3. VERIFICAR DUPLICATAS
    const { results: duplicatas } = await db
      .prepare(
        `
      SELECT 
        h.funcionario_cpf,
        h.qualificacao_codigo,
        h.data_vencimento,
        COUNT(*) AS total_duplicatas
      FROM qualificacoes_historico h
      WHERE h.deleted_at IS NULL
        AND h.funcionario_cpf IN (${cpfs.map(() => '?').join(',')})
      GROUP BY h.funcionario_cpf, h.qualificacao_codigo, h.data_vencimento
      HAVING COUNT(*) > 1
      ORDER BY total_duplicatas DESC
      LIMIT 50
    `,
      )
      .bind(...cpfs)
      .all();

    // 4. VERIFICAR REGISTROS VENCIDOS
    const { results: vencidos } = await db
      .prepare(
        `
      SELECT 
        h.funcionario_cpf,
        h.qualificacao_codigo,
        h.data_vencimento,
        CAST((julianday('now') - julianday(h.data_vencimento)) AS INTEGER) AS dias_vencido
      FROM qualificacoes_historico h
      WHERE h.deleted_at IS NULL
        AND h.data_vencimento < date('now')
        AND h.funcionario_cpf IN (${cpfs.map(() => '?').join(',')})
      ORDER BY dias_vencido DESC
      LIMIT 30
    `,
      )
      .bind(...cpfs)
      .all();

    // 5. CANDIDATOS A RENOVAÇÃO
    const { results: candidatosRenovacao } = await db
      .prepare(
        `
      SELECT 
        h.funcionario_cpf,
        h.qualificacao_codigo,
        COUNT(*) AS total_registros,
        SUM(CASE WHEN ${vinculoExpr} THEN 1 ELSE 0 END) AS registros_com_vinculo
      FROM qualificacoes_historico h
      WHERE h.deleted_at IS NULL
        AND h.funcionario_cpf IN (${cpfs.map(() => '?').join(',')})
      GROUP BY h.funcionario_cpf, h.qualificacao_codigo
      HAVING total_registros > 1
      ORDER BY total_registros DESC
      LIMIT 50
    `,
      )
      .bind(...cpfs)
      .all();

    // 6. RESUMO GERAL
    const resumoQuery = await db
      .prepare(
        `
      SELECT 
        (SELECT COUNT(*) FROM funcionarios WHERE deleted_at IS NULL AND ativo = 1) AS total_funcionarios,
        (SELECT COUNT(*) FROM qualificacoes_tipos WHERE deleted_at IS NULL) AS total_qualificacoes,
        (SELECT COUNT(*) FROM qualificacoes_historico WHERE deleted_at IS NULL) AS total_historico,
        (SELECT COUNT(*) FROM qualificacoes_historico WHERE deleted_at IS NULL AND ${vinculoExprSemAlias}) AS historico_com_vinculo
    `,
      )
      .first();

    const resumo = resumoQuery || {
      total_funcionarios: 0,
      total_qualificacoes: 0,
      total_historico: 0,
      historico_com_vinculo: 0,
    };

    return c.json({
      success: true,
      data: {
        funcionarios: {
          total_csv: cpfsFormatados.length,
          encontrados: funcionarios,
          nao_encontrados: cpfsNaoEncontrados,
          total_encontrados: funcionarios.length,
          total_nao_encontrados: cpfsNaoEncontrados.length,
        },
        qualificacoes: {
          total_csv: codigos.length,
          encontrados: qualificacoes,
          nao_encontrados: codigosNaoEncontrados,
          total_encontrados: qualificacoes.length,
          total_nao_encontrados: codigosNaoEncontrados.length,
        },
        duplicatas: {
          total: duplicatas.length,
          registros: duplicatas,
        },
        vencidos: {
          total: vencidos.length,
          registros: vencidos,
        },
        candidatos_renovacao: {
          total: candidatosRenovacao.length,
          registros: candidatosRenovacao,
        },
        resumo_geral: resumo,
      },
    });
  } catch (error) {
    console.error('[AUDITORIA] Erro:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao executar auditoria',
        details: 'Detalhes internos omitidos',
      },
      500,
    );
  }
});

export default app;
