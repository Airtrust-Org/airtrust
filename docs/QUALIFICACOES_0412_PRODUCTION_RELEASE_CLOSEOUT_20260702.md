# Qualificações 0412 — Production Release Closeout

> **Data:** 2026-07-02
> **SHA executado:** `806f1fc5e6cb8df89ab664c23bf3b0fa00ccdd92`
> **Veredito:** `GO PÓS-RELEASE COM RESSALVAS`

---

## 1. PRs envolvidos

| PR | Título | Status |
|---|---|---|
| #226 | ops(staging): rebuild staging D1 from pre-0412 baseline + apply 0412 | Merged |
| #227 | ops(staging): add authenticated smoke path + staging D1 seed | Merged |
| #228 | fix(qualificacoes): resolve TDZ crash on historicoCategoriaId | Merged |
| #229 | docs: update production release checklist with safety guards | Merged |
| #230 | docs: fix canonical domain and add pre-window checks | Merged |
| #231 | docs: remove hardcoded SHAs from production checklist | Merged |

## 2. Snapshot pré-0412

| Atributo | Valor |
|---|---|
| R2 path | `airtrust-files/backups/production-pre-0412-20260702T151949Z.sql` |
| Hash | `dd39d52a11ccfa890de6e546f9d5f75ece547170666f7aea3b61f34248d1cbed` |
| Arquivo local | `./backups/production-pre-0412-20260702T151949Z.sql` (137 MB) |
| SHA256 | `./backups/production-pre-0412-20260702T151949Z.sql.sha256` |

## 3. Migration 0412

| Métrica | Valor |
|---|---|
| Queries executadas | 31 |
| Rows read | 36.768 |
| Rows written | 10.758 |
| Database size | 106,48 MB → 106,75 MB |
| `qualificacoes_formatos` ativos | 14 |
| `qualificacoes_tipos` com `formato_id` | 107 |
| `qualificacoes_historico` com `formato_id` | 1.617 |
| Erros | 0 |

## 4. Worker production

| Atributo | Valor |
|---|---|
| Version | `2026-07-02T15:24:08Z-806f1fc` |
| Environment | `production` |
| Health | `healthy` |
| Database | `ok` |
| Storage | `ok` |
| Domínio canônico | `https://api.airtrust.online/api` |

## 5. Pages production

| Atributo | Valor |
|---|---|
| Deploy URL | `https://2a00f3e9.airtrust.pages.dev` |
| Domínio canônico | `https://airtrust.online` |

## 6. Smoke público (sem autenticação)

| Endpoint | Resultado |
|---|---|
| `/api/health` | 200 ✅ |
| `/api/auth/me` | 401 ✅ |
| `/api/qualificacoes/formatos` | 401 ✅ |
| `/api/qualificacoes/tipos` | 401 ✅ |
| `/api/qualificacoes/historico` | 401 ✅ |
| `/api/lms/cursos` | 401 ✅ |

## 7. Smoke autenticado

| Endpoint | Resultado |
|---|---|
| Login (`admin@airtrust.com`) | 200, `ADMINISTRADOR` ✅ |
| `/api/auth/me` | 200 ✅ |
| `/api/qualificacoes/formatos` | 200, 7 registros ✅ |
| `/api/qualificacoes/tipos` | 200, success: True ✅ |
| `/api/qualificacoes/historico` | 200, success: True ✅ |
| `/api/lms/cursos` | 200, success: True ✅ |

## 8. Confirmações de escopo

| Item | Status |
|---|---|
| 🟢 Produção tocada somente na janela da 0412 | ✅ |
| 🟢 Nenhuma migration além da 0412 | ✅ |
| 🟢 Nenhum DML manual oportunista | ✅ |
| 🟢 Nenhuma refatoração | ✅ |
| 🟢 NOTECHS não tocado | ✅ |
| 🟢 Cópia produção→local não executada | ✅ |
| 🟢 Banco local não apagado | ✅ |
| 🟢 PR #168 intocado | ✅ |
| 🟢 Endpoint não canônico (`airtrust-api.airtrust.workers.dev`) não usado para decisão | ✅ |
| 🟢 Senha/token/JWT não impressos durante a janela | ✅ |

## 9. Ressalvas

### 9.1 Credencial admin exposta — não rotacionada

**Risco aceito por decisão do owner.**

A senha do usuário `admin@airtrust.com` foi exposta em texto claro no terminal durante a execução da janela. O owner decidiu **não rotacionar a senha** neste momento. Recomenda-se:
- Rotacionar a senha em uma janela de manutenção futura.
- Revogar sessões ativas, se houver.
- Auditar logs de acesso do usuário `admin@airtrust.com` desde 2026-07-02.

### 9.2 Ledger PRE/POST da 0412

**Não registrado no ledger.**

A migration 0412 foi aplicada diretamente via `wrangler d1 execute --file`, sem o mecanismo de ledger (seja via pipeline oficial ou via INSERT em `domain_events`). 

Recomendação opcional: registrar evento pós-fato no ledger:
```sql
INSERT INTO domain_events (empresa_id, modulo, tipo, payload)
VALUES (1, 'qualificacoes', 'MIGRATION_0412_POST',
        '{"sha":"806f1fc","status":"applied","snapshot_hash":"dd39d52a..."}');
```
**Não executar sem autorização explícita e confirmação separada.**

### 9.3 Próximos passos

Seguir o backlog em `AUDITORIA_REFATORACAO_CONTROLADA.md` após o release estabilizado:
1. Corrigir 6 erros TS2552 em `lms-matriculas.ts` (PR #3 do backlog)
2. Estabilizar testes quebrados do dashboard (PR #5)
3. Testes frontend LMS (PR #7)
4. Extrair `Qualificacoes.tsx` em submódulos (PR #1 — apenas após estabilização)
