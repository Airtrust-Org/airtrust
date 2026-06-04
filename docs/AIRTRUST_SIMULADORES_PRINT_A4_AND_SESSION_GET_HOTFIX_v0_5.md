# AIRTRUST SIMULADORES PRINT A4 AND SESSION GET HOTFIX v0.5

## Escopo

- Hotfix runtime para `GET /api/simuladores/sessoes` sem migration.
- Validacao visual real de impressao com PDFs gerados localmente.
- Sem `migration/apply`.
- Sem `DQ/MIG`.
- Sem mutacao de banco.

## Bloqueio Anterior

O ambiente local falhava ao abrir a agenda de simuladores porque o backend quebrava em:

- rota: `GET /api/simuladores/sessoes`
- erro: `D1_ERROR: no such column: sa.tipo_dispositivo`

Impacto:

- a UI nao carregava sessoes;
- os PDFs gerados ficavam vazios;
- qualquer validacao de print sem corrigir o `GET` era falso positivo.

## Causa Raiz do GET

O `GET /api/simuladores/sessoes` em [worker-airtrust/src/routes/simuladores-sessoes.ts](/Users/filipedaumas/SAAS/Airtrust/worker-airtrust/src/routes/simuladores-sessoes.ts:273) assumia que o schema local sempre possuia:

- `simulador_agendamentos.tipo_dispositivo`
- `simulador_agendamentos.aeronave_id`

Em snapshots locais mais antigos essas colunas nao existem. O `POST` e o `PUT` ja tinham deteccao de schema via `PRAGMA table_info(...)`, mas o `GET` nao.

## Correcao Runtime sem Migration

Foi adicionado um helper de deteccao de schema runtime no proprio route:

- se `tipo_dispositivo` existe:
  - o `SELECT` usa `COALESCE(sa.tipo_dispositivo, 'SIMULADOR')`
  - o filtro `tipo_dispositivo` continua ativo;
- se nao existe:
  - o `SELECT` expõe `NULL as tipo_dispositivo`
  - o filtro por `tipo_dispositivo` nao e aplicado;
- se `aeronave_id` nao existe:
  - o `SELECT` expõe `NULL as aeronave_id`, `NULL as aeronave_prefixo`, `NULL as aeronave_modelo`
  - o join em `aeronaves` nao e montado.

Resultado:

- o `GET` volta a funcionar em schema antigo e novo;
- staging/producao nao sofrem regressao porque continuam usando o caminho com colunas presentes;
- nenhuma migration foi executada.

## Periodo de Validacao de Print

Tentativa obrigatoria inicial:

- `2026-06-01` a `2026-06-30`

Resultado no snapshot local ativo:

- `0` sessoes em junho/2026

Como a instrucao exigia nao tocar banco, foi feita busca read-only do melhor periodo alternativo no snapshot local ativo. O periodo com maior volume encontrado foi:

- mes alternativo: `2026-02`
- intervalo com mais sessoes carregadas: `2026-02-28` a `2026-03-01`
- total de sessoes nesse intervalo: `3`

Distribuicao:

- `2026-02-28`: `2` sessoes
- `2026-03-01`: `1` sessao

## Confirmacao de Dados Reais Carregados

Depois da correcao do `GET`, a API local retornou dados reais:

- `GET /api/simuladores/sessoes?data_inicio=2026-02-01&data_fim=2026-02-28` -> `2` sessoes
- `GET /api/simuladores/sessoes?data_inicio=2026-02-22&data_fim=2026-03-01` -> `3` sessoes

Exemplo confirmado:

- simulador: `Simulador SK76`
- instrutor: `Wilson Maciel Martins Nery`
- temas:
  - `SK76 - PERIODICO - 01/03: SESSAO VFR - CICLO 2`
  - `SK76 - PERIODICO - 02/03: SESSAO IFR - CICLO 2`
  - `SK76 - PERIODICO - 03/03: LOFT E CHECK`

## Causa Raiz do Print

Nao foi reproduzido defeito novo de layout no codigo atual depois que as sessoes reais passaram a carregar.

Diagnostico final:

- a falha operacional desta rodada nao era mais o CSS de print;
- era o backend impedindo o carregamento de dados;
- a base de impressao atual ja esta isolada via HTML proprio em `iframe`, sem shell da aplicacao;
- com dados reais, os formatos geraram PDFs limpos, com fundo branco e sem overlay da UI.

## Estrategia de Isolamento Validada

Os builders em [monthlyAgendaPrint.ts](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/simuladores/agenda/monthlyAgendaPrint.ts:1) ja operam como documento isolado:

- HTML proprio;
- `@page` por formato;
- `body` com fundo branco;
- sem navbar/sidebar/calendario da UI de tela;
- sem backdrop/modal/overlay;
- sem heranca visual do app shell.

## Formatos Cobertos

- mensal lista
- mensal calendario
- semanal
- diario
- agenda/lista

## PDFs Reais Gerados

### Before

- [before-fixed-api-monthly-list-2026-02.pdf](/Users/filipedaumas/SAAS/Airtrust/artifacts/print-validation/before-fixed-api-monthly-list-2026-02.pdf)
- [before-fixed-api-monthly-calendar-2026-02.pdf](/Users/filipedaumas/SAAS/Airtrust/artifacts/print-validation/before-fixed-api-monthly-calendar-2026-02.pdf)
- [before-fixed-api-weekly-2026-02-22.pdf](/Users/filipedaumas/SAAS/Airtrust/artifacts/print-validation/before-fixed-api-weekly-2026-02-22.pdf)
- [before-fixed-api-daily-2026-02-28.pdf](/Users/filipedaumas/SAAS/Airtrust/artifacts/print-validation/before-fixed-api-daily-2026-02-28.pdf)
- [before-fixed-api-agenda-2026-02.pdf](/Users/filipedaumas/SAAS/Airtrust/artifacts/print-validation/before-fixed-api-agenda-2026-02.pdf)

### After

- [after-monthly-list-2026-02.pdf](/Users/filipedaumas/SAAS/Airtrust/artifacts/print-validation/after-monthly-list-2026-02.pdf)
- [after-monthly-calendar-2026-02.pdf](/Users/filipedaumas/SAAS/Airtrust/artifacts/print-validation/after-monthly-calendar-2026-02.pdf)
- [after-weekly-2026-02-22.pdf](/Users/filipedaumas/SAAS/Airtrust/artifacts/print-validation/after-weekly-2026-02-22.pdf)
- [after-daily-2026-02-28.pdf](/Users/filipedaumas/SAAS/Airtrust/artifacts/print-validation/after-daily-2026-02-28.pdf)
- [after-agenda-2026-02.pdf](/Users/filipedaumas/SAAS/Airtrust/artifacts/print-validation/after-agenda-2026-02.pdf)

Observacao:

- os artifacts ficaram locais e nao devem ser versionados em massa.

## Resultado Visual por Formato

### Mensal lista

- contem `2` sessoes reais;
- sem shell do app;
- sem fundo preto;
- sem calendario de tela ao fundo;
- sem pagina vazia antes do conteudo.

### Mensal calendario

- contem `2` sessoes reais no dia `28/02/2026`;
- grade mensal permanece legivel;
- sem overflow horizontal destrutivo;
- sem UI de tela misturada ao documento.

### Semanal

- contem `2` sessoes reais na semana `22/02/2026` a `28/02/2026`;
- layout A4 paisagem ficou limpo;
- sem cortes grosseiros.

### Diario

- contem `2` sessoes reais no dia `28/02/2026`;
- tabela ficou legivel e compacta;
- sem elementos de app shell.

### Agenda/lista

- contem `3` sessoes reais em `2` dias;
- exame/check aparece na linha correta;
- sem fundo de tela, navbar ou sidebar.

## Testes e Guards

### API

Criado:

- [simuladores-sessoes-schema-compat.test.ts](/Users/filipedaumas/SAAS/Airtrust/worker-airtrust/src/__tests__/routes/simuladores-sessoes-schema-compat.test.ts:1)

Cobertura:

- schema antigo sem `tipo_dispositivo` e sem `aeronave_id`
- schema novo com colunas opcionais presentes
- payload compativel em ambos os casos

### Print

Ajustado:

- [monthlyAgendaPrint.test.ts](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/simuladores/agenda/__tests__/monthlyAgendaPrint.test.ts:1)

Cobertura:

- `@page A4` por formato
- tabela/grid compactos
- ausencia de shell da aplicacao no HTML impresso
- fundo branco do documento
- ausencia de marcadores claros de backdrop/app shell

## Validacoes Tecnicas

Executadas nesta rodada:

- `cd worker-airtrust && npx vitest run src/__tests__/routes/simuladores-sessoes-schema-compat.test.ts src/__tests__/routes/simuladores-sessoes-pagination.test.ts`
- `cd worker-airtrust && npx tsc --noEmit --pretty false`
- geracao real de PDFs com Playwright local e inspeção visual dos PNGs renderizados

Pendentes para fechamento total:

- `npm run ops:guard`
- `npm run preflight` se existir
- `npm run test:worker`
- `npm run build`
- `git diff --check`

## Confirmacoes de Restricao

- migration/apply: nao
- DQ/MIG: nao
- mutacao de banco: nao

