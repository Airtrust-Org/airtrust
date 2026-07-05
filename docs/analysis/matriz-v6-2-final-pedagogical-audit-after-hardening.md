# Matriz V6.2 Pedagógica — Auditoria Final Após Hardening (PR #262)

**Data:** 2026-07-05
**Caráter:** documental, read-only, adversarial. Não é revisão de código para merge, não é homologação, aprovação ou aceite pela ANAC.
**Escopo:** produção real (`airtrust-db`, empresa_id=6, Costa do Sol), código em `main` após o merge do PR #262 (`2294c732`), Worker/Pages deployados.
**Postura:** esta auditoria parte do princípio de que as duas auditorias anteriores (`matriz-v6-2-pedagogical-audit-51-sessions.md`, pré-apply, e `matriz-v6-2-pedagogical-post-apply-audit.md`, pós-apply) podem estar incompletas ou desatualizadas, e busca ativamente o que elas não pegaram — não apenas confirmar seus vereditos.

**Atualização documental desta correção final pequena (branch local, ainda sem apply em produção):** os achados 1, 2, 3 e 4 deste relatório foram endereçados no código/documentação desta etapa por meio de regex endurecido e compartilhado, validação de escrita em `modelos_sessao_manobras.observacoes`, correção da `acceptance-matrix` e preparação local do pacote SQL dos 4 overrides finais de `A139-REQ-01`/`S76-REQ-01`. Como não houve apply em produção nesta etapa, os vereditos read-only desta auditoria continuam válidos como fotografia histórica do estado auditado em `main` no momento da coleta, e os PDFs finais permanecem bloqueados até a validação final dessa correção.

---

## 1. Resumo executivo

O estado técnico 51/918/18/15 está correto e foi reconfirmado **de forma totalmente independente** nesta auditoria, via `SELECT` direto em produção (não reaproveitando os resultados dos relatórios anteriores). PR #262 está deployado tanto no Worker (`api.airtrust.online/api/health` reporta `version: 2026-07-05T20:54:45Z-2294c732`) quanto no Pages (deployment `2294c73`, produção, 12 min após o merge) — confirmado por evidência ao vivo, não por suposição. Migration 0417 está isolada em uma branch local não mergeada (`chore/migration-0417-caracter-loft`), ausente de `main` e de qualquer ambiente aplicado — confirmado via `git merge-base --is-ancestor` e busca em todo o histórico.

Esta auditoria **não se limitou a repetir as checagens anteriores**. Indo além, encontrou 5 pontos que as duas auditorias anteriores não haviam identificado ou haviam subestimado:

1. **Blindagem de metadado interno mais estreita do que a especificação exige.** O regex `INTERNAL_METADATA_LEAK_RE` (idêntico em backend e frontend) cobre apenas 5 padrões `chave=valor` de engenharia (`tipo_item=`, `fase_voo=`, `carater=`, `fap_refs=`, `matriz_v6_modelo=`). Não cobre `sourceNotes`, `prompt`, `debug`, `RBAC`, `auditoria interna` ou blocos JSON — termos explicitamente proibidos no escopo desta auditoria. Os testes automatizados só validam o padrão estreito.
2. **Nenhuma validação em tempo de escrita.** As rotas administrativas que criam/editam `modelos_sessao_manobras.observacoes` (`simuladores-modelos.ts`, entre outras) aceitam qualquer texto sem checar o regex de vazamento. Toda a proteção depende exclusivamente do filtro em tempo de leitura nas 2 funções que montam a ficha.
3. **Correção de "resíduo noturna" incompleta.** A correção aplicada (Seção 16.2 do relatório pós-apply) cobriu `A139-S-02/02` e `SK76-S-02/02`, mas **não** cobriu `A139-REQ-01` e `S76-REQ-01` — duas sessões de reaquisição, não-noturnas por definição, que usam exatamente as mesmas manobras-bookend (`A139-CKL-01`/`A139-EST-01`/`S76-CKL-01`/`S76-EST-01`) com o mesmo texto "noturna"/"noturno" residual, sem override.
4. **Discrepância entre documentos-fonte sobre `A139-REQ-01`.** `matriz-v6-2-acceptance-matrix-51-modelos.md` (linha 64) afirma que o bloco final de `A139-REQ-01` foi "rebalanceado... reduzindo concentração de emergências graves". A consulta direta em produção mostra o oposto: posições 12–17 continuam empilhando 6 emergências graves consecutivas (fuel low, engine failure, OEI limit timer, perfil OEI, aproximação de grande ângulo, landing gear emergency) antes do encerramento. O próprio relatório pós-apply (item 21) já havia classificado isso como "NÃO RESOLVIDO / decisão pendente" — ou seja, um documento-fonte está desatualizado/impreciso em relação ao estado real.
5. **27 posicionamentos de técnicas com nome "noturno" dentro de sessões sem indicação de escopo noturno no título** (iniciais e reaquisição, ambas as frotas), além dos 2 casos do item 3. Pode ser intencional (simuladores permitem cenário noturno dentro de qualquer sessão), mas nenhum documento-fonte confirma essa intenção explicitamente — fica como pendência de confirmação pedagógica, não como defeito confirmado.

Nenhum dos 5 pontos acima é uma regressão de segurança de sequência de voo, contaminação cross-tenant, RBAC, ou perda de dado histórico. Todos são de classe "clareza pedagógica / defesa em profundidade", com um agravante: os itens 1–2 tocam exatamente a garantia central que o PR #262 foi criado para entregar (blindagem contra metadado interno), então merecem tratamento como achado central, não como nota de rodapé.

**GO/NO-GO resumido:** manter a matriz aplicada como base técnica — **GO**. Gerar fichas/PDF finais para os 51 modelos — **GO condicional**, sujeito ao fechamento dos itens 3 e 4 (ambos de baixo esforço) antes de qualquer distribuição a examinador/instrutor real, e ao endurecimento do regex de blindagem (item 1–2) antes de expandir o mecanismo de override para qualquer fonte menos controlada que hoje.

---

## 2. Escopo e fontes

Fontes obrigatórias consultadas: produção read-only (empresa_id=6, via `wrangler d1 execute --env production --remote`), código em `main` pós-PR #262, deployments Worker/Pages ao vivo, e os 6 documentos de análise/ops listados no prompt de auditoria (`airtrust_matriz_v6_2_todas_sessoes_manobras_final.md`, `matriz-v6-2-pedagogical-audit-51-sessions.md`, `matriz-v6-2-pedagogical-post-apply-audit.md`, `matriz-v6-2-acceptance-matrix-51-modelos.md`, `matriz-v6-2-pedagogical-rebaseline-apply-plan.md`, `matriz-v6-2-post-apply-corrective-actions-20260705.md`), além do diff completo do PR #262 e dos artefatos de apply/reconciliação em `artifacts/apply-plans/` e `artifacts/db-backups/`.

