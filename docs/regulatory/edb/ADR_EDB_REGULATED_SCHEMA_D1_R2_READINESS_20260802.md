# ADR — Readiness do Schema Regulado eDB em D1/R2

> **Status:** decisão técnica focal pronta para futura implementação; migration permanece bloqueada  
> **Data:** 2026-08-02 (BRT)  
> **Repositório:** `airtrustsystem-alt/airtrust`  
> **Base confirmada:** `origin/main` em `422095183d5424b13307201f8160d1860a6bc674`  
> **Branch documental:** `audit/edb-regulated-schema-readiness-20260802`  
> **Escopo:** futuro Schema V1 inerte do núcleo regulado do eDB, inicialmente em `shadow`  
> **Natureza:** análise e decisão arquitetural; sem SQL executável, migration, código, schema aplicado, Worker, frontend, workflow, staging ou produção

## 1. Decisão executiva

A futura PR de Schema V1 do eDB deve seguir estas decisões:

1. **D1 será a fonte transacional primária dos dados estruturados e regulatórios**: escopos, volumes, termos, registros, versões, snapshots canônicos, procedência congelada, ponteiro de versão corrente, evidências técnicas de integridade, idempotência e eventos regulatórios.
2. **R2 será usado somente para bytes e pacotes de grande porte**: anexos, envelopes binários de assinatura em fase posterior, renderizações, exportações, pacotes de reconstituição e cópias de preservação. Nenhum fato regulatório essencial pode existir apenas como metadado implícito no nome de um objeto.
3. **O snapshot imutável será completo e autossuficiente.** Referências a `cv_*`, SIGVOOS, cadastros de operador, proprietário, aeronave, tripulante ou manutenção servem apenas como procedência. A leitura de uma versão congelada nunca recompõe seu conteúdo consultando fontes mutáveis.
4. **Versões e correções serão append-only.** O conteúdo original não será atualizado. Correção, addendum ou reconstituição cria nova versão, com motivo, predecessor e novas evidências.
5. **Uma única versão corrente será definida por um ponteiro transacional separado**, e não por alteração retroativa das versões históricas. Concorrência será controlada por geração esperada, unicidade e idempotência.
6. **Todas as entidades reguladas carregarão `empresa_id` e usarão relações compostas pelo tenant.** D1 não possui row-level security; portanto, FK e triggers reforçam invariantes, mas o serviço continua obrigado a filtrar e autorizar por tenant.
7. **Nenhuma tabela regulada terá delete funcional.** Abandono, suspensão, void, correção e transferência serão estados ou eventos preservados.
8. **O Schema V1 não fixará o método regulatório definitivo de integridade ou assinatura.** Ele armazenará conteúdo canônico versionado e uma coleção extensível de evidências, identificadas por perfil, algoritmo e versão. Um digest técnico usado em `shadow` não será apresentado como método aceito pela ANAC.
9. **Não haverá cadeia global por tenant no Schema V1.** Ela criaria contenção, acoplamento e uma escolha prematura do método de evidência. A sequência será por agregado; uma cadeia adicional poderá ser registrada posteriormente na tabela genérica de evidências, sem reestruturar registros e versões.
10. **A migration será aditiva, inerte e compatível com Schema V2.** Não haverá backfill, ativação oficial, assinatura, dados reais, R2 obrigatório nem mudança de comportamento na mesma PR.
11. **O Schema V1 poderá residir no D1 atual durante `shadow`.** Antes de modo oficial, capacidade, throughput e DR deverão confirmar se o mesmo banco é adequado. O modelo evita dependência obrigatória de FKs para cadastros mutáveis, permitindo futura separação física sem mudar o modelo lógico.
12. **O ADR físico genérico anterior não governa automaticamente o eDB.** Suas ideias de D1/R2, canonicalização, append-only e triggers são aproveitadas; escolhas definitivas de SHA-256, cadeia tenant-wide e um core genérico único permanecem não aceitas para o eDB enquanto o método regulatório estiver aberto.

A arquitetura básica está fechada para a futura PR de schema. Continuam abertos apenas os parâmetros e métodos que dependem de orientação regulatória, capacidade real ou operação do primeiro requerente.

## 2. Contexto e precedência

Este ADR especializa o baseline atual do eDB:

- `docs/regulatory/edb/ADR_EDB_REGULATED_RECORDS_BOUNDARY_20260802.md`;
- `docs/regulatory/edb/ANAC_EDB_IMPLEMENTATION_PLAN_20260802.md`;
- `docs/regulatory/edb/ANAC_EDB_REGULATORY_BASELINE_20260802.md`;
- `docs/regulatory/edb/fop200/DECISION_REGISTER.csv`;
- issue `#689`.

Também considera:

- `CLAUDE.md`;
- `TECHNICAL_DEBT.md`;
- `worker-airtrust/schema-v2/**`;
- `.github/workflows/apply-schema-change-v2.yml`;
- `.github/workflows/d1-production-backup-restore-drill.yml`;
- `worker-airtrust/src/services/backup/orchestrator.ts`;
- documentos históricos do Records Core.

Em caso de conflito:

1. orientação oficial aplicável e decisões registradas no FOP 200;
2. `origin/main`, contratos e workflows vigentes;
3. baseline eDB de 2026-08-02;
4. este ADR focal;
5. documentos históricos.

Este documento não afirma aprovação, aceitação, ateste, homologação ou autorização pela ANAC.

## 3. Limites da plataforma e consequências de desenho

Limites Cloudflare confirmados na data deste ADR:

- D1: até 10 GB por banco em plano pago;
- D1: até 2 MB por string, BLOB ou linha;
- D1: até 100 colunas por tabela;
- D1: até 100 parâmetros vinculados por consulta;
- D1: até 100 KB por statement;
- D1: banco individual processa consultas de forma serial;
- D1: Time Travel de até 30 dias em plano pago;
- R2: até aproximadamente 5 TiB por objeto e 5 GiB por upload simples;
- R2: leitura após escrita, listagem e exclusão são fortemente consistentes;
- R2: duas gravações na mesma chave usam comportamento de último escritor;
- R2: bucket locks podem impedir sobrescrita e exclusão por prazo ou indefinidamente.

