# Costa do Sol / AirTrust — Matriz V4.2 Sequenciamento Intra-Sessão 20260703

Status do documento: camada documental de sequenciamento sobre a V4 e V4.1. Não houve implementação, DML, migration, deploy, PR, alteração funcional nem toque em produção. A V4 continua sendo a matriz-base; a V4.1 continua sendo a camada de saneamento; esta V4.2 adiciona a ordem de aplicação operacional dentro de cada sessão.

## 1. Veredito

**GO com ressalvas para usar a V4/V4.1 como base pedagógica e a V4.2 como camada de sequenciamento. NO-GO para implementação no AirTrust ainda.**

A V4.1 já saneia itens que não são manobra/procedimento técnico observável, removendo comunicação genérica, briefing genérico, debrief e itens de “filosofia” das 18 técnicas. O que ainda faltava era garantir que os 18 itens de cada ficha fossem aplicados em uma sequência temporal coerente de voo: preparação, checklist, partida, taxi/hover, decolagem, subida, cruzeiro/navegação, evento compatível com a fase, checklist/ECL/QRH, decisão técnica, aproximação, pouso/arremetida e encerramento.

## 2. Regra de sequenciamento

Cada ficha deixa de ser apenas uma lista de 18 itens e passa a ser um roteiro de aplicação. A ordem de cadastro pode até existir por conveniência, mas a ficha operacional deve exibir ou orientar uma **ordem_aplicacao**.

Regras absolutas: não colocar pouso antes de decolagem; não colocar aproximação antes de saída/subida/cruzeiro; não colocar pane em cruzeiro antes de cruzeiro; não colocar pane offshore antes de contexto offshore; não colocar ECL/QRH antes do evento; não colocar arremetida antes de aproximação; não colocar shutdown antes de pouso; não reintroduzir COM/BRF/DBR genéricos nas 18; NOTECHS permanece fora das 18.

## 3. Templates de sequência por tipo de sessão

### 3.1 Normal / familiarização
Preparação/cockpit → checklist → partida/power-up → instrumentos/sistemas normais → taxi/hover → decolagem → subida → cruzeiro/perfil normal → curvas/perfil → descida → aproximação → arremetida → novo circuito/reaproximação → pouso → taxi/estacionamento → corte/encerramento.

### 3.2 IFR
Preparação IFR → setup FMS/GPS/NAVAID → checklist → decolagem/saída IFR → climb/enroute → navegação/interceptação → holding, se aplicável → aproximação IFR → missed approach → reaproximação/alternado → pouso.

### 3.3 Anormalidade simples
Voo normal estabilizado → evento/anormalidade → reconhecimento → controle da aeronave → checklist/ECL/QRH → decisão continuar/retornar/alternar → preparação da aproximação → aproximação → arremetida se instável → pouso.

### 3.4 OEI / motor
Voo normal até a fase do evento → falha de motor compatível com a fase → controle inicial → identificação/confirmação → ações imediatas → ECL/QRH → perfil OEI → planejamento → aproximação OEI → arremetida OEI, se aplicável → pouso OEI.

### 3.5 Sistemas
Não é uma lista aleatória de panes. É uma sequência de mini-cenários: estabilizar voo → inserir falha por família de sistema → aplicar checklist/ECL/QRH → recuperar/decidir → repetir com outra família, em ordem crescente de severidade.

### 3.6 Offshore
Planejamento offshore → preparação/checklist → decolagem → navegação para UM → aproximação UM → pouso UM → decolagem UM → evento/anormalidade offshore → checklist/ECL/QRH → decisão retorno/alternado/ditching → aproximação final ou ditching simulado → encerramento.

### 3.7 LOFT e LOFT Check
LOFT é treinamento de cenário: pode haver orientação, pausa pedagógica e repetição. LOFT Check é avaliação: mesmo domínio técnico, sem conteúdo novo, com caráter avaliativo explícito e rastreabilidade FAP 05.2/06/14/PTO.

## 4. Sequenciamento S76/SK76 Inicial

### 01/12 — Familiarização / Checklist Normal / Voo Normal Básico

|ordem_aplicacao|codigo|item|fase_voo|motivo_da_ordem|observacao|
|---:|---|---|---|---|---|
|1|S76-CAB-01|Cabine, comandos e instrumentos básicos|Pré-voo / cockpit|Antes de qualquer voo o aluno precisa localizar comandos, instrumentos e referências de cabine.|Sem emergência; conteúdo técnico observável.|
|2|S76-CKL-01|Execução do checklist normal por fase de voo|Pré-partida|Checklist vem antes da partida e cria disciplina operacional.|Nome V4.1 substitui “disciplina de uso”.|
|3|S76-PNR-01|Partida normal|Partida|Partida só ocorre após cockpit e checklist.||
|4|S76-INS-01|Cheque de instrumentos e parâmetros após partida|Pós-partida|Garante que a aeronave está configurada antes do taxi/hover.|Nova manobra sugerida se não houver equivalente no catálogo.|
|5|S76-TAX-01|Taxi e deslocamento em solo/heliponto|Taxi / hover taxi|O deslocamento precede hover estacionário e decolagem.||
|6|S76-HOV-00|Controle geral VFR — hover estacionário|Hover|Hover é fundamento antes de transição para decolagem.|Reaproveitado da família periódica.|
|7|S76-PED-01|Controle de pedal e anti-torque em hover|Hover|Treina controle direcional antes da transição hover-decolagem.|Substitui conteúdo genérico de segurança/comunicação.|
|8|S76-HVT-01|Transição hover–decolagem e decolagem–subida|Transição / decolagem|Conecta hover à decolagem normal.||
|9|S76-DNR-01|Decolagem normal|Decolagem|Decolagem vem antes de subida, cruzeiro, circuito e pouso.||
|10|S76-SUB-01|Subida controlada visual|Subida|A subida é consequência da decolagem.||
|11|S76-NVF-00|Procedimentos normais VFR / perfil normal|Cruzeiro / perfil|Após subida, consolidar perfil normal.||
|12|S76-PWR-01|Controle de potência, torque e limites em voo normal|Cruzeiro / perfil|Controle de potência é treinado em voo estabilizado.|Substitui item genérico.|
|13|S76-CRV-01|Curvas padrão e controle de atitude|Manobras visuais|Após controle de potência, treinar curvas e atitude.||
|14|S76-CIR-01|Circuito de tráfego visual|Circuito|Circuito organiza aproximação e pouso.||
|15|S76-APN-01|Aproximação normal visual|Aproximação|Aproximação vem depois de circuito/perfil de chegada.||
|16|S76-ARN-01|Arremetida normal|Aproximação / arremetida|Arremetida é ensinada após aproximação, antes do pouso final.||
|17|S76-PNO-01|Pouso normal|Pouso|Pouso final após aproximação e arremetida demonstrada.||
|18|S76-EST-01|Estacionamento e corte de motores|Pós-pouso|Encerramento só após pouso e taxi/estacionamento.||


### 02/12 — Voo Normal Consolidado / Perfil Visual

|ordem_aplicacao|codigo|item|fase_voo|motivo_da_ordem|observacao|
|---:|---|---|---|---|---|
|1|S76-CKL-01|Checklist normal por fase de voo|Pré-voo / transições|Reforça checklist antes do novo voo.||
|2|S76-HOV-00|Hover/taxi de precisão|Hover / taxi|Aperfeiçoa controle antes da decolagem.||
|3|S76-DNR-01|Decolagem normal|Decolagem|Inicia o perfil de voo.||
|4|S76-SUB-01|Subida controlada visual|Subida|Segue a decolagem.||
|5|S76-NVF-00|Cruzeiro visual — procedimentos normais|Cruzeiro|Consolida voo estabilizado.||
|6|S76-CTV-01|Controle de velocidade em voo nivelado|Cruzeiro|Treina precisão de velocidade em perfil normal.||
|7|S76-CRV-01|Curvas padrão e controle de atitude|Manobras visuais|Após estabilização, treina curvas.||
|8|S76-DSC-01|Descida controlada visual|Descida|A descida antecede a aproximação.||
|9|S76-APN-01|Aproximação visual|Aproximação|Entra no perfil de pouso.||
|10|S76-STB-01|Aproximação estabilizada visual com correção de rampa e velocidade|Aproximação estabilizada|Refina a aproximação antes de pouso/arremetida.|V4.1.|
|11|S76-ARN-01|Arremetida normal|Aproximação / arremetida|Treinar decisão de arremeter antes de repetir circuito.||
|12|S76-REC-01|Reentrada no circuito de tráfego|Circuito|Vem depois da arremetida.||
|13|S76-CIR-01|Circuito visual — segunda volta|Circuito|Nova volta para consolidar perfil.||
|14|S76-VCZ-01|Pouso/decolagem com vento cruzado leve|Aproximação / pouso|Aplicar variação controlada após base normal.|Se aplicável.|
|15|S76-GAR-01|Arremetida por aproximação instável em VMC|Aproximação / arremetida|A arremetida por instabilidade ocorre após aproximação instável.|V4.1.|
|16|S76-PNO-01|Pouso normal|Pouso|Pouso final após variações e arremetida.||
|17|S76-TAX-01|Taxi e deslocamento pós-pouso|Pós-pouso|Vem depois do pouso.||
|18|S76-EST-01|Estacionamento e corte de motores|Pós-pouso|Encerra a sessão.||


