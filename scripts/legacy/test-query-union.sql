-- Teste da query unificada
WITH dados_unificados AS (
  -- Dados de qualificacoes_historico (schema legado)
  SELECT 
    qh.id,
    qh.funcionario_id,
    qh.qualificacao_id,
    qh.nome as qualificacao_nome,
    qh.codigo,
    qh.tipo as qualificacao_tipo,
    qh.data_conclusao as data_emissao,
    qh.data_vencimento as data_validade,
    qh.certificado_numero,
    qh.certificado_url,
    qh.observacoes,
    qh.status,
    qh.carga_horaria,
    qh.nota as nota_final,
    qh.resultado,
    qh.instrutor,
    qh.checador,
    qh.local,
    NULL as timezone,
    0 as eh_renovada,
    NULL as habilitacao_anterior_id,
    NULL as renovada_em,
    qh.created_at,
    qh.updated_at,
    'historico' as origem
  FROM qualificacoes_historico qh
  WHERE qh.deleted_at IS NULL
  LIMIT 5
)
SELECT 
  du.*,
  f.nome as funcionario_nome,
  f.matricula as funcionario_matricula,
  f.cargo as funcionario_cargo
FROM dados_unificados du
LEFT JOIN funcionarios f ON CAST(f.id AS TEXT) = du.funcionario_id AND f.deleted_at IS NULL
LIMIT 3;
