# Modelos — projeto regulatório, avaliação e evidências

> **Status:** modelos de planejamento. Devem ser adaptados às orientações registradas, aos
> formulários oficiais vigentes e aos documentos reais do operador.
>
> **Restrição:** decisões pendentes não podem ser convertidas em requisitos técnicos
> definitivos por presunção.

## 1. Registro de decisões regulatórias e técnicas

Repetir este bloco para cada decisão:

- ID: `[DEC-001]`
- Tema: `[ASSINATURA/PED/OFFLINE/FISCALIZAÇÃO/OUTRO]`
- Pergunta ou decisão necessária: `[TEXTO]`
- Alternativas consideradas: `[LISTA]`
- Premissas conhecidas: `[LISTA]`
- Responsável por obter a resposta: `[OPERADOR/FUNÇÃO]`
- Fonte da decisão: `[ATA/OFÍCIO/E-MAIL/PROCESSO]`
- Data da fonte: `[DATA]`
- Estado: `[PENDENTE/ORIENTADO/DECIDIDO/SUPERADO]`
- Impacto: `[ARQUITETURA/MANUAL/TESTE/TREINAMENTO/OUTRO]`
- Ação autorizada: `[NÃO IMPLEMENTAR/IMPLEMENTAR/REAVALIAR]`
- Versões afetadas: `[LISTA]`
- Evidência de incorporação: `[REFERÊNCIA]`
- Aprovador do registro: `[NOME/FUNÇÃO]`

Regras:

- orientação verbal que afete arquitetura deve possuir confirmação rastreável;
- decisão pendente deve ser marcada como `PENDENTE — NÃO IMPLEMENTAR`;
- cada decisão deve indicar a versão dos artefatos afetados;
- decisão do operador não substitui decisão da ANAC quando esta for exigida;
- mudança posterior deve preservar o histórico e reavaliar evidências já produzidas;
- resposta ambígua deve permanecer pendente até esclarecimento suficiente.

## 2. Plano do FOP 200 e reunião prévia

### 2.1 Controle do pacote

#### FOP 200 oficial vigente

- Fonte: página oficial da ANAC.
- Responsável: operador.
- Versão ou data confirmada: `[DATA]`
- Estado: `[PENDENTE/EM PREPARAÇÃO/PRONTO/PROTOCOLADO]`
- Observação: não alterar estrutura nem usar versão desatualizada.

#### Carta de apresentação

- Modelo: `../fop200/COVER_LETTER_TEMPLATE.md`
- Responsável: operador com apoio técnico do AirTrust.
- Versão: `[VERSÃO]`
- Estado: `[ESTADO]`
- Observação: usar somente dados verificados.

#### Nota conceitual

- Fonte: baseline eDB.
- Responsável: AirTrust.
- Versão: `[VERSÃO]`
- Estado: `[ESTADO]`
- Observação: não declarar aprovação, ateste, aceitação ou autorização.

#### Arquitetura de alto nível

- Fonte: artefato controlado.
- Responsável: AirTrust.
- Versão: `[VERSÃO]`
- Estado: `[ESTADO]`
- Observação: identificar alternativas e decisões pendentes.

#### Perguntas prioritárias

- Modelo: `../fop200/MEETING_SCRIPT.md`
- Responsável: equipe do projeto.
- Versão: `[VERSÃO]`
- Estado: `[ESTADO]`
- Observação: ordenar por decisão bloqueante.

#### Ata

- Modelo: `../fop200/MINUTES_TEMPLATE.md`
- Responsável: operador.
- Versão: `[VERSÃO]`
- Estado: `[ESTADO]`
- Observação: registrar participantes, perguntas, respostas e pendências.

#### Registro de decisões

- Modelo: `../fop200/DECISION_REGISTER.csv`
- Responsável: gestor do projeto.
- Versão: `[VERSÃO]`
- Estado: `[ESTADO]`
- Observação: atualizar após reunião e cada resposta posterior.

### 2.2 Perguntas bloqueantes do projeto