### 03/12 — IFR / Navegação Básico

|ordem_aplicacao|codigo|item|fase_voo|motivo_da_ordem|observacao|
|---:|---|---|---|---|---|
|1|76-PRGGP|Programação do GPS, HSI e EFIS|Preparação IFR|Setup vem antes da saída IFR.||
|2|S76-NIF-00|Procedimentos normais IFR|Preparação IFR|Define regime normal IFR.||
|3|S76-FDA-00|Uso do diretor de voo e automação|Preparação / decolagem IFR|Configurar automação antes de SID.||
|4|76-DECSI|Decolagem por instrumentos / SID|Decolagem IFR|Inicia o voo IFR.||
|5|S76-SID-00|SID & STAR|Saída / chegada IFR|SID após decolagem; STAR será usado na chegada.||
|6|S76-CGI-00|Controle geral IFR|Enroute IFR|Manutenção de proa/altitude/velocidade após saída.|Inclui `S76-ORI-01` fundido.|
|7|S76-SCN-01|Varredura instrumental primária e secundária em IFR básico|Enroute IFR|Scan é técnica de controle IFR, não comportamento.|Restrito a sessão IFR.|
|8|S76-VMA-01|Voo manual por instrumentos em condição normal|Enroute IFR|Voo manual antes de procedimentos de aproximação.||
|9|S76-HLD-00|Holding pattern|Espera IFR|Espera vem antes da aproximação/reaproximação.||
|10|S76-RNV-00|Aproximação RNAV/GPS|Aproximação IFR|Primeira aproximação IFR básica.||
|11|76-APXPR|Aproximação de precisão IFR|Aproximação IFR|Treinar precisão após RNAV/controle básico.||
|12|76-APXNP|Aproximação de não precisão IFR|Aproximação IFR|Treinar NPA como variação.||
|13|76-APXPI|Aproximação perdida IFR / procedimento publicado|Missed approach|Só depois de aproximação IFR.||
|14|76-ARRIF|Arremetida IFR normal|Missed approach|Executa arremetida associada ao missed.||
|15|S76-UAR-00|Recuperação de atitudes anormais básica|IFR básico / segurança|Pode ser aplicada após controle IFR básico, antes do encerramento.||
|16|76-APXPR|Reaproximação de precisão IFR — repetição técnica|Reaproximação|Preenche vaga saneada sem código novo.|Reforço previsto pela V4.1.|
|17|76-APXNP|Reaproximação não precisão IFR — repetição técnica|Reaproximação|Preenche vaga saneada sem código novo.|Reforço previsto pela V4.1.|
|18|S76-HLD-00|Holding / reposicionamento para nova aproximação|Espera / reposicionamento|Preenche vaga saneada com técnica IFR existente.|Reforço previsto pela V4.1.|


### 04/12 — Anormalidades Simples / Checklist/ECL

|ordem_aplicacao|codigo|item|fase_voo|motivo_da_ordem|observacao|
|---:|---|---|---|---|---|
|1|S76-CKL-01|Checklist normal antes do cenário|Normal estabilizado|Sessão começa com voo normal estabilizado antes da primeira anormalidade.||
|2|76-FLWNR|Vazão de combustível fora da faixa normal|Cruzeiro estabilizado / evento|Evento simples em voo estabilizado.||
|3|S76-FPL-31|Luz de aviso de pressão de combustível|Cruzeiro estabilizado / evento|Mesmo bloco de combustível.||
|4|76-OILMT|Falha no sistema de óleo do motor|Cruzeiro / evento|Falha de sistema ainda simples, após combustível.||
|5|S76-CKL-02|Uso do ECL para anormalidade simples|Checklist/ECL|ECL ocorre após evento, não antes.||
|6|S76-APN-02|Aproximação e pouso após anormalidade simples|Aproximação / pouso|Depois de diagnóstico/checklist.||
|7|76-FALGC|Falha em um gerador DC|Novo mini-cenário em cruzeiro|Segundo bloco: elétrica simples.||
|8|76-PER26|Perda de referência de 26 VAC|Mini-cenário elétrico|Correlato elétrico.||
|9|76-FALIV|Falha no inversor|Mini-cenário elétrico|Correlato elétrico.||
|10|76-FALAD|Falha no sistema de dados de voo|Mini-cenário instrumentos|Bloco de instrumentos.||
|11|76-PERAT|Perda do indicador primário de atitude em IMC|Mini-cenário instrumentos|Só após base IFR da sessão 03.||
|12|76-FALEF|Mau funcionamento do EFIS|Mini-cenário instrumentos|Correlato EFIS.||
|13|76-FALFD|Falha no flight director|Mini-cenário automação|Após falhas de instrumentos.||
|14|76-FALRM|Falha no sistema mestre de rádio|Mini-cenário comunicação técnica|Falha técnica de rádio, não COM genérico.||
|15|76-N1TQF|Falha nos indicadores N1/Torque|Mini-cenário indicação motor|Ainda anormalidade de indicação.||
|16|76-FALTS|Falha no indicador TS|Mini-cenário indicação motor|Correlato de indicação.||
|17|76-HIDPB|Falha simples de bomba/perda de pressão servo/hidráulica|Mini-cenário hidráulico simples|Introdução leve antes de sistemas completos.||
|18|76-FALFF|Falha de alimentação feeder/bateria|Mini-cenário final / validar frota|Fechar com item a validar por aplicabilidade.|Validar frota.|


### 05/12 — Motor em Cruzeiro / OEI Introdutório

|ordem_aplicacao|codigo|item|fase_voo|motivo_da_ordem|observacao|
|---:|---|---|---|---|---|
|1|76-MOTCZ|Falha de motor durante o cruzeiro|Cruzeiro estabilizado / evento|Primeira falha de motor deve ocorrer em fase estabilizada.||
|2|S76-IDF-01|Identificação e diagnóstico de falha de motor|Reconhecimento|Após evento, antes de ação.||
|3|S76-CKL-03|Aplicação do ECL para falha de motor em cruzeiro|Checklist/ECL|ECL após identificação.||
|4|S76-OEI-01|Perfil OEI em cruzeiro|Perfil OEI|Após ECL, manter perfil monomotor.||
|5|S76-XFD-20|Crossfeed total após falha de motor|Gerenciamento de combustível|Após perfil OEI, se aplicável.||
|6|S76-DMN-21|DECU — falha menor|Evento correlato de baixa severidade|DECU menor antes de falhas maiores da sessão 06.||
|7|76-N1TQF|Monitoramento de N1/Torque após falha|Monitoramento|Após OEI, monitorar motor remanescente.||
|8|76-FLWNR|Vazão de combustível em contexto de falha|Monitoramento|Correlato combustível.||
|9|76-OILMT|Falha no sistema de óleo do motor em contexto de falha|Monitoramento|Correlato óleo.||
|10|S76-CGI-00|Controle geral IFR se aplicável ao cenário OEI|Navegação/IFR|Se em IFR, estabilizar controle.||
|11|S76-SCN-01|Varredura de instrumentos pós-falha|Navegação/IFR|Scan técnico após evento.||
|12|S76-APX-02|Aproximação planejada com um motor inoperante|Aproximação|Planejamento antes do pouso.||
|13|76-APXOI|Aproximação IFR com um motor inoperante|Aproximação IFR/OEI|Versão IFR do mesmo domínio.||
|14|S76-UAR-00|Recuperação de atitude anormal em contexto OEI|Recuperação|Só se necessário após degradação.||
|15|S76-PNO-01|Pouso em contexto OEI planejado|Pouso|Pouso depois de aproximação planejada.||
|16|76-FALGC|Falha de gerador DC correlata|Evento secundário leve|Evento secundário depois do cenário principal.||
|17|76-MOTCZ|Repetição técnica da falha de motor em cruzeiro|Repetição técnica|Substitui COM/BRF saneados sem criar código novo.||
|18|S76-CKL-03|Repetição da aplicação ECL em falha de motor|Repetição técnica|Reforço do item central.||


