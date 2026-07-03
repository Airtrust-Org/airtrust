# Costa do Sol / AirTrust — Pacote de Revisão Operacional para Instrutor/Owner

**Data-base:** 2026-07-03
**Fonte:** `docs/analysis/COSTA_DO_SOL_MATRIZ_V5_FINAL_REVISAVEL_20260703.md`
**Caráter:** Documental. Nenhuma implementação, migration, DML, deploy ou alteração funcional. Apenas este arquivo foi criado.

---

## 1. Veredito

| Decisão | Status |
|---|---|
| GO para revisão operacional com instrutor/owner | ✅ |
| NO-GO para implementação no AirTrust | ✅ |
| NO-GO para migration/DML/deploy/produção | ✅ |

A **Matriz V5** é uma **proposta revisável**, não um documento final aprovado. Ela consolida três camadas anteriores (V4 pedagógica, V4.1 saneamento, V4.2 sequenciamento) em tabelas únicas por sessão, prontas para leitura e validação humana. As camadas V4, V4.1 e V4.2 **não foram alteradas** — a V5 apenas reúne o resultado final de cada uma.

**Nada neste pacote ou na V5 está homologado ou aprovado pela ANAC.**

---

## 2. O que mudou (em relação ao estado anterior à V4)

- **18 técnicas por ficha**, em todas as 24 sessões do Inicial (S76 e AW139) e em todas as sessões periódicas.
- **15 NOTECHS fixos fora das 18**, conforme `src/react-app/pages/simuladores/fichas/notechs.ts` — não foram reabertos nem recolocados dentro das 18.
- **Remoção de CRM/NTS/COM/BRF/DBR genéricos das 18 técnicas.** O que era briefing/comunicação/debrief genérico foi substituído por itens técnicos específicos (ex.: `S76-PWR-01` controle de potência, `S76-PED-01` controle de pedal, `A139-PWR-01` controle de potência AW139, `A139-FMA-01/02` monitoramento FMA).
- **Sequência lógica dentro da sessão:** preparação → checklist → partida/power-up → taxi/hover → decolagem → subida → cruzeiro/navegação → evento/anormalidade compatível com a fase → checklist/ECL/QRH → decisão técnica → aproximação → arremetida ou pouso → encerramento.
- **Sessão 11 = LOFT** (treinamento de cenário integrado, com orientação e pausa pedagógica permitidas).
- **Sessão 12 = LOFT Check** (avaliação final, sem conteúdo novo, marcador `carater=avaliativo` em toda linha).
- **S76/SK76 periódico em 3 sessões/ciclo:** VFR/emergências → IFR/noturno/offshore → LOFT/check.
- **AW139 periódico recomendado em 4 sessões/ciclo:** VFR/emergências → IFR/noturno/offshore → LOFT/Offshore → LOFT/Check. Esta é uma recomendação técnica que depende de validação do owner/PTO.

---

## 3. Resumo S76/SK76 Inicial — 12 Sessões

### Sessão 01/12 — Familiarização / Checklist Normal / Voo Normal Básico

- **Objetivo:** Primeiro contato com cabine, comandos, checklist e perfil de voo normal completo.
- **Lógica da sequência:** Cabine e instrumentos → checklist → partida → cheque pós-partida → taxi → hover → controle de pedal → transição hover-decolagem → decolagem → subida → perfil normal → controle de potência → curvas → circuito → aproximação → arremetida → pouso → estacionamento/corte.
- **Principais itens técnicos:** `S76-CAB-01`, `S76-CKL-01`, `S76-PNR-01`, `S76-INS-01`, `S76-TAX-01`, `S76-HOV-00`, `S76-PED-01`, `S76-HVT-01`, `S76-DNR-01`, `S76-SUB-01`, `S76-NVF-00`, `S76-PWR-01`, `S76-CRV-01`, `S76-CIR-01`, `S76-APN-01`, `S76-ARN-01`, `S76-PNO-01`, `S76-EST-01`.
- **Pontos que o instrutor deve validar:** A sessão 01 está adequada para aluno inicial? A sequência cockpit → partida → hover → decolagem → pouso está correta? `S76-CAB-01` e `S76-CKL-01` são realmente necessários como linhas separadas ou fundíveis?

### Sessão 02/12 — Voo Normal Consolidado / Perfil Visual

- **Objetivo:** Consolidar voo visual com variações (vento cruzado, arremetida por instabilidade, reentrada no circuito).
- **Lógica da sequência:** Checklist → hover precisão → decolagem → subida → cruzeiro → controle velocidade → curvas → descida → aproximação → aproximação estabilizada → arremetida → reentrada circuito → circuito 2ª volta → vento cruzado → arremetida por instabilidade → pouso → taxi → encerramento.
- **Principais itens técnicos:** `S76-CKL-01`, `S76-HOV-00`, `S76-DNR-01`, `S76-SUB-01`, `S76-NVF-00`, `S76-CTV-01`, `S76-CRV-01`, `S76-DSC-01`, `S76-APN-01`, `S76-STB-01`, `S76-ARN-01`, `S76-REC-01`, `S76-CIR-01`, `S76-VCZ-01`, `S76-GAR-01`, `S76-PNO-01`, `S76-TAX-01`, `S76-EST-01`.
- **Pontos que o instrutor deve validar:** `S76-STB-01` (aproximação estabilizada) está bem posicionada antes da arremetida? `S76-GAR-01` (arremetida por instabilidade) é distinto o suficiente de `S76-ARN-01`? Vento cruzado leve (`S76-VCZ-01`) se aplica à frota?

### Sessão 03/12 — IFR / Navegação Básico

