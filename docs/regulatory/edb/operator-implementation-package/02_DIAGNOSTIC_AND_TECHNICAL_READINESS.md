# Modelos — diagnóstico e prontidão técnica

> **Uso:** aplicar ao operador real em ambiente documental controlado.  
> **Restrição:** não inserir dados reais em cópias públicas deste modelo.

## 1. Questionário de diagnóstico

### 1.1 Operador e governança

1. Qual é a razão social, designador, número do COA e estrutura de responsabilidades aplicável?
2. Quem são o gestor responsável, Diretor de Operações, Diretor de Manutenção, GSO, TI, segurança da informação, treinamento e compliance?
3. Quem será o patrocinador e quem poderá aceitar cada gate do projeto?
4. Quais unidades, bases e organizações terceiras participarão?
5. Quais processos dependem hoje do Diário de Bordo em papel?
6. Quais riscos de mudança já foram identificados no SGSO?
7. Há projetos paralelos que alterem frota, manuais, SIGVOOS, manutenção, EFB/PED ou infraestrutura?

### 1.2 Frota e bases

1. Quais modelos, números de série e matrículas existem?
2. Quais aeronaves são candidatas ao diagnóstico, shadow e futuro cutover?
3. Quais aeronaves possuem particularidades de operação, manutenção ou conectividade?
4. Quais bases são principais, remotas, offshore ou com conectividade limitada?
5. Onde ficam os volumes em papel e como são movimentados?
6. Existem aeronaves arrendadas, compartilhadas, transferidas ou em manutenção prolongada?
7. Como são tratados mudança de marcas, proprietário e operador?

### 1.3 Processo atual em papel

1. Quem abre, preenche, revisa, assina, contrassina, guarda e encerra volumes?
2. Em que momento cada campo é preenchido?
3. Como são tratadas múltiplas etapas, troca de tripulação e jornada atravessando meia-noite?
4. Como são registradas correções, rasuras, addenda e reconstituições?
5. Como são controlados saldos de horas, ciclos e pousos?
6. Como são registradas discrepâncias, ações corretivas, ações retardadas e retorno ao serviço?
7. Como o PIC toma ciência da situação técnica?
8. Como é atendida uma fiscalização?
9. Como são tratados perda, dano, indisponibilidade e reconstrução de volume?
10. Quais divergências recorrentes já existem no processo em papel?

### 1.4 SIGVOOS, Controle de Voos e AirTrust

1. Quais dados entram por integração, importação ou digitação manual?
2. Qual sistema é fonte para cada campo?
3. Como são identificadas procedência, horário de coleta, unidade e timezone?
4. Existem conflitos entre SIGVOOS, RDV, coordenação e papel?
5. Quais tabelas, relatórios ou telas são usadas operacionalmente?
6. Quem pode corrigir dados e como a correção é rastreada?
7. Quais integrações podem ficar indisponíveis e qual o comportamento esperado?
8. Há dependência de dados de terceiros ou formatos não controlados?
9. Quais dados não podem ser presumidos ou transformados silenciosamente?

### 1.5 Manuais e documentos

1. Qual é a estrutura real do MGE/MGO e seus documentos associados?
2. Onde estão hoje os procedimentos de Diário de Bordo, EFB/PED, manutenção, contingência, treinamento e fiscalização?
3. Quais capítulos são aprovados e quais são aceitos?
4. Quais formulários, listas de páginas efetivas e anexos controlados existem?
5. Como revisões são aprovadas, distribuídas e colocadas em vigor?
6. Quais documentos de manutenção cobrem situação técnica e RTS?
7. Há MEL/NEF/ACR ou outro documento afetado pelo uso do PED/eDB?
8. Quais contratos com fornecedores precisam ser revisados?
9. Quais documentos não podem ser compartilhados com o AirTrust ou avaliador sem autorização específica?

### 1.6 Perfis, identidade e designações

1. Quais perfis usarão o eDB: PIC, SIC, OCC, manutenção, designado do operador, administrador, auditor, fiscal interno, suporte?
2. Como identidade, CANAC, função, licença, habilitação e prerrogativa são validadas?
3. Quem designa e revoga usuários?
4. Como são tratadas substituições, afastamentos e desligamentos?
5. Existem usuários de organizações de manutenção terceiras?
6. Como será segregado acesso de fiscalização?
7. Há funções incompatíveis que exigem segregação de deveres?
8. Quais decisões sobre assinatura permanecem pendentes?

