import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(process.cwd(), '..');
const file = (p: string) => readFileSync(join(root, p), 'utf8');
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const sqlPath = 'worker-airtrust/schema-v2/changes/0544_avsec_corporativo_historico.sql';
const mirror = 'worker-airtrust/migrations/0544_avsec_corporativo_historico.sql';
const planPath = 'worker-airtrust/schema-v2/plans/avsec-corporativo-historico-0544.md';
const manifestPath = 'worker-airtrust/schema-v2/avsec-corporativo-historico-0544.json';

describe('Schema V2 AVSEC corporativo historico 0544', () => {
  it('mantem SQL/plano revisados, hash, baseline e migration mirror identicos', () => {
    const sql = file(sqlPath);
    const plan = file(planPath);
    const manifest = JSON.parse(file(manifestPath));
    expect(file(mirror)).toBe(sql);
    expect(manifest.changeId).toBe('avsec-corporativo-historico-0544');
    expect(manifest.baselineId).toBe('production-d1-baseline-v2-20260714');
    expect(manifest.filePath).toBe(sqlPath);
    expect(manifest.fileHash).toBe(hash(sql));
    expect(manifest.planPath).toBe(planPath);
    expect(manifest.planHash).toBe(hash(plan));
  });

  it('altera somente um historico e conserva datas, status e evidencia em SQLite isolado', () => {
    const program = `
import sqlite3,sys
sql=open(sys.argv[1]).read()
db=sqlite3.connect(':memory:')
db.executescript("""
CREATE TABLE qualificacoes_tipos(id INTEGER PRIMARY KEY,empresa_id INTEGER,codigo TEXT,ativo INTEGER,deleted_at TEXT);
CREATE TABLE qualificacoes_historico(
 id INTEGER PRIMARY KEY,empresa_id INTEGER,funcionario_id INTEGER,qualificacao_id INTEGER,
 qualificacao_codigo TEXT,perfil_competencia TEXT,status TEXT,data_conclusao TEXT,
 data_vencimento TEXT,observacoes TEXT,updated_at TEXT,deleted_at TEXT
);
CREATE TABLE qualificacoes_historico_perfis_competencia(empresa_id INTEGER,historico_id INTEGER,deleted_at TEXT);
INSERT INTO qualificacoes_tipos VALUES (22,6,'D1',1,NULL),(194,6,'AVSEC_CONSC',1,NULL),(222,7,'D1',1,NULL),(294,7,'AVSEC_CONSC',1,NULL);
INSERT INTO qualificacoes_historico VALUES
 (5276,6,111,22,'D1',NULL,'CONCLUIDO','2024-02-19','2026-02-19','AVSEC Zurich — Certificado Zurich Airport Brasil - Conscientizacao AVSEC.pdf','old',NULL),
 (5277,6,120,22,'D1','AVSEC_TRIPULANTE','CONCLUIDO','2024-06-01','2026-06-01','tripulante','old',NULL),
 (6276,7,111,222,'D1',NULL,'CONCLUIDO','2024-02-19','2026-02-19','Conscientizacao AVSEC.pdf','old',NULL);
""")
before={r[0]:r for r in db.execute("SELECT * FROM qualificacoes_historico")}
db.executescript(sql)
after={r[0]:r for r in db.execute("SELECT * FROM qualificacoes_historico")}
assert after[5276][3:5]==(194,'AVSEC_CONSC'),after[5276]
assert after[5276][0:3]==before[5276][0:3],after[5276]
assert after[5276][5:10]==before[5276][5:10],after[5276]
assert after[5277]==before[5277],(before[5277],after[5277])
assert after[6276]==before[6276],(before[6276],after[6276])
db.executescript(sql)
assert {r[0]:r for r in db.execute("SELECT * FROM qualificacoes_historico")}==after
print('AVSEC_0544_SQLITE_PASS')
`;
    const output = spawnSync('python3', ['-c', program, join(root, sqlPath)], { encoding: 'utf8' });
    expect(output.status, output.stderr).toBe(0);
    expect(output.stdout).toContain('AVSEC_0544_SQLITE_PASS');
  });

  it('registra validadores live fail-closed antes/depois de um unico write governado', () => {
    const workflow = file('.github/workflows/apply-schema-change-v2.yml');
    const pre = file('scripts/schema-v2/validate-0544-production-preflight.sh');
    const post = file('scripts/schema-v2/validate-0544-production-postconditions.sh');
    const sql = file(sqlPath);
    expect(workflow).toContain('Preflight AVSEC corporate historical reclassification 0544');
    expect(workflow).toContain('Post-validate AVSEC corporate historical reclassification 0544');
    expect(workflow).toContain("inputs.change_id == 'avsec-corporativo-historico-0544'");
    expect(pre).toContain('exact-original-evidence');
    expect(pre).toContain('no-existing-corporate-evidence');
    expect(pre).toContain('no-related-profile');
    expect(post).toContain('exact-corporate-reclassification');
    expect(post).toContain('ledger-0544');
    expect((sql.match(/UPDATE qualificacoes_historico\\nSET /g) || []).length).toBe(1);
    expect(sql).not.toMatch(/(?:INSERT INTO|DELETE FROM|DROP TABLE|UPDATE funcionarios|UPDATE lms_matriculas)/);
    expect(sql).toContain('WHERE id=5276 AND empresa_id=6 AND funcionario_id=111');
  });
});