- **Objetivo:** Introduzir voo IFR completo: programação GPS/FMS, saída IFR, navegação enroute, scan, espera, aproximações de precisão e não-precisão, missed approach.
- **Lógica da sequência:** Programação GPS/HSI/EFIS → normais IFR → flight director/automação → decolagem IFR/SID → SID & STAR → controle geral IFR → varredura instrumental → voo manual IFR → holding → RNAV/GPS → precisão → não-precisão → missed → arremetida IFR → atitudes anormais básica → reaproximações → holding/reposicionamento.
- **Principais itens técnicos:** `76-PRGGP`, `S76-NIF-00`, `S76-FDA-00`, `76-DECSI`, `S76-SID-00`, `S76-CGI-00`, `S76-SCN-01`, `S76-VMA-01`, `S76-HLD-00`, `S76-RNV-00`, `76-APXPR`, `76-APXNP`, `76-APXPI`, `76-ARRIF`, `S76-UAR-00`.
- **Pontos que o instrutor deve validar:** `S76-SCN-01` (varredura instrumental) é técnico o suficiente como uma das 18 ou deveria ser comportamento/NOTECHS? `S76-VMA-01` (voo manual IFR) está bem posicionado antes das aproximações?

### Sessão 04/12 — Anormalidades Simples / Checklist/ECL

- **Objetivo:** Introduzir anormalidades de baixa severidade (combustível, elétrica, instrumentos, automação, hidráulico simples) com uso do ECL.
- **Lógica da sequência:** Voo normal estabilizado → evento simples → ECL → aproximação/pouso → novo mini-cenário → repetir por família de sistema em severidade crescente.
- **Principais itens técnicos:** `S76-CKL-01`, `76-FLWNR`, `S76-FPL-31`, `76-OILMT`, `S76-CKL-02`, `S76-APN-02`, `76-FALGC`, `76-PER26`, `76-FALIV`, `76-FALAD`, `76-PERAT`, `76-FALEF`, `76-FALFD`, `76-FALRM`, `76-N1TQF`, `76-FALTS`, `76-HIDPB`, `76-FALFF`.
- **Pontos que o instrutor deve validar:** `S76-CKL-02` (uso do ECL para anormalidade) merece ser linha separada ou está embutido em cada item? `76-HIDPB` (hidráulico) e `76-FALFF` (feeder/bateria) são aplicáveis à frota?

### Sessão 05/12 — Motor em Cruzeiro / OEI Introdutório

- **Objetivo:** Primeira falha de motor em fase estabilizada (cruzeiro), com identificação, ECL, perfil OEI, crossfeed, DECU menor, monitoramento e aproximação/pouso monomotor.
- **Lógica da sequência:** Falha motor cruzeiro → identificação/diagnóstico → ECL → perfil OEI → crossfeed → DECU menor → monitoramento N1/Torque/combustível/óleo → controle IFR se aplicável → scan → aproximação planejada OEI → aproximação IFR OEI → atitudes anormais → pouso OEI → evento secundário → repetição técnica.
- **Principais itens técnicos:** `76-MOTCZ`, `S76-IDF-01`, `S76-CKL-03`, `S76-OEI-01`, `S76-XFD-20`, `S76-DMN-21`, `76-N1TQF`, `76-FLWNR`, `76-OILMT`, `S76-CGI-00`, `S76-SCN-01`, `S76-APX-02`, `76-APXOI`, `S76-UAR-00`, `S76-PNO-01`, `76-FALGC`.
- **Pontos que o instrutor deve validar:** A entrada de OEI está no momento correto (cruzeiro, não decolagem)? A entrada de DECU (`S76-DMN-21`) está correta como falha menor antes das falhas maiores da sessão 06? `S76-IDF-01` (identificação de falha) é observável como linha separada?

### Sessão 06/12 — OEI Decolagem/Aproximação / DECU

- **Objetivo:** Falha de motor em fases críticas (hover, decolagem, aproximação), DECU progressivo (degradado → maior 1 motor → maior ambos), CAT A/B, pouso monomotor.
- **Lógica da sequência:** DECU degradada → DECU maior 1 motor → DECU ambos motores → falha motor hover → CAT A decolagem → CAT B decolagem → rejected takeoff → ECL → monitoramento → crossfeed → falha motor aproximação → aproximação OEI → aproximação alternada → pouso monomotor → controle IFR → atitudes anormais → repetição.
- **Principais itens técnicos:** `S76-DDE-21`, `S76-DM1-22`, `S76-DMB-24`, `76-MOTHV`, `76-MOTCA`, `76-MOTCB`, `76-POUAB`, `S76-CKL-04`, `76-N1TQF`, `S76-XFD-20`, `76-MOTAP`, `76-APXOI`, `76-APXAL`, `76-POUMO`, `S76-CGI-00`, `S76-UAR-00`.
- **Pontos que o instrutor deve validar:** DECU em ambos os motores (`S76-DMB-24`) é realista para a frota? `76-MOTCA`/`76-MOTCB` (CAT A/B) — a nomenclatura está correta para S76? `76-APXAL` (aproximação alternada CAT A) tem uso operacional real na Costa do Sol?

### Sessão 07/12 — Sistemas Específicos

- **Objetivo:** Falhas de sistemas agrupadas por família: elétrico (geradores DC/AC, barramento, inversor, feeder), hidráulico (bomba, servo rotor cauda, atuador), comandos, trem de pouso, instrumentos, automação.
- **Lógica da sequência:** Elétrico simples → elétrico total → sobretemperatura → AC → barramento essencial → inversor → feeder → hidráulico → servo rotor cauda → atuador → comandos → trem indicação → trem extensão emergência → instrumentos → atitude IMC → piloto automático → flight director → indicação motor.
- **Principais itens técnicos:** `76-FALGC`, `76-FALGD`, `76-SOBGD`, `76-FALGA`, `76-FALEB`, `76-FALIV`, `76-FALFF`, `76-HIDPB`, `76-SERTQ`, `76-SERJM`, `76-AMOTV`, `S76-UGR-46`, `S76-LGB-47`, `76-FALAD`, `76-PERAT`, `76-FALPA`, `76-FALFD`, `76-N1TQF`.
- **Pontos que o instrutor deve validar:** A sequência de famílias (elétrico → hidráulico → comandos → trem → instrumentos → automação) está adequada? `76-FALFF` (feeder/bateria) repete item da sessão 04 — manter em ambas? `76-SERTQ` e `76-SERJM` dependem de validação ECL.

