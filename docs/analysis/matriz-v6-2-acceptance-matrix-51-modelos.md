# Matriz V6.2 - Acceptance Matrix - 51 Modelos

**Data:** 2026-07-05 (fechamento do target 51)
**Carater:** documental e read-only
**Escopo:** reconciliacao entre catalogo operacional de `51` modelos e target consolidado V6.2 de `51` modelos (Decisao 15)

**Atualizacao desta PR:** correcoes pedagogicas aprovadas pelo owner foram aplicadas na fonte V6.2 apos a auditoria integral de 2026-07-05, preservando `51/918/15` e sem tocar producao, fichas, sessoes historicas, avaliacoes ou arquivos de LMS.

## Fontes usadas

- `docs/MODELOS_SESSAO_MANOBRAS.md` para o snapshot operacional dos `51` modelos
- `scripts/operations/modelos-sessao-manobras-empresa6-source-map.json` para o baseline legado (`51` modelos / `1122` relacoes)
- `scripts/maintenance/lib/simuladores-matriz-v6-data.mjs` para o target V6.2 fechado (`51` modelos / `918` tecnicas / `15` NOTECHS)

## Regra de leitura desta matriz

- todos os `51` modelos do catalogo operacional agora refletem o loader V6.2 final (Decisao 15, `docs/analysis/airtrust_matriz_v6_2_todas_sessoes_manobras_final.md`);
- os `10` modelos antes marcados `corrigir` (noturno, reaquisicao e semestral AW139/SK76) foram incorporados preservando as `18` tecnicas ja documentadas operacionalmente, sem inventar codigo novo;
- `SK76-S-02/02` recebeu a correcao da Decisao 16 (`S76-LGE-44` -> `S76-LGB-47`) e `S76-NOT-02` recebeu a correcao da Decisao 17 (terminal unico `S76-FLU-01`, sem `S76-EST-01` redundante);
- a auditoria independente encontrou risco de LOFT no nome sem evidencia estrutural nas sessoes `A139-S-01/02`, `A139-S-02/02`, `SK76-S-01/02` e `SK76-S-02/02`;
- decisao do owner: manter LOFT nos nomes por necessidade curricular/auditoria, sem mascarar o achado;
- acao tomada: enquadramento LOFT estruturado foi adicionado ao documento-fonte, e o guardrail passa a validar LOFT por codigo aceito ou por bloco Enquadramento LOFT;
- esta matriz fecha a rastreabilidade e a conversao dos `51` modelos para o pacote `18 tecnicas + 15 NOTECHS`;
- a lista de manobras ativas sem uso (`docs/analysis/MANOBRAS_SEM_USO_EM_MODELOS_SESSAO_SNAPSHOT_20260705.md`) permanece intocada nesta PR e so deve ser recalculada apos este fechamento.

## Resumo

| Grupo | Quantidade |
| --- | ---: |
| Modelos no target V6.2 fechado | 51 |
| Modelos fora do target V6.2 fechado | 0 |
| Veredito `GO` | 51 |
| Veredito `corrigir` | 0 |
| Veredito `bloquear` | 0 |

## Matriz de aceite

