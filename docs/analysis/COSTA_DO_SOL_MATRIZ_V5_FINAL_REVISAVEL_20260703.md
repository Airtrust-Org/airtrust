# Costa do Sol / AirTrust - Matriz V5 Final Revisavel 20260703

Status do documento: consolidacao final revisavel para instrutor/owner, unificando V4 (pedagogica), V4.1 (saneamento) e V4.2 (sequenciamento intra-sessao) em uma unica matriz. Nao houve implementacao, DML, migration, deploy, PR, alteracao funcional nem toque em producao. V4, V4.1 e V4.2 permanecem preservadas e intocadas — esta V5 e uma consolidacao de leitura, nao uma substituicao que apaga as camadas anteriores.

Fontes consolidadas:
- `docs/analysis/COSTA_DO_SOL_MATRIZ_V4_PEDAGOGICA_20260703.md` (progressao pedagogica, 18 tecnicas por ficha, origem/decisao/fonte/fap_refs por codigo)
- `docs/analysis/COSTA_DO_SOL_MATRIZ_V4_1_SANEAMENTO_20260703.md` (remocao de itens genericos das 18, renomeacoes CAS/QRH/AFCS, substituicoes tecnicas)
- `docs/analysis/COSTA_DO_SOL_MATRIZ_V4_2_SEQUENCIAMENTO_20260703.md` (ordem de aplicacao intra-sessao, fase de voo, marcador `carater=avaliativo` do LOFT Check)

## 1. Veredito

**GO com ressalvas para revisao operacional com instrutor/owner. NO-GO para implementacao no AirTrust. NO-GO para migration/DML/deploy.**

A V5 e a consolidacao final revisavel: reune a progressao pedagogica correta (V4), livre de itens genericos ocupando linha tecnica (V4.1), com ordem de aplicacao explicita dentro de cada sessao (V4.2). Nenhuma das tres camadas anteriores foi alterada por este documento — a V5 apenas junta o resultado final de cada uma em tabelas unicas por sessao, prontas para leitura e aprovacao humana.

Pendencia de validacao obrigatoria antes de qualquer implementacao: revisao com instrutor S76, instrutor AW139, owner, PTO-A, PTO-B (nao localizado), ECL S76 (nao localizado em texto integral) e QRH AW139 (nao localizado em texto integral), alem da confirmacao final de FAP 05.2/06/14 (ver secao 10).

## 2. Decisoes consolidadas

- 18 tecnicas por ficha, em todas as 24 sessoes do Inicial (S76 e AW139) e em todas as sessoes periodicas.
- 15 NOTECHS fixos fora das 18, conforme `src/react-app/pages/simuladores/fichas/notechs.ts` — nao reabertos, nao recolocados dentro das 18 em nenhuma camada.
- Uma manobra/procedimento tecnico observavel por linha (regra V4.1, secao 3).
- Observacoes e regua de avaliacao das fichas (camada de PDF/UI) preservadas — fora do escopo desta matriz, que trata apenas do conteudo/sequencia das 18 tecnicas.
- Sequencia logica dentro da sessao (V4.2): preparacao -> checklist -> partida/power-up -> taxi/hover -> decolagem -> subida -> cruzeiro/navegacao -> evento/anormalidade compativel com a fase, se houver -> checklist/ECL/QRH -> decisao tecnica -> aproximacao -> arremetida ou pouso -> encerramento.
- Sessao 11 = `LOFT` (treinamento de cenario integrado).
- Sessao 12 = `LOFT Check` (avaliacao final, sem conteudo novo, marcador `carater=avaliativo`).
- AW139 periodico recomendado em 4 sessoes por ciclo (VFR/emergencias; IFR/noturno/offshore; LOFT/Offshore; LOFT/Check) — recomendacao principal confirmada nas tres camadas anteriores.
- S76/SK76 periodico em 3 sessoes por ciclo (VFR/emergencias; IFR/noturno/offshore; LOFT/check).
- CRM/NTS legado (`LOFT-CHK-04/16/20/21/22`, `S76-CRM-01`, `S76-LOFT-12/16/21/22`, `LOFT-OFF-22`, `LOFT-NOT-20/21/22`) substituido por NOTECHS-01..15 nas fichas novas, permanecendo como legado logico (sem hard delete).

## 3. Regras finais das 18 tecnicas

As 18 linhas de cada ficha devem ser manobras/procedimentos tecnicos:
- **tecnicas** — descrevem uma acao de voo, de sistema ou de procedimento, nao um comportamento;
- **observaveis** — o instrutor consegue ver e registrar a execucao;
- **avaliaveis** — tem criterio de nota/resultado tecnico, independente do NOTECHS;
- **associadas a fase de voo, checklist, ECL, QRH, FAP ou SOP especifico** — cada linha tem uma posicao logica no voo, nao e um conceito solto.

Nao podem ser uma das 18 tecnicas: briefing generico; comunicacao generica; debrief; registro; "filosofia" de uso; julgamento; consciencia situacional; workload; coordenacao generica; CRM/NTS; NOTECHS. Esse conteudo pertence ao NOTECHS (comportamento), a observacao/instrucao da sessao (briefing, debrief) ou ao criterio de avaliacao — nunca a uma das 18 linhas.

Consequencia pratica ja aplicada em todas as 24 sessoes do Inicial (secoes 5 e 6): `S76-COM-01`, `S76-BRF-01`, `S76-SEG-01`, `A139-COM-01`, `A139-BRF-01` e `A139-DBR-01` foram removidos das 18 e substituidos por itens tecnicos especificos (`S76-PWR-01`, `S76-PED-01`, `S76-HVT-01`, `S76-STB-01`, `S76-GAR-01`, `S76-INS-01`, `A139-PWR-01`, `A139-FMA-01/02`, `A139-STB-01/02`, `A139-MOD-01`, `A139-HLD-01`) ou por reforco tecnico do item central da propria sessao.

## 4. Regras de sequencia intra-sessao

Ordem obrigatoria dentro de cada sessao, quando aplicavel ao conteudo daquela sessao: preparacao -> checklist -> partida/power-up -> taxi/hover -> decolagem -> subida -> cruzeiro/navegacao -> evento/anormalidade compativel com a fase, se houver -> checklist/ECL/QRH -> decisao tecnica -> aproximacao -> arremetida ou pouso -> encerramento.

Proibido explicitamente, em qualquer sessao: pouso antes de decolagem; QRH/ECL antes do evento; pane sem fase de voo compativel; falha offshore antes de contexto offshore; shutdown/corte antes de pouso; LOFT Check ensinando conteudo novo.

Templates de sequencia por tipo de sessao (detalhados na V4.2, secao 3, reproduzidos aqui como referencia rapida):

| tipo de sessao | sequencia |
|---|---|
| Normal / familiarizacao | Preparacao/cockpit -> checklist -> partida/power-up -> instrumentos/sistemas normais -> taxi/hover -> decolagem -> subida -> cruzeiro/perfil normal -> curvas/perfil -> descida -> aproximacao -> arremetida -> novo circuito/reaproximacao -> pouso -> taxi/estacionamento -> corte/encerramento |
| IFR | Preparacao IFR -> setup FMS/GPS/NAVAID -> checklist -> decolagem/saida IFR -> climb/enroute -> navegacao/intercepcao -> holding, se aplicavel -> aproximacao IFR -> missed approach -> reaproximacao/alternado -> pouso |
| Anormalidade simples | Voo normal estabilizado -> evento/anormalidade -> reconhecimento -> controle da aeronave -> checklist/ECL/QRH -> decisao continuar/retornar/alternar -> preparacao da aproximacao -> aproximacao -> arremetida se instavel -> pouso |
| OEI / motor | Voo normal ate a fase do evento -> falha de motor compativel com a fase -> controle inicial -> identificacao/confirmacao -> acoes imediatas -> ECL/QRH -> perfil OEI -> planejamento -> aproximacao OEI -> arremetida OEI, se aplicavel -> pouso OEI |
| Sistemas | Sequencia de mini-cenarios: estabilizar voo -> inserir falha por familia de sistema -> aplicar checklist/ECL/QRH -> recuperar/decidir -> repetir com outra familia, em ordem crescente de severidade |
| Offshore | Planejamento offshore -> preparacao/checklist -> decolagem -> navegacao para UM -> aproximacao UM -> pouso UM -> decolagem UM -> evento/anormalidade offshore -> checklist/ECL/QRH -> decisao retorno/alternado/ditching -> aproximacao final ou ditching simulado -> encerramento |
| LOFT e LOFT Check | LOFT e treinamento de cenario: pode haver orientacao, pausa pedagogica e repeticao. LOFT Check e avaliacao: mesmo dominio tecnico, sem conteudo novo, carater avaliativo explicito, rastreabilidade FAP 05.2/06/14/PTO |

---

## 5. Matriz final S76/SK76 Inicial — 12 sessoes consolidadas

Cada sessao abaixo ja reflete: base pedagogica (V4), saneamento de itens genericos (V4.1) e ordem de aplicacao com fase de voo (V4.2). Legenda de decisao: `REAPROVEITAR` = codigo e nome sem alteracao; `REAPROVEITAR_RENOMEANDO` = codigo existente, nome ja normalizado; `REALOCAR` = codigo existente movido de outra sessao/ficha; `VALIDAR_ECL`/`VALIDAR_QRH`/`VALIDAR_FAP` = pendente de validacao com instrutor/owner; `NOVA_MANOBRA_NECESSARIA` = codigo sugerido, nao implementado.

### Sessao 01/12 — Familiarização / Checklist Normal / Voo Normal Básico

| ordem_aplicacao | codigo_final | nome_final | fase_voo | origem | decisao | fonte | fap_refs | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | `S76-CAB-01` | Cabine, comandos e instrumentos básicos | Pré-voo / cockpit | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | FAP05.2 basico/normais | Antes de qualquer voo o aluno precisa localizar comandos, instrumentos e referências de cabine. Sem emergência; conteúdo técnico observável. |
| 2 | `S76-CKL-01` | Execução do checklist normal por fase de voo | Pré-partida | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | FAP05.2 C2.1/C2.2 | Checklist vem antes da partida e cria disciplina operacional. Nome V4.1 substitui "disciplina de uso". |
| 3 | `S76-PNR-01` | Partida normal | Partida | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | FAP05.2 H1.1 | Partida só ocorre após cockpit e checklist. |
| 4 | `S76-INS-01` | Cheque de instrumentos e parâmetros após partida | Pós-partida | novo | NOVA_MANOBRA_NECESSARIA | V4.2 - nova manobra sugerida | - | Garante que a aeronave está configurada antes do taxi/hover. Nova manobra sugerida se não houver equivalente no catálogo. |
| 5 | `S76-TAX-01` | Taxi e deslocamento em solo/heliponto | Taxi / hover taxi | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | FAP05.2 H2.3 | O deslocamento precede hover estacionário e decolagem. |
| 6 | `S76-HOV-00` | Controle geral VFR — hover estacionário | Hover | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | FAP05.2 H2.3/H3.1 | Hover é fundamento antes de transição para decolagem. Reaproveitado da família periódica. |
| 7 | `S76-PED-01` | Controle de pedal e anti-torque em hover | Hover | novo | NOVA_MANOBRA_NECESSARIA | V4.1 - substitui item generico removido das 18 | FAP05.2 H2.3 | Treina controle direcional antes da transição hover-decolagem. Substitui conteúdo genérico de segurança/comunicação. |
| 8 | `S76-HVT-01` | Transição hover–decolagem e decolagem–subida | Transição / decolagem | novo | NOVA_MANOBRA_NECESSARIA | V4.1 - substitui item generico removido das 18 | FAP05.2 H4.2 | Conecta hover à decolagem normal. |
| 9 | `S76-DNR-01` | Decolagem normal | Decolagem | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | FAP05.2 H4.2 | Decolagem vem antes de subida, cruzeiro, circuito e pouso. |
| 10 | `S76-SUB-01` | Subida controlada visual | Subida | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | - | A subida é consequência da decolagem. |
| 11 | `S76-NVF-00` | Procedimentos normais VFR / perfil normal | Cruzeiro / perfil | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | FAP05.2 H4.1/H4.3 | Após subida, consolidar perfil normal. |
| 12 | `S76-PWR-01` | Controle de potência, torque e limites em voo normal | Cruzeiro / perfil | novo | NOVA_MANOBRA_NECESSARIA | V4.1 - substitui item generico removido das 18 | FAP05.2 H4.1 | Controle de potência é treinado em voo estabilizado. Substitui item genérico. |
| 13 | `S76-CRV-01` | Curvas padrão e controle de atitude | Manobras visuais | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | - | Após controle de potência, treinar curvas e atitude. |
| 14 | `S76-CIR-01` | Circuito de tráfego visual | Circuito | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | - | Circuito organiza aproximação e pouso. |
| 15 | `S76-APN-01` | Aproximação normal visual | Aproximação | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | FAP05.2 H4.3 | Aproximação vem depois de circuito/perfil de chegada. |
| 16 | `S76-ARN-01` | Arremetida normal | Aproximação / arremetida | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | - | Arremetida é ensinada após aproximação, antes do pouso final. |
| 17 | `S76-PNO-01` | Pouso normal | Pouso | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | FAP05.2 H4.3 | Pouso final após aproximação e arremetida demonstrada. |
| 18 | `S76-EST-01` | Estacionamento e corte de motores | Pós-pouso | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | FAP05.2 H4.5/C2.3 | Encerramento só após pouso e taxi/estacionamento. |

