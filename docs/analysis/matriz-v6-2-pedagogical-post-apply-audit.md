# Matriz V6.2 Pedagógica — Auditoria Pós-Apply em Produção

**Data:** 2026-07-05
**Caráter:** documental, read-only. Não é revisão de código, não é homologação, aprovação ou aceite pela ANAC.
**Escopo:** estado de produção (empresa_id=6, Costa do Sol) após o apply da Matriz V6.2 Pedagógica no SHA `68f65d8a2852785a2a4c160de95511fa0e0d3633`.
**Método de execução:** todas as reconciliações desta seção foram feitas via `wrangler d1 execute --env production --remote --command="SELECT ..."` (uma consulta por vez, com `--json`, para capturar os resultados reais linha a linha — o modo `--file` do wrangler para múltiplos statements retorna apenas um sumário agregado, não as linhas). Nenhum `UPDATE`/`DELETE`/`INSERT` foi executado nesta auditoria.

---

## 1. Resumo executivo

O apply da Matriz V6.2 Pedagógica em produção (SHA `68f65d8a`) foi confirmado tecnicamente correto nas 14 checagens do script oficial `POST_APPLY_VALIDATION.sql`: 51 modelos ativos não-TEST, 918 técnicas (18 por modelo, zero exceções), 15 NOTECHS no catálogo e zero contaminação de NOTECHS/`INV-CRM-*`/`EXA-NTS-*` dentro das técnicas, os novos códigos (`OPS-NOT-X1`, `A139-AUT-03`, `INV-ETH-01`) exatamente nas sessões previstas, os 6 ciclos IFR renomeados, os 5 modelos legados SK76 desativados sem nenhuma ficha vinculada, e as tabelas de histórico (`fichas_sessao`=224, `fichas_sessao_manobras`=4706, `simulador_agendamentos`=108) preservadas byte a byte.

Indo além dessa contagem estrutural — que por si só não é evidência suficiente de qualidade, conforme já estabelecido pela auditoria anterior —, esta auditoria fez reconciliação item a item dos 21 AJUSTAR anteriores contra o estado real do banco de produção (não apenas contra o arquivo-fonte da matriz). O resultado é misto e revela um padrão estrutural importante:

**Achado central desta auditoria:** o script de apply regenera corretamente a **ordem e a composição** das 18 técnicas por modelo (`modelos_sessao_manobras.ordem` + inserção/remoção de vínculos), mas **não atualiza o texto (`nome`/`descricao`) de manobras já existentes no catálogo `manobras`** quando o único ajuste necessário era de redação. Como várias técnicas são compartilhadas entre múltiplos modelos (mesmo `manobra_id` referenciado por `A139-I-01/12`, `A139-NOT-01`, `A139-S-02/02`, etc.), correções de "resíduo de descrição" documentadas no arquivo-fonte (`airtrust_matriz_v6_2_todas_sessoes_manobras_final.md`, commit `92d3a893`) e na `matriz-v6-2-acceptance-matrix-51-modelos.md` **não chegaram à ficha real**: a técnica `A139-CKL-01` ainda mostra "preparação **noturna**" e `A139-EST-01` ainda mostra "pós-voo **noturno**" dentro de `A139-S-02/02` (uma sessão semestral não-noturna), o mesmo ocorrendo em `SK76-S-02/02`. O mesmo padrão explica por que `EXA-CND-01` continua com o nome legado "Planejar um Exame de Proficiência" em produção, apesar da nota de rastreabilidade ter sido adicionada ao documento-fonte — ver Tarefa 2, itens 9, 10, 11 e 17.

Reordenações e trocas de manobra (que mexem em `ordem`/vínculos, não em texto de manobra pré-existente) **foram corretamente aplicadas e verificadas em produção**: `A139-I-02/12`, `A139-I-04/12` (desduplicação), `A139-I-05/12`, `A139-I-08/12`, `A139-P-C2/IFR`, `SK76-I-09/12`. As lacunas de segurança de conteúdo (black hole noturno, autorrotação noturna AW139, ética do instrutor) **foram corretamente resolvidas com código novo e rastreável**, confirmado em produção.

**Nenhuma regressão de sequência foi introduzida.** Nenhuma sessão termina em item de voo após pouso/corte/encerramento nas 9 sessões verificadas diretamente que receberam conteúdo novo ou reordenação. Nenhuma alteração tocou fichas, sessões, agendamentos, histórico, LMS, Qualificações ou RBAC — confirmado por contagem idêntica pré/pós-apply.

**GO/NO-GO resumido:** manter a matriz aplicada como base técnica — **GO**. Gerar PDFs/fichas finais usando `CRED-EXA` — **NO-GO** até corrigir o conteúdo real de `EXA-CND-01` no catálogo (ficha atual exibiria duas linhas de "planejamento" quase idênticas sob códigos diferentes). Demais fichas — **GO condicional**, ver seção 12.

---

## 2. Estado técnico pós-apply

| Item | Fonte | Estado |
|---|---|---|
| HEAD local / origin/main | `git log` | `68f65d8a2852785a2a4c160de95511fa0e0d3633`, ambos alinhados |
| Working tree | `git status` | limpo, exceto 2 arquivos untracked não relacionados a esta auditoria (`docs/analysis/SIMULADORES_MATRIZ_V6_FINAL_EXECUTION_MASTER_20260704.md`, `obsidian-vault/`) |
| Backup pré-apply | `artifacts/db-backups/matriz-v6-2-pedagogical-final-pre-apply-20260705T193250Z-68f65d8a/` | presente, 7 tabelas + `CHECKSUMS.sha256` + `MANIFEST.md` |
| SQL de apply | `GENERATED_DELTA_SQL.sql` (3363 linhas) | zero `DELETE`/`DROP`/`ALTER`; escreve somente em `modelos_sessao`, `modelos_sessao_manobras`, `manobras`; 1 ocorrência de `INSERT OR REPLACE` |
| Rollback | `ROLLBACK_PLAN_FINAL.md` | escopo restrito a tabelas de template, não toca fichas/sessões/agendamentos/histórico |

---

## 3. Reconciliação técnica 51/918/15 (Tarefa 1 — 14/14 checagens PASS)

Todas as consultas abaixo foram executadas via `wrangler d1 execute --env production --remote` contra `airtrust-db` (`7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae`, `served_by: v3-prod`).

