# Controle de Voos N1 - Plano de Piloto Interno Controlado

> Data de referencia: 2026-06-14
> Estado de origem: **pronto com ressalvas** para piloto interno controlado
> Referencias principais: `docs/CONTROLE_DE_VOOS_N1_END_TO_END_READINESS.md`, `docs/CONTROLE_DE_VOOS_N1_MVP_SPEC.md`, `docs/CONTROLE_DE_VOOS_N1_BACKEND_DESIGN.md`, `docs/CONTROLE_DE_VOOS_N1_GAP_LIST.md`, `docs/AIRTRUST_ANAC_REGULATED_SYSTEMS_MASTER_PLAN.md`, `docs/AIRTRUST_MODULE_GOVERNANCE_EVIDENCE_STANDARD.md`

## 1. Sumario executivo

O objetivo deste piloto e validar o **uso operacional interno** do modulo Controle de Voos N1 com usuarios reais, em ambiente controlado, sem substituir fluxos oficiais nem criar qualquer interpretacao de uso regulado.

O piloto deve validar:

- se Dashboard OCC, lista de voos, detalhe do voo e RDV operacional suportam o fluxo real minimo da operacao;
- se os usuarios entendem corretamente o escopo nao regulado do modulo;
- se o preenchimento e a finalizacao operacional do RDV sao executaveis ponta a ponta;
- se os dados apresentados ajudam a operacao sem induzir decisao incorreta;
- se o isolamento por tenant, os status operacionais e os resumos internos se mantem consistentes.

O piloto nao deve validar:

- substituicao de Diario de Bordo, eDB, SDRMe, Sigvoos, APUS ou papel;
- assinatura juridica, valor fiscal, valor regulatorio ou autorizacao ANAC;
- integracao real com MRO, FRMS ou Records Core;
- modo offline/tablet, export fiscal ou fluxo de fiscalizacao.

O modulo **ainda nao e uso regulado** porque permanece em **N1 operacional interno**, sem Records Core regulado, sem assinatura aceita, sem decisao de precedencia RDV x eDB, sem trilha regulatoria e sem autorizacao da ANAC.

Durante o piloto, continuam valendo como sistemas oficiais e referencias operacionais formais:

- Sigvoos;
- APUS;
- papel e demais registros oficiais hoje adotados pelo operador;
- Diario de Bordo oficial e quaisquer registros regulados externos ao AirTrust.

## 2. Escopo do piloto

Entram no piloto:

- Dashboard OCC;
- lista de voos;
- detalhe do voo;
- RDV operacional;
- preenchimento operacional do RDV;
- finalizacao operacional do preenchimento;
- resumo operacional interno e relatorios internos disponiveis;
- uso com dados controlados, preferencialmente reais ou semi-reais sob supervisao.

Nao entram no piloto:

- substituicao do Sigvoos;
- substituicao do APUS;
- substituicao do papel;
- eDB;
- SDRMe;
- RAS;
- assinatura juridica;
- export fiscal;
- integracao MRO real;
- integracao FRMS real;
- offline/tablet;
- autorizacao ANAC.

## 3. Ambiente do piloto

### Opcao A - Local controlado

Vantagens:

- risco operacional minimo;
- execucao rapida para ensaio tecnico;
- permite reset simples com seed local;
- adequado para treinamento do time tecnico e roteiro seco.

Riscos:

- baixa aderencia ao uso multiusuario real;
- menor valor para validar comportamento operacional do dia a dia;
- chance de mascarar diferencas de infraestrutura.

Requisitos:

- `npm run setup:local` executado com sucesso;
- migration `0410_controle_voos_n1_schema.sql` aplicada apenas no ambiente local;
- seed local `cv_*` carregado;
- usuarios de teste controlados;
- script de inicializacao e runbook local revisados.

Recomendacao:

- usar apenas como **ensaio tecnico previo**, nao como primeiro piloto formal com usuarios reais.

