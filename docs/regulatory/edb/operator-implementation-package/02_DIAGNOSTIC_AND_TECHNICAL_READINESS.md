# Modelos — diagnóstico e prontidão técnica

> **Uso:** aplicar ao operador real em ambiente documental controlado.
>
> **Restrição:** não inserir dados reais em cópias públicas deste modelo.

## 1. Questionário de diagnóstico

### 1.1 Identificação do levantamento

- Operador: `[OPERADOR]`
- Responsável pelas respostas: `[NOME/FUNÇÃO]`
- Entrevistadores: `[NOMES/FUNÇÕES]`
- Período: `[DATA INICIAL/DATA FINAL]`
- Versão: `[VERSÃO]`
- Documentos de apoio: `[REFERÊNCIAS]`
- Pendências de informação: `[LISTA]`

### 1.2 Operador e governança

- Qual é a razão social, o designador, o número do COA e a estrutura de responsabilidades
  aplicável?
- Quem são o gestor responsável, Diretor de Operações, Diretor de Manutenção, GSO, TI,
  segurança da informação, treinamento e compliance?
- Quem será o patrocinador e quem poderá aceitar cada gate do projeto?
- Quais unidades, bases e organizações terceiras participarão?
- Quais processos dependem hoje do Diário de Bordo em papel?
- Quais riscos de mudança já foram identificados no SGSO?
- Existem projetos paralelos que alterem frota, manuais, SIGVOOS, manutenção, EFB/PED ou
  infraestrutura?
- Quais fóruns internos aprovam mudança, risco, treinamento, manual, dispositivo e cutover?

### 1.3 Frota e bases

- Quais modelos, números de série e matrículas existem?
- Quais aeronaves são candidatas ao diagnóstico, shadow e futuro cutover?
- Quais aeronaves possuem particularidades de operação, manutenção ou conectividade?
- Quais bases são principais, remotas, offshore ou possuem conectividade limitada?
- Onde ficam os volumes em papel e como são movimentados?
- Existem aeronaves arrendadas, compartilhadas, transferidas ou em manutenção prolongada?
- Como são tratadas mudanças de marcas, proprietário e operador?
- Quais aeronaves possuem saldos, volumes ou situações técnicas que exigem reconciliação
  especial?

### 1.4 Processo atual em papel

- Quem abre, preenche, revisa, assina, contrassina, guarda e encerra volumes?
- Em que momento cada campo é preenchido?
- Como são tratadas múltiplas etapas, troca de tripulação e jornada atravessando meia-noite?
- Como são registradas correções, rasuras, addenda e reconstituições?
- Como são controlados saldos de horas, ciclos e pousos?
- Como são registradas discrepâncias, ações corretivas, ações retardadas e retorno ao serviço?
- Como o PIC toma ciência da situação técnica?
- Como é atendida uma fiscalização?
- Como são tratados perda, dano, indisponibilidade e reconstrução de volume?
- Quais divergências recorrentes já existem no processo em papel?
- Quais campos são preenchidos por transcrição, cálculo, integração ou julgamento humano?
- Quais exceções dependem de autorização de função específica?

### 1.5 SIGVOOS, Controle de Voos e AirTrust

- Quais dados entram por integração, importação ou digitação manual?
- Qual sistema é a fonte de cada campo?
- Como são identificadas procedência, horário de coleta, unidade e timezone?
- Existem conflitos entre SIGVOOS, RDV, coordenação e papel?
- Quais tabelas, relatórios ou telas são usados operacionalmente?
- Quem pode corrigir dados e como a correção é rastreada?
- Quais integrações podem ficar indisponíveis e qual deve ser o comportamento?
- Há dependência de dados de terceiros ou formatos não controlados?
- Quais dados não podem ser presumidos ou transformados silenciosamente?
- Como são tratados registros duplicados, atrasados ou fora de ordem?
- Qual interface contém a informação canônica quando fontes discordam?

### 1.6 Manuais e documentos

- Qual é a estrutura real do MGE, MGO e documentos associados?
- Onde estão os procedimentos de Diário de Bordo, EFB/PED, manutenção, contingência,
  treinamento e fiscalização?
- Quais capítulos são aprovados e quais são aceitos?
- Quais formulários, listas de páginas efetivas e anexos controlados existem?
- Como revisões são aprovadas, distribuídas e colocadas em vigor?
- Quais documentos de manutenção cobrem situação técnica e retorno ao serviço?
- Há MEL, NEF, ACR ou outro documento afetado pelo uso do PED ou eDB?
- Quais contratos com fornecedores precisam ser revisados?
- Quais documentos não podem ser compartilhados com AirTrust ou avaliador sem autorização
  específica?
