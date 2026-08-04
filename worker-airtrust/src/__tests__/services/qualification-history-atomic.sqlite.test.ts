import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  calculateQualificationExpiry,
  createQualificationHistoryAtomic,
  normalizeValidityMonths,
  renewQualificationHistoryAtomic,
  resolveEffectiveValidityMonths,
  settleQualificationComplementaryEffects,
  type AtomicQualificationCreateInput,
  type AtomicQualificationRenewInput,
  type RequiredQualificationRelation,
} from '../../services/qualification-history-atomic';
import { assertQualificacaoAtribuicaoWithinOperationalScope } from '../../services/operational-domain-access';
import { insertHistory, SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';

function createInput(
  overrides: Partial<AtomicQualificationCreateInput> = {},
): AtomicQualificationCreateInput {
  return {
    empresaId: 1,
    funcionarioId: 1000,
    qualificationId: 100,
    qualificationCode: 'MNT-12',
    category: 'MANUTENCAO',
    completionDate: '2026-08-01',
    expiryDate: '2027-08-01',
    validityMonths: 12,
    instructor: 'INSTRUTOR',
    observations: null,
    status: 'CONCLUIDA',
    workload: 4,
    trainingType: 'RECORRENTE',
    requiredRelation: null,
    ...overrides,
  };
}

function renewInput(
  sourceHistoryId: number,
  overrides: Partial<AtomicQualificationRenewInput> = {},
): AtomicQualificationRenewInput {
  return {
    empresaId: 1,
    sourceHistoryId,
    qualificationId: 100,
    qualificationCode: 'MNT-12',
    category: 'MANUTENCAO',
    completionDate: '2026-08-01',
    expiryDate: '2027-08-31',
    validityMonths: 12,
    instructor: 'INSTRUTOR',
    observations: `Renovação de #${sourceHistoryId}`,
    status: 'CONCLUIDA',
    workload: 4,
    trainingType: 'RECORRENTE',
    requiredRelation: null,
    ...overrides,
  };
}

function requiredG1SemRelation(completionDate: string): RequiredQualificationRelation {
  return {
    qualificationId: 107,
    qualificationCode: 'G1-SEM',
    category: 'MANUTENCAO',
    expiryDate: calculateQualificationExpiry({ completionDate, validityMonths: 6 }),
    validityMonths: 6,
    workload: 2,
    trainingType: 'SEMESTRAL',
    status: 'CONCLUIDA',
  };
}

describe('qualification history atomic core with real SQLite', () => {
  let fixture: SqliteD1Database;
  let db: D1Database;

  beforeEach(() => {
    fixture = new SqliteD1Database();
    db = fixture.asD1();
  });

  afterEach(() => fixture.close());

  it('preserves NULL/zero and calculates 6, 12 and other configured validities', () => {
    expect(normalizeValidityMonths(null)).toBeNull();
    expect(normalizeValidityMonths(0)).toBeNull();

    const calculate = (validityMonths: number | null) =>
      calculateQualificationExpiry({
        completionDate: '2026-01-15',
        validityMonths,
      });

    expect(calculate(null)).toBeNull();
    expect(calculate(6)).toBe('2026-07-15');
    expect(calculate(12)).toBe('2027-01-15');
    expect(calculate(18)).toBe('2027-07-15');
  });

  it('applies the CMA six-month rule only on or after the 60th birthday', () => {
    expect(
      resolveEffectiveValidityMonths({
        qualificationCode: 'CMA',
        typeValidityMonths: 12,
        birthDate: '1970-08-05',
        completionDate: '2030-08-04',
      }),
    ).toBe(12);
    expect(
      resolveEffectiveValidityMonths({
        qualificationCode: 'CMA',
        typeValidityMonths: 12,
        birthDate: '1966-08-04',
        completionDate: '2026-08-04',
      }),
    ).toBe(6);
  });

  it.each<[string, number, number | null, string | null]>([
    ['PERM', 102, null, null],
    ['SIX', 103, 6, '2026-07-15'],
    ['MNT-12', 100, 12, '2027-01-15'],
    ['OTHER', 104, 18, '2027-07-15'],
  ])(
    'creates %s with its exact validity contract',
    async (qualificationCode, qualificationId, validityMonths, expectedExpiry) => {
      const completionDate = '2026-01-15';
      const result = await createQualificationHistoryAtomic(
        db,
        createInput({
          qualificationCode,
          qualificationId,
          completionDate,
          validityMonths,
          expiryDate: calculateQualificationExpiry({
            completionDate,
            validityMonths,
          }),
        }),
      );
      const row = fixture.database
        .prepare('SELECT validade_meses, data_vencimento FROM qualificacoes_historico WHERE id = ?')
        .get(result.id) as {
        validade_meses: number | null;
        data_vencimento: string | null;
      };

      expect(result.action).toBe('created');
      expect(row).toEqual({
        validade_meses: validityMonths,
        data_vencimento: expectedExpiry,
      });
    },
  );

  it('creates G1/G1-SEM and renews both predecessors in one batch', async () => {
    const oldG1 = insertHistory(fixture.database, {
      qualificationId: 106,
      qualificationCode: 'G1',
      completionDate: '2025-01-01',
    });
    const oldG1Sem = insertHistory(fixture.database, {
      qualificationId: 107,
      qualificationCode: 'G1-SEM',
      completionDate: '2025-01-01',
      validityMonths: 6,
      expiryDate: '2025-07-01',
    });

    const result = await createQualificationHistoryAtomic(
      db,
      createInput({
        qualificationId: 106,
        qualificationCode: 'G1',
        completionDate: '2026-01-01',
        expiryDate: '2027-01-01',
        requiredRelation: requiredG1SemRelation('2026-01-01'),
      }),
    );
    const predecessors = fixture.database
      .prepare(
        'SELECT id, renovada, status FROM qualificacoes_historico WHERE id IN (?, ?) ORDER BY id',
      )
      .all(oldG1, oldG1Sem);

    expect(result.relationHistoryId).toBeTruthy();
    expect(predecessors).toEqual([
      { id: oldG1, renovada: 1, status: 'RENOVADA' },
      { id: oldG1Sem, renovada: 1, status: 'RENOVADA' },
    ]);
  });

  it('rolls back creation and previous marking when the required relation fails', async () => {
    const oldId = insertHistory(fixture.database, {
      qualificationId: 106,
      qualificationCode: 'G1',
      completionDate: '2025-01-01',
    });
    fixture.database.exec(`
      CREATE TRIGGER fail_required_relation_create
      BEFORE INSERT ON qualificacoes_historico
      WHEN NEW.qualificacao_codigo = 'G1-SEM'
      BEGIN
        SELECT RAISE(ABORT, 'forced required relation failure');
      END;
    `);

    await expect(
      createQualificationHistoryAtomic(
        db,
        createInput({
          qualificationId: 106,
          qualificationCode: 'G1',
          completionDate: '2026-01-01',
          expiryDate: '2027-01-01',
          requiredRelation: requiredG1SemRelation('2026-01-01'),
        }),
      ),
    ).rejects.toThrow('forced required relation failure');

    expect(
      fixture.database
        .prepare('SELECT renovada, status FROM qualificacoes_historico WHERE id = ?')
        .get(oldId),
    ).toEqual({ renovada: 0, status: 'CONCLUIDA' });
    expect(
      fixture.database
        .prepare(
          "SELECT COUNT(*) AS total FROM qualificacoes_historico WHERE qualificacao_codigo = 'G1' AND data_conclusao = '2026-01-01'",
        )
        .get(),
    ).toEqual({ total: 0 });
  });

  it('rolls back the source when successor INSERT fails', async () => {
    const sourceId = insertHistory(fixture.database);
    fixture.database.exec(`
      CREATE TRIGGER fail_successor_insert
      BEFORE INSERT ON qualificacoes_historico
      WHEN NEW.renovacao_de IS NOT NULL
      BEGIN
        SELECT RAISE(ABORT, 'forced successor failure');
      END;
    `);

    await expect(renewQualificationHistoryAtomic(db, renewInput(sourceId))).rejects.toThrow(
      'forced successor failure',
    );

    expect(
      fixture.database
        .prepare('SELECT renovada, status FROM qualificacoes_historico WHERE id = ?')
        .get(sourceId),
    ).toEqual({ renovada: 0, status: 'CONCLUIDA' });
    expect(
      fixture.database
        .prepare('SELECT COUNT(*) AS total FROM qualificacoes_historico WHERE renovacao_de = ?')
        .get(sourceId),
    ).toEqual({ total: 0 });
  });

  it('rolls back successor and source marking when a later relation fails', async () => {
    const sourceId = insertHistory(fixture.database, {
      qualificationId: 106,
      qualificationCode: 'G1',
    });
    fixture.database.exec(`
      CREATE TRIGGER fail_required_relation_renewal
      BEFORE INSERT ON qualificacoes_historico
      WHEN NEW.qualificacao_codigo = 'G1-SEM'
      BEGIN
        SELECT RAISE(ABORT, 'forced renewal relation failure');
      END;
    `);

    await expect(
      renewQualificationHistoryAtomic(
        db,
        renewInput(sourceId, {
          qualificationId: 106,
          qualificationCode: 'G1',
          requiredRelation: requiredG1SemRelation('2026-08-01'),
        }),
      ),
    ).rejects.toThrow('forced renewal relation failure');

    expect(
      fixture.database
        .prepare('SELECT renovada, status FROM qualificacoes_historico WHERE id = ?')
        .get(sourceId),
    ).toEqual({ renovada: 0, status: 'CONCLUIDA' });
    expect(
      fixture.database
        .prepare('SELECT COUNT(*) AS total FROM qualificacoes_historico WHERE renovacao_de = ?')
        .get(sourceId),
    ).toEqual({ total: 0 });
  });

  it('serializes concurrent renewal and returns idempotent success on repetition', async () => {
    const sourceId = insertHistory(fixture.database);
    const [first, second] = await Promise.all([
      renewQualificationHistoryAtomic(db, renewInput(sourceId)),
      renewQualificationHistoryAtomic(db, renewInput(sourceId)),
    ]);
    const repeated = await renewQualificationHistoryAtomic(db, renewInput(sourceId));

    expect([first.action, second.action].sort()).toEqual(['created', 'idempotent']);
    expect(first.id).toBe(second.id);
    expect(repeated).toMatchObject({
      id: first.id,
      action: 'idempotent',
      previousHistoryId: sourceId,
    });
    expect(
      fixture.database
        .prepare('SELECT COUNT(*) AS total FROM qualificacoes_historico WHERE renovacao_de = ?')
        .get(sourceId),
    ).toEqual({ total: 1 });
  });

  it('rejects cross-tenant writes', async () => {
    await expect(
      createQualificationHistoryAtomic(
        db,
        createInput({ empresaId: 1, funcionarioId: 2000, qualificationId: 100 }),
      ),
    ).rejects.toMatchObject({ code: 'QUALIFICATION_CORE_NOT_CREATED' });
    expect(
      fixture.database
        .prepare(
          'SELECT COUNT(*) AS total FROM qualificacoes_historico WHERE funcionario_id = 2000',
        )
        .get(),
    ).toEqual({ total: 0 });
  });

  it('allows Maintenance scope but denies Operations and another tenant', async () => {
    await expect(
      assertQualificacaoAtribuicaoWithinOperationalScope({
        db,
        empresaId: 1,
        userId: 900,
        userRole: 'manager',
        qualificacaoTipoId: 100,
        funcionarioId: 1000,
      }),
    ).resolves.toBeUndefined();
    await expect(
      assertQualificacaoAtribuicaoWithinOperationalScope({
        db,
        empresaId: 1,
        userId: 900,
        userRole: 'manager',
        qualificacaoTipoId: 101,
        funcionarioId: 1000,
      }),
    ).rejects.toMatchObject({ code: 'OPERATIONAL_DOMAIN_ACCESS_DENIED' });
    await expect(
      assertQualificacaoAtribuicaoWithinOperationalScope({
        db,
        empresaId: 1,
        userId: 900,
        userRole: 'manager',
        qualificacaoTipoId: 200,
        funcionarioId: 1000,
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_DOMAIN_UNCLASSIFIED' });
  });

  it('keeps a successful core write and reports failed complements as pending', async () => {
    const core = await createQualificationHistoryAtomic(db, createInput());
    const pending = await settleQualificationComplementaryEffects({
      audit: async () => undefined,
      event: async () => undefined,
      certificate: async () => {
        throw new Error('certificate service unavailable');
      },
    });

    expect(core.action).toBe('created');
    expect(pending).toEqual(['certificate']);
    expect(
      fixture.database.prepare('SELECT id FROM qualificacoes_historico WHERE id = ?').get(core.id),
    ).toBeTruthy();
  });
});
