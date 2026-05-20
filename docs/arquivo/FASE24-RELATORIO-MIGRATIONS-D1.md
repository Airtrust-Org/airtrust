# 🗄️ FASE 24 - MIGRATIONS D1 E ALINHAMENTO DE SCHEMA

**Data**: 13 de Novembro de 2025  
**Database ID**: `7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae` (airtrust-db)  
**Worker**: `airtrust-backend` (Cloudflare Workers + Hono)  
**Status**: 🟡 Migrations preparadas, aplicação pendente em produção

---

## 📋 1. RESUMO EXECUTIVO

### 1.1 O Que Mudou

| Item                 | Descrição                                                   | Status                 |
| -------------------- | ----------------------------------------------------------- | ---------------------- |
| **funcionarios.ts**  | Restaurado uso da coluna `setor` (removido `NULL AS setor`) | ✅ Código atualizado   |
| **Filtro por setor** | Re-habilitado filtro `?setor=OPERACIONAL`                   | ✅ Código atualizado   |
| **orderBy setor**    | Campo `setor` adicionado aos campos ordenáveis              | ✅ Código atualizado   |
| **Migration 0006**   | `ALTER TABLE funcionarios ADD COLUMN setor TEXT`            | 🟡 Pronta para aplicar |
| **Seed 0004**        | 3 usuários iniciais (admin, manager, user)                  | 🟡 Pronta para aplicar |

### 1.2 Arquivos Modificados

```
✅ worker-airtrust/src/routes/funcionarios.ts (4 alterações)
   - Linha 53: Restaurado `const setor = c.req.query('setor')`
   - Linha 95-99: Restaurado filtro por setor
   - Linha 102-107: Restaurado 'setor' em campos ordenáveis
   - Linha 121: Restaurado `setor,` no SELECT (removido NULL AS setor)

🟡 worker-airtrust/migrations/0006_add_missing_columns.sql (pronta)
🟡 worker-airtrust/migrations/0004_seed_usuarios.sql (pronta)
```

### 1.3 Dependências Críticas

⚠️ **ATENÇÃO**: O código atualizado em `funcionarios.ts` **REQUER** que a migration 0006 seja aplicada em produção. Caso contrário, o endpoint `/api/funcionarios` retornará erro:

```
D1_ERROR: no such column: setor
```

---

## 📊 2. TABELA funcionarios - COLUNA setor

### 2.1 Schema Esperado (Pós-Migration 0006)

```sql
-- Tabela: funcionarios
CREATE TABLE funcionarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  cpf TEXT UNIQUE,
  email TEXT,
  telefone TEXT,
  cargo TEXT NOT NULL,
  setor TEXT,                    -- ✅ Adicionada em migration 0006
  funcao TEXT,
  codigo_anac TEXT,
  status TEXT DEFAULT 'ATIVO',
  is_instrutor INTEGER DEFAULT 0,
  is_checador INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
```

### 2.2 Código ANTES (FASE 23B - Workaround Temporário)

```typescript
// ❌ FASE 23B: Workaround temporário
const query = `
  SELECT 
    id, matricula, nome, cpf, email, telefone,
    cargo, funcao, codigo_anac,
    CASE WHEN UPPER(COALESCE(status, 'ATIVO')) = 'ATIVO' THEN 1 ELSE 0 END AS ativo,
    is_instrutor, is_checador,
    NULL AS setor,                -- ❌ Workaround temporário
    NULL AS data_admissao,
    created_at, updated_at
  FROM funcionarios
  WHERE ${whereClause}
  ORDER BY ${orderByClause}
  LIMIT ? OFFSET ?
`;

// ❌ Filtro por setor desabilitado
// setor não existe em produção - ignorar filtro
```

### 2.3 Código DEPOIS (FASE 24 - Uso Real da Coluna)

