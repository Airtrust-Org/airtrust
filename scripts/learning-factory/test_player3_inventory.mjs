import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDecipheriv,randomBytes} from 'node:crypto';
import {normalizeD1Rows,sealInventory,summarize} from './player3-seal-active-inventory.mjs';
const row={
  empresa_id:6,matricula_id:911,curso_id:57,funcionario_id:123,
  matricula_status:'EM_ANDAMENTO',matricula_progresso_pct:80,
  ciclo_id:332,ciclo_status:'EM_ANDAMENTO',ciclo_atual:1,ciclo_progresso_pct:80,
  scorm_suspend_data_PRIVATE:'{"secret":"resume-marker"}',
  scorm_cmi_json_PRIVATE:'{"cmi":"PRIVATE_LEARNING_STATE"}',
};
test('accepts fixed read-only D1 result and counts only aggregate fields',()=>{
  const rows=normalizeD1Rows([{results:[row]}]);
  assert.equal(rows.length,1);
  assert.deepEqual(summarize(rows),{
    enrollments:1,active:1,unstarted:0,tenants:1,
    courses:1,conflicts:0,with_scorm_resume_state:1,
    contains_individual_data:false,
  });
});
test('seals sensitive IDs and SCORM resume state with authenticated encryption',()=>{
  const key=randomBytes(32);
  const {sealed,summary}=sealInventory([row],key,'vault-key');
  assert.equal(summary.active,1);
  assert.ok(!sealed.includes('resume-marker'));
  assert.ok(!sealed.includes('PRIVATE_LEARNING_STATE'));
  assert.ok(!sealed.includes('911'));
  const data=JSON.parse(sealed);
  const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(data.iv_b64,'base64'));
  decipher.setAAD(Buffer.from('AIRTRUST_PLAYER3_PRIVATE_INVENTORY_V1:vault-key'));
  decipher.setAuthTag(Buffer.from(data.tag_b64,'base64'));
  const raw=Buffer.concat([decipher.update(Buffer.from(data.ciphertext_b64,'base64')),decipher.final()]);
  const content=JSON.parse(raw.toString('utf8'));
  assert.equal(content.rows[0].matricula_progresso_pct,80);
  assert.equal(content.rows[0].scorm_cmi_json_PRIVATE,row.scorm_cmi_json_PRIVATE);
});
test('refuses malformed input, duplicate cycle conflicts are reported',()=>{
  assert.throws(()=>normalizeD1Rows([{results:[{...row,empresa_id:0}]}]),/INVALID_ID/);
  assert.equal(summarize([row,{...row}]).conflicts,1);
  assert.equal(summarize([{...row,ciclo_progresso_pct:60}]).conflicts,1);
});
test('rejects a key that cannot provide AES-256-GCM',()=>{
  assert.throws(()=>sealInventory([row],Buffer.alloc(16)),/INVALID_KEY/);
});
