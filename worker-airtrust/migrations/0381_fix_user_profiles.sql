-- Migration 0381: Corrigir perfis de usuários com acesso incorreto
-- Problemas identificados:
-- 1. antonio.norte: perfil='USUARIO' mas empresa_role='manager' → sobe para GESTOR
-- 2. INSTRUTORES com empresa_role='viewer' → corrige para 'instructor'
-- 3. GESTORES com empresa_role='GESTOR' (maiúsculo) → normaliza para 'manager'

-- 1. Corrigir Antonio Norte: perfil de USUARIO para GESTOR
UPDATE usuarios
SET perfil = 'GESTOR',
    updated_at = datetime('now')
WHERE id = 63
  AND email = 'antonio.norte@voecostadosol.com.br'
  AND perfil = 'USUARIO';

-- 2. INSTRUTORES com empresa_role='viewer' → 'instructor'
UPDATE usuarios_empresas
SET role = 'instructor'
WHERE role = 'viewer'
  AND usuario_id IN (
    SELECT id FROM usuarios
    WHERE perfil = 'INSTRUTOR' AND deleted_at IS NULL
  );

-- 3. Normalizar empresa_role 'GESTOR' → 'manager'
UPDATE usuarios_empresas
SET role = 'manager'
WHERE role = 'GESTOR';

-- 4. Normalizar empresa_role 'ADMIN' → 'admin' (exceto quando já for admin)
-- (admin@airtrust tem empresa_role='ADMIN' na Costa do Sol, manter como admin)

-- Verificação final
SELECT u.id, u.email, u.perfil, ue.role as empresa_role, e.nome as empresa
FROM usuarios u
JOIN usuarios_empresas ue ON ue.usuario_id = u.id
JOIN empresas e ON e.id = ue.empresa_id
WHERE u.deleted_at IS NULL
ORDER BY u.perfil, u.email;
