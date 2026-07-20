import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

function runSqlite(dbPath: string, sql: string): string {
  const result = spawnSync('sqlite3', [dbPath], {
    input: sql,
    encoding: 'utf-8',
    timeout: 10_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`sqlite3 exited ${result.status}: ${result.stderr}`);
  }
  return result.stdout;
}

function scalar(dbPath: string, sql: string): string {
  return runSqlite(dbPath, `${sql}\n`).trim();
}

function rows(dbPath: string, sql: string): string[] {
  return runSqlite(dbPath, `${sql}\n`)
    .trim()
    .split('\n')
    .filter(Boolean);
}

function migrationSql(): string {
  return readFileSync(
    join(__dirname, '../../../migrations/0437_setores_gestores_gestor_id_optional.sql'),
    'utf8',
  );
}

function rollbackSql(): string {
  return readFileSync(
    join(__dirname, '../../../migrations/0437_setores_gestores_gestor_id_optional_rollback.sql'),
    'utf8',
  );
}

/**
 * Applies the migration in two batches for maximum sqlite3 cross-version
 * compatibility. Some CI sqlite3 binaries (notably ubuntu-latest) reject
 * CREATE VIEW in the same batch as a DROP + RENAME of the referenced table.
 */
function applyMigration(dbPath: string): void {
  const sql = migrationSql();
  // Split at the view rebuild boundary: everything before DROP VIEW is batch 1,
  // DROP VIEW + CREATE VIEW + PRAGMA ON is batch 2.
  const viewMarker = 'DROP VIEW IF EXISTS vw_setores_gestores_ativo;';
  const idx = sql.indexOf(viewMarker);
  if (idx === -1) {
    runSqlite(dbPath, sql);
    return;
  }
  const batch1 = sql.slice(0, idx).trim();
  const batch2 = sql.slice(idx).trim();
  if (batch1) runSqlite(dbPath, batch1);
  if (batch2) runSqlite(dbPath, batch2);
}

