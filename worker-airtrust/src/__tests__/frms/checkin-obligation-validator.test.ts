import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/frms/controle-voos-source', () => ({
  fetchControleVoosOperationalRecords: vi.fn(async () => []),
}));
import { loadDailyCheckinObligations } from '../../lib/frms/checkin-obligation';
import {
  assertReadOnlyQuery, createReadOnlyD1, crewRef,
} from '../../../../scripts/production/lib/frms-checkin-obligation-validation.mjs';
import { listDates, runValidation } from '../../../../scripts/production/frms-checkin-obligation-readonly.mjs';
import { createCheckinObligationFixture, type Sqlite } from './helpers/checkin-obligation-fixture';

/**
 * Prova que o validador de produção (a) roda a regra canônica real sobre SQLite e não encontra
 * violação, e (b) REALMENTE detecta o defeito antigo e o defeito inverso. Sem (b), um zero em
 * produção não significaria nada.
 */
let sqlite: Sqlite;
beforeAll(() => { sqlite = createCheckinObligationFixture(); });
afterAll(() => sqlite?.close());

const readOnlyDb = () => createReadOnlyD1((sql, params) => sqlite.prepare(sql).all(...params));
const window = { from: '2026-11-01', to: '2026-11-30', tenantId: 7 };

type Loader = Parameters<typeof runValidation>[0]['loadDailyCheckinObligations'];

describe('validador de produção da obrigação de check-in', () => {
  it('regra real: zero violações e a matriz inteira exercitada', async () => {
    const result = await runValidation({
      db: readOnlyDb(), loadDailyCheckinObligations: loadDailyCheckinObligations as unknown as Loader, ...window,
    });
    expect(result.summary.invariants).toEqual({});
    expect(result.summary.violation_count).toBe(0);
    const { status, divergences } = result.summary.totals;
    expect(status.PENDENTE).toBeGreaterThan(0);
    expect(status.DISPENSADO).toBeGreaterThan(0);
    expect(status.INDETERMINADO).toBeGreaterThan(0);
    expect(status.RECEBIDO).toBe(1);
    expect(result.summary.totals.gap_crew_days).toBeGreaterThan(0);
    expect(divergences.ATIVIDADE_EM_AUSENCIA).toBeGreaterThan(0);
    // Regra antiga contaria pendência por quinzena-base/EVD/atividade; hoje parte virou dispensa ou dúvida.
    expect(result.summary.totals.legacy_pending_no_checkin).toBeGreaterThan(status.PENDENTE ?? 0);
    expect(result.crewSize).toBe(14);
  });

  it('detecta a regra antiga: pendência para todos (folga, férias e quinzena quebrada)', async () => {
    const everyonePending: Loader = async (db, empresaId, date) => {
      const real = await (loadDailyCheckinObligations as unknown as Loader)(db, empresaId, date);
      return new Map([...real].map(([id, o]) => [id, { ...o, status: 'PENDENTE', base: 'ALOCACAO_OPERACIONAL' }]));
    };
    const result = await runValidation({ db: readOnlyDb(), loadDailyCheckinObligations: everyonePending, ...window });
    expect(result.summary.invariants.PENDENCIA_SEM_ALOCACAO_OPERACIONAL).toBeGreaterThan(0);
    expect(result.summary.invariants.LACUNA_QUINZENA_QUEBRADA_PENDENTE).toBeGreaterThan(0);
    expect(result.summary.violation_count).toBeGreaterThan(0);
  });

  it('detecta o defeito inverso: atividade comprovada ignorada e pendência por presunção', async () => {
    const nobodyPending: Loader = async (db, empresaId, date) => {
      const real = await (loadDailyCheckinObligations as unknown as Loader)(db, empresaId, date);
      return new Map([...real].map(([id, o]) => [id, { ...o, status: 'NAO_APLICAVEL', base: 'SEM_PROGRAMACAO' }]));
    };
    const ignored = await runValidation({ db: readOnlyDb(), loadDailyCheckinObligations: nobodyPending, ...window });
    expect(ignored.summary.invariants.ATIVIDADE_COMPROVADA_IGNORADA).toBeGreaterThan(0);
    expect(ignored.summary.invariants.CHECKIN_RECEBIDO_DIVERGENTE).toBeGreaterThan(0);

    const presumption: Loader = async (db, empresaId, date) => {
      const real = await (loadDailyCheckinObligations as unknown as Loader)(db, empresaId, date);
      return new Map([...real].map(([id, o]) => [id, o.status === 'INDETERMINADO' ? { ...o, status: 'PENDENTE' } : o]));
    };
    const presumed = await runValidation({ db: readOnlyDb(), loadDailyCheckinObligations: presumption, ...window });
    expect(presumed.summary.invariants.PENDENCIA_POR_PRESUNCAO).toBeGreaterThan(0);
  });

  it('detecta obrigação de tripulante de outra empresa', async () => {
    const leaking: Loader = async (db, empresaId, date) => {
      const real = await (loadDailyCheckinObligations as unknown as Loader)(db, empresaId, date);
      return new Map([...real, [801, { status: 'PENDENTE', exigivel: true, base: 'ALOCACAO_OPERACIONAL', divergencias: [] }]]);
    };
    const result = await runValidation({ db: readOnlyDb(), loadDailyCheckinObligations: leaking, ...window });
    expect(result.summary.invariants.OBRIGACAO_FORA_DO_TENANT).toBeGreaterThan(0);
  });

  it('relatório só tem referências sha256 truncadas, nunca nomes ou ids', async () => {
    const leaking: Loader = async (db, empresaId, date) => {
      const real = await (loadDailyCheckinObligations as unknown as Loader)(db, empresaId, date);
      return new Map([...real].map(([id, o]) => [id, { ...o, status: 'NAO_APLICAVEL', base: 'SEM_PROGRAMACAO' }]));
    };
    const result = await runValidation({ db: readOnlyDb(), loadDailyCheckinObligations: leaking, ...window });
    const text = JSON.stringify(result.summary);
    expect(text).not.toMatch(/"T1\d\d"/);
    for (const sample of result.summary.samples) {
      if (sample.crew_ref) expect(sample.crew_ref).toMatch(/^[0-9a-f]{10}$/);
    }
    expect(crewRef(7, 101)).toBe(crewRef(7, 101));
    expect(crewRef(7, 101)).not.toBe(crewRef(8, 101));
  });
});

