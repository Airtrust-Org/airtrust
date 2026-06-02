-- AirTrust Data Quality Checks v0.5
-- READ-ONLY ONLY. Do not run automatically. Do not run against production from Codex.
-- Every statement below must remain SELECT-only.

SELECT 'empresa_sem_admin' AS check_name, e.id AS empresa_id
FROM empresas e
LEFT JOIN usuarios_empresas ue ON ue.empresa_id = e.id AND COALESCE(ue.ativo, 1) = 1
LEFT JOIN usuarios u ON u.id = ue.usuario_id AND COALESCE(u.ativo, 1) = 1
WHERE e.deleted_at IS NULL
GROUP BY e.id
HAVING SUM(CASE WHEN LOWER(COALESCE(u.role, ue.role, '')) IN ('admin', 'manager') THEN 1 ELSE 0 END) = 0;

SELECT 'usuario_sem_empresa' AS check_name, u.id AS usuario_id
FROM usuarios u
LEFT JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND COALESCE(ue.ativo, 1) = 1
WHERE COALESCE(u.ativo, 1) = 1
GROUP BY u.id
HAVING COUNT(ue.empresa_id) = 0;

SELECT 'usuario_multiplas_empresas_sem_primaria' AS check_name, ue.usuario_id
FROM usuarios_empresas ue
WHERE COALESCE(ue.ativo, 1) = 1
GROUP BY ue.usuario_id
HAVING COUNT(DISTINCT ue.empresa_id) > 1
   AND SUM(CASE WHEN COALESCE(ue.is_primary, 0) = 1 OR COALESCE(ue.is_current, 0) = 1 THEN 1 ELSE 0 END) = 0;

SELECT 'funcionario_duplicado_tenant' AS check_name, empresa_id, UPPER(TRIM(COALESCE(matricula, nome))) AS chave, COUNT(*) AS total
FROM funcionarios
WHERE deleted_at IS NULL
GROUP BY empresa_id, UPPER(TRIM(COALESCE(matricula, nome)))
HAVING COUNT(*) > 1;

SELECT 'funcionario_sem_empresa' AS check_name, id AS funcionario_id
FROM funcionarios
WHERE deleted_at IS NULL AND empresa_id IS NULL;

SELECT 'qualificacao_duplicada' AS check_name, funcionario_id, COALESCE(qualificacao_codigo, CAST(qualificacao_id AS TEXT)) AS qualificacao, COUNT(*) AS total
FROM qualificacoes_historico
WHERE deleted_at IS NULL AND UPPER(COALESCE(status, 'CONCLUIDA')) NOT IN ('CANCELADA', 'RENOVADA')
GROUP BY funcionario_id, COALESCE(qualificacao_codigo, CAST(qualificacao_id AS TEXT))
HAVING COUNT(*) > 1;

SELECT 'qualificacao_planejada_orfa' AS check_name, qh.id
FROM qualificacoes_historico qh
LEFT JOIN funcionarios f ON f.id = qh.funcionario_id AND f.deleted_at IS NULL
WHERE qh.deleted_at IS NULL
  AND UPPER(COALESCE(qh.status, '')) = 'PLANEJADA'
  AND (f.id IS NULL OR (qh.qualificacao_id IS NULL AND qh.qualificacao_codigo IS NULL));

SELECT 'sessao_simulador_sem_participantes' AS check_name, s.id
FROM simulador_sessoes s
LEFT JOIN simulador_sessao_participantes p ON p.sessao_id = s.id
WHERE s.deleted_at IS NULL
GROUP BY s.id
HAVING COUNT(p.id) = 0;

SELECT 'escala_sem_tenant_valido' AS check_name, em.id
FROM escalas_mensais em
LEFT JOIN empresas e ON e.id = em.empresa_id AND e.deleted_at IS NULL
WHERE em.deleted_at IS NULL AND (em.empresa_id IS NULL OR e.id IS NULL);

SELECT 'alocacao_sem_escala_valida' AS check_name, ea.id
FROM escala_alocacoes ea
LEFT JOIN escalas_mensais em ON em.id = ea.escala_id AND em.deleted_at IS NULL
WHERE ea.deleted_at IS NULL AND em.id IS NULL;

SELECT 'alocacao_duplicada' AS check_name, escala_id, funcionario_id, data_inicio, data_fim, COUNT(*) AS total
FROM escala_alocacoes
WHERE deleted_at IS NULL
GROUP BY escala_id, funcionario_id, data_inicio, data_fim
HAVING COUNT(*) > 1;

SELECT 'status_divergente' AS check_name, 'qualificacoes_historico' AS tabela, status, COUNT(*) AS total
FROM qualificacoes_historico
WHERE deleted_at IS NULL
GROUP BY status
HAVING UPPER(COALESCE(status, '')) IN ('CONCLUIDO', 'CANCELADO');

SELECT 'registro_ativo_deleted_at_inconsistente' AS check_name, 'funcionarios' AS tabela, id
FROM funcionarios
WHERE deleted_at IS NOT NULL AND UPPER(COALESCE(status, 'ATIVO')) = 'ATIVO';

SELECT 'frms_jornada_sem_dados_minimos' AS check_name, id
FROM frms_jornadas
WHERE deleted_at IS NULL
  AND (funcionario_id IS NULL OR data IS NULL);
