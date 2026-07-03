# Costa do Sol / AirTrust - Matriz V3 Final Revisavel 20260703

Status do documento: proposta operacional fechada para revisao de instrutor e futura implementacao controlada. Nao houve implementacao, DML, migration, deploy, PR nem toque em producao.

## 1. Veredito geral

**GO para revisao operacional, com pendencias controladas.** Todas as fichas abaixo foram fechadas com exatamente 18 tecnicas explicitas, com os 15 NOTECHS fixos fora das 18 tecnicas, sem mistura AW139/S76 e com recomendacao principal de AW139 periodico em 4 sessoes por ciclo.

Condicoes do GO:
- todas as fichas abaixo estao fechadas com 18 tecnicas explicitas;
- os 15 NOTECHS fixos ficam fora das 18 tecnicas em todas as fichas;
- os itens CRM/NTS historicos dos LOFTs viram legado logico;
- QRH AW139, ECL S76, PTO-B e owner/PTO permanecem como validacao final antes de qualquer implementacao.

## 2. Decisoes incorporadas da V2

- reaproveitamento maximo do catalogo real AirTrust 20260702;
- normalizacao obrigatoria da familia DECU S76 (`S76-DMN-21`, `S76-DDE-21`, `S76-DM1-22`, `S76-DMB-24`);
- separacao obrigatoria entre `Fuel Pressure` e `Fuel Low` no S76;
- retirada de `LOFT-CHK-04`, `16`, `20`, `21`, `22` das 18 tecnicas;
- criacao analitica de `OPS-OFF-X3` para ditching/flutuabilidade AW139;
- criacao analitica de `LOFT-CHK-23` para painel limitado/falha de instrumentos IFR;
- recomendacao principal de AW139 periodico com 4 sessoes/ciclo.

## 3. O que mudou da V2 para V3

- a V2 mostrava base atual + cortes + adicoes; a V3 explicita item por item a matriz final de cada ficha;
- cada linha agora tem `codigo_final`, `nome_final`, `origem`, `decisao`, `fonte`, `fap_refs`, `status_validacao` e `observacao`;
- as matrizes LOFT/Check AW139 ja saem limpas de CRM/NTS tecnico-comportamental;
- a V3 fecha o AW139 periodico recomendado em 4 sessoes/ciclo e deixa a alternativa de 3 sessoes apenas como nao recomendada.

## Premissas Fixas

- cada ficha nova carrega NOTECHS-01..15 fixos, fora das 18 tecnicas, conforme src/react-app/pages/simuladores/fichas/notechs.ts.
- PTO-B/complementar nao foi localizado no workspace;
- QRH AW139 e ECL/checklist S76 nao foram localizados em texto local reutilizavel no workspace; por isso os campos dependentes ficam com status de validacao clara.

## Matriz final S76/SK76 Inicial

### Sessao 01/12 - Familiarizacao

Modelo-base auditado: `SK76-I-01/12`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | 76-POUAB | Pouso abortado | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 2 | 76-POUMO | Pouso monomotor - Categoria A ou B PEA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 3 | 76-MOTHV | Falha de motor em pairado 5 a 10 pes | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 4 | 76-MOTCA | Falha de motor na decolagem - Categoria A PRA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 5 | 76-MOTCB | Falha de motor na decolagem - Categoria B | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 6 | 76-MOTCZ | Falha de motor durante o cruzeiro | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 7 | 76-MOTAP | Falha de motor na aproximacao - Categoria A | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 8 | S76-DMN-21 | DECU - Falha Menor | renomeado | REAPROVEITAR_RENOMEANDO | AirTrust catalogo; PTO-A | FAP05.2 H7.4/H7.9; validar ECL/PTO | validado_catalogo | Normalizar legado 76-DCUMN para S76-DMN-21 |
| 9 | S76-DDE-21 | DECU - Falha Degradada | renomeado | REAPROVEITAR_RENOMEANDO | AirTrust catalogo; PTO-A | FAP05.2 H7.4/H7.9; validar ECL/PTO | validado_catalogo | Normalizar legado 76-DCUDG para S76-DDE-21 |
| 10 | S76-FPL-31 | Luz de Aviso de Pressao de Combustivel | renomeado | REAPROVEITAR_RENOMEANDO | AirTrust catalogo; PTO-A | FAP05.2 falhas de sistemas/combustivel; validar ECL | validado_catalogo | Normalizar legado 76-COMBX para S76-FPL-31 |
| 11 | 76-FLWNR | Vazao de combustivel fora da faixa normal | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 12 | 76-OILMT | Falha no sistema de oleo do motor | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 13 | 76-FALGC | Falha em um gerador DC PEA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 14 | 76-HIDPB | Falha da bomba ou perda de pressao no | validar | VALIDAR_ECL | AirTrust catalogo; PTO-A | - | validar_ecl | Fechar nomenclatura final Servo SYS vs hidraulico com ECL/PTO |
| 15 | 76-APXPR | Aproximacao de precisao IFR (ILS/RNP) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 16 | 76-APXNP | Aproximacao de nao precisao IFR (VOR/NDB) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 17 | 76-APXPI | Aproximacao perdida IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 18 | 76-ARRIF | Arremetida IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |

### Sessao 02/12 - Emergencias Powerplant

Modelo-base auditado: `SK76-I-02/12`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | 76-AUTAG | Autorrotacao para a agua | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 2 | 76-POUMO | Pouso monomotor - Categoria A ou B PEA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 3 | 76-MOTCA | Falha de motor na decolagem - Categoria A PRA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 4 | 76-MOTCB | Falha de motor na decolagem - Categoria B | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 5 | 76-MOTHV | Falha de motor em pairado 5 a 10 pes | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 6 | 76-MOTCZ | Falha de motor durante o cruzeiro | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 7 | 76-MOTAP | Falha de motor na aproximacao - Categoria A | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 8 | 76-APXAL | Aproximacao alternada - Categoria A | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 9 | 76-APXOI | Aproximacao IFR com um motor inoperante | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 10 | S76-DM1-22 | DECU - Falha Maior - Um Motor | renomeado | REAPROVEITAR_RENOMEANDO | AirTrust catalogo; PTO-A | FAP05.2 H7.4/H7.9; validar ECL/PTO | validado_catalogo | Normalizar legado 76-DCU1M para S76-DM1-22 |
| 11 | S76-DMB-24 | DECU - Falha Maior - Ambos os Motores | renomeado | REAPROVEITAR_RENOMEANDO | AirTrust catalogo; PTO-A | FAP05.2 H7.4/H7.9; validar ECL/PTO | validado_catalogo | Normalizar legado 76-DCU2M para S76-DMB-24 |
| 12 | 76-N1TQF | Falha nos indicadores N1 ou Torque | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 13 | 76-OILMT | Falha no sistema de oleo do motor | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 14 | S76-FPL-31 | Luz de Aviso de Pressao de Combustivel | renomeado | REAPROVEITAR_RENOMEANDO | AirTrust catalogo; PTO-A | FAP05.2 falhas de sistemas/combustivel; validar ECL | validado_catalogo | Normalizar legado 76-COMBX para S76-FPL-31 |
| 15 | 76-FLWNR | Vazao de combustivel fora da faixa normal | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 16 | 76-POUAB | Pouso abortado | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 17 | 76-APXPI | Aproximacao perdida IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 18 | 76-ARRIF | Arremetida IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |

### Sessao 03/12 - Sistema Eletrico e Noturno

Modelo-base auditado: `SK76-I-03/12`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | 76-FALGC | Falha em um gerador DC PEA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 2 | 76-FALGD | Falha em ambos os geradores DC | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 3 | 76-SOBGD | Sobretemperatura de gerador DC | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 4 | 76-FALGA | Falha no gerador AC | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 5 | 76-FALEB | Falha de alimentacao no barramento essencial | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 6 | 76-FALIV | Falha no inversor | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 7 | 76-FALFF | Falha de alimentacao - feeder / bateria no | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 8 | 76-PER26 | Perda de referencia de 26 VAC | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 9 | 76-FALRM | Falha no sistema mestre de radio | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 10 | 76-FALEF | Mau funcionamento do EFIS | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 11 | 76-FALAD | Falha no sistema de dados de voo | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 12 | 76-PERAT | Perda do indicador primario de atitude em IMC | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 13 | 76-POUAB | Pouso abortado | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 14 | 76-POUMO | Pouso monomotor - Categoria A ou B PEA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 15 | 76-AUTAG | Autorrotacao para a agua | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 16 | 76-MOTCZ | Falha de motor durante o cruzeiro | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 17 | 76-ARRIF | Arremetida IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 18 | 76-HIDPB | Falha da bomba ou perda de pressao no | validar | VALIDAR_ECL | AirTrust catalogo; PTO-A | - | validar_ecl | Fechar nomenclatura final Servo SYS vs hidraulico com ECL/PTO |

### Sessao 04/12 - IFR e Navegacao

Modelo-base auditado: `SK76-I-04/12`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | 76-PRGGP | Programacao do GPS, HSI e EFIS | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 2 | 76-DECSI | Decolagem por instrumentos (SID) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 3 | 76-APXPR | Aproximacao de precisao IFR (ILS/RNP) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 4 | 76-APXNP | Aproximacao de nao precisao IFR (VOR/NDB) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 5 | 76-APXPI | Aproximacao perdida IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 6 | 76-ARRIF | Arremetida IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 7 | 76-APXOI | Aproximacao IFR com um motor inoperante | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 8 | 76-APXAL | Aproximacao alternada - Categoria A | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 9 | 76-FALPA | Falha no piloto automatico | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 10 | 76-FALFD | Falha no flight director | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 11 | 76-FALTS | Falha no indicador TS | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 12 | 76-FALAD | Falha no sistema de dados de voo | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 13 | 76-PERAT | Perda do indicador primario de atitude em IMC | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 14 | 76-PER26 | Perda de referencia de 26 VAC | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 15 | 76-MOTAP | Falha de motor na aproximacao - Categoria A | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 16 | 76-HIDPB | Falha da bomba ou perda de pressao no | validar | VALIDAR_ECL | AirTrust catalogo; PTO-A | - | validar_ecl | Fechar nomenclatura final Servo SYS vs hidraulico com ECL/PTO |
| 17 | 76-MGBSF | Falhas no sistema da MGB | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 18 | 76-INCMO | Incendio no compartimento do motor | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |

### Sessao 05/12 - AFCS e Autopilot

