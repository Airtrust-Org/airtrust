import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function runSqlite(dbPath: string, sql: string): string {
  const result = spawnSync('sqlite3', [dbPath], {
    input: `${sql}\n`,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(`sqlite3 exited ${result.status}: ${result.stderr}`);
  }

  return result.stdout.trim();
}

function migrationSqlNamed(name: string): string {
  return readFileSync(join(__dirname, `../../../migrations/${name}`), 'utf8');
}

const MIGRATION_405 = migrationSqlNamed('0405_add_shared_session_backend.sql');
const MIGRATION_421 = migrationSqlNamed('0421_shared_session_segment_curricula.sql');
const MIGRATION_422 = migrationSqlNamed('0422_modelos_sessao_requisitos.sql');
const MIGRATION_423 = migrationSqlNamed('0423_shared_session_multi_curricula_per_participant.sql');
const MIGRATION_424 = migrationSqlNamed('0424_examiner_universal_training_fichas.sql');
const MIGRATION_425 = migrationSqlNamed('0425_examiner_event_models_and_assignment_owned_fichas.sql');

function setupMultiTenantDb(): string {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-examiner-multitenant-'));
  const dbPath = join(dir, 'examiner-multitenant.db');

  runSqlite(
    dbPath,
    `
      PRAGMA foreign_keys = ON;

      CREATE TABLE empresas (id INTEGER PRIMARY KEY, nome TEXT);
      INSERT INTO empresas (id, nome) VALUES (6, 'Costa do Sol'), (7, 'Tenant Sem CRED'), (8, 'Tenant Com CRED');

      CREATE TABLE simulador_agendamentos (id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT, simulador_id INTEGER, funcionario_id INTEGER, data TEXT, hora_inicio TEXT, hora_fim TEXT, duracao_minutos INTEGER, instrutor_id INTEGER, tipo_sessao TEXT, template_id INTEGER, status TEXT, observacoes TEXT, nome TEXT, empresa_id INTEGER NOT NULL, deleted_at TEXT);
      CREATE TABLE sessoes_participantes (id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT, sessao_id INTEGER, funcionario_id INTEGER, funcao TEXT, status TEXT, deleted_at TEXT);
      CREATE TABLE treinamentos_planejados (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, deleted_at TEXT);
      CREATE TABLE tipos_sessao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, nome TEXT, empresa_id INTEGER NOT NULL, deleted_at TEXT);
      INSERT INTO tipos_sessao (id, codigo, nome, empresa_id, deleted_at) VALUES (1, 'EXA', 'Examinador', 6, NULL), (2, 'EXA', 'Examinador', 8, NULL);

      CREATE TABLE modelos_sessao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL, nome TEXT, tipo TEXT, descricao TEXT, duracao_estimada INTEGER, tipo_aeronave TEXT, tipo_sessao_id INTEGER, ativo BOOLEAN DEFAULT 1, empresa_id INTEGER NOT NULL, created_at DATETIME, updated_at DATETIME, deleted_at TEXT);
      CREATE TABLE manobras (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, nome TEXT, descricao TEXT, categoria TEXT, tipo_sessao TEXT, tipo_aeronave TEXT, ordem INTEGER, empresa_id INTEGER, deleted_at TEXT);
      CREATE TABLE modelos_sessao_manobras (id INTEGER PRIMARY KEY AUTOINCREMENT, modelo_id INTEGER NOT NULL, manobra_id INTEGER NOT NULL, ordem INTEGER NOT NULL DEFAULT 0, obrigatoria BOOLEAN DEFAULT 1, tripulante TEXT DEFAULT 'AB', deleted_at TEXT);
      CREATE TABLE fichas_sessao (id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT, agendamento_slot_id INTEGER, colaborador_id_aluno INTEGER, instrutor_id INTEGER, tipo_sessao TEXT, tipo_aeronave TEXT, data_sessao TEXT, status TEXT, template_id INTEGER, empresa_id INTEGER NOT NULL, deleted_at TEXT);
      
      INSERT INTO modelos_sessao (codigo, nome, tipo, ativo, empresa_id) VALUES ('CRED-EXA', 'CREDENCIAMENTO', 'RECORRENTE', 1, 6);
      INSERT INTO modelos_sessao (codigo, nome, tipo, ativo, empresa_id) VALUES ('CRED-EXA', 'CREDENCIAMENTO', 'RECORRENTE', 1, 8);
      
      INSERT INTO modelos_sessao (codigo, nome, tipo, ativo, empresa_id) VALUES ('EXA-V01', 'Old 1', 'RECORRENTE', 1, 6);
      INSERT INTO modelos_sessao (codigo, nome, tipo, ativo, empresa_id) VALUES ('EXA-V01', 'Old 1 (Tenant 7)', 'RECORRENTE', 1, 7);
      INSERT INTO modelos_sessao (codigo, nome, tipo, ativo, empresa_id) VALUES ('EXA-V01', 'Old 1 (Tenant 8)', 'RECORRENTE', 1, 8);
    `
  );

  runSqlite(dbPath, MIGRATION_405);
  runSqlite(dbPath, MIGRATION_421);
  runSqlite(dbPath, MIGRATION_422);
  runSqlite(dbPath, MIGRATION_423);

  return dbPath;
}

describe('0425 examiner multi-tenant rules', () => {
  it('creates EXA-E01 and EXA-E02 in ALL tenants with CRED-EXA', () => {
    const dbPath = setupMultiTenantDb();
    try {
      runSqlite(dbPath, MIGRATION_425);
      const output = runSqlite(dbPath, "SELECT codigo, empresa_id, ativo FROM modelos_sessao WHERE codigo IN ('EXA-E01', 'EXA-E02') ORDER BY empresa_id, codigo;");
      expect(output.split('\n')).toEqual([
        'EXA-E01|6|1',
        'EXA-E02|6|1',
        'EXA-E01|8|1',
        'EXA-E02|8|1',
      ]);
    } finally { rmSync(join(dbPath, '..'), { recursive: true, force: true }); }
  });

  it('does not touch legacy EXA-V01 in tenants without CRED-EXA', () => {
    const dbPath = setupMultiTenantDb();
    try {
      runSqlite(dbPath, MIGRATION_425);
      const output = runSqlite(dbPath, "SELECT empresa_id, ativo FROM modelos_sessao WHERE codigo = 'EXA-V01' ORDER BY empresa_id;");
      expect(output.split('\n')).toEqual([
        '6|0', // Inactivated in tenant 6 (has CRED-EXA)
        '7|1', // Untouched in tenant 7 (no CRED-EXA)
        '8|0', // Inactivated in tenant 8 (has CRED-EXA)
      ]);
    } finally { rmSync(join(dbPath, '..'), { recursive: true, force: true }); }
  });

  it('enforces UNIQUE index across empresa_id and atribuicao_curricular_id', () => {
    const dbPath = setupMultiTenantDb();
    try {
      runSqlite(dbPath, MIGRATION_425);
      
      // Allow different tenants to use the same attribution ID
      runSqlite(dbPath, "INSERT INTO fichas_sessao (uuid, empresa_id, atribuicao_curricular_id, deleted_at) VALUES ('u1', 6, 999, NULL);");
      runSqlite(dbPath, "INSERT INTO fichas_sessao (uuid, empresa_id, atribuicao_curricular_id, deleted_at) VALUES ('u2', 8, 999, NULL);");
      
      // Reject duplicate within the same tenant
      expect(() => {
        runSqlite(dbPath, "INSERT INTO fichas_sessao (uuid, empresa_id, atribuicao_curricular_id, deleted_at) VALUES ('u3', 6, 999, NULL);");
      }).toThrow(/UNIQUE constraint failed/);

    } finally { rmSync(join(dbPath, '..'), { recursive: true, force: true }); }
  });
});
