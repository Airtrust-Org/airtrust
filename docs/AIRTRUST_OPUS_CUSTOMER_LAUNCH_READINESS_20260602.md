# AirTrust — Customer Launch Readiness Audit
## LGPD · Onboarding · Suporte · Qualidade de Dados · Módulos · Demo

---

**Data:** 2026-06-02  
**Repositório:** `/Users/filipedaumas/SAAS/Airtrust`  
**Branch / HEAD auditados:** `main` @ `5777d775876c7088907c039d0306dfd7bc0b2f9d` (== `origin/main`, 0 ahead / 0 behind)  
**Modo:** read-only. Nenhum código alterado, nenhum commit/push/deploy/migration, nenhum DB remoto tocado, nenhuma empresa/usuário criado.  
**Ferramenta:** Opus (via Claude Sonnet 4.6) — auditoria estratégica + técnica + operacional  
**Relatório anterior de referência:** `docs/AIRTRUST_OPUS_MULTI_COMPANY_RBAC_PRODUCT_READINESS_20260602.md`

> **Pergunta central:** *"O que falta para colocar a primeira empresa real no AirTrust com segurança, governança, suporte e boa experiência?"*

---

## PARTE A — Estado do repositório e validações read-only

### Resultado dos gates

| Gate | Resultado | Detalhe |
|---|---|---|
| Branch | `main` | HEAD == origin/main, 0 ahead / 0 behind |
| `git status` | Limpo (tracked) | 26 arquivos untracked em `docs/`, `knowledge/`, `scripts/seed-*.sql` |
| `scripts/preflight-clean-deploy.sh` | **PASS** | WARN: untracked não bloqueante |
| `npm run ops:guard` | **PASS** | Sem `--commit-dirty=true`, sem D1 remoto inseguro |
| `npx tsc --noEmit` | **PASS exit 0** | Sem erros de tipo |
| `npm run build` | **PASS exit 0** | Build de produção ok |
| `npm run test:run` (frontend) | **PASS** | 478 passed · 3 skipped (50 arquivos) |
| `npm run test:worker` | **PASS** | 605 passed (83 arquivos) |
| Smoke público (`AIRTRUST_PUBLIC_ONLY=YES`) | **PASS** | `/api/version` + `/api/health` → 200 |
| Smoke autenticado funcional | **PENDENTE** | Requer credencial `AIRTRUST_AUTH_TOKEN` |
| `guard:tracked-secrets` | OK | Nenhum secret rastreado no Git |

**Arquivos untracked relevantes:**
- 5 seeds SQL (`scripts/seed-*.sql`) — risco de aplicar em env errado
- 17 arquivos `knowledge/airtrust/*.md` — documentação viva, não commitada
- Vários relatórios de auditoria em `docs/` — untracked correto

---

## PARTE B — Síntese dos relatórios anteriores

### O que já foi mitigado

| Achado | Status | Evidência |
|---|---|---|
| Admin reset cross-tenant (P0) | ✅ **MITIGADO** | `admin.ts` com `resolveTenantScope` + testes |
| FRMS fail-open (sono→8h, apto=1) | ✅ **MITIGADO** | Payload incompleto → 400; estimativa marcada `requires_operational_review` |
| `escala_alocacoes` tenant-scope | ✅ **MITIGADO (sem migration)** | JOIN `escalas_mensais` enforçado, 6 testes |
| Simulador→qualificação dessincronizado | ✅ **MITIGADO** | `sincronizarQualificacoesDaSessaoConcluida` + testes |
| Dashboard métricas incorretas | ✅ **MITIGADO** | Tenant-scoped + `deleted_at IS NULL` + testes |
| Deploy com árvore suja (`--commit-dirty`) | ✅ **MITIGADO** (caminho principal) | `preflight-clean-deploy.sh` no deploy padrão |
| Scripts D1 remotos sem wrapper | ✅ **PARCIALMENTE MITIGADO** | `run-production-db-script.sh` para os 3 scripts npm |
| SIGVOOS clearExisting multi-tenant | ✅ **MITIGADO** | opt-in explícito + `empresa_id` |
| DDL runtime em hot paths | ✅ **MITIGADO** (principais) | Commit `01f0902` removeu DDL dos hot paths |
| Backfill admin sem tenant scope | ✅ **MITIGADO** | Commit `5fa8107` |

### O que ainda bloqueia cliente real

1. **`/api/assets/*` público sem autenticação** — serve qualquer chave R2 (incluindo certificados, exames médicos, documentos pessoais) sem auth, sem ownership de tenant. **Novo achado confirmado nesta auditoria.**
2. **Sem runbook/script de onboarding** — processo 2-passos manual sem documentação oficial.
3. **Audit trail sem `empresa_id`** — tabela `auditoria` não registra tenant; dados sensíveis nos campos `dados_antes`/`dados_depois`.
4. **Smoke autenticado nunca executado** — validação funcional ponta-a-ponta pendente de credencial.
5. **Sem papel de suporte read-only** — diagnóstico exige `userId===1` ou airtrust-admin.

### O que é pendência operacional (P2/P3, não bloqueia piloto)

- DDL runtime residual em sigvoos/treinamentos/documentos
- `escala_alocacoes` sem `empresa_id` próprio e sem UNIQUE parcial (migration futura)
- `deploy:all` ainda usa `--commit-dirty=true`
- Alguns scripts shell destrutivos sem wrapper (`purge-qualificacoes-cascade.sh` etc.)
- N+1 queries e falta de paginação garantida em endpoints `.all()`

### O que é dívida aceitável

- Dois sistemas paralelos de role (rbac 3-níveis × tenant 6-níveis)
- ~31 sites retornam `error.message` de `ApiError` verbatim ao cliente
- Status mágicos em PT + EN duplicados (`CONCLUIDO`/`CONCLUIDA`, `PENDENTE`/`PENDING`)
- Arquivos de rota grandes (~140 arquivos), sem camada repository
- Acúmulo documental histórico sem índice consolidado

---

## PARTE C — LGPD, dados pessoais e dados operacionais sensíveis

### Dados tratados no sistema

