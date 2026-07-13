-- 0428: AW139 — Padronizar codigos para o formato S76: {MODELO}-{TIPO}-{NN/04}-{CICLO}
-- SK76 format: S76-P-01/04-C1
-- AW139 old:   A139-P-C1-01/04-VFR
-- AW139 new:   A139-P-01/04-C1

UPDATE modelos_sessao
SET codigo = 'A139-P-01/04-C1',
    updated_at = datetime('now')
WHERE codigo = 'A139-P-C1-01/04-VFR' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET codigo = 'A139-P-02/04-C1',
    updated_at = datetime('now')
WHERE codigo = 'A139-P-C1-02/04-IFR' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET codigo = 'A139-P-01/04-C2',
    updated_at = datetime('now')
WHERE codigo = 'A139-P-C2-01/04-VFR' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET codigo = 'A139-P-02/04-C2',
    updated_at = datetime('now')
WHERE codigo = 'A139-P-C2-02/04-IFR' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET codigo = 'A139-P-01/04-C3',
    updated_at = datetime('now')
WHERE codigo = 'A139-P-C3-01/04-VFR' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET codigo = 'A139-P-02/04-C3',
    updated_at = datetime('now')
WHERE codigo = 'A139-P-C3-02/04-IFR' AND deleted_at IS NULL;