```typescript
// ✅ FASE 24: Uso real da coluna setor (requer migration 0006)
const setor = c.req.query('setor'); // ✅ ATENÇÃO: Requer migration 0006 aplicada

// ✅ Filtro por setor restaurado
if (setor) {
  whereClauses.push('setor = ?');
  bindings.push(setor);
}

// ✅ Campo setor nos campos ordenáveis
const orderByClause = buildOrderBy(
  ['id', 'nome', 'matricula', 'email', 'cargo', 'setor', 'created_at'],
  orderBy,
  order,
);

// ✅ Query principal com coluna real
const query = `
  SELECT 
    id, matricula, nome, cpf, email, telefone,
    cargo, setor,                  -- ✅ Coluna real (requer migration 0006)
    funcao, codigo_anac,
    CASE WHEN UPPER(COALESCE(status, 'ATIVO')) = 'ATIVO' THEN 1 ELSE 0 END AS ativo,
    is_instrutor, is_checador,
    NULL AS data_admissao,
    created_at, updated_at
  FROM funcionarios
  WHERE ${whereClause}
  ORDER BY ${orderByClause}
  LIMIT ? OFFSET ?
`;
```

### 2.4 Migration 0006 - Detalhes

**Arquivo**: `worker-airtrust/migrations/0006_add_missing_columns.sql`

```sql
-- Migration: 0006_add_missing_columns.sql
-- Propósito: Adicionar coluna setor à tabela funcionarios
-- Data: 2025-11-13
-- Autor: Auditoria FASE 24

-- 1. Adicionar coluna setor
ALTER TABLE funcionarios ADD COLUMN setor TEXT;

-- 2. Popula registros existentes com default 'OPERACIONAL'
UPDATE funcionarios
SET setor = 'OPERACIONAL'
WHERE setor IS NULL;

-- 3. Validação: Contar funcionários com setor preenchido
SELECT
  COUNT(*) as total_funcionarios,
  COUNT(setor) as com_setor
FROM funcionarios
WHERE deleted_at IS NULL;

-- ✅ Esperado: total_funcionarios = com_setor (todos devem ter setor após UPDATE)
```

---

## 👥 3. SEEDS E DADOS CRÍTICOS

### 3.1 Seed 0004 - Usuários Iniciais

**Arquivo**: `worker-airtrust/migrations/0004_seed_usuarios.sql`

```sql
-- Seed: 0004_seed_usuarios.sql
-- Propósito: Criar 3 usuários iniciais para autenticação
-- Senhas: Bcrypt hashed (Admin@123, Manager@123, User@123)

INSERT INTO usuarios (nome, email, senha_hash, role, ativo)
VALUES
  ('Admin User', 'admin@airtrust.com', '$2b$10$...', 'admin', 1),
  ('Manager User', 'manager@airtrust.com', '$2b$10$...', 'manager', 1),
  ('User User', 'user@airtrust.com', '$2b$10$...', 'user', 1)
ON CONFLICT(email) DO NOTHING;
```

**Credenciais de Acesso**:

| Usuário      | Email                | Senha (dev)   | Role    | Hash Bcrypt    |
| ------------ | -------------------- | ------------- | ------- | -------------- |
| Admin User   | admin@airtrust.com   | `Admin@123`   | admin   | $2b$10$nEy0... |
| Manager User | manager@airtrust.com | `Manager@123` | manager | $2b$10$7YHo... |
| User User    | user@airtrust.com    | `User@123`    | user    | $2b$10$Qr5f... |

⚠️ **SEGURANÇA**: Senhas são exemplos para desenvolvimento. Em produção, usuários devem alterar suas senhas no primeiro acesso.

### 3.2 Ordem de Execução de Seeds

```bash
# Ordem recomendada (seed 0004 pode ser executada a qualquer momento)
1. Migration 0001_initial_schema.sql        # ✅ Já aplicada
2. Seed 0002_seed_minimo.sql                # ✅ Já aplicada
3. Migration 0003_create_usuarios_table.sql # ✅ Já aplicada (se existir)
4. Seed 0004_seed_usuarios.sql              # 🟡 Pronta para aplicar
5. Migration 0006_add_missing_columns.sql   # 🟡 Pronta para aplicar
```

---

## ✅ 4. CHECKLIST PARA EXECUÇÃO EM PRODUÇÃO

