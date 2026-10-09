-- 0544: reclassificacao pontual do historico AVSEC de Conscientizacao, empresa 6.
-- A classificacao AVSEC Corporativo foi confirmada pela Gerencia de Treinamento em 2026-10-08.
-- Fonte historica: id=5276, funcionario=111, tipo D1, anotacao do certificado Zurich.
-- dry_run_required: true; rollback_plan_required: schema-v2/plans/avsec-corporativo-historico-0544.md
-- Preserva PDF/referencia, datas, status, atributos documentais e evidencias de outros empregados.
UPDATE qualificacoes_historico
SET qualificacao_id = (
      SELECT id FROM qualificacoes_tipos
      WHERE empresa_id=6 AND codigo='AVSEC_CONSC' AND ativo=1 AND deleted_at IS NULL
    ),
    qualificacao_codigo = 'AVSEC_CONSC',
    updated_at = datetime('now')
WHERE id=5276 AND empresa_id=6 AND funcionario_id=111 AND deleted_at IS NULL
  AND qualificacao_id = (
    SELECT id FROM qualificacoes_tipos
    WHERE empresa_id=6 AND codigo='D1' AND ativo=1 AND deleted_at IS NULL
  )
  AND qualificacao_codigo='D1'
  AND status='CONCLUIDO'
  AND data_conclusao='2024-02-19'
  AND data_vencimento='2026-02-19'
  AND perfil_competencia IS NULL
  AND observacoes LIKE '%Conscientizacao AVSEC.pdf%'
  AND (SELECT COUNT(*) FROM qualificacoes_tipos WHERE empresa_id=6
       AND codigo='AVSEC_CONSC' AND ativo=1 AND deleted_at IS NULL)=1
  AND NOT EXISTS (
    SELECT 1 FROM qualificacoes_historico_perfis_competencia
    WHERE empresa_id=6 AND historico_id=5276 AND deleted_at IS NULL
  );
