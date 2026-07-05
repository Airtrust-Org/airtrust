# Matriz V6.2 — Auditoria Pedagógica, Operacional e Didática dos 51 Modelos de Sessão

**Data:** 2026-07-05
**Caráter:** documental, read-only. Não é revisão de código. Não é homologação, aprovação ou aceite pela ANAC.
**Escopo:** os 51 modelos de sessão da Matriz V6.2 (918 manobras técnicas, 15 NOTECHS fora das técnicas), aplicada em produção em 2026-07-05 (SHA `fd02bc6a`).

---

## 1. Resumo executivo

Esta auditoria avaliou a qualidade pedagógica, operacional e didática dos 51 modelos de sessão da Matriz V6.2 — não apenas a contagem estrutural de "18 técnicas + 15 NOTECHS", que já havia sido validada por auditorias anteriores. Cinco subagentes independentes revisaram grupos de modelos em paralelo (AW139 Inicial/Periódico; SK76/S76 Inicial/Periódico; LOFT/Noturno/Semestral/Reaquisição; TRE-INST/CRED-EXA; mecanismo NOTECHS/CRM transversal), com instrução explícita de discordar do veredito prévio sempre que a evidência justificasse.

**Resultado agregado dos 51 modelos:**

| Veredito | Quantidade |
|---|---:|
| GO (sem ressalva) | 27 |
| GO (com ressalva registrada) | 3 |
| AJUSTAR | 21 |
| BLOQUEAR | 0 |
| **Total** | **51** |

**Nenhum modelo foi classificado BLOQUEAR.** Nenhuma sessão contém manobra de voo após item terminal (pouso/corte/ditching/evacuação). Nenhuma sessão mistura família AW139 dentro de modelo SK76/S76 ou vice-versa. Nenhum NOTECHS, `INV-CRM-*` ou `EXA-NTS-*` aparece dentro das 18 técnicas de nenhum dos 51 modelos (confirmado por leitura integral + verificação programática, 0 exceções em 918 linhas).

Os 21 AJUSTAR se concentram em quatro padrões recorrentes, nenhum deles crítico de segurança de sequência:

1. **Nome promete "noturno-offshore" sem conteúdo noturno/offshore real** — achado sistemático nos 6 ciclos periódicos IFR (`A139-P-C1/IFR`, `A139-P-C2/IFR`, `A139-P-C3/IFR`, `S76-P-C1/IFR`, `S76-P-C2/IFR`, `S76-P-C3/IFR`). Nenhuma das 108 linhas técnicas (18×6) contém manobra noturna ou offshore-específica.
2. **Lacunas de conteúdo de segurança em sessões noturnas/semestrais** — ilusão visual noturna/"black hole effect" ausente em todas as 6 sessões noturnas/semestrais ativas de ambas as frotas; autorrotação noturna dedicada ausente especificamente em `A139-NOT-01` (e por herança em `A139-S-01/02`).
3. **Evidência LOFT apenas textual** nas 4 sessões semestrais (`A139-S-01/02`, `A139-S-02/02`, `SK76-S-01/02`, `SK76-S-02/02`) — a narrativa "Enquadramento LOFT" é verificada como tecnicamente consistente com a tabela de 18 itens, mas não há nenhum código `LOFT-*` vinculado; o guardrail do loader aceita esse caminho alternativo, mas isso é uma mudança de critério de aceitação, não uma correção estrutural.
4. **Lacunas de governança/ética na compressão 22→18 de TRE-INST/CRED-EXA** — `INV-CRM-04` (ética do instrutor) sem equivalente em nenhum lugar do `TRE-INST`; fusão `EXA-ETH-02`+`EXA-ETH-03`→`EXA-PAD-01` no `CRED-EXA` comprime dois construtos de risco regulatório distintos; `EXA-CND-01` sofreu reuso de código com significado invertido (planejamento→condução) sem nota de rastreabilidade no documento operacional ativo.

Adicionalmente, o mecanismo transversal de NOTECHS foi classificado **AJUSTAR** (não GO, não BLOQUEAR): estruturalmente correto e sem nenhuma violação, mas com ausência de guardrail automático contra contaminação futura, aplicação genérica não adaptada a `TRE-INST`/`CRED-EXA`, e critério de avaliação (60 descritores) com aviso explícito de não-validação contra o padrão da empresa.

**Nenhuma correção foi implementada nesta etapa.** Nenhuma produção, banco, loader, matriz, ficha, sessão, avaliação ou histórico foi alterado.

---

## 2. Escopo e limites

**Dentro do escopo:** avaliação de qualidade pedagógica, coerência operacional, progressão didática, coerência técnica, cobertura IFR/VFR/noturno/offshore, lógica de formação de instrutor e credenciamento de examinador, e mecanismo NOTECHS — para os 51 modelos de sessão ativos em produção (empresa 6, Costa do Sol).

**Fora do escopo (explicitamente, por instrução do owner):**
- Qualquer alteração de produção, banco, migration ou deploy.
- Qualquer DELETE/UPDATE/INSERT.
- Arquivamento, desativação ou exclusão de manobras.
- Alteração do loader, da matriz, de fichas existentes, sessões já criadas, avaliações, notas, assinaturas, comentários ou histórico.
- Qualificações, LMS/SCORM, RBAC/auth/multi-tenant.
- Geração de PDFs finais.
- Qualquer afirmação de homologação/aprovação/aceite ANAC.
- Tratamento de contagem (18 técnicas / 15 NOTECHS) como evidência suficiente de qualidade — esse foi exatamente o erro que esta auditoria foi desenhada para não repetir.

