-- AIRTRUST #2215 — targeted governed correction of two stale LMS cycle snapshots.
-- Company 6 only. This is a one-time repair, not a certificate/completion mutation.
-- All three observed snapshots are verified before writes, including the 100% SCORM cycle.
-- Deliberate malformed-JSON fail-closed gate aborts the D1 batch on any data drift.
SELECT CASE WHEN (
  SELECT COUNT(*)
    FROM lms_matriculas m
    JOIN lms_matricula_ciclos cy
      ON cy.matricula_id = m.id AND cy.empresa_id = m.empresa_id
     AND cy.ciclo_atual = 1 AND cy.deleted_at IS NULL
   WHERE m.empresa_id = 6 AND m.deleted_at IS NULL
     AND (
       (m.id=1390 AND m.curso_id=22 AND m.funcionario_id=3 AND m.status='EM_ANDAMENTO'
        AND m.progresso_pct=2 AND m.data_inicio='2026-11-13 01:43:21'
        AND cy.id=2671 AND cy.status='NAO_INICIADO' AND cy.progresso_pct=0
        AND cy.data_inicio IS NULL AND cy.qualificacao_historico_id IS NULL)
       OR
       (m.id=2057 AND m.curso_id=68 AND m.funcionario_id=35 AND m.status='EM_ANDAMENTO'
        AND m.progresso_pct=5 AND m.data_inicio='2026-10-16 15:08:46'
        AND cy.id=2305 AND cy.status='EM_ANDAMENTO' AND cy.progresso_pct=2
        AND cy.data_inicio='2026-10-16 15:08:46' AND cy.qualificacao_historico_id IS NULL)
       OR
       (m.id=385 AND m.curso_id=34 AND m.funcionario_id=88 AND m.status='EM_ANDAMENTO'
        AND m.progresso_pct=58 AND cy.id=508 AND cy.status='EM_ANDAMENTO'
        AND cy.progresso_pct=100 AND cy.qualificacao_historico_id IS NULL)
     )
) = 3 THEN 1 ELSE json_extract('LMS_CYCLE_0582_PRECONDITION_DRIFT','$') END;

-- Audit before-image, limited to two cycle records that actually need alignment.
INSERT INTO audit_logs
  (user_id, action, entity_type, entity_id, old_values, new_values, empresa_id, created_at)
SELECT NULL, 'LMS_CYCLE_PROGRESS_RECONCILED_0582', 'lms_matricula_ciclos', cy.id,
  json_object('status', cy.status, 'progresso_pct', cy.progresso_pct, 'data_inicio', cy.data_inicio),
  json_object('status', 'EM_ANDAMENTO', 'progresso_pct', m.progresso_pct,
              'data_inicio', m.data_inicio, 'source_matricula_id', m.id,
              'reason', 'preserve_existing_learner_progress'),
  6, datetime('now')
FROM lms_matricula_ciclos cy
JOIN lms_matriculas m ON m.id=cy.matricula_id AND m.empresa_id=cy.empresa_id
WHERE cy.empresa_id=6 AND cy.ciclo_atual=1 AND cy.deleted_at IS NULL
  AND m.deleted_at IS NULL
  AND ((cy.id=2671 AND m.id=1390 AND cy.status='NAO_INICIADO' AND cy.progresso_pct=0
        AND m.status='EM_ANDAMENTO' AND m.progresso_pct=2)
    OR (cy.id=2305 AND m.id=2057 AND cy.status='EM_ANDAMENTO' AND cy.progresso_pct=2
        AND m.status='EM_ANDAMENTO' AND m.progresso_pct=5));

-- CAS update: only the two reviewed cycles. Never replace SCORM score, attempts,
-- qualification, CMI, completion data or the protected cycle #508.
UPDATE lms_matricula_ciclos
   SET status='EM_ANDAMENTO',
       progresso_pct=CASE id WHEN 2671 THEN 2 WHEN 2305 THEN 5 END,
       data_inicio=CASE WHEN id=2671 THEN '2026-11-13 01:43:21' ELSE data_inicio END,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND ciclo_atual=1 AND deleted_at IS NULL
   AND ((id=2671 AND matricula_id=1390 AND status='NAO_INICIADO'
         AND progresso_pct=0 AND data_inicio IS NULL)
     OR (id=2305 AND matricula_id=2057 AND status='EM_ANDAMENTO'
         AND progresso_pct=2 AND data_inicio='2026-10-16 15:08:46'));

-- Fail closed before the immutable Schema V2 ledger is appended by the official
-- workflow: expected new snapshots, untouched high-watermark and two audit rows.
SELECT CASE WHEN
   (SELECT COUNT(*) FROM lms_matricula_ciclos
      WHERE empresa_id=6 AND ciclo_atual=1 AND deleted_at IS NULL
        AND ((id=2671 AND matricula_id=1390 AND status='EM_ANDAMENTO'
              AND progresso_pct=2 AND data_inicio='2026-11-13 01:43:21')
          OR (id=2305 AND matricula_id=2057 AND status='EM_ANDAMENTO'
              AND progresso_pct=5 AND data_inicio='2026-10-16 15:08:46')
          OR (id=508 AND matricula_id=385 AND status='EM_ANDAMENTO'
              AND progresso_pct=100)))=3
   AND
   (SELECT COUNT(*) FROM audit_logs WHERE empresa_id=6
      AND action='LMS_CYCLE_PROGRESS_RECONCILED_0582'
      AND entity_type='lms_matricula_ciclos'
      AND entity_id IN (2671,2305))=2
  THEN 1 ELSE json_extract('LMS_CYCLE_0582_POSTCONDITION_FAILED','$') END;