### Sessao 02/12 — Voo Normal Consolidado / Perfil Visual

| ordem_aplicacao | codigo_final | nome_final | fase_voo | origem | decisao | fonte | fap_refs | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | `S76-CKL-01` | Checklist normal por fase de voo | Pré-voo / transições | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | FAP05.2 C2.1/C2.2 | Reforça checklist antes do novo voo. |
| 2 | `S76-HOV-00` | Hover/taxi de precisão | Hover / taxi | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | FAP05.2 H2.3/H3.1 | Aperfeiçoa controle antes da decolagem. |
| 3 | `S76-DNR-01` | Decolagem normal | Decolagem | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | FAP05.2 H4.2 | Inicia o perfil de voo. |
| 4 | `S76-SUB-01` | Subida controlada visual | Subida | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | - | Segue a decolagem. |
| 5 | `S76-NVF-00` | Cruzeiro visual — procedimentos normais | Cruzeiro | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | FAP05.2 H4.1/H4.3 | Consolida voo estabilizado. |
| 6 | `S76-CTV-01` | Controle de velocidade em voo nivelado | Cruzeiro | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | - | Treina precisão de velocidade em perfil normal. |
| 7 | `S76-CRV-01` | Curvas padrão e controle de atitude | Manobras visuais | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | - | Após estabilização, treina curvas. |
| 8 | `S76-DSC-01` | Descida controlada visual | Descida | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | - | A descida antecede a aproximação. |
| 9 | `S76-APN-01` | Aproximação visual | Aproximação | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | FAP05.2 H4.3 | Entra no perfil de pouso. |
| 10 | `S76-STB-01` | Aproximação estabilizada visual com correção de rampa e velocidade | Aproximação estabilizada | novo | NOVA_MANOBRA_NECESSARIA | V4.1 - substitui item generico removido das 18 | FAP05.2 H4.3 | Refina a aproximação antes de pouso/arremetida. V4.1. |
| 11 | `S76-ARN-01` | Arremetida normal | Aproximação / arremetida | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | - | Treinar decisão de arremeter antes de repetir circuito. |
| 12 | `S76-REC-01` | Reentrada no circuito de tráfego | Circuito | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | - | Vem depois da arremetida. |
| 13 | `S76-CIR-01` | Circuito visual — segunda volta | Circuito | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | - | Nova volta para consolidar perfil. |
| 14 | `S76-VCZ-01` | Pouso/decolagem com vento cruzado leve | Aproximação / pouso | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | - | Aplicar variação controlada após base normal. Se aplicável. |
| 15 | `S76-GAR-01` | Arremetida por aproximação instável em VMC | Aproximação / arremetida | novo | NOVA_MANOBRA_NECESSARIA | V4.1 - substitui item generico removido das 18 | - | A arremetida por instabilidade ocorre após aproximação instável. V4.1. |
| 16 | `S76-PNO-01` | Pouso normal | Pouso | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | FAP05.2 H4.3 | Pouso final após variações e arremetida. |
| 17 | `S76-TAX-01` | Taxi e deslocamento pós-pouso | Pós-pouso | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | FAP05.2 H2.3 | Vem depois do pouso. |
| 18 | `S76-EST-01` | Estacionamento e corte de motores | Pós-pouso | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | FAP05.2 H4.5/C2.3 | Encerra a sessão. |

### Sessao 03/12 — IFR / Navegação Básico

| ordem_aplicacao | codigo_final | nome_final | fase_voo | origem | decisao | fonte | fap_refs | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | `76-PRGGP` | Programação do GPS, HSI e EFIS | Preparação IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | Setup vem antes da saída IFR. |
| 2 | `S76-NIF-00` | Procedimentos normais IFR | Preparação IFR | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | Define regime normal IFR. |
| 3 | `S76-FDA-00` | Uso do diretor de voo e automação | Preparação / decolagem IFR | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | Configurar automação antes de SID. |
| 4 | `76-DECSI` | Decolagem por instrumentos / SID | Decolagem IFR | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Inicia o voo IFR. |
| 5 | `S76-SID-00` | SID & STAR | Saída / chegada IFR | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | FAP06 CIR.3 | SID após decolagem; STAR será usado na chegada. |
| 6 | `S76-CGI-00` | Controle geral IFR | Enroute IFR | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | Manutenção de proa/altitude/velocidade após saída. Inclui `S76-ORI-01` fundido. |
| 7 | `S76-SCN-01` | Varredura instrumental primária e secundária em IFR básico | Enroute IFR | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | - | Scan é técnica de controle IFR, não comportamento. Restrito a sessão IFR. |
| 8 | `S76-VMA-01` | Voo manual por instrumentos em condição normal | Enroute IFR | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Voo manual antes de procedimentos de aproximação. |
| 9 | `S76-HLD-00` | Holding pattern | Espera IFR | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | FAP06 CIR.7 | Espera vem antes da aproximação/reaproximação. |
| 10 | `S76-RNV-00` | Aproximação RNAV/GPS | Aproximação IFR | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | FAP06 IAP2.2 | Primeira aproximação IFR básica. |
| 11 | `76-APXPR` | Aproximação de precisão IFR | Aproximação IFR | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Treinar precisão após RNAV/controle básico. |
| 12 | `76-APXNP` | Aproximação de não precisão IFR | Aproximação IFR | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Treinar NPA como variação. |
| 13 | `76-APXPI` | Aproximação perdida IFR / procedimento publicado | Missed approach | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Só depois de aproximação IFR. |
| 14 | `76-ARRIF` | Arremetida IFR normal | Missed approach | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Executa arremetida associada ao missed. |
| 15 | `S76-UAR-00` | Recuperação de atitudes anormais básica | IFR básico / segurança | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | Pode ser aplicada após controle IFR básico, antes do encerramento. |
| 16 | `76-APXPR` | Reaproximação de precisão IFR — repetição técnica | Reaproximação | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Preenche vaga saneada sem código novo. Reforço previsto pela V4.1. |
| 17 | `76-APXNP` | Reaproximação não precisão IFR — repetição técnica | Reaproximação | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Preenche vaga saneada sem código novo. Reforço previsto pela V4.1. |
| 18 | `S76-HLD-00` | Holding / reposicionamento para nova aproximação | Espera / reposicionamento | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | FAP06 CIR.7 | Preenche vaga saneada com técnica IFR existente. Reforço previsto pela V4.1. |

### Sessao 04/12 — Anormalidades Simples / Checklist/ECL

| ordem_aplicacao | codigo_final | nome_final | fase_voo | origem | decisao | fonte | fap_refs | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | `S76-CKL-01` | Checklist normal antes do cenário | Normal estabilizado | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | FAP05.2 C2.1/C2.2 | Sessão começa com voo normal estabilizado antes da primeira anormalidade. |
| 2 | `76-FLWNR` | Vazão de combustível fora da faixa normal | Cruzeiro estabilizado / evento | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Evento simples em voo estabilizado. |
| 3 | `S76-FPL-31` | Luz de aviso de pressão de combustível | Cruzeiro estabilizado / evento | renomeado | REAPROVEITAR_RENOMEANDO | AirTrust catalogo; PTO-A | FAP05.2 falhas de sistemas/combustivel; validar ECL | Mesmo bloco de combustível. |
| 4 | `76-OILMT` | Falha no sistema de óleo do motor | Cruzeiro / evento | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Falha de sistema ainda simples, após combustível. |
| 5 | `S76-CKL-02` | Uso do ECL para anormalidade simples | Checklist/ECL | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP05.2 C2.1/C2.2 | ECL ocorre após evento, não antes. |
| 6 | `S76-APN-02` | Aproximação e pouso após anormalidade simples | Aproximação / pouso | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP05.2 H4.3 | Depois de diagnóstico/checklist. |
| 7 | `76-FALGC` | Falha em um gerador DC | Novo mini-cenário em cruzeiro | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Segundo bloco: elétrica simples. |
| 8 | `76-PER26` | Perda de referência de 26 VAC | Mini-cenário elétrico | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Correlato elétrico. |
| 9 | `76-FALIV` | Falha no inversor | Mini-cenário elétrico | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Correlato elétrico. |
| 10 | `76-FALAD` | Falha no sistema de dados de voo | Mini-cenário instrumentos | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Bloco de instrumentos. |
| 11 | `76-PERAT` | Perda do indicador primário de atitude em IMC | Mini-cenário instrumentos | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Só após base IFR da sessão 03. |
| 12 | `76-FALEF` | Mau funcionamento do EFIS | Mini-cenário instrumentos | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Correlato EFIS. |
| 13 | `76-FALFD` | Falha no flight director | Mini-cenário automação | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Após falhas de instrumentos. |
| 14 | `76-FALRM` | Falha no sistema mestre de rádio | Mini-cenário comunicação técnica | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Falha técnica de rádio, não COM genérico. |
| 15 | `76-N1TQF` | Falha nos indicadores N1/Torque | Mini-cenário indicação motor | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Ainda anormalidade de indicação. |
| 16 | `76-FALTS` | Falha no indicador TS | Mini-cenário indicação motor | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Correlato de indicação. |
| 17 | `76-HIDPB` | Falha simples de bomba/perda de pressão servo/hidráulica | Mini-cenário hidráulico simples | validar | VALIDAR_ECL | AirTrust catalogo; PTO-A | - | Introdução leve antes de sistemas completos. |
| 18 | `76-FALFF` | Falha de alimentação feeder/bateria | Mini-cenário final / validar frota | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Fechar com item a validar por aplicabilidade. Validar frota. |

### Sessao 05/12 — Motor em Cruzeiro / OEI Introdutório

| ordem_aplicacao | codigo_final | nome_final | fase_voo | origem | decisao | fonte | fap_refs | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | `76-MOTCZ` | Falha de motor durante o cruzeiro | Cruzeiro estabilizado / evento | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Primeira falha de motor deve ocorrer em fase estabilizada. |
| 2 | `S76-IDF-01` | Identificação e diagnóstico de falha de motor | Reconhecimento | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP05.2 H7.7 | Após evento, antes de ação. |
| 3 | `S76-CKL-03` | Aplicação do ECL para falha de motor em cruzeiro | Checklist/ECL | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP05.2 H7.4 | ECL após identificação. |
| 4 | `S76-OEI-01` | Perfil OEI em cruzeiro | Perfil OEI | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP05.2 H7.4 | Após ECL, manter perfil monomotor. |
| 5 | `S76-XFD-20` | Crossfeed total após falha de motor | Gerenciamento de combustível | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | Após perfil OEI, se aplicável. |
| 6 | `S76-DMN-21` | DECU — falha menor | Evento correlato de baixa severidade | renomeado | REAPROVEITAR_RENOMEANDO | AirTrust catalogo; PTO-A | FAP05.2 H7.4/H7.9; validar ECL/PTO | DECU menor antes de falhas maiores da sessão 06. |
| 7 | `76-N1TQF` | Monitoramento de N1/Torque após falha | Monitoramento | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Após OEI, monitorar motor remanescente. |
| 8 | `76-FLWNR` | Vazão de combustível em contexto de falha | Monitoramento | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Correlato combustível. |
| 9 | `76-OILMT` | Falha no sistema de óleo do motor em contexto de falha | Monitoramento | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Correlato óleo. |
| 10 | `S76-CGI-00` | Controle geral IFR se aplicável ao cenário OEI | Navegação/IFR | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | Se em IFR, estabilizar controle. |
| 11 | `S76-SCN-01` | Varredura de instrumentos pós-falha | Navegação/IFR | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | - | Scan técnico após evento. |
| 12 | `S76-APX-02` | Aproximação planejada com um motor inoperante | Aproximação | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP05.2 H7.9 | Planejamento antes do pouso. |
| 13 | `76-APXOI` | Aproximação IFR com um motor inoperante | Aproximação IFR/OEI | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Versão IFR do mesmo domínio. |
| 14 | `S76-UAR-00` | Recuperação de atitude anormal em contexto OEI | Recuperação | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | Só se necessário após degradação. |
| 15 | `S76-PNO-01` | Pouso em contexto OEI planejado | Pouso | novo | NOVA_MANOBRA_NECESSARIA | catalogo `76-*` nao tem item equivalente | FAP05.2 H4.3 | Pouso depois de aproximação planejada. |
| 16 | `76-FALGC` | Falha de gerador DC correlata | Evento secundário leve | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Evento secundário depois do cenário principal. |
| 17 | `76-MOTCZ` | Repetição técnica da falha de motor em cruzeiro | Repetição técnica | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Substitui COM/BRF saneados sem criar código novo. |
| 18 | `S76-CKL-03` | Repetição da aplicação ECL em falha de motor | Repetição técnica | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP05.2 H7.4 | Reforço do item central. |

