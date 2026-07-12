# Seed QA sintético — treinamento de examinador

Escopo: staging apenas. Todo dado é fictício. Nenhuma equivalência com Costa
do Sol ou qualquer tenant real. Nenhuma homologação/aceitação ANAC.

## O que o seed cria

`scripts/staging/seed-qa-examiner-training.mjs`, idempotente (cada `INSERT` é
guardado por `NOT EXISTS` sobre um código natural — nunca ID numérico fixo):

| Papel | Código natural | Nome (fictício) |
|---|---|---|
| Empresa (tenant) | `qa_examiner_training` | AirTrust Staging Examiner QA |
| Administrador | (via `QA_EXAMINER_ADMIN_EMAIL`, domínio `.invalid`) | QA Administrador Examinador |
| Instrutor | `QA-INSTRUTOR-EXAMINADOR` | QA Instrutor Examinador |
| Participante 1 | `QA-PARTICIPANTE-ALFA` | QA Participante Alfa |
| Participante 2 | `QA-PARTICIPANTE-BRAVO` | QA Participante Bravo |
| Aeronave/equipamento | `QA-AC-01` | QA Modelo Fictício |
| Simulador | `QA-SIM-01` | — |
| Âncora de tenant (CRED-EXA) | `CRED-EXA` (escopado à empresa QA) | CREDENCIAMENTO DE EXAMINADOR (QA SINTÉTICO) |

Nenhum CPF, RG, licença, telefone ou e-mail real é escrito — `funcionarios.cpf`
e campos pessoais equivalentes ficam `NULL`. O e-mail do administrador QA usa
o domínio reservado `.invalid` (RFC 2606), nunca resolvível.

Os 15 NOTECHS canônicos **não são seedados como linhas** — são injetados em
tempo de geração de ficha por `buildOperationalFichaManobras()`
(`worker-airtrust/src/constants/notechs.ts`), o mesmo mecanismo usado por
todo modelo de sessão do sistema. Nada a fazer aqui além de garantir que a
migration 0424 já criou os 4 modelos (18 técnicos cada) — os NOTECHS aparecem
automaticamente na ficha.

## Uso

```bash
# Dry-run (padrão) — valida e imprime o SQL, não escreve nada
node scripts/staging/seed-qa-examiner-training.mjs

# Aplicar de fato
QA_EXAMINER_ADMIN_PASSWORD='...' \
CONFIRM_STAGING_QA_SEED=AIRTRUST_STAGING_QA_SEED \
node scripts/staging/seed-qa-examiner-training.mjs --apply

# Rollback (soft-delete apenas dos códigos QA_*; nunca a empresa/CRED-EXA
# automaticamente — ver nota abaixo)
node scripts/staging/seed-qa-examiner-training.mjs --rollback --apply \
  CONFIRM_STAGING_QA_SEED=AIRTRUST_STAGING_QA_SEED
```

## Proteções

- `STAGING_D1_NAME` só aceita `airtrust-db-staging-baseline-20260701`;
  qualquer nome contendo `prod` ou os nomes bloqueados conhecidos
  (`airtrust-db`, `airtrust-db-dev`, `airtrust-db-production`) é recusado
  antes de qualquer query.
- `--apply` exige `CONFIRM_STAGING_QA_SEED=AIRTRUST_STAGING_QA_SEED`
  explícito no ambiente.
- Transacional por construção: todo o SQL vai num único `wrangler d1 execute
  --file=` (uma invocação = um batch atômico no D1 — ver
  `docs/ops/staging-migration-0424-disposable-d1-proof-20260711.md` para a
  prova empírica desse comportamento).
- Idempotente: reexecutar não duplica nenhuma linha (chave natural via
  `matricula`/`codigo`/`email`, nunca ID numérico).
- Nunca apaga dados preexistentes — o rollback só faz soft-delete
  (`deleted_at`) dos próprios códigos `QA-*` que o seed criou.

## Nota sobre o rollback do CRED-EXA/empresa QA

O rollback automático **não remove** a empresa QA nem o `CRED-EXA` sintético,
porque a migration 0424 pode já ter criado `EXA-V01..V04` apontando para essa
empresa. Remover a âncora sem confirmar (via
`scripts/staging/migration-ledger-preflight.mjs` + inspeção manual) que
nenhuma ficha real depende dessas linhas arriscaria uma FK órfã. Ver
`docs/ops/staging-release-runbook.md` para o procedimento completo.
