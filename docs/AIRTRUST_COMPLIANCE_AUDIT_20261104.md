# AirTrust — Auditoria do módulo de Compliance, 2ª rodada (2026-11-04)

**Base:** `main` @ `ccc5bf2c9` (fix(compliance) #1945). **Branch:** `audit/compliance-integral-2-20261104`.
**Rodada anterior:** `docs/AIRTRUST_COMPLIANCE_AUDIT_20261102.md` (base `6142be5a9`). Esta rodada **reexecuta** tudo o que a anterior executou contra o código vigente, **audita o que entrou depois** e **fecha** achados que ficaram abertos.
**Ambiente dos testes:** local (Vitest/Node + SQLite real via `node:sqlite`), dados 100% sintéticos. Nenhum D1/R2 remoto, dado real ou escrita em staging/produção. Leituras externas: somente `GET /api/version` e `GET /api/health` (públicos) de staging e produção, para confirmar SHAs.

> **EXECUTADO** = rodou e o resultado está aqui. **ANALISADO** = lido no código, sem execução que o prove. **BLOQUEADO / NOT RUN** = exigiria credencial, ambiente ou autorização que esta sessão não tem.

---

## A. Cobertura

### O que mudou desde a 1ª rodada (delta auditado)
| PR | Mudança | Como foi tratada |
|---|---|---|
| #1916 | BRT no status, `/minhas` sem canceladas, auditoria 1 | reexecutada: todas as regressões seguem verdes |
| #1918 | data de conclusão LMS em São Paulo (fecha D5 no LMS) | lida e reexecutada |
| #1919 | aviso de aluno sem conta vinculada (mitiga D8) | lida (lista de arquivos e testes) |
| #1924 | matrícula automática compatível com `funcionarios_aeronaves` legado (sem `empresa_id`) | **diff lido**; isolamento de tenant reavaliado (ver C) |
| #1928 | evidência histórica canônica `TREINAMENTO EAD` | diff lido; teste do PR reexecutado |
| #1945 | `/resumo`: cobertura geral × específica (3 contadores novos) | diff, teste do PR e custo computacional medidos |
| #1943 e correlatos | handoff de edição SCORM, crédito administrativo | só o construtor de crédito administrativo foi auditado (ver E) |

### Inventário
- **48 declarações de rota** em 9 arquivos (`compliance*.ts` e `setores-responsaveis-compliance.ts`); a 1ª rodada contou 45. Guards de auth/RBAC/tenant relidos um a um. Todo handler tem `auth()`; escrita e relatórios têm `requireRole`. Sem `requireRole` por desenho: `GET /capabilities`, `GET /funcionarios/:id` (restrito por `assertFuncionarioInScope`, o aluno só enxerga a si) e as duas rotas legadas `GET /funcionarios/:id/compliance` e `GET /compliance/funcionarios` (também restritas por escopo de setor).
- **Varredura automática de SQL** (script desta rodada, 9 serviços/rotas de compliance): 9 consultas sem `empresa_id` na própria string; 7 são falsos positivos (escopadas por parâmetro dinâmico ou por IDs de funcionários já filtrados por tenant) e 1 era real, de baixa gravidade (N3). A varredura procura também `fa.empresa_id` em `funcionarios_aeronaves` (coluna inexistente no esquema legado implantado, causa do bug do #1924): não restou nenhum uso na área de compliance.
- **Código morto:** `components/compliance/ComplianceMatrix.tsx` (N4).

| Classificação | Resultado |
|---|---|
| **Testado por execução** | motor de status e agregados, paridade TS×SQL, RBAC efetivo, visibilidade do aluno, edge de datas BRT (compliance, histórico de qualificações, validação pública de certificado), escopo do recálculo, isolamento de requisitos, escala do motor |
| **Reprovado e corrigido nesta rodada** | N1, N2 (=D7), N3 |
| **Reprovado e já corrigido antes** | D1, D2, D5 (LMS) |
| **Aberto por decisão de produto** | D3, D4, D6 |
| **Somente analisado** | N4, N5, N6, crédito administrativo SCORM |
| **BLOQUEADO / NOT RUN** | ver F |

### Suítes executadas
- Compliance + serviços + cron (Worker), no SHA base: **208 arquivos / 1.640 testes passando**, `tsc --noEmit` do Worker limpo.
- Frontend `compliance` + `lms` + `qualificacoes`: **57 arquivos / 259 testes passando**.
- **Worker completo no código final: 1.038 arquivos / 7.432 testes passando, 0 falhas.** `tsc --noEmit` do Worker limpo; `npm run lint` (inclui `guard:layer-boundaries`, `guard:route-ownership`, `guard:no-raw-fetch`, `guard:schema-contract-staleness` e demais) saiu com código 0.

---

## B. Matriz de testes (novos nesta rodada)

Quatro arquivos novos em `worker-airtrust/src/__tests__/compliance/`. Cada teste de defeito foi verificado **vermelho sem a correção e verde com ela**.

| ID | Funcionalidade | Cenário | Esperado | Sem correção | Com correção |
|---|---|---|---|---|---|
| T2-REC-1..5 | `POST /recalculate` | `funcionario`/`tipo_qualificacao` sem `entity_id`; `entity_id` 0, negativo, fracionário | 400 e nenhuma consulta ao banco | 200, recalculava a empresa inteira | PASS |
| T2-REC-6 | `POST /recalculate` | `scope` desconhecido | 400 | 500 | PASS |
| T2-REC-7..9 | `POST /recalculate` | `all`/omitido; `funcionario`+id; `tipo_qualificacao`+id | 200, consultas com `empresa_id` e o alvo | PASS | PASS |
| T2-REQ-1..4 | Requisitos legados (SQL real) | POST/PUT devolvem a linha do tenant; PUT/DELETE em requisito de outro tenant → 404 e linha alheia intacta; **toda** SQL do roteador carrega `empresa_id` | idem | falha só na última | PASS |
| T2-BRT-1..4 | Histórico de Qualificações (status da linha) | vence 2026-11-04; 20:59, 22:30, 23:59 e 00:00 BRT | `VENCENDO_30` até 23:59, `VENCIDA` às 00:00 | VENCIDA às 22:30 e 23:59 | PASS |
| T2-BRT-SQL-1..12 | Filtros SQL do Histórico (SQLite real) | predicados reais com relógio fixado por parâmetro em 20:59, 22:30, 23:59 e 00:00 BRT; partição exata; igualdade com a classificação da linha; ordenação sem `date('now')` UTC; SQL×TS em ~700 instantes | idem | VENCIDA às 22:30 (contraste documentado) | PASS |
| T2-BRT-5..8 | Validação pública de certificado | mesmos instantes | `VALIDA` até 23:59, `VENCIDA` às 00:00 | VENCIDA às 22:30 e 23:59 | PASS |
| T2-BRT-9..10 | `checkConflitos` | 22:30 BRT, vencimento amanhã avisa; no próprio dia não avisa | idem | não avisava (amanhã) | PASS |
| T2-ESC-1..4 | Escala do motor | 4.000 funcionários × 400 regras; dobrar a base; varredura de `/resumo`; determinismo | linear e dentro do orçamento | n/a | PASS |

Reexecutados e verdes no SHA atual (da 1ª rodada): oráculo de status/agregados (27), RBAC efetivo (4), visibilidade do aluno (11), paridade TS×SQL (8 + 1 caracterização de D4).

---

## C. Defeitos

### Fechados nesta rodada

**N1 — P3 — Três leituras ainda comparavam com a data UTC (CORRIGIDO).** Mesma causa do D1 em outro módulo: entre 21h e 24h BRT, um item que vence **hoje** aparecia como VENCIDO, enquanto o Compliance (após o #1916) o mostrava como VENCENDO (`dias=0`).
- `routes/qualificacoes/historico.ts` — status derivado de cada linha da lista (`VENCIDA`/`VENCENDO_30`) **e** os filtros SQL VALIDA/VENCENDO_30/VENCIDA do mesmo handler, além do status/ordenação em `historico-helpers.ts` (achado do review automático da PR: com só a linha corrigida, filtro e linha divergiriam entre 21h e 24h BRT).
- `routes/certificados/validacao.ts` — `situacao_operacional_atual` da **página pública** de validação do certificado.
- `routes/qualificacoes/validacao.ts` — aviso "já possui esta qualificação válida".
- **Correção:** `getTodayIsoSaoPaulo()` na linha e na validação; no SQL, a expressão única `SAO_PAULO_TODAY_SQL = date('now','-3 hours')` (avaliada por consulta, UTC-3 fixo) e o construtor `buildVencimentoStatusPredicates`. Um teste cruza essa expressão com `getTodayIsoSaoPaulo` em ~700 instantes (virada de ano e bissexto) e acusa divergência se o fuso voltar a ter horário de verão. Sem esquema, sem escrita, sem mudança de contrato.
- **Impacto:** divergência de status entre telas e um certificado válido mostrado como vencido por até 3 h no último dia de validade.

**N2 (= D7) — P3 — Recálculo com escopo restrito sem alvo recalculava tudo (CORRIGIDO).** A tela de Configurações permite deixar "entity_id" vazio. Agora o contrato exige `entity_id` inteiro positivo para `funcionario` e `tipo_qualificacao` e responde 400; entrada inválida em geral passa a ser 400 e não mais 500. A tela de Configurações já exibe a mensagem do erro (`errorData.error`), então o usuário passa a ver "entity_id obrigatório para o escopo informado" em vez de um recálculo silencioso da empresa inteira; o outro chamador (`ComplianceMatrix`) é código morto (N4). O recálculo continua exclusivo de admin.

**N3 — P4 — Releitura por `id` sem `empresa_id` em `compliance-requisitos.ts` (CORRIGIDO).** Sem vazamento (o `id` já passava por checagem de tenant), mas defesa em profundidade: POST e PUT agora releem com `AND empresa_id = ?`. Teste prova que toda SQL do roteador carrega `empresa_id`.

### Reavaliados e ainda abertos
- **D3 — P3 — RBAC efetivo de `/api/compliance/*` é admin-only**, contra o contrato declarado (admin|manager). Inalterado; fail-closed; teste de caracterização verde. **Decisão de produto/segurança.**
- **D4 — P2 — TS e SQL divergem para aeronave encerrada + campo legado.** Reavaliado após o #1924: o predicado SQL agora exige que a atribuição ativa exista **com aeronave do tenant** (correto para isolamento), mas continua **ignorando a janela de datas**, então a divergência persiste (teste de caracterização verde). **Decisão de produto.**
- **D6 — P2 (latente) — Motor legado por função** (`funcao || 'Piloto'`, `includes` bidirecional, função sem requisito = `conforme`, `curso_lms` concluído vale para sempre, `LIMIT 2000`). Sem consumidor de UI para as duas rotas `GET`. **Aposentar ou alinhar ao V2: decisão de produto.**

### Fechados antes, confirmados
- **D1** (BRT no motor), **D2** (`/minhas` sem cancelada) e **D5 no LMS** (#1918: `/scorm/commit`, `/finalizar`, `xapi`, `PATCH status` gravam o dia de São Paulo): verdes no SHA atual e **publicados** (Worker `4240f499b`, Pages `57cf6cc8d`).
- **D8 — matrícula administrativa que "não aparece":** a camada de repositório/identidade segue provada correta (11 testes). O #1919 passou a **avisar** quem matricula quando a conta não está vinculada, e o #1944 reconciliou por trilha governada o vínculo de um usuário real — consistente com a hipótese de causa (conta sem `usuarios.funcionario_id`). **Não verifiquei** se é o mesmo caso do relato original; a consulta somente-leitura de D8 da 1ª rodada continua sendo o fecho (ver F).

### Observações (P4, sem alteração)
- **N4 — Código morto quebrado:** `ComplianceMatrix.tsx` usa `apiFetch` sem importá-lo e chama `/compliance/recalculate` sem token nem corpo; só é reexportado em `LazyComponents.tsx`, sem importador. Inalcançável hoje; remover é limpeza, não correção.
- **N5 — `GET /compliance-treinamentos/capabilities`** responde a qualquer autenticado (flags de prontidão de esquema). Sem dado sensível.
- **N6 — Datas UTC remanescentes, todas no sentido permissivo ou em caminho de alto risco:** `generate-certificate.ts:365` (data de conclusão usada **só** quando o histórico não a tem), `status-codes.ts:198` e `historico-atomic-write.ts:108` (validam "não é futura", aceitam até o dia UTC), chave de cache diária em `historico.ts:1037`, `dashboardService.ts:618`. Não alterei a emissão de certificado sem staging.
- **N7 — P3 — Contadores do Histórico usam o instante, não o dia (pré-existente, não alterado).** Os totais `vencidas/vencendo/validas` (e o rank `status` por `julianday`) comparam `julianday(vencimento)` com `julianday('now')`: um item que vence **hoje** conta como vencido desde a 00:00 UTC do dia do vencimento, enquanto a linha e os filtros o tratam como `VENCENDO_30` até o fim do dia. Mudar os totais altera números de cabeçalho da tela; fica como decisão de produto.
- O corte `resolveRealizedCutoff` do motor (aceita a data UTC como "não futura") **permanece** necessário: os gravadores de Histórico/Certificados ainda gravam UTC (N6). Só o LMS foi migrado.

---

## D. Cálculos auditados

Fórmula única, inalterada: **`compliance_pct = round(conformes / obrigatórios × 1000) / 10`** (razão de somas), `VENCENDO` conta como conforme, `NAO_APLICA`/`RECOMENDADA` ficam fora, denominador zero → `null`. Reexecutada a bateria de 27 casos (66,7% / 83,3% / 33,3% / 57,1% / 100% / `null`; virada de ano e bissexto; BRT): **verde**.

Contadores novos do #1945 em `/resumo` (`funcoes_sem_regra_especifica`, `setores_sem_regra_especifica`, `pessoas_sem_regra_especifica_funcao`): definição lida contra o código (regra `EMPRESA` não conta como específica; `SETOR_FUNCAO` cobre setor e função; chave de função por `setor:função`); o teste do PR percorre 5 estados de regras e os valores esperados conferem com a definição. É diagnóstico de revisão, não prova de desconformidade — a tela do PR diz isso explicitamente.

**Desempenho do motor (medido, sem banco):**
| Medida | Resultado |
|---|---|
| Snapshot de 4.000 funcionários × 400 regras (139.350 requisitos) | **~220 ms** de CPU |
| Dobrar a base (1.500 → 3.000) | tempo × 2,01 (linear) |
| Varredura nova do `/resumo` (4.000 × 400 × 2) | **~8 ms** |
O motor puro não é gargalo. O custo de carregar funcionários, regras e evidências do D1 **não foi medido** (precisa de staging).

---

## E. Integrações

| Integração | Estado |
|---|---|
| Compliance ↔ LMS | Evidência LMS só conta com `CONCLUIDO` + data não futura + modalidade/perfil compatíveis; reexecutado. **Crédito administrativo SCORM** (`lms-scorm-administrative-credit.ts`): lido por inteiro — insere unidades contíguas e cursor, mantém `lesson_status = incomplete`, **sem nota, respostas ou aprovação**; não fabrica conclusão. O resto do handoff de edição não foi auditado (coberto por testes do próprio PR). Ciclo SCORM real: **BLOQUEADO** (staging). |
| Compliance ↔ Qualificações | Mesma data operacional agora também na lista de Histórico (N1). Evidência canônica `TREINAMENTO EAD` (#1928) coberta pelo teste do PR. |
| Compliance ↔ Certificados | Validação pública corrigida (N1). **Emissão** de certificado: não executada. |
| Compliance ↔ Funcionários/Setores | Escopo `all`/`restricted`/`self` exercitado; paridade TS×SQL reexecutada; isolamento do vínculo de aeronave legado reavaliado (JOIN com aeronave do tenant + ID de funcionário global, sem vazamento cruzado). |
| Cron de snapshot/notificações | Suítes `cron/*` verdes. |

---

## F. Entrega técnica

- **Branch:** `audit/compliance-integral-2-20261104`, a partir de `ccc5bf2c9`.
- **Produção (6 arquivos):** `routes/compliance-recalculate.ts`, `routes/compliance-requisitos.ts`, `routes/qualificacoes/historico.ts`, `services/qualificacoes/historico-helpers.ts`, `routes/qualificacoes/validacao.ts`, `routes/certificados/validacao.ts`. Sem esquema, sem migration, sem mudança de contrato além do 400 do recálculo.
- **Testes novos (5 arquivos):** `compliance-recalculate-scope`, `compliance-requisitos-tenant.sqlite`, `qualificacoes-certificados-brt-consistency`, `qualificacoes-historico-sql-brt.sqlite`, `compliance-engine-scale`. Três testes antigos que casavam o texto exato `date('now')` foram atualizados para a nova expressão (mesma regra protegida).
- **Verificações locais:** as da seção A (Worker 7.420/7.420, `tsc`, `lint` + guards). Os oito gates oficiais são os da CI da PR e não são substituídos por execução local.
- **Staging:** **não executado.** O workflow `staging-training-compliance-qa.yml` exige que o SHA implantado em staging seja ancestral da `main`; staging está em `a610629` (branch `test/frms-four-case-disposable-sqlite-20261105`), que difere da `main` só por um arquivo de teste FRMS e **não** é ancestral. Reimplantar staging sobrescreveria o deploy de outra frente. O código de compliance em staging é idêntico ao da `main`.
- **Produção:** nada publicado nesta rodada. Publicar exige autorização para SHA/artefato/escopo exatos (Worker-only).

### Não executado (NOT RUN / BLOQUEADO)
Playwright autenticado em staging (`e2e/frontend-pr-ui-qa`, sem credenciais; workflow bloqueado como acima); ciclo SCORM real (abrir, retomar, `suspend_data`, `Commit`/`Finish`); consulta D8 em produção (sem acesso ao D1; Wrangler direto é vedado); custo de leitura do D1 e carga/concorrência; falhas de rede/401/5xx no navegador; layouts tablet/celular; exportações PDF/CSV; e-mails de aviso; emissão de certificado; mudança de cargo/setor ponta a ponta.

---

## G. Nota de confiabilidade operacional comprovada: **7,0 / 10** (era 6,5)

| Critério | Observação |
|---|---|
| Correção do motor de status e agregados | **Alta** — oráculo independente reexecutado no SHA atual |
| Consistência entre motores e entre telas | **Média-alta** — paridade TS×SQL provada; "hoje" agora igual no Compliance, na lista de Histórico e na validação pública; D4 aberto |
| Segurança e tenant | **Média-alta** — 48 rotas relidas, varredura de SQL, nenhum vazamento; D3 é restrição indevida, não brecha |
| Integridade de dados | **Média** — só SQLite sintético; D1/R2 remotos não verificados |
| Integração LMS→Compliance | **Média** — lógica provada e crédito administrativo sem conclusão fabricada; ciclo real não executado |
| Desempenho e resiliência | **Média-baixa** — motor puro medido e linear; I/O do D1, carga e rede **não** medidos |
| Cobertura de testes | **Alta no backend**; **baixa em E2E executado** |

A nota sobe com: o E2E de staging do ciclo treinamento → conclusão → conformidade, a consulta D8 em produção, a decisão de D3/D4/D6 e a migração dos demais gravadores de data para o dia de São Paulo (N6) com staging.
