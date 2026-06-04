import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

type TableRow = {
  name: string;
};

type TableColumn = {
  name: string;
};

type IndexRow = {
  name: string;
};

const prohibitedPatterns = [
  /\bDROP\b/i,
  /\bUPDATE\b/i,
  /\bDELETE\b/i,
  /\bINSERT\b/i,
  /\bREPLACE\b/i,
  /\bUPSERT\b/i,
];

const secretOrSeedPatterns = [
  /AIRTRUST_/,
  /\bSECRET\s*=/i,
  /\bTOKEN\s*=/i,
  /\bAPI[_-]?KEY\s*=/i,
  /\bBEARER\s+[A-Z0-9._-]+/i,
  /@/,
  /https?:\/\//i,
];

function normalizeSql(sql: string) {
  return sql
    .replace(/--.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('migration 0387 sigvoos base tables schema', () => {
  const tempDirs: string[] = [];
  const migrationSql = readFileSync(
    new URL('../../../migrations/0387_integracoes_sigvoos_base_tables.sql', import.meta.url),
    'utf8',
  );
  const bootstrapSql = readFileSync(
    new URL('../../../../scripts/bootstrap-new-environment.sql', import.meta.url),
    'utf8',
  );
  const enrichmentSql = readFileSync(
    new URL('../../../migrations/0352_sigvoos_frms_pendencias_e_enriquecimento.sql', import.meta.url),
    'utf8',
  );
  const hardeningSql = readFileSync(
    new URL('../../../migrations/0354_auditoria_critica_schema_hardening.sql', import.meta.url),
    'utf8',
  );
  const migrationChainPrereqSql = `
    CREATE TABLE frms_jornada (
      id TEXT PRIMARY KEY,
      tripulante_id INTEGER,
      deleted_at TEXT,
      data TEXT
    );

    CREATE TABLE funcionarios (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER
    );

    CREATE TABLE lms_matriculas (
      empresa_id INTEGER,
      deleted_at TEXT
    );

    CREATE TABLE lms_cursos (
      empresa_id INTEGER,
      deleted_at TEXT
    );

    CREATE TABLE qualificacoes_historico (
      empresa_id INTEGER,
      deleted_at TEXT
    );
  `;

  const expectedBootstrapTables = [
    'integracoes_sigvoos_config',
    'integracoes_sigvoos_eventos',
    'integracoes_sigvoos_mapeamentos',
  ] as const;

  const expectedBootstrapIndexes = [
    'idx_integracoes_sigvoos_config_empresa_chave',
    'idx_integracoes_sigvoos_eventos_empresa_created',
    'idx_integracoes_sigvoos_mapeamentos_empresa_nome',
    'idx_integracoes_sigvoos_mapeamentos_empresa_canac',
  ] as const;

  function createDb() {
    const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-sigvoos-base-'));
    const databasePath = join(tempDir, 'schema.sqlite');
    tempDirs.push(tempDir);

    function sqlite(sql: string): string {
      const result = spawnSync('sqlite3', [databasePath], {
        input: sql,
        encoding: 'utf8',
      });

      expect(result.status, result.stderr).toBe(0);
      return result.stdout.trim();
    }

    function queryJson<T>(sql: string): T[] {
      const result = spawnSync('sqlite3', ['-json', databasePath, sql], {
        encoding: 'utf8',
      });

      expect(result.status, result.stderr).toBe(0);
      return result.stdout.trim() ? (JSON.parse(result.stdout) as T[]) : [];
    }

    function sqliteResult(sql: string) {
      return spawnSync('sqlite3', [databasePath], {
        input: sql,
        encoding: 'utf8',
      });
    }

    return { sqlite, queryJson, sqliteResult };
  }

  afterAll(() => {
    for (const tempDir of tempDirs) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('creates the three SIGVOOS base tables with the runtime-defined columns', () => {
    const { sqlite, queryJson } = createDb();
    sqlite(migrationSql);

    const tables = queryJson<TableRow>(
      `SELECT name
         FROM sqlite_master
        WHERE type = 'table'
          AND name IN (
            'integracoes_sigvoos_config',
            'integracoes_sigvoos_eventos',
            'integracoes_sigvoos_mapeamentos'
          )
        ORDER BY name;`,
    ).map(({ name }) => name);

    expect(tables).toEqual([
      'integracoes_sigvoos_config',
      'integracoes_sigvoos_eventos',
      'integracoes_sigvoos_mapeamentos',
    ]);

    expect(queryJson<TableColumn>('PRAGMA table_info(integracoes_sigvoos_config);').map(({ name }) => name)).toEqual([
      'id',
      'empresa_id',
      'chave',
      'valor',
      'created_at',
      'updated_at',
      'deleted_at',
    ]);

    expect(queryJson<TableColumn>('PRAGMA table_info(integracoes_sigvoos_eventos);').map(({ name }) => name)).toEqual([
      'id',
      'empresa_id',
      'tipo_evento',
      'status',
      'payload_json',
      'resposta_json',
      'erro_ultima',
      'created_at',
      'updated_at',
      'deleted_at',
    ]);

    expect(
      queryJson<TableColumn>('PRAGMA table_info(integracoes_sigvoos_mapeamentos);').map(
        ({ name }) => name,
      ),
    ).toEqual([
      'id',
      'empresa_id',
      'nome_sigvoos',
      'canac_sigvoos',
      'funcionario_id',
      'created_at',
      'updated_at',
      'deleted_at',
    ]);
  });

  it('creates the expected config, eventos and mapeamentos indexes', () => {
    const { sqlite, queryJson } = createDb();
    sqlite(migrationSql);

    expect(queryJson<IndexRow>('PRAGMA index_list(integracoes_sigvoos_config);').map(({ name }) => name)).toContain(
      'idx_integracoes_sigvoos_config_empresa_chave',
    );
    expect(
      queryJson<IndexRow>('PRAGMA index_list(integracoes_sigvoos_eventos);').map(({ name }) => name),
    ).toContain('idx_integracoes_sigvoos_eventos_empresa_created');
    expect(
      queryJson<IndexRow>('PRAGMA index_list(integracoes_sigvoos_mapeamentos);').map(({ name }) => name),
    ).toEqual(
      expect.arrayContaining([
        'idx_integracoes_sigvoos_mapeamentos_empresa_nome',
        'idx_integracoes_sigvoos_mapeamentos_empresa_canac',
      ]),
    );
  });

  it('is idempotent when the runtime-shaped tables already exist', () => {
    const { sqlite, queryJson } = createDb();
    sqlite(migrationSql);
    sqlite(migrationSql);

    expect(queryJson<IndexRow>('PRAGMA index_list(integracoes_sigvoos_config);').map(({ name }) => name)).toContain(
      'idx_integracoes_sigvoos_config_empresa_chave',
    );
    expect(
      queryJson<IndexRow>('PRAGMA index_list(integracoes_sigvoos_eventos);').map(({ name }) => name),
    ).toContain('idx_integracoes_sigvoos_eventos_empresa_created');
    expect(
      queryJson<IndexRow>('PRAGMA index_list(integracoes_sigvoos_mapeamentos);').map(({ name }) => name),
    ).toEqual(
      expect.arrayContaining([
        'idx_integracoes_sigvoos_mapeamentos_empresa_nome',
        'idx_integracoes_sigvoos_mapeamentos_empresa_canac',
      ]),
    );
  });

  it('completes the full runtime SIGVOOS table/index set together with migration 0352', () => {
    const { sqlite, queryJson } = createDb();
    sqlite(`
      CREATE TABLE frms_jornada (
        id TEXT PRIMARY KEY,
        tripulante_id INTEGER,
        deleted_at TEXT
      );

      ${enrichmentSql}
      ${migrationSql}
    `);

    const tables = queryJson<TableRow>(
      `SELECT name
         FROM sqlite_master
        WHERE type = 'table'
          AND name IN (
            'integracoes_sigvoos_config',
            'integracoes_sigvoos_eventos',
            'integracoes_sigvoos_mapeamentos',
            'sigvoos_mapeamento_manual',
            'frms_jornada_pendente'
          )
        ORDER BY name;`,
    ).map(({ name }) => name);

    expect(tables).toEqual([
      'frms_jornada_pendente',
      'integracoes_sigvoos_config',
      'integracoes_sigvoos_eventos',
      'integracoes_sigvoos_mapeamentos',
      'sigvoos_mapeamento_manual',
    ]);

    const indexNames = queryJson<TableRow>(
      `SELECT name
         FROM sqlite_master
        WHERE type = 'index'
          AND name IN (
            'idx_integracoes_sigvoos_config_empresa_chave',
            'idx_integracoes_sigvoos_eventos_empresa_created',
            'idx_integracoes_sigvoos_mapeamentos_empresa_nome',
            'idx_integracoes_sigvoos_mapeamentos_empresa_canac',
            'idx_sigvoos_mapeamento_manual_empresa_nome',
            'idx_sigvoos_mapeamento_manual_empresa_inscricao',
            'idx_frms_jornada_pendente_empresa_status',
            'idx_frms_jornada_pendente_importacao'
          )
        ORDER BY name;`,
    ).map(({ name }) => name);

    expect(indexNames).toEqual([
      'idx_frms_jornada_pendente_empresa_status',
      'idx_frms_jornada_pendente_importacao',
      'idx_integracoes_sigvoos_config_empresa_chave',
      'idx_integracoes_sigvoos_eventos_empresa_created',
      'idx_integracoes_sigvoos_mapeamentos_empresa_canac',
      'idx_integracoes_sigvoos_mapeamentos_empresa_nome',
      'idx_sigvoos_mapeamento_manual_empresa_inscricao',
      'idx_sigvoos_mapeamento_manual_empresa_nome',
    ]);
  });

  it('does not contain destructive or data-changing statements', () => {
    for (const pattern of prohibitedPatterns) {
      expect(migrationSql).not.toMatch(pattern);
    }
  });

  it('shows that 0354 depends on integracoes_sigvoos_config before 0387 exists in a clean chain', () => {
    const { sqliteResult } = createDb();

    const result = sqliteResult(`
      ${migrationChainPrereqSql}
      ${hardeningSql}
    `);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('no such table: integracoes_sigvoos_config');
  });

  it('shows that appending 0387 after 0354 does not rescue the clean-chain failure', () => {
    const { sqliteResult } = createDb();

    const result = sqliteResult(`
      ${migrationChainPrereqSql}
      ${hardeningSql}
      ${migrationSql}
    `);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('no such table: integracoes_sigvoos_config');
  });

  it('keeps 0387 itself free of destructive or data-changing statements even though the chain is blocked by 0354', () => {
    for (const pattern of prohibitedPatterns) {
      expect(migrationSql).not.toMatch(pattern);
    }
  });

  it('keeps the new-environment bootstrap aligned with the 0387 base-table DDL', () => {
    expect(normalizeSql(bootstrapSql)).toBe(normalizeSql(migrationSql));
  });

  it('keeps the bootstrap scoped to pre-0354 DDL only, without seeds, secrets or replacement of historical migrations', () => {
    const normalizedBootstrap = normalizeSql(bootstrapSql);

    for (const pattern of prohibitedPatterns) {
      expect(bootstrapSql).not.toMatch(pattern);
    }

    for (const pattern of secretOrSeedPatterns) {
      expect(bootstrapSql).not.toMatch(pattern);
    }

    expect(bootstrapSql).not.toContain('sigvoos_mapeamento_manual');
    expect(bootstrapSql).not.toContain('frms_jornada_pendente');
    expect(normalizedBootstrap).not.toContain('notificar_falha_email');
  });

  it('lets 0354 pass when the bootstrap runs before historical migrations', () => {
    const { sqlite, queryJson } = createDb();

    sqlite(`
      ${migrationChainPrereqSql}
      ${bootstrapSql}
      ${hardeningSql}
    `);

    expect(queryJson<TableColumn>('PRAGMA table_info(integracoes_sigvoos_config);').map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'id',
        'empresa_id',
        'chave',
        'valor',
        'created_at',
        'updated_at',
        'deleted_at',
        'notificar_falha_email',
      ]),
    );
  });

  it('replays bootstrap + 0352 + 0354 + 0387 locally without seed data or remote D1', () => {
    const { sqlite, queryJson } = createDb();

    sqlite(`
      ${migrationChainPrereqSql}
      ${bootstrapSql}
      ${enrichmentSql}
      ${hardeningSql}
      ${migrationSql}
    `);

    const tables = queryJson<TableRow>(
      `SELECT name
         FROM sqlite_master
        WHERE type = 'table'
          AND name IN (
            'integracoes_sigvoos_config',
            'integracoes_sigvoos_eventos',
            'integracoes_sigvoos_mapeamentos',
            'sigvoos_mapeamento_manual',
            'frms_jornada_pendente'
          )
        ORDER BY name;`,
    ).map(({ name }) => name);

    expect(tables).toEqual([
      'frms_jornada_pendente',
      'integracoes_sigvoos_config',
      'integracoes_sigvoos_eventos',
      'integracoes_sigvoos_mapeamentos',
      'sigvoos_mapeamento_manual',
    ]);

    expect(
      queryJson<TableColumn>('PRAGMA table_info(integracoes_sigvoos_config);').map(({ name }) => name),
    ).toContain('notificar_falha_email');

    expect(sqlite('SELECT COUNT(*) FROM integracoes_sigvoos_config;')).toBe('0');
    expect(sqlite('SELECT COUNT(*) FROM integracoes_sigvoos_eventos;')).toBe('0');
    expect(sqlite('SELECT COUNT(*) FROM integracoes_sigvoos_mapeamentos;')).toBe('0');
  });

  it('passes the local-isolated new-environment gate when bootstrap runs before the historical chain', () => {
    const { sqlite, queryJson } = createDb();

    sqlite(migrationChainPrereqSql);
    sqlite(bootstrapSql);

    const bootstrapTables = queryJson<TableRow>(
      `SELECT name
         FROM sqlite_master
        WHERE type = 'table'
          AND name IN (
            'integracoes_sigvoos_config',
            'integracoes_sigvoos_eventos',
            'integracoes_sigvoos_mapeamentos'
          )
        ORDER BY name;`,
    ).map(({ name }) => name);

    expect(bootstrapTables).toEqual([...expectedBootstrapTables]);

    const bootstrapIndexes = queryJson<TableRow>(
      `SELECT name
         FROM sqlite_master
        WHERE type = 'index'
          AND name IN (
            'idx_integracoes_sigvoos_config_empresa_chave',
            'idx_integracoes_sigvoos_eventos_empresa_created',
            'idx_integracoes_sigvoos_mapeamentos_empresa_nome',
            'idx_integracoes_sigvoos_mapeamentos_empresa_canac'
          )
        ORDER BY name;`,
    ).map(({ name }) => name);

    expect(bootstrapIndexes).toEqual([...expectedBootstrapIndexes].sort());
    expect(sqlite('SELECT COUNT(*) FROM integracoes_sigvoos_config;')).toBe('0');
    expect(sqlite('SELECT COUNT(*) FROM integracoes_sigvoos_eventos;')).toBe('0');
    expect(sqlite('SELECT COUNT(*) FROM integracoes_sigvoos_mapeamentos;')).toBe('0');

    sqlite(enrichmentSql);
    sqlite(hardeningSql);
    sqlite(migrationSql);

    expect(
      queryJson<TableColumn>('PRAGMA table_info(integracoes_sigvoos_config);').map(({ name }) => name),
    ).toEqual(
      expect.arrayContaining([
        'id',
        'empresa_id',
        'chave',
        'valor',
        'created_at',
        'updated_at',
        'deleted_at',
        'notificar_falha_email',
      ]),
    );

    const finalTables = queryJson<TableRow>(
      `SELECT name
         FROM sqlite_master
        WHERE type = 'table'
          AND name IN (
            'integracoes_sigvoos_config',
            'integracoes_sigvoos_eventos',
            'integracoes_sigvoos_mapeamentos',
            'sigvoos_mapeamento_manual',
            'frms_jornada_pendente'
          )
        ORDER BY name;`,
    ).map(({ name }) => name);

    expect(finalTables).toEqual([
      'frms_jornada_pendente',
      'integracoes_sigvoos_config',
      'integracoes_sigvoos_eventos',
      'integracoes_sigvoos_mapeamentos',
      'sigvoos_mapeamento_manual',
    ]);
  });

  it('is idempotent when the bootstrap script runs twice before the historical chain', () => {
    const { sqlite, queryJson } = createDb();

    sqlite(`
      ${migrationChainPrereqSql}
      ${bootstrapSql}
      ${bootstrapSql}
      ${hardeningSql}
    `);

    expect(queryJson<IndexRow>('PRAGMA index_list(integracoes_sigvoos_config);').map(({ name }) => name)).toContain(
      'idx_integracoes_sigvoos_config_empresa_chave',
    );
    expect(
      queryJson<TableColumn>('PRAGMA table_info(integracoes_sigvoos_config);').map(({ name }) => name),
    ).toContain('notificar_falha_email');
  });
});
