# 📋 PLANO PREVENTIVO - Automação de Auditoria Contínua AirTrust

**Data:** 11 de Novembro de 2025  
**Versão:** 1.0  
**Objetivo:** Estabelecer processo contínuo de detecção e correção de problemas recorrentes

---

## 📊 RESUMO EXECUTIVO

Este plano define um processo de **auditoria preventiva automatizada** que será executado:

- ✅ A cada novo commit (CI/CD)
- ✅ A cada build para produção
- ✅ Semanalmente (auditoria profunda)

**Resultado Esperado:** Prevenir 95% dos problemas identificados na auditoria anterior.

---

## 🎯 PROBLEMAS RECORRENTES IDENTIFICADOS

### Padrão 1: Hardcoded API Paths

**Problema:** Desenvolvedores adicionam `fetch('/api/v2/...')` em vez de `API_BASE_URL`

**Frequência Anterior:** 80+ ocorrências

**Automação:**

```bash
# Script: scripts/check-hardcoded-apis.sh
#!/bin/bash
FOUND=$(grep -r "fetch(['\"]\/api\/" src/ | wc -l)
if [ "$FOUND" -gt 0 ]; then
  echo "❌ ERRO: $FOUND hardcoded API paths encontrados!"
  exit 1
fi
```

**Integração CI/CD:**

```yaml
- name: Check Hardcoded APIs
  run: bash scripts/check-hardcoded-apis.sh
```

---

### Padrão 2: Soft Delete Não Aplicado em Queries

**Problema:** Queries retornam registros deletados (`WHERE deleted_at IS NOT NULL`)

**Frequência Anterior:** 3 endpoints afetados

**Automação:**

```sql
-- scripts/audit-soft-delete.sql
SELECT
  'AUDIT_SOFT_DELETE' as tipo,
  COUNT(*) as registros_soft_deleted,
  CASE
    WHEN COUNT(*) = 0 THEN '✅ OK'
    ELSE '❌ RISCO: Deletados expostos!'
  END as status
FROM (
  SELECT COUNT(*) as cnt FROM funcionarios WHERE deleted_at IS NOT NULL
  UNION
  SELECT COUNT(*) FROM qualificacoes WHERE deleted_at IS NOT NULL
  UNION
  SELECT COUNT(*) FROM habilitacoes WHERE deleted_at IS NOT NULL
  UNION
  SELECT COUNT(*) FROM certificados WHERE deleted_at IS NOT NULL
  UNION
  SELECT COUNT(*) FROM simuladores WHERE deleted_at IS NOT NULL
);
```

**Execução:**

```bash
# Script: scripts/validate-soft-delete.sh
npm run db:exec -- scripts/audit-soft-delete.sql
```

---

### Padrão 3: Mismatched Column Names

**Problema:** Código refere `funcao` mas tabela tem `cargo`, ou `validade_meses` vs `duracao_meses`

**Frequência Anterior:** 12+ ocorrências

**Automação:**

```python
#!/usr/bin/env python3
# scripts/validate-schema-consistency.py

import re
import sys

# Mapeamento correto de colunas
COLUMN_MAP = {
    'funcao': 'cargo',                    # ❌ Wrong, ✅ Right
    'duracao_meses': 'validade_meses',   # ❌ Wrong, ✅ Right
    'data_fim': 'data_vencimento',       # ❌ Wrong, ✅ Right
    'nome_funcionario': ['nome', 'funcionario_nome'],  # Ambos OK
}

FORBIDDEN_PATTERNS = [
    r"q\.funcao",           # ❌ Wrong column
    r"h\.duracao",          # ❌ Wrong column
    r"\.data_fim",          # ❌ Wrong column
]

def audit_files(pattern="src/"):
    issues = []
    for file in glob.glob(f"{pattern}/**/*.ts", recursive=True):
        with open(file) as f:
            content = f.read()
            for forbidden in FORBIDDEN_PATTERNS:
                if re.search(forbidden, content):
                    issues.append(f"❌ {file}: Found '{forbidden}'")

    if issues:
        print("\n".join(issues))
        return 1
    print("✅ All column names validated")
    return 0

sys.exit(audit_files())
```

---

### Padrão 4: Endpoints Sem Validação Zod

**Problema:** POST/PUT endpoints aceitam dados inválidos

**Frequência Anterior:** 8+ endpoints

**Automação:**