Consequências:

- payload canônico não pode se aproximar do limite de 2 MB;
- anexos e pacotes não pertencem ao D1;
- consultas de fiscalização precisam de índices e paginação keyset;
- não se deve criar um gargalo de escrita por cadeia global;
- nomes de objetos R2 devem ser imutáveis e nunca reutilizados;
- Time Travel não atende retenção legal de longo prazo;
- backup no mesmo bucket não constitui cópia independente;
- R2 durável não impede exclusão acidental ou maliciosa sem controles de retenção;
- qualquer escrita distribuída D1+R2 exige estados intermediários e reconciliação.

### 3.1 Guardas de tamanho propostos

O limite técnico definitivo será validado com fixtures, mas a futura implementação deve adotar:

- alvo de projeto para `canonical_snapshot_json`: até 256 KiB por versão;
- limite configurado inicial: no máximo 512 KiB por versão;
- registro obrigatório do tamanho em bytes;
- rejeição explícita acima do limite, sem truncamento;
- anexos, certificados, imagens, PDFs e ZIPs sempre fora do payload;
- nenhum campo binário codificado em base64 dentro do snapshot.

Esses valores são guardas internas conservadoras, não requisitos regulatórios nem limites Cloudflare.

### 3.2 Capacidade ainda não medida

O repositório não contém uma estimativa validada do primeiro operador para:

- aeronaves;
- etapas por dia;
- registros por etapa ou jornada;
- versões médias por registro;
- eventos por registro;
- tamanho médio, P95 e P99 do snapshot;
- anexos por registro;
- crescimento anual e retenção acumulada.

A falta desses números **não bloqueia o Schema V1 inerte**, porque o desenho separa dados estruturados de objetos e é exportável. Ela bloqueia a decisão de modo oficial no D1 compartilhado.

Antes do `official`, a planilha de capacidade deverá projetar pelo menos 10 anos e o período integral de retenção, com alertas em 50%, 60% e 75% da capacidade do banco. Se a projeção superar 60% do limite ou gerar contenção relevante, o mesmo modelo lógico deverá ser implantado em D1 dedicado por operador ou coorte regulatória.

## 4. Diagrama textual do modelo

```text
Tenant AirTrust
  |
  +-- edb_regulatory_scopes
        |  snapshot legal do operador + aeronave + estado shadow/authorized/official
        |
        +-- edb_volumes
        |     |
        |     +-- edb_volume_terms [OPENING, CLOSING]  (imutáveis)
        |     |
        |     +-- edb_records  (identidade lógica do conjunto)
        |            |
        |            +-- edb_record_versions  (snapshot canônico imutável)
        |            |      |
        |            |      +-- edb_record_legs_index  (projeção imutável para busca)
        |            |      +-- edb_version_sources    (procedência congelada)
        |            |      +-- edb_integrity_evidence (perfil extensível)
        |            |
        |            +-- edb_record_heads  (único ponteiro corrente + geração)
        |
        +-- edb_drafts
        |     |
        |     +-- edb_draft_sources  (procedência antes do congelamento)
        |
        +-- edb_command_receipts  (idempotência)
        |
        +-- edb_regulatory_events (append-only por agregado)

Fases posteriores:
  edb_artifacts ----------> R2 bytes imutáveis
  edb_signatures ---------> R2 envelope binário, metadados/evidência em D1
  edb_exports ------------> R2 pacote + manifesto, controle em D1
  edb_reconstitution_cases-> importação controlada e cadeia de custódia
  edb_devices / sync ------> PED/offline após decisão regulatória
```

## 5. Conteúdo em D1

D1 deve guardar:

- escopo regulatório por operador e aeronave;
- snapshot legal do operador;
- snapshot de aeronave, matrícula, fabricante, modelo e número de série;
- snapshot do proprietário;
- volume e sua sucessão;
- termos de abertura e encerramento;
- rascunhos persistidos e seu estado;
- procedência por campo ou grupo de campos;
- identidade lógica do registro;
- versões completas e imutáveis;
- projeção estruturada de etapas para consulta;
- versão corrente e geração de concorrência;
- motivo e vínculo de correção/addendum;
- evidências técnicas de integridade;
- recibos de idempotência;
- eventos regulatórios append-only;
- metadados e checksums de objetos R2;
- metadados de exportações e reconstituições em fases posteriores.

O snapshot canônico permanece em D1 porque:

- é pequeno e estruturado;
- participa de transações de versionamento;
- deve ser consultável sem disponibilidade do R2;
- evita que um objeto seja a única fonte de um fato regulatório;
- simplifica exportação e verificação.

## 6. Conteúdo em R2

R2 deverá guardar, quando essas fases forem implementadas:

- anexos binários;
- imagens ou evidências documentais;
- envelopes binários de assinatura e certificados, se o provider exigir;
- PDF de apresentação ou impressão;
- pacote de exportação completo;
- pacote de transferência de acervo;
- pacote de reconstituição;
- cópia de preservação do snapshot e manifesto, sem substituir o D1;
- dumps de backup de longo prazo em infraestrutura separada da aplicação.

Regras:

- objeto não será sobrescrito;
- chave será opaca, sem nome, CPF, CANAC, matrícula ou outra PII legível;
- cada objeto terá ID, tamanho, MIME, checksum, algoritmo, data e finalidade em D1;
- D1 será a autorização para leitura; conhecer a chave não concede acesso;
- o objeto será escrito e relido/verificado antes de ser associado a uma versão selada;
- falha posterior no D1 produzirá objeto órfão retido e reconciliável, nunca exclusão automática;
- bucket lock ou prefix lock só será ativado após a política de retenção e o plano de saída terem sido aprovados;
- para o acervo oficial, preferir bucket dedicado por ambiente; um prefixo dedicado é o mínimo aceitável em `shadow`;
- backups regulados não devem ficar apenas no mesmo bucket operacional.

## 7. Snapshot mínimo imutável

Cada `edb_record_version` deve preservar, no mínimo:

### 7.1 Envelope