- [ ] Caminho de ateste ou aceitação para SaaS multi-tenant.
- [ ] Qualificação e escopo do avaliador independente.
- [ ] Método de assinatura do PIC, manutenção e operador.
- [ ] Operação PED ou PWA, offline e sincronização.
- [ ] Trusted timestamp e verificação tardia.
- [ ] Forma de fiscalização, acesso e exportação.
- [ ] Mudanças que exigem nova avaliação ou aceitação.
- [ ] Escopo dos manuais e demonstrações RBAC 135.
- [ ] Condições do shadow pilot.
- [ ] Estratégia e escopo de cutover por aeronave.
- [ ] Tratamento de indisponibilidade e reversão após cutover.
- [ ] Retenção, portabilidade e descontinuidade do fornecedor.

### 2.3 Preparação da reunião

- [ ] Participantes e papéis confirmados.
- [ ] Escopo do operador e da frota descrito sem extrapolação.
- [ ] Processo atual em papel resumido.
- [ ] Arquitetura atual e alternativas apresentadas separadamente.
- [ ] Decisões pendentes destacadas.
- [ ] Perguntas ordenadas por impacto e dependência.
- [ ] Materiais revisados pelo operador.
- [ ] Responsável pela ata e prazo de validação definidos.

### 2.4 Critério R1

- [ ] Protocolo e comprovante registrados.
- [ ] Reunião realizada.
- [ ] Ata aprovada pelo operador.
- [ ] Decisões críticas registradas ou explicitamente pendentes.
- [ ] ADRs, backlog e planos atualizados somente conforme respostas rastreáveis.
- [ ] Nenhuma decisão pendente foi implementada como definitiva.
- [ ] Condições para iniciar preparação técnica estão identificadas.

## 3. Matriz de requisitos do operador

Repetir este bloco para cada requisito:

- ID: `[REQ-IDENTIFICADOR]`
- Fonte e requisito: `[NORMA/ARTIGO/TEXTO CONTROLADO]`
- Versão ou data da fonte: `[DATA]`
- Aplicabilidade ao operador: `[SIM/NÃO/PENDENTE]`
- Justificativa de aplicabilidade: `[TEXTO]`
- Método de cumprimento proposto: `[PENDENTE/PROPOSTO/ORIENTADO]`
- Responsável AirTrust: `[NOME/FUNÇÃO]`
- Responsável do operador: `[NOME/FUNÇÃO]`
- Evidência de desenho: `[DOCUMENTO/SEÇÃO]`
- Evidência de implementação: `[TESTE/BUILD/CONFIGURAÇÃO]`
- Evidência operacional: `[SHADOW/DRILL/DEMONSTRAÇÃO]`
- Evidência do avaliador: `[REFERÊNCIA]`
- Decisão ANAC ou gate: `[REFERÊNCIA]`
- Estado: `[ABERTO/ATENDIDO/PARCIAL/NÃO APLICÁVEL/BLOQUEADO]`
- Risco residual: `[DESCRIÇÃO]`
- Próxima ação: `[AÇÃO]`

Regras:

- usar como base a matriz canônica do eDB sem sobrescrevê-la;
- toda exclusão deve possuir justificativa e aprovador;
- diferenciar desenho, implementação e eficácia operacional;
- apontar evidência exata, não declaração genérica;
- manter separado requisito do software, procedimento do operador e decisão regulatória;
- preservar histórico quando o método de cumprimento mudar.

## 4. Plano de alteração de EO

### 4.1 Escopo pretendido

- Operador: `[OPERADOR]`
- Tipo de alteração: `[DESCRIÇÃO A CONFIRMAR]`
- Modelos: `[ESCOPO]`
- Matrículas: `[ESCOPO]`
- Bases: `[ESCOPO]`
- Sistema e versão candidata: `[IDENTIFICADOR]`
- Data pretendida: `[CONDICIONADA À ANÁLISE E AO ATO]`
- Condições conhecidas: `[LISTA]`
- Pendências: `[LISTA]`

### 4.2 FOP 219 vigente

- Responsável: operador.
- Processo ou canal: oficial aplicável.
- Predecessor: R1.
- Estado: `[ESTADO]`
- Ação: reconfirmar versão antes do uso.

### 4.3 D-144-01

