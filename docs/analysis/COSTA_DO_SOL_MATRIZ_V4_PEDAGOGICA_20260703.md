# Costa do Sol / AirTrust - Matriz V4 Pedagogica 20260703

Status do documento: revisao critica documental e pedagogica da V3, sem qualquer implementacao. Nao houve codigo de aplicacao, migration, DML, deploy, PR nem toque em producao. Este documento e uma proposta de resequenciamento pedagogico para validacao de instrutor/owner antes de qualquer trabalho futuro de implementacao.

## 1. Veredito

**NO-GO pedagogico para a V3 como sequencia de treinamento inicial, GO para a V4 como proposta de resequenciamento, condicionado a validacao de instrutor/owner/PTO.**

A V3 acertou a forma (18 tecnicas explicitas por ficha, 15 NOTECHS fixos fora das 18, separacao AW139/S76, AW139 periodico recomendado em 4 sessoes/ciclo) mas errou o conteudo pedagogico do Inicial: ela herdou a sequencia de sessoes do catalogo/PTO existente e apenas cortou de 22 para 18 itens por sessao, sem reordenar o que e ensinado primeiro. O resultado e que a Sessao 01/12 "Familiarizacao" de ambas as aeronaves concentra a maior parte do conteudo de emergencia pesada da aeronave (autorrotacao, ditching, pouso abortado, falha de motor em todas as fases de voo, DECU/CAT A-B, paineis degradados) antes mesmo do aluno ter uma sessao inteira de voo normal.

A V4 preserva 100% das decisoes formais da V3 (18 tecnicas, 15 NOTECHS fora das 18, separacao de frota, LOFT=11/LOFT Check=12, AW139 periodico em 4 sessoes/ciclo recomendado, FAP 05.2/06/14 mapeadas) e redistribui o conteudo das 12 sessoes de Inicial de cada aeronave em uma progressao que comeca em voo normal e so introduz emergencia pesada, autorrotacao e ditching depois de o aluno ja dominar o basico. O periodico foi apenas revisado (nao redesenhado), pois a V3 ja acerta a logica periodica (o aluno periodico ja e qualificado, entao misturar normal/emergencia/IFR na mesma sessao e correto).

Condicoes do GO da V4:
- validacao de instrutor/owner sobre a granularidade dos itens "normais" propostos como `NOVA_MANOBRA_NECESSARIA` (o catalogo `76-*` do S76/SK76 nao tem nenhum codigo de voo normal — ver secao 3.2);
- confirmacao de que os 16 codigos S76 e 22 codigos AW139 novos sugeridos fazem sentido operacional antes de qualquer criacao real de manobra;
- validacao ECL (S76) e QRH (AW139) pendente, como ja apontado pela V3;
- validacao owner/PTO da recomendacao AW139 periodico 4 sessoes/ciclo (ja recomendada pela V3, mantida aqui);
- confirmacao de duas inconsistencias encontradas na V3 (secao 2.3): `S76-VOR-00` e `S76-LDP-00` sao citados como "reaproveitados" nas secoes de cobertura da V3 mas nunca aparecem instanciados em nenhuma ficha concreta da V3.

## 2. O que estava errado na V3

### 2.1 Falha pedagogica central: sequencia herdada do catalogo, nao redesenhada

A V3 auditou cada sessao do catalogo/PTO existente (`SK76-I-01/12` .. `12/12`, `A139-I-01/12` .. `12/12`) e cortou de 22 para 18 itens dentro de cada sessao, preservando a atribuicao original de conteudo por sessao. Isso e uma melhoria de forma, mas nao resolve o problema relatado pelo instrutor: a sequencia de sessoes do catalogo/PTO original ja era pedagogicamente invertida, colocando emergencia pesada na Sessao 01.

Evidencia concreta (S76/SK76 Inicial, Sessao 01/12 "Familiarizacao" da V3):
`76-POUAB` (pouso abortado), `76-POUMO` (pouso monomotor), `76-MOTHV` (falha de motor em pairado), `76-MOTCA`/`76-MOTCB` (falha de motor na decolagem, Categoria A e B), `76-MOTCZ` (falha de motor em cruzeiro), `76-MOTAP` (falha de motor na aproximacao), `S76-DMN-21`/`S76-DDE-21` (DECU falha menor/degradada), `S76-FPL-31` (luz de pressao de combustivel), `76-FLWNR`, `76-OILMT`, `76-FALGC`, `76-HIDPB`, mais 4 itens de aproximacao/arremetida IFR. Zero itens de voo normal (partida, checklist normal, decolagem normal, circuito, pouso normal).

Sessao 02/12 da V3 adiciona `76-AUTAG` (autorrotacao para a agua) logo na segunda sessao do aluno inicial.

AW139 Inicial, Sessao 01/12 "Familiarizacao VFR" da V3: `WAR-LOW-29`/`WAR-HIG-29` (rotor RPM low/high), `CAU-HOT-65` (hot start), `CAU-CST-59` (compressor stall), `CAU-OVS-64`/`CAU-NGO-63` (engine/NG overspeed), `CAU-FLO-73`/`CAU-2FP-74` (fuel low, falha dupla de bomba de combustivel), `WAR-OIL-18` (oil pressure low), `CAU-LIC-60` (OEI limit timer), `WAR-EEC-18` (EEC FAIL), `WAR-IDL-16` (engine stuck IDLE), `FLY-BAS-17` (autorrotacao). Apenas 5 dos 18 itens (`FLY-BAS-X1`, `FLY-BAS-X3`, `OPS-NRM-X1`, `OPS-NRM-X2`, `OPS-NRM-X3`) sao efetivamente normais.

Isso contraria diretamente a critica do instrutor: aluno inicial deve comecar por cabine, checklist normal, partida, hover, taxi, decolagem normal, circuito, aproximacao e pouso normal — nao por autorrotacao, ditching, falha de motor na decolagem ou pane pesada.

### 2.2 Verificacao da origem: PTO Rev. 10 (AW139) ja tem essa estrutura

`docs/vendor/pto/relacao_manobras_pto_rev10_ocr.md` e o documento fonte OCR do PTO Rev. 10 da AW139, e a Sessao `A139-I-01/12` la dentro ja se chama "AW139 - 01/12: FAMILIARIZACAO" e ja mistura os mesmos itens de emergencia com os itens normais. Ou seja: a V3 nao inventou o problema, ela transcreveu fielmente um documento operacional (PTO) que ja tem essa estrutura pedagogicamente invertida. **A V4 e portanto uma proposta de resequenciamento que diverge da numeracao literal de sessao do PTO Rev. 10 — isso precisa ser validado explicitamente pelo instrutor/owner como uma mudanca de sequencia pedagogica, nao apenas como correcao de transcricao.** Nao foi localizado um documento PTO equivalente para S76/SK76 no workspace; o catalogo `76-*` usado pela V3 para o Inicial S76 parece ser uma fonte diferente da familia `S76-*-NN` usada no periodico (ver 2.3).

### 2.3 Duas inconsistencias adicionais encontradas na V3

- **Terminologia QRH usada indevidamente no S76.** O item `S76-LOFT-15` aparece nomeado "Aplicacao do QRH" nas 3 sessoes de LOFT/Check periodico do S76 (Ciclo 1/2/3, Sessao 03/03). S76/SK76 opera com ECL/checklist de emergencia, nao QRH (terminologia especifica da familia AW139 nesta matriz, onde `fonte` sempre cita "QRH AW139"). Nenhuma outra ocorrencia de "QRH" foi encontrada em blocos S76. **Corrigido na V4**: renomeado para "Aplicacao do ECL" (ver secao 6).
- **Dois codigos citados como reaproveitados mas nunca instanciados.** `S76-VOR-00` e `S76-LDP-00` aparecem nas secoes 9 ("Cobertura FAP 05.2") e 12 ("Manobras existentes reaproveitadas") da V3 como codigos existentes/reaproveitados, mas uma varredura completa de todas as 21 sessoes concretas da V3 (12 Inicial + 9 periodico S76) confirma que nenhum dos dois aparece de fato em nenhuma tabela de ficha. Isso e uma inconsistencia de redacao da V3 (a secao de cobertura cita codigos que a matriz de fichas nao usa). A V4 nao depende desses dois codigos como base de nenhuma sessao; onde um item equivalente e necessario, a V4 usa codigo ja instanciado (`76-APXNP` para nao-precisao) ou propoe codigo novo (`S76-PNO-01` para pouso normal). Ambos ficam listados como pendencia de validacao (secao 12).
- **Nenhum outro item comportamental/generico foi encontrado** vazando para dentro das 18 tecnicas alem do que a V3 ja tinha corrigido (remocao de `LOFT-CHK-04/16/20/21/22`, `S76-LOFT-12/16/21/22` etc. como legado CRM/NTS). Os itens "Disciplina de Checklist", "Monitoramento de Sistemas", "Gerenciamento do AFCS", "Flight Path Monitoring", "Identificacao e Diagnostico", "Acoes de Memoria", "Briefing de Aproximacao" nos blocos LOFT sao procedimentos tecnicos, nao comportamento CRM, e foram mantidos como tecnicas.

## 3. Regras pedagogicas aplicadas

1. **Redistribuir, nao cortar.** Nenhum codigo tecnico valido da V3 foi descartado; cada um foi realocado para a sessao onde seu nivel de dificuldade pedagogica faz sentido.
2. **Sessao 01 = 100% normal, 0% emergencia.** Nas duas aeronaves, a primeira sessao do Inicial contem apenas cabine/comandos/instrumentos basicos, checklist normal, partida normal, hover/taxi, decolagem normal, circuito visual, aproximacao normal, pouso normal, arremetida normal e estacionamento/corte.
3. **Sessao 02 = consolidacao do normal**, com subida/descida/curvas/controle de velocidade/vento cruzado leve — ainda 0% emergencia.
4. **IFR entra na Sessao 03, em nivel basico** (GPS/FMS/HSI/EFIS, SID/STAR, aproximacao e missed approach normais) — sem OEI, sem falha dupla, sem emergencia critica.
5. **Anormalidades simples entram na Sessao 04**, com enfase no uso do checklist/ECL (S76) ou QRH (AW139) para cautions/warnings de sistema unico.
6. **Falha de motor em cruzeiro / OEI planejado entram na Sessao 05**, como primeira introducao a perda de potencia — ainda sem decolagem/aproximacao criticas.
7. **OEI em decolagem/aproximacao, DECU/CAT A-B entram na Sessao 06** — aqui, nao antes.
8. **Sistemas especificos (eletrico, combustivel, oleo, hidraulico/servo, trem, instrumentos, AP/FD) entram na Sessao 07**, com falhas ja conhecidas cruzadas por sistema.
9. **Rotor/transmissao/autorrotacao so entram na Sessao 08.** Autorrotacao (terra) e a primeira vez que o aluno realiza controle de energia/RPM em autorrotacao real.
10. **Fogo/fumaca e emergencias avancadas na Sessao 09**, apos o aluno ja dominar falha de motor, sistemas e autorrotacao basica.
11. **Offshore/ditching so entram na Sessao 10.** Autorrotacao para a agua e ditching com potencia sao itens exclusivos desta sessao — nunca antes.
12. **LOFT (11) e LOFT Check (12) permanecem cenarios integrados, sem conteudo novo e sem item comportamental como tecnica** (NOTECHS cobre comportamento, fora das 18).
13. **Reaproveitamento maximo de codigo existente antes de propor codigo novo**, inclusive cruzando as familias de codigo do Inicial (`76-*` para S76) com as do periodico (`S76-*-00`/`S76-*-NN`), que ja tinham itens normais que o Inicial nunca usou.
14. **Onde o catalogo genuinamente nao tem item normal/basico, propor codigo novo com status `NOVA_MANOBRA_NECESSARIA`**, nunca forcar um item de emergencia para preencher a sessao.
15. **Nomenclatura corrigida por operacao real**: ECL para S76, QRH para AW139.

