# 🏗️ PLANO DE REFATORAÇÃO COMPLETO - AIRTRUST

## Objetivo: Sistema Limpo, Escalável e Sem Duplicações

**Data**: 29/11/2025  
**Status**: Em andamento  
**Problema Identificado**: Código duplicado, arquitetura desorganizada, nomenclatura inconsistente  
**Impacto**: Dificuldade de manutenção, bugs escondidos, bundle inchado  
**Meta**: Sistema SSOT (Single Source of Truth) pronto para escalar

---

## 📊 ANÁLISE COMPLETA - RESULTADOS

### Estatísticas Gerais:

- **Total componentes**: 31
- **Total páginas**: 11
- **Total modais**: 0 (em src/components/modals - movidos para pages)
- **Total hooks**: 3 (src/hooks)
- **Total rotas backend**: 36

### 🔴 DUPLICAÇÕES CRÍTICAS IDENTIFICADAS:

#### 1️⃣ FUNCIONÁRIOS - 43 arquivos encontrados

**Status**: 🔴 ALTA PRIORIDADE

**Componentes Duplicados**:

```
✅ PRINCIPAIS (Manter):
- src/react-app/pages/Funcionarios.tsx
- src/react-app/components/funcionarios/TabelaFuncionarios.tsx
- src/react-app/components/modals/ModalFuncionario.tsx

⚠️ DUPLICADOS SUSPEITOS:
- src/react-app/pages/FuncionariosNew.tsx          # ❌ Deletar (duplica Funcionarios.tsx)
- src/react-app/pages/FuncionariosSimples.tsx      # ❌ Deletar (versão simplificada)
- src/react-app/pages/TestFuncionarios.tsx         # ❌ Deletar (teste dev)
- src/react-app/components/FuncionarioCard.tsx     # ⚠️ Verificar vs TabelaFuncionarios
- src/react-app/components/modals/FuncionarioModal.tsx  # ❌ Duplica ModalFuncionario.tsx
- src/pages/Funcionarios/components/FuncionarioModal.tsx  # ❌ Duplica ModalFuncionario.tsx

📁 MÚLTIPLAS PASTAS:
- src/react-app/pages/funcionarios/ (9 arquivos)
- src/pages/Funcionarios/ (3 arquivos)
- src/react-app/components/funcionarios/ (7 arquivos)
```

**Hooks Duplicados**:

```
⚠️ 2 hooks encontrados:
- src/hooks/useFuncionarios.ts                     # Legacy
- src/hooks/useFuncionariosConfig.ts               # Config adicional
- src/react-app/hooks/useFuncionarios.ts           # ✅ Principal (React Query)
- src/react-app/hooks/useFuncionariosSimples.ts    # ❌ Versão simplificada
- src/react-app/hooks/queries/useFuncionariosRQ.ts # ✅ Queries modernas
- src/react-app/hooks/mutations/useFuncionariosMutations.ts  # ✅ Mutations

✅ AÇÃO: Consolidar em 2 hooks:
1. useFuncionariosRQ.ts (queries)
2. useFuncionariosMutations.ts (mutations)
Deletar: useFuncionarios.ts, useFuncionariosSimples.ts
```

**Rotas Backend**:

```
⚠️ 2 arquivos encontrados:
- worker-airtrust/src/routes/funcionarios.ts       # ✅ Principal (20KB)
- worker-airtrust/src/routes/funcionarios_ssot.ts  # ❌ SSOT experiment (3.4KB)

✅ AÇÃO: Mesclar funcionarios_ssot.ts → funcionarios.ts, deletar SSOT
```

---

#### 2️⃣ QUALIFICAÇÕES - 44 arquivos encontrados

**Status**: 🔴 ALTA PRIORIDADE

**Componentes Duplicados**:

```
✅ PRINCIPAIS (Manter):
- src/react-app/pages/Qualificacoes.tsx
- src/react-app/components/modals/ModalAtribuirQualificacao.tsx

⚠️ DUPLICADOS SUSPEITOS:
- src/react-app/pages/QualificacaoEditar.tsx       # ❌ Deletar (usar modal)
- src/react-app/pages/DashboardQualificacoes.tsx   # ⚠️ Verificar uso
- src/react-app/pages/ReclassificacaoQualificacoes.tsx  # ⚠️ Feature específica
- src/react-app/components/qualificacoes/ModalEditarQualificacao.tsx  # ❌ Duplica ModalAtribuir
- src/react-app/components/qualificacoes/ModalEditarQualificacaoSimples.tsx  # ❌ Versão simplificada
- src/react-app/components/modals/ModalRenovarQualificacao.tsx  # ⚠️ Feature específica

📁 MÚLTIPLAS PASTAS:
- src/react-app/pages/qualificacoes/ (7 arquivos)
- src/react-app/components/qualificacoes/ (4 arquivos)
- src/pages/ (2 arquivos)
- src/components/qualificacoes/ (2 arquivos)
```

**Hooks Duplicados**:

```
⚠️ 5 hooks encontrados:
- src/react-app/hooks/useQualificacoes.ts          # Legacy
- src/react-app/hooks/useQualificacoesExt.ts       # ❌ Extensão (2 usos apenas)
- src/react-app/hooks/useQualificacoesHistorico.ts # ⚠️ Feature específica
- src/react-app/hooks/useQualificacoesStats.ts     # ⚠️ Stats dashboard
- src/react-app/hooks/useDashboardQualificacoes.ts # ⚠️ Dashboard
- src/react-app/hooks/queries/useQualificacoesRQ.ts  # ✅ Principal
- src/react-app/hooks/mutations/useQualificacoesMutations.ts  # ✅ Mutations

✅ AÇÃO: Consolidar em 3 hooks:
1. useQualificacoesRQ.ts (queries base + stats)
2. useQualificacoesMutations.ts (mutations)
3. useHistoricoQualificacoes.ts (histórico específico)
Deletar: useQualificacoes.ts, useQualificacoesExt.ts, useQualificacoesStats.ts, useDashboardQualificacoes.ts
```

**Rotas Backend**:

```
⚠️ 4 arquivos encontrados:
- worker-airtrust/src/routes/qualificacoes.ts              # ✅ Principal (77KB - GIGANTE!)
- worker-airtrust/src/routes/qualificacoes-alertas.ts      # ⚠️ Feature alertas (6.1KB)
- worker-airtrust/src/routes/qualificacoes-certificados.ts # ✅ Certificados OK (23KB)
- worker-airtrust/src/routes/qualificacoes-reclass.ts      # ⚠️ Reclassificação (9.5KB)

✅ AÇÃO:
1. Manter qualificacoes.ts, qualificacoes-certificados.ts
2. Avaliar se qualificacoes-alertas.ts e qualificacoes-reclass.ts podem ser módulos internos
3. REFATORAR qualificacoes.ts (77KB é MUITO GRANDE - split em services)
```

---

#### 3️⃣ SIMULADORES/SESSÕES - 50+ arquivos encontrados

**Status**: 🟡 MÉDIA PRIORIDADE

**Componentes Duplicados**:

```
✅ PRINCIPAIS (Manter):
- src/react-app/pages/Simuladores.tsx
- src/react-app/components/modals/SessaoModal.tsx

⚠️ DUPLICADOS SUSPEITOS:
- src/react-app/pages/SimuladoresNew.tsx           # ❌ Deletar (versão nova)
- src/react-app/pages/SimuladoresSimple.tsx        # ❌ Deletar (versão simples)
- src/react-app/pages/SimuladorModulo.tsx          # ❌ Deletar (teste)
- src/react-app/pages/SimuladoresSessoes.tsx       # ⚠️ Verificar vs Simuladores.tsx
- src/react-app/components/simuladores/SessionModal.tsx  # ❌ Duplica SessaoModal.tsx

📁 MÚLTIPLAS PASTAS:
- src/react-app/pages/simuladores/ (15 arquivos)
- src/react-app/components/simuladores/ (6 arquivos)
```

**Services Duplicados**:

```
⚠️ 4 services encontrados:
- src/react-app/services/simuladores.service.ts            # ✅ Principal
- src/react-app/services/simuladores-consolidado.service.ts  # ❌ Consolidado (merge)
- src/react-app/services/simuladoresApi.ts                 # ❌ API wrapper (duplicado)
- src/react-app/services/simuladoresQuick.ts               # ❌ Quick access (duplicado)
- src/react-app/services/relatoriosSimuladoresApi.ts       # ⚠️ Relatórios específico

✅ AÇÃO: Consolidar em 2 services:
1. simuladores.service.ts (principal)
2. relatoriosSimuladores.service.ts (relatórios)
Deletar: simuladores-consolidado, simuladoresApi, simuladoresQuick
```

**Rotas Backend**:

```
✅ 1 arquivo (simuladores.ts - 82KB - GIGANTE!)

🔴 AÇÃO CRÍTICA: REFATORAR simuladores.ts (82KB)
- Split em: simuladores-crud.ts, simuladores-sessoes.ts, simuladores-relatorios.ts
```

---

#### 4️⃣ CERTIFICADOS - 13 arquivos encontrados

**Status**: ✅ CONCLUÍDO (Refatorado em 29/11/2025)

```
✅ COMPONENTE ÚNICO: src/react-app/components/modals/ModalCertificado.tsx
✅ ROTA ÚNICA: worker-airtrust/src/routes/qualificacoes-certificados.ts
✅ HOOKS: useCertificadosRQ.ts, useCertificadosMutations.ts

📝 Resultado: 7 componentes → 1 componente (2.150 linhas removidas)
```

---

#### 5️⃣ PASTA VIRTUAL/DOCUMENTOS - 12 arquivos encontrados

**Status**: 🟡 MÉDIA PRIORIDADE

**Componentes Duplicados**:

```
✅ PRINCIPAL (Manter):
- src/react-app/pages/PastaVirtual.tsx

⚠️ DUPLICADOS SUSPEITOS:
- src/react-app/pages/PastaVirtualGeral.tsx        # ❌ Versão geral (merge)
- src/react-app/pages/PastaVirtualLanding.tsx      # ❌ Landing (merge)
- src/react-app/pages/funcionarios/AbaDocumentos.tsx  # ⚠️ Aba específica (ok)
- src/react-app/components/funcionarios/PastaVirtualCompleta.tsx  # ❌ Duplica PastaVirtual

✅ AÇÃO: Consolidar PastaVirtualGeral e Landing em PastaVirtual.tsx
```

**Rotas Backend**:

```
✅ 1 arquivo: worker-airtrust/src/routes/pasta-virtual.ts (25KB)

⚠️ VERIFICAR: Se não seria melhor renomear para documentos.ts (conceito mais claro)
```

---

#### 6️⃣ AUDITORIA - 2 arquivos encontrados

**Status**: 🟢 BAIXA PRIORIDADE

**Rotas Backend**:

```
⚠️ 2 arquivos encontrados:
- worker-airtrust/src/routes/auditoria.ts           # ✅ Principal (6.9KB)
- worker-airtrust/src/routes/auditoria-detalhada.ts # ⚠️ Detalhada (3.9KB)

✅ AÇÃO: Consolidar usando query param ?detailed=true
Mesclar auditoria-detalhada.ts → auditoria.ts, deletar detalhada
```

---

#### 7️⃣ OUTROS MÓDULOS

**Status**: ✅ OK (Aparentemente sem duplicações críticas)

```
✅ Compliance: 3 arquivos (OK)
✅ Hospedagem: 0 arquivos (módulo não implementado)
✅ FRMS: 0 arquivos (módulo não implementado)
```

---

## 🎯 PLANO DE EXECUÇÃO (Ordem de Prioridade)

### ✅ FASE 0: BACKUP E PREPARAÇÃO (CONCLUÍDO)

- [x] Backup criado: `backup/sistema-ok-antes-da-refatoracao`
- [x] Commit: f9a7075a
- [x] Análise completa executada
- [x] Relatório gerado

---

### 🔴 FASE 1: QUALIFICAÇÕES (PRIORIDADE MÁXIMA - 4h)

