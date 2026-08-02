# Modelos — shadow pilot e relatório de prontidão

> **Regra permanente:** durante o shadow pilot, o Diário de Bordo em papel permanece a única fonte oficial.

## 1. Roteiro de shadow pilot

### 1.1 Identificação do ciclo

| Campo | Preenchimento |
|---|---|
| Operador | `[OPERADOR]` |
| Ciclo | `[IDENTIFICADOR]` |
| Versão do protocolo | `[VERSÃO]` |
| Versão/commit AirTrust | `[IDENTIFICADOR]` |
| Modelo/matrículas | `[ESCOPO]` |
| Base(s) | `[BASES]` |
| Janela | `[INÍCIO/FIM]` |
| Gestor do piloto | `[NOME/FUNÇÃO]` |
| Auditor do ciclo | `[NOME/FUNÇÃO]` |
| Repositório autorizado de evidências | `[LOCAL]` |

### 1.2 Declaração obrigatória

> **SHADOW MODE — RASCUNHO NÃO OFICIAL — O DIÁRIO DE BORDO EM PAPEL PERMANECE A FONTE OFICIAL.**

Esta declaração deve estar visível nas telas, PDFs, exportações, briefings e evidências do ciclo.

### 1.3 Objetivos do ciclo

- validar completude e procedência do rascunho;
- comparar o AirTrust com o papel após o ato oficial;
- testar fluxo operacional, manutenção, PED/offline e contingência;
- medir divergências e causas sem ranking individual;
- avaliar treinamento, usabilidade e carga de trabalho;
- produzir evidência para correção, avaliação independente e submissão.

### 1.4 Escopo e amostragem

A amostragem deve ser justificada pela variedade de riscos e cenários, não apenas por quantidade de voos.

| Dimensão | Escopo planejado | Justificativa |
|---|---|---|
| matrículas | `[ ]` | `[ ]` |
| bases/rotas | `[ ]` | `[ ]` |
| PIC/SIC/perfis | `[QUANTIDADE, SEM DADOS PÚBLICOS]` | `[ ]` |
| voos de uma etapa | `[ ]` | `[ ]` |
| múltiplas etapas | `[ ]` | `[ ]` |
| troca de tripulação | `[ ]` | `[ ]` |
| situação técnica/discrepância | `[ ]` | `[ ]` |
| conectividade degradada/offline | `[ ]` | `[ ]` |
| contingências simuladas | `[ ]` | `[ ]` |
| segurança/integridade | `[ ]` | `[ ]` |

### 1.5 Papéis no ciclo

| Papel | Responsabilidade |
|---|---|
| Gestor do piloto | autorizar janela, congelar escopo, interromper e encerrar ciclo |
| PIC | revisar rascunho e apontar divergências; qualquer confirmação é explicitamente não oficial |
| SIC/outros tripulantes | validar identificação, função e etapas |
| OCC/coordenação | acompanhar origem, campos ausentes, conflitos e consistência do RDV |
| Manutenção | validar situação técnica, discrepância, ação e RTS no fluxo shadow |
| GSO | acompanhar perigos, carga de trabalho e incidentes |
| AirTrust/TI | suporte, integridade, logs sanitizados, versão e evidências |
| Auditor do ciclo | comparar papel e AirTrust sem corrigir silenciosamente |
| Segurança/dados | controlar acesso, incidente e armazenamento das evidências |

### 1.6 Pré-briefing

- [ ] escopo e janela confirmados;
- [ ] fonte oficial em papel reforçada;
- [ ] participantes e contatos confirmados;
- [ ] versão e dispositivos conferidos;
- [ ] critérios de interrupção explicados;
- [ ] procedimento de contingência disponível;
- [ ] repositório de evidências acessível;
- [ ] nenhum cenário pressiona atividade em fase crítica;
- [ ] dados reais protegidos e não serão expostos em issue pública.

### 1.7 Fluxo por caso

