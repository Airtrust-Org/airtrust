# Regulated Records Core - Promotion Readiness

> Tipo: decisao tecnica macro e readiness de promocao
> Data: 2026-06-14
> Status: documento interno; nao submetido a ANAC; nao e parecer regulatorio
> Escopo: Regulated Records Core, ainda sem eDB/SDRMe/RDV real
> Restricao: nenhuma autorizacao para deploy, staging, producao, uso regulado ou migration regular

## 1. Veredito executivo

| Pergunta | Veredito | Decisao |
| --- | --- | --- |
| O Records Core pode sair do status experimental? | GO COM RESSALVAS | Sim, como `development-local candidate`, ja isolado em `worker-airtrust/migrations_experimental/`. |
| Pode virar migration regular agora? | NO-GO | Nao. Ainda faltam chain head/serializacao, concorrencia robusta, restore D1 temporario, rollback local e governanca regulada de migrations. |
| Pode ir para staging? | NO-GO | Nao. O proximo staging aceitavel deve ser descartavel e explicitamente autorizado, depois de hardening local. |
| Pode ser usado por eDB/SDRMe/RDV? | NO-GO | Nao. Esses produtos ainda dependem de assinatura, offline/tablet, export fiscal, escopo regulatorio e autorizacao por operador/OMA. |
| Pode ser usado por prototipos reais como registro oficial? | NO-GO | Nao. MRO e Controle de Voos continuam prototipos/mock; eDB e SDRMe ainda nao existem. |

**Classificacao final:** **GO COM RESSALVAS** para avancar para hardening local do Records Core; **NO-GO** para migration regular, staging, producao, eDB, SDRMe, RDV oficial ou qualquer alegacao regulatoria.

**Bloqueios reais principais:**

1. falta mecanismo formal de chain head, serializacao ou retry por `(empresa_id, chain_scope)`;
2. falta teste de concorrencia real ou simulacao robusta de disputa de chain;
3. falta restore drill em D1 temporario com recomputacao de hashes;
4. falta governanca de migrations reguladas que prove triggers apos cadeia completa;
5. falta plano de rollback local que nao quebre hash chain;
6. falta decisao sobre `regulated_record_links` no primeiro slice;
7. falta decisao sobre `regulated_addenda`;
8. falta threat model aprovado e vinculado a testes;
9. falta assinatura, offline/tablet, export fiscal e retencao;
10. falta decisao regulatoria por escopo, operador/OMA e tipo de registro.

## 2. Estado atual consolidado

### 2.1 O que ja existe

- ADR fisico proposto em `docs/ADR_REGULATED_RECORDS_CORE_PHYSICAL_DESIGN.md`.
- Migration candidata em `worker-airtrust/migrations_experimental/0410_experimental_regulated_records_core.sql`.
- Documento de status `development-local candidate` em `docs/REGULATED_RECORDS_CORE_DEVELOPMENT_LOCAL_CANDIDATE.md`.
- Documentacao experimental em `docs/REGULATED_RECORDS_CORE_EXPERIMENTAL_MIGRATION.md`.
- Helpers locais de canonicalizacao e hash em `worker-airtrust/src/lib/regulated-records/`.
- Teste local da migration experimental em `regulated-records-core-experimental.test.ts`.
- Teste de governanca de migrations em `migration-governance.test.ts`.
- Restore drill local de backup com manifesto SHA-256 real documentado em `docs/BACKUP_RESTORE_DRILL.md`.

### 2.2 O que e apenas experimental

- As cinco tabelas fisicas do Records Core:
  `regulated_records`, `regulated_record_versions`, `regulated_record_hashes`,
  `regulated_audit_events`, `regulated_record_links`.
- Triggers de imutabilidade, append-only e isolamento tenant-aware.
- Hash chain local por `(empresa_id, chain_scope)`.
- Addendum por nova versao e `base_version_id`, sem tabela dedicada.
- Canonicalizacao JSON local.
- Testes SQLite temporarios sem D1 remoto.

### 2.3 O que esta testado localmente

