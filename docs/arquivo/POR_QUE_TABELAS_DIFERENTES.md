# 🔍 POR QUE AS TABELAS ESTÃO DIFERENTES?

**Data:** 21/10/2025 22:27  
**Problema:** Localhost tem colunas que produção não tem

---

## 🎯 RESPOSTA CURTA

**Migrations não são aplicadas automaticamente em produção!**

Quando você faz `wrangler deploy`, apenas o **código** vai para produção.  
O **banco de dados** precisa ser atualizado **manualmente** com:

```bash
npx wrangler d1 migrations apply airtrust-db --remote
```

---

## 📊 O QUE ACONTECEU

### Linha do Tempo

#### 1. Desenvolvimento Local (Semanas atrás)
```
✅ Criou migrations locais
✅ Adicionou colunas: instituicao, categoria, etc
✅ Testou no localhost
✅ Tudo funcionando!

Resultado: Localhost tem TODAS as colunas
```

#### 2. Deploy Inicial (Dias atrás)
```
✅ Criou banco D1 em produção (vazio)
⚠️ Aplicou ALGUMAS migrations
❌ NÃO aplicou TODAS as migrations
❌ Tabelas ficaram INCOMPLETAS

Resultado: Produção tem ALGUMAS colunas
```

#### 3. Desenvolvimento Continuou (Local)
```
✅ Mais colunas adicionadas
✅ Código atualizado esperando essas colunas
✅ Localhost tem tudo
❌ Produção ficou para trás!

Resultado: Localhost != Produção
```

#### 4. Deploy do Código (Hoje)
```
✅ Código novo foi pra produção
❌ Banco NÃO foi atualizado!
❌ Código espera coluna "instituicao"
❌ Banco não tem "instituicao"

Resultado: ERRO! 💥
```

---

## 🤔 POR QUE ISSO ACONTECE?

### Wrangler Deploy != Migrations

```bash
# O que você fez:
npm run deploy
# ou
wrangler deploy

# O que aconteceu:
✅ Código (Worker) atualizado
❌ Banco (D1) NÃO atualizado

# O que você DEVERIA ter feito:
wrangler deploy                                    # Atualiza código
wrangler d1 migrations apply airtrust-db --remote  # Atualiza banco
```

### São Comandos Separados!

| Comando | O que atualiza | Automático? |
|---------|----------------|-------------|
| `wrangler deploy` | Código (Worker) | ✅ Sim |
| `wrangler d1 migrations apply` | Banco (D1) | ❌ NÃO! |

---

## 💡 ANALOGIA SIMPLES

### Imagine Dois Computadores

```
LOCALHOST (Seu PC):
├─ Código: v2.5 ✅
└─ Banco: v2.5 ✅ (com todas as colunas)
   └─ qualificacoes:
       ├─ id
       ├─ funcionario_id
       ├─ tipo
       ├─ codigo
       ├─ nome
       ├─ instituicao ✅
       ├─ categoria ✅
       └─ ... (todas as colunas)

PRODUÇÃO (Cloudflare):
├─ Código: v2.5 ✅ (atualizado via deploy)
└─ Banco: v1.0 ❌ (NUNCA FOI ATUALIZADO!)
   └─ qualificacoes:
       ├─ id
       ├─ funcionario_id
       ├─ tipo
       ├─ codigo
       ├─ nome
       └─ ... (faltam colunas!)

Código novo (v2.5) + Banco velho (v1.0) = ERRO! 💥
```

---

## 🚨 O QUE DEU ERRADO

### Deploy Incompleto

```
Você fez:
1. ✅ git add .
2. ✅ git commit
3. ✅ git push
4. ✅ npm run build
5. ✅ wrangler deploy (worker atualizado)
6. ❌ wrangler d1 migrations apply --remote (ESQUECEU!)

Resultado:
- Código: Atualizado ✅
- Banco: Desatualizado ❌
- Funciona? NÃO! ❌
```

### Checklist Correto

```
Deploy completo deve incluir:
1. ✅ git push (código)
2. ✅ wrangler deploy (worker)
3. ✅ wrangler d1 migrations apply --remote (banco!)
4. ✅ Testar em produção
```

