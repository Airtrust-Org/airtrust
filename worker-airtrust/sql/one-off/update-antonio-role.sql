-- Atualiza papel do Antonio para GESTOR na empresa 6
UPDATE usuarios_empresas
SET role = 'GESTOR'
WHERE usuario_id = (
  SELECT id FROM usuarios WHERE email = 'antonio.norte@voecostadosol.com.br' LIMIT 1
) AND empresa_id = 6;

-- Também atualiza o perfil global do usuário, se desejar
UPDATE usuarios
SET perfil = 'GESTOR'
WHERE email = 'antonio.norte@voecostadosol.com.br';
