# AirTrust — Matriz V6.2 Final de Manobras por Sessão

**Documento de implantação técnica — não regulatório.**

Este arquivo substitui os fechamentos parciais anteriores sobre a ordem das manobras. Ele consolida, em uma única especificação, as sessões e as 18 manobras técnicas de cada ficha contemplada nos documentos de proposta AW139 e SK76 enviados pelo owner, incluindo TRE-INST e CRED-EXA no mesmo padrão estrutural.

**Atualização de escopo (fechamento do target 51):** a redação original da §9 tratava sessões de noturno, semestral, reaquisição e instrutor/examinador como "fora dos PDFs enviados" e instruía não alterá-las. A decisão 12 (§4) já havia revertido isso para `TRE-INST`/`CRED-EXA`. A decisão 15 (§4) estende a mesma lógica aos 10 modelos remanescentes do catálogo operacional de 51 modelos, fechando o target em `51` modelos / `918` linhas técnicas / `15` NOTECHS fora das técnicas. Nenhuma manobra foi apagada nesta fase; a lista de manobras ativas sem uso (`docs/analysis/MANOBRAS_SEM_USO_EM_MODELOS_SESSAO_SNAPSHOT_20260705.md`) só deve ser recalculada depois do target 51 fechado.

## 0. Status e regra de uso

- **Não é ficha homologada/aprovada pela ANAC.**
- **Não aplicar direto em produção.**
- Deve ser implementado primeiro no loader/código-fonte da Matriz, com dry-run local, testes e PR.
- Produção só depois de backup, runbook, validação e autorização explícita.
- NOTECHS continua fora das 18 manobras técnicas: **15 itens NOTECHS fixos e separados**.
- A ficha PDF deve exibir os 18 itens técnicos + NOTECHS, sem metadados internos, sem régua de avaliação e sem descritores longos.

## 1. Fontes consideradas

1. `Proposta de Revisão das Fichas — AW139 (1).pdf`.
2. `Proposta de Revisão das Fichas — SK76 (1).pdf`.
3. Auditoria do PR #255: sequência operacional, matriz FAP/RIPEA e gaps check→treino.
4. Histórico das decisões AirTrust nesta frente:
   - erro da A139-I-01/12 com manobra de voo após estacionamento/corte;
   - necessidade de todos os itens de check terem sido treinados antes;
   - SK76-P-CHECK não pode usar família `S76-LOFT-*` sem treino prévio;
   - `S76-LGE-44` deve ser substituído por `S76-LGB-47` se mantida a lógica de treino prévio;
   - referências de FAP/RIPEA/manual devem ir em `referencias_json`, não no código.
5. `docs/MODELOS_SESSAO_MANOBRAS.md` como evidência operacional do estado legado a ser corrigido.

## 2. Regras de sequência aplicadas

A sequência de cada sessão deve seguir, quando a sessão representa voo contínuo:

`preparação → checklist/ECL/QRH → partida/power-up → taxi/hover → decolagem → subida → cruzeiro/navegação → evento compatível → checklist/ECL/QRH → decisão → aproximação/arremetida → pouso/encerramento`

Exceções aceitas:

- Sessões de sistemas/anormalidades podem ser **blocos técnicos em voo estabilizado**, desde que não contenham pouso/corte antes de novo item de voo.
- LOFT é cenário/multi-evolução. Pode conter eventos após pouso intermediário se o cenário prevê nova evolução, mas não deve terminar com item de voo depois de `pouso/pós-voo`.
- LOFT Check é avaliação: não deve introduzir manobra não treinada antes.
- Offshore/ditching deve encerrar com ditching/flutuabilidade/evacuação se esse for o evento final. Não deve haver aproximação/decolagem após ditching.

## 3. Lógica de códigos

### 3.1 Prefixos

- `A139-*`: manobra específica AW139.
- `S76-*`: manobra específica S76/SK76.
- `OPS-*`: procedimento operacional genérico aplicável a frota, quando realmente genérico.
- `FLY-*`: habilidade básica de pilotagem comum.
- `LOFT-CHK-*`: sequência LOFT/check padronizada e treinada.
- `LOFT-OFF-*`: cenário offshore AW139.
- `NOT-*`: NOTECHS, fora das 18 técnicas.

### 3.2 Normalização S76

- Códigos legados `76-*` devem ser **normalizados para `S76-*` em etapa controlada**, com alias/mapeamento de compatibilidade.
- Não fazer normalização cega em produção.
- Na implementação, manter campo `codigo_legado`/comentário de migração quando necessário.
- Exemplo: `76-MOTCZ` pode ser consolidado com `S76-FCR-17` se o conteúdo e a rastreabilidade forem equivalentes.

### 3.3 Referências

- Não colocar página de QRH/FCOM/FDM/FAP no código.
- Usar `referencias_json` para:
  - FAP ANAC;
  - RIPEA/Petrobras;
  - QRH/ECL/FCOM/FDM;
  - PTO/SOP/MGO/MOM;
  - seção, item, revisão e página quando disponível.

## 4. Decisões globais de implantação

1. `A139-I-01/12`: `FLY-BAS-X4` fica antes de aproximação/pouso. A sessão encerra com `A139-EST-01`.
2. `A139-I-06/12`: QRH/ECL de motor deve vir antes do perfil OEI/pouso. Nada de perfil OEI depois de pouso.
3. `A139-I-07/12`: normalização/seleção de modos AFCS deve vir antes das falhas/degradações.
4. `A139-I-10/12`: `CAU-HOT-65` não pode encerrar sessão offshore; se mantido, entra no começo como partida/reforço técnico.
5. `A139-I-11/12` e `A139-I-12/12`: `LOFT-CHK-23` deve ocorrer como evento de rota/aproximação antes do pouso/pós-voo, não após `LOFT-CHK-19`.
6. `SK76-I-03/12`: checklist normal não encerra sessão IFR; entra no início.
7. `SK76-I-05/12`: checklist normal não encerra sessão; pouso deve encerrar.
8. `SK76-I-06/12`: ECL/checklist entra antes/depois dos eventos conforme fase; pouso monomotor encerra.
9. `SK76-I-10/12`: ditching/flutuabilidade/evacuação encerra. Não pode haver aproximação/decolagem depois de ditching.
10. `SK76-P-CHECK`: substituir família `S76-LOFT-*` por `LOFT-CHK-*` treinada, com `LOFT-CHK-23` antes da chegada/pouso.
11. `SK76-S-02/02`: substituir `S76-LGE-44` por `S76-LGB-47`, se essa sessão estiver no loader alvo.
12. `TRE-INST` e `CRED-EXA` deixam de ser modelos preservados fora do alvo e passam a seguir o padrão `18 técnicas + 15 NOTECHS`.
13. `A139-I-03/12` e `A139-I-04/12` permanecem em sistemas/anormalidades/automação; IFR básico começa em `A139-I-05/12`.
14. `SK76-I-03/12` e `SK76-I-04/12` permanecem em sistemas/anormalidades/automação; IFR básico começa em `SK76-I-05/12`.
15. Fechamento do target 51: `A139-NOT-01`, `A139-NOT-02`, `A139-REQ-01`, `A139-S-01/02`, `A139-S-02/02`, `S76-NOT-01`, `S76-NOT-02`, `S76-REQ-01`, `SK76-S-01/02` e `SK76-S-02/02` deixam de ser "sessões fora dos PDFs enviados" (§9, redação original) e passam a integrar o loader, preservando os `18` itens técnicos já documentados operacionalmente em `docs/MODELOS_SESSAO_MANOBRAS.md`, sem inventar código novo. Os `15` NOTECHS continuam fora das `18` técnicas para esses modelos, pelo mesmo mecanismo global já usado pelos demais `41` (constante compartilhada, não vínculo por modelo).
16. `SK76-S-02/02` estava fora do target quando a decisão 11 foi escrita; agora que entra no loader, a decisão 11 é aplicada: `S76-LGE-44` é substituído por `S76-LGB-47` (código já existente e já usado em `S76-P-01/04-C2`).
17. `S76-NOT-02`: a sequência operacional original encerrava em `S76-DIT-71` → `S76-FLU-01` → `S76-EST-01`. Isso conflita com a regra de terminal único (`S76-FLU-01` já é o encerramento de ditching/evacuação; nenhum item pode vir depois). `S76-EST-01` foi removido do fim da sequência e `76-FALFF` (já usado em `S76-NOT-01`) foi inserido no bloco elétrico para preservar as `18` técnicas sem introduzir código novo.

---

# 5. Modelos N/A — Instrutor e Examinador

## CRED-EXA — Credenciamento de Examinador

> **Nota de governança:** `EXA-CND-01` tem drift semântico em relação ao legado. Antes da V6.2, o código era usado para planejamento do exame; na V6.2 ativa, `EXA-CND-01` significa condução do exame. O planejamento agora é coberto por `EXA-PLN-01`. Manter esta nota como rastreabilidade documental interna, sem exibir esse texto na ficha final.
> **Rubrica de aplicação:** `EXA-PAD-01` permanece como técnica única dentro das 18, mas deve ser avaliado com duas rubricas internas separadas: padronização operacional e representatividade da autoridade.

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | EXA-CGE-01 | Conhecimento da IS 00-002 e normas aplicáveis ao examinador | Base normativa |
| 2 | EXA-CGE-02 | Métodos de avaliação e julgamento | Base normativa |
| 3 | EXA-CGE-03 | Conhecimento do SOP, MGO, PTO e currículos | Preparação do exame |
| 4 | EXA-CGE-04 | Conhecimentos técnicos e limitações | Preparação técnica |
| 5 | EXA-CGE-05 | Planejamento de voo, desempenho e preparação do exame | Planejamento |
| 6 | EXA-PLN-01 | Planejamento do exame de proficiência | Planejamento |
| 7 | EXA-BRF-01 | Briefing do exame | Briefing |
| 8 | EXA-FAP-01 | Aplicação da FAP/checklist de avaliação | Critérios / execução |
| 9 | EXA-SCN-01 | Condução de cenário avaliativo | Condução |
| 10 | EXA-CND-01 | Condução do exame de proficiência | Condução |
| 11 | EXA-STD-01 | Aplicação de padrões, tolerâncias e critérios de desempenho | Julgamento |
| 12 | EXA-RSK-01 | Gestão de segurança e risco durante o exame | Segurança |
| 13 | EXA-EMR-01 | Avaliação de procedimentos anormais e emergências | Segurança / avaliação |
| 14 | EXA-DEC-01 | Determinação do resultado do exame | Decisão |
| 15 | EXA-DBF-01 | Debriefing do exame | Debriefing |
| 16 | EXA-ADM-01 | Procedimentos administrativos do exame | Encerramento |
| 17 | EXA-ETH-01 | Imparcialidade, isenção e ética do examinador | Governança |
| 18 | EXA-PAD-01 | Padronização operacional e representatividade da autoridade (rubricas separadas) | Governança |

## TRE-INST — Treinamento de Instrutor de Voo

> **Nota de governança:** a ética/postura do instrutor foi reinserida como técnica nomeada na V6.2 atual, sem reativar `INV-CRM-04`. O conteúdo meteorologia/informações aeronáuticas permanece pressuposto na base técnica e no planejamento da instrução, mas deixa de ocupar linha própria para abrir espaço à rastreabilidade ética.
> **Aplicação NOTECHS em modelos N/A:** os 15 NOTECHS continuam fora das 18 técnicas, mas em `TRE-INST` e `CRED-EXA` devem ser interpretados no contexto de instrução/exame e padronização, não como CRM puro de tripulação em voo.

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | INV-CGE-01 | Instrumentos, equipamentos e documentos | Base técnica |
| 2 | INV-CGE-02 | Conhecimentos técnicos e sistemas | Base técnica |
| 3 | INV-CGE-03 | Procedimentos normais | Base técnica |
| 4 | INV-CGE-04 | Procedimentos anormais e de emergência | Base técnica |
| 5 | INV-CGE-05 | Peso, balanceamento e performance | Preparação |
| 6 | INV-ETH-01 | Postura ética, limites de atuação e responsabilidade do instrutor | Governança da instrução |
| 7 | INV-PLN-01 | Planejamento da instrução e objetivos da sessão | Planejamento |
| 8 | INV-BRF-01 | Briefing da instrução | Briefing |
| 9 | INV-DEM-01 | Técnica de demonstração de manobras | Demonstração |
| 10 | INV-CTL-01 | Supervisão e transferência de comandos | Condução |
| 11 | INV-SAF-01 | Intervenção do instrutor e segurança da instrução | Segurança |
| 12 | INV-ERR-01 | Gerenciamento de erros do aluno durante a instrução | Segurança / correção |
| 13 | INV-EMR-01 | Instrução de procedimentos anormais e emergências | Emergências |
| 14 | INV-AUT-01 | Instrução de autorrotação ou falha de motor | Emergências |
| 15 | INV-UAR-01 | Instrução de recuperação de atitudes anormais | Emergências |
| 16 | INV-EVL-01 | Avaliação do desempenho do aluno | Avaliação |
| 17 | INV-DBF-01 | Debriefing técnico e plano de melhoria | Debriefing |
| 18 | INV-ADM-01 | Registros administrativos e critérios de conclusão | Encerramento |

# 6. AW139 — Treinamento Inicial

## A139-I-01/12 — Familiarização / Checklist Normal / Voo Normal

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | A139-CAB-01 | Cabine AW139 e power-up | Pré-voo / cockpit |
| 2 | A139-CKL-01 | Normal checklist | Pré-partida |
| 3 | A139-CAS-01 | Leitura, priorização e reconhecimento básico de CAS sem pane simulada | Pré-partida / familiarização |
| 4 | A139-QRH-01 | Localização guiada de procedimento no QRH sem execução de emergência | Pré-partida / familiarização |
| 5 | A139-AFC-01 | Engajamento, monitoramento e desconexão normal dos modos básicos do AFCS | Pré-voo / voo normal |
| 6 | A139-TAX-01 | Taxi/deslocamento em solo e heliponto | Taxi / hover taxi |
| 7 | FLY-BAS-X3 | Hover e taxi | Hover |
| 8 | A139-PWR-01 | Controle normal de potência e parâmetros em voo visual | Hover / decolagem / voo normal |
| 9 | OPS-NRM-X2 | Decolagens e pousos — decolagem normal | Decolagem |
| 10 | FLY-BAS-X1 | Controle geral VFR | Subida/cruzeiro visual |
| 11 | FLY-BAS-X4 | Recuperação de atitudes anormais básica em VMC | Segurança / manobra básica |
| 12 | OPS-NRM-X1 | Procedimentos normais | Cruzeiro / perfil |
| 13 | A139-FMA-01 | Monitoramento básico de FMA/modos em condição normal | Voo normal / automação |
| 14 | OPS-NRM-X3 | Circuito de tráfego | Circuito |
| 15 | A139-STB-01 | Aproximação visual estabilizada e critérios de arremetida normal | Aproximação |
| 16 | A139-ARN-01 | Arremetida normal | Aproximação / arremetida |
| 17 | A139-PNO-01 | Pouso normal | Pouso |
| 18 | A139-EST-01 | Estacionamento e corte de motores | Pós-pouso |

