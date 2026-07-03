# Costa do Sol / AirTrust - Matriz V4.1 Saneamento 20260703

Status do documento: camada de saneamento documental sobre a V4 (`docs/analysis/COSTA_DO_SOL_MATRIZ_V4_PEDAGOGICA_20260703.md`), produzida a partir de revisao critica independente (segunda opiniao). Nao houve implementacao, DML, migration, deploy, PR nem toque em producao ou em qualquer arquivo funcional do repositorio. Este documento nao refaz a matriz inteira — a V4 continua sendo a matriz-base; a V4.1 e uma camada de correcao sobre ela.

## 1. Veredito

**GO com ressalvas para usar a V4 como base pedagogica. NO-GO para implementacao no AirTrust ainda.**

A V4 corrigiu a falha pedagogica central da V3 (inicio das aeronaves com emergencia pesada) e estabeleceu a progressao normal -> IFR basico -> anormalidades simples -> OEI -> sistemas -> autorrotacao -> fogo/emergencia -> offshore -> LOFT -> LOFT Check. Essa progressao permanece valida e nao e alterada aqui.

O que faltava era saneamento, nao outra matriz: alguns dos codigos novos propostos pela V4 (secao 9 da V4) ocupam uma das 18 linhas tecnicas com conteudo que nao e manobra/procedimento tecnico observavel — sao comunicacao generica, briefing generico, debrief, "filosofia" de uso de QRH, entre outros. Esse tipo de conteudo pertence a NOTECHS, a observacao/instrucao da sessao ou ao criterio de avaliacao — nao a uma das 18 tecnicas.

## 2. Regra V4.1

As 18 linhas de cada ficha devem ser **manobras/procedimentos tecnicos observaveis**.

Nao devem ocupar linha tecnica, salvo quando forem procedimento operacional claramente avaliavel: briefing generico; comunicacao generica; debrief; registro; "filosofia"; reforco (quando e mera repeticao do mesmo conceito sem variacao tecnica); encerramento generico; plano de melhoria; coordenacao generica; consciencia situacional; workload; julgamento.

Esse conteudo entra em: NOTECHS; observacao da sessao; briefing/instrucao da sessao; criterio de avaliacao; FAP/NTS, quando aplicavel.

## 3. Itens que saem das 18 tecnicas

### 3.1 S76/SK76

| codigo (V4) | acao V4.1 | motivo |
|---|---|---|
| `S76-COM-01` | Remover das 18 em todas as sessoes onde aparece | "Comunicacoes e fraseologia" generico e NOTECHS/observacao, nao manobra tecnica |
| `S76-BRF-01` | Remover das 18; manter como briefing obrigatorio da sessao (fora da contagem tecnica) | Briefing generico nao deve ocupar item tecnico |
| `S76-SEG-01` | Remover das 18; substituir por item tecnico pre-voo (ver 4.1) | "Seguranca em solo" generica e amplo demais para ser tecnica observavel |
| `S76-SCN-01` | Manter apenas em contexto IFR, renomeado para escopo tecnico especifico; remover da Sessao 01 | Na Sessao 01 arrisca virar "consciencia situacional" (NOTECHS); em IFR e varredura instrumental tecnica valida |
| `S76-ORI-01` | Fundir com `S76-CGI-00` (ou renomear para procedimento tecnico especifico) | Sozinho, "orientacao e correcao de rumo" e generico demais |

### 3.2 AW139

| codigo (V4) | acao V4.1 | motivo |
|---|---|---|
| `A139-COM-01` | Remover das 18 em todas as sessoes onde aparece | Comunicacao generica e NOTECHS/observacao |
| `A139-BRF-01` | Remover das 18; manter como briefing da sessao (fora da contagem tecnica) | Briefing nao e manobra tecnica |
| `A139-DBR-01` | Remover das 18 (Sessao 01) | Debrief nunca deve ocupar tecnica |
| `A139-QRH-01` | Renomear para item observavel (ver 4) | "Filosofia de uso" nao e manobra |
| `A139-CAS-01` | Renomear para item observavel (ver 4) | So vale como tecnica se for leitura/priorizacao/reconhecimento objetivo, nao "familiarizacao" generica |
| `A139-AFB-01` | Renomear para `A139-AFC-01`, escopo restrito a operacao especifica de modos | "AFCS basico" generico e amplo demais |

## 4. Renomeacoes

### 4.1 S76/SK76

