# ✅ VALIDAR SECRETS DO GITHUB

**Criado em:** 21/10/2025 22:22  
**Workflow:** `.github/workflows/validate-secrets.yml`

---

## 🎯 OBJETIVO

Testar se os secrets do GitHub Actions estão configurados corretamente ANTES de fazer deploy.

---

## 🚀 COMO USAR

### Método 1: Via Interface GitHub

1. **Acesse seu repositório:**
   ```
   https://github.com/fp-daumas/airtrust-v1
   ```

2. **Vá para Actions:**
   - Clique na aba "Actions" no topo

3. **Selecione o workflow:**
   - No menu lateral esquerdo
   - Clique em "✅ Validate Secrets"

4. **Execute:**
   - Clique no botão "Run workflow" (canto direito)
   - Selecione branch: `main`
   - Clique no botão verde "Run workflow"

5. **Aguarde:**
   - ~30 segundos
   - Atualize a página se necessário

6. **Veja o resultado:**
   - ✅ Verde = Tudo OK!
   - ❌ Vermelho = Algo errado

### Método 2: Link Direto

```
https://github.com/fp-daumas/airtrust-v1/actions/workflows/validate-secrets.yml
```

---

## 📊 O QUE É TESTADO

### 1️⃣ Verificar Secrets (5s)

Testa se os secrets existem:
- ✅ `CLOUDFLARE_API_TOKEN` existe?
- ✅ `CLOUDFLARE_ACCOUNT_ID` existe?
- ✅ Não estão vazios?

### 2️⃣ Validar Token (10s)

Testa se o token é válido:
- ✅ Token está ativo?
- ✅ Token não expirou?
- ✅ Token tem formato correto?

### 3️⃣ Testar Permissões (10s)

Testa se o token tem permissões:
- ✅ Pode listar Workers?
- ✅ Pode acessar Account?
- ✅ Tem todas as permissões necessárias?

### 4️⃣ Validação Completa (5s)

Confirma que tudo está OK:
- ✅ Secrets configurados
- ✅ Token válido
- ✅ Permissões OK
- ✅ Sistema pronto para CI/CD!

---

## ✅ RESULTADO: SUCESSO

Se tudo estiver correto, você verá:

```
✅ Validate Secrets
  └─ 🔍 Testar Configuração (30s)
      ├─ 1️⃣ Verificar Secrets ✅
      │   ├─ CLOUDFLARE_API_TOKEN: Existe (40 caracteres)
      │   └─ CLOUDFLARE_ACCOUNT_ID: 4dca4e5fddc6a351651dd224f456586f
      │
      ├─ 2️⃣ Validar Token ✅
      │   ├─ HTTP Status Code: 200
      │   ├─ TOKEN VÁLIDO E ATIVO!
      │   └─ Status: active
      │
      ├─ 3️⃣ Testar Permissões ✅
      │   ├─ Permissão Workers: OK (1 worker)
      │   ├─ Permissão Account: OK
      │   └─ TODAS AS PERMISSÕES OK!
      │
      └─ 🎉 Validação Completa ✅
          ├─ Secrets configurados corretamente
          ├─ Token válido e ativo
          ├─ Permissões necessárias OK
          └─ Sistema pronto para CI/CD!
```

**Status:** ✅ Success  
**Tempo:** ~30 segundos

---

## ❌ RESULTADO: ERRO

### Erro 1: Secret Não Existe

```
❌ ERRO: CLOUDFLARE_API_TOKEN está vazio ou não existe!

📝 Como corrigir:
1. Vá para: Settings → Secrets and variables → Actions
2. Clique em 'New repository secret'
3. Nome: CLOUDFLARE_API_TOKEN
4. Valor: [seu token da Cloudflare]
```

**Solução:** Configurar o secret (ver `CONFIGURAR_SECRETS.md`)

### Erro 2: Token Inválido

```
❌ TOKEN INVÁLIDO OU EXPIRADO!

HTTP Status Code: 401

📝 Como corrigir:
1. Vá para: https://dash.cloudflare.com/profile/api-tokens
2. Crie um novo token
3. Template: 'Edit Cloudflare Workers'
4. Adicione permissões: Workers, Pages, Account
5. Copie o token
6. Atualize o secret CLOUDFLARE_API_TOKEN no GitHub
```

**Solução:** Criar novo token e atualizar secret

### Erro 3: Permissões Faltando

```
⚠️ AVISO: Algumas permissões podem estar faltando

❌ Permissão Workers: NEGADA
❌ Permissão Account: NEGADA

📝 Verifique se o token tem:
- Workers: Edit
- Pages: Edit
- Account Settings: Read
```

