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

describe('migration 0387 sigvoos base tables schema', () => {
  const tempDirs: string[] = [];
  const migrationSql = readFileSync(
    new URL('../../../migrations/0387_integracoes_sigvoos_base_tables.sql', import.meta.url),
    'utf8',
  );
  const enrichmentSql = readFileSync(
    new URL('../../../migrations/0352_sigvoos_frms_pendencias_e_enriquecimento.sql', import.meta.url),
    'utf8',
  );

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

    return { sqlite, queryJson };
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
});
