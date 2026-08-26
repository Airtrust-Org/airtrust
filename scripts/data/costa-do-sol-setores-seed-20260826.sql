-- source_reference: preparado a partir do preflight read-only executado em
-- produção (2026-08-26) contra empresa_id=6, confirmando quais dos 12
-- setores canônicos já existem/estão ativos.
-- operational_decision: reativa o setor "Segurança Operacional" (id=5) em
-- vez de criar um novo, porque ele tem ZERO referências em
-- funcionarios.setor_id, setores_gestores, qualificacoes_tipos_setores e
-- lms_cursos_setores (verificado por SELECT read-only) — reativar não
-- altera semântica de nenhum vínculo histórico. Os demais 8 setores
-- ausentes recebem INSERT com códigos novos, sem colidir com o índice
-- único idx_setores_codigo(empresa_id, codigo) WHERE deleted_at IS NULL.
-- dry_run_required: rodar primeiro um SELECT read-only confirmando a
-- contagem/estado atual dos setores do tenant 6 antes de aplicar; este
-- script só deve ser executado após backup novo e validado do ambiente
-- alvo, pelo fluxo governado do projeto.
-- rollback_plan_required: o UPDATE de reativação é reversível (basta
-- restaurar deleted_at a partir do backup); os INSERTs são reversíveis por
-- soft-delete (UPDATE setores SET deleted_at = datetime('now') WHERE id IN
-- (...)) usando os IDs retornados por este script, sem DELETE físico.
--
-- Costa do Sol (empresa_id=6) — cria os setores canônicos ainda ausentes e
-- reativa "Segurança Operacional" (só existia soft-deleted).
--
-- Escopo: SOMENTE setores. Não toca funcionarios, usuarios, usuarios_empresas,
-- qualificacoes, historico, certificados, LMS ou FRMS.
--
-- Preflight confirmado em produção (2026-08-26) via SELECT read-only:
--   Existentes e ativos: Tripulação (id 10), Manutenção (id 11),
--     Administrativo (id 14).
--   Existe só soft-deleted: Segurança Operacional (id 5, codigo SEGURANCA).
--   Não existem: Operações, Comercial, Compras, Controladoria, QSMS,
--     Jurídico, Recursos Humanos, Logística.
--   Códigos ativos já em uso no tenant (não podem repetir): TRI, MAN, TRE,
--     SEG, ADM, QUA, CTM, OUTROS — os códigos novos abaixo evitam colisão
--     com o índice único idx_setores_codigo (empresa_id, codigo) WHERE
--     deleted_at IS NULL.
--
-- NÃO EXECUTAR sem: backup válido do ambiente alvo + confirmação de que
-- este é exatamente o SHA/branch revisado para esta frente.

BEGIN TRANSACTION;

-- Reativa o registro existente em vez de criar um novo (decisão do usuário).
-- Verificado em produção (2026-08-26, read-only): setor id=5 tem ZERO
-- referências em funcionarios.setor_id, setores_gestores, qualificacoes_tipos_setores
-- e lms_cursos_setores. Reativar é seguro — não altera semântica de nenhum
-- vínculo histórico existente.
UPDATE setores
SET deleted_at = NULL,
    ativo = 1,
    updated_at = datetime('now')
WHERE empresa_id = 6
  AND id = 5
  AND codigo = 'SEGURANCA'
  AND nome = 'Segurança Operacional';

INSERT INTO setores (codigo, nome, ativo, empresa_id, created_at, updated_at)
VALUES
  ('OPERACOES_CS', 'Operações', 1, 6, datetime('now'), datetime('now')),
  ('COMERCIAL', 'Comercial', 1, 6, datetime('now'), datetime('now')),
  ('COMPRAS', 'Compras', 1, 6, datetime('now'), datetime('now')),
  ('CONTROLADORIA', 'Controladoria', 1, 6, datetime('now'), datetime('now')),
  ('QSMS', 'QSMS', 1, 6, datetime('now'), datetime('now')),
  ('JURIDICO', 'Jurídico', 1, 6, datetime('now'), datetime('now')),
  ('RH_CS', 'Recursos Humanos', 1, 6, datetime('now'), datetime('now')),
  ('LOGISTICA', 'Logística', 1, 6, datetime('now'), datetime('now'));

COMMIT;
