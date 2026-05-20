-- ============================================
-- SCHEMA MASTER OFICIAL DO AIRTRUST v2.0
-- Data: 2025-01-21
-- Status: PRODUÇÃO
-- ============================================

-- IMPORTANTE: Este é o schema OFICIAL e DEFINITIVO
-- Nenhuma tabela com sufixos de versão (v2, v3) deve existir
-- Todas as tabelas seguem o padrão: soft delete, auditoria, foreign keys

-- ============================================
-- 1. USUÁRIOS E AUTENTICAÇÃO
-- ============================================

CREATE TABLE IF NOT EXISTS user_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  funcionario_id INTEGER,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  perfil TEXT NOT NULL CHECK(perfil IN ('ADMIN', 'COMPLIANCE', 'GESTOR', 'FUNCIONARIO', 'INSTRUTOR')),
  equipe TEXT,
  ativo INTEGER DEFAULT 1,
  ultimo_acesso TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_funcionario ON user_profiles(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_perfil ON user_profiles(perfil);

CREATE TABLE IF NOT EXISTS user_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  modulo TEXT NOT NULL,
  acao TEXT NOT NULL,
  permitido INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES user_profiles(user_id)
);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_modulo ON user_permissions(modulo);

-- ============================================
-- 2. RECURSOS HUMANOS
-- ============================================

CREATE TABLE IF NOT EXISTS funcoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT UNIQUE NOT NULL,
  descricao TEXT,
  categoria TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_funcoes_nome ON funcoes(nome);
CREATE INDEX IF NOT EXISTS idx_funcoes_categoria ON funcoes(categoria);

CREATE TABLE IF NOT EXISTS funcionarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  matricula TEXT UNIQUE,
  cpf TEXT,
  email TEXT,
  telefone TEXT,
  data_nascimento TEXT,
  data_admissao TEXT,
  guerra TEXT,
  cargo TEXT,
  funcao TEXT,
  setor TEXT,
  base TEXT,
  contrato TEXT,
  codigo_anac TEXT,
  codigo_canac TEXT,
  codigo_sispat TEXT,
  codigo_prestserv TEXT,
  licenca_aeronautica TEXT,
  aeronave TEXT,
  aeronave_principal TEXT,
  anv TEXT,
  is_instrutor INTEGER DEFAULT 0,
  is_checador INTEGER DEFAULT 0,
  cma_numero TEXT,
  cma_data_vencimento TEXT,
  cma_status TEXT,
  aso_data_vencimento TEXT,
  nivel_icao TEXT,
  nivel_icao_data_vencimento TEXT,
  nivel_icao_status TEXT,
  status TEXT DEFAULT 'ATIVO',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_funcionarios_matricula ON funcionarios(matricula);
CREATE INDEX IF NOT EXISTS idx_funcionarios_cpf ON funcionarios(cpf);
CREATE INDEX IF NOT EXISTS idx_funcionarios_email ON funcionarios(email);
CREATE INDEX IF NOT EXISTS idx_funcionarios_status ON funcionarios(status);
CREATE INDEX IF NOT EXISTS idx_funcionarios_deleted ON funcionarios(deleted_at);

CREATE TABLE IF NOT EXISTS setores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT UNIQUE NOT NULL,
  descricao TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_setores_nome ON setores(nome);

CREATE TABLE IF NOT EXISTS aeronaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  fabricante TEXT,
  modelo TEXT,
  tipo TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_aeronaves_codigo ON aeronaves(codigo);
CREATE INDEX IF NOT EXISTS idx_aeronaves_tipo ON aeronaves(tipo);