### Sessão 08/12 — Rotor / Transmissão / Autorrotação

- **Objetivo:** Falhas de MGB, transmissão, rotor de cauda, rotor principal, controle de RPM/energia e autorrotação.
- **Lógica da sequência:** MGB falhas → MGB óleo → chip/alta temperatura → transmissão rotor cauda → controle rotor cauda → tail rotor hover → tail rotor eixo → dano rotor cauda → NR overspeed → NR low → controle energia/RPM → autorrotação terra → recuperação → ECL → vibração rotor principal → comandos → repetição.
- **Principais itens técnicos:** `76-MGBSF`, `76-MGBOL`, `76-CHPTG`, `76-TRSRC`, `76-CTRRC`, `S76-TRH-38`, `S76-TRD-39`, `S76-TDM-41`, `S76-NRO-00`, `S76-NRL-00`, `S76-ENE-01`, `S76-AUT-70`, `S76-REC-02`, `S76-CKL-05`, `S76-MRV-00`, `76-AMOTV`.
- **Pontos que o instrutor deve validar:** Autorrotação está no momento certo (sessão 08, não antes)? `S76-ENE-01` (controle de energia/RPM) como pré-requisito antes da autorrotação está correto? `S76-REC-02` (recuperação de autorrotação) é distinto o suficiente?

### Sessão 09/12 — Fogo/Fumaça e Emergências Avançadas

- **Objetivo:** Incêndio motor/cabine/bagagem, fumaça, fogo elétrico (VMC/IMC), falha dupla de motor (cruzeiro → decolagem → hover), pouso abortado e monomotor em cenário complexo.
- **Lógica da sequência:** Incêndio motor → fogo motor voo → ações memória → fogo interno pós-shutdown → fogo motor solo → incêndio cabine → fumaça cabine → fumaça bagagem → fogo elétrico VMC → fogo elétrico IMC → falha dupla cruzeiro → falha dupla decolagem → falha dupla hover → geradores DC → pouso abortado fogo → pouso monomotor → repetição.
- **Principais itens técnicos:** `76-INCMO`, `S76-FMF-07`, `S76-CKL-06`, `S76-FMI-09`, `S76-FMG-08`, `76-INCCB`, `S76-CCF-10`, `76-FUMBG`, `S76-EFV-11`, `S76-EFI-12`, `76-DUACZ`, `76-DUADC`, `76-DUAHV`, `76-FALGD`, `76-POUAB`, `76-POUMO`.
- **Pontos que o instrutor deve validar:** Falha dupla em hover (`76-DUAHV`) é realista/segura para treinamento em simulador? `S76-CKL-06` (ações de memória fogo/fumaça) merece linha separada?

### Sessão 10/12 — Offshore / Unidade Marítima

- **Objetivo:** Operação offshore completa: preparação, decolagem classe 2 (TDP), rota com eventos (motor, automação, instrumentos), aproximação a Unidade Marítima, pouso/decolagem UM, arremetida, ditching e flutuabilidade.
- **Lógica da sequência:** Checklist/ECL offshore → decolagem TDP → falha motor rota → falha PA → falha FD → perda atitude IMC → falha dados voo → aproximação UM → falha motor aproximação → aproximação OEI → pouso monomotor → arremetida offshore → decolagem rejeitada → autorrotação água → ditching com potência → flutuabilidade/evacuação → repetição.
- **Principais itens técnicos:** `S76-CKL-07`, `S76-TDP-00`, `76-MOTCZ`, `76-FALPA`, `76-FALFD`, `76-PERAT`, `76-FALAD`, `S76-APO-01`, `76-MOTAP`, `76-APXOI`, `76-POUMO`, `S76-ARO-01`, `76-POUAB`, `76-AUTAG`, `S76-DIT-71`, `S76-FLU-01`.
- **Pontos que o instrutor deve validar:** Offshore/ditching está no momento certo (sessão 10, após sistemas/rotor/fogo)? `S76-FLU-01` (flutuabilidade/evacuação) é treinável em simulador ou é conteúdo teórico? `76-AUTAG` (autorrotação para água) é distinto de `S76-DIT-71` (ditching com potência)?

### Sessão 11/12 — LOFT (S76)

- **Objetivo:** Treinamento de cenário integrado IFR completo: planejamento, decolagem, OEI pós-TDP, navegação, falha de sistema em rota, STAR/descida, espera, NPA, missed, ILS, pouso no alternado.
- **Caráter:** Treinamento. Pode haver orientação do instrutor, pausa pedagógica e repetição.
- **Principais itens técnicos:** `LOFT-CHK-01` a `LOFT-CHK-15`, `LOFT-CHK-17` a `LOFT-CHK-19`, `LOFT-CHK-23`.
- **Pontos que o instrutor deve validar:** `LOFT-CHK-07` (CAT A em IMC) se aplica à frota S76? `LOFT-CHK-23` (painel limitado) está bem posicionado como item 18?

### Sessão 12/12 — LOFT Check (S76)

- **Objetivo:** Avaliação final. Mesmo domínio técnico da sessão 11, sem conteúdo novo.
- **Caráter:** Avaliativo. `carater=avaliativo` em toda linha. Sem pausa pedagógica (salvo segurança).
- **Principais itens técnicos:** Idênticos à sessão 11 em código e nome, com marcador `carater=avaliativo`.
- **Pontos que o instrutor deve validar:** O cenário do LOFT Check é suficientemente distinto do LOFT para evitar "decoreba"? Os critérios de aprovação estão definidos?

