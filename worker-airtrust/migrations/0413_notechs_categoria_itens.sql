-- ============================================================================
-- Migration 0413: NOTECHS — categoria e catálogo de 15 itens fixos
-- Data: 2026-07-02
-- Objetivo:
--   Introduzir a categoria de manobra `NOTECHS` (Non-Technical Skills / CRM)
--   e seus 15 itens fixos (4 grupos: Cooperação, Liderança e Habilidades
--   Gerenciais, Consciência Situacional, Tomada de Decisão), reaproveitando
--   o catálogo `manobras` já existente — sem novas tabelas, sem novas colunas.
--
--   Estes 15 itens são apenas o CATÁLOGO. O vínculo automático em cada ficha
--   nova (fichas_sessao_manobras) é feito em runtime pelo backend
--   (worker-airtrust/src/routes/simuladores-fichas.ts), não por esta migration.
--
-- Por que nenhuma coluna nova:
--   - "faixa de nota" (1-2/3-4/5-7/8-10) já existe como régua global fixa em
--     src/react-app/pages/simuladores/fichas/avaliacaoScale.ts — reaproveitada
--     sem alteração.
--   - "título PT" -> manobras.nome ; "título EN" -> manobras.descricao
--     (mesma convenção já usada em COALESCE(nome,descricao) no restante do
--     código de fichas).
--   - "grupo" (Cooperação/Liderança/Consciência/Decisão) e os 60 descritores
--     completos por faixa NÃO são armazenados no banco — vivem em
--     src/react-app/pages/simuladores/fichas/notechs.ts como referência
--     estática, consumida pelo modal de referência e pela página extra do PDF.
--     Conteúdo textual não é dado de tenant nem varia por empresa.
--   - ordem 1001-1015 (namespace reservado, fora do intervalo 1-22 usado
--     pelas manobras técnicas variáveis) — nunca colide, mesmo se o limite de
--     manobras variáveis for reduzido no futuro (22 -> 18/16/14).
--   - tipo_sessao/tipo_aeronave ficam NULL de propósito: os itens NOTECHS não
--     são filtrados pela query de catálogo das 22 manobras técnicas
--     (`WHERE tipo_sessao=? AND tipo_aeronave=?`), então nunca são
--     "varridos" para dentro da lista de manobras variáveis por engano.
--
-- IDEMPOTÊNCIA:
--   100% idempotente via INSERT OR IGNORE contra os índices únicos parciais
--   já existentes (ux_manobras_categorias_empresa_codigo_active,
--   ux_manobras_empresa_codigo_active). Pode rodar 2x sem duplicar dados.
--   Não há ALTER TABLE nesta migration — apenas DML de seed.
--
-- PRÉ-CONDIÇÃO DE SCHEMA:
--   Rodar somente após a macroetapa tenant-aware do catálogo (`0394`) já estar
--   presente no ambiente, porque a idempotência depende dos índices únicos
--   por empresa em `manobras` e `manobras_categorias`.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
--   source_reference:
--     Macroetapa NOTECHS — inserção de bloco fixo de avaliação NOTECHS
--     (Non-Technical Skills / CRM) nas fichas de simulador/voo. 15 itens
--     correspondem à estrutura padrão internacional NOTECHS (JAR-OPS/CRM:
--     4 grupos, 4+4+3+4 = 15 elementos), amplamente publicada na literatura
--     de fatores humanos em aviação. Nomes de itens traduzidos para PT/EN.
--   operational_decision:
--     Seed é aditivo e universal (todas as empresas cadastradas em
--     `empresas` recebem os 15 itens + a categoria NOTECHS). Nenhuma coluna
--     nova, nenhuma tabela nova. Nenhum dado de tenant/PII é tocado —
--     apenas catálogo de referência (nomes de itens NOTECHS), sem CPF,
--     e-mail ou qualquer dado pessoal.
--   dry_run_required:
--     Antes de aplicar em produção:
--       1. Rodar em banco local/staging e confirmar 15 linhas em `manobras`
--          com categoria='NOTECHS' por empresa, e 1 linha em
--          `manobras_categorias` com codigo='NOTECHS' por empresa.
--       2. Confirmar que a query de catálogo das 22 manobras técnicas
--          (`WHERE tipo_sessao=? AND tipo_aeronave=?`) NÃO retorna os itens
--          NOTECHS (tipo_sessao/tipo_aeronave NULL não bate no filtro).
--       3. Confirmar que rodar a migration 2x não duplica linhas.
--   rollback_plan_required:
--     Rollback não requer reversão de DML "com perda" — é seed puramente
--     aditivo de catálogo de referência, não histórico de avaliação:
--       a. Reverter o Worker/deploy que injeta os itens nas fichas — o
--          catálogo NOTECHS em `manobras`/`manobras_categorias` coexiste
--          inofensivamente sem uso caso a feature seja desativada.
--       b. Se necessário remover o catálogo:
--          DELETE FROM manobras WHERE categoria = 'NOTECHS' AND empresa_id = ?;
--          DELETE FROM manobras_categorias WHERE codigo = 'NOTECHS' AND empresa_id = ?;
--          (nunca rodar isso se já houver fichas com itens NOTECHS
--          avaliados em fichas_sessao_manobras — nesse caso o catálogo deve
--          permanecer para preservar a legibilidade do histórico).
-- ============================================================================

-- ============================================================================
-- 1. Categoria NOTECHS em manobras_categorias (idempotente por empresa)
-- ============================================================================

