import { Hono } from 'hono';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env }>();

app.post('/apply-migration-0133', async (c) => {
  const db = c.env.DB;

  try {
    console.log('[MIGRATION-0133] Iniciando correção de FKs...');

    const tables = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('pasta_virtual', 'avaliacoes_manobras')",
      )
      .all();
    const existingTables = new Set(
      tables.results?.map((t: Record<string, unknown>) => String(t.name)) || [],
    );

    console.log('[MIGRATION-0133] Tabelas encontradas:', Array.from(existingTables));

    if (existingTables.has('pasta_virtual')) {
      console.log('[MIGRATION-0133] Corrigindo pasta_virtual...');

      const pvStatements = [
        'PRAGMA foreign_keys=OFF',
        'CREATE TABLE IF NOT EXISTS pasta_virtual_backup AS SELECT * FROM pasta_virtual',
        `CREATE TABLE pasta_virtual_new (
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
        )`,
        'INSERT INTO pasta_virtual_new SELECT * FROM pasta_virtual',
        'DROP TABLE pasta_virtual',
        'ALTER TABLE pasta_virtual_new RENAME TO pasta_virtual',
        'CREATE INDEX IF NOT EXISTS idx_pasta_virtual_funcionario ON pasta_virtual(funcionario_id)',
        'CREATE INDEX IF NOT EXISTS idx_pasta_virtual_deleted ON pasta_virtual(deleted_at)',
        'PRAGMA foreign_keys=ON',
      ];

      await db.batch(pvStatements.map((sql) => db.prepare(sql)));
      console.log('[MIGRATION-0133] ✅ pasta_virtual corrigida');
    }

    if (existingTables.has('avaliacoes_manobras')) {
      console.log('[MIGRATION-0133] Corrigindo avaliacoes_manobras...');

      const amStatements = [
        'PRAGMA foreign_keys=OFF',
        'CREATE TABLE IF NOT EXISTS avaliacoes_manobras_backup AS SELECT * FROM avaliacoes_manobras',
        `CREATE TABLE avaliacoes_manobras_new (
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
        )`,
        'INSERT INTO avaliacoes_manobras_new SELECT * FROM avaliacoes_manobras',
        'DROP TABLE avaliacoes_manobras',
        'ALTER TABLE avaliacoes_manobras_new RENAME TO avaliacoes_manobras',
        'CREATE INDEX IF NOT EXISTS idx_avaliacoes_ficha ON avaliacoes_manobras(ficha_uuid)',
        'CREATE INDEX IF NOT EXISTS idx_avaliacoes_participante ON avaliacoes_manobras(participante_id)',
        'CREATE INDEX IF NOT EXISTS idx_avaliacoes_avaliador ON avaliacoes_manobras(avaliador_id)',
        'PRAGMA foreign_keys=ON',
      ];

      await db.batch(amStatements.map((sql) => db.prepare(sql)));
      console.log('[MIGRATION-0133] ✅ avaliacoes_manobras corrigida');
    }

    console.log('[MIGRATION-0133] ✅ Correção concluída!');

    return c.json({
      success: true,
      message: `Migration 0133 aplicada! Tabelas corrigidas: ${Array.from(existingTables).join(', ')}`,
      tables: Array.from(existingTables),
    });
  } catch (error) {
    console.error('[MIGRATION-0133] ❌ Erro:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      500,
    );
  }
});