`POST_APPLY_PRODUCTION_VALIDATION.md` (citado no prompt de auditoria) não existe no repositório — o conteúdo equivalente está em `PRODUCTION_RECONCILIATION.md` dentro dos diretórios de artefato, que foram usados no lugar.

Verificação visual/frontend autenticada em produção **não foi realizada** — exigiria credenciais de produção ou apontar o proxy local para a API de produção, ambos fora do escopo de uma sessão read-only sem autorização explícita adicional (mesma limitação já registrada na auditoria anterior).

---

## 3. Estado técnico final (verificação independente)

Todas as linhas abaixo foram obtidas por consulta própria nesta auditoria (`wrangler d1 execute --env production --remote`), não copiadas dos relatórios anteriores.

| Item | Esperado | Resultado real | Status |
|---|---|---|---|
| Modelos ativos não-TEST | 51 | 51 | ✅ |
| Vínculos modelo↔manobra ativos | 918 | 918 | ✅ |
| Modelos com contagem de técnicas ≠ 18 | 0 | 0 | ✅ |
| NOTECHS canônicos distintos (empresa 6) | 15 | 15, nomes idênticos aos 15 oficiais | ✅ |
| NOTECHS/`INV-CRM-*`/`EXA-NTS-*` dentro das 18 técnicas | 0 | 0 | ✅ |
| `OPS-NOT-X1` nas sessões previstas | 6 exatas | `A139-NOT-01`, `A139-NOT-02`, `A139-S-01/02`, `S76-NOT-01`, `S76-NOT-02`, `SK76-S-01/02` | ✅ |
| `A139-AUT-03` nas sessões previstas | 2 exatas | `A139-NOT-01`, `A139-S-01/02` | ✅ |
| `INV-ETH-01` em `TRE-INST` | ordem correta | ordem=6, ativo | ✅ |
| `EXA-CND-03` ativo em `CRED-EXA` | ordem=10 | ordem=10, `deleted_at` NULL | ✅ |
| `EXA-CND-01` em `CRED-EXA` | vínculo soft-deleted | `deleted_at='2026-07-05 20:15:30'` no vínculo; manobra em si não apagada (correto — pode ser referenciada em outro lugar) | ✅ |
| Overrides em `observacoes` | 7, sem metadado interno | 7 confirmados, conteúdo lido linha a linha, nenhum metadado interno presente | ✅ |
| 5 modelos legados SK76 (ids 39–43) | `ativo=0` | 5/5 `ativo=0` | ✅ |
| Fichas vinculadas aos 5 legados | 0 | 0 (via `template_id`) | ✅ |
| 6 ciclos IFR renomeados | "IFR-emergências" | 6/6 confirmados | ✅ |
| Resíduo "IFR-noturno-offshore" | 0 | 0 | ✅ |
| `fichas_sessao` (global, todas empresas) | 224 | 224 | ✅ |
| `fichas_sessao_manobras` (global) | 4706 | 4706 | ✅ |
| `simulador_agendamentos` (global) | 108 | 108 | ✅ |
| `fichas_manobras_historico` (global) | não especificado explicitamente | 0 (tabela existe, vazia — não é evidência de perda, é o estado normal desta tabela) | ✅ |

**Nota metodológica:** na primeira tentativa, filtrei `fichas_sessao` por `empresa_id=6` e obtive 223, não 224 — um susto de divergência. Investigação mostrou que a baseline oficial (`POST_APPLY_VALIDATION.sql`) conta `fichas_sessao` **globalmente**, sem filtro de tenant, porque a tabela contém registros de outras empresas também. Refazendo a query sem o filtro, o número bateu exatamente. Registro aqui porque é exatamente o tipo de erro metodológico que uma auditoria "não aceitar por contagem" deveria capturar — inclusive os meus próprios números precisam ser verificados contra a metodologia exata da baseline, não apenas contra a intuição de filtrar por tenant.

Migration 0417: confirmada isolada na branch local `chore/migration-0417-caracter-loft` (`git merge-base --is-ancestor` retorna "NOT MERGED"; `git show main:worker-airtrust/migrations/0417_...sql` retorna "does not exist in main"). Não aplicada em nenhum ambiente.

---

## 4. Auditoria do PR #262 e do hardening deployado

| Checagem | Resultado |
|---|---|
| PR #262 não contém migration 0417 | ✅ confirmado — `git show --stat 2294c732` lista 10 arquivos, nenhum em `migrations/` |
| PR #262 não contém SQL operacional/artifacts/backups | ✅ confirmado — apenas 2 docs, 2 arquivos de rota de constantes, 4 arquivos de rota, 2 arquivos de teste |
| Worker deployado corresponde ao SHA de `main` | ✅ confirmado ao vivo — `curl https://api.airtrust.online/api/health` retorna `"version":"2026-07-05T20:54:45Z-2294c732"`, idêntico ao HEAD local |
| Pages deployado corresponde ao SHA de `main` | ✅ confirmado — `wrangler pages deployment list` mostra deployment de produção `2294c73`, 12 minutos após o merge |
| Mecanismo de override é centralizado | ✅ `buildOperationalFichaManobras()` (backend) e `buildFichaModeloPdfData()` (frontend), únicos pontos de materialização de técnica para ficha |
| Override não recalcula fichas existentes | ✅ confirmado por leitura de código — `fichas_sessao_manobras` é copiada de `modelos_sessao_manobras` **apenas no momento de criação** (`INSERT` em `simuladores-sessoes.ts`/`simuladores-shared-session.ts`); o único caminho de "auto-reparo" (`simuladores-fichas-simulador.ts:63-169`) só insere quando a linha **não existe** para aquele `ficha_id`+`ordem` — nunca faz `UPDATE` sobre uma linha já materializada |
| Backend e frontend usam lógica equivalente | ⚠️ parcialmente — o regex é **literalmente idêntico** nos dois arquivos (copiado, não compartilhado por import), o que já divergiu de sincronia antes (ver achado 4.1) e pode divergir de novo silenciosamente no futuro |
| Testes cobrem override legítimo | ✅ 2 testes novos (backend + frontend) cobrindo override presente/ausente/em branco |
| Testes cobrem bloqueio de metadado interno | ⚠️ cobrem **apenas** o padrão estreito do regex atual — não há teste que tente `sourceNotes`, `prompt`, `debug`, `RBAC` ou JSON e verifique que também são bloqueados, porque o código não os bloqueia |
| NOTECHS/CRM não contamina técnica | ✅ confirmado em produção (Seção 3) e por guardrail ativo no loader (`FORBIDDEN_TECHNICAL_CODE_RE`, `simuladores-matriz-v6-data.mjs`) |

