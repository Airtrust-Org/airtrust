# 📋 Como Configurar o Custom Domain (airtrust.online) no Cloudflare Pages

## ⚡ Resumo Rápido

Você precisa **ligar o domínio airtrust.online ao ambiente "Production"** do projeto Pages no Cloudflare. Isso garante que o domínio sirva o bundle mais atualizado.

---

## 🎯 Passo a Passo (EXATO)

### 1️⃣ Abrir o Cloudflare Dashboard

1. Acesse: **https://dash.cloudflare.com**
2. Faça login com sua conta (filipe.daumas@icloud.com)
3. Selecione o domínio: **airtrust.online**

### 2️⃣ Ir para Pages

1. No menu esquerdo, procure: **Workers & Pages** (ou **Pages**)
2. Clique em **Pages**
3. Procure pelo projeto: **airtrust**
4. Clique para abrir

### 3️⃣ Acessar Settings do Projeto

1. Você deve ver abas no topo: **Deployments**, **Settings**, etc.
2. Clique em **Settings**

### 4️⃣ Configurar Custom Domain

1. Procure a seção: **Custom domain** (ou **Domains**)
2. Você verá um botão: **Add custom domain** ou **Manage custom domains**
3. Clique nele

### 5️⃣ Adicionar/Verificar airtrust.online

1. Verá um input/lista mostrando:

   - `production.airtrust.pages.dev` (production branch)
   - `main.airtrust.pages.dev` (main branch)
   - Qualquer custom domain que já exista

2. Se `airtrust.online` **já estiver listado**, confirme que está ligado a **production**
3. Se **NÃO estiver**, clique em **Add custom domain** e:
   - Digite: `airtrust.online`
   - Selecione o branch: **production** (muito importante!)
   - Clique em **Add domain**

### 6️⃣ Verificar o DNS

1. Cloudflare pode pedir para configurar DNS
2. Verifique que airtrust.online tem um **CNAME** ou **A record** apontando para Cloudflare
3. Geralmente já está configurado (você vê o domínio funcionando)
4. Clique em **Verify domain** se houver um botão

---

## ✅ Como Confirmar que Funcionou

**Execute este comando para verificar**:

```bash
chmod +x verificar-versao-producao.sh
./verificar-versao-producao.sh
```

**Resultado esperado (SINCRONIZADO)**:

```
Pages Production:          bundle=DfICGExB | version=4fa9cacc
airtrust.online:           bundle=DfICGExB | version=4fa9cacc

✅ SINCRONIZADO! Ambos estão servindo o mesmo bundle.
```

---

## 🔴 Se Continuar Desincronizado

### Opção 1: Limpar Cache Cloudflare

1. No Dashboard Cloudflare
2. Vá em: **Caching** → **Configuration** → **Purge Cache** → **Purge Everything**
3. Aguarde 30-60 segundos

### Opção 2: Forçar Re-deploy no Pages

```bash
cd /Users/filipedaumas/Documents/airtrust\ v1
CLOUDFLARE_API_TOKEN= npx wrangler pages deploy dist/client \
  --project-name=airtrust --branch=production --commit-dirty=true
```

### Opção 3: Verificar DNS de airtrust.online

```bash
dig airtrust.online +short
```

Deve retornar IPs do Cloudflare (104.21.x.x ou 172.67.x.x)

---

## 📹 Vídeo/Capturas (se necessário)

Se você tiver dúvida em qual botão clicar, envie print do Dashboard e eu guio exatamente.

---

## 🎯 Tl;dr - 30 segundos

1. https://dash.cloudflare.com → Pages → airtrust
2. Settings → Custom domain
3. Garanta que `airtrust.online` esteja ligado a **production**
4. Pronto!

Depois de fazer isso, execute:

```bash
./verificar-versao-producao.sh
```

Deve aparecer:

```
✅ SINCRONIZADO!
```
