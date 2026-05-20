-- Merge incremental from _backup_qualificacoes_historico into qualificacoes_historico
-- Criteria: numero_certificado uniqueness; if missing in main, insert.
-- Maps tipo_codigo -> qualificacoes_tipos.id when possible.
BEGIN TRANSACTION;

-- Temp lookup for tipo ids by codigo
CREATE TEMP TABLE IF NOT EXISTS _tipos_map AS
SELECT codigo, id FROM qualificacoes_tipos WHERE deleted_at IS NULL;

-- Insert missing
INSERT INTO qualificacoes_historico (
  funcionario_id,
  qualificacao_id,
  tipo_codigo,
  codigo,
  categoria,
  validade,
  numero_certificado,
  observacoes,
  arquivo_url,
  created_at,
  updated_at,
  data_conclusao,
  data_vencimento,
  validade_meses,
  instrutor,
  local,
  modalidade,
  nota,
  carga_horaria
)
SELECT 
  b.funcionario_id,
  COALESCE(tm.id, b.qualificacao_id, 0) as qualificacao_id,
  b.tipo_codigo,
  b.codigo,
  b.categoria,
  b.validade,
  b.numero_certificado,
  b.observacoes,
  b.arquivo_url,
  b.created_at,
  b.updated_at,
  b.created_at as data_conclusao,
  CASE 
    WHEN b.validade GLOB '[0-9][0-9][0-9][0-9]-*' THEN b.validade
    ELSE NULL
  END as data_vencimento,
  NULL as validade_meses,
  NULL as instrutor,
  NULL as local,
  NULL as modalidade,
  NULL as nota,
  NULL as carga_horaria
FROM _backup_qualificacoes_historico b
LEFT JOIN qualificacoes_historico q ON q.numero_certificado = b.numero_certificado
LEFT JOIN _tipos_map tm ON tm.codigo = b.tipo_codigo
WHERE q.id IS NULL AND (b.deleted_at IS NULL OR b.deleted_at IS NULL);

DROP TABLE IF EXISTS _tipos_map;
COMMIT;
