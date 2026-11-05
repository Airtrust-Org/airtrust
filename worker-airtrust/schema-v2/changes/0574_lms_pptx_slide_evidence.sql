-- Schema V2 0574: immutable PPTX slide-consumption evidence.
-- Additive only. Existing enrollment progress is NOT backfilled or treated as proof.
CREATE TABLE lms_pptx_slide_evidences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL CHECK(empresa_id > 0),
  matricula_id INTEGER NOT NULL REFERENCES lms_matriculas(id),
  curso_id INTEGER NOT NULL REFERENCES lms_cursos(id),
  funcionario_id INTEGER NOT NULL REFERENCES funcionarios(id),
  ciclo_id INTEGER NOT NULL REFERENCES lms_matricula_ciclos(id),
  content_sha256 TEXT NOT NULL CHECK(length(content_sha256)=64 AND content_sha256 NOT GLOB '*[^0-9a-f]*'),
  slide_index INTEGER NOT NULL CHECK(slide_index >= 0 AND slide_index < 1000),
  total_slides INTEGER NOT NULL CHECK(total_slides BETWEEN 1 AND 1000 AND slide_index < total_slides),
  server_received_at TEXT NOT NULL,
  UNIQUE(empresa_id, matricula_id, ciclo_id, content_sha256, slide_index)
);
CREATE INDEX idx_lms_pptx_slide_evidences_scope
  ON lms_pptx_slide_evidences(empresa_id,matricula_id,ciclo_id,content_sha256,slide_index);

-- Enforce tenant, owner, current attempt, asset type and authoritative slide count
-- at the D1 boundary even if a future caller bypasses the route.
CREATE TRIGGER trg_lms_pptx_evidence_insert_scope
BEFORE INSERT ON lms_pptx_slide_evidences
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM lms_matriculas m
    JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
    JOIN lms_matricula_ciclos cy ON cy.matricula_id=m.id AND cy.empresa_id=m.empresa_id
      AND cy.curso_id=m.curso_id AND cy.funcionario_id=m.funcionario_id
      AND cy.ciclo_atual=1 AND cy.deleted_at IS NULL
    WHERE m.id=NEW.matricula_id AND m.empresa_id=NEW.empresa_id
      AND m.curso_id=NEW.curso_id AND m.funcionario_id=NEW.funcionario_id
      AND cy.id=NEW.ciclo_id AND m.deleted_at IS NULL
      AND m.status IN ('NAO_INICIADO','EM_ANDAMENTO')
      AND c.deleted_at IS NULL AND c.ativo=1 AND c.publicado=1
      AND c.tipo_conteudo='pptx' AND c.gerar_qualificacao_ao_concluir=1
      AND c.pptx_slide_count=NEW.total_slides
  ) THEN RAISE(ABORT,'PPTX_EVIDENCE_SCOPE_INVALID') END;
END;
CREATE TRIGGER trg_lms_pptx_evidence_immutable_update
BEFORE UPDATE ON lms_pptx_slide_evidences
BEGIN SELECT RAISE(ABORT,'PPTX_EVIDENCE_IMMUTABLE'); END;
CREATE TRIGGER trg_lms_pptx_evidence_immutable_delete
BEFORE DELETE ON lms_pptx_slide_evidences
BEGIN SELECT RAISE(ABORT,'PPTX_EVIDENCE_IMMUTABLE'); END;
