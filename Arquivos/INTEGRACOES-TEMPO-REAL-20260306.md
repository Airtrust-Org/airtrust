# Integracoes em Tempo Real Escalas x Dominios

Data: 2026-03-06

## Escopo entregue

- Bus interno de eventos persistido em D1 com `domain_events`
- Processamento lazy de eventos nas requests de Escalas
- View `vw_tripulante_operacional` como fonte unica do estado operacional
- Endpoints novos em Escalas para `tripulantes-operacionais` e `/:id/alertas`
- Publicacao de eventos backend em Funcionarios, Qualificacoes, FRMS e Simuladores
- Invalidador frontend via `BroadcastChannel` e evento local de janela
- Painel lateral de Escalas trocado para a leitura operacional consolidada
- Smoke test dedicado em `scripts/smoke-test-integracoes.sh`

## Adaptacoes ao schema real

O prompt original citava entidades conceituais que nao existem com esses nomes no repositorio. A implementacao foi ajustada para o schema efetivo:

- CMA e historico: `qualificacoes_historico` + `qualificacoes_tipos`
- FRMS: `frms_jornada` + `frms_alerta`
- Simuladores: `simulador_agendamentos` + `sessoes_participantes`
- Compatibilidade por modelo: `funcionarios.modelo_aeronave_id`, legado `aeronave` e `modelos_aeronave`

## Backend

- Migration `0240_domain_events.sql`: tabela e indices do bus de dominio
- Migration `0241_vw_tripulante_operacional.sql`: view operacional consolidada
- Migration `0242_escala_alertas.sql`: persistencia de alertas em Escalas
- Helper `worker-airtrust/src/shared/getTripulanteOperacional.ts`: leitura unica do estado operacional
- Helper `worker-airtrust/src/shared/domainEvents.ts`: publicar e processar eventos
- Middleware `worker-airtrust/src/middleware/processarEventos.ts`: reprocessamento lazy
- Route `worker-airtrust/src/routes/escalas-tripulantes-operacionais.ts`: leitura operacional por aeronave e por tripulante
- `worker-airtrust/src/routes/escalas-core.ts`: rota principal de Escalas agora exposta e com alias legado
- `worker-airtrust/src/index.ts`: monta `escalas-core` e expande inspecao admin de eventos

## Frontend

- `src/react-app/lib/moduloBus.ts`: canal cross-tab e evento local
- `src/react-app/lib/useEventosModulo.ts`: hook de escuta reutilizavel
- `src/react-app/pages/escalas/hooks/queries/useEscalasQuery.ts`: nova query operacional mantendo compatibilidade do modal legado
- `src/react-app/pages/escalas/components/Paineis/PainelDisponibilidade.tsx`: agora mostra prontidao operacional com aptos, atencao e bloqueados
- `src/react-app/pages/escalas/EscalasPage.tsx`: invalida queries de Escalas ao receber eventos de outros modulos
- Emissores frontend adicionados em Qualificacoes, FRMS e Simuladores apos sucesso nas mutacoes relevantes

## Validacao executada

- Diagnostico estatico sem erros nos arquivos backend novos e alterados
- Diagnostico estatico sem erros nos arquivos frontend alterados
- `npm run build`: sucesso
- `scripts/smoke-test-integracoes.sh`: sucesso nos checks publicos
  - Pages respondeu com `build-version=5f4d419a`
  - Worker respondeu `/api/health` com `version=5f4d419a`
  - Checks autenticados ficaram condicionais a `AUTH_TOKEN`, `AERONAVE_ID`, `ESCALA_ID` e `FUNCIONARIO_ID`

## Observacoes operacionais

- O painel lateral depende de contexto de aeronave. Quando a escala carregada nao expõe uma aeronave clara, o painel informa a ausencia de contexto em vez de usar snapshot errado.
- O endpoint legado `/api/escalas/pilotos-disponiveis` continua funcional como alias para o novo contrato operacional, evitando quebra imediata no modal de tripulacao.
- O bus de frontend nao substitui o D1 `domain_events`; ele cobre invalidacao imediata entre abas e modulos no browser.
