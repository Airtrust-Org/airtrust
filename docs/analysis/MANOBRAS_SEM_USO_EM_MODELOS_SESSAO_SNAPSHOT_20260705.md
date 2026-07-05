# Manobras Sem Uso Em Modelos de Sessao

Base usada: `artifacts/db-backups/v6.2-apply-20260705T041721Z`

Arquivos comparados:
- `manobras.json`
- `modelos_sessao.json`
- `modelos_sessao_manobras.json`

Critério:
- considerar apenas `manobras.deleted_at IS NULL`
- considerar apenas relacoes `modelos_sessao_manobras.deleted_at IS NULL`
- considerar apenas modelos `modelos_sessao.deleted_at IS NULL`
- marcar como "sem uso" qualquer manobra ativa sem nenhuma relacao ativa com modelo de sessao ativo

Resumo:
- `488` manobras ativas no snapshot
- `51` modelos ativos no snapshot
- `926` relacoes ativas no snapshot
- `96` manobras ativas sem uso em qualquer modelo de sessao ativo

Observacao:
- `NOTECHS-01` a `NOTECHS-15` aparecem como sem uso por este criterio porque nao estao em `modelos_sessao_manobras`; elas sao tratadas fora das 18 tecnicas.

## NOTECHS (`15`)

| Codigo | Nome |
|---|---|
| `NOTECHS-01` | Formação e Manutenção da Equipe |
| `NOTECHS-02` | Consideração pelos Outros |
| `NOTECHS-03` | Apoio aos Outros |
| `NOTECHS-04` | Resolução de Conflitos |
| `NOTECHS-05` | Uso da Autoridade e Assertividade |
| `NOTECHS-06` | Manutenção de Padrões |
| `NOTECHS-07` | Planejamento e Coordenação |
| `NOTECHS-08` | Gerenciamento da Carga de Trabalho |
| `NOTECHS-09` | Consciência dos Sistemas da Aeronave |
| `NOTECHS-10` | Consciência do Ambiente Externo |
| `NOTECHS-11` | Consciência do Tempo |
| `NOTECHS-12` | Definição e Diagnóstico do Problema |
| `NOTECHS-13` | Geração de Opções |
| `NOTECHS-14` | Avaliação de Risco e Seleção de Opção |
| `NOTECHS-15` | Revisão do Resultado |

## AW139 (`40`)

| Codigo | Nome | Categoria |
|---|---|---|
| `LOFT-CHK-04` | Briefing de Missão, TEM e Critérios de Decisão | `PRE` |
| `LOFT-CHK-16` | Tomada de Decisão e Desvio ao Alternado | `CRM` |
| `LOFT-CHK-20` | Consciência Situacional e Gerenciamento de Ameaças | `CRM` |
| `LOFT-CHK-21` | Comunicação ATC e Fraseologia ICAO/DECEA | `CRM` |
| `LOFT-CHK-22` | Distribuição de Tarefas e Tomada de Decisão | `CRM` |
| `LOFT-NOT-01` | Performance Noturna CAT A/PC1 | `PRE` |
| `LOFT-NOT-02` | Planejamento Noturno e Alternado IFR | `PRE` |
| `LOFT-NOT-03` | Configuração FMS — Rota Noturna e Alternado | `PRE` |
| `LOFT-NOT-04` | Briefing Noturno — Ilusões e Black Hole | `PRE` |
| `LOFT-NOT-05` | Inspeção e Acionamento Noturnos | `SOL` |
| `LOFT-NOT-06` | Monitoramento Elétrico no Acionamento | `SOL` |
| `LOFT-NOT-07` | Decolagem IFR Noturna | `SOL` |
| `LOFT-NOT-08` | Configuração de Cockpit Noturno | `VOO` |
| `LOFT-NOT-09` | Gestão de Automação Noturna | `VOO` |
| `LOFT-NOT-10` | Radar WX e TAWS à Noite | `VOO` |
| `LOFT-NOT-11` | Path Monitoring Noturno | `VOO` |
| `LOFT-NOT-12` | Diagnóstico: GEN 1 FAIL em Voo Noturno | `EME` |
| `LOFT-NOT-13` | Procedimentos Elétricos (Memória + QRH) | `EME` |
| `LOFT-NOT-14` | Decisão com Sistema Elétrico Degradado | `EME` |
| `LOFT-NOT-15` | Briefing de Aproximação Noturna | `APR` |
| `LOFT-NOT-16` | Arremetida por Abaixo dos Mínimos (Noturna) | `APR` |
| `LOFT-NOT-17` | Navegação para Alternado IFR | `APR` |
| `LOFT-NOT-18` | Aproximação no Alternado — ILS ou RNAV | `APR` |
| `LOFT-NOT-19` | Pouso no Alternado e Pós-Voo | `APR` |
| `LOFT-NOT-20` | Consciência Situacional em Voo Noturno | `CRM` |
| `LOFT-NOT-21` | Gestão de Carga de Trabalho — Falha + Go-Around | `CRM` |
| `LOFT-NOT-22` | Comunicação Noturna — ATC e Rádio Plataforma | `CRM` |
| `LOFT-NOT-23` | Decolagem Noturna — Unidade Marítima (Helideck) | `Operações de Solo e Decolagem (SOL)` |
| `LOFT-NOT-24` | Transição para Circuito Noturno | `Procedimentos Normais` |
| `LOFT-NOT-25` | Perna do Vento (Downwind) Noturna | `Procedimentos Normais` |
| `LOFT-NOT-26` | Base e Final Noturna — Referências Externas Degradadas | `Aproximação e Pouso (APR)` |
| `LOFT-NOT-27` | Pouso Noturno no Helideck — Referência de Iluminação | `Aproximação e Pouso (APR)` |
| `LOFT-NOT-28` | Arremetida Noturna — Helideck | `Aproximação e Pouso (APR)` |
| `LOFT-NOT-29` | Circuito Completo Noturno — Variação de Vento | `Procedimentos Normais` |
| `LOFT-NOT-30` | Autorotação Noturna — Área Segura | `Gestão de Falhas e Emergências (EME)` |
| `LOFT-NOT-31` | Black Hole Effect — Correção e Recuperação | `Gestão de Falhas e Emergências (EME)` |
| `LOFT-OFF-04` | Briefing Helideck e TEM | `PRE` |
| `LOFT-OFF-10` | Monitoramento de Sistemas e Path Monitoring | `VOO` |
| `LOFT-OFF-13` | Decisão com Sistema Hidráulico Degradado | `EME` |
| `LOFT-OFF-22` | Comunicação e Coordenação em Cenários OEI | `CRM` |

