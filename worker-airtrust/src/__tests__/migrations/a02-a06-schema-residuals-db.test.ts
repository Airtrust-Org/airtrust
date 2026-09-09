import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function runSqlite(sql: string): string {
  const result = spawnSync('sqlite3', [':memory:'], {
    input: sql,
    encoding: 'utf-8',
    timeout: 5000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`sqlite3 exited ${result.status}: ${result.stderr}`);
  }
  return result.stdout;
}

describe('A-02 and A-06 residual migrations - DB Validation', () => {
  const mig0489 = readFileSync(resolve(process.cwd(), 'migrations/0489_a02_natural_keys_tenant_scoped.sql'), 'utf8');
  const mig0490 = readFileSync(resolve(process.cwd(), 'migrations/0490_a06_redundant_indexes_cleanup.sql'), 'utf8');

  it('validates A-02 unique constraints correctly', () => {
    // 1. Setup schema and apply migration
    const sql = `
      CREATE TABLE funcionarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        cpf TEXT,
        matricula TEXT,
        email TEXT,
        empresa_id INTEGER NOT NULL,
        deleted_at TEXT
      );
      ${mig0489}
      
      -- Test Scenarios:
      -- 1. Two employees, different tenants, same CPF: allowed
      INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id) VALUES ('A', '123', 'M1', 'a@a.com', 1);
      INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id) VALUES ('B', '123', 'M2', 'b@b.com', 2);
      
      -- 3. Cross-tenant same matricula: allowed
      INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id) VALUES ('D', '999', 'M1', 'd@d.com', 2);
      
      -- 5. Equivalent for email (case insensitive allowed cross tenant)
      INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id) VALUES ('F', '777', 'M7', 'a@a.com', 2);
      
      -- 6. Soft-deleted record does not block new active
      INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id, deleted_at) VALUES ('H', 'DEL', 'MDEL', 'del@del.com', 3, '2026-01-01');
      INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id) VALUES ('I', 'DEL', 'MDEL', 'del@del.com', 3);
      
      -- 7. NULL or empty strings
      INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id) VALUES ('J', NULL, NULL, NULL, 4);
      INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id) VALUES ('K', NULL, NULL, NULL, 4);
      INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id) VALUES ('L', '  ', '  ', '  ', 4);
      INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id) VALUES ('M', '  ', '  ', '  ', 4);
      
      SELECT COUNT(*) as c FROM funcionarios;
    `;
    const out = runSqlite(sql);
    expect(out.trim()).toBe('10');

    // Test failures (using PRAGMA or just checking error message)
    // Same tenant, same CPF active: blocked
    try {
      runSqlite(`
        ${sql}
        INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id) VALUES ('C', '123', 'M3', 'c@c.com', 1);
      `);
      expect.fail('Should block same CPF');
    } catch (err: any) {
      expect(err.message).toMatch(/UNIQUE constraint failed/);
    }

    // Intra-tenant same matricula active: blocked
    try {
      runSqlite(`
        ${sql}
        INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id) VALUES ('E', '888', 'M1', 'e@e.com', 1);
      `);
      expect.fail('Should block same matricula');
    } catch (err: any) {
      expect(err.message).toMatch(/UNIQUE constraint failed/);
    }

    // Intra-tenant same email (case insensitive!): blocked
    try {
      runSqlite(`
        ${sql}
        INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id) VALUES ('G', '666', 'M6', 'A@A.COM', 1);
      `);
      expect.fail('Should block same email regardless of case');
    } catch (err: any) {
      expect(err.message).toMatch(/UNIQUE constraint failed/);
    }
  });

  it('validates A-06 redundant indexes cleanup', () => {
    const sql = `
      CREATE TABLE fichas_sessao (id INTEGER PRIMARY KEY, instrutor_id INTEGER, empresa_id INTEGER);
      CREATE INDEX idx_fichas_instrutor ON fichas_sessao(instrutor_id);
      CREATE INDEX idx_fichas_sessao_instrutor ON fichas_sessao(instrutor_id);
      CREATE INDEX idx_fichas_sessao_empresa_id ON fichas_sessao(empresa_id);
      CREATE INDEX idx_fichas_sessao_empresa ON fichas_sessao(empresa_id);
      
      CREATE TABLE modelos_sessao (id INTEGER PRIMARY KEY, codigo TEXT, deleted_at TEXT);
      CREATE INDEX idx_modelos_codigo ON modelos_sessao(codigo);
      CREATE INDEX idx_modelos_sessao_codigo ON modelos_sessao(codigo);
      CREATE INDEX idx_modelos_deleted ON modelos_sessao(deleted_at);
      CREATE INDEX idx_modelos_sessao_deleted ON modelos_sessao(deleted_at);
      
      ${mig0490}
      
      -- Ensure idempotence
      ${mig0490}
      
      SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_autoindex%';
    `;
    const out = runSqlite(sql);
    const names = out.trim().split('\n');
    
    // Kept ones
    expect(names).toContain('idx_fichas_sessao_instrutor');
    expect(names).toContain('idx_fichas_sessao_empresa');
    expect(names).toContain('idx_modelos_sessao_codigo');
    expect(names).toContain('idx_modelos_sessao_deleted');

    // Dropped ones
    expect(names).not.toContain('idx_fichas_instrutor');
    expect(names).not.toContain('idx_fichas_sessao_empresa_id');
    expect(names).not.toContain('idx_modelos_codigo');
    expect(names).not.toContain('idx_modelos_deleted');
  });
});
