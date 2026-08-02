# AirTrust — Blueprint funcional mestre do produto e serviço eDB

> **Data-base:** 2026-08-02 (BRT)  
> **Base de consolidação:** `988d2844073bd3dfdf175b2260fe93eb8e7c7ae6` (`origin/main`)  
> **Status:** blueprint funcional consolidado; capacidades não implementadas permanecem propostas e não representam aprovação, ateste, aceitação ou autorização da ANAC  
> **Natureza:** arquitetura funcional, jornadas, estados, responsabilidades, capacidades e backlog  
> **Escopo:** Diário de Bordo Digital para operadores, com aplicação inicial planejada a operador RBAC 135

## 1. Finalidade

Este documento consolida a visão funcional de ponta a ponta do Diário de Bordo Digital — eDB — e do serviço profissional necessário para implantá-lo.

O blueprint organiza, em uma única referência:

- atores e responsabilidades;
- fronteiras entre Controle de Voos, rascunho e registro regulado;
- estados e transições;
- jornadas operacionais;
- regras de negócio e bloqueios;
- permissões conceituais;
- superfícies de produto;
- capacidades de aplicação e integração;
- eventos e evidências;
- critérios de aceite;
- expansão do serviço de implantação;
- backlog por dependências e gates.

Ele não substitui o baseline regulatório, os contratos versionados, o código, o schema, os workflows, os manuais reais do operador ou manifestação da ANAC.

## 2. Legenda de maturidade

As definições deste blueprint usam três classes:

- **[C] Canônico:** sustentado pelo baseline, ADR, contratos integrados ou requisito já registrado.
- **[P] Proposta de produto:** desenho funcional recomendado, ainda sujeito a revisão e implementação.
- **[D] Decisão pendente:** depende de orientação da ANAC, escolha do operador, avaliação independente ou decisão arquitetural formal.

Nenhuma proposta marcada como `[P]` ou `[D]` deve ser apresentada como capacidade existente.

## 3. Referências internas

Usar este blueprint em conjunto com:

- `README.md`;
- `ANAC_EDB_REGULATORY_BASELINE_20260802.md`;
- `ANAC_EDB_COMPLIANCE_MATRIX_20260802.csv`;
- `ADR_EDB_REGULATED_RECORDS_BOUNDARY_20260802.md`;
- `ADR_EDB_REGULATED_SCHEMA_D1_R2_READINESS_20260802.md`;
- `EDB_FUNCTIONAL_BLUEPRINT_SCHEMA_ALIGNMENT_20260802.md`;
- `EDB_FUNCTIONAL_BLUEPRINT_FIRST_OPERATOR_ALIGNMENT_20260802.md`;
- `ANAC_EDB_RBAC135_SUBMISSION_PLAN_20260802.md`;
- `ANAC_EDB_IMPLEMENTATION_PLAN_20260802.md`;
- `ANAC_EDB_SIGNATURE_THREAT_MODEL_20260802.md`;
- `ANAC_EDB_PED_OFFLINE_CONCEPT_20260802.md`;
- `ANAC_EDB_RBAC135_MANUALS_CHANGE_MATRIX_20260802.md`;
- `ANAC_EDB_SHADOW_PILOT_PROTOCOL_20260802.md`;
- `ANAC_EDB_INDEPENDENT_CONFORMITY_RFP_20260802.md`;
- `fop200/README.md` e seus modelos.

## 4. Promessa do produto e limites

### 4.1 Promessa

O eDB deverá permitir que operador, tripulação, manutenção e fiscalização trabalhem sobre um acervo único, íntegro, rastreável e disponível, respeitando o escopo autorizado por operador e aeronave.

O produto deverá, quando autorizado e implementado:

- representar volumes e termos;
- registrar cada etapa e sua tripulação;
- preservar situação técnica, discrepâncias e retorno ao serviço;
- suportar revisão deliberada e assinaturas vinculadas ao conteúdo;
- evidenciar correções sem apagar o original;
- funcionar no PED durante a operação, inclusive no modo definido para ausência de comunicação;
- manter consulta, impressão, exportação e verificação;
- suportar retenção, restauração, reconstituição e transferência do acervo;
- produzir evidências para auditoria e avaliação de conformidade.

### 4.2 Limites permanentes

- **[C]** Controle de Voos, SIGVOOS e tabelas `cv_*` são fontes operacionais; não são o acervo oficial assinado.
- **[C]** Importação, job, sincronização ou coordenação nunca assinam por uma pessoa.
- **[C]** Um registro assinado é snapshot; alterações posteriores na fonte não mudam o conteúdo regulado.
- **[C]** Correção cria nova versão e preserva a anterior.
- **[C]** O papel permanece oficial até o cutover formalmente autorizado.
- **[C]** Autorização deve ser aplicada por operador e aeronave, com referência ao ato aplicável.
- **[C]** Não existe delete funcional do acervo regulado.
- **[D]** Método definitivo de assinatura, canonicalização, evidência temporal e escrita offline permanece pendente.
- **[D]** Forma de acesso da ANAC e formato definitivo de apresentação devem ser confirmados.

## 5. Domínios funcionais

### 5.1 Controle operacional

Responsável por planejamento, execução, RDV, etapas, tripulação, integração, conflitos e coordenação.

Propriedades:

- editável conforme o workflow operacional;
- pode receber dados externos;
- pode estar incompleto;
- preserva procedência;
- gera insumo para rascunho eDB;
- não adquire valor oficial por simples sincronização.

### 5.2 Projeção, validação e revisão

Responsável por montar rascunho, identificar origem, validar completude, registrar conflitos e permitir revisão deliberada.

Propriedades:

- não oficial;
- descartável sem apagar evidência de execução;
- não resolve conflito por última escrita;
- não permite assinatura automática;
- pode operar em shadow mode.