### 3.1 Achado adicional: familias de codigo duplicadas (S76)

O catalogo S76 tem duas familias de codigo cobrindo, em varios casos, o mesmo conceito de falha: a familia `76-*` (usada exclusivamente no Inicial da V3) e a familia `S76-*-NN` (usada exclusivamente no Periodico da V3). Exemplos de sobreposicao conceitual: `76-FALGC` (falha gerador DC simples) vs `S76-SDC-50`/`S76-DCD-50`; `76-N1TQF` (falha indicador N1/torque) vs `S76-N1T-30`; `76-OILMT` (falha oleo motor) vs `S76-EOP-25`; `76-CHPTG` (chip/temp gearbox) vs `S76-MGC-36`/`S76-MGP-33`. Isso nao foi criado pela V3 nem pela V4 — e uma duplicacao pre-existente entre as duas fichas (Inicial e Periodico) que nunca foi reconciliada. A V4 nao tenta unificar essas duas familias (fora do escopo desta tarefa, que e sequenciamento pedagogico, nao normalizacao de catalogo); isso fica registrado como pendencia de validacao (secao 12) para um trabalho futuro dedicado de reconciliacao de catalogo.

### 3.2 Achado adicional: catalogo `76-*` do S76 Inicial nao tem nenhum item de voo normal

Uma varredura de todos os codigos `76-*` usados nas 12 sessoes do Inicial S76 na V3 (49 codigos distintos) confirma que nenhum deles representa uma manobra normal (partida, checklist, decolagem, circuito, pouso, arremetida sem falha). Todos os 49 sao falha de sistema, falha de motor, DECU, ou procedimento IFR avancado (aproximacao/arremetida por instrumentos). A familia periodica `S76-*-00` tem alguns itens normais amplos (`S76-NVF-00`, `S76-HOV-00`, `S76-NIF-00`, `S76-CGI-00`, `S76-FDA-00`), mas nenhum granular (nao ha codigo separado para "partida normal", "checklist normal", "decolagem normal", "circuito visual", "pouso normal" ou "arremetida normal"). Por isso a V4 precisa propor 16 codigos novos para o S76 (secao 9) so para cobrir a granularidade normal pedida pelo instrutor. O catalogo AW139 e mais bem servido nesse quesito (`FLY-BAS-X1/X2/X3/X4`, `OPS-NRM-X1/X2/X3` ja cobrem controle geral, hover/taxi, procedimentos normais, decolagens/pousos e circuito), por isso a AW139 precisa de menos codigos novos (22, mas a maioria e para itens especificos do tipo: power-up, CAS basico, QRH filosofia, AFCS basico, CAT A/B, autorrotacao/energia).

---

## 4. S76/SK76 Inicial — 12 sessoes, 18 tecnicas por sessao

Legenda de decisao: `REAPROVEITAR` = codigo e nome existentes na V3, sem alteracao; `REAPROVEITAR_RENOMEANDO` = codigo existente, nome ja normalizado pela V3; `REALOCAR` = codigo existente da V3 usado nesta sessao mas que estava em outra sessao na V3 (ver tabela de movimentacao, secao 8); `NOVA_MANOBRA_NECESSARIA` = codigo nao existe no catalogo, sugerido para criacao futura, sem implementacao.

### Sessao 01/12 — Familiarizacao / Checklist Normal / Voo Normal Basico

Conteudo: apenas voo normal. Zero emergencia, zero IFR, zero autorrotacao/ditching, conforme mandato.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | S76-CAB-01 | Cabine, Comandos e Instrumentos Basicos | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | FAP05.2 basico/normais | nova_manobra | Familiarizacao de cockpit antes de qualquer manobra |
| 2 | S76-CKL-01 | Checklist Normal - Disciplina de Uso | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | FAP05.2 C2.1/C2.2 | nova_manobra | - |
| 3 | S76-PNR-01 | Partida Normal | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | FAP05.2 H1.1 | nova_manobra | - |
| 4 | S76-HOV-00 | Controle Geral VFR - Hover & Taxi | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | FAP05.2 H2.3/H3.1 | validado_catalogo | Reaproveitado da familia periodica `S76-*-00`, nunca usado no Inicial na V3 |
| 5 | S76-DNR-01 | Decolagem Normal | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | FAP05.2 H4.2 | nova_manobra | - |
| 6 | S76-NVF-00 | Procedimentos Normais VFR | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | FAP05.2 H4.1/H4.3 | validado_catalogo | Reaproveitado da familia periodica, nunca usado no Inicial na V3 |
| 7 | S76-CIR-01 | Circuito de Trafego Visual | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | - | nova_manobra | - |
| 8 | S76-APN-01 | Aproximacao Normal (Visual) | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | FAP05.2 H4.3 | nova_manobra | - |
| 9 | S76-PNO-01 | Pouso Normal | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | FAP05.2 H4.3 | nova_manobra | Ver pendencia sobre `S76-LDP-00` (secao 2.3) |
| 10 | S76-ARN-01 | Arremetida Normal | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | - | nova_manobra | - |
| 11 | S76-EST-01 | Estacionamento e Corte de Motores | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | FAP05.2 H4.5/C2.3 | nova_manobra | - |
| 12 | S76-SUB-01 | Subida Controlada Visual | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | - | nova_manobra | - |
| 13 | S76-CRV-01 | Curvas Padrao e Controle de Atitude | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | - | nova_manobra | - |
| 14 | S76-COM-01 | Comunicacoes e Fraseologia de Circuito | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | - | nova_manobra | - |
| 15 | S76-BRF-01 | Briefing de Voo (Procedimento Normal) | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | - | nova_manobra | - |
| 16 | S76-TAX-01 | Taxi e Deslocamento em Solo/Heliponto | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | FAP05.2 H2.3 | nova_manobra | - |
| 17 | S76-SCN-01 | Varredura de Instrumentos Basicos | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | - | nova_manobra | - |
| 18 | S76-SEG-01 | Procedimentos de Seguranca em Solo (briefing pre-voo) | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | - | nova_manobra | - |

Itens proibidos verificados ausentes: pouso abortado, pouso monomotor, falha de motor (qualquer fase), autorrotacao, ditching, IFR, DECU, falhas de sistema, falhas eletricas/hidraulicas, emergencia pesada. **Confirmado ausente.**

### Sessao 02/12 — Voo Normal Consolidado / Perfil Visual

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | S76-CKL-01 | Checklist Normal - Disciplina de Uso | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | FAP05.2 C2.1/C2.2 | nova_manobra | Reforco/consolidacao |
| 2 | S76-HOV-00 | Controle Geral VFR - Hover & Taxi de Precisao | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | FAP05.2 H2.3/H3.1 | validado_catalogo | Reforco, agora com precisao |
| 3 | S76-DNR-01 | Decolagem Normal | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | FAP05.2 H4.2 | nova_manobra | Reforco |
| 4 | S76-SUB-01 | Subida Controlada Visual | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | - |
| 5 | S76-NVF-00 | Cruzeiro Visual - Procedimentos Normais | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | FAP05.2 H4.1/H4.3 | validado_catalogo | Reforco |
| 6 | S76-CRV-01 | Curvas Padrao e Controle de Atitude | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 7 | S76-CTV-01 | Controle de Velocidade em Voo Nivelado | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | - | nova_manobra | - |
| 8 | S76-DSC-01 | Descida Controlada Visual | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | - | nova_manobra | - |
| 9 | S76-APN-01 | Aproximacao Visual | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | FAP05.2 H4.3 | nova_manobra | Reforco |
| 10 | S76-PNO-01 | Pouso Normal | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | FAP05.2 H4.3 | nova_manobra | Reforco |
| 11 | S76-ARN-01 | Arremetida Normal | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 12 | S76-REC-01 | Reentrada no Circuito de Trafego | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | - | nova_manobra | - |
| 13 | S76-VCZ-01 | Pouso e Decolagem com Vento Cruzado Leve | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | - | nova_manobra | Se aplicavel as condicoes do dia |
| 14 | S76-CIR-01 | Circuito Visual - Segunda Volta | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 15 | S76-COM-01 | Comunicacoes e Fraseologia | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 16 | S76-BRF-01 | Briefing de Voo (Procedimento Normal) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 17 | S76-TAX-01 | Taxi e Deslocamento em Solo/Heliponto | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | FAP05.2 H2.3 | nova_manobra | Reforco |
| 18 | S76-EST-01 | Estacionamento e Corte de Motores | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | FAP05.2 H4.5/C2.3 | nova_manobra | Reforco |

Itens proibidos verificados ausentes: autorrotacao para a agua, falha de motor, monomotor, ditching, IFR avancado. **Confirmado ausente.**

### Sessao 03/12 — IFR / Navegacao Basico

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | 76-PRGGP | Programacao do GPS, HSI e EFIS | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 2 | S76-NIF-00 | Procedimentos Normais IFR | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | validado_catalogo | Reaproveitado da familia periodica |
| 3 | S76-CGI-00 | Controle Geral IFR | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | validado_catalogo | Reaproveitado da familia periodica |
| 4 | 76-DECSI | Decolagem por instrumentos (SID) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 04/12 da V3 |
| 5 | S76-SID-00 | SID & STAR | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | FAP06 CIR.3 | validado_catalogo | Reaproveitado da familia periodica |
| 6 | S76-FDA-00 | Uso do Diretor de Voo e Automacao | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | validado_catalogo | Uso normal de AP/FD, sem falha |
| 7 | 76-APXPR | Aproximacao de precisao IFR (ILS/RNP) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 01/12 da V3 |
| 8 | 76-APXNP | Aproximacao de nao precisao IFR (VOR/NDB) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 01/12 da V3 |
| 9 | S76-RNV-00 | Aproximacao RNAV (GPS) | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | FAP06 IAP2.2 | validado_catalogo | Reaproveitado da familia periodica |
| 10 | 76-ARRIF | Arremetida IFR (normal) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 01/12 da V3 |
| 11 | S76-HLD-00 | Holding Pattern | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | FAP06 CIR.7 | validado_catalogo | Reaproveitado da familia periodica |
| 12 | S76-UAR-00 | Recuperacao de Atitudes Anormais (basico) | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | validado_catalogo | Reaproveitado da familia periodica |
| 13 | S76-VMA-01 | Voo Manual por Instrumentos (condicao normal) | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |
| 14 | S76-SCN-01 | Varredura de Instrumentos Basicos (reforco IFR) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco em contexto IFR |
| 15 | S76-ORI-01 | Orientacao e Correcao de Rumo por Instrumentos | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |
| 16 | S76-COM-01 | Comunicacoes e Fraseologia IFR | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 17 | S76-BRF-01 | Briefing de Aproximacao (procedimento normal) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 18 | 76-APXPI | Aproximacao perdida IFR (procedimento publicado) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 01/12 da V3 |

Itens proibidos verificados ausentes: OEI IFR, falha dupla AP, emergencia critica, ditching. **Confirmado ausente.**

