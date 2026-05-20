-- ============================================================
-- Migration: 0273_sgso_auditorias_e_kpi.sql
-- Módulo: SGSO — Sprint 4 (Auditorias) + Sprint 3 (KPIs)
-- Descrição: Auditorias, não conformidades e configuração de SPIs
-- Autor: AirTrust Engineering
-- Data: 2026-03-15
-- ============================================================

-- ------------------------------------------------------------
-- Auditorias (internas, externas, ramp check, etc.)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sgso_auditorias (
  id TEXT PRIMARY KEY,                           -- UUID
  empresa_id INTEGER NOT NULL,

  tipo TEXT NOT NULL CHECK (tipo IN (
    'INTERNA',              -- Auditoria interna do SGSO
    'EXTERNA',              -- Auditoria por órgão externo (ANAC, cliente, etc.)
    'RAMP_CHECK',           -- Inspeção surpresa de rampa
    'OPERACIONAL',          -- Revisão de procedimentos operacionais
    'MANUTENCAO',           -- Revisão sistema de manutenção
    'REVISAO_SGO',          -- Management Review anual
    'FORNECEDORES'          -- Auditoria em fornecedores críticos
  )),

  titulo TEXT NOT NULL,
  descricao TEXT,
  template_id INTEGER,                           -- FK sgso_checklist_templates.id (Sprint 4)

  -- Programação
  data_programada TEXT,                          -- ISO 8601 date
  data_realizada TEXT,

  -- Responsáveis
  auditor_id INTEGER,                            -- FK funcionarios.id — auditor líder
  auditado_setor TEXT,                           -- Setor ou área auditada

  -- Status
  status TEXT NOT NULL DEFAULT 'PROGRAMADA' CHECK (status IN (
    'PROGRAMADA',
    'EM_ANDAMENTO',
    'CONCLUIDA',
    'CANCELADA'
  )),

  -- Resultado
  total_itens INTEGER DEFAULT 0,
  itens_conformes INTEGER DEFAULT 0,
  itens_nc_major INTEGER DEFAULT 0,
  itens_nc_minor INTEGER DEFAULT 0,
  itens_observacao INTEGER DEFAULT 0,
  percentual_conformidade REAL,                  -- Calculado ao fechar (itens_conformes/total_itens*100)

  observacoes_gerais TEXT,
  relatorio_url TEXT,                            -- URL R2 do relatório PDF gerado

  -- Auditoria
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sgso_auditorias_empresa ON sgso_auditorias(empresa_id);
CREATE INDEX IF NOT EXISTS idx_sgso_auditorias_status ON sgso_auditorias(status, empresa_id);
CREATE INDEX IF NOT EXISTS idx_sgso_auditorias_data ON sgso_auditorias(data_programada, empresa_id);

-- ------------------------------------------------------------
-- Itens do checklist de cada auditoria
-- Criados a partir de templates ou manualmente
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sgso_auditoria_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  auditoria_id TEXT NOT NULL,                    -- FK sgso_auditorias.id
  empresa_id INTEGER NOT NULL,

  numero_item INTEGER,                           -- Ordem de apresentação
  descricao TEXT NOT NULL,                       -- Texto do item de verificação
  rbac_referencia TEXT,                          -- Ex: RBAC-135.339(a)(1)
  criterio_aceitacao TEXT,                       -- O que é considerado "conforme"

  -- Resultado da verificação
  resultado TEXT CHECK (resultado IN (
    'CONFORME',
    'NC_MAJOR',        -- Não conformidade maior (risco imediato)
    'NC_MINOR',        -- Não conformidade menor
    'OBSERVACAO',      -- Ponto de atenção sem NC formal
    'NAO_APLICAVEL'
  )),
  evidencia TEXT,                                -- Observações/evidências do auditor
  evidencia_url TEXT,                            -- URL R2 de foto/documento

  -- Auditoria
  verificado_por INTEGER,                        -- FK funcionarios.id
  verificado_em TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sgso_audit_itens_auditoria ON sgso_auditoria_itens(auditoria_id);
CREATE INDEX IF NOT EXISTS idx_sgso_audit_itens_resultado ON sgso_auditoria_itens(resultado, empresa_id);

-- ------------------------------------------------------------
-- Não Conformidades
-- Podem vir de auditorias ou de relatos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sgso_nao_conformidades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,

  -- Origem (pelo menos uma deve estar preenchida)
  auditoria_id TEXT,                             -- FK sgso_auditorias.id
  auditoria_item_id INTEGER,                     -- FK sgso_auditoria_itens.id
  relato_id TEXT,                                -- FK sgso_relatos.id

  tipo TEXT NOT NULL CHECK (tipo IN (
    'MAJOR',        -- Desvio que compromete diretamente a segurança
    'MINOR',        -- Desvio menor, sem risco imediato
    'OBSERVACAO'    -- Ponto de atenção sem caráter de NC
  )),

  descricao TEXT NOT NULL,
  rbac_referencia TEXT,                          -- Norma violada
  causa_raiz TEXT,                               -- Análise de causa raiz

  -- Prazo e responsável
  responsavel_id INTEGER,                        -- FK funcionarios.id
  prazo_resolucao TEXT,                          -- ISO 8601 date

  -- Status
  status TEXT NOT NULL DEFAULT 'ABERTA' CHECK (status IN (
    'ABERTA',
    'EM_RESOLUCAO',
    'AGUARDANDO_VERIFICACAO',
    'FECHADA',
    'CANCELADA'
  )),

  -- Fechamento
  fechada_por INTEGER,                           -- FK funcionarios.id
  fechada_em TEXT,
  evidencia_fechamento TEXT,
  evidencia_url TEXT,

  -- Auditoria
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sgso_nc_empresa ON sgso_nao_conformidades(empresa_id);
CREATE INDEX IF NOT EXISTS idx_sgso_nc_status ON sgso_nao_conformidades(status, empresa_id);
CREATE INDEX IF NOT EXISTS idx_sgso_nc_prazo ON sgso_nao_conformidades(prazo_resolucao, status);

-- ------------------------------------------------------------
-- Configuração de SPIs (Safety Performance Indicators)
-- Permite ao GSO personalizar metas e alertas por empresa
-- Populada com defaults ICAO no seed (ver 0274_sgso_seed.sql)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sgso_spi_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,

  codigo TEXT NOT NULL,                          -- Ex: TAXA_RELATOS, FECHAMENTO_ACOES
  nome TEXT NOT NULL,
  descricao TEXT,
  unidade TEXT,                                  -- Ex: "relatos/100h", "%", "quantidade"

  -- Metas configuráveis
  meta_valor REAL,                               -- Valor alvo
  meta_operador TEXT CHECK (meta_operador IN ('>=', '<=', '=', '>', '<')),
  -- Ex: meta_valor=2.0, meta_operador='>=' significa "deve ser >= 2.0"

  alerta_valor REAL,                             -- Valor de alerta (threshold de atenção)
  alerta_operador TEXT CHECK (alerta_operador IN ('>=', '<=', '=', '>', '<')),

  ativo INTEGER DEFAULT 1 CHECK (ativo IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_sgso_spi_empresa ON sgso_spi_config(empresa_id, ativo);