| # | Checagem | Esperado | Resultado real | Status |
|---:|---|---|---|:---:|
| 1 | Modelos ativos não-TEST | 51 | **51** | ✅ |
| 2 | Técnicas ativas | 918 | **918** | ✅ |
| 3 | Modelos com contagem de técnicas ≠ 18 | 0 linhas | **0 linhas** | ✅ |
| 4 | NOTECHS distintos no catálogo | 15 | **15** | ✅ |
| 5 | NOTECHS dentro das 18 técnicas | 0 | **0** | ✅ |
| 6 | `INV-CRM-*` dentro das 18 técnicas | 0 | **0** | ✅ |
| 7 | `EXA-NTS-*` dentro das 18 técnicas | 0 | **0** | ✅ |
| 8 | `OPS-NOT-X1` nas 6 sessões previstas | `A139-NOT-01/02`, `A139-S-01/02`, `S76-NOT-01/02`, `SK76-S-01/02` | exatamente essas 6 | ✅ |
| 9 | `A139-AUT-03` nas 2 sessões previstas | `A139-NOT-01`, `A139-S-01/02` | exatamente essas 2 | ✅ |
| 10 | `INV-ETH-01` em `TRE-INST` | `TRE-INST` | `TRE-INST` (única linha) | ✅ |
| 11 | 6 ciclos `*-P-C*/IFR` renomeados | "IFR-emergências" | 6/6 confirmados | ✅ |
| 12 | Resíduo "IFR-noturno-offshore" | 0 | **0** | ✅ |
| 13 | Tabelas históricas preservadas | 224 / 4706 / 108 | **224 / 4706 / 108** (idêntico ao backup) | ✅ |
| 14 | 5 modelos legados SK76 (ids 39–43) desativados | `ativo=0` | 5/5 `ativo=0` | ✅ |

**Checagem adicional (não estava no script oficial, mas exigida pelo prompt do owner — "zero fichas vinculadas aos 5 legados"):** consulta cobrindo os 4 caminhos possíveis de vínculo (`fichas_sessao.template_id`, `fichas_sessao.atribuicao_curricular_id → simulador_atribuicoes_curriculares.modelo_sessao_id`, `simulador_agendamentos.template_id`, e o fallback textual `fichas_sessao.tipo_sessao = modelos_sessao.codigo`) — **0 em todos os 4 caminhos**. Confirmado independentemente.

---

## 4. Tabela dos 21 AJUSTAR — reconciliação pós-apply

Classificação baseada em consulta direta a produção (`modelos_sessao_manobras` join `manobras`, com `ordem` e `updated_at`), não apenas no arquivo-fonte.

