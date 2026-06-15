# Relatório: Fechamento Operacional da Manutenção

**Data:** 2026-06-15
**Branch:** `codex/manutencao-fechamento-operacional`
**PRs mergeados:** #33, #34
**Merge commit de referência:** `c93081c5`
**Veredito:** `MANUTENCAO COM PENDENCIAS CADASTRAIS`

---

## Resumo Executivo

A frente de Manutenção está estruturalmente completa após os PRs #33 e #34: acesso por setor
implantado, categorias criadas, copy neutra aplicada, fallback `funcao || cargo` ativo, e
perfil de home separado para funcionários de manutenção. As pendências remanescentes são
exclusivamente **cadastrais** (dados a preencher pelo administrador) e não exigem nenhuma
alteração de código, schema, migration ou RBAC.

---

## Estado Atual Após PRs #33 e #34

| Área | Estado |
|---|---|
| Filtro de setor em Funcionários (lista, dashboard, mutations) | ✅ IMPLANTADO (#33) |
| Fallback `funcao \|\| cargo` em todas as queries e dashboard | ✅ IMPLANTADO (#33, #34) |
| Filtro de setor em Qualificações / Histórico / Planejados / Modelos | ✅ IMPLANTADO |
| Categorias de Manutenção (IDs 15–20) em produção | ✅ APLICADO (2026-06-13) |
| 18 MNT_* tipos → setor 11 (Manutenção) backfill | ✅ APLICADO (2026-06-13) |
| Copy `participantes` em turmas/convocações (frontend + backend) | ✅ IMPLANTADO (#34) |
| Teste de contrato para a copy de participantes | ✅ ADICIONADO (#34) |
| Perfil de home `STUDENT_MANUTENCAO` separado de tripulação | ✅ IMPLANTADO |
| LMS sector filter em catálogo, admin, matrículas, relatórios | ✅ IMPLANTADO |
| Visibilidade por perfil em Configurações (admin vs gestor) | ✅ TESTADO |

---

## Pendências Cadastrais

### PC-01 — 19 funcionários de manutenção sem email e CPF

| Campo | Detalhe |
|---|---|
| IDs afetados | 106–124 |
| Setor | Manutenção (setor_id=11), empresa_id=6 |
| Status | ATIVO |
| email | NULL — impede convocações e login |
| cpf | NULL — impede login |

**Impacto:** Sem email, o fluxo de convocação retorna `409 CONVOCACAO_MISSING_EMAIL_CONFIRMATION_REQUIRED`.
Sem CPF, o funcionário não pode fazer login na plataforma.

**Risco:** Baixo. O sistema trata a ausência graciosamente. A tela de funcionários já mostra
e permite preencher esses campos.

**Ação recomendada:** Administrador preenche email e CPF via tela `/funcionarios` para cada
um dos 19 funcionários.

**Exige fase sensível?** Não. É operação administrativa na UI existente.

**Classificação:** `PENDÊNCIA CADASTRAL`

---

### PC-02 — Tipo `PROFICIENCIA/TECNICO` sem categoria mapeada

| Campo | Detalhe |
|---|---|
| tipo.categoria (texto) | `PROFICIENCIA/TECNICO` |
| categoria_id | NULL (JOIN por nome não encontra correspondente em qualificacoes_categorias) |
| cor | NULL |

**Impacto:** O modelo aparece sem badge de categoria colorida na aba Modelos.

**Risco:** Cosmético. O tipo existe, funciona e pode ser utilizado normalmente.

**Ação recomendada:** Se for relevante, criar categoria "Proficiência/Técnico" na tabela
`qualificacoes_categorias` e garantir que o texto do tipo seja atualizado para o mesmo nome,
ou normalizar o campo `categoria` do tipo existente para um valor que já exista (ex: "Outros").
Isso requer migration ou SQL direto — **exige fase sensível se feito em produção**.

**Classificação:** `PENDÊNCIA CADASTRAL` (cosmética) / `BLOQUEADO — REQUER FASE SENSÍVEL` se
quiser resolver com migration em produção.

---

### PC-03 — Nenhum curso LMS criado para o setor Manutenção

| Campo | Detalhe |
|---|---|
| Cursos existentes | 13, todos setor_id=10 (Tripulação) |
| Cursos Manutenção | 0 |
| Filtro de setor | Implementado e pronto |

**Impacto:** Gestores de Manutenção não encontram cursos no catálogo LMS.

**Risco:** Baixo. Nenhum gestor de manutenção esperando LMS. O filtro está implementado e
funcionará automaticamente assim que cursos forem cadastrados com `qualificacao_tipo_id`
apontando para um tipo com `setor_id=11`.

**Ação recomendada:** Administrador cria cursos LMS via tela admin e vincula a um tipo
de qualificação do setor Manutenção.

**Exige fase sensível?** Não. É operação administrativa na UI existente.

**Classificação:** `PENDÊNCIA CADASTRAL`

---

## Achados de Visibilidade por Perfil

| Perfil | Estado |
|---|---|
| Admin — vê todos os setores | ✅ OK |
| Gestor — vê apenas setores de `setores_gestores` | ✅ OK |
| Instrutor/Usuário/Aluno — auto-escopado | ✅ OK |
| Configurações — abas admin ocultas para gestor | ✅ TESTADO |
| HomePerfil — `STUDENT_MANUTENCAO` separado de tripulação | ✅ TESTADO |
| Rota `/mro` — protegida por `ProtectedRoute` | ✅ OK |

**Observação sobre MRO:** O módulo MRO (Manutenção de Aeronaves) está marcado como
`status: 'beta'` e usa `prototypeModuleGovernance`. Um banner "Módulo MRO em prévia" é
exibido em todas as telas. Dados demonstrativos, não registro oficial. Isso é **intencional**
e está fora do escopo de fechamento operacional desta fase.

---

## Achados de Testes

| Teste | Cobertura |
|---|---|
| `HomePerfil.cards.test.tsx` | Separação STUDENT_MANUTENCAO vs STUDENT_TRIPULACAO ✅ |
| `qualificacoes-sector-isolation.test.ts` | 19 funcionários de manutenção, filtro de setor ✅ |
| `maintenance-guards.test.ts` | Endpoints de manutenção FRMS/SIGVOOS com secret ✅ |
| `Configuracoes.visibility.test.tsx` | Abas admin ocultas para gestor ✅ |
| `TreinamentosPlanejadosPage.presenca-diaria.test.ts` | Contrato `participantes` ✅ |
| `qualificacoes-tipos-setores-scope.test.ts` | Escopo de tipos por setor ✅ |
| `employee-sector-access.test.ts` | Acesso por setor em funcionários ✅ |

**Lacunas de teste identificadas (não bloqueantes):**
- Sem teste unitário para resolução de `homeProfile` quando `funcao` e `cargo` são NULL e a
  classificação depende exclusivamente do texto do setor.
- Sem teste de integração para o fluxo de convocação com email NULL (comportamento documentado
  em memória, retorna 409 com `CONVOCACAO_MISSING_EMAIL_CONFIRMATION_REQUIRED`).

Ambas as lacunas são documentais; o comportamento está correto e já validado empiricamente.

---

## Riscos Restantes

| Risco | Severidade | Observação |
|---|---|---|
| 19 funcionários sem email — não recebem convocações | Médio | Ação administrativa, sem alteração de código |
| 1 tipo sem categoria mapeada | Baixo | Cosmético, uso operacional não bloqueado |
| 0 cursos LMS para Manutenção | Baixo | Conteúdo a criar pelo administrador |
| MRO em modo protótipo | Informativo | Intencional, banner explícito |
| `Deploy to GitHub Pages` falhando em todos os merges | Baixo | Erro pré-existente, não relacionado à manutenção |

---

## O Que Pode Ser Feito Sem Risco

- Preencher email e CPF dos 19 funcionários via UI (operação administrativa normal).
- Criar cursos LMS para Manutenção via tela admin (vinculando a tipos MNT_*).
- Normalizar o texto de categoria do tipo `PROFICIENCIA/TECNICO` para um valor existente
  (ex: "Outros") via tela de Modelos, se disponível na UI de edição.

---

## O Que Exige Fase Sensível

- Criar categoria `Proficiência/Técnico` em `qualificacoes_categorias` (migration ou SQL
  remoto em produção) → `BLOQUEADO — REQUER FASE SENSÍVEL`.
- Qualquer ajuste de RBAC backend real, multi-tenant, D1 remoto ou permissões de usuários
  reais → `BLOQUEADO — REQUER FASE SENSÍVEL`.
- Transformação do MRO de protótipo em módulo operacional (requer migration, backend
  completo, dados reais) → `BLOQUEADO — REQUER FASE SENSÍVEL`.

---

## Plano Macro Recomendado

| Prioridade | Ação | Responsável | Fase |
|---|---|---|---|
| 1 | Preencher email + CPF dos 19 funcionários (IDs 106–124) | Admin | Cadastral — sem código |
| 2 | Criar e vincular cursos LMS para Manutenção | Admin | Cadastral — sem código |
| 3 | Avaliar normalização do tipo PROFICIENCIA/TECNICO | Admin/Dev | Se via UI: sem fase sensível |
| 4 | Se categoria PROFICIENCIA for necessária: migration em produção | Dev | REQUER FASE SENSÍVEL |
| 5 | MRO operacional completo | Dev | REQUER FASE SENSÍVEL (novo sprint) |

---

## Testes Executados Nesta Fase

- `git diff --check` — sem conflitos de espaço/whitespace
- `bash scripts/check-tracked-secrets.sh` — OK
- `bash scripts/validation/audit-deploy-scripts.sh` — PASS
- `bash scripts/audit-dangerous-ops.sh` — PASS (1 aviso pré-existente em sync scripts, não bloqueante)
- `npx tsc --noEmit --pretty false` — sem erros

---

## Confirmações de Escopo

| Guardrail | Confirmado |
|---|---|
| SIGVOOS, importador, runner e `0411` intocados | ✅ |
| FRMS e `frms-source-policy.ts` intocados | ✅ |
| Sem deploy | ✅ |
| Sem migration | ✅ |
| Sem staging ou produção | ✅ |
| Sem D1 remoto, Cloudflare, R2 ou secrets | ✅ |
| Sem alteração de RBAC backend / multi-tenant / schema | ✅ |
| Sem commit de dados sensíveis ou reais | ✅ |

---

## Próxima Recomendação Macro

A frente de manutenção está **pronta para uso administrativo** no que depende de código.
O próximo passo é puramente operacional: preencher os dados cadastrais faltantes via UI.
Quando surgir necessidade de nova funcionalidade, migration ou ajuste de permissões reais,
iniciar com `BLOQUEADO — REQUER FASE SENSÍVEL` e recomendar novo sprint dedicado.
