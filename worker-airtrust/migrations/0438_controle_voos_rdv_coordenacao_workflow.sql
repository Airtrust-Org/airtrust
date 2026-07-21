-- source_reference: feat/controle-voos-rdv-sigvoos-reinicio (RDV Piloto -> Coordenação workflow)
-- operational_decision: ADDITIVE_ONLY_NEW_COLUMNS_AND_TABLES - nenhuma tabela/coluna existente alterada ou removida
-- dry_run_required: sim - aplicado e validado em D1 local (schema vazio e schema pré-existente com 0410/0411)
-- rollback_plan_required: sim - ver rollback_0438_controle_voos_rdv_coordenacao_workflow.sql (fora da cadeia de prefixos numéricos)
--
-- Controle de Voos: fluxo de revisão/aprovação da Coordenação para o RDV (Relatório de Voo).
--
-- Estritamente aditivo sobre 0410/0411:
--   - NÃO remove nem renomeia nenhuma tabela ou coluna existente;
--   - NÃO altera o CHECK de cv_rdv_operacional.status (permanece
--     'rascunho' | 'preenchimento_finalizado' | 'cancelado', que continua
--     controlando o "lock" operacional dos campos preenchidos pelo piloto);
--   - Adiciona um novo eixo ortogonal `workflow_status` para o fluxo de
--     revisão da Coordenação, com estados explícitos e independentemente
--     consultáveis (inclusive DEVOLVIDO e REABERTO — nenhum deles é
--     colapsado em outro estado) e concorrência otimista via `versao`.
--
-- Novo eixo `workflow_status` (cv_rdv_operacional), com CHECK fechado:
--   rascunho -> enviado -> em_revisao -> aprovado_coordenacao -> finalizado -> reaberto -> em_revisao
--   em_revisao -> devolvido -> {rascunho, enviado}
--   {rascunho, enviado, em_revisao, devolvido, reaberto} -> cancelado
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

-- Preflight fail-closed, executado ANTES de qualquer ALTER/CREATE desta
-- migration (não apenas antes do índice único lá embaixo): o runner de
-- migrations do D1/SQLite não garante que todo o arquivo rode dentro de uma
-- única transação (cada instrução pode ser auto-commitada individualmente),
-- então um guard posicionado só perto do índice deixaria as demais
-- alterações desta migration já aplicadas antes do abort. Recusa aplicar se
-- já existir qualquer duplicidade ativa de (empresa_id, voo_id,
-- numero_etapa) em cv_voo_etapas — a criação do índice único lá embaixo
-- falharia de qualquer forma, mas de forma menos clara e após alterações
-- parciais. Não deduplica nem apaga nada; apenas aborta. Para investigar
-- e resolver manualmente antes de aplicar em staging/produção (read-only):
--
--   SELECT empresa_id, voo_id, numero_etapa, COUNT(*) AS quantidade
--   FROM cv_voo_etapas
--   WHERE deleted_at IS NULL
--   GROUP BY empresa_id, voo_id, numero_etapa
--   HAVING COUNT(*) > 1;
CREATE TABLE IF NOT EXISTS _preflight_0438_etapa_numero_guard (
  ok INTEGER NOT NULL CHECK (ok = 1)
);
INSERT INTO _preflight_0438_etapa_numero_guard (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM cv_voo_etapas
  WHERE deleted_at IS NULL
  GROUP BY empresa_id, voo_id, numero_etapa
  HAVING COUNT(*) > 1
) THEN 0 ELSE 1 END;
DROP TABLE IF EXISTS _preflight_0438_etapa_numero_guard;

