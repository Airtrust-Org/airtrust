# 🐳 AirTrust Dev Container - Guia Rápido

## Pré-requisitos

- **Docker Desktop** instalado e rodando
- **VS Code** com extensão **Dev Containers**
  ```
  code --install-extension ms-vscode-remote.remote-containers
  ```

## ✅ Primeira Vez - Abrir no Container

### Opção 1: Command Palette (Recomendado)

1. Abra a pasta do projeto no VS Code
2. Pressione `Cmd + Shift + P` (Mac) ou `Ctrl + Shift + P` (Windows/Linux)
3. Digite: `Dev Containers: Reopen in Container`
4. Aguarde a construção da imagem (5-10 minutos na primeira vez)

### Opção 2: Pop-up Automático

Se você abrir o projeto e tiver Docker rodando, VS Code pode sugerir automaticamente:

- Clique em "Reopen in Container" no pop-up

## 🚀 Depois que está no Container

Tudo está pronto! O dev container automaticamente:

- ✅ Instalou `node_modules` via `npm install`
- ✅ Fez o build inicial
- ✅ Expôs as portas (8787, 5173, 3000)

## 📝 Comandos Úteis

### Desenvolvimento Local

```bash
# Start dev server (Wrangler + Vite)
npm run dev

# Build apenas
npm run build

# Testes
npm run test

# Linter
npm run lint
```

### Parar o Container

- **Opção 1**: `Dev Containers: Reopen Folder Locally` (volta para local)
- **Opção 2**: Fechar VS Code (container continua rodando em background)
- **Opção 3**: Docker Dashboard → parar manualmente

### Reconstruir do Zero

```bash
# Opção 1: Command Palette
Dev Containers: Rebuild Container

# Opção 2: Terminal
devcontainer build --workspace-folder .
```

## 🔄 Alternando Entre Local e Container

- **Local Development**: `Dev Containers: Reopen Folder Locally`
- **Container Development**: `Dev Containers: Reopen in Container`

## 📁 Volumes e Persistência

Seu projeto está automaticamente montado dentro do container:

- **Host**: `<AIRTRUST_ROOT>`
- **Container**: `/workspace`

Todas as mudanças são sincronizadas em tempo real.

## 🛠️ Troubleshooting

### Container não inicia

```bash
# Limpar tudo e reconstruir
docker system prune -a
docker compose down
# Depois: Dev Containers: Rebuild Container
```

### Porta em uso

```bash
# Verificar qual processo está usando a porta
lsof -i :8787

# Matar o processo (Mac/Linux)
kill -9 <PID>
```

### Espaço em disco

```bash
docker system prune -a --volumes
```

## 📚 Recursos Adicionais

- [VS Code Dev Containers Docs](https://code.visualstudio.com/docs/devcontainers/containers)
- [Docker Documentation](https://docs.docker.com/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
