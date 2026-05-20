-- Migration 0368: AW139 — Reaquisição de Experiência Recente
-- Cria 1 modelo de sessão AERONAVE com 22 manobras já existentes.
-- Não cria nenhuma manobra nova — total de manobras permanece em 467.
-- Totalmente idempotente: INSERT OR IGNORE em todos os blocos.
-- Tabelas: modelos_sessao, modelos_sessao_manobras (modelo_id, manobra_id, ordem)

-- ============================================================
-- PARTE 1 — MODELO DE SESSÃO
-- tipo = 'AERONAVE', modelo_aeronave = 'AW139', tipo_sessao_id = 9 (PER)
-- ============================================================

INSERT OR IGNORE INTO modelos_sessao (codigo, nome, tipo, descricao, modelo_aeronave, tipo_sessao_id, ativo)
VALUES (
  'A139-REQ-01',
  'AW139 - REAQUISIÇÃO DE EXPERIÊNCIA RECENTE',
  'AERONAVE',
  'Sessão de reaquisição de experiência recente para pilotos do AW139 com experiência recente vencida (31 a 90+ dias). Cobre todos os itens da ementa FORM-OPS-094 Rev00: pré-voo, planejamento, partida, táxi, decolagem VFR e IFR, subida, cruzeiro, navegação, procedimentos de espera, aproximações NPA e ILS, pouso em UM e em aeródromo, CRM e padronização operacional. (Ref: FORM-OPS-094 Rev00 — FTV-AW139-ANV-REQ)',
  'AW139',
  9,
  1
);

-- ============================================================
-- PARTE 2 — 22 VÍNCULOS MANOBRA-MODELO
-- UNIQUE(modelo_id, manobra_id) garante idempotência via INSERT OR IGNORE
-- ============================================================

-- Bloco 1: Pré-voo e Planejamento (1–4)
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 1, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-REQ-01' AND m.codigo = 'LOFT-CHK-01';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 2, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-REQ-01' AND m.codigo = 'LOFT-CHK-02';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 3, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-REQ-01' AND m.codigo = 'LOFT-CHK-03';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 4, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-REQ-01' AND m.codigo = 'LOFT-CHK-04';

-- Bloco 2: Solo e Partida (5–8)
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 5, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-REQ-01' AND m.codigo = 'LOFT-CHK-05';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 6, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-REQ-01' AND m.codigo = 'LOFT-CHK-06';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 7, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-REQ-01' AND m.codigo = 'OPS-NRM-X1';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 8, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-REQ-01' AND m.codigo = 'FLY-BAS-X3';

-- Bloco 3: Decolagem e Saída (9–13)
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 9, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-REQ-01' AND m.codigo = 'LOFT-CHK-07';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 10, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-REQ-01' AND m.codigo = 'OPS-NRM-X2';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 11, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-REQ-01' AND m.codigo = 'OPS-NAV-X2';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 12, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-REQ-01' AND m.codigo = 'LOFT-CHK-09';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 13, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-REQ-01' AND m.codigo = 'LOFT-CHK-10';

-- Bloco 4: Navegação, Aproximação e Pouso (14–18)
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 14, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-REQ-01' AND m.codigo = 'LOFT-CHK-13';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 15, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-REQ-01' AND m.codigo = 'LOFT-CHK-14';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 16, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-REQ-01' AND m.codigo = 'LOFT-CHK-17';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 17, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-REQ-01' AND m.codigo = 'LOFT-CHK-18';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 18, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-REQ-01' AND m.codigo = 'LOFT-CHK-19';

-- Bloco 5: CRM e Padronização (19–22)
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 19, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-REQ-01' AND m.codigo = 'LOFT-CHK-16';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 20, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-REQ-01' AND m.codigo = 'LOFT-CHK-20';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 21, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-REQ-01' AND m.codigo = 'LOFT-CHK-21';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 22, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-REQ-01' AND m.codigo = 'LOFT-CHK-22';
