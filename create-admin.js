// Script para criar usuário admin com senha hasheada
import bcrypt from 'bcryptjs';

const password = 'admin123';
const saltRounds = 10;

bcrypt.hash(password, saltRounds, (err, hash) => {
  if (err) {
    console.error('❌ Erro ao gerar hash:', err);
    process.exit(1);
  }
  
  console.log('✅ Hash gerado com sucesso!');
  console.log('');
  console.log('📋 SQL para criar usuário admin:');
  console.log('');
  console.log(`INSERT INTO usuarios (
  id, name, email, password_hash, perfil, active, created_at, updated_at
) VALUES (
  'admin-001',
  'Administrador',
  'admin@airtrust.com',
  '${hash}',
  'ADMIN',
  1,
  datetime('now'),
  datetime('now')
) ON CONFLICT(email) DO NOTHING;`);
  console.log('');
  console.log('⚠️  IMPORTANTE: Altere a senha após primeiro login!');
  console.log('');
  console.log('📝 Credenciais:');
  console.log('   Email: admin@airtrust.com');
  console.log('   Senha: admin123');
  console.log('');
});