- Schema minimo das cinco tabelas.
- Presenca de `empresa_id` em todas as tabelas.
- Indices tenant-first principais.
- Triggers de bloqueio de update/delete em versoes seladas.
- Ledger e hash rows append-only.
- Links cross-tenant bloqueados.
- Referencias cross-tenant bloqueadas em records, versions, hashes e audit events.
- Sequencia unica por `(empresa_id, chain_scope)`.
- Repeticao de sequence permitida entre empresas.
- Deteccao por recomputacao de remocao/reordenacao de eventos.
- Canonicalizacao deterministica: ordem de chaves, arrays, `null`, Unicode NFC, rejeicao de `undefined`, `Date` e numeros nao finitos.
- Hash SHA-256 sobre payload canonicalizado com `canonical_schema_version` e `canonicalization_version`.

### 2.4 O que nao esta testado

- Concorrencia real no D1.
- Retry transacional de append de chain.
- Chain head persistente.
- Restore em D1 temporario.
- Recomputacao pos-restore de `payload_hash`, `record_hash`, `event_hash` e `tenant_chain_hash`.
- R2 real, object versioning, lifecycle, retention ou divergencia D1/R2.
- Export fiscal verificavel.
- Assinatura ICP-Brasil, Gov.br, CANAC/senha/MFA ou provider equivalente.
- Offline/tablet/PED, device registry e sync sessions.
- RBAC especifico para papeis regulatorios.
- Modo fiscalizacao.
- Integracao com eDB, SDRMe, RDV, MRO, Controle de Voos ou FRMS.

### 2.5 O que ainda e so documentacao

- Threat model completo aprovado.
- Modelo de custodia de chaves.
- Politica de assinatura por tipo de registro.
- Politica de retencao por record type.
- Matriz requisito -> tabela -> teste -> evidencia.
- Plano de rollback regulado.
- Runbook de restore em staging descartavel.
- Pacote de evidencias ANAC.
- Governanca de promocao entre N0/N1/N2/N3/N4.

### 2.6 O que depende de decisao regulatoria

- Tipo minimo de assinatura aceito por registro: ICP-Brasil, Gov.br, CANAC+MFA ou outro.
- Offline pleno vs. contingencia documentada.
- Timestamp oficial em operacao offline.
- Necessidade de app nativo vs. PWA para eDB/PED.
- Prazos de retencao por eDB, SDRMe, RDV e manutencao.
- Fonte oficial e precedencia entre RDV e eDB.
- Escopo de autorizacao por operador, OMA, frota, aeronave e record type.
- Periodo de operacao paralela papel+digital.
- Formato fiscal aceito pela ANAC.

## 3. Threat model do Records Core

Escala usada:

- Impacto: Baixo, Medio, Alto, Critico.
- Probabilidade: Baixa, Media, Alta.
- Fase: Local hardening, vertical slice nao regulado, migration regular, staging descartavel, produto regulado.

### 3.A Integridade de registro

| Ameaca | Descricao | Impacto | Prob. | Mitigacao atual | Lacuna remanescente | Fase de resolucao |
| --- | --- | --- | --- | --- | --- | --- |
| Alteracao de payload | Payload canonicalizado e alterado depois de selado. | Critico | Media | Trigger bloqueia versoes seladas; hash detecta divergencia. | Falta service layer real e recomputacao periodica. | Local hardening |
| Alteracao de hash | `payload_hash`, `record_hash` ou chain hash alterado para esconder adulteracao. | Critico | Media | `regulated_record_hashes` e append-only por trigger. | Falta guard pos-migration e verify job. | Migration regular |
| Remocao de versao | Versao selada removida para apagar historico. | Critico | Media | Trigger bloqueia delete em versoes seladas. | Falta restore/reconcile que detecte ausencia pos-restore. | Local hardening |
| Reordenacao de eventos | Eventos auditaveis reordenados para alterar narrativa. | Alto | Media | `chain_sequence` e recomputacao local detectam reordenacao. | Falta chain head e verificacao automatica em ambiente real. | Local hardening |
| Edicao destrutiva disfarçada | Correcao aplicada como update em vez de addendum. | Critico | Media | Versoes seladas imutaveis; addendum por nova versao testado. | Falta tabela/politica formal de addendum ou decisao de adiar. | Migration regular |
| Soft delete indevido | `deleted_at` usado para ocultar registro selado. | Alto | Media | Checks e triggers bloqueiam soft delete em selados. | Falta inventario de rotas/scripts que poderiam alterar status antes da selagem. | Vertical slice nao regulado |

