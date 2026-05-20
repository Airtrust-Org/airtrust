-- 0091_restore_diversidade_qualificacoes.sql
-- Objetivo: Restaurar diversidade original (tipo_codigo, codigo, categoria) em qualificacoes_historico
-- a partir do backup _backup_qualificacoes_historico, recriar tipos específicos e remapear qualificacao_id.
-- Pré-condição: Tabela _backup_qualificacoes_historico existente (criada em 0062_consolidate_ssot_preserve_data.sql)
-- Segurança: Executa somente se detectar baixa diversidade atual.
-- Idempotência: Updates condicionais e inserções evitam duplicados.

BEGIN TRANSACTION;

-- FASE 0: Métricas atuais antes da restauração
CREATE TEMP TABLE _qdiv_before AS
SELECT 
  COUNT(*) AS total,
  COUNT(DISTINCT tipo_codigo) AS tipos_distintos,
  COUNT(DISTINCT codigo) AS codigos_distintos,
  COUNT(DISTINCT categoria) AS categorias_distintas
FROM qualificacoes_historico
WHERE deleted_at IS NULL;

-- FASE 1: Validar existência de backup e sua diversidade
CREATE TEMP TABLE _qdiv_backup AS
SELECT 
  COUNT(*) AS total_backup,
  COUNT(DISTINCT tipo_codigo) AS tipos_bkp,
  COUNT(DISTINCT codigo) AS codigos_bkp,
  COUNT(DISTINCT categoria) AS categorias_bkp
FROM _backup_qualificacoes_historico;

-- FASE 2: Restaurar colunas (apenas se diversidade atual for baixa e backup tiver diversidade)
-- Critério: (tipos_distintos <= 2 OR codigos_distintos <= 2) AND tipos_bkp > tipos_distintos
-- Usa COALESCE para não sobrescrever valores já diversos.
WITH ctx AS (
  SELECT b.tipos_bkp, b.codigos_bkp, o.tipos_distintos, o.codigos_distintos
  FROM _qdiv_backup b CROSS JOIN _qdiv_before o
)
UPDATE qualificacoes_historico q
SET 
  tipo_codigo = (
    SELECT b.tipo_codigo FROM _backup_qualificacoes_historico b WHERE b.id = q.id
  ),
  codigo = (
    SELECT b.codigo FROM _backup_qualificacoes_historico b WHERE b.id = q.id
  ),
  categoria = (
    SELECT b.categoria FROM _backup_qualificacoes_historico b WHERE b.id = q.id
  ),
  updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM ctx WHERE (ctx.tipos_distintos <= 2 OR ctx.codigos_distintos <= 2) AND ctx.tipos_bkp > ctx.tipos_distintos)
  AND EXISTS (SELECT 1 FROM _backup_qualificacoes_historico b WHERE b.id = q.id);

-- FASE 3: Criar tipos específicos a partir dos dados restaurados
INSERT INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
SELECT DISTINCT
  COALESCE(q.tipo_codigo, q.codigo) AS codigo,
  COALESCE(q.tipo_codigo, q.codigo) AS nome,
  q.categoria,
  'A definir' AS orgao_emissor,
  NULL AS validade_meses,
  datetime('now') AS created_at,
  datetime('now') AS updated_at
FROM qualificacoes_historico q
WHERE q.deleted_at IS NULL
  AND COALESCE(q.tipo_codigo, q.codigo) IS NOT NULL
  AND COALESCE(q.tipo_codigo, q.codigo) NOT IN (
    SELECT codigo FROM qualificacoes_tipos WHERE deleted_at IS NULL
  );

-- FASE 4: Remapear qualificacao_id para tipos específicos restaurados
UPDATE qualificacoes_historico q
SET qualificacao_id = (
    SELECT qt.id FROM qualificacoes_tipos qt
    WHERE qt.codigo = COALESCE(q.tipo_codigo, q.codigo)
      AND qt.deleted_at IS NULL
    LIMIT 1
  ),
  updated_at = datetime('now')
WHERE q.deleted_at IS NULL
  AND COALESCE(q.tipo_codigo, q.codigo) IS NOT NULL;

-- FASE 5: Soft delete do tipo genérico se não houver mais necessidade
UPDATE qualificacoes_tipos
SET deleted_at = datetime('now')
WHERE codigo IN ('GEN_TREINAMENTO','GEN_TREINAMENTO_UNIFICADO')
  AND deleted_at IS NULL
  AND id NOT IN (
    SELECT DISTINCT qualificacao_id FROM qualificacoes_historico WHERE deleted_at IS NULL AND qualificacao_id IS NOT NULL
  );

-- FASE 6: Métricas pós restauração
CREATE TEMP TABLE _qdiv_after AS
SELECT 
  COUNT(*) AS total,
  COUNT(DISTINCT tipo_codigo) AS tipos_distintos,
  COUNT(DISTINCT codigo) AS codigos_distintos,
  COUNT(DISTINCT categoria) AS categorias_distintas
FROM qualificacoes_historico
WHERE deleted_at IS NULL;

-- FASE 7: Relatório final (SELECTs deixam rastreabilidade no log de migration)
SELECT 'ANTES' AS fase, * FROM _qdiv_before;
SELECT 'BACKUP' AS fase, * FROM _qdiv_backup;
SELECT 'DEPOIS' AS fase, * FROM _qdiv_after;

-- FASE 8: Distribuição por tipo
SELECT qt.codigo, qt.nome, COUNT(q.id) AS total
FROM qualificacoes_historico q
JOIN qualificacoes_tipos qt ON q.qualificacao_id = qt.id
WHERE q.deleted_at IS NULL AND qt.deleted_at IS NULL
GROUP BY qt.id, qt.codigo, qt.nome
ORDER BY total DESC, qt.codigo ASC;

COMMIT;

-- Fim 0091