### 06/12 — OEI Decolagem/Aproximação / DECU

|ordem_aplicacao|codigo|item|fase_voo|motivo_da_ordem|observacao|
|---:|---|---|---|---|---|
|1|S76-DDE-21|DECU — falha degradada|Preparação / evento de menor severidade|Começar com DECU degradada antes de falhas maiores.||
|2|S76-DM1-22|DECU — falha maior em um motor|Evento progressivo|Aumenta severidade.||
|3|S76-DMB-24|DECU — falha maior em ambos os motores|Evento progressivo / validar|Só após DECU um motor.|Validar aplicabilidade.|
|4|76-MOTHV|Falha de motor em pairado 5 a 10 pés|Hover / evento|Treinar em hover antes da decolagem corrida.||
|5|76-MOTCA|Falha de motor na decolagem — Categoria A PRA|Decolagem / evento|Após hover, cenário de decolagem.|Validar nomenclatura S76.|
|6|76-MOTCB|Falha de motor na decolagem — Categoria B|Decolagem / evento|Após Categoria A/primeiro cenário, variação Categoria B.||
|7|76-POUAB|Pouso abortado / rejected takeoff|Decolagem abortada|Só depois de treinar decolagem normal em sessões anteriores.||
|8|S76-CKL-04|ECL para DECU e falha de motor na decolagem/aproximação|Checklist/ECL|Após evento.||
|9|76-N1TQF|Monitoramento N1/Torque|Monitoramento|Após falha/decu, monitorar parâmetros.||
|10|S76-XFD-20|Crossfeed total após falha de motor|Gerenciamento combustível|Aplicar após controle inicial.||
|11|76-MOTAP|Falha de motor na aproximação — Categoria A|Aproximação / evento|Depois de decolagem/hover, cenário em aproximação.||
|12|76-APXOI|Aproximação IFR com um motor inoperante|Aproximação IFR/OEI|Antes de pouso monomotor.||
|13|76-APXAL|Aproximação alternada — Categoria A|Aproximação alternativa|Variação após aproximação OEI.|Validar uso operacional.|
|14|76-POUMO|Pouso monomotor — Categoria A ou B PEA|Pouso OEI|Pouso após aproximação.||
|15|S76-CGI-00|Controle geral IFR em contexto OEI|Controle / estabilização|Aplicar se o cenário for IFR.||
|16|S76-UAR-00|Recuperação de atitudes anormais em contexto OEI|Recuperação|Reforço avançado.||
|17|76-MOTCA|Repetição técnica: falha motor decolagem|Repetição técnica|Substitui COM/BRF saneados.||
|18|S76-CKL-04|Repetição técnica: ECL DECU/OEI|Repetição técnica|Reforço central.||


### 07/12 — Sistemas Específicos

|ordem_aplicacao|codigo|item|fase_voo|motivo_da_ordem|observacao|
|---:|---|---|---|---|---|
|1|76-FALGC|Falha em um gerador DC — ponte para sessão sistemas|Cruzeiro estabilizado / evento|Começar com falha elétrica simples antes de total.|Se mantida; V4 usa FALGD como primeiro.|
|2|76-FALGD|Falha em ambos os geradores DC|Elétrico|Falha total após simples.||
|3|76-SOBGD|Sobretemperatura de gerador DC|Elétrico|Mesmo bloco.||
|4|76-FALGA|Falha no gerador AC|Elétrico|Completa bloco elétrico.||
|5|76-FALEB|Falha de alimentação no barramento essencial|Elétrico|Após geradores/barramento.||
|6|76-FALIV|Falha no inversor|Elétrico|Encerra elétrico.||
|7|76-FALFF|Falha de alimentação feeder/bateria|Elétrico / validar|Só após bloco elétrico.|Validar frota.|
|8|76-HIDPB|Falha de bomba/perda de pressão servo/hidráulica|Hidráulico / SERVO SYS|Inicia bloco hidráulico.||
|9|76-SERTQ|Perda de pressão no servo do rotor de cauda|Hidráulico / rotor de cauda|Após hidráulico geral.||
|10|76-SERJM|Atuador travado ou válvula de corte defeituosa|Hidráulico / servo|Mesmo bloco.||
|11|76-AMOTV|Amortecedor dos comandos travado PRB|Comandos|Após servo.||
|12|S76-UGR-46|Indicação insegura — recolhimento do trem|Trem de pouso|Novo bloco.||
|13|S76-LGB-47|Trem de pouso — extensão de emergência|Trem de pouso|Após indicação insegura.||
|14|76-FALAD|Falha no sistema de dados de voo|Instrumentos|Bloco instrumentos.||
|15|76-PERAT|Perda do indicador primário de atitude em IMC|Instrumentos|Após dados de voo.||
|16|76-FALPA|Falha no piloto automático|Automação|Bloco automação.||
|17|76-FALFD|Falha no flight director|Automação|Após piloto automático.||
|18|76-N1TQF|Falha nos indicadores N1 ou Torque|Indicação motor|Fechar com indicação motor.||


### 08/12 — Rotor / Transmissão / Autorrotação

|ordem_aplicacao|codigo|item|fase_voo|motivo_da_ordem|observacao|
|---:|---|---|---|---|---|
|1|76-MGBSF|Falhas no sistema da MGB|Cruzeiro / evento transmissão|Começar por MGB antes de rotor/tail rotor.||
|2|76-MGBOL|Falhas no sistema de óleo da MGB|Transmissão|Mesmo bloco.||
|3|76-CHPTG|Chip ou alta temperatura no gearbox|Transmissão|Após MGB óleo.||
|4|76-TRSRC|Falha do sistema de transmissão do rotor de cauda|Rotor de cauda|Depois de transmissão principal.||
|5|76-CTRRC|Falha no sistema de controle do rotor de cauda PF|Rotor de cauda|Após transmissão tail rotor.||
|6|S76-TRH-38|Falha do rotor de cauda no hover|Hover / evento|Aplicar após conceitos de rotor de cauda.||
|7|S76-TRD-39|Falha do eixo do rotor de cauda em voo|Voo / evento|Variação em voo.||
|8|S76-TDM-41|Dano no rotor de cauda|Voo / evento|Variação final tail rotor.||
|9|S76-NRO-00|Disparo de NR / NR overspeed|Rotor RPM|Antes da autorrotação, introduzir energia/RPM.||
|10|S76-NRL-00|Queda de NR / NR low|Rotor RPM|Complementa controle RPM.||
|11|S76-ENE-01|Controle de energia/RPM em autorrotação|Autorrotacão / energia|Pré-requisito direto para autorrotação.||
|12|S76-AUT-70|Autorrotacão em terra|Autorrotacão|Só agora entra autorrotação.||
|13|S76-REC-02|Recuperação de autorrotação|Recuperação|Depois da entrada/controle.||
|14|S76-CKL-05|Ações de memória e ECL para rotor/transmissão|Checklist/ECL|Após evento, não antes.||
|15|S76-MRV-00|Vibração do rotor principal|Rotor / evento|Evento associado após conceitos principais.||
|16|76-AMOTV|Amortecedor dos comandos travado|Comandos / reforço|Reforço técnico.||
|17|S76-AUT-70|Repetição técnica de autorrotação|Repetição técnica|Substitui COM/BRF saneados.||
|18|S76-ENE-01|Repetição técnica de controle energia/RPM|Repetição técnica|Substitui COM/BRF saneados.||


### 09/12 — Fogo/Fumaça e Emergências Avançadas