### 3.B Multi-tenant

| Ameaca | Descricao | Impacto | Prob. | Mitigacao atual | Lacuna remanescente | Fase de resolucao |
| --- | --- | --- | --- | --- | --- | --- |
| Link cross-tenant | Link entre records de empresas diferentes. | Critico | Media | Triggers bloqueiam source/target fora da `empresa_id`. | Falta service layer e testes de queries reais. | Local hardening |
| Record cross-tenant | `current_version_id` aponta para versao de outra empresa/record. | Critico | Media | Trigger tenant-aware em `current_version_id`. | Falta FK composta formal ou contrato repository. | Migration regular |
| Version cross-tenant | Versao referencia record ou base_version de outra empresa. | Critico | Media | Triggers em versions. | Falta teste em D1 temporario e service layer. | Local hardening |
| Hash cross-tenant | Hash row referencia record/version de outra empresa. | Critico | Media | Triggers em hashes. | Falta verify que recalcule joins tenant-aware. | Local hardening |
| Audit event cross-tenant | Evento de auditoria aponta para record/version de outra empresa. | Critico | Media | Triggers em audit events. | Falta politicas para eventos de suporte cross-tenant. | Vertical slice nao regulado |
| Consulta sem `empresa_id` | Query de leitura vaza records entre tenants. | Critico | Alta | Indices tenant-first; padrao AirTrust ja usa `empresa_id`. | SQLite nao tem RLS; falta repository obrigatorio e guard de query. | Vertical slice nao regulado |

### 3.C Migration/deploy

| Ameaca | Descricao | Impacto | Prob. | Mitigacao atual | Lacuna remanescente | Fase de resolucao |
| --- | --- | --- | --- | --- | --- | --- |
| Experimental aplicada por acidente | SQL experimental entra em `worker-airtrust/migrations/` e Wrangler aplica. | Critico | Media | Arquivo isolado em `migrations_experimental`; governance test bloqueia `experimental` em pasta canonica. | Falta politica de aprovacao para migration regulada e CI gate dedicado. | Migration regular |
| Trigger removida em migration futura | Recreate/drop de tabela remove trigger de imutabilidade. | Critico | Alta | Testes locais listam triggers esperados na migration experimental. | Falta teste que aplique cadeia completa e valide triggers regulados apos todas migrations. | Migration regular |
| Schema muda sem hash/canonicalizacao | Coluna ou enum muda e hashes historicos deixam de verificar. | Critico | Media | `canonical_schema_version` e `canonicalization_version`. | Falta vetor congelado de schema/canonicalizer por versao. | Local hardening |
| Rollback inseguro | Rollback remove tabela/trigger ou cria gap na chain. | Critico | Media | Nenhum rollback regulado aprovado. | Falta plano de rollback local e politica de irreversibilidade de chain. | Migration regular |

### 3.D Concorrencia/hash chain

| Ameaca | Descricao | Impacto | Prob. | Mitigacao atual | Lacuna remanescente | Fase de resolucao |
| --- | --- | --- | --- | --- | --- | --- |
| Duas escritas simultaneas | Dois selos leem a mesma ponta da chain. | Critico | Media | Unique `(empresa_id, chain_scope, chain_sequence)` faz um insert perder. | Falta protocolo de retry e prova em D1. | Local hardening |
| Bifurcacao da cadeia | Duas pontas validas surgem para o mesmo scope. | Critico | Media | Unique de sequence e tenant_chain_hash reduz risco local. | Falta chain head/lock logico. | Local hardening |
| Sequence duplicada | Mesmo sequence usado duas vezes. | Alto | Media | Unique constraint local testada. | Falta teste concorrente real. | Local hardening |
| Retry incorreto | Retry reaproveita previous hash antigo e gera evento fora de ordem. | Critico | Media | Nenhuma implementacao de retry ainda. | Definir algoritmo: reread tip, recompute hash, reinsert; idempotency key. | Vertical slice nao regulado |
| `event_hash` fora de ordem | Hash calculado antes de confirmar posicao definitiva. | Alto | Media | Testes demonstram recomputacao com ordem. | Falta service contract que calcule apenas apos tip final. | Vertical slice nao regulado |

