# AirTrust — Opus Strategic Product & Engineering Roadmap

- **Data:** 2026-06-02
- **Repositório:** `/Users/filipedaumas/SAAS/Airtrust`
- **Branch:** `main`
- **HEAD auditado:** `5777d775876c7088907c039d0306dfd7bc0b2f9d` (== `origin/main`, 0 ahead / 0 behind)
- **Working tree:** sem alterações *tracked*; apenas *untracked* (`docs/`, `knowledge/`, `scripts/seed-*.sql`, `scripts/validation/audit-endpoint-matrix.mjs`).
- **Modo:** read-only. Nenhum código alterado, nenhum commit/push/deploy/migration, nenhum DB remoto tocado.
- **Método:** consolida e revalida as 3 auditorias Opus anteriores (geral 06-01, reauditoria v2 06-02, arquitetura 06-02) contra o **código atual**. O HEAD avançou 4 commits desde a reauditoria v2 (`e6d773e`), resolvendo achados que aquele relatório ainda listava como abertos. Cada item foi reverificado no código antes de classificar.

> **Aviso de método:** `CONFIRMADO` = verificado no código/teste nesta passada. `RESIDUAL` = mitigado no caminho principal, resta vetor secundário. Distingo "dívida aceitável" (não vira incidente) de "dívida-incidente" (pode causar dado errado / vazamento / outage).

---

## 0. O que mudou desde a reauditoria v2 (`e6d773e` → `5777d77`)

Quatro commits posteriores resolveram pendências que a v2 ainda listava:

| Commit | Efeito | Achado fechado |
|---|---|---|
| `ebddff5` fix(escalas): enforce tenant scope on allocations | Reforça tenant-scope em alocações | Geral #3 / v2 #3 (já mitigado; consolidado) |
| `5fa8107` fix: scope admin backfill by tenant | `backfill-session-checks` agora recebe `tenantScope.empresaId` (`admin.ts:678`) | **v2 N3 — RESOLVIDO** |
| `01f0902` refactor(worker): remove runtime ddl from hot paths | Remove `ensure*Schema` classe A de 8 hot paths; adiciona teste de arquitetura `no-runtime-ddl-hot-paths` | **Arch #1 — parcialmente executado (classe A pronta)** |
| `5777d77` refactor(worker): remove temporary production fix endpoint | Remove `POST /api/fix/populate-qualificacao-ids` (confirmado: 0 ocorrências hoje) | **Arch #4 — endpoint de fix removido** |

Também confirmado nesta passada como **resolvido**: o footgun `--commit-dirty=true` (v2 N1) não existe mais em `package.json`/`scripts` (única ocorrência é o próprio guard que o proíbe).

---

## 1. Diagnóstico executivo

**O AirTrust pode retomar features?** **SIM — parcial e condicionado por módulo.**
Não há P0 nem P1 de código ativo. Os achados críticos das auditorias anteriores (reset admin cross-tenant, FRMS fail-open, tenant-scope de alocações, simulador→qualificação, integridade de dashboard, DDL em hot path classe A, endpoint de fix temporário) estão **mitigados E cobertos por testes**. Gates verdes: `tsc` exit 0, `build` exit 0, frontend 478 passed / 3 skipped, worker **605 passed**, preflight OK, smoke público OK, `ops:guard` PASS.

**Em quais módulos pode retomar com baixo risco?** Qualificações, Simuladores, Dashboard executivo, Escalas/EVD (leitura e fluxos já cobertos), Funcionários — todos com tenant-scope endurecido e boa cobertura.

**Com quais restrições?**
1. Reservar **20–30% de capacidade fixa** para refatoração gradual (a dívida estrutural encarece cada feature nova).
2. **FRMS é o módulo a vigiar** — maior superfície e densidade de SQL inline; evoluir apenas com testes acompanhando.
3. **Não tocar** nos 3 caminhos de DDL runtime classe B/C (`sigvoos-frms`, `treinamentos-planejados-integration`, `documentos`) sem antes criar as migrations correspondentes.
4. Fechar a **validação funcional autenticada** (smoke com credencial) antes de declarar qualquer fluxo crítico "validado em produção".