### 5.3 Regulated Records Core

Responsável pelo acervo oficial, versões, volumes, termos, assinaturas, auditoria e integridade.

Propriedades canônicas de arquitetura:

- **[C]** D1 é a fonte transacional dos fatos regulatórios estruturados;
- **[C]** R2 armazena bytes, anexos e pacotes, sem ser fonte única de fato regulatório;
- **[C]** cada versão congelada é completa, autossuficiente e independente de cadastro ou `cv_*` mutável;
- **[C]** conteúdo original e versões históricas são append-only;
- **[C]** correção, addendum e reconstituição criam nova versão com predecessor e motivo;
- **[C]** o head corrente é transacional, separado da versão e protegido por geração esperada e idempotência;
- **[C]** todas as relações reguladas preservam `empresa_id`, constraints cross-tenant e filtragem obrigatória no serviço;
- **[C]** não existe delete funcional nem cadeia global por tenant no Schema V1;
- **[C]** retenção, exportação, reconstituição e evidências de integridade possuem modelos próprios;
- **[C]** acesso permanece tenant-safe e limitado ao escopo autorizado;
- **[P]** schema, migration e runtime correspondentes serão implementados em frentes próprias.

### 5.4 Situação técnica

Responsável pelos elementos exigidos no eDB:

- última intervenção;
- próxima intervenção;
- horas ou ciclos restantes aplicáveis;
- discrepâncias abertas;
- ação corretiva ou retardada;
- retorno ao serviço;
- responsável e organização;
- ciência do PIC.

O domínio não deve se transformar automaticamente em MRO completo.

### 5.5 Identidade, intenção e assinatura

Responsável por:

- identidade positiva;
- finalidade da assinatura;
- conteúdo apresentado;
- intenção explícita;
- autenticação reforçada;
- associação permanente ao conteúdo;
- verificação, revogação e evidência.

A sessão JWT identifica a sessão, mas não substitui o ato de assinatura.

### 5.6 PED e operação offline

Responsável por:

- dispositivo e escopo;
- pacote local íntegro;
- últimos 30 dias;
- situação técnica atual;
- confirmação de leitura;
- operação degradada;
- sincronização idempotente;
- revogação, substituição e contingência.

### 5.7 Fiscalização, apresentação e exportação

Responsável por:

- pesquisa cronológica;
- volume, período e aeronave;
- cadeia de versões;
- identificação de signatários;
- impressão e exportação;
- verificação independente;
- acesso temporário e auditado, conforme método aceito.

### 5.8 Governança e conformidade

Responsável por:

- escopo autorizado;
- designações;
- dispositivos;
- manuais e treinamento;
- avaliação de impacto de mudança;
- evidências do shadow pilot;
- avaliação independente;
- cutover, suspensão e descontinuidade.

## 6. Atores e responsabilidades

<!-- prettier-ignore -->
| Ator | Responsabilidade principal | Não pode fazer |
|---|---|---|
| PIC | revisar conteúdo por etapa/jornada, confirmar ciência técnica e executar assinatura própria | assinar por outro usuário; alterar registro já assinado; liberar situação técnica sem competência |
| SIC e demais tripulantes | validar identidade, função e participação; consultar informações permitidas | assinar como PIC sem designação; alterar acervo fora do próprio escopo |
| Coordenação/OCC | acompanhar rascunhos, fontes, conflitos e pendências operacionais | converter rascunho em oficial; assinar por tripulante; ocultar divergência |
| Registrador de manutenção | registrar discrepância, ação ou informação técnica dentro da prerrogativa | aprovar retorno ao serviço sem competência; apagar discrepância |
| Aprovador de retorno ao serviço | revisar e aprovar o ato técnico quando formalmente habilitado | atuar fora de organização, licença, aeronave, tarefa ou período autorizados |
| Designado do operador | contrassinar, acompanhar prazo e tratar pendências dentro da designação | assinar fora do escopo formal; alterar conteúdo do PIC durante a contrassinatura |
| Administrador eDB do operador | administrar usuários, escopos, aeronaves, dispositivos, volumes e designações | conceder prerrogativa incompatível; ativar modo oficial sem ato autorizativo |
| Segurança operacional/GSO | acompanhar riscos, mudança, incidentes e critérios de interrupção | alterar registro para melhorar indicador; usar shadow para ranking individual |
| Compliance/auditoria interna | verificar cadeia, evidências, prazos e aderência ao procedimento | corrigir silenciosamente o registro auditado |
| TI/suporte AirTrust | manter disponibilidade, integridade, suporte, backup e evidências técnicas | acessar conteúdo fora de necessidade autorizada; assinar registro operacional |
| Avaliador independente | executar avaliação no escopo contratado e emitir achados | representar a ANAC; aprovar o operador; alterar evidência avaliada |
| Fiscal/ANAC | consultar ou receber evidências conforme processo e escopo aplicável | receber acesso genérico cross-tenant ou permanente sem definição formal |
| Gestor responsável/diretores | aprovar governança, recursos, procedimentos, designações e mudança | substituir atos pessoais de assinatura ou competências técnicas |

Os papéis acima são funcionais. Seu mapeamento para roles atuais do AirTrust deve ser objeto de desenho RBAC específico e testes próprios.

## 7. Dimensões obrigatórias de escopo

Toda operação relevante deve validar, conforme aplicável:

1. `empresa_id`/tenant;
2. operador legal;
3. aeronave e matrícula;
4. ato autorizativo e estado de uso;
5. volume corrente;
6. voo, jornada e etapa;
7. versão do registro;
8. finalidade da ação;
9. identidade e designação do usuário;
10. organização de manutenção e prerrogativa;
11. dispositivo e pacote offline;
12. período de validade;
13. fonte e procedência;
14. estado online/offline;
15. sequência/idempotência.

