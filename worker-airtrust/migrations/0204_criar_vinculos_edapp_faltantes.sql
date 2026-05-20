-- =========================================
-- CRIAR VÍNCULOS EDAPP FALTANTES
-- Migration: 0204_criar_vinculos_edapp_faltantes.sql
-- Data: 2026-02-06
-- Descrição: Cria vínculos EdApp para funcionários que existem no CSV mas não estão linkados
-- =========================================

-- Análise: CSV EdApp exportado tem 33 funcionários total
-- Já vinculados no sistema: 12 (conferidos em 2026-02-06)
-- Faltam vincular: precisamos buscar os EdApp User IDs

-- IMPORTANTE: Os EdApp User IDs devem ser obtidos via:
-- 1. API EdApp: GET https://rest.edapp.com/v2/users
-- 2. OU exportação CSV do EdApp com campo user_id

-- Funcionários do CSV que PROVAVELMENTE existem no AirTrust mas não têm vínculo:
-- (Confirmados via grep search em backups)
-- - antonio.ramos@voecostadosol.com.br (ID 8)
-- - vitor.costa@voecostadosol.com.br (ID 36)
-- - eduardo.ribeiro@voecostadosol.com.br (ID 39) - JÁ VINCULADO (ID 10)

-- Lista completa do CSV para verificação (21 emails sem vínculo):
-- 1. andre.garcia@voecostadosol.com.br
-- 2. andre.marques@voecostadosol.com.br
-- 3. andre.santos@voecostadosol.com.br  
-- 4. antonio.ramos@voecostadosol.com.br ✅ CONFIRMADO EXISTE (ID 8)
-- 5. bruno.silva@voecostadosol.com.br
-- 6. camila.souza@voecostadosol.com.br
-- 7. carlos.gomes@voecostadosol.com.br
-- 8. cristiano.nunes@voecostadosol.com.br
-- 9. daniel.andrade@voecostadosol.com.br
-- 10. fabio.rocha@voecostadosol.com.br
-- 11. felipe.carvalho@voecostadosol.com.br
-- 12. fernando.castro@voecostadosol.com.br
-- 13. gabriel.freitas@voecostadosol.com.br
-- 14. jose.martins@voecostadosol.com.br
-- 15. leonardo.costa@voecostadosol.com.br
-- 16. lucas.rodrigues@voecostadosol.com.br
-- 17. marcelo.oliveira@voecostadosol.com.br
-- 18. paulo.araujo@voecostadosol.com.br
-- 19. ricardo.lima@voecostadosol.com.br
-- 20. rodrigo.almeida@voecostadosol.com.br
-- 21. vitor.costa@voecostadosol.com.br ✅ CONFIRMADO EXISTE (ID 36)

-- QUERY PARA VERIFICAR QUAIS FUNCIONÁRIOS EXISTEM:
SELECT 
  id,
  nome,
  email,
  funcao
FROM funcionarios
WHERE email IN (
  'andre.garcia@voecostadosol.com.br',
  'andre.marques@voecostadosol.com.br',
  'andre.santos@voecostadosol.com.br',
  'antonio.ramos@voecostadosol.com.br',
  'bruno.silva@voecostadosol.com.br',
  'camila.souza@voecostadosol.com.br',
  'carlos.gomes@voecostadosol.com.br',
  'cristiano.nunes@voecostadosol.com.br',
  'daniel.andrade@voecostadosol.com.br',
  'fabio.rocha@voecostadosol.com.br',
  'felipe.carvalho@voecostadosol.com.br',
  'fernando.castro@voecostadosol.com.br',
  'gabriel.freitas@voecostadosol.com.br',
  'jose.martins@voecostadosol.com.br',
  'leonardo.costa@voecostadosol.com.br',
  'lucas.rodrigues@voecostadosol.com.br',
  'marcelo.oliveira@voecostadosol.com.br',
  'paulo.araujo@voecostadosol.com.br',
  'ricardo.lima@voecostadosol.com.br',
  'rodrigo.almeida@voecostadosol.com.br',
  'vitor.costa@voecostadosol.com.br'
)
AND deleted_at IS NULL
ORDER BY nome;

-- TEMPLATE PARA INSERÇÃO (substitua <EDAPP_USER_ID> com IDs reais):
/*
INSERT INTO integracoes_edapp_usuarios (
  funcionario_id,
  edapp_user_id,
  edapp_email,
  edapp_username,
  ativo
)
SELECT 
  f.id,
  '<EDAPP_USER_ID>',
  f.email,
  SUBSTR(f.email, 1, INSTR(f.email, '@') - 1) || ' ' || f.nome,
  1
FROM funcionarios f
WHERE f.email = '<EMAIL>'
  AND f.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM integracoes_edapp_usuarios u
    WHERE u.funcionario_id = f.id AND u.deleted_at IS NULL
  );
*/

-- =========================================
-- AÇÃO MANUAL NECESSÁRIA
-- =========================================
-- 1. Executar query SELECT acima para obter lista de IDs
-- 2. Buscar EdApp User IDs via API ou CSV export
-- 3. Executar INSERTs com os dados corretos
-- 4. Reprocessar eventos: POST /api/integracoes/edapp/importar-historico
-- =========================================
