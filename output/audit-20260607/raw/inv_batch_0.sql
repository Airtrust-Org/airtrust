SELECT 'aeronaves' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM aeronaves
UNION ALL
SELECT 'alertas_whatsapp_delivery' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM alertas_whatsapp_delivery
UNION ALL
SELECT 'arquivos' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM arquivos
UNION ALL
SELECT 'audit_events_v2' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM audit_events_v2
UNION ALL
SELECT 'audit_logs' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM audit_logs
UNION ALL
SELECT 'bkp_qual_historico_20260325' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM bkp_qual_historico_20260325
UNION ALL
SELECT 'bkp_qual_tipos_20260325' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM bkp_qual_tipos_20260325
UNION ALL
SELECT 'certificados_templates' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM certificados_templates
UNION ALL
SELECT 'convites_usuarios' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM convites_usuarios
UNION ALL
SELECT 'documentos' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM documentos
UNION ALL
SELECT 'domain_events' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM domain_events
UNION ALL
SELECT 'empresa_certificado_config' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM empresa_certificado_config
UNION ALL
SELECT 'empresa_config' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM empresa_config
UNION ALL
SELECT 'empresas_config' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, 0 sd, COUNT(*) total FROM empresas_config
UNION ALL
SELECT 'escala_alertas' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM escala_alertas
UNION ALL
SELECT 'escala_publicacao_snapshots' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM escala_publicacao_snapshots
UNION ALL
SELECT 'escala_voo_diaria' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM escala_voo_diaria
UNION ALL
SELECT 'escala_voo_diaria_justificativas' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM escala_voo_diaria_justificativas
UNION ALL
SELECT 'escala_voo_diaria_publicacoes' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM escala_voo_diaria_publicacoes
UNION ALL
SELECT 'escalas_mensais' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM escalas_mensais
UNION ALL
SELECT 'escalas_quinzenas' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM escalas_quinzenas
UNION ALL
SELECT 'escalas_templates_tripulacao' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM escalas_templates_tripulacao
UNION ALL
SELECT 'escalas_tipos_evento_config' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM escalas_tipos_evento_config
UNION ALL
SELECT 'fichas_sessao' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM fichas_sessao
UNION ALL
SELECT 'fichas_sessao_edicoes' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM fichas_sessao_edicoes
UNION ALL
SELECT 'frms_carga_trabalho' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM frms_carga_trabalho
UNION ALL
SELECT 'frms_explicacao_dia_cache' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM frms_explicacao_dia_cache
UNION ALL
SELECT 'frms_fadiga_avaliacao_gestor' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM frms_fadiga_avaliacao_gestor
UNION ALL
SELECT 'frms_fadiga_checkin' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM frms_fadiga_checkin
UNION ALL
SELECT 'frms_fadiga_config_empresa' tbl, SUM(empresa_id=1) e1, SUM(empresa_id=6) e6, SUM(empresa_id NOT IN(1,6) AND empresa_id IS NOT NULL) outros, SUM(empresa_id IS NULL) semt, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) sd, COUNT(*) total FROM frms_fadiga_config_empresa;