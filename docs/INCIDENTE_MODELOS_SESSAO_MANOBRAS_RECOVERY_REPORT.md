# INCIDENTE_MODELOS_SESSAO_MANOBRAS_RECOVERY_REPORT

Status atual:

`FULL RESTORE OPERACIONAL CONCLUIDO PARA EMPRESA 6`

Status do full restore:

`CONCLUIDO — A139-P-C1/IFR RESOLVIDO POR INFERENCIA OPERACIONAL CONFIRMADA`

## Escopo executado

Restore controlado somente para a empresa `6`, com insercao exclusiva em `modelos_sessao_manobras`.

Foi executado:

- ajuste do source-map para full restore;
- inclusao de `51` modelos restauraveis;
- resolucao do modelo `A139-P-C1/IFR`;
- builder;
- dry-run;
- restore `--dry-run`;
- snapshot novo imediatamente antes do apply;
- apply incremental em producao;
- correcao de fichas pendentes sem manobras;
- bloqueio de avaliacao futura no frontend e backend;
- validacao read-only pos-apply.

Nao houve:

- `DELETE`;
- `TRUNCATE`;
- migration;
- alteracao em `modelos_sessao`;
- alteracao em `manobras`;
- alteracao em fichas assinadas/concluidas;
- alteracao em SIGVOOS;
- alteracao em FRMS;
- alteracao em `frms-source-policy.ts`;
- qualquer escrita para empresa `8`.

## Source-map final

Estado publicado pelo builder:

- `ready_for_partial_restore = true`
- `ready_for_full_restore = true`
- `blocked_models = []`
- `allowlist_models = 51`
- `relation_rows = 1122`
- `candidate_relation_rows = 1122`
- `coverage_status = READY_FOR_FULL_RESTORE`

Inferencia operacional registrada:

- `operational_inference_confirmed_2026-06-16:A139-P-C1/IFR:ordem_10:derived_from_similar_A139_IFR_cycle`

## Historico do apply parcial anterior

## Snapshot pre-apply

Snapshot novo criado imediatamente antes do apply parcial:

- snapshot SQL preservado fora do commit
- tamanho: `113388949` bytes
- timestamp: `2026-06-16T17:41:08-0300`

Snapshot anterior do abort inseguro foi preservado e nao reutilizado.

## Apply parcial

Comando aplicado:

- `node scripts/operations/restore-modelos-sessao-manobras-empresa6.mjs --apply --snapshot-path <snapshot> --i-understand-production-write`

Resultado remoto:

- `success: true`
- `changes: 1100`
- `changed_db: true`
- `rows_written: 6601`
- alvo unico: `modelos_sessao_manobras`

## Validacao pos-apply

Resultados confirmados por consultas read-only em producao:

- total de relacoes ativas em `modelos_sessao_manobras`: `1100`
- modelos da allowlist com contagem diferente de `22`: `0`
- modelos fora de allowlist e fora do bloqueado com relacoes restauradas: `0`
- `A139-I-11/12` total de relacoes: `22`
- `A139-I-11/12` distribuicao de `tripulante`: `AB = 22`
- `A139-P-C1/IFR` total de relacoes restauradas: `0`
- empresa `8` total de relacoes restauradas: `0`
- fichas `ASSINADO`/`CONCLUIDO` sem manobras: `0`

Conclusao da validacao:

- partial restore: valido
- full restore: segue bloqueado

## A139-I-11/12

O modelo `A139-I-11/12` foi restaurado com `22` relacoes e `22` classificacoes `AB`.

Fonte operacional registrada:

- `responsavel_operacional_confirmado_2026-06-16:A139-I-11/12:AB`

## Resolucao operacional: A139-P-C1/IFR

O modelo `A139-P-C1/IFR` foi completado com `22` relacoes.

Manobra escolhida para a ordem `10`:

- codigo: `CAU-DCB-56`
- descricao: `DC bus failure`
- classificacao: `AB`
- fonte registrada: `operational_inference_confirmed_2026-06-16:A139-P-C1/IFR:ordem_10:derived_from_similar_A139_IFR_cycle`

Fonte analoga usada:

- `A139-P-C2/IFR`
- alias visual PTO: `A139-P-IFR/C2`
- PTO Rev.10 pagina `111`
- mesma familia operacional: AW139 periodico IFR
- mesma posicao de ciclo: ordem `10`

- PTO Rev.10 pagina `109`: somente `21` linhas visiveis
- ordens visiveis: `01..09` e `11..22`
- referencia visual: `tmp/pdfs/pto_rev10_p109-109.png`
- dump historico `modelo_id=29`: `21` relacoes nas mesmas ordens

