/**
 * AUTO-MIGRATION: Criar tabela documentos se não existir
 * Executado automaticamente no startup do worker
 */

import type { D1Database } from '@cloudflare/workers-types';

export async function ensureDocumentosTableExists(db: D1Database): Promise<void> {
  try {
    console.log('[AUTO-MIGRATION] Verificando tabela documentos...');

    // Verificar se tabela existe
    const tableCheck = await db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='documentos'")
      .first();

    if (tableCheck) {
      console.log('[AUTO-MIGRATION] ✅ Tabela documentos já existe');
      return;
    }

    console.warn('[AUTO-MIGRATION] ⚠️  Tabela documentos não existe - criando...');

    // Criar tabela documentos
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS documentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT NOT NULL UNIQUE,
        funcionario_id INTEGER NOT NULL,
        historico_id INTEGER,
        nome_arquivo TEXT NOT NULL,
        tipo TEXT NOT NULL,
        tamanho INTEGER NOT NULL,
        r2_key TEXT NOT NULL UNIQUE,
        descricao TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT,
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
        FOREIGN KEY (historico_id) REFERENCES qualificacoes_historico(id)
      )`,
      )
      .run();

    console.log('[AUTO-MIGRATION] ✅ Tabela documentos criada');

    // Criar índices
    await db.batch([
      db.prepare(
        'CREATE INDEX IF NOT EXISTS idx_documentos_funcionario ON documentos(funcionario_id)',
      ),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_documentos_historico ON documentos(historico_id)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_documentos_deleted ON documentos(deleted_at)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_documentos_r2_key ON documentos(r2_key)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_documentos_uuid ON documentos(uuid)'),
    ]);

    console.log('[AUTO-MIGRATION] ✅ Índices criados');
    console.log('[AUTO-MIGRATION] 🎉 Tabela documentos configurada com sucesso!');
  } catch (error) {
    console.error('[AUTO-MIGRATION] ❌ Erro ao criar tabela documentos:', error);
    // Não lançar erro - continuar execução do worker
  }
}
