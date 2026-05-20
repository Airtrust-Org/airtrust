-- ============================================================
-- Migration 0214: FRMS Scientific Evolution
-- Renomeia pct_limite_28d → pct_limite_mes_calendario
-- Adiciona fator_ciclo_embarcado_pct à fatorização
-- Cria tabela frms_notificacao_destinatario
-- Insere 35 novos parâmetros de configuração científica
-- ============================================================

-- ─── 1. RENAME pct_limite_28d → pct_limite_mes_calendario ────────
-- SQLite não suporta RENAME COLUMN antes da versão 3.25.
-- Abordagem segura: ALTER TABLE ADD + copiar + zero default.
ALTER TABLE frms_acumulo_rolling ADD COLUMN pct_limite_mes_calendario REAL DEFAULT 0;
UPDATE frms_acumulo_rolling SET pct_limite_mes_calendario = pct_limite_28d WHERE pct_limite_28d != 0;

-- ─── 2. ADD fator_ciclo_embarcado_pct ────────────────────────────
ALTER TABLE frms_fatorizacao_jornada ADD COLUMN fator_ciclo_embarcado_pct REAL DEFAULT 0;

-- ─── 3. CREATE TABLE frms_notificacao_destinatario ───────────────
CREATE TABLE IF NOT EXISTS frms_notificacao_destinatario (
  id TEXT PRIMARY KEY,
  alerta_id TEXT NOT NULL,
  funcionario_id INTEGER NOT NULL,
  cargo TEXT NOT NULL,                -- 'PILOTO', 'GERENTE_OPS', 'SEGURANCA_VOO', 'ADMIN'
  lido INTEGER DEFAULT 0,
  lido_em TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (alerta_id) REFERENCES frms_alerta(id)
);