### Sessao 06/12 — OEI Decolagem/Aproximação / DECU

| ordem_aplicacao | codigo_final | nome_final | fase_voo | origem | decisao | fonte | fap_refs | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | `S76-DDE-21` | DECU — falha degradada | Preparação / evento de menor severidade | renomeado | REAPROVEITAR_RENOMEANDO | AirTrust catalogo; PTO-A | FAP05.2 H7.4/H7.9; validar ECL/PTO | Começar com DECU degradada antes de falhas maiores. |
| 2 | `S76-DM1-22` | DECU — falha maior em um motor | Evento progressivo | renomeado | REAPROVEITAR_RENOMEANDO | AirTrust catalogo; PTO-A | FAP05.2 H7.4/H7.9; validar ECL/PTO | Aumenta severidade. |
| 3 | `S76-DMB-24` | DECU — falha maior em ambos os motores | Evento progressivo / validar | renomeado | REAPROVEITAR_RENOMEANDO | AirTrust catalogo; PTO-A | FAP05.2 H7.4/H7.9; validar ECL/PTO | Só após DECU um motor. Validar aplicabilidade. |
| 4 | `76-MOTHV` | Falha de motor em pairado 5 a 10 pés | Hover / evento | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Treinar em hover antes da decolagem corrida. |
| 5 | `76-MOTCA` | Falha de motor na decolagem — Categoria A PRA | Decolagem / evento | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Após hover, cenário de decolagem. Validar nomenclatura S76. |
| 6 | `76-MOTCB` | Falha de motor na decolagem — Categoria B | Decolagem / evento | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Após Categoria A/primeiro cenário, variação Categoria B. |
| 7 | `76-POUAB` | Pouso abortado / rejected takeoff | Decolagem abortada | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Só depois de treinar decolagem normal em sessões anteriores. |
| 8 | `S76-CKL-04` | ECL para DECU e falha de motor na decolagem/aproximação | Checklist/ECL | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP05.2 H7.4/H7.9 | Após evento. |
| 9 | `76-N1TQF` | Monitoramento N1/Torque | Monitoramento | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Após falha/decu, monitorar parâmetros. |
| 10 | `S76-XFD-20` | Crossfeed total após falha de motor | Gerenciamento combustível | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | Aplicar após controle inicial. |
| 11 | `76-MOTAP` | Falha de motor na aproximação — Categoria A | Aproximação / evento | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Depois de decolagem/hover, cenário em aproximação. |
| 12 | `76-APXOI` | Aproximação IFR com um motor inoperante | Aproximação IFR/OEI | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Antes de pouso monomotor. |
| 13 | `76-APXAL` | Aproximação alternada — Categoria A | Aproximação alternativa | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Variação após aproximação OEI. Validar uso operacional. |
| 14 | `76-POUMO` | Pouso monomotor — Categoria A ou B PEA | Pouso OEI | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Pouso após aproximação. |
| 15 | `S76-CGI-00` | Controle geral IFR em contexto OEI | Controle / estabilização | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | Aplicar se o cenário for IFR. |
| 16 | `S76-UAR-00` | Recuperação de atitudes anormais em contexto OEI | Recuperação | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | Reforço avançado. |
| 17 | `76-MOTCA` | Repetição técnica: falha motor decolagem | Repetição técnica | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Substitui COM/BRF saneados. |
| 18 | `S76-CKL-04` | Repetição técnica: ECL DECU/OEI | Repetição técnica | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP05.2 H7.4/H7.9 | Reforço central. |

### Sessao 07/12 — Sistemas Específicos

| ordem_aplicacao | codigo_final | nome_final | fase_voo | origem | decisao | fonte | fap_refs | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | `76-FALGC` | Falha em um gerador DC — ponte para sessão sistemas | Cruzeiro estabilizado / evento | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Começar com falha elétrica simples antes de total. Se mantida; V4 usa FALGD como primeiro. |
| 2 | `76-FALGD` | Falha em ambos os geradores DC | Elétrico | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Falha total após simples. |
| 3 | `76-SOBGD` | Sobretemperatura de gerador DC | Elétrico | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Mesmo bloco. |
| 4 | `76-FALGA` | Falha no gerador AC | Elétrico | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Completa bloco elétrico. |
| 5 | `76-FALEB` | Falha de alimentação no barramento essencial | Elétrico | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Após geradores/barramento. |
| 6 | `76-FALIV` | Falha no inversor | Elétrico | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Encerra elétrico. |
| 7 | `76-FALFF` | Falha de alimentação feeder/bateria | Elétrico / validar | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Só após bloco elétrico. Validar frota. |
| 8 | `76-HIDPB` | Falha de bomba/perda de pressão servo/hidráulica | Hidráulico / SERVO SYS | validar | VALIDAR_ECL | AirTrust catalogo; PTO-A | - | Inicia bloco hidráulico. |
| 9 | `76-SERTQ` | Perda de pressão no servo do rotor de cauda | Hidráulico / rotor de cauda | validar | VALIDAR_ECL | AirTrust catalogo; PTO-A | - | Após hidráulico geral. |
| 10 | `76-SERJM` | Atuador travado ou válvula de corte defeituosa | Hidráulico / servo | validar | VALIDAR_ECL | AirTrust catalogo; PTO-A | - | Mesmo bloco. |
| 11 | `76-AMOTV` | Amortecedor dos comandos travado PRB | Comandos | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Após servo. |
| 12 | `S76-UGR-46` | Indicação insegura — recolhimento do trem | Trem de pouso | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | Novo bloco. |
| 13 | `S76-LGB-47` | Trem de pouso — extensão de emergência | Trem de pouso | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | Após indicação insegura. |
| 14 | `76-FALAD` | Falha no sistema de dados de voo | Instrumentos | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Bloco instrumentos. |
| 15 | `76-PERAT` | Perda do indicador primário de atitude em IMC | Instrumentos | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Após dados de voo. |
| 16 | `76-FALPA` | Falha no piloto automático | Automação | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Bloco automação. |
| 17 | `76-FALFD` | Falha no flight director | Automação | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Após piloto automático. |
| 18 | `76-N1TQF` | Falha nos indicadores N1 ou Torque | Indicação motor | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Fechar com indicação motor. |

### Sessao 08/12 — Rotor / Transmissão / Autorrotação

| ordem_aplicacao | codigo_final | nome_final | fase_voo | origem | decisao | fonte | fap_refs | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | `76-MGBSF` | Falhas no sistema da MGB | Cruzeiro / evento transmissão | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Começar por MGB antes de rotor/tail rotor. |
| 2 | `76-MGBOL` | Falhas no sistema de óleo da MGB | Transmissão | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Mesmo bloco. |
| 3 | `76-CHPTG` | Chip ou alta temperatura no gearbox | Transmissão | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Após MGB óleo. |
| 4 | `76-TRSRC` | Falha do sistema de transmissão do rotor de cauda | Rotor de cauda | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Depois de transmissão principal. |
| 5 | `76-CTRRC` | Falha no sistema de controle do rotor de cauda PF | Rotor de cauda | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Após transmissão tail rotor. |
| 6 | `S76-TRH-38` | Falha do rotor de cauda no hover | Hover / evento | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | Aplicar após conceitos de rotor de cauda. |
| 7 | `S76-TRD-39` | Falha do eixo do rotor de cauda em voo | Voo / evento | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | Variação em voo. |
| 8 | `S76-TDM-41` | Dano no rotor de cauda | Voo / evento | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | Variação final tail rotor. |
| 9 | `S76-NRO-00` | Disparo de NR / NR overspeed | Rotor RPM | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | Antes da autorrotação, introduzir energia/RPM. |
| 10 | `S76-NRL-00` | Queda de NR / NR low | Rotor RPM | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | Complementa controle RPM. |
| 11 | `S76-ENE-01` | Controle de energia/RPM em autorrotação | Autorrotacão / energia | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Pré-requisito direto para autorrotação. |
| 12 | `S76-AUT-70` | Autorrotacão em terra | Autorrotacão | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | Só agora entra autorrotação. |
| 13 | `S76-REC-02` | Recuperação de autorrotação | Recuperação | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Depois da entrada/controle. |
| 14 | `S76-CKL-05` | Ações de memória e ECL para rotor/transmissão | Checklist/ECL | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Após evento, não antes. |
| 15 | `S76-MRV-00` | Vibração do rotor principal | Rotor / evento | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | Evento associado após conceitos principais. |
| 16 | `76-AMOTV` | Amortecedor dos comandos travado | Comandos / reforço | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Reforço técnico. |
| 17 | `S76-AUT-70` | Repetição técnica de autorrotação | Repetição técnica | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | Substitui COM/BRF saneados. |
| 18 | `S76-ENE-01` | Repetição técnica de controle energia/RPM | Repetição técnica | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Substitui COM/BRF saneados. |

### Sessao 09/12 — Fogo/Fumaça e Emergências Avançadas

| ordem_aplicacao | codigo_final | nome_final | fase_voo | origem | decisao | fonte | fap_refs | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | `76-INCMO` | Incêndio no compartimento do motor | Cruzeiro / evento fogo | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Primeiro evento de fogo. |
| 2 | `S76-FMF-07` | Fogo no compartimento do motor em voo | Fogo em voo | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | Mesmo bloco. |
| 3 | `S76-CKL-06` | Ações de memória para fogo/fumaça | Ações imediatas / ECL | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Após evento de fogo. |
| 4 | `S76-FMI-09` | Fogo interno no motor após desligamento | Fogo pós-shutdown motor | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | Após ações de desligamento. |
| 5 | `S76-FMG-08` | Fogo no compartimento do motor no solo | Solo / fogo | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | Variação em solo. |
| 6 | `76-INCCB` | Incêndio na cabine ou cockpit | Fogo/fumaça cabine | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Novo bloco. |
| 7 | `S76-CCF-10` | Fogo/fumaça na cabine em voo | Fogo/fumaça cabine | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | Após incêndio cabine. |
| 8 | `76-FUMBG` | Fumaça no compartimento de bagagem | Fumaça / bagagem | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Complementa fumaça. |
| 9 | `S76-EFV-11` | Fogo de origem elétrica em VMC | Fogo elétrico | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | Após fumaça/cabine. |
| 10 | `S76-EFI-12` | Fogo de origem elétrica em IMC | Fogo elétrico/IFR | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | - | Variação IMC mais exigente. |
| 11 | `76-DUACZ` | Falha dupla de motor durante cruzeiro | Falha múltipla controlada | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Começar falha dupla em cruzeiro, não hover. |
| 12 | `76-DUADC` | Falha dupla de motor durante decolagem | Falha múltipla avançada | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Após cruzeiro. |
| 13 | `76-DUAHV` | Falha dupla de motor em pairado/decolagem | Falha múltipla avançada | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Mais crítica, por último no bloco. |
| 14 | `76-FALGD` | Falha em ambos os geradores DC | Sistema alto estresse | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Reforço em cenário complexo. |
| 15 | `76-POUAB` | Pouso abortado por fogo/fumaça | Decolagem abortada | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Só após cenário de fogo. |
| 16 | `76-POUMO` | Pouso monomotor por falha associada | Pouso emergência | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Depois da falha/planejamento. |
| 17 | `76-INCMO` | Repetição técnica de incêndio motor | Repetição técnica | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Substitui COM saneado. |
| 18 | `S76-CKL-06` | Repetição técnica de ações de memória/ECL | Repetição técnica | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Substitui BRF saneado. |

### Sessao 10/12 — Offshore / Unidade Marítima

