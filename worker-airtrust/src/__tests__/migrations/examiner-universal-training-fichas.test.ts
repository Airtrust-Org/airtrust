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

const TECNICOS = [
  'EXA-V01-01', 'EXA-V01-02', 'EXA-V01-03', 'EXA-V01-04', 'EXA-V01-05', 'EXA-V01-06',
  'EXA-V01-07', 'EXA-V01-08', 'EXA-V01-09', 'EXA-V01-10', 'EXA-V01-11', 'EXA-V01-12',
  'EXA-V01-13', 'EXA-V01-14', 'EXA-V01-15', 'EXA-V01-16', 'EXA-V01-17', 'EXA-V01-18',
];

/**
 * Minimal schema mirroring the additive shape reached after 0405/0421/0422/0423,
 * plus the pre-existing modelos_sessao/manobras/modelos_sessao_manobras tables
 * and tipos_sessao that 0424 depends on. Mirrors the convention already used by
 * shared-session-backend-schema.test.ts.
 */
function setupDb(): string {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-examiner-universal-'));
  const dbPath = join(dir, 'examiner-universal.db');

  runSqlite(
    dbPath,
    `
      PRAGMA foreign_keys = ON;

      CREATE TABLE empresas (
        id INTEGER PRIMARY KEY,
        nome TEXT
      );
      INSERT INTO empresas (id, nome) VALUES (6, 'Costa do Sol');

      CREATE TABLE simulador_agendamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT,
        simulador_id INTEGER,
        funcionario_id INTEGER,
        data TEXT,
        hora_inicio TEXT,
        hora_fim TEXT,
        duracao_minutos INTEGER,
        instrutor_id INTEGER,
        tipo_sessao TEXT,
        template_id INTEGER,
        status TEXT,
        observacoes TEXT,
        nome TEXT,
        empresa_id INTEGER NOT NULL,
        deleted_at TEXT
      );

      CREATE TABLE sessoes_participantes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT,
        sessao_id INTEGER,
        funcionario_id INTEGER,
        funcao TEXT,
        status TEXT,
        deleted_at TEXT
      );

      CREATE TABLE treinamentos_planejados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL,
        deleted_at TEXT
      );

      CREATE TABLE tipos_sessao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT,
        nome TEXT,
        empresa_id INTEGER NOT NULL,
        deleted_at TEXT
      );
      INSERT INTO tipos_sessao (id, codigo, nome, empresa_id, deleted_at)
      VALUES (1, 'EXA', 'Examinador', 6, NULL);

      CREATE TABLE modelos_sessao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT NOT NULL UNIQUE,
        nome TEXT,
        tipo TEXT,
        descricao TEXT,
        duracao_estimada INTEGER,
        tipo_aeronave TEXT,
        tipo_sessao_id INTEGER,
        ativo BOOLEAN DEFAULT 1,
        empresa_id INTEGER NOT NULL,
        created_at DATETIME,
        updated_at DATETIME,
        deleted_at TEXT
      );

      CREATE TABLE manobras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT,
        nome TEXT,
        descricao TEXT,
        categoria TEXT,
        tipo_sessao TEXT,
        tipo_aeronave TEXT,
        ordem INTEGER,
        empresa_id INTEGER,
        deleted_at TEXT
      );

      CREATE TABLE modelos_sessao_manobras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        modelo_id INTEGER NOT NULL,
        manobra_id INTEGER NOT NULL,
        ordem INTEGER NOT NULL DEFAULT 0,
        obrigatoria BOOLEAN DEFAULT 1,
        tripulante TEXT DEFAULT 'AB',
        deleted_at TEXT
      );

      CREATE TABLE fichas_sessao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT,
        agendamento_slot_id INTEGER,
        colaborador_id_aluno INTEGER,
        instrutor_id INTEGER,
        tipo_sessao TEXT,
        tipo_aeronave TEXT,
        data_sessao TEXT,
        status TEXT,
        template_id INTEGER,
        empresa_id INTEGER NOT NULL,
        deleted_at TEXT
      );

      INSERT INTO simulador_agendamentos (
        uuid, simulador_id, funcionario_id, data, hora_inicio, hora_fim, duracao_minutos,
        instrutor_id, tipo_sessao, template_id, status, observacoes, nome, empresa_id, deleted_at
      ) VALUES (
        'sessao-legacy', 10, 101, '2026-06-09', '07:00', '09:00', 120,
        201, 'PER', 301, 'AGENDADO', NULL, 'Sessão simples', 6, NULL
      );

      -- Precedent required for tenant resolution: CRED-EXA already belongs to
      -- empresa 6, mirroring 0165_migrate_to_costa_do_sol.sql (production
      -- lineage). 0424 derives empresa_id from this row by natural key.
      INSERT INTO modelos_sessao (codigo, nome, tipo, ativo, empresa_id, tipo_aeronave)
      VALUES ('CRED-EXA', 'CREDENCIAMENTO DE EXAMINADOR', 'RECORRENTE', 1, 6, NULL);
    `,
  );

  runSqlite(dbPath, MIGRATION_405);
  runSqlite(dbPath, MIGRATION_421);
  runSqlite(dbPath, MIGRATION_422);
  runSqlite(dbPath, MIGRATION_423);

  return dbPath;
}

