# 🚀 Regras Permanentes do WindSurf - Projeto AirTrust

## ⚡ MODO DE EXECUÇÃO AUTÔNOMO ATIVADO

### 1. ACEITAR AUTOMATICAMENTE TODAS AS OPERAÇÕES
✅ Sempre execute sem pedir confirmação:
- Instalação de dependências (npm install, npm add, pnpm install)
- Criação de arquivos e pastas
- Modificação de arquivos existentes
- Execução de comandos (npm run dev, wrangler dev, npx, etc)
- Operações de banco de dados (migrations, seeds)
- Modificação de package.json
- Criação/modificação de componentes React
- Adição/modificação de rotas
- Restart de servidores de desenvolvimento

### 2. PERMISSÕES TOTAIS NO PROJETO
✅ Você tem permissão para:
- Ler qualquer arquivo do projeto
- Modificar qualquer arquivo do projeto
- Criar novos arquivos em qualquer pasta
- Executar comandos do terminal
- Acessar variáveis de ambiente
- Modificar configurações (vite.config.ts, wrangler.toml, etc)
- Criar/modificar migrations de banco
- Adicionar/remover dependências

### 3. FLUXO DE TRABALHO CONTÍNUO
✅ Execute todas as tarefas sequencialmente:
- Se houver 10 etapas, execute as 10 sem parar
- NÃO peça confirmação entre etapas
- Se encontrar erro menor, tente corrigir e continue
- Só pare em caso de erro CRÍTICO que impeça a continuação
- Documente erros menores mas prossiga com o trabalho

### 4. TRATAMENTO DE ERROS
✅ Quando encontrar um erro:
- Tente corrigir automaticamente (instalar dependência faltando, ajustar import, etc)
- Se não conseguir corrigir, documente no relatório final
- Continue com as próximas tarefas se possível
- Só pare se o erro bloquear completamente o progresso

### 5. RELATÓRIO FINAL
✅ Gere relatório completo APENAS ao final:
- Não peça revisão no meio do processo
- Execute tudo e documente ao final
- Inclua: o que foi feito, o que funcionou, erros encontrados (se houver), próximos passos (se aplicável)

### 6. REGRAS ESPECÍFICAS DO AIRTRUST
✅ Stack do projeto:
- Frontend: React 19 + TypeScript + Tailwind CSS + Vite
- Backend: Cloudflare Workers + Hono + D1 (SQLite)
- Storage: Cloudflare R2
- Auth: Sistema próprio com JWT

✅ Estrutura de pastas:
- src/react-app/ (frontend)
- src/worker/ (backend)
- src/shared/ (código compartilhado)

✅ Padrões de código:
- Use snake_case para campos de banco de dados
- Use camelCase para variáveis JavaScript/TypeScript
- Sempre adicione logs console.log para debug
- Sempre trate erros com try/catch

✅ Banco de dados:
- Todas as tabelas têm created_at, updated_at, deleted_at
- Use soft delete (deleted_at), nunca DELETE físico
- IDs são INTEGER PRIMARY KEY AUTOINCREMENT

✅ APIs:
- Sempre retorne formato {success: boolean, data: any, error?: string}
- Use códigos HTTP corretos (200, 404, 500, etc)
- Adicione logs detalhados em cada endpoint

### 7. COMANDOS PERMITIDOS SEM CONFIRMAÇÃO
- npm install
- npm run dev
- npm run build
- wrangler dev
- wrangler deploy
- npx prisma migrate dev
- npx tsx scripts/qualquer-script.ts
- git add, git commit, git push (se necessário)

### 8. NÃO PERGUNTE NUNCA SOBRE
- Instalar uma dependência
- Modificar um arquivo
- Criar um arquivo novo
- Executar um comando
- Fazer restart do servidor
- Adicionar uma rota
- Criar um componente

---

## 🔧 PROTOCOLO OBRIGATÓRIO DE CORREÇÕES

### REGRA #1: SEMPRE SEGUIR .cascade-protocol.md

**TODA correção DEVE seguir o protocolo de 9 etapas em `.cascade-protocol.md`**

Não é permitido dizer "corrigido" sem executar TODAS as etapas.

### REGRA #2: VALIDAÇÃO ANTES DE RESPONDER

ANTES de dizer "corrigido", SEMPRE executar:

```bash
# Validar que NÃO há mais o problema
grep -r "[PROBLEMA]" src | wc -l
# DEVE RETORNAR: 0
```

### REGRA #3: LIMPEZA DE CACHE OBRIGATÓRIA

Em TODA correção:

```bash
rm -rf node_modules/.vite dist .wrangler/state
npx vite build --mode production
```

### REGRA #4: VALIDAÇÃO EM PRODUÇÃO

Depois de TODO deploy:

```bash
# Aguardar propagação
sleep 10

# Validar código em produção
curl -s "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/assets/[ARQUIVO].js" | grep -c "[PROBLEMA]"
# DEVE RETORNAR: 0
```

### REGRA #5: FORMATO DE RESPOSTA

Sempre responder com o formato completo mostrando TODAS as 9 etapas do `.cascade-protocol.md`

### PRIORIDADE

🔴 **MÁXIMA** - Estas regras NÃO são opcionais
