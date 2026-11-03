# AirTrust FRMS — Proposta para um sistema útil: coletar, sinalizar, decidir, agir

Data: 03/11/2026. Base: auditoria completa (arquivos 01 e 02). Este documento não repete os defeitos. Ele diz **como o FRMS deveria funcionar** para que a coleta de dados leve a ações da coordenação sobre o tripulante, e **o que simplificar ou remover**.

Os números de limiar citados aqui são **propostas iniciais de política**, a validar pelo responsável pelo FRMS/SGSO. Não são valores científicos comprovados. Onde a ciência sustenta a ideia, isso está dito; onde é escolha de política, também.

---

## 1. O princípio

Um FRMS só é útil se cada dado coletado puder mudar uma decisão. A pergunta para manter qualquer campo, número ou tela é:

> **Se este dado estiver ruim, alguém da coordenação faz algo diferente?**

Se a resposta for não, o dado sai da tela operacional, ou sai do sistema.

O ciclo que o sistema deve sustentar, todo dia, para cada tripulante escalado:

```
1. COLETAR      check-in curto antes da apresentação + relato voluntário a qualquer hora
2. SINALIZAR    regras simples e explicáveis ("dormiu 4 h", "KSS 8", "3ª madrugada seguida")
3. DECIDIR      a coordenação escolhe uma ação ANTES da apresentação
4. AGIR         ajuste de escala, repouso, troca, contato, mitigação registrada
5. VERIFICAR    no dia seguinte o sistema pergunta: a ação funcionou?
```

Hoje o AirTrust coleta bem e calcula muito, mas o passo 2 está escondido atrás de vários scores, e os passos 3 a 5 estão espalhados por três mecanismos diferentes.

---

## 2. Diagnóstico em uma página: o que hoje atrapalha

| Problema | Efeito para a coordenação |
|---|---|
| **Quatro números de "fadiga" concorrentes**: score do check-in (0–100), "efetividade" (%), score quinzenal (0–100), classificação de prontidão (PVT) | Ninguém sabe qual olhar; os números podem se contradizer no mesmo dia (ex.: sono 4 h no check-in e efetividade calculada com 8 h) |
| **Scores sem validação** que misturam fadiga com qualidade de dado (check-in faltando soma pontos de fadiga) | O número sobe por falta de dado, não por fadiga; perde credibilidade |
| **Rótulos de aptidão** ("APTO", "INAPTO", "preserved") vindos de pesos não calibrados | Falsa segurança (KSS 9 → "APTO") e risco jurídico; o software parece decidir aptidão |
| **Estimativas apresentadas como fatos** (sono padrão de 8 h "informado", KSS 5 por default) | Decisões em cima de dado inventado |
| **Três mecanismos de pendência**: alertas/casos (`frms_alerta`), eventos de ciência (`read-ack`), override | Trabalho duplicado; uma pendência pode estar "lida" num lugar e aberta no outro |
| **Dois check-ins** (legado e de voo) com regras diferentes | Manutenção dupla e respostas diferentes para a mesma pergunta |
| **Telas demais** (Operação, Casos, Fadiga acumulada, Painel de fadiga, Histórico de fadiga, Ficha, Relatórios, Conceitos, FIRA, Escalas, Configurações) | O gestor não sabe onde agir; informação útil fica a 3 cliques |
| **Ação sem dono e sem prazo automático**: o sistema exige responsável e prazo, mas não avisa quando vence nem pergunta se funcionou | Casos ficam abertos ou fechados sem verificação real |

---

## 3. O FRMS proposto em uma imagem

