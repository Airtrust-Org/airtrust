# Modelos — governança e controles do projeto

> **Uso:** copiar para o repositório controlado do projeto e preencher com dados verificados.
>
> **Restrição:** este arquivo não representa aprovação, ateste, aceitação ou autorização da
> ANAC.

## 1. Termo de abertura do projeto

### 1.1 Identificação

- Projeto: `Implantação do eDB AirTrust — [OPERADOR]`
- Patrocinador do operador: `[NOME/FUNÇÃO]`
- Gestor do projeto do operador: `[NOME/FUNÇÃO]`
- Gestor do projeto AirTrust: `[NOME/FUNÇÃO]`
- Responsável regulatório do operador: `[NOME/FUNÇÃO]`
- Responsável técnico AirTrust: `[NOME/FUNÇÃO]`
- Avaliador independente: `[PENDENTE/ENTIDADE]`
- Data de abertura: `[DATA]`
- Versão: `[VERSÃO]`
- Classificação: `[INTERNO/CONFIDENCIAL]`

### 1.2 Objetivo

Preparar o operador para avaliar, demonstrar e, somente após os atos aplicáveis, implantar o
eDB AirTrust no escopo formalmente autorizado.

### 1.3 Escopo inicial

- Operador: `[OPERADOR]`
- Bases: `[BASES]`
- Modelos de aeronave: `[MODELOS]`
- Matrículas candidatas: `[MATRÍCULAS]`
- Processos abrangidos: `[OPERAÇÃO/MANUTENÇÃO/TREINAMENTO/TI/OUTROS]`
- Interfaces: `[SIGVOOS/CONTROLE DE VOOS/OUTRAS]`
- Fase contratada: `[DIAGNÓSTICO ATÉ MARCO X]`

### 1.4 Fora do escopo inicial

- alteração não autorizada de código, banco, ambiente ou produção;
- substituição do Diário de Bordo em papel antes do ato aplicável;
- emissão de parecer regulatório em nome da ANAC;
- aprovação ou revisão formal de manuais pelo AirTrust;
- definição unilateral do método de assinatura;
- garantia de prazo de análise regulatória;
- operação de manutenção, despacho ou controle operacional pelo AirTrust;
- tratamento de dados fora do escopo e dos ambientes autorizados.

### 1.5 Premissas

- o papel permanece oficial até o cutover formal por aeronave;
- o operador fornecerá pessoas, documentos e dados necessários;
- decisões regulatórias serão registradas;
- evidências reais serão armazenadas em ambiente autorizado;
- mudanças com impacto no método de cumprimento passarão por controle formal;
- o avaliador independente será selecionado após confirmação de elegibilidade.

### 1.6 Restrições

- Restrição contratual: `[DESCREVER]`
- Restrição operacional: `[DESCREVER]`
- Restrição de dados: `[DESCREVER]`
- Janela de operação: `[DESCREVER]`
- Dependência externa: `[DESCREVER]`

### 1.7 Critérios de sucesso

- gates contratados concluídos e aceitos;
- responsabilidades e decisões rastreáveis;
- nenhuma confusão entre shadow e fonte oficial;
- divergências críticas e altas tratadas antes do avanço correspondente;
- documentação coerente com o comportamento real;
- evidências entregues e pendências residuais formalizadas;
- quando contratado, primeiro caso real validado após cutover autorizado.

### 1.8 Registro de riscos iniciais

#### R-01 — Decisão regulatória alterar arquitetura

- Probabilidade: `[BAIXA/MÉDIA/ALTA]`
- Impacto: `[BAIXO/MÉDIO/ALTO/CRÍTICO]`
- Tratamento: manter alternativas e não implementar decisão pendente.
- Dono: `[RESPONSÁVEL]`

#### R-02 — Dados cadastrais inconsistentes

- Probabilidade: `[BAIXA/MÉDIA/ALTA]`
- Impacto: `[BAIXO/MÉDIO/ALTO/CRÍTICO]`
- Tratamento: saneamento e reconciliação formal.
- Dono: `[RESPONSÁVEL]`

#### R-03 — Manuais divergirem do processo real

- Probabilidade: `[BAIXA/MÉDIA/ALTA]`
- Impacto: `[BAIXO/MÉDIO/ALTO/CRÍTICO]`
- Tratamento: revisão cruzada e demonstração.
- Dono: `[RESPONSÁVEL]`

#### R-04 — Indisponibilidade ou conectividade insuficiente

