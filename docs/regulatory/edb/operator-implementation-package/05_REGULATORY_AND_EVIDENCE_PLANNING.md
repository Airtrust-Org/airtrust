# Modelos — projeto regulatório, avaliação e evidências

> **Status:** modelos de planejamento. Devem ser adaptados às orientações registradas, aos formulários oficiais vigentes e aos documentos reais do operador.  
> **Restrição:** decisões pendentes não podem ser convertidas em requisitos técnicos definitivos por presunção.

## 1. Registro de decisões regulatórias e técnicas

| ID | Tema | Pergunta/decisão necessária | Alternativas consideradas | Responsável por obter resposta | Fonte da decisão | Estado | Impacto | Ação autorizada |
|---|---|---|---|---|---|---|---|---|
| DEC-001 | método de cumprimento | `[PERGUNTA]` | `[ALTERNATIVAS]` | `[OPERADOR]` | `[ATA/OFÍCIO/E-MAIL/PROCESSO]` | `[PENDENTE/ORIENTADO/DECIDIDO]` | `[ARQUITETURA/MANUAL/TESTE]` | `[NÃO IMPLEMENTAR/IMPLEMENTAR]` |

Regras:

- orientação verbal que afete arquitetura deve possuir confirmação rastreável;
- decisão pendente deve ser marcada `PENDENTE — NÃO IMPLEMENTAR`;
- cada decisão deve indicar a versão dos artefatos afetados;
- a decisão do operador não substitui a decisão da ANAC quando esta for exigida;
- mudança posterior deve preservar o histórico e reavaliar evidências já produzidas.

## 2. Plano do FOP 200 e reunião prévia

### 2.1 Controle do pacote

| Item | Fonte/modelo | Responsável | Versão | Estado | Observação |
|---|---|---|---|---|---|
| FOP 200 oficial vigente | página oficial ANAC | operador | `[DATA]` | `[ ]` | não alterar estrutura |
| carta de apresentação | `../fop200/COVER_LETTER_TEMPLATE.md` | operador + AirTrust | `[ ]` | `[ ]` | dados verificados |
| nota conceitual | baseline eDB | AirTrust | `[ ]` | `[ ]` | sem declaração de aprovação |
| arquitetura de alto nível | artefato controlado | AirTrust | `[ ]` | `[ ]` | alternativas pendentes identificadas |
| perguntas prioritárias | `../fop200/MEETING_SCRIPT.md` | equipe do projeto | `[ ]` | `[ ]` | ordenar por decisão bloqueante |
| ata | `../fop200/MINUTES_TEMPLATE.md` | operador | `[ ]` | `[ ]` | registrar participantes e respostas |
| registro de decisões | `../fop200/DECISION_REGISTER.csv` | gestor do projeto | `[ ]` | `[ ]` | atualizar após reunião |

### 2.2 Perguntas bloqueantes do projeto

- [ ] caminho de ateste/aceitação para SaaS multi-tenant;
- [ ] qualificação e escopo do avaliador independente;
- [ ] método de assinatura do PIC, manutenção e operador;
- [ ] operação PED/PWA, offline e sincronização;
- [ ] trusted timestamp e verificação tardia;
- [ ] forma de fiscalização, acesso e exportação;
- [ ] mudanças que exigem nova avaliação/aceitação;
- [ ] escopo dos manuais e demonstrações RBAC 135;
- [ ] condições do shadow pilot;
- [ ] estratégia e escopo de cutover por aeronave.

### 2.3 Critério R1

- [ ] protocolo e comprovante registrados;
- [ ] reunião realizada;
- [ ] ata aprovada pelo operador;
- [ ] decisões críticas registradas ou explicitamente pendentes;
- [ ] ADRs, backlog e planos atualizados apenas conforme respostas rastreáveis;
- [ ] nenhuma decisão pendente foi implementada como definitiva.

## 3. Matriz de requisitos do operador

| ID | Fonte/requisito | Aplicabilidade ao operador | Método de cumprimento proposto | Responsável AirTrust | Responsável operador | Evidência de desenho | Evidência de implementação | Evidência operacional | Avaliador | Decisão ANAC/gate | Estado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `[REQ]` | `[NORMA/ARTIGO]` | `[SIM/NÃO/JUSTIFICAR]` | `[PENDENTE/PROPOSTO/ORIENTADO]` | `[ ]` | `[ ]` | `[DOC/SEÇÃO]` | `[TESTE/BUILD]` | `[SHADOW/DRILL]` | `[EVIDÊNCIA]` | `[ ]` | `[ ]` |