| codigo | nome V4 | nome V4.1 |
|---|---|---|
| `S76-CKL-01` | Checklist Normal - Disciplina de Uso | Execucao do Checklist Normal por Fase de Voo |
| `S76-SCN-01` | Varredura de Instrumentos Basicos | Varredura Instrumental Primaria e Secundaria em IFR Basico (restrito a Sessao 03; sai da Sessao 01) |
| `S76-SEG-01` | Procedimentos de Seguranca em Solo (briefing pre-voo) | substituido por `S76-PWR-01` (ver secao 5) — deixa de existir como item de briefing |
| `S76-ORI-01` | Orientacao e Correcao de Rumo por Instrumentos | fundido em `S76-CGI-00` (Controle Geral IFR); ou, se instrutor preferir manter separado, renomear para "Intercepcao e Manutencao de Curso IFR Basico" |

### 4.2 AW139

| codigo | nome V4 | nome V4.1 |
|---|---|---|
| `A139-CAS-01` | CAS Basico (leitura e familiarizacao, sem pane) | Leitura, Priorizacao e Reconhecimento Basico de CAS (sem pane simulada) |
| `A139-QRH-01` | QRH - Localizacao e Filosofia de Uso (sem emergencia) | Localizacao Guiada de Procedimento no QRH (sem execucao de emergencia) |
| `A139-AFB-01` | AFCS Basico (modos normais) | `A139-AFC-01` — Engajamento, Monitoramento e Desconexao Normal dos Modos Basicos do AFCS |

## 5. Substituicoes por sessao (itens que saem da contagem das 18 e o que entra no lugar)

Regra geral: cada remocao de item generico (COM/BRF/SEG/DBR) abre uma vaga na sessao, preenchida por um item tecnico novo (`NOVA_MANOBRA_NECESSARIA`) ou por consolidacao de um item ja existente na propria sessao. Sessoes nao listadas abaixo (04 a 10, ambas as aeronaves) tinham `S76-COM-01`/`S76-BRF-01`/`A139-COM-01`/`A139-BRF-01` apenas como reforco tardio — nessas sessoes a vaga aberta e preenchida por reforco adicional de um item tecnico ja tratado na propria sessao (por exemplo, uma segunda repeticao do item de falha central daquela sessao), sem necessidade de codigo novo.

### 5.1 S76/SK76 Sessao 01/12

Remover da contagem: `S76-COM-01`, `S76-BRF-01`, `S76-SEG-01` (3 vagas).

| codigo novo | nome | fap_refs |
|---|---|---|
| `S76-PWR-01` | Controle de Potencia, Torque e Limites em Voo Normal | FAP05.2 H4.1 |
| `S76-PED-01` | Controle de Pedal e Anti-Torque em Hover | FAP05.2 H2.3 |
| `S76-HVT-01` | Transicao Hover-Decolagem e Decolagem-Subida | FAP05.2 H4.2 |

### 5.2 S76/SK76 Sessao 02/12

Remover da contagem: `S76-COM-01` (reforco), `S76-BRF-01` (reforco) (2 vagas).

| codigo novo | nome | fap_refs |
|---|---|---|
| `S76-STB-01` | Aproximacao Estabilizada Visual com Correcao de Rampa e Velocidade | FAP05.2 H4.3 |
| `S76-GAR-01` | Arremetida por Aproximacao Instavel em VMC | - |

### 5.3 S76/SK76 Sessao 03/12

Revisar: `S76-COM-01` (sai), `S76-BRF-01` (sai), `S76-SCN-01` (mantido, renomeado, ja estava correto para esta sessao), `S76-ORI-01` (fundido com `S76-CGI-00`, libera 1 vaga adicional).

Vagas abertas (3: COM-01, BRF-01, ORI-01 fundido): preencher com reforco de itens ja tecnicos da propria sessao (`76-APXPR`, `76-APXNP`, `S76-HLD-00`) em vez de codigo novo — a sessao ja tem pool suficiente de itens IFR tecnicos legitimos.

### 5.4 AW139 Sessao 01/12

Remover da contagem: `A139-COM-01`, `A139-BRF-01`, `A139-DBR-01` (3 vagas). `A139-CAS-01`, `A139-QRH-01`, `A139-AFB-01` permanecem, renomeados (secao 4.2).

