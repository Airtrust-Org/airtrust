-- Schema-only snapshot (no data) of the production D1 tables and indexes
-- that drive the qualification correlated-subquery plans. Exported read-only
-- from sqlite_master of airtrust-db on 2026-11-14 (changed_db=false).
-- Used by qualification-correlated-subquery-plans.sqlite.test.ts so the plan
-- assertions run against the real index set, including the generic
-- idx_qualificacoes_historico_empresa_deleted that caused full scans.

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
, setor_id INTEGER REFERENCES setores(id), funcao_id INTEGER REFERENCES funcoes(id));

CREATE INDEX idx_funcionarios_data_realizacao_aso ON funcionarios(data_realizacao_aso);

CREATE INDEX idx_funcionarios_data_realizacao_cma ON funcionarios(data_realizacao_cma);

CREATE INDEX idx_funcionarios_data_realizacao_icao ON funcionarios(data_realizacao_icao);

CREATE INDEX idx_funcionarios_deleted ON funcionarios(deleted_at);

CREATE INDEX idx_funcionarios_empresa ON funcionarios(empresa_id);

CREATE INDEX idx_funcionarios_empresa_ativo ON funcionarios(empresa_id, ativo);

CREATE INDEX idx_funcionarios_examinador ON funcionarios(is_examinador, deleted_at);

CREATE INDEX idx_funcionarios_modelo_aeronave_id ON funcionarios(modelo_aeronave_id);

CREATE INDEX idx_funcionarios_quinzena ON funcionarios(quinzena) WHERE deleted_at IS NULL;

CREATE INDEX idx_funcionarios_empresa_setor
  ON funcionarios(empresa_id, setor_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX ux_funcionarios_cpf_empresa_active
  ON funcionarios(empresa_id, cpf)
  WHERE deleted_at IS NULL AND cpf IS NOT NULL AND trim(cpf) != '';

CREATE UNIQUE INDEX ux_funcionarios_matricula_empresa_active
  ON funcionarios(empresa_id, TRIM(matricula))
  WHERE deleted_at IS NULL AND matricula IS NOT NULL AND trim(matricula) != '';

CREATE UNIQUE INDEX ux_funcionarios_email_empresa_active
  ON funcionarios(empresa_id, LOWER(TRIM(email)))
  WHERE deleted_at IS NULL AND email IS NOT NULL AND trim(email) != '';

CREATE INDEX idx_funcionarios_empresa_funcao_id
  ON funcionarios(empresa_id, funcao_id)
  WHERE deleted_at IS NULL;

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
, formato_id INTEGER REFERENCES qualificacoes_formatos(id), categoria_id INTEGER REFERENCES qualificacoes_categorias(id), classe_requisito TEXT
  CHECK(classe_requisito IS NULL OR classe_requisito IN ('TREINAMENTO','AVALIACAO','DOCUMENTO','EXPERIENCIA')), dominio_codigo TEXT, area_id INTEGER REFERENCES qualificacoes_areas(id), referencias TEXT);

CREATE INDEX idx_qualificacoes_tipos_empresa
  ON qualificacoes_tipos(empresa_id);

CREATE INDEX idx_qualificacoes_tipos_deleted_at
  ON qualificacoes_tipos(deleted_at);

CREATE INDEX idx_qualificacoes_tipos_ativo
  ON qualificacoes_tipos(ativo) WHERE deleted_at IS NULL;

