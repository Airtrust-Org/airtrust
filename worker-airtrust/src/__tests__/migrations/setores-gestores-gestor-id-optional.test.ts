import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
    join(
      __dirname,
      '../../../../scripts/rollback/0437_setores_gestores_gestor_id_optional_rollback.sql',
    ),
    'utf8',
  );
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

    runSqlite(
      dbPath,
      `
      CREATE TABLE empresas (id INTEGER PRIMARY KEY, nome TEXT);
      INSERT INTO empresas (id, nome) VALUES (6, 'Costa do Sol'), (7, 'Outro Tenant');

      CREATE TABLE usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        email TEXT,
        perfil TEXT DEFAULT 'GESTOR',
        deleted_at TEXT
      );
      INSERT INTO usuarios (id, nome, email, perfil) VALUES
        (43, 'Gestor 43', 'g43@test', 'GESTOR'),
        (59, 'Gestor 59', 'g59@test', 'GESTOR'),
        (63, 'Antonio', 'antonio@test', 'GESTOR'),
        (100, 'Outro Gestor', 'g100@test', 'GESTOR');

      CREATE TABLE setores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT NOT NULL,
        nome TEXT NOT NULL,
        descricao TEXT,
        ativo INTEGER DEFAULT 1,
        deleted_at TEXT,
        empresa_id INTEGER NOT NULL
      );
      INSERT INTO setores (id, codigo, nome, empresa_id) VALUES
        (10, 'TRI', 'Tripulacao', 6),
        (11, 'MAN', 'Manutencao', 6),
        (20, 'TRI7', 'Tripulacao Tenant 7', 7);

      CREATE TABLE notificacoes_convocacao_cc_gestores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        email TEXT,
        cargo TEXT,
        ativo INTEGER DEFAULT 1,
        deleted_at TEXT
      );
      INSERT INTO notificacoes_convocacao_cc_gestores (id, nome, email, cargo, ativo) VALUES
        (1, 'Legado 1', 'leg1@test', 'Manager', 1),
        (2, 'Legado 2', 'leg2@test', 'Manager', 1),
        (3, 'Legado 3', 'leg3@test', 'Manager', 1),
        (4, 'Legado 4', 'leg4@test', 'Manager', 1),
        (5, 'Legado 5', 'leg5@test', 'Manager', 1),
        (6, 'Legado 6', 'leg6@test', 'Manager', 1),
        (7, 'Legado 7', 'leg7@test', 'Manager', 1),
        (8, 'Legado 8', 'leg8@test', 'Manager', 1),
        (9, 'Legado 9', 'leg9@test', 'Manager', 1),
        (10, 'Legado 10', 'leg10@test', 'Manager', 1);

      CREATE TABLE setores_gestores (
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
      );

      CREATE UNIQUE INDEX idx_setores_gestores_unique
        ON setores_gestores(setor_id, gestor_id, empresa_id)
        WHERE deleted_at IS NULL;
      CREATE INDEX idx_setores_gestores_setor
        ON setores_gestores(setor_id, empresa_id, ativo)
        WHERE deleted_at IS NULL;
      CREATE INDEX idx_setores_gestores_gestor
        ON setores_gestores(gestor_id, empresa_id, ativo)
        WHERE deleted_at IS NULL;
      CREATE INDEX idx_setores_gestores_empresa
        ON setores_gestores(empresa_id)
        WHERE deleted_at IS NULL;
      CREATE INDEX idx_setores_gestores_role
        ON setores_gestores(role, ativo)
        WHERE deleted_at IS NULL;
      CREATE INDEX idx_setores_gestores_usuario
        ON setores_gestores(usuario_id, empresa_id, ativo)
        WHERE deleted_at IS NULL;
      CREATE UNIQUE INDEX idx_setores_gestores_usuario_unique
        ON setores_gestores(setor_id, usuario_id, empresa_id)
        WHERE deleted_at IS NULL AND usuario_id IS NOT NULL;

      INSERT INTO setores_gestores (id, setor_id, gestor_id, empresa_id, role, ativo, deleted_at, usuario_id)
      VALUES
        (1, 10, 1, 6, 'manager', 1, NULL, 43),
        (2, 10, 2, 6, 'manager', 1, NULL, 59),
        (3, 11, 3, 6, 'manager', 1, NULL, NULL),
        (4, 10, 4, 6, 'backup', 1, NULL, NULL),
        (5, 11, 5, 6, 'observer', 1, NULL, NULL),
        (6, 10, 6, 6, 'manager', 1, NULL, NULL),
        (7, 10, 7, 6, 'manager', 0, NULL, NULL),
        (8, 11, 8, 6, 'manager', 1, datetime('now'), NULL),
        (9, 20, 9, 7, 'manager', 1, NULL, NULL),
        (10, 20, 10, 7, 'manager', 1, NULL, 100);

      CREATE VIEW vw_setores_gestores_ativo AS
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
        AND g.ativo = 1;
      `,
    );

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

    runSqlite(dbPath, migrationSql());

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

    runSqlite(dbPath, migrationSql());

    const after = rows(
      dbPath,
      'SELECT id, setor_id, gestor_id, empresa_id, role, ativo, COALESCE(deleted_at, "NULL"), COALESCE(usuario_id, "NULL") FROM setores_gestores ORDER BY id;',
    );

    expect(after).toEqual(before);
  });

  it('passa PRAGMA integrity_check após migration', () => {
    const dbPath = setupPreMigrationDb();
    runSqlite(dbPath, migrationSql());
    const integrity = scalar(dbPath, 'PRAGMA integrity_check;');
    expect(integrity).toBe('ok');
  });

  it('passa PRAGMA foreign_key_check após migration', () => {
    const dbPath = setupPreMigrationDb();
    runSqlite(dbPath, migrationSql());
    const fkCheck = runSqlite(dbPath, 'PRAGMA foreign_key_check;').trim();
    expect(fkCheck).toBe('');
  });

  // =========================================================================
  // NOVO COMPORTAMENTO
  // =========================================================================

  it('aceita gestor_id NULL com usuario_id preenchido (caminho moderno)', () => {
    const dbPath = setupPreMigrationDb();
    runSqlite(dbPath, migrationSql());

    // Este é exatamente o caso do Antônio que falhou em produção
    runSqlite(
      dbPath,
      `INSERT INTO setores_gestores (setor_id, gestor_id, usuario_id, empresa_id, role)
       VALUES (10, NULL, 63, 6, 'manager');`,
    );

    const count = scalar(
      dbPath,
      'SELECT COUNT(*) FROM setores_gestores WHERE usuario_id = 63 AND gestor_id IS NULL AND empresa_id = 6;',
    );
    expect(count).toBe('1');
  });

  it('rejeita ambos NULL (CHECK constraint)', () => {
    const dbPath = setupPreMigrationDb();
    runSqlite(dbPath, migrationSql());

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
    runSqlite(dbPath, migrationSql());

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
    runSqlite(dbPath, migrationSql());

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
    runSqlite(dbPath, migrationSql());

    // Insere e soft-deleta
    runSqlite(
      dbPath,
      `INSERT INTO setores_gestores (setor_id, gestor_id, usuario_id, empresa_id, role)
       VALUES (10, NULL, 63, 6, 'manager');`,
    );
    runSqlite(
      dbPath,
      `UPDATE setores_gestores SET deleted_at = datetime('now') WHERE usuario_id = 63;`,
    );

    // Deve permitir novo vínculo
    runSqlite(
      dbPath,
      `INSERT INTO setores_gestores (setor_id, gestor_id, usuario_id, empresa_id, role)
       VALUES (10, NULL, 63, 6, 'manager');`,
    );

    const count = scalar(
      dbPath,
      'SELECT COUNT(*) FROM setores_gestores WHERE usuario_id = 63 AND deleted_at IS NULL;',
    );
    expect(count).toBe('1');
  });

  // =========================================================================
  // ISOLAMENTO MULTI-TENANT
  // =========================================================================

  it('isola vínculos por empresa (índice tenant-safe)', () => {
    const dbPath = setupPreMigrationDb();
    runSqlite(dbPath, migrationSql());

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
      'SELECT COUNT(*) FROM setores_gestores WHERE usuario_id = 63 AND empresa_id = 6 AND deleted_at IS NULL;',
    );
    const count7 = scalar(
      dbPath,
      'SELECT COUNT(*) FROM setores_gestores WHERE usuario_id = 63 AND empresa_id = 7 AND deleted_at IS NULL;',
    );
    expect(count6).toBe('1');
    expect(count7).toBe('1');
  });

  // =========================================================================
  // VIEW
  // =========================================================================

  it('view inclui gestor moderno (usuario_id-only) após migration', () => {
    const dbPath = setupPreMigrationDb();
    runSqlite(dbPath, migrationSql());

    // Insere gestor moderno
    runSqlite(
      dbPath,
      `INSERT INTO setores_gestores (setor_id, gestor_id, usuario_id, empresa_id, role)
       VALUES (10, NULL, 63, 6, 'manager');`,
    );

    const viewRows = rows(
      dbPath,
      'SELECT id, gestor_nome FROM vw_setores_gestores_ativo WHERE usuario_id = 63;',
    );
    expect(viewRows.length).toBeGreaterThanOrEqual(1);
    expect(viewRows[0]).toContain('Antonio');
  });

  it('view inclui gestores legados (gestor_id) após migration', () => {
    const dbPath = setupPreMigrationDb();
    runSqlite(dbPath, migrationSql());

    // Linhas legadas com gestor_id devem continuar visíveis
    const viewRows = rows(
      dbPath,
      'SELECT id FROM vw_setores_gestores_ativo WHERE gestor_id IS NOT NULL;',
    );
    // 10 linhas, das quais 8 estão ativas + não deletadas (ids 1-6, 9, 10)
    expect(viewRows.length).toBeGreaterThanOrEqual(8);
  });

  // =========================================================================
  // ROLLBACK
  // =========================================================================

  it('rollback restaura schema e dados', () => {
    const dbPath = setupPreMigrationDb();

    // Snapshot pré
    const preSchema = runSqlite(
      dbPath,
      "SELECT sql FROM sqlite_master WHERE name='setores_gestores' AND type='table';",
    ).trim();
    expect(preSchema).toContain('gestor_id INTEGER NOT NULL');
    const preData = rows(
      dbPath,
      'SELECT id, setor_id, gestor_id, empresa_id, role, ativo, COALESCE(deleted_at, "NULL"), COALESCE(usuario_id, "NULL") FROM setores_gestores ORDER BY id;',
    );

    // Aplica migration
    runSqlite(dbPath, migrationSql());

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
    runSqlite(dbPath, migrationSql());
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

  it('rollback seguro recusa execucao se existirem linhas com gestor_id IS NULL', () => {
    const dbPath = setupPreMigrationDb();
    runSqlite(dbPath, migrationSql());

    // Insere linha moderna com gestor_id IS NULL
    runSqlite(
      dbPath,
      `INSERT INTO setores_gestores (setor_id, gestor_id, usuario_id, empresa_id, role)
       VALUES (10, NULL, 63, 6, 'manager');`,
    );

    // Rollback deve falhar por conta do preflight check (CHECK constraint na tabela temporária de assertiva)
    expect(() => {
      runSqlite(dbPath, rollbackSql());
    }).toThrow(/CHECK constraint failed/);
  });

  it('rollback seguro funciona se as linhas com gestor_id IS NULL forem removidas antes', () => {
    const dbPath = setupPreMigrationDb();
    runSqlite(dbPath, migrationSql());

    // Insere linha moderna
    runSqlite(
      dbPath,
      `INSERT INTO setores_gestores (setor_id, gestor_id, usuario_id, empresa_id, role)
       VALUES (10, NULL, 63, 6, 'manager');`,
    );

    // Simula remoção controlada antes do rollback (como exigido pela documentação)
    runSqlite(dbPath, 'DELETE FROM setores_gestores WHERE gestor_id IS NULL;');

    // Agora o rollback deve funcionar com sucesso
    runSqlite(dbPath, rollbackSql());

    // Verifica se a estrutura antiga (NOT NULL) foi reestabelecida
    const colInfoAfter = runSqlite(
      dbPath,
      "SELECT \"notnull\" FROM pragma_table_info('setores_gestores') WHERE name='gestor_id';",
    ).trim();
    expect(colInfoAfter).toBe('1');
  });
});
