# Modelos — governança e controles do projeto

> **Uso:** copiar para o repositório controlado do projeto e preencher com dados verificados.  
> **Restrição:** este arquivo não representa aprovação, ateste, aceitação ou autorização da ANAC.

## 1. Termo de abertura do projeto

### 1.1 Identificação

| Campo | Preenchimento |
|---|---|
| Projeto | Implantação do eDB AirTrust — `[OPERADOR]` |
| Patrocinador do operador | `[NOME/FUNÇÃO]` |
| Gestor do projeto do operador | `[NOME/FUNÇÃO]` |
| Gestor do projeto AirTrust | `[NOME/FUNÇÃO]` |
| Responsável regulatório do operador | `[NOME/FUNÇÃO]` |
| Responsável técnico AirTrust | `[NOME/FUNÇÃO]` |
| Avaliador independente | `[PENDENTE/ENTIDADE]` |
| Data de abertura | `[DATA]` |
| Versão | `[VERSÃO]` |
| Classificação | `[INTERNO/CONFIDENCIAL]` |

### 1.2 Objetivo

Preparar o operador para avaliar, demonstrar e, somente após os atos aplicáveis, implantar o eDB AirTrust no escopo formalmente autorizado.

### 1.3 Escopo inicial

- operador: `[OPERADOR]`;
- bases: `[BASES]`;
- modelos de aeronave: `[MODELOS]`;
- matrículas candidatas: `[MATRÍCULAS]`;
- processos abrangidos: `[OPERAÇÃO/MANUTENÇÃO/TREINAMENTO/TI/OUTROS]`;
- interfaces: `[SIGVOOS/CONTROLE DE VOOS/OUTRAS]`;
- fase contratada: `[DIAGNÓSTICO ATÉ MARCO X]`.

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

- `[RESTRIÇÃO CONTRATUAL]`;
- `[RESTRIÇÃO OPERACIONAL]`;
- `[RESTRIÇÃO DE DADOS]`;
- `[JANELA DE OPERAÇÃO]`;
- `[DEPENDÊNCIA EXTERNA]`.

### 1.7 Critérios de sucesso

- gates contratados concluídos e aceitos;
- responsabilidades e decisões rastreáveis;
- nenhuma confusão entre shadow e fonte oficial;
- divergências críticas/altas tratadas antes do avanço correspondente;
- documentação coerente com o comportamento real;
- evidências entregues e pendências residuais formalizadas;
- quando contratado, primeiro caso real validado após cutover autorizado.

### 1.8 Riscos iniciais

| ID | Risco | Probabilidade | Impacto | Tratamento | Dono |
|---|---|---:|---:|---|---|
| R-01 | decisão regulatória pendente alterar arquitetura | `[ ]` | `[ ]` | manter alternativas e não implementar decisão pendente | `[ ]` |
| R-02 | dados cadastrais inconsistentes | `[ ]` | `[ ]` | saneamento e reconciliação formal | `[ ]` |
| R-03 | manuais divergirem do processo real | `[ ]` | `[ ]` | revisão cruzada e demonstração | `[ ]` |
| R-04 | indisponibilidade/conectividade insuficiente | `[ ]` | `[ ]` | contingência, PED reserva e testes | `[ ]` |
| R-05 | carga de trabalho excessiva no shadow | `[ ]` | `[ ]` | escopo pequeno, janela e critérios de interrupção | `[ ]` |
| R-06 | atraso por dependência externa | `[ ]` | `[ ]` | cronograma por gates, sem promessa de data | `[ ]` |

### 1.9 Aprovação do termo

| Parte | Nome/função | Decisão | Data | Observação |
|---|---|---|---|---|
| Operador | `[ ]` | `[APROVAR/REVISAR]` | `[ ]` | `[ ]` |
| AirTrust | `[ ]` | `[APROVAR/REVISAR]` | `[ ]` | `[ ]` |

## 2. RACI do projeto

Legenda: **R** executa; **A** responde pela decisão/aceite; **C** consultado; **I** informado. A ANAC não recebe atribuição operacional do projeto; sua coluna registra decisões regulatórias quando aplicável.

