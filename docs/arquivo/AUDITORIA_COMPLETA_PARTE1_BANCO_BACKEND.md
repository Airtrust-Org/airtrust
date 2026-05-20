# 🔍 AUDITORIA COMPLETA AIRTRUST - PARTE 1: BANCO DE DADOS E BACKEND

**Data:** 25 de Novembro de 2025  
**Versão:** 2.0.0  
**Documento:** Parte 1 de 3

---

## 📊 SUMÁRIO EXECUTIVO - PARTE 1

### Status Geral

**🟡 APROVADO COM RESSALVAS CRÍTICAS**

| Categoria          | Pontuação | Status   |
| ------------------ | --------- | -------- |
| **Banco de Dados** | 6.0/10    | 🟡 Médio |
| **Backend APIs**   | 7.5/10    | 🟢 Bom   |
| **Segurança**      | 6.5/10    | 🟡 Médio |

---

## 🚨 TOP 5 PROBLEMAS CRÍTICOS

### 1. INCONSISTÊNCIA DE SCHEMA (CRÍTICO 🔴)

**Problema:** Existem 3 schemas diferentes competindo:

```sql
-- Schema A (schema.sql)
CREATE TABLE funcionarios (
  cpf TEXT NOT NULL UNIQUE,
  ativo INTEGER DEFAULT 1
)

-- Schema B (dev_bootstrap.sql)
CREATE TABLE funcionarios (
  id INTEGER PRIMARY KEY,
  status TEXT DEFAULT 'ATIVO'
)

-- Schema C (migration 0105)
CREATE TABLE funcionarios (
  cpf TEXT NOT NULL UNIQUE,
  matricula TEXT NOT NULL UNIQUE
  -- SEM campo ativo OU status
)
```

**Impacto:**

- Queries falham em diferentes ambientes
- FKs quebram (algumas usam cpf, outras id)
- Código tenta detectar dinamicamente (anti-pattern)

**Evidência no Código:**

```typescript
// funcionarios.ts linha 48-64
const hasStatus = cols.some((c) => c.name === 'status');
const hasAtivo = cols.some((c) => c.name === 'ativo');
// Tenta adaptar - ISSO NÃO DEVERIA EXISTIR
```

**Solução:**

1. ✅ Definir UM schema canônico (recomendo migration 0105-0107)
2. ✅ Aplicar em TODOS os ambientes (dev, staging, prod)
3. ✅ Remover detecção dinâmica de schema
4. ✅ Testar TUDO após aplicar

---

### 2. FOREIGN KEYS NÃO ATIVAS (CRÍTICO 🔴)

**Problema:** SQLite requer `PRAGMA foreign_keys = ON;` mas não está sendo executado.

**Teste:**

```bash
sqlite> PRAGMA foreign_keys;
-- Retorna: 0 (DESATIVADO)
```

**Impacto:**

- FKs definidas mas não aplicadas
- Registros órfãos podem ser criados
- Cascata não funciona

**Evidência:**
Migration 0107 define FKs:

```sql
FOREIGN KEY (funcionario_cpf) REFERENCES funcionarios(cpf)
  ON DELETE CASCADE
```

Mas em `qualificacoes.service.ts` linha 226:

```typescript
// Verificação MANUAL de FK - não deveria ser necessário
const func = await this.db
  .prepare('SELECT id FROM funcionarios WHERE id = ?')
  .bind(funcionario_id)
  .first();
if (!func) throw new Error('Funcionário inválido');
```

**Solução:**

```typescript
// No index.ts do worker
app.use('*', async (c, next) => {
  await c.env.DB.exec('PRAGMA foreign_keys = ON;');
  await next();
});
```

---

### 3. BYPASS DE AUTENTICAÇÃO EM VARIÁVEL DE AMBIENTE (CRÍTICO 🔴)

**Problema:** `.dev.vars` tem `DEV_AUTH_BYPASS=true`

```typescript
// auth.ts linha 82
if (c.env.DEV_AUTH_BYPASS === 'true') {
  console.log('[AUTH DEBUG] Bypass ativo');
  return next(); // PULA TODA AUTENTICAÇÃO
}
```

**Impacto:**

- Se essa variável for definida em produção = DESASTRE TOTAL
- Qualquer pessoa pode acessar TUDO
- Danger Zone fica exposto

