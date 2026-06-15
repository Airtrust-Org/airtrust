# Governance Evidence Record - Local Vertical Slice

## Status

`governance_evidence_record` e o primeiro vertical slice local e nao regulado
construido sobre o Regulated Records Core experimental.

Ele usa:

- `worker-airtrust/migrations_experimental/0410_experimental_regulated_records_core.sql`
- `worker-airtrust/src/lib/regulated-records/governance-evidence-service.ts`
- `worker-airtrust/src/__tests__/lib/regulated-records/governance-evidence-service.test.ts`

Este slice nao deve ser aplicado em staging ou producao, nao cria endpoints publicos,
nao integra modulos reais e nao move a migration experimental para `worker-airtrust/migrations/`.

## Objetivo

Validar que um consumidor interno simples consegue exercitar o Records Core sem parecer
um registro operacional oficial. O payload representa evidencia interna de governanca,
como tipo de evidencia, modulo relacionado, referencia documental, descricao, autor
interno, data, status e observacoes.

## Por que nao e regulado

- Nao representa registro operacional, fiscal ou aeronautico.
- Nao possui assinatura, retencao regulatoria, export fiscal, modo fiscalizacao ou aceite ANAC.
- Nao cria fonte primaria oficial.
- Nao altera MRO, Controle de Voos, eDB, SDRMe ou RDV real.
- Nao tem endpoint Hono, UI, rota publica, deploy ou acesso por usuario final.

## Por que nao e eDB, SDRMe ou RDV

O record type e `governance_evidence_record` e o chain scope tambem e
`governance_evidence_record`. O payload evita nomenclatura operacional de diario,
manutencao ou voo. O modulo relacionado usado nos testes e governanca interna.

Isso reduz o risco de alguem interpretar o slice como documento oficial de voo,
manutencao, diario de bordo digital, registro de aeronavegabilidade ou registro de voo.

## Como testa o Records Core

O servico interno experimental:

1. cria `regulated_records` em estado transitorio `DRAFT`;
2. canonicaliza o payload com `governance_evidence_record.v1`;
3. calcula `payload_hash`;
4. cria `regulated_record_versions` selada;
5. cria `regulated_record_hashes`;
6. cria `regulated_audit_events`;
7. avanca `regulated_chain_heads`;
8. sela o root record;
9. cria addendum por nova versao;
10. consulta o registro por `empresa_id`;
11. recomputa hashes e chains;
12. exporta/restaura dados logicos em banco descartavel.

Tudo roda em SQLite temporario nos testes Vitest. Nao usa Wrangler remoto, D1 remoto,
staging, producao ou secrets.

## O que foi validado

- Criacao completa do record, versao, hash, evento auditavel e chain head.
- Imutabilidade de versao selada via trigger.
- Addendum por nova versao sem editar a versao anterior.
- Payload igual gera o mesmo `payload_hash`.
- Mudanca real de payload gera `payload_hash` diferente.
- Campos volateis continuam fora da canonicalizacao.
- `canonical_schema_version` e `canonicalization_version` entram no material canonicalizado.
- Eventos encadeiam e o chain head aponta para o ultimo evento.
- Conflito de sequence e detectado em simulacao local.
- Duas empresas mantem records e chain heads independentes.
- Consulta por empresa errada nao retorna o registro.
- Update cross-tenant de `current_version_id` e bloqueado por trigger.
- O slice nao cria links em `regulated_record_links`.
- Export logico local pode ser restaurado em outro banco descartavel.
- Recomputacao pos-restore passa para dados integros.
- Recomputacao pos-restore falha quando o payload restaurado e adulterado.

## O que continua bloqueando migration regular

- Prova de concorrencia real em D1 ou mecanismo runtime aprovado de serializacao/retry.
- Restore drill em D1 temporario, nao apenas SQLite local.
- Runbook de rollback para uma migration regular.
- Threat model final ligado a testes e gates.
- Decisao sobre `regulated_record_links` no primeiro slice regular.
- Decisao sobre tabela dedicada de addenda.
- Governanca de CI para migrations reguladas apos cadeia completa.
- Revisao de nomes finais de tabelas, scopes, eventos e status.
- Aprovacao explicita para criar uma migration regular em `worker-airtrust/migrations/`.

## Proximos passos

1. Revisar o resultado dos testes locais do slice.
2. Decidir se o algoritmo de append deve virar contrato formal de repository.
3. Projetar teste de concorrencia em D1 temporario.
4. Projetar restore drill em D1 temporario com recomputacao de hashes.
5. Manter o slice como nao regulado ate existir aprovacao explicita de promocao.

## Impacto em readiness

Este slice avanca a Fase 2 local nao regulada, mas nao muda o status para migration
regular, staging ou production-ready. O Records Core permanece `development-local candidate`.
