-- 0539_training_doutrinacao_bootstrap.sql
-- Forward-only repair for the missing Costa do Sol Maintenance Indoctrination model.
-- Source: PRG-MNT-002 — Programa de Treinamento de Manutenção Rev.06 (14/03/2025), item 20.3.
-- Operational ordering: 0536 -> 0539 -> 0537 -> 0538.
-- Tenant scoped to empresa_id=6. No employee, enrollment, completion, certificate or history writes.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-doutrinacao-bootstrap-0539.md

UPDATE qualificacoes_tipos
   SET nome='Integração / Doutrinação de Manutenção',
       descricao='Integrar o profissional da Gerência de Manutenção à organização, legislação, políticas, manuais, procedimentos, responsabilidades e sistemática de trabalho da Costa do Sol.',
       conteudo_programatico='• Organização da Empresa — organograma
• Políticas corporativas e do SGI
• Atribuições e responsabilidades em MGM, MOM, MCQ e PTM
• Procedimentos de manutenção em MGM, MOM, MCQ e PTM
• Programa de Treinamento de Manutenção
• Conhecimentos gerais de legislação aeronáutica
• Rede interna e acesso a publicações técnicas',
       referencias='PRG-MNT-002 — Programa de Treinamento de Manutenção Rev.06, item 20.3
MNL-MNT-001 — MGM Rev.10
MNL-MNT-004 — MOM Rev.08
MNL-MNT-005 — MCQ Rev.08
RBAC 145
IS 145-010',
       observacoes='O PTM Rev.06 define a Doutrinação como treinamento único: mínimo de 8h no inicial e 4h no recorrente, a cada 36 meses ou antes quando houver requisito contratual ou necessidade da empresa. MGM, MOM e MCQ integram o conteúdo desta Doutrinação.',
       validade=36,
       carga_horaria=4,
       carga_horaria_inicial=8,
       carga_horaria_recorrente=4,
       ativo=1,
       deleted_at=NULL,
       updated_at=datetime('now')
 WHERE empresa_id=6
   AND UPPER(TRIM(codigo))='MNT_INTEGRACAO_DOUTRINACAO'
   AND id=(
     SELECT id FROM qualificacoes_tipos
      WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MNT_INTEGRACAO_DOUTRINACAO'
      ORDER BY CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END, id DESC
      LIMIT 1
   );

INSERT INTO qualificacoes_tipos
  (empresa_id,codigo,nome,descricao,conteudo_programatico,referencias,observacoes,
   categoria,categoria_id,area_id,validade,carga_horaria,carga_horaria_inicial,
   carga_horaria_recorrente,ativo,is_check,created_at,updated_at)
SELECT 6,
       'MNT_INTEGRACAO_DOUTRINACAO',
       'Integração / Doutrinação de Manutenção',
       'Integrar o profissional da Gerência de Manutenção à organização, legislação, políticas, manuais, procedimentos, responsabilidades e sistemática de trabalho da Costa do Sol.',
       '• Organização da Empresa — organograma
• Políticas corporativas e do SGI
• Atribuições e responsabilidades em MGM, MOM, MCQ e PTM
• Procedimentos de manutenção em MGM, MOM, MCQ e PTM
• Programa de Treinamento de Manutenção
• Conhecimentos gerais de legislação aeronáutica
• Rede interna e acesso a publicações técnicas',
       'PRG-MNT-002 — Programa de Treinamento de Manutenção Rev.06, item 20.3
MNL-MNT-001 — MGM Rev.10
MNL-MNT-004 — MOM Rev.08
MNL-MNT-005 — MCQ Rev.08
RBAC 145
IS 145-010',
       'O PTM Rev.06 define a Doutrinação como treinamento único: mínimo de 8h no inicial e 4h no recorrente, a cada 36 meses ou antes quando houver requisito contratual ou necessidade da empresa. MGM, MOM e MCQ integram o conteúdo desta Doutrinação.',
       src.categoria,src.categoria_id,src.area_id,36,4,8,4,1,0,datetime('now'),datetime('now')
  FROM qualificacoes_tipos src
 WHERE src.empresa_id=6
   AND UPPER(TRIM(src.codigo))='MNT_MGM'
   AND src.ativo=1 AND src.deleted_at IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM qualificacoes_tipos q
      WHERE q.empresa_id=6
        AND UPPER(TRIM(q.codigo))='MNT_INTEGRACAO_DOUTRINACAO'
   )
 LIMIT 1;