|ordem_aplicacao|codigo|item|fase_voo|motivo_da_ordem|observacao|
|---:|---|---|---|---|---|
|1|76-INCMO|Incêndio no compartimento do motor|Cruzeiro / evento fogo|Primeiro evento de fogo.||
|2|S76-FMF-07|Fogo no compartimento do motor em voo|Fogo em voo|Mesmo bloco.||
|3|S76-CKL-06|Ações de memória para fogo/fumaça|Ações imediatas / ECL|Após evento de fogo.||
|4|S76-FMI-09|Fogo interno no motor após desligamento|Fogo pós-shutdown motor|Após ações de desligamento.||
|5|S76-FMG-08|Fogo no compartimento do motor no solo|Solo / fogo|Variação em solo.||
|6|76-INCCB|Incêndio na cabine ou cockpit|Fogo/fumaça cabine|Novo bloco.||
|7|S76-CCF-10|Fogo/fumaça na cabine em voo|Fogo/fumaça cabine|Após incêndio cabine.||
|8|76-FUMBG|Fumaça no compartimento de bagagem|Fumaça / bagagem|Complementa fumaça.||
|9|S76-EFV-11|Fogo de origem elétrica em VMC|Fogo elétrico|Após fumaça/cabine.||
|10|S76-EFI-12|Fogo de origem elétrica em IMC|Fogo elétrico/IFR|Variação IMC mais exigente.||
|11|76-DUACZ|Falha dupla de motor durante cruzeiro|Falha múltipla controlada|Começar falha dupla em cruzeiro, não hover.||
|12|76-DUADC|Falha dupla de motor durante decolagem|Falha múltipla avançada|Após cruzeiro.||
|13|76-DUAHV|Falha dupla de motor em pairado/decolagem|Falha múltipla avançada|Mais crítica, por último no bloco.||
|14|76-FALGD|Falha em ambos os geradores DC|Sistema alto estresse|Reforço em cenário complexo.||
|15|76-POUAB|Pouso abortado por fogo/fumaça|Decolagem abortada|Só após cenário de fogo.||
|16|76-POUMO|Pouso monomotor por falha associada|Pouso emergência|Depois da falha/planejamento.||
|17|76-INCMO|Repetição técnica de incêndio motor|Repetição técnica|Substitui COM saneado.||
|18|S76-CKL-06|Repetição técnica de ações de memória/ECL|Repetição técnica|Substitui BRF saneado.||


### 10/12 — Offshore / Unidade Marítima

|ordem_aplicacao|codigo|item|fase_voo|motivo_da_ordem|observacao|
|---:|---|---|---|---|---|
|1|S76-CKL-07|Checklist e ECL específico para operação offshore|Preparação offshore|Preparação vem antes da decolagem para UM.||
|2|S76-TDP-00|Decolagem Classe 2 — helideck (TDP)|Decolagem offshore|Inicia missão offshore.||
|3|76-MOTCZ|Falha de motor em cruzeiro no contexto offshore|Rota offshore / evento|Pane compatível com rota.||
|4|76-FALPA|Falha no piloto automático em contexto offshore|Rota offshore / evento|Evento de automação em rota.||
|5|76-FALFD|Falha no flight director|Rota offshore / evento|Correlato automação.||
|6|76-PERAT|Perda do indicador primário de atitude em IMC|Rota offshore / IFR|Evento de instrumento.||
|7|76-FALAD|Falha no sistema de dados de voo|Rota offshore / IFR|Correlato instrumento.||
|8|S76-APO-01|Aproximação offshore a Unidade Marítima|Aproximação offshore|Após rota e eventos.||
|9|76-MOTAP|Falha de motor na aproximação offshore|Aproximação offshore / evento|Evento compatível com fase.||
|10|76-APXOI|Aproximação IFR com um motor inoperante|Aproximação OEI/IFR|Após falha na aproximação.||
|11|76-POUMO|Pouso monomotor em contexto offshore|Pouso emergência|Depois da aproximação OEI.||
|12|S76-ARO-01|Arremetida offshore|Arremetida offshore|Após tentativa de aproximação/pouso.||
|13|76-POUAB|Pouso abortado / decolagem rejeitada offshore|Decolagem offshore / evento|Aplicar no ciclo de saída da UM.||
|14|76-AUTAG|Autorrotacão para a água|Ditching / água|Somente na sessão offshore avançada.||
|15|S76-DIT-71|Ditching com potência|Ditching|Depois de autorrotacão para água.||
|16|S76-FLU-01|Flutuabilidade e evacuação aquática|Pós-ditching|Após ditching, não antes.||
|17|S76-CKL-07|Repetição técnica de ECL offshore|Repetição técnica|Substitui COM saneado.||
|18|S76-APO-01|Repetição técnica: reaproximação offshore|Repetição técnica|Substitui BRF saneado.||


### 11/12 — LOFT

Natureza: treinamento de cenário integrado. Pode haver intervenção instrucional e repetição parcial.


|ordem_aplicacao|codigo|item|fase_voo|motivo_da_ordem|observacao|
|---:|---|---|---|---|---|
|1|LOFT-CHK-01|Performance e cálculos de decolagem IFR|Planejamento missão|Começa no planejamento.|Treinamento de cenário; pode haver orientação.|
|2|LOFT-CHK-02|Planejamento IFR, mínimos e alternado|Planejamento missão|Definir rota/minimos antes do FMS.||
|3|LOFT-CHK-03|Configuração completa do FMS|Preparação cockpit|Após planejamento.||
|4|LOFT-CHK-05|Inspeção, acionamento e checklists|Pré-voo / partida|Antes do taxi/decolagem.||
|5|LOFT-CHK-06|Hover check e taxi IFR|Taxi / hover|Antes da decolagem.||
|6|LOFT-CHK-07|Decolagem IFR — perfil CAT A em IMC|Decolagem IFR|Inicia missão.|Validar se CAT A se aplica à frota/sessão.|
|7|LOFT-CHK-08|OEI pós-TDP — fly-away monomotor IFR|Decolagem / evento|Evento após TDP/decisão.||
|8|LOFT-CHK-09|Navegação IFR en route e gestão de FMS|Enroute|Após saída.||
|9|LOFT-CHK-10|Monitoramento de sistemas e path monitoring|Enroute / monitoramento técnico|Durante rota.||
|10|LOFT-CHK-11|Gestão de falha de sistema em rota|Enroute / evento|Evento no momento de rota.||
|11|LOFT-CHK-12|Chegada STAR/RNAV e descida|Chegada/descida|Após rota e replanejamento.||
|12|LOFT-CHK-13|Procedimento de espera IFR|Espera|Antes da aproximação.||
|13|LOFT-CHK-14|Aproximação não precisão — RNAV ou VOR|Aproximação IFR|Primeira aproximação.||
|14|LOFT-CHK-15|Arremetida por abaixo dos mínimos (NPA)|Missed approach|Só após NPA.||
|15|LOFT-CHK-17|Setup para ILS|Reaproximação|Preparar nova aproximação.|Briefing como técnica só se for setup técnico; comportamento fica NOTECHS.|
|16|LOFT-CHK-18|Aproximação ILS — final e decisão na DA|Aproximação IFR|Após setup ILS.||
|17|LOFT-CHK-19|Pouso no alternado e procedimentos pós-voo|Pouso / pós-voo|Fecha o cenário.||
|18|LOFT-CHK-23|Painel limitado / falha de instrumentos IFR|Evento avaliável opcional dentro do cenário|Pode ser inserido em rota ou aproximação; registrar posição do evento no briefing do cenário.||


### 12/12 — LOFT Check

Natureza: avaliação final. Não introduzir conteúdo novo; usar como LOFT Check com caráter avaliativo.