ALTER TABLE cv_rdv_operacional ADD COLUMN workflow_status TEXT NOT NULL DEFAULT 'rascunho';
ALTER TABLE cv_rdv_operacional ADD COLUMN versao INTEGER NOT NULL DEFAULT 1;
ALTER TABLE cv_rdv_operacional ADD COLUMN enviado_por INTEGER;
ALTER TABLE cv_rdv_operacional ADD COLUMN enviado_em TEXT;
ALTER TABLE cv_rdv_operacional ADD COLUMN revisao_iniciada_por INTEGER;
ALTER TABLE cv_rdv_operacional ADD COLUMN revisao_iniciada_em TEXT;
ALTER TABLE cv_rdv_operacional ADD COLUMN devolvido_por INTEGER;
ALTER TABLE cv_rdv_operacional ADD COLUMN devolvido_em TEXT;
ALTER TABLE cv_rdv_operacional ADD COLUMN aprovado_coordenacao_por INTEGER;
ALTER TABLE cv_rdv_operacional ADD COLUMN aprovado_coordenacao_em TEXT;
ALTER TABLE cv_rdv_operacional ADD COLUMN finalizado_workflow_em TEXT;
ALTER TABLE cv_rdv_operacional ADD COLUMN reaberto_por INTEGER;
ALTER TABLE cv_rdv_operacional ADD COLUMN reaberto_em TEXT;
ALTER TABLE cv_rdv_operacional ADD COLUMN motivo_devolucao TEXT;
ALTER TABLE cv_rdv_operacional ADD COLUMN motivo_cancelamento TEXT;

-- SQLite não permite CHECK em ALTER TABLE ADD COLUMN sobre expressões não
-- determinísticas em algumas versões; aplicamos o CHECK fechado via um
-- rebuild leve (CREATE TRIGGER de validação) em vez de recriar a tabela
-- inteira (evitaria risco de perda de dados/índices em uma tabela já usada
-- em produção por 0410/0411).
CREATE TRIGGER IF NOT EXISTS trg_cv_rdv_operacional_workflow_status_insert
BEFORE INSERT ON cv_rdv_operacional
FOR EACH ROW
WHEN NEW.workflow_status NOT IN (
  'rascunho', 'enviado', 'em_revisao', 'devolvido',
  'aprovado_coordenacao', 'finalizado', 'reaberto', 'cancelado'
)
BEGIN
  SELECT RAISE(ABORT, 'cv_rdv_operacional workflow_status invalido');
END;

CREATE TRIGGER IF NOT EXISTS trg_cv_rdv_operacional_workflow_status_update
BEFORE UPDATE OF workflow_status ON cv_rdv_operacional
FOR EACH ROW
WHEN NEW.workflow_status NOT IN (
  'rascunho', 'enviado', 'em_revisao', 'devolvido',
  'aprovado_coordenacao', 'finalizado', 'reaberto', 'cancelado'
)
BEGIN
  SELECT RAISE(ABORT, 'cv_rdv_operacional workflow_status invalido');
END;

CREATE TRIGGER IF NOT EXISTS trg_cv_rdv_operacional_versao_insert
BEFORE INSERT ON cv_rdv_operacional
FOR EACH ROW
WHEN NEW.versao < 1
BEGIN
  SELECT RAISE(ABORT, 'cv_rdv_operacional versao invalida');
END;

CREATE TRIGGER IF NOT EXISTS trg_cv_rdv_operacional_versao_update
BEFORE UPDATE OF versao ON cv_rdv_operacional
FOR EACH ROW
WHEN NEW.versao < 1
BEGIN
  SELECT RAISE(ABORT, 'cv_rdv_operacional versao invalida');
END;

CREATE INDEX IF NOT EXISTS idx_cv_rdv_operacional_empresa_workflow_data
  ON cv_rdv_operacional (empresa_id, workflow_status, data_voo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_rdv_operacional_empresa_workflow_responsavel
  ON cv_rdv_operacional (empresa_id, responsavel_preenchimento_id, workflow_status)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Aprovações (não é "assinatura digital" nem homologação ANAC — apenas
-- registro interno de decisão de revisão/aprovação, incluindo a confirmação
-- do comandante). Tabela append-only: nunca é atualizada, só inserida.
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
  CHECK (tipo_aprovacao IN ('COMANDANTE', 'COORDENACAO', 'CONTRATANTE', 'COMERCIAL')),
  CHECK (status IN ('ENVIADO', 'REVISAO_INICIADA', 'APROVADO', 'DEVOLVIDO', 'REJEITADO', 'REABERTO', 'CANCELADO')),
  CHECK (versao >= 1),
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

-- Append-only: qualquer UPDATE é bloqueado (o app nunca atualiza uma
-- aprovação já registrada; correções geram uma nova linha/versão).
CREATE TRIGGER IF NOT EXISTS trg_cv_rdv_aprovacoes_no_update
BEFORE UPDATE ON cv_rdv_aprovacoes
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'cv_rdv_aprovacoes e append-only, UPDATE nao permitido');
END;

