# 🏗️ ARQUITETURA DEFINITIVA - MÓDULO SIMULADORES

**Última Atualização**: 01/12/2025  
**Status**: ✅ Definido e Aprovado  
**Baseado em**: Limpeza bem-sucedida (38 arquivos deletados, 1.068MB liberados)

---

## 📁 ESTRUTURA DE PASTAS TARGET

### Princípios Arquiteturais

1. **Feature-based**: Agrupar por funcionalidade, não por tipo
2. **Colocation**: Código relacionado junto
3. **Nomenclatura clara**: Sem sufixos "V2", "Final", "Definitivo"
4. **Flat quando possível**: Evitar pastas desnecessárias

### Estrutura Proposta

```
src/react-app/pages/simuladores/
│
├── index.tsx                      # Rota raiz, redireciona para dashboard
│
├── dashboard/
│   ├── index.tsx                  # Dashboard principal (ÚNICO)
│   └── components/
│       ├── StatCard.tsx
│       └── QuickActions.tsx
│
├── cadastros/
│   ├── simuladores/
│   │   ├── index.tsx              # Lista
│   │   ├── novo.tsx               # Criar
│   │   ├── [id].tsx               # Detalhes (view)
│   │   └── [id]/editar.tsx        # Editar
│   │
│   ├── manobras/
│   │   ├── index.tsx
│   │   └── novo.tsx
│   │
│   └── templates/
│       ├── index.tsx
│       └── novo.tsx
│
├── sessoes/
│   ├── index.tsx                  # Lista sessões
│   ├── nova.tsx                   # Agendar
│   └── [id]/
│       ├── index.tsx              # Detalhes
│       └── editar.tsx
│
├── fichas/
│   ├── index.tsx                  # Lista
│   └── [id]/
│       ├── index.tsx              # Visualizar (readonly)
│       ├── preencher.tsx          # Preencher/avaliar
│       └── pdf.tsx                # Gerar PDF
│
├── relatorios/
│   └── index.tsx                  # Relatórios
│
└── components/                    # Componentes SHARED do módulo
    ├── SimuladorCard.tsx
    ├── ManobraChip.tsx
    ├── StatusBadge.tsx
    └── PDFGenerator.tsx           # ⭐ PDF Generator ÚNICO
```

---

## 🎯 CONVENÇÕES OBRIGATÓRIAS

### 1. Nomenclatura de Arquivos

#### Páginas

- `index.tsx` → Lista ou dashboard
- `novo.tsx` → Criar
- `[id].tsx` → Detalhes (view mode)
- `[id]/editar.tsx` → Editar

#### Componentes

- **PascalCase**
- Nome descritivo do que renderiza
- **Sem sufixos** "V2", "Final", "Definitivo", "Novo"
- **Sem prefixos redundantes** (ex: `SimuladorForm` não `FormSimulador`)

**Exemplos:**

```
✅ CORRETO                    ❌ ERRADO
SimuladorCard.tsx            CardSimulador.tsx
StatusBadge.tsx              BadgeStatusV2.tsx
PDFGenerator.tsx             PDFGeneratorDefinitivo.tsx
ManobraChip.tsx              ChipManobraFinal.tsx
```

#### Hooks

- **camelCase**
- Prefixo `use`
- Especificar ação: `useSimuladores`, `useCreateSimulador`

**Exemplos:**

```
✅ CORRETO                    ❌ ERRADO
useSimuladores.ts            simuladores.hook.ts
useCreateSimulador.ts        useSimuladoresCreate.ts
useSimuladorById.ts          useGetSimulador.ts
```

#### Services

- **camelCase**
- Sufixo `.service.ts`
- Um por entidade

**Exemplos:**

```
✅ CORRETO                    ❌ ERRADO
simuladores.service.ts       SimuladoresService.ts
fichas.service.ts            fichas-service.ts
```

---

### 2. Imports

**SEMPRE usar barrels** (`index.ts`):

