# AIRTRUST FRMS FADIGA QUINZENAL OPERACIONAL

Data: 2026-06-23

Status: `PR ISOLADO PRONTO PARA CI REMOTA`

## 1. O que foi implementado

- Timeline operacional diária da quinzena em `src/react-app/pages/frms/fortnightOperationalTimeline.ts`.
- Exibição da evolução diária no detalhe do Controle Operacional FRMS.
- Exibição da evolução diária na Ficha do Tripulante.
- Leitura do período completo da quinzena na Ficha do Tripulante quando o período base é localizado.
- Distinção explícita na UI entre:
  - score subjetivo do check-in;
  - efetividade estimada;
  - indicador operacional da quinzena.
- Aviso operacional claro quando a fonte do período está incompleta.
- Fallbacks honestos para contexto embarcado, setores e `sit_periods_estimados` quando esses campos não estão confirmados.

## 2. O que não foi alterado

- Sem SIGVOOS/SegVoo.
- Sem alteração em `worker-airtrust/src/lib/frms/frms-source-policy.ts`.
- Sem SQL.
- Sem migration ou schema.
- Sem regra regulatória nova.
- Sem recalibrar `calcEffectiveness`.
- Sem alterar `calcAcumuloRolling`.
- Sem mudança de thresholds.
- Sem mudança de alertas regulatórios.
- Sem mudança de contrato backend.
- Sem integração com Central nesta fase.
- Sem alteração de EVD além do que já existia.

## 3. Como o cálculo atual funciona

- O snapshot operacional continua sendo a fonte da timeline e do indicador.
- O `score_fadiga` continua vindo do check-in subjetivo, baseado em KSS, sono, qualidade do sono, sintomas e fatores reportados.
- O `effectiveness_pct` continua sendo um proxy operacional/fisiológico derivado de jornada, repouso, sono, circadiano e ciclo.
- O indicador quinzenal continua descritivo e operacional. Ele usa o cálculo já existente para sintetizar tendência, mitigação, agravantes, atenuadores e contexto do período.
- Nenhuma fórmula regulatória foi alterada nesta macro.

## 4. Como a UI exibe a quinzena

- O Controle Operacional mostra:
  - score de triagem subjetiva;
  - efetividade estimada;
  - status do dia;
  - detalhe expandido da quinzena com timeline diária.
- A Ficha do Tripulante mostra:
  - indicador operacional da quinzena;
  - período e contexto embarcado;
  - timeline diária com foco no dia consultado;
  - explicação, tendência e ação recomendada quando aplicável.
- Quando a quinzena está incompleta, a UI mostra:
  - `Período incompleto`;
  - `A leitura considera apenas os dias disponíveis`;
  - `Não usar isoladamente como decisão final`.
- Quando há lacuna no snapshot, a timeline não vende zero como dado confirmado; ela mostra fallback explícito.

## 5. Diferença entre score de fadiga e efetividade estimada

- `Score de triagem subjetiva`:
  - baseado em check-in, KSS, sono, qualidade do sono, sintomas e fatores reportados;
  - quanto maior, pior.
- `Efetividade estimada`:
  - proxy operacional/fisiológico derivado de jornada, repouso, sono, circadiano e ciclo;
  - quanto maior, melhor.

## 6. Limitações mantidas

- Central continua pendente.
- EVD continua pendente para embutir `frms_resumo`.
- `setores_periodo` pode continuar `null`.
- `sit_periods_estimados` pode continuar `null`.
- A leitura pode ficar incompleta quando a janela consultada não cobre a quinzena inteira.
- O indicador continua sendo apoio operacional, não diagnóstico fisiológico e não decisão regulatória final.

## 7. Testes executados

- `npx vitest run src/react-app/pages/frms/__tests__/FortnightOperationalIndicator.test.tsx src/react-app/pages/frms/__tests__/FrmsControleOperacional.test.tsx src/react-app/pages/frms/__tests__/fortnightOperationalTimeline.test.ts src/react-app/hooks/__tests__/useFrmsOperationalSnapshot.test.ts`
- `cd worker-airtrust && npx vitest run src/__tests__/routes/frms-operational-snapshot.test.ts`
- `npm run lint`
- `npm run build`

## 8. Decisão final

`FRMS QUINZENAL OPERACIONAL EM PR ISOLADO — AGUARDANDO CI REMOTA`