Modelo-base auditado: `SK76-I-05/12`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | 76-FALPA | Falha no piloto automatico | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 2 | 76-FALFD | Falha no flight director | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 3 | 76-FALTS | Falha no indicador TS | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 4 | 76-FALEF | Mau funcionamento do EFIS | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 5 | 76-FALAD | Falha no sistema de dados de voo | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 6 | 76-PERAT | Perda do indicador primario de atitude em IMC | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 7 | 76-FALRM | Falha no sistema mestre de radio | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 8 | 76-PRGGP | Programacao do GPS, HSI e EFIS | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 9 | 76-APXPR | Aproximacao de precisao IFR (ILS/RNP) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 10 | 76-APXNP | Aproximacao de nao precisao IFR (VOR/NDB) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 11 | 76-APXPI | Aproximacao perdida IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 12 | 76-ARRIF | Arremetida IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 13 | 76-APXOI | Aproximacao IFR com um motor inoperante | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 14 | 76-MOTCZ | Falha de motor durante o cruzeiro | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 15 | 76-MOTAP | Falha de motor na aproximacao - Categoria A | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 16 | 76-POUAB | Pouso abortado | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 17 | 76-APXAL | Aproximacao alternada - Categoria A | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 18 | 76-DECSI | Decolagem por instrumentos (SID) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |

### Sessao 06/12 - DECU e Falhas Combinadas

Modelo-base auditado: `SK76-I-06/12`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | S76-DMN-21 | DECU - Falha Menor | renomeado | REAPROVEITAR_RENOMEANDO | AirTrust catalogo; PTO-A | FAP05.2 H7.4/H7.9; validar ECL/PTO | validado_catalogo | Normalizar legado 76-DCUMN para S76-DMN-21 |
| 2 | S76-DDE-21 | DECU - Falha Degradada | renomeado | REAPROVEITAR_RENOMEANDO | AirTrust catalogo; PTO-A | FAP05.2 H7.4/H7.9; validar ECL/PTO | validado_catalogo | Normalizar legado 76-DCUDG para S76-DDE-21 |
| 3 | S76-DM1-22 | DECU - Falha Maior - Um Motor | renomeado | REAPROVEITAR_RENOMEANDO | AirTrust catalogo; PTO-A | FAP05.2 H7.4/H7.9; validar ECL/PTO | validado_catalogo | Normalizar legado 76-DCU1M para S76-DM1-22 |
| 4 | S76-DMB-24 | DECU - Falha Maior - Ambos os Motores | renomeado | REAPROVEITAR_RENOMEANDO | AirTrust catalogo; PTO-A | FAP05.2 H7.4/H7.9; validar ECL/PTO | validado_catalogo | Normalizar legado 76-DCU2M para S76-DMB-24 |
| 5 | 76-MOTCA | Falha de motor na decolagem - Categoria A PRA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 6 | 76-MOTCB | Falha de motor na decolagem - Categoria B | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 7 | 76-MOTHV | Falha de motor em pairado 5 a 10 pes | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 8 | 76-MOTCZ | Falha de motor durante o cruzeiro | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 9 | 76-MOTAP | Falha de motor na aproximacao - Categoria A | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 10 | 76-N1TQF | Falha nos indicadores N1 ou Torque | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 11 | S76-FPL-31 | Luz de Aviso de Pressao de Combustivel | renomeado | REAPROVEITAR_RENOMEANDO | AirTrust catalogo; PTO-A | FAP05.2 falhas de sistemas/combustivel; validar ECL | validado_catalogo | Normalizar legado 76-COMBX para S76-FPL-31 |
| 12 | 76-FLWNR | Vazao de combustivel fora da faixa normal | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 13 | 76-OILMT | Falha no sistema de oleo do motor | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 14 | 76-POUMO | Pouso monomotor - Categoria A ou B PEA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 15 | 76-AUTAG | Autorrotacao para a agua | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 16 | 76-APXPI | Aproximacao perdida IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 17 | 76-ARRIF | Arremetida IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 18 | 76-APXOI | Aproximacao IFR com um motor inoperante | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |

### Sessao 07/12 - Falhas Duplas, Energia e Gerenciamento

Modelo-base auditado: `SK76-I-07/12`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | 76-DUAHV | Falha dupla de motor em pairado ou. PRA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 2 | 76-DUADC | Falha dupla de motor durante decolageme | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 3 | 76-DUACZ | Falha dupla de motor durante o cruzeiro | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 4 | 76-AUTAG | Autorrotacao para a agua | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 5 | 76-POUAB | Pouso abortado | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 6 | 76-MOTHV | Falha de motor em pairado 5 a 10 pes | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 7 | 76-MOTCA | Falha de motor na decolagem - Categoria A PRA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 8 | 76-MOTCB | Falha de motor na decolagem - Categoria B | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 9 | 76-MOTCZ | Falha de motor durante o cruzeiro | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 10 | 76-MOTAP | Falha de motor na aproximacao - Categoria A | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 11 | S76-DMB-24 | DECU - Falha Maior - Ambos os Motores | renomeado | REAPROVEITAR_RENOMEANDO | AirTrust catalogo; PTO-A | FAP05.2 H7.4/H7.9; validar ECL/PTO | validado_catalogo | Normalizar legado 76-DCU2M para S76-DMB-24 |
| 12 | 76-PRGGP | Programacao do GPS, HSI e EFIS | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 13 | 76-DECSI | Decolagem por instrumentos (SID) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 14 | 76-APXPR | Aproximacao de precisao IFR (ILS/RNP) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 15 | 76-APXNP | Aproximacao de nao precisao IFR (VOR/NDB) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 16 | 76-APXPI | Aproximacao perdida IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 17 | 76-ARRIF | Arremetida IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 18 | 76-INCMO | Incendio no compartimento do motor | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |

### Sessao 08/12 - Rotor, Transmissao e Servo SYS

Modelo-base auditado: `SK76-I-08/12`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | 76-MGBSF | Falhas no sistema da MGB | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 2 | 76-MGBOL | Falhas no sistema de oleo da MGB | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 3 | 76-CHPTG | Chip ou alta temperatura no gearbox | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 4 | 76-SERTQ | Perda de pressao no servo do rotor de cauda | validar | VALIDAR_ECL | AirTrust catalogo; PTO-A | - | validar_ecl | Fechar nomenclatura final Servo SYS vs hidraulico com ECL/PTO |
| 5 | 76-SERJM | Atuador travado ou valvula de corte defeituosa | validar | VALIDAR_ECL | AirTrust catalogo; PTO-A | - | validar_ecl | Fechar nomenclatura final Servo SYS vs hidraulico com ECL/PTO |
| 6 | 76-AMOTV | Amortecedor dos comandos travado PRB | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 7 | 76-TRSRC | Falha do sistema de transmissao do rotor de | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 8 | 76-CTRRC | Falha no sistema de controle do rotor de cauda PF | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 9 | 76-HIDPB | Falha da bomba ou perda de pressao no | validar | VALIDAR_ECL | AirTrust catalogo; PTO-A | - | validar_ecl | Fechar nomenclatura final Servo SYS vs hidraulico com ECL/PTO |
| 10 | 76-POUAB | Pouso abortado | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 11 | 76-POUMO | Pouso monomotor - Categoria A ou B PEA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 12 | 76-MOTCZ | Falha de motor durante o cruzeiro | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 13 | 76-MOTAP | Falha de motor na aproximacao - Categoria A | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 14 | 76-AUTAG | Autorrotacao para a agua | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 15 | 76-ARRIF | Arremetida IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 16 | 76-APXOI | Aproximacao IFR com um motor inoperante | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 17 | 76-APXAL | Aproximacao alternada - Categoria A | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 18 | 76-DECSI | Decolagem por instrumentos (SID) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |

### Sessao 09/12 - Fogo, Fumaca e Alto Estresse

Modelo-base auditado: `SK76-I-09/12`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | 76-INCMO | Incendio no compartimento do motor | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 2 | 76-INCCB | Incendio na cabine ou cockpit | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 3 | 76-FUMBG | Fumaca no compartimento de bagagem | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 4 | 76-OILMT | Falha no sistema de oleo do motor | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 5 | 76-MGBOL | Falhas no sistema de oleo da MGB | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 6 | 76-MGBSF | Falhas no sistema da MGB | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 7 | 76-HIDPB | Falha da bomba ou perda de pressao no | validar | VALIDAR_ECL | AirTrust catalogo; PTO-A | - | validar_ecl | Fechar nomenclatura final Servo SYS vs hidraulico com ECL/PTO |
| 8 | 76-FALGD | Falha em ambos os geradores DC | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 9 | 76-FALEB | Falha de alimentacao no barramento essencial | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 10 | 76-FALIV | Falha no inversor | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 11 | 76-POUAB | Pouso abortado | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 12 | 76-POUMO | Pouso monomotor - Categoria A ou B PEA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 13 | 76-MOTCZ | Falha de motor durante o cruzeiro | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 14 | 76-AUTAG | Autorrotacao para a agua | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 15 | 76-APXPR | Aproximacao de precisao IFR (ILS/RNP) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 16 | 76-APXNP | Aproximacao de nao precisao IFR (VOR/NDB) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 17 | 76-APXPI | Aproximacao perdida IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 18 | 76-APXOI | Aproximacao IFR com um motor inoperante | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |

### Sessao 10/12 - Offshore

Modelo-base auditado: `SK76-I-10/12`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | 76-DECSI | Decolagem por instrumentos (SID) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 2 | 76-APXPR | Aproximacao de precisao IFR (ILS/RNP) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 3 | 76-APXNP | Aproximacao de nao precisao IFR (VOR/NDB) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 4 | 76-APXOI | Aproximacao IFR com um motor inoperante | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 5 | 76-MOTAP | Falha de motor na aproximacao - Categoria A | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 6 | 76-MOTCZ | Falha de motor durante o cruzeiro | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 7 | 76-POUMO | Pouso monomotor - Categoria A ou B PEA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 8 | 76-FALPA | Falha no piloto automatico | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 9 | 76-FALFD | Falha no flight director | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 10 | 76-PERAT | Perda do indicador primario de atitude em IMC | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 11 | 76-FALAD | Falha no sistema de dados de voo | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 12 | 76-POUAB | Pouso abortado | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 13 | 76-AUTAG | Autorrotacao para a agua | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 14 | 76-MOTHV | Falha de motor em pairado 5 a 10 pes | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 15 | 76-MOTCA | Falha de motor na decolagem - Categoria A PRA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 16 | 76-MOTCB | Falha de motor na decolagem - Categoria B | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 17 | 76-HIDPB | Falha da bomba ou perda de pressao no | validar | VALIDAR_ECL | AirTrust catalogo; PTO-A | - | validar_ecl | Fechar nomenclatura final Servo SYS vs hidraulico com ECL/PTO |
| 18 | 76-INCMO | Incendio no compartimento do motor | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |

### Sessao 11/12 - LOFT

Modelo-base auditado: `SK76-I-11/12`.

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
| 10 | 76-HIDPB | Falha da bomba ou perda de pressao no | validar | VALIDAR_ECL | AirTrust catalogo; PTO-A | - | validar_ecl | Fechar nomenclatura final Servo SYS vs hidraulico com ECL/PTO |
| 11 | 76-INCMO | Incendio no compartimento do motor | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 12 | 76-MGBSF | Falhas no sistema da MGB | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 13 | 76-POUAB | Pouso abortado | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 14 | 76-AUTAG | Autorrotacao para a agua | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 15 | 76-APXAL | Aproximacao alternada - Categoria A | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 16 | 76-MOTHV | Falha de motor em pairado 5 a 10 pes | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 17 | 76-MOTCA | Falha de motor na decolagem - Categoria A PRA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 18 | 76-MOTCB | Falha de motor na decolagem - Categoria B | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |

### Sessao 12/12 - LOFT Check

Modelo-base auditado: `SK76-I-12/12`.

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
| 9 | 76-DUAHV | Falha dupla de motor em pairado ou. PRA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 10 | 76-DUADC | Falha dupla de motor durante decolageme | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 11 | 76-DUACZ | Falha dupla de motor durante o cruzeiro | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 12 | 76-APXPR | Aproximacao de precisao IFR (ILS/RNP) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 13 | 76-APXNP | Aproximacao de nao precisao IFR (VOR/NDB) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 14 | 76-APXOI | Aproximacao IFR com um motor inoperante | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 15 | 76-APXPI | Aproximacao perdida IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 16 | 76-ARRIF | Arremetida IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 17 | 76-MGBSF | Falhas no sistema da MGB | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 18 | 76-HIDPB | Falha da bomba ou perda de pressao no | validar | VALIDAR_ECL | AirTrust catalogo; PTO-A | - | validar_ecl | Fechar nomenclatura final Servo SYS vs hidraulico com ECL/PTO |

## Matriz final AW139 Inicial

### Sessao 01/12 - Familiarizacao VFR

Modelo-base auditado: `A139-I-01/12`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | FLY-BAS-X1 | Controle geral VFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 basico/normais conforme aplicavel | validado_catalogo | - |
| 2 | FLY-BAS-X3 | Hover e taxi | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H2.3/H3.1 | validado_catalogo | - |
| 3 | OPS-NRM-X1 | Procedimentos normais | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.1/H4.3 | validado_catalogo | - |
| 4 | OPS-NRM-X2 | Decolagens e pousos | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.2/H4.3 | validado_catalogo | - |
| 5 | OPS-NRM-X3 | Circuito de trafego | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 6 | WAR-LOW-29 | Rotor RPM low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 7 | WAR-HIG-29 | Rotor RPM high | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 8 | CAU-HOT-65 | Hot start | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 9 | CAU-CST-59 | Compressor stall | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 10 | CAU-OVS-64 | Engine overspeed | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 11 | CAU-NGO-63 | NG overspeed | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 12 | CAU-FLO-73 | Fuel low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 13 | CAU-2FP-74 | Double fuel pump failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 14 | WAR-OIL-18 | Oil pressure low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 15 | CAU-LIC-60 | OEI limit timer | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 16 | WAR-EEC-18 | EEC FAIL | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 17 | WAR-IDL-16 | Engine stuck IDLE | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 18 | FLY-BAS-17 | Autorotacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |

### Sessao 02/12 - Emergencias Powerplant

Modelo-base auditado: `A139-I-02/12`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | FLY-BAS-17 | Autorotacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 2 | WAR-OUT-15 | Engine failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 3 | WAR-EEC-18 | EEC FAIL | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 4 | WAR-IDL-16 | Engine stuck IDLE | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 5 | CAU-CST-59 | Compressor stall | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 6 | CAU-OVS-64 | Engine overspeed | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 7 | CAU-NGO-63 | NG overspeed | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 8 | WAR-OIL-18 | Oil pressure low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 9 | CAU-HOT-65 | Hot start | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 10 | WAR-LOW-29 | Rotor RPM low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 11 | WAR-HIG-29 | Rotor RPM high | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 12 | CAU-LIC-60 | OEI limit timer | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 13 | CAU-CND-61 | Compressor no demand | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 14 | CAU-TNF-62 | Throttle non-follow | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 15 | CAU-FLO-73 | Fuel low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 16 | CAU-2FP-74 | Double fuel pump failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 17 | CAU-EFP-75 | Engine fuel pump failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 18 | OPS-NRM-X3 | Circuito de trafego | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |

### Sessao 03/12 - Sistema Eletrico

Modelo-base auditado: `A139-I-03/12`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | WAR-GEN-11 | Dual DC GEN failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 2 | WAR-BAT-14 | Main battery overheat | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 3 | WAR-AUX-14 | Aux battery overheat | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 4 | CAU-DCG-53 | Single DC GEN failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 5 | CAU-BOF-55 | Battery offline | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 6 | CAU-DCB-56 | DC bus failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 7 | CAU-ACB-57 | AC bus failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 8 | CAU-28D-58 | 28V DC failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 9 | FLY-BAS-X1 | Controle geral VFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 basico/normais conforme aplicavel | validado_catalogo | - |
| 10 | FLY-BAS-X3 | Hover e taxi | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H2.3/H3.1 | validado_catalogo | - |
| 11 | OPS-NRM-X2 | Decolagens e pousos | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.2/H4.3 | validado_catalogo | - |
| 12 | OPS-NRM-X3 | Circuito de trafego | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 13 | WAR-OUT-15 | Engine failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 14 | FLY-BAS-17 | Autorotacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 15 | CAU-FLO-73 | Fuel low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 16 | WAR-LOW-29 | Rotor RPM low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 17 | WAR-HIG-29 | Rotor RPM high | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 18 | CAU-HYP-77 | Hydraulic pressure low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |

### Sessao 04/12 - IFR e Navegacao

Modelo-base auditado: `A139-I-04/12`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | FLY-BAS-X2 | Controle geral IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 basico/normais conforme aplicavel | validado_catalogo | - |
| 2 | OPS-APP-X1 | Precision approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP3.2 | validado_catalogo | - |
| 3 | OPS-APP-X2 | Non-precision approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.2 | validado_catalogo | - |
| 4 | OPS-APP-X3 | Missed approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.3 | validado_catalogo | - |
| 5 | OPS-NAV-X1 | Navegacao FMS e convencional | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.5 | validado_catalogo | - |
| 6 | OPS-NAV-X3 | Holding pattern | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.7 | validado_catalogo | - |
| 7 | FLY-BAS-X4 | Recuperacao de atitudes anormais | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 8 | WAR-OUT-15 | Engine failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 9 | FLY-BAS-17 | Autorotacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 10 | CAU-FLO-73 | Fuel low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 11 | WAR-LOW-29 | Rotor RPM low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 12 | WAR-HIG-29 | Rotor RPM high | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 13 | OPS-NRM-X1 | Procedimentos normais | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.1/H4.3 | validado_catalogo | - |
| 14 | OPS-NRM-X2 | Decolagens e pousos | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.2/H4.3 | validado_catalogo | - |
| 15 | CAU-LIC-60 | OEI limit timer | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 16 | WAR-STA-X1 | Static port obstruction | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 17 | CAU-ADC-48 | ADC failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 18 | CAU-GPS-52 | GPS failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |

### Sessao 05/12 - AFCS e Autopilot

Modelo-base auditado: `A139-I-05/12`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | OPS-NAV-X2 | Uso AP e automacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.3/CIR.5 conforme aplicavel | validado_catalogo | - |
| 2 | FLY-BAS-X2 | Controle geral IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 basico/normais conforme aplicavel | validado_catalogo | - |
| 3 | OPS-APP-X1 | Precision approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP3.2 | validado_catalogo | - |
| 4 | OPS-APP-X3 | Missed approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.3 | validado_catalogo | - |
| 5 | CAU-APO-38 | AP OFF | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 6 | OPS-NAV-X1 | Navegacao FMS e convencional | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.5 | validado_catalogo | - |
| 7 | OPS-NAV-X3 | Holding pattern | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.7 | validado_catalogo | - |
| 8 | OPS-NAV-X4 | SID e STAR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.3 | validado_catalogo | - |
| 9 | OPS-APP-X2 | Non-precision approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.2 | validado_catalogo | - |
| 10 | FLY-BAS-X4 | Recuperacao de atitudes anormais | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 11 | WAR-OUT-15 | Engine failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 12 | FLY-BAS-17 | Autorotacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 13 | CAU-HOT-65 | Hot start | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 14 | WAR-LOW-29 | Rotor RPM low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 15 | WAR-HIG-29 | Rotor RPM high | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 16 | CAU-FLO-73 | Fuel low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 17 | CAU-LIC-60 | OEI limit timer | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 18 | WAR-STA-X1 | Static port obstruction | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |

### Sessao 06/12 - AFCS Degradacoes

Modelo-base auditado: `A139-I-06/12`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | CAU-APF-37 | AP failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 2 | CAU-MIS-40 | AP MISTRIM | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 3 | CAU-SAS-41 | SAS degraded | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 4 | CAU-AFD-41 | AFCS degraded | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 5 | FLY-BAS-X2 | Controle geral IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 basico/normais conforme aplicavel | validado_catalogo | - |
| 6 | OPS-APP-X1 | Precision approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP3.2 | validado_catalogo | - |
| 7 | OPS-APP-X3 | Missed approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.3 | validado_catalogo | - |
| 8 | OPS-NAV-X2 | Uso AP e automacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.3/CIR.5 conforme aplicavel | validado_catalogo | - |
| 9 | FLY-BAS-X4 | Recuperacao de atitudes anormais | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 10 | WAR-OUT-15 | Engine failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 11 | FLY-BAS-17 | Autorotacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 12 | OPS-NAV-X1 | Navegacao FMS e convencional | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.5 | validado_catalogo | - |
| 13 | OPS-NAV-X3 | Holding pattern | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.7 | validado_catalogo | - |
| 14 | WAR-LOW-29 | Rotor RPM low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 15 | WAR-HIG-29 | Rotor RPM high | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 16 | CAU-FLO-73 | Fuel low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 17 | CAU-LIC-60 | OEI limit timer | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 18 | OPS-APP-X2 | Non-precision approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.2 | validado_catalogo | - |

