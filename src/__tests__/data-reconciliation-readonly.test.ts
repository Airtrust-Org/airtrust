import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import { findings } from '../../scripts/data-reconciliation/phase1/catalog.mjs';
import {
  runDiagnostics,
  validateReadonlySql,
} from '../../scripts/data-reconciliation/phase1/run-readonly-diagnostics.mjs';

const SALT = 'airtrust-local-test-salt-20260804';

function makeDb(sql: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'airtrust-reconciliation-'));
  const dbPath = path.join(dir, 'fixture.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(sql);
  db.close();
  return { dir, dbPath };
}

function hashFile(filePath: string) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

const qualificationSchema = `
  CREATE TABLE qualificacoes_tipos (
    id INTEGER PRIMARY KEY,
    validade INTEGER,
    categoria TEXT,
    empresa_id INTEGER,
    deleted_at TEXT
  );
  CREATE TABLE qualificacoes_historico (
    id INTEGER PRIMARY KEY,
    empresa_id INTEGER,
    funcionario_id INTEGER,
    qualificacao_id INTEGER,
    qualificacao_codigo TEXT,
    categoria TEXT,
    status TEXT,
    renovacao_de INTEGER,
    data_conclusao TEXT,
    data_vencimento TEXT,
    numero_certificado TEXT,
    certificado_arquivo_id TEXT,
    lms_matricula_id INTEGER,
    origem_tipo TEXT,
    deleted_at TEXT
  );
  CREATE TABLE funcionarios (
    id INTEGER PRIMARY KEY,
    empresa_id INTEGER,
    ativo INTEGER,
    deleted_at TEXT
  );
`;

