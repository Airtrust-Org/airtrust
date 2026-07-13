-- 0426: SK76 — Padronizar nomenclatura dos modelos de sessão periódicos
-- Alinha nomes e códigos ao padrão AW139: {MODELO} - PERIÓDICO - {NN/04} - {DESCRIÇÃO}
--
-- AW139 reference:
--   AW139 - PERIÓDICO - 01/04 - CICLO 1: VFR   (codigo: A139-P-C1/VFR)
--   AW139 - PERIÓDICO - 02/04 - CICLO 2: IFR   (codigo: A139-P-C2/IFR)
--
-- SK76 (nova nomenclatura):
--   01/04 = VFR   → S76-P-01/04-C1, S76-P-01/04-C2, S76-P-01/04-C3
--   02/04 = IFR   → S76-P-02/04-C1, S76-P-02/04-C2, S76-P-02/04-C3

UPDATE modelos_sessao
SET codigo = 'S76-P-01/04-C1',
    nome   = 'SK76 - PERIÓDICO - 01/04 - CICLO 1: VFR',
    updated_at = datetime('now')
WHERE codigo = 'S76-P-C1/VFR' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET codigo = 'S76-P-02/04-C1',
    nome   = 'SK76 - PERIÓDICO - 02/04 - CICLO 1: IFR',
    updated_at = datetime('now')
WHERE codigo = 'S76-P-C1/IFR' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET codigo = 'S76-P-01/04-C2',
    nome   = 'SK76 - PERIÓDICO - 01/04 - CICLO 2: VFR',
    updated_at = datetime('now')
WHERE codigo = 'S76-P-C2/VFR' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET codigo = 'S76-P-02/04-C2',
    nome   = 'SK76 - PERIÓDICO - 02/04 - CICLO 2: IFR',
    updated_at = datetime('now')
WHERE codigo = 'S76-P-C2/IFR' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET codigo = 'S76-P-01/04-C3',
    nome   = 'SK76 - PERIÓDICO - 01/04 - CICLO 3: VFR',
    updated_at = datetime('now')
WHERE codigo = 'S76-P-C3/VFR' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET codigo = 'S76-P-02/04-C3',
    nome   = 'SK76 - PERIÓDICO - 02/04 - CICLO 3: IFR',
    updated_at = datetime('now')
WHERE codigo = 'S76-P-C3/IFR' AND deleted_at IS NULL;
