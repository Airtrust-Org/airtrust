# AIRTRUST v0.4-G13 — Correção de Bloqueio Indevido no Save EVD

Data: 2026-05-22
Base: G11 commit
Escopo: `EvdPage.tsx`, `worker-airtrust/src/routes/escalas-evd.ts`

## 1) Problema corrigido

### P0 — "Tripulante indisponível na escala mensal" ao salvar EVD
Tripulante confirmado como APTO na consulta (GET /tripulantes-operacionais) bloqueava ao salvar (POST /api/evd).

**Causa raiz dupla:**

| Causa | Arquivo | Descrição |
|---|---|---|
| A (frontend) | `EvdPage.tsx` | POST body não incluía `escala_id`; backend recebia `null` |
| B (backend) | `escalas-evd.ts` | `validateCrewAvailabilityOnMonthlyScale` bloqueava situações da mesma escala sem checar `escala_id` |

### P1 — Placeholder da Base com valor de exemplo interno
Campo Base exibia `SBCB / Base` como placeholder, expondo código ICAO interno.

### P2 — Mensagens de bloqueio genéricas
Todas as causas de bloqueio retornavam a mesma mensagem genérica, dificultando diagnóstico.

## 2) Inconsistência GET vs POST (raiz do P0)

### GET `/api/escalas/tripulantes-operacionais` (corrigido em G11)
```ts
const mesmoEscalaAtual = escalaId && conflito.escala_id === escalaId;
if (mesmoEscalaAtual) {
  return { ...tripulante, pode_ser_alocado: true, ... };
}
```
A escala_id chegava corretamente após G11 → tripulante aparecia como APTO.

### POST `/api/evd` → `validateCrewAvailabilityOnMonthlyScale` (corrigido em G13)
Antes do G13:
- Alocações operacionais: skip correto quando `!escalaId`
- Situações com `bloqueia_alocacao = 1`: **bloqueavam incondicionalmente**, sem checar `escala_id`

Se o tripulante tinha alocação operacional E situação (ex.: `MISSAO`) na mesma escala, o GET exemptava (mesmoEscalaAtual), mas o POST bloqueava na situação.

## 3) Alterações

### 3.1 Frontend (`EvdPage.tsx`)

**Adição de `escala_id` ao POST body:**
```tsx
const body = {
  data,
  escala_id: escalaId || undefined,  // ← NOVO
  pic_id: picId,
  ...
};
```

**Placeholder do campo Base:**
```tsx
// Antes
placeholder="SBCB / Base"
// Depois
placeholder="Ex.: SBME"
```

### 3.2 Backend (`escalas-evd.ts`)

**Novas constantes de mensagem:**
```ts
const MSG_FERIAS_UNAVAILABLE = 'Tripulante em afastamento/férias neste período.';
const MSG_SITUACAO_BLOCK = (situacao: string) =>
  `Tripulante indisponível: situação ${situacao} em outra escala.`;
const MSG_OTHER_ESCALA_BLOCK = 'Tripulante alocado operacionalmente em outra escala neste período.';
```

**`validateCrewAvailabilityOnMonthlyScale` — situações da mesma escala:**
```ts
// Antes (situações sempre bloqueavam se bloqueia_alocacao = 1)
if (Number(row.bloqueia_alocacao ?? 1) === 1) {
  return { blocked: true, message: MSG_MONTHLY_UNAVAILABLE };
}

// Depois (situações da mesma escala são exemptadas)
if (params.escalaId && String(row.escala_id || '') === String(params.escalaId)) {
  continue; // mesma escala — EVD é extensão do mesmo contexto
}
if (Number(row.bloqueia_alocacao ?? 1) === 1) {
  return { blocked: true, message: MSG_SITUACAO_BLOCK(situacao) };
}
```

## 4) Lógica resultante em `validateCrewAvailabilityOnMonthlyScale`

| Tipo de conflito | `escalaId` fornecido | Resultado |
|---|---|---|
| `funcionario_ferias` | qualquer | Bloqueado: "em afastamento/férias" |
| Operacional, mesma escala | sim | **Liberado** (mesmo contexto) |
| Operacional, sem escala_id | não | Liberado (sem contexto para afirmar conflito) |
| Operacional, outra escala | sim | Bloqueado: "outra escala" |
| FOLGA / sem situacao_tipo | qualquer | Liberado |
| Situação, mesma escala | sim | **Liberado** (consistente com GET) |
| Situação, sem escala_id | não | Bloqueado (não há contexto para liberar) |
| Situação, outra escala | sim | Bloqueado: "situação X em outra escala" |

## 5) Impacto

- Nenhuma alteração de schema ou migration
- Nenhuma alteração no cálculo FRMS
- Nenhuma alteração em SIGVOOS/cron
- Backend (`escalas-evd.ts`) alterado pois a origem do bloqueio indevido estava no endpoint de disponibilidade do POST EVD

## 6) Verificação

```bash
npm run build          # ✓ sem erros
npx tsc --noEmit       # ✓ sem erros TypeScript (frontend)
npx tsc -p worker-airtrust/tsconfig.json --noEmit  # ✓ sem erros TypeScript (backend)
```

### Cenários de teste manual

| Cenário | Esperado após G13 |
|---|---|
| Tripulante com alocação operacional na escala publicada do mês | Salva sem erro |
| Tripulante com situação (ex.: MISSAO) na mesma escala do mês | Salva sem erro |
| Tripulante em férias (funcionario_ferias) | Bloqueado: "Tripulante em afastamento/férias neste período." |
| Tripulante com situação bloqueante em OUTRA escala | Bloqueado: "Tripulante indisponível: situação X em outra escala." |
| Tripulante alocado operacionalmente em OUTRA escala | Bloqueado: "Tripulante alocado operacionalmente em outra escala neste período." |
| Campo Base vazio | Placeholder mostra "Ex.: SBME" (sem código ICAO interno) |