| Dado | Onde aparece | Sensibilidade | Risco | Controle atual | Lacuna | Ação |
|---|---|---|---|---|---|---|
| **Nome completo** | `funcionarios.nome` | Pessoal básico | Baixo | empresa_id scoped | — | Documentar |
| **Email** | `funcionarios.email` | Pessoal/contato | Médio | empresa_id scoped; único | Aparece nos logs (Logger.userEmail) | Anonimizar logs em prod |
| **Matrícula** | `funcionarios.matricula` | Identificador interno | Baixo | empresa_id scoped | — | — |
| **Telefone** | `funcionarios.telefone` (ADD migration 0061) | Pessoal/contato | Médio | empresa_id scoped | Não validado/mascarado | Mascarar em exports/logs |
| **CANAC / Licença ANAC** | `funcionarios.canac`, `funcionarios.licenca` | Identificador profissional | Alto (regulatório) | empresa_id scoped | Sem criptografia em repouso | Criptografar ou restringir acesso |
| **KSS / Sonolência** | `frms_fadiga_logs` | **Dado de saúde operacional** | **MUITO ALTO** | empresa_id, fail-safe | Público via R2 se certificado associado | Verificar key pattern; exigir autenticação |
| **fit_for_duty / apto** | `frms_fadiga_logs` | **Dado de aptidão/saúde** | **MUITO ALTO** | empresa_id, fail-safe | Sem criptografia; armazenado em logs de auditoria | Tratar como dado sensível LGPD Art.11 |
| **hora_dormiu / wake_time** | `frms_fadiga_logs` | Dado comportamental/saúde | Alto | empresa_id scoped | Sem pseudonimização | Pseudonimizar em relatórios externos |
| **Exame Médico (ASO)** | R2 key: `EXAME-ASO-<nome>-<data>-<uuid8>.pdf` | **Dado de saúde — LGPD Art.11** | **CRÍTICO** | Autenticado via `/pasta-virtual/download/:id` | **`/api/assets/EXAME-ASO-*` serve SEM AUTH** | **L1: fechar assets endpoint ou restringir por prefixo** |
| **Certificados de qualificação** | R2 key: `certificados/CERT-<nome>-<codigo>-<data>-<uuid8>.pdf` | Profissional regulatório | Alto | Autenticado via `/qualificacoes/download/:id` | **`/api/assets/certificados/*` serve SEM AUTH** | **L1: fechar assets endpoint** |
| **Documentos pessoais** | R2 key: `funcionarios/<id>/<uuid>.pdf` | Pessoal — pode conter RG, passaporte | **MUITO ALTO** | Autenticado via pasta-virtual | **`/api/assets/funcionarios/*` serve SEM AUTH** | **L1: fechar assets endpoint** |
| **CNPJ da empresa** | `empresas.cnpj` | Empresarial | Baixo | Super-admin scoped | — | — |
| **IP address / user_agent** | tabela `auditoria` | Pessoal (identificador) | Médio | Presente no registro | **Sem empresa_id; sem retenção definida** | Adicionar empresa_id; definir TTL |
| **Dados anteriores/novos em audit** | `auditoria.dados_antes`, `dados_depois` | JSON de qualquer entidade = PII potencial | **ALTO** | Sem restrição | **Sem empresa_id; sem expurgo automático** | Adicionar empresa_id + política de retenção |

### Achado crítico: `/api/assets/*` — exposição pública de documentos sensíveis

**Evidência:** `worker-airtrust/src/routes/assets.ts` + `index.ts:255` (whitelist pública)

```
assetsRouter.get('/*', async (c) => {
  const key = ...pathname.slice('/api/assets/'.length)...
  const object = await c.env.BUCKET.get(key);   // sem auth, sem ownership check
  headers.set('Cache-Control', 'public, max-age=86400');
  return new Response(object.body, { headers });
});
```

Padrões de chave R2 confirmados:
- Logos: `empresas/{id}/logo.png` — **legítimo público**
- Certificados: `certificados/CERT-<NOME>-<COD>-<DATA>-<uuid8>.pdf` — **NÃO deveria ser público**
- Exames médicos: `EXAME-ASO-<NOME>-<DATA>-<uuid8>.pdf` — **DADO DE SAÚDE — CRÍTICO**
- Documentos: `funcionarios/<id>/<full-uuid>.pdf` — UUID completo, difícil adivinhar mas **bearer URL sem revogação**

O endpoint **intencionalmente serve logos públicas** mas a implementação atual serve **qualquer chave do bucket** sem discriminação. Um atacante que descubra ou infira uma chave de exame médico ou certificado pode baixá-lo sem autenticação e o cache CDN (86400s) perpetua o vazamento.

**Impacto LGPD:** EXAME-ASO = dado de saúde (Art. 11 LGPD) exposto sem autorização. Multa ANPD pode alcançar 2% do faturamento. Dano reputacional severo.

### Outras lacunas LGPD

| # | Lacuna | Severidade | Ação mínima |
|---|---|---|---|
| C1 | Sem política de retenção (TTL) para logs de auditoria | L2 | Definir prazo (ex: 2 anos) + cron de purge |
| C2 | Soft-delete (`deleted_at`) não equivale a apagamento LGPD — dado permanece acessível | L2 | Criar rota de anonimização/hard-delete para solicitações de titular |
| C3 | Tabela `auditoria` sem `empresa_id` — registros de todos os tenants misturados | L2 | Adicionar `empresa_id` ao writer `registrarAuditoria()` |
| C4 | Logger registra `userEmail` em logs JSON de produção | L3 | Hash ou remover email dos logs estruturados |
| C5 | `dados_antes`/`dados_depois` na auditoria armazenam JSON completo (pode incluir fatiga/fit_for_duty) | L2 | Sanitizar campos sensíveis antes de gravar ou definir política de exclusão |
| C6 | Sem Termo de Uso / Política de Privacidade linkados no sistema | L1 (legal, pré-cliente) | Criar páginas + aceite no primeiro login |
| C7 | Sem DPA (Data Processing Agreement) com cliente | L1 (legal, pré-cliente) | Redigir contrato antes de processar dados reais |
| C8 | Sem mecanismo de exportação de dados por titular (portabilidade LGPD Art. 18) | L2 | Endpoint de export por funcionário |
| C9 | Sem inventário de subprocessadores (Brevo/SendGrid, Cloudflare, R2) | L2 | Documentar no DPA |

---

## PARTE D — Onboarding da primeira empresa

### Estado atual do fluxo

**Como criar uma empresa hoje:** `POST /api/empresas` (super-admin `codigo==='airtrust'` ou `userId===1`). Não atômico.

**Como criar o primeiro admin:** Passo separado — `POST /api/empresas/:id/usuarios/invite` — cria usuário (senha temp), gera token 72h, envia e-mail via Brevo/SendGrid.

| Questão | Estado |
|---|---|
| Criação de empresa | Funciona via API (sem runbook) |
| Criação do primeiro admin | Via convite — funcional, 2 passos |
| Convite por e-mail | ✅ Funciona (Brevo/SendGrid + token 72h) |
| Ativação/desativação de empresa | ✅ Soft-delete com guard de funcionários ativos |
| Troca de admin | Via `usuarios_empresas` — funcional |
| Seed inicial por tenant | ❌ **Não existe** — todos os dados criados manualmente |
| Dados mínimos obrigatórios | Funcionários, funções, modelos, tipos de qualificação — manuais |
| Templates de importação | Parcial (importação via CSV existe para alguns módulos) |
| Validação pós-onboarding | ❌ **Não existe** — sem smoke por tenant |
| Handover para cliente | ❌ **Sem guia in-app** — somente entrega de credencial |
| Offboarding seguro | Hard-delete bloqueado se há funcionários; sem export automático prévio |

### Checklist operacional de onboarding (estado atual / recomendado)

