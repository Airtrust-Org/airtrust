# Controle de Voos N1 - Checklist Operacional de Execucao do Piloto

> Data de referencia: 2026-06-14
> Estado de partida: **pronto com ressalvas** para piloto interno controlado
> Documento base: `docs/CONTROLE_DE_VOOS_N1_PILOTO_INTERNO_CONTROLADO.md`

## 1. Sumario executivo

Este documento transforma o plano de piloto interno controlado do Controle de Voos N1 em um checklist operacional de execucao para 5 dias consecutivos de validacao com usuarios reais e acesso restrito.

Resumo do piloto:

- objetivo: validar uso operacional interno real de Dashboard OCC, lista de voos, detalhe do voo, RDV operacional e resumo interno;
- duracao: 5 dias, com `Dia 0` de preparacao e `Dia 5` de decisao go/no-go;
- ambiente recomendado: **preview/staging com acesso restrito e dados controlados**;
- participantes: sponsor/gestor operacional, OCC/controle, piloto observador ou limitado, administrador tecnico, responsavel AirTrust/produto e suporte tecnico;
- o que sera testado: consulta, leitura, abertura de detalhe, abertura de RDV, inicio de preenchimento, salvamento de rascunho, reabertura para validacao de persistencia, finalizacao de preenchimento e consulta de dashboard/resumo;
- o que nao sera testado: substituicao de Sigvoos/APUS/papel, Diario de Bordo, eDB, SDRMe, RAS, assinatura juridica, uso fiscal, integracao real com MRO/FRMS, export fiscal, modo offline/tablet e qualquer narrativa de sistema regulado.

## 2. Premissas obrigatorias

Antes do inicio do piloto, todas as premissas abaixo devem ser aceitas formalmente:

- o modulo esta em **N1 operacional interno**;
- o modulo **nao e regulado**;
- o modulo **nao e fiscal**;
- o piloto **nao substitui** Sigvoos, APUS, papel, Diario de Bordo, eDB ou SDRMe;
- os dados usados no piloto sao controlados e rastreaveis;
- os usuarios participantes foram avisados por escrito sobre o escopo e os limites;
- o plano de rollback esta definido e aprovado;
- o uso ocorrera em paralelo ao fluxo legado;
- qualquer divergencia com o sistema oficial favorece o sistema oficial;
- qualquer risco regulatorio percebido autoriza pausa imediata.

## 3. Cronograma de 5 dias

| Dia | Objetivo | Atividades | Dono | Participantes | Evidencia esperada | Criterio de saida | Riscos do dia |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Dia 0 - preparacao** | Confirmar prontidao operacional e governanca | validar ambiente, acesso, massa de dados, permissao, comunicacao, rollback e stop criteria | Administrador tecnico + Responsavel AirTrust/produto | Sponsor, suporte tecnico | checklist pre-piloto completo, usuarios habilitados, voos controlados definidos | todos os itens obrigatorios marcados como concluidos | ambiente incorreto, permissao errada, massa de dados inadequada, falta de alinhamento |
| **Dia 1 - onboarding e primeiro fluxo guiado** | Alinhar participantes e executar primeiro fluxo com acompanhamento proximo | briefing, reforco de limites, walkthrough do dashboard, voo, detalhe, RDV, salvamento de rascunho e finalizacao guiada | Responsavel AirTrust/produto | Sponsor, OCC, piloto observador, suporte | feedback inicial por perfil, primeiro fluxo concluido, duvidas mapeadas | pelo menos 1 fluxo completo executado sem confusao regulatoria material | usuario interpretar o modulo como oficial, travas de permissao, dificuldade de entendimento |
| **Dia 2 - uso assistido** | Validar repeticao do fluxo com menor orientacao | usuarios executam 2 a 4 voos controlados com apoio sob demanda, registrar tempos, erros e divergencias | OCC lider + suporte tecnico | OCC, piloto observador, administrador tecnico | planilha ou formulario com tempos, erros e divergencias do dia | maioria dos fluxos concluida com ajuda pontual, sem incidente critico | retrabalho alto, persistencia falhar, dados divergirem do esperado |
| **Dia 3 - uso com menor intervencao** | Medir autonomia real do fluxo principal | repetir o fluxo em mais voos controlados, reduzir intervencao do time AirTrust, observar se dashboard e resumo sao usados de forma natural | Sponsor operacional + OCC lider | OCC, gestor operacional, suporte em prontidao | feedback mais espontaneo, menor dependencia de suporte, tempos mais estaveis | usuarios conseguem executar o fluxo principal quase sem condução | necessidade constante de suporte, desempenho ruim, duvidas recorrentes de escopo |
| **Dia 4 - consolidacao e correcoes de processo** | Ajustar o processo do piloto sem abrir escopo tecnico novo | revisar feedback acumulado, reforcar comunicacao, corrigir instrucoes operacionais, reexecutar casos com divergencia | Responsavel AirTrust/produto | Sponsor, OCC, administrador tecnico | backlog operacional do piloto, lista de ajustes de processo, reincidencias classificadas | principais duvidas do piloto tratadas, sem incidente aberto critico | inflacao de escopo, tentativa de pedir feature nova, desgaste dos usuarios |
| **Dia 5 - decisao go/no-go** | Consolidar resultado e decidir continuidade | revisar metricas, incidentes, criterios de sucesso, criterios de parada e decisao final | Sponsor + Responsavel AirTrust/produto | todos os donos | relatorio final preliminar, decisao GO / GO com ressalvas / NO-GO | decisao formal registrada com justificativa objetiva | decisao tomada sem dados suficientes, minimizacao de incidente, pressao para expandir cedo demais |