| codigo novo | nome | fap_refs |
|---|---|---|
| `A139-PWR-01` | Controle Normal de Potencia e Parametros em Voo Visual | FAP05.2 H4.1 |
| `A139-FMA-01` | Monitoramento Basico de FMA/Modos em Condicao Normal | - |
| `A139-STB-01` | Aproximacao Visual Estabilizada e Criterios de Arremetida Normal | FAP05.2 H4.3 |

### 5.5 AW139 Sessao 02/12

Remover da contagem: `A139-COM-01` (reforco), `A139-BRF-01` (reforco), `A139-QRH-01` (reforco), `A139-CAS-01` (reforco) (4 vagas).

| codigo novo | nome | fap_refs |
|---|---|---|
| `A139-MOD-01` | Selecao e Transicao de Modos AFCS em Perfil Visual Normal | - |
| `A139-FMA-02` | Monitoramento de FMA durante Mudanca de Modo | - |
| `A139-HLD-01` | Holding/Espera Visual ou Vetoracao Basica (se aplicavel) | FAP06 CIR.7 |
| `A139-STB-02` | Correcao de Perfil em Aproximacao Visual Estabilizada | FAP05.2 H4.3 |

### 5.6 Demais sessoes (04-10, ambas as aeronaves)

`S76-COM-01`/`S76-BRF-01`/`A139-COM-01`/`A139-BRF-01` saem da contagem das 18 em toda ocorrencia de reforco tardio. A vaga aberta em cada sessao e preenchida por reforco adicional do item tecnico central daquela sessao (ja presente na propria tabela da V4), sem necessidade de codigo novo — por exemplo, na Sessao 05 (S76 e AW139) a vaga extra vira reforco de `76-MOTCZ`/`WAR-OUT-15`; na Sessao 09, reforco de `76-INCMO`/`WAR-FIR-21`; e assim por diante. Isso preserva a contagem de 18 tecnicas sem inflar o catalogo de codigos novos além do necessário.

## 6. LOFT (Sessao 11) vs LOFT Check (Sessao 12) — diferenca explicita

A V4 preservou o conteudo de LOFT e LOFT Check identico entre si (mesma composicao de 18 itens), o que e coerente com "check final cobre o que foi treinado", mas a V4.1 exige que a natureza pedagogica de cada sessao fique explicita no documento e, futuramente, na ficha.

**Sessao 11 — LOFT.** Natureza: treinamento de cenario. Pode conter orientacao do instrutor, pausa pedagogica, repeticao parcial, cenario narrativo, integracao normal + anormal + retorno/alternado, treino de QRH/ECL, treino de FAP sem carater de cheque.

**Sessao 12 — LOFT Check.** Natureza: avaliacao final. Deve conter cenario integrado, sem ensinar conteudo novo, sem pausa pedagogica (salvo por seguranca), cobertura de FAP 05.2/06/14, criterios de proficiencia, julgamento tecnico final, com NOTECHS como evidencia comportamental separada (fora das 18).

Ajuste obrigatorio para a proxima revisao da matriz (V5 ou diretamente na implementacao): cada sessao 12 (LOFT Check) deve carregar um marcador explicito de carater avaliativo, por exemplo:

```text
carater = avaliativo
fonte = FAP 05.2 / FAP 06 / FAP 14 / PTO
sem conteudo novo = sim
```

Este marcador nao existe hoje nem na V3 nem na V4; fica registrado aqui como requisito para a proxima revisao de estrutura, sem alterar a V4 agora.

## 7. Periodicos — confirmacao

Nenhuma mudanca adicional aos periodicos alem do que a V4 ja aplicou.

**S76/SK76 periodico**: estrutura 3 ciclos x 3 sessoes mantida. A correcao `S76-LOFT-15` ("Aplicacao do QRH" -> "Aplicacao do ECL") ja foi aplicada na V4 (secao 6 da V4) e permanece valida. Qualquer outra ocorrencia de "QRH" em contexto S76 deve virar "ECL/checklist de emergencia", salvo validacao contraria do instrutor/owner.

**AW139 periodico**: recomendacao de 4 sessoes/ciclo (VFR/emergencias; IFR/noturno/offshore; LOFT/Offshore; LOFT/Check) confirmada e mantida — concordancia expressa desta revisao de que a complexidade de QRH/CAS/AFCS/CAT A-B/offshore da AW139 fica comprimida demais em 3 sessoes.

## 8. Contagem corrigida de codigos novos

Regra de decisao aplicada:

| tipo de codigo novo | decisao |
|---|---|
| normal tecnico sem equivalente no catalogo | mantem como `NOVA_MANOBRA_NECESSARIA` |
| COM/BRF/DBR generico | nao criar como manobra — vira NOTECHS/observacao/briefing de sessao |
| checklist por fase de voo | mantem, e observavel |
| CAS/QRH de familiarizacao | mantem so se renomeado para escopo observavel (secao 4) |
| reforco repetido do mesmo conceito | nao criar codigo novo — reaproveitar o codigo ja existente na sessao ou tratar como observacao |
| conteudo instrucional (briefing, filosofia, debrief) | nao criar como manobra |

Efeito sobre a contagem da V4 (secao 9 da V4, "manobras novas necessarias"):

| aeronave | codigos novos V4 | removidos (COM/BRF/SEG/DBR) | renomeados (mantidos como tecnica) | adicionados (substituicao tecnica) | codigos novos liquidos V4.1 |
|---|---:|---:|---:|---:|---:|
| S76/SK76 | 36 (contando reaproveitamento de `CKL-01..07` em multiplas sessoes como linhas distintas na V4) | `S76-COM-01`, `S76-BRF-01`, `S76-SEG-01` (3 codigos-conceito) | `S76-SCN-01`, `S76-ORI-01` (fundido) | `S76-PWR-01`, `S76-PED-01`, `S76-HVT-01`, `S76-STB-01`, `S76-GAR-01` (5) | 38 |
| AW139 | 32 | `A139-COM-01`, `A139-BRF-01`, `A139-DBR-01` (3 codigos-conceito) | `A139-CAS-01`, `A139-QRH-01`, `A139-AFB-01` -> `A139-AFC-01` (renomeados, nao removidos) | `A139-PWR-01`, `A139-FMA-01`, `A139-STB-01`, `A139-MOD-01`, `A139-FMA-02`, `A139-HLD-01`, `A139-STB-02` (7) | 36 |

Nota: a contagem "liquida" acima soma os codigos que permanecem no catalogo proposto apos remover os genericos e adicionar as substituicoes tecnicas; nao reflete quantas vezes cada codigo se repete como reforco entre sessoes (isso continua variavel, ja documentado na V4).

## 9. Resultado pratico

**Vai para NOTECHS** (fora das 18, cobertura ja existente em `notechs.ts`): comunicacao generica, coordenacao generica, distribuicao de tarefas, monitoramento cruzado como comportamento, julgamento operacional, tomada de decisao generica, consciencia situacional, workload, lideranca, cooperacao.

**Vira observacao/instrucao da sessao** (fora das 18, sem codigo de manobra): briefing generico, debrief, registro pos-voo, "filosofia" de QRH, explicacao conceitual de CAS, seguranca em solo generica, reforco sem variacao tecnica.

**Permanece nas 18 tecnicas** (manobra/procedimento observavel): checklist normal por fase de voo, uso do ECL/QRH em evento tecnico especifico, leitura/priorizacao objetiva de CAS, operacao especifica de AFCS/modos, varredura instrumental tecnica (IFR), aproximacao/pouso/arremetida, falha especifica de sistema/motor/rotor, procedimento FAP tecnico.

## 10. Escopo nao coberto por esta revisao

Esta V4.1 corrige a contaminacao de itens genericos/comportamentais nas 18 tecnicas. Ela nao:

- reabre a progressao pedagogica por sessao (ja fechada na V4, secao 3 daquele documento);
- reabre a recomendacao de 4 sessoes/ciclo para AW139 periodico (confirmada, secao 7 acima);
- resolve a duplicacao de familia de codigo S76 `76-*` vs `S76-*-NN` (pendencia ja registrada na V4, secao 3.1/12);
- resolve as pendencias de validacao ECL (S76) e QRH (AW139) herdadas da V3/V4;
- cria o marcador `carater = avaliativo` na estrutura de dados da ficha (fica como requisito para a proxima revisao de estrutura ou para a fase de implementacao).

## 11. Confirmacao de nao implementacao

- nenhum codigo de aplicacao foi implementado;
- nenhuma migration foi criada;
- nenhum DML foi executado;
- nenhum deploy foi realizado;
- nenhuma acao em producao foi executada;
- nenhum PR foi aberto;
- nenhum arquivo funcional do repositorio foi alterado — apenas este documento foi criado, sobre a base documental da V4.
