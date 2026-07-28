-- Operational domain RBAC readiness report (read-only, SELECT-only).
--
-- Companion to GET /api/admin/operational-domain-rbac/readiness (per-tenant,
-- API-authenticated) — this file runs the same underlying checks directly
-- against D1 for a cross-tenant view, useful before deciding which tenants
-- are candidates for activation. Every query below is a SELECT; nothing
-- here writes, and it must stay that way.
--
-- Usage (local, safe to run anytime):
--   wrangler d1 execute airtrust-db --config worker-airtrust/wrangler.dev.toml \
--     --local --file=scripts/operational-domain-rbac-readiness-report.sql
--
-- Usage (staging/production, READ-ONLY but still requires explicit
-- authorization per CLAUDE.md — do not run against production without
-- sign-off, and never pipe this file into any wrapper that could apply
-- writes):
--   wrangler d1 execute <db-name> --remote \
--     --file=scripts/operational-domain-rbac-readiness-report.sql
--
-- This script does not require migration 0452 beyond the columns it reads
-- (dominio_codigo, operational_domain_rbac_enabled) — if those columns
-- don't exist yet (migration not applied to the target environment), every
-- query below will fail with "no such column", which is itself the answer
-- ("not ready — migration 0452 not applied here").

-- 1. Setores sem domínio classificado (por empresa)
SELECT
  empresa_id,
  COUNT(*) AS setores_sem_dominio
FROM setores
WHERE ativo = 1 AND deleted_at IS NULL AND dominio_codigo IS NULL
GROUP BY empresa_id
ORDER BY empresa_id;

-- 2. Categorias de qualificação sem domínio classificado (por empresa)
SELECT
  empresa_id,
  COUNT(*) AS categorias_sem_dominio
FROM qualificacoes_categorias
WHERE ativo = 1 AND deleted_at IS NULL AND dominio_codigo IS NULL
GROUP BY empresa_id
ORDER BY empresa_id;

-- 3. Cursos LMS sem classificação de domínio (por empresa)
SELECT
  empresa_id,
  COUNT(*) AS cursos_sem_classificacao
FROM lms_cursos
WHERE deleted_at IS NULL AND dominio_codigo IS NULL
GROUP BY empresa_id
ORDER BY empresa_id;

-- 4. Qualificações (tipos) sem domínio — herdam de categoria; lista tipos
--    cuja categoria não está classificada ou que não têm categoria alguma.
SELECT
  qt.empresa_id,
  COUNT(*) AS tipos_sem_dominio
FROM qualificacoes_tipos qt
LEFT JOIN qualificacoes_categorias qc ON qc.id = qt.categoria_id
WHERE qt.deleted_at IS NULL
  AND (qt.categoria_id IS NULL OR qc.dominio_codigo IS NULL)
GROUP BY qt.empresa_id
ORDER BY qt.empresa_id;

-- 5. Recursos com domínio divergente: setor classificado com um domínio
--    inativo/desconhecido no catálogo (schema drift — não deveria ocorrer
--    se a FK textual for respeitada, mas não há FK de banco enforced).
SELECT
  s.empresa_id,
  s.id AS setor_id,
  s.dominio_codigo
FROM setores s
LEFT JOIN dominios_operacionais d ON d.codigo = s.dominio_codigo
WHERE s.deleted_at IS NULL
  AND s.dominio_codigo IS NOT NULL
  AND (d.codigo IS NULL OR d.ativo = 0)
ORDER BY s.empresa_id, s.id;

-- 6. Gestores sem nenhum setor ativo atribuído (por empresa) — usuários com
--    papel de gestor em usuarios_empresas mas sem linha ativa em
--    setores_gestores.
SELECT
  ue.empresa_id,
  ue.usuario_id,
  u.email
FROM usuarios_empresas ue
JOIN usuarios u ON u.id = ue.usuario_id AND u.deleted_at IS NULL
WHERE LOWER(ue.role) IN ('manager', 'gestor', 'compliance')
  AND NOT EXISTS (
    SELECT 1 FROM setores_gestores sg
     WHERE sg.empresa_id = ue.empresa_id
       AND sg.usuario_id = ue.usuario_id
       AND sg.ativo = 1
       AND sg.deleted_at IS NULL
  )
ORDER BY ue.empresa_id, ue.usuario_id;

-- 7. Administradores atualmente com acesso operacional via atribuição de
--    gestor (i.e., "administrador também gestor" — não é um problema por
--    si, mas deve ser conferido antes da ativação: confirma que o acesso
--    operacional desses admins vem de uma atribuição explícita, não do
--    papel administrador em si).
SELECT
  ue.empresa_id,
  ue.usuario_id,
  u.email,
  GROUP_CONCAT(DISTINCT sg.setor_id) AS setores_atribuidos
FROM usuarios_empresas ue
JOIN usuarios u ON u.id = ue.usuario_id AND u.deleted_at IS NULL
JOIN setores_gestores sg
  ON sg.empresa_id = ue.empresa_id
 AND sg.usuario_id = ue.usuario_id
 AND sg.ativo = 1
 AND sg.deleted_at IS NULL
WHERE LOWER(ue.role) = 'admin'
GROUP BY ue.empresa_id, ue.usuario_id
ORDER BY ue.empresa_id, ue.usuario_id;

-- 8. Gestores com mais de um domínio (via setores em domínios distintos) —
--    informativo, não é um bloqueio; útil para saber quantos gestores
--    "cross-domain" existem antes de ativar (podem ver conteúdo tanto de
--    OPERACOES quanto de MANUTENCAO, por exemplo).
SELECT
  sg.empresa_id,
  sg.usuario_id,
  COUNT(DISTINCT s.dominio_codigo) AS quantidade_dominios,
  GROUP_CONCAT(DISTINCT s.dominio_codigo) AS dominios
FROM setores_gestores sg
JOIN setores s
  ON s.id = sg.setor_id
 AND s.empresa_id = sg.empresa_id
 AND s.ativo = 1
 AND s.deleted_at IS NULL
WHERE sg.ativo = 1 AND sg.deleted_at IS NULL AND s.dominio_codigo IS NOT NULL
GROUP BY sg.empresa_id, sg.usuario_id
HAVING quantidade_dominios > 1
ORDER BY sg.empresa_id, sg.usuario_id;

-- 9. Estado atual da flag por tenant (para saber quem já está em rollout).
SELECT id AS empresa_id, nome, operational_domain_rbac_enabled
FROM empresas
ORDER BY id;