| Código | Nome | Tipo | Aeronave | Técnicas | NOTECHS fora das técnicas | Status V6.2 | Nome compatível com conteúdo | Progressão pedagógica | Ordem operacional | IFR no momento correto | Sem voo após pouso/corte | Veredito | Ação tomada |
| --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| `CRED-EXA` | Credenciamento de Examinador | Examinador | N/A | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | drift `EXA-CND-01` documentado no artefato ativo; `EXA-PAD-01` mantido com rubricas internas separadas para padronizacao e representatividade |
| `TRE-INST` | Treinamento de Instrutor de Voo | Instrutor | N/A | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | `INV-ETH-01` inserido para rastrear postura etica do instrutor; NOTECHS N/A passam a ser lidos em contexto de instrucao/exame |
| `A139-I-01/12` | Familiarização / Checklist Normal / Voo Normal | Inicial | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-I-02/12` | Voo Visual e Perfil Básico | Inicial | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | holding e navegacao offshore reordenados antes do bloco de aproximacao/pouso |
| `A139-I-03/12` | Sistema Elétrico, Barras, Geradores e Anormalidades Básicas | Inicial | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | nome e/ou progressão IFR corrigidos neste PR |
| `A139-I-04/12` | AFCS, Aviônicos e Degradações Simples | Inicial | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | duplicacoes literais com `A139-I-03/12` reduzidas; bloco passa a enfatizar AFCS/aviônicos e reconfiguracao operacional |
| `A139-I-05/12` | IFR/PBN Básico | Inicial | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | checklist/transicao/AFCS movidos antes de holding/aproximacoes; sessao fecha no missed approach |
| `A139-I-06/12` | CAT A/B Introdutório | Inicial | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-I-07/12` | AFCS/Avionics | Inicial | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-I-08/12` | Rotor/Transmission/Hydraulic | Inicial | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | landing gear emergency reposicionado antes do bloco final de autorrotacao/recuperacao |
| `A139-I-09/12` | Fire/Smoke/Emergências Avançadas | Inicial | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-I-10/12` | Offshore/Helideck | Inicial | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-I-11/12` | LOFT | Inicial | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-I-12/12` | LOFT Check | Inicial | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-NOT-01` | Treinamento Noturno Onshore | Periódico | AW139 | 18 | 15 | target 51 fechado | sim | sim | sim | não aplicável | sim | GO | `OPS-NOT-X1` e `A139-AUT-03` adicionados para black hole e autorrotacao noturna dedicada, sem reativar codigos legados |
| `A139-NOT-02` | Treinamento Noturno Offshore | Periódico | AW139 | 18 | 15 | target 51 fechado | sim | sim | sim | sim | sim | GO | `OPS-NOT-X1` adicionada para black hole; encerramento mantido sem item terminal indevido |
| `A139-P-C1/IFR` | Ciclo 1 / IFR-emergências | Periódico | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | nome alinhado ao conteudo real, sem forcar insercao artificial de bloco noturno/offshore |
| `A139-P-C1/VFR` | Ciclo 1 / VFR-emergências | Periódico | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-P-C2/IFR` | Ciclo 2 / IFR-emergências | Periódico | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | nome corrigido e `landing gear emergency` reposicionado antes do bloco final de aproximacao IFR |
| `A139-P-C2/VFR` | Ciclo 2 / VFR-emergências | Periódico | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-P-C3/IFR` | Ciclo 3 / IFR-emergências | Periódico | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | nome alinhado ao conteudo real do ciclo IFR |
| `A139-P-C3/VFR` | Ciclo 3 / VFR-emergências | Periódico | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-P-LOFT/CHECK` | LOFT Check | Periódico | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-P-LOFT/OFFSHORE` | LOFT Offshore | Periódico | AW139 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `A139-REQ-01` | Reaquisição de Experiência Recente | Periódico | AW139 | 18 | 15 | target 51 fechado | sim | sim | sim | não aplicável | sim | GO | bloco final rebalanceado para reaquisição segura, reduzindo concentracao de emergencias graves |
| `A139-S-01/02` | Semestral 01/02: LOFT e Operação Noturna | Semestral | AW139 | 18 | 15 | target 51 fechado | sim (com bloco LOFT estruturado) | sim | sim | não aplicável | sim | GO | achado LOFT documentado; owner manteve o nome; enquadramento estruturado adicionado; `OPS-NOT-X1` e `A139-AUT-03` reforcam rastreabilidade de black hole e autorrotacao noturna |
| `A139-S-02/02` | Semestral 02/02: LOFT e Check de IFR | Semestral | AW139 | 18 | 15 | target 51 fechado | sim (com bloco LOFT estruturado) | sim | sim | sim | sim | GO | achado LOFT documentado; owner manteve o nome; enquadramento estruturado adicionado; residuos de "noturna" removidos da sessao nao-noturna |
| `S76-NOT-01` | Treinamento Noturno Onshore | Periódico | SK76 | 18 | 15 | target 51 fechado | sim | sim | sim | não aplicável | sim | GO | `OPS-NOT-X1` adicionada para black hole, preservando autorrotacao e encerramento coerente |
| `S76-NOT-02` | SK76 - TREINAMENTO NOTURNO - OFFSHORE | Periódico | SK76 | 18 | 15 | target 51 fechado | sim | sim | sim | sim | sim | GO | incorporado ao target 51 (Decisão 15); corrigido pela Decisão 17 (terminal único `S76-FLU-01`, sem `S76-EST-01` redundante) |
| `S76-P-C1/IFR` | Ciclo 1 / IFR-emergências | Periódico | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | nome alinhado ao conteudo real do ciclo IFR |
| `S76-P-C1/VFR` | Ciclo 1 / VFR-emergências | Periódico | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | fase final explicita decisao de retorno/encerramento, sem alterar a familia tecnica do ciclo |
| `S76-P-C2/IFR` | Ciclo 2 / IFR-emergências | Periódico | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | nome alinhado ao conteudo real do ciclo IFR |
| `S76-P-C2/VFR` | Ciclo 2 / VFR-emergências | Periódico | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `S76-P-C3/IFR` | Ciclo 3 / IFR-emergências | Periódico | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | nome alinhado ao conteudo real do ciclo IFR |
| `S76-P-C3/VFR` | Ciclo 3 / VFR-emergências | Periódico | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `S76-REQ-01` | SK76 - REAQUISIÇÃO DE EXPERIÊNCIA RECENTE | Periódico | SK76 | 18 | 15 | target 51 fechado | sim | sim | sim | não aplicável | sim | GO | incorporado ao target 51 (Decisão 15); 18 técnicas preservadas do snapshot operacional |
| `SK76-I-01/12` | Familiarização / Checklist Normal / Voo Normal Básico | Inicial | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `SK76-I-02/12` | Voo Normal Consolidado / Perfil Visual | Inicial | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `SK76-I-03/12` | Sistemas Básicos, ECL e Anormalidades Simples | Inicial | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | fase final limpa para texto pedagógico, sem resíduo de metadado interno |
| `SK76-I-04/12` | Automação, Aviônicos e Degradações Básicas | Inicial | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | não aplicável | sim | GO | nome e/ou progressão IFR corrigidos neste PR |
| `SK76-I-05/12` | IFR / Navegação Básico | Inicial | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | `S76-UAR-00` passa a explicitar gatilho de perda momentanea de referencias em contexto IFR basico |
| `SK76-I-06/12` | OEI Decolagem/Aproximação / DECU | Inicial | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `SK76-I-07/12` | Sistemas Específicos | Inicial | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `SK76-I-08/12` | Rotor / Transmissão / Autorrotação | Inicial | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `SK76-I-09/12` | Fogo/Fumaça e Emergências Avançadas | Inicial | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | duplicidade final de fumaça/bagagem removida em favor de aproximacoes OEI coerentes com emergencias avancadas |
| `SK76-I-10/12` | Offshore / Unidade Marítima | Inicial | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `SK76-I-11/12` | LOFT | Inicial | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `SK76-I-12/12` | LOFT Check | Inicial | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `SK76-P-CHECK` | LOFT/check | Periódico | SK76 | 18 | 15 | target 41 corrigido | sim | sim | sim | sim | sim | GO | mantido no target 41 com 18 técnicas e 15 NOTECHS fora das técnicas |
| `SK76-S-01/02` | Semestral 01/02: LOFT e Operação Noturna | Semestral | SK76 | 18 | 15 | target 51 fechado | sim (com bloco LOFT estruturado) | sim | sim | não aplicável | sim | GO | achado LOFT documentado; owner manteve o nome; enquadramento estruturado adicionado; `OPS-NOT-X1` reforca rastreabilidade de black hole no cenario semestral |
| `SK76-S-02/02` | Semestral 02/02: LOFT e Check de IFR | Semestral | SK76 | 18 | 15 | target 51 fechado | sim (com bloco LOFT estruturado) | sim | sim | sim | sim | GO | achado LOFT documentado; owner manteve o nome; enquadramento estruturado adicionado; residuos de "noturna" removidos e Decisao 16 preservada (`S76-LGB-47`) |

## Conclusao operacional

Esta matriz elimina a falsa sensacao de fechamento criada por validar apenas o subconjunto consolidado. O target V6.2 permanece fechado em `51/918/15`, com `TRE-INST`, `CRED-EXA` e os `10` modelos de noturno/reaquisicao/semestral incluidos (Decisao 15). Nesta PR, as correcoes pedagogicas aprovadas pelo owner foram aplicadas sem mudar o escopo: nomes IFR corrigidos, black hole/autorrotacao noturna reinseridos onde aprovado, governanca `TRE-INST`/`CRED-EXA` documentada e ajustes de ordem/fase implementados. Nenhuma manobra foi apagada ou arquivada, nenhuma ficha/sessao/avaliacao/historico foi tocado, e a lista de manobras ativas sem uso permanece para recalculo em etapa posterior a este fechamento.
