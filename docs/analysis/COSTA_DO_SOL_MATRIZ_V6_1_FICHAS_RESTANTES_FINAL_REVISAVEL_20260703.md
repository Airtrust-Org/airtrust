# Costa do Sol / AirTrust — Matriz V6.1 Fichas Restantes — Proposta Final Revisável 20260703

**Data-base:** 2026-07-03
**Caráter:** Documental / pedagógico / regulatório. Nenhuma implementação, migration, DML, deploy ou alteração funcional.
**Fontes:** V5, V5.1, V6, V6.1 auditoria global, CSV source map, PTO Rev. 10, migrations.

---

## 1. Veredito

**GO documental para as 12 das 12 fichas restantes, com caminho de implementação definido para as 10 operacionais e caráter preliminar controlado para TRE-INST/CRED-EXA.**

| Status | Qtd | Modelos |
|---|---|---|
| GO documental | 10 | A139-S-01/02, A139-S-02/02, A139-REQ-01, S76-REQ-01, A139-NOT-01, A139-NOT-02, S76-NOT-01, S76-NOT-02, SK76-S-01/02, SK76-S-02/02 |
| GO documental preliminar (com pendência FAP/PTO interno) | 2 | TRE-INST, CRED-EXA |

**Fontes regulatórias localizadas:**
- **RBAC 61 EMD 16, Subparte M** — Habilitação de Instrutor de Voo: 61.231, 61.233, 61.237.
- **RBAC 135 EMD 15** — 135.337 (qualificações de examinador), 135.338 (qualificações de instrutor), 135.339 (treinamento de examinador), 135.340 (treinamento de instrutor), 135.330 (CRM).

Essas fontes fornecem base regulatória suficiente para propor estrutura pedagógica preliminar para TRE-INST e CRED-EXA. No entanto, **FAP/PTO interno específico da Costa do Sol para instrutor e examinador ainda não foi localizado** — a estrutura proposta é consistente com os RBAC, mas precisa de validação do owner contra documentação operacional interna.

**Nada neste documento está homologado ou aprovado pela ANAC.**

**Condições para GO de implementação futura:**
- Todas as fichas com GO documental convertidas para 18+15.
- TRE-INST e CRED-EXA validados contra FAP/PTO interno do operador.
- SK76-S-* convertidos para o mesmo padrão técnico-operacional já adotado na V6.1.

---

## 2. Escopo

Este documento cobre as **12 fichas que ficaram fora da V6**. Para cada ficha operacional, propõe 18 técnicas + 15 NOTECHS. Para fichas com bloqueio regulatório, propõe estrutura preliminar com pendência explícita.

---

## 3. Regras de Conversão 18+15

1. **18 itens técnicos observáveis** — manobras, procedimentos, sistemas, navegação.
2. **15 NOTECHS fora das 18** — conforme `notechs.ts`, mesmo bloco usado na V6.
3. **CRM/NTS/briefing/debriefing genérico NUNCA nas 18** — removido e movido para NOTECHS ou observação.
4. **Códigos existentes preferidos** — usar pool de códigos do catálogo atual (`CAU-*`, `WAR-*`, `OPS-*`, `FLY-*`, `76-*`, `S76-*`).
5. **Código novo só se faltar item técnico real** — marcado como `NOVA_MANOBRA_NECESSARIA`.
6. **Não misturar aeronaves** — AW139 usa `CAU-*/WAR-*/OPS-*/FLY-*`, S76/SK76 usa `76-*/S76-*`.
7. **Sequência lógica:** preparação → checklist → execução → evento → procedimento → decisão → encerramento.
8. **Nada homologado/aprovado pela ANAC.**

---

## 4. Fichas com GO Documental

### 4.1 `A139-S-01/02` — Semestral Noturno AW139

**Situação atual:** 22 `LOFT-NOT-*` genéricos. Zero códigos AW139. CRM em posições 20-21-22.
**Objetivo V6.1:** Check semestral de operação noturna AW139 com 18 técnicas específicas.

| ordem | codigo_final | nome_final | fase/contexto | origem | decisao | fonte/FAP | observacao |
|---:|---|---|---|---|---|---|---|
| 1 | `A139-CKL-01` | Normal checklist — preparação noturna | Preparação | existente (V6) | REAPROVEITAR | FAP05.2 C2.1/C2.2 | Adaptado para contexto noturno |
| 2 | `FLY-BAS-X3` | Hover e taxi com referência noturna | Hover / taxi | existente | REAPROVEITAR | FAP05.2 H2.3 | Iluminação externa e referências visuais noturnas |
| 3 | `OPS-NRM-X2` | Decolagem normal noturna | Decolagem | existente | REAPROVEITAR | FAP05.2 H4.2 | Com iluminação de heliponto |
| 4 | `FLY-BAS-X1` | Controle geral VFR noturno | Cruzeiro noturno | existente | REAPROVEITAR | FAP05.2 | Referências visuais limitadas |
| 5 | `A139-MOD-01` | Seleção de modos AFCS em condição noturna | Cruzeiro / automação | existente (V5/V6) | REAPROVEITAR | - | Automação em baixa luminosidade |
| 6 | `OPS-NAV-X1` | Navegação FMS noturna | Navegação | existente | REAPROVEITAR | FAP06 CIR.5 | Navegação com referência instrumental |
| 7 | `CAU-DCG-53` | Single DC GEN failure em voo noturno | Evento elétrico | existente | REALOCAR | QRH AW139 | Carga elétrica em voo noturno |
| 8 | `A139-CKL-02` | Aplicação do QRH para caution noturna | QRH | existente (V5/V6) | REAPROVEITAR | - | Identificação de CAS em baixa luminosidade |
| 9 | `CAU-FLO-73` | Fuel low em rota noturna | Evento combustível | existente | REALOCAR | QRH AW139 | Decisão de alternado noturno |
| 10 | `WAR-OUT-15` | Engine failure em voo noturno | Evento motor | existente | REALOCAR | QRH AW139 | Perfil OEI com referência noturna limitada |
| 11 | `CAU-LIC-60` | OEI limit timer em condição noturna | Monitoramento OEI | existente | REALOCAR | QRH AW139 | Gerenciamento de tempo OEI |
| 12 | `A139-OEI-01` | Perfil OEI noturno | Perfil OEI | existente (V5/V6) | REAPROVEITAR | - | Planejamento de pouso com ILS |
| 13 | `OPS-APP-X1` | Aproximação de precisão noturna | Aproximação IFR | existente | REAPROVEITAR | FAP06 IAP3.2 | ILS noturno como recurso |
| 14 | `OPS-APP-X3` | Missed approach noturno | Missed approach | existente | REAPROVEITAR | FAP06 IAP2.3 | Arremetida com referência limitada |
| 15 | `OPS-NRM-X1` | Procedimentos normais — pouso noturno | Pouso | existente | REAPROVEITAR | FAP05.2 H4.3 | Iluminação de heliponto/pista |
| 16 | `A139-ARN-01` | Arremetida noturna com NVG/NVIS | Arremetida | existente (V5/V6) | REAPROVEITAR | - | Se aplicável ao equipamento |
| 17 | `A139-EST-01` | Estacionamento e corte pós-voo noturno | Pós-pouso | existente (V5/V6) | REAPROVEITAR | FAP05.2 H4.5/C2.3 | Iluminação pós-pouso |
| 18 | `WAR-GEN-11` | Dual DC GEN failure — contingência noturna | Evento elétrico avançado | existente | REALOCAR | QRH AW139 | Cenário de perda elétrica total à noite |