| ordem_aplicacao | codigo_final | nome_final | fase_voo | origem | decisao | fonte | fap_refs | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | `S76-CKL-07` | Checklist e ECL específico para operação offshore | Preparação offshore | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP14 Offshore/SOP | Preparação vem antes da decolagem para UM. |
| 2 | `S76-TDP-00` | Decolagem Classe 2 — helideck (TDP) | Decolagem offshore | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | FAP05.2 H4.2; FAP14 Offshore | Inicia missão offshore. |
| 3 | `76-MOTCZ` | Falha de motor em cruzeiro no contexto offshore | Rota offshore / evento | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Pane compatível com rota. |
| 4 | `76-FALPA` | Falha no piloto automático em contexto offshore | Rota offshore / evento | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Evento de automação em rota. |
| 5 | `76-FALFD` | Falha no flight director | Rota offshore / evento | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Correlato automação. |
| 6 | `76-PERAT` | Perda do indicador primário de atitude em IMC | Rota offshore / IFR | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Evento de instrumento. |
| 7 | `76-FALAD` | Falha no sistema de dados de voo | Rota offshore / IFR | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Correlato instrumento. |
| 8 | `S76-APO-01` | Aproximação offshore a Unidade Marítima | Aproximação offshore | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP14 Offshore/SOP | Após rota e eventos. |
| 9 | `76-MOTAP` | Falha de motor na aproximação offshore | Aproximação offshore / evento | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Evento compatível com fase. |
| 10 | `76-APXOI` | Aproximação IFR com um motor inoperante | Aproximação OEI/IFR | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Após falha na aproximação. |
| 11 | `76-POUMO` | Pouso monomotor em contexto offshore | Pouso emergência | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Depois da aproximação OEI. |
| 12 | `S76-ARO-01` | Arremetida offshore | Arremetida offshore | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP14 Offshore/SOP | Após tentativa de aproximação/pouso. |
| 13 | `76-POUAB` | Pouso abortado / decolagem rejeitada offshore | Decolagem offshore / evento | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Aplicar no ciclo de saída da UM. |
| 14 | `76-AUTAG` | Autorrotacão para a água | Ditching / água | existente | REALOCAR | AirTrust catalogo; PTO-A | FAP05.2 Emergencias; FAP14 Offshore | Somente na sessão offshore avançada. |
| 15 | `S76-DIT-71` | Ditching com potência | Ditching | existente (periodico) | REALOCAR | AirTrust catalogo (familia periodico); PTO-A | FAP05.2 Emergencias; FAP14 Offshore | Depois de autorrotacão para água. |
| 16 | `S76-FLU-01` | Flutuabilidade e evacuação aquática | Pós-ditching | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP14 Offshore/SOP | Após ditching, não antes. |
| 17 | `S76-CKL-07` | Repetição técnica de ECL offshore | Repetição técnica | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP14 Offshore/SOP | Substitui COM saneado. |
| 18 | `S76-APO-01` | Repetição técnica: reaproximação offshore | Repetição técnica | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP14 Offshore/SOP | Substitui BRF saneado. |

### Sessao 11/12 — LOFT

| ordem_aplicacao | codigo_final | nome_final | fase_voo | origem | decisao | fonte | fap_refs | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | `LOFT-CHK-01` | Performance e cálculos de decolagem IFR | Planejamento missão | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Planejamento/Performance; FAP06 CIR.1 | Começa no planejamento. Treinamento de cenário; pode haver orientação. |
| 2 | `LOFT-CHK-02` | Planejamento IFR, mínimos e alternado | Planejamento missão | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Planejamento IFR; FAP06 CIR.1; FAP05.2 Conhecimentos Gerais | Definir rota/minimos antes do FMS. |
| 3 | `LOFT-CHK-03` | Configuração completa do FMS | Preparação cockpit | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Planejamento IFR; FAP06 CIR.1 | Após planejamento. |
| 4 | `LOFT-CHK-05` | Inspeção, acionamento e checklists | Pré-voo / partida | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP05.2 C2.1/C2.2/H1.1/H4.1 | Antes do taxi/decolagem. |
| 5 | `LOFT-CHK-06` | Hover check e taxi IFR | Taxi / hover | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP05.2 H2.3/H3.1 | Antes da decolagem. |
| 6 | `LOFT-CHK-07` | Decolagem IFR — perfil CAT A em IMC | Decolagem IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 CIR.2/CIR.3; FAP05.2 H4.2 | Inicia missão. Validar se CAT A se aplica à frota/sessão. |
| 7 | `LOFT-CHK-08` | OEI pós-TDP — fly-away monomotor IFR | Decolagem / evento | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 CIR.4; FAP05.2 H7.4/H7.9 | Evento após TDP/decisão. |
| 8 | `LOFT-CHK-09` | Navegação IFR en route e gestão de FMS | Enroute | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Navegacao IFR; FAP06 CIR.5 | Após saída. |
| 9 | `LOFT-CHK-10` | Monitoramento de sistemas e path monitoring | Enroute / monitoramento técnico | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IFF.1/IFF.2 | Durante rota. |
| 10 | `LOFT-CHK-11` | Gestão de falha de sistema em rota | Enroute / evento | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP05.2 H7.7; FAP06 IFL.1 | Evento no momento de rota. |
| 11 | `LOFT-CHK-12` | Chegada STAR/RNAV e descida | Chegada/descida | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Descida/Chegada; FAP06 CIR.6 | Após rota e replanejamento. |
| 12 | `LOFT-CHK-13` | Procedimento de espera IFR | Espera | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Espera; FAP06 CIR.7 | Antes da aproximação. |
| 13 | `LOFT-CHK-14` | Aproximação não precisão — RNAV ou VOR | Aproximação IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP2.1/IAP2.2 | Primeira aproximação. |
| 14 | `LOFT-CHK-15` | Arremetida por abaixo dos mínimos (NPA) | Missed approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP2.3 | Só após NPA. |
| 15 | `LOFT-CHK-17` | Setup para ILS | Reaproximação | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP3.1 | Preparar nova aproximação. Briefing como técnica só se for setup técnico; comportamento fica NOTECHS. |
| 16 | `LOFT-CHK-18` | Aproximação ILS — final e decisão na DA | Aproximação IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP3.2; FAP14 Aproximacao de precisao | Após setup ILS. |
| 17 | `LOFT-CHK-19` | Pouso no alternado e procedimentos pós-voo | Pouso / pós-voo | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP05.2 H4.3/H4.5/C2.3 | Fecha o cenário. |
| 18 | `LOFT-CHK-23` | Painel limitado / falha de instrumentos IFR | Evento avaliável opcional dentro do cenário | novo | VALIDAR_FAP | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 painel limitado/falha de instrumentos; validar FAP | Pode ser inserido em rota ou aproximação; registrar posição do evento no briefing do cenário. |

### Sessao 12/12 — LOFT Check

| ordem_aplicacao | codigo_final | nome_final | fase_voo | origem | decisao | fonte | fap_refs | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | `LOFT-CHK-01` | Performance e cálculos de decolagem IFR | Planejamento missão | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Planejamento/Performance; FAP06 CIR.1 | Começa no planejamento. Treinamento de cenário; pode haver orientação. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 2 | `LOFT-CHK-02` | Planejamento IFR, mínimos e alternado | Planejamento missão | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Planejamento IFR; FAP06 CIR.1; FAP05.2 Conhecimentos Gerais | Definir rota/minimos antes do FMS. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 3 | `LOFT-CHK-03` | Configuração completa do FMS | Preparação cockpit | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Planejamento IFR; FAP06 CIR.1 | Após planejamento. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 4 | `LOFT-CHK-05` | Inspeção, acionamento e checklists | Pré-voo / partida | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP05.2 C2.1/C2.2/H1.1/H4.1 | Antes do taxi/decolagem. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 5 | `LOFT-CHK-06` | Hover check e taxi IFR | Taxi / hover | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP05.2 H2.3/H3.1 | Antes da decolagem. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 6 | `LOFT-CHK-07` | Decolagem IFR — perfil CAT A em IMC | Decolagem IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 CIR.2/CIR.3; FAP05.2 H4.2 | Inicia missão. Validar se CAT A se aplica à frota/sessão. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 7 | `LOFT-CHK-08` | OEI pós-TDP — fly-away monomotor IFR | Decolagem / evento | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 CIR.4; FAP05.2 H7.4/H7.9 | Evento após TDP/decisão. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 8 | `LOFT-CHK-09` | Navegação IFR en route e gestão de FMS | Enroute | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Navegacao IFR; FAP06 CIR.5 | Após saída. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 9 | `LOFT-CHK-10` | Monitoramento de sistemas e path monitoring | Enroute / monitoramento técnico | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IFF.1/IFF.2 | Durante rota. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 10 | `LOFT-CHK-11` | Gestão de falha de sistema em rota | Enroute / evento | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP05.2 H7.7; FAP06 IFL.1 | Evento no momento de rota. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 11 | `LOFT-CHK-12` | Chegada STAR/RNAV e descida | Chegada/descida | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Descida/Chegada; FAP06 CIR.6 | Após rota e replanejamento. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 12 | `LOFT-CHK-13` | Procedimento de espera IFR | Espera | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Espera; FAP06 CIR.7 | Antes da aproximação. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 13 | `LOFT-CHK-14` | Aproximação não precisão — RNAV ou VOR | Aproximação IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP2.1/IAP2.2 | Primeira aproximação. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 14 | `LOFT-CHK-15` | Arremetida por abaixo dos mínimos (NPA) | Missed approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP2.3 | Só após NPA. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 15 | `LOFT-CHK-17` | Setup para ILS | Reaproximação | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP3.1 | Preparar nova aproximação. Briefing como técnica só se for setup técnico; comportamento fica NOTECHS. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 16 | `LOFT-CHK-18` | Aproximação ILS — final e decisão na DA | Aproximação IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP3.2; FAP14 Aproximacao de precisao | Após setup ILS. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 17 | `LOFT-CHK-19` | Pouso no alternado e procedimentos pós-voo | Pouso / pós-voo | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP05.2 H4.3/H4.5/C2.3 | Fecha o cenário. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 18 | `LOFT-CHK-23` | Painel limitado / falha de instrumentos IFR | Evento avaliável opcional dentro do cenário | novo | VALIDAR_FAP | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 painel limitado/falha de instrumentos; validar FAP | Pode ser inserido em rota ou aproximação; registrar posição do evento no briefing do cenário. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |

---

## 6. Matriz final AW139 Inicial — 12 sessoes consolidadas

Mesma base de consolidacao da secao 5 (V4 + V4.1 + V4.2).

### Sessao 01/12 — Familiarização / Checklist Normal / Voo Normal

| ordem_aplicacao | codigo_final | nome_final | fase_voo | origem | decisao | fonte | fap_refs | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | `A139-CAB-01` | Cabine AW139 e power-up | Pré-voo / cockpit | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP05.2 basico/normais | Familiarização antes de qualquer manobra. |
| 2 | `A139-CKL-01` | Normal checklist | Pré-partida | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP05.2 C2.1/C2.2 | Checklist antes da partida. |
| 3 | `A139-CAS-01` | Leitura, priorização e reconhecimento básico de CAS sem pane simulada | Pré-partida / familiarização | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | CAS como leitura objetiva, não pane. Renomeado V4.1. |
| 4 | `A139-QRH-01` | Localização guiada de procedimento no QRH sem execução de emergência | Pré-partida / familiarização | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | QRH como localização, sem executar emergência. Renomeado V4.1. |
| 5 | `A139-AFC-01` | Engajamento, monitoramento e desconexão normal dos modos básicos do AFCS | Pré-voo / voo normal | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | AFCS normal antes de pane. Renomeado V4.1 (era `A139-AFB-01`). |
| 6 | `A139-TAX-01` | Taxi/deslocamento em solo e heliponto | Taxi / hover taxi | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Antes do hover/decolagem. |
| 7 | `FLY-BAS-X3` | Hover e taxi | Hover | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H2.3/H3.1 | Fundamento antes da decolagem. |
| 8 | `A139-PWR-01` | Controle normal de potência e parâmetros em voo visual | Hover / decolagem / voo normal | novo | NOVA_MANOBRA_NECESSARIA | V4.1 - substitui item generico removido das 18 | FAP05.2 H4.1 | Controle de parâmetros desde o início. V4.1. |
| 9 | `OPS-NRM-X2` | Decolagens e pousos — decolagem normal | Decolagem | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.2/H4.3 | Decolagem vem antes de voo/circuito/pouso. |
| 10 | `FLY-BAS-X1` | Controle geral VFR | Subida/cruzeiro visual | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 basico/normais conforme aplicavel | Após decolagem. |
| 11 | `OPS-NRM-X1` | Procedimentos normais | Cruzeiro / perfil | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.1/H4.3 | Aplicação em voo normal. |
| 12 | `A139-FMA-01` | Monitoramento básico de FMA/modos em condição normal | Voo normal / automação | novo | NOVA_MANOBRA_NECESSARIA | V4.1 - substitui item generico removido das 18 | - | Depois de AFCS e durante perfil. V4.1. |
| 13 | `OPS-NRM-X3` | Circuito de tráfego | Circuito | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | Organiza aproximação/pouso. |
| 14 | `A139-STB-01` | Aproximação visual estabilizada e critérios de arremetida normal | Aproximação | novo | NOVA_MANOBRA_NECESSARIA | V4.1 - substitui item generico removido das 18 | FAP05.2 H4.3 | Antes de arremetida/pouso. V4.1. |
| 15 | `A139-ARN-01` | Arremetida normal | Aproximação / arremetida | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Após aproximação. |
| 16 | `OPS-NRM-X2` | Pouso normal | Pouso | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.2/H4.3 | Após aproximação/arremetida demonstrada. |
| 17 | `A139-EST-01` | Estacionamento e corte de motores | Pós-pouso | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP05.2 H4.5/C2.3 | Após pouso/taxi. |
| 18 | `FLY-BAS-X4` | Recuperação de atitudes anormais básica em VMC | Segurança / manobra básica | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Somente como básico VMC, sem pane pesada. Validar se fica na sessão 01 ou 02. |

