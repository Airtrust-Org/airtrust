-- ============================================================
-- Migration: 0281_sgso_relprev_bowtie_frat.sql
-- Modulo: SGSO Next-Gen - RELPREV, Bowtie, Matriz de Risco e FRAT
-- Descricao: Expande o SGSO existente com intake offline-first,
--            privacidade Just Culture, triagem por IA, registro
--            de perigos, bowtie/barreiras, matriz configuravel,
--            FRAT operacional e feedback loop auditavel.
-- Autor: AirTrust Engineering
-- Data: 2026-03-15
-- Dependencias: 0271, 0272, 0273 e 0274
-- ============================================================

-- ------------------------------------------------------------
-- Intake RELPREV / ASR com suporte a sincronizacao offline-first
-- Mantem o relato principal em sgso_relatos e concentra aqui a
-- telemetria de captura, idempotencia e reconciliacao de sync.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sgso_relato_capturas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relato_id TEXT NOT NULL,
  empresa_id INTEGER NOT NULL,

  client_submission_id TEXT NOT NULL,
  canal_origem TEXT NOT NULL CHECK (canal_origem IN (
    'WEB',
    'MOBILE',
    'TABLET',
    'API',
    'IMPORTACAO'
  )),
  sync_status TEXT NOT NULL DEFAULT 'RECEBIDO' CHECK (sync_status IN (
    'RECEBIDO',
    'PROCESSADO',
    'CONCILIADO',
    'REJEITADO'
  )),
  sync_tentativas INTEGER NOT NULL DEFAULT 0,
  offline_capturado_em TEXT,
  sincronizado_em TEXT,

  -- Friccao zero: espelho dos campos essenciais capturados primeiro
  o_que_resumo TEXT NOT NULL,
  onde_resumo TEXT NOT NULL,
  quando_resumo TEXT NOT NULL,
  timezone_offset_minutos INTEGER,

  -- Metadados operacionais e geolocalizacao da captura
  dispositivo_id TEXT,
  dispositivo_tipo TEXT,
  app_versao TEXT,
  latitude REAL,
  longitude REAL,
  precisao_metros REAL,
  metadata_json TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(empresa_id, client_submission_id),
  UNIQUE(relato_id)
);

CREATE INDEX IF NOT EXISTS idx_sgso_capturas_relato ON sgso_relato_capturas(relato_id);
CREATE INDEX IF NOT EXISTS idx_sgso_capturas_empresa_status ON sgso_relato_capturas(empresa_id, sync_status);
CREATE INDEX IF NOT EXISTS idx_sgso_capturas_sync_em ON sgso_relato_capturas(sincronizado_em);

-- ------------------------------------------------------------
-- Protecao Just Culture: payload sensivel protegido em nivel de
-- campo. O backend deve armazenar ciphertext/nonce e nunca texto
-- puro do relator nestas colunas.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sgso_relato_privacidade (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relato_id TEXT NOT NULL,
  empresa_id INTEGER NOT NULL,

  modo_sigilo TEXT NOT NULL DEFAULT 'CONFIDENCIAL' CHECK (modo_sigilo IN (
    'IDENTIFICADO',
    'CONFIDENCIAL',
    'ANONIMIZADO'
  )),
  consentimento_contato INTEGER NOT NULL DEFAULT 0 CHECK (consentimento_contato IN (0, 1)),

  relator_ciphertext TEXT,
  relator_nonce TEXT,
  relator_hash_busca TEXT,
  contato_ciphertext TEXT,
  contato_nonce TEXT,
  chave_versao TEXT,
  politica_acesso_json TEXT,

  ultimo_acesso_em TEXT,
  ultimo_acesso_por INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(relato_id)
);

CREATE INDEX IF NOT EXISTS idx_sgso_privacidade_empresa ON sgso_relato_privacidade(empresa_id, modo_sigilo);
CREATE INDEX IF NOT EXISTS idx_sgso_privacidade_relator_hash ON sgso_relato_privacidade(relator_hash_busca);

