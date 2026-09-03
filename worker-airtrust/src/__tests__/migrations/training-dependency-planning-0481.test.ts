import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql, querySql } from '../helpers/sqlite-batch-runner';

const ROOT = join(__dirname, '../../../..');
const MIGRATION_PATH = join(
  ROOT,
  'worker-airtrust/migrations/0481_training_dependency_planning.sql',
);

const tempDirs: string[] = [];

function createDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-training-dependency-'));
  tempDirs.push(dir);
  const dbPath = join(dir, 'test.sqlite');

  const schema = `
    PRAGMA foreign_keys = OFF;

    CREATE TABLE qualificacoes_tipos (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      codigo TEXT,
      nome TEXT,
      carga_horaria_recorrente REAL,
      carga_horaria REAL,
      deleted_at TEXT
    );

    CREATE TABLE qualificacoes_historico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      funcionario_id INTEGER,
      qualificacao_id INTEGER,
      data_conclusao TEXT,
      data_vencimento TEXT,
      status TEXT,
      empresa_id INTEGER,
      deleted_at TEXT
    );

    CREATE TABLE empresas_config (
      empresa_id INTEGER PRIMARY KEY,
      planejamento_simulador_antecedencia_dias INTEGER,
      planejamento_simulador_regra_quinzena TEXT,
      planejamento_simulador_preferencia_sessoes_por_dia INTEGER,
      planejamento_simulador_preferencia_minutos_por_dia INTEGER,
      planejamento_simulador_permitir_quebra_preferencia INTEGER,
      planejamento_simulador_permitir_sessao_compartilhada INTEGER,
      planejamento_simulador_preferir_mesmo_treinamento INTEGER,
      planejamento_simulador_preferir_mesma_sessao INTEGER,
      planejamento_simulador_aprovacao_obrigatoria INTEGER
    );

    CREATE TABLE modelos_sessao (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER,
      qualificacao_tipo_id INTEGER,
      modelo_aeronave TEXT,
      ordem_no_treinamento INTEGER,
      deleted_at TEXT
    );

    CREATE TABLE treinamentos_planejados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      qualificacao_tipo_id INTEGER NOT NULL,
      data_prevista TEXT NOT NULL,
      status TEXT NOT NULL,
      carga_horaria_prevista REAL,
      titulo TEXT,
      descricao TEXT,
      observacoes TEXT,
      data_inicio TEXT,
      data_fim TEXT,
      created_by INTEGER,
      created_at TEXT,
      updated_at TEXT,
      planejamento_status TEXT,
      planejamento_origem TEXT,
      planejamento_chave TEXT,
      planejamento_editado_manualmente INTEGER DEFAULT 0,
      planejamento_vencimento_referencia TEXT,
      planejamento_margem_dias INTEGER,
      planejamento_quinzena_numero INTEGER,
      planejamento_politica_janela TEXT,
      planejamento_tipo_janela TEXT,
      planejamento_janela_inicio TEXT,
      planejamento_janela_fim TEXT,
      planejamento_modelo_aeronave TEXT,
      planejamento_conflitos_json TEXT,
      planejamento_snapshot_json TEXT,
      planejamento_recalculado_em TEXT,
      planejamento_recalculado_por INTEGER,
      deleted_at TEXT
    );

    CREATE UNIQUE INDEX idx_treinamentos_planejamento_chave_empresa
      ON treinamentos_planejados(empresa_id, planejamento_chave)
      WHERE deleted_at IS NULL AND planejamento_chave IS NOT NULL;

    CREATE TABLE treinamentos_participantes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      treinamento_id INTEGER NOT NULL,
      funcionario_id INTEGER NOT NULL,
      confirmado INTEGER,
      presente INTEGER,
      aprovado INTEGER,
      nota REAL,
      observacoes TEXT,
      created_at TEXT,
      updated_at TEXT,
      UNIQUE(treinamento_id, funcionario_id)
    );

    CREATE TABLE simulador_planejamento_auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      treinamento_planejado_id INTEGER,
      acao TEXT NOT NULL,
      planejamento_status TEXT,
      snapshot_antes_json TEXT,
      snapshot_depois_json TEXT,
      realizado_por INTEGER,
      realizado_em TEXT
    );

    INSERT INTO empresas_config (
      empresa_id,
      planejamento_simulador_antecedencia_dias,
      planejamento_simulador_regra_quinzena,
      planejamento_simulador_preferencia_sessoes_por_dia,
      planejamento_simulador_preferencia_minutos_por_dia,
      planejamento_simulador_permitir_quebra_preferencia,
      planejamento_simulador_permitir_sessao_compartilhada,
      planejamento_simulador_preferir_mesmo_treinamento,
      planejamento_simulador_preferir_mesma_sessao,
      planejamento_simulador_aprovacao_obrigatoria
    ) VALUES (6, 90, 'AMBAS', 2, 240, 1, 1, 1, 1, 1);

    INSERT INTO qualificacoes_tipos
      (id, empresa_id, codigo, nome, carga_horaria_recorrente, carga_horaria)
    VALUES
      (33, 6, 'G1', 'AW139 FFS', 6, 6),
      (106, 6, 'G1-SEM', 'AW139 Semestral', 6, 6),
      (200, 6, 'GEN-ORIG', 'Origem genérica', 2, 2),
      (201, 6, 'GEN-DEST', 'Destino genérico', 2, 2),
      (301, 7, 'TENANT-7', 'Outro tenant', 2, 2);

    INSERT INTO modelos_sessao
      (id, empresa_id, qualificacao_tipo_id, modelo_aeronave, ordem_no_treinamento)
    VALUES
      (111, 6, 106, 'AW139', 1),
      (117, 6, 106, 'AW139', 2),
      (211, 6, 201, 'S76', 1);

    -- Existing completion before the migration must never be backfilled.
    INSERT INTO qualificacoes_historico
      (id, funcionario_id, qualificacao_id, data_conclusao, data_vencimento, status, empresa_id)
    VALUES
      (900, 490, 33, '2026-08-31', '2027-08-31', 'CONCLUIDA', 6);
  `;

  const setup = execSql(dbPath, schema);
  expect(setup.code, setup.stderr).toBe(0);

  const migration = readFileSync(MIGRATION_PATH, 'utf8');
  const applied = execSql(dbPath, migration);
  expect(applied.code, applied.stderr).toBe(0);

  return dbPath;
}

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('0481 training dependency planning', () => {
  it('preserves historical completions and seeds only the approved AW139 relation', () => {
    const dbPath = createDatabase();

    const historicalPlans = querySql<{ total: number }>(
      dbPath,
      "SELECT COUNT(*) AS total FROM treinamentos_planejados WHERE planejamento_chave LIKE 'DEPENDENCIA:%:900:%';",
    );
    expect(Number(historicalPlans[0]?.total || 0)).toBe(0);

    const rules = querySql<{
      empresa_id: number;
      qualificacao_origem_id: number;
      qualificacao_destino_id: number;
      intervalo_meses: number;
      vigencia_inicio: string;
    }>(
      dbPath,
      `SELECT empresa_id, qualificacao_origem_id, qualificacao_destino_id,
              intervalo_meses, vigencia_inicio
         FROM treinamento_dependencias
        ORDER BY id;`,
    );
    expect(rules).toEqual([
      {
        empresa_id: 6,
        qualificacao_origem_id: 33,
        qualificacao_destino_id: 106,
        intervalo_meses: 6,
        vigencia_inicio: '2026-08-31',
      },
    ]);
  });

  it('creates the AW139 Semestral proposal six months after a new Periodico completion', () => {
    const dbPath = createDatabase();

    const inserted = execSql(
      dbPath,
      `INSERT INTO qualificacoes_historico
        (funcionario_id, qualificacao_id, data_conclusao, data_vencimento, status, empresa_id)
       VALUES (501, 33, '2026-08-31', '2027-08-31', 'CONCLUIDA', 6);`,
    );
    expect(inserted.code, inserted.stderr).toBe(0);

    const plans = querySql<{
      id: number;
      qualificacao_tipo_id: number;
      data_prevista: string;
      status: string;
      planejamento_status: string;
      planejamento_origem: string;
      planejamento_chave: string;
      planejamento_editado_manualmente: number;
      planejamento_vencimento_referencia: string;
      planejamento_modelo_aeronave: string;
      planejamento_snapshot_json: string;
    }>(
      dbPath,
      `SELECT id, qualificacao_tipo_id, data_prevista, status, planejamento_status,
              planejamento_origem, planejamento_chave, planejamento_editado_manualmente,
              planejamento_vencimento_referencia, planejamento_modelo_aeronave,
              planejamento_snapshot_json
         FROM treinamentos_planejados;`,
    );

    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      qualificacao_tipo_id: 106,
      data_prevista: '2027-02-28',
      status: 'PLANEJADO',
      planejamento_status: 'PROPOSTO',
      planejamento_origem: 'SIMULADOR_QUINZENA',
      planejamento_editado_manualmente: 1,
      planejamento_vencimento_referencia: '2027-02-28',
      planejamento_modelo_aeronave: 'AW139',
    });

    const snapshot = JSON.parse(plans[0].planejamento_snapshot_json);
    expect(snapshot.generated_by).toBe('TRAINING_DEPENDENCY');
    expect(snapshot.dependency).toMatchObject({
      source_qualification_id: 33,
      destination_qualification_id: 106,
      interval_months: 6,
      effective_from: '2026-08-31',
    });
    expect(snapshot.participants).toEqual([
      expect.objectContaining({
        employee_id: 501,
        equipment: 'AW139',
        qualification_expiry_date: '2027-08-31',
        training_id: 106,
        session_model_ids: [111],
      }),
    ]);

    const participants = querySql<{ funcionario_id: number }>(
      dbPath,
      `SELECT funcionario_id
         FROM treinamentos_participantes
        WHERE treinamento_id = ${Number(plans[0].id)};`,
    );
    expect(participants.map((row) => Number(row.funcionario_id))).toEqual([501]);

    const audits = querySql<{ acao: string }>(
      dbPath,
      `SELECT acao FROM simulador_planejamento_auditoria
        WHERE treinamento_planejado_id = ${Number(plans[0].id)};`,
    );
    expect(audits.map((row) => row.acao)).toEqual(['DEPENDENCIA_TREINAMENTO_GERADA']);
  });

  it('keeps retries idempotent and never creates a proposal before the rule effective date', () => {
    const dbPath = createDatabase();

    expect(
      execSql(
        dbPath,
        `INSERT INTO qualificacoes_historico
          (funcionario_id, qualificacao_id, data_conclusao, data_vencimento, status, empresa_id)
         VALUES (502, 33, '2026-08-30', '2027-08-30', 'CONCLUIDA', 6);`,
      ).code,
    ).toBe(0);

    expect(
      execSql(
        dbPath,
        `INSERT INTO qualificacoes_historico
          (funcionario_id, qualificacao_id, data_conclusao, data_vencimento, status, empresa_id)
         VALUES (503, 33, '2026-09-15', '2027-09-15', 'CONCLUIDA', 6);
         UPDATE qualificacoes_historico
            SET status = 'CONCLUIDA'
          WHERE funcionario_id = 503 AND empresa_id = 6;`,
      ).code,
    ).toBe(0);

    const rows = querySql<{ funcionario_id: number; total: number }>(
      dbPath,
      `SELECT tp.funcionario_id, COUNT(*) AS total
         FROM treinamentos_participantes tp
         JOIN treinamentos_planejados t ON t.id = tp.treinamento_id
        GROUP BY tp.funcionario_id
        ORDER BY tp.funcionario_id;`,
    );

    expect(rows).toEqual([{ funcionario_id: 503, total: 1 }]);
  });

  it('supports another configured relation with a seven-month interval', () => {
    const dbPath = createDatabase();

    const configured = execSql(
      dbPath,
      `INSERT INTO treinamento_dependencias
        (empresa_id, qualificacao_origem_id, qualificacao_destino_id,
         intervalo_meses, vigencia_inicio, observacoes)
       VALUES (6, 200, 201, 7, '2026-08-31', 'Regra genérica de teste');

       INSERT INTO qualificacoes_historico
        (funcionario_id, qualificacao_id, data_conclusao, data_vencimento, status, empresa_id)
       VALUES (601, 200, '2026-08-31', '2027-08-31', 'CONCLUIDA', 6);`,
    );
    expect(configured.code, configured.stderr).toBe(0);

    const plan = querySql<{
      qualificacao_tipo_id: number;
      data_prevista: string;
      planejamento_modelo_aeronave: string;
    }>(
      dbPath,
      `SELECT qualificacao_tipo_id, data_prevista, planejamento_modelo_aeronave
         FROM treinamentos_planejados
        WHERE qualificacao_tipo_id = 201;`,
    );
    expect(plan).toEqual([
      {
        qualificacao_tipo_id: 201,
        data_prevista: '2027-03-31',
        planejamento_modelo_aeronave: 'S76',
      },
    ]);
  });

  it('fails closed when a dependency tries to cross tenants', () => {
    const dbPath = createDatabase();

    const result = execSql(
      dbPath,
      `INSERT INTO treinamento_dependencias
        (empresa_id, qualificacao_origem_id, qualificacao_destino_id,
         intervalo_meses, vigencia_inicio)
       VALUES (6, 33, 301, 6, '2026-08-31');`,
    );

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('treinamento_dependencias destination tenant mismatch');
  });
});
