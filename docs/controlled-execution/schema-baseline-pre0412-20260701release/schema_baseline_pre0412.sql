CREATE TABLE admin_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Quem fez
  user_id INTEGER,
  user_email TEXT,
  
  -- O quê
  action TEXT NOT NULL, -- 'RESET_FUNCIONARIOS', 'RESET_QUALIFICACOES_TIPOS', etc
  module TEXT NOT NULL, -- 'funcionarios', 'qualificacoes_tipos', 'qualificacoes_historico'
  
  -- Resultado
  deleted_count INTEGER DEFAULT 0,
  success BOOLEAN DEFAULT 1,
  error_message TEXT,
  
  -- Metadados
  metadata_json TEXT, -- JSON com informações extras
  ip_address TEXT,
  user_agent TEXT,
  
  -- Timestamp
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  -- Soft delete (para auditoria nunca é apagado)
  deleted_at DATETIME DEFAULT NULL
);

CREATE TABLE "aeronaves" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE NOT NULL,
  modelo TEXT NOT NULL,
  fabricante TEXT,
  prefixo TEXT,
  ano_fabricacao INTEGER,
  status TEXT DEFAULT 'ATIVO',
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  empresa_id INTEGER NOT NULL
);

CREATE TABLE alertas_whatsapp_delivery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER,
  qualificacao_historico_id INTEGER,
  funcionario_id INTEGER,
  provider TEXT NOT NULL,
  provider_message_id TEXT NOT NULL UNIQUE,
  telefone_destino TEXT,
  telefone_origem TEXT,
  status TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  payload_json TEXT,
  accepted_at TEXT,
  delivered_at TEXT,
  failed_at TEXT,
  last_event_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE alertas_whatsapp_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_key TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'twilio',
  friendly_name TEXT NOT NULL,
  template_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'UTILITY',
  language TEXT NOT NULL DEFAULT 'pt_BR',
  body_text TEXT NOT NULL,
  variables_json TEXT NOT NULL,
  twilio_content_sid TEXT,
  approval_status TEXT,
  approval_error TEXT,
  approval_payload_json TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE audit_cascade (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo TEXT NOT NULL, 
  arquivo TEXT, 
  comando TEXT, 
  tempo_ms INTEGER, 
  sucesso INTEGER DEFAULT 1, 
  checksum TEXT, 
  erros INTEGER DEFAULT 0, 
  warnings INTEGER DEFAULT 0, 
  score REAL, 
  detalhes TEXT, 
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE audit_events_v2 (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  empresa_id INTEGER,
  target_empresa_id INTEGER,

  actor_user_id INTEGER,
  actor_empresa_id INTEGER,
  actor_role TEXT,
  actor_type TEXT NOT NULL DEFAULT 'user',

  support_mode INTEGER NOT NULL DEFAULT 0,
  support_reason TEXT,

  request_id TEXT,
  correlation_id TEXT,

  ip_hash TEXT,
  user_agent_hash TEXT,

  event_category TEXT NOT NULL,
  event_action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,

  risk_level TEXT NOT NULL DEFAULT 'low',
  success INTEGER NOT NULL DEFAULT 1,
  failure_reason_code TEXT,

  metadata_sanitized_json TEXT,
  retention_class TEXT NOT NULL DEFAULT 'standard'
);

CREATE TABLE audit_logs ( id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT, entity_type TEXT, entity_id INTEGER, old_values TEXT, new_values TEXT, ip_address TEXT, user_agent TEXT, empresa_id INTEGER, usuario_id INTEGER, acao TEXT, tabela TEXT, registro_id INTEGER, detalhes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT, deleted_at TEXT );

CREATE TABLE auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id TEXT,
  usuario_nome TEXT,
  acao TEXT NOT NULL,
  tabela_afetada TEXT NOT NULL,
  registro_id TEXT,
  dados_antes TEXT,
  dados_depois TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE auditoria_avancada_v2 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tabela TEXT NOT NULL,
          acao TEXT NOT NULL,
          registro_id TEXT NOT NULL,
          dados_anteriores TEXT,
            dados_novos TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        , usuario_id INTEGER, ip_address TEXT, user_agent TEXT, origem TEXT DEFAULT 'system');

CREATE TABLE catalogo_treinamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    descricao TEXT,
    categoria TEXT, -- 'INICIAL', 'RECORRENTE', 'ESPECIAL'
    carga_horaria INTEGER,
    validade_meses INTEGER,
    observacoes TEXT,
    ativo BOOLEAN DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT DEFAULT NULL
, tipo TEXT DEFAULT 'TREINAMENTO');

CREATE TABLE "certificados" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  habilitacao_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  qualificacao_id INTEGER NOT NULL,
  arquivo_url TEXT NOT NULL,
  arquivo_nome TEXT NOT NULL,
  arquivo_tamanho INTEGER,
  arquivo_hash TEXT,
  numero_certificado TEXT UNIQUE NOT NULL,
  tipo TEXT DEFAULT 'upload',
  data_emissao DATE,
  data_vencimento DATE,
  empresa_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME
);

CREATE TABLE certificado_anexos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certificado_id INTEGER NOT NULL,
  nome_arquivo TEXT NOT NULL,
  tipo_arquivo TEXT,
  tamanho INTEGER,
  url TEXT NOT NULL,
  uploaded_at TEXT DEFAULT (datetime('now')),
  uploaded_by TEXT,
  FOREIGN KEY (certificado_id) REFERENCES certificados(id)
);

CREATE TABLE credenciais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Relação
  pessoa_id INTEGER NOT NULL,
  
  -- Tipo de credencial
  tipo TEXT NOT NULL,  -- CPF, CNH, RG, LICENSE_AVIADOR, PASSPORT, OTHER
  
  -- Dados da credencial
  numero TEXT NOT NULL UNIQUE,
  data_emissao TEXT,
  data_validade TEXT,  -- NULL = sem vencimento
  orgao_expedidor TEXT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'ATIVO',  -- ATIVO, EXPIRADO, REVOGADO
  
  -- Auditoria
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  
  -- Constraints
  FOREIGN KEY (pessoa_id) REFERENCES "__backup_pessoas"(id) ON DELETE CASCADE,
  CONSTRAINT check_tipo_valid CHECK (tipo IN ('CPF', 'CNH', 'RG', 'LICENSE_AVIADOR', 'PASSPORT', 'OTHER')),
  CONSTRAINT check_status_valid CHECK (status IN ('ATIVO', 'EXPIRADO', 'REVOGADO'))
);

CREATE TABLE cv_aeroportos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  codigo_icao TEXT,
  codigo_iata TEXT,
  nome TEXT NOT NULL,
  cidade TEXT,
  uf TEXT,
  tipo TEXT NOT NULL DEFAULT 'aeroporto',
  descricao TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (tipo IN ('aeroporto', 'plataforma', 'heliponto')),
  CHECK (ativo IN (0, 1))
);

CREATE TABLE cv_motivos_operacionais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'geral',
  descricao TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (tipo IN ('atraso', 'cancelamento', 'alternado_divergido', 'indisponibilidade', 'geral')),
  CHECK (ativo IN (0, 1))
);

CREATE TABLE cv_naturezas_voo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (ativo IN (0, 1))
);

CREATE TABLE cv_tipos_voo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (ativo IN (0, 1))
);

CREATE TABLE cv_voos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  prefixo TEXT NOT NULL,
  data_programacao TEXT NOT NULL,
  origem_id INTEGER NOT NULL,
  destino_id INTEGER NOT NULL,
  tipo_voo_id INTEGER NOT NULL,
  natureza_voo_id INTEGER NOT NULL,
  aeronave_id INTEGER,
  horario_previsto_partida TEXT NOT NULL,
  horario_previsto_chegada TEXT NOT NULL,
  horario_real_partida TEXT,
  horario_real_chegada TEXT,
  status TEXT NOT NULL DEFAULT 'planejado',
  observacoes TEXT,
  cancelado_motivo_id INTEGER,
  alternado_destino_id INTEGER,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT, sigvoos_flight_report_id INTEGER, sigvoos_flight_report_id_confident INTEGER NOT NULL DEFAULT 0, sigvoos_report_number TEXT, sigvoos_flight_number TEXT, sigvoos_client_name TEXT, sigvoos_contract_name TEXT, sigvoos_importado_em TEXT, sigvoos_content_hash TEXT, origem_importacao TEXT NOT NULL DEFAULT 'MANUAL', campos_editados_json TEXT,
  CHECK (status IN (
    'planejado',
    'liberado_operacionalmente',
    'em_andamento',
    'pousado',
    'concluido_operacionalmente',
    'cancelado',
    'alternado_divergido'
  )),
  CHECK (horario_previsto_chegada >= horario_previsto_partida),
  CHECK (horario_real_chegada IS NULL OR horario_real_partida IS NULL OR horario_real_chegada >= horario_real_partida),
  FOREIGN KEY (origem_id) REFERENCES cv_aeroportos(id),
  FOREIGN KEY (destino_id) REFERENCES cv_aeroportos(id),
  FOREIGN KEY (alternado_destino_id) REFERENCES cv_aeroportos(id),
  FOREIGN KEY (tipo_voo_id) REFERENCES cv_tipos_voo(id),
  FOREIGN KEY (natureza_voo_id) REFERENCES cv_naturezas_voo(id),
  FOREIGN KEY (cancelado_motivo_id) REFERENCES cv_motivos_operacionais(id)
);

CREATE TABLE cv_rdv_operacional (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  voo_id INTEGER NOT NULL,
  numero TEXT NOT NULL,
  data_voo TEXT NOT NULL,
  horario_decolagem_real TEXT,
  horario_pouso_real TEXT,
  horas_voadas REAL,
  numero_pousos INTEGER,
  ciclos INTEGER,
  combustivel_decolagem REAL,
  combustivel_pouso REAL,
  combustivel_consumo REAL,
  pob INTEGER,
  carga_kg REAL,
  ocorrencias TEXT,
  divergencias TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho',
  responsavel_preenchimento_id INTEGER,
  preenchido_em TEXT,
  finalizado_operacionalmente_por INTEGER,
  finalizado_operacionalmente_em TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (status IN ('rascunho', 'preenchimento_finalizado', 'cancelado')),
  CHECK (horario_pouso_real IS NULL OR horario_decolagem_real IS NULL OR horario_pouso_real >= horario_decolagem_real),
  CHECK (horas_voadas IS NULL OR horas_voadas >= 0),
  CHECK (numero_pousos IS NULL OR numero_pousos >= 0),
  CHECK (ciclos IS NULL OR ciclos >= 0),
  CHECK (combustivel_decolagem IS NULL OR combustivel_decolagem >= 0),
  CHECK (combustivel_pouso IS NULL OR combustivel_pouso >= 0),
  CHECK (combustivel_consumo IS NULL OR combustivel_consumo >= 0),
  CHECK (pob IS NULL OR pob >= 0),
  CHECK (carga_kg IS NULL OR carga_kg >= 0),
  FOREIGN KEY (voo_id) REFERENCES cv_voos(id)
);

CREATE TABLE cv_voo_etapas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  voo_id INTEGER NOT NULL,
  numero_etapa INTEGER NOT NULL,
  sigvoos_leg_number INTEGER,
  origem_icao TEXT,
  destino_icao TEXT,
  horario_motor_ligado TEXT,
  horario_decolagem TEXT,
  horario_pouso TEXT,
  horario_motor_desligado TEXT,
  tempo_decolagem_pouso TEXT,
  tempo_total TEXT,
  tempo_navegacao TEXT,
  tempo_ifr TEXT,
  tempo_noturno TEXT,
  pousos_diurnos INTEGER,
  pousos_noturnos INTEGER,
  starts INTEGER,
  pax INTEGER,
  payload REAL,
  combustivel_inicio REAL,
  combustivel_fim REAL,
  unidade_combustivel TEXT,
  origem_dados TEXT NOT NULL DEFAULT 'MANUAL',
  sigvoos_importado_em TEXT,
  sigvoos_content_hash TEXT,
  metadata_sigvoos_json TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (voo_id) REFERENCES cv_voos(id),
  CHECK (numero_etapa >= 1),
  CHECK (origem_dados IN ('MANUAL', 'SIGVOOS')),
  CHECK (pousos_diurnos IS NULL OR pousos_diurnos >= 0),
  CHECK (pousos_noturnos IS NULL OR pousos_noturnos >= 0),
  CHECK (starts IS NULL OR starts >= 0),
  CHECK (pax IS NULL OR pax >= 0),
  CHECK (payload IS NULL OR payload >= 0),
  CHECK (combustivel_inicio IS NULL OR combustivel_inicio >= 0),
  CHECK (combustivel_fim IS NULL OR combustivel_fim >= 0)
);

CREATE TABLE cv_voo_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  voo_id INTEGER NOT NULL,
  tipo_evento TEXT NOT NULL,
  status_anterior TEXT,
  status_novo TEXT,
  descricao TEXT,
  motivo_id INTEGER,
  metadata_json TEXT,
  usuario_id INTEGER,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (tipo_evento IN ('status', 'horario', 'tripulacao', 'rdv', 'ocorrencia', 'observacao', 'sistema')),
  CHECK (status_anterior IS NULL OR status_anterior IN (
    'planejado',
    'liberado_operacionalmente',
    'em_andamento',
    'pousado',
    'concluido_operacionalmente',
    'cancelado',
    'alternado_divergido'
  )),
  CHECK (status_novo IS NULL OR status_novo IN (
    'planejado',
    'liberado_operacionalmente',
    'em_andamento',
    'pousado',
    'concluido_operacionalmente',
    'cancelado',
    'alternado_divergido'
  )),
  FOREIGN KEY (voo_id) REFERENCES cv_voos(id),
  FOREIGN KEY (motivo_id) REFERENCES cv_motivos_operacionais(id)
);

CREATE TABLE cv_voo_tripulantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  voo_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  funcao TEXT NOT NULL,
  horario_apresentacao TEXT,
  horario_dispensa TEXT,
  observacoes TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT, etapa_id INTEGER REFERENCES cv_voo_etapas(id), sigvoos_staff_id INTEGER, sigvoos_staff_inscription TEXT, funcao_origem TEXT, resolucao_funcionario_fonte TEXT, sigvoos_content_hash TEXT,
  CHECK (funcao IN ('PIC', 'SIC', 'COM', 'MEC', 'OUTRO')),
  CHECK (horario_dispensa IS NULL OR horario_apresentacao IS NULL OR horario_dispensa >= horario_apresentacao),
  FOREIGN KEY (voo_id) REFERENCES cv_voos(id)
);

CREATE TABLE cv_sigvoos_staging (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  sigvoos_flight_report_id INTEGER,
  sigvoos_leg_number INTEGER,
  sigvoos_staff_id INTEGER,
  data_operacional TEXT NOT NULL,
  source_window_start TEXT NOT NULL,
  source_window_end TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_sanitizado_json TEXT,
  import_status TEXT NOT NULL DEFAULT 'PENDING',
  cv_voo_id INTEGER REFERENCES cv_voos(id),
  cv_etapa_id INTEGER REFERENCES cv_voo_etapas(id),
  cv_tripulante_id INTEGER REFERENCES cv_voo_tripulantes(id),
  tentativas INTEGER NOT NULL DEFAULT 0,
  erro_msg TEXT,
  processado_em TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (import_status IN ('PENDING', 'PROCESSED', 'ERROR', 'IGNORED', 'CONFLICT')),
  CHECK (tentativas >= 0)
);

CREATE TABLE cv_conflitos_integracao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  entidade_tipo TEXT NOT NULL,
  entidade_id INTEGER NOT NULL,
  campo TEXT NOT NULL,
  valor_airtrust TEXT,
  valor_sigvoos TEXT,
  staging_id TEXT REFERENCES cv_sigvoos_staging(id),
  severidade TEXT NOT NULL DEFAULT 'MEDIA',
  status TEXT NOT NULL DEFAULT 'ABERTO',
  resolvido_por INTEGER,
  resolvido_em TEXT,
  decisao TEXT,
  justificativa TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (entidade_tipo IN ('voo', 'etapa', 'tripulante')),
  CHECK (severidade IN ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA')),
  CHECK (status IN ('ABERTO', 'RESOLVIDO', 'IGNORADO')),
  CHECK (decisao IS NULL OR decisao IN ('MANTER_AIRTRUST', 'ACEITAR_SIGVOOS', 'IGNORAR'))
);

CREATE TABLE domain_events (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  modulo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  payload TEXT NOT NULL,
  processado INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT,
  deleted_at TEXT
, consumidores TEXT DEFAULT '[]', processado_por TEXT DEFAULT '[]', ultimo_erro TEXT);

CREATE TABLE empresa_certificado_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  template_html TEXT NOT NULL DEFAULT '',
  logo_r2_url TEXT,
  logo_filename TEXT,
  cor_primaria TEXT NOT NULL DEFAULT '#0066cc',
  cor_secundaria TEXT NOT NULL DEFAULT '#333333',
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
, deleted_at TEXT DEFAULT NULL);

CREATE TABLE empresas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  razao_social TEXT,
  cnpj TEXT UNIQUE,
  logo_url TEXT,
  logo_hash TEXT,
  assinatura_diretor_url TEXT,
  assinatura_diretor_hash TEXT,
  assinatura_diretor_nome TEXT DEFAULT 'Diretor Geral',
  telefone TEXT,
  email TEXT,
  endereco TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
, codigo TEXT, plano TEXT DEFAULT 'basic', max_funcionarios INTEGER DEFAULT 100, max_storage_mb INTEGER DEFAULT 1000, dominio TEXT);

CREATE TABLE certificados_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  
  -- Identificação
  nome VARCHAR(100) NOT NULL,
  descricao TEXT,
  tipo VARCHAR(50) DEFAULT 'PADRAO', -- PADRAO, TREINAMENTO, CURSO, CUSTOM
  
  -- Layout (JSON com estrutura do template)
  template_json TEXT NOT NULL,
  
  -- Assets (URLs no R2)
  logo_url TEXT,
  background_url TEXT,
  assinatura_url TEXT, -- Assinatura digital do responsável
  
  -- Configurações de estilo
  fonte VARCHAR(50) DEFAULT 'Arial',
  tamanho_fonte_titulo INTEGER DEFAULT 24,
  tamanho_fonte_corpo INTEGER DEFAULT 14,
  cor_primaria VARCHAR(7) DEFAULT '#000000', -- Título
  cor_secundaria VARCHAR(7) DEFAULT '#666666', -- Corpo
  cor_destaque VARCHAR(7) DEFAULT '#0066CC', -- Nome pessoa
  
  -- Layout
  orientacao VARCHAR(20) DEFAULT 'landscape', -- landscape, portrait
  tamanho_papel VARCHAR(10) DEFAULT 'A4', -- A4, Letter
  margem_cm DECIMAL(4,2) DEFAULT 2.0,
  
  -- Status
  ativo BOOLEAN DEFAULT 1,
  padrao BOOLEAN DEFAULT 0, -- Template padrão da empresa
  
  -- Metadados
  versao VARCHAR(10) DEFAULT '1.0',
  tags TEXT, -- Separado por vírgula: "treinamento,aviacao,basico"
  
  -- Auditoria
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (created_by) REFERENCES "__backup_pessoas"(id),
  FOREIGN KEY (updated_by) REFERENCES "__backup_pessoas"(id)
);

