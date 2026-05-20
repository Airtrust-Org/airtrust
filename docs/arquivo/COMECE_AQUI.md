# ========================================

# COMECE AQUI - DESENVOLVIMENTO LOCAL

# ========================================

## 🎯 Ambiente 100% Local

Este projeto agora roda **totalmente local** durante o desenvolvimento.  
**Não há mais configuração de produção** - quando estiver pronto, você criará uma nova conta Cloudflare.

---

## ⚡ Início Rápido (3 passos)

### Passo 1: Iniciar o Backend (Worker)

Abra um terminal e execute:

```bash
./start-local.sh
```

Aguarde até ver: **`Ready on http://localhost:8787`**

---

### Passo 2: Testar se está funcionando

Em **outro terminal**:

```bash
./test-local.sh
```

Você deve ver:

- ✅ Health OK
- ✅ Version OK
- ✅ Dashboard OK
- ✅ Funcionários OK
- ✅ Compliance OK

---

### Passo 3 (Opcional): Iniciar o Frontend

Em **outro terminal**:

```bash
npm run dev
```

Frontend estará em: **http://localhost:3000**

---

## 📁 Arquivos Importantes

| Arquivo             | Descrição                             |
| ------------------- | ------------------------------------- |
| `wrangler.dev.toml` | Configuração do worker (APENAS local) |
| `.env.local`        | Variáveis de ambiente locais          |
| `start-local.sh`    | Script para iniciar worker            |
| `test-local.sh`     | Script para testar endpoints          |
| `run-testsprite.sh` | Testes automatizados (Python)         |

---

## 🧪 Testes

Execute os testes automatizados:

```bash
./run-testsprite.sh
```

Todos os testes apontam para `http://localhost:8787`

---

## 🗑️ Limpeza

Se tiver problemas, limpe tudo:

```bash
# Matar processos
pkill -9 -f "wrangler|workerd"

# Limpar cache
rm -rf .wrangler node_modules/.cache dist

# Recomeçar
./start-local.sh
```

---

## 🚀 Quando Estiver Pronto para Produção

1. Crie uma nova conta Cloudflare
2. Configure o `wrangler.toml` com novos IDs
3. Execute: `wrangler deploy`

**Por enquanto, trabalhe 100% local!**
