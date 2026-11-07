/**
 * Auditoria de Compliance — paridade entre o motor TypeScript (dashboard/matriz) e o predicado SQL
 * (notificações, matrícula automática, avisos). Ambos precisam decidir a MESMA obrigatoriedade para
 * cada par funcionário × treinamento; divergência = cobrança/matrícula que o painel não mostra
 * (ou o inverso).
 *
 * Dados sintéticos determinísticos (PRNG com semente fixa), SQLite real, loaders reais de produção.
 */
import { describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import {
  loadEmployees,
  loadRules,
  resolvedRules,
} from '../../services/training-compliance-snapshot-builder';
import { trainingComplianceEffectiveRequirementPredicateSql } from '../../services/training-compliance-rule-engine';

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dayOffset = (days: number) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

const FEATURES = new Set(['aircraft', 'legacy', 'conditions', 'windows', 'inactive']);

function buildDb(seed: number) {
  const rnd = prng(seed);
  const pick = <T>(items: T[]): T => items[Math.floor(rnd() * items.length)];
  const chance = (p: number) => rnd() < p;
  const sqlite = new SqliteD1Database();
  const x = sqlite.database;
  x.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS treinamento_requisitos; DROP TABLE IF EXISTS funcionarios_compliance_condicoes;
    DROP TABLE IF EXISTS compliance_condicoes; DROP TABLE IF EXISTS funcionarios_aeronaves;
    DROP TABLE IF EXISTS aeronaves; DROP TABLE IF EXISTS qualificacoes_tipos; DROP TABLE IF EXISTS funcoes;
    DROP TABLE IF EXISTS setores; DROP TABLE IF EXISTS funcionarios;
    CREATE TABLE setores (id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT, deleted_at TEXT);
    CREATE TABLE funcoes (id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT, deleted_at TEXT);
    CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT, cpf TEXT, matricula TEXT,
      email TEXT, telefone TEXT, setor_id INTEGER, funcao_id INTEGER, aeronave TEXT,
      status TEXT DEFAULT 'ATIVO', ativo INTEGER DEFAULT 1, deleted_at TEXT);
    CREATE TABLE qualificacoes_tipos (id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT, codigo TEXT,
      categoria TEXT, validade INTEGER, ativo INTEGER DEFAULT 1, deleted_at TEXT);
    CREATE TABLE aeronaves (id INTEGER PRIMARY KEY, empresa_id INTEGER, modelo TEXT, deleted_at TEXT);
    CREATE TABLE funcionarios_aeronaves (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER,
      funcionario_id INTEGER, aeronave_id INTEGER, data_inicio TEXT, data_fim TEXT, ativo INTEGER DEFAULT 1, deleted_at TEXT);
    CREATE TABLE compliance_condicoes (id INTEGER PRIMARY KEY, empresa_id INTEGER, codigo TEXT, nome TEXT, deleted_at TEXT);
    CREATE TABLE funcionarios_compliance_condicoes (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER,
      funcionario_id INTEGER, condicao_id INTEGER, data_inicio TEXT, data_fim TEXT, ativo INTEGER DEFAULT 1, deleted_at TEXT);
    CREATE TABLE treinamento_requisitos (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER,
      qualificacao_tipo_id INTEGER, escopo TEXT, setor_id INTEGER, funcao_id INTEGER, funcionario_id INTEGER,
      aeronave_modelo TEXT, condicao_id INTEGER, perfil_competencia TEXT, modalidade_requerida TEXT,
      justificativa TEXT, fundamento_tipo TEXT, fundamento_documento TEXT, fundamento_item TEXT,
      validade_fonte TEXT DEFAULT 'EVIDENCIA', obrigatoriedade TEXT, nivel_requerido INTEGER,
      critico_operacional INTEGER DEFAULT 0, origem TEXT DEFAULT 'EMPRESA', referencia_normativa TEXT,
      observacoes TEXT, vigencia_inicio TEXT, vigencia_fim TEXT, prazo_inicial_dias INTEGER,
      auto_matricular_ead INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1, deleted_at TEXT,
      created_at TEXT DEFAULT '2026-01-01', updated_at TEXT DEFAULT '2026-01-01');
  `);

  const setores = [10, 11, 12];
  const funcoes = [1, 2, 3];
  for (const id of setores) x.prepare('INSERT INTO setores VALUES (?,1,?,NULL)').run(id, `S${id}`);
  for (const id of funcoes) x.prepare('INSERT INTO funcoes VALUES (?,1,?,NULL)').run(id, `F${id}`);
  x.prepare("INSERT INTO aeronaves VALUES (1,1,'AW139',NULL)").run();
  x.prepare("INSERT INTO aeronaves VALUES (2,1,'H145',NULL)").run();
  for (const id of [1, 2]) x.prepare('INSERT INTO compliance_condicoes VALUES (?,1,?,?,NULL)').run(id, `C${id}`, `Cond ${id}`);
  for (let t = 1; t <= 6; t++) {
    x.prepare('INSERT INTO qualificacoes_tipos VALUES (?,1,?,?,?,12,1,NULL)').run(
      t, `Tipo ${t}`, `T${t}`, t === 6 ? 'CHECK' : 'TREINAMENTO',
    );
  }

  const legacy = FEATURES.has('legacy') ? [null, null, null, 'AW139', 'H145', 'AW139 / H145', 'aw139;h145'] : [null];
  for (let id = 1; id <= 40; id++) {
    x.prepare('INSERT INTO funcionarios (id,empresa_id,nome,setor_id,funcao_id,aeronave) VALUES (?,1,?,?,?,?)').run(
      id, `Func ${id}`, chance(0.1) ? null : pick(setores), chance(0.1) ? null : pick(funcoes), pick(legacy),
    );
    if (FEATURES.has('aircraft') && chance(0.5)) {
      x.prepare('INSERT INTO funcionarios_aeronaves (empresa_id,funcionario_id,aeronave_id,data_inicio,data_fim) VALUES (1,?,?,?,?)').run(
        id, pick([1, 2]), null, null,
      );
    }
    if (FEATURES.has('conditions') && chance(0.4)) {
      x.prepare('INSERT INTO funcionarios_compliance_condicoes (empresa_id,funcionario_id,condicao_id,data_inicio,data_fim,ativo) VALUES (1,?,?,?,?,?)').run(
        id, pick([1, 2]), FEATURES.has('windows') && chance(0.15) ? dayOffset(5) : null, FEATURES.has('windows') && chance(0.15) ? dayOffset(-5) : null, FEATURES.has('inactive') && chance(0.1) ? 0 : 1,
      );
    }
  }

  for (let i = 0; i < 70; i++) {
    const escopo = pick(['EMPRESA', 'SETOR', 'FUNCAO', 'SETOR_FUNCAO', 'FUNCIONARIO']);
    x.prepare(
      `INSERT INTO treinamento_requisitos (empresa_id,qualificacao_tipo_id,escopo,setor_id,funcao_id,funcionario_id,
         aeronave_modelo,condicao_id,obrigatoriedade,vigencia_inicio,vigencia_fim,ativo,deleted_at)
       VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      1 + Math.floor(rnd() * 6),
      escopo,
      escopo === 'SETOR' || escopo === 'SETOR_FUNCAO' ? pick(setores) : null,
      escopo === 'FUNCAO' || escopo === 'SETOR_FUNCAO' ? pick(funcoes) : null,
      escopo === 'FUNCIONARIO' ? 1 + Math.floor(rnd() * 40) : null,
      FEATURES.has('aircraft') && chance(0.25) ? pick(['AW139', 'H145']) : null,
      FEATURES.has('conditions') && chance(0.25) ? pick([1, 2]) : null,
      pick(['OBRIGATORIA', 'OBRIGATORIA', 'RECOMENDADA', 'NAO_APLICA']),
      FEATURES.has('windows') && chance(0.1) ? dayOffset(5) : null,
      FEATURES.has('windows') && chance(0.1) ? dayOffset(-5) : null,
      FEATURES.has('inactive') && chance(0.1) ? 0 : 1,
      FEATURES.has('inactive') && chance(0.05) ? '2026-01-01' : null,
    );
  }
  return sqlite;
}

