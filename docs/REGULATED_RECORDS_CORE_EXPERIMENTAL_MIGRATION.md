# Regulated Records Core - Experimental Local Migration

## Objetivo

Esta nota documenta a migration experimental local do AirTrust Regulated Records Core:

- `worker-airtrust/migrations_experimental/0410_experimental_regulated_records_core.sql`

Ela fica fora de `worker-airtrust/migrations/` de proposito. A pasta `worker-airtrust/migrations/`
e a cadeia normal usada pelo Wrangler D1 em ambientes remotos. Como esta migration e experimental,
ela nao deve aparecer nessa cadeia e nao deve ser aplicada por `wrangler d1 migrations apply`,
deploys, CI, staging ou producao.

Ela materializa somente o nucleo minimo aprovado com ressalvas no ADR:

- `regulated_records`
- `regulated_record_versions`
- `regulated_record_hashes`
- `regulated_audit_events`
- `regulated_record_links`

Esta migration e preparatoria, local e nao regulada. Ela nao implementa eDB, SDRMe, Controle de Voos real, assinatura, offline, export fiscal, devices, sync sessions ou retention policies.

## Posicao operacional

- Nao faz parte da cadeia normal de migrations de producao.
- Nao deve ser movida para `worker-airtrust/migrations/` sem nova revisao formal.
- Nao deve ser aplicada em staging ou producao.
- Nao deve ser incluida em deploys ou scripts de CI.
- Deve ser executada somente por testes locais que criam um SQLite temporario.
- O teste de governanca de migrations falha se uma migration com `experimental` aparecer na pasta canonica `worker-airtrust/migrations/`.

## Como rodar localmente

Rodar apenas a suite nova de testes:

```bash
cd worker-airtrust
npx vitest run src/__tests__/migrations/regulated-records-core-experimental.test.ts
```

Os testes aplicam a migration em um arquivo SQLite temporario criado em `tmpdir()`. Eles nao usam Wrangler, nao acessam D1 remoto, nao exigem secrets e nao tocam staging ou producao.

Se for necessario inspecionar manualmente o SQL, use o arquivo em `worker-airtrust/migrations_experimental/`.
Nao use `wrangler d1 migrations apply` para esta migration.

## O que ela valida

A suite experimental valida:

- existencia das cinco tabelas;
- existencia dos indices tenant-first por `empresa_id`;
- existencia dos triggers de imutabilidade;
- bloqueio de `UPDATE` e `DELETE` em versoes seladas;
- bloqueio de mutacao em audit ledger;
- bloqueio de mutacao em hashes;
- unicidade de `chain_sequence` por `(empresa_id, chain_scope)`;
- possibilidade de mesma sequencia em empresas diferentes;
- encadeamento `previous_event_hash` -> `event_hash`;
- deteccao de remocao/reordenacao por recomputacao da chain;
- bloqueio de link cross-tenant;
- bloqueio de referencias cross-tenant em versoes, hashes, eventos e `current_version_id`;
- addendum experimental por nova versao com `base_version_id`;
- canonicalizacao JSON deterministica;
- normalizacao Unicode NFC, preservacao de arrays e `null`, e rejeicao explicita de `undefined`, `Date` e numeros nao finitos;
- SHA-256 estavel sobre payload canonicalizado.

## O que ela nao valida

Esta etapa nao prova conformidade regulatoria e nao serve como evidencia ANAC:

- nao roda em staging descartavel;
- nao restaura backup real;
- nao valida R2 real, object lock, lifecycle ou versioning;
- nao valida export fiscal;
- nao implementa assinatura ICP-Brasil, Gov.br ou CANAC;
- nao implementa offline/tablet/PED;
- nao integra com MRO, Controle de Voos, eDB, SDRMe, FRMS ou SGSO;
- nao mede RPO/RTO;
- nao cria endpoints ou servicos de aplicacao.
- nao prova concorrencia real em D1; apenas cobre conflito local por `UNIQUE (empresa_id, chain_scope, chain_sequence)`;
- nao cria uma tabela de chain head nem Durable Object/queue para serializar selagem;
- nao executa restore drill nem recomputacao pos-restore em D1;

## Readiness local

Veredito atual: pronta para ser tratada como **promotion candidate de desenvolvimento local**, ainda fora de staging, producao, deploy e qualquer uso regulado.

A definicao operacional completa desse status esta em:

- `docs/REGULATED_RECORDS_CORE_DEVELOPMENT_LOCAL_CANDIDATE.md`

Motivos:

- a migration esta isolada em `worker-airtrust/migrations_experimental/`;
- o teste de governanca protege contra retorno acidental para `worker-airtrust/migrations/`;
- as cinco tabelas do ADR estao presentes e mantem `empresa_id`;
- os indices principais sao tenant-first quando dependem de consulta por tenant;
- triggers bloqueiam mutacao destrutiva em registros/versoes selados, ledger, hashes e links ativos;
- triggers tenant-aware bloqueiam referencias cross-tenant em versoes, hashes, eventos, links e `current_version_id`;
- a hash chain local cobre sequencia por `(empresa_id, chain_scope)`, repeticao permitida entre empresas e conflito dentro da mesma empresa/scope;
- canonicalizacao e hash tem testes deterministas locais.

Isso nao autoriza mover para `worker-airtrust/migrations/`. Uma promotion formal para a cadeia local normal deve ser uma fase separada, com nome novo, revisao de rollback, plano de seed/restore local e decisao explicita sobre serializacao da chain.

## Por que ainda nao serve para ANAC

O Records Core continua inexistente como produto regulado. Esta migration apenas prova, localmente, que o desenho fisico minimo pode ser representado em SQLite/D1 com triggers, chain e canonicalizacao. Antes de qualquer pretensao regulatoria ainda faltam:

- restore drill em staging descartavel com verificacao de `record_hash`, `tenant_chain_hash` e `manifest_hash`;
- mecanismo formal para evitar bifurcacao de chain em concorrencia real, como retry transacional comprovado, tabela de chain head, Durable Object ou fila por `(empresa_id, chain_scope)`;
- decisao formal sobre assinatura por tipo de registro;
- decisao sobre offline, timestamp e PWA vs app nativo;
- threat model;
- modelo de custodia de chaves;
- matriz requisito -> tabela -> teste -> evidencia;
- politica de retencao;
- validacao por consultor regulatorio;
- autorizacao por operador/OMA e por escopo.

## Proximos passos antes de staging

1. Revisar os resultados dos testes locais.
2. Confirmar se `regulated_record_links` permanece no primeiro vertical slice ou fica opcional.
3. Decidir se `regulated_addenda` deve entrar antes de N3/N4.
4. Manter o guard de governanca que impede migrations experimentais na cadeia canonica.
5. Executar restore drill em ambiente descartavel somente com autorizacao explicita.
6. Manter todos os modulos prototipicos rotulados como nao regulados.
