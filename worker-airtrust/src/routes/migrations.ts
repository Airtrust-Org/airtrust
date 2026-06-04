import { Hono } from 'hono';
import { Env } from '../types';

const app = new Hono<{ Bindings: Env }>();

/**
 * POST /api/migrations/fix-integer-ids
 * Executa migração para converter TEXT IDs → INTEGER IDs
 * CRÍTICO: Preserva todos os dados e relações
 * Disabled by default — set ENABLE_MANUAL_MIGRATIONS=true in .dev.vars only.
 */
app.post('/fix-integer-ids', async (c) => {
  if (c.env.ENABLE_MANUAL_MIGRATIONS !== 'true') {
    return c.json(
      {
        success: false,
        error:
          'Migration endpoints are disabled. Set ENABLE_MANUAL_MIGRATIONS=true in .dev.vars to enable in local environments only.',
      },
      403,
    );
  }
  const db = c.env.DB;

  try {
    console.log('[MIGRATION] 🔧 Iniciando conversão TEXT→INTEGER IDs...');

    // FASE 1: Criar tabela de mapeamento
    await db
      .prepare(
        `
      CREATE TABLE IF NOT EXISTS qualificacoes_tipos_id_map (
        old_id TEXT PRIMARY KEY,
        new_id INTEGER NOT NULL,
        codigo TEXT NOT NULL
      )
    `,
      )
      .run();

    // FASE 2: Backup
    await db
      .prepare(
        `
      DROP TABLE IF EXISTS qualificacoes_tipos_backup_20251128
    `,
      )
      .run();

    await db
      .prepare(
        `
      CREATE TABLE qualificacoes_tipos_backup_20251128 AS 
      SELECT * FROM qualificacoes_tipos
    `,
      )
      .run();

    const backupCount = (await db
      .prepare(
        `
      SELECT COUNT(*) as count FROM qualificacoes_tipos_backup_20251128
    `,
      )
      .first()) as { count: number };

    console.log(`[MIGRATION] ✅ Backup criado: ${backupCount.count} registros`);

    // FASE 3: Criar nova tabela com INTEGER
    await db.prepare(`DROP TABLE IF EXISTS qualificacoes_tipos_new`).run();

    await db
      .prepare(
        `
      CREATE TABLE qualificacoes_tipos_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT,
        codigo TEXT NOT NULL UNIQUE COLLATE NOCASE,
        nome TEXT NOT NULL CHECK(length(trim(nome)) >= 3),
        descricao TEXT,
        categoria TEXT,
        carga_horaria REAL CHECK(carga_horaria IS NULL OR carga_horaria > 0),
        validade INTEGER CHECK(validade IS NULL OR validade > 0),
        vencimento_fim_mes INTEGER DEFAULT 0 CHECK(vencimento_fim_mes IN (0, 1)),
        observacoes TEXT,
        ativo INTEGER DEFAULT 1 CHECK(ativo IN (0, 1)),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME DEFAULT NULL
      )
    `,
      )
      .run();

    // FASE 4: Migrar dados
    await db
      .prepare(
        `
      INSERT INTO qualificacoes_tipos_new (
        tipo, codigo, nome, descricao, categoria, 
        carga_horaria, validade, vencimento_fim_mes, 
        observacoes, ativo, created_at, updated_at, deleted_at
      )
      SELECT 
        tipo, codigo, nome, descricao, categoria,
        carga_horaria, validade, vencimento_fim_mes,
        observacoes, ativo, created_at, updated_at, deleted_at
      FROM qualificacoes_tipos
      ORDER BY created_at ASC
    `,
      )
      .run();

    const newCount = (await db
      .prepare(
        `
      SELECT COUNT(*) as count FROM qualificacoes_tipos_new
    `,
      )
      .first()) as { count: number };

    console.log(`[MIGRATION] ✅ Dados migrados: ${newCount.count} registros`);

    // FASE 5: Popular mapeamento
    await db
      .prepare(
        `
      INSERT INTO qualificacoes_tipos_id_map (old_id, new_id, codigo)
      SELECT 
        old.id as old_id,
        new.id as new_id,
        old.codigo as codigo
      FROM qualificacoes_tipos_backup_20251128 old
      INNER JOIN qualificacoes_tipos_new new ON UPPER(old.codigo) = UPPER(new.codigo)
    `,
      )
      .run();

    const mapCount = (await db
      .prepare(
        `
      SELECT COUNT(*) as count FROM qualificacoes_tipos_id_map
    `,
      )
      .first()) as { count: number };

    console.log(`[MIGRATION] ✅ Mapeamento criado: ${mapCount.count} registros`);

    // FASE 6: Substituir tabela
    await db.prepare(`DROP TABLE qualificacoes_tipos`).run();
    await db.prepare(`ALTER TABLE qualificacoes_tipos_new RENAME TO qualificacoes_tipos`).run();

    // FASE 7: Recriar índices
    await db
      .prepare(
        `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_qualificacoes_tipos_codigo 
      ON qualificacoes_tipos(codigo) WHERE deleted_at IS NULL
    `,
      )
      .run();

    await db
      .prepare(
        `
      CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_nome 
      ON qualificacoes_tipos(nome) WHERE deleted_at IS NULL
    `,
      )
      .run();

    await db
      .prepare(
        `
      CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_categoria 
      ON qualificacoes_tipos(categoria) WHERE deleted_at IS NULL
    `,
      )
      .run();

    // FASE 8: Atualizar qualificacoes_historico
    const updateResult = await db
      .prepare(
        `
      UPDATE qualificacoes_historico
      SET qualificacao_id = (
        SELECT new_id 
        FROM qualificacoes_tipos_id_map 
        WHERE UPPER(qualificacoes_tipos_id_map.codigo) = UPPER(qualificacoes_historico.qualificacao_codigo)
        LIMIT 1
      )
      WHERE qualificacao_codigo IS NOT NULL
      AND deleted_at IS NULL
    `,
      )
      .run();

    console.log(`[MIGRATION] ✅ Histórico atualizado: ${updateResult.meta.changes} registros`);

    // FASE 9: Criar índice composto
    await db
      .prepare(
        `
      CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_fk_ids 
      ON qualificacoes_historico(funcionario_id, qualificacao_id)
      WHERE deleted_at IS NULL
    `,
      )
      .run();

    // FASE 10: Recriar view
    await db.prepare(`DROP VIEW IF EXISTS qualificacoes_historico_v`).run();

    await db
      .prepare(
        `
      CREATE VIEW qualificacoes_historico_v AS
      SELECT 
        qh.id,
        qh.funcionario_id,
        qh.qualificacao_id,
        qh.data_conclusao,
        qh.data_vencimento,
        f.nome AS funcionario_nome,
        f.cpf AS funcionario_cpf,
        qt.codigo AS qualificacao_codigo,
        qt.nome AS qualificacao_nome,
        qt.categoria AS qualificacao_categoria
      FROM qualificacoes_historico qh
      INNER JOIN funcionarios f ON qh.funcionario_id = f.id AND f.deleted_at IS NULL
      INNER JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id AND qt.deleted_at IS NULL
      WHERE qh.deleted_at IS NULL
    `,
      )
      .run();

    // Validações finais
    const validations = (await db
      .prepare(
        `
      SELECT 
        (SELECT COUNT(*) FROM qualificacoes_tipos) as tipos_count,
        (SELECT COUNT(*) FROM qualificacoes_historico WHERE qualificacao_id IS NOT NULL) as historico_com_id,
        (SELECT COUNT(*) FROM qualificacoes_historico WHERE qualificacao_id IS NULL) as historico_sem_id
    `,
      )
      .first()) as {
      tipos_count: number;
      historico_com_id: number;
      historico_sem_id: number;
    };

    return c.json({
      success: true,
      message: 'Migração TEXT→INTEGER IDs concluída com sucesso',
      data: {
        backup_count: backupCount.count,
        migrated_count: newCount.count,
        map_count: mapCount.count,
        historico_updated: updateResult.meta.changes,
        validations,
      },
    });
  } catch (error) {
    console.error('[MIGRATION] ❌ Erro:', error);
    return c.json(
      {
        success: false,
        error: 'Erro na migração',
        details: 'Detalhes internos omitidos',
      },
      500,
    );
  }
});