```typescript
// ✅ CORRETO
import { simuladoresService } from '@/services';
import { useSimuladores } from '@/hooks/simuladores';
import type { Simulador } from '@/types/simuladores';
import { SimuladorCard } from '@/pages/simuladores/components';

// ❌ ERRADO
import { simuladoresService } from '@/services/simuladores/simuladores.service';
import { Simulador } from '@/types/simuladores/simulador.types';
import { SimuladorCard } from '@/pages/simuladores/components/SimuladorCard';
```

---

### 3. Estrutura de Componente

**Template obrigatório**:

```typescript
/**
 * COMPONENTE: [Nome]
 *
 * Descrição: [O que faz em 1 linha]
 *
 * Usado em:
 * - [Página/Componente 1]
 * - [Página/Componente 2]
 *
 * Props:
 * - prop1: descrição
 * - prop2: descrição
 *
 * @example
 * <ComponentName prop1="value" prop2={123} />
 */

import { tipo1, tipo2 } from 'biblioteca';
import type { TipoProp } from '@/types';

interface ComponentNameProps {
  /** Descrição da prop1 */
  prop1: string;
  /** Descrição da prop2 */
  prop2?: number;
}

export function ComponentName({ prop1, prop2 = 10 }: ComponentNameProps) {
  // 1. Hooks
  const [state, setState] = useState();

  // 2. Queries/Mutations
  const { data } = useQuery();

  // 3. Funções auxiliares
  const handleClick = () => {
    // ...
  };

  // 4. Effects
  useEffect(() => {
    // ...
  }, []);

  // 5. Early returns
  if (!data) return <Loading />;

  // 6. Render
  return <div>{/* JSX */}</div>;
}
```

---

### 4. Estrutura de Página

**Template obrigatório**:

```typescript
/**
 * PÁGINA: [Nome da Página]
 *
 * Rota: /simuladores/[rota]
 * Descrição: [O que a página faz]
 * Permissões: [Roles necessários]
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';

import { PageLayout } from '@/components/layout';
import { Component1, Component2 } from '../components';
import { useService } from '@/hooks';

export default function PageName() {
  // Lógica da página

  return <PageLayout title="Título">{/* Conteúdo */}</PageLayout>;
}
```

---

## ❌ O QUE NÃO FAZER

### Proibições Absolutas

1. ❌ Criar arquivos na raiz de `pages/simuladores/` (exceto `index.tsx`)
2. ❌ Usar sufixos versionados ("V2", "Final", "Novo", "Definitivo")
3. ❌ Criar componentes duplicados sem deletar antigos
4. ❌ Services duplicados (1 service por entidade)
5. ❌ Múltiplas fontes de types (1 fonte de verdade)
6. ❌ Hooks manuais com useState (sempre usar React Query)
7. ❌ Backups manuais (.bak, .backup) - usar Git
8. ❌ console.log em produção (usar logger adequado)
9. ❌ Imports absolutos sem alias `@/`
10. ❌ Comentários desatualizados ou código comentado

### Anti-Padrões Comuns

```typescript
// ❌ ERRADO: Componente sem documentação
export function MyComponent() {
  return <div>...</div>;
}

// ❌ ERRADO: Hook manual ao invés de React Query
const [data, setData] = useState();
useEffect(() => {
  fetch('/api/data')
    .then((r) => r.json())
    .then(setData);
}, []);

// ❌ ERRADO: Service duplicado
// services/simuladores.service.ts
// services/simuladores-v2.service.ts
// services/simuladores-novo.service.ts

// ❌ ERRADO: Múltiplas versões do mesmo componente
// PDFGenerator.tsx
// PDFGeneratorV2.tsx
// PDFGeneratorFinal.tsx
```

---

## ✅ O QUE FAZER

### Boas Práticas

```typescript
// ✅ CORRETO: Componente documentado
/**
 * COMPONENTE: StatusBadge
 * Mostra badge colorido baseado no status
 */
export function StatusBadge({ status }: StatusBadgeProps) {
  // ...
}

// ✅ CORRETO: React Query ao invés de fetch manual
const { data, isLoading } = useSimuladores();

// ✅ CORRETO: Service único e consolidado
// services/simuladores.service.ts (ÚNICO)

// ✅ CORRETO: Componente único e bem nomeado
// components/PDFGenerator.tsx (ÚNICO)
```

---

