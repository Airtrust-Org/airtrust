PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE d1_migrations(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE funcoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
, empresa_id INTEGER DEFAULT 1);
CREATE TABLE setores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  responsavel TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
, empresa_id INTEGER DEFAULT 1);
CREATE TABLE aeronaves (
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
  deleted_at TEXT
, empresa_id INTEGER DEFAULT 1);
CREATE TABLE backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome_arquivo TEXT NOT NULL,
  tamanho INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
, filename TEXT DEFAULT '', size_bytes INTEGER DEFAULT 0, backup_type TEXT DEFAULT 'MANUAL', label TEXT DEFAULT '', storage_path TEXT DEFAULT '');
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
CREATE TABLE user_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id TEXT NOT NULL,
  permissao TEXT NOT NULL,
  recurso TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  UNIQUE(usuario_id, permissao, recurso)
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
CREATE TABLE fichas_sessao (
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
  deleted_at DATETIME
, observacoes_gerais TEXT, assinatura_instrutor_completa INTEGER DEFAULT 0, assinatura_aluno_completa INTEGER DEFAULT 0, data_conclusao TEXT, pdf_url TEXT, empresa_id INTEGER, assinatura_instrutor INTEGER DEFAULT 0, assinatura_instrutor_data DATETIME, assinatura_instrutor_usuario_id INTEGER, assinatura_tripulante INTEGER DEFAULT 0, assinatura_tripulante_data DATETIME, assinatura_tripulante_usuario_id INTEGER, tipo_sessao TEXT, tipo_aeronave TEXT, data_sessao TEXT, assinatura_aluno_ip TEXT, assinatura_aluno_timestamp TEXT, assinatura_instrutor_ip TEXT, assinatura_instrutor_timestamp TEXT, arquivado INTEGER DEFAULT 0, caminho_arquivo TEXT, data_arquivamento TEXT);
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
CREATE TABLE IF NOT EXISTS "qualificacoes_categorias" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  codigo TEXT NOT NULL UNIQUE,
  descricao TEXT,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME
, cor TEXT DEFAULT '#6B7280', ativo INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS "modelos_sessao" (
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
  deleted_at DATETIME NULL
, tipo_sessao_id INTEGER, tipo_aeronave TEXT, codigo_aeronave TEXT, gera_qualificacao BOOLEAN DEFAULT 0, empresa_id INTEGER DEFAULT 1, modelo_aeronave TEXT);
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
, codigo TEXT, plano TEXT DEFAULT 'basic', max_funcionarios INTEGER DEFAULT 100, max_storage_mb INTEGER DEFAULT 1000);
CREATE TABLE certificados (
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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME
);
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
CREATE TABLE schema_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL,
  module TEXT NOT NULL,
  description TEXT,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ANALYZE sqlite_schema;
CREATE TABLE IF NOT EXISTS "manobras_avaliacoes" (
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
CREATE TABLE IF NOT EXISTS "simulador_agendamentos" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  simulador_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  instrutor_id INTEGER NOT NULL,
  checador_id INTEGER,
  template_id INTEGER,
  data DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  duracao_minutos INTEGER,
  status TEXT DEFAULT 'AGENDADO', -- AGENDADO, EM_ANDAMENTO, CONCLUIDO, CANCELADO
  tipo_sessao TEXT, -- INICIAL, RECORRENTE, CHECK, PF, PM
  observacoes TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
, nome TEXT, examinador_id INTEGER NULL, is_check INTEGER NOT NULL DEFAULT 0, empresa_id INTEGER REFERENCES empresas(id));
CREATE TABLE migracao_mapeamento_ids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tabela TEXT NOT NULL,
  id_v1 INTEGER NOT NULL,
  id_v2 INTEGER NOT NULL,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tabela, id_v1)
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
CREATE TABLE migracao_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tabela_origem TEXT NOT NULL,
  tabela_destino TEXT NOT NULL,
  acao TEXT NOT NULL,
  registros_afetados INTEGER DEFAULT 0,
  detalhes TEXT,
  status TEXT DEFAULT 'PENDENTE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
CREATE TABLE IF NOT EXISTS "sessoes_fichas" (
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
CREATE TABLE IF NOT EXISTS "manobras" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  categoria TEXT,
  descricao TEXT,
  nivel_dificuldade INTEGER,
  tempo_estimado INTEGER,
  pontuacao_minima REAL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  deleted_at TEXT DEFAULT NULL
, tipo_sessao TEXT DEFAULT 'TREINAMENTO', tipo_aeronave TEXT DEFAULT 'AW139', ordem INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS "ficha_manobras_avaliacao" ( id INTEGER PRIMARY KEY AUTOINCREMENT, ficha_id INTEGER NOT NULL, manobra_id INTEGER NOT NULL, nota REAL DEFAULT 0, observacoes TEXT, executada BOOLEAN DEFAULT 0, data_execucao DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT DEFAULT NULL, FOREIGN KEY (ficha_id) REFERENCES fichas_sessao(id), FOREIGN KEY (manobra_id) REFERENCES manobras(id), UNIQUE(ficha_id, manobra_id) );
CREATE TABLE refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES usuarios(id)
);
CREATE TABLE legacy_funcionarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Dados do funcionário
  matricula TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  cpf TEXT,
  funcao TEXT,
  setor TEXT,
  email TEXT,
  telefone TEXT,
  
  -- Dados legados de qualificações (denormalizados)
  cma_numero TEXT,
  cma_data_vencimento DATE,
  cma_status TEXT,
  aso_data_vencimento DATE,
  nivel_icao TEXT,
  nivel_icao_data_vencimento DATE,
  
  -- Metadata de origem
  origem TEXT DEFAULT 'LEGACY_IMPORT',
  fonte_backup TEXT, -- qual arquivo/commit originou
  
  -- Auditoria
  created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  imported_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now'))
);
CREATE TABLE legacy_qualificacoes_tipos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Identificadores
  codigo TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  
  -- Metadados
  categoria TEXT CHECK (categoria IN ('TREINAMENTO', 'EXAME', 'CHECK')),
  validade_meses INTEGER,
  periodicidade_meses INTEGER,
  carga_horaria INTEGER,
  descricao TEXT,
  nota_minima REAL,
  
  -- Origem
  origem TEXT DEFAULT 'LEGACY_IMPORT',
  fonte_backup TEXT,
  
  -- Auditoria
  created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  imported_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now'))
);
CREATE TABLE legacy_qualificacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Relacionamentos (por enquanto como TEXT, para aceitar qualquer formato)
  matricula TEXT NOT NULL,
  codigo TEXT NOT NULL,
  
  -- Dados denormalizados (podem vir nos dumps legados)
  funcionario_nome TEXT,
  qualificacao_nome TEXT,
  
  -- Categoria e tipo
  categoria TEXT CHECK (categoria IN ('TREINAMENTO', 'EXAME', 'CHECK')),
  tipo TEXT,
  
  -- Datas
  data_conclusao DATE,
  data_vencimento DATE,
  validade DATE,
  data_execucao DATE, -- nome antigo, pode ser mapeado para data_conclusao
  
  -- Avaliação
  nota INTEGER,
  nota_final REAL,
  resultado TEXT,
  
  -- Status
  status TEXT,
  
  -- Outros campos legados
  instrutor TEXT,
  checador TEXT,
  local TEXT,
  observacoes TEXT,
  carga_horaria INTEGER,
  
  -- Certificado
  certificado_url TEXT,
  certificado_numero TEXT,
  
  -- Origem
  origem TEXT DEFAULT 'LEGACY_IMPORT',
  fonte_backup TEXT,
  
  -- Auditoria
  created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  imported_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now'))
);
CREATE TABLE legacy_import_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Identificação da importação
  batch_id TEXT NOT NULL,
  fonte TEXT NOT NULL, -- arquivo, commit, backup
  tabela_destino TEXT NOT NULL, -- legacy_funcionarios, legacy_qualificacoes_tipos, etc.
  
  -- Estatísticas
  total_linhas INTEGER DEFAULT 0,
  linhas_importadas INTEGER DEFAULT 0,
  linhas_duplicadas INTEGER DEFAULT 0,
  linhas_erro INTEGER DEFAULT 0,
  
  -- Status
  status TEXT CHECK (status IN ('INICIADO', 'CONCLUIDO', 'ERRO', 'ROLLBACK')),
  erro_mensagem TEXT,
  
  -- Auditoria
  started_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  finished_at TEXT,
  
  -- Usuário responsável
  imported_by TEXT DEFAULT 'SYSTEM'
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
  deleted_at TIMESTAMP,
  FOREIGN KEY(ficha_id) REFERENCES fichas_sessao(id)
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
CREATE TABLE IF NOT EXISTS "qualificacoes_tipos_old" (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  codigo TEXT NOT NULL,
  categoria TEXT NOT NULL,
  validade_meses INTEGER,
  descricao TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
, tipo TEXT, carga_horaria REAL CHECK(carga_horaria IS NULL OR carga_horaria > 0));
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
  FOREIGN KEY (funcionario_id) REFERENCES "funcionarios"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
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
  FOREIGN KEY (funcionario_id) REFERENCES "funcionarios"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "_backup_qh_tmp" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  qualificacao_id INTEGER,
  tipo_codigo TEXT,
  codigo TEXT,
  categoria TEXT,
  validade TEXT,
  numero_certificado TEXT,
  orgao_emissor TEXT,
  observacoes TEXT,
  arquivo_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY(funcionario_id) REFERENCES "funcionarios"(id) ON DELETE RESTRICT
);
CREATE TABLE _qualificacoes_mapping(
  historico_id INT,
  tipo_codigo TEXT,
  codigo TEXT,
  qualificacao_tipo_id TEXT,
  status
);
CREATE TABLE _qualificacoes_enriquecimento (historico_id INTEGER PRIMARY KEY, categoria TEXT, validade TEXT, numero_certificado TEXT, orgao_emissor TEXT, sugestao_codigo TEXT, sugestao_nome TEXT, status TEXT DEFAULT 'PENDING', created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nome TEXT NOT NULL,
  perfil TEXT DEFAULT 'USUARIO' CHECK(perfil IN ('ADMIN', 'COMPLIANCE', 'GESTOR', 'USUARIO')),
  funcionario_id INTEGER,
  deleted_at INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  active INTEGER DEFAULT 1,
  last_login TEXT,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES "funcionarios"(id)
);
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
  FOREIGN KEY (funcionario_id) REFERENCES "funcionarios"(id)
);
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
  FOREIGN KEY (funcionario_id) REFERENCES "funcionarios"(id)
);
CREATE TABLE _data_recovery_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  etapa TEXT NOT NULL,
  detalhes TEXT,
  executed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE qualificacoes_historico_reclass_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  historico_id INTEGER NOT NULL,
  current_codigo TEXT,
  target_tipo_id TEXT, -- referencia qualificacoes_tipos.id (tipo TEXT)
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING|APPLIED|SKIPPED
  reason TEXT, -- justificativa / fonte da decisão
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(historico_id),
  FOREIGN KEY(historico_id) REFERENCES qualificacoes_historico(id) ON DELETE CASCADE
);
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
CREATE TABLE IF NOT EXISTS "importacoes_log" (
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
  created_at TEXT DEFAULT (datetime('now')), empresa_id INTEGER DEFAULT 1,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);
