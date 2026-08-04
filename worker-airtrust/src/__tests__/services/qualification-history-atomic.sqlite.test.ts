// @ts-ignore -- CI is pinned to Node 24, where node:sqlite is built in.
import { DatabaseSync } from 'node:sqlite';
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

type SqliteValue = string | number | bigint | Uint8Array | null;

function normalizeSqliteValue(value: unknown): SqliteValue {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value as SqliteValue;
}

class SqliteD1PreparedStatement {
  constructor(
    private readonly owner: SqliteD1Database,
    private readonly sql: string,
    private readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): SqliteD1PreparedStatement {
    return new SqliteD1PreparedStatement(this.owner, this.sql, values);
  }

  private statement() {
    return this.owner.database.prepare(this.sql);
  }

  executeRun() {
    const result = this.statement().run(...this.values.map(normalizeSqliteValue));
    return {
      success: true,
      meta: {
        changes: Number(result.changes || 0),
        last_row_id: Number(result.lastInsertRowid || 0),
        duration: 0,
        rows_read: 0,
        rows_written: Number(result.changes || 0),
        changed_db: Number(result.changes || 0) > 0,
        size_after: 0,
      },
      results: [],
    };
  }

  async run() {
    return this.executeRun();
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = this.statement().get(
      ...this.values.map(normalizeSqliteValue),
    ) as Record<string, unknown> | undefined;
    if (!row) return null;
    if (column) return (row[column] as T) ?? null;
    return row as T;
  }

  async all<T = Record<string, unknown>>() {
    return {
      success: true,
      results: this.statement().all(...this.values.map(normalizeSqliteValue)) as T[],
      meta: {
        changes: 0,
        last_row_id: 0,
        duration: 0,
        rows_read: 0,
        rows_written: 0,
        changed_db: false,
        size_after: 0,
      },
    };
  }

  async raw<T = unknown[]>() {
    const result = await this.all<Record<string, unknown>>();
    return result.results.map((row) => Object.values(row)) as T[];
  }
}

class SqliteD1Database {
  readonly database = new DatabaseSync(':memory:');

  prepare(sql: string): SqliteD1PreparedStatement {
    return new SqliteD1PreparedStatement(this, sql);
  }

  async batch(statements: SqliteD1PreparedStatement[]) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map((statement) => statement.executeRun());
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }

  asD1(): D1Database {
    return this as unknown as D1Database;
  }
}

