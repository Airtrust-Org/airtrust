-- AIRTRUST QA-LMS 0581: Owner-authorized removal of 28 synthetic QA identities ONLY.
-- Tenant 6; exact employee IDs 194..221 and user IDs 162..189; canonical QA-LMS-202611 untouched.
-- Preflight validates exact IDs, roles, ownership, row counts, QA report, R2 keys and 0 cross references.
-- Audit logs intentionally retained as technical immutable audit (not LMS course history).
-- Break only synthetic mutual LMS/cycle/qualification pointers before deletes;
-- no reliance on session-scoped PRAGMA or explicit BEGIN unsupported by D1.
UPDATE lms_matriculas SET qualificacao_historico_id=NULL WHERE id IN (SELECT id FROM lms_matriculas WHERE empresa_id=6 AND funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id=6 AND id BETWEEN 194 AND 221 AND matricula LIKE 'QA-LMS-%' AND matricula <> 'QA-LMS-202611' AND nome LIKE 'AIRTRUST_QA_LMS_%')) AND empresa_id=6;
UPDATE lms_matricula_ciclos SET qualificacao_historico_id=NULL WHERE id IN (SELECT id FROM lms_matricula_ciclos WHERE empresa_id=6 AND funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id=6 AND id BETWEEN 194 AND 221 AND matricula LIKE 'QA-LMS-%' AND matricula <> 'QA-LMS-202611' AND nome LIKE 'AIRTRUST_QA_LMS_%')) AND empresa_id=6;
UPDATE qualificacoes_historico SET lms_matricula_id=NULL,lms_matricula_ciclo_id=NULL WHERE id IN (SELECT id FROM qualificacoes_historico WHERE empresa_id=6 AND funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id=6 AND id BETWEEN 194 AND 221 AND matricula LIKE 'QA-LMS-%' AND matricula <> 'QA-LMS-202611' AND nome LIKE 'AIRTRUST_QA_LMS_%')) AND empresa_id=6;

DELETE FROM notificacoes_log WHERE funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id=6 AND id BETWEEN 194 AND 221 AND matricula LIKE 'QA-LMS-%' AND matricula <> 'QA-LMS-202611' AND nome LIKE 'AIRTRUST_QA_LMS_%') OR qualificacao_historico_id IN (SELECT id FROM qualificacoes_historico WHERE empresa_id=6 AND funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id=6 AND id BETWEEN 194 AND 221 AND matricula LIKE 'QA-LMS-%' AND matricula <> 'QA-LMS-202611' AND nome LIKE 'AIRTRUST_QA_LMS_%'));

DELETE FROM notificacoes_inapp WHERE funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id=6 AND id BETWEEN 194 AND 221 AND matricula LIKE 'QA-LMS-%' AND matricula <> 'QA-LMS-202611' AND nome LIKE 'AIRTRUST_QA_LMS_%') AND empresa_id=6;

DELETE FROM lms_pptx_slide_evidences WHERE matricula_id IN (SELECT id FROM lms_matriculas WHERE empresa_id=6 AND funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id=6 AND id BETWEEN 194 AND 221 AND matricula LIKE 'QA-LMS-%' AND matricula <> 'QA-LMS-202611' AND nome LIKE 'AIRTRUST_QA_LMS_%')) OR funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id=6 AND id BETWEEN 194 AND 221 AND matricula LIKE 'QA-LMS-%' AND matricula <> 'QA-LMS-202611' AND nome LIKE 'AIRTRUST_QA_LMS_%');

DELETE FROM lms_scorm_edition_handoffs WHERE matricula_id IN (SELECT id FROM lms_matriculas WHERE empresa_id=6 AND funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id=6 AND id BETWEEN 194 AND 221 AND matricula LIKE 'QA-LMS-%' AND matricula <> 'QA-LMS-202611' AND nome LIKE 'AIRTRUST_QA_LMS_%')) OR ciclo_id IN (SELECT id FROM lms_matricula_ciclos WHERE empresa_id=6 AND funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id=6 AND id BETWEEN 194 AND 221 AND matricula LIKE 'QA-LMS-%' AND matricula <> 'QA-LMS-202611' AND nome LIKE 'AIRTRUST_QA_LMS_%'));

DELETE FROM lms_xapi_statements WHERE matricula_id IN (SELECT id FROM lms_matriculas WHERE empresa_id=6 AND funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id=6 AND id BETWEEN 194 AND 221 AND matricula LIKE 'QA-LMS-%' AND matricula <> 'QA-LMS-202611' AND nome LIKE 'AIRTRUST_QA_LMS_%')) AND empresa_id=6;

DELETE FROM lms_progresso_scorm WHERE matricula_id IN (SELECT id FROM lms_matriculas WHERE empresa_id=6 AND funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id=6 AND id BETWEEN 194 AND 221 AND matricula LIKE 'QA-LMS-%' AND matricula <> 'QA-LMS-202611' AND nome LIKE 'AIRTRUST_QA_LMS_%')) AND empresa_id=6;