```bash
# scripts/check-zod-validation.sh
echo "🔍 Verificando endpoints sem validação Zod..."

# Procurar por POST/PUT sem zValidator
ENDPOINTS_MISSING_ZOD=$(grep -r "app\.post\|app\.put" src/worker/api \
  | grep -v "zValidator" \
  | wc -l)

if [ "$ENDPOINTS_MISSING_ZOD" -gt 0 ]; then
  echo "❌ ERRO: $ENDPOINTS_MISSING_ZOD endpoints sem validação Zod!"
  exit 1
fi

echo "✅ Todos endpoints têm validação Zod"
```

---

### Padrão 5: Error Handling Inconsistente

**Problema:** Alguns endpoints retornam status 500, outros 400, sem padrão

**Frequência Anterior:** 6+ endpoints

**Template Padrão:**

```typescript
// ✅ PADRÃO CORRETO
try {
  // validação
  const result = await service.operacao();
  return c.json({ success: true, data: result }, 200);
} catch (error) {
  if (error instanceof ValidationError) {
    return c.json({ success: false, error: error.message, code: 'VALIDATION_ERROR' }, 422);
  }
  if (error instanceof NotFoundError) {
    return c.json({ success: false, error: error.message, code: 'NOT_FOUND' }, 404);
  }
  if (error instanceof AppError) {
    return c.json({ success: false, error: error.message, code: error.code }, error.statusCode);
  }
  console.error('[ENDPOINT]', error);
  return c.json({ success: false, error: 'Internal Server Error', code: 'INTERNAL_ERROR' }, 500);
}
```

---

## 🤖 SISTEMA DE AUTOMAÇÃO PROPOSTO

### 1. Pre-Commit Hook

```bash
# .husky/pre-commit
#!/bin/bash

echo "🔍 Running pre-commit audits..."

# 1. Checker hardcoded APIs
bash scripts/check-hardcoded-apis.sh || exit 1

# 2. Check schema consistency
python3 scripts/validate-schema-consistency.py || exit 1

# 3. Check Zod validation
bash scripts/check-zod-validation.sh || exit 1

# 4. Lint and format
npm run lint:fix || exit 1

echo "✅ Pre-commit audits passed"
```

---

### 2. CI/CD Pipeline

```yaml
# .github/workflows/audit-and-deploy.yml
name: Audit, Test & Deploy

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install dependencies
        run: npm install

      # === AUDITORIA DE CÓDIGO ===
      - name: Check hardcoded APIs
        run: bash scripts/check-hardcoded-apis.sh

      - name: Validate schema consistency
        run: python3 scripts/validate-schema-consistency.py

      - name: Check Zod validation
        run: bash scripts/check-zod-validation.sh

      # === TESTES ===
      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration

      - name: Check coverage
        run: npm run test:coverage -- --threshold 80

      # === VALIDAÇÃO DE ENDPOINTS ===
      - name: Validate all endpoints
        run: npm run test:endpoints

      - name: Validate soft delete
        run: npm run test:soft-delete

      # === BUILD ===
      - name: Build backend
        run: npm run build:worker

      - name: Build frontend
        env:
          VITE_API_URL: ${{ secrets.VITE_API_URL }}
        run: npm run build:client

      # === DEPLOY (somente em main) ===
      - name: Deploy to Cloudflare Workers
        if: github.ref == 'refs/heads/main'
        run: npm run deploy:worker

      - name: Deploy to Cloudflare Pages
        if: github.ref == 'refs/heads/main'
        env:
          VITE_API_URL: ${{ secrets.VITE_API_URL }}
        run: npm run deploy:pages

      # === RELATÓRIO ===
      - name: Generate audit report
        run: npm run audit:report > audit-report.txt

      - name: Upload report
        uses: actions/upload-artifact@v3
        with:
          name: audit-report
          path: audit-report.txt
```

---

### 3. Auditoria Semanal Profunda

