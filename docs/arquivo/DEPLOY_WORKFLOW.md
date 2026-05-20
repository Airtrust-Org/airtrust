# 🚀 DEPLOY WORKFLOW - AirTrust v1

## 📋 Resumo Executivo

Este documento descreve o workflow completo e seguro para fazer deploy da AirTrust v1 em produção, com 2 scripts automatizados que previnem erros comuns.

---

## 🔍 Checklist Pré-Deploy (Opcional mas Recomendado)

Execute este script ANTES de fazer qualquer deploy para validar o estado do projeto:

```bash
./scripts/pre-deploy-check.sh
```

### O que valida?

✅ **Git Checks**

- Branch correto (main ou production)
- Sem mudanças uncommitted
- Upstream atualizado

✅ **Build Checks**

- dist/client/ compilado
- Arquivos gerados
- index.html presente
- Assets do front compilados

✅ **Backend Checks**

- Worker-airtrust estruturado
- wrangler.toml configurado
- Endpoints críticos presentes

✅ **Config Checks**

- API_BASE_URL configurado
- GitHub Actions disponível

⚠️ **Avisos Informativos**

- WIP/TODO em commits recentes
- Muitos arquivos mudados (>50)
- dist/ no .gitignore

### Resultado

```
✅ Passou: 12/12
⚠️  Avisos: 0
✅ PRONTO PARA DEPLOY!
```

---

## 🚀 Deploy Automático com Validação

Após passar no checklist, execute o deploy automático:

```bash
./scripts/deploy-validated.sh
```

### Pipeline de Validação (11 passos)