CREATE TABLE empresa_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL UNIQUE,
  
  
  nome TEXT NOT NULL,
  logo_url TEXT,
  
  
  template_certificado TEXT,
  cor_primaria TEXT DEFAULT '#0066cc',
  cor_secundaria TEXT DEFAULT '#333333',
  
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  
  
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE TABLE empresas_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL UNIQUE,
  dias_alerta_vencimento INTEGER DEFAULT 30,
  email_notificacoes TEXT,
  webhook_url TEXT,
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  logo_relatorio TEXT,
  cores_tema TEXT,
  modulos_ativos TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')), certificado_logo_url TEXT, certificado_template_html TEXT, certificado_assinatura_digital TEXT, idioma TEXT DEFAULT 'pt-BR',
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE TABLE escala_auditoria (
  id TEXT PRIMARY KEY,
  escala_id TEXT NOT NULL,
  evento_id TEXT,
  acao TEXT NOT NULL,
  campo_alterado TEXT,
  valor_anterior TEXT,
  valor_novo TEXT,
  justificativa TEXT,
  realizado_por TEXT NOT NULL,
  realizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE escala_situacao_tipos (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo              TEXT    NOT NULL UNIQUE,
  nome                TEXT    NOT NULL,
  cor                 TEXT    NOT NULL,
  icone               TEXT,
  bloqueia_alocacao   INTEGER NOT NULL DEFAULT 1,
  ativo               INTEGER NOT NULL DEFAULT 1,
  ordem               INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  deleted_at          TEXT
);

CREATE TABLE escala_tripulacoes (
  id TEXT PRIMARY KEY,
  escala_id TEXT NOT NULL,
  pic_id TEXT NOT NULL,
  sic_id TEXT,
  data_inicio TEXT NOT NULL,
  data_fim TEXT NOT NULL,
  padrao_escala_id TEXT,
  aeronave TEXT,
  base TEXT,
  restricoes TEXT,
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE escala_voo_diaria (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  empresa_id INTEGER NOT NULL,
  escala_id TEXT,                         -- FK opcional para escalas (EST mensal)
  data TEXT NOT NULL,                     -- YYYY-MM-DD
  status TEXT NOT NULL DEFAULT 'RASCUNHO',-- RASCUNHO | PUBLICADA | CANCELADA
  
  -- Tripulação
  pic_id INTEGER,                         -- FK funcionarios
  sic_id INTEGER,                         -- FK funcionarios
  pic_funcao TEXT,                        -- PIC / IN / EC
  sic_funcao TEXT,                        -- SIC / IN / EC
  
  -- Aeronave
  aeronave_prefixo TEXT,
  aeronave_modelo TEXT,
  
  -- Horários operacionais
  hora_apresentacao TEXT,                 -- HH:MM
  hora_decolagem_prevista TEXT,           -- HH:MM
  hora_pouso_previsto TEXT,               -- HH:MM
  hora_decolagem_real TEXT,               -- HH:MM (preenchido pós-voo)
  hora_pouso_real TEXT,                   -- HH:MM (preenchido pós-voo)
  hora_corte_motor TEXT,                  -- HH:MM (preenchido pós-voo)
  
  -- Repouso
  repouso_anterior_minutos INTEGER,       -- minutos desde último corte motor
  repouso_minimo_ok INTEGER DEFAULT 1,    -- 1 = ≥ 12h30, 0 = violação
  
  -- Rota / missão
  origem TEXT,                            -- ICAO / base
  destino TEXT,                           -- ICAO / base / plataforma
  tipo_missao TEXT DEFAULT 'OFFSHORE',    -- OFFSHORE | INSTRUCAO | CHECK | FERRY | OUTRO
  
  -- Observações
  observacoes TEXT,
  
  -- Audit
  criado_por INTEGER,                     -- FK funcionarios (quem elaborou)
  aprovado_por INTEGER,                   -- FK funcionarios (gestor ops)
  aprovado_em TEXT,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE escala_voo_diaria_justificativas (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  empresa_id INTEGER NOT NULL,
  escala_voo_diaria_id TEXT NOT NULL,
  funcionario_id INTEGER,
  papel TEXT,
  origem_alerta TEXT NOT NULL,     -- FRMS | REPOUSO | DUPLICIDADE | OPERACIONAL | OUTRO
  tipo_alerta TEXT,
  nivel_alerta TEXT,
  decisao TEXT NOT NULL,           -- MANTER_ESCALA | SUBSTITUIR | ACIONAR_STANDBY | ADICIONAR_OBSERVACAO | OUTRO
  justificativa TEXT NOT NULL,
  alerta_ref_id TEXT,
  criado_por TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE escala_voo_diaria_publicacoes (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  data_ref TEXT NOT NULL,
  revisao INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PUBLICADA',
  payload_json TEXT NOT NULL,
  checksum TEXT NOT NULL,
  observacoes TEXT,
  publicado_por TEXT,
  publicado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  UNIQUE (empresa_id, data_ref, revisao)
);

CREATE TABLE escalas_mensais (
  id TEXT PRIMARY KEY,
  mes INTEGER NOT NULL CHECK (mes >= 1 AND mes <= 12),
  ano INTEGER NOT NULL CHECK (ano >= 2024 AND ano <= 2035),
  titulo TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','em_revisao','aprovada','publicada')),
  aprovado_por TEXT,
  aprovado_em TEXT,
  publicado_por TEXT,
  publicado_em TEXT,
  observacoes TEXT,
  empresa_id INTEGER,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
, periodo TEXT
  CHECK(periodo IN ('primeira', 'segunda', 'personalizada'))
  DEFAULT 'personalizada', numero_revisao INTEGER NOT NULL DEFAULT 0);

CREATE TABLE escala_alertas (
  id TEXT PRIMARY KEY,
  escala_id TEXT NOT NULL REFERENCES escalas_mensais(id),
  empresa_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  funcionario_id TEXT,
  mensagem TEXT NOT NULL,
  resolvido INTEGER NOT NULL DEFAULT 0,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE escala_cobertura_diaria (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  escala_id       TEXT    NOT NULL REFERENCES escalas_mensais(id) ON DELETE CASCADE,
  aeronave_id     INTEGER NOT NULL REFERENCES aeronaves(id),
  data            TEXT    NOT NULL,   -- YYYY-MM-DD
  qtd_pic         INTEGER NOT NULL DEFAULT 0,
  qtd_sic         INTEGER NOT NULL DEFAULT 0,
  status_cobertura TEXT NOT NULL DEFAULT 'ok'
                  CHECK (status_cobertura IN ('ok','gap_pic','gap_sic','gap_total','excesso')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (escala_id, aeronave_id, data)
);

CREATE TABLE escala_publicacao_snapshots (id TEXT PRIMARY KEY, escala_id TEXT NOT NULL, empresa_id TEXT, publicado_por TEXT, publicado_em TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT, deleted_at TEXT, revisao INTEGER NOT NULL DEFAULT 0, FOREIGN KEY (escala_id) REFERENCES escalas_mensais(id));

CREATE TABLE escalas_quinzenas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,       -- 1-12
  numero INTEGER NOT NULL,   -- 1 = first half, 2 = second half
  data_inicio TEXT NOT NULL, -- YYYY-MM-DD
  data_fim TEXT NOT NULL,    -- YYYY-MM-DD
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  UNIQUE(empresa_id, ano, mes, numero)
);

CREATE TABLE escalas_tipos_evento_config (id TEXT PRIMARY KEY, empresa_id INTEGER NOT NULL REFERENCES empresas(id), codigo TEXT NOT NULL, label TEXT NOT NULL, cor TEXT NOT NULL, icone TEXT, ativo INTEGER NOT NULL DEFAULT 1, ordem INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), deleted_at TEXT, sigla TEXT, UNIQUE(empresa_id, codigo));

CREATE TABLE frms_carga_trabalho (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  funcionario_id TEXT NOT NULL,
  escala_id TEXT,
  escala_tripulacao_id TEXT,
  data_inicio TEXT,
  data_fim TEXT,
  tipo_alocacao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE frms_configuracao_limites (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  valor_numerico REAL NOT NULL,
  unidade TEXT NOT NULL,
  descricao TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE frms_explicacao_dia_cache (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER,
  tripulante_id TEXT NOT NULL,
  data_ref TEXT NOT NULL,
  origem_tela TEXT NOT NULL DEFAULT 'desconhecida',
  payload_json TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT,
  deleted_at TEXT,
  UNIQUE (empresa_id, tripulante_id, data_ref, origem_tela)
);

CREATE TABLE frms_fadiga_avaliacao_gestor (
  id TEXT PRIMARY KEY,
  checkin_id TEXT NOT NULL,
  empresa_id INTEGER NOT NULL,
  avaliador_id INTEGER NOT NULL,
  decisao TEXT NOT NULL CHECK (decisao IN ('APTO', 'MONITORADO', 'RESTRITO', 'NAO_APTO')),
  mitigacoes_json TEXT,
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE frms_fadiga_checkin (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  data_checkin TEXT NOT NULL,
  hora_checkin TEXT NOT NULL,
  kss_score INTEGER NOT NULL,
  horas_sono REAL NOT NULL,
  qualidade_sono INTEGER NOT NULL,
  sintomas_json TEXT,
  observacoes TEXT,
  score_fadiga INTEGER NOT NULL,
  nivel_fadiga TEXT NOT NULL,
  status_operacional TEXT NOT NULL,
  recomendacao TEXT,
  apto INTEGER NOT NULL DEFAULT 1,
  requires_frat_review INTEGER NOT NULL DEFAULT 0,
  frat_sugerido_nivel TEXT,
  associado_frat_avaliacao_id TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
, jornada_inicio_prevista TEXT, jornada_fim_prevista TEXT, horas_acordado REAL, meds_ult_12h INTEGER NOT NULL DEFAULT 0, alcool_ult_12h INTEGER NOT NULL DEFAULT 0, risco_autoavaliado INTEGER, origem_registro TEXT NOT NULL DEFAULT 'TRIPULANTE', horas_sono_48h REAL, wake_time TEXT, subjective_fatigue_level INTEGER, sleepiness_level INTEGER, fit_for_duty INTEGER, computed_risk_level TEXT NOT NULL DEFAULT 'normal', requires_operational_review INTEGER NOT NULL DEFAULT 0, report_source TEXT NOT NULL DEFAULT 'CREW_REPORTED', submitted_at TEXT);

CREATE TABLE frms_fadiga_config_empresa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL UNIQUE,
  ativo INTEGER NOT NULL DEFAULT 1,
  janela_inicio TEXT NOT NULL DEFAULT '04:00',
  janela_fim TEXT NOT NULL DEFAULT '11:00',
  threshold_amarelo INTEGER NOT NULL DEFAULT 40,
  threshold_vermelho INTEGER NOT NULL DEFAULT 60,
  peso_kss REAL NOT NULL DEFAULT 0.35,
  peso_sono_duracao REAL NOT NULL DEFAULT 0.25,
  peso_sono_qualidade REAL NOT NULL DEFAULT 0.2,
  peso_sintomas REAL NOT NULL DEFAULT 0.2,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE frms_fadiga_evento (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  checkin_id TEXT,
  tipo TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE frms_fonte_calculo_competencia (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER,
  tripulante_id INTEGER NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  fonte_escolhida TEXT NOT NULL CHECK (fonte_escolhida IN ('SIGVOOS', 'FIRA')),
  escolhido_por TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE frms_importacao_fira (
  id                       TEXT PRIMARY KEY,
  tripulante_id            TEXT,
  canac                    TEXT NOT NULL,
  nome_fira                TEXT NOT NULL,
  ano                      INTEGER NOT NULL,
  mes                      INTEGER NOT NULL,
  arquivo_nome             TEXT NOT NULL,
  arquivo_r2_key           TEXT,
  status                   TEXT NOT NULL DEFAULT 'PENDENTE',
  -- PENDENTE | REVISAO | IMPORTADO | REJEITADO | ERRO
  total_dias_extraidos     INTEGER DEFAULT 0,
  total_dias_importados    INTEGER DEFAULT 0,
  total_dias_substituidos  INTEGER DEFAULT 0,
  total_dias_ignorados     INTEGER DEFAULT 0,
  total_dias_erro          INTEGER DEFAULT 0,
  erros_json               TEXT,
  revisado_por             TEXT,
  revisado_em              TEXT,
  importado_por            TEXT NOT NULL,
  importado_em             TEXT,
  observacao               TEXT,
  importacao_anterior_id   TEXT DEFAULT NULL,
  -- preview_json guarda o FiraImportacaoPreview completo para re-uso
  preview_json             TEXT,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL,
  deleted_at               TEXT
);

CREATE TABLE frms_justificativas (
  id TEXT PRIMARY KEY,
  tripulante_id TEXT NOT NULL,
  data_voo TEXT NOT NULL,
  empresa_id INTEGER NOT NULL,
  gerado_por_id TEXT NOT NULL,
  gerado_por_nome TEXT NOT NULL,
  decisao_tomada TEXT NOT NULL,
  observacoes TEXT,
  documento_json TEXT NOT NULL,
  assinatura_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE frms_notificacao_config (
  id TEXT PRIMARY KEY,
  cargo TEXT NOT NULL UNIQUE,          -- 'PILOTO', 'GERENTE_OPS', 'SEGURANCA_VOO', 'ADMIN'
  nivel_minimo TEXT NOT NULL,          -- 'AVISO', 'ATENCAO', 'CRITICO', 'VIOLACAO'
  ativo INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, deleted_at TEXT);

CREATE TABLE frms_read_ack_event_audit (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  event_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_user_id INTEGER,
  action_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note TEXT,
  payload_before_json TEXT,
  payload_after_json TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE frms_read_ack_events (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  data_operacional TEXT NOT NULL,
  funcionario_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'OPERATIONAL_SNAPSHOT',
  lifecycle_status TEXT NOT NULL DEFAULT 'PENDING',
  snapshot_status TEXT,
  snapshot_alertas_json TEXT,
  data_sources_json TEXT,
  limitations_json TEXT,
  snapshot_payload_json TEXT,
  event_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  acknowledged_at TEXT,
  acknowledged_by INTEGER,
  ack_note TEXT,
  archived_at TEXT,
  archived_by INTEGER,
  archive_reason TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE "funcoes" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  empresa_id INTEGER NOT NULL
);

CREATE TABLE habilitacoes (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	nome TEXT NOT NULL,
	descricao TEXT,
	ativo INTEGER DEFAULT 1,
	created_at TEXT DEFAULT (datetime('now')),
	updated_at TEXT DEFAULT (datetime('now')),
	deleted_at TEXT
, habilitacao_anterior_id INTEGER, eh_renovada INTEGER DEFAULT 0, renovada_em TEXT, empresa_id INTEGER REFERENCES empresas(id));

CREATE TABLE horas_voo_lancamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  data_voo TEXT NOT NULL,
  aeronave_id INTEGER,
  modelo_aeronave TEXT,
  prefixo_aeronave TEXT,
  origem TEXT,
  destino TEXT,
  duracao_total_min INTEGER NOT NULL DEFAULT 0,
  duracao_pic_min INTEGER DEFAULT 0,
  duracao_sic_min INTEGER DEFAULT 0,
  duracao_noturna_min INTEGER DEFAULT 0,
  duracao_instrumento_min INTEGER DEFAULT 0,
  duracao_instrucao_min INTEGER DEFAULT 0,
  pousos_dia INTEGER DEFAULT 0,
  pousos_noite INTEGER DEFAULT 0,
  hoist_cycles INTEGER DEFAULT 0,
  funcao TEXT NOT NULL,
  tipo_operacao TEXT,
  is_simulador INTEGER DEFAULT 0,
  origem_registro TEXT NOT NULL,
  frms_jornada_id INTEGER,
  sessao_simulador_id INTEGER,
  fira_importacao_id INTEGER,
  observacoes TEXT,
  numero_voo TEXT,
  criado_por INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE horas_voo_saldo_inicial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  horas_total_min INTEGER DEFAULT 0,
  horas_pic_min INTEGER DEFAULT 0,
  horas_sic_min INTEGER DEFAULT 0,
  horas_noturna_min INTEGER DEFAULT 0,
  horas_instrumento_min INTEGER DEFAULT 0,
  horas_simulador_min INTEGER DEFAULT 0,
  horas_instrucao_min INTEGER DEFAULT 0,
  horas_aw139_min INTEGER DEFAULT 0,
  horas_sk76_min INTEGER DEFAULT 0,
  horas_outros_modelos_min INTEGER DEFAULT 0,
  data_referencia TEXT NOT NULL,
  observacoes TEXT,
  criado_por INTEGER,
  atualizado_por INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  UNIQUE(funcionario_id, empresa_id)
);

CREATE TABLE hospedagem_sugestoes (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  funcionario_id TEXT NOT NULL,
  escala_id TEXT,
  base TEXT,
  data_inicio TEXT,
  data_fim TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE hospedagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  hotel TEXT NOT NULL,
  quarto TEXT,
  data_checkin TEXT NOT NULL,
  data_checkout TEXT NOT NULL,
  valor REAL NOT NULL,
  status TEXT CHECK(status IN ('reservado', 'confirmado', 'cancelado', 'finalizado')) DEFAULT 'reservado',
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES "funcionarios_backup"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE integracoes_edapp_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER REFERENCES empresas(id),
  chave TEXT NOT NULL,
  valor TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE integracoes_edapp_cursos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  edapp_course_id TEXT NOT NULL,
  edapp_course_name TEXT,
  edapp_course_code TEXT,
  qualificacao_codigo TEXT NOT NULL,
  qualificacao_id INTEGER,
  validade_meses INTEGER DEFAULT 12,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT, empresa_id INTEGER REFERENCES empresas(id),
  UNIQUE(edapp_course_id)
);

CREATE TABLE integracoes_edapp_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo_evento TEXT NOT NULL,
  edapp_user_id TEXT,
  edapp_course_id TEXT,
  payload_json TEXT NOT NULL,
  processado INTEGER NOT NULL DEFAULT 0,
  erro_ultima TEXT,
  tentativas INTEGER NOT NULL DEFAULT 0,
  funcionario_id INTEGER,
  qualificacao_historico_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
, empresa_id INTEGER REFERENCES empresas(id));

CREATE TABLE integracoes_edapp_usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  edapp_user_id TEXT NOT NULL,
  edapp_email TEXT,
  edapp_username TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT, empresa_id INTEGER REFERENCES empresas(id),
  UNIQUE(funcionario_id, edapp_user_id)
);

CREATE TABLE integracoes_sigvoos_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER,
        chave TEXT NOT NULL,
        valor TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      , notificar_falha_email TEXT);

CREATE TABLE integracoes_sigvoos_eventos (
        id TEXT PRIMARY KEY,
        empresa_id INTEGER,
        tipo_evento TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT,
        resposta_json TEXT,
        erro_ultima TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );

CREATE TABLE integracoes_sigvoos_mapeamentos (
        id TEXT PRIMARY KEY,
        empresa_id INTEGER,
        nome_sigvoos TEXT NOT NULL,
        canac_sigvoos TEXT,
        funcionario_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );

CREATE TABLE job_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK(tipo IN ('GERAR_CERTIFICADO', 'PROCESSAR_RENOVACAO', 'ENVIAR_NOTIFICACAO')),
  payload TEXT NOT NULL, -- JSON com dados do job
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'PROCESSING', 'DONE', 'FAILED')),
  tentativas INTEGER NOT NULL DEFAULT 0,
  max_tentativas INTEGER NOT NULL DEFAULT 3,
  erro TEXT, -- Mensagem de erro se falhar
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processado_em TIMESTAMP,
  concluido_em TIMESTAMP,
  
  -- Índices para performance
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE TABLE job_execution_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  mensagem TEXT,
  detalhes TEXT, -- JSON com detalhes
  executado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (job_id) REFERENCES job_queue(id) ON DELETE CASCADE
);

CREATE TABLE lms_h5p_conteudos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  -- Tipo H5P: ex. 'InteractiveVideo', 'CoursePresentation', 'QuestionSet', 'Column'
  tipo_h5p TEXT NOT NULL DEFAULT 'CoursePresentation',
  r2_key TEXT,                              -- chave R2 do .h5p descompactado: lms/h5p/{empresa_id}/{id}/
  versao TEXT,                              -- versão da biblioteca H5P, ex: 'H5P.CoursePresentation 1.24'
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE TABLE "manobras" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  categoria TEXT,
  descricao TEXT,
  nivel_dificuldade INTEGER,
  tempo_estimado INTEGER,
  pontuacao_minima REAL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  deleted_at TEXT DEFAULT NULL,
  tipo_sessao TEXT DEFAULT 'TREINAMENTO',
  tipo_aeronave TEXT DEFAULT 'AW139',
  ordem INTEGER DEFAULT 1,
  empresa_id INTEGER REFERENCES empresas(id)
);

CREATE TABLE "manobras_avaliacoes" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  ficha_id INTEGER NOT NULL,
  manobra_id INTEGER NOT NULL,
  nota REAL DEFAULT 0,
  observacoes TEXT,
  feedback_instrutor TEXT,
  executada INTEGER DEFAULT 0,
  avaliador_id INTEGER,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE TABLE "manobras_categorias" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  cor TEXT,
  icone TEXT,
  ordem INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME,
  empresa_id INTEGER REFERENCES empresas(id)
);

CREATE TABLE "modelos_aeronave" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  fabricante TEXT,
  tipo TEXT,
  categoria TEXT,
  descricao TEXT,
  ativo INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  empresa_id INTEGER REFERENCES empresas(id),
  modelo TEXT NOT NULL
);

CREATE TABLE notificacoes_config (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo VARCHAR(50) NOT NULL, ativo INTEGER DEFAULT 1 CHECK(ativo IN (0, 1)), dias_antes INTEGER NOT NULL, urgencia VARCHAR(20), destinatarios TEXT, template TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT);

CREATE TABLE notificacoes_convocacao_cc_gestores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  cargo TEXT,
  empresa TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE notificacoes_convocacao_email_config (
  empresa_id INTEGER PRIMARY KEY,
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_security TEXT DEFAULT 'TLS',
  smtp_user TEXT,
  smtp_password TEXT,
  smtp_password_encrypted TEXT,
  sender_name TEXT,
  reply_to TEXT,
  assunto_padrao TEXT,
  assinatura_html TEXT,
  template_html TEXT,
  batch_size INTEGER DEFAULT 50,
  batch_interval_ms INTEGER DEFAULT 1000,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE padroes_escala (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  dias_trabalho INTEGER NOT NULL,
  dias_folga INTEGER NOT NULL,
  descricao TEXT,
  ativo INTEGER DEFAULT 1,
  empresa_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE papeis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Dados básicos
  nome TEXT NOT NULL UNIQUE,  -- PILOTO, INSTRUTOR, SUPERVISOR, RH_ADMIN, MECANICO
  descricao TEXT,
  
  -- Permissões (JSON string)
  -- Exemplo: '[{"recurso":"qualificacoes","acao":"criar"},{"recurso":"pessoas","acao":"editar"}]'
  permissoes TEXT NOT NULL DEFAULT '[]',
  
  -- Status
  ativo INTEGER NOT NULL DEFAULT 1,
  
  -- Auditoria
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE pasta_virtual_jobs (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  funcionario_id TEXT,
  referencia_id TEXT,
  referencia_tipo TEXT NOT NULL,
  tipo_documento TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  status_geracao TEXT NOT NULL DEFAULT 'pendente_geracao',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE perfis_permissoes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  empresa_id INTEGER NOT NULL,
  perfil TEXT NOT NULL CHECK(perfil IN ('GESTOR','INSTRUTOR','ALUNO')),
  modulo TEXT NOT NULL,
  acao TEXT NOT NULL,
  permitido INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(empresa_id, perfil, modulo, acao),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE TABLE pessoas_auditoria_acessos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Dados do acesso
  pessoa_id INTEGER NOT NULL,
  usuario_id TEXT NOT NULL,  -- Quem acessou
  acao TEXT NOT NULL,  -- 'VISUALIZAR', 'BUSCAR_CPF', 'EDITAR', 'DELETAR'
  recurso TEXT NOT NULL,  -- 'pessoas', 'credenciais', etc.
  dados_sensíveis TEXT,  -- JSON com campos acessados (ex: {"cpf": true, "email": true})
  
  -- Contexto
  ip_origem TEXT,
  user_agent TEXT,
  motivo TEXT,  -- Opcional: justificativa do acesso
  
  -- Timestamp
  acessado_em TEXT NOT NULL DEFAULT (datetime('now')),
  
  -- Constraints
  FOREIGN KEY (pessoa_id) REFERENCES "__backup_pessoas"(id) ON DELETE CASCADE
);

CREATE TABLE pessoas_papeis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Relações
  pessoa_id INTEGER NOT NULL,
  papel_id INTEGER NOT NULL,
  
  -- Vigência
  data_inicio TEXT NOT NULL DEFAULT (datetime('now')),
  data_fim TEXT,  -- NULL = ainda ativo
  
  -- Auditoria
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  
  -- Constraints
  FOREIGN KEY (pessoa_id) REFERENCES "__backup_pessoas"(id) ON DELETE CASCADE,
  FOREIGN KEY (papel_id) REFERENCES papeis(id) ON DELETE CASCADE,
  UNIQUE (pessoa_id, papel_id)
);

CREATE TABLE "qualificacoes_categorias" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  codigo TEXT NOT NULL,
  descricao TEXT,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME,
  cor TEXT DEFAULT '#6B7280',
  ativo INTEGER DEFAULT 1,
  empresa_id INTEGER REFERENCES empresas(id)
);

CREATE TABLE qualificacoes_historico_stats_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day DATE NOT NULL, 
  scope_hash TEXT NOT NULL, 
  total INTEGER NOT NULL DEFAULT 0,
  validas INTEGER NOT NULL DEFAULT 0,
  vencendo INTEGER NOT NULL DEFAULT 0,
  vencidas INTEGER NOT NULL DEFAULT 0,
  renovadas INTEGER NOT NULL DEFAULT 0,
  generated_at DATETIME NOT NULL DEFAULT (datetime('now')),
  UNIQUE(day, scope_hash)
);

CREATE TABLE qualificacoes_pendencias (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  funcionario_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  documento_r2_key TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE "qualificacoes_tipos" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT,
  codigo TEXT NOT NULL COLLATE NOCASE,
  nome TEXT NOT NULL CHECK(length(trim(nome)) >= 3),
  descricao TEXT,
  categoria TEXT,
  carga_horaria REAL CHECK(carga_horaria IS NULL OR carga_horaria > 0),
  carga_horaria_inicial REAL CHECK(carga_horaria_inicial IS NULL OR carga_horaria_inicial > 0),
  carga_horaria_recorrente REAL CHECK(carga_horaria_recorrente IS NULL OR carga_horaria_recorrente > 0),
  conteudo_programatico TEXT DEFAULT NULL,
  validade INTEGER CHECK(validade IS NULL OR validade > 0),
  vencimento_fim_mes INTEGER DEFAULT 0 CHECK(vencimento_fim_mes IN (0, 1)),
  observacoes TEXT,
  ativo INTEGER DEFAULT 1 CHECK(ativo IN (0, 1)),
  is_check INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  empresa_id INTEGER NOT NULL
);

CREATE TABLE "lms_cursos" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT,
  carga_horaria_minutos INTEGER DEFAULT 0,
  idioma TEXT DEFAULT 'pt-BR',
  thumbnail_r2_key TEXT,
  scorm_versao TEXT CHECK (scorm_versao IN ('1.2', '2004', NULL)),
  scorm_package_r2_prefix TEXT,
  scorm_launch_file TEXT,
  scorm_mastery_score INTEGER DEFAULT 70,
  qualificacao_tipo_id INTEGER,
  gerar_qualificacao_ao_concluir INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  publicado INTEGER NOT NULL DEFAULT 0,
  version_tag TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  tipo_conteudo TEXT NOT NULL DEFAULT 'scorm'
    CHECK (tipo_conteudo IN ('scorm', 'h5p', 'video', 'pdf', 'pptx')),
  conteudo_programatico TEXT,
  observacoes TEXT,
  carga_horaria_inicial_horas REAL,
  carga_horaria_recorrente_horas REAL,
  -- Novas colunas para conteúdo PDF e PPTX
  pdf_r2_key TEXT,
  pptx_r2_key TEXT,
  pptx_slide_count INTEGER DEFAULT 0, conteudo_arquivo_nome TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (qualificacao_tipo_id) REFERENCES qualificacoes_tipos(id)
);

CREATE TABLE matriz_treinamento_funcao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  funcao_id INTEGER NOT NULL,
  qualificacao_tipo_id INTEGER NOT NULL,
  obrigatoriedade TEXT NOT NULL DEFAULT 'OBRIGATORIA' CHECK (obrigatoriedade IN ('OBRIGATORIA', 'RECOMENDADA', 'NAO_APLICA')),
  nivel_requerido INTEGER DEFAULT NULL,
  critico_operacional INTEGER NOT NULL DEFAULT 0,
  origem TEXT NOT NULL DEFAULT 'REGULATORIO' CHECK (origem IN ('REGULATORIO', 'SGSO', 'RH', 'CLIENTE', 'OUTRO')),
  observacoes TEXT DEFAULT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
  deleted_at DATETIME DEFAULT NULL,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (funcao_id) REFERENCES funcoes(id),
  FOREIGN KEY (qualificacao_tipo_id) REFERENCES qualificacoes_tipos(id)
);

CREATE TABLE "modelos_sessao" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  tipo TEXT,
  descricao TEXT,
  duracao_estimada INTEGER,
  treinamento_id TEXT,
  ordem_no_treinamento INTEGER,
  ativo BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME NULL,
  tipo_sessao_id INTEGER,
  tipo_aeronave TEXT,
  codigo_aeronave TEXT,
  gera_qualificacao BOOLEAN DEFAULT 0,
  empresa_id INTEGER NOT NULL,
  modelo_aeronave TEXT,
  qualificacao_tipo_id INTEGER NULL REFERENCES qualificacoes_tipos(id)
);

CREATE TABLE modelos_sessao_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id INTEGER NOT NULL REFERENCES modelos_sessao(id),
  qualificacao_tipo_id INTEGER NOT NULL REFERENCES qualificacoes_tipos(id),
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME NULL,
  UNIQUE(modelo_id, qualificacao_tipo_id)
);

CREATE TABLE "modelos_sessao_manobras" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id INTEGER NOT NULL,
  manobra_id INTEGER NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  obrigatoria BOOLEAN DEFAULT 1,
  observacoes TEXT,
  
  -- Auditoria
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME NULL,
  created_by TEXT,
  updated_by TEXT, tripulante TEXT NOT NULL DEFAULT 'AB' CHECK(tripulante IN ('A','B','AB')),
  
  -- Foreign Keys CORRIGIDAS
  FOREIGN KEY (modelo_id) REFERENCES modelos_sessao(id) ON DELETE CASCADE,
  FOREIGN KEY (manobra_id) REFERENCES manobras(id) ON DELETE CASCADE,
  
  -- Constraint: não permitir manobra duplicada no mesmo modelo
  UNIQUE(modelo_id, manobra_id)
);

CREATE TABLE rate_limit_store (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at TEXT NOT NULL
, window_start TEXT DEFAULT (datetime('now')));

CREATE TABLE registros_frms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  data_registro TEXT NOT NULL,
  horas_sono REAL NOT NULL CHECK(horas_sono >= 0 AND horas_sono <= 24),
  nivel_fadiga INTEGER CHECK(nivel_fadiga BETWEEN 1 AND 10) NOT NULL,
  sintomas TEXT,
  apto_voo INTEGER DEFAULT 1,
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES "funcionarios_backup"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE requisitos_compliance (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id  INTEGER NOT NULL,
  funcao      TEXT    NOT NULL, -- ex: 'Comandante', 'Copiloto', 'Comissário'
  tipo_recurso TEXT   NOT NULL  -- 'qualificacao' | 'licenca' | 'curso_lms'
    CHECK(tipo_recurso IN ('qualificacao', 'licenca', 'curso_lms')),
  referencia  TEXT    NOT NULL, -- qualificacao_codigo, licenca.tipo ou lms_curso_id (para curso_lms)
  descricao   TEXT,
  obrigatorio INTEGER DEFAULT 1 NOT NULL CHECK(obrigatorio IN (0, 1)),
  deleted_at  TEXT,
  created_at  TEXT    DEFAULT (datetime('now')),
  updated_at  TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE restricoes_tripulacao (
  id TEXT PRIMARY KEY,
  funcionario_a_id TEXT NOT NULL,
  funcionario_b_id TEXT NOT NULL,
  tipo_restricao TEXT NOT NULL CHECK (tipo_restricao IN ('nao_pode_voar_junto','preferencial','contratual')),
  motivo TEXT,
  contrato_referencia TEXT,
  data_inicio TEXT,
  data_fim TEXT,
  ativo INTEGER DEFAULT 1,
  empresa_id INTEGER,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE "sessoes_fichas" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  agendamento_id TEXT,
  colaborador_id TEXT,
  instrutor_id TEXT,
  template_id TEXT,
  status TEXT DEFAULT 'RASCUNHO',
  nota_media REAL,
  resultado_final TEXT,
  carga_horaria INTEGER,
  hora_diurna INTEGER,
  hora_noturna INTEGER,
  pouso_diurno INTEGER,
  pouso_noturno INTEGER,
  created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now'))
);

CREATE TABLE sessoes_participantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  sessao_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  funcao TEXT, -- PF (Pilot Flying), PM (Pilot Monitoring), PIC, SIC, etc
  status TEXT DEFAULT 'CONFIRMADO', -- CONFIRMADO, FALTOU, DISPENSADO
  ciclo_executado INTEGER DEFAULT 1,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE TABLE sessoes_template (id INTEGER PRIMARY KEY AUTOINCREMENT, tema TEXT NOT NULL, tipo_sessao TEXT DEFAULT 'TREINAMENTO', tipo_aeronave TEXT DEFAULT 'AW139', duracao_estimada INTEGER DEFAULT 120, descricao TEXT, ativa BOOLEAN DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, deleted_at TIMESTAMP, codigo TEXT, gera_qualificacao BOOLEAN DEFAULT 0);

CREATE TABLE "setores" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  responsavel TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  empresa_id INTEGER NOT NULL
);

CREATE TABLE "funcionarios" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT,
  matricula TEXT,
  cpf TEXT,
  cargo TEXT,
  departamento TEXT,
  status TEXT DEFAULT 'ATIVO',
  observacoes TEXT,
  guerra TEXT,
  funcao TEXT,
  setor TEXT,
  codigo_anac TEXT,
  is_instrutor INTEGER DEFAULT 0,
  is_checador INTEGER DEFAULT 0,
  ativo INTEGER DEFAULT 1,
  rg TEXT,
  nascimento TEXT,
  sexo TEXT,
  nacionalidade TEXT,
  telefone_emergencia TEXT,
  contato_emergencia_nome TEXT,
  foto_url TEXT,
  base TEXT,
  aeronave TEXT,
  nivel_icao TEXT,
  validade_icao TEXT,
  cma TEXT,
  validade_cma TEXT,
  aso TEXT,
  validade_aso TEXT,
  sispat TEXT,
  prestserv TEXT,
  endereco TEXT,
  cep TEXT,
  logradouro TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
  escala TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  telefone TEXT,
  licenca TEXT,
  admissao TEXT,
  modelo_aeronave_id TEXT,
  empresa_id INTEGER NOT NULL,
  data_realizacao_icao TEXT,
  data_realizacao_cma TEXT,
  data_realizacao_aso TEXT,
  is_examinador INTEGER NOT NULL DEFAULT 0,
  quinzena TEXT CHECK(quinzena IN ('primeira', 'segunda', 'personalizada')) DEFAULT 'primeira'
, setor_id INTEGER REFERENCES setores(id));

CREATE TABLE alertas_enviados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT NOT NULL,
        funcionario_id INTEGER NOT NULL,
        qualificacao_id INTEGER,
        data_envio TEXT DEFAULT (datetime('now')),
        destinatario TEXT,
        status TEXT DEFAULT 'ENVIADO',
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      );

CREATE TABLE alertas_reforco (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  funcionario_id INTEGER NOT NULL,
  codigo_manobra TEXT NOT NULL,
  descricao_manobra TEXT NOT NULL,
  
  -- Critério de alerta (2 sessões consecutivas < 7.0)
  nota_sessao1 REAL NOT NULL,
  data_sessao1 TEXT NOT NULL,
  ficha_id_sessao1 INTEGER NOT NULL,
  
  nota_sessao2 REAL NOT NULL,
  data_sessao2 TEXT NOT NULL,
  ficha_id_sessao2 INTEGER NOT NULL,
  
  -- Status do alerta
  status TEXT NOT NULL DEFAULT 'ATIVO', -- ATIVO | RESOLVIDO | IGNORADO
  instrutor_notificado INTEGER NOT NULL DEFAULT 0, -- 0 = não, 1 = sim
  data_notificacao TEXT,
  instrutor_id_notificado INTEGER,
  
  -- Resolução
  data_resolucao TEXT,
  nota_resolucao REAL,
  ficha_id_resolucao INTEGER,
  observacoes_resolucao TEXT,
  
  -- Metadata
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (instrutor_id_notificado) REFERENCES funcionarios(id)
);

CREATE TABLE "arquivos" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  nome_original TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  categoria TEXT DEFAULT 'geral',
  tamanho INTEGER,
  tipo TEXT,
  url_r2 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  deleted_at TEXT,
  empresa_id INTEGER NOT NULL,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE TABLE compliance_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        data_avaliacao TEXT NOT NULL,
        status TEXT CHECK(status IN ('COMPLIANT', 'NON_COMPLIANT', 'PENDING')) NOT NULL,
        detalhes TEXT,
        avaliado_por TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')), deleted_at TEXT DEFAULT NULL,
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      );

