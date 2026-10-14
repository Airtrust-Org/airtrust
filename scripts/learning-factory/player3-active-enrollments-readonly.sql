-- Player 3: fonte de inventário privativo de matrículas para continuidade.
-- SELECT SOMENTE; executar exclusivamente por fluxo autenticado/governado.
-- A saída contém IDs de funcionários e estado SCORM possivelmente sensível:
-- NUNCA subir dados, CMI, suspend_data, gabaritos ou relatórios individuais ao GitHub.
-- Não garante snapshot transacional entre páginas; repetir na janela de
-- corte e comparar por matrícula/ciclo/updated_at/last_commit_at.
-- Escopo de menor privilégio: Costa do Sol (empresa_id=6). Demais empresas
-- exigem extração separada, revisão de escopo e autorização própria.
SELECT
  datetime('now') AS extraction_utc,
  COUNT(*) OVER () AS inventory_total_expected,
  m.empresa_id,
  m.id AS matricula_id,
  m.curso_id,
  m.funcionario_id,
  m.status AS matricula_status,
  m.progresso_pct AS matricula_progresso_pct,
  m.score_final AS matricula_score_final,
  m.tentativas AS matricula_tentativas,
  m.updated_at AS matricula_updated_at,
  m.data_inicio AS matricula_data_inicio,
  m.data_conclusao AS matricula_data_conclusao,
  m.ultimo_slide,
  m.ultima_pagina,
  cy.id AS ciclo_id,
  cy.numero_ciclo AS ciclo_numero,
  cy.status AS ciclo_status,
  cy.progresso_pct AS ciclo_progresso_pct,
  cy.score_final AS ciclo_score_final,
  cy.tentativas AS ciclo_tentativas,
  cy.ciclo_atual,
  cy.updated_at AS ciclo_updated_at,
  -- All non-deleted cycles for this same enrollment AND tenant, encrypted only.
  -- Never collapse an earlier qualification/completion into the current cycle.
  (SELECT COALESCE(json_group_array(json_object(
      'id', h.id, 'numero_ciclo', h.numero_ciclo,
      'ciclo_atual', h.ciclo_atual, 'status', h.status,
      'progresso_pct', h.progresso_pct, 'score_final', h.score_final,
      'tentativas', h.tentativas, 'updated_at', h.updated_at,
      'data_inicio', h.data_inicio, 'data_conclusao', h.data_conclusao,
      'qualificacao_historico_id', h.qualificacao_historico_id
    )), '[]')
    FROM lms_matricula_ciclos AS h
    WHERE h.matricula_id = m.id AND h.empresa_id = m.empresa_id
      AND h.deleted_at IS NULL) AS ciclos_historicos_json_PRIVATE,
  c.tipo_conteudo,
  c.scorm_versao,
  c.version_tag AS curso_version_tag,
  s.id AS scorm_id,
  s.lesson_status AS scorm_lesson_status,
  s.completion_status AS scorm_completion_status,
  s.success_status AS scorm_success_status,
  s.score_raw AS scorm_score_raw,
  s.last_commit_at AS scorm_last_commit_at,
  s.suspend_data AS scorm_suspend_data_PRIVATE,
  s.cmi_json AS scorm_cmi_json_PRIVATE,
  (SELECT COUNT(*) FROM lms_xapi_statements AS x
     WHERE x.matricula_id = m.id AND x.empresa_id = m.empresa_id)
    AS xapi_statement_count,
  (SELECT MAX(x.created_at) FROM lms_xapi_statements AS x
     WHERE x.matricula_id = m.id AND x.empresa_id = m.empresa_id)
    AS xapi_last_event_at
FROM lms_matriculas AS m
JOIN lms_cursos AS c
  ON c.id = m.curso_id AND c.empresa_id = m.empresa_id
LEFT JOIN lms_matricula_ciclos AS cy
  ON cy.matricula_id = m.id
  AND cy.empresa_id = m.empresa_id
  AND cy.ciclo_atual = 1
  AND cy.deleted_at IS NULL
LEFT JOIN lms_progresso_scorm AS s
  ON s.matricula_id = m.id
  AND s.empresa_id = m.empresa_id
WHERE m.empresa_id = 6
  AND m.deleted_at IS NULL
  AND m.status IN ('EM_ANDAMENTO','NAO_INICIADO')
ORDER BY m.empresa_id, m.id, cy.id;
