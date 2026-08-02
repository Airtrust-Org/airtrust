# AirTrust — Alinhamento do Blueprint Funcional com o Readiness de Schema D1/R2

> **Data-base:** 2026-08-02 (BRT)  
> **Blueprint relacionado:** `EDB_FUNCTIONAL_PRODUCT_BLUEPRINT_20260802.md`  
> **Fonte arquitetural:** PR #714 — `audit/edb-regulated-schema-readiness-20260802`  
> **Fonte integrada:** PR #714, merge `bb970278b1d685313e3d273aa3746eb526ca0d4d`  
> **Status:** alinhamento arquitetural canônico; não autoriza schema executável, migration ou ativação  
> **Natureza:** documentação; não implementa schema, migration, código, ambiente ou ativação

## 1. Finalidade

Este anexo registra o impacto funcional das decisões arquiteturais fechadas pela Frente 4 sobre o blueprint mestre do produto e serviço eDB.

Ele evita dois erros:

1. manter como decisão técnica aberta um tema já fechado e integrado pelo ADR da PR #714;
2. tratar a decisão arquitetural canônica como capacidade já materializada em schema ou migration.

As decisões abaixo são **[C — arquitetura canônica integrada]**. A implementação do schema, da migration e das capacidades de runtime continua sujeita aos gates próprios e não decorre automaticamente deste documento.

## 2. Decisões que deixam de ser genericamente abertas

### 2.1 Fronteira D1 × R2

- D1 será a fonte transacional primária dos fatos regulatórios estruturados.
- R2 será usado para bytes e pacotes de maior porte.
- Nenhum fato regulatório essencial poderá existir somente no nome, prefixo ou metadado implícito de objeto R2.
- Metadados, finalidade, tamanho, tipo, checksum e vínculo dos objetos permanecerão registrados em D1.

### 2.2 Snapshot regulado

Cada versão congelada deverá ser completa e autossuficiente.

Referências a:

- `cv_*`;
- SIGVOOS;
- cadastros de operador;
- proprietário;
- aeronave;
- tripulação;
- manutenção;

serão apenas procedência. A leitura histórica nunca recompõe o registro consultando uma fonte mutável.

### 2.3 Versões, correções e head corrente

- conteúdo original não será atualizado;
- correção, addendum ou reconstituição criará nova versão;
- cada nova versão registrará tipo, motivo e predecessor;
- um ponteiro transacional separado indicará a versão corrente;
- concorrência usará geração esperada, unicidade e idempotência;
- a versão histórica não será alterada para marcar qual é a corrente.

### 2.4 Isolamento de tenant

Todas as entidades reguladas carregarão `empresa_id`.

O modelo combinará:

- relações e FKs compostas pelo tenant;
- `RESTRICT`;
- triggers de invariantes;
- autorização e filtragem obrigatória no serviço.

As constraints reforçam a segurança, mas não substituem o filtro de tenant em cada consulta e comando.

### 2.5 Append-only e inexistência de delete funcional

- nenhuma tabela regulada terá delete funcional;
- abandono, suspensão, void, correção, transferência e reconstituição serão estados ou eventos preservados;
- eventos serão ordenados por agregado;
- não haverá cadeia global por tenant no Schema V1.

### 2.6 Evidências de integridade

O Schema V1 deverá suportar evidências extensíveis, identificadas por:

- perfil;
- algoritmo;
- versão;
- finalidade;
- referência ao agregado e à versão.

O schema não declarará digest, algoritmo ou cadeia técnica de `shadow` como método regulatório definitivo aceito pela ANAC.

### 2.7 Migration futura

A futura migration deverá ser:

- aditiva;
- inerte;
- limitada a `shadow`;
- sem backfill;
- sem ativação oficial;
- sem assinatura produtiva;
- sem R2 obrigatório;
- compatível com Schema V2 e ledger;
- implementada em PR própria.

## 3. Modelo funcional resultante

O Records Core passa a ter, conceitualmente, estes agregados mínimos:

```text
edb_regulatory_scopes
  ├── edb_volumes
  │     ├── edb_volume_terms
  │     └── edb_records
  │           ├── edb_record_versions
  │           │     ├── edb_record_legs_index
  │           │     ├── edb_version_sources
  │           │     └── edb_integrity_evidence
  │           └── edb_record_heads
  ├── edb_drafts
  │     └── edb_draft_sources
  ├── edb_command_receipts
  └── edb_regulatory_events

Fases posteriores:
  edb_artifacts ───────────────> R2
  edb_signatures ──────────────> metadados D1 + envelope binário R2, se necessário
  edb_exports ─────────────────> controle D1 + pacote R2
  edb_reconstitution_cases ────> cadeia de custódia e importação controlada
  edb_devices / sync ──────────> após decisão PED/offline
```

Os nomes são proposta de schema do ADR e não autorizam SQL executável nesta frente.

## 4. Regras funcionais acrescentadas ao blueprint

- `EDB-BR-031` — D1 é a fonte dos fatos estruturados; R2 não é fonte única de fato regulatório.
- `EDB-BR-032` — uma versão congelada é autossuficiente e não depende de leitura posterior de `cv_*` ou cadastro mutável.
- `EDB-BR-033` — a versão corrente é indicada por head transacional separado com geração controlada.
- `EDB-BR-034` — correção, addendum e reconstituição são versões distintas e preservam predecessor e motivo.
- `EDB-BR-035` — toda relação regulada entre agregados deve manter o mesmo `empresa_id`.
- `EDB-BR-036` — constraints de banco não dispensam autorização e filtro tenant-safe no serviço.
- `EDB-BR-037` — objetos R2 usam chaves opacas e imutáveis, sem PII legível.
- `EDB-BR-038` — objeto R2 só é associado após escrita e verificação; falha parcial gera órfão reconciliável, não exclusão automática.
- `EDB-BR-039` — nenhuma evidência técnica de `shadow` é apresentada como método regulatório definitivo.
- `EDB-BR-040` — comandos regulados críticos possuem idempotência e recibo persistido.
- `EDB-BR-041` — o Schema V1 não cria cadeia global de escrita por tenant.
- `EDB-BR-042` — o modo oficial exige validação de capacidade, throughput, retenção e DR além da existência do schema.

## 5. Impacto nos estados funcionais

### 5.1 Registro e versão

O estado funcional pertence ao registro lógico e ao seu head. As versões históricas permanecem imutáveis.

A implementação futura deverá diferenciar:

- identidade lógica do registro;
- versão original;
- correção;
- addendum;
- reconstituição;
- versão corrente;
- geração de concorrência;
- hold de integridade;
- substituição sem exclusão.

### 5.2 Objetos R2

Estados propostos para artefatos e pacotes:

- `pending_upload`;
- `uploaded_unverified`;
- `verified_unlinked`;
- `linked`;
- `orphaned_reconcilable`;
- `integrity_hold`;
- `retention_hold`;
- `transferred`.

A associação a registro ou versão deve ser explícita em D1.

### 5.3 Comandos e idempotência

Comandos regulados deverão possuir:

- chave idempotente;
- tipo e finalidade;
- agregado alvo;
- geração esperada;
- resultado;
- referência ao evento criado;
- recibo de repetição sem efeito duplicado.

## 6. Impacto nas superfícies do produto

### Administração do escopo

Deverá exibir:

- operador e aeronave;
- estado `shadow`/autorizado/oficial;
- referência do ato quando existir;
- volume corrente;
- capacidade e saúde do acervo;
- bloqueios para promoção de modo.

### Cadeia de versões

Deverá permitir:

- visualizar versão corrente;
- navegar predecessor e sucessoras;
- distinguir original, correção, addendum e reconstituição;
- consultar motivo e autor do comando;
- verificar evidências sem recompor conteúdo de fontes operacionais.

### Centro de integridade

Deverá apresentar, sem expor conteúdo indevido:

- perfil de evidência;
- versão do algoritmo;
- resultado da verificação;
- artefatos vinculados;
- objetos órfãos;
- holds;
- falhas de cadeia ou de metadados.

### Fiscalização e exportação

As consultas deverão usar índices estruturados de D1 e paginação adequada. Pacotes e PDFs serão derivados do snapshot regulado, nunca de cadastro ou `cv_*` atuais.

