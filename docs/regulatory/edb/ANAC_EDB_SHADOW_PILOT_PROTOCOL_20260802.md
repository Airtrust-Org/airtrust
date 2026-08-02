# AirTrust — Protocolo de shadow mode do Diário de Bordo Digital

> **Data:** 2026-08-02 (BRT)  
> **SHA-base:** `d27d72178a75664ff0fb8ac8f18768b88b8112ca`  
> **Status:** planejamento; papel permanece como única fonte oficial  
> **Dependência:** baseline regulatório da PR #688 e orientação prévia da ANAC

## 1. Objetivo

Validar, em operação controlada, se o AirTrust consegue reproduzir com integridade, completude, disponibilidade e usabilidade os registros que futuramente poderão compor o Diário de Bordo Digital.

O shadow mode serve para:

- medir divergência entre o Diário de Bordo oficial e o rascunho AirTrust;
- testar coleta, procedência, validação e revisão;
- testar situação técnica e fluxo de manutenção;
- testar PED/offline e contingência;
- testar treinamento e carga de trabalho;
- produzir evidências para correção, avaliação independente e submissão.

O shadow mode não autoriza:

- substituir o papel;
- usar o AirTrust como fonte oficial;
- assinar em nome de qualquer pessoa;
- dispensar preenchimento, assinatura ou guarda do Diário de Bordo oficial;
- liberar voo com base exclusiva no rascunho AirTrust;
- usar dados shadow para cumprir prazo regulatório de assinatura.

## 2. Princípios

1. **Uma única fonte oficial:** durante todo o piloto, o papel permanece oficial.
2. **Sem transcrição automática retroativa:** o rascunho registra origem e momento de cada dado.
3. **Sem autoassinatura:** importação SIGVOOS, job ou coordenação nunca representa o ato do PIC.
4. **Divergência visível:** conflito não é resolvido por “última escrita vence”.
5. **Sem punição por teste:** erros de usabilidade e de processo são tratados como evidência de desenvolvimento, sem substituir os procedimentos disciplinares do operador quando houver conduta fora do shadow mode.
6. **Menor exposição:** somente dados necessários e participantes autorizados.
7. **Escopo congelado:** mudanças durante uma janela geram nova versão do protocolo e reinício da evidência afetada.
8. **Interrupção segura:** qualquer risco à operação, manutenção, dados ou tenant suspende o piloto sem afetar o Diário de Bordo oficial.

## 3. Escopo inicial recomendado

O primeiro ciclo deve ser pequeno e representativo:

- um operador RBAC 135;
- um modelo de aeronave;
- uma ou duas matrículas;
- uma base principal;
- grupo restrito de PIC, SIC, coordenação e manutenção;
- voos de uma e múltiplas etapas;
- operação com e sem conectividade;
- janela mínima suficiente para incluir jornada normal, troca de tripulação, ocorrência técnica e contingência simulada.

A seleção final depende da orientação da ANAC e da gestão de mudança do operador.

## 4. Pré-requisitos

### Regulatórios e de governança

- [ ] shadow mode discutido na reunião prévia;
- [ ] operador aprovou o protocolo interno;
- [ ] papéis e responsáveis designados;
- [ ] papel confirmado como fonte oficial;
- [ ] participantes informados sobre a natureza não oficial;
- [ ] tratamento de dados e acesso definidos;
- [ ] critérios de interrupção aprovados.

### Técnicos

- [ ] tenant isolation testado;
- [ ] ambiente e versão identificados;
- [ ] dados shadow marcados de forma inequívoca;
- [ ] nenhuma tela/PDF usa “oficial”;
- [ ] nenhuma rota shadow escreve em registro regulado;
- [ ] logs sanitizados;
- [ ] backup e restauração do ambiente de teste;
- [ ] exportação de evidências sem dados de outros tenants;
- [ ] dispositivos e versões inventariados;
- [ ] suporte e contato de incidente definidos.

### Operacionais

- [ ] treinamento concluído;
- [ ] roteiro de preenchimento disponível;
- [ ] contingência conhecida;
- [ ] tempo adicional previsto sem pressionar a tripulação;
- [ ] coordenação sabe que o papel prevalece;
- [ ] manutenção conhece o tratamento de discrepâncias shadow;
- [ ] nenhum atraso operacional é imputado ao eDB sem avaliação conjunta.

## 5. Papéis

| Papel                          | Responsabilidade no piloto                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| Gestor do piloto               | autoriza janela, congela escopo e encerra o ciclo                                       |
| PIC                            | revisa rascunho, identifica divergências e simula o ato de assinatura sem valor oficial |
| SIC/outros tripulantes         | valida identificação, função e etapas                                                   |
| Coordenação/OCC                | acompanha origem, pendências e consistência do RDV                                      |
| Manutenção                     | valida situação técnica, discrepância e retorno ao serviço no fluxo shadow              |
| Segurança operacional          | acompanha riscos, fadiga de tarefa e incidentes                                         |
| TI/AirTrust                    | suporte técnico, integridade, logs e evidências                                         |
| Auditor independente interno   | compara papel e AirTrust sem alterar registros                                          |
| Encarregado de dados/segurança | controla acesso e incidente de informação                                               |