- Quais procedimentos reais diferem do texto atualmente controlado?

### 1.7 Perfis, identidade e designações

- Quais perfis usarão o eDB: PIC, SIC, OCC, manutenção, designado do operador,
  administrador, auditor, fiscal interno e suporte?
- Como identidade, CANAC, função, licença, habilitação e prerrogativa são validadas?
- Quem designa e revoga usuários?
- Como são tratadas substituições, afastamentos e desligamentos?
- Existem usuários de organizações de manutenção terceiras?
- Como será segregado o acesso de fiscalização?
- Há funções incompatíveis que exigem segregação de deveres?
- Quais decisões sobre assinatura permanecem pendentes?
- Quais funções podem corrigir, cancelar, reabrir, aprovar ou exportar registros?
- Como serão tratadas contas de emergência e acesso privilegiado?

### 1.8 Equipamentos, PED e conectividade

- Quais dispositivos são usados ou pretendidos?
- Quem é proprietário, administrador e custodiante dos dispositivos?
- Há MDM, bloqueio, cifragem, atualização e revogação?
- Quais bases e rotas possuem conectividade insuficiente?
- Qual é a autonomia, fonte de energia e equipamento reserva?
- Como são tratadas perda, furto, dano e troca de dispositivo?
- Existem restrições de uso em fases críticas do voo?
- Há determinação de não interferência e procedimento EFB/PED aplicável?
- Como são validados versão mínima, atualização e downgrade?
- Quais dados precisam permanecer disponíveis offline?
- Qual é o tempo máximo aceitável sem sincronização?
- Como o operador identifica dispositivo revogado, comprometido ou desatualizado?

### 1.9 Manutenção

- Quais organizações próprias e terceiras registram discrepâncias ou retorno ao serviço?
- Como são validadas licença, habilitação, vínculo, função e prerrogativa?
- Quais campos de situação técnica precisam estar disponíveis ao PIC?
- Como são tratadas ações retardadas e itens com prazo ou limite?
- Como são reconciliadas horas restantes, ciclos e intervenções?
- Como a manutenção corrige registro sem eliminar o original?
- Como uma organização terceirizada acessa apenas o escopo necessário?
- Quais cenários exigem bloqueio e quais apenas alerta?
- Como a aeronave é liberada quando integração ou dispositivo está indisponível?

### 1.10 Segurança, retenção e continuidade

- Qual política de IAM, logs, incidentes e acesso privilegiado existe?
- Quais dados são pessoais, operacionais, técnicos ou sigilosos?
- Onde registros e evidências são armazenados?
- Qual retenção é exigida e quem responde por ela?
- Como funcionam backup, restauração, RTO, RPO e detecção de corrupção?
- Há cópia independente e teste periódico de restauração?
- Como ocorre transferência de propriedade, exportação e portabilidade?
- Qual é o plano para descontinuidade do fornecedor?
- Como incidentes regulatórios serão comunicados?
- Quais fornecedores críticos e responsabilidades compartilhadas existem?
- Como é testado o isolamento entre empresas?
- Quais logs podem conter dados pessoais ou segredos e como são sanitizados?

### 1.11 Treinamento e fatores humanos

- Quais perfis precisam de treinamento inicial, diferenças e recorrente?
- Quais tarefas são críticas e quais erros previsíveis devem ser treinados?
- Como será avaliada a competência prática?
- Há risco de duplicação de carga de trabalho durante o shadow?
- Como usuários reportarão dificuldade sem mascarar divergências?
- Quais mensagens, bloqueios e nomenclaturas podem induzir erro?
- Como será tratado treinamento de contingência e dispositivo reserva?
- Como será verificada a compreensão de que o papel permanece oficial no shadow?
- Quais mudanças exigem treinamento de diferenças antes de nova versão?

### 1.12 Retenção documental e fiscalização

- Quais registros devem permanecer pesquisáveis e exportáveis?
- Por quanto tempo cada classe documental é retida?
- Quem pode fornecer acesso ou pacote à fiscalização?
- Como autenticidade, integridade, versão e cadeia de correções são verificadas?
- Qual formato de exportação é necessário?
- Como será evitada dependência exclusiva do fornecedor para acesso histórico?
- Como são tratados encerramento do operador, transferência de aeronave e troca de
  proprietário?

### 1.13 Registro de risco operacional

