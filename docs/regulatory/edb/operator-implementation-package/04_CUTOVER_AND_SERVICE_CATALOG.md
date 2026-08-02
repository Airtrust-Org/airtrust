# Modelos — cutover autorizado e catálogo do serviço

> **Restrição absoluta:** nenhum item deste documento autoriza o cutover. A execução depende
> do ato aplicável, do escopo por operador e aeronave, dos manuais vigentes e da decisão
> formal do operador.

## 1. Checklist de cutover por aeronave

### 1.1 Identificação

- Operador: `[OPERADOR]`
- Matrícula: `[MATRÍCULA]`
- Modelo e número de série: `[MODELO/NS]`
- Base: `[BASE]`
- Ato, EO ou LOA aplicável: `[REFERÊNCIA]`
- Escopo e condições: `[TRANSCRIÇÃO CONTROLADA]`
- Data e hora formal do cutover: `[DATA/HORA/FUSO]`
- Gestor do cutover: `[NOME/FUNÇÃO]`
- Versão ou commit AirTrust: `[IDENTIFICADOR]`
- Ambiente autorizado: `[AMBIENTE]`
- Repositório de evidências: `[LOCAL]`

### 1.2 Gate regulatório

- [ ] Ato aplicável emitido e válido.
- [ ] Operador, aeronave e matrícula estão no escopo.
- [ ] Condições e limitações foram transcritas e revisadas.
- [ ] Manuais e documentos associados estão vigentes.
- [ ] Data de eficácia está confirmada.
- [ ] Método de assinatura aplicável está implementado e demonstrado.
- [ ] Avaliação independente e retestes exigidos estão concluídos.
- [ ] Nenhuma pendência regulatória bloqueante permanece aberta.
- [ ] Autoridade interna do operador autorizou a execução.
- [ ] Plano de cutover corresponde ao ato e aos manuais vigentes.

### 1.3 Pessoas e suporte

- [ ] Usuários e designados da aeronave estão ativos e validados.
- [ ] Treinamento e avaliação prática estão concluídos.
- [ ] Manutenção própria e terceirizada está habilitada no escopo correto.
- [ ] Administradores e suporte estão escalados.
- [ ] Contatos de incidente e escalonamento estão publicados.
- [ ] Operação assistida possui janela e responsáveis.
- [ ] Avaliador ou observador participará quando previsto.
- [ ] Autoridade de go, no-go e reversão está presente ou formalmente disponível.

### 1.4 Dispositivos, acesso e segurança

- [ ] PED principal provisionado.
- [ ] Equipamento reserva disponível conforme procedimento.
- [ ] Versão mínima e integridade verificadas.
- [ ] Bloqueio, cifragem, atualização e revogação testados.
- [ ] Acesso por perfil e tenant conferido.
- [ ] Acessos obsoletos revogados.
- [ ] Pacote offline e situação técnica disponíveis conforme requisito.
- [ ] Logs, alertas e monitoração ativos sem dados indevidos.
- [ ] Backup e restauração mais recentes verificados.
- [ ] Relógio, timezone e sincronização verificados.
- [ ] Credenciais de emergência seguem o processo aprovado.

### 1.5 Reconciliação de saldos e estado inicial

Repetir o bloco de reconciliação para cada item:

- Item: `[VOLUME/PÁGINA/HORAS/CICLOS/POUSOS/OUTRO]`
- Fonte oficial anterior: `[REFERÊNCIA]`
- Valor ou estado encontrado: `[VALOR]`
- Valor ou estado reconciliado: `[VALOR]`
- Divergência: `[NENHUMA/DESCRIÇÃO]`
- Tratamento: `[DESCRIÇÃO]`
- Revisor 1: `[NOME/FUNÇÃO]`
- Revisor 2: `[NOME/FUNÇÃO]`
- Evidência: `[REFERÊNCIA]`
- Resultado: `[APROVADO/BLOQUEADO]`

Itens mínimos de reconciliação:

