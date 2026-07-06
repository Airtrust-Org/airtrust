-- Migration 0418: Canonicalize NOTECHS categorized codes
-- Substitui NOTECHS-01..15 por NOTECHS-COO-01..04, LID-05..08, CSA-09..11, TMD-12..15
-- Escopo: apenas tabela manobras (catálogo canônico), códigos NOTECHS
-- Seguro para rerun: WHERE pelo código antigo garante idempotência
-- Não altera: ids, nomes, descrições, ordens, categorias, timestamps
-- Fichas históricas preservadas: fichas_sessao_manobras não tem registros NOTECHS ainda

-- COO = Cooperação / Cooperation (NOTECHS-01..04)
UPDATE manobras SET codigo = 'NOTECHS-COO-01', updated_at = datetime('now') WHERE codigo = 'NOTECHS-01' AND categoria = 'NOTECHS';
UPDATE manobras SET codigo = 'NOTECHS-COO-02', updated_at = datetime('now') WHERE codigo = 'NOTECHS-02' AND categoria = 'NOTECHS';
UPDATE manobras SET codigo = 'NOTECHS-COO-03', updated_at = datetime('now') WHERE codigo = 'NOTECHS-03' AND categoria = 'NOTECHS';
UPDATE manobras SET codigo = 'NOTECHS-COO-04', updated_at = datetime('now') WHERE codigo = 'NOTECHS-04' AND categoria = 'NOTECHS';

-- LID = Liderança e Habilidades Gerenciais / Leadership and Management Skills (NOTECHS-05..08)
UPDATE manobras SET codigo = 'NOTECHS-LID-05', updated_at = datetime('now') WHERE codigo = 'NOTECHS-05' AND categoria = 'NOTECHS';
UPDATE manobras SET codigo = 'NOTECHS-LID-06', updated_at = datetime('now') WHERE codigo = 'NOTECHS-06' AND categoria = 'NOTECHS';
UPDATE manobras SET codigo = 'NOTECHS-LID-07', updated_at = datetime('now') WHERE codigo = 'NOTECHS-07' AND categoria = 'NOTECHS';
UPDATE manobras SET codigo = 'NOTECHS-LID-08', updated_at = datetime('now') WHERE codigo = 'NOTECHS-08' AND categoria = 'NOTECHS';

-- CSA = Consciência Situacional / Situational Awareness (NOTECHS-09..11)
UPDATE manobras SET codigo = 'NOTECHS-CSA-09', updated_at = datetime('now') WHERE codigo = 'NOTECHS-09' AND categoria = 'NOTECHS';
UPDATE manobras SET codigo = 'NOTECHS-CSA-10', updated_at = datetime('now') WHERE codigo = 'NOTECHS-10' AND categoria = 'NOTECHS';
UPDATE manobras SET codigo = 'NOTECHS-CSA-11', updated_at = datetime('now') WHERE codigo = 'NOTECHS-11' AND categoria = 'NOTECHS';

-- TMD = Tomada de Decisão / Decision Making (NOTECHS-12..15)
UPDATE manobras SET codigo = 'NOTECHS-TMD-12', updated_at = datetime('now') WHERE codigo = 'NOTECHS-12' AND categoria = 'NOTECHS';
UPDATE manobras SET codigo = 'NOTECHS-TMD-13', updated_at = datetime('now') WHERE codigo = 'NOTECHS-13' AND categoria = 'NOTECHS';
UPDATE manobras SET codigo = 'NOTECHS-TMD-14', updated_at = datetime('now') WHERE codigo = 'NOTECHS-14' AND categoria = 'NOTECHS';
UPDATE manobras SET codigo = 'NOTECHS-TMD-15', updated_at = datetime('now') WHERE codigo = 'NOTECHS-15' AND categoria = 'NOTECHS';