Nenhuma referência fornecida pelo cliente deve, isoladamente, determinar tenant, aeronave, versão, dispositivo ou signatário.

## 8. Estados funcionais

### 8.1 Estado de uso por operador/aeronave

Estados canônicos do ADR:

- `disabled`;
- `shadow`;
- `authorized_pending_migration`;
- `official`;
- `suspended`;
- `decommissioning`.

Transições para `official`, `suspended` ou `decommissioning` exigem procedimento, evidência e autoridade compatíveis; não são feature flags comuns.

### 8.2 Estado proposto do rascunho

- `[P] assembling` — projeção ou entrada ainda incompleta;
- `[P] validation_required` — faltas ou conflitos impedem revisão final;
- `[C] shadow_draft` — rascunho não oficial disponível;
- `[C] ready_for_pic_review` — condições mínimas para revisão atendidas;
- `[P] review_in_progress` — revisão deliberada iniciada;
- `[P] changes_requested` — PIC ou responsável devolveu para ajuste;
- `[P] frozen_for_intent` — bytes/conteúdo congelados para o ato;
- `[P] expired` — rascunho perdeu validade por mudança de fonte, escopo ou janela;
- `[P] discarded` — não será promovido, com evidência operacional preservada.

### 8.3 Estado proposto do registro regulado

Dependente da implementação do Records Core e do método de assinatura:

- `[P] prepared`;
- `[P] frozen`;
- `[P] pic_signature_pending`;
- `[P] pic_signed`;
- `[P] operator_countersignature_pending`;
- `[P] complete`;
- `[P] correction_pending`;
- `[P] superseded`;
- `[P] reconstituted`;
- `[P] integrity_hold`.

`superseded` não significa apagado. A versão anterior permanece verificável.

### 8.4 Estado proposto de discrepância

- `[P] reported`;
- `[P] under_assessment`;
- `[P] corrective_action_recorded`;
- `[P] deferred_action_recorded`;
- `[P] return_to_service_pending`;
- `[P] return_to_service_approved`;
- `[P] pic_acknowledgement_pending`;
- `[P] closed_for_operation`;
- `[P] disputed_or_quarantined`.

O significado técnico definitivo deve refletir os manuais e competências do operador.

### 8.5 Estados de dispositivo

Conforme conceito PED/offline:

- `requested`;
- `provisioning`;
- `active`;
- `degraded`;
- `sync_required`;
- `revoked`;
- `lost_or_stolen`;
- `retired`.

### 8.6 Estados de comando offline

- `local_pending`;
- `sealed`;
- `queued`;
- `transmitting`;
- `accepted`;
- `rejected_retriable`;
- `rejected_permanent`;
- `conflict_quarantined`;
- `revocation_hold`.

### 8.7 Estado proposto de volume

- `[P] planned`;
- `[P] opening_pending_signature`;
- `[P] open`;
- `[P] closing_pending_signature`;
- `[P] closed`;
- `[P] transfer_hold`;
- `[P] integrity_hold`.

Volume fechado não deve ser reaberto. Ajustes posteriores usam registros de correção ou novo volume conforme o procedimento aplicável.

## 9. Jornadas operacionais

### 9.1 Preparação do operador e da aeronave

**Pré-condições:** escopo identificado, modo `shadow` ou autorização aplicável, usuários e dispositivos preparados.

Fluxo:

1. cadastrar operador, aeronave, matrículas e bases no escopo;
2. registrar responsáveis e designações;
3. verificar coerência dos cadastros e fontes;
4. provisionar dispositivos;
5. confirmar versão, pacote e contingência;
6. validar tenant isolation;
7. confirmar que telas e exportações identificam o modo;
8. liberar somente o estado autorizado.

**Bloqueios:** ato ausente para modo oficial, aeronave fora do escopo, dispositivo não válido, dados técnicos indisponíveis, papel não confirmado como oficial no shadow.

### 9.2 Inicialização antes da primeira etapa

Fluxo mínimo sustentado pelo conceito PED:

1. autenticar usuário e dispositivo;
2. validar tenant, operador, aeronave e escopo;
3. verificar integridade e validade do pacote;
4. verificar acesso aos últimos 30 dias;
5. exibir termo de abertura;
6. exibir discrepâncias abertas;
7. exibir ações corretivas anteriores relevantes;
8. exibir situação técnica e retorno ao serviço;
9. exigir confirmação de leitura quando aplicável;
10. registrar versão exata do conteúdo apresentado;
11. liberar ou bloquear conforme procedimento.

Nenhum fallback silencioso deve apresentar informação desatualizada como válida.

### 9.3 Criação/importação do voo e rascunho

1. voo é criado ou importado no Controle de Voos;
2. etapas, tripulação e dados disponíveis são coletados;
3. projetor gera `edb.draft.v1`;
4. cada campo mantém procedência;
5. validações produzem código e caminho, sem PII nos achados;
6. conflitos permanecem explícitos;
7. rascunho recebe identificação não oficial;
8. rascunho só avança quando as condições mínimas são atendidas.

**Bloqueios:** cross-tenant, voo/etapa fora de escopo, timezone ou unidade não confirmados, tripulante não resolvido, situação técnica ausente quando requerida.

### 9.4 Revisão por etapa e jornada

1. PIC acessa o rascunho da própria jornada;
2. sistema apresenta dados por etapa e origem;
3. PIC revisa tripulação, horários, tempos, pousos/ciclos, combustível, POB, carga, natureza, ocorrências e discrepâncias;
4. alterações permitidas geram nova procedência e não apagam a origem;
5. pendências bloqueadoras devem ser resolvidas ou formalmente tratadas;
6. conteúdo é congelado para intenção somente após revisão deliberada;
7. no shadow, confirmação permanece explicitamente não oficial.