**O que ainda pode virar incidente (dívida-incidente, não dívida aceitável)?**
- **Isolamento por convenção** em `escala_alocacoes` (sem `empresa_id` próprio nem `UNIQUE` parcial): hoje seguro por JOIN testado, mas **uma query futura que esqueça o JOIN vaza/cruza tenant** ou permite duplo-agendamento. É o maior risco estrutural latente.
- **DDL runtime residual** em `sigvoos-frms` / `treinamentos-planejados-integration` / `documentos`: se a tabela base não existir num ambiente, o serviço cria schema fora das migrations (drift) — ou, se removido sem migration, quebra writes.
- **Ausência de enum central de status** (CONCLUIDA ×120, CONCLUIDO ×125, PENDENTE ×90…): um filtro com a grafia/gênero errado produz **contagem silenciosamente incorreta** em métricas executivas.
- **Scripts soltos com `wrangler d1 execute --remote` + `DROP TABLE`** fora do wrapper: footgun manual de produção (não exploável remotamente, mas erro humano destrutivo).

**Dívida aceitável (não vira incidente):** arquivos gigantes, 2302 `.prepare()` sem repositório, PDF duplicado, ~378 `console.log`, ~25 tabelas `_v2/_v3/_bak/_temp`, sprawl de 400+ scripts. Encarecem manutenção, mas não produzem dado errado por si só.

---

## 2. Matriz de prioridade

| Prio | Ação | Módulo | Tipo | Impacto | Risco | Esforço | Fazer agora? |
|---|---|---|---|---|---|---|---|
| 1 | Migrations para `solicitacoes_treinamento` (link cols) e tabelas base `integracoes_sigvoos_*`, então remover `ensure*` classe B/C | treinamentos, sigvoos | migration | Alto (fecha drift de schema) | Médio | M | Planejar agora, aplicar c/ autorização |
| 2 | Padronizar resposta de erro: parar de vazar `error.message` em `details` (~31 sites) | global worker | refatoração | Médio (segurança/UX) | Baixo | P | **Sim** |
| 3 | Módulo central de status (worker+frontend) e converter primeiro os caminhos de contagem/métrica | status/dashboard | refatoração | Alto (evita contagem errada) | Baixo | M | **Sim (iniciar)** |
| 4 | Testes de contrato + tenant-scope para `hospedagem` (0 testes) | hospedagem | teste | Médio | Baixo | P | **Sim** |
| 5 | Rodar smoke autenticado uma vez com credencial read-only e documentar | operação | operação | Médio (fecha pendência) | Baixo | P | **Sim** |
| 6 | Migration de defesa em profundidade: `escala_alocacoes.empresa_id` + `UNIQUE(...) WHERE deleted_at IS NULL` | escalas | migration | Alto (estrutural) | Médio | M | Planejar 30d, aplicar c/ autorização |
| 7 | Mover scripts destrutivos `--remote`/`DROP TABLE` para wrapper ou `scripts/legacy/` | deploy/scripts | operação | Médio | Baixo | M | 30d |
| 8 | Camada de repositório por domínio (começar qualificações + escalas) | global worker | refatoração | Alto (longo prazo) | Médio | G | 90d |
| 9 | Quebrar Top-10 arquivos gigantes (`Qualificacoes.tsx` 4855, `frms.ts` 3643…) | múltiplos | refatoração | Médio | Médio | G | 90d |
| 10 | Plano de descomissionamento de ~25 tabelas `_v2/_v3/_bak/_temp` | schema | migration | Baixo | Médio | G | 90d, c/ autorização |
| 11 | Elevar cobertura de `sgso-next-gen`, `lms-cursos`, `evd` | sgso/lms/evd | teste | Médio | Baixo | M | 30–90d |
| 12 | Consolidar geração de PDF (3 services worker + 2 chunks vendor) | PDF | refatoração | Baixo (bundle) | Baixo | M | 90d |