### 1.7 Equipamentos, PED e conectividade

1. Quais dispositivos são usados ou pretendidos?
2. Quem é proprietário, administrador e custodiante dos dispositivos?
3. Há MDM, bloqueio, cifragem, atualização e revogação?
4. Quais bases e rotas têm conectividade insuficiente?
5. Qual é a autonomia, fonte de energia e equipamento reserva?
6. Como são tratadas perda, furto, dano e troca de dispositivo?
7. Existem restrições de uso em fases críticas do voo?
8. Há determinação de não interferência e procedimento EFB/PED aplicável?
9. Como são validados versão mínima, atualização e downgrade?
10. Quais dados precisam permanecer disponíveis offline?

### 1.8 Segurança, retenção e continuidade

1. Qual política de IAM, logs, incidentes e acesso privilegiado existe?
2. Quais dados são pessoais, operacionais, técnicos ou sigilosos?
3. Onde os registros e evidências são armazenados?
4. Qual retenção é exigida e quem responde por ela?
5. Como funcionam backup, restauração, RTO, RPO e detecção de corrupção?
6. Há cópia independente e teste periódico de restauração?
7. Como ocorre transferência de propriedade, exportação e portabilidade?
8. Qual o plano para descontinuidade do fornecedor?
9. Como incidentes regulatórios serão comunicados?
10. Quais fornecedores críticos e responsabilidades compartilhadas existem?

### 1.9 Treinamento e fatores humanos

1. Quais perfis precisam de treinamento inicial, diferenças e recorrente?
2. Quais tarefas são críticas e quais erros previsíveis devem ser treinados?
3. Como será avaliada competência prática?
4. Há risco de duplicação de carga de trabalho durante o shadow?
5. Como usuários reportarão dificuldade sem mascarar divergências?
6. Quais mensagens, bloqueios e nomenclaturas podem induzir erro?
7. Como será tratado treinamento de contingência e dispositivo reserva?

### 1.10 Riscos operacionais

Para cada perigo, registrar causa, consequência, barreiras atuais, risco inicial, ações, dono e risco residual.

| ID | Perigo | Consequência | Barreiras atuais | Risco inicial | Ação | Dono | Risco residual |
|---|---|---|---|---|---|---|---|
| `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |

## 2. Lista de documentos

### 2.1 Documentos do operador

- [ ] COA e EO vigentes;
- [ ] MGE/MGO e lista de páginas efetivas;
- [ ] capítulos de Diário de Bordo e controle operacional;
- [ ] manual/programa de manutenção e MGM equivalente;
- [ ] programa de treinamento;
- [ ] SGSO e gestão de mudança;
- [ ] PRE/contingência;
- [ ] MEL/NEF/ACR, se aplicável;
- [ ] procedimentos EFB/PED;
- [ ] formulários e modelos de Diário de Bordo;
- [ ] designações de responsáveis e signatários;
- [ ] políticas de segurança da informação e IAM;
- [ ] plano de backup, DR, retenção e portabilidade;
- [ ] contratos de manutenção e fornecedores críticos;
- [ ] inventário de dispositivos;
- [ ] registros de treinamento;
- [ ] relatórios de auditoria, incidentes e divergências relevantes.

### 2.2 Documentos AirTrust

- [ ] baseline e matriz regulatória;
- [ ] ADR da fronteira regulada;
- [ ] arquitetura e fluxos de dados;
- [ ] contratos e schemas aplicáveis;
- [ ] threat models;
- [ ] matriz de controles e evidências;
- [ ] inventário de dependências e fornecedores;
- [ ] resultados de testes e CI;
- [ ] release manifest e versão candidata;
- [ ] procedimentos de suporte e incidente;
- [ ] evidências de backup/restore;
- [ ] manuais de administração, usuário e fiscalização, quando existentes;
- [ ] protocolo e relatório de shadow;
- [ ] lista de riscos residuais.

### 2.3 Documentos regulatórios e de processo

- [ ] FOP 200 oficial vigente;
- [ ] carta e anexos auxiliares;
- [ ] ata e registro de decisões da reunião prévia;
- [ ] FOP 219, D-144-01 e FAI vigentes, quando aplicáveis;
- [ ] comprovantes e números de processo;
- [ ] orientações institucionais recebidas;
- [ ] relatório independente e retestes;
- [ ] atos, condições e escopo autorizativo;
- [ ] plano de migração/cutover aprovado pelo operador.

### 2.4 Controle da lista

| Documento | Proprietário | Versão/data | Classificação | Local autorizado | Entregue? | Observação |
|---|---|---|---|---|---|---|
| `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |

## 3. Matriz de treinamento

| Perfil | Objetivos | Conteúdo mínimo | Ambiente | Avaliação | Critério de aprovação | Recorrência/gatilho | Evidência |
|---|---|---|---|---|---|---|---|
| PIC | revisar, decidir e confirmar registros | etapas, situação técnica, pendências, correção, offline, contingência | shadow/sintético | cenário completo | `[CRITÉRIO]` | mudança material/recorrente | registro individual |
| SIC/outros | validar identificação e função | consulta, etapas, reporte, contingência | shadow/sintético | cenário por função | `[ ]` | mudança material | registro |
| OCC/coordenação | gerir rascunhos e conflitos | procedência, campos ausentes, escalonamento, papel oficial | shadow | exercício de jornada | `[ ]` | mudança de workflow | registro |
| Manutenção | registrar e validar situação técnica | discrepância, ação, RTS, terceiro, ciência PIC | shadow | cenário técnico | `[ ]` | mudança de processo | registro |
| Designado do operador | cumprir contrassinatura e governança | fila, prazo, exceções, auditoria | shadow | exercício de pendências | `[ ]` | mudança regulatória | registro |
| Administrador | administrar acesso e escopo | usuários, dispositivos, frota, volume, revogação, fiscal | sintético | laboratório | `[ ]` | mudança administrativa | registro |
| Suporte/TI | responder a falhas | incidente, logs, restauração, segurança, evidência | staging/sintético | drill | `[ ]` | mudança crítica/drill | relatório |
| Auditor/fiscal interno | verificar cadeia e exportação | pesquisa, versões, correções, impressão, exportação | shadow | amostra completa | `[ ]` | atualização do verificador | registro |

### 3.1 Controle de turmas

