-- Migration 0417: Corrige distribuicao A/B/AB de manobras por conteudo/criticidade (nao por posicao sequencial)
-- Contexto: migration 0297 distribuia tripulante por `ordem` (alternancia mecanica), nao por semantica da manobra.
-- Esta migration recalcula tripulante por criticidade pedagogica real (ver docs/analysis/airtrust_matriz_v6_2_todas_sessoes_manobras_final.md).
-- Escopo: somente modelos_sessao_manobras (template). Fichas ja executadas (fichas_sessao_manobras) NAO sao alteradas.
-- AB = ambos pilotos devem executar/ser avaliados diretamente (proficiencia individual critica ou item conjunto de tripulacao).
-- A/B = aprendizagem como PM e suficiente; distribuido por bloco de fase coerente, nao alternancia por posicao.

-- A139-I-01/12 (modelo_id=16): 13 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1 THEN 'A'
  WHEN 5 THEN 'A'
  WHEN 6 THEN 'A'
  WHEN 7 THEN 'A'
  WHEN 8 THEN 'A'
  WHEN 9 THEN 'A'
  WHEN 10 THEN 'B'
  WHEN 12 THEN 'B'
  WHEN 14 THEN 'B'
  WHEN 15 THEN 'B'
  WHEN 16 THEN 'B'
  WHEN 17 THEN 'B'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 16 AND deleted_at IS NULL;

-- A139-I-02/12 (modelo_id=17): 16 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2 THEN 'A'
  WHEN 3 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 5 THEN 'A'
  WHEN 6 THEN 'A'
  WHEN 8 THEN 'A'
  WHEN 9 THEN 'A'
  WHEN 10 THEN 'A'
  WHEN 11 THEN 'B'
  WHEN 12 THEN 'B'
  WHEN 13 THEN 'B'
  WHEN 14 THEN 'B'
  WHEN 15 THEN 'B'
  WHEN 16 THEN 'B'
  WHEN 17 THEN 'B'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 17 AND deleted_at IS NULL;

-- A139-I-03/12 (modelo_id=18): 17 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2 THEN 'A'
  WHEN 3 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 5 THEN 'A'
  WHEN 6 THEN 'A'
  WHEN 7 THEN 'A'
  WHEN 8 THEN 'A'
  WHEN 9 THEN 'A'
  WHEN 10 THEN 'B'
  WHEN 11 THEN 'B'
  WHEN 12 THEN 'B'
  WHEN 13 THEN 'B'
  WHEN 14 THEN 'B'
  WHEN 15 THEN 'B'
  WHEN 16 THEN 'B'
  WHEN 17 THEN 'B'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 18 AND deleted_at IS NULL;

-- A139-I-04/12 (modelo_id=19): 13 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1 THEN 'A'
  WHEN 3 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 5 THEN 'A'
  WHEN 6 THEN 'A'
  WHEN 7 THEN 'A'
  WHEN 8 THEN 'A'
  WHEN 10 THEN 'B'
  WHEN 11 THEN 'B'
  WHEN 12 THEN 'B'
  WHEN 13 THEN 'B'
  WHEN 15 THEN 'B'
  WHEN 17 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 19 AND deleted_at IS NULL;

-- A139-I-05/12 (modelo_id=20): 15 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1 THEN 'A'
  WHEN 2 THEN 'A'
  WHEN 3 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 5 THEN 'A'
  WHEN 6 THEN 'A'
  WHEN 7 THEN 'A'
  WHEN 9 THEN 'B'
  WHEN 10 THEN 'B'
  WHEN 13 THEN 'B'
  WHEN 14 THEN 'B'
  WHEN 15 THEN 'B'
  WHEN 16 THEN 'B'
  WHEN 17 THEN 'B'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 20 AND deleted_at IS NULL;

-- A139-I-06/12 (modelo_id=21): 12 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2 THEN 'A'
  WHEN 3 THEN 'A'
  WHEN 6 THEN 'AB'
  WHEN 7 THEN 'A'
  WHEN 9 THEN 'A'
  WHEN 10 THEN 'B'
  WHEN 12 THEN 'AB'
  WHEN 13 THEN 'AB'
  WHEN 14 THEN 'B'
  WHEN 15 THEN 'B'
  WHEN 16 THEN 'B'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 21 AND deleted_at IS NULL;

-- A139-I-07/12 (modelo_id=22): 12 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1 THEN 'A'
  WHEN 2 THEN 'A'
  WHEN 3 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 5 THEN 'A'
  WHEN 6 THEN 'A'
  WHEN 8 THEN 'A'
  WHEN 11 THEN 'B'
  WHEN 13 THEN 'B'
  WHEN 15 THEN 'B'
  WHEN 16 THEN 'B'
  WHEN 17 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 22 AND deleted_at IS NULL;