-- ------------------------------------------------------------
-- Evidencias multimidia com geotagging e metadados de origem.
-- Complementa sgso_relatos_arquivos sem quebrar o schema atual.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sgso_relatos_midias_metadados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  arquivo_id INTEGER NOT NULL,
  relato_id TEXT NOT NULL,
  empresa_id INTEGER NOT NULL,

  geotag_latitude REAL,
  geotag_longitude REAL,
  geotag_precisao_metros REAL,
  capturado_em TEXT,
  origem_dispositivo TEXT,
  hash_arquivo TEXT,
  metadados_exif_json TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(arquivo_id)
);

CREATE INDEX IF NOT EXISTS idx_sgso_midias_relato ON sgso_relatos_midias_metadados(relato_id);
CREATE INDEX IF NOT EXISTS idx_sgso_midias_geo ON sgso_relatos_midias_metadados(geotag_latitude, geotag_longitude);

-- ------------------------------------------------------------
-- Triagem por IA: clareza, taxonomia ADREP/ECCAIRS 2 e busca
-- semantica de casos similares/tendencias.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sgso_relato_ia_triagem (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relato_id TEXT NOT NULL,
  empresa_id INTEGER NOT NULL,

  provedor_modelo TEXT,
  nome_modelo TEXT,
  prompt_versao TEXT,

  clareza_status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (clareza_status IN (
    'PENDENTE',
    'APROVADO',
    'REVISAO_MANUAL',
    'REJEITADO'
  )),
  clareza_score REAL,
  resumo_normalizado TEXT,
  recomendacao_reescrita TEXT,

  adrep_codigo_sugerido TEXT,
  adrep_confianca REAL,
  eccairs2_codigo_sugerido TEXT,
  eccairs2_confianca REAL,
  taxonomia_json TEXT,

  fingerprint_semantico TEXT,
  cluster_tendencia TEXT,
  casos_similares_qtd INTEGER DEFAULT 0,
  casos_similares_json TEXT,
  sinal_tendencia TEXT CHECK (sinal_tendencia IN (
    'SEM_SINAL',
    'EM_OBSERVACAO',
    'TENDENCIA',
    'SURTO'
  )),

  revisado_por INTEGER,
  revisado_em TEXT,
  decisao_final TEXT CHECK (decisao_final IN (
    'ACEITA',
    'AJUSTADA',
    'DESCARTADA'
  )),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(relato_id)
);

CREATE INDEX IF NOT EXISTS idx_sgso_ia_relato ON sgso_relato_ia_triagem(relato_id);
CREATE INDEX IF NOT EXISTS idx_sgso_ia_empresa_status ON sgso_relato_ia_triagem(empresa_id, clareza_status);
CREATE INDEX IF NOT EXISTS idx_sgso_ia_tendencia ON sgso_relato_ia_triagem(cluster_tendencia, sinal_tendencia);