### Sessao 07/12 - Avionics Failures

Modelo-base auditado: `A139-I-07/12`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | CAU-ADS-46 | ADS failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 2 | CAU-AHR-47 | AHRS failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 3 | CAU-DUD-46 | Display unit degraded | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 4 | CAU-PFD-45 | CAU-PFD-45 | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 5 | CAU-MFD-45 | MFD failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 6 | CAU-EIC-45 | EICAS failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 7 | CAU-ADC-48 | ADC failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 8 | FLY-BAS-X4 | Recuperacao de atitudes anormais | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 9 | FLY-BAS-X2 | Controle geral IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 basico/normais conforme aplicavel | validado_catalogo | - |
| 10 | OPS-APP-X1 | Precision approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP3.2 | validado_catalogo | - |
| 11 | OPS-APP-X2 | Non-precision approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.2 | validado_catalogo | - |
| 12 | OPS-APP-X3 | Missed approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.3 | validado_catalogo | - |
| 13 | OPS-NAV-X1 | Navegacao FMS e convencional | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.5 | validado_catalogo | - |
| 14 | OPS-NAV-X2 | Uso AP e automacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.3/CIR.5 conforme aplicavel | validado_catalogo | - |
| 15 | WAR-OUT-15 | Engine failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 16 | FLY-BAS-17 | Autorotacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 17 | WAR-LOW-29 | Rotor RPM low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 18 | WAR-HIG-29 | Rotor RPM high | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |

### Sessao 08/12 - Rotor e Transmissao

Modelo-base auditado: `A139-I-08/12`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | WAR-MGB-30 | MGB oil pressure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 2 | WAR-TMP-30 | MGB oil temp high | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 3 | CAU-MGP-105 | MGB chip detected | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 4 | WAR-TDR-X1 | Tail rotor drive failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 5 | WAR-TCS-X1 | Tail rotor control failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 6 | WAR-MRC-X1 | Main rotor binding | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 7 | WAR-TRC-X1 | Tail rotor binding | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 8 | CAU-HYP-77 | Hydraulic pressure low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 9 | CAU-SRV-80 | Servo bypass | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 10 | OPS-NRM-X2 | Decolagens e pousos | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.2/H4.3 | validado_catalogo | - |
| 11 | FLY-BAS-X3 | Hover e taxi | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H2.3/H3.1 | validado_catalogo | - |
| 12 | WAR-OUT-15 | Engine failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 13 | FLY-BAS-17 | Autorotacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 14 | WAR-GER-27 | Landing gear emergency | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 15 | CAU-HOT-65 | Hot start | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 16 | WAR-LOW-29 | Rotor RPM low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 17 | WAR-HIG-29 | Rotor RPM high | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 18 | CAU-FLO-73 | Fuel low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |

### Sessao 09/12 - Fogo e Fumaca

Modelo-base auditado: `A139-I-09/12`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | WAR-FIR-21 | Engine fire | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 2 | WAR-CAB-23 | Cabin/cockpit smoke | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 3 | WAR-BAG-23 | Baggage fire | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 4 | CAU-O2P-82 | O2 pressure low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 5 | WAR-OUT-15 | Engine failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 6 | FLY-BAS-17 | Autorotacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 7 | OPS-NRM-X2 | Decolagens e pousos | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.2/H4.3 | validado_catalogo | - |
| 8 | FLY-BAS-X3 | Hover e taxi | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H2.3/H3.1 | validado_catalogo | - |
| 9 | WAR-GER-27 | Landing gear emergency | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 10 | CAU-HYP-77 | Hydraulic pressure low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 11 | CAU-SRV-80 | Servo bypass | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 12 | WAR-LOW-29 | Rotor RPM low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 13 | WAR-HIG-29 | Rotor RPM high | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 14 | CAU-HOT-65 | Hot start | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 15 | CAU-FLO-73 | Fuel low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 16 | OPS-APP-X1 | Precision approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP3.2 | validado_catalogo | - |
| 17 | OPS-APP-X3 | Missed approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.3 | validado_catalogo | - |
| 18 | WAR-STA-X1 | Static port obstruction | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |

### Sessao 10/12 - Offshore

Modelo-base auditado: `A139-I-10/12`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | OPS-OFF-X1 | Navegacao offshore | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP14 Offshore/SOP | validado_catalogo | - |
| 2 | OPS-OFF-X2 | Aproximacao offshore | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP14 Offshore/SOP | validado_catalogo | - |
| 3 | OPS-APP-X4 | Aproximacao grande angulo | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 4 | OPS-NRM-X2 | Decolagens e pousos | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.2/H4.3 | validado_catalogo | - |
| 5 | OPS-NAV-X1 | Navegacao FMS e convencional | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.5 | validado_catalogo | - |
| 6 | OPS-NAV-X2 | Uso AP e automacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.3/CIR.5 conforme aplicavel | validado_catalogo | - |
| 7 | OPS-APP-X1 | Precision approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP3.2 | validado_catalogo | - |
| 8 | CAU-FLO-73 | Fuel low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 9 | WAR-OUT-15 | Engine failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 10 | FLY-BAS-17 | Autorotacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 11 | CAU-2FP-74 | Double fuel pump failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 12 | WAR-LOW-29 | Rotor RPM low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 13 | WAR-HIG-29 | Rotor RPM high | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 14 | CAU-HOT-65 | Hot start | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 15 | CAU-LIC-60 | OEI limit timer | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 16 | WAR-GEN-11 | Dual DC GEN failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 17 | CAU-DCG-53 | Single DC GEN failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 18 | OPS-APP-X3 | Missed approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.3 | validado_catalogo | - |

### Sessao 11/12 - LOFT

Modelo-base auditado: `A139-I-11/12`.

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
| 11 | LOFT-CHK-12 | Chegada STAR/RNAV e Descida para | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Descida/Chegada; FAP06 CIR.6 | validar_fap | - |
| 12 | LOFT-CHK-13 | Procedimento de Espera IFR (Holding) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Espera; FAP06 CIR.7 | validar_fap | - |
| 13 | LOFT-CHK-14 | Aproximacao Nao-Precisao - RNAV ou VOR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP2.1/IAP2.2 | validar_fap | - |
| 14 | LOFT-CHK-15 | Arremetida por Abaixo dos Minimos (NPA) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP2.3 | validar_fap | - |
| 15 | LOFT-CHK-17 | Setup e Briefing para ILS | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP3.1 | validar_fap | - |
| 16 | LOFT-CHK-18 | Aproximacao ILS - Final e Decisao na DA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP3.2; FAP14 Aproximacao de precisao | validar_fap | - |
| 17 | LOFT-CHK-19 | Pouso no Alternado e Procedimentos Pos-Voo | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP05.2 H4.3/H4.5/C2.3 | validar_fap | - |
| 18 | LOFT-CHK-23 | Painel Limitado / Falha de Instrumentos IFR | novo | VALIDAR_FAP | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 painel limitado/falha de instrumentos; validar FAP | validar_fap | Nao existe equivalente explicito suficiente no catalogo atual |

### Sessao 12/12 - LOFT Check

Modelo-base auditado: `A139-I-12/12`.

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
| 11 | LOFT-CHK-12 | Chegada STAR/RNAV e Descida para | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Descida/Chegada; FAP06 CIR.6 | validar_fap | - |
| 12 | LOFT-CHK-13 | Procedimento de Espera IFR (Holding) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Espera; FAP06 CIR.7 | validar_fap | - |
| 13 | LOFT-CHK-14 | Aproximacao Nao-Precisao - RNAV ou VOR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP2.1/IAP2.2 | validar_fap | - |
| 14 | LOFT-CHK-15 | Arremetida por Abaixo dos Minimos (NPA) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP2.3 | validar_fap | - |
| 15 | LOFT-CHK-17 | Setup e Briefing para ILS | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP3.1 | validar_fap | - |
| 16 | LOFT-CHK-18 | Aproximacao ILS - Final e Decisao na DA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP3.2; FAP14 Aproximacao de precisao | validar_fap | - |
| 17 | LOFT-CHK-19 | Pouso no Alternado e Procedimentos Pos-Voo | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP05.2 H4.3/H4.5/C2.3 | validar_fap | - |
| 18 | LOFT-CHK-23 | Painel Limitado / Falha de Instrumentos IFR | novo | VALIDAR_FAP | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 painel limitado/falha de instrumentos; validar FAP | validar_fap | Nao existe equivalente explicito suficiente no catalogo atual |

## Matriz final S76/SK76 Periodico

### Ciclo 1 - Sessao 01/03 - VFR/emergencias

Modelo-base auditado: `S76-P-C1/VFR`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | S76-NVF-00 | Procedimentos Normais VFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.1/H4.3 | validado_catalogo | - |
| 2 | S76-HOT-00 | Partida Quente (Hot Start) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 3 | S76-STF-00 | Falha na Partida (Engine Start Failure) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 4 | S76-FMG-08 | Fogo no Compartimento do Motor no Solo | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 5 | S76-FMI-09 | Fogo Interno no Motor apos Desligamento | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 6 | S76-HOV-00 | Controle Geral VFR - Hover & Taxi | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H2.3/H3.1 | validado_catalogo | - |
| 7 | S76-TRH-38 | Falha do Rotor de Cauda no Hover | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 8 | S76-TDP-00 | Decolagem Classe 2 - Helideck (TDP) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.2; FAP14 Offshore | validado_catalogo | - |
| 9 | S76-FMA-14 | Falha de Motor - Decolagem Abortada | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 10 | S76-FMC-15 | Falha de Motor - Decolagem Continuada | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 11 | S76-NRO-00 | Disparo de NR (NR Overspeed) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 12 | S76-NRL-00 | Queda de NR (NR Low) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 13 | S76-CST-00 | Estol de Compressor (Compressor Stall) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 14 | S76-MRV-00 | Vibracao do Rotor Principal | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 15 | S76-MGP-33 | Pressdo de Oleo da MGB 40-45 PSI | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 16 | S76-SSS-42 | Servo SYS - luz do sistema servo simples | validar | VALIDAR_ECL | AirTrust catalogo; PTO-A | - | validar_ecl | Fechar nomenclatura final Servo SYS vs hidraulico com ECL/PTO |
| 17 | S76-FFL-32 | Luz de Cautela do Filtro de Combustivel | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 18 | S76-FFM-32 | Fluxo de Combustivel fora do Normal | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |

### Ciclo 1 - Sessao 02/03 - IFR/noturno/offshore

Modelo-base auditado: `S76-P-C1/IFR`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | S76-NIF-00 | Procedimentos Normais IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 2 | S76-FDA-00 | Uso do Diretor de Voo e Automacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 3 | S76-CGI-00 | Controle Geral IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 4 | S76-SID-00 | SID&STAR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.3 | validado_catalogo | - |
| 5 | S76-FCR-17 | Falha de Motor em Cruzeiro | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 6 | S76-DM1-22 | DECU - Falha Maior - Um Motor | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H7.4/H7.9; validar ECL/PTO | validado_catalogo | - |
| 7 | S76-DMN-21 | DECU - Falha Menor | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H7.4/H7.9; validar ECL/PTO | validado_catalogo | - |
| 8 | S76-N1T-30 | Mau Func. do Indicador de N1 ou Torque | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 9 | S76-EOP-25 | Pressao de Oleo do Motor - Luz de Aviso | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 10 | S76-SDC-50 | Luz de Cautela de Gerador CC Simples | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 11 | S76-APF-57 | Falha do Piloto Automatico - Dual / Simples | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 12 | S76-TRM-58 | Falha do Trim (Trim Fail Caution) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 13 | S76-FDF-60 | Falha do Diretor de Voo / FD Coupler | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 14 | S76-AHR-65 | FalhadoAHRS | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 15 | S76-HLD-00 | Holding Pattern | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.7 | validado_catalogo | - |
| 16 | S76-EFV-11 | Fogo de Origem Eletrica - VMC (Breakout) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 17 | S76-ILS-00 | Aproximacao ILS | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP3.2 | validado_catalogo | - |
| 18 | S76-MIS-00 | Arremetida (Missed Approach) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.3 | validado_catalogo | - |

### Ciclo 1 - Sessao 03/03 - LOFT/check

Modelo-base auditado: `SK76-P-CHECK`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | S76-LOFT-01 | Calculo de Performance | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 2 | S76-LOFT-02 | Analise de Clima e NOTAM | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 3 | S76-LOFT-03 | Configuracao de Avionica (FMS) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 4 | S76-LOFT-04 | Briefing de Partida | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 5 | S76-LOFT-05 | Disciplina de Checklist | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 6 | S76-LOFT-06 | Monitoramento de Sistemas | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 7 | S76-LOFT-07 | Hover Check | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 8 | S76-LOFT-08 | Perfil de Decolagem | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 9 | S76-LOFT-09 | Gerenciamento do AFCS | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 10 | S76-LOFT-10 | Flight Path Monitoring | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 11 | S76-LOFT-11 | Navegacao e FMS em Rota | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 12 | S76-LOFT-13 | Identificacao e Diagnostico | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 13 | S76-LOFT-14 | Acoes de Memoria | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 14 | S76-LOFT-15 | Aplicacao do QRH | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 15 | S76-LOFT-17 | Gestao de Potencia OEI | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 16 | S76-LOFT-18 | Briefing de Aproximacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 17 | S76-LOFT-19 | Estabilizacao da Aproximacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 18 | S76-LOFT-20 | Tecnica de Pouso OEI | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |

### Ciclo 2 - Sessao 01/03 - VFR/emergencias

Modelo-base auditado: `S76-P-C2/VFR`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | S76-NVF-00 | Procedimentos Normais VFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.1/H4.3 | validado_catalogo | - |
| 2 | S76-HNG-00 | Partida Estagnada (Hung Start) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 3 | S76-HOV-00 | Controle Geral VFR - Hover & Taxi | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H2.3/H3.1 | validado_catalogo | - |
| 4 | S76-TDP-00 | Decolagem Classe 2 - Helideck (TDP) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.2; FAP14 Offshore | validado_catalogo | - |
| 5 | S76-OSP-27 | Falha da Protecao contra Overspeed | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 6 | S76-FMF-07 | Fogo no Compartimento do Motor em Voo | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 7 | S76-XFD-20 | Crossfeed Total apos Falha de Motor | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 8 | S76-FPL-31 | Luz de Aviso de Pressao de Combustivel | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 falhas de sistemas/combustivel; validar ECL | validado_catalogo | - |
| 9 | S76-LOW-32 | Luz de Cautela Fuel Low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 falhas de sistemas/combustivel; validar ECL | validado_catalogo | - |
| 10 | S76-MGL-33 | Pressao de Oleo da MGB Baixa | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 11 | S76-MGC-36 | Luz de Cautela de Chip da MGB | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 12 | S76-TRD-39 | Falha do Eixo do Rotor de Cauda em Voo | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 13 | S76-SS2-43 | Servo SYS - luzes dos sistemas servo 1 e 2 | validar | VALIDAR_ECL | AirTrust catalogo; PTO-A | - | validar_ecl | Fechar nomenclatura final Servo SYS vs hidraulico com ECL/PTO |
| 14 | S76-CLB-69 | Emperramento do Comando de Passo Coletivo | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 15 | S76-UGR-46 | Indicacao Insegura - Recolhimento do Trem | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 16 | S76-LGB-47 | Trem de Pouso - Extensao de Emergencia | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 17 | S76-DIT-71 | Ditching com Potencia | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 Emergencias; FAP14 Offshore | validado_catalogo | - |
| 18 | S76-AUT-70 | Autorotacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |

### Ciclo 2 - Sessao 02/03 - IFR/noturno/offshore

Modelo-base auditado: `S76-P-C2/IFR`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | S76-NIF-00 | Procedimentos Normais IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 2 | S76-FDA-00 | Uso do Diretor de Voo e Automacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 3 | S76-CGI-00 | Controle Geral IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 4 | S76-SID-00 | SID&STAR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.3 | validado_catalogo | - |
| 5 | S76-FCR-17 | Falha de Motor em Cruzeiro | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 6 | S76-ECO-20 | Oscilacao do Motor | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 7 | S76-DDE-21 | DECU - Falha Degradada | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H7.4/H7.9; validar ECL/PTO | validado_catalogo | - |
| 8 | S76-ECH-26 | Detector de Chip do Motor | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 9 | S76-T5I-31 | Mau Funcionamento do Indicador de T5 | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 10 | S76-DCD-50 | Luzes de Cautela dos Geradores CC 1 e 2 | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 11 | S76-BTO-53 | Luz de Cautela Bus Tie Open | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 12 | S76-CDC-59 | Cautela de Coletivo / Decouple | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 13 | S76-ADC-61 | Falha do ADC  Computador de Dados de Voo | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 14 | S76-CRT-63 | Falha da Tela CRT / Falha Total do EFIS | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 15 | S76-EFI-12 | Fogo de Origem Eletrica  IMC | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 16 | S76-HLD-00 | Holding Pattern | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.7 | validado_catalogo | - |
| 17 | S76-WSH-54 | Luz de Cautela Windshield Hot | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 18 | S76-RNV-00 | Aproximacao RNAV (GPS) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.2 | validado_catalogo | - |

### Ciclo 2 - Sessao 03/03 - LOFT/check

Modelo-base auditado: `SK76-P-CHECK`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | S76-LOFT-01 | Calculo de Performance | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 2 | S76-LOFT-02 | Analise de Clima e NOTAM | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 3 | S76-LOFT-03 | Configuracao de Avionica (FMS) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 4 | S76-LOFT-04 | Briefing de Partida | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 5 | S76-LOFT-05 | Disciplina de Checklist | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 6 | S76-LOFT-06 | Monitoramento de Sistemas | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 7 | S76-LOFT-07 | Hover Check | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 8 | S76-LOFT-08 | Perfil de Decolagem | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 9 | S76-LOFT-09 | Gerenciamento do AFCS | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 10 | S76-LOFT-10 | Flight Path Monitoring | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 11 | S76-LOFT-11 | Navegacao e FMS em Rota | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 12 | S76-LOFT-13 | Identificacao e Diagnostico | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 13 | S76-LOFT-14 | Acoes de Memoria | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 14 | S76-LOFT-15 | Aplicacao do QRH | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 15 | S76-LOFT-17 | Gestao de Potencia OEI | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 16 | S76-LOFT-18 | Briefing de Aproximacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 17 | S76-LOFT-19 | Estabilizacao da Aproximacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 18 | S76-LOFT-20 | Tecnica de Pouso OEI | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |

### Ciclo 3 - Sessao 01/03 - VFR/emergencias

Modelo-base auditado: `S76-P-C3/VFR`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | S76-NVF-00 | Procedimentos Normais VFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.1/H4.3 | validado_catalogo | - |
| 2 | S76-FGF-29 | Falha no Fly Gate - Antes da Partida | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 3 | S76-WCP-73 | Painel de Avisos e Cautelas (Analise) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 4 | S76-HOV-00 | Controle Geral VFR - Hover & Taxi | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H2.3/H3.1 | validado_catalogo | - |
| 5 | S76-TDP-00 | Decolagem Classe 2 - Helideck (TDP) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.2; FAP14 Offshore | validado_catalogo | - |
| 6 | S76-BFL-28 | Luz do Filtro de Barreira | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 7 | S76-PAL-30 | Luz Power Assurance | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 8 | S76-SFE-10 | Eliminacao de Fumaca e Vapores | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 9 | S76-BCS-10 | Fumaca no Compartimento de Bagagem | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 10 | S76-ESF-18 | Desligamento de Motor em Voo | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 11 | S76-ERF-18 | Religamento de Motor em Voo | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 12 | S76-EOT-25 | Temperatura de Oleo do Motor acima do Limite | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 13 | S76-OFL-30 | Luz Outof Fly | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 14 | S76-MOH-35 | Temperatura de Oleo da MGB Alta | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 15 | S76-IGB-37 | Luz de Cautela de Chip / Temperatura da | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 16 | S76-TCS-39 | Falha do Sistema de Controle do Rotor de | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 17 | S76-TDM-41 | Dano no Rotor de Cauda | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 18 | S76-FCD-67 | Emperramento do Amortecedor de Comando | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |

### Ciclo 3 - Sessao 02/03 - IFR/noturno/offshore

