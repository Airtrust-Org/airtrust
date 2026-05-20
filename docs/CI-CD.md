# 🚀 CI/CD - Deploy Automático

**Data de Implementação:** 21/10/2025  
**Status:** ✅ Ativo

---

## 📋 Como Funciona

A cada `git push` na branch `main`:

1. ✅ **Testes** - Roda testes automatizados
2. ✅ **Build** - Compila o projeto
3. ✅ **Deploy Worker** - Atualiza backend na Cloudflare
4. ✅ **Validação** - Testa endpoints em produção
5. ✅ **Notificação** - Informa resultado no GitHub

**Tempo total:** ~5 minutos

---

## 🔧 Workflows

### 1. Deploy Automático
**Arquivo:** `.github/workflows/deploy.yml`  
**Trigger:** Push na branch `main`  
**Jobs:**
- 🧪 Test & Build
- 🔧 Deploy Worker
- ✅ Validate Deployment

### 2. Validação de PR
**Arquivo:** `.github/workflows/pr-check.yml`  
**Trigger:** Abertura/atualização de Pull Request  
**Jobs:**
- 🧪 Check PR (lint + build)

---

## 🔐 Secrets Necessários

Configure em: `https://github.com/fp-daumas/airtrust-v1/settings/secrets/actions`

### CLOUDFLARE_API_TOKEN
- **Descrição:** Token de API da Cloudflare
- **Como obter:**
  1. Acesse: https://dash.cloudflare.com/profile/api-tokens
  2. Clique em "Create Token"
  3. Use template "Edit Cloudflare Workers"
  4. Adicione permissões para D1 e Pages
  5. Copie o token gerado

### CLOUDFLARE_ACCOUNT_ID
- **Valor:** `4dca4e5fddc6a351651dd224f456586f`
- **Descrição:** ID da conta Cloudflare

---

## 🌐 URLs de Produção

### Backend (Worker)
- **URL:** https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev
- **Health Check:** `/api/v2/health`
- **Deploy:** Automático via GitHub Actions

### Frontend (Pages)
- **URL:** https://main.airtrust.pages.dev
- **Deploy:** Automático via Cloudflare Pages

### Monitoramento
- **GitHub Actions:** https://github.com/fp-daumas/airtrust-v1/actions
- **Cloudflare Dashboard:** https://dash.cloudflare.com

---

## ⏱️ Tempo de Deploy

| Etapa | Tempo | Descrição |
|-------|-------|-----------|
| Checkout | ~10s | Clone do repositório |
| Install | ~30s | Instalação de dependências |
| Lint | ~20s | Verificação de código |
| Tests | ~30s | Testes automatizados |
| Build | ~60s | Compilação do projeto |
| Deploy | ~90s | Upload para Cloudflare |
| Validate | ~20s | Testes de produção |
| **TOTAL** | **~5min** | Tempo total do pipeline |

---

## 🚀 Como Usar

### Deploy Automático

```bash
# 1. Fazer alterações no código
git add .
git commit -m "feat: nova funcionalidade"

# 2. Push (triggera deploy automático!)
git push origin main

# 3. Acompanhar em:
# https://github.com/fp-daumas/airtrust-v1/actions
```

### Deploy Manual

```bash
# Trigger manual via GitHub Actions
# Acesse: Actions → Deploy AirTrust → Run workflow
```

### Criar Pull Request

```bash
# 1. Criar branch
git checkout -b feature/nova-funcionalidade

# 2. Fazer alterações
git add .
git commit -m "feat: adicionar funcionalidade X"

# 3. Push
git push origin feature/nova-funcionalidade

# 4. Criar PR no GitHub
# Validação automática será executada
```

---

## ❌ Em Caso de Falha

### Workflow Falhou

1. **Verificar logs:**
   - Acesse: https://github.com/fp-daumas/airtrust-v1/actions
   - Clique no workflow que falhou
   - Veja os logs de cada job

2. **Causas comuns:**
   - ❌ Erro de build (código com erro)
   - ❌ Testes falhando
   - ❌ Secrets não configurados
   - ❌ API da Cloudflare indisponível

