-- Copy the 22 LOFT manobras associations to the modelo 'AW139 - 12/12: LOFT E CHECK FINAL'
-- One INSERT per manobra to avoid compound SELECT limits

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT ms.id, m.id, 1, 1, datetime('now') FROM modelos_sessao ms JOIN manobras m ON m.codigo='A139-LOFT-01' WHERE ms.nome='AW139 - 12/12: LOFT E CHECK FINAL' AND NOT EXISTS (SELECT 1 FROM modelos_sessao_manobras msm WHERE msm.modelo_id=ms.id AND msm.manobra_id=m.id AND msm.deleted_at IS NULL);

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT ms.id, m.id, 2, 1, datetime('now') FROM modelos_sessao ms JOIN manobras m ON m.codigo='A139-LOFT-02' WHERE ms.nome='AW139 - 12/12: LOFT E CHECK FINAL' AND NOT EXISTS (SELECT 1 FROM modelos_sessao_manobras msm WHERE msm.modelo_id=ms.id AND msm.manobra_id=m.id AND msm.deleted_at IS NULL);

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT ms.id, m.id, 3, 1, datetime('now') FROM modelos_sessao ms JOIN manobras m ON m.codigo='A139-LOFT-03' WHERE ms.nome='AW139 - 12/12: LOFT E CHECK FINAL' AND NOT EXISTS (SELECT 1 FROM modelos_sessao_manobras msm WHERE msm.modelo_id=ms.id AND msm.manobra_id=m.id AND msm.deleted_at IS NULL);

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT ms.id, m.id, 4, 1, datetime('now') FROM modelos_sessao ms JOIN manobras m ON m.codigo='A139-LOFT-04' WHERE ms.nome='AW139 - 12/12: LOFT E CHECK FINAL' AND NOT EXISTS (SELECT 1 FROM modelos_sessao_manobras msm WHERE msm.modelo_id=ms.id AND msm.manobra_id=m.id AND msm.deleted_at IS NULL);

-- SOL
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT ms.id, m.id, 5, 1, datetime('now') FROM modelos_sessao ms JOIN manobras m ON m.codigo='A139-LOFT-05' WHERE ms.nome='AW139 - 12/12: LOFT E CHECK FINAL' AND NOT EXISTS (SELECT 1 FROM modelos_sessao_manobras msm WHERE msm.modelo_id=ms.id AND msm.manobra_id=m.id AND msm.deleted_at IS NULL);

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT ms.id, m.id, 6, 1, datetime('now') FROM modelos_sessao ms JOIN manobras m ON m.codigo='A139-LOFT-06' WHERE ms.nome='AW139 - 12/12: LOFT E CHECK FINAL' AND NOT EXISTS (SELECT 1 FROM modelos_sessao_manobras msm WHERE msm.modelo_id=ms.id AND msm.manobra_id=m.id AND msm.deleted_at IS NULL);

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT ms.id, m.id, 7, 1, datetime('now') FROM modelos_sessao ms JOIN manobras m ON m.codigo='A139-LOFT-07' WHERE ms.nome='AW139 - 12/12: LOFT E CHECK FINAL' AND NOT EXISTS (SELECT 1 FROM modelos_sessao_manobras msm WHERE msm.modelo_id=ms.id AND msm.manobra_id=m.id AND msm.deleted_at IS NULL);

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT ms.id, m.id, 8, 1, datetime('now') FROM modelos_sessao ms JOIN manobras m ON m.codigo='A139-LOFT-08' WHERE ms.nome='AW139 - 12/12: LOFT E CHECK FINAL' AND NOT EXISTS (SELECT 1 FROM modelos_sessao_manobras msm WHERE msm.modelo_id=ms.id AND msm.manobra_id=m.id AND msm.deleted_at IS NULL);

-- VOO
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT ms.id, m.id, 9, 1, datetime('now') FROM modelos_sessao ms JOIN manobras m ON m.codigo='A139-LOFT-09' WHERE ms.nome='AW139 - 12/12: LOFT E CHECK FINAL' AND NOT EXISTS (SELECT 1 FROM modelos_sessao_manobras msm WHERE msm.modelo_id=ms.id AND msm.manobra_id=m.id AND msm.deleted_at IS NULL);

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT ms.id, m.id, 10, 1, datetime('now') FROM modelos_sessao ms JOIN manobras m ON m.codigo='A139-LOFT-10' WHERE ms.nome='AW139 - 12/12: LOFT E CHECK FINAL' AND NOT EXISTS (SELECT 1 FROM modelos_sessao_manobras msm WHERE msm.modelo_id=ms.id AND msm.manobra_id=m.id AND msm.deleted_at IS NULL);

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT ms.id, m.id, 11, 1, datetime('now') FROM modelos_sessao ms JOIN manobras m ON m.codigo='A139-LOFT-11' WHERE ms.nome='AW139 - 12/12: LOFT E CHECK FINAL' AND NOT EXISTS (SELECT 1 FROM modelos_sessao_manobras msm WHERE msm.modelo_id=ms.id AND msm.manobra_id=m.id AND msm.deleted_at IS NULL);

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT ms.id, m.id, 12, 1, datetime('now') FROM modelos_sessao ms JOIN manobras m ON m.codigo='A139-LOFT-12' WHERE ms.nome='AW139 - 12/12: LOFT E CHECK FINAL' AND NOT EXISTS (SELECT 1 FROM modelos_sessao_manobras msm WHERE msm.modelo_id=ms.id AND msm.manobra_id=m.id AND msm.deleted_at IS NULL);