## A139-I-02/12 — Voo Visual e Perfil Básico

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | A139-CKL-01 | Normal checklist | Pré-voo / transições |
| 2 | FLY-BAS-X3 | Hover e taxi de precisão | Hover / taxi |
| 3 | OPS-NRM-X2 | Decolagem normal | Decolagem |
| 4 | A139-SUB-01 | Subida e cruzeiro visual | Subida / cruzeiro |
| 5 | FLY-BAS-X1 | Controle geral VFR | Cruzeiro visual |
| 6 | A139-MOD-01 | Seleção e transição de modos AFCS em perfil visual normal | Cruzeiro / automação |
| 7 | A139-FMA-02 | Monitoramento de FMA durante mudança de modo | Cruzeiro / automação |
| 8 | A139-CRV-01 | Curvas e controle de atitude/velocidade | Manobras visuais |
| 9 | A139-HLD-01 | Holding/espera visual ou vetoração básica | Espera / vetoração |
| 10 | OPS-OFF-X1 | Navegação offshore introdutória sem emergência | Rota normal / navegação |
| 11 | A139-DSC-01 | Descida controlada visual | Descida |
| 12 | A139-STB-02 | Correção de perfil em aproximação visual estabilizada | Aproximação |
| 13 | A139-ARN-01 | Arremetida normal | Aproximação / arremetida |
| 14 | A139-REC-02 | Reentrada no circuito | Circuito |
| 15 | OPS-NRM-X3 | Circuito de tráfego | Circuito |
| 16 | A139-VCZ-01 | Pouso/decolagem com vento cruzado leve | Aproximação / pouso |
| 17 | A139-TAX-01 | Taxi/deslocamento pós-pouso | Pós-pouso |
| 18 | A139-EST-01 | Estacionamento/corte | Pós-pouso |

## A139-I-03/12 — Sistema Elétrico, Barras, Geradores e Anormalidades Básicas

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | A139-CKL-02 | Aplicação prática do QRH para CAS/caution | Preparação do método |
| 2 | CAU-DCG-53 | Single DC GEN failure | Cruzeiro / caution elétrica |
| 3 | CAU-BOF-55 | Battery offline | Elétrico |
| 4 | CAU-DCB-56 | DC bus failure | Elétrico |
| 5 | CAU-ACB-57 | AC bus failure | Elétrico |
| 6 | CAU-28D-58 | 28V DC failure | Elétrico |
| 7 | CAU-ADS-46 | ADS failure | Avionics |
| 8 | CAU-AHR-47 | AHRS failure | Avionics |
| 9 | CAU-DUD-46 | Display unit degraded | Displays |
| 10 | CAU-PFD-45 | PFD failure | Displays |
| 11 | CAU-MFD-45 | MFD failure | Displays |
| 12 | CAU-EIC-45 | EICAS failure | Displays/EICAS |
| 13 | CAU-ADC-48 | ADC failure | Dados ar |
| 14 | CAU-GPS-52 | GPS failure | Navegação |
| 15 | CAU-FMS-51 | FMS failure | Navegação |
| 16 | CAU-APO-38 | AP OFF | AFCS simples |
| 17 | CAU-MIS-40 | AP MISTRIM | AFCS simples |
| 18 | CAU-SAS-41 | SAS degraded | AFCS simples |

## A139-I-04/12 — AFCS, Aviônicos e Degradações Simples

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | A139-MOD-01 | Seleção e transição de modos AFCS em perfil normal | Cruzeiro / automação |
| 2 | A139-FMA-02 | Monitoramento de FMA durante mudança de modo | Cruzeiro / automação |
| 3 | CAU-APO-38 | AP OFF — retomada controlada | AFCS simples |
| 4 | CAU-APF-37 | AP failure | AFCS |
| 5 | CAU-MIS-40 | AP MISTRIM | AFCS |
| 6 | CAU-SAS-41 | SAS degraded | AFCS |
| 7 | CAU-AFD-41 | AFCS degraded | AFCS |
| 8 | OPS-NAV-X2 | Uso AP e automação em contexto degradado | Automação / degradação |
| 9 | A139-SCN-02 | Varredura de instrumentos com degradação de sensores | Instrumentos |
| 10 | A139-VMA-01 | Voo manual por instrumentos em contexto degradado | Voo manual |
| 11 | A139-ORI-01 | Correção de rumo por instrumentos com dados degradados | Navegação / instrumentos |
| 12 | CAU-AHR-47 | AHRS failure | Avionics |
| 13 | CAU-ADC-48 | ADC failure | Dados ar |
| 14 | CAU-GPS-52 | GPS failure | Navegação |
| 15 | CAU-FMS-51 | FMS failure | Navegação |
| 16 | A139-CKL-02 | Aplicação de QRH para falhas simples de AFCS/aviônicos | QRH / checklist |
| 17 | OPS-NAV-X1 | Reconfiguração de navegação FMS e convencional | Navegação |
| 18 | FLY-BAS-X4 | Recuperação de atitudes anormais com automação degradada | Recuperação |

## A139-I-05/12 — IFR/PBN Básico

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | OPS-NAV-X1 | Navegação FMS e convencional | Preparação IFR |
| 2 | OPS-NAV-X4 | SID e STAR | Preparação / saída IFR |
| 3 | OPS-NAV-X2 | Uso AP e automação normal | Preparação / IFR normal |
| 4 | FLY-BAS-X2 | Controle geral IFR | Saída/enroute IFR |
| 5 | A139-SCN-02 | Varredura de instrumentos IFR | Enroute IFR |
| 6 | A139-VMA-01 | Voo manual por instrumentos | Enroute IFR |
| 7 | A139-ORI-01 | Orientação e correção de rumo por instrumentos | Enroute IFR |
| 8 | A139-CKL-01 | Normal checklist em contexto IFR | Checklist |
| 9 | FLY-BAS-X1 | Transição visual/instrumental | Transição |
| 10 | A139-MOD-01 | Seleção e transição de modos AFCS em perfil IFR básico | Automação IFR |
| 11 | A139-FMA-02 | Monitoramento de FMA durante mudança de modo | Automação IFR |
| 12 | FLY-BAS-X4 | Recuperação de atitudes anormais em IFR básico | Recuperação |
| 13 | OPS-NAV-X3 | Holding pattern | Espera IFR |
| 14 | A139-RNP-01 | Aproximação RNP básica | Aproximação IFR |
| 15 | OPS-APP-X2 | Non-precision approach | Aproximação IFR |
| 16 | OPS-APP-X1 | Precision approach | Aproximação IFR |
| 17 | OPS-APP-X4 | Large angle approach introdutório | Aproximação |
| 18 | OPS-APP-X3 | Missed approach | Missed approach |

## A139-I-06/12 — CAT A/B Introdutório

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | A139-CKL-04 | QRH para CAT A/B e falha na decolagem/aproximação | Preparação método |
| 2 | FLY-BAS-X3 | Hover e taxi / hover check pré-CAT A/B | Hover / preparação |
| 3 | OPS-NRM-X2 | Decolagens e pousos — perfil CAT A/B | Decolagem normal / perfil |
| 4 | A139-CATB-01 | Rejected takeoff / decolagem rejeitada CAT A | Decolagem / rejeição |
| 5 | A139-CATB-02 | Continued takeoff com falha de motor CAT A | Decolagem / continued |
| 6 | WAR-OUT-15 | Engine failure na decolagem/aproximação | Evento motor |
| 7 | A139-IDF-01 | Identificação de falha | Reconhecimento |
| 8 | A139-CKL-03 | QRH para engine failure / EEC FAIL | QRH/ECL |
| 9 | WAR-EEC-18 | EEC FAIL em contexto CAT A/B | Evento correlato |
| 10 | WAR-IDL-16 | Engine stuck IDLE | Evento correlato |
| 11 | A139-OEI-01 | Perfil OEI | Perfil OEI |
| 12 | WAR-LOW-29 | Rotor RPM low | Rotor RPM |
| 13 | WAR-HIG-29 | Rotor RPM high | Rotor RPM |
| 14 | CAU-HYP-77 | Hydraulic pressure low | Hidráulico |
| 15 | CAU-SRV-80 | Servo bypass | Hidráulico/servo |
| 16 | WAR-GER-27 | Landing gear emergency | Trem/pouso |
| 17 | A139-POU-01 | Pouso monomotor CAT A/B | Pouso OEI |
| 18 | OPS-NRM-X1 | Procedimentos normais aplicados após CAT A/B | Normalização / encerramento |

## A139-I-07/12 — AFCS/Avionics

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | A139-MOD-01 | Seleção e transição de modos AFCS em perfil normal | Cruzeiro / automação |
| 2 | CAU-APO-38 | AP OFF — retomada de voo manual IFR | AFCS simples |
| 3 | CAU-APF-37 | AP failure | Enroute / AFCS |
| 4 | CAU-MIS-40 | AP MISTRIM | AFCS |
| 5 | CAU-SAS-41 | SAS degraded | AFCS |
| 6 | CAU-AFD-41 | AFCS degraded | AFCS |
| 7 | FLY-BAS-X4 | Recuperação de atitudes anormais com AFCS degradado | Recuperação |
| 8 | A139-VMA-01 | Voo manual por instrumentos em contexto degradado | Voo manual IFR |
| 9 | CAU-ADS-46 | ADS failure | Avionics |
| 10 | CAU-AHR-47 | AHRS failure | Avionics |
| 11 | CAU-DUD-46 | Display unit degraded | Displays |
| 12 | CAU-PFD-45 | PFD failure | Displays |
| 13 | CAU-MFD-45 | MFD failure | Displays |
| 14 | CAU-EIC-45 | EICAS failure | Displays/EICAS |
| 15 | CAU-ADC-48 | ADC failure | Air data |
| 16 | CAU-GPS-52 | GPS failure | Navegação |
| 17 | CAU-FMS-51 | FMS failure | Navegação |
| 18 | OPS-APP-X1 | Precision approach com AFCS/avionics degradado | Aproximação |

## A139-I-08/12 — Rotor/Transmission/Hydraulic

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | WAR-MGB-30 | MGB oil pressure | Transmissão |
| 2 | WAR-TMP-30 | MGB oil temp high | Transmissão |
| 3 | CAU-MGP-105 | MGB chip detected | Transmissão |
| 4 | WAR-TDR-X1 | Tail rotor drive failure | Tail rotor |
| 5 | WAR-TCS-X1 | Tail rotor control failure | Tail rotor |
| 6 | WAR-MRC-X1 | Main rotor binding | Rotor principal |
| 7 | WAR-TRC-X1 | Tail rotor binding | Rotor de cauda |
| 8 | CAU-HYP-77 | Hydraulic pressure low | Hidráulico |
| 9 | CAU-SRV-80 | Servo bypass | Servo |
| 10 | A139-CKL-05 | Ações de memória e QRH para rotor/transmissão | QRH |
| 11 | WAR-LOW-29 | Rotor RPM low | Rotor RPM |
| 12 | WAR-HIG-29 | Rotor RPM high | Rotor RPM |
| 13 | WAR-GER-27 | Landing gear emergency | Trem/pouso |
| 14 | A139-ENE-01 | Controle de energia/RPM em autorrotação | Autorrotação / energia |
| 15 | FLY-BAS-17 | Autorrotação | Autorrotação |
| 16 | A139-REC-01 | Recuperação de autorrotação | Recuperação |
| 17 | A139-AUT-02 | Flare e recuperação avançada da autorrotação | Autorrotação |
| 18 | A139-RPM-02 | Gerenciamento avançado de energia e RPM em flare/recuperação | Autorrotação |

## A139-I-09/12 — Fire/Smoke/Emergências Avançadas

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | WAR-FIR-21 | Engine fire | Fogo motor |
| 2 | A139-CKL-06 | Ações de memória para fogo/fumaça | Ações imediatas / QRH |
| 3 | WAR-CAB-23 | Cabin/cockpit smoke | Fumaça cabine |
| 4 | WAR-BAG-23 | Baggage fire | Fogo bagagem |
| 5 | CAU-O2P-82 | O2 pressure low | Sistema O2 |
| 6 | WAR-OUT-15 | Engine failure alto estresse | Motor / alto estresse |
| 7 | CAU-HOT-65 | Hot start em cenário avançado | Motor / solo |
| 8 | CAU-FLO-73 | Fuel low em emergência | Combustível |
| 9 | CAU-2FP-74 | Double fuel pump failure | Combustível |
| 10 | CAU-EFP-75 | Engine fuel pump failure | Combustível motor |
| 11 | CAU-HYP-77 | Hydraulic pressure low | Hidráulico |
| 12 | CAU-SRV-80 | Servo bypass | Servo |
| 13 | WAR-LOW-29 | Rotor RPM low | Rotor RPM |
| 14 | WAR-HIG-29 | Rotor RPM high | Rotor RPM |
| 15 | WAR-GER-27 | Landing gear emergency | Trem/pouso |
| 16 | FLY-BAS-17 | Autorrotação em alto estresse | Autorrotação |
| 17 | OPS-APP-X1 | Precision approach em emergência | Aproximação |
| 18 | OPS-APP-X3 | Missed approach em emergência | Missed approach |