Regras:

- usar como base a matriz canônica do eDB, sem sobrescrevê-la;
- toda exclusão deve possuir justificativa e aprovador;
- diferenciar desenho, implementação e eficácia operacional;
- apontar evidência exata, não declaração genérica;
- manter separado requisito do software, procedimento do operador e decisão regulatória.

## 4. Plano de alteração de EO

### 4.1 Escopo pretendido

- operador: `[OPERADOR]`;
- tipo de alteração: `[DESCRIÇÃO A CONFIRMAR]`;
- aeronaves/modelos/matrículas: `[ESCOPO]`;
- bases: `[ESCOPO]`;
- sistema e versão candidata: `[IDENTIFICADOR]`;
- data pretendida: `[CONDICIONADA À ANÁLISE E AO ATO]`.

### 4.2 Pacote previsto

| Documento/ação | Responsável | Processo/canal | Predecessor | Estado | Observação |
|---|---|---|---|---|---|
| FOP 219 vigente | operador | canal oficial | R1 | `[ ]` | reconfirmar versão |
| D-144-01 | operador | canal oficial | R1 | `[ ]` | preencher dados verificados |
| FAI | operador | canal oficial | R1 | `[ ]` | conforme aplicável |
| manuais revisados | operador | processos próprios | plano de manuais | `[ ]` | referenciar no pedido |
| checklist/relatório do software | AirTrust + avaliador + operador | processo aplicável | A1 | `[ ]` | escopo exato |
| demonstrações/inspeções | operador + AirTrust | conforme orientação | T1/S1/A1 | `[ ]` | roteiro versionado |
| TFAC | operador | canal oficial | antes do protocolo | `[ ]` | reconfirmar código/valor |

### 4.3 Dependências e não promessas

- a estratégia conjunta ou separada entre software e operador depende da orientação aplicável;
- datas de análise, exigência e decisão não são controladas pelo AirTrust;
- a lista de documentos pode ser ampliada pela autoridade;
- o plano não autoriza incluir aeronaves fora do escopo do ato.

## 5. Plano de atualização de manuais

| Documento/seção real | Lacuna identificada | Procedimento a revisar | Dono do operador | Contribuição AirTrust | Evidência do sistema | Processo de aprovação/aceitação | Estado |
|---|---|---|---|---|---|---|---|
| `[MGO SEÇÃO 10/OUTRO]` | `[ ]` | `[ ]` | `[ ]` | descrição, matriz e evidência | `[ ]` | `[ ]` | `[ ]` |

### 5.1 Conteúdos a verificar

- fonte oficial, aplicabilidade e escopo autorizado;
- abertura, preenchimento e encerramento de volumes;
- registro por etapa, tripulação, tempos, pousos, ciclos e combustível;
- revisão, assinatura e contrassinatura conforme método decidido;
- correções preservando original;
- situação técnica, discrepâncias e retorno ao serviço;
- PED/EFB, offline, atualização, guarda e dispositivo reserva;
- contingência, corrupção, perda e reconstituição;
- fiscalização, impressão, exportação e verificação;
- retenção, backup, restauração, transferência e descontinuidade;
- treinamento, reporte, incidente e gestão de mudança.

### 5.2 Controle de coerência

- [ ] procedimento do manual corresponde ao build candidato;
- [ ] nomenclatura e estados são iguais aos do sistema;
- [ ] bloqueios descritos existem e foram testados;
- [ ] responsabilidades pertencem a funções reais do operador;
- [ ] anexos e telas estão sincronizados com a versão;
- [ ] nenhuma capacidade futura é descrita como disponível;
- [ ] mudanças regulatórias permanecem controladas.

## 6. Plano de evidências

### 6.1 Índice de evidências

