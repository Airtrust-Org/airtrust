# Matriz V6.1 Costa do Sol — Release Safety Pack

> Status: READY_FOR_REVIEW | Data: 2026-07-04 | SHA alvo: `68bb987`

## Plano de Rollback

### Tabelas tocadas pelo apply

| Tabela | Operação |
|---|---|
| `manobras` | UPDATE `referencias_json` |
| `modelo_manobras` | INSERT/UPDATE relações modelo-manobra |
| `modelos` | Leitura (não escrita direta) |
| `fichas` | Leitura (não escrita direta) |

### Migration 0414

`0414_add_manobras_referencias_json.sql` adiciona a coluna `referencias_json TEXT` em `manobras`. Rollback:

```sql
-- Só se aplicável e autorizado
ALTER TABLE manobras DROP COLUMN referencias_json;
```

### Procedimento de rollback

#### 1. Backup pré-apply (Obrigatório)

```bash
# Export escopado das tabelas tocadas (read-only, sem DML)
npx wrangler d1 execute airtrust-db --env production --remote \
  --command "SELECT * FROM manobras;" > backup_manobras_$(date +%Y%m%d_%H%M%S).json

npx wrangler d1 execute airtrust-db --env production --remote \
  --command "SELECT * FROM modelo_manobras;" > backup_modelo_manobras_$(date +%Y%m%d_%H%M%S).json
```

#### 2. Checksums pré-apply

```sql
-- Contagens antes do apply
SELECT COUNT(*) as total_manobras FROM manobras;
SELECT COUNT(*) as total_modelo_manobras FROM modelo_manobras;
SELECT COUNT(*) as manobras_com_json FROM manobras WHERE referencias_json IS NOT NULL;
SELECT COUNT(DISTINCT modelo_id) as modelos_empresa_6
FROM modelo_empresa WHERE empresa_id = 6 AND deleted_at IS NULL;
```

#### 3. Script de rollback (se necessário)

```sql
-- Restaurar manobras.referencias_json para NULL nas linhas tocadas
-- Usar backup do passo 1

-- Remover relações modelo-manobra criadas pelo apply
-- Filtrar por empresa_id = 6 e códigos V6.1

-- Se 0414 foi aplicada neste deploy:
-- ALTER TABLE manobras DROP COLUMN referencias_json;
```

#### 4. Critérios de abort

- Backup pré-apply falhou ou não é verificável → **ABORTAR**
- Checksums pré-apply não batem com esperado → **ABORTAR**
- Dry-run remoto mostra divergência > 0 issues → **ABORTAR**
- Qualquer escrita em tabela não listada acima → **ABORTAR**

### Validação do rollback (local apenas)

```bash
# Testar rollback em development ou local, NUNCA em produção
bash scripts/sync-d1-production-sanitized.sh --target local --yes
node scripts/maintenance/apply-simuladores-matriz-v6-costa-do-sol.mjs --dry-run --empresa-id 6
# Aplicar
# Validar
# Rollback
# Validar novamente
```

---

## Runbook de Produção (NÃO EXECUTAR AGORA)

### Pré-condições

- [ ] Release Safety Pack aprovado e mergeado
- [ ] CI verde em `main`
- [ ] `origin/main` no SHA esperado
- [ ] Migration 0414 avaliada (aplicar se `referencias_json` não existir)

### Passo 1 — Freeze de SHA

```bash
git fetch origin main
EXPECTED_SHA=$(git rev-parse origin/main)
echo "EXPECTED_SHA=$EXPECTED_SHA"
```

### Passo 2 — Backup escopado

Executar comandos da seção "Backup pré-apply" acima. Guardar outputs.

### Passo 3 — Preflight read-only

```bash
# Health check
curl -s https://api.airtrust.online/api/health

# Verificar se manobras.referencias_json existe
# Se não existir, aplicar 0414 ANTES do apply da matriz
```

### Passo 4 — Migration 0414 (se necessária)

```bash
# Só se a coluna não existir
npx wrangler d1 execute airtrust-db --env production --remote \
  --file worker-airtrust/migrations/0414_add_manobras_referencias_json.sql
```

### Passo 5 — Dry-run remoto (se suportado sem escrita)

```bash
node scripts/maintenance/apply-simuladores-matriz-v6-costa-do-sol.mjs \
  --dry-run --empresa-id 6
```

Validar: `status: READY_FOR_REVIEW`, `validation_issues: []`, 49 modelos.

### Passo 6 — Apply remoto

```bash
node scripts/maintenance/apply-simuladores-matriz-v6-costa-do-sol.mjs \
  --empresa-id 6
```

### Passo 7 — Smoke pós-apply

```bash
# Health
curl -s https://api.airtrust.online/api/health

# Version
curl -s https://api.airtrust.online/api/version
```

### Passo 8 — Validação de contagens

- 49 modelos operacionais para empresa 6
- 882 linhas técnicas
- 15 NOTECHS globais
- TRE-INST e CRED-EXA não tocados

### Passo 9 — Validação de exemplos

- [ ] A139-S-01/02 termina com A139-EST-01 (não genérico)
- [ ] S76-REQ-01 sem CRM/COM/ATC genéricos
- [ ] NOTECHS globais fora das 18 técnicas
- [ ] TRE-INST/CRED-EXA não alterados

### Passo 10 — Rollback (se necessário)

Seguir procedimento da seção "Plano de Rollback".

### Passo 11 — Critérios GO/NO-GO

| Critério | GO | NO-GO |
|---|---|---|
| Backup verificável | Sim | Não |
| Dry-run 0 issues | Sim | Não |
| 49 modelos | Sim | Não |
| Smoke OK | Sim | Não |
| TRE-INST/CRED-EXA intactos | Sim | Não |

---

## Confirmações

- [x] Sem deploy executado
- [x] Sem DML remoto
- [x] Sem migration remota
- [x] Sem sync remoto SQL
- [x] Sem produção alterada
- [x] Sem Pack 2 iniciado
- [x] Sem PR #242 alterado
- [x] Sem dados sensíveis no diff
