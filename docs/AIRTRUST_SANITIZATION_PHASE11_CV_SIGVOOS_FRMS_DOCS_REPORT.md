# AirTrust Sanitization Phase 11 — CV/SIGVOOS/FRMS Docs Report

> Data: 2026-06-14
> Executor: Claude Sonnet 4.6
> Branch: main (ahead 42 de origin/main — sem push)
> Estado inicial: `git rev-list --left-right --count origin/main...HEAD` → `0 / 42`

---

## Veredito

**DOCS CV/SIGVOOS COMMITADOS**

Os três documentos alvo foram revisados integralmente. Nenhuma sanitização de conteúdo foi necessária: os documentos já estão alinhados com todas as restrições da Fase 11. O commit seletivo foi criado com os quatro arquivos permitidos.

---

## Arquivos Revisados

| Arquivo | Estado | Alterado? |
|---|---|---|
| `docs/AUDITORIA_SIGVOOS_CONTROLE_VOOS_FRMS.md` | Auditoria técnica read-only | Não |
| `docs/DECISOES_FASE0_SIGVOOS_CONTROLE_VOOS_FRMS.md` | Decisões de fase 0, implementação bloqueada | Não |
| `docs/PLANO_MIGRACAO_SIGVOOS_PARA_CONTROLE_VOOS.md` | Plano de migração faseado, nenhuma fase iniciada | Não |
| `docs/AIRTRUST_SANITIZATION_PHASE11_CV_SIGVOOS_FRMS_DOCS_REPORT.md` | Este relatório | Criado |

---

## Checklist de Restrições — Por Documento

### AUDITORIA_SIGVOOS_CONTROLE_VOOS_FRMS.md

| Restrição | Status | Evidência |
|---|---|---|
| Controle de Voos N1 = operacional interno, não regulado | PASS | Seção 9: CV N1 existe com schema completo mas sem ponte FRMS/SIGVOOS |
| Não substitui SIGVOOS | PASS | Header: "Status: READ-ONLY / Nenhuma alteração de código foi feita" |
| Não substitui APUS, Diário de Bordo, eDB, SDRMe | PASS | Não mencionados como substituídos |
| Não alimenta FRMS como fonte canônica ainda | PASS | Seção 9 lista explicitamente "O que NÃO existe" (importador, adaptador, bridge) |
| SIGVOOS = fluxo atual até shadow mode aprovado | PASS | Seção 20-21 detalha shadow mode como pré-requisito obrigatório |
| Menções ANAC = preparação futura sem homologação | PASS | Nenhuma menção a ANAC, homologação ou certificação |
| 0411 = design/decisão futura, não implementada | PASS | 0411 não é mencionado neste documento |
| cv_voo_etapas = futura, não aplicada | PASS | cv_voo_etapas não é mencionada neste documento |
| sigvoos_flight_report_id nullable e índice parcial = decisão futura | PASS | Não mencionado neste documento |
| Sem credenciais, tokens, endpoints reais | PASS | `{base_url}` é placeholder; `MAINTENANCE_SECRET` é variável, sem valor exposto |
| Sem instruções executáveis perigosas de produção | PASS | SQL nos blocos 17.x é proposta conceitual, sem referência a wrangler/remoto/produção |

### DECISOES_FASE0_SIGVOOS_CONTROLE_VOOS_FRMS.md

| Restrição | Status | Evidência |
|---|---|---|
| Implementação bloqueada claramente | PASS | Header: "IMPLEMENTAÇÃO BLOQUEADA ATÉ CONFIRMAÇÃO DO ID SIGVOOS" |
| CV = fonte canônica do FRMS = futuro ("após a virada") | PASS | Seção 1: "Na virada, a política deve trocar de SIGVOOS para CONTROLE_VOOS" |
| SIGVOOS = canônico durante shadow mode | PASS | Seção 6: "o fluxo antigo continua sendo a referência operacional" |
| Não substitui SIGVOOS como sistema externo | PASS | SIGVOOS mantido como origem de importação; deprecação é do path direto, não do sistema |
| migration 0410 referenciada corretamente | PASS | Referência a `migrations/0410_controle_voos_n1_schema.sql` (migration existente) |
| 0411 = não mencionado | PASS | Nenhuma referência a 0411 |
| Tabelas futuras marcadas como conceituais | PASS | Seção 5: "Esta seção é conceitual. Não autoriza migration." |
| Sem staging ativo ou produção | PASS | Nenhum comando executável |