| # | Item | Veredito | Evidência |
|---:|---|:---:|---|
| 1 | `A139-I-02/12` — holding/offshore após pouso com vento cruzado | **RESOLVIDO** | Produção: holding (#9) e offshore (#10) agora precedem o bloco de aproximação/pouso (#16 vento cruzado, #17–18 taxi/estacionamento). |
| 2 | `A139-I-04/12` — 9/18 itens duplicavam `A139-I-03/12` | **RESOLVIDO** | Produção: bloco duplicado substituído por `OPS-NAV-X2`, `A139-SCN-02`, `A139-VMA-01`, `A139-ORI-01`, `CAU-AHR-47`, `CAU-ADC-48`, `CAU-GPS-52`, `CAU-FMS-51`, `A139-CKL-02`, `OPS-NAV-X1`; zero sobreposição literal com I-03/12. |
| 3 | `A139-I-05/12` — itens finais regridem a nível básico após clímax | **RESOLVIDO** | Produção: bloco básico (checklist/AFCS/FMA) movido para posições 8–11 (meio), aproximações e missed approach nas posições 13–18 (fim). |
| 4 | `A139-I-08/12` — termina em landing gear emergency sem resolução | **RESOLVIDO** | Produção: `WAR-GER-27` na posição 13, seguido por sequência completa de autorrotação/recuperação (14–18); sessão não termina mais em pane sem resolução. |
| 5 | `A139-P-C2/IFR` — nome + landing gear emergency no final | **RESOLVIDO** | Nome confirmado "Ciclo 2 / IFR-emergências" (item 11 da Tarefa 1). Produção: `WAR-GER-27` movido para #15, aproximações (#16–18) depois, mesmo padrão de encerramento dos ciclos VFR irmãos. |
| 6 | `SK76-I-03/12` — item final com rótulo de fase "validar frota" | **RESOLVIDO COM RESSALVA** | O texto "Fase" do markdown-fonte foi corrigido para "encerramento técnico". Porém: a coluna "Fase" **nunca é persistida em produção** — nem `modelos_sessao_manobras.observacoes` (vazio) nem `manobras` têm coluna equivalente. É um campo de documentação/guardrail do loader, não um campo renderizado em ficha. Risco real ao aluno/instrutor: nenhum, pois o campo nunca esteve visível em produção. |
| 7 | `SK76-I-05/12` — recuperação de atitude anormal sem gatilho de falha precedente | **RESOLVIDO COM RESSALVA** | O markdown-fonte enriqueceu a descrição do item para "após perda momentânea de referências". Em produção, o catálogo `manobras` (`S76-UAR-00`, `updated_at=2026-05-13`, não tocado por este apply) ainda mostra apenas "Recuperação Atitudes Anormais" e a posição (#10) não mudou — nenhum item de falha precedente foi inserido antes. A melhoria de redação não chegou à ficha real. |
| 8 | `SK76-I-09/12` — itens finais repetem fumaça/bagagem já cobertos | **RESOLVIDO** | Produção: posições 17–18 agora são `76-APXOI` (aproximação IFR OEI) e `76-APXAL` (aproximação alternada Cat. A), substituindo a repetição temática de fumaça na bagagem. |
| 9 | `S76-P-C1/VFR` — encerramento em luz de cautela de combustível sem decisão clara | **NÃO RESOLVIDO EM PRODUÇÃO** | O markdown-fonte adicionou "— decisão de retorno e encerramento" ao item final. Em produção, `manobras.nome` para `S76-FFM-32` (`updated_at=2026-05-13`, não tocado por este apply) permanece "Fluxo de Combustível fora do Normal", sem a decisão explícita. A ficha real ainda encerra sem o texto de decisão. |
| 10 | `A139-S-02/02` — resíduo "noturna" em sessão não-noturna | **NÃO RESOLVIDO EM PRODUÇÃO** | O markdown-fonte remove "noturna"/"noturno" de `A139-CKL-01` (item 1) e `A139-EST-01` (item 18) especificamente para esta sessão. Em produção, ambos os `manobra_id` são **compartilhados** com outras sessões (ex. `A139-NOT-01`, onde "noturna" é correto) e o catálogo (`updated_at=2026-07-04`, anterior a este apply) não foi alterado — a ficha real de `A139-S-02/02` ainda mostra "preparação noturna" / "corte pós-voo noturno". Limitação estrutural: o schema atual não permite override de texto por vínculo modelo↔manobra. |
| 11 | `SK76-S-02/02` — mesmo resíduo "noturna" | **NÃO RESOLVIDO EM PRODUÇÃO** | Mesmo padrão do item 10: `S76-CKL-01`/`S76-EST-01` compartilhados, catálogo não tocado (`updated_at=2026-07-04`), ficha real ainda mostra "noturna"/"noturno". |
| 12 | 6 ciclos IFR renomeados | **RESOLVIDO** | Confirmado item 11 da Tarefa 1 (todos os 6 com "IFR-emergências"). |
| 13 | Lacunas noturnas / black hole (6 sessões) | **RESOLVIDO** | `OPS-NOT-X1` confirmado presente e corretamente posicionado (antes do bloco de aproximação/pouso) nas 6 sessões: `A139-NOT-01` (#7), `A139-NOT-02` (#8), `A139-S-01/02` (#7), `S76-NOT-01` (#7), `S76-NOT-02` (#6), `SK76-S-01/02` (#8). |
| 14 | Autorrotação noturna dedicada AW139 | **RESOLVIDO** | `A139-AUT-03` confirmado presente em `A139-NOT-01` (#14) e `A139-S-01/02` (#14), corretamente posicionado antes da aproximação final. |
| 15 | `TRE-INST` — ética/postura do instrutor | **RESOLVIDO** | `INV-ETH-01` confirmado na posição #6 de `TRE-INST`, substituindo `INV-CGE-06` (meteorologia, que passa a ser pressuposto na base técnica, não uma linha própria). 18 técnicas preservadas. |
| 16 | `CRED-EXA` — fusão `EXA-ETH-02`+`03`→`EXA-PAD-01` | **RESOLVIDO COM RESSALVA** | Decisão de manter código único documentada no arquivo-fonte ("rubricas separadas"). Mas `manobras.nome` de `EXA-PAD-01` em produção (`updated_at=2026-07-05 14:53:38`, anterior ao apply final) **não** contém a anotação "(rubricas separadas)", e não existe nenhum mecanismo de rubrica/descritor dual implementado (ao contrário do que existe para NOTECHS, com 60 descritores). A decisão foi tomada, mas não operacionalizada — a lacuna de auditabilidade regulatória (impossível apontar qual dos dois construtos falhou) permanece de fato. |
| 17 | Drift semântico `EXA-CND-01` | **NÃO RESOLVIDO EM PRODUÇÃO** — achado mais relevante desta auditoria | A nota de rastreabilidade foi adicionada ao **documento de análise** (`airtrust_matriz_v6_2_todas_sessoes_manobras_final.md`), afirmando que `EXA-CND-01` agora significa "condução do exame" e que planejamento passou a `EXA-PLN-01`. **Mas o registro real no catálogo `manobras` (`id=726`, `updated_at=2026-03-26`, nunca tocado por nenhum apply desta série) continua com `nome='Planejar um Exame de Proficiencia'`** — o significado legado, exatamente o que a nota diz que não é mais verdade. Resultado prático: a ficha de `CRED-EXA` hoje mostraria a técnica #6 `EXA-PLN-01` ("Planejamento do exame de proficiência") e a técnica #10 `EXA-CND-01` ("Planejar um Exame de Proficiencia") como duas linhas quase idênticas, quando a intenção documentada era que #10 representasse condução, não planejamento duplicado. Ver Seção 11. |
| 18 | NOTECHS aplicado sem adaptação a `TRE-INST`/`CRED-EXA` | **RESOLVIDO COM RESSALVA** | Nota de contextualização adicionada ao documento-fonte ("devem ser interpretados no contexto de instrução/exame... não como CRM puro"). Nenhuma mudança de código: os mesmos 15 NOTECHS e os mesmos 60 descritores em `notechs.ts` se aplicam sem variação por tipo de sessão. A nota orienta o avaliador humano, mas não há mecanismo de aplicação diferenciada no sistema. |
| 19 | Calibração dos 60 descritores NOTECHS | **NÃO RESOLVIDO** | `src/react-app/pages/simuladores/fichas/notechs.ts` mantém, sem alteração, o aviso "ESTE CONTEÚDO NÃO FOI VERIFICADO CONTRA A FICHA FONTE ESPECÍFICA DA EMPRESA" (linha 13). Este apply não tocou esse arquivo. |
| 20 | Metadado estrutural de caráter LOFT | **NÃO RESOLVIDO** | Confirmado em duas camadas: (a) `modelos_sessao` não tem nenhuma coluna de flag/caráter LOFT; (b) o loader (`simuladores-matriz-v6-data.mjs:184-195`) continua detectando evidência LOFT apenas por regex `LOFT-(CHK\|OFF\|NOT)-` no código OU por texto livre `/enquadramento loft/i` nas notas — nenhum campo estrutural novo foi adicionado. As 4 sessões semestrais continuam dependendo exclusivamente do caminho textual. |
| 21 | `A139-REQ-01` — concentração de emergências graves no final | **NÃO RESOLVIDO / DECISÃO PENDENTE** | Produção mostra sequência final ainda concentrada: `CAU-FLO-73` (#12), `WAR-OUT-15` (#13), `CAU-LIC-60` (#14), `A139-OEI-01` (#15), `OPS-APP-X4` (#16), `WAR-GER-27` (#17) — múltiplas emergências graves empilhadas nas últimas 6 posições. Esta era explicitamente listada como decisão humana pendente ("confirmar se é intencional... ou se deve ser simplificada"), não como correção automática — o apply não a tratou, consistente com o escopo declarado. |

**Resumo da reconciliação:** 10 RESOLVIDO, 6 RESOLVIDO COM RESSALVA, 5 NÃO RESOLVIDO EM PRODUÇÃO (itens 9, 10, 11, 17, 19, 20 — seis, na verdade), 1 decisão pendente sem correção automática (item 21), 0 NOVA REGRESSÃO.

---

## 5. Auditoria pedagógica dos 51 modelos por grupo

**Nota metodológica:** a auditoria pedagógica anterior (`matriz-v6-2-pedagogical-audit-51-sessions.md`, mesma data, pré-apply) já realizou leitura linha a linha das 51 tabelas de 18 itens via 5 subagentes independentes, com critério de discordância explícita do veredito prévio. Não há indício de que a estrutura geral de progressão didática, sequência operacional ou terminalidade tenha mudado por este apply além dos pontos específicos já reconciliados na Seção 4 — o apply é um delta cirúrgico (3 códigos novos, 6 renomeações, reordenações pontuais, 5 desativações), não uma reescrita da matriz. Esta seção herda os vereditos por grupo da auditoria anterior e os atualiza com as confirmações de produção da Seção 4, evitando redundância de releitura integral do arquivo de 1467 linhas sem ganho de sinal adicional.

| Grupo | Modelos | Veredito herdado | Atualização pós-apply |
|---|---:|---|---|
| AW139 Inicial | 12 | 8 GO, 4 AJUSTAR | Os 4 AJUSTAR (`A139-I-02/12`, `A139-I-04/12`, `A139-I-05/12`, `A139-I-08/12`) — todos de ordem/duplicação — confirmados **RESOLVIDOS em produção** (Seção 4, itens 1–4). Grupo passa a **12 GO**. |
| AW139 Periódico/Noturno/Semestral/Reaquisição | 13 | 5 GO, 2 GO-ressalva, 6 AJUSTAR | 6 ciclos IFR + `A139-P-C2/IFR` (ordem) + `A139-NOT-01`/`A139-NOT-02` (black hole/autorrotação) confirmados **RESOLVIDOS**. `A139-REQ-01` (concentração de emergências) **permanece decisão pendente, não corrigida** (item 21). `A139-S-01/02` mantém GO-ressalva (LOFT ainda textual, item 20). Grupo: **11 GO, 1 GO-ressalva, 1 AJUSTAR pendente** (`A139-REQ-01`). |
| SK76/S76 Inicial | 12 | 9 GO, 3 AJUSTAR | `SK76-I-03/12` (fase, sem efeito em produção), `SK76-I-05/12` (parcial — posição/gatilho não mudou), `SK76-I-09/12` (**RESOLVIDO**) — ver itens 6–8. Grupo: **10 GO, 2 GO-ressalva** (`SK76-I-03/12`, `SK76-I-05/12` — risco baixo, sem efeito de conteúdo real no primeiro caso). |
| SK76/S76 Periódico/Noturno/Semestral/Reaquisição | 14 | 5 GO, 1 GO-ressalva, 6 AJUSTAR | 6 ciclos IFR renomeados (**RESOLVIDO**); `S76-NOT-01` (black hole, **RESOLVIDO**); `S76-P-C1/VFR` (**NÃO RESOLVIDO em produção**, item 9); `SK76-S-02/02` (resíduo "noturna", **NÃO RESOLVIDO em produção**, item 11). Grupo: **11 GO, 2 AJUSTAR remanescentes** (`S76-P-C1/VFR`, `SK76-S-02/02` — ambos cosméticos, sem risco de segurança de sequência). |
| TRE-INST | 1 | AJUSTAR (ética ausente) | `INV-ETH-01` confirmado presente e bem posicionado (item 15, RESOLVIDO). **GO.** |
| CRED-EXA | 1 | AJUSTAR (fusão + drift) | Fusão `EXA-PAD-01` decidida mas não operacionalizada (item 16, ressalva); drift `EXA-CND-01` **não resolvido em produção** e é o achado mais relevante desta auditoria (item 17). **AJUSTAR — não gerar ficha/PDF até correção do conteúdo real da manobra.** |
| NOTECHS transversal | 51 | AJUSTAR (guardrail ausente + genérico + não calibrado) | Guardrail `FORBIDDEN_TECHNICAL_CODE_RE` confirmado implementado e ativo em `validateModels()` (Seção 7). Contextualização de TRE-INST/CRED-EXA é apenas nota textual (ressalva). Calibração dos 60 descritores **não resolvida** (item 19). **AJUSTAR parcial** — guardrail de contaminação resolvido; calibração e adaptação contextual permanecem pendentes, sem risco de segurança. |

**Avaliação por critério (aplicada de forma consolidada aos 51 modelos, com base na Seção 4 + auditoria herdada):**
- Progressão didática: sólida em 49/51; `A139-REQ-01` com concentração de emergências no final segue como ponto de atenção não resolvido.
- Sequência operacional / terminalidade: **nenhuma violação** em nenhum dos 51 modelos — confirmado tanto pela auditoria anterior (leitura integral) quanto pelas 9 sessões verificadas diretamente em produção nesta auditoria (nenhuma termina em item de voo após pouso/corte).
- Carga cognitiva: sem mudança material introduzida por este apply; achados pré-existentes (ex. `A139-REQ-01`) permanecem.
- Coerência nome→conteúdo: **melhorada** pelos 6 renomeios IFR (resolvidos); `A139-S-02/02`/`SK76-S-02/02` continuam com resíduo textual "noturna" não removido da ficha real (Seção 4, itens 10–11) — risco cosmético, não estrutural.
- Distribuição PF/PM: fora do escopo verificável nesta auditoria (não há coluna de tripulação por item nos dados consultados além de `tripulante` em `modelos_sessao_manobras`, não auditada por não constar do escopo original).
- Aplicabilidade a helicóptero / adequação instrutor-examinador: mantida; `TRE-INST` e `CRED-EXA` com 18 técnicas fortes cada, ver Seção 7.
- Risco de ficha poluída: concentrado unicamente em `CRED-EXA` por causa do drift `EXA-CND-01` (Seção 11).

---

## 6. Auditoria dos novos códigos

| Código | Nome/descrição em produção | Categoria (loader) | Posicionamento | Avaliável? | Adequado para ficha? | Genérico demais? | Duplica legado? | Resolve a lacuna original? |
|---|---|---|---|---|---|---|---|---|
| `OPS-NOT-X1` | "Ilusão visual noturna / black hole effect — reconhecimento, correção e recuperação" | `EMERGENCIA` (classificação explícita, `inferCategoria()` linha 87) | Sempre inserido no bloco de cruzeiro/navegação noturna, antes das aproximações finais, nas 6 sessões — posição consistente e didaticamente correta (reconhecimento antes de aproximação real) | Sim — nome descreve ação observável (reconhecimento/correção/recuperação) | Sim | Não — nome específico ao fenômeno, não um rótulo genérico de "segurança noturna" | Não reativa `LOFT-NOT-31`/`S76-LOFT-23`/`S76-LOFT-33` (legados permanecem desativados/não referenciados) | Sim — lacuna de segurança confirmada como fechada nas 6 sessões previstas |
| `A139-AUT-03` | "Autorrotação noturna dedicada AW139" | `EMERGENCIA` (via regex geral `/AUT/`, verificado em teste unitário no commit `a315e46a`) | Posicionado no bloco de emergências avançadas, antes da aproximação final, em `A139-NOT-01` (#14) e `A139-S-01/02` (#14) | Sim | Sim | Não | Não duplica `A139-AUT-02` (flare/recuperação avançada, item distinto e já presente na sessão inicial `A139-I-08/12`) nem `A139-ENE-01`/`FLY-BAS-17`/`A139-REC-01` | Sim — fecha a assimetria identificada (SK76 já tinha autorrotação em ambas as sessões noturnas; AW139 só tinha na offshore) |
| `INV-ETH-01` | "Postura ética, limites de atuação e responsabilidade do instrutor" | `TREINAMENTO` (classificação explícita) | Posição #6 de `TRE-INST`, no bloco de base técnica/preparação, substituindo `INV-CGE-06` (meteorologia) | Sim — mas nota-se que é um item de postura/conduta, mais difícil de avaliar objetivamente que um item técnico; não há descritor de faixa de nota dedicado (ao contrário dos 60 descritores NOTECHS) | Sim, com ressalva: recomenda-se que o avaliador tenha um critério mínimo documentado para pontuar "postura ética" de forma auditável, hoje inexistente | Parcialmente — o nome é específico, mas falta o mesmo nível de detalhamento de rubrica que os NOTECHS têm | Não — é item novo, sem equivalente ativo anterior (`INV-CRM-04` legado permanece desativado) | Sim — fecha a assimetria com `EXA-ETH-01` (exame) que motivou o achado da auditoria anterior |

**Observação transversal:** os 3 códigos foram corretamente classificados no loader (commit `a315e46a`, com teste unitário dedicado) e corretamente vinculados em produção nas sessões exatas esperadas (Tarefa 1, itens 8–10). Nenhum dos 3 aparece fora do escopo previsto.

---

## 7. Auditoria LOFT e noturno

- **Enquadramento LOFT nas 4 sessões semestrais:** mecanismo de evidência **inalterado** por este apply — `loftEvidence = loftByCode || loftByStructuredNote` (`simuladores-matriz-v6-data.mjs:195`), onde `loftByStructuredNote` depende de regex de texto livre (`/enquadramento loft/i`) nas notas do markdown-fonte. Nenhum campo estrutural foi adicionado a `modelos_sessao` (confirmado por leitura do schema em produção). **O enquadramento LOFT continua dependendo de texto frágil**, exatamente como a auditoria anterior identificou — a "correção" documentada foi uma decisão de manter esse caminho aceito pelo guardrail, não uma correção estrutural.
- **Black hole/ilusão visual noturna:** bem distribuído — confirmado presente e corretamente posicionado nas 6 sessões noturnas/semestrais ativas de ambas as frotas (Seção 4, item 13). Nenhuma concentração excessiva: em cada sessão, `OPS-NOT-X1` ocupa uma única posição, sempre antes do bloco final de aproximação/pouso, nunca adjacente a mais de uma outra emergência grave simultânea.
- **Autorrotação noturna AW139:** bem posicionada — `A139-AUT-03` aparece na posição #14 em ambas as sessões (`A139-NOT-01`, `A139-S-01/02`), imediatamente após o perfil OEI noturno e antes da aproximação de precisão final — sequência operacionalmente coerente (falha → gerenciamento → recuperação → aproximação).
- **Excesso de carga em sessões noturnas:** não identificado. `A139-NOT-01` e `A139-S-01/02` (as duas sessões que ganharam 2 códigos novos simultaneamente) mantêm 18 itens totais como as demais — a inserção de `OPS-NOT-X1` e `A139-AUT-03` substituiu itens existentes (não os adicionou por cima), preservando a carga.

---

## 8. Auditoria TRE-INST e CRED-EXA

- **`INV-ETH-01` resolveu a lacuna de ética/postura do instrutor?** Sim, estruturalmente — código novo, rastreável, corretamente posicionado, sem reativar o legado `INV-CRM-04`. Ressalva: falta rubrica/descritor de avaliação dedicado (mesma lacuna que os NOTECHS têm, mas ao menos os NOTECHS têm 60 descritores documentados, ainda que não calibrados; `INV-ETH-01` não tem nenhum).
- **`TRE-INST` continua com 18 técnicas fortes?** Sim — confirmado em produção (Seção 4, item 15): progressão preparação→planejamento→briefing→demonstração→supervisão→gerenciamento de erro→emergências→avaliação→debriefing→administrativo, intacta.
- **`CRED-EXA` preserva distinção entre padronização, autoridade, julgamento e debriefing?** Parcialmente. `EXA-STD-01` (padrões/tolerâncias), `EXA-RSK-01` (risco/segurança), `EXA-DEC-01` (determinação do resultado) e `EXA-DBF-01` (debriefing) são itens distintos e preservados. Mas `EXA-PAD-01` continua fundindo padronização operacional + representatividade da autoridade em um único código sem rubrica dual implementada (item 16) — a granularidade regulatória que a auditoria anterior apontou como necessária para uma auditoria ANAC continua ausente na prática, apesar da decisão documentada de mantê-la fundida.
- **Nota de drift `EXA-CND-01` rastreável sem poluir a ficha?** Não plenamente — a nota está no documento de análise interno (correto, não vaza para o aluno), mas o **conteúdo real da ficha não foi corrigido** para refletir o significado pretendido, o que é um problema mais sério que "falta de nota": a ficha mostraria conteúdo tecnicamente incorreto/duplicado, não apenas não-anotado. Ver Seção 11.
- **NOTECHS aplicado a instrutor/examinador está contextualizado?** Apenas textualmente (nota no documento-fonte). Nenhuma diferenciação de código, descritor ou UI foi implementada para sinalizar ao avaliador que os 15 NOTECHS devem ser lidos como CRM de instrução/exame, não CRM de voo em tripulação — permanece uma leitura dependente do treinamento do avaliador humano.

---

## 9. Auditoria NOTECHS

- **Contaminação dentro das 18 técnicas:** zero, confirmado em produção (Tarefa 1, itens 5–7) e agora com guardrail ativo no loader.
- **Guardrail automático:** confirmado implementado e ativo. `scripts/maintenance/lib/simuladores-matriz-v6-data.mjs` define `FORBIDDEN_TECHNICAL_CODE_RE = /^(NOTECHS-|INV-CRM-|EXA-NTS-)/` (linha 23) e a checagem `if (FORBIDDEN_TECHNICAL_CODE_RE.test(row.codigo)) issues.push('forbidden_technical_code:...')` está ativa dentro de `validateModels()` (linha ~235) — **este era um dos itens de correção recomendados pela auditoria anterior e foi efetivamente implementado**, não apenas documentado.
- **Aplicação genérica a TRE-INST/CRED-EXA:** permanece sem adaptação de código, apenas nota textual (Seção 8).
- **Calibração dos 60 descritores:** não realizada. `notechs.ts` mantém o aviso de não-verificação contra a régua da empresa, inalterado por este apply.
- **Descritores separados das 18 técnicas na renderização:** arquitetura já garante isso estruturalmente (NOTECHS não são linhas em `modelos_sessao_manobras`, são avaliados por mecanismo global separado) — não há mudança neste apply que altere esse comportamento.

---

## 10. Verificação visual/frontend

**Não realizada nesta auditoria.** Acessar a renderização real da ficha em produção exigiria autenticação com credenciais de produção (fora do escopo de uma sessão não-interativa) ou apontar o ambiente local (`VITE_DEV_PROXY_TARGET`) para a API de produção, o que o próprio `CLAUDE.md` do projeto pede para usar "com extrema cautela" e não é apropriado para uma auditoria read-only sem autorização explícita adicional do owner para esse acesso específico.

**Registrado como pendência:** confirmar visualmente, antes de gerar qualquer ficha/PDF de `CRED-EXA`, que a técnica `EXA-CND-01` de fato aparece com o texto legado "Planejar um Exame de Proficiencia" (conforme os dados brutos indicam) — isso encerraria a dúvida levantada na Seção 11 sem qualquer ambiguidade.

---

## 11. Achado destacado — drift `EXA-CND-01` não propagado ao catálogo

Este é o achado de maior risco pedagógico/regulatório desta auditoria, por isso recebe seção própria.

**Evidência:**
```
manobras.id=726, codigo='EXA-CND-01', nome='Planejar um Exame de Proficiencia', updated_at='2026-03-26 00:48:10'
```
Este registro nunca foi tocado por nenhum dos applies desta série (`a315e46a`, `92d3a893`, `66af1f6c`, `68f65d8a`) — seu `updated_at` é de março, meses antes da rebaseline.

O documento-fonte ativo (`airtrust_matriz_v6_2_todas_sessoes_manobras_final.md`, adicionado no commit `92d3a893`) declara:
> "`EXA-CND-01` tem drift semântico em relação ao legado. Antes da V6.2, o código era usado para planejamento do exame; na V6.2 ativa, `EXA-CND-01` significa condução do exame. O planejamento agora é coberto por `EXA-PLN-01`."

Mas a ficha real (produção), para a sessão `CRED-EXA`, exibiria hoje:
- item #6: `EXA-PLN-01` — "Planejamento do exame de proficiência"
- item #10: `EXA-CND-01` — "Planejar um Exame de Proficiencia"

Ou seja, **duas linhas quase idênticas sobre planejamento**, quando a intenção documentada era que a segunda representasse condução (equivalente ao legado `EXA-CND-03`, "Conduzir um Exame de Proficiencia", que também existe no catálogo mas não está vinculado a este modelo). Isso não é apenas falta de nota de rastreabilidade — é conteúdo pedagógico incorreto/redundante na ficha que um examinador usaria de fato.

**Correção recomendada (não executada nesta auditoria — é apenas leitura):** um `UPDATE` único e pontual em `manobras` (`id=726`), sob autorização explícita do owner, trocando `nome`/`descricao` de `EXA-CND-01` para refletir "condução do exame de proficiência" (ou, alternativamente, trocar o vínculo em `modelos_sessao_manobras` de `EXA-CND-01` para `EXA-CND-03`, que já tem o nome correto no catálogo — provavelmente a correção mais segura, pois não exige alterar o texto de uma manobra que pode estar referenciada em outro lugar). Esta é uma decisão de produto/curricular do owner, não uma ação desta auditoria.

---

## 12. Exceções operacionais do apply

| Exceção | Motivo | Risco residual | Recomendação futura |
|---|---|---|---|
| Remoção de `BEGIN`/`COMMIT` do SQL | Wrangler D1 remote não suporta transações explícitas multi-statement da forma tradicional; o SQL foi estruturado para ser idempotente e sem `DELETE`, reduzindo a necessidade de rollback transacional | Baixo — confirmado: `GENERATED_DELTA_SQL.sql` não contém `DELETE`/`DROP`/`ALTER`; cada statement é auto-contido (INSERT/UPDATE por código+empresa_id), então uma falha parcial deixaria o banco em estado inconsistente mas recuperável via backup, não corrompido | Adotar um script de apply que divida o delta em lotes menores com verificação de sucesso incremental, permitindo retomar de onde parou em vez de reexecutar o arquivo inteiro |
| Uso de `INSERT OR REPLACE` em `modelos_sessao_manobras` | Necessário para regenerar vínculos modelo↔manobra de forma idempotente sem `DELETE` prévio | Baixo — confirmado apenas 1 ocorrência no arquivo; a tabela tem `UNIQUE(modelo_id, manobra_id)`, então o `OR REPLACE` só substitui a própria linha de vínculo (incluindo `ordem`), nunca cria duplicidade | Preferir `INSERT ... ON CONFLICT (modelo_id, manobra_id) DO UPDATE SET ordem = excluded.ordem` para deixar explícito que apenas `ordem` é atualizado, sem depender do comportamento implícito de `OR REPLACE` (que reescreve a linha inteira, inclusive `created_at`/`created_by`, embora aqui não haja evidência de que isso tenha corrompido dados de auditoria) |
| Desativação dos 5 modelos legados separada, após remover o filtro `deleted_at IS NULL` | O filtro original do diagnóstico de re-baseline excluía os legados por engano (provavelmente porque a condição incluía `deleted_at IS NULL` em um contexto onde os legados já tinham outro campo de soft-delete divergente) | Baixo — confirmado que os 5 modelos foram desativados (`ativo=0`) e não deletados; nenhuma ficha estava vinculada (Seção 3); a correção foi feita como `UPDATE ativo=0 WHERE codigo IN (...) AND empresa_id=6`, escopo explícito por código, sem risco de atingir outros registros | Adicionar um teste de smoke pré-apply que compare a contagem de modelos ativos antes/depois do filtro de exclusão, para pegar esse tipo de divergência de filtro antes da execução, não depois |

**Por que as validações pós-apply compensam essas exceções:** as 14 checagens do `POST_APPLY_VALIDATION.sql` mais as 4 checagens adicionais de vínculo de fichas (Seção 3) cobrem exatamente as superfícies de risco que essas exceções poderiam ter afetado (contagem de modelos, contagem de técnicas, vínculo de fichas, preservação de histórico) — todas passaram. O risco residual real não está nessas exceções operacionais (bem controladas), mas no achado estrutural da Seção 4/11: correções de **texto** em manobras compartilhadas não se propagam, o que é um problema de design do loader, não desta execução específica.

---

## 13. Risco residual

| Risco | Severidade | Escopo afetado |
|---|---|---|
| `EXA-CND-01` com conteúdo de ficha incorreto/duplicado em `CRED-EXA` | **Alto** (governança/clareza pedagógica, não segurança de voo) | Qualquer ficha/PDF gerado a partir de `CRED-EXA` a partir de agora |
| Correções de redação em manobras compartilhadas não propagam ao catálogo (padrão estrutural, 5 instâncias confirmadas) | Médio | `S76-P-C1/VFR`, `A139-S-02/02`, `SK76-S-02/02`, `SK76-I-05/12`, e potencialmente qualquer futura correção de texto que reutilize um `manobra_id` existente |
| LOFT semestral sem metadado estrutural | Médio-baixo | 4 sessões semestrais — risco de auditoria futura, não de segurança corrente |
| `EXA-PAD-01` sem rubrica dual operacionalizada | Médio | `CRED-EXA` — rastreabilidade regulatória em caso de contestação de resultado de exame |
| Descritores NOTECHS não calibrados contra padrão da empresa | Médio-baixo | Todos os 51 modelos, na dimensão NOTECHS |
| `A139-REQ-01` concentração de emergências no final | Baixo-médio | 1 sessão, decisão humana ainda pendente |

Nenhum risco encontrado é de segurança de sequência de voo, contaminação cross-tenant, vazamento de dado interno ao aluno, ou perda de histórico/ficha/avaliação.

---

## 14. Pendências

1. Verificação visual/frontend real da ficha `CRED-EXA` (Seção 10) — confirmar visualmente o texto exibido para `EXA-CND-01`.
2. Decisão do owner sobre a correção pontual de `EXA-CND-01` (trocar vínculo para `EXA-CND-03` ou reescrever `nome`/`descricao` do registro `id=726`) — **não executada nesta auditoria**.
3. Decisão do owner sobre `A139-REQ-01` (concentração de emergências no final) — mantida como estava, não corrigida por este apply.
4. Avaliação se as 5 correções de redação "sem efeito em produção" (Seção 4, itens 6, 7, 9, 10, 11) precisam de um mecanismo de override por vínculo (`modelos_sessao_manobras.observacoes` já existe e está vazio — poderia ser usado) ou se são aceitáveis como estão (a maioria é cosmética, exceto o caso `EXA-CND-01`, que é substantivo).
5. Calibração dos 60 descritores NOTECHS contra o padrão real da empresa (pendência pré-existente, não criada por este apply).
6. Metadado estrutural de caráter LOFT (pendência pré-existente, não criada por este apply).

---

## 15. GO/NO-GO

| Decisão | Veredito | Justificativa |
|---|:---:|---|
| Considerar a Matriz V6.2 Pedagógica **aplicada** (estrutura 51/918/15 + correções de segurança noturna/ética) | **GO** | 14/14 checagens técnicas confirmadas em produção; zero regressão de sequência; zero contaminação NOTECHS/CRM/EXA-NTS; histórico/fichas/agendamentos intocados byte a byte. |
| Gerar PDFs/fichas finais para **`CRED-EXA`** especificamente | **NO-GO** | Conteúdo real de `EXA-CND-01` na ficha é incorreto/duplicado em relação ao documentado (Seção 11) — gerar um PDF agora cristalizaria esse erro em um artefato distribuído a examinadores. |
| Gerar PDFs/fichas finais para os **demais 50 modelos** | **GO condicional** | Nenhum bloqueador de segurança de sequência ou contaminação. Ressalva cosmética conhecida e aceitável em `A139-S-02/02`, `SK76-S-02/02`, `S76-P-C1/VFR`, `SK76-I-03/12`, `SK76-I-05/12` (resíduos de texto sem risco de segurança — ver Seção 4). |
| Liberar uso operacional da matriz para sessões de simulador | **GO condicional** | Mesma ressalva de `CRED-EXA` acima; os demais 50 modelos estão operacionalmente aplicáveis. |
| Iniciar benchmark/guia do instrutor (AeroMaster/PTO) | **GO** | Não há dependência bloqueante; pode ser conduzido em paralelo à correção pontual de `EXA-CND-01`. |
| Abrir PR de melhoria futura | **GO** | Recomenda-se PR único cobrindo: (a) correção pontual `EXA-CND-01` (após decisão do owner), (b) mecanismo de override de texto por vínculo modelo↔manobra ou aceite explícito das 5 instâncias cosméticas remanescentes, (c) rubrica dual para `EXA-PAD-01`, (d) metadado estrutural LOFT, (e) calibração dos descritores NOTECHS. |

---

## Confirmações finais

- ✅ Nenhuma alteração de produção, banco, migration ou deploy nesta auditoria.
- ✅ Nenhum `UPDATE`/`DELETE`/`INSERT` executado — apenas `SELECT` via `wrangler d1 execute --remote`.
- ✅ Nenhuma manobra apagada, arquivada ou desativada por esta auditoria.
- ✅ Fichas, sessões criadas, avaliações, histórico, LMS, Qualificações e RBAC não tocados.
- ✅ Nenhum PDF final gerado.
- ✅ Nada neste documento constitui homologação, aprovação ou aceite pela ANAC.
- ✅ Nenhuma informação interna de auditoria/prompt/rastreabilidade foi proposta para exibição ao aluno — a Seção 11 recomenda o oposto: que o conteúdo real da ficha seja corrigido, não que a nota interna seja exposta.
- ✅ Contagem 51/918/15 não foi tratada como evidência suficiente — cada um dos 21 AJUSTAR anteriores foi reconciliado contra dado real de produção, não contra o documento-fonte isoladamente.

---

## 16. Adendo — Correções aplicadas (fase 2, pós-auditoria, autorizada explicitamente pelo owner)

> A auditoria acima (Seções 1–15) foi conduzida em modo estritamente read-only, como registrado nas "Confirmações finais". As correções descritas nesta seção foram feitas **depois**, em uma fase separada, mediante autorização explícita do owner para escrever em produção. Este adendo documenta exatamente o que mudou, com backup e verificação para cada ação.

### 16.1 `EXA-CND-01` → `EXA-CND-03` em `CRED-EXA` (achado da Seção 11)

**Problema:** `manobra_id` da técnica #10 de `CRED-EXA` apontava para o registro legado `EXA-CND-01` ("Planejar um Exame de Proficiencia"), duplicando o conteúdo de `EXA-PLN-01` (#6), quando a intenção documentada era representar "condução do exame".

**Descoberta durante a correção:** a abordagem inicialmente recomendada (reapontar o vínculo `#10` para `manobra_id` de `EXA-CND-03`) não podia ser feita com um simples `UPDATE manobra_id`, porque já existia uma linha soft-deleted (`id=2649`, `deleted_at='2026-07-05 14:53:38'`) vinculando `CRED-EXA` a `EXA-CND-03` — remanescente da compressão 22→18 — e a constraint `UNIQUE(modelo_id, manobra_id)` da tabela `modelos_sessao_manobras` bloquearia a criação de um segundo par idêntico.

**Correção aplicada** (produção, `airtrust-db`, empresa_id=6):
1. Backup pontual das 2 linhas afetadas em `artifacts/db-backups/exa-cnd-01-fix-20260705/pre_fix_snapshot.json`.
2. `UPDATE modelos_sessao_manobras SET deleted_at = NULL, ordem = 10 WHERE id = 2649` — reativa o vínculo com `EXA-CND-03` na posição 10.
3. `UPDATE modelos_sessao_manobras SET deleted_at = datetime('now') WHERE id = 2647` — desativa o vínculo antigo com `EXA-CND-01`.

**Verificação:** `CRED-EXA` continua com exatamente 18 técnicas ativas; posição #10 agora é `EXA-CND-03` — "Conduzir um Exame de Proficiencia"; total global de técnicas ativas na empresa permanece **918** (troca líquida zero); `EXA-CND-01` (id=726) permanece intacto no catálogo, apenas não mais vinculado a `CRED-EXA`.

### 16.2 Mecanismo de override de texto por vínculo modelo↔manobra (achado dos itens 9, 10, 11 da Seção 4)

**Investigação prévia:** confirmado que a técnica de uma ficha é copiada de `manobras`/`modelos_sessao_manobras` para `fichas_sessao_manobras` **apenas no momento de criação da sessão** — não é lida ao vivo depois. Logo, qualquer correção neste nível afeta somente fichas futuras, nunca fichas/históricos já existentes (consistente com a regra de não tocar histórico).

**Implementação:** `modelos_sessao_manobras.observacoes` (sempre vazio em produção até este momento) passa a funcionar como override de `nome`/`descricao` quando não-vazio, centralizado em `buildOperationalFichaManobras()` (`worker-airtrust/src/constants/notechs.ts`), consumido pelos 3 pontos de população de ficha que já usavam essa função (`simuladores-sessoes.ts`, `simuladores-sessoes-update.ts`, `simuladores-shared-session.ts`) mais o caminho de auto-reparo de item único (`simuladores-fichas-simulador.ts`) e a pré-visualização de ficha-modelo em branco (`fichaModeloPdf.ts`, frontend).

**Blindagem obrigatória adicionada durante o desenvolvimento:** o teste de regressão `src/__tests__/ficha-modelo-pdf-content.test.ts` (guarda de um incidente de produção anterior) quebrou na primeira versão da implementação — sua fixture usa `observacoes` para simular metadado interno de engenharia (`tipo_item=...; fase_voo=...; matriz_v6_modelo=...`) que nunca pode aparecer impresso. A implementação final por isso **ignora qualquer override que combine com esse padrão** (`INTERNAL_METADATA_LEAK_RE`, definido de forma idêntica em `notechs.ts` e `fichaModeloPdf.ts`), tratando-o como se estivesse vazio. Teste dedicado adicionado em ambos os arquivos para travar esse comportamento.

**Dados populados** (produção, 6 vínculos, cada um com backup prévio em `artifacts/db-backups/observacoes-override-fix-20260705/`):

| Modelo | Manobra | Override aplicado |
|---|---|---|
| `A139-S-02/02` | `A139-CKL-01` (#1) | "Normal checklist — preparação IFR semestral" |
| `A139-S-02/02` | `A139-EST-01` (#18) | "Estacionamento e corte pós-voo" |
| `SK76-S-02/02` | `S76-CKL-01` (#1) | "Checklist e preparação IFR" |
| `SK76-S-02/02` | `S76-EST-01` (#18) | "Encerramento pós-voo" |
| `S76-P-C1/VFR` | `S76-FFM-32` (#18) | "Fluxo de Combustível fora do Normal — decisão de retorno e encerramento" |
| `SK76-I-05/12` | `S76-UAR-00` (#10) | "Recuperação de atitudes anormais básica após perda momentânea de referências" |

**Verificação de isolamento:** confirmado que outros modelos que compartilham a mesma manobra (ex. `A139-CKL-01` também usado por `A139-I-01/12`, `A139-NOT-01`, `A139-NOT-02`, `A139-S-01/02`, etc.) **não** foram afetados — `observacoes` permanece vazio nesses vínculos, preservando a redação "noturna" onde ela é correta.

### 16.3 Rubrica dual `EXA-PAD-01` (achado do item 16 da Seção 4)

Em vez de criar um mecanismo de descritores dedicado (como o NOTECHS tem, com 60 descritores) só para 1 técnica de 918 — desproporcional —, foi usado o mesmo mecanismo de override da Seção 16.2: `modelos_sessao_manobras.observacoes` do vínculo `CRED-EXA` × `EXA-PAD-01` (link id 4397) recebeu: *"Padronização operacional e representatividade da autoridade — avaliar e registrar separadamente: (a) padronização operacional; (b) representatividade da autoridade aeronáutica."* Isso torna a exigência de avaliação dual **visível na própria ficha**, em vez de existir apenas como nota em documento de análise interno.

### 16.4 Migration `0417` — metadado estrutural de caráter LOFT (achado do item 20 da Seção 4)

Criado `worker-airtrust/migrations/0417_add_modelos_sessao_caracter_loft.sql` (`ALTER TABLE modelos_sessao ADD COLUMN caracter_loft INTEGER NOT NULL DEFAULT 0 CHECK (caracter_loft IN (0,1))`). **Não aplicada** em nenhum ambiente (local, staging ou produção) — arquivo preparado para revisão, conforme escopo definido pelo owner. Aplicar ainda exige o procedimento padrão de autorização + backup do `CLAUDE.md` antes de rodar contra produção.

### 16.5 Itens não corrigidos nesta fase (permanecem pendência formal)

- **Calibração dos 60 descritores NOTECHS contra o padrão real da empresa** — não é uma correção de código; exige revisão de instrutor-chefe/gestor de treinamento contra a ficha fonte real, informação que não estava disponível para esta correção. `notechs.ts` mantém o aviso de não-verificação inalterado.
- **Migration 0417 não aplicada** — arquivo pronto, aplicação requer autorização e procedimento próprios (Seção 16.4).

### 16.6 Validação da fase 2

- `npx tsc --noEmit` — limpo.
- `npm run lint` — todos os guards OK (`lint:api-base`, `guard:tracked-secrets`, `guard:auth-boundaries`, `guard:empresa-default1`, `guard:duplicate-migrations`, `guard:operational-sql-sources`).
- `npm run test:worker` — 1732 passed, mesmos 12 testes falhando pré-existentes em `main` antes de qualquer mudança desta fase (confirmado por `git stash` + rerun), nenhuma falha nova introduzida.
- `npm run test:run` (frontend) — 1190/1190 passed (0 falhas), incluindo 2 testes novos e o teste de regressão de vazamento de metadado que motivou a blindagem da Seção 16.2.
- Contagens globais de produção confirmadas inalteradas após cada escrita: 51 modelos, 918 técnicas, histórico (224/4706/108) intocado.
- Nenhum arquivo de backup/artifact/PDF novo commitado (apenas o `.sql` de migration e o código-fonte).

### 16.7 GO/NO-GO atualizado

| Decisão | Veredito (Seção 15) | Veredito atualizado |
|---|---|---|
| Gerar PDF/ficha de `CRED-EXA` | NO-GO | **GO** — `EXA-CND-01` corrigido (Seção 16.1); rubrica dual de `EXA-PAD-01` agora visível na ficha (Seção 16.3) |
| Demais 50 modelos | GO condicional | **GO** — as 4 ressalvas cosméticas restantes (`A139-S-02/02`, `SK76-S-02/02`, `S76-P-C1/VFR`, `SK76-I-05/12`) foram corrigidas via override (Seção 16.2), efetivo para fichas criadas a partir de agora |
| Calibração NOTECHS / metadado LOFT | pendência | **pendência mantida** — fora do escopo de uma correção de código (Seção 16.5) |

---

*Documento exclusivamente analítico e read-only nas Seções 1–15. A Seção 16 documenta ações de escrita em produção executadas em fase separada, sob autorização explícita do owner, com backup e verificação para cada mudança. Fontes: produção (`airtrust-db`, empresa_id=6, via `wrangler d1 execute --remote`), `docs/analysis/airtrust_matriz_v6_2_todas_sessoes_manobras_final.md`, `docs/analysis/matriz-v6-2-pedagogical-audit-51-sessions.md`, `docs/analysis/matriz-v6-2-acceptance-matrix-51-modelos.md`, `docs/ops/matriz-v6-2-pedagogical-rebaseline-apply-plan.md`, artefatos de apply em `artifacts/apply-plans/matriz-v6-2-pedagogical-final-apply-20260705T193250Z-68f65d8a/`, `scripts/maintenance/lib/simuladores-matriz-v6-data.mjs`.*