**NOTECHS:** 15 itens padrão conforme `notechs.ts`.
**Códigos removidos das 18:** LOFT-NOT-20, LOFT-NOT-21, LOFT-NOT-22 → NOTECHS ou observação.
**Novos códigos:** Nenhum. Todos reaproveitados do catálogo AW139.

---

### 4.2 `A139-S-02/02` — Semestral Check IFR AW139

**Situação atual:** 22 `LOFT-CHK-*` genéricos. 5 códigos CRM/NTS (04/16/20/21/22).
**Objetivo V6.1:** Check semestral de proficiência IFR AW139. Mais enxuto que o LOFT Check do periódico.

| ordem | codigo_final | nome_final | fase/contexto | origem | decisao | fonte/FAP | observacao |
|---:|---|---|---|---|---|---|---|
| 1 | `A139-CKL-01` | Normal checklist e preparação IFR | Preparação | existente (V6) | REAPROVEITAR | FAP05.2 C2.1/C2.2 | Verificação pré-voo IFR |
| 2 | `OPS-NAV-X1` | Programação FMS e planejamento de rota | Preparação IFR | existente | REAPROVEITAR | FAP06 CIR.5 | Rota, alternado, mínimos |
| 3 | `OPS-NAV-X2` | Uso AP e automação normal IFR | Preparação / decolagem | existente | REAPROVEITAR | FAP06 CIR.3/CIR.5 | Configuração de modos |
| 4 | `FLY-BAS-X2` | Controle geral IFR — saída e enroute | Saída/enroute IFR | existente | REAPROVEITAR | FAP05.2 | Manutenção de proa/altitude |
| 5 | `OPS-NAV-X4` | SID e STAR | Saída / chegada IFR | existente | REAPROVEITAR | FAP06 CIR.3 | Cumprimento de procedimentos publicados |
| 6 | `OPS-NAV-X3` | Holding pattern | Espera IFR | existente | REAPROVEITAR | FAP06 CIR.7 | Espera publicada |
| 7 | `CAU-APO-38` | AP OFF — retomada de voo manual IFR | Evento AFCS | existente | REALOCAR | QRH AW139 | Transição AP→manual |
| 8 | `CAU-FMS-51` | FMS failure — navegação convencional | Evento navegação | existente | REALOCAR | QRH AW139 | Navegação sem FMS |
| 9 | `CAU-AHR-47` | AHRS failure — voo com instrumentos parciais | Evento avionics | existente | REALOCAR | QRH AW139 | Instrumentos standby |
| 10 | `FLY-BAS-X4` | Recuperação de atitudes anormais IFR | Recuperação | existente | REAPROVEITAR | - | Após falha de instrumentos |
| 11 | `OPS-APP-X2` | Aproximação de não-precisão (NPA) | Aproximação IFR | existente | REAPROVEITAR | FAP06 IAP2.2 | RNAV/VOR |
| 12 | `OPS-APP-X3` | Missed approach — NPA | Missed approach | existente | REAPROVEITAR | FAP06 IAP2.3 | Abaixo dos mínimos |
| 13 | `OPS-APP-X1` | Aproximação de precisão (ILS) | Reaproximação IFR | existente | REAPROVEITAR | FAP06 IAP3.2 | ILS até DA/DH |
| 14 | `WAR-OUT-15` | Engine failure em IFR | Evento motor | existente | REALOCAR | QRH AW139 | OEI em IMC |
| 15 | `CAU-LIC-60` | OEI limit timer — decisão de alternado | OEI / decisão | existente | REALOCAR | QRH AW139 | Planejamento IFR OEI |
| 16 | `WAR-GER-27` | Landing gear emergency — pouso | Trem / pouso | existente | REALOCAR | QRH AW139 | Preparação para pouso anormal |
| 17 | `A139-POU-01` | Pouso monomotor IFR | Pouso OEI | existente (V5/V6) | REAPROVEITAR | - | Pouso após cenário OEI |
| 18 | `A139-EST-01` | Procedimentos pós-voo e encerramento | Pós-pouso | existente (V5/V6) | REAPROVEITAR | FAP05.2 H4.5/C2.3 | Fechamento do check |

**NOTECHS:** 15 itens padrão.
**Códigos removidos das 18:** LOFT-CHK-04, LOFT-CHK-16, LOFT-CHK-20, LOFT-CHK-21, LOFT-CHK-22 → NOTECHS ou observação.
**Novos códigos:** Nenhum. Todos reaproveitados.

---

### 4.3 `A139-REQ-01` — Reaquisição AW139

**Situação atual:** 17 LOFT-CHK-* + 5 códigos operacionais. 5 CRM/NTS.
**Objetivo V6.1:** Ficha de reaquisição de experiência recente — foco em retomada de proficiência, não em cenário LOFT completo.