---

## 4. Resumo AW139 Inicial — 12 Sessões

### Sessão 01/12 — Familiarização / Checklist Normal / Voo Normal

- **Objetivo:** Primeiro contato com cabine AW139, power-up, CAS (leitura, sem pane), QRH (localização, sem execução), AFCS básico, perfil de voo normal completo.
- **Lógica da sequência:** Cabine/power-up → checklist → CAS leitura → QRH localização → AFCS normal → taxi → hover → controle potência → decolagem → controle VFR → normais → FMA básico → circuito → aproximação estabilizada → arremetida → pouso → encerramento → atitudes anormais VMC.
- **Principais itens técnicos:** `A139-CAB-01`, `A139-CKL-01`, `A139-CAS-01`, `A139-QRH-01`, `A139-AFC-01`, `A139-TAX-01`, `FLY-BAS-X3`, `A139-PWR-01`, `OPS-NRM-X2`, `FLY-BAS-X1`, `OPS-NRM-X1`, `A139-FMA-01`, `OPS-NRM-X3`, `A139-STB-01`, `A139-ARN-01`, `A139-EST-01`, `FLY-BAS-X4`.
- **Pontos que o instrutor deve validar:** `A139-CAS-01` e `A139-QRH-01` como leitura/localização sem pane — está adequado para sessão 01? `A139-AFC-01` (AFCS normal) é muito cedo na sessão 01? `FLY-BAS-X4` (atitudes anormais VMC) pertence à sessão 01 ou 02?

### Sessão 02/12 — Voo Visual e Perfil Básico

- **Objetivo:** Consolidar voo visual com AFCS, modos, FMA, curvas, descida, aproximação estabilizada, vento cruzado e introdução leve a offshore sem emergência.
- **Lógica da sequência:** Checklist → hover precisão → decolagem → subida/cruzeiro → controle VFR → modos AFCS → FMA mudança → curvas → descida → aproximação estabilizada → arremetida → reentrada circuito → circuito → vento cruzado → holding visual → navegação offshore leve → taxi → encerramento.
- **Principais itens técnicos:** `A139-CKL-01`, `FLY-BAS-X3`, `OPS-NRM-X2`, `A139-SUB-01`, `FLY-BAS-X1`, `A139-MOD-01`, `A139-FMA-02`, `A139-CRV-01`, `A139-DSC-01`, `A139-STB-02`, `A139-ARN-01`, `A139-REC-02`, `OPS-NRM-X3`, `A139-VCZ-01`, `A139-HLD-01`, `OPS-OFF-X1`, `A139-TAX-01`, `A139-EST-01`.
- **Pontos que o instrutor deve validar:** `A139-MOD-01` e `A139-FMA-02` como itens separados — a granularidade está adequada? `A139-HLD-01` (holding visual) é aplicável nesta fase? `OPS-OFF-X1` (navegação offshore leve) está bem como introdução?

### Sessão 03/12 — IFR/PBN Básico

- **Objetivo:** Voo IFR completo no AW139: FMS, SID/STAR, AP, controle IFR, scan, voo manual, holding, RNP, precisão, NPA, missed, large angle e transição visual.
- **Lógica da sequência:** FMS/convencional → SID/STAR → AP/automação → controle IFR → scan → voo manual → orientação/rumo → holding → RNP → precisão → NPA → missed → large angle → atitudes anormais IFR → checklist IFR → transição visual → reaproximações.
- **Principais itens técnicos:** `OPS-NAV-X1`, `OPS-NAV-X4`, `OPS-NAV-X2`, `FLY-BAS-X2`, `A139-SCN-02`, `A139-VMA-01`, `A139-ORI-01`, `OPS-NAV-X3`, `A139-RNP-01`, `OPS-APP-X1`, `OPS-APP-X2`, `OPS-APP-X3`, `OPS-APP-X4`, `FLY-BAS-X4`, `A139-CKL-01`, `FLY-BAS-X1`.
- **Pontos que o instrutor deve validar:** `A139-SCN-02` (scan IFR) é técnico o suficiente? `A139-RNP-01` como aproximação PBN dedicada — a nomenclatura está correta? `OPS-APP-X4` (large angle) está bem posicionado?

### Sessão 04/12 — CAS/QRH Anormalidades Simples

- **Objetivo:** Anormalidades de baixa severidade no AW139: elétrico (DC GEN, battery, bus, AC, 28V), avionics (ADS, AHRS), displays (PFD, MFD, EICAS, DUD), air data (ADC), navegação (GPS, FMS), AFCS simples (AP OFF, MISTRIM, SAS).
- **Lógica da sequência:** Método QRH → elétrico simples → elétrico progressivo → avionics → displays → air data → navegação → AFCS simples.
- **Principais itens técnicos:** `A139-CKL-02`, `CAU-DCG-53`, `CAU-BOF-55`, `CAU-DCB-56`, `CAU-ACB-57`, `CAU-28D-58`, `CAU-ADS-46`, `CAU-AHR-47`, `CAU-DUD-46`, `CAU-PFD-45`, `CAU-MFD-45`, `CAU-EIC-45`, `CAU-ADC-48`, `CAU-GPS-52`, `CAU-FMS-51`, `CAU-APO-38`, `CAU-MIS-40`, `CAU-SAS-41`.
- **Pontos que o instrutor deve validar:** CAS/QRH está progressivo (simples → complexo)? `A139-CKL-02` (aplicação prática do QRH) como item separado — justifica? A nomenclatura `CAU-*` está correta conforme QRH da frota?