Modelo-base auditado: `S76-P-C3/IFR`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | S76-NIF-00 | Procedimentos Normais IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 2 | S76-FDA-00 | Uso do Diretor de Voo e Automacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 3 | S76-CGI-00 | Controle Geral IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 4 | S76-SID-00 | SID&STAR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.3 | validado_catalogo | - |
| 5 | S76-FCR-17 | Falha de Motor em Cruzeiro | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 6 | S76-CCF-10 | Fogo / Fumaca na Cabine em Voo | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 7 | S76-DMB-24 | DECU - Falha Maior - Ambos os Motores | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H7.4/H7.9; validar ECL/PTO | validado_catalogo | - |
| 8 | S76-AGB-48 | Luz de Cautela de Rolamento do Gerador CA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 9 | S76-EBV-54 | Luz de Cautela Ess Bus Volts Low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 10 | S76-EAI-55 | Luz de Cautela Engine Anti-loe | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 11 | S76-HOM-59 | Mau Funcionamento de Hardover / Oscilatorio | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 12 | S76-MBF-61 | Falha do Freio Magnetico - Ciclico / Coletivo | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 13 | S76-IID-62 | Falha do Display IIDS | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 14 | S76-SGA-62 | Falha do Gerador de Simbolo / ADC | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 15 | S76-CFC-63 | Falha do Ventilador CRT / Discrepancia | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 16 | S76-UAR-00 | Recuperacao Atitudes Anormais | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 17 | S76-ILS-00 | Aproximacao ILS | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP3.2 | validado_catalogo | - |
| 18 | S76-MIS-00 | Arremetida (Missed Approach) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.3 | validado_catalogo | - |

### Ciclo 3 - Sessao 03/03 - LOFT/check

Modelo-base auditado: `SK76-P-CHECK`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | S76-LOFT-01 | Calculo de Performance | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 2 | S76-LOFT-02 | Analise de Clima e NOTAM | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 3 | S76-LOFT-03 | Configuracao de Avionica (FMS) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 4 | S76-LOFT-04 | Briefing de Partida | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 5 | S76-LOFT-05 | Disciplina de Checklist | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 6 | S76-LOFT-06 | Monitoramento de Sistemas | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 7 | S76-LOFT-07 | Hover Check | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 8 | S76-LOFT-08 | Perfil de Decolagem | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 9 | S76-LOFT-09 | Gerenciamento do AFCS | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 10 | S76-LOFT-10 | Flight Path Monitoring | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 11 | S76-LOFT-11 | Navegacao e FMS em Rota | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 12 | S76-LOFT-13 | Identificacao e Diagnostico | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 13 | S76-LOFT-14 | Acoes de Memoria | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 14 | S76-LOFT-15 | Aplicacao do QRH | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 15 | S76-LOFT-17 | Gestao de Potencia OEI | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 16 | S76-LOFT-18 | Briefing de Aproximacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 17 | S76-LOFT-19 | Estabilizacao da Aproximacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |
| 18 | S76-LOFT-20 | Tecnica de Pouso OEI | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | - | validar_fap | - |

## Matriz final AW139 Periodico - Alternativa B (recomendada)

### Ciclo 1 - Sessao 01/04 - VFR/emergencias

Modelo-base auditado: `A139-P-C1/VFR`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | CAU-HOT-65 | Hot start | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 2 | FLY-BAS-X3 | Hover e taxi | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H2.3/H3.1 | validado_catalogo | - |
| 3 | OPS-NRM-X2 | Decolagens e pousos | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.2/H4.3 | validado_catalogo | - |
| 4 | WAR-OUT-15 | Engine failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 5 | WAR-LOW-29 | Rotor RPM low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 6 | WAR-HIG-29 | Rotor RPM high | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 7 | WAR-IDL-16 | Engine stuck IDLE | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 8 | CAU-CST-59 | Compressor stall | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 9 | CAU-OVS-64 | Engine overspeed | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 10 | WAR-FIR-21 | Engine fire | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 11 | FLY-BAS-17 | Autorotacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 12 | WAR-CAB-23 | Cabin/cockpit smoke | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 13 | CAU-MGP-105 | MGB chip detected | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 14 | WAR-MGB-30 | MGB oil pressure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 15 | WAR-TMP-30 | MGB oil temp high | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 16 | CAU-DCG-53 | Single DC GEN failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 17 | WAR-GEN-11 | Dual DC GEN failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 18 | OPS-OFF-X1 | Navegacao offshore | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP14 Offshore/SOP | validado_catalogo | - |

### Ciclo 1 - Sessao 02/04 - IFR/noturno/offshore

Modelo-base auditado: `A139-P-C1/IFR`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | OPS-NRM-X1 | Procedimentos normais | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.1/H4.3 | validado_catalogo | - |
| 2 | FLY-BAS-X2 | Controle geral IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 basico/normais conforme aplicavel | validado_catalogo | - |
| 3 | OPS-NAV-X2 | Uso AP e automacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.3/CIR.5 conforme aplicavel | validado_catalogo | - |
| 4 | CAU-APF-37 | AP failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 5 | CAU-AFD-41 | AFCS degraded | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 6 | CAU-AHR-47 | AHRS failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 7 | CAU-FMS-51 | FMS failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 8 | CAU-GPS-52 | GPS failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 9 | CAU-DCB-56 | DC bus failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 10 | WAR-BAG-23 | Baggage fire | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 11 | CAU-HYP-77 | Hydraulic pressure low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 12 | CAU-SRV-80 | Servo bypass | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 13 | OPS-NAV-X1 | Navegacao FMS e convencional | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.5 | validado_catalogo | - |
| 14 | OPS-NAV-X4 | SID e STAR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.3 | validado_catalogo | - |
| 15 | OPS-NAV-X3 | Holding pattern | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.7 | validado_catalogo | - |
| 16 | OPS-APP-X2 | Non-precision approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.2 | validado_catalogo | - |
| 17 | OPS-APP-X1 | Precision approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP3.2 | validado_catalogo | - |
| 18 | OPS-APP-X3 | Missed approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.3 | validado_catalogo | - |

### Ciclo 1 - Sessao 03/04 - LOFT/Offshore

Modelo-base auditado: `A139-P-LOFT/OFFSHORE`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | LOFT-OFF-01 | Performance CAT A para Helideck | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 2 | LOFT-OFF-02 | Planejamento de Missao Offshore | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 3 | LOFT-OFF-03 | Configuracao FMS - Rota Offshore | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 4 | LOFT-OFF-05 | Inspecao, Acionamento e Checklists | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 5 | LOFT-OFF-06 | Hover Check e Taxi Costeiro | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 6 | LOFT-OFF-07 | Decolagem CAT A - Clear Area ou Vertical | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 7 | LOFT-OFF-08 | Gestao de Automacao en Route | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 8 | LOFT-OFF-09 | Navegacao Offshore e Combustivel | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 9 | LOFT-OFF-11 | Diagnostico: HYD 1 FAIL | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 10 | LOFT-OFF-12 | Procedimentos Hidraulicos (Memoria + QRH) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 11 | LOFT-OFF-14 | Briefing de Aproximacao ao Helideck | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 12 | LOFT-OFF-15 | Pouso Normal no Helideck | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 13 | LOFT-OFF-16 | Gestao de Potencia OEI - Limites e | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 14 | LOFT-OFF-17 | OEI Antes do TDP - Decolagem Rejeitada | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 15 | LOFT-OFF-18 | OEI Apos o TDP - Fly-Away Monomotor | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 16 | LOFT-OFF-19 | OEI Antes do LDP - Arremetida Monomotor | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 17 | LOFT-OFF-20 | OEI Apos o LDP - Pouso Comprometido | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 18 | LOFT-OFF-21 | Estabilizacao Final e Controle de Rampa OEI | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |

### Ciclo 1 - Sessao 04/04 - LOFT/Check

Modelo-base auditado: `A139-P-LOFT/CHECK`.

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
| 11 | LOFT-CHK-12 | Chegada STAR/RNAV e Descida para | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Descida/Chegada; FAP06 CIR.6 | validar_fap | - |
| 12 | LOFT-CHK-13 | Procedimento de Espera IFR (Holding) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Espera; FAP06 CIR.7 | validar_fap | - |
| 13 | LOFT-CHK-14 | Aproximacao Nao-Precisao - RNAV ou VOR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP2.1/IAP2.2 | validar_fap | - |
| 14 | LOFT-CHK-15 | Arremetida por Abaixo dos Minimos (NPA) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP2.3 | validar_fap | - |
| 15 | LOFT-CHK-17 | Setup e Briefing para ILS | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP3.1 | validar_fap | - |
| 16 | LOFT-CHK-18 | Aproximacao ILS - Final e Decisao na DA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP3.2; FAP14 Aproximacao de precisao | validar_fap | - |
| 17 | LOFT-CHK-19 | Pouso no Alternado e Procedimentos Pos-Voo | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP05.2 H4.3/H4.5/C2.3 | validar_fap | - |
| 18 | LOFT-CHK-23 | Painel Limitado / Falha de Instrumentos IFR | novo | VALIDAR_FAP | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 painel limitado/falha de instrumentos; validar FAP | validar_fap | Nao existe equivalente explicito suficiente no catalogo atual |

### Ciclo 2 - Sessao 01/04 - VFR/emergencias

Modelo-base auditado: `A139-P-C2/VFR`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | CAU-HOT-65 | Hot start | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 2 | FLY-BAS-X3 | Hover e taxi | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H2.3/H3.1 | validado_catalogo | - |
| 3 | FLY-BAS-X1 | Controle geral VFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 basico/normais conforme aplicavel | validado_catalogo | - |
| 4 | OPS-NRM-X2 | Decolagens e pousos | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.2/H4.3 | validado_catalogo | - |
| 5 | WAR-OUT-15 | Engine failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 6 | WAR-SHT-19 | Emergency engine shutdown | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 7 | WAR-LOW-29 | Rotor RPM low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 8 | WAR-HIG-29 | Rotor RPM high | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 9 | WAR-EEC-18 | EEC FAIL | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 10 | WAR-IDL-16 | Engine stuck IDLE | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 11 | WAR-FIR-21 | Engine fire | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 12 | CAU-2FP-74 | Double fuel pump failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 13 | CAU-FLO-73 | Fuel low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 14 | CAU-LIC-60 | OEI limit timer | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 15 | OPS-OFF-X2 | Aproximacao offshore | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP14 Offshore/SOP | validado_catalogo | - |
| 16 | WAR-MGB-30 | MGB oil pressure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 17 | WAR-TMP-30 | MGB oil temp high | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 18 | CAU-DCG-53 | Single DC GEN failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |

### Ciclo 2 - Sessao 02/04 - IFR/noturno/offshore