| ordem | codigo_final | nome_final | fase/contexto | origem | decisao | fonte/FAP | observacao |
|---:|---|---|---|---|---|---|---|
| 1 | `A139-CKL-01` | Normal checklist — verificação de procedimentos | Preparação | existente (V6) | REAPROVEITAR | FAP05.2 C2.1/C2.2 | Retomada de disciplina de checklist |
| 2 | `FLY-BAS-X3` | Hover e taxi — controle básico | Hover / taxi | existente | REAPROVEITAR | FAP05.2 H2.3 | Verificação de controle essencial |
| 3 | `OPS-NRM-X2` | Decolagem normal — perfil padrão | Decolagem | existente | REAPROVEITAR | FAP05.2 H4.2 | Retomada de perfil de decolagem |
| 4 | `FLY-BAS-X1` | Controle geral VFR | Cruzeiro visual | existente | REAPROVEITAR | FAP05.2 | Proficiência em voo básico |
| 5 | `A139-PWR-01` | Controle de potência e parâmetros | Cruzeiro | existente (V5/V6) | REAPROVEITAR | FAP05.2 H4.1 | Verificação de parâmetros de motor |
| 6 | `OPS-NRM-X1` | Procedimentos normais — circuito e pouso | Circuito / pouso | existente | REAPROVEITAR | FAP05.2 H4.3 | Pouso normal |
| 7 | `A139-ARN-01` | Arremetida normal | Arremetida | existente (V5/V6) | REAPROVEITAR | - | Decisão de arremeter |
| 8 | `OPS-NAV-X2` | Uso AP e navegação básica | Navegação | existente | REAPROVEITAR | FAP06 CIR.3/CIR.5 | Retomada de automação |
| 9 | `FLY-BAS-X2` | Controle geral IFR — voo por instrumentos | IFR básico | existente | REAPROVEITAR | FAP05.2 | Proficiência IFR |
| 10 | `OPS-APP-X1` | Aproximação de precisão | Aproximação IFR | existente | REAPROVEITAR | FAP06 IAP3.2 | ILS/RNP |
| 11 | `OPS-APP-X3` | Missed approach | Missed approach | existente | REAPROVEITAR | FAP06 IAP2.3 | Arremetida IFR |
| 12 | `WAR-OUT-15` | Engine failure — procedimento OEI | Evento motor | existente | REALOCAR | QRH AW139 | Falha de motor — item essencial |
| 13 | `CAU-LIC-60` | OEI limit timer — gerenciamento | Monitoramento OEI | existente | REALOCAR | QRH AW139 | Decisão OEI |
| 14 | `CAU-FLO-73` | Fuel low — decisão de alternado | Evento combustível | existente | REALOCAR | QRH AW139 | Gerenciamento de combustível |
| 15 | `WAR-FIR-21` | Engine fire — ações de memória | Emergência fogo | existente | REALOCAR | QRH AW139 | Item essencial de emergência |
| 16 | `FLY-BAS-17` | Autorotação — recuperação básica | Emergência | existente | REAPROVEITAR | - | Autorotação para terra |
| 17 | `WAR-GER-27` | Landing gear emergency | Trem / pouso | existente | REALOCAR | QRH AW139 | Emergência de trem |
| 18 | `A139-EST-01` | Encerramento e procedimentos pós-voo | Pós-pouso | existente (V5/V6) | REAPROVEITAR | FAP05.2 H4.5/C2.3 | Fechamento |

**NOTECHS:** 15 itens padrão.
**Códigos removidos das 18:** LOFT-CHK-04, LOFT-CHK-16, LOFT-CHK-20, LOFT-CHK-21, LOFT-CHK-22 → NOTECHS/observação.
**Novos códigos:** Nenhum. Prioridade para reaproveitamento de códigos existentes.

---

### 4.4 `S76-REQ-01` — Reaquisição S76

**Situação atual:** 22 itens mistos. `S76-CRM-01` como manobra técnica. `S76-COM-01`, `S76-ATC-01` como comunicação genérica.
**Objetivo V6.1:** Remover CRM/COM/ATC genéricos das 18. Focar em retomada de proficiência S76.

| ordem | codigo_final | nome_final | fase/contexto | origem | decisao | fonte/FAP | observacao |
|---:|---|---|---|---|---|---|---|
| 1 | `S76-CKL-01` | Checklist normal — disciplina operacional | Preparação | existente (V5/V6) | REAPROVEITAR | FAP05.2 C2.1/C2.2 | Retomada de procedimentos |
| 2 | `S76-NVF-00` | Procedimentos normais VFR | Preparação | existente (periódico) | REALOCAR | FAP05.2 H4.1/H4.3 | Voo normal básico |
| 3 | `S76-HOV-00` | Hover e taxi — controle essencial | Hover / taxi | existente (periódico) | REALOCAR | FAP05.2 H2.3 | Verificação de controle |
| 4 | `S76-DNR-01` | Decolagem normal | Decolagem | existente (V5/V6) | REAPROVEITAR | FAP05.2 H4.2 | Perfil de decolagem padrão |
| 5 | `S76-SUB-01` | Subida controlada visual | Subida | existente (V5/V6) | REAPROVEITAR | - | Perfil normal |
| 6 | `S76-PWR-01` | Controle de potência e torque | Cruzeiro | existente (V5/V6) | REAPROVEITAR | FAP05.2 H4.1 | Parâmetros de motor |
| 7 | `S76-CRV-01` | Curvas e controle de atitude | Manobras visuais | existente (V5/V6) | REAPROVEITAR | - | Manobrabilidade básica |
| 8 | `S76-APN-01` | Aproximação normal visual | Aproximação | existente (V5/V6) | REAPROVEITAR | FAP05.2 H4.3 | Perfil de aproximação |
| 9 | `S76-PNO-01` | Pouso normal | Pouso | existente (V5/V6) | REAPROVEITAR | FAP05.2 H4.3 | Pouso padrão |
| 10 | `S76-ARN-01` | Arremetida normal | Arremetida | existente (V5/V6) | REAPROVEITAR | - | Decisão de arremeter |
| 11 | `S76-TDP-00` | Decolagem classe 2 — TDP | Decolagem | existente (periódico) | REAPROVEITAR | FAP05.2 H4.2 | Perfil TDP |
| 12 | `S76-NDT-00` | Navegação diurna tática | Navegação | existente | REAPROVEITAR | - | Navegação básica |
| 13 | `S76-ILS-00` | Aproximação ILS | Aproximação IFR | existente (periódico) | REALOCAR | FAP06 IAP3.2 | Proficiência IFR |
| 14 | `S76-RNV-00` | Aproximação RNAV/GPS | Aproximação IFR | existente (periódico) | REALOCAR | FAP06 IAP2.2 | Navegação PBN |
| 15 | `76-MOTCZ` | Falha de motor em cruzeiro | Evento motor | existente | REALOCAR | - | Item essencial de emergência |
| 16 | `S76-XFD-20` | Crossfeed total após falha de motor | Gerenciamento combustível | existente (periódico) | REALOCAR | - | Combustível pós-falha |
| 17 | `S76-AUT-70` | Autorotação | Emergência | existente (periódico) | REALOCAR | - | Controle de energia |
| 18 | `S76-LDP-00` | Pouso/decolagem em heliponto | Pouso | existente (periódico) | REAPROVEITAR | - | Operação de heliponto |