1. **Verificar branch** → Garante que está em main/production
2. **Limpar cache** → Remove arquivos temporários
3. **npm install** → Reinstala dependências
4. **npm run build** → Compila frontend + worker
5. **Validar dist/** → Confirma que files foram gerados
6. **TypeScript check** → Valida sem erros críticos
7. **Limpar dist do git** → Remove rastreamento anterior
8. **git add dist/** → Adiciona novos compilados
9. **git commit** → Commita com mensagem automática
10. **git push** → Envia para GitHub/Vercel
11. **wrangler deploy** → Deploy no Cloudflare Workers

### Logs

Cada execução gera log em `logs/deploy-${TIMESTAMP}.log` para auditoria.

### Opções Avançadas

```bash
# Deploy sem limpar cache (mais rápido)
./scripts/deploy-validated.sh --no-cache

# Teste dry-run (sem push/deploy)
./scripts/deploy-validated.sh --dry-run

# Com log customizado
./scripts/deploy-validated.sh --log ~/my-deploy.log
```

---

## 🔄 Fluxo de Trabalho Completo

### 1️⃣ Desenvolvimento Local

```bash
# Terminal 1: Dev server
npm run dev:all

# Trabalhar nos arquivos...
# Terminal 2: Testes (opcional)
npm run test
```

### 2️⃣ Commit & Push (Feature Branch)

```bash
# Commit mudanças
git add .
git commit -m "feat: nova funcionalidade"

# Push para feature branch
git push origin feature/minha-feature
```

### 3️⃣ Pré-Produção (Code Review)

```bash
# No GitHub: Create Pull Request
# Review → Approve → Merge para main (via GitHub UI)
```

### 4️⃣ Deploy em Produção

```bash
# Terminal: Deploy automático com validação
./scripts/pre-deploy-check.sh    # Validar
./scripts/deploy-validated.sh    # Deploy

# Confirmações automáticas:
# ✅ Build passou
# ✅ Commit feito
# ✅ GitHub push (Vercel auto-deploy)
# ✅ Worker deploy (Cloudflare)
```

### 5️⃣ Verificação Pós-Deploy

```bash
# Acessar produção
# https://production.airtrust.pages.dev

# Verificar APIs
curl https://airtrust-api.airtrust.workers.dev/health

# Logs do Worker
wrangler tail airtrust
```

---

## ⚠️ Checkpoints Críticos

| Checkpoint                | Verificar                                                                             | Fix                                |
| ------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------- |
| **Branch correto**        | `git branch` mostra `* main`                                                          | `git checkout main`                |
| **Mudanças salvas**       | Sem saída em `git status`                                                             | `git add . && git commit -m "..."` |
| **Build compila**         | Sem erros em `npm run build`                                                          | Ver `error.log`, revisar TS        |
| **dist/ tem arquivos**    | `ls dist/` mostra pastas                                                              | Reexecutar build                   |
| **API_BASE_URL correto**  | `grep API_BASE_URL src/react-app/config/api.ts`                                       | Configurar em config/api.ts        |
| **Export do Hono**        | `grep "export default" worker-airtrust/src/routes/qualificacoes.ts` deve estar no EOF | Mover para fim do arquivo          |
| **Endpoints registrados** | `curl localhost:8787/api/qualificacoes/...` retorna 200                               | Verificar endpoints.ts             |

---

## 🐛 Troubleshooting

### Erro: "Branch deve ser main ou production"

```bash
# Solução: Switch para main
git checkout main
git pull origin main
```

### Erro: "Mudanças uncommitted"

```bash
# Solução: Commit ou discard
git add .
git commit -m "msg"
# ou
git checkout .  # discard
```

### Erro: "Build falhou"

```bash
# Limpar cache e reinstalar
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Erro: "dist/ não tem arquivos"

```bash
# Verificar build output
npm run build --verbose

# Verificar TypeScript errors
npx tsc --noEmit

# Limpar e rebuildar
rm -rf dist/
npm run build
```

### Production ainda mostra código antigo

```bash
# 1. Confirmar push foi enviado
git log origin/main -1

# 2. Confirmar build em Vercel
# https://vercel.com/dashboard → Veja logs de build

# 3. Hard refresh no browser
# Cmd+Shift+R (Mac) ou Ctrl+Shift+R (Windows/Linux)
```

---

## 📊 Status do Deploy

Após executar `./scripts/deploy-validated.sh`, você verá:

```
════════════════════════════════════════════
✅ BUILD (2640 modules, 681.56 KB)
✅ DIST (42 files, clean)
✅ TYPESCRIPT (0 errors)
✅ GIT (3 commits, main branch)
✅ VERCEL (https://production.airtrust.pages.dev)
✅ WORKER (airtrust-api.airtrust.workers.dev)
════════════════════════════════════════════
🎉 Deploy Complete!
```

---

## 📅 Histórico de Deploys

Cada deploy fica registrado em `logs/`:

```bash
# Ver todos os deploys
ls -la logs/deploy-*.log

# Ver último deploy
tail -f logs/deploy-*.log | tail -100

# Grep por erros
grep -i "error\|fail" logs/deploy-*.log
```

---

## 🛡️ Checklist de Segurança

Antes de cada deploy verificar:

- [ ] Nenhum `console.log` ou `debugger` em código production
- [ ] Nenhuma senha/API key em código (usar `.env`)
- [ ] Nenhum `TODO: REMOVER ISSO` pendente
- [ ] Testes locais passaram (`npm run test`)
- [ ] Sem dependências vulneráveis (`npm audit`)
- [ ] Endpoints foram testados com curl/Postman
- [ ] Database migrations foram aplicadas (se houver)

---

## 🔗 Referências Rápidas

| Comando                         | O que faz                       |
| ------------------------------- | ------------------------------- |
| `./scripts/pre-deploy-check.sh` | Valida estado do projeto        |
| `./scripts/deploy-validated.sh` | Deploy automatizado seguro      |
| `npm run build`                 | Build local (sem deploy)        |
| `npm run dev:all`               | Dev server (frontend + backend) |
| `git push origin main`          | Push para GitHub                |
| `wrangler deploy`               | Deploy Worker manualmente       |
| `wrangler tail`                 | Ver logs do Worker              |

---

## 💬 FAQ

**P: Posso fazer deploy de uma feature branch?**
R: Não, apenas `main` e `production` branches fazem deploy. Use PR para mergear.

**P: Quantas vezes posso fazer deploy por dia?**
R: Quantas vezes precisar! O script foi feito para ser seguro e rápido.

**P: E se der erro a meio do deploy?**
R: O script para na primeira falha. Ver log em `logs/` e tentar novamente após fix.

**P: Como faço rollback?**
R: `git revert COMMIT_HASH && ./scripts/deploy-validated.sh`

**P: Preciso fazer deploy manual?**
R: Nunca! Use `./scripts/deploy-validated.sh` sempre.

---

**Última atualização:** 13/11/2025
**Validado com:** Node 20.x, npm 10.x, wrangler 3.x