## 7. Impacto nos critérios de aceite do Records Core

Além dos critérios já registrados no blueprint, o marco de Records Core em staging deverá comprovar:

- D1 contém todos os fatos estruturados necessários à leitura do registro;
- remoção ou indisponibilidade temporária do R2 não altera os fatos estruturados;
- snapshot histórico é lido sem consulta a `cv_*`;
- duas correções concorrentes não criam dois heads válidos;
- repetição de comando produz o mesmo recibo sem duplicar efeitos;
- FK/trigger rejeita vínculo cross-tenant;
- serviço rejeita consulta e comando cross-tenant mesmo quando a FK não participa da operação;
- nenhuma rota funcional executa delete de acervo;
- objeto R2 não pode ser sobrescrito pela mesma chave;
- objeto órfão é detectado e reconciliável;
- cadeia por agregado é verificável sem contenção tenant-wide;
- Schema V2 e ledger reconhecem a migration futura;
- rollback lógico preserva dados e desativa comportamento sem apagar acervo.

## 8. Impacto no backlog

### Onda 0

O item “readiness do schema D1/R2” está **concluído e integrado** pela PR #714.

### Onda 1

Acrescentar:

- especificação de estados de artefato R2 e reconciliação;
- contrato de idempotência e geração esperada;
- catálogo de tipos de versão;
- modelo de indicadores de capacidade do acervo;
- plano de teste de leitura histórica sem dependências mutáveis.

### Onda 2

A Onda 2 pode usar o modelo lógico fechado, mas a migration permanece bloqueada.

Sequência recomendada:

1. aceite e integração dos ADRs;
2. confirmar ausência de frente concorrente no schema;
3. preparar migration Schema V2 aditiva e inerte;
4. testes locais de instalação, upgrade, constraints, concorrência e idempotência;
5. revisão focal do delta;
6. merge sem ativação;
7. nenhum uso oficial até gates posteriores.

## 9. Decisões técnicas que permanecem abertas

A Frente 4 fecha a arquitetura básica, mas não fecha:

- algoritmo e canonicalização definitivos;
- método de assinatura e não repúdio;
- trusted timestamp;
- formato de envelopes binários;
- plataforma e escrita PED/offline;
- política final de bucket lock;
- topologia física para modo oficial: D1 compartilhado, dedicado por operador ou coorte;
- sizing real do primeiro operador;
- RTO/RPO regulatório;
- forma definitiva de acesso fiscal;
- parâmetros que dependem do FOP 200.

Portanto, a seção “Decisões pendentes — Técnicas” do blueprint deve substituir a pergunta ampla “D1 versus R2” por decisões mais específicas de capacidade, topologia, retenção, canonicalização e método regulatório.

## 10. Gates preservados

A futura PR de Schema V1 continua bloqueada até:

- aceite interno e integração dos ADRs;
- ausência de concorrência no mesmo schema;
- definição do caminho Schema V2 e ledger;
- testes locais de constraints, instalação, upgrade, concorrência e idempotência;
- orientação regulatória mínima ou liberação expressa para schema inerte;
- decisões aplicáveis do FOP 200;
- autorização dos gates do repositório.

O modo oficial exige adicionalmente:

- sizing do operador;
- validação de capacidade e throughput;
- estratégia de backup independente;
- restore e DR demonstrados;
- retenção e portabilidade;
- método de integridade e assinatura aceito;
- autorização do operador e das aeronaves.

## 11. Consolidação realizada

Com a integração da PR #714:

1. as decisões arquiteturais deste anexo são classificadas como `[C]`;
2. o ADR de readiness integra as referências principais do blueprint;
3. as seções afetadas do blueprint foram atualizadas para refletir a arquitetura canônica;
4. este anexo permanece como registro de rastreabilidade da consolidação;
5. nenhuma migration, ativação ou efeito oficial é iniciado pelo merge documental.

## 12. Fora do escopo

- SQL executável;
- migration;
- alteração do Schema V2 ou ledger;
- criação de tabelas;
- acesso D1/R2;
- código Worker ou frontend;
- escolha de algoritmo ou provider;
- ativação de `shadow` ou `official`;
- merge, staging ou produção.