**Limite metodológico:** esta é uma auditoria documental sobre o arquivo-fonte da matriz (`airtrust_matriz_v6_2_todas_sessoes_manobras_final.md`) e artefatos de análise relacionados. Não foi feita nenhuma consulta ao D1 de produção nesta etapa — as contagens de produção (51/918/15) foram herdadas de `docs/ops/matriz-v6-2-production-apply-20260705.md`, já validadas anteriormente.

---

## 3. Fontes usadas

- `docs/analysis/airtrust_matriz_v6_2_todas_sessoes_manobras_final.md` — especificação V6.2 fechada, fonte primária de todas as 51 tabelas de 18 itens.
- `docs/analysis/matriz-v6-2-acceptance-matrix-51-modelos.md` — matriz de aceite prévia (veredito estrutural, todos GO).
- `docs/analysis/matriz-v6-2-postmortem-escopo-e-coerencia.md` — histórico de correções já aplicadas (fronteira IFR, TRE-INST/CRED-EXA fora do escopo original).
- `docs/analysis/matriz-v6-2-unused-maneuvers-audit-post-51.md` — classificação de manobras sem uso (A/B/C/D/E).
- `docs/analysis/matriz-v6-2-equivalence-map-before-archive.md` — mapa de equivalência INV/S76/LOFT/CAU legado → V6.2.
- `docs/analysis/matriz-v6-2-exa-equivalence-map-before-archive.md` — mapa de equivalência EXA legado → CRED-EXA V6.2.
- `docs/ops/matriz-v6-2-production-apply-20260705.md` — confirmação do estado de produção pós-apply.
- `docs/MODELOS_SESSAO_MANOBRAS.md` — snapshot operacional legado (22/51 modelos pré-compressão).
- `scripts/maintenance/lib/simuladores-matriz-v6-data.mjs` — loader real (parser de markdown, guardrails `validateModels`).
- `worker-airtrust/src/constants/notechs.ts`, `src/react-app/pages/simuladores/fichas/notechs.ts` — catálogo e descritores de avaliação NOTECHS.

---

## 4. Metodologia

Cinco subagentes independentes auditaram grupos de modelos em paralelo, cada um instruído a:

1. Ler a tabela de 18 itens de cada modelo do seu grupo diretamente na fonte primária (não confiar apenas no veredito prévio).
2. Aplicar os 8 critérios do prompt original (identidade, lógica operacional, didática/progressão, coerência técnica, IFR/VFR/noturno/offshore, TRE-INST/CRED-EXA, NOTECHS, rastreabilidade).
3. Classificar cada modelo como GO/AJUSTAR/BLOQUEAR com justificativa objetiva de uma frase para GO, e problema/risco/evidência/correção para AJUSTAR/BLOQUEAR.
4. Discordar explicitamente do veredito prévio quando a evidência justificasse.

Os cinco relatórios foram consolidados neste documento único. Onde os subagentes cometeram erros de soma nos seus próprios totais (dois grupos apresentaram totais internamente inconsistentes com suas próprias tabelas modelo-a-modelo), este documento recalculou os totais a partir das tabelas detalhadas, que são a fonte confiável.

---

## 5. Tabela geral dos 51 modelos