#### PRÉ-ONBOARDING
- [ ] Confirmar BREVO_API_KEY/SENDGRID configurado (senão convite não chega — usar URL do convite manualmente)
- [ ] Definir `codigo` da empresa (lowercase `^[a-z0-9_-]+$`), plano (`basic/pro/enterprise`), `max_funcionarios`, `max_storage_mb`
- [ ] Confirmar módulos a ativar em `empresas_config.modulos_ativos`
- [ ] **[FALTANTE] Assinar DPA e Política de Privacidade antes de criar empresa real**
- [ ] **[FALTANTE] Confirmar quais módulos ficam visíveis vs. ocultos para o cliente**

#### CRIAÇÃO DA EMPRESA
- [ ] `POST /api/empresas` via super-admin
- [ ] Verificar resposta com `id` da empresa criada
- [ ] `PUT /api/empresas/:id/config` — logo, cores, modulos_ativos
- [ ] Upload de logo via rota autenticada (NÃO via `/api/assets` diretamente)

#### CRIAÇÃO DO PRIMEIRO ADMIN
- [ ] `POST /api/empresas/:id/usuarios/invite` `{email, role:'admin', empresaIds:[id]}`
- [ ] Copiar `conviteUrl` da resposta (fallback se e-mail falhar)
- [ ] Verificar e-mail chegou (ou enviar URL manualmente)
- [ ] Confirmar aceitação do convite + troca de senha

#### CONFIGURAÇÃO INICIAL POR MÓDULO
- [ ] Cadastrar setores e funções base
- [ ] Cadastrar modelos de aeronave relevantes
- [ ] Cadastrar tipos de qualificação
- [ ] Cadastrar funcionários (via importação CSV ou manual)
- [ ] Configurar FRMS (se habilitado): parâmetros de fadiga, limites
- [ ] Configurar escala mensal base

#### VALIDAÇÃO PÓS-ONBOARDING (RECOMENDADO — INEXISTENTE HOJE)
- [ ] **Criar script de smoke por tenant**: login admin + leitura escala/FRMS/qualificação no tenant novo
- [ ] Verificar dashboard executivo com dados do tenant
- [ ] Testar convite de usuário não-admin

#### HANDOVER
- [ ] Entregar credencial admin + URL de acesso
- [ ] **[FALTANTE] Criar guia de "primeiro acesso" — hoje não existe in-app**
- [ ] Agendar call de acompanhamento D+7

#### OFFBOARDING (SE NECESSÁRIO)
- [ ] Exportar dados do tenant (módulo de backup/export — verificar escopo)
- [ ] Remover/desvincular funcionários ativos do tenant
- [ ] `DELETE /api/empresas/:id` (super-admin)
- [ ] **[FALTANTE] Apagamento LGPD-compliant (hoje só soft-delete)**

---

## PARTE E — Suporte e operação interna

### Infraestrutura de observabilidade atual

| Capacidade | Estado | Detalhe |
|---|---|---|
| Request ID | ✅ Existe | `requestIdMiddleware` em `index.ts:153` → `X-Request-ID` em todos os responses |
| Structured logging | ✅ Existe | `utils/logger.ts` — JSON em produção com requestId, userId, module, duration |
| Health/version | ✅ Existe | `/api/health` (DB + storage latência) + `/api/version` (commit hash + timestamp) |
| Error handler produção | ✅ Seguro | Stack traces ocultos em prod; `requestId` retornado ao cliente |
| Audit trail | ⚠️ Parcial | Existe (`utils/auditoria.ts`) mas **sem `empresa_id`** — veja abaixo |
| Log de tail produção | ✅ Existe | `npm run logs:tail` via wrangler |
| Diagnóstico por tenant | ❌ **Inexistente** | Sem endpoint de diagnóstico por empresa |
| Métricas de uso por empresa | ❌ **Inexistente** | Sem dashboard de uso/limite/quota |
| Papel de suporte | ❌ **Inexistente** | Suporte = `userId===1` ou airtrust-admin — acesso amplo |
| Per-tenant smoke | ❌ **Inexistente** | Muitos smokes gerais, nenhum por tenant |

### Auditoria — estado detalhado

O sistema tem **3 tabelas de auditoria fragmentadas**:

| Tabela | Criada em | Com `empresa_id`? | Writer ativo? |
|---|---|---|---|
| `auditoria` | Migration 0160 (backup system) | **NÃO** | **SIM** — `utils/auditoria.ts` |
| `auditoria_avancada_v2` | Migration 0062 | NÃO | Não verificado |
| `audit_logs` | Migration 0332 | **SIM** | Não verificado |

**Problema:** O writer principal (`registrarAuditoria`) grava em `auditoria` sem `empresa_id`. Suporte que consultar `auditoria` vê registros de **todos os tenants misturados**. E os campos `dados_antes`/`dados_depois` armazenam JSON completo de qualquer entidade — incluindo dados de fadiga, aptidão e PII.

**Swallow de erro:** falhas de auditoria são capturadas silenciosamente (`catch → console.error`) — audit trail não é garantido.

### Checklists de suporte

#### CHECKLIST MÍNIMO — 1 EMPRESA
- [ ] Acesso ao `npm run logs:tail` (prod logs + requestId)
- [ ] Conhecer `GET /api/health` para verificar DB/storage
- [ ] Conhecer `GET /api/version` para confirmar deploy
- [ ] Ter credencial de airtrust-admin para acessar admin panel
- [ ] Runbook básico: "cliente não consegue logar" → verificar usuarios_empresas + token expirado
- [ ] **[A CRIAR] Tabela de mapeamento: requestId → empresa → usuário**

#### CHECKLIST MÍNIMO — 5 EMPRESAS
- [ ] Tudo do checklist anterior +
- [ ] Role `support` read-only criado (não depender de userId=1)
- [ ] Script de diagnóstico por tenant: `GET /api/admin/diagnostics?empresa_id=N`
- [ ] Dashboard interno: empresas ativas, # usuários, último login, erros 5xx/dia por tenant
- [ ] Runbook de incidente documentado (queda, dado errado, lock de conta)
- [ ] Processo de escalada definido

#### CHECKLIST MÍNIMO — 10+ EMPRESAS
- [ ] Tudo anterior +
- [ ] Métricas de uso/quota por empresa
- [ ] Alertas automáticos (erro 5xx acima de threshold por tenant)
- [ ] SLA documentado e monitorado
- [ ] Processo de offboarding / migração de dados
- [ ] Treinamento de equipe de suporte

---

## PARTE F — Qualidade de dados

### Riscos de dados ruins

