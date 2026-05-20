-- Criar vínculo EdApp e qualificação E6 para Antonio Ramos
-- Funcionario_id: 3
-- EdApp User ID: 671f8c111d09157bff5f4840

-- 1. Criar vínculo EdApp
INSERT INTO integracoes_edapp_usuarios (
  funcionario_id,
  edapp_user_id,
  edapp_email,
  edapp_username,
  ativo,
  created_at,
  updated_at
) VALUES (
  3,
  '671f8c111d09157bff5f4840',
  'antonio.ramos@voecostadosol.com.br',
  'Antonio Ramos',
  1,
  datetime('now'),
  datetime('now')
);

-- 2. Criar E6 (única qualificação faltante)
INSERT INTO qualificacoes_historico (
  funcionario_id,
  qualificacao_codigo,
  data_conclusao,
  data_vencimento,
  observacoes,
  created_at,
  updated_at
) VALUES (
  3,
  'E6',
  '2025-10-04',
  date('2025-10-04', '+12 months'),
  'EdApp: Conclusão 2025-10-04 23:17:50 UTC | User 671f8c111d09157bff5f4840',
  datetime('now'),
  datetime('now')
);
