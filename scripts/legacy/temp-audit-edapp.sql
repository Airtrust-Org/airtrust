SELECT 
  f.nome as funcionario,
  f.email,
  c.edapp_course_name as curso,
  c.qualificacao_codigo as codigo,
  DATE(json_extract(e.payload_json, '$.data.completedAt')) as data_edapp,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN 'SEM_QUALIF'
    WHEN qh.data_conclusao = DATE(json_extract(e.payload_json, '$.data.completedAt')) THEN 'OK'
    ELSE 'ERRO_DATA'
  END as status
FROM integracoes_edapp_eventos e
INNER JOIN integracoes_edapp_usuarios u ON e.edapp_user_id = u.edapp_user_id
INNER JOIN funcionarios f ON u.funcionario_id = f.id
INNER JOIN integracoes_edapp_cursos c ON e.edapp_course_id = c.edapp_course_id
LEFT JOIN qualificacoes_historico qh ON e.qualificacao_historico_id = qh.id AND qh.deleted_at IS NULL
WHERE e.tipo_evento IN ('CourseCompletedEvent', 'course.completed')
  AND e.processado = 1
  AND f.deleted_at IS NULL
  AND u.deleted_at IS NULL
  AND c.deleted_at IS NULL
ORDER BY f.nome, c.edapp_course_name;