## A139-I-10/12 — Offshore/Helideck

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | CAU-HOT-65 | Hot start / reforço técnico em contexto offshore | Partida / reforço técnico |
| 2 | OPS-OFF-X1 | Navegação offshore | Rota offshore |
| 3 | OPS-NAV-X1 | Navegação FMS e convencional em offshore | Rota offshore |
| 4 | OPS-NAV-X2 | Uso AP e automação em offshore | Rota offshore |
| 5 | CAU-FLO-73 | Fuel low em rota offshore | Rota / evento |
| 6 | WAR-GEN-11 | Dual DC GEN failure | Rota / evento |
| 7 | WAR-OUT-15 | Engine failure em offshore | Rota offshore / evento |
| 8 | CAU-2FP-74 | Double fuel pump failure | Rota / combustível |
| 9 | CAU-LIC-60 | OEI limit timer | OEI offshore |
| 10 | OPS-OFF-X2 | Aproximação offshore | Aproximação offshore |
| 11 | OPS-APP-X4 | Aproximação grande ângulo | Aproximação offshore |
| 12 | OPS-APP-X1 | Precision approach em contexto offshore | Aproximação |
| 13 | OPS-APP-X3 | Missed approach / arremetida offshore | Arremetida |
| 14 | OPS-NRM-X2 | Decolagens e pousos em contexto offshore | Helideck / pouso-decolagem |
| 15 | WAR-LOW-29 | Rotor RPM low em offshore | Evento offshore avançado |
| 16 | WAR-HIG-29 | Rotor RPM high em offshore | Evento offshore avançado |
| 17 | FLY-BAS-17 | Autorrotação em proximidade da água | Autorrotação / água |
| 18 | OPS-OFF-X3 | Ditching / flutuabilidade AW139 | Ditching / encerramento |

## A139-I-11/12 — LOFT

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | LOFT-CHK-01 | Performance e cálculos de decolagem IFR | Planejamento missão |
| 2 | LOFT-CHK-02 | Planejamento IFR, mínimos e alternado | Planejamento missão |
| 3 | LOFT-CHK-03 | Configuração completa do FMS | Preparação cockpit |
| 4 | LOFT-CHK-05 | Inspeção, acionamento e checklists | Pré-voo / partida |
| 5 | LOFT-CHK-06 | Hover check e taxi IFR | Taxi / hover |
| 6 | LOFT-CHK-07 | Decolagem IFR — perfil CAT A em IMC | Decolagem IFR |
| 7 | LOFT-CHK-08 | OEI pós-TDP — fly-away monomotor IFR | Decolagem / evento |
| 8 | LOFT-CHK-09 | Navegação IFR en route e gestão de FMS | Enroute |
| 9 | LOFT-CHK-10 | Monitoramento de sistemas e path monitoring | Enroute / monitoramento |
| 10 | LOFT-CHK-11 | Gestão de falha de sistema em rota | Enroute / evento |
| 11 | LOFT-CHK-23 | Painel limitado / falha de instrumentos IFR | Evento em rota/aproximação |
| 12 | LOFT-CHK-12 | Chegada STAR/RNAV e descida | Chegada/descida |
| 13 | LOFT-CHK-13 | Procedimento de espera IFR | Espera |
| 14 | LOFT-CHK-14 | Aproximação não precisão — RNAV ou VOR | Aproximação IFR |
| 15 | LOFT-CHK-15 | Arremetida por abaixo dos mínimos (NPA) | Missed approach |
| 16 | LOFT-CHK-17 | Setup para ILS | Reaproximação |
| 17 | LOFT-CHK-18 | Aproximação ILS — final e decisão na DA | Aproximação IFR |
| 18 | LOFT-CHK-19 | Pouso no alternado e procedimentos pós-voo | Pouso / pós-voo |

## A139-I-12/12 — LOFT Check

> Mesma sequência da A139-I-11/12, com `carater=avaliativo` em `referencias_json`/metadados internos. Não exibir `carater` na ficha final.

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | LOFT-CHK-01 | Performance e cálculos de decolagem IFR | Planejamento missão |
| 2 | LOFT-CHK-02 | Planejamento IFR, mínimos e alternado | Planejamento missão |
| 3 | LOFT-CHK-03 | Configuração completa do FMS | Preparação cockpit |
| 4 | LOFT-CHK-05 | Inspeção, acionamento e checklists | Pré-voo / partida |
| 5 | LOFT-CHK-06 | Hover check e taxi IFR | Taxi / hover |
| 6 | LOFT-CHK-07 | Decolagem IFR — perfil CAT A em IMC | Decolagem IFR |
| 7 | LOFT-CHK-08 | OEI pós-TDP — fly-away monomotor IFR | Decolagem / evento |
| 8 | LOFT-CHK-09 | Navegação IFR en route e gestão de FMS | Enroute |
| 9 | LOFT-CHK-10 | Monitoramento de sistemas e path monitoring | Enroute / monitoramento |
| 10 | LOFT-CHK-11 | Gestão de falha de sistema em rota | Enroute / evento |
| 11 | LOFT-CHK-23 | Painel limitado / falha de instrumentos IFR | Evento em rota/aproximação |
| 12 | LOFT-CHK-12 | Chegada STAR/RNAV e descida | Chegada/descida |
| 13 | LOFT-CHK-13 | Procedimento de espera IFR | Espera |
| 14 | LOFT-CHK-14 | Aproximação não precisão — RNAV ou VOR | Aproximação IFR |
| 15 | LOFT-CHK-15 | Arremetida por abaixo dos mínimos (NPA) | Missed approach |
| 16 | LOFT-CHK-17 | Setup para ILS | Reaproximação |
| 17 | LOFT-CHK-18 | Aproximação ILS — final e decisão na DA | Aproximação IFR |
| 18 | LOFT-CHK-19 | Pouso no alternado e procedimentos pós-voo | Pouso / pós-voo |

---

# 6. AW139 — Treinamento Periódico

## A139-P-01/04-C1 — Ciclo 1 / VFR-emergências

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | CAU-HOT-65 | Hot start | Partida |
| 2 | FLY-BAS-X3 | Hover e taxi | Hover |
| 3 | OPS-NRM-X2 | Decolagens e pousos | Decolagem / pouso |
| 4 | OPS-OFF-X1 | Navegação offshore | Rota |
| 5 | WAR-OUT-15 | Engine failure | Evento motor |
| 6 | WAR-IDL-16 | Engine stuck IDLE | Motor |
| 7 | CAU-CST-59 | Compressor stall | Motor |
| 8 | CAU-OVS-64 | Engine overspeed | Motor |
| 9 | WAR-LOW-29 | Rotor RPM low | Rotor RPM |
| 10 | WAR-HIG-29 | Rotor RPM high | Rotor RPM |
| 11 | WAR-FIR-21 | Engine fire | Fogo motor |
| 12 | FLY-BAS-17 | Autorrotação | Autorrotação |
| 13 | WAR-CAB-23 | Cabin/cockpit smoke | Fumaça |
| 14 | CAU-MGP-105 | MGB chip detected | Transmissão |
| 15 | WAR-MGB-30 | MGB oil pressure | Transmissão |
| 16 | WAR-TMP-30 | MGB oil temp high | Transmissão |
| 17 | CAU-DCG-53 | Single DC GEN failure | Elétrico |
| 18 | WAR-GEN-11 | Dual DC GEN failure | Elétrico |

## A139-P-02/04-C1 — Ciclo 1 / IFR-emergências

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | OPS-NRM-X1 | Procedimentos normais | Normal |
| 2 | FLY-BAS-X2 | Controle geral IFR | IFR básico |
| 3 | OPS-NAV-X2 | Uso AP e automação | Automação |
| 4 | OPS-NAV-X1 | Navegação FMS e convencional | Navegação |
| 5 | OPS-NAV-X4 | SID e STAR | Saída/chegada |
| 6 | CAU-APF-37 | AP failure | AFCS |
| 7 | CAU-AFD-41 | AFCS degraded | AFCS |
| 8 | CAU-AHR-47 | AHRS failure | Avionics |
| 9 | CAU-FMS-51 | FMS failure | Navegação |
| 10 | CAU-GPS-52 | GPS failure | Navegação |
| 11 | CAU-DCB-56 | DC bus failure | Elétrico |
| 12 | WAR-BAG-23 | Baggage fire | Fogo/fumaça |
| 13 | CAU-HYP-77 | Hydraulic pressure low | Hidráulico |
| 14 | CAU-SRV-80 | Servo bypass | Servo |
| 15 | OPS-NAV-X3 | Holding pattern | Espera |
| 16 | OPS-APP-X2 | Non-precision approach | Aproximação |
| 17 | OPS-APP-X1 | Precision approach | Aproximação |
| 18 | OPS-APP-X3 | Missed approach | Arremetida |

## A139-P-LOFT/OFFSHORE — LOFT Offshore

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | LOFT-OFF-01 | Performance CAT A para Helideck | Planejamento |
| 2 | LOFT-OFF-02 | Planejamento de Missão Offshore | Planejamento |
| 3 | LOFT-OFF-03 | Configuração FMS — Rota Offshore | Preparação cockpit |
| 4 | LOFT-OFF-05 | Inspeção, Acionamento e Checklists | Pré-voo / partida |
| 5 | LOFT-OFF-06 | Hover Check e Taxi Costeiro | Taxi / hover |
| 6 | LOFT-OFF-07 | Decolagem CAT A — Clear Area ou Vertical | Decolagem |
| 7 | LOFT-OFF-08 | Gestão de Automação en Route | Enroute |
| 8 | LOFT-OFF-09 | Navegação Offshore e Combustível | Enroute |
| 9 | LOFT-OFF-11 | Diagnóstico: HYD 1 FAIL | Evento |
| 10 | LOFT-OFF-12 | Procedimentos Hidráulicos (Memória + QRH) | QRH / memória |
| 11 | LOFT-OFF-14 | Briefing de Aproximação ao Helideck | Aproximação |
| 12 | LOFT-OFF-15 | Pouso Normal no Helideck | Pouso |
| 13 | LOFT-OFF-16 | Gestão de Potência OEI — Limites | OEI |
| 14 | LOFT-OFF-17 | OEI Antes do TDP — Decolagem Rejeitada | Decolagem rejeitada |
| 15 | LOFT-OFF-18 | OEI Após o TDP — Fly-Away Monomotor | Decolagem / OEI |
| 16 | LOFT-OFF-19 | OEI Antes do LDP — Arremetida Monomotor | Aproximação / arremetida |
| 17 | LOFT-OFF-20 | OEI Após o LDP — Pouso Comprometido | Aproximação / pouso |
| 18 | LOFT-OFF-21 | Estabilização Final e Controle de Rampa OEI | Final / estabilização |

## A139-P-LOFT/CHECK — LOFT Check

> Usar a mesma sequência de `A139-I-12/12`, avaliativa. Não introduzir conteúdo novo.

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | LOFT-CHK-01 | Performance e cálculos de decolagem IFR | Planejamento missão |
| 2 | LOFT-CHK-02 | Planejamento IFR, mínimos e alternado | Planejamento missão |
| 3 | LOFT-CHK-03 | Configuração completa do FMS | Preparação cockpit |
| 4 | LOFT-CHK-05 | Inspeção, acionamento e checklists | Pré-voo / partida |
| 5 | LOFT-CHK-06 | Hover check e taxi IFR | Taxi / hover |
| 6 | LOFT-CHK-07 | Decolagem IFR — perfil CAT A em IMC | Decolagem IFR |
| 7 | LOFT-CHK-08 | OEI pós-TDP — fly-away monomotor IFR | Decolagem / evento |
| 8 | LOFT-CHK-09 | Navegação IFR en route e gestão de FMS | Enroute |
| 9 | LOFT-CHK-10 | Monitoramento de sistemas e path monitoring | Enroute / monitoramento |
| 10 | LOFT-CHK-11 | Gestão de falha de sistema em rota | Enroute / evento |
| 11 | LOFT-CHK-23 | Painel limitado / falha de instrumentos IFR | Evento em rota/aproximação |
| 12 | LOFT-CHK-12 | Chegada STAR/RNAV e descida | Chegada/descida |
| 13 | LOFT-CHK-13 | Procedimento de espera IFR | Espera |
| 14 | LOFT-CHK-14 | Aproximação não precisão — RNAV ou VOR | Aproximação IFR |
| 15 | LOFT-CHK-15 | Arremetida por abaixo dos mínimos (NPA) | Missed approach |
| 16 | LOFT-CHK-17 | Setup para ILS | Reaproximação |
| 17 | LOFT-CHK-18 | Aproximação ILS — final e decisão na DA | Aproximação IFR |
| 18 | LOFT-CHK-19 | Pouso no alternado e procedimentos pós-voo | Pouso / pós-voo |

## A139-P-01/04-C2 — Ciclo 2 / VFR-emergências

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | CAU-HOT-65 | Hot start | Partida |
| 2 | FLY-BAS-X3 | Hover e taxi | Hover |
| 3 | FLY-BAS-X1 | Controle geral VFR | Cruzeiro visual |
| 4 | OPS-NRM-X2 | Decolagens e pousos | Decolagem / pouso |
| 5 | WAR-OUT-15 | Engine failure | Motor |
| 6 | WAR-SHT-19 | Emergency engine shutdown | Motor / shutdown |
| 7 | WAR-LOW-29 | Rotor RPM low | Rotor RPM |
| 8 | WAR-HIG-29 | Rotor RPM high | Rotor RPM |
| 9 | WAR-EEC-18 | EEC FAIL | Motor |
| 10 | WAR-IDL-16 | Engine stuck IDLE | Motor |
| 11 | WAR-FIR-21 | Engine fire | Fogo motor |
| 12 | CAU-2FP-74 | Double fuel pump failure | Combustível |
| 13 | CAU-FLO-73 | Fuel low | Combustível |
| 14 | CAU-LIC-60 | OEI limit timer | OEI |
| 15 | OPS-OFF-X2 | Aproximação offshore | Aproximação offshore |
| 16 | WAR-MGB-30 | MGB oil pressure | Transmissão |
| 17 | WAR-TMP-30 | MGB oil temp high | Transmissão |
| 18 | CAU-DCG-53 | Single DC GEN failure | Elétrico |

