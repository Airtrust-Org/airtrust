# 🔄 Guia de Migração: Dev Container → Host

**Data**: 15/11/2025  
**Objetivo**: Migrar desenvolvimento do AirTrust para rodar 100% no host (fora do container)

---

## 📋 Pré-Requisitos

- ✅ VS Code instalado
- ✅ Projeto AirTrust clonado
- ✅ Acesso ao repositório Git
- ✅ Conta Cloudflare (para wrangler)

---

## 🎯 Passo a Passo

### 1️⃣ Reabrir Projeto no Host

#### No VS Code

1. **Abrir Command Palette**:
   - Mac: `Cmd+Shift+P`
   - Windows/Linux: `Ctrl+Shift+P`

2. **Executar comando**:
   ```
   Dev Containers: Reopen Folder Locally
   ```

3. **Aguardar**: VS Code vai fechar o container e reabrir no host

4. **Verificar**: Abrir terminal integrado (`Ctrl+`` ) e executar:
   ```bash
   pwd
   # Deve mostrar caminho local, ex: /Users/seu-usuario/airtrust v1
   ```

---

### 2️⃣ Instalar Node.js (se necessário)

#### Verificar Versão Atual

```bash
node -v
# Deve retornar: v22.x.x ou superior
```

#### Se Node < 22 ou não instalado:

**Opção A: Instalar via Site Oficial**
- Acessar: https://nodejs.org
- Baixar versão LTS (22.x)
- Instalar e reiniciar terminal

**Opção B: Instalar via nvm (Recomendado)**

```bash
# Instalar nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Reiniciar terminal ou:
source ~/.bashrc  # Linux
source ~/.zshrc   # Mac

# Instalar Node 22
nvm install 22
nvm use 22
nvm alias default 22

# Verificar
node -v
npm -v
```

---

### 3️⃣ Executar Script de Setup Automatizado

```bash
cd ~/caminho/para/airtrust\ v1
./setup-host.sh
```

**O script vai:**
1. ✅ Verificar Node.js 22+
2. ✅ Instalar dependências raiz (`npm install`)
3. ✅ Instalar dependências worker (`cd worker-airtrust && npm install`)
4. ✅ Instalar/verificar Wrangler CLI
5. ✅ Configurar autenticação Cloudflare (OAuth)
6. ✅ Criar `.env.development`

---

### 4️⃣ Configurar Wrangler (se script falhar)

#### Manual:

```bash
# Instalar globalmente
npm install -g wrangler

# Login (abre navegador)
wrangler login
# → Clicar em "Authorize Wrangler"
# → Voltar ao terminal

# Verificar
wrangler whoami
# Output: Account ID, Email, etc.
```

---

### 5️⃣ Rodar Aplicação Localmente

#### Terminal 1: Backend (Worker)

```bash
cd ~/caminho/para/airtrust\ v1/worker-airtrust
npm run dev
```

**Aguardar**:
```
⎔ Starting local server...
[wrangler:inf] Ready on http://localhost:8787
```

**Testar**:
```bash
curl http://localhost:8787/api/health | jq
# Esperado: { "status": "ok", "timestamp": "..." }
```

---

#### Terminal 2: Frontend (Vite)

```bash
cd ~/caminho/para/airtrust\ v1
npm run dev
```

**Aguardar**:
```
VITE v6.x.x  ready in 500 ms

➜  Local:   http://localhost:5173/
```

**Testar**:
- Abrir: http://localhost:5173
- Verificar: DevTools → Network → Chamadas para `localhost:8787`

---

### 6️⃣ Desabilitar Dev Container (Opcional)

#### Opção A: Renomear (Mantém histórico)

```bash
cd ~/caminho/para/airtrust\ v1
mv .devcontainer .devcontainer.disabled
```

#### Opção B: Deletar

```bash
rm -rf .devcontainer
```

**Efeito**: VS Code não vai mais sugerir "Reopen in Container"

---

## ✅ Validação Final

### Checklist de Validação

Execute cada comando e confirme resultado:

```bash
# 1. Node.js OK
node -v
# ✅ Esperado: v22.x.x

# 2. Wrangler OK
wrangler whoami
# ✅ Esperado: Seu email Cloudflare

# 3. Backend rodando
curl http://localhost:8787/api/health
# ✅ Esperado: JSON com "status": "ok"

# 4. Frontend rodando
curl http://localhost:5173
# ✅ Esperado: HTML do index

# 5. Integração OK
curl "http://localhost:8787/api/funcionarios?limit=1" | jq
# ✅ Esperado: JSON com array de funcionários
```

---

## 🎉 Sucesso!

Se todos os checks acima passaram:

- ✅ Projeto migrado para host
- ✅ Backend rodando localmente
- ✅ Frontend rodando localmente
- ✅ Wrangler configurado
- ✅ Pronto para desenvolvimento

---

## 🔧 Troubleshooting

### Erro: "command not found: node"

**Solução**: Instalar Node.js 22+ (ver passo 2)

---

### Erro: "EACCES: permission denied"

**Solução**: Usar nvm ou corrigir permissões npm:
```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

---

### Erro: "wrangler: command not found"

**Solução**: Instalar globalmente:
```bash
npm install -g wrangler
```

Ou usar `npx`:
```bash
cd worker-airtrust
npx wrangler login
```

---

### Erro: "Port 8787 already in use"

**Solução**: Matar processo:
```bash
lsof -ti:8787 | xargs kill -9
```

---

### Erro: "Port 5173 already in use"

**Solução**: Matar processo:
```bash
lsof -ti:5173 | xargs kill -9
```

---

### Erro: "CORS policy blocked"

**Solução**: Verificar `.env.development`:
```bash
cat .env.development
# Deve conter:
# VITE_API_URL=http://localhost:8787
```

Se não existir, criar:
```bash
echo "VITE_API_URL=http://localhost:8787" > .env.development
```

---

### Erro: "Failed to fetch"

**Solução**: Confirmar backend está rodando:
```bash
curl http://localhost:8787/api/health
```

Se não responder, iniciar backend:
```bash
cd worker-airtrust
npm run dev
```

---

## 📚 Próximos Passos

Após migração bem-sucedida:

1. ✅ Ler [`README.md`](README.md) completo
2. ✅ Ver checklist de comandos no README
3. ✅ Fazer commit da mudança `.devcontainer` (se aplicável)
4. ✅ Atualizar documentação do time (se aplicável)
5. ✅ Continuar desenvolvimento normalmente

---

## 🔗 Links Úteis

- [README.md](README.md) - Checklist completo
- [setup-host.sh](setup-host.sh) - Script de setup automático
- [Wrangler Docs](https://developers.cloudflare.com/workers/wrangler/)
- [Node.js Downloads](https://nodejs.org)
- [nvm GitHub](https://github.com/nvm-sh/nvm)

---

**Migração criada por**: GitHub Copilot  
**Data**: 15/11/2025  
**Status**: ✅ Pronto para uso