### Sessão 05/12 — Engine/OEI Introdutório

- **Objetivo:** Falha de motor AW139 em cruzeiro, EEC FAIL, perfil OEI, OEI limit timer, compressor stall, overspeed (engine/NG), hot start, combustível (fuel low, double pump, engine pump), óleo.
- **Lógica da sequência:** Engine failure cruzeiro → identificação → QRH engine/EEC → EEC FAIL → perfil OEI → OEI limit timer → compressor stall → engine overspeed → NG overspeed → hot start → fuel low → double fuel pump → engine fuel pump → oil pressure → compressor no demand → throttle non-follow → repetição.
- **Principais itens técnicos:** `WAR-OUT-15`, `A139-IDF-01`, `A139-CKL-03`, `WAR-EEC-18`, `A139-OEI-01`, `CAU-LIC-60`, `CAU-CST-59`, `CAU-OVS-64`, `CAU-NGO-63`, `CAU-HOT-65`, `CAU-FLO-73`, `CAU-2FP-74`, `CAU-EFP-75`, `WAR-OIL-18`, `CAU-CND-61`, `CAU-TNF-62`.
- **Pontos que o instrutor deve validar:** EEC/engine está no momento correto (sessão 05, após anormalidades simples)? `CAU-HOT-65` (hot start) — pertence a esta sessão ou deveria ficar em solo/partida?

### Sessão 06/12 — CAT A/B Introdutório

- **Objetivo:** Perfis CAT A e CAT B no AW139: rejected takeoff, continued takeoff, engine failure na decolagem/aproximação, EEC FAIL, engine stuck IDLE, rotor RPM, hidráulico, trem, pouso monomotor.
- **Lógica da sequência:** QRH CAT A/B → perfil normal CAT A/B → hover check → rejected takeoff → continued takeoff → engine failure → identificação → EEC FAIL → engine stuck IDLE → rotor RPM low/high → hidráulico → servo → trem emergência → pouso monomotor → normais → repetição.
- **Principais itens técnicos:** `A139-CKL-04`, `OPS-NRM-X2`, `FLY-BAS-X3`, `A139-CATB-01`, `A139-CATB-02`, `WAR-OUT-15`, `A139-IDF-01`, `WAR-EEC-18`, `WAR-IDL-16`, `WAR-LOW-29`, `WAR-HIG-29`, `CAU-HYP-77`, `CAU-SRV-80`, `WAR-GER-27`, `A139-POU-01`, `OPS-NRM-X1`.
- **Pontos que o instrutor deve validar:** CAT A/B está no momento correto (sessão 06)? `A139-CATB-01` e `A139-CATB-02` como itens novos separados — a granularidade está adequada? `WAR-IDL-16` (engine stuck IDLE) é realista para o AW139?

### Sessão 07/12 — AFCS/Avionics

- **Objetivo:** Falhas de AFCS (AP failure, MISTRIM, SAS, AFCS degraded), voo manual com AFCS degradado, avionics (ADS, AHRS), displays (DUD, PFD, MFD, EICAS), air data, navegação, aproximação com sistemas degradados.
- **Lógica da sequência:** AP failure → MISTRIM → SAS → AFCS degraded → atitudes anormais → voo manual IFR → ADS → AHRS → displays → air data → navegação → precisão com degradação → repetição.
- **Principais itens técnicos:** `CAU-APF-37`, `CAU-MIS-40`, `CAU-SAS-41`, `CAU-AFD-41`, `FLY-BAS-X4`, `A139-VMA-01`, `CAU-ADS-46`, `CAU-AHR-47`, `CAU-DUD-46`, `CAU-PFD-45`, `CAU-MFD-45`, `CAU-EIC-45`, `CAU-ADC-48`, `CAU-GPS-52`, `CAU-FMS-51`, `OPS-APP-X1`.
- **Pontos que o instrutor deve validar:** AFCS/avionics está bem distribuído entre as sessões 04, 06 e 07? `CAU-AFD-41` (AFCS degraded) como item separado de `CAU-APF-37` (AP failure) — a distinção é clara? `A139-VMA-01` (voo manual IFR) repete item da sessão 03 — manter em ambas?

### Sessão 08/12 — Rotor/Transmission/Hydraulic

- **Objetivo:** Falhas de MGB (oil pressure, oil temp, chip), tail rotor (drive, control), rotor principal (binding), hidráulico (pressure, servo), rotor RPM, energia/autorotação, trem.
- **Lógica da sequência:** MGB oil → MGB temp → MGB chip → tail rotor drive → tail rotor control → main rotor binding → tail rotor binding → hidráulico → servo → rotor RPM low/high → energia/RPM → autorrotação → recuperação → QRH → trem → repetição.
- **Principais itens técnicos:** `WAR-MGB-30`, `WAR-TMP-30`, `CAU-MGP-105`, `WAR-TDR-X1`, `WAR-TCS-X1`, `WAR-MRC-X1`, `WAR-TRC-X1`, `CAU-HYP-77`, `CAU-SRV-80`, `WAR-LOW-29`, `WAR-HIG-29`, `A139-ENE-01`, `FLY-BAS-17`, `A139-REC-01`, `A139-CKL-05`, `WAR-GER-27`.
- **Pontos que o instrutor deve validar:** Rotor/transmission/hydraulic está bem distribuído? `A139-ENE-01` como pré-requisito de autorrotação — a granularidade está correta? `FLY-BAS-17` (autorrotação) e `A139-REC-01` (recuperação) como itens separados?

### Sessão 09/12 — Fire/Smoke/Emergências Avançadas