## A139-P-02/04-C2 — Ciclo 2 / IFR-emergências

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | OPS-NRM-X1 | Procedimentos normais | Normal |
| 2 | FLY-BAS-X2 | Controle geral IFR | IFR básico |
| 3 | OPS-NAV-X2 | Uso AP e automação | Automação |
| 4 | CAU-APO-38 | AP OFF | AFCS |
| 5 | CAU-SAS-41 | SAS degraded | AFCS |
| 6 | FLY-BAS-X4 | Recuperação de atitudes anormais | Recuperação |
| 7 | CAU-AHR-47 | AHRS failure | Avionics |
| 8 | CAU-FMS-51 | FMS failure | Navegação |
| 9 | WAR-CAB-23 | Cabin/cockpit smoke | Fumaça |
| 10 | OPS-NAV-X1 | Navegação FMS e convencional | Navegação |
| 11 | OPS-NAV-X4 | SID e STAR | Saída/chegada |
| 12 | OPS-NAV-X3 | Holding pattern | Espera |
| 13 | WAR-OUT-15 | Engine failure | Motor |
| 14 | CAU-HYP-77 | Hydraulic pressure low | Hidráulico |
| 15 | WAR-GER-27 | Landing gear emergency | Trem/pouso |
| 16 | OPS-APP-X2 | Non-precision approach | Aproximação |
| 17 | OPS-APP-X1 | Precision approach | Aproximação |
| 18 | OPS-APP-X3 | Missed approach | Arremetida |

## A139-P-01/04-C3 — Ciclo 3 / VFR-emergências

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | OPS-NRM-X1 | Procedimentos normais | Normal |
| 2 | FLY-BAS-X3 | Hover e taxi | Hover |
| 3 | OPS-NRM-X2 | Decolagens e pousos | Decolagem / pouso |
| 4 | OPS-NRM-X3 | Circuito de tráfego | Circuito |
| 5 | WAR-LOW-29 | Rotor RPM low | Rotor RPM |
| 6 | WAR-HIG-29 | Rotor RPM high | Rotor RPM |
| 7 | WAR-EEC-18 | EEC FAIL | Motor |
| 8 | CAU-OVS-64 | Engine overspeed | Motor |
| 9 | WAR-FIR-21 | Engine fire | Fogo motor |
| 10 | FLY-BAS-17 | Autorrotação | Autorrotação |
| 11 | WAR-BAT-14 | Main battery overheat | Elétrico |
| 12 | WAR-AUX-14 | Aux battery overheat | Elétrico |
| 13 | WAR-STA-X1 | Static port obstruction | Air data |
| 14 | WAR-TDR-X1 | Tail rotor drive failure | Rotor de cauda |
| 15 | WAR-TCS-X1 | Tail rotor control failure | Rotor de cauda |
| 16 | WAR-MRC-X1 | Main rotor binding | Rotor principal |
| 17 | WAR-TRC-X1 | Tail rotor binding | Rotor de cauda |
| 18 | CAU-MGP-105 | MGB chip detected | Transmissão |

## A139-P-02/04-C3 — Ciclo 3 / IFR-emergências

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | OPS-NRM-X1 | Procedimentos normais | Normal |
| 2 | FLY-BAS-X2 | Controle geral IFR | IFR básico |
| 3 | OPS-NAV-X2 | Uso AP e automação | Automação |
| 4 | CAU-APF-37 | AP failure | AFCS |
| 5 | FLY-BAS-X4 | Recuperação de atitudes anormais | Recuperação |
| 6 | CAU-ADS-46 | ADS failure | Avionics |
| 7 | CAU-DUD-46 | Display unit degraded | Displays |
| 8 | WAR-CAB-23 | Cabin/cockpit smoke | Fumaça |
| 9 | CAU-GPS-52 | GPS failure | Navegação |
| 10 | WAR-HIG-29 | Rotor RPM high | Rotor RPM |
| 11 | WAR-LOW-29 | Rotor RPM low | Rotor RPM |
| 12 | WAR-OUT-15 | Engine failure | Motor |
| 13 | CAU-SRV-80 | Servo bypass | Servo |
| 14 | OPS-NAV-X1 | Navegação FMS e convencional | Navegação |
| 15 | OPS-NAV-X3 | Holding pattern | Espera |
| 16 | OPS-APP-X2 | Non-precision approach | Aproximação |
| 17 | OPS-APP-X1 | Precision approach | Aproximação |
| 18 | OPS-APP-X3 | Missed approach | Arremetida |

---

# 6C. AW139 — Noturno, Reaquisição e Semestral (Decisão 15)

> Incorporados ao target 51 pela Decisão 15 (§4). Sequências preservadas do snapshot operacional (`docs/MODELOS_SESSAO_MANOBRAS.md`), reusando códigos já existentes no catálogo. Ver §4 decisões 15–17 para as correções aplicadas.

## A139-NOT-01 — Treinamento Noturno Onshore

> **Correção pedagógica aplicada:** `OPS-NOT-X1` foi criado como código atual rastreável para ilusão visual noturna / black hole effect, evitando reativar `LOFT-NOT-31`. `A139-AUT-03` foi criado para autorrotação noturna dedicada AW139, evitando depender de nomenclatura genérica.

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | A139-CKL-01 | Normal checklist — preparação noturna | Pré-voo / checklist noturno |
| 2 | FLY-BAS-X3 | Hover e taxi | Hover / taxi |
| 3 | OPS-NRM-X2 | Decolagens e pousos | Decolagem |
| 4 | FLY-BAS-X1 | Controle geral VFR | Subida / cruzeiro visual noturno |
| 5 | A139-MOD-01 | Seleção e transição de modos AFCS em condição noturna | Cruzeiro / automação |
| 6 | OPS-NAV-X1 | Navegação FMS e convencional | Navegação noturna |
| 7 | OPS-NOT-X1 | Ilusão visual noturna / black hole effect — reconhecimento, correção e recuperação | Segurança noturna |
| 8 | CAU-DCG-53 | Single DC GEN failure | Elétrico |
| 9 | A139-CKL-02 | Aplicação do QRH para caution noturna | QRH / checklist |
| 10 | CAU-FLO-73 | Fuel low | Combustível |
| 11 | WAR-OUT-15 | Engine failure | Motor |
| 12 | CAU-LIC-60 | OEI limit timer | OEI |
| 13 | A139-OEI-01 | Perfil OEI noturno | Perfil OEI |
| 14 | A139-AUT-03 | Autorrotação noturna dedicada AW139 | Autorrotação noturna |
| 15 | OPS-APP-X1 | Precision approach | Aproximação noturna |
| 16 | A139-ARN-01 | Arremetida noturna com NVG/NVIS | Arremetida |
| 17 | A139-PNO-01 | Pouso normal | Pouso |
| 18 | A139-EST-01 | Estacionamento e corte pós-voo noturno | Pós-pouso |

## A139-NOT-02 — Treinamento Noturno Offshore

> **Correção pedagógica aplicada:** `OPS-NOT-X1` foi criado como código atual rastreável para ilusão visual noturna / black hole effect, evitando reativar `LOFT-NOT-31`.

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | A139-CKL-01 | Normal checklist — preparação noturna | Pré-voo / checklist noturno |
| 2 | OPS-OFF-X1 | Navegação offshore | Rota offshore noturna |
| 3 | FLY-BAS-X3 | Hover e taxi | Hover / taxi |
| 4 | OPS-NRM-X2 | Decolagens e pousos | Decolagem |
| 5 | OPS-NAV-X1 | Navegação FMS e convencional | Navegação noturna |
| 6 | FLY-BAS-X1 | Controle geral VFR | Cruzeiro visual noturno |
| 7 | OPS-OFF-X2 | Aproximação offshore | Aproximação offshore |
| 8 | OPS-NOT-X1 | Ilusão visual noturna / black hole effect — reconhecimento, correção e recuperação | Segurança noturna |
| 9 | CAU-FLO-73 | Fuel low | Combustível |
| 10 | WAR-OUT-15 | Engine failure | Motor |
| 11 | CAU-LIC-60 | OEI limit timer | OEI |
| 12 | WAR-GEN-11 | Dual DC GEN failure | Elétrico |
| 13 | A139-CKL-02 | Aplicação do QRH para caution noturna | QRH / checklist |
| 14 | FLY-BAS-17 | Autorrotação | Autorrotação |
| 15 | OPS-APP-X1 | Precision approach | Aproximação noturna |
| 16 | OPS-APP-X3 | Missed approach | Arremetida |
| 17 | A139-PNO-01 | Pouso normal | Pouso |
| 18 | A139-EST-01 | Estacionamento e corte pós-voo noturno | Pós-pouso |

## A139-REQ-01 — Reaquisição de Experiência Recente

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | A139-CKL-01 | Normal checklist — preparação operacional | Pré-voo / checklist |
| 2 | FLY-BAS-X3 | Hover e taxi | Hover / taxi |
| 3 | OPS-NRM-X2 | Decolagens e pousos | Decolagem |
| 4 | FLY-BAS-X1 | Controle geral VFR | Cruzeiro visual |
| 5 | A139-PWR-01 | Controle de potência e parâmetros | Cruzeiro / perfil |
| 6 | OPS-NRM-X1 | Procedimentos normais | Normalização |
| 7 | A139-ARN-01 | Arremetida com NVG/NVIS | Arremetida |
| 8 | OPS-NAV-X2 | Uso AP e automação | Automação |
| 9 | FLY-BAS-X2 | Controle geral IFR | IFR básico |
| 10 | OPS-APP-X1 | Precision approach | Aproximação IFR |
| 11 | OPS-APP-X3 | Missed approach | Missed approach |
| 12 | CAU-FLO-73 | Fuel low | Combustível |
| 13 | WAR-OUT-15 | Engine failure | Motor |
| 14 | CAU-LIC-60 | OEI limit timer | OEI |
| 15 | A139-OEI-01 | Perfil OEI em reaquisição operacional | Perfil OEI |
| 16 | OPS-APP-X4 | Large angle approach de reaquisição | Aproximação |
| 17 | WAR-GER-27 | Landing gear emergency | Trem / pouso |
| 18 | A139-EST-01 | Estacionamento e corte pós-voo | Pós-pouso |

## A139-S-01/02 — Semestral 01/02: LOFT e Operação Noturna

> **Enquadramento LOFT:** esta sessão deve ser conduzida como cenário operacional contínuo, não como execução isolada de manobras. As 18 técnicas abaixo são os pontos avaliáveis do cenário. NOTECHS permanecem fora da lista técnica.
> **Tipo de cenário:** LOFT semestral.
> **Objetivo da sessão:** verificar manutenção de proficiência em missão noturna com deterioração progressiva de sistemas, tomada de decisão, reconfiguração e retorno seguro para pouso e encerramento.
> **Narrativa operacional:** a tripulação inicia uma missão noturna rotineira, estabiliza a automação e a navegação, recebe degradações elétricas e de combustível em rota, administra falha de motor e conduz a recuperação do perfil até a aproximação final e o encerramento da sessão.
> **Ponto de partida:** pré-voo, checklist, hover/taxi e decolagem noturna para missão local.
> **Evento principal:** falha de motor em rota com necessidade de perfil OEI noturno e replanejamento do retorno.
> **Evento secundário:** degradações elétricas progressivas e necessidade de QRH/reconfiguração antes da aproximação final.
> **Decisão operacional esperada:** decidir o retorno/diversão, priorizar QRH e automação, estabilizar a aeronave e conduzir uma aproximação segura antes do pouso e corte.
> **Critério de encerramento:** pouso normal após reconfiguração, seguido de estacionamento e corte pós-voo.
> **Observação técnica:** as 18 linhas abaixo são itens técnicos avaliáveis dentro do cenário LOFT; a condução continua sendo por cenário, não por manobras soltas.
> **Observação NOTECHS:** NOTECHS são avaliados fora das 18 técnicas, pelo mecanismo global da matriz.

> **Correção pedagógica aplicada:** `OPS-NOT-X1` foi criado como código atual rastreável para ilusão visual noturna / black hole effect, evitando reativar `LOFT-NOT-31`. `A139-AUT-03` foi criado para autorrotação noturna dedicada AW139.

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | A139-CKL-01 | Normal checklist — preparação noturna | Pré-voo / checklist noturno |
| 2 | FLY-BAS-X3 | Hover e taxi | Hover / taxi |
| 3 | OPS-NRM-X2 | Decolagens e pousos | Decolagem |
| 4 | FLY-BAS-X1 | Controle geral VFR | Subida / cruzeiro visual noturno |
| 5 | A139-MOD-01 | Seleção e transição de modos AFCS em condição noturna | Cruzeiro / automação |
| 6 | OPS-NAV-X1 | Navegação FMS e convencional | Navegação noturna |
| 7 | OPS-NOT-X1 | Ilusão visual noturna / black hole effect — reconhecimento, correção e recuperação | Segurança noturna |
| 8 | CAU-DCG-53 | Single DC GEN failure | Elétrico |
| 9 | A139-CKL-02 | Aplicação do QRH para caution noturna | QRH / checklist |
| 10 | CAU-FLO-73 | Fuel low | Combustível |
| 11 | WAR-OUT-15 | Engine failure | Motor |
| 12 | CAU-LIC-60 | OEI limit timer | OEI |
| 13 | A139-OEI-01 | Perfil OEI noturno | Perfil OEI |
| 14 | A139-AUT-03 | Autorrotação noturna dedicada AW139 | Autorrotação noturna |
| 15 | OPS-APP-X1 | Precision approach | Aproximação noturna |
| 16 | A139-ARN-01 | Arremetida noturna com NVG/NVIS | Arremetida |
| 17 | A139-PNO-01 | Pouso normal | Pouso |
| 18 | A139-EST-01 | Estacionamento e corte pós-voo noturno | Pós-pouso |

## A139-S-02/02 — Semestral 02/02: LOFT e Check de IFR

