
 ⛅️ wrangler 4.45.3 (update available 4.46.0)
─────────────────────────────────────────────
Resource location: remote 

🌀 Executing on preview database airtrust-db (7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae):
🌀 To execute on your local development database, remove the --remote flag from your wrangler command.
🚣 Executed 1 command in 0.6393ms
[
  {
    "results": [
      {
        "name": "_cf_KV",
        "sql": "CREATE TABLE _cf_KV (\n        key TEXT PRIMARY KEY,\n        value BLOB\n      ) WITHOUT ROWID"
      },
      {
        "name": "aeronaves",
        "sql": "CREATE TABLE aeronaves (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  codigo TEXT UNIQUE NOT NULL,\n  modelo TEXT NOT NULL,\n  fabricante TEXT,\n  prefixo TEXT,\n  ano_fabricacao INTEGER,\n  status TEXT DEFAULT 'ATIVO',\n  observacoes TEXT,\n  created_at TEXT DEFAULT (datetime('now')),\n  updated_at TEXT DEFAULT (datetime('now')),\n  deleted_at TEXT\n)"
      },
      {
        "name": "agendamentos_simulador",
        "sql": "CREATE TABLE agendamentos_simulador (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  uuid TEXT UNIQUE NOT NULL,\n  simulador_id INTEGER NOT NULL,\n  funcionario_id INTEGER NOT NULL,\n  instrutor_id INTEGER NOT NULL,\n  checador_id INTEGER,\n  template_id INTEGER,\n  data DATE NOT NULL,\n  hora_inicio TIME NOT NULL,\n  hora_fim TIME NOT NULL,\n  duracao_minutos INTEGER,\n  status TEXT DEFAULT 'AGENDADO', -- AGENDADO, EM_ANDAMENTO, CONCLUIDO, CANCELADO\n  tipo_sessao TEXT, -- INICIAL, RECORRENTE, CHECK, PF, PM\n  observacoes TEXT,\n  \n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n  deleted_at TIMESTAMP\n)"
      },
      {
        "name": "alertas_enviados",
        "sql": "CREATE TABLE alertas_enviados (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    tipo TEXT NOT NULL,\n    funcionario_id INTEGER NOT NULL,\n    qualificacao_id INTEGER,\n    data_envio TEXT DEFAULT (datetime('now')),\n    destinatario TEXT,\n    status TEXT DEFAULT 'ENVIADO',\n    FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),\n    FOREIGN KEY (qualificacao_id) REFERENCES \"qualificacoes_registros\"(id)\n)"
      },
      {
        "name": "arquivos",
        "sql": "CREATE TABLE arquivos (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  funcionario_id INTEGER NOT NULL,\n  nome_original TEXT NOT NULL,\n  nome_arquivo TEXT NOT NULL,\n  categoria TEXT DEFAULT 'geral',\n  tamanho INTEGER,\n  tipo TEXT,\n  url_r2 TEXT NOT NULL,\n  created_at TEXT NOT NULL DEFAULT (datetime('now')),\n  updated_at TEXT,\n  deleted_at TEXT,\n  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)\n)"
      },
      {
        "name": "audit_cascade",
        "sql": "CREATE TABLE audit_cascade (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  modelo TEXT NOT NULL, \n  arquivo TEXT, \n  comando TEXT, \n  tempo_ms INTEGER, \n  sucesso INTEGER DEFAULT 1, \n  checksum TEXT, \n  erros INTEGER DEFAULT 0, \n  warnings INTEGER DEFAULT 0, \n  score REAL, \n  detalhes TEXT, \n  created_at TEXT DEFAULT (datetime('now'))\n)"
      },
      {
        "name": "auditoria",
        "sql": "CREATE TABLE auditoria (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  usuario_id TEXT,\n  usuario_nome TEXT,\n  acao TEXT NOT NULL,\n  tabela_afetada TEXT NOT NULL,\n  registro_id TEXT,\n  dados_antes TEXT,\n  dados_depois TEXT,\n  ip_address TEXT,\n  user_agent TEXT,\n  created_at TEXT DEFAULT (datetime('now'))\n)"
      },
      {
        "name": "auditoriaavancadav2",
        "sql": "CREATE TABLE auditoriaavancadav2 (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    acao TEXT NOT NULL,\n    user_id INTEGER,\n    detalhes TEXT, -- JSON\n    ip TEXT,\n    timestamp TEXT DEFAULT (datetime('now')),\n    FOREIGN KEY (user_id) REFERENCES usuarios(id)\n)"
      },
      {
        "name": "avaliacoes_manobras",
        "sql": "CREATE TABLE avaliacoes_manobras (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  uuid TEXT UNIQUE NOT NULL,\n  ficha_id INTEGER NOT NULL,\n  manobra_id INTEGER NOT NULL,\n  nota REAL DEFAULT 0,\n  observacoes TEXT,\n  feedback_instrutor TEXT,\n  executada INTEGER DEFAULT 0,\n  avaliador_id INTEGER,\n  \n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n  deleted_at TIMESTAMP\n)"
      },
      {
        "name": "catalogo_treinamentos",
        "sql": "CREATE TABLE catalogo_treinamentos (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    codigo TEXT UNIQUE NOT NULL,\n    nome TEXT NOT NULL,\n    descricao TEXT,\n    categoria TEXT, -- 'INICIAL', 'RECORRENTE', 'ESPECIAL'\n    carga_horaria INTEGER,\n    validade_meses INTEGER,\n    observacoes TEXT,\n    ativo BOOLEAN DEFAULT 1,\n    created_at TEXT DEFAULT (datetime('now')),\n    updated_at TEXT DEFAULT (datetime('now')),\n    deleted_at TEXT DEFAULT NULL\n, tipo TEXT DEFAULT 'TREINAMENTO')"
      },
      {
        "name": "categorias_qualificacoes",
        "sql": "CREATE TABLE categorias_qualificacoes (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  nome TEXT NOT NULL,\n  codigo TEXT NOT NULL UNIQUE,\n  descricao TEXT,\n  created_at DATETIME DEFAULT (datetime('now')),\n  updated_at DATETIME DEFAULT (datetime('now')),\n  deleted_at DATETIME\n, cor TEXT DEFAULT '#6B7280', ativo INTEGER DEFAULT 1)"
      },
      {
        "name": "categoriasmanobras",
        "sql": "CREATE TABLE categoriasmanobras (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  codigo TEXT NOT NULL UNIQUE,\n  nome TEXT NOT NULL,\n  tipo TEXT DEFAULT 'NORMAL',\n  ordem INTEGER DEFAULT 0,\n  cor TEXT DEFAULT '#3B82F6',\n  created_at DATETIME DEFAULT (datetime('now')),\n  updated_at DATETIME DEFAULT (datetime('now')),\n  deleted_at DATETIME\n)"
      },
      {
        "name": "certificado_anexos",
        "sql": "CREATE TABLE certificado_anexos (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  certificado_id INTEGER NOT NULL,\n  nome_arquivo TEXT NOT NULL,\n  tipo_arquivo TEXT,\n  tamanho INTEGER,\n  url TEXT NOT NULL,\n  uploaded_at TEXT DEFAULT (datetime('now')),\n  uploaded_by TEXT,\n  FOREIGN KEY (certificado_id) REFERENCES certificados(id)\n)"
      },
      {
        "name": "certificados",
        "sql": "CREATE TABLE certificados (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  habilitacao_id INTEGER NOT NULL,\n  funcionario_id INTEGER NOT NULL,\n  qualificacao_id INTEGER NOT NULL,\n  arquivo_url TEXT NOT NULL,\n  arquivo_nome TEXT NOT NULL,\n  arquivo_tamanho INTEGER,\n  arquivo_hash TEXT,\n  numero_certificado TEXT UNIQUE NOT NULL,\n  tipo TEXT DEFAULT 'upload',\n  data_emissao DATE,\n  data_vencimento DATE,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  deleted_at DATETIME\n)"
      },
      {
        "name": "certificados_auditoria",
        "sql": "CREATE TABLE certificados_auditoria (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  certificado_id INTEGER NOT NULL,\n  acao TEXT NOT NULL,\n  usuario_id INTEGER,\n  detalhes TEXT,\n  created_at TEXT DEFAULT (datetime('now')),\n  FOREIGN KEY (certificado_id) REFERENCES certificados(id) ON DELETE CASCADE\n)"
      },
      {
        "name": "certificados_qualificacoes",
        "sql": "CREATE TABLE \"certificados_qualificacoes\" (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  qualificacao_id INTEGER NOT NULL,\n  funcionario_id INTEGER NOT NULL,\n  arquivo_url TEXT NOT NULL,\n  nome_arquivo TEXT NOT NULL,\n  tipo_certificado VARCHAR(50) NOT NULL DEFAULT 'GERADO',\n  versao INTEGER NOT NULL DEFAULT 1,\n  eh_anterior BOOLEAN NOT NULL DEFAULT FALSE,\n  data_geracao TIMESTAMP,\n  data_upload TIMESTAMP,\n  criado_por_usuario_id INTEGER,\n  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  deleted_at TIMESTAMP,\n  FOREIGN KEY (qualificacao_id) REFERENCES qualificacoes(id), -- ← CORRIGIDO\n  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),\n  FOREIGN KEY (criado_por_usuario_id) REFERENCES usuarios(id),\n  UNIQUE(qualificacao_id, versao, deleted_at)\n)"
      },
      {
        "name": "certificados_storage",
        "sql": "CREATE TABLE certificados_storage (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  funcionario_id INTEGER NOT NULL,\n  qualificacao_id INTEGER,\n  tipo TEXT NOT NULL, -- 'certificado', 'exame', 'check', 'outro'\n  nome_arquivo TEXT NOT NULL,\n  arquivo_url TEXT NOT NULL, -- URL no R2\n  tamanho_bytes INTEGER,\n  mime_type TEXT,\n  data_upload DATETIME DEFAULT CURRENT_TIMESTAMP,\n  uploaded_by INTEGER, -- ID do usuário que fez upload\n  observacoes TEXT,\n  ativo INTEGER DEFAULT 1,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  deleted_at DATETIME,\n  \n  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)\n)"
      },
      {
        "name": "certificados_templates",
        "sql": "CREATE TABLE certificados_templates (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  empresa_id INTEGER NOT NULL,\n  \n  -- Identificação\n  nome VARCHAR(100) NOT NULL,\n  descricao TEXT,\n  tipo VARCHAR(50) DEFAULT 'PADRAO', -- PADRAO, TREINAMENTO, CURSO, CUSTOM\n  \n  -- Layout (JSON com estrutura do template)\n  template_json TEXT NOT NULL,\n  \n  -- Assets (URLs no R2)\n  logo_url TEXT,\n  background_url TEXT,\n  assinatura_url TEXT, -- Assinatura digital do responsável\n  \n  -- Configurações de estilo\n  fonte VARCHAR(50) DEFAULT 'Arial',\n  tamanho_fonte_titulo INTEGER DEFAULT 24,\n  tamanho_fonte_corpo INTEGER DEFAULT 14,\n  cor_primaria VARCHAR(7) DEFAULT '#000000', -- Título\n  cor_secundaria VARCHAR(7) DEFAULT '#666666', -- Corpo\n  cor_destaque VARCHAR(7) DEFAULT '#0066CC', -- Nome pessoa\n  \n  -- Layout\n  orientacao VARCHAR(20) DEFAULT 'landscape', -- landscape, portrait\n  tamanho_papel VARCHAR(10) DEFAULT 'A4', -- A4, Letter\n  margem_cm DECIMAL(4,2) DEFAULT 2.0,\n  \n  -- Status\n  ativo BOOLEAN DEFAULT 1,\n  padrao BOOLEAN DEFAULT 0, -- Template padrão da empresa\n  \n  -- Metadados\n  versao VARCHAR(10) DEFAULT '1.0',\n  tags TEXT, -- Separado por vírgula: \"treinamento,aviacao,basico\"\n  \n  -- Auditoria\n  created_by INTEGER,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  updated_by INTEGER,\n  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  deleted_at DATETIME,\n  \n  FOREIGN KEY (empresa_id) REFERENCES empresas(id),\n  FOREIGN KEY (created_by) REFERENCES pessoas(id),\n  FOREIGN KEY (updated_by) REFERENCES pessoas(id)\n)"
      },
      {
        "name": "checks",
        "sql": "CREATE TABLE checks (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    funcionario_id INTEGER NOT NULL,\n    tipo TEXT NOT NULL, -- 'ASO', 'PROFICIENCIA', 'CMA', etc\n    codigo TEXT,\n    descricao TEXT,\n    data_conclusao TEXT,\n    data_vencimento TEXT,\n    resultado TEXT, -- 'APTO', 'INAPTO', 'APTO_COM_RESTRICAO'\n    observacoes TEXT,\n    arquivo_url TEXT,\n    created_at TEXT DEFAULT (datetime('now')),\n    updated_at TEXT DEFAULT (datetime('now')),\n    deleted_at TEXT DEFAULT NULL,\n    FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)\n)"
      },
      {
        "name": "compliance_status",
        "sql": "CREATE TABLE compliance_status (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  funcionario_id INTEGER NOT NULL,\n  data_avaliacao TEXT NOT NULL,\n  status TEXT CHECK(status IN ('COMPLIANT', 'NON_COMPLIANT', 'PENDING')) NOT NULL,\n  detalhes TEXT,\n  avaliado_por TEXT,\n  created_at TEXT DEFAULT (datetime('now')),\n  updated_at TEXT DEFAULT (datetime('now')),\n  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)\n)"
      },
      {
        "name": "consentimentos_lgpd",
        "sql": "CREATE TABLE consentimentos_lgpd (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  funcionario_id INTEGER NOT NULL,\n  tipo TEXT NOT NULL CHECK(tipo IN ('coleta_dados', 'uso_imagem', 'compartilhamento', 'tratamento_dados')),\n  aceito INTEGER NOT NULL DEFAULT 0,\n  data_aceite TEXT,\n  ip_aceite TEXT,\n  user_agent TEXT,\n  revogado INTEGER DEFAULT 0,\n  data_revogacao TEXT,\n  created_at TEXT DEFAULT (datetime('now')),\n  updated_at TEXT DEFAULT (datetime('now')),\n  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)\n)"
      },
      {
        "name": "credenciais",
        "sql": "CREATE TABLE credenciais (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  \n  -- Relação\n  pessoa_id INTEGER NOT NULL,\n  \n  -- Tipo de credencial\n  tipo TEXT NOT NULL,  -- CPF, CNH, RG, LICENSE_AVIADOR, PASSPORT, OTHER\n  \n  -- Dados da credencial\n  numero TEXT NOT NULL UNIQUE,\n  data_emissao TEXT,\n  data_validade TEXT,  -- NULL = sem vencimento\n  orgao_expedidor TEXT,\n  \n  -- Status\n  status TEXT NOT NULL DEFAULT 'ATIVO',  -- ATIVO, EXPIRADO, REVOGADO\n  \n  -- Auditoria\n  created_at TEXT NOT NULL DEFAULT (datetime('now')),\n  updated_at TEXT NOT NULL DEFAULT (datetime('now')),\n  deleted_at TEXT,\n  \n  -- Constraints\n  FOREIGN KEY (pessoa_id) REFERENCES pessoas(id) ON DELETE CASCADE,\n  CONSTRAINT check_tipo_valid CHECK (tipo IN ('CPF', 'CNH', 'RG', 'LICENSE_AVIADOR', 'PASSPORT', 'OTHER')),\n  CONSTRAINT check_status_valid CHECK (status IN ('ATIVO', 'EXPIRADO', 'REVOGADO'))\n)"
      },
      {
        "name": "d1_migrations",
        "sql": "CREATE TABLE d1_migrations(\n\t\tid         INTEGER PRIMARY KEY AUTOINCREMENT,\n\t\tname       TEXT UNIQUE,\n\t\tapplied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL\n)"
      },
      {
        "name": "empresa_certificado_config",
        "sql": "CREATE TABLE empresa_certificado_config (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  empresa_id INTEGER NOT NULL,\n  template_html TEXT NOT NULL DEFAULT '',\n  logo_r2_url TEXT,\n  logo_filename TEXT,\n  cor_primaria TEXT NOT NULL DEFAULT '#0066cc',\n  cor_secundaria TEXT NOT NULL DEFAULT '#333333',\n  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,\n  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP\n)"
      },
      {
        "name": "empresa_config",
        "sql": "CREATE TABLE empresa_config (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  empresa_id INTEGER NOT NULL UNIQUE,\n  \n  \n  nome TEXT NOT NULL,\n  logo_url TEXT,\n  \n  \n  template_certificado TEXT,\n  cor_primaria TEXT DEFAULT '#0066cc',\n  cor_secundaria TEXT DEFAULT '#333333',\n  \n  \n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  deleted_at DATETIME,\n  \n  \n  FOREIGN KEY (empresa_id) REFERENCES empresas(id)\n)"
      },
      {
        "name": "empresas",
        "sql": "CREATE TABLE empresas (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  nome TEXT NOT NULL UNIQUE,\n  razao_social TEXT,\n  cnpj TEXT UNIQUE,\n  logo_url TEXT,\n  logo_hash TEXT,\n  assinatura_diretor_url TEXT,\n  assinatura_diretor_hash TEXT,\n  assinatura_diretor_nome TEXT DEFAULT 'Diretor Geral',\n  telefone TEXT,\n  email TEXT,\n  endereco TEXT,\n  ativo INTEGER DEFAULT 1,\n  created_at TEXT DEFAULT (datetime('now')),\n  updated_at TEXT DEFAULT (datetime('now')),\n  deleted_at TEXT\n)"
      },
      {
        "name": "exames",
        "sql": "CREATE TABLE exames (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    funcionario_id INTEGER NOT NULL,\n    tipo TEXT NOT NULL, -- 'MEDICO', 'PSICOLOGICO', 'TOXICOLOGICO'\n    codigo TEXT,\n    descricao TEXT,\n    data_conclusao TEXT,\n    data_vencimento TEXT,\n    resultado TEXT,\n    observacoes TEXT,\n    arquivo_url TEXT,\n    created_at TEXT DEFAULT (datetime('now')),\n    updated_at TEXT DEFAULT (datetime('now')),\n    deleted_at TEXT DEFAULT NULL,\n    FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)\n)"
      },
      {
        "name": "ficha_manobras_avaliacao",
        "sql": "CREATE TABLE ficha_manobras_avaliacao (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  ficha_id INTEGER NOT NULL,\n  manobra_id INTEGER NOT NULL,\n  nota REAL DEFAULT 0,\n  observacoes TEXT,\n  executada BOOLEAN DEFAULT 0,\n  data_execucao DATETIME,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY (ficha_id) REFERENCES fichas_sessao(id),\n  FOREIGN KEY (manobra_id) REFERENCES \"manobras_old\"(id),\n  UNIQUE(ficha_id, manobra_id)\n)"
      },
      {
        "name": "fichas",
        "sql": "CREATE TABLE fichas (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  uuid TEXT UNIQUE NOT NULL,\n  agendamento_id INTEGER,\n  colaborador_id INTEGER,\n  instrutor_id INTEGER,\n  simulador_id INTEGER,\n  template_id INTEGER,\n  status TEXT DEFAULT 'RASCUNHO', -- RASCUNHO, PENDENTE, EM_AVALIACAO, APROVADA, REPROVADA\n  conceito_final TEXT,\n  nota_minima REAL,\n  nota_media REAL,\n  carga_horaria_total REAL,\n  carga_horaria_pf REAL,\n  carga_horaria_pm REAL,\n  ciclo_executado INTEGER DEFAULT 1,\n  resultado_final TEXT,\n  observacoes_instrutor TEXT,\n  observacoes_aluno TEXT,\n  \n  -- ASSINATURAS\n  assinatura_instrutor TEXT,\n  assinatura_instrutor_data TIMESTAMP,\n  assinatura_tripulante TEXT,\n  assinatura_tripulante_data TIMESTAMP,\n  \n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n  deleted_at TIMESTAMP\n)"
      },
      {
        "name": "fichas_assinaturas",
        "sql": "CREATE TABLE fichas_assinaturas (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  ficha_uuid TEXT NOT NULL,\n  tipo TEXT NOT NULL CHECK(tipo IN ('INSTRUTOR', 'ALUNO')),\n  assinatura_svg TEXT NOT NULL,\n  assinante_id INTEGER NOT NULL,\n  assinante_nome TEXT NOT NULL,\n  data_assinatura TEXT NOT NULL DEFAULT (datetime('now')),\n  ip_address TEXT,\n  user_agent TEXT,\n  created_at TEXT NOT NULL DEFAULT (datetime('now')),\n  updated_at TEXT NOT NULL DEFAULT (datetime('now')),\n  deleted_at TEXT,\n  \n  FOREIGN KEY (ficha_uuid) REFERENCES fichas_sessao(uuid) ON DELETE CASCADE,\n  FOREIGN KEY (assinante_id) REFERENCES funcionarios(id) ON DELETE CASCADE,\n  \n  UNIQUE(ficha_uuid, tipo)\n)"
      },
      {
        "name": "fichas_manobras_historico",
        "sql": "CREATE TABLE fichas_manobras_historico (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  ficha_uuid TEXT NOT NULL,\n  participante_id INTEGER NOT NULL,\n  manobra_id INTEGER NOT NULL,\n  manobra_codigo TEXT NOT NULL,\n  manobra_nome TEXT NOT NULL,\n  nota_atual REAL NOT NULL CHECK(nota_atual >= 0 AND nota_atual <= 10),\n  observacoes TEXT,\n  avaliador_id INTEGER NOT NULL,\n  data_avaliacao TEXT NOT NULL DEFAULT (datetime('now')),\n  created_at TEXT NOT NULL DEFAULT (datetime('now')),\n  updated_at TEXT NOT NULL DEFAULT (datetime('now')),\n  deleted_at TEXT,\n  \n  FOREIGN KEY (ficha_uuid) REFERENCES fichas_sessao(uuid) ON DELETE CASCADE,\n  FOREIGN KEY (participante_id) REFERENCES funcionarios(id) ON DELETE CASCADE,\n  FOREIGN KEY (manobra_id) REFERENCES manobras(id) ON DELETE CASCADE,\n  FOREIGN KEY (avaliador_id) REFERENCES funcionarios(id) ON DELETE CASCADE\n)"
      },
      {
        "name": "fichas_sessao",
        "sql": "CREATE TABLE fichas_sessao (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  uuid TEXT UNIQUE NOT NULL,\n  agendamento_slot_id INTEGER,\n  colaborador_id_aluno INTEGER NOT NULL,\n  funcao_na_sessao TEXT DEFAULT 'PF', \n  template_id INTEGER,\n  \n  \n  instrutor_id INTEGER NOT NULL,\n  instrutor_codigo_anac TEXT,\n  \n  \n  carga_horaria_total DECIMAL(4,2) DEFAULT 2.0,\n  carga_horaria_pf DECIMAL(4,2),\n  carga_horaria_pm DECIMAL(4,2),\n  \n  \n  tempo_acumulado DECIMAL(5,2) DEFAULT 0,\n  \n  \n  status TEXT DEFAULT 'PENDENTE', \n  resultado_final TEXT DEFAULT 'PENDENTE',\n  nota_final REAL, \n  nota_minima REAL, \n  aprovado BOOLEAN DEFAULT 0,\n  \n  \n  aluno_nome_validado TEXT,\n  aluno_matricula_validado TEXT,\n  \n  \n  observacoes TEXT,\n  feedback_instrutor TEXT,\n  pontos_fortes TEXT,\n  pontos_melhoria TEXT,\n  \n  \n  assinado BOOLEAN DEFAULT 0,\n  data_assinatura DATETIME,\n  hash_assinatura TEXT,\n  \n  \n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  deleted_at DATETIME\n, observacoes_gerais TEXT, assinatura_instrutor_completa INTEGER DEFAULT 0, assinatura_aluno_completa INTEGER DEFAULT 0, data_conclusao TEXT, pdf_url TEXT, empresa_id INTEGER, assinatura_instrutor INTEGER DEFAULT 0, assinatura_instrutor_data DATETIME, assinatura_instrutor_usuario_id INTEGER, assinatura_tripulante INTEGER DEFAULT 0, assinatura_tripulante_data DATETIME, assinatura_tripulante_usuario_id INTEGER)"
      },
      {
        "name": "funcionario_documentos",
        "sql": "CREATE TABLE funcionario_documentos (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  funcionario_id INTEGER NOT NULL,\n  tipo_documento TEXT NOT NULL,\n  nome_arquivo TEXT NOT NULL,\n  caminho_r2 TEXT NOT NULL,\n  tamanho_bytes INTEGER NOT NULL,\n  mime_type TEXT NOT NULL,\n  descricao TEXT,\n  data_upload DATETIME DEFAULT CURRENT_TIMESTAMP,\n  uploaded_by TEXT,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  deleted_at DATETIME,\n  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)\n)"
      },
      {
        "name": "funcionarios",
        "sql": "CREATE TABLE \"funcionarios\" (id INTEGER PRIMARY KEY, matricula TEXT NOT NULL UNIQUE, nome TEXT NOT NULL, cpf TEXT, email TEXT, telefone TEXT, data_nascimento TEXT, data_admissao TEXT, cargo TEXT, setor TEXT, status TEXT DEFAULT 'ATIVO', guerra TEXT, codigo_anac TEXT, funcao TEXT, base TEXT, contrato TEXT, licenca_aeronautica TEXT, aeronave TEXT, codigo_sispat TEXT, codigo_prestserv TEXT, cma_numero TEXT, cma_data_vencimento TEXT, cma_status TEXT, aso_data_vencimento TEXT, icao_nivel TEXT, icao_vencimento TEXT, icao_status TEXT, is_instrutor INTEGER DEFAULT 0, is_checador INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT, deleted_at TEXT, codigo_canac TEXT, anv TEXT, nivel_icao TEXT, nivel_icao_data_vencimento TEXT, nivel_icao_status TEXT, aeronave_principal TEXT)"
      },
      {
        "name": "funcionarios_aeronaves",
        "sql": "CREATE TABLE funcionarios_aeronaves (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  funcionario_id INTEGER NOT NULL,\n  aeronave_id INTEGER NOT NULL,\n  data_inicio TEXT NOT NULL,\n  data_fim TEXT,\n  ativo INTEGER DEFAULT 1,\n  created_at TEXT DEFAULT (datetime('now')),\n  updated_at TEXT DEFAULT (datetime('now')),\n  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),\n  FOREIGN KEY (aeronave_id) REFERENCES aeronaves(id),\n  UNIQUE(funcionario_id, aeronave_id, data_inicio)\n)"
      },
      {
        "name": "funcionarios_temp",
        "sql": "CREATE TABLE funcionarios_temp(\n  id INT,\n  matricula TEXT,\n  nome TEXT,\n  cpf TEXT,\n  email TEXT,\n  telefone TEXT,\n  data_nascimento TEXT,\n  data_admissao TEXT,\n  cargo TEXT,\n  setor TEXT,\n  status TEXT,\n  created_at TEXT,\n  updated_at TEXT,\n  deleted_at TEXT,\n  guerra TEXT,\n  codigo_anac TEXT,\n  codigo_canac TEXT,\n  funcao TEXT,\n  base TEXT,\n  contrato TEXT,\n  licenca_aeronautica TEXT,\n  anv TEXT,\n  codigo_sispat TEXT,\n  codigo_prestserv TEXT,\n  cma_numero TEXT,\n  cma_data_vencimento TEXT,\n  cma_status TEXT,\n  aso_data_vencimento TEXT,\n  nivel_icao TEXT,\n  nivel_icao_data_vencimento TEXT,\n  nivel_icao_status TEXT,\n  aeronave_principal TEXT,\n  is_instrutor INT,\n  is_checador INT\n)"
      },
      {
        "name": "funcionarios_v2",
        "sql": "CREATE TABLE funcionarios_v2 (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  nome TEXT NOT NULL,\n  cpf TEXT UNIQUE NOT NULL,\n  email TEXT UNIQUE NOT NULL,\n  cargo TEXT NOT NULL,\n  data_admissao DATE,\n  ativo INTEGER DEFAULT 1,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  deleted_at DATETIME\n)"
      },
      {
        "name": "funcoes",
        "sql": "CREATE TABLE funcoes (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  codigo TEXT UNIQUE NOT NULL,\n  nome TEXT NOT NULL,\n  descricao TEXT,\n  categoria TEXT,\n  ativo INTEGER DEFAULT 1,\n  created_at TEXT DEFAULT (datetime('now')),\n  updated_at TEXT DEFAULT (datetime('now')),\n  deleted_at TEXT\n)"
      },
      {
        "name": "habilitacoes",
        "sql": "CREATE TABLE \"habilitacoes\" (\n  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),\n  funcionario_id TEXT NOT NULL,\n  qualificacao_id TEXT,\n  data_conclusao TEXT,\n  data_vencimento TEXT,\n  resultado TEXT,\n  nota_final REAL,\n  instrutor TEXT,\n  local TEXT,\n  observacoes TEXT,\n  arquivo_url TEXT,\n  status TEXT DEFAULT 'ATIVO',\n  habilitacao_anterior_id TEXT,\n  eh_renovada INTEGER DEFAULT 0,\n  renovada_em TEXT,\n  empresa_id TEXT,\n  created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),\n  updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),\n  deleted_at TEXT, timezone VARCHAR(50) DEFAULT 'UTC', certificado_url TEXT,\n  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE,\n  FOREIGN KEY (qualificacao_id) REFERENCES qualificacoes(id) ON DELETE RESTRICT\n)"
      },
      {
        "name": "habilitacoes_v2",
        "sql": "CREATE TABLE \"habilitacoes_v2\" (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  funcionario_id INTEGER NOT NULL,\n  qualificacao_id INTEGER NOT NULL,\n  data_conclusao DATE NOT NULL,\n  data_vencimento DATE NOT NULL,\n  status TEXT DEFAULT 'ATIVA' CHECK(status IN ('ATIVA', 'VENCIDA', 'CANCELADA')),\n  documento_url TEXT,\n  numero_certificado TEXT,\n  instrutor TEXT,\n  observacoes TEXT,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  deleted_at DATETIME,\n  is_renovada INTEGER DEFAULT 0,\n  ultima_renovacao_id INTEGER,\n  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE,\n  FOREIGN KEY (qualificacao_id) REFERENCES qualificacoes_v2(id) ON DELETE RESTRICT\n)"
      },
      {
        "name": "importacoes_log",
        "sql": "CREATE TABLE importacoes_log (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  tipo TEXT NOT NULL,\n  arquivo_nome TEXT,\n  total_registros INTEGER DEFAULT 0,\n  sucesso INTEGER DEFAULT 0,\n  erros INTEGER DEFAULT 0,\n  detalhes TEXT,\n  usuario_id INTEGER,\n  created_at TEXT DEFAULT (datetime('now'))\n)"
      },
      {
        "name": "job_execution_log",
        "sql": "CREATE TABLE job_execution_log (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  job_id INTEGER NOT NULL,\n  status TEXT NOT NULL,\n  mensagem TEXT,\n  detalhes TEXT, -- JSON com detalhes\n  executado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  \n  FOREIGN KEY (job_id) REFERENCES job_queue(id) ON DELETE CASCADE\n)"
      },
      {
        "name": "job_queue",
        "sql": "CREATE TABLE job_queue (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  tipo TEXT NOT NULL CHECK(tipo IN ('GERAR_CERTIFICADO', 'PROCESSAR_RENOVACAO', 'ENVIAR_NOTIFICACAO')),\n  payload TEXT NOT NULL, -- JSON com dados do job\n  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'PROCESSING', 'DONE', 'FAILED')),\n  tentativas INTEGER NOT NULL DEFAULT 0,\n  max_tentativas INTEGER NOT NULL DEFAULT 3,\n  erro TEXT, -- Mensagem de erro se falhar\n  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  processado_em TIMESTAMP,\n  concluido_em TIMESTAMP,\n  \n  -- Índices para performance\n  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  updated_at TIMESTAMP,\n  deleted_at TIMESTAMP\n)"
      },
      {
        "name": "logs_acesso_dados",
        "sql": "CREATE TABLE logs_acesso_dados (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  funcionario_id INTEGER NOT NULL,\n  usuario_id INTEGER,\n  acao TEXT NOT NULL CHECK(acao IN ('READ', 'UPDATE', 'DELETE', 'EXPORT')),\n  campos_acessados TEXT, \n  ip TEXT,\n  user_agent TEXT,\n  timestamp TEXT DEFAULT (datetime('now')),\n  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)\n)"
      },
      {
        "name": "manobras",
        "sql": "CREATE TABLE manobras (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  codigo TEXT NOT NULL UNIQUE,\n  nome TEXT NOT NULL,\n  categoria TEXT,\n  descricao TEXT,\n  tipo TEXT,\n  nivel_dificuldade TEXT,\n  tempo_estimado INTEGER, -- em minutos\n  pontuacao_maxima INTEGER,\n  observacoes TEXT,\n  created_at DATETIME DEFAULT (datetime('now')),\n  updated_at DATETIME DEFAULT (datetime('now')),\n  deleted_at DATETIME NULL\n, categoriaid INTEGER REFERENCES categoriasmanobras(id))"
      },
      {
        "name": "manobras_old",
        "sql": "CREATE TABLE \"manobras_old\" (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  codigo TEXT NOT NULL UNIQUE,\n  nome TEXT NOT NULL,\n  descricao TEXT,\n  categoria TEXT CHECK(categoria IN ('NORMAL', 'ANORMAL', 'EMERGENCIA')) DEFAULT 'NORMAL',\n  nivel_dificuldade TEXT CHECK(nivel_dificuldade IN ('BASICO', 'INTERMEDIARIO', 'AVANCADO')) DEFAULT 'BASICO',\n  duracao_estimada INTEGER DEFAULT 30,\n  pontuacao_minima REAL DEFAULT 70.0,\n  ordem INTEGER DEFAULT 1,\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n, ativo BOOLEAN DEFAULT 1, deleted_at DATETIME NULL)"
      },
      {
        "name": "migracao_mapeamento_ids",
        "sql": "CREATE TABLE migracao_mapeamento_ids (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  tabela TEXT NOT NULL,\n  id_v1 INTEGER NOT NULL,\n  id_v2 INTEGER NOT NULL,\n  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,\n  UNIQUE(tabela, id_v1)\n)"
      },
      {
        "name": "modelo_sessao_manobras",
        "sql": "CREATE TABLE modelo_sessao_manobras (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  modelo_id INTEGER NOT NULL,\n  manobra_id INTEGER NOT NULL,\n  ordem INTEGER NOT NULL,\n  obrigatoria BOOLEAN DEFAULT 1,\n  observacoes TEXT,\n  created_at DATETIME DEFAULT (datetime('now')),\n  updated_at DATETIME DEFAULT (datetime('now')),\n  deleted_at DATETIME NULL\n)"
      },
      {
        "name": "modelos_sessao",
        "sql": "CREATE TABLE \"modelos_sessao\" (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  codigo TEXT NOT NULL UNIQUE,\n  nome TEXT NOT NULL,\n  tipo TEXT,\n  descricao TEXT,\n  duracao_estimada INTEGER,\n  treinamento_id TEXT,\n  ordem_no_treinamento INTEGER,\n  ativo BOOLEAN DEFAULT 1,\n  created_at DATETIME DEFAULT (datetime('now')),\n  updated_at DATETIME DEFAULT (datetime('now')),\n  deleted_at DATETIME NULL\n)"
      },
      {
        "name": "notificacoes",
        "sql": "CREATE TABLE notificacoes (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    tipo TEXT NOT NULL, -- 'VENCIMENTO', 'ALERTA', 'INFO'\n    titulo TEXT NOT NULL,\n    mensagem TEXT NOT NULL,\n    funcionario_id INTEGER,\n    lida BOOLEAN DEFAULT 0,\n    data_envio TEXT DEFAULT (datetime('now')),\n    created_at TEXT DEFAULT (datetime('now')),\n    FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)\n)"
      },
      {
        "name": "papeis",
        "sql": "CREATE TABLE papeis (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  \n  -- Dados básicos\n  nome TEXT NOT NULL UNIQUE,  -- PILOTO, INSTRUTOR, SUPERVISOR, RH_ADMIN, MECANICO\n  descricao TEXT,\n  \n  -- Permissões (JSON string)\n  -- Exemplo: '[{\"recurso\":\"qualificacoes\",\"acao\":\"criar\"},{\"recurso\":\"pessoas\",\"acao\":\"editar\"}]'\n  permissoes TEXT NOT NULL DEFAULT '[]',\n  \n  -- Status\n  ativo INTEGER NOT NULL DEFAULT 1,\n  \n  -- Auditoria\n  created_at TEXT NOT NULL DEFAULT (datetime('now')),\n  updated_at TEXT NOT NULL DEFAULT (datetime('now')),\n  deleted_at TEXT\n)"
      },
      {
        "name": "pasta_virtual_sync",
        "sql": "CREATE TABLE pasta_virtual_sync (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  funcionario_id INTEGER NOT NULL,\n  arquivo_id INTEGER NOT NULL,\n  sync_status TEXT CHECK(sync_status IN ('PENDING', 'SYNCED', 'ERROR')) DEFAULT 'PENDING',\n  last_sync TEXT,\n  error_message TEXT,\n  created_at TEXT DEFAULT (datetime('now')),\n  updated_at TEXT DEFAULT (datetime('now')),\n  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)\n)"
      },
      {
        "name": "pessoas",
        "sql": "CREATE TABLE pessoas (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  \n  -- Identificação básica\n  nome TEXT NOT NULL,\n  cpf TEXT NOT NULL UNIQUE,\n  email TEXT NOT NULL UNIQUE,\n  matricula TEXT UNIQUE,\n  \n  -- Dados pessoais\n  data_nascimento TEXT,\n  genero TEXT,  -- MASCULINO, FEMININO, NAO_BINARIO, PREFIRO_NAO_INFORMAR\n  nacionalidade TEXT DEFAULT 'BRASILEIRO',\n  estado_civil TEXT,  -- SOLTEIRO, CASADO, DIVORCIADO, VIUVO, UNIAO_ESTAVEL\n  \n  -- Documentos\n  rg TEXT UNIQUE,\n  carteira_motorista TEXT UNIQUE,\n  numero_license_aviador TEXT UNIQUE,\n  \n  -- Contatos\n  telefone TEXT,\n  telefone_emergencia TEXT,\n  \n  -- Endereço\n  endereco TEXT,\n  numero TEXT,\n  complemento TEXT,\n  bairro TEXT,\n  cidade TEXT,\n  estado TEXT,\n  cep TEXT,\n  \n  -- Dados profissionais\n  cargo TEXT,\n  funcao TEXT,\n  setor TEXT,\n  departamento TEXT,\n  \n  -- Datas profissionais\n  data_admissao TEXT,\n  data_demissao TEXT,\n  \n  -- Status\n  status TEXT NOT NULL DEFAULT 'ATIVO',  -- ATIVO, INATIVO, DEMITIDO, AFASTADO\n  \n  -- Versionamento (auditoria de mudanças críticas)\n  versao INTEGER NOT NULL DEFAULT 1,\n  versao_alterada_em TEXT,\n  versao_alterada_por TEXT,  -- user_id que fez a alteração\n  \n  -- Auditoria\n  created_at TEXT NOT NULL DEFAULT (datetime('now')),\n  updated_at TEXT NOT NULL DEFAULT (datetime('now')),\n  deleted_at TEXT, password_hash TEXT,\n  \n  -- Validações\n  CONSTRAINT check_cpf_format CHECK (length(cpf) = 11 OR length(cpf) = 14),  -- XXX.XXX.XXX-XX ou XXXXXXXXXXX\n  CONSTRAINT check_email_format CHECK (email LIKE '%@%'),\n  CONSTRAINT check_status_valid CHECK (status IN ('ATIVO', 'INATIVO', 'DEMITIDO', 'AFASTADO'))\n)"
      },
      {
        "name": "pessoas_auditoria_acessos",
        "sql": "CREATE TABLE pessoas_auditoria_acessos (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  \n  -- Dados do acesso\n  pessoa_id INTEGER NOT NULL,\n  usuario_id TEXT NOT NULL,  -- Quem acessou\n  acao TEXT NOT NULL,  -- 'VISUALIZAR', 'BUSCAR_CPF', 'EDITAR', 'DELETAR'\n  recurso TEXT NOT NULL,  -- 'pessoas', 'credenciais', etc.\n  dados_sensíveis TEXT,  -- JSON com campos acessados (ex: {\"cpf\": true, \"email\": true})\n  \n  -- Contexto\n  ip_origem TEXT,\n  user_agent TEXT,\n  motivo TEXT,  -- Opcional: justificativa do acesso\n  \n  -- Timestamp\n  acessado_em TEXT NOT NULL DEFAULT (datetime('now')),\n  \n  -- Constraints\n  FOREIGN KEY (pessoa_id) REFERENCES pessoas(id) ON DELETE CASCADE\n)"
      },
      {
        "name": "pessoas_papeis",
        "sql": "CREATE TABLE pessoas_papeis (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  \n  -- Relações\n  pessoa_id INTEGER NOT NULL,\n  papel_id INTEGER NOT NULL,\n  \n  -- Vigência\n  data_inicio TEXT NOT NULL DEFAULT (datetime('now')),\n  data_fim TEXT,  -- NULL = ainda ativo\n  \n  -- Auditoria\n  created_at TEXT NOT NULL DEFAULT (datetime('now')),\n  deleted_at TEXT,\n  \n  -- Constraints\n  FOREIGN KEY (pessoa_id) REFERENCES pessoas(id) ON DELETE CASCADE,\n  FOREIGN KEY (papel_id) REFERENCES papeis(id) ON DELETE CASCADE,\n  UNIQUE (pessoa_id, papel_id)\n)"
      },
      {
        "name": "qualificacoes",
        "sql": "CREATE TABLE \"qualificacoes\" (\n  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),\n  nome TEXT NOT NULL,\n  descricao TEXT,\n  codigo TEXT NOT NULL,\n  categoria TEXT NOT NULL CHECK(categoria IN ('TREINAMENTO', 'EXAME', 'CHECK')),\n  carga_horaria REAL,\n  conteudo_programatico TEXT,\n  validade_meses INTEGER,\n  tipo_vencimento TEXT,\n  ativo INTEGER DEFAULT 1,\n  created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),\n  updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),\n  deleted_at TEXT\n, funcionario_id INTEGER, is_superseded INTEGER DEFAULT 0, periodicidade_meses INTEGER, nota_minima REAL, data_conclusao TEXT, data_vencimento TEXT, nota_final REAL, checador TEXT)"
      },
      {
        "name": "qualificacoes_registros",
        "sql": "CREATE TABLE \"qualificacoes_registros\" (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  funcionario_id INTEGER NOT NULL,\n  tipo TEXT NOT NULL CHECK(tipo IN ('TREINAMENTO', 'EXAME', 'CHECK')),\n  codigo TEXT NOT NULL,\n  nome TEXT NOT NULL,\n  data_conclusao TEXT,\n  data_vencimento TEXT,\n  resultado TEXT,\n  nota_final REAL,\n  instrutor TEXT,\n  local TEXT,\n  observacoes TEXT,\n  certificado_url TEXT,\n  status TEXT DEFAULT 'ATIVO',\n  renovada_by INTEGER,\n  created_at TEXT DEFAULT (datetime('now')),\n  updated_at TEXT DEFAULT (datetime('now')),\n  deleted_at TEXT,\n  is_renovada INTEGER DEFAULT 0,\n  descricao TEXT,\n  categoria TEXT,\n  periodicidade_meses INTEGER,\n  nota_minima REAL,\n  carga_horaria INTEGER,\n  ativo INTEGER DEFAULT 1,\n  checador TEXT,\n  arquivo_url TEXT, certificado_nome TEXT, certificado_numero VARCHAR(100), certificado_gerado_em DATETIME, certificado_gerado_por INTEGER,\n  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE,\n  FOREIGN KEY (renovada_by) REFERENCES \"qualificacoes_registros\"(id)\n)"
      },
      {
        "name": "qualificacoes_v2",
        "sql": "CREATE TABLE qualificacoes_v2 (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  codigo TEXT NOT NULL UNIQUE,                 -- Ex: \"CRM_1000\", \"MLTE_S\"\n  nome TEXT NOT NULL,                          -- Ex: \"CRM 1000 - Simulador B737\"\n  descricao TEXT,                              -- Descrição detalhada\n  tipo TEXT NOT NULL CHECK(tipo IN ('TREINAMENTO', 'EXAME', 'CHEQUE')),\n  validade_em_meses INTEGER NOT NULL,          -- Ex: 12, 6, 24\n  categoria TEXT,                              -- Ex: \"SIMULADOR\", \"AERONAVE\"\n  ordem_exibicao INTEGER DEFAULT 0,            -- Para ordenação\n  ativo BOOLEAN DEFAULT 1,                     -- Se está disponível\n  \n  -- Auditoria\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  deleted_at DATETIME\n)"
      },
      {
        "name": "schema_versions",
        "sql": "CREATE TABLE schema_versions (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  version TEXT NOT NULL,\n  module TEXT NOT NULL,\n  description TEXT,\n  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n)"
      },
      {
        "name": "sessoes_manobras",
        "sql": "CREATE TABLE sessoes_manobras (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  uuid TEXT UNIQUE NOT NULL,\n  sessao_id INTEGER NOT NULL,\n  manobra_id INTEGER NOT NULL,\n  ordem INTEGER,\n  status TEXT DEFAULT 'PENDENTE', -- PENDENTE, CONCLUIDA, AJUSTE_NECESSARIO\n  \n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n  deleted_at TIMESTAMP\n)"
      },
      {
        "name": "sessoes_participantes",
        "sql": "CREATE TABLE sessoes_participantes (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  uuid TEXT UNIQUE NOT NULL,\n  sessao_id INTEGER NOT NULL,\n  funcionario_id INTEGER NOT NULL,\n  funcao TEXT, -- PF (Pilot Flying), PM (Pilot Monitoring), PIC, SIC, etc\n  status TEXT DEFAULT 'CONFIRMADO', -- CONFIRMADO, FALTOU, DISPENSADO\n  ciclo_executado INTEGER DEFAULT 1,\n  \n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n  deleted_at TIMESTAMP\n)"
      },
      {
        "name": "sessoes_simulador",
        "sql": "CREATE TABLE sessoes_simulador (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  uuid TEXT UNIQUE NOT NULL,\n  agendamento_id INTEGER NOT NULL,\n  simulador_id INTEGER NOT NULL,\n  template_id INTEGER,\n  instrutor_id INTEGER NOT NULL,\n  checador_id INTEGER,\n  data_inicio TIMESTAMP NOT NULL,\n  data_fim TIMESTAMP,\n  duracao_minutos INTEGER,\n  sessao_numero INTEGER,\n  total_sessoes INTEGER,\n  nome_sessao TEXT,\n  descricao TEXT,\n  status TEXT DEFAULT 'AGENDADA', -- AGENDADA, EM_PROGRESSO, CONCLUIDA, CANCELADA\n  \n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n  deleted_at TIMESTAMP\n, aluno_id INTEGER)"
      },
      {
        "name": "sessoes_template",
        "sql": "CREATE TABLE sessoes_template (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  codigo TEXT NOT NULL UNIQUE,\n  nome TEXT NOT NULL,\n  descricao TEXT,\n  treinamento_id INTEGER,\n  sessao_numero INTEGER DEFAULT 1,\n  total_sessoes INTEGER DEFAULT 1,\n  tipo TEXT DEFAULT 'PRATICO', \n  duracao_minutos INTEGER DEFAULT 120,\n  ativo BOOLEAN DEFAULT 1,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  deleted_at DATETIME\n)"
      },
      {
        "name": "sessoes_treinamento",
        "sql": "CREATE TABLE sessoes_treinamento (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  treinamento_id INTEGER NOT NULL,\n  funcionario_id INTEGER NOT NULL,\n  data_inicio TEXT NOT NULL,\n  data_conclusao TEXT,\n  status TEXT CHECK(status IN ('AGENDADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO')) DEFAULT 'AGENDADO',\n  nota_final REAL,\n  aprovado INTEGER,\n  observacoes TEXT,\n  created_at TEXT DEFAULT (datetime('now')),\n  updated_at TEXT DEFAULT (datetime('now')),\n  FOREIGN KEY (treinamento_id) REFERENCES treinamentos(id),\n  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)\n)"
      },
      {
        "name": "setores",
        "sql": "CREATE TABLE setores (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  codigo TEXT UNIQUE NOT NULL,\n  nome TEXT NOT NULL,\n  descricao TEXT,\n  responsavel TEXT,\n  ativo INTEGER DEFAULT 1,\n  created_at TEXT DEFAULT (datetime('now')),\n  updated_at TEXT DEFAULT (datetime('now')),\n  deleted_at TEXT\n)"
      },
      {
        "name": "simuladores",
        "sql": "CREATE TABLE simuladores (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  nome TEXT NOT NULL,\n  modelo TEXT NOT NULL,\n  tipo TEXT NOT NULL,\n  fabricante TEXT,\n  localizacao TEXT,\n  capacidade INTEGER DEFAULT 1,\n  status TEXT CHECK(status IN ('ATIVO', 'MANUTENCAO', 'INATIVO')) DEFAULT 'ATIVO',\n  observacoes TEXT,\n  created_at TEXT DEFAULT (datetime('now')),\n  updated_at TEXT DEFAULT (datetime('now')),\n  deleted_at TEXT\n)"
      },
      {
        "name": "solicitacoes_lgpd",
        "sql": "CREATE TABLE solicitacoes_lgpd (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  funcionario_id INTEGER NOT NULL,\n  tipo TEXT NOT NULL CHECK(tipo IN (\n    'confirmacao_dados',\n    'acesso_dados',\n    'correcao_dados',\n    'anonimizacao',\n    'eliminacao',\n    'portabilidade',\n    'informacao_compartilhamento',\n    'revogacao_consentimento'\n  )),\n  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK(status IN ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'REJEITADA')),\n  descricao TEXT,\n  data_solicitacao TEXT DEFAULT (datetime('now')),\n  data_conclusao TEXT,\n  responsavel_id INTEGER,\n  observacoes TEXT,\n  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)\n)"
      },
      {
        "name": "system_config",
        "sql": "CREATE TABLE system_config (\n    key TEXT PRIMARY KEY,\n    value TEXT,\n    description TEXT,\n    updated_at TEXT DEFAULT (datetime('now'))\n)"
      },
      {
        "name": "system_logs",
        "sql": "CREATE TABLE system_logs (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    level TEXT NOT NULL, -- 'INFO', 'WARNING', 'ERROR', 'CRITICAL'\n    message TEXT NOT NULL,\n    details TEXT, -- JSON\n    timestamp TEXT DEFAULT (datetime('now'))\n)"
      },
      {
        "name": "template_manobras",
        "sql": "CREATE TABLE template_manobras (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  template_id INTEGER NOT NULL,\n  manobra_id INTEGER NOT NULL,\n  ordem INTEGER DEFAULT 1,\n  obrigatoria BOOLEAN DEFAULT 1,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, tempo_estimado_min INTEGER DEFAULT 10, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, deleted_at DATETIME NULL,\n  FOREIGN KEY (template_id) REFERENCES sessoes_template(id),\n  FOREIGN KEY (manobra_id) REFERENCES \"manobras_old\"(id),\n  UNIQUE(template_id, manobra_id)\n)"
      },
      {
        "name": "tipos_sessao",
        "sql": "CREATE TABLE tipos_sessao (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  codigo TEXT NOT NULL UNIQUE,\n  nome TEXT NOT NULL,\n  descricao TEXT,\n  ativo INTEGER DEFAULT 1,\n  ordem INTEGER DEFAULT 0,\n  created_at DATETIME DEFAULT (datetime('now')),\n  updated_at DATETIME DEFAULT (datetime('now')),\n  deleted_at DATETIME\n)"
      },
      {
        "name": "treinamentos",
        "sql": "CREATE TABLE treinamentos (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  codigo TEXT UNIQUE NOT NULL,\n  nome TEXT NOT NULL,\n  categoria TEXT NOT NULL,\n  descricao TEXT,\n  periodicidade INTEGER,\n  carga_horaria INTEGER,\n  instrutor TEXT,\n  ativo INTEGER DEFAULT 1,\n  created_at TEXT DEFAULT (datetime('now')),\n  updated_at TEXT DEFAULT (datetime('now')),\n  deleted_at TEXT\n, total_sessoes INTEGER DEFAULT 1, instrutor_responsavel TEXT, certificacao_relacionada TEXT, status TEXT DEFAULT 'ATIVO', categoria_id INTEGER REFERENCES categorias_qualificacoes(id), periodicidade_meses INTEGER)"
      },
      {
        "name": "user_permissions",
        "sql": "CREATE TABLE user_permissions (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  usuario_id TEXT NOT NULL,\n  permissao TEXT NOT NULL,\n  recurso TEXT,\n  created_at TEXT DEFAULT (datetime('now')),\n  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),\n  UNIQUE(usuario_id, permissao, recurso)\n)"
      },
      {
        "name": "user_profiles",
        "sql": "CREATE TABLE user_profiles (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  usuario_id TEXT UNIQUE NOT NULL,\n  avatar_url TEXT,\n  telefone TEXT,\n  departamento TEXT,\n  cargo TEXT,\n  preferencias TEXT,\n  created_at TEXT DEFAULT (datetime('now')),\n  updated_at TEXT DEFAULT (datetime('now')),\n  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)\n)"
      },
      {
        "name": "usuarios",
        "sql": "CREATE TABLE usuarios (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  email TEXT NOT NULL UNIQUE,\n  password_hash TEXT NOT NULL,\n  nome TEXT NOT NULL,\n  perfil TEXT DEFAULT 'USUARIO' CHECK(perfil IN ('ADMIN', 'COMPLIANCE', 'GESTOR', 'USUARIO')),\n  funcionario_id INTEGER,\n  deleted_at INTEGER DEFAULT 1,\n  created_at TEXT DEFAULT (datetime('now')),\n  updated_at TEXT DEFAULT (datetime('now')), active INTEGER DEFAULT 1, last_login TEXT, failed_login_attempts INTEGER DEFAULT 0, locked_until TEXT,\n  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)\n)"
      }
    ],
    "success": true,
    "meta": {
      "served_by": "v3-prod",
      "served_by_region": "ENAM",
      "served_by_primary": true,
      "timings": {
        "sql_duration_ms": 0.6393
      },
      "duration": 0.6393,
      "changes": 0,
      "last_row_id": 0,
      "changed_db": false,
      "size_after": 4313088,
      "rows_read": 520,
      "rows_written": 0,
      "total_attempts": 1
    }
  }
]
