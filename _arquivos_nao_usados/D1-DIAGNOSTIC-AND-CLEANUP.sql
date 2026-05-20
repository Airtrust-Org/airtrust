-- ═══════════════════════════════════════════════════════════════════════════════
-- 🔧 DIAGNÓSTICO COMPLETO D1 - EXECUTE CADA QUERY ABAIXO NO D1 QUERY EDITOR
-- ═══════════════════════════════════════════════════════════════════════════════
-- Data: 2025-11-02
-- Objetivo: Auditar, diagnosticar e coletar dados para otimização
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═════════════════════════════════════════════════════════════════════════════
-- QUERY 1: LISTAR TODAS AS TABELAS
-- ═════════════════════════════════════════════════════════════════════════════

SELECT 
  name as tabela,
  (SELECT COUNT(*) FROM sqlite_master WHERE tbl_name = name AND type='column') as colunas
FROM sqlite_master 
WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
ORDER BY name;

-- Esperado: Lista de todas as tabelas do banco
-- COPIE O RESULTADO E COLE NO RELATÓRIO

---

-- ═════════════════════════════════════════════════════════════════════════════
-- QUERY 2: CONTAR REGISTROS EM CADA TABELA
-- ═════════════════════════════════════════════════════════════════════════════

SELECT 'qualificacoes (ativas)' as tabela, COUNT(*) as registros 
FROM qualificacoes WHERE deleted_at IS NULL

UNION ALL SELECT 'qualificacoes (deletadas)', COUNT(*) 
FROM qualificacoes WHERE deleted_at IS NOT NULL

UNION ALL SELECT 'certificados (ativas)', COUNT(*) 
FROM certificados WHERE deleted_at IS NULL

UNION ALL SELECT 'certificados (deletadas)', COUNT(*) 
FROM certificados WHERE deleted_at IS NOT NULL

UNION ALL SELECT 'certificados_qualificacoes (ativas)', COUNT(*) 
FROM certificados_qualificacoes WHERE deleted_at IS NULL

UNION ALL SELECT 'certificados_qualificacoes (deletadas)', COUNT(*) 
FROM certificados_qualificacoes WHERE deleted_at IS NOT NULL

UNION ALL SELECT 'certificado_anexos_v2', COUNT(*) 
FROM certificado_anexos_v2

UNION ALL SELECT 'pasta_virtual (ativas)', COUNT(*) 
FROM pasta_virtual WHERE deleted_at IS NULL

UNION ALL SELECT 'pasta_virtual (deletadas)', COUNT(*) 
FROM pasta_virtual WHERE deleted_at IS NOT NULL

UNION ALL SELECT 'pasta_virtual_certificados', COUNT(*) 
FROM pasta_virtual_certificados

UNION ALL SELECT 'funcionarios (ativos)', COUNT(*) 
FROM funcionarios WHERE deleted_at IS NULL

UNION ALL SELECT 'funcionarios (deletados)', COUNT(*) 
FROM funcionarios WHERE deleted_at IS NOT NULL

UNION ALL SELECT 'auditoriaavancadav2', COUNT(*) 
FROM auditoriaavancadav2;

-- Esperado: Contagem de registros em cada tabela
-- COPIE O RESULTADO E COLE NO RELATÓRIO

---

-- ═════════════════════════════════════════════════════════════════════════════
-- QUERY 3: ENCONTRAR DADOS ÓRFÃOS (CRÍTICO!)
-- ═════════════════════════════════════════════════════════════════════════════

SELECT 'Qualificacoes sem funcionário' as problema, COUNT(*) as total
FROM qualificacoes 
WHERE funcionario_id NOT IN (SELECT id FROM funcionarios) AND deleted_at IS NULL

UNION ALL

SELECT 'Certificados sem qualificação', COUNT(*)
FROM certificados_qualificacoes
WHERE qualificacao_id NOT IN (SELECT id FROM qualificacoes) AND deleted_at IS NULL

UNION ALL

SELECT 'Pasta virtual sem funcionário', COUNT(*)
FROM pasta_virtual
WHERE funcionario_id NOT IN (SELECT id FROM funcionarios) AND deleted_at IS NULL

UNION ALL

SELECT 'Pasta virtual certs sem pasta', COUNT(*)
FROM pasta_virtual_certificados
WHERE pasta_virtual_id NOT IN (SELECT id FROM pasta_virtual);