> **Enquadramento LOFT:** esta sessão deve ser conduzida como cenário operacional contínuo, não como execução isolada de manobras. As 18 técnicas abaixo são os pontos avaliáveis do cenário. NOTECHS permanecem fora da lista técnica.
> **Tipo de cenário:** LOFT semestral.
> **Objetivo da sessão:** avaliar proficiência IFR em cenário contínuo, sem introduzir conteúdo novo, confirmando disciplina de automação, navegação, anormais e encerramento seguro de uma chegada monomotora IFR.
> **Narrativa operacional:** a tripulação decola para uma missão IFR semestral, conduz navegação e espera, absorve degradações de automação e sensores, executa aproximações e conclui o cenário com pouso monomotor IFR e pós-voo.
> **Ponto de partida:** preparação IFR completa, briefing e saída por navegação publicada.
> **Evento principal:** degradações de AFCS/FMS/AHRS durante a sequência IFR, exigindo reconfiguração sem perda de controle ou consciência situacional.
> **Evento secundário:** falha de motor próxima ao segmento final, levando a pouso monomotor IFR já dentro do envelope treinado.
> **Decisão operacional esperada:** manter o caráter avaliativo, sem ensinar conteúdo novo, decidir continuidade, arremetida ou conclusão conforme critérios estabilizados e encerrar a missão com pouso monomotor seguro.
> **Critério de encerramento:** pouso monomotor IFR seguido de estacionamento e corte pós-voo.
> **Observação técnica:** as 18 linhas abaixo são itens técnicos avaliáveis dentro do cenário LOFT; a condução continua sendo por cenário, não por manobras soltas.
> **Observação NOTECHS:** NOTECHS são avaliados fora das 18 técnicas, pelo mecanismo global da matriz.
> Sessão avaliativa (`carater=avaliativo` em metadados internos; não exibir na ficha final).

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | A139-CKL-01 | Normal checklist — preparação IFR semestral | Pré-voo / checklist |
| 2 | OPS-NAV-X1 | Navegação FMS e convencional | Navegação IFR |
| 3 | OPS-NAV-X2 | Uso AP e automação | Automação |
| 4 | FLY-BAS-X2 | Controle geral IFR | IFR básico |
| 5 | OPS-NAV-X4 | SID e STAR | Saída / chegada IFR |
| 6 | OPS-NAV-X3 | Holding pattern | Espera IFR |
| 7 | CAU-APO-38 | AP OFF | AFCS |
| 8 | CAU-FMS-51 | FMS failure | Navegação |
| 9 | CAU-AHR-47 | AHRS failure | Avionics |
| 10 | FLY-BAS-X4 | Recuperação de atitudes anormais | Recuperação |
| 11 | OPS-APP-X2 | Non-precision approach | Aproximação IFR |
| 12 | OPS-APP-X3 | Missed approach | Missed approach |
| 13 | OPS-APP-X1 | Precision approach | Aproximação IFR |
| 14 | WAR-OUT-15 | Engine failure | Motor |
| 15 | CAU-LIC-60 | OEI limit timer | OEI |
| 16 | WAR-GER-27 | Landing gear emergency | Trem / pouso |
| 17 | A139-POU-01 | Pouso monomotor IFR | Pouso OEI |
| 18 | A139-EST-01 | Estacionamento e corte pós-voo | Pós-pouso |

---

# 7. SK76/S76 — Treinamento Inicial

## SK76-I-01/12 — Familiarização / Checklist Normal / Voo Normal Básico

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | S76-CAB-01 | Cabine, comandos e instrumentos básicos | Pré-voo / cockpit |
| 2 | S76-CKL-01 | Execução do checklist normal por fase de voo | Pré-partida |
| 3 | S76-PNR-01 | Partida normal | Partida |
| 4 | S76-INS-01 | Cheque de instrumentos e parâmetros após partida | Pós-partida |
| 5 | S76-TAX-01 | Taxi e deslocamento em solo/heliponto | Taxi / hover taxi |
| 6 | S76-HOV-00 | Controle geral VFR — hover estacionário | Hover |
| 7 | S76-PED-01 | Controle de pedal e anti-torque em hover | Hover |
| 8 | S76-HVT-01 | Transição hover–decolagem e decolagem–subida | Transição / decolagem |
| 9 | S76-DNR-01 | Decolagem normal | Decolagem |
| 10 | S76-SUB-01 | Subida controlada visual | Subida |
| 11 | S76-NVF-00 | Procedimentos normais VFR / perfil normal | Cruzeiro / perfil |
| 12 | S76-PWR-01 | Controle de potência, torque e limites em voo normal | Cruzeiro / perfil |
| 13 | S76-CRV-01 | Curvas padrão e controle de atitude | Manobras visuais |
| 14 | S76-CIR-01 | Circuito de tráfego visual | Circuito |
| 15 | S76-APN-01 | Aproximação normal visual | Aproximação |
| 16 | S76-ARN-01 | Arremetida normal | Aproximação / arremetida |
| 17 | S76-PNO-01 | Pouso normal | Pouso |
| 18 | S76-EST-01 | Estacionamento e corte de motores | Pós-pouso |

## SK76-I-02/12 — Voo Normal Consolidado / Perfil Visual

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | S76-CKL-01 | Checklist normal por fase de voo | Pré-voo / transições |
| 2 | S76-HOV-00 | Hover/taxi de precisão | Hover / taxi |
| 3 | S76-DNR-01 | Decolagem normal | Decolagem |
| 4 | S76-SUB-01 | Subida controlada visual | Subida |
| 5 | S76-NVF-00 | Cruzeiro visual — procedimentos normais | Cruzeiro |
| 6 | S76-CTV-01 | Controle de velocidade em voo nivelado | Cruzeiro |
| 7 | S76-CRV-01 | Curvas padrão e controle de atitude | Manobras visuais |
| 8 | S76-DSC-01 | Descida controlada visual | Descida |
| 9 | S76-APN-01 | Aproximação visual | Aproximação |
| 10 | S76-STB-01 | Aproximação estabilizada visual com correção de rampa e velocidade | Aproximação estabilizada |
| 11 | S76-ARN-01 | Arremetida normal | Aproximação / arremetida |
| 12 | S76-REC-01 | Reentrada no circuito de tráfego | Circuito |
| 13 | S76-CIR-01 | Circuito visual — segunda volta | Circuito |
| 14 | S76-VCZ-01 | Pouso/decolagem com vento cruzado leve | Aproximação / pouso |
| 15 | S76-GAR-01 | Arremetida por aproximação instável em VMC | Aproximação / arremetida |
| 16 | S76-PNO-01 | Pouso normal | Pouso |
| 17 | S76-TAX-01 | Taxi e deslocamento pós-pouso | Pós-pouso |
| 18 | S76-EST-01 | Estacionamento e corte de motores | Pós-pouso |

## SK76-I-03/12 — Sistemas Básicos, ECL e Anormalidades Simples

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | S76-CKL-01 | Checklist normal antes do cenário | Normal estabilizado |
| 2 | 76-FLWNR | Vazão de combustível fora da faixa normal | Cruzeiro estabilizado / evento |
| 3 | S76-FPL-31 | Luz de aviso de pressão de combustível | Cruzeiro estabilizado / evento |
| 4 | 76-OILMT | Falha no sistema de óleo do motor | Cruzeiro / evento |
| 5 | S76-CKL-02 | Uso do ECL para anormalidade simples | Checklist/ECL |
| 6 | S76-APN-02 | Aproximação e pouso após anormalidade simples | Aproximação / pouso |
| 7 | 76-FALGC | Falha em um gerador DC | Mini-cenário elétrico |
| 8 | 76-PER26 | Perda de referência de 26 VAC | Mini-cenário elétrico |
| 9 | 76-FALIV | Falha no inversor | Mini-cenário elétrico |
| 10 | 76-FALAD | Falha no sistema de dados de voo | Mini-cenário instrumentos |
| 11 | 76-PERAT | Perda do indicador primário de atitude em IMC | Mini-cenário instrumentos |
| 12 | 76-FALEF | Mau funcionamento do EFIS | Mini-cenário instrumentos |
| 13 | 76-FALFD | Falha no flight director | Mini-cenário automação |
| 14 | 76-FALRM | Falha no sistema mestre de rádio | Mini-cenário comunicação técnica |
| 15 | 76-N1TQF | Falha nos indicadores N1/Torque | Mini-cenário indicação motor |
| 16 | 76-FALTS | Falha no indicador TS | Mini-cenário indicação motor |
| 17 | 76-HIDPB | Falha simples de bomba/perda de pressão servo/hidráulica | Mini-cenário hidráulico simples |
| 18 | 76-FALFF | Falha de alimentação feeder/bateria | Mini-cenário final / encerramento técnico |

## SK76-I-04/12 — Automação, Aviônicos e Degradações Básicas

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | S76-CKL-01 | Execução do checklist normal por fase de voo | Pré-partida |
| 2 | 76-PRGGP | Programação do GPS, HSI e EFIS | Preparação técnica |
| 3 | S76-NIF-00 | Procedimentos instrumentais normais e disciplina de scan | Preparação técnica |
| 4 | S76-FDA-00 | Uso do diretor de voo e automação | Automação |
| 5 | S76-SCN-01 | Varredura instrumental primária e secundária | Monitoramento |
| 6 | S76-CGI-00 | Controle geral por instrumentos em cenário simples | Controle |
| 7 | 76-FALAD | Falha no sistema de dados de voo | Instrumentos |
| 8 | 76-PERAT | Perda do indicador primário de atitude em IMC | Instrumentos |
| 9 | 76-FALEF | Mau funcionamento do EFIS | Aviônicos |
| 10 | 76-FALPA | Falha no piloto automático | Automação |
| 11 | 76-FALFD | Falha no flight director | Automação |
| 12 | 76-FALRM | Falha no sistema mestre de rádio | Comunicação técnica |
| 13 | 76-FALGC | Falha em um gerador DC | Elétrico |
| 14 | 76-PER26 | Perda de referência de 26 VAC | Elétrico |
| 15 | 76-FALIV | Falha no inversor | Elétrico |
| 16 | 76-N1TQF | Falha nos indicadores N1/Torque | Indicação motor |
| 17 | 76-FALTS | Falha no indicador TS | Indicação motor |
| 18 | S76-UAR-00 | Recuperação de atitudes anormais básica | Segurança / recuperação |

## SK76-I-05/12 — IFR / Navegação Básico

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | S76-CKL-01 | Execução do checklist normal por fase de voo | Pré-partida |
| 2 | 76-PRGGP | Programação do GPS, HSI e EFIS | Preparação IFR |
| 3 | S76-NIF-00 | Procedimentos normais IFR | Preparação IFR |
| 4 | S76-FDA-00 | Uso do diretor de voo e automação | Preparação / decolagem IFR |
| 5 | 76-DECSI | Decolagem por instrumentos / SID | Decolagem IFR |
| 6 | S76-SID-00 | SID & STAR | Saída / chegada IFR |
| 7 | S76-CGI-00 | Controle geral IFR | Enroute IFR |
| 8 | S76-SCN-01 | Varredura instrumental primária e secundária em IFR básico | Enroute IFR |
| 9 | S76-VMA-01 | Voo manual por instrumentos em condição normal | Enroute IFR |
| 10 | S76-UAR-00 | Recuperação de atitudes anormais básica após perda momentânea de referências | Recuperação IFR básica |
| 11 | S76-HLD-00 | Holding pattern | Espera IFR |
| 12 | S76-RNV-00 | Aproximação RNAV/GPS | Aproximação IFR |
| 13 | 76-APXNP | Aproximação de não precisão IFR | Aproximação IFR |
| 14 | 76-APXPR | Aproximação de precisão IFR | Aproximação IFR |
| 15 | S76-ILS-00 | Aproximação ILS | Reaproximação |
| 16 | S76-VOR-00 | Aproximação VOR/NDB | Aproximação IFR |
| 17 | 76-APXPI | Aproximação perdida IFR / procedimento publicado | Missed approach |
| 18 | 76-ARRIF | Arremetida IFR normal | Missed approach |

## SK76-I-06/12 — OEI Decolagem/Aproximação / DECU

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | S76-CKL-02 | Uso do ECL para anormalidade simples | Checklist/ECL |
| 2 | S76-DDE-21 | DECU — falha degradada | Preparação / evento menor |
| 3 | S76-DM1-22 | DECU — falha maior em um motor | Evento progressivo |
| 4 | S76-DMB-24 | DECU — falha maior em ambos os motores | Evento progressivo |
| 5 | 76-MOTHV | Falha de motor em pairado 5 a 10 pés | Hover / evento |
| 6 | 76-MOTCA | Falha de motor na decolagem — Categoria A PRA | Decolagem / evento |
| 7 | 76-MOTCB | Falha de motor na decolagem — Categoria B | Decolagem / evento |
| 8 | 76-POUAB | Pouso abortado / rejected takeoff | Decolagem abortada |
| 9 | S76-CKL-04 | ECL para DECU e falha de motor na decolagem/aproximação | Checklist/ECL |
| 10 | 76-N1TQF | Monitoramento N1/Torque | Monitoramento |
| 11 | S76-XFD-20 | Crossfeed total após falha de motor | Gerenciamento combustível |
| 12 | 76-MOTCZ | Falha de motor durante o cruzeiro | Cruzeiro estabilizado / evento |
| 13 | 76-MOTAP | Falha de motor na aproximação — Categoria A | Aproximação / evento |
| 14 | 76-APXOI | Aproximação IFR com um motor inoperante | Aproximação IFR/OEI |
| 15 | 76-APXAL | Aproximação alternada — Categoria A | Aproximação alternativa |
| 16 | S76-CGI-00 | Controle geral IFR em contexto OEI | Controle / estabilização |
| 17 | S76-UAR-00 | Recuperação de atitudes anormais em contexto OEI | Recuperação |
| 18 | 76-POUMO | Pouso monomotor — Categoria A ou B PEA | Pouso OEI |