Repetir este bloco para cada perigo:

- ID: `[IDENTIFICADOR]`
- Perigo: `[DESCRIÇÃO]`
- Causa: `[DESCRIÇÃO]`
- Consequência: `[DESCRIÇÃO]`
- Barreiras atuais: `[LISTA]`
- Probabilidade inicial: `[CLASSIFICAÇÃO]`
- Severidade inicial: `[CLASSIFICAÇÃO]`
- Risco inicial: `[CLASSIFICAÇÃO]`
- Ações adicionais: `[LISTA]`
- Dono: `[RESPONSÁVEL]`
- Prazo interno: `[DATA]`
- Risco residual: `[CLASSIFICAÇÃO]`
- Aceitador do risco: `[NOME/FUNÇÃO]`
- Evidências: `[REFERÊNCIAS]`

## 2. Lista de documentos

### 2.1 Documentos do operador

- [ ] COA e EO vigentes.
- [ ] MGE, MGO e lista de páginas efetivas.
- [ ] Capítulos de Diário de Bordo e controle operacional.
- [ ] Manual ou programa de manutenção e MGM equivalente.
- [ ] Programa de treinamento.
- [ ] SGSO e documentação de gestão de mudança.
- [ ] PRE e planos de contingência.
- [ ] MEL, NEF e ACR, quando aplicáveis.
- [ ] Procedimentos EFB e PED.
- [ ] Formulários e modelos do Diário de Bordo.
- [ ] Designações de responsáveis e signatários.
- [ ] Políticas de segurança da informação e IAM.
- [ ] Plano de backup, DR, retenção e portabilidade.
- [ ] Contratos de manutenção e fornecedores críticos.
- [ ] Inventário de dispositivos.
- [ ] Registros de treinamento.
- [ ] Relatórios de auditoria, incidentes e divergências relevantes.
- [ ] Procedimentos de fiscalização, exportação e guarda.

### 2.2 Documentos AirTrust

- [ ] Baseline e matriz regulatória.
- [ ] ADR da fronteira regulada.
- [ ] Arquitetura e fluxos de dados.
- [ ] Contratos e schemas aplicáveis.
- [ ] Threat models.
- [ ] Matriz de controles e evidências.
- [ ] Inventário de dependências e fornecedores.
- [ ] Resultados de testes e CI.
- [ ] Release manifest e versão candidata.
- [ ] Procedimentos de suporte e incidente.
- [ ] Evidências de backup e restore.
- [ ] Manuais de administração, usuário e fiscalização, quando existentes.
- [ ] Protocolo e relatório de shadow.
- [ ] Lista de riscos residuais.
- [ ] Evidências de isolamento por tenant e controle de acesso.

### 2.3 Documentos regulatórios e de processo

- [ ] FOP 200 oficial vigente.
- [ ] Carta e anexos auxiliares.
- [ ] Ata e registro de decisões da reunião prévia.
- [ ] FOP 219, D-144-01 e FAI vigentes, quando aplicáveis.
- [ ] Comprovantes e números de processo.
- [ ] Orientações institucionais recebidas.
- [ ] Relatório independente e retestes.
- [ ] Atos, condições e escopo autorizativo.
- [ ] Plano de migração e cutover aprovado pelo operador.
- [ ] Registro de versões dos formulários oficiais usados.

### 2.4 Controle individual de documento

Repetir este bloco para cada documento:

- Documento: `[TÍTULO]`
- Proprietário: `[PARTE/FUNÇÃO]`
- Versão e data: `[VERSÃO/DATA]`
- Classificação: `[PÚBLICO/INTERNO/CONFIDENCIAL/RESTRITO]`
- Local autorizado: `[REPOSITÓRIO]`
- Entregue: `[SIM/NÃO/NÃO APLICÁVEL]`
- Validação executada: `[DESCRIÇÃO]`
- Observação: `[TEXTO]`

## 3. Matriz de treinamento

### 3.1 Regras gerais

- cada perfil deve receber somente conteúdo compatível com suas funções;
- treinamento teórico não substitui avaliação prática quando houver tarefa crítica;
- o material deve indicar versão do sistema, ambiente e condição shadow ou oficial;
- o método de assinatura somente será ensinado após decisão aplicável;
- mudança material exige avaliação de diferenças antes da entrada em vigor;
- registros reais de participantes devem permanecer em ambiente controlado.

### 3.2 PIC

