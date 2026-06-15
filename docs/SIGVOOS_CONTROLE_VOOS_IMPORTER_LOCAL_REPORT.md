# SIGVOOS -> Controle de Voos Importer Local Report

## Veredito

`IMPORTADOR LOCAL IMPLEMENTADO`

## Base validada

- Branch de trabalho: `codex/controle-voos-sigvoos-importer-local`
- `HEAD` inicial da fase: `163ee51a09b87392855e230a28c34df686734c98`
- `origin/main` inicial da fase: `163ee51a09b87392855e230a28c34df686734c98`
- Divergencia inicial vs `origin/main`: `ahead 0 / behind 0`
- A migration `worker-airtrust/migrations/0411_controle_voos_sigvoos_integration_schema.sql` estava presente no `main` e foi tratada apenas em banco local descartavel de teste.

## Arquivos alterados

- `worker-airtrust/src/services/controle-voos/sigvoos-importer.ts`
- `worker-airtrust/src/__tests__/services/controle-voos-sigvoos-importer.test.ts`
- `docs/SIGVOOS_CONTROLE_VOOS_IMPORTER_LOCAL_REPORT.md`

## O que o importador faz

- Recebe payload local/testavel via `importSigvoosPayloadToControleVoos(db, empresaId, payload, options)`.
- Aceita payload unico, array de registros ou colecoes locais como `variants`.
- Sanitiza o payload removendo chaves com `token`, `secret`, `password` e `credential`.
- Calcula hash deterministico do payload sanitizado para staging/idempotencia.
- Cria staging em `cv_sigvoos_staging` com `payload_sanitizado_json`, hash, janela de origem, status e referencias para `cv_voos`, `cv_voo_etapas` e `cv_voo_tripulantes`.
- Usa `flight_report.id` como chave forte quando presente.
- Quando `flight_report.id` nao existe, mantem `sigvoos_flight_report_id = NULL` e usa hash de identidade do voo para rastreabilidade, sem criar unicidade falsa.
- Atualiza voo manual compativel sem duplicar o registro e sem reclassificar sua `origem_importacao` para `SIGVOOS`.
- Cria ou atualiza `cv_voo_etapas`, inclusive quando `leg.number = NULL`.
- Resolve tripulante por cascata local:
  - `staff.id` via mapeamento historico em `cv_voo_tripulantes.sigvoos_staff_id`
  - `staff.inscription` normalizado contra `funcionarios.matricula`
- Quando o tripulante nao e resolvido, nao cria alocacao silenciosa e registra conflito em `cv_conflitos_integracao`.

## Regras de idempotencia

- O hash do payload sanitizado e unico por `empresa_id` em `cv_sigvoos_staging`.
- Reimportar o mesmo payload reutiliza o staging existente e nao duplica voo, etapa nem tripulante.
- Para voos com `flight_report.id`, a idempotencia forte continua ancorada no indice parcial de `cv_voos`.
- Para etapas com `leg.number = NULL`, o importador usa `sigvoos_content_hash` da etapa para evitar duplicacao local.

## Regras de resolucao de tripulantes

- `STAFF_ID`: reaproveita um `funcionario_id` ja associado ao mesmo `sigvoos_staff_id` na mesma empresa.
- `STAFF_INSCRIPTION`: compara `staff.inscription` normalizado em 5 digitos com `funcionarios.matricula`.
- Nenhuma suposicao de CANAC foi adicionada ao importador local.
- Nenhuma escrita em FRMS foi feita durante a resolucao.

## Conflitos

- Conflitos de tripulante nao resolvido sao gravados em `cv_conflitos_integracao` com:
  - `entidade_tipo = 'voo'`
  - `campo = 'funcionario_id'`
  - `justificativa = 'funcionario nao resolvido por staff.id ou staff.inscription'`
- O staging correspondente fica com `import_status = 'CONFLICT'`.

## Testes executados

- `npx vitest run src/__tests__/services/controle-voos-sigvoos-importer.test.ts`
  - `PASS`
  - 8 testes cobrindo:
    - importacao com `flight_report.id`
    - idempotencia do mesmo payload
    - importacao sem `flight_report.id`
    - `leg.number = NULL`
    - resolucao por `staff.id`
    - resolucao por `staff.inscription`
    - conflito quando funcionario nao e resolvido
    - hash sanitizado ignorando token/secret
    - isolamento por `empresa_id`
    - ausencia de escrita em FRMS e ausencia de dependencia em `frms-source-policy.ts`
- `npx vitest run src/__tests__/migrations/controle-voos-sigvoos-integration-0411-schema.test.ts`
  - `PASS`
- `npx tsc --noEmit --pretty false`
  - `PASS`
- `git diff --check`
  - `PASS`
- `bash scripts/check-tracked-secrets.sh`
  - `PASS`
- `bash scripts/validation/audit-deploy-scripts.sh`
  - `PASS` como inventario; listou referencias historicas ja existentes a `migrations apply`
- `bash scripts/audit-dangerous-ops.sh`
  - `PASS` com warning preexistente sobre scripts de sync local/remoto

## Confirmacoes operacionais

- Nenhuma API real SIGVOOS foi chamada.
- Nenhuma credencial SIGVOOS foi usada.
- Nenhuma migration foi aplicada fora do SQLite descartavel dos testes locais.
- Nenhum deploy foi executado.
- Nada foi feito em staging, producao, D1 remoto, Cloudflare, R2 ou secrets.
- FRMS canônico e `worker-airtrust/src/lib/frms/frms-source-policy.ts` permaneceram intocados.

## Proxima etapa recomendada

- Revisao humana do servico local e do contrato de resolucao de tripulantes.
- Se aprovado, evoluir para um adaptador/local runner protegido para shadow mode, ainda sem expor endpoint publico e sem alterar a politica canônica do FRMS.
