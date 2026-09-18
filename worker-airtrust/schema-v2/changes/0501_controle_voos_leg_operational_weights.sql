-- source_reference: Pilot App/RDV operational-leg requirements reviewed 2026-09-17; aircraft empty weight must come from the tenant aircraft cadastro.
-- operational_decision: persist exact per-leg weight breakdown and enforce explicit KG/LB units; never backfill aircraft empty weight from model averages.
-- dry_run_required: validate on a local D1 copy and through the governed Schema V2 preflight before any remote application.
-- rollback_plan_required: preserve additive columns; use the captured D1 recovery point for failed atomic apply or a reviewed forward compensation for catalog data.
-- 0501 Controle de Voos: dados operacionais de peso por etapa e natureza Petrobras Costa do Sol.
-- Mudanca aditiva. Aplicacao remota somente pelo fluxo governado Schema V2.
ALTER TABLE aeronaves ADD COLUMN peso_vazio REAL CHECK (peso_vazio IS NULL OR peso_vazio > 0);
ALTER TABLE aeronaves ADD COLUMN unidade_peso TEXT CHECK (unidade_peso IS NULL OR unidade_peso IN ('KG','LB'));

ALTER TABLE cv_voo_etapas ADD COLUMN peso_passageiros REAL CHECK (peso_passageiros IS NULL OR peso_passageiros >= 0);
ALTER TABLE cv_voo_etapas ADD COLUMN peso_bagagem REAL CHECK (peso_bagagem IS NULL OR peso_bagagem >= 0);
ALTER TABLE cv_voo_etapas ADD COLUMN peso_tripulacao REAL CHECK (peso_tripulacao IS NULL OR peso_tripulacao >= 0);
ALTER TABLE cv_voo_etapas ADD COLUMN peso_vazio REAL CHECK (peso_vazio IS NULL OR peso_vazio > 0);
ALTER TABLE cv_voo_etapas ADD COLUMN peso_total REAL CHECK (peso_total IS NULL OR peso_total > 0);
ALTER TABLE cv_voo_etapas ADD COLUMN unidade_peso TEXT CHECK (unidade_peso IS NULL OR unidade_peso IN ('KG','LB'));
ALTER TABLE cv_voo_etapas ADD COLUMN observacoes TEXT;

INSERT INTO cv_naturezas_voo (empresa_id, codigo, nome, descricao, ativo, ordem, created_at, updated_at)
VALUES (6, 'PETROBRAS', 'Petrobras', 'Operação Petrobras', 1, 20, datetime('now'), datetime('now'))
ON CONFLICT(empresa_id, codigo) WHERE deleted_at IS NULL DO UPDATE SET
  nome = excluded.nome,
  descricao = excluded.descricao,
  ativo = 1,
  updated_at = datetime('now');