- último volume e página em papel;
- total de horas;
- ciclos;
- pousos;
- proprietário e operador;
- matrícula e número de série;
- última e próxima intervenção;
- horas restantes;
- discrepâncias abertas;
- ações retardadas;
- situação técnica comunicada ao PIC;
- pendências de assinatura ou correção.

Regras:

- divergência não pode ser ajustada sem evidência e responsável;
- qualquer valor desconhecido bloqueia o item correspondente;
- a abertura digital deve preservar a referência ao encerramento do papel;
- nenhuma importação representa assinatura de pessoa física;
- saldos reconciliados devem ser congelados antes da abertura do volume digital.

### 1.6 Abertura do volume digital

- [ ] Identificador e sequência do volume validados.
- [ ] Snapshots de operador, proprietário e aeronave conferidos.
- [ ] Saldos iniciais reconciliados.
- [ ] Responsáveis e designados válidos.
- [ ] Estado inicial, data, hora e timezone registrados.
- [ ] Evidência de abertura preservada.
- [ ] Impressão ou exportação de verificação testada.
- [ ] Volume visível nos PEDs previstos.
- [ ] Situação técnica inicial disponível.
- [ ] Referência ao último volume em papel preservada.

### 1.7 Encerramento do papel

- [ ] Último registro em papel concluído conforme o procedimento vigente.
- [ ] Assinaturas e correções pendentes tratadas.
- [ ] Saldos finais conferidos.
- [ ] Volume encerrado pelo responsável competente.
- [ ] Data e hora de encerramento coincidem com o plano de transição.
- [ ] Guarda e retenção do volume físico estão definidas.
- [ ] Proibição de dupla fonte oficial foi comunicada.
- [ ] Evidência do vínculo entre papel e volume digital foi preservada.
- [ ] Nenhum registro posterior foi lançado no volume físico encerrado.

### 1.8 Validação técnica antes da liberação

- [ ] Autenticação e autorização funcionam.
- [ ] Situação técnica atual está disponível.
- [ ] Criação e revisão de rascunho funcionam.
- [ ] Assinatura funciona conforme o método autorizado.
- [ ] Correção preserva o original.
- [ ] Offline e contingência atendem ao procedimento.
- [ ] Exportação e verificação funcionam.
- [ ] Acesso cross-tenant é negado.
- [ ] Alertas críticos estão ativos.
- [ ] Suporte confirma prontidão.
- [ ] Logs permitem reconstruir o teste sem expor segredo ou dado indevido.

### 1.9 Decisão de go ou no-go

#### Gate regulatório

- Resultado: `[GO/NO-GO]`
- Evidência: `[REFERÊNCIA]`
- Autoridade: `[NOME/FUNÇÃO]`

#### Reconciliação

- Resultado: `[GO/NO-GO]`
- Evidência: `[REFERÊNCIA]`
- Autoridade: `[NOME/FUNÇÃO]`

#### Pessoas e treinamento

- Resultado: `[GO/NO-GO]`
- Evidência: `[REFERÊNCIA]`
- Autoridade: `[NOME/FUNÇÃO]`

#### PED e conectividade

- Resultado: `[GO/NO-GO]`
- Evidência: `[REFERÊNCIA]`
- Autoridade: `[NOME/FUNÇÃO]`

#### Segurança e DR

- Resultado: `[GO/NO-GO]`
- Evidência: `[REFERÊNCIA]`
- Autoridade: `[NOME/FUNÇÃO]`

#### Suporte

- Resultado: `[GO/NO-GO]`
- Evidência: `[REFERÊNCIA]`
- Autoridade: `[NOME/FUNÇÃO]`

#### Decisão final do operador

- Resultado: `[GO/NO-GO]`
- Justificativa: `[TEXTO]`
- Autoridade: `[NOME/FUNÇÃO]`
- Data e hora: `[DATA/HORA/FUSO]`

### 1.10 Critérios de reversão

Os critérios definitivos devem ser alinhados ao operador e à ANAC. O plano deve considerar:

- risco ou confusão sobre a fonte oficial;
- situação técnica indisponível ou incorreta;
- falha de assinatura ou verificação;
- perda ou corrupção de registro;
- incidente cross-tenant ou comprometimento de identidade;
- indisponibilidade superior ao limite autorizado;
- impossibilidade de fiscalização ou exportação;
- divergência de saldos ou volume;
- solicitação do operador ou da autoridade.