|ordem_aplicacao|codigo|item|fase_voo|motivo_da_ordem|observacao|
|---:|---|---|---|---|---|
|1|LOFT-CHK-01|Performance e cálculos de decolagem IFR|Planejamento missão|Começa no planejamento.|Treinamento de cenário; pode haver orientação. \| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|2|LOFT-CHK-02|Planejamento IFR, mínimos e alternado|Planejamento missão|Definir rota/minimos antes do FMS.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|3|LOFT-CHK-03|Configuração completa do FMS|Preparação cockpit|Após planejamento.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|4|LOFT-CHK-05|Inspeção, acionamento e checklists|Pré-voo / partida|Antes do taxi/decolagem.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|5|LOFT-CHK-06|Hover check e taxi IFR|Taxi / hover|Antes da decolagem.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|6|LOFT-CHK-07|Decolagem IFR — perfil CAT A em IMC|Decolagem IFR|Inicia missão.|Validar se CAT A se aplica à frota/sessão. \| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|7|LOFT-CHK-08|OEI pós-TDP — fly-away monomotor IFR|Decolagem / evento|Evento após TDP/decisão.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|8|LOFT-CHK-09|Navegação IFR en route e gestão de FMS|Enroute|Após saída.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|9|LOFT-CHK-10|Monitoramento de sistemas e path monitoring|Enroute / monitoramento técnico|Durante rota.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|10|LOFT-CHK-11|Gestão de falha de sistema em rota|Enroute / evento|Evento no momento de rota.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|11|LOFT-CHK-12|Chegada STAR/RNAV e descida|Chegada/descida|Após rota e replanejamento.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|12|LOFT-CHK-13|Procedimento de espera IFR|Espera|Antes da aproximação.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|13|LOFT-CHK-14|Aproximação não precisão — RNAV ou VOR|Aproximação IFR|Primeira aproximação.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|14|LOFT-CHK-15|Arremetida por abaixo dos mínimos (NPA)|Missed approach|Só após NPA.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|15|LOFT-CHK-17|Setup para ILS|Reaproximação|Preparar nova aproximação.|Briefing como técnica só se for setup técnico; comportamento fica NOTECHS. \| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|16|LOFT-CHK-18|Aproximação ILS — final e decisão na DA|Aproximação IFR|Após setup ILS.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|17|LOFT-CHK-19|Pouso no alternado e procedimentos pós-voo|Pouso / pós-voo|Fecha o cenário.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|18|LOFT-CHK-23|Painel limitado / falha de instrumentos IFR|Evento avaliável opcional dentro do cenário|Pode ser inserido em rota ou aproximação; registrar posição do evento no briefing do cenário.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|


## 5. Sequenciamento AW139 Inicial

### 01/12 — Familiarização / Checklist Normal / Voo Normal

|ordem_aplicacao|codigo|item|fase_voo|motivo_da_ordem|observacao|
|---:|---|---|---|---|---|
|1|A139-CAB-01|Cabine AW139 e power-up|Pré-voo / cockpit|Familiarização antes de qualquer manobra.||
|2|A139-CKL-01|Normal checklist|Pré-partida|Checklist antes da partida.||
|3|A139-CAS-01|Leitura, priorização e reconhecimento básico de CAS sem pane simulada|Pré-partida / familiarização|CAS como leitura objetiva, não pane.|Renomeado V4.1.|
|4|A139-QRH-01|Localização guiada de procedimento no QRH sem execução de emergência|Pré-partida / familiarização|QRH como localização, sem executar emergência.|Renomeado V4.1.|
|5|A139-AFC-01|Engajamento, monitoramento e desconexão normal dos modos básicos do AFCS|Pré-voo / voo normal|AFCS normal antes de pane.|Renomeado V4.1.|
|6|A139-TAX-01|Taxi/deslocamento em solo e heliponto|Taxi / hover taxi|Antes do hover/decolagem.||
|7|FLY-BAS-X3|Hover e taxi|Hover|Fundamento antes da decolagem.||
|8|A139-PWR-01|Controle normal de potência e parâmetros em voo visual|Hover / decolagem / voo normal|Controle de parâmetros desde o início.|V4.1.|
|9|OPS-NRM-X2|Decolagens e pousos — decolagem normal|Decolagem|Decolagem vem antes de voo/circuito/pouso.||
|10|FLY-BAS-X1|Controle geral VFR|Subida/cruzeiro visual|Após decolagem.||
|11|OPS-NRM-X1|Procedimentos normais|Cruzeiro / perfil|Aplicação em voo normal.||
|12|A139-FMA-01|Monitoramento básico de FMA/modos em condição normal|Voo normal / automação|Depois de AFCS e durante perfil.|V4.1.|
|13|OPS-NRM-X3|Circuito de tráfego|Circuito|Organiza aproximação/pouso.||
|14|A139-STB-01|Aproximação visual estabilizada e critérios de arremetida normal|Aproximação|Antes de arremetida/pouso.|V4.1.|
|15|A139-ARN-01|Arremetida normal|Aproximação / arremetida|Após aproximação.||
|16|OPS-NRM-X2|Pouso normal|Pouso|Após aproximação/arremetida demonstrada.||
|17|A139-EST-01|Estacionamento e corte de motores|Pós-pouso|Após pouso/taxi.||
|18|FLY-BAS-X4|Recuperação de atitudes anormais básica em VMC|Segurança / manobra básica|Somente como básico VMC, sem pane pesada.|Validar se fica na sessão 01 ou 02.|


### 02/12 — Voo Visual e Perfil Básico

|ordem_aplicacao|codigo|item|fase_voo|motivo_da_ordem|observacao|
|---:|---|---|---|---|---|
|1|A139-CKL-01|Normal checklist|Pré-voo / transições|Inicia voo normal.||
|2|FLY-BAS-X3|Hover e taxi de precisão|Hover / taxi|Aperfeiçoa antes de decolagem.||
|3|OPS-NRM-X2|Decolagem normal|Decolagem|Inicia o perfil.||
|4|A139-SUB-01|Subida e cruzeiro visual|Subida / cruzeiro|Após decolagem.||
|5|FLY-BAS-X1|Controle geral VFR|Cruzeiro visual|Consolidação.||
|6|A139-MOD-01|Seleção e transição de modos AFCS em perfil visual normal|Cruzeiro / automação|Após voo estabilizado.|V4.1.|
|7|A139-FMA-02|Monitoramento de FMA durante mudança de modo|Cruzeiro / automação|Após seleção de modos.|V4.1.|
|8|A139-CRV-01|Curvas e controle de atitude/velocidade|Manobras visuais|Após estabilização.||
|9|A139-DSC-01|Descida controlada visual|Descida|Antes de aproximação.||
|10|A139-STB-02|Correção de perfil em aproximação visual estabilizada|Aproximação|Preparar pouso/arremetida.|V4.1.|
|11|A139-ARN-01|Arremetida normal|Aproximação / arremetida|Após aproximação.||
|12|A139-REC-02|Reentrada no circuito|Circuito|Após arremetida.||
|13|OPS-NRM-X3|Circuito de tráfego|Circuito|Segunda volta.||
|14|A139-VCZ-01|Pouso/decolagem com vento cruzado leve|Aproximação / pouso|Variação controlada.||
|15|A139-HLD-01|Holding/espera visual ou vetoração básica|Espera / vetoração|Só após voo normal consolidado.|Se aplicável.|
|16|OPS-OFF-X1|Navegação offshore introdutória sem emergência|Rota normal / navegação|Introdução leve, sem pane.||
|17|A139-TAX-01|Taxi/deslocamento pós-pouso|Pós-pouso|Depois do pouso.||
|18|A139-EST-01|Estacionamento/corte|Pós-pouso|Encerramento.||


### 03/12 — IFR/PBN Básico

|ordem_aplicacao|codigo|item|fase_voo|motivo_da_ordem|observacao|
|---:|---|---|---|---|---|
|1|OPS-NAV-X1|Navegação FMS e convencional|Preparação IFR|Setup antes da saída.||
|2|OPS-NAV-X4|SID e STAR|Preparação / saída IFR|SID para saída; STAR para chegada.||
|3|OPS-NAV-X2|Uso AP e automação normal|Preparação / IFR normal|Automação normal antes do perfil.||
|4|FLY-BAS-X2|Controle geral IFR|Saída/enroute IFR|Base de controle.||
|5|A139-SCN-02|Varredura de instrumentos IFR|Enroute IFR|Scan técnico.||
|6|A139-VMA-01|Voo manual por instrumentos|Enroute IFR|Voo manual em condição normal.||
|7|A139-ORI-01|Orientação e correção de rumo por instrumentos|Enroute IFR|Após controle/manual.||
|8|OPS-NAV-X3|Holding pattern|Espera IFR|Antes das aproximações.||
|9|A139-RNP-01|Aproximação RNP básica|Aproximação IFR|Primeira aproximação PBN.||
|10|OPS-APP-X1|Precision approach|Aproximação IFR|Após RNP/controle.||
|11|OPS-APP-X2|Non-precision approach|Aproximação IFR|Variação NPA.||
|12|OPS-APP-X3|Missed approach|Missed approach|Após aproximação.||
|13|OPS-APP-X4|Large angle approach introdutório|Aproximação|Variação introdutória.||
|14|FLY-BAS-X4|Recuperação de atitudes anormais em IFR básico|Recuperação|Após base IFR.||
|15|A139-CKL-01|Normal checklist em contexto IFR|Checklist|Aplicado por fase, não como briefing.||
|16|FLY-BAS-X1|Transição visual/instrumental|Transição|Após IFR e antes do pouso.||
|17|OPS-APP-X1|Reaproximação de precisão — repetição técnica|Reaproximação|Substitui itens COM/BRF saneados.||
|18|OPS-APP-X3|Repetição técnica de missed approach|Missed approach|Reforço técnico.||