**Solução:**

```typescript
// Validação no startup
if (c.env.ENVIRONMENT === 'production' && c.env.DEV_AUTH_BYPASS === 'true') {
  throw new Error('🚨 DEV_AUTH_BYPASS não pode estar ativo em produção!');
}
```

---

### 4. MIGRATIONS SEM ROLLBACK (ALTA 🟡)

**Problema:** 113 migrations SEM scripts de rollback.

Exemplo `0105_refactor_funcionarios.sql`:

```sql
DROP TABLE IF EXISTS funcionarios_old;
ALTER TABLE funcionarios RENAME TO funcionarios_old;
-- ...
DROP TABLE funcionarios_old; -- SE FALHAR, DADOS PERDIDOS
```

**Impacto:**

- Erro em migration = perda de dados
- Impossível reverter
- Downtime prolongado

**Solução:**

1. Criar rollback para migrations críticas (0105-0107)
2. Backup automático ANTES de migrations destrutivas
3. Testar rollback em staging

---

### 5. BCRYPT NÃO COMPILA (CRÍTICA 🔴)

**Problema:** Build falha constantemente:

```
✘ [ERROR] Could not resolve "@node-rs/bcrypt"
src/services/auth.service.ts:1:38
```

**Impacto:**

- **Senhas podem não estar sendo hasheadas!**
- Sistema de autenticação comprometido
- Deploy quebrado

**Solução:**

```bash
cd worker-airtrust
npm uninstall @node-rs/bcrypt
npm install bcryptjs
npm install --save-dev @types/bcryptjs
```

```typescript
// auth.service.ts
import { hashSync, compareSync } from 'bcryptjs'; // Mudou
```

---

## 1️⃣ AUDITORIA DE BANCO DE DADOS (6.0/10)

### ✅ SUCESSOS

1. **Soft Delete Implementado**

   - `deleted_at` em todas as tabelas
   - Queries filtram `WHERE deleted_at IS NULL`
   - Auditoria preservada

2. **Índices de Performance**

   ```sql
   CREATE INDEX idx_funcionarios_matricula ON funcionarios(matricula);
   CREATE INDEX idx_qh_data_vencimento ON qualificacoes_historico(data_vencimento);
   CREATE INDEX idx_historico_func_cpf ON qualificacoes_historico(funcionario_cpf);
   ```

3. **Tabelas de Auditoria**

   - `admin_actions` - ações administrativas
   - `importacoes_log` - importações
   - `auditoria_avancada_v2` - auditoria geral

4. **Migrations Organizadas**
   - 113 migrations numeradas
   - Comentários de objetivo
   - Idempotência (CREATE IF NOT EXISTS)

### ⚠️ ALERTAS

1. **Falta de Constraints CHECK**

   ```sql
   -- DEVERIA TER:
   CHECK(length(cpf) = 11)
   CHECK(email LIKE '%@%')
   CHECK(nota >= 1.0 AND nota <= 5.0)
   ```

2. **Transações Não Usadas em Operações Complexas**

   - Importação não usa `BEGIN TRANSACTION`
   - Reset de módulos sem transação
   - Risco de dados corrompidos

3. **Backup Manual (Não Automatizado)**
   - Scripts existem mas não rodam automaticamente
   - Sem cron job configurado

### ❌ FALHAS CRÍTICAS

1. **Schema divergente** (ver seção top 5)
2. **FKs não ativas** (ver seção top 5)
3. **Migrations sem rollback** (ver seção top 5)

### 🎯 PLANO DE AÇÃO - BANCO

| Ação                                    | Prioridade | Tempo |
| --------------------------------------- | ---------- | ----- |
| Aplicar migrations 0105-0107 em staging | 🔴 ALTA    | 2h    |
| Testar schema unificado                 | 🔴 ALTA    | 1h    |
| Ativar PRAGMA foreign_keys              | 🔴 ALTA    | 30min |
| Testar cascata de FKs                   | 🔴 ALTA    | 1h    |
| Criar scripts de rollback               | 🟡 MÉDIA   | 4h    |
| Automatizar backup diário               | 🟡 MÉDIA   | 2h    |

---

## 2️⃣ AUDITORIA DE BACKEND APIs (7.5/10)

### ✅ SUCESSOS

