-- Migration 0433: Corrigir referências LOFT- órfãs em fichas_sessao_manobras
-- Usa o campo nome para mapear old→new code
-- Data: 2026-07-14
--
-- NO_GO_MIGRATION_PRODUCAO
-- Motivo: os dois UPDATEs mapeiam código antigo → novo casando apenas por
-- `manobras.nome`, sem qualquer filtro de empresa_id/tenant, e a subquery
-- correlacionada usa `LIMIT 1` sem `ORDER BY`. Se `nome` não for
-- garantidamente único por empresa no catálogo de manobras, isto pode
-- remapear o código de uma ficha para o `codigo` de uma manobra pertencente
-- a outra empresa, de forma não determinística. Liberação requer PR revisado
-- que (1) confirme unicidade de `nome` por empresa_id no catálogo relevante
-- ou adicione o filtro de empresa_id à subquery, e (2) torne a seleção
-- determinística (ORDER BY explícito) antes de reexecutar.
-- source_reference: leitura estática deste arquivo SQL (sem acesso a produção).
-- operational_decision: bloquear execução até reconciliação por PR revisado;
-- nenhum dado foi lido, alterado ou executado para produzir este marcador.
-- dry_run_required: sim, contra cópia local/staging, antes de qualquer liberação.
-- rollback_plan_required: N/A enquanto bloqueado (nunca executado); ao liberar,
-- o PR de liberação deve incluir plano de rollback para os dois UPDATEs.

UPDATE fichas_sessao_manobras SET codigo = (
  SELECT m.codigo FROM manobras m
  WHERE m.deleted_at IS NULL
    AND m.nome = fichas_sessao_manobras.nome
    AND m.codigo LIKE 'A139-%'
  LIMIT 1
)
WHERE codigo LIKE 'LOFT-%' AND deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM manobras m
    WHERE m.deleted_at IS NULL
      AND m.nome = fichas_sessao_manobras.nome
      AND m.codigo LIKE 'A139-%'
  );

UPDATE historico_notas_manobras SET codigo_manobra = (
  SELECT m.codigo FROM manobras m
  WHERE m.deleted_at IS NULL
    AND m.nome = historico_notas_manobras.descricao_manobra
    AND m.codigo LIKE 'A139-%'
  LIMIT 1
)
WHERE codigo_manobra LIKE 'LOFT-%' AND deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM manobras m
    WHERE m.deleted_at IS NULL
      AND m.nome = historico_notas_manobras.descricao_manobra
      AND m.codigo LIKE 'A139-%'
  );