-- A139-I-08/12 (modelo_id=23): 11 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1 THEN 'AB'
  WHEN 2 THEN 'AB'
  WHEN 4 THEN 'AB'
  WHEN 5 THEN 'AB'
  WHEN 6 THEN 'AB'
  WHEN 7 THEN 'AB'
  WHEN 8 THEN 'A'
  WHEN 9 THEN 'B'
  WHEN 11 THEN 'AB'
  WHEN 12 THEN 'AB'
  WHEN 13 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 23 AND deleted_at IS NULL;

-- A139-I-09/12 (modelo_id=24): 11 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1 THEN 'AB'
  WHEN 3 THEN 'AB'
  WHEN 4 THEN 'AB'
  WHEN 5 THEN 'A'
  WHEN 6 THEN 'AB'
  WHEN 7 THEN 'A'
  WHEN 10 THEN 'A'
  WHEN 11 THEN 'B'
  WHEN 13 THEN 'AB'
  WHEN 14 THEN 'AB'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 24 AND deleted_at IS NULL;

-- A139-I-10/12 (modelo_id=25): 15 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1 THEN 'A'
  WHEN 2 THEN 'A'
  WHEN 3 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 5 THEN 'A'
  WHEN 6 THEN 'AB'
  WHEN 7 THEN 'AB'
  WHEN 8 THEN 'AB'
  WHEN 10 THEN 'B'
  WHEN 11 THEN 'B'
  WHEN 12 THEN 'B'
  WHEN 13 THEN 'B'
  WHEN 14 THEN 'B'
  WHEN 15 THEN 'AB'
  WHEN 16 THEN 'AB'
  ELSE tripulante END WHERE modelo_id = 25 AND deleted_at IS NULL;

-- A139-P-C1/VFR (modelo_id=28): 13 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1 THEN 'A'
  WHEN 3 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 5 THEN 'AB'
  WHEN 7 THEN 'B'
  WHEN 9 THEN 'AB'
  WHEN 10 THEN 'AB'
  WHEN 11 THEN 'AB'
  WHEN 13 THEN 'AB'
  WHEN 15 THEN 'AB'
  WHEN 16 THEN 'AB'
  WHEN 17 THEN 'B'
  WHEN 18 THEN 'AB'
  ELSE tripulante END WHERE modelo_id = 28 AND deleted_at IS NULL;

-- A139-P-C1/IFR (modelo_id=29): 11 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1 THEN 'A'
  WHEN 2 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 5 THEN 'A'
  WHEN 7 THEN 'A'
  WHEN 11 THEN 'B'
  WHEN 12 THEN 'AB'
  WHEN 14 THEN 'B'
  WHEN 15 THEN 'B'
  WHEN 16 THEN 'B'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 29 AND deleted_at IS NULL;

-- A139-P-C2/VFR (modelo_id=30): 13 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2 THEN 'A'
  WHEN 3 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 5 THEN 'AB'
  WHEN 6 THEN 'AB'
  WHEN 7 THEN 'AB'
  WHEN 8 THEN 'AB'
  WHEN 10 THEN 'B'
  WHEN 11 THEN 'AB'
  WHEN 12 THEN 'AB'
  WHEN 15 THEN 'B'
  WHEN 16 THEN 'AB'
  WHEN 17 THEN 'AB'
  ELSE tripulante END WHERE modelo_id = 30 AND deleted_at IS NULL;

-- A139-P-C2/IFR (modelo_id=31): 13 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1 THEN 'A'
  WHEN 2 THEN 'A'
  WHEN 3 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 7 THEN 'A'
  WHEN 9 THEN 'AB'
  WHEN 10 THEN 'B'
  WHEN 11 THEN 'B'
  WHEN 13 THEN 'AB'
  WHEN 14 THEN 'B'
  WHEN 15 THEN 'B'
  WHEN 17 THEN 'B'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 31 AND deleted_at IS NULL;

-- A139-P-C3/VFR (modelo_id=32): 13 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1 THEN 'A'
  WHEN 3 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 5 THEN 'AB'
  WHEN 6 THEN 'AB'
  WHEN 8 THEN 'B'
  WHEN 9 THEN 'AB'
  WHEN 12 THEN 'B'
  WHEN 14 THEN 'AB'
  WHEN 15 THEN 'AB'
  WHEN 16 THEN 'AB'
  WHEN 17 THEN 'AB'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 32 AND deleted_at IS NULL;

