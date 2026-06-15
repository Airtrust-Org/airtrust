# AirTrust — Sanitização Fase 4: Revisão dos Docs Arquiteturais

> **Data:** 2026-06-14
> **Branch:** `main` | **HEAD:** `0003ffb0392665633f421c3831200438f5aa199d`
> **Divergência origin/main:** 0 ahead ← 32 behind (repo local 32 commits atrás do remote)
> **Executor:** Claude Code (Fase 4 — leitura e edição localizada)

---

## Veredito

### `FASE 4 COM RESSALVAS`

Todos os riscos **críticos e altos** foram removidos ou generalizados nos docs
arquiteturais. Riscos remanescentes são de classificação **baixa ou média** e
não bloqueiam commit seletivo do grupo de baixo risco. A divergência de 32 commits
com `origin/main` deve ser investigada antes de qualquer push.

---

## 1. Inventário Inicial

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `0003ffb0` |
| Alterações tracked | 8 arquivos modificados (M) |
| Docs arquiteturais novos (untracked) | 11 arquivos `??` |
| Outros untracked | lms/, públicos .png/.ico, testes, services, docs SIGVOOS |
| git diff --check | PASS (sem whitespace issues) |
| guard:tracked-secrets | PASS |
| ops:guard | PASS (1 warning em sync scripts — pré-existente, não desta fase) |
| audit-deploy-scripts | PASS |
| tsc --noEmit | PASS (sem output = sem erros novos) |

---

## 2. Docs Revisados e Alterados

### 2.1 DATABASE_SCHEMA.md — Risco original: CRÍTICO → pós-sanitização: BAIXO

**Problema:** Tabela de ambientes continha UUIDs parciais reais dos bancos D1:
`7c8a788e-...` (produção), `b7f50907-...` (staging), `a72fb05b-...` (dev).

**Ação:** Removida a coluna `Database ID` da tabela. Substituída por nota interna
indicando que IDs são gerenciados via `wrangler.toml` e Cloudflare dashboard.

**Risco removido:** Enumeração de recursos Cloudflare D1 por ID parcial.

---

### 2.2 DEPLOYMENT_AND_DEVOPS.md — Risco original: CRÍTICO → pós-sanitização: BAIXO

**Problemas encontrados:**
1. Seção 5.2 continha os gate strings exatos de produção:
   `AIRTRUST_ALLOW_PROD_MIGRATIONS_APPLY=YES` e o texto de confirmação completo.
2. Seção 6.1 continha o comando `wrangler d1 migrations apply airtrust-db --env production --remote`
   com os gate strings como receita executável.
3. Seção 6.2 continha `wrangler d1 execute airtrust-db --env production --remote` como "comando manual".
4. Diagrama Mermaid (seção 5.1) expunha nome de variável de gate.

**Ação:**
- Gate strings substituídos por descrição conceitual ("dupla confirmação via variáveis com valores exatos").
- Seções 6.1 e 6.2 convertidas de receita executável para descrição de processo.
- Adicionado cabeçalho `[DOCUMENTO INTERNO]` com aviso explícito de não-executabilidade.
- Diagrama generalizado.

**Risco removido:** Recipe para disparar migrations em produção sem passar pelo script de gate.

---

### 2.3 SECURITY.md — Risco original: CRÍTICO → pós-sanitização: MÉDIO

**Problemas encontrados:**
1. Seção 17 listava vulnerabilidades conhecidas com severidade e vetores concretos:
   - Rotas de manutenção sem auth (com severidade "MÉDIA" e descrição de impacto)
   - Vite proxy para produção (com severidade "CRÍTICO" e descrição de exploit)
   - RBAC over-provisioning (instrutor = manager, com nível exato)
2. Seção 6.1 expunha a allowlist CORS completa (URLs internas incluídas).
3. Seção 10.1 listava cada secret com descrição de impacto de comprometimento.
4. Sem nota de escopo restrito.

**Ação:**
- Seção 17 substituída por aviso de que vulnerabilidades são rastreadas no registro
  interno de segurança, não neste documento.
- Seção 6.1 substituída por descrição conceitual (sem allowlist detalhada).
- Seção 10.1 substituída por instrução de processo sem tabela de impacto.
- Adicionado cabeçalho `[DOCUMENTO INTERNO RESTRITO]`.

