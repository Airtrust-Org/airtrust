# Controle de Voos — arquitetura operacional V2

**Data:** 2026-09-21  
**Status:** desenho executável para implementação incremental.  
**Autoridade de runtime:** GitHub `Airtrust-Org/airtrust`, branch `main`.  
**Princípios:** multi-tenant fail-closed, RBAC backend, CAS, auditoria de alterações, offline do piloto, staging antes de produção.

## 1. Objetivo

Transformar o módulo Controle de Voos em uma operação única e orientada por fluxo, reduzindo telas que repetem a mesma lista de voos/RDVs e acrescentando:

1. preenchimento estruturado de plano de voo;
2. revisão obrigatória da Coordenação após envio do piloto, com correção controlada de todos os dados operacionais antes da aprovação;
3. exportação XML diária para Petrobras no contrato observado no arquivo de referência;
4. camada de integração DECEA desacoplada, preparada para o canal oficial autorizado;
5. preservação do Pilot App offline e dos contratos atuais de tenant/RBAC/CAS.

## 2. Consolidação de navegação

A navegação atual expõe separadamente Dashboard, Voos, RDV, Meus voos, Fila da Coordenação, Jornadas, Indisponibilidades, Hangaragem, Relatórios e Cadastros. Voos/RDV/Fila usam essencialmente o mesmo conjunto de voos com ações diferentes, enquanto Indisponibilidades e Hangaragem ainda não são fonte operacional real.

### Navegação V2

- **Operação** — dashboard + programação + situação do voo + RDV em uma visão diária.
- **Meus voos** — experiência do tripulante/Pilot App, incluindo offline.
- **Coordenação** — fila de recebidos, revisão, correção, aprovação e devolução.
- **Relatórios e exportações** — jornadas, indicadores, XML Petrobras e demais saídas.
- **Cadastros** — aeronaves/pontos/tipos/contratos/funções e configurações operacionais.

As rotas antigas permanecem inicialmente como deep links/redirects para evitar quebra de favoritos, testes e integrações. Previews sem fonte real não permanecem como item primário de navegação.

## 3. Fluxo canônico piloto → Coordenação

### 3.1 Estados

`rascunho -> preenchimento_finalizado -> enviado -> em_revisao -> aprovado_coordenacao -> finalizado`

Com caminhos controlados para `devolvido`, `reaberto` e `cancelado`.

### 3.2 Regra operacional

Após o piloto selecionar **Enviar para Coordenação**, o registro fica pendente de aprovação. O piloto não conclui o produto final sozinho.

Na Coordenação, a revisão deve ocorrer em uma única tela contendo:

- dados-base do voo;
- aeronave;
- origem/destino e rota;
- contrato/tipo;
- horários previstos e realizados;
- tripulação;
- etapas/pernas;
- PAX/carga/pesos;
- combustível e abastecimentos;
- ocorrências/justificativas;
- dados do plano de voo;
- campos de integração Petrobras.

A Coordenação pode corrigir esses dados antes da aprovação. Toda correção deve ser tenant-scoped, usar CAS e gerar diff/auditoria. Em vez de exigir uma justificativa por campo, a UI pode solicitar uma justificativa de revisão quando houver qualquer diferença entre o recebido e o aprovado, persistindo o diff de cada campo no histórico.

### 3.3 Backend

- Manter `voos.rdv.corrigir` como capability de Coordenação.
- Estender a revisão para dados do `cv_voos`, tripulação, etapas e abastecimentos, não somente os campos do RDV.
- O backend, não a UI, valida capability, tenant e estado.
- Aprovação deve congelar um snapshot operacional usado pelos exports; edição posterior exige reabertura governada e invalida/regera o snapshot.

## 4. Plano de voo

### 4.1 Produto

Criar uma seção **Plano de voo** dentro do próprio voo, evitando nova tela isolada. O sistema preenche automaticamente tudo que já conhece e pede ao usuário somente dados ausentes.

Fontes automáticas:

- aeronave e características cadastradas;
- origem, destino, pontos de navegação e rota;
- data/horário planejado;
- tripulação;
- POB;
- combustível/autonomia quando disponíveis;
- contrato/tipo de voo;
- observações operacionais reutilizáveis.

Os campos normativos exatos devem seguir o contrato vigente do DECEA/ICA 100-11 e, quando houver integração, o contrato oficial do webservice. Não codificar uma cópia não versionada do formulário.

### 4.2 Modelo proposto

`cv_planos_voo`
- `id`, `empresa_id`, `voo_id`;
- `status` (rascunho/pronto/submetido/aceito/rejeitado/cancelado);
- `versao`;
- payload estruturado versionado;
- `fonte` (AIRTRUST/IMPORTADO_DECEA);
- identificador/protocolo DECEA quando fornecido;
- timestamps de submissão/resposta;
- `created_by`, `updated_by`, timestamps e soft delete.

`cv_plano_voo_eventos`
- histórico de FPL/CHG/DLA/CNL, respostas, protocolo e status, sem armazenar credenciais.

### 4.3 Integração DECEA

Não automatizar login/tela do FPL-BR nem armazenar senha do piloto.

Arquitetura:
`FlightPlanService -> DeceaFlightPlanProvider`

Providers:
- `manual`: monta/valida o plano e entrega conteúdo pronto para conferência/submissão pelo canal oficial;
- `sigma-webservice`: somente quando DECEA fornecer autorização, contrato, endpoint e credenciais corporativas.

A AIC do Centralizador informa webservice para empresas aéreas regulares, com apresentação de mensagens ATS em lote e consulta de status. A elegibilidade da Costa do Sol deve ser confirmada com o administrador do SIGMA/DECEA antes de habilitar esse provider.

A integração nativa EFB -> FPL-BR documentada pelo DECEA demonstra criação de FPL/CHG entre aplicativos do próprio ecossistema DECEA; ela não deve ser presumida como API pública para terceiros.

## 5. XML Petrobras diário

### 5.1 Contrato observado no arquivo de referência

Envelope:
`<?xml version="1.0" encoding="ISO-8859-1"?>`
`<meadinkent> ... <RVE>...</RVE> ... </meadinkent>`

Campos de cada RVE, na ordem observada:
- ITEM
- EQUIPAMENTO
- ATENDIMENTO
- ESCALA
- DESCRICAO_DA_OPERACAO
- GRUPO_DE_CODIGOS
- CODIGO_OPERACAO
- TPAP
- DATA_INICIAL
- HORA_INICIAL
- DATA_FINAL
- HORA_FINAL
- HORAS_VOADAS
- MIN_VOADOS
- HORAS_GLOSADAS_AE
- MIN_GLOSADOS
- TIPO_ABASTECIMENTO
- TIPO_OPERACAO
- TIPO_CARGA
- QTD_ITEM_AVULSO
- OBSERVACOES

Os campos vazios devem continuar presentes; o serializer deve escapar XML e produzir ISO-8859-1.

### 5.2 Sequência observada por atendimento

O exemplo apresenta, para cada atendimento:
1. `OA30 / OPEAE1 / ACIONAMENTO À DECOLAGEM` — motor ligado até decolagem;
2. `PA01 / OPSDUA / DECOLAGEM` — evento instantâneo, final 00:00:00;
3. uma linha `OA08 / OPEAE1 / EM VÔO REGULAR PAX` por etapa realizada;
4. `PA03 / OPSDUA / POUSO` — evento instantâneo, final 00:00:00;
5. `OA31 / OPEAE1 / POUSO AO CORTE` — pouso até corte.

`TPAP` aparece como `AE` no exemplo.

Não assumir que esses códigos são universais para todo contrato/cliente. Devem ficar em configuração versionada de exportação Petrobras.

### 5.3 Lacunas de dados atuais

O schema atual não possui campos canônicos identificados como:
- código Petrobras de `EQUIPAMENTO`;
- número de `ATENDIMENTO`.

