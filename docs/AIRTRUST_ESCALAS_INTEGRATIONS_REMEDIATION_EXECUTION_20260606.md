# AIRTRUST - Execucao Final da Remediacao (Escalas + Treinamentos + Integracoes)
Data: 2026-06-06  
Auditoria-base: `docs/AIRTRUST_ESCALAS_INTEGRATIONS_*_20260606.md`  
Branch de trabalho: `fix/escalas-treinamentos-remediation`  
Base: `main` / `origin/main` em `83f3fb51041b9336a3e7f3f0bf64f9c10388feda`

Este documento substitui o registro intermediario anterior. A execucao foi reconstruida a partir do estado real do Git, arquivos e testes locais.

## Estado da branch antes da publicacao

- Commits ja existentes na branch:
  - `0c145f9` - `fix(training): harden qualification completion lifecycle and monthly-view correctness`
  - `832901f` - `docs(audit): preserve escalas/treinamentos audit package and record remediation execution`
  - `e1413a6` - `fix(scheduling): integrate training into EVD and harden class creation/removal`
  - `d4737f3` - `fix(monthly-view): auto-refresh integrated view and surface partial sources`
- Alteracoes finais desta iteracao:
  - UI de presenca diaria em `src/react-app/pages/TreinamentosPlanejadosPage.tsx`.
  - Hook `useAtualizarPresencaDiaTreinamento` em `src/react-app/hooks/useTreinamentosPlanejados.ts`.
  - Notificacao centralizada de mutacoes no wrapper `src/react-app/lib/apiFetch.ts`.
  - Testes frontend para sincronizacao e contrato da UI de presenca diaria.
  - Correcoes minimas dos 8 erros TypeScript FRMS preexistentes que impediam o gate `tsc -p worker-airtrust/tsconfig.json`.
- Sem migration, sem backfill, sem alteracao de secrets, sem cron novo.

## Matriz dos 21 achados originais

| ID | Severidade original | Status final local | Evidencia tecnica |
|---|---:|---|---|
| A1 | Alto | Corrigido | EVD consulta `treinamentos_dias` e fallback legado em `escalas-evd.ts`; teste `A1` em `escalas-evd-put.test.ts`. |
| A2 | Alto | Corrigido | `loadQualificacaoEvents` filtra e agrupa por `empresa_id`; teste multi-tenant em `escala-mensal-integrada.test.ts`. |
| A3 | Alto | Corrigido | Conclusao via solicitacao entra no caminho unico de emissao; testes de integracao de treinamentos. |
| A4 | Alto | Corrigido | `treinamentos_qualificacoes_geradas` passou a ser idempotente por historico gerado. |
| A5 | Alto | Corrigido | Visao Mensal exibe dados parciais e revalida em mutacoes/foco; `apiFetch` emite escopos para escala, treinamentos, simuladores e qualificacoes. |
| M1 | Medio | Corrigido | Filtro `funcaoId` aplicado no SQL da visao integrada. |
| M2 | Medio | Corrigido | UI de presenca diaria consome `PATCH /planejados/:id/dias/:diaId/presencas`, separada de conclusao/aprovacao. |
| M3 | Medio | Corrigido | Turma transiciona conforme conclusoes finais dos participantes. |
| M4 | Medio | Corrigido | Remocao de participante limpa `treinamentos_presencas` explicitamente; vinculos emitidos sao preservados por rastreabilidade. |
| M5 | Medio | Corrigido | Renovacao retroativa nao substitui conclusao posterior. |
| M6 | Medio | Corrigido | `canonicalDedupKey` deduplica turma/sessao inclusive para instrutor. |
| M7 | Medio | Corrigido | ESCALA x ESCALA nao gera conflito cruzado falso na visao integrada. |
| M8 | Medio | Corrigido por isolamento A2 | O falso positivo original foi removido com tenant scope da subquery; igualdade adicional em `qualificacoes_tipos.empresa_id` nao foi aplicada por risco de falso negativo com codigo global. |
| M9 | Medio | Resolvido por politica documentada | Cancelamento nao revoga automaticamente qualificacao ja `CONCLUIDA`; revogacao pos-emissao deve ser acao explicita, permissiva e auditada. Planejados/pendentes seguem cancelaveis pelo fluxo gerenciado. |
| M10 | Medio | Corrigido | FRMS carrega `dateReliable`/`dateSource` e evita data operacional falsa baseada apenas em `created_at`. |
| M11 | Medio | Validado | Benchmark sintetico com 300 funcionarios e 13.500 eventos finais: 90,87 ms para conflito + dedupe + resumo. |
| M12 | Medio | Mitigado com residuo baixo | Janela curta de dedupe por chave natural, retorno idempotente e rollback de estado parcial em falha. Nao ha constraint unica persistida/idempotency key armazenada; ver reauditoria. |
| B1 | Baixo | Corrigido | `canonicalDedupKey` deixou de ser campo morto. |
| B2 | Baixo | Corrigido | `validateTrainingReferences` valida recursos de dias (`simulador_id`, `aeronave_id`, `sessao_id`) no tenant. |
| B3 | Baixo | Corrigido | `DayCell` agora expande `+N itens` com botao acessivel e `aria-expanded`. |
| B4 | Baixo | Corrigido | Filtro de severidade preserva eventos referenciados por conflitos. |

