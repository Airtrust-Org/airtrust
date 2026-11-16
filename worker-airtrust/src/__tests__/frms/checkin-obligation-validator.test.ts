import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const cvRecords: unknown[] = [];
vi.mock('../../lib/frms/controle-voos-source', () => ({
  fetchControleVoosOperationalRecords: vi.fn(async (_db: unknown, empresaId: number) =>
    cvRecords.filter((record) => (record as { empresaId: number }).empresaId === empresaId)),
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

describe('oráculo cobre todas as fontes de atividade e a obrigação reciproca', () => {
  it('simulador concluído sem jornada: ignorá-lo é violação; contá-lo passa', async () => {
    const one = { from: '2026-11-25', to: '2026-11-25', tenantId: 7 };
    const ok = await runValidation({
      db: readOnlyDb(), loadDailyCheckinObligations: loadDailyCheckinObligations as unknown as Loader, ...one,
    });
    expect(ok.summary.violation_count).toBe(0);
    expect(ok.summary.totals.status.PENDENTE).toBeGreaterThan(0);

    const ignoreAll: Loader = async (db, empresaId, date) => {
      const real = await (loadDailyCheckinObligations as unknown as Loader)(db, empresaId, date);
      return new Map([...real].map(([id, o]) => [id, { ...o, status: 'NAO_APLICAVEL', base: 'SEM_PROGRAMACAO' }]));
    };
    const ignored = await runValidation({ db: readOnlyDb(), loadDailyCheckinObligations: ignoreAll, ...one });
    // Nesse dia a única evidência de atividade é a sessão de simulador do tripulante 115.
    expect(ignored.summary.invariants.ATIVIDADE_COMPROVADA_IGNORADA).toBe(1);
  });

  it('simulador dentro de lacuna de quinzena quebrada não é tratado como lacuna ociosa', async () => {
    sqlite.exec(`INSERT INTO simulador_agendamentos (id, empresa_id, data, status, nome, funcionario_id)
      VALUES (900, 7, '2026-11-07', 'CONCLUIDO', 'Sessão na lacuna', 103)`);
    try {
      const gap = { from: '2026-11-07', to: '2026-11-07', tenantId: 7 };
      const real = await runValidation({
        db: readOnlyDb(), loadDailyCheckinObligations: loadDailyCheckinObligations as unknown as Loader, ...gap,
      });
      // A regra real exige check-in nesse dia (atividade registrada) e o oráculo concorda.
      expect(real.summary.invariants).toEqual({});
      const asPending = await (loadDailyCheckinObligations as unknown as Loader)(
        readOnlyDb() as never, 7, '2026-11-07');
      expect(asPending.get(103)).toMatchObject({ status: 'PENDENTE', base: 'ATIVIDADE_REGISTRADA' });
      // Sem a atividade, a mesma lacuna é "dia livre" e o oráculo não a conta como evidência.
      const ignored: Loader = async (db, empresaId, date) => {
        const base = await (loadDailyCheckinObligations as unknown as Loader)(db, empresaId, date);
        return new Map([...base].map(([id, o]) => [id, id === 103 ? { ...o, status: 'NAO_APLICAVEL', base: 'SEM_PROGRAMACAO' } : o]));
      };
      const missed = await runValidation({ db: readOnlyDb(), loadDailyCheckinObligations: ignored, ...gap });
      expect(missed.summary.invariants.ATIVIDADE_COMPROVADA_IGNORADA).toBe(1);
    } finally {
      sqlite.exec('DELETE FROM simulador_agendamentos WHERE id = 900');
    }
  });

  it('alocação operacional inequívoca que não gera pendência é violação (regressão silenciosa)', async () => {
    const dropAllocation: Loader = async (db, empresaId, date) => {
      const real = await (loadDailyCheckinObligations as unknown as Loader)(db, empresaId, date);
      return new Map([...real].map(([id, o]) => [id,
        o.base === 'ALOCACAO_OPERACIONAL' ? { ...o, status: 'NAO_APLICAVEL', base: 'SEM_PROGRAMACAO' } : o]));
    };
    const result = await runValidation({ db: readOnlyDb(), loadDailyCheckinObligations: dropAllocation, ...window });
    expect(result.summary.invariants.ALOCACAO_OPERACIONAL_SEM_PENDENCIA).toBeGreaterThan(0);
    expect(result.summary.totals.allocation_expected_pending).toBeGreaterThan(0);
  });

  it('voo do Controle de Voos é evidência consultiva: aparece como aviso, não reprova, e some quando exigido', async () => {
    sqlite.exec(`INSERT INTO cv_voos (id, empresa_id, data_programacao, status, horario_real_partida)
        VALUES (700, 7, '2026-11-27', 'concluido_operacionalmente', '07:10'), (701, 8, '2026-11-28', 'pousado', '07:10');
      INSERT INTO cv_voo_tripulantes (id, empresa_id, voo_id, funcionario_id, funcao) VALUES (1, 7, 700, 116, 'PIC'), (2, 8, 701, 801, 'PIC')`);
    try {
      const one = { from: '2026-11-27', to: '2026-11-27', tenantId: 7 };
      const advisory = await runValidation({
        db: readOnlyDb(), loadDailyCheckinObligations: loadDailyCheckinObligations as unknown as Loader, ...one,
      });
      expect(advisory.summary.violation_count).toBe(0);
      expect(advisory.summary.advisories).toEqual({ ATIVIDADE_CV_NAO_EXIGIDA: 1 });

      cvRecords.push({
        empresaId: 7, identificadorInterno: 'cv-700', identificadorExterno: null, identificadorExternoTripulante: null,
        origem: 'CONTROLE_VOOS', origemDados: 'manual_interno', tripulanteId: 116, funcao: 'PIC',
        horaApresentacao: '06:30', horaDispensa: '12:00', horaMotorLigado: '07:00', horaDecolagem: '07:10',
        horaPouso: '11:00', horaMotorDesligado: '11:10', timezone: null, timezoneFonte: 'INDISPONIVEL',
        vooId: 700, etapaId: 1, aeronaveIdentificador: null, origemIcao: null, destinoIcao: null, minutosVoo: 230,
        minutosTotal: 240, cancelado: false, statusOperacional: 'CONFIRMADO', qualidadeDado: 'ok', dataOperacional: '2026-11-27',
      });
      const consumed = await runValidation({
        db: readOnlyDb(), loadDailyCheckinObligations: loadDailyCheckinObligations as unknown as Loader, ...one,
      });
      expect(consumed.summary.advisory_count).toBe(0);
      expect(consumed.summary.violation_count).toBe(0);
    } finally {
      cvRecords.length = 0;
      sqlite.exec('DELETE FROM cv_voo_tripulantes; DELETE FROM cv_voos');
    }
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
  it.each([
    "SELECT '--'; DELETE FROM probe",
    "SELECT '/*'; DELETE FROM probe; SELECT '*/'",
    'SELECT 1 /* ; */; DROP TABLE probe',
    'WITH a AS (SELECT 1) DELETE FROM probe',
    "SELECT 'sem fim",
    'SELECT 1 /* sem fim',
    'SELECT "a;b" FROM probe',
  ])('não deixa passar tentativa de contornar o analisador: %s', (sql) => {
    expect(() => assertReadOnlyQuery(sql)).toThrow();
  });
  it('contra SQLite real, a tentativa de encadear DELETE por literal com -- não apaga nada', async () => {
    sqlite.exec('CREATE TABLE probe (id INTEGER); INSERT INTO probe VALUES (1)');
    try {
      const db = readOnlyDb();
      await expect(db.prepare("SELECT '--'; DELETE FROM probe").bind().all()).rejects.toThrow();
      expect((sqlite.prepare('SELECT COUNT(*) AS n FROM probe').get() as { n: number }).n).toBe(1);
    } finally {
      sqlite.exec('DROP TABLE probe');
    }
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
