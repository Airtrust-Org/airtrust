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
- addendum experimental por nova versao com `base_version_id`;
- canonicalizacao JSON deterministica;
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

## Por que ainda nao serve para ANAC

O Records Core continua inexistente como produto regulado. Esta migration apenas prova, localmente, que o desenho fisico minimo pode ser representado em SQLite/D1 com triggers, chain e canonicalizacao. Antes de qualquer pretensao regulatoria ainda faltam:

- restore drill em staging descartavel com verificacao de `record_hash`, `tenant_chain_hash` e `manifest_hash`;
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