| ID | Requisito/risco | Evidência | Tipo | Ambiente | Versão/commit | Proprietário | Classificação | Local | Validade/reteste |
|---|---|---|---|---|---|---|---|---|---|
| EVD-001 | `[ ]` | `[TESTE/LOG/RELATÓRIO/SCREENSHOT/ATA]` | `[DESENHO/IMPLEMENTAÇÃO/EFICÁCIA]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |

### 6.2 Regras do data room

- acesso por menor privilégio e prazo;
- índice versionado e trilha de entrega;
- nenhuma cópia indiscriminada de produção;
- dados reais minimizados, pseudonimizados ou protegidos;
- segredos, tokens e credenciais excluídos;
- evidência vinculada a versão, ambiente e período;
- alteração posterior gera nova versão, não sobrescrita;
- retirada e destruição seguem contrato e política aplicável.

### 6.3 Pacotes de evidência

- governança e método de cumprimento;
- arquitetura, inventário e fronteiras;
- IAM, RBAC e multi-tenancy;
- assinatura, integridade e cadeia de versões;
- volumes, registros, correções e auditoria;
- situação técnica e manutenção;
- PED/offline e sincronização;
- SDLC, supply chain e CI/CD;
- infraestrutura, incidentes e observabilidade;
- backup, retenção, DR e portabilidade;
- fiscalização, impressão e exportação;
- privacidade e proteção de dados;
- treinamento, shadow e fatores humanos.

## 7. Plano de avaliação independente

### 7.1 Seleção

- [ ] elegibilidade esperada confirmada com a ANAC;
- [ ] independência e conflitos avaliados;
- [ ] equipe e qualificações comprovadas;
- [ ] escopo cobre software, infraestrutura, PED e procedimentos;
- [ ] ensaios técnicos e retestes definidos;
- [ ] proteção das evidências contratada;
- [ ] suporte a esclarecimentos regulatórios incluído.

### 7.2 Controle de achados

| ID | Requisito | Severidade | Evidência | Dono da correção | Plano | Versão de correção | Reteste | Estado |
|---|---|---|---|---|---|---|---|---|
| ACH-001 | `[ ]` | `[CRÍTICO/ALTO/MÉDIO/BAIXO/OBS.]` | `[ ]` | `[AIRTRUST/OPERADOR]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |

Nenhum achado crítico ou alto deve ser ocultado, reclassificado comercialmente ou encerrado sem evidência adequada de correção/reteste ou decisão formal aplicável.

## 8. Roteiro de demonstração

| Etapa | Cenário | Responsável | Evidência esperada | Resultado |
|---|---|---|---|---|
| 1 | autenticação, perfil e tenant | `[ ]` | acesso correto e negação indevida | `[ ]` |
| 2 | abertura e estado do volume | `[ ]` | sequência e saldos | `[ ]` |
| 3 | voo de uma/múltiplas etapas | `[ ]` | procedência e completude | `[ ]` |
| 4 | revisão e assinatura | `[ ]` | método autorizado e conteúdo vinculado | `[ ]` |
| 5 | troca de tripulação | `[ ]` | função e momento corretos | `[ ]` |
| 6 | discrepância e RTS | `[ ]` | prerrogativa, ação e ciência PIC | `[ ]` |
| 7 | correção | `[ ]` | original preservado | `[ ]` |
| 8 | PED/offline | `[ ]` | dados exigidos e sincronização | `[ ]` |
| 9 | fiscalização/exportação | `[ ]` | consulta e pacote verificável | `[ ]` |
| 10 | indisponibilidade/DR | `[ ]` | contingência, restore e auditoria | `[ ]` |

## 9. Relatório final de avaliação e submissão

### 9.1 Estrutura mínima do relatório do projeto

1. escopo, versões e período;
2. decisões regulatórias incorporadas e pendentes;
3. matriz de requisitos e evidências;
4. resultado do shadow pilot;
5. avaliação independente e retestes;
6. coerência entre sistema, manuais e treinamento;
7. demonstrações executadas;
8. riscos residuais e condições;
9. pendências por AirTrust, operador, avaliador e ANAC;
10. recomendação de avançar, repetir, reduzir escopo ou suspender.

### 9.2 Critério A1

- [ ] versão candidata congelada;
- [ ] documentação corresponde ao comportamento real;
- [ ] evidências possuem versão, ambiente e período;
- [ ] shadow concluiu S1;
- [ ] avaliação independente e retestes previstos concluídos;
- [ ] nenhum achado crítico/alto incompatível com submissão permanece aberto;
- [ ] manuais e treinamento estão alinhados;
- [ ] pacote de demonstração está repetível;
- [ ] pendências regulatórias estão explícitas;
- [ ] operador aprovou o pacote para o próximo passo.

A conclusão A1 indica prontidão documental e técnica para a decisão correspondente. Não constitui decisão favorável da ANAC.