- `snapshot_schema_version`;
- `canonicalization_version`;
- `record_id`;
- `version_id`;
- número da versão;
- tipo da versão: original, correção, addendum ou reconstituição;
- versão predecessora;
- motivo da nova versão;
- `empresa_id`;
- escopo regulatório;
- volume e número do volume;
- instante de criação no servidor;
- intervalo operacional do conjunto;
- estado regulatório no momento do congelamento.

### 7.2 Operador, proprietário e aeronave

- identificador legal do operador;
- razão social/designação do operador;
- identificador e nome do proprietário;
- fabricante;
- modelo;
- número de série;
- matrícula/marcas;
- identificador interno apenas como referência auxiliar;
- ato/escopo autorizativo quando existir.

### 7.3 Operação

Para cada etapa incluída:

- data operacional;
- origem e destino;
- partida, decolagem, pouso e corte;
- instantes normalizados e timezone operacional;
- tempos discriminados aplicáveis;
- pousos e ciclos;
- combustível e unidade;
- POB;
- carga e unidade;
- natureza;
- ocorrências;
- discrepâncias associadas;
- sequência da etapa;
- identificador recuperável.

### 7.4 Tripulação

Para cada tripulante e etapa:

- nome exibido no ato;
- CANAC ou identificador regulatório aplicável;
- função/código;
- base ou vínculo exigido;
- papel de PIC quando aplicável;
- identificador interno somente como referência auxiliar.

### 7.5 Situação técnica

- última intervenção relevante;
- próxima intervenção;
- horas de célula previstas/restantes e unidade;
- discrepâncias abertas apresentadas;
- ações corretivas ou retardadas;
- responsável e organização pela informação;
- instante de referência;
- ciência exigida, em fase posterior.

### 7.6 Procedência

- fonte: SIGVOOS, `cv_*`, entrada manual, manutenção, correção ou reconstituição;
- identificador opaco da fonte;
- versão/revisão ou instante da fonte;
- caminho do campo ou grupo de campos;
- resultado da resolução de conflito;
- ator que resolveu;
- instante do congelamento.

O snapshot **não deve conter**:

- token;
- cookie;
- segredo;
- URL assinada;
- request body completo sem função regulatória;
- labels de UI;
- cache;
- `updated_at` mutável da fonte;
- referência que precise ser consultada para recuperar o valor;
- binário em base64.

## 8. Como impedir referências mutáveis a `cv_*`

A separação será estrutural:

1. `edb_draft_sources` pode registrar `source_type`, `source_entity_type`, `source_entity_id` e `source_revision`.
2. Não haverá FK obrigatória de versão regulada para tabelas `cv_*`.
3. Na criação da versão, os valores são copiados para o snapshot e a procedência é copiada para `edb_version_sources`.
4. Renderização, verificação, exportação e assinatura usam somente a versão e seus artefatos.
5. Mudança posterior em `cv_*` gera divergência ou novo rascunho; nunca altera a versão.
6. Exclusão ou correção operacional não apaga a evidência de qual fonte originou o rascunho.
7. Nenhum join com `cv_*` será permitido no caminho de leitura oficial.

A procedência é evidência histórica, não uma referência de conteúdo.

## 9. Proposta de tabelas do Schema V1

A lista abaixo fecha o desenho lógico. A futura migration poderá ajustar nomes físicos conforme convenção, mas não deve mudar responsabilidades.

### 9.1 `edb_regulatory_scopes`

**Responsabilidade:** delimitar tenant, operador, aeronave e estado de uso.

Campos conceituais:

- ID e `empresa_id`;
- identidade legal e nome do operador em snapshot;
- identidade estável da aeronave;
- fabricante, modelo, serial e matrícula em snapshot;
- estado: `SHADOW`, `AUTHORIZED_PENDING_MIGRATION`, `OFFICIAL`, `SUSPENDED`, `DECOMMISSIONING`;
- referência ao ato autorizativo, quando aplicável;
- início e fim do escopo;
- geração de concorrência;
- datas de criação e alteração de estado.

Constraints:

- unicidade por tenant, aeronave e intervalo ativo;
- somente `SHADOW` na PR de Schema V1;
- nenhum escopo oficial sem referência autorizativa;
- nenhuma mudança de `empresa_id`;
- delete proibido.

### 9.2 `edb_volumes`

**Responsabilidade:** identidade e estado operacional do volume.

Campos conceituais:

- ID, `empresa_id`, `scope_id`;
- número do volume;
- identidade estável da aeronave;
- matrícula de abertura;
- sequência;
- estado derivado/controlado: aberto ou encerrado;
- motivo de encerramento;
- volume predecessor e sucessor;
- ponteiro para termos;
- geração;
- datas.

Constraints:

- unicidade do número por tenant e aeronave;
- no máximo um volume aberto por escopo/aeronave;
- predecessor e sucessor no mesmo tenant e aeronave;
- volume encerrado não reabre;
- delete proibido.

### 9.3 `edb_volume_terms`

**Responsabilidade:** termos imutáveis de abertura e encerramento.

Campos conceituais:

- ID, `empresa_id`, `volume_id`;
- tipo do termo;
- snapshot completo de operador, proprietário e aeronave;
- saldos/horas/ciclos/pousos aplicáveis;
- observações;
- schema e canonicalização;
- evidência de integridade;
- ator e instante;
- referência futura de assinatura.

Constraints:

- um termo de abertura e, no máximo, um termo de encerramento por volume;
- termo de encerramento exige abertura;
- update e delete proibidos;
- correção somente por termo adicional de correção em evolução posterior, sem sobrescrever.

### 9.4 `edb_drafts`

**Responsabilidade:** persistir rascunho não oficial e seu congelamento.

Campos conceituais:

- ID, `empresa_id`, `scope_id`;
- origem principal;
- versão do contrato `edb.draft`;
- payload do rascunho;
- status;
- geração;
- criado por e em;
- congelado por e em;
- descartado por evento, nunca apagado.

Constraints:

- um comando idempotente não cria dois rascunhos;
- draft congelado não aceita alteração;
- `empresa_id` imutável;
- delete proibido.

