# 🔍 AUDITORIA: Dados e Estrutura - Ambiente Local

**Data:** 20 de Novembro de 2025
**Objetivo:** Identificar e resolver problemas de dados e servidor que caem

---

## ❌ PROBLEMAS CRÍTICOS IDENTIFICADOS

### 1. **TABELAS INEXISTENTES** 🚨

O código está tentando acessar tabelas que **NÃO EXISTEM** no banco:

| Tabela no Código        | Status         | Tabela Correta            |
| ----------------------- | -------------- | ------------------------- |
| `sessoes_simulador`     | ❌ NÃO EXISTE  | `sessoes` ✅              |
| `fichas_simulador`      | ❌ NÃO EXISTE  | `fichas_sessao` ✅        |
| `instrutores_simulador` | ❌ NÃO EXISTIA | ✅ CRIADA (migração 0026) |

**Impacto:** API retorna erro D1_ERROR causando falhas em cascata.

---

### 2. **MAPEAMENTO DE TABELAS** 📊

#### Tabelas em Produção (backup-prod-20251120-112111.sql):

- ✅ `sessoes` - Sessões de treinamento
- ✅ `fichas_sessao` - Fichas individuais de sessão
- ✅ `sessoes_participantes` - Participantes das sessões
- ✅ `sessoes_manobras` - Manobras realizadas nas sessões
- ✅ `sessoes_template` - Templates/modelos de sessão
- ✅ `funcionarios` - Funcionários
- ✅ `simuladores` - Equipamentos simuladores
- ✅ `cadastro_manobras` - Catálogo de manobras

#### Tabelas usadas no código (`worker-airtrust/src/routes/simuladores.ts`):

- ❌ `sessoes_simulador` (linha 416) → **DEVE SER** `sessoes`
- ❌ `fichas_simulador` (linhas 128, 171, 648, 683) → **DEVE SER** `fichas_sessao`
- ✅ `instrutores_simulador` (linha 2343) → **CORRIGIDO** com migração

---

## 📋 VERIFICAÇÕES REALIZADAS

### Banco de Dados Local

```bash
Localização: worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/airtrust-local.sqlite
Tamanho: 1.7MB
```

#### Contagem de Dados:

- ✅ `funcionarios`: 24 registros
- ✅ `sessoes_template`: 12 registros
- ✅ `cadastro_manobras`: 285 registros
- ✅ `simuladores`: (verificar)
- ❌ `sessoes_simulador`: TABELA NÃO EXISTE
- ❌ `fichas_simulador`: TABELA NÃO EXISTE

---

## 🔧 CORREÇÕES APLICADAS

### ✅ 1. Criada tabela `instrutores_simulador`

**Arquivo:** `worker-airtrust/migrations/0026_create_instrutores_simulador.sql`

```sql
CREATE TABLE instrutores_simulador (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id TEXT NOT NULL,
  habilitacoes TEXT,
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id)
);
```

**Status:** ✅ Aplicada com sucesso
**Resultado:** Endpoint `/api/simuladores/instrutores` retorna `true, 0`

---

## 🚨 CORREÇÕES NECESSÁRIAS (A FAZER)

### 1. Renomear tabelas no código

**Arquivos afetados:**

- `worker-airtrust/src/routes/simuladores.ts`

**Substituições necessárias:**

#### a) `sessoes_simulador` → `sessoes`

Ocorrências nas linhas:

- 97, 106, 114, 120, 128, 171
- 416, 492, 520, 526, 541

#### b) `fichas_simulador` → `fichas_sessao`

Ocorrências nas linhas:

- 128, 171, 648, 683

**OU**

### 2. Criar as tabelas faltantes

Criar migrações para:

- `sessoes_simulador` (como alias/view de `sessoes`)
- `fichas_simulador` (como alias/view de `fichas_sessao`)

---

## 📊 ANÁLISE DE IMPACTO

### Endpoints Afetados:

1. ❌ `GET /api/simuladores/sessoes` - **FALHA** (sessoes_simulador não existe)
2. ❌ `POST /api/simuladores/sessoes` - **FALHA**
3. ❌ `PUT /api/simuladores/sessoes/:id` - **FALHA**
4. ❌ `DELETE /api/simuladores/sessoes/:id` - **FALHA**
5. ❌ `GET /api/simuladores/fichas` - **FALHA** (fichas_simulador não existe)
6. ✅ `GET /api/simuladores/instrutores` - **OK** (após correção)
7. ✅ `GET /api/simuladores/modelos` - **OK** (usa sessoes_template)
8. ✅ `GET /api/simuladores/modelos/:id/manobras` - **OK**
9. ✅ `GET /api/health` - **OK**

**Taxa de Falha:** ~44% dos endpoints de simuladores

---

## 🎯 PLANO DE AÇÃO

### OPÇÃO 1: Renomear no código (RECOMENDADO)

**Prós:**

- Alinha código com schema de produção
- Não cria duplicação de dados
- Mais limpo e manutenível

**Contras:**

- Precisa atualizar múltiplos arquivos
- Pode afetar frontend se usar nomes antigos

**Tempo estimado:** 30 minutos

---

### OPÇÃO 2: Criar aliases/views

**Prós:**

- Backward compatibility
- Não precisa mudar código

**Contras:**

- Duplicação conceitual
- Mais complexo manter
- Pode causar confusão futura

**Tempo estimado:** 15 minutos

---

## 📝 RECOMENDAÇÕES

1. ✅ **APLICAR OPÇÃO 1** - Renomear todas as referências de tabelas
2. ✅ **ATUALIZAR** DTOs e interfaces TypeScript
3. ✅ **TESTAR** todos os endpoints após correção
4. ✅ **DOCUMENTAR** mapeamento de tabelas
5. ✅ **APLICAR** mesmas correções em produção

---

## 🔒 SEGURANÇA E INTEGRIDADE

### Backup Realizado:

```bash
worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/airtrust-local.sqlite.backup
```

### Próximos Passos:

1. Decidir entre OPÇÃO 1 ou OPÇÃO 2
2. Aplicar correções
3. Testar endpoints
4. Verificar estabilidade do servidor
5. Deploy para produção

---

**Status Atual:** 🟡 AGUARDANDO DECISÃO
**Bloqueio:** 44% dos endpoints falhando por tabelas inexistentes
**Prioridade:** 🔥 CRÍTICA