### Sessao 04/12 — Anormalidades Simples / Checklist/ECL

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | 76-FLWNR | Vazao de combustivel fora da faixa normal | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 01/12 da V3 |
| 2 | S76-FPL-31 | Luz de Aviso de Pressao de Combustivel | renomeado | REAPROVEITAR_RENOMEANDO | AirTrust catalogo; PTO-A | FAP05.2 falhas de sistemas/combustivel; validar ECL | validado_catalogo | Mantido conforme V3 (76-COMBX -> S76-FPL-31) |
| 3 | 76-OILMT | Falha no sistema de oleo do motor | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 01/12 da V3 |
| 4 | 76-FALGC | Falha em um gerador DC (PEA, simples) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 01/12 da V3 |
| 5 | 76-PER26 | Perda de referencia de 26 VAC | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 03/12 da V3 |
| 6 | 76-FALRM | Falha no sistema mestre de radio | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 03/12 da V3 |
| 7 | 76-FALEF | Mau funcionamento do EFIS | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 03/12 da V3 |
| 8 | 76-N1TQF | Falha nos indicadores N1 ou Torque | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 02/12 da V3 |
| 9 | 76-FALTS | Falha no indicador TS | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 04/12 da V3 |
| 10 | 76-HIDPB | Falha da bomba ou perda de pressao no sistema servo/hidraulico (simples) | validar | VALIDAR_ECL | AirTrust catalogo; PTO-A | - | validar_ecl | Fechar nomenclatura Servo SYS vs hidraulico com ECL/PTO (pendencia ja apontada pela V3) |
| 11 | S76-CKL-02 | Uso do ECL para Anormalidade Simples | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP05.2 C2.1/C2.2 | nova_manobra | Reforca a disciplina de checklist/ECL pedida pelo owner |
| 12 | 76-FALAD | Falha no sistema de dados de voo | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 04/12 da V3 |
| 13 | 76-PERAT | Perda do indicador primario de atitude em IMC | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 03/12 da V3 |
| 14 | S76-APN-02 | Aproximacao e Pouso Apos Anormalidade Simples | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP05.2 H4.3 | nova_manobra | Fecha o ciclo procedural da sessao |
| 15 | 76-FALFF | Falha de alimentacao - feeder / bateria | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 03/12 da V3 |
| 16 | 76-FALIV | Falha no inversor | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 03/12 da V3 |
| 17 | 76-FALFD | Falha no flight director | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 04/12 da V3 |
| 18 | S76-CKL-01 | Checklist Normal (aplicado antes/depois da anormalidade) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | FAP05.2 C2.1/C2.2 | nova_manobra | Reforco |

Itens proibidos verificados ausentes: falha dupla, autorrotacao, ditching, falha de motor na decolagem. **Confirmado ausente.**

### Sessao 05/12 — Motor em Cruzeiro / OEI Introdutorio

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | 76-MOTCZ | Falha de motor durante o cruzeiro | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 01/12 da V3 — item central desta sessao |
| 2 | S76-IDF-01 | Identificacao e Diagnostico de Falha de Motor | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP05.2 H7.7 | nova_manobra | - |
| 3 | S76-CKL-03 | Aplicacao do ECL para Falha de Motor em Cruzeiro | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP05.2 H7.4 | nova_manobra | - |
| 4 | S76-DMN-21 | DECU - Falha Menor | renomeado | REAPROVEITAR_RENOMEANDO | AirTrust catalogo; PTO-A | FAP05.2 H7.4/H7.9; validar ECL/PTO | validado_catalogo | Introducao mais leve da familia DECU |
| 5 | S76-XFD-20 | Crossfeed Total apos Falha de Motor | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | validado_catalogo | Reaproveitado da familia periodica |
| 6 | S76-OEI-01 | Perfil OEI em Cruzeiro (voo monomotor planejado) | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP05.2 H7.4 | nova_manobra | - |
| 7 | 76-N1TQF | Monitoramento de N1/Torque apos falha (reforco) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |
| 8 | 76-FLWNR | Vazao de combustivel (reforco em contexto de falha) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |
| 9 | 76-OILMT | Falha no sistema de oleo do motor (reforco) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |
| 10 | S76-APX-02 | Aproximacao Planejada com um Motor Inoperante | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP05.2 H7.9 | nova_manobra | - |
| 11 | S76-PNO-01 | Pouso Normal (aplicado ao contexto OEI planejado) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | FAP05.2 H4.3 | nova_manobra | Reforco |
| 12 | S76-CGI-00 | Controle Geral IFR (se aplicavel ao cenario OEI) | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | validado_catalogo | Reforco |
| 13 | 76-APXOI | Aproximacao IFR com um motor inoperante | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 02/12 da V3 |
| 14 | S76-COM-01 | Comunicacoes (declaracao de emergencia controlada) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 15 | S76-BRF-01 | Briefing de Aproximacao (contexto OEI) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 16 | S76-SCN-01 | Varredura de Instrumentos Pos-Falha | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 17 | 76-FALGC | Falha em um gerador DC (reforco, correlato sistemico) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |
| 18 | S76-UAR-00 | Recuperacao de Atitudes Anormais (reforco) | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | validado_catalogo | Reforco |

Itens proibidos verificados ausentes: falha de motor na decolagem, autorrotacao, ditching, pouso abortado. **Confirmado ausente.**

### Sessao 06/12 — OEI Decolagem/Aproximacao / DECU

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | S76-DDE-21 | DECU - Falha Degradada | renomeado | REAPROVEITAR_RENOMEANDO | AirTrust catalogo; PTO-A | FAP05.2 H7.4/H7.9; validar ECL/PTO | validado_catalogo | - |
| 2 | S76-DM1-22 | DECU - Falha Maior - Um Motor | renomeado | REAPROVEITAR_RENOMEANDO | AirTrust catalogo; PTO-A | FAP05.2 H7.4/H7.9; validar ECL/PTO | validado_catalogo | - |
| 3 | S76-DMB-24 | DECU - Falha Maior - Ambos os Motores | renomeado | REAPROVEITAR_RENOMEANDO | AirTrust catalogo; PTO-A | FAP05.2 H7.4/H7.9; validar ECL/PTO | validado_catalogo | - |
| 4 | 76-MOTCA | Falha de motor na decolagem - Categoria A PRA | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 01/12 da V3 |
| 5 | 76-MOTCB | Falha de motor na decolagem - Categoria B | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 01/12 da V3 |
| 6 | 76-MOTHV | Falha de motor em pairado 5 a 10 pes | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 01/12 da V3 |
| 7 | 76-POUAB | Pouso abortado (rejected takeoff) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 01/12 da V3 |
| 8 | 76-POUMO | Pouso monomotor - Categoria A ou B PEA | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 01/12 da V3 |
| 9 | 76-MOTAP | Falha de motor na aproximacao - Categoria A | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 01/12 da V3 |
| 10 | 76-APXAL | Aproximacao alternada - Categoria A | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 02/12 da V3 |
| 11 | 76-APXOI | Aproximacao IFR com um motor inoperante (reforco) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |
| 12 | S76-CKL-04 | Aplicacao do ECL para DECU e Falha de Motor na Decolagem/Aproximacao | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP05.2 H7.4/H7.9 | nova_manobra | - |
| 13 | 76-N1TQF | Monitoramento de N1/Torque (reforco) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |
| 14 | S76-XFD-20 | Crossfeed Total apos Falha de Motor (reforco) | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | validado_catalogo | Reforco |
| 15 | S76-BRF-01 | Briefing Pre-Decolagem OEI | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 16 | S76-COM-01 | Comunicacoes de Emergencia | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 17 | S76-CGI-00 | Controle Geral IFR (reforco) | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | validado_catalogo | Reforco |
| 18 | S76-UAR-00 | Recuperacao de Atitudes Anormais (reforco) | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | validado_catalogo | Reforco |

Itens proibidos verificados: "rejected/continued only se aplicavel e validado" — `76-POUAB` (rejected) e `76-MOTCA`/`76-MOTCB` (continued com falha) estao presentes conforme mandato da sessao. Autorrotacao e ditching **confirmados ausentes**.

### Sessao 07/12 — Sistemas Especificos

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | 76-FALGD | Falha em ambos os geradores DC | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 03/12 da V3 |
| 2 | 76-SOBGD | Sobretemperatura de gerador DC | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 03/12 da V3 |
| 3 | 76-FALGA | Falha no gerador AC | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 03/12 da V3 |
| 4 | 76-FALEB | Falha de alimentacao no barramento essencial | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 03/12 da V3 |
| 5 | 76-FALIV | Falha no inversor | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 03/12 da V3 |
| 6 | 76-FALFF | Falha de alimentacao - feeder / bateria | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 03/12 da V3 |
| 7 | 76-HIDPB | Falha da bomba ou perda de pressao no sistema servo/hidraulico | validar | VALIDAR_ECL | AirTrust catalogo; PTO-A | - | validar_ecl | Fechar nomenclatura com ECL/PTO |
| 8 | 76-SERTQ | Perda de pressao no servo do rotor de cauda | validar | VALIDAR_ECL | AirTrust catalogo; PTO-A | - | validar_ecl | Fechar nomenclatura com ECL/PTO |
| 9 | 76-SERJM | Atuador travado ou valvula de corte defeituosa | validar | VALIDAR_ECL | AirTrust catalogo; PTO-A | - | validar_ecl | Fechar nomenclatura com ECL/PTO |
| 10 | 76-AMOTV | Amortecedor dos comandos travado PRB | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 08/12 da V3 |
| 11 | S76-UGR-46 | Indicacao Insegura - Recolhimento do Trem | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | validado_catalogo | Trem de pouso — item ausente do catalogo `76-*` Inicial, reaproveitado do periodico |
| 12 | S76-LGB-47 | Trem de Pouso - Extensao de Emergencia | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | validado_catalogo | Reaproveitado do periodico |
| 13 | 76-FALAD | Falha no sistema de dados de voo (reforco, contexto sistemas) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |
| 14 | 76-PERAT | Perda do indicador primario de atitude em IMC (reforco) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |
| 15 | 76-FALTS | Falha no indicador TS (reforco) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |
| 16 | 76-FALPA | Falha no piloto automatico | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 04/12 da V3 |
| 17 | 76-FALFD | Falha no flight director | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 04/12 da V3 |
| 18 | 76-N1TQF | Falha nos indicadores N1 ou Torque (reforco final) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |

### Sessao 08/12 — Rotor / Transmissao / Autorrotacao

Primeira sessao onde autorrotacao (terra) e introduzida — conforme mandato ("so aqui entram").

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | 76-MGBSF | Falhas no sistema da MGB | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 04/12 da V3 |
| 2 | 76-MGBOL | Falhas no sistema de oleo da MGB | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 09/12 da V3 |
| 3 | 76-CHPTG | Chip ou alta temperatura no gearbox | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 08/12 da V3 |
| 4 | 76-TRSRC | Falha do sistema de transmissao do rotor de cauda | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 04/12 da V3 |
| 5 | 76-CTRRC | Falha no sistema de controle do rotor de cauda PF | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 04/12 da V3 |
| 6 | S76-TRH-38 | Falha do Rotor de Cauda no Hover | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | validado_catalogo | Reaproveitado do periodico |
| 7 | S76-TRD-39 | Falha do Eixo do Rotor de Cauda em Voo | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | validado_catalogo | Reaproveitado do periodico |
| 8 | S76-TDM-41 | Dano no Rotor de Cauda | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | validado_catalogo | Reaproveitado do periodico |
| 9 | S76-NRO-00 | Disparo de NR (NR Overspeed) | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | validado_catalogo | Reaproveitado do periodico |
| 10 | S76-NRL-00 | Queda de NR (NR Low) | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | validado_catalogo | Reaproveitado do periodico |
| 11 | S76-AUT-70 | Autorrotacao (terra) | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | validado_catalogo | Primeira introducao de autorrotacao no Inicial — distinto de `76-AUTAG` (agua), reservado para a Sessao 10 |
| 12 | S76-CKL-05 | Acoes de Memoria e ECL para Emergencia de Rotor/Transmissao | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |
| 13 | S76-MRV-00 | Vibracao do Rotor Principal | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | validado_catalogo | Reaproveitado do periodico |
| 14 | S76-ENE-01 | Controle de Energia/RPM em Autorrotacao | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |
| 15 | S76-REC-02 | Recuperacao de Autorrotacao (power recovery / pouso) | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |
| 16 | 76-AMOTV | Amortecedor dos comandos travado (reforco) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |
| 17 | S76-COM-01 | Comunicacoes (reforco) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 18 | S76-BRF-01 | Briefing (reforco) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |

Itens proibidos verificados ausentes: ditching/pouso na agua (`76-AUTAG`, `S76-DIT-71` ficam exclusivamente na Sessao 10). **Confirmado ausente.**

### Sessao 09/12 — Fogo/Fumaca e Emergencias Avancadas

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | 76-INCMO | Incendio no compartimento do motor | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 04/12 da V3 |
| 2 | 76-INCCB | Incendio na cabine ou cockpit | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 09/12 da V3 |
| 3 | 76-FUMBG | Fumaca no compartimento de bagagem | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 09/12 da V3 |
| 4 | S76-FMG-08 | Fogo no Compartimento do Motor no Solo | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | validado_catalogo | Reaproveitado do periodico |
| 5 | S76-FMI-09 | Fogo Interno no Motor apos Desligamento | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | validado_catalogo | Reaproveitado do periodico |
| 6 | S76-FMF-07 | Fogo no Compartimento do Motor em Voo | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | validado_catalogo | Reaproveitado do periodico |
| 7 | S76-CCF-10 | Fogo/Fumaca na Cabine em Voo | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | validado_catalogo | Reaproveitado do periodico |
| 8 | S76-EFV-11 | Fogo de Origem Eletrica - VMC (Breakout) | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | validado_catalogo | Reaproveitado do periodico |
| 9 | S76-EFI-12 | Fogo de Origem Eletrica - IMC | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | validado_catalogo | Reaproveitado do periodico |
| 10 | 76-DUAHV | Falha dupla de motor em pairado ou decolagem (falha multipla controlada) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 07/12 da V3 |
| 11 | 76-DUADC | Falha dupla de motor durante decolagem | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 07/12 da V3 |
| 12 | 76-DUACZ | Falha dupla de motor durante o cruzeiro | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 07/12 da V3 |
| 13 | 76-FALGD | Falha em ambos os geradores DC (reforco, alto estresse) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |
| 14 | S76-CKL-06 | Acoes de Memoria para Fogo/Fumaca (emergencia de alto estresse) | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |
| 15 | 76-POUAB | Pouso abortado (reforco, por fogo/fumaca) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |
| 16 | 76-POUMO | Pouso monomotor (reforco, por falha dupla) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |
| 17 | S76-COM-01 | Comunicacoes de Emergencia (reforco) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 18 | S76-BRF-01 | Briefing de Emergencia (reforco) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |

### Sessao 10/12 — Offshore / Unidade Maritima

Unica sessao do Inicial com ditching/autorrotacao para a agua, conforme mandato.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | S76-TDP-00 | Decolagem Classe 2 - Helideck (TDP) | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | FAP05.2 H4.2; FAP14 Offshore | validado_catalogo | Reaproveitado do periodico |
| 2 | S76-APO-01 | Aproximacao Offshore a Unidade Maritima | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP14 Offshore/SOP | nova_manobra | - |
| 3 | S76-ARO-01 | Arremetida Offshore | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP14 Offshore/SOP | nova_manobra | - |
| 4 | 76-AUTAG | Autorrotacao para a Agua | existente | REALOCAR | AirTrust catalogo; PTO-A | FAP05.2 Emergencias; FAP14 Offshore | validado_catalogo | Estava na Sessao 02/12 da V3 — agora exclusivo desta sessao |
| 5 | S76-DIT-71 | Ditching com Potencia | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | FAP05.2 Emergencias; FAP14 Offshore | validado_catalogo | Reaproveitado do periodico |
| 6 | S76-FLU-01 | Procedimentos de Flutuabilidade e Evacuacao Aquatica | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP14 Offshore/SOP | nova_manobra | - |
| 7 | 76-MOTAP | Falha de motor na aproximacao (reforco, contexto offshore) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |
| 8 | 76-MOTCZ | Falha de motor durante o cruzeiro (reforco, contexto offshore) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |
| 9 | 76-POUMO | Pouso monomotor (reforco, offshore) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |
| 10 | 76-APXOI | Aproximacao IFR com um motor inoperante (reforco) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |
| 11 | 76-FALPA | Falha no piloto automatico (reforco, contexto offshore) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |
| 12 | 76-FALFD | Falha no flight director (reforco) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |
| 13 | 76-PERAT | Perda do indicador primario de atitude em IMC (reforco) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |
| 14 | 76-FALAD | Falha no sistema de dados de voo (reforco) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |
| 15 | 76-POUAB | Pouso abortado (reforco, decolagem rejeitada offshore) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |
| 16 | S76-CKL-07 | Checklist e ECL Especifico para Operacao Offshore | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP14 Offshore/SOP | nova_manobra | - |
| 17 | S76-COM-01 | Comunicacoes Offshore (radio maritimo, reforco) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 18 | S76-BRF-01 | Briefing Offshore (reforco) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |

### Sessao 11/12 — LOFT (sem alteracao da V3)

Cenario integrado, sem conteudo novo, sem item comportamental (NOTECHS cobre comportamento). A composicao da V3 ja estava correta como cenario de integracao final e foi mantida.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | 76-PRGGP | Programacao do GPS, HSI e EFIS | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 2 | 76-DECSI | Decolagem por instrumentos (SID) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 3 | 76-APXPR | Aproximacao de precisao IFR (ILS/RNP) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 4 | 76-APXNP | Aproximacao de nao precisao IFR (VOR/NDB) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 5 | 76-APXPI | Aproximacao perdida IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 6 | 76-ARRIF | Arremetida IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 7 | 76-MOTCZ | Falha de motor durante o cruzeiro | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 8 | 76-APXOI | Aproximacao IFR com um motor inoperante | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 9 | 76-POUMO | Pouso monomotor - Categoria A ou B PEA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 10 | 76-HIDPB | Falha da bomba ou perda de pressao no servo/hidraulico | validar | VALIDAR_ECL | AirTrust catalogo; PTO-A | - | validar_ecl | - |
| 11 | 76-INCMO | Incendio no compartimento do motor | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 12 | 76-MGBSF | Falhas no sistema da MGB | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 13 | 76-POUAB | Pouso abortado | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 14 | 76-AUTAG | Autorrotacao para a agua | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 15 | 76-APXAL | Aproximacao alternada - Categoria A | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 16 | 76-MOTHV | Falha de motor em pairado 5 a 10 pes | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 17 | 76-MOTCA | Falha de motor na decolagem - Categoria A PRA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 18 | 76-MOTCB | Falha de motor na decolagem - Categoria B | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |

### Sessao 12/12 — LOFT Check (sem alteracao da V3)

Check final, sem conteudo novo, cobrindo tudo que foi treinado nas sessoes 1-11.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | 76-POUAB | Pouso abortado | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 2 | 76-POUMO | Pouso monomotor - Categoria A ou B PEA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 3 | 76-AUTAG | Autorrotacao para a agua | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 4 | 76-MOTCA | Falha de motor na decolagem - Categoria A PRA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 5 | 76-MOTCB | Falha de motor na decolagem - Categoria B | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 6 | 76-MOTHV | Falha de motor em pairado 5 a 10 pes | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 7 | 76-MOTCZ | Falha de motor durante o cruzeiro | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 8 | 76-MOTAP | Falha de motor na aproximacao - Categoria A | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 9 | 76-DUAHV | Falha dupla de motor em pairado ou decolagem | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 10 | 76-DUADC | Falha dupla de motor durante decolagem | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 11 | 76-DUACZ | Falha dupla de motor durante o cruzeiro | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 12 | 76-APXPR | Aproximacao de precisao IFR (ILS/RNP) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 13 | 76-APXNP | Aproximacao de nao precisao IFR (VOR/NDB) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 14 | 76-APXOI | Aproximacao IFR com um motor inoperante | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 15 | 76-APXPI | Aproximacao perdida IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 16 | 76-ARRIF | Arremetida IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 17 | 76-MGBSF | Falhas no sistema da MGB | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 18 | 76-HIDPB | Falha da bomba ou perda de pressao no servo/hidraulico | validar | VALIDAR_ECL | AirTrust catalogo; PTO-A | - | validar_ecl | - |

---

## 5. AW139 Inicial — 12 sessoes, 18 tecnicas por sessao

### Sessao 01/12 — Familiarizacao / Checklist Normal / Voo Normal

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | A139-CAB-01 | Cabine AW139 e Power-Up | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP05.2 basico/normais | nova_manobra | - |
| 2 | A139-CKL-01 | Normal Checklist (uso e disciplina) | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP05.2 C2.1/C2.2 | nova_manobra | - |
| 3 | FLY-BAS-X1 | Controle geral VFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 basico/normais conforme aplicavel | validado_catalogo | - |
| 4 | FLY-BAS-X3 | Hover e taxi | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H2.3/H3.1 | validado_catalogo | - |
| 5 | OPS-NRM-X1 | Procedimentos normais | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.1/H4.3 | validado_catalogo | - |
| 6 | OPS-NRM-X2 | Decolagens e pousos | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.2/H4.3 | validado_catalogo | - |
| 7 | OPS-NRM-X3 | Circuito de trafego | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 8 | A139-CAS-01 | CAS Basico (leitura e familiarizacao, sem pane) | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | Apenas leitura/localizacao do painel CAS, sem simular falha |
| 9 | A139-QRH-01 | QRH - Localizacao e Filosofia de Uso (sem emergencia) | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | Apenas localizacao/estrutura do QRH, sem cenario de falha |
| 10 | A139-AFB-01 | AFCS Basico (modos normais) | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | Sem degradacao/falha |
| 11 | A139-EST-01 | Estacionamento e Corte de Motores | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP05.2 H4.5/C2.3 | nova_manobra | - |
| 12 | FLY-BAS-X4 | Recuperacao de atitudes anormais (basico, VMC) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 04/12 da V3; aqui como airmanship basico, nao emergencia |
| 13 | A139-COM-01 | Comunicacoes e Fraseologia de Circuito | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |
| 14 | A139-BRF-01 | Briefing Pre-Voo e Seguranca em Solo | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |
| 15 | A139-SCN-01 | Varredura de Instrumentos Basicos | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |
| 16 | A139-TAX-01 | Taxi/Deslocamento em Solo e Heliponto | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |
| 17 | A139-ARN-01 | Arremetida Normal | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |
| 18 | A139-DBR-01 | Debriefing e Registro Pos-Voo | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |

Itens proibidos verificados ausentes: Rotor RPM low/high, hot start, compressor stall, engine overspeed, fuel low, double fuel pump failure, oil pressure low, EEC FAIL, engine stuck IDLE, autorrotacao, engine failure, emergencia pesada. **Confirmado ausente.**