| Atividade | AirTrust | Operador | Avaliador independente | ANAC |
|---|---|---|---|---|
| Definir escopo comercial do serviço | R/A | C | I | I |
| Fornecer dados e documentos reais | C | R/A | C | I |
| Executar diagnóstico | R | R/A | I | I |
| Aprovar riscos operacionais do operador | C | R/A | C | I |
| Preparar pacote FOP 200 | R | R/A | C | I |
| Protocolar documentos oficiais | C | R/A | I | I |
| Orientar método de cumprimento | I | C | C | A/decisão regulatória |
| Definir método técnico após orientação | R | A | C | I |
| Atualizar manuais reais | C | R/A | C | decisão aplicável |
| Preparar ambiente shadow | R | A/C | C | I |
| Treinar usuários | R | A/R | C | I |
| Operar o Diário de Bordo oficial em papel | I | R/A | I | I |
| Executar shadow pilot | R | R/A | C | I/C conforme processo |
| Registrar divergências | R | R/A | C | I |
| Avaliar conformidade independentemente | C | A contratante | R/A técnico | decisão de aceitabilidade |
| Corrigir achados do produto | R/A | C | valida/retesta | I |
| Corrigir procedimentos do operador | C | R/A | valida/retesta | I |
| Emitir relatório independente | I | C | R/A | recebe/avalia |
| Decidir ateste/aceitação/autorização | I | requerente | fornece evidência | A |
| Autorizar cutover interno após ato | C | R/A | C | define condições externas |
| Executar cutover técnico | R | A/R | C | I |
| Encerrar papel no instante autorizado | I | R/A | I | condição regulatória |
| Validar primeiro caso real | R | R/A | C | I/C conforme processo |

## 3. Cronograma por gates

### 3.1 Regras

- datas internas podem ser planejadas;
- datas dependentes de ANAC, avaliador, fornecedor ou disponibilidade operacional devem aparecer como estimativas condicionadas;
- nenhum gate é considerado concluído sem evidência e aceite;
- atraso externo não deve ser mascarado por avanço técnico indevido;
- mudança de escopo exige revisão do cronograma e do termo de abertura.

### 3.2 Modelo

| Fase | Gate | Entregáveis | Predecessores | Início planejado | Término planejado | Dependência externa | Estado |
|---|---|---|---|---|---|---|---|
| Diagnóstico | D1 | termo, questionário, inventário, riscos | abertura | `[ ]` | `[ ]` | acesso a pessoas/documentos | `[ ]` |
| Projeto regulatório | R1 | FOP 200, decisões, matriz, planos | D1 | `[ ]` | `[CONDICIONADO]` | reunião/orientação ANAC | `[ ]` |
| Preparação técnica | T1 | dados, perfis, PED, treinamento, contingência | D1 e decisões aplicáveis | `[ ]` | `[ ]` | dispositivos/fornecedores | `[ ]` |
| Shadow pilot | S1 | casos, divergências, retestes, relatório | T1 | `[ ]` | `[ ]` | janela operacional | `[ ]` |
| Avaliação/submissão | A1 | avaliação, retestes, pacote final | S1 e solução estável | `[ ]` | `[CONDICIONADO]` | avaliador/ANAC | `[ ]` |
| Cutover autorizado | C1 | checklist por aeronave, reconciliação, caso real | ato aplicável | `[CONDICIONADO]` | `[CONDICIONADO]` | autorização formal | `[ ]` |

### 3.3 Registro de decisão de gate

| Gate | Evidências verificadas | Pendências aceitas | Decisão | Autoridade | Data |
|---|---|---|---|---|---|
| `[D1/R1/T1/S1/A1/C1]` | `[LISTA]` | `[LISTA OU NENHUMA]` | `[AVANÇAR/NÃO AVANÇAR/AVANÇAR COM CONDIÇÃO]` | `[NOME/FUNÇÃO]` | `[DATA]` |

## 4. Plano de comunicação

### 4.1 Públicos e cadência

| Público | Conteúdo | Canal | Cadência/gatilho | Emissor | Registro |
|---|---|---|---|---|---|
| Comitê do projeto | status, riscos, decisões e gates | reunião/ata | `[SEMANAL]` | gestor do projeto | ata controlada |
| Operações e tripulação | mudanças, treinamento e shadow | briefing/comunicado | antes de cada janela | operador | lista de ciência |
| Manutenção | situação técnica, divergências e contingência | reunião técnica | por ciclo | operador | ata/issue controlada |
| TI e segurança | acessos, dispositivos, incidentes e versões | canal técnico | contínuo/por release | AirTrust + operador | ticket/log sanitizado |
| Avaliador independente | evidências e esclarecimentos | data room/reunião | plano de avaliação | operador | índice de entrega |
| ANAC | protocolo e respostas oficiais | canal oficial | conforme processo | operador legitimado | SEI/comprovante |

### 4.2 Mensagens obrigatórias

Toda comunicação de shadow deve declarar:

> **SHADOW MODE — RASCUNHO NÃO OFICIAL — O DIÁRIO DE BORDO EM PAPEL PERMANECE A FONTE OFICIAL.**

Toda comunicação de cronograma regulatório deve declarar que datas dependem da análise e das decisões da autoridade.

### 4.3 Comunicação de incidente

| Severidade | Quem aciona | Destinatários | Prazo interno | Conteúdo mínimo |
|---|---|---|---|---|
| Crítica | qualquer participante | gestor, operador, segurança, AirTrust | imediato | fato, escopo, contenção, fonte oficial preservada |
| Alta | responsável do processo | gestor e áreas afetadas | conforme plano interno | impacto, cenário suspenso, evidência |
| Média/baixa | equipe do piloto | gestor do ciclo | reunião do ciclo | causa, correção, reteste |

