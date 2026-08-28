# AirTrust — fase de integração ANAC / Operações de Voo / eDB

**Data:** 2026-08-28  
**Status:** preparação técnica; sem deploy; sem migração regulada; sem chamada a API privada da ANAC

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

O desenho deve continuar separando:

1. **fato operacional** — informação produzida pelo Controle de Voos/SIGVOOS;
2. **rascunho regulatório** — projeção eDB ainda revisável e sem efeito oficial;
3. **registro regulado** — somente depois de integridade, assinatura, versionamento, retenção e autorizações aplicáveis;
4. **transmissão ANAC** — somente contra contrato oficial vigente e ambiente/credenciais autorizados.

## 4. Primeira frente que pode avançar sem autorização especial

A ANAC publica conjuntos de dados oficiais que podem ser consumidos sem credencial privilegiada. A primeira fundação adicionada nesta fase é o catálogo de fontes e a projeção minimizada do Registro Aeronáutico Brasileiro (RAB).

### 4.1 RAB

Fonte oficial JSON:

`https://sistemas.anac.gov.br/dadosabertos/Aeronaves/RAB/dados_aeronaves.json`

Metadados oficiais:

`https://www.anac.gov.br/acesso-a-informacao/dados-abertos/areas-de-atuacao/aeronaves/registro-aeronautico-brasileiro/5-registro-aeronautico-brasileiro`

Periodicidade declarada pela ANAC: mensal.

Campos imediatamente úteis ao AirTrust incluem matrícula, número de série, categoria, tipo certificado, modelo, fabricante, classe, PMD, tipo ICAO, tripulação mínima, PAX máximo, assentos, ano de fabricação, validade CAV/CA e código de situação de aeronavegabilidade.

A projeção implementada nesta fase **não copia** proprietário, operador, CPF/CNPJ, endereço ou gravames, ainda que esses dados estejam presentes na fonte pública. O princípio é minimização: importar somente o que é necessário para cadastro/validação operacional da aeronave.

Uso futuro previsto:

- preencher/validar cadastro de aeronave por matrícula;
- alertar divergência entre cadastro AirTrust e RAB;
- apoiar snapshot de aeronave do eDB;
- sinalizar situação de aeronavegabilidade para revisão operacional;
- nunca liberar ou bloquear voo exclusivamente pelo dado público sem regra operacional aprovada e registro da data/fonte.

### 4.2 Aeródromos, helipontos e helidecks

A ANAC publica bases de aeródromos públicos e privados em CSV/JSON. A frente seguinte deve normalizar essas bases para um catálogo único de locais operacionais e utilizá-lo em origem/destino do Controle de Voos.

Para operação offshore, a base privada é especialmente relevante porque inclui aeródromos privados, helipontos e helidecks.

### 4.3 Organizações de manutenção RBAC 145

A ANAC publica lista oficial de organizações certificadas, com atualização semanal. A integração pode apoiar validação de organização, situação de certificado e, mais adiante, evidência de manutenção/RTS no ecossistema eDB.

A primeira fonte JSON de organizações está catalogada, mas nenhum dado é persistido nesta fase.

## 5. eDB — próximo endurecimento antes de qualquer promoção

A projeção eDB atual é útil como shadow mode, mas há três semânticas que devem ser confirmadas antes de qualquer uso regulado:

### 5.1 `starts` x `cycles`

O Controle de Voos possui `starts`. O campo eDB requer ciclos. O código atual projeta `starts` em `cycles`; essa equivalência deve permanecer tratada como hipótese até confirmação da definição operacional/técnica e da regra aplicável por aeronave.

### 5.2 `tempo_ifr` x IFR real/simulado

O Controle de Voos possui um campo agregado `tempo_ifr`; o contrato eDB separa IFR real e IFR simulado. Não deve existir promoção regulatória definitiva antes de separar ou comprovar a semântica da origem.

### 5.3 `RDV.divergencias` x discrepância técnica

Texto de divergência operacional no RDV não deve ser considerado automaticamente discrepância técnica regulada. O futuro fluxo precisa de identidade do registrante, classificação, ação de manutenção, diferimento quando aplicável e referência de retorno ao serviço.

Esses itens são bloqueadores para promoção do shadow draft, não para continuar coletando evidência em staging.

## 6. API de Diário de Bordo da ANAC

A infraestrutura pública da ANAC indica ambiente de homologação da API de Diário de Bordo e o Plano de Transformação Digital 2025–2026 registra entrega de integração do diário digital com a infraestrutura da Agência/CIV.

Ambiente publicado:

`https://homologacao-api-diariodebordo.anac.gov.br/api/docs/index.html`

O AirTrust não deve criar chamadas de produção nem cristalizar um payload presumido. Próximo gate externo:

1. obter contrato OpenAPI/Swagger oficial vigente;
2. obter instruções e credenciais de homologação;
3. versionar o contrato no adapter `integrations/anac/edb`;
4. implementar idempotência, recibo, retry seguro e reconciliação;
5. testar somente no ambiente de homologação;
6. ativar transmissão oficial apenas após autorização aplicável.

## 7. CHT/CMA

Permanece uma frente administrativa separada. Não fazer scraping da consulta pública. Até existir mecanismo autorizado, o AirTrust pode registrar evidência de verificação assistida, mas não deve simular uma integração inexistente.

## 8. Arquitetura alvo

### Camada operacional

- `cv_voos`
- `cv_voo_etapas`
- `cv_voo_tripulantes`
- RDV e conflitos de integração
- SIGVOOS

### ANAC Integration Layer

- `public-data` — RAB, aeródromos, RBAC 145 e outras bases abertas;
- `edb` — futura API autenticada de Diário de Bordo;
- `personnel` — futura integração autorizada CHT/CMA;
- adapters versionados por contrato e com provenance explícita.

### Camada regulada eDB

- volumes;
- entries imutáveis/versionadas;
- assinatura PIC;
- contrassinatura operador;
- situação técnica/discrepâncias/RTS;
- pacote offline/PED;
- retenção e exportação de fiscalização;
- outbox/reconciliação ANAC.

Records Core experimental não deve ser promovido por esta frente até os gates próprios de integridade, concorrência, backup/restore e cutover estarem satisfeitos.

## 9. Sequência de execução

1. **RAB foundation** — catálogo oficial + normalizador minimizado + testes. **Iniciado nesta branch.**
2. RAB ingestion/cache tenant-safe + comparação com cadastro de aeronaves, em PR separado.
3. Catálogo ANAC de aeródromos/helipontos/helidecks + normalização.
4. Enriquecimento de origem/destino do Controle de Voos.
5. Corrigir/confirmar semânticas `starts/cycles`, IFR e discrepância técnica no shadow eDB.
6. Fonte estruturada de manutenção/RTS para situação técnica pré-voo.
7. Obter contrato e credenciais do sandbox da API eDB ANAC.
8. Adapter ANAC eDB em homologação, sem efeito oficial.
9. Assinatura/imutabilidade/volumes/offline e pacote de conformidade.
10. Somente depois, submissão/cutover regulatório.

## 10. Regra de segurança desta fase

Nenhuma mudança desta etapa deve:

- escrever registro eDB oficial;
- substituir o diário em papel;
- transmitir dados à ANAC sem credencial e autorização;
- declarar homologação;
- promover migration experimental de Records Core;
- copiar dados pessoais de uma base pública sem necessidade operacional documentada;
- transformar dado operacional em fato regulatório por equivalência presumida.
