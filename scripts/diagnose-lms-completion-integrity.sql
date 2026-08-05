-- AirTrust Frente 12 — diagnóstico histórico LMS (SOMENTE LEITURA)
-- Não executar em produção sem autorização separada.
-- Compatível com SQLite/D1 local ou dump anonimizado autorizado.

-- 1. Resumo por empresa de matrículas concluídas sem progresso SCORM/xAPI.
SELECT
  m.empresa_id,
  COUNT(*) AS total_concluidas_sem_evidencia
FROM lms_matriculas m
LEFT JOIN lms_progresso_scorm p
  ON p.matricula_id = m.id AND p.empresa_id = m.empresa_id
WHERE m.deleted_at IS NULL
  AND m.status = 'CONCLUIDO'
  AND p.matricula_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM lms_xapi_statements x
     WHERE x.matricula_id = m.id AND x.empresa_id = m.empresa_id
  )
GROUP BY m.empresa_id
ORDER BY m.empresa_id;

-- 2. Exemplos anonimizados: conclusão com progresso zero ou ausente.
SELECT
  m.empresa_id,
  m.id AS matricula_id,
  m.curso_id,
  m.funcionario_id AS funcionario_id_tecnico,
  m.status,
  COALESCE(m.progresso_pct, 0) AS progresso_pct,
  m.data_conclusao
FROM lms_matriculas m
WHERE m.deleted_at IS NULL
  AND m.status = 'CONCLUIDO'
  AND COALESCE(m.progresso_pct, 0) = 0
ORDER BY m.empresa_id, m.id
LIMIT 200;

-- 3. Estados SCORM conflitantes: falha coexistindo com passed/completed.
SELECT
  p.empresa_id,
  p.matricula_id,
  p.lesson_status,
  p.completion_status,
  p.success_status,
  p.score_raw,
  p.score_max,
  p.last_commit_at
FROM lms_progresso_scorm p
WHERE LOWER(COALESCE(p.lesson_status, '')) = 'failed'
   OR LOWER(COALESCE(p.success_status, '')) = 'failed'
  AND (
    LOWER(COALESCE(p.lesson_status, '')) IN ('passed', 'completed', 'complete')
    OR LOWER(COALESCE(p.completion_status, '')) IN ('completed', 'complete')
    OR LOWER(COALESCE(p.success_status, '')) = 'passed'
  )
ORDER BY p.empresa_id, p.matricula_id
LIMIT 200;

-- 4. Matrículas concluídas com falha explícita persistida.
SELECT
  m.empresa_id,
  m.id AS matricula_id,
  m.curso_id,
  m.status AS matricula_status,
  p.lesson_status,
  p.completion_status,
  p.success_status
FROM lms_matriculas m
JOIN lms_progresso_scorm p
  ON p.matricula_id = m.id AND p.empresa_id = m.empresa_id
WHERE m.deleted_at IS NULL
  AND m.status = 'CONCLUIDO'
  AND (
    LOWER(COALESCE(p.lesson_status, '')) = 'failed'
    OR LOWER(COALESCE(p.success_status, '')) = 'failed'
  )
ORDER BY m.empresa_id, m.id
LIMIT 200;

-- 5. Curso qualificante/avaliado com mastery ausente ou zero.
SELECT
  c.empresa_id,
  c.id AS curso_id,
  c.tipo_conteudo,
  c.gerar_qualificacao_ao_concluir,
  c.qualificacao_tipo_id,
  c.scorm_mastery_score,
  COUNT(m.id) AS matriculas_relacionadas
FROM lms_cursos c
LEFT JOIN lms_matriculas m
  ON m.curso_id = c.id AND m.empresa_id = c.empresa_id AND m.deleted_at IS NULL
WHERE c.deleted_at IS NULL
  AND c.gerar_qualificacao_ao_concluir = 1
  AND (c.scorm_mastery_score IS NULL OR c.scorm_mastery_score = 0)
GROUP BY c.empresa_id, c.id, c.tipo_conteudo,
         c.gerar_qualificacao_ao_concluir, c.qualificacao_tipo_id, c.scorm_mastery_score
ORDER BY c.empresa_id, c.id;

-- 6. Conclusão com score abaixo do mastery.
SELECT
  m.empresa_id,
  m.id AS matricula_id,
  m.curso_id,
  c.scorm_mastery_score,
  p.score_raw,
  p.score_min,
  p.score_max,
  p.score_scaled,
  CASE
    WHEN p.score_scaled IS NOT NULL THEN p.score_scaled * 100.0
    WHEN p.score_raw IS NOT NULL AND p.score_max IS NOT NULL AND p.score_max > COALESCE(p.score_min, 0)
      THEN ((p.score_raw - COALESCE(p.score_min, 0)) * 100.0) /
           (p.score_max - COALESCE(p.score_min, 0))
    WHEN p.score_raw BETWEEN 0 AND 100 THEN p.score_raw
    ELSE NULL
  END AS score_percentual
FROM lms_matriculas m
JOIN lms_cursos c
  ON c.id = m.curso_id AND c.empresa_id = m.empresa_id AND c.deleted_at IS NULL
JOIN lms_progresso_scorm p
  ON p.matricula_id = m.id AND p.empresa_id = m.empresa_id
