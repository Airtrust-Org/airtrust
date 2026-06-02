/**
 * ENDPOINT ADMIN TEMPORÁRIO - Aplicar Migration 0133
 *
 * DELETE APÓS USO!
 *
 * Para executar:
 * curl -X POST https://airtrust-api-production.airtrust.workers.dev/admin/apply-migration-0133
 */

import { Hono } from 'hono';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env }>();

app.post('/apply-migration-0133', async (c) => {
  const db = c.env.DB;

  try {
    await db.exec('PRAGMA foreign_keys=OFF');

    // 1. PASTA_VIRTUAL
    await db.exec(`
      CREATE TABLE IF NOT EXISTS pasta_virtual_backup AS SELECT * FROM pasta_virtual
    `);

    await db.exec(`
      CREATE TABLE pasta_virtual_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        tipo_documento TEXT NOT NULL,
        categoria TEXT,
        caminho_arquivo TEXT,
        arquivourl TEXT,
        nome_arquivo TEXT,
        nomeoriginal TEXT,
        arquivo_tamanho INTEGER,
        tamanho INTEGER,
        dataupload TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        uploadedby INTEGER,
        certificacao_id INTEGER,
        descricao TEXT,
        deleted_at TEXT,
        FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
      )
    `);

    await db.exec(`INSERT INTO pasta_virtual_new SELECT * FROM pasta_virtual`);
    await db.exec(`DROP TABLE pasta_virtual`);
    await db.exec(`ALTER TABLE pasta_virtual_new RENAME TO pasta_virtual`);

    await db.exec(
      `CREATE INDEX IF NOT EXISTS idx_pasta_virtual_funcionario ON pasta_virtual(funcionario_id)`,
    );
    await db.exec(
      `CREATE INDEX IF NOT EXISTS idx_pasta_virtual_deleted ON pasta_virtual(deleted_at)`,
    );

    // 2. AVALIACOES_MANOBRAS
    await db.exec(`
      CREATE TABLE IF NOT EXISTS avaliacoes_manobras_backup AS SELECT * FROM avaliacoes_manobras
    `);

    await db.exec(`
      CREATE TABLE avaliacoes_manobras_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE NOT NULL,
        ficha_uuid TEXT NOT NULL,
        participante_id INTEGER NOT NULL,
        manobra_id INTEGER NOT NULL,
        manobra_codigo TEXT NOT NULL,
        manobra_nome TEXT NOT NULL,
        nota_atual REAL NOT NULL CHECK(nota_atual >= 0 AND nota_atual <= 10),
        observacoes TEXT,
        avaliador_id INTEGER NOT NULL,
        data_avaliacao TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        FOREIGN KEY (ficha_uuid) REFERENCES fichas_sessao(uuid) ON DELETE CASCADE,
        FOREIGN KEY (participante_id) REFERENCES funcionarios(id) ON DELETE CASCADE,
        FOREIGN KEY (manobra_id) REFERENCES manobras(id) ON DELETE CASCADE,
        FOREIGN KEY (avaliador_id) REFERENCES funcionarios(id) ON DELETE CASCADE
      )
    `);

    await db.exec(`INSERT INTO avaliacoes_manobras_new SELECT * FROM avaliacoes_manobras`);
    await db.exec(`DROP TABLE avaliacoes_manobras`);
    await db.exec(`ALTER TABLE avaliacoes_manobras_new RENAME TO avaliacoes_manobras`);

    await db.exec(
      `CREATE INDEX IF NOT EXISTS idx_avaliacoes_ficha ON avaliacoes_manobras(ficha_uuid)`,
    );
    await db.exec(
      `CREATE INDEX IF NOT EXISTS idx_avaliacoes_participante ON avaliacoes_manobras(participante_id)`,
    );
    await db.exec(
      `CREATE INDEX IF NOT EXISTS idx_avaliacoes_avaliador ON avaliacoes_manobras(avaliador_id)`,
    );

    await db.exec('PRAGMA foreign_keys=ON');

    return c.json({
      success: true,
      message: 'Migration 0133 aplicada com sucesso!',
    });
  } catch (error) {
    console.error('Erro ao aplicar migration:', error);
    return c.json(
      {
        success: false,
        error: 'Erro interno do servidor',
      },
      500,
    );
  }
});

export default app;
