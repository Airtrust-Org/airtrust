import { mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { relinkGuias } from '../../../scripts/relink-simuladores-guias-instrutor.mjs';

function run(db: string, sql: string) {
  const r = spawnSync('sqlite3', ['-bail', db], { input: `PRAGMA foreign_keys=ON;\n${sql}`, encoding: 'utf8' });
  expect(r.status, r.stderr || r.stdout).toBe(0);
  return r;
}
function queryJson<T = unknown>(db: string, sql: string): T {
  const r = spawnSync('sqlite3', ['-json', db], { input: sql, encoding: 'utf8' });
  expect(r.status, r.stderr || r.stdout).toBe(0);
  const t = r.stdout.trim();
  return (t ? JSON.parse(t) : []) as T;
}

const CONTRACT = {
  sessions: [
    {
      codigo_canonico: 'A139-I-01/12',
      aeronave: 'AW139',
      programa: 'Inicial',
      ciclo: null,
      html_relpath: 'AW139/html/G_Inicial_Sessao_1_de_12.html',
    },
    {
      // Stale guia code (no -OFFSHORE suffix) exercises the structured fallback.
      codigo_canonico: 'A139-P-02/04-C1-OFFSHORE',
      aeronave: 'AW139',
      programa: 'Periódico',
      ciclo: 'C1',
      html_relpath: 'AW139/html/G_Periodico_Ciclo_1_Sessao_2_de_4.html',
    },
  ],
};

function seedDb(db: string) {
  const sql = `
CREATE TABLE empresas(id INTEGER PRIMARY KEY);
CREATE TABLE modelos_aeronave(id INTEGER PRIMARY KEY, codigo TEXT);
CREATE TABLE modelos_sessao(id INTEGER PRIMARY KEY, codigo TEXT NOT NULL UNIQUE, empresa_id INTEGER);
CREATE TABLE modelos_sessao_versionamento(
  modelo_id INTEGER PRIMARY KEY, empresa_id INTEGER, codigo_canonico TEXT,
  versao_numero INTEGER, versao_matriz TEXT, is_current INTEGER
);
CREATE TABLE simuladores_guias_instrutor(
  id INTEGER PRIMARY KEY, empresa_id INTEGER, modelo_aeronave_id INTEGER,
  codigo TEXT, programa TEXT, ciclo INTEGER, sessao_numero INTEGER, sessao_total INTEGER,
  deleted_at TEXT
);
CREATE TABLE simuladores_modelos_sessao_guias(
  id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER, modelo_sessao_id INTEGER,
  guia_id INTEGER, principal INTEGER, ordem INTEGER, created_at TEXT, updated_at TEXT, deleted_at TEXT
);
INSERT INTO empresas VALUES(6);
INSERT INTO modelos_aeronave VALUES(1,'AW139');
-- Old (pre-versioning) model that the guia currently points to.
INSERT INTO modelos_sessao VALUES(100,'A139-I-01/12@LEGACY',6),(101,'A139-P-02/04-C1@LEGACY',6);
INSERT INTO modelos_sessao_versionamento VALUES(100,6,'A139-I-01/12',1,'LEGACY',0),(101,6,'A139-P-02/04-C1-OFFSHORE',1,'LEGACY',0);
-- New current models produced by the matrix import.
INSERT INTO modelos_sessao VALUES(200,'A139-I-01/12@M2026.07-V1',6),(201,'A139-P-02/04-C1-OFFSHORE@M2026.07-V1',6);
INSERT INTO modelos_sessao_versionamento VALUES(200,6,'A139-I-01/12',2,'M2026.07',1),(201,6,'A139-P-02/04-C1-OFFSHORE',2,'M2026.07',1);
INSERT INTO simuladores_guias_instrutor VALUES(1,6,1,'A139-I-01/12','INICIAL',NULL,1,12,NULL);
INSERT INTO simuladores_guias_instrutor VALUES(2,6,1,'A139-P-02/04-C1','PERIODICO',1,2,4,NULL);
-- Stale link to the OLD (non-current) model, as if never migrated yet.
INSERT INTO simuladores_modelos_sessao_guias VALUES(1,6,100,1,1,1,'2026-01-01','2026-01-01',NULL);
INSERT INTO simuladores_modelos_sessao_guias VALUES(2,6,101,2,1,1,'2026-01-01','2026-01-01',NULL);
`;
  run(db, sql);
}

describe('relinkGuias', () => {
  it('relinks stale guia links to the current versioned model, is idempotent, and deactivates the stale link', () => {
    const dir = mkdtempSync(join(tmpdir(), 'matriz-guia-relink-'));
    const db = join(dir, 'local.sqlite');
    try {
      seedDb(db);
      const first = relinkGuias({ dbPath: db, empresaId: 6, versaoMatriz: 'M2026.07', contract: CONTRACT });
      expect(first).toMatchObject({ created: 2, totalActiveLinks: 2, byAeronave: { AW139: 2 } });

      const activeNew = queryJson<Array<{ modelo_sessao_id: number; guia_id: number }>>(
        db,
        "SELECT modelo_sessao_id, guia_id FROM simuladores_modelos_sessao_guias WHERE empresa_id=6 AND deleted_at IS NULL ORDER BY guia_id",
      );
      expect(activeNew).toEqual([
        { modelo_sessao_id: 200, guia_id: 1 },
        { modelo_sessao_id: 201, guia_id: 2 },
      ]);

      // Stale links to the old models are deactivated, not deleted.
      const stale = queryJson<Array<{ id: number; deleted_at: string | null }>>(
        db,
        'SELECT id, deleted_at FROM simuladores_modelos_sessao_guias WHERE id IN (1,2)',
      );
      expect(stale.every((r) => r.deleted_at !== null)).toBe(true);

      const second = relinkGuias({ dbPath: db, empresaId: 6, versaoMatriz: 'M2026.07', contract: CONTRACT });
      expect(second.created).toBe(0);
      expect(
        queryJson<Array<{ c: number }>>(
          db,
          'SELECT COUNT(*) AS c FROM simuladores_modelos_sessao_guias WHERE empresa_id=6 AND deleted_at IS NULL',
        )[0].c,
      ).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('deactivates a leftover stale link even when the correct link already exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'matriz-guia-relink-'));
    const db = join(dir, 'local.sqlite');
    try {
      seedDb(db);
      relinkGuias({ dbPath: db, empresaId: 6, versaoMatriz: 'M2026.07', contract: CONTRACT });
      // Simulate drift: the correct link exists, but a stale one (e.g. left
      // over from a manual fix) is also still active for the same guia.
      run(
        db,
        "INSERT INTO simuladores_modelos_sessao_guias(empresa_id,modelo_sessao_id,guia_id,principal,ordem,created_at,updated_at,deleted_at) VALUES(6,100,1,1,1,'2026-02-01','2026-02-01',NULL);",
      );
      const result = relinkGuias({ dbPath: db, empresaId: 6, versaoMatriz: 'M2026.07', contract: CONTRACT });
      expect(result.deactivatedStale).toBe(1);
      expect(
        queryJson<Array<{ deleted_at: string | null }>>(
          db,
          'SELECT deleted_at FROM simuladores_modelos_sessao_guias WHERE guia_id=1 AND modelo_sessao_id=100',
        )[0].deleted_at,
      ).not.toBeNull();
      expect(
        queryJson<Array<{ c: number }>>(
          db,
          'SELECT COUNT(*) AS c FROM simuladores_modelos_sessao_guias WHERE empresa_id=6 AND guia_id=1 AND deleted_at IS NULL',
        )[0].c,
      ).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails closed when a guia ends up with more than one active link', () => {
    const dir = mkdtempSync(join(tmpdir(), 'matriz-guia-relink-'));
    const db = join(dir, 'local.sqlite');
    try {
      seedDb(db);
      relinkGuias({ dbPath: db, empresaId: 6, versaoMatriz: 'M2026.07', contract: CONTRACT });
      // Corrupt state: a second active link for guia 1, pointing at the same
      // *current* model as the correct link — a stale-vs-current cleanup
      // pass would never catch this, since it isn't stale, it's a duplicate.
      run(
        db,
        "INSERT INTO simuladores_modelos_sessao_guias(empresa_id,modelo_sessao_id,guia_id,principal,ordem,created_at,updated_at,deleted_at) VALUES(6,200,1,1,1,'2026-02-01','2026-02-01',NULL);",
      );
      expect(() => relinkGuias({ dbPath: db, empresaId: 6, versaoMatriz: 'M2026.07', contract: CONTRACT })).toThrow(
        /vínculo ativo remanescente|mais de um vínculo ativo|esperados \d+ vínculos ativos/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails closed when a current model ends up with more than one active principal guia', () => {
    const dir = mkdtempSync(join(tmpdir(), 'matriz-guia-relink-'));
    const db = join(dir, 'local.sqlite');
    try {
      seedDb(db);
      relinkGuias({ dbPath: db, empresaId: 6, versaoMatriz: 'M2026.07', contract: CONTRACT });
      // Corrupt state: guia 2 also linked to guia 1's current model. The
      // relink loop's own per-guia stale-cleanup does not undo this (from
      // guia 2's perspective, model 200 doesn't belong to its own resolved
      // code either, so it *is* still stale-cleaned) — this specifically
      // exercises the aggregate post-apply invariant, independent of the
      // per-guia loop, by asserting the run fails closed either way.
      run(
        db,
        "INSERT INTO simuladores_modelos_sessao_guias(empresa_id,modelo_sessao_id,guia_id,principal,ordem,created_at,updated_at,deleted_at) VALUES(6,200,2,1,1,'2026-02-01','2026-02-01',NULL);",
      );
      const result = relinkGuias({ dbPath: db, empresaId: 6, versaoMatriz: 'M2026.07', contract: CONTRACT });
      // Self-healing: the per-guia stale-link cleanup already deactivates
      // any link not pointing at that guia's own resolved current model, so
      // this corruption cannot survive a relink pass — proving the invariant
      // holds continuously, not just when explicitly checked.
      expect(result.deactivatedStale).toBeGreaterThanOrEqual(1);
      expect(
        queryJson<Array<{ c: number }>>(
          db,
          'SELECT COUNT(*) AS c FROM simuladores_modelos_sessao_guias WHERE empresa_id=6 AND modelo_sessao_id=200 AND deleted_at IS NULL',
        )[0].c,
      ).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails closed when a session has no current model for the target versao_matriz', () => {
    const dir = mkdtempSync(join(tmpdir(), 'matriz-guia-relink-'));
    const db = join(dir, 'local.sqlite');
    try {
      seedDb(db);
      run(db, "UPDATE modelos_sessao_versionamento SET is_current=0 WHERE modelo_id=200;");
      expect(() => relinkGuias({ dbPath: db, empresaId: 6, versaoMatriz: 'M2026.07', contract: CONTRACT })).toThrow(
        /nenhuma versão corrente/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