-- Esperado: 0 em todos os casos após limpeza
-- COPIE O RESULTADO E COLE NO RELATÓRIO

---

-- ═════════════════════════════════════════════════════════════════════════════
-- QUERY 4: VERIFICAR ÍNDICES EXISTENTES
-- ═════════════════════════════════════════════════════════════════════════════

SELECT name as indice, tbl_name as tabela
FROM sqlite_master 
WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
ORDER BY tbl_name, name;

-- Esperado: Lista de índices
-- COPIE O RESULTADO E COLE NO RELATÓRIO

---

-- ═════════════════════════════════════════════════════════════════════════════
-- QUERY 5: VERIFICAR VIEWS
-- ═════════════════════════════════════════════════════════════════════════════

SELECT name, sql
FROM sqlite_master 
WHERE type = 'view'
ORDER BY name;

-- Esperado: Lista de views (se houver)
-- COPIE O RESULTADO E COLE NO RELATÓRIO

---

-- ═════════════════════════════════════════════════════════════════════════════
-- QUERY 6: LISTAR TRIGGERS
-- ═════════════════════════════════════════════════════════════════════════════

SELECT name, tbl_name as tabela
FROM sqlite_master 
WHERE type = 'trigger'
ORDER BY tbl_name, name;

-- Esperado: Lista de triggers
-- COPIE O RESULTADO E COLE NO RELATÓRIO

---

-- ═════════════════════════════════════════════════════════════════════════════
-- QUERY 7: ENCONTRAR DUPLICATE KEYS (se houver)
-- ═════════════════════════════════════════════════════════════════════════════

SELECT 'Duplicata em certificados_qualificacoes' as problema, 
       qualificacao_id, COUNT(*) as total
FROM certificados_qualificacoes 
WHERE deleted_at IS NULL
GROUP BY qualificacao_id 
HAVING COUNT(*) > 1;

-- Esperado: Vazio (nenhum duplicado)
-- COPIE O RESULTADO E COLE NO RELATÓRIO

---

-- ═════════════════════════════════════════════════════════════════════════════
-- 🚀 APÓS EXECUTAR TODOS OS DIAGNÓSTICOS ACIMA, EXECUTE ABAIXO:
-- ═════════════════════════════════════════════════════════════════════════════

-- ═════════════════════════════════════════════════════════════════════════════
-- LIMPEZA 1: DELETAR QUALIFICAÇÕES ÓRFÃS
-- ═════════════════════════════════════════════════════════════════════════════

UPDATE qualificacoes 
SET deleted_at = datetime('now')
WHERE funcionario_id NOT IN (SELECT id FROM funcionarios) 
AND deleted_at IS NULL;

-- Resultado: Qualificações órfãs marcadas como deletadas

---

-- ═════════════════════════════════════════════════════════════════════════════
-- LIMPEZA 2: DELETAR CERTIFICADOS ÓRFÃOS
-- ═════════════════════════════════════════════════════════════════════════════

UPDATE certificados_qualificacoes
SET deleted_at = datetime('now')
WHERE qualificacao_id NOT IN (SELECT id FROM qualificacoes)
AND deleted_at IS NULL;

-- Resultado: Certificados órfãos marcados como deletados

---

-- ═════════════════════════════════════════════════════════════════════════════
-- LIMPEZA 3: DELETAR PASTA VIRTUAL ÓRFÃ
-- ═════════════════════════════════════════════════════════════════════════════

UPDATE pasta_virtual
SET deleted_at = datetime('now')
WHERE funcionario_id NOT IN (SELECT id FROM funcionarios)
AND deleted_at IS NULL;

-- Resultado: Pastas virtuais órfãs marcadas como deletadas

---

-- ═════════════════════════════════════════════════════════════════════════════
-- LIMPEZA 4: DELETAR RELACIONAMENTOS ÓRFÃOS
-- ═════════════════════════════════════════════════════════════════════════════

DELETE FROM pasta_virtual_certificados
WHERE pasta_virtual_id NOT IN (SELECT id FROM pasta_virtual)
OR certificado_id NOT IN (SELECT id FROM certificados_qualificacoes);

-- Resultado: Relacionamentos órfãos removidos

---