**Risco remanescente (MÉDIO):** O checklist de apêndice ainda menciona itens
pendentes com `⚠️`. É aceitável como indicador de status, mas itens podem ser
removidos se o documento for compartilhado externamente.

---

### 2.4 AUTH_RBAC_MULTITENANCY.md — Risco original: ALTO → pós-sanitização: BAIXO

**Problemas encontrados:**
1. Seção 9 listava paths exatos das rotas de manutenção sem auth JWT:
   `/api/integracoes/sigvoos/maintenance/sincronizar-frms`,
   `/api/frms/maintenance/reprocessar-lote`, `/api/frms/maintenance/reprocessar-faixa`.
   Com nota explícita: "protegidas apenas por MAINTENANCE_SECRET".
2. Seção 13 listava cada secret com descrição de comprometimento.
3. Sem nota de escopo restrito.

**Ação:**
- Paths específicos de manutenção substituídos por referência genérica ao prefixo `/maintenance/`.
- Nota de impacto de secrets substituída por instrução de processo.
- Adicionado cabeçalho `[DOCUMENTO INTERNO]`.

**Risco removido:** Enumeração de endpoints de manutenção sem auth para ataque direcionado.

---

### 2.5 ARCHITECTURE_OVERVIEW.md — Risco original: MÉDIO → pós-sanitização: BAIXO