### 9.5 Troca de tripulação ou PIC

1. sistema identifica mudança por etapa;
2. delimita o conteúdo sob responsabilidade de cada PIC;
3. impede que um PIC assine etapa sob responsabilidade de outro sem regra formal;
4. exige o ato aplicável antes da etapa seguinte quando requerido;
5. preserva vínculo entre identidade, função, etapa e conteúdo;
6. conflito de troca não sincronizada entra em quarentena.

### 9.6 Assinatura do PIC

Fluxo proposto, dependente do método aceito:

1. apresentar conteúdo congelado e finalidade;
2. apresentar declaração inequívoca de intenção;
3. executar autenticação reforçada;
4. validar identidade, função, escopo, prazo e conteúdo;
5. criar intenção não reutilizável;
6. assinar exatamente o hash/conteúdo apresentado;
7. persistir envelope de evidência;
8. confirmar resultado ao usuário;
9. impedir edição in-place;
10. abrir pendência de contrassinatura quando aplicável.

### 9.7 Discrepância e situação técnica

1. usuário autorizado registra discrepância;
2. sistema preserva texto, código/sistema aplicável, data, identidade, organização e fonte;
3. ação corretiva ou retardada é registrada como evento próprio;
4. aprovador habilitado executa retorno ao serviço, quando aplicável;
5. sistema atualiza snapshot técnico sem apagar estados anteriores;
6. PIC recebe e confirma ciência antes do voo quando requerido;
7. informação ausente, obsoleta ou conflitante bloqueia conforme procedimento.

### 9.8 Contrassinatura do operador

1. fila identifica registros assinados pelo PIC e pendentes;
2. designado revisa escopo, versão e integridade;
3. contrassinatura não altera o conteúdo do PIC;
4. sistema controla prazo aplicável, inclusive 15 dias para RBAC 135 conforme baseline;
5. atraso gera alerta, escalonamento e evidência;
6. mudança de designado preserva histórico e autoridade vigente no instante do ato.

### 9.9 Correção e addendum

1. usuário autorizado inicia pedido com justificativa;
2. sistema preserva versão original e assinaturas;
3. nova versão referencia a anterior;
4. conteúdo alterado é apresentado integralmente;
5. assinaturas substituídas são marcadas como não vigentes para a nova versão, sem remoção;
6. novas assinaturas são exigidas conforme finalidade;
7. fiscalização exibe cadeia completa;
8. tentativa de alteração direta produz bloqueio e evento de segurança.

### 9.10 Operação sem comunicação

1. PED valida pacote, escopo, versão e integridade;
2. usuário consulta últimos 30 dias e situação técnica;
3. operações permitidas são registradas localmente;
4. cada comando recebe identificador idempotente e sequência;
5. comandos são selados conforme método definido;
6. retorno de conectividade inicia sincronização retomável;
7. servidor revalida identidade, escopo, versão e ordem;
8. conflitos ficam em quarentena;
9. conteúdo assinado não é reescrito;
10. recibo do servidor é preservado no PED.

Escrita e assinatura offline permanecem `[D]` até método aceito.

### 9.11 Fiscalização e exportação

1. usuário autorizado define aeronave, volume, período e finalidade;
2. sistema fecha o escopo e registra a solicitação;
3. consulta apresenta registros, versões, correções e signatários;
4. exportação contém manifesto, versão e evidências verificáveis;
5. nenhuma informação de outro tenant é incluída;
6. acesso temporário expira e é auditado;
7. exportação não depende de cadastro mutável para identificar operador e aeronave.

### 9.12 Abertura e encerramento de volume

1. validar necessidade e sequência;
2. capturar snapshots de operador, proprietário e aeronave;
3. reconciliar horas, ciclos e pousos;
4. gerar termo;
5. obter assinaturas aplicáveis;
6. abrir ou fechar atomicamente;
7. bloquear registro em volume fechado;
8. tratar mudança/cancelamento de marcas conforme procedimento;
9. disponibilizar volume corrente no PED.

### 9.13 Transferência de propriedade ou operador

1. congelar escopo e reconciliar acervo;
2. encerrar volume quando aplicável;
3. gerar pacote completo e verificável;
4. preservar cópias e prazos de retenção requeridos;
5. registrar cadeia de custódia;
6. confirmar recepção e verificabilidade;
7. impedir mistura entre operadores/tenants;
8. abrir novo contexto somente após decisões aplicáveis.

### 9.14 Perda, corrupção e reconstituição

1. detectar ou receber relato;
2. bloquear operações afetadas;
3. preservar evidências;
4. acionar comunicação interna e externa aplicável;
5. verificar backup e fontes admitidas;
6. reconstituir em ambiente controlado;
7. marcar registro como reconstituído;
8. validar cadeia e condição técnica;
9. obter aprovações necessárias;
10. liberar retorno apenas após decisão formal.

### 9.15 Cutover, suspensão e descontinuidade

**Cutover:**

- verificar ato e aeronaves abrangidas;
- reconciliar saldos;
- encerrar papel no instante definido;
- abrir volume digital;
- validar primeiro caso real;
- preservar evidência do marco.

**Suspensão:**

- impedir novos atos oficiais conforme procedimento;
- manter acesso ao acervo;
- registrar motivo, autoridade e contingência;
- não executar rollback silencioso ao papel.

**Descontinuidade:**

- submeter processo aplicável;
- exportar e transferir acervo;
- preservar verificação independente;
- manter retenção e suporte pelo período definido.

## 10. Regras de negócio essenciais