1. identificar o caso shadow e a referência ao voo real;
2. criar/importar o voo no Controle de Voos;
3. gerar o rascunho eDB com procedência dos campos;
4. registrar campos ausentes, inconsistentes ou pendentes;
5. preencher e assinar o Diário de Bordo oficial em papel conforme procedimento vigente;
6. somente após o ato oficial, comparar papel e rascunho;
7. simular revisão/confirmação no AirTrust sem valor oficial;
8. executar validação de manutenção quando aplicável;
9. registrar toda divergência sem aplicar “última escrita vence”;
10. classificar severidade e causa;
11. preservar evidência e abrir ação corretiva;
12. executar reteste após correção aprovada;
13. congelar o resultado com versão, data e revisores.

### 1.8 Campos e evidências a comparar

#### Identificação

- operador, proprietário, fabricante, modelo, número de série e matrícula;
- referência do volume/página oficial;
- versão do rascunho e commit do sistema.

#### Tripulação

- identificação e CANAC;
- função por etapa;
- apresentação, base e troca de tripulação.

#### Voo e etapas

- data, origem, destino e natureza;
- partida, decolagem, pouso e corte;
- tempos de voo e block;
- diurno/noturno, VFR/IFR real/IFR simulado;
- pousos, ciclos, combustível, POB e carga;
- ocorrências e procedência de cada campo.

#### Situação técnica

- última e próxima intervenção;
- horas restantes;
- discrepâncias abertas;
- ação corretiva ou retardada;
- retorno ao serviço e aprovador;
- ciência do PIC.

#### Dispositivo e sincronização

- dispositivo e versão;
- conectividade;
- pacote offline e idade;
- tempo de sincronização;
- duplicação, ordem, conflito e mensagens;
- revogação, perda e uso de reserva.

### 1.9 Cenários mínimos

#### Operacionais

- [ ] uma etapa;
- [ ] múltiplas etapas;
- [ ] retorno à origem;
- [ ] troca de PIC;
- [ ] jornada atravessando meia-noite;
- [ ] alteração manual após importação;
- [ ] cancelamento;
- [ ] voo sem dado SIGVOOS;
- [ ] conflito de origem/destino;
- [ ] combustível em unidade não confirmada.

#### Manutenção

- [ ] nenhuma discrepância;
- [ ] discrepância aberta;
- [ ] ação corretiva imediata;
- [ ] ação retardada;
- [ ] RTS por terceiro;
- [ ] licença/prerrogativa expirada;
- [ ] situação técnica atualizada entre etapas;
- [ ] horas restantes próximas do limite.

#### PED/offline

- [ ] inicialização sem rede;
- [ ] perda de rede durante o caso;
- [ ] pacote no limite de retenção offline previsto;
- [ ] pacote vencido/corrompido;
- [ ] dispositivo revogado;
- [ ] dispositivo principal indisponível;
- [ ] equipamento reserva;
- [ ] fila duplicada;
- [ ] comandos fora de ordem;
- [ ] relógio alterado;
- [ ] sincronização após jornada.

#### Integridade e segurança

- [ ] tentativa cross-tenant;
- [ ] alteração de rascunho congelado;
- [ ] replay de confirmação;
- [ ] sessão impersonada;
- [ ] correção preservando original;
- [ ] exportação divergente;
- [ ] restauração de backup;
- [ ] detecção de corrupção.

### 1.10 Critérios de interrupção

Interromper imediatamente o cenário ou ciclo quando houver:

- confusão sobre a fonte oficial;
- acesso ou vazamento cross-tenant;
- situação técnica incorreta/ausente apresentada como válida;
- perda de evidência;
- alteração silenciosa de dado congelado;
- impacto indevido na carga de trabalho ou fase crítica;
- dispositivo comprometido;
- divergência crítica;
- prejuízo ao procedimento oficial;
- solicitação do operador, GSO ou ANAC.

### 1.11 Registro diário do ciclo

