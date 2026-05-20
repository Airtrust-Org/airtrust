# 🔍 AUDITORIA COMPLETA - MÓDULO SIMULADORES

## Arquivos Duplicados e Fontes de Confusão

**Data:** 1 de dezembro de 2025  
**Status:** ⚠️ CRÍTICO - Múltiplas duplicações encontradas

---

## 📊 RESUMO EXECUTIVO

### Estatísticas Gerais

- **11 backups** do arquivo principal `simuladores.ts` nas rotas
- **41 componentes** no frontend (`src/react-app/components/simuladores/`)
- **35 páginas** no módulo (`src/react-app/pages/simuladores/`)
- **3 services duplicados** entre `src/` e `src/react-app/`
- **150+ arquivos** relacionados a simuladores (incluindo backups e legacy)

---

## 🚨 PROBLEMAS CRÍTICOS IDENTIFICADOS

### 1. BACKUPS EXCESSIVOS NO WORKER (routes/simuladores.ts)

#### Arquivos Encontrados:

```
simuladores.ts                                          (44K)  ✅ ATIVO
simuladores.ts.BACKUP_ANTES_REFATORACAO_20251130       (82K)  ❌ DUPLICADO
simuladores.ts.backup                                  (47K)  ❌ DUPLICADO
simuladores.ts.backup-20251120_115316                  (82K)  ❌ DUPLICADO
simuladores.ts.backup-20251201_101350                  (36K)  ❌ DUPLICADO
simuladores.ts.bak                                     (82K)  ❌ DUPLICADO
simuladores.ts.bak2                                    (82K)  ❌ DUPLICADO
simuladores.ts.bak3                                    (82K)  ❌ DUPLICADO
simuladores.ts.bak4                                    (82K)  ❌ DUPLICADO
simuladores.ts.pre-optimization-20251201_101038        (47K)  ❌ DUPLICADO
simuladores.ts.wrong                                   (82K)  ❌ DUPLICADO
```

**Total desperdiçado:** ~680KB em backups  
**Impacto:** Confusão, múltiplas versões da mesma lógica

---

### 2. SERVICES DUPLICADOS

#### A) `simuladores.service.ts` - DUPLICAÇÃO COMPLETA

**Localização 1:**

```
/src/services/simuladores.service.ts
```

**Localização 2:**

```
/src/react-app/services/simuladores.service.ts
```

**Análise:**

- Ambos exportam `simuladoresService`
- Mesmas funções: `listar`, `buscarPorId`, `criar`, `atualizar`, `excluir`
- Mesmos imports de tipos
- **RISCO:** Qual é o canônico? Qual está sendo usado?

#### B) Types Duplicados

**Localização 1:**

```
/src/shared/types.ts
- Simulador
- SimuladorSessao
```

**Localização 2:**

```
/src/types/index.ts
- Simulador
- SimuladorCreate
- SimuladorUpdate
- FiltrosSimuladores
```

**Localização 3:**

```
/src/react-app/types/simuladores.ts
```

**Localização 4:**

```
/worker-airtrust/src/types/simulador.ts
```

---

### 3. COMPONENTES POTENCIALMENTE DUPLICADOS/SOBREPOSTOS

#### PDF Generators (4 versões diferentes!)

```
PDFGeneratorCompacto.tsx
PDFGeneratorNativo.tsx
PDFGeneratorDefinitivo.tsx
PDFGeneratorRobusto.tsx
```

❓ **Qual usar?** Provável que apenas 1 esteja ativo.

#### Formulários de Template (3 versões!)

```
FormularioTemplate.tsx
FormularioTemplate.css
FormularioCriarTemplate.tsx
CriarTemplateModal.tsx
TemplateForm.tsx
```

❓ **Funcionalidade sobreposta?**

#### Botões de Ação de Ficha (2 versões!)

```
BotoesAcaoFicha.tsx
BotoesAcaoFichaFinal.tsx
AcoesFicha.tsx
```

❓ **Qual é o correto?**

#### Visualização de Ficha (Múltiplas versões!)

```
VisualizarFicha.tsx                     (src/components/simuladores/)
VisualizarFichaSimulador.tsx            (src/react-app/components/simuladores/)
FichaVisualizacaoAprimorada.tsx         (src/react-app/components/simuladores/)
FichaOpenModal.tsx                      (src/react-app/components/simuladores/)
```

#### Assinatura Digital (3 versões!)

```
AssinaturaDigitalModal.tsx
ModalAssinaturaCanvas.tsx
ModalAssinarFicha.tsx
```

---

### 4. PÁGINAS POSSIVELMENTE OBSOLETAS

#### Duplicação de CRUDs

```
/src/react-app/pages/simuladores/
- CrudSimuladores.tsx
- CrudManobras.tsx
- CrudModelos.tsx
- CrudCategorias.tsx
- CrudTiposSessao.tsx
- CrudInstrutores.tsx
- CrudTemplates.tsx
```