## ✅ CHECKLIST PARA CODE REVIEW

Antes de aprovar PR, verificar:

### Estrutura

- [ ] Arquivo está na pasta correta conforme arquitetura?
- [ ] Nome segue convenções estabelecidas?
- [ ] Não há duplicação de código existente?

### Código

- [ ] Componente/página está documentado?
- [ ] Imports usando barrels (`@/services`, não caminhos diretos)?
- [ ] Sem console.log ou código comentado?
- [ ] Sem sufixos versionados (V2, Final, etc)?

### Qualidade

- [ ] Build passou sem erros? (`npm run build`)
- [ ] Types estão consolidados em fonte única?
- [ ] Testes funcionais passando?
- [ ] Performance adequada (lazy loading)?

### Git

- [ ] Commit message clara e descritiva?
- [ ] Sem backups manuais (.bak, .backup)?
- [ ] Arquivos antigos foram deletados (não só renomeados)?

---

## 🔧 COMO ADICIONAR NOVA FEATURE

### Exemplo Completo: Adicionar "Configurações de Simuladores"

#### 1. Criar Estrutura de Arquivos

```bash
# Criar pasta
mkdir -p src/react-app/pages/simuladores/configuracoes

# Criar página principal
cat > src/react-app/pages/simuladores/configuracoes/index.tsx << 'EOF'
/**
 * PÁGINA: Configurações de Simuladores
 *
 * Rota: /simuladores/configuracoes
 * Descrição: Gerencia configurações globais do módulo
 * Permissões: admin
 */

import { PageLayout } from '@/components/layout';

export default function Configuracoes() {
  return (
    <PageLayout title="Configurações">
      {/* Conteúdo */}
    </PageLayout>
  );
}
EOF
```

#### 2. Adicionar Rota em App.tsx

```typescript
// Em src/react-app/App.tsx
const Configuracoes = lazy(() => import('./pages/simuladores/configuracoes'));

// Nas rotas:
<Route
  path="/simuladores/configuracoes"
  element={
    <ProtectedRoute requiredRole="admin">
      <Configuracoes />
    </ProtectedRoute>
  }
/>;
```

#### 3. Service (se necessário)

**Opção A:** Adicionar ao service existente

```typescript
// Em services/simuladores.service.ts
export const simuladoresService = {
  // ... funções existentes

  getConfiguracoes: async () => {
    return api.get('/simuladores/configuracoes');
  },

  updateConfiguracoes: async (data: ConfigData) => {
    return api.put('/simuladores/configuracoes', data);
  },
};
```

**Opção B:** Criar service separado (se muitas funções)

```typescript
// Em services/configuracoes.service.ts
export const configuracoesService = {
  get: async () => api.get('/configuracoes'),
  update: async (data) => api.put('/configuracoes', data),
};
```

#### 4. Types (se necessário)

```typescript
// Em types/simuladores/index.ts
export interface SimuladorConfig {
  id: number;
  chave: string;
  valor: string;
  tipo: 'string' | 'number' | 'boolean';
}

export interface SimuladorConfigUpdate {
  chave: string;
  valor: string;
}
```

#### 5. Hook React Query

```typescript
// Em hooks/simuladores/queries/useConfiguracoes.ts
import { useQuery } from '@tanstack/react-query';
import { simuladoresService } from '@/services';

export function useConfiguracoes() {
  return useQuery({
    queryKey: ['simuladores', 'configuracoes'],
    queryFn: () => simuladoresService.getConfiguracoes(),
  });
}
```

#### 6. Documentar no Barrel

```typescript
// Em hooks/simuladores/index.ts
export * from './queries/useConfiguracoes';

// Em types/simuladores/index.ts
export * from './config.types';
```

---

## 📊 MÉTRICAS DE QUALIDADE

### Targets Obrigatórios

| Métrica                    | Target | Como Medir                               |
| -------------------------- | ------ | ---------------------------------------- |
| Taxa de uso de componentes | 100%   | `./scripts/audit-components-simple.sh`   |
| Duplicação de código       | 0%     | Code review manual                       |
| Backups manuais            | 0      | `find . -name "*.bak*"`                  |
| Build time                 | <3s    | `time npm run build`                     |
| Imports quebrados          | 0      | `./scripts/check-imports-pos-limpeza.sh` |
| Componentes sem doc        | 0      | Grep por `export function` sem `/**`     |
| console.log em prod        | 0      | `grep -r "console.log" src/`             |