-- A139-P-C3/IFR (modelo_id=33): 14 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1 THEN 'A'
  WHEN 2 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 6 THEN 'A'
  WHEN 8 THEN 'AB'
  WHEN 9 THEN 'B'
  WHEN 10 THEN 'AB'
  WHEN 11 THEN 'AB'
  WHEN 12 THEN 'AB'
  WHEN 13 THEN 'B'
  WHEN 14 THEN 'B'
  WHEN 15 THEN 'B'
  WHEN 17 THEN 'B'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 33 AND deleted_at IS NULL;

-- S76-P-C1/VFR (modelo_id=45): 14 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1 THEN 'A'
  WHEN 2 THEN 'A'
  WHEN 4 THEN 'AB'
  WHEN 5 THEN 'AB'
  WHEN 6 THEN 'A'
  WHEN 7 THEN 'AB'
  WHEN 9 THEN 'AB'
  WHEN 10 THEN 'AB'
  WHEN 11 THEN 'AB'
  WHEN 12 THEN 'AB'
  WHEN 13 THEN 'B'
  WHEN 14 THEN 'AB'
  WHEN 15 THEN 'AB'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 45 AND deleted_at IS NULL;

-- S76-P-C1/IFR (modelo_id=46): 12 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1 THEN 'A'
  WHEN 2 THEN 'A'
  WHEN 5 THEN 'AB'
  WHEN 6 THEN 'AB'
  WHEN 7 THEN 'AB'
  WHEN 8 THEN 'A'
  WHEN 10 THEN 'A'
  WHEN 12 THEN 'B'
  WHEN 14 THEN 'B'
  WHEN 15 THEN 'B'
  WHEN 16 THEN 'AB'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 46 AND deleted_at IS NULL;

-- S76-P-C2/VFR (modelo_id=47): 12 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1 THEN 'A'
  WHEN 3 THEN 'A'
  WHEN 5 THEN 'A'
  WHEN 6 THEN 'AB'
  WHEN 7 THEN 'AB'
  WHEN 9 THEN 'B'
  WHEN 10 THEN 'AB'
  WHEN 11 THEN 'AB'
  WHEN 12 THEN 'AB'
  WHEN 13 THEN 'AB'
  WHEN 16 THEN 'B'
  WHEN 18 THEN 'AB'
  ELSE tripulante END WHERE modelo_id = 47 AND deleted_at IS NULL;

-- S76-P-C2/IFR (modelo_id=48): 13 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1 THEN 'A'
  WHEN 2 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 5 THEN 'AB'
  WHEN 7 THEN 'A'
  WHEN 9 THEN 'A'
  WHEN 10 THEN 'AB'
  WHEN 12 THEN 'B'
  WHEN 14 THEN 'B'
  WHEN 15 THEN 'AB'
  WHEN 16 THEN 'B'
  WHEN 17 THEN 'B'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 48 AND deleted_at IS NULL;

-- S76-P-C3/VFR (modelo_id=49): 11 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1 THEN 'A'
  WHEN 3 THEN 'AB'
  WHEN 4 THEN 'A'
  WHEN 6 THEN 'A'
  WHEN 9 THEN 'AB'
  WHEN 10 THEN 'B'
  WHEN 12 THEN 'B'
  WHEN 14 THEN 'AB'
  WHEN 15 THEN 'AB'
  WHEN 16 THEN 'AB'
  WHEN 17 THEN 'AB'
  ELSE tripulante END WHERE modelo_id = 49 AND deleted_at IS NULL;

-- S76-P-C3/IFR (modelo_id=50): 11 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1 THEN 'A'
  WHEN 2 THEN 'A'
  WHEN 5 THEN 'AB'
  WHEN 6 THEN 'AB'
  WHEN 7 THEN 'AB'
  WHEN 8 THEN 'A'
  WHEN 10 THEN 'A'
  WHEN 11 THEN 'B'
  WHEN 13 THEN 'B'
  WHEN 15 THEN 'B'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 50 AND deleted_at IS NULL;

-- A139-S-01/02 (modelo_id=52): 11 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2 THEN 'A'
  WHEN 3 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 5 THEN 'A'
  WHEN 6 THEN 'A'
  WHEN 8 THEN 'B'
  WHEN 10 THEN 'B'
  WHEN 15 THEN 'B'
  WHEN 16 THEN 'B'
  WHEN 17 THEN 'B'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 52 AND deleted_at IS NULL;

