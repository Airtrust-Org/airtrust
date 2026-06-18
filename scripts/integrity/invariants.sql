-- id: I1
-- severity: P0
-- title: Modelos ativos ou em uso sem manobras
-- required_tables: modelos_sessao,modelos_sessao_manobras
-- required_columns: modelos_sessao.id,modelos_sessao.codigo,modelos_sessao.ativo,modelos_sessao.deleted_at,modelos_sessao_manobras.modelo_id,modelos_sessao_manobras.manobra_id,modelos_sessao_manobras.deleted_at,fichas_sessao.template_id,fichas_sessao.deleted_at
SELECT
  ms.id AS modelo_id,
  ms.codigo,
  COUNT(msm.manobra_id) AS total_manobras
FROM modelos_sessao ms
LEFT JOIN modelos_sessao_manobras msm
  ON msm.modelo_id = ms.id
 AND msm.deleted_at IS NULL
WHERE ms.deleted_at IS NULL
  AND (
    COALESCE(ms.ativo, 1) = 1
    OR EXISTS (
      SELECT 1
      FROM fichas_sessao fs
      WHERE fs.template_id = ms.id
        AND fs.deleted_at IS NULL
    )
  )
GROUP BY ms.id, ms.codigo
HAVING COUNT(msm.manobra_id) = 0;

-- id: I1b
-- severity: P1
-- title: Canario de volume de modelos_sessao_manobras abaixo do baseline
-- required_tables: modelos_sessao_manobras
-- required_columns: modelos_sessao_manobras.modelo_id,modelos_sessao_manobras.manobra_id,modelos_sessao_manobras.deleted_at
-- baseline_metric: total_relacoes
SELECT COUNT(*) AS total_relacoes
FROM modelos_sessao_manobras
WHERE deleted_at IS NULL;

-- id: I2
-- severity: P0
-- title: Fichas finais sem manobras
-- required_tables: fichas_sessao,fichas_sessao_manobras
-- required_columns: fichas_sessao.id,fichas_sessao.status,fichas_sessao.empresa_id,fichas_sessao.deleted_at,fichas_sessao_manobras.ficha_id,fichas_sessao_manobras.deleted_at
SELECT
  fs.id AS ficha_id,
  fs.empresa_id,
  fs.status,
  COUNT(fsm.ficha_id) AS total_manobras
FROM fichas_sessao fs
LEFT JOIN fichas_sessao_manobras fsm
  ON fsm.ficha_id = fs.id
 AND fsm.deleted_at IS NULL
WHERE fs.deleted_at IS NULL
  AND UPPER(COALESCE(fs.status, '')) IN (
    'AGUARDANDO_ASSINATURA_ALUNO',
    'AGUARDANDO_ASSINATURA_INSTRUTOR',
    'ASSINADO',
    'CONCLUIDO'
  )
GROUP BY fs.id, fs.empresa_id, fs.status
HAVING COUNT(fsm.ficha_id) = 0;

-- id: I2b
-- severity: P1
-- title: Fichas finais com manobra sem resultado
-- required_tables: fichas_sessao,fichas_sessao_manobras
-- required_columns: fichas_sessao.id,fichas_sessao.status,fichas_sessao.deleted_at,fichas_sessao_manobras.ficha_id,fichas_sessao_manobras.resultado,fichas_sessao_manobras.deleted_at
-- skip_if_schema_unconfirmed: true
SELECT
  fs.id AS ficha_id,
  fs.status,
  fsm.ordem,
  fsm.resultado
FROM fichas_sessao fs
JOIN fichas_sessao_manobras fsm
  ON fsm.ficha_id = fs.id
 AND fsm.deleted_at IS NULL
WHERE fs.deleted_at IS NULL
  AND UPPER(COALESCE(fs.status, '')) IN (
    'AGUARDANDO_ASSINATURA_ALUNO',
    'AGUARDANDO_ASSINATURA_INSTRUTOR',
    'ASSINADA',
    'ASSINADO',
    'CONCLUIDA',
    'CONCLUIDO'
  )
  AND (
    fsm.resultado IS NULL
    OR TRIM(COALESCE(fsm.resultado, '')) = ''
    OR UPPER(TRIM(COALESCE(fsm.resultado, ''))) = 'NAO_REALIZADA'
  );

-- id: I3b
-- severity: P0
-- title: Ordem duplicada por modelo
-- required_tables: modelos_sessao_manobras
-- required_columns: modelos_sessao_manobras.modelo_id,modelos_sessao_manobras.ordem,modelos_sessao_manobras.deleted_at
SELECT
  modelo_id,
  ordem,
  COUNT(*) AS total
FROM modelos_sessao_manobras
WHERE deleted_at IS NULL
GROUP BY modelo_id, ordem
HAVING COUNT(*) > 1;

-- id: I4
-- severity: P0
-- title: Relacao modelo-manobra cross-tenant
-- required_tables: modelos_sessao,modelos_sessao_manobras,manobras
-- required_columns: modelos_sessao.id,modelos_sessao.empresa_id,modelos_sessao.deleted_at,modelos_sessao_manobras.modelo_id,modelos_sessao_manobras.manobra_id,modelos_sessao_manobras.deleted_at,manobras.id,manobras.empresa_id,manobras.deleted_at
-- skip_if_schema_unconfirmed: true
SELECT
  ms.id AS modelo_id,
  ms.empresa_id AS modelo_empresa_id,
  m.id AS manobra_id,
  m.empresa_id AS manobra_empresa_id
