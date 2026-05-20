# FIX: PUT /tipos/:id - Triggers Auditoria Corrompidos

**Data:** 29/11/2025  
**Issue:** PUT em tipos de qualificação retornando 500 Internal Server Error  
**Root Cause:** Triggers usando nomes de colunas incompatíveis com schema da tabela `auditoria_avancada_v2`

---

## 🔴 PROBLEMA

### Erro Reportado

```
PUT /api/qualificacoes/tipos/64 → 500 Internal Server Error
{success: false, error: 'Erro interno inesperado', code: 'INTERNAL_ERROR'}
```

### Log Backend (via wrangler tail)

```
[PUT_TIPOS] Erro no UPDATE: D1_ERROR: table auditoria_avancada_v2
has no column named valores_anteriores: SQLITE_ERROR
```

---

## 🔍 DIAGNÓSTICO

### 1. Schema Real da Tabela

```sql
CREATE TABLE auditoria_avancada_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tabela TEXT NOT NULL,
  acao TEXT NOT NULL,
  registro_id TEXT NOT NULL,
  usuario_id TEXT,          -- ✅ Existe
  dados_anteriores TEXT,    -- ✅ CORRETO
  dados_novos TEXT,         -- ✅ CORRETO
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### 2. Triggers Problemáticos

**a) `trg_qualificacoes_tipos_update` (migration 0062)**

```sql
-- ❌ ERRADO
INSERT INTO auditoria_avancada_v2 (
  tabela, registro_id, acao,
  dados_anteriores, dados_novos,
  origem  -- ❌ Coluna não existe
)
```

**b) `trg_tipo_update_auditoria` (migration 0128)**

```sql
-- ❌ ERRADO
INSERT INTO auditoria_avancada_v2 (
  usuario_id, acao, tabela, registro_id,
  valores_anteriores,  -- ❌ Não existe (deveria ser dados_anteriores)
  valores_novos,       -- ❌ Não existe (deveria ser dados_novos)
  detalhes,            -- ❌ Coluna não existe
  created_at
)
```

### 3. Histórico de Migrations

- **Migration 0062**: Criou trigger com `origem` (coluna inexistente)
- **Migration 0063**: Dropou todos os triggers mas não os recriou corretamente
- **Migration 0128**: Criou novo trigger com `valores_*` e `detalhes` (colunas inexistentes)

---

## ✅ SOLUÇÃO

### Migration 0117: Fix Triggers

**Arquivo:** `worker-airtrust/migrations/0117_fix_qualificacoes_tipos_trigger.sql`

```sql
-- DROP trigger antigo
DROP TRIGGER IF EXISTS trg_qualificacoes_tipos_update;

-- RECREATE com nomes corretos
CREATE TRIGGER trg_qualificacoes_tipos_update
AFTER UPDATE ON qualificacoes_tipos
FOR EACH ROW
WHEN OLD.deleted_at IS NULL
BEGIN
  INSERT INTO auditoria_avancada_v2 (
    tabela,
    registro_id,
    acao,
    dados_anteriores,  -- ✅ CORRETO
    dados_novos        -- ✅ CORRETO
  )
  VALUES (
    'qualificacoes_tipos',
    NEW.id,
    'UPDATE',
    json_object(
      'codigo', OLD.codigo,
      'nome', OLD.nome,
      'validade', OLD.validade,
      'vencimento_fim_mes', OLD.vencimento_fim_mes,
      'categoria', OLD.categoria,
      'ativo', OLD.ativo
    ),
    json_object(
      'codigo', NEW.codigo,
      'nome', NEW.nome,
      'validade', NEW.validade,
      'vencimento_fim_mes', NEW.vencimento_fim_mes,
      'categoria', NEW.categoria,
      'ativo', NEW.ativo
    )
  );
END;
```

### Fix Direto via wrangler d1 execute

```bash
# Aplicar migration
npx wrangler d1 execute airtrust-db --remote \
  --file=migrations/0117_fix_qualificacoes_tipos_trigger.sql

# Corrigir trigger auditoria
npx wrangler d1 execute airtrust-db --remote --command "
DROP TRIGGER IF EXISTS trg_tipo_update_auditoria;

CREATE TRIGGER trg_tipo_update_auditoria
AFTER UPDATE ON qualificacoes_tipos
WHEN NEW.validade != OLD.validade
  OR NEW.vencimento_fim_mes != OLD.vencimento_fim_mes
BEGIN
  INSERT INTO auditoria_avancada_v2 (
    tabela, registro_id, acao,
    dados_anteriores, dados_novos
  )
  VALUES (
    'qualificacoes_tipos',
    NEW.id,
    'UPDATE_TIPO_RECALCULO',
    json_object(
      'validade', OLD.validade,
      'vencimento_fim_mes', OLD.vencimento_fim_mes
    ),
    json_object(
      'validade', NEW.validade,
      'vencimento_fim_mes', NEW.vencimento_fim_mes
    )
  );
END;
"
```

---

## ✅ VALIDAÇÃO

### Teste 1: PUT com validade válida

```bash
curl -X PUT "https://airtrust-api-production.airtrust.workers.dev/api/qualificacoes/tipos/63" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test" \
  -d '{"nome":"TESTE FINAL FUNCIONANDO","validade":18}'
```

**Resultado:**

```json
{
  "success": true,
  "data": {
    "id": 63,
    "codigo": "SEMVENC",
    "nome": "TESTE FINAL FUNCIONANDO",
    "validade": 18,
    "updated_at": "2025-11-29 13:35:28"
  },
  "meta": {
    "registros_recalculados": 0,
    "trigger_executado": true
  }
}
```

### Teste 2: PUT com validade = 0 (constraint violation)

```bash
curl -X PUT ".../tipos/63" \
  -d '{"validade":0}'
```

**Resultado esperado:**

```json
{
  "success": false,
  "error": "Validade deve ser NULL ou maior que zero",
  "code": "INVALID_VALIDADE"
}
```

---

## 📋 CHECKLIST DE FIXES

- [x] Identificar erro via `wrangler tail`
- [x] Verificar schema real da tabela `auditoria_avancada_v2`
- [x] Criar migration 0117 para corrigir trigger principal
- [x] Aplicar migration via `wrangler d1 execute --remote`
- [x] Corrigir trigger `trg_tipo_update_auditoria` via CLI
- [x] Adicionar validação de validade > 0 no endpoint PUT
- [x] Adicionar logs detalhados no PUT
- [x] Testar PUT com validade válida → ✅ PASSOU
- [x] Commit das correções
- [x] Documentar fix completo

---

## 🔑 LIÇÕES APRENDIDAS

1. **Sempre verificar schema real** antes de criar triggers
2. **Migrations que dropam triggers** devem recriá-los ou documentar claramente
3. **Nomear colunas consistentemente**: `dados_*` não `valores_*`
4. **Usar wrangler tail** para debug em tempo real de triggers
5. **Schema constraints validam na aplicação**: validade > 0 deve ser checado antes do UPDATE

---

## 🚀 DEPLOY STATUS

- **Version:** 630f0916-9339-4cf5-9425-24adbdb47b5e
- **Trigger Fix:** ✅ Applied (0117)
- **Auditoria Trigger:** ✅ Fixed via CLI
- **Endpoint Status:** ✅ Funcionando
- **Frontend Ready:** ✅ Pode editar tipos

---

**Commit:** `fix: corrigir triggers auditoria - usar dados_anteriores/dados_novos ao invés de valores_*`
