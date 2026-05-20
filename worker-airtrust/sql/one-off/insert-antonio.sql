-- Inserir usuário Antonio (id será gerado automaticamente)
INSERT OR IGNORE INTO usuarios (
  email, password_hash, nome, perfil, funcionario_id, active, created_at, updated_at
) VALUES (
  'antonio.norte@voecostadosol.com.br',
  '$2b$10$kbYn7uIuUDzXn7uw8FCaBOSYwVjbtfua26ToX7TgDgEKYDFfWgDye',
  'Antonio Norte',
  'USUARIO',
  NULL,
  1,
  datetime('now'),
  datetime('now')
);

-- Vincular usuário à empresa_id = 6 (Costa do Sol)
INSERT OR IGNORE INTO usuarios_empresas (
  usuario_id, empresa_id, role, is_primary, created_at
) VALUES (
  (SELECT id FROM usuarios WHERE email = 'antonio.norte@voecostadosol.com.br' LIMIT 1),
  6,
  'user',
  1,
  datetime('now')
);