- `EDB-BR-001` — somente um meio é fonte oficial para a aeronave no instante operacional.
- `EDB-BR-002` — rascunho, shadow e registro oficial devem ser visualmente e semanticamente distintos.
- `EDB-BR-003` — importação nunca cria assinatura.
- `EDB-BR-004` — assinatura pertence a pessoa, finalidade, versão, aeronave, volume e tenant específicos.
- `EDB-BR-005` — nenhum registro congelado ou assinado é editado in-place.
- `EDB-BR-006` — correção preserva original e cria nova versão vinculada.
- `EDB-BR-007` — alterações na fonte operacional não alteram snapshot regulado.
- `EDB-BR-008` — toda consulta ou comando de dados regulados valida tenant.
- `EDB-BR-009` — ato oficial depende do estado autorizado da aeronave e do operador.
- `EDB-BR-010` — volume fechado não aceita novo registro ordinário.
- `EDB-BR-011` — matrícula, operador, proprietário e aeronave são snapshots nos termos e registros.
- `EDB-BR-012` — conflito não é resolvido por última escrita.
- `EDB-BR-013` — ambos os lados de conflito são preservados até decisão auditável.
- `EDB-BR-014` — situação técnica exibida ao PIC é versionada e sua leitura pode ser obrigatória.
- `EDB-BR-015` — discrepância não desaparece por sobrescrita.
- `EDB-BR-016` — retorno ao serviço exige identidade e competência verificáveis.
- `EDB-BR-017` — contrassinatura do operador não modifica o conteúdo assinado pelo PIC.
- `EDB-BR-018` — prazos consideram timezone e instante confiável, não apenas relógio do dispositivo.
- `EDB-BR-019` — PED revogado não recebe novo pacote nem sincroniza novos comandos.
- `EDB-BR-020` — pacote offline vencido, corrompido ou incompleto não é apresentado como válido.
- `EDB-BR-021` — sincronização é idempotente e retomável.
- `EDB-BR-022` — conteúdo assinado mantém os mesmos bytes ou representação canônica durante sincronização.
- `EDB-BR-023` — exportação fecha escopo e registra solicitante, finalidade e conteúdo.
- `EDB-BR-024` — acesso fiscal não concede privilégio cross-tenant genérico.
- `EDB-BR-025` — auditoria regulatória é separada de logs comuns e não contém segredo.
- `EDB-BR-026` — logs não registram token, cookie, conteúdo integral, PII desnecessária ou chave.
- `EDB-BR-027` — shadow mode não pode liberar voo, cumprir assinatura ou substituir papel.
- `EDB-BR-028` — mudança material no método de cumprimento permanece fora do modo oficial até avaliação.
- `EDB-BR-029` — perda ou corrupção não é tratada como simples restauração técnica; exige caso de reconstituição.
- `EDB-BR-030` — nenhum fechamento do projeto ocorre antes de integração, autorização aplicável, cutover e validação real, quando esses marcos estiverem no escopo.
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

## 11. Matriz conceitual de permissões

Legenda: `S` próprio escopo; `D` somente com designação/prerrogativa; `L` leitura; `—` não permitido.

<!-- prettier-ignore -->
| Capacidade | PIC | Tripulante | OCC | Manutenção registrador | RTS aprovador | Designado operador | Admin eDB | Auditor | Fiscal |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Consultar jornada/etapa | S | S | D | L | L | L | D | L | L |
| Revisar rascunho | S | S limitado | D | técnico | técnico | L | — | L | L |
| Editar rascunho permitido | S | S limitado | D | técnico | — | — | — | — | — |
| Resolver conflito operacional | S/D | — | D | técnico | técnico | — | — | — | — |
| Congelar para intenção | S | — | — | finalidade técnica | finalidade técnica | finalidade própria | — | — | — |
| Assinar como PIC | S | — | — | — | — | — | — | — | — |
| Registrar discrepância | D | D | — | D | D | — | — | — | — |
| Registrar ação corretiva/retardada | — | — | — | D | D | — | — | — | — |
| Aprovar retorno ao serviço | — | — | — | — | D | — | — | — | — |
| Confirmar ciência técnica | S | — | — | — | — | — | — | — | — |
| Contrassinar operador | — | — | — | — | — | D | — | — | — |
| Iniciar correção | S/D | — | D | D | D | D | — | — | — |
| Administrar designações | — | — | — | — | — | D | D | L | — |
| Administrar dispositivo | — | — | — | — | — | D | D | L | — |
| Abrir/encerrar volume | — | — | — | — | — | D | D | L | L |
| Exportar acervo | próprio permitido | — | D | técnico | técnico | D | D | D | L definido |
| Acessar auditoria | próprio ato | — | L limitado | próprio ato | próprio ato | D | D | D | L definido |
| Criar caso de reconstituição | — | — | D | D | D | D | D | D | L |

A matriz definitiva deve aplicar segregação de funções, período, base, aeronave, organização, tarefa e finalidade.

## 12. Superfícies de produto

### 12.1 Painel operacional do PIC

Deve apresentar:

- aeronave, matrícula, volume e modo;
- estado de conectividade e pacote;
- situação técnica e pendências;
- jornada, etapas e tripulação;
- campos ausentes/conflitantes;
- pendências de revisão e assinatura;
- contingência aplicável.

### 12.2 Tela de inicialização técnica

Deve priorizar:

- termo de abertura;
- discrepâncias abertas;
- ações anteriores relevantes;
- última/próxima intervenção;
- horas/ciclos restantes;
- retorno ao serviço;
- confirmação de leitura;
- motivo claro de bloqueio.

### 12.3 Editor/revisor de jornada

Deve oferecer:

- etapas em ordem operacional;
- troca de tripulação;
- quatro horários;
- tempos, pousos e ciclos;
- combustível, POB e carga;
- natureza, ocorrências e discrepâncias;
- procedência por campo;
- validações sem ocultar incerteza.

