# 🎯 EXECUTAR NO DEV CONTAINER

## Passo 1: Reabrir no Container

Se ainda não estiver no container:

1. `Cmd+Shift+P` (Mac) ou `Ctrl+Shift+P` (Windows/Linux)
2. Digite: "Dev Containers: Reopen in Container"
3. Aguarde o container iniciar (pode levar 2-3 minutos na primeira vez)

## Passo 2: Validar Ambiente

Execute no terminal do container:

```bash
chmod +x .devcontainer/test-environment.sh
./.devcontainer/test-environment.sh
```

Você deve ver várias marcações ✅ verdes.

## Passo 3: Iniciar Backend

```bash
npm run dev:worker
```

**Aguarde ver a mensagem:**

```
⎔ Starting local server...
[wrangler:inf] Ready on http://localhost:8787
```

## Passo 4: Testar Endpoints (em NOVO terminal)

Abra um NOVO terminal no container (`Cmd+Shift+\``) e execute:

```bash
# Testar health
curl http://localhost:8787/api/health | jq

# Testar version
curl http://localhost:8787/api/version | jq

# Testar ping
curl http://localhost:8787/ping | jq

# Testar rota específica
curl http://localhost:8787/api/test | jq

# Testar funcionários
curl http://localhost:8787/api/funcionarios?limit=5 | jq
```

## ✅ Resultado Esperado

Todos os endpoints devem retornar:

- ✅ HTTP 200 OK
- ✅ Formato JSON: `{ "success": true, "data": ... }`
- ✅ Sem 404 errors

## 🐛 Se der erro "Address in use"

```bash
# Matar processo na porta
lsof -ti:8787 | xargs kill -9

# Reiniciar
npm run dev:worker
```

## 📊 Comandos Úteis

```bash
# Ver logs do wrangler
npm run dev:worker

# Build produção
npm run build

# Limpar cache
rm -rf .wrangler dist node_modules/.vite

# Ver processos rodando
ps aux | grep node
```

---

**🎉 Após validar que tudo funciona, podemos fazer deploy!**
