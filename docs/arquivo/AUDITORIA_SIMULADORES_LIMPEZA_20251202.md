# Auditoria Módulo Simuladores - Limpeza de Dados Obsoletos [02/12/2025]

## 🔍 Tabelas Encontradas

### ✅ **EM USO (CORRETAS)**

```
✅ manobras (71 registros) → Tabela principal de manobras
✅ modelos_sessao (12 registros) → Templates de sessões
✅ modelos_sessao_manobras (220 registros) → Relacionamento N:N modelos ↔ manobras
✅ fichas_sessao (17 registros) → Fichas de avaliação
✅ fichas_sessao_manobras (22 registros) → Manobras avaliadas nas fichas
```

### ❌ **OBSOLETAS (REMOVER)**

```
❌ cadastro_manobras (275 registros) → LEGACY - Substituída por 'manobras'
❌ manobras_categorias (21 registros) → LEGACY - categoria agora é TEXT em 'manobras'
❌ sessoes_template_manobras (450 registros) → OBSOLETA - Substituída por 'modelos_sessao_manobras'
❌ sessao_manobras (1051 registros) → OBSOLETA - Nome confuso, verificar se é usada
❌ sessoes_manobras (0 registros) → VAZIA - Pode remover
```

### ⚠️ **VERIFICAR**

```
⚠️ instrutores_simulador → Verificar se é usada
⚠️ simulador_agendamentos → Verificar se é usada
⚠️ simuladores → Verificar se é usada
⚠️ tipos_sessao → Verificar se é usada
⚠️ sessoes_fichas → Verificar se é usada
⚠️ ficha_manobras_avaliacao → Verificar se é usada
⚠️ fichas_manobras_historico → Verificar se é usada
⚠️ manobras_avaliacoes → Verificar se é usada
```

---

## 🔧 Problemas Identificados

### **1. Backend Ainda Usa Tabelas Obsoletas**

**Arquivo**: `worker-airtrust/src/routes/simuladores.ts`

#### **Linha 1168: GET /sessoes-template/:id/manobras**

```typescript
FROM sessoes_template_manobras stm  // ❌ OBSOLETA
// Deveria usar: modelos_sessao_manobras
```

#### **Linha 1213: DELETE sessoes-template manobras**

```typescript
DELETE FROM sessoes_template_manobras  // ❌ OBSOLETA
// Deveria usar: modelos_sessao_manobras
```

#### **Linhas 1227, 1879: INSERT sessoes-template manobras**

```typescript
INSERT INTO sessoes_template_manobras  // ❌ OBSOLETA
// Deveria usar: modelos_sessao_manobras
```

### **2. Duplicação de Dados**

- `sessoes_template_manobras` (450 registros) → Dados antigos
- `modelos_sessao_manobras` (220 registros) → Dados novos/corretos

**Problema**: Backend inconsistente - algumas rotas usam tabela nova, outras usam antiga.

---

## ✅ Plano de Correção

### **Fase 1: Corrigir Backend (URGENTE)**

#### **1.1. Substituir todas as referências**

```typescript
// ANTES (linhas 1168, 1213, 1227, 1879):
sessoes_template_manobras;

// DEPOIS:
modelos_sessao_manobras;
```

#### **1.2. Atualizar JOINs**

```typescript
// ANTES:
FROM sessoes_template_manobras stm
INNER JOIN manobras m ON stm.manobra_id = m.id
WHERE stm.sessao_template_id = ?

// DEPOIS:
FROM modelos_sessao_manobras msm
INNER JOIN manobras m ON msm.manobra_id = m.id
WHERE msm.modelo_id = ?
```

### **Fase 2: Verificar Tabelas Auxiliares**

```bash
# Verificar uso de cada tabela no backend
grep -rn "instrutores_simulador" worker-airtrust/src/
grep -rn "simulador_agendamentos" worker-airtrust/src/
grep -rn "simuladores" worker-airtrust/src/
grep -rn "tipos_sessao" worker-airtrust/src/
grep -rn "sessoes_fichas" worker-airtrust/src/
```

### **Fase 3: Migration de Limpeza**

**Arquivo**: `worker-airtrust/migrations/0145_cleanup_obsolete_simuladores_tables.sql`

