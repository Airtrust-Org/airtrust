-- 0090_reclass_queue.sql
-- Objetivo: preparar infraestrutura para recuperação manual da diversidade
-- Situação atual: tabela qualificacoes_historico contém 522 linhas colapsadas em códigos genéricos (GEN_*)
-- Tabela qualificacoes_tipos já possui diversidade (89 códigos distintos). IDs originais não correspondem aos antigos backups.
-- Sem mapeamento determinístico para reatribuir automaticamente cada histórico.
-- Estratégia: criar fila de reclassificação + trigger de aplicação.


-- Log de execuções (sentinela idempotente)
CREATE TABLE IF NOT EXISTS _data_recovery_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  etapa TEXT NOT NULL,
  detalhes TEXT,
  executed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Fila de reclassificação
CREATE TABLE IF NOT EXISTS qualificacoes_historico_reclass_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  historico_id INTEGER NOT NULL,
  current_codigo TEXT,
  target_tipo_id TEXT, -- referencia qualificacoes_tipos.id (tipo TEXT)
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING|APPLIED|SKIPPED
  reason TEXT, -- justificativa / fonte da decisão
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(historico_id),
  FOREIGN KEY(historico_id) REFERENCES qualificacoes_historico(id) ON DELETE CASCADE
);

-- Trigger: quando status vira APPLIED com target_tipo_id definido, atualiza a linha de histórico.
CREATE TRIGGER IF NOT EXISTS trg_apply_reclassification
AFTER UPDATE ON qualificacoes_historico_reclass_queue
WHEN NEW.status = 'APPLIED' AND NEW.target_tipo_id IS NOT NULL
BEGIN
  UPDATE qualificacoes_historico
  SET qualificacao_id = NEW.target_tipo_id,
      codigo = (SELECT codigo FROM qualificacoes_tipos WHERE id = NEW.target_tipo_id),
      tipo_codigo = (SELECT codigo FROM qualificacoes_tipos WHERE id = NEW.target_tipo_id),
      categoria = (SELECT categoria FROM qualificacoes_tipos WHERE id = NEW.target_tipo_id),
      updated_at = datetime('now')
  WHERE id = NEW.historico_id;
  INSERT INTO _data_recovery_log(etapa, detalhes) VALUES ('APPLY_RECLASS', 'historico_id=' || NEW.historico_id || ' -> tipo_id=' || NEW.target_tipo_id);
END;

-- Popular fila para todas as linhas genéricas ainda não enfileiradas
INSERT INTO qualificacoes_historico_reclass_queue (historico_id, current_codigo)
SELECT h.id, h.codigo
FROM qualificacoes_historico h
WHERE h.deleted_at IS NULL
  AND (h.codigo LIKE 'GEN_%' OR h.codigo IS NULL)
  AND NOT EXISTS (
    SELECT 1 FROM qualificacoes_historico_reclass_queue q WHERE q.historico_id = h.id
  );

INSERT INTO _data_recovery_log(etapa, detalhes)
VALUES ('QUEUE_POPULATE', (SELECT 'rows_enqueued=' || COUNT(*) FROM qualificacoes_historico_reclass_queue));