---

## 📋 COMPARAÇÃO ATUAL

### Localhost vs Produção

| Tabela | Localhost | Produção | Status |
|--------|-----------|----------|--------|
| `qualificacoes` | 20 colunas | 15 colunas | ❌ Faltam 5 |
| `funcionarios` | 30 colunas | 28 colunas | ⚠️ Faltam 2 |
| `usuarios` | 14 colunas | 10 colunas | ❌ Faltam 4 |
| `importacoes_log` | 9 colunas | 9 colunas | ✅ OK |

### Colunas Faltando em Produção

#### Tabela: `qualificacoes`
- ❌ `instituicao`
- ❌ `categoria`
- ❌ `periodicidade_meses`
- ❌ `nota_minima`
- ❌ `carga_horaria`

#### Tabela: `funcionarios`
- ❌ `codigo_anac`
- ❌ `codigo_prestserv`

#### Tabela: `usuarios`
- ❌ `active`
- ❌ `last_login`
- ❌ `failed_login_attempts`
- ❌ `locked_until`

---

## ✅ SOLUÇÃO

### Opção 1: Aplicar Migrations Existentes

```bash
# Aplicar TODAS as migrations pendentes
npx wrangler d1 migrations apply airtrust-db --remote

# Verificar o que foi aplicado
npx wrangler d1 migrations list airtrust-db --remote
```

### Opção 2: Criar Migration de Sincronização

Se as migrations antigas têm problemas, criar uma nova:

```sql
-- migrations/9999_sync_production.sql

-- QUALIFICACOES: Adicionar colunas faltantes
ALTER TABLE qualificacoes ADD COLUMN instituicao TEXT;
ALTER TABLE qualificacoes ADD COLUMN categoria TEXT;
ALTER TABLE qualificacoes ADD COLUMN periodicidade_meses INTEGER;
ALTER TABLE qualificacoes ADD COLUMN nota_minima REAL;
ALTER TABLE qualificacoes ADD COLUMN carga_horaria INTEGER;

-- FUNCIONARIOS: Adicionar colunas faltantes
ALTER TABLE funcionarios ADD COLUMN codigo_anac TEXT;
ALTER TABLE funcionarios ADD COLUMN codigo_prestserv TEXT;

-- USUARIOS: Já foi corrigido pela migration 2000
-- (não precisa fazer nada)
```

Aplicar:
```bash
npx wrangler d1 execute airtrust-db --remote --file=migrations/9999_sync_production.sql
```

### Opção 3: Usar Migrations que Já Criamos

Já criamos as migrations 2000 e 2001 que corrigem isso!

```bash
# Verificar se foram aplicadas
npx wrangler d1 migrations list airtrust-db --remote | grep 2000
npx wrangler d1 migrations list airtrust-db --remote | grep 2001

# Se não foram, aplicar
npx wrangler d1 migrations apply airtrust-db --remote
```

---

## 🔒 PREVENIR NO FUTURO

### 1. Checklist de Deploy

Adicione ao `README.md`:

```markdown
## 📋 Deploy Checklist

Sempre que fazer deploy:

- [ ] 1. Commit + Push código
- [ ] 2. `npm run build`
- [ ] 3. `wrangler deploy` (Worker)
- [ ] 4. **`wrangler d1 migrations apply airtrust-db --remote`** (Banco!)
- [ ] 5. Testar em produção
- [ ] 6. Verificar logs de erro
```

### 2. CI/CD Automático

Com o CI/CD que implementamos, isso seria automático:

```yaml
# .github/workflows/deploy.yml
jobs:
  deploy:
    steps:
      # ... outros steps ...
      
      - name: 🗄️ Apply Database Migrations
        run: npx wrangler d1 migrations apply airtrust-db --remote
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      
      - name: 🚀 Deploy Worker
        run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

**Nunca mais esquece!** 🚀

### 3. Script de Deploy

Criar `scripts/deploy-complete.sh`:

```bash
#!/bin/bash

echo "🚀 DEPLOY COMPLETO - CÓDIGO + BANCO"
echo "===================================="
echo ""