| Código | Nome | Tipo | Aeronave | Veredito | Risco | Principal achado | Ação recomendada |
|---|---|---|---|---|---|---|---|
| `A139-I-01/12` | Familiarização / Checklist Normal / Voo Normal | Inicial | AW139 | GO | baixo | Sequência canônica completa; `FLY-BAS-X4` antes do pouso (decisão 1) | Nenhuma |
| `A139-I-02/12` | Voo Visual e Perfil Básico | Inicial | AW139 | AJUSTAR | baixo | Holding/navegação offshore após pouso com vento cruzado — ordem invertida | Ordem |
| `A139-I-03/12` | Sistema Elétrico, Barras, Geradores e Anormalidades Básicas | Inicial | AW139 | GO | baixo | Progressão elétrico→avionics→AFCS sem IFR pesado (decisão 13) | Nenhuma |
| `A139-I-04/12` | AFCS, Aviônicos e Degradações Simples | Inicial | AW139 | AJUSTAR | médio | 9 de 18 itens duplicam literalmente I-03/12 | Troca de manobra |
| `A139-I-05/12` | IFR/PBN Básico | Inicial | AW139 | AJUSTAR | baixo | Itens finais regridem a nível básico após missed approach/large angle | Ordem |
| `A139-I-06/12` | CAT A/B Introdutório | Inicial | AW139 | GO | baixo | QRH antes de OEI/pouso (decisão 2); encerra em normalização | Nenhuma |
| `A139-I-07/12` | AFCS/Avionics | Inicial | AW139 | GO | baixo | Normalização AFCS antes de falhas (decisão 3); termina no clímax | Nenhuma |
| `A139-I-08/12` | Rotor/Transmission/Hydraulic | Inicial | AW139 | AJUSTAR | baixo | Termina em landing gear emergency sem resolução/pouso | Ordem |
| `A139-I-09/12` | Fire/Smoke/Emergências Avançadas | Inicial | AW139 | GO | médio | Panes de alto risco no início; termina em decisão de aproximação | Nenhuma |
| `A139-I-10/12` | Offshore/Helideck | Inicial | AW139 | GO | baixo | `CAU-HOT-65` reposicionado (decisão 4); encerra em ditching | Nenhuma |
| `A139-I-11/12` | LOFT | Inicial | AW139 | GO | baixo | `LOFT-CHK-23` antes do pouso (decisão 5) | Nenhuma |
| `A139-I-12/12` | LOFT Check | Inicial | AW139 | GO | baixo | Reusa sequência treinada de I-11/12, sem conteúdo novo | Nenhuma |
| `A139-P-C1/VFR` | Ciclo 1 / VFR-emergências | Periódico | AW139 | GO | baixo | Nome "VFR-emergências" fielmente cumprido | Nenhuma |
| `A139-P-C1/IFR` | Ciclo 1 / IFR-noturno-offshore | Periódico | AW139 | AJUSTAR | médio | Nome promete noturno/offshore; zero conteúdo correspondente | Nome |
| `A139-P-LOFT/OFFSHORE` | LOFT Offshore | Periódico | AW139 | GO | baixo | Sequência OEI completa (antes/depois TDP e LDP), progressiva | Nenhuma |
| `A139-P-LOFT/CHECK` | LOFT Check | Periódico | AW139 | GO | baixo | Avaliativa, reusa A139-I-12/12, decisão 5 cumprida | Nenhuma |
| `A139-P-C2/VFR` | Ciclo 2 / VFR-emergências | Periódico | AW139 | GO | baixo | `OPS-OFF-X2` real (não rótulo); progressão sólida | Nenhuma |
| `A139-P-C2/IFR` | Ciclo 2 / IFR-noturno-offshore | Periódico | AW139 | AJUSTAR | médio | Mesmo problema de nome + termina em landing gear emergency sem resolução | Nome + ordem |
| `A139-P-C3/VFR` | Ciclo 3 / VFR-emergências | Periódico | AW139 | GO | baixo | Progressão avançada; termina em pane de monitoramento | Nenhuma |
| `A139-P-C3/IFR` | Ciclo 3 / IFR-noturno-offshore | Periódico | AW139 | AJUSTAR | médio | 3º de 3 ciclos com o mesmo problema sistemático de nome | Nome |
| `A139-NOT-01` | Treinamento Noturno Onshore | Periódico | AW139 | AJUSTAR | médio | Sem autorrotação noturna nem item de black hole/ilusão visual | Decisão humana (reinserção) |
| `A139-NOT-02` | Treinamento Noturno Offshore | Periódico | AW139 | AJUSTAR | médio | Tem autorrotação; sem item de black hole/ilusão visual | Decisão humana (reinserção) |
| `A139-REQ-01` | Reaquisição de Experiência Recente | Periódico | AW139 | AJUSTAR | baixo-médio | Concentra fogo de motor + autorrotação + emergência de trem no final — desalinhado com "sessão enxuta" | Decisão humana / revisão de escopo |
| `A139-S-01/02` | Semestral 01/02: LOFT e Operação Noturna | Semestral | AW139 | GO (ressalva) | baixo-médio | Narrativa LOFT verificada consistente com a tabela; evidência LOFT só textual, sem código `LOFT-*` | Vínculo estrutural de metadado (decisão humana) |
| `A139-S-02/02` | Semestral 02/02: LOFT e Check de IFR | Semestral | AW139 | GO (ressalva) | baixo-médio | Idem acima + resíduo "noturna" em descrição-fase de itens não-noturnos | Vínculo de metadado + descrição-fase |
| `SK76-I-01/12` | Familiarização / Checklist Normal / Voo Normal Básico | Inicial | SK76 | GO | baixo | Sequência canônica completa preparação→pouso→corte | Nenhuma |
| `SK76-I-02/12` | Voo Normal Consolidado / Perfil Visual | Inicial | SK76 | GO | baixo | Progressão real (vento cruzado, instabilidade) sem regressão | Nenhuma |
| `SK76-I-03/12` | Sistemas Básicos, ECL e Anormalidades Simples | Inicial | SK76 | AJUSTAR | médio | Item final com rótulo de fase "validar frota", não pedagógico | Descrição-fase |
| `SK76-I-04/12` | Automação, Aviônicos e Degradações Básicas | Inicial | SK76 | GO | baixo | Fronteira automação/IFR corretamente isolada de IFR real | Nenhuma |
| `SK76-I-05/12` | IFR / Navegação Básico | Inicial | SK76 | AJUSTAR | médio | Recuperação de atitude anormal inserida sem gatilho de falha precedente | Ordem |
| `SK76-I-06/12` | OEI Decolagem/Aproximação / DECU | Inicial | SK76 | GO | baixo | Progressão por fase de voo até pouso monomotor (decisão 8) | Nenhuma |
| `SK76-I-07/12` | Sistemas Específicos | Inicial | SK76 | GO | baixo | Bloco técnico coeso por domínio (elétrico→hidráulico→trem→instrumentos) | Nenhuma |
| `SK76-I-08/12` | Rotor / Transmissão / Autorrotação | Inicial | SK76 | GO | baixo | Escala até autorrotação/recuperação, fecha com reforço técnico | Nenhuma |
| `SK76-I-09/12` | Fogo/Fumaça e Emergências Avançadas | Inicial | SK76 | AJUSTAR | médio | Itens finais repetem fumaça/bagagem já cobertos, sem diferenciação didática | Troca de manobra |
| `SK76-I-10/12` | Offshore / Unidade Marítima | Inicial | SK76 | GO | baixo | TDP→ditching→flutuabilidade coerente (decisão 9) | Nenhuma |
| `SK76-I-11/12` | LOFT | Inicial | SK76 | GO | baixo | `LOFT-CHK-23` corretamente posicionado (decisão 5) | Nenhuma |
| `SK76-I-12/12` | LOFT Check | Inicial | SK76 | GO | baixo | Idêntico ao LOFT treinado, sem conteúdo novo | Nenhuma |
| `S76-P-C1/VFR` | Ciclo 1 / VFR-emergências | Periódico | SK76 | AJUSTAR | médio | Encerramento em luz de cautela de combustível, sem decisão/pouso claro | Descrição-fase |
| `S76-P-C1/IFR` | Ciclo 1 / IFR-noturno-offshore | Periódico | SK76 | AJUSTAR | médio | Nome promete noturno/offshore; zero conteúdo correspondente | Nome |
| `SK76-P-CHECK` | LOFT/check | Periódico | SK76 | GO | baixo | Usa `LOFT-CHK-*`, não `S76-LOFT-*` (decisão 10) | Nenhuma |
| `S76-P-C2/VFR` | Ciclo 2 / VFR-emergências | Periódico | SK76 | GO | baixo | Progressão até ditching; decisão 16 (`S76-LGB-47`) cumprida | Nenhuma |
| `S76-P-C2/IFR` | Ciclo 2 / IFR-noturno-offshore | Periódico | SK76 | AJUSTAR | médio | Mesmo problema sistemático de nome | Nome |
| `S76-P-C3/VFR` | Ciclo 3 / VFR-emergências | Periódico | SK76 | GO | baixo | Cobre panes rotativas não vistas nos ciclos 1-2 | Nenhuma |
| `S76-P-C3/IFR` | Ciclo 3 / IFR-noturno-offshore | Periódico | SK76 | AJUSTAR | médio | 3º de 3 ciclos com o mesmo problema sistemático de nome | Nome |
| `S76-NOT-01` | Treinamento Noturno Onshore | Periódico | SK76 | AJUSTAR | médio | Tem autorrotação; sem item de black hole/ilusão visual | Decisão humana (reinserção) |
| `S76-NOT-02` | Treinamento Noturno Offshore | Periódico | SK76 | GO | baixo (lacuna à parte) | Terminal corrigido (decisão 17); sem black hole (lacuna registrada) | Registrar lacuna |
| `S76-REQ-01` | Reaquisição de Experiência Recente | Periódico | SK76 | GO | baixo | Progressão gradual e proporcional, sem concentração de panes graves | Nenhuma |
| `SK76-S-01/02` | Semestral 01/02: LOFT e Operação Noturna | Semestral | SK76 | GO (ressalva) | baixo-médio | Narrativa consistente; evidência LOFT só textual | Vínculo de metadado (decisão humana) |
| `SK76-S-02/02` | Semestral 02/02: LOFT e Check de IFR | Semestral | SK76 | AJUSTAR | baixo | Decisão 16 cumprida + resíduo "noturna" em 3 descrições-fase | Descrição-fase |
| `CRED-EXA` | Credenciamento de Examinador | Examinador | N/A | AJUSTAR | alto (governança) | Fusão `EXA-ETH-02`+`03`→`EXA-PAD-01` perde granularidade regulatória; `EXA-CND-01` com drift semântico não documentado no artefato ativo | Decisão humana + nota de rastreabilidade |
| `TRE-INST` | Treinamento de Instrutor de Voo | Instrutor | N/A | AJUSTAR | médio | `INV-CRM-04` (ética do instrutor) sem equivalente; assimetria com CRED-EXA | Decisão humana (reinserção) |

