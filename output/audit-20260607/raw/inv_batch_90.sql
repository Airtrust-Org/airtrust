SELECT 'sgso_frat_respostas' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM sgso_frat_respostas
UNION ALL
SELECT 'sgso_licoes_aprendidas' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM sgso_licoes_aprendidas
UNION ALL
SELECT 'sgso_matriz_risco_perfis' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM sgso_matriz_risco_perfis
UNION ALL
SELECT 'sgso_moc_aprovacoes' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM sgso_moc_aprovacoes
UNION ALL
SELECT 'sgso_moc_registros' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM sgso_moc_registros
UNION ALL
SELECT 'sgso_nao_conformidades' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM sgso_nao_conformidades
UNION ALL
SELECT 'sgso_perigos' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM sgso_perigos
UNION ALL
SELECT 'sgso_protocolo_sequencia' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM sgso_protocolo_sequencia
UNION ALL
SELECT 'sgso_relato_capturas' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM sgso_relato_capturas
UNION ALL
SELECT 'sgso_relato_ia_triagem' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM sgso_relato_ia_triagem
UNION ALL
SELECT 'sgso_relato_notificacoes' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM sgso_relato_notificacoes
UNION ALL
SELECT 'sgso_relato_perigos' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM sgso_relato_perigos
UNION ALL
SELECT 'sgso_relato_privacidade' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM sgso_relato_privacidade
UNION ALL
SELECT 'sgso_relato_workflow_eventos' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM sgso_relato_workflow_eventos
UNION ALL
SELECT 'sgso_relatos' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM sgso_relatos
UNION ALL
SELECT 'sgso_relatos_arquivos' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM sgso_relatos_arquivos
UNION ALL
SELECT 'sgso_relatos_comentarios' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM sgso_relatos_comentarios
UNION ALL
SELECT 'sgso_relatos_fatores_humanos' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM sgso_relatos_fatores_humanos
UNION ALL
SELECT 'sgso_relatos_historico_status' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM sgso_relatos_historico_status
UNION ALL
SELECT 'sgso_relatos_midias_metadados' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM sgso_relatos_midias_metadados
UNION ALL
SELECT 'sgso_sla_config' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM sgso_sla_config
UNION ALL
SELECT 'sgso_spi_config' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM sgso_spi_config
UNION ALL
SELECT 'sigvoos_mapeamento_manual' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM sigvoos_mapeamento_manual
UNION ALL
SELECT 'simulador_agendamentos' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM simulador_agendamentos
UNION ALL
SELECT 'solicitacoes_treinamento' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM solicitacoes_treinamento
UNION ALL
SELECT 'support_access_grants' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM support_access_grants
UNION ALL
SELECT 'support_access_sessions' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM support_access_sessions
UNION ALL
SELECT 'tipos_sessao' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM tipos_sessao
UNION ALL
SELECT 'treinamentos_convocacoes_email' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM treinamentos_convocacoes_email
UNION ALL
SELECT 'treinamentos_dias' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM treinamentos_dias;