### 4.1 Achado — blindagem de metadado interno mais estreita que o exigido

`worker-airtrust/src/constants/notechs.ts` e `src/react-app/pages/simuladores/fichas/fichaModeloPdf.ts` definem, cada um independentemente:

```
const INTERNAL_METADATA_LEAK_RE = /tipo_item\s*=|fase_voo\s*=|carater\s*=|fap_refs\s*=|matriz_v6_modelo\s*=/i;
```

Isso bloqueia exatamente os 5 campos que vazaram no incidente de regressão que motivou o guard (`ficha-modelo-pdf-content.test.ts`, um teste de regressão de um incidente de produção anterior). Mas o escopo desta auditoria — e as regras absolutas do próprio prompt do owner — proíbem explicitamente vazamento de `sourceNotes`, `prompt`, `auditoria interna`, `RBAC`, `debug` e "JSON interno" em texto visível ao aluno/instrutor. Nenhum desses termos está no regex. Um override futuro contendo, por exemplo, `"ver sourceNotes do commit X"` ou um objeto JSON colado por engano passaria pelo filtro sem ser descartado e apareceria, verbatim, na ficha impressa.

**Severidade:** MÉDIO. Não há vazamento acontecendo hoje — os 7 overrides atuais foram inspecionados linha a linha (Seção 3) e estão limpos. O risco é prospectivo: qualquer expansão futura do mecanismo de override (mais vínculos, fonte menos controlada, edição via UI por usuário não-owner) herda uma proteção mais fraca do que o padrão declarado.

### 4.2 Achado — ausência de validação em tempo de escrita

`worker-airtrust/src/routes/simuladores-modelos.ts` expõe `GET /modelos-sessao/:id/manobras` (retorna `msm.observacoes` cru, sem passar pelo regex — aceitável, é a tela de edição do próprio admin que configura o override) e os handlers de criação/edição de modelo (`POST`/`PUT`, linhas ~962 e ~1048) que persistem `m.observacoes || null` vindo diretamente do corpo da requisição, sem qualquer validação contra `INTERNAL_METADATA_LEAK_RE` ou equivalente no momento da escrita.

Isso significa que a única barreira contra um override com metadado interno é o filtro em tempo de **leitura**, aplicado apenas nos 2 pontos que montam a ficha — e esse filtro é o do achado 4.1 (estreito). Não há dupla proteção (escrita + leitura); há só uma, e é a mais fraca das duas possíveis.

**Severidade:** MÉDIO. Hoje, escrita em `observacoes` só acontece via apply-plan SQL revisado manualmente pelo owner (não há fluxo de usuário final escrevendo nesse campo em produção) — o que reduz a probabilidade de exploração real. Mas o desenho arquitetural não impede isso, e a rota admin existe e aceita o campo livremente.

---

## 5. Tabela dos 21 AJUSTAR — reconciliação final

Herdo a reconciliação detalhada da auditoria pós-apply (Seção 4 daquele documento), que já fez o trabalho de comparar contra produção real, não contra o arquivo-fonte isoladamente. Verifiquei de forma independente os itens mais sensíveis (17, 21) e neles encontrei desvio adicional (ver abaixo). Os demais foram conferidos por amostragem direta em produção nesta auditoria (consultas da Seção 3) e não apresentaram divergência da reconciliação anterior.

| # | Item | Veredito herdado | Veredito desta auditoria |
|---:|---|---|---|
| 1 | `A139-I-02/12` — holding/offshore após pouso | RESOLVIDO | **RESOLVIDO** (confirmado, sem releitura completa — sem sinal de regressão) |
| 2 | `A139-I-04/12` — duplicação com I-03/12 | RESOLVIDO | **RESOLVIDO** |
| 3 | `A139-I-05/12` — regressão a nível básico no final | RESOLVIDO | **RESOLVIDO** |
| 4 | `A139-I-08/12` — landing gear emergency sem resolução | RESOLVIDO | **RESOLVIDO** |
| 5 | `A139-P-C2/IFR` — nome + landing gear no final | RESOLVIDO | **RESOLVIDO** |
| 6 | `SK76-I-03/12` — rótulo de fase "validar frota" | RESOLVIDO COM RESSALVA | **RESOLVIDO COM RESSALVA** (campo nunca foi renderizado; risco real zero) |
| 7 | `SK76-I-05/12` — recuperação sem gatilho | RESOLVIDO COM RESSALVA → **RESOLVIDO** | Override aplicado (Seção 16.2 do doc anterior) confirmado em produção: `S76-UAR-00` em `SK76-I-05/12` tem `observacoes`="Recuperação de atitudes anormais básica após perda momentânea de referências". **RESOLVIDO** |
| 8 | `SK76-I-09/12` — repetição temática fumaça/bagagem | RESOLVIDO | **RESOLVIDO** |
| 9 | `S76-P-C1/VFR` — encerramento sem decisão clara | NÃO RESOLVIDO → RESOLVIDO (override) | Override confirmado em produção: `S76-FFM-32`="Fluxo de Combustível fora do Normal — decisão de retorno e encerramento". **RESOLVIDO** |
| 10 | `A139-S-02/02` — resíduo "noturna" | NÃO RESOLVIDO → RESOLVIDO (override) | Overrides confirmados em produção para `A139-CKL-01`/`A139-EST-01` nesta sessão. **RESOLVIDO NESTA SESSÃO** — mas ver achado 5.1: o mesmo padrão não foi corrigido em `A139-REQ-01`. |
| 11 | `SK76-S-02/02` — mesmo resíduo | NÃO RESOLVIDO → RESOLVIDO (override) | Overrides confirmados para `S76-CKL-01`/`S76-EST-01`. **RESOLVIDO NESTA SESSÃO** — mesma ressalva: `S76-REQ-01` não corrigido (achado 5.1). |
| 12 | 6 ciclos IFR renomeados | RESOLVIDO | **RESOLVIDO** (reconfirmado, Seção 3) |
| 13 | Lacunas noturnas/black hole | RESOLVIDO | **RESOLVIDO** (reconfirmado, Seção 3) |
| 14 | Autorrotação noturna dedicada AW139 | RESOLVIDO | **RESOLVIDO** (reconfirmado, Seção 3) |
| 15 | `TRE-INST` ética/postura | RESOLVIDO | **RESOLVIDO** (reconfirmado, Seção 3) |
| 16 | `CRED-EXA` fusão `EXA-PAD-01` | RESOLVIDO COM RESSALVA → RESOLVIDO (rubrica dual via override) | Override confirmado em produção: texto de rubrica dual presente. **RESOLVIDO** |
| 17 | Drift `EXA-CND-01` | NÃO RESOLVIDO → RESOLVIDO (troca de vínculo) | Reconfirmado independentemente: vínculo `id=2649` (`EXA-CND-03`) ativo em ordem=10; vínculo `id=2647` (`EXA-CND-01`) soft-deleted. **RESOLVIDO** |
| 18 | NOTECHS sem adaptação a TRE-INST/CRED-EXA | RESOLVIDO COM RESSALVA (nota textual apenas) | **RESOLVIDO COM RESSALVA** — nenhuma mudança de código desde a auditoria anterior; permanece dependente de nota textual e treinamento do avaliador |
| 19 | Calibração dos 60 descritores NOTECHS | NÃO RESOLVIDO | **NÃO RESOLVIDO** — reconfirmado: aviso "ESTE CONTEÚDO NÃO FOI VERIFICADO CONTRA A FICHA FONTE ESPECÍFICA DA EMPRESA" continua presente, linha 13 de `notechs.ts`, inalterado |
| 20 | Metadado estrutural LOFT | NÃO RESOLVIDO | **NÃO RESOLVIDO** — migration 0417 preparada mas isolada e não aplicada (Seção 3); mecanismo de evidência textual continua sendo o único caminho |
| 21 | `A139-REQ-01` concentração de emergências | NÃO RESOLVIDO/decisão pendente | **NÃO RESOLVIDO — e há discrepância documental** (achado 5.2) |

