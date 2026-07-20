-- source_reference: feat/controle-voos-rdv-sigvoos-reinicio (RDV Piloto -> Coordenação workflow)
-- operational_decision: ADDITIVE_ONLY_NEW_COLUMNS_AND_TABLES - nenhuma tabela/coluna existente alterada ou removida
-- dry_run_required: sim - aplicado e validado em D1 local (schema vazio e schema pré-existente com 0410/0411)
-- rollback_plan_required: sim - ver 0438_controle_voos_rdv_coordenacao_workflow_rollback.sql
--
-- Controle de Voos: fluxo de revisão/aprovação da Coordenação para o RDV (Relatório de Voo).
--
-- Estritamente aditivo sobre 0410/0411:
--   - NÃO remove nem renomeia nenhuma tabela ou coluna existente;
--   - NÃO altera o CHECK de cv_rdv_operacional.status (permanece
--     'rascunho' | 'preenchimento_finalizado' | 'cancelado', que continua
--     controlando o "lock" operacional dos campos preenchidos pelo piloto);
--   - Adiciona um novo eixo ortogonal `workflow_status` para o fluxo de
--     revisão da Coordenação (piloto -> envio -> revisão -> aprovação ->
--     finalização -> reabertura), com concorrência otimista via `versao`.
--
-- Novo eixo `workflow_status` (cv_rdv_operacional):
--   rascunho -> enviado -> em_revisao -> aprovado_coordenacao -> finalizado -> em_revisao (reabertura)
--   em_revisao -> rascunho (devolução; motivo_devolucao registra o porquê)
--   {rascunho, enviado, em_revisao} -> cancelado
--
-- Não introduz nenhuma tabela/coluna com nomes reservados a eDB, Diário de
-- Bordo Digital, SDRMe ou qualquer termo de homologação/validação ANAC.

CREATE TABLE IF NOT EXISTS _rollback_0438_column_guard (
  safe INTEGER NOT NULL CHECK (safe = 1)
);
INSERT INTO _rollback_0438_column_guard (safe)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM pragma_table_info('cv_rdv_operacional') WHERE name = 'workflow_status'
) THEN 0 ELSE 1 END;
DROP TABLE IF EXISTS _rollback_0438_column_guard;

ALTER TABLE cv_rdv_operacional ADD COLUMN workflow_status TEXT NOT NULL DEFAULT 'rascunho';
ALTER TABLE cv_rdv_operacional ADD COLUMN versao INTEGER NOT NULL DEFAULT 1;
ALTER TABLE cv_rdv_operacional ADD COLUMN enviado_por INTEGER;
ALTER TABLE cv_rdv_operacional ADD COLUMN enviado_em TEXT;
ALTER TABLE cv_rdv_operacional ADD COLUMN revisao_iniciada_por INTEGER;
ALTER TABLE cv_rdv_operacional ADD COLUMN revisao_iniciada_em TEXT;
ALTER TABLE cv_rdv_operacional ADD COLUMN aprovado_coordenacao_por INTEGER;
ALTER TABLE cv_rdv_operacional ADD COLUMN aprovado_coordenacao_em TEXT;
ALTER TABLE cv_rdv_operacional ADD COLUMN finalizado_workflow_em TEXT;
ALTER TABLE cv_rdv_operacional ADD COLUMN reaberto_por INTEGER;
ALTER TABLE cv_rdv_operacional ADD COLUMN reaberto_em TEXT;
ALTER TABLE cv_rdv_operacional ADD COLUMN motivo_devolucao TEXT;
ALTER TABLE cv_rdv_operacional ADD COLUMN motivo_cancelamento TEXT;

CREATE INDEX IF NOT EXISTS idx_cv_rdv_operacional_empresa_workflow_data
  ON cv_rdv_operacional (empresa_id, workflow_status, data_voo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_rdv_operacional_empresa_workflow_responsavel
  ON cv_rdv_operacional (empresa_id, responsavel_preenchimento_id, workflow_status)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Aprovações (não é "assinatura digital" nem homologação ANAC — apenas
-- registro interno de decisão de revisão/aprovação).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cv_rdv_aprovacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  rdv_id INTEGER NOT NULL,
  versao INTEGER NOT NULL,
  tipo_aprovacao TEXT NOT NULL DEFAULT 'COORDENACAO',
  status TEXT NOT NULL,
  usuario_id INTEGER,
  funcionario_id INTEGER,
  observacao TEXT,
  justificativa TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (tipo_aprovacao IN ('COORDENACAO', 'CONTRATANTE', 'COMERCIAL')),
  CHECK (status IN ('ENVIADO', 'REVISAO_INICIADA', 'APROVADO', 'DEVOLVIDO', 'REJEITADO', 'REABERTO', 'CANCELADO')),
  FOREIGN KEY (rdv_id) REFERENCES cv_rdv_operacional(id)
);

CREATE INDEX IF NOT EXISTS idx_cv_rdv_aprovacoes_empresa_rdv_created
  ON cv_rdv_aprovacoes (empresa_id, rdv_id, created_at);

CREATE INDEX IF NOT EXISTS idx_cv_rdv_aprovacoes_empresa_status_created
  ON cv_rdv_aprovacoes (empresa_id, status, created_at);

CREATE TRIGGER IF NOT EXISTS trg_cv_rdv_aprovacoes_rdv_insert
BEFORE INSERT ON cv_rdv_aprovacoes
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM cv_rdv_operacional r
  WHERE r.id = NEW.rdv_id AND r.empresa_id = NEW.empresa_id
)
BEGIN
  SELECT RAISE(ABORT, 'cv_rdv_aprovacoes empresa_id mismatch');
END;

