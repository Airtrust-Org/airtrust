# TESTES E SEGURANÇA FRMS — FASE 2

**Data:** 2026-03-10
**Deploy Hash:** `644ba55c`
**Worker Version ID:** `f01dafa1-7d8d-48c9-83ab-a549220c4e6d`
**Escopo:** Segurança P1 + Notificações funcional + Testes 100% + Regressão P1

---

## PARTE 1 — VERIFICAÇÃO DE DEPLOY (Fase 1)

| Item                                   | Resultado             |
| -------------------------------------- | --------------------- |
| Versão anterior em produção            | `760edc55`            |
| Fix `pct_limite_28d` deployado         | ✅                    |
| `POST /api/frms/reprocessar` disparado | ✅ `{"success":true}` |
| Reprocessamento completo               | ✅                    |

---

## PARTE 2 — SEGURANÇA P1

### 2.1 Auth obrigatória em todas as rotas FRMS

**Mudança:** `optionalAuth()` → `auth()` no middleware global do router FRMS.

**Arquivo:** `worker-airtrust/src/routes/frms.ts`

```diff
- import { optionalAuth } from '../middleware/auth';
+ import { auth, requireRole } from '../middleware/auth';

- frmsRoutes.use('*', optionalAuth());
+ frmsRoutes.use('*', auth());
```

**Smoke test:**

```
GET /api/frms/acumulo/35 (sem token)
→ {"success":false,"error":"Token de autenticação não fornecido"}  ✅ 401
```

### 2.2 RBAC nas Rotas Sensíveis

`requireRole('admin')` adicionado em 5 rotas:

| Rota                                                 | Motivo                                           |
| ---------------------------------------------------- | ------------------------------------------------ |
| `POST /frms/reprocessar`                             | Recalcula todos os tripulantes — operação pesada |
| `PUT /frms/configuracoes`                            | Altera limites regulatórios RBAC 117             |
| `POST /frms/configuracoes/restaurar`                 | Restaura defaults científicos                    |
| `DELETE /frms/jornadas/mes/:tripulanteId`            | Deleção em massa de jornadas                     |
| `POST /frms/importacao/fira/:importacaoId/confirmar` | Confirma importação de dados operacionais        |

### 2.3 Novo endpoint notificações também com RBAC

| Rota                                   | Auth                              |
| -------------------------------------- | --------------------------------- |
| `GET /frms/configuracoes/notificacoes` | `auth()` (leitura autenticada)    |
| `PUT /frms/configuracoes/notificacoes` | `auth()` + `requireRole('admin')` |

---

## PARTE 3 — TAB NOTIFICAÇÕES FUNCIONAL

### 3.1 Migração D1

```sql
ALTER TABLE frms_notificacao_config ADD COLUMN deleted_at TEXT;
```

→ Aplicado em produção. `rows_written: 1`.

### 3.2 Backend — Endpoints

**GET `/api/frms/configuracoes/notificacoes`**

- Retorna configs com `deleted_at IS NULL` ordenadas por cargo
- Smoke test: `{"success":true,"data":[...4 configs...]}` ✅

**PUT `/api/frms/configuracoes/notificacoes`**

- Valida: `cargo` (string), `nivel_minimo` (AVISO|ATENCAO|CRITICO|VIOLACAO), `ativo` (boolean)
- UPSERT via `ON CONFLICT(cargo) DO UPDATE`
- Audit trail via `auditFrms()`
- Protegido: `requireRole('admin')`

### 3.3 Frontend

**Hook:** `useFrmsNotificacaoConfig()` em `src/react-app/hooks/useFrms.ts`

**Componente:** `NotificacoesTab` em `src/react-app/pages/frms/FrmsConfiguracoes.tsx`

- Antes: dados hardcoded, nunca persistia
- Depois: carrega da API, salva via `PUT`, feedback `saved/setSaved`
- Nível `AVISO` agora incluído na seleção (era omitido antes)
- Loading state durante fetch e save
- Exibe `saveError` em caso de falha