**Totais:** GO sem ressalva = 27, GO com ressalva = 3, AJUSTAR = 21, BLOQUEAR = 0. Total = 51.

---

## 6. Seção por grupo

### 6.1 AW139 Inicial (12 modelos)

GO: `A139-I-01/12`, `A139-I-03/12`, `A139-I-06/12`, `A139-I-07/12`, `A139-I-09/12`, `A139-I-10/12`, `A139-I-11/12`, `A139-I-12/12` (8).
AJUSTAR: `A139-I-02/12` (ordem interna: holding/navegação offshore aparecem depois de um pouso com vento cruzado), `A139-I-04/12` (9 de 18 itens duplicam literalmente `A139-I-03/12` — desperdício de progressão didática entre sessões consecutivas), `A139-I-05/12` (itens finais regridem a nível básico depois do clímax de aproximações), `A139-I-08/12` (termina em landing gear emergency sem resolução clara) (4).

Todas as decisões globais de implantação aplicáveis a este grupo (decisões 1, 2, 3, 4, 5, 13 do §4 da fonte primária) foram verificadas como corretamente implementadas nas tabelas, não apenas mencionadas em nota.

### 6.2 AW139 Periódico / Noturno / Semestral / Reaquisição (13 modelos)

GO: `A139-P-C1/VFR`, `A139-P-C2/VFR`, `A139-P-C3/VFR`, `A139-P-LOFT/OFFSHORE`, `A139-P-LOFT/CHECK` (5). GO com ressalva: `A139-S-01/02`, `A139-S-02/02` (2, ver seção 6.5). AJUSTAR: `A139-P-C1/IFR`, `A139-P-C2/IFR`, `A139-P-C3/IFR` (rótulo "noturno-offshore" sistematicamente sem conteúdo noturno/offshore em nenhuma das 3 sessões — achado transversal, ver seção 10), `A139-NOT-01`, `A139-NOT-02` (lacunas de segurança, ver seção 6.5), `A139-REQ-01` (concentração de emergências graves no final, desalinhada com o propósito de "reaquisição enxuta"; comparado desfavoravelmente com `S76-REQ-01`, que tem progressão gradual e proporcional) (6).

### 6.3 SK76/S76 Inicial (12 modelos)

GO: `SK76-I-01/12`, `SK76-I-02/12`, `SK76-I-04/12`, `SK76-I-06/12`, `SK76-I-07/12`, `SK76-I-08/12`, `SK76-I-10/12`, `SK76-I-11/12`, `SK76-I-12/12` (9). AJUSTAR: `SK76-I-03/12` (rótulo de fase final "validar frota", não pedagógico — artefato do processo de fechamento do target 51 vazando para a descrição operacional), `SK76-I-05/12` (item de recuperação de atitude anormal sem gatilho de falha precedente na mesma sessão), `SK76-I-09/12` (dois itens finais repetem tematicamente fumaça na bagagem já coberta antes, sem diferenciação didática clara) (3).