**Solução:** Criar token com todas as permissões

---

## 🔧 TROUBLESHOOTING

### Workflow Não Aparece

**Problema:** Não vejo "✅ Validate Secrets" na lista

**Solução:**
1. Verifique se fez commit e push
2. Aguarde ~1 minuto
3. Atualize a página
4. Verifique se está na aba "Actions"

### Workflow Falha Imediatamente

**Problema:** Falha em 1-2 segundos

**Causa:** Secrets não configurados

**Solução:**
1. Clique no job falhado
2. Leia a mensagem de erro
3. Configure os secrets
4. Execute novamente

### Token Válido Mas Permissões Negadas

**Problema:** Token válido mas não consegue listar Workers

**Causa:** Token sem permissões necessárias

**Solução:**
1. Criar novo token
2. Usar template "Edit Cloudflare Workers"
3. Adicionar permissões:
   - Workers Scripts: Edit
   - Account Settings: Read
   - Pages: Edit (opcional)

---

## 📝 QUANDO USAR

### Antes do Primeiro Deploy

```bash
# 1. Configurar secrets no GitHub
# 2. Executar validação
# 3. Ver se tudo está OK
# 4. Fazer primeiro deploy
```

### Após Atualizar Token

```bash
# 1. Atualizar secret no GitHub
# 2. Executar validação
# 3. Confirmar que novo token funciona
```

### Quando CI/CD Falhar

```bash
# 1. CI/CD falhou?
# 2. Executar validação
# 3. Ver qual secret está com problema
# 4. Corrigir
# 5. Tentar deploy novamente
```

### Periodicamente (Recomendado)

```bash
# A cada 30 dias:
# 1. Executar validação
# 2. Verificar se token ainda está ativo
# 3. Rotacionar token se necessário
```

---

## 🎯 CHECKLIST PRÉ-DEPLOY

Antes de fazer o primeiro deploy, execute:

- [ ] Configurar `CLOUDFLARE_API_TOKEN`
- [ ] Configurar `CLOUDFLARE_ACCOUNT_ID`
- [ ] Executar "✅ Validate Secrets"
- [ ] Ver resultado ✅ Success
- [ ] Confirmar todas as 4 etapas passaram
- [ ] Fazer commit e push
- [ ] Deploy automático vai funcionar!

---

## 📚 RECURSOS

### Documentação
- **Configurar Secrets:** `CONFIGURAR_SECRETS.md`
- **CI/CD Completo:** `docs/CI-CD.md`
- **Troubleshooting:** `TROUBLESHOOTING_IMPORTACAO.md`

### Links Úteis
- **GitHub Actions:** https://github.com/fp-daumas/airtrust-v1/actions
- **Cloudflare Tokens:** https://dash.cloudflare.com/profile/api-tokens
- **Workflow File:** `.github/workflows/validate-secrets.yml`

---

## 🎉 PRÓXIMOS PASSOS

### Se Validação Passou ✅

1. **Você está pronto!**
   - Secrets configurados ✅
   - Token válido ✅
   - Permissões OK ✅

2. **Fazer deploy:**
   ```bash
   git push origin main
   # Deploy automático vai funcionar!
   ```

3. **Acompanhar:**
   ```
   https://github.com/fp-daumas/airtrust-v1/actions
   ```

### Se Validação Falhou ❌

1. **Ver erro específico**
   - Clicar no job falhado
   - Ler mensagem de erro

2. **Corrigir problema**
   - Seguir instruções do erro
   - Configurar/atualizar secrets

3. **Executar novamente**
   - Rodar validação de novo
   - Confirmar que passou

4. **Fazer deploy**
   - Agora sim, fazer push
   - Deploy vai funcionar!

---

## 💡 DICAS

### Executar Sempre Que

- ✅ Configurar secrets pela primeira vez
- ✅ Atualizar token
- ✅ CI/CD falhar misteriosamente
- ✅ Rotacionar secrets (a cada 90 dias)
- ✅ Adicionar novo desenvolvedor ao projeto

### Não Precisa Executar

- ❌ A cada deploy (só se houver problema)
- ❌ A cada commit
- ❌ A cada PR

### Tempo de Execução

- **Normal:** 30 segundos
- **Rápido:** 15 segundos (se tudo OK)
- **Lento:** 60 segundos (se houver timeout)

---

**Criado em:** 21/10/2025 22:22  
**Workflow:** `.github/workflows/validate-secrets.yml`  
**Status:** ✅ Pronto para uso

🎉 **Execute agora e veja se seus secrets estão corretos!**