---

## 3. Plano 7 dias (máx. 5 ações, pequenas e verificáveis)

1. **Padronizar resposta de erro** — substituir `details: error.message` por mensagem genérica + log server-side nos ~31 sites. *Verificável:* grep zera; teste de contrato confirma payload de erro sem `details` interno; `test:worker` verde.
2. **Iniciar módulo central de status** — criar `worker-airtrust/src/constants/status.ts` (+ contrato espelhado no frontend) com os enums por domínio e **converter primeiro os caminhos de contagem/métrica do dashboard**. *Verificável:* métricas batem com fixtures; teste de contrato status frontend↔worker.
3. **Cobrir `hospedagem` com testes** (contrato + tenant-scope) — `hospedagem.ts` tem 0 testes hoje. *Verificável:* novo arquivo de teste; cross-tenant → 404.
4. **Rodar smoke autenticado uma vez** com credencial read-only de service-account e documentar resultado em `docs/`. *Verificável:* log do smoke anexado; FRMS fail-safe retorna 400/422.
5. **Inventariar e mover scripts destrutivos soltos** (`--remote` + `DROP TABLE`) para `scripts/legacy/` ou atrás de `run-production-db-script.sh`. *Verificável:* lista de scripts soltos zera; `ops:guard` continua PASS.

> Todas as 5 são baixo risco, não exigem migration e não tocam DB real (exceto o smoke read-only autenticado).

---

## 4. Plano 30 dias (estrutural moderado)

- **Migrations classe B/C + remoção de `ensure*`:** criar migration para `solicitacoes_treinamento.treinamento_planejado_id` / `status_pre_agendamento` / índice; criar migration explícita para `integracoes_sigvoos_config|eventos|mapeamentos`; então remover `ensureSolicitacoesTreinamentoLinkSchema` e `ensureSigvoosTables`. (aplicação **requer autorização** explícita).
- **Concluir módulo de status** e converter incrementalmente os demais usos de magic string (priorizando filtros de métrica/compliance).
- **Elevar cobertura de `sgso-next-gen`** (caminho crítico de KPI/auditoria) e `lms-cursos/lms-matriculas`.
- **Estender testes de contrato de dashboard** às métricas que ainda não têm (compliance score, demanda).
- **Consolidar PDF** em um único gerador (existe `consolidate-pdf-generator.sh` inacabado).

---

## 5. Plano 90 dias (refatoração de fundo / migrations / arquitetura)

- **Camada de repositório por domínio** — extrair SQL de rotas começando por **qualificações** e **escalas** (reduz acoplamento regra↔persistência; hoje 2302 `.prepare()` cruas).
- **Quebrar os 10 arquivos gigantes** (Top-10), priorizando `Qualificacoes.tsx` (4855) e `frms.ts` (3643).
- **Migration de defesa em profundidade** `escala_alocacoes.empresa_id` denormalizado + `UNIQUE` parcial (após autorização).
- **Canonicalizar `documentos`** em migration única e aposentar `auto-migration-documentos.ts` / `api-bootstrap`.
- **Descomissionar** as ~25 tabelas `_v2/_v3/_bak/_temp` (verificar uso → migration de DROP autorizada).
- **Consolidar montagem de rotas** (eliminar dependência da "ORDEM CRÍTICA" em `index.ts:508` e do prefixo `/api` compartilhado).

---

## 6. Features liberadas (baixo risco — pode retomar)

- **Qualificações** — tenant-scope via histórico testado; vencimentos cobertos.
- **Simuladores** — transição sessão→qualificação corrigida e coberta (6 casos).
- **Dashboard executivo** — métricas com tenant + exclusão de deletados/cancelados, testadas.
- **Escalas / EVD** — alocações tenant-scoped e testadas (regressão `escala_id` fechada).
- **Funcionários / Empresas** — base estável.
- **FRMS (incremental, vigiado)** — pode evoluir **com testes acompanhando cada mudança**; é o módulo de maior superfície.

