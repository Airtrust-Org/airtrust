-- One-off production fix: Antonio Norte must be a company manager.
-- Keep the existing password_hash untouched.

UPDATE usuarios
SET
  perfil = 'GESTOR',
  updated_at = COALESCE(updated_at, datetime('now'))
WHERE lower(email) = 'antonio.norte@voecostadosol.com.br';

UPDATE usuarios_empresas
SET role = 'manager'
WHERE usuario_id = (
  SELECT id
  FROM usuarios
  WHERE lower(email) = 'antonio.norte@voecostadosol.com.br'
  LIMIT 1
)
AND empresa_id = 6;