### 3.E Backup/restore

| Ameaca | Descricao | Impacto | Prob. | Mitigacao atual | Lacuna remanescente | Fase de resolucao |
| --- | --- | --- | --- | --- | --- | --- |
| Backup integro, restore incompleto | Manifesto bate, mas D1 restaurado fica incompleto. | Critico | Media | Drill local valida bytes/manifesto. | Falta restore em D1 temporario com checks de dominio. | Local hardening |
| Restore sem recomputar hashes | Dados voltam, mas integridade regulada nao e verificada. | Critico | Alta | Documentado como pendente. | Implementar recomputacao de payload/record/event/chain hash. | Local hardening |
| Chain quebrada pos-restore | Gaps ou reordenacao aparecem apos import. | Critico | Media | Teste local recomputa chain em SQLite. | Falta drill real aplicando dataset restaurado. | Local hardening |
| Manifesto valido, dominio invalido | Bytes corretos restauram dados que violam regras de negocio. | Alto | Media | Backup drill nao valida dominio, por design. | Checks de consistencia por modulo e Records Core. | Staging descartavel |
| D1/R2 divergentes | D1 referencia anexo R2 ausente ou diferente. | Critico | Media | Attachments estao fora do experimento. | Precisara manifest hash, versioning/object lock e reconcile D1/R2. | Produto regulado |

### 3.F Assinatura

| Ameaca | Descricao | Impacto | Prob. | Mitigacao atual | Lacuna remanescente | Fase de resolucao |
| --- | --- | --- | --- | --- | --- | --- |
| Assinatura sobre payload errado | Usuario assina visual/PDF diferente do JSON canonical. | Critico | Media | ADR define JSON canonical como fonte primaria. | Falta camada de assinatura e UX de preview verificavel. | Produto regulado |
| Assinatura sem hash estavel | Canonicalizacao muda e assinatura nao verifica. | Critico | Media | Versionamento de canonicalizer e schema. | Falta vetores congelados e politica de upgrade. | Local hardening |
| Identidade errada | Signer nao corresponde a CANAC/licenca/papel regulatorio. | Critico | Media | Fora do experimento. | Integrar RBAC, funcionarios, CANAC, licencas e provider. | Produto regulado |
| Offline sem timestamp confiavel | Device assina com relogio adulterado. | Critico | Alta | ADR rejeita confiar em relogio local como oficial. | Decisao ANAC/consultor sobre timestamp offline. | Produto regulado |
| Revogacao/certificado expirado | Assinatura parece valida mas certificado estava revogado/expirado. | Critico | Media | Sem provider ainda. | Modelo de verificacao de certificado, OCSP/CRL ou provider equivalente. | Produto regulado |

### 3.G Offline/tablet

| Ameaca | Descricao | Impacto | Prob. | Mitigacao atual | Lacuna remanescente | Fase de resolucao |
| --- | --- | --- | --- | --- | --- | --- |
| Replay de registros | Evento offline reenviado duplicado ou fora do contexto. | Alto | Media | `idempotency_key` existe em audit events. | Falta sync sessions, nonce e politica de replay. | Produto regulado |
| Conflito de sincronizacao | Duas alteracoes offline competem. | Critico | Media | Fora do experimento. | Conflitos devem virar addendum/decisao humana, nunca last-write-wins. | Produto regulado |
| Relogio local adulterado | Sequencia temporal offline falsa. | Alto | Alta | ADR separa timestamp oficial do servidor. | Precisar registrar drift e server_received_at. | Produto regulado |
| Dispositivo perdido/roubado | Cache local expoe dados ou permite submissao. | Critico | Media | Fora do experimento. | Device registry, revogacao, cache cifrado, TTL, wipe logico. | Produto regulado |
| Cache fiscal incompleto | PED a bordo nao contem periodo exigido. | Critico | Media | Dossie identifica exigencia de ultimos 30 dias a reconfirmar. | Teste de completude offline e modo fiscal. | Produto regulado |