- **Objetivo:** Engine fire, ações de memória, cabin/cockpit smoke, baggage fire, O2, engine failure alto estresse, hot start avançado, fuel/hidráulico/servo/RPM, autorrotação alto estresse, precisão/missed em emergência.
- **Lógica da sequência:** Engine fire → ações memória → cabin smoke → baggage fire → O2 pressure → engine failure estresse → hot start → fuel low → hidráulico → servo → rotor RPM → trem → autorrotação → precisão → missed → repetição.
- **Principais itens técnicos:** `WAR-FIR-21`, `A139-CKL-06`, `WAR-CAB-23`, `WAR-BAG-23`, `CAU-O2P-82`, `WAR-OUT-15`, `CAU-HOT-65`, `CAU-FLO-73`, `CAU-HYP-77`, `CAU-SRV-80`, `WAR-LOW-29`, `WAR-HIG-29`, `WAR-GER-27`, `FLY-BAS-17`, `OPS-APP-X1`, `OPS-APP-X3`.
- **Pontos que o instrutor deve validar:** `WAR-OUT-15` (engine failure) repete pela 3ª vez (sessões 05, 06, 09) — justifica em cada contexto? `CAU-O2P-82` (O2 pressure low) é aplicável à configuração da frota?

### Sessão 10/12 — Offshore/Helideck

- **Objetivo:** Operação offshore AW139: navegação, FMS, AP, eventos em rota (fuel, dual GEN, engine, fuel pump), OEI limit timer, aproximação offshore, large angle, precisão, helideck, missed, rotor RPM, autorrotação água, ditching/flutuabilidade.
- **Lógica da sequência:** Navegação offshore → FMS → AP → fuel low → dual GEN → engine failure → double fuel pump → OEI timer → aproximação offshore → large angle → precisão → helideck pouso/decolagem → missed → rotor RPM → autorrotação água → ditching → hot start reforço.
- **Principais itens técnicos:** `OPS-OFF-X1`, `OPS-NAV-X1`, `OPS-NAV-X2`, `CAU-FLO-73`, `WAR-GEN-11`, `WAR-OUT-15`, `CAU-2FP-74`, `CAU-LIC-60`, `OPS-OFF-X2`, `OPS-APP-X4`, `OPS-APP-X1`, `OPS-NRM-X2`, `OPS-APP-X3`, `WAR-LOW-29`, `WAR-HIG-29`, `FLY-BAS-17`, `OPS-OFF-X3`, `CAU-HOT-65`.
- **Pontos que o instrutor deve validar:** Offshore/helideck/ditching está correto? `OPS-OFF-X3` (ditching/flutuabilidade) — validar QRH e aplicabilidade. `CAU-HOT-65` como reforço na sessão offshore — pertence aqui ou deveria ficar só em motor?

### Sessão 11/12 — LOFT (AW139)

- **Objetivo:** Treinamento de cenário integrado IFR AW139: planejamento, decolagem CAT A, OEI pós-TDP, navegação FMS, falha sistema em rota, STAR/descida, espera, NPA, missed, ILS, pouso alternado.
- **Caráter:** Treinamento. Pode haver orientação do instrutor, pausa pedagógica e repetição.
- **Principais itens técnicos:** `LOFT-CHK-01` a `LOFT-CHK-15`, `LOFT-CHK-17` a `LOFT-CHK-19`, `LOFT-CHK-23`.
- **Pontos que o instrutor deve validar:** `LOFT-CHK-07` (CAT A em IMC) está correto para AW139? `LOFT-CHK-23` (painel limitado) está bem posicionado?

### Sessão 12/12 — LOFT Check (AW139)

- **Objetivo:** Avaliação final. Mesmo domínio técnico da sessão 11, sem conteúdo novo.
- **Caráter:** Avaliativo. `carater=avaliativo` em toda linha.
- **Principais itens técnicos:** Idênticos à sessão 11, com marcador `carater=avaliativo`.
- **Pontos que o instrutor deve validar:** O cenário é suficientemente distinto do LOFT? Os critérios de aprovação estão definidos?

---

## 5. Resumo dos Periódicos

### S76/SK76 — 3 Sessões por Ciclo (Ciclos 1, 2 e 3)

| Ciclo | Sessão | Tipo | Conteúdo principal |
|---|---|---|---|
| 1 | 01/03 | VFR/Emergências | Checklist normal → decolagem/perfil visual → evento motor/sistema do ciclo → ECL → aproximação/pouso ou arremetida → encerramento |
| 1 | 02/03 | IFR/Noturno/Offshore | Setup IFR → saída/navegação → evento compatível com rota/IFR/offshore → ECL → aproximação/missed → pouso/alternado |
| 1 | 03/03 | LOFT/Check | Planejamento → execução normal → evento do ciclo → ECL → replanejamento → aproximação/pouso → itens FAP. Se check: `carater=avaliativo` |
| 2 | 01/03 | VFR/Emergências | Mesmo formato, eventos diferentes do ciclo 1 |
| 2 | 02/03 | IFR/Noturno/Offshore | Mesmo formato, eventos diferentes do ciclo 1 |
| 2 | 03/03 | LOFT/Check | Mesmo formato |
| 3 | 01/03 | VFR/Emergências | Mesmo formato, eventos diferentes dos ciclos 1 e 2 |
| 3 | 02/03 | IFR/Noturno/Offshore | Mesmo formato |
| 3 | 03/03 | LOFT/Check | Mesmo formato |

**Total: 9 sessões no ciclo trienal completo: 3 ciclos × 3 sessões.** As tabelas linha-a-linha dos 18 itens de cada sessão estão na V4 (seção 6). A V5 não as reproduz porque a V4 já as preservou corretamente e a V4.1 confirmou ausência de itens genéricos.

### AW139 — 4 Sessões por Ciclo (Ciclos 1, 2 e 3) — Recomendação Técnica