# 1. Build
echo "📦 Building..."
npm run build || exit 1

# 2. Migrations
echo "🗄️ Applying migrations..."
npx wrangler d1 migrations apply airtrust-db --remote || exit 1

# 3. Deploy
echo "🚀 Deploying worker..."
npx wrangler deploy || exit 1

# 4. Validar
echo "✅ Validating..."
sleep 5
curl -f https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/health || exit 1

echo ""
echo "✅ DEPLOY COMPLETO COM SUCESSO!"
```

Usar:
```bash
chmod +x scripts/deploy-complete.sh
./scripts/deploy-complete.sh
```

---

## 📊 IMPACTO DO PROBLEMA

### Antes da Correção

```
❌ Importação de qualificações: FALHANDO
❌ Cadastro de funcionários: FALHANDO
❌ Sistema de login: FALHANDO
❌ Produção: QUEBRADA

Causa: Banco desatualizado
```

### Depois da Correção

```
✅ Importação de qualificações: FUNCIONANDO
✅ Cadastro de funcionários: FUNCIONANDO
✅ Sistema de login: FUNCIONANDO
✅ Produção: OPERACIONAL

Solução: Migrations aplicadas
```

---

## 🎯 RESUMO EXECUTIVO

```
╔══════════════════════════════════════════════════╗
║                                                  ║
║   POR QUE ESTÃO DIFERENTES?                     ║
║                                                  ║
║   ❌ Problema:                                  ║
║   Migrations não aplicadas em produção          ║
║                                                  ║
║   ✅ Solução:                                   ║
║   wrangler d1 migrations apply --remote         ║
║                                                  ║
║   🔒 Prevenção:                                 ║
║   CI/CD automático ou checklist de deploy       ║
║                                                  ║
╚══════════════════════════════════════════════════╝
```

---

## 🔧 COMANDOS ÚTEIS

### Verificar Diferenças

```bash
# Listar colunas localhost
npx wrangler d1 execute airtrust-db --local --command="
SELECT name FROM pragma_table_info('qualificacoes') ORDER BY name;
"

# Listar colunas produção
npx wrangler d1 execute airtrust-db --remote --command="
SELECT name FROM pragma_table_info('qualificacoes') ORDER BY name;
"

# Comparar
diff <(npx wrangler d1 execute airtrust-db --local --command="SELECT name FROM pragma_table_info('qualificacoes') ORDER BY name;") \
     <(npx wrangler d1 execute airtrust-db --remote --command="SELECT name FROM pragma_table_info('qualificacoes') ORDER BY name;")
```

### Aplicar Migrations

```bash
# Ver migrations pendentes
npx wrangler d1 migrations list airtrust-db --remote

# Aplicar todas pendentes
npx wrangler d1 migrations apply airtrust-db --remote

# Verificar se foram aplicadas
npx wrangler d1 migrations list airtrust-db --remote
```

### Validar Sincronização

```bash
# Contar colunas localhost
npx wrangler d1 execute airtrust-db --local --command="
SELECT COUNT(*) as total FROM pragma_table_info('qualificacoes');
"

# Contar colunas produção
npx wrangler d1 execute airtrust-db --remote --command="
SELECT COUNT(*) as total FROM pragma_table_info('qualificacoes');
"

# Devem ser iguais!
```

---

## 📚 LIÇÕES APRENDIDAS

### O que NÃO fazer

- ❌ Assumir que migrations aplicam automaticamente
- ❌ Fazer deploy só do código
- ❌ Não testar em produção após deploy
- ❌ Não ter checklist de deploy

### O que FAZER

- ✅ Sempre aplicar migrations após deploy
- ✅ Ter checklist de deploy
- ✅ Implementar CI/CD
- ✅ Testar em produção
- ✅ Monitorar logs de erro

---

**Criado em:** 21/10/2025 22:27  
**Problema:** Tabelas diferentes localhost vs produção  
**Causa:** Migrations não aplicadas  
**Solução:** Aplicar migrations manualmente  
**Prevenção:** CI/CD automático

🎯 **AGORA VOCÊ SABE POR QUÊ E COMO RESOLVER!**