**NOTECHS:** 15 itens padrão.
**Códigos removidos das 18:** `S76-CRM-01` (CRM), `S76-COM-01` (comunicação), `S76-ATC-01` (ATC genérico), `S76-LOFT-21`, `S76-LOFT-22` → NOTECHS/observação.
**Novos códigos:** Nenhum.

---

### 4.5 `A139-NOT-01` — Noturno Onshore AW139

**Situação atual:** 20 LOFT-NOT-* + 2 códigos operacionais (FLY-BAS-X3, OPS-APP-X4). CRM em LOFT-NOT-20/21.
**Objetivo V6.1:** Treinamento noturno onshore AW139 com 18 técnicas específicas.

| ordem | codigo_final | nome_final | fase/contexto | origem | decisao | fonte/FAP | observacao |
|---:|---|---|---|---|---|---|---|
| 1 | `A139-CKL-01` | Checklist e preparação para voo noturno | Preparação noturna | existente (V6) | REAPROVEITAR | FAP05.2 C2.1/C2.2 | Equipamentos noturnos, iluminação |
| 2 | `FLY-BAS-X3` | Hover e taxi com referência noturna limitada | Hover / taxi | existente | REAPROVEITAR | FAP05.2 H2.3 | Uso de iluminação externa |
| 3 | `OPS-NRM-X2` | Decolagem normal noturna | Decolagem | existente | REAPROVEITAR | FAP05.2 H4.2 | Perfil de saída noturno |
| 4 | `FLY-BAS-X1` | Controle VFR noturno | Cruzeiro noturno | existente | REAPROVEITAR | FAP05.2 | Adaptação visual noturna |
| 5 | `A139-MOD-01` | Modos AFCS em condição noturna | Cruzeiro / automação | existente (V5/V6) | REAPROVEITAR | - | Automação noturna |
| 6 | `OPS-NAV-X1` | Navegação FMS noturna | Navegação | existente | REAPROVEITAR | FAP06 CIR.5 | Navegação instrumental |
| 7 | `CAU-DCG-53` | Single DC GEN failure — carga elétrica noturna | Evento elétrico | existente | REALOCAR | QRH AW139 | Impacto nos sistemas noturnos |
| 8 | `A139-CKL-02` | Aplicação do QRH em condição noturna | QRH | existente (V5/V6) | REAPROVEITAR | - | Leitura de CAS/Q RH com pouca luz |
| 9 | `CAU-FLO-73` | Fuel low — decisão noturna | Evento combustível | existente | REALOCAR | QRH AW139 | Alternado em condições noturnas |
| 10 | `WAR-OUT-15` | Engine failure noturno | Evento motor | existente | REALOCAR | QRH AW139 | OEI com referência limitada |
| 11 | `CAU-LIC-60` | OEI limit timer — planejamento noturno | Monitoramento OEI | existente | REALOCAR | QRH AW139 | Tempo até pouso noturno |
| 12 | `A139-OEI-01` | Perfil OEI — planejamento de emergência noturno | Perfil OEI | existente (V5/V6) | REAPROVEITAR | - | Seleção de área de pouso |
| 13 | `OPS-APP-X1` | Aproximação ILS noturna | Aproximação IFR | existente | REAPROVEITAR | FAP06 IAP3.2 | Uso de auxílios de aproximação |
| 14 | `OPS-APP-X4` | Aproximação grande ângulo noturna | Aproximação | existente | REAPROVEITAR | - | Aproximação típica noturna |
| 15 | `A139-ARN-01` | Arremetida noturna | Arremetida | existente (V5/V6) | REAPROVEITAR | - | Transição para IMC noturno |
| 16 | `OPS-NRM-X1` | Pouso noturno — procedimentos normais | Pouso | existente | REAPROVEITAR | FAP05.2 H4.3 | Iluminação de pouso |
| 17 | `WAR-GEN-11` | Dual DC GEN failure noturno | Evento elétrico avançado | existente | REALOCAR | QRH AW139 | Perda elétrica total à noite |
| 18 | `A139-EST-01` | Encerramento pós-voo noturno | Pós-pouso | existente (V5/V6) | REAPROVEITAR | FAP05.2 H4.5/C2.3 | Corte e iluminação |

**NOTECHS:** 15 itens padrão.
**Códigos removidos:** LOFT-NOT-20, LOFT-NOT-21 (CRM) → NOTECHS.

---

### 4.6 `A139-NOT-02` — Noturno Offshore AW139

**Situação atual:** Mistura LOFT-NOT-* + LOFT-OFF-* + OPS-OFF-X1/X2. CRM em LOFT-OFF-22 e LOFT-NOT-22.
**Objetivo V6.1:** Treinamento noturno offshore AW139.

