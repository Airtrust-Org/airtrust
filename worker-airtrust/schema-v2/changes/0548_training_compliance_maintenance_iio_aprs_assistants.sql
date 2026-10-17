-- Schema V2 0548: requirement for IIO/APRS training for maintenance assistants (tenant 6).
-- Training requirement only; never confers inspection or approval-to-return-to-service privileges.
-- Read-only D1 production baseline verified on 2026-10-10: one target model,
-- one assistant role (six active employees), two existing rules (mechanic and
-- engineering coordinator), no assistant rule. Fail closed on baseline drift.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-compliance-maintenance-iio-aprs-assistants-0548.md

SELECT json(CASE WHEN
  (SELECT COUNT(*) FROM qualificacoes_tipos
    WHERE empresa_id=6 AND codigo='MNT_IIO_APRS' AND ativo=1 AND deleted_at IS NULL)=1
  AND (SELECT COUNT(*) FROM funcoes
    WHERE empresa_id=6 AND nome='Auxiliar de Manutenção' AND ativo=1 AND deleted_at IS NULL)=1
  AND (SELECT COUNT(*) FROM funcionarios
    WHERE empresa_id=6 AND funcao_id=(SELECT id FROM funcoes WHERE empresa_id=6 AND nome='Auxiliar de Manutenção' AND ativo=1 AND deleted_at IS NULL)
      AND deleted_at IS NULL AND COALESCE(ativo,1)=1
      AND UPPER(COALESCE(NULLIF(TRIM(status),''),'ATIVO'))='ATIVO')=6
  AND (SELECT COUNT(*) FROM treinamento_requisitos tr
    JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id
    WHERE tr.empresa_id=6 AND qt.codigo='MNT_IIO_APRS'
      AND tr.ativo=1 AND tr.deleted_at IS NULL)=2
  AND (SELECT COUNT(*) FROM treinamento_requisitos tr
    JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id
    JOIN funcoes f ON f.id=tr.funcao_id AND f.empresa_id=tr.empresa_id
    WHERE tr.empresa_id=6 AND qt.codigo='MNT_IIO_APRS' AND tr.escopo='FUNCAO'
      AND f.nome='Mecânico' AND tr.obrigatoriedade='OBRIGATORIA'
      AND tr.ativo=1 AND tr.deleted_at IS NULL)=1
  AND (SELECT COUNT(*) FROM treinamento_requisitos tr
    JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id
    JOIN funcoes f ON f.id=tr.funcao_id AND f.empresa_id=tr.empresa_id
    WHERE tr.empresa_id=6 AND qt.codigo='MNT_IIO_APRS' AND tr.escopo='FUNCAO'
      AND f.nome='Coordenador de Engenharia' AND tr.obrigatoriedade='OBRIGATORIA'
      AND tr.ativo=1 AND tr.deleted_at IS NULL)=1
THEN 'null' ELSE 'IIO_APRS_0548_PREFLIGHT_REJECTED' END);

INSERT INTO treinamento_requisitos
 (empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,
  critico_operacional,origem,referencia_normativa,justificativa,
  fundamento_tipo,fundamento_documento,validade_fonte,modalidade_requerida,
  auto_matricular_ead,ativo,created_at,updated_at)
SELECT tr.empresa_id,tr.qualificacao_tipo_id,'FUNCAO',fa.id,tr.obrigatoriedade,
       tr.critico_operacional,tr.origem,tr.referencia_normativa,
       'Treinamento IIO/APRS obrigatório para Auxiliar de Manutenção; não concede atribuição técnica nem autorização para assinar inspeções ou retorno ao serviço.',
       tr.fundamento_tipo,tr.fundamento_documento,tr.validade_fonte,tr.modalidade_requerida,
       tr.auto_matricular_ead,1,datetime('now'),datetime('now')
  FROM treinamento_requisitos tr
  JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id
  JOIN funcoes fm ON fm.id=tr.funcao_id AND fm.empresa_id=tr.empresa_id
  JOIN funcoes fa ON fa.empresa_id=6 AND fa.nome='Auxiliar de Manutenção'
   AND fa.ativo=1 AND fa.deleted_at IS NULL
 WHERE tr.empresa_id=6 AND qt.codigo='MNT_IIO_APRS' AND fm.nome='Mecânico'
   AND tr.escopo='FUNCAO' AND tr.obrigatoriedade='OBRIGATORIA'
   AND tr.ativo=1 AND tr.deleted_at IS NULL
   AND NOT EXISTS (
      SELECT 1 FROM treinamento_requisitos existing
       WHERE existing.empresa_id=6 AND existing.qualificacao_tipo_id=tr.qualificacao_tipo_id
         AND existing.escopo='FUNCAO' AND existing.funcao_id=fa.id
         AND existing.ativo=1 AND existing.deleted_at IS NULL
   );