Repetir este bloco para cada critério:

- Critério: `[DESCRIÇÃO]`
- Limiar ou condição: `[CONDIÇÃO OBJETIVA]`
- Autoridade para acionar: `[NOME/FUNÇÃO]`
- Procedimento: `[REFERÊNCIA]`
- Comunicação: `[DESTINATÁRIOS E CANAL]`
- Evidência: `[REFERÊNCIA]`
- Estado de prontidão: `[TESTADO/NÃO TESTADO]`

A reversão não pode recriar dupla fonte oficial nem apagar registros. O plano deve definir como
preservar, reconciliar e marcar todo conteúdo produzido.

### 1.11 Primeiro caso real

- [ ] Voo ou caso identificado em repositório autorizado.
- [ ] Rascunho e procedência revisados.
- [ ] Situação técnica lida pelo PIC.
- [ ] Assinaturas aplicáveis concluídas.
- [ ] Contrassinatura ou controle de prazo verificado.
- [ ] Registro está imutável e verificável.
- [ ] PED e offline conferidos.
- [ ] Exportação e consulta testadas.
- [ ] Auditoria completa revisada.
- [ ] Nenhuma divergência crítica ou alta aberta.
- [ ] Resultado aprovado pelo operador.
- [ ] Evidência vinculada à versão e ao ambiente.

### 1.12 Operação assistida e estabilização

#### Dia do cutover

- Monitoramento: todos os casos, assinaturas, sincronização e incidentes.
- Responsável: `[NOME/FUNÇÃO]`
- Critério de saída: nenhum bloqueio crítico.

#### Primeiro período assistido

- Período: `[D1 A D7/OUTRO]`
- Monitoramento: conferência diária e suporte prioritário.
- Responsável: `[NOME/FUNÇÃO]`
- Critério de saída: indicadores dentro dos limites e riscos controlados.

#### Período de estabilização

- Período: `[DEFINIR]`
- Monitoramento: amostragem, tendências e pendências.
- Responsável: `[NOME/FUNÇÃO]`
- Critério de saída: relatório de estabilização aceito.

### 1.13 Encerramento C1

- [ ] Primeiro caso real validado.
- [ ] Operação assistida concluída conforme o plano.
- [ ] Pendências residuais classificadas.
- [ ] Evidências entregues.
- [ ] Relatório de estabilização aprovado.
- [ ] Termo de aceite do marco assinado.
- [ ] Escopo de aeronaves efetivamente ativadas registrado.

## 2. Catálogo do serviço

### 2.1 Serviço-base

O serviço-base organiza e conduz a implantação por gates. O conteúdo contratado deve
identificar expressamente o marco final e as dependências externas.

### 2.2 Módulo de diagnóstico

Inclui:

- planejamento e abertura;
- workshops e entrevistas;
- levantamento do operador, frota, bases e processo em papel;
- mapeamento de interfaces, manuais, perfis, dispositivos e conectividade;
- riscos iniciais e relatório de diagnóstico.

Entregáveis principais:

- termo de abertura;
- questionário respondido;
- inventário documental;
- mapa de stakeholders;
- registro de riscos;
- decisão D1.

### 2.3 Módulo de projeto regulatório

Inclui:

- apoio técnico-documental ao FOP 200;
- preparação de perguntas e ata;
- registro de decisões pendentes;
- adaptação da matriz de requisitos;
- plano de alteração de EO;
- plano de manuais;
- plano de evidências.

Entregáveis principais:

- pacote auxiliar do FOP 200;
- registro de decisões;
- matriz do operador;
- planos regulatório, documental e de evidências;
- decisão R1.

### 2.4 Módulo de preparação técnica

Inclui:

- coordenação de cadastro e saneamento;
- definição de perfis e designações;
- planejamento de PED, conectividade e contingência;
- segurança e acesso;
- treinamento relacionado ao produto;
- preparação do ambiente shadow;
- testes de prontidão.