## 6. Identificação visual obrigatória

Toda tela, exportação e PDF do piloto deve exibir:

> **SHADOW MODE — RASCUNHO NÃO OFICIAL — O DIÁRIO DE BORDO EM PAPEL PERMANECE A FONTE OFICIAL**

A identificação deve ser:

- persistente;
- legível;
- não dependente apenas de cor;
- presente em impressão e exportação;
- incluída em screenshot de evidência;
- impossível de remover por usuário comum.

## 7. Fluxo por voo

1. criar ou importar o voo no Controle de Voos;
2. montar o rascunho eDB com procedência;
3. registrar campos ausentes ou conflitantes;
4. preencher o Diário de Bordo oficial conforme procedimento vigente;
5. após o ato oficial, comparar o rascunho com o papel;
6. o PIC revisa o rascunho e executa uma simulação de confirmação claramente não oficial;
7. manutenção revisa a situação técnica shadow, quando aplicável;
8. auditor registra divergências sem corrigir silenciosamente;
9. equipe resolve causa e classifica necessidade de mudança;
10. evidência é congelada com versão, data e participantes.

O shadow mode não deve induzir a copiar mecanicamente o papel para mascarar falhas da projeção. Toda alteração manual deve manter a origem.

## 8. Campos comparados

### Identificação

- operador;
- proprietário;
- fabricante;
- modelo;
- número de série;
- matrícula;
- volume e página/registro oficial de referência.

### Tripulação

- nome;
- CANAC;
- função por etapa;
- apresentação;
- base;
- troca de tripulação.

### Voo e etapas

- data;
- origem e destino;
- partida dos motores;
- decolagem;
- pouso;
- corte dos motores;
- tempo de voo e block;
- diurno/noturno;
- VFR/IFR real/IFR simulado;
- pousos e ciclos;
- combustível inicial, final, consumido e abastecido;
- POB;
- carga;
- natureza;
- ocorrências.

### Situação técnica

- última intervenção;
- próxima intervenção;
- horas restantes;
- discrepâncias abertas;
- ação corretiva ou retardada;
- retorno ao serviço;
- ciência do PIC.

### Evidências do sistema

- origem do campo;
- versão do rascunho;
- dispositivo;
- estado online/offline;
- tempo de sincronização;
- conflitos;
- mensagens e bloqueios;
- simulação de intenção/assinatura.

## 9. Classificação de divergências

<!-- prettier-ignore -->
| Severidade | Definição | Exemplos | Tratamento |
|---|---|---|---|
| Crítica | Poderia falsificar registro, liberar voo indevidamente, perder acervo ou expor outro tenant | matrícula errada; situação técnica incorreta; cross-tenant; dado assinado alterado | interromper imediatamente o piloto; incidente; preservar evidência |
| Alta | Campo obrigatório incorreto ou indisponibilidade que impediria cumprimento | horário divergente; PIC errado; offline sem 30 dias; discrepância omitida | suspender cenário afetado; corrigir antes de nova janela |
| Média | Inconsistência com mitigação manual clara, sem risco imediato | unidade não confirmada; função não mapeada; atraso de sincronização | abrir issue e repetir cenário |
| Baixa | Apresentação, usabilidade ou documentação sem alterar conteúdo | rótulo, ordem de campo, mensagem pouco clara | backlog priorizado |
| Observação | Melhoria sem não conformidade demonstrada | atalho, relatório adicional | avaliar sem bloquear |

## 10. Códigos de causa

- `SOURCE_MISSING` — fonte não fornece o dado;
- `SOURCE_CONFLICT` — fontes discordam;
- `MAPPING_ERROR` — transformação incorreta;
- `TIMEZONE_ERROR` — data/hora/fuso incorretos;
- `UNIT_ERROR` — unidade desconhecida ou convertida indevidamente;
- `IDENTITY_ERROR` — pessoa, CANAC ou função incorretos;
- `TENANT_SCOPE_ERROR` — escopo empresarial inválido;
- `TECHNICAL_STATUS_STALE` — situação técnica desatualizada;
- `OFFLINE_PACKAGE_ERROR` — pacote ausente, vencido ou corrompido;
- `SYNC_ERROR` — perda, duplicação, ordem ou idempotência;
- `USER_WORKFLOW_ERROR` — interface/procedimento induz erro;
- `MANUAL_PROCEDURE_GAP` — procedimento documental insuficiente;
- `TRAINING_GAP` — usuário não compreendeu o fluxo;
- `REGULATORY_DECISION_PENDING` — não é possível fechar sem orientação.

## 11. Evidência por caso

Cada caso deve guardar:

- identificador pseudonimizado;
- operador, aeronave e voo dentro do escopo;
- referência ao registro oficial, sem reproduzir mais dados que o necessário;
- versão do AirTrust e commit;
- versão dos contratos/schemas;
- dispositivo e modo de conectividade;
- valores comparados ou hash do anexo protegido;
- divergência, severidade e causa;
- responsável pela revisão;
- decisão e issue/PR;
- resultado do reteste;
- data de encerramento.

Evidências com dados pessoais ou operacionais reais devem permanecer em repositório autorizado, não em issues públicas ou logs.

## 12. Indicadores

Indicadores agregados permitidos:

- percentual de voos com rascunho completo;
- percentual de campos coincidentes;
- divergências por campo, origem e causa;
- tempo de revisão do PIC;
- tempo de sincronização;
- idade do pacote offline;
- falhas por dispositivo/versão;
- quantidade de bloqueios corretos;
- quantidade de falsos bloqueios;
- pendências de situação técnica;
- incidentes por severidade;
- retestes aprovados.

Não usar como indicador de produtividade individual:

- número de erros por piloto;
- tempo de assinatura isolado;
- comparação nominal de tripulantes;
- rankings pessoais.

## 13. Cenários mínimos

### Operacionais

- uma etapa;
- múltiplas etapas;
- retorno à origem;
- troca de PIC;
- jornada atravessando meia-noite;
- alteração manual após importação;
- cancelamento;
- voo sem dado SIGVOOS;
- conflito de origem/destino;
- combustível em unidade não confirmada.

### Técnicos/manutenção

- nenhuma discrepância;
- discrepância aberta;
- ação corretiva imediata;
- ação retardada;
- retorno ao serviço por terceiro;
- licença/prerrogativa expirada;
- situação técnica atualizada entre etapas;
- horas restantes próximas do limite.

### PED/offline

- sem rede desde a inicialização;
- perda de rede durante preenchimento;
- pacote com 30 dias;
- pacote vencido;
- dispositivo revogado;
- dispositivo principal indisponível;
- equipamento reserva;
- fila duplicada;
- comandos fora de ordem;
- relógio alterado;
- sincronização após jornada.

### Integridade e segurança

- tentativa cross-tenant;
- alteração de rascunho congelado;
- replay de confirmação;
- sessão impersonada;
- correção preservando original;
- exportação divergente;
- restauração de backup;
- detecção de corrupção.

## 14. Critérios de interrupção

Interromper o piloto quando houver:

- risco de confusão sobre a fonte oficial;
- vazamento ou acesso cross-tenant;
- situação técnica errada ou ausente apresentada como válida;
- perda de evidência;
- alteração silenciosa de dado congelado;
- impacto indevido na carga de trabalho durante fase crítica;
- dispositivo comprometido;
- divergência crítica;
- procedimento oficial prejudicado;
- solicitação do operador, GSO ou ANAC.

A interrupção não apaga dados nem evidências. Ela cria incidente e exige decisão formal para retomar.

## 15. Critérios de saída por ciclo

Um ciclo é aprovado quando:

- todos os cenários planejados foram executados ou formalmente justificados;
- nenhuma divergência crítica ou alta permanece aberta;
- divergências médias possuem correção e reteste;
- tenant isolation foi comprovado;
- rascunho não foi confundido com oficial;
- offline e contingência atingiram os critérios definidos;
- situação técnica foi validada;
- usuários concluíram avaliação de treinamento;
- documentação corresponde ao comportamento;
- versão e evidências foram congeladas;
- relatório foi aprovado pelo operador.

## 16. Critérios para encerrar o shadow mode

O shadow mode não termina apenas por atingir um número de voos.

Exige:

- estabilidade de uma versão candidata;
- matriz P0 sem lacuna técnica não aceita;
- avaliação independente executada ou em fase compatível;
- assinatura e PED conforme método acordado;
- DR demonstrado;
- manuais alinhados;
- treinamento concluído;
- ateste/aceitação do software;
- alteração de EO/LOA emitida;
- plano de migração aprovado;
- data de cutover definida.

Até o instante formal do cutover, o papel continua oficial.

## 17. Relatório final do piloto

Estrutura mínima:

1. objetivo e escopo;
2. versão e ambiente;
3. operadores, aeronaves e período;
4. participantes e treinamento;
5. cenários;
6. volume de registros;
7. resultados e indicadores;
8. divergências por severidade e causa;
9. incidentes;
10. correções e retestes;
11. offline/PED;
12. situação técnica;
13. fatores humanos;
14. segurança e tenant isolation;
15. limitações;
16. riscos residuais;
17. conclusão de prontidão ou não prontidão;
18. anexos e evidências.

## 18. Próximo passo

Submeter o conceito de shadow mode no FOP 200. Depois da orientação, transformar este protocolo em documento controlado do primeiro operador, preencher matrículas, base, participantes, duração e critérios quantitativos, e somente então iniciar a janela com dados reais autorizados.