describe('paridade motor TS × predicado SQL de requisito efetivo obrigatório', () => {
  it.each([1, 2, 3, 7, 11, 42, 101, 2026])('semente %i: mesmos pares funcionário×treinamento', async (seed) => {
    const sqlite = buildDb(seed);
    const db = sqlite as unknown as D1Database;

    const [employees, rules] = await Promise.all([loadEmployees(db, 1), loadRules(db, 1)]);
    const tsPairs = new Set<string>();
    for (const employee of employees) {
      for (const rule of resolvedRules(rules, employee)) {
        if (rule.obrigatoriedade === 'OBRIGATORIA') {
          tsPairs.add(`${employee.id}:${rule.qualificacao_tipo_id}`);
        }
      }
    }

    const predicate = trainingComplianceEffectiveRequirementPredicateSql({
      ruleAlias: 'tr',
      employeeAlias: 'f',
      qualificationExpr: 'qt.id',
    });
    const rows = sqlite.database
      .prepare(
        `SELECT f.id AS fid, qt.id AS tid FROM funcionarios f
           JOIN qualificacoes_tipos qt ON qt.empresa_id = f.empresa_id
          WHERE f.empresa_id = 1 AND ${predicate}`,
      )
      .all() as Array<{ fid: number; tid: number }>;
    const sqlPairs = new Set(rows.map((r) => `${r.fid}:${r.tid}`));

    const onlyTs = [...tsPairs].filter((p) => !sqlPairs.has(p)).sort();
    const onlySql = [...sqlPairs].filter((p) => !tsPairs.has(p)).sort();
    expect({ onlyTs, onlySql }).toEqual({ onlyTs: [], onlySql: [] });
    // sanidade do dataset: o teste precisa exercitar pares reais, não comparar dois conjuntos vazios
    expect(tsPairs.size).toBeGreaterThan(10);
  });
});