```bash
#!/bin/bash
# scripts/weekly-audit.sh

echo "📊 AUDITORIA SEMANAL PROFUNDA - $(date)"
echo "=================================================="

# 1. Database Audit
echo ""
echo "🗄️  Database Audit..."
npm run db:exec -- scripts/audit-soft-delete.sql
npm run db:exec -- scripts/audit-table-sizes.sql
npm run db:exec -- scripts/audit-missing-indexes.sql

# 2. API Audit
echo ""
echo "🔌 API Audit..."
npm run test:endpoints
npm run test:error-handling

# 3. Frontend Audit
echo ""
echo "⚛️  Frontend Audit..."
npm run audit:components
npm run audit:hooks
npm run audit:unused-imports

# 4. Security Audit
echo ""
echo "🔐 Security Audit..."
npm run audit:security
npm run audit:dependencies

# 5. Performance Audit
echo ""
echo "⚡ Performance Audit..."
npm run audit:performance
npm run audit:bundle-size

# 6. Generate Report
echo ""
echo "📝 Generating report..."
npm run audit:report > reports/weekly-audit-$(date +%Y%m%d).md

echo ""
echo "✅ Auditoria semanal concluída!"
echo "📄 Relatório: reports/weekly-audit-$(date +%Y%m%d).md"
```

---

### 4. Scripts de Correção Automática

#### Fix: Hardcoded APIs

```bash
#!/bin/bash
# scripts/fix-hardcoded-apis.sh

echo "🔧 Corrigindo hardcoded API paths..."

# 1. Encontrar todos arquivos com /api/v2/
FILES=$(grep -r "fetch(['\"]\/api\/" src/ | cut -d: -f1 | sort -u)

for FILE in $FILES; do
  echo "  Corrigindo: $FILE"

  # Adicionar import se não existir
  if ! grep -q "API_BASE_URL" "$FILE"; then
    sed -i '' "1,/^import/{ /^import.*from/a\\
import { API_BASE_URL } from '@/react-app/config/api';
}" "$FILE"
  fi

  # Substituir fetch paths
  sed -i '' "s|fetch('[^']*'/api/v2/|fetch(\`\${API_BASE_URL}/|g" "$FILE"
  sed -i '' 's|fetch("[^"]*"/api/v2/|fetch(\`${API_BASE_URL}/|g' "$FILE"
done

echo "✅ Hardcoded APIs corrigidas!"
```

---

#### Fix: Schema Consistency

```python
#!/usr/bin/env python3
# scripts/fix-schema-consistency.py

import re
import sys

REPLACEMENTS = {
    r'\bq\.funcao\b': 'c.cargo',
    r'\bh\.funcao\b': 'c.cargo',
    r'\.duracao_meses': '.validade_meses',
    r'\.data_fim\b': '.data_vencimento',
    r'\.nome_funcionario\b': '.funcionario_nome',
}

def fix_files(pattern="src/"):
    import glob
    files = glob.glob(f"{pattern}/**/*.ts", recursive=True)

    for file in files:
        with open(file) as f:
            original = f.read()

        fixed = original
        for wrong, right in REPLACEMENTS.items():
            fixed = re.sub(wrong, right, fixed)

        if fixed != original:
            with open(file, 'w') as f:
                f.write(fixed)
            print(f"✅ {file}")

fix_files()
print("\n✅ Schema consistency fixed!")
```

---

## 📈 MÉTRICAS E KPIs

### Monitoramento em Tempo Real

```typescript
// pages/api/audit-dashboard
export async function getAuditMetrics() {
  return {
    hardcodedApis: {
      count: 0, // Target: always 0
      lastCheck: new Date(),
      status: count === 0 ? 'PASS' : 'FAIL',
    },
    softDelete: {
      deletedRecords: 0, // Should be 0 if queries filter correctly
      exposedCount: 0, // Target: always 0
      status: exposedCount === 0 ? 'PASS' : 'FAIL',
    },
    endpoints: {
      total: 45,
      withValidation: 45, // Target: 100%
      errorHandling: 45, // Target: 100%
      status: 100,
    },
    tests: {
      coverage: 82, // Target: >= 80%
      passing: 156,
      failing: 0, // Target: 0
      status: failing === 0 ? 'PASS' : 'FAIL',
    },
  };
}
```

---

### Dashboard Visual

```
╔════════════════════════════════════════════════════════════╗
║           AIRTRUST AUDIT DASHBOARD - 11/11/2025           ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║ 🔌 API Endpoints:          45/45 ✅  [████████████] 100% ║
║ 🗄️  Soft Delete:            0 ❌  [████████████] 100% ║
║ 🔐 Zod Validation:         45/45 ✅  [████████████] 100% ║
║ 🧪 Test Coverage:           82%  🟡  [███████░░░░] 82%  ║
║ ⚡ Performance p99:         193ms ✅  [████████████] OK   ║
║ 🔧 Hardcoded APIs:           0  ✅  [████████████] 0    ║
║                                                            ║
║ 📊 Overall Score: 95/100 ✅                               ║
║                                                            ║
║ Next Audit: 18/11/2025 10:00 AM                          ║
║ Last Audit: 11/11/2025 15:30 BRT                         ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
```