```
TRIPULANTE (app / Pilot App)                  COORDENAÇÃO (web)
┌──────────────────────────┐                  ┌───────────────────────────────────────────┐
│ Check-in pré-jornada     │──┐               │ HOJE  (única tela de trabalho diário)     │
│ (≤ 90 s)                 │  │  regras       │  vermelho: decidir antes da apresentação  │
│ Relato voluntário        │──┼─ simples ───► │  amarelo: acompanhar                      │
│ (a qualquer hora)        │  │  explicáveis  │  cinza: falta dado — cobrar               │
│ Feedback: "sua coordena- │◄─┘               │  → abrir pessoa → escolher ação           │
│ ção recebeu e agiu"      │                  ├───────────────────────────────────────────┤
└──────────────────────────┘                  │ AÇÕES  (casos abertos, prazos, eficácia)  │
                                              ├───────────────────────────────────────────┤
ESCALA / CONTROLE DE VOOS / SIGVOOS ─────────►│ PREVISÃO (próximos 7 dias de escala)      │
(fatos: horários, madrugadas, sequência,      ├───────────────────────────────────────────┤
 limites legais)                              │ RELATÓRIOS + CONFIGURAÇÃO                 │
                                              └───────────────────────────────────────────┘
```

Quatro áreas para a coordenação, no lugar das 11 telas atuais. O resto vira detalhe dentro delas ou sai.

---

## 4. Coleta de dados: o que perguntar ao tripulante

### 4.1 Check-in pré-jornada (obrigatório nos dias escalados; meta ≤ 90 segundos)

| # | Pergunta | Formato | Por que existe (que decisão muda) |
|---|---|---|---|
| 1 | Quantas horas você **dormiu** nas últimas 24 h? | número (0–14, passos de 0,5) | Sono curto é o sinal individual mais acionável; gera ajuste de horário ou troca |
| 2 | Quantas horas dormiu na **noite anterior** a essa? | número | Permite ver débito de duas noites sem pedir diário de sono |
| 3 | A que horas você **acordou** hoje? | hora | Com a apresentação e o término previsto, calcula quantas horas acordado ele estará no fim da jornada |
| 4 | **Como você se sente agora?** (KSS 1–9, com as frases) | 9 botões, obrigatório | Sonolência no momento; escala validada |
| 5 | Você se considera **em condições** para esta jornada? | Sim / Não / Tenho dúvida | Autodeclaração é o gatilho mais forte; "Não" ou "dúvida" exigem contato |
| 6 | Algo que a coordenação precisa saber? (opcional) | texto curto | Contexto que nenhum número traz (filho doente, hotel ruidoso) |

**Sai do check-in diário:**
- qualidade do sono (1–5): baixa utilidade decisória e muito subjetiva;
- fadiga subjetiva 0–10 enviada como "sonolência": duplicava o KSS;
- lista de sintomas;
- campo "oportunidade de sono" (pode ser derivado da escala);
- a nota 0–100 e o rótulo APTO/INAPTO devolvidos ao tripulante.

**Álcool/medicação em 12 h:** recomendo **não** manter no check-in diário. Já existe regra própria (RBAC 91/120 e política da empresa), e perguntar todo dia gera respostas automáticas "não". Se a empresa quiser manter, que seja um "Sim" que gera contato obrigatório, e não pontos num score.

**PVT:**
- **Opção A (recomendada):** opcional, oferecido quando o KSS for ≥ 7 ou o sono < 6 h. Usar o protocolo validado (PVT-B de 3 min, lapso > 355 ms).
- **Opção B:** remover até haver protocolo validado.

Hoje o teste de 60 s acrescenta tempo, não segue o protocolo validado e quase nunca muda a classificação.

**Regras de coleta:**
- **Prazo:** até a hora de apresentação. Check-in feito depois da apresentação fica marcado como "pós-apresentação" e não vale como avaliação pré-voo.
- **Imutabilidade:** a primeira resposta é imutável. Correções criam nova versão, com horário e motivo.
- **Sem padrão inventado:** campo não respondido fica "não informado", nunca vira número.
- **Offline:** o Pilot App guarda o check-in e envia quando houver rede, mantendo o horário real de resposta.

### 4.2 Relato voluntário de fadiga (a qualquer hora)

Um botão permanente: **"Estou cansado / quero relatar fadiga"**, com 3 campos: KSS, o que aconteceu (texto), se precisa de ação agora (sim/não).

É o canal reativo e proativo que o ICAO Doc 9966 trata como central num FRMS, e hoje ele não existe como fluxo separado. Cria uma pendência para a coordenação automaticamente.

