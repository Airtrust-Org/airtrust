import { afterEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { getQualificacoesVencimentoExpr } from '../../utils/qualificacoes-alerta-config';
import { buildEdAppQualificacaoVencimentoExpr } from '../../routes/integracoes-edapp-helpers';
import { sqlAddMonthsClamped, sqlEffectiveValidityMonths, sqlCmaAgeValidityMonths } from '../../utils/sql-add-months';
import { resolveCmaValidity } from '../../../../src/shared/utils/cma-validity';

describe('vencimento SQL fallbacks: CMA depende de validade_meses persistido', () => {
  const dbs: SqliteD1Database[] = [];
  afterEach(() => {
    for (const d of dbs.splice(0)) d.close();
  });

  function setup() {
    const db = new SqliteD1Database();
    dbs.push(db);
    db.database.exec(`
      DROP TABLE IF EXISTS qualificacoes_historico; DROP TABLE IF EXISTS qualificacoes_tipos;
      CREATE TABLE qualificacoes_tipos (id INTEGER PRIMARY KEY, codigo TEXT, validade INTEGER, vencimento_fim_mes INTEGER DEFAULT 0, deleted_at TEXT);
      CREATE TABLE qualificacoes_historico (id INTEGER PRIMARY KEY, qualificacao_id INTEGER, data_conclusao TEXT, data_vencimento TEXT, validade_meses INTEGER);
      INSERT INTO qualificacoes_tipos VALUES (1, 'CMA', 12, 1, NULL), (2, 'NR35', 24, 1, NULL);
    `);
    return db.database;
  }
  const one = (db: ReturnType<typeof setup>, sql: string) =>
    (db.prepare(sql).get() as { v: string | null }).v;
  const viaJoin = (db: ReturnType<typeof setup>, id: number) =>
    one(
      db,
      `SELECT ${getQualificacoesVencimentoExpr('qh', 'qt')} AS v FROM qualificacoes_historico qh JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id WHERE qh.id = ${id}`,
    );
  const viaEdapp = (db: ReturnType<typeof setup>, id: number) =>
    one(db, `SELECT ${buildEdAppQualificacaoVencimentoExpr('qh')} AS v FROM qualificacoes_historico qh WHERE qh.id = ${id}`);

  it('CMA sem validade_meses nao herda a validade do modelo (nem o default de 12)', () => {
    const db = setup();
    db.exec("INSERT INTO qualificacoes_historico VALUES (10, 1, '2026-01-31', NULL, NULL)");
    expect(viaJoin(db, 10)).toBeNull();
    expect(viaEdapp(db, 10)).toBeNull();
  });

  it('CMA com validade_meses persistido (regra de idade) vence no dia, com clamp', () => {
    const db = setup();
    db.exec("INSERT INTO qualificacoes_historico VALUES (11, 1, '2026-01-31', NULL, 6)");
    expect(viaJoin(db, 11)).toBe('2026-07-31');
    expect(viaEdapp(db, 11)).toBe('2026-07-31');
    expect(one(db, `SELECT ${sqlAddMonthsClamped("'2026-08-31'", sqlEffectiveValidityMonths('6', "'CMA'", '12'))} AS v`)).toBe('2027-02-28');
  });

  it('outros tipos seguem a validade do modelo, no dia, ignorando vencimento_fim_mes legado', () => {
    const db = setup();
    db.exec("INSERT INTO qualificacoes_historico VALUES (12, 2, '2024-02-29', NULL, NULL)");
    expect(viaJoin(db, 12)).toBe('2026-02-28');
    expect(viaEdapp(db, 12)).toBe('2026-02-28');
  });

  it('historico: CMA sem validade persistida usa a regra de idade, igual ao enriquecimento TS', () => {
    const db = setup();
    const cases: Array<[string, string | null]> = [
      ['2026-03-10', '1960-03-10'], // exatamente 60 anos
      ['2026-03-09', '1960-03-10'], // 59 anos
      ['2026-03-10', '1990-01-01'],
      ['2026-03-10', null], // nascimento ausente -> 12
      ['2026-01-31', '1950-05-05'],
    ];
    for (const [conclusao, nasc] of cases) {
      const ageSql = sqlCmaAgeValidityMonths(`'${conclusao}'`, nasc ? `'${nasc}'` : 'NULL');
      const expected = resolveCmaValidity({ dataRealizacao: conclusao, dataNascimento: nasc }).months;
      const months = one(db, `SELECT ${sqlEffectiveValidityMonths('NULL', "'CMA'", '12', ageSql)} AS v`);
      expect(Number(months)).toBe(expected);
      const venc = one(db, `SELECT ${sqlAddMonthsClamped(`'${conclusao}'`, sqlEffectiveValidityMonths('NULL', "'CMA'", '12', ageSql))} AS v`);
      expect(venc).not.toBeNull();
    }
  });
});
