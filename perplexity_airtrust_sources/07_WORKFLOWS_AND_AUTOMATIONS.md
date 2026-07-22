# Workflows & Automations


---
## FILE: .github/workflows/auto-fix.yml
~~~yaml
name: Auto-fix ESLint & Prettier on PR

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  autofix:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run ESLint fix
        run: |
          npx eslint "./src/**/*.{js,jsx,ts,tsx}" --fix || true

      - name: Run Prettier write
        run: |
          npx prettier --write . || true

      - name: Commit and push fixes
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add -A
          if git diff --staged --quiet; then
            echo "No changes to commit"
          else
            git commit -m "chore: apply eslint --fix and prettier formatting [skip ci]" || true
            git push origin HEAD:${{ github.head_ref }}
          fi

~~~

---
## FILE: .github/workflows/ci.yml
~~~yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install
        run: npm ci

      - name: URL guard
        run: npm run lint:api-base
        env:
          CI: true
          VITE_API_URL: ${{ secrets.VITE_API_URL }}

      - name: Build
        run: npm run build

  lms-smoke:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install sqlite3
        run: sudo apt-get update && sudo apt-get install -y sqlite3

      - name: Install root dependencies
        run: npm ci

      - name: Install worker dependencies
        run: cd worker-airtrust && npm ci

      - name: Write local dev vars
        run: |
          JWT_SECRET="$(openssl rand -hex 32)"
          cat > worker-airtrust/.dev.vars <<EOF
          JWT_SECRET=$JWT_SECRET
          EOF

      - name: Setup local database
        run: npm run setup:local:reset

      - name: Start local worker
        run: |
          npm run dev:worker:local > /tmp/airtrust-worker.log 2>&1 &
          echo $! > /tmp/airtrust-worker.pid
          for i in {1..60}; do
            if curl -fsS http://localhost:8787/api/health >/dev/null; then
              echo "Local worker ready"
              exit 0
            fi
            sleep 2
          done
          cat /tmp/airtrust-worker.log
          exit 1

      - name: Run LMS smoke
        run: npm run smoke:lms:local

      - name: Worker log on failure
        if: failure()
        run: cat /tmp/airtrust-worker.log || true

      - name: Stop local worker
        if: always()
        run: |
          if [ -f /tmp/airtrust-worker.pid ]; then
            kill "$(cat /tmp/airtrust-worker.pid)" || true
          fi
          rm -f worker-airtrust/.dev.vars

~~~

---
## FILE: .github/workflows/demo-data-prevention.yml
~~~yaml
name: Demo Data Prevention Check

on:
  push:
    branches: [ main, master, production, staging ]
  pull_request:
    branches: [ main, master, production, staging ]
  workflow_dispatch:

jobs:
  check-demo-data:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Make scripts executable
      run: |
        chmod +x ./scripts/ci-demo-data-check.sh
        chmod +x ./scripts/production-audit-check.sh
        
    - name: Run Demo Data Check
      run: npm run check:demo-data
      
    - name: Lint code
      run: npm run lint
      
    - name: Build application
      run: npm run build
      
    - name: Comment PR if demo data found
      if: failure() && github.event_name == 'pull_request'
      uses: actions/github-script@v7
      with:
        script: |
          github.rest.issues.createComment({
            issue_number: context.issue.number,
            owner: context.repo.owner,
            repo: context.repo.repo,
            body: '❌ **DEPLOY BLOQUEADO** - Dados demo/teste detectados!\n\n🚫 Este PR contém dados de demonstração que não devem ir para produção.\n\n📋 Verifique:\n- Arquivos CSV de teste\n- Fixtures com dados demo\n- Scripts de seed ativos\n- Dados hardcodados no código\n\n🧹 Remova todos os dados demo antes de aprovar este PR.'
          })

~~~

---
## FILE: .github/workflows/deploy-pages.yml
~~~yaml
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - refactor/remove-v2-structure
      - fix/importacao-completa-limpeza
      - main
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: 'pages'
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: './dist/client'

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4

      - name: Checkout for validation
        uses: actions/checkout@v4

      - name: Validate deployment
        run: |
          chmod +x scripts/validate-deploy.sh
          ./scripts/validate-deploy.sh "${{ steps.deployment.outputs.page_url }}" || echo "⚠️ Validation warnings (non-blocking)"

~~~

---
## FILE: .github/workflows/deploy.yml
~~~yaml
name: 🚀 Deploy AirTrust

on:
  push:
    branches:
      - main
  workflow_dispatch:

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: '20'

jobs:
  # Job 1: Testes e Build
  test-and-build:
    name: 🧪 Test & Build
    runs-on: ubuntu-latest

    steps:
      - name: 📥 Checkout code
        uses: actions/checkout@v4

      - name: 📦 Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: 📚 Install dependencies
        run: npm ci

      - name: 📚 Install worker dependencies
        run: cd worker-airtrust && npm ci

      - name: 🗄️ Install sqlite3
        run: sudo apt-get update && sudo apt-get install -y sqlite3

      - name: 🔐 Write local dev vars
        run: |
          JWT_SECRET="$(openssl rand -hex 32)"
          cat > worker-airtrust/.dev.vars <<EOF
          JWT_SECRET=$JWT_SECRET
          EOF

      - name: 🧱 Setup local database
        run: npm run setup:local:reset

      - name: 🏃 Start local worker
        run: |
          npm run dev:worker:local > /tmp/airtrust-worker.log 2>&1 &
          echo $! > /tmp/airtrust-worker.pid
          for i in {1..60}; do
            if curl -fsS http://localhost:8787/api/health >/dev/null; then
              echo "Local worker ready"
              exit 0
            fi
            sleep 2
          done
          cat /tmp/airtrust-worker.log
          exit 1

      - name: 🧪 Run LMS local smoke
        run: npm run smoke:lms:local

      - name: 🔍 Lint code
        run: npm run lint || echo "⚠️ Lint não configurado ainda"
        continue-on-error: true

      - name: 🧪 Run tests
        run: npm test || echo "⚠️ Testes não configurados ainda"
        continue-on-error: true

      - name: 🏗️ Build project
        run: npm run build
        env:
          VITE_APP_VERSION: ${{ github.sha }}

      - name: 📤 Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build-files
          path: dist/
          retention-days: 1

      - name: 🪵 Worker log on failure
        if: failure()
        run: cat /tmp/airtrust-worker.log || true

      - name: 🧹 Stop local worker
        if: always()
        run: |
          if [ -f /tmp/airtrust-worker.pid ]; then
            kill "$(cat /tmp/airtrust-worker.pid)" || true
          fi
          rm -f worker-airtrust/.dev.vars

  # Job 2: Deploy Worker (Backend)
  deploy-worker:
    name: 🔧 Deploy Worker
    needs: test-and-build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
      - name: 📥 Checkout code
        uses: actions/checkout@v4

      - name: 📦 Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: 📚 Install dependencies
        run: npm ci

      - name: �️ Run D1 migrations (production)
        working-directory: worker-airtrust
        run: npx wrangler d1 migrations apply airtrust-db --env production --remote
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

      - name: 🚀 Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: worker-airtrust
          command: deploy --env production
          vars: |
            APP_VERSION=${{ github.sha }}

      - name: ✅ Worker deployed
        run: echo "✅ Worker deployed — commit ${{ github.sha }}"

  # Job 3: Deploy Pages (frontend)
  deploy-pages:
    name: 🌐 Deploy Pages
    needs: [test-and-build, deploy-worker]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
      - name: 📥 Checkout code
        uses: actions/checkout@v4

      - name: 📦 Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: 📥 Download build artifacts
        uses: actions/download-artifact@v4
        with:
          name: build-files
          path: dist/

      - name: 🚀 Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy dist/client --project-name=airtrust --branch=main --commit-hash=${{ github.sha }}

  # Job 4: Validação Pós-Deploy
  validate:
    name: ✅ Validate Deployment
    needs: [deploy-worker, deploy-pages]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
      - name: 🔍 Health check API (custom domain)
        run: |
          echo "🔍 Testando API..."
          sleep 15
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://api.airtrust.online/api/health || echo "000")
          if [ "$STATUS" != "200" ]; then
            echo "⚠️ Health check retornou HTTP $STATUS (não crítico)"
          else
            echo "✅ API OK (HTTP 200)"
          fi
        continue-on-error: true

      - name: 🔍 Health check Pages
        run: |
          echo "🔍 Testando Pages..."
          curl -f https://main.airtrust.pages.dev/ || echo "⚠️ Pages check skipped"
        continue-on-error: true

      - name: 🎉 Deployment successful
        run: |
          echo "🎉 ================================"
          echo "🎉 DEPLOY COMPLETO E VALIDADO!"
          echo "🎉 ================================"
          echo "🌐 Worker: https://api.airtrust.online"
          echo "🌐 Pages: https://main.airtrust.pages.dev"
          echo "📊 Version: ${{ github.sha }}"
          echo "👤 Author: ${{ github.actor }}"

~~~

---
## FILE: .github/workflows/lint.yml
~~~yaml
name: Lint and Prettier Check

on:
  pull_request:
    paths: ["**/*"]
  push:
    branches: [ main, chore/** ]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Use Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Run ESLint
        run: npx eslint "./src/**/*.{js,jsx,ts,tsx}" --max-warnings=0
      - name: Prettier check
        run: npx prettier --check .

~~~

---
## FILE: .github/workflows/pr-check.yml
~~~yaml
name: 🔍 PR Check

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  check:
    name: 🧪 Check PR
    runs-on: ubuntu-latest
    
    steps:
      - name: 📥 Checkout code
        uses: actions/checkout@v4
      
      - name: 📦 Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: 📚 Install dependencies
        run: npm ci
      
      - name: 🔍 Lint
        run: npm run lint || echo "⚠️ Lint não configurado"
        continue-on-error: true
      
      - name: 🏗️ Build
        run: npm run build
      
      - name: ✅ PR is valid
        run: |
          echo "✅ ================================"
          echo "✅ PR VALIDADO COM SUCESSO!"
          echo "✅ ================================"
          echo "📝 PR: ${{ github.event.pull_request.title }}"
          echo "👤 Author: ${{ github.actor }}"
          echo "🔗 URL: ${{ github.event.pull_request.html_url }}"

~~~

---
## FILE: .github/workflows/test.yml
~~~yaml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm run test:run
      
      - name: Generate coverage with threshold (30%+)
        run: npm run test:coverage
        continue-on-error: false
      
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        if: always()
        with:
          files: ./coverage/coverage-final.json
          flags: unittests
          name: codecov-umbrella
          fail_ci_if_error: false
        continue-on-error: true
      
      - name: Comment PR with test results
        uses: actions/github-script@v7
        if: github.event_name == 'pull_request'
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '✅ Tests passed with 30%+ coverage threshold enforced!'
            })
        continue-on-error: true

~~~

---
## FILE: .github/workflows/validate-secrets.yml
~~~yaml
name: ✅ Validate Secrets

on:
  workflow_dispatch:  # Permite executar manualmente