// Keep the SQL fixtures and expected snapshots stable for deterministic reconciliation tests.
// prettier-ignore
describe('data reconciliation phase 1', () => {
  it('reports a healthy supported fixture without findings', () => {
    const { dbPath } = makeDb(`${qualificationSchema}
      INSERT INTO qualificacoes_tipos VALUES (10, 6, 'EAD', 1, NULL);
      INSERT INTO funcionarios VALUES (20, 1, 1, NULL);
      INSERT INTO qualificacoes_historico VALUES (
        30, 1, 20, 10, 'EAD-BASE', 'EAD', 'CONCLUIDA', NULL,
        '2026-01-01', '2026-07-01', NULL, NULL, NULL, NULL, NULL
      );
    `);

    const report = runDiagnostics({ dbPath, salt: SALT });
    expect(report.summary.found).toBe(0);
    expect(report.summary.totalFindings).toBe(0);
  });

  it('detects multiple inconsistencies in one record and keeps counts coherent', () => {
    const { dbPath } = makeDb(`${qualificationSchema}
      INSERT INTO qualificacoes_tipos VALUES (10, NULL, 'EAD', 1, NULL);
      INSERT INTO funcionarios VALUES (20, 1, 1, NULL);
      INSERT INTO qualificacoes_historico VALUES (
        30, 1, 20, 10, 'EAD-X', 'EAD', 'RENOVADA', NULL,
        '2025-01-01', '2026-01-01', 'CERT-X', NULL, NULL, NULL, NULL
      );
    `);

    const report = runDiagnostics({ dbPath, salt: SALT });
    const qualificationFindings = report.categories.QUALIFICACOES.filter(
      (item: { status: string }) => item.status === 'FOUND',
    );

    expect(qualificationFindings.map((item: { code: string }) => item.code)).toEqual(
      expect.arrayContaining(['QUAL-001', 'QUAL-003']),
    );
    const summed = Object.values(report.categories)
      .flat()
      .reduce((total: number, item: { count: number }) => total + item.count, 0);
    expect(summed).toBe(report.summary.totalFindings);
  });

  it('counts two affected tenants without exposing raw IDs', () => {
    const { dbPath } = makeDb(`${qualificationSchema}
      INSERT INTO qualificacoes_tipos VALUES (10, NULL, 'EAD', 1, NULL);
      INSERT INTO qualificacoes_tipos VALUES (11, NULL, 'EAD', 2, NULL);
      INSERT INTO funcionarios VALUES (20, 1, 1, NULL);
      INSERT INTO funcionarios VALUES (21, 2, 1, NULL);
      INSERT INTO qualificacoes_historico VALUES (30,1,20,10,'A','EAD','CONCLUIDA',NULL,'2025-01-01','2026-01-01',NULL,NULL,NULL,NULL,NULL);
      INSERT INTO qualificacoes_historico VALUES (31,2,21,11,'B','EAD','CONCLUIDA',NULL,'2025-02-01','2026-02-01',NULL,NULL,NULL,NULL,NULL);
    `);

    const report = runDiagnostics({ dbPath, salt: SALT });
    const finding = report.categories.QUALIFICACOES.find(
      (item: { code: string }) => item.code === 'QUAL-001',
    );
    const serialized = JSON.stringify(report);

    expect(finding.companiesAffected).toBe(2);
    expect(finding.count).toBe(2);
    expect(serialized).not.toContain('"tenant_id":1');
    expect(serialized).not.toContain('"entity_id":30');
    expect(finding.examples[0].tenant_id).toMatch(/^tenant_[a-f0-9]{16}$/);
    expect(finding.examples[0].entity_id).toMatch(/^id_[a-f0-9]{16}$/);
  });

  it('keeps ambiguous H5P associations separate from unique backfill candidates', () => {
    const { dbPath } = makeDb(`
      CREATE TABLE lms_cursos (
        id INTEGER PRIMARY KEY, empresa_id INTEGER, tipo_conteudo TEXT,
        scorm_package_r2_prefix TEXT, h5p_conteudo_id INTEGER, deleted_at TEXT
      );
      CREATE TABLE lms_h5p_conteudos (
        id INTEGER PRIMARY KEY, empresa_id INTEGER, titulo TEXT,
        r2_key TEXT, ativo INTEGER, deleted_at TEXT
      );
      INSERT INTO lms_cursos VALUES (1, 1, 'H5P', 'lms/h5p/1/course', NULL, NULL);
      INSERT INTO lms_h5p_conteudos VALUES (10, 1, 'Mesmo', 'lms/h5p/1/course', 1, NULL);
      INSERT INTO lms_h5p_conteudos VALUES (11, 1, 'Mesmo', 'lms/h5p/1/course', 1, NULL);
    `);

    const report = runDiagnostics({ dbPath, salt: SALT });
    const ambiguous = report.categories.LMS.find(
      (item: { code: string }) => item.code === 'LMS-009',
    );
    const unique = report.categories.LMS.find(
      (item: { code: string }) => item.code === 'LMS-008',
    );

    expect(ambiguous.status).toBe('FOUND');
    expect(ambiguous.count).toBe(1);
    expect(unique.status).toBe('CLEAR');
  });

  it('is deterministic, repeatable and does not alter the SQLite file', () => {
    const { dbPath } = makeDb(`${qualificationSchema}
      INSERT INTO qualificacoes_tipos VALUES (10, NULL, 'EAD', 1, NULL);
      INSERT INTO funcionarios VALUES (20, 1, 1, NULL);
      INSERT INTO qualificacoes_historico VALUES (30,1,20,10,'A','EAD','CONCLUIDA',NULL,'2025-01-01','2026-01-01',NULL,NULL,NULL,NULL,NULL);
    `);
    const before = hashFile(dbPath);
    const first = runDiagnostics({ dbPath, salt: SALT });
    const second = runDiagnostics({ dbPath, salt: SALT });
    const after = hashFile(dbPath);

    expect(second).toEqual(first);
    expect(after).toBe(before);
  });

  it('rejects a missing salt and remote database locations', () => {
    expect(() => runDiagnostics({ dbPath: 'https://example.invalid/db', salt: SALT })).toThrow(
      /Remote database locations are forbidden/,
    );
    const { dbPath } = makeDb('CREATE TABLE sample (id INTEGER PRIMARY KEY);');
    expect(() => runDiagnostics({ dbPath, salt: 'short' })).toThrow(/salt/);
  });

  it('keeps every catalog query read-only and free of PII output columns', () => {
    for (const finding of findings) {
      expect(() => validateReadonlySql(finding.sql)).not.toThrow();
      expect(finding.sql).not.toMatch(
        /\b(?:nome|name|cpf|email|telefone|phone|endereco|address)\b/i,
      );
      expect(finding.sql).toMatch(/\btenant_id\b/);
      expect(finding.sql).toMatch(/\bevent_date\b/);
    }
  });

  it(
    'guards phase 1 scripts against database writes, destructive pragmas and remote execution',
    () => {
      const phase1Dir = path.resolve('scripts/data-reconciliation/phase1');
      const sources = fs
        .readdirSync(phase1Dir)
        .filter((name) => name.endsWith('.mjs') || name.endsWith('.sql'))
        .map((name) => fs.readFileSync(path.join(phase1Dir, name), 'utf8'))
        .join('\n');

      expect(sources).not.toMatch(/\bINSERT\s+INTO\b/i);
      expect(sources).not.toMatch(/\bUPDATE\s+[A-Za-z_][A-Za-z0-9_]*\s+SET\b/i);
      expect(sources).not.toMatch(/\bDELETE\s+FROM\b/i);
      expect(sources).not.toMatch(/\b(?:DROP|ALTER|REPLACE)\s+(?:TABLE|VIEW|INDEX|INTO)\b/i);
      expect(sources).not.toMatch(/PRAGMA\s+(?:writable_schema|journal_mode|wal_checkpoint)/i);
      expect(sources).not.toMatch(/wrangler\s+[^\n]*--remote/i);
      expect(sources).not.toMatch(/child_process|execFile|spawn\s*\(/i);
    },
  );
});