**Cultura justa:** o relato voluntário nunca gera consequência disciplinar por si só. O sistema mostra ao tripulante "Sua coordenação recebeu em HH:MM" e, depois, a ação tomada. Sem esse retorno, os relatos param de chegar.

### 4.3 Pós-jornada (opcional, 1 pergunta)

"Como você terminou a jornada?" (KSS). Serve para verificar se a mitigação funcionou e para aprender quais sequências de escala cansam mais. Só deve existir se a coordenação for usar o dado no relatório mensal. Caso contrário, não coletar.

### 4.4 Dados que vêm da operação (sem perguntar ao tripulante)

Da escala, do Controle de Voos e do SIGVOOS, só os **fatos**:
- horário de apresentação e término (previsto e real);
- número de pousos;
- se a jornada toca a madrugada (00:00–06:00);
- dia da missão (1 a 15);
- repouso desde a última jornada;
- horas acumuladas para os limites legais.

Cada fato carrega a origem e se é **previsto, realizado ou não recebido**. Dia sem dado importado aparece como "dado não recebido", nunca como zero.

---

## 5. Sinalizar: regras simples no lugar dos scores

Proposta: **substituir os quatro scores por uma lista de sinais**. Cada sinal é uma frase que o gestor entende sem manual e leva a uma ação.

Três níveis:
- 🔴 **Decidir antes da apresentação:** exige ação registrada.
- 🟡 **Acompanhar:** ação opcional, registrada se houver.
- ⚪ **Falta dado:** cobrar o dado. Não é risco nem normalidade.

### 5.1 Sinais do tripulante (vêm do check-in e do relato)

| Sinal | Nível proposto | Texto mostrado ao gestor | Base |
|---|---|---|---|
| Declarou não estar em condições | 🔴 | "Declarou não estar em condições para a jornada" | autodeclaração — sempre respeitar |
| Declarou dúvida | 🔴 | "Tem dúvida sobre condições — contatar" | idem |
| Relato voluntário de fadiga com "preciso de ação agora" | 🔴 | "Relatou fadiga às HH:MM e pediu ação" | canal reativo |
| KSS 8–9 | 🔴 | "Sonolência alta (KSS 8/9): luta para ficar acordado" | escala validada; ponto de corte é política |
| KSS 7 | 🟡 | "Sonolento (KSS 7)" | idem |
| Sono < 5 h nas últimas 24 h | 🔴 | "Dormiu 4,5 h" | restrição aguda de sono é o fator mais estudado; corte é política |
| Sono 5–6 h nas últimas 24 h | 🟡 | "Dormiu 5,5 h" | idem |
| Duas noites seguidas < 6 h | 🔴 | "Duas noites curtas seguidas (5 h e 5,5 h)" | perda de sono se acumula entre noites (literatura de restrição crônica) |
| Estará acordado > 16 h no fim da jornada (despertar real + término previsto) | 🔴 (> 18 h) / 🟡 (16–18 h) | "Acordado desde 04:10 — terá 17 h acordado ao pouso previsto" | vigília prolongada é central no modelo de dois processos; corte é política |
| Check-in não feito até 60 min antes da apresentação | ⚪ → 🔴 na hora da apresentação | "Check-in pendente (apresentação 06:00)" | sem dado não há como decidir |
| PVT com lapsos elevados (se o PVT for mantido) | 🟡 | "Teste de atenção com muitos lapsos" | só com protocolo validado |

### 5.2 Sinais da escala (preditivos: aparecem dias antes)

| Sinal | Nível | Texto | Base |
|---|---|---|---|
| 3ª madrugada seguida ou 5ª em 168 h | 🔴 | "3ª apresentação antes das 06:00 seguida (Lei 13.475 art. 42 / RBAC 117 A117.15(m))" | legal |
| 2ª madrugada seguida | 🟡 | "2ª madrugada seguida — próxima não pode" | legal (antecipação) |
| Repouso desde a última jornada abaixo do mínimo legal | 🔴 | "Repouso de 10 h; mínimo 12 h" | legal |
| Limite legal mensal/anual a menos de 10 % | 🟡 | "Faltam 6 h para 90 h de voo no mês" | legal (antecipação) |
| Limite legal ultrapassado | 🔴 | "Ultrapassou 90 h no mês (Lei 13.475 art. 33)" | legal |
| Primeiro dia após viagem de deslocamento com apresentação cedo | 🟡 | "Chegou ontem 23:00 e apresenta 05:30" | sono fora de casa + pouca oportunidade |
| Mudança de escala com < 12 h de antecedência | 🟡 | "Escala alterada às 20:00 para apresentação 05:30" | ACT cl. 9ª §8º e 10ª permitem, mas reduz oportunidade de sono |

