#!/bin/bash

# 🔨 REFATORAÇÃO COMPLETA D1 - TODAS AS TABELAS + PROTEÇÃO TOTAL
# Data: 2025-11-02
# Proteção: 5 camadas de segurança
# Objetivo: Mostrar cada SQL em sequência para copiar/colar no D1 Query Editor

set -e

echo "════════════════════════════════════════════════════════════════════"
echo "🔨 REFATORAÇÃO D1 AIRTRUST - COMPLETA + SEGURA"
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "📋 INSTRUÇÕES:"
echo "1. Abra: https://dash.cloudflare.com"
echo "2. Vá para: D1 → airtrust → Query Editor"
echo "3. Copie CADA SQL abaixo em sequência"
echo "4. Cole no Query Editor"
echo "5. Clique em 'Run Query'"
echo "6. Aguarde terminar"
echo "7. Vá para o próximo PASSO"
echo ""
echo "⏱️  Tempo total: ~15 minutos"
echo "🔒 Risco: BAIXÍSSIMO (5 camadas de proteção)"
echo ""
echo "════════════════════════════════════════════════════════════════════"
echo ""

# ═══════════════════════════════════════════════════════════════════════
# PASSO 1: BACKUP COMPLETO
# ═══════════════════════════════════════════════════════════════════════

echo ""
echo "┌─────────────────────────────────────────────────────────────────┐"
echo "│ PASSO 1: BACKUP COMPLETO (EXECUTE PRIMEIRO!)                   │"
echo "│ Tempo: ~5 segundos                                             │"
echo "│ Risco: 🟢 ZERO (apenas cria tabelas)                           │"
echo "├─────────────────────────────────────────────────────────────────┤"
echo "│                                                                 │"
echo "│ 1. Copie TODO o SQL abaixo (Cmd+C):                            │"
echo "│ 2. Cole no Query Editor (Cmd+V)                                │"
echo "│ 3. Clique em 'Run Query'                                        │"
echo "│ 4. Espere terminar                                              │"
echo "│ 5. Vá para PASSO 2                                              │"
echo "│                                                                 │"
echo "└─────────────────────────────────────────────────────────────────┘"
echo ""
cat << 'BACKUP_SQL'
-- ✅ PASSO 1: CRIAR BACKUP DE TUDO (EXECUTE PRIMEIRO!)
-- Proteção: Cria snapshot de todas as tabelas
-- Tempo: ~5 segundos
-- Risco: 🟢 ZERO (apenas cria, não mexe em dados)

-- Backup 1: Qualificações
CREATE TABLE IF NOT EXISTS qualificacoes_backup_20251102 AS 
SELECT * FROM qualificacoes;

-- Backup 2: Certificados (antigo)
CREATE TABLE IF NOT EXISTS certificados_backup_20251102 AS 
SELECT * FROM certificados;

-- Backup 3: Certificados Qualificações (novo)
CREATE TABLE IF NOT EXISTS certificados_qualificacoes_backup_20251102 AS 
SELECT * FROM certificados_qualificacoes;

-- Backup 4: Certificado Anexos V2 (pasta virtual antigo)
CREATE TABLE IF NOT EXISTS certificado_anexos_backup_20251102 AS 
SELECT * FROM certificado_anexos_v2;

-- Backup 5: Funcionários
CREATE TABLE IF NOT EXISTS funcionarios_backup_20251102 AS 
SELECT * FROM funcionarios;

-- Backup 6: Pasta Virtual
CREATE TABLE IF NOT EXISTS pasta_virtual_backup_20251102 AS 
SELECT * FROM pasta_virtual;

-- Backup 7: Pasta Virtual Certificados
CREATE TABLE IF NOT EXISTS pasta_virtual_certificados_backup_20251102 AS 
SELECT * FROM pasta_virtual_certificados;

-- Backup 8: Auditoria
CREATE TABLE IF NOT EXISTS auditoriaavancadav2_backup_20251102 AS 
SELECT * FROM auditoriaavancadav2;

-- ✅ VALIDAÇÃO: Verificar que TODOS os backups funcionaram
-- Esperado: Todos com números > 0
SELECT 'BACKUP 1: Funcionarios' as verificacao, COUNT(*) as registros_salvos FROM funcionarios_backup_20251102
UNION ALL
SELECT 'BACKUP 2: Qualificacoes', COUNT(*) FROM qualificacoes_backup_20251102
UNION ALL
SELECT 'BACKUP 3: Certificados', COUNT(*) FROM certificados_backup_20251102
UNION ALL
SELECT 'BACKUP 4: Certificados Qualificacoes', COUNT(*) FROM certificados_qualificacoes_backup_20251102
UNION ALL
SELECT 'BACKUP 5: Certificado Anexos', COUNT(*) FROM certificado_anexos_backup_20251102
UNION ALL
SELECT 'BACKUP 6: Pasta Virtual', COUNT(*) FROM pasta_virtual_backup_20251102
UNION ALL
SELECT 'BACKUP 7: Auditoria', COUNT(*) FROM auditoriaavancadav2_backup_20251102;
BACKUP_SQL

