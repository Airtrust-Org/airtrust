-- ============================================================
-- Seed 0213: FRMS Limites regulatórios da empresa
-- Valores mais restritivos que RBAC 135 padrão
-- ============================================================

INSERT OR IGNORE INTO frms_configuracao_limites (id, nome, valor_numerico, unidade, descricao, ativo, created_at, updated_at)
VALUES
  ('lim_fdp_max', 'FDP_MAXIMO_HORAS', 11.0, 'HORAS', 'Flight Duty Period máximo por jornada', 1, datetime('now'), datetime('now')),
  ('lim_repouso_min', 'REPOUSO_MINIMO_HORAS', 12.0, 'HORAS', 'Repouso mínimo entre jornadas', 1, datetime('now'), datetime('now')),
  ('lim_hv_7d', 'HV_7_DIAS_HORAS', 45.0, 'HORAS', 'Horas de voo máximas em 7 dias corridos', 1, datetime('now'), datetime('now')),
  ('lim_hv_mes', 'HV_MES_HORAS', 90.0, 'HORAS', 'Horas de voo máximas no mês calendário', 1, datetime('now'), datetime('now')),
  ('lim_hv_365d', 'HV_365_DIAS_HORAS', 960.0, 'HORAS', 'Horas de voo máximas em 365 dias', 1, datetime('now'), datetime('now')),
  ('lim_hv_dia', 'HV_DIARIA_HORAS', 8.0, 'HORAS', 'Limite diário de horas de voo', 1, datetime('now'), datetime('now')),
  ('lim_alerta_aviso', 'ALERTA_AVISO_PCT', 80.0, 'PERCENTUAL', 'Percentual para nível AVISO', 1, datetime('now'), datetime('now')),
  ('lim_alerta_atencao', 'ALERTA_ATENCAO_PCT', 90.0, 'PERCENTUAL', 'Percentual para nível ATENÇÃO', 1, datetime('now'), datetime('now')),
  ('lim_alerta_critico', 'ALERTA_CRITICO_PCT', 95.0, 'PERCENTUAL', 'Percentual para nível CRÍTICO (bloqueia lançamento)', 1, datetime('now'), datetime('now')),
  ('lim_alerta_violacao', 'ALERTA_VIOLACAO_PCT', 100.0, 'PERCENTUAL', 'Percentual para nível VIOLAÇÃO', 1, datetime('now'), datetime('now')),
  ('lim_fdp_alerta_horas', 'FDP_ALERTA_RESTANTE_HORAS', 3.0, 'HORAS', 'Alertar quando restarem X horas para FDP máximo', 1, datetime('now'), datetime('now')),
  ('lim_hv_dia_alerta', 'HV_DIA_ALERTA_RESTANTE_HORAS', 2.0, 'HORAS', 'Alertar quando restarem X horas para HV diária máxima', 1, datetime('now'), datetime('now')),
  ('lim_repouso_plat_min', 'REPOUSO_PLATAFORMA_MINIMO_HORAS', 3.0, 'HORAS', 'Duração mínima para repouso em plataforma contar como interrupção', 1, datetime('now'), datetime('now')),
  ('lim_repouso_plat_max', 'REPOUSO_PLATAFORMA_MAXIMO_HORAS', 6.0, 'HORAS', 'Duração máxima para repouso em plataforma contar como interrupção', 1, datetime('now'), datetime('now'));