- Probabilidade: `[BAIXA/MÉDIA/ALTA]`
- Impacto: `[BAIXO/MÉDIO/ALTO/CRÍTICO]`
- Tratamento: contingência, PED reserva e testes.
- Dono: `[RESPONSÁVEL]`

#### R-05 — Carga de trabalho excessiva no shadow

- Probabilidade: `[BAIXA/MÉDIA/ALTA]`
- Impacto: `[BAIXO/MÉDIO/ALTO/CRÍTICO]`
- Tratamento: escopo pequeno, janela definida e critérios de interrupção.
- Dono: `[RESPONSÁVEL]`

#### R-06 — Atraso por dependência externa

- Probabilidade: `[BAIXA/MÉDIA/ALTA]`
- Impacto: `[BAIXO/MÉDIO/ALTO/CRÍTICO]`
- Tratamento: cronograma por gates, sem promessa de data regulatória.
- Dono: `[RESPONSÁVEL]`

### 1.9 Aprovação do termo

#### Operador

- Nome e função: `[NOME/FUNÇÃO]`
- Decisão: `[APROVAR/REVISAR]`
- Data: `[DATA]`
- Observação: `[TEXTO]`

#### AirTrust

- Nome e função: `[NOME/FUNÇÃO]`
- Decisão: `[APROVAR/REVISAR]`
- Data: `[DATA]`
- Observação: `[TEXTO]`

## 2. RACI do projeto

Legenda:

- **R:** executa a atividade;
- **A:** responde pela decisão ou aceite;
- **C:** deve ser consultado;
- **I:** deve ser informado.

A ANAC não recebe atribuição operacional do projeto. Seu papel é registrado somente nas
decisões regulatórias que lhe competem.

### 2.1 Governança e escopo

#### Definir o escopo comercial do serviço

- AirTrust: `R/A`
- Operador: `C`
- Avaliador independente: `I`
- ANAC: `I`

#### Fornecer dados e documentos reais

- AirTrust: `C`
- Operador: `R/A`
- Avaliador independente: `C`
- ANAC: `I`

#### Executar o diagnóstico

- AirTrust: `R`
- Operador: `R/A`
- Avaliador independente: `I`
- ANAC: `I`

#### Aprovar riscos operacionais do operador

- AirTrust: `C`
- Operador: `R/A`
- Avaliador independente: `C`
- ANAC: `I`

### 2.2 Projeto regulatório

#### Preparar o pacote FOP 200

- AirTrust: `R`
- Operador: `R/A`
- Avaliador independente: `C`
- ANAC: `I`

#### Protocolar documentos oficiais

- AirTrust: `C`
- Operador: `R/A`
- Avaliador independente: `I`
- ANAC: `I`

#### Orientar o método de cumprimento

- AirTrust: `I`
- Operador: `C`
- Avaliador independente: `C`
- ANAC: `A — decisão regulatória`

#### Definir o método técnico após orientação

- AirTrust: `R`
- Operador: `A`
- Avaliador independente: `C`
- ANAC: `I`

#### Atualizar os manuais reais

- AirTrust: `C`
- Operador: `R/A`
- Avaliador independente: `C`
- ANAC: `decisão aplicável`

### 2.3 Preparação e shadow pilot

#### Preparar o ambiente shadow

- AirTrust: `R`
- Operador: `A/C`
- Avaliador independente: `C`
- ANAC: `I`

#### Treinar usuários

- AirTrust: `R`
- Operador: `R/A`
- Avaliador independente: `C`
- ANAC: `I`

#### Operar o Diário de Bordo oficial em papel

- AirTrust: `I`
- Operador: `R/A`
- Avaliador independente: `I`
- ANAC: `I`

#### Executar o shadow pilot

- AirTrust: `R`
- Operador: `R/A`
- Avaliador independente: `C`
- ANAC: `I/C conforme o processo`

#### Registrar divergências

- AirTrust: `R`
- Operador: `R/A`
- Avaliador independente: `C`
- ANAC: `I`

### 2.4 Avaliação, submissão e cutover

#### Avaliar conformidade independentemente

- AirTrust: `C`
- Operador: `A como contratante`
- Avaliador independente: `R/A técnico`
- ANAC: `decisão de aceitabilidade`

#### Corrigir achados do produto

- AirTrust: `R/A`
- Operador: `C`
- Avaliador independente: `valida e retesta`
- ANAC: `I`

#### Corrigir procedimentos do operador

- AirTrust: `C`
- Operador: `R/A`
- Avaliador independente: `valida e retesta`
- ANAC: `I`

#### Emitir relatório independente