| Turma | Perfil | Participantes | Instrutor | Versão do material | Data | Resultado | Pendências |
|---|---|---|---|---|---|---|---|
| `[ ]` | `[ ]` | `[LOCAL CONTROLADO]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |

## 4. Plano de contingência

### 4.1 Objetivo

Manter a operação segura e a fonte oficial vigente durante falhas do AirTrust, dispositivos, conectividade, integrações ou dados.

### 4.2 Princípios

- durante shadow, o papel permanece oficial e não pode ser prejudicado;
- após futuro cutover, o procedimento aplicável deve refletir exatamente a autorização e os manuais vigentes;
- nenhum usuário deve improvisar método de assinatura, transcrição ou liberação de voo;
- toda contingência deve preservar evidência e permitir reconciliação sem sobrescrita silenciosa.

### 4.3 Cenários e respostas

| Cenário | Detecção | Ação imediata | Fonte oficial | Escalonamento | Recuperação | Evidência |
|---|---|---|---|---|---|---|
| Worker/API indisponível | health/usuário | interromper fluxo afetado e aplicar procedimento vigente | papel no shadow | TI + gestor | restaurar e reconciliar | incidente/log sanitizado |
| sem conectividade | dispositivo | usar procedimento offline aprovado ou papel vigente | conforme fase/autorização | operação + TI | sincronizar e verificar | registro de fila |
| PED perdido/roubado | usuário | bloquear/revogar e usar reserva | conforme fase | segurança + operação | provisionar substituto | incidente |
| pacote offline vencido/corrompido | validação local | não apresentar como válido | procedimento vigente | TI + operação | renovar pacote | evidência técnica |
| integração SIGVOOS falha | monitoramento | marcar fonte ausente; não presumir dado | papel no shadow | OCC + TI | reprocessar com procedência | divergência |
| dado técnico desatualizado | validação | bloquear cenário afetado | procedimento manutenção | manutenção + gestor | atualizar e retestar | incidente/divergência |
| suspeita cross-tenant | alerta/teste | interromper imediatamente e conter acesso | papel no shadow | segurança + direção | investigar e corrigir | incidente crítico |
| corrupção/perda de dados | verificação | congelar alterações e preservar evidência | procedimento vigente | TI + direção | restaurar/reconstituir | relatório DR |
| credencial/signatário indisponível | usuário | não compartilhar credencial nem assinar por terceiro | procedimento vigente | gestor do perfil | restabelecer identidade | ticket |
| divergência crítica | auditoria | suspender piloto/cenário | papel | gestor + GSO | corrigir e aprovar retomada | registro formal |

### 4.4 Autoridade para interrupção e retomada

| Decisão | Autoridade primária | Consultados | Evidência necessária |
|---|---|---|---|
| interromper cenário | `[FUNÇÃO]` | AirTrust/GSO/área afetada | fato e risco identificado |
| interromper ciclo | `[FUNÇÃO]` | comitê do projeto | incidente crítico/alto |
| retomar cenário | `[FUNÇÃO]` | donos das ações | correção, teste e aceite |
| acionar reversão após cutover | `[FUNÇÃO DO OPERADOR]` | AirTrust/ANAC conforme plano | critério formal atingido |

### 4.5 Drill

| Drill | Frequência/gatilho | Participantes | Critério | Resultado | Ação |
|---|---|---|---|---|---|
| perda de rede | `[ ]` | `[ ]` | fluxo seguro e evidência preservada | `[ ]` | `[ ]` |
| PED revogado | `[ ]` | `[ ]` | acesso bloqueado e reserva funcional | `[ ]` | `[ ]` |
| restore | `[ ]` | `[ ]` | integridade e tempo medidos | `[ ]` | `[ ]` |
| reconstituição | `[ ]` | `[ ]` | fontes e cadeia documentadas | `[ ]` | `[ ]` |
| exportação fiscal | `[ ]` | `[ ]` | pacote verificável e tenant correto | `[ ]` | `[ ]` |

## 5. Checklist de prontidão para shadow

### 5.1 Governança e regulatório

- [ ] termo de abertura aprovado;
- [ ] escopo do piloto por operador, modelo, matrícula e base definido;
- [ ] papel confirmado como única fonte oficial;
- [ ] shadow discutido no processo regulatório quando aplicável;
- [ ] papéis, responsáveis e autoridades de interrupção designados;
- [ ] tratamento de dados e repositório de evidências aprovados;
- [ ] decisões pendentes marcadas como não implementáveis;
- [ ] comunicação obrigatória preparada.

### 5.2 Dados e processos

- [ ] cadastros de operador, proprietário, aeronave e tripulação saneados;
- [ ] unidades, timezone e procedência validados;
- [ ] fluxo atual em papel documentado;
- [ ] interfaces e falhas esperadas mapeadas;
- [ ] situações técnicas e organizações de manutenção conferidas;
- [ ] amostra inicial reconciliada;
- [ ] nenhuma transcrição automática mascara ausência de fonte.

### 5.3 Acesso e segurança

- [ ] tenant isolation testado;
- [ ] perfis e menor privilégio revisados;
- [ ] usuários de terceiros delimitados;
- [ ] revogação testada;
- [ ] logs sem token, segredo ou PII indevida;
- [ ] exportação restrita ao tenant;
- [ ] incident response e contatos ativos.

### 5.4 Ambiente e dispositivos

- [ ] ambiente e versão/commit identificados;
- [ ] dados shadow visualmente marcados como não oficiais;
- [ ] nenhuma tela/PDF declara uso oficial;
- [ ] dispositivos inventariados e atualizados;
- [ ] equipamento reserva disponível quando previsto;
- [ ] conectividade e cenários offline testados;
- [ ] backup e restauração do ambiente testados;
- [ ] suporte durante a janela definido.

### 5.5 Pessoas e treinamento

- [ ] todos os participantes concluíram treinamento aplicável;
- [ ] avaliações práticas aprovadas;
- [ ] coordenação e manutenção conhecem a prevalência do papel;
- [ ] tempo adicional do piloto foi previsto;
- [ ] canais de dúvida e reporte foram comunicados;
- [ ] critérios de interrupção são compreendidos.

### 5.6 Decisão T1

| Item | Resultado |
|---|---|
| riscos críticos abertos | `[ZERO/DETALHAR]` |
| riscos altos abertos | `[ZERO/DETALHAR E BLOQUEAR]` |
| pendências médias aceitas | `[LISTA]` |
| evidências anexas | `[ÍNDICE]` |
| decisão | `[PRONTO/NÃO PRONTO/PRONTO COM CONDIÇÕES]` |
| aprovadores | `[NOMES/FUNÇÕES]` |
| data | `[DATA]` |
