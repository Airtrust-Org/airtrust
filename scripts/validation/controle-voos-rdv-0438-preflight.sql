-- PREFLIGHT AUDIT para worker-airtrust/migrations/0438_controle_voos_rdv_coordenacao_workflow.sql
-- Somente leitura. Rodar SEPARADAMENTE, em cada ambiente, ANTES da migration.
-- Vive fora de worker-airtrust/migrations/ deliberadamente: nunca deve ser
-- lida pelo runner de migrations nem registrada no ledger d1_migrations —
-- é uma ferramenta de decisão manual para o operador, não uma migration.
--
-- A própria migration 0438 já recusa se aplicar sozinha quando encontra a
-- duplicidade descrita no item 1 abaixo (guarda fail-closed logo no início
-- do arquivo, antes de qualquer ALTER/CREATE). Esta consulta serve para o
-- operador investigar o problema ANTES de tentar aplicar, sem depender de
-- ler a mensagem de erro da migration.

-- 1. Existe duplicidade ativa de (empresa_id, voo_id, numero_etapa) em
--    cv_voo_etapas? Se a contagem abaixo for > 0, a migration vai abortar
--    (ela recusa criar o índice único idx_cv_voo_etapas_empresa_voo_numero_unique
--    por cima de dados que já violam essa unicidade). Resolver manualmente
--    (renumerar ou soft-deletar a etapa duplicada) antes de reaplicar.
SELECT empresa_id, voo_id, numero_etapa, COUNT(*) AS quantidade
FROM cv_voo_etapas
WHERE deleted_at IS NULL
GROUP BY empresa_id, voo_id, numero_etapa
HAVING COUNT(*) > 1;

-- 2. A coluna já existe? Se "workflow_status" aparecer aqui, NÃO rode a
--    migration — ela já foi aplicada (ou aplicada por fora do fluxo numerado
--    e o ledger pode estar desalinhado).
PRAGMA table_info(cv_rdv_operacional);

-- 3. Volume de RDVs já em algum estado de fluxo avançado (fora do estado
--    inicial padrão) — apenas dimensionamento; não bloqueia a migration em
--    si (workflow_status/versao só existem após ela), mas ajuda a estimar o
--    quanto do fluxo será afetado quando o rollback (fora da cadeia
--    numérica) for eventualmente considerado.
SELECT COUNT(*) AS total_rdv FROM cv_rdv_operacional WHERE deleted_at IS NULL;