- Responsável: operador.
- Processo ou canal: oficial aplicável.
- Predecessor: R1.
- Estado: `[ESTADO]`
- Ação: preencher somente dados verificados.

### 4.4 FAI

- Responsável: operador.
- Processo ou canal: oficial aplicável.
- Predecessor: R1.
- Estado: `[ESTADO]`
- Ação: usar quando aplicável e na versão vigente.

### 4.5 Manuais revisados

- Responsável: operador.
- Contribuição AirTrust: matriz, descrição técnica e evidências.
- Predecessor: plano de manuais.
- Estado: `[ESTADO]`
- Ação: referenciar versões controladas no pedido.

### 4.6 Relatório e evidências do software

- Responsáveis: AirTrust, avaliador e operador dentro de seus escopos.
- Predecessor: A1.
- Estado: `[ESTADO]`
- Ação: limitar ao escopo e versão avaliados.

### 4.7 Demonstrações e inspeções

- Responsáveis: operador e AirTrust.
- Processo: conforme orientação registrada.
- Predecessores: T1, S1 ou A1, conforme o caso.
- Estado: `[ESTADO]`
- Ação: usar roteiro versionado e ambiente identificado.

### 4.8 TFAC

- Responsável: operador.
- Predecessor: protocolo aplicável.
- Estado: `[ESTADO]`
- Ação: reconfirmar código, valor e comprovante.

### 4.9 Dependências e não promessas

- a estratégia conjunta ou separada entre software e operador depende da orientação aplicável;
- datas de análise, exigência e decisão não são controladas pelo AirTrust;
- a lista de documentos pode ser ampliada pela autoridade;
- o plano não autoriza incluir aeronaves fora do escopo do ato;
- alteração do escopo pode exigir nova avaliação, demonstração ou documentação.

## 5. Plano de atualização de manuais

### 5.1 Registro por documento ou seção

Repetir este bloco para cada documento ou seção real:

- Documento e seção: `[MGO SEÇÃO/OUTRO]`
- Proprietário do documento: `[FUNÇÃO DO OPERADOR]`
- Versão atual: `[VERSÃO]`
- Lacuna identificada: `[DESCRIÇÃO]`
- Procedimento a revisar: `[DESCRIÇÃO]`
- Dono da revisão: `[NOME/FUNÇÃO]`
- Contribuição AirTrust: `[DESCRIÇÃO/MATRIZ/EVIDÊNCIA]`
- Evidência do sistema: `[REFERÊNCIA]`
- Processo de aprovação ou aceitação: `[DESCRIÇÃO]`
- Estado: `[NÃO INICIADO/EM REVISÃO/APROVADO/PROTOCOLADO/VIGENTE]`
- Data de eficácia: `[DATA OU PENDENTE]`
- Dependências: `[LISTA]`

### 5.2 Conteúdos a verificar

- fonte oficial, aplicabilidade e escopo autorizado;
- abertura, preenchimento e encerramento de volumes;
- registro por etapa, tripulação, tempos, pousos, ciclos e combustível;
- revisão, assinatura e contrassinatura conforme método decidido;
- correções preservando o original;
- situação técnica, discrepâncias e retorno ao serviço;
- PED e EFB, offline, atualização, guarda e dispositivo reserva;
- contingência, corrupção, perda e reconstituição;
- fiscalização, impressão, exportação e verificação;
- retenção, backup, restauração, transferência e descontinuidade;
- treinamento, reporte, incidente e gestão de mudança;
- processo de cutover, reversão e estabilização.

### 5.3 Controle de coerência

- [ ] Procedimento do manual corresponde ao build candidato.
- [ ] Nomenclatura e estados são iguais aos do sistema.
- [ ] Bloqueios descritos existem e foram testados.
- [ ] Responsabilidades pertencem a funções reais do operador.
- [ ] Anexos e telas estão sincronizados com a versão.
- [ ] Nenhuma capacidade futura é descrita como disponível.
- [ ] Mudanças regulatórias permanecem controladas.
- [ ] Procedimento shadow declara o papel como fonte oficial.
- [ ] Procedimento de cutover exige ato e escopo aplicáveis.
- [ ] Contingência evita dupla fonte oficial.