### 3.H Uso indevido de prototipos

| Ameaca | Descricao | Impacto | Prob. | Mitigacao atual | Lacuna remanescente | Fase de resolucao |
| --- | --- | --- | --- | --- | --- | --- |
| MRO/CV como registro oficial | Prototipo com mock data usado operacionalmente. | Critico | Alta | Governanca N0/N1/N2/N3/N4 documentada. | Precisa manter banners, bloqueios comerciais e export marcado. | Imediato |
| Usuario acredita que ha autorizacao ANAC | Termos como homologado/certificado/regulado induzem erro. | Critico | Alta | Docs negam homologacao generica. | Guardrails de comunicacao, produto e vendas. | Imediato |
| PDF/export visual vira fonte primaria | PDF demonstrativo usado como prova. | Alto | Media | ADR define PDF como representacao, nao fonte. | Exports N0/N1 devem ser marcados como nao oficiais. | Vertical slice nao regulado |

## 4. Gap list para promocao

### 4.1 Bloqueadores tecnicos

1. **Chain head / serializacao / retry:** definir armazenamento da ponta, algoritmo de append e comportamento de retry.
2. **Teste de concorrencia:** provar disputa no mesmo `(empresa_id, chain_scope)` com conflito e retry correto.
3. **Restore em D1 temporario:** restaurar artefatos em banco descartavel, nao apenas verificar bytes.
4. **Recomputacao de hash chain pos-restore:** validar `payload_hash`, `record_hash`, `event_hash` e `tenant_chain_hash`.
5. **Governanca de migrations reguladas:** teste que garanta triggers, constraints e indices apos cadeia completa.
6. **Plano de rollback local:** definir rollback seguro sem quebrar cadeia nem apagar evidencia.
7. **Nomenclatura final:** revisar nomes de tabelas, indices, triggers, status e chain scopes.
8. **Decisao sobre `regulated_record_links`:** manter no primeiro slice ou adiar para evitar complexidade premature.
9. **Decisao sobre `regulated_addenda`:** continuar por version metadata ou criar tabela dedicada.
10. **Vetores congelados de canonicalizacao:** payloads historicos com hashes esperados por canonicalizer version.

### 4.2 Bloqueadores regulatorios

1. Assinatura ICP-Brasil, Gov.br, CANAC+MFA ou outro mecanismo aceito por tipo de registro.
2. Politica offline/tablet/PED, incluindo PWA vs. app nativo e cache minimo.
3. Escopo eDB: campos, LOA, PED a bordo, assinatura PIC/operador, contingencia.
4. Escopo SDRMe: OS, task card, RAS, licencas, OMA, MGM/MOM.
5. Fonte oficial RDV vs. eDB e precedencia em divergencia.
6. Periodo de operacao paralela papel+digital.
7. Pacote de evidencias ANAC: matriz, politicas, manuais, evidencias de teste.
8. Politica de retencao por record type.
9. Via do Art. 3 da Res. 458: ISO 27000, blockchain ou copia em base ANAC.
10. Autorizacao por operador/OMA, escopo, frota/aeronave e POI.

### 4.3 Bloqueadores de produto

1. Escolha do primeiro vertical slice nao regulado.
2. Definir primeiro consumidor interno que nao possa ser confundido com eDB/SDRMe/RDV.
3. UX de modo fiscalizacao, inicialmente como mock nao regulado ou apenas design.
4. Exportacao simples com manifesto local, sem rotulo regulatorio.
5. RBAC e permissoes para create/seal/verify/export.
6. Mensagens de produto impedindo "homologado", "certificado" ou "ANAC approved".
7. Treinamento/documentacao interna para suporte, vendas e engenharia.
8. Processo de evidencia por release.
9. Observabilidade de verify/hash failures.
10. Politica para dados demo/mock vs. dados reais.

