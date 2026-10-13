-- Schema V2 0551: restaurar USER da única Coordenação Costa do Sol (empresa_id=6).
-- Os 26 alunos corrigidos pela 0550 permanecem STUDENT, sem qualquer UPDATE neles.
-- Guarda fail-closed antes das alterações; sem tabelas temporárias nem outros tenants.
SELECT CASE WHEN
  (SELECT COUNT(*) FROM airtrust_schema_changes_v2 WHERE change_id='usuarios-costa-do-sol-viewer-aluno-0550')=1
  AND (SELECT COUNT(*) FROM usuarios_empresas ue JOIN usuarios u ON u.id=ue.usuario_id
       WHERE ue.empresa_id=6 AND u.deleted_at IS NULL AND LOWER(TRIM(ue.role))='viewer')=1
  AND (SELECT COUNT(*) FROM usuarios_empresas ue JOIN usuarios u ON u.id=ue.usuario_id
       WHERE ue.empresa_id=6 AND u.deleted_at IS NULL AND LOWER(TRIM(ue.role))='user')=0
  AND (SELECT COUNT(*) FROM usuarios_empresas ue JOIN usuarios u ON u.id=ue.usuario_id
       WHERE ue.empresa_id=6 AND u.deleted_at IS NULL AND LOWER(TRIM(ue.role))='viewer'
         AND UPPER(TRIM(u.perfil))='USUARIO'
         AND LOWER(TRIM(COALESCE(u.nome,''))) LIKE '%coordena%'
         AND EXISTS (SELECT 1 FROM usuarios_empresas_perfis p
           WHERE p.usuario_id=ue.usuario_id AND p.empresa_id=6 AND p.ativo=1
             AND UPPER(TRIM(p.perfil))='COORDENACAO_VOO'))=1
  AND (SELECT COUNT(*) FROM usuarios_empresas ue JOIN usuarios u ON u.id=ue.usuario_id
       WHERE ue.empresa_id=6 AND u.deleted_at IS NULL
         AND (LOWER(TRIM(COALESCE(u.nome,''))) LIKE '%coordena%' OR
           EXISTS (SELECT 1 FROM usuarios_empresas_perfis p
             WHERE p.usuario_id=ue.usuario_id AND p.empresa_id=6 AND p.ativo=1
               AND UPPER(TRIM(p.perfil))='COORDENACAO_VOO')))=1
  AND (SELECT COUNT(*) FROM usuarios_empresas ue JOIN usuarios u ON u.id=ue.usuario_id
       WHERE ue.empresa_id=6 AND u.deleted_at IS NULL AND LOWER(TRIM(ue.role))='student'
         AND UPPER(TRIM(u.perfil))='ALUNO'
         AND EXISTS (SELECT 1 FROM usuarios_empresas_perfis p
           WHERE p.usuario_id=ue.usuario_id AND p.empresa_id=6 AND p.ativo=0
             AND UPPER(TRIM(p.perfil)) IN ('VIEWER','VISUALIZADOR')))=26
THEN 1 ELSE json_extract('INVALID_0551_COORDENACAO_GUARD', '$.blocked') END AS guard_0551;

UPDATE usuarios_empresas
SET role='user'
WHERE empresa_id=6 AND LOWER(TRIM(role))='viewer'
  AND usuario_id IN (
    SELECT u.id FROM usuarios u WHERE u.deleted_at IS NULL
      AND UPPER(TRIM(u.perfil))='USUARIO'
      AND LOWER(TRIM(COALESCE(u.nome,''))) LIKE '%coordena%'
      AND EXISTS (SELECT 1 FROM usuarios_empresas_perfis p
        WHERE p.usuario_id=u.id AND p.empresa_id=6 AND p.ativo=1
          AND UPPER(TRIM(p.perfil))='COORDENACAO_VOO')
  );

UPDATE usuarios_empresas_perfis
SET ativo=0, updated_at=datetime('now')
WHERE empresa_id=6 AND ativo=1
  AND UPPER(TRIM(perfil)) IN ('VIEWER','VISUALIZADOR')
  AND usuario_id IN (
    SELECT ue.usuario_id FROM usuarios_empresas ue JOIN usuarios u ON u.id=ue.usuario_id
    WHERE ue.empresa_id=6 AND LOWER(TRIM(ue.role))='user' AND u.deleted_at IS NULL
      AND UPPER(TRIM(u.perfil))='USUARIO' AND LOWER(TRIM(COALESCE(u.nome,''))) LIKE '%coordena%'
      AND EXISTS (SELECT 1 FROM usuarios_empresas_perfis p
        WHERE p.usuario_id=ue.usuario_id AND p.empresa_id=6 AND p.ativo=1
          AND UPPER(TRIM(p.perfil))='COORDENACAO_VOO')
  );

INSERT OR IGNORE INTO usuarios_empresas_perfis
  (usuario_id, empresa_id, perfil, ativo, created_at, updated_at)
SELECT ue.usuario_id,6,'user',1,datetime('now'),datetime('now')
FROM usuarios_empresas ue JOIN usuarios u ON u.id=ue.usuario_id
WHERE ue.empresa_id=6 AND LOWER(TRIM(ue.role))='user' AND u.deleted_at IS NULL
  AND UPPER(TRIM(u.perfil))='USUARIO' AND LOWER(TRIM(COALESCE(u.nome,''))) LIKE '%coordena%'
  AND EXISTS (SELECT 1 FROM usuarios_empresas_perfis p
    WHERE p.usuario_id=ue.usuario_id AND p.empresa_id=6 AND p.ativo=1
      AND UPPER(TRIM(p.perfil))='COORDENACAO_VOO');

UPDATE usuarios_empresas_perfis SET ativo=1, updated_at=datetime('now')
WHERE empresa_id=6 AND UPPER(TRIM(perfil))='USER'
  AND usuario_id IN (
    SELECT ue.usuario_id FROM usuarios_empresas ue JOIN usuarios u ON u.id=ue.usuario_id
    WHERE ue.empresa_id=6 AND LOWER(TRIM(ue.role))='user' AND u.deleted_at IS NULL
      AND UPPER(TRIM(u.perfil))='USUARIO' AND LOWER(TRIM(COALESCE(u.nome,''))) LIKE '%coordena%'
      AND EXISTS (SELECT 1 FROM usuarios_empresas_perfis p
        WHERE p.usuario_id=ue.usuario_id AND p.empresa_id=6 AND p.ativo=1
          AND UPPER(TRIM(p.perfil))='COORDENACAO_VOO')
  );
