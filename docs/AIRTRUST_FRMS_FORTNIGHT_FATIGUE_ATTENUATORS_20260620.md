# AirTrust FRMS - Fortnight Fatigue Attenuators

Data: 2026-06-20
Branch: `codex/frms-fortnight-fatigue-attenuators`
Base: `origin/main` em `a22223f5`

## Objetivo

Auditar e completar, sem migration e sem escrita remota, o payload de fadiga acumulada quinzenal do FRMS para uso operacional por gestor e tripulante.

O escopo desta macroetapa foi limitado a calculo derivado e exibicao via payload existente do `fortnight_indicator`, mantendo compatibilidade do snapshot operacional e sem alterar SIGVOOS, banco, migrations ou rotas de deploy.

## Diagnostico inicial

O AirTrust ja possuia um indicador quinzenal em `worker-airtrust/src/lib/frms/fortnight-indicator.ts`, anexado ao snapshot em `worker-airtrust/src/lib/frms/operational-snapshot.ts`.

O indicador existente ja calculava:

- periodo de inicio/fim da quinzena;
- dia N/M do periodo embarcado;
- duty time e horas de voo do periodo;
- duty time e horas de voo rolling 168h;
- dias consecutivos com jornada;
- check-in pendente no periodo;
- dados estimados no periodo;
- apresentacoes antes de 06:00 e 07:00;
- menor descanso entre jornadas;
- status quinzenal e alertas basicos.

Lacunas encontradas:

- nao havia `score_acumulado`;
- nao havia tendencia operacional;
- nao havia catalogo explicito de atenuadores e agravantes no payload;
- sono, KSS e efetividade nao eram repassados ao seed quinzenal;
- nao havia `freshness_dado`, explicacao operacional, decisao e mitigacao derivados no indicador quinzenal;
- `setores_periodo` e `sit_periods_estimados` seguiam sem calculo robusto e permanecem nulos com nota de limitacao.

## Calculo implementado

O calculo quinzenal foi enriquecido de forma aditiva em `FrmsFortnightIndicator`.

Novos campos:

- `freshness_dado`;
- `score_acumulado`;
- `tendencia`;
- `atenuadores_aplicados`;
- `agravantes_aplicados`;
- `natureza_dado`;
- `explicacao_operacional`;
- `mitigacao_recomendada`;
- `decisao`;
- `limite_referencia`.

O score e derivado de:

- maior percentual entre referencias tecnicas de `QUINZENA_DUTY`, `DUTY_168H` e `VOO_168H`;
- impacto positivo de agravantes;
- impacto negativo de atenuadores;
- ajuste pequeno por tendencia crescente ou reduzindo;
- clamp final entre 0 e 100.

As referencias tecnicas continuam sendo defaults operacionais conservadores em codigo. Elas nao sao gravadas no banco, nao substituem configuracao regulatoria por empresa e nao representam aprovacao ou homologacao externa.

## Projecao versus realizado

O indicador quinzenal preserva separacao semantica:

- `PROJECAO` quando a janela nao cobre a quinzena inteira;
- `CHECKIN_SUBJETIVO` quando ha check-in recebido sem jornada;
- `JORNADA_REALIZADA` quando a fonte da jornada e real;
- `JORNADA_PLANEJADA` para manual, estimada, ausente ou inconsistente;
- `ACUMULADO_LEGAL` reservado como natureza de contrato, sem misturar score subjetivo com evidencia regulatoria.

Projecao e check-in subjetivo nao elevam a decisao quinzenal acima de `ALERTA`.

## Atenuadores

Implementados:

- `DIAS_SEM_JORNADA_NO_PERIODO`;
- `REPOUSO_ENTRE_JORNADAS_MAIOR_13H`;
- `JORNADA_MEDIA_CURTA`;
- `SEM_APRESENTACAO_CEDO`;
- `DADOS_COMPLETOS_DO_PERIODO`.

Os atenuadores reduzem o score, mas nao removem alertas criticos. Se houver risco diario critico ou score critico, a classificacao permanece visivel no payload.

## Agravantes

Implementados:

- `SEQUENCIA_5_DIAS_OU_MAIS`;
- `SEQUENCIA_4_DIAS`;
- `CHECKIN_PENDENTE_NO_PERIODO`;
- `DADO_ESTIMADO_NO_PERIODO`;
- `APRESENTACAO_ANTES_0600`;
- `APRESENTACOES_CEDO_RECORRENTES`;
- `REPOUSO_ENTRE_JORNADAS_MENOR_10H`;
- `SONO_INSUFICIENTE_NO_PERIODO`;
- `KSS_ALTO_NO_PERIODO`;
- `EFETIVIDADE_BAIXA_NO_PERIODO`;
- `DUTY_168H_ELEVADO`;
- `RISCO_DIARIO_CRITICO_NO_PERIODO`;
- `RISCO_DIARIO_ATENCAO_NO_PERIODO`.

## Payload de exibicao

O payload fica disponivel em `item.fortnight_indicator` no snapshot operacional.

Telas que podem consumir sem nova rota:

- FRMS Controle Operacional;
- EVD, via deep link/badges FRMS ja existentes;
- Escala Mensal, se usar snapshot ou agregador FRMS;
- Minha Escala;
- Ficha 360;
- Dashboard/Home, caso use o mesmo agregador operacional.

Nao foi feito redesign visual nesta macroetapa. A entrega prepara payload claro para UI, com explicacao curta, fonte, freshness, decisao, mitigacao e modificadores.

## Testes

Novos cenarios cobertos:

- acumulado quinzenal cresce com jornadas consecutivas;
- score critico por acumulado e sequencia;
- dia sem missao reduz score como atenuador;
- descanso suficiente aplica atenuador;
- sono insuficiente e KSS alto agravam via snapshot/listagem;
- periodo parcial mantem `INCOMPLETO` e `ALERTA`;
- periodo ausente continua `INCOMPLETO`;
- snapshot segue compativel.

Validacoes executadas:

- `cd worker-airtrust && npx vitest run src/__tests__/frms/fortnight-indicator.test.ts src/__tests__/frms/operational-snapshot.test.ts`
  - Resultado: 2 arquivos, 13 testes, passou.
- `cd worker-airtrust && npx vitest run src/__tests__/frms`
  - Resultado: 25 arquivos, 283 testes, passou.
- `npx vitest run src/react-app/pages/escalas/__tests__/evdFrmsBadges.test.ts`
  - Resultado: 1 arquivo, 20 testes, passou.
- `npm run lint`
  - Resultado: passou.
- `npm run build`
  - Resultado: passou.
- `cd worker-airtrust && npx tsc --noEmit`
  - Resultado: falhou por erros preexistentes fora do escopo em `tenant-fail-closed.test.ts`, `escalas-core.ts` e `frms.ts`.

## Seguranca

- Migration: nao.
- Migration 0412: nao movida, nao aplicada.
- SQL remoto de escrita: nao.
- Banco manual: nao alterado.
- Nova tabela `frms_decisao_override`: nao criada.
- SIGVOOS: NO-GO; nenhuma integracao foi alterada.
- PII/secrets: nenhum dado real, email, CPF, token, cookie, senha ou secret exposto.
- Tenant/RBAC: o calculo continua consumindo o snapshot operacional ja escopado por `empresa_id`; testes FRMS e guards de lint passaram. Smoke autenticado/cross-tenant real segue pendente por falta de fixture.

## Riscos e limitacoes

- `setores_periodo` e `sit_periods_estimados` continuam nulos por falta de fonte robusta nesta macroetapa.
- O score e operacional/descritivo, nao diagnostico fisiologico e nao afirmacao regulatoria.
- A UI ainda precisa decidir a melhor hierarquia visual para gestor e tripulante.
- `worker-airtrust npx tsc --noEmit` segue bloqueado por erros fora do escopo; por isso o PR deve abrir como draft.
- Revisao Opus/Sonnet solicitada no prompt nao foi executada porque a sessao so permitiu um subagente e nao forneceu esses modelos explicitamente.

## Subagentes

Subagente A executado para revisao estatica do calculo quinzenal. Ele confirmou que o acumulado existia como indicador operacional, mas ainda sem camada fechada de atenuadores/agravantes, sem separacao quinzenal completa de realizado/projetado e com `setores_periodo`/`sit_periods_estimados` pendentes.

Subagentes B, C, D e E nao puderam ser abertos por limite de threads de subagente. As responsabilidades foram executadas diretamente nesta macroetapa e registradas neste relatorio.

## Proximas macroetapas

Recomendacao: revisao externa do PR por Opus/Sonnet ou equivalente antes de tirar o draft, seguida de uma macroetapa visual para FRMS Controle Operacional, EVD, Minha Escala e Ficha 360 consumirem explicitamente os novos campos.