| Ciclo | Sessão | Tipo | Conteúdo principal |
|---|---|---|---|
| 1 | 01/04 | VFR/Emergências | Normal checklist → decolagem/perfil visual → evento CAS/QRH do ciclo → QRH → aproximação/pouso |
| 1 | 02/04 | IFR/Noturno/Offshore | Setup FMS/IFR → saída/enroute → evento AFCS/CAS do ciclo → QRH → approach/missed → pouso |
| 1 | 03/04 | LOFT/Offshore | Missão offshore → navegação/helideck → evento offshore compatível → QRH → retorno/alternado/ditching → encerramento |
| 1 | 04/04 | LOFT/Check | Preparação → execução normal → evento avaliativo → FAP técnica → QRH/checklist → aproximação/pouso. `carater=avaliativo` |
| 2 | 01/04 | VFR/Emergências | Mesmo formato, eventos diferentes |
| 2 | 02/04 | IFR/Noturno/Offshore | Mesmo formato |
| 2 | 03/04 | LOFT/Offshore | Mesmo formato |
| 2 | 04/04 | LOFT/Check | Mesmo formato |
| 3 | 01/04 | VFR/Emergências | Mesmo formato |
| 3 | 02/04 | IFR/Noturno/Offshore | Mesmo formato |
| 3 | 03/04 | LOFT/Offshore | Mesmo formato |
| 3 | 04/04 | LOFT/Check | Mesmo formato |

**Total: 12 sessões no ciclo trienal completo: 3 ciclos × 4 sessões.** As tabelas linha-a-linha estão na V4 (seção 7).

> ⚠️ **A recomendação de 4 sessões/ciclo para AW139 é técnica, não normativa.** Depende de validação do owner e do PTO. A alternativa de 3 sessões/ciclo (comprimindo CAT A/B, helideck, ditching e check IFR) continua não recomendada, pelos mesmos motivos já documentados na V4.

---

## 6. Checklist de Validação para Instrutor S76

| # | Pergunta | Resposta esperada | Observação |
|---|---|---|---|
| 1 | A sessão 01 está adequada para aluno inicial? | Sim/Não/Ajustar | Verificar se `S76-CAB-01` (cabine) e `S76-CKL-01` (checklist) como linhas separadas fazem sentido ou são fundíveis |
| 2 | A entrada de OEI está no momento correto? | Sim/Não/Ajustar | OEI começa na sessão 05 (cruzeiro), não antes. Decolagem/aproximação OEI na sessão 06 |
| 3 | A entrada de DECU está correta? | Sim/Não/Ajustar | DECU menor (`S76-DMN-21`) na sessão 05, progressivo na 06 (`S76-DDE-21`, `S76-DM1-22`, `S76-DMB-24`) |
| 4 | Autorrotação está no momento certo? | Sim/Não/Ajustar | Sessão 08, após rotor/transmissão/RPM, com `S76-ENE-01` como pré-requisito |
| 5 | Offshore/ditching está no momento certo? | Sim/Não/Ajustar | Sessão 10, após sistemas, rotor e fogo |
| 6 | Há item que não existe na frota? | Nenhum / Listar | Verificar especialmente `76-FALFF` (feeder), `76-SERTQ` (servo rotor cauda), `76-SERJM` (atuador) |
| 7 | Há nomenclatura errada de ECL/checklist? | Nenhuma / Listar | S76 usa ECL, não QRH. Verificar se algum item usa "QRH" indevidamente |
| 8 | Algum item deve mudar de sessão? | Nenhum / Listar | Revisar se `FLY-BAS-X4` (atitudes anormais) pertence à sessão 01 ou 02 |
| 9 | `S76-VOR-00` e `S76-LDP-00` existem no catálogo? | Sim/Não | Citados como reaproveitados na cobertura FAP mas nunca instanciados em ficha concreta |
| 10 | A granularidade dos 38 códigos novos (seção 11.1 da V5) está adequada? | Sim/Não/Ajustar | Revisar especialmente `S76-IDF-01` (identificação de falha), `S76-ENE-01` (energia/RPM), `S76-REC-02` (recuperação autorrotação) |

---

## 7. Checklist de Validação para Instrutor AW139

| # | Pergunta | Resposta esperada | Observação |
|---|---|---|---|
| 1 | CAS/QRH está progressivo? | Sim/Não/Ajustar | Sessão 01: leitura/localização sem pane. Sessão 04: anormalidades simples. Sessão 05+: progressivo |
| 2 | EEC/engine está no momento correto? | Sim/Não/Ajustar | Sessão 05 (engine/OEI), com EEC FAIL junto, não antes |
| 3 | CAT A/B está no momento correto? | Sim/Não/Ajustar | Sessão 06, após engine introdutório (05) e antes de AFCS/avionics (07) |
| 4 | AFCS/avionics está bem distribuído? | Sim/Não/Ajustar | Sessão 01 (normal), 04 (simples), 06 (CAT), 07 (dedicado), 09 (avançado), 10 (offshore) |
| 5 | Rotor/transmission/hydraulic está bem distribuído? | Sim/Não/Ajustar | Sessão 06 (CAT/hidráulico parcial), 08 (dedicado), 09 (emergência), 10 (offshore) |
| 6 | Offshore/helideck/ditching está correto? | Sim/Não/Ajustar | Sessão 02 (leve), 10 (dedicado), periódico LOFT/Offshore. Ditching só após contexto offshore |
| 7 | AW139 periódico deve ser 4 sessões/ciclo? | Sim/Não | Recomendação técnica. Validar com owner e PTO |
| 8 | Há item que não pertence ao AW139? | Nenhum / Listar | Verificar `CAU-HOT-65` (hot start — melhor em solo?), `WAR-IDL-16` (engine stuck IDLE — realista?) |
| 9 | `OPS-OFF-X3` (ditching/flutuabilidade) — o QRH cobre? | Sim/Não | Validar QRH AW139 |
| 10 | A granularidade dos 36 códigos novos (seção 11.2 da V5) está adequada? | Sim/Não/Ajustar | Revisar `A139-CATB-01`/`02`, `A139-POU-01`, `A139-ENE-01`, `A139-REC-01` |