-- ---------------------------------------------------------------------------
-- Revisões: diff campo-a-campo com justificativa, para a tela de "diferenças"
-- da Coordenação. Complementa (não substitui) a tabela genérica `auditoria`.
-- Também é append-only.
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
  CHECK (versao >= 1),
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

CREATE TRIGGER IF NOT EXISTS trg_cv_rdv_revisoes_no_update
BEFORE UPDATE ON cv_rdv_revisoes
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'cv_rdv_revisoes e append-only, UPDATE nao permitido');
END;

-- ---------------------------------------------------------------------------
-- Alertas derivados de regras (informativo/atenção/impeditivo). Esta tabela
-- NÃO é append-only (uma regra pode ser marcada como resolvida), então o
-- guard de tenant cobre apenas a mudança das chaves de vínculo.
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

-- etapa_id, quando informado, precisa pertencer ao mesmo voo do RDV.
CREATE TRIGGER IF NOT EXISTS trg_cv_rdv_alertas_etapa_insert
BEFORE INSERT ON cv_rdv_alertas
FOR EACH ROW
WHEN NEW.etapa_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voo_etapas e
   INNER JOIN cv_rdv_operacional r ON r.voo_id = e.voo_id AND r.empresa_id = e.empresa_id
   WHERE e.id = NEW.etapa_id
     AND e.empresa_id = NEW.empresa_id
     AND r.id = NEW.rdv_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_rdv_alertas etapa_id nao pertence ao voo do rdv');
END;

-- Bloqueia alteração das chaves de vínculo (empresa/rdv/etapa); os demais
-- campos (resolvido, resolvido_por, resolvido_em, justificativa_resolucao,
-- updated_at) continuam livremente atualizáveis pela aplicação.
CREATE TRIGGER IF NOT EXISTS trg_cv_rdv_alertas_keys_immutable
BEFORE UPDATE OF empresa_id, rdv_id, etapa_id ON cv_rdv_alertas
FOR EACH ROW
WHEN NEW.empresa_id <> OLD.empresa_id
  OR NEW.rdv_id <> OLD.rdv_id
  OR IFNULL(NEW.etapa_id, -1) <> IFNULL(OLD.etapa_id, -1)
BEGIN
  SELECT RAISE(ABORT, 'cv_rdv_alertas chaves de vinculo sao imutaveis');
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

-- Bloqueia alteração das chaves de vínculo (empresa/voo/etapa); os demais
-- campos operacionais continuam atualizáveis pela aplicação.
CREATE TRIGGER IF NOT EXISTS trg_cv_voo_abastecimentos_keys_immutable
BEFORE UPDATE OF empresa_id, voo_id, etapa_id ON cv_voo_abastecimentos
FOR EACH ROW
WHEN NEW.empresa_id <> OLD.empresa_id
  OR NEW.voo_id <> OLD.voo_id
  OR IFNULL(NEW.etapa_id, -1) <> IFNULL(OLD.etapa_id, -1)
BEGIN
  SELECT RAISE(ABORT, 'cv_voo_abastecimentos chaves de vinculo sao imutaveis');
END;

-- Unicidade de numero_etapa por voo (ativo). Complementa o índice não-único
-- idx_cv_voo_etapas_empresa_voo_numero de 0411; necessário para CRUD manual
-- de etapas sem colidir números após reorder/duplicar.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_voo_etapas_empresa_voo_numero_unique
  ON cv_voo_etapas (empresa_id, voo_id, numero_etapa)
  WHERE deleted_at IS NULL;