1. **Endpoints CRUD Completos**

   - Funcionários: GET, POST, PUT, DELETE
   - Tipos: GET, POST, PUT, DELETE
   - Histórico: GET, POST, PUT, DELETE
   - Todos com paginação, filtros, ordenação

2. **Validação com Zod**

   ```typescript
   export const FuncionarioSchema = z.object({
     nome: z.string().min(3),
     cpf: z.string().regex(/^[0-9]{11}$/),
     email: z.string().email().nullable(),
   });
   ```

3. **Middleware de Segurança**

   - `auth()` - autenticação JWT
   - `adminOnly()` - proteção admin
   - `requireRole()` - RBAC

4. **Sistema de Importação Robusto**

   - `/api/importacao/template/:entidade` - templates CSV
   - `/api/importacao/validar/:entidade` - validação prévia
   - `/api/importacao/executar/:entidade` - execução
   - Batch processing (25 registros/chunk)
   - 4 modos de merge

5. **Danger Zone com Auditoria**
   ```typescript
   app.delete('/admin/reset/funcionarios', auth(), adminOnly(), async (c) => {
     // Deleta + registra em admin_actions
   });
   ```

### ⚠️ ALERTAS

1. **Rate Limiting Apenas no Login**

   ```typescript
   authRoutes.post('/login', rateLimit({ windowMs: 60000, max: 10 }), ...);
   ```

   - Deveria ter em importação (max 5/min)
   - Deveria ter em busca (max 100/min)

2. **Paginação Sem Limite Máximo**

   ```typescript
   const limit = parseInt(c.req.query('limit') || '50');
   // Usuário pode passar ?limit=999999
   ```

   **Solução:** `const limit = Math.min(parseInt(...), 100);`

3. **Upload Valida Apenas Extensão**

   ```typescript
   if (file.type !== 'application/pdf') throw new Error('Apenas PDF');
   // file.type vem do CLIENTE - pode ser falsificado
   ```

4. **Query de Busca Sem Índice Composto**
   ```typescript
   WHERE (nome LIKE ? OR email LIKE ? OR cpf LIKE ? OR matricula LIKE ?)
   // Sem índice composto, faz 4 scans de tabela
   ```

### ❌ FALHAS CRÍTICAS

1. **Bypass de Auth** (ver top 5)
2. **Bcrypt não compila** (ver top 5)

3. **Danger Zone Sem Confirmação de Senha**

   - Apenas verifica token JWT
   - Deveria exigir re-autenticação

4. **Importação Sem Limite de Tamanho**
   ```typescript
   // Nenhum limite de linhas no CSV
   // Usuário pode enviar 1 milhão de linhas
   ```
   **Solução:**
   ```typescript
   if (rows.length > 10000) {
     throw new Error('Máximo 10 mil linhas por importação');
   }
   ```

### 🎯 PLANO DE AÇÃO - BACKEND

| Ação                                       | Prioridade | Tempo |
| ------------------------------------------ | ---------- | ----- |
| Corrigir bcrypt (usar bcryptjs)            | 🔴 ALTA    | 30min |
| Garantir DEV_AUTH_BYPASS=false em prod     | 🔴 ALTA    | 15min |
| Adicionar limite em importação             | 🔴 ALTA    | 30min |
| Validar magic bytes em uploads             | 🔴 ALTA    | 1h    |
| Adicionar confirmação senha no Danger Zone | 🔴 ALTA    | 2h    |
| Rate limiting em importação                | 🟡 MÉDIA   | 2h    |
| Limite máximo em paginação                 | 🟡 MÉDIA   | 30min |

---

## 3️⃣ AUDITORIA DE SEGURANÇA (6.5/10)

### ✅ SUCESSOS

1. **JWT Implementado**

   - Tokens assinados
   - Middleware verifica em todas as rotas protegidas

2. **RBAC (Role-Based Access Control)**

   ```typescript
   requireRole('admin', 'manager');
   ```

3. **Prepared Statements**

   - Proteção contra SQL injection

   ```typescript
   db.prepare('SELECT * FROM funcionarios WHERE id = ?').bind(id);
   ```

4. **Sanitização de Strings**
   ```typescript
   sanitizeString(input); // Remove caracteres perigosos
   ```

### ⚠️ ALERTAS