| ordem | codigo_final | nome_final | fase/contexto | origem | decisao | fonte/FAP | observacao |
|---:|---|---|---|---|---|---|---|
| 1 | `A139-CKL-01` | Checklist e preparação offshore noturna | Preparação | existente (V6) | REAPROVEITAR | FAP14 Offshore, FAP05.2 C2.1/C2.2 | Equipamentos offshore + noturno |
| 2 | `OPS-OFF-X1` | Navegação offshore — planejamento de rota para UM | Planejamento | existente | REAPROVEITAR | FAP14 Offshore | Rota para Unidade Marítima |
| 3 | `FLY-BAS-X3` | Hover e taxi — helideck noturno | Hover / helideck | existente | REAPROVEITAR | FAP05.2 H2.3 | Operação em helideck iluminado |
| 4 | `OPS-NRM-X2` | Decolagem offshore noturna | Decolagem | existente | REAPROVEITAR | FAP05.2 H4.2 | Perfil de saída do helideck |
| 5 | `OPS-NAV-X1` | Navegação FMS em rota offshore | Enroute | existente | REAPROVEITAR | FAP06 CIR.5, FAP14 | Navegação para UM |
| 6 | `FLY-BAS-X1` | Controle VFR em rota offshore noturna | Cruzeiro | existente | REAPROVEITAR | FAP05.2 | Voo de cruzeiro |
| 7 | `OPS-OFF-X2` | Aproximação offshore a Unidade Marítima | Aproximação offshore | existente | REAPROVEITAR | FAP14 Offshore | Aproximação à UM à noite |
| 8 | `OPS-APP-X4` | Aproximação grande ângulo — helideck | Aproximação | existente | REAPROVEITAR | - | Perfil de aproximação offshore |
| 9 | `CAU-FLO-73` | Fuel low em rota offshore | Evento combustível | existente | REALOCAR | QRH AW139 | Decisão de retorno/alternado |
| 10 | `WAR-OUT-15` | Engine failure em contexto offshore | Evento motor | existente | REALOCAR | QRH AW139 | OEI em rota offshore |
| 11 | `CAU-LIC-60` | OEI limit timer — decisão offshore | Monitoramento OEI | existente | REALOCAR | QRH AW139 | Retorno ou amerissagem |
| 12 | `WAR-GEN-11` | Dual DC GEN failure offshore | Evento elétrico | existente | REALOCAR | QRH AW139 | Perda elétrica em rota |
| 13 | `A139-CKL-02` | QRH para emergência offshore noturna | QRH | existente (V5/V6) | REAPROVEITAR | - | Procedimentos QRH |
| 14 | `OPS-APP-X1` | Aproximação ILS para retorno à costa | Aproximação IFR | existente | REAPROVEITAR | FAP06 IAP3.2 | Retorno IFR ao continente |
| 15 | `OPS-APP-X3` | Missed approach offshore | Missed approach | existente | REAPROVEITAR | FAP06 IAP2.3 | Arremetida no helideck |
| 16 | `OPS-NRM-X1` | Pouso em helideck noturno | Pouso offshore | existente | REAPROVEITAR | FAP14 Offshore | Pouso com iluminação do helideck |
| 17 | `FLY-BAS-17` | Autorotação em proximidade da água | Emergência | existente | REALOCAR | - | Ditching / amerissagem |
| 18 | `A139-EST-01` | Encerramento pós-voo offshore | Pós-pouso | existente (V5/V6) | REAPROVEITAR | FAP05.2 H4.5/C2.3 | Fechamento no helideck |

**NOTECHS:** 15 itens padrão.
**Códigos removidos:** LOFT-OFF-22, LOFT-NOT-22 (CRM) → NOTECHS.

---

### 4.7 `S76-NOT-01` — Noturno Onshore S76

**Situação atual:** Predominantemente S76-LOFT-* com alguns S76-* específicos. CRM legado em LOFT-12/16/21/22.
**Objetivo V6.1:** Ajuste mínimo — remover CRM legado e substituir por reforço técnico S76.

| ordem | codigo_final | nome_final | fase/contexto | origem | decisao | fonte/FAP | observacao |
|---:|---|---|---|---|---|---|---|
| 1 | `S76-CKL-01` | Checklist e preparação noturna | Preparação | existente (V5/V6) | REAPROVEITAR | FAP05.2 C2.1/C2.2 | Preparação para voo noturno |
| 2 | `S76-NVF-00` | Procedimentos normais VFR noturno | Preparação / voo normal | existente (periódico) | REAPROVEITAR | FAP05.2 H4.1/H4.3 | Voo visual noturno |
| 3 | `S76-HOV-00` | Hover e taxi noturno | Hover / taxi | existente (periódico) | REAPROVEITAR | FAP05.2 H2.3 | Controle com referência limitada |
| 4 | `S76-DNR-01` | Decolagem normal noturna | Decolagem | existente (V5/V6) | REAPROVEITAR | FAP05.2 H4.2 | Perfil de decolagem |
| 5 | `S76-SUB-01` | Subida controlada noturna | Subida | existente (V5/V6) | REAPROVEITAR | - | Transição para cruzeiro |
| 6 | `S76-PWR-01` | Controle de potência e torque | Cruzeiro | existente (V5/V6) | REAPROVEITAR | FAP05.2 H4.1 | Monitoramento noturno |
| 7 | `S76-NDL-00` | Navegação diurna limitada — adaptação noturna | Navegação | existente | REAPROVEITAR | - | Navegação com referência reduzida |
| 8 | `76-FALGC` | Falha de gerador DC — elétrica noturna | Evento elétrico | existente | REALOCAR | - | Carga elétrica noturna |
| 9 | `76-FALFF` | Falha de alimentação feeder/bateria | Evento elétrico | existente | REALOCAR | - | Sistema elétrico noturno |
| 10 | `76-FLWNR` | Vazão de combustível anormal | Evento combustível | existente | REALOCAR | - | Monitoramento noturno |
| 11 | `76-MOTCZ` | Falha de motor em cruzeiro | Evento motor | existente | REALOCAR | - | Item essencial |
| 12 | `S76-CKL-03` | Aplicação do ECL para falha de motor | ECL | existente (V5/V6) | REAPROVEITAR | FAP05.2 H7.4 | ECL em condição noturna |
| 13 | `S76-OEI-01` | Perfil OEI noturno | Perfil OEI | existente (V5/V6) | REAPROVEITAR | - | Planejamento de pouso |
| 14 | `S76-APN-01` | Aproximação normal noturna | Aproximação | existente (V5/V6) | REAPROVEITAR | FAP05.2 H4.3 | Perfil visual noturno |
| 15 | `S76-PNO-01` | Pouso normal noturno | Pouso | existente (V5/V6) | REAPROVEITAR | FAP05.2 H4.3 | Pouso com iluminação |
| 16 | `S76-ARN-01` | Arremetida noturna | Arremetida | existente (V5/V6) | REAPROVEITAR | - | Transição para IMC noturno |
| 17 | `S76-AUT-70` | Autorotação | Emergência | existente (periódico) | REAPROVEITAR | - | Controle de energia |
| 18 | `S76-EST-01` | Encerramento pós-voo noturno | Pós-pouso | existente (V5/V6) | REAPROVEITAR | FAP05.2 H4.5/C2.3 | Corte e estacionamento |

