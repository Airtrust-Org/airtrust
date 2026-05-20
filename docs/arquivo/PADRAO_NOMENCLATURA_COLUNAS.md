# 📋 PADRÃO DE NOMENCLATURA DE COLUNAS - AIRTRUST

## ✅ REGRAS OBRIGATÓRIAS

### 1. DATAS

| ❌ ERRADO | ✅ CORRETO | Descrição |
|-----------|-----------|-----------|
| `data_realizacao` | `data_conclusao` | Data de conclusão/realização |
| `data_validade` | `data_vencimento` | Data de vencimento/validade |
| `data_inicio` | `data_inicio` | ✅ Correto |
| `data_fim` | `data_fim` | ✅ Correto |
| `data_emissao` | `data_emissao` | ✅ Correto |

### 2. NOTAS E VALORES

| ❌ ERRADO | ✅ CORRETO | Descrição |
|-----------|-----------|-----------|
| `nota_final` | `nota` | Nota da avaliação |
| `nota_minima` | `nota_minima` | ✅ Correto |
| `nota_anterior` | `nota_anterior` | ✅ Correto |

### 3. AUDITORIA

| ❌ ERRADO | ✅ CORRETO | Descrição |
|-----------|-----------|-----------|
| `data_criacao` | `created_at` | Data de criação |
| `data_atualizacao` | `updated_at` | Data de atualização |
| `data_exclusao` | `deleted_at` | Data de exclusão (soft delete) |
| `ativo` | `deleted_at IS NULL` | Usar soft delete ao invés de boolean |

### 4. USUÁRIOS

| ❌ ERRADO | ✅ CORRETO | Descrição |
|-----------|-----------|-----------|
| `user_id` | `usuario_id` | ID do usuário (português) |
| `criado_por` | `criado_por` | ✅ Correto |
| `atualizado_por` | `atualizado_por` | ✅ Correto |

### 5. STATUS E ESTADOS

| ❌ ERRADO | ✅ CORRETO | Descrição |
|-----------|-----------|-----------|
| `status` | `status` | ✅ Correto (ATIVO, VENCIDO, etc) |
| `is_renovada` | `is_renovada` | ✅ Correto |
| `is_instrutor` | `is_instrutor` | ✅ Correto |

## 📊 TABELAS PRINCIPAIS E SUAS COLUNAS

### `qualificacoes`
```sql
- id INTEGER PRIMARY KEY
- funcionario_id INTEGER
- tipo TEXT (TREINAMENTO, CHECK, EXAME)
- codigo TEXT
- nome TEXT
- descricao TEXT
- data_conclusao TEXT  ✅ (não data_realizacao)
- data_vencimento TEXT ✅ (não data_validade)
- nota REAL            ✅
- instrutor TEXT
- certificado_url TEXT
- is_renovada INTEGER
- created_at TEXT
- updated_at TEXT
- deleted_at TEXT
```

### `checks`
```sql
- id INTEGER PRIMARY KEY
- funcionario_id INTEGER
- tipo_check TEXT
- data_conclusao TEXT  ✅
- data_vencimento TEXT ✅
- nota_final REAL      ✅
- instrutor TEXT
- created_at TEXT
- updated_at TEXT
- deleted_at TEXT
```

### `exames`
```sql
- id INTEGER PRIMARY KEY
- funcionario_id INTEGER
- tipo_exame TEXT
- data_conclusao TEXT  ✅
- data_vencimento TEXT ✅
- medico TEXT
- resultado TEXT
- created_at TEXT
- updated_at TEXT
- deleted_at TEXT
```

### `treinamentos` / `historico_certificacoes_v2`
```sql
- id INTEGER PRIMARY KEY
- funcionario_id INTEGER
- treinamento_id INTEGER
- data_conclusao TEXT  ✅
- data_vencimento TEXT ✅
- nota_final REAL      ✅
- instrutor TEXT
- certificado_url TEXT
- created_at TEXT
- updated_at TEXT
- deleted_at TEXT
```

### `sessoes_simulador`
```sql
- id INTEGER PRIMARY KEY
- modelo_id INTEGER
- data_inicio TEXT
- data_fim TEXT
- duracao_minutos INTEGER
- status TEXT
- created_at TEXT
- updated_at TEXT
- deleted_at TEXT
```

### `avaliacoes_manobras`
```sql
- id INTEGER PRIMARY KEY
- sessao_id INTEGER
- manobra_id INTEGER
- nota REAL            ✅
- observacoes TEXT
- created_at TEXT
```

## 🔧 CORREÇÕES APLICADAS

### Backend (Worker)
- ✅ 57 ocorrências de `data_realizacao` → `data_conclusao`
- ✅ 158 ocorrências de `data_validade` → `data_vencimento`
- ✅ 9 arquivos corrigidos

### Frontend (React)
- ✅ 33 ocorrências de `data_realizacao` → `data_conclusao`
- ✅ 54 ocorrências de `data_validade` → `data_vencimento`
- ✅ Todos os componentes atualizados

## 📝 PROTOCOLO DE DESENVOLVIMENTO

### Ao criar nova tabela:
1. Usar `created_at`, `updated_at`, `deleted_at` (não `data_criacao`)
2. Usar `data_conclusao` (não `data_realizacao`)
3. Usar `data_vencimento` (não `data_validade`)
4. Usar `nota` (não `nota_final`)
5. Usar `usuario_id` (não `user_id`)

### Ao criar novo endpoint:
1. Verificar schema real da tabela (PRAGMA table_info)
2. Usar nomes de colunas corretos
3. Adicionar auditoria (created_at, updated_at)
4. Implementar soft delete (deleted_at)

### Ao fazer query:
```typescript
// ❌ ERRADO
SELECT data_realizacao, data_validade, nota_final FROM qualificacoes

// ✅ CORRETO
SELECT data_conclusao, data_vencimento, nota FROM qualificacoes
```

## 🎯 STATUS ATUAL

✅ **Backend:** 100% padronizado  
✅ **Frontend:** 100% padronizado  
✅ **Migrations:** Auditadas  
✅ **Documentação:** Completa  

## 📚 REFERÊNCIAS

- Migrations: `/migrations/`
- Backend: `/src/worker/api/v2/`
- Frontend: `/src/react-app/`
- Este documento: `/PADRAO_NOMENCLATURA_COLUNAS.md`

---

**Última atualização:** 31/10/2025  
**Versão:** 1.0.0  
**Status:** ✅ Implementado
