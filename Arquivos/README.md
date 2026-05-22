# 🛩️ AirTrust - Sistema de Gestão Aeronáutica

Sistema completo de gestão para operações aéreas com módulos de treinamento, certificações, simuladores e compliance regulatório.

**Status:** ✅ Production Ready | **Version:** 1.0.0 | **Last Updated:** 25/03/2026

> 💡 **Atenção**: Este projeto agora roda 100% no HOST (fora do Dev Container). Veja [Checklist de Setup](#-checklist-airtrust---ambiente-local-host) abaixo.

---

## 🎯 Visão Geral

AirTrust é uma plataforma web moderna desenvolvida para gerenciar operações aeronáuticas com foco em:

- ✅ **Gestão de Pessoas** - Funcionários e colaboradores
- ✅ **Certificações** - Treinamentos, vencimentos e alertas
- ✅ **Simuladores** - Agendamento e controle de sessões
- ✅ **FRMS** - Gestão de riscos em operações
- ✅ **Hospedagem** - Reservas para tripulantes
- ✅ **Compliance** - Matriz de requisitos regulatórios

---

## 🚀 Tecnologias

### **Backend**

- **Runtime:** Cloudflare Workers
- **Framework:** Hono (web framework moderno)
- **Database:** D1 (SQLite serverless)
- **Storage:** R2 (object storage)
- **Database:** D1 SQL direto via binding (sem ORM em runtime)
- **Validação:** Zod (runtime type checking)

### **Frontend**

- **Framework:** React 19 (latest)
- **Language:** TypeScript 5.8
- **Build:** Vite 6 (lightning fast)
- **Styling:** Tailwind CSS (utility-first)
- **State Management:** React Query (TanStack Query)
- **Forms:** React Hook Form + Zod
- **Router:** React Router v7
- **Icons:** Lucide React (beautiful icons)
- **Notifications:** Sonner (elegant toasts)
- **Virtualization:** TanStack React Virtual

### **DevOps**

- **Deploy:** Cloudflare Pages + Workers
- **CI/CD:** Wrangler CLI
- **Monitoring:** Cloudflare Analytics
- **Package Manager:** npm

---

## 📦 Instalação

### **Pré-requisitos**

- Node.js **22+** (obrigatório — o build usa `PATH=/opt/homebrew/opt/node@22/bin`)
- npm 10+
- Wrangler CLI: `npm i -g wrangler` + `wrangler login`
- Conta Cloudflare (para deploy)

### **Setup Local**

```bash
# Clone o repositório
git clone https://github.com/fp-daumas/airtrust-v1.git
cd airtrust-v1

# Instale dependências (frontend + worker)
npm install
cd worker-airtrust && npm install && cd ..

# Configure variáveis de ambiente
cp .env.example .env.local          # frontend
cp worker-airtrust/.env.example worker-airtrust/.dev.vars   # worker

# No frontend, use VITE_DEV_AUTH_EMAIL / VITE_DEV_AUTH_PASSWORD
# (VITE_DEFAULT_LOGIN_* continua aceito por compatibilidade)

# Configure banco de dados local
npm run setup:local

# Inicie o desenvolvimento (worker + frontend juntos)
npm run dev:safe
# ou apenas o frontend:
npm run dev
```

### **Scripts principais**

| Script                     | Descrição                                          |
| -------------------------- | -------------------------------------------------- |
| `npm start`                | Worker local + Frontend (desenvolvimento completo) |
| `npm run dev:safe`         | Alias seguro para subir worker local + frontend    |
| `npm run dev`              | Só frontend (porta 3000)                           |
| `npm run dev:worker:local` | Só worker com DB local                             |
| `npm run dev:worker:safe`  | Alias seguro para o worker local isolado           |
| `npm run build`            | Build de produção                                  |
| `npm run deploy:all`       | Deploy completo (worker + frontend)                |
| `npm run test:all`         | Todos os testes (frontend + worker)                |
| `npm run test:e2e`         | Testes E2E (Playwright)                            |
| `npm run smoke:core:local` | Smoke tests da API local                           |
| `npm run health`           | Health check do worker local                       |
| `npm run logs:tail`        | Tail de logs em produção                           |

O sistema estará disponível em:

- **Frontend:** http://localhost:3000
- **Backend:** http://localhost:8787

---

## 🏗️ Arquitetura

```
airtrust-v1/
├── src/
│   ├── workers/                # Cloudflare Workers (Backend)
│   │   ├── api/               # Endpoints REST
│   │   ├── db/                # Schemas e migrations D1 (SQL)
│   │   └── middleware/        # Auth, CORS, error handling
│   │
│   └── react-app/              # Frontend React
│       ├── components/         # Componentes reutilizáveis
│       │   ├── ui/            # Design System (12 componentes)
│       │   ├── forms/         # Formulários
│       │   └── modals/        # Modais
│       ├── pages/             # Páginas (lazy loaded)
│       ├── hooks/             # Custom hooks
│       └── lib/               # Utilidades
│
├── wrangler.toml              # Config Cloudflare Workers
├── vite.config.ts             # Config Vite
├── tailwind.config.js         # Config Tailwind CSS
└── package.json               # Scripts e dependências
```

---

## 🔑 Módulos Principais

### **1. 👥 Pessoas**

Gestão completa de funcionários e colaboradores.

### **2. 📚 Certificações**

Certificados, treinamentos e vencimentos com alertas.

### **3. 🎮 Simuladores**

Agendamento e controle de sessões de simulador.

### **4. ⚠️ FRMS**

Flight Risk Management System com dashboards.

### **5. 🏨 Hospedagem**

Gestão de acomodações para tripulantes.

---

## ⚡ Performance

| Métrica                | Valor  | Melhoria      |
| ---------------------- | ------ | ------------- |
| **Render (500 itens)** | 45ms   | -94% vs 800ms |
| **Memory Usage**       | 11 MB  | -76% vs 45 MB |
| **API Calls (filtro)** | 1      | -98% vs 50    |
| **Bundle Size**        | 302 KB | 91 KB (gzip)  |
| **Lighthouse Score**   | 95+    | Excelente     |

---

## ✅ Checklist AirTrust - Ambiente Local (Host)

### 📦 Setup Inicial

```bash
# Verificar Node.js
node -v  # mínimo v22.0.0
npm -v   # mínimo v10.0.0

# Instalar dependências raiz
cd ~/path/to/airtrust\ v1
npm install

# Instalar dependências worker
cd worker-airtrust
npm install
cd ..
```

---

### 🔐 Auth Cloudflare

```bash
# Opção 1: Wrangler global
npm install -g wrangler
wrangler login

# Opção 2: Wrangler local
cd worker-airtrust
npx wrangler login

# Verificar conta
wrangler whoami
```

---

### 🚀 Desenvolvimento Local

```bash
# Terminal 1: Backend
cd worker-airtrust
npm run dev
# Worker em: http://localhost:8787

# Terminal 2: Frontend
cd ..
npm run dev
# Frontend em: http://localhost:5173
```

---

### 🗄️ Comandos D1 (Banco de Dados)

```bash
cd worker-airtrust

# Listar databases
wrangler d1 list

# Executar query
wrangler d1 execute airtrust-db --command "SELECT * FROM funcionarios LIMIT 5"

# Executar arquivo SQL
wrangler d1 execute airtrust-db --file=./migrations/0001-initial-schema.sql

# Backup database (produção)
wrangler d1 export 7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae \
  --output=../backups/backup-$(date +%Y%m%d).sql \
  --remote
```

---

### 🚢 Deploy

```bash
# Backend (Worker)
cd worker-airtrust
npm run deploy
# ou
wrangler deploy --env production

# Frontend (Pages)
cd ..
npm run build
wrangler pages deploy dist --project-name=airtrust --branch=production
```

---

### 🧪 Testes

```bash
# Health check local
curl http://localhost:8787/api/health | jq

# Health check produção
curl https://airtrust.wdmg94.workers.dev/api/health | jq

# Listar funcionários local
curl "http://localhost:8787/api/funcionarios?limit=5" | jq

# Ver logs produção
cd worker-airtrust
wrangler tail --env production
```

---

### 🔧 Utilidades

```bash
# Build frontend
npm run build

# Type check
npm run type-check

# Lint
npm run lint

# Limpar cache
rm -rf .wrangler dist node_modules/.vite
npm install

# Ver secrets configurados
cd worker-airtrust
wrangler secret list --env production

# Adicionar secret
wrangler secret put JWT_SECRET --env production
```

---

### 📁 Estrutura do Projeto

```
airtrust v1/
├── worker-airtrust/        # Backend Cloudflare Worker
│   ├── src/
│   │   ├── index.ts       # Entry point
│   │   ├── routes/        # Endpoints API
│   │   └── services/      # Lógica de negócio
│   ├── migrations/        # SQL migrations D1
│   ├── package.json
│   └── wrangler.toml      # Config Cloudflare
├── src/                   # Frontend React
│   ├── react-app/
│   │   ├── pages/         # Páginas React
│   │   ├── components/    # Componentes reutilizáveis
│   │   └── hooks/         # Custom hooks
│   └── ...
├── package.json           # Root (scripts gerais)
├── vite.config.ts         # Config Vite
└── .env.development       # Variáveis de ambiente
```

---

### ⚠️ Troubleshooting

```bash
# Porta 8787 em uso
lsof -ti:8787 | xargs kill -9

# Porta 5173 em uso
lsof -ti:5173 | xargs kill -9

# Wrangler não encontrado
npm install -g wrangler

# Node.js desatualizado
# Instalar Node 22+ via https://nodejs.org ou nvm

# CORS error no frontend
# Verificar .env.development:
# VITE_API_URL=http://localhost:8787

# Build falhou
rm -rf node_modules dist .wrangler
npm install
npm run build

# D1 migration falhou
# Verificar se database está criado:
wrangler d1 list
# Se não existir:
wrangler d1 create airtrust-db
```

---

### 🔗 Links Úteis

- **Cloudflare Dashboard**: https://dash.cloudflare.com
- **Workers & Pages**: https://dash.cloudflare.com/workers-and-pages
- **D1 Database**: https://dash.cloudflare.com/d1
- **Wrangler Docs**: https://developers.cloudflare.com/workers/wrangler/
- **Hono Docs**: https://hono.dev
- **React 19 Docs**: https://react.dev

---

## 🛡️ Segurança

- ✅ Autenticação JWT
- ✅ RBAC (Role-Based Access Control)
- ✅ SQL Injection Protection
- ✅ CORS configurado
- ✅ Rate Limiting
- ✅ Soft Delete em todas tabelas
- ✅ Auditoria completa

---

## 🧪 Qualidade

- ✅ TypeScript (0 erros)
- ✅ ESLint (0 warnings)
- ✅ Acessibilidade WCAG AA
- ✅ Error Boundaries

---

## 🚀 Deploy

### **Deploy Automático**

```bash
npm run deploy
```

### **Deploy Manual**

```bash
npm run build
wrangler deploy
wrangler pages deploy dist
```

---

## 📝 Scripts Disponíveis

```bash
npm run dev              # Frontend + Backend
npm run build            # Build para produção
npm run deploy           # Deploy completo
npm run type-check       # Verifica TypeScript
npm run lint             # ESLint check
npm run format           # Prettier format
```

---

## 📚 Documentação

- **[ROADMAP](./ROADMAP_COMPLETO.md)** - Progresso de todas fases
- **[CHANGELOG](./CHANGELOG.md)** - Histórico de mudanças
- **[PRE_DEPLOYMENT_CHECKLIST](./docs/PRE_DEPLOYMENT_CHECKLIST.md)** - Checklist deploy

---

## 📄 License

MIT License - Veja [LICENSE](./LICENSE) para detalhes.

---

**Desenvolvido com ❤️ para a aviação brasileira** 🇧🇷✈️

- `README_CERTIFICADOS_MVP.md` - Sistema de certificados
- `FLUXO_CERTIFICADOS_COMPLETO.md` - Fluxo detalhado
- `DEPLOY_CHECKLIST.md` - Checklist de deploy
- `COMPRESSAO_IMPLEMENTADA.md` - Sistema de compressão

## 📝 Licença

Proprietary - Todos os direitos reservados