describe('adaptador somente leitura', () => {
  it('aceita SELECT/WITH e ignora palavras dentro de literais e comentários', () => {
    expect(() => assertReadOnlyQuery("SELECT 'DELETE me' AS x -- UPDATE note\nFROM t")).not.toThrow();
    expect(() => assertReadOnlyQuery('WITH a AS (SELECT 1) SELECT * FROM a')).not.toThrow();
  });
  it.each([
    'UPDATE t SET a = 1', 'DELETE FROM t', 'INSERT INTO t VALUES (1)', 'DROP TABLE t', 'PRAGMA table_info(t)',
    'SELECT 1; SELECT 2', 'SELECT * FROM t WHERE a = 1 OR REPLACE(a,"x","y") = 1', 'CREATE TABLE x(a)',
  ])('recusa %s', (sql) => {
    expect(() => assertReadOnlyQuery(sql)).toThrow();
  });
  it('o adaptador recusa escrita antes de consultar e conta consultas', async () => {
    const calls: string[] = [];
    const db = createReadOnlyD1((sql) => { calls.push(sql); return []; });
    await db.prepare('SELECT 1').bind().all();
    await expect(db.prepare('DELETE FROM t').bind().all()).rejects.toThrow('ONLY_SELECT_PERMITTED');
    expect(calls).toEqual(['SELECT 1']);
    expect(db.stats.queries).toBe(1);
  });
  it('janela inválida ou grande demais é recusada', () => {
    expect(() => listDates('2026-11-15', '2026-11-01')).toThrow('WINDOW_INVALID');
    expect(() => listDates('2026-01-01', '2026-12-31')).toThrow('WINDOW_TOO_LARGE');
    expect(listDates('2026-11-01', '2026-11-03')).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
  });
});
