-- ========================================
-- AIRTRUST - COMPLIANCE: TRIGGERS AUTOMÁTICOS
-- Migration 130: Sistema de Cálculo Automático de Compliance
-- Data: 2025-11-28
-- ========================================
-- Cria tabela historico_compliance e triggers D1 para cálculo
-- automático sempre que qualificações/licenças são inseridas/atualizadas
-- ========================================

-- ========================================
-- 1. TABELA: historico_compliance
-- ========================================

CREATE TABLE IF NOT EXISTS historico_compliance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo_recurso TEXT NOT NULL CHECK(tipo_recurso IN ('qualificacao', 'licenca')),
  recurso_id INTEGER NOT NULL, -- ID da qualificacao_historico ou licenca
  status_compliance TEXT NOT NULL CHECK(status_compliance IN ('CONFORME', 'VENCIDO', 'PENDENTE', 'A_VENCER')),
  percentual_conformidade REAL NOT NULL DEFAULT 0.0 CHECK(percentual_conformidade >= 0 AND percentual_conformidade <= 100),
  data_calculo TEXT NOT NULL DEFAULT (datetime('now')),
  data_vencimento TEXT, -- Cópia da data de vencimento para análise histórica
  dias_para_vencer INTEGER, -- Dias até vencimento (negativo se vencido)
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_historico_compliance_funcionario 
ON historico_compliance(funcionario_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_historico_compliance_status 
ON historico_compliance(status_compliance, deleted_at);

CREATE INDEX IF NOT EXISTS idx_historico_compliance_recurso 
ON historico_compliance(tipo_recurso, recurso_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_historico_compliance_data_calculo 
ON historico_compliance(data_calculo);

-- ========================================
-- 2. FUNÇÃO AUXILIAR: Calcular Status e Percentual
-- ========================================
-- D1 não suporta funções SQL, então usamos triggers diretos

-- ========================================
-- 3. TRIGGER: Calcular compliance ao INSERIR qualificação
-- ========================================

CREATE TRIGGER IF NOT EXISTS trg_qualificacao_insert_compliance
AFTER INSERT ON qualificacoes_historico
WHEN NEW.deleted_at IS NULL AND NEW.data_vencimento IS NOT NULL
BEGIN
  INSERT INTO historico_compliance (
    funcionario_id,
    tipo_recurso,
    recurso_id,
    status_compliance,
    percentual_conformidade,
    data_calculo,
    data_vencimento,
    dias_para_vencer,
    observacoes
  )
  SELECT 
    NEW.funcionario_id,
    'qualificacao',
    NEW.id,
    CASE 
      -- Vencida (data passada)
      WHEN julianday(NEW.data_vencimento) < julianday('now') THEN 'VENCIDO'
      -- A vencer em até 30 dias
      WHEN julianday(NEW.data_vencimento) - julianday('now') <= 30 THEN 'A_VENCER'
      -- Conforme (mais de 30 dias)
      WHEN julianday(NEW.data_vencimento) >= julianday('now') THEN 'CONFORME'
      ELSE 'PENDENTE'
    END,
    CASE 
      WHEN julianday(NEW.data_vencimento) >= julianday('now') THEN 100.0
      ELSE 0.0
    END,
    datetime('now'),
    NEW.data_vencimento,
    CAST((julianday(NEW.data_vencimento) - julianday('now')) AS INTEGER),
    'Calculado automaticamente via trigger INSERT';
END;

-- ========================================
-- 4. TRIGGER: Recalcular compliance ao ATUALIZAR qualificação
-- ========================================

CREATE TRIGGER IF NOT EXISTS trg_qualificacao_update_compliance
AFTER UPDATE ON qualificacoes_historico
WHEN NEW.deleted_at IS NULL 
  AND NEW.data_vencimento IS NOT NULL
  AND (
    OLD.data_vencimento != NEW.data_vencimento OR
    OLD.funcionario_id != NEW.funcionario_id OR
    OLD.qualificacao_id != NEW.qualificacao_id
  )
BEGIN
  -- Soft delete registro anterior
  UPDATE historico_compliance
  SET deleted_at = datetime('now'),
      updated_at = datetime('now')
  WHERE tipo_recurso = 'qualificacao'
    AND recurso_id = NEW.id
    AND deleted_at IS NULL;
  
  -- Inserir novo cálculo atualizado
  INSERT INTO historico_compliance (
    funcionario_id,
    tipo_recurso,
    recurso_id,
    status_compliance,
    percentual_conformidade,
    data_calculo,
    data_vencimento,
    dias_para_vencer,
    observacoes
  )
  SELECT 
    NEW.funcionario_id,
    'qualificacao',
    NEW.id,
    CASE 
      WHEN julianday(NEW.data_vencimento) < julianday('now') THEN 'VENCIDO'
      WHEN julianday(NEW.data_vencimento) - julianday('now') <= 30 THEN 'A_VENCER'
      WHEN julianday(NEW.data_vencimento) >= julianday('now') THEN 'CONFORME'
      ELSE 'PENDENTE'
    END,
    CASE 
      WHEN julianday(NEW.data_vencimento) >= julianday('now') THEN 100.0
      ELSE 0.0
    END,
    datetime('now'),
    NEW.data_vencimento,
    CAST((julianday(NEW.data_vencimento) - julianday('now')) AS INTEGER),
    'Recalculado automaticamente via trigger UPDATE';
END;

-- ========================================
-- 5. TRIGGER: Soft delete ao deletar qualificação
-- ========================================

CREATE TRIGGER IF NOT EXISTS trg_qualificacao_delete_compliance
AFTER UPDATE OF deleted_at ON qualificacoes_historico
WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL
BEGIN
  UPDATE historico_compliance
  SET deleted_at = datetime('now'),
      updated_at = datetime('now'),
      observacoes = COALESCE(observacoes || ' | ', '') || 'Qualificação deletada'
  WHERE tipo_recurso = 'qualificacao'
    AND recurso_id = NEW.id
    AND deleted_at IS NULL;
END;

-- ========================================
-- 6. TRIGGERS PARA LICENÇAS (mesma lógica)
-- ========================================

CREATE TRIGGER IF NOT EXISTS trg_licenca_insert_compliance
AFTER INSERT ON licencas
WHEN NEW.deleted_at IS NULL AND NEW.data_vencimento IS NOT NULL
BEGIN
  INSERT INTO historico_compliance (
    funcionario_id,
    tipo_recurso,
    recurso_id,
    status_compliance,
    percentual_conformidade,
    data_calculo,
    data_vencimento,
    dias_para_vencer,
    observacoes
  )
  SELECT 
    NEW.funcionario_id,
    'licenca',
    NEW.id,
    CASE 
      WHEN julianday(NEW.data_vencimento) < julianday('now') THEN 'VENCIDO'
      WHEN julianday(NEW.data_vencimento) - julianday('now') <= 30 THEN 'A_VENCER'
      WHEN julianday(NEW.data_vencimento) >= julianday('now') THEN 'CONFORME'
      ELSE 'PENDENTE'
    END,
    CASE 
      WHEN julianday(NEW.data_vencimento) >= julianday('now') THEN 100.0
      ELSE 0.0
    END,
    datetime('now'),
    NEW.data_vencimento,
    CAST((julianday(NEW.data_vencimento) - julianday('now')) AS INTEGER),
    'Calculado automaticamente via trigger INSERT (licença)';
END;

CREATE TRIGGER IF NOT EXISTS trg_licenca_update_compliance
AFTER UPDATE ON licencas
WHEN NEW.deleted_at IS NULL 
  AND NEW.data_vencimento IS NOT NULL
  AND (
    OLD.data_vencimento != NEW.data_vencimento OR
    OLD.funcionario_id != NEW.funcionario_id OR
    OLD.tipo != NEW.tipo
  )
BEGIN
  UPDATE historico_compliance
  SET deleted_at = datetime('now'),
      updated_at = datetime('now')
  WHERE tipo_recurso = 'licenca'
    AND recurso_id = NEW.id
    AND deleted_at IS NULL;
  
  INSERT INTO historico_compliance (
    funcionario_id,
    tipo_recurso,
    recurso_id,
    status_compliance,
    percentual_conformidade,
    data_calculo,
    data_vencimento,
    dias_para_vencer,
    observacoes
  )
  SELECT 
    NEW.funcionario_id,
    'licenca',
    NEW.id,
    CASE 
      WHEN julianday(NEW.data_vencimento) < julianday('now') THEN 'VENCIDO'
      WHEN julianday(NEW.data_vencimento) - julianday('now') <= 30 THEN 'A_VENCER'
      WHEN julianday(NEW.data_vencimento) >= julianday('now') THEN 'CONFORME'
      ELSE 'PENDENTE'
    END,
    CASE 
      WHEN julianday(NEW.data_vencimento) >= julianday('now') THEN 100.0
      ELSE 0.0
    END,
    datetime('now'),
    NEW.data_vencimento,
    CAST((julianday(NEW.data_vencimento) - julianday('now')) AS INTEGER),
    'Recalculado automaticamente via trigger UPDATE (licença)';
END;

CREATE TRIGGER IF NOT EXISTS trg_licenca_delete_compliance
AFTER UPDATE OF deleted_at ON licencas
WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL
BEGIN
  UPDATE historico_compliance
  SET deleted_at = datetime('now'),
      updated_at = datetime('now'),
      observacoes = COALESCE(observacoes || ' | ', '') || 'Licença deletada'
  WHERE tipo_recurso = 'licenca'
    AND recurso_id = NEW.id
    AND deleted_at IS NULL;
END;

-- ========================================
-- 7. VIEW: Compliance atual por funcionário
-- ========================================

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

-- ========================================
-- 8. VIEW: Itens de compliance detalhados
-- ========================================

CREATE VIEW IF NOT EXISTS v_compliance_detalhado AS
SELECT 
  hc.id,
  hc.funcionario_id,
  f.nome AS funcionario_nome,
  f.matricula,
  hc.tipo_recurso,
  hc.recurso_id,
  CASE 
    WHEN hc.tipo_recurso = 'qualificacao' THEN qt.nome
    WHEN hc.tipo_recurso = 'licenca' THEN l.tipo
    ELSE 'N/A'
  END AS recurso_nome,
  CASE 
    WHEN hc.tipo_recurso = 'qualificacao' THEN qt.codigo
    WHEN hc.tipo_recurso = 'licenca' THEN l.numero
    ELSE NULL
  END AS recurso_codigo,
  hc.status_compliance,
  hc.percentual_conformidade,
  hc.data_vencimento,
  hc.dias_para_vencer,
  hc.data_calculo,
  hc.observacoes
FROM historico_compliance hc
INNER JOIN funcionarios f ON hc.funcionario_id = f.id
LEFT JOIN qualificacoes_historico qh 
  ON hc.tipo_recurso = 'qualificacao' 
  AND hc.recurso_id = qh.id 
  AND qh.deleted_at IS NULL
LEFT JOIN qualificacoes_tipos qt 
  ON qh.qualificacao_id = qt.id 
  AND qt.deleted_at IS NULL
LEFT JOIN licencas l 
  ON hc.tipo_recurso = 'licenca' 
  AND hc.recurso_id = l.id 
  AND l.deleted_at IS NULL
WHERE hc.deleted_at IS NULL
  AND f.deleted_at IS NULL;

-- ========================================
-- HABILITAR TRIGGERS RECURSIVOS (D1 suporta)
-- ========================================

PRAGMA recursive_triggers = ON;

-- ========================================
-- FINALIZAÇÃO
-- ========================================

-- Verificação de integridade
SELECT 'Migration 130: Triggers de Compliance criados com sucesso' AS status;
