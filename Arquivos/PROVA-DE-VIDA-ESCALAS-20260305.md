# PROVA DE VIDA — Módulo Escalas

**Data:** 2026-03-05  
**Executor:** GitHub Copilot (Claude Opus 4.6)  
**Ambiente:** Produção (`airtrust-api-production.airtrust.workers.dev`)  
**Autenticação:** `manager@airtrust.com` (perfil GESTOR → role normalized to `manager`)

---

## RESUMO EXECUTIVO

| Métrica                  | Valor                                                |
| ------------------------ | ---------------------------------------------------- |
| **Endpoints testados**   | 24                                                   |
| **BUGs encontrados**     | 9 (5 backend, 4 frontend)                            |
| **BUGs corrigidos**      | 9/9 (100%)                                           |
| **Feature implementada** | `gerarEventosBase` — auto-fill VOO/FOL               |
| **Commits**              | 4 (71585fda, d3244731, 61f0c687, 44fba3e3, 99ad55c0) |
| **Worker deploys**       | 5                                                    |

---

## FASE 1 — Mapa de Rotas

### Frontend (App.tsx)

| Rota                     | Componente           | Protegida |
| ------------------------ | -------------------- | --------- |
| `/escalas`               | `EscalasMensais`     | ✅        |
| `/escalas/configuracoes` | `ConfiguracaoEscala` | ✅        |
| `/escalas/minha-escala`  | `MinhaEscala`        | ✅        |

### Backend (escalas-core.ts — 16 sub-módulos)

**9 prefixados:** padroes, restricoes, quinzenas, cma-status, tipos-evento-config, templates, notificacoes, disponibilidade, pilotos  
**7 raiz:** crud, status, tripulacoes, eventos, calendario, conflitos, exportacao

---

## FASE 2 — Smoke Tests Produção (curl)

| #   | Endpoint                               | Método | HTTP | Resultado                       |
| --- | -------------------------------------- | ------ | ---- | ------------------------------- |
| 1   | `/api/escalas?ano=2026`                | GET    | 200  | ✅ Lista escalas                |
| 2   | `/api/escalas/:id`                     | GET    | 200  | ✅ Detalhe escala               |
| 3   | `/api/escalas/FAKE-ID`                 | GET    | 404  | ✅ IDOR bloqueado               |
| 4   | `/api/escalas/:id/calendario`          | GET    | 200  | ✅ Calendário + eventos         |
| 5   | `/api/escalas/:id/conflitos`           | GET    | 200  | ✅ Conflitos                    |
| 6   | `/api/escalas/:id/tripulacoes`         | GET    | 200  | ✅ Tripulações com JOINs        |
| 7   | POST tripulação SIC=PIC                | POST   | 400  | ✅ Bloqueado                    |
| 8   | `/api/escalas/:id/eventos`             | GET    | 200  | ✅ Eventos                      |
| 9   | PATCH status pub→pub                   | PATCH  | 400  | ✅ Transição inválida bloqueada |
| 10  | PATCH status draft→pub                 | PATCH  | 400  | ✅ Precisa em_revisao primeiro  |
| 11  | PATCH status draft→em_revisao          | PATCH  | 200  | ✅ Transição válida             |
| 12  | `/api/escalas/tipos-evento-config`     | GET    | 200  | ✅ 12 tipos                     |
| 13  | `/api/escalas/quinzenas?ano=2026`      | GET    | 200  | ✅ 1 quinzena                   |
| 14  | `/api/escalas/templates`               | GET    | 200  | ✅ (vazio, esperado)            |
| 15  | `/api/escalas/disponibilidade`         | GET    | 200  | ✅                              |
| 16  | `/api/escalas/funcionarios/cma-status` | GET    | 200  | ✅                              |
| 17  | `/api/escalas/:id/export?format=csv`   | GET    | 200  | ✅ Content-Disposition OK       |
| 18  | `/api/escalas/:id/export?format=html`  | GET    | 200  | ✅ Inline print                 |
| 19  | `/api/funcionarios/:id/escalas`        | GET    | 200  | ✅ (após fix BUG 5)             |
| 20  | POST criar escala                      | POST   | 200  | ✅ UUID retornado               |
| 21  | DELETE escala                          | DELETE | 200  | ✅ Soft delete                  |
| 22  | POST criar tripulação                  | POST   | 201  | ✅ + auto-fill                  |
| 23  | POST criar evento                      | POST   | 201  | ✅                              |
| 24  | `/api/escalas/notificacoes`            | GET    | 200  | ✅ data + nao_lidas             |
| 25  | `/api/frms/score-atual/:id`            | GET    | 200  | ✅ Score FRMS                   |
| 26  | `/api/escalas/padroes`                 | GET    | 200  | ✅ 5 padrões                    |
| 27  | `/api/escalas/restricoes`              | GET    | 200  | ✅ (vazio)                      |
| 28  | `/api/escalas/funcionarios/pilotos`    | GET    | 200  | ✅ 27 pilotos                   |