### PLANO_MIGRACAO_SIGVOOS_PARA_CONTROLE_VOOS.md

| Restrição | Status | Evidência |
|---|---|---|
| Fase 0 bloqueia implementação | PASS | "Critério de saída: todas as 10 decisões da auditoria documentadas e aprovadas" |
| SQL DDL = proposta de planejamento, não migration aplicada | PASS | Contexto dentro de fase futura com duração estimada e critérios de aceite |
| Shadow mode = gate obrigatório para Fase 5 | PASS | "7 dias consecutivos com divergência < 0.5%" como critério mínimo |
| SIGVOOS path mantido até descomissionamento aprovado | PASS | Fase 6 é pós-estabilidade, com "Arquivar como função legada (não deletar imediatamente)" |
| Sem comandos wrangler/D1 remoto/produção | PASS | Nenhum comando executável referenciado |
| Rollback descrito para cada fase | PASS | Seção de rollback presente em Fases 1, 2, 3 e Rollback Geral |

---

## Riscos Encontrados

### R1 — Documentação de vulnerabilidade de rota de manutenção (baixo risco de commit)

**Localização:** AUDITORIA seção 14.1 e 15  
**Descrição:** O documento audita a rota `POST /api/integracoes/sigvoos/maintenance/sincronizar-frms` e identifica que `empresaId` vem do corpo sem validação de tenant, e que a rota está fora do middleware de autenticação global.  
**Avaliação:** Apropriado para documento de auditoria interna. Não expõe credentials, secret values ou vetores de ataque além do que já é visível no repositório. O documento documenta o risco, não o explora.  
**Ação:** Nenhuma. Manter como está.

### R2 — Proposta de origem `CONTROLE_VOOS` no FRMS

**Localização:** DECISOES seção 1 (Opção B aprovada), PLANO seção 2 e Fase 5  
**Descrição:** Os documentos declaram que a arquitetura-alvo usará `CONTROLE_VOOS` como origem canônica do FRMS. Essa origem ainda não existe no schema (`frms_jornada.origem` CHECK constraint não inclui `CONTROLE_VOOS`).  
**Avaliação:** Correto como decisão arquitetural futura. Os documentos nunca declaram que essa origem já existe ou que CV já alimenta o FRMS. A transição exige migration futura e shadow mode aprovado.  
**Ação:** Nenhuma. Decisão de planejamento válida.

### R3 — SQL DDL inline no PLANO_MIGRACAO

**Localização:** PLANO_MIGRACAO seções Fase 1 (1A, 1B, 1C)  
**Descrição:** O documento contém blocos SQL com `ALTER TABLE` e `CREATE TABLE`. Esses blocos são claramente contextualizados como propostas de migration futura com "Duração estimada: 3-5 dias", critérios de aceite e estratégia de rollback.  
**Avaliação:** Planejamento técnico apropriado. Nenhuma execução imediata autorizada. Não referenciam wrangler, ambientes remotos ou produção.  
**Ação:** Nenhuma.

---

## Alterações Feitas

**Nenhuma alteração de conteúdo foi feita nos três documentos alvo.**

Os documentos já atendiam a todas as restrições da Fase 11 conforme lidos. O único arquivo criado foi este relatório.

---

## Validações Executadas

| Validação | Comando | Resultado |
|---|---|---|
| Trailing whitespace / markers | `git diff --check` | PASS |
| TypeScript | `npx tsc --noEmit --pretty false` | PASS (exit 0) |
| Secrets guard | `bash scripts/check-tracked-secrets.sh` | PASS — `[tracked-secrets] OK` |
| Deploy scripts audit | `bash scripts/validation/audit-deploy-scripts.sh` | PASS — `deploy-worker-safe sem comandos proibidos` |
| Dangerous ops audit | `bash scripts/audit-dangerous-ops.sh` | PASS — `RESULT: PASS` (1 warning pré-existente em sync scripts, não relacionado) |

