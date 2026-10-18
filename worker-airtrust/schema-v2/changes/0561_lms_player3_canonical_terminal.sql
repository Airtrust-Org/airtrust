-- Schema V2 0561 CANDIDATE. DO NOT APPLY without explicit staging authorization.
-- Depends on governed 0558 + 0559 + 0560, verified exact target schema.
-- Native/Player3 terminal intents are distinct; no canonical completion is executed.
SELECT json(CASE WHEN
 (SELECT foreign_keys FROM pragma_foreign_keys)=1
 AND (SELECT COUNT(*) FROM sqlite_master WHERE type='table'
      AND name IN ('lms_native_enrollment_intents','lms_native_uncommittable_intent_guard',
                   'lms_native_matricula_edicoes','lms_native_eventos','lms_native_tentativas'))=5
 AND (SELECT COUNT(*) FROM sqlite_master WHERE type='trigger'
      AND name IN ('trg_native_catalog_no_ungoverned_matricula_completion_update',
                   'trg_native_catalog_no_ungoverned_cycle_completion_update'))=2
 AND (SELECT COUNT(*) FROM sqlite_master WHERE name IN ('lms_native_completion_intents','lms_player3_completion_intents'))=0
 AND (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('lms_player3_politicas','lms_player3_tentativas_modulares'))=2
 AND (SELECT COUNT(*) FROM pragma_table_info('qualificacoes_categorias')
      WHERE name='lms_integrada')=1
THEN 'null' ELSE 'NATIVE_0561_CANDIDATE_PREFLIGHT_DENIED' END);

-- A matching one-transaction intent is required by both terminal UPDATE
-- triggers below. The deferred FK to an unfillable sentinel enforces
-- removal BEFORE COMMIT, including when a canonical history was inserted.
CREATE TABLE lms_native_completion_intents(
 nonce TEXT PRIMARY KEY CHECK(length(nonce)=64 AND nonce NOT GLOB '*[^a-f0-9]*'),
 empresa_id INTEGER NOT NULL,
 curso_id INTEGER NOT NULL,
 matricula_id INTEGER NOT NULL,
 ciclo_id INTEGER NOT NULL,
 funcionario_id INTEGER NOT NULL,
 actor_user_id INTEGER NOT NULL,
 edicao_id INTEGER NOT NULL,
 vinculo_id INTEGER NOT NULL,
 tentativa_id INTEGER NOT NULL,
 tentativa_numero INTEGER NOT NULL,
 answers_sha256 TEXT NOT NULL CHECK(length(answers_sha256)=64),
 score_pct REAL,
 event_count INTEGER NOT NULL CHECK(event_count>0),
 distinct_lesson_count INTEGER NOT NULL CHECK(distinct_lesson_count>0),
 gerar_qualificacao INTEGER NOT NULL CHECK(gerar_qualificacao IN (0,1)),
 qualificacao_tipo_id INTEGER,
 qualificacao_categoria_id INTEGER,
 uncommittable INTEGER NOT NULL DEFAULT 1
   REFERENCES lms_native_uncommittable_intent_guard(id)
   DEFERRABLE INITIALLY DEFERRED,
 CHECK(
   (gerar_qualificacao=0 AND qualificacao_tipo_id IS NULL AND qualificacao_categoria_id IS NULL)
   OR (gerar_qualificacao=1 AND qualificacao_tipo_id>0 AND qualificacao_categoria_id>0)
 )
);