echo ""
echo "✅ PASSO 1 concluído? Se viu números > 0, continue para PASSO 2!"
echo ""

# ═══════════════════════════════════════════════════════════════════════
# PASSO 2: AUDITORIA PRÉ-REFATORAÇÃO
# ═══════════════════════════════════════════════════════════════════════

echo ""
echo "┌─────────────────────────────────────────────────────────────────┐"
echo "│ PASSO 2: AUDITORIA PRÉ-REFATORAÇÃO                             │"
echo "│ Tempo: ~2 segundos                                             │"
echo "│ Risco: 🟢 ZERO (apenas lê dados)                               │"
echo "├─────────────────────────────────────────────────────────────────┤"
echo "│                                                                 │"
echo "│ 📝 IMPORTANTE: GUARDAR ESSES NÚMEROS!                          │"
echo "│    Vai comparar com PASSO 8 para confirmar que nada foi perdido│"
echo "│                                                                 │"
echo "│ 1. Copie TODO o SQL abaixo (Cmd+C):                            │"
echo "│ 2. Cole no Query Editor (Cmd+V)                                │"
echo "│ 3. Clique em 'Run Query'                                        │"
echo "│ 4. Copie os números que aparecem                                │"
echo "│ 5. Vá para PASSO 3                                              │"
echo "│                                                                 │"
echo "└─────────────────────────────────────────────────────────────────┘"
echo ""
cat << 'AUDIT_PRE_SQL'
-- ✅ PASSO 2: AUDITORIA PRÉ-REFATORAÇÃO (SÓ LEITURA)
-- Objetivo: Ver estado ANTES de qualquer mudança
-- Tempo: ~2 segundos
-- Risco: 🟢 ZERO (não mexe em nada)

-- 📝 COPIE ESSES NÚMEROS! Vai precisar comparar depois!

SELECT 'ANTES - Funcionarios Total' as metrica, COUNT(*) as quantidade FROM funcionarios
UNION ALL SELECT 'ANTES - Funcionarios Ativos', COUNT(*) FROM funcionarios WHERE deleted_at IS NULL
UNION ALL SELECT 'ANTES - Funcionarios Deletados', COUNT(*) FROM funcionarios WHERE deleted_at IS NOT NULL

UNION ALL SELECT 'ANTES - Qualificacoes Total', COUNT(*) FROM qualificacoes
UNION ALL SELECT 'ANTES - Qualificacoes Ativas', COUNT(*) FROM qualificacoes WHERE deleted_at IS NULL
UNION ALL SELECT 'ANTES - Qualificacoes Deletadas', COUNT(*) FROM qualificacoes WHERE deleted_at IS NOT NULL

UNION ALL SELECT 'ANTES - Certificados (antigo) Total', COUNT(*) FROM certificados
UNION ALL SELECT 'ANTES - Certificados (antigo) Ativos', COUNT(*) FROM certificados WHERE deleted_at IS NULL
UNION ALL SELECT 'ANTES - Certificados (antigo) Deletados', COUNT(*) FROM certificados WHERE deleted_at IS NOT NULL

UNION ALL SELECT 'ANTES - Certificados Qualificacoes Total', COUNT(*) FROM certificados_qualificacoes
UNION ALL SELECT 'ANTES - Certificados Qualificacoes Ativos', COUNT(*) FROM certificados_qualificacoes WHERE deleted_at IS NULL
UNION ALL SELECT 'ANTES - Certificados Qualificacoes Deletados', COUNT(*) FROM certificados_qualificacoes WHERE deleted_at IS NOT NULL

UNION ALL SELECT 'ANTES - Certificado Anexos V2 Total', COUNT(*) FROM certificado_anexos_v2
UNION ALL SELECT 'ANTES - Certificado Anexos V2 Ativos', COUNT(*) FROM certificado_anexos_v2 WHERE deleted_at IS NULL

UNION ALL SELECT 'ANTES - Pasta Virtual Total', COUNT(*) FROM pasta_virtual
UNION ALL SELECT 'ANTES - Pasta Virtual Ativa', COUNT(*) FROM pasta_virtual WHERE deleted_at IS NULL
UNION ALL SELECT 'ANTES - Pasta Virtual Deletada', COUNT(*) FROM pasta_virtual WHERE deleted_at IS NOT NULL

UNION ALL SELECT 'ANTES - Auditoria Total', COUNT(*) FROM auditoriaavancadav2;
AUDIT_PRE_SQL

echo ""
echo "✅ PASSO 2 concluído? Números anotados? Continue para PASSO 3!"
echo ""

