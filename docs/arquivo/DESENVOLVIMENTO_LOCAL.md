# ========================================

# AMBIENTE LOCAL - GUIA COMPLETO

# ========================================

## 📋 Visão Geral

Este projeto foi **completamente limpo de configurações de produção**.  
Agora você trabalha **100% localmente** durante o desenvolvimento.

### O que foi removido:

- ❌ URLs de produção Cloudflare Workers
- ❌ Scripts de deploy automático
- ❌ Configurações wrangler.toml com IDs de produção
- ❌ Referências a Workers/Pages em produção

### O que foi configurado:

- ✅ `wrangler.dev.toml` - Config local apenas
- ✅ `.env.local` - Variáveis de ambiente locais
- ✅ Scripts atualizados (`start-local.sh`, `test-local.sh`)
- ✅ URLs localhost em todos os arquivos
- ✅ Testes apontando para localhost

---

## 🚀 Estrutura do Ambiente

### Portas Utilizadas

| Serviço              | Porta | URL                   |
| -------------------- | ----- | --------------------- |
| **Worker (Backend)** | 8787  | http://localhost:8787 |
| **Frontend (React)** | 3000  | http://localhost:3000 |

### Arquivos de Configuração

```
wrangler.dev.toml    → Configuração do worker local
.env.local           → Variáveis de ambiente
start-local.sh       → Inicia o worker
test-local.sh        → Valida endpoints
run-testsprite.sh    → Testes automatizados
```

---

## 📝 Configuração Detalhada

### wrangler.dev.toml

```toml
name = "airtrust-dev"
main = "src/worker/index.ts"
compatibility_date = "2024-11-01"

[[d1_databases]]
binding = "DB"
database_name = "airtrust-db-dev"
database_id = "local-dev-db"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "airtrust-files-dev"

[vars]
ENVIRONMENT = "development"
LOG_LEVEL = "debug"
VITE_API_URL = "http://localhost:8787/api"

[dev]
port = 8787
local_protocol = "http"
```

### .env.local

```bash
ENVIRONMENT=development
LOG_LEVEL=debug
VITE_API_URL=http://localhost:8787/api
WORKER_PORT=8787
FRONTEND_PORT=3000
```

---

## ⚙️ Scripts de Desenvolvimento

### 1. start-local.sh

```bash
#!/bin/bash
# Inicia o worker local na porta 8787
# Limpa processos antigos e cache

./start-local.sh
```

**O que faz:**

1. Mata processos wrangler/workerd antigos
2. Limpa cache do .wrangler/
3. Inicia wrangler dev com configuração local
4. Worker fica disponível em http://localhost:8787

---

### 2. test-local.sh

```bash
#!/bin/bash
# Testa 5 endpoints principais

./test-local.sh
```

**O que faz:**

- Testa `/api/health`
- Testa `/api/version`
- Testa `/api/dashboard`
- Testa `/api/funcionarios`
- Testa `/api/compliance`

**Saída esperada:**

```
✅ Health OK
✅ Version OK
✅ Dashboard OK
✅ Funcionários OK
✅ Compliance OK

📊 Resumo: 5/5 testes passaram
```

---

### 3. run-testsprite.sh

```bash
#!/bin/bash
# Executa suite completa de testes Python

./run-testsprite.sh
```

**O que faz:**

- Executa 10 testes (TC001-TC010)
- Todos apontam para http://localhost:8787
- Mostra relatório detalhado pass/fail

---

## 🔄 Workflow Diário

### Terminal 1: Backend

```bash
./start-local.sh
```

Aguarde até ver:

```
Ready on http://localhost:8787
```

### Terminal 2: Validação

```bash
./test-local.sh
```

Verifique se todos passam.

### Terminal 3: Frontend (opcional)

```bash
npm run dev
```

Acesse: http://localhost:3000

---

## 🗄️ Banco de Dados Local

### Localização

```
.wrangler/state/v3/d1/miniflare-D1DatabaseObject/
```

### Comandos Úteis

**Ver tabelas:**

```bash
wrangler d1 execute airtrust-db-dev --local --command "SELECT name FROM sqlite_master WHERE type='table';"
```

**Consultar funcionários:**

```bash
wrangler d1 execute airtrust-db-dev --local --command "SELECT id, nome FROM funcionarios LIMIT 5;"
```

**Limpar cache do banco:**

```bash
rm -rf .wrangler/state/v3/d1/
./start-local.sh
```

---