---

## 7. Features bloqueadas ou condicionadas (não fazer sem preparação)

- **Qualquer feature nova sobre SIGVOOS / integração FRMS** que dependa das tabelas `integracoes_sigvoos_*` — **condicionada** à migration explícita dessas tabelas (hoje criadas via DDL runtime classe C). Bloqueio até migration.
- **Feature nova sobre treinamentos planejados** que use o link `solicitacoes_treinamento.treinamento_planejado_id` — **condicionada** à migration das colunas/índice de link.
- **Novas queries em `escala_alocacoes`** sem JOIN explícito com `escalas_mensais` — **proibido** até existir `empresa_id` denormalizado; risco de vazamento/duplo-agendamento.
- **Qualquer fluxo destrutivo de manutenção em produção** fora do wrapper `run-production-db-script.sh` — bloqueado.
- **Hardening de `documentos`** (mexer no bootstrap) — condicionado à migration canônica.

---

## 8. Top 10 riscos remanescentes

Classificação: **R1 = alto**, **R2 = médio**, **R3 = baixo**.

| ID | Risco | Classe | Por que | Mitigação |
|---|---|---|---|---|
| 1 | `escala_alocacoes` sem `empresa_id`/`UNIQUE` parcial — isolamento por convenção | **R1** | 1 query futura sem JOIN vaza tenant ou duplica alocação | Migration de denormalização + UNIQUE (Plano 90d) |
| 2 | DDL runtime residual em `sigvoos-frms` / `treinamentos-planejados-integration` / `documentos` | **R1** | Schema fora das migrations → drift; remoção sem migration quebra writes | Migrations classe B/C (Plano 30d) |
| 3 | Sem enum central de status (magic strings ×400+) | **R1** | Filtro errado → métrica executiva silenciosamente incorreta | Módulo de status (Plano 7–30d) |
| 4 | Scripts soltos `--remote` + `DROP TABLE` fora do wrapper | **R2** | Footgun manual destrutivo de produção | Mover p/ wrapper/legacy (Plano 7–30d) |
| 5 | `error.message` vazado em `details` (~31 sites) | **R2** | Exposição de detalhe interno ao cliente | Padronizar resposta de erro (Plano 7d) |
| 6 | `hospedagem` com 0 testes; `sgso/lms/evd` cobertura leve | **R2** | Regressão invisível em módulo sem rede | Testes de contrato (Plano 7–30d) |
| 7 | Smoke autenticado funcional pendente por credencial | **R2** | Sem validação ponta-a-ponta autenticada em produção | Rodar 1× com token read-only (Plano 7d) |
| 8 | Ausência de camada de repositório (2302 `.prepare()`) | **R2** | Encarece e arrisca cada evolução; regra+SQL+HTTP acoplados | Repositório incremental (Plano 90d) |
| 9 | Arquivos gigantes (`Qualificacoes.tsx` 4855, `frms.ts` 3643…) | **R3** | Difícil revisar/testar; merge conflicts | Quebra por seção (Plano 90d) |
| 10 | ~25 tabelas `_v2/_v3/_bak/_temp` + sprawl de 400+ scripts | **R3** | Confusão sobre fonte da verdade; clutter | Descomissionamento autorizado (Plano 90d) |

---

## 9. Próximo prompt operacional recomendado (para Codex)

Executa a **ação #1 do Plano 7 dias** (padronizar resposta de erro), com o padrão completo diagnosticar → corrigir → testar → commitar → pushar.