CREATE TABLE IF NOT EXISTS funcionarios_aeronaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  aeronave_id INTEGER NOT NULL,
  data_habilitacao TEXT,
  data_validade TEXT,
  status TEXT DEFAULT 'ATIVO',
  ativo INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (aeronave_id) REFERENCES aeronaves(id)
);
CREATE INDEX IF NOT EXISTS idx_func_aeronaves_funcionario ON funcionarios_aeronaves(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_func_aeronaves_aeronave ON funcionarios_aeronaves(aeronave_id);

-- ============================================
-- 3. TREINAMENTOS E QUALIFICAÇÕES
-- ============================================

CREATE TABLE IF NOT EXISTS treinamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT,
  periodicidade_meses INTEGER,
  instrutor_obrigatorio INTEGER DEFAULT 0,
  nota_minima_aprovacao REAL DEFAULT 7.0,
  tipo_vencimento TEXT DEFAULT 'FINAL_MES' CHECK(tipo_vencimento IN ('DIA_EXATO', 'FINAL_MES', 'NAO_VENCE')),
  ativo INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_treinamentos_codigo ON treinamentos(codigo);
CREATE INDEX IF NOT EXISTS idx_treinamentos_categoria ON treinamentos(categoria);
CREATE INDEX IF NOT EXISTS idx_treinamentos_ativo ON treinamentos(ativo);

CREATE TABLE IF NOT EXISTS qualificacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('TREINAMENTO', 'CHECK', 'EXAME')),
  codigo TEXT NOT NULL,
  categoria TEXT,
  descricao TEXT,
  instituicao TEXT,
  instrutor TEXT,
  carga_horaria INTEGER,
  numero TEXT,
  data_emissao TEXT,
  data_conclusao TEXT,
  data_validade TEXT NOT NULL,
  observacoes TEXT,
  status TEXT DEFAULT 'ATIVO',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_funcionario ON qualificacoes(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipo ON qualificacoes(tipo);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_codigo ON qualificacoes(codigo);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_validade ON qualificacoes(data_validade);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_deleted ON qualificacoes(deleted_at);

CREATE TABLE IF NOT EXISTS certificado_anexos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certificacao_id INTEGER NOT NULL,
  nome_arquivo TEXT NOT NULL,
  url_arquivo TEXT NOT NULL,
  tipo_arquivo TEXT,
  tamanho_bytes INTEGER,
  hash_md5 TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (certificacao_id) REFERENCES qualificacoes(id)
);
CREATE INDEX IF NOT EXISTS idx_cert_anexos_certificacao ON certificado_anexos(certificacao_id);