### Sessao 02/12 — Voo Visual e Perfil Básico

| ordem_aplicacao | codigo_final | nome_final | fase_voo | origem | decisao | fonte | fap_refs | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | `A139-CKL-01` | Normal checklist | Pré-voo / transições | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP05.2 C2.1/C2.2 | Inicia voo normal. |
| 2 | `FLY-BAS-X3` | Hover e taxi de precisão | Hover / taxi | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H2.3/H3.1 | Aperfeiçoa antes de decolagem. |
| 3 | `OPS-NRM-X2` | Decolagem normal | Decolagem | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.2/H4.3 | Inicia o perfil. |
| 4 | `A139-SUB-01` | Subida e cruzeiro visual | Subida / cruzeiro | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Após decolagem. |
| 5 | `FLY-BAS-X1` | Controle geral VFR | Cruzeiro visual | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 basico/normais conforme aplicavel | Consolidação. |
| 6 | `A139-MOD-01` | Seleção e transição de modos AFCS em perfil visual normal | Cruzeiro / automação | novo | NOVA_MANOBRA_NECESSARIA | V4.1 - substitui item generico removido das 18 | - | Após voo estabilizado. V4.1. |
| 7 | `A139-FMA-02` | Monitoramento de FMA durante mudança de modo | Cruzeiro / automação | novo | NOVA_MANOBRA_NECESSARIA | V4.1 - substitui item generico removido das 18 | - | Após seleção de modos. V4.1. |
| 8 | `A139-CRV-01` | Curvas e controle de atitude/velocidade | Manobras visuais | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Após estabilização. |
| 9 | `A139-DSC-01` | Descida controlada visual | Descida | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Antes de aproximação. |
| 10 | `A139-STB-02` | Correção de perfil em aproximação visual estabilizada | Aproximação | novo | NOVA_MANOBRA_NECESSARIA | V4.1 - substitui item generico removido das 18 | FAP05.2 H4.3 | Preparar pouso/arremetida. V4.1. |
| 11 | `A139-ARN-01` | Arremetida normal | Aproximação / arremetida | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Após aproximação. |
| 12 | `A139-REC-02` | Reentrada no circuito | Circuito | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Após arremetida. |
| 13 | `OPS-NRM-X3` | Circuito de tráfego | Circuito | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | Segunda volta. |
| 14 | `A139-VCZ-01` | Pouso/decolagem com vento cruzado leve | Aproximação / pouso | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Variação controlada. |
| 15 | `A139-HLD-01` | Holding/espera visual ou vetoração básica | Espera / vetoração | novo | NOVA_MANOBRA_NECESSARIA | V4.1 - substitui item generico removido das 18 | FAP06 CIR.7 | Só após voo normal consolidado. Se aplicável. |
| 16 | `OPS-OFF-X1` | Navegação offshore introdutória sem emergência | Rota normal / navegação | existente | REALOCAR | AirTrust catalogo; PTO-A | FAP14 Offshore/SOP | Introdução leve, sem pane. |
| 17 | `A139-TAX-01` | Taxi/deslocamento pós-pouso | Pós-pouso | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Depois do pouso. |
| 18 | `A139-EST-01` | Estacionamento/corte | Pós-pouso | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP05.2 H4.5/C2.3 | Encerramento. |

### Sessao 03/12 — IFR/PBN Básico

| ordem_aplicacao | codigo_final | nome_final | fase_voo | origem | decisao | fonte | fap_refs | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | `OPS-NAV-X1` | Navegação FMS e convencional | Preparação IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.5 | Setup antes da saída. |
| 2 | `OPS-NAV-X4` | SID e STAR | Preparação / saída IFR | existente | REALOCAR | AirTrust catalogo; PTO-A | FAP06 CIR.3 | SID para saída; STAR para chegada. |
| 3 | `OPS-NAV-X2` | Uso AP e automação normal | Preparação / IFR normal | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.3/CIR.5 conforme aplicavel | Automação normal antes do perfil. |
| 4 | `FLY-BAS-X2` | Controle geral IFR | Saída/enroute IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 basico/normais conforme aplicavel | Base de controle. |
| 5 | `A139-SCN-02` | Varredura de instrumentos IFR | Enroute IFR | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Scan técnico. |
| 6 | `A139-VMA-01` | Voo manual por instrumentos | Enroute IFR | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Voo manual em condição normal. |
| 7 | `A139-ORI-01` | Orientação e correção de rumo por instrumentos | Enroute IFR | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Após controle/manual. |
| 8 | `OPS-NAV-X3` | Holding pattern | Espera IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.7 | Antes das aproximações. |
| 9 | `A139-RNP-01` | Aproximação RNP básica | Aproximação IFR | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP06 IAP2.2 | Primeira aproximação PBN. |
| 10 | `OPS-APP-X1` | Precision approach | Aproximação IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP3.2 | Após RNP/controle. |
| 11 | `OPS-APP-X2` | Non-precision approach | Aproximação IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.2 | Variação NPA. |
| 12 | `OPS-APP-X3` | Missed approach | Missed approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.3 | Após aproximação. |
| 13 | `OPS-APP-X4` | Large angle approach introdutório | Aproximação | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Variação introdutória. |
| 14 | `FLY-BAS-X4` | Recuperação de atitudes anormais em IFR básico | Recuperação | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Após base IFR. |
| 15 | `A139-CKL-01` | Normal checklist em contexto IFR | Checklist | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | FAP05.2 C2.1/C2.2 | Aplicado por fase, não como briefing. |
| 16 | `FLY-BAS-X1` | Transição visual/instrumental | Transição | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 basico/normais conforme aplicavel | Após IFR e antes do pouso. |
| 17 | `OPS-APP-X1` | Reaproximação de precisão — repetição técnica | Reaproximação | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP3.2 | Substitui itens COM/BRF saneados. |
| 18 | `OPS-APP-X3` | Repetição técnica de missed approach | Missed approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.3 | Reforço técnico. |

### Sessao 04/12 — CAS/QRH Anormalidades Simples

| ordem_aplicacao | codigo_final | nome_final | fase_voo | origem | decisao | fonte | fap_refs | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | `A139-CKL-02` | Aplicação prática do QRH para CAS/caution | Preparação do método | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Apresentar método antes do primeiro evento. Técnica observável se for localização/aplicação. |
| 2 | `CAU-DCG-53` | Single DC GEN failure | Cruzeiro / caution elétrica | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Evento simples. |
| 3 | `CAU-BOF-55` | Battery offline | Elétrico | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 4 | `CAU-DCB-56` | DC bus failure | Elétrico | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Aumenta complexidade. |
| 5 | `CAU-ACB-57` | AC bus failure | Elétrico | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Completa barramentos. |
| 6 | `CAU-28D-58` | 28V DC failure | Elétrico | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 7 | `CAU-ADS-46` | ADS failure | Avionics | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Bloco avionics. |
| 8 | `CAU-AHR-47` | AHRS failure | Avionics | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 9 | `CAU-DUD-46` | Display unit degraded | Displays | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Bloco displays. |
| 10 | `CAU-PFD-45` | PFD failure | Displays | renomeado | REAPROVEITAR_RENOMEANDO | AirTrust catalogo; PTO-A; QRH AW139 | - | Nome V4.1 corrige uso do código como nome. |
| 11 | `CAU-MFD-45` | MFD failure | Displays | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 12 | `CAU-EIC-45` | EICAS failure | Displays/EICAS | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 13 | `CAU-ADC-48` | ADC failure | Dados ar | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Após displays. |
| 14 | `CAU-GPS-52` | GPS failure | Navegação | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Bloco navegação. |
| 15 | `CAU-FMS-51` | FMS failure | Navegação | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 16 | `CAU-APO-38` | AP OFF | AFCS simples | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Após navegação. |
| 17 | `CAU-MIS-40` | AP MISTRIM | AFCS simples | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 18 | `CAU-SAS-41` | SAS degraded | AFCS simples | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Fecha anormalidades simples. |

### Sessao 05/12 — Engine/OEI Introdutório

| ordem_aplicacao | codigo_final | nome_final | fase_voo | origem | decisao | fonte | fap_refs | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | `WAR-OUT-15` | Engine failure | Cruzeiro estabilizado / evento | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Primeira falha motor em fase estabilizada. |
| 2 | `A139-IDF-01` | Identificação de falha de motor | Reconhecimento | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Após evento. |
| 3 | `A139-CKL-03` | QRH para engine failure / EEC FAIL em cruzeiro | QRH | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Após identificação. |
| 4 | `WAR-EEC-18` | EEC FAIL | Motor / evento correlato | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Após engine failure como família motor. |
| 5 | `A139-OEI-01` | Perfil OEI em cruzeiro | Perfil OEI | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Após QRH. |
| 6 | `CAU-LIC-60` | OEI limit timer | Monitoramento OEI | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Após perfil OEI. |
| 7 | `CAU-CST-59` | Compressor stall | Motor / evento | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Variação motor. |
| 8 | `CAU-OVS-64` | Engine overspeed | Motor / evento | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Variação. |
| 9 | `CAU-NGO-63` | NG overspeed | Motor / evento | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 10 | `CAU-HOT-65` | Hot start | Motor / solo/partida | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Validar se melhor em solo; manter como técnico. |
| 11 | `CAU-FLO-73` | Fuel low | Combustível em contexto motor | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Após motor. |
| 12 | `CAU-2FP-74` | Double fuel pump failure | Combustível | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 13 | `CAU-EFP-75` | Engine fuel pump failure | Combustível motor | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 14 | `WAR-OIL-18` | Oil pressure low | Óleo motor | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 15 | `CAU-CND-61` | Compressor no demand | Motor | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Variação. |
| 16 | `CAU-TNF-62` | Throttle non-follow | Motor/controle | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Variação. |
| 17 | `WAR-OUT-15` | Repetição técnica: engine failure em cruzeiro | Repetição técnica | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Substitui COM saneado. |
| 18 | `A139-CKL-03` | Repetição técnica: QRH engine/EEC | Repetição técnica | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Substitui BRF saneado. |

### Sessao 06/12 — CAT A/B Introdutório

