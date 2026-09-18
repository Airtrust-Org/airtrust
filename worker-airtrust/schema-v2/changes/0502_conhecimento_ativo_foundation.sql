-- 0502_conhecimento_ativo_foundation.sql
-- Fundação do domínio Conhecimento Ativo.
-- Não cria cursos, matrículas, qualificações ou certificados.
-- Todo dado operacional é tenant-scoped e conteúdos técnicos exigem aprovação explícita.

CREATE TABLE IF NOT EXISTS conhecimento_ativo_topicos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  aeronave_modelo TEXT,
  parent_id INTEGER,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0,1)),
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY(parent_id) REFERENCES conhecimento_ativo_topicos(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ca_topicos_codigo_active
  ON conhecimento_ativo_topicos(empresa_id, codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ca_topicos_modelo
  ON conhecimento_ativo_topicos(empresa_id, aeronave_modelo, ordem)
  WHERE ativo=1 AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS conhecimento_ativo_fontes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  tipo_documento TEXT NOT NULL
    CHECK(tipo_documento IN ('RFM','FCOM','QRH','SOP','OM','OUTRO')),
  titulo TEXT NOT NULL,
  aeronave_modelo TEXT,
  revisao TEXT NOT NULL,
  data_revisao TEXT,
  r2_key TEXT,
  hash_documento TEXT,
  status TEXT NOT NULL DEFAULT 'RASCUNHO'
    CHECK(status IN ('RASCUNHO','VIGENTE','SUPERADO')),
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ca_fontes_revision_active
  ON conhecimento_ativo_fontes(
    empresa_id, tipo_documento, titulo, revisao, COALESCE(aeronave_modelo,'')
  ) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ca_fontes_vigentes
  ON conhecimento_ativo_fontes(empresa_id, aeronave_modelo, tipo_documento)
  WHERE status='VIGENTE' AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS conhecimento_ativo_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  topico_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  aeronave_modelo TEXT,
  titulo TEXT NOT NULL,
  conceito TEXT NOT NULL,
  resumo_essencial TEXT,
  criticidade TEXT NOT NULL DEFAULT 'MEDIA'
    CHECK(criticidade IN ('BAIXA','MEDIA','ALTA','CRITICA')),
  tempo_estudo_segundos INTEGER NOT NULL DEFAULT 60
    CHECK(tempo_estudo_segundos BETWEEN 15 AND 900),
  status TEXT NOT NULL DEFAULT 'RASCUNHO'
    CHECK(status IN ('RASCUNHO','EM_REVISAO','APROVADO','REVISAO_NECESSARIA','ARQUIVADO')),
  aprovado_por_usuario_id INTEGER,
  aprovado_em TEXT,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0,1)),
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY(topico_id) REFERENCES conhecimento_ativo_topicos(id),
  FOREIGN KEY(aprovado_por_usuario_id) REFERENCES usuarios(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ca_itens_codigo_active
  ON conhecimento_ativo_itens(empresa_id, codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ca_itens_publicaveis
  ON conhecimento_ativo_itens(empresa_id, aeronave_modelo, criticidade)
  WHERE status='APROVADO' AND ativo=1 AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS conhecimento_ativo_item_fontes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  fonte_id INTEGER NOT NULL,
  secao TEXT,
  pagina TEXT,
  referencia TEXT,
  principal INTEGER NOT NULL DEFAULT 0 CHECK(principal IN (0,1)),
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY(item_id) REFERENCES conhecimento_ativo_itens(id),
  FOREIGN KEY(fonte_id) REFERENCES conhecimento_ativo_fontes(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ca_item_fontes_unique_active
  ON conhecimento_ativo_item_fontes(
    empresa_id, item_id, fonte_id, COALESCE(secao,''), COALESCE(pagina,''), COALESCE(referencia,'')
  ) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS conhecimento_ativo_questoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  variante_chave TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'MULTIPLA_ESCOLHA'
    CHECK(tipo IN ('MULTIPLA_ESCOLHA','VERDADEIRO_FALSO','CENARIO')),
  enunciado TEXT NOT NULL,
  explicacao TEXT NOT NULL,
  o_que_guardar TEXT,
  imagem_r2_key TEXT,
  dificuldade INTEGER NOT NULL DEFAULT 2 CHECK(dificuldade BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'RASCUNHO'
    CHECK(status IN ('RASCUNHO','EM_REVISAO','APROVADA','ARQUIVADA')),
  aprovado_por_usuario_id INTEGER,
  aprovado_em TEXT,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0,1)),
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY(item_id) REFERENCES conhecimento_ativo_itens(id),
  FOREIGN KEY(aprovado_por_usuario_id) REFERENCES usuarios(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ca_questoes_variante_active
  ON conhecimento_ativo_questoes(empresa_id, item_id, variante_chave)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ca_questoes_publicaveis
  ON conhecimento_ativo_questoes(empresa_id, item_id, dificuldade)
  WHERE status='APROVADA' AND ativo=1 AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS conhecimento_ativo_alternativas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  questao_id INTEGER NOT NULL,
  texto TEXT NOT NULL,
  correta INTEGER NOT NULL DEFAULT 0 CHECK(correta IN (0,1)),
  ordem INTEGER NOT NULL CHECK(ordem BETWEEN 1 AND 10),
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY(questao_id) REFERENCES conhecimento_ativo_questoes(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ca_alternativas_ordem_active
  ON conhecimento_ativo_alternativas(empresa_id, questao_id, ordem)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS conhecimento_ativo_desafios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  aeronave_modelo TEXT NOT NULL,
  periodo_chave TEXT NOT NULL,
  numero_desafio INTEGER NOT NULL DEFAULT 1 CHECK(numero_desafio BETWEEN 1 AND 2),
  status TEXT NOT NULL DEFAULT 'DISPONIVEL'
    CHECK(status IN ('DISPONIVEL','EM_ANDAMENTO','CONCLUIDO','EXPIRADO')),
  disponivel_em TEXT NOT NULL DEFAULT(datetime('now')),
  expira_em TEXT,
  iniciado_em TEXT,
  concluido_em TEXT,
  xp_concedido INTEGER NOT NULL DEFAULT 0 CHECK(xp_concedido >= 0),
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ca_desafios_periodo_active
  ON conhecimento_ativo_desafios(
    empresa_id, funcionario_id, aeronave_modelo, periodo_chave, numero_desafio
  ) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ca_desafios_me
  ON conhecimento_ativo_desafios(empresa_id, funcionario_id, status, disponivel_em)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS conhecimento_ativo_desafio_questoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  desafio_id INTEGER NOT NULL,
  questao_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  ordem INTEGER NOT NULL CHECK(ordem BETWEEN 1 AND 20),
  questao_snapshot_json TEXT NOT NULL,
  fonte_snapshot_json TEXT,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY(desafio_id) REFERENCES conhecimento_ativo_desafios(id),
  FOREIGN KEY(questao_id) REFERENCES conhecimento_ativo_questoes(id),
  FOREIGN KEY(item_id) REFERENCES conhecimento_ativo_itens(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ca_desafio_questoes_ordem
  ON conhecimento_ativo_desafio_questoes(empresa_id, desafio_id, ordem)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ca_desafio_questoes_question
  ON conhecimento_ativo_desafio_questoes(empresa_id, desafio_id, questao_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS conhecimento_ativo_respostas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  desafio_questao_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  alternativa_id INTEGER NOT NULL,
  correta INTEGER NOT NULL CHECK(correta IN (0,1)),
  confianca TEXT NOT NULL CHECK(confianca IN ('SABIA','DUVIDA','CHUTEI')),
  tempo_resposta_ms INTEGER,
  respondido_em TEXT NOT NULL DEFAULT(datetime('now')),
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  FOREIGN KEY(desafio_questao_id) REFERENCES conhecimento_ativo_desafio_questoes(id),
  FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY(alternativa_id) REFERENCES conhecimento_ativo_alternativas(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ca_respostas_once
  ON conhecimento_ativo_respostas(empresa_id, desafio_questao_id, funcionario_id);

CREATE TABLE IF NOT EXISTS conhecimento_ativo_dominio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  nivel INTEGER NOT NULL DEFAULT 0 CHECK(nivel BETWEEN 0 AND 100),
  exposicoes INTEGER NOT NULL DEFAULT 0 CHECK(exposicoes >= 0),
  acertos INTEGER NOT NULL DEFAULT 0 CHECK(acertos >= 0),
  erros INTEGER NOT NULL DEFAULT 0 CHECK(erros >= 0),
  ultimo_resultado TEXT CHECK(ultimo_resultado IN ('ACERTO','ERRO')),
  ultima_confianca TEXT CHECK(ultima_confianca IN ('SABIA','DUVIDA','CHUTEI')),
  ultima_exposicao_em TEXT,
  proxima_revisao_em TEXT,
  estado TEXT NOT NULL DEFAULT 'NOVO'
    CHECK(estado IN ('NOVO','APRENDENDO','EM_REFORCO','CONSOLIDADO')),
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY(item_id) REFERENCES conhecimento_ativo_itens(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ca_dominio_unique_active
  ON conhecimento_ativo_dominio(empresa_id, funcionario_id, item_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ca_dominio_due
  ON conhecimento_ativo_dominio(empresa_id, funcionario_id, proxima_revisao_em, nivel)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS conhecimento_ativo_xp_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  desafio_id INTEGER,
  tipo TEXT NOT NULL
    CHECK(tipo IN ('DESAFIO_CONCLUIDO','QUINZENA_CONCLUIDA','SEQUENCIA','ESTUDO_VOLUNTARIO','AJUSTE')),
  pontos INTEGER NOT NULL,
  referencia_chave TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY(desafio_id) REFERENCES conhecimento_ativo_desafios(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ca_xp_idempotencia
  ON conhecimento_ativo_xp_eventos(empresa_id, funcionario_id, referencia_chave, tipo);


CREATE TABLE IF NOT EXISTS conhecimento_ativo_importacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  arquivo_nome TEXT NOT NULL,
  arquivo_sha256 TEXT NOT NULL,
  template_versao TEXT NOT NULL DEFAULT '1.0',
  status TEXT NOT NULL DEFAULT 'VALIDADO'
    CHECK(status IN ('VALIDADO','APLICANDO','APLICADO','FALHOU')),
  total_linhas INTEGER NOT NULL DEFAULT 0 CHECK(total_linhas >= 0),
  total_erros INTEGER NOT NULL DEFAULT 0 CHECK(total_erros >= 0),
  total_inseridos INTEGER NOT NULL DEFAULT 0 CHECK(total_inseridos >= 0),
  total_ignorados INTEGER NOT NULL DEFAULT 0 CHECK(total_ignorados >= 0),
  resumo_json TEXT,
  erro TEXT,
  criado_por_usuario_id INTEGER,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  aplicado_em TEXT,
  FOREIGN KEY(criado_por_usuario_id) REFERENCES usuarios(id)
);
CREATE INDEX IF NOT EXISTS idx_ca_importacoes_tenant
  ON conhecimento_ativo_importacoes(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ca_importacoes_hash
  ON conhecimento_ativo_importacoes(empresa_id, arquivo_sha256);

CREATE TABLE IF NOT EXISTS conhecimento_ativo_importacao_registros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  importacao_id INTEGER NOT NULL,
  linha_numero INTEGER NOT NULL CHECK(linha_numero >= 2),
  entidade TEXT NOT NULL
    CHECK(entidade IN ('FONTE','TOPICO','ITEM','QUESTAO','ALTERNATIVA')),
  registro_id INTEGER,
  acao TEXT NOT NULL CHECK(acao IN ('INSERIDO','IGNORADO')),
  chave_natural TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  FOREIGN KEY(importacao_id) REFERENCES conhecimento_ativo_importacoes(id)
);
CREATE INDEX IF NOT EXISTS idx_ca_importacao_registros_batch
  ON conhecimento_ativo_importacao_registros(empresa_id, importacao_id, linha_numero);

CREATE TRIGGER IF NOT EXISTS trg_ca_importacao_registros_tenant_insert
BEFORE INSERT ON conhecimento_ativo_importacao_registros BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM conhecimento_ativo_importacoes i
     WHERE i.id=NEW.importacao_id AND i.empresa_id=NEW.empresa_id
  ) THEN RAISE(ABORT,'conhecimento ativo import tenant mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_ca_topicos_parent_tenant_insert
BEFORE INSERT ON conhecimento_ativo_topicos
WHEN NEW.parent_id IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM conhecimento_ativo_topicos p
     WHERE p.id=NEW.parent_id AND p.empresa_id=NEW.empresa_id AND p.deleted_at IS NULL
  ) THEN RAISE(ABORT,'conhecimento ativo topic parent tenant mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_ca_itens_topic_tenant_insert
BEFORE INSERT ON conhecimento_ativo_itens BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM conhecimento_ativo_topicos t
     WHERE t.id=NEW.topico_id AND t.empresa_id=NEW.empresa_id AND t.deleted_at IS NULL
  ) THEN RAISE(ABORT,'conhecimento ativo item topic tenant mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_ca_item_fontes_tenant_insert
BEFORE INSERT ON conhecimento_ativo_item_fontes BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM conhecimento_ativo_itens i
     WHERE i.id=NEW.item_id AND i.empresa_id=NEW.empresa_id AND i.deleted_at IS NULL
  ) OR NOT EXISTS(
    SELECT 1 FROM conhecimento_ativo_fontes f
     WHERE f.id=NEW.fonte_id AND f.empresa_id=NEW.empresa_id AND f.deleted_at IS NULL
  ) THEN RAISE(ABORT,'conhecimento ativo item source tenant mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_ca_questoes_item_tenant_insert
BEFORE INSERT ON conhecimento_ativo_questoes BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM conhecimento_ativo_itens i
     WHERE i.id=NEW.item_id AND i.empresa_id=NEW.empresa_id AND i.deleted_at IS NULL
  ) THEN RAISE(ABORT,'conhecimento ativo question item tenant mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_ca_alternativas_question_tenant_insert
BEFORE INSERT ON conhecimento_ativo_alternativas BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM conhecimento_ativo_questoes q
     WHERE q.id=NEW.questao_id AND q.empresa_id=NEW.empresa_id AND q.deleted_at IS NULL
  ) THEN RAISE(ABORT,'conhecimento ativo alternative question tenant mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_ca_desafios_funcionario_tenant_insert
BEFORE INSERT ON conhecimento_ativo_desafios BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM funcionarios f
     WHERE f.id=NEW.funcionario_id AND f.empresa_id=NEW.empresa_id AND f.deleted_at IS NULL
  ) THEN RAISE(ABORT,'conhecimento ativo challenge employee tenant mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_ca_desafio_questoes_tenant_insert
BEFORE INSERT ON conhecimento_ativo_desafio_questoes BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM conhecimento_ativo_desafios d
     WHERE d.id=NEW.desafio_id AND d.empresa_id=NEW.empresa_id AND d.deleted_at IS NULL
  ) OR NOT EXISTS(
    SELECT 1 FROM conhecimento_ativo_questoes q
     WHERE q.id=NEW.questao_id AND q.empresa_id=NEW.empresa_id AND q.deleted_at IS NULL
  ) OR NOT EXISTS(
    SELECT 1 FROM conhecimento_ativo_itens i
     WHERE i.id=NEW.item_id AND i.empresa_id=NEW.empresa_id AND i.deleted_at IS NULL
  ) THEN RAISE(ABORT,'conhecimento ativo challenge question tenant mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_ca_dominio_tenant_insert
BEFORE INSERT ON conhecimento_ativo_dominio BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM funcionarios f
     WHERE f.id=NEW.funcionario_id AND f.empresa_id=NEW.empresa_id AND f.deleted_at IS NULL
  ) OR NOT EXISTS(
    SELECT 1 FROM conhecimento_ativo_itens i
     WHERE i.id=NEW.item_id AND i.empresa_id=NEW.empresa_id AND i.deleted_at IS NULL
  ) THEN RAISE(ABORT,'conhecimento ativo mastery tenant mismatch') END;
END;