app.post('/apply-migration-0134', async (c) => {
  const db = c.env.DB;

  try {
    console.log('[MIGRATION-0134] Iniciando fix NUCLEAR para funcionarios_old...');

    const statements = [
      'PRAGMA foreign_keys=OFF',
      'DROP TABLE IF EXISTS pasta_virtual_temp',
      'CREATE TABLE pasta_virtual_temp AS SELECT * FROM pasta_virtual',
      'DROP TABLE IF EXISTS pasta_virtual',
      `CREATE TABLE pasta_virtual (
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
      )`,
      'INSERT INTO pasta_virtual SELECT * FROM pasta_virtual_temp',
      'DROP TABLE pasta_virtual_temp',
      'CREATE INDEX IF NOT EXISTS idx_pasta_virtual_funcionario ON pasta_virtual(funcionario_id)',
      'CREATE INDEX IF NOT EXISTS idx_pasta_virtual_deleted ON pasta_virtual(deleted_at)',
    ];

    const checkAM = await db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='avaliacoes_manobras'")
      .first();

    if (checkAM) {
      statements.push('DROP TABLE IF EXISTS avaliacoes_manobras_temp');
      statements.push('CREATE TABLE avaliacoes_manobras_temp AS SELECT * FROM avaliacoes_manobras');
      statements.push('DROP TABLE IF EXISTS avaliacoes_manobras');
      statements.push(`CREATE TABLE avaliacoes_manobras (
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
      )`);
      statements.push('INSERT INTO avaliacoes_manobras SELECT * FROM avaliacoes_manobras_temp');
      statements.push('DROP TABLE avaliacoes_manobras_temp');
      statements.push(
        'CREATE INDEX IF NOT EXISTS idx_avaliacoes_ficha ON avaliacoes_manobras(ficha_uuid)',
      );
      statements.push(
        'CREATE INDEX IF NOT EXISTS idx_avaliacoes_participante ON avaliacoes_manobras(participante_id)',
      );
      statements.push(
        'CREATE INDEX IF NOT EXISTS idx_avaliacoes_avaliador ON avaliacoes_manobras(avaliador_id)',
      );
    }

    statements.push('PRAGMA foreign_keys=ON');

    await db.batch(statements.map((sql) => db.prepare(sql)));

    console.log('[MIGRATION-0134] ✅ Fix NUCLEAR concluído!');

    return c.json({
      success: true,
      message: 'Migration 0134 aplicada! Todas as FK para funcionarios_old foram removidas.',
    });
  } catch (error) {
    console.error('[MIGRATION-0134] ❌ Erro:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      500,
    );
  }
});

app.post('/apply-migration-0135', async (c) => {
  const db = c.env.DB;

  try {
    console.log('[MIGRATION-0135] Removendo todos os triggers...');

    const triggerStatements = [
      'PRAGMA foreign_keys=OFF',
      'DROP TRIGGER IF EXISTS trg_funcionarios_audit',
      'DROP TRIGGER IF EXISTS trg_funcionarios_update_timestamp',
      'DROP TRIGGER IF EXISTS trg_pasta_virtual_timestamp',
      'DROP TRIGGER IF EXISTS trg_pasta_virtual_validate_fk',
      'DROP TRIGGER IF EXISTS trg_avaliacoes_timestamp',
      'DROP TRIGGER IF EXISTS update_pasta_virtual_timestamp',
      'DROP TRIGGER IF EXISTS insert_pasta_virtual_timestamp',
      'DROP TRIGGER IF EXISTS trg_funcionarios_old_cleanup',
      'DROP TRIGGER IF EXISTS trg_any_audit_insert',
      'DROP TRIGGER IF EXISTS trg_any_audit_update',
      'DROP TRIGGER IF EXISTS trg_any_audit_delete',
      'PRAGMA foreign_keys=ON',
    ];

    await db.batch(triggerStatements.map((sql) => db.prepare(sql)));

    console.log('[MIGRATION-0135] ✅ Todos os triggers removidos!');

    return c.json({
      success: true,
      message: 'Migration 0135 aplicada! Todos os triggers removidos.',
    });
  } catch (error) {
    console.error('[MIGRATION-0135] ❌ Erro:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      500,
    );
  }
});