### 9.5 `edb_draft_sources`

**Responsabilidade:** procedência e conflitos antes do congelamento.

Campos conceituais:

- ID, `empresa_id`, `draft_id`;
- caminho/grupo de campos;
- tipo e identificador da fonte;
- revisão/instante da fonte;
- confiança/classificação;
- estado de conflito;
- decisão e ator;
- snapshot sanitizado da evidência necessária.

Constraints:

- mesma empresa do draft;
- nenhuma PII além da necessária no valor de procedência;
- update permitido apenas enquanto o draft não estiver congelado;
- histórico de resolução preservado por eventos;
- delete proibido.

### 9.6 `edb_records`

**Responsabilidade:** identidade lógica estável do conjunto regulado.

Campos conceituais:

- ID, `empresa_id`, `scope_id`, `volume_id`;
- tipo de registro;
- chave idempotente de origem;
- data/intervalo operacional;
- identidade estável da aeronave e matrícula em snapshot;
- sequência no volume;
- estado lógico;
- datas.

Constraints:

- identidade única por tenant e chave de origem;
- sequência única por volume;
- volume e escopo do mesmo tenant;
- não inserir em volume encerrado;
- conteúdo não fica nesta tabela;
- delete proibido.

### 9.7 `edb_record_versions`

**Responsabilidade:** guardar cada snapshot canônico imutável.

Campos conceituais:

- ID, `empresa_id`, `record_id`;
- número da versão;
- tipo da versão;
- versão predecessora;
- motivo, código e texto da correção;
- payload canônico;
- tamanho em bytes;
- schema e canonicalização;
- criado por e em;
- instante de recebimento do servidor;
- estado técnico `FROZEN`.

Constraints:

- unicidade por registro e número;
- predecessor no mesmo registro e tenant;
- versão inicial não possui predecessor;
- correção/addendum/reconstituição exige predecessor e motivo;
- payload, schema, canonicalização e metadados imutáveis;
- update e delete proibidos;
- tamanho abaixo do limite configurado.

### 9.8 `edb_record_heads`

**Responsabilidade:** definir a única versão corrente sem alterar versões antigas.

Campos conceituais:

- `empresa_id`, `record_id`;
- `current_version_id`;
- geração;
- atualizado por e em;
- último comando idempotente.

Constraints:

- uma única linha por registro;
- versão corrente pertence ao mesmo registro e tenant;
- troca de ponteiro exige geração esperada;
- mudança ocorre na mesma unidade transacional da nova versão e eventos;
- nenhuma versão histórica é apagada ou marcada por update;
- delete proibido.

### 9.9 `edb_record_legs_index`

**Responsabilidade:** projeção imutável para fiscalização e paginação, sem consultar JSON.

Campos conceituais:

- ID, `empresa_id`, `record_id`, `version_id`;
- sequência da etapa;
- data operacional e instantes UTC;
- origem e destino;
- matrícula, serial e volume;
- PIC e função em snapshot mínimo;
- indicadores de ocorrência/discrepância;
- tempos e contadores necessários à busca;
- `is_current_projection`.

A coluna `is_current_projection`, se usada, pertence à projeção e não ao registro regulado. Alternativa preferencial: a consulta junta com `edb_record_heads`, preservando esta tabela totalmente imutável.

Constraints:

- mesma versão/registro/tenant;
- unicidade por versão e sequência;
- update e delete proibidos.

### 9.10 `edb_version_sources`

**Responsabilidade:** procedência congelada associada à versão.

Campos e constraints equivalentes a `edb_draft_sources`, porém:

- somente insert;
- nenhum valor depende da disponibilidade da fonte;
- update e delete proibidos;
- referências operacionais são texto opaco, sem FK para `cv_*`.

### 9.11 `edb_integrity_evidence`

**Responsabilidade:** registrar evidências técnicas e futuras evidências regulatórias sem fixar método.

Campos conceituais:

- ID, `empresa_id`;
- alvo: termo, versão, evento, artefato ou pacote;
- perfil de evidência;
- tipo;
- algoritmo;
- versão do algoritmo;
- valor/digest;
- predecessor opcional;
- escopo e sequência opcional;
- gerado por, em e ambiente;
- resultado da última verificação;
- metadados canônicos mínimos.

Constraints:

- alvo no mesmo tenant;
- unicidade por alvo, perfil e versão;
- update e delete proibidos;
- algoritmo nunca inferido do software atual;
- um perfil `TECHNICAL_SHADOW_V1` não pode ser rotulado como aceito pela ANAC.

### 9.12 `edb_command_receipts`

**Responsabilidade:** idempotência de comandos que produzem efeitos.

Campos conceituais:

- ID, `empresa_id`;
- tipo de comando;
- chave idempotente;
- hash técnico do request sanitizado;
- estado;
- record/version/volume produzido;
- primeiro recebimento e conclusão;
- código de resultado.

Constraints:

- unicidade por tenant, tipo e chave;
- reutilização com payload diferente é erro;
- resposta repetida retorna o mesmo efeito;
- não contém payload regulado completo;
- delete proibido.

### 9.13 `edb_regulatory_events`

**Responsabilidade:** auditoria regulatória append-only separada de logs operacionais.

Campos conceituais:

- ID, `empresa_id`;
- agregado, ID do agregado e sequência;
- tipo e categoria;
- ator, papel e propósito;
- request/correlation ID sanitizado;
- dispositivo, quando aplicável;
- evento canônico;
- perfil/evidência de integridade;
- instante do servidor;
- instante declarado pelo cliente como evidência não confiável, quando necessário;
- comando idempotente relacionado.

Constraints:

- unicidade por tenant, agregado e sequência;
- sequência positiva e sem sobrescrita;
- update e delete proibidos;
- sem token, cookie, autorização, payload completo ou URL assinada;
- eventos de suporte/fiscalização continuam dentro de um `empresa_id` e escopo explícito.

## 10. Tabelas deliberadamente adiadas

Arquitetura fechada, implementação em PRs posteriores:

- `edb_signatures` e intents;
- `edb_artifacts`;
- `edb_exports`;
- `edb_reconstitution_cases`;
- `edb_devices`;
- `edb_sync_operations`;
- tabelas especializadas de discrepância e retorno ao serviço.

O Schema V1 deve deixar IDs e evidências extensíveis, mas não criar tabelas vazias sem comportamento e teste.

## 11. Constraints cross-tenant

Camadas obrigatórias:

### 11.1 Schema

- `empresa_id NOT NULL` em todas as tabelas;
- cada parent expõe chave única composta por `empresa_id` e ID;
- child usa FK composta para o parent;
- ações de FK usam `RESTRICT`, nunca `CASCADE`;
- predecessor, sucessor, head, volume, scope e version pertencem ao mesmo tenant;
- triggers impedem combinações multi-parent incoerentes quando uma FK isolada não basta.

### 11.2 Serviço

- `empresa_id` vem do contexto autenticado;
- nenhum `empresa_id` é aceito do body como autoridade;
- toda leitura e escrita inclui tenant;
- IDs opacos não substituem filtro de tenant;
- exportação e fiscalização começam por escopo D1 autorizado;
- R2 só é acessado após validar metadado no mesmo tenant.

### 11.3 Testes

- matriz completa A→A permitida e A→B negada;
- IDs existentes em outro tenant retornam resultado indistinguível de inexistente, quando aplicável;
- tentativas cross-tenant não criam eventos fora do tenant alvo;
- nenhuma assinatura, artifact ou versão pode ser movida por atualização de `empresa_id`.

FK e trigger são reforços. A ausência de row-level security em D1 mantém o serviço como barreira obrigatória.

## 12. Como impedir duas versões ativas concorrentes

A versão histórica não terá campo mutável `ACTIVE`.

Fluxo lógico:

1. receber comando com chave idempotente e geração esperada;
2. reservar/validar recibo do comando;
3. inserir a nova versão com próximo número único;
4. inserir procedência, índice e evidências;
5. trocar `edb_record_heads.current_version_id` somente se a geração atual for a esperada;
6. incrementar a geração;
7. inserir evento de mudança de head;
8. concluir recibo.

Se outra operação vencer:

- a restrição de número, geração ou head falha;
- o serviço relê o head;
- se a chave é a mesma, retorna o efeito existente;
- se é comando diferente, exige reconstrução consciente sobre a nova versão;
- não faz merge automático.

Não haverá `MAX(version_number) + 1` sem proteção, nem retry cego de escrita. D1 pode exigir retry explícito para erros transitórios; o retry será limitado, com backoff e sempre protegido por idempotência.

## 13. Versões, correções e addenda

Tipos:

- `ORIGINAL`;
- `CORRECTION`;
- `ADDENDUM`;
- `RECONSTITUTION`.

Regras:

- `ORIGINAL` inicia em versão 1;
- qualquer tipo posterior aponta para a versão que substitui/complementa;
- o motivo é obrigatório e classificado;
- o snapshot novo é completo, não apenas diff;
- o diff pode ser calculado para apresentação, mas não é a fonte;
- assinaturas anteriores permanecem associadas à versão antiga;
- a versão antiga continua exportável e visível;
- a versão corrente é somente o head;
- void funcional é evento e versão substituta, nunca delete;
- reconstituição não apaga a lacuna nem se apresenta como original sem marcação.

## 14. Eventos append-only e integridade

O Schema V1 garante integridade técnica por:

- snapshot determinístico e versionado;
- tamanho e schema explícitos;
- evidência recalculável por perfil;
- vínculo explícito entre versões;
- eventos sequenciais por agregado;
- imutabilidade em banco;
- manifesto de artefatos;
- exportação ordenada e verificável;
- backup e restore com validação de domínio.

Ele não declara que:

- um digest isolado equivale a assinatura;
- uma cadeia hash tenant-wide é obrigatória;
- SHA-256 é o método regulatório definitivo;
- timestamp do servidor ou do dispositivo é trusted timestamp;
- o ledger substitui assinatura, backup ou autorização.

A tabela de evidências permite que, após FOP 200, sejam acrescentados:

- digest técnico;
- assinatura eletrônica;
- assinatura digital;
- certificado;
- trusted timestamp;
- chain anchor;
- prova externa;
- verificação independente.

Isso ocorre por novos registros e provider, sem alterar os snapshots históricos.

## 15. Índices mínimos

Os índices devem refletir os acessos comprovados, com tenant como coluna mais à esquerda.

Obrigatórios no Schema V1:

- scope por tenant, aeronave e estado;
- volume por tenant, aeronave e estado;
- volume por tenant e número;
- termo por tenant, volume e tipo;
- record por tenant, aeronave, data operacional e ID;
- record por tenant, volume e sequência;
- version por tenant, record e número;
- head por tenant e record;
- leg index por tenant, aeronave, data e ID;
- leg index por tenant, volume, sequência e ID;
- source por tenant, version e caminho;
- event por tenant, agregado, sequência;
- event por tenant, tipo e instante;
- command receipt por tenant, tipo e chave;
- integrity evidence por tenant, alvo, perfil e versão.

Consultas de período usarão keyset determinístico, por exemplo:

```text
empresa_id + aircraft_identity_key + operational_date_utc + record_id
```

Não usar offset em exportações volumosas. Não criar índice para toda coluna: D1 cobra e mantém cada índice durante writes, e o banco é serial.

## 16. Matrícula, operador e proprietário

### 16.1 Mudança de matrícula

Decisão fechada:

- encerra o volume vigente;
- cria volume sucessor;
- mantém serial e identidade estável da aeronave;
- preserva matrícula antiga em todos os snapshots;
- nunca atualiza registros históricos;
- registra motivo e vínculo de sucessão.

### 16.2 Mudança de operador

Decisão fechada:

- registros nunca mudam de `empresa_id`;
- o operador anterior preserva seu acervo e exporta o pacote aplicável;
- o novo operador cria novo scope e novo volume;
- transferência/reconstituição mantém vínculo de cadeia de custódia;
- não existe FK cross-tenant;
- acesso temporário não equivale a transferência de propriedade dos dados.

### 16.3 Mudança de proprietário