INSERT OR IGNORE INTO manobras_categorias (codigo, nome, descricao, cor, icone, ordem, ativo, empresa_id, created_at, updated_at)
SELECT
  'NOTECHS' AS codigo,
  'NOTECHS' AS nome,
  'Non-Technical Skills / CRM — Cooperação, Liderança e Habilidades Gerenciais, Consciência Situacional, Tomada de Decisão.' AS descricao,
  '#7c3aed' AS cor,
  'users' AS icone,
  999 AS ordem,
  1 AS ativo,
  e.id AS empresa_id,
  datetime('now'),
  datetime('now')
FROM empresas e
WHERE e.deleted_at IS NULL;

-- ============================================================================
-- 2. 15 itens fixos NOTECHS em manobras (idempotente por empresa)
--    nome = título PT ; descricao = título EN ; ordem = 1001-1015 (reservado)
-- ============================================================================

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem, empresa_id, created_at, updated_at)
SELECT 'NOTECHS-01', 'Formação e Manutenção da Equipe', 'NOTECHS', 'Team Building and Maintaining', NULL, NULL, 1001, e.id, datetime('now'), datetime('now') FROM empresas e WHERE e.deleted_at IS NULL;

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem, empresa_id, created_at, updated_at)
SELECT 'NOTECHS-02', 'Consideração pelos Outros', 'NOTECHS', 'Considering Others', NULL, NULL, 1002, e.id, datetime('now'), datetime('now') FROM empresas e WHERE e.deleted_at IS NULL;

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem, empresa_id, created_at, updated_at)
SELECT 'NOTECHS-03', 'Apoio aos Outros', 'NOTECHS', 'Supporting Others', NULL, NULL, 1003, e.id, datetime('now'), datetime('now') FROM empresas e WHERE e.deleted_at IS NULL;

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem, empresa_id, created_at, updated_at)
SELECT 'NOTECHS-04', 'Resolução de Conflitos', 'NOTECHS', 'Conflict Solving', NULL, NULL, 1004, e.id, datetime('now'), datetime('now') FROM empresas e WHERE e.deleted_at IS NULL;

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem, empresa_id, created_at, updated_at)
SELECT 'NOTECHS-05', 'Uso da Autoridade e Assertividade', 'NOTECHS', 'Use of Authority and Assertiveness', NULL, NULL, 1005, e.id, datetime('now'), datetime('now') FROM empresas e WHERE e.deleted_at IS NULL;

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem, empresa_id, created_at, updated_at)
SELECT 'NOTECHS-06', 'Manutenção de Padrões', 'NOTECHS', 'Maintaining Standards', NULL, NULL, 1006, e.id, datetime('now'), datetime('now') FROM empresas e WHERE e.deleted_at IS NULL;

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem, empresa_id, created_at, updated_at)
SELECT 'NOTECHS-07', 'Planejamento e Coordenação', 'NOTECHS', 'Planning and Coordination', NULL, NULL, 1007, e.id, datetime('now'), datetime('now') FROM empresas e WHERE e.deleted_at IS NULL;

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem, empresa_id, created_at, updated_at)
SELECT 'NOTECHS-08', 'Gerenciamento da Carga de Trabalho', 'NOTECHS', 'Workload Management', NULL, NULL, 1008, e.id, datetime('now'), datetime('now') FROM empresas e WHERE e.deleted_at IS NULL;

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem, empresa_id, created_at, updated_at)
SELECT 'NOTECHS-09', 'Consciência dos Sistemas da Aeronave', 'NOTECHS', 'Aircraft Systems Awareness', NULL, NULL, 1009, e.id, datetime('now'), datetime('now') FROM empresas e WHERE e.deleted_at IS NULL;

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem, empresa_id, created_at, updated_at)
SELECT 'NOTECHS-10', 'Consciência do Ambiente Externo', 'NOTECHS', 'Awareness of External Environment', NULL, NULL, 1010, e.id, datetime('now'), datetime('now') FROM empresas e WHERE e.deleted_at IS NULL;

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem, empresa_id, created_at, updated_at)
SELECT 'NOTECHS-11', 'Consciência do Tempo', 'NOTECHS', 'Awareness of Time', NULL, NULL, 1011, e.id, datetime('now'), datetime('now') FROM empresas e WHERE e.deleted_at IS NULL;

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem, empresa_id, created_at, updated_at)
SELECT 'NOTECHS-12', 'Definição e Diagnóstico do Problema', 'NOTECHS', 'Problem Definition and Diagnosis', NULL, NULL, 1012, e.id, datetime('now'), datetime('now') FROM empresas e WHERE e.deleted_at IS NULL;

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem, empresa_id, created_at, updated_at)
SELECT 'NOTECHS-13', 'Geração de Opções', 'NOTECHS', 'Option Generation', NULL, NULL, 1013, e.id, datetime('now'), datetime('now') FROM empresas e WHERE e.deleted_at IS NULL;

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem, empresa_id, created_at, updated_at)
SELECT 'NOTECHS-14', 'Avaliação de Risco e Seleção de Opção', 'NOTECHS', 'Risk Assessment and Option Selection', NULL, NULL, 1014, e.id, datetime('now'), datetime('now') FROM empresas e WHERE e.deleted_at IS NULL;

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem, empresa_id, created_at, updated_at)
SELECT 'NOTECHS-15', 'Revisão do Resultado', 'NOTECHS', 'Outcome Review', NULL, NULL, 1015, e.id, datetime('now'), datetime('now') FROM empresas e WHERE e.deleted_at IS NULL;