Decisões globais 6, 7, 8, 9, 14 do §4 verificadas como corretamente aplicadas. Confirmado que nenhuma mistura de família AW139 (`A139-*`, `CAU-*`, `WAR-*`) ocorre nos 12 modelos.

### 6.4 SK76/S76 Periódico / Noturno / Semestral / Reaquisição (14 modelos)

GO: `S76-P-C2/VFR`, `S76-P-C3/VFR`, `SK76-P-CHECK`, `S76-NOT-02`, `S76-REQ-01` (5). GO com ressalva: `SK76-S-01/02` (1, ver seção 6.5). AJUSTAR: `S76-P-C1/VFR` (encerramento "solto" em luz de cautela de combustível, sem decisão/pouso explícito), `S76-P-C1/IFR`, `S76-P-C2/IFR`, `S76-P-C3/IFR` (mesmo padrão sistemático de rótulo "noturno-offshore" sem conteúdo correspondente), `S76-NOT-01` (lacuna de black hole, ver seção 6.5), `SK76-S-02/02` (resíduo de descrição-fase "noturna" em sessão não-noturna, cosmético) (6).

**Achado transversal deste grupo (SK76) e do 6.2 (AW139):** os seis ciclos periódicos IFR de ambas as frotas (`A139-P-C1/IFR`, `A139-P-C2/IFR`, `A139-P-C3/IFR`, `S76-P-C1/IFR`, `S76-P-C2/IFR`, `S76-P-C3/IFR`) carregam o rótulo "IFR-noturno-offshore", mas nenhuma das 108 linhas técnicas contém manobra noturna (NVG, iluminação de pista/heliponto noturna) ou offshore-específica (`OPS-OFF-*`/`S76-APO-01`/`S76-TDP-00`/`S76-LDP-00`). Em contraste, os ciclos VFR irmãos incluem corretamente itens offshore reais quando o contexto é genuíno (ex.: `A139-P-C2/VFR` tem `OPS-OFF-X2`). Isso é o mesmo tipo de divergência nome↔conteúdo que a decisão global 13/14 já corrigiu para as sessões iniciais — mas não foi corrigido aqui porque estes ciclos pertencem à trilha de preservação de nomes operacionais legados. Recomendação: decisão humana única e consistente para as 6 sessões (renomear removendo "noturno-offshore", ou inserir pelo menos 1 manobra real noturna/offshore por ciclo em substituição a um item redundante).

### 6.5 LOFT / Check (13 modelos: `A139-I-11/12`, `A139-I-12/12`, `A139-P-LOFT/OFFSHORE`, `A139-P-LOFT/CHECK`, `SK76-I-11/12`, `SK76-I-12/12`, `SK76-P-CHECK`, mais as 4 sessões semestrais + 2 noturnas com lacuna de black hole)

**Sessões com evidência LOFT por código dedicado (7 modelos) — todas GO:** `A139-I-11/12`, `A139-I-12/12`, `A139-P-LOFT/OFFSHORE`, `A139-P-LOFT/CHECK`, `SK76-I-11/12`, `SK76-I-12/12`, `SK76-P-CHECK`. Todas usam famílias `LOFT-CHK-*`/`LOFT-OFF-*` dedicadas, com `LOFT-CHK-23` corretamente posicionado como evento de rota/aproximação antes do pouso (decisão 5), e as versões "Check"/avaliativas reusam integralmente a sequência de treino correspondente sem introduzir conteúdo novo — cumprindo a regra de que uma avaliação não pode testar o que não foi ensinado.

**Sessões semestrais com evidência LOFT apenas textual (4 modelos) — GO com ressalva:** `A139-S-01/02`, `A139-S-02/02`, `SK76-S-01/02`, `SK76-S-02/02`. O loader (`simuladores-matriz-v6-data.mjs:180`) aceita evidência LOFT por dois caminhos: código `LOFT-*` nas 18 técnicas OU bloco de texto `Enquadramento LOFT` no documento-fonte. As 4 sessões semestrais usam exclusivamente o segundo caminho. A auditoria verificou item a item que a narrativa declarada (evento principal/secundário, decisão operacional, critério de encerramento) é **tecnicamente consistente** com a tabela de 18 itens em todos os 4 casos — não é uma nota decorativa desconectada. Mas a "estrutura de cenário real" existe apenas como texto solto no markdown-fonte, sem vínculo de código ou metadado que sobreviva a uma leitura apenas da ficha técnica. Recomendação: vincular um metadado estrutural de caráter LOFT ao modelo (não às técnicas), para que a evidência não dependa exclusivamente de texto livre.

**Achado de segurança consolidado (afeta 6 sessões noturnas/semestrais, 3 delas com LOFT no nome):**

| Lacuna | Frota | Sessões afetadas | Código legado descontinuado sem substituto |
|---|---|---|---|
| Ilusão visual noturna / "black hole effect" | AW139 | `A139-NOT-01`, `A139-NOT-02`, `A139-S-01/02` | `LOFT-NOT-31` |
| Ilusão visual noturna / "black hole effect" | SK76 | `S76-NOT-01`, `S76-NOT-02`, `SK76-S-01/02` | `S76-LOFT-23`, `S76-LOFT-33` |
| Autorrotação noturna dedicada | AW139 (onshore) | `A139-NOT-01`, `A139-S-01/02` (por herança) | `LOFT-NOT-30` |

