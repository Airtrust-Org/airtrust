-- Migration 0419: Normalizar nomes de modelos de sessão para português técnico
-- Escopo: apenas 4 modelos A139-I com termos em inglês nos nomes
-- Demais 47 modelos V6.2 ativos já estão em português adequado
-- Não altera: códigos, ids, relações, manobras, fichas históricas
-- Seguro para rerun: WHERE pelo nome antigo garante idempotência

UPDATE modelos_sessao SET nome = 'AFCS e Aviônicos', updated_at = datetime('now') WHERE codigo = 'A139-I-07/12' AND nome = 'AFCS/Avionics';
UPDATE modelos_sessao SET nome = 'Rotor, Transmissão e Sistema Hidráulico', updated_at = datetime('now') WHERE codigo = 'A139-I-08/12' AND nome = 'Rotor/Transmission/Hydraulic';
UPDATE modelos_sessao SET nome = 'Fogo/Fumaça e Emergências Avançadas', updated_at = datetime('now') WHERE codigo = 'A139-I-09/12' AND nome = 'Fire/Smoke/Emergências Avançadas';
UPDATE modelos_sessao SET nome = 'Offshore e Helideck', updated_at = datetime('now') WHERE codigo = 'A139-I-10/12' AND nome = 'Offshore/Helideck';