### 04/12 — CAS/QRH Anormalidades Simples

|ordem_aplicacao|codigo|item|fase_voo|motivo_da_ordem|observacao|
|---:|---|---|---|---|---|
|1|A139-CKL-02|Aplicação prática do QRH para CAS/caution|Preparação do método|Apresentar método antes do primeiro evento.|Técnica observável se for localização/aplicação.|
|2|CAU-DCG-53|Single DC GEN failure|Cruzeiro / caution elétrica|Evento simples.||
|3|CAU-BOF-55|Battery offline|Elétrico|Correlato.||
|4|CAU-DCB-56|DC bus failure|Elétrico|Aumenta complexidade.||
|5|CAU-ACB-57|AC bus failure|Elétrico|Completa barramentos.||
|6|CAU-28D-58|28V DC failure|Elétrico|Correlato.||
|7|CAU-ADS-46|ADS failure|Avionics|Bloco avionics.||
|8|CAU-AHR-47|AHRS failure|Avionics|Correlato.||
|9|CAU-DUD-46|Display unit degraded|Displays|Bloco displays.||
|10|CAU-PFD-45|PFD failure|Displays|Correlato.||
|11|CAU-MFD-45|MFD failure|Displays|Correlato.||
|12|CAU-EIC-45|EICAS failure|Displays/EICAS|Correlato.||
|13|CAU-ADC-48|ADC failure|Dados ar|Após displays.||
|14|CAU-GPS-52|GPS failure|Navegação|Bloco navegação.||
|15|CAU-FMS-51|FMS failure|Navegação|Correlato.||
|16|CAU-APO-38|AP OFF|AFCS simples|Após navegação.||
|17|CAU-MIS-40|AP MISTRIM|AFCS simples|Correlato.||
|18|CAU-SAS-41|SAS degraded|AFCS simples|Fecha anormalidades simples.||


### 05/12 — Engine/OEI Introdutório

|ordem_aplicacao|codigo|item|fase_voo|motivo_da_ordem|observacao|
|---:|---|---|---|---|---|
|1|WAR-OUT-15|Engine failure|Cruzeiro estabilizado / evento|Primeira falha motor em fase estabilizada.||
|2|A139-IDF-01|Identificação de falha de motor|Reconhecimento|Após evento.||
|3|A139-CKL-03|QRH para engine failure / EEC FAIL em cruzeiro|QRH|Após identificação.||
|4|WAR-EEC-18|EEC FAIL|Motor / evento correlato|Após engine failure como família motor.||
|5|A139-OEI-01|Perfil OEI em cruzeiro|Perfil OEI|Após QRH.||
|6|CAU-LIC-60|OEI limit timer|Monitoramento OEI|Após perfil OEI.||
|7|CAU-CST-59|Compressor stall|Motor / evento|Variação motor.||
|8|CAU-OVS-64|Engine overspeed|Motor / evento|Variação.||
|9|CAU-NGO-63|NG overspeed|Motor / evento|Correlato.||
|10|CAU-HOT-65|Hot start|Motor / solo/partida|Validar se melhor em solo; manter como técnico.||
|11|CAU-FLO-73|Fuel low|Combustível em contexto motor|Após motor.||
|12|CAU-2FP-74|Double fuel pump failure|Combustível|Correlato.||
|13|CAU-EFP-75|Engine fuel pump failure|Combustível motor|Correlato.||
|14|WAR-OIL-18|Oil pressure low|Óleo motor|Correlato.||
|15|CAU-CND-61|Compressor no demand|Motor|Variação.||
|16|CAU-TNF-62|Throttle non-follow|Motor/controle|Variação.||
|17|WAR-OUT-15|Repetição técnica: engine failure em cruzeiro|Repetição técnica|Substitui COM saneado.||
|18|A139-CKL-03|Repetição técnica: QRH engine/EEC|Repetição técnica|Substitui BRF saneado.||


### 06/12 — CAT A/B Introdutório

|ordem_aplicacao|codigo|item|fase_voo|motivo_da_ordem|observacao|
|---:|---|---|---|---|---|
|1|A139-CKL-04|QRH para CAT A/B e falha na decolagem/aproximação|Preparação método|Antes de eventos CAT.||
|2|OPS-NRM-X2|Decolagens e pousos — perfil CAT A/B|Decolagem normal / perfil|Base normal.||
|3|FLY-BAS-X3|Hover e taxi / hover check pré-CAT A/B|Hover / preparação|Antes de TDP.||
|4|A139-CATB-01|Rejected takeoff / decolagem rejeitada CAT A|Decolagem / rejeição|Antes de continued.||
|5|A139-CATB-02|Continued takeoff com falha de motor CAT A|Decolagem / continued|Após rejected.||
|6|WAR-OUT-15|Engine failure na decolagem/aproximação|Evento motor|Evento central.||
|7|A139-IDF-01|Identificação de falha|Reconhecimento|Após evento.||
|8|WAR-EEC-18|EEC FAIL em contexto CAT A/B|Evento correlato|Após engine failure.||
|9|WAR-IDL-16|Engine stuck IDLE|Evento correlato|Alta criticidade.||
|10|WAR-LOW-29|Rotor RPM low|Rotor RPM|Evento correlato.||
|11|WAR-HIG-29|Rotor RPM high|Rotor RPM|Evento correlato.||
|12|CAU-HYP-77|Hydraulic pressure low|Hidráulico|Pode afetar perfil.||
|13|CAU-SRV-80|Servo bypass|Hidráulico/servo|Correlato.||
|14|WAR-GER-27|Landing gear emergency|Trem/pouso|Preparar pouso.||
|15|A139-POU-01|Pouso monomotor CAT A/B|Pouso OEI|Após aproximação/perfil.||
|16|OPS-NRM-X1|Procedimentos normais aplicados a CAT A/B|Normalização|Fechar com normalização.||
|17|A139-CATB-01|Repetição técnica rejected takeoff|Repetição técnica|Substitui COM saneado.||
|18|A139-CATB-02|Repetição técnica continued takeoff|Repetição técnica|Substitui BRF saneado.||


### 07/12 — AFCS/Avionics

|ordem_aplicacao|codigo|item|fase_voo|motivo_da_ordem|observacao|
|---:|---|---|---|---|---|
|1|CAU-APF-37|AP failure|Enroute / AFCS|Evento principal AFCS.||
|2|CAU-MIS-40|AP MISTRIM|AFCS|Correlato.||
|3|CAU-SAS-41|SAS degraded|AFCS|Correlato.||
|4|CAU-AFD-41|AFCS degraded|AFCS|Aumenta degradação.||
|5|FLY-BAS-X4|Recuperação de atitudes anormais com AFCS degradado|Recuperação|Aplicar após degradação.||
|6|A139-VMA-01|Voo manual por instrumentos em contexto degradado|Voo manual IFR|Após AFCS degraded.||
|7|CAU-ADS-46|ADS failure|Avionics|Novo bloco.||
|8|CAU-AHR-47|AHRS failure|Avionics|Correlato.||
|9|CAU-DUD-46|Display unit degraded|Displays|Novo bloco.||
|10|CAU-PFD-45|PFD failure|Displays|Correlato.||
|11|CAU-MFD-45|MFD failure|Displays|Correlato.||
|12|CAU-EIC-45|EICAS failure|Displays/EICAS|Correlato.||
|13|CAU-ADC-48|ADC failure|Air data|Após displays.||
|14|CAU-GPS-52|GPS failure|Navegação|Bloco navegação.||
|15|CAU-FMS-51|FMS failure|Navegação|Correlato.||
|16|OPS-APP-X1|Precision approach com AFCS/avionics degradado|Aproximação|Após falhas de avionics.||
|17|CAU-APF-37|Repetição técnica AP failure|Repetição técnica|Substitui COM saneado.||
|18|CAU-AFD-41|Repetição técnica AFCS degraded|Repetição técnica|Substitui BRF saneado.||


### 08/12 — Rotor/Transmission/Hydraulic