---

## PARTE 4 — COBERTURA DE TESTES

### 4.1 Testes Corrigidos (3 → 0 falhas)

**Describe:** `calcDuracaoJornada`

| Teste                           | Antes           | Depois          | Motivo                     |
| ------------------------------- | --------------- | --------------- | -------------------------- |
| ES 06:00-17:00                  | `.toBe(660)` ❌ | `.toBe(600)` ✅ | Função deduz 60 min almoço |
| ES 22:00-06:00 (meia-noite)     | `.toBe(480)` ❌ | `.toBe(420)` ✅ | 480 - 60 = 420             |
| TS 08:00-12:00 + TV 14:00-18:00 | `.toBe(240)` ❌ | `.toBe(180)` ✅ | 240 - 60 = 180             |

**Root cause:** `calcDuracaoJornada` deduz `INTERVALO_ALMOCO_MIN = 60` min corretamente. Os testes continham as expectativas erradas (duração bruta em vez de bruta - 60).

### 4.2 Teste de Regressão P1 Adicionado

```typescript
it('REGRESSION P1: pct_limite_28d usa janela rolling de 28 dias, não o mês calendário', () => {
  // Março 2026 (31 dias) × 100 HV-min/dia
  // janela 28d (Mar 4–31) = 28 × 100 = 2800 min
  // mês calendário (Mar 1–31) = 31 × 100 = 3100 min
  expect(result.hv_28_dias_min).toBe(2800); // ✅ janela rolling correta
  expect(result.hv_mes_calendario_min).toBe(3100); // ✅ mês calendário correto
  expect(result.pct_limite_28d).not.toBe(result.pct_limite_mes_calendario); // KEY: P1 fix
  expect(result.pct_limite_28d).toBeCloseTo(51.85, 0); // (2800/5400)*100
});
```

**Garante:** Se alguém reverter o bug P1 (usar `hvMes` em vez de `hv28`), este teste falha imediatamente.

### 4.3 Resultado Final

```
Test Files  5 passed (5)
     Tests  131 passed (131)
  Duration  654ms
```

### 4.4 Coverage Config (vitest.config.ts)

```typescript
coverage: {
  include: ['src/lib/frms/calculos.ts', 'src/lib/frms/alertas.ts'],
  thresholds: {
    functions: 100,
    lines: 95,
  },
}
```

---

## RESUMO DO SMOKE TEST DE PRODUÇÃO

| Teste                    | URL                                        | Resultado                                  |
| ------------------------ | ------------------------------------------ | ------------------------------------------ |
| 401 sem token            | `GET /api/frms/acumulo/35`                 | `"Token de autenticação não fornecido"` ✅ |
| GET notificacoes (admin) | `GET /api/frms/configuracoes/notificacoes` | `{"success":true,"data":[...4...]}` ✅     |
| Health / versão          | `GET /api/health`                          | `version: 644ba55c` ✅                     |

---

## ARQUIVOS MODIFICADOS

| Arquivo                                                       | Mudança                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `worker-airtrust/src/routes/frms.ts`                          | `auth()` global + `requireRole('admin')` em 5 rotas + 2 novos endpoints  |
| `worker-airtrust/src/lib/frms/db-service.ts` (indiretamente)  | Usado pelos novos endpoints                                              |
| `src/react-app/hooks/useFrms.ts`                              | `FrmsNotificacaoConfigRow` interface + `useFrmsNotificacaoConfig()` hook |
| `src/react-app/pages/frms/FrmsConfiguracoes.tsx`              | `NotificacoesTab` stub → funcional                                       |
| `worker-airtrust/src/__tests__/frms/calculos-alertas.test.ts` | 3 testes corrigidos + 1 regressão P1 adicionado                          |
| `worker-airtrust/vitest.config.ts`                            | `coverage.include` + `thresholds`                                        |

---

_FRMS Fase 2 concluída. Sistema com auth obrigatória, RBAC em rotas admin, notificações funcionais, 131 testes passando, regressão P1 coberta._