/*
 * ACHADO (P2 — decisão de produto pendente): atribuição de aeronave FORA da janela de datas
 * (data_fim passada ou data_inicio futura) + campo legado `funcionarios.aeronave` preenchido.
 *   - motor TS (matriz/dashboard): a atribuição fora da janela não conta → cai no legado → o
 *     funcionário É da aeronave e o treinamento da aeronave é exigido;
 *   - predicado SQL (notificações/matrícula automática/avisos): existe linha ativa em
 *     funcionarios_aeronaves → o legado é ignorado → NÃO exigido.
 * Resultado: o painel mostra a pendência, mas a cobrança/matrícula automática não a enxerga.
 * Qual lado está certo (legado ressuscitando aeronave encerrada vs. ignorar) é regra de negócio;
 * o teste fixa o comportamento atual para que qualquer correção seja deliberada.
 */
describe('divergência conhecida: atribuição de aeronave encerrada + campo legado', () => {
  it('TS considera o funcionário da aeronave (legado), SQL não', async () => {
    const sqlite = buildDb(1);
    const x = sqlite.database;
    x.exec(`
      DELETE FROM treinamento_requisitos; DELETE FROM funcionarios_aeronaves; DELETE FROM funcionarios_compliance_condicoes;
      UPDATE funcionarios SET aeronave = NULL;
      UPDATE funcionarios SET aeronave = 'AW139' WHERE id = 1;
      INSERT INTO funcionarios_aeronaves (empresa_id, funcionario_id, aeronave_id, data_fim) VALUES (1, 1, 1, '${dayOffset(-5)}');
      INSERT INTO treinamento_requisitos (empresa_id, qualificacao_tipo_id, escopo, aeronave_modelo, obrigatoriedade)
        VALUES (1, 1, 'EMPRESA', 'AW139', 'OBRIGATORIA');
    `);
    const db = sqlite as unknown as D1Database;
    const [employees, rules] = await Promise.all([loadEmployees(db, 1), loadRules(db, 1)]);
    const employee = employees.find((e) => e.id === 1)!;
    const tsRequired = resolvedRules(rules, employee).some((r) => r.obrigatoriedade === 'OBRIGATORIA');
    const predicate = trainingComplianceEffectiveRequirementPredicateSql({
      ruleAlias: 'tr', employeeAlias: 'f', qualificationExpr: 'qt.id',
    });
    const sqlRequired = Boolean(
      x.prepare(`SELECT 1 AS ok FROM funcionarios f JOIN qualificacoes_tipos qt ON qt.empresa_id = f.empresa_id
                  WHERE f.id = 1 AND qt.id = 1 AND ${predicate}`).get(),
    );
    expect({ tsRequired, sqlRequired }).toEqual({ tsRequired: true, sqlRequired: false });
  });
});
