#!/usr/bin/env node
/**
 * AirTrust — gerador de provisionamento ALUNO para funcionários da Costa do
 * Sol (empresa_id=6) que ainda não possuem login.
 *
 * USO (somente após a carga cadastral dos 97 estar aplicada, e após novo
 * preflight confirmar quem realmente ainda não tem usuário):
 *   node worker-airtrust/scripts/generate-costa-do-sol-student-provisioning.mjs \
 *     --input <candidatos.json> \
 *     --output <generated.sql>
 *
 * O gerador NÃO acessa D1. Produz apenas SQL tenant-scoped (empresa_id=6)
 * com hashes bcrypt já calculados. A aplicação remota do SQL segue o fluxo
 * governado do projeto (backup antes de qualquer escrita).
 *
 * Garantias de segurança:
 * - nunca UPDATE/DELETE em usuarios existentes;
 * - nunca reativa, reseta senha, troca perfil ou altera vínculo de usuário
 *   já existente;
 * - só insere se NÃO houver usuário por funcionario_id NEM por e-mail
 *   normalizado (qualquer estado: ativo, inativo, soft-deleted) — um match
 *   por qualquer um dos dois é suficiente para SKIP total daquele candidato;
 * - cria perfil ALUNO e vínculo usuarios_empresas role=ALUNO, is_primary=1;
 * - senha nunca é persistida em claro — só o hash bcrypt entra no SQL gerado.
 */
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const EMPRESA_ID = 6;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function sql(v) {
  return `'${String(v).replaceAll("'", "''")}'`;
}
function firstName(nomeCompleto) {
  return String(nomeCompleto).trim().split(/\s+/)[0];
}

const input = arg('--input');
const output = arg('--output');
if (!input || !output) {
  console.error('Uso: --input <candidatos.json> --output <generated.sql>');
  process.exit(2);
}

const candidates = JSON.parse(fs.readFileSync(input, 'utf8'));
if (!Array.isArray(candidates) || candidates.length === 0) {
  throw new Error('Lista de candidatos vazia');
}

const seenEmails = new Set();
const seenCpfs = new Set();
for (const c of candidates) {
  const email = String(c.email || '').trim().toLowerCase();
  const cpf = String(c.cpf || '').replace(/\D/g, '');
  const nome = String(c.nome || '').trim();
  if (!email || !cpf || !nome) {
    throw new Error(`Candidato inválido (faltam campos): ${JSON.stringify(c)}`);
  }
  if (seenEmails.has(email)) throw new Error(`E-mail duplicado na fonte: ${email}`);
  if (seenCpfs.has(cpf)) throw new Error(`CPF duplicado na fonte: ${cpf}`);
  seenEmails.add(email);
  seenCpfs.add(cpf);
}

const out = [];
out.push('-- AirTrust — provisionamento ALUNO, Costa do Sol (empresa_id=6).');
out.push('-- GERADO automaticamente; NÃO executar sem backup + preflight governado.');
out.push(`-- empresa_id alvo: ${EMPRESA_ID}`);
out.push(`-- candidatos: ${candidates.length}`);
out.push('');

for (const c of candidates) {
  const cpf = String(c.cpf).replace(/\D/g, '');
  const email = String(c.email).trim().toLowerCase();
  const nome = String(c.nome).trim();
  const senha = `${firstName(nome)}123`;
  const hash = bcrypt.hashSync(senha, 10);
  out.push(`-- ${nome} <${email}>`);
  out.push(
    `INSERT INTO usuarios (email, password_hash, nome, perfil, funcionario_id, active, created_at, updated_at)\n` +
      `SELECT ${sql(email)}, ${sql(hash)}, ${sql(nome)}, 'ALUNO', f.id, 1, datetime('now'), datetime('now')\n` +
      `FROM funcionarios f\n` +
      `WHERE f.empresa_id = ${EMPRESA_ID}\n` +
      `  AND f.cpf = ${sql(cpf)}\n` +
      `  AND f.deleted_at IS NULL\n` +
      `  AND NOT EXISTS (\n` +
      `    SELECT 1 FROM usuarios u\n` +
      `    WHERE u.funcionario_id = f.id\n` +
      `       OR LOWER(TRIM(u.email)) = ${sql(email)}\n` +
      `  );`,
  );
  out.push(
    `INSERT INTO usuarios_empresas (usuario_id, empresa_id, is_primary, role, created_at)\n` +
      `SELECT u.id, ${EMPRESA_ID}, 1, 'ALUNO', datetime('now')\n` +
      `FROM usuarios u\n` +
      `JOIN funcionarios f ON f.id = u.funcionario_id\n` +
      `WHERE f.empresa_id = ${EMPRESA_ID}\n` +
      `  AND f.cpf = ${sql(cpf)}\n` +
      `  AND u.password_hash = ${sql(hash)}\n` +
      `  AND NOT EXISTS (\n` +
      `    SELECT 1 FROM usuarios_empresas ue WHERE ue.usuario_id = u.id AND ue.empresa_id = ${EMPRESA_ID}\n` +
      `  );`,
  );
  out.push('');
}

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, out.join('\n') + '\n');
console.log(
  `Gerado ${output} com ${candidates.length} candidatos. Nenhum acesso remoto foi realizado. Nenhuma senha em claro foi persistida no arquivo.`,
);