### Medição Periódica

```bash
# Executar mensalmente (1ª segunda-feira)
./scripts/audit-components-simple.sh simuladores
./scripts/check-imports-pos-limpeza.sh
npm run build
```

---

## 📚 REFERÊNCIAS INTERNAS

### Documentação Relacionada

1. **AUDITORIA_LIMPEZA_CONCLUIDA.md** - Limpeza executada (Fase 1)
2. **SUMARIO_EXECUTIVO_AUDITORIA_SIMULADORES.md** - Métricas antes/depois
3. **RELATORIO_FINAL_LIMPEZA_SIMULADORES.md** - Detalhes da limpeza

### Scripts Úteis

- `./scripts/audit-components-simple.sh` - Identifica componentes não usados
- `./scripts/check-imports-pos-limpeza.sh` - Valida imports
- `./scripts/limpar-backups-simuladores.sh` - Remove backups obsoletos

---

## 🎓 ONBOARDING - NOVOS DESENVOLVEDORES

### Checklist de Introdução

Ao entrar no módulo de simuladores:

1. [ ] Ler este documento (`ARQUITETURA_SIMULADORES.md`)
2. [ ] Revisar estrutura de pastas proposta
3. [ ] Entender convenções de nomenclatura
4. [ ] Praticar: adicionar feature simples (ex: novo campo)
5. [ ] Code review com mentor
6. [ ] Familiarizar-se com scripts de auditoria

**Tempo estimado**: 1 hora

### Perguntas Frequentes

**Q: Onde criar uma nova página?**
A: Dentro de `pages/simuladores/[feature]/` seguindo estrutura feature-based.

**Q: Devo criar um novo service?**
A: Só se a entidade for completamente nova. Caso contrário, adicionar ao service existente.

**Q: Posso criar backup manual antes de deletar?**
A: Não. Use Git (`git stash`, `git branch backup-feature`).

**Q: Encontrei código duplicado, o que fazer?**
A: Extrair para componente compartilhado em `components/`, deletar duplicatas.

**Q: Build está lento, como otimizar?**
A: Verificar lazy loading, code splitting, remover imports não usados.

---

## 🔄 MANUTENÇÃO E EVOLUÇÃO

### Revisão Trimestral

A cada 3 meses:

1. **Auditoria de Componentes**

   ```bash
   ./scripts/audit-components-simple.sh simuladores > audit-$(date +%Y%m).txt
   ```

2. **Verificar Duplicações**

   - Buscar nomes similares (ex: Form vs Formulario)
   - Consolidar se necessário

3. **Atualizar Documentação**

   - Novos padrões identificados
   - Lições aprendidas
   - Anti-padrões encontrados

4. **Métricas**
   - Taxa de uso de componentes ainda 100%?
   - Build time aumentou?
   - Novos backups manuais criados?

### Evoluções Planejadas

**Fase 3 (Futuro)**:

- [ ] Consolidar 3 PDF Generators em 1
- [ ] Implementar testes E2E
- [ ] Adicionar Storybook para componentes
- [ ] CI/CD com validação de arquitetura

---

## 🏆 HISTÓRICO DE MELHORIAS

### Fase 1 - Limpeza (01/12/2025)

- ✅ 38 arquivos deletados (1.068MB)
- ✅ 68% redução em componentes (41 → 13)
- ✅ Service duplicado consolidado
- ✅ Build validado

### Fase 2 - Consolidação Arquitetural (Planejada)

- [ ] Estrutura feature-based implementada
- [ ] Páginas organizadas em subpastas
- [ ] PDF Generators consolidados (3 → 1)
- [ ] Rotas padronizadas
- [ ] Documentação completa

---

**Mantido por**: Time de Desenvolvimento AirTrust  
**Última Revisão**: 01/12/2025  
**Próxima Revisão**: 01/03/2026  
**Status**: ✅ ATIVO E OBRIGATÓRIO