| ordem_aplicacao | codigo_final | nome_final | fase_voo | origem | decisao | fonte | fap_refs | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | `A139-CKL-04` | QRH para CAT A/B e falha na decolagem/aproximação | Preparação método | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Antes de eventos CAT. |
| 2 | `OPS-NRM-X2` | Decolagens e pousos — perfil CAT A/B | Decolagem normal / perfil | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.2/H4.3 | Base normal. |
| 3 | `FLY-BAS-X3` | Hover e taxi / hover check pré-CAT A/B | Hover / preparação | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H2.3/H3.1 | Antes de TDP. |
| 4 | `A139-CATB-01` | Rejected takeoff / decolagem rejeitada CAT A | Decolagem / rejeição | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente com granularidade suficiente | - | Antes de continued. |
| 5 | `A139-CATB-02` | Continued takeoff com falha de motor CAT A | Decolagem / continued | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente com granularidade suficiente | - | Após rejected. |
| 6 | `WAR-OUT-15` | Engine failure na decolagem/aproximação | Evento motor | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Evento central. |
| 7 | `A139-IDF-01` | Identificação de falha | Reconhecimento | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Após evento. |
| 8 | `WAR-EEC-18` | EEC FAIL em contexto CAT A/B | Evento correlato | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Após engine failure. |
| 9 | `WAR-IDL-16` | Engine stuck IDLE | Evento correlato | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Alta criticidade. |
| 10 | `WAR-LOW-29` | Rotor RPM low | Rotor RPM | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Evento correlato. |
| 11 | `WAR-HIG-29` | Rotor RPM high | Rotor RPM | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Evento correlato. |
| 12 | `CAU-HYP-77` | Hydraulic pressure low | Hidráulico | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Pode afetar perfil. |
| 13 | `CAU-SRV-80` | Servo bypass | Hidráulico/servo | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 14 | `WAR-GER-27` | Landing gear emergency | Trem/pouso | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Preparar pouso. |
| 15 | `A139-POU-01` | Pouso monomotor CAT A/B | Pouso OEI | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente com granularidade suficiente | - | Após aproximação/perfil. |
| 16 | `OPS-NRM-X1` | Procedimentos normais aplicados a CAT A/B | Normalização | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.1/H4.3 | Fechar com normalização. |
| 17 | `A139-CATB-01` | Repetição técnica rejected takeoff | Repetição técnica | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente com granularidade suficiente | - | Substitui COM saneado. |
| 18 | `A139-CATB-02` | Repetição técnica continued takeoff | Repetição técnica | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente com granularidade suficiente | - | Substitui BRF saneado. |

### Sessao 07/12 — AFCS/Avionics

| ordem_aplicacao | codigo_final | nome_final | fase_voo | origem | decisao | fonte | fap_refs | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | `CAU-APF-37` | AP failure | Enroute / AFCS | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Evento principal AFCS. |
| 2 | `CAU-MIS-40` | AP MISTRIM | AFCS | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 3 | `CAU-SAS-41` | SAS degraded | AFCS | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 4 | `CAU-AFD-41` | AFCS degraded | AFCS | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Aumenta degradação. |
| 5 | `FLY-BAS-X4` | Recuperação de atitudes anormais com AFCS degradado | Recuperação | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Aplicar após degradação. |
| 6 | `A139-VMA-01` | Voo manual por instrumentos em contexto degradado | Voo manual IFR | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Após AFCS degraded. |
| 7 | `CAU-ADS-46` | ADS failure | Avionics | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Novo bloco. |
| 8 | `CAU-AHR-47` | AHRS failure | Avionics | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 9 | `CAU-DUD-46` | Display unit degraded | Displays | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Novo bloco. |
| 10 | `CAU-PFD-45` | PFD failure | Displays | renomeado | REAPROVEITAR_RENOMEANDO | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 11 | `CAU-MFD-45` | MFD failure | Displays | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 12 | `CAU-EIC-45` | EICAS failure | Displays/EICAS | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 13 | `CAU-ADC-48` | ADC failure | Air data | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Após displays. |
| 14 | `CAU-GPS-52` | GPS failure | Navegação | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Bloco navegação. |
| 15 | `CAU-FMS-51` | FMS failure | Navegação | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 16 | `OPS-APP-X1` | Precision approach com AFCS/avionics degradado | Aproximação | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP3.2 | Após falhas de avionics. |
| 17 | `CAU-APF-37` | Repetição técnica AP failure | Repetição técnica | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Substitui COM saneado. |
| 18 | `CAU-AFD-41` | Repetição técnica AFCS degraded | Repetição técnica | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Substitui BRF saneado. |

### Sessao 08/12 — Rotor/Transmission/Hydraulic

| ordem_aplicacao | codigo_final | nome_final | fase_voo | origem | decisao | fonte | fap_refs | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | `WAR-MGB-30` | MGB oil pressure | Transmissão | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Primeiro bloco transmissão. |
| 2 | `WAR-TMP-30` | MGB oil temp high | Transmissão | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 3 | `CAU-MGP-105` | MGB chip detected | Transmissão | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 4 | `WAR-TDR-X1` | Tail rotor drive failure | Tail rotor | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Após MGB/transmissão. |
| 5 | `WAR-TCS-X1` | Tail rotor control failure | Tail rotor | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 6 | `WAR-MRC-X1` | Main rotor binding | Rotor principal | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Bloco rotor. |
| 7 | `WAR-TRC-X1` | Tail rotor binding | Rotor de cauda | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 8 | `CAU-HYP-77` | Hydraulic pressure low | Hidráulico | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Após rotor/transmissão. |
| 9 | `CAU-SRV-80` | Servo bypass | Servo | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 10 | `WAR-LOW-29` | Rotor RPM low | Rotor RPM | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Antes de autorrotação. |
| 11 | `WAR-HIG-29` | Rotor RPM high | Rotor RPM | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 12 | `A139-ENE-01` | Controle de energia/RPM em autorrotação | Autorrotacão / energia | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Pré-requisito. |
| 13 | `FLY-BAS-17` | Autorotação | Autorrotacão | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Após energia/RPM. |
| 14 | `A139-REC-01` | Recuperação de autorrotação | Recuperação | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Após autorrotação. |
| 15 | `A139-CKL-05` | Ações de memória e QRH para rotor/transmissão | QRH | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Após evento. |
| 16 | `WAR-GER-27` | Landing gear emergency | Trem/pouso | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Preparar pouso seguro. |
| 17 | `FLY-BAS-17` | Repetição técnica autorrotação | Repetição técnica | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Substitui COM saneado. |
| 18 | `A139-ENE-01` | Repetição técnica controle energia/RPM | Repetição técnica | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Substitui BRF saneado. |

### Sessao 09/12 — Fire/Smoke/Emergências Avançadas

| ordem_aplicacao | codigo_final | nome_final | fase_voo | origem | decisao | fonte | fap_refs | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | `WAR-FIR-21` | Engine fire | Fogo motor | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Evento principal. |
| 2 | `A139-CKL-06` | Ações de memória para fogo/fumaça | Ações imediatas / QRH | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Após fogo. |
| 3 | `WAR-CAB-23` | Cabin/cockpit smoke | Fumaça cabine | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Novo bloco. |
| 4 | `WAR-BAG-23` | Baggage fire | Fogo bagagem | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 5 | `CAU-O2P-82` | O2 pressure low | Sistema O2 | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Após fumaça. |
| 6 | `WAR-OUT-15` | Engine failure alto estresse | Motor / alto estresse | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Após fogo/fumaça. |
| 7 | `CAU-HOT-65` | Hot start em cenário avançado | Motor / solo | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Variação. |
| 8 | `CAU-FLO-73` | Fuel low em emergência | Combustível | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 9 | `CAU-HYP-77` | Hydraulic pressure low | Hidráulico | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 10 | `CAU-SRV-80` | Servo bypass | Servo | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 11 | `WAR-LOW-29` | Rotor RPM low | Rotor RPM | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Alta severidade. |
| 12 | `WAR-HIG-29` | Rotor RPM high | Rotor RPM | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Alta severidade. |
| 13 | `WAR-GER-27` | Landing gear emergency | Trem/pouso | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Preparar pouso. |
| 14 | `FLY-BAS-17` | Autorotação em alto estresse | Autorrotacão | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Depois de sessão 08. |
| 15 | `OPS-APP-X1` | Precision approach em emergência | Aproximação | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP3.2 | Após eventos e checklist. |
| 16 | `OPS-APP-X3` | Missed approach em emergência | Missed approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.3 | Após aproximação. |
| 17 | `WAR-FIR-21` | Repetição técnica engine fire | Repetição técnica | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Substitui COM saneado. |
| 18 | `A139-CKL-06` | Repetição técnica QRH fogo/fumaça | Repetição técnica | novo | NOVA_MANOBRA_NECESSARIA | catalogo nao tem item equivalente | - | Substitui BRF saneado. |

### Sessao 10/12 — Offshore/Helideck

| ordem_aplicacao | codigo_final | nome_final | fase_voo | origem | decisao | fonte | fap_refs | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | `OPS-OFF-X1` | Navegação offshore | Rota offshore | existente | REALOCAR | AirTrust catalogo; PTO-A | FAP14 Offshore/SOP | Começa com navegação para UM. |
| 2 | `OPS-NAV-X1` | Navegação FMS e convencional em offshore | Rota offshore | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.5 | Setup/execução de rota. |
| 3 | `OPS-NAV-X2` | Uso AP e automação em offshore | Rota offshore | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.3/CIR.5 conforme aplicavel | Após rota. |
| 4 | `CAU-FLO-73` | Fuel low em rota offshore | Rota / evento | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Evento compatível com rota. |
| 5 | `WAR-GEN-11` | Dual DC GEN failure | Rota / evento | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Evento em rota. |
| 6 | `WAR-OUT-15` | Engine failure em offshore | Rota offshore / evento | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Evento motor em contexto correto. |
| 7 | `CAU-2FP-74` | Double fuel pump failure | Rota / combustível | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato combustível. |
| 8 | `CAU-LIC-60` | OEI limit timer | OEI offshore | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Após engine event. |
| 9 | `OPS-OFF-X2` | Aproximação offshore | Aproximação offshore | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP14 Offshore/SOP | Após rota/eventos. |
| 10 | `OPS-APP-X4` | Aproximação grande ângulo | Aproximação offshore | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Variação técnica. |
| 11 | `OPS-APP-X1` | Precision approach em contexto offshore | Aproximação | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP3.2 | Se cenário IFR. |
| 12 | `OPS-NRM-X2` | Decolagens e pousos em contexto offshore | Helideck / pouso/decolagem | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.2/H4.3 | Após aproximação. |
| 13 | `OPS-APP-X3` | Missed approach / arremetida offshore | Arremetida | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.3 | Após aproximação. |
| 14 | `WAR-LOW-29` | Rotor RPM low em offshore | Evento offshore avançado | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Se inserido no contexto helideck/rota. |
| 15 | `WAR-HIG-29` | Rotor RPM high em offshore | Evento offshore avançado | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Correlato. |
| 16 | `FLY-BAS-17` | Autorotação em proximidade da água | Autorrotacão / água | existente | REALOCAR | AirTrust catalogo; PTO-A | - | Só na sessão offshore avançada. |
| 17 | `OPS-OFF-X3` | Ditching / flutuabilidade AW139 | Ditching | novo (ja proposto pela V3) | VALIDAR_QRH | AirTrust catalogo; PTO-A; QRH AW139 | FAP14 Offshore | Após autorrotação/emergência offshore. Validar QRH. |
| 18 | `CAU-HOT-65` | Hot start / item de reforço em contexto offshore | Reforço técnico | existente | REALOCAR | AirTrust catalogo; PTO-A; QRH AW139 | - | Verificar se deve permanecer nesta sessão ou voltar a motor. Pendente de validação. |

### Sessao 11/12 — LOFT

| ordem_aplicacao | codigo_final | nome_final | fase_voo | origem | decisao | fonte | fap_refs | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | `LOFT-CHK-01` | Performance e cálculos de decolagem IFR | Planejamento missão | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Planejamento/Performance; FAP06 CIR.1 | Começa no planejamento. Treinamento de cenário; pode haver orientação. |
| 2 | `LOFT-CHK-02` | Planejamento IFR, mínimos e alternado | Planejamento missão | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Planejamento IFR; FAP06 CIR.1; FAP05.2 Conhecimentos Gerais | Definir rota/minimos antes do FMS. |
| 3 | `LOFT-CHK-03` | Configuração completa do FMS | Preparação cockpit | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Planejamento IFR; FAP06 CIR.1 | Após planejamento. |
| 4 | `LOFT-CHK-05` | Inspeção, acionamento e checklists | Pré-voo / partida | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP05.2 C2.1/C2.2/H1.1/H4.1 | Antes do taxi/decolagem. |
| 5 | `LOFT-CHK-06` | Hover check e taxi IFR | Taxi / hover | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP05.2 H2.3/H3.1 | Antes da decolagem. |
| 6 | `LOFT-CHK-07` | Decolagem IFR — perfil CAT A em IMC | Decolagem IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 CIR.2/CIR.3; FAP05.2 H4.2 | Inicia missão. Aplicar conforme aeronave/frota. Treinamento de cenário. |
| 7 | `LOFT-CHK-08` | OEI pós-TDP — fly-away monomotor IFR | Decolagem / evento | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 CIR.4; FAP05.2 H7.4/H7.9 | Evento após TDP/decisão. |
| 8 | `LOFT-CHK-09` | Navegação IFR en route e gestão de FMS | Enroute | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Navegacao IFR; FAP06 CIR.5 | Após saída. |
| 9 | `LOFT-CHK-10` | Monitoramento de sistemas e path monitoring | Enroute / monitoramento técnico | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IFF.1/IFF.2 | Durante rota. |
| 10 | `LOFT-CHK-11` | Gestão de falha de sistema em rota | Enroute / evento | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP05.2 H7.7; FAP06 IFL.1 | Evento no momento de rota. |
| 11 | `LOFT-CHK-12` | Chegada STAR/RNAV e descida | Chegada/descida | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Descida/Chegada; FAP06 CIR.6 | Após rota e replanejamento. |
| 12 | `LOFT-CHK-13` | Procedimento de espera IFR | Espera | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Espera; FAP06 CIR.7 | Antes da aproximação. |
| 13 | `LOFT-CHK-14` | Aproximação não precisão — RNAV ou VOR | Aproximação IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP2.1/IAP2.2 | Primeira aproximação. |
| 14 | `LOFT-CHK-15` | Arremetida por abaixo dos mínimos (NPA) | Missed approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP2.3 | Só após NPA. |
| 15 | `LOFT-CHK-17` | Setup para ILS | Reaproximação | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP3.1 | Preparar nova aproximação. Briefing como técnica só se for setup técnico; comportamento fica NOTECHS. |
| 16 | `LOFT-CHK-18` | Aproximação ILS — final e decisão na DA | Aproximação IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP3.2; FAP14 Aproximacao de precisao | Após setup ILS. |
| 17 | `LOFT-CHK-19` | Pouso no alternado e procedimentos pós-voo | Pouso / pós-voo | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP05.2 H4.3/H4.5/C2.3 | Fecha o cenário. |
| 18 | `LOFT-CHK-23` | Painel limitado / falha de instrumentos IFR | Evento avaliável opcional dentro do cenário | novo | VALIDAR_FAP | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 painel limitado/falha de instrumentos; validar FAP | Pode ser inserido em rota ou aproximação; registrar posição do evento no briefing do cenário. |

