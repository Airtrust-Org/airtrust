import { DatabaseSync } from 'node:sqlite';

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

export class SqliteD1Database {
  readonly database = new DatabaseSync(':memory:');

  constructor() {
    createSchema(this.database);
    seedBase(this.database);
  }

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

export function insertHistory(
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