CREATE TABLE consentimentos_lgpd (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        tipo TEXT NOT NULL CHECK(tipo IN ('coleta_dados', 'uso_imagem', 'compartilhamento', 'tratamento_dados')),
        aceito INTEGER NOT NULL DEFAULT 0,
        data_aceite TEXT,
        ip_aceite TEXT,
        user_agent TEXT,
        revogado INTEGER DEFAULT 0,
        data_revogacao TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')), deleted_at TEXT DEFAULT NULL,
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      );

CREATE TABLE "documentos" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  funcionario_id INTEGER NOT NULL,
  nome_arquivo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  tamanho INTEGER NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  descricao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT DEFAULT NULL,
  empresa_id INTEGER NOT NULL,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE TABLE "escala_alocacoes" (
  id                TEXT    PRIMARY KEY,
  escala_id         TEXT    NOT NULL REFERENCES escalas_mensais(id) ON DELETE CASCADE,
  funcionario_id    TEXT    NOT NULL REFERENCES funcionarios(id),
  aeronave_id       INTEGER REFERENCES aeronaves(id),
  funcao            TEXT    CHECK (funcao IN ('PIC','SIC','PIC_CHK','SIC_CHK','INSTRUTOR','FLEX')),
  situacao_tipo     TEXT,
  situacao_cor      TEXT,
  quinzena_id       INTEGER REFERENCES escalas_quinzenas(id),
  data_inicio       TEXT    NOT NULL,
  data_fim          TEXT    NOT NULL,
  padrao_escala_id  TEXT    REFERENCES padroes_escala(id),
  base              TEXT,
  observacoes       TEXT,
  status            TEXT    NOT NULL DEFAULT 'planejado'
                    CHECK (status IN ('planejado','confirmado','cancelado')),
  tripulacao_legado_id TEXT,
  created_by        TEXT    NOT NULL DEFAULT 'system',
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  deleted_at        TEXT, auto_gerado INTEGER DEFAULT 0, cma_override INTEGER NOT NULL DEFAULT 0, cma_override_by TEXT NULL, modelo_aeronave TEXT,
  CONSTRAINT chk_alocacao_datas CHECK (data_fim >= data_inicio)
);

CREATE TABLE escala_confirmacoes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  escala_id TEXT NOT NULL,
  funcionario_id INTEGER NOT NULL,
  confirmado_em TEXT NOT NULL DEFAULT (datetime('now')),
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT DEFAULT NULL,
  FOREIGN KEY (escala_id) REFERENCES escalas_mensais(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE TABLE escala_eventos (
  id TEXT PRIMARY KEY,
  escala_id TEXT NOT NULL,
  tripulacao_id TEXT,
  funcionario_id TEXT NOT NULL,
  tipo_evento TEXT NOT NULL CHECK (tipo_evento IN (
    'voo','viagem','treinamento_solo','treinamento_simulador',
    'medico','cheque','reaquisi','trabalho','folga',
    'standby','ferias','licenca'
  )),
  data_inicio TEXT NOT NULL,
  data_fim TEXT NOT NULL,
  turno TEXT DEFAULT 'dia_todo' CHECK (turno IN ('manha','tarde','noite','dia_todo')),
  local TEXT,
  aeronave TEXT,
  simulador_id TEXT,
  certificacao_id TEXT,
  gerado_automaticamente INTEGER DEFAULT 0,
  motivo_automatico TEXT,
  status TEXT DEFAULT 'confirmado' CHECK (status IN ('confirmado','pendente','cancelado')),
  observacoes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
, origem TEXT DEFAULT 'manual', alocacao_id TEXT REFERENCES escala_alocacoes(id));

CREATE TABLE escalas_templates_tripulacao (id TEXT PRIMARY KEY, empresa_id INTEGER NOT NULL REFERENCES empresas(id), nome TEXT NOT NULL, quinzena INTEGER NOT NULL DEFAULT 0, aeronave TEXT, pic_id TEXT REFERENCES funcionarios(id), sic_id TEXT REFERENCES funcionarios(id), padrao_escala_id TEXT, base TEXT, observacoes TEXT, ativo INTEGER NOT NULL DEFAULT 1, usos INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), deleted_at TEXT, migrado_para_v2 INTEGER NOT NULL DEFAULT 0);

CREATE TABLE escala_template_alocacoes (
  id              TEXT    PRIMARY KEY,
  template_id     TEXT    NOT NULL REFERENCES escalas_templates_tripulacao(id) ON DELETE CASCADE,
  funcao          TEXT    NOT NULL CHECK (funcao IN ('PIC','SIC','PIC_CHK','SIC_CHK','INSTRUTOR','FLEX')),
  funcionario_id  TEXT    REFERENCES funcionarios(id),  -- null = slot vazio (a preencher)
  padrao_escala_id TEXT   REFERENCES padroes_escala(id),
  ordem           INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT
);

