#!/usr/bin/env node
/**
 * Local-only test identity setup: use normal bcrypt/JWT login with the
 * disposable local D1, never ENABLE_DEV_AUTH_BYPASS.
 * Must run after --reset and before the Worker starts.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const state=path.join(root,'worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
if(process.env.CLOUDFLARE_API_TOKEN||process.env.AIRTRUST_REMOTE_DB)throw Error('REMOTE_CREDENTIALS_NOT_ALLOWED');
const files=fs.readdirSync(state).filter(x=>x.endsWith('.sqlite'));
if(files.length!==1)throw Error('LOCAL_D1_COUNT_INVALID');
const req=createRequire(path.join(root,'worker-airtrust/package.json'));
const bcrypt=req('bcryptjs');
const hash=bcrypt.hashSync('Admin@123',10);
const db=new DatabaseSync(path.join(state,files[0]));
try{
  // The lean local LMS snapshot omits the user-specific RBAC overrides
  // table introduced in the historical 0305 migration. The *real auth*
  // route queries it even when no overrides exist. Mirror that exact
  // additive table only in disposable local QA; never infer a GRANT.
  db.exec("CREATE TABLE IF NOT EXISTS usuario_permissoes (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, permissao TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'GRANT' CHECK(tipo IN ('GRANT','DENY')), created_by INTEGER REFERENCES usuarios(id), created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(usuario_id,permissao)); CREATE INDEX IF NOT EXISTS idx_usuario_permissoes_usuario ON usuario_permissoes(usuario_id)");
  db.prepare("INSERT OR IGNORE INTO usuarios (email,password_hash,nome,perfil,active,created_at,updated_at) VALUES ('admin@airtrust.com',?,'QA Local','ADMIN',1,datetime('now'),datetime('now'))").run(hash);
  const result=db.prepare("UPDATE usuarios SET password_hash=?,active=1,perfil='ADMIN' WHERE email='admin@airtrust.com' AND deleted_at IS NULL").run(hash);
  if(Number(result.changes)!==1)throw Error('LOCAL_ADMIN_NOT_UNIQUE');
}finally{db.close();}
console.log('LOCAL_QA_REAL_AUTH_READY');
