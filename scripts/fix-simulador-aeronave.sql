-- Fix: Atualizar aeronave_codigo do simulador para usar código correto
UPDATE simuladores 
SET aeronave_codigo = 'AW139' 
WHERE id = 11;