-- EME
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT ms.id, m.id, 13, 1, datetime('now') FROM modelos_sessao ms JOIN manobras m ON m.codigo='A139-LOFT-13' WHERE ms.nome='AW139 - 12/12: LOFT E CHECK FINAL' AND NOT EXISTS (SELECT 1 FROM modelos_sessao_manobras msm WHERE msm.modelo_id=ms.id AND msm.manobra_id=m.id AND msm.deleted_at IS NULL);

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT ms.id, m.id, 14, 1, datetime('now') FROM modelos_sessao ms JOIN manobras m ON m.codigo='A139-LOFT-14' WHERE ms.nome='AW139 - 12/12: LOFT E CHECK FINAL' AND NOT EXISTS (SELECT 1 FROM modelos_sessao_manobras msm WHERE msm.modelo_id=ms.id AND msm.manobra_id=m.id AND msm.deleted_at IS NULL);

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT ms.id, m.id, 15, 1, datetime('now') FROM modelos_sessao ms JOIN manobras m ON m.codigo='A139-LOFT-15' WHERE ms.nome='AW139 - 12/12: LOFT E CHECK FINAL' AND NOT EXISTS (SELECT 1 FROM modelos_sessao_manobras msm WHERE msm.modelo_id=ms.id AND msm.manobra_id=m.id AND msm.deleted_at IS NULL);

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT ms.id, m.id, 16, 1, datetime('now') FROM modelos_sessao ms JOIN manobras m ON m.codigo='A139-LOFT-16' WHERE ms.nome='AW139 - 12/12: LOFT E CHECK FINAL' AND NOT EXISTS (SELECT 1 FROM modelos_sessao_manobras msm WHERE msm.modelo_id=ms.id AND msm.manobra_id=m.id AND msm.deleted_at IS NULL);

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT ms.id, m.id, 17, 1, datetime('now') FROM modelos_sessao ms JOIN manobras m ON m.codigo='A139-LOFT-17' WHERE ms.nome='AW139 - 12/12: LOFT E CHECK FINAL' AND NOT EXISTS (SELECT 1 FROM modelos_sessao_manobras msm WHERE msm.modelo_id=ms.id AND msm.manobra_id=m.id AND msm.deleted_at IS NULL);

-- APR
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT ms.id, m.id, 18, 1, datetime('now') FROM modelos_sessao ms JOIN manobras m ON m.codigo='A139-LOFT-18' WHERE ms.nome='AW139 - 12/12: LOFT E CHECK FINAL' AND NOT EXISTS (SELECT 1 FROM modelos_sessao_manobras msm WHERE msm.modelo_id=ms.id AND msm.manobra_id=m.id AND msm.deleted_at IS NULL);

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT ms.id, m.id, 19, 1, datetime('now') FROM modelos_sessao ms JOIN manobras m ON m.codigo='A139-LOFT-19' WHERE ms.nome='AW139 - 12/12: LOFT E CHECK FINAL' AND NOT EXISTS (SELECT 1 FROM modelos_sessao_manobras msm WHERE msm.modelo_id=ms.id AND msm.manobra_id=m.id AND msm.deleted_at IS NULL);

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT ms.id, m.id, 20, 1, datetime('now') FROM modelos_sessao ms JOIN manobras m ON m.codigo='A139-LOFT-20' WHERE ms.nome='AW139 - 12/12: LOFT E CHECK FINAL' AND NOT EXISTS (SELECT 1 FROM modelos_sessao_manobras msm WHERE msm.modelo_id=ms.id AND msm.manobra_id=m.id AND msm.deleted_at IS NULL);

-- CRM
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT ms.id, m.id, 21, 1, datetime('now') FROM modelos_sessao ms JOIN manobras m ON m.codigo='A139-LOFT-21' WHERE ms.nome='AW139 - 12/12: LOFT E CHECK FINAL' AND NOT EXISTS (SELECT 1 FROM modelos_sessao_manobras msm WHERE msm.modelo_id=ms.id AND msm.manobra_id=m.id AND msm.deleted_at IS NULL);

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT ms.id, m.id, 22, 1, datetime('now') FROM modelos_sessao ms JOIN manobras m ON m.codigo='A139-LOFT-22' WHERE ms.nome='AW139 - 12/12: LOFT E CHECK FINAL' AND NOT EXISTS (SELECT 1 FROM modelos_sessao_manobras msm WHERE msm.modelo_id=ms.id AND msm.manobra_id=m.id AND msm.deleted_at IS NULL);