### Sessao 02/12 — Voo Visual e Perfil Basico

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | A139-CKL-01 | Normal Checklist (reforco) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | FAP05.2 C2.1/C2.2 | nova_manobra | Reforco |
| 2 | FLY-BAS-X3 | Hover e taxi de precisao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H2.3/H3.1 | validado_catalogo | Reforco |
| 3 | OPS-NRM-X2 | Decolagens e pousos (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.2/H4.3 | validado_catalogo | Reforco |
| 4 | OPS-NRM-X3 | Circuito de trafego (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |
| 5 | FLY-BAS-X1 | Controle geral VFR (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 basico/normais conforme aplicavel | validado_catalogo | Reforco |
| 6 | A139-SUB-01 | Subida e Cruzeiro Visual | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |
| 7 | A139-CRV-01 | Curvas e Controle de Atitude/Velocidade | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |
| 8 | A139-DSC-01 | Descida Controlada Visual | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |
| 9 | A139-ARN-01 | Arremetida Normal (reforco) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 10 | A139-VCZ-01 | Pouso/Decolagem com Vento Cruzado Leve | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | Se aplicavel as condicoes do dia |
| 11 | A139-REC-02 | Reentrada no Circuito de Trafego | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |
| 12 | OPS-OFF-X1 | Navegacao offshore (introdutoria, sem emergencia) | existente | REALOCAR | AirTrust catalogo; PTO-A | FAP14 Offshore/SOP | validado_catalogo | Estava na Sessao 10/12 da V3; aqui como introducao normal de navegacao costeira |
| 13 | A139-COM-01 | Comunicacoes e Fraseologia (reforco) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 14 | A139-BRF-01 | Briefing Pre-Voo (reforco) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 15 | A139-AFB-01 | AFCS Basico (reforco) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 16 | A139-QRH-01 | QRH - Filosofia de Uso (reforco) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 17 | A139-TAX-01 | Taxi/Deslocamento (reforco) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 18 | A139-CAS-01 | CAS Basico (reforco) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |

Itens proibidos verificados ausentes: autorrotacao para agua/ditching, falha de motor, monomotor, IFR avancado. **Confirmado ausente.**

### Sessao 03/12 — IFR/PBN Basico

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | FLY-BAS-X2 | Controle geral IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 basico/normais conforme aplicavel | validado_catalogo | - |
| 2 | OPS-NAV-X1 | Navegacao FMS e convencional | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.5 | validado_catalogo | - |
| 3 | OPS-NAV-X4 | SID e STAR | existente | REALOCAR | AirTrust catalogo; PTO-A | FAP06 CIR.3 | validado_catalogo | Estava na Sessao 05/12 da V3 |
| 4 | OPS-APP-X1 | Precision approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP3.2 | validado_catalogo | - |
| 5 | OPS-APP-X2 | Non-precision approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.2 | validado_catalogo | - |
| 6 | OPS-APP-X3 | Missed approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.3 | validado_catalogo | - |
| 7 | OPS-NAV-X3 | Holding pattern | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.7 | validado_catalogo | - |
| 8 | OPS-NAV-X2 | Uso AP e automacao (normal) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.3/CIR.5 conforme aplicavel | validado_catalogo | - |
| 9 | FLY-BAS-X4 | Recuperacao de atitudes anormais (reforco, contexto IFR basico) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |
| 10 | A139-VMA-01 | Voo Manual por Instrumentos (condicao normal) | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |
| 11 | A139-SCN-02 | Varredura de Instrumentos IFR (six-pack + PFD) | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |
| 12 | A139-ORI-01 | Orientacao e Correcao de Rumo por Instrumentos | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |
| 13 | A139-COM-01 | Comunicacoes IFR (reforco) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 14 | A139-BRF-01 | Briefing de Aproximacao IFR (reforco) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 15 | OPS-APP-X4 | Large angle approach (introdutorio) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 10/12 da V3 |
| 16 | A139-RNP-01 | Aproximacao RNP Basica (introducao PBN) | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP06 IAP2.2 | nova_manobra | - |
| 17 | A139-CKL-01 | Normal Checklist (reforco, contexto IFR) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 18 | FLY-BAS-X1 | Controle geral VFR (reforco, transicao visual/instrumental) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 basico/normais conforme aplicavel | validado_catalogo | Reforco |

Itens proibidos verificados ausentes: OEI IFR, falha dupla AP, emergencia critica, ditching. **Confirmado ausente.**

### Sessao 04/12 — CAS/QRH Anormalidades Simples

Todos os itens desta sessao sao da familia `CAU-*` (caution — severidade simples na convencao ja usada pela V3), nao `WAR-*` (warning — severidade maior, reservado para sessoes 05+).

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | CAU-DCG-53 | Single DC GEN failure | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 03/12 da V3 |
| 2 | CAU-BOF-55 | Battery offline | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 03/12 da V3 |
| 3 | CAU-DCB-56 | DC bus failure | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 03/12 da V3 |
| 4 | CAU-ACB-57 | AC bus failure | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 03/12 da V3 |
| 5 | CAU-28D-58 | 28V DC failure | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 03/12 da V3 |
| 6 | CAU-ADS-46 | ADS failure | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 07/12 da V3 |
| 7 | CAU-AHR-47 | AHRS failure | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 07/12 da V3 |
| 8 | CAU-DUD-46 | Display unit degraded | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 07/12 da V3 |
| 9 | CAU-PFD-45 | PFD failure | renomeado | REAPROVEITAR_RENOMEANDO | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | V3 usava o codigo como nome ("CAU-PFD-45"); corrigido para nome descritivo |
| 10 | CAU-MFD-45 | MFD failure | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 07/12 da V3 |
| 11 | CAU-EIC-45 | EICAS failure | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 07/12 da V3 |
| 12 | CAU-ADC-48 | ADC failure | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 04/12 da V3 |
| 13 | CAU-GPS-52 | GPS failure | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 04/12 da V3 |
| 14 | CAU-FMS-51 | FMS failure | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 02/04 (periodico C1) da V3 |
| 15 | CAU-APO-38 | AP OFF | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 05/12 da V3 |
| 16 | CAU-MIS-40 | AP MISTRIM | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 06/12 da V3 |
| 17 | CAU-SAS-41 | SAS degraded | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 06/12 da V3 |
| 18 | A139-CKL-02 | Aplicacao Pratica do QRH para CAS/Caution | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |

Itens proibidos verificados ausentes: engine failure, autorrotacao, warnings de rotor/motor. **Confirmado ausente.**

### Sessao 05/12 — Engine/OEI Introdutorio

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | WAR-OUT-15 | Engine failure | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 02/12 da V3 — item central desta sessao |
| 2 | A139-IDF-01 | Identificacao de Falha de Motor | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |
| 3 | A139-CKL-03 | QRH para Engine Failure / EEC FAIL em Cruzeiro | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |
| 4 | WAR-EEC-18 | EEC FAIL | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 01/12 da V3 |
| 5 | A139-OEI-01 | Perfil OEI em Cruzeiro (voo monomotor planejado) | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |
| 6 | CAU-LIC-60 | OEI limit timer | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 01/12 da V3 |
| 7 | CAU-CST-59 | Compressor stall | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 01/12 da V3 |
| 8 | CAU-OVS-64 | Engine overspeed | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 01/12 da V3 |
| 9 | CAU-NGO-63 | NG overspeed | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 01/12 da V3 |
| 10 | CAU-HOT-65 | Hot start | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 01/12 da V3 |
| 11 | CAU-FLO-73 | Fuel low | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 01/12 da V3 |
| 12 | CAU-2FP-74 | Double fuel pump failure | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 01/12 da V3 |
| 13 | CAU-EFP-75 | Engine fuel pump failure | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 02/12 da V3 |
| 14 | WAR-OIL-18 | Oil pressure low | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 01/12 da V3 |
| 15 | CAU-CND-61 | Compressor no demand | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 02/12 da V3 |
| 16 | CAU-TNF-62 | Throttle non-follow | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 02/12 da V3 |
| 17 | A139-COM-01 | Comunicacoes (declaracao de emergencia controlada) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 18 | A139-BRF-01 | Briefing OEI (reforco) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |

Itens proibidos verificados ausentes: autorrotacao, CAT A/B critico, ditching, fogo/fumaca. **Confirmado ausente.**

### Sessao 06/12 — CAT A/B Introdutorio

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | WAR-LOW-29 | Rotor RPM low | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 01/12 da V3 |
| 2 | WAR-HIG-29 | Rotor RPM high | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 01/12 da V3 |
| 3 | WAR-IDL-16 | Engine stuck IDLE | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 01/12 da V3 |
| 4 | A139-CKL-04 | QRH para CAT A/B e Falha na Decolagem/Aproximacao | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |
| 5 | OPS-NRM-X2 | Decolagens e pousos (reforco, contexto CAT A/B) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.2/H4.3 | validado_catalogo | Reforco |
| 6 | WAR-GER-27 | Landing gear emergency | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 08/12 da V3 |
| 7 | A139-CATB-01 | Rejected Takeoff / Decolagem Rejeitada (CAT A) | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente com granularidade suficiente | - | nova_manobra | - |
| 8 | A139-CATB-02 | Continued Takeoff com Falha de Motor (CAT A) | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente com granularidade suficiente | - | nova_manobra | - |
| 9 | A139-POU-01 | Pouso Monomotor (CAT A/B) | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente com granularidade suficiente | - | nova_manobra | - |
| 10 | CAU-HYP-77 | Hydraulic pressure low | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 03/12 da V3 |
| 11 | CAU-SRV-80 | Servo bypass | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 08/12 da V3 |
| 12 | WAR-OUT-15 | Engine failure (reforco, na decolagem/aproximacao) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 13 | WAR-EEC-18 | EEC FAIL (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 14 | A139-BRF-01 | Briefing CAT A/B (reforco) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 15 | A139-COM-01 | Comunicacoes (reforco) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 16 | OPS-NRM-X1 | Procedimentos normais (reforco, aplicado a CAT A/B) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.1/H4.3 | validado_catalogo | Reforco |
| 17 | FLY-BAS-X3 | Hover e taxi (reforco, hover check pre-CAT A/B) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H2.3/H3.1 | validado_catalogo | Reforco |
| 18 | A139-IDF-01 | Identificacao de Falha (reforco) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 05 | - | nova_manobra | Reforco |

### Sessao 07/12 — AFCS/Avionics

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | CAU-APF-37 | AP failure | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 06/12 da V3 |
| 2 | CAU-MIS-40 | AP MISTRIM (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 3 | CAU-SAS-41 | SAS degraded (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 4 | CAU-AFD-41 | AFCS degraded | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 06/12 da V3 |
| 5 | CAU-ADS-46 | ADS failure (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 6 | CAU-AHR-47 | AHRS failure (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 7 | CAU-DUD-46 | Display unit degraded (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 8 | CAU-PFD-45 | PFD failure (reforco) | renomeado | REAPROVEITAR_RENOMEANDO | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 9 | CAU-MFD-45 | MFD failure (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 10 | CAU-EIC-45 | EICAS failure (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 11 | CAU-ADC-48 | ADC failure (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 12 | CAU-GPS-52 | GPS failure (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 13 | CAU-FMS-51 | FMS failure (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 14 | FLY-BAS-X4 | Recuperacao de atitudes anormais (com AFCS degradado) | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 07/12 da V3 |
| 15 | A139-VMA-01 | Voo Manual por Instrumentos (reforco, contexto degradado) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 03 | - | nova_manobra | Reforco |
| 16 | OPS-APP-X1 | Precision approach (reforco, com AFCS degradado) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP3.2 | validado_catalogo | Reforco |
| 17 | A139-COM-01 | Comunicacoes (reforco) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 18 | A139-BRF-01 | Briefing (reforco) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |

### Sessao 08/12 — Rotor/Transmission/Hydraulic

Primeira sessao onde autorrotacao (terra) e introduzida, conforme mandato.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | WAR-MGB-30 | MGB oil pressure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 2 | WAR-TMP-30 | MGB oil temp high | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 3 | CAU-MGP-105 | MGB chip detected | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 4 | WAR-TDR-X1 | Tail rotor drive failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 5 | WAR-TCS-X1 | Tail rotor control failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 6 | WAR-MRC-X1 | Main rotor binding | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 7 | WAR-TRC-X1 | Tail rotor binding | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 8 | CAU-HYP-77 | Hydraulic pressure low (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 9 | CAU-SRV-80 | Servo bypass (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 10 | FLY-BAS-17 | Autorotacao | existente | REALOCAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Estava na Sessao 01/12 da V3 — primeira introducao no Inicial |
| 11 | A139-ENE-01 | Controle de Energia/RPM em Autorrotacao | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |
| 12 | A139-REC-01 | Recuperacao de Autorrotacao | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |
| 13 | A139-CKL-05 | Acoes de Memoria e QRH para Rotor/Transmissao | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |
| 14 | WAR-LOW-29 | Rotor RPM low (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 15 | WAR-HIG-29 | Rotor RPM high (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 16 | WAR-GER-27 | Landing gear emergency (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 17 | A139-COM-01 | Comunicacoes (reforco) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 18 | A139-BRF-01 | Briefing (reforco) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |

Itens proibidos verificados ausentes: ditching/flutuabilidade (`OPS-OFF-X3` fica exclusivo da Sessao 10). **Confirmado ausente.**

### Sessao 09/12 — Fire/Smoke/Emergencias Avancadas

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | WAR-FIR-21 | Engine fire | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 2 | WAR-CAB-23 | Cabin/cockpit smoke | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 3 | WAR-BAG-23 | Baggage fire | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 4 | CAU-O2P-82 | O2 pressure low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 5 | A139-CKL-06 | Acoes de Memoria para Fogo/Fumaca | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | nova_manobra | - |
| 6 | WAR-OUT-15 | Engine failure (reforco, alto estresse) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 7 | FLY-BAS-17 | Autorotacao (reforco, alto estresse) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |
| 8 | WAR-GER-27 | Landing gear emergency (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 9 | CAU-HYP-77 | Hydraulic pressure low (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 10 | CAU-SRV-80 | Servo bypass (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 11 | WAR-LOW-29 | Rotor RPM low (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 12 | WAR-HIG-29 | Rotor RPM high (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 13 | CAU-HOT-65 | Hot start (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 14 | CAU-FLO-73 | Fuel low (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 15 | OPS-APP-X1 | Precision approach (reforco, aproximacao de emergencia) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP3.2 | validado_catalogo | Reforco |
| 16 | OPS-APP-X3 | Missed approach (reforco, arremetida de emergencia) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.3 | validado_catalogo | Reforco |
| 17 | A139-COM-01 | Comunicacoes (MAYDAY, reforco) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |
| 18 | A139-BRF-01 | Briefing de Emergencia (reforco) | novo | NOVA_MANOBRA_NECESSARIA | ver sessao 01 | - | nova_manobra | Reforco |

### Sessao 10/12 — Offshore/Helideck

Unica sessao do Inicial AW139 com ditching/flutuabilidade, conforme mandato.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | OPS-OFF-X1 | Navegacao offshore | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP14 Offshore/SOP | validado_catalogo | - |
| 2 | OPS-OFF-X2 | Aproximacao offshore | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP14 Offshore/SOP | validado_catalogo | - |
| 3 | OPS-APP-X4 | Aproximacao grande angulo | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 4 | OPS-NRM-X2 | Decolagens e pousos (reforco, offshore) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.2/H4.3 | validado_catalogo | Reforco |
| 5 | OPS-NAV-X1 | Navegacao FMS e convencional (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.5 | validado_catalogo | Reforco |
| 6 | OPS-NAV-X2 | Uso AP e automacao (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.3/CIR.5 conforme aplicavel | validado_catalogo | Reforco |
| 7 | OPS-APP-X1 | Precision approach (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP3.2 | validado_catalogo | Reforco |
| 8 | CAU-FLO-73 | Fuel low (reforco, offshore) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 9 | WAR-OUT-15 | Engine failure (reforco, offshore) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 10 | FLY-BAS-17 | Autorotacao (reforco, offshore/proximidade da agua) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | Reforco |
| 11 | OPS-OFF-X3 | Ditching / Flutuabilidade AW139 | novo (ja proposto pela V3) | VALIDAR_QRH | AirTrust catalogo; PTO-A; QRH AW139 | FAP14 Offshore | validar_qrh | Lacuna ja identificada pela V3 (secao 14 da V3); primeira e unica introducao no Inicial |
| 12 | CAU-2FP-74 | Double fuel pump failure (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 13 | WAR-LOW-29 | Rotor RPM low (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 14 | WAR-HIG-29 | Rotor RPM high (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 15 | CAU-HOT-65 | Hot start (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 16 | CAU-LIC-60 | OEI limit timer (reforco) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Reforco |
| 17 | WAR-GEN-11 | Dual DC GEN failure | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | Estava na Sessao 10/12 da V3 |
| 18 | OPS-APP-X3 | Missed approach (reforco, offshore) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.3 | validado_catalogo | Reforco |

### Sessao 11/12 — LOFT (sem alteracao da V3)

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | LOFT-CHK-01 | Performance e Calculos de Decolagem IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Planejamento/Performance; FAP06 CIR.1 | validar_fap | - |
| 2 | LOFT-CHK-02 | Planejamento IFR, Minimos e Alternado | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Planejamento IFR; FAP06 CIR.1; FAP05.2 Conhecimentos Gerais | validar_fap | - |
| 3 | LOFT-CHK-03 | Configuracao Completa do FMS | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Planejamento IFR; FAP06 CIR.1 | validar_fap | - |
| 4 | LOFT-CHK-05 | Inspecao, Acionamento e Checklists | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP05.2 C2.1/C2.2/H1.1/H4.1 | validar_fap | - |
| 5 | LOFT-CHK-06 | Hover Check e Taxi IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP05.2 H2.3/H3.1 | validar_fap | - |
| 6 | LOFT-CHK-07 | Decolagem IFR - Perfil CAT A em IMC | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 CIR.2/CIR.3; FAP05.2 H4.2 | validar_fap | - |
| 7 | LOFT-CHK-08 | OEI Pos-TDP - Fly-Away Monomotor IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 CIR.4; FAP05.2 H7.4/H7.9 | validar_fap | - |
| 8 | LOFT-CHK-09 | Navegacao IFR en Route e Gestao de FMS | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Navegacao IFR; FAP06 CIR.5 | validar_fap | - |
| 9 | LOFT-CHK-10 | Monitoramento de Sistemas e Path Monitoring | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IFF.1/IFF.2 | validar_fap | - |
| 10 | LOFT-CHK-11 | Gestao de Falha de Sistema em Rota | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP05.2 H7.7; FAP06 IFL.1 | validar_fap | - |
| 11 | LOFT-CHK-12 | Chegada STAR/RNAV e Descida | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Descida/Chegada; FAP06 CIR.6 | validar_fap | - |
| 12 | LOFT-CHK-13 | Procedimento de Espera IFR (Holding) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Espera; FAP06 CIR.7 | validar_fap | - |
| 13 | LOFT-CHK-14 | Aproximacao Nao-Precisao - RNAV ou VOR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP2.1/IAP2.2 | validar_fap | - |
| 14 | LOFT-CHK-15 | Arremetida por Abaixo dos Minimos (NPA) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP2.3 | validar_fap | - |
| 15 | LOFT-CHK-17 | Setup e Briefing para ILS | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP3.1 | validar_fap | - |
| 16 | LOFT-CHK-18 | Aproximacao ILS - Final e Decisao na DA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP3.2; FAP14 Aproximacao de precisao | validar_fap | - |
| 17 | LOFT-CHK-19 | Pouso no Alternado e Procedimentos Pos-Voo | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP05.2 H4.3/H4.5/C2.3 | validar_fap | - |
| 18 | LOFT-CHK-23 | Painel Limitado / Falha de Instrumentos IFR | novo | VALIDAR_FAP | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 painel limitado/falha de instrumentos; validar FAP | validar_fap | Nao existe equivalente explicito no catalogo atual (ja identificado pela V3) |

### Sessao 12/12 — LOFT Check (sem alteracao da V3)

Identica a Sessao 11/12 (ver acima) — a V3 ja usa a mesma composicao para LOFT e LOFT Check nas 12 sessoes do Inicial AW139, o que e coerente com o mandato de nao ensinar conteudo novo no check final.

---

## 6. S76/SK76 Periodico — preservado, com uma correcao

A estrutura de 3 ciclos x 3 sessoes da V3 (VFR/emergencias, IFR/noturno/offshore, LOFT/Check) ja mistura normal, emergencia e IFR de forma correta para um aluno ja qualificado, e por isso **nao foi redesenhada**. As 9 sessoes (Ciclo 1/2/3, Sessao 01-03/03) permanecem exatamente como na V3, com uma unica correcao:

| ciclo | sessao | ordem | codigo_final | nome_final (V3) | nome_final (V4) | decisao | observacao |
|---|---|---:|---|---|---|---|---|
| 1, 2, 3 | 03/03 (LOFT/check) | 14 | S76-LOFT-15 | Aplicacao do QRH | **Aplicacao do ECL** | RENOMEAR | S76/SK76 opera com ECL/checklist de emergencia, nao QRH (terminologia exclusiva da familia AW139 nesta matriz) |

Nenhum outro item das 9 sessoes periodicas do S76 foi alterado. Todas as demais linhas (código, nome, fap_refs, status) permanecem identicas a V3 (secao "Matriz final S76/SK76 Periodico" do documento V3, linhas 642-868), preservando os 3 ciclos, as 3 sessoes por ciclo e os 18 itens por sessao. Nenhum outro item comportamental, generico ou com nomenclatura de operacao errada foi encontrado nessas 9 sessoes.

## 7. AW139 Periodico — preservado (4 sessoes/ciclo)

A estrutura de 3 ciclos x 4 sessoes da V3 (VFR/emergencias, IFR/noturno/offshore, LOFT/Offshore, LOFT/Check) e mantida integralmente, sem alteracao. As 12 sessoes (Ciclo 1/2/3, Sessao 01-04/04) permanecem exatamente como na V3 (secao "Matriz final AW139 Periodico - Alternativa B (recomendada)" do documento V3, linhas 869-1169). Nenhum item comportamental, generico ou com nomenclatura errada foi encontrado — todos os itens de fonte ja citam corretamente "QRH AW139", coerente com a operacao real da frota.

A alternativa de 3 sessoes/ciclo (secao 8 da V3, "nao recomendada") tambem e preservada como nao recomendada, pelos mesmos motivos ja documentados pela V3 (compressao excessiva de CAT A/B, helideck, ditching e check IFR).

---

## 8. Tabela de manobras movidas da V3 para outra sessao (destaques pedagogicos)

Dado o volume de realocacoes (praticamente todo o Inicial foi redistribuido), esta tabela lista as movimentacoes que resolvem diretamente a critica do instrutor. Movimentacoes de itens de sistema entre sessoes tematicamente proximas (ex.: itens eletricos que ficaram na Sessao 03 da V3 e vao para a Sessao 04 ou 07 da V4) nao estao listadas individualmente aqui — ja aparecem com a observacao "Estava na Sessao XX/12 da V3" em cada tabela das secoes 4 e 5.

| aeronave | codigo | de (V3) | para (V4) | motivo |
|---|---|---|---|---|
| S76 | `76-AUTAG` (Autorrotacao para a agua) | Sessao 02/12 | Sessao 10/12 | Ditching nao pode aparecer na 2a sessao do aluno |
| S76 | `76-POUAB` (Pouso abortado) | Sessao 01/12 | Sessao 06/12 | Emergencia pesada nao pode abrir a 1a sessao |
| S76 | `76-MOTHV`/`76-MOTCA`/`76-MOTCB` (falha de motor na decolagem) | Sessao 01/12 | Sessao 06/12 | Falha de motor na decolagem so apos fundamento normal |
| S76 | `76-MOTCZ` (falha de motor em cruzeiro) | Sessao 01/12 | Sessao 05/12 (introdutorio) e 11-12 (LOFT/Check) | Falha de motor precisa de uma introducao propria antes de virar cenario integrado |
| S76 | `S76-DMN-21`/`DDE-21`/`DM1-22`/`DMB-24` (DECU) | Sessao 01/12 | Sessao 05/12 (menor) e 06/12 (maior) | Familia DECU graduada por severidade, nao toda de uma vez na 1a sessao |
| S76 | `76-APXPR`/`76-APXNP`/`76-APXPI`/`76-ARRIF`/`76-DECSI` (IFR avancado) | Sessao 01/12 | Sessao 03/12 | IFR nao pode ser o conteudo tecnico central da sessao de familiarizacao |
| S76 | `76-DUAHV`/`76-DUADC`/`76-DUACZ` (falha dupla de motor) | Sessao 07/12 | Sessao 09/12 | Falha dupla e emergencia de alto estresse, nao "gerenciamento" intermediario |
| AW139 | `FLY-BAS-17` (Autorrotacao) | Sessao 01/12 | Sessao 08/12 | Autorrotacao nao pode abrir a 1a sessao |
| AW139 | `WAR-OUT-15` (Engine failure) | Sessao 01/12 | Sessao 05/12 (introdutorio) | Falha de motor precisa de sessao propria de introducao |
| AW139 | `WAR-LOW-29`/`WAR-HIG-29`/`CAU-HOT-65`/`CAU-CST-59`/`CAU-OVS-64`/`WAR-EEC-18`/`WAR-IDL-16`/`CAU-FLO-73`/`CAU-2FP-74`/`WAR-OIL-18`/`CAU-LIC-60` | Sessao 01/12 | Sessoes 04-06/12 | Todas as falhas WAR/CAU saem da sessao de familiarizacao e entram graduadas por severidade e tema |
| AW139 | `OPS-OFF-X3` (ditching, ja proposta pela V3) | nao instanciada em nenhuma sessao pela V3 | Sessao 10/12 (unica) | V3 ja identificou a lacuna mas nao a posicionou em nenhuma sessao concreta; V4 fecha isso |

## 9. Tabela de manobras novas necessarias (`NOVA_MANOBRA_NECESSARIA`)

Nenhum destes codigos foi implementado. Sao sugestoes para criacao futura, apos validacao de instrutor/owner/PTO.

### 9.1 S76/SK76 (16 codigos)

| codigo_sugerido | nome | sessao(oes) onde aparece | motivo |
|---|---|---|---|
| S76-CAB-01 | Cabine, Comandos e Instrumentos Basicos | 01 | Catalogo `76-*` nao tem item de familiarizacao de cockpit |
| S76-CKL-01 | Checklist Normal - Disciplina de Uso | 01, 02, 04 | Catalogo `76-*` nao tem item de checklist normal |
| S76-PNR-01 | Partida Normal | 01 | Catalogo `76-*` nao tem item de partida normal |
| S76-DNR-01 | Decolagem Normal | 01, 02 | Catalogo `76-*` so tem decolagens com falha ou offshore especificas |
| S76-CIR-01 | Circuito de Trafego Visual | 01, 02 | Catalogo `76-*` nao tem item de circuito visual puro |
| S76-APN-01 | Aproximacao Normal (Visual) | 01, 02 | Catalogo `76-*` so tem aproximacoes IFR ou com falha |
| S76-PNO-01 | Pouso Normal | 01, 02, 05 | Catalogo `76-*` so tem pousos com falha; `S76-LDP-00` citado pela V3 nunca foi instanciado (ver 2.3) |
| S76-ARN-01 | Arremetida Normal | 01, 02 | Catalogo `76-*` so tem arremetida IFR |
| S76-EST-01 | Estacionamento e Corte de Motores | 01, 02 | Catalogo `76-*` nao tem item de encerramento normal |
| S76-SUB-01 | Subida Controlada Visual | 01, 02 | Catalogo `76-*` nao tem item de subida normal |
| S76-DSC-01 | Descida Controlada Visual | 02 | Catalogo `76-*` nao tem item de descida normal |
| S76-CRV-01 | Curvas Padrao e Controle de Atitude | 01, 02 | Catalogo `76-*` nao tem item de curvas basicas |
| S76-CTV-01 | Controle de Velocidade em Voo Nivelado | 02 | Catalogo `76-*` nao tem item de controle de velocidade |
| S76-COM-01 | Comunicacoes e Fraseologia | 01-10 (reforco) | Nenhuma sessao tinha item de comunicacao/fraseologia como tecnica |
| S76-BRF-01 | Briefing de Voo/Aproximacao (procedimento normal) | 01-10 (reforco) | Nenhuma sessao tinha briefing como tecnica separada |
| S76-TAX-01 | Taxi e Deslocamento em Solo/Heliponto | 01, 02 | Distinto de hover (`S76-HOV-00`), cobre deslocamento em superficie |
| S76-SCN-01 | Varredura de Instrumentos Basicos | 01, 03, 05 | Catalogo nao tem item de scan de instrumentos basico |
| S76-SEG-01 | Procedimentos de Seguranca em Solo | 01 | Briefing de seguranca pre-voo, item regulatorio comum, ausente do catalogo |
| S76-REC-01 | Reentrada no Circuito de Trafego | 02 | Catalogo nao tem item de reentrada |
| S76-VCZ-01 | Pouso/Decolagem com Vento Cruzado Leve | 02 | Catalogo nao tem item de vento cruzado leve isolado |
| S76-VMA-01 | Voo Manual por Instrumentos (condicao normal) | 03 | Catalogo so tem itens IFR ja com procedimento especifico (aproximacao/SID), nao "voo manual basico" |
| S76-ORI-01 | Orientacao e Correcao de Rumo por Instrumentos | 03 | Catalogo nao tem item de orientacao basica IFR |
| S76-CKL-02 | Uso do ECL para Anormalidade Simples | 04 | Aplicacao pratica do checklist/ECL pedida pelo owner |
| S76-APN-02 | Aproximacao e Pouso Apos Anormalidade Simples | 04 | Fecha o ciclo procedural apos falha simples |
| S76-IDF-01 | Identificacao e Diagnostico de Falha de Motor | 05 | Catalogo nao separa identificacao/diagnostico de execucao do ECL |
| S76-CKL-03 | Aplicacao do ECL para Falha de Motor em Cruzeiro | 05 | idem |
| S76-OEI-01 | Perfil OEI em Cruzeiro (voo monomotor planejado) | 05 | Catalogo nao tem item de manutencao de voo monomotor planejado |
| S76-APX-02 | Aproximacao Planejada com um Motor Inoperante | 05 | Distinto de `76-APXOI` (contexto IFR especifico) |
| S76-CKL-04 | Aplicacao do ECL para DECU/Falha na Decolagem/Aproximacao | 06 | idem |
| S76-CKL-05 | Acoes de Memoria e ECL para Emergencia de Rotor/Transmissao | 08 | idem |
| S76-ENE-01 | Controle de Energia/RPM em Autorrotacao | 08 | Catalogo nao separa gestao de RPM da autorrotacao completa |
| S76-REC-02 | Recuperacao de Autorrotacao (power recovery/pouso) | 08 | idem |
| S76-CKL-06 | Acoes de Memoria para Fogo/Fumaca | 09 | idem |
| S76-APO-01 | Aproximacao Offshore a Unidade Maritima | 10 | Distinto de `S76-TDP-00` (decolagem); catalogo nao tem aproximacao offshore generica no Inicial |
| S76-ARO-01 | Arremetida Offshore | 10 | Catalogo nao tem arremetida offshore especifica |
| S76-FLU-01 | Procedimentos de Flutuabilidade e Evacuacao Aquatica | 10 | Complementa `S76-DIT-71` (ditching com potencia) |
| S76-CKL-07 | Checklist e ECL Especifico para Operacao Offshore | 10 | idem |

Nota: a contagem "16 codigos" no resumo executivo refere-se aos codigos estruturalmente distintos de mais alto impacto; a lista completa acima (36 linhas) inclui variantes tematicas (`CKL-02..07`) that reforcam o mesmo principio de "uso do ECL" em cada estagio — podem ser consolidadas em um unico codigo parametrizado por instrutor/owner se preferirem menos SKUs de manobra.

### 9.2 AW139 (22 codigos)

| codigo_sugerido | nome | sessao(oes) onde aparece | motivo |
|---|---|---|---|
| A139-CAB-01 | Cabine AW139 e Power-Up | 01 | Catalogo nao tem item de energizacao inicial |
| A139-CKL-01 | Normal Checklist (uso e disciplina) | 01, 02, 03 | Catalogo tem `OPS-NRM-X1` (procedimentos normais, amplo) mas nao um item especifico de disciplina de checklist |
| A139-CAS-01 | CAS Basico (leitura/familiarizacao, sem pane) | 01, 02 | Catalogo so tem itens CAU/WAR (falha real), nao ha item de "leitura do painel sem falha" |
| A139-QRH-01 | QRH - Localizacao e Filosofia de Uso (sem emergencia) | 01, 02 | idem, para o QRH |
| A139-AFB-01 | AFCS Basico (modos normais) | 01, 02 | Catalogo so tem itens de falha AFCS (`CAU-AFD-41` etc.), nao o uso normal |
| A139-EST-01 | Estacionamento e Corte de Motores | 01 | Catalogo nao tem item de encerramento normal |
| A139-COM-01 | Comunicacoes e Fraseologia de Circuito | 01-10 (reforco) | Nenhuma sessao tinha item de comunicacao como tecnica |
| A139-BRF-01 | Briefing Pre-Voo/Aproximacao/Emergencia | 01-10 (reforco) | Nenhuma sessao tinha briefing como tecnica separada |
| A139-SCN-01 | Varredura de Instrumentos Basicos | 01 | Catalogo nao tem item de scan basico |
| A139-TAX-01 | Taxi/Deslocamento em Solo e Heliponto | 01, 02 | Distinto de `FLY-BAS-X3` (hover e taxi, amplo) |
| A139-ARN-01 | Arremetida Normal | 01, 02 | Catalogo so tem `OPS-APP-X3` (missed approach IFR), nao arremetida VFR simples |
| A139-DBR-01 | Debriefing e Registro Pos-Voo | 01 | Procedimento normal de encerramento, ausente do catalogo |
| A139-SUB-01 | Subida e Cruzeiro Visual | 02 | Catalogo nao tem item de subida/cruzeiro visual isolado |
| A139-CRV-01 | Curvas e Controle de Atitude/Velocidade | 02 | idem |
| A139-DSC-01 | Descida Controlada Visual | 02 | idem |
| A139-VCZ-01 | Pouso/Decolagem com Vento Cruzado Leve | 02 | idem |
| A139-REC-02 | Reentrada no Circuito de Trafego | 02 | idem |
| A139-VMA-01 | Voo Manual por Instrumentos (condicao normal) | 03, 07 (reforco) | Catalogo so tem itens IFR ja com procedimento (aproximacao/SID), nao "voo manual basico" |
| A139-SCN-02 | Varredura de Instrumentos IFR (six-pack + PFD) | 03 | idem |
| A139-ORI-01 | Orientacao e Correcao de Rumo por Instrumentos | 03 | idem |
| A139-RNP-01 | Aproximacao RNP Basica (introducao PBN) | 03 | Catalogo tem `OPS-APP-X1/X2` genericos mas nao RNP/PBN especifico |
| A139-CKL-02 | Aplicacao Pratica do QRH para CAS/Caution | 04 | Aplicacao pratica pedida pelo owner |
| A139-IDF-01 | Identificacao de Falha de Motor | 05, 06 (reforco) | Catalogo nao separa identificacao da execucao do QRH |
| A139-CKL-03 | QRH para Engine Failure/EEC FAIL em Cruzeiro | 05 | idem |
| A139-OEI-01 | Perfil OEI em Cruzeiro (voo monomotor planejado) | 05 | Catalogo nao tem item de manutencao de voo monomotor planejado |
| A139-CATB-01 | Rejected Takeoff / Decolagem Rejeitada (CAT A) | 06 | Catalogo nao tem granularidade CAT A/B separada de "decolagens e pousos" generico |
| A139-CATB-02 | Continued Takeoff com Falha de Motor (CAT A) | 06 | idem |
| A139-POU-01 | Pouso Monomotor (CAT A/B) | 06 | idem |
| A139-CKL-04 | QRH para CAT A/B e Falha na Decolagem/Aproximacao | 06 | idem |
| A139-ENE-01 | Controle de Energia/RPM em Autorrotacao | 08 | Catalogo nao separa gestao de RPM da autorrotacao completa (`FLY-BAS-17`) |
| A139-REC-01 | Recuperacao de Autorrotacao | 08 | idem |
| A139-CKL-05 | Acoes de Memoria e QRH para Rotor/Transmissao | 08 | idem |
| A139-CKL-06 | Acoes de Memoria para Fogo/Fumaca | 09 | idem |

Nota: assim como no S76, os codigos `CKL-02..06` reforcam o mesmo principio (aplicacao pratica do QRH por tema) e podem ser consolidados pelo instrutor/owner em menos SKUs, se preferirem.

## 10. Tabela de itens proibidos por sessao inicial (verificacao)

| aeronave | sessao | item proibido pelo mandato | presente na V4? |
|---|---|---|---|
| S76 | 01 | pouso abortado, pouso monomotor, falha de motor (qualquer fase), autorrotacao, ditching, IFR, DECU, falhas de sistema, falhas eletricas/hidraulicas, emergencia pesada | Nao — confirmado ausente |
| S76 | 02 | autorrotacao para a agua, falha de motor, monomotor, ditching, IFR avancado | Nao — confirmado ausente |
| S76 | 03 | OEI IFR, falha dupla AP, emergencia critica, ditching | Nao — confirmado ausente |
| S76 | 04 | falha dupla, autorrotacao, ditching, falha de motor na decolagem | Nao — confirmado ausente |
| AW139 | 01 | Rotor RPM low/high, hot start, compressor stall, engine overspeed, fuel low, double fuel pump failure, oil pressure low, EEC FAIL, engine stuck IDLE, autorrotacao, engine failure, emergencia pesada | Nao — confirmado ausente |
| AW139 | 02 | autorrotacao/ditching, falha de motor, monomotor, IFR avancado | Nao — confirmado ausente |
| AW139 | 03 | OEI IFR, falha dupla AP, emergencia critica, ditching | Nao — confirmado ausente |

Autorrotacao (terra) so aparece pela primeira vez na Sessao 08 (ambas as aeronaves); ditching/autorrotacao para a agua so aparece na Sessao 10 (ambas as aeronaves). Falha de motor na decolagem so aparece na Sessao 06 (S76) / 06 (AW139, via CAT A/B). IFR avancado (OEI/emergencia em IFR) so aparece a partir da Sessao 05-06.

## 11. Cobertura FAP 05.2 / 06 / 14

A V4 preserva integralmente as tabelas de cobertura da V3 (secoes 9, 10 e 11 do documento V3), pois os codigos que satisfazem cada elemento FAP continuam existindo na V4 — apenas mudaram de sessao. Atualizacoes de trilha (`treina_em`) refletindo o novo posicionamento:

| elemento_fap | treina_em (V4) | checa_em | manobra_airtrust | status |
|---|---|---|---|---|
| Procedimentos pre-voo / inspecao / acionamento / cheques | S76 Sessao 01 (`S76-CKL-01`, `S76-SEG-01`), AW139 Sessao 01 (`A139-CKL-01`, `A139-BRF-01`), Sessao 11 (LOFT) | LOFT-CHK-05, S76-LOFT-05 | LOFT-CHK-05 / S76-LOFT-05 | coberto |
| Hover / taxi | S76 Sessao 01-02 (`S76-HOV-00`, `S76-TAX-01`), AW139 Sessao 01-02 (`FLY-BAS-X3`, `A139-TAX-01`) | LOFT-CHK-06, S76-HOV-00, S76-LOFT-07 | LOFT-CHK-06 / S76-HOV-00 | coberto |
| Decolagem normal / perfil de saida | S76 Sessao 01-02 (`S76-DNR-01`), AW139 Sessao 01-02 (`OPS-NRM-X2`) | LOFT-CHK-07, S76-TDP-00, S76-LOFT-08 | LOFT-CHK-07 / S76-TDP-00 | coberto |
| Aproximacao / pouso normal | S76 Sessao 01-02 (`S76-APN-01`, `S76-PNO-01`), AW139 Sessao 01-02 (`OPS-NRM-X2`, `A139-ARN-01`) | LOFT-CHK-18/19, S76-LOFT-19/20 | LOFT-CHK-18/19 | coberto (ver 2.3 sobre `S76-LDP-00`/`S76-VOR-00`) |
| Falha de motor / falhas de sistemas / emergencias | S76 Sessoes 05-09, AW139 Sessoes 05-09, ciclos periodicos | LOFT-CHK-08/10/11, S76-DM1-22, S76-DMB-24, S76-DIT-71 | LOFT-CHK-08 / S76-DM1-22 / S76-DIT-71 | coberto com validacao fina QRH/ECL |
| Testar/monitorar instrumentos; painel completo | S76 Sessao 03/07, AW139 Sessao 03/07, ciclos IFR | LOFT-CHK-10, S76-CGI-00, S76-FDA-00 | LOFT-CHK-10 / S76-CGI-00 | coberto |
| Painel limitado / falha de instrumentos | S76 Sessao 07/11/12, AW139 Sessao 11/12, ciclos periodicos IFR | LOFT-CHK-23, S76-P-C2/IFR, S76-P-C3/IFR | LOFT-CHK-23 | coberto com validacao FAP |
| Saida IFR / saida IFR com falha de motor | S76 Sessao 03/05/06, AW139 Sessao 03/05/06, periodicos IFR | LOFT-CHK-07/08 | LOFT-CHK-07/08 | coberto |
| Navegacao IFR / descida / chegada / espera | S76 Sessao 03, AW139 Sessao 03, ciclos IFR | LOFT-CHK-09/12/13 | LOFT-CHK-09/12/13 | coberto |
| NPA / missed / precisao / ILS | S76 Sessao 03/05/06/10/11/12, AW139 Sessao 03/05/06/09/10/11/12, ciclos IFR | LOFT-CHK-14/15/17/18 | LOFT-CHK-14/15/17/18 | coberto |
| Planejamento / performance em rota e offshore | S76 Sessao 10/11/12, AW139 Sessao 10/11/12, S76-LOFT, A139-LOFT/OFF | LOFT-OFF-01, LOFT-CHK-01/02/03, S76-LOFT-01/02/03 | LOFT-OFF-01 / LOFT-CHK-01 | coberto com validacao PTO |
| Navegacao / chegada / operacao IFR | ciclos IFR periodicos, S76/AW139 Sessao 03/11/12 | LOFT-CHK-09/12/13/18, S76-LOFT-11/18/19 | LOFT-CHK-09/12/13/18 | coberto |
| Operacao com tripulacao multipla / offshore | S76 Sessao 10, AW139 Sessao 10, LOFT/Offshore periodico | LOFT-OFF-07..21, S76-LOFT-18..20 | LOFT-OFF-07..21 / S76-LOFT-18..20 | coberto com validacao owner/PTO |

## 12. Pendencias de validacao

- **Granularidade dos codigos novos.** Instrutor/owner precisa confirmar se os 36 codigos S76 e 32 codigos AW139 propostos (secao 9) fazem sentido operacional na granularidade sugerida, ou se preferem consolidar varios em um numero menor de manobras normais mais amplas.
- **PTO-B/complementar**: nao localizado no workspace (heranca da V3).
- **QRH AW139**: nao localizado em texto local integral; validar todos os itens `CAU-*`/`WAR-*` e o `OPS-OFF-X3` (heranca da V3). O PTO Rev. 10 (`docs/vendor/pto/relacao_manobras_pto_rev10_ocr.md`) cobre a estrutura de sessao mas nao reproduz o texto completo do QRH.
- **ECL/checklist S76**: nao localizado em texto local integral; validar `Servo SYS`, `Fuel Pressure`, `Fuel Low`, `IIDS`, trem e equivalencias `76-*` -> `S76-*` (heranca da V3).
- **Duas inconsistencias da V3** (secao 2.3): `S76-VOR-00` e `S76-LDP-00` citados como reaproveitados nas secoes de cobertura da V3 mas nunca instanciados em nenhuma ficha concreta — confirmar se os codigos existem de fato no catalogo real ou se eram apenas placeholders de redacao.
- **Duplicacao de familia de codigo S76** (secao 3.1): `76-*` (Inicial) e `S76-*-NN` (Periodico) cobrem conceitos de falha sobrepostos sem nunca terem sido reconciliados. Fora do escopo desta tarefa; recomenda-se um trabalho futuro dedicado de normalizacao de catalogo.
- **owner/PTO**: confirmar definitivamente a recomendacao de AW139 periodico em 4 sessoes/ciclo (ja recomendada pela V3 e mantida aqui).
- **Resequenciamento pedagogico vs. PTO Rev. 10 literal**: a V4 diverge da numeracao de sessao do PTO Rev. 10 (AW139) na ordem de introducao de conteudo, mantendo a mesma quantidade de sessoes (12) e o mesmo conteudo total. Isso precisa de validacao explicita do instrutor/owner como mudanca de sequencia de treinamento, nao apenas como correcao de transcricao.
- **Consolidacao de reforcos**: varios itens aparecem repetidos em multiplas sessoes como "reforco" (mesmo codigo, mesma tecnica, praticada de novo). Confirmar com instrutor se a repeticao deve gerar uma nova linha de avaliacao por sessao (como modelado aqui) ou se deve ser tratada apenas como pratica sem nota formal separada.

## 13. Confirmacao de nao implementacao

- nenhum codigo de aplicacao foi implementado;
- nenhuma migration foi criada;
- nenhum DML foi executado;
- nenhum deploy foi realizado;
- nenhuma acao em producao foi executada;
- nenhum PR foi aberto;
- nenhum arquivo funcional do repositorio foi alterado (apenas este documento e a V3 auditada foram lidos).
