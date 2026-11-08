import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

const root = resolve(import.meta.dirname, '../..');
const source = (path) => readFileSync(resolve(root, path), 'utf8');

test('logging never serializes raw customer tenant profile and client telemetry', () => {
  const empresa = source('worker-airtrust/src/routes/empresas.ts');
  const telemetry = source('worker-airtrust/src/index.ts');
  assert.equal(empresa.includes("JSON.stringify(body)"), false);
  assert.equal(telemetry.includes("JSON.stringify(payload)"), false);
  assert.equal(telemetry.includes("path: String(body?.path"), false);
  assert.equal(telemetry.includes("href: String(body?.href"), false);
  assert.equal(telemetry.includes("message: String(body?.message"), false);
});

test('email/invite log messages do not contain raw recipient contact fields', () => {
  const email = source('worker-airtrust/src/lib/email.ts');
  const ficha = source('worker-airtrust/src/lib/fichaEmails.ts');
  const invite = source('worker-airtrust/src/routes/empresas-usuarios.ts');
  assert.equal(email.includes("payload.to.map((t) => t.email).join"), false);
  assert.equal(ficha.includes("para=${toEmail}"), false);
  assert.equal(ficha.includes("para=\"${toName}\""), false);
  assert.equal(invite.includes("Novo usuário criado: ${normalizedEmail}"), false);
});
