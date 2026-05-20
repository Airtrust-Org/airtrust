-- ============================================================
-- Migration: 0272_sgso_fatores_humanos_e_protocolo.sql
-- Módulo: SGSO — Sprint 2 (pode ser executada após 0271)
-- Descrição: Análise HFACS, arquivos anexos e gerador de protocolo
-- Autor: AirTrust Engineering
-- Data: 2026-03-15
-- ============================================================

-- ------------------------------------------------------------
-- Fatores humanos vinculados a relatos — Modelo HFACS
-- Human Factors Analysis and Classification System
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sgso_relatos_fatores_humanos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relato_id TEXT NOT NULL,                       -- FK sgso_relatos.id
  empresa_id INTEGER NOT NULL,                   -- Multi-tenant

  -- Nível HFACS (4 camadas)
  nivel_hfacs TEXT NOT NULL CHECK (nivel_hfacs IN (
    'ACOES_INSEGURAS',              -- Nível 1: O que o tripulante fez
    'PRECONDICOES',                 -- Nível 2: Condições que levaram ao ato
    'SUPERVISAO',                   -- Nível 3: Falhas de supervisão
    'INFLUENCIAS_ORGANIZACIONAIS'   -- Nível 4: Fatores sistêmicos / gestão
  )),

  -- Categoria dentro do nível
  categoria TEXT NOT NULL,
  -- Nível 1: ERRO_HABILIDADE | ERRO_DECISAO | ERRO_PERCEPTIVO | VIOLACAO_ROTINEIRA | VIOLACAO_EXCEPCIONAL
  -- Nível 2: FATOR_AMBIENTAL_FISICO | FATOR_AMBIENTAL_TECNOLOGICO | FADIGA | DOENCA |
  --           ESTRESSE | REDUCAO_ATENCAO | PRATICA_EQUIPE_CRM | PRATICA_BRIEFING
  -- Nível 3: SUPERVISAO_INADEQUADA | FALHA_PLANEJAMENTO | NAO_CORRECAO_PROBLEMA | VIOLACAO_SUPERVISORA
  -- Nível 4: GESTAO_RECURSOS | CLIMA_ORGANIZACIONAL | PROCESSO_ORGANIZACIONAL

  subcategoria TEXT,                             -- Detalhe adicional da categoria
  descricao TEXT,                                -- Observação do analista GSO

  -- Dados capturados automaticamente do FRMS (se nivel_hfacs = PRECONDICOES e categoria = FADIGA)
  efetividade_cognitiva_capturada REAL,          -- Score FRMS do piloto na data
  fonte_automatica INTEGER DEFAULT 0 CHECK (fonte_automatica IN (0, 1)),
  -- 1 = preenchido automaticamente pelo sistema; 0 = inserido manualmente pelo GSO

  -- Auditoria
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sgso_hfacs_relato ON sgso_relatos_fatores_humanos(relato_id);
CREATE INDEX IF NOT EXISTS idx_sgso_hfacs_empresa ON sgso_relatos_fatores_humanos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_sgso_hfacs_nivel ON sgso_relatos_fatores_humanos(nivel_hfacs, empresa_id);
CREATE INDEX IF NOT EXISTS idx_sgso_hfacs_categoria ON sgso_relatos_fatores_humanos(categoria, empresa_id);

-- ------------------------------------------------------------
-- Arquivos anexos a relatos (além do arquivo principal)
-- Fotos, laudos, documentos de evidência
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sgso_relatos_arquivos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relato_id TEXT NOT NULL,                       -- FK sgso_relatos.id
  empresa_id INTEGER NOT NULL,

  -- Metadados do arquivo (armazenado no R2)
  url TEXT NOT NULL,                             -- URL R2 completa
  nome_original TEXT NOT NULL,                   -- Nome do arquivo enviado pelo usuário
  tipo_mime TEXT,                                -- image/jpeg, application/pdf, etc.
  tamanho_bytes INTEGER,

  -- Classificação
  tipo_documento TEXT CHECK (tipo_documento IN (
    'FOTO_OCORRENCIA',
    'FOTO_RAMPA',
    'LAUDO_TECNICO',
    'REGISTRO_MANUTENCAO',
    'EVIDENCIA_ACAO',
    'OUTRO'
  )),
  descricao TEXT,

  -- Auditoria
  uploaded_by INTEGER,                           -- FK funcionarios.id
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sgso_arquivos_relato ON sgso_relatos_arquivos(relato_id);
CREATE INDEX IF NOT EXISTS idx_sgso_arquivos_empresa ON sgso_relatos_arquivos(empresa_id);

-- ------------------------------------------------------------
-- Contador sequencial de protocolos por empresa/ano
-- Garante numeração contínua: REL-2026-0001, REL-2026-0002...
-- Evita race condition de SELECT MAX + INSERT
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sgso_protocolo_sequencia (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  ano INTEGER NOT NULL,
  ultimo_numero INTEGER NOT NULL DEFAULT 0,
  UNIQUE(empresa_id, ano)
);

-- ------------------------------------------------------------
-- Log de alterações de status dos relatos (trilha de auditoria)
-- Registra toda transição de status com motivo e responsável
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sgso_relatos_historico_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relato_id TEXT NOT NULL,                       -- FK sgso_relatos.id
  empresa_id INTEGER NOT NULL,

  status_anterior TEXT,                          -- NULL no primeiro registro (criação)
  status_novo TEXT NOT NULL,
  motivo TEXT,                                   -- Justificativa da mudança (obrigatória em alguns fluxos)
  alterado_por INTEGER NOT NULL,                 -- FK funcionarios.id
  alterado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sgso_hist_relato ON sgso_relatos_historico_status(relato_id);
CREATE INDEX IF NOT EXISTS idx_sgso_hist_empresa ON sgso_relatos_historico_status(empresa_id, alterado_em);

-- ------------------------------------------------------------
-- Comentários/anotações internas do GSO no relato
-- Não visíveis ao relator
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sgso_relatos_comentarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relato_id TEXT NOT NULL,                       -- FK sgso_relatos.id
  empresa_id INTEGER NOT NULL,

  texto TEXT NOT NULL,
  interno INTEGER NOT NULL DEFAULT 1 CHECK (interno IN (0, 1)),
  -- 1 = visível só para GSO/admin; 0 = visível ao relator (futuro)

  autor_id INTEGER NOT NULL,                     -- FK funcionarios.id
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sgso_comentarios_relato ON sgso_relatos_comentarios(relato_id);