Confirmado por leitura direta das 6 tabelas ativas: nenhuma contém item nomeado de ilusão visual noturna. A assimetria de autorrotação (SK76 tem em ambas as sessões noturnas; AW139 só tem na offshore) sugere que a omissão em `A139-NOT-01` é efeito colateral não deliberado da compressão 22→18, não uma decisão de escopo. Ambas as lacunas já estavam classificadas no mapa de equivalência como "bloquear para arquivamento — exige decisão humana" / "exige decisão humana"; esta auditoria confirma essas classificações de forma independente por leitura direta das tabelas de produção ativas. **Tratadas como candidatas a decisão humana, não como bloqueio** (instrução explícita do escopo desta auditoria).

### 6.6 TRE-INST / CRED-EXA (2 modelos)

Ambos **AJUSTAR** (nenhum GO puro, nenhum BLOQUEAR). Ambos têm lógica de processo pedagógico/avaliativo real — não são listas administrativas disfarçadas: `TRE-INST` progride planejar→brifar→demonstrar→supervisionar→gerenciar erro do aluno→instruir emergências em ordem crescente de criticidade→avaliar→debriefing; `CRED-EXA` progride base normativa→planejamento→condução→julgamento/segurança→decisão→debriefing→governança.

**Achado central — assimetria de ética instrutor vs. examinador:** `CRED-EXA` tem `EXA-ETH-01` ("Imparcialidade, isenção e ética do examinador") ativo como uma das 18 técnicas. `TRE-INST` **não tem nenhum equivalente**: o item legado `INV-CRM-04` ("Postura e Ética do Instrutor") foi comprimido para fora do modelo sem realocação, e nenhum dos 15 NOTECHS cobre ética/conduta profissional (os NOTECHS tratam de CRM operacional em voo, não de conduta do instrutor como formador). Os dois modelos passaram pelo mesmo processo de compressão (22→18, mesma decisão 12 do §4), tratados como pares estruturais na matriz de aceite prévia — não há justificativa documentada de por que o exame preservou ética formal e a instrução não. Risco: médio (lacuna de conteúdo, não de segurança de voo, conforme instrução explícita do escopo). Correção recomendada: decisão humana sobre reinserir ética/postura do instrutor como item nomeado.

**Achado adicional em `CRED-EXA` — fusão de governança:** `EXA-ETH-02` ("Padronização Operacional") e `EXA-ETH-03` ("Representatividade da Autoridade Aeronáutica") — dois construtos de risco regulatório distintos — foram fundidos em um único item ativo, `EXA-PAD-01`. Uma ficha que funde os dois perde a capacidade de apontar, de forma auditável, qual dos dois falhou quando um examinador é questionado — exatamente o tipo de granularidade que uma auditoria ANAC tenderia a exigir. Risco: alto (governança/rastreabilidade), não bloqueante para uso corrente.

**Achado adicional em `CRED-EXA` — `EXA-CND-01` drift semântico:** o código `EXA-CND-01` existe em ambas as versões, mas com significado invertido — legado = "Planejar um Exame de Proficiência", V6.2 ativo = "Condução do exame de proficiência" (equivalente ao antigo `EXA-CND-03`). O drift está documentado no mapa de equivalência (artefato de análise read-only), mas **não há nenhuma nota equivalente no documento operacional ativo** (`final.md`, onde o código aparece vigente). Risco de rastreabilidade histórica: médio-alto (qualquer ficha/relatório pré-V6.2 citando o código refere-se a outra coisa); risco pedagógico atual: baixo. Correção recomendada: nota de rastreabilidade no documento operacional ativo, não apenas no mapa de arquivamento.

### 6.7 NOTECHS / CRM (transversal, 51 modelos)

**Veredito do mecanismo: AJUSTAR** (não GO, não BLOQUEAR — ver seção 11 para detalhamento). Confirmação estrutural 100%: 918/918 linhas técnicas livres de contaminação por `NOTECHS-*`/`INV-CRM-*`/`EXA-NTS-*` (leitura integral + grep programático, zero exceções). Taxonomia canônica correta e consistente em três locais independentes (`worker-airtrust/src/constants/notechs.ts`, `src/react-app/pages/simuladores/fichas/notechs.ts`, ambos os mapas de equivalência); nenhum resíduo da taxonomia antiga.

Quatro achados de ajuste, nenhum bloqueante:
1. **Guardrail ausente:** `validateModels()` não rejeita explicitamente NOTECHS/INV-CRM/EXA-NTS dentro das técnicas; pior, `APPROVED_CODE_RE` inclui esses prefixos como "válidos em geral", então uma contaminação futura passaria despercebida.
2. **Aplicação genérica a TRE-INST/CRED-EXA:** os 15 NOTECHS descrevem CRM de tripulação em voo, aplicados sem adaptação a sessões N/A de instrutor/examinador.
3. **`INV-CRM-04` sem equivalente:** confirmado do ângulo NOTECHS — nenhum dos 15 itens cobre ética/postura do instrutor (mesmo achado da seção 6.6, agora confirmado também pela ausência nos NOTECHS).
4. **Critério de avaliação não calibrado:** os 60 descritores (15×4 faixas) em `notechs.ts` carregam aviso explícito de que não foram verificados contra a ficha fonte da empresa; não há definição documentada de quem avalia NOTECHS.

---

## 7. Lista de bloqueadores

**Nenhum.** Os 51 modelos foram classificados GO (30, incluindo 3 com ressalva) ou AJUSTAR (21). Nenhum modelo exige redesenho completo antes de ser considerado utilizável operacionalmente.

---

## 7A. Correções aprovadas pelo owner e encaminhadas para PR

As decisões humanas pendentes desta auditoria foram aprovadas pelo owner e encaminhadas para a PR de correção pedagógica da V6.2, sem alterar o escopo estrutural `51/918/15`:

- reordenação pontual em `A139-I-02/12`, `A139-I-05/12`, `A139-I-08/12` e `A139-P-C2/IFR`;
- desduplicação didática de `A139-I-04/12`;
- limpeza de descrição/fase em `SK76-I-03/12`, `SK76-I-05/12`, `SK76-I-09/12`, `S76-P-C1/VFR`, `A139-S-02/02` e `SK76-S-02/02`;
- renomeação consistente dos 6 ciclos `IFR-noturno-offshore` para `IFR-emergências`, sem inserir conteúdo artificial apenas para defender o nome;
- reinserção rastreável de ilusão visual noturna / black hole nas 6 sessões aprovadas usando código atual, sem reativar famílias LOFT legadas;
- reinserção de autorrotação noturna dedicada AW139 em `A139-NOT-01` e `A139-S-01/02`;
- reforço de governança em `TRE-INST` e `CRED-EXA`, com ética/postura do instrutor rastreável, nota documental para o drift de `EXA-CND-01` e separação explícita das rubricas de `EXA-PAD-01`;
- endurecimento dos guardrails para impedir `NOTECHS-*`, `INV-CRM-*` e `EXA-NTS-*` dentro das 18 técnicas e para validar as novas exigências noturnas/LOFT/governança.

---

## 8. Lista de ajustes pontuais (correção de nome, ordem, descrição-fase ou troca de manobra — sem necessidade de decisão humana prévia)

| Modelo | Ajuste | Tipo |
|---|---|---|
| `A139-I-02/12` | Reordenar holding/navegação offshore para antes do bloco de aproximação/pouso | Ordem |
| `A139-I-04/12` | Substituir bloco de avionics/displays duplicado de I-03/12 por conteúdo não coberto | Troca de manobra |
| `A139-I-05/12` | Mover bloco básico final (checklist/transição/AFCS) para antes das aproximações | Ordem |
| `A139-I-08/12` | Reordenar landing gear emergency para antes do bloco de autorrotação/flare | Ordem |
| `A139-P-C1/IFR`, `A139-P-C2/IFR`, `A139-P-C3/IFR`, `S76-P-C1/IFR`, `S76-P-C2/IFR`, `S76-P-C3/IFR` | Renomear removendo "noturno-offshore" OU inserir manobra real noturna/offshore (decisão humana única para as 6) | Nome / decisão humana |
| `A139-P-C2/IFR` | Reordenar landing gear emergency (mesmo problema de A139-I-08/12) | Ordem |
| `SK76-I-03/12` | Corrigir descrição-fase "Mini-cenário final / validar frota" para algo pedagógico | Descrição-fase |
| `SK76-I-05/12` | Mover ou justificar `S76-UAR-00` sem gatilho de falha precedente | Ordem / descrição-fase |
| `SK76-I-09/12` | Confirmar se itens finais duplicam item #8 (fumaça bagagem); se sim, substituir | Troca de manobra (pendente confirmação) |
| `S76-P-C1/VFR` | Explicitar fase de decisão/encerramento no item final | Descrição-fase |
| `A139-S-02/02`, `SK76-S-02/02` | Remover resíduo de descrição-fase "noturna" em sessões não-noturnas | Descrição-fase |

---

## 9. Lista de decisões humanas necessárias

1. **Rótulo "noturno-offshore" nos 6 ciclos periódicos IFR** (`A139-P-C1/IFR`, `A139-P-C2/IFR`, `A139-P-C3/IFR`, `S76-P-C1/IFR`, `S76-P-C2/IFR`, `S76-P-C3/IFR`): confirmar se é rótulo de agrupamento administrativo aceitável sem conteúdo dedicado, ou se deve ganhar conteúdo real.
2. **Ilusão visual noturna / black hole effect** ausente em `A139-NOT-01`, `A139-NOT-02`, `A139-S-01/02`, `S76-NOT-01`, `S76-NOT-02`, `SK76-S-01/02`: decidir se deve ser reintroduzida como item nomeado com código novo (nunca reativando `LOFT-NOT-31`/`S76-LOFT-23`/`S76-LOFT-33`).
3. **Autorrotação noturna dedicada** ausente em `A139-NOT-01`/`A139-S-01/02`: decidir se a cobertura em `A139-NOT-02` (offshore) é suficiente para a frota AW139, ou se deve ser reintroduzida na trilha onshore.
4. **Concentração de emergências graves em `A139-REQ-01`** (fogo de motor + autorrotação + emergência de trem no final): confirmar se é intencional para reaquisição pós-afastamento prolongado ou se deve ser simplificada (comparar com `S76-REQ-01`, mais gradual).
5. **Evidência LOFT apenas textual** nas 4 sessões semestrais: decidir sobre vincular metadado estrutural de caráter LOFT ao modelo.
6. **`INV-CRM-04` (ética/postura do instrutor) sem equivalente em `TRE-INST`**: decidir sobre reinserção como item nomeado, preferencialmente na mesma rodada que a decisão 7 abaixo (mesmo eixo de governança).
7. **Fusão `EXA-ETH-02`+`EXA-ETH-03`→`EXA-PAD-01` em `CRED-EXA`**: decidir se deve ser desdobrada novamente (via rubrica/descritor, não necessariamente novo código) para preservar granularidade regulatória.
8. **`EXA-CND-01` drift semântico**: decisão de produto/curricular sobre registrar nota de rastreabilidade permanente no documento operacional ativo (não apenas no mapa de arquivamento).
9. **Mecanismo NOTECHS aplicado sem adaptação a `TRE-INST`/`CRED-EXA`**: decidir se sessões N/A deveriam ter conjunto NOTECHS adaptado ou descritor de aplicação contextualizada.
10. **Calibração dos 60 descritores de avaliação NOTECHS**: revisão por instrutor-chefe/gestor de treinamento antes de tratar a régua como operacionalmente validada; definição de quem avalia NOTECHS em cada sessão.

