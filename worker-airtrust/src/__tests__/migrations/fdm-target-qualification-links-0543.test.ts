import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe,it,expect } from 'vitest';

const root=join(process.cwd(),'..');
const read=(p:string)=>readFileSync(join(root,p),'utf8');
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const sqlPath='worker-airtrust/schema-v2/changes/0543_fdm_target_qualification_links.sql';
const manifestPath='worker-airtrust/schema-v2/fdm-target-qualification-links-0543.json';
const planPath='worker-airtrust/schema-v2/plans/fdm-target-qualification-links-0543.md';

describe('Governed FDM 0543 target bindings',()=>{
 it('pins reviewed SQL, plan and identical migration mirror',()=>{
  const sql=read(sqlPath),plan=read(planPath),m=JSON.parse(read(manifestPath));
  expect(read('worker-airtrust/migrations/0543_fdm_target_qualification_links.sql')).toBe(sql);
  expect(m.changeId).toBe('fdm-target-qualification-links-0543');
  expect(m.baselineId).toBe('production-d1-baseline-v2-20260714');
  expect(m.filePath).toBe(sqlPath);expect(m.fileHash).toBe(hash(sql));
  expect(m.planPath).toBe(planPath);expect(m.planHash).toBe(hash(plan));
 });
 it('updates only company 6 course 71 and 72 bindings in an isolated SQLite fixture',()=>{
  const py=`
import sqlite3,sys
sql=open(sys.argv[1]).read()
db=sqlite3.connect(':memory:')
db.executescript("""
CREATE TABLE lms_cursos (id INTEGER PRIMARY KEY,empresa_id INTEGER,ativo INTEGER,publicado INTEGER,deleted_at TEXT,tipo_conteudo TEXT,qualificacao_tipo_id INTEGER,scorm_launch_file TEXT,scorm_package_r2_prefix TEXT);
CREATE TABLE qualificacoes_tipos(id INTEGER PRIMARY KEY,empresa_id INTEGER,codigo TEXT,ativo INTEGER,deleted_at TEXT);
INSERT INTO qualificacoes_tipos VALUES(11,6,'FDM-TRIPULACAO',1,NULL),(12,6,'FDM-MECANICO',1,NULL),(13,6,'OUTRA',1,NULL),(14,7,'FDM-TRIPULACAO',1,NULL);
INSERT INTO lms_cursos VALUES(71,6,1,1,NULL,'SCORM',13,'index.html','x'),(72,6,1,1,NULL,'scorm',13,'index.html','y'),(73,6,1,1,NULL,'scorm',13,'index.html','z'),(74,7,1,1,NULL,'scorm',14,'index.html','z');
""")
db.executescript(sql)
r=dict(db.execute("SELECT id,qualificacao_tipo_id FROM lms_cursos"))
assert r=={71:11,72:12,73:13,74:14},r
db.executescript(sql)
assert dict(db.execute("SELECT id,qualificacao_tipo_id FROM lms_cursos"))==r
print('FDM_0543_SQLITE_PASS')
`;
  const result=spawnSync('python3',['-c',py,join(root,sqlPath)],{encoding:'utf8'});
  expect(result.status,result.stderr).toBe(0);
 });
 it('has fail-closed production before/after gates and no learner mutation',()=>{
  const sql=read(sqlPath),pre=read('scripts/schema-v2/validate-0543-production-preflight.sh'),
   post=read('scripts/schema-v2/validate-0543-production-postconditions.sh'),
   workflow=read('.github/workflows/apply-schema-change-v2.yml');
  expect((sql.match(/UPDATE lms_cursos/g)||[]).length).toBe(2);
  expect(sql).not.toMatch(/(?:INSERT INTO|DELETE FROM|UPDATE lms_matriculas|UPDATE qualificacoes_historico)/);
  expect(pre).toContain('destination-enrollments-absent 0');
  expect(pre).toContain('unique-qualification-targets 2');
  expect(pre).toContain('applied-0536-and-0541 2');
  expect(post).toContain('exact-matched-bindings 2');
  expect(post).toContain('no-destination-enrollments-created 0');
  expect(workflow).toContain('validate-0543-production-preflight.sh');
  expect(workflow).toContain('validate-0543-production-postconditions.sh');
  expect(workflow).toContain('fdm-target-qualification-links-0543');
 });
});
