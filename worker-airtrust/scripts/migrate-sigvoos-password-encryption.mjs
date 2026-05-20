#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const MARKER = '__WORKER_ENCRYPTED__';
const PREFIX = 'enc:v1';

function usage() {
  console.log(
    [
      'Usage: node scripts/migrate-sigvoos-password-encryption.mjs [--env <name>] [--db <binding>] [--remote]',
      '',
      'Defaults:',
      '  --env development',
      '  --db airtrust-db',
      '  --local mode (safe for local/dev)',
      '',
      'Required env secret for encryption:',
      '  SIGVOOS_CONFIG_ENCRYPTION_KEY (preferred) OR JWT_SECRET',
    ].join('\n'),
  );
}

function parseArgs(argv) {
  const args = { env: 'development', db: 'airtrust-db', remote: false };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--env') {
      args.env = argv[++i] || args.env;
      continue;
    }
    if (token === '--db') {
      args.db = argv[++i] || args.db;
      continue;
    }
    if (token === '--remote') {
      args.remote = true;
      continue;
    }
    if (token === '--help' || token === '-h') {
      usage();
      process.exit(0);
    }
  }

  return args;
}

function runSql({ db, env, remote }, command) {
  const modeFlag = remote ? '--remote' : '--local';
  const args = [
    'wrangler',
    'd1',
    'execute',
    db,
    '--env',
    env,
    modeFlag,
    '--json',
    '--command',
    command,
  ];

  const raw = execFileSync('npx', args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  return JSON.parse(raw);
}

function b64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function keyFromEnv() {
  const dedicated = process.env.SIGVOOS_CONFIG_ENCRYPTION_KEY;
  if (typeof dedicated === 'string' && dedicated.trim().length > 0) return dedicated.trim();
  const jwt = process.env.JWT_SECRET;
  if (typeof jwt === 'string' && jwt.trim().length > 0) return jwt.trim();
  return null;
}

async function importKey(secret) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt']);
}

async function encryptPassword(value, secret) {
  const key = await importKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = new TextEncoder().encode(value);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload);
  return `${PREFIX}:${b64(iv)}:${b64(new Uint8Array(encrypted))}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const secret = keyFromEnv();

  if (!secret) {
    throw new Error('Missing SIGVOOS_CONFIG_ENCRYPTION_KEY (or JWT_SECRET) in environment.');
  }

  const selectSql = `
    SELECT id, empresa_id, valor
    FROM integracoes_sigvoos_config
    WHERE deleted_at IS NULL
      AND chave = 'password'
      AND COALESCE(NULLIF(TRIM(valor), ''), NULL) IS NOT NULL
      AND valor != '${MARKER}'
  `;

  const result = runSql(args, selectSql);
  const rows = Array.isArray(result) && result[0]?.results ? result[0].results : [];

  if (!rows.length) {
    console.log('No plaintext SIGVOOS passwords found. Nothing to migrate.');
    return;
  }

  let migrated = 0;
  for (const row of rows) {
    const id = Number(row.id);
    const empresaId = row.empresa_id == null ? null : Number(row.empresa_id);
    const plain = String(row.valor || '').trim();
    if (!plain) continue;

    const encrypted = await encryptPassword(plain, secret);
    const empresaFilter = empresaId == null ? 'empresa_id IS NULL' : `empresa_id = ${empresaId}`;

    const upsertEncryptedSql = `
      UPDATE integracoes_sigvoos_config
         SET valor = '${encrypted}', updated_at = datetime('now'), deleted_at = NULL
       WHERE chave = 'password_encrypted' AND ${empresaFilter};

      INSERT INTO integracoes_sigvoos_config (empresa_id, chave, valor, created_at, updated_at, deleted_at)
      SELECT ${empresaId == null ? 'NULL' : empresaId}, 'password_encrypted', '${encrypted}', datetime('now'), datetime('now'), NULL
      WHERE NOT EXISTS (
        SELECT 1 FROM integracoes_sigvoos_config WHERE chave = 'password_encrypted' AND ${empresaFilter}
      );

      UPDATE integracoes_sigvoos_config
         SET valor = '${MARKER}', updated_at = datetime('now')
       WHERE id = ${id};
    `;

    runSql(args, upsertEncryptedSql);
    migrated += 1;
  }

  console.log(`Migrated ${migrated} plaintext password row(s) to password_encrypted.`);
}

main().catch((error) => {
  console.error('[migrate-sigvoos-password-encryption] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
