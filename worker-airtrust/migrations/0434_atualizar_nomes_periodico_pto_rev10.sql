-- Migration 0434: Atualizar nomes das sessões do Periódico conforme PTO Rev. 10
-- Fonte: Costa do Sol - PTO A REV 10 - Versão K
-- Data: 2026-07-15

-- AW139 - PERIÓDICO (4 sessões por ciclo)
UPDATE modelos_sessao SET nome = 'AW139 - Periódico - 01/04 - Ciclo 1: VFR', updated_at = datetime('now') WHERE codigo = 'A139-P-01/04-C1' AND deleted_at IS NULL;
UPDATE modelos_sessao SET nome = 'AW139 - Periódico - 02/04 - Ciclo 1: IFR', updated_at = datetime('now') WHERE codigo = 'A139-P-02/04-C1' AND deleted_at IS NULL;
UPDATE modelos_sessao SET nome = 'AW139 - Periódico - 01/04 - Ciclo 2: VFR', updated_at = datetime('now') WHERE codigo = 'A139-P-01/04-C2' AND deleted_at IS NULL;
UPDATE modelos_sessao SET nome = 'AW139 - Periódico - 02/04 - Ciclo 2: IFR', updated_at = datetime('now') WHERE codigo = 'A139-P-02/04-C2' AND deleted_at IS NULL;
UPDATE modelos_sessao SET nome = 'AW139 - Periódico - 01/04 - Ciclo 3: VFR', updated_at = datetime('now') WHERE codigo = 'A139-P-01/04-C3' AND deleted_at IS NULL;
UPDATE modelos_sessao SET nome = 'AW139 - Periódico - 02/04 - Ciclo 3: IFR', updated_at = datetime('now') WHERE codigo = 'A139-P-02/04-C3' AND deleted_at IS NULL;
UPDATE modelos_sessao SET nome = 'AW139 - Periódico - 03/04 - LOFT e Operação Offshore', updated_at = datetime('now') WHERE codigo = 'A139-P-03/04-OFFSHOR' AND deleted_at IS NULL;
UPDATE modelos_sessao SET nome = 'AW139 - Periódico - 04/04 - LOFT e Check de Tipo e IFR', updated_at = datetime('now') WHERE codigo = 'A139-P-04/04-CHECK' AND deleted_at IS NULL;

-- SK76 - PERIÓDICO (3 sessões por ciclo)
UPDATE modelos_sessao SET nome = 'SK76 - Periódico - 01/03 - Ciclo 1: VFR', updated_at = datetime('now') WHERE codigo = 'S76-P-01/04-C1' AND deleted_at IS NULL;
UPDATE modelos_sessao SET nome = 'SK76 - Periódico - 02/03 - Ciclo 1: IFR', updated_at = datetime('now') WHERE codigo = 'S76-P-02/04-C1' AND deleted_at IS NULL;
UPDATE modelos_sessao SET nome = 'SK76 - Periódico - 01/03 - Ciclo 2: VFR', updated_at = datetime('now') WHERE codigo = 'S76-P-01/04-C2' AND deleted_at IS NULL;
UPDATE modelos_sessao SET nome = 'SK76 - Periódico - 02/03 - Ciclo 2: IFR', updated_at = datetime('now') WHERE codigo = 'S76-P-02/04-C2' AND deleted_at IS NULL;
UPDATE modelos_sessao SET nome = 'SK76 - Periódico - 01/03 - Ciclo 3: VFR', updated_at = datetime('now') WHERE codigo = 'S76-P-01/04-C3' AND deleted_at IS NULL;
UPDATE modelos_sessao SET nome = 'SK76 - Periódico - 02/03 - Ciclo 3: IFR', updated_at = datetime('now') WHERE codigo = 'S76-P-02/04-C3' AND deleted_at IS NULL;
UPDATE modelos_sessao SET nome = 'SK76 - Periódico - 03/03 - LOFT e Check de Tipo e IFR', updated_at = datetime('now') WHERE codigo = 'SK76-P-CHECK' AND deleted_at IS NULL;

-- Validação:
-- SELECT codigo, nome FROM modelos_sessao WHERE codigo LIKE 'A139-P-%' OR codigo LIKE 'S76-P-%' OR codigo LIKE 'SK76-P-%' ORDER BY codigo;
