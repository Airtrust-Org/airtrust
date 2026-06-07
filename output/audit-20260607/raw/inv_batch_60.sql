SELECT 'modelos_sessao' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM modelos_sessao
UNION ALL
SELECT 'notificacoes_convocacao_cc_gestores' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM notificacoes_convocacao_cc_gestores
UNION ALL
SELECT 'notificacoes_convocacao_email_config' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM notificacoes_convocacao_email_config
UNION ALL
SELECT 'notificacoes_inapp' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM notificacoes_inapp
UNION ALL
SELECT 'padroes_escala' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM padroes_escala
UNION ALL
SELECT 'pasta_virtual' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM pasta_virtual
UNION ALL
SELECT 'pasta_virtual_jobs' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM pasta_virtual_jobs
UNION ALL
SELECT 'perfis_permissoes' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM perfis_permissoes
UNION ALL
SELECT 'qualificacoes_historico' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM qualificacoes_historico
UNION ALL
SELECT 'qualificacoes_pendencias' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM qualificacoes_pendencias
UNION ALL
SELECT 'qualificacoes_tipos' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM qualificacoes_tipos
UNION ALL
SELECT 'requisitos_compliance' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM requisitos_compliance
UNION ALL
SELECT 'restricoes_tripulacao' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM restricoes_tripulacao
UNION ALL
SELECT 'setores' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM setores
UNION ALL
SELECT 'setores_gestores' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM setores_gestores
UNION ALL
SELECT 'sgso_acoes_mitigacao' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM sgso_acoes_mitigacao
UNION ALL
SELECT 'sgso_audit_trail' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM sgso_audit_trail
UNION ALL
SELECT 'sgso_auditoria_itens' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM sgso_auditoria_itens
UNION ALL
SELECT 'sgso_auditorias' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM sgso_auditorias
UNION ALL
SELECT 'sgso_avaliacao_risco' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM sgso_avaliacao_risco
UNION ALL
SELECT 'sgso_avaliacao_risco_contexto' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM sgso_avaliacao_risco_contexto
UNION ALL
SELECT 'sgso_bowtie_barreira_historico' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM sgso_bowtie_barreira_historico
UNION ALL
SELECT 'sgso_bowtie_barreira_vinculos' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM sgso_bowtie_barreira_vinculos
UNION ALL
SELECT 'sgso_bowtie_barreiras' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM sgso_bowtie_barreiras
UNION ALL
SELECT 'sgso_bowtie_cenarios' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM sgso_bowtie_cenarios
UNION ALL
SELECT 'sgso_bowtie_nos' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM sgso_bowtie_nos
UNION ALL
SELECT 'sgso_frat_aprovacoes' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM sgso_frat_aprovacoes
UNION ALL
SELECT 'sgso_frat_avaliacoes' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM sgso_frat_avaliacoes
UNION ALL
SELECT 'sgso_frat_fatores' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM sgso_frat_fatores
UNION ALL
SELECT 'sgso_frat_modelos' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM sgso_frat_modelos;