# Checklist de submissão — FOP 200 — eDB AirTrust

## A. Confirmação das fontes

- [ ] Baixar o FOP 200 oficial vigente na página da ANAC.
- [ ] Registrar data do download e nome do arquivo.
- [ ] Confirmar o serviço SEI aplicável ao operador RBAC 135.
- [ ] Confirmar que a solicitação é de reunião prévia para alteração de EO — utilização de registros digitais.
- [ ] Confirmar dados atuais do FOP 219, D-144-01 e FAI para a futura fase formal.
- [ ] Reconfirmar código e valor da TFAC antes do protocolo futuro da alteração de EO.

## B. Dados do operador

- [ ] Razão social conferida.
- [ ] CNPJ conferido.
- [ ] Número do COA conferido.
- [ ] Base principal e contatos institucionais.
- [ ] Representante legal.
- [ ] Diretor de Operações.
- [ ] Diretor de Manutenção ou responsável equivalente.
- [ ] Gestor de Segurança Operacional.
- [ ] Responsável pelo processo perante a ANAC.
- [ ] Procurador com poderes, quando aplicável.

## C. Definição do primeiro escopo

- [ ] Operador requerente identificado.
- [ ] Modelos de aeronave candidatos identificados.
- [ ] Matrículas candidatas listadas apenas como proposta, sem afirmar autorização.
- [ ] Tipo de operação e perfil offshore descritos.
- [ ] Bases operacionais envolvidas.
- [ ] Usuários: PIC, SIC, coordenação, manutenção, designado do operador e fiscal.
- [ ] Fronteira com SIGVOOS, Controle de Voos, FRMS e manutenção explicada.
- [ ] Itens excluídos da primeira autorização declarados.

## D. Artefatos anexos

- [ ] FOP 200 oficial preenchido e assinado conforme exigido.
- [ ] Carta de encaminhamento.
- [ ] Nota conceitual `ANAC_EDB_FOP200_CONCEPT_NOTE_20260802.md` adaptada.
- [ ] Baseline regulatório.
- [ ] Matriz resumida de conformidade.
- [ ] ADR da fronteira entre `cv_*` e registros regulados.
- [ ] Mapa de campos e lacunas.
- [ ] Threat model de assinatura.
- [ ] Conceito PED/offline.
- [ ] Fluxo de dados e diagrama de arquitetura.
- [ ] Lista priorizada de perguntas.
- [ ] Proposta de shadow mode com papel oficial.
- [ ] Cronograma indicativo sem promessa de autorização.

## E. Controle de alegações

- [ ] Nenhum documento afirma que o AirTrust já está homologado, atestado ou aprovado.
- [ ] Nenhum documento afirma que JWT equivale a assinatura regulatória.
- [ ] Nenhum documento afirma que PWA ou Service Worker já atendem ao PED/eDB.
- [ ] O papel é declarado como fonte oficial durante o shadow mode.
- [ ] SIGVOOS é descrito somente como fonte de rascunho.
- [ ] O método de assinatura permanece condicionado à orientação da ANAC.
- [ ] A entidade avaliadora ainda não é declarada elegível sem confirmação.
- [ ] A ativação oficial permanece condicionada a ateste, EO/LOA, manuais e cutover.

## F. Participantes recomendados

- [ ] Representante legal ou pessoa com autoridade para assumir compromissos.
- [ ] Responsável operacional familiarizado com RBAC 135.
- [ ] Responsável de manutenção/aeronavegabilidade.
- [ ] Piloto usuário do processo.
- [ ] Responsável técnico do AirTrust.
- [ ] Segurança da informação/arquitetura.
- [ ] Responsável regulatório e redator da ata.

Cada participante deve conhecer sua função e evitar resposta especulativa. Questão sem evidência deve ser registrada como pendência.

## G. Preparação da reunião

- [ ] Ensaio interno de 60 minutos.
- [ ] Apresentação limitada a 15 minutos antes das perguntas.
- [ ] Diagrama legível em uma página.
- [ ] Demonstração apenas conceitual ou em ambiente sintético.
- [ ] Nenhum dado pessoal ou operacional real em slides/anexos.
- [ ] Lista de perguntas classificada em P0, P1 e P2.
- [ ] Responsável por cada resposta e anotação definido.
- [ ] Plano para solicitar confirmação escrita das decisões críticas.

## H. Protocolo

- [ ] Conferir assinatura e poderes do subscritor.
- [ ] Conferir datas pretendidas para reunião.
- [ ] Conferir nomes e contatos dos participantes.
- [ ] Converter anexos para formatos aceitos sem perder legibilidade.
- [ ] Validar hashes/versões internas dos anexos.
- [ ] Protocolar no tipo de processo correto.
- [ ] Salvar comprovante de protocolo.
- [ ] Registrar número do processo SEI.
- [ ] Registrar data e responsável pelo protocolo.

## I. Pós-protocolo

- [ ] Monitorar comunicação oficial do processo.
- [ ] Responder exigência somente pelo canal rastreável aplicável.
- [ ] Não alterar anexos já protocolados sem versionamento.
- [ ] Preparar material de reunião conforme orientação recebida.
- [ ] Registrar mudanças de agenda e participantes.

## J. Pós-reunião

- [ ] Preencher ata no mesmo dia.
- [ ] Registrar respostas exatas e limitações.
- [ ] Separar orientação, hipótese e decisão formal.
- [ ] Enviar pedido de confirmação quando a decisão afetar arquitetura.
- [ ] Atualizar `DECISION_REGISTER.csv`.
- [ ] Abrir issues para cada ação.
- [ ] Atualizar ADR de assinatura.
- [ ] Atualizar ADR de PED/offline.
- [ ] Atualizar escopo da avaliação independente.
- [ ] Atualizar matriz de conformidade.
- [ ] Não iniciar provider produtivo ou escrita offline enquanto houver gate P0 aberto.

## K. Critérios para iniciar a fase formal

- [ ] Método de demonstração de segurança definido.
- [ ] Entidade avaliadora elegível confirmada.
- [ ] Método de assinatura definido em princípio.
- [ ] Modelo PED/offline definido em princípio.
- [ ] Forma de fiscalização definida.
- [ ] Escopo de manuais e demonstrações conhecido.
- [ ] Estratégia de frota/cutover conhecida.
- [ ] Shadow mode aceito como fase de evidência.
- [ ] Backlog técnico reordenado conforme orientação.
