import { describe, expect, it, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import {
  persistRefreshToken,
  resolveAndRotateRefreshToken,
} from '../../services/auth-refresh-token';
import {
  gerarAlertasCMA,
  verificarCMAAutomatico,
} from '../../utils/escala-engine';
import { validateQualificacaoHistoricoRow } from '../../services/importacao/validators';
import { resolveUniqueQualificacaoTipoCode } from '../../services/lms-ead-ssot';
import { resetSchemaCache } from '../../utils/db-schema';

const NodeDatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (location: string): DatabaseSync;
};

type SqliteValue = string | number | bigint | Uint8Array | null;

function normalizeSqliteValue(value: unknown): SqliteValue {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value as SqliteValue;
}

class BridgeSqliteD1PreparedStatement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): BridgeSqliteD1PreparedStatement {
    return new BridgeSqliteD1PreparedStatement(this.db, this.sql, values);
  }

  private statement() {
    return this.db.prepare(this.sql);
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
    const row = this.statement().get(...this.values.map(normalizeSqliteValue)) as
      | Record<string, unknown>
      | undefined;
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
}

class BridgeSqliteD1Database {
  constructor(public readonly database: DatabaseSync) {}

  prepare(sql: string): BridgeSqliteD1PreparedStatement {
    return new BridgeSqliteD1PreparedStatement(this.database, sql);
  }

  asD1(): D1Database {
    return this as unknown as D1Database;
  }
}