-- A139-S-02/02 (modelo_id=53): 13 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2 THEN 'A'
  WHEN 3 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 5 THEN 'A'
  WHEN 6 THEN 'A'
  WHEN 7 THEN 'A'
  WHEN 8 THEN 'B'
  WHEN 9 THEN 'B'
  WHEN 11 THEN 'B'
  WHEN 12 THEN 'B'
  WHEN 13 THEN 'B'
  WHEN 16 THEN 'B'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 53 AND deleted_at IS NULL;

-- A139-NOT-01 (modelo_id=56): 11 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2 THEN 'A'
  WHEN 3 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 5 THEN 'A'
  WHEN 6 THEN 'A'
  WHEN 8 THEN 'B'
  WHEN 10 THEN 'B'
  WHEN 15 THEN 'B'
  WHEN 16 THEN 'B'
  WHEN 17 THEN 'B'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 56 AND deleted_at IS NULL;

-- S76-NOT-01 (modelo_id=57): 12 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2 THEN 'A'
  WHEN 3 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 5 THEN 'A'
  WHEN 6 THEN 'A'
  WHEN 8 THEN 'B'
  WHEN 9 THEN 'B'
  WHEN 10 THEN 'B'
  WHEN 14 THEN 'B'
  WHEN 15 THEN 'B'
  WHEN 17 THEN 'B'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 57 AND deleted_at IS NULL;

-- S76-REQ-01 (modelo_id=58): 13 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2 THEN 'A'
  WHEN 3 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 5 THEN 'A'
  WHEN 6 THEN 'A'
  WHEN 7 THEN 'A'
  WHEN 8 THEN 'B'
  WHEN 9 THEN 'B'
  WHEN 10 THEN 'B'
  WHEN 12 THEN 'B'
  WHEN 13 THEN 'B'
  WHEN 14 THEN 'B'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 58 AND deleted_at IS NULL;

-- A139-REQ-01 (modelo_id=62): 14 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2 THEN 'A'
  WHEN 3 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 5 THEN 'A'
  WHEN 6 THEN 'A'
  WHEN 7 THEN 'A'
  WHEN 8 THEN 'A'
  WHEN 9 THEN 'B'
  WHEN 10 THEN 'B'
  WHEN 11 THEN 'B'
  WHEN 12 THEN 'B'
  WHEN 16 THEN 'B'
  WHEN 17 THEN 'B'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 62 AND deleted_at IS NULL;

-- SK76-I-01/12 (modelo_id=63): 17 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1 THEN 'A'
  WHEN 3 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 5 THEN 'A'
  WHEN 6 THEN 'A'
  WHEN 7 THEN 'A'
  WHEN 8 THEN 'A'
  WHEN 9 THEN 'A'
  WHEN 10 THEN 'B'
  WHEN 11 THEN 'B'
  WHEN 12 THEN 'B'
  WHEN 13 THEN 'B'
  WHEN 14 THEN 'B'
  WHEN 15 THEN 'B'
  WHEN 16 THEN 'B'
  WHEN 17 THEN 'B'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 63 AND deleted_at IS NULL;

-- SK76-I-02/12 (modelo_id=64): 17 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2 THEN 'A'
  WHEN 3 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 5 THEN 'A'
  WHEN 6 THEN 'A'
  WHEN 7 THEN 'A'
  WHEN 8 THEN 'A'
  WHEN 9 THEN 'A'
  WHEN 10 THEN 'B'
  WHEN 11 THEN 'B'
  WHEN 12 THEN 'B'
  WHEN 13 THEN 'B'
  WHEN 14 THEN 'B'
  WHEN 15 THEN 'B'
  WHEN 16 THEN 'B'
  WHEN 17 THEN 'B'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 64 AND deleted_at IS NULL;

-- SK76-I-03/12 (modelo_id=65): 16 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2 THEN 'A'
  WHEN 3 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 6 THEN 'A'
  WHEN 7 THEN 'A'
  WHEN 8 THEN 'A'
  WHEN 9 THEN 'A'
  WHEN 10 THEN 'A'
  WHEN 11 THEN 'B'
  WHEN 12 THEN 'B'
  WHEN 13 THEN 'B'
  WHEN 14 THEN 'B'
  WHEN 15 THEN 'B'
  WHEN 16 THEN 'B'
  WHEN 17 THEN 'B'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 65 AND deleted_at IS NULL;

-- SK76-I-04/12 (modelo_id=66): 12 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2 THEN 'A'
  WHEN 3 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 5 THEN 'A'
  WHEN 7 THEN 'A'
  WHEN 9 THEN 'A'
  WHEN 10 THEN 'B'
  WHEN 12 THEN 'B'
  WHEN 13 THEN 'B'
  WHEN 15 THEN 'B'
  WHEN 16 THEN 'B'
  WHEN 17 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 66 AND deleted_at IS NULL;