CREATE INDEX idx_qt_formato
  ON qualificacoes_tipos(formato_id, empresa_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_qt_categoria_id
  ON qualificacoes_tipos(categoria_id, empresa_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_qualificacoes_tipos_dominio_codigo
  ON qualificacoes_tipos(dominio_codigo);

CREATE UNIQUE INDEX idx_qualificacoes_tipos_codigo_empresa_active
  ON qualificacoes_tipos(empresa_id, codigo COLLATE NOCASE)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_qualificacoes_tipos_empresa_area
  ON qualificacoes_tipos(empresa_id, area_id)
  WHERE deleted_at IS NULL;

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
, formato_id INTEGER REFERENCES qualificacoes_formatos(id), formato_codigo TEXT, categoria_id INTEGER REFERENCES qualificacoes_categorias(id), categoria_codigo TEXT, validacao_hash TEXT
  CHECK (validacao_hash IS NULL OR (length(validacao_hash) = 16 AND validacao_hash = upper(validacao_hash))), programa_treinamento_id INTEGER, perfil_competencia TEXT);

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

CREATE INDEX idx_qh_formato
  ON qualificacoes_historico(formato_id, empresa_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_qh_categoria_id
  ON qualificacoes_historico(categoria_id, empresa_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_qualificacoes_historico_validacao_hash
  ON qualificacoes_historico (validacao_hash)
  WHERE validacao_hash IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_qualificacoes_historico_programa
  ON qualificacoes_historico(empresa_id, programa_treinamento_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_qh_empresa_func_tipo_perfil
ON qualificacoes_historico(empresa_id,funcionario_id,qualificacao_id,perfil_competencia)
WHERE deleted_at IS NULL;

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
  deleted_at TEXT, ultimo_slide INTEGER DEFAULT 0, ultima_pagina INTEGER DEFAULT 0, perfil_competencia TEXT,

  UNIQUE (curso_id, funcionario_id, empresa_id),

  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (curso_id) REFERENCES lms_cursos(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE INDEX idx_lms_matriculas_funcionario
  ON lms_matriculas (funcionario_id, empresa_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_lms_matriculas_curso_status
  ON lms_matriculas (curso_id, empresa_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_lms_matriculas_lookup
  ON lms_matriculas (curso_id, funcionario_id, empresa_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_lms_matriculas_inicio
  ON lms_matriculas (empresa_id, data_inicio, status)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_lms_matriculas_empresa_deleted
  ON lms_matriculas (empresa_id, deleted_at);

CREATE INDEX idx_lms_matriculas_empresa_func_perfil
ON lms_matriculas(empresa_id,funcionario_id,perfil_competencia)
WHERE deleted_at IS NULL;

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

CREATE INDEX idx_lms_progresso_matricula
  ON lms_progresso_scorm (matricula_id);

CREATE INDEX idx_lms_progresso_empresa_commit
  ON lms_progresso_scorm (empresa_id, last_commit_at);

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

CREATE INDEX idx_lms_xapi_matricula    ON lms_xapi_statements (matricula_id);

CREATE INDEX idx_lms_xapi_empresa_verb ON lms_xapi_statements (empresa_id, verb_id);

CREATE INDEX idx_lms_xapi_timestamp    ON lms_xapi_statements (empresa_id, timestamp);

CREATE TABLE lms_completion_diagnostics_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  matricula_id INTEGER NOT NULL,
  curso_id INTEGER NOT NULL,
  tentativa INTEGER NOT NULL DEFAULT 1,
  diagnostics_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_lms_completion_diag_unique
  ON lms_completion_diagnostics_snapshots (empresa_id, matricula_id, curso_id, tentativa);

CREATE INDEX idx_lms_completion_diag_matricula
  ON lms_completion_diagnostics_snapshots (empresa_id, matricula_id);

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
  deleted_at TEXT, assessment_policy TEXT
  CHECK(assessment_policy IS NULL OR assessment_policy IN ('SCORED','FORMATIVE')),
  CHECK (matricula_id IS NOT NULL OR historico_importado_id IS NOT NULL)
);

CREATE INDEX idx_lms_matricula_ciclos_matricula
  ON lms_matricula_ciclos(matricula_id, numero_ciclo)
  WHERE matricula_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_lms_matricula_ciclos_funcionario
  ON lms_matricula_ciclos(empresa_id, funcionario_id, curso_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_lms_matricula_ciclos_ativo_unico
  ON lms_matricula_ciclos(matricula_id)
  WHERE matricula_id IS NOT NULL AND ciclo_atual = 1 AND deleted_at IS NULL;

CREATE UNIQUE INDEX idx_lms_matricula_ciclos_legado_unico
  ON lms_matricula_ciclos(historico_importado_id)
  WHERE historico_importado_id IS NOT NULL AND deleted_at IS NULL;
