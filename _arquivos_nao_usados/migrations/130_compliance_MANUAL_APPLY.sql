-- ========================================
-- COPIE E COLE NO CLOUDFLARE DASHBOARD
-- https://dash.cloudflare.com/4dca4e5fddc6a351651dd224f456586f/workers-and-pages/d1
-- Selecione: airtrust-db > Console
-- ========================================

-- Tabela historico_compliance
CREATE TABLE IF NOT EXISTS historico_compliance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo_recurso TEXT NOT NULL CHECK(tipo_recurso IN ('qualificacao', 'licenca')),
  recurso_id INTEGER NOT NULL,
  status_compliance TEXT NOT NULL CHECK(status_compliance IN ('CONFORME', 'VENCIDO', 'PENDENTE', 'A_VENCER')),
  percentual_conformidade REAL NOT NULL DEFAULT 0.0,
  data_calculo TEXT NOT NULL DEFAULT (datetime('now')),
  data_vencimento TEXT,
  dias_para_vencer INTEGER,
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_historico_compliance_funcionario ON historico_compliance(funcionario_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_historico_compliance_status ON historico_compliance(status_compliance, deleted_at);
CREATE INDEX IF NOT EXISTS idx_historico_compliance_recurso ON historico_compliance(tipo_recurso, recurso_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_historico_compliance_data_calculo ON historico_compliance(data_calculo);

-- View: Compliance por funcionário
CREATE VIEW IF NOT EXISTS v_compliance_funcionario_atual AS
SELECT 
  f.id AS funcionario_id,
  f.nome AS funcionario_nome,
  f.matricula,
  f.funcao,
  COUNT(DISTINCT hc.id) AS total_itens,
  SUM(CASE WHEN hc.status_compliance = 'CONFORME' THEN 1 ELSE 0 END) AS conformes,
  SUM(CASE WHEN hc.status_compliance = 'A_VENCER' THEN 1 ELSE 0 END) AS a_vencer,
  SUM(CASE WHEN hc.status_compliance = 'VENCIDO' THEN 1 ELSE 0 END) AS vencidos,
  SUM(CASE WHEN hc.status_compliance = 'PENDENTE' THEN 1 ELSE 0 END) AS pendentes,
  ROUND(AVG(hc.percentual_conformidade), 2) AS percentual_medio,
  CASE 
    WHEN SUM(CASE WHEN hc.status_compliance = 'VENCIDO' THEN 1 ELSE 0 END) > 0 THEN 'NAO_CONFORME'
    WHEN SUM(CASE WHEN hc.status_compliance = 'A_VENCER' THEN 1 ELSE 0 END) > 0 THEN 'EM_RISCO'
    WHEN SUM(CASE WHEN hc.status_compliance = 'PENDENTE' THEN 1 ELSE 0 END) > 0 THEN 'PENDENTE'
    ELSE 'CONFORME'
  END AS status_geral
FROM funcionarios f
LEFT JOIN historico_compliance hc 
  ON f.id = hc.funcionario_id 
  AND hc.deleted_at IS NULL
WHERE f.deleted_at IS NULL
GROUP BY f.id, f.nome, f.matricula, f.funcao;

-- Verificação
SELECT 'Tabela historico_compliance criada com sucesso' AS status;
SELECT COUNT(*) as total_registros FROM historico_compliance;