```text
Prompt — Codex: padronizar resposta de erro do worker (parar de vazar error.message)

Repositório: /Users/filipedaumas/SAAS/Airtrust  | Branch: main
Objetivo: remover o vazamento de detalhe interno em respostas de erro do worker,
onde handlers retornam `details: error.message` (ou equivalente) ao cliente.
Manter o log server-side completo; expor ao cliente apenas mensagem genérica.

Restrições:
- NÃO executar migration, NÃO tocar DB remoto, NÃO rodar wrangler d1 --remote.
- NÃO alterar formatos de resposta de SUCESSO (manter {success:true,data}).
- Mudança apenas no caminho de ERRO.

1) DIAGNOSTICAR
   - Listar todos os sites:
     grep -RIn "details:.*error" worker-airtrust/src --include="*.ts" | grep -v __tests__
   - Confirmar o contrato de erro atual ({success:false,error,details?}) lendo index.ts
     (handler de erro central) e 3-4 rotas representativas.

2) CORRIGIR
   - Introduzir/usar um helper central de erro (ex.: respondError(c, status, publicMsg))
     que: (a) loga o erro real com console.error server-side, incluindo stack;
     (b) retorna ao cliente { success:false, error:<mensagem genérica do domínio> }
     SEM o campo `details` com error.message interno.
   - Substituir os ~31 sites para usar o helper. Não inventar mensagens novas
     onde já existe uma mensagem de domínio adequada; só remover o `details` interno.

3) TESTAR
   - Adicionar/ajustar teste de contrato: para um handler que falha internamente,
     a resposta NÃO deve conter `details` com a mensagem do Error, mas o log deve registrar.
   - Rodar: npx tsc --noEmit && npm run build && npm run test:worker && npm run test:run
   - Confirmar: grep "details:.*error.message" worker-airtrust/src --include="*.ts" (grep -v __tests__) = 0

4) COMMITAR
   - git add nos arquivos alterados (sem -A).
   - Mensagem:
     fix(worker): stop leaking internal error.message in responses
     Co-Authored-By: ...

5) PUSHAR / DEPLOY
   - Só pushar após todos os gates verdes e árvore limpa coerente com origin/main.
   - NÃO deployar nesta tarefa (somente código + testes). Deploy/migration ficam para etapa autorizada à parte.

6) SMOKE
   - AIRTRUST_PUBLIC_ONLY=YES bash scripts/smoke-authenticated-operational.sh
   - Reportar: sites alterados, gates, e confirmação de que nenhum formato de sucesso mudou.
```

---

## Entrega — respostas diretas

1. **Branch/HEAD auditados:** `main` @ `5777d77` (== `origin/main`, 0/0).
2. **Validações executadas:** `tsc --noEmit` exit 0; `npm run build` OK (~11s); `npm run test:run` 478 passed / 3 skipped; `npm run test:worker` **605 passed**; `preflight-clean-deploy.sh` OK; `ops:guard` PASS; smoke `AIRTRUST_PUBLIC_ONLY=YES` OK (version+health 200). Nenhuma falha registrada.
3. **Arquivo criado:** `docs/AIRTRUST_OPUS_STRATEGIC_ROADMAP_20260602.md` (untracked, não commitado).
4. **Decisão — pode retomar features?** **PARCIAL/SIM**, sem P0/P1 ativo, reservando ~20–30% para refatoração e respeitando os bloqueios da §7.
5. **Top 5 ações 7 dias:** (1) padronizar resposta de erro; (2) iniciar módulo central de status nas métricas; (3) testes para `hospedagem`; (4) rodar smoke autenticado 1× com credencial; (5) inventariar/mover scripts destrutivos soltos.
6. **Top 5 riscos remanescentes:** R1 — `escala_alocacoes` sem `empresa_id`/UNIQUE; R1 — DDL runtime residual sigvoos/treinamentos/documentos; R1 — sem enum central de status (contagem errada); R2 — scripts soltos `--remote`/`DROP TABLE`; R2 — `error.message` vazado em `details`.
7. **Próximo prompt operacional:** §9 (padronizar resposta de erro do worker).

### Confirmação final
- ✅ Nenhum código alterado
- ✅ Nenhum commit
- ✅ Nenhum push
- ✅ Nenhum deploy
- ✅ Nenhuma migration executada
- ✅ Nenhum DB remoto tocado (apenas smoke público read-only: `GET /api/version`, `GET /api/health`)
- Único artefato criado: este relatório markdown **untracked** em `docs/`.