|ordem_aplicacao|codigo|item|fase_voo|motivo_da_ordem|observacao|
|---:|---|---|---|---|---|
|1|WAR-MGB-30|MGB oil pressure|Transmissão|Primeiro bloco transmissão.||
|2|WAR-TMP-30|MGB oil temp high|Transmissão|Correlato.||
|3|CAU-MGP-105|MGB chip detected|Transmissão|Correlato.||
|4|WAR-TDR-X1|Tail rotor drive failure|Tail rotor|Após MGB/transmissão.||
|5|WAR-TCS-X1|Tail rotor control failure|Tail rotor|Correlato.||
|6|WAR-MRC-X1|Main rotor binding|Rotor principal|Bloco rotor.||
|7|WAR-TRC-X1|Tail rotor binding|Rotor de cauda|Correlato.||
|8|CAU-HYP-77|Hydraulic pressure low|Hidráulico|Após rotor/transmissão.||
|9|CAU-SRV-80|Servo bypass|Servo|Correlato.||
|10|WAR-LOW-29|Rotor RPM low|Rotor RPM|Antes de autorrotação.||
|11|WAR-HIG-29|Rotor RPM high|Rotor RPM|Correlato.||
|12|A139-ENE-01|Controle de energia/RPM em autorrotação|Autorrotacão / energia|Pré-requisito.||
|13|FLY-BAS-17|Autorotação|Autorrotacão|Após energia/RPM.||
|14|A139-REC-01|Recuperação de autorrotação|Recuperação|Após autorrotação.||
|15|A139-CKL-05|Ações de memória e QRH para rotor/transmissão|QRH|Após evento.||
|16|WAR-GER-27|Landing gear emergency|Trem/pouso|Preparar pouso seguro.||
|17|FLY-BAS-17|Repetição técnica autorrotação|Repetição técnica|Substitui COM saneado.||
|18|A139-ENE-01|Repetição técnica controle energia/RPM|Repetição técnica|Substitui BRF saneado.||


### 09/12 — Fire/Smoke/Emergências Avançadas

|ordem_aplicacao|codigo|item|fase_voo|motivo_da_ordem|observacao|
|---:|---|---|---|---|---|
|1|WAR-FIR-21|Engine fire|Fogo motor|Evento principal.||
|2|A139-CKL-06|Ações de memória para fogo/fumaça|Ações imediatas / QRH|Após fogo.||
|3|WAR-CAB-23|Cabin/cockpit smoke|Fumaça cabine|Novo bloco.||
|4|WAR-BAG-23|Baggage fire|Fogo bagagem|Correlato.||
|5|CAU-O2P-82|O2 pressure low|Sistema O2|Após fumaça.||
|6|WAR-OUT-15|Engine failure alto estresse|Motor / alto estresse|Após fogo/fumaça.||
|7|CAU-HOT-65|Hot start em cenário avançado|Motor / solo|Variação.||
|8|CAU-FLO-73|Fuel low em emergência|Combustível|Correlato.||
|9|CAU-HYP-77|Hydraulic pressure low|Hidráulico|Correlato.||
|10|CAU-SRV-80|Servo bypass|Servo|Correlato.||
|11|WAR-LOW-29|Rotor RPM low|Rotor RPM|Alta severidade.||
|12|WAR-HIG-29|Rotor RPM high|Rotor RPM|Alta severidade.||
|13|WAR-GER-27|Landing gear emergency|Trem/pouso|Preparar pouso.||
|14|FLY-BAS-17|Autorotação em alto estresse|Autorrotacão|Depois de sessão 08.||
|15|OPS-APP-X1|Precision approach em emergência|Aproximação|Após eventos e checklist.||
|16|OPS-APP-X3|Missed approach em emergência|Missed approach|Após aproximação.||
|17|WAR-FIR-21|Repetição técnica engine fire|Repetição técnica|Substitui COM saneado.||
|18|A139-CKL-06|Repetição técnica QRH fogo/fumaça|Repetição técnica|Substitui BRF saneado.||


### 10/12 — Offshore/Helideck

|ordem_aplicacao|codigo|item|fase_voo|motivo_da_ordem|observacao|
|---:|---|---|---|---|---|
|1|OPS-OFF-X1|Navegação offshore|Rota offshore|Começa com navegação para UM.||
|2|OPS-NAV-X1|Navegação FMS e convencional em offshore|Rota offshore|Setup/execução de rota.||
|3|OPS-NAV-X2|Uso AP e automação em offshore|Rota offshore|Após rota.||
|4|CAU-FLO-73|Fuel low em rota offshore|Rota / evento|Evento compatível com rota.||
|5|WAR-GEN-11|Dual DC GEN failure|Rota / evento|Evento em rota.||
|6|WAR-OUT-15|Engine failure em offshore|Rota offshore / evento|Evento motor em contexto correto.||
|7|CAU-2FP-74|Double fuel pump failure|Rota / combustível|Correlato combustível.||
|8|CAU-LIC-60|OEI limit timer|OEI offshore|Após engine event.||
|9|OPS-OFF-X2|Aproximação offshore|Aproximação offshore|Após rota/eventos.||
|10|OPS-APP-X4|Aproximação grande ângulo|Aproximação offshore|Variação técnica.||
|11|OPS-APP-X1|Precision approach em contexto offshore|Aproximação|Se cenário IFR.||
|12|OPS-NRM-X2|Decolagens e pousos em contexto offshore|Helideck / pouso/decolagem|Após aproximação.||
|13|OPS-APP-X3|Missed approach / arremetida offshore|Arremetida|Após aproximação.||
|14|WAR-LOW-29|Rotor RPM low em offshore|Evento offshore avançado|Se inserido no contexto helideck/rota.||
|15|WAR-HIG-29|Rotor RPM high em offshore|Evento offshore avançado|Correlato.||
|16|FLY-BAS-17|Autorotação em proximidade da água|Autorrotacão / água|Só na sessão offshore avançada.||
|17|OPS-OFF-X3|Ditching / flutuabilidade AW139|Ditching|Após autorrotação/emergência offshore.|Validar QRH.|
|18|CAU-HOT-65|Hot start / item de reforço em contexto offshore|Reforço técnico|Verificar se deve permanecer nesta sessão ou voltar a motor.|Pendente de validação.|


### 11/12 — LOFT

Natureza: treinamento de cenário integrado AW139, com QRH/CAS/AFCS/offshore conforme aplicável. Pode haver intervenção instrucional e repetição parcial.


|ordem_aplicacao|codigo|item|fase_voo|motivo_da_ordem|observacao|
|---:|---|---|---|---|---|
|1|LOFT-CHK-01|Performance e cálculos de decolagem IFR|Planejamento missão|Começa no planejamento.|Treinamento de cenário; pode haver orientação.|
|2|LOFT-CHK-02|Planejamento IFR, mínimos e alternado|Planejamento missão|Definir rota/minimos antes do FMS.||
|3|LOFT-CHK-03|Configuração completa do FMS|Preparação cockpit|Após planejamento.||
|4|LOFT-CHK-05|Inspeção, acionamento e checklists|Pré-voo / partida|Antes do taxi/decolagem.||
|5|LOFT-CHK-06|Hover check e taxi IFR|Taxi / hover|Antes da decolagem.||
|6|LOFT-CHK-07|Decolagem IFR — perfil CAT A em IMC|Decolagem IFR|Inicia missão.|Aplicar conforme aeronave/frota. Treinamento de cenário.|
|7|LOFT-CHK-08|OEI pós-TDP — fly-away monomotor IFR|Decolagem / evento|Evento após TDP/decisão.||
|8|LOFT-CHK-09|Navegação IFR en route e gestão de FMS|Enroute|Após saída.||
|9|LOFT-CHK-10|Monitoramento de sistemas e path monitoring|Enroute / monitoramento técnico|Durante rota.||
|10|LOFT-CHK-11|Gestão de falha de sistema em rota|Enroute / evento|Evento no momento de rota.||
|11|LOFT-CHK-12|Chegada STAR/RNAV e descida|Chegada/descida|Após rota e replanejamento.||
|12|LOFT-CHK-13|Procedimento de espera IFR|Espera|Antes da aproximação.||
|13|LOFT-CHK-14|Aproximação não precisão — RNAV ou VOR|Aproximação IFR|Primeira aproximação.||
|14|LOFT-CHK-15|Arremetida por abaixo dos mínimos (NPA)|Missed approach|Só após NPA.||
|15|LOFT-CHK-17|Setup para ILS|Reaproximação|Preparar nova aproximação.|Briefing como técnica só se for setup técnico; comportamento fica NOTECHS.|
|16|LOFT-CHK-18|Aproximação ILS — final e decisão na DA|Aproximação IFR|Após setup ILS.||
|17|LOFT-CHK-19|Pouso no alternado e procedimentos pós-voo|Pouso / pós-voo|Fecha o cenário.||
|18|LOFT-CHK-23|Painel limitado / falha de instrumentos IFR|Evento avaliável opcional dentro do cenário|Pode ser inserido em rota ou aproximação; registrar posição do evento no briefing do cenário.||