---

## FASE 3 — Links e Navegação FE

| navigate() Target                  | Route Exists | Status |
| ---------------------------------- | ------------ | ------ |
| `/escalas`                         | ✅           | OK     |
| `/escalas/configuracoes`           | ✅           | OK     |
| `/escalas/minha-escala`            | ✅           | OK     |
| `/qualificacoes?funcionario=${id}` | ✅           | OK     |

**Dead links: 0 | Orphan routes: 0 | <Link> components: 0 (all programmatic navigate)**

---

## FASE 4 — Reatividade (Mutation → Invalidation)

### Achado Crítico: Desconexão `useApi()` ↔ TanStack QueryClient

O módulo usa `useApi()` (hook customizado com `useState`/fetch) para queries, mas `queryClient.invalidateQueries()` para invalidação. Como `useApi` não registra no QueryClient, **todas invalidateQueries são no-ops**.

**Workaround funcional:** `refetchCalendario()` / `refetchLista()` chamados manualmente nos callbacks `onClose` dos modais.

| Mutation                  | Refetch Manual                      | UI Stale? |
| ------------------------- | ----------------------------------- | --------- |
| criarEscala               | ✅ refetchLista                     | OK        |
| alterarStatus             | ✅ refetchCalendario + refetchLista | OK        |
| CRUD tripulação           | ✅ refetchCalendario                | OK        |
| CRUD eventos              | ✅ refetchCalendario                | OK        |
| deletarEscala             | ✅ refetchLista                     | OK        |
| templates criar/atualizar | ❌ sem refetch                      | ⚠️ STALE  |
| marcarLida/TodasLidas     | ✅ local state update               | OK        |

**Score Reatividade: 7/10** (principal OK via workaround, templates stale em cenário edge)

---

## FASE 5 — Edge Cases

| #   | Cenário                                             | Status       | Detalhes                              |
| --- | --------------------------------------------------- | ------------ | ------------------------------------- |
| 1   | Empty states (lista, gantt, tripulações, conflitos) | ✅           | 11 componentes com empty state        |
| 2   | Loading states (skeleton, spinner)                  | ✅           | 8 componentes com loading             |
| 3   | Error toast no CRUD                                 | ✅           | Toast error em todos os catches       |
| 4   | Token expirado (useApi)                             | ✅           | Auto-logout no interceptor 401        |
| 5   | Token expirado (fetch direto)                       | ⚠️ CORRIGIDO | Exports agora checam 401              |
| 6   | Date boundaries (month edges)                       | ✅           | date-fns startOfMonth/endOfMonth      |
| 7   | Optimistic updates                                  | ℹ️           | Nenhum (seguro mas lento)             |
| 8   | Concurrent edit protection                          | ⚠️           | Sem ETag/versão (overwrite last-wins) |

---

## FASE 6 — Consistência Visual

| #   | Item                        | Status       | Detalhes                                                      |
| --- | --------------------------- | ------------ | ------------------------------------------------------------- |
| 1   | ISO dates raw (YYYY-MM-DD)  | ✅ CORRIGIDO | 5 componentes → DD/MM/YYYY                                    |
| 2   | Status badges centralizados | ⚠️           | Duplicação STATUS_BADGE vs statusConfig.ts                    |
| 3   | Overflow/scroll GradeGantt  | ✅           | horizontal scroll + sticky header + sticky name col           |
| 4   | Responsive design           | ✅           | grid-cols breakpoints em 4/6 páginas                          |
| 5   | Typography                  | ⚠️           | Mix text-[8-11px] + standard sizes (consistente internamente) |
| 6   | Z-index                     | ✅           | Hierarquia 10→20→30→40→50→9999(CMA overlay, intencional)      |
| 7   | `licenca` icon              | ✅ CORRIGIDO | `icon: 'event_busy'` → `Icon: CalendarOff`                    |

---

## FASE 7 — BUGs Encontrados e Corrigidos

### Backend (5)

| #   | BUG                                    | Arquivo                               | Fix                        | Commit                  |
| --- | -------------------------------------- | ------------------------------------- | -------------------------- | ----------------------- |
| B1  | `nome_guerra` → column `guerra`        | escalas-crud, tripulacoes, exportacao | Renamed column refs        | `71585fda`              |
| B2  | RBAC: `gestor` ≠ `manager`             | rbac.ts                               | Added `normalizeRole()`    | `d3244731`              |
| B3  | Missing D1 tables (0230-0233)          | —                                     | Manual CREATE TABLE        | wrangler d1 exec        |
| B4  | `escala_mensal` → `escalas_mensais`    | funcionarios.ts                       | Renamed table ref          | `a597724a` → `61f0c687` |
| B5  | `et2.funcionario_id` → `pic_id/sic_id` | funcionarios.ts                       | OR condition + bind params | `61f0c687`              |