## Gates locais executados

| Gate | Resultado |
|---|---|
| `npx tsc --noEmit` | OK |
| `npx tsc -p worker-airtrust/tsconfig.json --noEmit` | OK |
| `npm run lint` | OK (`lint:api-base`, `guard:tracked-secrets`, `guard:auth-boundaries`) |
| `npm run build` | OK |
| `npm run test:run` | OK: 65 arquivos, 556 testes (`62 passed`, `3 skipped`) |
| `npm run test:worker` | OK: 146 arquivos, 956 testes |
| Testes novos direcionados | OK: `data-sync`, `apiFetch-data-sync`, `TreinamentosPlanejadosPage.presenca-diaria` |

## Benchmark M11

Benchmark sintetico do nucleo puro `buildConflictEvents` + `dedupeIntegratedEvents` + `summarizeEvents` em `worker-airtrust/src/services/escala-mensal-integrada.ts`, com escala, treinamento, simulador, qualificacao e FRMS por funcionario.

| Funcionarios | Eventos base | Conflitos gerados | Eventos finais | JSON final | Tempo medio total |
|---:|---:|---:|---:|---:|---:|
| 25 | 1.000 | 125 | 1.125 | 441 KB | 6,33 ms |
| 100 | 4.000 | 500 | 4.500 | 1,77 MB | 23,31 ms |
| 300 | 12.000 | 1.500 | 13.500 | 5,37 MB | 90,87 ms |

Conclusao: o nucleo de conflito/dedupe nao e o gargalo para o tamanho pedido. O risco restante de performance fica no custo de consulta/serializacao real em D1 e no volume visual da tabela, mitigado pelos filtros ja existentes e por `overflow-x`.

## Smoke local de navegador

- Build servido via `npx vite preview --host 127.0.0.1 --port 4173`.
- Playwright headless abriu:
  - `http://127.0.0.1:4173/treinamentos/planejados`
  - `http://127.0.0.1:4173/escalas/visao-mensal`
  - mobile `390x844` em treinamentos.
- Resultado: rotas protegidas redirecionam para `/login` sem erro de JavaScript.
- Screenshots:
  - `output/playwright/treinamentos-desktop.png`
  - `output/playwright/visao-mensal-desktop.png`
  - `output/playwright/treinamentos-mobile.png`
- Limitacao local: `vite preview` em `127.0.0.1` resolve API como `/api` sem proxy; `/api/public/locale` e `/api/public/translate` retornaram 500 no preview. Isso nao reproduz producao nem dev server com proxy.
- Credenciais de smoke autenticado ausentes no ambiente: `AIRTRUST_SMOKE_EMAIL`, `AIRTRUST_SMOKE_PASSWORD`, `SMOKE_EMAIL`, `SMOKE_PASSWORD`, `TEST_USER_EMAIL`, `TEST_USER_PASSWORD` estavam `unset`.

## Decisao de publicacao

Pre-condicoes locais de codigo estao verdes. Publicacao pode seguir para `main` sem migration/backfill. A certificacao final depende dos smokes read-only de producao e fica registrada em:

- `docs/AIRTRUST_ESCALAS_INTEGRATIONS_DEPLOY_VALIDATION_20260606.md`
- `docs/AIRTRUST_ESCALAS_INTEGRATIONS_FINAL_CERTIFICATION_20260606.md`