- AirTrust: `I`
- Operador: `C`
- Avaliador independente: `R/A`
- ANAC: `recebe e avalia`

#### Decidir ateste, aceitação ou autorização

- AirTrust: `I`
- Operador: `requerente`
- Avaliador independente: `fornece evidência`
- ANAC: `A`

#### Autorizar internamente o cutover após o ato

- AirTrust: `C`
- Operador: `R/A`
- Avaliador independente: `C`
- ANAC: `define condições externas`

#### Executar o cutover técnico

- AirTrust: `R`
- Operador: `R/A`
- Avaliador independente: `C`
- ANAC: `I`

#### Encerrar o papel no instante autorizado

- AirTrust: `I`
- Operador: `R/A`
- Avaliador independente: `I`
- ANAC: `condição regulatória`

#### Validar o primeiro caso real

- AirTrust: `R`
- Operador: `R/A`
- Avaliador independente: `C`
- ANAC: `I/C conforme o processo`

## 3. Cronograma por gates

### 3.1 Regras

- datas internas podem ser planejadas;
- datas dependentes da ANAC, avaliador, fornecedor ou disponibilidade operacional devem ser
  tratadas como estimativas condicionadas;
- nenhum gate é concluído sem evidência e aceite;
- atraso externo não pode ser mascarado por avanço técnico indevido;
- mudança de escopo exige revisão do cronograma e do termo de abertura.

### 3.2 Gate D1 — Diagnóstico aceito

- Entregáveis: termo, questionário, inventário, riscos e relatório.
- Predecessor: abertura do projeto.
- Início planejado: `[DATA]`
- Término planejado: `[DATA]`
- Dependência externa: acesso a pessoas, dados e documentos.
- Estado: `[NÃO INICIADO/EM EXECUÇÃO/BLOQUEADO/CONCLUÍDO]`

### 3.3 Gate R1 — Orientação registrada

- Entregáveis: FOP 200, decisões, matriz, plano de EO, manuais e evidências.
- Predecessor: D1.
- Início planejado: `[DATA]`
- Término planejado: `[CONDICIONADO]`
- Dependência externa: reunião ou orientação da ANAC.
- Estado: `[NÃO INICIADO/EM EXECUÇÃO/BLOQUEADO/CONCLUÍDO]`

### 3.4 Gate T1 — Pronto para shadow

- Entregáveis: dados, perfis, PED, treinamento, segurança e contingência.
- Predecessores: D1 e decisões aplicáveis.
- Início planejado: `[DATA]`
- Término planejado: `[DATA]`
- Dependência externa: dispositivos, fornecedores e infraestrutura.
- Estado: `[NÃO INICIADO/EM EXECUÇÃO/BLOQUEADO/CONCLUÍDO]`

### 3.5 Gate S1 — Shadow concluído

- Entregáveis: casos, divergências, retestes e relatório de prontidão.
- Predecessor: T1.
- Início planejado: `[DATA]`
- Término planejado: `[DATA]`
- Dependência externa: janela operacional.
- Estado: `[NÃO INICIADO/EM EXECUÇÃO/BLOQUEADO/CONCLUÍDO]`

### 3.6 Gate A1 — Elegível para decisão regulatória

- Entregáveis: avaliação, retestes, pacote final e demonstração.
- Predecessores: S1 e solução estável.
- Início planejado: `[DATA]`
- Término planejado: `[CONDICIONADO]`
- Dependência externa: avaliador independente e ANAC.
- Estado: `[NÃO INICIADO/EM EXECUÇÃO/BLOQUEADO/CONCLUÍDO]`

### 3.7 Gate C1 — Cutover concluído

- Entregáveis: checklist por aeronave, reconciliação, primeiro caso real e estabilização.
- Predecessor: ato aplicável.
- Início planejado: `[CONDICIONADO]`
- Término planejado: `[CONDICIONADO]`
- Dependência externa: autorização formal e suas condições.
- Estado: `[NÃO INICIADO/EM EXECUÇÃO/BLOQUEADO/CONCLUÍDO]`

### 3.8 Registro de decisão de gate

- Gate: `[D1/R1/T1/S1/A1/C1]`
- Evidências verificadas: `[LISTA]`
- Pendências aceitas: `[LISTA OU NENHUMA]`
- Decisão: `[AVANÇAR/NÃO AVANÇAR/AVANÇAR COM CONDIÇÃO]`
- Autoridade: `[NOME/FUNÇÃO]`
- Data: `[DATA]`
- Justificativa: `[TEXTO]`

## 4. Plano de comunicação

### 4.1 Comitê do projeto