## SK76-I-07/12 — Sistemas Específicos

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | 76-FALGC | Falha em um gerador DC — ponte para sessão sistemas | Cruzeiro estabilizado / evento |
| 2 | 76-FALGD | Falha em ambos os geradores DC | Elétrico |
| 3 | 76-SOBGD | Sobretemperatura de gerador DC | Elétrico |
| 4 | 76-FALGA | Falha no gerador AC | Elétrico |
| 5 | 76-FALEB | Falha de alimentação no barramento essencial | Elétrico |
| 6 | 76-FALIV | Falha no inversor | Elétrico |
| 7 | 76-FALFF | Falha de alimentação feeder/bateria | Elétrico / validar |
| 8 | 76-HIDPB | Falha de bomba/perda de pressão servo/hidráulica | Hidráulico / SERVO SYS |
| 9 | 76-SERTQ | Perda de pressão no servo do rotor de cauda | Hidráulico / rotor de cauda |
| 10 | 76-SERJM | Atuador travado ou válvula de corte defeituosa | Hidráulico / servo |
| 11 | 76-AMOTV | Amortecedor dos comandos travado PRB | Comandos |
| 12 | S76-UGR-46 | Indicação insegura — recolhimento do trem | Trem de pouso |
| 13 | S76-LGB-47 | Trem de pouso — extensão de emergência | Trem de pouso |
| 14 | 76-FALAD | Falha no sistema de dados de voo | Instrumentos |
| 15 | 76-PERAT | Perda do indicador primário de atitude em IMC | Instrumentos |
| 16 | 76-FALPA | Falha no piloto automático | Automação |
| 17 | 76-FALFD | Falha no flight director | Automação |
| 18 | 76-N1TQF | Falha nos indicadores N1 ou Torque | Indicação motor |

## SK76-I-08/12 — Rotor / Transmissão / Autorrotação

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | 76-MGBSF | Falhas no sistema da MGB | Cruzeiro / transmissão |
| 2 | 76-MGBOL | Falhas no sistema de óleo da MGB | Transmissão |
| 3 | 76-CHPTG | Chip ou alta temperatura no gearbox | Transmissão |
| 4 | 76-TRSRC | Falha do sistema de transmissão do rotor de cauda | Rotor de cauda |
| 5 | 76-CTRRC | Falha no sistema de controle do rotor de cauda PF | Rotor de cauda |
| 6 | S76-TRH-38 | Falha do rotor de cauda no hover | Hover / evento |
| 7 | S76-TRD-39 | Falha do eixo do rotor de cauda em voo | Voo / evento |
| 8 | S76-TDM-41 | Dano no rotor de cauda | Voo / evento |
| 9 | S76-NRO-00 | Disparo de NR / NR overspeed | Rotor RPM |
| 10 | S76-NRL-00 | Queda de NR / NR low | Rotor RPM |
| 11 | S76-ENE-01 | Controle de energia/RPM em autorrotação | Autorrotação / energia |
| 12 | S76-AUT-70 | Autorrotação em terra | Autorrotação |
| 13 | S76-REC-02 | Recuperação de autorrotação | Recuperação |
| 14 | S76-CKL-05 | Ações de memória e ECL para rotor/transmissão | Checklist/ECL |
| 15 | S76-MRV-00 | Vibração do rotor principal | Rotor / evento |
| 16 | 76-AMOTV | Amortecedor dos comandos travado | Comandos / reforço |
| 17 | S76-MGL-33 | Pressão de Óleo da MGB Baixa | Repetição técnica |
| 18 | S76-MOH-35 | Temperatura de Óleo da MGB Alta | Repetição técnica |

## SK76-I-09/12 — Fogo/Fumaça e Emergências Avançadas

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | 76-INCMO | Incêndio no compartimento do motor | Cruzeiro / evento fogo |
| 2 | S76-FMF-07 | Fogo no compartimento do motor em voo | Fogo em voo |
| 3 | S76-CKL-06 | Ações de memória para fogo/fumaça | Ações imediatas / ECL |
| 4 | S76-FMI-09 | Fogo interno no motor após desligamento | Fogo pós-shutdown motor |
| 5 | S76-FMG-08 | Fogo no compartimento do motor no solo | Solo / fogo |
| 6 | 76-INCCB | Incêndio na cabine ou cockpit | Fogo/fumaça cabine |
| 7 | S76-CCF-10 | Fogo/fumaça na cabine em voo | Fogo/fumaça cabine |
| 8 | 76-FUMBG | Fumaça no compartimento de bagagem | Fumaça / bagagem |
| 9 | S76-EFV-11 | Fogo de origem elétrica em VMC | Fogo elétrico |
| 10 | S76-EFI-12 | Fogo de origem elétrica em IMC | Fogo elétrico/IFR |
| 11 | 76-DUACZ | Falha dupla de motor durante cruzeiro | Falha múltipla controlada |
| 12 | 76-DUADC | Falha dupla de motor durante decolagem | Falha múltipla avançada |
| 13 | 76-DUAHV | Falha dupla de motor em pairado/decolagem | Falha múltipla avançada |
| 14 | 76-FALGD | Falha em ambos os geradores DC | Sistema alto estresse |
| 15 | 76-POUAB | Pouso abortado por fogo/fumaça | Decolagem abortada |
| 16 | 76-POUMO | Pouso monomotor por falha associada | Pouso emergência |
| 17 | 76-APXOI | Aproximação IFR com um motor inoperante | Aproximação OEI/IFR |
| 18 | 76-APXAL | Aproximação alternada — Categoria A | Aproximação alternativa |

## SK76-I-10/12 — Offshore / Unidade Marítima

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | S76-CKL-07 | Checklist e ECL específico para operação offshore | Preparação offshore |
| 2 | S76-TDP-00 | Decolagem Classe 2 — helideck (TDP) | Decolagem offshore |
| 3 | 76-MOTCZ | Falha de motor em cruzeiro no contexto offshore | Rota offshore / evento |
| 4 | 76-FALPA | Falha no piloto automático em contexto offshore | Rota offshore / evento |
| 5 | 76-FALFD | Falha no flight director | Rota offshore / evento |
| 6 | 76-PERAT | Perda do indicador primário de atitude em IMC | Rota offshore / IFR |
| 7 | 76-FALAD | Falha no sistema de dados de voo | Rota offshore / IFR |
| 8 | S76-APO-01 | Aproximação offshore a Unidade Marítima | Aproximação offshore |
| 9 | 76-MOTAP | Falha de motor na aproximação offshore | Aproximação offshore / evento |
| 10 | 76-APXOI | Aproximação IFR com um motor inoperante | Aproximação OEI/IFR |
| 11 | 76-POUMO | Pouso monomotor em contexto offshore | Pouso emergência |
| 12 | S76-ARO-01 | Arremetida offshore | Arremetida offshore |
| 13 | 76-POUAB | Pouso abortado / decolagem rejeitada offshore | Decolagem offshore / evento |
| 14 | S76-LDP-00 | Pouso Classe 2 — Helideck (Committal Point) | Aproximação offshore |
| 15 | 76-APXAL | Aproximação alternada — Categoria A | Aproximação alternativa |
| 16 | 76-AUTAG | Autorrotação para a água | Ditching / água |
| 17 | S76-DIT-71 | Ditching com potência | Ditching |
| 18 | S76-FLU-01 | Flutuabilidade e evacuação aquática | Pós-ditching |

## SK76-I-11/12 — LOFT

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | LOFT-CHK-01 | Performance e cálculos de decolagem IFR | Planejamento missão |
| 2 | LOFT-CHK-02 | Planejamento IFR, mínimos e alternado | Planejamento missão |
| 3 | LOFT-CHK-03 | Configuração completa do FMS | Preparação cockpit |
| 4 | LOFT-CHK-05 | Inspeção, acionamento e checklists | Pré-voo / partida |
| 5 | LOFT-CHK-06 | Hover check e taxi IFR | Taxi / hover |
| 6 | LOFT-CHK-07 | Decolagem IFR — perfil CAT A em IMC | Decolagem IFR |
| 7 | LOFT-CHK-08 | OEI pós-TDP — fly-away monomotor IFR | Decolagem / evento |
| 8 | LOFT-CHK-09 | Navegação IFR en route e gestão de FMS | Enroute |
| 9 | LOFT-CHK-10 | Monitoramento de sistemas e path monitoring | Enroute / monitoramento |
| 10 | LOFT-CHK-11 | Gestão de falha de sistema em rota | Enroute / evento |
| 11 | LOFT-CHK-23 | Painel limitado / falha de instrumentos IFR | Evento em rota/aproximação |
| 12 | LOFT-CHK-12 | Chegada STAR/RNAV e descida | Chegada/descida |
| 13 | LOFT-CHK-13 | Procedimento de espera IFR | Espera |
| 14 | LOFT-CHK-14 | Aproximação não precisão — RNAV ou VOR | Aproximação IFR |
| 15 | LOFT-CHK-15 | Arremetida por abaixo dos mínimos (NPA) | Missed approach |
| 16 | LOFT-CHK-17 | Setup para ILS | Reaproximação |
| 17 | LOFT-CHK-18 | Aproximação ILS — final e decisão na DA | Aproximação IFR |
| 18 | LOFT-CHK-19 | Pouso no alternado e procedimentos pós-voo | Pouso / pós-voo |

## SK76-I-12/12 — LOFT Check

> Mesma sequência do LOFT, avaliativa, sem conteúdo novo.

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | LOFT-CHK-01 | Performance e cálculos de decolagem IFR | Planejamento missão |
| 2 | LOFT-CHK-02 | Planejamento IFR, mínimos e alternado | Planejamento missão |
| 3 | LOFT-CHK-03 | Configuração completa do FMS | Preparação cockpit |
| 4 | LOFT-CHK-05 | Inspeção, acionamento e checklists | Pré-voo / partida |
| 5 | LOFT-CHK-06 | Hover check e taxi IFR | Taxi / hover |
| 6 | LOFT-CHK-07 | Decolagem IFR — perfil CAT A em IMC | Decolagem IFR |
| 7 | LOFT-CHK-08 | OEI pós-TDP — fly-away monomotor IFR | Decolagem / evento |
| 8 | LOFT-CHK-09 | Navegação IFR en route e gestão de FMS | Enroute |
| 9 | LOFT-CHK-10 | Monitoramento de sistemas e path monitoring | Enroute / monitoramento |
| 10 | LOFT-CHK-11 | Gestão de falha de sistema em rota | Enroute / evento |
| 11 | LOFT-CHK-23 | Painel limitado / falha de instrumentos IFR | Evento em rota/aproximação |
| 12 | LOFT-CHK-12 | Chegada STAR/RNAV e descida | Chegada/descida |
| 13 | LOFT-CHK-13 | Procedimento de espera IFR | Espera |
| 14 | LOFT-CHK-14 | Aproximação não precisão — RNAV ou VOR | Aproximação IFR |
| 15 | LOFT-CHK-15 | Arremetida por abaixo dos mínimos (NPA) | Missed approach |
| 16 | LOFT-CHK-17 | Setup para ILS | Reaproximação |
| 17 | LOFT-CHK-18 | Aproximação ILS — final e decisão na DA | Aproximação IFR |
| 18 | LOFT-CHK-19 | Pouso no alternado e procedimentos pós-voo | Pouso / pós-voo |

---

# 8. SK76/S76 — Treinamento Periódico

## S76-P-01/04-C1 — Ciclo 1 / VFR-emergências

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | S76-NVF-00 | Procedimentos Normais VFR | Normal |
| 2 | S76-HOT-00 | Partida Quente (Hot Start) | Partida |
| 3 | S76-STF-00 | Falha na Partida (Engine Start Failure) | Partida |
| 4 | S76-FMG-08 | Fogo no Compartimento do Motor no Solo | Solo / fogo |
| 5 | S76-FMI-09 | Fogo Interno no Motor após Desligamento | Pós-shutdown |
| 6 | S76-HOV-00 | Controle Geral VFR — Hover & Taxi | Hover / taxi |
| 7 | S76-TRH-38 | Falha do Rotor de Cauda no Hover | Hover / evento |
| 8 | S76-TDP-00 | Decolagem Classe 2 — Helideck (TDP) | Decolagem offshore |
| 9 | S76-FMA-14 | Falha de Motor — Decolagem Abortada | Decolagem / evento |
| 10 | S76-FMC-15 | Falha de Motor — Decolagem Continuada | Decolagem / evento |
| 11 | S76-NRO-00 | Disparo de NR (NR Overspeed) | Rotor RPM |
| 12 | S76-NRL-00 | Queda de NR (NR Low) | Rotor RPM |
| 13 | S76-CST-00 | Estol de Compressor | Motor |
| 14 | S76-MRV-00 | Vibração do Rotor Principal | Rotor |
| 15 | S76-MGP-33 | Pressão de Óleo da MGB 40-45 PSI | MGB |
| 16 | S76-SSS-42 | Servo SYS — luz do sistema servo simples | Servo |
| 17 | S76-FFL-32 | Luz de Cautela do Filtro de Combustível | Combustível |
| 18 | S76-FFM-32 | Fluxo de Combustível fora do Normal — decisão de retorno e encerramento | Combustível / decisão operacional |

## S76-P-02/04-C1 — Ciclo 1 / IFR-emergências

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | S76-NIF-00 | Procedimentos Normais IFR | IFR normal |
| 2 | S76-FDA-00 | Uso do Diretor de Voo e Automação | Automação |
| 3 | S76-CGI-00 | Controle Geral IFR | IFR básico |
| 4 | S76-SID-00 | SID & STAR | Saída/chegada |
| 5 | S76-FCR-17 | Falha de Motor em Cruzeiro | Enroute / motor |
| 6 | S76-DMN-21 | DECU — Falha Menor | DECU |
| 7 | S76-DM1-22 | DECU — Falha Maior — Um Motor | DECU |
| 8 | S76-N1T-30 | Mau funcionamento do indicador de N1 ou Torque | Indicação motor |
| 9 | S76-EOP-25 | Pressão de Óleo do Motor — Luz de Aviso | Motor / óleo |
| 10 | S76-SDC-50 | Luz de Cautela de Gerador CC Simples | Elétrico |
| 11 | S76-APF-57 | Falha do Piloto Automático — Dual/Simples | AFCS |
| 12 | S76-TRM-58 | Falha do Trim (Trim Fail Caution) | AFCS |
| 13 | S76-FDF-60 | Falha do Diretor de Voo / FD Coupler | FD |
| 14 | S76-AHR-65 | Falha do AHRS | AHRS |
| 15 | S76-HLD-00 | Holding Pattern | Espera |
| 16 | S76-EFV-11 | Fogo de Origem Elétrica — VMC (Breakout) | Fogo elétrico |
| 17 | S76-ILS-00 | Aproximação ILS | Aproximação |
| 18 | S76-MIS-00 | Arremetida (Missed Approach) | Missed approach |

## SK76-P-CHECK — LOFT/check