## 6. Plano de evidências

### 6.1 Índice de evidência

Repetir este bloco para cada evidência:

- ID: `[EVD-001]`
- Requisito ou risco: `[REFERÊNCIA]`
- Evidência: `[TESTE/LOG/RELATÓRIO/SCREENSHOT/ATA/EXPORTAÇÃO]`
- Tipo: `[DESENHO/IMPLEMENTAÇÃO/EFICÁCIA]`
- Ambiente: `[AMBIENTE]`
- Versão ou commit: `[IDENTIFICADOR]`
- Período: `[DATA INICIAL/DATA FINAL]`
- Proprietário: `[PARTE/FUNÇÃO]`
- Classificação: `[CLASSIFICAÇÃO]`
- Local: `[REPOSITÓRIO AUTORIZADO]`
- Hash ou identificador: `[VALOR]`
- Validade ou gatilho de reteste: `[CONDIÇÃO]`
- Revisor: `[NOME/FUNÇÃO]`
- Estado: `[RASCUNHO/VALIDADA/SUBSTITUÍDA/RETIDA]`

### 6.2 Regras do data room

- acesso por menor privilégio e prazo;
- índice versionado e trilha de entrega;
- nenhuma cópia indiscriminada de produção;
- dados reais minimizados, pseudonimizados ou protegidos;
- segredos, tokens e credenciais excluídos;
- evidência vinculada a versão, ambiente e período;
- alteração posterior gera nova versão, não sobrescrita;
- retirada e destruição seguem contrato e política aplicável;
- acesso do avaliador é separado do acesso operacional;
- exportação preserva classificação e cadeia de custódia.

### 6.3 Pacote de governança e método de cumprimento

Incluir:

- termo de abertura;
- decisões e atas;
- matriz de requisitos;
- RACI;
- gates e aceites;
- registro de mudanças.

### 6.4 Pacote de arquitetura e fronteiras

Incluir:

- arquitetura;
- fluxos de dados;
- inventário de componentes;
- fronteira regulada;
- contratos e schemas;
- dependências e fornecedores.

### 6.5 Pacote de IAM, RBAC e multi-tenancy

Incluir:

- modelo de perfis;
- designações;
- menor privilégio;
- segregação de deveres;
- testes de isolamento;
- revogação;
- acesso privilegiado;
- acesso de fiscalização.

### 6.6 Pacote de assinatura, integridade e versões

Incluir somente após decisão aplicável:

- método de assinatura;
- identidade e intenção;
- conteúdo assinado;
- timestamp;
- verificação;
- imutabilidade;
- correções e cadeia de versões;
- replay e revogação.

### 6.7 Pacote de volumes e registros

Incluir:

- abertura e encerramento;
- sequência;
- saldos;
- etapas;
- tripulação;
- correções;
- auditoria;
- impressão e exportação.

### 6.8 Pacote de situação técnica e manutenção

Incluir:

- fonte de situação técnica;
- discrepâncias;
- ações corretivas e retardadas;
- retorno ao serviço;
- prerrogativas;
- ciência do PIC;
- atualização entre etapas;
- operação com terceiros.

### 6.9 Pacote PED, offline e sincronização

Incluir:

- dispositivo e MDM;
- versão mínima;
- pacote offline;
- expiração e corrupção;
- fila e ordem;
- conflitos;
- revogação;
- dispositivo reserva;
- sincronização e reconciliação.

### 6.10 Pacote SDLC, supply chain e CI/CD

Incluir:

- repositório e branch protections;
- revisão e testes;
- dependências e lockfile;
- artefatos de build;
- release manifest;
- segregação de ambientes;
- aprovação de produção;
- rollback e incidentes de release.

### 6.11 Pacote infraestrutura, incidentes e observabilidade

Incluir:

- arquitetura de ambiente;
- disponibilidade;
- monitoração;
- correlação;
- alertas;
- logs sanitizados;
- resposta a incidentes;
- evidências de recuperação.

### 6.12 Pacote backup, retenção, DR e portabilidade

Incluir:

- política de retenção;
- backup;
- cópia independente;
- restore;
- RTO e RPO;
- corrupção;
- exportação;
- transferência;
- descontinuidade do fornecedor.

### 6.13 Pacote fiscalização e verificação

Incluir:

- acesso segregado;
- pesquisa;
- impressão;
- exportação;
- pacote verificável;
- validação offline;
- tenant correto;
- trilha de auditoria.

### 6.14 Pacote treinamento, shadow e fatores humanos

Incluir:

- matriz de treinamento;
- materiais e versões;
- avaliações práticas;
- protocolo de shadow;
- divergências;
- indicadores agregados;
- carga de trabalho;
- relatório de prontidão.

## 7. Plano de avaliação independente

### 7.1 Seleção

- [ ] Elegibilidade esperada confirmada com a ANAC.
- [ ] Independência e conflitos avaliados.
- [ ] Equipe e qualificações comprovadas.
- [ ] Escopo cobre software, infraestrutura, PED e procedimentos.
- [ ] Ensaios técnicos e retestes definidos.
- [ ] Proteção das evidências contratada.
- [ ] Suporte a esclarecimentos regulatórios incluído.
- [ ] Critérios de severidade e fechamento acordados.
- [ ] Direito de acesso e limites do ambiente definidos.

### 7.2 Plano de trabalho do avaliador

- Objetivo: `[DESCRIÇÃO]`
- Escopo: `[COMPONENTES/PROCESSOS/AMBIENTES]`
- Exclusões: `[LISTA JUSTIFICADA]`
- Requisitos de referência: `[LISTA]`
- Métodos: `[REVISÃO/TESTE/ENTREVISTA/OBSERVAÇÃO]`
- Amostragem: `[CRITÉRIO]`
- Cronograma interno: `[MARCOS]`
- Entregáveis: `[LISTA]`
- Critérios de severidade: `[REFERÊNCIA]`
- Processo de reteste: `[DESCRIÇÃO]`
- Proteção de dados: `[DESCRIÇÃO]`
- Escalonamento de achado crítico: `[DESCRIÇÃO]`

### 7.3 Controle de achado

Repetir este bloco para cada achado:

- ID: `[ACH-001]`
- Requisito: `[REFERÊNCIA]`
- Severidade: `[CRÍTICO/ALTO/MÉDIO/BAIXO/OBSERVAÇÃO]`
- Descrição: `[TEXTO]`
- Evidência: `[REFERÊNCIA]`
- Dono da correção: `[AIRTRUST/OPERADOR]`
- Plano: `[AÇÃO]`
- Prazo interno: `[DATA]`
- Versão de correção: `[IDENTIFICADOR]`
- Evidência de reteste: `[REFERÊNCIA]`
- Resultado do reteste: `[APROVADO/REPROVADO/PARCIAL]`
- Estado: `[ABERTO/EM CORREÇÃO/EM RETESTE/FECHADO]`
- Aprovador do fechamento: `[AVALIADOR]`

Nenhum achado crítico ou alto deve ser ocultado, reclassificado comercialmente ou encerrado
sem evidência adequada de correção e reteste ou decisão formal aplicável.

## 8. Roteiro de demonstração

### 8.1 Preparação

- [ ] Ambiente e versão identificados.
- [ ] Dados autorizados ou sintéticos preparados.
- [ ] Perfis e dispositivos disponíveis.
- [ ] Roteiro, responsáveis e tempos definidos.
- [ ] Evidências e gravações autorizadas.
- [ ] Contingência preparada.
- [ ] Decisões pendentes claramente identificadas.

### 8.2 Cenário 1 — Autenticação, perfil e tenant

- Responsável: `[NOME/FUNÇÃO]`
- Evidência esperada: acesso correto e negação indevida.
- Resultado: `[REGISTRAR]`
- Divergência: `[REFERÊNCIA OU NENHUMA]`

### 8.3 Cenário 2 — Abertura e estado do volume

- Responsável: `[NOME/FUNÇÃO]`
- Evidência esperada: sequência, snapshots e saldos.
- Resultado: `[REGISTRAR]`
- Divergência: `[REFERÊNCIA OU NENHUMA]`