**NOTECHS:** 15 itens padrão.
**Códigos removidos:** S76-LOFT-12, S76-LOFT-16, S76-LOFT-21, S76-LOFT-22 (CRM legado) → NOTECHS.

---

### 4.8 `S76-NOT-02` — Noturno Offshore S76

**Situação atual:** Mistura S76-LOFT-* + LOFT-OFF-* + S76-*. CRM em LOFT-OFF-22 e S76-LOFT-21.
**Objetivo V6.1:** Padronizar para códigos S76-*, remover LOFT-OFF-* genéricos.

| ordem | codigo_final | nome_final | fase/contexto | origem | decisao | fonte/FAP | observacao |
|---:|---|---|---|---|---|---|---|
| 1 | `S76-CKL-01` | Checklist e preparação offshore noturna | Preparação | existente (V5/V6) | REAPROVEITAR | FAP14, FAP05.2 C2.1/C2.2 | Equipamentos offshore |
| 2 | `S76-TDP-00` | Decolagem classe 2 — helideck noturno | Decolagem offshore | existente (periódico) | REAPROVEITAR | FAP05.2 H4.2, FAP14 | Perfil TDP |
| 3 | `S76-HOV-00` | Hover e posicionamento no helideck | Hover | existente (periódico) | REAPROVEITAR | FAP05.2 H2.3 | Helideck iluminado |
| 4 | `S76-NVF-00` | Cruzeiro — procedimentos normais offshore | Cruzeiro | existente (periódico) | REAPROVEITAR | FAP05.2 H4.1/H4.3 | Rota para UM |
| 5 | `S76-PWR-01` | Controle de potência em rota offshore | Cruzeiro | existente (V5/V6) | REAPROVEITAR | FAP05.2 H4.1 | Parâmetros de motor |
| 6 | `76-FLWNR` | Vazão de combustível — monitoramento offshore | Evento combustível | existente | REALOCAR | - | Autonomia offshore |
| 7 | `76-MOTCZ` | Falha de motor em rota offshore | Evento motor | existente | REALOCAR | - | OEI em rota |
| 8 | `S76-CKL-03` | Aplicação do ECL para falha de motor offshore | ECL | existente (V5/V6) | REAPROVEITAR | FAP05.2 H7.4 | Procedimentos |
| 9 | `S76-OEI-01` | Perfil OEI — retorno à costa | Perfil OEI | existente (V5/V6) | REAPROVEITAR | - | Planejamento de retorno |
| 10 | `S76-XFD-20` | Crossfeed total — gerenciamento de combustível | Combustível | existente (periódico) | REALOCAR | - | Pós-falha de motor |
| 11 | `76-FALGC` | Falha de gerador DC offshore | Evento elétrico | existente | REALOCAR | - | Sistema elétrico |
| 12 | `S76-LDP-00` | Pouso em helideck | Pouso offshore | existente (periódico) | REAPROVEITAR | FAP14 | Aproximação e pouso |
| 13 | `S76-APO-01` | Aproximação offshore a Unidade Marítima | Aproximação offshore | existente (V5/V6) | REAPROVEITAR | FAP14 | Aproximação à UM |
| 14 | `S76-ARO-01` | Arremetida offshore | Arremetida offshore | existente (V5/V6) | REAPROVEITAR | FAP14 | Arremetida no helideck |
| 15 | `76-AUTAG` | Autorotação para a água | Ditching | existente | REALOCAR | FAP05.2 Emergências, FAP14 | Autorotação água |
| 16 | `S76-DIT-71` | Ditching com potência | Ditching | existente (periódico) | REAPROVEITAR | FAP05.2 Emergências, FAP14 | Amerissagem controlada |
| 17 | `S76-FLU-01` | Flutuabilidade e evacuação aquática | Pós-ditching | existente (V5/V6) | REAPROVEITAR | FAP14 | Procedimentos pós-amerissagem |
| 18 | `S76-EST-01` | Encerramento pós-voo offshore | Pós-pouso | existente (V5/V6) | REAPROVEITAR | FAP05.2 H4.5/C2.3 | Fechamento |

**NOTECHS:** 15 itens padrão.
**Códigos removidos:** LOFT-OFF-22, S76-LOFT-21 (CRM) → NOTECHS.

---

## 5. Fichas com GO Documental Preliminar (Pendente FAP/PTO Interno)

### 5.1 `TRE-INST` — Treinamento de Instrutor

**Situação atual:** 22 códigos `INV-*` organizados em blocos: CGE (conhecimentos gerais, 5), INS (instrução, 8), MAN (manobras, 4), CRM (5).
**Problema:** 5 códigos INV-CRM como itens técnicos.
**Fontes regulatórias localizadas:**
- RBAC 61 EMD 16, Subparte M — 61.231, 61.233, 61.237 (habilitação de instrutor de voo).
- RBAC 135 EMD 15 — 135.338 (qualificações de instrutor), 135.340 (treinamento de instrutor), 135.330 (CRM).
**Pendência:** FAP/PTO interno específico da Costa do Sol para instrutor não localizado. A estrutura abaixo é consistente com os RBAC, mas precisa de validação contra documentação operacional interna.
**Status:** GO documental preliminar.

**Estrutura proposta:**

A ficha de instrutor deve avaliar competências de **ensino e supervisão**, não apenas técnica de voo. Com base nos RBAC localizados:

| bloco | posições | tipo | conteúdo | fundamento RBAC |
|---|---|---|---|---|
| Técnica de voo | 1-6 | Técnico (voo) | Manobras essenciais demonstradas com precisão pelo candidato a instrutor | RBAC 61.233(a) |
| Instrução | 7-14 | Instrucional | Briefing estruturado, demonstração pedagógica, intervenção segura, debriefing técnico, avaliação do aluno, padronização de instrução | RBAC 135.340, RBAC 61.237 |
| Segurança e gestão | 15-18 | Técnico/instrucional | Gerenciamento da sessão de instrução, segurança operacional, tomada de decisão instrucional, aplicação de CRM na instrução | RBAC 135.330, RBAC 135.338 |
| NOTECHS | 19-33 | Comportamental | 15 NOTECHS como ferramenta interna padronizada para observação de CRM e competências não técnicas, alinhada aos temas do RBAC 135.330 | RBAC 135.330 |

Os 5 códigos `INV-CRM-*` atuais devem ser removidos das 18 técnicas e seu conteúdo — quando relevante para a instrução — migrado para o bloco NOTECHS ou para os itens instrucionais (posições 7-14).


### 5.2 `CRED-EXA` — Credenciamento de Examinador

**Situação atual:** 22 códigos `EXA-*` organizados em blocos: CGE (5), NTS (7 — NOTECHS de examinador), CND (6 — condução), ETH (4 — ética).
**Ponto positivo:** Já tem bloco NOTECHS-like (EXA-NTS-01..07).
**Fontes regulatórias localizadas:**
- RBAC 135 EMD 15 — 135.337 (qualificações de examinador), 135.339 (treinamento de examinador), 135.330 (CRM).
**Pendência:** FAP/PTO interno específico da Costa do Sol para examinador não localizado. A estrutura abaixo é consistente com os RBAC, mas precisa de validação contra documentação operacional interna.
**Status:** GO documental preliminar.

**Estrutura proposta:**

A ficha de examinador deve avaliar a capacidade de **conduzir verificações de proficiência com padronização e imparcialidade**. Com base nos RBAC localizados:

| bloco | posições | tipo | conteúdo | fundamento RBAC |
|---|---|---|---|---|
| Conhecimentos gerais | 1-5 | Técnico | Regulamentação aplicável, critérios de avaliação, documentação de check ride, requisitos de certificação | RBAC 135.337 |
| Condução de cheque | 6-13 | Técnico/processo | Condução de cenário de avaliação, aplicação objetiva de critérios, imparcialidade, gerenciamento de tempo e briefing/debriefing de cheque | RBAC 135.339 |
| Decisão | 14-18 | Técnico | Registro de discrepâncias, decisão aprovado/reprovado, padronização entre examinadores, segurança operacional durante o cheque | RBAC 135.337, RBAC 135.330 |
| NOTECHS | 19-33 | Comportamental | 15 NOTECHS como ferramenta interna padronizada para observação de CRM e competências não técnicas, alinhada aos temas do RBAC 135.330 | RBAC 135.330 |

O bloco `EXA-NTS-01..07` existente é um bom ponto de partida e pode ser adaptado para os 15 NOTECHS padronizados. Os códigos `EXA-ETH-*` atuais tratam de ética e conduta profissional — conteúdo que deve permanecer nas 18 técnicas (posições 6-13 ou 14-18) ou ser integrado ao bloco NOTECHS, a critério do operador.

---

## 6. Fichas Operacionais Convertidas no Fechamento V6.1

### 6.1 `SK76-S-01/02` — Semestral Noturno SK76

**Status:** GO documental.

- Baseado em `S76-NOT-01`.
- Convertido para 18 técnicas específicas SK76/S76 + 15 NOTECHS.
- `LOFT-NOT-*` genérico removido das 18 técnicas.
- Sequência pedagógica mantida: preparação → checklist → execução → evento → procedimento → decisão → encerramento.
- Referências documentais passam a ficar estruturadas fora de `descricao`, com prioridade para FAP 05.2, FAP 06, FAP 14 e `FONTE_OPERADOR` quando a fonte interna do operador for necessária.

### 6.2 `SK76-S-02/02` — Semestral Check IFR SK76

**Status:** GO documental.

- Baseado na lógica IFR/check de `A139-S-02/02`, adaptado para códigos `76-*` e `S76-*`.
- Convertido para 18 técnicas específicas SK76/S76 + 15 NOTECHS.
- `LOFT-CHK-*` genérico removido das 18 técnicas.
- Referências documentais passam a ficar estruturadas fora de `descricao`, com prioridade para FAP 05.2, FAP 06, FAP 14 e `FONTE_OPERADOR` quando a fonte interna do operador for necessária.

---

## 7. Tabela de Códigos Reaproveitados

| Família | Códigos | Quantidade |
|---|---|---|
| AW139 operacionais | `CAU-*`, `WAR-*`, `OPS-*`, `FLY-*`, `A139-*` | ~80 ocorrências nas 8 fichas GO |
| S76 operacionais | `76-*`, `S76-*` | ~60 ocorrências nas 4 fichas S76 GO |
| Instrutor (preliminar) | `INV-*` | 17 (excluindo CRM) |
| Examinador (preliminar) | `EXA-*` | 15 (excluindo NTS, que já é bloco NOTECHS-like) |

---

## 8. Tabela de Códigos Novos Necessários

**Zero códigos novos necessários** para as 8 fichas com GO documental. Todos os 18 itens por ficha foram compostos com códigos existentes no catálogo.

Para `TRE-INST` e `CRED-EXA`, códigos novos podem ser necessários após validação do FAP/PTO interno — avaliar naquele momento.

---

## 9. Tabela de Itens Removidos das 18 e Movidos

| Modelo | Códigos removidos das 18 | Destino |
|---|---|---|
| `A139-S-01/02` | LOFT-NOT-20, LOFT-NOT-21, LOFT-NOT-22 | NOTECHS |
| `A139-S-02/02` | LOFT-CHK-04, LOFT-CHK-16, LOFT-CHK-20, LOFT-CHK-21, LOFT-CHK-22 | NOTECHS / observação |
| `A139-REQ-01` | LOFT-CHK-04, LOFT-CHK-16, LOFT-CHK-20, LOFT-CHK-21, LOFT-CHK-22 | NOTECHS / observação |
| `S76-REQ-01` | **S76-CRM-01, S76-COM-01, S76-ATC-01**, S76-LOFT-21, S76-LOFT-22 | NOTECHS (CRM/COM) / observação |
| `A139-NOT-01` | LOFT-NOT-20, LOFT-NOT-21 | NOTECHS |
| `A139-NOT-02` | LOFT-OFF-22, LOFT-NOT-22 | NOTECHS |
| `S76-NOT-01` | S76-LOFT-12, S76-LOFT-16, S76-LOFT-21, S76-LOFT-22 | NOTECHS |
| `S76-NOT-02` | LOFT-OFF-22, S76-LOFT-21 | NOTECHS |
| `TRE-INST` | INV-CRM-01..05 | NOTECHS (preliminar) |
| `CRED-EXA` | EXA-NTS-01..07 como bloco NOTECHS-like; EXA-ETH-* pendente de classificação final | NOTECHS / 18 técnicas conforme validação FAP/PTO interno |

