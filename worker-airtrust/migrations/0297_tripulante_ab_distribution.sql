-- Migration 0297: Distribuição A/B/AB de manobras por modelo de sessão
-- Adiciona coluna tripulante em fichas_sessao_manobras para persistência na ficha gerada

ALTER TABLE fichas_sessao_manobras ADD COLUMN tripulante TEXT NOT NULL DEFAULT 'AB' CHECK(tripulante IN ('A','B','AB'));

-- ============================================================
-- PERIÓDICO AW139
-- ============================================================

-- Modelo 28: AW139 VFR Ciclo 1
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2  THEN 'A' WHEN 5  THEN 'A' WHEN 7  THEN 'A' WHEN 9  THEN 'A'
  WHEN 11 THEN 'A' WHEN 15 THEN 'A' WHEN 17 THEN 'A'
  WHEN 1  THEN 'B' WHEN 6  THEN 'B' WHEN 8  THEN 'B' WHEN 10 THEN 'B'
  WHEN 13 THEN 'B' WHEN 14 THEN 'B' WHEN 16 THEN 'B' WHEN 18 THEN 'B' WHEN 21 THEN 'B'
  ELSE 'AB'
END WHERE modelo_id = 28 AND deleted_at IS NULL;

-- Modelo 29: AW139 IFR Ciclo 1
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 3  THEN 'A' WHEN 4  THEN 'A' WHEN 6  THEN 'A' WHEN 9  THEN 'A'
  WHEN 11 THEN 'A' WHEN 14 THEN 'A' WHEN 17 THEN 'A' WHEN 18 THEN 'A' WHEN 20 THEN 'A'
  WHEN 5  THEN 'B' WHEN 7  THEN 'B' WHEN 8  THEN 'B' WHEN 12 THEN 'B'
  WHEN 13 THEN 'B' WHEN 16 THEN 'B' WHEN 19 THEN 'B' WHEN 21 THEN 'B'
  ELSE 'AB'
END WHERE modelo_id = 29 AND deleted_at IS NULL;

-- Modelo 30: AW139 VFR Ciclo 2
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2  THEN 'A' WHEN 7  THEN 'A' WHEN 8  THEN 'A' WHEN 11 THEN 'A'
  WHEN 13 THEN 'A' WHEN 18 THEN 'A' WHEN 20 THEN 'A' WHEN 21 THEN 'A'
  WHEN 3  THEN 'B' WHEN 6  THEN 'B' WHEN 9  THEN 'B' WHEN 10 THEN 'B'
  WHEN 12 THEN 'B' WHEN 14 THEN 'B' WHEN 17 THEN 'B' WHEN 19 THEN 'B'
  ELSE 'AB'
END WHERE modelo_id = 30 AND deleted_at IS NULL;

-- Modelo 31: AW139 IFR Ciclo 2
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 4  THEN 'A' WHEN 7  THEN 'A' WHEN 9  THEN 'A' WHEN 11 THEN 'A'
  WHEN 13 THEN 'A' WHEN 16 THEN 'A' WHEN 18 THEN 'A' WHEN 20 THEN 'A' WHEN 21 THEN 'A'
  WHEN 2  THEN 'B' WHEN 3  THEN 'B' WHEN 6  THEN 'B' WHEN 8  THEN 'B'
  WHEN 10 THEN 'B' WHEN 14 THEN 'B' WHEN 15 THEN 'B' WHEN 19 THEN 'B'
  ELSE 'AB'
END WHERE modelo_id = 31 AND deleted_at IS NULL;

-- Modelo 32: AW139 VFR Ciclo 3
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2  THEN 'A' WHEN 5  THEN 'A' WHEN 7  THEN 'A' WHEN 8  THEN 'A'
  WHEN 13 THEN 'A' WHEN 15 THEN 'A' WHEN 17 THEN 'A' WHEN 19 THEN 'A'
  WHEN 6  THEN 'B' WHEN 9  THEN 'B' WHEN 12 THEN 'B' WHEN 14 THEN 'B'
  WHEN 16 THEN 'B' WHEN 18 THEN 'B' WHEN 20 THEN 'B' WHEN 22 THEN 'B'
  ELSE 'AB'
END WHERE modelo_id = 32 AND deleted_at IS NULL;

-- Modelo 33: AW139 IFR Ciclo 3
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2  THEN 'A' WHEN 6  THEN 'A' WHEN 8  THEN 'A' WHEN 10 THEN 'A'
  WHEN 12 THEN 'A' WHEN 14 THEN 'A' WHEN 16 THEN 'A' WHEN 19 THEN 'A' WHEN 20 THEN 'A'
  WHEN 3  THEN 'B' WHEN 5  THEN 'B' WHEN 7  THEN 'B' WHEN 9  THEN 'B'
  WHEN 11 THEN 'B' WHEN 13 THEN 'B' WHEN 17 THEN 'B' WHEN 18 THEN 'B'
  ELSE 'AB'