CREATE TABLE frms_acumulo_mensal (
  id TEXT PRIMARY KEY,
  tripulante_id INTEGER NOT NULL REFERENCES funcionarios(id),
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK(mes >= 1 AND mes <= 12),
  jornada_realizada_min INTEGER DEFAULT 0,
  hv_realizada_min INTEGER DEFAULT 0,
  jornada_fatorizada_pct REAL DEFAULT 0,
  hv_fatorizada_pct REAL DEFAULT 0,
  dias_embarcado INTEGER DEFAULT 0,
  dias_folga INTEGER DEFAULT 0,
  dias_ferias INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE frms_acumulo_rolling (
  id TEXT PRIMARY KEY,
  tripulante_id INTEGER NOT NULL REFERENCES funcionarios(id),
  data_referencia TEXT NOT NULL,
  hv_7_dias_min INTEGER DEFAULT 0,
  hv_28_dias_min INTEGER DEFAULT 0,
  hv_365_dias_min INTEGER DEFAULT 0,
  hv_mes_calendario_min INTEGER DEFAULT 0,
  hv_dia_min INTEGER DEFAULT 0,
  pct_limite_7d REAL DEFAULT 0,
  pct_limite_28d REAL DEFAULT 0,
  pct_limite_365d REAL DEFAULT 0,
  pct_limite_dia REAL DEFAULT 0,
  repouso_anterior_min INTEGER DEFAULT 0,
  repouso_suficiente INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
, pct_limite_mes_calendario REAL DEFAULT 0);

CREATE TABLE frms_escala_quinzenal (
  id TEXT PRIMARY KEY,
  tripulante_id INTEGER NOT NULL REFERENCES funcionarios(id),
  ano INTEGER NOT NULL,
  ciclo INTEGER NOT NULL,
  data_inicio_embarque TEXT NOT NULL,
  data_fim_embarque TEXT NOT NULL,
  data_inicio_folga TEXT NOT NULL,
  data_fim_folga TEXT NOT NULL,
  dias_embarcado INTEGER NOT NULL,
  dias_folga INTEGER NOT NULL,
  status_ciclo TEXT DEFAULT 'ATIVO' CHECK(status_ciclo IN ('ATIVO','ENCERRADO','CANCELADO')),
  observacao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE "frms_jornada" (
  id                          TEXT PRIMARY KEY,
  tripulante_id               INTEGER NOT NULL REFERENCES funcionarios(id),
  data                        TEXT NOT NULL,
  status                      TEXT NOT NULL CHECK(status IN (
                                'ES','TS','TV','EX','RE','SA',
                                'FE','FR','FS','AM','DM','OT'
                              )),
  hora_apresentacao           TEXT,
  hora_termino                TEXT,
  duracao_jornada_minutos     INTEGER,
  horas_voo_minutos           INTEGER,
  hora_primeiro_acionamento   TEXT,
  hora_primeira_decolagem     TEXT,
  hora_ultimo_pouso           TEXT,
  hora_corte_motor            TEXT,
  repouso_plataforma_inicio   TEXT,
  repouso_plataforma_fim      TEXT,
  repouso_plataforma_valido   INTEGER DEFAULT 0,
  observacao                  TEXT,
  registrado_por              TEXT NOT NULL,
  origem                      TEXT DEFAULT 'MANUAL' CHECK(origem IN (
                                'MANUAL','APUS','SIMULADOR','FIRA','SIGVOOS'
                              )),
  created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at                  TEXT,
  tipo_base                   TEXT DEFAULT 'HOME' CHECK(tipo_base IN ('HOME','AWAY')),
  tripulacao_aumentada        INTEGER DEFAULT 0,
  classe_cabine               TEXT DEFAULT NULL CHECK(classe_cabine IN ('ECONOMY','BUSINESS',NULL)),
  aclimatado                  INTEGER DEFAULT 1,
  local_base                  TEXT DEFAULT NULL
, matricula_aeronave TEXT, tempo_noturno_str TEXT, tempo_ifr_str TEXT, fonte_resolucao_sigvoos TEXT, hora_dormiu TEXT, hora_acordou TEXT, sono_efetivo_min INTEGER, fonte_sono TEXT DEFAULT 'PADRAO', acordou_na_wocl INTEGER DEFAULT 0, repouso_regulatorio_min INTEGER, empresa_id INTEGER, fator_basica_pct REAL DEFAULT 0, fator_apresentacao_pct REAL DEFAULT 0, fator_repouso_pct REAL DEFAULT 0, horas_voo_noturno_min INTEGER DEFAULT 0, horas_voo_ifr_min INTEGER DEFAULT 0, fonte_resolucao TEXT);

CREATE TABLE frms_alerta (
  id TEXT PRIMARY KEY,
  tripulante_id INTEGER NOT NULL REFERENCES funcionarios(id),
  jornada_id TEXT REFERENCES frms_jornada(id),
  tipo_limite TEXT NOT NULL CHECK(tipo_limite IN ('FDP_DIARIO','HV_DIARIA','HV_7D','HV_MES','HV_365D','REPOUSO')),
  nivel TEXT NOT NULL CHECK(nivel IN ('AVISO','ATENCAO','CRITICO','VIOLACAO')),
  percentual_atingido REAL NOT NULL,
  valor_atual_min INTEGER NOT NULL,
  valor_limite_min INTEGER NOT NULL,
  mensagem TEXT NOT NULL,
  visualizado INTEGER DEFAULT 0,
  visualizado_em TEXT,
  visualizado_por TEXT,
  resolvido INTEGER DEFAULT 0,
  resolvido_em TEXT,
  resolvido_por TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
, notas_resolucao TEXT DEFAULT NULL);

CREATE TABLE frms_fatorizacao_jornada (
  id TEXT PRIMARY KEY,
  jornada_id TEXT NOT NULL REFERENCES frms_jornada(id),
  fator_basica_pct REAL DEFAULT 0,
  fator_apresentacao_pct REAL DEFAULT 0,
  fator_duracao_pct REAL DEFAULT 0,
  fator_repouso_pct REAL DEFAULT 0,
  fator_noturno_dep_pct REAL DEFAULT 0,
  fator_noturno_arr_pct REAL DEFAULT 0,
  total_fatorizado_jornada REAL DEFAULT 0,
  fator_hv_basica_pct REAL DEFAULT 0,
  fator_hv_quantidade_pct REAL DEFAULT 0,
  fator_hv_noturno_dep_pct REAL DEFAULT 0,
  fator_hv_noturno_arr_pct REAL DEFAULT 0,
  total_fatorizado_hv REAL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
, fator_base_away_pct REAL DEFAULT 0, fator_aclimatacao_pct REAL DEFAULT 0, fator_ciclo_embarcado_pct REAL DEFAULT 0, effectiveness_pct REAL DEFAULT NULL, effectiveness_nivel TEXT DEFAULT NULL, effectiveness_componentes_json TEXT DEFAULT NULL, hora_despertar_estimada TEXT DEFAULT NULL, hora_inicio_sono_estimado TEXT DEFAULT NULL, duracao_sono_efetiva_min REAL DEFAULT NULL, tempo_abaixo_limiar_min REAL DEFAULT NULL, dia_periodo_embarcado INTEGER DEFAULT NULL, total_dias_periodo INTEGER DEFAULT NULL, processado_com_bug INTEGER NOT NULL DEFAULT 1);

CREATE TABLE frms_jornada_pendente (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER,
  importacao_id TEXT,
  nome_sigvoos TEXT NOT NULL,
  identificador_sigvoos TEXT,
  canac_sigvoos TEXT,
  competencia TEXT NOT NULL,
  jornadas INTEGER NOT NULL DEFAULT 0,
  motivo TEXT NOT NULL,
  payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK(status IN ('PENDENTE', 'RESOLVIDO')),
  resolved_funcionario_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (resolved_funcionario_id) REFERENCES funcionarios(id)
);

CREATE TABLE "frms_notificacao_destinatario" (
  id TEXT PRIMARY KEY,
  alerta_id TEXT NOT NULL,
  funcionario_id INTEGER NOT NULL,
  cargo TEXT NOT NULL,
  lido INTEGER DEFAULT 0,
  lido_em TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (alerta_id) REFERENCES frms_alerta(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE TABLE funcionario_documentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        tipo_documento TEXT NOT NULL,
        nome_arquivo TEXT NOT NULL,
        caminho_r2 TEXT NOT NULL,
        tamanho_bytes INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        descricao TEXT,
        data_upload DATETIME DEFAULT CURRENT_TIMESTAMP,
        uploaded_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      );

CREATE TABLE funcionario_ferias (
  id                  TEXT    PRIMARY KEY,
  funcionario_id      TEXT    NOT NULL REFERENCES funcionarios(id),
  data_inicio         TEXT    NOT NULL,
  data_fim            TEXT    NOT NULL,
  tipo                TEXT    NOT NULL DEFAULT 'FERIAS',
  observacoes         TEXT,
  escala_alocacao_id  TEXT,
  criado_por          TEXT    NOT NULL,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  deleted_at          TEXT
);

CREATE TABLE funcionarios_aeronaves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        aeronave_id INTEGER NOT NULL,
        data_inicio TEXT NOT NULL,
        data_fim TEXT,
        ativo INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')), deleted_at TEXT DEFAULT NULL,
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
        FOREIGN KEY (aeronave_id) REFERENCES aeronaves(id),
        UNIQUE(funcionario_id, aeronave_id, data_inicio)
      );

CREATE TABLE historico_compliance (   id INTEGER PRIMARY KEY AUTOINCREMENT,   funcionario_id INTEGER NOT NULL,   tipo_recurso TEXT NOT NULL CHECK(tipo_recurso IN ('qualificacao', 'licenca')),   recurso_id INTEGER NOT NULL,   status_compliance TEXT NOT NULL CHECK(status_compliance IN ('CONFORME', 'VENCIDO', 'PENDENTE', 'A_VENCER')),   percentual_conformidade REAL NOT NULL DEFAULT 0.0,   data_calculo TEXT NOT NULL DEFAULT (datetime('now')),   data_vencimento TEXT,   dias_para_vencer INTEGER,   observacoes TEXT,   created_at TEXT NOT NULL DEFAULT (datetime('now')),   updated_at TEXT NOT NULL DEFAULT (datetime('now')),   deleted_at TEXT,   FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE );

CREATE TABLE hospedagem (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id  INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  tipo        TEXT NOT NULL CHECK(tipo IN ('HOTEL','PLATAFORMA','BASE','OUTRO')),
  local       TEXT NOT NULL,
  cidade      TEXT,
  estado      TEXT,
  data_checkin  TEXT NOT NULL,   -- ISO date YYYY-MM-DD
  data_checkout TEXT,            -- NULL = ainda hospedado
  numero_quarto TEXT,
  custo_diaria  REAL,
  moeda         TEXT DEFAULT 'BRL',
  escala_id     INTEGER,         -- vínculo opcional com escalas
  observacoes   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT,
  FOREIGN KEY (empresa_id)    REFERENCES empresas(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (escala_id)      REFERENCES escalas(id)
);

CREATE TABLE instrutores_simulador (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id TEXT NOT NULL,
        habilitacoes TEXT,
        observacoes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT,
        FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id)
      );

CREATE TABLE "licencas" (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo        TEXT NOT NULL,
  numero      TEXT NOT NULL,
  data_emissao TEXT NOT NULL,
  data_vencimento TEXT NOT NULL,
  observacoes TEXT,
  created_at  TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  updated_at  TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  deleted_at  TEXT DEFAULT NULL, empresa_id INTEGER REFERENCES empresas(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE TABLE lms_cursos_setores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  curso_id INTEGER NOT NULL,
  setor_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (curso_id) REFERENCES lms_cursos(id),
  FOREIGN KEY (setor_id) REFERENCES setores(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE TABLE lms_matriculas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  curso_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,

  -- Status do ciclo de vida
  -- 'NAO_INICIADO' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'REPROVADO' | 'CANCELADO'
  status TEXT NOT NULL DEFAULT 'NAO_INICIADO',

  -- Progresso
  progresso_pct INTEGER DEFAULT 0,         -- 0 a 100
  score_final INTEGER,                     -- score de conclusão do SCORM (0-100)
  tentativas INTEGER NOT NULL DEFAULT 0,

  -- Datas
  data_inicio TEXT,                        -- quando o aluno acessou pela primeira vez
  data_conclusao TEXT,                     -- quando status = CONCLUIDO ou REPROVADO
  data_expiracao TEXT,                     -- prazo para conclusão (opcional)
  data_matricula TEXT NOT NULL DEFAULT (datetime('now')),

  -- Geração de qualificação
  qualificacao_historico_id INTEGER,       -- FK para qualificacoes_historico.id (se gerada)

  -- Quem matriculou
  matriculado_por INTEGER,                 -- funcionario_id do gestor/admin que matriculou

  -- Metadados
  observacoes TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT, ultimo_slide INTEGER DEFAULT 0, ultima_pagina INTEGER DEFAULT 0,

  UNIQUE (curso_id, funcionario_id, empresa_id),

  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (curso_id) REFERENCES lms_cursos(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE TABLE lms_progresso_scorm (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,             -- desnormalizado para eficiência de queries

  -- Campos SCORM 1.2 / 2004 essenciais
  lesson_status TEXT,                      -- SCORM 1.2: 'passed'|'failed'|'completed'|'incomplete'|'not attempted'|'browsed'
  completion_status TEXT,                  -- SCORM 2004: 'completed'|'incomplete'|'not attempted'|'unknown'
  success_status TEXT,                     -- SCORM 2004: 'passed'|'failed'|'unknown'
  score_raw INTEGER,
  score_max INTEGER,
  score_min INTEGER,
  score_scaled REAL,                       -- SCORM 2004: -1.0 a 1.0

  -- Tempo e sessão
  session_time TEXT,                       -- CMITimespan (PT1H2M3S ou HH:MM:SS)
  total_time TEXT,                         -- acumulado de session_time
  session_count INTEGER NOT NULL DEFAULT 1,

  -- Suspend data (bookmark / estado do conteúdo)
  suspend_data TEXT,                       -- até 4096 chars (SCORM 1.2) / 64000 (2004)
  launch_data TEXT,                        -- lido apenas

  -- Dados completos (JSON do CMI inteiro para reconstrução)
  cmi_json TEXT,                           -- JSON com todo o objeto CMI

  -- Controle
  last_commit_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE (matricula_id),

  FOREIGN KEY (matricula_id) REFERENCES lms_matriculas(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE TABLE lms_xapi_statements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  matricula_id INTEGER NOT NULL,            -- FK → lms_matriculas.id

  -- Campos xAPI principais (armazenados como TEXT/JSON para flexibilidade)
  actor_json TEXT NOT NULL,                 -- { "mbox": "mailto:...", "name": "..." }
  verb_id TEXT NOT NULL,                    -- ex: "http://adlnet.gov/expapi/verbs/completed"
  verb_display TEXT,                        -- label localizado, ex: "completou"
  object_id TEXT NOT NULL,                  -- IRI do objeto (curso/atividade)
  object_type TEXT DEFAULT 'Activity',      -- 'Activity' | 'Agent' | 'Group' | 'StatementRef'
  result_json TEXT,                         -- { "success": true, "completion": true, "score": {...} }
  context_json TEXT,                        -- { "contextActivities": {...}, ... }
  timestamp TEXT,                           -- ISO 8601 do momento da ação no cliente

  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (matricula_id) REFERENCES lms_matriculas(id)
);

CREATE TABLE logs_acesso_dados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        usuario_id INTEGER,
        acao TEXT NOT NULL CHECK(acao IN ('READ', 'UPDATE', 'DELETE', 'EXPORT')),
        campos_acessados TEXT,
        ip TEXT,
        user_agent TEXT,
        timestamp TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      );

CREATE TABLE notificacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT NOT NULL,
        titulo TEXT NOT NULL,
        mensagem TEXT NOT NULL,
        funcionario_id INTEGER,
        lida BOOLEAN DEFAULT 0,
        data_envio TEXT DEFAULT (datetime('now')),
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      );

CREATE TABLE notificacoes_inapp (id TEXT PRIMARY KEY, funcionario_id TEXT NOT NULL REFERENCES funcionarios(id), empresa_id INTEGER NOT NULL REFERENCES empresas(id), tipo TEXT NOT NULL, titulo TEXT NOT NULL, mensagem TEXT, lida INTEGER NOT NULL DEFAULT 0, referencia_id TEXT, referencia_tipo TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), deleted_at TEXT);

CREATE TABLE "pasta_virtual" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo_documento TEXT NOT NULL,
  categoria TEXT,
  caminho_arquivo TEXT,
  arquivourl TEXT,
  nome_arquivo TEXT,
  nomeoriginal TEXT,
  arquivo_tamanho INTEGER,
  tamanho INTEGER,
  dataupload TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  uploadedby INTEGER,
  certificacao_id INTEGER,
  descricao TEXT,
  deleted_at TEXT,
  empresa_id INTEGER NOT NULL,
  FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
);

CREATE TABLE qualificacoes_tipos_setores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo_id INTEGER NOT NULL,
  setor_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (tipo_id) REFERENCES qualificacoes_tipos(id),
  FOREIGN KEY (setor_id) REFERENCES setores(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE TABLE sgso_acoes_mitigacao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,

  
  relato_id TEXT,                                
  nc_id INTEGER,                                 

  tipo TEXT NOT NULL CHECK (tipo IN (
    'CORRETIVA',   
    'PREVENTIVA'   
  )),

  
  descricao TEXT NOT NULL,
  categoria TEXT CHECK (categoria IN (
    'TREINAMENTO',
    'PROCEDIMENTO',
    'EQUIPAMENTO',
    'SUPERVISAO',
    'COMUNICACAO',
    'OUTRO'
  )),

  
  responsavel_id INTEGER NOT NULL,               
  prazo TEXT NOT NULL,                           

  
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN (
    'PENDENTE',
    'EM_ANDAMENTO',
    'CONCLUIDA',
    'CANCELADA'
  )),
  percentual_conclusao INTEGER DEFAULT 0 CHECK (percentual_conclusao BETWEEN 0 AND 100),

  
  evidencia_url TEXT,                            
  evidencia_descricao TEXT,
  data_conclusao TEXT,                           
  concluida_por INTEGER,                         

  
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE sgso_audit_trail (
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

CREATE TABLE sgso_auditoria_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  auditoria_id TEXT NOT NULL,                    
  empresa_id INTEGER NOT NULL,

  numero_item INTEGER,                           
  descricao TEXT NOT NULL,                       
  rbac_referencia TEXT,                          
  criterio_aceitacao TEXT,                       

  
  resultado TEXT CHECK (resultado IN (
    'CONFORME',
    'NC_MAJOR',        
    'NC_MINOR',        
    'OBSERVACAO',      
    'NAO_APLICAVEL'
  )),
  evidencia TEXT,                                
  evidencia_url TEXT,                            

  
  verificado_por INTEGER,                        
  verificado_em TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sgso_auditorias (
  id TEXT PRIMARY KEY,                           
  empresa_id INTEGER NOT NULL,

  tipo TEXT NOT NULL CHECK (tipo IN (
    'INTERNA',              
    'EXTERNA',              
    'RAMP_CHECK',           
    'OPERACIONAL',          
    'MANUTENCAO',           
    'REVISAO_SGO',          
    'FORNECEDORES'          
  )),

  titulo TEXT NOT NULL,
  descricao TEXT,
  template_id INTEGER,                           

  
  data_programada TEXT,                          
  data_realizada TEXT,

  
  auditor_id INTEGER,                            
  auditado_setor TEXT,                           

  
  status TEXT NOT NULL DEFAULT 'PROGRAMADA' CHECK (status IN (
    'PROGRAMADA',
    'EM_ANDAMENTO',
    'CONCLUIDA',
    'CANCELADA'
  )),

  
  total_itens INTEGER DEFAULT 0,
  itens_conformes INTEGER DEFAULT 0,
  itens_nc_major INTEGER DEFAULT 0,
  itens_nc_minor INTEGER DEFAULT 0,
  itens_observacao INTEGER DEFAULT 0,
  percentual_conformidade REAL,                  

  observacoes_gerais TEXT,
  relatorio_url TEXT,                            

  
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE sgso_avaliacao_risco (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relato_id TEXT NOT NULL,                       
  empresa_id INTEGER NOT NULL,                   

  tipo_avaliacao TEXT NOT NULL CHECK (tipo_avaliacao IN (
    'INICIAL',    
    'RESIDUAL'    
  )),

  
  probabilidade TEXT NOT NULL CHECK (probabilidade IN (
    'A',  
    'B',  
    'C',  
    'D',  
    'E'   
  )),
  severidade INTEGER NOT NULL CHECK (severidade BETWEEN 1 AND 5),
  

  
  nivel_risco TEXT NOT NULL CHECK (nivel_risco IN ('BAIXO', 'MEDIO', 'ALTO', 'CRITICO')),

  
  probabilidade_original TEXT,                   
  elevado_por_fadiga INTEGER DEFAULT 0 CHECK (elevado_por_fadiga IN (0, 1)),
  justificativa_elevacao TEXT,                   

  
  justificativa TEXT,                            

  
  avaliador_id INTEGER NOT NULL,                 
  data_avaliacao TEXT NOT NULL DEFAULT (datetime('now')),

  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE sgso_avaliacao_risco_contexto (
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

CREATE TABLE sgso_bowtie_barreira_historico (
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

CREATE TABLE sgso_bowtie_barreira_vinculos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barreira_id TEXT NOT NULL,
  no_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(barreira_id, no_id)
);

CREATE TABLE sgso_bowtie_barreiras (
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

CREATE TABLE sgso_bowtie_cenarios (
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
  deleted_at TEXT, probabilidade_base REAL NOT NULL DEFAULT 1.0,

  UNIQUE(empresa_id, codigo)
);

CREATE TABLE sgso_bowtie_nos (
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

CREATE TABLE sgso_categorias_adrep (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,                   
  nome_pt TEXT NOT NULL,                         
  nome_en TEXT,                                  
  categoria_pai_id INTEGER,                      
  ativo INTEGER DEFAULT 1
);

CREATE TABLE sgso_frat_aprovacoes (
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
, nivel TEXT NOT NULL DEFAULT 'L1');

CREATE TABLE sgso_frat_avaliacoes (
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
, nivel_aprovacao_atual TEXT NOT NULL DEFAULT 'L1', origem_vinculo TEXT NOT NULL DEFAULT 'MANUAL', frms_fadiga_checkin_id TEXT);

CREATE TABLE sgso_frat_fatores (
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

CREATE TABLE sgso_frat_modelos (
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

CREATE TABLE sgso_frat_respostas (
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

CREATE TABLE sgso_licoes_aprendidas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relato_id TEXT NOT NULL,
  empresa_id INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  resumo TEXT,
  licoes_json TEXT NOT NULL,
  investigation_type TEXT NOT NULL,
  status_publicacao TEXT NOT NULL DEFAULT 'PENDENTE',
  edapp_course_id TEXT,
  edapp_publicado_em TEXT,
  erro_publicacao TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(relato_id)
);

CREATE TABLE sgso_matriz_risco_celulas (
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

CREATE TABLE sgso_matriz_risco_perfis (
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

CREATE TABLE sgso_moc_aprovacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  moc_id TEXT NOT NULL,
  empresa_id INTEGER NOT NULL,
  status_novo TEXT NOT NULL,
  observacao TEXT,
  aprovador_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sgso_moc_registros (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  descricao_mudanca TEXT NOT NULL,
  motivo TEXT NOT NULL,
  impacto_operacional TEXT NOT NULL,
  risco_nivel TEXT NOT NULL CHECK (risco_nivel IN ('BAIXO', 'MEDIO', 'ALTO', 'CRITICO')),
  status TEXT NOT NULL DEFAULT 'RASCUNHO' CHECK (status IN (
    'RASCUNHO',
    'EM_AVALIACAO',
    'APROVADO',
    'IMPLEMENTADO',
    'REJEITADO',
    'CANCELADO'
  )),
  data_planejada TEXT,
  owner_id INTEGER,
  aprovado_por INTEGER,
  aprovado_em TEXT,
  areas_afetadas_json TEXT,
  mitigacoes_planejadas_json TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE sgso_nao_conformidades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,

  
  auditoria_id TEXT,                             
  auditoria_item_id INTEGER,                     
  relato_id TEXT,                                

  tipo TEXT NOT NULL CHECK (tipo IN (
    'MAJOR',        
    'MINOR',        
    'OBSERVACAO'    
  )),

  descricao TEXT NOT NULL,
  rbac_referencia TEXT,                          
  causa_raiz TEXT,                               

  
  responsavel_id INTEGER,                        
  prazo_resolucao TEXT,                          

  
  status TEXT NOT NULL DEFAULT 'ABERTA' CHECK (status IN (
    'ABERTA',
    'EM_RESOLUCAO',
    'AGUARDANDO_VERIFICACAO',
    'FECHADA',
    'CANCELADA'
  )),

  
  fechada_por INTEGER,                           
  fechada_em TEXT,
  evidencia_fechamento TEXT,
  evidencia_url TEXT,

  
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE sgso_perigos (
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

CREATE TABLE sgso_protocolo_sequencia (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  ano INTEGER NOT NULL,
  ultimo_numero INTEGER NOT NULL DEFAULT 0,
  UNIQUE(empresa_id, ano)
);

CREATE TABLE sgso_relato_capturas (
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

CREATE TABLE sgso_relato_ia_triagem (
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

CREATE TABLE sgso_relato_notificacoes (
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

CREATE TABLE sgso_relato_perigos (
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

CREATE TABLE sgso_relato_privacidade (
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

CREATE TABLE sgso_relato_workflow_eventos (
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

CREATE TABLE sgso_relatos (
  id TEXT PRIMARY KEY,                          
  empresa_id INTEGER NOT NULL,                   
  numero_protocolo TEXT NOT NULL UNIQUE,         

  
  tipo TEXT NOT NULL CHECK (tipo IN (
    'OCORRENCIA',   
    'PERIGO',       
    'INCIDENTE',    
    'ACIDENTE'      
  )),
  anonimo INTEGER NOT NULL DEFAULT 0 CHECK (anonimo IN (0, 1)),
  relator_id INTEGER,                            

  
  aeronave_id INTEGER,                           
  aeronave_matricula TEXT,                       
  aeronave_modelo TEXT,                          

  
  data_ocorrencia TEXT NOT NULL,                 
  local_icao TEXT,                               
  local_descricao TEXT,                          

  
  fase_voo TEXT CHECK (fase_voo IN (
    'PREFLIGHT', 'TAXI', 'DECOLAGEM', 'SUBIDA',
    'CRUZEIRO', 'DESCIDA', 'APROXIMACAO', 'POUSO',
    'POS_VOO', 'SOLO', 'MANUTENCAO', 'NAO_APLICAVEL'
  )),
  condicao_meteorologica TEXT CHECK (condicao_meteorologica IN (
    'VMC', 'IMC', 'NOITE_VMC', 'NOITE_IMC', 'DEGRADADA', 'NAO_APLICAVEL'
  )),

  
  descricao TEXT NOT NULL,                       
  consequencia TEXT,                             
  accao_imediata TEXT,                           

  
  categoria_adrep TEXT,                          
  subcategoria_adrep TEXT,                       

  
  status TEXT NOT NULL DEFAULT 'ABERTO' CHECK (status IN (
    'ABERTO',           
    'EM_ANALISE',       
    'AGUARDANDO_ACAO',  
    'FECHADO'           
  )),
  gso_responsavel_id INTEGER,                    

  
  escala_id TEXT,                                
  escala_quinzena INTEGER,                       
  frms_jornada_id INTEGER,                       
  efetividade_cognitiva REAL,                    
  horas_acumuladas_7d REAL,                      
  horas_acumuladas_28d REAL,                     
  qualificacoes_vencidas INTEGER DEFAULT 0,      
  dias_embarcado INTEGER,                        

  
  arquivo_url TEXT,                              
  arquivo_nome TEXT,

  
  fechado_por INTEGER,                           
  fechado_em TEXT,                               
  observacoes_fechamento TEXT,

  
  created_by INTEGER,                            
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT                                
, em_triagem_em TEXT, em_investigacao_em TEXT, concluido_em TEXT, sla_triagem_prazo TEXT, sla_investigacao_prazo TEXT, sla_triagem_violado INTEGER NOT NULL DEFAULT 0, sla_investigacao_violado INTEGER NOT NULL DEFAULT 0, investigador_id INTEGER REFERENCES funcionarios(id), tipo_investigacao TEXT DEFAULT 'OBSERVACAO', resumo_fechamento TEXT, licoes_aprendidas_json TEXT);

CREATE TABLE sgso_relatos_arquivos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relato_id TEXT NOT NULL,                       
  empresa_id INTEGER NOT NULL,

  
  url TEXT NOT NULL,                             
  nome_original TEXT NOT NULL,                   
  tipo_mime TEXT,                                
  tamanho_bytes INTEGER,

  
  tipo_documento TEXT CHECK (tipo_documento IN (
    'FOTO_OCORRENCIA',
    'FOTO_RAMPA',
    'LAUDO_TECNICO',
    'REGISTRO_MANUTENCAO',
    'EVIDENCIA_ACAO',
    'OUTRO'
  )),
  descricao TEXT,

  
  uploaded_by INTEGER,                           
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE sgso_relatos_comentarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relato_id TEXT NOT NULL,                       
  empresa_id INTEGER NOT NULL,

  texto TEXT NOT NULL,
  interno INTEGER NOT NULL DEFAULT 1 CHECK (interno IN (0, 1)),
  

  autor_id INTEGER NOT NULL,                     
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE sgso_relatos_fatores_humanos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relato_id TEXT NOT NULL,                       
  empresa_id INTEGER NOT NULL,                   

  
  nivel_hfacs TEXT NOT NULL CHECK (nivel_hfacs IN (
    'ACOES_INSEGURAS',              
    'PRECONDICOES',                 
    'SUPERVISAO',                   
    'INFLUENCIAS_ORGANIZACIONAIS'   
  )),

  
  categoria TEXT NOT NULL,
  
  
  
  
  

  subcategoria TEXT,                             
  descricao TEXT,                                

  
  efetividade_cognitiva_capturada REAL,          
  fonte_automatica INTEGER DEFAULT 0 CHECK (fonte_automatica IN (0, 1)),
  

  
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE sgso_relatos_historico_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relato_id TEXT NOT NULL,                       
  empresa_id INTEGER NOT NULL,

  status_anterior TEXT,                          
  status_novo TEXT NOT NULL,
  motivo TEXT,                                   
  alterado_por INTEGER NOT NULL,                 
  alterado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sgso_relatos_midias_metadados (
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

CREATE TABLE sgso_sla_config (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id          INTEGER NOT NULL REFERENCES empresas(id),
  fase                TEXT    NOT NULL CHECK (fase IN ('TRIAGEM', 'INVESTIGACAO', 'RESOLUCAO')),
  horas_prazo         INTEGER NOT NULL DEFAULT 24,
  horas_alerta_previa INTEGER NOT NULL DEFAULT 4,
  ativo               INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, fase)
);

CREATE TABLE sgso_spi_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,

  codigo TEXT NOT NULL,                          
  nome TEXT NOT NULL,
  descricao TEXT,
  unidade TEXT,                                  

  
  meta_valor REAL,                               
  meta_operador TEXT CHECK (meta_operador IN ('>=', '<=', '=', '>', '<')),
  

  alerta_valor REAL,                             
  alerta_operador TEXT CHECK (alerta_operador IN ('>=', '<=', '=', '>', '<')),

  ativo INTEGER DEFAULT 1 CHECK (ativo IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(empresa_id, codigo)
);

CREATE TABLE sigvoos_mapeamento_manual (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER,
  nome_sigvoos TEXT NOT NULL,
  inscricao_sigvoos TEXT,
  canac_sigvoos TEXT,
  funcionario_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE TABLE simulador_agendamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  simulador_id INTEGER,
  funcionario_id INTEGER NOT NULL,
  instrutor_id INTEGER NOT NULL,
  checador_id INTEGER,
  template_id INTEGER,
  data DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  duracao_minutos INTEGER,
  status TEXT DEFAULT 'AGENDADO',
  tipo_sessao TEXT,
  observacoes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  nome TEXT,
  examinador_id INTEGER NULL,
  is_check INTEGER NOT NULL DEFAULT 0,
  empresa_id INTEGER REFERENCES empresas(id),
  tipo_dispositivo TEXT NOT NULL DEFAULT 'SIMULADOR'
    CHECK (tipo_dispositivo IN ('SIMULADOR', 'AERONAVE')),
  aeronave_id INTEGER REFERENCES aeronaves(id)
, modo_compartilhado INTEGER NOT NULL DEFAULT 0 CHECK (modo_compartilhado IN (0, 1)));

CREATE TABLE sessoes_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessao_id INTEGER NOT NULL,
  qualificacao_tipo_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (sessao_id) REFERENCES simulador_agendamentos(id),
  FOREIGN KEY (qualificacao_tipo_id) REFERENCES qualificacoes_tipos(id)
);

CREATE TABLE sessoes_checks_resultados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessao_check_id INTEGER NOT NULL,
  aprovado INTEGER NOT NULL DEFAULT 0,
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (sessao_check_id) REFERENCES sessoes_checks(id)
);

CREATE TABLE simuladores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  modelo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  fabricante TEXT,
  localizacao TEXT,
  capacidade INTEGER DEFAULT 1,
  status TEXT CHECK(status IN ('ATIVO', 'MANUTENCAO', 'INATIVO')) DEFAULT 'ATIVO',
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
, codigo_aeronave TEXT, aeronave_codigo TEXT);

CREATE TABLE solicitacoes_lgpd (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('confirmacao_dados','acesso_dados','correcao_dados','anonimizacao','eliminacao','portabilidade','informacao_compartilhamento','revogacao_consentimento')),
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK(status IN ('PENDENTE','EM_ANDAMENTO','CONCLUIDA','REJEITADA')),
  descricao TEXT,
  data_solicitacao TEXT DEFAULT (datetime('now')),
  data_conclusao TEXT,
  responsavel_id INTEGER,
  observacoes TEXT, deleted_at TEXT DEFAULT NULL,
  FOREIGN KEY (funcionario_id) REFERENCES "funcionarios_backup"(id)
);

CREATE TABLE solicitacoes_treinamento (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  empresa_id INTEGER NOT NULL,
  
  -- Quem solicita
  solicitante_id INTEGER NOT NULL,        -- FK funcionarios
  
  -- Treinamento
  qualificacao_id INTEGER,                -- FK qualificacoes_tipos (se for qualificação específica)
  tipo_treinamento TEXT NOT NULL,         -- INICIAL | RECORRENTE | UPGRADE | ESPECIFICO
  titulo TEXT NOT NULL,
  descricao TEXT,
  justificativa TEXT,
  
  -- Workflow
  status TEXT NOT NULL DEFAULT 'SOLICITADA', -- SOLICITADA | APROVADA_GESTOR | APROVADA_OPS | AGENDADA | CONCLUIDA | REJEITADA
  aprovado_gestor_por INTEGER,            -- FK funcionarios
  aprovado_gestor_em TEXT,
  aprovado_ops_por INTEGER,               -- FK funcionarios
  aprovado_ops_em TEXT,
  motivo_rejeicao TEXT,
  rejeitado_por INTEGER,
  rejeitado_em TEXT,
  
  -- Agendamento (pós aprovação)
  data_prevista TEXT,                     -- YYYY-MM-DD
  data_realizada TEXT,                    -- YYYY-MM-DD
  sessao_simulador_id TEXT,              -- FK simulador_agendamentos (se aplicável)
  
  -- Prioridade
  prioridade TEXT NOT NULL DEFAULT 'NORMAL', -- BAIXA | NORMAL | ALTA | URGENTE
  
  -- Audit
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
, lms_matricula_id INTEGER REFERENCES lms_matriculas(id), treinamento_planejado_id INTEGER, status_pre_agendamento TEXT);

CREATE TABLE system_config (
    key TEXT PRIMARY KEY,
    value TEXT,
    description TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL, -- 'INFO', 'WARNING', 'ERROR', 'CRITICAL'
    message TEXT NOT NULL,
    details TEXT, -- JSON
    timestamp TEXT DEFAULT (datetime('now'))
);

CREATE TABLE tipos_check (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL UNIQUE, nome TEXT NOT NULL, descricao TEXT, qualificacao_tipo_id INTEGER NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT);

CREATE TABLE "tipos_sessao" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo INTEGER DEFAULT 1,
  ordem INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME,
  empresa_id INTEGER NOT NULL
, cor TEXT);

CREATE TABLE token_blocklist (
  jti TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE treinamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL,
  descricao TEXT,
  periodicidade INTEGER,
  carga_horaria INTEGER,
  instrutor TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
, total_sessoes INTEGER DEFAULT 1, instrutor_responsavel TEXT, certificacao_relacionada TEXT, status TEXT DEFAULT 'ATIVO', categoria_id INTEGER REFERENCES "qualificacoes_categorias"(id), periodicidade_meses INTEGER);

CREATE TABLE sessoes_treinamento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  treinamento_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  data_inicio TEXT NOT NULL,
  data_conclusao TEXT,
  status TEXT CHECK(status IN ('AGENDADO','EM_ANDAMENTO','CONCLUIDO','CANCELADO')) DEFAULT 'AGENDADO',
  nota_final REAL,
  aprovado INTEGER,
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')), deleted_at TEXT DEFAULT NULL,
  FOREIGN KEY (treinamento_id) REFERENCES treinamentos(id),
  FOREIGN KEY (funcionario_id) REFERENCES "funcionarios_backup"(id)
);

CREATE TABLE treinamentos_convocacoes_email (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  treinamento_id INTEGER NOT NULL,
  disparado_por INTEGER,
  disparado_por_nome TEXT,
  assunto TEXT NOT NULL,
  template_html_snapshot TEXT,
  reply_to TEXT,
  cc_json TEXT,
  avisos_json TEXT,
  destinatarios_total INTEGER NOT NULL DEFAULT 0,
  enviados_sucesso INTEGER NOT NULL DEFAULT 0,
  enviados_falha INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE treinamentos_convocacoes_email_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  convocacao_id INTEGER NOT NULL,
  treinamento_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  email_destino TEXT,
  status TEXT NOT NULL,
  erro_mensagem TEXT,
  provider_message_id TEXT,
  payload_json TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE treinamentos_participantes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        treinamento_id INTEGER NOT NULL,
        funcionario_id INTEGER NOT NULL,
        confirmado INTEGER DEFAULT 0,
        presente INTEGER,
        aprovado INTEGER,
        nota REAL,
        observacoes TEXT,
        qualificacao_historico_id INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')), status_participacao TEXT NOT NULL DEFAULT 'MATRICULADO', resultado TEXT, conceito TEXT, data_conclusao_efetiva TEXT, concluido_em TEXT, concluido_por INTEGER,
        UNIQUE(treinamento_id, funcionario_id)
      );

CREATE TABLE treinamentos_planejados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL,
        qualificacao_tipo_id INTEGER NOT NULL,
        data_prevista TEXT NOT NULL,
        hora_inicio TEXT,
        hora_fim TEXT,
        status TEXT NOT NULL DEFAULT 'PLANEJADO' CHECK(status IN ('PLANEJADO', 'CONFIRMADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO')),
        instrutor_id INTEGER,
        simulador_id INTEGER,
        aeronave_id INTEGER,
        local TEXT,
        carga_horaria_prevista INTEGER,
        titulo TEXT,
        descricao TEXT,
        observacoes TEXT,
        motivo_cancelamento TEXT,
        efetivado_em TEXT,
        efetivado_por INTEGER,
        sessao_id INTEGER,
        created_by INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT
      , codigo_turma TEXT, modalidade TEXT NOT NULL DEFAULT 'TEORICO', data_inicio TEXT, data_fim TEXT, base TEXT, sala TEXT, equipamento_descricao TEXT, limite_participantes INTEGER);

CREATE TABLE simulador_atribuicoes_curriculares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  empresa_id INTEGER NOT NULL,
  agendamento_id INTEGER NOT NULL,
  participante_id INTEGER NOT NULL,
  treinamento_planejado_id INTEGER,
  modelo_sessao_id INTEGER,
  gera_ficha INTEGER NOT NULL DEFAULT 1 CHECK (gera_ficha IN (0, 1)),
  carga_horaria_total_minutos INTEGER NOT NULL DEFAULT 0 CHECK (carga_horaria_total_minutos >= 0),
  status TEXT NOT NULL DEFAULT 'ATIVA' CHECK (status IN ('ATIVA', 'CANCELADA', 'CONCLUIDA')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (agendamento_id) REFERENCES simulador_agendamentos(id),
  FOREIGN KEY (participante_id) REFERENCES sessoes_participantes(id),
  FOREIGN KEY (treinamento_planejado_id) REFERENCES treinamentos_planejados(id),
  FOREIGN KEY (modelo_sessao_id) REFERENCES modelos_sessao(id)
);

CREATE TABLE "fichas_sessao" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  agendamento_slot_id INTEGER,
  colaborador_id_aluno INTEGER NOT NULL,
  funcao_na_sessao TEXT DEFAULT 'PF',
  template_id INTEGER,
  instrutor_id INTEGER NOT NULL,
  instrutor_codigo_anac TEXT,
  carga_horaria_total DECIMAL(4,2) DEFAULT 2.0,
  carga_horaria_pf DECIMAL(4,2),
  carga_horaria_pm DECIMAL(4,2),
  tempo_acumulado DECIMAL(5,2) DEFAULT 0,
  status TEXT DEFAULT 'PENDENTE',
  resultado_final TEXT DEFAULT 'PENDENTE',
  nota_final REAL,
  nota_minima REAL,
  aprovado BOOLEAN DEFAULT 0,
  aluno_nome_validado TEXT,
  aluno_matricula_validado TEXT,
  observacoes TEXT,
  feedback_instrutor TEXT,
  pontos_fortes TEXT,
  pontos_melhoria TEXT,
  assinado BOOLEAN DEFAULT 0,
  data_assinatura DATETIME,
  hash_assinatura TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  observacoes_gerais TEXT,
  assinatura_instrutor_completa INTEGER DEFAULT 0,
  assinatura_aluno_completa INTEGER DEFAULT 0,
  data_conclusao TEXT,
  pdf_url TEXT,
  empresa_id INTEGER NOT NULL,
  assinatura_instrutor INTEGER DEFAULT 0,
  assinatura_instrutor_data DATETIME,
  assinatura_instrutor_usuario_id INTEGER,
  assinatura_tripulante INTEGER DEFAULT 0,
  assinatura_tripulante_data DATETIME,
  assinatura_tripulante_usuario_id INTEGER,
  tipo_sessao TEXT,
  tipo_aeronave TEXT,
  data_sessao TEXT,
  assinatura_aluno_ip TEXT,
  assinatura_aluno_timestamp TEXT,
  assinatura_instrutor_ip TEXT,
  assinatura_instrutor_timestamp TEXT,
  arquivado INTEGER DEFAULT 0,
  caminho_arquivo TEXT,
  data_arquivamento TEXT,
  assinatura_aluno_imagem TEXT,
  assinatura_instrutor_imagem TEXT
, atribuicao_curricular_id INTEGER REFERENCES simulador_atribuicoes_curriculares(id));

CREATE TABLE "ficha_manobras_avaliacao" ( id INTEGER PRIMARY KEY AUTOINCREMENT, ficha_id INTEGER NOT NULL, manobra_id INTEGER NOT NULL, nota REAL DEFAULT 0, observacoes TEXT, executada BOOLEAN DEFAULT 0, data_execucao DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT DEFAULT NULL, FOREIGN KEY (ficha_id) REFERENCES fichas_sessao(id), FOREIGN KEY (manobra_id) REFERENCES manobras(id), UNIQUE(ficha_id, manobra_id) );

CREATE TABLE fichas_manobras_historico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ficha_uuid TEXT NOT NULL,
        participante_id INTEGER NOT NULL,
        manobra_id INTEGER NOT NULL,
        manobra_codigo TEXT NOT NULL,
        manobra_nome TEXT NOT NULL,
        nota_atual REAL NOT NULL CHECK(nota_atual >= 0 AND nota_atual <= 10),
        observacoes TEXT,
        avaliador_id INTEGER NOT NULL,
        data_avaliacao TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        FOREIGN KEY (ficha_uuid) REFERENCES fichas_sessao(uuid) ON DELETE CASCADE,
        FOREIGN KEY (participante_id) REFERENCES funcionarios(id) ON DELETE CASCADE,
        FOREIGN KEY (manobra_id) REFERENCES manobras(id) ON DELETE CASCADE,
        FOREIGN KEY (avaliador_id) REFERENCES funcionarios(id) ON DELETE CASCADE
      );

CREATE TABLE fichas_sessao_edicoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ficha_id INTEGER NOT NULL,
  empresa_id INTEGER,
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'APROVADA', 'REJEITADA', 'CANCELADA')),

  solicitante_usuario_id TEXT,
  solicitante_funcionario_id INTEGER NOT NULL,
  motivo TEXT NOT NULL,

  snapshot_antes_json TEXT NOT NULL,
  alteracoes_json TEXT NOT NULL,

  aprovador_usuario_id TEXT,
  decisao_observacoes TEXT,
  aprovado_em TEXT,
  rejeitado_em TEXT,

  ip_address TEXT,
  user_agent TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,

  FOREIGN KEY (ficha_id) REFERENCES fichas_sessao(id),
  FOREIGN KEY (solicitante_funcionario_id) REFERENCES funcionarios(id)
);

CREATE TABLE fichas_sessao_manobras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ficha_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT,
  ordem INTEGER DEFAULT 0,
  resultado TEXT DEFAULT 'NAO_REALIZADA',
  observacoes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP, tripulante TEXT NOT NULL DEFAULT 'AB' CHECK(tripulante IN ('A','B','AB')), nome TEXT,
  FOREIGN KEY(ficha_id) REFERENCES fichas_sessao(id)
);

CREATE TABLE historico_notas_manobras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Identificação
  funcionario_id INTEGER NOT NULL,
  ficha_id INTEGER NOT NULL,
  codigo_manobra TEXT NOT NULL,
  descricao_manobra TEXT NOT NULL,
  categoria_manobra TEXT,
  
  -- Avaliação
  nota REAL NOT NULL CHECK (nota >= 0 AND nota <= 10),
  observacoes TEXT,
  
  -- Contexto da sessão
  data_sessao TEXT NOT NULL,
  tipo_sessao TEXT NOT NULL,
  tipo_aeronave TEXT,
  instrutor_id INTEGER,
  
  -- Metadata
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  
  -- Foreign Keys
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (ficha_id) REFERENCES fichas_sessao(id),
  FOREIGN KEY (instrutor_id) REFERENCES funcionarios(id)
);

CREATE TABLE simulador_agendamento_segmentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  empresa_id INTEGER NOT NULL,
  agendamento_id INTEGER NOT NULL,
  ordem INTEGER NOT NULL,
  inicio TEXT NOT NULL,
  fim TEXT NOT NULL,
  duracao_minutos INTEGER NOT NULL CHECK (duracao_minutos > 0),
  atribuicao_curricular_id INTEGER,
  status TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'CANCELADO')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (agendamento_id) REFERENCES simulador_agendamentos(id),
  FOREIGN KEY (atribuicao_curricular_id) REFERENCES simulador_atribuicoes_curriculares(id),
  CHECK (inicio <> fim)
);

CREATE TABLE simulador_segmento_participantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  empresa_id INTEGER NOT NULL,
  segmento_id INTEGER NOT NULL,
  participante_id INTEGER NOT NULL,
  funcao TEXT NOT NULL CHECK (funcao IN ('PF', 'PM')),
  duracao_minutos INTEGER NOT NULL CHECK (duracao_minutos > 0),
  atribuicao_curricular_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (segmento_id) REFERENCES simulador_agendamento_segmentos(id),
  FOREIGN KEY (participante_id) REFERENCES sessoes_participantes(id),
  FOREIGN KEY (atribuicao_curricular_id) REFERENCES simulador_atribuicoes_curriculares(id)
);

CREATE TABLE treinamentos_dias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  treinamento_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  hora_inicio TEXT NOT NULL DEFAULT '08:00',
  hora_fim TEXT NOT NULL DEFAULT '17:00',
  local TEXT,
  instrutor_id INTEGER,
  simulador_id INTEGER,
  aeronave_id INTEGER,
  sessao_id INTEGER,
  status TEXT NOT NULL DEFAULT 'ATIVO'
    CHECK(status IN ('ATIVO', 'CANCELADO', 'SUBSTITUIDO')),
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (treinamento_id) REFERENCES treinamentos_planejados(id) ON DELETE CASCADE,
  FOREIGN KEY (instrutor_id) REFERENCES funcionarios(id),
  FOREIGN KEY (simulador_id) REFERENCES simuladores(id),
  UNIQUE(treinamento_id, data)
);

CREATE TABLE treinamentos_instrutores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  treinamento_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  papel TEXT NOT NULL DEFAULT 'INSTRUTOR',
  principal INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (treinamento_id) REFERENCES treinamentos_planejados(id) ON DELETE CASCADE,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  UNIQUE(treinamento_id, funcionario_id)
);

CREATE TABLE usuario_preferencias (
        id TEXT PRIMARY KEY,
        usuario_id TEXT NOT NULL,
        empresa_id INTEGER NOT NULL,
        chave TEXT NOT NULL,
        valor TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT,
        UNIQUE(usuario_id, empresa_id, chave)
      );

CREATE TABLE "usuarios" (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  email                  TEXT    NOT NULL UNIQUE,
  password_hash          TEXT    NOT NULL,
  nome                   TEXT    NOT NULL,
  perfil                 TEXT    NOT NULL DEFAULT 'ALUNO'
                         CHECK(perfil IN (
                           'ADMIN','ADMINISTRADOR',
                           'GESTOR',
                           'INSTRUTOR',
                           'ALUNO',
                           'COMPLIANCE',
                           'USUARIO'
                         )),
  funcionario_id         INTEGER,
  deleted_at             TEXT    DEFAULT NULL,
  created_at             TEXT    DEFAULT (datetime('now')),
  updated_at             TEXT    DEFAULT (datetime('now')),
  active                 INTEGER DEFAULT 1,
  last_login             TEXT,
  failed_login_attempts  INTEGER DEFAULT 0,
  locked_until           TEXT
);

CREATE TABLE convites_usuarios (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token      TEXT    NOT NULL UNIQUE,
  usuario_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  email      TEXT    NOT NULL,
  role       TEXT,
  created_by INTEGER,
  expires_at TEXT    NOT NULL,
  used_at    TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE TABLE "importacoes_log" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entidade TEXT NOT NULL,
  usuario_id INTEGER,
  total_rows INTEGER NOT NULL DEFAULT 0,
  to_create INTEGER NOT NULL DEFAULT 0,
  to_update INTEGER NOT NULL DEFAULT 0,
  to_skip INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  merge_mode TEXT,
  raw_data TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  empresa_id INTEGER NOT NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE password_reset_tokens (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, email TEXT NOT NULL, token_hash TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT, FOREIGN KEY (user_id) REFERENCES usuarios(id));

CREATE TABLE refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES usuarios(id)
);

CREATE TABLE sessoes (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  data_inicio TEXT,
  data_fim TEXT,
  duracao_minutos INTEGER,
  tipo TEXT DEFAULT 'SIMULADOR', -- 'SIMULADOR', 'TREINAMENTO', 'TEMPLATE'
  status TEXT DEFAULT 'AGENDADA', -- 'AGENDADA', 'EM_PROGRESSO', 'CONCLUIDA', 'CANCELADA'
  instrutor_id INTEGER,
  migrado_de TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, carga_horaria INTEGER, hora_diurna INTEGER, hora_noturna INTEGER, pouso_diurno INTEGER, pouso_noturno INTEGER, deleted_at TEXT DEFAULT NULL,
  FOREIGN KEY (instrutor_id) REFERENCES usuarios(id)
);

CREATE TABLE setores_gestores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setor_id INTEGER NOT NULL,
  gestor_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  role TEXT DEFAULT 'manager', 
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT, usuario_id INTEGER REFERENCES usuarios(id),
  
  
  FOREIGN KEY (setor_id) REFERENCES setores(id),
  FOREIGN KEY (gestor_id) REFERENCES notificacoes_convocacao_cc_gestores(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE TABLE support_access_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  access_level TEXT NOT NULL
    CHECK(access_level IN ('read_only', 'elevated')),
  granted_by_user_id INTEGER,
  granted_reason TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  revoked_by_user_id INTEGER,
  revoked_reason TEXT,
  FOREIGN KEY (user_id) REFERENCES usuarios(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (granted_by_user_id) REFERENCES usuarios(id),
  FOREIGN KEY (revoked_by_user_id) REFERENCES usuarios(id)
);

CREATE TABLE support_access_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  access_level TEXT NOT NULL
    CHECK(access_level IN ('read_only', 'elevated')),
  support_reason TEXT NOT NULL,
  request_id TEXT,
  correlation_id TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES usuarios(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE TABLE treinamentos_presencas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  treinamento_dia_id INTEGER NOT NULL,
  participante_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDENTE'
    CHECK(status IN ('PENDENTE', 'PRESENTE', 'AUSENTE', 'PARCIAL', 'DISPENSADO')),
  minutos_presentes INTEGER,
  observacoes TEXT,
  registrado_por INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (treinamento_dia_id) REFERENCES treinamentos_dias(id) ON DELETE CASCADE,
  FOREIGN KEY (participante_id) REFERENCES treinamentos_participantes(id) ON DELETE CASCADE,
  FOREIGN KEY (registrado_por) REFERENCES usuarios(id),
  UNIQUE(treinamento_dia_id, participante_id)
);

CREATE TABLE user_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id TEXT NOT NULL,
  permissao TEXT NOT NULL,
  recurso TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  UNIQUE(usuario_id, permissao, recurso)
);

CREATE TABLE user_platform_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  role_code TEXT NOT NULL
    CHECK(role_code IN ('platform_admin', 'support_read_only', 'support_elevated')),
  granted_by_user_id INTEGER,
  granted_reason TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  revoked_by_user_id INTEGER,
  revoked_reason TEXT,
  FOREIGN KEY (user_id) REFERENCES usuarios(id),
  FOREIGN KEY (granted_by_user_id) REFERENCES usuarios(id),
  FOREIGN KEY (revoked_by_user_id) REFERENCES usuarios(id)
);

CREATE TABLE user_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  telefone TEXT,
  departamento TEXT,
  cargo TEXT,
  preferencias TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')), deleted_at TEXT DEFAULT NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE usuario_permissoes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  INTEGER NOT NULL,
  permissao   TEXT    NOT NULL,
  tipo        TEXT    NOT NULL DEFAULT 'GRANT'
              CHECK(tipo IN ('GRANT', 'DENY')),
  created_by  INTEGER,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(usuario_id, permissao),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES usuarios(id)
);

