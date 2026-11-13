// source_reference: tenant-6 D1 SELECT proof of nine A139-* active models lacking aircraft metadata; PTO Rev.10 V18, issue #2232.
// operational_decision: adversarial SQLite-only tests of nine-row AW139 metadata update; no production activity.
// dry_run_required: all nine IDs/codes, eighteen links each, tenant and S76 isolation before any change.
// rollback_plan_required: no persistent fixtures; production requires D1 recovery checkpoint and reviewed exact-state hash.
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync,rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {PAIRS,assertPtoAw139MetadataState,buildPtoAw139MetadataUpdateSql} from '../production/lib/pto-aw139-aircraft-metadata.mjs';

const sqliteAvailable=spawnSync('sqlite3',['-version']).status===0;
function snapshot(){
  return {rows:PAIRS.map(([id,codigo])=>({
    id,codigo,empresa_id:6,ativo:1,deleted_at:null,modelo_aeronave:null,
  })),links:PAIRS.map(([id])=>({id,n:18,s76:0,cross_tenant:0,orphan:0}))};
}
test('nine exact tenant-bound AW139 models and links are required',()=>{
  assert.equal(assertPtoAw139MetadataState(snapshot(),'before'),true);
  const changed=snapshot();changed.rows[0].codigo='S76-I-01/12';
  assert.throws(()=>assertPtoAw139MetadataState(changed,'before'),/MODEL_ID_CODE_DRIFT/);
  const cross=snapshot();cross.links[0].cross_tenant=1;
  assert.throws(()=>assertPtoAw139MetadataState(cross,'before'),/MODEL_LINKS_NOT_SAFE/);
  const missing=snapshot();missing.links[0].n=17;
  assert.throws(()=>assertPtoAw139MetadataState(missing,'before'),/MODEL_LINKS_NOT_SAFE/);
});
function exercise(defect=''){
  const dir=mkdtempSync(path.join(os.tmpdir(),'pto-aw139-'));
  const db=path.join(dir,'local.db');
  try{
    let sql=`
      CREATE TABLE modelos_sessao(id INTEGER,empresa_id INTEGER,codigo TEXT,ativo INTEGER,deleted_at TEXT,modelo_aeronave TEXT,updated_at TEXT);
      CREATE TABLE manobras(id INTEGER,empresa_id INTEGER,tipo_aeronave TEXT);
      CREATE TABLE modelos_sessao_manobras(id INTEGER,modelo_id INTEGER,manobra_id INTEGER,deleted_at TEXT);
      INSERT INTO modelos_sessao VALUES(154,6,'EXA-CHECK',1,NULL,NULL,NULL);
    `;
    for(const [id,code] of PAIRS){
      sql+=`INSERT INTO modelos_sessao VALUES(${id},6,'${code}',1,NULL,NULL,NULL);\n`;
      for(let n=0;n<18;n++){
        const mid=id*100+n;
        sql+=`INSERT INTO manobras VALUES(${mid},6,'AW139');\n`;
        sql+=`INSERT INTO modelos_sessao_manobras VALUES(${mid},${id},${mid},NULL);\n`;
      }
    }
    if(defect==='missing')sql+='DELETE FROM modelos_sessao_manobras WHERE id=9900;\n';
    if(defect==='s76')sql+="UPDATE manobras SET tipo_aeronave='S76' WHERE id=9900;\n";
    if(defect==='tenant')sql+='UPDATE modelos_sessao SET empresa_id=7 WHERE id=99;\n';
    if(defect==='code')sql+="UPDATE modelos_sessao SET codigo='DIFFERENT' WHERE id=99;\n";
    let result=spawnSync('sqlite3',['-bail',db],{input:sql,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    result=spawnSync('sqlite3',['-bail',db],{
      input:buildPtoAw139MetadataUpdateSql(),encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    result=spawnSync('sqlite3',['-json',db],{input:
      'SELECT id,modelo_aeronave FROM modelos_sessao ORDER BY id;',encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    return JSON.parse(result.stdout);
  }finally{rmSync(dir,{recursive:true,force:true});}
}
test('nine metadata-only updates, EXA-CHECK unchanged', {skip:!sqliteAvailable},()=>{
  const rows=exercise();
  assert.equal(rows.filter(x=>x.modelo_aeronave==='AW139').length,9);
  assert.equal(rows.find(x=>x.id===154).modelo_aeronave,null);
});
for(const defect of ['missing','s76','tenant','code']){
  test(`one invalid model (${defect}) prevents all nine writes`,{skip:!sqliteAvailable},()=>{
    assert.equal(exercise(defect).filter(x=>x.modelo_aeronave==='AW139').length,0);
  });
}
