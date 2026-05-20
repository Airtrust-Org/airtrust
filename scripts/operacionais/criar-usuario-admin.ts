/**
 * Script para criar usuário admin no banco de dados
 * Executar: npx tsx criar-usuario-admin.ts
 */

import bcryptjs from 'bcryptjs';

async function criarUsuarioAdmin() {
  console.log('🔐 Gerando hash para senha admin123...');

  const senha = 'admin123';
  const salt = await bcryptjs.genSalt(12);
  const passwordHash = await bcryptjs.hash(senha, salt);

  console.log('\n✅ Hash gerado com sucesso!\n');
  console.log('Execute este SQL no Cloudflare D1:\n');
  console.log('----------------------------------------');
  console.log(
    `
INSERT INTO usuarios (email, password_hash, nome, perfil, created_at, updated_at)
VALUES (
  'admin@airtrust.com',
  '${passwordHash}',
  'Admin Sistema',
  'ADMIN',
  datetime('now'),
  datetime('now')
);
  `.trim(),
  );
  console.log('----------------------------------------\n');

  console.log('Ou via Wrangler CLI:');
  console.log(
    `npx wrangler d1 execute airtrust-db --remote --command="INSERT INTO usuarios (email, password_hash, nome, perfil, created_at, updated_at) VALUES ('admin@airtrust.com', '${passwordHash}', 'Admin Sistema', 'ADMIN', datetime('now'), datetime('now'));"`,
  );
}

criarUsuarioAdmin().catch(console.error);