### 12.4 Ato de intenção e assinatura

Deve ser uma superfície própria, sem clique acidental, contendo:

- identidade e função;
- finalidade;
- conteúdo ou resumo verificável com acesso integral;
- versão e escopo;
- declaração de intenção;
- autenticação reforçada;
- confirmação inequívoca de sucesso ou falha.

### 12.5 Área de manutenção

Deve separar:

- registro da discrepância;
- ação corretiva;
- ação retardada;
- aprovação de retorno ao serviço;
- organização e licença;
- estado da ciência do PIC;
- histórico sem edição destrutiva.

### 12.6 Fila de contrassinatura

Deve permitir:

- ordenar por prazo e severidade;
- visualizar versão e integridade;
- identificar designação válida;
- assinar sem alterar o registro;
- justificar impedimento;
- escalar atraso.

### 12.7 Centro de dispositivos e offline

Deve apresentar:

- dispositivo, aeronave e escopo;
- versão do aplicativo e SO;
- último pacote e validade;
- últimos 30 dias disponíveis;
- estado de sincronização;
- fila pendente;
- revogação, perda, substituição e equipamento reserva.

### 12.8 Administração de volumes

Deve cobrir:

- sequência e numeração;
- termos;
- saldos;
- snapshots legais;
- mudança de marcas;
- encerramento;
- integridade e exportação.

### 12.9 Portal de fiscalização/auditoria

Deve permitir:

- pesquisa por escopo fechado;
- linha do tempo;
- versões e correções;
- signatários e verificação;
- impressão/exportação;
- trilha de acesso;
- expiração do acesso.

### 12.10 Centro de evidências e conformidade

Deve reunir, sem misturar dados reais em repositório público:

- versão do produto e método;
- matriz requisito → evidência;
- resultados de teste;
- shadow pilot;
- dispositivos;
- treinamento;
- DR e restauração;
- avaliação independente;
- pendências e decisões.

### 12.11 Caso de incidente e reconstituição

Deve registrar:

- detecção;
- escopo afetado;
- evidências preservadas;
- comunicações;
- fontes usadas;
- etapas de reconstituição;
- validações;
- aprovações;
- retorno controlado.

## 13. Capacidades conceituais de aplicação

Este catálogo descreve capacidades, não define endpoints.

### Consultas

- obter escopo e estado de autorização;
- obter volume corrente e termos;
- obter pacote de inicialização técnica;
- obter jornada e rascunho com procedência;
- obter validações e conflitos;
- obter cadeia de versões;
- obter pendências de assinatura e contrassinatura;
- obter situação técnica e discrepâncias;
- obter estado do PED e pacote offline;
- pesquisar registros para fiscalização;
- verificar manifesto, hash e assinaturas;
- obter evidências do shadow pilot.

### Comandos

- projetar fonte operacional em rascunho;
- registrar alteração com procedência;
- resolver conflito explicitamente;
- congelar conteúdo para intenção;
- criar intenção de assinatura;
- registrar assinatura/verificação;
- iniciar correção;
- registrar discrepância;
- registrar ação corretiva/retardada;
- aprovar retorno ao serviço;
- confirmar ciência do PIC;
- contrassinar como operador;
- abrir/encerrar volume;
- provisionar/revogar dispositivo;
- gerar/aceitar pacote offline;
- sincronizar comando idempotente;
- criar exportação fechada;
- iniciar caso de reconstituição;
- executar cutover por aeronave.

Comandos de alto risco devem possuir idempotency key, autorização contextual, validação de estado anterior e evento de auditoria.

## 14. Eventos e trilha regulatória

Eventos conceituais mínimos:

- `edb.draft.projected`;
- `edb.validation.completed`;
- `edb.conflict.detected`;
- `edb.review.started`;
- `edb.content.frozen`;
- `edb.signature.intent.created`;
- `edb.signature.completed`;
- `edb.signature.failed`;
- `edb.record.corrected`;
- `edb.discrepancy.reported`;
- `edb.corrective_action.recorded`;
- `edb.return_to_service.approved`;
- `edb.pic_acknowledgement.completed`;
- `edb.operator_countersigned`;
- `edb.volume.opened`;
- `edb.volume.closed`;
- `edb.device.provisioned`;
- `edb.device.revoked`;
- `edb.offline_package.generated`;
- `edb.sync.conflict_quarantined`;
- `edb.export.generated`;
- `edb.integrity.failure_detected`;
- `edb.reconstitution.started`;
- `edb.cutover.completed`;
- `edb.official_mode.suspended`.

Envelope sanitizado recomendado:

- `correlation_id`;
- `event_id`;
- `event_type`;
- `occurred_at`;
- tenant e aeronave por referência interna controlada;
- registro/versão por referência opaca;
- ator por referência interna;
- finalidade;
- resultado;
- código de erro;
- hash ou referência de evidência quando aplicável;
- nenhuma credencial, conteúdo integral, token, cookie ou segredo.

## 15. Cenários excepcionais obrigatórios

- jornada atravessando meia-noite;
- retorno à origem;
- múltiplas etapas;
- troca de PIC;
- voo cancelado;
- ausência de SIGVOOS;
- origem/destino conflitantes;
- unidade de combustível desconhecida;
- tripulante sem vínculo resolvido;
- discrepância aberta entre etapas;
- situação técnica atualizada durante a jornada;
- aprovador terceiro;
- licença/prerrogativa expirada;
- relógio do PED incorreto;
- pacote offline vencido ou corrompido;
- perda de rede antes, durante e após a jornada;
- fila duplicada ou fora de ordem;
- dispositivo revogado durante uso;
- equipamento principal indisponível;
- tentativa cross-tenant;
- alteração de conteúdo congelado;
- replay de intenção;
- exportação divergente;
- backup íntegro, backup corrompido e restauração parcial;
- mudança/cancelamento de matrícula;
- transferência de propriedade;
- suspensão do modo oficial;
- descontinuidade ou troca de fornecedor.