### Opcao B - Preview/Staging

Vantagens:

- melhor equilibrio entre realismo e seguranca;
- permite acesso multiusuario controlado;
- reduz risco de contaminacao do ambiente produtivo;
- permite validacao do fluxo completo com dados controlados e permissao restrita.

Riscos:

- depende de ambiente candidato estar alinhado com schema `cv_*` e RBAC;
- pode ter menor paridade de integracoes e dados que producao;
- exige preparacao de massa de dados coerente para teste.

Requisitos:

- ambiente candidato com migration `0410_controle_voos_n1_schema.sql` aplicada somente nele;
- dados `cv_*` minimos preparados e revisados;
- usuarios piloto e perfis definidos;
- comunicacao interna clara de uso nao oficial;
- criterio de rollback e desativacao ja combinado.

Recomendacao:

- **ambiente recomendado para o primeiro piloto formal**.

### Opcao C - Producao com flag restrita

Vantagens:

- maior aderencia ao contexto real da operacao;
- reduz diferencas entre massa real e massa de teste;
- viabiliza shadow mode lado a lado com o fluxo legado.

Riscos:

- maior risco de confusao entre ferramenta interna e fonte oficial;
- maior impacto se houver erro de tenant, dado critico ou UX ambigua;
- maior necessidade de governanca de acesso, observabilidade e suporte em tempo real.

Requisitos:

- gate de acesso por permissao/flag muito restrita;
- usuarios treinados e formalmente alinhados;
- monitoramento ativo durante a janela do piloto;
- plano de retirada imediata do modulo;
- acordo explicito de que o sistema oficial continua prevalecendo.

Recomendacao:

- reservar para **fase 2 do piloto**, somente se a etapa em preview/staging for aprovada.

## 4. Usuarios participantes

### Gestor operacional

Pode fazer:

- acompanhar dashboard e resumo operacional;
- revisar voos, status e RDVs;
- apontar divergencias de processo;
- avaliar utilidade operacional da informacao.

Nao pode fazer:

- tratar o modulo como registro oficial;
- dispensar o uso de Sigvoos, APUS ou papel;
- ampliar escopo do piloto por conta propria.

Telas para testar:

- Dashboard OCC;
- lista de voos;
- detalhe do voo;
- RDV operacional;
- relatorios/resumo interno.

Feedback esperado:

- clareza do painel;
- utilidade do resumo;
- aderencia ao fluxo real;
- riscos de interpretacao regulatoria.

### Usuario OCC / controle

Pode fazer:

- listar voos;
- abrir detalhe;
- preencher e ajustar RDV em rascunho;
- finalizar preenchimento operacional;
- reportar inconsistencias de dados ou fluxo.

Nao pode fazer:

- substituir registros oficiais;
- usar o modulo como despacho legal;
- exportar ou circular informacao como documento oficial.

Telas para testar:

- lista de voos;
- detalhe do voo;
- RDV operacional;
- dashboard;
- resumo operacional.

Feedback esperado:

- tempo de preenchimento;
- pontos de dupla digitacao;
- campos faltantes;
- ambiguidade de status e nomenclatura.

### Piloto / comandante como observador ou usuario limitado

Pode fazer:

- consultar os proprios voos, quando habilitado;
- preencher o proprio RDV operacional, se atribuido e autorizado no perfil do piloto;
- informar dificuldades de entendimento e dados faltantes.

Nao pode fazer:

- interpretar finalizacao de preenchimento como assinatura;
- tratar o RDV como Diario de Bordo oficial;
- revisar ou alterar dados de voos de outros usuarios.

Telas para testar:

- voos proprios;
- detalhe do voo;
- RDV operacional do voo atribuido.

Feedback esperado:

- clareza do texto nao regulado;
- facilidade de preenchimento;
- diferenca percebida entre uso operacional e uso oficial.

### Administrador tecnico

Pode fazer:

- liberar acesso;
- acompanhar logs, erros e comportamento do ambiente;
- retirar acesso rapidamente;
- preparar massa de dados controlada;
- consolidar feedback tecnico.

Nao pode fazer:

- ampliar o piloto sem aprovacao;
- aplicar migration fora do ambiente aprovado;
- conectar MRO, FRMS, eDB, SDRMe ou Records Core.

Telas para testar:

- fluxo completo fim a fim;
- comportamento de permissao;
- dashboard e resumo;
- erros e mensagens de falha.

Feedback esperado:

- estabilidade;
- aderencia do ambiente;
- qualidade do isolamento por tenant;
- riscos de suporte e rollback.

## 5. Dados do piloto

Categorias de dados:

- **dados demonstrativos**: validos para ensaio local e treinamento;
- **dados reais controlados**: voos reais ou historicos escolhidos para o piloto, sob supervisao operacional;
- **seed local**: base demonstrativa tecnica para reproducao do fluxo;
- **dados de voos passados**: ideais para validacao inicial do RDV sem pressao operacional;
- **dados de voos futuros**: usar apenas em shadow mode, lado a lado com o sistema oficial.

Diretrizes:

- nao misturar mock e real silenciosamente na mesma vista sem identificacao;
- usar um conjunto pequeno e rastreavel de voos para o piloto;
- priorizar voos passados para exercitar criacao, edicao e finalizacao de RDV;
- usar voos futuros apenas para observacao, planejamento e shadow operation;
- documentar a origem de cada massa usada no piloto.

Como evitar mistura silenciosa de mock e real:

- manter telas demonstrativas explicitamente marcadas como `Demo`;
- restringir o piloto as telas conectadas a API real;
- registrar no kickoff quais telas entram e quais continuam mockadas;
- bloquear qualquer narrativa de "fonte unica oficial" durante o piloto.

Como evitar uso como fonte oficial:

- repetir no treinamento e no banner de comunicacao que o modulo e uso operacional interno;
- exigir conferência no Sigvoos/APUS/papel para qualquer dado critico;
- proibir envio de capturas/exportacoes como evidencia oficial.

Como evitar divergencia perigosa com Sigvoos/APUS:

- operar em paralelo, nunca em substituicao;
- tratar discrepancia como incidente do piloto;
- registrar, classificar e revisar toda divergencia relevante no fechamento diario.

## 6. Roteiro operacional do piloto

### Roteiro base por voo

1. Selecionar um voo do conjunto controlado.
2. Abrir a lista de voos e localizar o voo por data/status.
3. Abrir o detalhe do voo e verificar identificacao, horarios e status.
4. Alterar status apenas se a politica do ambiente piloto permitir.
5. Abrir o RDV do voo.
6. Se o RDV estiver ausente, iniciar preenchimento.
7. Preencher horario de decolagem real.
8. Preencher horario de pouso real.
9. Informar horas voadas, numero de pousos, ciclos, combustivel decolagem, combustivel pouso, combustivel consumo, POB, carga, ocorrencias e divergencias.
10. Salvar rascunho.
11. Reabrir o RDV para validar persistencia dos dados.
12. Finalizar preenchimento.
13. Consultar o dashboard e verificar reflexo em indicadores.
14. Consultar resumo operacional, se habilitado.
15. Registrar inconsistencias, campos faltantes, duvidas de copy e divergencias com o sistema oficial.
16. Coletar feedback do usuario logo apos o fluxo.

### Roteiro de sessao diaria

1. Abrir a janela do piloto com lembrete de que o fluxo oficial continua vigente.
2. Executar de 3 a 5 voos controlados por perfil participante.
3. Registrar tempos, erros, retrabalho e duvidas.
4. Consolidar riscos e divergencias no fechamento do dia.
5. Decidir continuar, pausar ou encerrar o piloto.

## 7. Criterios de sucesso

O piloto sera considerado bem-sucedido se, no conjunto controlado:

- o usuario conseguir completar o fluxo principal sem suporte tecnico continuo;
- o fluxo RDV criar/editar/finalizar funcionar de ponta a ponta;
- houver percepcao de reducao de dupla digitacao ou de consolidacao operacional;
- o dashboard for entendido como util e claro para a operacao;
- os dados refletirem com consistencia o que foi lancado;
- nao houver confusao regulatoria material;
- nao houver erro cross-tenant;
- o tempo de preenchimento do RDV ficar aceitavel para o contexto operacional;
- o fluxo aderir ao processo real de OCC/piloto/gestao.

Metricas recomendadas:

- taxa de conclusao do fluxo por usuario;
- tempo medio de preenchimento do RDV;
- percentual de RDVs finalizados sem retrabalho;
- quantidade de divergencias com o sistema oficial por voo testado;
- numero de tickets de confusao sobre status regulatorio;
- numero de incidentes de permissao ou tenant.

## 8. Criterios de parada

Pausar imediatamente o piloto se ocorrer qualquer um dos eventos abaixo:

- usuario entender que o modulo substitui Diario de Bordo, eDB, SDRMe, Sigvoos ou APUS;
- qualquer erro cross-tenant;
- erro de dados criticos que comprometa a leitura de voo ou RDV;
- perda de dados lancados no piloto;
- fluxo induzir decisao operacional incorreta;
- performance inviavel para o uso combinado na sessao;
- divergencia grave com o sistema oficial sem explicacao imediata;
- qualquer copia, exportacao ou uso do modulo como evidencia oficial.

## 9. Checklist antes do piloto

- commit de referencia documentado: `c92ba4931905acded9517f53b4ec4d365c469eea`
- ambiente escolhido e aprovado
- migration aplicada somente no ambiente permitido
- dados/seed preparados e revisados
- voos controlados selecionados
- usuarios participantes definidos
- permissoes revisadas por perfil
- banners e textos nao regulados revisados
- telas `Demo` mapeadas e comunicadas
- plano de backup e rollback definido
- suporte tecnico designado para a janela
- canal de feedback preparado
- comunicacao interna pronta e aprovada

## 10. Comunicacao aos usuarios

Texto recomendado:

> O modulo Controle de Voos do AirTrust entrara em **piloto interno controlado**.
> O uso neste piloto e **operacional interno**, **nao regulado** e **nao fiscal**.
> O modulo **nao substitui** Diario de Bordo, eDB, SDRMe, Sigvoos, APUS, papel ou qualquer registro oficial.
> O objetivo do piloto e validar fluxo, clareza dos dados e aderencia operacional com um grupo restrito de usuarios.
> Durante o piloto, toda decisao e registro oficial continuam sendo feitos pelos sistemas e documentos atualmente vigentes.
> Espera-se que os participantes registrem feedback sobre usabilidade, campos faltantes, inconsistencias e qualquer risco de interpretacao indevida.

## 11. Matriz de riscos do piloto

| Risco | Classe | Probabilidade | Impacto | Mitigacao | Dono |
| --- | --- | --- | --- | --- | --- |
| Usuario interpretar o RDV como registro oficial | Regulatorio | Media | Critico | Banners, comunicacao formal, treinamento, operacao paralela obrigatoria | Gestor operacional |
| Divergencia entre AirTrust e Sigvoos/APUS | Operacional | Media | Alto | Conferencia cruzada, registrar incidente, nao usar como fonte oficial | OCC lider |
| Erro cross-tenant | Seguranca/Dados | Baixa | Critico | Acesso restrito, ambiente controlado, monitoramento de incidentes, parada imediata | Administrador tecnico |
| Dado de voo ou RDV nao persistir corretamente | Tecnico | Media | Alto | Sessao controlada, voos pequenos, checagem logo apos salvar, rollback rapido | Administrador tecnico |
| Usuario testar tela `Demo` como se fosse real | Usuario | Media | Medio | Mapear telas demonstrativas, subnav com `Demo`, briefing antes da sessao | PM/gestor do piloto |
| Performance inadequada na sessao | Tecnico | Media | Medio | Janela curta, baixa concorrencia, observacao ativa, pausar se degradar | Administrador tecnico |
| Piloto expandir escopo para MRO/FRMS/eDB | Escopo | Media | Alto | Regra formal de nao expansao, backlog separado, aprovacao executiva para qualquer fase futura | Sponsor do modulo |

