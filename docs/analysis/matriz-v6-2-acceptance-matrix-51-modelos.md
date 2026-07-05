# Matriz V6.2 - Acceptance Matrix - 51 Modelos

**Data:** 2026-07-05
**Carater:** documental e read-only
**Escopo:** reconciliacao entre catalogo operacional de `51` modelos e target consolidado V6.2 de `41` modelos

## Fontes usadas

- `docs/MODELOS_SESSAO_MANOBRAS.md` para o snapshot operacional dos `51` modelos
- `scripts/operations/modelos-sessao-manobras-empresa6-source-map.json` para o baseline legado (`51` modelos / `1122` relacoes)
- `scripts/maintenance/lib/simuladores-matriz-v6-data.mjs` para o target V6.2 corrigido (`41` modelos / `738` tecnicas / `15` NOTECHS)

## Regra de leitura desta matriz

- quando o modelo esta no target corrigido de `41`, os campos de nome e tecnicas refletem o loader V6.2 final;
- quando o modelo esta fora do target `41`, os campos refletem o snapshot operacional atual e o veredito fica `corrigir`;
- `NOTECHS fora das tecnicas = 0` nos modelos fora do target significa "nao segregado como parte do pacote V6.2 corrigido", nao uma aprovacao estrutural;
- esta matriz fecha a rastreabilidade dos `51` modelos, mas nao declara que os `51` estejam todos convertidos para o pacote `18 tecnicas + 15 NOTECHS`.

## Resumo

| Grupo | Quantidade |
| --- | ---: |
| Modelos no target V6.2 corrigido | 41 |
| Modelos fora do target V6.2 corrigido | 10 |
| Veredito `GO` | 41 |
| Veredito `corrigir` | 10 |
| Veredito `bloquear` | 0 |

## Matriz de aceite

