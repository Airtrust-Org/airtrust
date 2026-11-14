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
const sqlPath = 'worker-airtrust/schema-v2/changes/0584_avsec_competency_models.sql';
const planPath = 'worker-airtrust/schema-v2/plans/avsec-competency-models-0584.md';

describe('AVSEC Tripulantes only 0584', () => {
  it('pins SQL, plan, baseline and production guards', () => {
    const manifest = JSON.parse(read('worker-airtrust/schema-v2/avsec-competency-models-0584.json'));
    expect(manifest).toMatchObject({
      changeId: 'avsec-competency-models-0584',
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: sqlPath,
      planPath,
      fileHash: hash(read(sqlPath)),
      planHash: hash(read(planPath)),
    });
    const sql = read(sqlPath);
    expect(sql).toContain('DELETE FROM qualificacoes_historico');
    expect(sql).not.toMatch(/DELETE FROM notificacoes_log|DROP TABLE|UPDATE\s+qualificacoes_historico/);
    expect(sql).not.toMatch(/INSERT INTO qualificacoes_tipos/);
    expect(read('.github/workflows/apply-schema-change-v2.yml')).toContain('Preflight AVSEC competency models 0584');
    expect(read('.github/workflows/apply-schema-change-v2.yml')).toContain('Post-validate AVSEC competency models 0584');
    // The Worker may be at a reviewed, CI-green ancestor of the latest main:
    // the schema guard must check exact deployed Worker SHA, ancestor and eight gates.
    const workflow = read('.github/workflows/apply-schema-change-v2.yml');
    const preflight = workflow.split('      - name: Preflight AVSEC competency models 0584')[1]?.split('      - name:')[0];
    expect(preflight).toContain('EXPECTED_WORKER_SHA: feff1daa3b640163594b2920fd8ae8fa077dd4f1');
    expect(preflight).toContain('git merge-base --is-ancestor "$EXPECTED_WORKER_SHA" "$GITHUB_SHA"');
    expect(preflight).toContain('node scripts/ci/verify-release-gates.mjs');
    expect(preflight).not.toContain('EXPECTED_WORKER_SHA: ${{ github.sha }}');
    expect(read('scripts/schema-v2/validate-0584-production-preflight.sh')).toContain('AVSEC_0584_WORKER_SHA_MISMATCH');
    expect(read('scripts/schema-v2/validate-0584-production-postconditions.sh')).toContain('corporate-history-erased');
  });

  it('preserves all 31 D1 records, removes sole corporate evidence, detaches log and isolates tenant 7', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        PRAGMA foreign_keys=ON;
        CREATE TABLE qualificacoes_tipos (
          id INTEGER PRIMARY KEY,empresa_id INTEGER,codigo TEXT,nome TEXT,validade INTEGER,
          ativo INTEGER,deleted_at TEXT,updated_at TEXT
        );
        CREATE TABLE qualificacoes_historico (
          id INTEGER PRIMARY KEY,empresa_id INTEGER,funcionario_id INTEGER,
          qualificacao_id INTEGER REFERENCES qualificacoes_tipos(id),
          qualificacao_codigo TEXT,perfil_competencia TEXT,status TEXT,data_conclusao TEXT,
          data_vencimento TEXT,deleted_at TEXT
        );
        CREATE TABLE notificacoes_log (
          id INTEGER PRIMARY KEY,empresa_id INTEGER,qualificacao_historico_id INTEGER
          REFERENCES qualificacoes_historico(id),updated_at TEXT
        );
        CREATE TABLE treinamento_requisitos (
          id INTEGER PRIMARY KEY,empresa_id INTEGER,qualificacao_tipo_id INTEGER REFERENCES qualificacoes_tipos(id),
          obrigatoriedade TEXT,ativo INTEGER,deleted_at TEXT,updated_at TEXT
        );
        INSERT INTO qualificacoes_tipos VALUES
        (22,6,'D1','AVSEC',24,1,NULL,'old'),
        (194,6,'AVSEC_CONSC','AVSEC — Conscientização Corporativa',24,1,NULL,'old'),
        (222,7,'D1','AVSEC',24,1,NULL,'old');
        INSERT INTO treinamento_requisitos VALUES
        (486,6,22,'OBRIGATORIA',1,NULL,'old'),(487,6,22,'OBRIGATORIA',1,NULL,'old'),
        (488,6,22,'OBRIGATORIA',1,NULL,'old'),(489,6,22,'OBRIGATORIA',1,NULL,'old'),
        (490,6,22,'OBRIGATORIA',1,NULL,'old'),(538,6,194,'OBRIGATORIA',1,NULL,'old'),
        (671,6,194,'NAO_APLICA',1,NULL,'old'),(700,7,222,'OBRIGATORIA',1,NULL,'old');
      `);
      for (let i=0;i<31;i++)
        db.prepare('INSERT INTO qualificacoes_historico VALUES (?,6,?,22,?,?,?,?,?,NULL)')
          .run(1000+i,100+i%27,'D1','AVSEC_TRIPULANTE','CONCLUIDO','2025-01-01','2027-01-01');
      db.exec(`
        INSERT INTO qualificacoes_historico VALUES
        (5276,6,111,194,'AVSEC_CONSC',NULL,'CONCLUIDO','2024-02-19','2026-02-19',NULL),
        (9001,7,111,222,'D1',NULL,'CONCLUIDO','2024-01-01','2026-01-01',NULL);
        INSERT INTO notificacoes_log VALUES (1,6,5276,'old');
      `);
      const before = db.prepare('SELECT * FROM qualificacoes_historico WHERE qualificacao_id=22 ORDER BY id').all();
      db.exec(read(sqlPath));
      expect(db.prepare('SELECT * FROM qualificacoes_historico WHERE qualificacao_id=22 ORDER BY id').all()).toEqual(before);
      expect(db.prepare('SELECT COUNT(*) n FROM qualificacoes_historico WHERE id=5276').get()).toEqual({n:0});
      expect(db.prepare('SELECT qualificacao_historico_id FROM notificacoes_log WHERE id=1').get())
        .toEqual({qualificacao_historico_id:null});
      expect(db.prepare('SELECT nome,ativo FROM qualificacoes_tipos WHERE id=22').get()).toEqual({
        nome:'AVSEC — Tripulantes',ativo:1,
      });
      expect(db.prepare('SELECT ativo FROM qualificacoes_tipos WHERE id=194').get()).toEqual({ativo:0});
      expect(db.prepare('SELECT nome FROM qualificacoes_tipos WHERE id=222').get()).toEqual({nome:'AVSEC'});
      expect(db.prepare('SELECT COUNT(*) n FROM treinamento_requisitos WHERE ativo=1 AND empresa_id=6').get())
        .toEqual({n:2});
      expect(db.prepare('SELECT COUNT(*) n FROM treinamento_requisitos WHERE ativo=1 AND empresa_id=7').get())
        .toEqual({n:1});
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally { db.close(); }
  });
});