CREATE TRIGGER trg_native_terminal_intent_insert_scope
BEFORE INSERT ON lms_native_completion_intents
BEGIN
 SELECT RAISE(ABORT,'NATIVE_TERMINAL_INTENT_SCOPE_DENIED') WHERE NOT EXISTS(
  SELECT 1
  FROM lms_matriculas m
  JOIN lms_matricula_ciclos cy ON cy.id=NEW.ciclo_id
    AND cy.matricula_id=m.id AND cy.empresa_id=m.empresa_id
    AND cy.curso_id=m.curso_id AND cy.funcionario_id=m.funcionario_id
    AND cy.ciclo_atual=1 AND cy.status='EM_ANDAMENTO' AND cy.deleted_at IS NULL
  JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
    AND c.tipo_conteudo='scorm' AND c.ativo=1 AND c.publicado=1 AND c.deleted_at IS NULL
  JOIN lms_native_catalog_activation a ON a.curso_id=c.id AND a.empresa_id=c.empresa_id
  JOIN usuarios u ON u.id=NEW.actor_user_id AND u.funcionario_id=m.funcionario_id
    AND u.active=1 AND u.deleted_at IS NULL
  JOIN funcionarios f ON f.id=m.funcionario_id AND f.empresa_id=m.empresa_id
    AND f.ativo=1 AND f.deleted_at IS NULL
    AND UPPER(COALESCE(NULLIF(TRIM(f.status),''),'ATIVO'))='ATIVO'
  JOIN lms_native_matricula_edicoes b ON b.id=NEW.vinculo_id
    AND b.matricula_id=m.id AND b.ciclo_id=cy.id
    AND b.empresa_id=m.empresa_id AND b.curso_id=m.curso_id
  JOIN lms_native_edicoes ed ON ed.id=NEW.edicao_id
    AND ed.id=b.edicao_id AND ed.curso_id=b.curso_id
    AND ed.empresa_id=b.empresa_id AND ed.status='PUBLISHED'
  JOIN lms_native_tentativas att ON att.id=NEW.tentativa_id
    AND att.vinculo_id=b.id AND att.tentativa_numero=NEW.tentativa_numero
    AND att.answers_sha256=NEW.answers_sha256
    AND att.score_pct IS NEW.score_pct AND att.assessment_satisfied=1
  WHERE m.id=NEW.matricula_id AND m.empresa_id=NEW.empresa_id
    AND m.curso_id=NEW.curso_id AND m.funcionario_id=NEW.funcionario_id
    AND m.status='EM_ANDAMENTO' AND m.deleted_at IS NULL
    AND m.data_conclusao IS NULL AND cy.data_conclusao IS NULL
    AND c.gerar_qualificacao_ao_concluir=NEW.gerar_qualificacao
    AND (NEW.gerar_qualificacao=0 OR
         COALESCE(c.qualificacao_tipo_id,0)=COALESCE(NEW.qualificacao_tipo_id,0))
    AND (NEW.gerar_qualificacao=0 OR EXISTS(
      SELECT 1 FROM qualificacoes_tipos qt
      JOIN qualificacoes_categorias qc ON qc.id=qt.categoria_id
        AND qc.empresa_id=qt.empresa_id AND qc.ativo=1 AND qc.deleted_at IS NULL
        AND qc.lms_integrada=1
      WHERE qt.id=NEW.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id
        AND qt.ativo=1 AND qt.deleted_at IS NULL
        AND qc.id=NEW.qualificacao_categoria_id
    ))
    AND (SELECT COUNT(*) FROM lms_native_eventos ev WHERE ev.vinculo_id=b.id)=NEW.event_count
    AND (SELECT COUNT(DISTINCT ev.unidade_id) FROM lms_native_eventos ev
         WHERE ev.vinculo_id=b.id)=NEW.distinct_lesson_count
    AND NOT EXISTS(SELECT 1 FROM lms_native_tentativas newer
                   WHERE newer.vinculo_id=b.id
                   AND newer.tentativa_numero>NEW.tentativa_numero)
 );
END;

CREATE TRIGGER trg_native_terminal_intent_no_update
BEFORE UPDATE ON lms_native_completion_intents
BEGIN SELECT RAISE(ABORT,'NATIVE_TERMINAL_INTENT_IMMUTABLE'); END;


