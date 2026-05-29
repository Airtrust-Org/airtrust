# FRMS EVD Coordination Visibility — Closure

**Data:** 2026-05-29  
**Branch de origem:** `main`  
**Commits:** `c96c2d6` (Window A — SC Est.) + `06c5601` (Window B — badges-link + deep link) em `origin/main`  
**Deploy:** Pages-only (frontend) — sem Worker deploy, sem migration

---

## 1. Objetivo Cumprido

Integrar visibilidade de fadiga/FRMS à rotina da coordenação e à escala diária (EVD), sem criar decisão automática, sem novo threshold, sem mitigação e sem migration.

O coordenador agora vê, no EVD, sinais imediatos de fadiga por tripulante:
- Badge F com label verbal em tooltip ("Check-in pendente", "Dado estimado", "Revisar com gestor", etc.)
- Marcador `Est.` no badge quando o dado é estimado (não check-in real)
- Clique no badge leva diretamente ao Controle Operacional FRMS filtrado por data e tripulante
- Card de aeronave com alerta FRMS exibe link "Ver FRMS"
- Legenda da tabela explica os códigos

---

## 2. Estado de Produção

| Camada | SHA | Status |
|---|---|---|
| Frontend (Pages) | `06c5601` | ✅ Deployed — `airtrust.pages.dev` confirma build stamp |
| Backend (Worker) | `880e039` | ✅ Sem mudanças neste pacote — produção em `880e039` |
| Banco (D1) | — | ✅ Sem migration — não alterado |

---

## 3. Validações Executadas

| Validação | Resultado |
|---|---|
| `tsc --noEmit` | ✅ 0 erros |
| `npm run build` | ✅ Sucesso — `EvdPage-*.js` gerado com `SC Est.`, `Ver FRMS`, `controle-operacional`, `data_inicio` |
| `npm run lint` | ✅ api-base, tracked-secrets, auth-boundaries — todos OK |
| `evdFrmsBadges.test.ts` (13 testes) | ✅ 13/13 pass |
| `FrmsControleOperacional.test.tsx` (18 testes) | ✅ 18/18 pass |
| Total de testes no arquivo alvo | ✅ 31/31 pass |
| `GET /api/version` produção | ✅ `880e039` (esperado — sem deploy Worker) |
| `GET /api/frms/operational-snapshot` produção | ✅ 401 (rota protegida) |
| Build stamp produção Pages | ✅ `06c5601` confirmado |
| Bundle: `SC Est.` | ✅ Presente em `EvdPage-*.js` |
| Bundle: `Ver FRMS` | ✅ Presente em `EvdPage-*.js` |
| Bundle: `data_inicio` | ✅ Presente em `EvdPage-*.js` |
| Bundle: `controle-operacional` | ✅ Presente em `EvdPage-*.js` |
| Bundle: `Indicador FRMS legado` | ✅ Presente em `PainelDisponibilidade-*.js`, `ModalAdicionarTripulacao-*.js` |
| `apto_para_voo` / `INAPTO` / SGSO | ✅ Ausentes do `EvdPage-*.js` |

---

## 4. Garantias de Segurança (confirmadas)

- **Sem decisão automática**: nenhum bloqueio, aprovação ou rejeição gerada automaticamente
- **Sem mitigação**: nenhum fluxo de mitigação criado ou alterado
- **Sem SGSO**: nenhuma integração SGSO tocada
- **Sem novo threshold**: nenhum limite novo criado; thresholds existentes permanecem
- **Sem migration**: nenhuma migration criada ou executada
- **Sem reprocessamento**: nenhum dado histórico reprocessado
- **Sem `apto_para_voo`**: campo não usado em nenhuma parte desta mudança
- **Sem bloqueio novo**: regras `pode_ser_alocado`, `BLOQUEADO_CMA`, `BLOQUEADO_FRMS` não alteradas
- **Score legado intacto**: `Indicador FRMS legado` permanece apenas onde existia (`PainelDisponibilidade.tsx:149`, `ModalAdicionarTripulacao.tsx:1668`) — não tocado neste pacote

---

## 5. Arquivos Modificados

