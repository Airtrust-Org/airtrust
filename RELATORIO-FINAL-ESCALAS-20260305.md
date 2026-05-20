# RELATÓRIO FINAL — Módulo Escalas — Sprint 2026-03-05

**Data:** 5 de Março de 2026  
**Commit:** `35599e36`  
**Worker Version ID:** `a87f32fb-08e3-436c-b3ef-d76ce80e441c`  
**Status:** ✅ Produção — `https://airtrust.online`

---

## Escopo da Sprint

Dois grupos de tarefas foram entregues nesta sessão:

| ID   | Tarefa                                                    | Status       |
| ---- | --------------------------------------------------------- | ------------ |
| C-06 | Quebra do monólito `escalas-core.ts` (2697 → 1752 linhas) | ✅ Concluído |
| C-17 | Migração ícones EscalasPage                               | ✅ Concluído |
| C-18 | Migração ícones ConfiguracaoEscalaPage                    | ✅ Concluído |
| C-19 | Migração ícones MinhaEscalaPage                           | ✅ Concluído |
| C-20 | Migração ícones componentes auxiliares (10 arquivos)      | ✅ Concluído |

---

## C-17 a C-20 — Migração Ícones: material-symbols-outlined → Lucide React

### Objetivo

Eliminar completamente o uso de `<span className="material-symbols-outlined">` em todos os arquivos dentro de `/src/react-app/pages/escalas/`. O sistema de ícones unificado é Lucide React v5 (tree-shakeable, component-based).

### Arquivos Migrados (13 arquivos)

| Arquivo                        | Ícones Migrados | Destaques Técnicos                                                                                                                   |
| ------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `EscalasPage.tsx`              | 29              | Ícones dinâmicos `statusConf.actionIcon` convertidos para ternário: `'send' ? <Send/> : 'check_circle' ? <CheckCircle/> : <Upload/>` |
| `ConfiguracaoEscalaPage.tsx`   | 20              | Array `abas` convertido de `{icon: string}` para `{Icon: LucideIcon}`; renderização `<a.Icon className="w-4 h-4" />`                 |
| `MinhaEscalaPage.tsx`          | 18              | `TIPO_LABELS` redesenhado de `{icon: string}` para `{Icon: LucideIcon}` — 12 tipos de evento mapeados                                |
| `GradeGantt.tsx`               | 5               | ChevronLeft, ChevronRight, Download, Table2, Printer                                                                                 |
| `ModalAdicionarTripulacao.tsx` | 6               | Plane, AlertTriangle, CheckCircle, CalendarDays, Info (inclui spans multi-linha)                                                     |
| `ModalConfigModulo.tsx`        | 3               | Migração via script Python regex                                                                                                     |
| `BarraStatusEscala.tsx`        | 7               | Refatoração estrutural: `ICON_MAP: Record<string, LucideIcon>` para lookup dinâmico                                                  |
| `ComparacaoVersao.tsx`         | 6               | ArrowLeftRight, X, History, Plus, Minus, CheckCircle                                                                                 |
| `ConfirmacaoInline.tsx`        | 3               | Sparkles, CheckCircle, XCircle                                                                                                       |
| `MiniCalendario.tsx`           | 2               | ChevronLeft, ChevronRight                                                                                                            |
| `WorkloadBalance.tsx`          | 1               | BarChart2                                                                                                                            |
| `PainelDisponibilidade.tsx`    | 1               | CalendarCheck                                                                                                                        |
| `VistaTripulante.tsx`          | 7               | User, X, Plane, Sofa, Clock, PieChart, Heart                                                                                         |
| **Total**                      | **~108**        |                                                                                                                                      |

### Padrão Adotado para Ícones Dinâmicos

**Antes (material-symbols, string-based):**

```tsx
// array de configuração
const abas = [{ id: 'quinzenas', icon: 'calendar_today' }]
// renderizacao
<span className="material-symbols-outlined">{a.icon}</span>
```

**Depois (Lucide, component-based):**

```tsx
import { type LucideIcon, CalendarDays } from 'lucide-react'
// array de configuração
const abas: Array<{ id: string; Icon: LucideIcon }> = [
  { id: 'quinzenas', Icon: CalendarDays }
]
// renderizacao
<a.Icon className="w-4 h-4" />
```

**Para mapa de lookup estático (BarraStatusEscala):**

```tsx
const ICON_MAP: Record<string, LucideIcon> = {
  groups: Users,
  person: User,
  event: Calendar,
  flight: Plane,
  pending: Clock,
  warning: AlertTriangle,
  medical_services: Stethoscope,
};
const IconComp = ICON_MAP[item.icon] ?? Calendar;
<IconComp className="w-4 h-4" />;
```

### Bug encontrado e corrigido

`EscalasPage.tsx` linha 875 — expressões JSX múltiplas dentro de `leftIcon={}`:

```tsx
// ❌ Inválido (causa erro de parsing):
leftIcon={
  {cond1 && <Send />} {cond2 && <CheckCircle />} {cond3 && <Upload />}
}

// ✅ Corrigido para ternário:
leftIcon={
  statusConf.actionIcon === 'send' ? <Send className="w-4 h-4" />
  : statusConf.actionIcon === 'check_circle' ? <CheckCircle className="w-4 h-4" />
  : <Upload className="w-4 h-4" />
}
```