Sinais da escala são calculados **para os próximos 7 dias**, na tela "Previsão". É aí que o FRMS acrescenta algo que a escala sozinha não mostra: o gestor vê o problema antes de ele acontecer e ajusta a escala.

### 5.3 O que fazer com os scores existentes

| Score atual | Proposta |
|---|---|
| Score do check-in 0–100 + APTO/INAPTO | **Remover** da operação. Os sinais da seção 5.1 substituem com regras explícitas |
| "Efetividade" % | **Remover da tela operacional.** Manter só como dado de pesquisa até ser validado. Se ficar visível, renomear para "Índice de exposição (regras AirTrust, não validado)" |
| Score quinzenal 0–100 | **Substituir** por um "Resumo da missão" com fatos (ver seção 7.3) |
| Classificação de prontidão (PVT) | Vira só o sinal 🟡 de lapsos, se o PVT for mantido |
| IMA v3 | Manter fora da tela, só pesquisa (como já está) |

Por que regras e não scores: com os dados que o AirTrust tem, nenhum score pode ser validado agora. Regras explícitas dizem **por quê** ("dormiu 4 h"). Isso é o que o gestor precisa para decidir e para explicar a decisão ao tripulante e ao auditor. Quando houver dados suficientes (ver seção 10), dá para testar se um score agrega algo.

---

## 6. Decidir e agir: o fluxo único de ação

### 6.1 Uma fila só

Unificar alertas/casos, eventos de ciência (read-ack) e override numa única entidade: **Ação FRMS**.

```
Sinal 🔴 surge
  → Ação FRMS criada automaticamente (uma por tripulante por dia; sinais novos entram na mesma ação)
  → status: PENDENTE → EM ANDAMENTO → CONCLUÍDA → VERIFICADA
  → prazo automático: hora da apresentação (sinais do dia) ou data da jornada (sinais da escala)
```

- Sinal 🟡 não cria ação obrigatória. O gestor pode criar uma com 1 clique.
- Sinal ⚪ cria uma tarefa "cobrar dado", que some quando o dado chega.

### 6.2 Catálogo de ações (botões, não texto livre)

| Ação | Quando faz sentido | O sistema registra |
|---|---|---|
| **Contatei o tripulante — segue a jornada** | KSS 7, sono 5–6 h, dúvida resolvida | quem, quando, resumo da conversa |
| **Adiar apresentação / reduzir jornada** | sono curto, vigília longa prevista | novo horário (integra com a escala) |
| **Trocar tripulante** | declarou não estar em condições, KSS 8–9 com sono curto | substituto (integra com a escala) |
| **Repouso adicional / folga** | duas noites curtas, sequência de madrugadas | período |
| **Ajustar escala futura** | sinal preditivo | o que mudou |
| **Mitigação em voo** | quando a troca não é possível: tripulação reforçada, rota mais curta, pausa | qual mitigação |
| **Seguir sem alteração — justificar** | gestor discorda do sinal | justificativa obrigatória (fica auditável) |
| **Encaminhar ao SGSO** | padrão recorrente, relato com impacto operacional | cria relato no SGSO sem dados de saúde |

Regras:
- Toda ação 🔴 precisa de uma dessas escolhas **antes da apresentação**.
- Se o prazo vencer sem escolha, o sistema avisa o gestor de plantão e marca "decisão não registrada".

### 6.3 Verificar se funcionou (passo que hoje falta)