### Sessao 12/12 — LOFT Check

| ordem_aplicacao | codigo_final | nome_final | fase_voo | origem | decisao | fonte | fap_refs | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | `LOFT-CHK-01` | Performance e cálculos de decolagem IFR | Planejamento missão | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Planejamento/Performance; FAP06 CIR.1 | Começa no planejamento. Treinamento de cenário; pode haver orientação. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 2 | `LOFT-CHK-02` | Planejamento IFR, mínimos e alternado | Planejamento missão | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Planejamento IFR; FAP06 CIR.1; FAP05.2 Conhecimentos Gerais | Definir rota/minimos antes do FMS. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 3 | `LOFT-CHK-03` | Configuração completa do FMS | Preparação cockpit | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Planejamento IFR; FAP06 CIR.1 | Após planejamento. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 4 | `LOFT-CHK-05` | Inspeção, acionamento e checklists | Pré-voo / partida | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP05.2 C2.1/C2.2/H1.1/H4.1 | Antes do taxi/decolagem. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 5 | `LOFT-CHK-06` | Hover check e taxi IFR | Taxi / hover | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP05.2 H2.3/H3.1 | Antes da decolagem. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 6 | `LOFT-CHK-07` | Decolagem IFR — perfil CAT A em IMC | Decolagem IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 CIR.2/CIR.3; FAP05.2 H4.2 | Inicia missão. Aplicar conforme aeronave/frota. Treinamento de cenário. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 7 | `LOFT-CHK-08` | OEI pós-TDP — fly-away monomotor IFR | Decolagem / evento | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 CIR.4; FAP05.2 H7.4/H7.9 | Evento após TDP/decisão. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 8 | `LOFT-CHK-09` | Navegação IFR en route e gestão de FMS | Enroute | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Navegacao IFR; FAP06 CIR.5 | Após saída. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 9 | `LOFT-CHK-10` | Monitoramento de sistemas e path monitoring | Enroute / monitoramento técnico | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IFF.1/IFF.2 | Durante rota. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 10 | `LOFT-CHK-11` | Gestão de falha de sistema em rota | Enroute / evento | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP05.2 H7.7; FAP06 IFL.1 | Evento no momento de rota. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 11 | `LOFT-CHK-12` | Chegada STAR/RNAV e descida | Chegada/descida | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Descida/Chegada; FAP06 CIR.6 | Após rota e replanejamento. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 12 | `LOFT-CHK-13` | Procedimento de espera IFR | Espera | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Espera; FAP06 CIR.7 | Antes da aproximação. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 13 | `LOFT-CHK-14` | Aproximação não precisão — RNAV ou VOR | Aproximação IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP2.1/IAP2.2 | Primeira aproximação. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 14 | `LOFT-CHK-15` | Arremetida por abaixo dos mínimos (NPA) | Missed approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP2.3 | Só após NPA. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 15 | `LOFT-CHK-17` | Setup para ILS | Reaproximação | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP3.1 | Preparar nova aproximação. Briefing como técnica só se for setup técnico; comportamento fica NOTECHS. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 16 | `LOFT-CHK-18` | Aproximação ILS — final e decisão na DA | Aproximação IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP3.2; FAP14 Aproximacao de precisao | Após setup ILS. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 17 | `LOFT-CHK-19` | Pouso no alternado e procedimentos pós-voo | Pouso / pós-voo | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP05.2 H4.3/H4.5/C2.3 | Fecha o cenário. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |
| 18 | `LOFT-CHK-23` | Painel limitado / falha de instrumentos IFR | Evento avaliável opcional dentro do cenário | novo | VALIDAR_FAP | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 painel limitado/falha de instrumentos; validar FAP | Pode ser inserido em rota ou aproximação; registrar posição do evento no briefing do cenário. / carater=avaliativo; sem conteudo novo; fonte=FAP 05.2/06/14/PTO |

---

## 7. Matriz S76/SK76 Periodico — consolidada

Preservada da V4 (que ja tinha aplicado a unica correcao de saneamento necessaria: `S76-LOFT-15` "Aplicacao do QRH" -> "Aplicacao do ECL"). As 9 sessoes (Ciclo 1/2/3, Sessao 01-03/03) nao foram redesenhadas nem resequenciadas linha a linha porque a V4 ja preservou a logica periodica correta e a V4.1 confirmou que nao ha outro item generico/comportamental nelas. A sequencia operacional obrigatoria (V4.2) e regida por regras, nao por tabela linha a linha, dado o volume:

| tipo de sessao | sequencia V4.2 obrigatoria | observacao |
|---|---|---|
| VFR/emergências | checklist normal → decolagem/perfil visual → evento de motor/sistema do ciclo → ECL → aproximação/pouso ou arremetida → encerramento | Corrigir qualquer "QRH" para ECL/checklist, salvo validação contrária. |
| IFR/noturno/offshore | setup IFR → saída/navegação → evento compatível com rota/IFR/offshore → ECL → aproximação/missed → pouso/alternado | Não inserir pane offshore antes de contexto offshore. |
| LOFT/check | planejamento → execução normal → evento do ciclo → ECL → replanejamento → aproximação/pouso → itens FAP | Se for check, marcar `carater=avaliativo`. |

A tabela completa dos 18 itens de cada uma das 9 sessoes (com origem/decisao/fonte/fap_refs) permanece em `COSTA_DO_SOL_MATRIZ_V4_PEDAGOGICA_20260703.md`, secao 6, e a correcao de nome em `COSTA_DO_SOL_MATRIZ_V4_1_SANEAMENTO_20260703.md`, secao 7. Nenhum item generico/comportamental foi encontrado alem do ja corrigido.

## 8. Matriz AW139 Periodico — consolidada (4 sessoes/ciclo, recomendacao principal)

Preservada da V4 sem alteracao de conteudo — as 12 sessoes (Ciclo 1/2/3, Sessao 01-04/04: VFR/emergencias; IFR/noturno/offshore; LOFT/Offshore; LOFT/Check) ja usam corretamente a terminologia QRH/CAS/AFCS/CAT A-B/offshore da frota AW139, e nao foi encontrado item comportamental/generico nas 18 tecnicas de nenhuma sessao. Regras de sequencia obrigatorias (V4.2):

| tipo de sessao | sequência V4.2 obrigatória | observação |
|---|---|---|
| VFR/emergências | normal checklist → decolagem/perfil visual → CAS/QRH event do ciclo → QRH → aproximação/pouso | Usar QRH/CAS AW139. |
| IFR/noturno/offshore | setup FMS/IFR → saída/enroute → AFCS/CAS/evento do ciclo → QRH → approach/missed → pouso | Não comprimir offshore/LOFT nesta sessão. |
| LOFT/Offshore | missão offshore → navegação/helideck → evento offshore compatível → QRH → retorno/alternado/ditching → encerramento | Ditching/flutuabilidade só após contexto offshore. |
| LOFT/Check | preparação → execução normal → evento avaliativo → FAP técnica → QRH/checklist → aproximação/pouso → encerramento | `carater=avaliativo`; sem conteúdo novo. |

A tabela completa dos 18 itens de cada uma das 12 sessoes permanece em `COSTA_DO_SOL_MATRIZ_V4_PEDAGOGICA_20260703.md`, secao 7. A alternativa de 3 sessoes/ciclo continua nao recomendada, pelos mesmos motivos ja documentados (comprime CAT A/B, helideck, ditching e check IFR).

---

## 9. LOFT vs LOFT Check

### LOFT (Sessao 11, ambas as aeronaves)

Carater: treinamento de cenario integrado. Pode haver orientacao do instrutor, pausa pedagogica, repeticao parcial, cenario narrativo, integracao normal + anormal + retorno/alternado, treino de QRH/ECL, treino de FAP sem carater de cheque.

### LOFT Check (Sessao 12, ambas as aeronaves)

Carater: avaliacao final. Deve conter cenario integrado, sem ensinar conteudo novo, sem pausa pedagogica salvo por seguranca, cobertura de FAP 05.2/06/14, criterios de proficiencia, julgamento tecnico final, com NOTECHS como evidencia comportamental separada (fora das 18).

Campos futuros sugeridos para a estrutura de dados (ainda sem implementacao), ja aplicados como marcador textual em toda linha das sessoes 12/12 nas secoes 5 e 6:

```text
carater = avaliativo
fonte = FAP 05.2 / FAP 06 / FAP 14 / PTO
sem_conteudo_novo = sim
```

## 10. Cobertura FAP

### FAP 05.2

| elemento_fap | treina_em | checa_em | manobra_airtrust | status |
|---|---|---|---|---|
| Procedimentos pre-voo / inspecao / acionamento / cheques | S76 Sessao 01 (`S76-CKL-01`), AW139 Sessao 01 (`A139-CKL-01`), Sessao 11 (LOFT) | LOFT-CHK-05, S76-LOFT-05 | LOFT-CHK-05 / S76-LOFT-05 | coberto |
| Hover / taxi | S76 Sessao 01-02 (`S76-HOV-00`, `S76-TAX-01`), AW139 Sessao 01-02 (`FLY-BAS-X3`, `A139-TAX-01`) | LOFT-CHK-06, S76-HOV-00, S76-LOFT-07 | LOFT-CHK-06 / S76-HOV-00 | coberto |
| Decolagem normal / perfil de saida | S76 Sessao 01-02 (`S76-DNR-01`), AW139 Sessao 01-02 (`OPS-NRM-X2`) | LOFT-CHK-07, S76-TDP-00, S76-LOFT-08 | LOFT-CHK-07 / S76-TDP-00 | coberto |
| Aproximacao / pouso normal | S76 Sessao 01-02 (`S76-APN-01`, `S76-PNO-01`, `S76-STB-01`), AW139 Sessao 01-02 (`A139-STB-01/02`, `A139-ARN-01`) | LOFT-CHK-18/19, S76-LOFT-19/20 | LOFT-CHK-18/19 | coberto — ver pendencia sobre `S76-LDP-00`/`S76-VOR-00` (secao 12) |
| Falha de motor / falhas de sistemas / emergencias | S76 Sessoes 05-09, AW139 Sessoes 05-09, ciclos periodicos | LOFT-CHK-08/10/11, S76-DM1-22, S76-DMB-24, S76-DIT-71 | LOFT-CHK-08 / S76-DM1-22 / S76-DIT-71 | coberto com validacao fina ECL/QRH |

### FAP 06

