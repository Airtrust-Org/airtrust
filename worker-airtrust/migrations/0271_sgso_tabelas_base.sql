-- ============================================================
-- Migration: 0271_sgso_tabelas_base.sql
-- Módulo: SGSO — Sistema de Gerenciamento de Segurança Operacional
-- Sprint: S1 — Fundação
-- Descrição: Tabelas principais — relatos, avaliação de risco e ações
-- Autor: AirTrust Engineering
-- Data: 2026-03-15
-- ============================================================

-- ------------------------------------------------------------
-- Tabela principal de relatos de ocorrências e perigos
-- Núcleo do módulo SGSO
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sgso_relatos (
  id TEXT PRIMARY KEY,                          -- UUID v4 gerado pelo backend
  empresa_id INTEGER NOT NULL,                   -- Multi-tenant obrigatório
  numero_protocolo TEXT NOT NULL UNIQUE,         -- Ex: REL-2026-0001 (gerado por trigger)

  -- Tipo e anonimato
  tipo TEXT NOT NULL CHECK (tipo IN (
    'OCORRENCIA',   -- Ocorrência de segurança operacional
    'PERIGO',       -- Perigo identificado (não gerou evento)
    'INCIDENTE',    -- Incidente grave com potencial de acidente
    'ACIDENTE'      -- Acidente com danos/lesões confirmados
  )),
  anonimo INTEGER NOT NULL DEFAULT 0 CHECK (anonimo IN (0, 1)),
  relator_id INTEGER,                            -- NULL se anonimo=1 — FK funcionarios.id

  -- Aeronave e operação
  aeronave_id INTEGER,                           -- FK aeronaves.id
  aeronave_matricula TEXT,                       -- Desnormalizado para histórico (aeronave pode mudar)
  aeronave_modelo TEXT,                          -- Desnormalizado (ex: "AW139", "SK76")

  -- Contexto temporal e geográfico
  data_ocorrencia TEXT NOT NULL,                 -- ISO 8601 — data e hora do evento
  local_icao TEXT,                               -- Código ICAO (ex: SBRJ, SBGL, plataforma: PLAT01)
  local_descricao TEXT,                          -- Descrição livre do local

  -- Contexto de voo
  fase_voo TEXT CHECK (fase_voo IN (
    'PREFLIGHT', 'TAXI', 'DECOLAGEM', 'SUBIDA',
    'CRUZEIRO', 'DESCIDA', 'APROXIMACAO', 'POUSO',
    'POS_VOO', 'SOLO', 'MANUTENCAO', 'NAO_APLICAVEL'
  )),
  condicao_meteorologica TEXT CHECK (condicao_meteorologica IN (
    'VMC', 'IMC', 'NOITE_VMC', 'NOITE_IMC', 'DEGRADADA', 'NAO_APLICAVEL'
  )),

  -- Narrativa
  descricao TEXT NOT NULL,                       -- Mínimo 50 chars — validado no backend
  consequencia TEXT,                             -- O que efetivamente aconteceu
  accao_imediata TEXT,                           -- Ação tomada imediatamente

  -- Taxonomia ICAO/ADREP
  categoria_adrep TEXT,                          -- Ex: BIRD_STRIKE, ENGINE_FAILURE, RUNWAY_INCURSION
  subcategoria_adrep TEXT,                       -- Subcategoria ADREP

  -- Status do fluxo de análise
  status TEXT NOT NULL DEFAULT 'ABERTO' CHECK (status IN (
    'ABERTO',           -- Relato enviado, aguardando triagem do GSO
    'EM_ANALISE',       -- GSO em análise ativa
    'AGUARDANDO_ACAO',  -- Análise concluída, ações em andamento
    'FECHADO'           -- Encerrado com evidências
  )),
  gso_responsavel_id INTEGER,                    -- FK funcionarios.id — GSO que assumiu

  -- ── Integração automática com módulos AirTrust ──────────────
  escala_id TEXT,                                -- FK escalas.id — escala vigente na data
  escala_quinzena INTEGER,                       -- 1 ou 2 — quinzena da ocorrência
  frms_jornada_id INTEGER,                       -- FK frms_jornada.id — jornada do dia
  efetividade_cognitiva REAL,                    -- Score FRMS 0–100 no momento (capturado no relato)
  horas_acumuladas_7d REAL,                      -- Horas de voo últimos 7 dias (capturado no relato)
  horas_acumuladas_28d REAL,                     -- Horas de voo últimos 28 dias (capturado no relato)
  qualificacoes_vencidas INTEGER DEFAULT 0,      -- Quantidade de qual. vencidas do piloto na data
  dias_embarcado INTEGER,                        -- Dia do ciclo embarcado (calculado)

  -- Evidências
  arquivo_url TEXT,                              -- URL R2 de arquivo principal
  arquivo_nome TEXT,

  -- Fechamento
  fechado_por INTEGER,                           -- FK funcionarios.id
  fechado_em TEXT,                               -- ISO 8601
  observacoes_fechamento TEXT,

  -- Auditoria
  created_by INTEGER,                            -- FK funcionarios.id (mesmo que relator_id)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT                                -- Soft delete obrigatório
);

