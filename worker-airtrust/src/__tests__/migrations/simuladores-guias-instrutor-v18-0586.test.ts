import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';

const DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (path: string): DatabaseSyncType;
};
const root = join(process.cwd(), '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const hash = (s: string) => createHash('sha256').update(s).digest('hex');

const changeId = 'simuladores-guias-instrutor-v18-0586';
const sqlPath = 'worker-airtrust/schema-v2/changes/0586_simuladores_guias_instrutor_v18.sql';
const planPath = 'worker-airtrust/schema-v2/plans/simuladores-guias-instrutor-v18-0586.md';

function bootstrapLegacyTables(db: DatabaseSyncType) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE empresas (id INTEGER PRIMARY KEY, nome TEXT NOT NULL);
    CREATE TABLE modelos_aeronave (id INTEGER PRIMARY KEY, nome TEXT NOT NULL, codigo TEXT NOT NULL);
    CREATE TABLE modelos_sessao (id INTEGER PRIMARY KEY, codigo TEXT NOT NULL, nome TEXT NOT NULL);

    INSERT INTO empresas VALUES (6, 'Costa do Sol'), (7, 'Outro Tenant');
    INSERT INTO modelos_aeronave VALUES (5, 'AW139', 'AW139'), (6, 'SK76', 'SK76');
    INSERT INTO modelos_sessao VALUES
      (100, 'LEGACY-A139-I1', 'Sessao Legada 1'),
      (201, 'V18-A139-T1', 'Transicao V18 1'),
      (202, 'V18-INST-E01', 'Instrutor E01');

    CREATE TABLE simuladores_guias_instrutor (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      modelo_aeronave_id INTEGER NOT NULL REFERENCES modelos_aeronave(id),
      programa TEXT NOT NULL CHECK(programa IN ('INICIAL', 'PERIODICO', 'SEMESTRAL', 'CHECK')),
      ciclo INTEGER,
      sessao_numero INTEGER,
      sessao_total INTEGER,
      codigo TEXT NOT NULL,
      titulo TEXT NOT NULL,
      descricao TEXT,
      versao TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'RASCUNHO',
      html_r2_key TEXT,
      html_nome TEXT,
      html_mime_type TEXT,
      html_tamanho_bytes INTEGER,
      html_sha256 TEXT,
      html_status_validacao TEXT NOT NULL DEFAULT 'NAO_DISPONIVEL',
      pdf_r2_key TEXT,
      pdf_nome TEXT,
      pdf_mime_type TEXT,
      pdf_tamanho_bytes INTEGER,
      pdf_sha256 TEXT,
      substituido_por_id INTEGER REFERENCES simuladores_guias_instrutor(id),
      publicado_em TEXT,
      created_by INTEGER NOT NULL,
      updated_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE TABLE simuladores_modelos_sessao_guias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      modelo_sessao_id INTEGER NOT NULL REFERENCES modelos_sessao(id),
      guia_id INTEGER NOT NULL REFERENCES simuladores_guias_instrutor(id) ON DELETE CASCADE,
      principal INTEGER NOT NULL DEFAULT 1,
      ordem INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE TABLE simuladores_guias_instrutor_auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      guia_id INTEGER NOT NULL REFERENCES simuladores_guias_instrutor(id) ON DELETE CASCADE,
      usuario_id INTEGER NOT NULL,
      acao TEXT NOT NULL,
      valores_anteriores TEXT,
      valores_novos TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Note id=10 superseded by id=20 (forward self-FK to test ordering)
    INSERT INTO simuladores_guias_instrutor (
      id, empresa_id, modelo_aeronave_id, programa, ciclo, sessao_numero, sessao_total,
      codigo, titulo, versao, status, substituido_por_id, created_by
    ) VALUES
      (10, 6, 5, 'INICIAL', NULL, 1, 12, 'A139-I-01/12', 'Inicial 01', '1.0', 'SUBSTITUIDO', 20, 1),
      (20, 6, 5, 'INICIAL', NULL, 1, 12, 'A139-I-01/12', 'Inicial 01', '2.0', 'ATIVO', NULL, 1);

    INSERT INTO simuladores_modelos_sessao_guias (id, empresa_id, modelo_sessao_id, guia_id, principal, ordem)
    VALUES (51, 6, 100, 20, 1, 1);

    INSERT INTO simuladores_guias_instrutor_auditoria (id, empresa_id, guia_id, usuario_id, acao)
    VALUES (99, 6, 20, 1, 'ATIVACAO');
  `);
}

describe('Schema V2 0586 — simuladores_guias_instrutor_v2', () => {
  it('tem manifesto revisado e registro consistente no contrato production-d1-baseline-v2.json', () => {
    const manifest = JSON.parse(read(`worker-airtrust/schema-v2/${changeId}.json`));
    const sql = read(sqlPath);
    const plan = read(planPath);

    expect(manifest).toMatchObject({
      changeId,
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: sqlPath,
      planPath,
      fileHash: hash(sql),
      planHash: hash(plan),
    });

    const sqlNoComments = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n\r]*/g, '');
    expect(sqlNoComments).not.toMatch(/DROP\s+TABLE|ALTER\s+TABLE\s+.+\s+RENAME\s+TO/i);

    const contract = JSON.parse(read('docs/database/schema-contracts/production-d1-baseline-v2.json'));
    const entry = contract.schema_v2_since_baseline.find(
      (c: { change_id?: string; change_file: string }) =>
        c.change_id === changeId || c.change_file === '0586_simuladores_guias_instrutor_v18.sql',
    );
    expect(entry).toMatchObject({
      sha256: hash(sql),
      targets: [
        'simuladores_guias_instrutor_v2',
        'simuladores_modelos_sessao_guias_v2',
        'simuladores_guias_instrutor_auditoria_v2',
      ],
      coverage: 'OUT_OF_CONTRACT_SCOPE',
      governance_state: 'REMOTE_APPLY_PENDING',
      reviewed_manifest: `${changeId}.json`,
    });
  });

  it('copia dados existentes de forma idempotente preservando IDs, self-FKs e tabelas originais intactas', () => {
    const db = new DatabaseSync(':memory:');
    try {
      bootstrapLegacyTables(db);
      const migrationSql = read(sqlPath);

      // Apply twice to guarantee idempotency
      db.exec(migrationSql);
      db.exec(migrationSql);

      const guiasV2 = db
        .prepare('SELECT id, codigo, versao, status, substituido_por_id FROM simuladores_guias_instrutor_v2 ORDER BY id')
        .all() as Array<{ id: number; substituido_por_id: number | null; status: string }>;
      expect(guiasV2).toHaveLength(2);
      expect(guiasV2[0]).toMatchObject({ id: 10, status: 'SUBSTITUIDO', substituido_por_id: 20 });
      expect(guiasV2[1]).toMatchObject({ id: 20, status: 'ATIVO', substituido_por_id: null });

      const linksV2 = db
        .prepare('SELECT id, modelo_sessao_id, guia_id FROM simuladores_modelos_sessao_guias_v2')
        .all();
      expect(linksV2).toEqual([{ id: 51, modelo_sessao_id: 100, guia_id: 20 }]);

      const auditV2 = db
        .prepare('SELECT id, guia_id, acao FROM simuladores_guias_instrutor_auditoria_v2')
        .all();
      expect(auditV2).toEqual([{ id: 99, guia_id: 20, acao: 'ATIVACAO' }]);

      // Legacy tables remain completely intact
      const legacyCount = db.prepare('SELECT COUNT(*) AS n FROM simuladores_guias_instrutor').get() as { n: number };
      expect(legacyCount.n).toBe(2);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('suporta todos os 10 programas V18 e exige modelo_aeronave_id apenas fora de INSTRUTOR/EXAMINADOR', () => {
    const db = new DatabaseSync(':memory:');
    try {
      bootstrapLegacyTables(db);
      db.exec(read(sqlPath));

      for (const prog of ['INICIAL', 'TRANSICAO', 'PERIODICO', 'SEMESTRAL', 'REQUALIFICACAO', 'RECENTE', 'NOTURNO', 'CHECK']) {
        db.prepare(
          `INSERT INTO simuladores_guias_instrutor_v2
             (empresa_id, modelo_aeronave_id, programa, codigo, titulo, versao, status, created_by)
           VALUES (6, 5, ?, ?, ?, '1.0', 'RASCUNHO', 1)`,
        ).run(prog, `A139-${prog}`, `Titulo ${prog}`);

        // Negative: aircraft program with NULL modelo_aeronave_id must fail CHECK constraint
        expect(() =>
          db
            .prepare(
              `INSERT INTO simuladores_guias_instrutor_v2
                 (empresa_id, modelo_aeronave_id, programa, codigo, titulo, versao, status, created_by)
               VALUES (6, NULL, ?, ?, ?, '1.0', 'RASCUNHO', 1)`,
            )
            .run(prog, `BAD-${prog}`, 'Should fail'),
        ).toThrow();
      }

      // Functional guides with NULL modelo_aeronave_id succeed and enforce unique active index
      db.prepare(
        `INSERT INTO simuladores_guias_instrutor_v2
           (empresa_id, modelo_aeronave_id, programa, sessao_numero, sessao_total, codigo, titulo, versao, status, created_by)
         VALUES (6, NULL, 'INSTRUTOR', 1, 2, 'INST-E01/E02', 'Instrutor E01', '1.0', 'ATIVO', 1)`,
      ).run();

      db.prepare(
        `INSERT INTO simuladores_guias_instrutor_v2
           (empresa_id, modelo_aeronave_id, programa, sessao_numero, sessao_total, codigo, titulo, versao, status, created_by)
         VALUES (6, NULL, 'EXAMINADOR', 1, 4, 'EXA-01/04', 'Examinador 01', '1.0', 'ATIVO', 1)`,
      ).run();

      // Negative: duplicate ATIVO functional guide must violate partial unique index
      expect(() =>
        db
          .prepare(
            `INSERT INTO simuladores_guias_instrutor_v2
               (empresa_id, modelo_aeronave_id, programa, sessao_numero, sessao_total, codigo, titulo, versao, status, created_by)
             VALUES (6, NULL, 'INSTRUTOR', 1, 2, 'INST-E01/E02', 'Duplicado', '2.0', 'ATIVO', 1)`,
          )
          .run(),
      ).toThrow();
    } finally {
      db.close();
    }
  });
});