> Substituir a família isolada `S76-LOFT-*` pela família `LOFT-CHK-*`, já treinada nas sessões LOFT. Essa é decisão de implantação, não apenas recomendação.

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | LOFT-CHK-01 | Performance e cálculos de decolagem IFR | Planejamento missão |
| 2 | LOFT-CHK-02 | Planejamento IFR, mínimos e alternado | Planejamento missão |
| 3 | LOFT-CHK-03 | Configuração completa do FMS | Preparação cockpit |
| 4 | LOFT-CHK-05 | Inspeção, acionamento e checklists | Pré-voo / partida |
| 5 | LOFT-CHK-06 | Hover check e taxi IFR | Taxi / hover |
| 6 | LOFT-CHK-07 | Decolagem IFR — perfil CAT A em IMC | Decolagem IFR |
| 7 | LOFT-CHK-08 | OEI pós-TDP — fly-away monomotor IFR | Decolagem / evento |
| 8 | LOFT-CHK-09 | Navegação IFR en route e gestão de FMS | Enroute |
| 9 | LOFT-CHK-10 | Monitoramento de sistemas e path monitoring | Enroute / monitoramento |
| 10 | LOFT-CHK-11 | Gestão de falha de sistema em rota | Enroute / evento |
| 11 | LOFT-CHK-23 | Painel limitado / falha de instrumentos IFR | Evento em rota/aproximação |
| 12 | LOFT-CHK-12 | Chegada STAR/RNAV e descida | Chegada/descida |
| 13 | LOFT-CHK-13 | Procedimento de espera IFR | Espera |
| 14 | LOFT-CHK-14 | Aproximação não precisão — RNAV ou VOR | Aproximação IFR |
| 15 | LOFT-CHK-15 | Arremetida por abaixo dos mínimos (NPA) | Missed approach |
| 16 | LOFT-CHK-17 | Setup para ILS | Reaproximação |
| 17 | LOFT-CHK-18 | Aproximação ILS — final e decisão na DA | Aproximação IFR |
| 18 | LOFT-CHK-19 | Pouso no alternado e procedimentos pós-voo | Pouso / pós-voo |

## S76-P-01/04-C2 — Ciclo 2 / VFR-emergências

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | S76-NVF-00 | Procedimentos Normais VFR | Normal |
| 2 | S76-HNG-00 | Partida Estagnada (Hung Start) | Partida |
| 3 | S76-HOV-00 | Controle Geral VFR — Hover & Taxi | Hover / taxi |
| 4 | S76-TDP-00 | Decolagem Classe 2 — Helideck (TDP) | Decolagem offshore |
| 5 | S76-OSP-27 | Falha da Proteção contra Overspeed | Motor |
| 6 | S76-FMF-07 | Fogo no Compartimento do Motor em Voo | Fogo motor |
| 7 | S76-XFD-20 | Crossfeed Total após Falha de Motor | Combustível |
| 8 | S76-FPL-31 | Luz de Aviso de Pressão de Combustível | Combustível |
| 9 | S76-LOW-32 | Luz de Cautela Fuel Low | Combustível |
| 10 | S76-MGL-33 | Pressão de Óleo da MGB Baixa | MGB |
| 11 | S76-MGC-36 | Luz de Cautela de Chip da MGB | MGB |
| 12 | S76-TRD-39 | Falha do Eixo do Rotor de Cauda em Voo | Rotor de cauda |
| 13 | S76-SS2-43 | Servo SYS — luzes dos sistemas servo 1 e 2 | Servo |
| 14 | S76-CLB-69 | Emperramento do Comando de Passo Coletivo | Comandos |
| 15 | S76-UGR-46 | Indicação Insegura — Recolhimento do Trem | Trem |
| 16 | S76-LGB-47 | Trem de Pouso — Extensão de Emergência | Trem |
| 17 | S76-AUT-70 | Autorrotação | Autorrotação |
| 18 | S76-DIT-71 | Ditching com Potência | Ditching |

## S76-P-02/04-C2 — Ciclo 2 / IFR-emergências

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | S76-NIF-00 | Procedimentos Normais IFR | IFR normal |
| 2 | S76-FDA-00 | Uso do Diretor de Voo e Automação | Automação |
| 3 | S76-CGI-00 | Controle Geral IFR | IFR básico |
| 4 | S76-SID-00 | SID & STAR | Saída/chegada |
| 5 | S76-FCR-17 | Falha de Motor em Cruzeiro | Motor |
| 6 | S76-ECO-20 | Oscilação do Motor | Motor |
| 7 | S76-DDE-21 | DECU — Falha Degradada | DECU |
| 8 | S76-ECH-26 | Detector de Chip do Motor | Motor |
| 9 | S76-T5I-31 | Mau Funcionamento do Indicador de T5 | Indicação motor |
| 10 | S76-DCD-50 | Luzes de Cautela dos Geradores CC 1 e 2 | Elétrico |
| 11 | S76-BTO-53 | Luz de Cautela Bus Tie Open | Elétrico |
| 12 | S76-CDC-59 | Cautela de Coletivo / Decouple | Comandos |
| 13 | S76-ADC-61 | Falha do ADC Computador de Dados de Voo | Air data |
| 14 | S76-CRT-63 | Falha da Tela CRT / Falha Total do EFIS | Displays |
| 15 | S76-EFI-12 | Fogo de Origem Elétrica IMC | Fogo elétrico |
| 16 | S76-HLD-00 | Holding Pattern | Espera |
| 17 | S76-WSH-54 | Luz de Cautela Windshield Hot | Windshield |
| 18 | S76-RNV-00 | Aproximação RNAV (GPS) | Aproximação |

## S76-P-01/04-C3 — Ciclo 3 / VFR-emergências

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | S76-NVF-00 | Procedimentos Normais VFR | Normal |
| 2 | S76-FGF-29 | Falha no Fly Gate — Antes da Partida | Partida / sistema |
| 3 | S76-WCP-73 | Painel de Avisos e Cautelas (Análise) | Preparação / cautelas |
| 4 | S76-HOV-00 | Controle Geral VFR — Hover & Taxi | Hover / taxi |
| 5 | S76-TDP-00 | Decolagem Classe 2 — Helideck (TDP) | Decolagem offshore |
| 6 | S76-BFL-28 | Luz do Filtro de Barreira | Sistema |
| 7 | S76-PAL-30 | Luz Power Assurance | Motor / potência |
| 8 | S76-SFE-10 | Eliminação de Fumaça e Vapores | Fumaça |
| 9 | S76-BCS-10 | Fumaça no Compartimento de Bagagem | Fumaça |
| 10 | S76-ESF-18 | Desligamento de Motor em Voo | Motor |
| 11 | S76-ERF-18 | Religamento de Motor em Voo | Motor |
| 12 | S76-EOT-25 | Temperatura de Óleo do Motor acima do Limite | Motor / óleo |
| 13 | S76-OFL-30 | Luz Out of Fly | Motor / controle |
| 14 | S76-MOH-35 | Temperatura de Óleo da MGB Alta | MGB |
| 15 | S76-IGB-37 | Luz de Cautela de Chip / Temperatura | Gearbox |
| 16 | S76-TCS-39 | Falha do Sistema de Controle do Rotor de Cauda | Rotor de cauda |
| 17 | S76-TDM-41 | Dano no Rotor de Cauda | Rotor de cauda |
| 18 | S76-FCD-67 | Emperramento do Amortecedor de Comando | Comandos |

## S76-P-02/04-C3 — Ciclo 3 / IFR-emergências

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | S76-NIF-00 | Procedimentos Normais IFR | IFR normal |
| 2 | S76-FDA-00 | Uso do Diretor de Voo e Automação | Automação |
| 3 | S76-CGI-00 | Controle Geral IFR | IFR básico |
| 4 | S76-SID-00 | SID & STAR | Saída/chegada |
| 5 | S76-FCR-17 | Falha de Motor em Cruzeiro | Motor |
| 6 | S76-CCF-10 | Fogo / Fumaça na Cabine em Voo | Fumaça |
| 7 | S76-DMB-24 | DECU — Falha Maior — Ambos os Motores | DECU |
| 8 | S76-AGB-48 | Luz de Cautela de Rolamento do Gerador CA | Elétrico |
| 9 | S76-EBV-54 | Luz de Cautela Ess Bus Volts Low | Elétrico |
| 10 | S76-EAI-55 | Luz de Cautela Engine Anti-Ice | Anti-ice |
| 11 | S76-HOM-59 | Mau Funcionamento de Hardover / Oscilatório | AFCS / controle |
| 12 | S76-MBF-61 | Falha do Freio Magnético — Cíclico / Coletivo | Comandos |
| 13 | S76-IID-62 | Falha do Display IIDS | Display |
| 14 | S76-SGA-62 | Falha do Gerador de Símbolo / ADC | Display / ADC |
| 15 | S76-CFC-63 | Falha do Ventilador CRT / Discrepância | Display |
| 16 | S76-UAR-00 | Recuperação Atitudes Anormais | Recuperação |
| 17 | S76-ILS-00 | Aproximação ILS | Aproximação |
| 18 | S76-MIS-00 | Arremetida (Missed Approach) | Missed approach |

---

# 8C. SK76/S76 — Noturno, Reaquisição e Semestral (Decisão 15)

> Incorporados ao target 51 pela Decisão 15 (§4). Sequências preservadas do snapshot operacional (`docs/MODELOS_SESSAO_MANOBRAS.md`), reusando códigos já existentes no catálogo. Ver §4 decisões 15–17 para as correções aplicadas.

## S76-NOT-01 — Treinamento Noturno Onshore

> **Correção pedagógica aplicada:** `OPS-NOT-X1` foi criado como código atual rastreável para ilusão visual noturna / black hole effect, evitando reativar `S76-LOFT-23`/`S76-LOFT-33`.

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | S76-CKL-01 | Checklist e preparação noturna | Pré-voo / checklist |
| 2 | S76-NVF-00 | Procedimentos Normais VFR | Normal / cruzeiro |
| 3 | S76-HOV-00 | Controle Geral VFR — Hover e Táxi | Hover / taxi |
| 4 | S76-DNR-01 | Decolagem normal noturna | Decolagem |
| 5 | S76-SUB-01 | Subida controlada noturna | Subida |
| 6 | S76-NDL-00 | Voo Noturno NDL (Circuito Padrão) | Circuito noturno |
| 7 | OPS-NOT-X1 | Ilusão visual noturna / black hole effect — reconhecimento, correção e recuperação | Segurança noturna |
| 8 | 76-FALGC | Falha em um gerador DC | Elétrico |
| 9 | 76-FALFF | Falha de alimentação — feeder / bateria no nariz | Elétrico |
| 10 | 76-FLWNR | Vazão de combustível fora da faixa normal | Combustível |
| 11 | 76-MOTCZ | Falha de motor durante o cruzeiro | Motor |
| 12 | S76-CKL-03 | Aplicação do ECL para falha de motor | QRH / ECL |
| 13 | S76-OEI-01 | Perfil OEI noturno | Perfil OEI |
| 14 | S76-APN-01 | Aproximação normal visual noturna | Aproximação |
| 15 | S76-ARN-01 | Arremetida noturna | Arremetida |
| 16 | S76-AUT-70 | Autorotação | Autorrotação |
| 17 | S76-PNO-01 | Pouso normal noturno | Pouso |
| 18 | S76-EST-01 | Encerramento pós-voo noturno | Pós-pouso |

## S76-NOT-02 — Treinamento Noturno Offshore

> Corrigido pela decisão 17 (§4): `S76-EST-01` removido do fim por conflitar com o terminal único `S76-FLU-01`; `76-FALFF` inserido (já usado em `S76-NOT-01`) para preservar 18 itens sem novo código.
> **Correção pedagógica aplicada:** `OPS-NOT-X1` foi criado como código atual rastreável para ilusão visual noturna / black hole effect, evitando reativar `S76-LOFT-23`/`S76-LOFT-33`.

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | S76-CKL-01 | Checklist e preparação noturna | Pré-voo / checklist |
| 2 | S76-TDP-00 | Decolagem Classe 2 — Helideck (TDP) | Decolagem offshore |
| 3 | S76-HOV-00 | Controle Geral VFR — Hover e Táxi | Hover / taxi |
| 4 | S76-NVF-00 | Procedimentos Normais VFR | Normal / cruzeiro |
| 5 | S76-PWR-01 | Controle de potência e torque | Cruzeiro / perfil |
| 6 | OPS-NOT-X1 | Ilusão visual noturna / black hole effect — reconhecimento, correção e recuperação | Segurança noturna |
| 7 | 76-FLWNR | Vazão de combustível fora da faixa normal | Combustível |
| 8 | 76-MOTCZ | Falha de motor durante o cruzeiro | Motor |
| 9 | S76-CKL-03 | Aplicação do ECL para falha de motor | QRH / ECL |
| 10 | S76-OEI-01 | Perfil OEI noturno | Perfil OEI |
| 11 | S76-XFD-20 | Crossfeed Total após Falha de Motor | Combustível / motor |
| 12 | 76-FALGC | Falha em um gerador DC | Elétrico |
| 13 | S76-LDP-00 | Pouso Classe 2 — Helideck (Committal Point) | Aproximação / pouso offshore |
| 14 | S76-APO-01 | Aproximação offshore a Unidade Marítima | Aproximação offshore |
| 15 | S76-ARO-01 | Arremetida offshore | Arremetida |
| 16 | 76-AUTAG | Autorrotação para a água | Autorrotação / água |
| 17 | S76-DIT-71 | Ditching com Potência | Ditching |
| 18 | S76-FLU-01 | Flutuabilidade e evacuação aquática | Ditching / encerramento |

