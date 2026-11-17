-- 0588: only six tenant-6 tipos_sessao DISPLAY LABELS; no model/manobra/code changes.
-- Current original title is an exact condition. Safe to replay.
UPDATE tipos_sessao SET nome='Transição', updated_at=datetime('now')
 WHERE id=24 AND empresa_id=6 AND codigo='P10-TRN'
   AND nome='Transição PTO Rev10' AND deleted_at IS NULL;

UPDATE tipos_sessao SET nome='Requalificação', updated_at=datetime('now')
 WHERE id=25 AND empresa_id=6 AND codigo='P10-RQ'
   AND nome='Requalificação PTO Rev10' AND deleted_at IS NULL;

UPDATE tipos_sessao SET nome='Reaquisição de experiência recente', updated_at=datetime('now')
 WHERE id=26 AND empresa_id=6 AND codigo='P10-REC'
   AND nome='Reaquisição de experiência recente PTO Rev10' AND deleted_at IS NULL;

UPDATE tipos_sessao SET nome='Treinamento noturno', updated_at=datetime('now')
 WHERE id=27 AND empresa_id=6 AND codigo='P10-NOT'
   AND nome='Treinamento noturno PTO Rev10' AND deleted_at IS NULL;

UPDATE tipos_sessao SET nome='Treinamento de Instrutor', updated_at=datetime('now')
 WHERE id=28 AND empresa_id=6 AND codigo='P10-INS'
   AND nome='Treinamento de Instrutor PTO Rev10' AND deleted_at IS NULL;

UPDATE tipos_sessao SET nome='Treinamento de Examinador', updated_at=datetime('now')
 WHERE id=29 AND empresa_id=6 AND codigo='P10-EXA'
   AND nome='Treinamento de Examinador PTO Rev10' AND deleted_at IS NULL;