- Objetivos: revisar, decidir e confirmar registros dentro das prerrogativas aplicáveis.
- Conteúdo mínimo: etapas, situação técnica, pendências, correção, offline e contingência.
- Ambiente: shadow ou sintético antes de qualquer uso autorizado.
- Avaliação: cenário completo.
- Critério de aprovação: `[CRITÉRIO]`
- Recorrência ou gatilho: mudança material e periodicidade definida pelo operador.
- Evidência: registro individual e resultado prático.

### 3.3 SIC e outros tripulantes

- Objetivos: validar identificação, função, etapas e reporte.
- Conteúdo mínimo: consulta, campos próprios, divergência e contingência.
- Ambiente: shadow ou sintético.
- Avaliação: cenário por função.
- Critério de aprovação: `[CRITÉRIO]`
- Recorrência ou gatilho: mudança material.
- Evidência: registro individual.

### 3.4 OCC e coordenação

- Objetivos: gerir rascunhos, fontes, campos ausentes e conflitos.
- Conteúdo mínimo: procedência, integração, escalonamento e papel oficial no shadow.
- Ambiente: shadow.
- Avaliação: exercício de jornada e exceções.
- Critério de aprovação: `[CRITÉRIO]`
- Recorrência ou gatilho: mudança de workflow.
- Evidência: registro individual e cenário avaliado.

### 3.5 Manutenção

- Objetivos: registrar e validar situação técnica dentro das prerrogativas.
- Conteúdo mínimo: discrepância, ação, retorno ao serviço, terceiro e ciência do PIC.
- Ambiente: shadow.
- Avaliação: cenário técnico.
- Critério de aprovação: `[CRITÉRIO]`
- Recorrência ou gatilho: mudança de processo ou requisito.
- Evidência: registro individual e cenário avaliado.

### 3.6 Designado do operador

- Objetivos: cumprir governança, revisão e contrassinatura quando aplicável.
- Conteúdo mínimo: fila, prazo, exceções, auditoria e segregação de deveres.
- Ambiente: shadow.
- Avaliação: exercício de pendências.
- Critério de aprovação: `[CRITÉRIO]`
- Recorrência ou gatilho: mudança regulatória ou de responsabilidade.
- Evidência: registro individual.

### 3.7 Administrador

- Objetivos: administrar acesso, escopo e dispositivos sem ampliar privilégios indevidos.
- Conteúdo mínimo: usuários, perfis, frota, volumes, revogação, auditoria e fiscalização.
- Ambiente: sintético.
- Avaliação: laboratório de administração.
- Critério de aprovação: `[CRITÉRIO]`
- Recorrência ou gatilho: mudança administrativa ou de segurança.
- Evidência: registro individual e checklist.

### 3.8 Suporte e TI

- Objetivos: responder a falhas preservando fonte oficial, dados e evidências.
- Conteúdo mínimo: incidente, logs, restauração, segurança, versão e escalonamento.
- Ambiente: staging ou sintético.
- Avaliação: drill.
- Critério de aprovação: `[CRITÉRIO]`
- Recorrência ou gatilho: mudança crítica e drill periódico.
- Evidência: relatório do exercício.

### 3.9 Auditor e fiscal interno

- Objetivos: verificar cadeia, versão, correções, pesquisa e exportação.
- Conteúdo mínimo: filtros, trilha, impressão, pacote verificável e acesso segregado.
- Ambiente: shadow.
- Avaliação: amostra completa.
- Critério de aprovação: `[CRITÉRIO]`
- Recorrência ou gatilho: atualização do verificador ou processo.
- Evidência: registro individual.

### 3.10 Controle de turma

Repetir este bloco para cada turma:

- Turma: `[IDENTIFICADOR]`
- Perfil: `[PERFIL]`
- Participantes: `[REFERÊNCIA A LISTA CONTROLADA]`
- Instrutor: `[NOME/FUNÇÃO]`
- Versão do material: `[VERSÃO]`
- Ambiente: `[AMBIENTE]`
- Data: `[DATA]`
- Resultado: `[APROVADO/REPROVADO/PENDENTE]`
- Pendências: `[LISTA]`
- Evidência: `[REFERÊNCIA]`

## 4. Plano de contingência

### 4.1 Objetivo

Manter a operação segura e a fonte oficial vigente durante falhas do AirTrust, dispositivos,
conectividade, integrações ou dados.

### 4.2 Princípios

- durante shadow, o papel permanece oficial e não pode ser prejudicado;
- após futuro cutover, o procedimento deve refletir exatamente a autorização e os manuais
  vigentes;