-- Separate certification authority: Player3 must never invent a Native V1
-- single global assessment. Every module receipt remains independently pinned.
CREATE TABLE lms_player3_completion_intents (
 nonce TEXT PRIMARY KEY CHECK(length(nonce)=64 AND nonce NOT GLOB '*[^a-f0-9]*'),
 empresa_id INTEGER NOT NULL,curso_id INTEGER NOT NULL,
 matricula_id INTEGER NOT NULL,ciclo_id INTEGER NOT NULL,
 funcionario_id INTEGER NOT NULL,actor_user_id INTEGER NOT NULL,
 vinculo_id INTEGER NOT NULL,edicao_id INTEGER NOT NULL,
 politica_id INTEGER NOT NULL,
 edition_sha256 TEXT NOT NULL CHECK(length(edition_sha256)=64),
 source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
 bank_sha256 TEXT NOT NULL CHECK(length(bank_sha256)=64),
 policy_sha256 TEXT NOT NULL CHECK(length(policy_sha256)=64),
 required_lesson_ids_json TEXT NOT NULL CHECK(json_valid(required_lesson_ids_json)=1),
 official_stage_receipts_json TEXT NOT NULL CHECK(json_valid(official_stage_receipts_json)=1),
 event_count INTEGER NOT NULL CHECK(event_count BETWEEN 1 AND 10000),
 distinct_lesson_count INTEGER NOT NULL CHECK(distinct_lesson_count BETWEEN 1 AND 500),
 official_stage_count INTEGER NOT NULL CHECK(official_stage_count BETWEEN 1 AND 100),
 gerar_qualificacao INTEGER NOT NULL CHECK(gerar_qualificacao IN (0,1)),
 qualificacao_tipo_id INTEGER, qualificacao_categoria_id INTEGER,
 uncommittable INTEGER NOT NULL DEFAULT 1
  REFERENCES lms_native_uncommittable_intent_guard(id)
  DEFERRABLE INITIALLY DEFERRED,
 CHECK((gerar_qualificacao=0 AND qualificacao_tipo_id IS NULL AND qualificacao_categoria_id IS NULL)
   OR (gerar_qualificacao=1 AND qualificacao_tipo_id>0 AND qualificacao_categoria_id>0))
);
CREATE TRIGGER trg_player3_terminal_intent_scope
BEFORE INSERT ON lms_player3_completion_intents
BEGIN
 SELECT RAISE(ABORT,'PLAYER3_TERMINAL_INTENT_SCOPE_DENIED') WHERE NOT EXISTS(
  SELECT 1 FROM lms_matriculas m
  JOIN lms_matricula_ciclos cy ON cy.id=NEW.ciclo_id AND cy.matricula_id=m.id
   AND cy.empresa_id=m.empresa_id AND cy.curso_id=m.curso_id
   AND cy.funcionario_id=m.funcionario_id AND cy.ciclo_atual=1
   AND cy.status='EM_ANDAMENTO' AND cy.deleted_at IS NULL
  JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
   AND c.ativo=1 AND c.publicado=1 AND c.deleted_at IS NULL
   AND EXISTS(SELECT 1 FROM lms_native_catalog_activation a
    WHERE a.empresa_id=c.empresa_id AND a.curso_id=c.id)
  JOIN usuarios u ON u.id=NEW.actor_user_id AND u.funcionario_id=m.funcionario_id
   AND u.active=1 AND u.deleted_at IS NULL
  JOIN funcionarios f ON f.id=m.funcionario_id AND f.empresa_id=m.empresa_id
   AND f.ativo=1 AND f.deleted_at IS NULL
   AND UPPER(COALESCE(NULLIF(TRIM(f.status),''),'ATIVO'))='ATIVO'
  JOIN lms_native_matricula_edicoes b ON b.id=NEW.vinculo_id
   AND b.matricula_id=m.id AND b.ciclo_id=cy.id
   AND b.empresa_id=m.empresa_id AND b.curso_id=m.curso_id
  JOIN lms_native_edicoes ed ON ed.id=NEW.edicao_id AND ed.id=b.edicao_id
   AND ed.empresa_id=b.empresa_id AND ed.curso_id=b.curso_id
   AND ed.artifact_sha256=NEW.edition_sha256 AND ed.status='PUBLISHED'
  JOIN lms_player3_politicas p ON p.id=NEW.politica_id AND p.edicao_id=ed.id
   AND p.empresa_id=b.empresa_id AND p.curso_id=b.curso_id AND p.estado='APPROVED'
   AND p.source_sha256=NEW.source_sha256 AND p.bank_sha256=NEW.bank_sha256
   AND p.policy_sha256=NEW.policy_sha256
  WHERE m.id=NEW.matricula_id AND m.empresa_id=NEW.empresa_id
   AND m.curso_id=NEW.curso_id AND m.funcionario_id=NEW.funcionario_id
   AND m.status='EM_ANDAMENTO' AND m.deleted_at IS NULL
   AND m.data_conclusao IS NULL AND cy.data_conclusao IS NULL
   AND c.gerar_qualificacao_ao_concluir=NEW.gerar_qualificacao
   AND (NEW.gerar_qualificacao=0 OR c.qualificacao_tipo_id=NEW.qualificacao_tipo_id)
   AND (NEW.gerar_qualificacao=0 OR EXISTS(
    SELECT 1 FROM qualificacoes_tipos qt
    JOIN qualificacoes_categorias qc ON qc.id=qt.categoria_id AND qc.empresa_id=qt.empresa_id
     AND qc.ativo=1 AND qc.deleted_at IS NULL AND qc.lms_integrada=1
    WHERE qt.id=NEW.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id
     AND qt.ativo=1 AND qt.deleted_at IS NULL AND qc.id=NEW.qualificacao_categoria_id))
   AND (SELECT COUNT(*) FROM lms_native_eventos e WHERE e.vinculo_id=b.id)=NEW.event_count
   AND (SELECT COUNT(DISTINCT e.unidade_id) FROM lms_native_eventos e
     WHERE e.vinculo_id=b.id)=NEW.distinct_lesson_count
   AND json_array_length(NEW.required_lesson_ids_json)=NEW.distinct_lesson_count
   AND (SELECT COUNT(DISTINCT value) FROM json_each(NEW.required_lesson_ids_json))=NEW.distinct_lesson_count
   AND NOT EXISTS(SELECT 1 FROM json_each(NEW.required_lesson_ids_json) lesson
     WHERE NOT EXISTS(SELECT 1 FROM lms_native_eventos e
      WHERE e.vinculo_id=b.id AND e.unidade_id=lesson.value))
   AND json_array_length(NEW.official_stage_receipts_json)=NEW.official_stage_count
   AND (SELECT COUNT(DISTINCT json_extract(value,'$.stageId'))
        FROM json_each(NEW.official_stage_receipts_json))=NEW.official_stage_count
   AND NOT EXISTS(SELECT 1 FROM json_each(NEW.official_stage_receipts_json) stage
     WHERE NOT EXISTS(SELECT 1 FROM lms_player3_tentativas_modulares t
      WHERE t.vinculo_id=b.id AND t.politica_id=p.id AND t.passed=1
       AND t.etapa_id=json_extract(stage.value,'$.stageId')
       AND t.id=json_extract(stage.value,'$.attemptId')
       AND t.tentativa_numero=json_extract(stage.value,'$.attemptNumber')
       AND t.answers_sha256=json_extract(stage.value,'$.answersHash')
       AND t.score_pct=json_extract(stage.value,'$.scorePct')))
   AND (SELECT COUNT(DISTINCT t.etapa_id) FROM lms_player3_tentativas_modulares t
     WHERE t.vinculo_id=b.id AND t.politica_id=p.id)=NEW.official_stage_count
 );