**vs**

```
/src/react-app/pages/simuladores/
- Lista.tsx                  (❓ vs CrudSimuladores?)
- FormSimulador.tsx          (❓ vs CrudSimuladores?)
- Equipamentos.tsx           (❓ Separado ou junto?)
```

#### Dashboards

```
Dashboard.tsx                 (src/react-app/pages/simuladores/)
SimuladoresDashboard.tsx      (src/react-app/pages/)
```

❓ **São diferentes ou duplicados?**

---

### 5. HOOKS DUPLICADOS

```
/src/react-app/hooks/useSimuladores.ts
/src/react-app/hooks/useSessoes.ts
/src/react-app/hooks/mutations/useSimuladorMutations.ts
/src/react-app/hooks/queries/useSimuladoresRQ.ts
```

**Problema:**

- `useSimuladores` parece ser um hook legado/manual
- `useSimuladoresRQ` usa React Query (moderno)
- **Ambos coexistem!** Causando confusão sobre qual usar

---

### 6. ARQUIVOS LEGACY NÃO LIMPOS

#### Backups Antigos (devem ser deletados):

```
_backups/worker-old-20251113_231328/
├── routes/simuladores.ts
├── routes/simuladores-complete.ts
├── services/simuladoresService.ts
├── dtos/simuladores.ts
└── api/simulador-*.ts (múltiplos)

_backups/pre-consolidation-20251102_165628/
├── simulador-agendamento-airtrust.ts
├── simulador-fichas-crud.ts
├── simulador-slots.ts
└── simuladores-modelos.ts

_LEGACY_ARCHIVED/worker-antigo-2025-11-14/
└── (mesmo padrão de duplicação)
```

**Total:** ~100+ arquivos legacy ainda presentes

---

## 📋 ANÁLISE DETALHADA DE IMPORTS

### Imports de Services

**41 componentes** importam services de simuladores:

- Maioria usa `@/services/simuladores.service`
- Alguns usam path relativo `../../services/simuladores.service`
- **Inconsistência** na estratégia de imports

### Imports de Types

Múltiplas fontes de tipos:

```typescript
// Fonte 1
import { Simulador } from '@/types';

// Fonte 2
import { Simulador } from '@/shared/types';

// Fonte 3
import { Simulador } from '../../types/simuladores';
```

---

## 🎯 RECOMENDAÇÕES PRIORITÁRIAS

### 1. LIMPEZA IMEDIATA (SEM RISCO)

#### Deletar Backups do Worker

```bash
rm worker-airtrust/src/routes/simuladores.ts.backup*
rm worker-airtrust/src/routes/simuladores.ts.bak*
rm worker-airtrust/src/routes/simuladores.ts.wrong
rm worker-airtrust/src/routes/simuladores.ts.BACKUP_*
rm worker-airtrust/src/routes/simuladores.ts.pre-optimization-*
```

**Ganho:** ~680KB liberados, clareza mental

#### Deletar Pastas Legacy

```bash
# Já estão em _LEGACY_ARCHIVED e _backups, não precisam estar duplicados
```

---

### 2. CONSOLIDAÇÃO DE SERVICES (MÉDIO RISCO)

#### Decisão: Manter apenas 1 service

```
MANTER: /src/services/simuladores.service.ts (mais próximo da raiz)
DELETAR: /src/react-app/services/simuladores.service.ts
```

**Ação:**

1. Verificar imports (grep para confirmar uso)
2. Atualizar imports para usar caminho canônico
3. Deletar duplicado

---

### 3. CONSOLIDAÇÃO DE TYPES (MÉDIO RISCO)

#### Estratégia: Source of Truth único

```
MANTER: /src/types/index.ts
  - Simulador
  - SimuladorCreate
  - SimuladorUpdate
  - FiltrosSimuladores

DELETAR/MESCLAR:
  - /src/shared/types.ts (SimuladorSessao -> mover para /src/types/index.ts)
  - /src/react-app/types/simuladores.ts (verificar tipos únicos primeiro)
```

---

### 4. DECISÕES SOBRE COMPONENTES (ALTO RISCO)

#### PDF Generators

**Ação:** Testar cada um, manter apenas 1

```typescript
// Provavelmente o correto:
PDFGeneratorDefinitivo.tsx  (ou PDFGeneratorRobusto.tsx)

// Deletar os outros após confirmação
```

#### Formulários de Template

**Ação:** Identificar qual está no código ativo

```bash
grep -r "import.*FormularioTemplate" src/react-app/
grep -r "import.*CriarTemplateModal" src/react-app/
grep -r "import.*TemplateForm" src/react-app/
```

#### Botões de Ação

