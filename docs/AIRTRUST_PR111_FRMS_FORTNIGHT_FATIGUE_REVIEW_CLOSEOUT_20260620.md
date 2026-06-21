# AirTrust PR111 - FRMS Fortnight Fatigue Review Closeout

Data: 2026-06-20
PR: #111
Branch: `codex/frms-fortnight-fatigue-attenuators`
Base: `main`
HEAD revisado: `86c8822e` mais ajuste semantico local desta macroetapa

## Veredito

Ready for review.

O PR nao precisa permanecer em draft: CI remoto esta verde, os gates locais relevantes passaram, nao ha migration, nao ha alteracao de schema, nao ha SQL remoto, nao toca SIGVOOS e o `tsc` quebrado do worker foi confirmado como preexistente tambem em `origin/main`.

Nao foi feito merge nem deploy nesta macroetapa. A decisao conservadora foi parar em `ready for review` porque:

- a revisao Opus 4.8 pedida no prompt nao estava disponivel nesta sessao;
- o limite de subagentes impediu revisao paralela independente;
- smoke autenticado/cross-tenant real continua sem fixture dedicada.

## Subagentes

Tentativa de abrir subagente falhou imediatamente por limite de threads (`agent thread limit reached`).

Consequencia:

- calculo;
- semantica;
- compatibilidade/consumidores;
- testes/TypeScript/CI;
- seguranca/tenant/SIGVOOS;

foram executados diretamente nesta macroetapa e a limitacao ficou registrada.

## Achados

O diff do PR #111 esta restrito a:

- `worker-airtrust/src/lib/frms/fortnight-indicator.ts`
- `worker-airtrust/src/lib/frms/operational-snapshot.ts`
- `worker-airtrust/src/__tests__/frms/fortnight-indicator.test.ts`
- `worker-airtrust/src/__tests__/frms/operational-snapshot.test.ts`
- `docs/AIRTRUST_FRMS_FORTNIGHT_FATIGUE_ATTENUATORS_20260620.md`

Nao ha:

- migrations;
- alteracao de banco;
- SQL remoto;
- alteracao de integracao SIGVOOS;
- mudanca funcional de frontend;
- quebra aditiva do snapshot.

## Correcao aplicada nesta revisao

Foi identificado um problema semantico no PR original:

- `natureza_dado` estava sendo marcada como `PROJECAO` sempre que a quinzena nao estivesse totalmente coberta pela janela consultada, mesmo em historico ja realizado.

Correcao aplicada:

- `PROJECAO` passou a depender apenas de `data_operacional > hoje`;
- quinzena historica parcial volta a refletir a natureza real do item, como `JORNADA_REALIZADA` ou `JORNADA_PLANEJADA`;
- quinzena completa passa a poder usar `ACUMULADO_LEGAL`;
- `today` passou a ser propagado do snapshot para o calculo quinzenal;
- testes foram ampliados para cobrir essa diferenca.

Essa correcao remove a mistura indevida entre ausencia de cobertura completa da janela e projecao futura.

## Validacoes locais

- `npm run test:worker -- --run fortnight frms operational-snapshot decision-policy projection override`
  - 39 arquivos, 350 testes, passou.
- `npx vitest run src/react-app/pages/escalas/__tests__/evdFrmsBadges.test.ts`
  - 1 arquivo, 20 testes, passou.
- `npm run lint`
  - passou.
- `npm run build`
  - passou.
- `cd worker-airtrust && npx tsc --noEmit`
  - falha.

## Comparacao do tsc com origin/main

O mesmo comando `cd worker-airtrust && npx tsc --noEmit` foi executado em worktree separada de `origin/main`.

Resultado:

- os mesmos erros ocorreram em `origin/main`;
- nenhum erro novo apareceu nos arquivos alterados pelo PR #111.

Erros preexistentes confirmados em `origin/main`:

- `src/__tests__/middleware/tenant-fail-closed.test.ts`
- `src/routes/escalas-core.ts`
- `src/routes/escalas/index.ts`
- `src/routes/frms.ts`

Conclusao:

- o typecheck do worker continua ruim, mas nao por causa do PR #111;
- isso nao deve bloquear este PR sozinho.

## CI remoto do PR

Checks remotos verificados no PR #111:

- `build`: success
- `check-demo-data`: success
- `lint`: success
- `test`: success
- `lms-smoke`: success
- `Check PR`: success

## Seguranca e escopo

- migration: nao
- migration 0412: nao aplicada
- SQL remoto de escrita: nao
- banco manual: nao
- SIGVOOS: NO-GO
- integracao SIGVOOS: inalterada
- PII/secrets: nenhum vazamento identificado
- tenant: o calculo continua a partir do snapshot ja escopado; nao foi introduzida query por item nem fuga de tenant

## Decisao

Status final recomendado para o PR #111:

- sair de draft;
- marcar como `ready for review`;
- nao mergear nesta macroetapa;
- nao deployar nesta macroetapa.

## Proximo passo objetivo

Revisao humana final do PR pronto para review e, se nao houver observacoes novas, merge controlado do worker sem migration em macroetapa separada.