## SK76 (`41`)

| Codigo | Nome | Categoria |
|---|---|---|
| `76-COMBX` | Luz de baixa pressão de combustível acesa | `POWERPLANT` |
| `76-DCU1M` | Falha total do DECU em um motor | `POWERPLANT` |
| `76-DCU2M` | Falha total do DECU em ambos os motores | `POWERPLANT` |
| `76-DCUDG` | Falha degradada do DECU | `POWERPLANT` |
| `76-DCUMN` | Falha menor do DECU | `POWERPLANT` |
| `S76-ACG-48` | Luz de Cautela do Gerador CA | `SOLO` |
| `S76-ATC-01` | Comunicações e interação com órgãos ATC | `Gestão de Recursos de Tripulação (CRM)` |
| `S76-BHT-52` | Luz de Aviso Battery Hot | `CRUZEIRO` |
| `S76-BTO-51` | Luz de Cautela Battery Off | `SOLO` |
| `S76-COM-01` | Equipamentos de comunicação e navegação | `Procedimentos Normais` |
| `S76-CRM-01` | Callouts, briefings e padronização operacional | `Gestão de Recursos de Tripulação (CRM)` |
| `S76-DCH-54` | Luz de Aviso DC Generator Hot | `CRUZEIRO` |
| `S76-DOP-69` | Luz de Cautela Door Open | `CRUZEIRO` |
| `S76-FMH-13` | Falha de Motor no Hover | `HOVER` |
| `S76-INV-49` | Luz de Cautela do Inversor | `SOLO` |
| `S76-LOFT-12` | Consciência Situacional | `VOO` |
| `S76-LOFT-16` | Tomada de Decisão | `EME` |
| `S76-LOFT-21` | Comunicação e Coordenação | `CRM` |
| `S76-LOFT-22` | Autocrítica e Análise | `CRM` |
| `S76-LOFT-23` | Briefing Noturno — Ilusões Visuais e Black Hole (SK76) | `Preparação e Planejamento (PRE)` |
| `S76-LOFT-24` | Inspeção e Acionamento Noturnos — SK76 | `Operações de Solo e Decolagem (SOL)` |
| `S76-LOFT-25` | Configuração de Cockpit Noturno — SK76 | `Condução do Voo e Automação (VOO)` |
| `S76-LOFT-26` | Decolagem Noturna — Unidade Marítima (SK76) | `Operações de Solo e Decolagem (SOL)` |
| `S76-LOFT-27` | Perna do Vento (Downwind) Noturna — Helideck Offshore (SK76) | `Procedimentos Normais` |
| `S76-LOFT-28` | Base e Final Noturna — Referências Externas Degradadas (SK76) | `Aproximação e Pouso (APR)` |
| `S76-LOFT-29` | Pouso Noturno no Helideck — Referência de Iluminação (SK76) | `Aproximação e Pouso (APR)` |
| `S76-LOFT-30` | Arremetida Noturna — Helideck (SK76) | `Aproximação e Pouso (APR)` |
| `S76-LOFT-31` | Circuito Completo Noturno — Variação de Vento (SK76) | `Procedimentos Normais` |
| `S76-LOFT-32` | Autorotação Noturna — Área Segura (SK76) | `Gestão de Falhas e Emergências (EME)` |
| `S76-LOFT-33` | Black Hole Effect — Correção e Recuperação (SK76) | `Gestão de Falhas e Emergências (EME)` |
| `S76-LOFT-34` | Pouso sem Iluminação de Helideck — Falha de Iluminação (SK76) | `Gestão de Falhas e Emergências (EME)` |
| `S76-MED-00` | Missão MEDVAC | `ESPECIAL` |
| `S76-PRE-01` | Verificação do diário de bordo e aceite da aeronave | `Preparação e Planejamento (PRE)` |
| `S76-PRE-02` | Walkaround e inspeção externa | `Preparação e Planejamento (PRE)` |
| `S76-PRE-03` | Verificação interna e documentação da aeronave | `Preparação e Planejamento (PRE)` |
| `S76-PRE-04` | Planejamento, peso e balanceamento | `Preparação e Planejamento (PRE)` |
| `S76-PTH-55` | Luz de Cautela Pitot Heat | `APROXIMACAO` |
| `S76-RBL-37` | Luz de Cautela do Freio de Rotor | `POUSO` |
| `S76-RMF-69` | Falha do Radio Master | `SOLO` |
| `S76-SGA-15` | Monomotor – Pouso Abortado / Arremetida | `POUSO` |
| `S76-UGE-46` | Indicação Insegura – Extensão do Trem | `APROXIMACAO` |