---

## Confirmações de Escopo

- **Push:** NÃO realizado
- **Deploy:** NÃO realizado
- **Migrations aplicadas:** NENHUMA
- **Staging tocado:** NÃO
- **Produção tocada:** NÃO
- **D1 remoto / Cloudflare / R2 / secrets:** NÃO tocados
- **Código de Controle de Voos / SIGVOOS / FRMS / RBAC:** NÃO alterado
- **Regulated records / LMS / assets / branding:** NÃO incluídos
- **Scripts / workflows:** NÃO alterados
- **`git add .` / `git add -A`:** NÃO usados

---

## Staged Files (pré-commit)

```
docs/AUDITORIA_SIGVOOS_CONTROLE_VOOS_FRMS.md
docs/DECISOES_FASE0_SIGVOOS_CONTROLE_VOOS_FRMS.md
docs/PLANO_MIGRACAO_SIGVOOS_PARA_CONTROLE_VOOS.md
docs/AIRTRUST_SANITIZATION_PHASE11_CV_SIGVOOS_FRMS_DOCS_REPORT.md
```

Nenhum arquivo fora desta lista entrou no staging.

---

## Commit Criado

Mensagem: `docs: sanitize controle voos sigvoos frms planning docs`

---

## Itens que Exigem Fase Técnica Futura com Codex 5.5

### T1 — Migration 0411: staging raw SIGVOOS + rastreabilidade cv_voos

Requer: schema design final aprovado, confirmação de ID estável do SIGVOOS, decisions da Fase 0 formalmente encerradas pelo time.  
Arquivos afetados: `worker-airtrust/migrations/` (nova migration aditiva), `worker-airtrust/src/routes/controle-voos.ts`.

### T2 — Importador SIGVOOS → CV (`sigvoos-cv-importer.ts`)

Requer: T1 aplicado localmente, payload real do SIGVOOS para testes de idempotência, mapeamento de aeroportos `cv_aeroportos`.

### T3 — Adaptador CV → FRMS (`cv-frms-adapter.ts`)

Requer: T2 funcional em paralelo, decisão sobre `origem='CONTROLE_VOOS'` vs alias `SIGVOOS`, expansão do CHECK em `frms_jornada.origem`.

### T4 — Shadow mode e endpoint de comparação

Requer: T2 e T3 operacionais, dados de 7 dias consecutivos, validação da equipe operacional.

### T5 — Segurança da rota de manutenção SIGVOOS

Requer: validação de `empresaId` no body + rejeição se empresa não tiver SIGVOOS configurado. Documentado em AUDITORIA seção 14.1.

### T6 — Expansão da source policy do FRMS

Requer: migration futura aceitando `CONTROLE_VOOS` em `frms_jornada.origem`, atualização de `frms-source-policy.ts`, `types.ts`, queries de alertas/rolling/acumulados. Lista completa em DECISOES seção 1 tabela de pontos afetados.

---

## Recomendação para Regulated Records Experimental

Os arquivos de regulated records (migration experimental 0410, service `governance-evidence-service.ts`, testes em `__tests__/lib/`, `__tests__/migrations/regulated-records-core-experimental.test.ts`, e docs `REGULATED_RECORDS_CORE_*.md`, `GOVERNANCE_EVIDENCE_RECORD_VERTICAL_SLICE.md`) devem ser tratados em fase própria dedicada.

**Recomendação objetiva:**

1. **Não commitar regulated records nesta fase** — o escopo é exclusivamente docs CV/SIGVOOS/FRMS.
2. **Regulated records experimental** merece fase isolada com revisão específica do design vertical slice, da migration experimental 0410 (que deve permanecer em `migrations_experimental/` e nunca entrar em `migrations/`), e dos testes de smoke.
3. **GOVERNANCE_EVIDENCE_RECORD_VERTICAL_SLICE.md** deve ser avaliado separadamente: verificar se faz afirmações de sistema regulado ou apenas documenta o slice conceitual.
4. **Condição de commit de regulated records:** nenhum dado real, nenhuma instrução de execução em produção/staging, nenhuma promessa de homologação ANAC.