- nenhum usuário deve improvisar método de assinatura, transcrição ou liberação de voo;
- toda contingência deve preservar evidência e permitir reconciliação sem sobrescrita
  silenciosa;
- a autoridade para interromper, retomar ou reverter deve estar previamente designada.

### 4.3 Worker ou API indisponível

- Detecção: health check, monitoração ou reporte de usuário.
- Ação imediata: interromper o fluxo afetado e aplicar o procedimento vigente.
- Fonte oficial no shadow: papel.
- Escalonamento: TI, AirTrust e gestor do operador.
- Recuperação: restaurar, validar integridade e reconciliar.
- Evidência: incidente e logs sanitizados.

### 4.4 Ausência de conectividade

- Detecção: dispositivo ou monitoração.
- Ação imediata: usar procedimento offline aprovado ou papel vigente.
- Fonte oficial: conforme fase e autorização.
- Escalonamento: operação e TI.
- Recuperação: sincronizar, verificar ordem e tratar conflitos.
- Evidência: registro da fila, tempos e resultado.

### 4.5 PED perdido, furtado ou danificado

- Detecção: usuário ou MDM.
- Ação imediata: bloquear e revogar o dispositivo.
- Fonte oficial: conforme fase e autorização.
- Escalonamento: segurança, operação e TI.
- Recuperação: provisionar equipamento reserva ou substituto.
- Evidência: incidente e confirmação de revogação.

### 4.6 Pacote offline vencido ou corrompido

- Detecção: validação local.
- Ação imediata: não apresentar o pacote como válido.
- Fonte oficial: procedimento vigente.
- Escalonamento: TI e operação.
- Recuperação: renovar pacote e verificar integridade.
- Evidência: diagnóstico e resultado do reteste.

### 4.7 Falha de integração SIGVOOS

- Detecção: monitoração, ausência de evento ou validação de procedência.
- Ação imediata: marcar fonte ausente e não presumir dado.
- Fonte oficial no shadow: papel.
- Escalonamento: OCC e TI.
- Recuperação: reprocessar com procedência preservada.
- Evidência: divergência e log sanitizado.

### 4.8 Situação técnica desatualizada

- Detecção: comparação, validação ou reporte da manutenção.
- Ação imediata: bloquear o cenário afetado.
- Fonte oficial: procedimento de manutenção vigente.
- Escalonamento: manutenção, operação e gestor.
- Recuperação: atualizar, reconciliar e retestar.
- Evidência: incidente ou divergência formal.

### 4.9 Suspeita cross-tenant

- Detecção: alerta, teste ou reporte.
- Ação imediata: interromper imediatamente e conter acessos.
- Fonte oficial no shadow: papel.
- Escalonamento: segurança, direção, operador e AirTrust.
- Recuperação: investigar, corrigir, executar revisão independente e retestar.
- Evidência: incidente crítico e cadeia de preservação.

### 4.10 Corrupção ou perda de dados

- Detecção: verificação de integridade, auditoria ou falha de leitura.
- Ação imediata: congelar alterações e preservar evidências.
- Fonte oficial: procedimento vigente.
- Escalonamento: TI, segurança, direção e áreas reguladas.
- Recuperação: restaurar ou reconstituir sem apagar o histórico.
- Evidência: relatório de DR e reconciliação.

### 4.11 Credencial ou signatário indisponível

- Detecção: usuário ou IAM.
- Ação imediata: não compartilhar credencial nem assinar por terceiro.
- Fonte oficial: procedimento vigente.
- Escalonamento: gestor do perfil e suporte.
- Recuperação: restabelecer identidade ou aplicar substituição formal.
- Evidência: ticket e registro de designação.

### 4.12 Divergência crítica

- Detecção: comparação, auditoria ou incidente.
- Ação imediata: suspender piloto ou cenário.
- Fonte oficial no shadow: papel.
- Escalonamento: gestor, GSO, área afetada e AirTrust.
- Recuperação: corrigir, retestar e aprovar retomada.
- Evidência: registro formal e decisão de retomada.

### 4.13 Autoridade para interrupção e retomada

- Autoridade para interromper cenário: `[FUNÇÃO]`
- Autoridade para interromper ciclo: `[FUNÇÃO]`
- Autoridade para aprovar retomada: `[FUNÇÃO]`
- Autoridade para acionar reversão após cutover: `[FUNÇÃO DO OPERADOR]`
- Consultados obrigatórios: `[LISTA]`
- Evidência mínima para retomada: correção, teste, risco residual e aceite.

### 4.14 Drills

#### Perda de rede