**Problema:** Seção 10 (Bindings Cloudflare) listava todos os nomes de secrets
em tabela com uso detalhado (`JWT_SECRET`, `BREVO_API_KEY`, `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, `MAINTENANCE_SECRET`, `CF_BROWSER_API_TOKEN`).

**Ação:** Tabela de secrets substituída por descrição de categoria (autenticação,
email, WhatsApp, PDF, manutenção) sem enumerar nomes individuais. Nota interna
adicionada.

**Risco remanescente (BAIXO):** O documento ainda lista nomes de produtos integrados
(Brevo, Twilio) e o modelo de AI usado (`@cf/meta/llama-3.1-8b-instruct`). Esses
são detalhes de stack — não há necessidade de remover.

---

### 2.6 INTEGRATIONS.md — Risco original: MÉDIO → pós-sanitização: BAIXO

**Problema:** Apêndice listava nomes e placeholders de variáveis de ambiente de
todas as integrações: `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (com número real `+5511999999999`),
`TWILIO_MESSAGING_SERVICE_SID`, `CF_ACCOUNT_ID`, `CF_BROWSER_API_TOKEN`,
`EDAPP_API_TOKEN`, `EDAPP_WEBHOOK_SECRET`.

**Ação:** Apêndice substituído por nota interna referenciando `wrangler.toml` e
`wrangler secret put`. Número de telefone WhatsApp removido.

**Risco removido:** Enumeração de nomes de secrets e dados de configuração (número de telefone).

---

### 2.7 FRMS_ARCHITECTURE.md — Risco original: MÉDIO → pós-sanitização: BAIXO

**Problema:** Seção 1 afirmava conformidade normativa com RBAC-117 (ANAC) e
ICAO Doc 9966 sem ressalvas, criando possível exposição legal.

**Ação:** Texto alterado de "em conformidade com" para "utiliza como referência
normativa". Adicionado aviso explícito de que conformidade regulatória efetiva
requer validação por autoridade competente.

---

### 2.8 API_REFERENCE.md — Risco original: MÉDIO → pós-sanitização: BAIXO

**Problema:** URL base incorreta `https://airtrust.workers.dev/api/v2` (legado
workers.dev, prefixo /v2 inexistente). Poderia confundir integradores ou indicar
endpoint não monitorado.

**Ação:** URL corrigida para `https://api.airtrust.online/api` com nota de revisão.
Substituição aplicada em todas as ocorrências (curl examples).

---

## 3. Docs Não Alterados

| Doc | Motivo |
|---|---|
| `FRONTEND_ARCHITECTURE.md` | Risco BAIXO — implementação frontend sem dados operacionais sensíveis |
| `LMS_ARCHITECTURE.md` | Risco BAIXO — detalhes de LMS sem informação sensível operacional |
| `MODULES_AND_FEATURES.md` | Risco MUITO BAIXO — catálogo de módulos sem detalhes operacionais |
| Docs SIGVOOS (`docs/AUDITORIA_*`, `docs/DECISOES_*`, `docs/PLANO_*`) | **Fora do escopo da Fase 4** — não alterados conforme regras |
| `docs/GOVERNANCE_EVIDENCE_RECORD_VERTICAL_SLICE.md` | Fora do escopo — não listado na Fase 4 |

---

## 4. Riscos Removidos Nesta Fase

| # | Risco | Arquivo | Severidade original |
|---|---|---|---|
| R1 | UUIDs parciais de bancos D1 de produção/staging/dev | DATABASE_SCHEMA.md | CRÍTICO |
| R2 | Gate strings exatos para migrations em produção | DEPLOYMENT_AND_DEVOPS.md | CRÍTICO |
| R3 | Comando `--remote --env production` como receita executável | DEPLOYMENT_AND_DEVOPS.md | CRÍTICO |
| R4 | Vetores de vulnerabilidades conhecidas documentados publicamente | SECURITY.md | CRÍTICO |
| R5 | CORS allowlist completa com padrões de domínio interno | SECURITY.md | ALTO |
| R6 | Tabela de impacto por secret comprometido | SECURITY.md | ALTO |
| R7 | Paths exatos de rotas de manutenção sem auth JWT | AUTH_RBAC_MULTITENANCY.md | ALTO |
| R8 | Tabela de impacto de secrets (duplicata em AUTH doc) | AUTH_RBAC_MULTITENANCY.md | ALTO |
| R9 | Nomes enumerados de todos os secrets | ARCHITECTURE_OVERVIEW.md | MÉDIO |
| R10 | Nomes e placeholders de variáveis de integração + número WhatsApp | INTEGRATIONS.md | MÉDIO |
| R11 | Afirmação de conformidade regulatória ANAC sem ressalva | FRMS_ARCHITECTURE.md | MÉDIO |
| R12 | URL legada incorreta (workers.dev) em API_REFERENCE | API_REFERENCE.md | BAIXO |

---

## 5. Riscos Remanescentes

| # | Risco | Arquivo | Severidade | Ação recomendada |
|---|---|---|---|---|
| RR1 | Checklist de apêndice em SECURITY.md ainda menciona itens pendentes com `⚠️` | SECURITY.md | BAIXO | Remover se o doc for publicado externamente |
| RR2 | ARCHITECTURE_OVERVIEW.md ainda expõe nomes de produtos (Brevo, Twilio, Llama 3.1) e estrutura de worker (126 rotas, 938 linhas) | ARCHITECTURE_OVERVIEW.md | BAIXO | Aceitável para doc interno |
| RR3 | AUTH_RBAC_MULTITENANCY.md ainda documenta hierarquia de roles com valores numéricos (100, 80, 60, 50, 20, 10) e mapeamento PT-BR↔RBAC | AUTH_RBAC_MULTITENANCY.md | BAIXO | Aceitável para doc interno — sem vetor de ataque direto |
| RR4 | FRMS_ARCHITECTURE.md ainda expõe lógica de score de fadiga (fórmula Python-like com pesos) | FRMS_ARCHITECTURE.md | BAIXO | Aceitável — não é dado operacional |
| RR5 | Divergência de 32 commits com origin/main — estado do remote desconhecido | git state | MÉDIO | Investigar antes de qualquer push |

---

## 6. Classificação Final por Doc

| Documento | Risco final | Grupo de commit |
|---|---|---|
| `MODULES_AND_FEATURES.md` | MUITO BAIXO | **Grupo A — commitável agora** |
| `FRONTEND_ARCHITECTURE.md` | BAIXO | **Grupo A — commitável agora** |
| `LMS_ARCHITECTURE.md` | BAIXO | **Grupo A — commitável agora** |
| `API_REFERENCE.md` | BAIXO (sanitizado) | **Grupo A — commitável agora** |
| `FRMS_ARCHITECTURE.md` | BAIXO (sanitizado) | **Grupo A — commitável agora** |
| `ARCHITECTURE_OVERVIEW.md` | BAIXO (sanitizado) | **Grupo B — commitável com revisão humana** |
| `AUTH_RBAC_MULTITENANCY.md` | BAIXO (sanitizado) | **Grupo B — commitável com revisão humana** |
| `DATABASE_SCHEMA.md` | BAIXO (sanitizado) | **Grupo B — commitável com revisão humana** |
| `INTEGRATIONS.md` | BAIXO (sanitizado) | **Grupo B — commitável com revisão humana** |
| `DEPLOYMENT_AND_DEVOPS.md` | BAIXO (sanitizado) | **Grupo B — commitável com revisão humana** |
| `SECURITY.md` | MÉDIO (sanitizado, doc restrito) | **Grupo C — revisão humana obrigatória antes de commit** |

---

## 7. Grupos de Commit Seletivo Recomendados

### Grupo A — Commitável agora (baixo risco, pouco ou nenhum conteúdo operacional)

```bash
# Sugestão de commit (NÃO EXECUTAR automaticamente — aguardar autorização)
git add MODULES_AND_FEATURES.md FRONTEND_ARCHITECTURE.md LMS_ARCHITECTURE.md \
        API_REFERENCE.md FRMS_ARCHITECTURE.md
git commit -m "docs: add and sanitize architectural docs (group A — low risk)"
```

### Grupo B — Commitável após revisão humana dos 5 docs

```bash
# Sugestão de commit (NÃO EXECUTAR automaticamente — aguardar autorização)
git add ARCHITECTURE_OVERVIEW.md AUTH_RBAC_MULTITENANCY.md DATABASE_SCHEMA.md \
        INTEGRATIONS.md DEPLOYMENT_AND_DEVOPS.md
git commit -m "docs: sanitize high-sensitivity architectural docs (group B)"
```

### Grupo C — Revisão obrigatória antes de commit

`SECURITY.md` deve ser revisado pelo responsável de segurança antes de ser
comprometido. Verificar se o checklist de apêndice deve ser mantido ou removido.

```bash
# Sugestão de commit APENAS após revisão (NÃO EXECUTAR agora)
git add SECURITY.md
git commit -m "docs: sanitize security model doc (group C — requires security review)"
```

---

## 8. Bloqueios Remanescentes Antes de Staging/Deploy

| # | Bloqueio | Severidade |
|---|---|---|
| B1 | Divergência de 32 commits com `origin/main` — resolver antes de push | ALTO |
| B2 | `SECURITY.md` requer revisão humana do responsável de segurança antes de commit | MÉDIO |
| B3 | Docs SIGVOOS (`AUDITORIA_*`, `DECISOES_*`, `PLANO_*`) ainda untracked — avaliar em fase própria | BAIXO |
| B4 | `docs/GOVERNANCE_EVIDENCE_RECORD_VERTICAL_SLICE.md` untracked — não avaliado nesta fase | BAIXO |
| B5 | Alterações tracked pré-existentes (8 arquivos M) não pertencem a esta fase — commit separado | BAIXO |

---

## 9. Confirmação de Não-Execução de Comandos Remotos

- ✅ Nenhum `wrangler` executado
- ✅ Nenhum acesso D1 remoto
- ✅ Nenhum acesso R2
- ✅ Nenhum push
- ✅ Nenhuma migration aplicada
- ✅ Nenhum deploy executado
- ✅ `git add .` e `git add -A` não usados
- ✅ Nenhum commit automático criado
- ✅ Nenhum arquivo de `/tmp` movido para o repo
- ✅ Docs SIGVOOS/FRMS/RBAC não alterados
- ✅ Código funcional não alterado

---

## 10. Recomendação Objetiva da Fase 5

**Fase 5 — Revisão e Commit Seletivo Controlado**

1. **Resolver divergência origin/main**: executar `git fetch origin && git log origin/main..HEAD`
   para entender os 32 commits do remote que não estão locais antes de qualquer push.

2. **Revisar Grupo B** (5 docs): um responsável técnico deve ler as versões sanitizadas
   de `ARCHITECTURE_OVERVIEW.md`, `AUTH_RBAC_MULTITENANCY.md`, `DATABASE_SCHEMA.md`,
   `INTEGRATIONS.md` e `DEPLOYMENT_AND_DEVOPS.md` e aprovar.

3. **Revisar SECURITY.md** (Grupo C): responsável de segurança deve aprovar o doc
   e decidir se o checklist de apêndice deve ser mantido.

4. **Commit seletivo** dos grupos A, B e C em commits separados (nesta ordem).

5. **Avaliar em fase própria**: docs SIGVOOS/Controle de Voos ainda untracked —
   planejar Fase 6 de revisão desses docs.

6. **Não criar 0411** nesta fase ou nas próximas sem autorização explícita.