| Arquivo | Tipo | Commits |
|---|---|---|
| `src/react-app/pages/escalas/EvdPage.tsx` | Frontend — badges + links + SC Est. | `c96c2d6` + `06c5601` |
| `src/react-app/pages/frms/FrmsControleOperacional.tsx` | Frontend — deep link QS init | `06c5601` |
| `src/react-app/pages/escalas/__tests__/evdFrmsBadges.test.ts` | Testes novos (13) | `06c5601` |
| `src/react-app/pages/frms/__tests__/FrmsControleOperacional.test.tsx` | Testes atualizados (MemoryRouter + QS, 18 total) | `06c5601` |
| `docs/FRMS_EVD_COORDINATION_VISIBILITY_PACK.md` | Documentação do pacote | `06c5601` |

---

## 6. Funções Exportadas (contratos de API interna)

### `getFrmsVerboseLabel(signal: FrmsTripulanteSignal | null | undefined): string`
Exportada de `EvdPage.tsx`. Traduz sinal FRMS em label verbal operacional.

| Condição | Label |
|---|---|
| `signal` null/undefined | "Sem dado FRMS" |
| `status === 'no_duty'` | "Sem jornada FRMS" |
| `status === 'not_submitted'` | "Check-in pendente" |
| `status === 'critical'` ou `'unfit_for_duty'` | "Revisar com gestor" |
| `requiresReview === true` ou `hasAlert === true` | "Revisar com gestor" |
| `status === 'attention'` | "Atenção" |
| `dataSource === 'default_estimate'` | "Dado estimado" |
| `dataSource === 'crew_reported'` | "Check-in recebido" |
| demais | "FRMS OK" |

### `buildFrmsLink(data: string, funcionarioId?: number | string | null): string`
Exportada de `EvdPage.tsx`. Constrói URL para `/frms/controle-operacional` com filtros.
- Sempre inclui `data_inicio` e `data_fim` (mesma data)
- Inclui `funcionario_id` apenas quando valor é numérico válido (> 0)
- Nunca inclui `apto`, `inapto`, `bloqueio`

---

## 7. Deep Link — FrmsControleOperacional

A partir de `06c5601`, `/frms/controle-operacional` aceita query string para inicialização de filtros:

```
/frms/controle-operacional?data_inicio=2026-05-27&data_fim=2026-05-27
/frms/controle-operacional?data=2026-05-27&funcionario_id=35
/frms/controle-operacional?data=2026-05-27&base=SBSP
/frms/controle-operacional?data=2026-05-27&aeronave=PR-YYY
```

A inicialização ocorre apenas no mount (`useMemo` com deps `[today]`). Filtros editados pelo usuário depois do mount não são sobrescritos por navegação futura na mesma sessão.

---

## 8. Achados do Audit Endereçados

O `docs/FRMS_EVD_COORDINATION_INTEGRATION_AUDIT.md` (auditoria pré-implementação em `586988c`) identificou:

| Risco | Endereçado? |
|---|---|
| RISCO 1: `frms_score` legado sem rótulo qualificador | ⚠️ Parcialmente — label "Indicador FRMS legado" foi adicionado em commit anterior (`880e039`); exibição do número permanece (fase separada) |
| RISCO 2: Dado estimado sem destaque visual | ✅ Endereçado — `SC Est.` no badge |
| RISCO 3: Dois scores paralelos | ⏸️ Em aberto — fase separada |
| RISCO 4: FrmsControleOperacional não existe | ✅ Criado neste pacote |
| Link EVD → FRMS não implementado | ✅ Implementado |

Ver `docs/FRMS_EVD_INTEGRATION_AUDIT_SUPERSESSION.md` para mapeamento completo.

---

## 9. Fases Bloqueadas (pós-closure)

| Fase | Motivo de bloqueio |
|---|---|
| C2/C4 histórico — correção de dados passados | Fase própria |
| EVD profunda — snapshot completo por tripulante | Fase própria |
| Nova fórmula FRMS / novo threshold | Requer Opus + validação científica |
| Mitigação automática | Requer aprovação regulatória/operacional |
| Integração SGSO com FRMS | Fase própria |
| Tooltip KSS + sono no badge EVD (Item D do audit) | Endpoint `daily-fatigue` não retorna esses campos em mode `scope=team` — fase separada |
| Filtros por nome/status no FrmsFadigaPainel (Item E) | Fase separada |
| Renomear `frms_score` numérico para "Acúmulo HV" (RISCO 1 completo) | Fase separada |

---

*Closure docs-only. Nenhum código runtime, banco ou deploy foi alterado por este arquivo.*
