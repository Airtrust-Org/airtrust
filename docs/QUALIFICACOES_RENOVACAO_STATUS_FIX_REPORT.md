# QUALIFICACOES_RENOVACAO_STATUS_FIX_REPORT

## Veredito

STATUS: FIX_APLICADO_COM_VALIDACAO_LOCAL

- A classificacao incorreta de `Renovada` foi corrigida sem alterar dados reais.
- O modal de renovacao agora normaliza qualquer data `DD/MM/YYYY` para `YYYY-MM-DD` antes de renderizar o `input[type=date]` e antes de enviar o payload.
- Nenhuma rotina SIGVOOS foi executada nesta etapa.
- Nenhum arquivo FRMS foi alterado.
- Nenhuma migration foi aplicada.

## Causa raiz

### Status `Renovada`

O bug principal estava no backend do historico em `worker-airtrust/src/routes/qualificacoes/historico.ts`.

- A API tratava `qh.renovacao_de IS NOT NULL` como sinal de que o proprio registro estava `RENOVADA`.
- Isso inverte a semantica do relacionamento.
- `renovacao_de` identifica que o registro atual nasceu a partir de uma qualificacao anterior.
- O registro que deve aparecer como `Renovada` e o anterior, isto e, aquele que possui uma renovacao posterior apontando para ele.

Efeito pratico:

- a sessao mais recente podia ser exibida como `Renovada`;
- o frontend ainda reforcava essa exibicao ao priorizar `renovada` legado mesmo quando o backend ja devolvia um `status` derivado valido.

### Modal de renovacao

O modal aceitava o valor interno sem normalizacao defensiva.

- Se qualquer origem entregasse `DD/MM/YYYY`, o `input[type=date]` passaria a receber um valor invalido para navegador.
- O payload tambem podia sair sem a garantia explicita de `YYYY-MM-DD`.

## `Renovada` era persistido ou derivado?

Combinacao dos dois.

- Persistido: existem sinais legados em `renovada` e `status='RENOVADA'`.
- Derivado no backend: o endpoint `/qualificacoes/historico` calcula `status` operacional para lista e filtros.
- Derivado no frontend: a tela ainda fazia override visual com base no flag legado.

## Regra corrigida

- Um registro so aparece como `RENOVADA` quando existe renovacao posterior real para ele.
- O backend passou a considerar como renovada a linha anterior que possui sucessora apontando para seu `id`.
- O backend deixou de classificar a linha atual apenas porque ela possui `renovacao_de`.
- O frontend passou a priorizar o `status` derivado do backend para nao sobrescrever a sessao vigente com o flag legado.

## Impacto no caso `01/05/2026`

- A sessao vigente com realizacao em `01/05/2026` deixa de ser tratada como `Renovada` apenas por possuir `renovacao_de`.
- Quando o vencimento estiver no futuro, ela volta a aparecer com status operacional normal, tipicamente `Valida`.

## Correcao do modal de data

- O valor usado no `input[type=date]` agora passa por normalizacao para `YYYY-MM-DD`.
- A submissao tambem envia `nova_data_conclusao` normalizada em `YYYY-MM-DD`.
- Datas invalidas passam a falhar com erro explicito (`Data de conclusao invalida`), sem submissao silenciosa.

## Arquivos alterados

- `worker-airtrust/src/routes/qualificacoes/historico.ts`
- `worker-airtrust/src/__tests__/routes/qualificacoes-historico-renovadas.test.ts`
- `src/react-app/pages/qualificacoes/historicoStatusUtils.ts`
- `src/react-app/pages/Qualificacoes.tsx`
- `src/react-app/components/modals/ModalRenovarQualificacao.tsx`
- `src/react-app/components/modals/ModalRenovarQualificacao.test.tsx`
- `src/__tests__/qualificacoes-historico-status-utils.test.ts`

## Testes adicionados ou ajustados

- `src/__tests__/qualificacoes-historico-status-utils.test.ts`
  - garante que o status derivado do backend prevalece sobre o flag legado;
  - garante que o registro antigo com sucessora real continua `RENOVADA`.
- `src/react-app/components/modals/ModalRenovarQualificacao.test.tsx`
  - garante normalizacao de `01/05/2026` para `2026-05-01` no `input[type=date]`;
  - garante envio do payload em `YYYY-MM-DD`.
- `worker-airtrust/src/__tests__/routes/qualificacoes-historico-renovadas.test.ts`
  - garante que o predecessor continua `RENOVADA`;
  - garante que a sessao vigente com `renovacao_de` fica `VALIDA` quando nao ha substituicao posterior.

## Validacoes executadas

Em `2026-06-16`:

- `npx vitest run src/__tests__/qualificacoes-historico-status-utils.test.ts src/react-app/components/modals/ModalRenovarQualificacao.test.tsx` -> PASS
- `cd worker-airtrust && npx vitest run src/__tests__/routes/qualificacoes-historico-renovadas.test.ts` -> PASS
- `npx tsc --noEmit --pretty false` -> PASS
- `npm run build` -> PASS
- `git diff --check` -> PASS
- `bash scripts/check-tracked-secrets.sh` -> PASS
- `bash scripts/validation/audit-deploy-scripts.sh` -> PASS como auditoria/inventario; apenas listou referencias historicas ja existentes a `migrations apply`
- `bash scripts/audit-dangerous-ops.sh` -> PASS com 1 warning preexistente sobre scripts de sync remoto; nenhuma alteracao desta etapa tocou esses caminhos

## Confirmacoes de escopo

- SIGVOOS permanece read-only.
- Nenhuma chamada SIGVOOS foi executada nesta etapa.
- O sync real SIGVOOS segue bloqueado.
- A proxima chamada manual SIGVOOS deve usar janela `from=2026-06-01` ate a data corrente da execucao e token efemero.
- Nenhum arquivo FRMS foi alterado.
- `frms-source-policy.ts` nao foi tocado.
- Nenhuma migration foi criada ou aplicada.
- Nenhum update direto em massa foi executado.

## Auditoria read-only recomendada para dado persistido suspeito

Nao houve acesso ao banco de producao nesta etapa, entao nenhuma contagem real foi executada.

SQL de leitura sugerido:

```sql
SELECT
  qh.id,
  qh.funcionario_id,
  COALESCE(qh.qualificacao_codigo, qt.codigo) AS qualificacao_codigo,
  qh.data_conclusao,
  qh.data_vencimento,
  qh.renovada,
  qh.status,
  qh.renovacao_de
FROM qualificacoes_historico qh
LEFT JOIN qualificacoes_tipos qt
  ON qt.id = qh.qualificacao_id
WHERE qh.deleted_at IS NULL
  AND (
    COALESCE(qh.renovada, 0) = 1
    OR UPPER(COALESCE(qh.status, '')) IN ('RENOVADA', 'RENOVADO')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM qualificacoes_historico qh_next
    WHERE qh_next.deleted_at IS NULL
      AND qh_next.renovacao_de = qh.id
  )
ORDER BY qh.funcionario_id, COALESCE(qh.qualificacao_codigo, qt.codigo), qh.data_conclusao DESC;
```

Uso esperado:

- listar apenas IDs e contagens suspeitas;
- confirmar se existe flag/status legado sem sucessora real;
- preparar correcao controlada separada, com dry-run e aprovacao explicita antes de qualquer `UPDATE`.