CREATE TABLE funcionarios_tmp(
  id INT,
  nome TEXT,
  email TEXT,
  matricula TEXT,
  cpf TEXT,
  cargo TEXT,
  departamento TEXT,
  status TEXT,
  observacoes TEXT,
  guerra TEXT,
  funcao TEXT,
  setor TEXT,
  codigo_anac TEXT,
  is_instrutor INT,
  is_checador INT,
  ativo INT,
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
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  telefone TEXT,
  licenca TEXT,
  canac TEXT,
  admissao TEXT
);
CREATE TABLE qualificacoes_tipos_backup_0063(
  id TEXT,
  nome TEXT,
  codigo TEXT,
  categoria TEXT,
  validade_meses INT,
  descricao TEXT,
  ativo INT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  tipo TEXT,
  carga_horaria REAL
);
CREATE TABLE modelos_aeronave (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  fabricante TEXT,
  tipo TEXT, -- Ex: Jato, Turboélice, Helicóptero
  categoria TEXT, -- Ex: Comercial, Executivo, Militar
  descricao TEXT,
  ativo INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME
, empresa_id INTEGER DEFAULT 1, modelo TEXT);
CREATE TABLE notificacoes_config (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo VARCHAR(50) NOT NULL, ativo INTEGER DEFAULT 1 CHECK(ativo IN (0, 1)), dias_antes INTEGER NOT NULL, urgencia VARCHAR(20), destinatarios TEXT, template TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT);
CREATE TABLE notificacoes_log (id INTEGER PRIMARY KEY AUTOINCREMENT, config_id INTEGER REFERENCES notificacoes_config(id), qualificacao_historico_id INTEGER REFERENCES qualificacoes_historico(id), funcionario_cpf VARCHAR(11), tipo VARCHAR(50), destinatario TEXT, assunto TEXT, corpo TEXT, status VARCHAR(20), erro_mensagem TEXT, enviado_em TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE historico_compliance (   id INTEGER PRIMARY KEY AUTOINCREMENT,   funcionario_id INTEGER NOT NULL,   tipo_recurso TEXT NOT NULL CHECK(tipo_recurso IN ('qualificacao', 'licenca')),   recurso_id INTEGER NOT NULL,   status_compliance TEXT NOT NULL CHECK(status_compliance IN ('CONFORME', 'VENCIDO', 'PENDENTE', 'A_VENCER')),   percentual_conformidade REAL NOT NULL DEFAULT 0.0,   data_calculo TEXT NOT NULL DEFAULT (datetime('now')),   data_vencimento TEXT,   dias_para_vencer INTEGER,   observacoes TEXT,   created_at TEXT NOT NULL DEFAULT (datetime('now')),   updated_at TEXT NOT NULL DEFAULT (datetime('now')),   deleted_at TEXT,   FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE );
CREATE TABLE qualificacoes_tipos_id_map (
        old_id TEXT PRIMARY KEY,
        new_id INTEGER NOT NULL,
        codigo TEXT NOT NULL
      );
CREATE TABLE qualificacoes_tipos_backup_20251128(
  id TEXT,
  tipo TEXT,
  codigo TEXT,
  nome TEXT,
  descricao TEXT,
  categoria TEXT,
  carga_horaria REAL,
  validade INT,
  observacoes TEXT,
  ativo INT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  vencimento_fim_mes INT
);
CREATE TABLE IF NOT EXISTS "qualificacoes_tipos" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT,
        codigo TEXT NOT NULL UNIQUE COLLATE NOCASE,
        nome TEXT NOT NULL CHECK(length(trim(nome)) >= 3),
        descricao TEXT,
        categoria TEXT,
        carga_horaria REAL CHECK(carga_horaria IS NULL OR carga_horaria > 0),
        validade INTEGER CHECK(validade IS NULL OR validade > 0),
        vencimento_fim_mes INTEGER DEFAULT 0 CHECK(vencimento_fim_mes IN (0, 1)),
        observacoes TEXT,
        ativo INTEGER DEFAULT 1 CHECK(ativo IN (0, 1)),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME DEFAULT NULL
      , empresa_id INTEGER DEFAULT 1, is_check INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS "funcionarios" (
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
  modelo_aeronave_id TEXT
, empresa_id INTEGER DEFAULT 1, data_realizacao_icao TEXT, data_realizacao_cma TEXT, data_realizacao_aso TEXT, is_examinador INTEGER NOT NULL DEFAULT 0, quinzena TEXT
  CHECK(quinzena IN ('primeira', 'segunda', 'personalizada'))
  DEFAULT 'primeira');
CREATE TABLE pasta_virtual (
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
        deleted_at TEXT, empresa_id INTEGER DEFAULT 1,
        FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
      );
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
CREATE TABLE arquivos (
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
        deleted_at TEXT, empresa_id INTEGER DEFAULT 1,
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
CREATE TABLE documentos (
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
        deleted_at TEXT DEFAULT NULL, empresa_id INTEGER DEFAULT 1,
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      );
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
CREATE TABLE licencas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id TEXT NOT NULL,
        tipo TEXT NOT NULL,
        numero TEXT NOT NULL,
        data_emissao TEXT NOT NULL,
        data_vencimento TEXT NOT NULL,
        observacoes TEXT,
        created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
        updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
        deleted_at TEXT DEFAULT NULL,
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
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
CREATE TABLE sessoes_template (id INTEGER PRIMARY KEY AUTOINCREMENT, tema TEXT NOT NULL, tipo_sessao TEXT DEFAULT 'TREINAMENTO', tipo_aeronave TEXT DEFAULT 'AW139', duracao_estimada INTEGER DEFAULT 120, descricao TEXT, ativa BOOLEAN DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, deleted_at TIMESTAMP, codigo TEXT, gera_qualificacao BOOLEAN DEFAULT 0);
CREATE TABLE IF NOT EXISTS "modelos_sessao_manobras" (
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
  updated_by TEXT,
  
  -- Foreign Keys CORRIGIDAS
  FOREIGN KEY (modelo_id) REFERENCES modelos_sessao(id) ON DELETE CASCADE,
  FOREIGN KEY (manobra_id) REFERENCES manobras(id) ON DELETE CASCADE,
  
  -- Constraint: não permitir manobra duplicada no mesmo modelo
  UNIQUE(modelo_id, manobra_id)
);
CREATE TABLE IF NOT EXISTS "tipos_sessao" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo INTEGER DEFAULT 1,
  ordem INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME, empresa_id INTEGER DEFAULT 1,
  UNIQUE(codigo, deleted_at)
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
CREATE TABLE integracoes_edapp_usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  edapp_user_id TEXT NOT NULL,
  edapp_email TEXT,
  edapp_username TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  UNIQUE(funcionario_id, edapp_user_id)
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
  deleted_at TEXT,
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
);
CREATE TABLE backups_controle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK(tipo IN ('COMPLETO', 'MODULAR', 'INCREMENTAL', 'TIME_TRAVEL')),
  escopo TEXT NOT NULL, -- 'GERAL' ou nome do módulo
  status TEXT NOT NULL DEFAULT 'INICIADO' CHECK(status IN ('INICIADO', 'EM_PROGRESSO', 'CONCLUIDO', 'FALHOU', 'RESTAURANDO')),
  
  -- Métricas
  tamanho_bytes INTEGER,
  total_registros INTEGER,
  total_tabelas INTEGER,
  duracao_segundos INTEGER,
  
  -- Storage R2
  r2_bucket TEXT NOT NULL DEFAULT 'airtrust-backups',
  r2_path TEXT NOT NULL,
  r2_checksum_sha256 TEXT,
  
  -- Metadata
  d1_backup_id TEXT,
  modulos_incluidos TEXT, -- JSON array
  triggered_by TEXT NOT NULL, -- 'MANUAL', 'CRON_DIARIO', 'CRON_SEMANAL', 'PRE_DEPLOY'
  usuarios_id INTEGER,
  descricao TEXT,
  
  -- Compliance e Auditoria
  retention_policy TEXT NOT NULL DEFAULT '7_ANOS', -- '30_DIAS', '1_ANO', '7_ANOS'
  expires_at TEXT,
  compliance_tags TEXT, -- JSON
  
  -- Restore
  restaurado_em TEXT,
  restaurado_por INTEGER,
  restore_log TEXT, -- JSON
  
  -- Timestamps
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  
  FOREIGN KEY (usuarios_id) REFERENCES usuarios(id),
  FOREIGN KEY (restaurado_por) REFERENCES usuarios(id)
);
CREATE TABLE backups_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backups_controle_id INTEGER NOT NULL,
  timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  nivel TEXT NOT NULL CHECK(nivel IN ('INFO', 'WARN', 'ERROR', 'SUCCESS')),
  mensagem TEXT NOT NULL,
  detalhes TEXT, -- JSON
  tabela_afetada TEXT,
  registros_processados INTEGER,
  
  FOREIGN KEY (backups_controle_id) REFERENCES backups_controle(id)
);
CREATE TABLE integracoes_edapp_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chave TEXT NOT NULL UNIQUE,
  valor TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
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
CREATE TABLE manobras_categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  cor TEXT,
  icone TEXT,
  ordem INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME
);
CREATE TABLE tipos_check (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL UNIQUE, nome TEXT NOT NULL, descricao TEXT, qualificacao_tipo_id INTEGER NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT);
CREATE TABLE sessoes_checks_resultados (id INTEGER PRIMARY KEY AUTOINCREMENT, sessao_check_id INTEGER NOT NULL, aprovado INTEGER NOT NULL DEFAULT 0, observacoes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT, FOREIGN KEY (sessao_check_id) REFERENCES sessoes_checks(id));
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
CREATE TABLE IF NOT EXISTS "qualificacoes_historico" (
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
  empresa_id INTEGER DEFAULT 1,
  status TEXT,
  tipo_check_id INTEGER,
  sessao_id INTEGER
, tipo TEXT, data_confirmacao TEXT, confirmada_por INTEGER);
CREATE TABLE notificacoes_sistema (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Tipo de notificação
  tipo TEXT NOT NULL, -- 'EDAPP_QUALIFICACAO', 'QUALIFICACAO_VENCENDO', 'CERTIFICADO_EMITIDO', etc
  prioridade TEXT DEFAULT 'MEDIA', -- 'BAIXA', 'MEDIA', 'ALTA', 'URGENTE'
  
  -- Conteúdo
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  
  -- Dados estruturados (JSON)
  dados TEXT, -- {"funcionario_id": 1, "qualificacao_codigo": "E5", "data_conclusao": "2026-02-06"}
  
  -- Agrupamento
  grupo TEXT, -- "edapp_batch_2026-02-06_11:30" para agrupar múltiplas notificações
  
  -- Referências (opcionais)
  funcionario_id INTEGER,
  qualificacao_historico_id INTEGER,
  
  -- Ações
  link TEXT, -- "/qualificacoes?id=123" para abrir direto
  acao_primaria TEXT, -- "Ver Qualificação", "Emitir Certificado"
  
  -- Estado
  lida INTEGER DEFAULT 0, -- 0 = não lida, 1 = lida
  lida_em TEXT, -- timestamp quando foi marcada como lida
  lida_por INTEGER, -- user_id que marcou como lida
  user_id TEXT, -- NULL = global, non-null = visível só para um usuário
  
  -- Auditoria
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (qualificacao_historico_id) REFERENCES qualificacoes_historico(id)
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
CREATE TABLE frms_notificacao_config (
  id TEXT PRIMARY KEY,
  cargo TEXT NOT NULL UNIQUE,          -- 'PILOTO', 'GERENTE_OPS', 'SEGURANCA_VOO', 'ADMIN'
  nivel_minimo TEXT NOT NULL,          -- 'AVISO', 'ATENCAO', 'CRITICO', 'VIOLACAO'
  ativo INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, deleted_at TEXT);
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
CREATE TABLE IF NOT EXISTS "frms_jornada" (
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
                                'MANUAL','APUS','SIMULADOR','FIRA'
                              )),
  created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at                  TEXT,
  tipo_base                   TEXT DEFAULT 'HOME' CHECK(tipo_base IN ('HOME','AWAY')),
  tripulacao_aumentada        INTEGER DEFAULT 0,
  classe_cabine               TEXT DEFAULT NULL CHECK(classe_cabine IN ('ECONOMY','BUSINESS',NULL)),
  aclimatado                  INTEGER DEFAULT 1,
  local_base                  TEXT DEFAULT NULL
);
CREATE TABLE IF NOT EXISTS "frms_notificacao_destinatario" (
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
  DEFAULT 'personalizada');
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
CREATE TABLE escalas_tipos_evento_config (id TEXT PRIMARY KEY, empresa_id INTEGER NOT NULL REFERENCES empresas(id), codigo TEXT NOT NULL, label TEXT NOT NULL, sigla TEXT, cor TEXT NOT NULL, icone TEXT, ativo INTEGER NOT NULL DEFAULT 1, ordem INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), deleted_at TEXT, UNIQUE(empresa_id, codigo));
CREATE TABLE escalas_templates_tripulacao (id TEXT PRIMARY KEY, empresa_id INTEGER NOT NULL REFERENCES empresas(id), nome TEXT NOT NULL, quinzena INTEGER NOT NULL DEFAULT 0, aeronave TEXT, pic_id TEXT REFERENCES funcionarios(id), sic_id TEXT REFERENCES funcionarios(id), padrao_escala_id TEXT, base TEXT, observacoes TEXT, ativo INTEGER NOT NULL DEFAULT 1, usos INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), deleted_at TEXT, migrado_para_v2 INTEGER NOT NULL DEFAULT 0);
CREATE TABLE notificacoes_inapp (id TEXT PRIMARY KEY, funcionario_id TEXT NOT NULL REFERENCES funcionarios(id), empresa_id INTEGER NOT NULL REFERENCES empresas(id), tipo TEXT NOT NULL, titulo TEXT NOT NULL, mensagem TEXT, lida INTEGER NOT NULL DEFAULT 0, referencia_id TEXT, referencia_tipo TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), deleted_at TEXT);
CREATE TABLE escala_publicacao_snapshots (id TEXT PRIMARY KEY, escala_id TEXT NOT NULL, empresa_id TEXT, publicado_por TEXT, publicado_em TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT, deleted_at TEXT, FOREIGN KEY (escala_id) REFERENCES escalas_mensais(id));
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
CREATE TABLE IF NOT EXISTS "escala_alocacoes" (
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
  deleted_at        TEXT, auto_gerado INTEGER DEFAULT 0, cma_override INTEGER NOT NULL DEFAULT 0, cma_override_by TEXT NULL,
  CONSTRAINT chk_alocacao_datas CHECK (data_fim >= data_inicio)
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
DELETE FROM sqlite_sequence;
CREATE INDEX idx_funcoes_codigo ON funcoes(codigo) WHERE deleted_at IS NULL;
CREATE INDEX idx_funcoes_ativo ON funcoes(ativo) WHERE deleted_at IS NULL;
CREATE INDEX idx_setores_codigo ON setores(codigo) WHERE deleted_at IS NULL;
CREATE INDEX idx_setores_ativo ON setores(ativo) WHERE deleted_at IS NULL;
CREATE INDEX idx_aeronaves_codigo ON aeronaves(codigo) WHERE deleted_at IS NULL;
CREATE INDEX idx_aeronaves_status ON aeronaves(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_backups_created ON backups(created_at);
CREATE INDEX idx_simuladores_status ON simuladores(status);
CREATE INDEX idx_simuladores_deleted ON simuladores(deleted_at);
CREATE INDEX idx_treinamentos_codigo ON treinamentos(codigo);
CREATE INDEX idx_treinamentos_ativo ON treinamentos(ativo);
CREATE INDEX idx_treinamentos_deleted ON treinamentos(deleted_at);
CREATE INDEX idx_auditoria_usuario ON auditoria(usuario_id);
CREATE INDEX idx_auditoria_tabela ON auditoria(tabela_afetada);
CREATE INDEX idx_auditoria_created ON auditoria(created_at);
CREATE INDEX idx_certificado_anexos_cert ON certificado_anexos(certificado_id);
CREATE INDEX idx_user_permissions_usuario ON user_permissions(usuario_id);
CREATE INDEX idx_user_permissions_permissao ON user_permissions(permissao);
CREATE INDEX idx_user_profiles_usuario ON user_profiles(usuario_id);
CREATE INDEX idx_fichas_aluno ON fichas_sessao(colaborador_id_aluno);
CREATE INDEX idx_fichas_instrutor ON fichas_sessao(instrutor_id);
CREATE INDEX idx_fichas_agendamento ON fichas_sessao(agendamento_slot_id);
CREATE INDEX idx_catalogo_treinamentos_codigo ON catalogo_treinamentos(codigo);
CREATE INDEX idx_catalogo_treinamentos_categoria ON catalogo_treinamentos(categoria);
CREATE INDEX idx_catalogo_treinamentos_ativo ON catalogo_treinamentos(ativo);
CREATE INDEX idx_system_logs_level ON system_logs(level);
CREATE INDEX idx_system_logs_timestamp ON system_logs(timestamp);
CREATE INDEX idx_catalogo_treinamentos_tipo ON catalogo_treinamentos(tipo);
CREATE INDEX idx_categorias_qualificacoes_codigo ON "qualificacoes_categorias"(codigo);
CREATE INDEX idx_categorias_qualificacoes_deleted ON "qualificacoes_categorias"(deleted_at);
CREATE INDEX idx_treinamentos_categoria_id ON treinamentos(categoria_id);
CREATE INDEX idx_modelos_sessao_codigo ON modelos_sessao(codigo);
CREATE INDEX idx_modelos_sessao_ativo ON modelos_sessao(ativo);
CREATE INDEX idx_modelos_sessao_deleted ON modelos_sessao(deleted_at);
CREATE INDEX idx_modelos_sessao_treinamento ON modelos_sessao(treinamento_id);
CREATE INDEX idx_modelos_sessao_ordem ON modelos_sessao(treinamento_id, ordem_no_treinamento);
CREATE INDEX idx_fichas_sessao_pdf_url ON fichas_sessao(pdf_url);
CREATE INDEX idx_fichas_sessao_empresa_id ON fichas_sessao(empresa_id);
CREATE INDEX idx_fichas_assinatura_instrutor ON fichas_sessao(assinatura_instrutor);
CREATE INDEX idx_fichas_assinatura_tripulante ON fichas_sessao(assinatura_tripulante);
CREATE INDEX idx_audit_cascade_modelo ON audit_cascade(modelo);
CREATE INDEX idx_audit_cascade_arquivo ON audit_cascade(arquivo);
CREATE INDEX idx_audit_cascade_created ON audit_cascade(created_at);
CREATE INDEX idx_audit_cascade_score ON audit_cascade(score);
CREATE INDEX idx_empresa_cnpj ON empresas(cnpj);
CREATE INDEX idx_empresa_nome ON empresas(nome);
CREATE INDEX idx_empresa_deleted ON empresas(deleted_at);
CREATE INDEX idx_empresa_config_empresa_id ON empresa_config(empresa_id);
CREATE INDEX idx_empresa_config_deleted_at ON empresa_config(deleted_at);
CREATE INDEX idx_funcoes_deleted_at ON funcoes(deleted_at);
CREATE INDEX idx_certificados_funcionario_id 
ON certificados(funcionario_id);
CREATE INDEX idx_certificados_qualificacao_id 
ON certificados(qualificacao_id);
CREATE INDEX idx_certificados_habilitacao_id 
ON certificados(habilitacao_id);
CREATE INDEX idx_certificados_deleted_at 
ON certificados(deleted_at);
CREATE INDEX idx_certificados_qualificacao ON certificados(qualificacao_id, funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_avaliacoes_ficha_id ON "manobras_avaliacoes"(ficha_id);
CREATE INDEX idx_avaliacoes_manobra_id ON "manobras_avaliacoes"(manobra_id);
CREATE INDEX idx_avaliacoes_uuid ON "manobras_avaliacoes"(uuid);
CREATE INDEX idx_avaliacoes_deleted_at ON "manobras_avaliacoes"(deleted_at);
CREATE INDEX idx_avaliacoes_nota ON "manobras_avaliacoes"(nota DESC);
CREATE INDEX idx_participantes_uuid ON sessoes_participantes(uuid);
CREATE INDEX idx_participantes_sessao_id ON sessoes_participantes(sessao_id);
CREATE INDEX idx_participantes_funcionario_id ON sessoes_participantes(funcionario_id);
CREATE INDEX idx_participantes_deleted_at ON sessoes_participantes(deleted_at);
CREATE INDEX idx_agendamentos_uuid ON "simulador_agendamentos"(uuid);
CREATE INDEX idx_agendamentos_data ON "simulador_agendamentos"(data);
CREATE INDEX idx_agendamentos_simulador_id ON "simulador_agendamentos"(simulador_id);
CREATE INDEX idx_agendamentos_funcionario_id ON "simulador_agendamentos"(funcionario_id);
CREATE INDEX idx_agendamentos_instrutor_id ON "simulador_agendamentos"(instrutor_id);
CREATE INDEX idx_agendamentos_status ON "simulador_agendamentos"(status);
CREATE INDEX idx_agendamentos_deleted_at ON "simulador_agendamentos"(deleted_at);
CREATE INDEX idx_agendamentos_data_simulador ON "simulador_agendamentos"(data, simulador_id);
CREATE INDEX idx_agendamentos_status_deleted_v2 
ON "simulador_agendamentos"(status, deleted_at);
CREATE INDEX idx_simuladores_status_deleted_v2 
ON simuladores(status, deleted_at);
CREATE INDEX idx_papeis_nome ON papeis(nome);
CREATE INDEX idx_papeis_ativo ON papeis(ativo) WHERE ativo = 1;
CREATE INDEX idx_pessoas_papeis_pessoa ON pessoas_papeis(pessoa_id);
CREATE INDEX idx_pessoas_papeis_papel ON pessoas_papeis(papel_id);
CREATE INDEX idx_pessoas_papeis_ativo ON pessoas_papeis(pessoa_id, papel_id) 
  WHERE data_fim IS NULL AND deleted_at IS NULL;
CREATE INDEX idx_credenciais_pessoa ON credenciais(pessoa_id);
CREATE INDEX idx_credenciais_tipo ON credenciais(tipo);
CREATE INDEX idx_credenciais_numero ON credenciais(numero);
CREATE INDEX idx_credenciais_vencendo ON credenciais(data_validade) 
  WHERE data_validade IS NOT NULL AND status = 'ATIVO' AND deleted_at IS NULL;
CREATE INDEX idx_auditoria_pessoa ON pessoas_auditoria_acessos(pessoa_id);
CREATE INDEX idx_auditoria_data ON pessoas_auditoria_acessos(acessado_em);
CREATE INDEX idx_templates_empresa_ativo 
ON certificados_templates(empresa_id, ativo, deleted_at);
CREATE INDEX idx_templates_padrao 
ON certificados_templates(empresa_id, padrao, ativo);
CREATE INDEX idx_templates_tipo 
ON certificados_templates(tipo, ativo);
CREATE INDEX idx_job_queue_status_tipo
  ON job_queue(status, tipo) WHERE deleted_at IS NULL;
CREATE INDEX idx_job_queue_criado_em
  ON job_queue(criado_em) WHERE deleted_at IS NULL;
CREATE INDEX idx_job_execution_log_job_id
  ON job_execution_log(job_id);
CREATE INDEX idx_agend_func_id_v5 ON "simulador_agendamentos"(funcionario_id);
CREATE INDEX idx_agend_sim_id_v5 ON "simulador_agendamentos"(simulador_id);
CREATE INDEX idx_agend_deleted_v5 ON "simulador_agendamentos"(deleted_at);
CREATE INDEX idx_agend_data_v5 ON "simulador_agendamentos"(data);
CREATE INDEX idx_agend_status_v5 ON "simulador_agendamentos"(status);
CREATE INDEX idx_cert_func_id_v6 ON certificados(funcionario_id);
CREATE INDEX idx_cert_hab_id_v6 ON certificados(habilitacao_id);
CREATE INDEX idx_cert_qual_id_v6 ON certificados(qualificacao_id);
CREATE INDEX idx_cert_deleted_v6 ON certificados(deleted_at);
CREATE INDEX idx_categorias_codigo
ON "qualificacoes_categorias"(codigo)
WHERE deleted_at IS NULL;
CREATE INDEX idx_sessoes_instrutor ON sessoes(instrutor_id);
CREATE INDEX idx_fichas_sessao_instrutor ON fichas_sessao(instrutor_id);
CREATE INDEX idx_fichas_sessao_status ON fichas_sessao(status);
CREATE INDEX idx_simulador_agendamentos_data ON simulador_agendamentos(data);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX idx_legacy_funcionarios_matricula 
  ON legacy_funcionarios(matricula);
CREATE INDEX idx_legacy_funcionarios_cpf 
  ON legacy_funcionarios(cpf);
CREATE INDEX idx_legacy_qualificacoes_codigo 
  ON legacy_qualificacoes_tipos(codigo);
CREATE INDEX idx_legacy_qualificacoes_categoria 
  ON legacy_qualificacoes_tipos(categoria);
CREATE INDEX idx_legacy_historico_matricula 
  ON legacy_qualificacoes_historico(matricula);
CREATE INDEX idx_legacy_historico_codigo 
  ON legacy_qualificacoes_historico(codigo);
CREATE INDEX idx_legacy_historico_data 
  ON legacy_qualificacoes_historico(data_conclusao);
CREATE INDEX idx_import_log_batch 
  ON legacy_import_log(batch_id);
CREATE INDEX idx_import_log_status 
  ON legacy_import_log(status);
CREATE INDEX idx_backups_created_at 
ON backups(created_at DESC);
CREATE INDEX idx_backups_type 
ON backups(backup_type);
CREATE INDEX idx_fichas_sessao_manobras_ficha ON fichas_sessao_manobras(ficha_id);
CREATE INDEX idx_fichas_sessao_manobras_deleted ON fichas_sessao_manobras(deleted_at);
CREATE INDEX idx_fichas_sessao_manobras_ordem ON fichas_sessao_manobras(ficha_id, ordem);
CREATE INDEX idx_auditoria_v2_tabela ON auditoria_avancada_v2(tabela);
CREATE INDEX idx_auditoria_v2_registro ON auditoria_avancada_v2(registro_id);
CREATE INDEX idx_modelos_codigo ON modelos_sessao(codigo);
CREATE INDEX idx_modelos_deleted ON modelos_sessao(deleted_at);
CREATE INDEX idx_qh_stats_daily_day_scope ON qualificacoes_historico_stats_daily(day, scope_hash);
CREATE INDEX idx_qt_codigo ON "qualificacoes_tipos_old"(codigo);
CREATE INDEX idx_qt_categoria ON "qualificacoes_tipos_old"(categoria);
CREATE INDEX idx_qt_deleted_at ON "qualificacoes_tipos_old"(deleted_at);
CREATE INDEX idx_hospedagens_funcionario ON hospedagens(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_hospedagens_status ON hospedagens(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_frms_funcionario ON registros_frms(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_frms_data ON registros_frms(data_registro) WHERE deleted_at IS NULL;
CREATE INDEX idx_auditoria_tabela_registro ON auditoria_avancada_v2(tabela, registro_id);
CREATE INDEX idx_auditoria_created_at ON auditoria_avancada_v2(created_at);
CREATE INDEX idx_auditoria_acao ON auditoria_avancada_v2(acao);
CREATE INDEX idx_qualificacoes_funcionario ON "_backup_qh_tmp"(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_validade ON "_backup_qh_tmp"(validade) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_historico_qualificacao ON "_backup_qh_tmp"(qualificacao_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_qualificacoes_historico_unico ON "_backup_qh_tmp"(funcionario_id,qualificacao_id,numero_certificado) WHERE deleted_at IS NULL AND numero_certificado IS NOT NULL;
CREATE INDEX idx_qualificacoes_tipos_codigo ON "qualificacoes_tipos_old"(codigo) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_tipos_categoria ON "qualificacoes_tipos_old"(categoria) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_historico_funcionario ON "_backup_qh_tmp"(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_historico_validade ON "_backup_qh_tmp"(validade) WHERE deleted_at IS NULL;
CREATE INDEX idx_admin_actions_user_id ON admin_actions(user_id);
CREATE INDEX idx_admin_actions_action ON admin_actions(action);
CREATE INDEX idx_admin_actions_module ON admin_actions(module);
CREATE INDEX idx_admin_actions_created_at ON admin_actions(created_at DESC);
CREATE INDEX idx_qualificacoes_tipos_tipo ON "qualificacoes_tipos_old"(tipo) WHERE deleted_at IS NULL;
CREATE INDEX idx_importacoes_log_entidade ON importacoes_log(entidade);
CREATE INDEX idx_importacoes_log_created_at ON importacoes_log(created_at);
CREATE INDEX idx_importacoes_log_usuario ON importacoes_log(usuario_id);
CREATE INDEX idx_modelos_aeronave_codigo ON modelos_aeronave(codigo);
CREATE INDEX idx_modelos_aeronave_nome ON modelos_aeronave(nome);
CREATE INDEX idx_modelos_aeronave_ativo ON modelos_aeronave(ativo);
CREATE INDEX idx_notificacoes_config_ativo ON notificacoes_config(ativo);
CREATE INDEX idx_notificacoes_config_tipo ON notificacoes_config(tipo);
CREATE INDEX idx_notificacoes_log_status ON notificacoes_log(status);
CREATE INDEX idx_notificacoes_log_enviado_em ON notificacoes_log(enviado_em);
CREATE INDEX idx_notificacoes_log_funcionario_cpf ON notificacoes_log(funcionario_cpf);
CREATE INDEX idx_historico_compliance_funcionario ON historico_compliance(funcionario_id, deleted_at);
CREATE INDEX idx_historico_compliance_status ON historico_compliance(status_compliance, deleted_at);
CREATE INDEX idx_historico_compliance_recurso ON historico_compliance(tipo_recurso, recurso_id, deleted_at);
CREATE INDEX idx_historico_compliance_data_calculo ON historico_compliance(data_calculo);
CREATE INDEX idx_qualificacoes_tipos_nome 
      ON qualificacoes_tipos(nome) WHERE deleted_at IS NULL
    ;
CREATE INDEX idx_funcionarios_deleted ON funcionarios(deleted_at);
CREATE INDEX idx_pasta_virtual_funcionario ON pasta_virtual(funcionario_id);
CREATE INDEX idx_pasta_virtual_deleted ON pasta_virtual(deleted_at);
CREATE INDEX idx_simuladores_tipo ON simuladores(tipo) WHERE deleted_at IS NULL;
CREATE INDEX idx_fichas_sessao_agendamento ON fichas_sessao(agendamento_slot_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_fichas_sessao_aluno ON fichas_sessao(colaborador_id_aluno) WHERE deleted_at IS NULL;
CREATE INDEX idx_fichas_sessao_resultado ON fichas_sessao(resultado_final) WHERE deleted_at IS NULL;
CREATE INDEX idx_fichas_sessao_deleted ON fichas_sessao(deleted_at);
CREATE INDEX idx_manobras_codigo ON manobras(codigo);
CREATE INDEX idx_manobras_categoria ON manobras(categoria);
CREATE INDEX idx_manobras_deleted ON manobras(deleted_at);
CREATE INDEX idx_fichas_sessao_tipo ON fichas_sessao(tipo_sessao);
CREATE INDEX idx_fichas_sessao_data_sessao ON fichas_sessao(data_sessao);
CREATE INDEX idx_manobras_tipo_sessao ON manobras(tipo_sessao);
CREATE INDEX idx_manobras_tipo_aeronave ON manobras(tipo_aeronave);
CREATE INDEX idx_manobras_ordem ON manobras(ordem);
CREATE INDEX idx_modelos_sessao_tipo 
  ON modelos_sessao(tipo_sessao_id) 
  WHERE deleted_at IS NULL;
CREATE INDEX idx_modelos_sessao_manobras_modelo_id 
  ON modelos_sessao_manobras(modelo_id);
CREATE INDEX idx_modelos_sessao_manobras_manobra_id 
  ON modelos_sessao_manobras(manobra_id);
CREATE INDEX idx_modelos_sessao_manobras_ordem 
  ON modelos_sessao_manobras(modelo_id, ordem);
CREATE INDEX idx_fichas_sessao_manobras_codigo 
ON fichas_sessao_manobras(codigo) 
WHERE deleted_at IS NULL;
CREATE INDEX idx_tipos_sessao_codigo ON tipos_sessao(codigo) WHERE deleted_at IS NULL;
CREATE INDEX idx_tipos_sessao_deleted_at ON tipos_sessao(deleted_at);
CREATE INDEX idx_modelos_sessao_tipo_sessao_aeronave 
ON modelos_sessao(tipo_sessao_id, tipo_aeronave) 
WHERE deleted_at IS NULL;
CREATE INDEX idx_simuladores_codigo_aeronave 
ON simuladores(codigo_aeronave) 
WHERE deleted_at IS NULL;
CREATE INDEX idx_modelos_sessao_codigo_aeronave 
ON modelos_sessao(tipo_sessao_id, codigo_aeronave) 
WHERE deleted_at IS NULL;
CREATE INDEX idx_simuladores_aeronave_codigo ON simuladores(aeronave_codigo);
CREATE INDEX idx_modelos_sessao_aeronave_codigo ON modelos_sessao(codigo_aeronave);
CREATE INDEX idx_manobras_tipo_sessao_aeronave 
ON manobras(tipo_sessao, tipo_aeronave) 
WHERE deleted_at IS NULL;
CREATE INDEX idx_fichas_sessao_manobras_ficha_ordem 
ON fichas_sessao_manobras(ficha_id, ordem) 
WHERE deleted_at IS NULL;
CREATE INDEX idx_modelos_sessao_tipo_aeronave 
ON modelos_sessao(tipo_sessao_id, codigo_aeronave) 
WHERE deleted_at IS NULL;
CREATE INDEX idx_modelos_sessao_manobras_modelo_ordem 
ON modelos_sessao_manobras(modelo_id, ordem) 
WHERE deleted_at IS NULL;
CREATE INDEX idx_simulador_agendamentos_simulador_data 
ON simulador_agendamentos(simulador_id, data) 
WHERE deleted_at IS NULL;
CREATE INDEX idx_simulador_agendamentos_tipo 
ON simulador_agendamentos(tipo_sessao) 
WHERE deleted_at IS NULL;
CREATE INDEX idx_historico_notas_funcionario 
  ON historico_notas_manobras(funcionario_id, deleted_at);
CREATE INDEX idx_historico_notas_manobra 
  ON historico_notas_manobras(funcionario_id, codigo_manobra, deleted_at);
CREATE INDEX idx_historico_notas_data 
  ON historico_notas_manobras(data_sessao DESC, deleted_at);
CREATE INDEX idx_historico_notas_ficha 
  ON historico_notas_manobras(ficha_id, deleted_at);
CREATE INDEX idx_historico_ultima_nota 
  ON historico_notas_manobras(funcionario_id, codigo_manobra, data_sessao DESC, deleted_at);
CREATE INDEX idx_alertas_funcionario 
  ON alertas_reforco(funcionario_id, status, deleted_at);
CREATE INDEX idx_alertas_status 
  ON alertas_reforco(status, deleted_at);
CREATE INDEX idx_alertas_instrutor 
  ON alertas_reforco(instrutor_id_notificado, status, deleted_at);
CREATE INDEX idx_fichas_sessao_arquivado ON fichas_sessao(arquivado);
CREATE INDEX idx_edapp_usuarios_funcionario
  ON integracoes_edapp_usuarios(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_edapp_usuarios_edapp
  ON integracoes_edapp_usuarios(edapp_user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_edapp_cursos_qualificacao
  ON integracoes_edapp_cursos(qualificacao_codigo) WHERE deleted_at IS NULL;
CREATE INDEX idx_edapp_cursos_edapp_id
  ON integracoes_edapp_cursos(edapp_course_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_edapp_eventos_processado
  ON integracoes_edapp_eventos(processado) WHERE deleted_at IS NULL;
CREATE INDEX idx_edapp_eventos_tipo
  ON integracoes_edapp_eventos(tipo_evento) WHERE deleted_at IS NULL;
CREATE INDEX idx_edapp_eventos_created
  ON integracoes_edapp_eventos(created_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_backups_tipo_status ON backups_controle(tipo, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_backups_escopo_created ON backups_controle(escopo, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_backups_expires ON backups_controle(expires_at) WHERE deleted_at IS NULL AND expires_at IS NOT NULL;
CREATE INDEX idx_backups_uuid ON backups_controle(uuid) WHERE deleted_at IS NULL;
CREATE INDEX idx_backups_logs_controle ON backups_logs(backups_controle_id, timestamp DESC);
CREATE INDEX idx_edapp_config_chave ON integracoes_edapp_config(chave, deleted_at);
CREATE INDEX idx_funcionarios_empresa ON funcionarios(empresa_id);
CREATE INDEX idx_funcionarios_empresa_ativo ON funcionarios(empresa_id, ativo);
CREATE INDEX idx_fichas_sessao_empresa ON fichas_sessao(empresa_id);
CREATE INDEX idx_pasta_virtual_empresa ON pasta_virtual(empresa_id);
CREATE INDEX idx_arquivos_empresa ON arquivos(empresa_id);
CREATE INDEX idx_aeronaves_empresa ON aeronaves(empresa_id);
CREATE INDEX idx_modelos_sessao_empresa ON modelos_sessao(empresa_id);
CREATE INDEX idx_tipos_sessao_empresa ON tipos_sessao(empresa_id);
CREATE INDEX idx_importacoes_empresa ON importacoes_log(empresa_id);
CREATE UNIQUE INDEX idx_empresas_codigo ON empresas(codigo);
CREATE INDEX idx_documentos_empresa ON documentos(empresa_id);
CREATE INDEX idx_qualificacoes_tipos_empresa ON qualificacoes_tipos(empresa_id);
CREATE INDEX idx_setores_empresa ON setores(empresa_id);
CREATE INDEX idx_funcoes_empresa ON funcoes(empresa_id);
CREATE INDEX idx_modelos_aeronave_empresa ON modelos_aeronave(empresa_id);
CREATE INDEX idx_funcionarios_data_realizacao_icao ON funcionarios(data_realizacao_icao);
CREATE INDEX idx_funcionarios_data_realizacao_cma ON funcionarios(data_realizacao_cma);
CREATE INDEX idx_funcionarios_data_realizacao_aso ON funcionarios(data_realizacao_aso);
CREATE INDEX idx_modelos_aeronave_modelo ON modelos_aeronave(modelo);
CREATE INDEX idx_modelos_sessao_modelo_aeronave ON modelos_sessao(modelo_aeronave);
CREATE INDEX idx_funcionarios_modelo_aeronave_id ON funcionarios(modelo_aeronave_id);
CREATE INDEX idx_funcionarios_examinador ON funcionarios(is_examinador, deleted_at);
CREATE INDEX idx_sessoes_examinador ON simulador_agendamentos(examinador_id, is_check, deleted_at);
CREATE INDEX idx_tipos_check_deleted ON tipos_check(deleted_at);
CREATE INDEX idx_checks_resultados ON sessoes_checks_resultados(sessao_check_id, deleted_at);
CREATE INDEX idx_qualificacoes_tipos_check ON qualificacoes_tipos(is_check, deleted_at) WHERE is_check = 1;
CREATE INDEX idx_sessoes_checks_sessao ON sessoes_checks(sessao_id, deleted_at);
CREATE INDEX idx_sessoes_checks_tipo ON sessoes_checks(qualificacao_tipo_id, deleted_at);
CREATE INDEX idx_agendamentos_deleted 
  ON simulador_agendamentos(deleted_at);
CREATE INDEX idx_agendamentos_data_deleted 
  ON simulador_agendamentos(data, deleted_at);
CREATE INDEX idx_participantes_sessao_deleted 
  ON sessoes_participantes(sessao_id, deleted_at);
CREATE INDEX idx_qualificacoes_historico_status 
  ON qualificacoes_historico(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_hist_data_vencimento 
  ON qualificacoes_historico(data_vencimento) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_hist_data_conclusao 
  ON qualificacoes_historico(data_conclusao) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_historico_sessao 
  ON qualificacoes_historico(sessao_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_historico_tipo 
ON qualificacoes_historico(tipo);
CREATE UNIQUE INDEX idx_qualificacoes_historico_unique_active
ON qualificacoes_historico(funcionario_id, qualificacao_codigo, data_conclusao)
WHERE deleted_at IS NULL;
CREATE INDEX idx_notificacoes_lida ON notificacoes_sistema(lida, created_at DESC);
CREATE INDEX idx_notificacoes_tipo ON notificacoes_sistema(tipo, created_at DESC);
CREATE INDEX idx_notificacoes_grupo ON notificacoes_sistema(grupo);
CREATE INDEX idx_notificacoes_deleted ON notificacoes_sistema(deleted_at);
CREATE INDEX idx_notificacoes_user_id ON notificacoes_sistema(user_id, lida, created_at DESC);
CREATE INDEX idx_frms_config_nome ON frms_configuracao_limites(nome);
CREATE INDEX idx_frms_config_deleted ON frms_configuracao_limites(deleted_at);
CREATE INDEX idx_frms_fator_jornada ON frms_fatorizacao_jornada(jornada_id);
CREATE INDEX idx_frms_fator_deleted ON frms_fatorizacao_jornada(deleted_at);
CREATE INDEX idx_frms_acumulo_mensal_trip ON frms_acumulo_mensal(tripulante_id);
CREATE INDEX idx_frms_acumulo_mensal_periodo ON frms_acumulo_mensal(ano, mes);
CREATE INDEX idx_frms_acumulo_mensal_deleted ON frms_acumulo_mensal(deleted_at);
CREATE UNIQUE INDEX idx_frms_acumulo_mensal_uq ON frms_acumulo_mensal(tripulante_id, ano, mes) WHERE deleted_at IS NULL;
CREATE INDEX idx_frms_rolling_trip ON frms_acumulo_rolling(tripulante_id);
CREATE INDEX idx_frms_rolling_data ON frms_acumulo_rolling(data_referencia);
CREATE INDEX idx_frms_rolling_trip_data ON frms_acumulo_rolling(tripulante_id, data_referencia);
CREATE INDEX idx_frms_rolling_deleted ON frms_acumulo_rolling(deleted_at);
CREATE UNIQUE INDEX idx_frms_rolling_uq ON frms_acumulo_rolling(tripulante_id, data_referencia) WHERE deleted_at IS NULL;
CREATE INDEX idx_frms_alerta_trip ON frms_alerta(tripulante_id);
CREATE INDEX idx_frms_alerta_jornada ON frms_alerta(jornada_id);
CREATE INDEX idx_frms_alerta_nivel ON frms_alerta(nivel);
CREATE INDEX idx_frms_alerta_tipo ON frms_alerta(tipo_limite);
CREATE INDEX idx_frms_alerta_deleted ON frms_alerta(deleted_at);
CREATE INDEX idx_frms_alerta_visualizado ON frms_alerta(visualizado) WHERE deleted_at IS NULL;
CREATE INDEX idx_frms_alerta_resolvido ON frms_alerta(resolvido) WHERE deleted_at IS NULL;
CREATE INDEX idx_frms_alerta_created ON frms_alerta(created_at);
CREATE INDEX idx_frms_escala_trip ON frms_escala_quinzenal(tripulante_id);
CREATE INDEX idx_frms_escala_periodo ON frms_escala_quinzenal(data_inicio_embarque, data_fim_folga);
CREATE INDEX idx_frms_escala_deleted ON frms_escala_quinzenal(deleted_at);
CREATE UNIQUE INDEX idx_frms_escala_uq ON frms_escala_quinzenal(tripulante_id, ano, ciclo) WHERE deleted_at IS NULL;
CREATE INDEX idx_fira_canac
  ON frms_importacao_fira(canac)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_fira_tripulante
  ON frms_importacao_fira(tripulante_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_fira_status
  ON frms_importacao_fira(status)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_fira_periodo
  ON frms_importacao_fira(canac, ano, mes)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_frms_jornada_tripulante
  ON frms_jornada(tripulante_id);
CREATE INDEX idx_frms_jornada_data
  ON frms_jornada(data);
CREATE INDEX idx_frms_jornada_trip_data
  ON frms_jornada(tripulante_id, data);
CREATE INDEX idx_frms_jornada_deleted
  ON frms_jornada(deleted_at);
CREATE INDEX idx_frms_jornada_status
  ON frms_jornada(status);
CREATE UNIQUE INDEX idx_frms_jornada_trip_data_uq
  ON frms_jornada(tripulante_id, data) WHERE deleted_at IS NULL;
CREATE INDEX idx_frms_notif_dest_funcionario
  ON frms_notificacao_destinatario(funcionario_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_frms_notif_dest_alerta
  ON frms_notificacao_destinatario(alerta_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_frms_notif_dest_lido
  ON frms_notificacao_destinatario(lido)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_frms_notif_dest_deleted
  ON frms_notificacao_destinatario(deleted_at);
CREATE INDEX idx_simulador_agendamentos_empresa ON simulador_agendamentos(empresa_id);
CREATE UNIQUE INDEX idx_escalas_mensais_mes_ano_empresa
  ON escalas_mensais(mes, ano, empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_escala_tripulacoes_escala ON escala_tripulacoes(escala_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_escala_tripulacoes_pic ON escala_tripulacoes(pic_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_escala_eventos_escala ON escala_eventos(escala_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_escala_eventos_funcionario ON escala_eventos(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_escala_eventos_datas ON escala_eventos(data_inicio, data_fim) WHERE deleted_at IS NULL;
CREATE INDEX idx_restricoes_tripulacao_a ON restricoes_tripulacao(funcionario_a_id) WHERE deleted_at IS NULL AND ativo = 1;
CREATE INDEX idx_restricoes_tripulacao_b ON restricoes_tripulacao(funcionario_b_id) WHERE deleted_at IS NULL AND ativo = 1;
CREATE INDEX idx_escala_auditoria_escala ON escala_auditoria(escala_id);
CREATE INDEX idx_escalas_quinzenas_empresa_ano
  ON escalas_quinzenas(empresa_id, ano);
CREATE INDEX idx_tipos_evento_config_empresa ON escalas_tipos_evento_config(empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_notif_inapp_funcionario ON notificacoes_inapp(funcionario_id, lida) WHERE deleted_at IS NULL;
CREATE INDEX idx_notif_inapp_empresa ON notificacoes_inapp(empresa_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_escala_publicacao_snapshots_escala ON escala_publicacao_snapshots(escala_id, publicado_em DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_domain_events_empresa_processado
  ON domain_events(empresa_id, processado, created_at);
CREATE INDEX idx_domain_events_modulo_tipo
  ON domain_events(modulo, tipo, created_at);
CREATE INDEX idx_escala_alertas_escala
  ON escala_alertas(escala_id, resolvido, deleted_at);
CREATE INDEX idx_escala_alertas_empresa
  ON escala_alertas(empresa_id, resolvido, created_at);
CREATE INDEX idx_domain_events_empresa_created
  ON domain_events(empresa_id, created_at);
CREATE INDEX idx_frms_carga_funcionario
  ON frms_carga_trabalho(funcionario_id, deleted_at);
CREATE INDEX idx_hospedagem_sugestoes_funcionario
  ON hospedagem_sugestoes(funcionario_id, status, deleted_at);
CREATE INDEX idx_qualificacoes_pendencias_funcionario
  ON qualificacoes_pendencias(funcionario_id, status, deleted_at);
CREATE INDEX idx_pasta_virtual_jobs_status
  ON pasta_virtual_jobs(empresa_id, status_geracao, deleted_at);
CREATE INDEX idx_usuario_preferencias_lookup
       ON usuario_preferencias(usuario_id, empresa_id, chave);
CREATE UNIQUE INDEX ux_escala_tripulacoes_escala_aeronave_ativa ON escala_tripulacoes(escala_id, UPPER(TRIM(REPLACE(REPLACE(REPLACE(COALESCE(aeronave, ''), '  ', ' '), '  ', ' '), '  ', ' ')))) WHERE deleted_at IS NULL;
CREATE INDEX idx_funcionarios_quinzena
  ON funcionarios(quinzena)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_cobertura_escala_data
  ON escala_cobertura_diaria(escala_id, data);
CREATE INDEX idx_cobertura_aeronave_data
  ON escala_cobertura_diaria(aeronave_id, data);
CREATE INDEX idx_cobertura_status
  ON escala_cobertura_diaria(escala_id, status_cobertura)
  WHERE status_cobertura != 'ok';
CREATE INDEX idx_template_alocacoes_template
  ON escala_template_alocacoes(template_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_eventos_funcionario_datas
  ON escala_eventos(funcionario_id, data_inicio, data_fim)
  WHERE deleted_at IS NULL AND status != 'cancelado';
CREATE INDEX idx_eventos_alocacao_id
  ON escala_eventos(alocacao_id)
  WHERE deleted_at IS NULL AND gerado_automaticamente = 1;
CREATE INDEX idx_alocacoes_escala
  ON escala_alocacoes(escala_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_alocacoes_funcionario
  ON escala_alocacoes(funcionario_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_alocacoes_aeronave
  ON escala_alocacoes(aeronave_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_alocacoes_datas
  ON escala_alocacoes(data_inicio, data_fim)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_alocacoes_escala_aeronave
  ON escala_alocacoes(escala_id, aeronave_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_alocacoes_funcionario_datas
  ON escala_alocacoes(funcionario_id, data_inicio, data_fim)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_alocacoes_situacao_tipo
  ON escala_alocacoes(situacao_tipo)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_func_ferias_funcionario
  ON funcionario_ferias(funcionario_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_func_ferias_periodo
  ON funcionario_ferias(data_inicio, data_fim)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_func_ferias_alocacao
  ON funcionario_ferias(escala_alocacao_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_alocacoes_aeronave_funcao
  ON escala_alocacoes(aeronave_id, funcao)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_escala_eventos_funcionario_data
  ON escala_eventos(funcionario_id, data_inicio)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_escalas_quinzenas_empresa_mes_ano
  ON escalas_quinzenas(empresa_id, mes, ano)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_alocacoes_escala_funcionario
  ON escala_alocacoes(escala_id, funcionario_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_escala_eventos_tipo
  ON escala_eventos(escala_id, tipo_evento)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_escalas_mensais_status
  ON escalas_mensais(empresa_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_escala_eventos_tripulacao_id
  ON escala_eventos(tripulacao_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_escala_alocacoes_aeronave_funcao_data
  ON escala_alocacoes(escala_id, aeronave_id, funcao, data_inicio)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_frms_alerta_trip_nivel ON frms_alerta(tripulante_id, nivel) WHERE deleted_at IS NULL;
CREATE INDEX idx_frms_fat_jornada_eff ON frms_fatorizacao_jornada(jornada_id, effectiveness_pct) WHERE deleted_at IS NULL AND effectiveness_pct IS NOT NULL;
CREATE INDEX idx_frms_fat_eff_nivel ON frms_fatorizacao_jornada(effectiveness_nivel) WHERE deleted_at IS NULL AND effectiveness_nivel IS NOT NULL;
CREATE TRIGGER update_papeis_updated_at
AFTER UPDATE ON papeis
FOR EACH ROW
BEGIN
  UPDATE papeis SET updated_at = datetime('now') WHERE id = OLD.id;
END;
CREATE TRIGGER update_credenciais_updated_at
AFTER UPDATE ON credenciais
FOR EACH ROW
BEGIN
  UPDATE credenciais SET updated_at = datetime('now') WHERE id = OLD.id;
END;
CREATE TRIGGER update_qt_timestamp 
AFTER UPDATE ON "qualificacoes_tipos_old"
FOR EACH ROW
BEGIN
  UPDATE "qualificacoes_tipos_old" SET updated_at = datetime('now') WHERE id = NEW.id;
END;
CREATE TRIGGER trg_qualificacoes_tipos_prevent_hard_delete BEFORE DELETE ON "qualificacoes_tipos_old" FOR EACH ROW BEGIN SELECT RAISE(ABORT,'DELETE físico proibido em qualificacoes_tipos. Use soft delete'); END;
CREATE TRIGGER trg_qualificacoes_tipos_update
AFTER UPDATE ON qualificacoes_tipos
FOR EACH ROW
WHEN OLD.deleted_at IS NULL  -- Apenas updates em registros ativos
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
CREATE TRIGGER trg_tipo_update_auditoria AFTER UPDATE ON qualificacoes_tipos WHEN NEW.validade != OLD.validade OR NEW.vencimento_fim_mes != OLD.vencimento_fim_mes BEGIN INSERT INTO auditoria_avancada_v2 (tabela, registro_id, acao, dados_anteriores, dados_novos) VALUES ('qualificacoes_tipos', NEW.id, 'UPDATE_TIPO_RECALCULO', json_object('validade', OLD.validade, 'vencimento_fim_mes', OLD.vencimento_fim_mes), json_object('validade', NEW.validade, 'vencimento_fim_mes', NEW.vencimento_fim_mes)); END;
CREATE TRIGGER trigger_modelos_sessao_manobras_updated_at
AFTER UPDATE ON modelos_sessao_manobras
FOR EACH ROW
BEGIN
  UPDATE modelos_sessao_manobras
  SET updated_at = datetime('now')
  WHERE id = NEW.id;
END;
CREATE TRIGGER trg_alertas_reforco_updated_at
AFTER UPDATE ON alertas_reforco
FOR EACH ROW
BEGIN
  UPDATE alertas_reforco 
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
CREATE TRIGGER trg_edapp_config_updated
AFTER UPDATE ON integracoes_edapp_config FOR EACH ROW
BEGIN
  UPDATE integracoes_edapp_config SET updated_at=datetime('now') WHERE id=NEW.id;
END;
CREATE TRIGGER trg_calc_vencimento_insert
AFTER INSERT ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.validade_meses IS NOT NULL AND NEW.validade_meses > 0 AND NEW.data_conclusao IS NOT NULL
BEGIN
  UPDATE qualificacoes_historico
    SET data_vencimento = date(NEW.data_conclusao, '+' || NEW.validade_meses || ' months')
    WHERE id = NEW.id;
END;
CREATE TRIGGER trg_calc_vencimento_update
AFTER UPDATE OF validade_meses, data_conclusao ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.validade_meses IS NOT NULL AND NEW.validade_meses > 0 AND NEW.data_conclusao IS NOT NULL
BEGIN
  UPDATE qualificacoes_historico
    SET data_vencimento = date(NEW.data_conclusao, '+' || NEW.validade_meses || ' months')
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
CREATE TRIGGER fix_usuarios_deleted_at_default AFTER INSERT ON usuarios WHEN NEW.deleted_at = 1 BEGIN UPDATE usuarios SET deleted_at = NULL WHERE id = NEW.id; END;
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
CREATE VIEW sessoes_simulador AS SELECT id, simulador_id, funcionario_id AS aluno_id, instrutor_id, checador_id, data AS data_sessao, hora_inicio, hora_fim, duracao_minutos, status, tipo_sessao, observacoes, created_at, updated_at, deleted_at FROM simulador_agendamentos;
CREATE VIEW fichas_simulador AS SELECT f.id, f.agendamento_slot_id AS sessao_id, f.colaborador_id_aluno AS funcionario_id, f.instrutor_id, a.data AS data_sessao, f.status, f.observacoes, f.created_at, f.updated_at, f.deleted_at FROM fichas_sessao f LEFT JOIN simulador_agendamentos a ON f.agendamento_slot_id = a.id;
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
CREATE VIEW vw_backups_monitoramento AS
SELECT 
  bc.id,
  bc.uuid,
  bc.tipo,
  bc.escopo,
  bc.status,
  bc.tamanho_bytes,
  bc.total_registros,
  bc.duracao_segundos,
  bc.triggered_by,
  bc.retention_policy,
  bc.expires_at,
  bc.created_at,
  bc.restaurado_em,
  u1.nome as criado_por_nome,
  u2.nome as restaurado_por_nome,
  CASE 
    WHEN bc.expires_at < datetime('now') THEN 'EXPIRADO'
    WHEN bc.expires_at < datetime('now', '+30 days') THEN 'EXPIRANDO_EM_BREVE'
    ELSE 'ATIVO'
  END as status_retencao,
  (SELECT COUNT(*) FROM backups_logs WHERE backups_controle_id = bc.id AND nivel = 'ERROR') as total_erros
FROM backups_controle bc
LEFT JOIN usuarios u1 ON bc.usuarios_id = u1.id
LEFT JOIN usuarios u2 ON bc.restaurado_por = u2.id
WHERE bc.deleted_at IS NULL
ORDER BY bc.created_at DESC;
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
    SELECT 1
    FROM qualificacoes_historico qh
    LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
    WHERE qh.funcionario_id = f.id
      AND qh.deleted_at IS NULL
      AND COALESCE(qh.status, 'CONCLUIDA') != 'CANCELADA'
      AND UPPER(COALESCE(qh.qualificacao_codigo, qt.codigo, '')) = 'CMA'
      AND COALESCE(
        qh.data_vencimento,
        date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade, 12) || ' months')
      ) >= date('now')
  ) THEN 1 ELSE 0 END AS cma_valido,

  CAST((
    JULIANDAY((
      SELECT MAX(COALESCE(
        qh2.data_vencimento,
        date(qh2.data_conclusao, '+' || COALESCE(qh2.validade_meses, qt2.validade, 12) || ' months')
      ))
      FROM qualificacoes_historico qh2
      LEFT JOIN qualificacoes_tipos qt2 ON qt2.id = qh2.qualificacao_id AND qt2.deleted_at IS NULL
      WHERE qh2.funcionario_id = f.id
        AND qh2.deleted_at IS NULL
        AND COALESCE(qh2.status, 'CONCLUIDA') != 'CANCELADA'
        AND UPPER(COALESCE(qh2.qualificacao_codigo, qt2.codigo, '')) = 'CMA'
    )) - JULIANDAY('now')
  ) AS INTEGER) AS cma_dias_restantes,

  (
    SELECT MAX(COALESCE(
      qh3.data_vencimento,
      date(qh3.data_conclusao, '+' || COALESCE(qh3.validade_meses, qt3.validade, 12) || ' months')
    ))
    FROM qualificacoes_historico qh3
    LEFT JOIN qualificacoes_tipos qt3 ON qt3.id = qh3.qualificacao_id AND qt3.deleted_at IS NULL
    WHERE qh3.funcionario_id = f.id
      AND qh3.deleted_at IS NULL
      AND COALESCE(qh3.status, 'CONCLUIDA') != 'CANCELADA'
      AND UPPER(COALESCE(qh3.qualificacao_codigo, qt3.codigo, '')) = 'CMA'
  ) AS cma_validade_fim,

  (
    WITH base AS (
      SELECT
        COALESCE(SUM(CASE WHEN date(data) >= date('now', '-7 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_7,
        COALESCE(SUM(CASE WHEN date(data) >= date('now', '-28 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_28,
        COUNT(DISTINCT CASE WHEN date(data) >= date('now', '-28 days') THEN date(data) END) AS dias_28
      FROM frms_jornada
      WHERE tripulante_id = f.id
        AND deleted_at IS NULL
    )
    SELECT MIN(100, ROUND((minutos_7 / 60.0) * 2.5 + (minutos_28 / 60.0) * 0.8 + dias_28 * 1.1))
    FROM base
  ) AS frms_score,

  CASE
    WHEN EXISTS (
      SELECT 1
      FROM frms_alerta fa
      WHERE fa.tripulante_id = f.id
        AND fa.deleted_at IS NULL
        AND COALESCE(fa.resolvido, 0) = 0
        AND fa.nivel IN ('CRITICO', 'VIOLACAO')
    ) THEN 'critico'
    WHEN (
      WITH base AS (
        SELECT
          COALESCE(SUM(CASE WHEN date(data) >= date('now', '-7 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_7,
          COALESCE(SUM(CASE WHEN date(data) >= date('now', '-28 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_28,
          COUNT(DISTINCT CASE WHEN date(data) >= date('now', '-28 days') THEN date(data) END) AS dias_28
        FROM frms_jornada
        WHERE tripulante_id = f.id
          AND deleted_at IS NULL
      )
      SELECT MIN(100, ROUND((minutos_7 / 60.0) * 2.5 + (minutos_28 / 60.0) * 0.8 + dias_28 * 1.1))
      FROM base
    ) >= 45 THEN 'atencao'
    ELSE 'ok'
  END AS frms_status,

  (
    SELECT MAX(created_at)
    FROM frms_jornada fj
    WHERE fj.tripulante_id = f.id
      AND fj.deleted_at IS NULL
  ) AS frms_avaliacao_data,

  (
    SELECT COUNT(*)
    FROM sessoes_participantes sp
    JOIN simulador_agendamentos sa ON sa.id = sp.sessao_id
    WHERE sp.funcionario_id = f.id
      AND sp.deleted_at IS NULL
      AND sa.deleted_at IS NULL
      AND UPPER(COALESCE(sa.status, 'AGENDADA')) NOT IN ('CONCLUIDA', 'CANCELADA')
      AND date(sa.data) >= date('now')
  ) AS simuladores_pendentes,

  (
    SELECT MIN(sa2.data)
    FROM sessoes_participantes sp2
    JOIN simulador_agendamentos sa2 ON sa2.id = sp2.sessao_id
    WHERE sp2.funcionario_id = f.id
      AND sp2.deleted_at IS NULL
      AND sa2.deleted_at IS NULL
      AND UPPER(COALESCE(sa2.status, 'AGENDADA')) NOT IN ('CONCLUIDA', 'CANCELADA')
      AND date(sa2.data) >= date('now')
  ) AS proximo_simulador_data,

  CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM qualificacoes_historico qh4
      LEFT JOIN qualificacoes_tipos qt4 ON qt4.id = qh4.qualificacao_id AND qt4.deleted_at IS NULL
      WHERE qh4.funcionario_id = f.id
        AND qh4.deleted_at IS NULL
        AND COALESCE(qh4.status, 'CONCLUIDA') != 'CANCELADA'
        AND UPPER(COALESCE(qh4.qualificacao_codigo, qt4.codigo, '')) = 'CMA'
        AND COALESCE(
          qh4.data_vencimento,
          date(qh4.data_conclusao, '+' || COALESCE(qh4.validade_meses, qt4.validade, 12) || ' months')
        ) >= date('now')
    ) THEN 'BLOQUEADO_CMA'
    WHEN EXISTS (
      SELECT 1
      FROM frms_alerta fa2
      WHERE fa2.tripulante_id = f.id
        AND fa2.deleted_at IS NULL
        AND COALESCE(fa2.resolvido, 0) = 0
        AND fa2.nivel IN ('CRITICO', 'VIOLACAO')
    ) THEN 'BLOQUEADO_FRMS'
    WHEN CAST((
      JULIANDAY((
        SELECT MAX(COALESCE(
          qh5.data_vencimento,
          date(qh5.data_conclusao, '+' || COALESCE(qh5.validade_meses, qt5.validade, 12) || ' months')
        ))
        FROM qualificacoes_historico qh5
        LEFT JOIN qualificacoes_tipos qt5 ON qt5.id = qh5.qualificacao_id AND qt5.deleted_at IS NULL
        WHERE qh5.funcionario_id = f.id
          AND qh5.deleted_at IS NULL
          AND COALESCE(qh5.status, 'CONCLUIDA') != 'CANCELADA'
          AND UPPER(COALESCE(qh5.qualificacao_codigo, qt5.codigo, '')) = 'CMA'
      )) - JULIANDAY('now')
    ) AS INTEGER) <= 30 THEN 'ATENCAO_CMA'
    WHEN EXISTS (
      SELECT 1
      FROM frms_alerta fa3
      WHERE fa3.tripulante_id = f.id
        AND fa3.deleted_at IS NULL
        AND COALESCE(fa3.resolvido, 0) = 0
        AND fa3.nivel = 'ATENCAO'
    ) THEN 'ATENCAO_FRMS'
    ELSE 'APTO'
  END AS status_operacional
FROM funcionarios f
WHERE f.deleted_at IS NULL
  AND COALESCE(f.ativo, 1) = 1;
