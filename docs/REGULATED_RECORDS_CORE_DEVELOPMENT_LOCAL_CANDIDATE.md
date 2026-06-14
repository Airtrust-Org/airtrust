# Regulated Records Core - Development Local Candidate

## Status

`worker-airtrust/migrations_experimental/0410_experimental_regulated_records_core.sql`
esta classificada como **development-local candidate**.

Isso significa:

- continua fora da cadeia normal de migrations em `worker-airtrust/migrations/`;
- pode ser usada em testes locais e bancos descartaveis de desenvolvimento;
- nao pode ser aplicada por `npm run deploy`, CI, Wrangler remoto ou scripts normais;
- nao representa sistema regulado;
- nao representa autorizacao, aceite, homologacao ou aprovacao ANAC;
- nao integra MRO, Controle de Voos, eDB, SDRMe ou qualquer modulo real.

Este status autoriza somente validacao tecnica local controlada.

## Localizacao

- Migration candidata: `worker-airtrust/migrations_experimental/0410_experimental_regulated_records_core.sql`
- Pasta canonica de producao/desenvolvimento regular: `worker-airtrust/migrations/`

A migration candidata nao deve ser copiada ou movida para `worker-airtrust/migrations/`
sem nova fase de revisao, novo commit e aprovacao explicita para migration regular.

## Criterios ja cumpridos

- Cinco tabelas minimas do ADR presentes:
  `regulated_records`, `regulated_record_versions`, `regulated_record_hashes`,
  `regulated_audit_events`, `regulated_record_links`.
- Todas as tabelas possuem `empresa_id`.
- Indices principais sao tenant-first quando aplicaveis.
- Triggers bloqueiam `UPDATE`/`DELETE` destrutivo em registros e versoes selados.
- Triggers tornam audit events e hash rows append-only.
- Triggers bloqueiam links cross-tenant.
- Triggers bloqueiam referencias cross-tenant em versoes, hashes, audit events e `current_version_id`.
- Hash chain local cobre `chain_scope`, `chain_sequence`, `previous_event_hash` e `event_hash`.
- Sequencias podem repetir entre empresas e nao podem repetir dentro de `(empresa_id, chain_scope)`.
- Canonicalizacao ordena chaves, preserva arrays, preserva `null`, normaliza Unicode NFC e rejeita `undefined`, `Date` e numeros nao finitos.
- `canonical_schema_version` e `canonicalization_version` sao separados e entram no hash.
- Testes locais cobrem addendum por nova versao com `base_version_id`.
- Teste de governanca falha se migration experimental aparecer em `worker-airtrust/migrations/`.
- `wrangler.toml` e `wrangler.dev.toml` continuam apontando `migrations_dir` para `./migrations`.

## Criterios ainda pendentes

- Definir mecanismo formal de chain head, serializacao ou retry por `(empresa_id, chain_scope)`.
- Provar concorrencia real em D1 ou simulacao robusta equivalente.
- Executar restore drill com D1 temporario.
- Recomputar hash chain apos restore.
- Criar threat model do Records Core.
- Decidir se `regulated_record_links` entra no primeiro vertical slice ou fica adiada.
- Decidir se `regulated_addenda` vira tabela dedicada antes de N3/N4.
- Definir plano de rollback local para uma migration regular.
- Revisar nomenclatura final de tabelas, indices, triggers e status.
- Obter aprovacao explicita para promover para migration regular.

## Comandos seguros

Rodar somente testes locais que criam banco descartavel:

```bash
cd worker-airtrust
npx vitest run src/__tests__/migrations/regulated-records-core-experimental.test.ts
npx vitest run src/__tests__/migrations/migration-governance.test.ts
```

Checks de projeto seguros:

```bash
npx tsc --noEmit
npm run build
npm run lint
```

## Comandos proibidos para esta migration

Nao usar esta migration com:

```bash
npm run deploy
npm run deploy:worker
npm run deploy:worker:only
npm run deploy:worker:safe
wrangler d1 migrations apply
wrangler d1 migrations apply --remote
wrangler d1 migrations apply --env staging
wrangler d1 migrations apply --env production
```

Tambem e proibido copiar manualmente o SQL para `worker-airtrust/migrations/`
para executar por Wrangler sem a fase formal de promocao.

## Diferenca de status

| Status | Onde fica | Uso permitido | Pode ir para staging/prod? | Significado regulatorio |
| --- | --- | --- | --- | --- |
| Experimental | `migrations_experimental/` | Prova local inicial e testes descartaveis | Nao | Nenhum |
| Development-local candidate | `migrations_experimental/` | Testes locais e banco descartavel de desenvolvimento | Nao | Nenhum |
| Regular migration | `migrations/` | Cadeia normal local/ambiente aprovado conforme plano | Somente com aprovacao especifica | Nenhum por si so |
| Production-ready | `migrations/` + runbook aprovado | Aplicacao controlada conforme janela e gates | Sim, apos aprovacao explicita | Ainda depende de aceite/autorizacao por operador/OMA/escopo |

## Matriz de promocao

| Promocao | Entrada | Saida esperada | Bloqueios |
| --- | --- | --- | --- |
| Experimental -> development-local candidate | Schema, triggers e testes locais basicos | Candidato documentado fora da cadeia normal | Falta de isolamento operacional ou testes locais |
| Development-local candidate -> regular migration local | Checklist de promocao concluido | Nova migration regular revisada em `worker-airtrust/migrations/` | Sem chain head/retry, sem restore drill, sem rollback local |
| Regular migration local -> staging descartavel | Runbook, backup/restore e evidencias locais | Aplicacao em ambiente descartavel aprovado | Sem autorizacao explicita ou sem plano de rollback |
| Staging descartavel -> production-ready | Evidencias de restore, recomputacao e threat model | Pacote de aplicacao controlado | Sem decisao regulatoria, assinatura/export/retention pendentes |

## Checklist para promocao futura para `worker-airtrust/migrations/`

- [ ] Chain head, serializacao ou retry definido por `(empresa_id, chain_scope)`.
- [ ] Teste de concorrencia real ou simulacao robusta aprovado.
- [ ] Restore drill com D1 temporario executado.
- [ ] Recomputacao de `payload_hash`, `record_hash`, `event_hash` e `tenant_chain_hash` pos-restore.
- [ ] Threat model do Records Core revisado.
- [ ] Decisao sobre manter ou adiar `regulated_record_links` no primeiro slice.
- [ ] Decisao sobre criar ou adiar `regulated_addenda`.
- [ ] Plano de rollback local documentado.
- [ ] Nomenclatura final revisada.
- [ ] Migration regular criada como novo artefato, sem reaproveitar automaticamente o arquivo experimental.
- [ ] Aprovacao explicita para colocar em `worker-airtrust/migrations/`.
- [ ] Teste de governanca atualizado para o novo prefixo regular.

## Garantia operacional atual

Enquanto o arquivo permanecer em `worker-airtrust/migrations_experimental/`,
os comandos normais que usam `migrations_dir = "./migrations"` nao o enxergam.
O teste de governanca deve continuar impedindo que arquivos experimentais entrem
na cadeia canonica sem revisao.
