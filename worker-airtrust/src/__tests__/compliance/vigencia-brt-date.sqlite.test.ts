/** Vigência e elegibilidade SQL usam a mesma data operacional IANA calculada pela aplicação. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { loadRules } from '../../services/training-compliance-snapshot-builder';
import { trainingComplianceRuleApplicabilitySql } from '../../services/training-compliance-rule-engine';

const SRC = join(__dirname, '..', '..');
const FILES = [
  'services/training-compliance-snapshot-builder.ts',
  'services/training-compliance-rule-engine.ts',
  'services/training-compliance-create-enrollment.ts',
  'services/training-compliance-evidence-profile.ts',
  'routes/compliance-treinamentos-conditions.ts',
];

describe('vigência na data operacional de São Paulo', () => {
  it('nenhum predicado de vigência/vínculo usa date(\'now\') em UTC', () => {
    for (const file of FILES) {
      const source = readFileSync(join(SRC, file), 'utf8');
      expect(source.includes("date('now')"), file).toBe(false);
    }
  });

  it.each([
    ['2026-11-08T00:30:00Z', '2026-11-07', [1]],
    ['2026-11-08T02:59:59Z', '2026-11-07', [1]],
    ['2026-11-08T03:00:00Z', '2026-11-08', [2]],
  ])('loadRules avalia vigência na data operacional do instante %s', async (instant, today, expectedIds) => {
    const operationalDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(instant));
    expect(operationalDate).toBe(today);
    const sqlite = new SqliteD1Database();
    sqlite.database.exec(`
      DROP TABLE IF EXISTS treinamento_requisitos; DROP TABLE IF EXISTS qualificacoes_tipos; DROP TABLE IF EXISTS funcionarios;
      DROP TABLE IF EXISTS funcoes; DROP TABLE IF EXISTS setores;
      CREATE TABLE qualificacoes_tipos (id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT, codigo TEXT,
        categoria TEXT, validade INTEGER, deleted_at TEXT);
      CREATE TABLE setores (id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT, deleted_at TEXT);
      CREATE TABLE funcoes (id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT, deleted_at TEXT);
      CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT, deleted_at TEXT);
      CREATE TABLE treinamento_requisitos (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER,
        qualificacao_tipo_id INTEGER, escopo TEXT, setor_id INTEGER, funcao_id INTEGER, funcionario_id INTEGER,
        aeronave_modelo TEXT, condicao_id INTEGER, perfil_competencia TEXT, modalidade_requerida TEXT,
        justificativa TEXT, fundamento_tipo TEXT, fundamento_documento TEXT, fundamento_item TEXT,
        validade_fonte TEXT DEFAULT 'EVIDENCIA', obrigatoriedade TEXT, nivel_requerido INTEGER,
        critico_operacional INTEGER DEFAULT 0, origem TEXT DEFAULT 'EMPRESA', referencia_normativa TEXT,
        observacoes TEXT, vigencia_inicio TEXT, vigencia_fim TEXT, prazo_inicial_dias INTEGER,
        auto_matricular_ead INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1, deleted_at TEXT,
        created_at TEXT DEFAULT '2026-01-01', updated_at TEXT DEFAULT '2026-01-01');
      INSERT INTO qualificacoes_tipos (id, empresa_id, nome, codigo, categoria) VALUES (1, 1, 'T', 'T1', 'TREINAMENTO');
      INSERT INTO treinamento_requisitos (id, empresa_id, qualificacao_tipo_id, escopo, obrigatoriedade, vigencia_fim)
        VALUES (1, 1, 1, 'EMPRESA', 'OBRIGATORIA', '2026-11-07');
      INSERT INTO treinamento_requisitos (id, empresa_id, qualificacao_tipo_id, escopo, obrigatoriedade, vigencia_inicio)
        VALUES (2, 1, 1, 'EMPRESA', 'OBRIGATORIA', '2026-11-08');
      INSERT INTO treinamento_requisitos (empresa_id, qualificacao_tipo_id, escopo, obrigatoriedade, vigencia_fim)
        VALUES (1, 1, 'EMPRESA', 'OBRIGATORIA', '2026-11-06');
    `);
    const rules = await loadRules(sqlite.asD1(), 1, operationalDate);
    expect(rules.map((r) => r.id)).toEqual(expectedIds);
  });

  it.each([
    ['2026-11-07', 1],
    ['2026-11-08', 0],
  ])('eligibility honors the bound operational date %s', async (today, expected) => {
    const sqlite = new SqliteD1Database();
    sqlite.database.exec(`
      DROP TABLE IF EXISTS funcionarios_compliance_condicoes;
      DROP TABLE IF EXISTS funcionarios_aeronaves;
      DROP TABLE IF EXISTS aeronaves;
      DROP TABLE IF EXISTS funcionarios;
      CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER, setor_id INTEGER,
        funcao_id INTEGER, aeronave TEXT);
      CREATE TABLE funcionarios_compliance_condicoes (empresa_id INTEGER, funcionario_id INTEGER,
        condicao_id INTEGER, ativo INTEGER, deleted_at TEXT, data_inicio TEXT, data_fim TEXT);
      CREATE TABLE funcionarios_aeronaves (funcionario_id INTEGER, aeronave_id INTEGER,
        ativo INTEGER, deleted_at TEXT, data_inicio TEXT, data_fim TEXT);
      CREATE TABLE aeronaves (id INTEGER PRIMARY KEY, empresa_id INTEGER, modelo TEXT, deleted_at TEXT);
      INSERT INTO funcionarios VALUES (1, 1, NULL, NULL, NULL);
      INSERT INTO funcionarios_compliance_condicoes VALUES (1, 1, 7, 1, NULL, NULL, '2026-11-07');
      INSERT INTO aeronaves VALUES (1, 1, 'AW139', NULL);
      INSERT INTO funcionarios_aeronaves VALUES (1, 1, 1, NULL, NULL, '2026-11-07');
    `);
    const sql = trainingComplianceRuleApplicabilitySql('tr', 'f');
    const eligible = await sqlite.asD1().prepare(`
      WITH compliance_operational_date(hoje) AS (VALUES(?))
      SELECT 1 FROM funcionarios f, (SELECT 'EMPRESA' escopo, 7 condicao_id,
        'AW139' aeronave_modelo, 1 empresa_id, NULL setor_id, NULL funcao_id, NULL funcionario_id) tr
      WHERE f.id=1 AND ${sql}
    `).bind(today).first();
    expect(Boolean(eligible)).toBe(Boolean(expected));
  });
});
