# Modelos — cutover autorizado e catálogo do serviço

> **Restrição absoluta:** nenhum item deste documento autoriza o cutover. A execução depende do ato aplicável, do escopo por operador/aeronave, dos manuais vigentes e da decisão formal do operador.

## 1. Checklist de cutover por aeronave

### 1.1 Identificação

| Campo | Preenchimento |
|---|---|
| Operador | `[OPERADOR]` |
| Matrícula | `[MATRÍCULA]` |
| Modelo/número de série | `[MODELO/NS]` |
| Base | `[BASE]` |
| Ato/EO/LOA aplicável | `[REFERÊNCIA]` |
| Escopo e condições | `[TRANSCRIÇÃO CONTROLADA]` |
| Data/hora formal do cutover | `[DATA/HORA/FUSO]` |
| Gestor do cutover | `[NOME/FUNÇÃO]` |
| Versão/commit AirTrust | `[IDENTIFICADOR]` |
| Ambiente | `[AMBIENTE AUTORIZADO]` |

### 1.2 Gate regulatório

- [ ] ato aplicável emitido e válido;
- [ ] operador, aeronave e matrícula estão no escopo;
- [ ] condições e limitações foram transcritas e revisadas;
- [ ] manuais e documentos associados estão vigentes;
- [ ] data de eficácia está confirmada;
- [ ] método de assinatura aplicável está implementado e demonstrado;
- [ ] avaliação independente e retestes exigidos estão concluídos;
- [ ] nenhuma pendência regulatória bloqueante permanece aberta;
- [ ] autoridade interna do operador autorizou a execução.

### 1.3 Pessoas e suporte

- [ ] usuários e designados da aeronave estão ativos e validados;
- [ ] treinamento e avaliação prática estão concluídos;
- [ ] manutenção própria/terceira está habilitada no escopo correto;
- [ ] administradores e suporte estão escalados;
- [ ] contatos de incidente e escalonamento estão publicados;
- [ ] operação assistida possui janela e responsáveis;
- [ ] avaliador/observador participará quando previsto.

### 1.4 Dispositivos, acesso e segurança

- [ ] PED principal provisionado;
- [ ] equipamento reserva disponível conforme procedimento;
- [ ] versão mínima e integridade verificadas;
- [ ] bloqueio, cifragem, atualização e revogação testados;
- [ ] acesso por perfil e tenant conferido;
- [ ] acessos obsoletos revogados;
- [ ] pacote offline e situação técnica disponíveis conforme requisito;
- [ ] logs, alertas e monitoração ativos sem dados indevidos;
- [ ] backup e restauração mais recentes verificados.

### 1.5 Reconciliação de saldos e estado inicial

| Item | Fonte oficial anterior | Valor reconciliado | Revisor 1 | Revisor 2 | Evidência |
|---|---|---|---|---|---|
| último volume/página em papel | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| total de horas | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| ciclos | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| pousos | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| proprietário/operador | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| matrícula/número de série | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| última/próxima intervenção | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| horas restantes | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| discrepâncias abertas | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| ações retardadas | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |

Regras:

- divergência não pode ser ajustada sem evidência e responsável;
- qualquer valor desconhecido bloqueia o item correspondente;
- a abertura digital deve preservar a referência ao encerramento do papel;
- nenhuma importação representa assinatura de pessoa física.

### 1.6 Abertura do volume digital

- [ ] identificador e sequência do volume validados;
- [ ] snapshots de operador, proprietário e aeronave conferidos;
- [ ] saldos iniciais reconciliados;
- [ ] responsáveis e designados válidos;
- [ ] estado inicial e data/hora registrados;
- [ ] evidência de abertura preservada;
- [ ] impressão/exportação de verificação testada;
- [ ] volume visível nos PEDs previstos.

### 1.7 Encerramento do papel

- [ ] último registro em papel concluído conforme procedimento vigente;
- [ ] assinaturas e correções pendentes tratadas;
- [ ] saldos finais conferidos;
- [ ] volume encerrado pelo responsável competente;
- [ ] data/hora de encerramento coincide com o plano de transição;
- [ ] guarda e retenção do volume físico definidas;
- [ ] proibição de dupla fonte oficial comunicada;
- [ ] evidência do vínculo papel → volume digital preservada.

### 1.8 Validação técnica antes da liberação

- [ ] autenticação e autorização funcionam;
- [ ] situação técnica atual está disponível;
- [ ] criação e revisão de rascunho funcionam;
- [ ] assinatura funciona conforme método autorizado;
- [ ] correção preserva original;
- [ ] offline/contingência atendem ao procedimento;
- [ ] exportação e verificação funcionam;
- [ ] acesso cross-tenant é negado;
- [ ] alertas críticos estão ativos;
- [ ] suporte confirma prontidão.

### 1.9 Go/no-go

