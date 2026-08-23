import { describe, expect, it } from 'vitest';
import { readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';

function runSqlite(dbPath: string, sql: string) {
  const result = spawnSync('sqlite3', [dbPath], {
    input: sql,
    encoding: 'utf-8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr);
  }
  return result.stdout.trim();
}

function setupDb() {
  const dir = join(tmpdir(), 'airtrust-test-' + Math.random().toString(36).slice(2));
  const fs = require('fs');
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, 'test.db');
  
  runSqlite(dbPath, `
    CREATE TABLE empresas (id INTEGER PRIMARY KEY, nome TEXT);
    CREATE TABLE empresas_config (empresa_id INTEGER PRIMARY KEY);
    CREATE TABLE treinamentos_planejados (id INTEGER PRIMARY KEY, empresa_id INTEGER, deleted_at TEXT);
    INSERT INTO empresas (id, nome) VALUES (1, 'Test');
    INSERT INTO empresas_config (empresa_id) VALUES (1);
    INSERT INTO treinamentos_planejados (id, empresa_id) VALUES (10, 1);
  `);
  return dbPath;
}

function migrationSql() {
  return readFileSync(join(__dirname, '../../../migrations/0466_cae_planning_v3.sql'), 'utf-8');
}

describe('CAE Planning V3 schema migration', () => {
  it('applies correctly and enforces CHECK constraints', () => {
    const dbPath = setupDb();
    try {
      runSqlite(dbPath, migrationSql());

      const val = runSqlite(dbPath, 'SELECT planejamento_simulador_antecedencia_dias FROM empresas_config WHERE empresa_id = 1;');
      expect(val).toBe('90');

      expect(() => {
        runSqlite(dbPath, "UPDATE empresas_config SET planejamento_simulador_regra_quinzena = 'INVALID' WHERE empresa_id = 1;");
      }).toThrow(/CHECK constraint failed/);

      runSqlite(dbPath, "UPDATE empresas_config SET planejamento_simulador_regra_quinzena = 'FOLGA' WHERE empresa_id = 1;");
      expect(runSqlite(dbPath, 'SELECT planejamento_simulador_regra_quinzena FROM empresas_config WHERE empresa_id = 1;')).toBe('FOLGA');

      runSqlite(dbPath, "UPDATE treinamentos_planejados SET planejamento_aprovacao_status = 'PENDENTE' WHERE id = 10;");
      
      expect(() => {
        runSqlite(dbPath, "UPDATE treinamentos_planejados SET planejamento_aprovacao_status = 'X' WHERE id = 10;");
      }).toThrow(/CHECK constraint failed/);

      const configColumns = runSqlite(
        dbPath,
        "SELECT name FROM pragma_table_info('empresas_config') WHERE name LIKE 'planejamento_simulador_%' ORDER BY name;",
      )
        .split('\n')
        .filter(Boolean);
      expect(new Set(configColumns).size).toBe(configColumns.length);
      expect(configColumns).toEqual(
        expect.arrayContaining([
          'planejamento_simulador_antecedencia_dias',
          'planejamento_simulador_regra_quinzena',
          'planejamento_simulador_permitir_sessao_compartilhada',
          'planejamento_simulador_aprovacao_obrigatoria',
        ]),
      );

      const planningColumns = runSqlite(
        dbPath,
        "SELECT name FROM pragma_table_info('treinamentos_planejados') WHERE name LIKE 'planejamento_aprov%' OR name = 'planejamento_revalidado_em' ORDER BY name;",
      )
        .split('\n')
        .filter(Boolean);
      expect(new Set(planningColumns).size).toBe(planningColumns.length);
      expect(planningColumns).toEqual(
        expect.arrayContaining([
          'planejamento_aprovacao_status',
          'planejamento_aprovacao_observacoes',
          'planejamento_aprovado_em',
          'planejamento_aprovado_por',
          'planejamento_revalidado_em',
        ]),
      );

      const sqliteMaster = runSqlite(
        dbPath,
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name IN ('empresas_config','treinamentos_planejados') ORDER BY name;",
      );
      expect(sqliteMaster).toContain('CHECK (planejamento_simulador_regra_quinzena IN');
      expect(sqliteMaster).toContain("planejamento_aprovacao_status IN ('RASCUNHO','PENDENTE','APROVADO','DEVOLVIDO','NAO_EXIGIDO')");

      expect(() => runSqlite(dbPath, migrationSql())).toThrow(/duplicate column name/i);

    } finally {
      rmSync(join(dbPath, '..'), { recursive: true, force: true });
    }
  });
});