END;
CREATE TRIGGER trg_player3_terminal_intent_no_update
BEFORE UPDATE ON lms_player3_completion_intents
BEGIN SELECT RAISE(ABORT,'PLAYER3_TERMINAL_INTENT_IMMUTABLE'); END;

-- INSERT of terminal enrollment/cycle remains forbidden by 0551. Only
-- authenticated, version-pinned existing rows may transition to CONCLUIDO.
DROP TRIGGER trg_native_catalog_no_ungoverned_matricula_completion_update;
CREATE TRIGGER trg_native_catalog_no_ungoverned_matricula_completion_update
BEFORE UPDATE OF status,progresso_pct,data_conclusao,qualificacao_historico_id
ON lms_matriculas
WHEN EXISTS(SELECT 1 FROM lms_native_catalog_activation a
  WHERE a.curso_id=NEW.curso_id AND a.empresa_id=NEW.empresa_id)
AND (NEW.status='CONCLUIDO' OR COALESCE(NEW.progresso_pct,0)>=100
  OR NEW.data_conclusao IS NOT NULL OR NEW.qualificacao_historico_id IS NOT NULL)
AND NOT EXISTS(
 SELECT 1 FROM lms_native_completion_intents i
 WHERE i.matricula_id=NEW.id AND i.empresa_id=NEW.empresa_id
  AND i.curso_id=NEW.curso_id AND i.funcionario_id=NEW.funcionario_id
  AND i.ciclo_id=(SELECT cy.id FROM lms_matricula_ciclos cy
   WHERE cy.matricula_id=NEW.id AND cy.empresa_id=NEW.empresa_id
     AND cy.curso_id=NEW.curso_id AND cy.ciclo_atual=1
     AND cy.deleted_at IS NULL ORDER BY cy.id DESC LIMIT 1)
)
AND NOT EXISTS(SELECT 1 FROM lms_player3_completion_intents p
 WHERE p.empresa_id=NEW.empresa_id AND p.curso_id=NEW.curso_id
  AND p.funcionario_id=NEW.funcionario_id AND p.matricula_id=NEW.id
  AND p.ciclo_id=(SELECT cy.id FROM lms_matricula_ciclos cy WHERE cy.matricula_id=NEW.id AND cy.empresa_id=NEW.empresa_id AND cy.ciclo_atual=1 AND cy.deleted_at IS NULL ORDER BY cy.id DESC LIMIT 1))
