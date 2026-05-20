-- =========================================
-- CRIAR VÍNCULO E QUALIFICAÇÕES - VITOR COSTA
-- Migration: 0206_vitor_costa_edapp_vinculos_qualificacoes.sql
-- Data: 2026-02-06
-- Descrição: Cria vínculo EdApp e qualificações para Vitor Costa
-- =========================================

-- Dados do CSV EdApp:
-- User ID: 674611db8c53f8af2ef30749
-- Email: vitor.costa@voecostadosol.com.br
-- AirTrust funcionario_id: 32
-- 7 cursos concluídos em jan/2026

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
  32,
  '674611db8c53f8af2ef30749',
  'vitor.costa@voecostadosol.com.br',
  'Vitor Costa',
  1,
  datetime('now'),
  datetime('now')
);

-- 2. Criar qualificações baseadas nas datas do CSV EdApp

-- E6 - Operações em Terrenos Desabitados ou Selva (2026-01-05 16:04:40)
INSERT INTO qualificacoes_historico (
  funcionario_id,
  qualificacao_codigo,
  data_conclusao,
  data_vencimento,
  observacoes,
  created_at,
  updated_at
) VALUES (
  32,
  'E6',
  '2026-01-05',
  date('2026-01-05', '+12 months'),
  'EdApp: Conclusão 2026-01-05 16:04:40 UTC | User 674611db8c53f8af2ef30749',
  datetime('now'),
  datetime('now')
);

-- C - Emergências Gerais (2026-01-05 16:20:33)
INSERT INTO qualificacoes_historico (
  funcionario_id,
  qualificacao_codigo,
  data_conclusao,
  data_vencimento,
  observacoes,
  created_at,
  updated_at
) VALUES (
  32,
  'C',
  '2026-01-05',
  date('2026-01-05', '+12 months'),
  'EdApp: Conclusão 2026-01-05 16:20:33 UTC | User 674611db8c53f8af2ef30749',
  datetime('now'),
  datetime('now')
);

-- E5 - Operação com EFB (2026-01-05 16:53:56)
INSERT INTO qualificacoes_historico (
  funcionario_id,
  qualificacao_codigo,
  data_conclusao,
  data_vencimento,
  observacoes,
  created_at,
  updated_at
) VALUES (
  32,
  'E5',
  '2026-01-05',
  date('2026-01-05', '+12 months'),
  'EdApp: Conclusão 2026-01-05 16:53:56 UTC | User 674611db8c53f8af2ef30749',
  datetime('now'),
  datetime('now')
);

-- E2 - Operação PBN (2026-01-05 17:02:56)
INSERT INTO qualificacoes_historico (
  funcionario_id,
  qualificacao_codigo,
  data_conclusao,
  data_vencimento,
  observacoes,
  created_at,
  updated_at
) VALUES (
  32,
  'E2',
  '2026-01-05',
  date('2026-01-05', '+12 months'),
  'EdApp: Conclusão 2026-01-05 17:02:56 UTC | User 674611db8c53f8af2ef30749',
  datetime('now'),
  datetime('now')
);

-- B - Conhecimentos Gerais de Aeronaves (2026-01-05 17:36:04)
INSERT INTO qualificacoes_historico (
  funcionario_id,
  qualificacao_codigo,
  data_conclusao,
  data_vencimento,
  observacoes,
  created_at,
  updated_at
) VALUES (
  32,
  'B',
  '2026-01-05',
  date('2026-01-05', '+12 months'),
  'EdApp: Conclusão 2026-01-05 17:36:04 UTC | User 674611db8c53f8af2ef30749',
  datetime('now'),
  datetime('now')
);

-- E4 - Operação Aeromédica (2026-01-05 17:58:05)
INSERT INTO qualificacoes_historico (
  funcionario_id,
  qualificacao_codigo,
  data_conclusao,
  data_vencimento,
  observacoes,
  created_at,
  updated_at
) VALUES (
  32,
  'E4',
  '2026-01-05',
  date('2026-01-05', '+12 months'),
  'EdApp: Conclusão 2026-01-05 17:58:05 UTC | User 674611db8c53f8af2ef30749',
  datetime('now'),
  datetime('now')
);

-- E1 - Operações Offshore (2026-01-06 20:00:10)
INSERT INTO qualificacoes_historico (
  funcionario_id,
  qualificacao_codigo,
  data_conclusao,
  data_vencimento,
  observacoes,
  created_at,
  updated_at
) VALUES (
  32,
  'E1',
  '2026-01-06',
  date('2026-01-06', '+12 months'),
  'EdApp: Conclusão 2026-01-06 20:00:10 UTC | User 674611db8c53f8af2ef30749',
  datetime('now'),
  datetime('now')
);

-- =========================================
-- RESUMO
-- =========================================
-- ✅ Vínculo criado: Vitor Costa (ID 32) ↔ EdApp (674611db8c53f8af2ef30749)
-- ✅ 7 qualificações criadas: E6, C, E5, E2, B, E4, E1
-- ✅ Todas com validade de 12 meses a partir da data de conclusão
-- ✅ Datas: jan/2026 (mais recentes que Antonio Ramos)
-- =========================================