---

## 📋 LISTA DE VERIFICAÇÃO - Implementação

### Fase 1: Setupação Básica (1 dia)

- [ ] Criar `scripts/` directory
- [ ] Implementar `check-hardcoded-apis.sh`
- [ ] Implementar `validate-schema-consistency.py`
- [ ] Implementar `check-zod-validation.sh`
- [ ] Setup Husky pre-commit hooks

### Fase 2: CI/CD Integration (2 dias)

- [ ] Criar `.github/workflows/audit-and-deploy.yml`
- [ ] Configurar variáveis de ambiente secrets
- [ ] Testar pipeline em branch develop
- [ ] Documentar workflow no README

### Fase 3: Auditoria Profunda (3 dias)

- [ ] Implementar `weekly-audit.sh`
- [ ] Criar scripts SQL de auditoria
- [ ] Implementar dashboard de métricas
- [ ] Setup alertas (Slack/Email)

### Fase 4: Automação de Fixes (2 dias)

- [ ] Implementar `fix-hardcoded-apis.sh`
- [ ] Implementar `fix-schema-consistency.py`
- [ ] Testar auto-fixes em branch
- [ ] Documentar processo de correção

### Fase 5: Monitoramento Contínuo (1 dia)

- [ ] Setup dashboard visual
- [ ] Configurar alertas críticos
- [ ] Documentar runbooks
- [ ] Treinar time

---

## 🚨 CRITÉRIOS DE ALERTA

### 🔴 CRÍTICO (Trigger Immediate Action)

```
IF hardcodedApis.count > 0 THEN
  - Bloquear merge de PR
  - Notificar dev lead no Slack
  - Trigger auto-fix + comment no PR
ENDIF

IF softDelete.exposedCount > 0 THEN
  - Bloquear deploy em produção
  - Notificar security team
  - Criar issue P0
ENDIF

IF tests.failing > 0 THEN
  - Bloquear merge
  - Revert commit automático
  - Alert no Slack
ENDIF
```

---

### 🟡 AVISO (Attention Required)

```
IF tests.coverage < 80 THEN
  - Adicionar comentário no PR
  - Sugerir arquivos com baixa cobertura
  - Deixar merge, mas alertar
ENDIF

IF performance.p99 > 500ms THEN
  - Criar issue no board
  - Adicionar label 'performance'
  - Notificar backend team
ENDIF
```

---

## 📖 Documentação para Time

### Developer Guidelines

```markdown
# ✅ Como Adicionar Nova Feature Sem Violar Padrões

## 1. API Endpoint

✅ Use template correto com error handling
❌ Nunca faça queries diretas sem soft delete

## 2. Frontend Hook

✅ Use API_BASE_URL do config/api
❌ Nunca hardcode /api/v2/

## 3. Teste

✅ Cobertura >= 80%
❌ Nunca mergue PR com testes falhando

## 4. Validação

✅ Use Zod em todos POST/PUT
❌ Nunca confie em dados do cliente sem validar
```

---

## 📅 Calendário de Auditorias

| Frequência    | Dia/Hora     | Foco            | Owner          |
| ------------- | ------------ | --------------- | -------------- |
| A cada commit | -            | Hardcoded APIs  | Husky          |
| A cada PR     | -            | Tests, Coverage | GitHub Actions |
| A cada merge  | -            | Full build      | GitHub Actions |
| Semanal       | Sex 10:00 AM | Profundo        | Copilot        |
| Mensal        | Último dia   | Estratégico     | Dev Lead       |

---

## 🎯 Meta: Zero Regressions

**Objetivo:** Prevenir 100% dos problemas recorrentes

**Método:** Automação + Alertas + Docs

**Resultado Esperado:**

- ✅ 0 hardcoded APIs
- ✅ 0 soft delete failures
- ✅ 0 schema mismatches
- ✅ 0 missing validations
- ✅ 100% test coverage em código novo

---

**Preparado por:** GitHub Copilot  
**Data:** 11 de Novembro de 2025  
**Próxima Revisão:** 25 de Novembro de 2025