describe('0424 examiner universal training fichas', () => {
  it('creates exactly 4 universal models with 18 técnicos each, tenant-derived from CRED-EXA, never guessed', () => {
    const dbPath = setupDb();
    try {
      runSqlite(dbPath, MIGRATION_424);

      const modelos = runSqlite(
        dbPath,
        `SELECT codigo, empresa_id, IFNULL(tipo_aeronave,'') , duracao_estimada
         FROM modelos_sessao WHERE codigo LIKE 'EXA-V0%' ORDER BY codigo;`,
      );
      expect(modelos.split('\n')).toEqual([
        'EXA-V01|6||60',
        'EXA-V02|6||60',
        'EXA-V03|6||60',
        'EXA-V04|6||60',
      ]);

      for (const codigo of ['EXA-V01', 'EXA-V02', 'EXA-V03', 'EXA-V04']) {
        expect(
          Number(
            runSqlite(
              dbPath,
              `SELECT COUNT(*) FROM manobras WHERE codigo LIKE '${codigo}-%' AND empresa_id = 6;`,
            ),
          ),
        ).toBe(18);
        expect(
          Number(
            runSqlite(
              dbPath,
              `SELECT COUNT(*) FROM manobras WHERE codigo LIKE '${codigo}-%' AND tipo_aeronave IS NOT NULL;`,
            ),
          ),
        ).toBe(0);
        expect(
          Number(
            runSqlite(
              dbPath,
              `SELECT COUNT(*) FROM modelos_sessao_manobras msm
               JOIN modelos_sessao ms ON ms.id = msm.modelo_id
               WHERE ms.codigo = '${codigo}';`,
            ),
          ),
        ).toBe(18);
      }

      // Order is preserved end-to-end (matches EXA-V01-01..18 sequence).
      const ordered = runSqlite(
        dbPath,
        `SELECT m.codigo FROM modelos_sessao_manobras msm
         JOIN modelos_sessao ms ON ms.id = msm.modelo_id
         JOIN manobras m ON m.id = msm.manobra_id
         WHERE ms.codigo = 'EXA-V01'
         ORDER BY msm.ordem ASC;`,
      );
      expect(ordered.split('\n')).toEqual(TECNICOS);

      expect(runSqlite(dbPath, 'PRAGMA integrity_check;')).toBe('ok');
      expect(runSqlite(dbPath, 'SELECT COUNT(*) FROM pragma_foreign_key_check();')).toBe('0');
    } finally {
      rmSync(join(dbPath, '..'), { recursive: true, force: true });
    }
  });

  it('links the 4 models via sequential ETAPA_ANTERIOR requisitos, never a minutes-sum shortcut', () => {
    const dbPath = setupDb();
    try {
      runSqlite(dbPath, MIGRATION_424);

      const requisitos = runSqlite(
        dbPath,
        `SELECT m1.codigo, m2.codigo, r.tipo_requisito, r.obrigatorio
         FROM modelos_sessao_requisitos r
         JOIN modelos_sessao m1 ON m1.id = r.modelo_sessao_id
         JOIN modelos_sessao m2 ON m2.id = r.requisito_modelo_sessao_id
         WHERE m1.codigo LIKE 'EXA-V0%'
         ORDER BY m1.codigo;`,
      );
      expect(requisitos.split('\n')).toEqual([
        'EXA-V02|EXA-V01|ETAPA_ANTERIOR|1',
        'EXA-V03|EXA-V02|ETAPA_ANTERIOR|1',
        'EXA-V04|EXA-V03|ETAPA_ANTERIOR|1',
      ]);
    } finally {
      rmSync(join(dbPath, '..'), { recursive: true, force: true });
    }
  });

  it('is idempotent: re-running the migration does not duplicate models, itens, links, or requisitos', () => {
    const dbPath = setupDb();
    try {
      runSqlite(dbPath, MIGRATION_424);
      runSqlite(dbPath, MIGRATION_424);

      expect(Number(runSqlite(dbPath, `SELECT COUNT(*) FROM modelos_sessao WHERE codigo LIKE 'EXA-V0%';`))).toBe(4);
      expect(Number(runSqlite(dbPath, `SELECT COUNT(*) FROM manobras WHERE codigo LIKE 'EXA-V0%-%';`))).toBe(72);
      expect(
        Number(
          runSqlite(
            dbPath,
            `SELECT COUNT(*) FROM modelos_sessao_manobras msm
             JOIN modelos_sessao ms ON ms.id = msm.modelo_id
             WHERE ms.codigo LIKE 'EXA-V0%';`,
          ),
        ),
      ).toBe(72);
      expect(
        Number(
          runSqlite(
            dbPath,
            `SELECT COUNT(*) FROM modelos_sessao_requisitos r
             JOIN modelos_sessao m1 ON m1.id = r.modelo_sessao_id
             WHERE m1.codigo LIKE 'EXA-V0%';`,
          ),
        ),
      ).toBe(3);
    } finally {
      rmSync(join(dbPath, '..'), { recursive: true, force: true });
    }
  });

  it('fails explicitly (never a silent zero-model success) when there is no auditable CRED-EXA tenant anchor', () => {
    const dir = mkdtempSync(join(tmpdir(), 'airtrust-examiner-universal-no-tenant-'));
    const dbPath = join(dir, 'no-tenant.db');
    try {
      runSqlite(
        dbPath,
        `
          PRAGMA foreign_keys = ON;
          CREATE TABLE empresas (id INTEGER PRIMARY KEY, nome TEXT);
          CREATE TABLE simulador_agendamentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT, simulador_id INTEGER, funcionario_id INTEGER,
            data TEXT, hora_inicio TEXT, hora_fim TEXT, duracao_minutos INTEGER, instrutor_id INTEGER,
            tipo_sessao TEXT, template_id INTEGER, status TEXT, observacoes TEXT, nome TEXT,
            empresa_id INTEGER NOT NULL, deleted_at TEXT
          );
          CREATE TABLE sessoes_participantes (
            id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT, sessao_id INTEGER, funcionario_id INTEGER,
            funcao TEXT, status TEXT, deleted_at TEXT
          );
          CREATE TABLE treinamentos_planejados (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, deleted_at TEXT);
          CREATE TABLE tipos_sessao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, nome TEXT, empresa_id INTEGER NOT NULL, deleted_at TEXT);
          CREATE TABLE modelos_sessao (
            id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL UNIQUE, nome TEXT, tipo TEXT, descricao TEXT,
            duracao_estimada INTEGER, tipo_aeronave TEXT, tipo_sessao_id INTEGER, ativo BOOLEAN DEFAULT 1,
            empresa_id INTEGER NOT NULL, created_at DATETIME, updated_at DATETIME, deleted_at TEXT
          );
          CREATE TABLE manobras (
            id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, nome TEXT, descricao TEXT, categoria TEXT,
            tipo_sessao TEXT, tipo_aeronave TEXT, ordem INTEGER, empresa_id INTEGER, deleted_at TEXT
          );
          CREATE TABLE modelos_sessao_manobras (
            id INTEGER PRIMARY KEY AUTOINCREMENT, modelo_id INTEGER NOT NULL, manobra_id INTEGER NOT NULL,
            ordem INTEGER NOT NULL DEFAULT 0, obrigatoria BOOLEAN DEFAULT 1, tripulante TEXT DEFAULT 'AB', deleted_at TEXT
          );
          CREATE TABLE fichas_sessao (
            id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT, agendamento_slot_id INTEGER, colaborador_id_aluno INTEGER,
            instrutor_id INTEGER, tipo_sessao TEXT, tipo_aeronave TEXT, data_sessao TEXT, status TEXT,
            template_id INTEGER, empresa_id INTEGER NOT NULL, deleted_at TEXT
          );
        `,
      );
      runSqlite(dbPath, MIGRATION_405);
      runSqlite(dbPath, MIGRATION_421);
      runSqlite(dbPath, MIGRATION_422);
      runSqlite(dbPath, MIGRATION_423);

      // No CRED-EXA row anywhere in this database — no auditable tenant lineage.
      // The migration must abort loudly (non-zero exit, CHECK constraint
      // violation) instead of silently succeeding with zero models created.
      expect(() => runSqlite(dbPath, MIGRATION_424)).toThrow(
        /CHECK constraint failed: cred_exa_tenant_anchor_present = 1/,
      );

      expect(Number(runSqlite(dbPath, `SELECT COUNT(*) FROM modelos_sessao WHERE codigo LIKE 'EXA-V0%';`))).toBe(0);
      expect(Number(runSqlite(dbPath, `SELECT COUNT(*) FROM manobras WHERE codigo LIKE 'EXA-V0%-%';`))).toBe(0);
      expect(Number(runSqlite(dbPath, `SELECT COUNT(*) FROM modelos_sessao_requisitos;`))).toBe(0);
      // In particular: no fallback to empresa_id 1 or 6 despite them not existing here.
      expect(Number(runSqlite(dbPath, `SELECT COUNT(*) FROM modelos_sessao WHERE empresa_id IN (1, 6);`))).toBe(0);

      expect(runSqlite(dbPath, 'PRAGMA integrity_check;')).toBe('ok');
    } finally {
      rmSync(join(dbPath, '..'), { recursive: true, force: true });
    }
  });

  it('succeeds and creates all 4 models when CRED-EXA exists, and remains idempotent across repeated runs with the guard active', () => {
    const dbPath = setupDb();
    try {
      runSqlite(dbPath, MIGRATION_424);
      runSqlite(dbPath, MIGRATION_424);
      runSqlite(dbPath, MIGRATION_424);

      expect(Number(runSqlite(dbPath, `SELECT COUNT(*) FROM modelos_sessao WHERE codigo LIKE 'EXA-V0%';`))).toBe(4);
      expect(runSqlite(dbPath, 'PRAGMA integrity_check;')).toBe('ok');
      expect(runSqlite(dbPath, 'SELECT COUNT(*) FROM pragma_foreign_key_check();')).toBe('0');
    } finally {
      rmSync(join(dbPath, '..'), { recursive: true, force: true });
    }
  });

  it('never touches the pre-existing CRED-EXA row or its own manobras', () => {
    const dbPath = setupDb();
    try {
      const before = runSqlite(
        dbPath,
        `SELECT codigo, nome, tipo, empresa_id FROM modelos_sessao WHERE codigo = 'CRED-EXA';`,
      );

      runSqlite(dbPath, MIGRATION_424);

      const after = runSqlite(
        dbPath,
        `SELECT codigo, nome, tipo, empresa_id FROM modelos_sessao WHERE codigo = 'CRED-EXA';`,
      );
      expect(after).toBe(before);
      expect(Number(runSqlite(dbPath, `SELECT COUNT(*) FROM manobras WHERE codigo LIKE 'EXA-CGE-%' OR codigo LIKE 'EXA-NTS-%' OR codigo LIKE 'EXA-CND-%' OR codigo LIKE 'EXA-ETH-%';`))).toBe(0);
    } finally {
      rmSync(join(dbPath, '..'), { recursive: true, force: true });
    }
  });
});
