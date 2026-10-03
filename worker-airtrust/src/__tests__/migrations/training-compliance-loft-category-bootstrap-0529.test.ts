import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql, querySql } from '../helpers/sqlite-batch-runner';
const ROOT=join(__dirname,'../../../..'); const read=(p:string)=>readFileSync(join(ROOT,p),'utf8');
const migrationPath='worker-airtrust/migrations/0529_training_compliance_loft_category_bootstrap.sql';
const changePath='worker-airtrust/schema-v2/changes/0529_training_compliance_loft_category_bootstrap.sql';
const planPath='worker-airtrust/schema-v2/plans/training-compliance-loft-category-bootstrap-0529.md';
const manifestPath='worker-airtrust/schema-v2/training-compliance-loft-category-bootstrap-0529.json';
const migration=read(migrationPath); const tempDirs:string[]=[]; const sha256=(v:string)=>createHash('sha256').update(v).digest('hex');
afterEach(()=>{while(tempDirs.length) rmSync(tempDirs.pop()!,{recursive:true,force:true});});
function createDatabase(loft:'absent'|'soft-deleted'|'active', category=true){
 const dir=mkdtempSync(join(tmpdir(),'airtrust-loft-0529-')); tempDirs.push(dir); const db=join(dir,'test.sqlite');
 expect(execSql(db, `
 CREATE TABLE qualificacoes_categorias(id INTEGER PRIMARY KEY,codigo TEXT,nome TEXT,ativo INTEGER,deleted_at TEXT,empresa_id INTEGER NOT NULL);
 CREATE TABLE qualificacoes_tipos(id INTEGER PRIMARY KEY AUTOINCREMENT,codigo TEXT NOT NULL COLLATE NOCASE,nome TEXT NOT NULL,descricao TEXT,categoria TEXT,categoria_id INTEGER,validade INTEGER,observacoes TEXT,ativo INTEGER DEFAULT 1,created_at TEXT,updated_at TEXT,deleted_at TEXT,empresa_id INTEGER NOT NULL);
 CREATE UNIQUE INDEX idx_qt_tenant_code_active ON qualificacoes_tipos(empresa_id,codigo COLLATE NOCASE) WHERE deleted_at IS NULL;
 CREATE TRIGGER trg_category_insert BEFORE INSERT ON qualificacoes_tipos WHEN NEW.deleted_at IS NULL BEGIN SELECT CASE WHEN NEW.categoria_id IS NULL OR NOT EXISTS(SELECT 1 FROM qualificacoes_categorias qc WHERE qc.id=NEW.categoria_id AND qc.empresa_id=NEW.empresa_id AND qc.ativo=1 AND qc.deleted_at IS NULL) THEN RAISE(ABORT,'QUALIFICATION_CATEGORY_INVALID') END; END;
 CREATE TRIGGER trg_category_update BEFORE UPDATE OF categoria_id,empresa_id,deleted_at ON qualificacoes_tipos WHEN NEW.deleted_at IS NULL BEGIN SELECT CASE WHEN NEW.categoria_id IS NULL OR NOT EXISTS(SELECT 1 FROM qualificacoes_categorias qc WHERE qc.id=NEW.categoria_id AND qc.empresa_id=NEW.empresa_id AND qc.ativo=1 AND qc.deleted_at IS NULL) THEN RAISE(ABORT,'QUALIFICATION_CATEGORY_INVALID') END; END;
 CREATE TABLE qualificacoes_historico(id INTEGER PRIMARY KEY,empresa_id INTEGER NOT NULL,qualificacao_id INTEGER,observacoes TEXT);
 CREATE TABLE treinamento_requisitos(id INTEGER PRIMARY KEY,empresa_id INTEGER NOT NULL,qualificacao_tipo_id INTEGER);
 CREATE TABLE lms_matriculas(id INTEGER PRIMARY KEY,empresa_id INTEGER NOT NULL);
 INSERT INTO qualificacoes_categorias VALUES(70,'TERICO','Teórico',1,NULL,7);
 ${category ? "INSERT INTO qualificacoes_categorias VALUES(61,'TREINAMENTO_OPERACIONAL','Treinamentos Operacionais',1,NULL,6); INSERT INTO qualificacoes_categorias VALUES(62,'TERICO','Teórico',1,NULL,6);" : ''}
 INSERT INTO qualificacoes_tipos(id,codigo,nome,categoria,categoria_id,validade,ativo,empresa_id,deleted_at) VALUES(700,'LOFT','Outro tenant LOFT','Treinamento',70,18,1,7,NULL);
 `).code).toBe(0);
 if(loft==='soft-deleted') expect(execSql(db,`INSERT INTO qualificacoes_tipos(id,codigo,nome,categoria,categoria_id,validade,ativo,empresa_id,deleted_at) VALUES(12,'LOFT','LOFT histórico','Treinamento',NULL,12,0,6,'2026-09-30'); INSERT INTO qualificacoes_historico VALUES(900,6,12,'preserve identity');`).code).toBe(0);
 if(loft==='active') expect(execSql(db,`INSERT INTO qualificacoes_tipos(id,codigo,nome,categoria,categoria_id,validade,ativo,empresa_id,deleted_at) VALUES(13,'LOFT','LOFT atual','Treinamento',62,24,1,6,NULL);`).code).toBe(0);
 return db;
}
describe('0529 category-safe LOFT bootstrap',()=>{
 it('pins hashes and mirrors canonical migration',()=>{const change=read(changePath),plan=read(planPath),manifest=JSON.parse(read(manifestPath)); expect(change).toBe(migration); expect(manifest).toMatchObject({changeId:'training-compliance-loft-category-bootstrap-0529',baselineId:'production-d1-baseline-v2-20260714',filePath:changePath,planPath}); expect(manifest.fileHash).toBe(sha256(change)); expect(manifest.planHash).toBe(sha256(plan));});
 it('creates missing LOFT under the real category trigger and prefers operational category',()=>{const db=createDatabase('absent'); expect(execSql(db,migration).code).toBe(0); expect(execSql(db,migration).code).toBe(0); expect(querySql<any>(db,`SELECT COUNT(*) total,MAX(validade) validade,MAX(categoria_id) categoria_id FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)='LOFT' AND ativo=1 AND deleted_at IS NULL;`)[0]).toEqual({total:1,validade:12,categoria_id:61});});
 it('reactivates historical identity and repairs a missing category reference',()=>{const db=createDatabase('soft-deleted'); expect(execSql(db,migration).code).toBe(0); expect(querySql<any>(db,`SELECT id,ativo,deleted_at,categoria_id FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)='LOFT' AND deleted_at IS NULL;`)[0]).toEqual({id:12,ativo:1,deleted_at:null,categoria_id:61}); expect(querySql<any>(db,`SELECT qualificacao_id FROM qualificacoes_historico WHERE id=900;`)[0].qualificacao_id).toBe(12);});
 it('preserves a valid existing category and validity',()=>{const db=createDatabase('active'); expect(execSql(db,migration).code).toBe(0); expect(querySql<any>(db,`SELECT id,validade,categoria_id FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)='LOFT' AND ativo=1 AND deleted_at IS NULL;`)[0]).toEqual({id:13,validade:24,categoria_id:62});});
 it('fails closed when neither reviewed tenant category exists',()=>{const db=createDatabase('absent',false); const result=execSql(db,migration); expect(result.code).not.toBe(0); expect(result.stderr).toContain('QUALIFICATION_CATEGORY_INVALID');});
 it('contains no evidence, enrollment, requirement or certificate writes',()=>{const n=migration.toLowerCase(); for(const f of ['insert into qualificacoes_historico','update qualificacoes_historico','delete from qualificacoes_historico','insert into treinamento_requisitos','update treinamento_requisitos','delete from treinamento_requisitos','insert into lms_matriculas','update lms_matriculas','delete from lms_matriculas','insert into certificados','delete from certificados']) expect(n).not.toContain(f);});
});