---

## C-06 — Modularização escalas-core.ts

### Objetivo

Quebrar o monólito `worker-airtrust/src/routes/escalas-core.ts` (2697 linhas) em sub-módulos temáticos independentes usando o mecanismo `hono.route()`, mantendo 100% de compatibilidade de API.

### Resultado

| Arquivo                      | Linhas   | Responsabilidade                                                                                       |
| ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `escalas-core.ts`            | 1752     | CRUD escalas, tripulações, eventos, calendário, conflitos, export, notificar                           |
| `escalas-shared.ts`          | 143      | Helpers (`getEmpresaIdSafe`, `getEmpresaIdOptional`, `getEscalaVerificada`, `parseBody`) + Schemas Zod |
| `escalas-padroes.ts`         | 84       | GET/POST `/padroes`, DELETE `/padroes/:id`                                                             |
| `escalas-restricoes.ts`      | 96       | GET/POST `/restricoes`, DELETE `/restricoes/:id`                                                       |
| `escalas-quinzenas.ts`       | 135      | GET/POST `/quinzenas`, POST `/quinzenas/gerar-ano`, PUT/DELETE `/quinzenas/:id`                        |
| `escalas-cma-status.ts`      | 70       | GET `/funcionarios/cma-status`                                                                         |
| `escalas-tipos-evento.ts`    | 217      | GET/POST/PUT/DELETE `/tipos-evento-config` (com seed de defaults)                                      |
| `escalas-templates.ts`       | 188      | GET/POST/PUT/DELETE `/templates`, POST `/templates/:id/usar`                                           |
| `escalas-notificacoes.ts`    | 83       | GET `/notificacoes`, PATCH `/notificacoes/:nid/lida`, PATCH `/notificacoes/marcar-todas-lidas`         |
| `escalas-disponibilidade.ts` | 61       | GET `/disponibilidade`                                                                                 |
| **Total sub-módulos**        | **1077** |                                                                                                        |

**Redução em escalas-core.ts:** 2697 → 1752 linhas (-35%)

### Arquitetura de Montagem (escalas-core.ts)

```typescript
import padroes from './escalas-padroes';
import restricoes from './escalas-restricoes';
import quinzenas from './escalas-quinzenas';
import cmaStatus from './escalas-cma-status';
import tiposEvento from './escalas-tipos-evento';
import templates from './escalas-templates';
import notificacoes from './escalas-notificacoes';
import disponibilidade from './escalas-disponibilidade';

const escalas = new Hono<{ Bindings: Env }>();

escalas.route('/padroes', padroes);
escalas.route('/restricoes', restricoes);
escalas.route('/quinzenas', quinzenas);
escalas.route('/funcionarios/cma-status', cmaStatus);
escalas.route('/tipos-evento-config', tiposEvento);
escalas.route('/templates', templates);
escalas.route('/notificacoes', notificacoes);
escalas.route('/disponibilidade', disponibilidade);
```

### Padrão de cada sub-módulo

```typescript
import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaIdSafe, parseBody, PadraoEscalaSchema } from './escalas-shared';

const padroes = new Hono<{ Bindings: Env }>();

padroes.get('/', auth(), async (c) => { ... });
padroes.post('/', auth(), requireRole('admin', 'manager'), async (c) => { ... });
padroes.delete('/:id', auth(), requireRole('admin', 'manager'), async (c) => { ... });

export default padroes;
```

### Decisões de Design

- `POST /:id/notificar` mantido em `escalas-core.ts` — depende de `getEscalaVerificada(db, escalaId)` com bind do path pai, extrair exigiria reestruturação de rotas
- `GET /:id/export` mantido em `escalas-core.ts` — mesma razão, path pai `/:id`
- Schemas Zod exportados de `escalas-shared.ts` mas usados seletivamente (cada sub-módulo importa apenas o que precisa)
- `escalas-shared.ts` não instancia rotas — apenas exporta funções e schemas

---

## Validação

| Check                           | Resultado                              |
| ------------------------------- | -------------------------------------- |
| `npx tsc --noEmit`              | ✅ EXIT:0                              |
| `npm run build`                 | ✅ BUILD_EXIT:0                        |
| Worker deploy smoke test assets | ✅ assets=404 protected=401            |
| Git commit                      | `35599e36`                             |
| Cloudflare Worker Version       | `a87f32fb-08e3-436c-b3ef-d76ce80e441c` |

---

## Resumo de Impacto

```
Antes da sprint:
  escalas-core.ts              = 2697 linhas
  material-symbols-outlined    = ~108 instâncias no módulo Escalas

Depois da sprint:
  escalas-core.ts              = 1752 linhas  (-35%)
  sub-módulos criados          = 9 arquivos   (+1077 linhas distribuídas)
  material-symbols-outlined    = 0 instâncias no módulo Escalas  (100% migrado)
  tsc --noEmit                 = EXIT:0
  npm run build                = EXIT:0
```

---

_Gerado automaticamente em 2026-03-05 após deploy `35599e36`_