-- SK76-I-05/12 (modelo_id=67): 15 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2 THEN 'A'
  WHEN 3 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 5 THEN 'A'
  WHEN 6 THEN 'A'
  WHEN 8 THEN 'A'
  WHEN 9 THEN 'A'
  WHEN 11 THEN 'B'
  WHEN 12 THEN 'B'
  WHEN 13 THEN 'B'
  WHEN 14 THEN 'B'
  WHEN 15 THEN 'B'
  WHEN 16 THEN 'B'
  WHEN 17 THEN 'B'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 67 AND deleted_at IS NULL;

-- SK76-I-06/12 (modelo_id=68): 4 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2 THEN 'A'
  WHEN 6 THEN 'AB'
  WHEN 7 THEN 'AB'
  WHEN 15 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 68 AND deleted_at IS NULL;

-- SK76-I-07/12 (modelo_id=69): 16 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1 THEN 'A'
  WHEN 3 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 5 THEN 'A'
  WHEN 6 THEN 'A'
  WHEN 7 THEN 'A'
  WHEN 8 THEN 'A'
  WHEN 10 THEN 'A'
  WHEN 11 THEN 'B'
  WHEN 12 THEN 'B'
  WHEN 13 THEN 'B'
  WHEN 14 THEN 'B'
  WHEN 15 THEN 'B'
  WHEN 16 THEN 'B'
  WHEN 17 THEN 'B'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 69 AND deleted_at IS NULL;

-- SK76-I-08/12 (modelo_id=70): 5 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1 THEN 'AB'
  WHEN 2 THEN 'AB'
  WHEN 3 THEN 'AB'
  WHEN 4 THEN 'AB'
  WHEN 5 THEN 'AB'
  ELSE tripulante END WHERE modelo_id = 70 AND deleted_at IS NULL;

-- SK76-I-09/12 (modelo_id=71): 6 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1 THEN 'AB'
  WHEN 6 THEN 'AB'
  WHEN 14 THEN 'AB'
  WHEN 16 THEN 'AB'
  WHEN 17 THEN 'A'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 71 AND deleted_at IS NULL;

-- SK76-I-10/12 (modelo_id=72): 10 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 4 THEN 'A'
  WHEN 6 THEN 'A'
  WHEN 7 THEN 'A'
  WHEN 8 THEN 'B'
  WHEN 9 THEN 'AB'
  WHEN 10 THEN 'B'
  WHEN 11 THEN 'AB'
  WHEN 12 THEN 'B'
  WHEN 15 THEN 'B'
  WHEN 16 THEN 'AB'
  ELSE tripulante END WHERE modelo_id = 72 AND deleted_at IS NULL;

-- SK76-S-01/02 (modelo_id=75): 13 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2 THEN 'A'
  WHEN 3 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 5 THEN 'A'
  WHEN 6 THEN 'A'
  WHEN 7 THEN 'A'
  WHEN 9 THEN 'B'
  WHEN 10 THEN 'B'
  WHEN 14 THEN 'B'
  WHEN 15 THEN 'B'
  WHEN 16 THEN 'B'
  WHEN 17 THEN 'B'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 75 AND deleted_at IS NULL;

-- SK76-S-02/02 (modelo_id=76): 11 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2 THEN 'A'
  WHEN 5 THEN 'A'
  WHEN 6 THEN 'A'
  WHEN 11 THEN 'A'
  WHEN 12 THEN 'A'
  WHEN 13 THEN 'B'
  WHEN 14 THEN 'B'
  WHEN 15 THEN 'B'
  WHEN 16 THEN 'B'
  WHEN 17 THEN 'B'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 76 AND deleted_at IS NULL;

-- A139-NOT-02 (modelo_id=77): 11 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2 THEN 'A'
  WHEN 3 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 5 THEN 'A'
  WHEN 6 THEN 'A'
  WHEN 7 THEN 'A'
  WHEN 9 THEN 'B'
  WHEN 15 THEN 'B'
  WHEN 16 THEN 'B'
  WHEN 17 THEN 'B'
  WHEN 18 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 77 AND deleted_at IS NULL;

-- S76-NOT-02 (modelo_id=78): 7 itens corrigidos
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 3 THEN 'A'
  WHEN 4 THEN 'A'
  WHEN 5 THEN 'A'
  WHEN 7 THEN 'B'
  WHEN 12 THEN 'B'
  WHEN 14 THEN 'B'
  WHEN 15 THEN 'B'
  ELSE tripulante END WHERE modelo_id = 78 AND deleted_at IS NULL;
