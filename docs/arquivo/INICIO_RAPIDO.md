# 🎯 INÍCIO RÁPIDO - AIRTRUST DEV CONTAINER

## ✅ PRÉ-VALIDAÇÃO COMPLETA

- ✅ Porta 8787 livre
- ✅ PM2 parado
- ✅ Cache limpo
- ✅ Arquivos verificados
- ✅ Configuração correta

---

## 🚀 EXECUTE AGORA (3 PASSOS):

### PASSO 1: Abrir Dev Container (30 segundos)

1. Pressione `Cmd+Shift+P` (Mac) ou `Ctrl+Shift+P` (Windows)
2. Digite: `Reopen in Container`
3. Pressione Enter
4. **AGUARDE** - Primeira vez leva 2-3 minutos

Você verá no canto inferior esquerdo: `Dev Container: AirTrust Dev Environment`

---

### PASSO 2: Iniciar Backend (10 segundos)

No terminal do container, execute:

```bash
npm run dev:worker
```

**AGUARDE VER:**

```
⎔ Starting local server...
[wrangler:inf] Ready on http://localhost:8787
```

---

### PASSO 3: Testar (5 segundos)

Abra NOVO terminal (`Cmd+Shift+ñ` ou clique em `+`) e execute:

```bash
curl http://localhost:8787/api/health | jq
```

**RESULTADO ESPERADO:**

```json
{
  "success": true,
  "status": "healthy",
  "db": { "connected": true },
  "timestamp": "2025-11-14T...",
  "environment": "development"
}
```

---

## ✅ VALIDAÇÃO COMPLETA

Execute todos os testes:

```bash
# Health check
curl http://localhost:8787/api/health | jq

# Version
curl http://localhost:8787/api/version | jq

# Test route
curl http://localhost:8787/api/test | jq

# Funcionários
curl http://localhost:8787/api/funcionarios?limit=5 | jq

# Empresas
curl http://localhost:8787/api/empresas?limit=5 | jq
```

**TODOS devem retornar HTTP 200 com formato:**

```json
{
  "success": true,
  "data": ...
}
```

---

## 🐛 TROUBLESHOOTING

### "Address already in use"

```bash
lsof -ti:8787 | xargs kill -9
npm run dev:worker
```

### "Module not found"

```bash
npm install
npm run dev:worker
```

### "jq: command not found"

```bash
# Sem jq (apenas ver resposta)
curl http://localhost:8787/api/health

# OU instalar jq
apt-get update && apt-get install -y jq
```

---

## 📊 MONITORAMENTO

### Ver logs em tempo real:

O terminal com `npm run dev:worker` mostra todas as requisições

### Ver processos:

```bash
ps aux | grep node
```

### Ver portas:

```bash
lsof -i:8787
```

---

## 🎉 PRÓXIMOS PASSOS

Após validar que tudo funciona:

1. ✅ Backend funcionando (porta 8787)
2. ✅ Todos endpoints retornando 200
3. ✅ Formato de resposta correto

**Você pode:**

- Iniciar o frontend: `npm run dev` (porta 3000)
- Fazer build: `npm run build`
- Deploy: `npm run deploy`

---

**📝 IMPORTANTE:** Todas as mudanças de código terão hot reload automático dentro do container!

**🆘 AJUDA:** Leia `.devcontainer/README.md` para mais detalhes