### 4.1 Pré-Requisitos

- [ ] Backup do database D1 realizado
- [ ] Código da FASE 24 commitado e buildado (`npm run build`)
- [ ] Wrangler CLI instalado e autenticado (`wrangler whoami`)
- [ ] Database ID confirmado: `7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae`

### 4.2 Comandos de Execução

```bash
# 1. Backup do database (CRÍTICO - sempre fazer backup antes de migrations)
wrangler d1 backup create airtrust-db \
  --output-format json \
  > backup-pre-migration-0006-$(date +%Y%m%d-%H%M%S).json

# 2. Aplicar Seed 0004 - Usuários Iniciais (se ainda não aplicada)
wrangler d1 execute airtrust-db \
  --remote \
  --file=worker-airtrust/migrations/0004_seed_usuarios.sql

# 3. Aplicar Migration 0006 - Adicionar coluna setor
wrangler d1 execute airtrust-db \
  --remote \
  --file=worker-airtrust/migrations/0006_add_missing_columns.sql

# 4. Validar coluna setor foi criada
wrangler d1 execute airtrust-db \
  --remote \
  --command="PRAGMA table_info(funcionarios);"

# 5. Validar funcionários com setor preenchido
wrangler d1 execute airtrust-db \
  --remote \
  --command="SELECT COUNT(*) as total, COUNT(setor) as com_setor FROM funcionarios WHERE deleted_at IS NULL;"

# 6. Deploy do worker com código atualizado
npm run build
wrangler deploy

# 7. Testar endpoint /api/funcionarios
curl https://airtrust-backend.filipedaumas.workers.dev/api/funcionarios?limit=5

# 8. Testar filtro por setor
curl "https://airtrust-backend.filipedaumas.workers.dev/api/funcionarios?setor=OPERACIONAL&limit=5"
```

### 4.3 Validações Pós-Deploy

- [ ] GET `/api/funcionarios` retorna 200 OK (sem erro D1_ERROR)
- [ ] Resposta JSON contém campo `setor` preenchido (não null)
- [ ] Filtro `?setor=OPERACIONAL` retorna apenas funcionários do setor
- [ ] OrderBy `?orderBy=setor&order=ASC` funciona corretamente
- [ ] Login com credenciais de `admin@airtrust.com` funciona

---

## 🔄 5. CÓDIGO ATUALIZADO - DIFFS COMPLETOS

### 5.1 Diff 1: Parâmetro setor restaurado (Linha 53)

```diff
  // Parâmetros de busca/filtro
  const search = c.req.query('search');
  const status = c.req.query('status'); // "true" ou "false"
  const cargo = c.req.query('cargo');
- // setor não existe em produção - parâmetro ignorado
+ const setor = c.req.query('setor'); // ✅ ATENÇÃO: Requer migration 0006 aplicada

  // Parâmetros de ordenação
  const orderBy = c.req.query('orderBy');
  const order = c.req.query('order')?.toUpperCase() as 'ASC' | 'DESC' | undefined;
```

### 5.2 Diff 2: Filtro por setor restaurado (Linha 95-99)

```diff
  // Filtro por cargo
  if (cargo) {
    whereClauses.push('cargo = ?');
    bindings.push(cargo);
  }

- // setor não existe em produção - ignorar filtro
- // data_admissao não existe em produção - ignorar
+ // Filtro por setor (✅ ATENÇÃO: Requer migration 0006 aplicada)
+ if (setor) {
+   whereClauses.push('setor = ?');
+   bindings.push(setor);
+ }

  const whereClause = whereClauses.join(' AND ');
```

### 5.3 Diff 3: Campo setor em orderBy (Linha 102-107)

```diff
- // Construir ORDER BY (remover setor que não existe)
+ // Construir ORDER BY (✅ ATENÇÃO: 'setor' requer migration 0006 aplicada)
  const orderByClause = buildOrderBy(
-   ['id', 'nome', 'matricula', 'email', 'cargo', 'created_at'],
+   ['id', 'nome', 'matricula', 'email', 'cargo', 'setor', 'created_at'],
    orderBy,
    order,
  );
```

