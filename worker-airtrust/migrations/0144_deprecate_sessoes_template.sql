-- Migration 0144: Documentar depreciação de sessoes_template
-- Data: 1 de dezembro de 2025
-- 
-- IMPORTANTE: 
-- As tabelas sessoes_template e sessoes_template_manobras estão OBSOLETAS
-- Use modelos_sessao e modelos_sessao_manobras no lugar
--
-- Plano de migração:
-- 1. ✅ Criar modelos_sessao + modelos_sessao_manobras (migrations 0142-0143)
-- 2. ✅ Atualizar rotas backend (/modelos-sessao)
-- 3. ✅ Atualizar frontend (ModalNovaSessao + cadastros)
-- 4. ⏳ Período de compatibilidade: 30 dias (até 31/12/2025)
-- 5. ⏳ Migração de dados: sessoes_template → modelos_sessao
-- 6. ⏳ Remover rotas antigas /sessoes-template
-- 7. ⏳ DROP TABLE sessoes_template e sessoes_template_manobras

-- Por enquanto, nenhuma alteração no schema é necessária
-- Esta migration serve apenas como documentação do processo

SELECT 'Migration 0144: Documentação de depreciação aplicada' as status;