No check-in seguinte do mesmo tripulante, o sistema compara automaticamente:
- "Ação de 03/11: adiou apresentação. Hoje dormiu 7 h e KSS 4 → **sinal resolvido**";
- ou "Hoje dormiu 4 h de novo → **sinal reincidente**", que reabre a ação.

Assim a verificação de eficácia deixa de ser um campo de texto e vira fato medido.

---

## 7. As telas da coordenação

### 7.1 HOJE (tela inicial)

Uma linha por tripulante escalado hoje, ordenada por urgência (🔴, depois ⚪, depois 🟡, por fim os sem sinal):

| Tripulante | Apresentação | Sinais | Ação | Prazo |
|---|---|---|---|---|
| Cmte. Silva | 05:30 | 🔴 Dormiu 4 h · 🔴 3ª madrugada seguida | — | 05:30 (em 2 h) |
| Cop. Lima | 06:00 | ⚪ Check-in pendente | Cobrado 04:40 | 06:00 |
| Cmte. Souza | 07:00 | 🟡 KSS 7 | Contatado — segue | ✓ |
| Cop. Reis | 07:00 | — | — | — |

Clique na linha abre o detalhe:
- **Sinais com a frase e a origem:** "Dormiu 4 h (informado no check-in às 04:12)".
- **Últimos 7 dias** em linha do tempo: jornadas, madrugadas, sono informado, KSS.
- **Conformidade legal** em uma linha: "Dentro dos limites" ou o limite violado.
- **Botões de ação** (seção 6.2).

Sem gráficos nesta tela. Sem percentuais.

### 7.2 PREVISÃO (próximos 7 dias)

Grade tripulante × dia com os sinais da escala (seção 5.2). Serve ao planejador de escala. Clicar num sinal mostra a regra e sugere a alteração ("mover apresentação de 05:30 para 06:30 elimina a 3ª madrugada").

### 7.3 MISSÃO (dentro do detalhe do tripulante, para a escala 15×15)

Resumo dos fatos da missão atual, sem score:
- dia da missão (ex.: 9 de 15);
- jornadas, madrugadas e apresentações antes das 06:00 / 07:00;
- menor repouso;
- noites com menos de 6 h informadas e média de sono informado;
- KSS máximo;
- check-ins feitos / esperados.

Tendência simples: sono médio dos primeiros dias contra os últimos.

### 7.4 AÇÕES

- **Filas:** ações abertas, vencidas e reincidentes.
- **Filtros:** por base, aeronave e responsável.
- **Lista "verificar eficácia":** ações que ainda não foram verificadas.

### 7.5 RELATÓRIOS (mensal, para gestão e auditoria)

Ver seção 9. Substitui o mapa de fadiga e os gráficos de score.

### 7.6 CONFIGURAÇÃO

- **Limiares dos sinais:** versionados, com quem alterou, quando e por quê.
- **Perfil regulatório:** inclui o art. 42.
- **Integrações.**
- **Quem é gestor de quem:** setores.

---

## 8. Manter, simplificar, consolidar, remover

