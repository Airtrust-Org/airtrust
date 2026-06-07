SELECT 'frms_fadiga_evento' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM frms_fadiga_evento
UNION ALL
SELECT 'frms_fonte_calculo_competencia' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM frms_fonte_calculo_competencia
UNION ALL
SELECT 'frms_jornada' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM frms_jornada
UNION ALL
SELECT 'frms_jornada_pendente' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM frms_jornada_pendente
UNION ALL
SELECT 'frms_justificativas' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM frms_justificativas
UNION ALL
SELECT 'frms_read_ack_event_audit' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM frms_read_ack_event_audit
UNION ALL
SELECT 'frms_read_ack_events' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM frms_read_ack_events
UNION ALL
SELECT 'funcionarios' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM funcionarios
UNION ALL
SELECT 'funcoes' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM funcoes
UNION ALL
SELECT 'horas_voo_lancamentos' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM horas_voo_lancamentos
UNION ALL
SELECT 'horas_voo_saldo_inicial' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM horas_voo_saldo_inicial
UNION ALL
SELECT 'hospedagem' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM hospedagem
UNION ALL
SELECT 'hospedagem_sugestoes' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM hospedagem_sugestoes
UNION ALL
SELECT 'importacoes_log' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM importacoes_log
UNION ALL
SELECT 'integracoes_edapp_config' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM integracoes_edapp_config
UNION ALL
SELECT 'integracoes_edapp_cursos' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM integracoes_edapp_cursos
UNION ALL
SELECT 'integracoes_edapp_eventos' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM integracoes_edapp_eventos
UNION ALL
SELECT 'integracoes_edapp_usuarios' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM integracoes_edapp_usuarios
UNION ALL
SELECT 'integracoes_sigvoos_config' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM integracoes_sigvoos_config
UNION ALL
SELECT 'integracoes_sigvoos_eventos' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM integracoes_sigvoos_eventos
UNION ALL
SELECT 'integracoes_sigvoos_mapeamentos' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM integracoes_sigvoos_mapeamentos
UNION ALL
SELECT 'lms_cursos' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM lms_cursos
UNION ALL
SELECT 'lms_h5p_conteudos' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM lms_h5p_conteudos
UNION ALL
SELECT 'lms_historico_importado' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM lms_historico_importado
UNION ALL
SELECT 'lms_matricula_ciclos' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM lms_matricula_ciclos
UNION ALL
SELECT 'lms_matriculas' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM lms_matriculas
UNION ALL
SELECT 'lms_progresso_scorm' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM lms_progresso_scorm
UNION ALL
SELECT 'lms_xapi_statements' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM lms_xapi_statements
UNION ALL
SELECT 'matriz_treinamento_funcao' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM matriz_treinamento_funcao
UNION ALL
SELECT 'modelos_aeronave' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM modelos_aeronave;