END WHERE modelo_id = 33 AND deleted_at IS NULL;

-- Modelos LOFT AW139: 34, 51, 52, 53 → todos AB (já é o default, mas explicitando)
UPDATE modelos_sessao_manobras SET tripulante = 'AB'
  WHERE modelo_id IN (34, 51, 52, 53) AND deleted_at IS NULL;

-- ============================================================
-- INICIAL AW139 (modelos 16–25; 26 e 27 sem manobras)
-- ============================================================

-- Modelo 16: AW139 01/12 Familiarização
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 6  THEN 'A' WHEN 9  THEN 'A' WHEN 11 THEN 'A' WHEN 13 THEN 'A'
  WHEN 15 THEN 'A' WHEN 17 THEN 'A' WHEN 20 THEN 'A'
  WHEN 7  THEN 'B' WHEN 8  THEN 'B' WHEN 10 THEN 'B' WHEN 12 THEN 'B'
  WHEN 14 THEN 'B' WHEN 16 THEN 'B' WHEN 19 THEN 'B' WHEN 21 THEN 'B'
  ELSE 'AB'
END WHERE modelo_id = 16 AND deleted_at IS NULL;

-- Modelo 17: AW139 02/12 Emergências Powerplant
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2  THEN 'A' WHEN 4  THEN 'A' WHEN 6  THEN 'A' WHEN 8  THEN 'A'
  WHEN 10 THEN 'A' WHEN 13 THEN 'A' WHEN 15 THEN 'A' WHEN 17 THEN 'A'
  WHEN 3  THEN 'B' WHEN 5  THEN 'B' WHEN 7  THEN 'B' WHEN 9  THEN 'B'
  WHEN 11 THEN 'B' WHEN 14 THEN 'B' WHEN 16 THEN 'B'
  ELSE 'AB'
END WHERE modelo_id = 17 AND deleted_at IS NULL;

-- Modelo 18: AW139 03/12 Sistema Elétrico
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1  THEN 'A' WHEN 3  THEN 'A' WHEN 5  THEN 'A' WHEN 7  THEN 'A'
  WHEN 13 THEN 'A' WHEN 16 THEN 'A' WHEN 20 THEN 'A'
  WHEN 2  THEN 'B' WHEN 4  THEN 'B' WHEN 6  THEN 'B' WHEN 8  THEN 'B'
  WHEN 15 THEN 'B' WHEN 17 THEN 'B' WHEN 18 THEN 'B' WHEN 21 THEN 'B'
  ELSE 'AB'
END WHERE modelo_id = 18 AND deleted_at IS NULL;

-- Modelo 19: AW139 04/12 IFR & Navegação
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2  THEN 'A' WHEN 6  THEN 'A' WHEN 10 THEN 'A' WHEN 12 THEN 'A'
  WHEN 18 THEN 'A' WHEN 20 THEN 'A'
  WHEN 3  THEN 'B' WHEN 8  THEN 'B' WHEN 11 THEN 'B' WHEN 13 THEN 'B'
  WHEN 17 THEN 'B' WHEN 19 THEN 'B'
  ELSE 'AB'
END WHERE modelo_id = 19 AND deleted_at IS NULL;

-- Modelo 20: AW139 05/12 AFCS & Autopilot
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1  THEN 'A' WHEN 5  THEN 'A' WHEN 8  THEN 'A' WHEN 11 THEN 'A'
  WHEN 14 THEN 'A' WHEN 16 THEN 'A' WHEN 22 THEN 'A'
  WHEN 3  THEN 'B' WHEN 7  THEN 'B' WHEN 9  THEN 'B' WHEN 13 THEN 'B'
  WHEN 15 THEN 'B' WHEN 20 THEN 'B' WHEN 21 THEN 'B'
  ELSE 'AB'
END WHERE modelo_id = 20 AND deleted_at IS NULL;

-- Modelo 21: AW139 06/12 AFCS Degradações
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1  THEN 'A' WHEN 3  THEN 'A' WHEN 6  THEN 'A' WHEN 13 THEN 'A'
  WHEN 15 THEN 'A' WHEN 17 THEN 'A'
  WHEN 2  THEN 'B' WHEN 4  THEN 'B' WHEN 8  THEN 'B' WHEN 10 THEN 'B'
  WHEN 14 THEN 'B' WHEN 16 THEN 'B' WHEN 21 THEN 'B'
  ELSE 'AB'
END WHERE modelo_id = 21 AND deleted_at IS NULL;