### 5.4 Diff 4: SELECT com coluna real setor (Linha 121)

```diff
- // Query principal - usar APENAS colunas que existem em produção
+ // Query principal (✅ ATENÇÃO: Coluna 'setor' requer migration 0006 aplicada em produção)
  const query = `
    SELECT
      id, matricula, nome, cpf, email, telefone,
-     cargo, funcao, codigo_anac,
+     cargo, setor, funcao, codigo_anac,
      CASE WHEN UPPER(COALESCE(status, 'ATIVO')) = 'ATIVO' THEN 1 ELSE 0 END AS ativo,
      is_instrutor, is_checador,
-     NULL AS setor,
      NULL AS data_admissao,
      created_at, updated_at
    FROM funcionarios
    WHERE ${whereClause}
    ORDER BY ${orderByClause}
    LIMIT ? OFFSET ?
  `;
```

---

## 🔍 6. VALIDAÇÕES PÓS-MIGRATION

### 6.1 SQL: Verificar schema da tabela funcionarios

```sql
-- Verifica colunas da tabela funcionarios (deve incluir 'setor')
PRAGMA table_info(funcionarios);

-- ✅ Esperado: Linha com name='setor', type='TEXT', notnull=0
```

### 6.2 SQL: Verificar dados com setor preenchido

```sql
-- Contar funcionários com setor preenchido
SELECT
  COUNT(*) as total_funcionarios,
  COUNT(setor) as com_setor,
  CASE
    WHEN COUNT(*) = COUNT(setor) THEN '✅ OK'
    ELSE '❌ FALHA'
  END as status
FROM funcionarios
WHERE deleted_at IS NULL;

-- ✅ Esperado: total_funcionarios = com_setor (status = '✅ OK')
```

### 6.3 SQL: Listar valores únicos de setor

```sql
-- Listar setores distintos e contagem
SELECT
  setor,
  COUNT(*) as quantidade
FROM funcionarios
WHERE deleted_at IS NULL
GROUP BY setor
ORDER BY quantidade DESC;

-- ✅ Esperado: Pelo menos 'OPERACIONAL' com contagem > 0
```

### 6.4 SQL: Validar usuários criados (Seed 0004)

```sql
-- Verificar se seed 0004 foi aplicada
SELECT
  id, nome, email, role, ativo
FROM usuarios
WHERE email IN ('admin@airtrust.com', 'manager@airtrust.com', 'user@airtrust.com')
ORDER BY role;

-- ✅ Esperado: 3 registros (admin, manager, user)
```

### 6.5 cURL: Testar endpoint /api/funcionarios

```bash
# GET lista com setor preenchido
curl -i https://airtrust-backend.filipedaumas.workers.dev/api/funcionarios?limit=3

# ✅ Esperado:
# - HTTP 200 OK
# - JSON com array 'data'
# - Cada objeto com campo 'setor' != null

# GET com filtro por setor
curl -i "https://airtrust-backend.filipedaumas.workers.dev/api/funcionarios?setor=OPERACIONAL&limit=5"

# ✅ Esperado:
# - HTTP 200 OK
# - Todos registros retornados com setor = 'OPERACIONAL'

# GET com orderBy setor
curl -i "https://airtrust-backend.filipedaumas.workers.dev/api/funcionarios?orderBy=setor&order=ASC&limit=10"

# ✅ Esperado:
# - HTTP 200 OK
# - Registros ordenados alfabeticamente por setor
```

---

## 🚀 7. DEPENDÊNCIAS PARA PRÓXIMAS FASES

### 7.1 FASE 25 - Migrar data_admissao (se necessário)

Atualmente, `data_admissao` retorna `NULL AS data_admissao` no SELECT. Se essa coluna for necessária:

```sql
-- Migration futura: 0007_add_data_admissao.sql
ALTER TABLE funcionarios ADD COLUMN data_admissao TEXT;

-- Popula com data de criação do registro (fallback)
UPDATE funcionarios
SET data_admissao = DATE(created_at)
WHERE data_admissao IS NULL;
```