## 5. Termo de aceite por marco

### 5.1 Identificação

- projeto: `[PROJETO]`;
- marco: `[D1/R1/T1/S1/A1/C1]`;
- período avaliado: `[PERÍODO]`;
- versão do pacote: `[VERSÃO]`;
- versão/commit do sistema, quando aplicável: `[IDENTIFICADOR]`.

### 5.2 Entregáveis recebidos

- `[ENTREGÁVEL 1]`;
- `[ENTREGÁVEL 2]`;
- `[ENTREGÁVEL 3]`.

### 5.3 Pendências e exclusões

| ID | Pendência/exclusão | Responsável | Prazo interno/condição | Bloqueia próximo gate? |
|---|---|---|---|---|
| `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[SIM/NÃO]` |

### 5.4 Declarações

O aceite deste marco:

- confirma apenas a entrega do escopo descrito;
- não declara aprovação, certificação, aceitação, ateste ou autorização da ANAC;
- não autoriza substituir o papel, ativar modo oficial ou realizar cutover, salvo se este for o marco C1 e houver ato aplicável conferido;
- não transfere ao AirTrust responsabilidades regulatórias e operacionais do operador;
- não substitui o relatório do avaliador independente.

### 5.5 Decisão

- `[ ]` aceito;
- `[ ]` aceito com pendências não bloqueantes;
- `[ ]` não aceito.

| Parte | Nome/função | Assinatura conforme processo interno | Data |
|---|---|---|---|
| Operador | `[ ]` | `[ ]` | `[ ]` |
| AirTrust | `[ ]` | `[ ]` | `[ ]` |
| Avaliador, quando aplicável | `[ ]` | `[ ]` | `[ ]` |

## 6. Matriz de responsabilidades AirTrust × operador × avaliador × ANAC

| Domínio | AirTrust | Operador | Avaliador independente | ANAC |
|---|---|---|---|---|
| Produto e arquitetura | documentar, implementar e evidenciar o comportamento contratado | validar aderência ao processo e autorizar uso interno | testar desenho, implementação e eficácia | avaliar o método e decidir no processo |
| Dados cadastrais | fornecer ferramentas e regras de validação | garantir correção, legitimidade e atualização | amostrar controles | pode exigir evidências |
| Operação de voo | suportar o fluxo do sistema | manter responsabilidade operacional integral | avaliar coerência do processo | fiscalizar/decidir autorização |
| Manutenção e RTS | suportar registros e prerrogativas definidas | garantir conteúdo, aprovadores e conformidade | testar controles e evidências | fiscalizar/decidir requisitos |
| Manuais | fornecer matrizes, descrições e evidências do produto | redigir, aprovar internamente e protocolar documentos reais | verificar coerência | aprovar/aceitar conforme aplicável |
| Assinatura | implementar somente o método decidido e proteger evidências | designar usuários e operar corretamente | avaliar identidade, intenção, integridade e não repúdio | orientar/aceitar método |
| PED/offline | implementar controles e suporte técnico | fornecer, guardar e operar dispositivos | testar cenários e controles | orientar/avaliar aceitabilidade |
| Segurança e multi-tenancy | implementar isolamento, IAM, logs e resposta do produto | administrar usuários e cumprir procedimentos locais | executar testes independentes | avaliar evidência no processo |
| Backup/DR/portabilidade | operar controles contratados e demonstrar testes | definir responsabilidades, continuidade local e guarda | verificar eficácia | pode estabelecer condições |
| Shadow pilot | fornecer ambiente, suporte e evidências | autorizar participantes, manter papel oficial e operar casos | observar/amostrar quando contratado | não é substituída pelo piloto |
| Submissão | fornecer documentos técnicos e respostas do produto | atuar como requerente e protocolar | emitir relatório independente | decidir, exigir, aceitar ou negar |
| Cutover | executar tarefas técnicas previstas | decidir internamente após ato, reconciliar e encerrar papel | acompanhar se contratado | definir autorização e condições |

## 7. Controle de mudanças do projeto

| Solicitação | Origem | Impacto regulatório? | Impacto em escopo/prazo/custo? | Decisão | Aprovadores | Versão afetada |
|---|---|---|---|---|---|---|
| `[ID/DESCRIÇÃO]` | `[ ]` | `[SIM/NÃO/PENDENTE]` | `[ ]` | `[APROVAR/REJEITAR/ADIAR]` | `[ ]` | `[ ]` |

Mudanças que possam afetar assinatura, conteúdo canônico, offline, retenção, fiscalização, bloqueios operacionais, situação técnica, papéis ou escopo autorizado devem permanecer inativas no modo oficial até avaliação correspondente.