-- Modelo 22: AW139 07/12 Aviônicos Failures
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1  THEN 'A' WHEN 3  THEN 'A' WHEN 5  THEN 'A' WHEN 7  THEN 'A'
  WHEN 11 THEN 'A' WHEN 15 THEN 'A' WHEN 18 THEN 'A' WHEN 20 THEN 'A'
  WHEN 2  THEN 'B' WHEN 4  THEN 'B' WHEN 6  THEN 'B' WHEN 10 THEN 'B'
  WHEN 14 THEN 'B' WHEN 17 THEN 'B' WHEN 19 THEN 'B' WHEN 22 THEN 'B'
  ELSE 'AB'
END WHERE modelo_id = 22 AND deleted_at IS NULL;

-- Modelo 23: AW139 08/12 Rotor & Transmissão
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1  THEN 'A' WHEN 3  THEN 'A' WHEN 5  THEN 'A' WHEN 7  THEN 'A'
  WHEN 9  THEN 'A' WHEN 15 THEN 'A' WHEN 17 THEN 'A' WHEN 19 THEN 'A'
  WHEN 2  THEN 'B' WHEN 4  THEN 'B' WHEN 6  THEN 'B' WHEN 8  THEN 'B'
  WHEN 13 THEN 'B' WHEN 16 THEN 'B' WHEN 18 THEN 'B' WHEN 22 THEN 'B'
  ELSE 'AB'
END WHERE modelo_id = 23 AND deleted_at IS NULL;

-- Modelo 24: AW139 09/12 Fogo & Fumaça
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1  THEN 'A' WHEN 3  THEN 'A' WHEN 5  THEN 'A' WHEN 12 THEN 'A'
  WHEN 14 THEN 'A' WHEN 17 THEN 'A' WHEN 20 THEN 'A'
  WHEN 2  THEN 'B' WHEN 4  THEN 'B' WHEN 11 THEN 'B' WHEN 13 THEN 'B'
  WHEN 15 THEN 'B' WHEN 16 THEN 'B' WHEN 18 THEN 'B'
  ELSE 'AB'
END WHERE modelo_id = 24 AND deleted_at IS NULL;

-- Modelo 25: AW139 10/12 Offshore
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 3  THEN 'A' WHEN 10 THEN 'A' WHEN 12 THEN 'A' WHEN 15 THEN 'A' WHEN 19 THEN 'A'
  WHEN 9  THEN 'B' WHEN 11 THEN 'B' WHEN 14 THEN 'B' WHEN 16 THEN 'B'
  WHEN 17 THEN 'B' WHEN 20 THEN 'B'
  ELSE 'AB'
END WHERE modelo_id = 25 AND deleted_at IS NULL;

-- ============================================================
-- INICIAL SK76 (modelos 39–41)
-- ============================================================

-- Modelo 39: SK76 01/03 Familiarização VFR
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 6  THEN 'A' WHEN 9  THEN 'A' WHEN 11 THEN 'A' WHEN 13 THEN 'A'
  WHEN 15 THEN 'A' WHEN 17 THEN 'A' WHEN 20 THEN 'A'
  WHEN 7  THEN 'B' WHEN 8  THEN 'B' WHEN 10 THEN 'B' WHEN 12 THEN 'B'
  WHEN 14 THEN 'B' WHEN 16 THEN 'B' WHEN 19 THEN 'B' WHEN 21 THEN 'B'
  ELSE 'AB'
END WHERE modelo_id = 39 AND deleted_at IS NULL;

-- Modelo 40: SK76 02/03 Emergências Powerplant & Autorotações
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2  THEN 'A' WHEN 4  THEN 'A' WHEN 6  THEN 'A' WHEN 8  THEN 'A'
  WHEN 10 THEN 'A' WHEN 13 THEN 'A' WHEN 15 THEN 'A' WHEN 17 THEN 'A'
  WHEN 3  THEN 'B' WHEN 5  THEN 'B' WHEN 7  THEN 'B' WHEN 9  THEN 'B'
  WHEN 11 THEN 'B' WHEN 14 THEN 'B' WHEN 16 THEN 'B'
  ELSE 'AB'
END WHERE modelo_id = 40 AND deleted_at IS NULL;

-- Modelo 41: SK76 03/03 Sistema Elétrico & Noturno
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 1  THEN 'A' WHEN 3  THEN 'A' WHEN 5  THEN 'A' WHEN 7  THEN 'A'
  WHEN 13 THEN 'A' WHEN 16 THEN 'A' WHEN 20 THEN 'A'
  WHEN 2  THEN 'B' WHEN 4  THEN 'B' WHEN 6  THEN 'B' WHEN 8  THEN 'B'
  WHEN 15 THEN 'B' WHEN 17 THEN 'B' WHEN 18 THEN 'B' WHEN 21 THEN 'B'
  ELSE 'AB'
END WHERE modelo_id = 41 AND deleted_at IS NULL;

-- ============================================================
-- PERIÓDICO SK76
-- ============================================================