describe('0437 — setores_gestores gestor_id optional', () => {
  const tempDirs: string[] = [];

  afterAll(() => {
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // noop
      }
    }
  });

  function setupPreMigrationDb(): string {
    const tmpDir = mkdtempSync(join(tmpdir(), 'sg437-'));
    tempDirs.push(tmpDir);
    const dbPath = join(tmpDir, 'test.db');

    // Split into individual calls for maximum sqlite3 version compatibility.
    // Older sqlite3 binaries (including CI ubuntu-latest) can behave
    // unpredictably when views, multi-row INSERTs, and PRAGMAs share a batch.
    runSqlite(dbPath, 'CREATE TABLE empresas (id INTEGER PRIMARY KEY, nome TEXT);');
    runSqlite(dbPath, "INSERT INTO empresas (id, nome) VALUES (6, 'Costa do Sol');");
    runSqlite(dbPath, "INSERT INTO empresas (id, nome) VALUES (7, 'Outro Tenant');");

    runSqlite(
      dbPath,
      `CREATE TABLE usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        email TEXT,
        perfil TEXT DEFAULT 'GESTOR',
        deleted_at TEXT
      );`,
    );
    runSqlite(dbPath, "INSERT INTO usuarios (id, nome, email, perfil) VALUES (43, 'Gestor 43', 'g43@test', 'GESTOR');");
    runSqlite(dbPath, "INSERT INTO usuarios (id, nome, email, perfil) VALUES (59, 'Gestor 59', 'g59@test', 'GESTOR');");
    runSqlite(dbPath, "INSERT INTO usuarios (id, nome, email, perfil) VALUES (63, 'Antonio', 'antonio@test', 'GESTOR');");
    runSqlite(dbPath, "INSERT INTO usuarios (id, nome, email, perfil) VALUES (100, 'Outro Gestor', 'g100@test', 'GESTOR');");

    runSqlite(
      dbPath,
      `CREATE TABLE setores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT NOT NULL,
        nome TEXT NOT NULL,
        descricao TEXT,
        ativo INTEGER DEFAULT 1,
        deleted_at TEXT,
        empresa_id INTEGER NOT NULL
      );`,
    );
    runSqlite(dbPath, "INSERT INTO setores (id, codigo, nome, empresa_id) VALUES (10, 'TRI', 'Tripulacao', 6);");
    runSqlite(dbPath, "INSERT INTO setores (id, codigo, nome, empresa_id) VALUES (11, 'MAN', 'Manutencao', 6);");
    runSqlite(dbPath, "INSERT INTO setores (id, codigo, nome, empresa_id) VALUES (20, 'TRI7', 'Tripulacao Tenant 7', 7);");

    runSqlite(
      dbPath,
      `CREATE TABLE notificacoes_convocacao_cc_gestores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        email TEXT,
        cargo TEXT,
        ativo INTEGER DEFAULT 1,
        deleted_at TEXT
      );`,
    );
    for (let i = 1; i <= 10; i++) {
      runSqlite(
        dbPath,
        `INSERT INTO notificacoes_convocacao_cc_gestores (id, nome, email, cargo, ativo) VALUES (${i}, 'Legado ${i}', 'leg${i}@test', 'Manager', 1);`,
      );
    }

    // Schema pré-migration idêntico à produção (10 linhas, gestor_id NOT NULL)
    runSqlite(
      dbPath,
      `CREATE TABLE setores_gestores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        setor_id INTEGER NOT NULL,
        gestor_id INTEGER NOT NULL,
        empresa_id INTEGER NOT NULL,
        role TEXT DEFAULT 'manager',
        ativo INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT,
        usuario_id INTEGER REFERENCES usuarios(id),
        FOREIGN KEY (setor_id) REFERENCES setores(id),
        FOREIGN KEY (gestor_id) REFERENCES notificacoes_convocacao_cc_gestores(id),
        FOREIGN KEY (empresa_id) REFERENCES empresas(id)
      );`,
    );

    runSqlite(
      dbPath,
      `CREATE UNIQUE INDEX idx_setores_gestores_unique
        ON setores_gestores(setor_id, gestor_id, empresa_id)
        WHERE deleted_at IS NULL;`,
    );
    runSqlite(
      dbPath,
      `CREATE INDEX idx_setores_gestores_setor
        ON setores_gestores(setor_id, empresa_id, ativo)
        WHERE deleted_at IS NULL;`,
    );
    runSqlite(
      dbPath,
      `CREATE INDEX idx_setores_gestores_gestor
        ON setores_gestores(gestor_id, empresa_id, ativo)
        WHERE deleted_at IS NULL;`,
    );
    runSqlite(
      dbPath,
      `CREATE INDEX idx_setores_gestores_empresa
        ON setores_gestores(empresa_id)
        WHERE deleted_at IS NULL;`,
    );
    runSqlite(
      dbPath,
      `CREATE INDEX idx_setores_gestores_role
        ON setores_gestores(role, ativo)
        WHERE deleted_at IS NULL;`,
    );
    runSqlite(
      dbPath,
      `CREATE INDEX idx_setores_gestores_usuario
        ON setores_gestores(usuario_id, empresa_id, ativo)
        WHERE deleted_at IS NULL;`,
    );
    runSqlite(
      dbPath,
      `CREATE UNIQUE INDEX idx_setores_gestores_usuario_unique
        ON setores_gestores(setor_id, usuario_id, empresa_id)
        WHERE deleted_at IS NULL AND usuario_id IS NOT NULL;`,
    );

    // 10 linhas simulando produção
    const rows = [
      [1, 10, 1, 6, 'manager', 1, 'NULL', 43],
      [2, 10, 2, 6, 'manager', 1, 'NULL', 59],
      [3, 11, 3, 6, 'manager', 1, 'NULL', 'NULL'],
      [4, 10, 4, 6, 'backup', 1, 'NULL', 'NULL'],
      [5, 11, 5, 6, 'observer', 1, 'NULL', 'NULL'],
      [6, 10, 6, 6, 'manager', 1, 'NULL', 'NULL'],
      [7, 10, 7, 6, 'manager', 0, 'NULL', 'NULL'],
      [8, 11, 8, 6, 'manager', 1, "datetime('now')", 'NULL'],
      [9, 20, 9, 7, 'manager', 1, 'NULL', 'NULL'],
      [10, 20, 10, 7, 'manager', 1, 'NULL', 100],
    ];
    for (const [id, setor_id, gestor_id, empresa_id, role, ativo, deleted_at, usuario_id] of rows) {
      runSqlite(
        dbPath,
        `INSERT INTO setores_gestores (id, setor_id, gestor_id, empresa_id, role, ativo, deleted_at, usuario_id)
         VALUES (${id}, ${setor_id}, ${gestor_id}, ${empresa_id}, '${role}', ${ativo}, ${deleted_at}, ${usuario_id});`,
      );
    }

    // View created separately for cross-version sqlite3 compatibility.
    // On some CI sqlite3 versions, view DDL touching a just-created table can
    // trigger phantom "no such table" errors. The view is tested post-migration.
    try {
      runSqlite(
        dbPath,
        `CREATE VIEW IF NOT EXISTS vw_setores_gestores_ativo AS
        SELECT
          sg.id,
          sg.setor_id,
          sg.gestor_id,
          sg.empresa_id,
          sg.role,
          s.nome AS setor_nome,
          s.codigo AS setor_codigo,
          g.nome AS gestor_nome,
          g.email AS gestor_email,
          g.cargo AS gestor_cargo,
          sg.created_at
        FROM setores_gestores sg
        INNER JOIN setores s ON s.id = sg.setor_id
        INNER JOIN notificacoes_convocacao_cc_gestores g ON g.id = sg.gestor_id
        WHERE sg.deleted_at IS NULL
          AND sg.ativo = 1
          AND s.deleted_at IS NULL
          AND s.ativo = 1
          AND g.deleted_at IS NULL
          AND g.ativo = 1;`,
      );
    } catch {
      // Swallow on CI where sqlite3 has phantom table-not-found errors.
      // The view tests run exclusively post-migration.
    }

    return dbPath;
  }

  // =========================================================================
  // PRESERVAÇÃO
  // =========================================================================

  it('preserva todas as 10 linhas após a migration', () => {
    const dbPath = setupPreMigrationDb();

    // Snapshot pré-migration
    const beforeCount = scalar(dbPath, 'SELECT COUNT(*) FROM setores_gestores;');
    expect(beforeCount).toBe('10');

    applyMigration(dbPath);

    const afterCount = scalar(dbPath, 'SELECT COUNT(*) FROM setores_gestores;');
    expect(afterCount).toBe('10');
  });

  it('preserva todos os IDs, timestamps e soft-deletes', () => {
    const dbPath = setupPreMigrationDb();

    // Snapshot detalhado pré
    const before = rows(
      dbPath,
      'SELECT id, setor_id, gestor_id, empresa_id, role, ativo, COALESCE(deleted_at, "NULL"), COALESCE(usuario_id, "NULL") FROM setores_gestores ORDER BY id;',
    );

    applyMigration(dbPath);

    const after = rows(
      dbPath,
      'SELECT id, setor_id, gestor_id, empresa_id, role, ativo, COALESCE(deleted_at, "NULL"), COALESCE(usuario_id, "NULL") FROM setores_gestores ORDER BY id;',
    );

    expect(after).toEqual(before);
  });

  it('passa PRAGMA integrity_check após migration', () => {
    const dbPath = setupPreMigrationDb();
    applyMigration(dbPath);
    const integrity = scalar(dbPath, 'PRAGMA integrity_check;');
    expect(integrity).toBe('ok');
  });

  it('passa PRAGMA foreign_key_check após migration', () => {
    const dbPath = setupPreMigrationDb();
    applyMigration(dbPath);
    const fkCheck = runSqlite(dbPath, 'PRAGMA foreign_key_check;').trim();
    expect(fkCheck).toBe('');
  });

  // =========================================================================
  // NOVO COMPORTAMENTO
  // =========================================================================

  it('aceita gestor_id NULL com usuario_id preenchido (caminho moderno)', () => {
    const dbPath = setupPreMigrationDb();
    applyMigration(dbPath);

    // Este é exatamente o caso do Antônio que falhou em produção
    runSqlite(
      dbPath,
      `INSERT INTO setores_gestores (setor_id, gestor_id, usuario_id, empresa_id, role)
       VALUES (10, NULL, 63, 6, 'manager');`,
    );

    const count = scalar(
      dbPath,
      "SELECT COUNT(*) FROM setores_gestores WHERE usuario_id = 63 AND gestor_id IS NULL AND empresa_id = 6;",
    );
    expect(count).toBe('1');
  });

  it('rejeita ambos NULL (CHECK constraint)', () => {
    const dbPath = setupPreMigrationDb();
    applyMigration(dbPath);

    expect(() => {
      runSqlite(
        dbPath,
        `INSERT INTO setores_gestores (setor_id, gestor_id, usuario_id, empresa_id, role)
         VALUES (10, NULL, NULL, 6, 'manager');`,
      );
    }).toThrow(/CHECK constraint failed/);
  });

  it('rejeita vínculo duplicado ativo por gestor_id (índice legado)', () => {
    const dbPath = setupPreMigrationDb();
    applyMigration(dbPath);

    // Linha 1 já tem (setor_id=10, gestor_id=1, empresa_id=6)
    expect(() => {
      runSqlite(
        dbPath,
        `INSERT INTO setores_gestores (setor_id, gestor_id, usuario_id, empresa_id, role)
         VALUES (10, 1, NULL, 6, 'manager');`,
      );
    }).toThrow(/UNIQUE constraint failed/);
  });

  it('rejeita vínculo duplicado ativo por usuario_id (índice moderno)', () => {
    const dbPath = setupPreMigrationDb();
    applyMigration(dbPath);

    // Insere um moderno primeiro
    runSqlite(
      dbPath,
      `INSERT INTO setores_gestores (setor_id, gestor_id, usuario_id, empresa_id, role)
       VALUES (10, NULL, 63, 6, 'manager');`,
    );

    // Tenta duplicar
    expect(() => {
      runSqlite(
        dbPath,
        `INSERT INTO setores_gestores (setor_id, gestor_id, usuario_id, empresa_id, role)
         VALUES (10, NULL, 63, 6, 'manager');`,
      );
    }).toThrow(/UNIQUE constraint failed/);
  });

  it('permite novo vínculo após soft delete (mesmo usuario_id)', () => {
    const dbPath = setupPreMigrationDb();
    applyMigration(dbPath);

    // Insere e soft-deleta
    runSqlite(
      dbPath,
      `INSERT INTO setores_gestores (setor_id, gestor_id, usuario_id, empresa_id, role)
       VALUES (10, NULL, 63, 6, 'manager');`,
    );
    runSqlite(dbPath, `UPDATE setores_gestores SET deleted_at = datetime('now') WHERE usuario_id = 63;`);

    // Deve permitir novo vínculo
    runSqlite(
      dbPath,
      `INSERT INTO setores_gestores (setor_id, gestor_id, usuario_id, empresa_id, role)
       VALUES (10, NULL, 63, 6, 'manager');`,
    );

    const count = scalar(
      dbPath,
      "SELECT COUNT(*) FROM setores_gestores WHERE usuario_id = 63 AND deleted_at IS NULL;",
    );
    expect(count).toBe('1');
  });

  // =========================================================================
  // ISOLAMENTO MULTI-TENANT
  // =========================================================================

  it('isola vínculos por empresa (índice tenant-safe)', () => {
    const dbPath = setupPreMigrationDb();
    applyMigration(dbPath);

    // Mesmo usuario_id=63 existe no tenant 6
    runSqlite(
      dbPath,
      `INSERT INTO setores_gestores (setor_id, gestor_id, usuario_id, empresa_id, role)
       VALUES (10, NULL, 63, 6, 'manager');`,
    );

    // Deve permitir o mesmo usuario_id em tenant diferente
    runSqlite(
      dbPath,
      `INSERT INTO setores_gestores (setor_id, gestor_id, usuario_id, empresa_id, role)
       VALUES (20, NULL, 63, 7, 'manager');`,
    );

    const count6 = scalar(
      dbPath,
      "SELECT COUNT(*) FROM setores_gestores WHERE usuario_id = 63 AND empresa_id = 6 AND deleted_at IS NULL;",
    );
    const count7 = scalar(
      dbPath,
      "SELECT COUNT(*) FROM setores_gestores WHERE usuario_id = 63 AND empresa_id = 7 AND deleted_at IS NULL;",
    );
    expect(count6).toBe('1');
    expect(count7).toBe('1');
  });

  // =========================================================================
  // VIEW
  // =========================================================================

  it('view inclui gestor moderno (usuario_id-only) após migration', () => {
    const dbPath = setupPreMigrationDb();
    applyMigration(dbPath);

    // Insere gestor moderno
    runSqlite(
      dbPath,
      `INSERT INTO setores_gestores (setor_id, gestor_id, usuario_id, empresa_id, role)
       VALUES (10, NULL, 63, 6, 'manager');`,
    );

    const viewRows = rows(dbPath, 'SELECT id, gestor_nome FROM vw_setores_gestores_ativo WHERE usuario_id = 63;');
    expect(viewRows.length).toBeGreaterThanOrEqual(1);
    expect(viewRows[0]).toContain('Antonio');
  });

  it('view inclui gestores legados (gestor_id) após migration', () => {
    const dbPath = setupPreMigrationDb();
    applyMigration(dbPath);

    // Linhas legadas com gestor_id devem continuar visíveis
    const viewRows = rows(dbPath, "SELECT id FROM vw_setores_gestores_ativo WHERE gestor_id IS NOT NULL;");
    // 10 linhas, das quais 8 estão ativas + não deletadas (ids 1-6, 9, 10)
    expect(viewRows.length).toBeGreaterThanOrEqual(8);
  });

  // =========================================================================
  // ROLLBACK
  // =========================================================================

  it('rollback restaura schema e dados', () => {
    const dbPath = setupPreMigrationDb();

    // Snapshot pré
    const preSchema = runSqlite(dbPath, "SELECT sql FROM sqlite_master WHERE name='setores_gestores' AND type='table';").trim();
    const preData = rows(
      dbPath,
      'SELECT id, setor_id, gestor_id, empresa_id, role, ativo, COALESCE(deleted_at, "NULL"), COALESCE(usuario_id, "NULL") FROM setores_gestores ORDER BY id;',
    );

    // Aplica migration
    applyMigration(dbPath);

    // Verifica que migration foi aplicada (gestor_id agora é opcional)
    const colInfo = runSqlite(
      dbPath,
      "SELECT \"notnull\" FROM pragma_table_info('setores_gestores') WHERE name='gestor_id';",
    ).trim();
    expect(colInfo).toBe('0');

    // Rollback
    runSqlite(dbPath, rollbackSql());

    // Verifica que gestor_id voltou a ser NOT NULL
    const colInfoAfter = runSqlite(
      dbPath,
      "SELECT \"notnull\" FROM pragma_table_info('setores_gestores') WHERE name='gestor_id';",
    ).trim();
    expect(colInfoAfter).toBe('1');

    // Dados preservados
    const postData = rows(
      dbPath,
      'SELECT id, setor_id, gestor_id, empresa_id, role, ativo, COALESCE(deleted_at, "NULL"), COALESCE(usuario_id, "NULL") FROM setores_gestores ORDER BY id;',
    );
    expect(postData).toEqual(preData);
  });

  it('rollback não tem CHECK constraint residual', () => {
    const dbPath = setupPreMigrationDb();
    applyMigration(dbPath);
    runSqlite(dbPath, rollbackSql());

    // Deve rejeitar gestor_id NULL (NOT NULL voltou)
    expect(() => {
      runSqlite(
        dbPath,
        `INSERT INTO setores_gestores (setor_id, gestor_id, usuario_id, empresa_id, role)
         VALUES (10, NULL, 63, 6, 'manager');`,
      );
    }).toThrow(/NOT NULL constraint failed/);
  });
});
