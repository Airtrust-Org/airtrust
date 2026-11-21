/**
 * source_reference: docs/frms/BOA_SOURCE_QA_PREFLIGHT_20261022.md
 * operational_decision: exercise only fictitious BOA QA crosswalk cases
 *   against tenant-isolated native SQLite, never an authorized operational import.
 * dry_run_required: yes; every INSERT/UPDATE in this test targets :memory: only.
 * rollback_plan_required: sqlite.close() discards the transient test database;
 *   no Cloudflare D1/R2 data or credentials are accessed.
 */
/**
 * BOA crosswalk/tenant integrity against native SQLite :memory:.
 * Purely fictitious; no remote staging, D1/R2 or real employee records.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Module from 'node:module';
const require=createRequire(import.meta.url);
const esbuild=require('esbuild');
const root=fileURLToPath(new URL('../..',import.meta.url));
const output=esbuild.buildSync({
 entryPoints:[join(root,'worker-airtrust/src/lib/frms/bombeiros-qa-crosswalk.ts')],
 bundle:true,platform:'node',format:'cjs',write:false,
}).outputFiles[0].text;
const filename='/tmp/boa-qa-crosswalk-integrity.cjs';
const mod=new Module(filename);mod.filename=filename;mod.paths=Module._nodeModulePaths(dirname(filename));
mod._compile(output,filename);
const {checkBoaQaCrosswalk}=mod.exports;
const source=()=>({
 schema:'BOA_OPERATIONAL_SOURCE_BATCH_V1',
 source:{source_system_id:'BOA-QA-SYNTHETIC',dataset_id:'qa-batch-1',
 export_id:'qa-export-1',export_revision:'qa-rev-1',
 exported_at:'2026-10-22T09:00:00-03:00',source_document_reference:'qa-document-1'},
 records:[{external_duty_id:'qa-duty-1',external_crew_id:'qa-crew-1',
 external_sector_id:'qa-sector-9',external_base_id:'qa-base-1',
 external_mission_id:null,source_record_revision:'qa-record-1',
 source_record_updated_at:'2026-10-22T08:00:00-03:00',
 planned:null,actual:{start_at:'2026-10-21T20:00:00-03:00',
 end_at:'2026-10-22T02:00:00-03:00'},
 standby_state:'UNKNOWN',standby:null,activation_state:'UNKNOWN',activations:[]}]
});
const mapping=()=>({
 schema:'BOA_QA_SYNTHETIC_CROSSWALK_V1',
 source_system_id:'BOA-QA-SYNTHETIC',
 mappings:[{external_crew_id:'qa-crew-1',external_sector_id:'qa-sector-9',
 funcionario_id:21,setor_id:9}],
});
function fixture() {
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(`CREATE TABLE funcionarios(id INTEGER PRIMARY KEY,empresa_id INTEGER,
 setor_id INTEGER,ativo INTEGER,deleted_at TEXT,status TEXT);
 CREATE TABLE setores(id INTEGER,empresa_id INTEGER,ativo INTEGER,deleted_at TEXT);
 INSERT INTO setores VALUES(9,130,1,NULL),(10,130,1,NULL),(9,6,1,NULL);
 INSERT INTO funcionarios VALUES(21,130,9,1,NULL,'ATIVO'),(22,130,10,1,NULL,'ATIVO'),
 (6,6,9,1,NULL,'ATIVO');`);
 const queries=[];
 const db={prepare(sql){queries.push(sql);const st=sqlite.prepare(sql);
 return {bind(...params){return{async all(){return{results:st.all(...params)}}}}};}};
 return {sqlite,db,queries};
}
test('read-only QA match returns only counts and unapproved status',async()=>{
 const {sqlite,db,queries}=fixture();
 try{
 const result=await checkBoaQaCrosswalk(db,130,source(),mapping());
 assert.deepEqual(result,{
 status:'QA_CROSSWALK_STRUCTURALLY_MATCHED_SOURCE_UNVERIFIED',
 mapped_crew_count:1,mapped_duty_count:1,
 tenant_identity_link:'QA_CANDIDATE_ONLY_NOT_APPROVED',
 source_approval:'NOT_EVALUATED',personal_data_returned:false,
 persisted:false,scientific_risk_score:null,dispatch_permission:'NOT_GRANTED'});
 assert.equal(queries.length,1);
 assert.match(queries[0],/f.empresa_id=\?/);
 assert.match(queries[0],/s.empresa_id=\?/);
 assert.doesNotMatch(JSON.stringify(result),/funcionario_id|qa-crew-1|setor_id/);
 }finally{sqlite.close();}
});
test('cross-tenant, revoked employee/sector and mismatched mapping fail closed',async()=>{
 const {sqlite,db}=fixture();
 try{
 await assert.rejects(()=>checkBoaQaCrosswalk(db,6,source(),mapping()),/TENANT_REQUIRED/);
 const other=mapping();other.mappings[0].funcionario_id=6;
 await assert.rejects(()=>checkBoaQaCrosswalk(db,130,source(),other),/CANONICAL_MISMATCH/);
 const wrong=mapping();wrong.mappings[0].setor_id=10;
 await assert.rejects(()=>checkBoaQaCrosswalk(db,130,source(),wrong),/CANONICAL_MISMATCH/);
 sqlite.exec('UPDATE funcionarios SET ativo=0 WHERE id=21');
 await assert.rejects(()=>checkBoaQaCrosswalk(db,130,source(),mapping()),/CANONICAL_MISMATCH/);
 sqlite.exec('UPDATE funcionarios SET ativo=1 WHERE id=21');
 sqlite.exec('UPDATE setores SET ativo=0 WHERE empresa_id=130 AND id=9');
 await assert.rejects(()=>checkBoaQaCrosswalk(db,130,source(),mapping()),/CANONICAL_MISMATCH/);
 }finally{sqlite.close();}
});
test('source crew mismatch, duplicate mapping and non-QA source rejected without DB access',async()=>{
 const {sqlite,db,queries}=fixture();
 try{
 const mismatch=mapping();mismatch.mappings[0].external_sector_id='qa-sector-10';
 await assert.rejects(()=>checkBoaQaCrosswalk(db,130,source(),mismatch),/SOURCE_UNMAPPED/);
 const duplicate=mapping();duplicate.mappings.push({...duplicate.mappings[0],
 external_crew_id:'qa-crew-2'});
 await assert.rejects(()=>checkBoaQaCrosswalk(db,130,source(),duplicate),/DUPLICATE_IDENTITY/);
 const real=source();real.source.source_system_id='BOA-REAL-NOT-AUTHORIZED';
 await assert.rejects(()=>checkBoaQaCrosswalk(db,130,real,mapping()),/SYNTHETIC_ONLY/);
 assert.equal(queries.length,0);
 }finally{sqlite.close();}
});