Decisão técnica:

- o snapshot antigo permanece;
- evento de transferência e pacote de acervo são obrigatórios;
- o modelo suporta fechar e abrir volume sucessor sem alteração do histórico.

Pendente de FOP 200:

- se mudança apenas de proprietário, com mesmo operador e matrícula, exige sempre novo volume ou pode ser tratada por termo/addendum específico. Até decisão, o comportamento seguro é fechar e abrir volume sucessor.

## 17. Fiscalização por aeronave, volume e período

A consulta regulatória deve:

- começar por `empresa_id` e um escopo autorizado;
- aceitar aeronave, serial, matrícula histórica, volume e período;
- retornar ordem cronológica estável;
- mostrar todas as versões e indicar a corrente;
- mostrar original e correções;
- incluir termos, eventos e evidências relevantes;
- nunca depender de `cv_*`;
- usar índice estruturado, não filtro de JSON;
- paginar por cursor;
- registrar o acesso somente no ledger regulatório quando a política exigir;
- gerar exportação fechada e auditada.

O método de acesso do fiscal — usuário temporário, exportação, acesso direto ou combinação — permanece pendente de FOP 200. O schema suporta todos porque o escopo é explícito e a exportação é autossuficiente.

## 18. Matriz D1 × R2

| Conteúdo | D1 | R2 | Fonte autoritativa | Observação |
|---|---:|---:|---|---|
| Scope regulatório | Sim | Não | D1 | Estado por operador/aeronave |
| Volume | Sim | Não | D1 | Identidade e sucessão |
| Termos | Sim | Opcional em pacote | D1 | Snapshot imutável |
| Rascunho | Sim | Não | D1 | Não oficial |
| Procedência | Sim | Opcional em export | D1 | Sem FK mutável |
| Record root | Sim | Não | D1 | Identidade lógica |
| Versão canônica | Sim | Cópia opcional | D1 | Pequena e transacional |
| Projeção de etapas | Sim | Não | D1 | Fiscalização/indexação |
| Evidência de integridade | Sim | Binário opcional | D1 + bytes R2 | Perfil versionado |
| Eventos | Sim | Cópia em export | D1 | Append-only |
| Anexo | Metadados | Sim | R2 bytes + D1 metadados | Nunca base64 no D1 |
| Envelope de assinatura | Metadados | Sim, se binário | Conforme provider | Fase posterior |
| PDF | Metadados | Sim | Não é fonte primária | Renderização |
| Exportação | Controle/manifesto | Sim | Pacote verificável | Fase posterior |
| Reconstituição | Caso/resultado | Sim | D1 + pacote | Cadeia de custódia |
| Backup D1 | Catálogo/evidência | Sim ou storage externo | Backup validado | Fora do bucket operacional |
| Backup R2 | Manifesto | Cópia independente | Cópia validada | Mesmo bucket é insuficiente |

## 19. Consistência D1 × R2

D1 e R2 não compartilham transação.

Fluxo de artifact futuro:

1. gerar chave imutável;
2. escrever objeto R2;
3. reler e validar tamanho/checksum;
4. inserir metadado D1 em estado `VERIFIED_PENDING_LINK`;
5. associar à versão em transação D1;
6. registrar evento;
7. aplicar retenção conforme política.

Falhas:

- R2 falhou: nenhum vínculo D1;
- R2 venceu e D1 falhou: objeto órfão retido, listado por reconciliador;
- D1 aponta para objeto ausente: integridade falha e bloqueia seal/export;
- tentativa de escrever mesma chave: erro; nunca last-writer-wins;
- objeto corrompido ou divergente: novo objeto/chave, nunca overwrite.

## 20. Plano da futura migration local

No SHA-base deste ADR, `0455` está livre. O número deve ser confirmado novamente quando a PR de implementação começar.

Artefatos esperados, sem criá-los nesta frente:

1. migration local aditiva, sugerida como `0455_edb_regulated_schema_v1_shadow`;
2. arquivo espelho byte a byte em `worker-airtrust/schema-v2/changes/`;
3. rollback/neutralização documentado;
4. manifesto Schema V2 com `baseline_id`, `change_id`, arquivo, hash e plano;
5. plano operacional em `docs/ops/`;
6. validação read-only pós-condição;
7. testes de schema/migration;
8. eventual atualização de contrato de schema, se o contrato ativo abranger as novas tabelas;
9. inclusão em mecanismo de staging somente em PR/gate posterior autorizado.

Sequência local:

1. confirmar o novo `origin/main` e próximo número;
2. gerar banco local limpo com mecanismo canônico;
3. aplicar toda a cadeia suportada;
4. aplicar a migration eDB uma vez;
5. repetir a execução e comprovar bloqueio/idempotência pelo ledger, não por DDL solto;
6. verificar tabelas, FKs, índices, triggers e ausência de DML;
7. executar cenários negativos;
8. executar upgrade sobre fixture/baseline local representativo;
9. testar neutralização sem dados;
10. testar rollback lógico com dados;
11. construir bundle Schema V2;
12. validar hashes do arquivo e plano;
13. comprovar que Worker anterior ignora o schema inerte;
14. manter `shadow` como único estado inicial.

A migration não deve:

- tocar `cv_*`;
- alterar migrations antigas;
- editar `d1_migrations`;
- criar usuário, dado real ou backfill;
- ativar rota;
- criar assinatura;
- escrever em R2;
- alterar workflow;
- ser aplicada em staging ou produção na mesma PR.

## 21. Compatibilidade com Schema V2 e ledger

A futura mudança deve usar o mecanismo atual:

- baseline ativo identificado;
- `change_id` estável;
- hash do arquivo;
- hash do plano;
- SHA exato do GitHub;
- precheck de contrato;
- verificação de mudança ainda não aplicada;
- aplicação atômica do DDL revisado com linha de ledger;
- postcheck de contrato e pós-condições.

Regras específicas do eDB:

- o catálogo de tabelas reguladas e invariantes deve fazer parte do plano;
- pós-condição verifica triggers de no-delete e no-update;
- tentativa proibida deve falhar em banco descartável;
- restore drill deve confirmar que triggers sobrevivem;
- qualquer migration futura que recrie tabela regulada exige revisão explícita deste ADR;
- não se limpa histórico de migrations nem se reaplica cadeia antiga;
- rollback com dados é lógico e por roll-forward; o ledger nunca é editado manualmente para fingir que uma mudança não ocorreu.

## 22. Plano de testes

### 22.1 Migration

- banco limpo;
- upgrade a partir do baseline suportado;
- aplicação única;
- bundle e ledger;
- ausência de DML;
- Worker antigo compatível;
- triggers e FKs presentes após restore.

### 22.2 Tenant isolation

- scope A não aceita volume B;
- volume A não aceita record B;
- record A não aceita version B;
- predecessor cross-tenant negado;
- head cross-tenant negado;
- source cross-tenant negado;
- export cross-tenant negado;
- `empresa_id` não pode ser alterado.

### 22.3 Volumes

- somente um aberto;
- termo de abertura único;
- encerramento único;
- registro em volume encerrado negado;
- reabertura negada;
- mudança de matrícula cria sucessor;
- operador novo não recebe rows do tenant anterior;
- sequência concorrente não duplica.

### 22.4 Snapshot e procedência

- alteração de `cv_*` após congelamento não muda versão;
- fonte apagada não impede leitura;
- conflito resolvido fica registrado;
- payload não contém PII proibida, segredo ou URL assinada;
- tamanho acima do limite falha;
- canonicalização produz bytes estáveis em vetores históricos.

### 22.5 Versionamento

- versão original;
- correção completa;
- addendum;
- reconstituição;
- motivo obrigatório;
- predecessor inválido negado;
- duas versões concorrentes: apenas um head;
- retry idempotente retorna o mesmo resultado;
- mesma chave com payload diferente falha;
- versão e eventos não aceitam update/delete.

### 22.6 Fiscalização e índices

- período;
- matrícula histórica;
- serial;
- volume;
- original + correções;
- paginação keyset sem duplicação ou lacuna;
- análise de query plan usa índice;
- volumes grandes não usam offset nem varredura JSON.

### 22.7 Integridade

- recomputar evidência técnica;
- detectar mudança de payload;
- detectar artifact ausente ou alterado;
- detectar predecessor incorreto;
- verificar perfil antigo após nova versão de algoritmo;
- não rotular perfil shadow como método regulatório.

### 22.8 D1/R2

- upload vence e D1 falha;
- D1 referencia objeto ausente;
- retry tenta mesma chave;
- checksum diverge;
- objeto órfão é reconciliado;
- bucket/prefix errado é negado;
- indisponibilidade de R2 não altera snapshot D1.

### 22.9 Backup e reconstituição

- export D1;
- restore em ambiente descartável;
- integridade SQLite;
- FKs e triggers;
- contagens e invariantes;
- evidências por versão;
- inventário/checksum R2;
- pacote exportado verificável;
- reconstituição mantém original/correções;
- tenant e período completos.

## 23. Plano de backup, retenção e restore

### 23.1 Estado atual comprovado

O repositório possui:

- Time Travel capturado no workflow Schema V2;
- workflow de exportação D1 em janela de manutenção;
- restore do dump em SQLite descartável;
- `integrity_check`;
- backup modular da aplicação para R2;
- manifesto determinístico com SHA-256 dos artefatos;
- cópia de objetos R2 em backup completo.

Lacunas para eDB regulado:

- o drill atual não valida domínio eDB;
- não restaura em D1 descartável;
- não valida D1 e R2 como conjunto;
- o backup de objetos fica no mesmo bucket;
- a retenção configurada no orchestrator não prova bucket lock;
- o export da aplicação usa `SELECT * ... WHERE deleted_at IS NULL`, incompatível com tabelas reguladas sem delete funcional e com schema heterogêneo;
- não existe restore regulatório testado;
- Time Travel cobre apenas janela curta;
- o relatório de drill retido por 30 dias não é o acervo.

### 23.2 Estratégia exigida

Antes de schema apply:

- SHA exato;
- Time Travel bookmark/timestamp;
- backup completo validado;
- manifesto e hash;
- plano de neutralização;
- janela e abort criteria.

Para operação regulada:

- export periódico D1 para retenção acima de 30 dias;
- cópia em bucket/conta de backup separada ou storage independente;
- bucket lock conforme política aprovada;
- inventário R2 com checksum de cada objeto;
- pacote de schema/canonicalizadores necessário para verificação histórica;
- teste de restore em ambiente descartável;
- validação de domínio após import;
- relatório sanitizado, sem dados reais;
- RPO/RTO definidos pelo operador e aceitos no processo aplicável.

### 23.3 Ordem de restore

1. preservar evidências do incidente;
2. selecionar ponto de recuperação autorizado;
3. restaurar/copiar artifacts R2 para área isolada;
4. validar inventário, tamanho e checksum;
5. restaurar D1 em ambiente descartável;
6. validar integridade SQLite, FKs, triggers e ledger de schema;
7. validar volumes, termos, heads, versões, eventos e evidências;
8. validar referências D1→R2;
9. gerar relatório de diferenças;
10. somente então decidir cutover controlado;
11. manter banco/pacote anterior até encerramento formal.

Time Travel é recurso de incidente, não política de retenção nem rollback funcional cotidiano.

## 24. Rollback lógico

### 24.1 Antes de qualquer dado

Se a migration aditiva falhar antes de criar dados:

- parar;
- usar Time Travel ou rollback Schema V2 aprovado;
- confirmar ledger e schema;
- não prosseguir com ativação.

### 24.2 Depois de existir dado shadow

- desabilitar criação de novos rascunhos/registros;
- preservar todas as tabelas e objetos;
- reverter Worker para versão que ignora o schema;
- registrar suspensão;
- corrigir por nova mudança aditiva;
- não remover tabelas, triggers ou ledger;
- não apagar artifacts órfãos até reconciliação.

### 24.3 Depois de existir dado oficial