## 📦 Storage Local (R2)

### Localização

```
.wrangler/state/v3/r2/
```

### Como Funciona

- R2 é simulado localmente pelo Wrangler
- Arquivos ficam em `.wrangler/state/v3/r2/`
- Não precisa de configuração adicional

---

## 🧪 Testes

### Estrutura

```
testsprite_tests/
├── TC001_health.py          → Health check
├── TC002_version.py         → Version check
├── TC003_dashboard.py       → Dashboard
├── TC004_funcionarios.py    → CRUD funcionários
├── TC005_qualificacoes.py   → CRUD qualificações
├── TC006_exames.py          → CRUD exames
├── TC007_compliance.py      → Compliance
├── TC008_simuladores.py     → Simuladores
├── TC009_auditoria.py       → Auditoria
└── TC010_analytics.py       → Analytics
```

### Executar Testes

**Todos:**

```bash
./run-testsprite.sh
```

**Apenas um:**

```bash
python testsprite_tests/TC001_health.py
```

### Interpretar Resultados

```
✅ PASS: TC001_health
❌ FAIL: TC004_funcionarios
⚠️  SKIP: TC010_analytics
```

---

## 🛠️ Troubleshooting

### Porta 8787 ocupada

```bash
# Ver processo
lsof -i:8787

# Matar processo
pkill -9 -f wrangler

# Ou usar sudo
sudo lsof -i:8787 | grep LISTEN | awk '{print $2}' | xargs sudo kill -9
```

### Worker não inicia

```bash
# Limpar tudo
pkill -9 -f "wrangler|workerd"
rm -rf .wrangler node_modules/.cache dist

# Reinstalar deps
npm install

# Tentar novamente
./start-local.sh
```

### Build com erros

```bash
# Limpar e rebuildar
npm run build:clean

# Verificar erros TypeScript
npx tsc --noEmit
```

### Cache do D1 corrompido

```bash
# Deletar estado do D1
rm -rf .wrangler/state/v3/d1/

# Reiniciar worker (recria automaticamente)
./start-local.sh
```

### Frontend não conecta ao backend

1. Verificar se worker está rodando:

   ```bash
   curl http://localhost:8787/api/health
   ```

2. Verificar VITE_API_URL:

   ```bash
   cat .env.local | grep VITE_API_URL
   ```

3. Limpar cache do Vite:
   ```bash
   rm -rf node_modules/.vite
   npm run dev
   ```

---

## 📊 Monitoramento

### Logs do Worker

O worker mostra logs no terminal onde foi iniciado:

```
[wrangler:inf] Ready on http://localhost:8787
[DB] Query: SELECT * FROM funcionarios LIMIT 50
[API] GET /api/funcionarios - 200 - 45ms
```

### Logs do Frontend

Frontend mostra logs no console do navegador:

```
🔍 [API Config] VITE_API_URL: http://localhost:8787/api
🔍 [API Config] API_BASE_URL (final): http://localhost:8787/api
```

---

## 🚀 Quando Migrar para Produção

### Pré-requisitos

- [ ] Código estável e testado localmente
- [ ] Todos os testes passando
- [ ] Nova conta Cloudflare criada

### Passos

1. **Criar wrangler.toml de produção:**

   ```bash
   cp wrangler.dev.toml wrangler.toml
   ```

2. **Editar wrangler.toml:**

   - Alterar `name` para nome único
   - Criar D1 database: `wrangler d1 create airtrust-db-prod`
   - Criar R2 bucket: `wrangler r2 bucket create airtrust-files-prod`
   - Atualizar IDs no wrangler.toml

3. **Deploy:**

   ```bash
   wrangler deploy
   ```

4. **Testar produção:**
   ```bash
   curl https://SEU-WORKER.workers.dev/api/health
   ```

---

## 📚 Recursos Adicionais

- **Wrangler Docs:** https://developers.cloudflare.com/workers/wrangler/
- **D1 Docs:** https://developers.cloudflare.com/d1/
- **R2 Docs:** https://developers.cloudflare.com/r2/

---

## ✅ Checklist de Configuração

- [x] Processos de produção removidos
- [x] URLs de produção removidas do código
- [x] `wrangler.dev.toml` criado
- [x] `.env.local` criado
- [x] Scripts atualizados para localhost
- [x] Testes apontando para localhost
- [x] CORS configurado para localhost
- [x] package.json atualizado

---

**Ambiente 100% local pronto para desenvolvimento!** 🎉