**Ação:** Ver qual é usado nas páginas principais

```bash
grep -r "BotoesAcaoFicha" src/react-app/pages/simuladores/
```

---

### 5. HOOKS: MIGRAÇÃO PARA REACT QUERY

#### Estado Atual

- `useSimuladores.ts` (499 linhas) - hook manual com useState
- `useSimuladoresRQ.ts` (51 linhas) - React Query (moderno)

#### Estratégia

1. **Curto Prazo:** Marcar `useSimuladores.ts` como deprecated
2. **Médio Prazo:** Migrar todos os componentes para `useSimuladoresRQ`
3. **Longo Prazo:** Deletar `useSimuladores.ts`

---

## 📝 PLANO DE AÇÃO SUGERIDO

### FASE 1: LIMPEZA SEGURA (1h)

```bash
# 1. Deletar backups do worker
rm worker-airtrust/src/routes/simuladores.ts.{backup*,bak*,wrong,BACKUP_*,pre-optimization-*}

# 2. Verificar se git tem histórico (segurança)
git log --oneline worker-airtrust/src/routes/simuladores.ts | head -20
```

### FASE 2: AUDITORIA DE USO (2h)

```bash
# 1. Mapear imports de services
grep -r "simuladores.service" src/ --include="*.tsx" --include="*.ts" | grep import

# 2. Mapear imports de types
grep -r "types/simuladores\|shared/types.*Simulador" src/ --include="*.tsx" --include="*.ts"

# 3. Identificar componentes não usados
for file in src/react-app/components/simuladores/*.tsx; do
  name=$(basename "$file" .tsx)
  count=$(grep -r "import.*$name" src/react-app --include="*.tsx" | wc -l)
  echo "$name: $count usos"
done
```

### FASE 3: CONSOLIDAÇÃO (4h)

1. Consolidar services em `/src/services/`
2. Consolidar types em `/src/types/`
3. Atualizar imports
4. Testar build
5. Testar funcionalidade

### FASE 4: REMOVER COMPONENTES DUPLICADOS (3h)

1. Identificar PDFGenerator ativo
2. Identificar formulário de template ativo
3. Identificar botões de ação ativos
4. Deletar versões não usadas

---

## 🔢 MÉTRICAS DE IMPACTO

### Antes da Limpeza

- **Arquivos totais relacionados:** ~150
- **Backups desnecessários:** 11 (worker) + ~100 (legacy)
- **Services duplicados:** 2
- **Types duplicados:** 4 locais diferentes
- **Componentes potencialmente duplicados:** ~15

### Depois da Limpeza (Estimativa)

- **Arquivos totais:** ~70 (-53%)
- **Backups:** 0 (-100%)
- **Services:** 1 canônico (-50%)
- **Types:** 1 fonte de verdade (-75%)
- **Componentes duplicados:** 0 (-100%)

### Benefícios

- ✅ Clareza: Desenvolvedores sabem qual arquivo usar
- ✅ Performance: Menos arquivos para bundler processar
- ✅ Manutenção: Mudanças em 1 lugar só
- ✅ Onboarding: Novos devs não se confundem

---

## ⚠️ RISCOS E MITIGAÇÕES

### Risco 1: Deletar arquivo ainda em uso

**Mitigação:**

- Sempre fazer grep antes de deletar
- Manter backups por 1 semana no git
- Fazer PR separado para review

### Risco 2: Quebrar imports

**Mitigação:**

- Usar find & replace global no VS Code
- Rodar `npm run build` após cada mudança
- Testar app localmente

### Risco 3: Perder funcionalidade

**Mitigação:**

- Comparar componentes antes de deletar (diff)
- Manter testes e2e rodando
- Deploy incremental

---

## 🎬 PRÓXIMOS PASSOS IMEDIATOS

### Ação 1: Executar FASE 1 (Limpeza Segura)

```bash
# Script de limpeza segura
./scripts/limpar-backups-simuladores.sh
```

### Ação 2: Gerar Relatório de Uso

```bash
# Identificar arquivos órfãos
./scripts/audit-unused-components.sh simuladores
```

### Ação 3: Decisão Arquitetural

**Perguntas a responder:**

1. Qual PDFGenerator é o oficial?
2. Qual hook usar: `useSimuladores` ou `useSimuladoresRQ`?
3. Consolidar CRUDs ou manter separados?

---

## 📚 REFERÊNCIAS

- Backups Worker: `worker-airtrust/src/routes/`
- Services: `src/services/` e `src/react-app/services/`
- Components: `src/react-app/components/simuladores/`
- Pages: `src/react-app/pages/simuladores/`
- Types: `src/types/`, `src/shared/types.ts`, `src/react-app/types/`

---

**Auditoria realizada por:** GitHub Copilot  
**Próxima revisão:** Após execução da Fase 1