- Conteúdo: status, riscos, decisões e gates.
- Canal: reunião e ata controlada.
- Cadência ou gatilho: `[SEMANAL/OUTRA]`
- Emissor: gestor do projeto.
- Registro: ata controlada.

### 4.2 Operações e tripulação

- Conteúdo: mudanças, treinamento, shadow e fonte oficial.
- Canal: briefing e comunicado.
- Cadência ou gatilho: antes de cada janela.
- Emissor: operador.
- Registro: lista de ciência.

### 4.3 Manutenção

- Conteúdo: situação técnica, divergências e contingência.
- Canal: reunião técnica.
- Cadência ou gatilho: por ciclo.
- Emissor: operador.
- Registro: ata ou issue controlada.

### 4.4 TI e segurança

- Conteúdo: acessos, dispositivos, incidentes e versões.
- Canal: canal técnico controlado.
- Cadência ou gatilho: contínuo ou por release.
- Emissor: AirTrust e operador.
- Registro: ticket ou log sanitizado.

### 4.5 Avaliador independente

- Conteúdo: evidências, achados, retestes e esclarecimentos.
- Canal: data room e reunião.
- Cadência ou gatilho: conforme plano de avaliação.
- Emissor: operador.
- Registro: índice de entrega.

### 4.6 ANAC

- Conteúdo: protocolos, respostas e demonstrações oficiais.
- Canal: canal oficial aplicável.
- Cadência ou gatilho: conforme o processo.
- Emissor: operador legitimado.
- Registro: SEI, comprovante ou referência oficial.

### 4.7 Mensagens obrigatórias

Toda comunicação de shadow deve declarar:

> **SHADOW MODE — RASCUNHO NÃO OFICIAL — O DIÁRIO DE BORDO EM PAPEL PERMANECE A FONTE
> OFICIAL.**

Toda comunicação de cronograma regulatório deve declarar que datas dependem da análise e das
decisões da autoridade.

### 4.8 Comunicação de incidente

#### Incidente crítico

- Quem aciona: qualquer participante.
- Destinatários: gestor, operador, segurança, GSO e AirTrust.
- Prazo interno: imediato.
- Conteúdo mínimo: fato, escopo, contenção e confirmação da fonte oficial preservada.

#### Incidente alto

- Quem aciona: responsável do processo.
- Destinatários: gestor e áreas afetadas.
- Prazo interno: conforme plano interno.
- Conteúdo mínimo: impacto, cenário suspenso e evidência preservada.

#### Incidente médio ou baixo

- Quem aciona: equipe do piloto.
- Destinatários: gestor do ciclo.
- Prazo interno: reunião do ciclo.
- Conteúdo mínimo: causa, correção e reteste.

## 5. Termo de aceite por marco

### 5.1 Identificação

- Projeto: `[PROJETO]`
- Marco: `[D1/R1/T1/S1/A1/C1]`
- Período avaliado: `[PERÍODO]`
- Versão do pacote: `[VERSÃO]`
- Versão ou commit do sistema, quando aplicável: `[IDENTIFICADOR]`

### 5.2 Entregáveis recebidos

- `[ENTREGÁVEL 1]`
- `[ENTREGÁVEL 2]`
- `[ENTREGÁVEL 3]`

### 5.3 Registro de pendência ou exclusão

Repetir este bloco para cada item:

- ID: `[IDENTIFICADOR]`
- Pendência ou exclusão: `[DESCRIÇÃO]`
- Responsável: `[PARTE/FUNÇÃO]`
- Prazo interno ou condição: `[DATA/CONDIÇÃO]`
- Bloqueia o próximo gate: `[SIM/NÃO]`
- Justificativa: `[TEXTO]`

### 5.4 Declarações

O aceite deste marco:

- confirma apenas a entrega do escopo descrito;
- não declara aprovação, certificação, aceitação, ateste ou autorização da ANAC;
- não autoriza substituir o papel, ativar modo oficial ou realizar cutover, salvo se este for o
  marco C1 e houver ato aplicável conferido;
- não transfere ao AirTrust responsabilidades regulatórias e operacionais do operador;
- não substitui o relatório do avaliador independente.

### 5.5 Decisão

Selecionar uma opção:

- [ ] Aceito.
- [ ] Aceito com pendências não bloqueantes.
- [ ] Não aceito.

#### Operador

- Nome e função: `[NOME/FUNÇÃO]`
- Assinatura conforme processo interno: `[REFERÊNCIA]`
- Data: `[DATA]`

#### AirTrust