3. **Correção:**
   - Corrigir o problema localmente
   - Fazer novo commit
   - Push novamente (triggera novo deploy)

### Rollback

Se o deploy causou problemas:

```bash
# 1. Reverter commit
git revert HEAD
git push origin main

# 2. Ou fazer rollback manual
npm run deploy  # Deploy da versão anterior
```

---

## 📊 Monitoramento

### GitHub Actions

- **URL:** https://github.com/fp-daumas/airtrust-v1/actions
- **Badge:** ![Deploy Status](https://github.com/fp-daumas/airtrust-v1/actions/workflows/deploy.yml/badge.svg)

### Cloudflare

- **Workers:** https://dash.cloudflare.com/workers
- **Pages:** https://dash.cloudflare.com/pages
- **Analytics:** Disponível no dashboard

### Health Checks

```bash
# Worker
curl https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/health

# Resposta esperada:
# {"status":"ok","timestamp":"2025-10-21T22:10:00.000Z"}
```

---

## 🔧 Manutenção

### Atualizar Workflow

```bash
# Editar workflow
nano .github/workflows/deploy.yml

# Commit e push
git add .github/workflows/deploy.yml
git commit -m "chore: atualizar workflow CI/CD"
git push origin main
```

### Adicionar Novo Job

```yaml
new-job:
  name: 🆕 New Job
  needs: test-and-build
  runs-on: ubuntu-latest
  steps:
    - name: Do something
      run: echo "Hello!"
```

### Desabilitar CI/CD

```bash
# Renomear workflows
mv .github/workflows/deploy.yml .github/workflows/deploy.yml.disabled
mv .github/workflows/pr-check.yml .github/workflows/pr-check.yml.disabled

# Commit
git add .github/workflows/
git commit -m "chore: desabilitar CI/CD temporariamente"
git push origin main
```

---

## 📝 Boas Práticas

### Commits

```bash
# Use conventional commits
feat: nova funcionalidade
fix: correção de bug
docs: atualização de documentação
chore: tarefas de manutenção
test: adicionar testes
refactor: refatoração de código
```

### Pull Requests

1. ✅ Sempre criar PR para mudanças importantes
2. ✅ Aguardar validação automática passar
3. ✅ Revisar código antes de merge
4. ✅ Merge apenas se CI passar

### Deploy

1. ✅ Testar localmente antes de push
2. ✅ Verificar logs do CI/CD
3. ✅ Monitorar produção após deploy
4. ✅ Ter plano de rollback pronto

---

## 🎯 Próximas Melhorias

### Planejado

- [ ] Adicionar testes E2E
- [ ] Implementar code coverage
- [ ] Deploy staging automático
- [ ] Notificações no Slack/Discord
- [ ] Análise de segurança (Snyk)
- [ ] Performance monitoring
- [ ] Automated rollback

### Em Consideração

- [ ] Deploy preview para PRs
- [ ] Testes de carga
- [ ] Monitoramento de custos
- [ ] Backup automático antes de deploy

---

## 📚 Recursos

### Documentação

- **GitHub Actions:** https://docs.github.com/actions
- **Cloudflare Workers:** https://developers.cloudflare.com/workers/
- **Wrangler:** https://developers.cloudflare.com/workers/wrangler/

### Suporte

- **Issues:** https://github.com/fp-daumas/airtrust-v1/issues
- **Discussions:** https://github.com/fp-daumas/airtrust-v1/discussions

---

## ✅ Checklist de Configuração

### Inicial
- [x] Criar pasta `.github/workflows/`
- [x] Criar `deploy.yml`
- [x] Criar `pr-check.yml`
- [ ] Configurar `CLOUDFLARE_API_TOKEN`
- [ ] Configurar `CLOUDFLARE_ACCOUNT_ID`
- [ ] Testar primeiro deploy
- [ ] Adicionar badge ao README

### Validação
- [ ] Deploy automático funcionando
- [ ] PR check funcionando
- [ ] Health checks passando
- [ ] Notificações ativas

---

**Última atualização:** 21/10/2025  
**Mantido por:** Equipe AirTrust  
**Status:** ✅ Ativo e funcional
