# FRMS — Recuperação + REDEMET + carga de pousos — V1

Data: 2026-08-28

## Objetivo
Evoluir o FRMS para representar a dinâmica real de carga e recuperação sem presumir que `0 h de voo = folga` e sem criar bônus arbitrário de effectiveness.

## Fontes canônicas

### SIGVOOS
É a fonte canônica de atividade operacional objetiva de voo:
- horas de voo;
- etapas/setores;
- horários de decolagem e pouso;
- aeródromo/localidade de origem e destino;
- pousos diurnos;
- pousos noturnos;
- identificação física da etapa (`flightReportId + legNumber`).

A quantidade de pousos da etapa é `pousos_diurnos + pousos_noturnos`. A deduplicação deve ocorrer pela identidade física da etapa, nunca por linha de tripulante.

### REDEMET / DECEA
É a fonte meteorológica aeronáutica oficial para observação histórica em aeródromos configurados.

Para exposição retrospectiva usar prioritariamente:
1. METAR;
2. SPECI quando disponível/compatível;
3. TAF apenas como contexto de planejamento, nunca como substituto de observação ocorrida.

O TAF é previsão; portanto não deve ser usado como temperatura efetivamente experimentada numa jornada passada.

## Associação voo ↔ meteorologia
Para cada etapa física do SIGVOOS:
1. resolver origem/destino no `frms_location_catalog`;
2. obter a estação REDEMET explicitamente configurada;
3. converter horário local de decolagem/pouso para UTC usando o timezone da própria localidade;
4. consultar METAR histórico em janela batched;
5. selecionar a observação mais recente no ou antes do evento (`LATEST_AT_OR_BEFORE`);
6. aplicar `maxAgeMinutes = 120` como limite de compatibilidade;
7. persistir/propagar qualidade, estação, horário observado e idade da observação;
8. nunca mascarar ausência como temperatura normal.

Para helidecks/plataformas sem fonte medida configurada, o dado ambiental permanece `UNAVAILABLE`. Não usar METAR de aeródromo não relacionado como proxy silencioso.

## Variáveis ambientais
Extrair do METAR/SPECI, quando disponíveis:
- temperatura do ar;
- ponto de orvalho;
- umidade relativa derivada;
- vento;
- timestamp e estação da observação.

Derivar somente índices cuja entrada seja adequada e marcar claramente `MEASURED`, `DERIVED`, `ESTIMATED` ou `UNAVAILABLE`. METAR não é WBGT medido.

## Carga operacional
A carga diária deve preservar separadamente:
- horas de voo;
- número de setores;
- pousos totais;
- pousos diurnos/noturnos;
- densidade de pousos;
- trechos curtos;
- shuttle offshore;
- blocos contínuos e pausas verificadas;
- carga ambiental.

Esses sinais não devem ser confundidos com limite regulatório. São fatores graduados de risco/observabilidade.

## Dias sem voo: coleta mínima
Quando o SIGVOOS confirmar ausência de horas/etapas no dia anterior, o próximo check-in deve exibir um bloco curto:

`Não encontramos voo registrado ontem. Como foi sua condição operacional?`

Opções:
- `Folga / descanso` → `OFF_DUTY`;
- `Standby em hotel/residência` → `STANDBY_HOME_HOTEL`;
- `Standby presencial na base/aeroporto` → `STANDBY_ONSITE`;
- `Administrativo / treinamento` → `ADMIN_TRAINING`;
- `Deslocamento a serviço / viagem` → `DUTY_TRAVEL`;
- `Mais de uma situação` → `MIXED` com até 3 segmentos;
- `Outro` → `OTHER`;
- não respondido → `UNKNOWN`.

Se standby, perguntar somente:
- local (`HOME`, `HOTEL`, `BASE_AIRPORT`, `OTHER`);
- se havia acionamento imediato.

Se atividade de trabalho/deslocamento, coletar início/fim aproximados. O objetivo não é folha de ponto, mas qualificar oportunidade de recuperação.

## Regra de ausência
`0 h de voo` nunca implica automaticamente descanso.

Sem resposta do tripulante:
- atividade = `UNKNOWN`;
- recuperação = `UNKNOWN`;
- confiança do cálculo reduzida;
- não conceder bônus e não presumir trabalho.

## Modelo de recuperação V1
A implementação inicial é de evidência, não de crédito numérico.

Estados:
- `UNKNOWN` — atividade ou sono insuficientemente conhecidos;
- `LIMITED` — oportunidade de recuperação restrita ou sono abaixo da meta operacional;
- `PARTIAL` — uma oportunidade real de recuperação com sono adequado;
- `STRONG` — duas ou mais noites qualificantes consecutivas;
- `CONFIRMED` — recuperação forte acompanhada de readiness/PVT preservada em relação ao baseline individual.

Um estado de readiness `attention` ou `operational_review` impede classificar como recuperação confirmada, mesmo após duas noites.

### Trava metodológica
V1 não altera numericamente o effectiveness. `effectiveness_delta_pct` deve permanecer NULL. O futuro coeficiente de recuperação deve ser calibrado com dados longitudinais da própria operação:
- atividade do dia;
- sono 24/48 h;
- KSS;
- PVT/readiness individual;
- carga de voo;
- setores/pousos;
- jornada;
- ambiente.

Somente após calibração e revisão metodológica uma versão governada do modelo poderá atenuar Processo S/carga acumulada.

## Comportamento esperado da curva
O sistema não deve impor queda monotônica apenas pelo número do dia da quinzena. A trajetória futura deverá permitir serrilhado fisiológico: carga eleva fadiga; recuperação real reduz carga acumulada; sono ruim pode impedir recuperação mesmo sem voo.

Processo C/circadiano não recebe crédito simples de folga. A recuperação atua principalmente sobre componente homeostático/acúmulo, enquanto horário circadiano continua sendo avaliado pelo horário real.

## Implementação já existente/reutilizada
O repositório já contém:
- `redemet-weather.ts` para API REDEMET/METAR;
- `frms-iogp-shadow-pipeline.ts` para batching de meteorologia;
- `operational-demand-adapter.ts` para pousos/setores do SIGVOOS;
- `environmental-risk.ts` para avaliação ambiental;
- `frms_readiness_assessment` para PVT/readiness individual.

Não duplicar esses componentes.

## Correção identificada em 2026-08-28
O pipeline meteorológico usava somente `tenantOperationalTimezoneIana` ao converter os horários dos eventos. O caller atual fornece `null` porque o timezone deveria ser resolvido por localidade. Isso podia impedir a consulta/seleção do METAR mesmo com timezone válido no `frms_location_catalog`.

A correção é usar `departureResolved.timezoneIana` para decolagem e `arrivalResolved.timezoneIana` para pouso, deixando o timezone do tenant apenas como fallback explícito do catálogo.

## Critérios de aceite runtime
1. Dia com voo: nenhum formulário extra de atividade.
2. Dia sem voo confirmado pelo SIGVOOS: bloco de atividade aparece no próximo check-in.
3. Sem resposta: UNKNOWN, sem crédito de recuperação.
4. Pousos/setores vêm automaticamente do SIGVOOS e são deduplicados por etapa física.
5. Temperatura vem automaticamente do METAR/SPECI histórico da REDEMET, associada ao aeródromo e horário real.
6. TAF não altera retrospectivamente a exposição observada.
7. Estação/timezone/idade/qualidade da observação ficam auditáveis.
8. Duas noites qualificantes podem produzir STRONG; CONFIRMED exige readiness preservada quando baseline estiver disponível.
9. V1 nunca altera o effectiveness canônico.
10. Promoção para score numérico exige revisão/model_version separada e governada.