## 5. Plano macro de promocao

### Fase 1 - Fechar fundacao tecnica local

**Objetivo:** tornar o Records Core tecnicamente consistente em banco descartavel.

Entregaveis:

- chain head ou mecanismo equivalente de serializacao;
- algoritmo de concorrencia/retry;
- restore em D1 temporario;
- recomputacao completa de hashes pos-restore;
- governance test de triggers/constraints/indices regulados;
- vetores congelados de canonicalizacao;
- threat model aprovado;
- decisao tecnica sobre `regulated_record_links` e `regulated_addenda`.

Status recomendado: **GO COM RESSALVAS**.

### Fase 2 - Vertical slice nao regulado

**Objetivo:** criar um tipo de registro interno nao regulado usando o core.

Exemplo permitido: `governance_evidence_record`.

Proibido nesta fase: eDB, SDRMe, RDV, MRO real, Controle de Voos real ou qualquer alegacao regulatoria.

Entregaveis:

- service interno;
- testes de create/seal/verify/addendum;
- export simples;
- restore validado;
- banners/documentacao "nao regulado";
- permissao/RBAC minima.

Status recomendado: **GO COM RESSALVAS somente apos Fase 1**.

### Fase 3 - Migration regular de desenvolvimento

**Objetivo:** mover para cadeia regular somente apos aprovacao.

Entregaveis:

- migration final nova em `worker-airtrust/migrations/`;
- rollback local documentado;
- CI guard;
- governance test atualizado para novo prefixo;
- documentacao de promocao;
- aprovacao explicita.

Status atual: **NO-GO**.

### Fase 4 - eDB/SDRMe design

**Objetivo:** iniciar desenho funcional de eDB ou SDRMe so depois da fundacao estar provada.

Entregaveis:

- mapa de campos normativos;
- politica de assinatura;
- politica offline/PED;
- matriz requisito -> tabela -> teste -> evidencia;
- decisao de fonte oficial entre RDV/eDB.

Status atual: **NO-GO**.

### Fase 5 - Piloto nao regulado

**Objetivo:** teste operacional interno sem substituir papel ou sistema oficial.

Entregaveis:

- ambiente controlado;
- dados sinteticos ou reais nao regulados com consentimento/escopo;
- export marcado como nao oficial;
- relatorio de evidencias;
- processo de feedback.

Status atual: **NO-GO ate Fases 1-3**.

## 6. Decisao sobre proximo vertical slice

| Opcao | Risco | Valor | Proximidade regulatoria | Chance de confusao oficial | Facilidade de teste | Avaliacao |
| --- | --- | --- | --- | --- | --- | --- |
| Registro interno de evidencia de governanca | Baixo | Alto | Baixa/media | Baixa | Alta | Melhor opcao. Testa core sem parecer eDB/SDRMe/RDV. |
| Registro de backup/restore drill | Medio | Alto | Media | Media | Media | Bom valor, mas pode misturar evidencia infra com evidencia regulada antes da hora. |
| Registro de treinamento interno | Medio | Medio | Media | Media | Alta | Risco de confundir com certificado/LMS regulatorio. |
| Registro mock de eDB | Alto | Alto | Alta | Alta | Media | Nao recomendado agora; induz confusao com produto oficial. |
| Registro mock de SDRMe | Alto | Alto | Alta | Alta | Media | Nao recomendado agora; aproxima demais de manutencao regulada. |

**Recomendacao:** usar **registro interno de evidencia de governanca** como primeiro consumidor nao regulado, com record type como `governance_evidence_record`.

Justificativa:

- testa canonicalizacao, hash, seal, audit, addendum e export sem usar dominio regulado;
- reduz risco comercial/juridico de alguem confundir com eDB/SDRMe/RDV;
- pode documentar decisoes internas, aprovacoes de arquitetura e evidencias de teste;
- cria valor real para engenharia e compliance sem substituir papel;
- permite validar restore/verify com dados controlados.

## 7. Criterios de nao avancar

Promocao deve ser bloqueada se qualquer uma destas condicoes ocorrer:

