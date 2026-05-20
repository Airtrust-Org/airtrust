SELECT id, email, nome, perfil, active FROM usuarios WHERE email = 'antonio.norte@voecostadosol.com.br' LIMIT 1;

SELECT id, usuario_id, empresa_id, role, is_primary FROM usuarios_empresas WHERE usuario_id = (SELECT id FROM usuarios WHERE email = 'antonio.norte@voecostadosol.com.br' LIMIT 1) LIMIT 5;