Entregáveis principais:

- matriz de treinamento;
- plano de contingência;
- inventário validado;
- evidências de teste;
- decisão T1.

### 2.5 Módulo de shadow pilot

Inclui:

- planejamento de escopo e casos;
- suporte à execução;
- comparação com o papel;
- registro e classificação de divergências;
- indicadores agregados;
- retestes;
- relatório de prontidão.

Entregáveis principais:

- roteiro;
- registros de execução;
- log de divergências;
- indicadores;
- relatório de prontidão;
- decisão S1.

### 2.6 Módulo de avaliação e submissão

Inclui:

- organização do data room;
- suporte técnico ao avaliador independente;
- tratamento de achados do produto;
- apoio a retestes e demonstrações;
- respostas técnicas sobre o produto;
- consolidação do relatório do projeto.

Entregáveis principais:

- índice de evidências;
- pacote de demonstração;
- registro de achados e retestes;
- matriz final;
- relatório de apoio;
- decisão A1.

### 2.7 Módulo de cutover autorizado

Inclui somente após o ato aplicável:

- planejamento por aeronave;
- conferência de escopo e condições;
- suporte à reconciliação;
- abertura do volume digital;
- apoio ao encerramento do papel pelo operador;
- operação assistida;
- validação do primeiro caso real;
- relatório de estabilização.

Entregáveis principais:

- checklist por aeronave;
- evidência de reconciliação;
- registro do instante de cutover;
- validação do caso real;
- relatório de estabilização;
- decisão C1.

## 3. Itens incluídos

Conforme o módulo contratado:

- gestão do projeto e dos gates;
- facilitação de workshops e entrevistas;
- modelos e matrizes reutilizáveis;
- levantamento de processos e interfaces;
- plano de atualização documental;
- apoio à preparação de anexos auxiliares do FOP 200;
- registro de decisões e pendências;
- planejamento de dados, perfis e dispositivos;
- plano e material de treinamento relacionado ao produto;
- configuração e suporte do ambiente shadow quando tecnicamente disponível e autorizado;
- roteiro e acompanhamento do shadow pilot;
- estruturação de evidências e divergências;
- apoio técnico ao avaliador independente;
- correções do produto previstas em contrato e aprovadas no processo de desenvolvimento;
- apoio técnico a respostas sobre o produto durante a análise;
- suporte assistido ao cutover autorizado e estabilização quando contratado.

## 4. Itens fora do serviço

Salvo contratação expressa e competência aplicável, não estão incluídos:

- atuação como representante, procurador ou autoridade do operador perante a ANAC;
- protocolo em nome do operador sem poderes e processo específico;
- garantia de aprovação, ateste, aceitação, autorização ou prazo da ANAC;
- emissão do relatório independente de conformidade pelo próprio AirTrust;
- aprovação formal dos manuais do operador;
- redação integral de manuais reais sem participação e aprovação das áreas responsáveis;
- definição unilateral do método de assinatura, PED, offline ou fiscalização;
- fornecimento de parecer jurídico ou regulatório independente;
- fornecimento, gestão ou custódia física de dispositivos, MDM, conectividade ou energia sem
  contrato específico;
- saneamento manual ilimitado de dados históricos;
- operação de voo, manutenção, despacho, controle operacional ou retorno ao serviço;
- assinatura de registros em nome de usuários;
- contratação e pagamento de TFAC, avaliador, certificados ou fornecedores terceiros;
- pentest, certificação ISO, acreditação ou auditoria independente sem contratação separada
  por entidade elegível;
- migration, deploy ou ativação em produção sem autorização explícita e gates do repositório;
- suporte indefinido após a janela contratada;
- adequação de processos alheios ao eDB identificados durante o diagnóstico.

## 5. Dependências do operador

O operador deve:

- designar patrocinador, gestores e responsáveis;
- fornecer documentos, pessoas, dados e acesso autorizados;
- garantir exatidão dos dados e decisões operacionais;
- manter papel e procedimentos oficiais durante shadow;
- redigir e aprovar internamente manuais e protocolos reais;
- atuar como requerente e protocolar documentos oficiais;
- disponibilizar aeronaves, casos, dispositivos e participantes;
- operar e controlar usuários, designações e terceiros;
- tratar riscos no SGSO e aprovar contingência;
- selecionar e contratar avaliador independente elegível;
- decidir go, no-go e cutover após o ato aplicável;
- manter responsabilidades regulatórias de operação e manutenção.

## 6. Dependências do avaliador independente

O avaliador deve:

- comprovar elegibilidade e independência;
- declarar e tratar conflitos de interesse;
- definir e executar plano de avaliação;
- testar comportamento real e evidências;
- emitir achados, retestes e relatório próprio;
- proteger dados, segredos e evidências;
- suportar esclarecimentos no escopo contratado;
- não delegar sua conclusão técnica ao AirTrust ou ao operador.

## 7. Decisões reservadas à ANAC

Somente a autoridade competente pode, no processo aplicável:

- orientar ou aceitar o método de cumprimento;
- decidir a suficiência do relatório independente;
- definir exigências adicionais;
- aceitar ou atestar o software no escopo correspondente;
- aprovar ou aceitar documentos conforme aplicável;
- alterar EO ou emitir LOA ou ato equivalente;
- estabelecer condições, limitações e escopo;
- autorizar a substituição do papel;
- determinar correções, suspensão ou revisão.

## 8. Matriz comercial de inclusão e exclusão

Repetir este bloco para cada item comercial:

- Item: `[DESCRIÇÃO]`
- Classificação: `[BASE/OPCIONAL/FORA DO SERVIÇO]`
- Quantidade ou limite: `[ESCOPO]`
- Dependências: `[LISTA]`
- Critério de aceite: `[DESCRIÇÃO]`
- Observação: `[CONDIÇÃO]`

Itens mínimos para classificar:

- diagnóstico e workshops;
- matriz regulatória adaptada;
- pacote auxiliar do FOP 200;
- revisão e minuta de manuais;
- saneamento de dados;
- dispositivos e MDM;
- treinamento;
- shadow pilot;
- avaliação independente;
- apoio ao avaliador;
- protocolo e representação;
- desenvolvimento adicional;
- cutover assistido;
- suporte pós-cutover;
- garantia de prazo ou aprovação.

## 9. Critérios de aceite comercial por fase

### Diagnóstico

O aceite significa que entregáveis e lacunas foram reconhecidos.

O aceite não significa que a solução foi aprovada pela ANAC.

### Projeto regulatório

O aceite significa que o pacote foi preparado e as decisões foram registradas.

O aceite não significa que orientação ou autorização já foi emitida.

### Preparação técnica

O aceite significa que as condições de entrada T1 foram verificadas.

O aceite não significa que o uso oficial está permitido.

### Shadow pilot

O aceite significa que o protocolo foi executado e o relatório S1 foi aceito.

O aceite não significa substituição do papel.

### Avaliação e submissão

O aceite significa que evidências foram entregues e achados foram tratados no escopo.

O aceite não significa decisão favorável garantida.

### Cutover

O aceite significa que tarefas técnicas e validação real foram concluídas no escopo autorizado.

O aceite não significa extensão automática a outras aeronaves ou operadores.

## 10. Registro de pendências na entrega final

Repetir este bloco para cada pendência:

- ID: `[IDENTIFICADOR]`
- Pendência: `[DESCRIÇÃO]`
- Categoria: `[AIRTRUST/OPERADOR/AVALIADOR/ANAC]`
- Responsável: `[NOME/FUNÇÃO]`
- Condição ou prazo interno: `[CONDIÇÃO/DATA]`
- Impacto: `[DESCRIÇÃO]`
- Bloqueia o encerramento: `[SIM/NÃO]`
- Próximo passo: `[AÇÃO]`
- Evidência: `[REFERÊNCIA]`

Nenhuma pendência dependente da ANAC deve ser apresentada como atraso ou obrigação do
AirTrust. Nenhuma pendência do operador deve ser absorvida silenciosamente pelo escopo do
fornecedor.