| Critério | Resultado | Evidência | Autoridade |
|---|---|---|---|
| gate regulatório | `[GO/NO-GO]` | `[ ]` | `[ ]` |
| reconciliação | `[GO/NO-GO]` | `[ ]` | `[ ]` |
| pessoas/treinamento | `[GO/NO-GO]` | `[ ]` | `[ ]` |
| PED/conectividade | `[GO/NO-GO]` | `[ ]` | `[ ]` |
| segurança/DR | `[GO/NO-GO]` | `[ ]` | `[ ]` |
| suporte | `[GO/NO-GO]` | `[ ]` | `[ ]` |
| decisão final do operador | `[GO/NO-GO]` | `[ ]` | `[ ]` |

### 1.10 Critérios de reversão

Os critérios definitivos devem ser alinhados ao operador e à ANAC. O modelo deve considerar:

- risco ou confusão sobre a fonte oficial;
- situação técnica indisponível/incorreta;
- falha de assinatura ou verificação;
- perda/corrupção de registro;
- incidente cross-tenant ou comprometimento de identidade;
- indisponibilidade superior ao limite autorizado;
- impossibilidade de fiscalização/exportação;
- divergência de saldos ou volume;
- solicitação do operador ou autoridade.

| Critério | Limiar/condição | Autoridade para acionar | Procedimento | Comunicação | Evidência |
|---|---|---|---|---|---|
| `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |

A reversão não pode recriar dupla fonte oficial nem apagar registros. O plano deve definir como preservar, reconciliar e marcar todo conteúdo produzido.

### 1.11 Primeiro caso real

- [ ] voo/caso identificado em repositório autorizado;
- [ ] rascunho e procedência revisados;
- [ ] situação técnica lida pelo PIC;
- [ ] assinaturas aplicáveis concluídas;
- [ ] contrassinatura/controle de prazo verificado;
- [ ] registro está imutável e verificável;
- [ ] PED/offline conferido;
- [ ] exportação/consulta testada;
- [ ] auditoria completa revisada;
- [ ] nenhuma divergência crítica/alta aberta;
- [ ] resultado aprovado pelo operador.

### 1.12 Operação assistida e estabilização

| Período | Monitoramento | Responsável | Critério de saída |
|---|---|---|---|
| D0 | todos os casos, assinaturas, sincronização e incidentes | `[ ]` | nenhum bloqueio crítico |
| D1–D7 | conferência diária e suporte prioritário | `[ ]` | indicadores dentro dos limites |
| período seguinte | amostragem e pendências | `[ ]` | relatório de estabilização aceito |

### 1.13 Encerramento C1

- [ ] primeiro caso real validado;
- [ ] operação assistida concluída conforme plano;
- [ ] pendências residuais classificadas;
- [ ] evidências entregues;
- [ ] relatório de estabilização aprovado;
- [ ] termo de aceite do marco assinado.

## 2. Catálogo do serviço

### 2.1 Serviço-base

O serviço-base organiza e conduz a implantação por gates. O conteúdo contratado deve identificar expressamente o marco final e as dependências externas.

| Módulo | Incluído | Entregáveis principais |
|---|---|---|
| Diagnóstico | levantamento e análise do processo atual | termo, questionário, inventário, riscos, relatório |
| Projeto regulatório | apoio técnico-documental ao caminho de conformidade | pacote FOP 200, decisões, matriz, planos |
| Preparação técnica | coordenação de dados, perfis, dispositivos, segurança e treinamento | prontidão T1, matriz, contingência, evidências |
| Shadow pilot | planejamento, suporte, comparação e consolidação | roteiro, divergências, indicadores, relatório S1 |
| Avaliação/submissão | data room, suporte técnico, tratamento de achados e demonstração | pacote de evidências, retestes e relatório de apoio |
| Cutover autorizado | execução assistida por aeronave | checklist, reconciliação, validação real, estabilização |

### 2.2 Itens incluídos

Conforme o módulo contratado:

- gestão do projeto e dos gates;
- facilitação de workshops e entrevistas;
- modelos e matrizes reutilizáveis;
- levantamento de processos e interfaces;
- plano de atualização documental;
- apoio à preparação de anexos do FOP 200;
- registro de decisões e pendências;
- planejamento de dados, perfis e dispositivos;
- plano e material de treinamento relacionado ao produto;
- configuração e suporte do ambiente shadow, quando tecnicamente disponível e autorizado;
- roteiro e acompanhamento do shadow pilot;
- estruturação de evidências e divergências;
- apoio técnico ao avaliador independente;
- correções do produto previstas em contrato e aprovadas no processo de desenvolvimento;
- apoio técnico a respostas do produto durante a análise;
- suporte assistido ao cutover autorizado e estabilização, quando contratado.

### 2.3 Itens fora do serviço, salvo contratação expressa e competência aplicável

- atuação como representante, procurador ou autoridade do operador perante a ANAC;
- protocolo em nome do operador sem poderes e processo específico;
- garantia de aprovação, ateste, aceitação, autorização ou prazo da ANAC;
- emissão do relatório independente de conformidade pelo próprio AirTrust;
- aprovação formal dos manuais do operador;
- redação integral de manuais reais sem participação e aprovação das áreas responsáveis;
- definição unilateral do método de assinatura, PED/offline ou fiscalização;
- fornecimento de parecer jurídico ou regulatório independente;
- fornecimento, gestão ou custódia física de dispositivos, MDM, conectividade ou energia, salvo contrato específico;
- saneamento manual ilimitado de dados históricos;
- operação de voo, manutenção, despacho, controle operacional ou retorno ao serviço;
- assinatura de registros em nome de usuários;
- contratação e pagamento de TFAC, avaliador, certificados ou fornecedores terceiros;
- pentest, certificação ISO, acreditação ou auditoria independente, salvo contratação separada por entidade elegível;
- migration, deploy ou ativação em produção sem autorização explícita e gates do repositório;
- suporte indefinido após a janela contratada;
- adequação de processos alheios ao eDB identificados durante o diagnóstico.

### 2.4 Dependências do operador

O operador deve:

- designar patrocinador, gestores e responsáveis;
- fornecer documentos, pessoas, dados e acesso autorizados;
- garantir a exatidão dos dados e decisões operacionais;
- manter o papel e os procedimentos oficiais durante shadow;
- redigir/aprovar internamente manuais e protocolos reais;
- atuar como requerente e protocolar documentos oficiais;
- disponibilizar aeronaves, casos, dispositivos e participantes;
- operar e controlar usuários, designações e terceiros;
- tratar riscos no SGSO e aprovar contingência;
- selecionar/contratar avaliador independente elegível;
- decidir go/no-go e cutover após ato aplicável;
- manter responsabilidades regulatórias de operação e manutenção.

### 2.5 Dependências do avaliador independente

O avaliador deve:

- comprovar elegibilidade e independência;
- definir e executar plano de avaliação;
- testar comportamento real e evidências;
- emitir achados, retestes e relatório próprio;
- proteger dados, segredos e evidências;
- suportar esclarecimentos no escopo contratado;
- não delegar sua conclusão técnica ao AirTrust ou ao operador.

### 2.6 Decisões reservadas à ANAC

Somente a autoridade competente pode, no processo aplicável:

- orientar ou aceitar o método de cumprimento;
- decidir a suficiência do relatório independente;
- definir exigências adicionais;
- aceitar/atestar o software no escopo correspondente;
- aprovar/aceitar documentos conforme aplicável;
- alterar EO ou emitir LOA/ato equivalente;
- estabelecer condições, limitações e escopo;
- autorizar a substituição do papel;
- determinar correções, suspensão ou revisão.

## 3. Matriz comercial de inclusão e exclusão

| Item | Base | Opcional | Fora | Observação/condição |
|---|---|---|---|---|
| diagnóstico e workshops | `[X]` | `[ ]` | `[ ]` | até `[ESCOPO]` |
| matriz regulatória adaptada | `[X]` | `[ ]` | `[ ]` | não substitui parecer oficial |
| pacote FOP 200 auxiliar | `[X]` | `[ ]` | `[ ]` | formulário oficial pelo operador |
| revisão de manuais | `[ ]` | `[X]` | `[ ]` | plano/minuta, não aprovação |
| saneamento de dados | `[ ]` | `[X]` | `[ ]` | volume e regras definidos |
| dispositivos/MDM | `[ ]` | `[ ]` | `[X]` | fornecedor do operador |
| treinamento | `[ ]` | `[X]` | `[ ]` | perfis/turmas definidos |
| shadow pilot | `[ ]` | `[X]` | `[ ]` | papel oficial |
| avaliação independente | `[ ]` | `[ ]` | `[X]` | entidade separada |
| apoio ao avaliador | `[ ]` | `[X]` | `[ ]` | data room e esclarecimentos |
| protocolo/representação | `[ ]` | `[ ]` | `[X]` | operador/requerente |
| desenvolvimento adicional | `[ ]` | `[X]` | `[ ]` | backlog e PR separada |
| cutover assistido | `[ ]` | `[X]` | `[ ]` | somente após ato aplicável |
| suporte pós-cutover | `[ ]` | `[X]` | `[ ]` | janela e SLA definidos |
| garantia de prazo/aprovação | `[ ]` | `[ ]` | `[X]` | não oferecida |

## 4. Critérios de aceite comercial por fase

| Fase | Aceite significa | Não significa |
|---|---|---|
| Diagnóstico | entregáveis e lacunas reconhecidos | solução aprovada pela ANAC |
| Projeto regulatório | pacote preparado e decisões registradas | orientação ou autorização já emitida |
| Preparação técnica | condições de entrada T1 verificadas | uso oficial permitido |
| Shadow | protocolo executado e relatório S1 aceito | substituição do papel |
| Avaliação/submissão | evidências entregues e achados tratados no escopo | decisão favorável garantida |
| Cutover | tarefas técnicas e validação real concluídas no escopo autorizado | extensão automática a outras aeronaves/operadores |

## 5. Registro de pendências na entrega final

| ID | Pendência | Categoria | Responsável | Condição/prazo interno | Impacto | Próximo passo |
|---|---|---|---|---|---|---|
| `[ ]` | `[ ]` | `[AIRTRUST/OPERADOR/AVALIADOR/ANAC]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |

Nenhuma pendência dependente da ANAC deve ser apresentada como atraso ou obrigação do AirTrust. Nenhuma pendência do operador deve ser absorvida silenciosamente pelo escopo do fornecedor.