---

## 10. Pendências Regulatórias

| # | Pendência | Impacto | Quem Resolve | Status |
|---|---|---|---|---|
| 1 | RBAC 61 EMD 16 + RBAC 135 EMD 15 localizados como base regulatória | `TRE-INST`, `CRED-EXA` têm GO documental preliminar | ✅ Localizado | ✅ |
| 2 | FAP/PTO interno Costa do Sol para instrutor não localizado | Validação da estrutura proposta de `TRE-INST` contra documentação operacional interna | Owner | Pendente |
| 3 | FAP/PTO interno Costa do Sol para examinador não localizado | Validação da estrutura proposta de `CRED-EXA` contra documentação operacional interna | Owner | Pendente |
| 4 | Confirmar internamente o pacote documental/fonte do operador para itens específicos de QRH/AFM/FCTM/MGO/MOM | Qualifica o status `FONTE_OPERADOR` sem alterar a conversão já definida | Owner | Pendente |
| 5 | RBAC 61 — validação de requisitos de reaquisição | `A139-REQ-01`, `S76-REQ-01` | Owner | Pendente |

---

## 11. Critérios de GO / NO-GO para Implementação

### NO-GO se:

- ❌ Qualquer ficha operacional ativa sem 18+15 e sem justificativa.
- ❌ SK76 semestral operacional sem 18 técnicas específicas ou com LOFT genérico residual nas 18.
- ❌ `S76-CRM-01`, `S76-COM-01`, `S76-ATC-01` permanecerem como manobras.
- ❌ CRM/NTS/briefing/debriefing genérico nas 18 técnicas de qualquer ficha.
- ❌ `TRE-INST` ou `CRED-EXA` implementados sem validação do FAP/PTO interno do operador.

### GO condicionado se:

- ✅ 8 fichas com GO documental aprovadas pelo instrutor/owner.
- ✅ `TRE-INST` e `CRED-EXA` com GO documental preliminar baseado em RBAC 61 + RBAC 135, pendente apenas de validação contra FAP/PTO interno.
- ✅ SK76 semestrais convertidos e tratados como operacionais na V6.1.
- ✅ PR #241 atualizado para refletir escopo parcial.

---

## 12. Confirmações

- ✅ Documento V6.1 revisado para refletir `12/12` com caminho definido.
- ✅ Nenhum apply executado.
- ✅ PR #241 preservado como draft parcial.
- ✅ Nenhum termo "homologado" ou "aprovado pela ANAC" foi usado.
- ✅ Nenhuma FAP ou regulamento foi inventado.
- ✅ Pendências regulatórias explicitamente listadas na seção 10.

---

## 13. Fechamento de Encerramento S76 (2026-07-04)

**Contexto:** A auditoria didática da V6.1 identificou que a ficha `S76-REQ-01` não possuía item explícito de encerramento operacional/pós-voo, com a última posição ocupada por `S76-LDP-00` (Pouso/decolagem em heliponto), que é manobra operacional e não cumpre função de fechamento da sessão. Esta seção originalmente afirmava que `SK76-S-01/02` e `SK76-S-02/02` já terminavam com `S76-EST-01` — **essa afirmação estava incorreta**: uma auditoria de execução controlada de produção (2026-07-04, pré-apply) verificou o loader diretamente e confirmou que ambas ainda terminavam em `S76-LDP-00`. As duas fichas foram corrigidas nesta rodada, junto com esta correção de registro.

**Fichas ajustadas:**

| Ficha | Item removido | Item inserido | Técnicas |
|---|---|---|---|
| `S76-REQ-01` | `S76-LDP-00` (Pouso/decolagem em heliponto) | `S76-EST-01` (Encerramento e procedimentos pós-voo) | 18 |
| `SK76-S-01/02` | `S76-LDP-00` (Pouso/decolagem em helideck) | `S76-EST-01` (Encerramento pós-voo noturno) | 18 |
| `SK76-S-02/02` | `S76-LDP-00` (Pouso/decolagem em helideck) | `S76-EST-01` (Encerramento e procedimentos pós-voo — check IFR) | 18 |

**Item utilizado:** `S76-EST-01` — "Encerramento e procedimentos pós-voo", `fase_voo: pos_pouso`, referência FAP05.2 H4.5/C2.3. Já existente no catálogo de manobras S76 e semanticamente adequado como fechamento operacional.

**Justificativa pedagógica:** A sequência lógica de uma ficha de voo deve seguir: preparação → execução técnica → anormalidade/emergência → estabilização → pouso/chegada → encerramento. `S76-EST-01` fornece o encerramento operacional observável (corte, estacionamento, pós-voo), em contraste com `S76-LDP-00` que é manobra de heliponto (execução, não encerramento).

**PTO referência:** Seção 2.2.6 (fichas com identificação, módulo, avaliação por item, comentários técnicos), Seção 2.3.4.2 (registro de desempenho por item), Seção 4.3 (fichas SK76 padronizadas).

**Confirmações:**
- ✅ `S76-REQ-01`, `SK76-S-01/02` e `SK76-S-02/02` com encerramento explícito `S76-EST-01`.
- ✅ Nenhuma ficha ultrapassa 18 técnicas.
- ✅ NOTECHS permanecem separados (15 globais).
- ✅ Dry-run `READY_FOR_REVIEW`, zero validation issues.
- ✅ 16/16 testes da Matriz V6.1 passando.
- ✅ Lint limpo.
- ✅ Sem alteração em TRE-INST, CRED-EXA, AW139, V6 originais, Qualificações.
- ✅ Sem produção, sem DML, sem migration remota, sem deploy.