| Risco | Módulo/Tabela | Evidência | Severidade | Antes da 1ª empresa? |
|---|---|---|---|---|
| Status em PT e EN duplicados | Múltiplos módulos | `CONCLUIDO`(27×) + `CONCLUIDA`(23×) + `PENDENTE`(15×) + `PENDING`(12×) + `CANCELADO/A`(19×) — queries filtrando só um variant perdem linhas | L2 | SIM (verificar métricas do dashboard) |
| Alocação dupla de tripulante | `escala_alocacoes` | Sem UNIQUE parcial (`WHERE deleted_at IS NULL`) | L2 | Não — mas documentar |
| Escala sem `empresa_id` próprio | `escala_alocacoes` | Isolamento 100% por JOIN — JOIN esquecido = vazamento | L1 latente | Não — mitigado por testes |
| Seed/demo mixado em produção | Scripts `seed-*.sql` (untracked) | 5 arquivos SQL de seed não commitados: `seed-local.sql`, `seed-data-complete.sql`, etc. | L1 (se aplicado ao env errado) | SIM — guardar anotados por env |
| Tripulante sem empresa ativa | `usuarios_empresas` | User criado mas vínculo falha → fallback userId=1 escolhe tenant implícito | L2 | SIM — audit pós-onboarding |
| Métricas executivas com status parcial | `dashboard.ts` | Filtro `status IN ('CONCLUIDA','CONCLUIDO')` correto, mas outros módulos podem não ter sido atualizados | L2 | Verificar por módulo |
| Migrations duplicadas de prefixo | Migrations | P2-03 pendente: prefixos `0092` (9×), `0062`, `0063`, `0068` múltiplos | L3 | Não — documentar |
| Empresa sem configuração mínima | `empresas_config` | Criação de empresa não garante `modulos_ativos` mínimo | L2 | SIM — checar no onboarding |

### Catálogo de checks read-only recomendados

```sql
-- CQ-01: Empresas sem admin ativo
SELECT e.id, e.nome, e.codigo
FROM empresas e
WHERE e.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM usuarios_empresas ue
    WHERE ue.empresa_id = e.id AND ue.role = 'admin' AND ue.deleted_at IS NULL
  );

-- CQ-02: Usuários sem empresa vinculada
SELECT u.id, u.email FROM usuarios u
WHERE u.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM usuarios_empresas ue WHERE ue.usuario_id = u.id AND ue.deleted_at IS NULL);

-- CQ-03: Qualificações com status divergente (vencidas com status VÁLIDA)
SELECT qh.id, qh.status, qh.validade, f.nome, e.codigo
FROM qualificacoes_historico qh
JOIN funcionarios f ON f.id = qh.funcionario_id
JOIN empresas e ON e.id = qh.empresa_id
WHERE qh.deleted_at IS NULL AND qh.status = 'VALIDA' AND date(qh.validade) < date('now');

-- CQ-04: Sessões de simulador em estado PLANEJADA há mais de 90 dias
SELECT s.id, s.data, s.status, e.codigo
FROM sessoes_simulador s
JOIN empresas e ON e.id = s.empresa_id
WHERE s.status = 'PLANEJADA' AND s.deleted_at IS NULL AND date(s.data) < date('now', '-90 days');

-- CQ-05: Allocações duplicadas (mesmo funcionário, mesma escala, mesma data, não deletadas)
SELECT funcionario_id, escala_id, COUNT(*) AS cnt
FROM escala_alocacoes
WHERE deleted_at IS NULL
GROUP BY funcionario_id, escala_id, funcao
HAVING cnt > 1;

-- CQ-06: Empresas sem config mínima
SELECT e.id, e.nome FROM empresas e
WHERE e.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM empresas_config ec WHERE ec.empresa_id = e.id);

-- CQ-07: Check-ins FRMS com fit_for_duty NULL (status ambíguo)
SELECT empresa_id, COUNT(*) as cnt FROM frms_fadiga_logs
WHERE fit_for_duty IS NULL AND deleted_at IS NULL AND created_at > date('now', '-30 days')
GROUP BY empresa_id;
```

| Check | Tabela/módulo | Risco detectado | Frequência | Antes da 1ª empresa? |
|---|---|---|---|---|
| CQ-01 Empresa sem admin | empresas + usuarios_empresas | Cliente sem acesso admin | Pós-onboarding | **SIM** |
| CQ-02 Usuário sem empresa | usuarios | Usuário órfão = fallback userId=1 | Semanal | **SIM** |
| CQ-03 Qualificação vencida com status VÁLIDA | qualificacoes_historico | Métrica enganosa | Diária | **SIM** |
| CQ-04 Sessão PLANEJADA antiga | sessoes_simulador | Dado fantasma | Mensal | Não |
| CQ-05 Alocação duplicada | escala_alocacoes | Duplo agendamento | Semanal | **SIM** |
| CQ-06 Empresa sem config | empresas_config | Módulos indefinidos | Pós-onboarding | **SIM** |
| CQ-07 Fit-for-duty NULL | frms_fadiga_logs | Fadiga não avaliada | Diária | **SIM** |

---

## PARTE G — Módulos por status

| Módulo | Status | Nota 0–5 | Liberar? | Risco principal | Antes de cliente real |
|---|---|---|---|---|---|
| **Qualificações** | READY | 4.0 | **LIBERAR PILOTO CONTROLADO** | Datas/vencimento bordas | Smoke autenticado |
| **Simuladores** | READY | 4.0 | **LIBERAR PILOTO CONTROLADO** | — (transição testada) | Smoke autenticado |
| **Funcionários** | READY | 4.2 | **LIBERAR PILOTO CONTROLADO** | — (16 testes tenant) | Nenhuma crítica |
| **Dashboard executivo** | READY | 3.8 | **LIBERAR PILOTO CONTROLADO** | Métricas além das testadas | Validar com dados reais |
| **Escalas mensais** | READY (vigiar) | 3.5 | **LIBERAR PILOTO CONTROLADO** | `escala_alocacoes` sem `empresa_id` próprio | Reforçar testes EVD |
| **EVD** | NEEDS TEST | 3.0 | **PILOTO CONTROLADO** | Cobertura tenant leve (2 testes) | Testes de conflito + tenant |
| **FRMS / Fadiga Diária** | READY (vigiar) | 3.6 | **PILOTO CONTROLADO** | Maior superfície; estimativa fail-safe; **dado de saúde** | Acompanhar; fechar `/api/assets` primeiro |
| **Importação** | PARCIAL | 3.0 | **PILOTO CONTROLADO** | Validação de schema por módulo | Testar por tenant |
| **Exportação / PDFs** | PARCIAL | 3.2 | **PILOTO CONTROLADO** | Certificados via assets público (L1 pendente) | **Fechar assets endpoint** |
| **Treinamentos planejados** | NEEDS MIGRATION | 2.8 | **BETA/OCULTO** | DDL runtime (colunas link) | Migration antes de novo tenant |
| **SGSO** | NEEDS TEST | 2.8 | **BETA/OCULTO** | Cobertura tenant leve (4 testes) | Testes de caminho crítico |
| **LMS / EAD** | NEEDS TEST | 2.8 | **BETA/OCULTO** | Cobertura tenant leve (2 testes) | Testes tenant + matrícula |
| **Hospedagem** | NEEDS TEST | 2.5 | **BETA/OCULTO** | **0 testes** de tenant | Testes contrato + tenant |
| **SIGVOOS** | NEEDS MIGRATION | 2.5 | **BLOQUEAR** | Tabelas criadas em runtime (DDL) | Migration explícita obrigatória |
| **Configurações (seções "em breve")** | PARCIAL | 2.5 | **BETA/OCULTO** | Seções incompletas visíveis ao cliente | Ocultar seções |
| **Admin / manutenção** | READY (interno) | 3.5 | **USO INTERNO APENAS** | Sem papel de suporte dedicado | Restringir acesso |
| **Usuários / empresas** | READY (manual) | 3.2 | **USO INTERNO APENAS** | Onboarding 2-passos sem runbook | Criar runbook |