- não existe rollback físico normal;
- suspender o escopo conforme procedimento;
- manter acesso de leitura/exportação;
- corrigir por nova versão/migration roll-forward;
- envolver operador, segurança e regulatório;
- usar restore somente para corrupção/perda e com cadeia de custódia;
- nenhum retorno ao papel ou descontinuidade sem procedimento autorizado.

## 25. Riscos bloqueadores

### Bloqueiam a PR de migration

1. ADR de fronteira ainda não formalmente aceito.
2. Ausência de decisão sobre se o Schema V1 pode ser implementado antes da orientação arquitetural da ANAC.
3. Conflito não resolvido entre este desenho e qualquer PR paralela que toque o mesmo schema.
4. Falta de caminho Schema V2 completo para as novas tabelas.
5. Impossibilidade de testar FKs/triggers/concorrência em D1 local.
6. Tentativa de incluir assinatura, offline, provider ou ativação oficial na mesma PR.

### Não bloqueiam o Schema V1 inerte, mas bloqueiam staging regulado/official

- volumes reais do primeiro operador;
- escolha do provider de assinatura;
- método regulatório de integridade;
- PWA/nativo/PED;
- forma de fiscalização;
- política final de retenção e bucket lock;
- RPO/RTO;
- topologia D1 compartilhado versus dedicado;
- entidade avaliadora;
- manuais reais;
- ato autorizativo e matrículas.

## 26. Decisões que aguardam FOP 200

| Tema | Decisão aberta | Efeito no schema |
|---|---|---|
| Aplicabilidade da Portaria 3.220 | extensão dos requisitos após Res. 773 | parâmetros, não modelo base |
| Método de conformidade | alternativa aceita para o SaaS | perfil de evidência |
| Assinatura PIC | método individual aceito | tabelas/provider posteriores |
| Assinatura do operador | certificado institucional e automação | assinatura/exportação |
| Offline | instante jurídico e assinatura sem rede | devices/sync/signature |
| PED | PWA, nativo ou híbrido | arquitetura do cliente, não Schema V1 |
| Fiscalização | usuário, export ou acesso direto | autorização/export, modelo já suporta |
| Change control | quais deltas exigem novo ateste | release governance |
| Ateste multi-tenant | software comum e EO por operador | scope e evidências |
| Shadow mode | aceitação e duração | critério de saída |
| Frota | delimitação de matrículas | activation/cutover |
| Proprietário | novo volume obrigatório em toda troca | regra operacional sobre modelo existente |
| Compartilhamento | schema/API do art. 15 | fora da primeira versão |

Nenhuma dessas decisões exige substituir volumes, records, versions, snapshots, heads, sources, events ou evidences.

## 27. Critério de prontidão para a PR separada de Schema V1

A PR poderá começar quando:

- este ADR tiver revisão e aceite internos;
- issue #689 registrar que a revisão D1/R2 foi concluída;
- não houver frente concorrente no mesmo schema;
- a orientação mínima necessária estiver registrada ou o escopo `shadow` inerte for expressamente liberado;
- número da migration for reconfirmado;
- plano Schema V2 estiver definido;
- testes locais forem executáveis;
- nenhuma ativação, backfill ou dado real fizer parte da PR.

A PR estará concluída quando:

- migration local aditiva passar;
- bundle Schema V2 e ledger passarem;
- invariantes tenant/imutabilidade/concorrência passarem;
- rollback lógico estiver testado;
- Worker anterior continuar compatível;
- CI estiver verde;
- nenhuma aplicação remota tiver sido realizada.

## 28. Decisões rejeitadas

- tornar `cv_*` fonte oficial após assinatura;
- guardar apenas IDs de cadastros mutáveis;
- PDF como registro primário;
- payload binário/base64 em D1;
- R2 como única fonte do registro;
- overwrite de objeto R2;
- soft delete de registro regulado;
- `ON DELETE CASCADE`;
- mover acervo entre tenants por `UPDATE empresa_id`;
- uma flag oficial apenas por tenant;
- cadeia hash global por tenant no V1;
- escolher provider/algoritmo como método ANAC nesta frente;
- usar `audit_events_v2` como ledger regulatório;
- alterar migrations históricas;
- usar Time Travel como retenção de longo prazo;
- considerar backup no mesmo bucket uma cópia independente.

## 29. Próximos passos permitidos

1. revisão independente única deste delta documental;
2. registrar a conclusão na issue #689;
3. manter a futura PR `feat/edb-regulated-records-schema-v1-20260802` bloqueada;
4. após gates, implementar a migration em PR separada.

## 30. Referências técnicas

Repositório:

- `CLAUDE.md`
- `TECHNICAL_DEBT.md`
- `docs/regulatory/edb/README.md`
- `docs/regulatory/edb/ADR_EDB_REGULATED_RECORDS_BOUNDARY_20260802.md`
- `docs/regulatory/edb/ANAC_EDB_IMPLEMENTATION_PLAN_20260802.md`
- `docs/regulatory/edb/ANAC_EDB_REGULATORY_BASELINE_20260802.md`
- `docs/regulatory/edb/fop200/DECISION_REGISTER.csv`
- `docs/ADR_REGULATED_RECORDS_CORE_PHYSICAL_DESIGN.md`
- `docs/ANAC_RECORDS_CORE_DESIGN_REVIEW.md`
- `worker-airtrust/schema-v2/bootstrap/0000_initialize_schema_ledger_v2.sql`
- `.github/workflows/apply-schema-change-v2.yml`
- `.github/workflows/d1-production-backup-restore-drill.yml`
- `worker-airtrust/src/services/backup/orchestrator.ts`

Cloudflare:

- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/d1/reference/faq/
- https://developers.cloudflare.com/d1/reference/time-travel/
- https://developers.cloudflare.com/d1/sql-api/foreign-keys/
- https://developers.cloudflare.com/d1/best-practices/use-indexes/
- https://developers.cloudflare.com/d1/best-practices/retry-queries/
- https://developers.cloudflare.com/r2/platform/limits/
- https://developers.cloudflare.com/r2/reference/consistency/
- https://developers.cloudflare.com/r2/reference/durability/
- https://developers.cloudflare.com/r2/buckets/bucket-locks/
