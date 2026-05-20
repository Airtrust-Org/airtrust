# 🔍 DEBUG - Importação Histórico Não Funciona

**Data:** 5 de Fevereiro de 2026  
**Problema:** Botão "Importar Histórico EdApp" mostra "processando" mas não acontece nada

---

## 🚨 PASSOS PARA DEBUG

### 1. Abrir Console do Navegador

1. Pressione `F12` ou `Cmd+Option+I` (Mac)
2. Vá na aba **Console**
3. Limpe o console (ícone 🚫)

### 2. Recarregar a Página

1. Pressione `Cmd+Shift+R` (Mac) ou `Ctrl+Shift+R` (Windows)
2. Isso força recarregar sem cache

### 3. Clicar no Botão "Importar Histórico EdApp"

### 4. Ver os Logs

Você verá logs assim:

```
🚀 Iniciando importação de histórico...
📝 Token presente: true
🌐 URL: https://api.airtrust.online/api/integracoes/edapp/importar-historico
📡 Status resposta: 200 OK
📦 Dados recebidos: {success: true, data: {...}}
```

---

## ❌ ERROS POSSÍVEIS

### Erro 1: Token não presente

```
📝 Token presente: false
```

**Solução:**

- Faça logout e login novamente
- Verifique se está autenticado

### Erro 2: HTTP 404

```
📡 Status resposta: 404 Not Found
```

**Solução:**

- Endpoint não deployado
- Executar: `cd worker-airtrust && npx wrangler deploy --env production`

### Erro 3: HTTP 401 Unauthorized

```
📡 Status resposta: 401 Unauthorized
```

**Solução:**

- Token inválido ou expirado
- Fazer login novamente

### Erro 4: HTTP 500

```
📡 Status resposta: 500 Internal Server Error
❌ Erro HTTP: {"success":false,"error":"..."}
```

**Solução:**

- Verificar logs do Cloudflare Workers
- Executar: `wrangler tail --env production`

### Erro 5: CORS Error

```
Access to fetch blocked by CORS policy
```

**Solução:**

- Verificar se API está respondendo
- Testar: `curl https://api.airtrust.online/api/health`

### Erro 6: EdApp API Token Inválido

```
📦 Dados recebidos: {success: false, error: "EdApp API Error: 401"}
```

**Solução:**

- Verificar variável de ambiente `EDAPP_API_TOKEN`
- Executar: `wrangler secret list --env production`

---

## 🔧 TESTES MANUAIS

### Teste 1: API Health

```bash
curl https://api.airtrust.online/api/health
```

**Esperado:**

```json
{ "success": true, "message": "OK", "version": "..." }
```

### Teste 2: Endpoint Importar (sem token)

```bash
curl -X POST https://api.airtrust.online/api/integracoes/edapp/importar-historico
```

**Esperado:**

```json
{ "success": false, "error": "Unauthorized" }
```

### Teste 3: Verificar se Worker está deployado

```bash
cd worker-airtrust
npx wrangler deployments list --env production
```

---

## 📋 CHECKLIST

- [ ] Console do navegador aberto
- [ ] Página recarregada (Cmd+Shift+R)
- [ ] Logs aparecem ao clicar no botão
- [ ] Copiar exatamente o que aparece no console
- [ ] Me enviar os logs

---

## 🎯 AÇÕES RÁPIDAS

### Se aparecer "404 Not Found":

```bash
cd worker-airtrust
npx wrangler deploy --env production
```

### Se aparecer "401 Unauthorized":

- Faça logout e login novamente na interface

### Se aparecer "500 Internal Server Error":

```bash
cd worker-airtrust
npx wrangler tail --env production
# Depois clique no botão novamente e veja o erro em tempo real
```

---

## 📤 ME ENVIE

**Cole aqui EXATAMENTE o que aparece no console:**

```
[COLE OS LOGS AQUI]
```

---

**Adicionei logs detalhados no código.**  
**Reconstrua com:** `npm run build`  
**Depois recarregue a página e tente novamente.**