function createSchema(database: DatabaseSync): void {
  database.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE empresas (
      id INTEGER PRIMARY KEY,
      operational_domain_rbac_enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE dominios_operacionais (
      codigo TEXT PRIMARY KEY,
      ativo INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE setores (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      dominio_codigo TEXT,
      ativo INTEGER NOT NULL DEFAULT 1,
      deleted_at TEXT
    );

    CREATE TABLE setores_gestores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      setor_id INTEGER NOT NULL,
      usuario_id INTEGER,
      ativo INTEGER NOT NULL DEFAULT 1,
      deleted_at TEXT
    );

    CREATE TABLE qualificacoes_categorias (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      dominio_codigo TEXT,
      deleted_at TEXT
    );

    CREATE TABLE qualificacoes_tipos (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      codigo TEXT NOT NULL,
      categoria TEXT,
      categoria_id INTEGER,
      dominio_codigo TEXT,
      validade INTEGER,
      carga_horaria REAL,
      carga_horaria_inicial REAL,
      carga_horaria_recorrente REAL,
      deleted_at TEXT
    );

    CREATE TABLE funcionarios (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      setor_id INTEGER,
      nascimento TEXT,
      cpf TEXT,
      nome TEXT,
      guerra TEXT,
      deleted_at TEXT
    );

    CREATE TABLE qualificacoes_historico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      funcionario_id INTEGER NOT NULL,
      qualificacao_id INTEGER,
      qualificacao_codigo TEXT,
      categoria TEXT,
      data_conclusao TEXT,
      data_vencimento TEXT,
      validade_meses INTEGER,
      numero_certificado TEXT,
      instrutor TEXT,
      observacoes TEXT,
      status TEXT,
      renovada INTEGER NOT NULL DEFAULT 0,
      carga_horaria REAL,
      tipo_treinamento TEXT,
      empresa_id INTEGER NOT NULL,
      renovacao_de INTEGER,
      created_at TEXT,
      updated_at TEXT,
      deleted_at TEXT
    );

    CREATE UNIQUE INDEX idx_qh_unique_active
      ON qualificacoes_historico(funcionario_id, qualificacao_codigo, data_conclusao)
      WHERE deleted_at IS NULL;
  `);
}

function seedBase(database: DatabaseSync): void {
  database.exec(`
    INSERT INTO empresas (id, operational_domain_rbac_enabled)
    VALUES (1, 1), (2, 1);

    INSERT INTO dominios_operacionais (codigo, ativo)
    VALUES ('OPERACOES', 1), ('MANUTENCAO', 1), ('SGSO', 1), ('FRMS', 1), ('CORPORATIVO', 1);

    INSERT INTO setores (id, empresa_id, dominio_codigo, ativo)
    VALUES
      (10, 1, 'MANUTENCAO', 1),
      (11, 1, 'OPERACOES', 1),
      (20, 2, 'MANUTENCAO', 1);

    INSERT INTO setores_gestores (empresa_id, setor_id, usuario_id, ativo)
    VALUES (1, 10, 900, 1);

    INSERT INTO qualificacoes_categorias (id, empresa_id, dominio_codigo)
    VALUES
      (1, 1, 'MANUTENCAO'),
      (2, 1, 'OPERACOES'),
      (3, 2, 'MANUTENCAO');

    INSERT INTO qualificacoes_tipos (
      id, empresa_id, codigo, categoria, categoria_id, validade,
      carga_horaria, carga_horaria_inicial, carga_horaria_recorrente
    ) VALUES
      (100, 1, 'MNT-12', 'MANUTENCAO', 1, 12, 8, 8, 4),
      (101, 1, 'OPS-12', 'OPERACOES', 2, 12, 8, 8, 4),
      (102, 1, 'PERM', 'MANUTENCAO', 1, NULL, 2, 2, 2),
      (103, 1, 'SIX', 'MANUTENCAO', 1, 6, 2, 2, 2),
      (104, 1, 'OTHER', 'MANUTENCAO', 1, 18, 2, 2, 2),
      (105, 1, 'CMA', 'MANUTENCAO', 1, 12, 2, 2, 2),
      (106, 1, 'G1', 'MANUTENCAO', 1, 12, 2, 2, 2),
      (107, 1, 'G1-SEM', 'MANUTENCAO', 1, 6, 2, 2, 2),
      (200, 2, 'MNT-12', 'MANUTENCAO', 3, 12, 8, 8, 4);

    INSERT INTO funcionarios (id, empresa_id, setor_id, nascimento, cpf, nome)
    VALUES
      (1000, 1, 10, '1970-08-05', '111', 'Antes dos 60'),
      (1001, 1, 10, '1966-08-04', '112', 'Aos 60'),
      (1002, 1, 11, '1980-01-01', '113', 'Operações'),
      (2000, 2, 20, '1980-01-01', '211', 'Outro tenant');
  `);
}

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
    expiryDate: calculateQualificationExpiry({
      completionDate,
      validityMonths: 6,
    }),
    validityMonths: 6,
    workload: 2,
    trainingType: 'SEMESTRAL',
    status: 'CONCLUIDA',
  };
}

function insertHistory(
  database: DatabaseSync,
  params: {
    funcionarioId?: number;
    qualificationId?: number;
    qualificationCode?: string;
    completionDate?: string;
    expiryDate?: string | null;
    validityMonths?: number | null;
    empresaId?: number;
    status?: string;
    renewed?: number;
    renewalOf?: number | null;
  } = {},
): number {
  const result = database
    .prepare(
      `INSERT INTO qualificacoes_historico (
         funcionario_id, qualificacao_id, qualificacao_codigo, categoria,
         data_conclusao, data_vencimento, validade_meses, status, renovada,
         carga_horaria, tipo_treinamento, empresa_id, renovacao_de,
         created_at, updated_at
       ) VALUES (?, ?, ?, 'MANUTENCAO', ?, ?, ?, ?, ?, 4, 'RECORRENTE', ?, ?, datetime('now'), datetime('now'))`,
    )
    .run(
      params.funcionarioId ?? 1000,
      params.qualificationId ?? 100,
      params.qualificationCode ?? 'MNT-12',
      params.completionDate ?? '2025-08-01',
      params.expiryDate === undefined ? '2026-08-01' : params.expiryDate,
      params.validityMonths === undefined ? 12 : params.validityMonths,
      params.status ?? 'CONCLUIDA',
      params.renewed ?? 0,
      params.empresaId ?? 1,
      params.renewalOf ?? null,
    );

  return Number(result.lastInsertRowid);
}

describe('qualification history atomic core with real SQLite', () => {
  let fixture: SqliteD1Database;
  let db: D1Database;

  beforeEach(() => {
    fixture = new SqliteD1Database();
    createSchema(fixture.database);
    seedBase(fixture.database);
    db = fixture.asD1();
  });

  afterEach(() => fixture.close());

  it('keeps NULL and zero as no-expiry and calculates 6, 12 and other validities', () => {
    expect(normalizeValidityMonths(null)).toBeNull();
    expect(normalizeValidityMonths(0)).toBeNull();
    expect(
      calculateQualificationExpiry({
        completionDate: '2026-01-15',
        validityMonths: null,
      }),
    ).toBeNull();
    expect(
      calculateQualificationExpiry({
        completionDate: '2026-01-15',
        validityMonths: 6,
      }),
    ).toBe('2026-07-15');
    expect(
      calculateQualificationExpiry({
        completionDate: '2026-01-15',
        validityMonths: 12,
      }),
    ).toBe('2027-01-15');
    expect(
      calculateQualificationExpiry({
        completionDate: '2026-01-15',
        validityMonths: 18,
      }),
    ).toBe('2027-07-15');
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
    'creates %s with the exact configured validity',
    async (code, qualificationId, validityMonths, expectedExpiry) => {
      const completionDate = '2026-01-15';
      const result = await createQualificationHistoryAtomic(
        db,
        createInput({
          qualificationId,
          qualificationCode: code,
          completionDate,
          validityMonths,
          expiryDate: calculateQualificationExpiry({
            completionDate,
            validityMonths,
          }),
        }),
      );

      expect(result.action).toBe('created');
      const row = fixture.database
        .prepare(
          `SELECT validade_meses, data_vencimento
             FROM qualificacoes_historico
            WHERE id = ?`,
        )
        .get(result.id) as { validade_meses: number | null; data_vencimento: string | null };

      expect(row.validade_meses).toBe(validityMonths);
      expect(row.data_vencimento).toBe(expectedExpiry);
    },
  );

  it('creates the mandatory G1/G1-SEM pair and renews both predecessors atomically', async () => {
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

    expect(result.action).toBe('created');
    expect(result.relationHistoryId).toBeTruthy();

    const predecessors = fixture.database
      .prepare(
        `SELECT id, renovada, status
           FROM qualificacoes_historico
          WHERE id IN (?, ?)
          ORDER BY id`,
      )
      .all(oldG1, oldG1Sem) as Array<{ id: number; renovada: number; status: string }>;

    expect(predecessors).toEqual([
      { id: oldG1, renovada: 1, status: 'RENOVADA' },
      { id: oldG1Sem, renovada: 1, status: 'RENOVADA' },
    ]);
  });

  it('rolls back creation and predecessor marking when the required relation fails', async () => {
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

    const old = fixture.database
      .prepare('SELECT renovada, status FROM qualificacoes_historico WHERE id = ?')
      .get(oldId) as { renovada: number; status: string };
    const newCount = fixture.database
      .prepare(
        `SELECT COUNT(*) AS total
           FROM qualificacoes_historico
          WHERE qualificacao_codigo = 'G1'
            AND data_conclusao = '2026-01-01'`,
      )
      .get() as { total: number };

    expect(old).toEqual({ renovada: 0, status: 'CONCLUIDA' });
    expect(newCount.total).toBe(0);
  });

  it('rolls back an attempted renewal when successor INSERT fails', async () => {
    const sourceId = insertHistory(fixture.database);

    fixture.database.exec(`
      CREATE TRIGGER fail_successor_insert
      BEFORE INSERT ON qualificacoes_historico
      WHEN NEW.renovacao_de IS NOT NULL
      BEGIN
        SELECT RAISE(ABORT, 'forced successor failure');
      END;
    `);

    await expect(
      renewQualificationHistoryAtomic(db, renewInput(sourceId)),
    ).rejects.toThrow('forced successor failure');

    const source = fixture.database
      .prepare('SELECT renovada, status FROM qualificacoes_historico WHERE id = ?')
      .get(sourceId) as { renovada: number; status: string };
    const successors = fixture.database
      .prepare(
        'SELECT COUNT(*) AS total FROM qualificacoes_historico WHERE renovacao_de = ?',
      )
      .get(sourceId) as { total: number };

    expect(source).toEqual({ renovada: 0, status: 'CONCLUIDA' });
    expect(successors.total).toBe(0);
  });

  it('rolls back successor and source marking when a renewal relation fails afterwards', async () => {
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

    const source = fixture.database
      .prepare('SELECT renovada, status FROM qualificacoes_historico WHERE id = ?')
      .get(sourceId) as { renovada: number; status: string };
    const successors = fixture.database
      .prepare(
        'SELECT COUNT(*) AS total FROM qualificacoes_historico WHERE renovacao_de = ?',
      )
      .get(sourceId) as { total: number };

    expect(source).toEqual({ renovada: 0, status: 'CONCLUIDA' });
    expect(successors.total).toBe(0);
  });

  it('serializes two concurrent renewals into one successor', async () => {
    const sourceId = insertHistory(fixture.database);

    const [first, second] = await Promise.all([
      renewQualificationHistoryAtomic(db, renewInput(sourceId)),
      renewQualificationHistoryAtomic(db, renewInput(sourceId)),
    ]);

    expect([first.action, second.action].sort()).toEqual(['created', 'idempotent']);
    expect(first.id).toBe(second.id);

    const successors = fixture.database
      .prepare(
        'SELECT COUNT(*) AS total FROM qualificacoes_historico WHERE renovacao_de = ?',
      )
      .get(sourceId) as { total: number };
    const source = fixture.database
      .prepare('SELECT renovada, status FROM qualificacoes_historico WHERE id = ?')
      .get(sourceId) as { renovada: number; status: string };

    expect(successors.total).toBe(1);
    expect(source).toEqual({ renovada: 1, status: 'RENOVADA' });
  });

  it('returns idempotent success for an exact repeated renewal request', async () => {
    const sourceId = insertHistory(fixture.database);
    const first = await renewQualificationHistoryAtomic(db, renewInput(sourceId));
    const repeated = await renewQualificationHistoryAtomic(db, renewInput(sourceId));

    expect(first.action).toBe('created');
    expect(repeated).toMatchObject({
      id: first.id,
      action: 'idempotent',
      previousHistoryId: sourceId,
    });
  });

  it('does not create cross-tenant history', async () => {
    await expect(
      createQualificationHistoryAtomic(
        db,
        createInput({
          empresaId: 1,
          funcionarioId: 2000,
          qualificationId: 100,
        }),
      ),
    ).rejects.toMatchObject({
      code: 'QUALIFICATION_CORE_NOT_CREATED',
    });

    const count = fixture.database
      .prepare(
        `SELECT COUNT(*) AS total
           FROM qualificacoes_historico
          WHERE funcionario_id = 2000`,
      )
      .get() as { total: number };
    expect(count.total).toBe(0);
  });

  it('allows a Maintenance manager to create Maintenance qualifications in scope', async () => {
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
  });

  it('denies the same Maintenance manager an Operations qualification', async () => {
    await expect(
      assertQualificacaoAtribuicaoWithinOperationalScope({
        db,
        empresaId: 1,
        userId: 900,
        userRole: 'manager',
        qualificacaoTipoId: 101,
        funcionarioId: 1000,
      }),
    ).rejects.toMatchObject({
      code: 'OPERATIONAL_DOMAIN_ACCESS_DENIED',
    });
  });

  it('denies a qualification type from another tenant', async () => {
    await expect(
      assertQualificacaoAtribuicaoWithinOperationalScope({
        db,
        empresaId: 1,
        userId: 900,
        userRole: 'manager',
        qualificacaoTipoId: 200,
        funcionarioId: 1000,
      }),
    ).rejects.toMatchObject({
      code: 'RESOURCE_DOMAIN_UNCLASSIFIED',
    });
  });

  it('reports complementary work as pending without changing a successful core write into an error', async () => {
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

    const row = fixture.database
      .prepare('SELECT id FROM qualificacoes_historico WHERE id = ?')
      .get(core.id);
    expect(row).toBeTruthy();
  });
});