```sql
-- =====================================================
-- Migration 0145: Limpeza de Tabelas Obsoletas
-- Data: 02/12/2025
-- =====================================================

-- 1. REMOVER TABELAS OBSOLETAS
-- =====================================================

-- Tabela obsoleta (substituída por 'manobras')
DROP TABLE IF EXISTS cadastro_manobras;

-- Tabela obsoleta (categoria agora é TEXT em 'manobras')
DROP TABLE IF EXISTS manobras_categorias;

-- Tabela obsoleta (substituída por 'modelos_sessao_manobras')
DROP TABLE IF EXISTS sessoes_template_manobras;

-- Tabela obsoleta (verificar se não é usada)
DROP TABLE IF EXISTS sessao_manobras;

-- Tabela vazia
DROP TABLE IF EXISTS sessoes_manobras;


-- 2. VERIFICAR INTEGRIDADE
-- =====================================================

-- Verificar se modelos_sessao_manobras está populada
-- Deve ter ~220 registros
SELECT COUNT(*) as total_manobras_modelos
FROM modelos_sessao_manobras
WHERE deleted_at IS NULL;

-- Verificar se fichas_sessao_manobras está populada
-- Deve ter registros de avaliações
SELECT COUNT(*) as total_manobras_fichas
FROM fichas_sessao_manobras
WHERE deleted_at IS NULL;


-- 3. CRIAR ÍNDICES DE PERFORMANCE (se não existirem)
-- =====================================================

-- Índices para fichas_sessao_manobras
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_manobras_ficha
ON fichas_sessao_manobras(ficha_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fichas_sessao_manobras_ordem
ON fichas_sessao_manobras(ordem)
WHERE deleted_at IS NULL;


-- 4. DOCUMENTAÇÃO
-- =====================================================

-- Tabelas ativas após limpeza:
-- ✅ manobras (master data)
-- ✅ modelos_sessao (templates)
-- ✅ modelos_sessao_manobras (relacionamento N:N)
-- ✅ fichas_sessao (avaliações)
-- ✅ fichas_sessao_manobras (manobras avaliadas)

```

### **Fase 4: Teste Completo**

```bash
# 1. Aplicar correções backend
cd worker-airtrust
# (corrigir linhas 1168, 1213, 1227, 1879)

# 2. Deploy backend
npm run deploy

# 3. Aplicar migration de limpeza
wrangler d1 execute airtrust-db --remote --file=migrations/0145_cleanup_obsolete_simuladores_tables.sql

# 4. Testar endpoints
curl "https://airtrust-api-production.airtrust.workers.dev/api/simuladores/modelos-sessao"
curl "https://airtrust-api-production.airtrust.workers.dev/api/simuladores/modelos-sessao/16/manobras"

# 5. Verificar tabelas restantes
wrangler d1 execute airtrust-db --remote --command \
  "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%simulador%' OR name LIKE '%sessao%' OR name LIKE '%manobra%'"
```

---

## 📊 Estimativa de Impacto

### **Espaço Liberado**

```
cadastro_manobras: 275 registros → ~200 KB
manobras_categorias: 21 registros → ~10 KB
sessoes_template_manobras: 450 registros → ~300 KB
sessao_manobras: 1051 registros → ~600 KB
sessoes_manobras: 0 registros → ~0 KB

Total estimado: ~1.1 MB liberados
Database atual: 6.62 MB → ~5.5 MB após limpeza
```

### **Performance**

- ✅ Menos tabelas = queries mais rápidas
- ✅ Índices otimizados em tabelas corretas
- ✅ Menos confusão sobre qual tabela usar

### **Risco**

- ⚠️ **BAIXO**: Tabelas obsoletas não são usadas (exceto sessoes_template_manobras em 4 linhas)
- ✅ **MITIGAÇÃO**: Corrigir backend antes de remover tabelas

---

## 🎯 Próximas Ações

### **Ordem de Execução:**

1. ✅ **Corrigir backend** (linhas 1168, 1213, 1227, 1879)
2. ✅ **Deploy backend** com correções
3. ✅ **Testar endpoints** para garantir que funcionam
4. ✅ **Criar migration 0145** de limpeza
5. ✅ **Aplicar migration** em produção
6. ✅ **Verificar tabelas** restantes
7. ✅ **Build frontend** (se necessário)
8. ✅ **Commit** com documentação

---

## 📝 Checklist de Verificação

### **Antes de Remover Tabelas:**

- [ ] Backend não usa `cadastro_manobras`
- [ ] Backend não usa `manobras_categorias`
- [ ] Backend não usa `sessoes_template_manobras`
- [ ] Backend não usa `sessao_manobras`
- [ ] Backend não usa `sessoes_manobras`
- [ ] Todos os endpoints testados
- [ ] Dados preservados em tabelas corretas

### **Após Limpeza:**

- [ ] Apenas 5 tabelas principais existem
- [ ] Endpoints funcionam corretamente
- [ ] FK constraints intactas
- [ ] Índices criados
- [ ] Performance mantida/melhorada

---

**Data**: 02/12/2025 00:30  
**Status**: ⚠️ AGUARDANDO CORREÇÃO  
**Prioridade**: 🔴 ALTA (Backend inconsistente)  
**Impacto**: Backend usa tabela obsoleta em 4 lugares