## 12. Plano de rollback

Se o piloto precisar ser interrompido:

1. desativar o acesso ao modulo para o grupo piloto;
2. retirar permissao/flag dos usuarios envolvidos;
3. interromper imediatamente qualquer entrada nova de dados no Controle de Voos;
4. declarar que os dados do piloto ficam **sem valor oficial** e devem ser ignorados para fins operacionais formais;
5. preservar os dados ja lancados apenas para analise interna de produto, UX e incidentes;
6. manter Sigvoos/APUS/papel como unica referencia operacional formal;
7. registrar causa da pausa, impacto e acoes corretivas antes de qualquer retomada.

## 13. Go / No-Go

### Pronto para piloto

- ambiente candidato preparado e validado
- usuarios treinados
- escopo do piloto fechado
- telas principais conectadas funcionando
- RDV criar/editar/finalizar testado
- comunicacao interna revisada
- rollback pronto
- nenhum risco critico aberto sem mitigacao

### Pronto com ressalvas

- piloto pode iniciar, mas com limitacoes claras de usuarios, voos e janela;
- existem riscos medios conhecidos, controlados por governanca e suporte;
- a recomendacao atual do modulo se encaixa aqui.

### Nao pronto

- ambiente sem schema `cv_*` funcional;
- ambiguidade regulatoria material nas telas ou comunicacao;
- perfis sem controle;
- divergencia recorrente de dados;
- incidente de tenant ou perda de dados sem causa resolvida.

Checklist final objetivo:

- schema `cv_*` funcional no ambiente do piloto
- acesso restrito aos participantes
- briefing de nao substituicao aprovado
- voos controlados definidos
- suporte tecnico escalado
- stop criteria alinhados
- rollback comunicado

## 14. Proximos passos apos piloto

Se aprovado:

- preparar rollout limitado com janela e publico restritos;
- priorizar criacao/edicao completa de voos onde ainda houver lacunas operacionais;
- consolidar relatorios internos mais usados;
- considerar MRO e FRMS apenas depois do fluxo N1 estabilizado;
- iniciar discussao futura de eDB somente apos decisao de fonte oficial, assinatura e trilha regulatoria.

Se reprovado:

- corrigir bloqueios identificados;
- repetir piloto em ambiente controlado;
- nao avancar para producao ampla;
- manter o modulo em uso restrito ou somente demonstrativo, conforme severidade.

## 15. O que nao fazer agora

- nao iniciar eDB;
- nao iniciar SDRMe;
- nao integrar MRO;
- nao integrar FRMS;
- nao implementar assinatura;
- nao chamar ANAC dizendo que esta pronto;
- nao substituir papel, Sigvoos ou APUS;
- nao expandir escopo antes do feedback consolidado;
- nao promover o modulo a uso regulado;
- nao tratar dados do piloto como evidencia oficial.

## Recomendacao final deste documento

- Veredito recomendado para piloto: **pronto com ressalvas**
- Ambiente recomendado: **preview/staging com acesso restrito e dados controlados**
- Usuarios recomendados: **1 gestor operacional, 1 a 2 usuarios OCC/controle, 1 piloto observador ou limitado, 1 administrador tecnico**
- Abordagem recomendada: **piloto curto, paralelo ao fluxo legado, com voos controlados e parada imediata diante de qualquer risco regulatorio, cross-tenant ou divergencia critica**