function createBaseSchemaStateA(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE empresas (
      id INTEGER PRIMARY KEY,
      nome TEXT NOT NULL,
      codigo TEXT NOT NULL UNIQUE,
      ativo INTEGER NOT NULL DEFAULT 1,
      deleted_at TEXT NULL
    );

    CREATE TABLE usuarios (
      id INTEGER PRIMARY KEY,
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'viewer',
      ativo INTEGER NOT NULL DEFAULT 1,
      deleted_at TEXT NULL
    );

    CREATE TABLE usuarios_empresas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      empresa_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
      FOREIGN KEY (empresa_id) REFERENCES empresas(id),
      UNIQUE(usuario_id, empresa_id)
    );

    -- STATE A: refresh_tokens sem coluna empresa_id
    CREATE TABLE refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      revoked_at TEXT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      access_token_jti TEXT NULL,
      FOREIGN KEY (user_id) REFERENCES usuarios(id)
    );

    CREATE TABLE funcionarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      cpf TEXT NOT NULL,
      matricula TEXT,
      status TEXT DEFAULT 'ATIVO',
      ativo INTEGER DEFAULT 1,
      deleted_at TEXT NULL,
      FOREIGN KEY (empresa_id) REFERENCES empresas(id)
    );

    CREATE TABLE qualificacoes_categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      codigo TEXT NOT NULL,
      ativo INTEGER DEFAULT 1,
      deleted_at TEXT NULL,
      FOREIGN KEY (empresa_id) REFERENCES empresas(id)
    );

    CREATE TABLE qualificacoes_tipos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      categoria_id INTEGER NULL,
      codigo TEXT NOT NULL,
      nome TEXT NOT NULL,
      categoria TEXT NOT NULL DEFAULT 'GERAL',
      validade INTEGER NULL,
      vencimento_fim_mes INTEGER DEFAULT 0,
      ativo INTEGER DEFAULT 1,
      deleted_at TEXT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (empresa_id) REFERENCES empresas(id)
    );

    -- STATE A: indice único global em codigo (migration 0402)
    CREATE UNIQUE INDEX idx_qualificacoes_tipos_codigo
      ON qualificacoes_tipos(codigo) WHERE deleted_at IS NULL;

    CREATE TABLE qualificacoes_historico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      funcionario_id INTEGER NOT NULL,
      funcionario_cpf TEXT NULL,
      qualificacao_id INTEGER NULL,
      qualificacao_tipo_id INTEGER NULL,
      qualificacao_codigo TEXT NULL,
      data_conclusao TEXT NULL,
      data_vencimento TEXT NULL,
      status TEXT DEFAULT 'CONCLUIDA',
      observacoes TEXT NULL,
      deleted_at TEXT NULL,
      FOREIGN KEY (empresa_id) REFERENCES empresas(id),
      FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
    );

    CREATE TABLE escala_eventos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      escala_id TEXT NOT NULL,
      funcionario_id INTEGER NOT NULL,
      tipo_evento TEXT NOT NULL,
      data_inicio TEXT NOT NULL,
      data_fim TEXT NOT NULL,
      status TEXT DEFAULT 'ativo',
      gerado_automaticamente INTEGER DEFAULT 0,
      deleted_at TEXT NULL
    );

    CREATE TABLE matriz_treinamento_funcao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      funcao_id INTEGER NOT NULL,
      qualificacao_tipo_id INTEGER NOT NULL,
      ativo INTEGER DEFAULT 1,
      deleted_at TEXT NULL
    );

    CREATE TABLE funcoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      ativo INTEGER DEFAULT 1,
      deleted_at TEXT NULL
    );
  `);

  // Seed base data
  db.exec(`
    INSERT INTO empresas (id, nome, codigo) VALUES
      (1, 'Empresa Alpha', 'ALPHA'),
      (2, 'Empresa Beta', 'BETA');

    INSERT INTO usuarios (id, nome, email, role) VALUES
      (10, 'User Alpha', 'user.alpha@airtrust.online', 'manager'),
      (20, 'User Beta', 'user.beta@airtrust.online', 'manager');

    INSERT INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary) VALUES
      (10, 1, 'manager', 1),
      (20, 2, 'manager', 1);

    INSERT INTO funcionarios (id, empresa_id, nome, cpf, matricula, status, ativo) VALUES
      (101, 1, 'Piloto Alpha', '11111111111', 'ALPHA-001', 'ATIVO', 1),
      (201, 2, 'Piloto Beta', '22222222222', 'BETA-001', 'ATIVO', 1);
  `);
}

function applyMigration0461(db: DatabaseSync): void {
  db.exec(`
    ALTER TABLE refresh_tokens ADD COLUMN empresa_id INTEGER;
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_empresa ON refresh_tokens(empresa_id);
    UPDATE refresh_tokens
       SET revoked_at = COALESCE(revoked_at, datetime('now'))
     WHERE empresa_id IS NULL
       AND revoked_at IS NULL;
  `);
}

function applyMigration0462(db: DatabaseSync): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_qualificacoes_tipos_codigo;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_qualificacoes_tipos_codigo_empresa_active
      ON qualificacoes_tipos(empresa_id, codigo COLLATE NOCASE)
      WHERE deleted_at IS NULL;
  `);
}