### 8.4 Cenário 3 — Voo de uma ou múltiplas etapas

- Responsável: `[NOME/FUNÇÃO]`
- Evidência esperada: procedência, completude e cálculos.
- Resultado: `[REGISTRAR]`
- Divergência: `[REFERÊNCIA OU NENHUMA]`

### 8.5 Cenário 4 — Revisão e assinatura

- Responsável: `[NOME/FUNÇÃO]`
- Evidência esperada: método autorizado e conteúdo vinculado.
- Resultado: `[REGISTRAR]`
- Divergência: `[REFERÊNCIA OU NENHUMA]`

### 8.6 Cenário 5 — Troca de tripulação

- Responsável: `[NOME/FUNÇÃO]`
- Evidência esperada: função e momento corretos.
- Resultado: `[REGISTRAR]`
- Divergência: `[REFERÊNCIA OU NENHUMA]`

### 8.7 Cenário 6 — Discrepância e retorno ao serviço

- Responsável: `[NOME/FUNÇÃO]`
- Evidência esperada: prerrogativa, ação e ciência do PIC.
- Resultado: `[REGISTRAR]`
- Divergência: `[REFERÊNCIA OU NENHUMA]`

### 8.8 Cenário 7 — Correção

- Responsável: `[NOME/FUNÇÃO]`
- Evidência esperada: original preservado e nova versão vinculada.
- Resultado: `[REGISTRAR]`
- Divergência: `[REFERÊNCIA OU NENHUMA]`

### 8.9 Cenário 8 — PED e offline

- Responsável: `[NOME/FUNÇÃO]`
- Evidência esperada: dados exigidos, expiração e sincronização.
- Resultado: `[REGISTRAR]`
- Divergência: `[REFERÊNCIA OU NENHUMA]`

### 8.10 Cenário 9 — Fiscalização e exportação

- Responsável: `[NOME/FUNÇÃO]`
- Evidência esperada: consulta, escopo e pacote verificável.
- Resultado: `[REGISTRAR]`
- Divergência: `[REFERÊNCIA OU NENHUMA]`

### 8.11 Cenário 10 — Indisponibilidade e DR

- Responsável: `[NOME/FUNÇÃO]`
- Evidência esperada: contingência, restore, reconciliação e auditoria.
- Resultado: `[REGISTRAR]`
- Divergência: `[REFERÊNCIA OU NENHUMA]`

## 9. Relatório final de avaliação e submissão

### 9.1 Estrutura mínima

- escopo, versões e período;
- decisões regulatórias incorporadas e pendentes;
- matriz de requisitos e evidências;
- resultado do shadow pilot;
- avaliação independente e retestes;
- coerência entre sistema, manuais e treinamento;
- demonstrações executadas;
- riscos residuais e condições;
- pendências por AirTrust, operador, avaliador e ANAC;
- recomendação de avançar, repetir, reduzir escopo ou suspender.

### 9.2 Registro de pendência final

Repetir este bloco para cada item:

- ID: `[IDENTIFICADOR]`
- Descrição: `[TEXTO]`
- Categoria: `[AIRTRUST/OPERADOR/AVALIADOR/ANAC]`
- Impacto: `[DESCRIÇÃO]`
- Bloqueia A1: `[SIM/NÃO]`
- Responsável: `[NOME/FUNÇÃO]`
- Condição de fechamento: `[DESCRIÇÃO]`
- Evidência: `[REFERÊNCIA]`

### 9.3 Critério A1

- [ ] Versão candidata congelada.
- [ ] Documentação corresponde ao comportamento real.
- [ ] Evidências possuem versão, ambiente e período.
- [ ] Shadow concluiu S1.
- [ ] Avaliação independente e retestes previstos foram concluídos.
- [ ] Nenhum achado crítico ou alto incompatível com submissão permanece aberto.
- [ ] Manuais e treinamento estão alinhados.
- [ ] Pacote de demonstração está repetível.
- [ ] Pendências regulatórias estão explícitas.
- [ ] Operador aprovou o pacote para o próximo passo.

A conclusão A1 indica prontidão documental e técnica para a decisão correspondente. Não
constitui decisão favorável da ANAC.
