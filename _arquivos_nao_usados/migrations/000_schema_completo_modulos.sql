-- ============================================================
-- AIRTRUST - SCHEMA COMPLETO
-- M�dulos: Funcion�rios + Qualifica��es + Licen�as + Compliance
-- ============================================================

-- ============================================================
-- 1. FUNCION�RIOS (pessoas) - TODOS OS CAMPOS
-- ============================================================

CREATE TABLE IF NOT EXISTS pessoas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Dados pessoais
  nome_completo TEXT NOT NULL,
  matricula TEXT UNIQUE NOT NULL,
  cpf TEXT UNIQUE NOT NULL,
  rg TEXT,
  data_nascimento TEXT NOT NULL,    -- ISO8601: 'YYYY-MM-DD'
  sexo TEXT,                        -- 'M', 'F', 'Outro'
  nacionalidade TEXT DEFAULT 'Brasileira',
  
  -- Contato
  email TEXT NOT NULL,
  telefone TEXT,
  telefone_emergencia TEXT,
  contato_emergencia_nome TEXT,
  
  -- Profissional
  funcao TEXT NOT NULL,             -- Piloto, Co-piloto, Comiss�rio, Tripulante, etc.
  base TEXT,                        -- GRU, CGH, BSB, SDU, etc.
  data_admissao TEXT,
  status TEXT DEFAULT 'Ativo',      -- 'Ativo', 'Inativo', 'Afastado', 'F�rias', 'Desligado'
  
  -- Endere�o
  cep TEXT,
  logradouro TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  uf TEXT,
  
  -- Outros
  observacoes TEXT,
  foto_url TEXT,                    -- Arquivo em R2 (opcional)
  
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_pessoas_matricula ON pessoas(matricula);
CREATE INDEX IF NOT EXISTS idx_pessoas_cpf ON pessoas(cpf);
CREATE INDEX IF NOT EXISTS idx_pessoas_status ON pessoas(status);
CREATE INDEX IF NOT EXISTS idx_pessoas_funcao ON pessoas(funcao);
CREATE INDEX IF NOT EXISTS idx_pessoas_deleted ON pessoas(deleted_at);

-- ============================================================
-- 2. TIPOS DE QUALIFICA��O (templates)
-- ============================================================

CREATE TABLE IF NOT EXISTS tipos_qualificacao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria TEXT NOT NULL,          -- 'Treinamento Te�rico', 'Treinamento Pr�tico', 'Check', etc.
  nome TEXT NOT NULL,
  codigo TEXT UNIQUE NOT NULL,      -- 'SIM-B738-D', 'CRM-A320', etc.
  validade_valor INTEGER NOT NULL,  -- 6, 12, 24
  validade_unidade TEXT NOT NULL,   -- 'meses', 'dias', 'anos'
  observacoes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  UNIQUE (nome, categoria)
);

CREATE INDEX IF NOT EXISTS idx_tipos_qualificacao_categoria ON tipos_qualificacao(categoria);
CREATE INDEX IF NOT EXISTS idx_tipos_qualificacao_codigo ON tipos_qualificacao(codigo);
CREATE INDEX IF NOT EXISTS idx_tipos_qualificacao_deleted ON tipos_qualificacao(deleted_at);

-- ============================================================
-- 3. QUALIFICA��ES (inst�ncias para cada funcion�rio)
-- ============================================================

CREATE TABLE IF NOT EXISTS qualificacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo_qualificacao_id INTEGER NOT NULL,
  data_realizacao TEXT NOT NULL,    -- ISO8601: 'YYYY-MM-DD'
  data_vencimento TEXT NOT NULL,    -- calculado automaticamente
  observacoes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES pessoas(id),
  FOREIGN KEY (tipo_qualificacao_id) REFERENCES tipos_qualificacao(id)
);

CREATE INDEX IF NOT EXISTS idx_qualificacoes_funcionario ON qualificacoes(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipo ON qualificacoes(tipo_qualificacao_id);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_vencimento ON qualificacoes(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_deleted ON qualificacoes(deleted_at);

-- ============================================================
-- 4. LICEN�AS (CMA, CANAC, CHT, PP, PC, PLA, IFR, etc.)
-- ============================================================

CREATE TABLE IF NOT EXISTS licencas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,               -- 'CMA', 'CANAC', 'CHT', 'PP', 'PC', 'PLA', 'IFR', 'INVA', etc.
  numero TEXT NOT NULL,
  data_emissao TEXT NOT NULL,       -- ISO8601: 'YYYY-MM-DD'
  data_vencimento TEXT NOT NULL,    -- ISO8601
  observacoes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES pessoas(id)
);

CREATE INDEX IF NOT EXISTS idx_licencas_funcionario ON licencas(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_licencas_tipo ON licencas(tipo);
CREATE INDEX IF NOT EXISTS idx_licencas_vencimento ON licencas(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_licencas_deleted ON licencas(deleted_at);

-- ============================================================
-- 5. REQUISITOS DE COMPLIANCE (matriz de obrigatoriedade)
-- ============================================================

CREATE TABLE IF NOT EXISTS requisitos_compliance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcao TEXT NOT NULL,             -- Piloto, Co-piloto, Comiss�rio, etc.
  tipo_recurso TEXT NOT NULL,       -- 'qualificacao' | 'licenca'
  referencia TEXT NOT NULL,         -- codigo (qualificacao) ou tipo (licenca)
  descricao TEXT,                   -- texto amig�vel para UI
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_requisitos_compliance_funcao ON requisitos_compliance(funcao);
CREATE INDEX IF NOT EXISTS idx_requisitos_compliance_tipo ON requisitos_compliance(tipo_recurso);
CREATE INDEX IF NOT EXISTS idx_requisitos_compliance_deleted ON requisitos_compliance(deleted_at);

-- ============================================================
-- 6. AUDITORIA AVAN�ADA V2 (se ainda n�o existir)
-- ============================================================

CREATE TABLE IF NOT EXISTS auditoria_avancada_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tabela TEXT NOT NULL,
  acao TEXT NOT NULL,              -- 'INSERT', 'UPDATE', 'DELETE'
  registro_id TEXT NOT NULL,
  usuario_id TEXT,
  dados_anteriores TEXT,           -- JSON
  dados_novos TEXT,                -- JSON
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auditoria_tabela ON auditoria_avancada_v2(tabela);
CREATE INDEX IF NOT EXISTS idx_auditoria_registro ON auditoria_avancada_v2(registro_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_created ON auditoria_avancada_v2(created_at);