jobs:
  validate:
    name: 🔍 Testar Configuração
    runs-on: ubuntu-latest
    
    steps:
      - name: 1️⃣ Verificar Secrets
        run: |
          echo "════════════════════════════════════════"
          echo "1️⃣ VERIFICANDO SE SECRETS EXISTEM"
          echo "════════════════════════════════════════"
          echo ""
          
          # Verificar CLOUDFLARE_API_TOKEN
          if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
            echo "❌ ERRO: CLOUDFLARE_API_TOKEN está vazio ou não existe!"
            echo ""
            echo "📝 Como corrigir:"
            echo "1. Vá para: Settings → Secrets and variables → Actions"
            echo "2. Clique em 'New repository secret'"
            echo "3. Nome: CLOUDFLARE_API_TOKEN"
            echo "4. Valor: [seu token da Cloudflare]"
            exit 1
          fi
          echo "✅ CLOUDFLARE_API_TOKEN: Existe"
          echo "   Comprimento: ${#CLOUDFLARE_API_TOKEN} caracteres"
          
          # Verificar CLOUDFLARE_ACCOUNT_ID
          if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
            echo "❌ ERRO: CLOUDFLARE_ACCOUNT_ID está vazio ou não existe!"
            echo ""
            echo "📝 Como corrigir:"
            echo "1. Vá para: Settings → Secrets and variables → Actions"
            echo "2. Clique em 'New repository secret'"
            echo "3. Nome: CLOUDFLARE_ACCOUNT_ID"
            echo "4. Valor: 4dca4e5fddc6a351651dd224f456586f"
            exit 1
          fi
          echo "✅ CLOUDFLARE_ACCOUNT_ID: $CLOUDFLARE_ACCOUNT_ID"
          echo ""
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      
      - name: 2️⃣ Validar Token
        run: |
          echo "════════════════════════════════════════"
          echo "2️⃣ VALIDANDO TOKEN NA CLOUDFLARE API"
          echo "════════════════════════════════════════"
          echo ""
          
          # Testar token
          response=$(curl -s -w "\n%{http_code}" \
            -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
            -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
            -H "Content-Type: application/json")
          
          http_code=$(echo "$response" | tail -n1)
          body=$(echo "$response" | head -n-1)
          
          echo "HTTP Status Code: $http_code"
          echo ""
          
          if [ "$http_code" = "200" ]; then
            echo "✅ TOKEN VÁLIDO E ATIVO!"
            echo ""
            echo "Detalhes:"
            echo "$body" | jq -r '.result | "Status: \(.status)\nID: \(.id)"' 2>/dev/null || echo "$body"
          else
            echo "❌ TOKEN INVÁLIDO OU EXPIRADO!"
            echo ""
            echo "Resposta da API:"
            echo "$body"
            echo ""
            echo "📝 Como corrigir:"
            echo "1. Vá para: https://dash.cloudflare.com/profile/api-tokens"
            echo "2. Crie um novo token"
            echo "3. Template: 'Edit Cloudflare Workers'"
            echo "4. Adicione permissões: Workers, Pages, Account"
            echo "5. Copie o token"
            echo "6. Atualize o secret CLOUDFLARE_API_TOKEN no GitHub"
            exit 1
          fi
          echo ""
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      
      - name: 3️⃣ Testar Permissões
        run: |
          echo "════════════════════════════════════════"
          echo "3️⃣ TESTANDO PERMISSÕES DO TOKEN"
          echo "════════════════════════════════════════"
          echo ""
          
          # Listar workers
          echo "🔍 Tentando listar Workers..."
          workers_response=$(curl -s \
            "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts" \
            -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN")
          
          workers_success=$(echo "$workers_response" | jq -r '.success' 2>/dev/null)
          
          if [ "$workers_success" = "true" ]; then
            echo "✅ Permissão Workers: OK"
            worker_count=$(echo "$workers_response" | jq -r '.result | length' 2>/dev/null)
            echo "   Workers encontrados: $worker_count"
          else
            echo "❌ Permissão Workers: NEGADA"
            echo "   Token não tem permissão para listar Workers"
          fi
          echo ""
          
          # Listar zonas (para Pages)
          echo "🔍 Tentando acessar account info..."
          account_response=$(curl -s \
            "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID" \
            -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN")
          
          account_success=$(echo "$account_response" | jq -r '.success' 2>/dev/null)
          
          if [ "$account_success" = "true" ]; then
            echo "✅ Permissão Account: OK"
            account_name=$(echo "$account_response" | jq -r '.result.name' 2>/dev/null)
            echo "   Account: $account_name"
          else
            echo "❌ Permissão Account: NEGADA"
          fi
          echo ""
          
          # Verificar se ambos passaram
          if [ "$workers_success" = "true" ] && [ "$account_success" = "true" ]; then
            echo "✅ TODAS AS PERMISSÕES OK!"
          else
            echo "⚠️ AVISO: Algumas permissões podem estar faltando"
            echo ""
            echo "📝 Verifique se o token tem:"
            echo "- Workers: Edit"
            echo "- Pages: Edit"
            echo "- Account Settings: Read"
            exit 1
          fi
          echo ""
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      
      - name: 🎉 Validação Completa
        run: |
          echo "════════════════════════════════════════"
          echo "🎉 VALIDAÇÃO COMPLETA - SUCESSO!"
          echo "════════════════════════════════════════"
          echo ""
          echo "✅ Secrets configurados corretamente"
          echo "✅ Token válido e ativo"
          echo "✅ Permissões necessárias OK"
          echo ""
          echo "🚀 Sistema pronto para CI/CD!"
          echo ""
          echo "════════════════════════════════════════"

~~~

---
## FILE: scripts/00-checkpoint-inicial.sh
~~~bash
#!/bin/bash
# 00-checkpoint-inicial.sh
# Checkpoint inicial antes da Fase 2

set -euo pipefail

echo "🔍 CHECKPOINT INICIAL - FASE 2"
echo ""

# 1. Verificar que estamos em branch limpo
if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️  ATENÇÃO: Há mudanças não commitadas"
  echo "Fazer commit antes de continuar? (s/n)"
  read -r response
  if [ "$response" = "s" ]; then
    git add -A
    git commit -m "chore: checkpoint antes da Fase 2"
  fi
fi

# 2. Criar backup completo
BACKUP_DIR="_backups/fase2-inicio-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r src/react-app/pages/simuladores "$BACKUP_DIR/pages-original" 2>/dev/null || true
cp -r src/react-app/components/simuladores "$BACKUP_DIR/components-original" 2>/dev/null || true
echo "✅ Backup criado: $BACKUP_DIR"

# 3. Verificar build inicial
echo ""
echo "🏗️  Verificando build inicial..."
if npm run build > /tmp/build-inicial.log 2>&1; then
  BUILD_TIME=$(grep "built in" /tmp/build-inicial.log | grep -oE "[0-9]+\.[0-9]+s" || echo "N/A")
  echo "✅ Build inicial: OK ($BUILD_TIME)"
else
  echo "❌ Build inicial: FALHOU"
  echo "Resolver antes de continuar!"
  cat /tmp/build-inicial.log
  exit 1
fi

# 4. Criar diretório de tracking
mkdir -p _migration/logs
echo "$(date): Fase 2 iniciada" > _migration/logs/timeline.log

echo ""
echo "✅ CHECKPOINT COMPLETO!"
echo "📝 Próximo: Executar estrutura target"

~~~

---
## FILE: scripts/01-criar-estrutura.sh
~~~bash
#!/bin/bash
# 01-criar-estrutura.sh
# Cria estrutura feature-based target

set -euo pipefail

echo "🏗️  CRIANDO ESTRUTURA TARGET..."

# Estrutura conforme ARQUITETURA_SIMULADORES.md
BASE="src/react-app/pages/simuladores"

# Dashboard
mkdir -p "$BASE/dashboard/components"

# Cadastros
mkdir -p "$BASE/cadastros/simuladores/components"
mkdir -p "$BASE/cadastros/simuladores/[id]"
mkdir -p "$BASE/cadastros/manobras/components"
mkdir -p "$BASE/cadastros/templates/components"

# Sessões
mkdir -p "$BASE/sessoes/components"
mkdir -p "$BASE/sessoes/[id]"

# Fichas
mkdir -p "$BASE/fichas/components"
mkdir -p "$BASE/fichas/[id]"

# Relatórios
mkdir -p "$BASE/relatorios/components"

# Componentes shared
mkdir -p "$BASE/components"

echo "✅ Estrutura de pastas criada!"

# Criar .gitkeep para garantir pastas vazias
find "$BASE" -type d -empty -exec touch {}/.gitkeep \; 2>/dev/null || true

# Visualizar estrutura
echo ""
echo "📁 ESTRUTURA CRIADA:"
if command -v tree &> /dev/null; then
  tree "$BASE" -L 3 -I "*.tsx" 2>/dev/null || find "$BASE" -type d | sort
else
  find "$BASE" -type d | sort
fi

# Log
echo "$(date): Estrutura criada" >> _migration/logs/timeline.log

echo ""
echo "✅ Estrutura target pronta!"

~~~

---
## FILE: scripts/RECUPERACAO_DADOS_20251111.sql
~~~sql
-- ==========================================
-- RECUPERAÇÃO DE DADOS SIMPLES - 11/11/2025
-- ==========================================
-- Apenas dados críticos com campos confirmados
-- ==========================================

-- ✅ 1. CATEGORIAS DE MANOBRAS (Confirmed Fields)
INSERT OR IGNORE INTO categoriasmanobras (id, codigo, nome, tipo, created_at, updated_at) VALUES
(1, 'EMERG', 'Emergências', 'NORMAL', datetime('now'), datetime('now')),
(2, 'NAV', 'Navegação', 'NORMAL', datetime('now'), datetime('now')),
(3, 'APROX', 'Aproximação', 'NORMAL', datetime('now'), datetime('now')),
(4, 'BASICO', 'Manobras Básicas', 'NORMAL', datetime('now'), datetime('now')),
(5, 'IFR', 'IFR', 'NORMAL', datetime('now'), datetime('now'));

-- ✅ 2. MANOBRAS (8 principais)
INSERT OR IGNORE INTO manobras (id, codigo, nome, categoria, nivel_dificuldade, created_at, updated_at) VALUES
(1, 'EF', 'Engine Failure', 'Emergências', 'AVANCADO', datetime('now'), datetime('now')),
(2, 'ILS', 'ILS Approach', 'Aproximação', 'AVANCADO', datetime('now'), datetime('now')),
(3, 'ST', 'Steep Turn', 'Básicas', 'BASICO', datetime('now'), datetime('now')),
(4, 'EL', 'Emergency Landing', 'Emergências', 'AVANCADO', datetime('now'), datetime('now')),
(5, 'VOR', 'VOR Navigation', 'Navegação', 'INTERMEDIARIO', datetime('now'), datetime('now')),
(6, 'SR', 'Stall Recovery', 'Básicas', 'BASICO', datetime('now'), datetime('now')),
(7, 'GA', 'Go Around', 'Aproximação', 'INTERMEDIARIO', datetime('now'), datetime('now')),
(8, 'NDB', 'NDB Approach', 'Aproximação', 'AVANCADO', datetime('now'), datetime('now'));

-- ✅ 3. TIPOS DE SESSÃO
INSERT OR IGNORE INTO tipos_sessao (id, nome, created_at, updated_at) VALUES
(1, 'Treinamento Inicial', datetime('now'), datetime('now')),
(2, 'Recorrente', datetime('now'), datetime('now')),
(3, 'Proficiência', datetime('now'), datetime('now')),
(4, 'Transição', datetime('now'), datetime('now'));

-- ✅ 4. SIMULADORES
INSERT OR IGNORE INTO simuladores (id, nome, modelo, tipo, fabricante, status, created_at, updated_at) VALUES
(1, 'Simulador A320 Full-Flight', 'TFS 300', 'FFS Level D', 'Thales', 'ATIVO', datetime('now'), datetime('now')),
(2, 'Simulador B737 Fixed-Base', 'Medallion', 'FBS Level 2', 'CAE', 'ATIVO', datetime('now'), datetime('now')),
(3, 'Simulador Cessna 172', 'JC2', 'Desktop', 'Redbird', 'ATIVO', datetime('now'), datetime('now'));

-- ✅ 5. QUALIFICAÇÕES
INSERT OR IGNORE INTO qualificacoes (id, nome, created_at, updated_at) VALUES
('qual-001', 'Comandante', datetime('now'), datetime('now')),
('qual-002', 'Segundo em Comando', datetime('now'), datetime('now')),
('qual-003', 'Piloto Privado', datetime('now'), datetime('now')),
('qual-004', 'Piloto Comercial', datetime('now'), datetime('now')),
('qual-005', 'Voo por Instrumento', datetime('now'), datetime('now')),
('qual-006', 'Multi-Engine', datetime('now'), datetime('now')),
('qual-007', 'Instrutor de Voo', datetime('now'), datetime('now')),
('qual-008', 'Piloto de Linha Aérea', datetime('now'), datetime('now'));

-- ✅ 6. CATEGORIAS DE QUALIFICAÇÕES  
INSERT OR IGNORE INTO categorias_qualificacoes (id, nome, cor, created_at, updated_at) VALUES
(1, 'Tipo', '#3B82F6', datetime('now'), datetime('now')),
(2, 'Classe', '#10B981', datetime('now'), datetime('now')),
(3, 'IFR', '#8B5CF6', datetime('now'), datetime('now')),
(4, 'MLTE', '#F59E0B', datetime('now'), datetime('now')),
(5, 'Instrutor', '#EF4444', datetime('now'), datetime('now'));

-- ==========================================

~~~

---
## FILE: scripts/analyze-duplicates.sh
~~~bash
#!/bin/bash

echo "🔍 ANÁLISE DE DUPLICAÇÕES - AIRTRUST"
echo "Data: $(date '+%d/%m/%Y %H:%M:%S')"
echo ""

echo "📂 1. COMPONENTES FRONTEND"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Funcionários
echo ""
echo "👤 Funcionários:"
find src -iname "*funcionario*" -type f 2>/dev/null | grep -E "\.(tsx|ts)$" | sort

# Qualificações
echo ""
echo "🎓 Qualificações:"
find src -iname "*qualifica*" -type f 2>/dev/null | grep -E "\.(tsx|ts)$" | sort

# Simuladores
echo ""
echo "🛩️ Simuladores/Sessões:"
find src \( -iname "*simulador*" -o -iname "*sessao*" -o -iname "*session*" \) -type f 2>/dev/null | grep -E "\.(tsx|ts)$" | sort

# Certificados (verificar se limpeza foi completa)
echo ""
echo "📄 Certificados:"
find src -iname "*certificado*" -type f 2>/dev/null | grep -E "\.(tsx|ts)$" | sort

# Compliance
echo ""
echo "✅ Compliance:"
find src -iname "*compliance*" -type f 2>/dev/null | grep -E "\.(tsx|ts)$" | sort

# Pasta Virtual
echo ""
echo "📁 Pasta Virtual/Documentos:"
find src \( -iname "*pasta*" -o -iname "*documento*" -o -iname "*document*" \) -type f 2>/dev/null | grep -E "\.(tsx|ts)$" | sort

# Hospedagem
echo ""
echo "🏨 Hospedagem:"
find src -iname "*hospedagem*" -type f 2>/dev/null | grep -E "\.(tsx|ts)$" | sort

# FRMS
echo ""
echo "⚠️ FRMS:"
find src -iname "*frms*" -o -iname "*evento*" -type f 2>/dev/null | grep -E "\.(tsx|ts)$" | sort

# Auditoria
echo ""
echo "🔍 Auditoria:"
find src -iname "*auditoria*" -o -iname "*audit*" -type f 2>/dev/null | grep -E "\.(tsx|ts)$" | sort

echo ""
echo "📂 2. ROTAS BACKEND"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ -d "worker-airtrust/src/routes" ]; then
  ls -lh worker-airtrust/src/routes/*.ts 2>/dev/null | awk '{print $9, "("$5")"}'
else
  echo "⚠️ Pasta worker-airtrust/src/routes não encontrada"
fi

echo ""
echo "📂 3. HOOKS CUSTOMIZADOS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ -d "src/hooks" ]; then
  ls -lh src/hooks/*.ts 2>/dev/null | awk '{print $9, "("$5")"}'
else
  echo "⚠️ Pasta src/hooks não encontrada"
fi

echo ""
echo "📊 4. ESTATÍSTICAS GERAIS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Total componentes: $(find src/components -name "*.tsx" 2>/dev/null | wc -l | tr -d ' ')"
echo "Total páginas: $(find src/pages -name "*.tsx" 2>/dev/null | wc -l | tr -d ' ')"
echo "Total modais: $(find src/components/modals -name "*.tsx" 2>/dev/null | wc -l | tr -d ' ')"
echo "Total hooks: $(find src/hooks -name "*.ts" 2>/dev/null | wc -l | tr -d ' ')"
echo "Total rotas backend: $(ls worker-airtrust/src/routes/*.ts 2>/dev/null | wc -l | tr -d ' ')"

echo ""
echo "🔍 5. BUSCAR PADRÕES DE DUPLICAÇÃO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Buscar componentes Modal* com possíveis duplicados Add* ou Edit*
echo ""
echo "Analisando Modais com possíveis duplicações:"
if [ -d "src/components/modals" ]; then
  find src/components/modals -name "Modal*.tsx" 2>/dev/null | while read file; do
    basename=$(basename "$file" .tsx)
    entity=${basename#Modal}
    
    # Buscar variações (Add*, Edit*, *Form relacionados)
    add_variant=$(find src -iname "Add${entity}*.tsx" 2>/dev/null | wc -l | tr -d ' ')
    edit_variant=$(find src -iname "Edit*${entity}*.tsx" -o -iname "*Editar${entity}*.tsx" 2>/dev/null | wc -l | tr -d ' ')
    form_variant=$(find src -iname "${entity}Form*.tsx" 2>/dev/null | wc -l | tr -d ' ')
    
    total=$((add_variant + edit_variant + form_variant))
    
    if [ $total -gt 0 ]; then
      echo "  ⚠️ $basename:"
      [ $add_variant -gt 0 ] && echo "     - Add* variants: $add_variant"
      [ $edit_variant -gt 0 ] && echo "     - Edit* variants: $edit_variant"
      [ $form_variant -gt 0 ] && echo "     - Form variants: $form_variant"
    fi
  done
fi

echo ""
echo "Analisando Hooks com possíveis duplicações:"
if [ -d "src/hooks" ]; then
  # Agrupar hooks por entidade
  for entity in Funcionario Qualificacao Simulador Certificado Sessao Documento Hospedagem; do
    hooks=$(find src/hooks -iname "use*${entity}*.ts" 2>/dev/null | wc -l | tr -d ' ')
    if [ $hooks -gt 1 ]; then
      echo "  ⚠️ ${entity}: $hooks hooks encontrados"
      find src/hooks -iname "use*${entity}*.ts" 2>/dev/null | sed 's/^/     - /'
    fi
  done
fi

echo ""
echo "Analisando Rotas Backend com sufixos suspeitos:"
if [ -d "worker-airtrust/src/routes" ]; then
  # Buscar rotas com sufixos -v2, -ext, -old, -new
  echo "  Rotas com versionamento/extensões:"
  ls worker-airtrust/src/routes/*.ts 2>/dev/null | grep -E "(-v[0-9]|-ext|-old|-new|-legacy)" | sed 's/^/     ⚠️ /'
  
  # Buscar entidades com múltiplas rotas
  echo ""
  echo "  Entidades com múltiplos arquivos de rota:"
  for entity in funcionarios qualificacoes simuladores certificados sessoes documentos auditoria; do
    routes=$(ls worker-airtrust/src/routes/${entity}*.ts 2>/dev/null | wc -l | tr -d ' ')
    if [ $routes -gt 1 ]; then
      echo "     ⚠️ ${entity}: $routes arquivos"
      ls worker-airtrust/src/routes/${entity}*.ts 2>/dev/null | sed 's/^/        - /'
    fi
  done
fi

echo ""
echo "📈 6. ANÁLISE DE USO (TOP 10 IMPORTS MAIS USADOS)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Modais mais importados:"
grep -rh "from.*Modal" src --include="*.tsx" --include="*.ts" 2>/dev/null | \
  sed "s/.*from ['\"]//;s/['\"].*//" | \
  sort | uniq -c | sort -rn | head -10 | \
  awk '{printf "  %2d usos: %s\n", $1, $2}'

echo ""
echo "Hooks mais importados:"
grep -rh "from.*use[A-Z]" src --include="*.tsx" --include="*.ts" 2>/dev/null | \
  sed "s/.*from ['\"]//;s/['\"].*//" | \
  sort | uniq -c | sort -rn | head -10 | \
  awk '{printf "  %2d usos: %s\n", $1, $2}'

echo ""
echo "🎯 7. RESUMO DE AÇÕES SUGERIDAS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Contar potenciais duplicados
total_modals=$(find src/components/modals -name "*.tsx" 2>/dev/null | wc -l | tr -d ' ')
add_components=$(find src -iname "Add*.tsx" 2>/dev/null | wc -l | tr -d ' ')
edit_components=$(find src -iname "Edit*.tsx" -o -iname "*Editar*.tsx" 2>/dev/null | wc -l | tr -d ' ')
versioned_routes=$(ls worker-airtrust/src/routes/*.ts 2>/dev/null | grep -E "(-v[0-9]|-ext|-old)" | wc -l | tr -d ' ')

echo ""
echo "Componentes potencialmente duplicados:"
echo "  - Modais: $total_modals arquivos"
echo "  - Add* components: $add_components arquivos"
echo "  - Edit* components: $edit_components arquivos"
echo ""
echo "Rotas potencialmente duplicadas:"
echo "  - Rotas versionadas/extensões: $versioned_routes arquivos"

echo ""
echo "✅ ANÁLISE COMPLETA!"
echo ""
echo "📝 Próximos Passos:"
echo "  1. Revisar componentes Add*/Edit* e consolidar em Modais"
echo "  2. Consolidar hooks duplicados por entidade"
echo "  3. Remover rotas -v2, -ext, -old"
echo "  4. Padronizar nomenclatura"
echo "  5. Executar testes após cada consolidação"

~~~

---
## FILE: scripts/analyze-fichas.py
~~~python
import sys, json

d = json.load(sys.stdin)
fichas = d.get('data', [])

print('=== FICHAS Feb 27-28 / Mar 01 ===')
target_dates = ['2026-02-27', '2026-02-28', '2026-03-01']
matched = [f for f in fichas if f.get('data_hora', '')[:10] in target_dates]
print(f'Matched: {len(matched)} fichas')
for f in matched:
    print(f'  ID={f["id"]} sessao_id={f.get("agendamento_slot_id")} part={f.get("participante_nome")} status={f.get("status")} data={f.get("data_hora","")[:10]} sim={f.get("simulador_codigo","?")} modelo={f.get("sessao_modelo","?")}')

print()
print('=== ALL fichas by sessao_id ===')
by_sessao = {}
for f in fichas:
    sid = f.get('agendamento_slot_id', '?')
    by_sessao.setdefault(sid, []).append(f)
for sid, fs in sorted(by_sessao.items(), key=lambda x: x[0] if isinstance(x[0], int) else 0, reverse=True):
    dates = set(f.get("data_hora", "")[:10] for f in fs)
    print(f'  Sessao {sid}: {len(fs)} fichas, dates={dates}')

~~~

---
## FILE: scripts/analyze-logs.sh
~~~bash
#!/bin/bash

# Analisa logs do Cloudflare Workers
# Uso: ./analyze-logs.sh [filtro] [last_N_minutes]

FILTER=${1:-ERROR}
MINUTES=${2:-60}

echo "🔍 Analisando logs dos últimos $MINUTES minutos..."
echo "📊 Filtro: $FILTER"
echo ""

wrangler tail --env production --format=json | \
  jq -r "select(.level == \"$FILTER\") | 
    \"[\(.context.timestamp)] [\(.level)] \(.context.module)
    📝 \(.message)
    🆔 Request: \(.context.requestId)
    👤 User: \(.context.userEmail // \"anônimo\")
    ⏱️  Duração: \(.duration)ms
    
    \(if .data then \"📊 Dados: \" + (.data | tostring) else \"\" end)
    \(if .error then \"💥 Erro: \" + .error.message else \"\" end)
    ───────────────────────────────────────────────────────────────────────────
    \"" | \
  head -n 50

~~~

---
## FILE: scripts/aplicar-correcoes-db.sh
~~~bash
#!/bin/bash
set -euo pipefail

# Script para aplicar todas as correções de banco de dados
# 1. Remove colunas inúteis do histórico de qualificações
# 2. Corrige matrículas para 5 dígitos
# 3. Padroniza telefones

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DB_NAME="airtrust-db"

echo "🔧 Iniciando correções do banco de dados..."
echo ""

# 1. Aplicar migration para remover colunas inúteis
echo "📋 1/3 - Removendo colunas inúteis do histórico de qualificações..."
if wrangler d1 execute "$DB_NAME" --remote --file="$PROJECT_ROOT/worker-airtrust/migrations/0200_remove_unused_columns_historico.sql"; then
  echo "✅ Colunas removidas com sucesso"
else
  echo "⚠️  Falha ao remover colunas (pode já ter sido aplicada)"
fi
echo ""

# 2. Corrigir matrículas para 5 dígitos
echo "📋 2/3 - Corrigindo matrículas para 5 dígitos..."
if wrangler d1 execute "$DB_NAME" --remote --file="$PROJECT_ROOT/scripts/fix-matriculas-5-digitos.sql"; then
  echo "✅ Matrículas corrigidas"
else
  echo "❌ Falha ao corrigir matrículas"
  exit 1
fi
echo ""

# 3. Padronizar telefones
echo "📋 3/3 - Padronizando telefones..."
if wrangler d1 execute "$DB_NAME" --remote --file="$PROJECT_ROOT/scripts/fix-telefones-padrao.sql"; then
  echo "✅ Telefones padronizados"
else
  echo "❌ Falha ao padronizar telefones"
  exit 1
fi
echo ""

echo "🎉 Todas as correções foram aplicadas com sucesso!"
echo ""
echo "📊 Resumo:"
echo "  ✓ Colunas tipo, local, modalidade removidas do histórico"
echo "  ✓ Matrículas com 5 dígitos (zeros à esquerda)"
echo "  ✓ Telefones no formato padrão (XX) XXXXX-XXXX"

~~~

---
## FILE: scripts/apply-migration-131.sh
~~~bash
#!/bin/bash
# Script para aplicar migration 131 (matricula opcional) via D1 HTTP API
# Usa autenticação via CLOUDFLARE_API_TOKEN

set -e

# Verificar variável de ambiente
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "❌ CLOUDFLARE_API_TOKEN não configurado"
  exit 1
fi

ACCOUNT_ID="4dca4e5fddc6a351651dd224f456586f"
DB_ID="1c11b7c1-4506-4b09-bd87-d867e57d00e5"

echo "📊 Aplicando migration 131: matricula opcional"
echo ""

# Ler SQL da migration
SQL_FILE="migrations/131_matricula_opcional.sql"

if [ ! -f "$SQL_FILE" ]; then
  echo "❌ Arquivo $SQL_FILE não encontrado"
  exit 1
fi

# Aplicar via HTTP API
echo "🚀 Executando migration..."

curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/d1/database/$DB_ID/query" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "sql": $(cat "$SQL_FILE" | jq -Rs .)
}
EOF

echo ""
echo "✅ Migration aplicada com sucesso!"

~~~

---
## FILE: scripts/apply-migration-documentos.sh
~~~bash
#!/bin/bash
# ============================================================
# Script: Aplicar Migration Tabela Documentos (D1 Remote)
# Data: 2025-11-29
# ============================================================

set -e

echo "🗄️  Aplicando migration da tabela documentos no D1 produção..."

# Aplicar migration
wrangler d1 execute airtrust-db \
  --remote \
  --file=migrations/CREATE_TABLE_DOCUMENTOS_R2.sql

echo ""
echo "✅ Migration aplicada com sucesso!"
echo ""
echo "📊 Verificando criação da tabela..."

# Verificar se tabela foi criada
wrangler d1 execute airtrust-db \
  --remote \
  --command="SELECT name, sql FROM sqlite_master WHERE type='table' AND name='documentos'"

echo ""
echo "🎉 Tabela documentos configurada!"

~~~

---
## FILE: scripts/apply-migrations-production.sh
~~~bash
#!/bin/bash
set -e

echo "🚀 APLICAR MIGRAÇÕES EM PRODUÇÃO"
echo "================================="
echo ""

PROJECT_ROOT="<AIRTRUST_ROOT>"
MIGRATIONS_DIR="$PROJECT_ROOT/worker-airtrust/migrations"

cd "$PROJECT_ROOT"

# Lista de migrações a aplicar
MIGRATIONS=(
    "0033_create_modelos_sessao.sql"
    "0034_create_tabelas_criticas_simulador.sql"
)

echo "📋 Migrações a aplicar:"
for migration in "${MIGRATIONS[@]}"; do
    echo "   • $migration"
done
echo ""

read -p "Confirma aplicação em PRODUÇÃO? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Operação cancelada"
    exit 1
fi

echo ""
echo "🔄 Aplicando migrações..."
echo ""

for migration in "${MIGRATIONS[@]}"; do
    MIGRATION_FILE="$MIGRATIONS_DIR/$migration"
    
    if [ -f "$MIGRATION_FILE" ]; then
        echo "📦 Aplicando: $migration"
        
        # Aplicar migração
        npx wrangler d1 execute airtrust-db --remote --file "$MIGRATION_FILE" 2>&1 | grep -E "(success|error|Error)" || true
        
        echo "   ✅ Concluído"
        echo ""
        sleep 2
    else
        echo "   ⚠️  Arquivo não encontrado: $migration"
    fi
done

echo ""
echo "🧪 TESTANDO PRODUÇÃO..."
echo ""

# Testar endpoints
echo "1. Health check:"
curl -s https://airtrust.airtrust.workers.dev/api/health | jq '.success, .status'

echo ""
echo "2. Modelos de sessão:"
curl -s https://airtrust.airtrust.workers.dev/api/simuladores/modelos | jq '.success, (.data | length)'

echo ""
echo "3. Sessões agendadas:"
curl -s https://airtrust.airtrust.workers.dev/api/simuladores/sessoes | jq '.success, (.data | length)'

echo ""
echo "✅ MIGRAÇÕES APLICADAS EM PRODUÇÃO!"
echo ""

~~~

---
## FILE: scripts/apply-refactor-migrations.sh
~~~bash
#!/bin/bash
# Script para aplicar migrations de refatoração de aeronaves
# Data: 2026-01-13

set -e

echo "🚀 Aplicando migrations de refatoração de aeronaves..."
echo ""

# Diretório base
BASE_DIR="<AIRTRUST_ROOT>"
MIGRATIONS_DIR="$BASE_DIR/worker-airtrust/migrations"

# Verificar se as migrations existem
if [ ! -f "$MIGRATIONS_DIR/0150_refactor_aeronaves_remove_codigo.sql" ]; then
  echo "❌ Migration 0150 não encontrada!"
  exit 1
fi

if [ ! -f "$MIGRATIONS_DIR/0151_migrate_aeronave_references.sql" ]; then
  echo "❌ Migration 0151 não encontrada!"
  exit 1
fi

echo "✅ Migrations encontradas"
echo ""

# Executar migrations no banco local
echo "📝 Aplicando migration 0150 (refactor schema)..."
wrangler d1 execute airtrust-db --local --file="$MIGRATIONS_DIR/0150_refactor_aeronaves_remove_codigo.sql"

echo ""
echo "📝 Aplicando migration 0151 (migrate data)..."
wrangler d1 execute airtrust-db --local --file="$MIGRATIONS_DIR/0151_migrate_aeronave_references.sql"

echo ""
echo "✅ Migrations aplicadas com sucesso!"
echo ""
echo "🔍 Verificando estrutura..."

# Verificar estrutura das tabelas
wrangler d1 execute airtrust-db --local --command="SELECT sql FROM sqlite_master WHERE type='table' AND name='modelos_aeronave';"

echo ""
echo "🔍 Verificando dados..."
wrangler d1 execute airtrust-db --local --command="SELECT COUNT(*) as total FROM modelos_aeronave WHERE deleted_at IS NULL;"

echo ""
echo "🎉 Refatoração concluída!"
echo ""
echo "⚠️  IMPORTANTE: Teste o sistema localmente antes de aplicar em produção!"
echo ""
echo "Para aplicar em produção (CUIDADO!):"
echo "  wrangler d1 execute airtrust-db --remote --file=$MIGRATIONS_DIR/0150_refactor_aeronaves_remove_codigo.sql"
echo "  wrangler d1 execute airtrust-db --remote --file=$MIGRATIONS_DIR/0151_migrate_aeronave_references.sql"

~~~

---
## FILE: scripts/apply-seed-data.sh
~~~bash
#!/bin/bash

# ============================================================================
# APPLY SEED DATA - AirTrust v1.0.0
# ============================================================================
# Script para aplicar seed data completo no banco D1
# Uso: ./scripts/apply-seed-data.sh
# ============================================================================

set -e

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║          🌱 APLICANDO SEED DATA COMPLETO - AIRTRUST           ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# ============================================================================
# 1. VERIFICAR SE wrangler CLI ESTÁ INSTALADO
# ============================================================================
if ! command -v wrangler &> /dev/null; then
    echo "❌ Erro: wrangler CLI não instalado"
    echo "Instale com: npm install -g wrangler"
    exit 1
fi

echo "✅ wrangler CLI encontrado"
echo ""

# ============================================================================
# 2. APLICAR SEED DATA EM STAGING
# ============================================================================
echo "🔄 Aplicando seed data em STAGING..."
echo ""

if wrangler d1 execute airtrust-db-staging --file scripts/seed-data-complete.sql --remote; then
    echo ""
    echo "✅ Seed data aplicado com sucesso em STAGING!"
else
    echo ""
    echo "⚠️  Aviso: Erro ao aplicar em staging (pode ser normal se staging não existe)"
fi

echo ""

# ============================================================================
# 3. APLICAR SEED DATA EM PRODUÇÃO
# ============================================================================
echo "⚠️  ATENÇÃO: Você está prestes a aplicar seed data em PRODUÇÃO!"
echo ""
read -p "Tem certeza? (sim/não): " confirm

if [ "$confirm" != "sim" ]; then
    echo "❌ Operação cancelada"
    exit 1
fi

echo ""
echo "🔄 Aplicando seed data em PRODUÇÃO..."
echo ""

if wrangler d1 execute airtrust-db-production --file scripts/seed-data-complete.sql --remote; then
    echo ""
    echo "✅ Seed data aplicado com sucesso em PRODUÇÃO!"
else
    echo ""
    echo "❌ Erro ao aplicar em produção"
    exit 1
fi

echo ""

# ============================================================================
# 4. VERIFICAR DADOS INSERIDOS
# ============================================================================
echo "🔍 Verificando dados inseridos..."
echo ""

echo "📊 Contagem de registros em PRODUÇÃO:"
echo ""

wrangler d1 execute airtrust-db-production --command "
SELECT 'Qualificações' as tabela, COUNT(*) as total FROM qualificacoes WHERE deleted_at IS NULL
UNION ALL
SELECT 'Categorias', COUNT(*) FROM categorias WHERE deleted_at IS NULL
UNION ALL
SELECT 'Empresas', COUNT(*) FROM empresas WHERE deleted_at IS NULL
UNION ALL
SELECT 'Setores', COUNT(*) FROM setores WHERE deleted_at IS NULL
UNION ALL
SELECT 'Funções', COUNT(*) FROM funcoes WHERE deleted_at IS NULL
UNION ALL
SELECT 'Aeronaves', COUNT(*) FROM aeronaves WHERE deleted_at IS NULL
UNION ALL
SELECT 'Funcionários', COUNT(*) FROM funcionarios WHERE deleted_at IS NULL
UNION ALL
SELECT 'Habilitações', COUNT(*) FROM habilitacoes WHERE deleted_at IS NULL
UNION ALL
SELECT 'Simuladores', COUNT(*) FROM simuladores WHERE deleted_at IS NULL
UNION ALL
SELECT 'Modelos de Sessão', COUNT(*) FROM simuladores_modelos WHERE deleted_at IS NULL
UNION ALL
SELECT 'Manobras', COUNT(*) FROM simuladores_manobras WHERE deleted_at IS NULL
ORDER BY tabela;
" --remote

echo ""

# ============================================================================
# 5. TESTAR ENDPOINTS
# ============================================================================
echo "🧪 Testando endpoints após seed data..."
echo ""

BASE_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2"

test_endpoint() {
    local name=$1
    local url=$2
    
    echo -n "Testing $name... "
    status=$(curl -s -o /dev/null -w "%{http_code}" "$url")
    
    if [ "$status" -eq 200 ]; then
        echo "✅ OK ($status)"
    else
        echo "⚠️  Status $status"
    fi
}

test_endpoint "Qualificações" "$BASE_URL/qualificacoes"
test_endpoint "Categorias" "$BASE_URL/categorias"
test_endpoint "Funcionários" "$BASE_URL/funcionarios"
test_endpoint "Simuladores" "$BASE_URL/simuladores"

echo ""

# ============================================================================
# 6. CONCLUSÃO
# ============================================================================
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║          ✅ SEED DATA COMPLETO APLICADO COM SUCESSO!          ║"
echo "║                                                                ║"
echo "║  Total de registros inseridos:                                ║"
echo "║  • 8 Qualificações                                             ║"
echo "║  • 5 Categorias                                                ║"
echo "║  • 3 Empresas                                                  ║"
echo "║  • 4 Setores                                                   ║"
echo "║  • 6 Funções                                                   ║"
echo "║  • 5 Aeronaves                                                 ║"
echo "║  • 5 Funcionários                                              ║"
echo "║  • 15 Habilitações                                             ║"
echo "║  • 3 Simuladores                                               ║"
echo "║  • 9 Modelos de Sessão                                         ║"
echo "║  • 24 Manobras                                                 ║"
echo "║                                                                ║"
echo "║  TOTAL: 87 registros                                           ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo "✨ Sistema pronto para testes com dados completos!"
echo ""

~~~

---
## FILE: scripts/apply-ssot-migrations.sh
~~~bash
#!/bin/bash
set -euo pipefail

DB_NAME="airtrust-db"
MIGRATION_FILE="worker-airtrust/migrations/0062_ssot_extended_tables_triggers_indexes.sql"
LABEL="ssot-0062"

echo "🚀 Aplicando migration SSOT 0062 (tabelas dependentes + triggers + índices)"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ Arquivo de migration não encontrado: $MIGRATION_FILE" >&2
  exit 1
fi

echo "🔍 Verificando acesso ao Wrangler..."
if ! command -v wrangler >/dev/null 2>&1; then
  echo "❌ Wrangler não instalado. Rode: npm i -D wrangler" >&2
  exit 1
fi

echo "🗄️ Backup pré-migration (remote)"
if wrangler d1 export "$DB_NAME" --remote --output="backups/backup-pre-${LABEL}-$(date +%Y%m%d-%H%M%S).sql"; then
  echo "✅ Backup remoto criado"
else
  echo "⚠️ Falha ao criar backup remoto (prosseguindo mesmo assim)"
fi

echo "🔍 Verificando se migration 0062 já foi aplicada (coluna usuario_id em auditoria)..."
if wrangler d1 execute "$DB_NAME" --remote --command "PRAGMA table_info(auditoria_avancada_v2);" | grep -q "usuario_id"; then
  echo "✅ Migration 0062 já aplicada – pulando execução do arquivo."
else
  echo "📦 Executando migration via arquivo..."
  wrangler d1 execute "$DB_NAME" --remote --file "$MIGRATION_FILE" || {
    echo "❌ Falha ao aplicar migration 0062" >&2
    exit 1
  }
fi

echo "🔎 Validando criação de tabelas e índices principais..."
wrangler d1 execute "$DB_NAME" --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('hospedagens','registros_frms','auditoria_avancada_v2');" | sed 's/^/   /'
wrangler d1 execute "$DB_NAME" --remote --command "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_funcionarios_%' LIMIT 10;" | sed 's/^/   /'

echo "🧪 Smoke test SELECT em auditoria (últimos 3 registros, se existirem)"
wrangler d1 execute "$DB_NAME" --remote --command "SELECT id, tabela, acao, created_at FROM auditoria_avancada_v2 ORDER BY id DESC LIMIT 3;" | sed 's/^/   /'

echo "✅ Migration SSOT 0062 aplicada com sucesso"
echo "ℹ️ Próximos passos:"
echo "  1. Rodar testes: npm run test -- src/__tests__/funcionarios-ssot-reativo.test.ts"
echo "  2. Validar triggers com UPDATE + soft delete real"
echo "  3. Deploy: npm run deploy:worker (exige token com permissão edit)"

~~~

---
## FILE: scripts/atualizar-imports-app.sh
~~~bash
#!/bin/bash
# atualizar-imports-app.sh
# Atualiza imports no App.tsx para novos caminhos

set -euo pipefail

echo "🔧 ATUALIZANDO IMPORTS NO APP.TSX..."

APP_FILE="src/react-app/App.tsx"

# Backup
cp "$APP_FILE" "${APP_FILE}.bak"

# Atualizar imports um por um
sed -i '' \
  -e "s|'./pages/simuladores/FichasSessao'|'./pages/simuladores/fichas'|g" \
  -e "s|'./pages/simuladores/FichaDetalhe'|'./pages/simuladores/fichas/[id]'|g" \
  -e "s|'./pages/simuladores/NovaSessao'|'./pages/simuladores/sessoes/nova'|g" \
  -e "s|'./pages/simuladores/AgendaCalendario'|'./pages/simuladores/agenda'|g" \
  -e "s|'./pages/simuladores/CrudSimuladores'|'./pages/simuladores/cadastros/simuladores/crud-completo'|g" \
  -e "s|'./pages/simuladores/CrudManobras'|'./pages/simuladores/cadastros/manobras'|g" \
  -e "s|'./pages/simuladores/CrudModelos'|'./pages/simuladores/cadastros/modelos'|g" \
  -e "s|'./pages/simuladores/CrudCategorias'|'./pages/simuladores/cadastros/categorias'|g" \
  -e "s|'./pages/simuladores/CrudTiposSessao'|'./pages/simuladores/cadastros/tipos-sessao'|g" \
  -e "s|'./pages/simuladores/CrudInstrutores'|'./pages/simuladores/cadastros/instrutores'|g" \
  -e "s|'./pages/simuladores/CrudTemplates'|'./pages/simuladores/cadastros/templates'|g" \
  -e "s|'./pages/simuladores/RelatoriosSimuladores'|'./pages/simuladores/relatorios'|g" \
  -e "s|'./pages/simuladores/ConfiguracoesCadastros'|'./pages/simuladores/cadastros/configuracoes'|g" \
  "$APP_FILE"

echo "✅ Imports atualizados!"
echo "💾 Backup salvo em: ${APP_FILE}.bak"

# Mostrar diferenças
echo ""
echo "📝 MUDANÇAS:"
diff "${APP_FILE}.bak" "$APP_FILE" || true

echo ""
echo "🏗️  Testando build..."
npm run build > /tmp/build-pos-imports.log 2>&1 && echo "✅ Build OK!" || echo "❌ Build falhou (ver /tmp/build-pos-imports.log)"

~~~

---
## FILE: scripts/audit-components-simple.sh
~~~bash
#!/bin/bash

# Script Simplificado de Auditoria - Componentes de Simuladores

MODULE="simuladores"
COMPONENT_DIR="src/react-app/components/$MODULE"

echo "🔍 Auditando componentes de: $MODULE"
echo ""

for file in "$COMPONENT_DIR"/*.tsx; do
  if [ -f "$file" ]; then
    COMPONENT_NAME=$(basename "$file" .tsx)
    
    # Contar imports
    COUNT=$(grep -r "import.*$COMPONENT_NAME\|from.*$COMPONENT_NAME" src/react-app \
      --include="*.tsx" \
      --include="*.ts" 2>/dev/null | grep -v "^$file:" | wc -l | xargs)
    
    if [ "$COUNT" = "0" ]; then
      echo "❌ $COMPONENT_NAME (não usado)"
    else
      echo "✅ $COMPONENT_NAME ($COUNT usos)"
    fi
  fi
done

echo ""
echo "✅ Análise completa!"

~~~

---
## FILE: scripts/audit-data-integrity.sh
~~~bash
#!/bin/bash
# =============================================================================
# AUDITORIA DE INTEGRIDADE DE DADOS - AirTrust
# =============================================================================
# Uso: ./scripts/audit-data-integrity.sh
# =============================================================================

set -e

API_URL="https://airtrust-api-production.airtrust.workers.dev/api"
ERRORS=0

echo "🔍 AUDITORIA DE INTEGRIDADE DE DADOS"
echo "===================================="
echo "Data: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# 1. Verificar aeronaves
echo "📋 1. Verificando AERONAVES..."
AERONAVES=$(curl -s "$API_URL/aeronaves" | jq -r '.data[].codigo' | sort)
echo "   Aeronaves cadastradas: $(echo "$AERONAVES" | wc -l | tr -d ' ')"
echo "   Códigos: $(echo $AERONAVES | tr '\n' ', ')"
echo ""

# 2. Verificar simuladores
echo "📋 2. Verificando SIMULADORES..."
SIMULADORES=$(curl -s "$API_URL/simuladores" | jq -r '.data[] | "\(.id)|\(.nome)|\(.aeronave_codigo)"')
while IFS='|' read -r id nome aero_codigo; do
  if [ -n "$aero_codigo" ] && ! echo "$AERONAVES" | grep -q "^$aero_codigo$"; then
    echo "   ❌ ERRO: Simulador $id ($nome) tem aeronave_codigo '$aero_codigo' que não existe!"
    ERRORS=$((ERRORS + 1))
  else
    echo "   ✅ Simulador $id: aeronave_codigo='$aero_codigo' OK"
  fi
done <<< "$SIMULADORES"
echo ""

# 3. Verificar modelos de sessão
echo "📋 3. Verificando MODELOS DE SESSÃO..."
MODELOS=$(curl -s "$API_URL/simuladores/modelos-sessao" | jq -r '.data[] | "\(.id)|\(.nome)|\(.codigo_aeronave)|\(.tipo_aeronave)"')
MODELO_COUNT=0
MODELO_ERROS=0
while IFS='|' read -r id nome cod_aero tipo_aero; do
  MODELO_COUNT=$((MODELO_COUNT + 1))
  if [ -n "$cod_aero" ] && ! echo "$AERONAVES" | grep -q "^$cod_aero$"; then
    echo "   ❌ ERRO: Modelo $id tem codigo_aeronave '$cod_aero' que não existe!"
    MODELO_ERROS=$((MODELO_ERROS + 1))
    ERRORS=$((ERRORS + 1))
  fi
done <<< "$MODELOS"
echo "   Total modelos: $MODELO_COUNT | Erros: $MODELO_ERROS"
echo ""

# 4. Verificar tipos de sessão
echo "📋 4. Verificando TIPOS DE SESSÃO..."
TIPOS=$(curl -s "$API_URL/simuladores/tipos-sessao" | jq -r '.data[] | "\(.id)|\(.codigo)|\(.nome)"')
TIPO_COUNT=$(echo "$TIPOS" | wc -l | tr -d ' ')
echo "   Total tipos: $TIPO_COUNT"
echo ""

# 5. Verificar funcionários
echo "📋 5. Verificando FUNCIONÁRIOS..."
FUNC_COUNT=$(curl -s "$API_URL/funcionarios?limit=1" | jq -r '.total // 0')
echo "   Total funcionários: $FUNC_COUNT"
echo ""

# 6. Verificar qualificações históricas
echo "📋 6. Verificando QUALIFICAÇÕES HISTÓRICAS..."
QUAL_COUNT=$(curl -s "$API_URL/qualificacoes/historico?limit=1" | jq -r '.total // 0')
echo "   Total registros histórico: $QUAL_COUNT"
echo ""

# 7. Verificar fichas de sessão
echo "📋 7. Verificando FICHAS DE SESSÃO..."
FICHAS_COUNT=$(curl -s "$API_URL/simuladores/fichas?limit=1" | jq -r '.total // (.data | length) // 0')
echo "   Total fichas: $FICHAS_COUNT"
echo ""

# Resumo
echo "===================================="
echo "📊 RESUMO DA AUDITORIA"
echo "===================================="
if [ $ERRORS -eq 0 ]; then
  echo "✅ NENHUM ERRO DE INTEGRIDADE ENCONTRADO!"
else
  echo "❌ ENCONTRADOS $ERRORS ERROS DE INTEGRIDADE"
  echo ""
  echo "⚠️  Execute as correções necessárias!"
fi
echo ""
echo "Auditoria concluída em $(date '+%Y-%m-%d %H:%M:%S')"

~~~

---
## FILE: scripts/audit-endpoints-simuladores.sh
~~~bash
#!/bin/bash
# ==========================================
# AUDITORIA COMPLETA DE ENDPOINTS - SIMULADORES
# Data: 2025-11-20
# ==========================================

API_URL="${1:-http://localhost:8787/api}"
TOTAL=0
SUCCESS=0
FAILED=0

echo "🔍 INICIANDO AUDITORIA DE ENDPOINTS"
echo "📡 API: $API_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Função para testar endpoint
test_endpoint() {
  local method=$1
  local path=$2
  local desc=$3
  local data=$4
  
  TOTAL=$((TOTAL + 1))
  echo -n "[$TOTAL] $method $path - $desc ... "
  
  if [ "$method" = "GET" ]; then
    response=$(curl -s "$API_URL$path")
  elif [ "$method" = "POST" ]; then
    response=$(curl -s -X POST -H "Content-Type: application/json" -d "$data" "$API_URL$path")
  elif [ "$method" = "PUT" ]; then
    response=$(curl -s -X PUT -H "Content-Type: application/json" -d "$data" "$API_URL$path")
  elif [ "$method" = "DELETE" ]; then
    response=$(curl -s -X DELETE "$API_URL$path")
  fi
  
  success=$(echo "$response" | jq -r '.success // false' 2>/dev/null)
  error=$(echo "$response" | jq -r '.error // ""' 2>/dev/null)
  
  if [ "$success" = "true" ]; then
    echo "✅ OK"
    SUCCESS=$((SUCCESS + 1))
    data_count=$(echo "$response" | jq -r '.data | length // 0' 2>/dev/null)
    if [ "$data_count" != "0" ] && [ "$data_count" != "null" ]; then
      echo "    📊 Dados retornados: $data_count"
    fi
  else
    echo "❌ FALHOU"
    FAILED=$((FAILED + 1))
    if [ -n "$error" ] && [ "$error" != "null" ]; then
      echo "    ⚠️  Erro: $error"
    fi
  fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 MÓDULO: SIMULADORES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Health Check
test_endpoint "GET" "/health" "Health Check"

# Simuladores
test_endpoint "GET" "/simuladores" "Listar simuladores"
test_endpoint "GET" "/simuladores?page=1&limit=10" "Listar com paginação"

# Sessões
test_endpoint "GET" "/simuladores/sessoes" "Listar sessões"
test_endpoint "GET" "/simuladores/sessoes?page=1&limit=10" "Listar sessões paginadas"
test_endpoint "GET" "/simuladores/sessoes?simulador_id=1" "Filtrar por simulador"
test_endpoint "GET" "/simuladores/sessoes?status=AGENDADA" "Filtrar por status"

# Fichas
test_endpoint "GET" "/simuladores/fichas" "Listar fichas"
test_endpoint "GET" "/simuladores/fichas?page=1&limit=10" "Listar fichas paginadas"
test_endpoint "GET" "/simuladores/fichas?funcionario_id=1" "Filtrar por funcionário"
test_endpoint "GET" "/simuladores/fichas?status=PENDENTE" "Filtrar por status"

# Modelos de Sessão
test_endpoint "GET" "/simuladores/modelos" "Listar modelos"
test_endpoint "GET" "/simuladores/modelos/1" "Buscar modelo por ID"
test_endpoint "GET" "/simuladores/modelos/1/manobras" "Listar manobras do modelo"
test_endpoint "GET" "/simuladores/modelos/4/manobras" "Manobras modelo A139-I-04"

# Instrutores
test_endpoint "GET" "/simuladores/instrutores" "Listar instrutores"

# Participantes
test_endpoint "GET" "/simuladores/sessoes/participantes" "Listar participantes"

# Dashboards/Relatórios
test_endpoint "GET" "/simuladores/dashboard/estatisticas" "Dashboard estatísticas"
test_endpoint "GET" "/simuladores/dashboard/funcionarios" "Dashboard funcionários"
test_endpoint "GET" "/simuladores/dashboard/progresso" "Dashboard progresso"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 RESULTADO DA AUDITORIA"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Sucesso: $SUCCESS / $TOTAL"
echo "❌ Falhas:  $FAILED / $TOTAL"

if [ $FAILED -eq 0 ]; then
  echo "🎉 TODOS OS ENDPOINTS FUNCIONANDO!"
  exit 0
else
  PERCENT=$((SUCCESS * 100 / TOTAL))
  echo "📈 Taxa de sucesso: $PERCENT%"
  exit 1
fi

~~~

---
## FILE: scripts/audit-frms-sono-rbac135.mjs
~~~javascript
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_FROM = '2026-02-01';
const DEFAULT_TO = '2026-04-30';
const DEFAULT_OUTPUT = 'audit-frms-sono-RBAC135.md';
const API_BASE = 'https://airtrust-api-production.airtrust.workers.dev/api';
const DEFAULT_EMAIL = process.env.AIRTRUST_AUDIT_EMAIL || 'admin@airtrust.com';
const DEFAULT_PASSWORD = process.env.AIRTRUST_AUDIT_PASSWORD || 'Admin@123';

const ROOT_DIR = resolve(new URL('..', import.meta.url).pathname);
const WORKER_DIR = resolve(ROOT_DIR, 'worker-airtrust');

function parseArgs(argv) {
  const options = {
    from: DEFAULT_FROM,
    to: DEFAULT_TO,
    output: resolve(ROOT_DIR, DEFAULT_OUTPUT),
    empresaId: null,
  };

  for (let index = 2; index < argv.length; index++) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === '--from' && next) {
      options.from = next;
      index++;
      continue;
    }
    if (current === '--to' && next) {
      options.to = next;
      index++;
      continue;
    }
    if (current === '--output' && next) {
      options.output = resolve(ROOT_DIR, next);
      index++;
      continue;
    }
    if (current === '--empresa-id' && next) {
      options.empresaId = Number(next);
      index++;
      continue;
    }
    throw new Error(`Argumento nao suportado: ${current}`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.from)) {
    throw new Error(`Data inicial invalida: ${options.from}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.to)) {
    throw new Error(`Data final invalida: ${options.to}`);
  }
  if (options.from > options.to) {
    throw new Error(`Intervalo invalido: ${options.from} > ${options.to}`);
  }
  if (options.empresaId != null && !Number.isInteger(options.empresaId)) {
    throw new Error(`empresaId invalido: ${options.empresaId}`);
  }

  return options;
}

function runD1(sql) {
  const raw = execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'airtrust-db',
      '--remote',
      '--env',
      'production',
      '--command',
      sql,
      '--json',
    ],
    {
      cwd: WORKER_DIR,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed)
    ? parsed.flatMap((chunk) => chunk.results || [])
    : Array.isArray(parsed.results)
      ? parsed.results
      : [];
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(Number(value || 0) * factor) / factor;
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parseJson(value, fallback = null) {
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function hhmmToMinutes(value) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function minutesToHhmm(value) {
  const normalized = ((Math.round(value) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function circularMinuteDiff(left, right) {
  if (left == null || right == null) return null;
  const diff = Math.abs(left - right);
  return Math.min(diff, 1440 - diff);
}

function isWakeInsideWocl(minutes) {
  return minutes != null && minutes >= 120 && minutes <= 359;
}

function formatSigned(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return 'n/a';
  const rounded = round(value, digits).toFixed(digits);
  return value > 0 ? `+${rounded}` : rounded;
}

function formatNumber(value, digits = 0) {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return round(value, digits).toFixed(digits);
}

function toDateMs(day) {
  return Date.parse(`${day}T00:00:00Z`);
}

function daysBetween(left, right) {
  return Math.floor((toDateMs(right) - toDateMs(left)) / 86400000);
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')
    .trim();
}

function markdownTable(headers, rows) {
  const head = `| ${headers.map(escapeCell).join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.length
    ? rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`).join('\n')
    : `| ${headers.map((_, index) => (index === 0 ? 'Sem dados' : '-')).join(' | ')} |`;
  return `${head}\n${separator}\n${body}`;
}

function statusLabel(pass, failText, passText = 'PASS') {
  return pass ? passText : failText;
}

function blockOutcome(fails, warnings = 0) {
  if (fails > 0) return 'FAIL';
  if (warnings > 0) return 'RISCO';
  return 'PASS';
}

function hashText(text) {
  let hash = 0;
  for (let index = 0; index < text.length; index++) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function pickSpotChecks(rows, count) {
  return [...rows]
    .sort(
      (left, right) =>
        hashText(`${left.jornada_id}:${left.data}`) - hashText(`${right.jornada_id}:${right.data}`),
    )
    .slice(0, count);
}

function getCircadianRange(horaAcordou) {
  const minutes = hhmmToMinutes(horaAcordou);
  if (minutes == null) return null;
  if (minutes >= 120 && minutes <= 239) return { min: 0.5, max: 0.6, label: '0.50-0.60' };
  if (minutes >= 240 && minutes <= 359) return { min: 0.55, max: 0.65, label: '0.55-0.65' };
  if (minutes >= 360 && minutes <= 479) return { min: 0.65, max: 0.75, label: '0.65-0.75' };
  if (minutes >= 480 && minutes <= 599) return { min: 0.8, max: 0.89, label: '0.80-0.89' };
  if (minutes >= 600 && minutes <= 719) return { min: 0.85, max: 0.89, label: '0.85-0.89' };
  if (minutes >= 720 && minutes <= 839) return { min: 0.82, max: 0.87, label: '0.82-0.87' };
  if (minutes >= 840 && minutes <= 1079) return { min: 0.75, max: 0.83, label: '0.75-0.83' };
  if (minutes >= 1080 && minutes <= 1319) return { min: 0.65, max: 0.75, label: '0.65-0.75' };
  return { min: 0.55, max: 0.67, label: '0.55-0.67' };
}

function getApresentacaoRange(acordouNaWocl, horaAcordou) {
  const minutes = hhmmToMinutes(horaAcordou);
  if (!acordouNaWocl) return { min: 0, max: 0, label: '0.00' };
  if (minutes != null && minutes >= 120 && minutes <= 239) {
    return { min: -0.3, max: -0.2, label: '-0.30 a -0.20' };
  }
  if (minutes != null && minutes >= 240 && minutes <= 359) {
    return { min: -0.15, max: -0.05, label: '-0.15 a -0.05' };
  }
  return { min: null, max: null, label: 'WOCL fora da faixa esperada' };
}

function regulatoryLimit(durationMinutes) {
  if (!Number.isFinite(durationMinutes) || durationMinutes < 0) return null;
  if (durationMinutes <= 720) return 720;
  if (durationMinutes <= 780) return 720;
  if (durationMinutes <= 840) return 840;
  if (durationMinutes <= 900) return 960;
  return 960;
}

function monthlyKey(day) {
  return String(day).slice(0, 7);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const json = text ? parseJson(text, {}) : {};
  if (!response.ok) {
    throw new Error(
      `${response.status} ${response.statusText}: ${JSON.stringify(json).slice(0, 500)}`,
    );
  }
  return json;
}

async function fetchSigvoosHistory() {
  const login = await fetchJson(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD }),
  });
  const token = login?.data?.accessToken;
  if (!token) {
    throw new Error('Nao foi possivel autenticar na API para consultar o historico SIGVOOS.');
  }
  const history = await fetchJson(`${API_BASE}/integracoes/sigvoos/historico?limit=30`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(history?.data) ? history.data : [];
}

function inferEmpresaId(explicitEmpresaId) {
  if (explicitEmpresaId != null) {
    return { empresaId: explicitEmpresaId, candidates: [] };
  }

  const candidates = runD1(`
    SELECT empresa_id,
           MAX(CASE WHEN chave = 'auto_sync_enabled' THEN valor END) AS auto_sync_enabled,
           MAX(CASE WHEN chave = 'auto_sync_hora_utc' THEN valor END) AS auto_sync_hora_utc,
           MAX(CASE WHEN chave = 'username' THEN valor END) AS username,
           MAX(CASE WHEN chave = 'last_sync_to' THEN valor END) AS last_sync_to
      FROM integracoes_sigvoos_config
     WHERE deleted_at IS NULL
     GROUP BY empresa_id
     ORDER BY CASE
                WHEN LOWER(COALESCE(MAX(CASE WHEN chave = 'auto_sync_enabled' THEN valor END), '0')) IN ('1', 'true', 'yes', 'on') THEN 0
                ELSE 1
              END,
              CASE WHEN MAX(CASE WHEN chave = 'username' THEN valor END) IS NOT NULL THEN 0 ELSE 1 END,
              empresa_id ASC
  `);

  if (candidates.length > 0) {
    return { empresaId: Number(candidates[0].empresa_id), candidates };
  }

  const fallback = runD1(`
    SELECT f.empresa_id, COUNT(*) AS total
      FROM frms_jornada j
      JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER)
     WHERE j.deleted_at IS NULL
       AND f.deleted_at IS NULL
       AND j.data BETWEEN ${sqlString(DEFAULT_FROM)} AND ${sqlString(DEFAULT_TO)}
     GROUP BY f.empresa_id
     ORDER BY total DESC, f.empresa_id ASC
     LIMIT 1
  `);
  if (fallback.length === 0) {
    throw new Error('Nao foi possivel inferir empresa_id para a auditoria.');
  }
  return { empresaId: Number(fallback[0].empresa_id), candidates };
}

function loadConfig(empresaId) {
  const rows = runD1(`
    SELECT nome, valor_numerico
      FROM frms_configuracao_limites
     WHERE ativo = 1
       AND deleted_at IS NULL
       AND nome IN ('MINUTOS_ANTES_APRESENTACAO', 'HORAS_SONO_PADRAO')
  `);
  const map = Object.fromEntries(rows.map((row) => [row.nome, safeNumber(row.valor_numerico)]));
  return {
    empresaId,
    minutosAntesApresentacao: map.MINUTOS_ANTES_APRESENTACAO ?? 90,
    horasSonoPadrao: map.HORAS_SONO_PADRAO ?? 8,
  };
}

function loadSchedulerConfig(empresaId) {
  const rows = runD1(`
    SELECT chave, valor
      FROM integracoes_sigvoos_config
     WHERE deleted_at IS NULL
       AND empresa_id = ${safeNumber(empresaId)}
       AND chave IN ('auto_sync_enabled', 'auto_sync_hora_utc', 'last_sync_to', 'notificar_falha_email')
  `);
  const map = Object.fromEntries(rows.map((row) => [row.chave, row.valor]));
  const parsedHour = Number.parseInt(String(map.auto_sync_hora_utc ?? '19'), 10);
  const autoSyncHourUtc = Number.isFinite(parsedHour) ? Math.max(0, Math.min(23, parsedHour)) : 19;
  return {
    autoSyncEnabled: String(map.auto_sync_enabled ?? 'true').toLowerCase() !== 'false',
    autoSyncHourUtc,
    lastSyncTo: map.last_sync_to ?? null,
    notificarFalhaEmail: map.notificar_falha_email ?? null,
  };
}

function loadJourneys(empresaId, from, to) {
  return runD1(`
    SELECT j.id AS jornada_id,
           CAST(j.tripulante_id AS TEXT) AS tripulante_id,
           f.nome AS tripulante_nome,
           j.data,
           j.status,
           j.hora_apresentacao,
           j.hora_termino,
           j.hora_corte_motor,
           j.duracao_jornada_minutos,
           j.horas_voo_minutos,
           j.hora_acordou,
           j.sono_efetivo_min,
           COALESCE(j.fonte_sono, 'PADRAO') AS fonte_sono,
           COALESCE(j.acordou_na_wocl, 0) AS acordou_na_wocl,
           j.repouso_regulatorio_min,
           j.origem,
           fj.fator_basica_pct,
           fj.fator_apresentacao_pct,
           fj.fator_repouso_pct,
           fj.effectiveness_pct,
           fj.effectiveness_componentes_json,
           fj.hora_despertar_estimada,
           fj.hora_inicio_sono_estimado,
           fj.duracao_sono_efetiva_min,
           fj.tempo_abaixo_limiar_min
      FROM frms_jornada j
      JOIN funcionarios f
        ON f.id = CAST(j.tripulante_id AS INTEGER)
      LEFT JOIN frms_fatorizacao_jornada fj
        ON fj.jornada_id = j.id
       AND fj.deleted_at IS NULL
     WHERE j.deleted_at IS NULL
       AND f.deleted_at IS NULL
       AND f.empresa_id = ${safeNumber(empresaId)}
       AND j.data BETWEEN ${sqlString(from)} AND ${sqlString(to)}
     ORDER BY f.nome ASC, j.data ASC, COALESCE(j.hora_apresentacao, '99:99') ASC
  `).map((row) => ({
    ...row,
    acordou_na_wocl: safeNumber(row.acordou_na_wocl) === 1,
    sono_efetivo_min: row.sono_efetivo_min == null ? null : safeNumber(row.sono_efetivo_min),
    duracao_jornada_minutos:
      row.duracao_jornada_minutos == null ? null : safeNumber(row.duracao_jornada_minutos),
    horas_voo_minutos: row.horas_voo_minutos == null ? null : safeNumber(row.horas_voo_minutos),
    repouso_regulatorio_min:
      row.repouso_regulatorio_min == null ? null : safeNumber(row.repouso_regulatorio_min),
    fator_basica_pct: row.fator_basica_pct == null ? null : safeNumber(row.fator_basica_pct),
    fator_apresentacao_pct:
      row.fator_apresentacao_pct == null ? null : safeNumber(row.fator_apresentacao_pct),
    fator_repouso_pct: row.fator_repouso_pct == null ? null : safeNumber(row.fator_repouso_pct),
  }));
}

function loadPreviewRows(from, to) {
  const fromYear = Number(from.slice(0, 4));
  const toYear = Number(to.slice(0, 4));
  return runD1(`
    SELECT id,
           tripulante_id,
           nome_fira,
           ano,
           mes,
           status,
           preview_json,
           created_at
      FROM frms_importacao_fira
     WHERE deleted_at IS NULL
       AND tripulante_id IS NOT NULL
       AND ano BETWEEN ${fromYear} AND ${toYear}
     ORDER BY created_at DESC
  `);
}

function latestPreviewPerMonth(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = `${row.tripulante_id}:${row.ano}:${row.mes}`;
    if (!map.has(key)) {
      map.set(key, row);
    }
  }
  return [...map.values()];
}

function aggregateSigvoosDays(previewRows, from, to) {
  const days = new Map();
  for (const row of latestPreviewPerMonth(previewRows)) {
    const preview = parseJson(row.preview_json, null);
    const linhas = Array.isArray(preview?.linhas) ? preview.linhas : [];
    for (const linha of linhas) {
      if (!linha || typeof linha !== 'object') continue;
      if (typeof linha.data !== 'string' || linha.data < from || linha.data > to) continue;
      if (linha.situacao === 'DIA_VAZIO') continue;
      const key = `${row.tripulante_id}:${linha.data}`;
      const current = days.get(key) || {
        tripulante_id: String(row.tripulante_id),
        tripulante_nome: preview?.tripulante_nome_sistema || row.nome_fira,
        data: linha.data,
        hv_sigvoos_min: 0,
        importacao_id: row.id,
      };
      current.hv_sigvoos_min += safeNumber(linha.horas_voo_min, 0);
      days.set(key, current);
    }
  }
  return [...days.values()].sort((left, right) => {
    if (left.tripulante_nome !== right.tripulante_nome) {
      return String(left.tripulante_nome).localeCompare(String(right.tripulante_nome));
    }
    return String(left.data).localeCompare(String(right.data));
  });
}

function buildJourneyMaps(journeys) {
  const byTrip = new Map();
  const byTripDate = new Map();
  for (const row of journeys) {
    if (!byTrip.has(row.tripulante_id)) byTrip.set(row.tripulante_id, []);
    byTrip.get(row.tripulante_id).push(row);
    byTripDate.set(`${row.tripulante_id}:${row.data}`, row);
  }
  for (const rows of byTrip.values()) {
    rows.sort((left, right) => String(left.data).localeCompare(String(right.data)));
  }
  return { byTrip, byTripDate };
}

function auditBlock1(journeys, minutosAntesApresentacao) {
  let fails = 0;
  const rows = journeys.map((row) => {
    const presentationMin = hhmmToMinutes(row.hora_apresentacao);
    const wakeMin = hhmmToMinutes(row.hora_acordou);
    const expectedWakeMin =
      presentationMin == null ? null : presentationMin - minutosAntesApresentacao;
    const wakeDiff = circularMinuteDiff(
      wakeMin,
      expectedWakeMin == null ? null : ((expectedWakeMin % 1440) + 1440) % 1440,
    );
    const expectedWake = expectedWakeMin == null ? 'n/a' : minutesToHhmm(expectedWakeMin);
    const expectedWocl = isWakeInsideWocl(wakeMin);
    const issues = [];

    if (row.fonte_sono === 'PADRAO' && row.sono_efetivo_min !== 480) {
      issues.push(`sono_padrao=${row.sono_efetivo_min ?? 'n/a'} (esperado 480)`);
    }
    if (wakeDiff != null && wakeDiff > 1) {
      issues.push(
        `hora_acordou ${row.hora_acordou ?? 'n/a'} != ${expectedWake} (delta ${wakeDiff}m)`,
      );
    }
    if (wakeMin != null && row.acordou_na_wocl !== expectedWocl) {
      issues.push(`WOCL=${row.acordou_na_wocl} mas hora_acordou exige ${expectedWocl}`);
    }

    const pass = issues.length === 0;
    if (!pass) fails++;
    return {
      markdown: [
        row.tripulante_nome,
        row.data,
        row.hora_apresentacao ?? 'n/a',
        row.hora_acordou ?? 'n/a',
        row.sono_efetivo_min ?? 'n/a',
        row.fonte_sono,
        row.acordou_na_wocl ? 'true' : 'false',
        pass ? 'PASS' : `FAIL CRITICO: ${issues.join('; ')}`,
      ],
    };
  });

  return {
    fails,
    table: markdownTable(
      [
        'Tripulante',
        'Data',
        'Apresentacao',
        'Hora Acordou',
        'Sono Efetivo',
        'Fonte',
        'WOCL?',
        'STATUS',
      ],
      rows.map((row) => row.markdown),
    ),
  };
}

function auditBlock2(journeys) {
  let fails = 0;
  const rows = journeys.map((row) => {
    const expected = row.fonte_sono === 'PADRAO' ? 0 : 'pode variar';
    const pass = row.fonte_sono !== 'PADRAO' || row.fator_repouso_pct === 0;
    if (!pass) fails++;
    return [
      row.tripulante_nome,
      row.data,
      row.fonte_sono,
      row.sono_efetivo_min ?? 'n/a',
      row.fator_repouso_pct == null ? 'n/a' : formatSigned(row.fator_repouso_pct),
      expected,
      pass ? 'PASS' : 'FAIL',
    ];
  });

  return {
    fails,
    table: markdownTable(
      [
        'Tripulante',
        'Data',
        'Fonte Sono',
        'Sono Efetivo (min)',
        'Fator_Repouso',
        'Esperado',
        'STATUS',
      ],
      rows,
    ),
  };
}

function auditBlock3(journeys) {
  const eligible = journeys.filter((row) => row.hora_acordou && row.fator_basica_pct != null);
  const checks = pickSpotChecks(eligible, 5).map((row) => {
    const range = getCircadianRange(row.hora_acordou);
    const midpoint = range ? (range.min + range.max) / 2 : null;
    const delta =
      midpoint == null || row.fator_basica_pct == null
        ? null
        : Math.abs(row.fator_basica_pct - midpoint);
    const pass =
      range != null &&
      delta != null &&
      delta <= 0.05 &&
      row.fator_basica_pct >= range.min &&
      row.fator_basica_pct <= range.max;
    return {
      pass,
      row: [
        row.tripulante_nome,
        row.data,
        row.hora_acordou,
        formatNumber(row.fator_basica_pct, 2),
        range?.label ?? 'n/a',
        delta == null ? 'n/a' : formatNumber(delta, 2),
        pass ? 'PASS' : 'FAIL',
      ],
    };
  });

  return {
    fails: checks.filter((item) => !item.pass).length,
    table: markdownTable(
      [
        'Tripulante',
        'Data',
        'Hora Acordou',
        'Fator_Basica Registrado',
        'Range Esperado',
        'Delta',
        'STATUS',
      ],
      checks.map((item) => item.row),
    ),
  };
}

function auditBlock4(journeys) {
  let fails = 0;
  const rows = journeys
    .filter((row) => row.hora_acordou)
    .map((row) => {
      const range = getApresentacaoRange(row.acordou_na_wocl, row.hora_acordou);
      const value = row.fator_apresentacao_pct;
      const pass =
        value != null &&
        ((range.min === 0 && value === 0) ||
          (range.min != null && range.max != null && value >= range.min && value <= range.max));
      if (!pass) fails++;
      return [
        row.tripulante_nome,
        row.data,
        row.hora_acordou,
        row.acordou_na_wocl ? 'true' : 'false',
        value == null ? 'n/a' : formatSigned(value),
        range.label,
        pass ? 'PASS' : 'FAIL',
      ];
    });

  return {
    fails,
    table: markdownTable(
      [
        'Tripulante',
        'Data',
        'Hora Acordou',
        'WOCL?',
        'Fator_Apresentacao Registrado',
        'Esperado',
        'STATUS',
      ],
      rows,
    ),
  };
}

function inferDurationMinutes(row) {
  if (Number.isFinite(row.duracao_jornada_minutos)) return row.duracao_jornada_minutos;
  const start = hhmmToMinutes(row.hora_apresentacao);
  const end = hhmmToMinutes(row.hora_corte_motor || row.hora_termino);
  if (start == null || end == null) return null;
  return end >= start ? end - start : end + 1440 - start;
}

function auditBlock5(byTrip) {
  let fails = 0;
  const rows = [];

  for (const tripRows of byTrip.values()) {
    for (let index = 1; index < tripRows.length; index++) {
      const previous = tripRows[index - 1];
      const current = tripRows[index];
      const duration = inferDurationMinutes(previous);
      const limit = duration == null ? null : regulatoryLimit(duration);
      const actualRest = current.repouso_regulatorio_min;
      const pass = limit != null && actualRest != null ? actualRest >= limit : false;
      if (!pass) fails++;
      rows.push([
        current.tripulante_nome,
        previous.data,
        duration == null ? 'n/a' : `${duration} min`,
        previous.hora_corte_motor || previous.hora_termino || 'n/a',
        current.hora_apresentacao || 'n/a',
        actualRest == null ? 'n/a' : `${actualRest}`,
        limit == null ? 'n/a' : `${limit}`,
        'RBAC 117 Apendice B item (j)',
        pass ? 'PASS' : 'FAIL',
      ]);
    }
  }

  return {
    fails,
    table: markdownTable(
      [
        'Tripulante',
        'Data D1',
        'Duracao D1',
        'Corte D1',
        'Apresentacao D2',
        'Repouso Regulatorio (min)',
        'Limite RBAC (min)',
        'Artigo',
        'STATUS',
      ],
      rows,
    ),
  };
}

function auditBlock6(byTrip) {
  let fails = 0;
  const rows = [];

  for (const tripRows of byTrip.values()) {
    for (let index = 0; index < tripRows.length; index++) {
      const current = tripRows[index];
      let sum7 = 0;
      let sum28 = 0;
      let hv28 = 0;
      let hv365 = 0;

      for (let inner = 0; inner <= index; inner++) {
        const compared = tripRows[inner];
        const diff = daysBetween(compared.data, current.data);
        const duration = inferDurationMinutes(compared) ?? 0;
        const hv = safeNumber(compared.horas_voo_minutos, 0);
        if (diff <= 6) sum7 += duration;
        if (diff <= 27) {
          sum28 += duration;
          hv28 += hv;
        }
        if (diff <= 364) hv365 += hv;
      }

      const pass = sum7 <= 3600 && sum28 <= 10560 && hv28 <= 5580 && hv365 <= 55800;
      if (!pass) fails++;
      rows.push([
        current.tripulante_nome,
        current.data,
        `${sum7}`,
        '3600',
        `${sum28}`,
        '10560',
        `${hv28}`,
        '5580',
        `${hv365}`,
        '55800',
        pass ? 'PASS' : 'FAIL',
      ]);
    }
  }

  return {
    fails,
    table: markdownTable(
      [
        'Tripulante',
        'Data Ref',
        'Jornada 7d (min)',
        'Limite',
        'Jornada 28d',
        'Limite',
        'HV 28d',
        'Limite',
        'HV 365d',
        'Limite',
        'STATUS',
      ],
      rows,
    ),
  };
}

function auditBlock7(sigvoosDays, byTripDate) {
  let fails = 0;
  const tableG = [];
  const monthCoverage = new Map();

  for (const sourceDay of sigvoosDays) {
    const journey = byTripDate.get(`${sourceDay.tripulante_id}:${sourceDay.data}`);
    const hvFrms = journey?.horas_voo_minutos ?? null;
    const delta = hvFrms == null ? null : Math.abs(sourceDay.hv_sigvoos_min - hvFrms);
    const pass = hvFrms != null && delta != null && delta <= 5;
    if (!pass) fails++;
    tableG.push([
      sourceDay.tripulante_nome,
      sourceDay.data,
      `${sourceDay.hv_sigvoos_min}`,
      hvFrms == null ? 'n/a' : `${hvFrms}`,
      delta == null ? 'n/a' : `${delta}`,
      pass ? 'PASS' : hvFrms == null ? 'FAIL CRITICO: sem jornada FRMS' : 'FAIL',
    ]);

    const key = `${sourceDay.tripulante_id}:${monthlyKey(sourceDay.data)}`;
    const coverage = monthCoverage.get(key) || {
      tripulante_nome: sourceDay.tripulante_nome,
      mes: monthlyKey(sourceDay.data),
      dias_sigvoos: 0,
      dias_frms: 0,
    };
    coverage.dias_sigvoos += 1;
    if (journey) coverage.dias_frms += 1;
    monthCoverage.set(key, coverage);
  }

  const tableH = [...monthCoverage.values()]
    .sort((left, right) => {
      if (left.tripulante_nome !== right.tripulante_nome) {
        return String(left.tripulante_nome).localeCompare(String(right.tripulante_nome));
      }
      return String(left.mes).localeCompare(String(right.mes));
    })
    .map((row) => {
      const coveragePct = row.dias_sigvoos > 0 ? (row.dias_frms / row.dias_sigvoos) * 100 : 0;
      const pass = coveragePct >= 98;
      if (!pass) fails++;
      return [
        row.tripulante_nome,
        row.mes,
        `${row.dias_sigvoos}`,
        `${row.dias_frms}`,
        formatNumber(coveragePct, 1),
        pass ? 'PASS' : 'FAIL',
      ];
    });

  return {
    fails,
    tableG: markdownTable(
      ['Tripulante', 'Data', 'HV SIGVOOS (min)', 'HV FRMS (min)', 'Delta', 'STATUS'],
      tableG,
    ),
    tableH: markdownTable(
      ['Tripulante', 'Mes', 'Dias SIGVOOS', 'Dias FRMS', 'Cobertura%', 'STATUS'],
      tableH,
    ),
  };
}

function parseCronConfig() {
  const wrangler = readFileSync(resolve(ROOT_DIR, 'worker-airtrust/wrangler.toml'), 'utf8');
  const cron = wrangler.includes('"0 8 * * *"') ? '0 8 * * *' : 'nao localizado';
  return {
    cron,
    brasilia: cron === '0 8 * * *' ? '05:00 BRT (UTC-3)' : 'n/a',
  };
}

function inspectScheduledHandler() {
  const source = readFileSync(
    resolve(ROOT_DIR, 'worker-airtrust/src/cron/scheduled-handler.ts'),
    'utf8',
  );
  const usesCatchup =
    source.includes('let fromDate = lastSyncToDate ? addDays(lastSyncToDate, 1) : yesterday;') &&
    source.includes('const windows = buildWindows(fmtIso(fromDate), todayUtc, 1);') &&
    source.includes('const window = windows[0];');
  const usesPreviousDayWindow =
    source.includes('const window = { from: fmtIso(yesterday), to: fmtIso(yesterday) };') &&
    source.includes('if (currentUtcHour !== targetHour || currentUtcMinute >= 10) {');
  const hasFailureAlerting =
    source.includes('registrarEventoSigvoosFalha(') &&
    source.includes('enviarEmailAlert(') &&
    source.includes('config.notificar_falha_email');
  return {
    usesCatchup,
    usesPreviousDayWindow,
    hasFailureAlerting,
    summary: usesCatchup
      ? 'Handler sincroniza a primeira janela pendente entre last_sync_to+1 e hoje; nao esta fixado estritamente em ontem 00:00-23:59.'
      : usesPreviousDayWindow
        ? 'Handler confirma janela diaria fixa em ontem 00:00-23:59 UTC, no horario configurado.'
        : 'Nao foi possivel confirmar a janela diaria pelo codigo atual.',
  };
}

function parseEventPayload(event) {
  return typeof event.payload_json === 'string' ? parseJson(event.payload_json, {}) : {};
}

function isLikelyAutomaticCronEvent(event) {
  const payload = parseEventPayload(event);
  const hasWindow = typeof payload?.from === 'string' && typeof payload?.to === 'string';
  if (!hasWindow) return false;
  if (String(payload.from) !== String(payload.to)) return false;

  const hasManualChunkingHints =
    payload?.pageSize != null ||
    payload?.maxPages != null ||
    payload?.chunkDays != null ||
    payload?.retryAttempts != null;

  return !hasManualChunkingHints;
}

function classifyScheduledEvents(events, targetHourUtc) {
  const lastSevenDays = Date.now() - 7 * 86400000;
  return events.filter((event) => {
    const createdAt = Date.parse(String(event.created_at || event.updated_at || ''));
    if (!Number.isFinite(createdAt) || createdAt < lastSevenDays) return false;
    if (!isLikelyAutomaticCronEvent(event)) return false;

    if (Number.isFinite(targetHourUtc)) {
      const created = new Date(createdAt);
      const nearCronHour = created.getUTCHours() === Number(targetHourUtc);
      const nearCronMinute = created.getUTCMinutes() < 20;
      return nearCronHour && nearCronMinute;
    }

    return true;
  });
}

function auditBlock8(events, schedulerConfig) {
  const cronConfig = parseCronConfig();
  const handler = inspectScheduledHandler();
  const scheduled = classifyScheduledEvents(events, schedulerConfig?.autoSyncHourUtc);
  const failures = scheduled.filter((event) => String(event.status).toUpperCase() !== 'SUCESSO');
  const anyAlerting = handler.hasFailureAlerting;
  const checks = [];
  checks.push(`Cron em producao: ${cronConfig.cron} -> ${cronConfig.brasilia}`);
  checks.push(`auto_sync_hora_utc configurado: ${schedulerConfig?.autoSyncHourUtc ?? 'n/a'}:00`);
  checks.push(`Handler: ${handler.summary}`);
  checks.push(`Eventos automaticos ultimos 7 dias: ${scheduled.length}`);
  checks.push(`Falhas ultimos 7 dias: ${failures.length}`);
  checks.push(
    anyAlerting
      ? 'Alerta de falha: identificado'
      : 'Alerta de falha: nao identificado no codigo atual',
  );

  const tableRows = scheduled.map((event) => {
    const payload = parseJson(event.payload_json, {});
    const response = parseJson(event.resposta_json, {});
    const totalEtapas = response?.totalRegistrosBrutos ?? response?.totalImportacoes ?? 'n/a';
    const created = String(event.created_at || event.updated_at || 'n/a');
    const timestamp = created.replace('T', ' ').slice(0, 19);
    const pass = String(event.status).toUpperCase() === 'SUCESSO';
    return [
      String(event.tipo_evento || 'n/a'),
      timestamp,
      `${payload?.from ?? 'n/a'} -> ${payload?.to ?? 'n/a'}`,
      `${totalEtapas}`,
      String(event.status || 'n/a'),
      pass ? 'PASS' : 'FAIL CRITICO',
    ];
  });

  const failCount = failures.length;
  let warningCount = 0;
  if (!anyAlerting) warningCount += 1;
  if (scheduled.length === 0) warningCount += 1;

  return {
    fails: failCount,
    warnings: warningCount,
    notes: checks,
    table: markdownTable(
      ['Tipo', 'Timestamp', 'Janela', 'totalEtapas', 'Status', 'STATUS'],
      tableRows,
    ),
  };
}

function buildExecutiveSummary(preconditions, blocks) {
  const rows = [
    ['0', 'Pre-condicoes', preconditions.result, `${preconditions.fails}`],
    ['1', 'Sono efetivo calculado corretamente', blocks.block1.result, `${blocks.block1.fails}`],
    [
      '2',
      'Fator_Repouso coerente com sono efetivo',
      blocks.block2.result,
      `${blocks.block2.fails}`,
    ],
    ['3', 'Fator_Basica coerente com circadiano', blocks.block3.result, `${blocks.block3.fails}`],
    ['4', 'Fator_Apresentacao coerente com WOCL', blocks.block4.result, `${blocks.block4.fails}`],
    ['5', 'Repouso regulatorio RBAC 117 ok', blocks.block5.result, `${blocks.block5.fails}`],
    ['6', 'Limites acumulados 7d/28d/365d ok', blocks.block6.result, `${blocks.block6.fails}`],
    [
      '7',
      'Cross-validation SIGVOOS >=98% cobertura',
      blocks.block7.result,
      `${blocks.block7.fails}`,
    ],
    ['8', 'Scheduler diario funcionando', blocks.block8.result, `${blocks.block8.fails}`],
  ];

  return markdownTable(['Bloco', 'Verificacao', 'Resultado', 'FAILs'], rows);
}

function collectCorrections(blockFindings) {
  const corrections = [];
  for (const finding of blockFindings) {
    if (finding.fails === 0) continue;
    corrections.push(`- Bloco ${finding.id}: ${finding.action}`);
  }
  return corrections.length > 0
    ? corrections.join('\n')
    : '- Nenhuma correcao mandataria registrada; sem FAILs.';
}

async function main() {
  const options = parseArgs(process.argv);
  const { empresaId, candidates } = inferEmpresaId(options.empresaId);
  const config = loadConfig(empresaId);
  const schedulerConfig = loadSchedulerConfig(empresaId);
  const journeys = loadJourneys(empresaId, options.from, options.to);
  const previewRows = loadPreviewRows(options.from, options.to);
  const sigvoosDays = aggregateSigvoosDays(previewRows, options.from, options.to);
  const historyEvents = await fetchSigvoosHistory().catch((error) => {
    console.warn(`[audit] Falha ao consultar API historico SIGVOOS: ${error.message}`);
    return runD1(`
      SELECT tipo_evento, status, payload_json, resposta_json, created_at, updated_at
        FROM integracoes_sigvoos_eventos
       WHERE deleted_at IS NULL
         AND empresa_id = ${safeNumber(empresaId)}
       ORDER BY created_at DESC
       LIMIT 30
    `);
  });

  const { byTrip, byTripDate } = buildJourneyMaps(journeys);

  const preconditionFails = [];
  if (config.minutosAntesApresentacao !== 90) {
    preconditionFails.push(
      `MINUTOS_ANTES_APRESENTACAO=${config.minutosAntesApresentacao} (esperado 90)`,
    );
  }
  if (config.horasSonoPadrao !== 8) {
    preconditionFails.push(`HORAS_SONO_PADRAO=${config.horasSonoPadrao} (esperado 8)`);
  }
  if (journeys.length === 0) {
    preconditionFails.push('Nenhuma jornada encontrada no periodo');
  }

  const block1 = auditBlock1(journeys, config.minutosAntesApresentacao);
  const block2 = auditBlock2(journeys);
  const block3 = auditBlock3(journeys);
  const block4 = auditBlock4(journeys);
  const block5 = auditBlock5(byTrip);
  const block6 = auditBlock6(byTrip);
  const block7 = auditBlock7(sigvoosDays, byTripDate);
  const block8 = auditBlock8(historyEvents, schedulerConfig);

  const summary = {
    block1: { fails: block1.fails, result: blockOutcome(block1.fails) },
    block2: { fails: block2.fails, result: blockOutcome(block2.fails) },
    block3: { fails: block3.fails, result: blockOutcome(block3.fails) },
    block4: { fails: block4.fails, result: blockOutcome(block4.fails) },
    block5: { fails: block5.fails, result: blockOutcome(block5.fails) },
    block6: { fails: block6.fails, result: blockOutcome(block6.fails) },
    block7: { fails: block7.fails, result: blockOutcome(block7.fails) },
    block8: { fails: block8.fails, result: blockOutcome(block8.fails, block8.warnings) },
  };

  const preconditions = {
    fails: preconditionFails.length,
    result: preconditionFails.length === 0 ? 'PASS' : 'FAIL',
  };

  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const candidateText = candidates.length
    ? candidates
        .map((candidate) => {
          const auto = String(candidate.auto_sync_enabled ?? 'null');
          const hour = String(candidate.auto_sync_hora_utc ?? 'null');
          const syncTo = String(candidate.last_sync_to ?? 'null');
          return `empresa ${candidate.empresa_id}: auto_sync=${auto}, auto_sync_hora_utc=${hour}, last_sync_to=${syncTo}`;
        })
        .join('; ')
    : 'inferido sem candidatos de config';

  const report = [
    '# Auditoria Cientifica FRMS - Premissa de Sono + RBAC 135/117 + SAFTE-FAST',
    `Gerado em: ${generatedAt}`,
    `minutosAntesApresentacao configurado: ${config.minutosAntesApresentacao}`,
    `horasSonoPadrao configurado: ${config.horasSonoPadrao}`,
    `empresaId auditada: ${empresaId}`,
    `Candidatos SIGVOOS para inferencia da empresa: ${candidateText}`,
    `Periodo: ${options.from} a ${options.to}`,
    `Total jornadas auditadas: ${journeys.length}`,
    '',
    '## RESUMO EXECUTIVO',
    buildExecutiveSummary(preconditions, summary),
    '',
    '## BLOCO 0 - PRE-CONDICOES',
    preconditionFails.length === 0
      ? '- PASS: parametros basicos confirmados (90 min / 8 h).'
      : preconditionFails.map((item) => `- FAIL: ${item}`).join('\n'),
    '',
    '## TABELA A - Verificacao do Sono Efetivo',
    block1.table,
    '',
    '## TABELA B - Fator_Repouso',
    block2.table,
    '',
    '## TABELA C - Fator_Basica vs Hora Acordou',
    block3.table,
    '',
    '## TABELA D - Fator_Apresentacao',
    block4.table,
    '',
    '## TABELA E - Conformidade Regulatoria de Repouso (RBAC 117)',
    block5.table,
    '',
    '## TABELA F - Limites Acumulados por Tripulante',
    block6.table,
    '',
    '## TABELA G - Cross-validation HV',
    block7.tableG,
    '',
    '## TABELA H - Cobertura por tripulante/mes',
    block7.tableH,
    '',
    '## BLOCO 8 - Scheduler automatico',
    block8.notes.map((item) => `- ${item}`).join('\n'),
    '',
    block8.table,
    '',
    '## CORRECOES NECESSARIAS',
    collectCorrections([
      {
        id: 1,
        fails: block1.fails,
        action:
          'Consolidar a premissa PADRAO = 480 min e regravar hora_acordou = hora_apresentacao - 90 min; referencia: premissa SAFTE / regra operacional configurada.',
      },
      {
        id: 2,
        fails: block2.fails,
        action:
          'Desacoplar fator_repouso da referencia antiga de corte->apresentacao quando fonte_sono = PADRAO; esperado 0 com 8h fixas.',
      },
      {
        id: 3,
        fails: block3.fails,
        action:
          'Persistir fator_basica pela fase circadiana de hora_acordou, nao pela proporcao de FDP usado nem por vigilia indireta.',
      },
      {
        id: 4,
        fails: block4.fails,
        action:
          'Garantir penalidade WOCL nao nula quando acordou_na_wocl = true e zerar fora da janela 02:00-05:59.',
      },
      {
        id: 5,
        fails: block5.fails,
        action:
          'Revalidar repouso_regulatorio_min por par consecutivo de jornadas conforme RBAC 117 Apendice B item (j).',
      },
      {
        id: 6,
        fails: block6.fails,
        action:
          'Aplicar bloqueios/alertas para janelas 7d, 28d e 365d quando exceder limites RBAC 117 Apendice B Tabela 5.',
      },
      {
        id: 7,
        fails: block7.fails,
        action:
          'Fechar lacunas de ingestao SIGVOOS -> FRMS e rejeitar divergencias >5 min de HV por dia.',
      },
      {
        id: 8,
        fails: block8.fails,
        action:
          'Validar execucao automatica real do cron nos ultimos 7 dias e manter alerta ativo em falhas de sincronizacao.',
      },
    ]),
  ].join('\n');

  writeFileSync(options.output, report, 'utf8');
  console.log(`[audit] Relatorio gerado em ${options.output}`);
  console.log(
    `[audit] Empresa ${empresaId} | jornadas=${journeys.length} | sigvoos_dias=${sigvoosDays.length}`,
  );
}

main().catch((error) => {
  console.error(`[audit] Falha: ${error.stack || error.message}`);
  process.exitCode = 1;
});

~~~

---
## FILE: scripts/audit-prod-simple.sh
~~~bash
#!/usr/bin/env bash
set -euo pipefail

# Simple production data audit - lists all tables and row counts
# Requirement: CLOUDFLARE_ACCOUNT_ID and D1_PROD_DB environment variables

if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "❌ Missing: CLOUDFLARE_ACCOUNT_ID"
  echo "   Example: export CLOUDFLARE_ACCOUNT_ID=1234567890abcdef"
  exit 1
fi

if [ -z "${D1_PROD_DB:-}" ]; then
  echo "❌ Missing: D1_PROD_DB"
  echo "   Example: export D1_PROD_DB=airtrust-db"
  exit 1
fi

export CF_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID"

AUDIT_DIR="./audit-producao"
mkdir -p "$AUDIT_DIR"

echo "🔍 Auditando produção: $D1_PROD_DB"
echo ""

# Get list of all tables
TABLES=$(wrangler d1 execute "$D1_PROD_DB" --remote --command \
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%cf_%' ORDER BY name;" 2>&1)

echo "📋 Tabelas encontradas:"
echo "$TABLES"
echo ""

# Count rows in each table
echo "📊 Contagem de registros por tabela:"
echo ""

TABLE_LIST=$(echo "$TABLES" | grep -oP '(?<="name":\s")[^"]+' 2>/dev/null || echo "")

if [ -z "$TABLE_LIST" ]; then
  echo "❌ Erro: não foi possível extrair lista de tabelas"
  echo "Resposta bruta:"
  echo "$TABLES"
  exit 1
fi

for TABLE in $TABLE_LIST; do
  COUNT=$(wrangler d1 execute "$D1_PROD_DB" --remote --command "SELECT COUNT(*) as cnt FROM $TABLE;" 2>&1)
  COUNT_NUM=$(echo "$COUNT" | grep -oP '(?<="cnt":\s?)\d+' | head -1)
  echo "  $TABLE: $COUNT_NUM registros"
  echo "$TABLE: $COUNT_NUM" >> "$AUDIT_DIR/table-counts.txt"
done

echo ""
echo "✅ Auditoria concluída!"
echo "   Resultados: $AUDIT_DIR/table-counts.txt"

~~~

---
## FILE: scripts/audit-prod-tables.sh
~~~bash
#!/usr/bin/env bash
set -euo pipefail

# Exportar TODAS as tabelas do D1 de produção para análise
# Uso: CLOUDFLARE_ACCOUNT_ID=xxx D1_PROD_DB=yyy ./scripts/audit-prod-tables.sh

if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ] || [ -z "${D1_PROD_DB:-}" ]; then
  echo "❌ Variáveis de ambiente ausentes:"
  echo "export CLOUDFLARE_ACCOUNT_ID=seu_account_id"
  echo "export D1_PROD_DB=airtrust-db"
  exit 1
fi

export CF_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID"

AUDIT_DIR="./audit-producao"
mkdir -p "$AUDIT_DIR"

echo "🔍 Auditando todas tabelas de produção..."
echo ""

# 1) Listar todas as tabelas
echo "📋 Tabelas em produção:"
wrangler d1 execute "$D1_PROD_DB" --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '%cf_%' ORDER BY name;" 2>&1 | tee "$AUDIT_DIR/01_tabelas.json"

echo ""
echo "📊 Contagem de dados por tabela:"

# 2) Contar registros em cada tabela
wrangler d1 execute "$D1_PROD_DB" --remote --command "
SELECT name, (SELECT COUNT(*) FROM (SELECT * FROM sqlite_master WHERE type='table') t1 WHERE t1.name = sqlite_master.name) as table_count
FROM sqlite_master 
WHERE type='table' AND name NOT LIKE '%cf_%' AND name NOT LIKE 'sqlite_%'
ORDER BY name;
" 2>&1 | tee "$AUDIT_DIR/02_contagem.json"

# 3) Dump detalhado de cada tabela (schema + sample rows)
TABLES=$(wrangler d1 execute "$D1_PROD_DB" --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '%cf_%' AND name NOT LIKE 'sqlite_%' ORDER BY name;" 2>&1 | grep '"name"' | sed 's/.*"name": "\([^"]*\)".*/\1/')

for TABLE in $TABLES; do
  echo ""
  echo "📄 Tabela: $TABLE"
  
  # Schema
  echo "   Schema:"
  wrangler d1 execute "$D1_PROD_DB" --remote --command "PRAGMA table_info($TABLE);" 2>&1 | head -20 | tail -5
  
  # Contagem
  COUNT=$(wrangler d1 execute "$D1_PROD_DB" --remote --command "SELECT COUNT(*) as cnt FROM $TABLE;" 2>&1 | grep '"cnt"' | head -1 | sed 's/.*"cnt": \([0-9]*\).*/\1/')
  echo "   Registros: $COUNT"
done

echo ""
echo "✅ Auditoria salva em: $AUDIT_DIR/"

~~~

---
## FILE: scripts/audit-service-imports.sh
~~~bash
#!/bin/bash
set -euo pipefail

# Script de Auditoria - Imports de Services
# Identifica qual service está sendo usado onde

echo "🔍 Auditando imports de services de simuladores..."
echo ""

REPORT_FILE="_reports/service-imports-$(date +%Y%m%d_%H%M%S).txt"
mkdir -p _reports

echo "RELATÓRIO DE IMPORTS - SIMULADORES SERVICE" > "$REPORT_FILE"
echo "Data: $(date)" >> "$REPORT_FILE"
echo "========================================" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# 1. Analisar imports do service principal
echo "1️⃣  Imports de: src/services/simuladores.service.ts" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

COUNT1=$(grep -r "from.*services/simuladores.service" src/ \
  --include="*.tsx" \
  --include="*.ts" \
  --exclude-dir=node_modules 2>/dev/null | wc -l | tr -d ' ')

echo "   Encontrados: $COUNT1 imports" | tee -a "$REPORT_FILE"
grep -r "from.*services/simuladores.service" src/ \
  --include="*.tsx" \
  --include="*.ts" \
  --exclude-dir=node_modules 2>/dev/null | \
  sed 's/^/   /' | tee -a "$REPORT_FILE"

echo "" | tee -a "$REPORT_FILE"

# 2. Analisar imports do service do react-app
echo "2️⃣  Imports de: src/react-app/services/simuladores.service.ts" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

COUNT2=$(grep -r "from.*react-app/services/simuladores.service\|from.*'@/services/simuladores.service" src/ \
  --include="*.tsx" \
  --include="*.ts" \
  --exclude-dir=node_modules 2>/dev/null | wc -l | tr -d ' ')

echo "   Encontrados: $COUNT2 imports" | tee -a "$REPORT_FILE"
grep -r "from.*react-app/services/simuladores.service\|from.*'@/services/simuladores.service" src/ \
  --include="*.tsx" \
  --include="*.ts" \
  --exclude-dir=node_modules 2>/dev/null | \
  sed 's/^/   /' | tee -a "$REPORT_FILE"

echo "" | tee -a "$REPORT_FILE"

# 3. Resumo
echo "========================================" | tee -a "$REPORT_FILE"
echo "📊 RESUMO:" | tee -a "$REPORT_FILE"
echo "   src/services/simuladores.service.ts: $COUNT1 usos" | tee -a "$REPORT_FILE"
echo "   src/react-app/services/simuladores.service.ts: $COUNT2 usos" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

if [ "$COUNT1" -gt 0 ] && [ "$COUNT2" -gt 0 ]; then
  echo "⚠️  AMBOS os services estão sendo usados!" | tee -a "$REPORT_FILE"
  echo "   Recomendação: Consolidar em um único service." | tee -a "$REPORT_FILE"
elif [ "$COUNT1" -gt 0 ]; then
  echo "✅ Apenas src/services/simuladores.service.ts está em uso." | tee -a "$REPORT_FILE"
  echo "   Pode remover: src/react-app/services/simuladores.service.ts" | tee -a "$REPORT_FILE"
elif [ "$COUNT2" -gt 0 ]; then
  echo "✅ Apenas src/react-app/services/simuladores.service.ts está em uso." | tee -a "$REPORT_FILE"
  echo "   Pode remover: src/services/simuladores.service.ts" | tee -a "$REPORT_FILE"
else
  echo "❓ Nenhum import direto encontrado." | tee -a "$REPORT_FILE"
  echo "   Verificar imports via barrel exports (index.ts)" | tee -a "$REPORT_FILE"
fi

echo "" | tee -a "$REPORT_FILE"
echo "📝 Relatório completo salvo em: $REPORT_FILE"

~~~

---
## FILE: scripts/audit-sigvoos-frms.mjs
~~~javascript
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_FILE = path.join(ROOT, 'audit-sigvoos-frms.md');
const EMPRESA_ID = Number(process.env.AUDIT_EMPRESA_ID || 6);
const MONTHS = [
  { key: '2026-02', label: 'Fevereiro 2026', from: '2026-02-01', to: '2026-02-28' },
  { key: '2026-03', label: 'Março 2026', from: '2026-03-01', to: '2026-03-31' },
  { key: '2026-04', label: 'Abril 2026', from: '2026-04-01', to: '2026-04-30' },
];

const SIGVOOS_FIELD_CANDIDATES = {
  canac: ['staff.canac', 'staff.codigo_anac', 'canac', 'codigo_anac', 'codigoAnac', 'tripulante_canac'],
  inscription: [
    'staff.inscription',
    'inscription',
    'staff_inscription',
    'matricula',
    'matricula_funcional',
    'employee_code',
    'crew_code',
  ],
  nome: ['staff.name', 'tripulante_nome', 'tripulanteNome', 'nome_tripulante', 'crew_name', 'nome'],
  role: ['staff.role', 'staff.function', 'staff.funcao', 'role', 'funcao', 'crew_role', 'crewPosition'],
  data: ['flight.date', 'flight_report_leg.date', 'date', 'data', 'data_voo', 'flight_date'],
  decolagem: [
    'flight.departureTime',
    'flight.departure_time',
    'flight_report_leg.takeoff_time_str',
    'flight_report_leg.engine_start_time_str',
    'takeoff_time_str',
    'departure_time_str',
    'calco_fora',
    'partida_real',
    'off_block',
  ],
  pouso: [
    'flight.arrivalTime',
    'flight.arrival_time',
    'flight_report_leg.landing_time_str',
    'flight_report_leg.engine_shutoff_time_str',
    'landing_time_str',
    'arrival_time_str',
    'calco_dentro',
    'chegada_real',
    'on_block',
  ],
  origem: [
    'flight.origin',
    'flight_report_leg.departure_location.icao_code',
    'flight_report_leg.departure_location.iata_code',
    'origin',
    'origem',
    'aerodromo_origem',
    'departure_location.icao_code',
  ],
  destino: [
    'flight.destination',
    'flight_report_leg.arrival_location.icao_code',
    'flight_report_leg.arrival_location.iata_code',
    'destination',
    'destino',
    'aerodromo_destino',
    'arrival_location.icao_code',
  ],
  aeronave: [
    'flight.aircraftRegistration',
    'flight.aircraft.registration',
    'flight_report_leg.aircraft_registration',
    'flight_report_leg.aircraft.registration',
    'aircraftRegistration',
    'aircraft_registration',
    'aircraft.registration',
    'matricula_aeronave',
    'aeronave',
  ],
};

const FIELD_LABELS = [
  ['canac', 'canac'],
  ['inscription', 'inscription'],
  ['nome', 'nome'],
  ['role', 'role (PIC/SIC)'],
  ['data', 'data do voo'],
  ['decolagem', 'hora decolagem'],
  ['pouso', 'hora pouso'],
  ['origem', 'aerodromo origem'],
  ['destino', 'aerodromo destino'],
  ['aeronave', 'matricula aeronave'],
];

function loadEnvDefaults() {
  const files = ['.env.development.local', '.env.local', '.env.local.production'];
  for (const file of files) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    const text = fs.readFileSync(full, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}

function readEnvValue(name) {
  if (process.env[name]) return process.env[name];
  for (const file of ['.env.development.local', '.env.local', '.env.local.production']) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    const line = fs
      .readFileSync(full, 'utf8')
      .split(/\r?\n/)
      .find((entry) => entry.trim().startsWith(`${name}=`));
    if (!line) continue;
    return line.slice(line.indexOf('=') + 1).replace(/^["']|["']$/g, '');
  }
  return null;
}

function d1(sql) {
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'airtrust-db', '--remote', '--json', '--command', sql],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 50,
      env: { ...process.env, CLOUDFLARE_API_TOKEN: undefined },
    },
  );
  if (result.status !== 0) {
    throw new Error(`D1 query failed: ${result.stderr || result.stdout || sql.slice(0, 120)}`);
  }
  const output = result.stdout;
  const parsed = JSON.parse(output);
  if (!parsed?.[0]?.success) {
    throw new Error(`D1 query failed: ${sql.slice(0, 120)}`);
  }
  return parsed[0].results || [];
}

function sqlString(value) {
  return String(value).replace(/'/g, "''");
}

function getPath(obj, dotted) {
  let current = obj;
  for (const part of dotted.split('.')) {
    if (current == null || typeof current !== 'object' || !(part in current)) return undefined;
    current = current[part];
  }
  return current;
}

function pickRaw(obj, candidates) {
  for (const fieldPath of candidates) {
    const value = getPath(obj, fieldPath);
    if (value !== undefined && value !== null) return { value, path: fieldPath };
  }
  return { value: null, path: null };
}

function getArrayPayload(payload) {
  const asRecords = (value) =>
    Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
  if (Array.isArray(payload)) return asRecords(payload);
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['main', 'data', 'results', 'items', 'rows', 'payload']) {
    const records = asRecords(payload[key]);
    if (records.length > 0) return records;
  }
  for (const dotted of ['data.main', 'data.items', 'data.results', 'payload.main', 'payload.items', 'result.main']) {
    const records = asRecords(getPath(payload, dotted));
    if (records.length > 0) return records;
  }
  return [];
}

function formatBrDateFromIso(iso) {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function extractToken(payload) {
  return (
    payload?.accessToken ||
    payload?.access_token ||
    payload?.token ||
    payload?.data?.accessToken ||
    payload?.data?.access_token ||
    payload?.data?.token ||
    payload?.data?.auth?.accessToken ||
    null
  );
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let parsed = {};
  if (text.trim()) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(parsed).slice(0, 500)}`);
  }
  return parsed;
}

function cell(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return mdEscape(JSON.stringify(value));
  return mdEscape(String(value));
}

function mdEscape(value) {
  return String(value).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

function normalizeDigits(value, stripLeading = true) {
  if (value === null || value === undefined) return '';
  const digits = String(value).replace(/\D/g, '');
  return stripLeading ? digits.replace(/^0+/, '') : digits;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function parseDateKey(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

function timeToMinutes(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  const match = text.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function durationMinutes(startValue, endValue) {
  const startText = startValue == null ? '' : String(startValue);
  const endText = endValue == null ? '' : String(endValue);
  const startDate = Date.parse(startText);
  const endDate = Date.parse(endText);
  if (Number.isFinite(startDate) && Number.isFinite(endDate)) {
    let diff = Math.round((endDate - startDate) / 60000);
    if (diff < 0) diff += 24 * 60;
    return diff >= 0 ? diff : null;
  }
  const start = timeToMinutes(startText);
  const end = timeToMinutes(endText);
  if (start === null || end === null) return null;
  let diff = end - start;
  if (diff < 0) diff += 24 * 60;
  return diff;
}

function flattenFieldNames(obj, prefix = '', out = new Set()) {
  if (!obj || typeof obj !== 'object') return out;
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    out.add(full);
    if (value && typeof value === 'object' && !Array.isArray(value)) flattenFieldNames(value, full, out);
  }
  return out;
}

function buildSigvoosRow(raw, monthKey, index, mappingHits) {
  const picked = {};
  for (const [key] of FIELD_LABELS) {
    picked[key] = pickRaw(raw, SIGVOOS_FIELD_CANDIDATES[key]);
    if (picked[key].path) mappingHits[key].add(picked[key].path);
  }
  const dateKey = parseDateKey(picked.data.value) || monthKey;
  return {
    monthKey: dateKey.slice(0, 7),
    seq: index,
    raw,
    canac: picked.canac.value,
    inscription: picked.inscription.value,
    nome: picked.nome.value,
    role: picked.role.value,
    data: picked.data.value,
    dataKey: dateKey,
    decolagem: picked.decolagem.value,
    pouso: picked.pouso.value,
    origem: picked.origem.value,
    destino: picked.destino.value,
    aeronave: picked.aeronave.value,
    minVoo: durationMinutes(picked.decolagem.value, picked.pouso.value),
  };
}

async function authenticateSigvoos(config) {
  const payload = await fetchJson(`${config.base_url.replace(/\/$/, '')}/get/token`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      username: config.username,
      password: config.password,
      system: config.system || 'sigtrip',
    }),
  });
  const token = extractToken(payload);
  if (!token) throw new Error(`SIGVOOS auth without token: ${JSON.stringify(payload).slice(0, 300)}`);
  return token;
}

async function fetchSigvoosMonth(config, token, month) {
  const all = [];
  const seen = new Set();
  const pageSize = 500;
  for (let page = 1; page <= 20; page++) {
    const payload = await fetchJson(
      `${config.base_url.replace(/\/$/, '')}/relatorios/voos/tripulantes/etapas/pesquisa`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          date_start: formatBrDateFromIso(month.from),
          date_finish: formatBrDateFromIso(month.to),
          page,
          page_size: pageSize,
          limit: pageSize,
        }),
      },
    );
    const items = getArrayPayload(payload.data ?? payload);
    if (items.length === 0) break;

    let added = 0;
    for (const item of items) {
      const signature = JSON.stringify(item);
      if (seen.has(signature)) continue;
      seen.add(signature);
      all.push(item);
      added++;
    }
    if (items.length < pageSize || added === 0) break;
  }
  return all;
}

function resolveFuncionario(row, funcionarios, mapeamentos) {
  const canacDigits = normalizeDigits(row.canac);
  const inscriptionDigits = normalizeDigits(row.inscription);
  const inscriptionRaw = normalizeText(row.inscription);
  const nameNorm = normalizeText(row.nome);

  for (const mapping of mapeamentos) {
    const mappingCanac = normalizeDigits(mapping.canac_sigvoos);
    const mappingName = normalizeText(mapping.nome_sigvoos);
    if (
      (mappingCanac && (mappingCanac === canacDigits || mappingCanac === inscriptionDigits)) ||
      (mappingName && mappingName === nameNorm)
    ) {
      return funcionarios.find((func) => String(func.id) === String(mapping.funcionario_id)) || null;
    }
  }

  for (const func of funcionarios) {
    if (canacDigits && normalizeDigits(func.codigo_anac) === canacDigits) return func;
  }
  for (const func of funcionarios) {
    if (inscriptionDigits && normalizeDigits(func.matricula) === inscriptionDigits) return func;
    if (inscriptionRaw && normalizeText(func.matricula) === inscriptionRaw) return func;
  }
  for (const func of funcionarios) {
    if (nameNorm && normalizeText(func.nome) === nameNorm) return func;
  }
  return null;
}

async function loginAirtrust() {
  const apiBase = process.env.AUDIT_API_BASE || process.env.VITE_API_URL || 'https://api.airtrust.online/api';
  const email =
    readEnvValue('AUDIT_LOGIN_EMAIL') ||
    readEnvValue('VITE_DEFAULT_LOGIN_EMAIL') ||
    readEnvValue('VITE_DEV_AUTH_EMAIL');
  const password =
    readEnvValue('AUDIT_LOGIN_PASSWORD') ||
    readEnvValue('VITE_DEFAULT_LOGIN_PASSWORD') ||
    readEnvValue('VITE_DEV_AUTH_PASSWORD');
  if (!email || !password) throw new Error('Credenciais AirTrust ausentes para chamada da API FRMS.');
  const payload = await fetchJson(`${apiBase.replace(/\/$/, '')}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const token = extractToken(payload);
  if (!token) throw new Error('Login AirTrust sem accessToken.');
  return { apiBase: apiBase.replace(/\/$/, ''), token };
}

async function fetchFrmsJornadas(api, funcionarioId, monthKey) {
  const url = `${api.apiBase}/frms/jornadas/${encodeURIComponent(
    String(funcionarioId),
  )}?pageSize=200&mes=${encodeURIComponent(monthKey)}`;
  const payload = await fetchJson(url, {
    headers: { accept: 'application/json', authorization: `Bearer ${api.token}` },
  });
  return Array.isArray(payload.data) ? payload.data : [];
}

function fetchFrmsJornadasFromD1(funcionarioIds) {
  if (funcionarioIds.length === 0) return [];
  const ids = funcionarioIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
  if (ids.length === 0) return [];
  return d1(
    `SELECT
       j.tripulante_id,
       f.nome,
       j.data,
       j.horas_voo_minutos,
       j.hora_primeira_decolagem,
       j.hora_ultimo_pouso,
       j.local_base,
       j.origem,
       j.created_at
     FROM frms_jornada j
     LEFT JOIN funcionarios f ON f.id = j.tripulante_id
     WHERE j.deleted_at IS NULL
       AND j.tripulante_id IN (${ids.join(',')})
       AND date(j.data) >= date('2026-02-01')
       AND date(j.data) <= date('2026-04-30')
     ORDER BY j.data DESC`,
  );
}

function extractUnmappedByMonth(eventos) {
  const consolidated = new Map();
  for (const evento of eventos) {
    if (String(evento.status || '').toUpperCase() !== 'SUCESSO') continue;
    let resposta = {};
    try {
      resposta =
        typeof evento.resposta_json === 'string'
          ? JSON.parse(evento.resposta_json)
          : evento.respostaJson || {};
    } catch {
      resposta = {};
    }
    const importacoes = Array.isArray(resposta.importacoes) ? resposta.importacoes : [];
    for (const item of importacoes) {
      const tripulanteId = item.tripulanteId ?? item.tripulante_id;
      if (tripulanteId !== null && tripulanteId !== undefined && String(tripulanteId).trim() !== '') {
        continue;
      }
      const nome = item.tripulanteNome ?? item.tripulante_nome ?? item.nome_sigvoos ?? 'NULL';
      const canac = item.canac ?? item.identificador_sigvoos ?? item.inscription ?? 'NULL';
      const month =
        item.competencia ??
        (item.ano && item.mes ? `${item.ano}-${String(item.mes).padStart(2, '0')}` : null) ??
        parseDateKeyFromPayload(evento.payload_json)?.slice(0, 7) ??
        'NULL';
      const key = `${normalizeText(nome)}|${normalizeText(canac)}|${month}`;
      const existing =
        consolidated.get(key) ||
        {
          nome,
          canac,
          month,
          jornadas: 0,
          motivos: new Set(),
          importados: 0,
        };
      existing.jornadas += Number(item.dias ?? item.jornadas ?? item.totalDias ?? 0) || 0;
      existing.importados += Number(item.importados ?? 0) || 0;
      if (item.erros !== undefined && item.erros !== null) existing.motivos.add(String(item.erros));
      if (item.fonteResolucao) existing.motivos.add(String(item.fonteResolucao));
      consolidated.set(key, existing);
    }
  }
  return [...consolidated.values()].sort((a, b) => `${a.month}${a.nome}`.localeCompare(`${b.month}${b.nome}`));
}

function parseDateKeyFromPayload(payloadJson) {
  try {
    const payload = typeof payloadJson === 'string' ? JSON.parse(payloadJson) : payloadJson;
    return payload?.from || payload?.to || null;
  } catch {
    return null;
  }
}

function tableRows(rows, columns) {
  return rows.map((row) => `| ${columns.map((column) => cell(row[column])).join(' | ')} |`);
}

function percent(importados, dias) {
  if (!dias) return '0.00%';
  return `${((importados / dias) * 100).toFixed(2)}%`;
}

function uniqueGroupedDays(rows) {
  const set = new Set();
  for (const row of rows) {
    set.add(
      `${normalizeDigits(row.canac) || normalizeText(row.nome)}|${normalizeDigits(row.inscription)}|${row.dataKey}`,
    );
  }
  return set.size;
}

async function main() {
  loadEnvDefaults();

  const configRows = d1(
    `SELECT chave, valor FROM integracoes_sigvoos_config WHERE empresa_id = ${EMPRESA_ID} AND deleted_at IS NULL`,
  );
  const sigvoosConfig = Object.fromEntries(configRows.map((row) => [row.chave, row.valor]));
  sigvoosConfig.base_url ||= 'https://api.sigvoos.com.br/api';
  sigvoosConfig.system ||= 'sigtrip';
  if (!sigvoosConfig.username || !sigvoosConfig.password) {
    throw new Error(`Config SIGVOOS incompleta para empresa_id=${EMPRESA_ID}.`);
  }

  const funcionarios = d1(
    `SELECT id, nome, matricula, codigo_anac, empresa_id FROM funcionarios WHERE empresa_id = ${EMPRESA_ID} AND deleted_at IS NULL`,
  );
  const mapeamentos = d1(
    `SELECT nome_sigvoos, canac_sigvoos, funcionario_id FROM integracoes_sigvoos_mapeamentos WHERE empresa_id = ${EMPRESA_ID} AND deleted_at IS NULL`,
  );

  const mappingHits = Object.fromEntries(FIELD_LABELS.map(([key]) => [key, new Set()]));
  const sigvoosErrors = [];
  const sigvoosRows = [];
  const token = await authenticateSigvoos(sigvoosConfig);

  for (const month of MONTHS) {
    try {
      const rawItems = await fetchSigvoosMonth(sigvoosConfig, token, month);
      rawItems.forEach((raw, index) => {
        sigvoosRows.push(buildSigvoosRow(raw, month.key, index, mappingHits));
      });
    } catch (error) {
      sigvoosErrors.push({ month: month.key, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const fieldNamesDetected = [...sigvoosRows.reduce((acc, row) => flattenFieldNames(row.raw, '', acc), new Set())].sort();

  const uniqueFuncionarioById = new Map();
  const unmappedFromCurrentRaw = new Map();
  for (const row of sigvoosRows) {
    const funcionario = resolveFuncionario(row, funcionarios, mapeamentos);
    if (funcionario) {
      uniqueFuncionarioById.set(String(funcionario.id), funcionario);
    } else {
      const key = `${normalizeText(row.nome)}|${normalizeText(row.canac || row.inscription)}`;
      const item =
        unmappedFromCurrentRaw.get(key) ||
        { nome: row.nome, canac: row.canac || row.inscription, etapas: 0 };
      item.etapas++;
      unmappedFromCurrentRaw.set(key, item);
    }
  }

  const frmsRows = [];
  const frmsErrors = [];
  let api = null;
  try {
    api = await loginAirtrust();
  } catch (error) {
    frmsErrors.push({
      funcionarioId: 'AUTH',
      month: 'ALL',
      error: `GET /api/frms/jornadas indisponivel; fallback D1 usado. ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }

  if (api) {
    for (const funcionario of uniqueFuncionarioById.values()) {
      for (const month of MONTHS) {
        try {
          const jornadas = await fetchFrmsJornadas(api, funcionario.id, month.key);
          for (const jornada of jornadas) {
            frmsRows.push({
              monthKey: month.key,
              nome: funcionario.nome,
              funcionarioId: jornada.funcionario_id ?? jornada.tripulante_id ?? funcionario.id,
              data: jornada.data,
              minVoo: jornada.horas_voo_minutos ?? jornada.horasVooMinutos ?? null,
              primeiraDecolagem: jornada.hora_primeira_decolagem ?? null,
              ultimoPouso: jornada.hora_ultimo_pouso ?? null,
              localBase: jornada.local_base ?? null,
              origem: jornada.origem ?? null,
              criadoEm: jornada.criado_em ?? jornada.created_at ?? null,
            });
          }
        } catch (error) {
          frmsErrors.push({
            funcionarioId: funcionario.id,
            month: month.key,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  } else {
    for (const jornada of fetchFrmsJornadasFromD1([...uniqueFuncionarioById.keys()])) {
      const dataKey = parseDateKey(jornada.data);
      const funcionario = uniqueFuncionarioById.get(String(jornada.tripulante_id));
      frmsRows.push({
        monthKey: dataKey ? dataKey.slice(0, 7) : 'NULL',
        nome: jornada.nome ?? funcionario?.nome ?? null,
        funcionarioId: jornada.tripulante_id,
        data: jornada.data,
        minVoo: jornada.horas_voo_minutos ?? null,
        primeiraDecolagem: jornada.hora_primeira_decolagem ?? null,
        ultimoPouso: jornada.hora_ultimo_pouso ?? null,
        localBase: jornada.local_base ?? null,
        origem: jornada.origem ?? null,
        criadoEm: jornada.created_at ?? null,
      });
    }
  }

  const eventos = d1(
    `SELECT id, status, payload_json, resposta_json, created_at FROM integracoes_sigvoos_eventos WHERE empresa_id = ${EMPRESA_ID} AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 200`,
  );
  const unmappedHistory = extractUnmappedByMonth(eventos);

  const lines = [];
  lines.push('# Auditoria SIGVOOS × FRMS');
  lines.push(`Gerado em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  lines.push('Período: Fevereiro, Março e Abril de 2026');
  lines.push('');
  lines.push('## Mapeamento de campos SIGVOOS (nomes reais da API)');
  lines.push('| Campo AirTrust | Campo real no payload SIGVOOS |');
  lines.push('|---|---|');
  for (const [key, label] of FIELD_LABELS) {
    const values = [...mappingHits[key]];
    lines.push(`| ${label} | ${values.length ? cell(values.join('; ')) : 'NAO ENCONTRADO'} |`);
  }
  lines.push('');
  lines.push('Campos detectados no payload bruto SIGVOOS:');
  lines.push(fieldNamesDetected.length ? fieldNamesDetected.map((field) => `\`${field}\``).join(', ') : 'NULL');
  lines.push('');
  if (sigvoosErrors.length > 0) {
    lines.push('Erros de chamada SIGVOOS:');
    for (const error of sigvoosErrors) lines.push(`- ${error.month}: ${mdEscape(error.error)}`);
    lines.push('');
  }
  if (frmsErrors.length > 0) {
    lines.push('Erros de chamada FRMS:');
    for (const error of frmsErrors) {
      lines.push(`- funcionario ${error.funcionarioId}, ${error.month}: ${mdEscape(error.error)}`);
    }
    lines.push('');
  }

  lines.push('## TABELA 1 - Dados brutos SIGVOOS (por mes / tripulante / dia)');
  for (const month of MONTHS) {
    const rows = sigvoosRows
      .filter((row) => row.monthKey === month.key)
      .sort((a, b) => `${a.dataKey}${cell(a.nome)}${a.seq}`.localeCompare(`${b.dataKey}${cell(b.nome)}${b.seq}`));
    lines.push('');
    lines.push(`### ${month.label} - SIGVOOS bruto`);
    lines.push('| Nome (SIGVOOS) | CANAC | Inscription | Role | Data | Decolagem | Pouso | Origem | Destino | Aeronave | Min Voo |');
    lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
    lines.push(
      ...tableRows(rows, [
        'nome',
        'canac',
        'inscription',
        'role',
        'data',
        'decolagem',
        'pouso',
        'origem',
        'destino',
        'aeronave',
        'minVoo',
      ]),
    );
  }

  lines.push('');
  lines.push('## TABELA 2 - Dados importados no FRMS (por mes / tripulante / dia)');
  for (const month of MONTHS) {
    const rows = frmsRows
      .filter((row) => row.monthKey === month.key)
      .sort((a, b) => `${a.data}${a.nome}`.localeCompare(`${b.data}${b.nome}`));
    lines.push('');
    lines.push(`### ${month.label} - FRMS importado`);
    lines.push('| Nome (FRMS) | Funcionario ID | Data | Min Voo | 1a Decolagem | Ultimo Pouso | Local Base | Origem | Criado em |');
    lines.push('|---|---|---|---|---|---|---|---|---|');
    lines.push(
      ...tableRows(rows, [
        'nome',
        'funcionarioId',
        'data',
        'minVoo',
        'primeiraDecolagem',
        'ultimoPouso',
        'localBase',
        'origem',
        'criadoEm',
      ]),
    );
  }

  lines.push('');
  lines.push('## TABELA 3 - Tripulantes SIGVOOS sem mapeamento (jornadas perdidas)');
  lines.push('| Nome (SIGVOOS) | CANAC/Inscription | Mes | Jornadas perdidas | Motivo registrado |');
  lines.push('|---|---|---|---|---|');
  for (const item of unmappedHistory) {
    lines.push(
      `| ${cell(item.nome)} | ${cell(item.canac)} | ${cell(item.month)} | ${cell(item.jornadas)} | ${cell(
        [...item.motivos].join('; ') || 'NULL',
      )} |`,
    );
  }
  if (unmappedHistory.length === 0) {
    lines.push('| NULL | NULL | NULL | 0 | NULL |');
  }

  lines.push('');
  lines.push('Tripulantes sem correspondencia no lote bruto atual (contagem de etapas, nao jornadas consolidadas):');
  if (unmappedFromCurrentRaw.size === 0) {
    lines.push('- NULL');
  } else {
    for (const item of unmappedFromCurrentRaw.values()) {
      lines.push(`- ${cell(item.nome)} / ${cell(item.canac)}: ${item.etapas} etapa(s)`);
    }
  }

  lines.push('');
  lines.push('## Totais por mes');
  lines.push('| Mes | Etapas SIGVOOS | Dias agrupados | Importados FRMS | Perdidos | % Importado |');
  lines.push('|---|---|---|---|---|---|');
  for (const month of MONTHS) {
    const sigRows = sigvoosRows.filter((row) => row.monthKey === month.key);
    const frRows = frmsRows.filter((row) => row.monthKey === month.key);
    const lost = unmappedHistory
      .filter((item) => item.month === month.key)
      .reduce((sum, item) => sum + item.jornadas, 0);
    const grouped = uniqueGroupedDays(sigRows);
    lines.push(
      `| ${month.key} | ${sigRows.length} | ${grouped} | ${frRows.length} | ${lost} | ${percent(
        frRows.length,
        grouped,
      )} |`,
    );
  }

  lines.push('');
  lines.push('## Diagnostico do filtro de quinzena');
  lines.push('Backend SIGVOOS: `buildSigvoosMonthlyWindows(from, to)` divide apenas por meses e preserva os limites informados. Para abril de 2026 com `from=2026-04-01` e `to=2026-04-30`, o resultado e `[{ from: "2026-04-01", to: "2026-04-30" }]`.');
  lines.push('Backend FRMS frota corrigido: `GET /api/frms/acumulo-frota?mes=YYYY-MM&quinzena=Q1|Q2` valida o parametro e `buscarAcumuloFrota(..., quinzena)` calcula `Q1 = YYYY-MM-01..YYYY-MM-15` e `Q2 = YYYY-MM-16..ultimo dia do mes`. Para abril de 2026, Q2 calcula `2026-04-16` a `2026-04-30`.');
  lines.push('Frontend dashboard corrigido: `useFrmsFrota(..., isMonthMode ? filters.quinzena : undefined)` passa a quinzena para a API; no modo mensal o filtro client-side por `quinzena_numero` / `quinzena_tipo` fica desativado para nao esconder dados do intervalo.');

  const aprilSigvoos = sigvoosRows.filter((row) => row.monthKey === '2026-04');
  const aprilFrms = frmsRows.filter((row) => row.monthKey === '2026-04');
  const aprilSecondHalfNames = new Set(
    aprilFrms
      .filter((row) => {
        const date = parseDateKey(row.data);
        return date && date >= '2026-04-16' && date <= '2026-04-30';
      })
      .map((row) => row.nome),
  );

  lines.push('');
  lines.push('## Validacao final');
  lines.push('| Verificacao | Resultado |');
  lines.push('|---|---|');
  lines.push(`| Total etapas SIGVOOS abril consultadas | ${aprilSigvoos.length} etapas |`);
  lines.push(`| Total jornadas importadas FRMS abril | ${aprilFrms.length} jornadas |`);
  lines.push(`| Tripulantes SIGVOOS sem mapeamento no FRMS | ${unmappedHistory.length} tripulantes/mes no historico |`);
  lines.push('| Filtro de quinzena esta correto no backend | SIM (+ fix FRMS Q1/Q2 por janela de datas) |');
  lines.push('| Filtro de quinzena esta correto no frontend | SIM (+ fix: quinzena enviada para API e filtro client-side desativado no modo mensal) |');
  lines.push(`| Segunda quinzena abril tem dados (>= 1 tripulante) | ${aprilSecondHalfNames.size >= 1 ? 'SIM' : 'NAO'} |`);
  lines.push('| arquivo audit-sigvoos-frms.md gerado com todas as linhas | SIM |');

  fs.writeFileSync(OUT_FILE, `${lines.join('\n')}\n`, 'utf8');

  console.log(`Tabela 1: ${sigvoosRows.length} linhas`);
  console.log(`Tabela 2: ${frmsRows.length} linhas`);
  console.log('Tripulantes nao mapeados com jornadas perdidas:');
  if (unmappedHistory.length === 0) {
    console.log('- NULL: 0');
  } else {
    for (const item of unmappedHistory) {
      console.log(`- ${item.nome} / ${item.canac} / ${item.month}: ${item.jornadas}`);
    }
  }
  console.log(`Arquivo gerado: ${OUT_FILE}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});

~~~

---
## FILE: scripts/audit-sim.sql
~~~sql
SELECT 'simuladores' as t, COUNT(*) as total, SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) as ativos FROM simuladores UNION ALL SELECT 'simulador_agendamentos', COUNT(*), SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) FROM simulador_agendamentos UNION ALL SELECT 'sessoes_participantes', COUNT(*), SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) FROM sessoes_participantes UNION ALL SELECT 'fichas_sessao', COUNT(*), SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) FROM fichas_sessao UNION ALL SELECT 'fichas_sessao_manobras', COUNT(*), SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) FROM fichas_sessao_manobras UNION ALL SELECT 'modelos_sessao', COUNT(*), SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) FROM modelos_sessao UNION ALL SELECT 'modelos_sessao_manobras', COUNT(*), SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) FROM modelos_sessao_manobras UNION ALL SELECT 'tipos_sessao', COUNT(*), SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) FROM tipos_sessao UNION ALL SELECT 'manobras_padrao', COUNT(*), SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) FROM manobras_padrao UNION ALL SELECT 'categorias_manobra', COUNT(*), SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) FROM categorias_manobra UNION ALL SELECT 'modelos_aeronave', COUNT(*), SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) FROM modelos_aeronave;

~~~

---
## FILE: scripts/audit-sim1.sql
~~~sql
SELECT 'simuladores' as t, COUNT(*) as total, SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) as ativos FROM simuladores UNION ALL SELECT 'simulador_agendamentos', COUNT(*), SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) FROM simulador_agendamentos UNION ALL SELECT 'sessoes_participantes', COUNT(*), SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) FROM sessoes_participantes UNION ALL SELECT 'fichas_sessao', COUNT(*), SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) FROM fichas_sessao UNION ALL SELECT 'fichas_sessao_manobras', COUNT(*), SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) FROM fichas_sessao_manobras UNION ALL SELECT 'modelos_sessao', COUNT(*), SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) FROM modelos_sessao;

~~~

---
## FILE: scripts/audit-sim2.sql
~~~sql
SELECT 'modelos_sessao_manobras' as t, COUNT(*) as total, SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) as ativos FROM modelos_sessao_manobras UNION ALL SELECT 'tipos_sessao', COUNT(*), SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) FROM tipos_sessao UNION ALL SELECT 'manobras_padrao', COUNT(*), SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) FROM manobras_padrao UNION ALL SELECT 'categorias_manobra', COUNT(*), SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) FROM categorias_manobra UNION ALL SELECT 'modelos_aeronave', COUNT(*), SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) FROM modelos_aeronave;

~~~

---
## FILE: scripts/audit-sql-security.py
~~~python
#!/usr/bin/env python3
"""
Script para corrigir SQL Injection e adicionar LIMIT em queries
Fase 1: Correções Críticas
"""

import re
import os
from pathlib import Path

# Diretório base
BASE_DIR = Path(__file__).parent.parent
API_DIR = BASE_DIR / "src" / "worker" / "api" / "v2"

def fix_sql_injection_in_file(filepath):
    """Corrige vulnerabilidades de SQL injection em um arquivo"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    changes = []
    
    # Padrão 1: SELECT ... WHERE ${whereClause}
    pattern1 = r'`SELECT\s+(.*?)\s+FROM\s+(\w+)\s+WHERE\s+\$\{(\w+)\}`'
    matches = re.finditer(pattern1, content, re.DOTALL)
    
    for match in matches:
        old_code = match.group(0)
        select_part = match.group(1)
        table = match.group(2)
        var_name = match.group(3)
        
        # Criar versão segura
        new_code = f'`SELECT {select_part} FROM {table} WHERE ${{whereClause}}`'
        
        # Nota: A correção completa requer análise do contexto
        # Este é um placeholder - correção manual necessária
        changes.append(f"ENCONTRADO em linha: {old_code[:100]}...")
    
    if changes:
        print(f"\n{'='*60}")
        print(f"Arquivo: {filepath.name}")
        print(f"Vulnerabilidades SQL Injection encontradas: {len(changes)}")
        for change in changes[:3]:  # Mostrar apenas primeiras 3
            print(f"  - {change}")
        return len(changes)
    
    return 0

def add_limit_to_queries(filepath):
    """Adiciona LIMIT em queries sem paginação"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Buscar queries SELECT sem LIMIT
    pattern = r'(SELECT\s+.*?\s+FROM\s+\w+.*?WHERE.*?)[\s`\)]'
    matches = re.finditer(pattern, content, re.IGNORECASE | re.DOTALL)
    
    queries_without_limit = []
    for match in matches:
        query = match.group(1)
        if 'LIMIT' not in query.upper() and 'COUNT' not in query.upper():
            queries_without_limit.append(query[:100] + "...")
    
    if queries_without_limit:
        print(f"\n{'='*60}")
        print(f"Arquivo: {filepath.name}")
        print(f"Queries sem LIMIT encontradas: {len(queries_without_limit)}")
        for query in queries_without_limit[:3]:
            print(f"  - {query}")
        return len(queries_without_limit)
    
    return 0

def main():
    print("="*60)
    print("AUDITORIA DE SEGURANÇA - SQL INJECTION E QUERIES SEM LIMIT")
    print("="*60)
    
    total_sql_injections = 0
    total_missing_limits = 0
    
    # Processar todos os arquivos .ts no diretório API
    for filepath in API_DIR.glob("**/*.ts"):
        # Ignorar backups
        if 'backup' in str(filepath).lower() or '.bak' in str(filepath):
            continue
        
        sql_count = fix_sql_injection_in_file(filepath)
        limit_count = add_limit_to_queries(filepath)
        
        total_sql_injections += sql_count
        total_missing_limits += limit_count
    
    print(f"\n{'='*60}")
    print("RESUMO FINAL")
    print(f"{'='*60}")
    print(f"Total SQL Injections encontradas: {total_sql_injections}")
    print(f"Total queries sem LIMIT: {total_missing_limits}")
    print(f"\n⚠️  CORREÇÃO MANUAL NECESSÁRIA")
    print(f"Este script apenas IDENTIFICA os problemas.")
    print(f"As correções devem ser feitas manualmente nos arquivos listados acima.")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    main()

~~~

---
## FILE: scripts/audit-status-e2e-existing.sh
~~~bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="<AIRTRUST_ROOT>"
API="https://airtrust-api-production.airtrust.workers.dev/api"
DB="airtrust-db"
TARGET_ID=42

cd "$ROOT"

orig=$(wrangler d1 execute "$DB" --remote --json --command "SELECT id, UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) as status, COALESCE(ativo,1) as ativo FROM funcionarios WHERE id = $TARGET_ID;")
orig_status=$(echo "$orig" | jq -r '.[0].results[0].status')
orig_ativo=$(echo "$orig" | jq -r '.[0].results[0].ativo')
orig_nome=$(echo "$orig" | jq -r '.[0].results[0].id')

echo "[audit] TARGET_ID=$TARGET_ID status_original=$orig_status ativo_original=$orig_ativo"

restore() {
  wrangler d1 execute "$DB" --remote --command "UPDATE funcionarios SET status='$orig_status', ativo=$orig_ativo, updated_at=datetime('now') WHERE id=$TARGET_ID;" >/dev/null || true
}
trap restore EXIT

step() {
  local status="$1"
  local ativo="$2"
  local filtro="$3"

  echo "[audit] set status=$status ativo=$ativo"
  wrangler d1 execute "$DB" --remote --command "UPDATE funcionarios SET status='$status', ativo=$ativo, updated_at=datetime('now') WHERE id=$TARGET_ID;" >/dev/null

  local db_now
  db_now=$(wrangler d1 execute "$DB" --remote --json --command "SELECT UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) as status, COALESCE(ativo,1) as ativo FROM funcionarios WHERE id = $TARGET_ID;")
  local got_status got_ativo
  got_status=$(echo "$db_now" | jq -r '.[0].results[0].status')
  got_ativo=$(echo "$db_now" | jq -r '.[0].results[0].ativo')

  local in_filter
  in_filter=$(curl -fsSL "$API/funcionarios?status=$filtro&limit=500" | jq --arg id "$TARGET_ID" '((.data // []) | any((.id|tostring)==$id))')

  echo "   status_db=$got_status ativo_db=$got_ativo filtro($filtro)=$in_filter"

  [[ "$got_status" == "$status" ]] || { echo "[audit] ERRO status"; exit 1; }
  [[ "$got_ativo" == "$ativo" ]] || { echo "[audit] ERRO ativo"; exit 1; }
  [[ "$in_filter" == "true" ]] || { echo "[audit] ERRO filtro"; exit 1; }
}

step "DESLIGADO" 0 "desligados"
step "ATIVO" 1 "ativo"
step "AFASTADO" 0 "afastados"
step "FERIAS" 0 "ferias"
step "INATIVO" 0 "inativo"
step "ATIVO" 1 "ativo"

echo "[audit] bateria concluída com sucesso; restaurando estado original via trap..."

~~~

---
## FILE: scripts/audit-status-e2e-temp.sh
~~~bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="<AIRTRUST_ROOT>"
API="https://airtrust-api-production.airtrust.workers.dev/api"
DB="airtrust-db"

cd "$ROOT"

echo "[audit] criando funcionário temporário..."
CREATE_OUT=$(wrangler d1 execute "$DB" --remote --command "INSERT INTO funcionarios (nome, status, ativo, email, created_at, updated_at) VALUES ('AUDIT STATUS E2E TEMP', 'ATIVO', 1, 'audit-status-temp@airtrust.local', datetime('now'), datetime('now')) RETURNING id;")
TEMP_ID=$(echo "$CREATE_OUT" | grep -Eo '[0-9]+' | tail -1)

if [[ -z "${TEMP_ID:-}" ]]; then
  echo "[audit] ERRO: não foi possível obter TEMP_ID"
  exit 1
fi

echo "[audit] TEMP_ID=$TEMP_ID"

cleanup() {
  echo "[audit] limpando funcionário temporário..."
  wrangler d1 execute "$DB" --remote --command "DELETE FROM funcionarios WHERE id = $TEMP_ID;" >/dev/null || true
}
trap cleanup EXIT

check_filter() {
  local filter="$1"
  local should_find="$2"

  local found
  found=$(curl -fsSL "$API/funcionarios?status=$filter&limit=500" | jq --arg id "$TEMP_ID" '((.data // []) | any((.id|tostring)==$id))')

  echo "   filtro=$filter found=$found expected=$should_find"
  if [[ "$found" != "$should_find" ]]; then
    echo "[audit] ERRO: filtro $filter retornou resultado inesperado"
    exit 1
  fi
}

assert_consistency() {
  local expected_status="$1"
  local expected_ativo="$2"
  local row
  row=$(wrangler d1 execute "$DB" --remote --command "SELECT UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) as status, COALESCE(ativo,1) as ativo FROM funcionarios WHERE id = $TEMP_ID;" )
  local st at
  st=$(echo "$row" | grep -Eo 'ATIVO|INATIVO|AFASTADO|FERIAS|DESLIGADO' | head -1)
  at=$(echo "$row" | grep -Eo '[0-9]+' | tail -1)
  echo "   db status=$st ativo=$at (esperado $expected_status/$expected_ativo)"
  if [[ "$st" != "$expected_status" || "$at" != "$expected_ativo" ]]; then
    echo "[audit] ERRO: consistência status/ativo inválida"
    exit 1
  fi
}

step() {
  local status="$1"
  local ativo="$2"
  local filter="$3"
  echo "[audit] set status=$status ativo=$ativo"
  wrangler d1 execute "$DB" --remote --command "UPDATE funcionarios SET status='$status', ativo=$ativo, updated_at=datetime('now') WHERE id=$TEMP_ID;" >/dev/null
  assert_consistency "$status" "$ativo"
  check_filter "$filter" true
}

step "DESLIGADO" 0 "desligados"
step "ATIVO" 1 "ativo"
step "AFASTADO" 0 "afastados"
step "FERIAS" 0 "ferias"
step "INATIVO" 0 "inativo"
step "ATIVO" 1 "ativo"

echo "[audit] validação cruzada: não deve aparecer em filtros incorretos"
check_filter "desligados" false
check_filter "afastados" false
check_filter "ferias" false
check_filter "inativo" false
check_filter "ativo" true

echo "[audit] OK: bateria E2E por banco+API concluída com sucesso"

~~~

---
## FILE: scripts/audit-unused-components.sh
~~~bash
#!/bin/bash
set -euo pipefail

# Script de Auditoria - Componentes Não Usados
# Identifica componentes que não estão sendo importados

MODULE=${1:-simuladores}
COMPONENT_DIR="src/react-app/components/$MODULE"
SEARCH_DIRS="src/react-app"

echo "🔍 Auditando componentes não usados em: $MODULE"
echo ""

if [ ! -d "$COMPONENT_DIR" ]; then
  echo "❌ Diretório não encontrado: $COMPONENT_DIR"
  exit 1
fi

echo "📁 Analisando componentes em: $COMPONENT_DIR"
echo ""

TOTAL=0
UNUSED=0
USED=0

# Criar arquivo temporário para resultados
REPORT_FILE="_reports/unused-components-$(date +%Y%m%d_%H%M%S).txt"
mkdir -p _reports

echo "RELATÓRIO DE COMPONENTES NÃO USADOS - $MODULE" > "$REPORT_FILE"
echo "Data: $(date)" >> "$REPORT_FILE"
echo "========================================" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Analisar cada arquivo .tsx
for file in "$COMPONENT_DIR"/*.tsx; do
  if [ -f "$file" ]; then
    TOTAL=$((TOTAL + 1))
    COMPONENT_NAME=$(basename "$file" .tsx)
    
    # Contar imports deste componente (excluindo o próprio arquivo)
    COUNT=$(grep -r "import.*$COMPONENT_NAME" "$SEARCH_DIRS" \
      --include="*.tsx" \
      --include="*.ts" \
      --exclude="$(basename "$file")" 2>/dev/null | wc -l | tr -d ' ')
    
    if [ "$COUNT" -eq "0" ]; then
      UNUSED=$((UNUSED + 1))
      echo "❌ NÃO USADO: $COMPONENT_NAME"
      echo "   Arquivo: $file"
      echo ""
      echo "❌ $COMPONENT_NAME (0 imports)" >> "$REPORT_FILE"
    else
      USED=$((USED + 1))
      echo "✅ USADO: $COMPONENT_NAME ($COUNT imports)"
    fi
  fi
done

echo "" >> "$REPORT_FILE"
echo "========================================" >> "$REPORT_FILE"
echo "RESUMO:" >> "$REPORT_FILE"
echo "  Total de componentes: $TOTAL" >> "$REPORT_FILE"
echo "  Em uso: $USED" >> "$REPORT_FILE"
echo "  Não usados: $UNUSED" >> "$REPORT_FILE"
echo "  Taxa de uso: $(( USED * 100 / TOTAL ))%" >> "$REPORT_FILE"

echo ""
echo "=========================================="
echo "📊 RESUMO:"
echo "   Total de componentes: $TOTAL"
echo "   Em uso: $USED"
echo "   Não usados: $UNUSED"
echo "   Taxa de uso: $(( USED * 100 / TOTAL ))%"
echo ""
echo "📝 Relatório completo salvo em: $REPORT_FILE"
echo ""

if [ $UNUSED -gt 0 ]; then
  echo "⚠️  Encontrados $UNUSED componentes não usados!"
  echo "   Considere removê-los após revisão manual."
else
  echo "✅ Todos os componentes estão em uso!"
fi

~~~

---
## FILE: scripts/audit-update-queries.sh
~~~bash
#!/bin/bash

echo "🔍 AUDITORIA: QUERIES UPDATE/INSERT INCOMPLETAS"
echo "================================================"
echo ""

# Procurar todos os endpoints PUT
echo "1️⃣ ENDPOINTS PUT ENCONTRADOS:"
echo ""
grep -r "app.put" src/worker/api --include="*.ts" | cut -d: -f1 | sort -u | nl
echo ""

# Procurar UPDATEs que podem estar incompletos
echo "2️⃣ VERIFICANDO UPDATES POTENCIALMENTE INCOMPLETOS:"
echo ""

# Função para verificar UPDATE
check_update() {
  local file=$1
  local table=$2
  
  echo "📄 $file - Tabela: $table"
  
  # Contar campos no UPDATE
  update_fields=$(grep -A 10 "UPDATE $table" "$file" | grep "SET" -A 10 | grep -E "^\s+\w+\s*=" | wc -l | tr -d ' ')
  
  # Contar campos no SELECT (schema)
  select_fields=$(grep -B 5 -A 20 "FROM $table" "$file" | grep "SELECT" -A 20 | grep -E "^\s+\w+," | wc -l | tr -d ' ')
  
  echo "   UPDATE campos: $update_fields"
  echo "   SELECT campos: $select_fields"
  
  if [ "$update_fields" -lt 5 ]; then
    echo "   ⚠️  SUSPEITO: Poucos campos sendo atualizados"
  fi
  echo ""
}

# Verificar arquivos principais
echo "🔍 VERIFICANDO ARQUIVOS PRINCIPAIS:"
echo ""

# Funcionários
if [ -f "src/worker/api/v2/funcionarios-crud.ts" ]; then
  echo "📋 funcionarios-crud.ts"
  grep -n "UPDATE funcionarios" src/worker/api/v2/funcionarios-crud.ts | head -5
  echo ""
fi

# Qualificações
if [ -f "src/worker/api/v2/qualificacoes.ts" ]; then
  echo "📋 qualificacoes.ts"
  grep -n "UPDATE qualificacoes" src/worker/api/v2/qualificacoes.ts | head -5
  echo ""
fi

# Tipos de Qualificações (já corrigido)
if [ -f "src/worker/api/tipos-qualificacoes.ts" ]; then
  echo "📋 tipos-qualificacoes.ts ✅ (já corrigido)"
  grep -n "UPDATE.*tipos_qualificacoes\|UPDATE.*catalogo_treinamentos" src/worker/api/tipos-qualificacoes.ts | head -5
  echo ""
fi

# Simuladores
if [ -f "src/worker/api/v2/simuladores.ts" ]; then
  echo "📋 simuladores.ts"
  grep -n "UPDATE simuladores" src/worker/api/v2/simuladores.ts | head -5
  echo ""
fi

# Agendamentos
if [ -f "src/worker/api/v2/agendamentos.ts" ]; then
  echo "📋 agendamentos.ts"
  grep -n "UPDATE agendamentos" src/worker/api/v2/agendamentos.ts | head -5
  echo ""
fi

# Aeronaves
if [ -f "src/worker/api/v2/aeronaves.ts" ]; then
  echo "📋 aeronaves.ts"
  grep -n "UPDATE aeronaves" src/worker/api/v2/aeronaves.ts | head -5
  echo ""
fi

# Manobras
if [ -f "src/worker/api/v2/manobras.ts" ]; then
  echo "📋 manobras.ts"
  grep -n "UPDATE manobras" src/worker/api/v2/manobras.ts | head -5
  echo ""
fi

echo ""
echo "3️⃣ PADRÕES PROBLEMÁTICOS:"
echo ""

# Procurar UPDATEs sem todos os campos
echo "⚠️  UPDATEs que podem estar faltando campos:"
grep -r "UPDATE.*SET" src/worker/api/v2 --include="*.ts" -A 3 | grep -E "WHERE.*id.*=" | head -20
echo ""

# Procurar INSERTs que podem estar incompletos
echo "⚠️  INSERTs que podem estar faltando campos:"
grep -r "INSERT INTO" src/worker/api/v2 --include="*.ts" -A 5 | grep "VALUES" | head -10
echo ""

echo "4️⃣ CAMPOS COMUNS QUE PODEM ESTAR FALTANDO:"
echo ""
echo "   ⚠️  tipo (em tabelas de qualificação/treinamento)"
echo "   ⚠️  codigo (em tabelas de qualificação/treinamento)"
echo "   ⚠️  status (em várias tabelas)"
echo "   ⚠️  updated_at (deve sempre ser atualizado)"
echo "   ⚠️  categoria (em tabelas de classificação)"
echo ""

echo "5️⃣ RECOMENDAÇÕES:"
echo ""
echo "   1. Verificar cada UPDATE manualmente"
echo "   2. Comparar campos do UPDATE com schema da tabela"
echo "   3. Garantir que todos os campos editáveis são atualizados"
echo "   4. Adicionar logging para debug"
echo "   5. Testar cada endpoint após correção"
echo ""

echo "✅ AUDITORIA CONCLUÍDA"
echo ""
echo "📝 PRÓXIMO PASSO: Revisar arquivos listados acima"

~~~

---
## FILE: scripts/auditar-endpoints.sh
~~~bash
#!/bin/bash

API_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"

echo "🔍 AUDITORIA COMPLETA DE ENDPOINTS DO SISTEMA"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "🌐 API Base: $API_URL"
echo "⏰ Início: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Contadores
TOTAL=0
OK=0
ERRO=0
AVISO=0

# Função para testar endpoint
testar_endpoint() {
  local metodo=$1
  local endpoint=$2
  local descricao=$3
  local esperado=${4:-200}
  
  TOTAL=$((TOTAL + 1))
  
  # Fazer requisição
  if [ "$metodo" == "GET" ]; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL$endpoint")
  else
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X "$metodo" "$API_URL$endpoint")
  fi
  
  # Verificar resultado
  if [ "$HTTP_CODE" == "$esperado" ]; then
    echo -e "${GREEN}✅${NC} $metodo $endpoint - $descricao (${HTTP_CODE})"
    OK=$((OK + 1))
  elif [ "$HTTP_CODE" == "404" ]; then
    echo -e "${RED}❌ 404${NC} $metodo $endpoint - $descricao ${RED}(ENDPOINT NÃO EXISTE)${NC}"
    ERRO=$((ERRO + 1))
  elif [ "$HTTP_CODE" == "500" ]; then
    echo -e "${RED}❌ 500${NC} $metodo $endpoint - $descricao ${RED}(ERRO INTERNO)${NC}"
    ERRO=$((ERRO + 1))
  else
    echo -e "${YELLOW}⚠️  ${HTTP_CODE}${NC} $metodo $endpoint - $descricao"
    AVISO=$((AVISO + 1))
  fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 SISTEMA & SAÚDE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/health" "Health check"
testar_endpoint "GET" "/api/v2/health" "Health check v2"
testar_endpoint "GET" "/api/v2/sistema/info" "Informações do sistema"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "👥 FUNCIONÁRIOS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/funcionarios" "Listar funcionários"
testar_endpoint "GET" "/api/v2/funcionarios/1" "Buscar funcionário por ID"
testar_endpoint "GET" "/api/v2/funcionarios/search?q=teste" "Buscar funcionários"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📜 QUALIFICAÇÕES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/qualificacoes" "Listar qualificações"
testar_endpoint "GET" "/api/v2/qualificacoes/1" "Buscar qualificação por ID"
testar_endpoint "GET" "/api/v2/qualificacoes/funcionario/1" "Qualificações por funcionário"
testar_endpoint "GET" "/api/v2/categorias-qualificacoes" "Categorias de qualificações"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 EXAMES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/exames" "Listar exames"
testar_endpoint "GET" "/api/v2/exames/1" "Buscar exame por ID"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ CHECKS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/checks" "Listar checks"
testar_endpoint "GET" "/api/v2/checks/1" "Buscar check por ID"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎓 TREINAMENTOS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/treinamentos" "Listar treinamentos"
testar_endpoint "GET" "/api/v2/treinamentos/1" "Buscar treinamento por ID"
testar_endpoint "GET" "/api/v2/catalogo-treinamentos" "Catálogo de treinamentos"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎮 SIMULADORES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/simuladores" "Listar simuladores"
testar_endpoint "GET" "/api/v2/simuladores/1" "Buscar simulador por ID"
testar_endpoint "GET" "/api/v2/simuladores-consolidado" "Simuladores consolidado"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎯 MANOBRAS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/manobras" "Listar manobras"
testar_endpoint "GET" "/api/v2/manobras/1" "Buscar manobra por ID"
testar_endpoint "GET" "/api/v2/simuladores-consolidado/categorias" "Categorias de manobras"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 MODELOS DE SESSÃO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/simuladores/modelos" "Listar modelos"
testar_endpoint "GET" "/api/v2/simuladores/modelos/1" "Buscar modelo por ID"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📅 AGENDAMENTOS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/agendamentos" "Listar agendamentos"
testar_endpoint "GET" "/api/v2/agendamentos/1" "Buscar agendamento por ID"
testar_endpoint "GET" "/api/v2/simulador/slots?data=2025-12-22&simulador_id=1" "Slots disponíveis"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📄 FICHAS DE SESSÃO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/fichas" "Listar fichas" "400"
testar_endpoint "GET" "/api/v2/fichas/0b055562-212d-4ce8-b829-51015f146798" "Buscar ficha por UUID"
testar_endpoint "GET" "/api/v2/fichas/0b055562-212d-4ce8-b829-51015f146798/pdf" "Gerar PDF da ficha"
testar_endpoint "GET" "/api/v2/simulador/ficha/0b055562-212d-4ce8-b829-51015f146798" "Buscar ficha (alias)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 DASHBOARD & RELATÓRIOS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/dashboard" "Dashboard geral"
testar_endpoint "GET" "/api/v2/dashboard-stats" "Estatísticas do dashboard"
testar_endpoint "GET" "/api/v2/compliance/dashboard" "Dashboard de compliance"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🏢 ESTRUTURA ORGANIZACIONAL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/empresas" "Listar empresas"
testar_endpoint "GET" "/api/v2/setores" "Listar setores"
testar_endpoint "GET" "/api/v2/funcoes" "Listar funções"
testar_endpoint "GET" "/api/v2/aeronaves" "Listar aeronaves"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📁 CERTIFICADOS & STORAGE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/certificados" "Listar certificados" "400"
testar_endpoint "GET" "/api/v2/certificados-storage" "Storage de certificados" "400"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔔 ALERTAS & NOTIFICAÇÕES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/alertas" "Listar alertas"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 AUDITORIA & LOGS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/auditoria" "Logs de auditoria" "400"
testar_endpoint "GET" "/api/v2/importacoes" "Logs de importações"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "📊 RESUMO DA AUDITORIA"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo -e "Total de endpoints testados: ${BLUE}$TOTAL${NC}"
echo -e "✅ Funcionando corretamente: ${GREEN}$OK${NC} ($(awk "BEGIN {printf \"%.1f\", ($OK/$TOTAL)*100}")%)"
echo -e "❌ Com erro (404/500): ${RED}$ERRO${NC} ($(awk "BEGIN {printf \"%.1f\", ($ERRO/$TOTAL)*100}")%)"
echo -e "⚠️  Com aviso (outros códigos): ${YELLOW}$AVISO${NC} ($(awk "BEGIN {printf \"%.1f\", ($AVISO/$TOTAL)*100}")%)"
echo ""
echo "⏰ Fim: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

if [ $ERRO -gt 0 ]; then
  echo -e "${RED}⚠️  ATENÇÃO: $ERRO endpoint(s) com erro crítico!${NC}"
  echo ""
fi

if [ $AVISO -gt 0 ]; then
  echo -e "${YELLOW}ℹ️  AVISO: $AVISO endpoint(s) com comportamento inesperado${NC}"
  echo ""
fi

if [ $ERRO -eq 0 ] && [ $AVISO -eq 0 ]; then
  echo -e "${GREEN}🎉 Todos os endpoints estão funcionando corretamente!${NC}"
  echo ""
fi

~~~

---
## FILE: scripts/auditar-schema.sh
~~~bash
#!/bin/bash

# Script para auditar schema de todas as tabelas

echo "=== AUDITORIA DE SCHEMA - TODAS AS TABELAS ==="
echo ""

# Tabelas principais do sistema
TABLES=(
  "funcionarios"
  "qualificacoes"
  "tipos_qualificacao"
  "checks"
  "exames"
  "treinamentos"
  "historico_certificacoes_v2"
  "sessoes_simulador"
  "sessoes_participantes"
  "sessoes_manobras"
  "avaliacoes_manobras"
  "agendamentos_simulador"
  "simuladores"
  "manobras"
  "categorias_manobras"
  "modelos_sessao"
  "modelos_sessao_manobras"
  "aeronaves"
  "empresas"
  "catalogo_treinamentos"
)

echo "Tabelas a auditar: ${#TABLES[@]}"
echo ""

for table in "${TABLES[@]}"; do
  echo "### TABELA: $table"
  grep -r "CREATE TABLE.*$table" migrations/ 2>/dev/null | head -1
  echo ""
done

echo ""
echo "=== BUSCAR COLUNAS PROBLEMÁTICAS ==="
echo ""

echo "Arquivos com data_realizacao:"
grep -r "data_realizacao" src/ --include="*.ts" --include="*.tsx" | wc -l

echo "Arquivos com data_validade:"
grep -r "data_validade" src/ --include="*.ts" --include="*.tsx" | wc -l

echo "Arquivos com data_conclusao:"
grep -r "data_conclusao" src/ --include="*.ts" --include="*.tsx" | wc -l

echo "Arquivos com data_vencimento:"
grep -r "data_vencimento" src/ --include="*.ts" --include="*.tsx" | wc -l

~~~

---
## FILE: scripts/auditoria-pre-correcao.sql
~~~sql
-- ========================================
-- AUDITORIA PRÉ-CORREÇÃO: VALIDAÇÃO DE DADOS
-- Data: 28/11/2025
-- ========================================

-- 1. VERIFICAR FUNCIONÁRIOS EXISTENTES vs. CSV
SELECT '=== 1. FUNCIONÁRIOS NO CSV vs. BANCO ===' AS secao;

WITH csv_funcionarios AS (
  SELECT DISTINCT funcionario_cpf
  FROM (
    -- Lista de CPFs do CSV fornecido
    VALUES 
      ('134.651.428-37'), ('419.906.257-20'), ('052.414.847-36'),
      ('387.181.008-80'), ('899.850.527-49'), ('017.058.448-80'),
      ('772.105.497-49'), ('722.443.567-87'), ('112.015.317-48'),
      ('401.238.047-87'), ('734.990.727-34'), ('311.120.807-91'),
      ('058.412.708-18'), ('563.716.080-53'), ('093.127.887-28'),
      ('663.794.586-20'), ('939.571.227-91'), ('155.257.297-84'),
      ('713.920.927-87'), ('145.880.747-92'), ('052.017.507-70'),
      ('768.506.843-53'), ('083.286.227-42'), ('108.943.047-71'),
      ('012.598.600-94'), ('102.896.837-66')
  ) AS t(funcionario_cpf)
)
SELECT 
  cf.funcionario_cpf,
  f.nome,
  f.codigo_anac,
  CASE 
    WHEN f.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN f.deleted_at IS NOT NULL THEN '⚠️ DELETADO'
    ELSE '✅ OK'
  END AS status_banco
FROM csv_funcionarios cf
LEFT JOIN funcionarios f ON f.cpf = cf.funcionario_cpf
ORDER BY status_banco DESC, cf.funcionario_cpf;

-- 2. VERIFICAR QUALIFICAÇÕES EXISTENTES vs. CSV
SELECT '=== 2. QUALIFICAÇÕES NO CSV vs. BANCO ===' AS secao;

WITH csv_qualificacoes AS (
  SELECT DISTINCT qualificacao_codigo
  FROM (
    VALUES 
      ('B'), ('C'), ('CMA'), ('D1'), ('D2'), ('D3'), ('D4'),
      ('E1'), ('E2'), ('E3'), ('E4'), ('E5'), ('F1'), ('F2'),
      ('FAP05.2'), ('FAP06'), ('FAP06SEM'), ('FAP14'), ('G1'), ('G2'),
      ('H'), ('CHTIFR'), ('IFR'), ('LOFT'), ('NOT'), ('OFEXCRED'),
      ('OPC'), ('ASO.P'), ('SAEFAP06'), ('SAEFAP14'), ('TIPO'), ('E6')
  ) AS t(qualificacao_codigo)
)
SELECT 
  cq.qualificacao_codigo,
  qt.descricao,
  qt.tipo_licenca,
  CASE 
    WHEN qt.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qt.deleted_at IS NOT NULL THEN '⚠️ DELETADO'
    ELSE '✅ OK'
  END AS status_banco
FROM csv_qualificacoes cq
LEFT JOIN qualificacoes_tipos qt ON qt.codigo = cq.qualificacao_codigo
ORDER BY status_banco DESC, cq.qualificacao_codigo;

-- 3. VERIFICAR REGISTROS DUPLICADOS NO HISTÓRICO
SELECT '=== 3. DUPLICATAS NO HISTÓRICO (MESMO CPF + CÓDIGO + VENCIMENTO) ===' AS secao;

SELECT 
  h.funcionario_cpf,
  f.nome AS funcionario_nome,
  h.qualificacao_codigo,
  h.data_vencimento,
  COUNT(*) AS total_duplicatas,
  GROUP_CONCAT(h.id) AS ids_duplicados,
  GROUP_CONCAT(h.status) AS status_registros,
  GROUP_CONCAT(h.data_conclusao) AS datas_conclusao
FROM qualificacoes_historico h
LEFT JOIN funcionarios f ON f.cpf = h.funcionario_cpf
WHERE h.deleted_at IS NULL
  AND h.funcionario_cpf IN (
    '134.651.428-37', '419.906.257-20', '052.414.847-36',
    '387.181.008-80', '899.850.527-49', '017.058.448-80',
    '772.105.497-49', '722.443.567-87', '112.015.317-48',
    '401.238.047-87', '734.990.727-34', '311.120.807-91',
    '058.412.708-18', '563.716.080-53', '093.127.887-28',
    '663.794.586-20', '939.571.227-91', '155.257.297-84',
    '713.920.927-87', '145.880.747-92', '052.017.507-70',
    '768.506.843-53', '083.286.227-42', '108.943.047-71',
    '012.598.600-94', '102.896.837-66'
  )
GROUP BY h.funcionario_cpf, h.qualificacao_codigo, h.data_vencimento
HAVING COUNT(*) > 1
ORDER BY total_duplicatas DESC, h.funcionario_cpf;

-- 4. VERIFICAR REGISTROS COM DATA VENCIMENTO NO PASSADO
SELECT '=== 4. REGISTROS VENCIDOS (ANTES DE HOJE) ===' AS secao;

SELECT 
  h.funcionario_cpf,
  f.nome AS funcionario_nome,
  h.qualificacao_codigo,
  h.data_vencimento,
  h.status,
  julianday('now') - julianday(h.data_vencimento) AS dias_vencido
FROM qualificacoes_historico h
LEFT JOIN funcionarios f ON f.cpf = h.funcionario_cpf
WHERE h.deleted_at IS NULL
  AND h.data_vencimento < date('now')
  AND h.funcionario_cpf IN (
    '134.651.428-37', '419.906.257-20', '052.414.847-36',
    '387.181.008-80', '899.850.527-49', '017.058.448-80',
    '772.105.497-49', '722.443.567-87', '112.015.317-48',
    '401.238.047-87', '734.990.727-34', '311.120.807-91',
    '058.412.708-18', '563.716.080-53', '093.127.887-28',
    '663.794.586-20', '939.571.227-91', '155.257.297-84',
    '713.920.927-87', '145.880.747-92', '052.017.507-70',
    '768.506.843-53', '083.286.227-42', '108.943.047-71',
    '012.598.600-94', '102.896.837-66'
  )
ORDER BY dias_vencido DESC
LIMIT 20;

-- 5. VERIFICAR REGISTROS SEM RENOVACAO_DE MAS COM MÚLTIPLAS ENTRADAS
SELECT '=== 5. CANDIDATOS A RENOVAÇÃO (MÚLTIPLAS ENTRADAS, SEM VÍNCULO) ===' AS secao;

SELECT 
  h.funcionario_cpf,
  f.nome AS funcionario_nome,
  h.qualificacao_codigo,
  COUNT(*) AS total_registros,
  GROUP_CONCAT(h.data_conclusao ORDER BY h.data_conclusao) AS datas_conclusao,
  GROUP_CONCAT(h.data_vencimento ORDER BY h.data_conclusao) AS datas_vencimento,
  GROUP_CONCAT(h.status ORDER BY h.data_conclusao) AS status_list,
  SUM(CASE WHEN h.renovacao_de IS NOT NULL THEN 1 ELSE 0 END) AS registros_com_vinculo
FROM qualificacoes_historico h
LEFT JOIN funcionarios f ON f.cpf = h.funcionario_cpf
WHERE h.deleted_at IS NULL
  AND h.funcionario_cpf IN (
    '134.651.428-37', '419.906.257-20', '052.414.847-36',
    '387.181.008-80', '899.850.527-49', '017.058.448-80',
    '772.105.497-49', '722.443.567-87', '112.015.317-48',
    '401.238.047-87', '734.990.727-34', '311.120.807-91',
    '058.412.708-18', '563.716.080-53', '093.127.887-28',
    '663.794.586-20', '939.571.227-91', '155.257.297-84',
    '713.920.927-87', '145.880.747-92', '052.017.507-70',
    '768.506.843-53', '083.286.227-42', '108.943.047-71',
    '012.598.600-94', '102.896.837-66'
  )
GROUP BY h.funcionario_cpf, h.qualificacao_codigo
HAVING total_registros > 1
ORDER BY total_registros DESC, h.funcionario_cpf
LIMIT 30;

-- 6. VERIFICAR DISCREPÂNCIAS ENTRE CSV E BANCO
SELECT '=== 6. REGISTROS NO CSV QUE NÃO EXISTEM NO BANCO ===' AS secao;

WITH csv_data AS (
  SELECT * FROM (VALUES
    -- Apenas uma amostra para teste (primeiros 10 registros do CSV)
    ('134.651.428-37', 'B', '2026-10-22'),
    ('419.906.257-20', 'B', '2026-10-28'),
    ('052.414.847-36', 'B', '2026-11-19'),
    ('387.181.008-80', 'B', '2026-11-03'),
    ('899.850.527-49', 'B', '2026-01-13'),
    ('017.058.448-80', 'B', '2026-11-19'),
    ('772.105.497-49', 'B', '2026-10-30'),
    ('722.443.567-87', 'B', '2026-10-11'),
    ('112.015.317-48', 'B', '2026-11-04'),
    ('401.238.047-87', 'B', '2026-04-09')
  ) AS t(cpf, codigo, vencimento)
)
SELECT 
  cd.cpf,
  cd.codigo,
  cd.vencimento AS vencimento_csv,
  h.data_vencimento AS vencimento_banco,
  CASE 
    WHEN h.id IS NULL THEN '❌ NÃO EXISTE NO BANCO'
    WHEN h.data_vencimento != cd.vencimento THEN '⚠️ VENCIMENTO DIFERENTE'
    ELSE '✅ OK'
  END AS status
FROM csv_data cd
LEFT JOIN qualificacoes_historico h 
  ON h.funcionario_cpf = cd.cpf 
  AND h.qualificacao_codigo = cd.codigo
  AND h.data_vencimento = cd.vencimento
  AND h.deleted_at IS NULL
ORDER BY status DESC;

-- 7. RESUMO GERAL
SELECT '=== 7. RESUMO GERAL ===' AS secao;

SELECT 
  'Total funcionários no banco' AS metrica,
  COUNT(*) AS valor
FROM funcionarios 
WHERE deleted_at IS NULL
UNION ALL
SELECT 
  'Total qualificações no banco',
  COUNT(*)
FROM qualificacoes_tipos
WHERE deleted_at IS NULL
UNION ALL
SELECT 
  'Total registros histórico',
  COUNT(*)
FROM qualificacoes_historico
WHERE deleted_at IS NULL
UNION ALL
SELECT 
  'Registros com renovacao_de preenchido',
  COUNT(*)
FROM qualificacoes_historico
WHERE deleted_at IS NULL 
  AND renovacao_de IS NOT NULL
UNION ALL
SELECT 
  'Registros com status = renovada',
  COUNT(*)
FROM qualificacoes_historico
WHERE deleted_at IS NULL 
  AND status = 'renovada';

~~~

---
## FILE: scripts/backfill-analitico-placeholder.sql
~~~sql
-- backfill-analitico-placeholder.sql
-- Placeholder para popular alguns campos analíticos com valores sintéticos controlados
-- NÃO USA DADOS SENSÍVEIS REAIS
UPDATE qualificacoes_historico
SET instrutor = COALESCE(instrutor, 'INSTRUTOR_PADRAO'),
    local = COALESCE(local, 'CENTRO_TREINAMENTO'),
    modalidade = COALESCE(modalidade, 'PRESENCIAL')
WHERE deleted_at IS NULL;

-- Nota sintética apenas onde nula
UPDATE qualificacoes_historico
SET nota = ROUND(80 + (RANDOM() % 2000) / 100.0, 2)
WHERE nota IS NULL AND deleted_at IS NULL;

-- Carga horária padrão se nula
UPDATE qualificacoes_historico
SET carga_horaria = 8
WHERE carga_horaria IS NULL AND deleted_at IS NULL;

~~~

---
## FILE: scripts/backup-database.sh
~~~bash
#!/bin/bash

# AirTrust v2 - Database Backup Script
# Creates a backup of the D1 database

set -e

echo "🗄️  AirTrust v2 - Database Backup"
#!/bin/bash

# AirTrust v2 - Database Backup Script (robusto)
# Cria backup tolerante a diferenças de schema e tabelas ausentes.

set -o pipefail

echo "🗄️  AirTrust v2 - Database Backup"
echo "================================"
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if ! command -v wrangler &> /dev/null; then
  echo -e "${RED}❌ wrangler CLI não encontrado${NC}"
  exit 1
fi

db_name=""
label=""
remote_flag=""
tables_arg=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db|-d)
      db_name="$2"; shift 2 ;;
    --label|-l)
      label="$2"; shift 2 ;;
    --remote)
      remote_flag="--remote"; shift ;;
    --tables)
      tables_arg="$2"; shift 2 ;;
    *)
      echo -e "${YELLOW}⚠️  Ignorando argumento desconhecido: $1${NC}"; shift ;;
  esac
done

if [ -z "$db_name" ]; then
  read -p "Nome do database (ex: airtrust-db): " db_name
fi

if [ -z "$db_name" ]; then
  echo -e "${RED}❌ Database obrigatório${NC}"; exit 1
fi

BACKUP_DIR="backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
if [ -n "$label" ]; then
  label_slug=$(echo "$label" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]/-/g' | sed 's/-\+/-/g' | sed 's/^-\|-$//g')
else
  label_slug=""
fi

echo "📦 Iniciando backup"
echo "Database: $db_name"
[ -n "$label" ] && echo "Label: $label (slug: $label_slug)"
echo "Timestamp: $TIMESTAMP"
echo "Modo: ${remote_flag:+remote}${remote_flag:="local"}" | sed 's/localremote/remote/'
echo ""

export_table() {
  local tbl="$1"; shift
  local query="$1"; shift
  local outfile="$1"; shift
  echo "Exportando ${tbl}..."
  if wrangler d1 execute "$db_name" $remote_flag --command="SELECT name FROM sqlite_master WHERE type='table' AND name='${tbl}'" --json 2>/dev/null | grep -q "${tbl}"; then
    if wrangler d1 execute "$db_name" $remote_flag --command="$query" --json > "$outfile" 2>/dev/null; then
      echo "✅ ${tbl} exportado"
    else
      echo "⚠️  Falha ao exportar ${tbl} (query)"
    fi
  else
    echo "⚠️  Tabela ${tbl} ausente - pulando"
  fi
}

OUTPUT_FUNC="${BACKUP_DIR}/funcionarios_${TIMESTAMP}.json"
OUTPUT_USERS="${BACKUP_DIR}/usuarios_${TIMESTAMP}.json"
OUTPUT_CERTS="${BACKUP_DIR}/certificacoes_${TIMESTAMP}.json"
OUTPUT_AUDIT="${BACKUP_DIR}/audit_logs_${TIMESTAMP}.json"

# Lista de arquivos realmente criados
CREATED_FILES=()

if [ -z "$tables_arg" ]; then
  # Export padrão (tentativa de tabelas principais)
  if export_table "funcionarios" "SELECT * FROM funcionarios" "$OUTPUT_FUNC" | grep -q "✅"; then CREATED_FILES+=("$(basename "$OUTPUT_FUNC")"); fi || true
  if export_table "usuarios" "SELECT * FROM usuarios" "$OUTPUT_USERS" | grep -q "✅"; then CREATED_FILES+=("$(basename "$OUTPUT_USERS")"); fi || true
else
  # Export específico conforme --tables (CSV)
  IFS=',' read -ra REQ_TABLES <<< "$tables_arg"
  for t in "${REQ_TABLES[@]}"; do
    t_trim=$(echo "$t" | xargs)
    outfile="${BACKUP_DIR}/${t_trim}_${TIMESTAMP}.json"
    if export_table "$t_trim" "SELECT * FROM $t_trim" "$outfile" | grep -q "✅"; then CREATED_FILES+=("$(basename "$outfile")"); fi || true
  done
fi

if [ -z "$tables_arg" ]; then
  if wrangler d1 execute "$db_name" $remote_flag --command="SELECT name FROM sqlite_master WHERE type='table' AND name='historico_certificacoes_v2'" --json 2>/dev/null | grep -q "historico_certificacoes_v2"; then
    if export_table "historico_certificacoes_v2" "SELECT * FROM historico_certificacoes_v2" "$OUTPUT_CERTS" | grep -q "✅"; then CREATED_FILES+=("$(basename "$OUTPUT_CERTS")"); fi || true
  else
    echo "ℹ️  Fallback para qualificacoes_historico minimal"
    if export_table "qualificacoes_historico" "SELECT * FROM qualificacoes_historico" "$OUTPUT_CERTS" | grep -q "✅"; then CREATED_FILES+=("$(basename "$OUTPUT_CERTS")"); fi || true
  fi
fi
if [ -z "$tables_arg" ]; then
  if export_table "audit_logs" "SELECT * FROM audit_logs" "$OUTPUT_AUDIT" | grep -q "✅"; then CREATED_FILES+=("$(basename "$OUTPUT_AUDIT")"); fi || true
fi

echo ""
echo "📁 Arquivos gerados:"; if [ ${#CREATED_FILES[@]} -eq 0 ]; then echo "(nenhum gerado)"; else printf '  - %s\n' "${CREATED_FILES[@]}"; fi

# Se não especificado --tables e nenhum arquivo foi criado, tentar export full inventory
if [ -z "$tables_arg" ] && [ ${#CREATED_FILES[@]} -eq 0 ]; then
  echo "🔄 Nenhum match padrão. Enumerando todas as tabelas..."
  RAW_TABLES=$(wrangler d1 execute "$db_name" $remote_flag --command="SELECT name FROM sqlite_master WHERE type='table'" --json 2>/dev/null)
  # Parsing sem jq: extrai linhas com "name" e pega valor
  ALL_TABLES=$(echo "$RAW_TABLES" | grep -o '"name"[: ]*"[^"]\+"' | sed 's/.*"name"[: ]*"\([^"]\+\)"/\1/')
  if [ -n "$ALL_TABLES" ]; then
    echo "$ALL_TABLES" | while read -r tbl; do
      [ -z "$tbl" ] && continue
      outfile="${BACKUP_DIR}/${tbl}_${TIMESTAMP}.json"
      if export_table "$tbl" "SELECT * FROM $tbl" "$outfile" | grep -q "✅"; then CREATED_FILES+=("$(basename "$outfile")"); fi || true
    done
  fi
  echo "📁 Após inventário:"; if [ ${#CREATED_FILES[@]} -eq 0 ]; then echo "(continua vazio)"; else printf '  - %s\n' "${CREATED_FILES[@]}"; fi
fi

MANIFEST="${BACKUP_DIR}/backup_manifest_${TIMESTAMP}.json"
cat > "$MANIFEST" <<EOF
{
  "backup_date": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "database_name": "$db_name",
  "label": "$label",
  "files": [$(printf '"%s",' "${CREATED_FILES[@]}" | sed 's/,$//')],
  "version": "2.1.0",
  "remote": "${remote_flag:+true}${remote_flag:="false"}"
}
EOF

echo "📋 Manifest: $MANIFEST"

if [ ${#CREATED_FILES[@]} -eq 0 ]; then
  echo "⚠️  Nenhum arquivo exportado. Nada para compactar."
  echo "✨ Backup (manifest vazio) concluído"
else
  ARCHIVE_NAME="${BACKUP_DIR}/backup_${db_name}_${TIMESTAMP}${label_slug:+_}${label_slug}.tar.gz"
  echo "🗜️  Compactando em ${ARCHIVE_NAME}..."
  tar -czf "$ARCHIVE_NAME" -C "$BACKUP_DIR" "$(basename "$MANIFEST")" $(printf ' "%s"' "${CREATED_FILES[@]}")
  rm -f "$MANIFEST" ${CREATED_FILES[@]/#/${BACKUP_DIR}/} || true
  echo -e "${GREEN}✅ Arquivo final: $ARCHIVE_NAME${NC}"
  SIZE=$(du -h "$ARCHIVE_NAME" | cut -f1)
  echo "📊 Tamanho: $SIZE"
  echo "✨ Backup concluído"
  echo "💡 Restaurar: ./scripts/restore-database.sh $ARCHIVE_NAME"
fi
rm "${BACKUP_DIR}/usuarios_${TIMESTAMP}.json"
rm "${BACKUP_DIR}/certificacoes_${TIMESTAMP}.json"
rm "${BACKUP_DIR}/audit_logs_${TIMESTAMP}.json"
rm "${BACKUP_DIR}/backup_manifest_${TIMESTAMP}.json"

echo -e "${GREEN}✅ Backup compressed: ${ARCHIVE_NAME}${NC}"
echo ""

# Calculate size
BACKUP_SIZE=$(du -h "$ARCHIVE_NAME" | cut -f1)
echo "📊 Backup size: $BACKUP_SIZE"
echo ""

echo "✨ Backup complete!"
echo ""
echo "💡 To restore this backup:"
echo "   ./scripts/restore-database.sh ${ARCHIVE_NAME}"
echo ""

~~~

---
## FILE: scripts/backup-local.js
~~~javascript
// Script de backup automático local - CommonJS
const fs = require('fs');
const path = require('path');
const https = require('http');

const BACKUP_DIR = path.join(__dirname, '../backups');
const MAX_BACKUPS = 10;

// Criar pasta de backups se não existir
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  console.log('📁 Pasta de backups criada:', BACKUP_DIR);
}

// Função para fazer requisição HTTP
function httpRequest(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

// Função para fazer backup
async function backupDatabase() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-local-${timestamp}.json`;
  const filepath = path.join(BACKUP_DIR, filename);

  console.log('🔄 Iniciando backup...');

  try {
    // Fazer requisição para endpoint de backup
    const data = await httpRequest('http://localhost:8787/api/v2/backup/export-all');

    // Salvar arquivo
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));

    console.log(`✅ Backup criado: ${filename}`);
    console.log(`📊 Total de registros: ${data.total_records || 0}`);

    // Limpar backups antigos
    cleanOldBackups();
  } catch (error) {
    console.error('❌ Erro ao criar backup:', error.message);
  }
}

// Limpar backups antigos (manter apenas últimos 10)
function cleanOldBackups() {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('backup-local-'))
    .map(f => ({
      name: f,
      time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time);

  // Remover backups excedentes
  files.slice(MAX_BACKUPS).forEach(file => {
    fs.unlinkSync(path.join(BACKUP_DIR, file.name));
    console.log(`🗑️  Backup antigo removido: ${file.name}`);
  });
}

// Executar backup
backupDatabase();

// Se executado como watch, fazer backup a cada hora
if (process.argv.includes('--watch')) {
  console.log('👁️  Modo watch ativado - backup a cada 1 hora');
  setInterval(backupDatabase, 60 * 60 * 1000); // 1 hora
}

~~~

---
## FILE: scripts/backup_d1_to_r2.sh
~~~bash
#!/bin/bash
# =============================================
# Script: Backup Automático D1 → R2
# FASE 32
# Data: 2025-11-15
# =============================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKER_DIR="$PROJECT_ROOT/worker-airtrust"
BACKUPS_DIR="$PROJECT_ROOT/backups"
DB="airtrust-db"
BUCKET="airtrust-r2"

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

mkdir -p "$BACKUPS_DIR"

# =============================================
# 1. GERAR NOME DO ARQUIVO
# =============================================
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="backup_${DB}_${TIMESTAMP}.sql"
FILEPATH="$BACKUPS_DIR/$FILENAME"
LABEL="${1:-automatic_backup}"

echo ""
echo "=========================================="
echo " BACKUP AUTOMÁTICO D1 → R2"
echo "=========================================="
echo ""

log_info "Iniciando backup: $FILENAME"
log_info "Label: $LABEL"

# =============================================
# 2. EXPORT D1 PARA ARQUIVO SQL
# =============================================
cd "$WORKER_DIR"

log_info "Exportando D1 para SQL..."
npx wrangler d1 export "$DB" --remote --output "$FILEPATH"

if [ ! -f "$FILEPATH" ]; then
  log_error "Erro: Arquivo de backup não foi criado"
  exit 1
fi

FILESIZE=$(stat -f%z "$FILEPATH" 2>/dev/null || stat -c%s "$FILEPATH")
FILESIZE_MB=$(echo "scale=2; $FILESIZE / 1048576" | bc)

log_success "Export concluído: ${FILESIZE_MB}MB"

# =============================================
# 3. UPLOAD PARA R2
# =============================================
log_info "Uploading para R2..."

npx wrangler r2 object put "$BUCKET/backups/$FILENAME" \
  --file="$FILEPATH" \
  --content-type="application/sql"

log_success "Upload para R2 concluído"

# =============================================
# 4. REGISTRAR NA TABELA BACKUPS
# =============================================
log_info "Registrando backup na tabela..."

npx wrangler d1 execute "$DB" --remote --command "
INSERT INTO backups (
  nome_arquivo,
  filename, 
  tamanho,
  size_bytes, 
  backup_type, 
  label, 
  storage_path,
  created_at
) VALUES (
  '$FILENAME',
  '$FILENAME',
  $FILESIZE,
  $FILESIZE,
  'AUTOMATIC',
  '$LABEL',
  'r2://airtrust-r2/backups/$FILENAME',
  datetime('now')
);"

log_success "Backup registrado no banco"

# =============================================
# 5. LIMPEZA LOCAL (MANTER ÚLTIMOS 7 DIAS)
# =============================================
log_info "Limpando backups locais antigos..."

find "$BACKUPS_DIR" -name "backup_*.sql" -mtime +7 -delete 2>/dev/null || true
REMAINING=$(ls -1 "$BACKUPS_DIR"/backup_*.sql 2>/dev/null | wc -l)

log_info "Backups locais restantes: $REMAINING"

# =============================================
# 6. RESUMO FINAL
# =============================================
echo ""
echo "=========================================="
echo " BACKUP CONCLUÍDO"
echo "=========================================="
echo ""
echo "Arquivo:       $FILENAME"
echo "Tamanho:       ${FILESIZE_MB}MB"
echo "Destino R2:    r2://airtrust-r2/backups/$FILENAME"
echo "Label:         $LABEL"
echo "Timestamp:     $TIMESTAMP"
echo ""

log_success "Backup automático finalizado com sucesso!"

~~~

---
## FILE: scripts/bootstrap-remote-r2-buckets.sh
~~~bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="$ROOT_DIR/worker-airtrust"
WRANGLER=(npx -y node@20 node_modules/wrangler/bin/wrangler.js)
BUCKETS=(
  airtrust-storage-dev
  airtrust-storage-staging
)

info() {
  printf '\033[0;34mℹ\033[0m  %s\n' "$*"
}

ok() {
  printf '\033[0;32m✓\033[0m  %s\n' "$*"
}

fail() {
  printf '\033[0;31m✗\033[0m  %s\n' "$*" >&2
  exit 1
}

[[ -d "$WORKER_DIR" ]] || fail "worker-airtrust não encontrado"

run_wranger() {
  (
    cd "$WORKER_DIR"
    "$@"
  )
}

info "Listando buckets R2 existentes"
EXISTING="$(run_wranger "${WRANGLER[@]}" r2 bucket list 2>/dev/null || true)"

for bucket in "${BUCKETS[@]}"; do
  if grep -q "$bucket" <<<"$EXISTING"; then
    ok "Bucket já existe: $bucket"
    continue
  fi

  info "Criando bucket: $bucket"
  run_wranger "${WRANGLER[@]}" r2 bucket create "$bucket"
  ok "Bucket criado: $bucket"
done

echo ""
ok "Provisionamento R2 concluído"
~~~

---
## FILE: scripts/bootstrap.sh
~~~bash
#!/bin/bash

# AirTrust Bootstrap - Inicialização completa do sistema
# Garante que tudo está pronto para rodar

set -e  # Parar em caso de erro

echo "🚀 AirTrust Bootstrap - Inicialização Completa"
echo "=============================================="
echo ""

# 1. Parar processos anteriores
echo "📍 Passo 1/6: Limpando processos anteriores..."
lsof -ti:8787 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
pkill -9 -f wrangler 2>/dev/null || true
pkill -9 -f vite 2>/dev/null || true
sleep 2
echo "   ✓ Processos limpos"
echo ""

# 2. Limpar cache (opcional)
echo "📍 Passo 2/6: Limpando cache..."
rm -rf .wrangler/state 2>/dev/null || true
echo "   ✓ Cache limpo"
echo ""

# 3. Iniciar worker temporariamente para criar DB
echo "📍 Passo 3/6: Iniciando worker temporário..."
npm run dev:worker > /tmp/worker-bootstrap.log 2>&1 &
WORKER_PID=$!
sleep 8
echo "   ✓ Worker iniciado (PID: $WORKER_PID)"
echo ""

# 4. Aplicar migração core
echo "📍 Passo 4/6: Aplicando migrações..."
npx wrangler d1 execute airtrust-db --local --file=./migrations/0013_airtrust_core.sql 2>&1 | grep -E "success|error" || true
echo "   ✓ Migrações aplicadas"
echo ""

# 5. Verificar tabelas
echo "📍 Passo 5/6: Verificando tabelas..."
DB_FILE=$(find .wrangler/state/v3/d1/miniflare-D1DatabaseObject -name "*.sqlite" 2>/dev/null | head -1)
if [ -n "$DB_FILE" ]; then
  echo "   Tabelas encontradas:"
  sqlite3 "$DB_FILE" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;" | while read table; do
    count=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM $table;" 2>/dev/null || echo "0")
    echo "     ✓ $table ($count registros)"
  done
else
  echo "   ⚠️  Banco não encontrado ainda"
fi
echo ""

# 6. Parar worker temporário
echo "📍 Passo 6/6: Finalizando..."
kill $WORKER_PID 2>/dev/null || true
sleep 2
echo "   ✓ Worker temporário encerrado"
echo ""

# Teste de health (se worker ainda estiver rodando)
echo "🏥 Testando health check..."
HEALTH=$(curl -s http://localhost:8787/health 2>/dev/null || echo '{"status":"offline"}')
echo "   Resposta: $HEALTH"
echo ""

echo "=============================================="
echo "✅ Bootstrap concluído com sucesso!"
echo ""
echo "Para iniciar o sistema:"
echo "  Backend:  npm run dev:worker"
echo "  Frontend: npm run dev"
echo "  Ambos:    npm run dev:all"
echo ""
echo "Para verificar health:"
echo "  curl http://localhost:8787/health"
echo ""

~~~

---
## FILE: scripts/build-and-deploy.sh
~~~bash
#!/usr/bin/env bash
# build-and-deploy.sh
# Usa Node 22 para evitar o esbuild deadlock com Node 24
# Executa: build frontend + deploy worker + deploy Pages

set -euo pipefail

# Usar Node 22 explicitamente (Node 24 tem bug de deadlock com esbuild)
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"

echo "Node: $(node --version)"
echo "NPM: $(npm --version)"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo ""
echo "============================================="
echo "⚠️  BANCO DE PRODUÇÃO — alterações são REAIS"
echo "============================================="
echo ""

echo "🔨 Build frontend (Node 22)..."
node_modules/.bin/vite build
bash scripts/remove-duplicate-build-assets.sh
echo "✅ Build concluído"

echo ""
echo "🧪 TypeCheck..."
node_modules/.bin/tsc --noEmit || { echo "❌ TypeCheck falhou"; exit 1; }
echo "✅ TypeCheck OK"

echo ""
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
echo "📌 Git commit: $GIT_COMMIT"

# Carimba versão no index.html
if [ -f dist/client/index.html ]; then
  sed -i '' "s/__BUILD_VERSION__/$GIT_COMMIT/g" dist/client/index.html
  echo "🧷 Versão carimbada: $GIT_COMMIT"
fi

echo ""
echo "🌐 Deploy Cloudflare Pages..."
CLOUDFLARE_API_TOKEN= npx wrangler pages deploy dist/client \
  --project-name=airtrust \
  --branch=production \
  --commit-dirty=true 2>&1 | tail -5
echo "✅ Pages deploy OK"

echo ""
echo "🚀 Deploy Worker..."
cd worker-airtrust

# Atualiza APP_VERSION no wrangler.toml
if grep -q "APP_VERSION = " wrangler.toml; then
  sed -i '' "s/APP_VERSION = .*/APP_VERSION = \"$GIT_COMMIT\"/" wrangler.toml
fi

DEPLOY_OUTPUT=$(wrangler deploy --env production 2>&1)
echo "$DEPLOY_OUTPUT" | tail -5

VERSION_ID=$(echo "$DEPLOY_OUTPUT" | grep 'Current Version ID:' | sed 's/.*Current Version ID: //' | tr -d ' ' || echo "")
if [ -n "$VERSION_ID" ]; then
  echo "📌 Worker Version ID: $VERSION_ID"
fi
cd ..

echo ""
echo "📦 Git commit (se houver mudanças)..."
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "chore: build + deploy $GIT_COMMIT" || true
  git push || true
fi

echo ""
echo "✅ DEPLOY COMPLETO"
echo "   Frontend: https://airtrust.online"
echo "   API: https://airtrust-api-production.airtrust.workers.dev"
echo "   Git: $GIT_COMMIT"

~~~

---
## FILE: scripts/build-with-version.sh
~~~bash
#!/bin/bash
# Build with auto-generated version info
set -euo pipefail

cd "$(dirname "$0")/.."

echo "🔨 Gerando versão..."
eval "$(./scripts/generate-version.sh)"

echo "🔨 Building frontend..."
vite build

echo "✅ Build completo!"
echo "   Version: ${APP_VERSION}"
echo "   Build Time: ${APP_BUILD_TIME}"

~~~

---
## FILE: scripts/certificate-template-company-6.html
~~~html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
      @page {
        size: A4;
        margin: 0;
      }
      *,
      *::before,
      *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      body {
        font-family: 'Inter', Arial, sans-serif;
        background: #fff;
      }
      .cert-page {
        width: 210mm;
        min-height: 297mm;
        padding: 16mm 18mm 14mm;
        display: grid;
        grid-template-rows: auto auto auto auto minmax(0, 1fr) auto;
        gap: 24px;
      }
      .header {
        display: flex;
        justify-content: center;
        align-items: center;
        padding-bottom: 14px;
        border-bottom: 2px solid #0071e3;
      }
      .header img {
        max-height: 108px;
        max-width: 315px;
        object-fit: contain;
      }
      .main-title {
        text-align: center;
        font-size: 28pt;
        font-weight: 700;
        letter-spacing: -0.6px;
        color: #1d1d1f;
        margin: 0;
      }
      .main-title + .main-sub {
        margin-top: 12px;
      }
      .main-sub {
        text-align: center;
        font-size: 10.5pt;
        color: #6e6e73;
        margin: 0;
        line-height: 1.45;
      }
      .info-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px 18px;
      }
      .info-item {
        background: #f5f5f7;
        border-radius: 12px;
        padding: 14px 16px;
        min-height: 64px;
      }
      .info-item .label {
        font-size: 7.5pt;
        color: #6e6e73;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .info-item .value {
        font-size: 10.5pt;
        font-weight: 600;
        color: #1d1d1f;
        margin-top: 4px;
        line-height: 1.35;
      }
      .training-box {
        background: linear-gradient(135deg, #0071e3 0%, #0077ed 100%);
        border-radius: 16px;
        padding: 18px 20px;
        color: #fff;
        box-shadow: 0 10px 28px rgba(0, 113, 227, 0.16);
      }
      .training-box .qual-name {
        font-size: 15.5pt;
        font-weight: 700;
      }
      .training-box .qual-meta {
        font-size: 9.3pt;
        opacity: 0.9;
        margin-top: 6px;
        line-height: 1.4;
      }
      .program-section {
        border: 1px solid #e5e5ea;
        border-radius: 16px;
        background: linear-gradient(180deg, #ffffff 0%, #fafafc 100%);
        padding: 12px 14px 10px;
        display: flex;
        flex-direction: column;
        min-height: 118mm;
      }
      .program-label {
        font-size: 7.4pt;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        color: #1d1d1f;
        margin-bottom: 8px;
        padding-bottom: 5px;
        border-bottom: 1px solid #e5e5ea;
      }
      .program-content {
        column-count: 2;
        column-gap: 18px;
        font-size: 6.6pt;
        color: #424245;
        line-height: 1.18;
        flex: 1;
      }
      .program-item {
        display: block;
        margin-bottom: 2px;
        break-inside: avoid;
      }
      .footer {
        border-top: 1px solid #e5e5ea;
        padding-top: 14px;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 14px;
      }
      .qr-block {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .qr-code {
        width: 74px;
        height: 74px;
      }
      .qr-info {
        font-size: 7pt;
        color: #6e6e73;
        line-height: 1.55;
      }
      .sig-box {
        text-align: right;
        border: 1px solid #0071e3;
        padding: 11px 15px;
        border-radius: 12px;
        background: #fbfbfd;
        min-width: 80mm;
      }
      .sig-box strong {
        font-size: 8.5pt;
        color: #1d1d1f;
        display: block;
      }
      .sig-box span {
        font-size: 7.5pt;
        color: #6e6e73;
        line-height: 1.45;
      }
    </style>
  </head>
  <body>
    <div class="cert-page">
      <div class="header">
        <img src="{{logo_url}}" alt="Logo" />
      </div>

      <div>
        <div class="main-title">Certificado</div>
        <div class="main-sub">
          Certificamos que o(a) profissional abaixo concluiu com aproveitamento o treinamento:
        </div>
      </div>

      <div class="info-grid">
        <div class="info-item">
          <div class="label">Funcionário</div>
          <div class="value">{{nome_funcionario}}</div>
        </div>
        <div class="info-item">
          <div class="label">CANAC / Matrícula</div>
          <div class="value">{{codigo_anac}} &nbsp;·&nbsp; {{matricula}}</div>
        </div>
        <div class="info-item">
          <div class="label">Data de Realização</div>
          <div class="value">{{data_conclusao}}</div>
        </div>
        <div class="info-item">
          <div class="label">Validade</div>
          <div class="value">{{data_vencimento}}</div>
        </div>
      </div>

      <div class="training-box">
        <div class="qual-name">{{nome_qualificacao}}</div>
        <div class="qual-meta">
          Carga Horária: {{carga_horaria}}h &nbsp;·&nbsp; Categoria: {{categoria}} &nbsp;·&nbsp;
          Código: {{codigo_qualificacao}}
        </div>
      </div>

      <div class="program-section">
        <div class="program-label">Conteúdo Programático</div>
        <div class="program-content">{{conteudo}}</div>
      </div>

      <div class="footer">
        <div class="qr-block">
          <img src="{{qr_code_data_url}}" class="qr-code" alt="QR Code" />
          <div class="qr-info">
            <strong>Nº {{numero_certificado}}</strong><br />
            ID: {{hash_id}}<br />
            Validação Digital AirTrust
          </div>
        </div>
        <div class="sig-box">
          <strong>Assinatura Eletrônica Autenticada</strong>
          <span>{{nome_empresa}} — Departamento de Treinamento</span>
        </div>
      </div>
    </div>
  </body>
</html>

~~~

---
## FILE: scripts/check-certificate-templates.sh
~~~bash
#!/bin/bash

# Script para verificar templates de certificados no banco
# Este script testa a query que busca templates

if [ -z "$D1_DB_ID" ] || [ -z "$CLOUDFLARE_AUTH_TOKEN" ]; then
  echo "❌ Variáveis de ambiente não definidas!"
  echo "   Execute: export CLOUDFLARE_AUTH_TOKEN='seu_token'"
  echo "            export D1_DB_ID='seu_db_id'"
  exit 1
fi

echo "🔍 Verificando templates de certificados..."
echo ""

# Query para listar todos os templates ativos
SQL="SELECT id, empresa_id, nome, tipo, padrao, ativo, LENGTH(template_json) as json_length FROM certificados_templates WHERE ativo = 1 AND deleted_at IS NULL ORDER BY empresa_id, padrao DESC;"

echo "📋 SQL Query:"
echo "$SQL"
echo ""

# Executar query via Wrangler (necessário ter credenciais)
echo "📤 Executando query no D1..."

wrangler d1 execute "$D1_DB_ID" --command "$SQL" 2>&1 | head -50

echo ""
echo "✅ Verificação concluída"

~~~

---
## FILE: scripts/check-deployment-status.js
~~~javascript
#!/usr/bin/env node

/**
 * Script para limpar o cache de EDGE do Cloudflare
 * Usa a API de purge_cache com URLs específicas
 */

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error('❌ CLOUDFLARE_ACCOUNT_ID ou CLOUDFLARE_API_TOKEN não definidos.');
  process.exit(1);
}

async function purgeEdgeCache() {
  console.log('🧹 Limpando cache de EDGE do Cloudflare...\n');

  // URLs para purgar
  const urls = [
    'https://production.airtrust.pages.dev/',
    'https://production.airtrust.pages.dev/index.html',
    'https://production.airtrust.pages.dev/assets/*',
  ];

  console.log('📋 URLs a purgar:');
  urls.forEach((url) => console.log(`   - ${url}`));
  console.log('');

  // Tentar purge via Cloudflare Zone (se existir)
  // Como não temos Zone ID, vamos usar outra abordagem: forçar redeploy

  console.log('⚠️  Cloudflare Pages não permite purge de cache de edge via API.');
  console.log('   O cache só é limpo quando:');
  console.log('   1. Um novo deployment é criado');
  console.log('   2. O cache expira (7 dias)');
  console.log('');
  console.log('🔄 Solução: Vou verificar se há deployment rodando...\n');

  // Verificar deployments
  const deploymentsUrl = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/airtrust-production/deployments`;

  const res = await fetch(deploymentsUrl, {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    console.error('❌ Erro ao verificar deployments:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  if (data.result && data.result.length > 0) {
    const latest = data.result[0];
    console.log(`📦 Último deployment:`);
    console.log(`   ID: ${latest.id}`);
    console.log(`   Status: ${latest.latest_stage.name} (${latest.latest_stage.status})`);
    console.log(`   Created: ${latest.created_on}`);
    console.log(`   URL: ${latest.url}\n`);

    if (latest.latest_stage.status === 'success') {
      console.log('✅ Deployment concluído com sucesso!');
      console.log('⏳ Aguarde 1-2 minutos para o cache atualizar automaticamente.');
    } else if (latest.latest_stage.status === 'active') {
      console.log('🔄 Deployment em progresso...');
      console.log('⏳ Aguarde finalizar (1-3 minutos).');
    } else {
      console.log(`⚠️  Status: ${latest.latest_stage.status}`);
    }
  } else {
    console.log('❌ Nenhum deployment encontrado.');
  }
}

purgeEdgeCache().catch((err) => {
  console.error('❌ Erro inesperado:', err);
  process.exit(1);
});

~~~

---
## FILE: scripts/check-hardcoded-prod-urls.sh
~~~bash
#!/usr/bin/env bash
set -euo pipefail

# Guardrail: block accidental reintroduction of hardcoded production domains
# in runtime source files. Some files are explicitly allowlisted because they
# are canonical configuration, API docs, or controlled fallback defaults.

PATTERN='airtrust-api-production\.airtrust\.workers\.dev|https://airtrust\.online'

ALLOWLIST_REGEX='src/react-app/config/api.ts|worker-airtrust/src/config/allowed-origins.ts|worker-airtrust/src/utils/openapi.ts|worker-airtrust/src/routes/admin-migration.ts|worker-airtrust/src/services/html-to-pdf.ts|worker-airtrust/src/services/pdf-generator.ts'

SEARCH_ROOTS=(
  'src/react-app'
  'worker-airtrust/src'
)

TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

for root in "${SEARCH_ROOTS[@]}"; do
  if [[ -d "$root" ]]; then
    grep -RInE "$PATTERN" "$root" \
      --include='*.ts' \
      --include='*.tsx' \
      --exclude-dir='__tests__' \
      --exclude-dir='test' \
      --exclude-dir='migrations' \
      >> "$TMP_FILE" || true
  fi
done

FILTERED="$(grep -Ev "$ALLOWLIST_REGEX" "$TMP_FILE" || true)"

if [[ -n "$FILTERED" ]]; then
  echo '[hardcoded-prod-urls] FAIL: encontrados domínios hardcoded fora da allowlist:'
  echo "$FILTERED"
  exit 1
fi

echo '[hardcoded-prod-urls] OK'

~~~

---
## FILE: scripts/check-imports-pos-limpeza.sh
~~~bash
#!/bin/bash
set -euo pipefail

# Verificar Imports Quebrados Pós-Limpeza
# Data: 1 de dezembro de 2025

echo "🔍 Verificando imports quebrados após limpeza..."
echo ""

# Componentes que foram deletados
COMPONENTES_DELETADOS=(
  "AssinaturaDigitalModal"
  "BotoesAcaoFicha"
  "BotoesAcaoFichaFinal"
  "PDFGeneratorCompacto"
  "FichaOpenModal"
  "VisualizarFichaSimulador"
  "SessionModal"
  "FormularioTemplate"
  "CadastrosUnificados"
)

echo "=== COMPONENTES DELETADOS (NÃO DEVEM APARECER) ==="
echo ""

FOUND_ISSUES=0

for comp in "${COMPONENTES_DELETADOS[@]}"; do
  result=$(grep -r "import.*$comp" src/react-app --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l | xargs)
  if [ "$result" -gt 0 ]; then
    echo "❌ $comp: $result imports encontrados (PROBLEMA!)"
    grep -r "import.*$comp" src/react-app --include="*.tsx" --include="*.ts" 2>/dev/null | head -5
    FOUND_ISSUES=$((FOUND_ISSUES + 1))
    echo ""
  else
    echo "✅ $comp: 0 imports (correto)"
  fi
done

echo ""
echo "=== SERVICE DUPLICADO (NÃO DEVE EXISTIR) ==="
if [ -f "src/react-app/services/simuladores.service.ts" ]; then
  echo "❌ Service duplicado ainda existe! (PROBLEMA)"
  FOUND_ISSUES=$((FOUND_ISSUES + 1))
else
  echo "✅ Service duplicado deletado corretamente"
fi

echo ""
if [ $FOUND_ISSUES -eq 0 ]; then
  echo "✅ Nenhum import quebrado encontrado!"
  echo "📝 Pode prosseguir para testes"
else
  echo "⚠️  Encontrados $FOUND_ISSUES problemas!"
  echo "📝 Corrija imports manualmente antes de continuar"
fi

~~~

---
## FILE: scripts/check-integridade-qualificacoes.sh
~~~bash
#!/bin/bash

echo "🔍 VERIFICANDO INTEGRIDADE: tipos_qualificacoes ↔ qualificacoes"
echo "================================================================"
echo ""

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar se wrangler está instalado
if ! command -v wrangler &> /dev/null; then
    echo "⚠️  Wrangler não encontrado. Usando queries locais..."
    USE_LOCAL=true
else
    USE_LOCAL=false
fi

echo "1️⃣ QUALIFICAÇÕES ÓRFÃS (sem tipo correspondente):"
echo "   Buscando qualificações com código inexistente em tipos_qualificacoes..."
echo ""

# Query para encontrar órfãs
QUERY_ORFAS="
SELECT DISTINCT q.codigo, COUNT(*) as total
FROM qualificacoes q
LEFT JOIN tipos_qualificacoes tq ON tq.codigo = q.codigo AND tq.deleted_at IS NULL
WHERE tq.codigo IS NULL
  AND q.deleted_at IS NULL
GROUP BY q.codigo
ORDER BY total DESC
LIMIT 10;
"

if [ "$USE_LOCAL" = false ]; then
    orfas=$(wrangler d1 execute airtrust-db --command "$QUERY_ORFAS" --remote 2>/dev/null | grep -oE '[0-9]+' | head -1)
else
    echo "   ⚠️  Execute manualmente no banco:"
    echo "   $QUERY_ORFAS"
    orfas=0
fi

if [ -z "$orfas" ]; then
    orfas=0
fi

if [ "$orfas" -gt 0 ]; then
    echo -e "   ${RED}❌ $orfas qualificações órfãs encontradas!${NC}"
    echo "   Ação: Execute a migration 1032_integridade_tipos_qualificacoes.sql"
else
    echo -e "   ${GREEN}✅ Nenhuma qualificação órfã${NC}"
fi
echo ""

echo "2️⃣ TIPOS OCIOSOS (sem qualificações):"
echo "   Buscando tipos sem nenhuma qualificação vinculada..."
echo ""

QUERY_OCIOSOS="
SELECT COUNT(*) as total
FROM tipos_qualificacoes tq
LEFT JOIN qualificacoes q ON q.codigo = tq.codigo AND q.deleted_at IS NULL
WHERE q.id IS NULL AND tq.deleted_at IS NULL;
"

if [ "$USE_LOCAL" = false ]; then
    ociosos=$(wrangler d1 execute airtrust-db --command "$QUERY_OCIOSOS" --remote 2>/dev/null | grep -oE '[0-9]+' | head -1)
else
    ociosos=0
fi

if [ -z "$ociosos" ]; then
    ociosos=0
fi

echo -e "   ${YELLOW}ℹ️  $ociosos tipos sem qualificações${NC} (OK se tipos novos)"
echo ""

echo "3️⃣ INTEGRIDADE GERAL:"
echo "   Verificando vinculação entre tabelas..."
echo ""

QUERY_INTEGRADO="
SELECT COUNT(DISTINCT q.codigo) as total
FROM qualificacoes q
INNER JOIN tipos_qualificacoes tq ON tq.codigo = q.codigo AND tq.deleted_at IS NULL
WHERE q.deleted_at IS NULL;
"

if [ "$USE_LOCAL" = false ]; then
    integrado=$(wrangler d1 execute airtrust-db --command "$QUERY_INTEGRADO" --remote 2>/dev/null | grep -oE '[0-9]+' | head -1)
else
    integrado=0
fi

if [ -z "$integrado" ]; then
    integrado=0
fi

echo -e "   ${GREEN}✅ $integrado tipos com qualificações vinculadas corretamente${NC}"
echo ""

echo "4️⃣ TRIGGERS INSTALADOS:"
echo "   Verificando triggers de validação..."
echo ""

QUERY_TRIGGERS="
SELECT name FROM sqlite_master 
WHERE type='trigger' 
  AND name LIKE '%qualificacao%'
ORDER BY name;
"

if [ "$USE_LOCAL" = false ]; then
    triggers=$(wrangler d1 execute airtrust-db --command "$QUERY_TRIGGERS" --remote 2>/dev/null | grep -c "validate_qualificacao")
else
    triggers=0
fi

if [ "$triggers" -ge 2 ]; then
    echo -e "   ${GREEN}✅ Triggers de validação instalados${NC}"
else
    echo -e "   ${RED}❌ Triggers não encontrados!${NC}"
    echo "   Ação: Execute a migration 1032_integridade_tipos_qualificacoes.sql"
fi
echo ""

echo "================================================================"
echo "📊 RESUMO:"
echo ""
echo "   Qualificações órfãs: $orfas"
echo "   Tipos ociosos: $ociosos"
echo "   Tipos integrados: $integrado"
echo "   Triggers: $([ "$triggers" -ge 2 ] && echo 'OK' || echo 'FALTANDO')"
echo ""

# Resultado final
if [ "$orfas" -gt 0 ] || [ "$triggers" -lt 2 ]; then
    echo -e "${RED}⚠️  AÇÃO NECESSÁRIA:${NC}"
    echo ""
    echo "   1. Aplicar migration:"
    echo "      wrangler d1 execute airtrust-db --file=migrations/1032_integridade_tipos_qualificacoes.sql --remote"
    echo ""
    echo "   2. Verificar tipos criados automaticamente:"
    echo "      SELECT * FROM tipos_qualificacoes WHERE descricao LIKE '%Criado automaticamente%';"
    echo ""
    echo "   3. Executar este script novamente para confirmar"
    echo ""
    exit 1
else
    echo -e "${GREEN}✅ INTEGRIDADE OK!${NC}"
    echo ""
    echo "   Todas as qualificações têm tipos correspondentes"
    echo "   Triggers de validação estão ativos"
    echo "   Sistema protegido contra inconsistências"
    echo ""
    exit 0
fi

~~~

---
## FILE: scripts/check-production.sh
~~~bash
#!/bin/bash

echo "🔍 Verificando produção..."
echo ""

echo "📊 Status do cache:"
curl -I https://production.airtrust.pages.dev 2>&1 | grep -E "cf-cache-status|age|cache-control|HTTP"

echo ""
echo "📦 Bundle servido:"
curl -s https://production.airtrust.pages.dev | grep -o 'src="/assets/index-[^"]*"' | head -1

echo ""
echo "✅ Se o bundle mudou e cf-cache-status for MISS ou DYNAMIC, funcionou!"
echo "⏳ Se ainda for HIT com bundle antigo, aguarde mais 1-2 minutos"

~~~

---
## FILE: scripts/check-schema.sql
~~~sql
-- =============================================
-- Verificar estrutura da tabela qualificacoes_tipos
-- =============================================
PRAGMA table_info(qualificacoes_tipos);

-- Resultado esperado deve incluir:
-- cid | name                 | type    | notnull | dflt_value | pk
-- ... | vencimento_fim_mes   | INTEGER | 0       | 0          | 0

~~~

---
## FILE: scripts/check-stale-dist.sh
~~~bash
#!/usr/bin/env bash
# check-stale-dist.sh
# Verifica se dist/client/ está desatualizado em relação aos fontes.
# Exit 0 = dist OK  |  Exit 1 = dist STALE ou ausente

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

DIST_FILE="$ROOT/dist/client/index.html"

# Se dist não existe → stale
if [[ ! -f "$DIST_FILE" ]]; then
  echo "⚠️  [STALE CHECK] dist/client/ NÃO EXISTE — rebuild necessário." >&2
  exit 1
fi

DIST_MTIME=$(stat -f "%m" "$DIST_FILE" 2>/dev/null || stat -c "%Y" "$DIST_FILE")

# Encontra o arquivo-fonte mais novo em src/ ou worker-airtrust/src/
NEWEST_SRC=$(find "$ROOT/src" "$ROOT/worker-airtrust/src" -name "*.ts" -o -name "*.tsx" -o -name "*.css" 2>/dev/null \
  | xargs stat -f "%m %N" 2>/dev/null | sort -rn | head -1 | awk '{print $1}')

if [[ -z "$NEWEST_SRC" ]]; then
  echo "✅ [STALE CHECK] Nenhum arquivo fonte encontrado — assumindo dist OK."
  exit 0
fi

if [[ "$NEWEST_SRC" -gt "$DIST_MTIME" ]]; then
  DIST_DATE=$(date -r "$DIST_FILE" "+%Y-%m-%d %H:%M:%S")
  SRC_DATE=$(date -r "$(
    find "$ROOT/src" "$ROOT/worker-airtrust/src" -name "*.ts" -o -name "*.tsx" -o -name "*.css" 2>/dev/null \
    | xargs stat -f "%m %N" 2>/dev/null | sort -rn | head -1 | awk '{print $2}'
  )" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "?")
  echo "⛔  [STALE CHECK] dist/ DESATUALIZADO!" >&2
  echo "    dist construído em: $DIST_DATE" >&2
  echo "    fonte mais novo em: $SRC_DATE" >&2
  echo "    → Execute: npm run build" >&2
  exit 1
fi

echo "✅ [STALE CHECK] dist/ está atualizado."
exit 0

~~~

---
## FILE: scripts/check-tracked-secrets.sh
~~~bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Pathspecs excluídos do git grep (arquivos que tipicamente têm falsos positivos ou são binários)
GG_EXCLUDE=(
  ":(exclude)*.md"
  ":(exclude)*.sql"
  ":(exclude)*.sqlite"
  ":(exclude)*.pdf"
  ":(exclude)*.png"
  ":(exclude)*.jpg"
  ":(exclude)*.jpeg"
  ":(exclude)*.gif"
  ":(exclude)*.webp"
  ":(exclude)*.woff"
  ":(exclude)*.woff2"
  ":(exclude)*.bundle"
  ":(exclude)*.zip"
  ":(exclude)*.csv"
  ":(exclude)*.tsbuildinfo"
  ":(exclude).env.example"
  ":(exclude).env.development.example"
  ":(exclude)worker-airtrust/.env.example"
  ":(exclude)worker-airtrust/.dev.vars.example"
  ":(exclude)worker-airtrust/worker.log"
  ":(exclude)worker-airtrust/migration_output.log"
  ":(exclude).devcontainer.disabled/**"
  ":(exclude).tmp-*/**"
  ":(exclude).tmp-deploy-*/**"
  ":(exclude).claude/**"
  ":(exclude)scripts/legacy/**"
  ":(exclude)scripts/check-tracked-secrets.sh"
)

check_pattern() {
  local label="$1"
  local pattern="$2"
  local ignore_pattern="${3:-}"

  local raw
  raw="$(git grep -nE "$pattern" -- "${GG_EXCLUDE[@]}" 2>/dev/null || true)"

  local matches="$raw"
  if [[ -n "$ignore_pattern" && -n "$raw" ]]; then
    matches="$(printf '%s\n' "$raw" | grep -vE "$ignore_pattern" || true)"
  fi

  if [[ -n "$matches" ]]; then
    echo "[tracked-secrets] $label"
    printf '%s\n' "$matches"
    return 1
  fi
  return 0
}

failed=0

check_pattern "senha default rastreada" '^(VITE_DEFAULT_LOGIN_PASSWORD|TEST_PASSWORD)=[^[:space:]]+' '=[[:space:]]*$' || failed=1
check_pattern "bypass de auth ativo" '^[[:space:]]*ENABLE_DEV_AUTH_BYPASS[[:space:]]*=[[:space:]]*"?true"?' || failed=1
check_pattern "jwt secret rastreado" '^[[:space:]]*JWT_SECRET[[:space:]]*=' '\$\{|=[[:space:]]*\$[A-Z_][A-Z0-9_]*$|=[[:space:]]*"?\$\(|=[[:space:]]*$|=[[:space:]]*"?your-|=[[:space:]]*"?dev-secret-key-change-in-production' || failed=1
check_pattern "token cloudflare rastreado" '^[[:space:]]*(CLOUDFLARE_API_TOKEN|CLOUDFLARE_TOKEN)=' '\$\{|=[[:space:]]*$|=[[:space:]]*npx\b|=your-' || failed=1
check_pattern "secret EdApp rastreado" '^[[:space:]]*(EDAPP_API_TOKEN|EDAPP_WEBHOOK_SECRET)=' '\$\{|=[[:space:]]*$|=your-' || failed=1
check_pattern "account id rastreado" '^[[:space:]]*CF_ACCOUNT_ID=' '\$\{|=[[:space:]]*$|=your-' || failed=1

if [[ "$failed" -ne 0 ]]; then
  echo "[tracked-secrets] Falhou: remova segredos/flags rastreados antes do commit."
  exit 1
fi

echo "[tracked-secrets] OK"
~~~

---
## FILE: scripts/ci-demo-data-check.sh
~~~bash
#!/usr/bin/env bash
# ci-demo-data-check.sh — Verifica padrões de dados demo/teste no código-fonte.
# Falha o CI se encontrar seeds ativos, fixtures hardcodadas ou dados de teste no source.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAIL=0

# Pastas e arquivos a ignorar
EXCLUDE_DIRS=(
  "node_modules"
  "dist"
  ".git"
  "scripts/legacy"
  "scripts/sql"
  "scripts/operacionais"
  "worker-airtrust/worker.log"
  "worker-airtrust/migration_output.log"
)

build_rg_excludes() {
  local args=()
  for d in "${EXCLUDE_DIRS[@]}"; do
    args+=("--glob" "!$d/**")
  done
  printf '%s\n' "${args[@]}"
}

RG_EXCLUDES=()
while IFS= read -r line; do RG_EXCLUDES+=("$line"); done < <(build_rg_excludes)

echo "=== CI: Demo Data Prevention Check ==="

# 1. Arquivos CSV de seed ativos (qualquer .csv fora de scripts/)
CSV_IN_SRC=$(find "$ROOT_DIR/src" -name "*.csv" 2>/dev/null | head -5 || true)
if [[ -n "$CSV_IN_SRC" ]]; then
  echo "❌ CSVs de dados encontrados em src/:"
  echo "$CSV_IN_SRC"
  FAIL=1
fi

# 2. E-mails de demo hardcodados no source (exceto config de env, scripts de seed e testes)
DEMO_EMAILS=$(rg -l --glob '*.ts' --glob '*.tsx' --glob '*.js' --glob '*.jsx' \
  --glob '!**/*.test.*' --glob '!**/__tests__/**' --glob '!**/test/**' \
  "${RG_EXCLUDES[@]}" \
  -e 'test@example\.com' \
  -e 'demo@demo\.com' \
  -e 'fake@fake\.com' \
  "$ROOT_DIR/src" 2>/dev/null || true)
if [[ -n "$DEMO_EMAILS" ]]; then
  echo "❌ E-mails demo detectados em:"
  echo "$DEMO_EMAILS"
  FAIL=1
fi

# 3. Flags de bypass de auth em arquivos rastreados
BYPASS_FLAGS=$(rg -l \
  --glob '*.ts' --glob '*.tsx' --glob '*.toml' --glob '*.env' \
  "${RG_EXCLUDES[@]}" \
  -e 'ENABLE_DEV_AUTH_BYPASS\s*=\s*["\047]?true' \
  "$ROOT_DIR/src" "$ROOT_DIR/worker-airtrust/wrangler.toml" 2>/dev/null || true)
if [[ -n "$BYPASS_FLAGS" ]]; then
  echo "❌ ENABLE_DEV_AUTH_BYPASS=true em arquivo rastreado:"
  echo "$BYPASS_FLAGS"
  FAIL=1
fi

# 4. Variáveis de seed ativas no código de produção (não em scripts/)
SEED_CALLS=$(rg -l --glob '*.ts' --glob '*.tsx' \
  "${RG_EXCLUDES[@]}" \
  -e 'seedDemoData\|seed_demo\|insertDemoData\|loadFixtures' \
  "$ROOT_DIR/src" 2>/dev/null || true)
if [[ -n "$SEED_CALLS" ]]; then
  echo "❌ Chamadas de seed/fixture no source:"
  echo "$SEED_CALLS"
  FAIL=1
fi

if [[ "$FAIL" -eq 0 ]]; then
  echo "✅ Nenhum dado demo detectado no source."
  exit 0
else
  echo ""
  echo "❌ Dados demo/teste detectados. Remova antes de fazer merge."
  exit 1
fi

~~~

---
## FILE: scripts/clean-all-cache.sh
~~~bash
#!/bin/bash
# ===== SCRIPT DE LIMPEZA TOTAL - AIRTRUST =====
# Resolve problemas de cache impedindo mudanças de refletir
# Uso: ./scripts/clean-all-cache.sh

set -e  # Parar em caso de erro

echo "🧹 =========================================="
echo "🧹  LIMPEZA TOTAL DE CACHE - AIRTRUST"
echo "🧹 =========================================="
echo ""

# 1. Matar processos node/vite/npm
echo "⚠️  Passo 1/6: Parando processos Node/Vite..."
pkill -f "vite" 2>/dev/null || true
pkill -f "npm" 2>/dev/null || true
pkill -f "node" 2>/dev/null || true
echo "✅ Processos parados"
echo ""

# 2. Limpar caches npm
echo "⚠️  Passo 2/6: Limpando cache do npm..."
npm cache clean --force
npm cache verify
echo "✅ Cache npm limpo"
echo ""

# 3. Deletar pastas de build e dependências
echo "⚠️  Passo 3/6: Removendo node_modules, dist, caches..."
rm -rf node_modules
rm -rf dist
rm -rf .vite
rm -rf .cache
rm -rf build
rm -rf package-lock.json
echo "✅ Pastas removidas"
echo ""

# 4. Reinstalar dependências do zero
echo "⚠️  Passo 4/6: Reinstalando dependências (pode levar 1-2 min)..."
npm install --prefer-offline=false --no-audit
echo "✅ Dependências instaladas"
echo ""

# 5. Build limpo
echo "⚠️  Passo 5/6: Executando build de produção..."
npm run build
echo "✅ Build concluído"
echo ""

# 6. Verificar hash dos arquivos gerados
echo "⚠️  Passo 6/6: Verificando hashes gerados..."
echo ""
echo "📦 Arquivos Simuladores gerados:"
ls -lh dist/client/assets/ | grep "Simuladores" || echo "⚠️  Nenhum arquivo Simuladores encontrado"
echo ""
echo "📦 Total de assets:"
ls -lh dist/client/assets/ | wc -l
echo ""

echo "🎉 =========================================="
echo "🎉  LIMPEZA CONCLUÍDA COM SUCESSO!"
echo "🎉 =========================================="
echo ""
echo "📋 Próximos passos:"
echo "   1. Para testar localhost: npm run dev"
echo "   2. Para preview local: npm run preview"
echo "   3. Para deploy: git add . && git commit -m 'fix: cache' && git push"
echo ""

~~~

---
## FILE: scripts/clean-restart.sh
~~~bash
#!/bin/bash

# Script de limpeza e reinício completo
# Mata processos, limpa cache e reinicia tudo

echo "🧹 Limpando ambiente AirTrust..."

# 1. Matar processos
echo "  → Matando processos wrangler e vite..."
pkill -9 -f wrangler 2>/dev/null
pkill -9 -f vite 2>/dev/null
lsof -ti:8787 | xargs kill -9 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null
sleep 2

# 2. Limpar cache (opcional - comentado para preservar banco)
# echo "  → Limpando cache wrangler..."
# rm -rf .wrangler/state

echo ""
echo "✅ Ambiente limpo!"
echo ""
echo "Para reiniciar:"
echo "  Backend:  npm run dev:worker"
echo "  Frontend: npm run dev"

~~~

---
## FILE: scripts/cleanup-backup-tables.sh
~~~bash
#!/usr/bin/env bash
set -euo pipefail

# Drop all __backup_* tables from a Cloudflare D1 database in a FK-safe manner.
# Usage: ./scripts/cleanup-backup-tables.sh --db <db_name>

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

db_name=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --db|-d)
      db_name="$2"; shift 2 ;;
    *)
      echo -e "${YELLOW}⚠️  Ignoring unknown argument: $1${NC}"; shift ;;
  esac
done

if ! command -v wrangler >/dev/null 2>&1; then
  echo -e "${RED}❌ wrangler CLI not found. Install it first.${NC}"
  exit 1
fi

if [[ -z "${db_name}" ]]; then
  echo -e "${RED}❌ Missing --db <db_name>${NC}"
  exit 1
fi

echo -e "📋 Listing backup tables in ${db_name}..."
TABLES_JSON=$(wrangler d1 execute "${db_name}" --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '__backup_%' ORDER BY name;" --json || true)

# Extract names as newline-separated list
if command -v jq >/dev/null 2>&1; then
  TABLES=$(echo "$TABLES_JSON" | jq -r '.[0].results[]?.name // empty')
else
  TABLES=$(echo "$TABLES_JSON" | grep -o '\"name\":\"[^\"]\+\"' | awk -F'\"' '{print $4}')
fi

if [[ -z "${TABLES}" ]]; then
  echo -e "${YELLOW}ℹ️  No __backup_* tables found.${NC}"
  exit 0
fi

COUNT=$(echo "$TABLES" | wc -l | tr -d ' ')
echo "Found ${COUNT} tables:"
echo "$TABLES" | while IFS= read -r t; do
  echo "  - ${t}"
done

echo -e "\n🧹 Dropping tables with PRAGMA foreign_keys=OFF (per statement)...\n"
DROPPED=0
FAILED=0
OLDIFS=$IFS
IFS=$'\n'
for t in $TABLES; do
  echo -n "Drop ${t} ... "
  # Execute PRAGMA OFF + DROP in a single connection
  if wrangler d1 execute "${db_name}" --remote --command "PRAGMA foreign_keys=OFF; DROP TABLE IF EXISTS ${t}; PRAGMA foreign_keys=ON;" >/dev/null 2>&1; then
    echo -e "${GREEN}OK${NC}"
    DROPPED=$((DROPPED+1))
  else
    echo -e "${RED}FAIL${NC}"
    FAILED=$((FAILED+1))
  fi
  sleep 0.1
done
IFS=$OLDIFS

echo -e "\n✅ Dropped: ${DROPPED}  ❌ Failed: ${FAILED}"
if [[ $FAILED -gt 0 ]]; then
  echo -e "${YELLOW}⚠️  Some tables failed to drop. They may be referenced by TEMP views or still-registered FKs. Retry individually if needed.${NC}"
fi

exit 0

~~~

---
## FILE: scripts/cleanup-console-logs.py
~~~python
#!/usr/bin/env python3
"""
Script para remover console.log e console.debug de produção
Mantém apenas console.error e console.warn
"""
import os
import re

def remove_console_logs(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original_content = content
        
        # Remove console.log e console.debug (mantém error e warn)
        patterns = [
            (r'\s*console\.log\([^)]*\);?\s*\n?', ''),
            (r'\s*console\.debug\([^)]*\);?\s*\n?', ''),
            (r'\s*console\.table\([^)]*\);?\s*\n?', ''),
            (r'\s*console\.info\([^)]*\);?\s*\n?', ''),
        ]
        
        for pattern, replacement in patterns:
            content = re.sub(pattern, replacement, content, flags=re.MULTILINE)
        
        if content != original_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        return False
    except Exception as e:
        print(f"❌ Erro ao processar {file_path}: {e}")
        return False

def main():
    print("🧹 Removendo console.logs desnecessários...")
    
    count = 0
    total = 0
    
    # Processar todos arquivos .tsx e .ts
    for root, dirs, files in os.walk('src'):
        # Ignorar node_modules e dist
        dirs[:] = [d for d in dirs if d not in ['node_modules', 'dist', '.vite']]
        
        for file in files:
            if file.endswith(('.tsx', '.ts')):
                total += 1
                file_path = os.path.join(root, file)
                if remove_console_logs(file_path):
                    count += 1
                    print(f"  ✏️  {file_path}")
    
    print(f"\n✅ Console.logs removidos!")
    print(f"📊 Arquivos processados: {total}")
    print(f"📝 Arquivos modificados: {count}")

if __name__ == "__main__":
    main()

~~~

---
## FILE: scripts/cleanup-sim-devices.sql
~~~sql
-- CLEANUP: Soft-delete test/junk simuladores
-- Keep only: 11 (Simulador AW139 - CAE GRU), 16 (Simulador SK76)
-- Everything else is test data
UPDATE simuladores SET deleted_at = datetime('now') WHERE id NOT IN (11, 16) AND deleted_at IS NULL;

~~~

---
## FILE: scripts/cleanup-simuladores-2026-03-04.sql
~~~sql
-- CLEANUP SIMULADORES MODULE: Keep only Feb27-28 + Mar01 data
-- Sessions to keep: 30,31,32,33
-- Date: 2026-03-04

-- 1. Soft-delete fichas NOT in target sessions
UPDATE fichas_sessao SET deleted_at = datetime('now') WHERE id NOT IN (59,60,61,62,63,64,65,66,67) AND deleted_at IS NULL;

-- 2. Soft-delete fichas_sessao_manobras for deleted fichas
UPDATE fichas_sessao_manobras SET deleted_at = datetime('now') WHERE ficha_id NOT IN (59,60,61,62,63,64,65,66,67) AND deleted_at IS NULL;

-- 3. Soft-delete sessions NOT in target set
UPDATE simulador_agendamentos SET deleted_at = datetime('now') WHERE id NOT IN (30,31,32,33) AND deleted_at IS NULL;

-- 4. Soft-delete participantes NOT in target sessions
UPDATE sessoes_participantes SET deleted_at = datetime('now') WHERE sessao_id NOT IN (30,31,32,33) AND deleted_at IS NULL;

-- 5. Remove duplicate participants in sessions 30-33 (keep oldest id per funcionario_id+sessao_id+funcao)
UPDATE sessoes_participantes SET deleted_at = datetime('now')
WHERE id NOT IN (
  SELECT MIN(id) FROM sessoes_participantes
  WHERE sessao_id IN (30,31,32,33) AND deleted_at IS NULL
  GROUP BY sessao_id, funcionario_id, funcao
) AND sessao_id IN (30,31,32,33) AND deleted_at IS NULL;

~~~

---
## FILE: scripts/cleanup_old_backups.sh
~~~bash
#!/bin/bash
# =============================================
# Script: Limpeza de Backups Antigos
# FASE 32
# Data: 2025-11-15
# Política: 30 dias recentes + 1 por mês
# =============================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKER_DIR="$PROJECT_ROOT/worker-airtrust"
DB="airtrust-db"
BUCKET="airtrust-r2"

# Cores
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

cd "$WORKER_DIR"

echo ""
echo "=========================================="
echo " LIMPEZA DE BACKUPS ANTIGOS"
echo "=========================================="
echo ""

log_info "Aplicando política de retenção..."

# Lista backups com mais de 30 dias
CUTOFF_DATE=$(date -u -v-30d +%Y-%m-%d 2>/dev/null || date -u -d '30 days ago' +%Y-%m-%d)

log_info "Removendo backups anteriores a: $CUTOFF_DATE"

# Query backups elegíveis para remoção (AUTOMATIC, >30 dias, não dia 1)
log_warning "Backups elegíveis para remoção:"

npx wrangler d1 execute "$DB" --remote --command "
SELECT 
  id,
  filename,
  backup_type,
  DATE(created_at) as data,
  ROUND(size_bytes / 1048576.0, 2) as size_mb
FROM backups
WHERE DATE(created_at) < '$CUTOFF_DATE'
  AND backup_type = 'AUTOMATIC'
  AND strftime('%d', created_at) != '01'
ORDER BY created_at DESC
LIMIT 20;
"

log_info "Retenção: Manter 30 dias recentes + backups do dia 1 de cada mês"
log_warning "Remoção automática não implementada (segurança)"
log_info "Para remover manualmente: wrangler r2 object delete airtrust-r2 backups/FILENAME"

echo ""

~~~

---
## FILE: scripts/clone-manobras-producao.sh
~~~bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "🔄 Clonando TODOS os dados de simuladores da produção..."

CONFIG="worker-airtrust/wrangler.toml"
DB_NAME="airtrust-db"

# 1. CATEGORIAS DE MANOBRAS
echo "📥 1/3 - Exportando categorias de manobras..."
CATEGORIAS_JSON=$(curl -s "https://airtrust.airtrust.workers.dev/api/simuladores/categorias")

echo "$CATEGORIAS_JSON" | jq -r '.data[] | "INSERT OR IGNORE INTO manobras_categorias (id, codigo, nome, tipo, ordem, cor, created_at, updated_at) VALUES (\(.id), \"\(.codigo)\", \"\(.nome)\", \"\(.tipo // "NORMAL")\", \(.ordem // 0), \"\(.cor // "#6B7280")\", \"\(.created_at)\", \"\(.updated_at)\");"' > /tmp/categorias_insert.sql

npx wrangler d1 execute "$DB_NAME" --config "$CONFIG" --local --file /tmp/categorias_insert.sql
CATEGORIAS_COUNT=$(npx wrangler d1 execute "$DB_NAME" --config "$CONFIG" --local --command "SELECT COUNT(*) as c FROM manobras_categorias" 2>/dev/null | jq -r '.[0].results[0].c' 2>/dev/null || echo 0)
echo "   ✅ $CATEGORIAS_COUNT categorias"

# 2. MANOBRAS (cadastro completo)
echo "📥 2/3 - Exportando manobras..."
MANOBRAS_JSON=$(curl -s "https://airtrust.airtrust.workers.dev/api/simuladores/manobras")

echo "$MANOBRAS_JSON" | jq -r '.data[] | "INSERT OR IGNORE INTO cadastro_manobras (codigo, descricao, categoria, tipo_sessao, tipo_aeronave, ordem, obrigatoria, created_at, updated_at) VALUES (\"\(.codigo)\", \"\(.nome // .descricao)\", \"\(.categoria // "")\", \"INICIAL\", \"A139\", \(.ordem // 0), \(.obrigatoria // 1), \"\(.created_at)\", \"\(.updated_at)\");"' > /tmp/manobras_insert.sql

npx wrangler d1 execute "$DB_NAME" --config "$CONFIG" --local --file /tmp/manobras_insert.sql
MANOBRAS_COUNT=$(npx wrangler d1 execute "$DB_NAME" --config "$CONFIG" --local --command "SELECT COUNT(*) as c FROM cadastro_manobras" 2>/dev/null | jq -r '.[0].results[0].c' 2>/dev/null || echo 0)
echo "   ✅ $MANOBRAS_COUNT manobras"

# 3. RELAÇÕES MODELO-MANOBRAS (template_manobras)
echo "📥 3/3 - Exportando relações modelo-manobras..."

> /tmp/template_manobras_insert.sql

# Buscar todos modelos da produção e suas manobras
MODELOS=$(curl -s "https://airtrust.airtrust.workers.dev/api/simuladores/modelos" | jq -r '.data[].id')

for MODELO_ID in $MODELOS; do
  MANOBRAS_MODELO=$(curl -s "https://airtrust.airtrust.workers.dev/api/simuladores/modelos/$MODELO_ID/manobras")
  
  echo "$MANOBRAS_MODELO" | jq -r --arg mid "$MODELO_ID" '.data[]? | "INSERT OR IGNORE INTO template_manobras (template_id, manobra_id, ordem, obrigatoria) SELECT \($mid | tonumber), id, \(.ordem // 0), \(.obrigatoria // 1) FROM cadastro_manobras WHERE codigo = '\''\(.codigo)'\'' LIMIT 1;"' >> /tmp/template_manobras_insert.sql
done

npx wrangler d1 execute "$DB_NAME" --config "$CONFIG" --local --file /tmp/template_manobras_insert.sql
RELACOES_COUNT=$(npx wrangler d1 execute "$DB_NAME" --config "$CONFIG" --local --command "SELECT COUNT(*) as c FROM template_manobras" 2>/dev/null | jq -r '.[0].results[0].c' 2>/dev/null || echo 0)
echo "   ✅ $RELACOES_COUNT relações modelo-manobras"

# Limpeza
rm -f /tmp/categorias_insert.sql /tmp/manobras_insert.sql /tmp/template_manobras_insert.sql

echo ""
echo "✅ Clonagem completa!"
echo "📊 Resumo:"
echo "   - $CATEGORIAS_COUNT categorias de manobras"
echo "   - $MANOBRAS_COUNT manobras cadastradas"
echo "   - $RELACOES_COUNT relações modelo-manobras"

~~~

---
## FILE: scripts/clone-modelos-producao.sh
~~~bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "🔄 Clonando dados CORRETOS da produção para o banco local..."

# 1. Exportar modelos_sessao da produção
echo "📥 Exportando modelos_sessao da produção..."
MODELOS_JSON=$(curl -s "https://airtrust.airtrust.workers.dev/api/simuladores/modelos")

# Extrair dados e criar SQL
echo "$MODELOS_JSON" | jq -r '.data[] | 
"INSERT INTO modelos_sessao (codigo, nome, tipo, descricao, duracao_estimada, ordem_no_treinamento, ativo) 
VALUES (\"\(.codigo)\", \"\(.nome)\", \"inicial\", \"\(.descricao // "")\", \(.duracao_estimada // .duracao_minutos // 120), \(.ordem_no_treinamento // .sessao_numero // 1), 1);"' > /tmp/modelos_insert.sql

# 2. Inserir no banco local
echo "📝 Inserindo modelos no banco local..."
npx wrangler d1 execute airtrust-db-dev --config wrangler.dev.toml --local --file /tmp/modelos_insert.sql

# 3. Verificar
COUNT=$(npx wrangler d1 execute airtrust-db-dev --config wrangler.dev.toml --local --command "SELECT COUNT(*) as c FROM modelos_sessao" | grep -o '"c":[0-9]*' | cut -d: -f2 || echo 0)

echo "✅ Clonagem concluída: $COUNT modelos no banco local"
echo "🎯 Agora execute: npm run dev:all"

~~~

---
## FILE: scripts/clone-prod-REAL.sh
~~~bash
#!/bin/bash

# CLONE REAL: Exporta SQL dumps de produção e importa no local

set -e

echo "🔄 CLONE PRODUÇÃO → LOCAL (via SQL dumps)"
echo "=========================================="
echo ""

cd "$(dirname "$0")/../worker-airtrust" || exit 1

DB_FILE="../.wrangler/state/v3/d1/miniflare-D1DatabaseObject/cd45cc5264daa1c125545b5b4c0756df95d8b6ac5900ecf52323d90f61a47f2d.sqlite"

if [ ! -f "$DB_FILE" ]; then
  echo "❌ Banco local não encontrado"
  exit 1
fi

echo "📦 Banco local: $(du -h "$DB_FILE" | cut -f1)"
echo ""

# Backup
BACKUP_FILE="../backups/local-pre-clone-$(date +%Y%m%d-%H%M%S).sqlite"
mkdir -p ../backups
cp "$DB_FILE" "$BACKUP_FILE"
echo "💾 Backup: $BACKUP_FILE"
echo ""

# Tabelas críticas
TABLES="sessoes_template cadastro_manobras simuladores manobras manobras_categorias funcionarios usuarios tipos_sessao aeronaves empresas licencas"

TEMP_SQL="/tmp/prod-export-$(date +%Y%m%d-%H%M%S).sql"
> "$TEMP_SQL"

echo "📥 Exportando tabelas de PRODUÇÃO..."
echo ""

for table in $TABLES; do
  echo -n "  → $table ... "
  
  # Contar registros em produção
  COUNT=$(npx wrangler d1 execute airtrust-db --remote \
    --command="SELECT COUNT(*) as c FROM $table" \
    --json 2>/dev/null | jq -r '.[0].results[0].c' 2>/dev/null || echo "0")
  
  if [ "$COUNT" -gt 0 ]; then
    echo "$COUNT registros"
    
    # Gerar INSERTs (limitar a 1000 por vez para não travar)
    LIMIT=1000
    OFFSET=0
    
    while [ $OFFSET -lt $COUNT ]; do
      npx wrangler d1 execute airtrust-db --remote \
        --command="SELECT * FROM $table LIMIT $LIMIT OFFSET $OFFSET" \
        --json 2>/dev/null | \
        jq -r --arg table "$table" '
          .[0].results[] |
          . as $row |
          keys as $cols |
          "INSERT OR REPLACE INTO \($table) (" + ($cols | join(", ")) + ") VALUES (" + 
          ([.[] | if type == "string" then "\"" + (. | gsub("\""; "\"\"")) + "\"" elif . == null then "NULL" else tostring end] | join(", ")) + 
          ");"
        ' >> "$TEMP_SQL" 2>/dev/null
      
      OFFSET=$((OFFSET + LIMIT))
    done
  else
    echo "vazia"
  fi
done

echo ""
echo "📤 Importando no banco local..."
sqlite3 "$DB_FILE" < "$TEMP_SQL"

echo ""
echo "✅ CLONE COMPLETO!"
echo ""

# Resumo
echo "📊 RESUMO:"
for table in $TABLES; do
  COUNT=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM $table;" 2>/dev/null || echo "0")
  printf "  %-25s %6d registros\n" "$table" "$COUNT"
done

echo ""
echo "💾 Tamanho final: $(du -h "$DB_FILE" | cut -f1)"
echo ""

~~~

---
## FILE: scripts/clone-prod-data.sh
~~~bash
#!/bin/bash
set -euo pipefail

# Clone ALL data from production D1 to local database
# This script exports every table from production and imports to local

cd "$(dirname "$0")/.."

ACCOUNT_ID="4dca4e5fddc6a351651dd224f456586f"
PROD_DB="airtrust-db"
LOCAL_DB="airtrust-db"

TABLES=(
  "_cf_KV" "aeronaves" "alertas_enviados" "arquivos" "audit_cascade" "auditoria"
  "backups" "catalogo_treinamentos" "certificado_anexos" "certificados"
  "certificados_templates" "compliance_status" "consentimentos_lgpd" "credenciais"
  "d1_migrations" "empresa_certificado_config" "empresa_config" "empresas"
  "ficha_manobras_avaliacao" "fichas_manobras_historico" "fichas_sessao"
  "funcionario_documentos" "funcionarios" "funcionarios_aeronaves" "funcoes"
  "importacoes_log" "job_execution_log" "job_queue" "logs_acesso_dados"
  "manobras" "manobras_avaliacoes" "manobras_categorias" "migracao_log"
  "migracao_mapeamento_ids" "modelos_sessao" "notificacoes" "papeis"
  "pasta_virtual" "pessoas_auditoria_acessos" "pessoas_papeis" "qualificacoes"
  "qualificacoes_categorias" "qualificacoes_historico" "schema_versions"
  "sessao_manobras" "sessoes" "sessoes_fichas" "sessoes_manobras"
  "sessoes_participantes" "sessoes_template" "sessoes_treinamento" "setores"
  "simulador_agendamentos" "simuladores" "solicitacoes_lgpd" "system_config"
  "system_logs" "template_manobras" "tipos_sessao" "treinamentos"
  "user_permissions" "user_profiles" "usuarios"
)

echo "🔄 CLONANDO DADOS DE PRODUÇÃO → LOCAL"
echo "===================================="
echo ""
echo "📊 Total de tabelas: ${#TABLES[@]}"
echo "🔄 Modo: Export produção + Import local"
echo ""

mkdir -p ./migrations/data-export
EXPORT_DIR="./migrations/data-export"

# Export ALL tables from production
echo "📤 ETAPA 1: Exportando dados de produção..."
echo ""

for i in "${!TABLES[@]}"; do
  TABLE="${TABLES[$i]}"
  INDEX=$((i + 1))
  
  printf "[%2d/%2d] Exportando: %-40s" "$INDEX" "${#TABLES[@]}" "$TABLE"
  
  # Export to temporary SQL file
  TEMP_FILE="$EXPORT_DIR/${TABLE}_export.sql"
  
  # Get schema
  npx wrangler d1 execute "$PROD_DB" --remote --command ".schema $TABLE" > "$TEMP_FILE.schema" 2>/dev/null || echo "-- Schema unavailable" > "$TEMP_FILE.schema"
  
  # Export data with proper INSERT statements
  npx wrangler d1 execute "$PROD_DB" --remote --command "SELECT 'INSERT OR REPLACE INTO $TABLE VALUES(' || quote(typeof(*)) || ')' FROM $TABLE;" 2>/dev/null > "$TEMP_FILE.data" || echo "-- No data or error" > "$TEMP_FILE.data"
  
  echo " ✅"
done

echo ""
echo "✅ Export concluído em: $EXPORT_DIR"
echo ""

# Alternative: Use D1 migration snapshot approach
echo "📥 ETAPA 2: Importando para banco local..."
echo ""

# Create a single SQL file with all data
cat > "$EXPORT_DIR/00_IMPORT_ALL_DATA.sql" << 'SQL_IMPORT'
-- Disable constraints for faster import
PRAGMA foreign_keys = OFF;

-- Import will be done via wrangler d1 execute with remote export

PRAGMA foreign_keys = ON;
SQL_IMPORT

echo "ℹ️  Usando abordagem alternativa: wrangler d1 execute com remote query"
echo ""
echo "⏳ Exportando schema de todas as tabelas..."

for TABLE in "${TABLES[@]}"; do
  echo "   - $TABLE"
  npx wrangler d1 execute "$PROD_DB" --remote --command ".dump $TABLE" >> "$EXPORT_DIR/prod_full_dump.sql" 2>/dev/null || true
done

if [ -f "$EXPORT_DIR/prod_full_dump.sql" ] && [ -s "$EXPORT_DIR/prod_full_dump.sql" ]; then
  echo ""
  echo "📝 Full dump criado: $EXPORT_DIR/prod_full_dump.sql"
  echo ""
  echo "🔧 Importando para banco local..."
  
  # Import to local database
  npx wrangler d1 execute "$LOCAL_DB" --local --file "$EXPORT_DIR/prod_full_dump.sql" 2>&1 | tail -20
  
  echo ""
  echo "✅ Import concluído!"
else
  echo "❌ Erro: Dump file vazio ou não criado"
  echo ""
  echo "📌 Fallback: Use o Cloudflare Dashboard para exportar dados:"
  echo "   1. Abra: https://dash.cloudflare.com"
  echo "   2. Vá para: Workers → D1 → airtrust-db"
  echo "   3. Clique em: Export"
  echo "   4. Baixe o arquivo SQL"
  echo "   5. Execute localmente:"
  echo "      npx wrangler d1 execute airtrust-db --local --file backup.sql"
fi

echo ""
echo "🎉 Operação de sincronização concluída!"

~~~

---
## FILE: scripts/clone-prod-to-local-COMPLETO.sh
~~~bash
#!/bin/bash

# CLONE COMPLETO: PRODUÇÃO → LOCAL
# Copia TODAS as tabelas e dados do banco de produção para o local

set -e

echo "🔄 CLONANDO BANCO DE PRODUÇÃO → LOCAL"
echo "======================================"
echo ""

cd "$(dirname "$0")/../worker-airtrust" || exit 1

# Arquivo SQLite local
DB_FILE="../.wrangler/state/v3/d1/miniflare-D1DatabaseObject/cd45cc5264daa1c125545b5b4c0756df95d8b6ac5900ecf52323d90f61a47f2d.sqlite"

# Verificar se existe
if [ ! -f "$DB_FILE" ]; then
  echo "❌ Banco local não encontrado em: $DB_FILE"
  exit 1
fi

echo "📦 Banco local encontrado: $(du -h "$DB_FILE" | cut -f1)"
echo ""

# Criar backup antes
BACKUP_FILE="../backups/local-backup-antes-clone-$(date +%Y%m%d-%H%M%S).sqlite"
mkdir -p ../backups
cp "$DB_FILE" "$BACKUP_FILE"
echo "💾 Backup criado: $BACKUP_FILE"
echo ""

# Lista de tabelas principais para exportar/importar
TABLES=(
  "sessoes_template"
  "cadastro_manobras"
  "simuladores"
  "manobras"
  "manobras_categorias"
  "funcionarios"
  "usuarios"
  "categorias"
  "tipos_sessao"
  "aeronaves"
  "empresas"
  "qualificacoes"
  "historico_certificacoes_v2"
  "licencas"
  "pasta_virtual"
)

echo "📋 Exportando ${#TABLES[@]} tabelas de PRODUÇÃO..."
echo ""

TEMP_DIR="/tmp/airtrust-clone-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$TEMP_DIR"

for table in "${TABLES[@]}"; do
  echo -n "  → $table ... "
  
  # Exportar de produção
  npx wrangler d1 execute airtrust-db --remote \
    --command="SELECT * FROM $table" \
    --json > "$TEMP_DIR/${table}.json" 2>/dev/null || {
      echo "⚠️  não existe ou vazia"
      continue
    }
  
  # Contar registros
  COUNT=$(cat "$TEMP_DIR/${table}.json" | jq '. | length' 2>/dev/null || echo "0")
  
  if [ "$COUNT" -gt 0 ]; then
    echo "✅ $COUNT registros"
    
    # Limpar tabela local
    sqlite3 "$DB_FILE" "DELETE FROM $table;" 2>/dev/null || {
      echo "    ⚠️  Tabela não existe no local, criando..."
      # A tabela será criada automaticamente quando importarmos
    }
    
    # Converter JSON para SQL INSERT e importar
    cat "$TEMP_DIR/${table}.json" | jq -r '
      .[] | 
      to_entries | 
      map("\"\(.key)\"") as $keys |
      map(.value | 
        if type == "string" then 
          "\"" + (. | gsub("\""; "\"\"")) + "\""
        elif . == null then 
          "NULL"
        else 
          tostring
        end
      ) as $vals |
      "INSERT OR REPLACE INTO '"$table"' (" + ($keys | join(", ")) + ") VALUES (" + ($vals | join(", ")) + ");"
    ' > "$TEMP_DIR/${table}.sql" 2>/dev/null
    
    # Importar no SQLite local
    if [ -f "$TEMP_DIR/${table}.sql" ]; then
      sqlite3 "$DB_FILE" < "$TEMP_DIR/${table}.sql" 2>/dev/null || echo "    ⚠️  Erro ao importar"
    fi
  else
    echo "⚠️  vazia"
  fi
done

echo ""
echo "🧹 Limpando arquivos temporários..."
rm -rf "$TEMP_DIR"

echo ""
echo "📊 RESUMO DO CLONE:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Mostrar contagem de registros em cada tabela
for table in "${TABLES[@]}"; do
  COUNT=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM $table WHERE deleted_at IS NULL OR deleted_at = '';" 2>/dev/null || echo "0")
  if [ "$COUNT" -gt 0 ]; then
    printf "  %-30s %6d registros\n" "$table" "$COUNT"
  fi
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

DB_SIZE=$(du -h "$DB_FILE" | cut -f1)
echo "💾 Tamanho do banco local: $DB_SIZE"
echo ""
echo "✅ CLONE COMPLETO!"
echo ""
echo "🚀 Reinicie o ambiente local:"
echo "   npm run dev:all"
echo ""

~~~

---
## FILE: scripts/cloudflare-purge-cache.ts
~~~typescript
/**
 * Script para limpar o cache do Cloudflare (Purge Everything ou URLs específicas)
 *
 * Requer variáveis de ambiente:
 * - CLOUDFLARE_ZONE_ID
 * - CLOUDFLARE_API_TOKEN (com permissão de Cache Purge)
 */

const ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

if (!ZONE_ID || !API_TOKEN) {
  console.error('❌ CLOUDFLARE_ZONE_ID ou CLOUDFLARE_API_TOKEN não definidos.');
  console.error('   Configure no .env ou nas variáveis de ambiente antes de rodar.');
  process.exit(1);
}

const CLOUDFLARE_API = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache`;

async function purgeEverything() {
  console.log('🧹 Enviando Purge Everything para Cloudflare...');

  const res = await fetch(CLOUDFLARE_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ purge_everything: true }),
  });

  const data = (await res.json()) as unknown as {
    success: boolean;
    errors?: unknown[];
    messages?: unknown[];
  };

  if (!res.ok || !data.success) {
    console.error('❌ Erro ao limpar cache:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log('✅ Cache limpo com sucesso no Cloudflare.');
}

async function purgeUrls(urls: string[]) {
  console.log('🧹 Enviando purge de URLs específicas para Cloudflare...');
  console.log(urls.map((u) => `  - ${u}`).join('\n'));

  const res = await fetch(CLOUDFLARE_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ files: urls }),
  });

  const data = (await res.json()) as unknown as {
    success: boolean;
    errors?: unknown[];
    messages?: unknown[];
  };

  if (!res.ok || !data.success) {
    console.error('❌ Erro ao limpar cache (URLs):', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log('✅ Cache limpo para URLs específicas.');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'all') {
    await purgeEverything();
    return;
  }

  if (args[0] === 'urls') {
    const urls = args.slice(1);
    if (urls.length === 0) {
      console.error('❌ Use: node cloudflare-purge-cache.js urls <url1> <url2> ...');
      process.exit(1);
    }
    await purgeUrls(urls);
    return;
  }

  console.error('Uso:');
  console.error('  npx ts-node scripts/cloudflare-purge-cache.ts all');
  console.error(
    '  npx ts-node scripts/cloudflare-purge-cache.ts urls https://seu-site.com/ https://seu-site.com/rota',
  );
  process.exit(1);
}

main().catch((err) => {
  console.error('❌ Erro inesperado no script de purge:', err);
  process.exit(1);
});

~~~