## 16. Critérios de aceite por marco

### 16.1 Rascunho shadow read-only

- projeção determinística;
- procedência por campo;
- nenhuma escrita regulada;
- tenant isolation comprovado;
- campos ausentes e conflitos explícitos;
- identificação persistente de rascunho não oficial;
- dados sintéticos nos testes;
- nenhum status `official` alcançável.

### 16.2 Workflow shadow

- revisão por PIC sem assinatura oficial;
- situação técnica representada;
- divergências classificadas;
- métricas agregadas sem ranking individual;
- operação com e sem conectividade testada;
- critérios de interrupção funcionais;
- papel preservado como fonte oficial;
- evidências congeladas por versão.

### 16.3 Records Core em staging

- schema aditivo, inerte e tenant-safe;
- D1 contém todos os fatos estruturados necessários à leitura do registro;
- snapshots históricos são autossuficientes e lidos sem consulta a `cv_*`;
- volumes, termos, registros, versões e heads possuem relações cross-tenant protegidas;
- duas correções concorrentes não criam dois heads válidos;
- repetição de comando retorna o mesmo recibo sem duplicar efeitos;
- correções, addenda e reconstituições preservam original, predecessor e motivo;
- nenhuma rota funcional executa delete do acervo;
- objetos R2 usam chave imutável, verificação antes do vínculo e reconciliação de órfãos;
- fiscalização e exportação derivam do snapshot regulado;
- Schema V2 e ledger reconhecem a migration futura;
- rollback lógico preserva dados e desativa comportamento;
- DR e restauração são demonstrados;
- assinatura permanece apenas de teste, sem provider produtivo;
- nenhuma ativação oficial.

### 16.4 Candidato à avaliação/submissão

- método de cumprimento registrado;
- manuais coerentes com o build;
- avaliação de segurança concluída;
- provider e PED validados no escopo;
- shadow pilot encerrado pelos critérios;
- relatório independente disponível;
- treinamento e contingência demonstrados;
- pendências críticas/altas fechadas.

### 16.5 Cutover autorizado

- ato e aeronaves conferidos;
- escopo técnico idêntico ao autorizado;
- reconciliação concluída;
- volume digital aberto;
- papel encerrado no instante formal;
- primeiro caso real validado;
- suporte e reversão regulatória disponíveis;
- evidências arquivadas.

## 17. Serviço profissional ampliado

O produto deve ser acompanhado por um serviço dividido em componentes contratáveis.

### 17.1 Diagnóstico e estratégia

Entregas:

- inventário operacional e documental;
- mapa de stakeholders;
- avaliação de dados, dispositivos e conectividade;
- matriz de lacunas;
- estratégia regulatória e de implantação.

### 17.2 Preparação regulatória

Entregas:

- apoio ao FOP 200;
- matriz de requisitos;
- plano de alteração de EO;
- matriz de manuais;
- roteiro de demonstração e evidências.

A responsabilidade pelo protocolo e pelas declarações do operador permanece com o operador.

### 17.3 Readiness de dados e integrações

Entregas:

- análise de cadastros;
- reconciliação de frota, tripulação e manutenção;
- mapeamento SIGVOOS/Controle de Voos;
- regras de procedência;
- plano de saneamento e testes.

### 17.4 Preparação de dispositivos e offline

Entregas:

- inventário;
- matriz aeronave × dispositivo;
- configuração e versão;
- equipamento reserva;
- testes offline;
- plano de perda, furto e substituição;
- evidências de não interferência sob responsabilidade do operador.

### 17.5 Treinamento e gestão de mudança

Entregas:

- treinamento por perfil;
- cenários práticos;
- avaliação de competência;
- material de contingência;
- comunicação;
- suporte ao SGSO e fatores humanos.

### 17.6 Shadow pilot

Entregas:

- protocolo adaptado;
- janela e escopo;
- acompanhamento;
- registro de divergências;
- retestes;
- relatório de prontidão.

### 17.7 Data room e avaliação independente

Entregas:

- organização de evidências;
- rastreabilidade requisito → teste → resultado;
- suporte ao avaliador;
- tratamento de achados;
- congelamento de versão candidata.

O avaliador independente mantém independência e responsabilidade pelo próprio relatório.

### 17.8 Cutover e estabilização

Entregas:

- checklist por aeronave;
- reconciliação;
- suporte assistido;
- validação do primeiro caso;
- monitoramento inicial;
- relatório de estabilização.

### 17.9 Conformidade contínua

Entregas:

- avaliação de impacto de release;
- controle do método de cumprimento;
- testes periódicos de DR e integridade;
- revisão de dispositivos;
- atualização de treinamento;
- suporte a auditoria e renovação de evidências.

### 17.10 Portabilidade e encerramento

Entregas:

- exportação completa;
- verificador;
- transferência de acervo;
- plano de saída do fornecedor;
- retenção e suporte residual;
- descontinuidade controlada.

## 18. Responsabilidades do serviço

<!-- prettier-ignore -->
| Parte | Responsabilidade |
|---|---|
| AirTrust | produto, documentação técnica, suporte, evidências, segurança da aplicação, testes e execução contratada |
| Operador | processos, manuais, designações, treinamento organizacional, dispositivos, determinação operacional, protocolos e decisões de uso |
| Organização de manutenção | competências, registros técnicos, retorno ao serviço e procedimentos próprios |
| Avaliador independente | avaliação no escopo e emissão de relatório independente |
| ANAC | orientação, análise, aceitação/ateste, autorização, fiscalização e demais atos de sua competência |

Nenhuma parte deve ser descrita como substituta de outra.