---

## PARTE H — Demo e piloto: roteiro e readiness

### Checklist pré-demo

- [ ] Empresa demo criada com dados realistas (15–30 funcionários, mix de qualificações válidas/vencendo/vencidas)
- [ ] Dashboard com dados que "contam uma história" (ex: 2 pilotos com qualificação vencendo em 30 dias, 1 vencida)
- [ ] FRMS com pelo menos 5 dias de check-in para 3 tripulantes
- [ ] Escala mensal preenchida com alocações (não vazia)
- [ ] Simuladores: 2–3 sessões agendadas + 1 concluída
- [ ] Pelo menos 1 certificado gerado e visível (via rota autenticada, não assets pública)
- [ ] Usuário demo admin ≠ usuário de apresentação (apresentar como user do cliente, não super-admin)
- [ ] Ocultar: SIGVOOS, Treinamentos Planejados, Hospedagem, seções "em breve" de Configurações
- [ ] Testar navegação completa do roteiro um dia antes
- [ ] Verificar build/deploy estável (não demo com worker dev local)

### Telas para mostrar

| Tela | Motivo | Impacto visual |
|---|---|---|
| `/home` (Dashboard executivo) | Visão geral com métricas: qualificados, vencimentos, sessões | Alto — primeira impressão |
| `/qualificacoes` | Lista por funcionário, alertas de vencimento | Alto — core value |
| `/qualificacoes/alertas` | Proatividade: "quem vence nos próximos 30 dias" | Alto |
| `/qualificacoes/dashboard` | Compliance visual | Médio-alto |
| `/simuladores` | Agenda de sessões + status | Médio-alto |
| `/funcionarios` | Lista com filtros, perfil, ficha | Médio |
| `/funcionarios/:id/ficha` | Ficha completa com qualificações e histórico | Alto — diferencial |
| `/frms/fadiga-painel` | Painel de fadiga da frota (se tenant usa FRMS) | Alto (diferencial) |
| `/frms/checkin` | Check-in diário do tripulante | Médio |
| `/escalas` | Visão do roster mensal | Médio |
| `/escalas/evd` | Escala diária de voo | Médio |

### Telas para evitar na demo

| Tela | Motivo |
|---|---|
| `/configuracoes/integracoes/sigvoos` | Integração em estado DDL-runtime, não confiável |
| `/configuracoes/integracoes/edapp` | Dependência externa, pode mostrar erros |
| `/lms`, `/hospedagem`, `/sgso` | Cobertura leve, surpresas possíveis |
| `/admin/usuarios`, `/admin/permissoes` | Confuso para demo de produto, parece interno |
| `/auditoria` | Pode mostrar dados cruzados sem empresa_id filtrado |
| `/importacao` | Pode mostrar fluxos incompletos / mensagens técnicas |
| `/manutencao`, `/limpar-dados` | Visível pelo admin — assustador em demo |
| `/configuracoes/*` seções "em breve" | Expectativa negativa |

### Roteiro de demo — 15 minutos

```
00:00–02:00  Login + Dashboard (home)
  → "Visão executiva: compliance da frota hoje"
  → Mostrar cards: qualificados, vencendo, vencidos
  → Destaque: "os 2 pilotos com vencimento em 30 dias — sistema já alertou"

02:00–05:00  Qualificações
  → /qualificacoes/alertas — lista de ação imediata
  → Abrir 1 funcionário → ficha completa com histórico
  → Mostrar certificado gerado automaticamente

05:00–08:00  Simuladores
  → Sessões agendadas, status PLANEJADA → CONCLUÍDA
  → Mostrar como simulador concluído atualiza qualificação

08:00–11:00  FRMS (se relevante para o cliente)
  → Painel de fadiga da frota
  → Demonstrar check-in do tripulante
  → Mostrar indicadores: KSS, horas de sono, aptidão

11:00–13:00  Escalas
  → Roster mensal preenchido
  → EVD com alocações do dia

13:00–15:00  Funcionários + próximos passos
  → Ficha de funcionário — visão completa
  → "Como seu time usaria: admin + tripulantes + instrutores"
  → Q&A
```

### Roteiro de demo — 30 minutos

```
00:00–05:00  Contexto + Dashboard
  → Problemática: como vocês gerenciam qualificações hoje?
  → Demo do dashboard com dados reais-ish

05:00–12:00  Qualificações (aprofundado)
  → Fluxo completo: criar → vencer → alertar → renovar → certificar
  → Importação de dados (mostrar template, não executar ao vivo)
  → Relatórios / export

12:00–18:00  Simuladores + FRMS
  → Agenda de simuladores vinculada à qualificação
  → FRMS: check-in → painel → relatório de fadiga acumulada
  → Destaque: "dado operacional, não burocrático"

18:00–23:00  Escalas + EVD
  → Roster mensal + EVD
  → Conflito detectado automaticamente (mostrar bloqueio)

23:00–27:00  Gestão de acessos
  → Papéis: admin, gestor, instrutor, tripulante
  → Convite por e-mail (mostrar UI, não executar ao vivo em tenant demo)

27:00–30:00  Roadmap + Q&A
  → Módulos futuros: LMS, SGSO, integração SIGVOOS
  → Piloto: como começar, dados necessários, cronograma
```

### Dados mínimos de demo

| Entidade | Mínimo recomendado |
|---|---|
| Funcionários | 15–20 (mix de pilotos, instrutores, mecânicos) |
| Qualificações por funcionário | 3–5 (1 válida, 1 vencendo, 1 vencida) |
| Sessões de simulador | 5–8 (mix de status) |
| Dias de check-in FRMS | 7–10 por tripulante |
| Escalas | 1 mês com 60–70% de alocações |
| Certificados gerados | 3–5 visíveis |
| Aeronaves no catálogo | 3–5 modelos |

---

## PARTE I — Relatório executivo: decisão e roadmap

### 1. Decisão executiva

**Decisão: B — pronto para PILOTO CONTROLADO com 1–3 empresas reais, com restrições explícitas.**

**Nota geral de prontidão: 3.2 / 5**

*(Ligeiramente abaixo do relatório RBAC anterior [3.4/5] porque esta auditoria confirmou o achado de `/api/assets` e levantou as lacunas LGPD/suporte com mais detalhe.)*

**Não é A** porque:
- `/api/assets/*` público serve documentos sensíveis (médicos, certificados) sem auth — crítico LGPD.
- Sem runbook de onboarding, sem smoke por tenant.
- Sem Termo de Uso / DPA assinado.
- Smoke autenticado ponta-a-ponta nunca rodado.
- Sem papel de suporte read-only.

**Não é C/D** porque:
- Todos os gates de CI passam (tsc, build, 1083 testes).
- Nenhum P0/P1 de código ativo — isolamento multi-tenant testado.
- Auth + tenant globais, RBAC funcional, convite por e-mail operacional.
- Health + version + request-id + error handler produção seguros.
- Módulos core (Qualificações, Simuladores, Funcionários, FRMS, Dashboard) prontos para piloto acompanhado.

