# 🚀 DEPLOY CLOUDFLARE PAGES - COM SUAS CREDENCIAIS

## ⚠️ IMPORTANTE

Wrangler **NÃO aceita senha** diretamente. Você precisa de um **API Token**.

Mas não se preocupe - é fácil gerar um com suas credenciais!

## ✅ SOLUÇÃO EM 3 PASSOS

### **Step 1: Gerar API Token**

Vá para: https://dash.cloudflare.com/profile/api-tokens

**Crie um novo token:**

1. Clique em "Create Token"
2. Selecione template "Edit Cloudflare Workers" ou customize
3. Permissões necessárias:
   - ✅ Account > Cloudflare Workers Scripts > Edit
   - ✅ Account > Pages > Edit
4. Clique "Continue to summary"
5. Clique "Create Token"
6. **COPIE o token** (aparece apenas uma vez!)

### **Step 2: Faça Deploy**

Na sua máquina, abra terminal:

```bash
cd ~/airtrust-v1

# Opção A: Com token (mais rápido)
export CLOUDFLARE_API_TOKEN="seu-token-aqui"
chmod +x deploy-cloudflare-final.sh
./deploy-cloudflare-final.sh

# Opção B: Com wrangler login (mais fácil)
npx wrangler pages deploy dist/client --project-name airtrust --branch production
# Vai abrir browser para confirmar
```

### **Step 3: Pronto!**

Em 2-3 minutos seu site estará online:

```
🌐 https://airtrust.pages.dev
```

---

## 🎯 RESUMO

| Item            | Ação                                                                                |
| --------------- | ----------------------------------------------------------------------------------- |
| **Credenciais** | filipe.daumas@icloud.com + Davi@1979cla                                             |
| **Token**       | Gerar em https://dash.cloudflare.com/profile/api-tokens                             |
| **Deploy**      | `npx wrangler pages deploy dist/client --project-name airtrust --branch production` |
| **URL**         | https://airtrust.pages.dev                                                          |

---

## 🔗 LINKS

- Gerar Token: https://dash.cloudflare.com/profile/api-tokens
- Wrangler Docs: https://developers.cloudflare.com/workers/wrangler/

---

**Próximo passo:**

1. Gere o token no Cloudflare
2. Execute na sua máquina
3. Sistema online em 5 minutos! 🚀