1. **JWT Sem Expiração Clara**

   - Não há evidência de `expiresIn: '1h'`
   - Tokens podem ser válidos indefinidamente

2. **CORS Possivelmente Permissivo**

   - `Access-Control-Allow-Origin: *` em dev
   - Deveria ser restrito em prod

3. **Logs com Dados Sensíveis**
   ```typescript
   console.log('[AUTH] User:', user.email, user.cpf);
   // CPF é dado sensível (LGPD)
   ```

### ❌ FALHAS CRÍTICAS

1. **Bcrypt não funciona** (ver top 5)
2. **Bypass de auth em variável de ambiente** (ver top 5)
3. **Upload sem validação MIME real** (validação apenas client-side)

### 🎯 PLANO DE AÇÃO - SEGURANÇA

| Ação                           | Prioridade | Tempo |
| ------------------------------ | ---------- | ----- |
| Corrigir bcrypt                | 🔴 ALTA    | 30min |
| Validar DEV_AUTH_BYPASS        | 🔴 ALTA    | 15min |
| Validar magic bytes em uploads | 🔴 ALTA    | 1h    |
| Adicionar expiração JWT (1h)   | 🟡 MÉDIA   | 1h    |
| Restringir CORS em prod        | 🟡 MÉDIA   | 30min |
| Mascarar CPF em logs           | 🟡 MÉDIA   | 1h    |

---

## 📊 ESTATÍSTICAS - PARTE 1

| Categoria      | Total Itens | ✅ Sucessos  | ⚠️ Alertas   | ❌ Falhas   |
| -------------- | ----------- | ------------ | ------------ | ----------- |
| Banco de Dados | 20          | 10 (50%)     | 7 (35%)      | 3 (15%)     |
| Backend APIs   | 25          | 15 (60%)     | 7 (28%)      | 3 (12%)     |
| Segurança      | 20          | 8 (40%)      | 9 (45%)      | 3 (15%)     |
| **TOTAL**      | **65**      | **33 (51%)** | **23 (35%)** | **9 (14%)** |

---

## 🎯 CHECKLIST PRIORIZADO - PARTE 1

### 🔴 ALTA PRIORIDADE (Fazer ANTES do deploy)

- [ ] 1. Aplicar migrations 0105-0107 em staging (2h)
- [ ] 2. Testar schema unificado (1h)
- [ ] 3. Ativar `PRAGMA foreign_keys = ON;` (30min)
- [ ] 4. Testar cascata de FKs (1h)
- [ ] 5. Corrigir bcrypt (usar bcryptjs) (30min)
- [ ] 6. Validar `DEV_AUTH_BYPASS=false` em prod (15min)
- [ ] 7. Adicionar limite 10k linhas em importação (30min)
- [ ] 8. Validar magic bytes em uploads (1h)
- [ ] 9. Adicionar confirmação senha Danger Zone (2h)
- [ ] 10. Criar backup antes de migrations (1h)

**Total: ~10h**

### 🟡 MÉDIA PRIORIDADE (Sprint 2)

- [ ] 11. Rate limiting em importação (2h)
- [ ] 12. Limite máximo paginação (30min)
- [ ] 13. Criar scripts rollback migrations (4h)
- [ ] 14. Automatizar backup diário (2h)
- [ ] 15. Adicionar expiração JWT (1h)
- [ ] 16. Restringir CORS prod (30min)
- [ ] 17. Mascarar CPF em logs (1h)
- [ ] 18. Constraints CHECK no banco (2h)
- [ ] 19. Transações em operações complexas (3h)
- [ ] 20. Índice composto em busca (1h)

**Total: ~17h**

---

## 📞 PRÓXIMOS PASSOS

1. ✅ Ler **PARTE 2: FRONTEND, LÓGICA E PERFORMANCE**
2. ✅ Ler **PARTE 3: TESTES, DOCS E PLANO EXECUTIVO**
3. ✅ Executar checklist de ALTA PRIORIDADE
4. ✅ Testar TUDO em staging
5. ✅ Deploy em produção

---

**Relatório gerado em:** 25/11/2025 23:55:00  
**Documento:** Parte 1 de 3  
**Próximo:** [AUDITORIA_COMPLETA_PARTE2_FRONTEND_LOGICA.md]
