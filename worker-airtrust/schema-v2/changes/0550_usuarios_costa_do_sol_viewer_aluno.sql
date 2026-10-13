-- Schema V2 0550: corrigir somente os 26 vínculos VIEWER de alunos da Costa do Sol.
-- source_reference: auditoria read-only 2026-10-13 (empresa_id=6, 26 VIEWER/ALUNO, 1 Coordenação USER/USUARIO).
-- operational_decision: converter 26 vínculos para student e reservar VIEWER à única Coordenação.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/usuarios-costa-do-sol-viewer-aluno-0550.md

CREATE TEMP TABLE _viewer_aluno_0550_candidates (
  usuario_id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL CHECK(empresa_id=6)
);

INSERT INTO _viewer_aluno_0550_candidates (usuario_id, empresa_id)
SELECT ue.usuario_id, ue.empresa_id
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
      ('COORDENACAO_VOO','ADMIN','ADMINISTRADOR','GESTOR','MANAGER','INSTRUTOR','INSTRUCTOR','ALUNO','STUDENT'))
  AND NOT EXISTS (
    SELECT 1 FROM usuarios_empresas other
    WHERE other.usuario_id=ue.usuario_id AND other.empresa_id<>ue.empresa_id
  );

CREATE TEMP TABLE _viewer_aluno_0550_guard (
  ok INTEGER NOT NULL CHECK(ok=1)
);

-- Um erro no inventário causa CHECK failure antes de qualquer atualização.
INSERT INTO _viewer_aluno_0550_guard (ok)
SELECT CASE WHEN
  (SELECT COUNT(*) FROM _viewer_aluno_0550_candidates)=26
  AND (SELECT COUNT(*) FROM usuarios_empresas ue JOIN usuarios u ON u.id=ue.usuario_id
       WHERE ue.empresa_id=6 AND u.deleted_at IS NULL
         AND LOWER(TRIM(ue.role)) IN ('viewer','visualizador'))=26
  AND (SELECT COUNT(*) FROM usuarios_empresas_perfis p
       JOIN _viewer_aluno_0550_candidates c
         ON c.usuario_id=p.usuario_id AND c.empresa_id=p.empresa_id
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
THEN 1 ELSE 0 END;

-- Atualizar somente vínculos de alunos revisados; trigger 0514 cria perfil
-- explícito student caso a linha ainda não exista.
UPDATE usuarios_empresas
SET role='student'
WHERE empresa_id=6
  AND usuario_id IN (SELECT usuario_id FROM _viewer_aluno_0550_candidates)
  AND LOWER(TRIM(role)) IN ('viewer','visualizador');

-- Revogar o alias de leitura obsoleto apenas para os 26 mesmos vínculos.
UPDATE usuarios_empresas_perfis
SET ativo=0, updated_at=datetime('now')
WHERE empresa_id=6 AND ativo=1
  AND UPPER(TRIM(perfil)) IN ('VIEWER','VISUALIZADOR')
  AND usuario_id IN (SELECT usuario_id FROM _viewer_aluno_0550_candidates);

-- Reativar student quando houver perfil explícito preexistente inativo.
INSERT OR IGNORE INTO usuarios_empresas_perfis
  (usuario_id, empresa_id, perfil, ativo, created_at, updated_at)
SELECT usuario_id, empresa_id, 'student', 1, datetime('now'), datetime('now')
FROM _viewer_aluno_0550_candidates;
UPDATE usuarios_empresas_perfis
SET ativo=1, updated_at=datetime('now')
WHERE empresa_id=6 AND UPPER(TRIM(perfil))='STUDENT'
  AND usuario_id IN (SELECT usuario_id FROM _viewer_aluno_0550_candidates);

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

DROP TABLE _viewer_aluno_0550_guard;
DROP TABLE _viewer_aluno_0550_candidates;