CREATE INDEX IF NOT EXISTS idx_sgso_relatos_empresa ON sgso_relatos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_sgso_relatos_status ON sgso_relatos(status, empresa_id);
CREATE INDEX IF NOT EXISTS idx_sgso_relatos_data ON sgso_relatos(data_ocorrencia, empresa_id);
CREATE INDEX IF NOT EXISTS idx_sgso_relatos_tipo ON sgso_relatos(tipo, empresa_id);
CREATE INDEX IF NOT EXISTS idx_sgso_relatos_aeronave ON sgso_relatos(aeronave_id);
CREATE INDEX IF NOT EXISTS idx_sgso_relatos_relator ON sgso_relatos(relator_id);
CREATE INDEX IF NOT EXISTS idx_sgso_relatos_deleted ON sgso_relatos(deleted_at);

-- ------------------------------------------------------------
-- Avaliações de risco vinculadas a relatos
-- Uma ocorrência pode ter avaliação INICIAL e RESIDUAL (pós-mitigação)
-- Matriz 5×5: Probabilidade (A–E) × Severidade (1–5)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sgso_avaliacao_risco (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relato_id TEXT NOT NULL,                       -- FK sgso_relatos.id
  empresa_id INTEGER NOT NULL,                   -- Multi-tenant (desnormalizado para queries)

  tipo_avaliacao TEXT NOT NULL CHECK (tipo_avaliacao IN (
    'INICIAL',    -- Avaliação antes das ações de mitigação
    'RESIDUAL'    -- Avaliação após implementação das ações
  )),

  -- Eixos da matriz 5×5
  probabilidade TEXT NOT NULL CHECK (probabilidade IN (
    'A',  -- Frequente  (> 1 por 100h de voo)
    'B',  -- Provável   (1 por 1.000h)
    'C',  -- Ocasional  (1 por 10.000h)
    'D',  -- Remoto     (1 por 100.000h)
    'E'   -- Improvável (< 1 por 1.000.000h)
  )),
  severidade INTEGER NOT NULL CHECK (severidade BETWEEN 1 AND 5),
  -- 1=Insignificante, 2=Menor, 3=Moderado, 4=Maior, 5=Catastrófico

  -- Nível calculado pelo backend (não confiar no frontend)
  nivel_risco TEXT NOT NULL CHECK (nivel_risco IN ('BAIXO', 'MEDIO', 'ALTO', 'CRITICO')),

  -- Elevação automática por fadiga (FRMS)
  probabilidade_original TEXT,                   -- Prob antes de elevar por fadiga
  elevado_por_fadiga INTEGER DEFAULT 0 CHECK (elevado_por_fadiga IN (0, 1)),
  justificativa_elevacao TEXT,                   -- Preenchido automaticamente se elevado_por_fadiga=1

  -- Fundamentação
  justificativa TEXT,                            -- Justificativa do GSO para os valores escolhidos

  -- Quem avaliou
  avaliador_id INTEGER NOT NULL,                 -- FK funcionarios.id — GSO responsável
  data_avaliacao TEXT NOT NULL DEFAULT (datetime('now')),

  -- Auditoria
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sgso_risco_relato ON sgso_avaliacao_risco(relato_id);
CREATE INDEX IF NOT EXISTS idx_sgso_risco_empresa ON sgso_avaliacao_risco(empresa_id);
CREATE INDEX IF NOT EXISTS idx_sgso_risco_nivel ON sgso_avaliacao_risco(nivel_risco, empresa_id);

-- ------------------------------------------------------------
-- Ações de mitigação (CAPA — Corrective And Preventive Action)
-- Vinculadas a relatos ou auditorias
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sgso_acoes_mitigacao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,

  -- Origem da ação (uma das duas deve estar preenchida)
  relato_id TEXT,                                -- FK sgso_relatos.id
  nc_id INTEGER,                                 -- FK sgso_nao_conformidades.id (criado no Sprint 4)

  tipo TEXT NOT NULL CHECK (tipo IN (
    'CORRETIVA',   -- Eliminar a causa raiz do problema já ocorrido
    'PREVENTIVA'   -- Prevenir ocorrência de problema potencial
  )),

  -- Conteúdo
  descricao TEXT NOT NULL,
  categoria TEXT CHECK (categoria IN (
    'TREINAMENTO',
    'PROCEDIMENTO',
    'EQUIPAMENTO',
    'SUPERVISAO',
    'COMUNICACAO',
    'OUTRO'
  )),

  -- Responsabilidade
  responsavel_id INTEGER NOT NULL,               -- FK funcionarios.id
  prazo TEXT NOT NULL,                           -- ISO 8601 date

  -- Progresso
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN (
    'PENDENTE',
    'EM_ANDAMENTO',
    'CONCLUIDA',
    'CANCELADA'
  )),
  percentual_conclusao INTEGER DEFAULT 0 CHECK (percentual_conclusao BETWEEN 0 AND 100),

  -- Evidência de conclusão
  evidencia_url TEXT,                            -- URL R2 da evidência (foto, doc, etc.)
  evidencia_descricao TEXT,
  data_conclusao TEXT,                           -- Preenchida ao marcar CONCLUIDA
  concluida_por INTEGER,                         -- FK funcionarios.id

  -- Auditoria
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sgso_acoes_relato ON sgso_acoes_mitigacao(relato_id);
CREATE INDEX IF NOT EXISTS idx_sgso_acoes_empresa ON sgso_acoes_mitigacao(empresa_id);
CREATE INDEX IF NOT EXISTS idx_sgso_acoes_status ON sgso_acoes_mitigacao(status, empresa_id);
CREATE INDEX IF NOT EXISTS idx_sgso_acoes_responsavel ON sgso_acoes_mitigacao(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_sgso_acoes_prazo ON sgso_acoes_mitigacao(prazo, status);