- Nome e função: `[NOME/FUNÇÃO]`
- Assinatura conforme processo interno: `[REFERÊNCIA]`
- Data: `[DATA]`

#### Avaliador independente, quando aplicável

- Nome e função: `[NOME/FUNÇÃO]`
- Assinatura conforme processo próprio: `[REFERÊNCIA]`
- Data: `[DATA]`

## 6. Matriz de responsabilidades por domínio

### 6.1 Produto e arquitetura

- AirTrust: documentar, implementar e evidenciar o comportamento contratado.
- Operador: validar aderência ao processo e autorizar uso interno.
- Avaliador independente: testar desenho, implementação e eficácia.
- ANAC: avaliar o método e decidir no processo aplicável.

### 6.2 Dados cadastrais

- AirTrust: fornecer ferramentas e regras de validação.
- Operador: garantir correção, legitimidade e atualização.
- Avaliador independente: amostrar controles e reconciliações.
- ANAC: exigir e avaliar evidências quando aplicável.

### 6.3 Operação de voo

- AirTrust: suportar o fluxo do sistema.
- Operador: manter responsabilidade operacional integral.
- Avaliador independente: avaliar coerência do processo.
- ANAC: fiscalizar e decidir a autorização aplicável.

### 6.4 Manutenção e retorno ao serviço

- AirTrust: suportar registros e prerrogativas definidas.
- Operador: garantir conteúdo, aprovadores e conformidade.
- Avaliador independente: testar controles e evidências.
- ANAC: fiscalizar e decidir requisitos aplicáveis.

### 6.5 Manuais

- AirTrust: fornecer matrizes, descrições e evidências do produto.
- Operador: redigir, aprovar internamente e protocolar documentos reais.
- Avaliador independente: verificar coerência.
- ANAC: aprovar ou aceitar conforme aplicável.

### 6.6 Assinatura

- AirTrust: implementar somente o método decidido e proteger evidências.
- Operador: designar usuários e operar corretamente.
- Avaliador independente: avaliar identidade, intenção, integridade e não repúdio.
- ANAC: orientar ou aceitar o método no processo aplicável.

### 6.7 PED e offline

- AirTrust: implementar controles e suporte técnico.
- Operador: fornecer, guardar e operar dispositivos.
- Avaliador independente: testar cenários e controles.
- ANAC: orientar ou avaliar aceitabilidade.

### 6.8 Segurança e multi-tenancy

- AirTrust: implementar isolamento, IAM, logs e resposta do produto.
- Operador: administrar usuários e cumprir procedimentos locais.
- Avaliador independente: executar testes independentes.
- ANAC: avaliar evidências no processo.

### 6.9 Backup, DR e portabilidade

- AirTrust: operar controles contratados e demonstrar testes.
- Operador: definir continuidade local, responsabilidades e guarda.
- Avaliador independente: verificar eficácia.
- ANAC: estabelecer condições quando aplicável.

### 6.10 Shadow pilot

- AirTrust: fornecer ambiente, suporte e evidências.
- Operador: autorizar participantes, manter papel oficial e operar casos.
- Avaliador independente: observar ou amostrar quando contratado.
- ANAC: não é substituída pelo piloto.

### 6.11 Submissão

- AirTrust: fornecer documentos técnicos e respostas sobre o produto.
- Operador: atuar como requerente e protocolar.
- Avaliador independente: emitir relatório próprio.
- ANAC: decidir, exigir, aceitar ou negar.

### 6.12 Cutover

- AirTrust: executar tarefas técnicas previstas.
- Operador: decidir internamente após o ato, reconciliar e encerrar o papel.
- Avaliador independente: acompanhar quando contratado.
- ANAC: definir autorização, escopo e condições.

## 7. Controle de mudanças do projeto

Repetir este bloco para cada solicitação:

- ID: `[IDENTIFICADOR]`
- Descrição: `[SOLICITAÇÃO]`
- Origem: `[PARTE/FUNÇÃO]`
- Impacto regulatório: `[SIM/NÃO/PENDENTE]`
- Impacto em escopo, prazo ou custo: `[DESCRIÇÃO]`
- Decisão: `[APROVAR/REJEITAR/ADIAR]`
- Aprovadores: `[NOMES/FUNÇÕES]`
- Versão afetada: `[IDENTIFICADOR]`
- Evidências e anexos: `[REFERÊNCIAS]`

Mudanças que possam afetar assinatura, conteúdo canônico, offline, retenção, fiscalização,
bloqueios operacionais, situação técnica, papéis ou escopo autorizado devem permanecer
inativas no modo oficial até avaliação correspondente.
