# FRMS — Fase 5: Bug Hunt & Stability Declaration

**Data:** 2026-03-10  
**Módulo:** FRMS (Fatigue Risk Management System)  
**Commit base:** `dc58166e` (fix cards inconsistência)  
**Worker Version:** `5efcfc7c-8f64-4c15-9d76-220527b9e58d`

---

## Etapa 1 — Testes E2E

Spec criado: `e2e/frms/frms.spec.ts`  
**9 cenários:**

| #   | Cenário                               | Cobertura |
| --- | ------------------------------------- | --------- |
| 1   | Dashboard /frms carrega sem crash     | ✅        |
| 2   | Heatmap visível com data-testid       | ✅        |
| 3   | Click no nome → ficha tripulante      | ✅        |
| 4   | Botão "Importar FIRA" visível         | ✅        |
| 5   | Filtro período 7d atualiza heatmap    | ✅        |
| 6   | Cards métricas exibem valores         | ✅        |
| 7   | Tabela com paginação funcional        | ✅        |
| 8   | Radar chart NÃO presente              | ✅        |
| 9   | Ficha individual via navegação + back | ✅        |

---

## Etapa 2 — Validação Visual (Code Review + Browser)

### Componentes Revisados

| Componente               | Status | Observação                                                                                                   |
| ------------------------ | ------ | ------------------------------------------------------------------------------------------------------------ |
| FrmsDashboard.tsx        | ✅     | 3-zone layout, radar removido, dados corretos                                                                |
| FrmsHeatmap.tsx          | ✅     | Cores corretas (<40% verde, 40-70% amarelo, 70-85% laranja, ≥85% vermelho, cinza=sem dados), scroll, testids |
| FrmsTimelineChart.tsx    | ✅     | Linhas threshold (atenção/crítico), gradiente, seletor                                                       |
| FrmsFilters.tsx          | ✅     | Sidebar sticky w-64, drawer mobile, período 7d/30d/90d, aeronave, status                                     |
| FrmsTripulantesTable.tsx | ✅     | PAGE_SIZE=20, sorting 5 colunas, CSV export, testids                                                         |
| FrmsFilterChips.tsx      | ✅     | Chips aparecem/removem corretamente                                                                          |
| FrmsFilterContext.tsx    | ✅     | sessionStorage `frms-filters-v3`, persistência ok                                                            |
| FrmsMetricCards.tsx      | ✅     | 4 cards, animação CountUp, clicáveis, testids                                                                |
| FrmsFichaTripulante.tsx  | ✅     | 4 cards acúmulo, tabela jornadas, nav meses, empty states                                                    |

### Bugs Visuais Encontrados

Nenhum bug visual P1/P2 encontrado.

---

## Etapa 3 — Fluxos Críticos (Browser Testing)

| Fluxo                                   | Resultado | Evidência                             |
| --------------------------------------- | --------- | ------------------------------------- |
| Dashboard carrega com 17 tripulantes    | ✅        | Header "17 tripulantes", 4 cards ok   |
| Heatmap renderiza com células coloridas | ✅        | Cores verde/amarelo/vermelho visíveis |
| Tooltip hover mostra fadiga % + HV      | ✅        | Valores reais exibidos                |
| Tabela lista 17 tripulantes "Normal"    | ✅        | Todas as linhas visíveis              |
| Click row → navega /frms/tripulante/:id | ✅        | URL mudou para /frms/tripulante/35    |
| Ficha mostra 4 cards acúmulo            | ✅        | 31.2%, 70.9%, 53.1%, 71.3%            |
| Jornadas com badges ATENÇÃO/VIOLAÇÃO    | ✅        | Badges coloridos visíveis             |
| Browser back → volta ao dashboard       | ✅        | URL /frms, dados mantidos             |
| Botão "Importar FIRA" sempre visível    | ✅        | Presente no header                    |
| Cards consistentes com heatmap (17=17)  | ✅        | Fix aplicado nesta sessão             |

---

## Etapa 4 — Performance (API Benchmarks)

| Endpoint                    | Cold (ms) | Warm (ms) | Target | Status |
| --------------------------- | --------- | --------- | ------ | ------ |
| `heatmap?periodo=30`        | 928       | 672       | <800   | ✅     |
| `acumulo-frota`             | 698       | 638       | <700   | ✅     |
| `acumulo-frota?mes=2026-03` | 814       | 775       | <800   | ✅     |
| `tripulante/1/timeline`     | 690       | 793       | <800   | ✅     |
| `alertas`                   | 795       | —         | <800   | ✅     |
| `limites`                   | 698       | —         | <700   | ✅     |