/**
 * GET /api/migrations/validate-ids
 * Valida se os IDs foram corretamente populados
 */
app.get('/validate-ids', async (c) => {
  const db = c.env.DB;

  try {
    // Testar diretamente no banco
    const sample = await db
      .prepare(
        `
      SELECT 
        qh.id,
        qh.qualificacao_id,
        qh.qualificacao_codigo,
        qt.id as tipo_id,
        qt.nome as tipo_nome,
        qt.codigo as tipo_codigo
      FROM qualificacoes_historico qh
      LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id
      WHERE qh.deleted_at IS NULL
      LIMIT 10
    `,
      )
      .all();

    const stats = await db
      .prepare(
        `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN qualificacao_id IS NOT NULL THEN 1 ELSE 0 END) as com_id,
        SUM(CASE WHEN qualificacao_id IS NULL THEN 1 ELSE 0 END) as sem_id,
        typeof(qualificacao_id) as tipo_qualificacao_id
      FROM qualificacoes_historico 
      WHERE deleted_at IS NULL
      LIMIT 1
    `,
      )
      .first();

    const tipoStats = await db
      .prepare(
        `
      SELECT 
        COUNT(*) as total,
        typeof(id) as tipo_id
      FROM qualificacoes_tipos
      LIMIT 1
    `,
      )
      .first();

    return c.json({
      success: true,
      data: {
        sample: sample.results,
        stats,
        tipoStats,
      },
    });
  } catch (error) {
    console.error('[VALIDATE] Erro:', error);
    return c.json(
      {
        success: false,
        error: 'Erro na validação',
        details: 'Detalhes internos omitidos',
      },
      500,
    );
  }
});

export default app;