**Resumo:** 16 RESOLVIDO, 2 RESOLVIDO COM RESSALVA (itens 6, 18), 3 NÃO RESOLVIDO (itens 19, 20, 21), 0 NOVA REGRESSÃO de sequência/segurança. Porém, 2 achados NOVOS desta auditoria (5.1, e o já descrito 4.1/4.2) mostram que a categoria "RESOLVIDO" para os itens 10/11 é verdadeira apenas para as sessões explicitamente nomeadas nos documentos-fonte, não para todas as instâncias reais do mesmo padrão em produção.

### 5.1 Achado — correção de "resíduo noturna" incompleta (REQ-01)

A correção aplicada para os itens 10 e 11 (Seção 16.2 do relatório pós-apply) foi derivada da leitura do documento-fonte markdown, que citava apenas `A139-S-02/02` e `SK76-S-02/02` como as sessões afetadas. Uma varredura própria desta auditoria, feita diretamente em produção (não no documento-fonte), sobre **todas** as sessões que referenciam as mesmas 4 manobras-bookend, encontrou 2 instâncias adicionais não corrigidas:

| Manobra | Sessão | Nome da sessão | Override? |
|---|---|---|---|
| `A139-CKL-01` | `A139-REQ-01` | Reaquisição de Experiência Recente | Não — catálogo ainda diz "preparação noturna" |
| `A139-EST-01` | `A139-REQ-01` | Reaquisição de Experiência Recente | Não — catálogo ainda diz "corte pós-voo noturno" |
| `S76-CKL-01` | `S76-REQ-01` | Reaquisição de Experiência Recente | Não — catálogo ainda diz "preparação noturna" |
| `S76-EST-01` | `S76-REQ-01` | Reaquisição de Experiência Recente | Não — catálogo ainda diz "encerramento pós-voo noturno" |

