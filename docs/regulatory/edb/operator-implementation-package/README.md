# Pacote de serviço — implantação do eDB em operador RBAC 135

> **Data-base:** 2026-08-02 (BRT)
>
> **SHA-base:** `422095183d5424b13307201f8160d1860a6bc674` (`origin/main`)
>
> **Status:** pacote reutilizável de planejamento e execução. Não representa aprovação,
> ateste, aceitação ou autorização da ANAC.
>
> **Escopo:** implantação profissional do eDB AirTrust, do diagnóstico ao cutover
> formalmente autorizado.

## 1. Finalidade

Este pacote organiza o serviço profissional necessário para apoiar um operador RBAC 135 na
preparação, implantação controlada e futura entrada em operação do Diário de Bordo Digital —
eDB.

O pacote não substitui:

- o processo de certificação ou alteração das Especificações Operativas do operador;
- os formulários oficiais vigentes;
- a revisão e aprovação interna dos manuais reais do operador;
- a avaliação independente exigida para o método de cumprimento aplicável;
- qualquer decisão, exigência, aprovação, aceitação, ateste ou autorização da ANAC.

Até a emissão do ato aplicável e o instante formal de cutover por aeronave, o Diário de Bordo
em papel permanece a fonte oficial.

## 2. Princípios obrigatórios

- **Sem afirmação antecipada de conformidade:** nenhum documento deve declarar que o
  AirTrust está homologado, certificado, aceito, atestado ou autorizado.
- **Sem método de assinatura presumido:** o método definitivo permanece pendente de
  orientação regulatória e decisão formal.
- **Sem prazo regulatório prometido:** os cronogramas distinguem duração sob controle do
  projeto de prazos dependentes do operador, do avaliador e da ANAC.
- **Uma fonte oficial:** durante diagnóstico, preparação e shadow pilot, o papel continua
  oficial.
- **Escopo por operador e aeronave:** qualquer futura autorização e cutover deve refletir
  exatamente o escopo autorizado.
- **Responsabilidades separadas:** AirTrust, operador, avaliador independente e ANAC possuem
  papéis distintos e não intercambiáveis.
- **Evidência antes de declaração:** cada gate exige documentos, testes, registros e
  responsáveis identificados.
- **Sem alteração silenciosa de manuais:** este pacote produz planos, matrizes e minutas. Os
  manuais controlados do operador só podem ser alterados no processo próprio.
- **Sem ativação funcional implícita:** o pacote não autoriza migration, deploy, ativação por
  tenant, escrita regulada ou encerramento do papel.

## 3. Referências internas

O pacote deve ser usado em conjunto com:

- `../ANAC_EDB_REGULATORY_BASELINE_20260802.md`;
- `../ANAC_EDB_COMPLIANCE_MATRIX_20260802.csv`;
- `../ADR_EDB_REGULATED_RECORDS_BOUNDARY_20260802.md`;
- `../ANAC_EDB_RBAC135_SUBMISSION_PLAN_20260802.md`;
- `../ANAC_EDB_IMPLEMENTATION_PLAN_20260802.md`;
- `../ANAC_EDB_INDEPENDENT_CONFORMITY_RFP_20260802.md`;
- `../ANAC_EDB_RBAC135_MANUALS_CHANGE_MATRIX_20260802.md`;
- `../ANAC_EDB_SHADOW_PILOT_PROTOCOL_20260802.md`;
- `../fop200/README.md` e seus modelos auxiliares.

As normas, orientações e versões dos formulários oficiais devem ser reconfirmadas no momento
de cada protocolo.

## 4. Estrutura do serviço

### Fase 1 — Diagnóstico

**Objetivo:** conhecer o operador, o processo atual e as condições reais de implantação antes
de definir solução ou cronograma.

**Levantamento mínimo:**

