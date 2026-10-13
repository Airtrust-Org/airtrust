-- Schema V2 0550: corrigir somente os 26 vínculos VIEWER de alunos da Costa do Sol.
-- source_reference: auditoria read-only 2026-10-13 (empresa_id=6, 26 VIEWER/ALUNO, 1 Coordenação USER/USUARIO).
-- operational_decision: converter 26 vínculos para student e reservar VIEWER à única Coordenação.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/usuarios-costa-do-sol-viewer-aluno-0550.md

-- D1 remote import rejects TEMP table DDL. SELECT guard fails before any DML.
SELECT CASE WHEN
  (SELECT COUNT(*) FROM (SELECT ue.usuario_id
FROM usuarios_empresas ue
JOIN usuarios u ON u.id=ue.usuario_id
WHERE ue.empresa_id=6
  AND u.deleted_at IS NULL
  AND UPPER(TRIM(u.perfil))='ALUNO'
  AND LOWER(TRIM(ue.role)) IN ('viewer','visualizador')
  AND LOWER(TRIM(COALESCE(u.nome,''))) NOT LIKE '%coordena%'
  AND NOT EXISTS (
    SELECT 1 FROM usuarios_empresas_perfis p
    WHERE p.usuario_id=ue.usuario_id AND p.empresa_id=ue.empresa_id
      AND p.ativo=1 AND UPPER(TRIM(p.perfil)) IN
      ('COORDENACAO_VOO','ADMIN','ADMINISTRADOR','GESTOR','MANAGER','INSTRUTOR','INSTRUCTOR'))
  AND NOT EXISTS (
    SELECT 1 FROM usuarios_empresas other
    WHERE other.usuario_id=ue.usuario_id AND other.empresa_id<>ue.empresa_id
  )))=26
  AND (SELECT COUNT(*) FROM usuarios_empresas ue JOIN usuarios u ON u.id=ue.usuario_id
       WHERE ue.empresa_id=6 AND u.deleted_at IS NULL
         AND LOWER(TRIM(ue.role)) IN ('viewer','visualizador'))=26
  AND (SELECT COUNT(*) FROM usuarios_empresas_perfis p
       JOIN (SELECT ue.usuario_id
FROM usuarios_empresas ue
JOIN usuarios u ON u.id=ue.usuario_id
WHERE ue.empresa_id=6
  AND u.deleted_at IS NULL
  AND UPPER(TRIM(u.perfil))='ALUNO'
  AND LOWER(TRIM(ue.role)) IN ('viewer','visualizador')
  AND LOWER(TRIM(COALESCE(u.nome,''))) NOT LIKE '%coordena%'
  AND NOT EXISTS (
    SELECT 1 FROM usuarios_empresas_perfis p
    WHERE p.usuario_id=ue.usuario_id AND p.empresa_id=ue.empresa_id
      AND p.ativo=1 AND UPPER(TRIM(p.perfil)) IN
      ('COORDENACAO_VOO','ADMIN','ADMINISTRADOR','GESTOR','MANAGER','INSTRUTOR','INSTRUCTOR'))
  AND NOT EXISTS (
    SELECT 1 FROM usuarios_empresas other
    WHERE other.usuario_id=ue.usuario_id AND other.empresa_id<>ue.empresa_id
  )) c ON c.usuario_id=p.usuario_id
       WHERE p.ativo=1 AND UPPER(TRIM(p.perfil)) IN ('VIEWER','VISUALIZADOR'))=26
  AND (SELECT COUNT(*) FROM usuarios_empresas ue JOIN usuarios u ON u.id=ue.usuario_id
       WHERE ue.empresa_id=6 AND u.deleted_at IS NULL
         AND LOWER(TRIM(ue.role))='user'
         AND UPPER(TRIM(u.perfil))='USUARIO'
         AND LOWER(TRIM(COALESCE(u.nome,''))) LIKE '%coordena%'
         AND EXISTS (SELECT 1 FROM usuarios_empresas_perfis p
           WHERE p.usuario_id=ue.usuario_id AND p.empresa_id=ue.empresa_id
             AND p.ativo=1 AND UPPER(TRIM(p.perfil))='COORDENACAO_VOO'))=1
  AND (SELECT COUNT(*) FROM usuarios_empresas ue JOIN usuarios u ON u.id=ue.usuario_id
       WHERE ue.empresa_id=6 AND u.deleted_at IS NULL
         AND (LOWER(TRIM(u.nome)) LIKE '%coordena%'
              OR EXISTS (SELECT 1 FROM usuarios_empresas_perfis p
                WHERE p.usuario_id=ue.usuario_id AND p.empresa_id=ue.empresa_id
                  AND p.ativo=1 AND UPPER(TRIM(p.perfil))='COORDENACAO_VOO')))=1
  AND (SELECT COUNT(*) FROM usuarios_empresas_perfis p
       JOIN usuarios_empresas ue ON ue.usuario_id=p.usuario_id AND ue.empresa_id=p.empresa_id
       WHERE p.empresa_id=6 AND p.ativo=1
         AND LOWER(TRIM(ue.role)) IN ('viewer','visualizador')
         AND UPPER(TRIM(p.perfil)) IN ('ALUNO','STUDENT'))=0
THEN 1 ELSE json_extract('INVALID_SCHEMA_0550_GUARD', '$.deny') END AS guard_0550;

-- Candidates remain viewer until the final membership update.
INSERT OR IGNORE INTO usuarios_empresas_perfis
 (usuario_id,empresa_id,perfil,ativo,created_at,updated_at)
