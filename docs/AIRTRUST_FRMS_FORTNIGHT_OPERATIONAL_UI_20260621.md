# FRMS Fortnight Operational UI — 2026-06-21

## Objetivo

Exibir na camada visual/operacional os campos de fadiga acumulada quinzenal publicados pelo FRMS (PR #111, merge `06370e69`), transformando o payload existente em informação operacional clara para gestor, tripulante e coordenação — sem backend novo, migration ou SIGVOOS.

## Telas alteradas

| Tela | Alteração |
|------|-----------|
| **FRMS Controle Operacional** | Painel quinzenal enriquecido via componentes compartilhados: score, tendência, atenuadores/agravantes, explicação, mitigação, decisão, natureza/freshness |
| **EVD / Escala Diária** | Tooltip do badge FRMS enriquecido com resumo quinzenal quando `fortnight_indicator` está no operational-snapshot do dia |
| **Minha Escala** | Card resumido de fadiga da quinzena para o tripulante (self scope) |
| **Ficha 360 (aba Resumo)** | Painel consolidado quinzenal para gestor/admin |
| **FRMS Ficha Tripulante** | Painel consolidado quinzenal na ficha individual |
| **Dashboard/Home gestor** | Sem alteração — agregador quinzenal exigiria backend novo; documentado como pendência |

## Campos consumidos (`item.fortnight_indicator`)

- `score_acumulado`
- `tendencia`
- `atenuadores_aplicados` / `agravantes_aplicados`
- `natureza_dado`
- `explicacao_operacional`
- `mitigacao_recomendada`
- `decisao`
- `limite_referencia`
- `freshness_dado`
- período/dia da quinzena (`periodo_inicio`, `periodo_fim`, `dia_periodo`, `total_dias_periodo`)
- `status_quinzena`

## Comportamento com dados

- Score, tendência, principais atenuadores/agravantes, explicação curta e mitigação sugerida são exibidos de forma defensiva.
- Rótulos de natureza: Projeção, Check-in subjetivo, Jornada realizada, Acumulado legal (sem prometer homologação).
- Freshness exibido discretamente (completo/parcial/estimado/ausente).
- Limite de referência, quando presente, rotulado como indicador operacional — não avaliação regulatória.
- EVD: tooltip combina sinal diário + resumo quinzenal; link continua para Controle Operacional.

## Comportamento sem dados

- Fallback: **"Sem indicador quinzenal disponível para o período."**
- Telas não quebram quando `fortnight_indicator` é `null` ou `fonte_periodo === 'AUSENTE'`.
- Minha Escala e Ficha 360 mostram orientação genérica ou mensagem de ausência.

## Textos e rótulos obrigatórios

- **Indicador operacional estimado**
- **Não substitui avaliação operacional do gestor**
- **Projeção** (`natureza_dado = PROJECAO`)
- **Check-in subjetivo** (`CHECKIN_SUBJETIVO`)
- **Jornada realizada** (`JORNADA_REALIZADA`)
- **Acumulado legal** (`ACUMULADO_LEGAL`) — sem linguagem de homologação/aprovação ANAC

## Arquivos principais

- `src/react-app/pages/frms/fortnightOperationalLabels.ts` — formatadores e rótulos
- `src/react-app/pages/frms/components/FortnightOperationalIndicator.tsx` — componentes reutilizáveis
- `src/react-app/pages/escalas/evdFrmsTooltip.ts` — tooltip EVD
- `src/react-app/hooks/useFrmsOperationalSnapshot.ts` — tipos estendidos

## Testes

```bash
npm run test:run -- src/react-app/pages/escalas/__tests__/evdFrmsBadges.test.ts
npm run test:run -- --run frms
npm run lint
npm run build
```

Resultado (2026-06-21): 68 testes diretos + 189 testes FRMS passando; lint e build OK.

Novos testes:
- `fortnightOperationalLabels.test.ts`
- `FortnightOperationalIndicator.test.tsx`
- Extensões em `evdFrmsBadges.test.ts` e `FrmsControleOperacional.test.tsx`

## Riscos

- **Central de Alertas do gestor**: agregador quinzenal no dashboard exigiria endpoint/resumo backend — não implementado nesta etapa.
- **Override visual completo**: fora de escopo.
- **Validação autenticada/cross-tenant**: UI consome API existente; validação E2E autenticada permanece pendente.
- **EVD**: fetch adicional de operational-snapshot por dia (mesma API, sem contrato novo).

## Pendências

1. Central de Alertas do Gestor (macroetapa futura, backend agregador).
2. Override visual operacional completo.
3. Validação autenticada multi-tenant com fixtures reais.
4. Parametrização futura de limites quinzenais na UI.

## Restrições respeitadas

- Migration: **não**
- SQL remoto: **não**
- Backend estrutural novo: **não**
- SIGVOOS: **NO-GO** (não tocado)
- RBAC/tenant/auth global: **não alterado**
- Deploy produção: **não executado**
- PII/secrets: **não expostos**

## SIGVOOS

Permanece **NO-GO**. Mitigação `AGUARDAR_SIGVOOS` é apenas rótulo operacional do payload — sem integração.

## Próxima macroetapa sugerida

Revisão/merge/deploy deste PR visual, seguido de Central de Alertas do Gestor ou validação autenticada cross-tenant.