## 19. Backlog funcional por ondas

### Onda 0 — concluída e integrada

- PR #711 — preview read-only em runtime;
- PR #713 — motor de divergências e prontidão;
- PR #715 — contratos shadow de situação técnica;
- PR #714 — readiness do schema D1/R2;
- PR #710 — pacote de implantação do operador.

Essas integrações encerram os artefatos preparatórios da onda, sem iniciar migration, shadow pilot com dados reais ou modo oficial.

### Onda 1 — trabalho de baixo arrependimento

Pode avançar sem escolher método definitivo de assinatura:

1. especificação de RBAC contextual por ator, aeronave, tarefa e período;
2. protótipos navegáveis das jornadas shadow;
3. catálogo versionado de mensagens, bloqueios e contingências;
4. fixtures sintéticas completas para os cenários obrigatórios;
5. contrato de eventos e evidências sanitizadas;
6. especificação de consulta cronológica e cadeia de versões;
7. desenho do centro de evidências;
8. modelo de avaliação de impacto de mudança;
9. critérios de acessibilidade e fatores humanos do PED;
10. plano de suporte e incidente do shadow pilot.

### Onda 2 — após os gates de implementação do Records Core

A arquitetura D1/R2 foi aceita e integrada pela PR #714. A execução continua bloqueada até os gates de schema inerte, Schema V2/ledger, testes de constraints e autorização específica:

1. schema inerte do Records Core;
2. versionamento e correções;
3. volumes e termos;
4. situação técnica persistida;
5. consulta e exportação shadow;
6. read model offline;
7. auditoria regulatória.

### Onda 3 — após orientação sobre assinatura/PED

1. contrato de intenção;
2. provider abstrato e sandbox;
3. assinatura PIC;
4. retorno ao serviço assinado;
5. contrassinatura do operador;
6. verificador de assinatura;
7. sincronização de escrita offline, se aceita;
8. evidência temporal.

### Onda 4 — avaliação e autorização

1. versão candidata congelada;
2. shadow pilot completo;
3. avaliação independente;
4. manuais e treinamento finais;
5. submissão e demonstração;
6. tratamento de exigências;
7. gate de autorização.

### Onda 5 — cutover e operação contínua

1. migração por aeronave;
2. abertura digital e encerramento do papel;
3. validação real;
4. suporte assistido;
5. DR periódico;
6. fiscalização;
7. change control regulatório;
8. portabilidade e retenção.

## 20. Dependências e serialização

Não paralelizar decisões sobre:

- schema regulado e retenção D1/R2;
- canonicalização;
- algoritmo de hash e assinatura;
- provider produtivo;
- escrita offline;
- acesso fiscal definitivo;
- cutover.

As frentes #711, #713, #715, #714 e #710 foram integradas e este blueprint incorpora seus resultados sem alterar os contratos implementados.

A ordem recomendada para o próximo ciclo funcional é:

1. concluir o diagnóstico verificável do primeiro operador;
2. fechar RBAC conceitual por ator, aeronave, tarefa e período;
3. prototipar e validar as jornadas shadow;
4. fechar contratos de eventos, idempotência, versões e evidências;
5. registrar e tratar as perguntas do FOP 200;
6. preparar a futura migration aditiva e inerte em PR própria;
7. manter assinatura, escrita offline e modo oficial nos gates regulatórios específicos.

## 21. Decisões pendentes

### Regulatórias

- método de demonstração de segurança;
- assinatura eletrônica/digital e combinação de atos;
- escrita e assinatura offline;
- trusted timestamp;
- forma de acesso da ANAC;
- conteúdo e formato definitivo de impressão/exportação;
- documentos e capítulos que serão aprovados ou aceitos;
- procedimento de suspensão e descontinuidade;
- tratamento da mudança do método de cumprimento.

### Do operador

- frota, matrículas, bases, responsáveis e escopo verificável da Costa do Sol;
- papéis e designações;
- manuais reais;
- operação por base e tipo de missão;
- dispositivos e equipamento reserva;
- procedimento de contingência;
- critérios de despacho e bloqueio;
- integração com manutenção própria/terceira;
- treinamento e recorrência;
- escopo do shadow pilot.

### Técnicas

- algoritmo e canonicalização definitivos;
- método de assinatura, não repúdio e trusted timestamp;
- formato de envelopes binários e gestão de chaves;
- plataforma, cache, cifragem e escrita PED/offline;
- política final de bucket lock e verificação de longo prazo;
- topologia física do modo oficial: D1 compartilhado, dedicado por operador ou por coorte;
- sizing real do primeiro operador, capacidade e throughput;
- RTO/RPO regulatório e drills;
- portabilidade e verificador independente;
- forma definitiva de acesso fiscal;
- parâmetros que dependem do FOP 200.

## 22. Fora do escopo deste blueprint

- implementar código, schema, migration ou endpoint;
- escolher provider de assinatura;
- afirmar atendimento regulatório;
- alterar manuais reais;
- protocolar documentos;
- ativar staging ou produção;
- usar dados reais;
- definir cronograma da ANAC;
- transformar eDB em MRO completo;
- substituir a coordenação central de PRs.

## 23. Critério de conclusão do blueprint

Este blueprint estará funcionalmente validado quando:

- operação, manutenção, segurança, treinamento e TI revisarem as jornadas;
- atores e segregações estiverem coerentes;
- estados e transições não permitirem atalho para uso oficial;
- superfícies e capacidades cobrirem os cenários obrigatórios;
- decisões pendentes estiverem atribuídas a um gate;
- backlog estiver dividido sem conflito de exclusividade;
- os contratos implementados continuarem sendo a fonte de verdade para o comportamento real;
- o documento for atualizado somente após marcos relevantes e vinculado a SHA.