- estrutura do operador e responsáveis;
- frota, modelos, matrículas e bases;
- processo atual do Diário de Bordo em papel;
- interfaces SIGVOOS, Controle de Voos e AirTrust;
- manuais, formulários e registros relacionados;
- perfis de operação, manutenção, administração, auditoria e suporte;
- dispositivos, conectividade e operação degradada;
- organizações de manutenção próprias e terceirizadas;
- guarda, retenção, backup e reconstituição;
- riscos operacionais, de segurança da informação, fatores humanos e transição.

**Saídas:** termo de abertura, questionário respondido, inventário de documentos, mapa de
stakeholders, riscos iniciais e relatório de diagnóstico.

**Gate D1 — Diagnóstico aceito:** escopo inicial, lacunas, premissas e pendências são
reconhecidos pelo operador e pelo AirTrust.

### Fase 2 — Projeto regulatório

**Objetivo:** converter o diagnóstico em estratégia regulatória rastreável, sem congelar
decisões ainda dependentes da ANAC.

**Trabalho mínimo:**

- preparação do FOP 200 e da reunião prévia;
- manutenção do registro de decisões pendentes;
- definição do método de cumprimento somente após orientação aplicável;
- adaptação da matriz de requisitos ao operador;
- plano de alteração de EO;
- plano de atualização dos manuais e documentos associados;
- plano de evidências, demonstrações e avaliação independente.

**Saídas:** pacote FOP 200 adaptado, matriz de requisitos do projeto, plano regulatório, plano
de manuais e plano de evidências.

**Gate R1 — Orientação registrada:** decisões que afetem arquitetura, assinatura,
PED/offline, fiscalização, avaliação independente e escopo documental possuem registro
rastreável ou permanecem explicitamente pendentes.

### Fase 3 — Preparação técnica

**Objetivo:** preparar pessoas, dados, dispositivos, procedimentos e ambiente controlado para
o shadow pilot.

**Trabalho mínimo:**

- cadastro e saneamento de dados;
- definição e validação de perfis e designações;
- inventário e preparação de dispositivos;
- planejamento de conectividade e contingência;
- controles de segurança e acesso;
- treinamento por perfil;
- preparação do ambiente shadow;
- testes de isolamento, backup, restauração e evidência;
- validação dos critérios de entrada.

**Saídas:** matriz de treinamento, plano de contingência, inventário validado, evidências de
testes e checklist de prontidão.

**Gate T1 — Pronto para shadow:** nenhum risco crítico ou alto impede o piloto e todas as
condições de entrada foram formalmente verificadas.

### Fase 4 — Shadow pilot

**Objetivo:** comparar o rascunho AirTrust com o Diário de Bordo oficial, testar o processo
completo e produzir evidência de prontidão.

**Planejamento mínimo:**

- escopo por operador, modelo, matrícula e base;
- papéis e janela do piloto;
- quantidade e variedade justificadas de casos;
- comparação estruturada com o papel;
- registro e classificação de divergências;
- critérios de interrupção e retomada;
- indicadores agregados, sem ranking individual;
- relatório de prontidão e plano de correções.

**Saídas:** roteiro aprovado, registros de execução, log de divergências, retestes e relatório
de prontidão.

**Gate S1 — Shadow concluído:** cenários planejados foram executados ou justificados,
divergências críticas e altas estão fechadas e as evidências foram congeladas.

### Fase 5 — Avaliação e submissão

**Objetivo:** consolidar evidências para avaliação independente, demonstração e processos
regulatórios aplicáveis.

**Trabalho mínimo:**

- coordenação da avaliação independente;
- entrega controlada de evidências técnicas e operacionais;
- suporte a ensaios e demonstrações;
- tratamento de achados e retestes;
- consolidação de pendências;
- relatório final do projeto;
- suporte às respostas e exigências, sem representar a ANAC nem o operador.

**Saídas:** data room de evidências, relatórios de avaliação e reteste, pacote de demonstração,
matriz final e apoio documental à submissão.

**Gate A1 — Elegível para decisão regulatória:** documentação e evidências estão coerentes
com o comportamento real, sem achados críticos ou altos abertos incompatíveis com submissão.

### Fase 6 — Cutover autorizado