BEGIN SELECT RAISE(ABORT,'NATIVE_CATALOG_COMPLETION_NOT_GOVERNED'); END;

DROP TRIGGER trg_native_catalog_no_ungoverned_cycle_completion_update;
CREATE TRIGGER trg_native_catalog_no_ungoverned_cycle_completion_update
BEFORE UPDATE OF status,progresso_pct,data_conclusao,qualificacao_historico_id
ON lms_matricula_ciclos
WHEN EXISTS(SELECT 1 FROM lms_native_catalog_activation a
  WHERE a.curso_id=NEW.curso_id AND a.empresa_id=NEW.empresa_id)
AND (NEW.status='CONCLUIDO' OR COALESCE(NEW.progresso_pct,0)>=100
  OR NEW.data_conclusao IS NOT NULL OR NEW.qualificacao_historico_id IS NOT NULL)
AND NOT EXISTS(
 SELECT 1 FROM lms_native_completion_intents i
 WHERE i.ciclo_id=NEW.id AND i.matricula_id=NEW.matricula_id
  AND i.empresa_id=NEW.empresa_id AND i.curso_id=NEW.curso_id
  AND i.funcionario_id=NEW.funcionario_id
)
AND NOT EXISTS(SELECT 1 FROM lms_player3_completion_intents p
 WHERE p.empresa_id=NEW.empresa_id AND p.curso_id=NEW.curso_id
  AND p.funcionario_id=NEW.funcionario_id AND p.matricula_id=NEW.matricula_id
  AND p.ciclo_id=NEW.id)
BEGIN SELECT RAISE(ABORT,'NATIVE_CATALOG_COMPLETION_NOT_GOVERNED'); END;