---

## 10. Lista de possíveis lacunas de conteúdo

- Ilusão visual noturna / black hole effect: 6 sessões noturnas/semestrais sem item nomeado (ver seção 6.5).
- Autorrotação noturna dedicada: `A139-NOT-01` e `A139-S-01/02`.
- Ética/postura profissional do instrutor: `TRE-INST` (nenhum item nas 18 técnicas nem nos 15 NOTECHS).
- Granularidade de padronização vs. representatividade da autoridade no `CRED-EXA` (fusão ETH-02/03→PAD-01).
- Conteúdo noturno/offshore real nos 6 ciclos periódicos IFR rotulados como tal.
- Guardrail automático contra contaminação futura de NOTECHS/INV-CRM/EXA-NTS dentro das 18 técnicas (ausente no loader).
- Adaptação do mecanismo NOTECHS para sessões N/A (`TRE-INST`/`CRED-EXA`).
- Validação/calibração dos descritores de avaliação NOTECHS contra o padrão específico da empresa.

(Lacunas de manobras legadas sem código ativo equivalente — `S76-BHT-52`, `S76-BTO-51`, `S76-UGE-46`, `CAU-CND-61`, `CAU-NGO-63`, `CAU-TNF-62` — já estavam documentadas em `matriz-v6-2-equivalence-map-before-archive.md` antes desta auditoria; confirmadas aqui de forma independente pelos subagentes dos grupos 1 e 2, sem novo achado adicional.)

---

## 11. Recomendações de correção priorizadas

**Prioridade 1 (governança/regulatório, risco alto):**
1. Decisão humana conjunta sobre `INV-CRM-04` (TRE-INST) e fusão `EXA-ETH-02`/`03` (CRED-EXA) — mesmo eixo de governança, tratamento simétrico recomendado.
2. Nota de rastreabilidade sobre `EXA-CND-01` no documento operacional ativo.

**Prioridade 2 (lacunas de conteúdo de segurança, risco médio-alto):**
3. Decisão humana sobre ilusão visual noturna/black hole (6 sessões) e autorrotação noturna (`A139-NOT-01`).

**Prioridade 3 (ajustes pontuais de baixo esforço, risco médio):**
4. Correções de ordem em `A139-I-02/12`, `A139-I-05/12`, `A139-I-08/12`, `A139-P-C2/IFR`, `SK76-I-05/12`.
5. Troca/revisão de manobra duplicada em `A139-I-04/12`, `SK76-I-09/12`.
6. Decisão única e consistente sobre nome "noturno-offshore" nos 6 ciclos periódicos IFR.

**Prioridade 4 (cosmético/estrutural de baixo risco):**
7. Correções de descrição-fase em `SK76-I-03/12`, `S76-P-C1/VFR`, `A139-S-02/02`, `SK76-S-02/02`.
8. Vínculo de metadado estrutural de caráter LOFT nas 4 sessões semestrais.
9. Guardrail automático no loader contra contaminação NOTECHS/INV-CRM/EXA-NTS dentro das técnicas + teste unitário correspondente.

---

## 12. GO/NO-GO

| Decisão | Veredito | Justificativa |
|---|---|---|
| Manter a matriz como base técnica em produção | **GO** | Nenhum modelo bloqueador; estrutura 51/918/15 é sólida e operacionalmente aplicável; os 21 AJUSTAR são correções pontuais ou decisões humanas registradas, não erros estruturais de segurança de sequência. |
| Gerar PDFs/fichas finais | **NO-GO condicional** | Não gerar PDFs finais até que as decisões de prioridade 1 (governança TRE-INST/CRED-EXA) e prioridade 2 (lacunas de segurança noturna) sejam resolvidas ou explicitamente aceitas pelo owner como risco residual conhecido. Gerar PDF de uma ficha com lacuna de ética não documentada, por exemplo, cristalizaria o problema em um artefato distribuído. |
| Abrir PR de correção pedagógica | **GO condicional** | Recomenda-se abrir PR(s) separada(s) para os ajustes de prioridade 3 e 4 (ordem, troca de manobra, descrição-fase, nome, guardrail), que não dependem de decisão humana externa. As correções de prioridade 1 e 2 devem aguardar decisão humana antes de virar PR. |
| Abrir PR de soft-archive | **NO-GO nesta etapa** | Fora do escopo desta auditoria pedagógica; depende das decisões humanas pendentes já registradas em `matriz-v6-2-equivalence-map-before-archive.md` e `matriz-v6-2-exa-equivalence-map-before-archive.md`, que não foram alteradas por este documento. |

---

## Confirmações finais

- ✅ Nenhuma alteração de produção, banco, migration ou deploy.
- ✅ Nenhum DELETE/UPDATE/INSERT executado.
- ✅ Nenhuma manobra apagada, arquivada ou desativada.
- ✅ Nenhuma alteração em loader, matriz, fichas existentes, sessões já criadas, avaliações, notas, assinaturas, comentários ou histórico.
- ✅ Qualificações, LMS/SCORM, RBAC/auth/multi-tenant não tocados.
- ✅ Nenhum PDF final gerado.
- ✅ Nada neste documento constitui homologação, aprovação ou aceite pela ANAC.
- ✅ Contagem de 18 técnicas/15 NOTECHS não foi tratada como evidência suficiente — cada modelo foi avaliado por conteúdo, sequência, progressão e coerência.

---

*Documento exclusivamente analítico e read-only, consolidado a partir de 5 auditorias independentes em paralelo (AW139 Inicial/Periódico; SK76/S76 Inicial/Periódico; LOFT/Noturno/Semestral/Reaquisição; TRE-INST/CRED-EXA; NOTECHS/CRM transversal).*
