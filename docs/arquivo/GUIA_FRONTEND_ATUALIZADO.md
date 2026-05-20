# 🔥 GUIA DEFINITIVO - FRONTEND SEMPRE ATUALIZADO

## ⚠️ PROBLEMA

O frontend do localhost não atualiza mesmo após build/deploy.

---

## ✅ SOLUÇÃO DEFINITIVA

### 1️⃣ **USE O SCRIPT DE RESTART**

Sempre que o frontend não atualizar, execute:

```bash
./restart-dev-now.sh
```

**O que ele faz:**

1. ✅ Mata todos os processos na porta 3000
2. ✅ Limpa TODOS os caches (node_modules/.vite, .vite, dist)
3. ✅ Faz build completo do zero
4. ✅ Inicia dev server em background
5. ✅ Mostra URL e como ver logs

---

### 2️⃣ **VERIFICAR SE ESTÁ RODANDO**

```bash
lsof -ti:3000
```

**Saída esperada:**

- Se mostrar números (PIDs) = ✅ Rodando
- Se não mostrar nada = ❌ Parado

---

### 3️⃣ **VER LOGS EM TEMPO REAL**

```bash
tail -f /tmp/vite-server.log
```

**O que ver:**

```
VITE v6.4.1  ready in 124 ms
➜  Local:   http://localhost:3000/
➜  Network: http://192.168.15.3:3000/
```

Se ver isso = ✅ Server funcionando!

---

### 4️⃣ **PARAR O SERVER**

```bash
lsof -ti:3000 | xargs kill -9
```

---

## 🎯 WORKFLOW RECOMENDADO

### Quando fizer mudanças no código:

1. **Salve os arquivos** (Cmd+S)
2. **Aguarde 2 segundos** (HMR automático)
3. **Recarregue o navegador** (Cmd+R)

### Se não atualizar:

1. **Execute:** `./restart-dev-now.sh`
2. **Aguarde terminar o build**
3. **Abra:** http://localhost:3000/simuladores
4. **Force reload:** Cmd+Shift+R (Chrome/Safari)

---

## 🔍 DEBUG

### Problema: "Cannot GET /"

**Causa:** Server não está rodando

**Solução:**

```bash
./restart-dev-now.sh
```

### Problema: "Código antigo ainda aparece"

**Causa:** Cache do navegador

**Solução:**

1. Abrir DevTools (F12)
2. Clicar direito em Reload
3. Escolher "Empty Cache and Hard Reload"

OU

```bash
# Chrome
Cmd+Shift+R

# Safari
Cmd+Option+E (limpar cache)
Depois Cmd+R
```

### Problema: "Port 3000 already in use"

**Causa:** Processo anterior não morreu

**Solução:**

```bash
lsof -ti:3000 | xargs kill -9
sleep 2
npm run dev
```

---

## 📊 STATUS ATUAL

**Dev Server:**

- ✅ Rodando em background
- ✅ Porta: 3000
- ✅ Host: localhost + rede local
- ✅ HMR: Ativo
- ✅ Logs: /tmp/vite-server.log

**Build:**

- ✅ Cache limpo
- ✅ Bundle: 291.26 kB (gzip: 89.51 kB)
- ✅ Tempo: ~2.5s
- ✅ Módulos: 2647

**Correções aplicadas:**

- ✅ Endpoint equipamentos corrigido (sem barra final)
- ✅ Botões Nova Sessão e Editar funcionando
- ✅ Modal de edição implementado
- ✅ Layout limpo (sem fundo vermelho)

---

## 🚀 COMANDOS RÁPIDOS

```bash
# Restart completo
./restart-dev-now.sh

# Ver se está rodando
lsof -ti:3000

# Ver logs
tail -f /tmp/vite-server.log

# Parar server
lsof -ti:3000 | xargs kill -9

# Build manual
npm run build

# Dev manual (foreground)
npm run dev
```

---

## ✅ CHECKLIST DE TESTES

Após restart, teste:

- [ ] Abrir http://localhost:3000/simuladores
- [ ] Ver dashboard com 4 cards de stats
- [ ] Clicar em "+ Nova Sessão" → Modal abre
- [ ] Clicar em ícone de lápis → Modal abre preenchido
- [ ] Clicar em "Gestão" → Ver 3 cards (Simuladores, Manobras, Relatórios)
- [ ] Clicar em "Gerenciar →" do card Simuladores
- [ ] Ver lista de 13 equipamentos

Se TODOS passarem = ✅ Frontend 100% atualizado!

---

**Data:** 01/12/2025 13:15  
**Status:** ✅ Dev server rodando em background  
**URL:** http://localhost:3000/simuladores  
**Logs:** /tmp/vite-server.log