## S76-REQ-01 — Reaquisição de Experiência Recente

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | S76-CKL-01 | Checklist e preparação operacional | Pré-voo / checklist |
| 2 | S76-NVF-00 | Procedimentos Normais VFR | Normal / cruzeiro |
| 3 | S76-HOV-00 | Controle Geral VFR — Hover e Táxi | Hover / taxi |
| 4 | S76-DNR-01 | Decolagem normal | Decolagem |
| 5 | S76-SUB-01 | Subida controlada | Subida |
| 6 | S76-PWR-01 | Controle de potência e torque | Cruzeiro / perfil |
| 7 | S76-CRV-01 | Curvas e controle de atitude | Manobras visuais |
| 8 | S76-APN-01 | Aproximação normal visual | Aproximação |
| 9 | S76-PNO-01 | Pouso normal | Pouso |
| 10 | S76-ARN-01 | Arremetida | Arremetida |
| 11 | S76-TDP-00 | Decolagem Classe 2 — Helideck (TDP) | Decolagem offshore |
| 12 | S76-NDT-00 | Decolagem noturna | Decolagem noturna |
| 13 | S76-ILS-00 | Aproximação ILS | Aproximação IFR |
| 14 | S76-RNV-00 | Aproximação RNAV (GPS) | Aproximação IFR |
| 15 | 76-MOTCZ | Falha de motor durante o cruzeiro | Motor |
| 16 | S76-XFD-20 | Crossfeed Total após Falha de Motor | Combustível / motor |
| 17 | S76-AUT-70 | Autorotação | Autorrotação |
| 18 | S76-EST-01 | Encerramento pós-voo | Pós-pouso |

## SK76-S-01/02 — Semestral 01/02: LOFT e Operação Noturna

> **Enquadramento LOFT:** esta sessão deve ser conduzida como cenário operacional contínuo, não como execução isolada de manobras. As 18 técnicas abaixo são os pontos avaliáveis do cenário. NOTECHS permanecem fora da lista técnica.
> **Tipo de cenário:** LOFT semestral.
> **Objetivo da sessão:** verificar a manutenção da proficiência noturna SK76 em cenário contínuo, com panes progressivas, gerenciamento OEI e retorno seguro à base.
> **Narrativa operacional:** a tripulação decola à noite para missão local, estabiliza o perfil visual, recebe falhas elétricas e depois falha de motor em cruzeiro, conduz o perfil OEI, voa uma sequência de aproximações e encerra com pouso e pós-voo.
> **Ponto de partida:** checklist, hover/taxi, decolagem e subida noturna para circuito/missão curta.
> **Evento principal:** falha de motor durante o cruzeiro noturno, com necessidade de gerenciamento de combustível e condução OEI.
> **Evento secundário:** degradações elétricas anteriores ao evento principal, exigindo monitoramento, QRH implícito e priorização da automação básica.
> **Decisão operacional esperada:** replanejar a recuperação noturna, administrar o perfil OEI, selecionar a melhor aproximação e concluir o pouso com encerramento formal da sessão.
> **Critério de encerramento:** pouso normal após a sequência de recuperação e estacionamento pós-voo.
> **Observação técnica:** as 18 linhas abaixo são itens técnicos avaliáveis dentro do cenário LOFT; a condução continua sendo por cenário, não por manobras soltas.
> **Observação NOTECHS:** NOTECHS são avaliados fora das 18 técnicas, pelo mecanismo global da matriz.

> **Correção pedagógica aplicada:** `OPS-NOT-X1` foi criado como código atual rastreável para ilusão visual noturna / black hole effect, evitando reativar `S76-LOFT-23`/`S76-LOFT-33`.

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | S76-CKL-01 | Checklist e preparação noturna | Pré-voo / checklist |
| 2 | S76-NVF-00 | Procedimentos Normais VFR | Normal / cruzeiro |
| 3 | S76-HOV-00 | Controle Geral VFR — Hover e Táxi | Hover / taxi |
| 4 | S76-DNR-01 | Decolagem normal noturna | Decolagem |
| 5 | S76-SUB-01 | Subida controlada noturna | Subida |
| 6 | S76-PWR-01 | Controle de potência e torque | Cruzeiro / perfil |
| 7 | S76-NDL-00 | Voo Noturno NDL (Circuito Padrão) | Circuito noturno |
| 8 | OPS-NOT-X1 | Ilusão visual noturna / black hole effect — reconhecimento, correção e recuperação | Segurança noturna |
| 9 | 76-FALGC | Falha em um gerador DC | Elétrico |
| 10 | 76-FALFF | Falha de alimentação — feeder / bateria no nariz | Elétrico |
| 11 | 76-MOTCZ | Falha de motor durante o cruzeiro | Motor |
| 12 | S76-XFD-20 | Crossfeed Total após Falha de Motor | Combustível / motor |
| 13 | S76-OEI-01 | Perfil OEI noturno | Perfil OEI |
| 14 | S76-ILS-00 | Aproximação ILS | Aproximação IFR |
| 15 | S76-ARN-01 | Arremetida noturna | Arremetida |
| 16 | S76-APN-01 | Aproximação normal visual noturna | Aproximação |
| 17 | S76-PNO-01 | Pouso normal noturno | Pouso |
| 18 | S76-EST-01 | Encerramento pós-voo noturno | Pós-pouso |

## SK76-S-02/02 — Semestral 02/02: LOFT e Check de IFR

> **Enquadramento LOFT:** esta sessão deve ser conduzida como cenário operacional contínuo, não como execução isolada de manobras. As 18 técnicas abaixo são os pontos avaliáveis do cenário. NOTECHS permanecem fora da lista técnica.
> **Tipo de cenário:** LOFT semestral.
> **Objetivo da sessão:** avaliar a proficiência IFR SK76 em cenário contínuo de linha, com anormais progressivas e encerramento formal da missão sem introdução de conteúdo novo.
> **Narrativa operacional:** a tripulação inicia uma missão IFR semestral, conduz a navegação e os briefings, absorve cautions de transmissão, combustível e rotor, administra falha de motor e extensão de trem de emergência, executa arremetida e conclui a recuperação com pouso e pós-voo.
> **Ponto de partida:** preparação IFR, briefing, partida e entrada na rota publicada.
> **Evento principal:** falha de motor em cruzeiro com necessidade de crossfeed, gerenciamento de energia e decisão de continuidade da sequência avaliativa para pouso seguro.
> **Evento secundário:** degradações de transmissão, combustível, rotor e trem de pouso, tratadas dentro do cenário sem descaracterizar o objetivo avaliativo IFR.
> **Decisão operacional esperada:** manter disciplina IFR e padrão de avaliação, escolher a melhor aproximação final, tratar a extensão de trem de emergência e encerrar a sessão com pouso e corte pós-voo.
> **Critério de encerramento:** pouso após arremetida e reaproximação, seguido de encerramento pós-voo.
> **Observação técnica:** as 18 linhas abaixo são itens técnicos avaliáveis dentro do cenário LOFT; a condução continua sendo por cenário, não por manobras soltas.
> **Observação NOTECHS:** NOTECHS são avaliados fora das 18 técnicas, pelo mecanismo global da matriz.
> Sessão avaliativa (`carater=avaliativo` em metadados internos; não exibir na ficha final). Corrigido pela decisão 16 (§4): `S76-LGE-44` substituído por `S76-LGB-47` (código já existente, já usado em `S76-P-01/04-C2`).

| # | Código | Item técnico | Fase |
|---:|---|---|---|
| 1 | S76-CKL-01 | Checklist e preparação IFR | Pré-voo / checklist |
| 2 | S76-NIF-00 | Procedimentos Normais IFR | IFR básico |
| 3 | S76-CKL-02 | Aplicação de checklist anormal | QRH / checklist |
| 4 | S76-MGP-33 | Pressão de Óleo da MGB 40–45 PSI | Transmissão |
| 5 | S76-FFL-32 | Luz de Cautela do Filtro de Combustível | Combustível |
| 6 | S76-FFM-32 | Fluxo de Combustível fora do Normal | Combustível |
| 7 | 76-MOTCZ | Falha de motor durante o cruzeiro | Motor |
| 8 | S76-XFD-20 | Crossfeed Total após Falha de Motor | Combustível / motor |
| 9 | S76-NRO-00 | Disparo de NR (NR Overspeed) | Rotor RPM |
| 10 | S76-NRL-00 | Queda de NR (NR Low) | Rotor RPM |
| 11 | S76-CST-00 | Estol de Compressor (Compressor Stall) | Motor |
| 12 | S76-ILS-00 | Aproximação ILS | Aproximação IFR |
| 13 | S76-ARN-01 | Arremetida IFR | Arremetida |
| 14 | S76-RNV-00 | Aproximação RNAV (GPS) | Reaproximação IFR |
| 15 | S76-VOR-00 | Aproximação VOR/NDB | Aproximação final |
| 16 | S76-LGB-47 | Trem de Pouso — Extensão de Emergência | Trem / pouso |
| 17 | S76-PNO-01 | Pouso normal | Pouso |
| 18 | S76-EST-01 | Encerramento pós-voo | Pós-pouso |

---

# 9. Sessões fora dos PDFs enviados (histórico — superado pela Decisão 15)

Os PDFs enviados declaravam que fichas fora do pacote — noturno, semestral, reaquisição, instrutor/examinador/credenciamento — deveriam permanecer preservadas nesta implantação. Essa era a regra vigente enquanto o target era `41`.

A decisão 12 (§4) já havia revertido essa regra para `TRE-INST`/`CRED-EXA`. A decisão 15 (§4) estende a mesma reversão aos 10 modelos restantes (noturno AW139/SK76, reaquisição AW139/SK76, semestral 01/02 e 02/02 AW139/SK76), que agora estão explicitamente listados nas §§6C e 8C. O princípio de fundo continua o mesmo:

- Não alterar fichas, sessões já criadas, avaliações, notas, assinaturas ou histórico.
- Não inventar código novo se um código equivalente já existir no catálogo.
- Se o loader contiver modelos adicionais além dos listados neste documento (isto é, além dos 51 do catálogo operacional), bloquear alteração desses modelos e reportar.
- Só aplicar alterações a modelos explicitamente listados neste documento.

# 10. Guardrails obrigatórios para implementação

Adicionar/ajustar testes para garantir:

1. Cada sessão listada tem exatamente 18 técnicas.
2. Cada sessão recebe os 15 NOTECHS fora das 18 técnicas.
3. Nenhum item de voo aparece depois de `EST`, `pós-voo`, `corte`, `ditching` ou `evacuação`.
4. `LOFT-CHK-23` aparece antes de `LOFT-CHK-19` em todas as sequências LOFT/Check.
5. `SK76-P-CHECK` usa `LOFT-CHK-*`, não `S76-LOFT-*`.
6. `SK76-I-10/12` termina em `S76-FLU-01`.
7. `A139-I-01/12` termina em `A139-EST-01` e `FLY-BAS-X4` aparece antes do pouso.
8. `A139-I-06/12` não contém `A139-OEI-01` depois de `A139-POU-01`.
9. `A139-I-10/12` não termina com `CAU-HOT-65`.
10. Nenhum código novo com página/revisão de manual no código.
11. Nenhuma descrição final contém metadados internos: `tipo_item`, `fase_voo`, `carater`, `matriz_v6_modelo`, `V4.1`, `renomeado`, `validar se fica`.
12. Nenhuma normalização `76-*` → `S76-*` é aplicada sem alias/compatibilidade documentada.
13. `target_models` é exatamente `51` e o total de linhas técnicas é exatamente `918` (`51 × 18`).
14. `A139-NOT-01`, `A139-NOT-02`, `A139-REQ-01`, `A139-S-01/02`, `A139-S-02/02`, `S76-NOT-01`, `S76-NOT-02`, `S76-REQ-01`, `SK76-S-01/02` e `SK76-S-02/02` estão presentes no `target_models`, cada um com `18` técnicas distintas.
15. `SK76-S-02/02` usa `S76-LGB-47` e não usa `S76-LGE-44`.
16. `S76-NOT-02` termina em `S76-FLU-01` e não contém `S76-EST-01`.
17. Toda sessão com `LOFT` no nome tem evidência LOFT válida por código aceito (`LOFT-CHK-*`, `LOFT-OFF-*`, `LOFT-NOT-*`) ou por bloco estruturado `Enquadramento LOFT` no documento-fonte.
18. A matriz de aceite não pode marcar `nome compatível com conteúdo = sim` para sessão LOFT sem registrar o achado, a decisão do owner e a ação corretiva de enquadramento estruturado.

# 11. Prompt para implantação

```text
Modelo recomendado: Codex 5.4 médio
Esforço: alto
Alternativa: DeepSeek v4 Pro, esforço alto
Não usar Fable 5
Não aplicar produção

Você é o agente responsável por implementar a Matriz V6.2 final de manobras por sessão conforme o arquivo:
`airtrust_matriz_v6_2_todas_sessoes_manobras_final.md`.

Objetivo:
Atualizar o loader/código-fonte da matriz para refletir exatamente as 18 manobras técnicas por sessão definidas no documento, preservando 15 NOTECHS fora das 18 técnicas.

Regras absolutas:
- Não tocar produção.
- Não executar DML remoto.
- Não rodar migration remota.
- Não tocar D1 produção.
- Não fazer deploy.
- Não tocar Qualificações.
- Não tocar RBAC/auth/multi-tenant.
- Não tocar LMS/SCORM.
- Incluir TRE-INST/CRED-EXA no mesmo padrão `18 técnicas + 15 NOTECHS`, sem misturar NOTECHS nas 18 técnicas.
- Não commitar PDFs de preview.
- Não aplicar normalização de código 76-* → S76-* sem alias/compatibilidade.
- Não inventar nova manobra se o código já existir.
- Não colocar página/revisão de manual no código.

Tarefas:
1. Localizar o loader da Matriz V6 e a fonte das relações modelo-manobra.
2. Atualizar todas as sessões listadas no documento.
3. Reusar manobras existentes sempre que possível.
4. Se uma manobra exigida não existir, criar apenas se for inevitável e com justificativa.
5. Preencher/ajustar `referencias_json` quando houver FAP/RIPEA/manual conhecido.
6. Não expor metadados internos na ficha final.
7. Adicionar guardrails do §10.
8. Rodar dry-run local.
9. Confirmar contagens esperadas.
10. Abrir PR sem produção.

Validações obrigatórias:
- `npm run lint`
- `npx tsc --noEmit`
- testes V6/simuladores/matriz
- dry-run local do apply
- confirmação de 18 técnicas por sessão + 15 NOTECHS

Relatório final:
- sessões alteradas;
- códigos criados/reusados;
- códigos legados preservados;
- guardrails adicionados;
- dry-run;
- testes;
- confirmação sem produção;
- GO/NO-GO para revisão humana.
```