**Objetivo:** executar a transição por aeronave somente após os atos e condições formais
aplicáveis.

**Trabalho mínimo:**

- checklist por aeronave;
- reconciliação de horas, ciclos, pousos, volumes, situação técnica e discrepâncias;
- abertura do volume digital;
- encerramento do papel no instante autorizado;
- suporte assistido;
- critérios e autoridade para reversão;
- validação funcional do primeiro caso real;
- relatório de estabilização.

**Saídas:** checklist assinado por aeronave, evidência de reconciliação, registro do instante de
cutover, validação do caso real e relatório de estabilização.

**Gate C1 — Cutover concluído:** a aeronave está dentro do escopo autorizado, a fonte oficial
foi alterada no instante formal definido e o primeiro caso real foi validado.

## 5. Gates do serviço

### D1 — Diagnóstico aceito

- Resultado: diagnóstico e escopo reconhecidos.
- Aceite: AirTrust e operador.
- Dependência externa possível: disponibilidade de pessoas, dados e documentos.

### R1 — Orientação registrada

- Resultado: orientação, decisões e pendências registradas.
- Aceite: operador e responsáveis do projeto.
- Dependência externa possível: ANAC.

### T1 — Pronto para shadow

- Resultado: ambiente, dados, pessoas, segurança e contingência prontos.
- Aceite: operador e AirTrust.
- Dependência externa possível: fornecedores e infraestrutura.

### S1 — Shadow concluído

- Resultado: shadow executado, divergências tratadas e evidências congeladas.
- Aceite: operador.
- Dependência externa possível: janela operacional e condições do processo regulatório.

### A1 — Elegível para decisão regulatória

- Resultado: avaliação e pacote coerentes.
- Aceite: operador e avaliador, cada qual no seu escopo.
- Dependência externa possível: avaliador independente e ANAC.

### C1 — Cutover concluído

- Resultado: cutover por aeronave e validação do primeiro caso real.
- Aceite: operador.
- Dependência externa necessária: ato autorizativo e condições da ANAC.

## 6. Arquivos do pacote

- `01_GOVERNANCE_AND_PROJECT_CONTROLS.md`: abertura, RACI, cronograma, comunicação,
  aceite e responsabilidades.
- `02_DIAGNOSTIC_AND_TECHNICAL_READINESS.md`: questionário, documentos, treinamento,
  contingência e prontidão.
- `03_SHADOW_PILOT_AND_READINESS_REPORTING.md`: roteiro, divergências, indicadores e
  relatório de prontidão.
- `04_CUTOVER_AND_SERVICE_CATALOG.md`: checklist de cutover, suporte, reversão, itens
  incluídos e exclusões.
- `05_REGULATORY_AND_EVIDENCE_PLANNING.md`: FOP 200, decisões, matriz de requisitos,
  alteração de EO, manuais, evidências, avaliação e demonstração.

## 7. Convenções de preenchimento

- usar `[OPERADOR]`, `[MATRÍCULA]`, `[BASE]`, `[RESPONSÁVEL]`, `[DATA]` e outros campos
  entre colchetes;
- não inserir dados reais em cópias mantidas no repositório público;
- armazenar evidências reais somente em local autorizado pelo operador;
- atribuir versão, proprietário, aprovadores e estado a cada artefato;
- registrar `N/A` com justificativa, nunca deixar lacuna silenciosa;
- marcar decisões pendentes como `PENDENTE — NÃO IMPLEMENTAR`;
- identificar explicitamente todo material shadow como não oficial.

## 8. Critério de conclusão do serviço

O serviço é considerado concluído apenas no marco contratado e aceito. A conclusão documental
do pacote não significa autorização operacional.

Quando o escopo incluir cutover, o encerramento exige:

- integração das decisões regulatórias aplicáveis;
- execução dos gates previstos;
- ato autorizativo e escopo conferidos;
- cutover por aeronave;
- validação funcional do primeiro caso real;
- entrega das evidências e pendências residuais;
- aceite formal do operador.
