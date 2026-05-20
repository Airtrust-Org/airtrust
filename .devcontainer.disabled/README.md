# 🐳 AirTrust Dev Container

## ✅ Ambiente Isolado Configurado

Este Dev Container está configurado para desenvolvimento do AirTrust com:

- ✅ Node.js 22 (compatível com React 19)
- ✅ TypeScript 5.8
- ✅ Wrangler CLI (Cloudflare Workers)
- ✅ Git & GitHub CLI
- ✅ Extensões VS Code pré-instaladas

## 🚀 Como Usar

### 1. Abrir no Container

- Clique em "Reopen in Container" quando solicitado
- OU: `Cmd+Shift+P` → "Dev Containers: Reopen in Container"

### 2. Aguardar Setup

O container vai automaticamente:

1. Instalar dependências (`npm install`)
2. Limpar cache antigo
3. Configurar ambiente de desenvolvimento

### 3. Iniciar Desenvolvimento

**Backend (Wrangler Worker):**

```bash
npm run dev:worker
```

- Porta: `8787`
- URL: `http://localhost:8787`
- Hot reload ativado

**Frontend (Vite):**

```bash
npm run dev
```

- Porta: `3000`
- URL: `http://localhost:3000`

## 🔧 Comandos Úteis

```bash
# Validar ambiente completo
./.devcontainer/test-environment.sh

# Testar todos os endpoints (após iniciar servidor)
./.devcontainer/test-endpoints.sh

# Build produção
npm run build

# Limpar cache
rm -rf .wrangler dist node_modules/.vite

# Verificar tipos TypeScript
npx tsc --noEmit

# Testar endpoints manualmente
curl http://localhost:8787/api/health | jq
curl http://localhost:8787/api/version | jq
```

## 📦 Portas Expostas

| Porta | Serviço          | Comando              |
| ----- | ---------------- | -------------------- |
| 3000  | Vite Frontend    | `npm run dev`        |
| 8787  | Wrangler Worker  | `npm run dev:worker` |
| 5173  | Vite Alternativo | -                    |

## 🐛 Troubleshooting

### Porta 8787 já em uso

```bash
# Dentro do container
lsof -ti:8787 | xargs kill -9
npm run dev:worker
```

### Dependências desatualizadas

```bash
rm -rf node_modules package-lock.json
npm install
```

### Cache corrompido

```bash
rm -rf .wrangler dist node_modules/.vite
npm run dev:worker
```

## ✨ Benefícios do Dev Container

✅ **Isolamento completo** - Sem conflitos com processos externos (PM2, outros projetos)  
✅ **Ambiente consistente** - Mesmas versões para toda equipe  
✅ **Setup automático** - Tudo configurado ao abrir o container  
✅ **Portas limpas** - Sem processos fantasma ocupando portas  
✅ **Git integrado** - Credenciais do host disponíveis

## 🔗 Arquivos Importantes

- `.devcontainer/devcontainer.json` - Configuração do container
- `.devcontainer/setup.sh` - Script de inicialização
- `wrangler.dev.toml` - Configuração Wrangler
- `.dev.vars` - Variáveis de ambiente (criado automaticamente)
