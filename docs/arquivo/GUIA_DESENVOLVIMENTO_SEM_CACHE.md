# 🚀 GUIA RÁPIDO - DESENVOLVIMENTO SEM DOR DE CABEÇA

## 🔥 PROBLEMA RESOLVIDO: Cache infinito do Cloudflare

Este guia resolve **DEFINITIVAMENTE** o problema de cache do Cloudflare Pages.

---

## 📋 Comandos Disponíveis

### 1️⃣ Desenvolvimento Local (SEM cache)

```bash
npm run dev:fresh
```

**O que faz:**

- ✅ Limpa TODO o cache do Vite
- ✅ Remove dist/ local
- ✅ Inicia backend (porta 8787)
- ✅ Inicia frontend (porta 3000)
- ✅ SEM cache, mudanças aparecem INSTANTANEAMENTE

**Acesse:** http://localhost:3000

---

### 2️⃣ Deploy para Produção (FORÇA atualização)

```bash
npm run deploy
```

**O que faz:**

- ✅ Limpa dist/ e cache do Vite
- ✅ Build com hash único + timestamp
- ✅ Injeta versão no HTML
- ✅ Commit automático
- ✅ Push para GitHub
- ✅ Cloudflare Pages faz deploy automaticamente

**Aguarde:** 30-60 segundos após o push

**Acesse:** https://production.airtrust.pages.dev

---

## 💡 Como Forçar Refresh no Navegador

### Chrome / Edge / Brave

- **Windows:** `Ctrl + Shift + R`
- **Mac:** `Cmd + Shift + R`

### Firefox

- **Windows:** `Ctrl + F5`
- **Mac:** `Cmd + Shift + R`

### Safari

- **Mac:** `Cmd + Option + R`

### Ou use Aba Anônima

- **Windows:** `Ctrl + Shift + N`
- **Mac:** `Cmd + Shift + N`

---

## 🔧 Configurações Aplicadas

### 1. Headers HTTP (\_headers)

```
Cache-Control: no-cache, no-store, max-age=0
Pragma: no-cache
Expires: 0
```

### 2. Build com Hash Único

Cada build gera nomes de arquivo ÚNICOS:

```
assets/index-[hash]-1732123456-abc123.js
assets/vendor-[hash]-1732123456-xyz789.js
```

### 3. Meta Tags no HTML

```html
<meta http-equiv="Cache-Control" content="no-cache, no-store, max-age=0, must-revalidate" />
<meta http-equiv="Pragma" content="no-cache" />
<meta http-equiv="Expires" content="0" />
<meta name="build-version" content="1732123456" />
```

---

## ✅ Checklist de Desenvolvimento

### Quando trabalhar localmente:

- [ ] Sempre use `npm run dev:fresh` (não `npm run dev`)
- [ ] Se ver conteúdo antigo, faça `Ctrl+Shift+R` no navegador

### Quando fazer deploy:

- [ ] Use `npm run deploy` (não commit manual)
- [ ] Aguarde 30-60 segundos
- [ ] Abra em aba anônima ou faça `Ctrl+Shift+R`

---

## 🆘 Se AINDA ver conteúdo antigo

### 1. Limpar cache do navegador completamente

**Chrome/Edge:**

1. Abra DevTools (F12)
2. Clique com botão direito no ícone de refresh
3. Escolha "Limpar cache e fazer hard reload"

**Firefox:**

1. Abra DevTools (F12)
2. Vá em Network
3. Marque "Disable cache"

### 2. Usar modo de desenvolvimento do DevTools

1. Abra DevTools (F12)
2. Vá em Network
3. Marque "Disable cache"
4. Mantenha DevTools aberto

### 3. Limpar cache do Cloudflare (última opção)

1. Acesse: https://dash.cloudflare.com
2. Vá em "Caching" → "Configuration"
3. Clique em "Purge Everything"

---

## 📊 URLs do Sistema

| Ambiente              | URL                                   | Descrição             |
| --------------------- | ------------------------------------- | --------------------- |
| **Local Frontend**    | http://localhost:3000                 | Desenvolvimento local |
| **Local Backend**     | http://localhost:8787                 | Worker local          |
| **Produção Frontend** | https://production.airtrust.pages.dev | Cloudflare Pages      |
| **Produção Backend**  | https://airtrust.airtrust.workers.dev | Cloudflare Workers    |

---

## 🎯 Credenciais de Teste

**Email:** admin@airtrust.com  
**Senha:** Admin@123

_(Já preenchidas automaticamente no formulário de login)_

---

## 🐛 Debug

### Ver versão do build atual

Abra o console do navegador (F12) e execute:

```javascript
document.querySelector('meta[name="build-version"]').content;
```

### Ver se cache está desabilitado

```javascript
// Deve retornar "no-cache, no-store..."
fetch('/').then((r) => r.headers.get('cache-control'));
```

---

## 📝 Resumo Final

✅ **Para desenvolver:** `npm run dev:fresh`  
✅ **Para fazer deploy:** `npm run deploy`  
✅ **Para forçar refresh:** `Ctrl+Shift+R` (ou aba anônima)

**Nunca mais perca tempo com cache!** 🎉
