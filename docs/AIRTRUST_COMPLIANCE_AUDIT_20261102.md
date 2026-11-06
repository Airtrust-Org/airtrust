# AirTrust — Auditoria do módulo de Compliance (2026-11-02)

**Base:** `main` @ `6142be5a9` (fix(lms) #1911). **Branch de trabalho:** `audit/compliance-integral-20261102`.
**Ambiente dos testes:** local (Vitest/Node + SQLite real via `node:sqlite`), dados 100% sintéticos. **Nenhum** staging, produção, D1/R2 remoto ou dado real foi tocado.
**Escopo da frente:** issue #1492 (LMS/Compliance), revalidada contra o código vigente.

> Convenção: **EXECUTADO** = teste rodou e o resultado está neste relatório. **ANALISADO** = lido no código, sem execução que o prove. **BLOQUEADO** = exigiria credencial/ambiente/autorização que esta sessão não tem.

---

## A. Cobertura

O módulo tem **dois motores paralelos**, o que condiciona toda a leitura:

| Motor | Tabelas | Consumidores vivos |
|---|---|---|
| **Training Compliance (V2)** — `treinamento_requisitos`, regras por escopo/condição/aeronave/perfil/modalidade | `compliance-treinamentos*.ts` (36 endpoints), `training-compliance-*.ts`, cron | `ComplianceTreinamentosPage`, `components/compliance/*`, dashboards, cobrança/matrícula automática |
| **Legado por função** — `requisitos_compliance` | `compliance.ts`, `compliance-requisitos.ts`, `compliance-recalculate.ts` (9 endpoints) | `ComplianceSettings.tsx`, `ComplianceMatrix.tsx` (`/requisitos`, `/stats`, `/recalculate`) |

| Item | Qtde |
|---|---|
| Endpoints HTTP de Compliance mapeados (guards de auth/RBAC/tenant lidos um a um) | 45 |
| Endpoints LMS do aluno incluídos por integração (`/matriculas/minhas`, `/minhas-ead`) | 2 |
| Frontend inventariado | 12 componentes + 1 helper em `components/compliance/`; páginas `ComplianceTreinamentosPage`, `ComplianceSettings`, `compliance/Dashboard`, `Configuracoes/MatrizTreinamento` |
| **Código morto** identificado | `QualificacoesCard.tsx` (`fetch` sem auth para rota `/funcionarios/search/:id/compliance` que não existe; sem importadores) |

| Classificação | Resultado |
|---|---|
| **Testado por execução** | motor de status (`computeRequirement`), agregados %, precedência de regras TS×SQL, RBAC efetivo de montagem, visibilidade/escopo do aluno (SQL real), suítes pré-existentes |
| **Reprovado (defeito comprovado)** | D1 (corrigido), D2 (corrigido), D3 (documentado), D4 (documentado) |
| **Somente analisado** | D5, D6, D7, D8 |
| **BLOQUEADO / NOT RUN** | E2E em navegador contra staging, ciclo SCORM real ponta a ponta em staging, dados reais de produção, carga/concorrência, rede instável/sessão expirada, layout tablet/celular, exportações/PDF/e-mails |

Suítes pré-existentes executadas no SHA base, todas verdes: Worker completo **7127 testes passando** (o único vermelho foi um teste novo meu rodando contra código ainda sem o ajuste — corrigido e re-executado, ver F); frontend `compliance` + `lms` + contratos: **35 arquivos / 188 testes**; `compliance-treinamentos.sqlite.test.ts`: 61 testes.

---

## B. Matriz de testes

Testes novos (todos em `worker-airtrust/src/__tests__/compliance/`). Contagem: **51 testes novos em 4 arquivos** (a pasta tem 52 com 1 teste pré-existente), mais as suítes pré-existentes acima.

| ID | Funcionalidade | Cenário | Esperado | Observado | Status | Evidência |
|---|---|---|---|---|---|---|
| T-DATE-1 | Status de vencimento | 22:30 BRT, vence "hoje" | `dias=0`, VENCENDO | `-1`, VENCIDO (antes da correção) | **FAIL→PASS** | `compliance-audit-oracle.test.ts` |
| T-DATE-2 | Status de vencimento | 22:30 BRT, venceu "ontem" | `dias=-1` | `-2` (antes) | **FAIL→PASS** | idem |
| T-DATE-3 | Janela de 30 dias | vence em 30 d vs 31 d | VENCENDO / CONFORME | `29` d (antes) | **FAIL→PASS** | idem |
| T-DATE-4 | Evidência de hoje | conclusão gravada com data UTC às 22:30 BRT | conta como realizada | PASS (regressão que a correção ingênua teria criado) | PASS | idem |
| T-DATE-5 | Evidência futura | `data_realizacao` além do dia UTC | não conta | PASS | PASS | idem |
| T-ST-1..12 | Status | sem evidência; futura; LMS EM_ANDAMENTO; NAO_INICIADO/REPROVADO/CANCELADO; CONCLUIDO sem data; +12 m; vencido; virada de ano/bissexto; renovação; modalidade; perfil | oráculo manual | todos conforme o esperado | PASS (12) | idem |
| T-AGG-1..8 | % individual/setor/função/empresa | dataset 4 pessoas, 9 requisitos | 66,7% / 83,3% / 33,3% / 57,1% / 100% / null | idem | PASS (8) | idem |
| T-PAR-1..8 | Precedência de regras | 8 sementes × 70 regras × 40 funcionários (escopo, condição, aeronave, vigência, ativo, NAO_APLICA) | TS = SQL | idêntico | PASS (8) | `rule-engine-ts-sql-parity.sqlite.test.ts` |
| T-PAR-9 | Aeronave encerrada + legado | caso mínimo | (ambíguo) | TS exige, SQL não | **DIVERGÊNCIA (D4)**, fixada | idem |
| T-RBAC-1..4 | RBAC de `/api/compliance/*` | admin/manager/student/instructor na montagem real | contrato do roteador | manager e leitura negados | **DIVERGÊNCIA (D3)**, fixada | `compliance-mount-rbac.test.ts` |
| T-LMS-1..7 | Identidade do aluno | vinculado, sem vínculo, inativo, usuário removido, tenant errado, inexistente, tenant inválido | `null` exceto vinculado | idem | PASS (7) | `lms-learner-visibility.sqlite.test.ts` |
| T-LMS-8 | `/minhas-ead` | próprio, sem cancelada/curso removido/soft-delete | `[1]` | PASS | PASS | idem |
| T-LMS-9/10 | `/minhas` | sem CANCELADA na lista e no total; consistente com `/minhas-ead` | `[1]`, total 1 | `[2,1]` (antes) | **FAIL→PASS (D2)** | idem |
| T-LMS-11 | Isolamento | outro funcionário / outro tenant | vazio | PASS | PASS | idem |

Teste de regressão obrigatório "matrícula administrativa que não aparece": ver D8 — a camada de repositório/identidade foi provada correta; a causa específica do caso real **não foi reproduzida** (exige dados de produção).

---

## C. Defeitos

### D1 — P2 — Status de vencimento usava a data UTC (CORRIGIDO)
- **Causa raiz:** `computeRequirement` fazia `new Date().toISOString().slice(0,10)`. Entre 21h e 24h BRT a data UTC é a do dia seguinte. Qualificações usa `getTodayIsoSaoPaulo`; o Compliance divergia do resto do sistema nessas 3 h/dia.
- **Reprodução:** `vi.setSystemTime('2026-11-03T01:30:00Z')` (22:30 BRT); requisito que vence 2026-11-02 → VENCIDO (`dias=-1`).
- **Impacto:** requisito que ainda vale hoje aparece VENCIDO, a janela de 30 dias encolhe para 29, e snapshots diários e o cron de snapshot eram rotulados com o dia seguinte. Alimenta pendências, avisos e candidatos à matrícula de renovação.
- **Correção:** `training-compliance-snapshot-builder.ts` (classificação por data BRT, `options.today` injetável), `training-compliance-snapshots.ts` e `cron/training-compliance-notifications.ts` (data do snapshot em BRT).
- **Cuidado de projeto:** o corte "evidência não é futura" **continua em UTC**, porque os gravadores de conclusão gravam data UTC (D5). Trocá-lo também faria uma conclusão de 21h–24h BRT sumir até a meia-noite — coberto por T-DATE-4.
- **Resíduo:** o SQL `date('now')` (vigência de regra, janelas de condição/aeronave) segue UTC; efeito limitado a regras com `vigencia_*` no dia da virada. Não alterado.
- **Situação:** corrigido, regressão automatizada.

### D2 — P3 — `/matriculas/minhas` listava e somava matrícula CANCELADA (CORRIGIDO)
- **Causa raiz:** `listMinhasEnrollments`/`countMinhasEnrollments` sem `m.status != 'CANCELADO'`; `/minhas-ead` já filtrava. Contrato da issue #1492: cancelada não aparece nem soma.
- **Impacto:** o frontend filtra cancelada em todos os consumidores, então o dano era no `pagination.total` e na paginação (limite 100). Funcionalmente seguro: nenhum consumidor depende de ver cancelada (`LmsCursoDetalhe` e `LmsCatalogo` tratam ausência = cancelada).
- **Correção:** `repositories/lms-matricula-queries.ts`. **Situação:** corrigido, regressão T-LMS-9/10.

### D3 — P3 — RBAC de `/api/compliance/*` diverge do contrato declarado (DOCUMENTADO, sem alterar)
- **Causa raiz:** `compliance-recalculate.ts` faz `app.use('*', auth(), requireRole('admin'))`; em Hono o middleware é re-registrado em `/api/compliance/*` e vale para `compliance-requisitos.ts`, montado depois (`index.ts:657-659`).
- **Efeito:** o CRUD de requisitos é admin-only, embora o roteador declare "GET aberto; escrita admin|manager". É **fail-closed** (nenhum vazamento); o custo é manager sem acesso à tela de requisitos.
- **Por que não corrigi:** ampliar acesso é mudança de autorização, e o enunciado proíbe reduzir controle sem decisão. O teste fixa o comportamento efetivo para qualquer mudança futura ser deliberada. **Decisão pendente:** produto/segurança.

### D4 — P2 — Motor TS e predicado SQL divergem para aeronave encerrada + campo legado (DOCUMENTADO)
- **Causa:** `loadEmployees` (TS) só conta atribuições dentro da janela e cai no campo legado `funcionarios.aeronave`; `trainingComplianceRuleApplicabilitySql` só cai no legado se **não existir nenhuma** linha ativa em `funcionarios_aeronaves`, ignorando a janela.
- **Impacto:** funcionário com atribuição encerrada e legado preenchido: o painel mostra o treinamento da aeronave como pendência, mas a cobrança, o aviso e a matrícula automática (predicado SQL) não o enxergam.
- **Por que não corrigi:** qual lado está certo (o legado "ressuscita" aeronave encerrada?) é regra de negócio ambígua. **Decisão pendente:** produto. Fora esse caso, a paridade TS×SQL é total (T-PAR-1..8).

### D5 — P3 — Conclusões LMS gravam a data UTC (ANALISADO, não alterado)
- `lms-matriculas.ts:1487,1490,1872`, `lms-progresso.ts:344,395`, `historico-atomic-write.ts:108`. Concluir às 22:00 BRT grava o dia seguinte (data do certificado e validade +1 dia). Caminho de **alto risco** (conclusão LMS/certificados) → exige teste negativo + staging; não alterei sem esse ambiente. Recomendo corrigir junto com um único helper de "data operacional".

### D6 — P2 (latente) — Motor legado por função (ANALISADO)
`compliance.ts`: (i) `funcao || 'Piloto'` atribui requisitos de Piloto a quem não tem função; (ii) `matchReferencia` aceita `includes` nos dois sentidos (`NR1` casa com `NR10`) → falsa conformidade; (iii) função sem requisitos → `conforme`; (iv) `curso_lms` CONCLUIDO vale para sempre (sem validade); (v) `LIMIT 2000` trunca em silêncio. **Sem consumidor de UI** para `/compliance/funcionarios` e `/funcionarios/:id/compliance`; `ComplianceSettings`/`ComplianceMatrix` usam apenas `/requisitos`, `/stats`, `/recalculate`. Não corrigi: mudar a regra de correspondência pode converter conformes reais em pendentes sem evidência documental. Recomendo decidir entre aposentar o legado ou alinhá-lo ao V2.

### D7 — P3 — `recalculate` com `scope='funcionario'|'tipo_qualificacao'` e `entity_id` ausente recalcula tudo (ANALISADO)
`entity_id` é opcional no schema; sem ele a condição não é aplicada. Tenant-scoped (sem vazamento), mas o escopo pedido é ignorado.

### D8 — Caso de regressão "matriculado e não aparece ao aluno" — NÃO REPRODUZIDO, causas estruturais mapeadas
Provado por SQL real: o aluno vê exatamente as próprias matrículas ativas, nunca as de outro funcionário/tenant (T-LMS-1..11). Caminhos estruturais pelos quais um matriculado **não** vê o curso:
1. **Sem vínculo `usuarios.funcionario_id` → funcionário ativo da empresa:** student/instructor recebem 409; **admin/manager recebem HTTP 200 com lista vazia** desde a PR #1909 (a mensagem de erro que apontava a causa deixou de aparecer). Para um **gestor** matriculado em "CRM para gestores" cujo usuário não esteja vinculado, o resultado agora é silêncio.
2. **ADMINISTRADOR** não tem o alternador "Gestão/Aluno" em `LmsCatalogo` (só `GESTOR` tem), então `useMinhasMatriculas` nunca carrega nessa tela; o card `CardMeusEAD` do painel usa `/minhas-ead` e continua mostrando.
3. Funcionário com `status` ≠ ATIVO ou `ativo=0`.
- **Verificação em produção: BLOQUEADA** (sem credencial D1 nesta sessão; Wrangler direto é vedado). Consulta somente-leitura sugerida para o dono do caso:
```sql
-- Matrículas ativas cujo funcionário não tem usuário vinculado e ativo (invisíveis ao aluno)
SELECT m.empresa_id, COUNT(*) AS matriculas
  FROM lms_matriculas m
  JOIN funcionarios f ON f.id = m.funcionario_id AND f.empresa_id = m.empresa_id
 WHERE m.deleted_at IS NULL AND m.status IN ('NAO_INICIADO','EM_ANDAMENTO')
   AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.funcionario_id = f.id AND u.deleted_at IS NULL)
 GROUP BY m.empresa_id;
```
- **Recomendação (não implementada):** para admin/manager **com** cadastro de funcionário mas sem `usuarios.funcionario_id`, devolver um aviso explícito em vez de lista vazia.

---

## D. Cálculos auditados

Fórmula única, encontrada em 4 pontos do código (`snapshot-builder`, `snapshots.ts`, `compliance-treinamentos.ts:147,1290,1339`): **`compliance_pct = round(conformes / requisitos_obrigatórios × 1000) / 10`**, razão de somas (ponderada por requisito, não média de percentuais), `VENCENDO` conta como conforme, `NAO_APLICA` e `RECOMENDADA` ficam fora, denominador zero → `null`.

| Dataset | Esperado (à mão) | Observado | Conclusão |
|---|---|---|---|
| Empresa: P1 3/4, P2 2/2, P3 1/3, P4 0 requisitos | 6/9 = **66,7%** | 66,7% | OK; P4 não entra no denominador |
| Setor 10 / 11 | 5/6 = 83,3% / 1/3 = 33,3% | idem | OK |
| Função 1 / 2 | 4/7 = 57,1% / 2/2 = 100% | idem | OK |
| Célula só com pessoa sem requisitos | `null` | `null` | OK (nunca vira 0% nem 100%) |
| Soma de setores = soma de funções = empresa (4 métricas) | igualdade | igual | OK, sem dupla contagem |
| Validade 2027-02-28 +12 m / +24 m | 2028-02-28 / 2029-02-28 | idem | OK |
| LMS +12 m: 2025-06-14 em 2026-06-15 | VENCIDO (`-1`) | VENCIDO | OK |
| Vencimento 22:30 BRT | ver D1 | corrigido | OK após correção |

Divergências no cálculo de validade em fim de mês: `setUTCMonth` transborda (31/ago + 6 m → 3/mar), igual ao util canônico no modo "dia exato" e ao `date(x,'+N months')` do SQLite; **consistente entre motores**, portanto não tratei como defeito. O modo `vencimento_fim_mes` de Qualificações só vale quando há `data_vencimento` na evidência (o Histórico gerado na conclusão vence o desempate de data igual).

Não conferido: ponderação/relatórios exportados (PDF/CSV) — **NOT RUN**.

---

## E. Integrações

| Integração | Estado comprovado |
|---|---|
| Compliance ↔ LMS | Evidência LMS só conta com `CONCLUIDO` + data não futura + modalidade/perfil compatíveis; `EM_ANDAMENTO` → EM_ANDAMENTO, `NAO_INICIADO/REPROVADO/CANCELADO` nunca viram conforme (T-ST). Fluxo "conclusão → pendência some → % recalculado" coberto pelo teste pré-existente `compliance-treinamentos.sqlite.test.ts:1575`. Ciclo SCORM real: **BLOQUEADO** (staging). |
| Compliance ↔ Qualificações | Mesmo cálculo de status/janela após D1; evidência de Histórico prevalece; `CANCELADA` e `planejada` excluídas. D5 residual. |
| Compliance ↔ Certificados | **ANALISADO apenas** (geração na conclusão em `completeLmsMatricula`); certificado não testado por execução. |
| Compliance ↔ Funcionários/Setores | Escopo `all`/`restricted`/`self` lido e exercitado por testes pré-existentes (gestor limitado a setores; aluno `self`); precedência de regras por escopo provada (T-PAR). |
| Cron de snapshot/notificações | Executado pelos testes `cron/*` (verdes); data BRT após D1. |

---

## F. Entrega técnica

- **Branch:** `audit/compliance-integral-20261102` a partir de `6142be5a9`.
- **Arquivos de produção alterados (4):** `services/training-compliance-snapshot-builder.ts`, `services/training-compliance-snapshots.ts`, `cron/training-compliance-notifications.ts`, `repositories/lms-matricula-queries.ts`.
- **Testes novos (4 arquivos, 51 testes):** `compliance-audit-oracle`, `compliance-mount-rbac`, `lms-learner-visibility.sqlite`, `rule-engine-ts-sql-parity.sqlite`.
- **Verificações locais:** `tsc --noEmit` do Worker limpo; `guard:layer-boundaries`, `guard:empresa-default1`, `guard:typescript-delta` PASS; compliance+LMS+cron focados 100% verdes; frontend compliance/LMS 188/188; Worker completo no código final: ver PR.
- **Oito gates oficiais:** executados pela CI na PR (não substituídos por execução local).
- **Staging:** **não executado.** Mudança de risco **médio** (regra de negócio/API sem schema, sem escrita de dados): D1 e D2 não alteram dados nem contratos HTTP além de remover cancelada de `/minhas`. Validação em staging recomendada antes de publicar: ver 1 requisito vencendo hoje após 21h BRT e `/minhas` de aluno com matrícula cancelada.
- **Produção:** nada publicado; publicação exige autorização para SHA/artefato/escopo exatos (Worker-only).
- **Riscos residuais:** D3, D4 (decisão de produto), D5 (alto risco), D6, D7, D8 (sem dado de produção); todo o conjunto E2E/staging/performance/rede abaixo.

### Não executado (NOT RUN / BLOCKED)
Playwright em staging (`e2e/frontend-pr-ui-qa/training-compliance*.spec.ts`, `e2e/production-training-compliance`) — exige credenciais de sessão; ciclo SCORM real (abrir, retomar, `suspend_data`, `Commit`/`Finish`) — staging; layouts tablet/celular; falhas de rede/401/5xx/timeouts no navegador; carga e N+1 (`compliance.ts` usa 5 consultas fixas por requisição, sem N+1 por inspeção, mas não medi tempo); concorrência/idempotência de matrícula automática além dos testes pré-existentes; exportações; e-mails de aviso; mudança de cargo/setor ponta a ponta além da precedência de regras.

---

## G. Nota de confiabilidade operacional comprovada: **6,5 / 10**

| Critério | Peso observado |
|---|---|
| Correção funcional do motor de status e agregados | **Alta** — oráculo independente, 27 casos, 1 defeito real achado e corrigido |
| Consistência entre motores | **Média-alta** — paridade TS×SQL provada em 8 sementes; 1 divergência de regra aberta (D4) |
| Segurança e tenant | **Média-alta** — 45 guards mapeados, escopo `empresa_id` em todas as consultas lidas, RBAC fail-closed; sem vazamento encontrado; D3 é restrição indevida, não brecha |
| Integridade de dados | **Média** — provada só em SQLite sintético; D1/R2 remotos e dados reais não verificados |
| Integração LMS→Compliance | **Média** — lógica provada, ciclo real em navegador/SCORM não executado |
| Desempenho e resiliência | **Baixa** — sem medição |
| Cobertura de testes | **Alta no backend** (7127 + 51 novos), **baixa em E2E executado** |

A nota sobe com: E2E de staging do ciclo treinamento→conclusão→conformidade, a consulta de D8 em produção, a decisão sobre D3/D4/D6 e a correção de D5 com staging.