| Código | Nome | Tipo | Aeronave | Técnicas | NOTECHS fora das técnicas | Status V6.2 | Nome compatível com conteúdo | Progressão pedagógica | Ordem operacional | IFR no momento correto | Sem voo após pouso/corte | Veredito | Ação tomada |
| --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| `CRED-EXA` | Credenciamento de Examinador | Examinador | N/A | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | migrado de 22 itens legados para 18 técnicas + 15 NOTECHS |
| `TRE-INST` | Treinamento de Instrutor de Voo | Instrutor | N/A | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | migrado de 22 itens legados para 18 técnicas + 15 NOTECHS |
| `A139-I-01/12` | Familiarização / Checklist Normal / Voo Normal | Inicial | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-I-02/12` | Voo Visual e Perfil Básico | Inicial | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-I-03/12` | Sistema Elétrico, Barras, Geradores e Anormalidades Básicas | Inicial | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | nome e/ou progressão IFR corrigidos neste PR |
| `A139-I-04/12` | AFCS, Aviônicos e Degradações Simples | Inicial | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | nome e/ou progressão IFR corrigidos neste PR |
| `A139-I-05/12` | IFR/PBN Básico | Inicial | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | nome e/ou progressão IFR corrigidos neste PR |
| `A139-I-06/12` | CAT A/B Introdutório | Inicial | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-I-07/12` | AFCS/Avionics | Inicial | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-I-08/12` | Rotor/Transmission/Hydraulic | Inicial | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-I-09/12` | Fire/Smoke/Emergências Avançadas | Inicial | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-I-10/12` | Offshore/Helideck | Inicial | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-I-11/12` | LOFT | Inicial | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-I-12/12` | LOFT Check | Inicial | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-NOT-01` | AW139 - TREINAMENTO NOTURNO - ONSHORE | Periódico | AW139 | 18 | 0 | fora do target 41 (snapshot operacional) | sim | sim | sim | não aplicável | sim | corrigir | mantido fora do target 41; requer trilha própria se o objetivo for fechar os 51 modelos |
| `A139-NOT-02` | AW139 - TREINAMENTO NOTURNO - OFFSHORE | Periódico | AW139 | 18 | 0 | fora do target 41 (snapshot operacional) | sim | sim | sim | sim | sim | corrigir | mantido fora do target 41; requer trilha própria se o objetivo for fechar os 51 modelos |
| `A139-P-C1/IFR` | Ciclo 1 / IFR-noturno-offshore | Periódico | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-P-C1/VFR` | Ciclo 1 / VFR-emergências | Periódico | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-P-C2/IFR` | Ciclo 2 / IFR-noturno-offshore | Periódico | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-P-C2/VFR` | Ciclo 2 / VFR-emergências | Periódico | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-P-C3/IFR` | Ciclo 3 / IFR-noturno-offshore | Periódico | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-P-C3/VFR` | Ciclo 3 / VFR-emergências | Periódico | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-P-LOFT/CHECK` | LOFT Check | Periódico | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-P-LOFT/OFFSHORE` | LOFT Offshore | Periódico | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-REQ-01` | AW139 - REAQUISIÇÃO DE EXPERIÊNCIA RECENTE | Periódico | AW139 | 18 | 0 | fora do target 41 (snapshot operacional) | sim | sim | sim | não aplicável | sim | corrigir | mantido fora do target 41; requer trilha própria se o objetivo for fechar os 51 modelos |
| `A139-S-01/02` | AW139 - SEMESTRAL - 01/02: LOFT e OPERAÇÃO NOTURNA | Semestral | AW139 | 18 | 0 | fora do target 41 (snapshot operacional) | sim | sim | sim | não aplicável | sim | corrigir | mantido fora do target 41; requer trilha própria se o objetivo for fechar os 51 modelos |
| `A139-S-02/02` | AW139 - SEMESTRAL - 02/02: LOFT e CHECK DE IFR | Semestral | AW139 | 18 | 0 | fora do target 41 (snapshot operacional) | sim | sim | sim | sim | sim | corrigir | mantido fora do target 41; requer trilha própria se o objetivo for fechar os 51 modelos |
| `S76-NOT-01` | SK76 - TREINAMENTO NOTURNO - ONSHORE | Periódico | SK76 | 18 | 0 | fora do target 41 (snapshot operacional) | sim | sim | sim | não aplicável | sim | corrigir | mantido fora do target 41; requer trilha própria se o objetivo for fechar os 51 modelos |
| `S76-NOT-02` | SK76 - TREINAMENTO NOTURNO - OFFSHORE | Periódico | SK76 | 18 | 0 | fora do target 41 (snapshot operacional) | sim | sim | sim | sim | sim | corrigir | mantido fora do target 41; requer trilha própria se o objetivo for fechar os 51 modelos |
| `S76-P-C1/IFR` | Ciclo 1 / IFR-noturno-offshore | Periódico | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `S76-P-C1/VFR` | Ciclo 1 / VFR-emergências | Periódico | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `S76-P-C2/IFR` | Ciclo 2 / IFR-noturno-offshore | Periódico | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `S76-P-C2/VFR` | Ciclo 2 / VFR-emergências | Periódico | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `S76-P-C3/IFR` | Ciclo 3 / IFR-noturno-offshore | Periódico | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `S76-P-C3/VFR` | Ciclo 3 / VFR-emergências | Periódico | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `S76-REQ-01` | SK76 - REAQUISIÇÃO DE EXPERIÊNCIA RECENTE | Periódico | SK76 | 18 | 0 | fora do target 41 (snapshot operacional) | sim | sim | sim | não aplicável | sim | corrigir | mantido fora do target 41; requer trilha própria se o objetivo for fechar os 51 modelos |
| `SK76-I-01/12` | Familiarização / Checklist Normal / Voo Normal Básico | Inicial | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `SK76-I-02/12` | Voo Normal Consolidado / Perfil Visual | Inicial | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `SK76-I-03/12` | Sistemas Básicos, ECL e Anormalidades Simples | Inicial | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | nome e/ou progressão IFR corrigidos neste PR |
| `SK76-I-04/12` | Automação, Aviônicos e Degradações Básicas | Inicial | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | nome e/ou progressão IFR corrigidos neste PR |
| `SK76-I-05/12` | IFR / Navegação Básico | Inicial | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | nome e/ou progressão IFR corrigidos neste PR |
| `SK76-I-06/12` | OEI Decolagem/Aproximação / DECU | Inicial | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `SK76-I-07/12` | Sistemas Específicos | Inicial | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `SK76-I-08/12` | Rotor / Transmissão / Autorrotação | Inicial | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `SK76-I-09/12` | Fogo/Fumaça e Emergências Avançadas | Inicial | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `SK76-I-10/12` | Offshore / Unidade Marítima | Inicial | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `SK76-I-11/12` | LOFT | Inicial | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `SK76-I-12/12` | LOFT Check | Inicial | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `SK76-P-CHECK` | LOFT/check | Periódico | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `SK76-S-01/02` | SK76 - SEMESTRAL - 01/02: LOFT e OPERAÇÃO NOTURNA | Semestral | SK76 | 18 | 0 | fora do target 41 (snapshot operacional) | sim | sim | sim | não aplicável | sim | corrigir | mantido fora do target 41; requer trilha própria se o objetivo for fechar os 51 modelos |
| `SK76-S-02/02` | SK76 - SEMESTRAL - 02/02: LOFT e CHECK DE IFR | Semestral | SK76 | 18 | 0 | fora do target 41 (snapshot operacional) | sim | sim | sim | sim | sim | corrigir | mantido fora do target 41; requer trilha própria se o objetivo for fechar os 51 modelos |

## Conclusao operacional

Esta matriz elimina a falsa sensacao de fechamento criada por validar apenas o subconjunto consolidado. O target V6.2 corrigido fica fechado em `41/738/15`, com `TRE-INST` e `CRED-EXA` incluidos. Os `10` modelos restantes continuam rastreados e explicitamente marcados como pendencia de trilha propria se o objetivo passar a ser cobertura integral dos `51`.
