// source_reference: issue #2155 and reviewed 0577 migration plan; historical QH backup.
// operational_decision: reconstruct records in an OFFLINE SQLite file only, never production D1.
// dry_run_required: encrypted archive must be restored and verified before any production cleanup.
// rollback_plan_required: preserve independent encrypted archive and D1 recovery point; see Schema V2 plan.
#!/usr/bin/env node
// Transfer the historical qualification scratch rows only as RSA+AES-GCM
// ciphertext. Plaintext is never uploaded to GitHub or printed in logs.
// Production reads happen exclusively in the separately gated workflow.
import { spawnSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, createHash, createPrivateKey, createPublicKey, privateDecrypt, publicEncrypt, randomBytes, constants } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TABLE = '_backup_qh_tmp';
const FIELDS = ['id','funcionario_id','qualificacao_id','tipo_codigo','codigo','categoria','validade',
  'numero_certificado','orgao_emissor','observacoes','arquivo_url','created_at','updated_at','deleted_at'];
const CREATE = `CREATE TABLE "_backup_qh_tmp" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  qualificacao_id INTEGER, tipo_codigo TEXT, codigo TEXT, categoria TEXT,
  validade TEXT, numero_certificado TEXT, orgao_emissor TEXT, observacoes TEXT,
  arquivo_url TEXT, created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')), deleted_at TEXT,
  FOREIGN KEY(funcionario_id) REFERENCES "funcionarios_backup"(id) ON DELETE RESTRICT
);`;
const sha = value => createHash('sha256').update(value).digest('hex');
function fail(code) { throw new Error(code); }
function runSqlite(file, sql, { json = false, input } = {}) {
  const args = [...(json ? ['-json'] : []), '-batch', '-bail', file];
  if (input === undefined) args.push(sql);
  const result = spawnSync('sqlite3', args, { input, encoding:'utf8', maxBuffer:64*1024*1024 });
  if (result.status !== 0 || result.error) fail('LEGACY_QH_SQLITE_RESTORE_FAILED');
  return result.stdout;
}
function rowsFromD1(d1Result) {
  const rows = d1Result?.[0]?.results;
  if (!Array.isArray(rows) || rows.length !== 525) fail('LEGACY_QH_READ_COUNT_INVALID');
  const ids = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object' ||
        FIELDS.some(key => !Object.prototype.hasOwnProperty.call(row, key)) ||
        Object.keys(row).length !== FIELDS.length ||
        !Number.isSafeInteger(row.id) || row.id <= 0 || ids.has(row.id) ||
        !Number.isSafeInteger(row.funcionario_id) || row.funcionario_id <= 0) {
      fail('LEGACY_QH_READ_SCHEMA_INVALID');
    }
    ids.add(row.id);
    for (const field of FIELDS) {
      const value = row[field];
      if (value !== null && typeof value !== 'string' &&
          !(typeof value === 'number' && Number.isFinite(value))) {
        fail('LEGACY_QH_READ_VALUE_TYPE_INVALID');
      }
    }
  }
  rows.sort((a,b) => a.id - b.id);
  return rows;
}
export function encryptLegacyQhRows(d1Result, publicKeyPem) {
  const rows = rowsFromD1(d1Result);
  const rowsetHash = sha(Buffer.from(JSON.stringify(rows)));
  const plaintext = gzipSync(Buffer.from(JSON.stringify({
    version:1, table:TABLE, rows, rowset_sha256:rowsetHash,
  })));
  const aesKey = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', aesKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const wrappedKey = publicEncrypt({key:createPublicKey(publicKeyPem),
    padding:constants.RSA_PKCS1_OAEP_PADDING, oaepHash:'sha256'}, aesKey);
  return {
    version:1, cipher:'AES-256-GCM', wrap:'RSA-OAEP-SHA256',
    wrapped_key:wrappedKey.toString('base64'), nonce:iv.toString('base64'),
    auth_tag:cipher.getAuthTag().toString('base64'),
    ciphertext:ciphertext.toString('base64'),
  };
}
export function decryptLegacyQhRows(envelope, privateKeyPem) {
  if (envelope?.version !== 1 || envelope.cipher !== 'AES-256-GCM' ||
      envelope.wrap !== 'RSA-OAEP-SHA256') fail('LEGACY_QH_ARCHIVE_FORMAT_INVALID');
  const key = privateDecrypt({key:createPrivateKey(privateKeyPem),
    padding:constants.RSA_PKCS1_OAEP_PADDING, oaepHash:'sha256'},
    Buffer.from(envelope.wrapped_key, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.nonce,'base64'));
  decipher.setAuthTag(Buffer.from(envelope.auth_tag,'base64'));
  const zipped = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')), decipher.final()]);
  const data = JSON.parse(gunzipSync(zipped).toString('utf8'));
  if (data?.version !== 1 || data.table !== TABLE ||
      typeof data.rowset_sha256 !== 'string') fail('LEGACY_QH_ARCHIVE_CONTENT_INVALID');
  const rows = rowsFromD1([{results:data.rows}]);
  if (sha(Buffer.from(JSON.stringify(rows))) !== data.rowset_sha256) fail('LEGACY_QH_ARCHIVE_CHECKSUM_MISMATCH');
  return { rows, rowset_sha256:data.rowset_sha256 };
}
function quoteSql(value) {
  if (value === null) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('LEGACY_QH_NONFINITE_NUMBER');
    return String(value);
  }
  return `CAST(X'${Buffer.from(value,'utf8').toString('hex')}' AS TEXT)`;
}
function offRepo(destination) {
  const rel = relative(REPO, destination);
  return rel === '..' || rel.startsWith('..' + sep);
}
export function restoreEncryptedLegacyQh({ envelope, privateKeyPem, outputDir }) {
  const destination = resolve(outputDir);
  if (!offRepo(destination) || existsSync(destination)) fail('LEGACY_QH_RESTORE_DESTINATION_INVALID');
  const restored = decryptLegacyQhRows(envelope, privateKeyPem);
  mkdirSync(destination, { mode:0o700 });
  const real = realpathSync(destination);
  if (!offRepo(real)) {
    rmSync(destination,{recursive:true,force:true});
    fail('LEGACY_QH_RESTORE_PATH_INVALID');
  }
  const db = join(real, 'historical-qualifications-525.sqlite');
  try {
    const sql = 'PRAGMA foreign_keys=OFF;\n' + CREATE + '\n' +
      restored.rows.map(row => `INSERT INTO "_backup_qh_tmp" (${FIELDS.map(x=>'"'+x+'"').join(',')})
VALUES (${FIELDS.map(key=>quoteSql(row[key])).join(',')});`).join('\n');
    runSqlite(db, '', {input:sql});
    chmodSync(db, 0o600);
    const after = JSON.parse(runSqlite(db, `SELECT * FROM "_backup_qh_tmp" ORDER BY id;`, {json:true}));
    if (after.length !== 525 || sha(Buffer.from(JSON.stringify(after))) !== restored.rowset_sha256 ||
        runSqlite(db, 'PRAGMA integrity_check;').trim() !== 'ok') fail('LEGACY_QH_ARCHIVE_RESTORE_VERIFY_FAILED');
    const evidence = {status:'VERIFIED_OFFLINE_RESTORE', rows:525,
      rowset_sha256:restored.rowset_sha256, sqlite_sha256:sha(readFileSync(db)),
      sqlite_bytes:statSync(db).size, sqlite_integrity:'ok',
      requires_durable_off_d1_copy:true};
    writeFileSync(join(real,'archive-evidence.json'), JSON.stringify(evidence,null,2)+'\n', {flag:'wx', mode:0o600});
    return evidence;
  } catch (e) { rmSync(real,{recursive:true,force:true}); throw e; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  try {
    if (mode === 'pack' && process.argv.length === 6) {
      const rows = JSON.parse(readFileSync(process.argv[3],'utf8'));
      const pub = Buffer.from(process.argv[4],'base64').toString('utf8');
      const envelope = encryptLegacyQhRows(rows,pub);
      const result = JSON.stringify(envelope);
      writeFileSync(process.argv[5],result+'\n',{flag:'wx',mode:0o600});
      console.log(JSON.stringify({status:'ENCRYPTED_ARCHIVE_CREATED', rows:525,
        encrypted_sha256:sha(Buffer.from(result)), encrypted_bytes:Buffer.byteLength(result)}));
    } else if (mode === 'restore' && process.argv.length === 6) {
      const envelope = JSON.parse(readFileSync(process.argv[3],'utf8'));
      const privateKey = readFileSync(process.argv[4],'utf8');
      console.log(JSON.stringify(restoreEncryptedLegacyQh({
        envelope,privateKeyPem:privateKey,outputDir:process.argv[5],
      })));
    } else {
      fail('USAGE: pack <d1-rows.json> <base64-public-pem> <encrypted-output> OR restore <envelope.json> <private.pem> <new-private-dir>');
    }
  } catch(error) { console.error(error.message); process.exitCode=1; }
}