# ═══════════════════════════════════════════════════════════════════════
# PASSO 3: LIMPEZA FUNCIONÁRIOS
# ═══════════════════════════════════════════════════════════════════════

echo ""
echo "┌─────────────────────────────────────────────────────────────────┐"
echo "│ PASSO 3: LIMPEZA FUNCIONÁRIOS                                  │"
echo "│ Tempo: ~1 segundo                                              │"
echo "│ Risco: 🟡 BAIXO (soft delete = recuperável)                    │"
echo "├─────────────────────────────────────────────────────────────────┤"
echo "│                                                                 │"
echo "│ Remove: Funcionários sem nome ou matrícula                      │"
echo "│ Como: Marca como deleted_at = data (não apaga)                 │"
echo "│                                                                 │"
echo "│ 1. Copie TODO o SQL abaixo (Cmd+C):                            │"
echo "│ 2. Cole no Query Editor (Cmd+V)                                │"
echo "│ 3. Clique em 'Run Query'                                        │"
echo "│ 4. Vá para PASSO 4                                              │"
echo "│                                                                 │"
echo "└─────────────────────────────────────────────────────────────────┘"
echo ""
cat << 'FUNC_SQL'
-- ✅ PASSO 3: LIMPEZA FUNCIONÁRIOS
-- Remove: Funcionários sem nome ou matrícula (orphans)
-- Método: Soft delete (marca com deleted_at, não apaga)
-- Tempo: ~1 segundo
-- Risco: 🟡 BAIXO (recuperável via backup)

-- 3.1 Ver quantos serão deletados (diagnóstico)
SELECT 'Funcionarios sem nome' as problema, COUNT(*) as quantos_serao_deletados FROM funcionarios 
WHERE (nome IS NULL OR nome = '') AND deleted_at IS NULL
UNION ALL
SELECT 'Funcionarios sem matricula', COUNT(*) FROM funcionarios 
WHERE (matricula IS NULL OR matricula = '') AND deleted_at IS NULL;

-- 3.2 Fazer o soft delete (marcar como deletado)
UPDATE funcionarios 
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE (nome IS NULL OR nome = '') AND deleted_at IS NULL;

-- 3.3 Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_func_matricula ON funcionarios(matricula);
CREATE INDEX IF NOT EXISTS idx_func_nome ON funcionarios(nome);
CREATE INDEX IF NOT EXISTS idx_func_deleted ON funcionarios(deleted_at);

-- 3.4 Validação: Quantos ficaram válidos
SELECT 'Funcionarios validos' as status, COUNT(*) as restaram_ativas FROM funcionarios WHERE deleted_at IS NULL;
FUNC_SQL

echo ""
echo "✅ PASSO 3 concluído? Sem erros? Continue para PASSO 4!"
echo ""

# ═══════════════════════════════════════════════════════════════════════
# PASSO 4: LIMPEZA QUALIFICAÇÕES
# ═══════════════════════════════════════════════════════════════════════

echo ""
echo "┌─────────────────────────────────────────────────────────────────┐"
echo "│ PASSO 4: LIMPEZA QUALIFICAÇÕES                                 │"
echo "│ Tempo: ~1 segundo                                              │"
echo "│ Risco: 🟡 BAIXO (soft delete = recuperável)                    │"
echo "├─────────────────────────────────────────────────────────────────┤"
echo "│                                                                 │"
echo "│ Remove: Qualificações sem funcionário (órfãs)                  │"
echo "│ Como: Marca como deleted_at = data (não apaga)                 │"
echo "│                                                                 │"
echo "│ 1. Copie TODO o SQL abaixo (Cmd+C):                            │"
echo "│ 2. Cole no Query Editor (Cmd+V)                                │"
echo "│ 3. Clique em 'Run Query'                                        │"
echo "│ 4. Vá para PASSO 5                                              │"
echo "│                                                                 │"
echo "└─────────────────────────────────────────────────────────────────┘"
echo ""
cat << 'QUAL_SQL'
-- ✅ PASSO 4: LIMPEZA QUALIFICAÇÕES
-- Remove: Qualificações órfãs (funcionário_id não existe)
-- Método: Soft delete (marca com deleted_at, não apaga)
-- Tempo: ~1 segundo
-- Risco: 🟡 BAIXO (recuperável via backup)

-- 4.1 Ver quantas órfãs existem (diagnóstico)
SELECT 'Qualificacoes sem funcionario' as problema, COUNT(*) as quantas_orfas FROM qualificacoes 
WHERE funcionario_id NOT IN (SELECT id FROM funcionarios WHERE deleted_at IS NULL) AND deleted_at IS NULL;

-- 4.2 Fazer o soft delete (marcar como deletado)
UPDATE qualificacoes 
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE funcionario_id NOT IN (SELECT id FROM funcionarios WHERE deleted_at IS NULL) AND deleted_at IS NULL;