WHERE m.deleted_at IS NULL
  AND m.status = 'CONCLUIDO'
  AND c.scorm_mastery_score > 0
  AND (
    CASE
      WHEN p.score_scaled IS NOT NULL THEN p.score_scaled * 100.0
      WHEN p.score_raw IS NOT NULL AND p.score_max IS NOT NULL AND p.score_max > COALESCE(p.score_min, 0)
        THEN ((p.score_raw - COALESCE(p.score_min, 0)) * 100.0) /
             (p.score_max - COALESCE(p.score_min, 0))
      WHEN p.score_raw BETWEEN 0 AND 100 THEN p.score_raw
      ELSE NULL
    END
  ) < c.scorm_mastery_score
ORDER BY m.empresa_id, m.id
LIMIT 200;

-- 7. Curso que exige qualificação: conclusão sem vínculo de histórico.
SELECT
  m.empresa_id,
  m.id AS matricula_id,
  m.curso_id,
  m.funcionario_id AS funcionario_id_tecnico,
  c.qualificacao_tipo_id,
  m.data_conclusao
FROM lms_matriculas m
JOIN lms_cursos c
  ON c.id = m.curso_id AND c.empresa_id = m.empresa_id AND c.deleted_at IS NULL
WHERE m.deleted_at IS NULL
  AND m.status = 'CONCLUIDO'
  AND c.gerar_qualificacao_ao_concluir = 1
  AND m.qualificacao_historico_id IS NULL
ORDER BY m.empresa_id, m.id
LIMIT 200;

-- 8. Vínculo cross-tenant ou funcionário divergente entre matrícula e qualificação.
SELECT
  m.empresa_id AS matricula_empresa_id,
  qh.empresa_id AS historico_empresa_id,
  m.id AS matricula_id,
  qh.id AS qualificacao_historico_id,
  m.funcionario_id AS matricula_funcionario_id,
  qh.funcionario_id AS historico_funcionario_id
FROM lms_matriculas m
JOIN qualificacoes_historico qh ON qh.id = m.qualificacao_historico_id
WHERE m.deleted_at IS NULL
  AND qh.deleted_at IS NULL
  AND (
    qh.empresa_id <> m.empresa_id
    OR qh.funcionario_id <> m.funcionario_id
  )
ORDER BY m.empresa_id, m.id
LIMIT 200;

-- 9. Mais de um ciclo ativo para a mesma matrícula.
SELECT
  c.empresa_id,
  c.matricula_id,
  COUNT(*) AS ciclos_ativos
FROM lms_matricula_ciclos c
WHERE c.deleted_at IS NULL
  AND c.ciclo_atual = 1
  AND c.matricula_id IS NOT NULL
GROUP BY c.empresa_id, c.matricula_id
HAVING COUNT(*) > 1
ORDER BY c.empresa_id, c.matricula_id;

-- 10. Matrícula cancelada/soft-deleted que seria encontrada pela restrição única.
SELECT
  m.empresa_id,
  m.id AS matricula_id,
  m.curso_id,
  m.funcionario_id AS funcionario_id_tecnico,
  m.status,
  m.deleted_at,
  m.qualificacao_historico_id
FROM lms_matriculas m
WHERE m.deleted_at IS NOT NULL
   OR m.status = 'CANCELADO'
ORDER BY m.empresa_id, m.id
LIMIT 200;

-- 11. Certificado ainda publicamente elegível ligado a matrícula não concluída.
SELECT
  m.empresa_id,
  m.id AS matricula_id,
  m.status AS matricula_status,
  qh.id AS qualificacao_historico_id,
  qh.status AS qualificacao_status,
  qh.certificado_arquivo_id,
  d.deleted_at AS documento_deleted_at
FROM lms_matriculas m
JOIN qualificacoes_historico qh
  ON qh.id = m.qualificacao_historico_id
 AND qh.empresa_id = m.empresa_id
JOIN documentos d ON d.id = qh.certificado_arquivo_id
WHERE m.deleted_at IS NULL
  AND m.status <> 'CONCLUIDO'
  AND qh.deleted_at IS NULL
  AND d.deleted_at IS NULL
ORDER BY m.empresa_id, m.id
LIMIT 200;

-- 12. Contagem consolidada por empresa para a Frente 10.
SELECT
  e.id AS empresa_id,
  (SELECT COUNT(*) FROM lms_matriculas m
    WHERE m.empresa_id = e.id AND m.deleted_at IS NULL AND m.status = 'CONCLUIDO') AS concluidas,
  (SELECT COUNT(*) FROM lms_matriculas m
    WHERE m.empresa_id = e.id AND m.deleted_at IS NULL AND m.status = 'CONCLUIDO'
      AND COALESCE(m.progresso_pct, 0) = 0) AS concluidas_progresso_zero,
  (SELECT COUNT(*) FROM lms_matriculas m
    JOIN lms_cursos c ON c.id = m.curso_id AND c.empresa_id = m.empresa_id
    WHERE m.empresa_id = e.id AND m.deleted_at IS NULL AND m.status = 'CONCLUIDO'
      AND c.gerar_qualificacao_ao_concluir = 1 AND m.qualificacao_historico_id IS NULL) AS sem_qualificacao_exigida,
  (SELECT COUNT(*) FROM lms_matriculas m
    WHERE m.empresa_id = e.id AND (m.deleted_at IS NOT NULL OR m.status = 'CANCELADO')) AS canceladas_ou_soft_deleted
FROM empresas e
WHERE e.deleted_at IS NULL
ORDER BY e.id;
