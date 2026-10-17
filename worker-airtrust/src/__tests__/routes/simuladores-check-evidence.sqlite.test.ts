import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  g1Sem: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('../../services/qualificacoes-historico-ficha', () => ({
  upsertQualificacaoHistoricoDaFicha: mocks.upsert,
}));
vi.mock('../../services/qualificacoes-g1-sem', () => ({
  realizarG1SemPendente: mocks.g1Sem,
}));
vi.mock('../../routes/simuladores-shared', () => ({ audit: mocks.audit }));

import { gerarQualificacaoDaFicha } from '../../routes/simuladores-fichas-helpers';

describe('individual evidence for simulator-generated FAP (real SQLite)', () => {
  let db: SqliteD1Database | null = null;

  beforeEach(() => {
    mocks.upsert.mockReset().mockImplementation(async (_db, input) => ({
      id: input.qualificacaoId,
      action: 'insert',
      row: {},
    }));
    mocks.audit.mockReset();
    mocks.g1Sem.mockReset();
    db = new SqliteD1Database();
    db.database.exec(`
      ALTER TABLE qualificacoes_tipos ADD COLUMN nome TEXT;
      CREATE TABLE simulador_agendamentos (
        id INTEGER PRIMARY KEY, empresa_id INTEGER, template_id INTEGER,
        deleted_at TEXT
      );
      CREATE TABLE simulador_atribuicoes_curriculares (
        id INTEGER PRIMARY KEY, empresa_id INTEGER, modelo_sessao_id INTEGER,
        deleted_at TEXT
      );
      CREATE TABLE modelos_sessao (
        id INTEGER PRIMARY KEY, empresa_id INTEGER, qualificacao_tipo_id INTEGER,
        tipo_sessao_id INTEGER, codigo TEXT, deleted_at TEXT
      );
      CREATE TABLE tipos_sessao (
        id INTEGER PRIMARY KEY, empresa_id INTEGER, codigo TEXT, nome TEXT,
        deleted_at TEXT
      );
      CREATE TABLE fichas_sessao (
        id INTEGER PRIMARY KEY, empresa_id INTEGER,
        colaborador_id_aluno INTEGER, agendamento_slot_id INTEGER,
        atribuicao_curricular_id INTEGER, template_id INTEGER,
        tipo_sessao TEXT, tipo_aeronave TEXT, data_sessao TEXT,
        status TEXT, aprovado INTEGER, deleted_at TEXT
      );
      CREATE TABLE sessoes_checks (
        id INTEGER PRIMARY KEY, sessao_id INTEGER,
        qualificacao_tipo_id INTEGER, deleted_at TEXT
      );
      CREATE TABLE sessoes_checks_resultados (
        id INTEGER PRIMARY KEY, sessao_check_id INTEGER,
        aprovado INTEGER, deleted_at TEXT
      );
      CREATE TABLE sessoes_participantes (
        id INTEGER PRIMARY KEY, sessao_id INTEGER,
        funcionario_id INTEGER, deleted_at TEXT
      );
      INSERT INTO tipos_sessao (id, empresa_id, codigo, nome)
        VALUES (80, 1, 'PER', 'Periódico');
      INSERT INTO modelos_sessao
        (id, empresa_id, qualificacao_tipo_id, tipo_sessao_id, codigo)
        VALUES (90, 1, 101, 80, 'PER');
      INSERT INTO simulador_agendamentos (id, empresa_id, template_id)
        VALUES (60, 1, 90);
      INSERT INTO fichas_sessao
        (id, empresa_id, colaborador_id_aluno, agendamento_slot_id,
         tipo_sessao, tipo_aeronave, data_sessao, status, aprovado)
        VALUES (70, 1, 1002, 60, 'PER', 'AW139', '2026-07-21', 'APROVADO', 1);
      INSERT INTO sessoes_participantes (id, sessao_id, funcionario_id)
        VALUES (1, 60, 1002);
      UPDATE qualificacoes_tipos SET nome='Principal' WHERE id=101;
      UPDATE qualificacoes_tipos SET nome='FAP semestral' WHERE id=103;
      INSERT INTO sessoes_checks (id, sessao_id, qualificacao_tipo_id)
        VALUES (50, 60, 103);
    `);
  });

  afterEach(() => {
    db?.close();
    db = null;
  });

  async function generate() {
    return gerarQualificacaoDaFicha(db!.asD1(), 70);
  }

  it('does not treat a missing check result as approved', async () => {
    const result = await generate();
    expect(result.qualificacoes_geradas.map((row) => row.codigo)).toEqual(['OPS-12']);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it('grants an explicitly approved check for an unambiguous single participant', async () => {
    db!.database.exec('INSERT INTO sessoes_checks_resultados VALUES (1, 50, 1, NULL)');
    const result = await generate();
    expect(result.qualificacoes_geradas.map((row) => row.codigo)).toEqual(['OPS-12', 'SIX']);
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
  });

  it('does not grant an individual FAP from a shared session-wide result', async () => {
    db!.database.exec(`
      INSERT INTO sessoes_checks_resultados VALUES (1, 50, 1, NULL);
      INSERT INTO sessoes_participantes (id, sessao_id, funcionario_id)
        VALUES (2, 60, 1001);
    `);
    const result = await generate();
    expect(result.qualificacoes_geradas.map((row) => row.codigo)).toEqual(['OPS-12']);
  });

  it('also blocks ambiguous shared fichas even if the roster is incomplete', async () => {
    db!.database.exec(`
      INSERT INTO sessoes_checks_resultados VALUES (1, 50, 1, NULL);
      INSERT INTO fichas_sessao (id, empresa_id, colaborador_id_aluno,
        agendamento_slot_id, tipo_sessao, status, aprovado)
      VALUES (71, 1, 1001, 60, 'PER', 'APROVADO', 1);
    `);
    const result = await generate();
    expect(result.qualificacoes_geradas.map((row) => row.codigo)).toEqual(['OPS-12']);
  });

  it('rejects an explicit failure and contradictory active check results', async () => {
    db!.database.exec('INSERT INTO sessoes_checks_resultados VALUES (1, 50, 0, NULL)');
    expect((await generate()).qualificacoes_geradas.map((row) => row.codigo)).toEqual(['OPS-12']);
    db!.database.exec('INSERT INTO sessoes_checks_resultados VALUES (2, 50, 1, NULL)');
    expect((await generate()).qualificacoes_geradas.map((row) => row.codigo)).toEqual(['OPS-12']);
  });
});
