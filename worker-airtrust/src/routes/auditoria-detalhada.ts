import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getTenantContext } from '../middleware/tenant';

const app = new Hono<{ Bindings: Env }>();

app.use('*', auth(), requireRole('admin'));

/**
 * GET /api/qualificacoes-historico/auditoria-detalhada
 * Retorna detalhes completos das discrepâncias com nomes de funcionários e qualificações
 */
app.get('/', async (c) => {
  try {
    const db = c.env.DB;
    const { empresaId } = getTenantContext(c);
    const schemaInfo = await db.prepare("PRAGMA table_info('qualificacoes_historico')").all();
    const schemaColumns = new Set(
      (schemaInfo.results || []).map((row) => String((row as { name?: string }).name || '')),
    );
    const hasRenovacaoDe = schemaColumns.has('renovacao_de');
    const hasRenovada = schemaColumns.has('renovada');
    const vinculoExpr = hasRenovacaoDe
      ? 'qh.renovacao_de IS NOT NULL'
      : hasRenovada
        ? 'COALESCE(qh.renovada, 0) = 1'
        : '0 = 1';

    // 1. DUPLICATAS - Com nomes completos
    const duplicatasQuery = `
      WITH duplicatas_grouped AS (
        SELECT
          f.cpf,
          f.nome as funcionario_nome,
          q.codigo,
          q.nome as qualificacao_nome,
          qh.data_vencimento,
          COUNT(*) as total
        FROM qualificacoes_historico qh
        JOIN funcionarios f ON f.id = qh.funcionario_id
        JOIN qualificacoes q ON q.id = qh.qualificacao_id
        WHERE qh.deleted_at IS NULL
          AND f.deleted_at IS NULL
          AND f.empresa_id = ?
          AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
          AND q.deleted_at IS NULL
        GROUP BY f.cpf, f.nome, q.codigo, q.nome, qh.data_vencimento
        HAVING COUNT(*) > 1
      )
      SELECT
        cpf as funcionario_cpf,
        funcionario_nome,
        codigo as qualificacao_codigo,
        qualificacao_nome,
        data_vencimento,
        total as total_duplicatas
      FROM duplicatas_grouped
      ORDER BY funcionario_cpf, qualificacao_codigo;
    `;

    // 2. VENCIDOS - Com nomes completos
    const vencidosQuery = `
      SELECT
        f.cpf as funcionario_cpf,
        f.nome as funcionario_nome,
        q.codigo as qualificacao_codigo,
        q.nome as qualificacao_nome,
        qh.data_vencimento,
        qh.data_conclusao,
        julianday('now') - julianday(qh.data_vencimento) as dias_vencido
      FROM qualificacoes_historico qh
      JOIN funcionarios f ON f.id = qh.funcionario_id
      JOIN qualificacoes q ON q.id = qh.qualificacao_id
      WHERE qh.deleted_at IS NULL
        AND f.deleted_at IS NULL
        AND f.empresa_id = ?
        AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
        AND q.deleted_at IS NULL
        AND qh.data_vencimento < date('now')
      ORDER BY dias_vencido DESC;
    `;

    // 3. CANDIDATOS RENOVAÇÃO - Com nomes completos
    const candidatosQuery = `
      WITH registros_por_qualif AS (
        SELECT
          f.cpf,
          f.nome as funcionario_nome,
          q.codigo,
          q.nome as qualificacao_nome,
          COUNT(*) as total_registros,
          SUM(CASE WHEN ${vinculoExpr} THEN 1 ELSE 0 END) as registros_com_vinculo
        FROM qualificacoes_historico qh
        JOIN funcionarios f ON f.id = qh.funcionario_id
        JOIN qualificacoes q ON q.id = qh.qualificacao_id
        WHERE qh.deleted_at IS NULL
          AND f.deleted_at IS NULL
          AND f.empresa_id = ?
          AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
          AND q.deleted_at IS NULL
        GROUP BY f.cpf, f.nome, q.codigo, q.nome
        HAVING COUNT(*) > 1
      )
      SELECT
        cpf as funcionario_cpf,
        funcionario_nome,
        codigo as qualificacao_codigo,
        qualificacao_nome,
        total_registros,
        registros_com_vinculo
      FROM registros_por_qualif
      WHERE registros_com_vinculo = 0
      ORDER BY funcionario_cpf, qualificacao_codigo;
    `;

    const [duplicatas, vencidos, candidatos] = await Promise.all([
      db.prepare(duplicatasQuery).bind(empresaId).all(),
      db.prepare(vencidosQuery).bind(empresaId).all(),
      db.prepare(candidatosQuery).bind(empresaId).all(),
    ]);

    return c.json({
      success: true,
      data: {
        duplicatas: {
          total: duplicatas.results?.length || 0,
          registros: duplicatas.results || [],
        },
        vencidos: {
          total: vencidos.results?.length || 0,
          registros: vencidos.results || [],
        },
        candidatos_renovacao: {
          total: candidatos.results?.length || 0,
          registros: candidatos.results || [],
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('Erro na auditoria detalhada:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao executar auditoria detalhada',
      },
      500,
    );
  }
});

export default app;