**Condição para iniciar o piloto:** fechar o achado L1 de `/api/assets` (restrição ou separação de prefixos) + DPA/Termos assinados + runbook de onboarding mínimo.

---

### 2. Top 10 bloqueios antes do primeiro cliente real

| Rank | Bloqueio | Severidade | Evidência | Correção mínima | Correção ideal |
|---|---|---|---|---|---|
| 1 | `/api/assets/*` público serve documentos sensíveis (médicos, certificados, docs pessoais) sem auth | **L1** | `routes/assets.ts` — nenhum middleware de auth; `index.ts:255` na whitelist pública | Mover prefixos sensíveis para rota autenticada; manter apenas logos públicos | Separar bucket logos (público) vs. docs (privado, signed URLs) |
| 2 | Sem Termo de Uso / Política de Privacidade / DPA | **L1 (legal)** | Ausência — nenhuma página de ToS no app | Redigir e linkar antes do primeiro login | Aceite explícito no onboarding + versionamento |
| 3 | Smoke autenticado ponta-a-ponta nunca rodado | **L1 (ops)** | `smoke-authenticated-operational.sh` pendente de credencial | Fornecer token read-only e rodar 1× em produção | Service account read-only dedicado + smoke no CI |
| 4 | Sem runbook oficial de onboarding | **L1 (ops)** | Processo 2-passos sem documentação; sem seed de dados mínimos | Escrever SOP de onboarding (2 páginas) | Script idempotente de provisionamento por tenant |
| 5 | Audit trail sem `empresa_id` — PII em `dados_antes/depois` | **L1 (LGPD)** | `utils/auditoria.ts` — INSERT sem empresa_id; `dados_antes/dados_depois` = JSON completo | Adicionar `empresa_id` ao `registrarAuditoria()`; sanitizar campos sensíveis | Nova tabela unificada com empresa_id, TTL, índices |
| 6 | Sem papel de suporte read-only | **L2** | `empresas.ts:601` — super-admin = `userId===1` hardcoded | Criar role `support` com permissões read-only mínimas | Coluna `is_platform_admin` / role `platform_admin` + `support` |
| 7 | DDL runtime residual (SIGVOOS, treinamentos, documentos) | **L2** | Migrations criadas em runtime — schema pode divergir por tenant | Ocultar módulos afetados do cliente | Migrations explícitas; remover `ensure*` |
| 8 | Status mágicos em PT + EN duplicados — risco de métrica incorreta | **L2** | `CONCLUIDO`×27 + `CONCLUIDA`×23 + `PENDING`×12 + `PENDENTE`×15 | Auditar todas as queries críticas para garantir filtro com ambas as variantes | Enum centralizado TypeScript + migration de normalização |
| 9 | Sem export/backup por tenant no offboarding | **L2** | `DELETE /api/empresas/:id` sem export prévio; LGPD exige portabilidade (Art. 18) | Bloquear desativação sem export confirmado | Export automático em ZIP + LGPD data deletion request flow |
| 10 | Cobertura multi-tenant nula/leve em módulos beta | **L2** | Hospedagem: 0 testes; EVD: 2; LMS: 2; SGSO: 4 | Garantir que esses módulos fiquem ocultos no cliente real | Testes de contrato + tenant por módulo |

---

### 3. Módulos por status (consolidado)

| Módulo | Status | Nota | Liberar? | Risco principal | Antes de cliente real |
|---|---|---|---|---|---|
| Qualificações | READY | 4.0 | **PILOTO CONTROLADO** | Datas/vencimento bordas | Smoke autenticado |
| Simuladores | READY | 4.0 | **PILOTO CONTROLADO** | — | Smoke autenticado |
| Funcionários | READY | 4.2 | **PILOTO CONTROLADO** | — | — |
| Dashboard executivo | READY | 3.8 | **PILOTO CONTROLADO** | Métricas além das testadas | Validar com dados reais |
| Escalas mensais | READY (vigiar) | 3.5 | **PILOTO CONTROLADO** | `escala_alocacoes` sem empresa_id próprio | Vigiar; migration opcional |
| EVD | NEEDS TEST | 3.0 | **PILOTO CONTROLADO** | Cobertura tenant leve | Testes conflito + tenant |
| FRMS / Fadiga Diária | READY (vigiar) | 3.6 | **PILOTO CONTROLADO** | Dado de saúde; assets público pendente | **Fechar assets L1 primeiro** |
| Exportação / PDFs / Certificados | PARCIAL | 3.2 | **PILOTO CONTROLADO** | Assets público (L1) | **Fechar assets L1** |
| Treinamentos planejados | NEEDS MIGRATION | 2.8 | **BETA/OCULTO** | DDL runtime | Migration |
| SGSO | NEEDS TEST | 2.8 | **BETA/OCULTO** | Cobertura leve | Testes |
| LMS / EAD | NEEDS TEST | 2.8 | **BETA/OCULTO** | Cobertura leve | Testes tenant |
| Hospedagem | NEEDS TEST | 2.5 | **BETA/OCULTO** | 0 testes de tenant | Testes |
| SIGVOOS | NEEDS MIGRATION | 2.5 | **BLOQUEAR** | DDL runtime obrigatório | Migration explícita |
| Configurações (seções incompletas) | PARCIAL | 2.5 | **BETA/OCULTO** | Seções "em breve" visíveis | Ocultar |
| Admin / manutenção | READY | 3.5 | **USO INTERNO** | Sem role suporte | Role suporte |
| Usuários / empresas | READY | 3.2 | **USO INTERNO** | Onboarding manual sem runbook | Runbook |

---

### 4. LGPD e dados sensíveis (síntese)

| Dado | Onde aparece | Risco | Controle atual | Lacuna | Ação |
|---|---|---|---|---|---|
| Nome / email / telefone | `funcionarios` | Pessoal — baixo-médio | empresa_id scoped | email nos logs | Anonimizar logs |
| CANAC / Licença ANAC | `funcionarios` | Identificador profissional regulatório | empresa_id scoped | Sem criptografia | Avaliar criptografia |
| KSS / sono / fit_for_duty | `frms_fadiga_logs` | **Dado de saúde (LGPD Art.11)** | empresa_id scoped | Sem criptografia; bearer URL potencial | Tratar como sensível; criptografar ou restringir |
| Exame médico (ASO PDFs) | R2: `EXAME-ASO-*.pdf` | **CRÍTICO — saúde — Art.11** | Rota autenticada existe | **Assets público serve sem auth** | **L1: fechar `/api/assets` para docs sensíveis** |
| Certificados de qualificação | R2: `certificados/*.pdf` | Profissional/regulatório | Rota autenticada existe | **Assets público serve sem auth** | **L1: fechar `/api/assets` para certificados** |
| Documentos pessoais | R2: `funcionarios/<id>/<uuid>.pdf` | Alto — pode conter RG/passaporte | UUID completo (difícil adivinhar) | Bearer URL sem revogação; assets público | L1: mover para rota autenticada |
| Dados audit `dados_antes/depois` | tabela `auditoria` | PII potencial em JSON | — | Sem empresa_id; sem TTL | Adicionar empresa_id + TTL + sanitização |
| IP address / user_agent | tabela `auditoria` | Dado pessoal (identificador) | Presente no registro | Sem TTL; sem empresa_id | Definir retenção |
| Inventário subprocessadores | Brevo, SendGrid, CF, R2 | — | — | Sem DPA documentando subprocessadores | DPA antes do 1º cliente |

