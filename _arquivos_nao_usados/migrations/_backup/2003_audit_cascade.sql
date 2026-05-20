-- ============================================
-- MIGRAÇÃO: Sistema de Auditoria Cascade
-- Data: 2025-10-23
-- Objetivo: Registrar execuções, validações e métricas
-- ============================================

-- Tabela de auditoria de execuções do Cascade
CREATE TABLE IF NOT EXISTS audit_cascade (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo TEXT NOT NULL, -- 'sonnet-4.5', 'gpt-4-turbo', 'haiku'
  arquivo TEXT, -- Arquivo modificado
  comando TEXT, -- Comando executado (build, test, lint)
  tempo_ms INTEGER, -- Tempo de execução em ms
  sucesso INTEGER DEFAULT 1, -- 1 = sucesso, 0 = falha
  checksum TEXT, -- SHA-256 do arquivo modificado
  erros INTEGER DEFAULT 0, -- Número de erros
  warnings INTEGER DEFAULT 0, -- Número de warnings
  score REAL, -- Métrica de eficiência (0-100)
  detalhes TEXT, -- JSON com detalhes adicionais
  created_at TEXT DEFAULT (datetime('now'))
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_audit_cascade_modelo ON audit_cascade(modelo);
CREATE INDEX IF NOT EXISTS idx_audit_cascade_arquivo ON audit_cascade(arquivo);
CREATE INDEX IF NOT EXISTS idx_audit_cascade_created ON audit_cascade(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_cascade_score ON audit_cascade(score);

-- View para métricas agregadas
CREATE VIEW IF NOT EXISTS vw_cascade_metrics AS
SELECT 
  modelo,
  COUNT(*) as total_execucoes,
  SUM(CASE WHEN sucesso = 1 THEN 1 ELSE 0 END) as sucessos,
  SUM(CASE WHEN sucesso = 0 THEN 1 ELSE 0 END) as falhas,
  ROUND(AVG(tempo_ms), 2) as tempo_medio_ms,
  ROUND(AVG(score), 2) as score_medio,
  ROUND(100.0 * SUM(CASE WHEN sucesso = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) as taxa_sucesso
FROM audit_cascade
GROUP BY modelo;

-- View para últimas execuções
CREATE VIEW IF NOT EXISTS vw_cascade_recentes AS
SELECT 
  id,
  modelo,
  arquivo,
  comando,
  tempo_ms,
  sucesso,
  score,
  created_at
FROM audit_cascade
ORDER BY created_at DESC
LIMIT 50;