Esses valores não devem ser inventados.

Modelo proposto:
- `cv_petrobras_aeronaves`: `empresa_id`, `contrato_id`, `aeronave_id`, `equipamento_codigo`, vigência;
- `cv_petrobras_atendimentos`: `empresa_id`, `voo_id`, `contrato_id`, `numero_atendimento`, snapshot do equipamento, status e timestamps;
- `cv_petrobras_exportacoes`: data operacional, versão, hash do conteúdo, usuário gerador, arquivo/metadata e status.

### 5.4 Regra de geração

- considerar somente voos do tenant/contrato e da data selecionada;
- bloquear export se houver voo enviado ainda não aprovado pela Coordenação;
- usar somente snapshot aprovado, nunca dados mutáveis em edição;
- ordenar cronologicamente e numerar `ITEM` de `0001` em diante;
- gerar uma linha OA30, uma PA01, N OA08 (uma por etapa), uma PA03 e uma OA31 por atendimento;
- calcular `HORAS_VOADAS`/`MIN_VOADOS` pelos intervalos aplicáveis;
- manter vazios os campos que o contrato não preencher, em vez de inventar defaults;
- validar XML antes do download;
- registrar evento de exportação e hash do arquivo.

A primeira entrega é **download XML**. Envio automático à Petrobras só entra após existir especificação/endereço/protocolo de transmissão oficialmente fornecido.

## 6. UI operacional proposta

### Operação
Uma tabela diária única, com filtros e status:
`planejado -> em voo -> pousado -> recebido da tripulação -> em revisão -> aprovado`.

A linha abre um painel/detalhe com abas:
- Programação
- Plano de voo
- Execução/RDV
- Tripulação
- Histórico

### Coordenação
Fila orientada por ação:
- Recebidos;
- Em revisão;
- Devolvidos;
- Prontos para aprovar;
- Aprovados hoje.

Ao abrir um recebido, todos os blocos relevantes ficam editáveis conforme capability. O sistema destaca somente divergências e pendências.

### Relatórios e exportações
- resumo operacional;
- jornadas;
- XML Petrobras;
- histórico de arquivos gerados.

## 7. Implementação incremental

### PR A — simplificação de navegação, sem schema
- reduzir subnav aos cinco núcleos;
- manter rotas antigas como compatibilidade;
- remover previews não operacionais da navegação principal;
- consolidar links para Operação/Coordenação.

### PR B — revisão integral pela Coordenação, sem perder CAS
- unificar edição de voo + RDV + etapas + tripulação na revisão;
- capability backend obrigatória;
- diff/auditoria;
- bloquear aprovação se validações falharem;
- snapshot aprovado.

### PR C — Plano de voo base
- Schema V2 governado;
- formulário inteligente/autopreenchimento;
- validação e histórico;
- provider manual.

### PR D — integração DECEA
- somente após obtenção do contrato/credenciais oficiais;
- implementar provider `sigma-webservice`;
- status/protocolo e mensagens FPL/CHG/DLA/CNL conforme contrato oficial.

### PR E — XML Petrobras
- Schema V2 dos identificadores Petrobras;
- serializer determinístico ISO-8859-1;
- testes fixture/golden;
- preview + validação + download diário;
- RBAC `voos.rdv.exportar_petrobras`;
- auditoria/hash.

## 8. Critérios de aceite

- piloto envia e não consegue aprovar o próprio voo;
- Coordenação consegue corrigir dados operacionais antes de aprovar;
- qualquer correção fica auditável e tenant-scoped;
- telas duplicadas deixam de competir entre si;
- plano de voo reutiliza dados já informados no voo;
- integração DECEA nunca depende de scraping ou senha pessoal armazenada;
- XML Petrobras reproduz ordem, tags, códigos configurados e encoding do contrato observado;
- nenhum XML é gerado com voo ainda pendente de aprovação;
- testes cross-tenant, RBAC, CAS e E2E governado verdes.