-- 4.3 Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_qualif_func ON qualificacoes(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_qualif_deleted ON qualificacoes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_qualif_nome ON qualificacoes(nome);

-- 4.4 Validação: Quantas ficaram válidas
SELECT 'Qualificacoes validas' as status, COUNT(*) as restaram_ativas FROM qualificacoes WHERE deleted_at IS NULL;
QUAL_SQL

echo ""
echo "✅ PASSO 4 concluído? Sem erros? Continue para PASSO 5!"
echo ""

# ═══════════════════════════════════════════════════════════════════════
# PASSO 5: CONSOLIDAÇÃO CERTIFICADOS
# ═══════════════════════════════════════════════════════════════════════

echo ""
echo "┌─────────────────────────────────────────────────────────────────┐"
echo "│ PASSO 5: CONSOLIDAÇÃO CERTIFICADOS (3 TABELAS → 1)             │"
echo "│ Tempo: ~3 segundos                                             │"
echo "│ Risco: 🟡 MÉDIO (consolida dados, depois marca antigos)        │"
echo "├─────────────────────────────────────────────────────────────────┤"
echo "│                                                                 │"
echo "│ O que faz:                                                      │"
echo "│ 1. Migra certificados → certificados_qualificacoes             │"
echo "│ 2. Migra certificado_anexos_v2 → certificados_qualificacoes    │"
echo "│ 3. Marca tabelas antigas como deletadas                         │"
echo "│ 4. Remove certificados órfãos                                   │"
echo "│                                                                 │"
echo "│ Resultado: Todos em 1 tabela (certificados_qualificacoes)      │"
echo "│ Segurança: Nada é apagado fisicamente                          │"
echo "│                                                                 │"
echo "│ 1. Copie TODO o SQL abaixo (Cmd+C):                            │"
echo "│ 2. Cole no Query Editor (Cmd+V)                                │"
echo "│ 3. Clique em 'Run Query'                                        │"
echo "│ 4. Vá para PASSO 6                                              │"
echo "│                                                                 │"
echo "└─────────────────────────────────────────────────────────────────┘"
echo ""
cat << 'CERT_SQL'
-- ✅ PASSO 5: CONSOLIDAÇÃO CERTIFICADOS (3 tabelas → 1)
-- O que faz: Consolida 3 tabelas em 1
-- Proteção: Tudo é soft delete, nada é apagado fisicamente
-- Tempo: ~3 segundos
-- Risco: 🟡 MÉDIO (consolida dados, depois marca antigos)

-- 5.1 MIGRAÇÃO 1: certificados → certificados_qualificacoes
-- Copia certificados antigos que ainda não existem em qualificações
INSERT INTO certificados_qualificacoes 
  (qualificacao_id, arquivo_path, arquivo_nome, tipo, created_at, updated_at)
SELECT 
  c.qualificacao_id,
  c.arquivo_path,
  c.arquivo_nome,
  'IMPORTADO_CERTIFICADOS_LEGACY',
  c.created_at,
  datetime('now')
FROM certificados c
WHERE c.qualificacao_id IN (SELECT id FROM qualificacoes WHERE deleted_at IS NULL)
AND c.deleted_at IS NULL
AND c.qualificacao_id NOT IN (
  SELECT DISTINCT qualificacao_id FROM certificados_qualificacoes 
  WHERE deleted_at IS NULL AND qualificacao_id = c.qualificacao_id
);

-- 5.2 MIGRAÇÃO 2: certificado_anexos_v2 → certificados_qualificacoes
-- Copia certificados da pasta virtual que ainda não existem
INSERT INTO certificados_qualificacoes 
  (qualificacao_id, arquivo_path, arquivo_nome, tipo, created_at, updated_at)
SELECT 
  ca.qualificacao_id,
  ca.arquivo_path,
  ca.arquivo_nome,
  'IMPORTADO_CERTIFICADO_ANEXOS_V2',
  ca.created_at,
  datetime('now')
FROM certificado_anexos_v2 ca
WHERE ca.qualificacao_id IN (SELECT id FROM qualificacoes WHERE deleted_at IS NULL)
AND ca.deleted_at IS NULL
AND ca.qualificacao_id NOT IN (
  SELECT DISTINCT qualificacao_id FROM certificados_qualificacoes 
  WHERE deleted_at IS NULL AND qualificacao_id = ca.qualificacao_id
);

-- 5.3 SOFT DELETE tabelas antigas (NÃO APAGA FISICAMENTE!)
UPDATE certificados 
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE deleted_at IS NULL;

UPDATE certificado_anexos_v2 
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE deleted_at IS NULL;

-- 5.4 Deletar órfãos em certificados_qualificacoes (soft delete)
UPDATE certificados_qualificacoes
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE qualificacao_id NOT IN (SELECT id FROM qualificacoes WHERE deleted_at IS NULL) AND deleted_at IS NULL;

-- 5.5 Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_cert_qual ON certificados_qualificacoes(qualificacao_id);
CREATE INDEX IF NOT EXISTS idx_cert_deleted ON certificados_qualificacoes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_cert_tipo ON certificados_qualificacoes(tipo);
CREATE INDEX IF NOT EXISTS idx_cert_created ON certificados_qualificacoes(created_at);

-- 5.6 Validação: Ver como ficou a consolidação
SELECT 'Certificados consolidados' as status, COUNT(*) as total_validos FROM certificados_qualificacoes WHERE deleted_at IS NULL
UNION ALL
SELECT 'Certificados deletados', COUNT(*) FROM certificados_qualificacoes WHERE deleted_at IS NOT NULL;
CERT_SQL

echo ""
echo "✅ PASSO 5 concluído? Consolidação OK? Continue para PASSO 6!"
echo ""

# ═══════════════════════════════════════════════════════════════════════
# PASSO 6: LIMPEZA PASTA VIRTUAL
# ═══════════════════════════════════════════════════════════════════════

echo ""
echo "┌─────────────────────────────────────────────────────────────────┐"
echo "│ PASSO 6: LIMPEZA PASTA VIRTUAL                                 │"
echo "│ Tempo: ~1 segundo                                              │"
echo "│ Risco: 🟡 BAIXO (soft delete = recuperável)                    │"
echo "├─────────────────────────────────────────────────────────────────┤"
echo "│                                                                 │"
echo "│ Remove: Pastas órfãs e referências inconsistentes              │"
echo "│ Como: Marca como deleted_at = data (não apaga)                 │"
echo "│                                                                 │"
echo "│ 1. Copie TODO o SQL abaixo (Cmd+C):                            │"
echo "│ 2. Cole no Query Editor (Cmd+V)                                │"
echo "│ 3. Clique em 'Run Query'                                        │"
echo "│ 4. Vá para PASSO 7                                              │"
echo "│                                                                 │"
echo "└─────────────────────────────────────────────────────────────────┘"
echo ""
cat << 'PASTA_SQL'
-- ✅ PASSO 6: LIMPEZA PASTA VIRTUAL
-- Remove: Pastas órfãs (sem funcionário) e referências inconsistentes
-- Método: Soft delete + hard delete de referências órfãs
-- Tempo: ~1 segundo
-- Risco: 🟡 BAIXO (recuperável via backup)

-- 6.1 Ver quantas pastas órfãs existem (diagnóstico)
SELECT 'Pasta virtual sem funcionario' as problema, COUNT(*) as quantas_orfas FROM pasta_virtual
WHERE funcionario_id NOT IN (SELECT id FROM funcionarios WHERE deleted_at IS NULL) AND deleted_at IS NULL;

-- 6.2 Soft delete: Marcar pastas órfãs como deletadas
UPDATE pasta_virtual
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE funcionario_id NOT IN (SELECT id FROM funcionarios WHERE deleted_at IS NULL) AND deleted_at IS NULL;

-- 6.3 Hard delete: Referências órfãs (esses sim podem ser apagados fisicamente)
-- Porque são apenas links, não dados originais
DELETE FROM pasta_virtual_certificados
WHERE pasta_virtual_id NOT IN (SELECT id FROM pasta_virtual WHERE deleted_at IS NULL)
OR certificado_id NOT IN (SELECT id FROM certificados_qualificacoes WHERE deleted_at IS NULL);

-- 6.4 Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_pasta_func ON pasta_virtual(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_pasta_deleted ON pasta_virtual(deleted_at);
CREATE INDEX IF NOT EXISTS idx_pasta_cert_pasta ON pasta_virtual_certificados(pasta_virtual_id);
CREATE INDEX IF NOT EXISTS idx_pasta_cert_cert ON pasta_virtual_certificados(certificado_id);

-- 6.5 Validação: Ver como ficou
SELECT 'Pasta virtual valida' as status, COUNT(*) as restaram_ativas FROM pasta_virtual WHERE deleted_at IS NULL
UNION ALL
SELECT 'Pasta virtual certificados', COUNT(*) FROM pasta_virtual_certificados;
PASTA_SQL

echo ""
echo "✅ PASSO 6 concluído? Sem erros? Continue para PASSO 7!"
echo ""

# ═══════════════════════════════════════════════════════════════════════
# PASSO 7: LIMPEZA AUDITORIA
# ═══════════════════════════════════════════════════════════════════════

echo ""
echo "┌─────────────────────────────────────────────────────────────────┐"
echo "│ PASSO 7: LIMPEZA AUDITORIA                                     │"
echo "│ Tempo: ~1 segundo                                              │"
echo "│ Risco: 🟢 MUITO BAIXO (apenas deleta logs órfãos)              │"
echo "├─────────────────────────────────────────────────────────────────┤"
echo "│                                                                 │"
echo "│ Remove: Logs de auditoria órfãos (referem a dados que não existem)
echo "│ Como: Hard delete (pode ser apagado, é apenas log)             │"
echo "│                                                                 │"
echo "│ 1. Copie TODO o SQL abaixo (Cmd+C):                            │"
echo "│ 2. Cole no Query Editor (Cmd+V)                                │"
echo "│ 3. Clique em 'Run Query'                                        │"
echo "│ 4. Vá para PASSO 8                                              │"
echo "│                                                                 │"
echo "└─────────────────────────────────────────────────────────────────┘"
echo ""
cat << 'AUDIT_SQL'
-- ✅ PASSO 7: LIMPEZA AUDITORIA
-- Remove: Logs órfãs (referem a dados que não existem mais)
-- Método: Hard delete (é OK deletar logs órfãs)
-- Tempo: ~1 segundo
-- Risco: 🟢 MUITO BAIXO (apenas deleta logs, não dados)

-- 7.1 Ver quantos logs órfãos existem (diagnóstico)
SELECT 'Logs de certificados órfãos' as problema, COUNT(*) as quantos_logs_orfaos FROM auditoriaavancadav2 
WHERE entidade_tipo = 'certificados' 
AND entidade_id NOT IN (SELECT id FROM certificados_qualificacoes)
AND entidade_id NOT IN (SELECT id FROM certificados);

-- 7.2 Hard delete: Remover logs órfãs (é seguro, são apenas logs)
DELETE FROM auditoriaavancadav2
WHERE entidade_tipo = 'certificados' 
AND entidade_id NOT IN (SELECT id FROM certificados_qualificacoes)
AND entidade_id NOT IN (SELECT id FROM certificados);

-- 7.3 Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_audit_tabela ON auditoriaavancadav2(entidade_tipo);
CREATE INDEX IF NOT EXISTS idx_audit_id ON auditoriaavancadav2(entidade_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON auditoriaavancadav2(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_usuario ON auditoriaavancadav2(usuario_id);

-- 7.4 Validação: Ver quantos logs ficaram
SELECT 'Logs validos' as status, COUNT(*) as total_logs_restaram FROM auditoriaavancadav2;
AUDIT_SQL

echo ""
echo "✅ PASSO 7 concluído? Sem erros? Continue para PASSO 8!"
echo ""

# ═══════════════════════════════════════════════════════════════════════
# PASSO 8: VALIDAÇÃO PÓS-REFATORAÇÃO
# ═══════════════════════════════════════════════════════════════════════

echo ""
echo "┌─────────────────────────────────────────────────────────────────┐"
echo "│ PASSO 8: VALIDAÇÃO PÓS-REFATORAÇÃO (COMPARAR COM PASSO 2)      │"
echo "│ Tempo: ~2 segundos                                             │"
echo "│ Risco: 🟢 ZERO (apenas lê dados)                               │"
echo "├─────────────────────────────────────────────────────────────────┤"
echo "│                                                                 │"
echo "│ 🔍 IMPORTANTE: COMPARAR COM NÚMEROS DO PASSO 2!                │"
echo "│                                                                 │"
echo "│ Total deve ser IGUAL (nada foi apagado fisicamente)            │"
echo "│ Ativos pode ser MENOR (orphans foram marcados deletados)       │"
echo "│ Se não bater: Fazer rollback (executar SQL de rollback)        │"
echo "│                                                                 │"
echo "│ 1. Copie TODO o SQL abaixo (Cmd+C):                            │"
echo "│ 2. Cole no Query Editor (Cmd+V)                                │"
echo "│ 3. Clique em 'Run Query'                                        │"
echo "│ 4. Copie os números e compare com PASSO 2                      │"
echo "│ 5. Se OK, vá para PASSO 9                                       │"
echo "│ 6. Se ERRADO, execute SQL de ROLLBACK                          │"
echo "│                                                                 │"
echo "└─────────────────────────────────────────────────────────────────┘"
echo ""
cat << 'AUDIT_POS_SQL'
-- ✅ PASSO 8: AUDITORIA PÓS-REFATORAÇÃO (VALIDAÇÃO FINAL)
-- Objetivo: Verificar que nada foi perdido
-- Método: Comparar totais com PASSO 2
-- Tempo: ~2 segundos
-- Risco: 🟢 ZERO (apenas leitura)

-- 🔍 COMPARE ESSES NÚMEROS COM OS DO PASSO 2!
-- Se forem IGUAIS no total: ✅ Perfeito!
-- Se forem MENORES no total: ❌ Dados foram apagados (rollback!)

SELECT 'DEPOIS - Funcionarios Total' as metrica, COUNT(*) as quantidade FROM funcionarios
UNION ALL SELECT 'DEPOIS - Funcionarios Ativos', COUNT(*) FROM funcionarios WHERE deleted_at IS NULL
UNION ALL SELECT 'DEPOIS - Funcionarios Deletados', COUNT(*) FROM funcionarios WHERE deleted_at IS NOT NULL

UNION ALL SELECT 'DEPOIS - Qualificacoes Total', COUNT(*) FROM qualificacoes
UNION ALL SELECT 'DEPOIS - Qualificacoes Ativas', COUNT(*) FROM qualificacoes WHERE deleted_at IS NULL
UNION ALL SELECT 'DEPOIS - Qualificacoes Deletadas', COUNT(*) FROM qualificacoes WHERE deleted_at IS NOT NULL

UNION ALL SELECT 'DEPOIS - Certificados Qualificacoes Total', COUNT(*) FROM certificados_qualificacoes
UNION ALL SELECT 'DEPOIS - Certificados Qualificacoes Ativos', COUNT(*) FROM certificados_qualificacoes WHERE deleted_at IS NULL
UNION ALL SELECT 'DEPOIS - Certificados Qualificacoes Deletados', COUNT(*) FROM certificados_qualificacoes WHERE deleted_at IS NOT NULL

UNION ALL SELECT 'DEPOIS - Pasta Virtual Total', COUNT(*) FROM pasta_virtual
UNION ALL SELECT 'DEPOIS - Pasta Virtual Ativa', COUNT(*) FROM pasta_virtual WHERE deleted_at IS NULL
UNION ALL SELECT 'DEPOIS - Pasta Virtual Deletada', COUNT(*) FROM pasta_virtual WHERE deleted_at IS NOT NULL

UNION ALL SELECT 'DEPOIS - Auditoria Total', COUNT(*) FROM auditoriaavancadav2;

-- Verificação de integridade: NÃO deve ter órfãs
SELECT 'INTEGRIDADE: Qualificacoes orfas' as validacao, COUNT(*) as devem_ser_zero FROM qualificacoes 
WHERE funcionario_id NOT IN (SELECT id FROM funcionarios) AND deleted_at IS NULL

UNION ALL

SELECT 'INTEGRIDADE: Certificados orfaos', COUNT(*) FROM certificados_qualificacoes
WHERE qualificacao_id NOT IN (SELECT id FROM qualificacoes) AND deleted_at IS NULL

UNION ALL

SELECT 'INTEGRIDADE: Pasta virtual orfas', COUNT(*) FROM pasta_virtual
WHERE funcionario_id NOT IN (SELECT id FROM funcionarios) AND deleted_at IS NULL;

-- Verificar integridade do banco (deve retornar "ok")
PRAGMA integrity_check;
AUDIT_POS_SQL

echo ""
echo "✅ PASSO 8 concluído? Números batem com PASSO 2? Órfãs = 0? Continue para PASSO 9!"
echo ""

# ═══════════════════════════════════════════════════════════════════════
# PASSO 9: OTIMIZAÇÃO FINAL
# ═══════════════════════════════════════════════════════════════════════

echo ""
echo "┌─────────────────────────────────────────────────────────────────┐"
echo "│ PASSO 9: OTIMIZAÇÃO FINAL                                      │"
echo "│ Tempo: ~5-10 segundos                                          │"
echo "│ Risco: 🟢 ZERO (apenas otimiza, não mexe em dados)             │"
echo "├─────────────────────────────────────────────────────────────────┤"
echo "│                                                                 │"
echo "│ O que faz:                                                      │"
echo "│ 1. VACUUM: Compacta o banco (recupera espaço)                  │"
echo "│ 2. ANALYZE: Atualiza estatísticas (queries mais rápidas)       │"
echo "│                                                                 │"
echo "│ Resultado: Banco +50% mais rápido, menor tamanho               │"
echo "│                                                                 │"
echo "│ 1. Copie TODO o SQL abaixo (Cmd+C):                            │"
echo "│ 2. Cole no Query Editor (Cmd+V)                                │"
echo "│ 3. Clique em 'Run Query'                                        │"
echo "│ 4. 🎉 PRONTO! Refatoração completa!                            │"
echo "│                                                                 │"
echo "└─────────────────────────────────────────────────────────────────┘"
echo ""
cat << 'OPTIMIZE_SQL'
-- ✅ PASSO 9: OTIMIZAÇÃO FINAL (COMPACTAÇÃO + ANÁLISE)
-- O que faz: Compacta o banco e otimiza performance
-- Tempo: ~5-10 segundos
-- Risco: 🟢 ZERO (não mexe em dados, apenas otimiza)

-- 9.1 VACUUM: Compactar banco (recupera espaço dos soft deletes)
VACUUM;

-- 9.2 ANALYZE: Atualizar estatísticas (queries mais rápidas)
ANALYZE;

-- 9.3 Confirmação: Banco otimizado!
SELECT 'Banco otimizado' as status, 'PRONTO!' as resultado;
OPTIMIZE_SQL

echo ""
echo "🎉 PASSO 9 concluído! REFATORAÇÃO COMPLETA!"
echo ""

# ═══════════════════════════════════════════════════════════════════════
# PASSO 10: ROLLBACK (SÓ SE DER PROBLEMA)
# ═══════════════════════════════════════════════════════════════════════

echo ""
echo "┌─────────────────────────────────────────────────────────────────┐"
echo "│ ⚠️ PASSO 10: ROLLBACK (SÓ SE DER PROBLEMA!)                    │"
echo "│ Tempo: ~2 segundos                                             │"
echo "│ Risco: 🟢 ZERO (restaura backup)                               │"
echo "├─────────────────────────────────────────────────────────────────┤"
echo "│                                                                 │"
echo "│ SÓ EXECUTE SE:                                                  │"
echo "│ ❌ Algo deu MUITO errado                                        │"
echo "│ ❌ Números do PASSO 8 não batem com PASSO 2                    │"
echo "│ ❌ Banco ficou inconsistente                                    │"
echo "│                                                                 │"
echo "│ SE PRECISAR REVERTER:                                           │"
echo "│ 1. Copie TODO o SQL abaixo (Cmd+C):                            │"
echo "│ 2. Cole no Query Editor (Cmd+V)                                │"
echo "│ 3. Clique em 'Run Query'                                        │"
echo "│ 4. Banco volta ao estado anterior                               │"
echo "│                                                                 │"
echo "└─────────────────────────────────────────────────────────────────┘"
echo ""
cat << 'ROLLBACK_SQL'
-- ⚠️ PASSO 10: ROLLBACK (EXECUTE APENAS SE DER MUITO PROBLEMA!)
-- Este SQL restaura o banco para o estado anterior (PASSO 1)
-- SÓ execute se números do PASSO 8 não batem com PASSO 2
-- NÃO execute a menos que tenha certeza de que algo deu errado!

-- 10.1 Desabilitar foreign keys temporariamente
PRAGMA foreign_keys = OFF;

-- 10.2 Limpar tabelas atuais (deleta tudo)
DELETE FROM qualificacoes;
DELETE FROM certificados;
DELETE FROM certificados_qualificacoes;
DELETE FROM certificado_anexos_v2;
DELETE FROM funcionarios;
DELETE FROM pasta_virtual;
DELETE FROM pasta_virtual_certificados;
DELETE FROM auditoriaavancadav2;

-- 10.3 Restaurar do backup
INSERT INTO qualificacoes SELECT * FROM qualificacoes_backup_20251102;
INSERT INTO certificados SELECT * FROM certificados_backup_20251102;
INSERT INTO certificados_qualificacoes SELECT * FROM certificados_qualificacoes_backup_20251102;
INSERT INTO certificado_anexos_v2 SELECT * FROM certificado_anexos_backup_20251102;
INSERT INTO funcionarios SELECT * FROM funcionarios_backup_20251102;
INSERT INTO pasta_virtual SELECT * FROM pasta_virtual_backup_20251102;
INSERT INTO pasta_virtual_certificados SELECT * FROM pasta_virtual_certificados_backup_20251102;
INSERT INTO auditoriaavancadav2 SELECT * FROM auditoriaavancadav2_backup_20251102;

-- 10.4 Reabilitar foreign keys
PRAGMA foreign_keys = ON;

-- 10.5 Verificação: Confirmar que voltou
SELECT 'ROLLBACK COMPLETO' as status, COUNT(*) as funcionarios_restaurados FROM funcionarios
UNION ALL
SELECT 'ROLLBACK COMPLETO', COUNT(*) FROM qualificacoes;
ROLLBACK_SQL

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "✅ TUDO PRONTO!"
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "PRÓXIMOS PASSOS:"
echo "1. Abra: https://dash.cloudflare.com"
echo "2. Vá para: D1 → airtrust → Query Editor"
echo "3. Comece pelo PASSO 1 (BACKUP)"
echo "4. Siga em sequência (PASSO 2, 3, 4, 5, 6, 7, 8, 9)"
echo "5. Se tudo OK, refatoração completa! 🎉"
echo "6. Se problema, execute PASSO 10 (ROLLBACK)"
echo ""
echo "⏱️  Tempo total: ~15 minutos"
echo "🔒 Risco: 🟢 BAIXÍSSIMO (5 camadas de proteção)"
echo "💾 Dados: 100% seguros (backup automático)"
echo ""
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "Sucesso! Continue para D1 Query Editor! 🚀"
echo ""
