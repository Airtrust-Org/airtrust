# ⚡ Quick Start - Rodar em localhost:3000 com Dados de Produção

**Resumo**: 2 minutos para rodar localmente conectado à produção

---

## 🚀 Setup em 3 Linhas

```bash
# 1. Exporte credenciais (uma única vez)
export CLOUDFLARE_ACCOUNT_ID="seu-id"
export CLOUDFLARE_R2_ACCESS_KEY_ID="sua-access-key"
export CLOUDFLARE_R2_SECRET_ACCESS_KEY="sua-secret-key"
export CLOUDFLARE_D1_DB_ID="seu-db-id"
export CLOUDFLARE_AUTH_TOKEN="seu-auth-token"
export PRODUCTION_JWT_SECRET="seu-jwt-secret"

# 2. Execute
npm run dev:prod-data

# 3. Acesse
# http://localhost:3000
```

---

## 📋 Onde Encontrar Credenciais?

| Credencial | Onde Encontrar |
|-----------|----------------|
| **Account ID** | Cloudflare Dashboard → Contas → ID |
| **R2 Access Key** | Cloudflare → R2 → API Tokens → Create |
| **R2 Secret Key** | Gerada junto com Access Key |
| **D1 DB ID** | Cloudflare → D1 → Database → ID |
| **Auth Token** | Cloudflare → API Tokens → Global Token |
| **JWT Secret** | Vejo com DevOps / está em produção |

---

## ✅ Verificação Rápida

### Rodando?
```bash
# Terminal deve mostrar:
# ✅ Starting dev server on http://localhost:3000
```

### Conectado a Produção?
1. Abra http://localhost:3000
2. Faça login
3. Você deve ver os dados de produção
4. ✅ Sucesso!

---

## 🛑 Se Não Funcionar

### Erro: "Missing environment variables"
```bash
# Verifique que exportou todas as 6 variáveis
echo $CLOUDFLARE_ACCOUNT_ID  # Deve mostrar algo, não vazio
```

### Erro: "Connection refused"
```bash
# Porta 3000 está em uso?
lsof -i :3000
# Se sim, use outra porta:
VITE_PORT=3001 npm run dev:prod-data
```

### Erro: "Unauthorized"
```bash
# Verifique credenciais no Cloudflare Dashboard
# Especialmente CLOUDFLARE_AUTH_TOKEN
```

---

## 📁 Arquivos Criados

- `run-local-with-prod-data.sh` - Script de setup
- `.env.local.production` - Configuração (use como template)
- `GUIA-RODAR-LOCALMENTE-COM-PRODUCAO.md` - Guia detalhado

---

## 🎯 Comandos Rápidos

```bash
# Rodar com dados de produção
npm run dev:prod-data

# Rodar frontend apenas (UI local, API remota)
npm run dev:web

# Rodar backend apenas (API local)
npm run dev:worker

# Rodar ambos (frontend local + API local)
npm run dev:all
```

---

## ⚠️ IMPORTANTE

### ✅ Use para:
- Debug com dados reais
- Investigar bugs
- Testes com dados de produção

### ❌ NÃO use para:
- Testes massivos (afeta dados reais!)
- Desenvolvimento de features novas
- Qualquer coisa que modifique produção

---

## 📞 Precisa de Ajuda?

Ver: [GUIA-RODAR-LOCALMENTE-COM-PRODUCAO.md](GUIA-RODAR-LOCALMENTE-COM-PRODUCAO.md)

---

**Pronto?** 🚀 `npm run dev:prod-data`
