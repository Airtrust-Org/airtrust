#!/usr/bin/env node
/**
 * Setup único de credenciais AirTrust.
 *
 * Pergunta email/senha de forma interativa (a senha NÃO aparece na tela),
 * valida o login e salva em ~/.airtrust/credentials.json (permissão 0600).
 *
 * Depois disso, os scripts operacionais autenticam sozinhos — sem re-digitar
 * senha — via: npm run <script>.
 */

import { createInterface } from 'node:readline';
import { authenticate, saveCredentials, credentialsPath, normalizeBase } from './lib/airtrust-auth.mjs';

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function askPassword(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    process.stdout.write(question);

    const onData = (ch) => {
      const code = ch.charCodeAt(0);
      if (code === 3) {
        process.stdout.write('\n');
        rl.close();
        process.exit(130);
      } else if (code === 13 || code === 10) {
        process.stdout.write('\n');
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        resolve(value);
      } else if (code === 127 || code === 8) {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        value += ch;
        process.stdout.write('*');
      }
    };

    stdin.on('data', onData);
  });
}

const apiBase = normalizeBase(process.env.AIRTRUST_API_URL);

const email = (await ask(`Email (${apiBase}): `)).trim();
if (!email) {
  console.error('Email vazio. Abortando.');
  rl.close();
  process.exit(1);
}

const senha = await askPassword('Senha: ');

rl.close();

try {
  console.log('Validando login...');
  await authenticate(apiBase, { email, password: senha });
  const file = saveCredentials({ email, senha });
  console.log(`✔ Login OK. Credenciais salvas em ${file}`);
  console.log('');
  console.log('Agora é só rodar os scripts sem senha, ex.:');
  console.log('  npm run auditar-vencimento');
  console.log('  npm run matricular-mel');
} catch (err) {
  console.error(`✖ Falha ao validar login: ${err instanceof Error ? err.message : err}`);
  console.error('Nada foi salvo.');
  process.exit(1);
}