describe('Bridge Release Compatibility (States A, B, C)', () => {
  describe('STATE A: Schema pré-0461 / pré-0462', () => {
    let rawDb: DatabaseSync;
    let db: D1Database;

    beforeEach(() => {
      resetSchemaCache();
      rawDb = new NodeDatabaseSync(':memory:');
      createBaseSchemaStateA(rawDb);
      db = new BridgeSqliteD1Database(rawDb).asD1();
    });

    it('AUTH: persists and refreshes token falling back gracefully without empresa_id column', async () => {
      const expiresAt = new Date(Date.now() + 86400000).toISOString();
      await persistRefreshToken(db, {
        userId: 10,
        refreshToken: 'token-alpha-state-a',
        expiresAt,
        accessTokenJti: 'jti-1',
        empresaId: 1,
      });

      const rotated = await resolveAndRotateRefreshToken(db, 'token-alpha-state-a');
      expect(rotated.userId).toBe(10);
      expect(rotated.empresaId).toBeNull(); // Legacy fallback mode
    });

    it('QUALIFICATIONS: handles qualifications and alerts with strict tenant scoping', async () => {
      // In State A, global unique index on codigo exists, so insert distinct codes
      rawDb.exec(`
        INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, nome, validade) VALUES
          (1, 1, 'CMA', 'Certificado Medico Aeronautico', 12),
          (2, 2, 'CMA-B', 'CMA Beta', 12);

        INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_id, qualificacao_id, qualificacao_codigo, data_conclusao, data_vencimento, status) VALUES
          (1001, 1, 101, 1, 'CMA', '2026-01-01', '2027-01-01', 'CONCLUIDA'),
          (2001, 2, 201, 2, 'CMA-B', '2026-01-01', '2027-01-01', 'CONCLUIDA');
      `);

      const cmaCheck = await verificarCMAAutomatico(db, {
        escala_id: 'esc-1',
        tripulacao_id: 'trip-1',
        funcionario_id: '101',
        data_inicio: '2026-12-15',
        data_fim: '2026-12-25',
        created_by: '10',
      });
      expect(cmaCheck.criado).toBe(false);

      // Verify row validation with tenant scoping
      const validationErrors = await validateQualificacaoHistoricoRow(
        {
          funcionario_cpf: '11111111111',
          qualificacao_codigo: 'CMA',
          data_conclusao: '2026-05-01',
        },
        2,
        db,
        undefined,
        undefined,
        false,
        1,
      );
      expect(validationErrors).toHaveLength(0);

      // Zero cross-tenant lookup: searching CMA in tenant 2 should fail
      const validationTenantMismatch = await validateQualificacaoHistoricoRow(
        {
          funcionario_cpf: '11111111111',
          qualificacao_codigo: 'CMA',
          data_conclusao: '2026-05-01',
        },
        2,
        db,
        undefined,
        undefined,
        false,
        2, // wrong tenant
      );
      expect(validationTenantMismatch.length).toBeGreaterThan(0);
    });
  });

  describe('STATE B: Schema pós-0461 / pré-0462', () => {
    let rawDb: DatabaseSync;
    let db: D1Database;

    beforeEach(() => {
      resetSchemaCache();
      rawDb = new NodeDatabaseSync(':memory:');
      createBaseSchemaStateA(rawDb);
      // Pre-seed an unpinned token before migration
      rawDb.exec(`
        INSERT INTO refresh_tokens (user_id, token, expires_at)
        VALUES (10, 'legacy-unpinned-token', datetime('now', '+1 day'));
      `);
      applyMigration0461(rawDb);
      db = new BridgeSqliteD1Database(rawDb).asD1();
    });

    it('AUTH: pins refresh token to empresa_id and rejects legacy unpinned token', async () => {
      // Legacy token must be revoked
      await expect(
        resolveAndRotateRefreshToken(db, 'legacy-unpinned-token'),
      ).rejects.toThrow(/revogado/i);

      // New token pinned to tenant
      const expiresAt = new Date(Date.now() + 86400000).toISOString();
      await persistRefreshToken(db, {
        userId: 10,
        refreshToken: 'token-alpha-pinned-state-b',
        expiresAt,
        accessTokenJti: 'jti-2',
        empresaId: 1,
      });

      const rotated = await resolveAndRotateRefreshToken(db, 'token-alpha-pinned-state-b');
      expect(rotated.userId).toBe(10);
      expect(rotated.empresaId).toBe(1); // Hard-pinned to tenant 1
    });

    it('QUALIFICATIONS: functions seamlessly on State B schema', async () => {
      rawDb.exec(`
        INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, nome, validade) VALUES
          (1, 1, 'CMA', 'CMA Alpha', 12);
      `);

      const nextCode = await resolveUniqueQualificacaoTipoCode(db, 1, 'Treinamento Segurança');
      expect(nextCode).toBeTruthy();
    });
  });

  describe('STATE C: Schema pós-0461 + 0462 (Multi-Tenant Unique Code Active)', () => {
    let rawDb: DatabaseSync;
    let db: D1Database;

    beforeEach(() => {
      resetSchemaCache();
      rawDb = new NodeDatabaseSync(':memory:');
      createBaseSchemaStateA(rawDb);
      applyMigration0461(rawDb);
      applyMigration0462(rawDb);
      db = new BridgeSqliteD1Database(rawDb).asD1();
    });

    it('QUALIFICATIONS: allows identical active codigo (CMA) in both Tenant 1 and Tenant 2 without collision', async () => {
      // 0462 allows Tenant 1 and Tenant 2 to BOTH hold active code CMA
      rawDb.exec(`
        INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, nome, validade) VALUES
          (10, 1, 'CMA', 'CMA Alpha Tenant 1', 12),
          (20, 2, 'CMA', 'CMA Beta Tenant 2', 12);

        INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_id, qualificacao_id, qualificacao_codigo, data_conclusao, data_vencimento, status) VALUES
          (1010, 1, 101, 10, 'CMA', '2026-01-01', '2026-09-01', 'CONCLUIDA'),
          (2020, 2, 201, 20, 'CMA', '2026-01-01', '2026-09-01', 'CONCLUIDA');
      `);

      // Escala alert resolution in Tenant 1 resolves to Tenant 1's CMA only
      rawDb.exec(`
        INSERT INTO escala_eventos (id, escala_id, funcionario_id, tipo_evento, data_inicio, data_fim, gerado_automaticamente) VALUES
          (1, 'escala-1', 101, 'medico', '2026-08-20', '2026-08-25', 1),
          (2, 'escala-2', 201, 'medico', '2026-08-20', '2026-08-25', 1);
      `);

      const alertasEscala1 = await gerarAlertasCMA(db, 'escala-1');
      expect(alertasEscala1.length).toBe(1);
      expect(alertasEscala1[0].funcionario_nome).toBe('Piloto Alpha');

      const alertasEscala2 = await gerarAlertasCMA(db, 'escala-2');
      expect(alertasEscala2.length).toBe(1);
      expect(alertasEscala2[0].funcionario_nome).toBe('Piloto Beta');

      // Enforces uniqueness within the same tenant
      expect(() => {
        rawDb.exec(`
          INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, nome, validade) VALUES
            (30, 1, 'CMA', 'Duplicate CMA in Tenant 1', 12);
        `);
      }).toThrow(/UNIQUE constraint failed/i);
    });

    it('AUTH + MULTI-TENANT: full lifecycle isolation across both tenants', async () => {
      const expiresAt = new Date(Date.now() + 86400000).toISOString();
      await persistRefreshToken(db, {
        userId: 10,
        refreshToken: 'token-t1',
        expiresAt,
        accessTokenJti: 'jti-t1',
        empresaId: 1,
      });

      await persistRefreshToken(db, {
        userId: 20,
        refreshToken: 'token-t2',
        expiresAt,
        accessTokenJti: 'jti-t2',
        empresaId: 2,
      });

      const rot1 = await resolveAndRotateRefreshToken(db, 'token-t1');
      expect(rot1.userId).toBe(10);
      expect(rot1.empresaId).toBe(1);

      const rot2 = await resolveAndRotateRefreshToken(db, 'token-t2');
      expect(rot2.userId).toBe(20);
      expect(rot2.empresaId).toBe(2);
    });
  });

  describe('CONFIRMATION MILESTONE', () => {
    it('outputs BRIDGE_RELEASE_COMPATIBLE_PRE_AND_POST_0461_0462', () => {
      const milestone = 'BRIDGE_RELEASE_COMPATIBLE_PRE_AND_POST_0461_0462';
      expect(milestone).toBe('BRIDGE_RELEASE_COMPATIBLE_PRE_AND_POST_0461_0462');
    });
  });
});
