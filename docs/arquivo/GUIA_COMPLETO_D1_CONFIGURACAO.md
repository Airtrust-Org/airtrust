# 🚀 Guia Completo: Configurar D1 para o AirTrust

## 📊 Status Atual

| Componente          | Status          | URL                                          |
| ------------------- | --------------- | -------------------------------------------- |
| Frontend (React 19) | ✅ Deployado    | https://production.airtrust.pages.dev        |
| Worker API (Hono)   | ✅ Deployado    | https://airtrust-worker.airtrust.workers.dev |
| Banco D1 (SQLite)   | ❌ Inacessível  | -                                            |
| Dados               | ❌ Não aparecem | -                                            |

**Problema:** O token API atual não tem permissões para acessar D1.

---

## 🔑 Passo 1: Criar Novo API Token com Permissões D1

### 1.1 - Abra o Cloudflare Dashboard

Acesse: **https://dash.cloudflare.com/**

Faça login com:

- Email: `filipe.daumas@icloud.com`
- Senha: (sua senha)

### 1.2 - Vá para API Tokens

1. Clique no **avatar/perfil** no canto superior direito
2. Selecione **"My Profile"** (ou "Perfil")
3. Na barra lateral esquerda, clique em **"API Tokens"**

![Screenshot: API Tokens Location]

### 1.3 - Criar Token Personalizado

1. Clique no botão **"Create Token"** (verde)
2. Selecione **"Custom Token"**
3. Preencha conforme abaixo:

```
┌─────────────────────────────────────────────────────┐
│ Token Name:                                         │
│ ┌──────────────────────────────────────────────┐   │
│ │ airtrust-d1-worker-2025                      │   │
│ └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Permissions:                                        │
│                                                     │
│ ✅ Account - D1 - Edit                             │
│ ✅ Account - Cloudflare Workers Scripts - Edit     │
│ ✅ Account - Cloudflare Workers KV - Write         │
│ ✅ Account - Cloudflare Workers R2 Storage - Edit  │
│ ✅ Account - Cloudflare Workers Tail - Read        │
│                                                     │
│ Account Resources:                                 │
│ ✅ Filipe.daumas@icloud.com's Account             │
│                                                     │
│ Zone Resources:                                    │
│ ✅ All zones                                       │
│                                                     │
│ TTL: 90 days                                       │
└─────────────────────────────────────────────────────┘
```

### 1.4 - Copiar Token

1. Clique em **"Create Token"**
2. Você verá uma tela com o token gerado (exemplo abaixo)
3. **COPIE O TOKEN COMPLETO** (começa com `v1.0-`)

```
Token Value:
v1.0-abcdef123456789xyz...
```

⚠️ **IMPORTANTE:** Salve este token em lugar seguro. Você não conseguirá vê-lo novamente!

---

## 🖥️ Passo 2: Usar o Novo Token para Configurar D1

### 2.1 - Execute o Script Automático

Abra o terminal e execute:

```bash
cd '/workspaces/airtrust v1'

# Cole seu token aqui (substitua SEU_TOKEN_AQUI pelo token copiado)
./setup-d1-with-new-token.sh "v1.0-seu_token_aqui"
```

**Exemplo completo:**

```bash
./setup-d1-with-new-token.sh "v1.0-abc123defg456hij789klmno"
```

### 2.2 - O Script Fará Automaticamente:

1. ✅ Testar autenticação
2. ✅ Listar tabelas do D1
3. ✅ Aplicar migrations
4. ✅ Deploy do Worker
5. ✅ Testar endpoints `/api/health` e `/api/historico`

### 2.3 - Esperado Saída

```
================================
  🚀 Configurando D1 + Worker
================================

1️⃣  Testando autenticação...
✅ Autenticado com sucesso!

2️⃣  Verificando banco D1...
[tabelas listadas]

3️⃣  Aplicando migrations D1...
✅ Migrations aplicadas

4️⃣  Deployando Worker...
✨ Deployment complete!
URL: https://airtrust-worker.airtrust.workers.dev

5️⃣  Testando API...
  Testando /api/health:
  {
    "success": true,
    "status": "healthy",
    ...
  }

  Testando /api/historico:
  {
    "success": true,
    "data": [...],
    ...
  }

================================
  ✅ Configuração concluída!
================================
```

---

## 🌐 Passo 3: Verificar Se Funciona

### 3.1 - Abra o Frontend

Acesse: **https://production.airtrust.pages.dev**

Você deve ver:

- ✅ Página carregada
- ✅ Dados de funcionários, qualificações, etc.
- ✅ Sem erros no console

### 3.2 - Teste Endpoints Manualmente

Se quiser verificar a API:

```bash
# Health check
curl https://airtrust-worker.airtrust.workers.dev/api/health

# Histórico de qualificações
curl "https://airtrust-worker.airtrust.workers.dev/api/historico?limit=10"

# Funcionários
curl "https://airtrust-worker.airtrust.workers.dev/api/funcionarios"
```

---

## 🔐 Passo 4: Guardar o Token (Opcional mas Recomendado)

Se quiser usar o token novamente no futuro:

```bash
# Criar arquivo .env local (NÃO COMMITAR!)
echo 'CLOUDFLARE_API_TOKEN=v1.0-seu_token_aqui' > .env.local

# Depois basta carregar:
source .env.local
npx wrangler deploy
```

---

## ⚠️ Troubleshooting

### Problema: "Authentication error [code: 7403]"

**Solução:** O token não tem permissões D1. Crie um novo token seguindo o Passo 1.

### Problema: "Database is not found"

**Solução:** Execute:

```bash
npx wrangler d1 create airtrust-db
```

### Problema: "No migrations to apply"

**Solução:** Normal! Se não houver migrações pendentes, o script dirá isso. Prossiga.

### Problema: API retorna 404 para /api/historico

**Solução:** A tabela `qualificacoes_historico` pode não existir. Verifique:

```bash
npx wrangler d1 execute airtrust-db --remote --command="SELECT * FROM sqlite_master WHERE name='qualificacoes_historico';"
```

---

## ✅ Checklist Final

- [ ] Token criado com permissões D1
- [ ] Script `setup-d1-with-new-token.sh` executado com sucesso
- [ ] `/api/health` retorna `{"success": true}`
- [ ] `/api/historico` retorna dados
- [ ] Frontend carrega sem erros
- [ ] Console do navegador limpo (sem warnings)

---

## 📞 Próximas Ações

Se tudo correr bem:

1. Comitar as mudanças no Git
2. Documentar a configuração final
3. Sistema estará **100% funcional**

**Precisa de ajuda? Me avise!** 🚀