DELETE FROM documentos WHERE funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id=6 AND id BETWEEN 194 AND 221 AND matricula LIKE 'QA-LMS-%' AND matricula <> 'QA-LMS-202611' AND nome LIKE 'AIRTRUST_QA_LMS_%') AND empresa_id=6;

DELETE FROM pasta_virtual WHERE funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id=6 AND id BETWEEN 194 AND 221 AND matricula LIKE 'QA-LMS-%' AND matricula <> 'QA-LMS-202611' AND nome LIKE 'AIRTRUST_QA_LMS_%') AND empresa_id=6;

DELETE FROM qualificacoes_historico WHERE id IN (SELECT id FROM qualificacoes_historico WHERE empresa_id=6 AND funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id=6 AND id BETWEEN 194 AND 221 AND matricula LIKE 'QA-LMS-%' AND matricula <> 'QA-LMS-202611' AND nome LIKE 'AIRTRUST_QA_LMS_%')) AND empresa_id=6;

DELETE FROM lms_matricula_ciclos WHERE id IN (SELECT id FROM lms_matricula_ciclos WHERE empresa_id=6 AND funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id=6 AND id BETWEEN 194 AND 221 AND matricula LIKE 'QA-LMS-%' AND matricula <> 'QA-LMS-202611' AND nome LIKE 'AIRTRUST_QA_LMS_%')) AND empresa_id=6;

DELETE FROM lms_matriculas WHERE id IN (SELECT id FROM lms_matriculas WHERE empresa_id=6 AND funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id=6 AND id BETWEEN 194 AND 221 AND matricula LIKE 'QA-LMS-%' AND matricula <> 'QA-LMS-202611' AND nome LIKE 'AIRTRUST_QA_LMS_%')) AND empresa_id=6;

DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM usuarios WHERE id BETWEEN 162 AND 189 AND funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id=6 AND id BETWEEN 194 AND 221 AND matricula LIKE 'QA-LMS-%' AND matricula <> 'QA-LMS-202611' AND nome LIKE 'AIRTRUST_QA_LMS_%') AND email LIKE 'qa.lms.%@airtrust.online');

DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM usuarios WHERE id BETWEEN 162 AND 189 AND funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id=6 AND id BETWEEN 194 AND 221 AND matricula LIKE 'QA-LMS-%' AND matricula <> 'QA-LMS-202611' AND nome LIKE 'AIRTRUST_QA_LMS_%') AND email LIKE 'qa.lms.%@airtrust.online');

DELETE FROM convites_usuarios WHERE usuario_id IN (SELECT id FROM usuarios WHERE id BETWEEN 162 AND 189 AND funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id=6 AND id BETWEEN 194 AND 221 AND matricula LIKE 'QA-LMS-%' AND matricula <> 'QA-LMS-202611' AND nome LIKE 'AIRTRUST_QA_LMS_%') AND email LIKE 'qa.lms.%@airtrust.online') AND empresa_id=6;

DELETE FROM usuarios_empresas_perfis WHERE usuario_id IN (SELECT id FROM usuarios WHERE id BETWEEN 162 AND 189 AND funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id=6 AND id BETWEEN 194 AND 221 AND matricula LIKE 'QA-LMS-%' AND matricula <> 'QA-LMS-202611' AND nome LIKE 'AIRTRUST_QA_LMS_%') AND email LIKE 'qa.lms.%@airtrust.online') AND empresa_id=6;

DELETE FROM usuarios_empresas WHERE usuario_id IN (SELECT id FROM usuarios WHERE id BETWEEN 162 AND 189 AND funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id=6 AND id BETWEEN 194 AND 221 AND matricula LIKE 'QA-LMS-%' AND matricula <> 'QA-LMS-202611' AND nome LIKE 'AIRTRUST_QA_LMS_%') AND email LIKE 'qa.lms.%@airtrust.online') AND empresa_id=6;

DELETE FROM usuarios WHERE id IN (SELECT id FROM usuarios WHERE id BETWEEN 162 AND 189 AND funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id=6 AND id BETWEEN 194 AND 221 AND matricula LIKE 'QA-LMS-%' AND matricula <> 'QA-LMS-202611' AND nome LIKE 'AIRTRUST_QA_LMS_%') AND email LIKE 'qa.lms.%@airtrust.online') AND funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id=6 AND id BETWEEN 194 AND 221 AND matricula LIKE 'QA-LMS-%' AND matricula <> 'QA-LMS-202611' AND nome LIKE 'AIRTRUST_QA_LMS_%');

DELETE FROM funcionarios WHERE id IN (SELECT id FROM funcionarios WHERE empresa_id=6 AND id BETWEEN 194 AND 221 AND matricula LIKE 'QA-LMS-%' AND matricula <> 'QA-LMS-202611' AND nome LIKE 'AIRTRUST_QA_LMS_%') AND empresa_id=6;
