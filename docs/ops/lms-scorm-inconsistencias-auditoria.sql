-- Auditoria reproduzível de inconsistências LMS/SCORM (SOMENTE LEITURA).
--
-- Uso previsto: executar contra uma CÓPIA FORENSE descartável de produção
-- (export read-only do D1 restaurado em SQLite fora do Git), nunca com
-- --remote em produção e nunca acompanhada de DML.
--
-- Nenhuma consulta aqui escreve. Não há UPDATE/INSERT/DELETE por construção.
--
-- Contexto: a maior parte das matrículas historicamente sinalizadas como
-- "inconsistentes" (P1/P2) era efeito de `progresso_pct` inflado pela nota do
-- quiz, e não de falha de conclusão. Sempre cruze P1/P2 com a localização real
-- (P11) e com o flag interno do pacote no suspend_data antes de concluir que há
-- defeito: um curso 100% "de progresso" pode estar no início de fato.

-- P1: progresso 100% sem conclusão.
SELECT m.id, m.curso_id, m.status, m.progresso_pct, m.score_final,
       p.lesson_status, p.completion_status, p.success_status
FROM lms_matriculas m
LEFT JOIN lms_progresso_scorm p ON p.matricula_id = m.id
WHERE m.deleted_at IS NULL AND m.progresso_pct >= 100 AND m.status <> 'CONCLUIDO';

-- P2: nota >= mastery sem conclusão.
SELECT m.id, m.curso_id, m.status, m.score_final, c.scorm_mastery_score
FROM lms_matriculas m
JOIN lms_cursos c ON c.id = m.curso_id
WHERE m.deleted_at IS NULL AND m.score_final IS NOT NULL
  AND m.score_final >= COALESCE(c.scorm_mastery_score, 70)
  AND m.status <> 'CONCLUIDO';

-- P3: pacote reportou conclusão explícita mas a matrícula não concluiu.
-- Esperado: vazio. Resultado não vazio indica falha real de persistência.
SELECT m.id, m.curso_id, m.status, p.lesson_status, p.completion_status, p.success_status
FROM lms_matriculas m
JOIN lms_progresso_scorm p ON p.matricula_id = m.id
WHERE m.deleted_at IS NULL AND m.status <> 'CONCLUIDO'
  AND (LOWER(COALESCE(p.lesson_status, '')) IN ('passed', 'completed')
    OR LOWER(COALESCE(p.completion_status, '')) = 'completed'
    OR LOWER(COALESCE(p.success_status, '')) = 'passed');

-- P4: CONCLUIDO sem data de conclusão.
SELECT id, curso_id, status, data_conclusao FROM lms_matriculas
WHERE deleted_at IS NULL AND status = 'CONCLUIDO'
  AND (data_conclusao IS NULL OR TRIM(data_conclusao) = '');

-- P5: data de conclusão sem status CONCLUIDO.
-- REPROVADO com data é legítimo (a coluna cobre CONCLUIDO e REPROVADO).
SELECT id, curso_id, status, data_conclusao FROM lms_matriculas
WHERE deleted_at IS NULL AND data_conclusao IS NOT NULL AND status <> 'CONCLUIDO';

-- P6: matrícula SCORM concluída sem status SCORM explícito.
-- Registros anteriores ao endurecimento do gate aparecem aqui e exigem
-- remediação de dados revisada — nunca correção automática.
SELECT m.id, m.curso_id, m.data_conclusao, m.qualificacao_historico_id,
       p.lesson_status, p.completion_status, p.success_status
FROM lms_matriculas m
JOIN lms_cursos c ON c.id = m.curso_id
LEFT JOIN lms_progresso_scorm p ON p.matricula_id = m.id
WHERE m.deleted_at IS NULL AND m.status = 'CONCLUIDO' AND c.tipo_conteudo = 'scorm'
  AND NOT (LOWER(COALESCE(p.lesson_status, '')) IN ('passed', 'completed')
        OR LOWER(COALESCE(p.completion_status, '')) = 'completed'
        OR LOWER(COALESCE(p.success_status, '')) = 'passed');

-- P7: qualificação gerada sem conclusão válida.
SELECT m.id, m.curso_id, m.status, m.qualificacao_historico_id
FROM lms_matriculas m
WHERE m.deleted_at IS NULL AND m.qualificacao_historico_id IS NOT NULL
  AND m.status <> 'CONCLUIDO';

-- P8: matrícula duplicada ativa. A UNIQUE (curso_id, funcionario_id,
-- empresa_id) torna isso estruturalmente impossível; a consulta permanece como
-- verificação de regressão caso a constraint seja alterada.
SELECT curso_id, funcionario_id, COUNT(*) AS n FROM lms_matriculas
WHERE deleted_at IS NULL GROUP BY curso_id, funcionario_id HAVING n > 1;

-- P9: mais de um ciclo marcado como atual para a mesma matrícula.
SELECT matricula_id, COUNT(*) AS n FROM lms_matricula_ciclos
WHERE deleted_at IS NULL AND ciclo_atual = 1 GROUP BY matricula_id HAVING n > 1;

-- P10: progresso SCORM sem ciclo registrado (retomada por ciclo inconsistente).
SELECT m.id FROM lms_matriculas m
JOIN lms_progresso_scorm p ON p.matricula_id = m.id
LEFT JOIN lms_matricula_ciclos cc ON cc.matricula_id = m.id AND cc.deleted_at IS NULL
WHERE m.deleted_at IS NULL AND cc.id IS NULL;

-- P11: divergência entre progresso registrado e a localização real do pacote.
-- Detecta diretamente o defeito corrigido em `/scorm/commit` (nota inflando
-- progresso) e serve para dimensionar a remediação de dados pendente.
SELECT m.id, m.curso_id, m.progresso_pct,
       json_extract(p.cmi_json, '$."cmi.core.lesson_location"') AS location_real
FROM lms_matriculas m
JOIN lms_progresso_scorm p ON p.matricula_id = m.id
WHERE m.deleted_at IS NULL
  AND json_extract(p.cmi_json, '$."cmi.core.lesson_location"') LIKE '%/%'
  AND m.progresso_pct - (
        100.0
        * CAST(substr(json_extract(p.cmi_json, '$."cmi.core.lesson_location"'), 1,
                 instr(json_extract(p.cmi_json, '$."cmi.core.lesson_location"'), '/') - 1) AS REAL)
        / NULLIF(CAST(substr(json_extract(p.cmi_json, '$."cmi.core.lesson_location"'),
                 instr(json_extract(p.cmi_json, '$."cmi.core.lesson_location"'), '/') + 1) AS REAL), 0)
      ) > 20;
