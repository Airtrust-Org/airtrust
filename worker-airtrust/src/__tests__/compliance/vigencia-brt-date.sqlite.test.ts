/**
 * Vigência de regra/vínculo deve usar a data operacional de São Paulo (UTC-3), como o vencimento.
 * Com `date('now')` (UTC), entre 21h e 24h BRT a regra mudava de vigência ~3h antes do dia civil.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { loadRules } from '../../services/training-compliance-snapshot-builder';
import { getTodayIsoSaoPaulo } from '../../utils/qualificacoes-alerta-config';

const SRC = join(__dirname, '..', '..');
const FILES = [
  'services/training-compliance-snapshot-builder.ts',
  'services/training-compliance-rule-engine.ts',
  'services/training-compliance-create-enrollment.ts',
  'services/training-compliance-evidence-profile.ts',
  'routes/compliance-treinamentos-conditions.ts',
];

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

describe('vigência na data operacional de São Paulo', () => {
  it('nenhum predicado de vigência/vínculo usa date(\'now\') em UTC', () => {
    for (const file of FILES) {
      const source = readFileSync(join(SRC, file), 'utf8');
      expect(source.includes("date('now')"), file).toBe(false);
    }
  });

  it.each([
    ['2026-11-08 00:30:00', '2026-11-07'],
    ['2026-11-08 02:59:59', '2026-11-07'],
    ['2026-11-08 03:00:00', '2026-11-08'],
  ])('loadRules mantém a data BRT na fronteira %s UTC', async (utcInstant, today) => {
    // Congela o relógio do SQLite, não apenas Date do Node: o Worker delega
    // a comparação de vigência ao relógio de SQL, diferente do relógio de JS.
    expect(getTodayIsoSaoPaulo(new Date(utcInstant.replace(' ', 'T') + 'Z'))).toBe(today);
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
      INSERT INTO treinamento_requisitos (empresa_id, qualificacao_tipo_id, escopo, obrigatoriedade, vigencia_fim)
        VALUES (1, 1, 'EMPRESA', 'OBRIGATORIA', '${today}');
      INSERT INTO treinamento_requisitos (empresa_id, qualificacao_tipo_id, escopo, obrigatoriedade, vigencia_inicio)
        VALUES (1, 1, 'EMPRESA', 'OBRIGATORIA', '${addDays(today, 1)}');
      INSERT INTO treinamento_requisitos (empresa_id, qualificacao_tipo_id, escopo, obrigatoriedade, vigencia_fim)
        VALUES (1, 1, 'EMPRESA', 'OBRIGATORIA', '${addDays(today, -1)}');
    `);
    const clockedD1 = {
      prepare(sql: string) {
        // Preserva todos os predicados originais. Substitui SOMENTE a referência
        // de tempo para provar que date('now') em UTC falharia neste cenário.
        return sqlite.prepare(sql.replaceAll("date('now'", `date('${utcInstant}'`));
      },
    } as unknown as D1Database;
    const rules = await loadRules(clockedD1, 1);
    expect(rules.map((r) => r.id)).toEqual([1]);
  });
});