### 12/12 — LOFT Check

Natureza: avaliação final AW139. Não introduzir conteúdo novo; usar como LOFT Check com caráter avaliativo e cobertura FAP.


|ordem_aplicacao|codigo|item|fase_voo|motivo_da_ordem|observacao|
|---:|---|---|---|---|---|
|1|LOFT-CHK-01|Performance e cálculos de decolagem IFR|Planejamento missão|Começa no planejamento.|Treinamento de cenário; pode haver orientação. \| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|2|LOFT-CHK-02|Planejamento IFR, mínimos e alternado|Planejamento missão|Definir rota/minimos antes do FMS.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|3|LOFT-CHK-03|Configuração completa do FMS|Preparação cockpit|Após planejamento.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|4|LOFT-CHK-05|Inspeção, acionamento e checklists|Pré-voo / partida|Antes do taxi/decolagem.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|5|LOFT-CHK-06|Hover check e taxi IFR|Taxi / hover|Antes da decolagem.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|6|LOFT-CHK-07|Decolagem IFR — perfil CAT A em IMC|Decolagem IFR|Inicia missão.|Aplicar conforme aeronave/frota. Treinamento de cenário. \| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|7|LOFT-CHK-08|OEI pós-TDP — fly-away monomotor IFR|Decolagem / evento|Evento após TDP/decisão.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|8|LOFT-CHK-09|Navegação IFR en route e gestão de FMS|Enroute|Após saída.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|9|LOFT-CHK-10|Monitoramento de sistemas e path monitoring|Enroute / monitoramento técnico|Durante rota.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|10|LOFT-CHK-11|Gestão de falha de sistema em rota|Enroute / evento|Evento no momento de rota.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|11|LOFT-CHK-12|Chegada STAR/RNAV e descida|Chegada/descida|Após rota e replanejamento.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|12|LOFT-CHK-13|Procedimento de espera IFR|Espera|Antes da aproximação.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|13|LOFT-CHK-14|Aproximação não precisão — RNAV ou VOR|Aproximação IFR|Primeira aproximação.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|14|LOFT-CHK-15|Arremetida por abaixo dos mínimos (NPA)|Missed approach|Só após NPA.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|15|LOFT-CHK-17|Setup para ILS|Reaproximação|Preparar nova aproximação.|Briefing como técnica só se for setup técnico; comportamento fica NOTECHS. \| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|16|LOFT-CHK-18|Aproximação ILS — final e decisão na DA|Aproximação IFR|Após setup ILS.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|17|LOFT-CHK-19|Pouso no alternado e procedimentos pós-voo|Pouso / pós-voo|Fecha o cenário.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|
|18|LOFT-CHK-23|Painel limitado / falha de instrumentos IFR|Evento avaliável opcional dentro do cenário|Pode ser inserido em rota ou aproximação; registrar posição do evento no briefing do cenário.|\| caráter=avaliativo; sem conteúdo novo; fonte=FAP 05.2/06/14/PTO|


## 6. Regras para periódicos

A V4.2 não refaz todos os periódicos linha a linha porque a V4 já preservou a lógica periódica e a V4.1 confirmou a estrutura. A aplicação futura deve respeitar as regras abaixo.


### 6.1 S76/SK76 periódico — 3 ciclos × 3 sessões

| tipo de sessão | sequência V4.2 obrigatória | observação |
|---|---|---|
| VFR/emergências | checklist normal → decolagem/perfil visual → evento de motor/sistema do ciclo → ECL → aproximação/pouso ou arremetida → encerramento | Corrigir qualquer “QRH” para ECL/checklist, salvo validação contrária. |
| IFR/noturno/offshore | setup IFR → saída/navegação → evento compatível com rota/IFR/offshore → ECL → aproximação/missed → pouso/alternado | Não inserir pane offshore antes de contexto offshore. |
| LOFT/check | planejamento → execução normal → evento do ciclo → ECL → replanejamento → aproximação/pouso → itens FAP | Se for check, marcar `carater=avaliativo`. |


### 6.2 AW139 periódico — 3 ciclos × 4 sessões

| tipo de sessão | sequência V4.2 obrigatória | observação |
|---|---|---|
| VFR/emergências | normal checklist → decolagem/perfil visual → CAS/QRH event do ciclo → QRH → aproximação/pouso | Usar QRH/CAS AW139. |
| IFR/noturno/offshore | setup FMS/IFR → saída/enroute → AFCS/CAS/evento do ciclo → QRH → approach/missed → pouso | Não comprimir offshore/LOFT nesta sessão. |
| LOFT/Offshore | missão offshore → navegação/helideck → evento offshore compatível → QRH → retorno/alternado/ditching → encerramento | Ditching/flutuabilidade só após contexto offshore. |
| LOFT/Check | preparação → execução normal → evento avaliativo → FAP técnica → QRH/checklist → aproximação/pouso → encerramento | `carater=avaliativo`; sem conteúdo novo. |


## 7. Correções detectadas pela V4.2

|ordem_aplicacao|codigo|item|fase_voo|motivo_da_ordem|observacao|
|---:|---|---|---|---|---|
|1|S76/SK76 01/12|`S76-SCN-01` e `S76-SEG-01`|SCN/SEG não devem permanecer na sessão 01 como técnica; V4.1 já removeu/renomeou.|Substituir por `S76-INS-01`, `S76-PWR-01`, `S76-PED-01`, `S76-HVT-01` conforme tabela.||
|2|S76/SK76 04/12|Lista de anormalidades sem fase de voo|Sistemas apareciam como lista de falhas, não como cenário.|Aplicar como mini-cenários: voo estabilizado → evento → ECL → aproximação/pouso.||
|3|S76/SK76 09/12|Falhas duplas em hover/decolagem|Podem ser avançadas demais se aplicadas antes de cenário de fogo estabilizado.|Aplicar falha dupla em cruzeiro antes das variantes de decolagem/hover; validar com instrutor.||
|4|AW139 01/12|CAS/QRH como conceito|Pode virar conteúdo instrucional, não técnica.|Mantém somente se for leitura/localização objetivamente avaliável.||
|5|AW139 10/12|`CAU-HOT-65` em offshore|Hot start em sessão offshore pode estar deslocado.|Validar se deve voltar para motor/partida ou ficar como reforço contextual.||
|6|LOFT/LOFT Check|Listas técnicas idênticas|Pode ser aceitável, mas a natureza pedagógica não pode ser idêntica.|Marcar LOFT como treino e LOFT Check como avaliativo, sem conteúdo novo.||


## 8. Implicações para implementação futura

A implementação futura não deve usar apenas `ordem` ou `ordem_atual`. Deve distinguir: `ordem_cadastro` ou legado; `ordem_aplicacao`; `fase_voo`; `tipo_item`; `carater` para LOFT Check; e `fonte_fap`. Essa distinção evita que uma ficha correta em conteúdo seja aplicada em ordem errada.

Campos futuros sugeridos, ainda sem implementação: `ordem_aplicacao`, `fase_voo`, `tipo_item`, `carater`, `fap_refs`, `fonte_operacional`, `validacao_instrutor`.

## 9. Confirmações

- Nenhuma implementação foi realizada.
- Nenhum DML foi executado.
- Nenhuma migration foi criada.
- Nenhum deploy foi realizado.
- Produção permaneceu intocada.
- V4 e V4.1 foram preservadas.
- NOTECHS permanece fora das 18 técnicas.
- Este documento é uma camada documental de sequenciamento para revisão operacional antes de qualquer implementação.

## 10. Veredito final da V4.2

**GO com ressalvas para revisão operacional com instrutor/owner. NO-GO para Codex/implementação.** A matriz agora tem três camadas: V4 = redistribuição pedagógica; V4.1 = saneamento de itens não técnicos; V4.2 = sequência de aplicação temporal. A próxima versão antes de implementação deve consolidar V4+V4.1+V4.2 em uma matriz final única, validada por instrutor e owner.