**Motivo**: qualificacoes.ts tem 77KB - arquivo GIGANTE que precisa refatoração urgente

#### 1.1 Refatorar Backend (qualificacoes.ts)

```bash
# CRÍTICO: Split de qualificacoes.ts (77KB)

# Criar estrutura:
worker-airtrust/src/routes/qualificacoes/
  ├── index.ts           # Router principal (agregador)
  ├── crud.ts            # CRUD tipos de qualificação (GET, POST, PUT, DELETE)
  ├── historico.ts       # Histórico/conclusões (já existe qualificacoes-historico.ts?)
  ├── validacao.ts       # Regras de validação e compliance
  └── stats.ts           # Estatísticas e dashboard

# Manter separados (features específicas):
- qualificacoes-certificados.ts  (23KB - certificados)
- qualificacoes-alertas.ts       (6.1KB - alertas)
- qualificacoes-reclass.ts       (9.5KB - reclassificação)
```

#### 1.2 Consolidar Componentes Frontend

```bash
# Deletar componentes duplicados
❌ rm src/react-app/pages/QualificacaoEditar.tsx
❌ rm src/react-app/components/qualificacoes/ModalEditarQualificacao.tsx
❌ rm src/react-app/components/qualificacoes/ModalEditarQualificacaoSimples.tsx

# Consolidar páginas
⚠️ Revisar: src/react-app/pages/DashboardQualificacoes.tsx (usar ou deletar)
⚠️ Revisar: src/react-app/pages/ReclassificacaoQualificacoes.tsx (feature válida?)

# ✅ MANTER:
- src/react-app/pages/Qualificacoes.tsx
- src/react-app/components/modals/ModalAtribuirQualificacao.tsx
- src/react-app/components/modals/ModalRenovarQualificacao.tsx (feature específica)
```

#### 1.3 Consolidar Hooks

```bash
# Deletar hooks duplicados
❌ rm src/react-app/hooks/useQualificacoes.ts
❌ rm src/react-app/hooks/useQualificacoesExt.ts
❌ rm src/react-app/hooks/useQualificacoesStats.ts
❌ rm src/react-app/hooks/useDashboardQualificacoes.ts

# Mesclar funcionalidades em:
✅ src/react-app/hooks/queries/useQualificacoesRQ.ts (adicionar stats)
✅ src/react-app/hooks/mutations/useQualificacoesMutations.ts
✅ src/react-app/hooks/qualificacoes/useHistoricoQualificacoes.ts (OK)
```

#### 1.4 Testes

```bash
npm run build
npm run test

# E2E específico
./scripts/test-e2e-qualificacoes.sh
```

**Estimativa**: 4 horas  
**Redução esperada**: -15 arquivos, ~3.000 linhas de código  
**Bundle**: -50KB (gzip: -15KB)

---

### 🔴 FASE 2: FUNCIONÁRIOS (ALTA PRIORIDADE - 3h)

#### 2.1 Consolidar Backend

```bash
# Mesclar SSOT experiment
✅ Revisar worker-airtrust/src/routes/funcionarios_ssot.ts
✅ Mesclar features em funcionarios.ts
❌ Deletar funcionarios_ssot.ts
```

#### 2.2 Consolidar Componentes Frontend

```bash
# Deletar páginas duplicadas
❌ rm src/react-app/pages/FuncionariosNew.tsx
❌ rm src/react-app/pages/FuncionariosSimples.tsx
❌ rm src/react-app/pages/TestFuncionarios.tsx

# Deletar componentes duplicados
❌ rm src/react-app/components/modals/FuncionarioModal.tsx  # Duplica ModalFuncionario
❌ rm src/pages/Funcionarios/components/FuncionarioModal.tsx  # Pasta legacy

# Consolidar listagens
⚠️ Decidir: FuncionarioCard.tsx vs TabelaFuncionarios.tsx (manter TabelaFuncionarios)
⚠️ Revisar: src/react-app/components/funcionarios/FuncionarioList.tsx vs FuncionarioListDetailed.tsx

# ✅ MANTER:
- src/react-app/pages/Funcionarios.tsx
- src/react-app/components/modals/ModalFuncionario.tsx
- src/react-app/components/funcionarios/TabelaFuncionarios.tsx
```