-- ------------------------------------------------------------
-- Registro mestre de perigos. Um relato pode gerar ou reforcar um
-- perigo recorrente. Permite consolidacao e bowtie por hazard.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sgso_perigos (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  categoria_principal TEXT,
  fonte_principal TEXT CHECK (fonte_principal IN (
    'RELPREV',
    'AUDITORIA',
    'FRAT',
    'SPI',
    'MANUAL'
  )),
  status TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN (
    'ATIVO',
    'EM_MONITORAMENTO',
    'MITIGADO',
    'ARQUIVADO'
  )),
  responsavel_id INTEGER,
  primeira_ocorrencia_em TEXT,
  ultima_ocorrencia_em TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,

  UNIQUE(empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_sgso_perigos_empresa_status ON sgso_perigos(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_sgso_perigos_categoria ON sgso_perigos(categoria_principal, empresa_id);

CREATE TABLE IF NOT EXISTS sgso_relato_perigos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relato_id TEXT NOT NULL,
  perigo_id TEXT NOT NULL,
  empresa_id INTEGER NOT NULL,
  origem_vinculo TEXT NOT NULL DEFAULT 'MANUAL' CHECK (origem_vinculo IN (
    'MANUAL',
    'IA',
    'REGRA',
    'AUDITORIA'
  )),
  confianca REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(relato_id, perigo_id)
);

CREATE INDEX IF NOT EXISTS idx_sgso_relato_perigos_relato ON sgso_relato_perigos(relato_id);
CREATE INDEX IF NOT EXISTS idx_sgso_relato_perigos_perigo ON sgso_relato_perigos(perigo_id);

-- ------------------------------------------------------------
-- Bowtie dinamico: cenario, ameacas/consequencias e barreiras.
-- Barreira pode ser degradada automaticamente por auditoria/NC.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sgso_bowtie_cenarios (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  perigo_id TEXT NOT NULL,
  codigo TEXT NOT NULL,
  evento_central TEXT NOT NULL,
  descricao TEXT,
  perfil_matriz_id INTEGER,
  owner_id INTEGER,
  status TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN (
    'ATIVO',
    'EM_REVISAO',
    'ARQUIVADO'
  )),
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,

  UNIQUE(empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_sgso_bowtie_cenarios_perigo ON sgso_bowtie_cenarios(perigo_id);
CREATE INDEX IF NOT EXISTS idx_sgso_bowtie_cenarios_empresa_status ON sgso_bowtie_cenarios(empresa_id, status);

CREATE TABLE IF NOT EXISTS sgso_bowtie_nos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cenario_id TEXT NOT NULL,
  empresa_id INTEGER NOT NULL,
  tipo_no TEXT NOT NULL CHECK (tipo_no IN (
    'AMEACA',
    'CONSEQUENCIA'
  )),
  codigo TEXT,
  titulo TEXT NOT NULL,
  descricao TEXT,
  ordem_exibicao INTEGER DEFAULT 0,
  origem_relato_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,

  UNIQUE(cenario_id, tipo_no, codigo)
);

CREATE INDEX IF NOT EXISTS idx_sgso_bowtie_nos_cenario ON sgso_bowtie_nos(cenario_id, tipo_no);

CREATE TABLE IF NOT EXISTS sgso_bowtie_barreiras (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  cenario_id TEXT NOT NULL,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  tipo_barreira TEXT NOT NULL CHECK (tipo_barreira IN (
    'PREVENTIVA',
    'RECUPERACAO'
  )),
  origem_tipo TEXT CHECK (origem_tipo IN (
    'PROCEDIMENTO',
    'TREINAMENTO',
    'AUDITORIA',
    'FRAT',
    'SISTEMA',
    'OUTRO'
  )),
  origem_ref_id TEXT,
  owner_id INTEGER,
  status_saude TEXT NOT NULL DEFAULT 'OPERANTE' CHECK (status_saude IN (
    'OPERANTE',
    'DEGRADADA',
    'INOPERANTE',
    'EM_REVISAO'
  )),
  efetividade_percentual REAL,
  verificado_em TEXT,
  vence_em TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,

  UNIQUE(empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_sgso_barreiras_cenario ON sgso_bowtie_barreiras(cenario_id);
CREATE INDEX IF NOT EXISTS idx_sgso_barreiras_status ON sgso_bowtie_barreiras(status_saude, empresa_id);
CREATE INDEX IF NOT EXISTS idx_sgso_barreiras_origem ON sgso_bowtie_barreiras(origem_tipo, origem_ref_id);

CREATE TABLE IF NOT EXISTS sgso_bowtie_barreira_vinculos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barreira_id TEXT NOT NULL,
  no_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(barreira_id, no_id)
);

CREATE INDEX IF NOT EXISTS idx_sgso_barreira_vinculos_barreira ON sgso_bowtie_barreira_vinculos(barreira_id);
CREATE INDEX IF NOT EXISTS idx_sgso_barreira_vinculos_no ON sgso_bowtie_barreira_vinculos(no_id);

CREATE TABLE IF NOT EXISTS sgso_bowtie_barreira_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barreira_id TEXT NOT NULL,
  empresa_id INTEGER NOT NULL,
  status_anterior TEXT,
  status_novo TEXT NOT NULL CHECK (status_novo IN (
    'OPERANTE',
    'DEGRADADA',
    'INOPERANTE',
    'EM_REVISAO'
  )),
  motivo_tipo TEXT CHECK (motivo_tipo IN (
    'AUDITORIA',
    'NC',
    'ACAO_MITIGACAO',
    'SISTEMA',
    'MANUAL'
  )),
  motivo_ref_id TEXT,
  observacao TEXT,
  alterado_por INTEGER,
  alterado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sgso_barreira_hist_barreira ON sgso_bowtie_barreira_historico(barreira_id, alterado_em);

-- ------------------------------------------------------------
-- Matriz de risco configuravel 5x5. O perfil define a politica e
-- as celulas definem score, nivel e exigencia de aprovacao.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sgso_matriz_risco_perfis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL DEFAULT 0,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  tamanho INTEGER NOT NULL DEFAULT 5 CHECK (tamanho = 5),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  padrao INTEGER NOT NULL DEFAULT 0 CHECK (padrao IN (0, 1)),
  elevar_fadiga INTEGER NOT NULL DEFAULT 1 CHECK (elevar_fadiga IN (0, 1)),
  exigir_aprovacao_alto INTEGER NOT NULL DEFAULT 1 CHECK (exigir_aprovacao_alto IN (0, 1)),
  exigir_aprovacao_critico INTEGER NOT NULL DEFAULT 1 CHECK (exigir_aprovacao_critico IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_sgso_matriz_perfis_empresa ON sgso_matriz_risco_perfis(empresa_id, ativo, padrao);

CREATE TABLE IF NOT EXISTS sgso_matriz_risco_celulas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  perfil_id INTEGER NOT NULL,
  codigo_probabilidade TEXT NOT NULL CHECK (codigo_probabilidade IN ('A', 'B', 'C', 'D', 'E')),
  ordem_probabilidade INTEGER NOT NULL CHECK (ordem_probabilidade BETWEEN 1 AND 5),
  severidade INTEGER NOT NULL CHECK (severidade BETWEEN 1 AND 5),
  score INTEGER NOT NULL,
  nivel_risco TEXT NOT NULL CHECK (nivel_risco IN ('BAIXO', 'MEDIO', 'ALTO', 'CRITICO')),
  token_cor TEXT,
  prazo_resposta_horas INTEGER,
  exige_aprovacao INTEGER NOT NULL DEFAULT 0 CHECK (exige_aprovacao IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(perfil_id, codigo_probabilidade, severidade)
);

CREATE INDEX IF NOT EXISTS idx_sgso_matriz_celulas_perfil ON sgso_matriz_risco_celulas(perfil_id, nivel_risco);

CREATE TABLE IF NOT EXISTS sgso_avaliacao_risco_contexto (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  avaliacao_risco_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  perfil_id INTEGER NOT NULL,
  score_calculado INTEGER NOT NULL,
  apetite_violado INTEGER NOT NULL DEFAULT 0 CHECK (apetite_violado IN (0, 1)),
  exige_aprovacao INTEGER NOT NULL DEFAULT 0 CHECK (exige_aprovacao IN (0, 1)),
  aprovacao_status TEXT NOT NULL DEFAULT 'NAO_APLICAVEL' CHECK (aprovacao_status IN (
    'NAO_APLICAVEL',
    'PENDENTE',
    'APROVADO',
    'REJEITADO'
  )),
  aprovado_por INTEGER,
  aprovado_em TEXT,
  justificativa_aprovacao TEXT,
  snapshot_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(avaliacao_risco_id)
);

CREATE INDEX IF NOT EXISTS idx_sgso_risco_contexto_avaliacao ON sgso_avaliacao_risco_contexto(avaliacao_risco_id);
CREATE INDEX IF NOT EXISTS idx_sgso_risco_contexto_aprovacao ON sgso_avaliacao_risco_contexto(empresa_id, aprovacao_status);

-- ------------------------------------------------------------
-- FRAT operacional: modelos/fatores reutilizaveis e avaliacoes
-- por tripulante/voo/escala com aprovacao obrigatoria para risco
-- alto/critico antes do despacho.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sgso_frat_modelos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL DEFAULT 0,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria_operacao TEXT CHECK (categoria_operacao IN (
    'ASA_FIXA',
    'HELICOPTERO',
    'OFFSHORE',
    'UTI_AEREA',
    'GERAL'
  )),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  exige_aprovacao_risco_alto INTEGER NOT NULL DEFAULT 1 CHECK (exige_aprovacao_risco_alto IN (0, 1)),
  exige_aprovacao_risco_critico INTEGER NOT NULL DEFAULT 1 CHECK (exige_aprovacao_risco_critico IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_sgso_frat_modelos_empresa ON sgso_frat_modelos(empresa_id, ativo);

CREATE TABLE IF NOT EXISTS sgso_frat_fatores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL DEFAULT 0,
  codigo TEXT NOT NULL,
  categoria TEXT NOT NULL,
  pergunta TEXT NOT NULL,
  tipo_resposta TEXT NOT NULL CHECK (tipo_resposta IN (
    'BINARIA',
    'ESCALA',
    'NUMERICA',
    'LISTA'
  )),
  peso_base REAL NOT NULL DEFAULT 1,
  ordem_exibicao INTEGER NOT NULL DEFAULT 0,
  opcoes_json TEXT,
  regra_score_json TEXT,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(modelo_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_sgso_frat_fatores_modelo ON sgso_frat_fatores(modelo_id, ativo);

CREATE TABLE IF NOT EXISTS sgso_frat_avaliacoes (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  modelo_id INTEGER NOT NULL,
  escala_id TEXT,
  alocacao_id INTEGER,
  tripulante_id INTEGER,
  aeronave_id INTEGER,
  data_operacao TEXT NOT NULL,
  score_total REAL NOT NULL DEFAULT 0,
  nivel_risco TEXT NOT NULL CHECK (nivel_risco IN ('BAIXO', 'MEDIO', 'ALTO', 'CRITICO')),
  status TEXT NOT NULL DEFAULT 'RASCUNHO' CHECK (status IN (
    'RASCUNHO',
    'SUBMETIDO',
    'APROVADO',
    'REJEITADO',
    'EXPIRADO'
  )),
  exige_aprovacao INTEGER NOT NULL DEFAULT 0 CHECK (exige_aprovacao IN (0, 1)),
  aprovado_por INTEGER,
  aprovado_em TEXT,
  despacho_bloqueado INTEGER NOT NULL DEFAULT 0 CHECK (despacho_bloqueado IN (0, 1)),
  justificativa TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sgso_frat_avaliacoes_empresa_data ON sgso_frat_avaliacoes(empresa_id, data_operacao);
CREATE INDEX IF NOT EXISTS idx_sgso_frat_avaliacoes_escala ON sgso_frat_avaliacoes(escala_id, tripulante_id);
CREATE INDEX IF NOT EXISTS idx_sgso_frat_avaliacoes_status ON sgso_frat_avaliacoes(status, nivel_risco);

CREATE TABLE IF NOT EXISTS sgso_frat_respostas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  avaliacao_id TEXT NOT NULL,
  fator_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  resposta_texto TEXT,
  resposta_numero REAL,
  score_aplicado REAL NOT NULL DEFAULT 0,
  observacao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(avaliacao_id, fator_id)
);

CREATE INDEX IF NOT EXISTS idx_sgso_frat_respostas_avaliacao ON sgso_frat_respostas(avaliacao_id);

CREATE TABLE IF NOT EXISTS sgso_frat_aprovacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  avaliacao_id TEXT NOT NULL,
  empresa_id INTEGER NOT NULL,
  decisao TEXT NOT NULL CHECK (decisao IN (
    'APROVAR',
    'REJEITAR',
    'SOLICITAR_REVISAO'
  )),
  aprovador_id INTEGER NOT NULL,
  motivo TEXT,
  despacho_liberado INTEGER NOT NULL DEFAULT 0 CHECK (despacho_liberado IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sgso_frat_aprovacoes_avaliacao ON sgso_frat_aprovacoes(avaliacao_id, created_at);

-- ------------------------------------------------------------
-- Feedback loop automatizado ao relator e trilha imutavel para
-- auditoria do fluxo de investigacao.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sgso_relato_workflow_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relato_id TEXT NOT NULL,
  empresa_id INTEGER NOT NULL,
  tipo_evento TEXT NOT NULL CHECK (tipo_evento IN (
    'RECEBIMENTO',
    'TRIAGEM',
    'CLASSIFICACAO_IA',
    'ANALISE_RISCO',
    'PLANO_ACAO',
    'NOTIFICACAO_RELATOR',
    'ESCALONAMENTO',
    'ENCERRAMENTO'
  )),
  status_evento TEXT NOT NULL CHECK (status_evento IN (
    'PENDENTE',
    'EM_PROCESSAMENTO',
    'CONCLUIDO',
    'FALHA'
  )),
  visivel_relator INTEGER NOT NULL DEFAULT 1 CHECK (visivel_relator IN (0, 1)),
  payload_json TEXT,
  ator_id INTEGER,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sgso_workflow_relato ON sgso_relato_workflow_eventos(relato_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_sgso_workflow_empresa_tipo ON sgso_relato_workflow_eventos(empresa_id, tipo_evento, status_evento);

CREATE TABLE IF NOT EXISTS sgso_relato_notificacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relato_id TEXT NOT NULL,
  workflow_evento_id INTEGER,
  empresa_id INTEGER NOT NULL,
  template_codigo TEXT NOT NULL,
  canal TEXT NOT NULL CHECK (canal IN (
    'EMAIL',
    'PUSH',
    'INAPP',
    'WEBHOOK'
  )),
  destino_tipo TEXT NOT NULL CHECK (destino_tipo IN (
    'RELATOR',
    'GSO',
    'GESTOR_OPERACIONAL',
    'SISTEMA'
  )),
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN (
    'PENDENTE',
    'ENVIADA',
    'FALHA',
    'LIDA'
  )),
  referencia_externa TEXT,
  payload_json TEXT,
  enviada_em TEXT,
  lida_em TEXT,
  erro_ultimo_envio TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sgso_notificacoes_relato ON sgso_relato_notificacoes(relato_id, status);
CREATE INDEX IF NOT EXISTS idx_sgso_notificacoes_empresa ON sgso_relato_notificacoes(empresa_id, canal, status);

CREATE TABLE IF NOT EXISTS sgso_audit_trail (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  agregado_tipo TEXT NOT NULL,
  agregado_id TEXT NOT NULL,
  acao TEXT NOT NULL,
  ator_id INTEGER,
  origem TEXT CHECK (origem IN (
    'API',
    'WORKER',
    'CRON',
    'IA',
    'MANUAL'
  )),
  payload_hash TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sgso_audit_trail_agregado ON sgso_audit_trail(agregado_tipo, agregado_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sgso_audit_trail_empresa ON sgso_audit_trail(empresa_id, created_at);

-- ------------------------------------------------------------
-- Seed tecnico minimo para a primeira matriz 5x5 e FRAT base.
-- empresa_id = 0 representa template global clonavel.
-- ------------------------------------------------------------
INSERT OR IGNORE INTO sgso_matriz_risco_perfis
  (empresa_id, codigo, nome, descricao, ativo, padrao, elevar_fadiga, exigir_aprovacao_alto, exigir_aprovacao_critico)
VALUES
  (0, 'ICAO_5X5_DEFAULT', 'Matriz ICAO 5x5 Default', 'Template base para relatos RELPREV e bowtie operacional.', 1, 1, 1, 1, 1);

WITH cell(codigo_probabilidade, ordem_probabilidade, severidade, score, nivel_risco, token_cor, prazo_resposta_horas, exige_aprovacao) AS (
  VALUES
    ('A', 5, 1, 5,  'MEDIO',   'yellow', 72, 0),
    ('A', 5, 2, 10, 'ALTO',    'orange', 24, 1),
    ('A', 5, 3, 15, 'ALTO',    'orange', 12, 1),
    ('A', 5, 4, 20, 'CRITICO', 'red',     4, 1),
    ('A', 5, 5, 25, 'CRITICO', 'red',     1, 1),
    ('B', 4, 1, 4,  'MEDIO',   'yellow', 72, 0),
    ('B', 4, 2, 8,  'MEDIO',   'yellow', 48, 0),
    ('B', 4, 3, 12, 'ALTO',    'orange', 24, 1),
    ('B', 4, 4, 16, 'ALTO',    'orange', 12, 1),
    ('B', 4, 5, 20, 'CRITICO', 'red',     4, 1),
    ('C', 3, 1, 3,  'BAIXO',   'green', 168, 0),
    ('C', 3, 2, 6,  'MEDIO',   'yellow', 72, 0),
    ('C', 3, 3, 9,  'MEDIO',   'yellow', 48, 0),
    ('C', 3, 4, 12, 'ALTO',    'orange', 24, 1),
    ('C', 3, 5, 15, 'ALTO',    'orange', 12, 1),
    ('D', 2, 1, 2,  'BAIXO',   'green', 168, 0),
    ('D', 2, 2, 4,  'MEDIO',   'yellow', 96, 0),
    ('D', 2, 3, 6,  'MEDIO',   'yellow', 72, 0),
    ('D', 2, 4, 8,  'MEDIO',   'yellow', 48, 0),
    ('D', 2, 5, 10, 'ALTO',    'orange', 24, 1),
    ('E', 1, 1, 1,  'BAIXO',   'green', 168, 0),
    ('E', 1, 2, 2,  'BAIXO',   'green', 168, 0),
    ('E', 1, 3, 3,  'BAIXO',   'green', 120, 0),
    ('E', 1, 4, 4,  'MEDIO',   'yellow', 96, 0),
    ('E', 1, 5, 5,  'MEDIO',   'yellow', 72, 0)
)
INSERT OR IGNORE INTO sgso_matriz_risco_celulas
  (perfil_id, codigo_probabilidade, ordem_probabilidade, severidade, score, nivel_risco, token_cor, prazo_resposta_horas, exige_aprovacao)
SELECT perfil.id, cell.codigo_probabilidade, cell.ordem_probabilidade, cell.severidade, cell.score, cell.nivel_risco, cell.token_cor, cell.prazo_resposta_horas, cell.exige_aprovacao
FROM sgso_matriz_risco_perfis perfil
CROSS JOIN cell
WHERE perfil.empresa_id = 0 AND perfil.codigo = 'ICAO_5X5_DEFAULT';

INSERT OR IGNORE INTO sgso_frat_modelos
  (empresa_id, codigo, nome, descricao, categoria_operacao, ativo, exige_aprovacao_risco_alto, exige_aprovacao_risco_critico)
VALUES
  (0, 'FRAT_OFFSHORE_PADRAO', 'FRAT Offshore Padrao', 'Template inicial para operacoes offshore com foco em fadiga, clima, aerodromo e contexto operacional.', 'OFFSHORE', 1, 1, 1);

WITH fator(codigo, categoria, pergunta, tipo_resposta, peso_base, ordem_exibicao, regra_score_json) AS (
  VALUES
    ('FADIGA', 'TRIPULACAO', 'Tripulante reporta fadiga relevante nas ultimas 24h?', 'BINARIA', 3.0, 10, '{"true":3,"false":0}'),
    ('SONO_RESTRITO', 'TRIPULACAO', 'Tripulante dormiu menos de 6 horas nas ultimas 24h?', 'BINARIA', 2.5, 20, '{"true":2.5,"false":0}'),
    ('CLIMA_ADVERSO', 'AMBIENTE', 'Condicoes meteorologicas degradadas para a etapa?', 'LISTA', 2.5, 30, '{"VMC":0,"MARGINAL":1.5,"IMC":2.5,"SEVERO":4}'),
    ('AERODROMO_COMPLEXO', 'AMBIENTE', 'Operacao envolve aerodromo/plataforma com restricao operacional relevante?', 'BINARIA', 2.0, 40, '{"true":2,"false":0}'),
    ('JANELA_OPERACIONAL', 'MISSAO', 'A missao possui pressao operacional ou janela critica de atendimento?', 'BINARIA', 2.0, 50, '{"true":2,"false":0}'),
    ('CRM_TRIPULACAO', 'TRIPULACAO', 'Ha indisponibilidade de membro chave ou CRM degradado?', 'BINARIA', 2.5, 60, '{"true":2.5,"false":0}')
)
INSERT OR IGNORE INTO sgso_frat_fatores
  (modelo_id, empresa_id, codigo, categoria, pergunta, tipo_resposta, peso_base, ordem_exibicao, regra_score_json, ativo)
SELECT modelo.id, 0, fator.codigo, fator.categoria, fator.pergunta, fator.tipo_resposta, fator.peso_base, fator.ordem_exibicao, fator.regra_score_json, 1
FROM sgso_frat_modelos modelo
JOIN fator
WHERE modelo.empresa_id = 0 AND modelo.codigo = 'FRAT_OFFSHORE_PADRAO';