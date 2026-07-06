-- ROLLBACK 0419: Reverte nomes normalizados para versão anterior
-- Seguro para rerun: WHERE pelo nome novo garante idempotência

UPDATE modelos_sessao SET nome = 'AFCS/Avionics' WHERE codigo = 'A139-I-07/12' AND nome = 'AFCS e Aviônicos';
UPDATE modelos_sessao SET nome = 'Rotor/Transmission/Hydraulic' WHERE codigo = 'A139-I-08/12' AND nome = 'Rotor, Transmissão e Sistema Hidráulico';
UPDATE modelos_sessao SET nome = 'Fire/Smoke/Emergências Avançadas' WHERE codigo = 'A139-I-09/12' AND nome = 'Fogo/Fumaça e Emergências Avançadas';
UPDATE modelos_sessao SET nome = 'Offshore/Helideck' WHERE codigo = 'A139-I-10/12' AND nome = 'Offshore e Helideck';