CREATE TABLE usuarios_empresas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  role TEXT DEFAULT 'viewer',
  is_primary INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(usuario_id, empresa_id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE VIEW fichas_simulador AS
SELECT f.id, f.agendamento_slot_id AS sessao_id, f.colaborador_id_aluno AS funcionario_id,
  f.instrutor_id, a.data AS data_sessao, f.status, f.observacoes,
  f.created_at, f.updated_at, f.deleted_at
FROM fichas_sessao f
LEFT JOIN simulador_agendamentos a ON f.agendamento_slot_id = a.id;

CREATE VIEW sessoes_simulador AS
SELECT id, simulador_id, funcionario_id AS aluno_id, instrutor_id, checador_id,
  data AS data_sessao, hora_inicio, hora_fim, duracao_minutos, status, tipo_sessao,
  observacoes, created_at, updated_at, deleted_at
FROM simulador_agendamentos;

CREATE VIEW v_admin_actions_audit AS
SELECT 
  aa.id,
  aa.user_email,
  aa.action,
  aa.module,
  aa.deleted_count,
  aa.success,
  aa.error_message,
  aa.created_at,
  CASE 
    WHEN aa.action LIKE 'RESET_%' THEN '🗑️ Limpeza de Dados'
    ELSE '⚙️ Ação Admin'
  END as action_type
FROM admin_actions aa
WHERE aa.deleted_at IS NULL
ORDER BY aa.created_at DESC;

CREATE VIEW vw_cascade_metrics AS
SELECT 
  modelo,
  COUNT(*) as total_execucoes,
  SUM(CASE WHEN sucesso = 1 THEN 1 ELSE 0 END) as sucessos,
  SUM(CASE WHEN sucesso = 0 THEN 1 ELSE 0 END) as falhas,
  ROUND(AVG(tempo_ms), 2) as tempo_medio_ms,
  ROUND(AVG(score), 2) as score_medio,
  ROUND(100.0 * SUM(CASE WHEN sucesso = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) as taxa_sucesso
FROM audit_cascade
GROUP BY modelo;

CREATE VIEW vw_cascade_recentes AS
SELECT 
  id,
  modelo,
  arquivo,
  comando,
  tempo_ms,
  sucesso,
  score,
  created_at
FROM audit_cascade
ORDER BY created_at DESC
LIMIT 50;

CREATE VIEW vw_setores_gestores_ativo AS
SELECT
  sg.id,
  sg.setor_id,
  sg.gestor_id,
  sg.empresa_id,
  sg.role,
  s.nome as setor_nome,
  s.codigo as setor_codigo,
  g.nome as gestor_nome,
  g.email as gestor_email,
  g.cargo as gestor_cargo,
  sg.created_at
FROM setores_gestores sg
INNER JOIN setores s ON s.id = sg.setor_id
INNER JOIN notificacoes_convocacao_cc_gestores g ON g.id = sg.gestor_id
WHERE sg.deleted_at IS NULL
  AND sg.ativo = 1
  AND s.deleted_at IS NULL
  AND s.ativo = 1
  AND g.deleted_at IS NULL
  AND g.ativo = 1;

CREATE INDEX idx_admin_actions_action ON admin_actions(action);

CREATE INDEX idx_admin_actions_created_at ON admin_actions(created_at DESC);

CREATE INDEX idx_admin_actions_module ON admin_actions(module);

CREATE INDEX idx_admin_actions_user_id ON admin_actions(user_id);

CREATE INDEX idx_aeronaves_codigo ON aeronaves(codigo) WHERE deleted_at IS NULL;

CREATE INDEX idx_aeronaves_empresa ON aeronaves(empresa_id);

CREATE INDEX idx_aeronaves_status ON aeronaves(status) WHERE deleted_at IS NULL;

CREATE INDEX idx_agend_data_v5 ON simulador_agendamentos(data);

CREATE INDEX idx_agend_deleted_v5 ON simulador_agendamentos(deleted_at);

CREATE INDEX idx_agend_func_id_v5 ON simulador_agendamentos(funcionario_id);

CREATE INDEX idx_agend_sim_id_v5 ON simulador_agendamentos(simulador_id);

CREATE INDEX idx_agend_status_v5 ON simulador_agendamentos(status);

CREATE INDEX idx_agendamentos_data ON simulador_agendamentos(data);

CREATE INDEX idx_agendamentos_data_deleted ON simulador_agendamentos(data, deleted_at);

CREATE INDEX idx_agendamentos_data_simulador ON simulador_agendamentos(data, simulador_id);

CREATE INDEX idx_agendamentos_deleted ON simulador_agendamentos(deleted_at);

CREATE INDEX idx_agendamentos_deleted_at ON simulador_agendamentos(deleted_at);

CREATE INDEX idx_agendamentos_funcionario_id ON simulador_agendamentos(funcionario_id);

CREATE INDEX idx_agendamentos_instrutor_id ON simulador_agendamentos(instrutor_id);

CREATE INDEX idx_agendamentos_simulador_id ON simulador_agendamentos(simulador_id);

CREATE INDEX idx_agendamentos_status ON simulador_agendamentos(status);

CREATE INDEX idx_agendamentos_status_deleted_v2 ON simulador_agendamentos(status, deleted_at);

CREATE INDEX idx_agendamentos_uuid ON simulador_agendamentos(uuid);

CREATE INDEX idx_alertas_escala_empresa_tipo
  ON escala_alertas (escala_id, empresa_id, tipo)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_alertas_funcionario 
  ON alertas_reforco(funcionario_id, status, deleted_at);

CREATE INDEX idx_alertas_instrutor 
  ON alertas_reforco(instrutor_id_notificado, status, deleted_at);

CREATE INDEX idx_alertas_status 
  ON alertas_reforco(status, deleted_at);

CREATE INDEX idx_alertas_whatsapp_delivery_empresa_status
  ON alertas_whatsapp_delivery (empresa_id, status, updated_at DESC);

CREATE INDEX idx_alertas_whatsapp_delivery_funcionario
  ON alertas_whatsapp_delivery (funcionario_id, updated_at DESC);

CREATE INDEX idx_alertas_whatsapp_delivery_historico
  ON alertas_whatsapp_delivery (qualificacao_historico_id, updated_at DESC);

CREATE INDEX idx_alertas_whatsapp_templates_provider
  ON alertas_whatsapp_templates (provider, approval_status, updated_at DESC);

CREATE INDEX idx_alertas_whatsapp_templates_sid
  ON alertas_whatsapp_templates (twilio_content_sid);

CREATE INDEX idx_alocacoes_aeronave
  ON escala_alocacoes(aeronave_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_alocacoes_aeronave_funcao
  ON escala_alocacoes(aeronave_id, funcao)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_alocacoes_aeronave_funcao_datas
  ON escala_alocacoes (aeronave_id, funcao, data_inicio, data_fim)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_alocacoes_datas
  ON escala_alocacoes(data_inicio, data_fim)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_alocacoes_escala
  ON escala_alocacoes(escala_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_alocacoes_escala_aeronave
  ON escala_alocacoes(escala_id, aeronave_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_alocacoes_escala_funcionario
  ON escala_alocacoes(escala_id, funcionario_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_alocacoes_escala_funcionario_deleted
  ON escala_alocacoes (escala_id, funcionario_id, deleted_at);

CREATE INDEX idx_alocacoes_funcionario
  ON escala_alocacoes(funcionario_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_alocacoes_funcionario_datas
  ON escala_alocacoes(funcionario_id, data_inicio, data_fim)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_alocacoes_modelo_aeronave
  ON escala_alocacoes(modelo_aeronave)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_alocacoes_situacao_tipo
  ON escala_alocacoes(situacao_tipo)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_arquivos_empresa
  ON arquivos(empresa_id);

CREATE INDEX idx_audit_cascade_arquivo ON audit_cascade(arquivo);

CREATE INDEX idx_audit_cascade_created ON audit_cascade(created_at);

CREATE INDEX idx_audit_cascade_modelo ON audit_cascade(modelo);

CREATE INDEX idx_audit_cascade_score ON audit_cascade(score);

CREATE INDEX idx_audit_events_v2_actor_created
  ON audit_events_v2 (actor_user_id, created_at);

CREATE INDEX idx_audit_events_v2_category_created
  ON audit_events_v2 (event_category, created_at);

CREATE INDEX idx_audit_events_v2_empresa_created
  ON audit_events_v2 (empresa_id, created_at);

CREATE INDEX idx_audit_events_v2_request
  ON audit_events_v2 (request_id);

CREATE INDEX idx_audit_events_v2_target_empresa_created
  ON audit_events_v2 (target_empresa_id, created_at);

CREATE INDEX idx_audit_logs_acao_tabela ON audit_logs(acao, tabela, registro_id);

CREATE INDEX idx_audit_logs_action ON audit_logs(action);

CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

CREATE INDEX idx_audit_logs_empresa_usuario ON audit_logs(empresa_id, usuario_id);

CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);

CREATE INDEX idx_auditoria_acao ON auditoria_avancada_v2(acao);

CREATE INDEX idx_auditoria_created ON auditoria(created_at);

CREATE INDEX idx_auditoria_created_at ON auditoria_avancada_v2(created_at);

CREATE INDEX idx_auditoria_data ON pessoas_auditoria_acessos(acessado_em);

CREATE INDEX idx_auditoria_pessoa ON pessoas_auditoria_acessos(pessoa_id);

CREATE INDEX idx_auditoria_tabela ON auditoria(tabela_afetada);

CREATE INDEX idx_auditoria_tabela_registro ON auditoria_avancada_v2(tabela, registro_id);

CREATE INDEX idx_auditoria_usuario ON auditoria(usuario_id);

CREATE INDEX idx_auditoria_v2_registro ON auditoria_avancada_v2(registro_id);

CREATE INDEX idx_auditoria_v2_tabela ON auditoria_avancada_v2(tabela);

CREATE INDEX idx_avaliacoes_deleted_at ON "manobras_avaliacoes"(deleted_at);

CREATE INDEX idx_avaliacoes_ficha_id ON "manobras_avaliacoes"(ficha_id);

CREATE INDEX idx_avaliacoes_manobra_id ON "manobras_avaliacoes"(manobra_id);

CREATE INDEX idx_avaliacoes_nota ON "manobras_avaliacoes"(nota DESC);

CREATE INDEX idx_avaliacoes_uuid ON "manobras_avaliacoes"(uuid);

CREATE INDEX idx_catalogo_treinamentos_ativo ON catalogo_treinamentos(ativo);

CREATE INDEX idx_catalogo_treinamentos_categoria ON catalogo_treinamentos(categoria);

CREATE INDEX idx_catalogo_treinamentos_codigo ON catalogo_treinamentos(codigo);

CREATE INDEX idx_catalogo_treinamentos_tipo ON catalogo_treinamentos(tipo);

CREATE INDEX idx_categorias_codigo
  ON qualificacoes_categorias(codigo)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_categorias_qualificacoes_codigo
  ON qualificacoes_categorias(codigo);

CREATE INDEX idx_categorias_qualificacoes_empresa_deleted
  ON qualificacoes_categorias(empresa_id, deleted_at);

CREATE INDEX idx_categorias_qualificacoes_empresa_nome
  ON qualificacoes_categorias(empresa_id, nome);

CREATE INDEX idx_cert_deleted_v6 ON certificados(deleted_at);

CREATE INDEX idx_cert_func_id_v6 ON certificados(funcionario_id);

CREATE INDEX idx_cert_hab_id_v6 ON certificados(habilitacao_id);

CREATE INDEX idx_cert_qual_id_v6 ON certificados(qualificacao_id);

CREATE INDEX idx_certificado_anexos_cert ON certificado_anexos(certificado_id);

CREATE INDEX idx_certificados_deleted_at
ON certificados(deleted_at);

CREATE INDEX idx_certificados_empresa_id
ON certificados(empresa_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_certificados_funcionario_id
ON certificados(funcionario_id);

CREATE INDEX idx_certificados_habilitacao_id
ON certificados(habilitacao_id);

CREATE INDEX idx_certificados_qualificacao ON certificados(qualificacao_id, funcionario_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_certificados_qualificacao_id
ON certificados(qualificacao_id);

CREATE INDEX idx_cobertura_aeronave_data
  ON escala_cobertura_diaria(aeronave_id, data);

CREATE INDEX idx_cobertura_diaria_escala_aeronave
  ON escala_cobertura_diaria (escala_id, aeronave_id);

CREATE INDEX idx_cobertura_escala_data
  ON escala_cobertura_diaria(escala_id, data);

CREATE INDEX idx_cobertura_status
  ON escala_cobertura_diaria(escala_id, status_cobertura)
  WHERE status_cobertura != 'ok';

CREATE INDEX idx_convites_token ON convites_usuarios(token);

CREATE INDEX idx_credenciais_numero ON credenciais(numero);

CREATE INDEX idx_credenciais_pessoa ON credenciais(pessoa_id);

CREATE INDEX idx_credenciais_tipo ON credenciais(tipo);

CREATE INDEX idx_credenciais_vencendo ON credenciais(data_validade) 
  WHERE data_validade IS NOT NULL AND status = 'ATIVO' AND deleted_at IS NULL;

CREATE UNIQUE INDEX idx_cv_aeroportos_empresa_codigo
  ON cv_aeroportos (empresa_id, codigo)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_cv_aeroportos_empresa_deleted
  ON cv_aeroportos (empresa_id, deleted_at);

CREATE INDEX idx_cv_aeroportos_empresa_tipo_ativo
  ON cv_aeroportos (empresa_id, tipo, ativo)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_cv_conflitos_empresa_deleted
  ON cv_conflitos_integracao (empresa_id, deleted_at);

CREATE INDEX idx_cv_conflitos_empresa_entidade
  ON cv_conflitos_integracao (empresa_id, entidade_tipo, entidade_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_cv_conflitos_empresa_entidade_campo_aberto
  ON cv_conflitos_integracao (empresa_id, entidade_tipo, entidade_id, campo)
  WHERE status = 'ABERTO' AND deleted_at IS NULL;

CREATE INDEX idx_cv_conflitos_empresa_staging
  ON cv_conflitos_integracao (empresa_id, staging_id)
  WHERE staging_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_cv_conflitos_empresa_status_severidade
  ON cv_conflitos_integracao (empresa_id, status, severidade, created_at)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_cv_motivos_operacionais_empresa_codigo
  ON cv_motivos_operacionais (empresa_id, codigo)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_cv_motivos_operacionais_empresa_deleted
  ON cv_motivos_operacionais (empresa_id, deleted_at);

CREATE INDEX idx_cv_motivos_operacionais_empresa_tipo_ativo
  ON cv_motivos_operacionais (empresa_id, tipo, ativo)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_cv_naturezas_voo_empresa_ativo
  ON cv_naturezas_voo (empresa_id, ativo)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_cv_naturezas_voo_empresa_codigo
  ON cv_naturezas_voo (empresa_id, codigo)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_cv_naturezas_voo_empresa_deleted
  ON cv_naturezas_voo (empresa_id, deleted_at);

CREATE INDEX idx_cv_rdv_operacional_empresa_data_status
  ON cv_rdv_operacional (empresa_id, data_voo, status)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_cv_rdv_operacional_empresa_deleted
  ON cv_rdv_operacional (empresa_id, deleted_at);

CREATE UNIQUE INDEX idx_cv_rdv_operacional_empresa_numero
  ON cv_rdv_operacional (empresa_id, numero)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_cv_rdv_operacional_empresa_responsavel_data
  ON cv_rdv_operacional (empresa_id, responsavel_preenchimento_id, data_voo)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_cv_rdv_operacional_empresa_voo_ativo
  ON cv_rdv_operacional (empresa_id, voo_id)
  WHERE deleted_at IS NULL AND status <> 'cancelado';

CREATE INDEX idx_cv_sigvoos_staging_empresa_deleted
  ON cv_sigvoos_staging (empresa_id, deleted_at);

CREATE INDEX idx_cv_sigvoos_staging_empresa_fr_id
  ON cv_sigvoos_staging (empresa_id, sigvoos_flight_report_id)
  WHERE sigvoos_flight_report_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX idx_cv_sigvoos_staging_empresa_hash
  ON cv_sigvoos_staging (empresa_id, payload_hash)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_cv_sigvoos_staging_empresa_status_data
  ON cv_sigvoos_staging (empresa_id, import_status, data_operacional)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_cv_sigvoos_staging_empresa_window
  ON cv_sigvoos_staging (empresa_id, source_window_start, source_window_end)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_cv_tipos_voo_empresa_ativo
  ON cv_tipos_voo (empresa_id, ativo)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_cv_tipos_voo_empresa_codigo
  ON cv_tipos_voo (empresa_id, codigo)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_cv_tipos_voo_empresa_deleted
  ON cv_tipos_voo (empresa_id, deleted_at);

CREATE INDEX idx_cv_voo_etapas_empresa_deleted
  ON cv_voo_etapas (empresa_id, deleted_at);

CREATE INDEX idx_cv_voo_etapas_empresa_importado
  ON cv_voo_etapas (empresa_id, sigvoos_importado_em)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_cv_voo_etapas_empresa_voo_leg
  ON cv_voo_etapas (empresa_id, voo_id, sigvoos_leg_number)
  WHERE sigvoos_leg_number IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_cv_voo_etapas_empresa_voo_numero
  ON cv_voo_etapas (empresa_id, voo_id, numero_etapa)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_cv_voo_eventos_empresa_deleted
  ON cv_voo_eventos (empresa_id, deleted_at);

CREATE INDEX idx_cv_voo_eventos_empresa_tipo_created
  ON cv_voo_eventos (empresa_id, tipo_evento, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_cv_voo_eventos_empresa_usuario_created
  ON cv_voo_eventos (empresa_id, usuario_id, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_cv_voo_eventos_empresa_voo_created
  ON cv_voo_eventos (empresa_id, voo_id, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_cv_voo_tripulantes_empresa_deleted
  ON cv_voo_tripulantes (empresa_id, deleted_at);

CREATE INDEX idx_cv_voo_tripulantes_empresa_etapa
  ON cv_voo_tripulantes (empresa_id, etapa_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_cv_voo_tripulantes_empresa_etapa_staff
  ON cv_voo_tripulantes (empresa_id, etapa_id, sigvoos_staff_id)
  WHERE etapa_id IS NOT NULL AND sigvoos_staff_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_cv_voo_tripulantes_empresa_funcionario_apresentacao
  ON cv_voo_tripulantes (empresa_id, funcionario_id, horario_apresentacao)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_cv_voo_tripulantes_empresa_sigvoos_staff
  ON cv_voo_tripulantes (empresa_id, sigvoos_staff_id)
  WHERE sigvoos_staff_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_cv_voo_tripulantes_empresa_voo
  ON cv_voo_tripulantes (empresa_id, voo_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_cv_voo_tripulantes_empresa_voo_funcionario_funcao
  ON cv_voo_tripulantes (empresa_id, voo_id, funcionario_id, funcao)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_cv_voos_empresa_aeronave_data
  ON cv_voos (empresa_id, aeronave_id, data_programacao)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_cv_voos_empresa_data_status
  ON cv_voos (empresa_id, data_programacao, status)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_cv_voos_empresa_deleted
  ON cv_voos (empresa_id, deleted_at);

CREATE INDEX idx_cv_voos_empresa_origem_importacao
  ON cv_voos (empresa_id, origem_importacao, data_programacao)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_cv_voos_empresa_prefixo_data
  ON cv_voos (empresa_id, prefixo, data_programacao)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_cv_voos_empresa_sigvoos_fr_id
  ON cv_voos (empresa_id, sigvoos_flight_report_id)
  WHERE sigvoos_flight_report_id IS NOT NULL;

CREATE INDEX idx_cv_voos_empresa_sigvoos_importado
  ON cv_voos (empresa_id, sigvoos_importado_em)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_documentos_deleted
  ON documentos(deleted_at);

CREATE INDEX idx_documentos_empresa
  ON documentos(empresa_id);

CREATE INDEX idx_documentos_funcionario
  ON documentos(funcionario_id);

CREATE INDEX idx_documentos_funcionario_tipo
  ON documentos(funcionario_id, tipo)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_documentos_tipo
  ON documentos(tipo)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_domain_events_empresa_created
  ON domain_events(empresa_id, created_at);

CREATE INDEX idx_domain_events_empresa_processado
  ON domain_events(empresa_id, processado, created_at);

CREATE INDEX idx_domain_events_modulo_tipo
  ON domain_events(modulo, tipo, created_at);

CREATE UNIQUE INDEX idx_edapp_config_empresa_unique
  ON integracoes_edapp_config(empresa_id, chave)
  WHERE empresa_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX idx_edapp_config_global_unique
  ON integracoes_edapp_config(chave)
  WHERE empresa_id IS NULL AND deleted_at IS NULL;

CREATE INDEX idx_edapp_config_lookup
  ON integracoes_edapp_config(chave, empresa_id, deleted_at);

CREATE INDEX idx_edapp_cursos_edapp_id
  ON integracoes_edapp_cursos(edapp_course_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_edapp_cursos_empresa ON integracoes_edapp_cursos(empresa_id);

CREATE INDEX idx_edapp_cursos_empresa_course_active
  ON integracoes_edapp_cursos(empresa_id, edapp_course_id, ativo)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_edapp_cursos_qualificacao
  ON integracoes_edapp_cursos(qualificacao_codigo) WHERE deleted_at IS NULL;

CREATE INDEX idx_edapp_eventos_created
  ON integracoes_edapp_eventos(created_at) WHERE deleted_at IS NULL;

CREATE INDEX idx_edapp_eventos_empresa ON integracoes_edapp_eventos(empresa_id);

CREATE INDEX idx_edapp_eventos_empresa_lookup
  ON integracoes_edapp_eventos(empresa_id, tipo_evento, edapp_user_id, edapp_course_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_edapp_eventos_empresa_processado_created
  ON integracoes_edapp_eventos(empresa_id, processado, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_edapp_eventos_processado
  ON integracoes_edapp_eventos(processado) WHERE deleted_at IS NULL;

CREATE INDEX idx_edapp_eventos_tipo
  ON integracoes_edapp_eventos(tipo_evento) WHERE deleted_at IS NULL;

CREATE INDEX idx_edapp_usuarios_edapp
  ON integracoes_edapp_usuarios(edapp_user_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_edapp_usuarios_empresa ON integracoes_edapp_usuarios(empresa_id);

CREATE INDEX idx_edapp_usuarios_empresa_user_active
  ON integracoes_edapp_usuarios(empresa_id, edapp_user_id, ativo)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_edapp_usuarios_funcionario
  ON integracoes_edapp_usuarios(funcionario_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_empresa_cnpj ON empresas(cnpj);

CREATE INDEX idx_empresa_config_deleted_at ON empresa_config(deleted_at);

CREATE INDEX idx_empresa_config_empresa_id ON empresa_config(empresa_id);

CREATE INDEX idx_empresa_deleted ON empresas(deleted_at);

CREATE INDEX idx_empresa_nome ON empresas(nome);

CREATE UNIQUE INDEX idx_empresas_codigo ON empresas(codigo);

CREATE INDEX idx_escala_alertas_empresa
  ON escala_alertas(empresa_id, resolvido, created_at);

CREATE INDEX idx_escala_alertas_escala
  ON escala_alertas(escala_id, resolvido, deleted_at);

CREATE INDEX idx_escala_alocacoes_aeronave_funcao_data
  ON escala_alocacoes(escala_id, aeronave_id, funcao, data_inicio)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_escala_auditoria_escala ON escala_auditoria(escala_id);

CREATE INDEX idx_escala_confirmacoes_escala
  ON escala_confirmacoes(escala_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_escala_confirmacoes_unique
  ON escala_confirmacoes(escala_id, funcionario_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_escala_eventos_datas ON escala_eventos(data_inicio, data_fim) WHERE deleted_at IS NULL;

CREATE INDEX idx_escala_eventos_escala ON escala_eventos(escala_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_escala_eventos_funcionario ON escala_eventos(funcionario_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_escala_eventos_funcionario_data
  ON escala_eventos(funcionario_id, data_inicio)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_escala_eventos_tipo
  ON escala_eventos(escala_id, tipo_evento)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_escala_eventos_tripulacao_id
  ON escala_eventos(tripulacao_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_escala_publicacao_snapshots_escala ON escala_publicacao_snapshots(escala_id, publicado_em DESC) WHERE deleted_at IS NULL;

CREATE INDEX idx_escala_tripulacoes_escala ON escala_tripulacoes(escala_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_escala_tripulacoes_pic ON escala_tripulacoes(pic_id) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_escalas_mensais_mes_ano_empresa
  ON escalas_mensais(mes, ano, empresa_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_escalas_mensais_status
  ON escalas_mensais(empresa_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_escalas_quinzenas_empresa_ano
  ON escalas_quinzenas(empresa_id, ano);

CREATE INDEX idx_escalas_quinzenas_empresa_mes_ano
  ON escalas_quinzenas(empresa_id, mes, ano)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_evd_empresa_data ON escala_voo_diaria(empresa_id, data) WHERE deleted_at IS NULL;

CREATE INDEX idx_evd_escala ON escala_voo_diaria(escala_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_evd_just_empresa_created
  ON escala_voo_diaria_justificativas (empresa_id, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_evd_just_empresa_escala
  ON escala_voo_diaria_justificativas (empresa_id, escala_voo_diaria_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_evd_just_empresa_funcionario
  ON escala_voo_diaria_justificativas (empresa_id, funcionario_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_evd_pic ON escala_voo_diaria(pic_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_evd_pub_checksum
  ON escala_voo_diaria_publicacoes (checksum);

CREATE INDEX idx_evd_pub_empresa_data_deleted
  ON escala_voo_diaria_publicacoes (empresa_id, data_ref, deleted_at);

CREATE INDEX idx_evd_pub_empresa_data_revisao
  ON escala_voo_diaria_publicacoes (empresa_id, data_ref, revisao);

CREATE INDEX idx_evd_sic ON escala_voo_diaria(sic_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_evd_status ON escala_voo_diaria(status) WHERE deleted_at IS NULL;

CREATE INDEX idx_eventos_alocacao_id
  ON escala_eventos(alocacao_id)
  WHERE deleted_at IS NULL AND gerado_automaticamente = 1;

CREATE INDEX idx_eventos_escala_funcionario_auto
  ON escala_eventos (escala_id, funcionario_id, gerado_automaticamente)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_eventos_funcionario_datas
  ON escala_eventos(funcionario_id, data_inicio, data_fim)
  WHERE deleted_at IS NULL AND status != 'cancelado';

CREATE INDEX idx_fadiga_avaliacao_gestor_checkin
  ON frms_fadiga_avaliacao_gestor (checkin_id, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_fadiga_checkin_empresa_data
  ON frms_fadiga_checkin (empresa_id, data_checkin)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_fadiga_checkin_empresa_status_data
  ON frms_fadiga_checkin (empresa_id, status_operacional, data_checkin)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_fadiga_checkin_funcionario_data
  ON frms_fadiga_checkin (funcionario_id, data_checkin)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_fadiga_checkin_nivel
  ON frms_fadiga_checkin (empresa_id, nivel_fadiga, status_operacional)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_fadiga_checkin_operational_review
  ON frms_fadiga_checkin (empresa_id, requires_operational_review, data_checkin)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_fadiga_checkin_report_source
  ON frms_fadiga_checkin (empresa_id, report_source, data_checkin)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_fadiga_checkin_risk_level_data
  ON frms_fadiga_checkin (empresa_id, computed_risk_level, data_checkin)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_fadiga_checkin_unique_day
  ON frms_fadiga_checkin (empresa_id, funcionario_id, data_checkin)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_fadiga_evento_empresa_tipo_data
  ON frms_fadiga_evento (empresa_id, tipo, created_at);

CREATE INDEX idx_fichas_agendamento ON fichas_sessao(agendamento_slot_id);

CREATE INDEX idx_fichas_aluno ON fichas_sessao(colaborador_id_aluno);

CREATE INDEX idx_fichas_assinatura_instrutor ON fichas_sessao(assinatura_instrutor);

CREATE INDEX idx_fichas_assinatura_tripulante ON fichas_sessao(assinatura_tripulante);

CREATE INDEX idx_fichas_edicoes_empresa_status
  ON fichas_sessao_edicoes(empresa_id, status, created_at DESC);

CREATE INDEX idx_fichas_edicoes_ficha_status
  ON fichas_sessao_edicoes(ficha_id, status, deleted_at);

CREATE INDEX idx_fichas_edicoes_solicitante
  ON fichas_sessao_edicoes(solicitante_funcionario_id, created_at DESC);

CREATE UNIQUE INDEX idx_fichas_edicoes_uma_pendente_por_ficha
  ON fichas_sessao_edicoes(ficha_id)
  WHERE status = 'PENDENTE' AND deleted_at IS NULL;

CREATE INDEX idx_fichas_instrutor ON fichas_sessao(instrutor_id);

CREATE INDEX idx_fichas_sessao_agendamento ON fichas_sessao(agendamento_slot_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_fichas_sessao_aluno ON fichas_sessao(colaborador_id_aluno) WHERE deleted_at IS NULL;

CREATE INDEX idx_fichas_sessao_arquivado ON fichas_sessao(arquivado);

CREATE INDEX idx_fichas_sessao_atribuicao
  ON fichas_sessao(atribuicao_curricular_id);

CREATE UNIQUE INDEX idx_fichas_sessao_atribuicao_ativa
  ON fichas_sessao(atribuicao_curricular_id)
  WHERE atribuicao_curricular_id IS NOT NULL
    AND deleted_at IS NULL;

CREATE INDEX idx_fichas_sessao_data_sessao ON fichas_sessao(data_sessao);

CREATE INDEX idx_fichas_sessao_deleted ON fichas_sessao(deleted_at);

CREATE INDEX idx_fichas_sessao_empresa ON fichas_sessao(empresa_id);

CREATE INDEX idx_fichas_sessao_empresa_id ON fichas_sessao(empresa_id);

CREATE INDEX idx_fichas_sessao_instrutor ON fichas_sessao(instrutor_id);

CREATE INDEX idx_fichas_sessao_manobras_codigo 
ON fichas_sessao_manobras(codigo) 
WHERE deleted_at IS NULL;

CREATE INDEX idx_fichas_sessao_manobras_deleted ON fichas_sessao_manobras(deleted_at);

CREATE INDEX idx_fichas_sessao_manobras_ficha ON fichas_sessao_manobras(ficha_id);

CREATE INDEX idx_fichas_sessao_manobras_ficha_ordem 
ON fichas_sessao_manobras(ficha_id, ordem) 
WHERE deleted_at IS NULL;

CREATE INDEX idx_fichas_sessao_manobras_ordem ON fichas_sessao_manobras(ficha_id, ordem);

CREATE INDEX idx_fichas_sessao_pdf_url ON fichas_sessao(pdf_url);

CREATE INDEX idx_fichas_sessao_resultado ON fichas_sessao(resultado_final) WHERE deleted_at IS NULL;

CREATE INDEX idx_fichas_sessao_status ON fichas_sessao(status);

CREATE INDEX idx_fichas_sessao_tipo ON fichas_sessao(tipo_sessao);

CREATE INDEX idx_fira_canac
  ON frms_importacao_fira(canac)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_fira_periodo
  ON frms_importacao_fira(canac, ano, mes)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_fira_status
  ON frms_importacao_fira(status)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_fira_tripulante
  ON frms_importacao_fira(tripulante_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_frms_acumulo_mensal_deleted ON frms_acumulo_mensal(deleted_at);

CREATE INDEX idx_frms_acumulo_mensal_periodo ON frms_acumulo_mensal(ano, mes);

CREATE INDEX idx_frms_acumulo_mensal_trip ON frms_acumulo_mensal(tripulante_id);

CREATE UNIQUE INDEX idx_frms_acumulo_mensal_uq ON frms_acumulo_mensal(tripulante_id, ano, mes) WHERE deleted_at IS NULL;

CREATE INDEX idx_frms_alerta_created ON frms_alerta(created_at);

CREATE INDEX idx_frms_alerta_deleted ON frms_alerta(deleted_at);

CREATE INDEX idx_frms_alerta_jornada ON frms_alerta(jornada_id);

CREATE INDEX idx_frms_alerta_nivel ON frms_alerta(nivel);

CREATE INDEX idx_frms_alerta_resolvido ON frms_alerta(resolvido) WHERE deleted_at IS NULL;

CREATE INDEX idx_frms_alerta_tipo ON frms_alerta(tipo_limite);

CREATE INDEX idx_frms_alerta_trip ON frms_alerta(tripulante_id);

CREATE INDEX idx_frms_alerta_trip_nivel ON frms_alerta(tripulante_id, nivel) WHERE deleted_at IS NULL;

CREATE INDEX idx_frms_alerta_visualizado ON frms_alerta(visualizado) WHERE deleted_at IS NULL;

CREATE INDEX idx_frms_carga_funcionario
  ON frms_carga_trabalho(funcionario_id, deleted_at);

CREATE INDEX idx_frms_config_deleted ON frms_configuracao_limites(deleted_at);

CREATE INDEX idx_frms_config_nome ON frms_configuracao_limites(nome);

CREATE INDEX idx_frms_data ON registros_frms(data_registro) WHERE deleted_at IS NULL;

CREATE INDEX idx_frms_escala_deleted ON frms_escala_quinzenal(deleted_at);

CREATE INDEX idx_frms_escala_periodo ON frms_escala_quinzenal(data_inicio_embarque, data_fim_folga);

CREATE INDEX idx_frms_escala_trip ON frms_escala_quinzenal(tripulante_id);

CREATE UNIQUE INDEX idx_frms_escala_uq ON frms_escala_quinzenal(tripulante_id, ano, ciclo) WHERE deleted_at IS NULL;

CREATE INDEX idx_frms_explicacao_cache_lookup
  ON frms_explicacao_dia_cache(empresa_id, tripulante_id, data_ref, origem_tela, expires_at);

CREATE INDEX idx_frms_fat_eff_nivel ON frms_fatorizacao_jornada(effectiveness_nivel) WHERE deleted_at IS NULL AND effectiveness_nivel IS NOT NULL;

CREATE INDEX idx_frms_fat_jornada_eff ON frms_fatorizacao_jornada(jornada_id, effectiveness_pct) WHERE deleted_at IS NULL AND effectiveness_pct IS NOT NULL;

CREATE INDEX idx_frms_fator_deleted ON frms_fatorizacao_jornada(deleted_at);

CREATE INDEX idx_frms_fator_jornada ON frms_fatorizacao_jornada(jornada_id);

CREATE INDEX idx_frms_fonte_calculo_competencia_lookup
  ON frms_fonte_calculo_competencia(tripulante_id, ano, mes, deleted_at);

CREATE UNIQUE INDEX idx_frms_fonte_calculo_competencia_uq
  ON frms_fonte_calculo_competencia(empresa_id, tripulante_id, ano, mes)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_frms_funcionario ON registros_frms(funcionario_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_frms_jornada_acordou_wocl
  ON frms_jornada(acordou_na_wocl)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_frms_jornada_data
  ON frms_jornada(data);

CREATE INDEX idx_frms_jornada_deleted
  ON frms_jornada(deleted_at);

CREATE INDEX idx_frms_jornada_empresa_data ON frms_jornada(empresa_id, data);

CREATE INDEX idx_frms_jornada_empresa_deleted ON frms_jornada(empresa_id, deleted_at);

CREATE INDEX idx_frms_jornada_fonte_resolucao_sigvoos
  ON frms_jornada(fonte_resolucao_sigvoos);

CREATE INDEX idx_frms_jornada_fonte_sono
  ON frms_jornada(fonte_sono)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_frms_jornada_pendente_empresa_status
  ON frms_jornada_pendente(empresa_id, status, updated_at DESC);

CREATE INDEX idx_frms_jornada_pendente_importacao
  ON frms_jornada_pendente(importacao_id);

CREATE INDEX idx_frms_jornada_status
  ON frms_jornada(status);

CREATE INDEX idx_frms_jornada_trip_data
  ON frms_jornada(tripulante_id, data);

CREATE UNIQUE INDEX idx_frms_jornada_trip_data_uq
  ON frms_jornada(tripulante_id, data) WHERE deleted_at IS NULL;

CREATE INDEX idx_frms_jornada_tripulante
  ON frms_jornada(tripulante_id);

CREATE INDEX idx_frms_just_empresa_trip
  ON frms_justificativas(empresa_id, tripulante_id, data_voo);

CREATE INDEX idx_frms_notif_dest_alerta
  ON frms_notificacao_destinatario(alerta_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_frms_notif_dest_deleted
  ON frms_notificacao_destinatario(deleted_at);

CREATE INDEX idx_frms_notif_dest_funcionario
  ON frms_notificacao_destinatario(funcionario_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_frms_notif_dest_lido
  ON frms_notificacao_destinatario(lido)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_frms_read_ack_event_audit_action
  ON frms_read_ack_event_audit (empresa_id, action, action_at);

CREATE INDEX idx_frms_read_ack_event_audit_event
  ON frms_read_ack_event_audit (empresa_id, event_id, action_at);

CREATE UNIQUE INDEX idx_frms_read_ack_events_dedup
  ON frms_read_ack_events (empresa_id, data_operacional, funcionario_id, event_type);

CREATE INDEX idx_frms_read_ack_events_empresa_data
  ON frms_read_ack_events (empresa_id, data_operacional);

CREATE INDEX idx_frms_read_ack_events_empresa_funcionario_data
  ON frms_read_ack_events (empresa_id, funcionario_id, data_operacional);

CREATE INDEX idx_frms_read_ack_events_empresa_hash
  ON frms_read_ack_events (empresa_id, event_hash);

CREATE INDEX idx_frms_read_ack_events_empresa_lifecycle
  ON frms_read_ack_events (empresa_id, lifecycle_status);

CREATE INDEX idx_frms_read_ack_events_empresa_type_severity
  ON frms_read_ack_events (empresa_id, event_type, severity);

CREATE INDEX idx_frms_rolling_data ON frms_acumulo_rolling(data_referencia);

CREATE INDEX idx_frms_rolling_deleted ON frms_acumulo_rolling(deleted_at);

CREATE INDEX idx_frms_rolling_trip ON frms_acumulo_rolling(tripulante_id);

CREATE INDEX idx_frms_rolling_trip_data ON frms_acumulo_rolling(tripulante_id, data_referencia);

CREATE UNIQUE INDEX idx_frms_rolling_uq ON frms_acumulo_rolling(tripulante_id, data_referencia) WHERE deleted_at IS NULL;

CREATE INDEX idx_func_ferias_alocacao
  ON funcionario_ferias(escala_alocacao_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_func_ferias_funcionario
  ON funcionario_ferias(funcionario_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_func_ferias_periodo
  ON funcionario_ferias(data_inicio, data_fim)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_funcionarios_data_realizacao_aso ON funcionarios(data_realizacao_aso);

CREATE INDEX idx_funcionarios_data_realizacao_cma ON funcionarios(data_realizacao_cma);

CREATE INDEX idx_funcionarios_data_realizacao_icao ON funcionarios(data_realizacao_icao);

CREATE INDEX idx_funcionarios_deleted ON funcionarios(deleted_at);

CREATE INDEX idx_funcionarios_empresa ON funcionarios(empresa_id);

CREATE INDEX idx_funcionarios_empresa_ativo ON funcionarios(empresa_id, ativo);

CREATE INDEX idx_funcionarios_empresa_setor
  ON funcionarios(empresa_id, setor_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_funcionarios_examinador ON funcionarios(is_examinador, deleted_at);

CREATE INDEX idx_funcionarios_modelo_aeronave_id ON funcionarios(modelo_aeronave_id);

CREATE INDEX idx_funcionarios_quinzena ON funcionarios(quinzena) WHERE deleted_at IS NULL;

CREATE INDEX idx_funcoes_ativo
  ON funcoes(ativo)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_funcoes_codigo
  ON funcoes(empresa_id, codigo)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_funcoes_deleted_at
  ON funcoes(deleted_at);

CREATE INDEX idx_funcoes_empresa
  ON funcoes(empresa_id);

CREATE INDEX idx_habilitacoes_anterior ON habilitacoes(habilitacao_anterior_id);

CREATE INDEX idx_habilitacoes_empresa_deleted ON habilitacoes(empresa_id, deleted_at);

CREATE INDEX idx_habilitacoes_renovada ON habilitacoes(eh_renovada);

CREATE INDEX idx_historico_compliance_data_calculo ON historico_compliance(data_calculo);

CREATE INDEX idx_historico_compliance_funcionario ON historico_compliance(funcionario_id, deleted_at);

CREATE INDEX idx_historico_compliance_recurso ON historico_compliance(tipo_recurso, recurso_id, deleted_at);

CREATE INDEX idx_historico_compliance_status ON historico_compliance(status_compliance, deleted_at);

CREATE INDEX idx_historico_notas_data 
  ON historico_notas_manobras(data_sessao DESC, deleted_at);

CREATE INDEX idx_historico_notas_ficha 
  ON historico_notas_manobras(ficha_id, deleted_at);

CREATE INDEX idx_historico_notas_funcionario 
  ON historico_notas_manobras(funcionario_id, deleted_at);

CREATE INDEX idx_historico_notas_manobra 
  ON historico_notas_manobras(funcionario_id, codigo_manobra, deleted_at);

CREATE INDEX idx_historico_ultima_nota 
  ON historico_notas_manobras(funcionario_id, codigo_manobra, data_sessao DESC, deleted_at);

CREATE INDEX idx_hospedagem_checkin       ON hospedagem(data_checkin);

CREATE INDEX idx_hospedagem_empresa       ON hospedagem(empresa_id);

CREATE INDEX idx_hospedagem_escala        ON hospedagem(escala_id);

CREATE INDEX idx_hospedagem_funcionario   ON hospedagem(funcionario_id);

CREATE INDEX idx_hospedagem_sugestoes_funcionario
  ON hospedagem_sugestoes(funcionario_id, status, deleted_at);

CREATE INDEX idx_hospedagens_funcionario ON hospedagens(funcionario_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_hospedagens_status ON hospedagens(status) WHERE deleted_at IS NULL;

CREATE INDEX idx_hvl_empresa_funcionario
  ON horas_voo_lancamentos(empresa_id, funcionario_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_hvl_funcionario_data
  ON horas_voo_lancamentos(funcionario_id, data_voo)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_hvl_origem
  ON horas_voo_lancamentos(origem_registro, frms_jornada_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_integracoes_sigvoos_config_empresa_chave
       ON integracoes_sigvoos_config(empresa_id, chave);

CREATE INDEX idx_integracoes_sigvoos_eventos_empresa_created
       ON integracoes_sigvoos_eventos(empresa_id, created_at DESC);

CREATE INDEX idx_integracoes_sigvoos_mapeamentos_empresa_canac
       ON integracoes_sigvoos_mapeamentos(empresa_id, canac_sigvoos);

CREATE INDEX idx_integracoes_sigvoos_mapeamentos_empresa_nome
       ON integracoes_sigvoos_mapeamentos(empresa_id, nome_sigvoos);

CREATE INDEX idx_job_execution_log_job_id
  ON job_execution_log(job_id);

CREATE INDEX idx_job_queue_criado_em
  ON job_queue(criado_em) WHERE deleted_at IS NULL;

CREATE INDEX idx_job_queue_status_tipo
  ON job_queue(status, tipo) WHERE deleted_at IS NULL;

CREATE INDEX idx_licencas_empresa_deleted
ON licencas(empresa_id, deleted_at);

CREATE INDEX idx_licencas_empresa_vencimento
ON licencas(empresa_id, data_vencimento);

CREATE INDEX idx_licencas_funcionario ON licencas(funcionario_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_licencas_vencimento ON licencas(data_vencimento) WHERE deleted_at IS NULL;

CREATE INDEX idx_lms_cursos_empresa_categoria
  ON lms_cursos (empresa_id, categoria)
  WHERE deleted_at IS NULL AND ativo = 1;

CREATE INDEX idx_lms_cursos_empresa_deleted
  ON lms_cursos (empresa_id, deleted_at);

CREATE INDEX idx_lms_cursos_empresa_publicado
  ON lms_cursos (empresa_id, publicado, ativo)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_lms_cursos_qualificacao_tipo
  ON lms_cursos (qualificacao_tipo_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_lms_cursos_setores_curso
  ON lms_cursos_setores(curso_id, empresa_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_lms_cursos_setores_setor
  ON lms_cursos_setores(setor_id, empresa_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_lms_cursos_setores_unique_active
  ON lms_cursos_setores(curso_id, setor_id, empresa_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_lms_h5p_empresa ON lms_h5p_conteudos (empresa_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_lms_matriculas_curso_status
  ON lms_matriculas (curso_id, empresa_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_lms_matriculas_empresa_deleted
  ON lms_matriculas (empresa_id, deleted_at);

CREATE INDEX idx_lms_matriculas_funcionario
  ON lms_matriculas (funcionario_id, empresa_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_lms_matriculas_inicio
  ON lms_matriculas (empresa_id, data_inicio, status)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_lms_matriculas_lookup
  ON lms_matriculas (curso_id, funcionario_id, empresa_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_lms_progresso_empresa_commit
  ON lms_progresso_scorm (empresa_id, last_commit_at);

CREATE INDEX idx_lms_progresso_matricula
  ON lms_progresso_scorm (matricula_id);

CREATE INDEX idx_lms_xapi_empresa_verb ON lms_xapi_statements (empresa_id, verb_id);

CREATE INDEX idx_lms_xapi_matricula    ON lms_xapi_statements (matricula_id);

CREATE INDEX idx_lms_xapi_timestamp    ON lms_xapi_statements (empresa_id, timestamp);

CREATE INDEX idx_manobras_categoria ON manobras(categoria);

CREATE INDEX idx_manobras_categorias_empresa_deleted
  ON manobras_categorias(empresa_id, deleted_at);

CREATE INDEX idx_manobras_categorias_empresa_ordem
  ON manobras_categorias(empresa_id, ordem);

CREATE INDEX idx_manobras_categorias_nome ON manobras_categorias(nome);

CREATE INDEX idx_manobras_codigo ON manobras(codigo);

CREATE INDEX idx_manobras_deleted ON manobras(deleted_at);

CREATE INDEX idx_manobras_empresa_categoria ON manobras(empresa_id, categoria);

CREATE INDEX idx_manobras_empresa_deleted ON manobras(empresa_id, deleted_at);

CREATE INDEX idx_manobras_empresa_ordem ON manobras(empresa_id, ordem);

CREATE INDEX idx_manobras_empresa_tipo_sessao_aeronave
  ON manobras(empresa_id, tipo_sessao, tipo_aeronave);

CREATE INDEX idx_manobras_ordem ON manobras(ordem);

CREATE INDEX idx_manobras_tipo_aeronave ON manobras(tipo_aeronave);

CREATE INDEX idx_manobras_tipo_sessao ON manobras(tipo_sessao);

CREATE INDEX idx_manobras_tipo_sessao_aeronave
  ON manobras(tipo_sessao, tipo_aeronave)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_matriz_treinamento_empresa_funcao
  ON matriz_treinamento_funcao (empresa_id, funcao_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_matriz_treinamento_empresa_tipo
  ON matriz_treinamento_funcao (empresa_id, qualificacao_tipo_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_matriz_treinamento_unique_ativo
  ON matriz_treinamento_funcao (empresa_id, funcao_id, qualificacao_tipo_id)
  WHERE ativo = 1 AND deleted_at IS NULL;

CREATE INDEX idx_modelos_aeronave_ativo ON modelos_aeronave(ativo);

CREATE INDEX idx_modelos_aeronave_codigo ON modelos_aeronave(codigo);

CREATE INDEX idx_modelos_aeronave_empresa ON modelos_aeronave(empresa_id);

CREATE INDEX idx_modelos_aeronave_empresa_deleted
  ON modelos_aeronave(empresa_id, deleted_at);

CREATE INDEX idx_modelos_aeronave_modelo ON modelos_aeronave(modelo);

CREATE INDEX idx_modelos_aeronave_nome ON modelos_aeronave(nome);

CREATE INDEX idx_modelos_codigo ON modelos_sessao(codigo);

CREATE INDEX idx_modelos_deleted ON modelos_sessao(deleted_at);

CREATE INDEX idx_modelos_sessao_aeronave_codigo ON modelos_sessao(codigo_aeronave);

CREATE INDEX idx_modelos_sessao_ativo ON modelos_sessao(ativo);

CREATE INDEX idx_modelos_sessao_checks_modelo ON modelos_sessao_checks(modelo_id);

CREATE INDEX idx_modelos_sessao_checks_qtipo ON modelos_sessao_checks(qualificacao_tipo_id);

CREATE INDEX idx_modelos_sessao_codigo ON modelos_sessao(codigo);

CREATE INDEX idx_modelos_sessao_codigo_aeronave ON modelos_sessao(tipo_sessao_id, codigo_aeronave) WHERE deleted_at IS NULL;

CREATE INDEX idx_modelos_sessao_deleted ON modelos_sessao(deleted_at);

CREATE INDEX idx_modelos_sessao_empresa ON modelos_sessao(empresa_id);

CREATE INDEX idx_modelos_sessao_manobras_manobra_id 
  ON modelos_sessao_manobras(manobra_id);

CREATE INDEX idx_modelos_sessao_manobras_modelo_id 
  ON modelos_sessao_manobras(modelo_id);

CREATE INDEX idx_modelos_sessao_manobras_modelo_ordem 
ON modelos_sessao_manobras(modelo_id, ordem) 
WHERE deleted_at IS NULL;

CREATE INDEX idx_modelos_sessao_manobras_ordem 
  ON modelos_sessao_manobras(modelo_id, ordem);

CREATE INDEX idx_modelos_sessao_modelo_aeronave ON modelos_sessao(modelo_aeronave);

CREATE INDEX idx_modelos_sessao_ordem ON modelos_sessao(treinamento_id, ordem_no_treinamento);

CREATE INDEX idx_modelos_sessao_tipo ON modelos_sessao(tipo_sessao_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_modelos_sessao_tipo_aeronave ON modelos_sessao(tipo_sessao_id, codigo_aeronave) WHERE deleted_at IS NULL;

CREATE INDEX idx_modelos_sessao_tipo_sessao_aeronave ON modelos_sessao(tipo_sessao_id, tipo_aeronave) WHERE deleted_at IS NULL;

CREATE INDEX idx_modelos_sessao_treinamento ON modelos_sessao(treinamento_id);

CREATE INDEX idx_notif_inapp_empresa ON notificacoes_inapp(empresa_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX idx_notif_inapp_funcionario ON notificacoes_inapp(funcionario_id, lida) WHERE deleted_at IS NULL;

CREATE INDEX idx_notificacoes_config_ativo ON notificacoes_config(ativo);

CREATE INDEX idx_notificacoes_config_tipo ON notificacoes_config(tipo);

CREATE INDEX idx_notificacoes_convocacao_cc_empresa
  ON notificacoes_convocacao_cc_gestores(empresa_id, ativo)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_papeis_ativo ON papeis(ativo) WHERE ativo = 1;

CREATE INDEX idx_papeis_nome ON papeis(nome);

CREATE INDEX idx_participantes_deleted_at ON sessoes_participantes(deleted_at);

CREATE INDEX idx_participantes_funcionario_id ON sessoes_participantes(funcionario_id);

CREATE INDEX idx_participantes_sessao_deleted 
  ON sessoes_participantes(sessao_id, deleted_at);

CREATE INDEX idx_participantes_sessao_id ON sessoes_participantes(sessao_id);

CREATE INDEX idx_participantes_uuid ON sessoes_participantes(uuid);

CREATE INDEX idx_password_reset_tokens_active ON password_reset_tokens(expires_at, consumed_at) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_password_reset_tokens_hash ON password_reset_tokens(token_hash) WHERE deleted_at IS NULL;

CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens(user_id, expires_at) WHERE deleted_at IS NULL;

CREATE INDEX idx_pasta_virtual_deleted
  ON pasta_virtual(deleted_at);

CREATE INDEX idx_pasta_virtual_empresa
  ON pasta_virtual(empresa_id);

CREATE INDEX idx_pasta_virtual_funcionario
  ON pasta_virtual(funcionario_id);

CREATE INDEX idx_pasta_virtual_jobs_status
  ON pasta_virtual_jobs(empresa_id, status_geracao, deleted_at);

CREATE INDEX idx_perfis_permissoes_empresa_perfil
  ON perfis_permissoes(empresa_id, perfil);

CREATE INDEX idx_pessoas_papeis_ativo ON pessoas_papeis(pessoa_id, papel_id) 
  WHERE data_fim IS NULL AND deleted_at IS NULL;

CREATE INDEX idx_pessoas_papeis_papel ON pessoas_papeis(papel_id);

CREATE INDEX idx_pessoas_papeis_pessoa ON pessoas_papeis(pessoa_id);

CREATE INDEX idx_qh_stats_daily_day_scope ON qualificacoes_historico_stats_daily(day, scope_hash);

CREATE INDEX idx_qts_empresa_setor_tipo
  ON qualificacoes_tipos_setores(empresa_id, setor_id, tipo_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_qts_setor_empresa
  ON qualificacoes_tipos_setores(setor_id, empresa_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_qts_tipo_empresa
  ON qualificacoes_tipos_setores(tipo_id, empresa_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_qts_unique_active
  ON qualificacoes_tipos_setores(tipo_id, setor_id, empresa_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_qualificacoes_pendencias_funcionario
  ON qualificacoes_pendencias(funcionario_id, status, deleted_at);

CREATE INDEX idx_qualificacoes_tipos_ativo
  ON qualificacoes_tipos(ativo) WHERE deleted_at IS NULL;

CREATE INDEX idx_qualificacoes_tipos_deleted_at
  ON qualificacoes_tipos(deleted_at);

CREATE INDEX idx_qualificacoes_tipos_empresa
  ON qualificacoes_tipos(empresa_id);

CREATE INDEX idx_rate_limit_store_key_window_start ON rate_limit_store(key, window_start);

CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);

CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);

CREATE INDEX idx_requisitos_compliance_empresa_funcao
  ON requisitos_compliance(empresa_id, funcao)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_requisitos_compliance_empresa_tipo
  ON requisitos_compliance(empresa_id, tipo_recurso, referencia)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_restricoes_tripulacao_a ON restricoes_tripulacao(funcionario_a_id) WHERE deleted_at IS NULL AND ativo = 1;

CREATE INDEX idx_restricoes_tripulacao_b ON restricoes_tripulacao(funcionario_b_id) WHERE deleted_at IS NULL AND ativo = 1;

CREATE INDEX idx_sessoes_examinador ON simulador_agendamentos(examinador_id, is_check, deleted_at);

CREATE INDEX idx_sessoes_instrutor ON sessoes(instrutor_id);

CREATE INDEX idx_setores_ativo
  ON setores(ativo)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_setores_codigo
  ON setores(empresa_id, codigo)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_setores_empresa
  ON setores(empresa_id);

CREATE INDEX idx_setores_gestores_empresa
  ON setores_gestores(empresa_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_setores_gestores_gestor
  ON setores_gestores(gestor_id, empresa_id, ativo)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_setores_gestores_role
  ON setores_gestores(role, ativo)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_setores_gestores_setor
  ON setores_gestores(setor_id, empresa_id, ativo)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_setores_gestores_unique
  ON setores_gestores(setor_id, gestor_id, empresa_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_setores_gestores_usuario
  ON setores_gestores(usuario_id, empresa_id, ativo)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_setores_gestores_usuario_unique
  ON setores_gestores(setor_id, usuario_id, empresa_id)
  WHERE deleted_at IS NULL AND usuario_id IS NOT NULL;

CREATE INDEX idx_sgso_acoes_empresa ON sgso_acoes_mitigacao(empresa_id);

CREATE INDEX idx_sgso_acoes_prazo ON sgso_acoes_mitigacao(prazo, status);

CREATE INDEX idx_sgso_acoes_relato ON sgso_acoes_mitigacao(relato_id);

CREATE INDEX idx_sgso_acoes_responsavel ON sgso_acoes_mitigacao(responsavel_id);

CREATE INDEX idx_sgso_acoes_status ON sgso_acoes_mitigacao(status, empresa_id);

CREATE INDEX idx_sgso_arquivos_empresa ON sgso_relatos_arquivos(empresa_id);

CREATE INDEX idx_sgso_arquivos_relato ON sgso_relatos_arquivos(relato_id);

CREATE INDEX idx_sgso_audit_itens_auditoria ON sgso_auditoria_itens(auditoria_id);

CREATE INDEX idx_sgso_audit_itens_resultado ON sgso_auditoria_itens(resultado, empresa_id);

CREATE INDEX idx_sgso_audit_trail_agregado ON sgso_audit_trail(agregado_tipo, agregado_id, created_at);

CREATE INDEX idx_sgso_audit_trail_empresa ON sgso_audit_trail(empresa_id, created_at);

CREATE INDEX idx_sgso_auditorias_data ON sgso_auditorias(data_programada, empresa_id);

CREATE INDEX idx_sgso_auditorias_empresa ON sgso_auditorias(empresa_id);

CREATE INDEX idx_sgso_auditorias_status ON sgso_auditorias(status, empresa_id);

CREATE INDEX idx_sgso_barreira_hist_barreira ON sgso_bowtie_barreira_historico(barreira_id, alterado_em);

CREATE INDEX idx_sgso_barreira_vinculos_barreira ON sgso_bowtie_barreira_vinculos(barreira_id);

CREATE INDEX idx_sgso_barreira_vinculos_no ON sgso_bowtie_barreira_vinculos(no_id);

CREATE INDEX idx_sgso_barreiras_cenario ON sgso_bowtie_barreiras(cenario_id);

CREATE INDEX idx_sgso_barreiras_origem ON sgso_bowtie_barreiras(origem_tipo, origem_ref_id);

CREATE INDEX idx_sgso_barreiras_status ON sgso_bowtie_barreiras(status_saude, empresa_id);

CREATE INDEX idx_sgso_bowtie_cenarios_empresa_status ON sgso_bowtie_cenarios(empresa_id, status);

CREATE INDEX idx_sgso_bowtie_cenarios_perigo ON sgso_bowtie_cenarios(perigo_id);

CREATE INDEX idx_sgso_bowtie_nos_cenario ON sgso_bowtie_nos(cenario_id, tipo_no);

CREATE INDEX idx_sgso_capturas_empresa_status ON sgso_relato_capturas(empresa_id, sync_status);

CREATE INDEX idx_sgso_capturas_relato ON sgso_relato_capturas(relato_id);

CREATE INDEX idx_sgso_capturas_sync_em ON sgso_relato_capturas(sincronizado_em);

CREATE INDEX idx_sgso_comentarios_relato ON sgso_relatos_comentarios(relato_id);

CREATE INDEX idx_sgso_frat_aprovacoes_avaliacao ON sgso_frat_aprovacoes(avaliacao_id, created_at);

CREATE INDEX idx_sgso_frat_aprovacoes_nivel ON sgso_frat_aprovacoes(avaliacao_id, nivel);

CREATE INDEX idx_sgso_frat_avaliacoes_empresa_data ON sgso_frat_avaliacoes(empresa_id, data_operacao);

CREATE INDEX idx_sgso_frat_avaliacoes_escala ON sgso_frat_avaliacoes(escala_id, tripulante_id);

CREATE INDEX idx_sgso_frat_avaliacoes_nivel ON sgso_frat_avaliacoes(empresa_id, nivel_aprovacao_atual, status);

CREATE INDEX idx_sgso_frat_avaliacoes_status ON sgso_frat_avaliacoes(status, nivel_risco);

CREATE INDEX idx_sgso_frat_fatores_modelo ON sgso_frat_fatores(modelo_id, ativo);

CREATE INDEX idx_sgso_frat_modelos_empresa ON sgso_frat_modelos(empresa_id, ativo);

CREATE INDEX idx_sgso_frat_origem_fadiga
  ON sgso_frat_avaliacoes (empresa_id, origem_vinculo, frms_fadiga_checkin_id);

CREATE INDEX idx_sgso_frat_respostas_avaliacao ON sgso_frat_respostas(avaliacao_id);

CREATE INDEX idx_sgso_hfacs_categoria ON sgso_relatos_fatores_humanos(categoria, empresa_id);

CREATE INDEX idx_sgso_hfacs_empresa ON sgso_relatos_fatores_humanos(empresa_id);

CREATE INDEX idx_sgso_hfacs_nivel ON sgso_relatos_fatores_humanos(nivel_hfacs, empresa_id);

CREATE INDEX idx_sgso_hfacs_relato ON sgso_relatos_fatores_humanos(relato_id);

CREATE INDEX idx_sgso_hist_empresa ON sgso_relatos_historico_status(empresa_id, alterado_em);

CREATE INDEX idx_sgso_hist_relato ON sgso_relatos_historico_status(relato_id);

CREATE INDEX idx_sgso_ia_empresa_status ON sgso_relato_ia_triagem(empresa_id, clareza_status);

CREATE INDEX idx_sgso_ia_relato ON sgso_relato_ia_triagem(relato_id);

CREATE INDEX idx_sgso_ia_tendencia ON sgso_relato_ia_triagem(cluster_tendencia, sinal_tendencia);

CREATE INDEX idx_sgso_licoes_empresa_status
  ON sgso_licoes_aprendidas (empresa_id, status_publicacao, updated_at);

CREATE INDEX idx_sgso_matriz_celulas_perfil ON sgso_matriz_risco_celulas(perfil_id, nivel_risco);

CREATE INDEX idx_sgso_matriz_perfis_empresa ON sgso_matriz_risco_perfis(empresa_id, ativo, padrao);

CREATE INDEX idx_sgso_midias_geo ON sgso_relatos_midias_metadados(geotag_latitude, geotag_longitude);

CREATE INDEX idx_sgso_midias_relato ON sgso_relatos_midias_metadados(relato_id);

CREATE INDEX idx_sgso_moc_aprovacoes_moc
  ON sgso_moc_aprovacoes (moc_id, created_at);

CREATE INDEX idx_sgso_moc_empresa_status
  ON sgso_moc_registros (empresa_id, status, updated_at)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_sgso_nc_empresa ON sgso_nao_conformidades(empresa_id);

CREATE INDEX idx_sgso_nc_prazo ON sgso_nao_conformidades(prazo_resolucao, status);

CREATE INDEX idx_sgso_nc_status ON sgso_nao_conformidades(status, empresa_id);

CREATE INDEX idx_sgso_notificacoes_empresa ON sgso_relato_notificacoes(empresa_id, canal, status);

CREATE INDEX idx_sgso_notificacoes_relato ON sgso_relato_notificacoes(relato_id, status);

CREATE INDEX idx_sgso_perigos_categoria ON sgso_perigos(categoria_principal, empresa_id);

CREATE INDEX idx_sgso_perigos_empresa_status ON sgso_perigos(empresa_id, status);

CREATE INDEX idx_sgso_privacidade_empresa ON sgso_relato_privacidade(empresa_id, modo_sigilo);

CREATE INDEX idx_sgso_privacidade_relator_hash ON sgso_relato_privacidade(relator_hash_busca);

CREATE INDEX idx_sgso_relato_perigos_perigo ON sgso_relato_perigos(perigo_id);

CREATE INDEX idx_sgso_relato_perigos_relato ON sgso_relato_perigos(relato_id);

CREATE INDEX idx_sgso_relatos_aeronave ON sgso_relatos(aeronave_id);

CREATE INDEX idx_sgso_relatos_data ON sgso_relatos(data_ocorrencia, empresa_id);

CREATE INDEX idx_sgso_relatos_deleted ON sgso_relatos(deleted_at);

CREATE INDEX idx_sgso_relatos_empresa ON sgso_relatos(empresa_id);

CREATE INDEX idx_sgso_relatos_relator ON sgso_relatos(relator_id);

CREATE INDEX idx_sgso_relatos_sla_investigacao
  ON sgso_relatos (empresa_id, status, sla_investigacao_prazo)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_sgso_relatos_sla_triagem
  ON sgso_relatos (empresa_id, status, sla_triagem_prazo)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_sgso_relatos_status ON sgso_relatos(status, empresa_id);

CREATE INDEX idx_sgso_relatos_tipo ON sgso_relatos(tipo, empresa_id);

CREATE INDEX idx_sgso_relatos_tipo_investigacao
  ON sgso_relatos (empresa_id, tipo_investigacao, status)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_sgso_risco_contexto_aprovacao ON sgso_avaliacao_risco_contexto(empresa_id, aprovacao_status);

CREATE INDEX idx_sgso_risco_contexto_avaliacao ON sgso_avaliacao_risco_contexto(avaliacao_risco_id);

CREATE INDEX idx_sgso_risco_empresa ON sgso_avaliacao_risco(empresa_id);

CREATE INDEX idx_sgso_risco_nivel ON sgso_avaliacao_risco(nivel_risco, empresa_id);

CREATE INDEX idx_sgso_risco_relato ON sgso_avaliacao_risco(relato_id);

CREATE INDEX idx_sgso_spi_empresa ON sgso_spi_config(empresa_id, ativo);

CREATE INDEX idx_sgso_workflow_empresa_tipo ON sgso_relato_workflow_eventos(empresa_id, tipo_evento, status_evento);

CREATE INDEX idx_sgso_workflow_relato ON sgso_relato_workflow_eventos(relato_id, criado_em);

CREATE INDEX idx_sigvoos_mapeamento_manual_empresa_canac
  ON sigvoos_mapeamento_manual(empresa_id, canac_sigvoos);

CREATE INDEX idx_sigvoos_mapeamento_manual_empresa_inscricao
  ON sigvoos_mapeamento_manual(empresa_id, inscricao_sigvoos);

CREATE INDEX idx_sigvoos_mapeamento_manual_empresa_nome
  ON sigvoos_mapeamento_manual(empresa_id, nome_sigvoos);

CREATE INDEX idx_sim_agend_aeronave ON simulador_agendamentos(aeronave_id);

CREATE INDEX idx_sim_agend_tipo_dispositivo ON simulador_agendamentos(tipo_dispositivo);

CREATE INDEX idx_sim_atribuicoes_agendamento
  ON simulador_atribuicoes_curriculares(agendamento_id);

CREATE UNIQUE INDEX idx_sim_atribuicoes_ativas_por_participante
  ON simulador_atribuicoes_curriculares(agendamento_id, participante_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_sim_atribuicoes_empresa
  ON simulador_atribuicoes_curriculares(empresa_id);

CREATE INDEX idx_sim_atribuicoes_participante
  ON simulador_atribuicoes_curriculares(participante_id);

CREATE UNIQUE INDEX idx_sim_segmento_funcao_unica
  ON simulador_segmento_participantes(segmento_id, funcao)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_sim_segmento_participantes_ativo
  ON simulador_segmento_participantes(segmento_id, participante_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_sim_segmento_participantes_atribuicao
  ON simulador_segmento_participantes(atribuicao_curricular_id);

CREATE INDEX idx_sim_segmento_participantes_empresa
  ON simulador_segmento_participantes(empresa_id);

CREATE INDEX idx_sim_segmento_participantes_participante
  ON simulador_segmento_participantes(participante_id);

CREATE INDEX idx_sim_segmento_participantes_segmento
  ON simulador_segmento_participantes(segmento_id);

CREATE INDEX idx_sim_segmentos_agendamento
  ON simulador_agendamento_segmentos(agendamento_id);

CREATE INDEX idx_sim_segmentos_atribuicao
  ON simulador_agendamento_segmentos(atribuicao_curricular_id);

CREATE INDEX idx_sim_segmentos_empresa
  ON simulador_agendamento_segmentos(empresa_id);

CREATE UNIQUE INDEX idx_sim_segmentos_ordem_ativa
  ON simulador_agendamento_segmentos(agendamento_id, ordem)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_simulador_agendamentos_data ON simulador_agendamentos(data);

CREATE INDEX idx_simulador_agendamentos_empresa ON simulador_agendamentos(empresa_id);

CREATE INDEX idx_simulador_agendamentos_simulador_data ON simulador_agendamentos(simulador_id, data) WHERE deleted_at IS NULL;

CREATE INDEX idx_simulador_agendamentos_tipo ON simulador_agendamentos(tipo_sessao) WHERE deleted_at IS NULL;

CREATE INDEX idx_simuladores_aeronave_codigo ON simuladores(aeronave_codigo);

CREATE INDEX idx_simuladores_codigo_aeronave 
ON simuladores(codigo_aeronave) 
WHERE deleted_at IS NULL;

CREATE INDEX idx_simuladores_deleted ON simuladores(deleted_at);

CREATE INDEX idx_simuladores_status ON simuladores(status);

CREATE INDEX idx_simuladores_status_deleted_v2 
ON simuladores(status, deleted_at);

CREATE INDEX idx_simuladores_tipo ON simuladores(tipo) WHERE deleted_at IS NULL;

CREATE INDEX idx_sol_trein_empresa ON solicitacoes_treinamento(empresa_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_sol_trein_solicitante ON solicitacoes_treinamento(solicitante_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_sol_trein_status ON solicitacoes_treinamento(status) WHERE deleted_at IS NULL;

CREATE INDEX idx_solicitacoes_lms_matricula
  ON solicitacoes_treinamento(lms_matricula_id)
  WHERE lms_matricula_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_solicitacoes_treinamento_planejado
  ON solicitacoes_treinamento(treinamento_planejado_id)
  WHERE treinamento_planejado_id IS NOT NULL;

CREATE UNIQUE INDEX idx_support_access_grants_active_unique
  ON support_access_grants (user_id, empresa_id, access_level)
  WHERE revoked_at IS NULL;

CREATE INDEX idx_support_access_grants_lookup
  ON support_access_grants (empresa_id, user_id, access_level, expires_at, revoked_at);

CREATE INDEX idx_support_access_sessions_active
  ON support_access_sessions (empresa_id, user_id, ended_at, started_at);

CREATE INDEX idx_support_access_sessions_request
  ON support_access_sessions (request_id);

CREATE INDEX idx_system_logs_level ON system_logs(level);

CREATE INDEX idx_system_logs_timestamp ON system_logs(timestamp);

CREATE INDEX idx_template_alocacoes_template
  ON escala_template_alocacoes(template_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_templates_empresa_ativo 
ON certificados_templates(empresa_id, ativo, deleted_at);

CREATE INDEX idx_templates_padrao 
ON certificados_templates(empresa_id, padrao, ativo);

CREATE INDEX idx_templates_tipo 
ON certificados_templates(tipo, ativo);

CREATE INDEX idx_tipos_check_deleted ON tipos_check(deleted_at);

CREATE INDEX idx_tipos_evento_config_empresa ON escalas_tipos_evento_config(empresa_id) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_tipos_sessao_codigo
  ON tipos_sessao(empresa_id, codigo)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_tipos_sessao_deleted_at
  ON tipos_sessao(deleted_at);

CREATE INDEX idx_tipos_sessao_empresa
  ON tipos_sessao(empresa_id);

CREATE INDEX idx_token_blocklist_jti ON token_blocklist(jti);

CREATE INDEX idx_treinamentos_ativo ON treinamentos(ativo);

CREATE INDEX idx_treinamentos_categoria_id ON treinamentos(categoria_id);

CREATE INDEX idx_treinamentos_codigo ON treinamentos(codigo);

CREATE INDEX idx_treinamentos_convocacoes_email_itens_convocacao
  ON treinamentos_convocacoes_email_itens(convocacao_id, funcionario_id);

CREATE INDEX idx_treinamentos_convocacoes_email_treinamento
  ON treinamentos_convocacoes_email(treinamento_id, created_at DESC);

CREATE INDEX idx_treinamentos_deleted ON treinamentos(deleted_at);

CREATE INDEX idx_treinamentos_dias_empresa_data
  ON treinamentos_dias(empresa_id, data, status) WHERE deleted_at IS NULL;

CREATE INDEX idx_treinamentos_dias_treinamento
  ON treinamentos_dias(treinamento_id, data) WHERE deleted_at IS NULL;

CREATE INDEX idx_treinamentos_instrutores_empresa_funcionario
  ON treinamentos_instrutores(empresa_id, funcionario_id);

CREATE INDEX idx_treinamentos_participantes_funcionario ON treinamentos_participantes(funcionario_id);

CREATE INDEX idx_treinamentos_participantes_treinamento ON treinamentos_participantes(treinamento_id);

CREATE INDEX idx_treinamentos_planejados_empresa_data ON treinamentos_planejados(empresa_id, data_prevista, status) WHERE deleted_at IS NULL;

CREATE INDEX idx_treinamentos_presencas_participante
  ON treinamentos_presencas(participante_id, treinamento_dia_id);

CREATE INDEX idx_user_permissions_permissao ON user_permissions(permissao);

CREATE INDEX idx_user_permissions_usuario ON user_permissions(usuario_id);

CREATE UNIQUE INDEX idx_user_platform_roles_active_unique
  ON user_platform_roles (user_id, role_code)
  WHERE revoked_at IS NULL;

CREATE INDEX idx_user_platform_roles_lookup
  ON user_platform_roles (role_code, user_id, expires_at, revoked_at);

CREATE INDEX idx_user_profiles_usuario ON user_profiles(usuario_id);

CREATE INDEX idx_usuario_permissoes_usuario ON usuario_permissoes(usuario_id);

CREATE INDEX idx_usuario_preferencias_lookup
       ON usuario_preferencias(usuario_id, empresa_id, chave);

CREATE INDEX idx_usuarios_deleted ON usuarios(deleted_at);

CREATE INDEX idx_usuarios_email      ON usuarios(email);

CREATE INDEX idx_usuarios_funcionario ON usuarios(funcionario_id);

CREATE INDEX idx_usuarios_perfil     ON usuarios(perfil);

CREATE UNIQUE INDEX ux_escala_tripulacoes_escala_aeronave_ativa ON escala_tripulacoes(escala_id, UPPER(TRIM(REPLACE(REPLACE(REPLACE(COALESCE(aeronave, ''), '  ', ' '), '  ', ' '), '  ', ' ')))) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX ux_habilitacoes_empresa_nome_active
  ON habilitacoes(empresa_id, nome)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX ux_manobras_categorias_empresa_codigo_active
  ON manobras_categorias(empresa_id, codigo)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX ux_manobras_empresa_codigo_active
  ON manobras(empresa_id, codigo)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX ux_modelos_aeronave_empresa_modelo_active
  ON modelos_aeronave(empresa_id, modelo)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX ux_qualificacoes_categorias_empresa_codigo_active
  ON qualificacoes_categorias(empresa_id, codigo)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_alertas_reforco_updated_at
AFTER UPDATE ON alertas_reforco
FOR EACH ROW
BEGIN
  UPDATE alertas_reforco 
  SET updated_at = datetime('now') 
  WHERE id = NEW.id;
END;

CREATE TRIGGER trg_cv_conflitos_integracao_etapa_insert
BEFORE INSERT ON cv_conflitos_integracao
FOR EACH ROW
WHEN NEW.entidade_tipo = 'etapa'
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voo_etapas e
   WHERE e.id = NEW.entidade_id
     AND e.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_conflitos_integracao entidade_id mismatch');
END;

CREATE TRIGGER trg_cv_conflitos_integracao_etapa_update
BEFORE UPDATE OF empresa_id, entidade_tipo, entidade_id ON cv_conflitos_integracao
FOR EACH ROW
WHEN NEW.entidade_tipo = 'etapa'
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voo_etapas e
   WHERE e.id = NEW.entidade_id
     AND e.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_conflitos_integracao entidade_id mismatch');
END;

CREATE TRIGGER trg_cv_conflitos_integracao_staging_insert
BEFORE INSERT ON cv_conflitos_integracao
FOR EACH ROW
WHEN NEW.staging_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
   FROM cv_sigvoos_staging s
   WHERE s.id = NEW.staging_id
     AND s.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_conflitos_integracao staging_id mismatch');
END;

CREATE TRIGGER trg_cv_conflitos_integracao_staging_update
BEFORE UPDATE OF empresa_id, staging_id ON cv_conflitos_integracao
FOR EACH ROW
WHEN NEW.staging_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
   FROM cv_sigvoos_staging s
   WHERE s.id = NEW.staging_id
     AND s.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_conflitos_integracao staging_id mismatch');
END;

CREATE TRIGGER trg_cv_conflitos_integracao_tripulante_insert
BEFORE INSERT ON cv_conflitos_integracao
FOR EACH ROW
WHEN NEW.entidade_tipo = 'tripulante'
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voo_tripulantes t
   WHERE t.id = NEW.entidade_id
     AND t.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_conflitos_integracao entidade_id mismatch');
END;

CREATE TRIGGER trg_cv_conflitos_integracao_tripulante_update
BEFORE UPDATE OF empresa_id, entidade_tipo, entidade_id ON cv_conflitos_integracao
FOR EACH ROW
WHEN NEW.entidade_tipo = 'tripulante'
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voo_tripulantes t
   WHERE t.id = NEW.entidade_id
     AND t.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_conflitos_integracao entidade_id mismatch');
END;

CREATE TRIGGER trg_cv_conflitos_integracao_voo_insert
BEFORE INSERT ON cv_conflitos_integracao
FOR EACH ROW
WHEN NEW.entidade_tipo = 'voo'
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voos v
   WHERE v.id = NEW.entidade_id
     AND v.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_conflitos_integracao entidade_id mismatch');
END;

CREATE TRIGGER trg_cv_conflitos_integracao_voo_update
BEFORE UPDATE OF empresa_id, entidade_tipo, entidade_id ON cv_conflitos_integracao
FOR EACH ROW
WHEN NEW.entidade_tipo = 'voo'
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voos v
   WHERE v.id = NEW.entidade_id
     AND v.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_conflitos_integracao entidade_id mismatch');
END;

CREATE TRIGGER trg_cv_sigvoos_staging_etapa_insert
BEFORE INSERT ON cv_sigvoos_staging
FOR EACH ROW
WHEN NEW.cv_etapa_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voo_etapas e
   WHERE e.id = NEW.cv_etapa_id
     AND e.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_sigvoos_staging cv_etapa_id mismatch');
END;

CREATE TRIGGER trg_cv_sigvoos_staging_etapa_update
BEFORE UPDATE OF empresa_id, cv_etapa_id ON cv_sigvoos_staging
FOR EACH ROW
WHEN NEW.cv_etapa_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voo_etapas e
   WHERE e.id = NEW.cv_etapa_id
     AND e.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_sigvoos_staging cv_etapa_id mismatch');
END;

CREATE TRIGGER trg_cv_sigvoos_staging_tripulante_insert
BEFORE INSERT ON cv_sigvoos_staging
FOR EACH ROW
WHEN NEW.cv_tripulante_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voo_tripulantes t
   WHERE t.id = NEW.cv_tripulante_id
     AND t.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_sigvoos_staging cv_tripulante_id mismatch');
END;

CREATE TRIGGER trg_cv_sigvoos_staging_tripulante_update
BEFORE UPDATE OF empresa_id, cv_tripulante_id ON cv_sigvoos_staging
FOR EACH ROW
WHEN NEW.cv_tripulante_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voo_tripulantes t
   WHERE t.id = NEW.cv_tripulante_id
     AND t.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_sigvoos_staging cv_tripulante_id mismatch');
END;

CREATE TRIGGER trg_cv_sigvoos_staging_voo_insert
BEFORE INSERT ON cv_sigvoos_staging
FOR EACH ROW
WHEN NEW.cv_voo_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voos v
   WHERE v.id = NEW.cv_voo_id
     AND v.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_sigvoos_staging cv_voo_id mismatch');
END;

CREATE TRIGGER trg_cv_sigvoos_staging_voo_update
BEFORE UPDATE OF empresa_id, cv_voo_id ON cv_sigvoos_staging
FOR EACH ROW
WHEN NEW.cv_voo_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voos v
   WHERE v.id = NEW.cv_voo_id
     AND v.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_sigvoos_staging cv_voo_id mismatch');
END;

CREATE TRIGGER trg_cv_voo_etapas_empresa_insert
BEFORE INSERT ON cv_voo_etapas
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM cv_voos v
  WHERE v.id = NEW.voo_id
    AND v.empresa_id = NEW.empresa_id
)
BEGIN
  SELECT RAISE(ABORT, 'cv_voo_etapas empresa_id mismatch');
END;

CREATE TRIGGER trg_cv_voo_etapas_empresa_update
BEFORE UPDATE OF empresa_id, voo_id ON cv_voo_etapas
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM cv_voos v
  WHERE v.id = NEW.voo_id
    AND v.empresa_id = NEW.empresa_id
)
BEGIN
  SELECT RAISE(ABORT, 'cv_voo_etapas empresa_id mismatch');
END;

CREATE TRIGGER trg_cv_voo_tripulantes_etapa_insert
BEFORE INSERT ON cv_voo_tripulantes
FOR EACH ROW
WHEN NEW.etapa_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voo_etapas e
   WHERE e.id = NEW.etapa_id
     AND e.voo_id = NEW.voo_id
     AND e.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_voo_tripulantes etapa_id mismatch');
END;

CREATE TRIGGER trg_cv_voo_tripulantes_etapa_update
BEFORE UPDATE OF empresa_id, voo_id, etapa_id ON cv_voo_tripulantes
FOR EACH ROW
WHEN NEW.etapa_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voo_etapas e
   WHERE e.id = NEW.etapa_id
     AND e.voo_id = NEW.voo_id
     AND e.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_voo_tripulantes etapa_id mismatch');
END;

CREATE TRIGGER trg_edapp_config_updated
AFTER UPDATE ON integracoes_edapp_config FOR EACH ROW
BEGIN
  UPDATE integracoes_edapp_config SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_funcionarios_setor_required_insert
AFTER INSERT ON funcionarios
BEGIN
  UPDATE funcionarios
  SET setor_id = COALESCE(
        NEW.setor_id,
        (
          SELECT s.id
          FROM setores s
          WHERE s.empresa_id = NEW.empresa_id
            AND s.deleted_at IS NULL
            AND s.ativo = 1
            AND (
              LOWER(TRIM(s.nome)) = LOWER(TRIM(NEW.setor))
              OR LOWER(TRIM(s.codigo)) = LOWER(TRIM(NEW.setor))
            )
          ORDER BY s.id
          LIMIT 1
        )
      )
  WHERE id = NEW.id
    AND NEW.setor_id IS NULL;

  SELECT CASE
    WHEN (SELECT setor_id FROM funcionarios WHERE id = NEW.id) IS NULL
    THEN RAISE(ABORT, 'funcionarios.setor_id is required')
  END;

  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM setores s
      JOIN funcionarios f ON f.id = NEW.id
      WHERE s.id = f.setor_id
        AND s.empresa_id = f.empresa_id
        AND s.deleted_at IS NULL
        AND s.ativo = 1
    )
    THEN RAISE(ABORT, 'funcionarios.setor_id must reference an active sector in the same tenant')
  END;

  UPDATE funcionarios
  SET setor = (SELECT nome FROM setores WHERE id = funcionarios.setor_id)
  WHERE id = NEW.id;
END;

CREATE TRIGGER trg_funcionarios_setor_required_update
AFTER UPDATE OF setor_id, setor, empresa_id ON funcionarios
BEGIN
  UPDATE funcionarios
  SET setor_id = COALESCE(
        NEW.setor_id,
        (
          SELECT s.id
          FROM setores s
          WHERE s.empresa_id = NEW.empresa_id
            AND s.deleted_at IS NULL
            AND s.ativo = 1
            AND (
              LOWER(TRIM(s.nome)) = LOWER(TRIM(NEW.setor))
              OR LOWER(TRIM(s.codigo)) = LOWER(TRIM(NEW.setor))
            )
          ORDER BY s.id
          LIMIT 1
        )
      )
  WHERE id = NEW.id
    AND NEW.setor_id IS NULL;

  SELECT CASE
    WHEN (SELECT setor_id FROM funcionarios WHERE id = NEW.id) IS NULL
    THEN RAISE(ABORT, 'funcionarios.setor_id is required')
  END;

  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM setores s
      JOIN funcionarios f ON f.id = NEW.id
      WHERE s.id = f.setor_id
        AND s.empresa_id = f.empresa_id
        AND s.deleted_at IS NULL
        AND s.ativo = 1
    )
    THEN RAISE(ABORT, 'funcionarios.setor_id must reference an active sector in the same tenant')
  END;

  UPDATE funcionarios
  SET setor = (SELECT nome FROM setores WHERE id = funcionarios.setor_id)
  WHERE id = NEW.id
    AND setor IS NOT (SELECT nome FROM setores WHERE id = funcionarios.setor_id);
END;

CREATE TRIGGER trg_integracoes_edapp_cursos_updated_at
AFTER UPDATE ON integracoes_edapp_cursos
FOR EACH ROW
BEGIN
  UPDATE integracoes_edapp_cursos
  SET updated_at = datetime('now')
  WHERE id = NEW.id;
END;

CREATE TRIGGER trg_integracoes_edapp_eventos_updated_at
AFTER UPDATE ON integracoes_edapp_eventos
FOR EACH ROW
BEGIN
  UPDATE integracoes_edapp_eventos
  SET updated_at = datetime('now')
  WHERE id = NEW.id;
END;

CREATE TRIGGER trg_integracoes_edapp_usuarios_updated_at
AFTER UPDATE ON integracoes_edapp_usuarios
FOR EACH ROW
BEGIN
  UPDATE integracoes_edapp_usuarios
  SET updated_at = datetime('now')
  WHERE id = NEW.id;
END;

CREATE TRIGGER trg_lms_cursos_updated_at
AFTER UPDATE ON lms_cursos
FOR EACH ROW
BEGIN
  UPDATE lms_cursos SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_lms_h5p_conteudos_updated_at
AFTER UPDATE ON lms_h5p_conteudos
FOR EACH ROW
BEGIN
  UPDATE lms_h5p_conteudos SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_lms_matriculas_updated_at
AFTER UPDATE ON lms_matriculas
FOR EACH ROW
BEGIN
  UPDATE lms_matriculas SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_lms_progresso_scorm_updated_at
AFTER UPDATE ON lms_progresso_scorm
FOR EACH ROW
BEGIN
  UPDATE lms_progresso_scorm SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_qualificacoes_tipos_update
AFTER UPDATE ON qualificacoes_tipos
FOR EACH ROW
WHEN OLD.deleted_at IS NULL
BEGIN
  INSERT INTO auditoria_avancada_v2 (
    tabela,
    registro_id,
    acao,
    dados_anteriores,
    dados_novos
  )
  VALUES (
    'qualificacoes_tipos',
    NEW.id,
    'UPDATE',
    json_object(
      'codigo', OLD.codigo,
      'nome', OLD.nome,
      'validade', OLD.validade,
      'vencimento_fim_mes', OLD.vencimento_fim_mes,
      'categoria', OLD.categoria,
      'ativo', OLD.ativo
    ),
    json_object(
      'codigo', NEW.codigo,
      'nome', NEW.nome,
      'validade', NEW.validade,
      'vencimento_fim_mes', NEW.vencimento_fim_mes,
      'categoria', NEW.categoria,
      'ativo', NEW.ativo
    )
  );
END;

CREATE TRIGGER trg_tipo_update_auditoria
AFTER UPDATE ON qualificacoes_tipos
WHEN NEW.validade != OLD.validade OR NEW.vencimento_fim_mes != OLD.vencimento_fim_mes
BEGIN
  INSERT INTO auditoria_avancada_v2 (tabela, registro_id, acao, dados_anteriores, dados_novos)
  VALUES ('qualificacoes_tipos', NEW.id, 'UPDATE_TIPO_RECALCULO',
    json_object('validade', OLD.validade, 'vencimento_fim_mes', OLD.vencimento_fim_mes),
    json_object('validade', NEW.validade, 'vencimento_fim_mes', NEW.vencimento_fim_mes));
END;

CREATE TRIGGER trg_treinamentos_dias_updated_at
AFTER UPDATE ON treinamentos_dias
FOR EACH ROW
BEGIN
  UPDATE treinamentos_dias SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_treinamentos_instrutores_updated_at
AFTER UPDATE ON treinamentos_instrutores
FOR EACH ROW
BEGIN
  UPDATE treinamentos_instrutores SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_treinamentos_presencas_updated_at
AFTER UPDATE ON treinamentos_presencas
FOR EACH ROW
BEGIN
  UPDATE treinamentos_presencas SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER trigger_modelos_sessao_manobras_updated_at
AFTER UPDATE ON modelos_sessao_manobras
FOR EACH ROW
BEGIN
  UPDATE modelos_sessao_manobras
  SET updated_at = datetime('now')
  WHERE id = NEW.id;
END;

CREATE TRIGGER update_credenciais_updated_at
AFTER UPDATE ON credenciais
FOR EACH ROW
BEGIN
  UPDATE credenciais SET updated_at = datetime('now') WHERE id = OLD.id;
END;

CREATE TRIGGER update_papeis_updated_at
AFTER UPDATE ON papeis
FOR EACH ROW
BEGIN
  UPDATE papeis SET updated_at = datetime('now') WHERE id = OLD.id;
END;

CREATE TABLE lms_historico_importado (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  fonte TEXT NOT NULL DEFAULT 'EDAPP',
  integracao_evento_id INTEGER,
  funcionario_id INTEGER,
  funcionario_nome TEXT,
  curso_id INTEGER,
  curso_titulo TEXT NOT NULL,
  curso_categoria TEXT,
  tipo_conteudo TEXT,
  status TEXT NOT NULL DEFAULT 'CONCLUIDO',
  progresso_pct INTEGER NOT NULL DEFAULT 100,
  score_final REAL,
  qualificacao_codigo TEXT,
  qualificacao_historico_id INTEGER,
  edapp_user_id TEXT,
  edapp_course_id TEXT,
  edapp_course_external_id TEXT,
  edapp_course_title TEXT,
  completed_at TEXT,
  data_conclusao TEXT,
  funcionario_match_type TEXT,
  curso_match_type TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT, lms_matricula_ciclo_id INTEGER REFERENCES lms_matricula_ciclos(id),
  UNIQUE(empresa_id, fonte, integracao_evento_id)
);

CREATE TABLE lms_matricula_ciclos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  matricula_id INTEGER REFERENCES lms_matriculas(id),
  historico_importado_id INTEGER REFERENCES lms_historico_importado(id),
  curso_id INTEGER,
  funcionario_id INTEGER,
  numero_ciclo INTEGER NOT NULL DEFAULT 1,
  origem TEXT NOT NULL DEFAULT 'LMS'
    CHECK (origem IN ('LMS', 'MANUAL', 'AUTO_RENOVACAO', 'IMPORTADO_EDAPP')),
  status TEXT NOT NULL DEFAULT 'NAO_INICIADO'
    CHECK (status IN ('NAO_INICIADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'REPROVADO', 'CANCELADO', 'PENDENTE_VINCULO')),
  ciclo_atual INTEGER NOT NULL DEFAULT 1,
  observacoes TEXT,
  data_matricula TEXT,
  data_inicio TEXT,
  data_conclusao TEXT,
  data_expiracao TEXT,
  progresso_pct INTEGER NOT NULL DEFAULT 0,
  score_final REAL,
  tentativas INTEGER NOT NULL DEFAULT 0,
  qualificacao_historico_id INTEGER REFERENCES qualificacoes_historico(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (matricula_id IS NOT NULL OR historico_importado_id IS NOT NULL)
);

CREATE TABLE notificacoes_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_id INTEGER REFERENCES notificacoes_config(id),
  qualificacao_historico_id INTEGER REFERENCES qualificacoes_historico(id),
  funcionario_cpf VARCHAR(11),
  tipo VARCHAR(50),
  destinatario TEXT,
  assunto TEXT,
  corpo TEXT,
  status VARCHAR(20),
  erro_mensagem TEXT,
  enviado_em TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notificacoes_sistema (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  prioridade TEXT DEFAULT 'MEDIA',
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  dados TEXT,
  grupo TEXT,
  funcionario_id INTEGER,
  qualificacao_historico_id INTEGER,
  link TEXT,
  acao_primaria TEXT,
  lida INTEGER DEFAULT 0,
  lida_em TEXT,
  lida_por INTEGER,
  user_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT, empresa_id INTEGER,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (qualificacao_historico_id) REFERENCES qualificacoes_historico(id)
);

CREATE TABLE "qualificacoes_historico" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER,
  qualificacao_id INTEGER,
  tipo_codigo TEXT,
  codigo TEXT,
  categoria TEXT,
  validade TEXT,
  numero_certificado TEXT,
  observacoes TEXT,
  arquivo_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  data_conclusao TEXT,
  validade_meses INTEGER,
  instrutor TEXT,
  nota REAL,
  carga_horaria REAL,
  data_vencimento TEXT,
  renovada INTEGER DEFAULT 0,
  certificado_arquivo_id INTEGER,
  funcionario_cpf TEXT,
  qualificacao_codigo TEXT,
  empresa_id INTEGER NOT NULL,
  status TEXT,
  tipo_check_id INTEGER,
  sessao_id INTEGER,
  tipo TEXT,
  data_confirmacao TEXT,
  confirmada_por INTEGER,
  tipo_treinamento TEXT CHECK(tipo_treinamento IN ('INICIAL', 'RECORRENTE', 'SEMESTRAL', 'UPGRADE', 'ESPECIFICO')),
  renovacao_de INTEGER DEFAULT NULL,
  lms_matricula_id INTEGER REFERENCES lms_matriculas(id),
  origem_tipo TEXT CHECK(origem_tipo IS NULL OR origem_tipo IN ('LMS', 'PRESENCIAL', 'SIMULADOR', 'IMPORTADO_EDAPP', 'MANUAL')),
  lms_matricula_ciclo_id INTEGER REFERENCES lms_matricula_ciclos(id)
);

CREATE TABLE qualificacoes_historico_reclass_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  historico_id INTEGER NOT NULL,
  current_codigo TEXT,
  target_tipo_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(historico_id),
  FOREIGN KEY(historico_id) REFERENCES qualificacoes_historico(id) ON DELETE CASCADE
);

CREATE TABLE treinamentos_qualificacoes_geradas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  treinamento_id INTEGER NOT NULL,
  participante_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  qualificacao_tipo_id INTEGER NOT NULL,
  qualificacao_historico_id INTEGER NOT NULL,
  data_conclusao_efetiva TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (treinamento_id) REFERENCES treinamentos_planejados(id) ON DELETE CASCADE,
  FOREIGN KEY (participante_id) REFERENCES treinamentos_participantes(id) ON DELETE CASCADE,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (qualificacao_tipo_id) REFERENCES qualificacoes_tipos(id),
  FOREIGN KEY (qualificacao_historico_id) REFERENCES qualificacoes_historico(id),
  UNIQUE(empresa_id, treinamento_id, participante_id, qualificacao_tipo_id, data_conclusao_efetiva),
  UNIQUE(qualificacao_historico_id)
);

CREATE VIEW notificacoes_nao_lidas AS
SELECT
  n.*,
  f.nome as funcionario_nome,
  f.matricula as funcionario_matricula
FROM notificacoes_sistema n
LEFT JOIN funcionarios f ON f.id = n.funcionario_id
WHERE n.lida = 0
  AND n.deleted_at IS NULL
ORDER BY
  CASE n.prioridade
    WHEN 'URGENTE' THEN 1
    WHEN 'ALTA' THEN 2
    WHEN 'MEDIA' THEN 3
    WHEN 'BAIXA' THEN 4
    ELSE 5
  END,
  n.created_at DESC;

CREATE VIEW qualificacoes_historico_v AS
SELECT
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_id,
  qh.data_conclusao,
  qh.data_vencimento,
  qh.numero_certificado,
  qh.arquivo_url AS certificado_url,
  qh.nota,
  qh.instrutor,
  qh.observacoes,
  COALESCE(qt.nome, qh.tipo_codigo, qh.codigo) AS qualificacao_nome,
  COALESCE(qt.codigo, qh.codigo) AS qualificacao_codigo,
  COALESCE(qt.categoria, qh.categoria) AS qualificacao_categoria,
  qt.validade AS qualificacao_validade_meses,
  f.nome AS funcionario_nome,
  f.matricula AS funcionario_matricula,
  f.cargo AS funcionario_cargo,
  f.email AS funcionario_email,
  f.codigo_anac AS funcionario_codigo_anac,
  CASE
    WHEN qh.data_vencimento IS NULL THEN 'INDETERMINADA'
    WHEN julianday(qh.data_vencimento) < julianday('now') THEN 'VENCIDA'
    WHEN julianday(qh.data_vencimento) - julianday('now') <= 30 THEN 'PROXIMA_VENCIMENTO'
    WHEN julianday(qh.data_vencimento) - julianday('now') <= 90 THEN 'ATENCAO'
    ELSE 'VALIDA'
  END AS status,
  CAST(julianday(qh.data_vencimento) - julianday('now') AS INTEGER) AS dias_ate_vencimento,
  qh.created_at,
  qh.updated_at,
  qh.deleted_at
FROM qualificacoes_historico qh
LEFT JOIN qualificacoes_tipos qt ON CAST(qt.id AS TEXT) = CAST(qh.qualificacao_id AS TEXT) AND qt.deleted_at IS NULL
LEFT JOIN funcionarios f ON CAST(f.id AS TEXT) = CAST(qh.funcionario_id AS TEXT) AND f.deleted_at IS NULL
WHERE qh.deleted_at IS NULL;

CREATE VIEW vw_tripulante_operacional AS
SELECT
  f.id AS funcionario_id,
  f.nome,
  COALESCE(NULLIF(TRIM(f.guerra), ''), NULL) AS nome_guerra,
  COALESCE(NULLIF(TRIM(f.matricula), ''), CAST(f.id AS TEXT)) AS matricula,
  f.empresa_id,
  COALESCE(NULLIF(TRIM(f.funcao), ''), NULLIF(TRIM(f.cargo), ''), 'tripulante') AS role,
  COALESCE(f.modelo_aeronave_id, '') AS modelo_aeronave_id,
  COALESCE(f.aeronave, '') AS aeronave_legacy,
  CASE WHEN EXISTS (
    SELECT 1 FROM qualificacoes_historico qh
    LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
    WHERE qh.funcionario_id = f.id AND qh.deleted_at IS NULL
      AND COALESCE(qh.status, 'CONCLUIDA') != 'CANCELADA'
      AND UPPER(COALESCE(qh.qualificacao_codigo, qt.codigo, '')) = 'CMA'
      AND COALESCE(qh.data_vencimento, date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade, 12) || ' months')) >= date('now')
  ) THEN 1 ELSE 0 END AS cma_valido,
  CAST((JULIANDAY((
    SELECT MAX(COALESCE(qh2.data_vencimento, date(qh2.data_conclusao, '+' || COALESCE(qh2.validade_meses, qt2.validade, 12) || ' months')))
    FROM qualificacoes_historico qh2
    LEFT JOIN qualificacoes_tipos qt2 ON qt2.id = qh2.qualificacao_id AND qt2.deleted_at IS NULL
    WHERE qh2.funcionario_id = f.id AND qh2.deleted_at IS NULL
      AND COALESCE(qh2.status, 'CONCLUIDA') != 'CANCELADA'
      AND UPPER(COALESCE(qh2.qualificacao_codigo, qt2.codigo, '')) = 'CMA'
  )) - JULIANDAY('now')) AS INTEGER) AS cma_dias_restantes,
  (SELECT MAX(COALESCE(qh3.data_vencimento, date(qh3.data_conclusao, '+' || COALESCE(qh3.validade_meses, qt3.validade, 12) || ' months')))
    FROM qualificacoes_historico qh3
    LEFT JOIN qualificacoes_tipos qt3 ON qt3.id = qh3.qualificacao_id AND qt3.deleted_at IS NULL
    WHERE qh3.funcionario_id = f.id AND qh3.deleted_at IS NULL
      AND COALESCE(qh3.status, 'CONCLUIDA') != 'CANCELADA'
      AND UPPER(COALESCE(qh3.qualificacao_codigo, qt3.codigo, '')) = 'CMA'
  ) AS cma_validade_fim,
  (WITH base AS (
    SELECT
      COALESCE(SUM(CASE WHEN date(data) >= date('now', '-7 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_7,
      COALESCE(SUM(CASE WHEN date(data) >= date('now', '-28 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_28,
      COUNT(DISTINCT CASE WHEN date(data) >= date('now', '-28 days') THEN date(data) END) AS dias_28
    FROM frms_jornada WHERE tripulante_id = f.id AND deleted_at IS NULL
  ) SELECT MIN(100, ROUND((minutos_7 / 60.0) * 2.5 + (minutos_28 / 60.0) * 0.8 + dias_28 * 1.1)) FROM base) AS frms_score,
  CASE
    WHEN EXISTS (SELECT 1 FROM frms_alerta fa WHERE fa.tripulante_id = f.id AND fa.deleted_at IS NULL AND COALESCE(fa.resolvido, 0) = 0 AND fa.nivel IN ('CRITICO', 'VIOLACAO')) THEN 'critico'
    WHEN (WITH base AS (
      SELECT
        COALESCE(SUM(CASE WHEN date(data) >= date('now', '-7 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_7,
        COALESCE(SUM(CASE WHEN date(data) >= date('now', '-28 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_28,
        COUNT(DISTINCT CASE WHEN date(data) >= date('now', '-28 days') THEN date(data) END) AS dias_28
      FROM frms_jornada WHERE tripulante_id = f.id AND deleted_at IS NULL
    ) SELECT MIN(100, ROUND((minutos_7 / 60.0) * 2.5 + (minutos_28 / 60.0) * 0.8 + dias_28 * 1.1)) FROM base) >= 45 THEN 'atencao'
    ELSE 'ok'
  END AS frms_status,
  (SELECT MAX(created_at) FROM frms_jornada fj WHERE fj.tripulante_id = f.id AND fj.deleted_at IS NULL) AS frms_avaliacao_data,
  (SELECT COUNT(*) FROM sessoes_participantes sp JOIN simulador_agendamentos sa ON sa.id = sp.sessao_id
    WHERE sp.funcionario_id = f.id AND sp.deleted_at IS NULL AND sa.deleted_at IS NULL
      AND UPPER(COALESCE(sa.status, 'AGENDADA')) NOT IN ('CONCLUIDA', 'CANCELADA') AND date(sa.data) >= date('now')
  ) AS simuladores_pendentes,
  (SELECT MIN(sa2.data) FROM sessoes_participantes sp2 JOIN simulador_agendamentos sa2 ON sa2.id = sp2.sessao_id
    WHERE sp2.funcionario_id = f.id AND sp2.deleted_at IS NULL AND sa2.deleted_at IS NULL
      AND UPPER(COALESCE(sa2.status, 'AGENDADA')) NOT IN ('CONCLUIDA', 'CANCELADA') AND date(sa2.data) >= date('now')
  ) AS proximo_simulador_data,
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM qualificacoes_historico qh4
      LEFT JOIN qualificacoes_tipos qt4 ON qt4.id = qh4.qualificacao_id AND qt4.deleted_at IS NULL
      WHERE qh4.funcionario_id = f.id AND qh4.deleted_at IS NULL AND COALESCE(qh4.status, 'CONCLUIDA') != 'CANCELADA'
        AND UPPER(COALESCE(qh4.qualificacao_codigo, qt4.codigo, '')) = 'CMA'
        AND COALESCE(qh4.data_vencimento, date(qh4.data_conclusao, '+' || COALESCE(qh4.validade_meses, qt4.validade, 12) || ' months')) >= date('now')
    ) THEN 'BLOQUEADO_CMA'
    WHEN EXISTS (SELECT 1 FROM frms_alerta fa2 WHERE fa2.tripulante_id = f.id AND fa2.deleted_at IS NULL AND COALESCE(fa2.resolvido, 0) = 0 AND fa2.nivel IN ('CRITICO', 'VIOLACAO')) THEN 'BLOQUEADO_FRMS'
    WHEN CAST((JULIANDAY((
      SELECT MAX(COALESCE(qh5.data_vencimento, date(qh5.data_conclusao, '+' || COALESCE(qh5.validade_meses, qt5.validade, 12) || ' months')))
      FROM qualificacoes_historico qh5
      LEFT JOIN qualificacoes_tipos qt5 ON qt5.id = qh5.qualificacao_id AND qt5.deleted_at IS NULL
      WHERE qh5.funcionario_id = f.id AND qh5.deleted_at IS NULL AND COALESCE(qh5.status, 'CONCLUIDA') != 'CANCELADA'
        AND UPPER(COALESCE(qh5.qualificacao_codigo, qt5.codigo, '')) = 'CMA'
    )) - JULIANDAY('now')) AS INTEGER) <= 30 THEN 'ATENCAO_CMA'
    WHEN EXISTS (SELECT 1 FROM frms_alerta fa3 WHERE fa3.tripulante_id = f.id AND fa3.deleted_at IS NULL AND COALESCE(fa3.resolvido, 0) = 0 AND fa3.nivel = 'ATENCAO') THEN 'ATENCAO_FRMS'
    ELSE 'APTO'
  END AS status_operacional
FROM funcionarios f
WHERE f.deleted_at IS NULL AND COALESCE(f.ativo, 1) = 1;

CREATE INDEX idx_lms_historico_importado_ciclo
  ON lms_historico_importado(lms_matricula_ciclo_id)
  WHERE lms_matricula_ciclo_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_lms_historico_importado_curso
  ON lms_historico_importado(curso_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_lms_historico_importado_empresa
  ON lms_historico_importado(empresa_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_lms_historico_importado_fonte
  ON lms_historico_importado(fonte, data_conclusao) WHERE deleted_at IS NULL;

CREATE INDEX idx_lms_historico_importado_funcionario
  ON lms_historico_importado(funcionario_id) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_lms_matricula_ciclos_ativo_unico
  ON lms_matricula_ciclos(matricula_id)
  WHERE matricula_id IS NOT NULL AND ciclo_atual = 1 AND deleted_at IS NULL;

CREATE INDEX idx_lms_matricula_ciclos_funcionario
  ON lms_matricula_ciclos(empresa_id, funcionario_id, curso_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_lms_matricula_ciclos_legado_unico
  ON lms_matricula_ciclos(historico_importado_id)
  WHERE historico_importado_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_lms_matricula_ciclos_matricula
  ON lms_matricula_ciclos(matricula_id, numero_ciclo)
  WHERE matricula_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_notificacoes_deleted ON notificacoes_sistema(deleted_at);

CREATE INDEX idx_notificacoes_grupo ON notificacoes_sistema(grupo);

CREATE INDEX idx_notificacoes_lida ON notificacoes_sistema(lida, created_at DESC);

CREATE INDEX idx_notificacoes_log_enviado_em ON notificacoes_log(enviado_em);

CREATE INDEX idx_notificacoes_log_funcionario_cpf ON notificacoes_log(funcionario_cpf);

CREATE INDEX idx_notificacoes_log_status ON notificacoes_log(status);

CREATE INDEX idx_notificacoes_sistema_empresa_lida_created
ON notificacoes_sistema(empresa_id, lida, created_at DESC);

CREATE INDEX idx_notificacoes_sistema_global_lida_created
ON notificacoes_sistema(lida, created_at DESC)
WHERE empresa_id IS NULL;

CREATE INDEX idx_notificacoes_tipo ON notificacoes_sistema(tipo, created_at DESC);

CREATE INDEX idx_notificacoes_user_id ON notificacoes_sistema(user_id, lida, created_at DESC);

CREATE INDEX idx_qh_renovacao_de ON qualificacoes_historico(renovacao_de) WHERE renovacao_de IS NOT NULL;

CREATE INDEX idx_qual_historico_lms_matricula
  ON qualificacoes_historico(lms_matricula_id)
  WHERE lms_matricula_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_qual_historico_lms_matricula_ciclo
  ON qualificacoes_historico(lms_matricula_ciclo_id)
  WHERE lms_matricula_ciclo_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_qual_historico_origem_tipo
  ON qualificacoes_historico(origem_tipo, empresa_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_qualificacoes_hist_data_conclusao ON qualificacoes_historico(data_conclusao) WHERE deleted_at IS NULL;

CREATE INDEX idx_qualificacoes_hist_data_vencimento ON qualificacoes_historico(data_vencimento) WHERE deleted_at IS NULL;

CREATE INDEX idx_qualificacoes_historico_empresa_deleted
  ON qualificacoes_historico (empresa_id, deleted_at);

CREATE INDEX idx_qualificacoes_historico_empresa_funcionario ON qualificacoes_historico (empresa_id, funcionario_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_qualificacoes_historico_empresa_id ON qualificacoes_historico (empresa_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_qualificacoes_historico_sessao ON qualificacoes_historico(sessao_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_qualificacoes_historico_status ON qualificacoes_historico(status) WHERE deleted_at IS NULL;

CREATE INDEX idx_qualificacoes_historico_tipo ON qualificacoes_historico(tipo);

CREATE UNIQUE INDEX idx_qualificacoes_historico_unique_active ON qualificacoes_historico(funcionario_id, qualificacao_codigo, data_conclusao) WHERE deleted_at IS NULL;

CREATE INDEX idx_treinamentos_qualificacoes_origem
  ON treinamentos_qualificacoes_geradas(empresa_id, treinamento_id, funcionario_id);

CREATE TRIGGER trg_apply_reclassification
AFTER UPDATE ON qualificacoes_historico_reclass_queue
WHEN NEW.status = 'APPLIED' AND NEW.target_tipo_id IS NOT NULL
BEGIN
  UPDATE qualificacoes_historico
  SET qualificacao_id = NEW.target_tipo_id,
      codigo = (SELECT codigo FROM qualificacoes_tipos WHERE id = NEW.target_tipo_id),
      tipo_codigo = (SELECT codigo FROM qualificacoes_tipos WHERE id = NEW.target_tipo_id),
      categoria = (SELECT categoria FROM qualificacoes_tipos WHERE id = NEW.target_tipo_id),
      updated_at = datetime('now')
  WHERE id = NEW.historico_id;
  INSERT INTO _data_recovery_log(etapa, detalhes)
  VALUES ('APPLY_RECLASS', 'historico_id=' || NEW.historico_id || ' -> tipo_id=' || NEW.target_tipo_id);
END;

CREATE TRIGGER trg_calc_vencimento_insert
AFTER INSERT ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.validade_meses IS NOT NULL
  AND NEW.validade_meses > 0
  AND NEW.data_conclusao IS NOT NULL
  AND NEW.data_vencimento IS NULL
BEGIN
  UPDATE qualificacoes_historico
    SET data_vencimento = date(NEW.data_conclusao, '+' || NEW.validade_meses || ' months')
    WHERE id = NEW.id;
END;

CREATE TRIGGER trg_lms_historico_importado_updated_at
AFTER UPDATE ON lms_historico_importado
FOR EACH ROW
BEGIN
  UPDATE lms_historico_importado
  SET updated_at = datetime('now')
  WHERE id = NEW.id;
END;

CREATE TRIGGER trg_qualificacoes_historico_set_tipo
AFTER INSERT ON qualificacoes_historico
WHEN NEW.tipo IS NULL AND NEW.qualificacao_id IS NOT NULL
BEGIN
  UPDATE qualificacoes_historico
  SET tipo = (
    SELECT nome FROM qualificacoes_tipos
    WHERE id = NEW.qualificacao_id
    LIMIT 1
  )
  WHERE id = NEW.id;
END;

CREATE TRIGGER trg_qualificacoes_historico_update_tipo
AFTER UPDATE OF qualificacao_id ON qualificacoes_historico
WHEN NEW.qualificacao_id IS NOT NULL
  AND (OLD.qualificacao_id IS NULL OR OLD.qualificacao_id != NEW.qualificacao_id)
BEGIN
  UPDATE qualificacoes_historico
  SET tipo = (
    SELECT nome FROM qualificacoes_tipos
    WHERE id = NEW.qualificacao_id
    LIMIT 1
  )
  WHERE id = NEW.id;
END;
