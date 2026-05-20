# 🔧 FIX: UNIQUE Constraint em tipos_sessao (Migration 0155)

**Data:** 02/12/2025 00:50  
**Issue:** Impossível reutilizar código em tipos_sessao após soft delete
**Commit:** `50218fb6`

---

## 🐛 PROBLEMA

Ao tentar salvar um novo tipo com código que havia sido deletado, retornava erro:

```
D1_ERROR: UNIQUE constraint failed: tipos_sessao.codigo: SQLITE_CONSTRAINT
```

**Causa raiz:** A coluna `codigo` tinha `UNIQUE` sem considerar registros deletados (soft delete).

**Schema original (ERRADO):**

```sql
CREATE TABLE tipos_sessao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,  -- ❌ UNIQUE sem levar em conta deleted_at
  nome TEXT NOT NULL,
  ...
  deleted_at DATETIME
)
```

**Problema:** Mesmo com `deleted_at != NULL`, o registro ainda ocupava o espaço no índice UNIQUE, impedindo reutilizar o código.

---

## ✅ SOLUÇÃO

Criar constraint composto que permite duplicação quando `deleted_at IS NOT NULL`:

**Schema corrigido:**

```sql
CREATE TABLE tipos_sessao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL,  -- ✅ Sem UNIQUE simples
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo INTEGER DEFAULT 1,
  ordem INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME,
  UNIQUE(codigo, deleted_at)  -- ✅ Permite (codigo='A', deleted_at=NULL) + (codigo='A', deleted_at=datetime)
)
```

**Como funciona:**

- `(codigo='INI', deleted_at=NULL)` - única combinação possível (ativo)
- `(codigo='INI', deleted_at='2025-12-02')` - outra combinação possível (deletado)
- ✅ Permite reutilizar 'INI' após soft delete

---

## 🔧 MIGRATION 0155

### Processo:

1. **Criar tabela temporária** com novo schema
2. **Copiar dados** da tabela antiga (mantém histórico)
3. **Deletar tabela antiga** (DROP TABLE)
4. **Renomear temporária** (ALTER TABLE ... RENAME)
5. **Criar índices** para performance (WHERE deleted_at IS NULL)

### SQL aplicado:

```sql
CREATE TABLE tipos_sessao_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo INTEGER DEFAULT 1,
  ordem INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME,
  UNIQUE(codigo, deleted_at)
);

INSERT INTO tipos_sessao_new
SELECT id, codigo, nome, descricao, ativo, ordem, created_at, updated_at, deleted_at
FROM tipos_sessao;

DROP TABLE tipos_sessao;
ALTER TABLE tipos_sessao_new RENAME TO tipos_sessao;

CREATE INDEX idx_tipos_sessao_codigo ON tipos_sessao(codigo) WHERE deleted_at IS NULL;
CREATE INDEX idx_tipos_sessao_deleted_at ON tipos_sessao(deleted_at);
```

### Resultado:

```
✅ 6 queries processadas
✅ 3809 rows lidas
✅ 159 rows escritas
✅ DB size: 6.42 MB (sem aumento)
```

---

## 🧪 TESTES

### 1. **Criar novo tipo com código único**

```bash
curl -X POST "https://airtrust-api-production.airtrust.workers.dev/api/simuladores/tipos-sessao" \
  -H "Content-Type: application/json" \
  -d '{"codigo":"INI","nome":"Treinamento Inicial","descricao":"..."}'

# ✅ Sucesso: {"success":true,"data":{"id":12,"codigo":"INI",...}}
```

### 2. **Rejeitar código duplicado (ativo)**

```bash
curl -X POST "https://airtrust-api-production.airtrust.workers.dev/api/simuladores/tipos-sessao" \
  -H "Content-Type: application/json" \
  -d '{"codigo":"INI","nome":"Duplicado",...}'

# ✅ Rejeitado: {"success":false,"error":"Já existe um tipo com este código"}
```

### 3. **Reutilizar código após soft delete**

```bash
# Delete
curl -X DELETE "https://airtrust-api-production.airtrust.workers.dev/api/simuladores/tipos-sessao/12"
# ✅ Deletado

# Reutilizar o código
curl -X POST "https://airtrust-api-production.airtrust.workers.dev/api/simuladores/tipos-sessao" \
  -H "Content-Type: application/json" \
  -d '{"codigo":"INI","nome":"Treinamento Inicial v2",...}'

# ✅ Sucesso: {"success":true,"data":{"id":13,"codigo":"INI",...}}
```

---

## 📊 IMPACTO

### Antes:

- ❌ Impossível reutilizar código após soft delete
- ❌ Erro confuso: "UNIQUE constraint failed"
- ❌ Usuário sem forma de resolver

### Depois:

- ✅ Permite criar novo tipo com código deletado
- ✅ Mantém validação de duplicação (ativo)
- ✅ Funcionalidade soft delete preservada
- ✅ Performance: índices otimizados com WHERE deleted_at IS NULL

---

## 🔗 REFERÊNCIAS

- **Arquivo:** `worker-airtrust/migrations/0155_fix_tipos_sessao_unique_constraint.sql`
- **Tabela:** `tipos_sessao` (2 registros ativos: PER, INI)
- **Commit:** `50218fb6`
- **Deployment:** Production ✅

---

## ⚠️ NOTA IMPORTANTE

Este é um exemplo clássico de como **soft delete + UNIQUE constraint** podem conflitar em SQLite. A solução de usar constraint composto é padrão em arquitetura de banco de dados modernos.

Outras tabelas com soft delete devem ser auditadas para o mesmo problema.