`A139-REQ-01`/`S76-REQ-01` são sessões de reaquisição de experiência recente — não são, por definição, sessões noturnas. O item de abertura (#1) e encerramento (#18) de ambas descreve preparação/corte "noturno" sem que isso seja o escopo real da sessão — exatamente o mesmo padrão de mismatch já classificado como MÉDIO nos itens 10/11 originais, e corrigido lá, mas não aqui. Mecanismo de correção já existe (`observacoes` override) e está pronto para uso — é só uma questão de aplicar o mesmo padrão a mais 4 vínculos.

**Severidade:** MÉDIO (mesma classe dos itens 10/11 já documentados — cosmético, sem risco de sequência).

### 5.2 Achado — discrepância entre `acceptance-matrix` e estado real de produção

`docs/analysis/matriz-v6-2-acceptance-matrix-51-modelos.md`, linha 64, descreve a ação tomada em `A139-REQ-01` como: *"bloco final rebalanceado para reaquisição segura, reduzindo concentração de emergências graves"*.

A consulta direta em produção (nesta auditoria) mostra a sequência real de `A139-REQ-01`, posições 12–18:

```
12  CAU-FLO-73   Fuel low
13  WAR-OUT-15   Engine failure
14  CAU-LIC-60   OEI limit timer
15  A139-OEI-01  Perfil OEI noturno
16  OPS-APP-X4   Aproximação grande ângulo
17  WAR-GER-27   Landing gear emergency
18  A139-EST-01  Estacionamento e corte pós-voo noturno
```

Seis emergências/situações anormais consecutivas (posições 12–17) antes do encerramento — não há evidência de "rebalanceamento" nessa sequência. O próprio relatório pós-apply (item 21 da tabela de reconciliação) já havia classificado este item como **"NÃO RESOLVIDO / DECISÃO PENDENTE"**, contradizendo diretamente a `acceptance-matrix`. Não terminei a sessão em item de voo após pouso/corte (item 18 é encerramento, correto estruturalmente), mas a concentração de emergências permanece exatamente como descrita no achado original, não como "rebalanceada".

**Implicação:** ao menos um documento-fonte oficial (`acceptance-matrix`) não reflete o estado real de produção neste ponto. Isso reforça a necessidade de tratar documentos de análise como hipótese a verificar, não como evidência — postura que esta auditoria adotou e que recomenda para qualquer auditoria futura da matriz.

**Severidade:** BAIXO-MÉDIO (é uma decisão pedagógica pendente do owner, não uma falha de segurança — mas a divergência documental em si é um risco de governança: alguém lendo só a `acceptance-matrix` concluiria, erradamente, que o item está fechado).

---

## 6. Auditoria pedagógica dos 51 modelos por grupo

Não há indício, nesta auditoria, de que a estrutura de progressão didática, sequência operacional ou terminalidade tenha regredido desde a auditoria pós-apply anterior — o PR #262 é puramente um patch de renderização (override + blindagem), não uma reescrita de conteúdo. As tabelas de veredito por grupo daquela auditoria (Seção 5) permanecem válidas, com as seguintes atualizações desta auditoria:

| Grupo | Veredito herdado | Atualização desta auditoria |
|---|---|---|
| AW139 Inicial (12) | 12 GO | **12 GO**, sem mudança |
| AW139 Periódico/Noturno/Semestral/Reaquisição (13) | 11 GO, 1 GO-ressalva (`A139-S-01/02`, LOFT textual), 1 AJUSTAR (`A139-REQ-01`) | **11 GO, 1 GO-ressalva, 1 AJUSTAR confirmado ainda aberto** — e agora com a divergência documental da Seção 5.2 registrada explicitamente |
| SK76/S76 Inicial (12) | 10 GO, 2 GO-ressalva | **10 GO, 2 GO-ressalva**, sem mudança |
| SK76/S76 Periódico/Noturno/Semestral/Reaquisição (14) | 11 GO, 2 AJUSTAR remanescentes (já corrigidos via override) | **13 GO** (itens 9/11 corrigidos, confirmado Seção 5) — mas ver achado 5.1: `S76-REQ-01` tem o mesmo mismatch textual não corrigido, então rebaixo a **12 GO, 1 GO-ressalva nova** (`S76-REQ-01`) |
| TRE-INST (1) | GO | **GO**, reconfirmado |
| CRED-EXA (1) | AJUSTAR → GO (após correção 16.1/16.3) | **GO**, reconfirmado por consulta direta — `EXA-CND-03` ativo, `EXA-PAD-01` com override de rubrica dual visível na ficha |
| NOTECHS transversal (51) | AJUSTAR parcial (guardrail resolvido; calibração pendente) | **AJUSTAR parcial mantido** — calibração ainda não realizada (item 19) |
| **AW139 Reaquisição (`A139-REQ-01`, incluído no grupo acima)** | GO condicional | **GO-ressalva nova** — resíduo "noturna" não corrigido (5.1) + concentração de emergências não resolvida apesar de documento afirmar o contrário (5.2) |

**Critérios avaliados de forma consolidada, com atenção a violação de sequência/terminalidade:** nenhuma das 51 sessões termina em item de voo após pouso/corte/encerramento — reconfirmado por amostragem direta desta auditoria em `A139-REQ-01`, `A139-S-02/02`, `SK76-S-02/02`, `CRED-EXA`, `TRE-INST` (item 18/final sempre é item administrativo/de encerramento em terra). Nenhuma sessão apresenta carga cognitiva excessiva mensurável por contagem de itens de emergência **exceto** `A139-REQ-01`, cujo agrupamento de 6 emergências consecutivas nas posições 12–17 é o único ponto do sistema com esse padrão — mantém-se como ponto de atenção pedagógica não resolvido, não como bloqueio de segurança.

---

## 7. Auditoria dos novos códigos

| Código | Nome | Avaliável? | Genérico? | Duplica legado? | Aparece corretamente na ficha? |
|---|---|---|---|---|---|
| `OPS-NOT-X1` | Ilusão visual noturna / black hole effect — reconhecimento, correção e recuperação | Sim, ação observável | Não | Não (`LOFT-NOT-31`/`S76-LOFT-*` legados permanecem desativados) | Sim, confirmado nas 6 sessões corretas |
| `A139-AUT-03` | Autorrotação noturna dedicada AW139 | Sim | Não | Não (`A139-AUT-02` é item distinto, sessão diferente) | Sim, confirmado nas 2 sessões corretas |
| `INV-ETH-01` | Postura ética, limites de atuação e responsabilidade do instrutor | Parcialmente — não há descritor de faixa de nota dedicado (diferente dos 60 descritores NOTECHS) | Não | Não, item novo | Sim, confirmado em `TRE-INST` #6 |
| `EXA-CND-03` (reativado) | Conduzir um Exame de Proficiência | Sim | Não | Não — distinto de `EXA-PLN-01` (planejamento) | Sim, confirmado ordem=10 em `CRED-EXA` |
| `EXA-PAD-01` + override | Padronização operacional + representatividade da autoridade, com nota de rubrica dual | Sim, com a ressalva de que a "rubrica dual" é texto instrutivo em `observacoes`, não 2 campos de nota separados na ficha (diferente do desenho dos 60 descritores NOTECHS) | Não | Não | Sim, confirmado conteúdo exato em produção |

**Avaliação adicional (não presente no relatório anterior):** a solução por override para `EXA-PAD-01` (item 6 desta tarefa) é funcionalmente uma **instrução de preenchimento em texto livre** dentro do campo `nome`/`descricao` da técnica, não uma estrutura de dados que force o avaliador a preencher duas notas distintas. Um avaliador apressado pode ler a instrução e ainda assim registrar um único resultado. É uma melhoria real sobre o estado anterior (nota apenas em documento interno), mas não é equivalente, em rigor de auditabilidade, a um campo estruturado — vale registrar como limitação aceita, não como resolvido de forma completa.

---

## 8. Auditoria dos overrides

Os 7 overrides foram lidos integralmente nesta auditoria (não apenas contados):

| Sessão | Manobra | Texto do override | Avaliação |
|---|---|---|---|
| `S76-P-C1/VFR` | `S76-FFM-32` | "Fluxo de Combustível fora do Normal — decisão de retorno e encerramento" | Claro, operacionalmente específico, resolve a lacuna original |
| `A139-S-02/02` | `A139-CKL-01` | "Normal checklist — preparação IFR semestral" | Claro, remove o resíduo "noturna" corretamente |
| `A139-S-02/02` | `A139-EST-01` | "Estacionamento e corte pós-voo" | Claro |
| `CRED-EXA` | `EXA-PAD-01` | "Padronização operacional e representatividade da autoridade — avaliar e registrar separadamente: (a)...(b)..." | Claro, mas ver ressalva da Seção 7 sobre rubrica dual não estruturada |
| `SK76-I-05/12` | `S76-UAR-00` | "Recuperação de atitudes anormais básica após perda momentânea de referências" | Claro, adiciona gatilho de falha ausente antes |
| `SK76-S-02/02` | `S76-CKL-01` | "Checklist e preparação IFR" | Claro |
| `SK76-S-02/02` | `S76-EST-01` | "Encerramento pós-voo" | Claro |

Nenhum dos 7 contém `tipo_item=`, `fase_voo=`, `matriz_v6_modelo=`, `sourceNotes`, `prompt`, JSON, ou qualquer outro metadado interno. Nenhum é genérico a ponto de perder significado pedagógico. Nenhum duplica indevidamente um código legado. Todos aparecem apenas nos vínculos exatos documentados — confirmado que manobras compartilhadas em outras sessões (ex. `A139-CKL-01` em `A139-NOT-01`) **não** foram afetadas pelo override (`observacoes` vazio nesses vínculos).

A solução por override é aceitável como correção pontual e reversível, mas é **paliativa por natureza**: o texto correto vive em uma tabela de vínculo, não no registro de manobra em si, o que significa que qualquer relatório, exportação ou ferramenta futura que leia `manobras.nome` diretamente (sem passar pelas 2 funções que aplicam o override) voltará a mostrar o texto errado. Isso não é uma falha do PR #262 — é uma limitação inerente ao desenho escolhido, que vale documentar para quem construir a próxima superfície de leitura desses dados.

---

## 9. Auditoria LOFT/noturno/offshore

Sem mudança de mecanismo desde a auditoria anterior: o enquadramento LOFT das 4 sessões semestrais continua dependendo de `loftByCode || loftByStructuredNote` (regex de texto livre), sem coluna estrutural — migration 0417 prepara essa coluna mas não foi aplicada. Isso não bloqueia a ficha final (o enquadramento textual funciona e é auditável por humano), mas é frágil a longo prazo (uma futura edição de nota pode quebrar silenciosamente a detecção).

Black hole (`OPS-NOT-X1`) e autorrotação noturna (`A139-AUT-03`) seguem bem posicionados, confirmado por consulta direta — sempre antes do bloco de aproximação final, nunca adjacentes a mais de uma emergência grave simultânea, carga total mantida em 18 itens (substituição, não adição). "IFR-emergências" como nome dos 6 ciclos é coerente com o conteúdo real, confirmado por amostragem.

Ponto novo identificado nesta auditoria (Seção 5.1): as sessões `*-REQ-01` (reaquisição) carregam a mesma manobra de "preparação noturna" como abertura mesmo não sendo sessões noturnas — mecanismo de correção idêntico ao já usado (override) resolveria isso com baixo esforço.

---

## 10. Auditoria TRE-INST

18 técnicas confirmadas ativas (Seção 3). Progressão preparação→planejamento→briefing→demonstração→supervisão→gerenciamento de erro→emergências→avaliação→debriefing→administrativo mantida, sem mudança de código desde a auditoria anterior. `INV-ETH-01` (postura ética, ordem #6) confirmado presente e corretamente posicionado, sem reativar o legado `INV-CRM-04`.

**Lacuna que permanece:** não existe rubrica ou faixa de nota dedicada para `INV-ETH-01` — é um item de "postura/conduta" avaliado sem critério objetivo documentado no sistema, diferente do rigor que os 60 descritores NOTECHS têm (mesmo que não calibrados). Isso não bloqueia a ficha, mas é uma lacuna de auditabilidade regulatória que deveria constar do próximo PR de melhoria.

---

## 11. Auditoria CRED-EXA

`EXA-CND-01`→`EXA-CND-03` confirmado corrigido em produção (Seção 3, reconfirmação independente do achado mais crítico da auditoria anterior). `EXA-PAD-01` com rubrica dual em texto (Seção 7/8). `EXA-STD-01`, `EXA-RSK-01`, `EXA-DEC-01`, `EXA-DBF-01` preservados como itens distintos — padronização, risco/segurança, determinação de resultado e debriefing continuam segregados, então `CRED-EXA` continua sustentando o papel de examinador, não uma ficha genérica de CRM/check.

NOTECHS aplicado a `CRED-EXA` permanece apenas com nota textual de contextualização (sem diferenciação de código/UI) — mesma lacuna herdada, não nova.

---

## 12. Auditoria NOTECHS

Os 15 NOTECHS canônicos confirmados byte a byte (códigos e nomes) contra a lista oficial do prompt de auditoria (Seção 3). Zero contaminação nas 18 técnicas, confirmado. Guardrail `FORBIDDEN_TECHNICAL_CODE_RE` confirmado ativo no loader.

Calibração dos 60 descritores: **não realizada**, aviso inalterado em `notechs.ts` linha 13. Isso é uma pendência pré-existente, não criada por este ciclo, e não é uma tarefa de código — exige revisão de instrutor-chefe/gestor de treinamento contra a régua real da empresa.

**Classificação da calibração NOTECHS:**
- Bloqueante para uso operacional em exame real com valor regulatório objetivo: **sim, indiretamente** — sem calibração, o avaliador aplica critério próprio não documentado, o que é uma fragilidade em caso de contestação de resultado.
- Bloqueante para gerar o PDF em si: **não** — o PDF pode ser gerado com o aviso de não-calibração continuando presente; o bloqueio é de uso avaliativo com peso regulatório, não de geração do artefato.
- Classificação final: **melhoria obrigatória antes de qualquer escala comercial/uso avaliativo com peso oficial**, não bloqueante para a geração do artefato PDF em si.

---

## 13. Auditoria visual/frontend

Não realizada com autenticação de produção, pelas mesmas razões já registradas na auditoria anterior (exigiria credencial de produção ou apontar proxy local para produção, ambos fora do escopo read-only sem autorização adicional explícita para esse acesso específico). Verificação de código (não de renderização ao vivo) confirma:

- Overrides só populam `nome`/`descricao` da técnica correspondente — não vazam para outras técnicas.
- `observacoes: ''` é explicitamente forçado na ficha-modelo em branco (`fichaModeloPdf.ts`), então a nota do avaliador (campo diferente, mesmo nome) nunca aparece pré-preenchida.
- NOTECHS renderiza como bloco distinto, nunca misturado com as 18 técnicas (estrutural, não uma escolha de runtime).

**Pendência mantida:** confirmação visual real, autenticada, de que a ficha impressa/PDF de `CRED-EXA` e de uma sessão com override (ex. `A139-S-02/02`) mostra exatamente o texto esperado e nenhum resíduo de metadado — recomendado antes de distribuir qualquer PDF a examinador real.

---

## 14. Benchmark crítico (AeroMaster/PTO/Guia do Instrutor)

Comparação qualitativa, sem acesso a um documento de benchmark estruturado no repositório (nenhum arquivo `AeroMaster`/`PTO` foi encontrado como fonte local formal — a comparação é feita contra padrões gerais de treinamento de simulador de asas rotativas, não contra um documento específico da empresa):

| Dimensão | Estado AirTrust V6.2 | Classificação |
<br>
| Distribuição de sessões (inicial/periódico/semestral/reaquisição/instrutor/exame) | Presente e completa para ambas as frotas | Não aplicável — já adequado |
| LOFT | Presente, mas com enquadramento estrutural pendente (migration 0417) | Melhoria necessária antes de escala comercial, não bloqueante para PDFs |
| Noturno/offshore | Bem coberto (black hole, autorrotação); resíduo textual em REQ-01 | Necessária antes dos PDFs de `*-REQ-01` especificamente |
| Reaquisição | Presente, mas com a única sessão do sistema com concentração de emergências não resolvida (`A139-REQ-01`) | Necessária antes dos PDFs de `A139-REQ-01` |
| Instrutor/Examinador | `TRE-INST`/`CRED-EXA` distintos e substantivos, sem rubricas dedicadas de postura/dual-rubric estruturadas | Melhoria pós-V6.2 |
| Registros/critérios de avaliação | NOTECHS com 60 descritores documentados (não calibrados); `INV-ETH-01` sem rubrica alguma | Melhoria obrigatória antes de uso avaliativo com peso oficial |
| Papel do Guia do Instrutor | Não existe ainda como artefato formal no AirTrust | Melhoria futura — GO para iniciar, sem bloquear o restante |

Nenhum ponto do benchmark é bloqueante *agora* para a maioria dos 51 modelos; os pontos que já foram sinalizados como pendência nas seções anteriores (calibração NOTECHS, rubrica dual estruturada, `A139-REQ-01`) são os mesmos que aparecem aqui.

---

## 15. Riscos ocultos investigados

| Risco | Investigado | Resultado |
|---|---|---|
| Override escondendo problema de modelagem mais profundo | Sim | Confirmado real, mas aceito conscientemente: a alternativa (duplicar registro de manobra por variante) criaria mais entropia. Documentado como decisão, não como acidente. |
| Dependência de `observacoes` com semântica ambígua | Sim | O mesmo nome de campo (`observacoes`) existe em `modelos_sessao_manobras` (override de texto) e em `fichas_sessao`/`fichas_sessao_manobras` (nota do avaliador) — são campos totalmente diferentes com o mesmo nome. Código atual já comenta essa ambiguidade explicitamente (`fichaModeloPdf.ts`), mas é uma armadilha real para qualquer desenvolvedor futuro que não leia o comentário. |
| Risco de metadado interno no aluno | Sim | Ver achados 4.1/4.2 — proteção existe mas é mais estreita que o exigido, e só em tempo de leitura |
| Risco de ficha futura copiar texto errado | Sim | Confirmado real e mais amplo que documentado — ver achado 5.1 (`*-REQ-01`) |
| Risco de técnico legado reaparecer | Sim | Os 5 modelos SK76 legados permanecem `ativo=0`, zero fichas vinculadas (Seção 3); nenhum caminho de reativação automática encontrado no código |
| Risco de soft-delete não respeitado | Sim | Todas as consultas de montagem de ficha filtram `deleted_at IS NULL` consistentemente nos 5+ arquivos revisados |
| Risco de ordem quebrada | Não encontrado | `ordem` consistente 1–18 em todas as amostras verificadas |
| Risco de filtro frontend mostrar legados | Não verificado visualmente (pendência da Seção 13); código backend já filtra `ativo=1` nas consultas de listagem revisadas |
| Risco de relatório/PDF usar fonte diferente da auditada | Sim | Confirmado que **existe** uma 6ª rota (`simuladores-modelos.ts`) que lê `observacoes` fora do caminho das 2 funções de blindagem — mas é a tela de administração/edição do próprio modelo, não uma ficha voltada ao aluno, então o risco real é o de escrita (achado 4.2), não o de leitura indevida nesse caso específico |
| Risco de NOTECHS contado errado | Não — 15/15 confirmado byte a byte |
| Risco de LOFT parecer decorativo | Parcial — mecanismo textual funciona mas não é auditável estruturalmente sem a migration 0417 |
| Risco de `CRED-EXA`/`TRE-INST` não sustentarem seus papéis | Não confirmado — ambos mantêm progressão e distinção de itens condizente com examinador/instrutor real |
| Risco de excesso de emergência em uma sessão | Confirmado em 1 sessão (`A139-REQ-01`), já tratado nas Seções 5.2/6 |
| Risco de falta de fechamento operacional | Não encontrado em nenhuma das 51 sessões |
| Risco multiempresa/tenant | Não encontrado — todas as consultas usadas nesta auditoria e no código revisado filtram por `empresa_id` consistentemente |
| Risco de regressão ao gerar fichas novas agora | Baixo para 49/51 modelos; ver achados 5.1/5.2 para as 2 sessões de reaquisição antes de gerar fichas reais delas |

---

## 16. Achados classificados por risco

| # | Achado | Severidade |
|---|---|---|
| 1 | Regex de blindagem de metadado interno cobre só 5 padrões `chave=valor`, não `sourceNotes`/`prompt`/`debug`/`RBAC`/JSON exigidos pelo escopo | **MÉDIO** |
| 2 | Nenhuma validação em tempo de escrita do campo `observacoes` nas rotas administrativas de modelo | **MÉDIO** |
| 3 | Resíduo "noturna" não corrigido em `A139-REQ-01`/`S76-REQ-01` (mesma classe já corrigida em `*-S-02/02`) | **MÉDIO** |
| 4 | Discrepância entre `acceptance-matrix` (afirma resolvido) e estado real de produção sobre concentração de emergências em `A139-REQ-01` | **MÉDIO** (governança documental) |
| 5 | Concentração de 6 emergências consecutivas em `A139-REQ-01` (posições 12–17) | **BAIXO-MÉDIO** (decisão pedagógica do owner, não falha de segurança) |
| 6 | Calibração dos 60 descritores NOTECHS não realizada | **MÉDIO** (bloqueante para uso avaliativo com peso oficial, não para o artefato PDF) |
| 7 | `INV-ETH-01` sem rubrica/faixa de nota dedicada | **BAIXO-MÉDIO** |
| 8 | `EXA-PAD-01` com rubrica dual apenas em texto instrutivo, não estruturada | **BAIXO-MÉDIO** |
| 9 | LOFT sem metadado estrutural (migration 0417 não aplicada) | **BAIXO-MÉDIO** |
| 10 | 25 posicionamentos de técnica "noturna" em sessões iniciais/reaquisição sem confirmação explícita de intencionalidade | **OBSERVAÇÃO** (pode ser correto por design de simulador; requer confirmação de instrutor-chefe) |
| 11 | Verificação visual/frontend autenticada não realizada (mesma pendência da auditoria anterior) | **OBSERVAÇÃO** — recomendado antes de distribuir PDF real |
| 12 | Ambiguidade de nome de campo `observacoes` entre tabelas de template e de ficha | **OBSERVAÇÃO** |

Nenhum achado é CRÍTICO ou ALTO. Nenhum bloqueia imediatamente o uso do sistema. Os achados 1–4 são os que mais merecem atenção antes de qualquer expansão do mecanismo de override ou geração de PDF para as sessões `*-REQ-01`.

---

## 17. Pendências

1. Endurecer `INTERNAL_METADATA_LEAK_RE` para cobrir `sourceNotes`, `prompt`, `debug`, `RBAC`, `auditoria interna` e padrão JSON genérico — recomendado antes de qualquer expansão do mecanismo de override para fonte menos controlada que apply-plan revisado manualmente.
2. Adicionar validação em tempo de escrita (mesmo regex, ou mais estrito) nas rotas de `simuladores-modelos.ts` que persistem `observacoes`.
3. Aplicar o mesmo padrão de override já usado (Seção 8) aos 2 vínculos de `A139-REQ-01` e 2 de `S76-REQ-01` que ainda carregam texto "noturna" residual — mesmo mecanismo, mesmo esforço já demonstrado nas 7 correções anteriores.
4. Decisão do owner sobre `A139-REQ-01` (concentração de emergências) — e correção de `acceptance-matrix` linha 64 para não afirmar uma resolução que não ocorreu, evitando que outro leitor confie nessa linha no futuro.
5. Confirmar com instrutor-chefe se os 25 posicionamentos de técnica noturna em sessões iniciais/reaquisição (achado 10) são intencionais (exposição a cenário noturno dentro de currículo geral) ou resíduo de template — não é possível decidir isso só com dados de banco.
6. Calibração dos 60 descritores NOTECHS contra a régua real da empresa (pendência pré-existente, não criada por este ciclo).
7. Migration 0417 (`caracter_loft`) — revisão em staging antes de aplicar em produção, sob autorização explícita.
8. Verificação visual/frontend autenticada da ficha `CRED-EXA` e de uma sessão com override, antes de distribuir qualquer PDF real a examinador/instrutor.
9. Considerar unificar o regex de blindagem em um módulo compartilhado (import único) em vez de duplicado em backend/frontend, para eliminar o risco de divergência silenciosa futura entre os dois.

---

## 18. Decisões GO/NO-GO

| Decisão | Veredito | Justificativa |
|---|:---:|---|
| 1. Matriz V6.2 tecnicamente aplicada (51/918/18/15 + correções de segurança) | **GO** | Reconfirmado de forma totalmente independente nesta auditoria — zero divergência |
| 2. Matriz V6.2 pedagogicamente aceitável | **GO com ressalvas** | 49/51 modelos sem ressalva relevante; `A139-REQ-01`/`S76-REQ-01` com resíduo textual e (o primeiro) concentração de emergências não resolvida |
| 3. Gerar fichas/PDFs finais | **GO condicional** | GO para 49/51 modelos. NO-GO especificamente para `A139-REQ-01` e `S76-REQ-01` até aplicar os overrides de texto já disponíveis (esforço baixo, mecanismo já existe e já foi usado 7 vezes) |
| 4. Uso operacional controlado | **GO condicional** | Mesma ressalva do item 3; demais 49 modelos sem bloqueio |
| 5. Calibração NOTECHS antes dos PDFs | **NÃO bloqueante para o artefato PDF**, mas **bloqueante para uso avaliativo com peso oficial** — gerar o PDF com o aviso de não-calibração é aceitável; usá-lo para decidir aprovação/reprovação sem calibração não é recomendado |
| 6. Migration 0417 | **NO-GO por enquanto** — revisão em staging primeiro, sob autorização explícita, sem urgência (o caminho textual de evidência LOFT continua funcional) |
| 7. Guia do Instrutor | **GO para iniciar** — não há dependência bloqueante |
| 8. Considerar Matriz V6.2 encerrada | **NÃO** — 2 correções de baixo esforço (achado 5.1) e 2 itens de blindagem (achados 4.1/4.2) permanecem abertos; encerramento recomendado somente após esses 4 itens, que juntos representam menos esforço do que qualquer uma das fases já concluídas |

---

## 19. Recomendações macro seguintes

Recomenda-se **uma única macroetapa** antes de qualquer geração de PDF real para examinador/instrutor: um PR pequeno e cirúrgico, no mesmo padrão do PR #262, cobrindo:

1. Endurecimento do `INTERNAL_METADATA_LEAK_RE` (achado 4.1) — ideal como constante compartilhada importada por ambos os lados, não duplicada.
2. Validação em tempo de escrita nas rotas de `simuladores-modelos.ts` (achado 4.2).
3. Os 4 overrides de texto faltantes em `A139-REQ-01`/`S76-REQ-01` (achado 5.1), usando o mecanismo já existente — sem código novo, só dados.
4. Correção da linha 64 de `acceptance-matrix-51-modelos.md` para refletir o estado real de `A139-REQ-01` (achado 5.2) — documental, sem custo.

Após esse PR, a matriz estará pronta para: (a) confirmação visual autenticada da ficha real (pendência 8), e (b) decisão do owner sobre `A139-REQ-01` e sobre iniciar a calibração NOTECHS — que podem correr em paralelo, sem bloquear um ao outro.

---

## Confirmações finais

- ✅ Auditoria estritamente read-only. Nenhum `UPDATE`/`DELETE`/`INSERT` executado — apenas `SELECT` via `wrangler d1 execute --remote`.
- ✅ Nenhuma migration executada, nenhum deploy realizado.
- ✅ Nenhuma manobra apagada, arquivada ou desativada por esta auditoria.
- ✅ Fichas, sessões, avaliações, histórico, LMS, Qualificações e RBAC não tocados.
- ✅ Nenhum PDF final gerado.
- ✅ Nada neste documento constitui homologação, aprovação ou aceite pela ANAC.
- ✅ Nenhuma informação interna de auditoria/prompt/rastreabilidade foi proposta para exibição ao aluno — pelo contrário, os achados 4.1/4.2 recomendam fechar essa superfície mais, não abri-la.
- ✅ Contagem 51/918/15 não foi tratada como evidência suficiente por si só — cada achado foi cruzado contra conteúdo real, nomenclatura, sequência e, quando disponível, contra mais de um documento-fonte (achado 5.2 nasceu exatamente desse cruzamento).

*Fontes: produção (`airtrust-db`, empresa_id=6, via `wrangler d1 execute --env production --remote`), deployments ao vivo (`api.airtrust.online/api/health`, `wrangler pages deployment list`), `git log`/`git show`/`git worktree list` sobre `main` pós-PR #262, e os 6 documentos de análise/ops listados na Seção 2.*
