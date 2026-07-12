import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');
const LIB_PATH = join(ROOT, 'scripts/staging/reconcile-approved-migration-ledger-lib.mjs');
const tempDirs: string[] = [];

function runSqlite(dbPath: string, sql: string): string {
  const result = spawnSync('sqlite3', [dbPath], {
    input: sql,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'sqlite3 falhou');
  }
  return String(result.stdout || '');
}

async function loadLib() {
  return import(`file://${LIB_PATH}`);
}

function setupDb() {
  const dir = mkdtempSync(join(tmpdir(), 'staging-ledger-reconcile-'));
  tempDirs.push(dir);
  const dbPath = join(dir, 'reconcile.db');

  writeFileSync(
    join(dir, 'seed.sql'),
    `
    CREATE TABLE d1_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE TABLE empresas (id INTEGER PRIMARY KEY);
    CREATE TABLE simulador_agendamentos (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL);
    CREATE TABLE sessoes_participantes (id INTEGER PRIMARY KEY, sessao_id INTEGER NOT NULL);
    CREATE TABLE treinamentos_planejados (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL);
    CREATE TABLE modelos_sessao (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL);
    CREATE TABLE simulador_agendamento_segmentos (
      id INTEGER PRIMARY KEY,
      uuid TEXT NOT NULL,
      empresa_id INTEGER NOT NULL,
      agendamento_id INTEGER NOT NULL,
      ordem INTEGER NOT NULL,
      inicio TEXT NOT NULL,
      fim TEXT NOT NULL,
      duracao_minutos INTEGER NOT NULL,
      atribuicao_curricular_id INTEGER,
      status TEXT NOT NULL DEFAULT 'ATIVO',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      finalidade_codigo TEXT NOT NULL DEFAULT 'OUTRO',
      finalidade_titulo TEXT
    );
    CREATE UNIQUE INDEX uq_sim_agendamento_segmentos_id_empresa ON simulador_agendamento_segmentos(id, empresa_id);
    CREATE TABLE simulador_atribuicoes_curriculares (
      id INTEGER PRIMARY KEY,
      uuid TEXT NOT NULL UNIQUE,
      empresa_id INTEGER NOT NULL,
      agendamento_id INTEGER NOT NULL,
      participante_id INTEGER NOT NULL,
      treinamento_planejado_id INTEGER,
      modelo_sessao_id INTEGER,
      gera_ficha INTEGER NOT NULL DEFAULT 1,
      carga_horaria_total_minutos INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ATIVA',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    );
    CREATE UNIQUE INDEX uq_sim_atribuicoes_curriculares_id_empresa ON simulador_atribuicoes_curriculares(id, empresa_id);
    CREATE INDEX idx_sim_atribuicoes_agendamento ON simulador_atribuicoes_curriculares(agendamento_id);
    CREATE INDEX idx_sim_atribuicoes_empresa ON simulador_atribuicoes_curriculares(empresa_id);
    CREATE INDEX idx_sim_atribuicoes_participante ON simulador_atribuicoes_curriculares(participante_id);
    CREATE UNIQUE INDEX idx_sim_atribuicoes_ativas_por_participante_modelo
      ON simulador_atribuicoes_curriculares(agendamento_id, participante_id, COALESCE(modelo_sessao_id, -1))
      WHERE deleted_at IS NULL;
    CREATE TABLE simulador_segmento_atribuicoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      empresa_id INTEGER NOT NULL,
      segmento_id INTEGER NOT NULL,
      atribuicao_curricular_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PLANEJADA' CHECK(status IN ('PLANEJADA', 'CUMPRIDA', 'CANCELADA')),
      observacao TEXT,
      concluido_em TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      gera_ficha INTEGER NOT NULL DEFAULT 1 CHECK (gera_ficha IN (0, 1)),
      FOREIGN KEY (empresa_id) REFERENCES empresas(id),
      FOREIGN KEY (segmento_id, empresa_id) REFERENCES simulador_agendamento_segmentos(id, empresa_id),
      FOREIGN KEY (atribuicao_curricular_id, empresa_id) REFERENCES simulador_atribuicoes_curriculares(id, empresa_id)
    );
    CREATE INDEX idx_sim_segmento_atribuicoes_empresa ON simulador_segmento_atribuicoes(empresa_id);
    CREATE INDEX idx_sim_segmento_atribuicoes_segmento ON simulador_segmento_atribuicoes(segmento_id);
    CREATE INDEX idx_sim_segmento_atribuicoes_atribuicao ON simulador_segmento_atribuicoes(atribuicao_curricular_id);
    CREATE UNIQUE INDEX idx_sim_segmento_atribuicoes_ativa
      ON simulador_segmento_atribuicoes(segmento_id, atribuicao_curricular_id)
      WHERE deleted_at IS NULL;
    CREATE UNIQUE INDEX uq_sim_segmento_atribuicoes_id_empresa ON simulador_segmento_atribuicoes(id, empresa_id);
    CREATE TABLE modelos_sessao_requisitos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      empresa_id INTEGER NOT NULL,
      modelo_sessao_id INTEGER NOT NULL,
      requisito_modelo_sessao_id INTEGER NOT NULL,
      tipo_requisito TEXT NOT NULL DEFAULT 'ETAPA_ANTERIOR' CHECK(tipo_requisito IN ('ETAPA_ANTERIOR', 'OBSERVACAO', 'OUTRO')),
      obrigatorio INTEGER NOT NULL DEFAULT 1 CHECK(obrigatorio IN (0, 1)),
      ordem INTEGER,
      observacao TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      FOREIGN KEY (empresa_id) REFERENCES empresas(id),
      FOREIGN KEY (modelo_sessao_id, empresa_id) REFERENCES modelos_sessao(id, empresa_id),
      FOREIGN KEY (requisito_modelo_sessao_id, empresa_id) REFERENCES modelos_sessao(id, empresa_id)
    );
    CREATE UNIQUE INDEX uq_modelos_sessao_id_empresa ON modelos_sessao(id, empresa_id);
    CREATE INDEX idx_modelos_sessao_requisitos_empresa ON modelos_sessao_requisitos(empresa_id);
    CREATE INDEX idx_modelos_sessao_requisitos_modelo ON modelos_sessao_requisitos(modelo_sessao_id);
    CREATE INDEX idx_modelos_sessao_requisitos_requisito ON modelos_sessao_requisitos(requisito_modelo_sessao_id);
    CREATE UNIQUE INDEX idx_modelos_sessao_requisitos_ativo
      ON modelos_sessao_requisitos(modelo_sessao_id, requisito_modelo_sessao_id, tipo_requisito)
      WHERE deleted_at IS NULL;
    CREATE TABLE fichas_sessao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE NOT NULL,
      agendamento_slot_id INTEGER,
      colaborador_id_aluno INTEGER NOT NULL,
      instrutor_id INTEGER NOT NULL,
      empresa_id INTEGER NOT NULL,
      deleted_at DATETIME,
      atribuicao_curricular_id INTEGER REFERENCES simulador_atribuicoes_curriculares(id),
      segmento_atribuicao_id INTEGER REFERENCES simulador_segmento_atribuicoes(id)
    );
    CREATE INDEX idx_fichas_sessao_segmento_atribuicao ON fichas_sessao(segmento_atribuicao_id);
    CREATE UNIQUE INDEX idx_fichas_sessao_segmento_atribuicao_ativa
      ON fichas_sessao(segmento_atribuicao_id)
      WHERE segmento_atribuicao_id IS NOT NULL AND deleted_at IS NULL;
    CREATE TRIGGER trg_sim_atribuicoes_curriculares_tenant_guard_insert
    BEFORE INSERT ON simulador_atribuicoes_curriculares
    FOR EACH ROW
    BEGIN
      SELECT CASE WHEN 1 = 0 THEN RAISE(ABORT, 'x') END;
    END;
    CREATE TRIGGER trg_sim_atribuicoes_curriculares_tenant_guard_update
    BEFORE UPDATE ON simulador_atribuicoes_curriculares
    FOR EACH ROW
    BEGIN
      SELECT CASE WHEN 1 = 0 THEN RAISE(ABORT, 'x') END;
    END;
    CREATE TRIGGER trg_fichas_sessao_segmento_atribuicao_tenant_guard_insert
    BEFORE INSERT ON fichas_sessao
    FOR EACH ROW
    WHEN NEW.segmento_atribuicao_id IS NOT NULL
    BEGIN
      SELECT CASE WHEN 1 = 0 THEN RAISE(ABORT, 'x') END;
    END;
    CREATE TRIGGER trg_fichas_sessao_segmento_atribuicao_tenant_guard_update
    BEFORE UPDATE ON fichas_sessao
    FOR EACH ROW
    WHEN NEW.segmento_atribuicao_id IS NOT NULL
    BEGIN
      SELECT CASE WHEN 1 = 0 THEN RAISE(ABORT, 'x') END;
    END;
    `,
    'utf8',
  );

  runSqlite(dbPath, readFileSync(join(dir, 'seed.sql'), 'utf8'));
  return dbPath;
}

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('reconcile-approved-migration-ledger', () => {
  it('classifies the approved migrations as fully applied on the expected schema shape', async () => {
    const dbPath = setupDb();
    const lib = await loadLib();
    const inspections = await lib.inspectApprovedMigrations(lib.createSqliteCliExecutor(dbPath));
    expect(inspections.map((item: { result: string }) => item.result)).toEqual([
      'INTEGRALMENTE_APLICADA',
      'INTEGRALMENTE_APLICADA',
      'INTEGRALMENTE_APLICADA',
    ]);
  });

  it('builds idempotent remote-safe ledger registration SQL for 0421–0423', async () => {
    const dbPath = setupDb();
    const lib = await loadLib();
    const sql = lib.buildLedgerInsertSql(['id', 'name', 'applied_at'], lib.APPROVED_LEDGER_RECONCILIATIONS);

    expect(sql).not.toContain('BEGIN;');
    expect(sql).not.toContain('COMMIT;');
    runSqlite(dbPath, sql);
    runSqlite(dbPath, sql);

    const names = runSqlite(dbPath, 'SELECT name FROM d1_migrations ORDER BY name;')
      .trim()
      .split('\n')
      .filter(Boolean);

    expect(names).toEqual([
      '0421_shared_session_segment_curricula.sql',
      '0422_modelos_sessao_requisitos.sql',
      '0423_shared_session_multi_curricula_per_participant.sql',
    ]);
  });
});