CREATE TABLE IF NOT EXISTS sessoes_treinamento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certificacao_id INTEGER NOT NULL,
  numero_sessao INTEGER NOT NULL,
  data_sessao TEXT NOT NULL,
  duracao_minutos INTEGER,
  instrutor TEXT,
  local TEXT,
  observacoes TEXT,
  aprovado INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (certificacao_id) REFERENCES qualificacoes(id)
);
CREATE INDEX IF NOT EXISTS idx_sessoes_certificacao ON sessoes_treinamento(certificacao_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_data ON sessoes_treinamento(data_sessao);

-- ============================================
-- 4. COMPLIANCE E AUDITORIA
-- ============================================

CREATE TABLE IF NOT EXISTS compliance_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  treinamento_id INTEGER,
  item_type TEXT NOT NULL,
  item_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('OK', 'ALERTA', 'VENCIDO', 'PENDENTE')),
  data_ultima_certificacao TEXT,
  data_vencimento TEXT,
  dias_para_vencimento INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (treinamento_id) REFERENCES treinamentos(id)
);
CREATE INDEX IF NOT EXISTS idx_compliance_funcionario ON compliance_status(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_compliance_status ON compliance_status(status);
CREATE INDEX IF NOT EXISTS idx_compliance_dias ON compliance_status(dias_para_vencimento);

CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tabela_afetada TEXT NOT NULL,
  operacao TEXT NOT NULL,
  usuario_id TEXT,
  detalhes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_auditoria_tabela ON auditoria(tabela_afetada);
CREATE INDEX IF NOT EXISTS idx_auditoria_created ON auditoria(created_at);

CREATE TABLE IF NOT EXISTS importacoes_log (
  id TEXT PRIMARY KEY,
  batch_id TEXT UNIQUE,
  tipo_importacao TEXT NOT NULL,
  usuario_id TEXT,
  usuario_nome TEXT,
  arquivo_nome TEXT,
  total_linhas INTEGER DEFAULT 0,
  linhas_sucesso INTEGER DEFAULT 0,
  linhas_erro INTEGER DEFAULT 0,
  tempo_processamento_ms INTEGER,
  status TEXT NOT NULL,
  detalhes_erros TEXT,
  origem TEXT DEFAULT 'WEB',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_importacoes_tipo ON importacoes_log(tipo_importacao);
CREATE INDEX IF NOT EXISTS idx_importacoes_status ON importacoes_log(status);

-- ============================================
-- 5. PASTA VIRTUAL
-- ============================================

CREATE TABLE IF NOT EXISTS pasta_virtual_sync (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  certificacao_id INTEGER,
  arquivo_original_url TEXT,
  arquivo_pasta_virtual_url TEXT,
  nome_arquivo_auditavel TEXT NOT NULL,
  status_sincronizacao TEXT DEFAULT 'PENDENTE' CHECK(status_sincronizacao IN ('PENDENTE', 'SINCRONIZADO', 'ERRO')),
  hash_md5 TEXT,
  hash_sha256 TEXT,
  tentativas INTEGER DEFAULT 0,
  max_tentativas INTEGER DEFAULT 3,
  erro_ultimo TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (certificacao_id) REFERENCES qualificacoes(id)
);
CREATE INDEX IF NOT EXISTS idx_pasta_virtual_funcionario ON pasta_virtual_sync(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_pasta_virtual_certificacao ON pasta_virtual_sync(certificacao_id);
CREATE INDEX IF NOT EXISTS idx_pasta_virtual_status ON pasta_virtual_sync(status_sincronizacao);

-- ============================================
-- 6. EXAMES E CHECKS
-- ============================================

CREATE TABLE IF NOT EXISTS exames (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo_exame TEXT NOT NULL,
  data_exame TEXT NOT NULL,
  data_validade TEXT,
  resultado TEXT,
  medico TEXT,
  observacoes TEXT,
  status TEXT DEFAULT 'ATIVO',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);
CREATE INDEX IF NOT EXISTS idx_exames_funcionario ON exames(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_exames_deleted ON exames(deleted_at);

CREATE TABLE IF NOT EXISTS checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo_check TEXT NOT NULL,
  data_check TEXT NOT NULL,
  data_validade TEXT,
  aprovado INTEGER DEFAULT 0,
  instrutor TEXT,
  observacoes TEXT,
  status TEXT DEFAULT 'ATIVO',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);
CREATE INDEX IF NOT EXISTS idx_checks_funcionario ON checks(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_checks_deleted ON checks(deleted_at);

-- ============================================
-- 7. SIMULADORES (OPCIONAL)
-- ============================================

CREATE TABLE IF NOT EXISTS simuladores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  tipo_aeronave TEXT,
  fabricante_simulador TEXT,
  localizacao TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_simuladores_codigo ON simuladores(codigo);
CREATE INDEX IF NOT EXISTS idx_simuladores_tipo ON simuladores(tipo_aeronave);

CREATE TABLE IF NOT EXISTS agendamentos_simulador (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  simulador_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  treinamento_id INTEGER,
  instrutor_id INTEGER,
  data_inicio TEXT NOT NULL,
  data_fim TEXT NOT NULL,
  duracao_minutos INTEGER,
  status TEXT DEFAULT 'AGENDADO' CHECK(status IN ('AGENDADO', 'CONFIRMADO', 'CANCELADO', 'CONCLUIDO')),
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (simulador_id) REFERENCES simuladores(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (treinamento_id) REFERENCES treinamentos(id),
  FOREIGN KEY (instrutor_id) REFERENCES funcionarios(id)
);
CREATE INDEX IF NOT EXISTS idx_agend_simulador ON agendamentos_simulador(simulador_id);
CREATE INDEX IF NOT EXISTS idx_agend_funcionario ON agendamentos_simulador(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_agend_data ON agendamentos_simulador(data_inicio);
CREATE INDEX IF NOT EXISTS idx_agend_status ON agendamentos_simulador(status);

-- ============================================
-- FIM DO SCHEMA MASTER OFICIAL
-- ============================================
