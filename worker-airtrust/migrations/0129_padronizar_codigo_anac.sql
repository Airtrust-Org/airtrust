-- ========================================
-- MIGRATION 0129: Padronizar CANAC → codigo_anac
-- Data: 29/11/2025
-- Objetivo: Eliminar confusão entre canac e codigo_anac
-- Estratégia: Copiar canac → codigo_anac, depois dropar canac
-- ========================================

-- PASSO 1: Copiar dados de canac para codigo_anac
UPDATE funcionarios
SET codigo_anac = canac
WHERE canac IS NOT NULL AND canac != '';

-- PASSO 2: Não podemos dropar coluna em SQLite facilmente
-- Então vamos apenas garantir que codigo_anac tem todos os dados

-- PASSO 3: Registrar na auditoria
INSERT INTO auditoria_avancada_v2 (
  usuario_id,
  acao,
  tabela,
  registro_id,
  valores_anteriores,
  valores_novos,
  detalhes,
  created_at
) VALUES (
  1,
  'MIGRATION_PADRONIZAR_CODIGO_ANAC',
  'funcionarios',
  0,
  json_object('fonte', 'canac'),
  json_object('destino', 'codigo_anac'),
  json_object(
    'descricao', 'Copiado todos os CANACs de canac para codigo_anac',
    'registros_afetados', (SELECT COUNT(*) FROM funcionarios WHERE codigo_anac IS NOT NULL AND deleted_at IS NULL)
  ),
  CURRENT_TIMESTAMP
);