#### 2.3 Consolidar Hooks

```bash
# Deletar hooks duplicados
❌ rm src/hooks/useFuncionarios.ts (legacy)
❌ rm src/react-app/hooks/useFuncionariosSimples.ts

# Consolidar configuração
✅ Mesclar src/hooks/useFuncionariosConfig.ts → src/react-app/hooks/queries/useFuncionariosRQ.ts

# ✅ MANTER (React Query):
- src/react-app/hooks/queries/useFuncionariosRQ.ts
- src/react-app/hooks/mutations/useFuncionariosMutations.ts
```

#### 2.4 Testes

```bash
npm run build
npm run test

# E2E específico
./scripts/test-e2e-funcionarios.sh
```

**Estimativa**: 3 horas  
**Redução esperada**: -12 arquivos, ~2.500 linhas de código  
**Bundle**: -40KB (gzip: -12KB)

---

### 🟡 FASE 3: SIMULADORES (MÉDIA PRIORIDADE - 4h)

**Motivo**: simuladores.ts tem 82KB - segundo arquivo GIGANTE

#### 3.1 Refatorar Backend (simuladores.ts)

```bash
# CRÍTICO: Split de simuladores.ts (82KB)

# Criar estrutura:
worker-airtrust/src/routes/simuladores/
  ├── index.ts           # Router principal
  ├── crud.ts            # CRUD simuladores
  ├── sessoes.ts         # Gestão de sessões
  ├── fichas.ts          # Fichas de avaliação
  ├── relatorios.ts      # Relatórios e estatísticas
  └── validacao.ts       # Regras de validação
```

#### 3.2 Consolidar Componentes Frontend

```bash
# Deletar páginas duplicadas
❌ rm src/react-app/pages/SimuladoresNew.tsx
❌ rm src/react-app/pages/SimuladoresSimple.tsx
❌ rm src/react-app/pages/SimuladorModulo.tsx

# Deletar componentes duplicados
❌ rm src/react-app/components/simuladores/SessionModal.tsx  # Duplica SessaoModal

# Revisar múltiplas páginas em src/react-app/pages/simuladores/
⚠️ Avaliar: Quais são features reais vs experimentos
```

#### 3.3 Consolidar Services

```bash
# Deletar services duplicados
❌ rm src/react-app/services/simuladores-consolidado.service.ts
❌ rm src/react-app/services/simuladoresApi.ts
❌ rm src/react-app/services/simuladoresQuick.ts

# ✅ MANTER:
- src/react-app/services/simuladores.service.ts
- src/react-app/services/relatoriosSimuladoresApi.ts (renomear para relatoriosSimuladores.service.ts)
```

#### 3.4 Testes

```bash
npm run build
npm run test

# E2E específico
./scripts/test-e2e-simuladores.sh
```

**Estimativa**: 4 horas  
**Redução esperada**: -10 arquivos, ~2.800 linhas de código  
**Bundle**: -60KB (gzip: -18KB)

---

### 🟡 FASE 4: PASTA VIRTUAL (MÉDIA PRIORIDADE - 1h)

#### 4.1 Consolidar Componentes

```bash
# Deletar páginas duplicadas
❌ rm src/react-app/pages/PastaVirtualGeral.tsx
❌ rm src/react-app/pages/PastaVirtualLanding.tsx

# Deletar componentes duplicados
❌ rm src/react-app/components/funcionarios/PastaVirtualCompleta.tsx

# ✅ MANTER:
- src/react-app/pages/PastaVirtual.tsx (consolidar features)
- src/react-app/pages/funcionarios/AbaDocumentos.tsx (aba específica)
```

#### 4.2 Avaliar Renomeação Backend

```bash
# Considerar renomear para conceito mais claro
⚠️ worker-airtrust/src/routes/pasta-virtual.ts → documentos.ts?
```