---

### 5. Onboarding checklist (consolidado — veja Parte D para detalhes)

#### ANTES DA 1ª EMPRESA
- [ ] Assinar DPA + Política de Privacidade com o cliente
- [ ] Fechar achado L1 de `/api/assets` (docs sensíveis)
- [ ] Escrever SOP mínimo de onboarding (create empresa → invite admin → config → smoke)
- [ ] Rodar smoke autenticado 1× em produção
- [ ] Executar checks CQ-01 a CQ-07 após criar o tenant
- [ ] Confirmar BREVO/SENDGRID para envio de convite
- [ ] Ocultar módulos beta/bloqueados no menu do cliente

#### ANTES DA 5ª EMPRESA
- [ ] Script idempotente de provisionamento (sem seed de demo)
- [ ] Role `support` read-only
- [ ] Per-tenant smoke automatizado
- [ ] Guia de primeiro acesso in-app
- [ ] Migrations explícitas para SIGVOOS e treinamentos planejados

---

### 6. Suporte checklist (veja Parte E para detalhes completos)

#### ANTES DA 1ª EMPRESA
- [ ] SOP de incidente básico documentado
- [ ] Credencial de airtrust-admin para diagnóstico
- [ ] Runbook: cliente sem acesso, dado errado, lock de conta
- [ ] Acesso a `npm run logs:tail`

#### ANTES DA 5ª EMPRESA
- [ ] Role `support` criado
- [ ] Audit trail com empresa_id
- [ ] Dashboard básico de saúde por tenant
- [ ] Processo de escalada documentado

---

### 7. Data quality checks (veja Parte F para SQL completo)

| Check | Módulo | Antes da 1ª empresa? |
|---|---|---|
| CQ-01: Empresa sem admin ativo | empresas | **SIM** |
| CQ-02: Usuário sem empresa | usuarios | **SIM** |
| CQ-03: Qualificação vencida com status VÁLIDA | qualificacoes_historico | **SIM** |
| CQ-04: Sessão PLANEJADA > 90 dias | sessoes_simulador | Não |
| CQ-05: Alocação duplicada | escala_alocacoes | **SIM** |
| CQ-06: Empresa sem config mínima | empresas_config | **SIM** |
| CQ-07: fit_for_duty NULL | frms_fadiga_logs | **SIM** |

---

### 8. Demo readiness (veja Parte H para roteiros completos)

**Score de prontidão para demo: 4.0 / 5**

✅ Telas prontas para mostrar: Dashboard, Qualificações, Simuladores, Funcionários, Ficha de funcionário, FRMS Fadiga, Escalas/EVD  
⚠️ Telas a evitar: SGSO, LMS, Hospedagem, Configurações integrations, Admin, Auditoria  
🚨 Risco visível: dados demo insuficientes → dashboard com zeros (impressão ruim) — preparar seed de demo cuidadosamente

---

### 9. Roadmap por prioridade

#### ANTES DA PRIMEIRA EMPRESA (bloqueadores)

| # | Ação | Categoria | Esforço | Dono |
|---|---|---|---|---|
| R1 | Fechar `/api/assets` — restringir docs sensíveis (certificados, médicos, docs pessoais) a rotas autenticadas; deixar apenas logos como públicos | SEGURANÇA/LGPD | Pequeno | Dev |
| R2 | Redigir e publicar Termos de Uso + Política de Privacidade + DPA | LEGAL/LGPD | Médio | Legal + Produto |
| R3 | Rodar smoke autenticado 1× em produção com token read-only | OPS | Pequeno | Dev |
| R4 | Escrever SOP de onboarding (2 páginas: criar empresa → admin → config → smoke por tenant) | PROCESSO | Pequeno | Produto |
| R5 | Adicionar `empresa_id` ao `registrarAuditoria()` + sanitizar `dados_antes/dados_depois` de campos sensíveis | LGPD/SEGURANÇA | Pequeno | Dev |
| R6 | Aceite de ToS/Privacidade no primeiro login do usuário | LGPD/PRODUTO | Médio | Dev + Design |
| R7 | Ocultar SIGVOOS, Treinamentos Planejados, Hospedagem, seções "em breve" de Configurações no menu do tenant | PRODUTO | Pequeno | Dev |

#### ANTES DA 5ª EMPRESA

| # | Ação | Categoria | Esforço |
|---|---|---|---|
| R8 | Criar role `support` (read-only, escopo por tenant) + parar de depender de `userId===1` | RBAC/OPS | Médio |
| R9 | Migrations explícitas para tabelas SIGVOOS e treinamentos planejados; remover DDL runtime | TECH DEBT | Médio |
| R10 | Testes multi-tenant para Hospedagem, EVD, LMS, SGSO | TEST | Médio |
| R11 | Script idempotente de provisionamento de tenant (sem seed de demo em prod) | OPS | Médio |
| R12 | Definir política de retenção para `auditoria` (TTL + cron de purge) | LGPD/OPS | Pequeno |
| R13 | Fechar `deploy:all` / `legacy/deploy-full-automated.sh` com `--commit-dirty=true` residual | OPS | Pequeno |
| R14 | Normalizar status duplicados PT/EN (`CONCLUIDO`/`CONCLUIDA`, `PENDENTE`/`PENDING`) — migration + enum TS | DATA QUALITY | Médio |
| R15 | Criar per-tenant smoke script | OPS/TEST | Médio |
| R16 | Endpoint de export de dados por empresa (portabilidade LGPD Art. 18) | LGPD | Médio |

#### ANTES DA 10ª EMPRESA

| # | Ação |
|---|---|
| R17 | Migration `escala_alocacoes.empresa_id` denormalizado + UNIQUE parcial |
| R18 | Paginação garantida em endpoints `.all()` de alto volume; resolver N+1 (~13 identificados) |
| R19 | Mecanismo de solicitação de apagamento de dados (LGPD titular) |
| R20 | Dashboard interno de uso/quota por empresa + alertas automáticos |
| R21 | SLA documentado e monitorado por tenant |

#### PODE ESPERAR (dívida aceitável)

- Unificar as duas taxonomias de role (rbac 3-níveis × tenant 6-níveis)
- Quebra de arquivos gigantes de rota; camada repository
- Padronizar `error.message` verbatim nos 31 sites de `ApiError`
- Migrations duplicadas de prefixo (audit frágil, não risco de produção)
- Consolidação documental histórica (~880 arquivos)

---

### 10. Próximo prompt operacional recomendado (para Codex)

