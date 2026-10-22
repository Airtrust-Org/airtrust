import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { canUseLegacyAutomatedLmsCourse, loadVerifiedComplianceLmsEnrollments } from '../../services/training-compliance-native-lms-evidence';

const Database = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (filename: string): DatabaseSync;
};
function makeDb(withMarker = true, withHistory = true) {
  const sqlite=new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE lms_cursos(id INTEGER PRIMARY KEY,empresa_id INTEGER,qualificacao_tipo_id INTEGER,tipo_conteudo TEXT,deleted_at TEXT);
    CREATE TABLE lms_matriculas(id INTEGER PRIMARY KEY,empresa_id INTEGER,curso_id INTEGER,funcionario_id INTEGER,status TEXT,data_expiracao TEXT,qualificacao_historico_id INTEGER,deleted_at TEXT);
    INSERT INTO lms_cursos VALUES (10,1,100,'native',NULL),(11,1,100,'scorm',NULL),(12,1,100,'scorm',NULL),(20,2,100,'native',NULL);
    INSERT INTO lms_matriculas VALUES
      (1,1,10,7,'CONCLUIDO',NULL,NULL,NULL),
      (2,1,10,7,'CONCLUIDO',NULL,101,NULL),
      (3,1,10,7,'CONCLUIDO',NULL,102,NULL),
      (4,1,11,7,'CONCLUIDO',NULL,NULL,NULL),
      (5,1,12,7,'CONCLUIDO',NULL,NULL,NULL),
      (6,1,10,7,'EM_ANDAMENTO','2026-12-01',NULL,NULL),
      (7,1,10,8,'CONCLUIDO',NULL,101,NULL),
      (8,1,10,7,'CONCLUIDO',NULL,103,NULL),
      (20,2,20,7,'CONCLUIDO',NULL,101,NULL);
  `);
  if(withMarker)sqlite.exec(`
    CREATE TABLE lms_native_catalog_activation(empresa_id INTEGER,curso_id INTEGER);
    INSERT INTO lms_native_catalog_activation VALUES(1,11);
  `);
  if(withHistory)sqlite.exec(`
    CREATE TABLE qualificacoes_historico(id INTEGER PRIMARY KEY,empresa_id INTEGER,funcionario_id INTEGER,qualificacao_id INTEGER,status TEXT,deleted_at TEXT);
    INSERT INTO qualificacoes_historico VALUES
      (101,1,7,100,'CONCLUIDA',NULL),
      (102,1,7,100,'PLANEJADA',NULL),
      (103,2,7,100,'CONCLUIDA',NULL);
  `);
  const db={
    prepare(sql:string) {
      return {bind(...params:unknown[]){
        const q=sqlite.prepare(sql),values=params as (number|string|null)[];
        return {
          first:async()=>q.get(...values),
          all:async()=>({results:q.all(...values)}),
        };
      }};
    },
  } as unknown as D1Database;
  return {sqlite,db};
}
describe('legacy automatic enrollment eligibility is a D1 tenant-owned decision',()=>{
  it('blocks physically Native, marker-activated SCORM and cross-tenant courses', async()=>{
    const {sqlite,db}=makeDb(true);
    expect(await canUseLegacyAutomatedLmsCourse(db,1,10)).toBe(false);
    expect(await canUseLegacyAutomatedLmsCourse(db,1,11)).toBe(false);
    expect(await canUseLegacyAutomatedLmsCourse(db,1,12)).toBe(true);
    expect(await canUseLegacyAutomatedLmsCourse(db,1,20)).toBe(false);
    expect(await canUseLegacyAutomatedLmsCourse(db,1,-1)).toBe(false);
    sqlite.close();
  });
  it('preserves ordinary SCORM without activation table',async()=>{
    const {sqlite,db}=makeDb(false);
    expect(await canUseLegacyAutomatedLmsCourse(db,1,10)).toBe(false);
    expect(await canUseLegacyAutomatedLmsCourse(db,1,11)).toBe(true);
    sqlite.close();
  });
});
describe('both legacy Compliance LMS readers refuse forged Native completion',()=>{
  it('keeps valid Native qualification and external SCORM while denying forged Native statuses',async()=>{
    const {sqlite,db}=makeDb();
    const rows=await loadVerifiedComplianceLmsEnrollments(db,1,[7]);
    expect(rows.map(x=>x.curso_id)).toEqual([10,12,10]);
    expect(rows.map(x=>x.status)).toEqual(['CONCLUIDO','CONCLUIDO','EM_ANDAMENTO']);
    sqlite.close();
  });
  it('also denies marked physical SCORM with the Native UI flag absent',async()=>{
    const {sqlite,db}=makeDb();
    expect((await loadVerifiedComplianceLmsEnrollments(db,1,[7])).some(x=>x.curso_id===11)).toBe(false);
    sqlite.close();
  });
  it('denies Native completion if the qualification history schema is absent',async()=>{
    const {sqlite,db}=makeDb(true,false);
    expect((await loadVerifiedComplianceLmsEnrollments(db,1,[7]))
      .filter(x=>x.status==='CONCLUIDO').map(x=>x.curso_id)).toEqual([12]);
    sqlite.close();
  });
  it('preserves legacy SCORM if the marker table is absent',async()=>{
    const {sqlite,db}=makeDb(false);
    expect((await loadVerifiedComplianceLmsEnrollments(db,1,[7]))
      .filter(x=>x.status==='CONCLUIDO').map(x=>x.curso_id)).toEqual([10,11,12]);
    sqlite.close();
  });
  it('prevents tenant crossovers and unscoped employees',async()=>{
    const {sqlite,db}=makeDb();
    expect(await loadVerifiedComplianceLmsEnrollments(db,1,[8])).toEqual([]);
    expect(await loadVerifiedComplianceLmsEnrollments(db,2,[7])).toEqual([]);
    await expect(loadVerifiedComplianceLmsEnrollments(db,0,[7])).rejects.toThrow();
    await expect(loadVerifiedComplianceLmsEnrollments(db,1,[-1])).rejects.toThrow();
    sqlite.close();
  });
  it('wires both route consumers, without their own raw LMS completion queries',()=>{
    const source=readFileSync(resolve(process.cwd(),'src/routes/compliance.ts'),'utf8');
    const i=source.indexOf("app.get('/funcionarios/:id/compliance'");
    const b=source.indexOf("app.get('/compliance/funcionarios'");
    expect(source.slice(i,b)).toContain('loadVerifiedComplianceLmsEnrollments(');
    expect(source.slice(b)).toContain('loadVerifiedComplianceLmsEnrollments(');
    expect(source.slice(i)).not.toContain('FROM lms_matriculas');
  });
});