Modelo-base auditado: `A139-P-C2/IFR`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | OPS-NRM-X1 | Procedimentos normais | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.1/H4.3 | validado_catalogo | - |
| 2 | OPS-NAV-X2 | Uso AP e automacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.3/CIR.5 conforme aplicavel | validado_catalogo | - |
| 3 | CAU-APO-38 | AP OFF | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 4 | CAU-SAS-41 | SAS degraded | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 5 | FLY-BAS-X4 | Recuperacao de atitudes anormais | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 6 | CAU-AHR-47 | AHRS failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 7 | CAU-FMS-51 | FMS failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 8 | WAR-CAB-23 | Cabin/cockpit smoke | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 9 | OPS-NAV-X1 | Navegacao FMS e convencional | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.5 | validado_catalogo | - |
| 10 | OPS-NAV-X4 | SID e STAR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.3 | validado_catalogo | - |
| 11 | OPS-NAV-X3 | Holding pattern | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.7 | validado_catalogo | - |
| 12 | OPS-APP-X2 | Non-precision approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.2 | validado_catalogo | - |
| 13 | OPS-APP-X1 | Precision approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP3.2 | validado_catalogo | - |
| 14 | OPS-APP-X3 | Missed approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.3 | validado_catalogo | - |
| 15 | WAR-OUT-15 | Engine failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 16 | CAU-HYP-77 | Hydraulic pressure low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 17 | WAR-GER-27 | Landing gear emergency | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 18 | FLY-BAS-X2 | Controle geral IFR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 basico/normais conforme aplicavel | validado_catalogo | - |

### Ciclo 2 - Sessao 03/04 - LOFT/Offshore

Modelo-base auditado: `A139-P-LOFT/OFFSHORE`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | LOFT-OFF-01 | Performance CAT A para Helideck | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 2 | LOFT-OFF-02 | Planejamento de Missao Offshore | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 3 | LOFT-OFF-03 | Configuracao FMS - Rota Offshore | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 4 | LOFT-OFF-05 | Inspecao, Acionamento e Checklists | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 5 | LOFT-OFF-06 | Hover Check e Taxi Costeiro | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 6 | LOFT-OFF-07 | Decolagem CAT A - Clear Area ou Vertical | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 7 | LOFT-OFF-08 | Gestao de Automacao en Route | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 8 | LOFT-OFF-09 | Navegacao Offshore e Combustivel | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 9 | LOFT-OFF-11 | Diagnostico: HYD 1 FAIL | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 10 | LOFT-OFF-12 | Procedimentos Hidraulicos (Memoria + QRH) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 11 | LOFT-OFF-14 | Briefing de Aproximacao ao Helideck | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 12 | LOFT-OFF-15 | Pouso Normal no Helideck | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 13 | LOFT-OFF-16 | Gestao de Potencia OEI - Limites e | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 14 | LOFT-OFF-17 | OEI Antes do TDP - Decolagem Rejeitada | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 15 | LOFT-OFF-18 | OEI Apos o TDP - Fly-Away Monomotor | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 16 | LOFT-OFF-19 | OEI Antes do LDP - Arremetida Monomotor | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 17 | LOFT-OFF-20 | OEI Apos o LDP - Pouso Comprometido | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 18 | LOFT-OFF-21 | Estabilizacao Final e Controle de Rampa OEI | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |

### Ciclo 2 - Sessao 04/04 - LOFT/Check

Modelo-base auditado: `A139-P-LOFT/CHECK`.

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
| 11 | LOFT-CHK-12 | Chegada STAR/RNAV e Descida para | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Descida/Chegada; FAP06 CIR.6 | validar_fap | - |
| 12 | LOFT-CHK-13 | Procedimento de Espera IFR (Holding) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Espera; FAP06 CIR.7 | validar_fap | - |
| 13 | LOFT-CHK-14 | Aproximacao Nao-Precisao - RNAV ou VOR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP2.1/IAP2.2 | validar_fap | - |
| 14 | LOFT-CHK-15 | Arremetida por Abaixo dos Minimos (NPA) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP2.3 | validar_fap | - |
| 15 | LOFT-CHK-17 | Setup e Briefing para ILS | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP3.1 | validar_fap | - |
| 16 | LOFT-CHK-18 | Aproximacao ILS - Final e Decisao na DA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP3.2; FAP14 Aproximacao de precisao | validar_fap | - |
| 17 | LOFT-CHK-19 | Pouso no Alternado e Procedimentos Pos-Voo | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP05.2 H4.3/H4.5/C2.3 | validar_fap | - |
| 18 | LOFT-CHK-23 | Painel Limitado / Falha de Instrumentos IFR | novo | VALIDAR_FAP | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 painel limitado/falha de instrumentos; validar FAP | validar_fap | Nao existe equivalente explicito suficiente no catalogo atual |

### Ciclo 3 - Sessao 01/04 - VFR/emergencias

Modelo-base auditado: `A139-P-C3/VFR`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | OPS-NRM-X1 | Procedimentos normais | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.1/H4.3 | validado_catalogo | - |
| 2 | FLY-BAS-X3 | Hover e taxi | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H2.3/H3.1 | validado_catalogo | - |
| 3 | OPS-NRM-X2 | Decolagens e pousos | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.2/H4.3 | validado_catalogo | - |
| 4 | OPS-NRM-X3 | Circuito de trafego | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 5 | WAR-LOW-29 | Rotor RPM low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 6 | WAR-HIG-29 | Rotor RPM high | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 7 | WAR-EEC-18 | EEC FAIL | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 8 | CAU-OVS-64 | Engine overspeed | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 9 | WAR-FIR-21 | Engine fire | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 10 | FLY-BAS-17 | Autorotacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 11 | WAR-BAT-14 | Main battery overheat | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 12 | WAR-AUX-14 | Aux battery overheat | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 13 | WAR-STA-X1 | Static port obstruction | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 14 | WAR-TDR-X1 | Tail rotor drive failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 15 | WAR-TCS-X1 | Tail rotor control failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 16 | WAR-MRC-X1 | Main rotor binding | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 17 | WAR-TRC-X1 | Tail rotor binding | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 18 | CAU-MGP-105 | MGB chip detected | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |

### Ciclo 3 - Sessao 02/04 - IFR/noturno/offshore

Modelo-base auditado: `A139-P-C3/IFR`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | OPS-NRM-X1 | Procedimentos normais | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP05.2 H4.1/H4.3 | validado_catalogo | - |
| 2 | OPS-NAV-X2 | Uso AP e automacao | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.3/CIR.5 conforme aplicavel | validado_catalogo | - |
| 3 | CAU-APF-37 | AP failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 4 | FLY-BAS-X4 | Recuperacao de atitudes anormais | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | - | validado_catalogo | - |
| 5 | CAU-ADS-46 | ADS failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 6 | CAU-DUD-46 | Display unit degraded | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 7 | WAR-CAB-23 | Cabin/cockpit smoke | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 8 | CAU-GPS-52 | GPS failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 9 | WAR-HIG-29 | Rotor RPM high | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 10 | WAR-LOW-29 | Rotor RPM low | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 11 | WAR-OUT-15 | Engine failure | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 12 | CAU-SRV-80 | Servo bypass | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 13 | OPS-NAV-X1 | Navegacao FMS e convencional | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.5 | validado_catalogo | - |
| 14 | OPS-NAV-X3 | Holding pattern | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 CIR.7 | validado_catalogo | - |
| 15 | OPS-APP-X2 | Non-precision approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.2 | validado_catalogo | - |
| 16 | OPS-APP-X1 | Precision approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP3.2 | validado_catalogo | - |
| 17 | WAR-GER-27 | Landing gear emergency | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; QRH AW139 | - | validar_qrh | - |
| 18 | OPS-APP-X3 | Missed approach | existente | REAPROVEITAR | AirTrust catalogo; PTO-A | FAP06 IAP2.3 | validado_catalogo | - |

### Ciclo 3 - Sessao 03/04 - LOFT/Offshore

Modelo-base auditado: `A139-P-LOFT/OFFSHORE`.

| ordem | codigo_final | nome_final | origem | decisao | fonte | fap_refs | status_validacao | observacao |
|---:|---|---|---|---|---|---|---|---|
| 1 | LOFT-OFF-01 | Performance CAT A para Helideck | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 2 | LOFT-OFF-02 | Planejamento de Missao Offshore | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 3 | LOFT-OFF-03 | Configuracao FMS - Rota Offshore | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 4 | LOFT-OFF-05 | Inspecao, Acionamento e Checklists | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 5 | LOFT-OFF-06 | Hover Check e Taxi Costeiro | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 6 | LOFT-OFF-07 | Decolagem CAT A - Clear Area ou Vertical | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 7 | LOFT-OFF-08 | Gestao de Automacao en Route | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 8 | LOFT-OFF-09 | Navegacao Offshore e Combustivel | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 9 | LOFT-OFF-11 | Diagnostico: HYD 1 FAIL | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 10 | LOFT-OFF-12 | Procedimentos Hidraulicos (Memoria + QRH) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 11 | LOFT-OFF-14 | Briefing de Aproximacao ao Helideck | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 12 | LOFT-OFF-15 | Pouso Normal no Helideck | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 13 | LOFT-OFF-16 | Gestao de Potencia OEI - Limites e | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 14 | LOFT-OFF-17 | OEI Antes do TDP - Decolagem Rejeitada | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 15 | LOFT-OFF-18 | OEI Apos o TDP - Fly-Away Monomotor | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 16 | LOFT-OFF-19 | OEI Antes do LDP - Arremetida Monomotor | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 17 | LOFT-OFF-20 | OEI Apos o LDP - Pouso Comprometido | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |
| 18 | LOFT-OFF-21 | Estabilizacao Final e Controle de Rampa OEI | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 14 | - | validar_fap | - |

### Ciclo 3 - Sessao 04/04 - LOFT/Check

Modelo-base auditado: `A139-P-LOFT/CHECK`.

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
| 11 | LOFT-CHK-12 | Chegada STAR/RNAV e Descida para | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Descida/Chegada; FAP06 CIR.6 | validar_fap | - |
| 12 | LOFT-CHK-13 | Procedimento de Espera IFR (Holding) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP14 Espera; FAP06 CIR.7 | validar_fap | - |
| 13 | LOFT-CHK-14 | Aproximacao Nao-Precisao - RNAV ou VOR | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP2.1/IAP2.2 | validar_fap | - |
| 14 | LOFT-CHK-15 | Arremetida por Abaixo dos Minimos (NPA) | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP2.3 | validar_fap | - |
| 15 | LOFT-CHK-17 | Setup e Briefing para ILS | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP3.1 | validar_fap | - |
| 16 | LOFT-CHK-18 | Aproximacao ILS - Final e Decisao na DA | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 IAP3.2; FAP14 Aproximacao de precisao | validar_fap | - |
| 17 | LOFT-CHK-19 | Pouso no Alternado e Procedimentos Pos-Voo | existente | REAPROVEITAR | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP05.2 H4.3/H4.5/C2.3 | validar_fap | - |
| 18 | LOFT-CHK-23 | Painel Limitado / Falha de Instrumentos IFR | novo | VALIDAR_FAP | AirTrust catalogo; PTO-A; FAP 05.2; FAP 06; FAP 14 | FAP06 painel limitado/falha de instrumentos; validar FAP | validar_fap | Nao existe equivalente explicito suficiente no catalogo atual |