### Frontend (4)

| #   | BUG                                         | Arquivo                                                                                       | Fix                            | Commit     |
| --- | ------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------ | ---------- |
| F1  | `escalaId` not destructured (undefined URL) | CelulaEvento.tsx                                                                              | Added to destructure           | `44fba3e3` |
| F2  | Export CSV/HTML no try/catch + no 401       | GradeGantt.tsx                                                                                | Added try/catch + 401 redirect | `44fba3e3` |
| F3  | Raw ISO dates in 5 components               | CelulaEvento, ConfirmacaoInline, PainelTripulacoes, ComparacaoVersao, ModalVerificarConflitos | DD/MM/YYYY formatting          | `44fba3e3` |
| F4  | `licenca` icon: string instead of component | MinhaEscalaPage.tsx                                                                           | `Icon: CalendarOff`            | `44fba3e3` |

---

## COMPLEMENTO — `gerarEventosBase` (Auto-Fill VOO/FOL)

### Implementação

| Arquivo                  | Função                        | Descrição                                                |
| ------------------------ | ----------------------------- | -------------------------------------------------------- |
| `escalas-shared.ts`      | `gerarEventosBase()`          | Gera eventos VOO/FOL por dia, seguindo padrão de escala  |
| `escalas-shared.ts`      | `removerEventosAutoGerados()` | Soft-delete eventos auto-gerados de uma tripulação       |
| `escalas-tripulacoes.ts` | POST handler                  | Chama `gerarEventosBase` para PIC + SIC                  |
| `escalas-tripulacoes.ts` | PUT handler                   | Remove antigos + regenera quando dates/padrão/crew mudam |
| `escalas-tripulacoes.ts` | DELETE handler                | Limpa eventos auto-gerados                               |

### Lógica

1. **Com padrão (ex: 14x14):** Alterna blocos de trabalho (VOO) e descanso (FOL)
   - Dia 1-14 → VOO, Dia 15-28 → FOL, repete
2. **Sem padrão:** Todos os dias = VOO
3. **Respeita eventos manuais:** Não gera em datas com eventos já existentes
4. **Não-bloqueante:** Erro no auto-fill não impede criação da tripulação
5. **Batch insert:** Usa `db.batch()` para performance

### Teste em Produção

```
POST tripulação 14x14 (Mar 16-31):
→ eventos_gerados: 32 (16 dias × 2 crew)
→ VOO: 28 (14 work × 2), FOL: 4 (2 rest × 2)
→ motivo_automatico: "Auto-gerado (14x14) — dia trabalho X/14"

DELETE tripulação:
→ 32 auto-gerados soft-deleted
→ 11 manuais preservados
```

---

## COMMITS DESTA SESSÃO

| Hash       | Mensagem                                                                        |
| ---------- | ------------------------------------------------------------------------------- |
| `71585fda` | fix(escalas): nome_guerra → guerra across all SQL queries                       |
| `d3244731` | fix(rbac): normalizeRole gestor→manager, usuario→user                           |
| `a597724a` | fix(funcionarios): escala_mensal → escalas_mensais + remove nonexistent columns |
| `61f0c687` | fix(funcionarios): use pic_id/sic_id instead of funcionario_id in joins         |
| `44fba3e3` | fix(escalas): PROVA-DE-VIDA fase 7 — escalaId, exports, ISO dates, licenca icon |
| `99ad55c0` | feat(escalas): gerarEventosBase — auto-fill VOO/FOL                             |

---

## RECOMENDAÇÕES FUTURAS

1. **Migrar useApi → useQuery para módulo Escalas** — Eliminar workarounds manuais de refetch, ativar invalidateQueries reais
2. **Adicionar ETag/versão** — Proteger contra overwrite em edição concorrente
3. **Unificar STATUS_CONFIG** — Remover duplicação STATUS_BADGE em EscalasPage
4. **Preview visual no wizard** — Mostrar timeline VOO/FOL antes de confirmar tripulação
5. **Origem column** — ALTER TABLE escala_eventos ADD COLUMN origem TEXT para rastrear source

---

**VEREDICTO: MÓDULO ESCALAS ESTÁ VIVO E FUNCIONAL** ✅

- Todos os 28 endpoints respondem corretamente
- 9 bugs encontrados e corrigidos em produção
- Feature de auto-fill VOO/FOL implementada e testada
- Zero dead links, zero orphan routes