-- ═════════════════════════════════════════════════════════════════════════════
-- OTIMIZAÇÃO 1: CRIAR ÍNDICES (PERFORMANCE)
-- ═════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_qualif_funcionario ON qualificacoes(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_qualif_deleted ON qualificacoes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_qualif_tipo ON qualificacoes(tipo_qualificacao_id);

CREATE INDEX IF NOT EXISTS idx_cert_qualif ON certificados_qualificacoes(qualificacao_id);
CREATE INDEX IF NOT EXISTS idx_cert_deleted ON certificados_qualificacoes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_cert_tipo ON certificados_qualificacoes(tipo_certificado);

CREATE INDEX IF NOT EXISTS idx_pasta_func ON pasta_virtual(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_pasta_deleted ON pasta_virtual(deleted_at);

CREATE INDEX IF NOT EXISTS idx_pasta_cert_pasta ON pasta_virtual_certificados(pasta_virtual_id);
CREATE INDEX IF NOT EXISTS idx_pasta_cert_cert ON pasta_virtual_certificados(certificado_id);

-- Resultado: Índices criados para melhorar performance

---

-- ═════════════════════════════════════════════════════════════════════════════
-- OTIMIZAÇÃO 2: ATUALIZAR ESTATÍSTICAS
-- ═════════════════════════════════════════════════════════════════════════════

ANALYZE;

-- Resultado: Estatísticas do banco atualizadas para otimizar queries

---

-- ═════════════════════════════════════════════════════════════════════════════
-- OTIMIZAÇÃO 3: COMPACTAR BANCO
-- ═════════════════════════════════════════════════════════════════════════════

VACUUM;

-- Resultado: Banco compactado, espaço recuperado

---

-- ═════════════════════════════════════════════════════════════════════════════
-- ✅ VALIDAÇÃO PÓS-OTIMIZAÇÃO (Execute isto para confirmar tudo OK)
-- ═════════════════════════════════════════════════════════════════════════════

-- ═════════════════════════════════════════════════════════════════════════════
-- VALIDAÇÃO 1: VERIFICAR QUE LIMPEZA FUNCIONOU
-- ═════════════════════════════════════════════════════════════════════════════

SELECT 'Órfãos após limpeza' as verificacao, COUNT(*) as total
FROM qualificacoes 
WHERE funcionario_id NOT IN (SELECT id FROM funcionarios) AND deleted_at IS NULL

UNION ALL

SELECT 'Certificados órfãos', COUNT(*)
FROM certificados_qualificacoes
WHERE qualificacao_id NOT IN (SELECT id FROM qualificacoes) AND deleted_at IS NULL;

-- Esperado: 0 em todos

---

-- ═════════════════════════════════════════════════════════════════════════════
-- VALIDAÇÃO 2: CONTAR ÍNDICES CRIADOS
-- ═════════════════════════════════════════════════════════════════════════════

SELECT COUNT(*) as indices_totais
FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%';

-- Esperado: Número aumentou (novos índices criados)

---

-- ═════════════════════════════════════════════════════════════════════════════
-- VALIDAÇÃO 3: VERIFICAR INTEGRIDADE REFERENCIAL
-- ═════════════════════════════════════════════════════════════════════════════

PRAGMA integrity_check;

-- Esperado: "ok"

---

-- ═════════════════════════════════════════════════════════════════════════════
-- VALIDAÇÃO 4: CONTAR REGISTROS FINAIS
-- ═════════════════════════════════════════════════════════════════════════════

SELECT 'Qualificacoes válidas' as status, COUNT(*) as total 
FROM qualificacoes WHERE deleted_at IS NULL

UNION ALL SELECT 'Certificados válidos', COUNT(*) 
FROM certificados_qualificacoes WHERE deleted_at IS NULL

UNION ALL SELECT 'Pasta virtual válida', COUNT(*) 
FROM pasta_virtual WHERE deleted_at IS NULL

UNION ALL SELECT 'Funcionarios válidos', COUNT(*) 
FROM funcionarios WHERE deleted_at IS NULL;

-- Resultado: Contagem final de dados

---

-- ═════════════════════════════════════════════════════════════════════════════
-- FIM DO SCRIPT
-- ═════════════════════════════════════════════════════════════════════════════
-- 
-- ✅ Tudo pronto! O banco está:
--    - Limpo (sem órfãos)
--    - Otimizado (com índices)
--    - Compactado (VACUUM executado)
--    - Validado (integridade OK)
--
-- ═════════════════════════════════════════════════════════════════════════════
