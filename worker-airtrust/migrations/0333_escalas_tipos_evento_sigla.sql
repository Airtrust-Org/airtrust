-- Migration: 0333_escalas_tipos_evento_sigla
-- Adiciona sigla configuravel (1-2 caracteres) para exibicao dos eventos na grade.

ALTER TABLE escalas_tipos_evento_config ADD COLUMN sigla TEXT;

UPDATE escalas_tipos_evento_config
SET sigla = CASE UPPER(codigo)
  WHEN 'VOO' THEN 'V'
  WHEN 'VIM' THEN 'V'
  WHEN 'VIAGEM' THEN 'V'
  WHEN 'TSO' THEN 'T'
  WHEN 'TREINAMENTO_SOLO' THEN 'T'
  WHEN 'SIM' THEN 'S'
  WHEN 'TREINAMENTO_SIMULADOR' THEN 'S'
  WHEN 'MED' THEN 'M'
  WHEN 'MEDICO' THEN 'M'
  WHEN 'CHK' THEN 'C'
  WHEN 'CHEQUE' THEN 'C'
  WHEN 'REA' THEN 'R'
  WHEN 'REAQUISI' THEN 'R'
  WHEN 'TRB' THEN 'T'
  WHEN 'TRABALHO' THEN 'T'
  WHEN 'FOL' THEN 'F'
  WHEN 'FOLGA' THEN 'F'
  WHEN 'SMH' THEN 'S'
  WHEN 'STANDBY' THEN 'S'
  WHEN 'FER' THEN 'F'
  WHEN 'FERIAS' THEN 'F'
  WHEN 'LIC' THEN 'L'
  WHEN 'LICENCA' THEN 'L'
  ELSE 'E'
END
WHERE sigla IS NULL OR TRIM(sigla) = '';