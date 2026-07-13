-- 0426: SK76 — Padronizar nomenclatura dos modelos de sessão periódicos
-- Alinha os nomes ao padrão AW139: {MODELO} - PERIÓDICO - {NN/04} - {DESCRIÇÃO}
--
-- AW139 reference:
--   AW139 - PERIÓDICO - 01/04 - CICLO 1: VFR
--   AW139 - PERIÓDICO - 02/04 - CICLO 2: IFR
--
-- SK76 (nova nomenclatura):
--   SK76 - PERIÓDICO - 01/04 - CICLO 1: VFR
--   SK76 - PERIÓDICO - 02/04 - CICLO 1: IFR
--   etc.
--
-- Nota: apenas o campo `nome` é alterado. O `codigo` permanece inalterado
-- para não quebrar referências em modelos_sessao_manobras e outras tabelas.

UPDATE modelos_sessao
SET nome = 'SK76 - PERIÓDICO - 01/04 - CICLO 1: VFR',
    updated_at = datetime('now')
WHERE codigo = 'SK76-C1-VFR' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET nome = 'SK76 - PERIÓDICO - 02/04 - CICLO 1: IFR',
    updated_at = datetime('now')
WHERE codigo = 'SK76-C1-IFR' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET nome = 'SK76 - PERIÓDICO - 01/04 - CICLO 2: VFR',
    updated_at = datetime('now')
WHERE codigo = 'SK76-C2-VFR' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET nome = 'SK76 - PERIÓDICO - 02/04 - CICLO 2: IFR',
    updated_at = datetime('now')
WHERE codigo = 'SK76-C2-IFR' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET nome = 'SK76 - PERIÓDICO - 01/04 - CICLO 3: VFR',
    updated_at = datetime('now')
WHERE codigo = 'SK76-C3-VFR' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET nome = 'SK76 - PERIÓDICO - 02/04 - CICLO 3: IFR',
    updated_at = datetime('now')
WHERE codigo = 'SK76-C3-IFR' AND deleted_at IS NULL;