## 4. Donos e responsabilidades

### Sponsor / gestor operacional

Responsabilidades:

- patrocinar o piloto;
- garantir que o fluxo legado continue vigente;
- arbitrar prioridade operacional do piloto;
- aprovar GO, GO com ressalvas ou NO-GO.

Limites:

- nao pode declarar o modulo como oficial ou regulado;
- nao pode substituir Sigvoos, APUS ou papel.

Decisoes que pode tomar:

- continuar ou pausar o piloto por risco operacional;
- restringir publico ou voos do piloto;
- encerrar a janela de teste.

Decisoes que nao pode tomar sozinho:

- promover o modulo para uso regulado;
- abrir rollout amplo em producao;
- integrar eDB, SDRMe, MRO ou FRMS real.

### OCC / controle

Responsabilidades:

- executar o fluxo operacional do dia;
- registrar tempos, erros, divergencias e retrabalho;
- validar aderencia do fluxo a rotina real.

Limites:

- nao pode usar o modulo como documento oficial;
- nao pode ignorar o fluxo oficial em paralelo.

Decisoes que pode tomar:

- interromper o fluxo do dia por anomalia funcional;
- classificar dificuldade e sugerir ajuste de processo.

Decisoes que nao pode tomar:

- alterar o escopo do piloto;
- interpretar finalizacao de RDV como assinatura;
- liberar outros usuarios.

### Piloto observador

Responsabilidades:

- testar leitura dos proprios voos;
- preencher o proprio RDV, quando autorizado;
- relatar dificuldades de entendimento e dados faltantes.

Limites:

- nao pode alterar voos de terceiros;
- nao pode tratar o RDV como Diario de Bordo oficial.

Decisoes que pode tomar:

- solicitar pausa do fluxo se houver ambiguidade critica;
- registrar risco percebido.

Decisoes que nao pode tomar:

- validar o modulo como pronto;
- ampliar o escopo ou mudar permissao.

### Administrador tecnico

Responsabilidades:

- preparar ambiente, acessos e massa de dados;
- acompanhar erros, estabilidade e rollback;
- retirar acessos rapidamente em caso de incidente.

Limites:

- nao pode aplicar migration fora do ambiente autorizado;
- nao pode conectar sistemas fora do escopo.

Decisoes que pode tomar:

- pausar uso por incidente tecnico critico;
- executar rollback do piloto;
- restringir acesso adicionalmente.

Decisoes que nao pode tomar sozinho:

- declarar GO final;
- promover o piloto a uso amplo.

### Responsavel AirTrust / produto

Responsabilidades:

- conduzir onboarding;
- consolidar feedback e aprendizado;
- manter o piloto dentro do escopo N1 nao regulado;
- preparar relatorio final e recomendacao.

Limites:

- nao pode abrir feature nova durante a execucao;
- nao pode prometer integracoes futuras no meio do piloto.

Decisoes que pode tomar:

- ajustar roteiro, comunicacao e forma de coleta;
- classificar feedback por prioridade;
- recomendar GO, GO com ressalvas ou NO-GO.

Decisoes que nao pode tomar sozinho:

- substituir fluxo oficial;
- converter piloto em rollout.

