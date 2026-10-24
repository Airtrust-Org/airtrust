// source_reference: Schema V2 0564; dry_run_required: false; rollback_plan_required: true
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
test('0564 manifest integrity, additive DDL, historical preservation and immutable code',()=>{
 const m=JSON.parse(readFileSync('worker-airtrust/schema-v2/controle-voos-pilot-supplier-history-0564.json','utf8'));
 const sql=readFileSync(m.filePath,'utf8'),plan=readFileSync(m.planPath,'utf8');
 const sha=s=>createHash('sha256').update(s).digest('hex');
 assert.equal(m.changeId,'controle-voos-pilot-supplier-history-0564');
 assert.equal(m.fileHash,sha(sql));assert.equal(m.planHash,sha(plan));
 assert.doesNotMatch(sql,/(?:^|\n)\s*(?:UPDATE|DELETE FROM|DROP TABLE|INSERT INTO)\s/i);
 const db=new DatabaseSync(':memory:');
 try{
 db.exec('CREATE TABLE cv_voo_abastecimentos (id INTEGER PRIMARY KEY, empresa_id INTEGER, voo_id INTEGER, client_local_id TEXT, fornecedor TEXT)');
 db.exec("INSERT INTO cv_voo_abastecimentos VALUES(1,7,42,'old','Original')");
 db.exec(sql);
 assert.deepEqual({ ...db.prepare('SELECT fornecedor,supplier_code_at_acceptance FROM cv_voo_abastecimentos').get() },{fornecedor:'Original',supplier_code_at_acceptance:null});
 assert.throws(()=>db.exec("INSERT INTO cv_voo_abastecimentos (id,empresa_id,voo_id,client_local_id) VALUES(2,7,42,'new')"),/PILOT_FUELING_SUPPLIER_CODE_REQUIRED/);
 db.exec("INSERT INTO cv_voo_abastecimentos(id,empresa_id,voo_id,client_local_id,supplier_code_at_acceptance) VALUES(2,7,42,'new','TEST')");
 assert.throws(()=>db.exec("UPDATE cv_voo_abastecimentos SET supplier_code_at_acceptance='OTHER' WHERE id=2"),/PILOT_FUELING_SUPPLIER_CODE_IMMUTABLE/);
 }finally{db.close();}
});