- migration experimental em `worker-airtrust/migrations/`;
- ausencia de teste de concorrencia;
- ausencia de restore em D1 temporario;
- ausencia de recomputacao de hashes pos-restore;
- triggers nao testadas apos cadeia completa de migrations;
- qualquer possibilidade conhecida de cross-tenant sem mitigacao;
- documento, UI, venda ou export sugerindo homologacao/certificacao/aprovacao ANAC;
- prototipo usando dados reais como registro oficial;
- MRO, Controle de Voos, eDB ou SDRMe consumindo o core antes da fase aprovada;
- rollback que apague ou reordene evidencia;
- canonicalizer alterado sem nova versao e vetores congelados;
- assinatura, offline ou fiscalizacao implementados sem decisao regulatoria.

## 8. Decisao final

Recomendacao clara:

- **manter como `development-local candidate`;**
- **avancar para fase de hardening local;**
- **nao mover para `worker-airtrust/migrations/` ainda;**
- **nao iniciar eDB/SDRMe ainda;**
- **nao usar MRO, Controle de Voos ou RDV real como consumidor;**
- **nao aplicar em staging/producao;**
- **nao fazer qualquer alegacao de homologacao, certificacao, aprovacao ou autorizacao ANAC.**

O proximo trabalho tecnico de maior impacto e **fechar a fundacao tecnica local da hash chain e do restore**: chain head/serializacao/retry + teste de concorrencia + D1 temporario + recomputacao pos-restore. Isso remove o principal bloqueio tecnico para pensar em migration regular de desenvolvimento.

## 9. Proximo prompt recomendado

```text
Voce esta trabalhando no monorepo do AirTrust.

Objetivo:
Executar a Fase 1 de hardening local do Regulated Records Core, ainda sem staging, producao, deploy ou uso regulado.

Escopo permitido:
- apenas migration experimental em worker-airtrust/migrations_experimental/;
- helpers locais de canonical/hash;
- testes locais;
- documentacao tecnica.

Nao fazer:
- nao mover para worker-airtrust/migrations/;
- nao aplicar migration remota;
- nao criar endpoints publicos;
- nao integrar com eDB, SDRMe, RDV, MRO ou Controle de Voos;
- nao fazer deploy;
- nao fazer commit.

Tarefa macro:
1. propor e implementar localmente um mecanismo de chain head/serializacao/retry para o experimento;
2. adicionar teste de concorrencia ou simulacao robusta de conflito por (empresa_id, chain_scope);
3. criar restore drill local em D1/SQLite temporario para Records Core;
4. recomputar payload_hash, record_hash, event_hash e tenant_chain_hash pos-restore;
5. atualizar docs de readiness com evidencias e limites.

Valide com os testes focados e checks de projeto. Documente qualquer falha preexistente fora do escopo.
```

## 10. Referencias usadas

- `docs/DOSSIE_REGULATORIO_ANAC_AIRTRUST_DB_SDRME_CONTROLE_VOOS.md`
- `docs/ADR_REGULATED_RECORDS_CORE_PHYSICAL_DESIGN.md`
- `docs/REGULATED_RECORDS_CORE_EXPERIMENTAL_MIGRATION.md`
- `docs/REGULATED_RECORDS_CORE_DEVELOPMENT_LOCAL_CANDIDATE.md`
- `docs/ANAC_RECORDS_CORE_RED_TEAM_REVIEW.md`
- `docs/ANAC_RECORDS_CORE_DESIGN_REVIEW.md`
- `docs/BACKUP_RESTORE_DRILL.md`
- `docs/AIRTRUST_MODULE_GOVERNANCE_EVIDENCE_STANDARD.md`
- `TECHNICAL_DEBT.md`
- `worker-airtrust/migrations_experimental/0410_experimental_regulated_records_core.sql`
- `worker-airtrust/src/__tests__/migrations/regulated-records-core-experimental.test.ts`
- `worker-airtrust/src/__tests__/migrations/migration-governance.test.ts`
- `worker-airtrust/src/lib/regulated-records/canonical.ts`
- `worker-airtrust/src/lib/regulated-records/hash.ts`