- Frequência ou gatilho: `[DEFINIR]`
- Participantes: `[FUNÇÕES]`
- Critério: fluxo seguro e evidência preservada.
- Resultado: `[REGISTRAR]`
- Ação: `[REGISTRAR]`

#### PED revogado

- Frequência ou gatilho: `[DEFINIR]`
- Participantes: `[FUNÇÕES]`
- Critério: acesso bloqueado e reserva funcional.
- Resultado: `[REGISTRAR]`
- Ação: `[REGISTRAR]`

#### Restore

- Frequência ou gatilho: `[DEFINIR]`
- Participantes: `[FUNÇÕES]`
- Critério: integridade, RTO e RPO medidos.
- Resultado: `[REGISTRAR]`
- Ação: `[REGISTRAR]`

#### Reconstituição

- Frequência ou gatilho: `[DEFINIR]`
- Participantes: `[FUNÇÕES]`
- Critério: fontes e cadeia documentadas.
- Resultado: `[REGISTRAR]`
- Ação: `[REGISTRAR]`

#### Exportação fiscal

- Frequência ou gatilho: `[DEFINIR]`
- Participantes: `[FUNÇÕES]`
- Critério: pacote verificável e tenant correto.
- Resultado: `[REGISTRAR]`
- Ação: `[REGISTRAR]`

## 5. Checklist de prontidão para shadow

### 5.1 Governança e regulatório

- [ ] Termo de abertura aprovado.
- [ ] Escopo por operador, modelo, matrícula e base definido.
- [ ] Papel confirmado como única fonte oficial.
- [ ] Shadow discutido no processo regulatório quando aplicável.
- [ ] Papéis, responsáveis e autoridades de interrupção designados.
- [ ] Tratamento de dados e repositório de evidências aprovados.
- [ ] Decisões pendentes marcadas como não implementáveis.
- [ ] Comunicação obrigatória preparada.
- [ ] Riscos críticos e altos avaliados.

### 5.2 Dados e processos

- [ ] Cadastros de operador, proprietário, aeronave e tripulação saneados.
- [ ] Unidades, timezone e procedência validados.
- [ ] Fluxo atual em papel documentado.
- [ ] Interfaces e falhas esperadas mapeadas.
- [ ] Situações técnicas e organizações de manutenção conferidas.
- [ ] Amostra inicial reconciliada.
- [ ] Nenhuma transcrição automática mascara ausência de fonte.
- [ ] Regras de correção e conflito estão documentadas.

### 5.3 Acesso e segurança

- [ ] Isolamento por tenant testado.
- [ ] Perfis e menor privilégio revisados.
- [ ] Usuários de terceiros delimitados.
- [ ] Revogação testada.
- [ ] Logs sem token, segredo ou dado pessoal indevido.
- [ ] Exportação restrita ao tenant.
- [ ] Resposta a incidentes e contatos ativos.
- [ ] Acesso privilegiado controlado e auditado.

### 5.4 Ambiente e dispositivos

- [ ] Ambiente e versão ou commit identificados.
- [ ] Dados shadow visualmente marcados como não oficiais.
- [ ] Nenhuma tela ou PDF declara uso oficial.
- [ ] Dispositivos inventariados e atualizados.
- [ ] Equipamento reserva disponível quando previsto.
- [ ] Conectividade e cenários offline testados.
- [ ] Backup e restauração do ambiente testados.
- [ ] Suporte durante a janela definido.
- [ ] Critérios de versão mínima e revogação validados.

### 5.5 Pessoas e treinamento

- [ ] Todos os participantes concluíram o treinamento aplicável.
- [ ] Avaliações práticas foram aprovadas.
- [ ] Coordenação e manutenção conhecem a prevalência do papel.
- [ ] Tempo adicional do piloto foi previsto.
- [ ] Canais de dúvida e reporte foram comunicados.
- [ ] Critérios de interrupção são compreendidos.
- [ ] Responsáveis por evidência conhecem o procedimento.

### 5.6 Decisão T1

- Riscos críticos abertos: `[ZERO/DETALHAR]`
- Riscos altos abertos: `[ZERO/DETALHAR E BLOQUEAR]`
- Pendências médias aceitas: `[LISTA]`
- Evidências anexas: `[ÍNDICE]`
- Decisão: `[PRONTO/NÃO PRONTO/PRONTO COM CONDIÇÕES]`
- Aprovadores: `[NOMES/FUNÇÕES]`
- Data: `[DATA]`
- Condições para avanço: `[LISTA]`