```text
Prompt — Codex: Fechar exposição de documentos sensíveis no /api/assets (L1 LGPD)

Repositório: /Users/filipedaumas/SAAS/Airtrust  |  Branch: main
Objetivo: garantir que o endpoint GET /api/assets/* NÃO sirva documentos
sensíveis (certificados, exames médicos, documentos pessoais) sem autenticação.
Hoje o handler (routes/assets.ts) serve QUALQUER chave R2 publicamente com
Cache-Control: public. A intenção original era servir apenas logos de empresa.

Contexto técnico:
- Logos: R2 key "empresas/{id}/logo.png" → legítimo público
- Certificados: R2 key "certificados/CERT-*.pdf" → NÃO deve ser público
- Exames médicos: R2 key "EXAME-ASO-*.pdf" → dado de saúde LGPD Art.11 — CRÍTICO
- Documentos funcionários: "funcionarios/{id}/*.pdf" → NÃO deve ser público
- Rotas autenticadas já existem:
    GET /api/qualificacoes/certificados/download/:id   (auth())
    GET /api/pasta-virtual/download/:id               (auth())
    GET /api/pasta-virtual/download-certificados/:id  (auth())

Restrições:
- NÃO executar migration, NÃO tocar DB remoto, NÃO rodar wrangler d1 --remote
- NÃO criar empresa/usuário real
- Mudança mínima e cirúrgica; não refatorar módulos

1) DIAGNOSTICAR
   - Confirmar quais prefixos R2 são usados para quê:
     grep -rn "BUCKET.put\|bucket.put" worker-airtrust/src/routes --include="*.ts" | grep -v __tests__
   - Mapear: logo → público; certificado/médico/doc → privado
   - Verificar se algum cliente frontend usa /api/assets/certificados/* diretamente
     (se sim, migrar para rota autenticada)

2) CORRIGIR (routes/assets.ts)
   - Estratégia A (mínima): adicionar allowlist de prefixos públicos
     const PUBLIC_PREFIXES = ['empresas/', 'logos/'];
     if (!PUBLIC_PREFIXES.some(p => key.startsWith(p))) {
       return c.json({ success: false, error: 'Não autorizado' }, 403);
     }
   - Estratégia B (ideal): mover logos para /api/public-assets (sem auth)
     e /api/assets continuar sendo privado/autenticado
   - Remover "Cache-Control: public" para assets potencialmente sensíveis
   - index.ts: retirar /api/assets/ da whitelist isPublicPath (ou restringir)

3) TESTAR
   - Teste novo: GET /api/assets/certificados/CERT-xxx.pdf → 403 (sem auth)
   - Teste novo: GET /api/assets/EXAME-ASO-xxx.pdf → 403 (sem auth)
   - Teste existente: GET /api/assets/empresas/1/logo.png → 200 (logo público OK)
   - Verificar que rotas autenticadas de download continuam funcionando
   - Rodar: npx tsc --noEmit && npm run build && npm run test:worker && npm run test:run

4) COMMITAR
   - git add nos arquivos alterados (sem -A)
   - fix(assets): restrict public asset serving to logo prefixes only
     Prevents unauthenticated access to certificates, medical exams and
     personal documents stored in R2 — LGPD Art.11 compliance.
     Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>

5) PUSHAR
   - Apenas com gates verdes: tsc, build, test:worker, test:run
   - NÃO deployar nesta tarefa — deploy na etapa seguinte autorizada

6) SMOKE
   - AIRTRUST_PUBLIC_ONLY=YES bash scripts/smoke-authenticated-operational.sh
   - Verificar: /api/assets/empresas/1/logo.png → 200 (logos ainda acessíveis)
   - Reportar: prefixos bloqueados, testes adicionados, nenhum cliente afetado
```

---

## Entrega final — respostas diretas

| # | Item | Resultado |
|---|---|---|
| 1 | Branch/HEAD auditados | `main` @ `5777d77` (== `origin/main`, 0/0) |
| 2 | Validações executadas | tsc exit 0 · build exit 0 · frontend 478 passed · worker 605 passed · preflight PASS · ops:guard PASS · smoke público PASS |
| 3 | Arquivo criado | `docs/AIRTRUST_OPUS_CUSTOMER_LAUNCH_READINESS_20260602.md` (untracked, não commitado) |
| 4 | Decisão | **B — pronto para PILOTO CONTROLADO com 1–3 empresas, com restrições** |
| 5 | Nota geral de prontidão | **3.2 / 5** |

### Top 5 bloqueios para primeira empresa real
1. **L1 — `/api/assets/*` público serve documentos sensíveis (médicos, certificados) sem auth** — risco LGPD Art.11
2. **L1 (legal) — Sem Termos de Uso / DPA assinado** — exigência legal pré-processamento de dados
3. **L1 (ops) — Smoke autenticado ponta-a-ponta nunca rodado** — sem validação funcional real
4. **L1 (ops) — Sem runbook de onboarding** — processo manual sem documentação
5. **L1 (LGPD) — Audit trail sem `empresa_id` + PII em `dados_antes/depois`** — trilha não tenant-scoped

### Top 5 ações imediatas
1. **Fechar `/api/assets`** — allowlist de prefixos públicos (logos only) ou mover docs para rota autenticada
2. **Redigir DPA + ToS** — pré-requisito legal; não tratar como "pode esperar"
3. **Rodar smoke autenticado** — fornecer token read-only e executar `smoke-authenticated-operational.sh`
4. **Escrever SOP de onboarding** — 2 páginas: create empresa → invite admin → config → smoke por tenant
5. **Adicionar `empresa_id` a `registrarAuditoria()`** — pequena mudança, alto impacto LGPD

### Módulos liberados para piloto
- Qualificações · Simuladores · Funcionários · Dashboard executivo · Escalas mensais (vigiar) · EVD · FRMS (vigiar) · Exportação/PDFs (**após fechar assets L1**)

### Módulos beta/ocultos (não mostrar ao cliente)
- Treinamentos planejados · SGSO · LMS/EAD · Hospedagem · Configurações (seções "em breve")

### Módulo bloqueado
- SIGVOOS (DDL runtime — exige migration explícita)

### Roteiro de demo recomendado
**15 minutos:** Dashboard → Qualificações → Simuladores → FRMS → Escalas  
**30 minutos:** adiciona importação, gestão de acessos, roadmap e Q&A  
**Dados mínimos:** 15–20 funcionários, 3–5 qualificações por person (mix status), 7–10 dias FRMS, 1 mês de escala

---

## Confirmação final

- ✅ Nenhum código alterado
- ✅ Nenhum commit
- ✅ Nenhum push
- ✅ Nenhum deploy
- ✅ Nenhuma migration executada
- ✅ Nenhum DB remoto tocado
- ✅ Nenhuma empresa real criada
- ✅ Nenhum usuário real criado
- ✅ Único artefato criado: este relatório markdown **untracked** em `docs/` (não commitado)

---

*Auditoria conduzida em modo read-only em 2026-06-02. Próxima ação recomendada: Prompt operacional §10 (fechar exposição `/api/assets`).*
