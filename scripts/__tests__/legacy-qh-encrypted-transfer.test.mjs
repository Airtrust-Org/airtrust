import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { encryptLegacyQhRows, decryptLegacyQhRows, restoreEncryptedLegacyQh } from '../production/legacy-qh-encrypted-transfer.mjs';

const COLS = ['id','funcionario_id','qualificacao_id','tipo_codigo','codigo','categoria','validade','numero_certificado','orgao_emissor','observacoes','arquivo_url','created_at','updated_at','deleted_at'];
const rows = Array.from({ length:525 }, (_,i) => Object.fromEntries(
  COLS.map(key => [key, key === 'id' ? i+1 : key === 'funcionario_id' ? i+1000 :
    key === 'observacoes' ? `synthetic-quote-' test ${i} ü\n` : null])
));
const keys=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},
  privateKeyEncoding:{type:'pkcs8',format:'pem'}});
const sqliteAvailable=spawnSync('sqlite3',['-version'],{encoding:'utf8'}).status===0;
test('RSA+AES-GCM transport preserves 525 synthetic rows and restores to private SQLite', {skip:!sqliteAvailable}, () => {
  const dir=mkdtempSync(join(tmpdir(),'airtrust-qh-crypto-test-'));
  try {
    const envelope=encryptLegacyQhRows([{results:structuredClone(rows)}],keys.publicKey);
    const serialized=JSON.stringify(envelope);
    assert.equal(serialized.includes('synthetic-quote'),false);
    assert.equal(serialized.includes('funcionario_id'),false);
    const decoded=decryptLegacyQhRows(envelope,keys.privateKey);
    assert.deepEqual(decoded.rows,rows);
    const restored=restoreEncryptedLegacyQh({envelope,privateKeyPem:keys.privateKey,outputDir:join(dir,'private')});
    assert.equal(restored.rows,525);
    assert.equal(restored.sqlite_integrity,'ok');
    assert.equal(existsSync(join(dir,'private','historical-qualifications-525.sqlite')),true);
    assert.equal(readFileSync(join(dir,'private','archive-evidence.json'),'utf8').includes('synthetic-quote'),false);
    assert.equal(spawnSync('sqlite3',[join(dir,'private','historical-qualifications-525.sqlite'),
      'SELECT COUNT(*) FROM pragma_foreign_key_check;'],{encoding:'utf8'}).stdout.trim(),'525');
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('rejects modified GCM ciphertext and wrong private key',()=>{
  const envelope=encryptLegacyQhRows([{results:structuredClone(rows)}],keys.publicKey);
  const bad=structuredClone(envelope);
  const bytes=Buffer.from(bad.ciphertext,'base64');
  bytes[0]^=1;
  bad.ciphertext=bytes.toString('base64');
  assert.throws(()=>decryptLegacyQhRows(bad,keys.privateKey));
  const wrong=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},
    privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  assert.throws(()=>decryptLegacyQhRows(envelope,wrong.privateKey));
});
test('rejects schema drift and non-525 packages',()=>{
  assert.throws(()=>encryptLegacyQhRows([{results:rows.slice(1)}],keys.publicKey),/LEGACY_QH_READ_COUNT_INVALID/);
  const bad=structuredClone(rows);
  bad[0].other_field='unexpected';
  assert.throws(()=>encryptLegacyQhRows([{results:bad}],keys.publicKey),/LEGACY_QH_READ_SCHEMA_INVALID/);
});
test('workflow only uploads encrypted package and enforces protected scope',()=>{
  const yml=readFileSync(new URL('../../.github/workflows/d1-legacy-qh-encrypted-archive.yml',import.meta.url),'utf8');
  assert.match(yml,/environment: production/);
  assert.match(yml,/D1_BACKUP_API_TOKEN/);
  assert.match(yml,/AIRTRUST_QH_ARCHIVE_ONLY_525/);
  assert.match(yml,/--command 'SELECT id,funcionario_id/);
  assert.match(yml,/Upload encrypted archive only/);
  assert.equal((yml.match(/--config worker-airtrust\\/wrangler\\.toml --env production --remote --json/g) ?? []).length, 2);
  assert.doesNotMatch(yml,/upload-artifact[\s\S]*dr-qh-plaintext-rows\.json/);
});
