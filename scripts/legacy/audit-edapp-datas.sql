-- Auditoria completa: comparar datas completedAt do EdApp com datas gravadas
SELECT 
  e.id as evento_id,
  f.nome as funcionario,
  c.edapp_course_name as curso,
  json_extract(e.payload_json, '$.data.completedAt') as payload_completedAt,
  DATE(json_extract(e.payload_json, '$.data.completedAt')) as data_esperada,
  qh.id as qualif_id,
  qh.data_conclusao as data_gravada,
  qh.data_vencimento,
  CASE 
    WHEN qh.data_conclusao = DATE(json_extract(e.payload_json, '$.data.completedAt')) THEN 'OK'
    ELSE 'ERRO - ' || qh.data_conclusao || ' != ' || DATE(json_extract(e.payload_json, '$.data.completedAt'))
  END as status
FROM integracoes_edapp_eventos e
LEFT JOIN integracoes_edapp_usuarios u 
  ON e.edapp_user_id = u.edapp_user_id AND u.deleted_at IS NULL
LEFT JOIN funcionarios f 
  ON u.funcionario_id = f.id AND f.deleted_at IS NULL
LEFT JOIN integracoes_edapp_cursos c 
  ON e.edapp_course_id = c.edapp_course_id AND c.deleted_at IS NULL
LEFT JOIN qualificacoes_historico qh 
  ON e.qualificacao_historico_id = qh.id
WHERE e.tipo_evento IN ('CourseCompletedEvent', 'course.completed')
  AND e.deleted_at IS NULL
  AND e.processado = 1
  AND u.funcionario_id IS NOT NULL
  AND qh.id IS NOT NULL
ORDER BY e.id;