**Estimativa**: 1 hora  
**Redução esperada**: -3 arquivos, ~500 linhas de código

---

### 🟢 FASE 5: AUDITORIA (BAIXA PRIORIDADE - 30 min)

#### 5.1 Consolidar Rotas Backend

```bash
# Mesclar com query param
✅ Adicionar ?detailed=true em auditoria.ts
✅ Mesclar funcionalidades de auditoria-detalhada.ts
❌ Deletar worker-airtrust/src/routes/auditoria-detalhada.ts
```

**Estimativa**: 30 minutos  
**Redução esperada**: -1 arquivo, ~200 linhas de código

---

### 🎨 FASE 6: PADRONIZAÇÃO DE NOMENCLATURA (1h)

#### 6.1 Regras de Nomenclatura Adotadas:

**Componentes**:

```typescript
// ✅ PADRÃO:
- PascalCase
- Singular para modais: ModalFuncionario (não ModalFuncionarios)
- Plural para listas: FuncionariosList
- Sufixo Card: FuncionarioCard
- Sufixo Form: FuncionarioForm
- Sufixo Table: FuncionariosTable

// ❌ EVITAR:
- Prefixos Add*, Edit*, New* (usar modal com prop mode)
- Sufixos New, Simple, Old, V2
```

**Hooks**:

```typescript
// ✅ PADRÃO:
- camelCase
- Prefixo use
- Queries: useEntityRQ ou useEntityQueries
- Mutations: useEntityMutations
- Singular vs Plural: useFuncionario (1) vs useFuncionarios (list)

// ❌ EVITAR:
- Sufixos Ext, Config, Simple
- Hooks legados sem React Query
```

**Rotas Backend**:

```typescript
// ✅ PADRÃO:
- kebab-case
- Plural: /funcionarios
- Recursos aninhados: /funcionarios/:id/qualificacoes
- Query params para variações: ?detailed=true

// ❌ EVITAR:
- Sufixos -v2, -ext, -old, -new
- Múltiplos arquivos para mesma entidade (usar subpastas)
```

**Arquivos**:

```typescript
// ✅ PADRÃO:
- kebab-case para arquivos
- PascalCase para componentes React
- camelCase para utilities

// Exemplo:
funcionario-card.tsx → export const FuncionarioCard
use-funcionarios.ts → export const useFuncionarios
```

#### 6.2 Renomeações Necessárias:

```bash
# Executar após cada fase de consolidação
# Exemplos:

# Hooks
mv src/react-app/hooks/queries/useFuncionariosRQ.ts \
   src/react-app/hooks/queries/useFuncionariosQueries.ts

# Services
mv src/react-app/services/relatoriosSimuladoresApi.ts \
   src/react-app/services/relatoriosSimuladores.service.ts
```

**Estimativa**: 1 hora

---

### 🧪 FASE 7: TESTES E VALIDAÇÃO FINAL (2h)

#### 7.1 Suite de Testes Completa

```bash
# 1. Testes unitários
npm run test

# 2. Lint e Type Check
npm run lint
npm run type-check

# 3. Build completo
npm run build

# 4. E2E por módulo
./scripts/test-e2e-certificados-definitivo.sh
./scripts/test-e2e-qualificacoes.sh
./scripts/test-e2e-funcionarios.sh
./scripts/test-e2e-simuladores.sh

# 5. Bundle analysis
npm run build -- --mode production
du -sh dist/
```

#### 7.2 Checklist de Qualidade

```
- [ ] ESLint: 0 erros
- [ ] TypeScript: 0 erros
- [ ] Testes unitários: 100% passing
- [ ] E2E testes: 100% passing
- [ ] Bundle size: -25% vs baseline
- [ ] Lighthouse: Score > 90
- [ ] Documentação: Atualizada
```

#### 7.3 Deploy e Monitoramento

```bash
# Build e deploy
npm run build
cd worker-airtrust && npm run deploy

# Monitorar logs
wrangler tail --env production

# Verificar métricas
curl https://airtrust-api-production.airtrust.workers.dev/api/health
```

**Estimativa**: 2 horas

