-- =========================================
-- CRIAR VÍNCULO E QUALIFICAÇÕES - ANTONIO RAMOS
-- Migration: 0205_antonio_ramos_edapp_vinculos_qualificacoes.sql
-- Data: 2026-02-06
-- Descrição: Cria vínculo EdApp e qualificações para Antonio Ramos (eventos webhook nunca chegaram)
-- =========================================

-- Dados do CSV EdApp:
-- User ID: 671f8c111d09157bff5f4840
-- Email: antonio.ramos@voecostadosol.com.br
-- AirTrust funcionario_id: 3
-- 7 cursos concluídos entre out-nov/2025

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

-- 2. Criar qualificações baseadas nas datas do CSV EdApp

-- E6 - Operações em Terrenos Desabitados ou Selva (2025-10-04 23:17:50)
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

-- B - CGA (Conhecimentos Gerais de Aeronaves) (2025-10-28 23:50:06)
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
  'B',
  '2025-10-28',
  date('2025-10-28', '+12 months'),
  'EdApp: Conclusão 2025-10-28 23:50:06 UTC | User 671f8c111d09157bff5f4840',
  datetime('now'),
  datetime('now')
);

-- C - Emergências Gerais (2025-10-29 02:17:28)
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
  'C',
  '2025-10-29',
  date('2025-10-29', '+12 months'),
  'EdApp: Conclusão 2025-10-29 02:17:28 UTC | User 671f8c111d09157bff5f4840',
  datetime('now'),
  datetime('now')
);

-- E4 - Operação Aeromédica (2025-10-29 22:31:38)
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
  'E4',
  '2025-10-29',
  date('2025-10-29', '+12 months'),
  'EdApp: Conclusão 2025-10-29 22:31:38 UTC | User 671f8c111d09157bff5f4840',
  datetime('now'),
  datetime('now')
);

-- E2 - Operação PBN (2025-10-31 00:18:48)
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
  'E2',
  '2025-10-31',
  date('2025-10-31', '+12 months'),
  'EdApp: Conclusão 2025-10-31 00:18:48 UTC | User 671f8c111d09157bff5f4840',
  datetime('now'),
  datetime('now')
);

-- E1 - Operações Offshore (2025-11-01 01:46:14)
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
  'E1',
  '2025-11-01',
  date('2025-11-01', '+12 months'),
  'EdApp: Conclusão 2025-11-01 01:46:14 UTC | User 671f8c111d09157bff5f4840',
  datetime('now'),
  datetime('now')
);

-- E5 - Operação com EFB (2025-11-01 20:08:59)
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
  'E5',
  '2025-11-01',
  date('2025-11-01', '+12 months'),
  'EdApp: Conclusão 2025-11-01 20:08:59 UTC | User 671f8c111d09157bff5f4840',
  datetime('now'),
  datetime('now')
);

-- =========================================
-- RESUMO
-- =========================================
-- ✅ Vínculo criado: Antonio Ramos (ID 3) ↔ EdApp (671f8c111d09157bff5f4840)
-- ✅ 7 qualificações criadas: E6, B, C, E4, E2, E1, E5
-- ✅ Todas com validade de 12 meses a partir da data de conclusão
-- ✅ Origem: EdApp (importação manual CSV) para auditoria
-- =========================================