## 8. Alternativa AW139 3 sessoes/ciclo (nao recomendada)

Usar apenas se owner/PTO decidir comprimir o ciclo. Estrutura nao recomendada:

| ciclo | sessao 1 | sessao 2 | sessao 3 | motivo da nao recomendacao |
|---|---|---|---|---|
| 1 | VFR/emergencias | IFR/noturno/offshore | LOFT/Offshore + LOFT/Check fundidos | comprime em excesso CAT A/B, helideck, ditching e cheque IFR |
| 2 | VFR/emergencias | IFR/noturno/offshore | LOFT/Offshore + LOFT/Check fundidos | reduz clareza pedagogica e separacao de objetivos |
| 3 | VFR/emergencias | IFR/noturno/offshore | LOFT/Offshore + LOFT/Check fundidos | aumenta densidade avaliativa e reduz margem de debrief |

## 9. Cobertura FAP 05.2

| elemento_fap | treina_em | checa_em | manobra_airtrust | status |
|---|---|---|---|---|
| Procedimentos pre-voo / inspecao / acionamento / cheques | A139-I-01/12, SK76-I-01/12, A139-I-11/12, SK76-P-CHECK | LOFT-CHK-05, S76-LOFT-05 | LOFT-CHK-05 / S76-LOFT-05 | coberto |
| Hover / taxi | A139-I-01/12, SK76-I-01/12, ciclos periodicos VFR | LOFT-CHK-06, S76-HOV-00, S76-LOFT-07 | LOFT-CHK-06 / S76-HOV-00 | coberto |
| Decolagem normal / perfil de saida | A139-I-04/12, A139-I-10/12, SK76-I-10/12, S76-P-C2/VFR | LOFT-CHK-07, S76-TDP-00, S76-LOFT-08 | LOFT-CHK-07 / S76-TDP-00 | coberto |
| Aproximacao / pouso normal | A139-I-04/12, SK76-I-04/12, A139 periodico IFR, S76 periodico IFR | LOFT-CHK-18/19, S76-ILS-00, S76-VOR-00, S76-LDP-00 | LOFT-CHK-18/19 / S76-LDP-00 | coberto |
| Falha de motor / falhas de sistemas / emergencias | A139-I-02/03/08/09/10, SK76-I-02/06/08/09/10, ciclos periodicos | LOFT-CHK-08/10/11, S76-DM1-22, S76-DMB-24, S76-DIT-71 | LOFT-CHK-08 / S76-DM1-22 / S76-DIT-71 | coberto com validacao fina QRH/ECL |

## 10. Cobertura FAP 06

| elemento_fap | treina_em | checa_em | manobra_airtrust | status |
|---|---|---|---|---|
| Testar/monitorar instrumentos; painel completo | A139-I-04/05/06/07, SK76-I-04/05, ciclos IFR | LOFT-CHK-10, S76-CGI-00, S76-FDA-00 | LOFT-CHK-10 / S76-CGI-00 | coberto |
| Painel limitado / falha de instrumentos | A139-I-11/12, A139-P-LOFT/CHECK, S76-P-C2/IFR, S76-P-C3/IFR | LOFT-CHK-23, S76-P-C2/IFR instrumentos, S76-P-C3/IFR AHRS/IIDS | LOFT-CHK-23 | coberto com validacao FAP |
| Saida IFR / saida IFR com falha de motor | A139-I-04/11/12, SK76-I-04/10/11, periodicos IFR | LOFT-CHK-07/08, S76-SID-00, 76-APXOI | LOFT-CHK-07/08 | coberto |
| Navegacao IFR / descida / chegada / espera | A139-I-04/11/12, SK76-I-04/11, ciclos IFR | LOFT-CHK-09/12/13, OPS-NAV-X1/3/4, S76-HLD-00 | LOFT-CHK-09/12/13 | coberto |
| NPA / missed / precisao / ILS | A139-I-04/05/06/11/12, SK76-I-04/05/06/10/11/12, ciclos IFR | LOFT-CHK-14/15/17/18, OPS-APP-X1/2/3, S76-ILS-00, S76-VOR-00, S76-MIS-00 | LOFT-CHK-14/15/17/18 | coberto |

## 11. Cobertura FAP 14

| elemento_fap | treina_em | checa_em | manobra_airtrust | status |
|---|---|---|---|---|
| Planejamento / performance em rota e offshore | A139-P-LOFT/OFFSHORE, A139-I-11/12, SK76-P-CHECK | LOFT-OFF-01, LOFT-CHK-01/02/03, S76-LOFT-01/02/03 | LOFT-OFF-01 / LOFT-CHK-01 | coberto com validacao PTO |
| Navegacao / chegada / operacao IFR | A139 periodico IFR, A139-P-LOFT/CHECK, S76 periodico IFR, SK76-P-CHECK | LOFT-CHK-09/12/13/18, S76-LOFT-11/18/19, S76-ILS-00, S76-RNV-00 | LOFT-CHK-09/12/13/18 | coberto |
| Operacao com tripulacao multipla / offshore | A139-P-LOFT/OFFSHORE, S76-P-CHECK, S76-NOT-02 base catalogada | LOFT-OFF-07/14/15/17/18/19/20/21, S76-LOFT-18/19/20 | LOFT-OFF-07..21 / S76-LOFT-18..20 | coberto com validacao owner/PTO |

## 12. Manobras existentes reaproveitadas

- AW139 basico e periodico: `FLY-BAS-*`, `OPS-NRM-*`, `OPS-NAV-*`, `OPS-APP-*`, `OPS-OFF-*`, `CAU-*`, `WAR-*` tecnicos.
- AW139 LOFT tecnico: `LOFT-CHK-01/02/03/05/06/07/08/09/10/11/12/13/14/15/17/18/19` e `LOFT-OFF-01/02/03/05/06/07/08/09/11/12/14/15/16/17/18/19/20/21`.
- S76/SK76 tecnico: `S76-TDP-00`, `S76-LDP-00`, `S76-DIT-71`, `S76-BFL-28`, `S76-LOW-32`, `S76-FPL-31`, `S76-NVF-00`, `S76-NIF-00`, `S76-ILS-00`, `S76-VOR-00`, `S76-RNV-00`, `S76-MIS-00`, `S76-HLD-00`.

## 13. Manobras existentes renomeadas

| codigo_legado | codigo_final | nome_final | motivo |
|---|---|---|---|
| 76-DCUMN | S76-DMN-21 | DECU - Falha Menor | normalizar familia DECU |
| 76-DCUDG | S76-DDE-21 | DECU - Falha Degradada | normalizar familia DECU |
| 76-DCU1M | S76-DM1-22 | DECU - Falha Maior - Um Motor | normalizar familia DECU |
| 76-DCU2M | S76-DMB-24 | DECU - Falha Maior - Ambos os Motores | normalizar familia DECU |
| 76-COMBX | S76-FPL-31 | Luz de Aviso de Pressao de Combustivel | separar Fuel Pressure de Fuel Low |

## 14. Manobras novas necessarias

| codigo_sugerido | nome | motivo | status |
|---|---|---|---|
| OPS-OFF-X3 | Ditching / Flutuabilidade AW139 | lacuna explicita do catalogo AW139 para ditching/flutuabilidade | validar QRH/PTO |
| LOFT-CHK-23 | Painel Limitado / Falha de Instrumentos IFR | fechar cobertura FAP 06 apos retirada dos itens CRM/NTS do LOFT Check | validar FAP/PTO |

## 15. Manobras legadas

- CRM/NTS historico que sai das 18 tecnicas: `LOFT-CHK-04`, `LOFT-CHK-16`, `LOFT-CHK-20`, `LOFT-CHK-21`, `LOFT-CHK-22`, `LOFT-OFF-22`, `LOFT-NOT-20`, `LOFT-NOT-21`, `LOFT-NOT-22`, `S76-CRM-01`, `S76-LOFT-12`, `S76-LOFT-16`, `S76-LOFT-21`, `S76-LOFT-22`.
- Codigos `76-*` que permanecem apenas como legado tecnico enquanto nao houver normalizacao integral documentada.
- Qualquer uso de `LOFT-CHK-*`, `LOFT-OFF-*` ou `LOFT-NOT-*` genericos/AW139 dentro de trilhas S76 antigas deve ser tratado como legado e nao como matriz nova.

## 16. Pendencias de validacao

- PTO-B/complementar: nao localizado no workspace;
- QRH AW139: nao localizado em texto local; validar `CAU/WAR` e o novo `OPS-OFF-X3`;
- ECL/checklist S76: nao localizado em texto local; validar `Servo SYS`, `Fuel Pressure`, `Fuel Low`, `IIDS`, trem e equivalencias `76-*` -> `S76-*`;
- owner/PTO: confirmar definitivamente a recomendacao de AW139 periodico em 4 sessoes/ciclo;
- instrutor S76: fechar onde ainda vale manter codigo legado `76-*` e onde ja cabe normalizacao imediata;
- instrutor AW139: fechar nomenclatura CAT A/B por area operacional, com destaque para Offshore & Enhanced Offshore Helideck.

## 17. Plano futuro de implementacao segura

- somente depois da validacao owner/PTO, gerar migration futura controlada;
- preparar script dry-run de diff entre catalogo atual e matriz V3;
- criar novas manobras apenas com seed auditavel, sem hard delete e sem perder historico;
- marcar CRM/NTS historico como legado logico e anexar os 15 NOTECHS fixos nas fichas novas;
- validar visualmente PDFs das fichas antes de qualquer rollout;
- prever rollback logico por desativacao/control soft-delete de vinculos novos.

## 18. Confirmacao de nao implementacao

- nenhum codigo de aplicacao foi implementado;
- nenhuma migration foi criada;
- nenhum DML foi executado;
- nenhum deploy foi realizado;
- nenhuma acao em producao foi executada;
- nenhum PR foi aberto.