FROM modelos_sessao_manobras msm
JOIN modelos_sessao ms
  ON ms.id = msm.modelo_id
 AND ms.deleted_at IS NULL
JOIN manobras m
  ON m.id = msm.manobra_id
 AND m.deleted_at IS NULL
WHERE msm.deleted_at IS NULL
  AND ms.empresa_id IS NOT NULL
  AND m.empresa_id IS NOT NULL
  AND ms.empresa_id <> m.empresa_id;

-- id: I5
-- severity: P1
-- title: Qualificacao ativa cross-tenant ou status final sem data
-- required_tables: qualificacoes_historico,funcionarios
-- required_columns: qualificacoes_historico.id,qualificacoes_historico.funcionario_id,qualificacoes_historico.empresa_id,qualificacoes_historico.status,qualificacoes_historico.data_conclusao,qualificacoes_historico.deleted_at,funcionarios.id,funcionarios.empresa_id,funcionarios.deleted_at
-- skip_if_schema_unconfirmed: true
SELECT
  qh.id,
  qh.funcionario_id,
  qh.empresa_id AS qualificacao_empresa_id,
  f.empresa_id AS funcionario_empresa_id,
  qh.status,
  qh.data_conclusao
FROM qualificacoes_historico qh
JOIN funcionarios f
  ON f.id = qh.funcionario_id
 AND f.deleted_at IS NULL
WHERE qh.deleted_at IS NULL
  AND (
    (qh.empresa_id IS NOT NULL AND f.empresa_id IS NOT NULL AND qh.empresa_id <> f.empresa_id)
    OR (
      UPPER(COALESCE(qh.status, '')) IN ('CONCLUIDA', 'CONCLUIDO', 'ASSINADO', 'VALIDA', 'RENOVADA', 'VENCIDA')
      AND qh.data_conclusao IS NULL
    )
  );

-- id: I6
-- severity: P1
-- title: LMS matricula ativa sem curso valido
-- required_tables: lms_matriculas,lms_cursos
-- required_columns: lms_matriculas.id,lms_matriculas.curso_id,lms_matriculas.deleted_at,lms_cursos.id,lms_cursos.deleted_at
-- skip_if_schema_unconfirmed: true
SELECT
  m.id AS matricula_id,
  m.curso_id
FROM lms_matriculas m
LEFT JOIN lms_cursos c
  ON c.id = m.curso_id
 AND c.deleted_at IS NULL
WHERE m.deleted_at IS NULL
  AND c.id IS NULL;

-- id: I7
-- severity: P1
-- title: FRMS jornada sem minimos ou duplicada por tripulante data origem
-- required_tables: frms_jornada
-- required_columns: frms_jornada.id,frms_jornada.tripulante_id,frms_jornada.data,frms_jornada.origem,frms_jornada.deleted_at
SELECT
  'DUPLICATE_TRIPULANTE_DATA_ORIGEM' AS issue_type,
  tripulante_id,
  data,
  origem,
  COUNT(*) AS total
FROM frms_jornada
WHERE deleted_at IS NULL
GROUP BY tripulante_id, data, origem
HAVING COUNT(*) > 1
UNION ALL
SELECT
  'MISSING_REQUIRED_FIELDS' AS issue_type,
  tripulante_id,
  data,
  origem,
  1 AS total
FROM frms_jornada
WHERE deleted_at IS NULL
  AND (tripulante_id IS NULL OR TRIM(COALESCE(data, '')) = '');

-- id: I8
-- severity: P1
-- title: Escalas com alocacao orfa ou duplicada
-- required_tables: escala_alocacoes,escalas_mensais
-- required_columns: escala_alocacoes.id,escala_alocacoes.escala_id,escala_alocacoes.funcionario_id,escala_alocacoes.data_inicio,escala_alocacoes.data_fim,escala_alocacoes.deleted_at,escalas_mensais.id,escalas_mensais.deleted_at
SELECT
  'ORPHAN_ESCALA' AS issue_type,
  ea.escala_id,
  ea.funcionario_id,
  ea.data_inicio,
  ea.data_fim,
  COUNT(*) AS total
FROM escala_alocacoes ea
LEFT JOIN escalas_mensais em
  ON em.id = ea.escala_id
 AND em.deleted_at IS NULL
WHERE ea.deleted_at IS NULL
  AND em.id IS NULL
GROUP BY ea.id, ea.escala_id, ea.funcionario_id, ea.data_inicio, ea.data_fim
UNION ALL
SELECT
  'DUPLICATE_ALOCACAO' AS issue_type,
  ea.escala_id,
  ea.funcionario_id,
  ea.data_inicio,
  ea.data_fim,
  COUNT(*) AS total
FROM escala_alocacoes ea
WHERE ea.deleted_at IS NULL
GROUP BY ea.escala_id, ea.funcionario_id, ea.data_inicio, ea.data_fim
HAVING COUNT(*) > 1;

-- id: I10
-- severity: P1
-- title: Inventario de tabelas temporarias, backup ou views suspeitas
-- required_tables: sqlite_master
SELECT
  name AS object_name,
  type AS object_type
FROM sqlite_master
WHERE type IN ('table', 'view')
  AND (
    name GLOB '*_new'
    OR name GLOB '*_temp'
    OR name GLOB '*_backup_*'
    OR name GLOB '*_v'
  )
ORDER BY type, name;