---

## 📊 MÉTRICAS DE SUCESSO

### Baseline (Antes da Refatoração):

```
Componentes:
- Total: 31 componentes
- Modais: 0 (movidos para pages)
- Páginas: 11
- Duplicados estimados: ~25-30

Hooks:
- Total: 3 (src/hooks)
- React App hooks: ~15
- Duplicados estimados: ~8

Rotas Backend:
- Total: 36 rotas
- Duplicadas: 8 (funcionarios, qualificacoes, auditoria)
- Arquivos gigantes: 2 (qualificacoes.ts 77KB, simuladores.ts 82KB)

Bundle:
- Size: ~1.2MB
- Gzip: ~280KB

Código:
- Linhas estimadas: ~35.000
```

### Meta (Após Refatoração):

```
Componentes:
- Total: ~20 componentes (-35%)
- Duplicados: 0
- Estrutura clara por módulo

Hooks:
- Por módulo: 2-3 (queries + mutations + específicos)
- Duplicados: 0
- React Query 100%

Rotas Backend:
- Total: ~28 rotas (-22%)
- Duplicadas: 0
- Arquivos modulares: <10KB cada

Bundle:
- Size: ~900KB (-25%)
- Gzip: ~210KB (-25%)

Código:
- Linhas removidas: ~8.000-10.000 (-25%)
- Linhas finais: ~25.000
```

---

## 🎯 CHECKLIST FINAL DE MÓDULOS

### Módulo Certificados:

- [x] Componentes consolidados (7 → 1) ✅ CONCLUÍDO 29/11/2025
- [x] Rotas consistentes
- [x] Hooks consolidados (React Query)
- [x] Documentação atualizada
- [x] E2E testes passando (9/12)

### Módulo Qualificações:

- [ ] Backend refatorado (77KB → módulos <10KB)
- [ ] Componentes consolidados
- [ ] Hooks consolidados (5 → 3)
- [ ] Rotas consolidadas (4 arquivos)
- [ ] E2E testes

### Módulo Funcionários:

- [ ] Backend consolidado (2 → 1)
- [ ] Componentes consolidados (43 → 15)
- [ ] Hooks consolidados (6 → 2)
- [ ] Páginas consolidadas (11 → 3)
- [ ] E2E testes

### Módulo Simuladores:

- [ ] Backend refatorado (82KB → módulos <10KB)
- [ ] Componentes consolidados (50+ → 20)
- [ ] Services consolidados (4 → 2)
- [ ] Páginas consolidadas (15 → 8)
- [ ] E2E testes

### Módulo Pasta Virtual:

- [ ] Componentes consolidados (12 → 5)
- [ ] Backend renomeado (pasta-virtual → documentos)
- [ ] E2E testes

### Módulo Auditoria:

- [ ] Rotas consolidadas (2 → 1)
- [ ] Query param implementado (?detailed=true)

### Qualidade de Código:

- [ ] ESLint sem erros
- [ ] TypeScript strict mode
- [ ] Todos os testes passando
- [ ] Bundle size reduzido -25%
- [ ] Documentação completa
- [ ] Lighthouse score > 90

---

## 🚀 COMEÇAR AGORA

**Próximo comando**:

```bash
# Iniciar FASE 1: QUALIFICAÇÕES
echo "🔴 FASE 1: QUALIFICAÇÕES - Refatoração Backend (77KB)"
```

**Estimativa Total**: 15-18 horas (distribuídas ao longo de 3-4 dias)

**Benefícios Esperados**:

- ✅ -25% bundle size
- ✅ -8.000 linhas de código
- ✅ 0 duplicações
- ✅ Manutenção 3x mais fácil
- ✅ Onboarding 2x mais rápido
- ✅ Deploy 30% mais rápido

---

**FIM DO PLANO DETALHADO** 🎯

📝 **Salvo em**: `docs/REFACTORING_PLAN.md`  
📊 **Análise bruta**: `reports/duplicates-analysis-*.txt`  
🔖 **Backup**: `backup/sistema-ok-antes-da-refatoracao` (commit f9a7075a)