| Funcionalidade atual | Decisão | Motivo |
|---|---|---|
| Motor de conformidade legal (Lei 13.475, RBAC 117, ACT) | **MANTER** | Correto e fail-closed. Aparece como uma linha no detalhe e como sinais na Previsão |
| Cálculo legal de trabalho (reserva, sobreaviso, treinamento) | **MANTER** | Correto e útil para os limites |
| Folga pós-missão do ACT | **MANTER** | Útil para a Previsão |
| Snapshot operacional diário | **SIMPLIFICAR** | Vira a fonte da tela HOJE. Retirar campos de score; manter fatos, sinais e origem |
| Check-in legado + check-in de voo | **CONSOLIDAR** em um, com o formulário da seção 4.1 | Duas regras para a mesma pergunta |
| Score do check-in (0–100, APTO/INAPTO) | **REMOVER** | Não validado; gera falsa segurança e rótulo de aptidão |
| "Efetividade" % | **REMOVER da operação** (manter em pesquisa) | Não validado; contradiz o sono informado |
| Score quinzenal | **SUBSTITUIR** pelo resumo da missão (7.3) | Mistura qualidade de dado com fadiga |
| Créditos de recuperação e de horas de voo | **REMOVER** | Sem base; complicam a explicação |
| Carga operacional (pousos, temperatura, IMC) | **SIMPLIFICAR**: mostrar como fatos ("12 pousos, 2 em IMC"), sem pontos | Fato útil, ponto inventado |
| PVT de 60 s | **SUBSTITUIR** pelo PVT-B de 3 min opcional, ou **REMOVER** | Não segue protocolo validado; quase nunca muda a decisão |
| Alertas/casos + read-ack + override | **CONSOLIDAR** em "Ação FRMS" | Três filas para a mesma coisa |
| Fluxo de caso (responsável, prazo, eficácia) | **MANTER** a regra, **SIMPLIFICAR** a interface (botões da seção 6.2) | A regra é boa; o texto livre não escala |
| Telas Painel de fadiga, Histórico de fadiga, Fadiga acumulada | **CONSOLIDAR** no detalhe do tripulante e nos Relatórios | Informação repetida |
| Mapa de fadiga / heatmap | **REMOVER** (ou só no relatório mensal, com fatos) | Pinta score não validado; dá falsa sensação de controle |
| Importação FIRA | **MANTER só se** ainda for fonte necessária de jornada; senão **REMOVER** | Se o CV/SIGVOOS já cobre, FIRA é redundante (decisão da operação) |
| IMA v3 (pesquisa) | **MANTER fora da interface** | Bem isolado; útil para validar no futuro |
| Explicação do dia, "comparar dias", "simular cenário" | **SIMPLIFICAR**: a explicação vira a lista de sinais com origem; simular cenário fica na Previsão | Hoje explicam scores que serão removidos |
| Página "Conceitos/Metodologia" | **MANTER curta**: o que é cada sinal e cada ação | Treinamento |
| Notificações por cargo | **MANTER**, ligadas a ações 🔴 e prazos | — |

---

## 9. Como saber se o FRMS está funcionando (indicadores de gestão)

Relatório mensal com **indicadores de processo e de resultado**, não com scores.

**Coleta**
- % de jornadas com check-in feito antes da apresentação (meta proposta: ≥ 95 %)
- % de dias com dado operacional recebido (SIGVOOS/CV)
- relatos voluntários por mês (queda brusca costuma indicar perda de confiança, não melhora)

**Decisão e ação**
- % de sinais 🔴 com ação registrada antes da apresentação (meta proposta: 100 %)
- tempo mediano entre o sinal e a decisão
- ações por tipo: contato, adiamento, troca, repouso, seguir com justificativa
- % de "seguir sem alteração" (se for alto, ou os sinais estão mal calibrados ou há pressão operacional; os dois casos pedem revisão)

**Resultado**
- reincidência: tripulantes com o mesmo sinal 🔴 em ≥ 3 dias no mês
- sono médio informado por dia da missão (dia 1 a 15) e por horário de apresentação
- % de jornadas com apresentação antes das 06:00, por base e por tripulante
- eventos de segurança com fadiga como fator contribuinte (vindo do SGSO)

**Calibração dos sinais**
- para cada sinal: quantas vezes disparou, quantas o gestor agiu, quantas viraram reincidência. Sinal que dispara muito e nunca gera ação é candidato a ajuste ou remoção.

---

## 10. Qualidade dos dados: regras que valem para todo o sistema

1. **Nenhum número inventado.** Campo não informado fica "não informado" (sem 8 h padrão, sem KSS 5 padrão).
2. **Toda informação mostra a origem:** informado pelo tripulante (hora), escala prevista, voo realizado (CV/SIGVOOS), não recebido.
3. **Falta de dado é pendência (⚪), nunca risco e nunca normalidade.**
4. **Dia sem importação do SIGVOOS aparece como "dado não recebido"** e impede afirmar conformidade.
5. **Autorrelato é imutável;** correções são versionadas.
6. **Os limiares dos sinais são versionados.** O relatório mostra com qual versão cada sinal foi gerado.

Com essas regras, em 3 a 6 meses a empresa terá uma base limpa para testar, com dados próprios, se algum score prevê sono curto, KSS alto ou eventos. Esse é o caminho correto para validar (ou abandonar) um índice, como propõe a #1476.

