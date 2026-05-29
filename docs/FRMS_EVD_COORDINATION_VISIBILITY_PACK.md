# FRMS EVD Coordination Visibility Pack

## 1. Objetivo

Integrar visibilidade de fadiga/FRMS à rotina da coordenação e à escala diária (EVD), sem criar decisão automática, sem novo threshold, sem mitigação e sem migration.

A coordenação precisa ver, no lugar certo, sinais simples: check-in pendente, dado estimado, status de atenção/revisão, e acesso direto ao Controle Operacional FRMS.

## 2. O que foi integrado

| Componente | Mudança |
|---|---|
| `EvdPage.tsx` | Badges F na tabela de voos convertidos em links clicáveis para o Controle FRMS |
| `EvdPage.tsx` | Tooltip verbal nos badges F: "Check-in pendente", "Revisar com gestor", "Dado estimado", "Check-in recebido", "FRMS OK", "Sem dado FRMS" |
| `EvdPage.tsx` | Cards de aeronave: link "Ver FRMS" adicionado quando há alerta FRMS na tripulação |
| `EvdPage.tsx` | Legenda da tabela atualizada com descrição verbal dos badges |
| `FrmsControleOperacional.tsx` | Aceita query string de deep link: `?data_inicio=`, `?data_fim=`, `?data=`, `?funcionario_id=`, `?base=`, `?aeronave=` |
| `getFrmsVerboseLabel()` (exportada) | Função que traduz `FrmsTripulanteSignal` em label verbal operacional |
| `buildFrmsLink()` (exportada) | Função que constrói a URL de deep link para o Controle FRMS com filtros pré-preenchidos |

## 3. O que aparece no EVD

Para cada tripulante designado na escala diária, o badge F mostra:

| Badge | Label verbal (tooltip) | Quando aparece |
|---|---|---|
| `OK` | Check-in recebido / FRMS OK | Status normal, dado real ou sem fonte especial |
| `ATN` | Atenção | Status `attention` |
| `REV` | Revisar com gestor | Status `critical`, `unfit_for_duty`, `requiresReview` ou `hasAlert` |
| `SC` | Check-in pendente | Status `not_submitted` |
| `IND` | FRMS indisponível | Endpoint FRMS fora do ar |
| `—` | Sem dado FRMS / Sem jornada FRMS | Tripulante sem sinal FRMS |

Além dos badges:
- Cada badge F é um link clicável para o Controle Operacional FRMS filtrado por data e tripulante.
- Cards de aeronave com alerta FRMS exibem "Ver FRMS" linking para o Controle com a data de referência.
- Legenda da tabela explica os códigos e o link.

**Dado estimado**: quando `dataSource === 'default_estimate'`, o tooltip exibe "Dado estimado". O badge curto ainda exibe `OK` (status normal), mas o tooltip diferencia.

## 4. O que fica no Controle Operacional FRMS

O Controle Operacional FRMS (`/frms/controle-operacional`) continua sendo a tela detalhada com:
- KSS, horas de sono, qualidade do sono
- Efetividade estimada (quando existir)
- Indicadores de quinzena
- Fonte do dado (REAL/ESTIMADO/AUSENTE/INCONSISTENTE)
- Ciência operacional (read-ack)
- Histórico por tripulante

A partir desta versão, aceita query string de deep link para inicialização de filtros:

```
/frms/controle-operacional?data_inicio=2026-05-27&data_fim=2026-05-27&funcionario_id=35
/frms/controle-operacional?data=2026-05-27&funcionario_id=35
/frms/controle-operacional?data=2026-05-27&base=SBSP
```

## 5. O que não foi implementado

- KSS e efetividade no EVD diretamente: o endpoint `/api/frms/daily-fatigue` não retorna esses campos; eles estão disponíveis apenas no Controle Operacional via `/api/frms/operational-snapshot`.
- Indicadores de quinzena no EVD: idem, requerem o snapshot completo.
- Integração EVD profunda (escala de voo com snapshot completo por tripulante): fase própria.
- C2/C4 histórico: fase própria.
- Mitigação automática: não implementado por decisão de design.

## 6. Garantias de segurança

- **Sem decisão automática**: nenhum bloqueio, aprovação ou rejeição é gerada automaticamente.
- **Sem mitigação**: nenhum fluxo de mitigação foi criado ou alterado.
- **Sem SGSO**: nenhuma integração SGSO foi tocada.
- **Sem novo threshold**: nenhum limite novo foi criado. Os thresholds existentes permanecem.
- **Sem migration**: nenhuma migration foi criada ou executada.
- **Sem reprocessamento**: nenhum dado histórico foi reprocessado.
- **Sem `apto_para_voo`**: campo não foi usado em nenhum lugar desta mudança.
- **Sem bloqueio novo**: regras de `pode_ser_alocado`, `BLOQUEADO_CMA`, `BLOQUEADO_FRMS` não foram alteradas.
- **Score legado**: o label `Indicador FRMS legado` para `frms_score` paralelo permanece onde já existia (FrmsFadigaHistorico, FrmsFadigaPainel) — esta PR não o toca.

## 7. Limitações

- O EVD exibe apenas o status resumido de fadiga (badge F). Para dados completos (KSS, sono, efetividade, quinzena), o coordenador deve clicar no badge para abrir o Controle Operacional FRMS.
- A data de referência FRMS usada pelo EVD é a data atual (para escalas futuras, é hoje; para escalas passadas ou no mesmo dia, é a data da escala). Isso segue a lógica já existente em `getFrmsReferenceDate()`.
- O link "Ver FRMS" aponta para o Controle Operacional filtrado pelo tripulante com alerta, mas o Controle pode mostrar outros tripulantes também (o filtro é `funcionario_id` aplicado no frontend, não na API).

## 8. Próximas fases bloqueadas

| Fase | Status |
|---|---|
| C2/C4 histórico — correção de dados passados | Bloqueada para fase própria |
| EVD profunda — snapshot completo por tripulante na escala | Bloqueada para fase própria |
| Nova fórmula FRMS / novo threshold | Requer Opus e validação científica |
| Mitigação automática | Requer aprovação regulatória/operacional |
| Integração SGSO com FRMS | Fase própria |

## 9. Arquivos alterados

| Arquivo | Tipo de mudança |
|---|---|
| `src/react-app/pages/escalas/EvdPage.tsx` | Frontend — badges + links |
| `src/react-app/pages/frms/FrmsControleOperacional.tsx` | Frontend — query string init |
| `src/react-app/pages/escalas/__tests__/evdFrmsBadges.test.ts` | Testes novos |
| `src/react-app/pages/frms/__tests__/FrmsControleOperacional.test.tsx` | Testes atualizados (MemoryRouter + QS) |
| `docs/FRMS_EVD_COORDINATION_VISIBILITY_PACK.md` | Esta documentação |