app.get('/debug-funcionarios-old', async (c) => {
  const db = c.env.DB;

  try {
    const tables = await db
      .prepare(
        "SELECT type, name, sql FROM sqlite_master WHERE type IN ('table', 'view', 'trigger', 'index') ORDER BY type, name",
      )
      .all();

    const suspect =
      tables.results?.filter(
        (row: any) => row.sql && String(row.sql).toLowerCase().includes('funcionarios_old'),
      ) || [];

    const checkTable = await db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='funcionarios_old'")
      .first();

    return c.json({
      success: true,
      funcionarios_old_table_exists: !!checkTable,
      total_objects: tables.results?.length || 0,
      suspect_objects: suspect,
      all_tables: tables.results
        ?.filter((row: any) => row.type === 'table')
        .map((row: any) => row.name),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      500,
    );
  }
});

app.post('/apply-migration-0136', async (c) => {
  const db = c.env.DB;

  try {
    console.log('[MIGRATION-0136] Reconstruindo 12 tabelas com FKs corretas...');

    const statements = [
      'PRAGMA foreign_keys=OFF',
      'DROP TABLE IF EXISTS alertas_enviados_backup',
      'CREATE TABLE alertas_enviados_backup AS SELECT * FROM alertas_enviados',
      'DROP TABLE alertas_enviados',
      `CREATE TABLE alertas_enviados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT NOT NULL,
        funcionario_id INTEGER NOT NULL,
        qualificacao_id INTEGER,
        data_envio TEXT DEFAULT (datetime('now')),
        destinatario TEXT,
        status TEXT DEFAULT 'ENVIADO',
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      )`,
      'INSERT INTO alertas_enviados SELECT * FROM alertas_enviados_backup',
      'DROP TABLE alertas_enviados_backup',
      'DROP TABLE IF EXISTS arquivos_backup',
      'CREATE TABLE arquivos_backup AS SELECT * FROM arquivos',
      'DROP TABLE arquivos',
      `CREATE TABLE arquivos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        nome_original TEXT NOT NULL,
        nome_arquivo TEXT NOT NULL,
        categoria TEXT DEFAULT 'geral',
        tamanho INTEGER,
        tipo TEXT,
        url_r2 TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT,
        deleted_at TEXT,
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      )`,
      'INSERT INTO arquivos SELECT * FROM arquivos_backup',
      'DROP TABLE arquivos_backup',
      'DROP TABLE IF EXISTS compliance_status_backup',
      'CREATE TABLE compliance_status_backup AS SELECT * FROM compliance_status',
      'DROP TABLE compliance_status',
      `CREATE TABLE compliance_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        data_avaliacao TEXT NOT NULL,
        status TEXT CHECK(status IN ('COMPLIANT', 'NON_COMPLIANT', 'PENDING')) NOT NULL,
        detalhes TEXT,
        avaliado_por TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      )`,
      'INSERT INTO compliance_status SELECT * FROM compliance_status_backup',
      'DROP TABLE compliance_status_backup',
      'DROP TABLE IF EXISTS consentimentos_lgpd_backup',
      'CREATE TABLE consentimentos_lgpd_backup AS SELECT * FROM consentimentos_lgpd',
      'DROP TABLE consentimentos_lgpd',
      `CREATE TABLE consentimentos_lgpd (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        tipo TEXT NOT NULL CHECK(tipo IN ('coleta_dados', 'uso_imagem', 'compartilhamento', 'tratamento_dados')),
        aceito INTEGER NOT NULL DEFAULT 0,
        data_aceite TEXT,
        ip_aceite TEXT,
        user_agent TEXT,
        revogado INTEGER DEFAULT 0,
        data_revogacao TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      )`,
      'INSERT INTO consentimentos_lgpd SELECT * FROM consentimentos_lgpd_backup',
      'DROP TABLE consentimentos_lgpd_backup',
      'DROP TABLE IF EXISTS documentos_backup',
      'CREATE TABLE documentos_backup AS SELECT * FROM documentos',
      'DROP TABLE documentos',
      `CREATE TABLE documentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT NOT NULL UNIQUE,
        funcionario_id INTEGER NOT NULL,
        nome_arquivo TEXT NOT NULL,
        tipo TEXT NOT NULL,
        tamanho INTEGER NOT NULL,
        r2_key TEXT NOT NULL UNIQUE,
        descricao TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT DEFAULT NULL,
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      )`,
      'INSERT INTO documentos SELECT * FROM documentos_backup',
      'DROP TABLE documentos_backup',
      'DROP TABLE IF EXISTS fichas_manobras_historico_backup',
      'CREATE TABLE fichas_manobras_historico_backup AS SELECT * FROM fichas_manobras_historico',
      'DROP TABLE fichas_manobras_historico',
      `CREATE TABLE fichas_manobras_historico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      )`,
      'INSERT INTO fichas_manobras_historico SELECT * FROM fichas_manobras_historico_backup',
      'DROP TABLE fichas_manobras_historico_backup',
      'DROP TABLE IF EXISTS funcionario_documentos_backup',
      'CREATE TABLE funcionario_documentos_backup AS SELECT * FROM funcionario_documentos',
      'DROP TABLE funcionario_documentos',
      `CREATE TABLE funcionario_documentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        tipo_documento TEXT NOT NULL,
        nome_arquivo TEXT NOT NULL,
        caminho_r2 TEXT NOT NULL,
        tamanho_bytes INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        descricao TEXT,
        data_upload DATETIME DEFAULT CURRENT_TIMESTAMP,
        uploaded_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      )`,
      'INSERT INTO funcionario_documentos SELECT * FROM funcionario_documentos_backup',
      'DROP TABLE funcionario_documentos_backup',
      'DROP TABLE IF EXISTS funcionarios_aeronaves_backup',
      'CREATE TABLE funcionarios_aeronaves_backup AS SELECT * FROM funcionarios_aeronaves',
      'DROP TABLE funcionarios_aeronaves',
      `CREATE TABLE funcionarios_aeronaves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        aeronave_id INTEGER NOT NULL,
        data_inicio TEXT NOT NULL,
        data_fim TEXT,
        ativo INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
        FOREIGN KEY (aeronave_id) REFERENCES aeronaves(id),
        UNIQUE(funcionario_id, aeronave_id, data_inicio)
      )`,
      'INSERT INTO funcionarios_aeronaves SELECT * FROM funcionarios_aeronaves_backup',
      'DROP TABLE funcionarios_aeronaves_backup',
      'DROP TABLE IF EXISTS instrutores_simulador_backup',
      'CREATE TABLE instrutores_simulador_backup AS SELECT * FROM instrutores_simulador',
      'DROP TABLE instrutores_simulador',
      `CREATE TABLE instrutores_simulador (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id TEXT NOT NULL,
        habilitacoes TEXT,
        observacoes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT,
        FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id)
      )`,
      'INSERT INTO instrutores_simulador SELECT * FROM instrutores_simulador_backup',
      'DROP TABLE instrutores_simulador_backup',
      'DROP TABLE IF EXISTS licencas_backup',
      'CREATE TABLE licencas_backup AS SELECT * FROM licencas',
      'DROP TABLE licencas',
      `CREATE TABLE licencas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id TEXT NOT NULL,
        tipo TEXT NOT NULL,
        numero TEXT NOT NULL,
        data_emissao TEXT NOT NULL,
        data_vencimento TEXT NOT NULL,
        observacoes TEXT,
        created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
        updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
        deleted_at TEXT DEFAULT NULL,
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      )`,
      'INSERT INTO licencas SELECT * FROM licencas_backup',
      'DROP TABLE licencas_backup',
      'DROP TABLE IF EXISTS logs_acesso_dados_backup',
      'CREATE TABLE logs_acesso_dados_backup AS SELECT * FROM logs_acesso_dados',
      'DROP TABLE logs_acesso_dados',
      `CREATE TABLE logs_acesso_dados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        usuario_id INTEGER,
        acao TEXT NOT NULL CHECK(acao IN ('READ', 'UPDATE', 'DELETE', 'EXPORT')),
        campos_acessados TEXT,
        ip TEXT,
        user_agent TEXT,
        timestamp TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      )`,
      'INSERT INTO logs_acesso_dados SELECT * FROM logs_acesso_dados_backup',
      'DROP TABLE logs_acesso_dados_backup',
      'DROP TABLE IF EXISTS notificacoes_backup',
      'CREATE TABLE notificacoes_backup AS SELECT * FROM notificacoes',
      'DROP TABLE notificacoes',
      `CREATE TABLE notificacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT NOT NULL,
        titulo TEXT NOT NULL,
        mensagem TEXT NOT NULL,
        funcionario_id INTEGER,
        lida BOOLEAN DEFAULT 0,
        data_envio TEXT DEFAULT (datetime('now')),
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      )`,
      'INSERT INTO notificacoes SELECT * FROM notificacoes_backup',
      'DROP TABLE notificacoes_backup',
      'PRAGMA foreign_keys=ON',
    ];

    await db.batch(statements.map((sql) => db.prepare(sql)));

    console.log('[MIGRATION-0136] ✅ Todas as 12 tabelas foram reconstruídas!');

    return c.json({
      success: true,
      message: 'Migration 0136 aplicada! Todas as 12 tabelas foram reconstruídas com FKs corretas.',
    });
  } catch (error) {
    console.error('[MIGRATION-0136] ❌ Erro:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      500,
    );
  }
});

export default app;