-- Modelo 44: SK76 LOFT/CHECK → todos AB
UPDATE modelos_sessao_manobras SET tripulante = 'AB'
  WHERE modelo_id = 44 AND deleted_at IS NULL;

-- Modelo 45: SK76 Ciclo 1 VFR
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 3  THEN 'A' WHEN 4  THEN 'A' WHEN 7  THEN 'A' WHEN 10 THEN 'A'
  WHEN 12 THEN 'A' WHEN 14 THEN 'A' WHEN 16 THEN 'A' WHEN 19 THEN 'A'
  WHEN 2  THEN 'B' WHEN 5  THEN 'B' WHEN 8  THEN 'B' WHEN 11 THEN 'B'
  WHEN 13 THEN 'B' WHEN 15 THEN 'B' WHEN 17 THEN 'B' WHEN 18 THEN 'B' WHEN 20 THEN 'B'
  ELSE 'AB'
END WHERE modelo_id = 45 AND deleted_at IS NULL;

-- Modelo 46: SK76 Ciclo 1 IFR
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 3  THEN 'A' WHEN 6  THEN 'A' WHEN 7  THEN 'A' WHEN 9  THEN 'A'
  WHEN 11 THEN 'A' WHEN 13 THEN 'A' WHEN 15 THEN 'A' WHEN 17 THEN 'A'
  WHEN 2  THEN 'B' WHEN 8  THEN 'B' WHEN 10 THEN 'B' WHEN 12 THEN 'B'
  WHEN 14 THEN 'B' WHEN 16 THEN 'B' WHEN 19 THEN 'B' WHEN 20 THEN 'B' WHEN 21 THEN 'B'
  ELSE 'AB'
END WHERE modelo_id = 46 AND deleted_at IS NULL;

-- Modelo 47: SK76 Ciclo 2 VFR
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2  THEN 'A' WHEN 7  THEN 'A' WHEN 9  THEN 'A' WHEN 11 THEN 'A'
  WHEN 12 THEN 'A' WHEN 15 THEN 'A' WHEN 17 THEN 'A' WHEN 21 THEN 'A'
  WHEN 5  THEN 'B' WHEN 6  THEN 'B' WHEN 8  THEN 'B' WHEN 10 THEN 'B'
  WHEN 13 THEN 'B' WHEN 14 THEN 'B' WHEN 16 THEN 'B' WHEN 18 THEN 'B'
  ELSE 'AB'
END WHERE modelo_id = 47 AND deleted_at IS NULL;

-- Modelo 48: SK76 Ciclo 2 IFR
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 3  THEN 'A' WHEN 8  THEN 'A' WHEN 10 THEN 'A' WHEN 12 THEN 'A'
  WHEN 14 THEN 'A' WHEN 16 THEN 'A' WHEN 19 THEN 'A' WHEN 21 THEN 'A'
  WHEN 2  THEN 'B' WHEN 6  THEN 'B' WHEN 7  THEN 'B' WHEN 9  THEN 'B'
  WHEN 11 THEN 'B' WHEN 13 THEN 'B' WHEN 15 THEN 'B' WHEN 17 THEN 'B' WHEN 20 THEN 'B'
  ELSE 'AB'
END WHERE modelo_id = 48 AND deleted_at IS NULL;

-- Modelo 49: SK76 Ciclo 3 VFR
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 2  THEN 'A' WHEN 7  THEN 'A' WHEN 10 THEN 'A' WHEN 12 THEN 'A'
  WHEN 14 THEN 'A' WHEN 16 THEN 'A' WHEN 18 THEN 'A'
  WHEN 3  THEN 'B' WHEN 6  THEN 'B' WHEN 9  THEN 'B' WHEN 11 THEN 'B'
  WHEN 13 THEN 'B' WHEN 15 THEN 'B' WHEN 17 THEN 'B' WHEN 19 THEN 'B'
  ELSE 'AB'
END WHERE modelo_id = 49 AND deleted_at IS NULL;

-- Modelo 50: SK76 Ciclo 3 IFR
UPDATE modelos_sessao_manobras SET tripulante = CASE ordem
  WHEN 4  THEN 'A' WHEN 5  THEN 'A' WHEN 7  THEN 'A' WHEN 9  THEN 'A'
  WHEN 11 THEN 'A' WHEN 13 THEN 'A' WHEN 15 THEN 'A' WHEN 21 THEN 'A'
  WHEN 6  THEN 'B' WHEN 8  THEN 'B' WHEN 10 THEN 'B' WHEN 12 THEN 'B'
  WHEN 14 THEN 'B' WHEN 18 THEN 'B' WHEN 19 THEN 'B' WHEN 22 THEN 'B'
  ELSE 'AB'
END WHERE modelo_id = 50 AND deleted_at IS NULL;