-- ---------------------------------------------------------------------------
-- Revisões: diff campo-a-campo com justificativa, para a tela de "diferenças"
-- da Coordenação. Complementa (não substitui) a tabela genérica `auditoria`.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cv_rdv_revisoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  rdv_id INTEGER NOT NULL,
  versao INTEGER NOT NULL,
  entidade TEXT NOT NULL DEFAULT 'rdv',
  registro_id INTEGER,
  campo TEXT NOT NULL,
  valor_anterior TEXT,
  valor_novo TEXT,
  usuario_id INTEGER,
  justificativa TEXT,
  estado_anterior TEXT,
  estado_novo TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (entidade IN ('rdv', 'etapa', 'tripulante', 'abastecimento')),
  FOREIGN KEY (rdv_id) REFERENCES cv_rdv_operacional(id)
);

CREATE INDEX IF NOT EXISTS idx_cv_rdv_revisoes_empresa_rdv_versao
  ON cv_rdv_revisoes (empresa_id, rdv_id, versao, created_at);

CREATE TRIGGER IF NOT EXISTS trg_cv_rdv_revisoes_rdv_insert
BEFORE INSERT ON cv_rdv_revisoes
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM cv_rdv_operacional r
  WHERE r.id = NEW.rdv_id AND r.empresa_id = NEW.empresa_id
)
BEGIN
  SELECT RAISE(ABORT, 'cv_rdv_revisoes empresa_id mismatch');
END;

-- ---------------------------------------------------------------------------
-- Alertas derivados de regras (informativo/atenção/impeditivo).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cv_rdv_alertas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  rdv_id INTEGER NOT NULL,
  etapa_id INTEGER,
  tipo TEXT NOT NULL,
  severidade TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  regra TEXT NOT NULL,
  impeditivo_envio INTEGER NOT NULL DEFAULT 0,
  impeditivo_aprovacao INTEGER NOT NULL DEFAULT 0,
  resolvido INTEGER NOT NULL DEFAULT 0,
  resolvido_por INTEGER,
  resolvido_em TEXT,
  justificativa_resolucao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (severidade IN ('INFORMATIVO', 'ATENCAO', 'IMPEDE_ENVIO', 'IMPEDE_APROVACAO')),
  CHECK (impeditivo_envio IN (0, 1)),
  CHECK (impeditivo_aprovacao IN (0, 1)),
  CHECK (resolvido IN (0, 1)),
  FOREIGN KEY (rdv_id) REFERENCES cv_rdv_operacional(id),
  FOREIGN KEY (etapa_id) REFERENCES cv_voo_etapas(id)
);

CREATE INDEX IF NOT EXISTS idx_cv_rdv_alertas_empresa_rdv_resolvido
  ON cv_rdv_alertas (empresa_id, rdv_id, resolvido)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_rdv_alertas_empresa_severidade
  ON cv_rdv_alertas (empresa_id, severidade, resolvido)
  WHERE deleted_at IS NULL;

CREATE TRIGGER IF NOT EXISTS trg_cv_rdv_alertas_rdv_insert
BEFORE INSERT ON cv_rdv_alertas
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM cv_rdv_operacional r
  WHERE r.id = NEW.rdv_id AND r.empresa_id = NEW.empresa_id
)
BEGIN
  SELECT RAISE(ABORT, 'cv_rdv_alertas empresa_id mismatch');
END;

-- ---------------------------------------------------------------------------
-- Abastecimentos: eventos de reabastecimento por voo/etapa (distintos dos
-- totais agregados já existentes em cv_rdv_operacional).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cv_voo_abastecimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  voo_id INTEGER NOT NULL,
  etapa_id INTEGER,
  fornecedor TEXT,
  localidade TEXT,
  combustivel_solicitado REAL,
  unidade TEXT NOT NULL DEFAULT 'L',
  combustivel_abastecido REAL,
  numero_ce TEXT,
  anexo_r2_key TEXT,
  responsavel_id INTEGER,
  data_hora TEXT NOT NULL,
  observacoes TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (combustivel_solicitado IS NULL OR combustivel_solicitado >= 0),
  CHECK (combustivel_abastecido IS NULL OR combustivel_abastecido >= 0),
  FOREIGN KEY (voo_id) REFERENCES cv_voos(id),
  FOREIGN KEY (etapa_id) REFERENCES cv_voo_etapas(id)
);

CREATE INDEX IF NOT EXISTS idx_cv_voo_abastecimentos_empresa_voo
  ON cv_voo_abastecimentos (empresa_id, voo_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_voo_abastecimentos_empresa_data
  ON cv_voo_abastecimentos (empresa_id, data_hora)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_voo_abastecimentos_empresa_deleted
  ON cv_voo_abastecimentos (empresa_id, deleted_at);

CREATE TRIGGER IF NOT EXISTS trg_cv_voo_abastecimentos_voo_insert
BEFORE INSERT ON cv_voo_abastecimentos
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM cv_voos v
  WHERE v.id = NEW.voo_id AND v.empresa_id = NEW.empresa_id
)
BEGIN
  SELECT RAISE(ABORT, 'cv_voo_abastecimentos empresa_id mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_cv_voo_abastecimentos_voo_update
BEFORE UPDATE OF empresa_id, voo_id ON cv_voo_abastecimentos
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM cv_voos v
  WHERE v.id = NEW.voo_id AND v.empresa_id = NEW.empresa_id
)
BEGIN
  SELECT RAISE(ABORT, 'cv_voo_abastecimentos empresa_id mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_cv_voo_abastecimentos_etapa_insert
BEFORE INSERT ON cv_voo_abastecimentos
FOR EACH ROW
WHEN NEW.etapa_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1 FROM cv_voo_etapas e
   WHERE e.id = NEW.etapa_id AND e.voo_id = NEW.voo_id AND e.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_voo_abastecimentos etapa_id mismatch');
END;