### Suporte tecnico

Responsabilidades:

- atender duvidas e incidentes durante a janela;
- registrar sintomas e passos de reproducao;
- apoiar coleta de evidencias.

Limites:

- nao pode improvisar alteracoes fora do processo;
- nao pode relativizar incidente critico.

Decisoes que pode tomar:

- escalar incidente imediatamente;
- orientar o usuario a interromper o fluxo.

Decisoes que nao pode tomar:

- reclassificar risco regulatorio sem alinhamento;
- retomar piloto apos incidente critico sem liberacao.

## 5. Checklist antes de iniciar

Marcar todos os itens antes do `Dia 1`:

- ambiente do piloto definido
- migration `cv_*` aplicada somente no ambiente autorizado
- dados controlados carregados e revisados
- usuarios participantes definidos
- permissoes revisadas por perfil
- banners e textos de uso interno revisados
- comunicacao oficial enviada aos participantes
- plano de rollback aprovado
- criterios de parada imediata aceitos por todos os donos
- suporte tecnico disponivel durante a janela
- voos controlados selecionados
- responsavel por consolidar feedback definido
- sponsor confirmou que o fluxo legado segue obrigatorio

## 6. Roteiro diario de uso

Checklist operacional por voo:

- abrir dashboard
- confirmar que o usuario entende que o modulo e uso interno
- localizar voo na lista
- abrir detalhe do voo
- conferir identificacao, data, status e dados principais
- abrir RDV
- se `RDV ainda nao preenchido`, iniciar preenchimento
- preencher campos minimos obrigatorios do RDV
- salvar rascunho
- reabrir o RDV e conferir persistencia
- finalizar preenchimento
- retornar ao dashboard e verificar reflexo nos indicadores
- consultar resumo operacional, se disponivel
- registrar feedback imediatamente apos o fluxo
- registrar qualquer divergencia com o sistema oficial

Checklist de encerramento diario:

- total de fluxos executados consolidado
- incidentes do dia classificados
- duvidas recorrentes listadas
- riscos percebidos atualizados
- decisao do dia: continuar sem ajuste / continuar com ajuste de processo / pausar

## 7. Template de feedback diario

Usar um formulario por usuario e por sessao:

```text
Data:
Usuario:
Perfil:
Tarefa realizada:
Funcionou? (sim / parcial / nao):
Dificuldade encontrada:
Tempo gasto:
Erro encontrado:
Dado divergente? (sim / nao):
Risco percebido:
Sugestao:
Prioridade (baixa / media / alta / critica):
Print ou link, se houver:
```

## 8. Template de incidente

Usar para qualquer falha com impacto tecnico, operacional ou regulatorio:

```text
Titulo:
Severidade (baixa / media / alta / critica):
Modulo ou tela:
Usuario afetado:
Horario:
Descricao:
Passos para reproduzir:
Impacto:
Acao imediata:
Responsavel:
Status (aberto / mitigado / encerrado):
Decisao: continuar piloto / pausar piloto
```

## 9. Metricas do piloto

Consolidar diariamente e fechar no `Dia 5`:

- voos consultados
- voos efetivamente usados no roteiro completo
- RDVs iniciados
- RDVs finalizados
- erros por fluxo
- tempo medio de preenchimento do RDV
- quantidade de duvidas dos usuarios
- divergencias com sistema oficial
- quantidade de incidentes
- quantidade de acionamentos de suporte
- percepcao de valor pelos participantes

Indicadores interpretativos recomendados:

- autonomia do usuario no fluxo
- nivel de retrabalho
- clareza do dashboard
- confianca no dado operacional
- risco de confusao com sistema oficial

## 10. Criterios de parada imediata

Parar o piloto imediatamente se ocorrer qualquer um dos cenarios abaixo:

- usuario entender que o modulo substitui sistema oficial;
- erro cross-tenant;
- perda de dados;
- erro recorrente em RDV que inviabilize o fluxo;
- uso ou tentativa de uso como evidencia oficial;
- divergencia operacional critica com impacto potencial de decisao;
- falha de permissao com acesso indevido;
- instabilidade severa do ambiente;
- qualquer linguagem ou comportamento que reintroduza ambiguidade regulatoria material.

## 11. Criterios de go/no-go final

### GO

Marcar `GO` somente se:

- o fluxo principal foi concluido repetidamente por usuarios reais;
- nao houve incidente critico;
- nao houve confusao regulatoria material;
- nao houve erro cross-tenant;
- a persistencia de RDV se mostrou estavel;
- o dashboard e o resumo foram considerados uteis;
- a equipe entende que vale seguir para rollout limitado controlado.

### GO com ressalvas

Marcar `GO com ressalvas` se:

- o fluxo principal funciona, mas ainda depende de suporte pontual;
- houver incidentes medios mitigados;
- houver duvidas de processo trataveis sem mudar o escopo do produto;
- a percepcao de valor for positiva, mas existirem ajustes operacionais pendentes.

### NO-GO

Marcar `NO-GO` se:

- houver incidente critico;
- houver confusao recorrente com sistema oficial;
- houver perda de dados, erro de tenant ou falha de permissao;
- o fluxo principal nao for concluido com confianca;
- a operacao entender que o modulo ainda gera mais risco do que valor.

Checklist objetivo de decisao:

- fluxo principal concluido?
- usuarios entenderam limites nao regulados?
- houve incidente critico?
- houve divergencia grave com fluxo oficial?
- houve valor operacional percebido?
- suporte necessario ficou aceitavel?
- ambiente permaneceu estavel?

## 12. Comunicacao para usuarios

### Texto antes do piloto

> O Controle de Voos N1 do AirTrust entrara em piloto interno controlado por 5 dias, com acesso restrito e dados controlados.
> Este uso e **operacional interno**, **nao regulado** e **nao fiscal**.
> O piloto **nao substitui** Sigvoos, APUS, papel, Diario de Bordo, eDB, SDRMe ou qualquer sistema oficial.
> Durante o piloto, os participantes devem seguir operando em paralelo com o fluxo legado e registrar feedback sobre clareza, utilidade, dificuldades e inconsistencias.

### Texto durante o piloto

> Lembrete: o Controle de Voos N1 continua sendo uma ferramenta de uso interno em piloto controlado.
> Nenhuma informacao do piloto deve ser tratada como registro oficial ou evidencia fiscal/regulatoria.
> Em caso de erro, divergencia ou duvida sobre escopo, interrompa o fluxo e acione imediatamente o suporte do piloto.

### Texto de encerramento

> O piloto interno controlado do Controle de Voos N1 foi encerrado.
> Obrigado pelo feedback e pela execucao dentro do escopo operacional interno.
> O resultado agora sera consolidado para decisao formal de GO, GO com ressalvas ou NO-GO.
> Ate nova comunicacao, os sistemas e registros oficiais continuam sendo a unica referencia formal da operacao.

## 13. Plano de rollback

Se o piloto precisar ser interrompido:

1. desabilitar o acesso ao modulo para os participantes;
2. comunicar parada imediata em todos os canais definidos;
3. orientar usuarios a interromper qualquer novo lancamento no Controle de Voos;
4. preservar os dados do piloto apenas para analise interna;
5. declarar que os registros do piloto nao possuem valor oficial;
6. retornar integralmente ao processo anterior com Sigvoos, APUS, papel e demais rotinas vigentes;
7. registrar causa, impacto, decisao e proximos passos antes de qualquer retomada.

## 14. Relatorio final do piloto

Estrutura minima do relatorio final:

- resumo executivo
- participantes
- periodo
- ambiente utilizado
- fluxos testados
- metricas consolidadas
- incidentes registrados
- feedbacks recorrentes
- decisao final
- proximos passos

Template recomendado:

```text
Resumo:
Participantes:
Periodo:
Ambiente:
Fluxos testados:
Metricas:
Incidentes:
Feedbacks:
Decisao:
Proximos passos:
```

## 15. Proxima decisao macro

A proxima decisao recomendada apos este checklist **nao e abrir nova feature**.

Sequencia recomendada:

1. escolher formalmente o ambiente do piloto;
2. executar o piloto conforme este checklist;
3. registrar o resultado com metricas, incidentes e feedback;
4. somente depois decidir entre rollout limitado controlado ou rodada adicional de correcoes de processo/produto.

## Resumo operacional rapido

- Veredito recomendado: **pronto com ressalvas**
- Ambiente recomendado: **preview/staging com acesso restrito**
- Principal risco: **confusao entre RDV operacional e sistema oficial**
- Principal condicao de parada: **qualquer uso ou interpretacao como evidencia oficial**
- Principal decisao seguinte: **aprovar ambiente e executar o piloto de 5 dias**