---

## 8. Checklist Owner / PTO / FAP

| # | Item | Responsável | Pergunta | Observação |
|---|---|---|---|---|
| 1 | PTO-A | Owner/Instrutor | A granularidade dos itens realocados entre sessões está compatível com o PTO-A? | Fonte usada extensivamente na V5 |
| 2 | PTO-B | Owner | O PTO-B (complementar) foi localizado? | Não localizado no workspace (herança V3/V4). Se existir, validar |
| 3 | ECL S76 | Owner/Instrutor | O ECL S76 em texto integral foi localizado? Todos os itens `VALIDAR_ECL` estão corretos? | Validar especialmente Servo SYS, Fuel Pressure, Fuel Low, IIDS, trem, e família `76-*` → `S76-*` |
| 4 | QRH AW139 | Owner/Instrutor | O QRH AW139 em texto integral foi localizado? Todos os itens `CAU-*`/`WAR-*` estão corretos? | Validar especialmente `OPS-OFF-X3` (ditching) |
| 5 | FAP 05.2 | Owner/Instrutor | A cobertura mapeada na seção 10 da V5 está correta? | Confirmar contra o documento fonte FAP |
| 6 | FAP 06 | Owner/Instrutor | A cobertura mapeada está correta? | Painel limitado, IFR, NPA, precisão |
| 7 | FAP 14 | Owner/Instrutor | A cobertura mapeada está correta? | Planejamento offshore, navegação, operação multi-tripulação |
| 8 | Matriz como base | Owner | A matriz V5 pode ser usada como base para revisão do manual de treinamento? | ⚠️ A V5 não está aprovada pela ANAC. É uma proposta técnica interna para validação operacional |

---

## 9. Tabela de Decisões Pendentes

| # | Item | Responsável | Decisão necessária | Impacto se não validar | Status |
|---|---|---|---|---|---|
| 1 | 38 códigos novos S76 | Instrutor S76 | Validar nomenclatura e granularidade | Fichas com códigos não reconhecidos pelo instrutor | Pendente |
| 2 | 36 códigos novos AW139 | Instrutor AW139 | Validar nomenclatura e granularidade | Fichas com códigos não reconhecidos pelo instrutor | Pendente |
| 3 | AW139 4 sessões/ciclo | Owner | Confirmar recomendação de 4 sessões/ciclo | AW139 periódico volta a 3 sessões comprimidas | Pendente |
| 4 | Divergência PTO Rev. 10 | Owner | Validar sequência de sessão vs PTO | Desalinhamento com documento normativo | Pendente |
| 5 | PTO-B | Owner | Localizar e validar | Itens cobertos pelo PTO-B sem validação | Pendente |
| 6 | ECL S76 integral | Owner/Instrutor S76 | Localizar documento e validar itens | Itens `VALIDAR_ECL` sem confirmação | Pendente |
| 7 | QRH AW139 integral | Owner/Instrutor AW139 | Localizar documento e validar itens | Itens `CAU-*`/`WAR-*`/`OPS-OFF-X3` sem confirmação | Pendente |
| 8 | FAP 05.2/06/14 | Owner/Instrutor | Confirmar cobertura contra fonte | Cobertura FAP não validada | Pendente |
| 9 | `S76-VOR-00` / `S76-LDP-00` | Instrutor S76 | Confirmar existência no catálogo | Dependência de códigos inexistentes | Pendente |
| 10 | Duplicação `76-*` vs `S76-*-NN` | Instrutor S76 | Reconciliação futura (fora do escopo V5) | Sobreposição de famílias de código | Postergado |
| 11 | LOFT Check — critérios de aprovação | Owner/Instrutor | Definir critérios objetivos | Avaliação subjetiva sem régua clara | Pendente |
| 12 | `LOFT-CHK-23` (painel limitado) | Instrutor | Validar posição e aplicabilidade | Item opcional sem definição clara | Pendente |

---

## 10. Próximo Passo Após Validação

1. **Consolidar ajustes do instrutor** — coletar todas as respostas dos checklists (seções 6 e 7) e da tabela de decisões (seção 9).
2. **Resolver pendências owner/PTO/FAP** — localizar e validar PTO-B, ECL S76 integral, QRH AW139 integral, e confirmar cobertura FAP 05.2/06/14 contra os documentos fonte.
3. **Gerar V6** — versão aprovada internamente, incorporando todos os ajustes validados. A V6 será a base para implementação.
4. **Só depois preparar implementação AirTrust**, com:
   - Inventário completo do catálogo atual de manobras.
   - Dry-run de diff entre catálogo atual e V6 (sem escrita).
   - Script idempotente gerado somente após dry-run revisado.
   - Preservação histórica — nenhuma manobra ou vínculo antigo apagado (soft-legacy, sem hard delete).
   - Testes automatizados cobrindo nova estrutura de campos.
   - Validação visual das fichas em PDF antes de qualquer rollout.
   - Plano de rollback por desativação/soft-delete de vínculos novos.
   - Nenhuma ação em produção até autorização explícita.

---

## Confirmação Final

- ✅ Apenas o arquivo documental `COSTA_DO_SOL_MATRIZ_V5_PACOTE_REVISAO_INSTRUTOR_20260703.md` foi criado.
- ✅ Nenhuma implementação, migration, DML, deploy ou alteração funcional foi realizada.
- ✅ Produção permaneceu intocada.
- ✅ V4, V4.1, V4.2 e V5 originais não foram alteradas.
- ✅ Nenhum termo "homologado" ou "aprovado pela ANAC" foi usado.
- ✅ Nenhum PR foi aberto.