SELECT usuario_id,6,'student',1,datetime('now'),datetime('now') FROM (SELECT ue.usuario_id
FROM usuarios_empresas ue
JOIN usuarios u ON u.id=ue.usuario_id
WHERE ue.empresa_id=6
  AND u.deleted_at IS NULL
  AND UPPER(TRIM(u.perfil))='ALUNO'
  AND LOWER(TRIM(ue.role)) IN ('viewer','visualizador')
  AND LOWER(TRIM(COALESCE(u.nome,''))) NOT LIKE '%coordena%'
  AND NOT EXISTS (
    SELECT 1 FROM usuarios_empresas_perfis p
    WHERE p.usuario_id=ue.usuario_id AND p.empresa_id=ue.empresa_id
      AND p.ativo=1 AND UPPER(TRIM(p.perfil)) IN
      ('COORDENACAO_VOO','ADMIN','ADMINISTRADOR','GESTOR','MANAGER','INSTRUTOR','INSTRUCTOR'))
  AND NOT EXISTS (
    SELECT 1 FROM usuarios_empresas other
    WHERE other.usuario_id=ue.usuario_id AND other.empresa_id<>ue.empresa_id
  ));
UPDATE usuarios_empresas_perfis SET ativo=1,updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(perfil))='STUDENT'
 AND usuario_id IN (SELECT ue.usuario_id
FROM usuarios_empresas ue
JOIN usuarios u ON u.id=ue.usuario_id
WHERE ue.empresa_id=6
  AND u.deleted_at IS NULL
  AND UPPER(TRIM(u.perfil))='ALUNO'
  AND LOWER(TRIM(ue.role)) IN ('viewer','visualizador')
  AND LOWER(TRIM(COALESCE(u.nome,''))) NOT LIKE '%coordena%'
  AND NOT EXISTS (
    SELECT 1 FROM usuarios_empresas_perfis p
    WHERE p.usuario_id=ue.usuario_id AND p.empresa_id=ue.empresa_id
      AND p.ativo=1 AND UPPER(TRIM(p.perfil)) IN
      ('COORDENACAO_VOO','ADMIN','ADMINISTRADOR','GESTOR','MANAGER','INSTRUTOR','INSTRUCTOR'))
  AND NOT EXISTS (
    SELECT 1 FROM usuarios_empresas other
    WHERE other.usuario_id=ue.usuario_id AND other.empresa_id<>ue.empresa_id
  ));
UPDATE usuarios_empresas_perfis SET ativo=0,updated_at=datetime('now')
 WHERE empresa_id=6 AND ativo=1
 AND UPPER(TRIM(perfil)) IN ('VIEWER','VISUALIZADOR')
 AND usuario_id IN (SELECT ue.usuario_id
FROM usuarios_empresas ue
JOIN usuarios u ON u.id=ue.usuario_id
WHERE ue.empresa_id=6
  AND u.deleted_at IS NULL
  AND UPPER(TRIM(u.perfil))='ALUNO'
  AND LOWER(TRIM(ue.role)) IN ('viewer','visualizador')
  AND LOWER(TRIM(COALESCE(u.nome,''))) NOT LIKE '%coordena%'
  AND NOT EXISTS (
    SELECT 1 FROM usuarios_empresas_perfis p
    WHERE p.usuario_id=ue.usuario_id AND p.empresa_id=ue.empresa_id
      AND p.ativo=1 AND UPPER(TRIM(p.perfil)) IN
      ('COORDENACAO_VOO','ADMIN','ADMINISTRADOR','GESTOR','MANAGER','INSTRUTOR','INSTRUCTOR'))
  AND NOT EXISTS (
    SELECT 1 FROM usuarios_empresas other
    WHERE other.usuario_id=ue.usuario_id AND other.empresa_id<>ue.empresa_id
  ));
UPDATE usuarios_empresas SET role='student'
 WHERE empresa_id=6 AND LOWER(TRIM(role)) IN ('viewer','visualizador')
 AND usuario_id IN (SELECT ue.usuario_id
FROM usuarios_empresas ue
JOIN usuarios u ON u.id=ue.usuario_id
WHERE ue.empresa_id=6
  AND u.deleted_at IS NULL
  AND UPPER(TRIM(u.perfil))='ALUNO'
  AND LOWER(TRIM(ue.role)) IN ('viewer','visualizador')
  AND LOWER(TRIM(COALESCE(u.nome,''))) NOT LIKE '%coordena%'
  AND NOT EXISTS (
    SELECT 1 FROM usuarios_empresas_perfis p
    WHERE p.usuario_id=ue.usuario_id AND p.empresa_id=ue.empresa_id
      AND p.ativo=1 AND UPPER(TRIM(p.perfil)) IN
      ('COORDENACAO_VOO','ADMIN','ADMINISTRADOR','GESTOR','MANAGER','INSTRUTOR','INSTRUCTOR'))
  AND NOT EXISTS (
    SELECT 1 FROM usuarios_empresas other
    WHERE other.usuario_id=ue.usuario_id AND other.empresa_id<>ue.empresa_id
  ));

-- A única conta de Coordenação permanece com perfil técnico COORDENACAO_VOO.
-- O vínculo compatível passa de USER para VIEWER, sem atribuir capabilities
-- adicionais nem remover seu perfil operacional explícito.
UPDATE usuarios_empresas
SET role='viewer'
WHERE empresa_id=6 AND LOWER(TRIM(role))='user'
  AND usuario_id IN (
    SELECT u.id FROM usuarios u
    WHERE u.deleted_at IS NULL
      AND UPPER(TRIM(u.perfil))='USUARIO'
      AND LOWER(TRIM(COALESCE(u.nome,''))) LIKE '%coordena%'
      AND EXISTS (SELECT 1 FROM usuarios_empresas_perfis p
        WHERE p.usuario_id=u.id AND p.empresa_id=6
          AND p.ativo=1 AND UPPER(TRIM(p.perfil))='COORDENACAO_VOO')
  );