| elemento_fap | treina_em | checa_em | manobra_airtrust | status |
|---|---|---|---|---|
| Testar/monitorar instrumentos; painel completo | S76 Sessao 03/07, AW139 Sessao 03/07, ciclos IFR | LOFT-CHK-10, S76-CGI-00, S76-FDA-00 | LOFT-CHK-10 / S76-CGI-00 | coberto |
| Painel limitado / falha de instrumentos | S76 Sessao 07/11/12, AW139 Sessao 11/12, ciclos periodicos IFR | LOFT-CHK-23 | LOFT-CHK-23 | coberto com validacao FAP |
| Saida IFR / saida IFR com falha de motor | S76 Sessao 03/05/06, AW139 Sessao 03/05/06, periodicos IFR | LOFT-CHK-07/08 | LOFT-CHK-07/08 | coberto |
| Navegacao IFR / descida / chegada / espera | S76 Sessao 03, AW139 Sessao 03, ciclos IFR | LOFT-CHK-09/12/13 | LOFT-CHK-09/12/13 | coberto |
| NPA / missed / precisao / ILS | S76 Sessao 03/05/06/10/11/12, AW139 Sessao 03/05/06/09/10/11/12, ciclos IFR | LOFT-CHK-14/15/17/18 | LOFT-CHK-14/15/17/18 | coberto |

### FAP 14

| elemento_fap | treina_em | checa_em | manobra_airtrust | status |
|---|---|---|---|---|
| Planejamento / performance em rota e offshore | S76 Sessao 10/11/12, AW139 Sessao 10/11/12, S76-LOFT, A139-LOFT/OFF | LOFT-OFF-01, LOFT-CHK-01/02/03, S76-LOFT-01/02/03 | LOFT-OFF-01 / LOFT-CHK-01 | coberto com validacao PTO |
| Navegacao / chegada / operacao IFR | ciclos IFR periodicos, S76/AW139 Sessao 03/11/12 | LOFT-CHK-09/12/13/18, S76-LOFT-11/18/19 | LOFT-CHK-09/12/13/18 | coberto |
| Operacao com tripulacao multipla / offshore | S76 Sessao 10, AW139 Sessao 10, LOFT/Offshore periodico | LOFT-OFF-07..21, S76-LOFT-18..20 | LOFT-OFF-07..21 / S76-LOFT-18..20 | coberto com validacao owner/PTO |

Itens NTS/CRM das FAPs sao cobertos por NOTECHS-01..15, nunca pelas 18 tecnicas.

## 11. Codigos novos finais (consolidado V4 + V4.1 + V4.2)

### 11.1 S76/SK76

Codigos novos liquidos apos saneamento (V4.1) e sequenciamento (V4.2): **38**, distribuidos como:

| categoria | codigos |
|---|---|
| Removidos da contagem (nao viram tecnica) | `S76-COM-01`, `S76-BRF-01`, `S76-SEG-01` |
| Fundidos com codigo existente | `S76-ORI-01` (fundido em `S76-CGI-00` na Sessao 03) |
| Substitutos tecnicos (V4.1) | `S76-PWR-01`, `S76-PED-01`, `S76-HVT-01`, `S76-STB-01`, `S76-GAR-01` |
| Novo adicional (V4.2) | `S76-INS-01` (cheque de instrumentos pos-partida) |
| Demais novos (fundamentos normais, IFR basico, ECL por evento, offshore) | `S76-CAB-01`, `S76-CKL-01`, `S76-PNR-01`, `S76-TAX-01`, `S76-DNR-01`, `S76-SUB-01`, `S76-CRV-01`, `S76-CIR-01`, `S76-APN-01`, `S76-ARN-01`, `S76-PNO-01`, `S76-EST-01`, `S76-CTV-01`, `S76-DSC-01`, `S76-REC-01`, `S76-VCZ-01`, `S76-SCN-01`, `S76-VMA-01`, `S76-ORI-01` (referencia, ver fusao acima), `S76-CKL-02`, `S76-APN-02`, `S76-IDF-01`, `S76-CKL-03`, `S76-OEI-01`, `S76-APX-02`, `S76-CKL-04`, `S76-ENE-01`, `S76-REC-02`, `S76-CKL-05`, `S76-CKL-06`, `S76-CKL-07`, `S76-APO-01`, `S76-ARO-01`, `S76-FLU-01` |

### 11.2 AW139

Codigos novos liquidos apos saneamento (V4.1) e sequenciamento (V4.2): **36**, distribuidos como:

| categoria | codigos |
|---|---|
| Removidos da contagem (nao viram tecnica) | `A139-COM-01`, `A139-BRF-01`, `A139-DBR-01` |
| Renomeados (mantidos como tecnica, nao removidos) | `A139-CAS-01`, `A139-QRH-01`, `A139-AFB-01` -> `A139-AFC-01` |
| Substitutos tecnicos (V4.1) | `A139-PWR-01`, `A139-FMA-01`, `A139-STB-01`, `A139-MOD-01`, `A139-FMA-02`, `A139-HLD-01`, `A139-STB-02` |
| Demais novos (fundamentos normais, IFR basico, engine/OEI, CAT A/B, rotor/autorrotacao, fogo) | `A139-CAB-01`, `A139-CKL-01`, `A139-TAX-01`, `A139-ARN-01`, `A139-DBR-01` (referencia, ver remocao acima), `A139-SUB-01`, `A139-CRV-01`, `A139-DSC-01`, `A139-VCZ-01`, `A139-REC-02`, `A139-SCN-02`, `A139-VMA-01`, `A139-ORI-01`, `A139-RNP-01`, `A139-CKL-02`, `A139-IDF-01`, `A139-CKL-03`, `A139-OEI-01`, `A139-CATB-01`, `A139-CATB-02`, `A139-POU-01`, `A139-CKL-04`, `A139-ENE-01`, `A139-REC-01`, `A139-CKL-05`, `A139-CKL-06` |
| Ja proposta pela V3, posicionada agora | `OPS-OFF-X3` (ditching/flutuabilidade, unica introducao na Sessao 10) |

### 11.3 Codigos legados (sem hard delete)

`LOFT-CHK-04/16/20/21/22`, `S76-CRM-01`, `S76-LOFT-12/16/21/22`, `LOFT-OFF-22`, `LOFT-NOT-20/21/22` — CRM/NTS historico, substituido por NOTECHS-01..15 nas fichas novas, mantido como legado logico sem exclusao fisica.

## 12. Pendencias de validacao

- **Instrutor S76**: validar granularidade e nomenclatura dos 38 codigos novos propostos (secao 11.1), confirmar onde `76-*` legado ainda deve ser mantido vs onde ja cabe normalizacao para `S76-*`.
- **Instrutor AW139**: validar granularidade e nomenclatura dos 36 codigos novos propostos (secao 11.2), confirmar CAT A/B por area operacional (Offshore & Enhanced Offshore Helideck).
- **Owner**: confirmar definitivamente a recomendacao de AW139 periodico em 4 sessoes/ciclo; validar a divergencia de sequencia de sessao frente ao PTO Rev. 10 (a V4 diverge da numeracao literal do PTO — ver V4 secao 2.2).
- **PTO-A**: fonte usada extensivamente; confirmar granularidade dos itens realocados entre sessoes.
- **PTO-B/complementar**: nao localizado no workspace (heranca V3/V4).
- **ECL S76**: nao localizado em texto integral no workspace; validar `Servo SYS`, `Fuel Pressure`, `Fuel Low`, `IIDS`, trem, e a familia de codigos `76-*` -> `S76-*` (secao 3.1 da V4).
- **QRH AW139**: nao localizado em texto integral no workspace; validar todos os itens `CAU-*`/`WAR-*` e o `OPS-OFF-X3`.
- **FAP 05.2 / FAP 06 / FAP 14**: cobertura mapeada (secao 10); confirmar textualmente contra o documento fonte FAP antes de qualquer implementacao.
- **Layout PDF**: fora do escopo desta matriz (tratado separadamente em `docs/analysis/notechs-previews-20260702/` e no gerador `src/react-app/services/pdf-ficha-client.ts`); nenhuma alteracao de layout foi feita ou e necessaria por este documento.
- **Implementacao futura**: nao iniciar sem aprovacao explicita do instrutor/owner sobre esta V5, e sem as validacoes ECL/QRH/FAP acima resolvidas.
- **Duas inconsistencias da V3 nao resolvidas** (heranca, ver V4 secao 2.3): `S76-VOR-00` e `S76-LDP-00` sao citados como reaproveitados nas tabelas de cobertura da V3/V4 mas nunca instanciados em nenhuma ficha concreta — confirmar existencia real no catalogo antes de depender deles.
- **Duplicacao de familia de codigo S76** (heranca, ver V4 secao 3.1): `76-*` (Inicial) e `S76-*-NN` (Periodico) cobrem conceitos de falha sobrepostos sem reconciliacao. Fora do escopo desta consolidacao; recomenda-se trabalho futuro dedicado.

## 13. Plano futuro seguro (apos aprovacao da V5)

A implementacao futura deve ser feita em etapa separada da revisao documental, somente apos aprovacao explicita de instrutor/owner sobre esta V5:

1. inventario completo do catalogo atual de manobras (todas as fichas, ambas as aeronaves);
2. dry-run de diff entre catalogo atual e a matriz V5 (sem escrita);
3. migration ou script idempotente, gerado somente apos o dry-run ser revisado;
4. preservacao de historico — nenhuma manobra ou vinculo antigo apagado;
5. soft-legacy (desativacao logica) em vez de hard delete para codigos que saem de uso;
6. testes automatizados cobrindo a nova estrutura de campos (`ordem_aplicacao`, `fase_voo`, `tipo_item`, `carater`, se implementados);
7. validacao visual das fichas em PDF antes de qualquer rollout;
8. nenhuma acao em producao ate autorizacao explicita, com plano de rollback por desativacao/soft-delete de vinculos novos.

## 14. Confirmacoes

- Nenhum codigo funcional foi implementado ou alterado.
- Nenhuma migration foi criada.
- Nenhum DML foi executado.
- Nenhum deploy foi realizado.
- Producao permaneceu intocada.
- Nenhum PR foi aberto.
- V4, V4.1 e V4.2 foram preservadas sem alteracao — apenas lidas para consolidacao.
- AW139 e S76/SK76 nao foram misturados em nenhuma tabela.
- NOTECHS permanece fora das 18 tecnicas em todas as 24 sessoes do Inicial e em todas as sessoes periodicas.
- COM/BRF/DBR genericos nao foram recolocados nas 18 tecnicas.
- Nenhum termo "homologado" ou "aprovado pela ANAC" foi usado neste documento.
- Nenhuma manobra foi excluida fisicamente (hard delete); legado tratado apenas como referencia logica (secao 11.3).
- Apenas o arquivo `docs/analysis/COSTA_DO_SOL_MATRIZ_V5_FINAL_REVISAVEL_20260703.md` foi criado por este trabalho.

## Criterios de GO da V5

GO para revisao operacional confirmado:
- S76/SK76 Inicial tem 12 sessoes (secao 5) — **sim**.
- AW139 Inicial tem 12 sessoes (secao 6) — **sim**.
- Sessao 11 e LOFT em ambas — **sim**.
- Sessao 12 e LOFT Check em ambas, com marcador `carater=avaliativo` — **sim**.
- 18 tecnicas por ficha, em todas as 24 sessoes do Inicial e em todas as sessoes periodicas — **sim**.
- NOTECHS fora das 18 — **sim**.
- Ordem de aplicacao logica (preparacao -> checklist -> partida -> ... -> encerramento) em todas as sessoes — **sim**.
- Nenhuma sessao 01 comeca com pane pesada sem preparacao (S76 e AW139) — **sim**.
- S76 nao usa QRH indevidamente (corrigido para ECL) — **sim**.
- AW139 nao mistura item S76 — **sim**.
- Periodicos estao organizados por ciclo (S76 3 sessoes, AW139 4 sessoes recomendado) — **sim**.
- FAP esta mapeada (secao 10) — **sim**.
- Pendencias estao claras e separadas por responsavel (secao 12) — **sim**.

## Criterios de NO-GO (verificados, nenhum presente)

- V5 fragmentada — **nao ocorre**: documento unico.
- Falta de 18 itens por ficha — **nao ocorre**: todas as 24 sessoes do Inicial tem exatamente 18 linhas (verificado programaticamente).
- Ordem de aplicacao pouco clara — **nao ocorre**: `ordem_aplicacao` e `fase_voo` explicitos em cada linha.
- COM/BRF/DBR de volta as 18 — **nao ocorre**: removidos e substituidos em todas as ocorrencias.
- LOFT e LOFT Check indistinguiveis — **nao ocorre**: LOFT Check carrega marcador `carater=avaliativo` em toda linha.
- FAP nao mapeada — **nao ocorre**: secao 10 completa.
- Sugestao de implementacao sem validacao — **nao ocorre**: secao 13 explicita que a implementacao so ocorre apos aprovacao.
- Alteracao funcional — **nao ocorre**: apenas este documento foi criado.

**Resultado: GO para revisao operacional com instrutor/owner. NO-GO para qualquer implementacao ate essa revisao humana ser concluida.**