Fonte primaria rejeitada para a ordem `10`:

- `worker-airtrust/migrations/0180_implement_periodico_aw139.sql`
- repete `CAU-AHR-47` nas ordens `6` e `10`
- gera conflito real de unicidade `modelo_id + manobra_id`

Decisao aplicada:

- `CAU-AHR-47` duplicado foi rejeitado;
- `CAU-DCB-56` foi aceito por existir no catalogo da empresa `6`, aparecer em ficha similar IFR AW139, nao duplicar manobra, nao duplicar ordem e possuir classificacao `AB`;
- `A139-P-C1/IFR` entrou no source-map resolvido;
- `ready_for_full_restore=true`.

## Apply full restore incremental

Snapshot novo criado antes do apply do modelo e preservado fora do commit.

Comando aplicado:

- `node scripts/operations/restore-modelos-sessao-manobras-empresa6.mjs --apply --snapshot-path <snapshot> --i-understand-production-write`

Resultado:

- tabela alterada: `modelos_sessao_manobras`
- relacoes inseridas: `22`
- `A139-P-C1/IFR`: `22` relacoes
- ordem `10`: `CAU-DCB-56`
- duplicidade de ordem em `A139-P-C1/IFR`: `0`
- duplicidade de manobra em `A139-P-C1/IFR`: `0`
- `CAU-AHR-47` em `A139-P-C1/IFR`: `1`
- total final `modelos_sessao_manobras`: `1122`
- modelos empresa `6` com `22` relacoes: `51`
- empresa `8`: `0` relacoes

## Fichas pendentes sem manobras

Relatorio read-only antes do apply:

- fichas pendentes encontradas: `18`
- status: todas `AVALIACAO_PENDENTE`
- escopo: empresa `6`
- fichas com assinatura de aluno/instrutor: `0`
- fichas finais/assinadas/concluidas no alvo: `0`
- modelos de origem: todos com `22` relacoes

Fichas corrigidas:

- `217`, `193`, `194`, `213`, `214`, `215`, `216`, `195`, `196`, `197`, `198`, `199`, `200`, `201`, `202`, `203`, `204`, `205`

Snapshot novo criado antes do apply das fichas e preservado fora do commit.

Apply:

- tabela alterada: `fichas_sessao_manobras`
- inserts aplicados: `396`
- regra: `18` fichas x `22` manobras, copiadas do modelo respectivo
- `resultado`: `NULL`
- `observacoes`: vazia
- `tripulante`: copiado de `modelos_sessao_manobras`

Validacao pos-apply:

- fichas corrigidas com `22` manobras: `18`
- fichas corrigidas com `22` classificacoes `A/B/AB`: `18`
- fichas pendentes restauraveis ainda sem manobras: `0`
- empresa `8` com manobras de ficha: `0`
- fichas `ASSINADO`/`CONCLUIDO` sem manobras: `0`
- fichas finais/assinadas tocadas na janela do apply: `0`

## Bloqueio de avaliacao futura

Regra implementada:

- timezone operacional: `America/Sao_Paulo`
- fonte de data/hora: `simulador_agendamentos.data` + `simulador_agendamentos.hora_inicio`, com fallback para `fichas_sessao.data_sessao`
- quando nao houver hora confiavel, a ficha fica disponivel a partir de `00:00` no timezone operacional
- se `now < data/hora da sessao`, endpoints de escrita retornam `FICHA_NOT_AVAILABLE_YET`

Backend protegido:

- `PUT /simuladores/fichas/:id`
- `POST /simuladores/fichas/:id/assinar`
- `PUT /simuladores/fichas-simulador/:fichaId/manobras/:ordem`
- `POST /simuladores/fichas-simulador/:id/popular-manobras`

Frontend protegido:

- botao `Avaliar Tripulante` fica desabilitado para sessao futura;
- mensagem exibida: `Ficha disponível no dia da sessão`;
- tentativa pelo handler tambem e bloqueada antes de abrir o modal.

## Dry-run final desta fase

`node scripts/operations/build-modelos-sessao-manobras-empresa6-source-map.mjs`

- `ready_for_restore=true`
- `ready_for_partial_restore=true`
- `ready_for_full_restore=true`
- `models_covered=51`
- `relation_rows=1122`
- `classification_present_rows=1122`

`node scripts/validation/dry-run-modelos-sessao-manobras-recovery.mjs`

- status: `READY_FOR_FULL_RESTORE`

