# 🔐 CONFIGURAR SECRETS DO GITHUB

**Tempo estimado:** 5 minutos  
**Pré-requisito:** Acesso ao repositório GitHub

---

## 📋 PASSO A PASSO

### 1️⃣ Acessar Configurações do Repositório

1. Acesse: https://github.com/fp-daumas/airtrust-v1/settings/secrets/actions
2. Ou navegue manualmente:
   - Vá para o repositório
   - Clique em **Settings** (⚙️)
   - No menu lateral, clique em **Secrets and variables** → **Actions**

---

### 2️⃣ Criar CLOUDFLARE_API_TOKEN

#### Obter o Token

1. **Acesse o Dashboard da Cloudflare:**
   - URL: https://dash.cloudflare.com/profile/api-tokens
   - Faça login se necessário

2. **Criar Novo Token:**
   - Clique em **"Create Token"**
   - Escolha template: **"Edit Cloudflare Workers"**

3. **Configurar Permissões:**
   ```
   Account:
   ✅ Workers Scripts - Edit
   ✅ D1 - Edit
   ✅ Pages - Edit
   
   Zone:
   ✅ Workers Routes - Edit
   ```

4. **Gerar Token:**
   - Clique em **"Continue to summary"**
   - Clique em **"Create Token"**
   - ⚠️ **COPIE O TOKEN AGORA** (só aparece uma vez!)

#### Adicionar ao GitHub

1. Volte para: https://github.com/fp-daumas/airtrust-v1/settings/secrets/actions
2. Clique em **"New repository secret"**
3. Preencha:
   - **Name:** `CLOUDFLARE_API_TOKEN`
   - **Secret:** Cole o token que você copiou
4. Clique em **"Add secret"**

✅ **Secret 1 configurado!**

---

### 3️⃣ Criar CLOUDFLARE_ACCOUNT_ID

#### Obter o Account ID

**Opção 1: Do Dashboard**
1. Acesse: https://dash.cloudflare.com
2. Clique em **Workers & Pages**
3. No canto direito, você verá **"Account ID"**
4. Copie: `4dca4e5fddc6a351651dd224f456586f`

**Opção 2: Do wrangler.json**
```bash
# Já está no arquivo wrangler.json
cat wrangler.json | grep accountId
```

#### Adicionar ao GitHub

1. Volte para: https://github.com/fp-daumas/airtrust-v1/settings/secrets/actions
2. Clique em **"New repository secret"**
3. Preencha:
   - **Name:** `CLOUDFLARE_ACCOUNT_ID`
   - **Secret:** `4dca4e5fddc6a351651dd224f456586f`
4. Clique em **"Add secret"**

✅ **Secret 2 configurado!**

---

## ✅ VERIFICAR CONFIGURAÇÃO

### Secrets Configurados

Você deve ver na lista:

```
CLOUDFLARE_API_TOKEN     ••••••••••••••••     Updated now
CLOUDFLARE_ACCOUNT_ID    ••••••••••••••••     Updated now
```

### Testar CI/CD

```bash
# 1. Fazer uma mudança pequena
echo "# CI/CD configurado! 🚀" >> README.md

# 2. Commit
git add README.md
git commit -m "test: testar CI/CD com secrets configurados"

# 3. Push (vai triggar o deploy!)
git push origin main

# 4. Acompanhar em:
# https://github.com/fp-daumas/airtrust-v1/actions
```

---

## ❌ TROUBLESHOOTING

### Erro: "Invalid API Token"

**Causa:** Token inválido ou expirado  
**Solução:**
1. Gerar novo token na Cloudflare
2. Atualizar secret no GitHub
3. Fazer novo push

### Erro: "Account ID not found"

**Causa:** Account ID incorreto  
**Solução:**
1. Verificar Account ID no dashboard Cloudflare
2. Atualizar secret no GitHub
3. Fazer novo push

### Erro: "Permission denied"

**Causa:** Token sem permissões necessárias  
**Solução:**
1. Criar novo token com todas as permissões:
   - Workers Scripts - Edit
   - D1 - Edit
   - Pages - Edit
2. Atualizar secret no GitHub
3. Fazer novo push

---

## 🔒 SEGURANÇA

### ✅ Boas Práticas

- ✅ **NUNCA** commitar secrets no código
- ✅ **NUNCA** compartilhar tokens
- ✅ Usar secrets do GitHub para CI/CD
- ✅ Rotacionar tokens periodicamente
- ✅ Revogar tokens não utilizados

### ⚠️ O que NÃO fazer

- ❌ Colocar tokens em arquivos `.env` commitados
- ❌ Compartilhar tokens em chat/email
- ❌ Usar o mesmo token para múltiplos projetos
- ❌ Deixar tokens com permissões excessivas

### 🔄 Rotação de Tokens

**Recomendado:** A cada 90 dias

```bash
# 1. Criar novo token na Cloudflare
# 2. Atualizar secret no GitHub
# 3. Testar deploy
# 4. Revogar token antigo na Cloudflare
```

---

## 📝 CHECKLIST FINAL

Antes de fazer o primeiro deploy:

- [ ] `CLOUDFLARE_API_TOKEN` configurado
- [ ] `CLOUDFLARE_ACCOUNT_ID` configurado
- [ ] Secrets visíveis na lista do GitHub
- [ ] Token tem todas as permissões necessárias
- [ ] Account ID está correto
- [ ] Teste de push realizado
- [ ] Workflow executou com sucesso

---

## 🎉 PRONTO!

Seus secrets estão configurados!

Agora a cada `git push` na branch `main`:
- ✅ Deploy automático será executado
- ✅ Produção será atualizada
- ✅ Você será notificado do resultado

**Próximo passo:** Fazer um push e ver a mágica acontecer! 🚀

---

**Dúvidas?** Consulte: `docs/CI-CD.md`  
**Problemas?** Abra uma issue: https://github.com/fp-daumas/airtrust-v1/issues