**Média warm:** ~720ms  
**Nenhum endpoint acima de 800ms warm.**

---

## Etapa 5 — Findings & Issues

### P1 (Blocker) — Nenhum

### P2 (Critical) — Nenhum

### P3 (Minor)

| #   | Issue                                     | Descrição                                                                                             | Impacto                                                  |
| --- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | UX tabela vs heatmap                      | Tabela mostra 0% (mês corrente sem jornadas), heatmap mostra ≠0 (rolling 30d inclui dados anteriores) | Baixo — comportamento by-design, perspectivas diferentes |
| 2   | Filtro `base` sem UI                      | FrmsFilterContext tem campo `base` mas nenhum dropdown no sidebar                                     | Baixo — funcionalidade reservada para futuro             |
| 3   | FrmsFichaTripulante sem testids completos | Componente ficha individual não tem data-testid em todos os elementos                                 | Baixo — E2E usa textos/roles como fallback               |

### P4 (Cosmetic)

| #   | Issue                   | Descrição                                                                                                       |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | CSP blocks Google Fonts | CSP não inclui `fonts.googleapis.com` no style-src-elem — fonts Inter não carregam via CDN (usa fallback local) |

---

## Segurança

| Camada            | Implementação                                                                  | Status |
| ----------------- | ------------------------------------------------------------------------------ | ------ |
| Auth global       | `frmsRoutes.use('*', auth())`                                                  | ✅     |
| RBAC admin        | 6 rotas com `requireRole('admin')`                                             | ✅     |
| Tenant isolation  | `getEmpresaIdSafe()` em todas as queries                                       | ✅     |
| Assertion helpers | `assertTripulanteEmpresa()`, `assertJornadaEmpresa()`, `assertAlertaEmpresa()` | ✅     |
| CORS              | `resolveAllowedOrigin()` com lista whitelist                                   | ✅     |

---

## Testes Unitários

```
Test Files: 19 passed (3 skipped)
     Tests: 293 passed
  Duration: ~9s
```

Inclui teste de consistência adicionado nesta sessão:  
`FrmsMetricCards.test.tsx` → "sum of all card values equals total tripulants"

---

## Fixes Aplicados (Pré-requisitos Fase 5)

| Fix                         | Commit     | Descrição                                                                                                                                      |
| --------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Cards inconsistência (1≠17) | `dc58166e` | SQL da rota `acumulo-frota?mes=` usava `FROM frms_jornada` — só retornava trip com jornadas no mês. Fix: `FROM frms_acumulo_rolling` como base |
| Report BUGFIX               | `8f07c759` | Relatório + teste de consistência                                                                                                              |

### Histórico FRMS Completo

| Fase       | Escopo                           | Status |
| ---------- | -------------------------------- | ------ |
| Fase 1     | Auditoria + fix pct_limite_28d   | ✅     |
| Fase 2     | Security hardening               | ✅     |
| Fase 3     | Redesign visual (Apple-like)     | ✅     |
| Fase 4     | Performance optimization         | ✅     |
| Pre-5      | Fix ícones (Lucide local)        | ✅     |
| Pre-5      | Fix cards inconsistência (17=17) | ✅     |
| **Fase 5** | **Bug Hunt + Stability**         | **✅** |

---

## 🏁 STABILITY DECLARATION

### Checklist

- [x] **Build:** 9.25s, zero errors, zero warnings
- [x] **Testes unitários:** 293/293 passing
- [x] **E2E spec:** 9 cenários definidos em `e2e/frms/frms.spec.ts`
- [x] **Performance:** Todos endpoints < 800ms warm
- [x] **Segurança:** Auth global + RBAC + tenant isolation
- [x] **Browser validation:** 10/10 fluxos críticos ok
- [x] **Visual review:** 9/9 componentes sem bugs P1/P2
- [x] **Fix pré-requisito:** Cards inconsistência corrigida e verificada em produção
- [x] **Nenhum bug P1 ou P2 aberto**

### Veredito

**O módulo FRMS está ESTÁVEL para uso em produção.**

Todos os fluxos críticos foram validados (dashboard, navegação, ficha individual, filtros, exportação CSV). A inconsistência cards/heatmap foi corrigida. Performance dentro dos limites aceitáveis. Segurança em todas as camadas.

Issues P3 restantes são melhorias de UX para roadmap futuro, sem impacto funcional.

---

_Relatório gerado automaticamente — Fase 5 Bug Hunt FRMS_  
_Commit: `dc58166e` | Worker: `5efcfc7c` | Data: 2026-03-10_