`node scripts/operations/restore-modelos-sessao-manobras-empresa6.mjs --dry-run`

- status: `READY_FOR_FULL_RESTORE`

## Arquivos atualizados

- `scripts/operations/build-modelos-sessao-manobras-empresa6-source-map.mjs`
- `scripts/operations/modelos-sessao-manobras-empresa6-source-map.json`
- `scripts/validation/dry-run-modelos-sessao-manobras-recovery.mjs`
- `scripts/operations/restore-modelos-sessao-manobras-empresa6.mjs`
- `worker-airtrust/src/utils/ficha-availability.ts`
- `worker-airtrust/src/routes/simuladores-fichas.ts`
- `worker-airtrust/src/routes/simuladores-fichas-acoes.ts`
- `worker-airtrust/src/routes/simuladores-fichas-simulador.ts`
- `worker-airtrust/src/__tests__/routes/simuladores-fichas-tenant-write.test.ts`
- `src/react-app/pages/simuladores/fichas/fichaAvailability.ts`
- `docs/INCIDENTE_MODELOS_SESSAO_MANOBRAS_RECOVERY_REPORT.md`

## Conclusao objetiva

- restore full incremental da empresa `6`: aplicado
- relacoes inseridas no modelo nesta etapa: `22`
- total final de relacoes: `1122`
- `A139-I-11/12`: restaurado com `22` relacoes `AB`
- `A139-P-C1/IFR`: restaurado com `22` relacoes
- fichas pendentes corrigidas: `18`
- bloqueio de avaliacao futura: frontend e backend
- empresa `8`: intocada
- fichas assinadas/concluidas: intocadas
- SIGVOOS: intocado
- FRMS: intocado
- migrations: nao

Encerramento desta fase:

`FULL RESTORE OPERACIONAL CONCLUIDO PARA EMPRESA 6`

## Parte 3A - Modal de selecao para impressao das fichas modelo

Data desta analise/correcao:

- `2026-06-16`

Causa raiz identificada no fluxo:

- o modal de impressao estava implementado inline na propria pagina de fichas, com abertura, carregamento da lista e tratamento de erro misturados no mesmo fluxo;
- nao havia estado visual persistente de erro/retry dentro do modal;
- o bloqueio por ausencia de manobras so aparecia tarde, durante a geracao em lote, o que acoplava a experiencia de impressao a modelos incompletos e fazia o fluxo parecer quebrado quando havia inconsistencias na carga.

Correcao aplicada:

- abertura do modal desacoplada da carga dos modelos;
- migracao do modal para `BaseModal`, com fechamento por `ESC`, backdrop e botao cancelar;
- carga dos modelos em `useEffect` ao abrir o modal, com estado explicito de loading, erro e retry;
- modelos sem manobras permanecem visiveis na lista, mas ficam bloqueados individualmente para impressao com mensagem clara;
- coluna `TRIP.` adicionada no PDF para exibir `A`, `B` ou `AB` sem quebrar o layout.

Arquivos alterados nesta parte:

- `src/react-app/pages/simuladores/fichas/index.tsx`
- `src/react-app/services/pdf-ficha-client.ts`
- `src/react-app/pages/simuladores/fichas/__tests__/index.test.tsx`
- `src/react-app/pages/simuladores/fichas/__tests__/fichaModeloPdf.test.ts`

Validacao funcional:

- modal abre ao clicar em `Ficha Modelo`: `sim`
- modal fecha em `Cancelar`: `sim`
- modal fecha com `ESC`: `sim`
- lista de modelos da empresa ativa carrega com contagem de manobras: `sim`
- modelo sem manobras permanece visivel e bloqueado com mensagem clara: `sim`
- selecao de modelo imprimivel funciona: `sim`
- disparo de download nao pode ser capturado no navegador in-app usado no smoke, porque essa superficie nao suporta downloads; o fluxo de habilitacao do botao e a chamada de geracao permanecem cobertos pelos testes e pelo caminho de codigo.

Validacao automatizada executada:

- `npm run test:run -- src/react-app/pages/simuladores/fichas/__tests__/index.test.tsx`
- `npm run test:run -- src/react-app/pages/simuladores/fichas/__tests__/fichaModeloPdf.test.ts`
- `npm run build`
- `npm run lint`
- `git diff --check`

Restricoes confirmadas nesta parte:

- banco alterado por esta parte: `nao`
- DML/migration: `nao`
- SIGVOOS: `nao`
- FRMS: `nao`
- `frms-source-policy.ts`: `intocado`
