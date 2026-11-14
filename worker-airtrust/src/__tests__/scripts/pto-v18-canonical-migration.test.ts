import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildCanonicalPtoV18Plan,
  buildPtoV18CanonicalMigrationStatements,
  buildPtoV18CanonicalRollbackStatements,
  PTO_V18_APPROVED_SOURCE_SHA,
  PTO_V18_MATRIX_VERSION,
} from '../../../scripts/lib/pto-v18-canonical-migration.mjs';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function sqliteExec(dbPath: string, sql: string) {
  const res = spawnSync('sqlite3', ['-bail', dbPath], {
    input: `PRAGMA foreign_keys = ON;\n${sql}`,
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    throw new Error(`sqlite3 failed: ${res.stderr || res.stdout}`);
  }
}

function sqliteJson<T = Record<string, unknown>>(dbPath: string, sql: string): T[] {
  const res = spawnSync('sqlite3', ['-json', dbPath], {
    input: `PRAGMA foreign_keys = ON;\n${sql}`,
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    throw new Error(`sqlite3 json failed: ${res.stderr || res.stdout}`);
  }
  const out = res.stdout.trim();
  return out ? (JSON.parse(out) as T[]) : [];
}

function createTestDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pto-v18-mig-'));
  tempDirs.push(dir);
  const dbPath = path.join(dir, 'test.sqlite');
  sqliteExec(
    dbPath,
    `
    CREATE TABLE empresas (id INTEGER PRIMARY KEY, nome TEXT NOT NULL);
    CREATE TABLE qualificacoes_tipos (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, codigo TEXT NOT NULL, nome TEXT NOT NULL, deleted_at TEXT NULL);
    CREATE TABLE tipos_sessao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL, nome TEXT NOT NULL, descricao TEXT, ativo INTEGER DEFAULT 1, ordem INTEGER, empresa_id INTEGER NOT NULL, created_at TEXT, updated_at TEXT, deleted_at TEXT NULL);
    CREATE TABLE manobras (
      id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL, nome TEXT NOT NULL, categoria TEXT, descricao TEXT,
      nivel_dificuldade INTEGER, tempo_estimado INTEGER, pontuacao_minima REAL, created_at TEXT, updated_at TEXT,
      deleted_at TEXT NULL, tipo_sessao TEXT DEFAULT 'TREINAMENTO', tipo_aeronave TEXT DEFAULT 'AW139',
      ordem INTEGER DEFAULT 1, empresa_id INTEGER REFERENCES empresas(id), referencias_json TEXT NULL
    );
    CREATE UNIQUE INDEX ux_manobras_empresa_codigo_active ON manobras(empresa_id, codigo) WHERE deleted_at IS NULL;
    CREATE TABLE modelos_sessao (
      id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL UNIQUE, nome TEXT NOT NULL, tipo TEXT, descricao TEXT,
      duracao_estimada INTEGER, treinamento_id TEXT, ordem_no_treinamento INTEGER, ativo BOOLEAN DEFAULT 1,
      created_at DATETIME, updated_at DATETIME, deleted_at DATETIME NULL, tipo_sessao_id INTEGER,
      tipo_aeronave TEXT, codigo_aeronave TEXT, gera_qualificacao BOOLEAN DEFAULT 0, empresa_id INTEGER NOT NULL,
      modelo_aeronave TEXT, qualificacao_tipo_id INTEGER NULL REFERENCES qualificacoes_tipos(id)
    );
    CREATE TABLE modelos_sessao_versionamento (
      modelo_id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, codigo_canonico TEXT NOT NULL,
      versao_numero INTEGER NOT NULL CHECK(versao_numero >= 1), versao_matriz TEXT NOT NULL, is_current INTEGER NOT NULL DEFAULT 1,
      modelo_anterior_id INTEGER, efetivo_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, efetivo_ate TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(empresa_id, codigo_canonico, versao_numero)
    );
    CREATE TABLE modelos_sessao_manobras (
      id INTEGER PRIMARY KEY AUTOINCREMENT, modelo_id INTEGER NOT NULL, manobra_id INTEGER NOT NULL,
      ordem INTEGER NOT NULL, obrigatoria BOOLEAN DEFAULT 1, observacoes TEXT, created_at DATETIME, updated_at DATETIME,
      deleted_at DATETIME NULL, created_by TEXT, updated_by TEXT, tripulante TEXT NOT NULL DEFAULT 'AB'
    );
    CREATE TABLE modelos_sessao_manobras_contexto (
      modelo_manobra_id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, metadados_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TRIGGER trg_modelo_manobra_versionada_imutavel_insert
    BEFORE INSERT ON modelos_sessao_manobras
    WHEN EXISTS (SELECT 1 FROM modelos_sessao_versionamento v WHERE v.modelo_id = NEW.modelo_id AND v.versao_matriz <> 'LEGACY')
    BEGIN
      SELECT RAISE(ABORT, 'vínculo de versão publicada é imutável');
    END;
    CREATE TRIGGER trg_modelo_manobra_contexto_tenant_insert
    BEFORE INSERT ON modelos_sessao_manobras_contexto
    WHEN EXISTS (
      SELECT 1 FROM modelos_sessao_manobras msm
      JOIN modelos_sessao_versionamento v ON v.modelo_id = msm.modelo_id
      WHERE msm.id = NEW.modelo_manobra_id AND v.versao_matriz <> 'LEGACY'
    )
    BEGIN
      SELECT RAISE(ABORT, 'contexto de versão publicada é imutável');
    END;
    CREATE TRIGGER trg_modelo_versao_mesmo_tenant_insert
    BEFORE INSERT ON modelos_sessao_versionamento
    BEGIN
      SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM modelos_sessao ms WHERE ms.id = NEW.modelo_id AND ms.empresa_id = NEW.empresa_id
      ) THEN RAISE(ABORT, 'modelo e empresa divergentes') END;
      SELECT CASE WHEN NEW.modelo_anterior_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM modelos_sessao_versionamento previous
        WHERE previous.modelo_id = NEW.modelo_anterior_id AND previous.empresa_id = NEW.empresa_id
          AND previous.codigo_canonico = NEW.codigo_canonico AND previous.versao_numero = NEW.versao_numero - 1
      ) THEN RAISE(ABORT, 'modelo anterior inexistente ou pertence a outro tenant') END;
      SELECT CASE WHEN NEW.versao_numero = 1 AND NEW.modelo_anterior_id IS NOT NULL
        THEN RAISE(ABORT, 'versão inicial não pode ter predecessor') END;
      SELECT CASE WHEN NEW.versao_numero > 1 AND NEW.modelo_anterior_id IS NULL
        THEN RAISE(ABORT, 'nova versão exige predecessor imediato') END;
    END;
    CREATE TRIGGER trg_modelo_versao_integridade_update
    BEFORE UPDATE ON modelos_sessao_versionamento
    BEGIN
      SELECT CASE WHEN OLD.is_current = 0 AND NEW.is_current = 1
        THEN RAISE(ABORT, 'versão histórica não pode voltar a vigente; crie versão de reversão auditada') END;
    END;
    CREATE TABLE fichas_sessao (
      id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, modelo_id INTEGER NOT NULL,
      status TEXT, resultado_final TEXT, aprovado INTEGER, assinatura_instrutor INTEGER DEFAULT 0,
      assinatura_instrutor_timestamp TEXT, deleted_at TEXT NULL
    );
    CREATE TABLE fichas_sessao_manobras (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ficha_id INTEGER NOT NULL, codigo TEXT NOT NULL,
      descricao TEXT, categoria TEXT, ordem INTEGER, resultado TEXT, tripulante TEXT NOT NULL DEFAULT 'AB',
      nome TEXT, deleted_at TEXT NULL
    );
    CREATE TABLE simuladores_curriculos_voo_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, qualificacao_tipo_id INTEGER NOT NULL,
      total_ciclos INTEGER NOT NULL, ano_base INTEGER NOT NULL, ciclo_ano_base INTEGER NOT NULL, ativo INTEGER DEFAULT 1,
      deleted_at TEXT NULL
    );
    CREATE TABLE simuladores_curriculos_voo_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, qualificacao_tipo_id INTEGER NOT NULL,
      ciclo INTEGER NOT NULL, modelo_sessao_id INTEGER NOT NULL, codigo_canonico TEXT NOT NULL, ordem INTEGER NOT NULL,
      created_at TEXT, updated_at TEXT, deleted_at TEXT NULL
    );

    INSERT INTO empresas (id, nome) VALUES (6, 'Costa do Sol');
    INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, nome) VALUES
      (33, 6, 'G1', 'AW139 Periodico'), (40, 6, 'G2', 'SK76 Anual'),
      (46, 6, 'J', 'Instrutor'), (47, 6, 'M', 'Examinador'),
      (91, 6, 'R', 'Noturno Offshore'), (93, 6, 'T', 'Noturno Onshore'),
      (94, 6, 'Q', 'Experiencia Rota'), (106, 6, 'G1-SEM', 'AW139 Semestral'),
      (178, 6, 'G2-SEM', 'SK76 Semestral');
    INSERT INTO simuladores_curriculos_voo_config (empresa_id, qualificacao_tipo_id, total_ciclos, ano_base, ciclo_ano_base) VALUES
      (6, 33, 3, 2026, 2), (6, 106, 3, 2026, 2), (6, 40, 3, 2026, 2);

    INSERT INTO manobras (id, codigo, nome, categoria, tipo_aeronave, empresa_id) VALUES
      (364, 'A139-APP-02', 'Non-precision approach', 'PROCEDIMENTOS', 'AW139', 6);
    INSERT INTO modelos_sessao (id, codigo, nome, tipo, duracao_estimada, ativo, modelo_aeronave, empresa_id) VALUES
      (9, 'A139-I-01/12', 'Modelo Legado V1', 'SIMULADOR', 120, 0, 'AW139', 6),
      (10, 'A139-I-01/12@M2026.07-V2', 'Modelo Antigo', 'SIMULADOR', 120, 1, 'AW139', 6);
    INSERT INTO modelos_sessao_versionamento (modelo_id, empresa_id, codigo_canonico, versao_numero, versao_matriz, is_current, modelo_anterior_id, efetivo_ate) VALUES
      (9, 6, 'A139-I-01/12', 1, 'LEGACY', 0, NULL, CURRENT_TIMESTAMP),
      (10, 6, 'A139-I-01/12', 2, 'M2026.07', 1, 9, NULL);
    INSERT INTO simuladores_curriculos_voo_itens (empresa_id, qualificacao_tipo_id, ciclo, modelo_sessao_id, codigo_canonico, ordem) VALUES
      (6, 33, 1, 10, 'A139-P-04/04-C1-CHECK', 4);
    INSERT INTO fichas_sessao (id, empresa_id, modelo_id, status, resultado_final, aprovado, assinatura_instrutor, assinatura_instrutor_timestamp) VALUES
      (999, 6, 10, 'APROVADA', 'APROVADO', 1, 1, '2026-10-01T12:00:00Z');
    INSERT INTO fichas_sessao_manobras (id, ficha_id, codigo, descricao, categoria, ordem, resultado, tripulante, nome) VALUES
      (5001, 999, 'A139-APP-02', 'Non-precision approach', 'PROCEDIMENTOS', 1, '8', 'A', 'Non-precision approach');
    `,
  );
  return dbPath;
}

describe('PTO V18 canonical migration', () => {
  it('applies 88 models, 1584 positions, 625 maneuvers, PF A/B split, idempotently without altering signed history', () => {
    const plan = buildCanonicalPtoV18Plan();
    expect(plan.models).toHaveLength(88);
    expect(plan.items).toHaveLength(1584);
    expect(plan.maneuvers).toHaveLength(625);
    expect(plan.notechs).toHaveLength(15);

    const dbPath = createTestDb();
    const statements = buildPtoV18CanonicalMigrationStatements({ empresaId: 6 });
    const fullSql = statements.join('\n');

    // Apply once and twice (idempotency check)
    sqliteExec(dbPath, fullSql);
    sqliteExec(dbPath, fullSql);

    const activeModels = sqliteJson<{
      id: number;
      codigo: string;
      modelo_aeronave: string | null;
      duracao_estimada: number;
      codigo_canonico: string;
      versao_matriz: string;
    }>(
      dbPath,
      `SELECT ms.id, ms.codigo, ms.modelo_aeronave, ms.duracao_estimada, msv.codigo_canonico, msv.versao_matriz
       FROM modelos_sessao ms
       JOIN modelos_sessao_versionamento msv ON msv.modelo_id = ms.id
       WHERE ms.empresa_id = 6 AND ms.ativo = 1 AND ms.deleted_at IS NULL AND msv.is_current = 1`,
    );

    expect(activeModels).toHaveLength(88);
    expect(activeModels.every((m) => m.versao_matriz === PTO_V18_MATRIX_VERSION)).toBe(true);
    expect(activeModels.filter((m) => m.modelo_aeronave === 'AW139')).toHaveLength(37);
    expect(activeModels.filter((m) => m.modelo_aeronave === 'SK76')).toHaveLength(45);
    expect(activeModels.filter((m) => m.modelo_aeronave === null)).toHaveLength(6);

    const [linkCount] = sqliteJson<{ total: number }>(
      dbPath,
      `SELECT COUNT(*) as total FROM modelos_sessao_manobras msm
       JOIN modelos_sessao ms ON ms.id = msm.modelo_id
       WHERE ms.empresa_id = 6 AND ms.ativo = 1 AND msm.deleted_at IS NULL`,
    );
    expect(linkCount.total).toBe(1584);

    const badPf = sqliteJson(
      dbPath,
      `SELECT ms.codigo, msm.ordem, msm.tripulante, ms.modelo_aeronave
       FROM modelos_sessao_manobras msm
       JOIN modelos_sessao ms ON ms.id = msm.modelo_id
       WHERE ms.empresa_id = 6 AND ms.ativo = 1 AND msm.deleted_at IS NULL
         AND (
           (ms.modelo_aeronave IS NOT NULL AND msm.ordem <= 9 AND msm.tripulante != 'A') OR
           (ms.modelo_aeronave IS NOT NULL AND msm.ordem >= 10 AND msm.tripulante != 'B') OR
           (ms.modelo_aeronave IS NULL AND msm.tripulante != 'AB')
         )`,
    );
    expect(badPf).toHaveLength(0);

    const crossAircraft = sqliteJson(
      dbPath,
      `SELECT ms.codigo, ms.modelo_aeronave, man.codigo as man_codigo, man.tipo_aeronave
       FROM modelos_sessao_manobras msm
       JOIN modelos_sessao ms ON ms.id = msm.modelo_id
       JOIN manobras man ON man.id = msm.manobra_id
       WHERE ms.empresa_id = 6 AND ms.ativo = 1
         AND ms.modelo_aeronave IS NOT NULL
         AND ms.modelo_aeronave != man.tipo_aeronave`,
    );
    expect(crossAircraft).toHaveLength(0);

    const [updatedMan] = sqliteJson<{ nome: string; referencias_json: string }>(
      dbPath,
      `SELECT nome, referencias_json FROM manobras WHERE empresa_id = 6 AND codigo = 'A139-APP-02'`,
    );
    expect(updatedMan.nome).toBe('Aproximação de não precisão com procedimento de reversão');
    expect(updatedMan.referencias_json).toContain(PTO_V18_APPROVED_SOURCE_SHA);

    const [signedSheet] = sqliteJson<{ modelo_id: number; resultado_final: string }>(
      dbPath,
      `SELECT modelo_id, resultado_final FROM fichas_sessao WHERE id = 999`,
    );
    expect(signedSheet.modelo_id).toBe(10);
    expect(signedSheet.resultado_final).toBe('APROVADO');

    const [signedManeuver] = sqliteJson<{ nome: string; resultado: string }>(
      dbPath,
      `SELECT nome, resultado FROM fichas_sessao_manobras WHERE id = 5001`,
    );
    expect(signedManeuver.nome).toBe('Non-precision approach');
    expect(signedManeuver.resultado).toBe('8');

    const [curriculaCount] = sqliteJson<{ total: number }>(
      dbPath,
      `SELECT COUNT(*) as total FROM simuladores_curriculos_voo_itens
       WHERE empresa_id = 6 AND deleted_at IS NULL AND modelo_sessao_id IN (
         SELECT id FROM modelos_sessao WHERE empresa_id = 6 AND ativo = 1
       )`,
    );
    expect(curriculaCount.total).toBe(27);

    const rollbackSql = buildPtoV18CanonicalRollbackStatements({ empresaId: 6 }).join('\n');
    sqliteExec(dbPath, rollbackSql);
    const [restoredReversal] = sqliteJson<{ total: number }>(
      dbPath,
      `SELECT COUNT(*) as total FROM modelos_sessao ms
       JOIN modelos_sessao_versionamento msv ON msv.modelo_id = ms.id
       WHERE ms.empresa_id = 6 AND ms.ativo = 1 AND msv.is_current = 1 AND msv.versao_matriz = 'PTO-REV10-V18-REVERSAL' AND msv.codigo_canonico = 'A139-I-01/12'`,
    );
    expect(restoredReversal.total).toBe(1);
    const [activeV18AfterRollback] = sqliteJson<{ total: number }>(
      dbPath,
      `SELECT COUNT(*) as total FROM modelos_sessao
       WHERE empresa_id = 6 AND ativo = 1 AND codigo LIKE '%@PTO-REV10-V18-V%' AND codigo NOT LIKE '%REVERSAL%'`,
    );
    expect(activeV18AfterRollback.total).toBe(0);
  });
});