CREATE INDEX IF NOT EXISTS idx_frms_notif_dest_funcionario ON frms_notificacao_destinatario(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_frms_notif_dest_alerta ON frms_notificacao_destinatario(alerta_id);
CREATE INDEX IF NOT EXISTS idx_frms_notif_dest_lido ON frms_notificacao_destinatario(lido);

-- ─── 4. Configuração de quem recebe notificação por cargo ────────
CREATE TABLE IF NOT EXISTS frms_notificacao_config (
  id TEXT PRIMARY KEY,
  cargo TEXT NOT NULL UNIQUE,          -- 'PILOTO', 'GERENTE_OPS', 'SEGURANCA_VOO', 'ADMIN'
  nivel_minimo TEXT NOT NULL,          -- 'AVISO', 'ATENCAO', 'CRITICO', 'VIOLACAO'
  ativo INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO frms_notificacao_config (id, cargo, nivel_minimo, ativo) VALUES
  ('notif_cfg_piloto',       'PILOTO',          'CRITICO',  1),
  ('notif_cfg_gerente_ops',  'GERENTE_OPS',     'ATENCAO',  1),
  ('notif_cfg_seg_voo',      'SEGURANCA_VOO',   'AVISO',    1),
  ('notif_cfg_admin',        'ADMIN',           'VIOLACAO',  1);

-- ─── 5. INSERT 35 novos parâmetros de configuração científica ────
-- Grupo: Fator Ciclo Embarcado
INSERT OR IGNORE INTO frms_configuracao_limites (id, nome, valor_numerico, unidade, descricao, ativo) VALUES
  ('cfg_ciclo_emb_dia_inicio',    'CICLO_EMBARCADO_DIA_INICIO',     1,    'dia',   'Dia do ciclo a partir do qual o fator ciclo embarcado começa', 1),
  ('cfg_ciclo_emb_dia_max',       'CICLO_EMBARCADO_DIA_MAX',       15,    'dia',   'Dia do ciclo em que o fator ciclo embarcado atinge o máximo',   1),
  ('cfg_ciclo_emb_pct_min',       'CICLO_EMBARCADO_PCT_MIN',        0,    '%',     'Fator ciclo embarcado mínimo (dia 1)',                        1),
  ('cfg_ciclo_emb_pct_max',       'CICLO_EMBARCADO_PCT_MAX',      0.15,   '%',     'Fator ciclo embarcado máximo (dia 15+)',                      1),
  ('cfg_ciclo_emb_ativo',         'CICLO_EMBARCADO_ATIVO',          1,    'bool',  'Se o fator ciclo embarcado está habilitado',                   1);

-- Grupo: Fator Apresentação
INSERT OR IGNORE INTO frms_configuracao_limites (id, nome, valor_numerico, unidade, descricao, ativo) VALUES
  ('cfg_apr_madrugada_h_min',     'APRESENTACAO_MADRUGADA_H_MIN',   0,    'hora',  'Hora mínima faixa madrugada',                                 1),
  ('cfg_apr_madrugada_h_max',     'APRESENTACAO_MADRUGADA_H_MAX',   4,    'hora',  'Hora máxima faixa madrugada',                                 1),
  ('cfg_apr_madrugada_fator',     'APRESENTACAO_MADRUGADA_FATOR', -0.2,   '%',     'Fator para apresentação na madrugada (0h–4h59)',              1),
  ('cfg_apr_amanhecer_h_min',     'APRESENTACAO_AMANHECER_H_MIN',   5,    'hora',  'Hora mínima faixa amanhecer',                                 1),
  ('cfg_apr_amanhecer_h_max',     'APRESENTACAO_AMANHECER_H_MAX',   6,    'hora',  'Hora máxima faixa amanhecer',                                 1),
  ('cfg_apr_amanhecer_fator',     'APRESENTACAO_AMANHECER_FATOR',  0.1,   '%',     'Fator para apresentação no amanhecer (5h–6h59)',              1),
  ('cfg_apr_diurno_h_min',        'APRESENTACAO_DIURNO_H_MIN',      7,    'hora',  'Hora mínima faixa diurna',                                    1),
  ('cfg_apr_diurno_h_max',        'APRESENTACAO_DIURNO_H_MAX',     11,    'hora',  'Hora máxima faixa diurna',                                    1),
  ('cfg_apr_diurno_fator',        'APRESENTACAO_DIURNO_FATOR',      0,    '%',     'Fator para apresentação diurna (7h–11h59)',                   1),
  ('cfg_apr_tarde_h_min',         'APRESENTACAO_TARDE_H_MIN',      12,    'hora',  'Hora mínima faixa tarde',                                     1),
  ('cfg_apr_tarde_h_max',         'APRESENTACAO_TARDE_H_MAX',      17,    'hora',  'Hora máxima faixa tarde',                                     1),
  ('cfg_apr_tarde_fator',         'APRESENTACAO_TARDE_FATOR',     -0.1,   '%',     'Fator para apresentação à tarde (12h–17h59)',                 1),
  ('cfg_apr_noite_fator',         'APRESENTACAO_NOITE_FATOR',     -0.2,   '%',     'Fator para apresentação à noite (18h–23h59)',                 1);

-- Grupo: Fator Duração
INSERT OR IGNORE INTO frms_configuracao_limites (id, nome, valor_numerico, unidade, descricao, ativo) VALUES
  ('cfg_dur_longa_min',           'DURACAO_LONGA_MINUTOS',        600,    'min',   'Jornada acima deste valor é "longa"',                         1),
  ('cfg_dur_longa_fator',         'DURACAO_LONGA_FATOR',         -0.1,    '%',     'Fator para jornada longa',                                    1),
  ('cfg_dur_curta_min',           'DURACAO_CURTA_MINUTOS',        360,    'min',   'Jornada abaixo deste valor é "curta"',                        1),
  ('cfg_dur_curta_fator',         'DURACAO_CURTA_FATOR',         -0.1,    '%',     'Fator para jornada curta',                                    1),
  ('cfg_dur_normal_fator',        'DURACAO_NORMAL_FATOR',          0,     '%',     'Fator para jornada normal (6h–10h)',                          1);

-- Grupo: Fator Repouso
INSERT OR IGNORE INTO frms_configuracao_limites (id, nome, valor_numerico, unidade, descricao, ativo) VALUES
  ('cfg_rep_adequado_min',        'REPOUSO_ADEQUADO_MINUTOS',     720,    'min',   'Repouso >= 12h = adequado',                                   1),
  ('cfg_rep_adequado_fator',      'REPOUSO_ADEQUADO_FATOR',        0,     '%',     'Fator para repouso adequado (>= 12h)',                        1),
  ('cfg_rep_ruim_min',            'REPOUSO_RUIM_MINUTOS',         480,    'min',   'Repouso >= 8h = ruim',                                       1),
  ('cfg_rep_ruim_fator',          'REPOUSO_RUIM_FATOR',          -0.1,    '%',     'Fator para repouso ruim (8h–11h59)',                          1),
  ('cfg_rep_critico_fator',       'REPOUSO_CRITICO_FATOR',       -0.2,    '%',     'Fator para repouso crítico (< 8h)',                           1);

-- Grupo: Noturno
INSERT OR IGNORE INTO frms_configuracao_limites (id, nome, valor_numerico, unidade, descricao, ativo) VALUES
  ('cfg_noturno_inicio_hora',     'NOTURNO_INICIO_HORA',          22,     'hora',  'Início da faixa noturna (WOCL)',                              1),
  ('cfg_noturno_fim_hora',        'NOTURNO_FIM_HORA',              5,     'hora',  'Fim da faixa noturna (WOCL)',                                 1),
  ('cfg_noturno_fator',           'NOTURNO_FATOR',               0.1,     '%',     'Fator para operação noturna (dep ou arr)',                     1);

-- Grupo: Fator HV Quantidade
INSERT OR IGNORE INTO frms_configuracao_limites (id, nome, valor_numerico, unidade, descricao, ativo) VALUES
  ('cfg_hv_muitas_min',           'HV_MUITAS_MINUTOS',           300,     'min',   'HV >= 5h = muitas HV',                                       1),
  ('cfg_hv_muitas_fator',         'HV_MUITAS_FATOR',             0.1,     '%',     'Fator para muitas HV (>= 5h)',                                1),
  ('cfg_hv_poucas_min',           'HV_POUCAS_MINUTOS',           120,     'min',   'HV < 2h = poucas HV',                                        1),
  ('cfg_hv_poucas_fator',         'HV_POUCAS_FATOR',            -0.1,     '%',     'Fator para poucas HV (< 2h)',                                 1),
  ('cfg_hv_normal_fator',         'HV_NORMAL_FATOR',              0,      '%',     'Fator para HV normal (2h–4h59)',                              1);