**Código a atualizar**: `funcionarios.ts` linha 125 (remover `NULL AS data_admissao`)

### 7.2 FASE 26 - Auditoria de Divergências (tabelas legado)

Conforme documentado em `FASE23-RELATORIO-CORRECOES-BACKEND-D1.md`, existem divergências entre schema e código em múltiplas tabelas:

| Tabela            | Campo          | Status Schema | Status Código                                    | Ação Requerida                  |
| ----------------- | -------------- | ------------- | ------------------------------------------------ | ------------------------------- |
| **fichas_sessao** | tipo_avaliacao | ✅ Existe     | ❌ Usa relacionamento TEXT com `avaliacoes.tipo` | Migrar para FOREIGN KEY         |
| **fichas_sessao** | exercicio_id   | ❌ Não existe | ✅ Usado no código                               | Migration 0008 adicionar coluna |
| **alunos**        | status         | ❌ Não existe | ✅ Usado no código                               | Migration 0009 adicionar coluna |

**Prioridade**: Alta (afeta integridade referencial e filtros)

### 7.3 FASE 27 - Implementar Soft Delete em Tabelas Legado

Tabelas sem coluna `deleted_at`:

- `qualificacoes` (historico)
- `avaliacoes`
- `exercicios`

**Ação**: Criar migration para adicionar `deleted_at TEXT` e atualizar serviços correspondentes.

### 7.4 FASE 28 - Indexes de Performance

Após schema estabilizado, criar indexes para otimização:

```sql
-- Migration futura: 0010_add_indexes.sql
CREATE INDEX IF NOT EXISTS idx_funcionarios_setor ON funcionarios(setor);
CREATE INDEX IF NOT EXISTS idx_funcionarios_cargo ON funcionarios(cargo);
CREATE INDEX IF NOT EXISTS idx_funcionarios_matricula ON funcionarios(matricula);
CREATE INDEX IF NOT EXISTS idx_funcionarios_deleted_at ON funcionarios(deleted_at);
```

---

## 📝 8. NOTAS FINAIS

### 8.1 Riscos Identificados

| Risco                             | Severidade | Mitigação                               |
| --------------------------------- | ---------- | --------------------------------------- |
| Deploy sem migration aplicada     | 🔴 Alta    | Aplicar migration 0006 ANTES do deploy  |
| Funcionários sem setor preenchido | 🟡 Média   | Migration 0006 popula com 'OPERACIONAL' |
| Perda de dados em rollback        | 🔴 Alta    | Backup obrigatório antes de migrations  |

### 8.2 Rollback Plan

Se migration 0006 causar problemas:

```bash
# 1. Reverter deploy do worker
wrangler rollback

# 2. Restaurar backup do database
wrangler d1 restore airtrust-db \
  --remote \
  --backup-id=<backup_id>

# 3. Reverter código para FASE 23B (NULL AS setor)
git revert HEAD
npm run build
wrangler deploy
```

### 8.3 Contatos e Suporte

- **Database ID**: `7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae`
- **Worker URL**: `https://airtrust-backend.filipedaumas.workers.dev`
- **Documentação completa**: Pasta raiz do projeto (FASE22-PARTE1 a FASE23-RELATORIO)

---

## ✅ CONCLUSÃO

✅ **Código atualizado**: `funcionarios.ts` agora usa coluna real `setor`  
🟡 **Migration preparada**: `0006_add_missing_columns.sql` pronta para aplicar  
🟡 **Seed preparada**: `0004_seed_usuarios.sql` pronta para aplicar  
📋 **Checklist completo**: 8 passos para execução segura em produção  
🔍 **Validações definidas**: SQL + cURL para confirmar sucesso

**PRÓXIMO PASSO CRÍTICO**: Executar comandos da seção 4.2 em produção (backup → migrations → deploy → validações).

---

**Fim do Relatório FASE 24**  
**Autor**: GitHub Copilot + Auditoria Automatizada  
**Data**: 2025-11-13  
**Versão**: 1.0 (Completo)