---

## 11. Privacidade e cultura justa

- **Quem vê o quê:**
  - o tripulante vê os próprios dados;
  - o gestor vê os tripulantes do seu setor;
  - os relatórios agregados não identificam pessoas, salvo para quem tem gestão direta.

  Essa política já está corrigida na PR #1922 para os dados individuais.
- **O texto livre** do check-in e do relato só é visível para a coordenação responsável.
- **Encaminhamento ao SGSO** sem dados de sono/saúde: só o perigo e o contexto operacional.
- **Política escrita, exibida no app:** dado de fadiga não é usado para punição. A ação registrada é sobre a escala e a operação, não sobre a pessoa.
- **Retorno ao tripulante** sobre o que foi feito com o relato. É o que mantém a coleta viva.

---

## 12. Plano de implantação em fases

| Fase | Entrega | Usa achados | Dependências |
|---|---|---|---|
| **1 — Dados verdadeiros** (curto prazo) | Corrigir FAD-001 a 006; sem padrões inventados; KSS obrigatório; check-in com prazo e imutável; origem visível | FAD-001–006, FAD-012 | nenhuma |
| **2 — Sinais e tela HOJE** | Lista de sinais (5.1) no lugar dos scores na tela operacional; tela HOJE; retirar APTO/INAPTO | FAD-004, FAD-011, AUD-022/023/024 | aprovação dos limiares pela Coordenação/SGSO |
| **3 — Ação única** | "Ação FRMS" unificando casos, read-ack e override; botões de ação; prazo na apresentação; aviso de vencimento | AUD-019/020/021 | definição do catálogo de ações |
| **4 — Previsão** | Sinais da escala nos próximos 7 dias (madrugadas, repouso, limites, viagem + apresentação cedo) | AUD-001, art. 42, AUD-005/025 | AUD-025 (dados SIGVOOS completos) |
| **5 — Verificação e relatório** | Verificação automática de eficácia no check-in seguinte; relatório mensal (seção 9) | AUD-021 | fases 1–3 |
| **6 — Consolidação** | Um check-in só; remover telas e scores substituídos; PVT-B opcional ou removido | AUD-028/029, FAD-007/008 | fases 1–5 em uso |
| **7 — Validação** | Com 3–6 meses de dados limpos, testar se algum índice agrega ao conjunto de sinais | #1476 | dados das fases 1–5 |

---

## 13. Decisões que a empresa precisa tomar para começar

1. **Aprovar o formulário de check-in** da seção 4.1: o que entra e o que sai, inclusive álcool/medicação e PVT.
2. **Aprovar os sinais e os limiares iniciais** da seção 5, como política versionada.
3. **Aprovar o catálogo de ações** da seção 6.2 e quem pode escolher cada uma (coordenador de base, gestor de operações).
4. **Definir o gestor de plantão** que recebe ações 🔴 vencidas.
5. **Decidir o destino da importação FIRA:** manter ou remover.
6. **Publicar a política de uso não punitivo** dos dados de fadiga.
7. **Parecer jurídico sobre o art. 42** (madrugadas) para transformar o sinal preditivo em bloqueio.

---

## 14. Para quem vai implementar (Codex ou equipe)

- **Ordem:** começar pela **fase 1** usando a seção 1b do arquivo `02_FRMS_PLANO_CORRECOES_CODEX_20261103.md`. Sem dados verdadeiros, sinais e ações não adiantam.
- **Reaproveitamento:** a lista de sinais pode ser construída sobre o snapshot operacional existente (`lib/frms/operational-snapshot.ts`), que já reúne check-in, jornada, escala e conformidade legal por tripulante/dia. É trocar scores por sinais, não reescrever o módulo.
- **Ação FRMS:** pode partir da tabela `frms_alerta` e do fluxo de `frms-cases.ts`, que já exigem responsável, prazo e eficácia. Migrar read-ack e override para ela.
- **Governança:** manter as regras do repositório — oito gates, Schema V2 para mudanças de banco, nada em produção sem autorização do SHA/escopo.
