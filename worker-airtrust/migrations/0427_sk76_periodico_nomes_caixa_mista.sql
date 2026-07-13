-- 0427: SK76 — Corrigir caixa dos nomes dos modelos periódicos
-- Os nomes estavam em CAIXA ALTA (SK76 - PERIÓDICO - 01/04 - CICLO 1: VFR)
-- e devem seguir o padrão AW139: "Ciclo 1 / VFR-emergências" (caixa mista)

UPDATE modelos_sessao
SET nome = 'Ciclo 1 / VFR-emergências',
    updated_at = datetime('now')
WHERE codigo = 'S76-P-01/04-C1' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET nome = 'Ciclo 2 / VFR-emergências',
    updated_at = datetime('now')
WHERE codigo = 'S76-P-01/04-C2' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET nome = 'Ciclo 3 / VFR-emergências',
    updated_at = datetime('now')
WHERE codigo = 'S76-P-01/04-C3' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET nome = 'Ciclo 1 / IFR-emergências',
    updated_at = datetime('now')
WHERE codigo = 'S76-P-02/04-C1' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET nome = 'Ciclo 2 / IFR-emergências',
    updated_at = datetime('now')
WHERE codigo = 'S76-P-02/04-C2' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET nome = 'Ciclo 3 / IFR-emergências',
    updated_at = datetime('now')
WHERE codigo = 'S76-P-02/04-C3' AND deleted_at IS NULL;
