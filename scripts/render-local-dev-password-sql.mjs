#!/usr/bin/env node
/**
 * Renders an ephemeral SQL fixture with an independently generated bcrypt
 * password. AIRTRUST_LOCAL_DEV_PASSWORD can be set (min 16 characters) to
 * allow interactive sign-in; otherwise an unshared random secret is used.
 * Never log either the password or its bcrypt hash.
 */
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const requireWorker = createRequire(new URL('../worker-airtrust/package.json', import.meta.url));
const [templatePath, outputPath] = process.argv.slice(2);
if (!templatePath || !outputPath) throw new Error('EXPECTED_SQL_TEMPLATE_AND_OUTPUT');
const template = readFileSync(resolve(templatePath), 'utf8');
const marker = '__AIRTRUST_LOCAL_BCRYPT_HASH__';
if (!template.includes(marker)) throw new Error('LOCAL_DEV_PASSWORD_MARKER_MISSING');
const password = process.env.AIRTRUST_LOCAL_DEV_PASSWORD || randomBytes(32).toString('base64url');
if (password.length < 16) throw new Error('LOCAL_DEV_PASSWORD_TOO_SHORT');
const bcrypt = requireWorker('bcryptjs');
const hash = bcrypt.hashSync(password, 12);
if (!/^[$]2[aby][$]12[$][A-Za-z0-9./]{53}$/.test(hash)) throw new Error('BCRYPT_GENERATION_FAILED');
writeFileSync(resolve(outputPath), template.split(marker).join(hash), { mode: 0o600 });
