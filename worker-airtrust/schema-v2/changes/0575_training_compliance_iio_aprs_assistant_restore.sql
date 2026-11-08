-- Schema V2 0575: restore one previously-approved maintenance training requirement.
-- source_reference: #1377/#2081; successful 0548 then unexpected soft-delete 2026-10-10 22:39 UTC.
-- operational_decision: obligatory course for six maintenance assistants, NO APRS signoff rights.
-- dry_run_required: yes; strict production preflight checks exact row state.
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-compliance-iio-aprs-assistant-restore-0575.md
-- No other role, LMS enrollment, course completion, certificate, or privilege is changed.
-- Runtime fail-closed guard covers any state change between official preflight and SQL apply.
-- json(non-JSON) raises SQLITE_ERROR before any UPDATE or ledger insertion.
SELECT json(CASE WHEN
  (SELECT COUNT(*) FROM qualificacoes_tipos WHERE id=127 AND empresa_id=6 AND codigo='MNT_IIO_APRS' AND ativo=1 AND deleted_at IS NULL)=1
  AND (SELECT COUNT(*) FROM funcoes WHERE id=38 AND empresa_id=6 AND nome='Auxiliar de Manutenção' AND ativo=1 AND deleted_at IS NULL)=1
  AND (SELECT COUNT(*) FROM funcionarios WHERE empresa_id=6 AND funcao_id=38 AND deleted_at IS NULL AND COALESCE(ativo,1)=1 AND UPPER(COALESCE(NULLIF(TRIM(status),''),'ATIVO'))='ATIVO')=6
  AND (SELECT COUNT(*) FROM treinamento_requisitos WHERE id=198 AND empresa_id=6 AND qualificacao_tipo_id=127 AND funcao_id=5 AND ativo=1 AND deleted_at IS NULL)=1
  AND (SELECT COUNT(*) FROM treinamento_requisitos WHERE id=199 AND empresa_id=6 AND qualificacao_tipo_id=127 AND funcao_id=39 AND ativo=0 AND deleted_at IS NOT NULL)=1
  AND (SELECT COUNT(*) FROM treinamento_requisitos WHERE id=704 AND empresa_id=6 AND qualificacao_tipo_id=127 AND funcao_id=38 AND escopo='FUNCAO' AND obrigatoriedade='OBRIGATORIA' AND auto_matricular_ead=0 AND ativo=0 AND deleted_at IS NOT NULL)=1
  AND (SELECT COUNT(*) FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=127 AND funcao_id=38 AND ativo=1 AND deleted_at IS NULL)=0
THEN 'null' ELSE 'IIO_APRS_0575_DRIFT_REJECTED' END);
UPDATE treinamento_requisitos SET ativo=1,deleted_at=NULL,updated_at=datetime('now')
WHERE id=704 AND empresa_id=6 AND qualificacao_tipo_id=127 AND escopo='FUNCAO'
  AND funcao_id=38 AND obrigatoriedade='OBRIGATORIA' AND ativo=0 AND deleted_at IS NOT NULL
  AND auto_matricular_ead=0
  AND (SELECT COUNT(*) FROM qualificacoes_tipos WHERE id=127 AND empresa_id=6 AND codigo='MNT_IIO_APRS' AND ativo=1 AND deleted_at IS NULL)=1
  AND (SELECT COUNT(*) FROM funcoes WHERE id=38 AND empresa_id=6 AND nome='Auxiliar de Manutenção' AND ativo=1 AND deleted_at IS NULL)=1
  AND (SELECT COUNT(*) FROM funcionarios WHERE empresa_id=6 AND funcao_id=38 AND deleted_at IS NULL AND COALESCE(ativo,1)=1 AND UPPER(COALESCE(NULLIF(TRIM(status),''),'ATIVO'))='ATIVO')=6
  AND (SELECT COUNT(*) FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=127 AND funcao_id=38 AND ativo=1 AND deleted_at IS NULL)=0
  AND (SELECT COUNT(*) FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=127 AND funcao_id=5 AND obrigatoriedade='OBRIGATORIA' AND ativo=1 AND deleted_at IS NULL)=1
  AND (SELECT COUNT(*) FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=127 AND funcao_id=39 AND ativo=0 AND deleted_at IS NOT NULL)=1;
INSERT INTO audit_logs(user_id,action,entity_type,entity_id,old_values,new_values,empresa_id,created_at)
SELECT NULL,'SCHEMA_0575_RESTORE_APPROVED_MNT_IIO_APRS','treinamento_requisitos',704,
  '{"ativo":0,"soft_deleted":true}', '{"ativo":1,"soft_deleted":false,"migration":"0575"}',6,datetime('now')
WHERE EXISTS (SELECT 1 FROM treinamento_requisitos WHERE id=704 AND empresa_id=6 AND qualificacao_tipo_id=127 AND funcao_id=38 AND ativo=1 AND deleted_at IS NULL)
AND NOT EXISTS (SELECT 1 FROM audit_logs WHERE empresa_id=6 AND action='SCHEMA_0575_RESTORE_APPROVED_MNT_IIO_APRS' AND entity_type='treinamento_requisitos' AND entity_id=704);