| Data | Casos executados | Interrupções | Divergências C/A/M/B/O | Retestes | Versão | Decisão do dia |
|---|---:|---|---|---:|---|---|
| `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |

## 2. Registro de divergências

### 2.1 Classificação

| Severidade | Definição | Resposta |
|---|---|---|
| Crítica | pode falsificar, perder, alterar ou expor registro; assinatura indevida; risco técnico; cross-tenant | interromper imediatamente, abrir incidente, preservar evidência |
| Alta | campo obrigatório incorreto ou indisponibilidade que impediria cumprimento | suspender cenário afetado e corrigir antes de nova janela |
| Média | inconsistência com mitigação manual clara, sem risco imediato | abrir ação e repetir cenário |
| Baixa | apresentação, usabilidade ou documentação sem alterar conteúdo | registrar em backlog priorizado |
| Observação | melhoria sem não conformidade demonstrada | avaliar sem bloquear |

### 2.2 Códigos de causa

- `SOURCE_MISSING`;
- `SOURCE_CONFLICT`;
- `MAPPING_ERROR`;
- `TIMEZONE_ERROR`;
- `UNIT_ERROR`;
- `IDENTITY_ERROR`;
- `TENANT_SCOPE_ERROR`;
- `TECHNICAL_STATUS_STALE`;
- `OFFLINE_PACKAGE_ERROR`;
- `SYNC_ERROR`;
- `USER_WORKFLOW_ERROR`;
- `MANUAL_PROCEDURE_GAP`;
- `TRAINING_GAP`;
- `REGULATORY_DECISION_PENDING`;
- `OTHER_JUSTIFIED`.

### 2.3 Modelo de registro

| Campo | Valor |
|---|---|
| ID | `[DIV-0001]` |
| Ciclo/caso | `[ ]` |
| Identificador pseudonimizado | `[ ]` |
| Data/hora | `[ ]` |
| Versão/commit | `[ ]` |
| Matrícula dentro do escopo | `[REFERÊNCIA CONTROLADA]` |
| Campo/processo | `[ ]` |
| Fonte oficial comparada | `[REFERÊNCIA AO PAPEL]` |
| Resultado AirTrust | `[VALOR EM ANEXO PROTEGIDO/HASH]` |
| Severidade | `[CRÍTICA/ALTA/MÉDIA/BAIXA/OBSERVAÇÃO]` |
| Causa | `[CÓDIGO]` |
| Impacto potencial | `[ ]` |
| Contenção | `[ ]` |
| Responsável | `[ ]` |
| Issue/ação | `[ ]` |
| Correção | `[ ]` |
| Evidência de reteste | `[ ]` |
| Estado | `[ABERTA/EM TRATAMENTO/RETÉSTE/FECHADA/ACEITA COM JUSTIFICATIVA]` |
| Data de fechamento | `[ ]` |
| Aprovador do fechamento | `[ ]` |

### 2.4 Regras

- não armazenar dados reais sensíveis no registro público;
- conflito não pode ser resolvido silenciosamente;
- fechamento exige evidência de reteste ou decisão formal aplicável;
- divergência regulatória pendente não pode ser reclassificada como técnica resolvida;
- reincidência deve ser vinculada à causa comum;
- nenhuma métrica deve gerar ranking nominal de tripulantes.

## 3. Indicadores do shadow

| Indicador | Fórmula/definição | Meta do ciclo | Resultado | Observação |
|---|---|---:|---:|---|
| voos com rascunho completo | casos completos/casos elegíveis | `[ ]` | `[ ]` | `[ ]` |
| campos coincidentes | campos coincidentes/campos comparados | `[ ]` | `[ ]` | `[ ]` |
| divergências críticas | contagem | `0 aberta` | `[ ]` | `[ ]` |
| divergências altas | contagem | `0 aberta` | `[ ]` | `[ ]` |
| retestes aprovados | retestes aprovados/planejados | `[ ]` | `[ ]` | `[ ]` |
| tempo de revisão | distribuição agregada | `[ ]` | `[ ]` | sem ranking individual |
| falhas de sincronização | por caso/dispositivo/versão | `[ ]` | `[ ]` | `[ ]` |
| bloqueios corretos | bloqueios esperados executados | `[ ]` | `[ ]` | `[ ]` |
| falsos bloqueios | contagem | `[ ]` | `[ ]` | `[ ]` |
| situação técnica válida | casos válidos/casos aplicáveis | `[ ]` | `[ ]` | `[ ]` |
| treinamento aprovado | participantes aprovados/elegíveis | `100%` | `[ ]` | `[ ]` |

## 4. Relatório de prontidão

### 4.1 Capa e controle

- operador: `[OPERADOR]`;
- ciclo(s): `[IDENTIFICADORES]`;
- período: `[ ]`;
- versão/commit avaliado: `[ ]`;
- escopo de aeronaves/bases: `[ ]`;
- autores e revisores: `[ ]`;
- classificação e local dos anexos: `[ ]`.

### 4.2 Sumário executivo

Descrever:

- objetivo e escopo;
- fonte oficial preservada;
- quantidade e variedade de casos;
- principais resultados;
- divergências relevantes;
- riscos residuais;
- decisão recomendada para o próximo gate.

O sumário não deve afirmar aprovação, ateste, aceitação ou autorização da ANAC.

### 4.3 Metodologia

- protocolo e versão;
- critérios de seleção de casos;
- perfis participantes;
- método de comparação com papel;
- controles de dados e evidências;
- limitações e casos não executados;
- mudanças de versão durante o período.

### 4.4 Resultados por domínio

| Domínio | Casos | Resultado | Divergências | Evidências | Conclusão |
|---|---:|---|---|---|---|
| identificação e frota | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| tripulação e etapas | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| tempos, pousos e combustível | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| situação técnica e RTS | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| assinatura simulada/decisão pendente | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| PED/offline | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| contingência/DR | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| segurança/multi-tenancy | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| fiscalização/exportação | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| treinamento/fatores humanos | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |

### 4.5 Divergências e correções

| Severidade | Abertas no início | Identificadas | Fechadas | Abertas no fim | Bloqueio |
|---|---:|---:|---:|---:|---|
| Crítica | `[ ]` | `[ ]` | `[ ]` | `[ ]` | deve ser zero |
| Alta | `[ ]` | `[ ]` | `[ ]` | `[ ]` | deve ser zero para S1 |
| Média | `[ ]` | `[ ]` | `[ ]` | `[ ]` | plano e reteste definidos |
| Baixa | `[ ]` | `[ ]` | `[ ]` | `[ ]` | backlog |
| Observação | `[ ]` | `[ ]` | `[ ]` | `[ ]` | não bloqueante justificado |

### 4.6 Riscos residuais e decisões pendentes

| ID | Risco/decisão | Impacto | Mitigação atual | Dono | Gate afetado | Estado |
|---|---|---|---|---|---|---|
| `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |

### 4.7 Critérios de saída S1

- [ ] cenários planejados executados ou justificados;
- [ ] nenhuma divergência crítica aberta;
- [ ] nenhuma divergência alta aberta;
- [ ] divergências médias com correção e reteste;
- [ ] tenant isolation comprovado;
- [ ] nenhuma confusão entre shadow e oficial;
- [ ] situação técnica validada;
- [ ] offline e contingência atingiram critérios;
- [ ] treinamento concluído e avaliado;
- [ ] documentação corresponde ao comportamento;
- [ ] versão e evidências congeladas;
- [ ] relatório aprovado pelo operador.

### 4.8 Recomendação

Selecionar uma opção e justificar:

- `[ ]` avançar para avaliação/submissão;
- `[ ]` repetir ciclo shadow após correções;
- `[ ]` reduzir/alterar escopo;
- `[ ]` suspender até decisão regulatória;
- `[ ]` encerrar o projeto sem avanço.

### 4.9 Aprovação

| Parte | Nome/função | Decisão | Data | Observação |
|---|---|---|---|---|
| Operador | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| AirTrust | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| Auditor/avaliador, se aplicável | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
