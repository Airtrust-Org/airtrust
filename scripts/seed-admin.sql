-- Criar usuário admin inicial
-- IMPORTANTE: Altere a senha após primeiro login!
-- Email: admin@airtrust.com
-- Senha: admin123

INSERT INTO usuarios (
  id, name, email, password_hash, perfil, active, created_at, updated_at
) VALUES (
  'admin-001',
  'Administrador',
  'admin@airtrust.com',
  '$2a$10$WhO8Pmjl4ZwPuNIpZbGeaefWmZG0bgdhUu3UFk9zFxiVYkg09t93q',
  'ADMIN',
  1,
  datetime('now'),
  datetime('now')
) ON CONFLICT(email) DO NOTHING;

SELECT 'Admin user created successfully' as message;
