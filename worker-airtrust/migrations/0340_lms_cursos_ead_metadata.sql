-- 0340_lms_cursos_ead_metadata.sql
-- Expande o catálogo LMS com metadados curriculares espelhados dos tipos EAD
-- e cria cursos rascunho faltantes para cada tipo de qualificação EAD.

ALTER TABLE lms_cursos ADD COLUMN conteudo_programatico TEXT;
ALTER TABLE lms_cursos ADD COLUMN observacoes TEXT;
ALTER TABLE lms_cursos ADD COLUMN carga_horaria_inicial_horas REAL;
ALTER TABLE lms_cursos ADD COLUMN carga_horaria_recorrente_horas REAL;

UPDATE lms_cursos
SET descricao = COALESCE(
      NULLIF(TRIM(descricao), ''),
      (
        SELECT NULLIF(TRIM(qt.descricao), '')
        FROM qualificacoes_tipos qt
        WHERE qt.id = lms_cursos.qualificacao_tipo_id
          AND qt.deleted_at IS NULL
      )
    ),
    categoria = COALESCE(
      NULLIF(TRIM(categoria), ''),
      (
        SELECT NULLIF(TRIM(qt.categoria), '')
        FROM qualificacoes_tipos qt
        WHERE qt.id = lms_cursos.qualificacao_tipo_id
          AND qt.deleted_at IS NULL
      )
    ),
    carga_horaria_minutos = CASE
      WHEN COALESCE(carga_horaria_minutos, 0) > 0 THEN carga_horaria_minutos
      ELSE COALESCE(
        (
          SELECT CAST(
            ROUND(
              COALESCE(qt.carga_horaria_recorrente, qt.carga_horaria_inicial, qt.carga_horaria, 0) * 60
            ) AS INTEGER
          )
          FROM qualificacoes_tipos qt
          WHERE qt.id = lms_cursos.qualificacao_tipo_id
            AND qt.deleted_at IS NULL
        ),
        0
      )
    END,
    conteudo_programatico = COALESCE(
      NULLIF(TRIM(conteudo_programatico), ''),
      (
        SELECT NULLIF(TRIM(qt.conteudo_programatico), '')
        FROM qualificacoes_tipos qt
        WHERE qt.id = lms_cursos.qualificacao_tipo_id
          AND qt.deleted_at IS NULL
      )
    ),
    observacoes = COALESCE(
      NULLIF(TRIM(observacoes), ''),
      (
        SELECT NULLIF(TRIM(qt.observacoes), '')
        FROM qualificacoes_tipos qt
        WHERE qt.id = lms_cursos.qualificacao_tipo_id
          AND qt.deleted_at IS NULL
      )
    ),
    carga_horaria_inicial_horas = COALESCE(
      carga_horaria_inicial_horas,
      (
        SELECT qt.carga_horaria_inicial
        FROM qualificacoes_tipos qt
        WHERE qt.id = lms_cursos.qualificacao_tipo_id
          AND qt.deleted_at IS NULL
      )
    ),
    carga_horaria_recorrente_horas = COALESCE(
      carga_horaria_recorrente_horas,
      (
        SELECT qt.carga_horaria_recorrente
        FROM qualificacoes_tipos qt
        WHERE qt.id = lms_cursos.qualificacao_tipo_id
          AND qt.deleted_at IS NULL
      )
    )
WHERE qualificacao_tipo_id IS NOT NULL
  AND deleted_at IS NULL;

INSERT INTO lms_cursos (
  empresa_id,
  titulo,
  descricao,
  categoria,
  carga_horaria_minutos,
  idioma,
  tipo_conteudo,
  scorm_versao,
  scorm_mastery_score,
  qualificacao_tipo_id,
  gerar_qualificacao_ao_concluir,
  publicado,
  conteudo_programatico,
  observacoes,
  carga_horaria_inicial_horas,
  carga_horaria_recorrente_horas
)
SELECT
  qt.empresa_id,
  qt.nome,
  NULLIF(TRIM(qt.descricao), ''),
  NULLIF(TRIM(qt.categoria), ''),
  CAST(
    ROUND(COALESCE(qt.carga_horaria_recorrente, qt.carga_horaria_inicial, qt.carga_horaria, 0) * 60)
    AS INTEGER
  ),
  'pt-BR',
  'scorm',
  '1.2',
  70,
  qt.id,
  1,
  0,
  NULLIF(TRIM(qt.conteudo_programatico), ''),
  NULLIF(TRIM(qt.observacoes), ''),
  qt.carga_horaria_inicial,
  qt.carga_horaria_recorrente
FROM qualificacoes_tipos qt
WHERE qt.deleted_at IS NULL
  AND UPPER(TRIM(COALESCE(qt.categoria, ''))) IN ('EAD', 'TREINAMENTO EAD')
  AND NOT EXISTS (
    SELECT 1
    FROM lms_cursos c
    WHERE c.qualificacao_tipo_id = qt.id
      AND c.deleted_at IS NULL
  );