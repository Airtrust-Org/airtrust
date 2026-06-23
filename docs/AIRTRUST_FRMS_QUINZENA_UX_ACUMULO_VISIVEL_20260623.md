# AIRTRUST FRMS QUINZENA UX ACUMULO VISIVEL

Data: 2026-06-23

Status atual: `IMPLEMENTADO LOCALMENTE — PR E DEPLOY PENDENTES`

## 1. Objetivo

Melhorar a visibilidade do acumulo de fadiga da quinzena no FRMS, expondo:

- resumo executivo na home `/frms`;
- bloco operacional claro em `/frms/controle-operacional`;
- manutencao do drilldown individual na Ficha do Tripulante.

## 2. Escopo respeitado

- Sem SIGVOOS/SegVoo.
- Sem alteracao em `worker-airtrust/src/lib/frms/frms-source-policy.ts`.
- Sem SQL.
- Sem migration ou schema.
- Sem recalibrar `calcEffectiveness`.
- Sem alterar `calcAcumuloRolling`.
- Sem mudar thresholds ou alertas regulatorios.
- Sem LMS, Funcionarios, Simuladores, Qualificacoes ou login/cache.
- Sem deploy de Worker nesta etapa.

## 3. Implementacao realizada

### Home `/frms`

- Novo bloco `Acúmulo de fadiga da quinzena`.
- Subtitulo operacional com ressalva de apoio a coordenacao.
- Cards com:
  - quinzena atual;
  - tripulantes monitorados;
  - em atencao;
  - criticos;
  - tendencia geral;
  - maior acumulo de jornada;
  - maior acumulo de HV;
  - dados incompletos/estimados.
- Botao `Abrir controle operacional`.
- Lista curta `Tripulantes que exigem atenção na quinzena` com:
  - identificacao operacional;
  - score de triagem subjetiva;
  - efetividade estimada;
  - acumulado de jornada e HV;
  - motivo principal;
  - acao recomendada;
  - atalhos para Controle Operacional e Ficha.

### Controle Operacional `/frms/controle-operacional`

- Novo bloco `Acúmulo operacional da quinzena` antes da tabela.
- Texto explicito:
  - `O filtro mostra o recorte selecionado, mas o acúmulo considera a quinzena operacional disponível quando localizada.`
- Exibicao de:
  - periodo da quinzena;
  - status completa/incompleta;
  - tripulantes em atencao;
  - jornada acumulada visivel;
  - HV acumulada visivel;
  - dados incompletos/estimados.
- Acao `Ver evolução diária` para levar a leitura detalhada da tabela.
- Coluna `Efetividade estimada / quinzena` tornada mais explicita com:
  - `Efetividade estimada` — quanto maior, melhor;
  - `Indicador operacional da quinzena`;
  - jornada acumulada;
  - HV acumulada;
  - CTA `Ver evolução diária`.

### Drilldown individual

- A Ficha do Tripulante continua com o painel consolidado quinzenal.
- O detalhe expandido foi mantido, apenas alinhado para `Ver evolução diária`.

## 4. Arquivos alterados

- `src/react-app/pages/frms/FrmsDashboard.tsx`
- `src/react-app/pages/frms/FrmsControleOperacional.tsx`
- `src/react-app/pages/frms/components/FortnightOperationalIndicator.tsx`
- `src/react-app/pages/frms/fortnightOperationalSummary.ts`
- `src/react-app/pages/frms/__tests__/FrmsDashboard.test.tsx`
- `src/react-app/pages/frms/__tests__/FrmsControleOperacional.test.tsx`
- `src/react-app/pages/frms/__tests__/FortnightOperationalIndicator.test.tsx`
- `src/react-app/pages/frms/__tests__/fortnightOperationalSummary.test.ts`

## 5. Dados e contrato

- Foi reutilizado o snapshot operacional ja existente.
- Nenhum endpoint novo foi criado.
- Nenhum contrato backend foi alterado.
- A consolidacao da quinzena foi derivada no frontend por helper dedicado:
  - `src/react-app/pages/frms/fortnightOperationalSummary.ts`

## 6. Validacoes executadas

- Testes direcionados:
  - `npx vitest run src/react-app/pages/frms/__tests__/FortnightOperationalIndicator.test.tsx src/react-app/pages/frms/__tests__/FrmsControleOperacional.test.tsx src/react-app/pages/frms/__tests__/fortnightOperationalSummary.test.ts src/react-app/pages/frms/__tests__/FrmsDashboard.test.tsx`
- Resultado:
  - `4` arquivos de teste;
  - `44` testes passando.
- Lint:
  - `npm run lint`
  - `PASS`
- Build:
  - `npm run build`
  - `PASS`

## 7. Limitações honestas

- O resumo executivo da home depende do snapshot operacional do dia corrente e do recorte visivel de tripulantes.
- Nao houve deploy Pages nesta etapa.
- Nao houve smoke autenticado em ambiente publicado nesta etapa.
- Nao ha evidencia inventada de producao para esta entrega enquanto PR/CI/merge/deploy nao forem concluidos.

## 8. Decisao atual

`IMPLEMENTADO LOCALMENTE — PR E DEPLOY PENDENTES`
