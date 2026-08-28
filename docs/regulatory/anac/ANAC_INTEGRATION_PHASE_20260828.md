# AirTrust — fase de integração ANAC / Operações de Voo / eDB

**Data:** 2026-08-28  
**Status:** implementação em andamento; sem deploy; sem transmissão regulada à ANAC

## 1. Direção

O AirTrust deve evoluir para um núcleo integrado de Operações de Voo no qual os mesmos fatos operacionais alimentem, com regras de autoridade e rastreabilidade distintas:

`Planejamento -> tripulação -> conformidade -> voo/etapas -> RDV -> eDB -> CIV/ANAC -> FRMS -> manutenção`

O Diário de Bordo não deve nascer como cadastro paralelo. O Controle de Voos existente é a fonte operacional inicial; o eDB é uma projeção regulatória controlada e, futuramente, assinada.

## 2. O que já existe no repositório e deve ser preservado

A frente eDB não começa do zero. A `main` já contém:

- contrato `edb.draft.v1` estritamente não oficial;
- projeção de Controle de Voos para rascunho eDB;
- preview tenant-scoped somente leitura;
- avaliação de completude/divergências;
- evidência de revisão shadow;
- contratos preliminares de situação técnica;
- gate de piloto em staging;
- blueprint, matriz regulatória, plano de submissão, conceito offline/PED, threat model de assinatura e protocolo de piloto.

Essas peças continuam sendo a base. Nenhuma delas autoriza substituir o diário oficial em papel ou transmitir dados como registro oficial.

## 3. Marco regulatório corrente

A Resolução ANAC nº 773/2025, vigente desde 01/01/2026, é a referência específica atual para Diário de Bordo. A Resolução nº 458/2017 continua relevante para uso de sistemas informatizados em substituição a registros obrigatórios em papel.

O desenho separa:

1. **fato operacional** — informação produzida pelo Controle de Voos/SIGVOOS;
2. **rascunho regulatório** — projeção eDB ainda revisável e sem efeito oficial;
3. **registro regulado** — somente depois de integridade, assinatura, versionamento, retenção e autorizações aplicáveis;
4. **transmissão ANAC** — somente contra contrato oficial vigente e ambiente/credenciais autorizados.

## 4. ANAC Integration Layer — dados públicos

A ANAC publica conjuntos oficiais que podem ser consumidos sem credencial privilegiada. O catálogo versionado desta fase inclui:

1. RAB;
2. aeródromos públicos;
3. aeródromos privados, helipontos e helidecks;
4. organizações de manutenção RBAC 145.

Política geral: `MINIMIZED_PROJECTION_ONLY`. A disponibilidade pública de um campo não significa que ele deve ser copiado para o AirTrust.

## 5. RAB — sincronização automática

Fonte oficial JSON:

`https://sistemas.anac.gov.br/dadosabertos/Aeronaves/RAB/dados_aeronaves.json`

Metadados oficiais:

`https://www.anac.gov.br/acesso-a-informacao/dados-abertos/areas-de-atuacao/aeronaves/registro-aeronautico-brasileiro/5-registro-aeronautico-brasileiro`

Periodicidade declarada pela ANAC: mensal. O AirTrust verifica diariamente porque o custo de uma verificação condicional é baixo e isso evita depender da data exata de publicação da Agência.

### 5.1 Fluxo de atualização

O Worker reutiliza o cron diário já existente de `0 8 * * *` (UTC). Não foi criado um novo Cron Trigger.

Fluxo:

`ANAC -> conditional GET -> limite de tamanho -> SHA-256 -> JSON/contagem -> normalização -> recorte da frota AirTrust -> snapshot minimizado -> promoção`.

Quando disponíveis, `ETag` e `Last-Modified` são armazenados e enviados como `If-None-Match` / `If-Modified-Since`.

Resultados possíveis:

- `NOT_MODIFIED` — ANAC respondeu HTTP 304; nada é reprocessado;
- `UNCHANGED` — resposta 200, mas SHA-256 idêntico ao snapshot ativo;
- `PROMOTED` — conteúdo novo passou por todas as validações;
- `FAILED` — qualquer falha mantém o snapshot anterior como versão ativa.

### 5.2 Proteção contra fonte ruim/truncada

Uma nova versão não é promovida se:

- não for JSON válido;
- a raiz não tiver coleção reconhecível de registros;
- vier com quantidade de registros implausivelmente pequena;
- houver queda muito grande em relação à última versão aceita;
- a taxa de linhas rejeitadas ultrapassar o limite de segurança;
- o payload exceder o limite de memória configurado;
- a gravação do snapshot/cache falhar.

Ou seja: indisponibilidade ou erro de publicação da ANAC não substitui a última versão válida do AirTrust.

### 5.3 Minimização e privacidade

O arquivo completo do RAB é processado em memória para validação/hash e localização das aeronaves relevantes, mas não é persistido integralmente.

O AirTrust não guarda, por padrão:

- CPF/CNPJ de proprietário/operador;
- nomes e endereços de terceiros sem necessidade operacional;
- gravames e textos livres não necessários.

Em R2 fica somente um snapshot minimizado, com provenance da fonte e os dados normalizados das aeronaves que já pertencem à frota cadastrada no AirTrust.

### 5.4 Schema V2 0476

A sincronização adiciona somente tabelas novas:

- `anac_public_sync_state` — estado corrente da fonte, hash ativo, ETag/Last-Modified, freshness e falhas;
- `anac_public_sync_runs` — histórico append-only das execuções;
- `anac_rab_aircraft_cache` — projeção RAB minimizada e tenant-scoped para aeronaves já cadastradas.

A tabela `aeronaves` não é sobrescrita pela sincronização.

### 5.5 Rollout

O comportamento é fail-closed:

- development/staging: sincronização habilitada por padrão depois da aplicação da 0476;
- production: desabilitada por padrão;
- produção só é ativada com `ANAC_PUBLIC_SYNC_ENABLED=true` em mudança de configuração revisada depois de evidência de staging.

Critério mínimo de staging antes de produção:

1. um `PROMOTED` válido;
2. um segundo ciclo `NOT_MODIFIED` ou `UNCHANGED`;
3. validação de isolamento por tenant;
4. validação de snapshot minimizado em R2;
5. teste de falha mantendo o snapshot anterior.

## 6. Reconciliação AirTrust x RAB

A comparação permanece somente leitura e retorna `canAutoApply: false`.

Estados previstos para UI:

- match;
- valor AirTrust ausente;
- valor ANAC ausente;
- divergência para revisão humana;
- matrícula não encontrada no RAB;
- matrícula local inválida;
- situação de aeronavegabilidade que exige atenção operacional.

Nenhuma sincronização pública, por si só, autoriza alterar silenciosamente o cadastro do operador ou liberar/bloquear um voo.

## 7. Aeródromos, helipontos, helidecks e RBAC 145

Essas fontes já estão catalogadas, mas ainda não receberam um resolvedor automático frágil baseado em scraping de diretório.

O mesmo motor de `sync_state -> validação -> hash -> promoção -> fallback` será reutilizado. Cada fonte só será ativada quando o AirTrust conseguir identificar de forma determinística o artefato oficial corrente.

Para operação offshore, a base privada da ANAC é prioritária porque inclui helipontos e helidecks.

## 8. eDB — endurecimento antes de qualquer promoção

A projeção eDB atual é útil como shadow mode, mas três semânticas precisam de decisão explícita antes de uso regulado:

1. `cv_voo_etapas.starts -> cycles`;
2. `cv_voo_etapas.tempo_ifr -> IFR actual`, enquanto o contrato separa IFR real e simulado;
3. `cv_rdv_operacional.divergencias -> technicalDiscrepancySummary` sem fluxo estruturado de manutenção/RTS.

Esses pontos permanecem bloqueadores de promoção regulatória, não de testes shadow.

## 9. API de Diário de Bordo da ANAC

Ambiente publicado:

`https://homologacao-api-diariodebordo.anac.gov.br/api/docs/index.html`

O Swagger público está sem contrato OpenAPI utilizável no momento. O AirTrust não deve adivinhar endpoint ou DTO.

Próximo gate externo:

1. credencial temporária de homologação;
2. OpenAPI/Swagger vigente;
3. guia atual da API DBE;
4. regras atuais de vinculação de aeronave/operador e assinatura;
5. implementação isolada em `integrations/anac/edb`;
6. idempotência/outbox/recibo/reconciliação;
7. teste somente em sandbox até autorização de cutover.

## 10. CHT/CMA

Permanece frente administrativa separada. Não fazer scraping da consulta pública. Até existir mecanismo autorizado, o AirTrust pode registrar evidência de verificação assistida, mas não deve simular uma integração inexistente.

## 11. Sequência atual

1. catálogo ANAC + normalizador RAB — implementado na branch;
2. comparação read-only AirTrust x RAB — implementada na branch;
3. Schema V2 0476 + sincronização RAB automática/fallback — implementados na branch, aguardando gates;
4. aplicar 0476 somente em staging pelo fluxo governado;
5. colher evidência de dois ciclos de sync;
6. expor status RAB na tela de aeronaves/Controle de Voos;
7. resolver artefatos oficiais de aeródromos/helidecks e RBAC 145;
8. obter credencial/OpenAPI do eDB;
9. adapter eDB sandbox;
10. assinatura/imutabilidade/volumes/offline e pacote de conformidade;
11. somente depois, submissão/cutover regulatório.

## 12. Não autorizações

Esta fase não autoriza por si só:

- migration remota;
- ativação da sincronização RAB em produção;
- sobrescrita automática de `aeronaves`;
- assinatura oficial de eDB;
- substituição de diário aprovado;
- transmissão eDB à ANAC;
- scraping ou acesso não autorizado a CHT/CMA;
- promoção do Records Core experimental.
