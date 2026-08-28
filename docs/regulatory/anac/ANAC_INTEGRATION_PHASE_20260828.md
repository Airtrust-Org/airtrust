# AirTrust — fase de integração ANAC / Operações de Voo / eDB

**Data:** 2026-08-28  
**Status:** implementação em andamento; sem deploy; sem transmissão regulada à ANAC

## 1. Direção

O AirTrust deve evoluir para um núcleo integrado de Operações de Voo no qual os mesmos fatos operacionais alimentem, com regras de autoridade e rastreabilidade distintas:

`Planejamento -> tripulação -> conformidade -> voo/etapas -> RDV -> eDB -> CIV/ANAC -> FRMS -> manutenção`

O Diário de Bordo não deve nascer como cadastro paralelo. O Controle de Voos existente é a fonte operacional inicial; o eDB é uma projeção regulatória controlada e, futuramente, assinada.

## 2. O que já existe no repositório e deve ser preservado

A frente eDB não começa do zero. A `main` já contém contrato `edb.draft.v1`, projeção de Controle de Voos para rascunho eDB, preview tenant-scoped, avaliação de completude/divergências, evidência de revisão shadow, contratos preliminares de situação técnica e gate de piloto em staging.

Essas peças continuam sendo a base. Nenhuma delas autoriza substituir o diário oficial em papel ou transmitir dados como registro oficial.

## 3. Marco regulatório corrente

A Resolução ANAC nº 773/2025, vigente desde 01/01/2026, é a referência específica atual para Diário de Bordo. A Resolução nº 458/2017 continua relevante para uso de sistemas informatizados em substituição a registros obrigatórios em papel.

O desenho separa fato operacional, rascunho regulatório, registro regulado e transmissão ANAC.

## 4. ANAC Integration Layer — dados públicos

A ANAC publica conjuntos oficiais que podem ser consumidos sem credencial privilegiada. O catálogo versionado desta fase inclui RAB, aeródromos públicos, aeródromos privados/helipontos/helidecks e organizações de manutenção RBAC 145.

Política geral: `MINIMIZED_PROJECTION_ONLY`. A disponibilidade pública de um campo não significa que ele deve ser copiado para o AirTrust.

## 5. RAB — sincronização automática

Fonte oficial JSON:

`https://sistemas.anac.gov.br/dadosabertos/Aeronaves/RAB/dados_aeronaves.json`

Metadados oficiais:

`https://www.anac.gov.br/acesso-a-informacao/dados-abertos/areas-de-atuacao/aeronaves/registro-aeronautico-brasileiro/5-registro-aeronautico-brasileiro`

Periodicidade declarada pela ANAC: mensal. O AirTrust verifica diariamente porque uma verificação condicional é barata e não depende da data exata de publicação da Agência.

### 5.1 Fluxo de atualização

O Worker reutiliza o cron diário já existente de `0 8 * * *` UTC. Não foi criado novo Cron Trigger.

`ANAC -> conditional GET -> limite de tamanho -> SHA-256 -> JSON/contagem -> normalização -> recorte da frota AirTrust -> snapshot minimizado -> promoção`.

Quando disponíveis, `ETag` e `Last-Modified` são armazenados e enviados como `If-None-Match` / `If-Modified-Since`.

Resultados:

- `NOT_MODIFIED` — HTTP 304;
- `UNCHANGED` — HTTP 200 com SHA-256 idêntico;
- `PROMOTED` — conteúdo novo aprovado em todas as validações;
- `FAILED` — falha preserva a última versão válida.

### 5.2 Proteção contra fonte ruim/truncada

Uma nova versão não é promovida se não for JSON válido, tiver raiz inválida, quantidade implausível de registros, queda excessiva frente à versão anterior, taxa de rejeição alta, payload acima do limite ou falha de persistência.

### 5.3 Minimização e privacidade

O RAB completo é processado em memória para hash e localização das aeronaves relevantes, mas não é persistido integralmente.

O AirTrust não guarda por padrão CPF/CNPJ de proprietário/operador, nomes/endereço de terceiros e gravames/textos livres sem necessidade operacional.

Em R2 fica somente um snapshot minimizado com provenance da fonte e dados normalizados das aeronaves que já pertencem à frota cadastrada.

### 5.4 Schema V2 0476

A sincronização adiciona somente:

- `anac_public_sync_state` — hash ativo, ETag/Last-Modified, freshness e falhas;
- `anac_public_sync_runs` — histórico append-only;
- `anac_rab_aircraft_cache` — projeção RAB minimizada tenant-scoped.

`aeronaves` nunca é sobrescrita automaticamente.

### 5.5 Rollout

- development/staging: sincronização habilitada por padrão depois da 0476;
- production: desabilitada por padrão;
- produção só é ativada com `ANAC_PUBLIC_SYNC_ENABLED=true` em mudança revisada depois de evidência de staging.

Critério mínimo antes de produção: um `PROMOTED`, um ciclo repetido `NOT_MODIFIED`/`UNCHANGED`, isolamento por tenant, snapshot minimizado verificado e teste de falha mantendo o snapshot anterior.

## 6. Reconciliação AirTrust x RAB

A comparação é somente leitura e retorna `canAutoApply: false`. Estados previstos: match, dado faltante, mismatch, matrícula ausente/inválida e situação de aeronavegabilidade que exige revisão.

Nenhuma sincronização pública autoriza alterar silenciosamente o cadastro do operador ou liberar/bloquear voo por si só.

## 7. Aeródromos, helipontos, helidecks e RBAC 145

Essas fontes já estão catalogadas, mas ainda não receberam resolvedor automático baseado em scraping frágil de diretório.

O mesmo motor de `sync_state -> validação -> hash -> promoção -> fallback` será reutilizado. Cada fonte só será ativada quando o AirTrust identificar de forma determinística o artefato oficial corrente.

## 8. eDB — endurecimento antes de promoção

Três semânticas continuam bloqueadas para decisão explícita antes do uso regulado: `starts -> cycles`, `tempo_ifr -> IFR actual` e `RDV.divergencias -> technicalDiscrepancySummary` sem fluxo estruturado de manutenção/RTS.

## 9. API de Diário de Bordo da ANAC

Ambiente publicado:

`https://homologacao-api-diariodebordo.anac.gov.br/api/docs/index.html`

O AirTrust deve obter credencial temporária, OpenAPI vigente, guia atual, regras de vinculação e assinatura e então implementar adapter isolado com idempotência/outbox/recibo/reconciliação. Não adivinhar endpoints/DTOs.

## 10. CHT/CMA

Permanece frente administrativa separada. Não fazer scraping da consulta pública.

## 11. Sequência atual

1. catálogo ANAC + normalizador RAB — implementado;
2. comparação read-only AirTrust x RAB — implementada;
3. Schema V2 0476 + sincronização automática/fallback — implementados, aguardando gates;
4. aplicar 0476 somente em staging pelo fluxo governado;
5. colher evidência de dois ciclos;
6. expor status RAB na tela de aeronaves/Controle de Voos;
7. resolver artefatos oficiais de aeródromos/helidecks/RBAC 145;
8. obter credencial/OpenAPI do eDB;
9. adapter eDB sandbox;
10. assinatura/imutabilidade/volumes/offline e pacote de conformidade;
11. somente depois, submissão/cutover regulatório.

## 12. Não autorizações

Esta fase não autoriza por si só migration remota, ativação RAB em produção, sobrescrita automática de `aeronaves`, assinatura oficial de eDB, substituição do diário aprovado, transmissão eDB à ANAC, scraping CHT/CMA ou promoção do Records Core experimental.
