# AIRTRUST LMS MANUTENÇÃO — PROGRESS RECOVERY & SCORM AUDIT 20260626

## Escopo desta fase

Continuação direta do relatório `AIRTRUST_SCORM_PACKAGE_AUDIT_20260625.md` e `AIRTRUST_LMS_MANUTENCAO_SCORM_SYSTEMIC_RELIABILITY_20260625.md`.

Esta fase cobre:

- Block 1: mapeamento do catálogo LMS de Manutenção via schema + SQL de descoberta
- Block 2: classificação de acesso ao R2 e instrução de exportação segura
- Block 3/4: auditoria dos pacotes reais (bloqueada por falta de acesso direto ao R2)
- Block 5: handoff para agente SCORM (ver `docs/scorm-agent-handoff/20260626/`)
- Block 6: plano técnico de recuperação de progresso dos alunos afetados
- Block 7: decisões finais da fase

Regras absolutas mantidas desta fase:

- Sem SQL de escrita em produção
- Sem migration aplicada
- Sem matrícula real alterada
- Sem qualificação gerada/renovada
- Sem pacote SCORM substituído em produção
- Sem PII exposto

---

## Block 1 — Catálogo LMS de Manutenção: mapeamento via schema

### Schema relevante

Os campos que identificam cada curso e seu pacote SCORM em produção:

```sql
SELECT
  c.id                              AS curso_id,
  c.titulo                          AS titulo,
  c.categoria,
  c.scorm_package_r2_prefix         AS r2_prefix,
  c.scorm_launch_file               AS launch_file,
  c.scorm_versao                    AS scorm_versao,
  c.version_tag,
  c.gerar_qualificacao_ao_concluir,
  c.qualificacao_tipo_id,
  qt.nome                           AS qualificacao_tipo_nome,
  qt.codigo                         AS qualificacao_tipo_codigo,
  c.ativo,
  c.publicado,
  c.created_at,
  c.updated_at
FROM lms_cursos c
LEFT JOIN qualificacoes_tipos qt ON qt.id = c.qualificacao_tipo_id AND qt.deleted_at IS NULL
WHERE c.empresa_id = ?              -- substituir pelo empresa_id real
  AND c.deleted_at IS NULL
  AND c.ativo = 1
  AND (
    c.titulo LIKE '%AW139%'
    OR c.titulo LIKE '%PT6%'
    OR c.titulo LIKE '%MGM%'
    OR c.titulo LIKE '%HUMS%'
    OR c.titulo LIKE '%SGSO%'
    OR c.titulo LIKE '%Integra%'
    OR c.titulo LIKE '%IIO%'
    OR c.titulo LIKE '%APRS%'
    OR c.titulo LIKE '%MCQ%'
    OR c.titulo LIKE '%MOM%'
    OR c.titulo LIKE '%Heliwise%'
    OR c.titulo LIKE '%Manutencao%'
    OR c.titulo LIKE '%Manutenção%'
  )
ORDER BY c.titulo ASC;
```

### R2 key pattern (derivado do código)

O prefixo R2 de cada curso é construído em `lms-cursos.ts:processScormUpload()`:

```
lms/scorm/{empresa_id}/{curso_id}/
```

O `scorm_launch_file` é o caminho relativo ao prefixo, ex:
```
index.html
scorm/launch.html
story.html
```

A URL completa de um arquivo é:
```
{r2_prefix}{scorm_launch_file}
```

Nunca exposta diretamente — o worker gera URLs assinadas via `GET /api/lms/cursos/:id/assets/*`.

### Matriz de cursos prioritários (a preencher com dados reais)

Para obter os dados reais, o administrador deve executar o SQL acima contra o banco de produção via:

```bash
npx wrangler d1 execute airtrust-db --env production --remote \
  --command "SELECT c.id, c.titulo, c.scorm_package_r2_prefix, c.scorm_launch_file, c.scorm_versao, c.version_tag, c.gerar_qualificacao_ao_concluir, qt.nome AS qual_tipo, c.publicado FROM lms_cursos c LEFT JOIN qualificacoes_tipos qt ON qt.id = c.qualificacao_tipo_id WHERE c.empresa_id = 6 AND c.deleted_at IS NULL AND c.ativo = 1 ORDER BY c.titulo ASC"
```

Matriz esperada:

| curso_id | curso | r2_prefix | launch_file | scorm_versao | version_tag | gera_qualificacao | status |
|---|---|---|---|---|---|---|---|
| (consultar) | AW139 - Manutenção | lms/scorm/6/{id}/ | (consultar) | 1.2 | (consultar) | ? | `REAL_PACKAGE_EXPORT_REQUIRED` |
| (consultar) | PT6C-67C / PT6 - Manutenção | lms/scorm/6/{id}/ | (consultar) | 1.2 | (consultar) | ? | `REAL_PACKAGE_EXPORT_REQUIRED` |
| (consultar) | MGM - Manual Geral de Manutenção | lms/scorm/6/{id}/ | (consultar) | 1.2 | (consultar) | ? | `REAL_PACKAGE_EXPORT_REQUIRED` |
| (consultar) | HUMS-VXP | lms/scorm/6/{id}/ | (consultar) | 1.2 | (consultar) | ? | `REAL_PACKAGE_EXPORT_REQUIRED` |
| (consultar) | SGSO para Manutenção | lms/scorm/6/{id}/ | (consultar) | 1.2 | (consultar) | ? | `REAL_PACKAGE_EXPORT_REQUIRED` |
| (consultar) | Integração Manutenção | lms/scorm/6/{id}/ | (consultar) | 1.2 | (consultar) | ? | `REAL_PACKAGE_EXPORT_REQUIRED` |
| (consultar) | Inspeção IIO & APRS | lms/scorm/6/{id}/ | (consultar) | 1.2 | (consultar) | ? | `REAL_PACKAGE_EXPORT_REQUIRED` |
| (consultar) | MCQ | lms/scorm/6/{id}/ | (consultar) | 1.2 | (consultar) | ? | `REAL_PACKAGE_EXPORT_REQUIRED` |
| (consultar) | MOM | lms/scorm/6/{id}/ | (consultar) | 1.2 | (consultar) | ? | `REAL_PACKAGE_EXPORT_REQUIRED` |
| (consultar) | HUMS | lms/scorm/6/{id}/ | (consultar) | 1.2 | (consultar) | ? | `REAL_PACKAGE_EXPORT_REQUIRED` |
| (consultar) | Heliwise | lms/scorm/6/{id}/ | (consultar) | 1.2 | (consultar) | ? | `REAL_PACKAGE_EXPORT_REQUIRED` |

Nota: empresa_id `6` é o valor assumido com base no contexto das fixtures existentes. Confirmar antes de executar.

---

## Block 2 — Exportar pacotes do R2 de forma segura

### Status de acesso

Este workspace não possui credenciais de acesso direto ao R2 de produção (`airtrust-storage`).
A exportação segura requer:

1. `CF_ACCOUNT_ID` e `CF_API_TOKEN` com permissão de leitura no bucket `airtrust-storage`
2. Esses valores devem estar em `worker-airtrust/.dev.vars` (arquivo ignorado pelo Git)

### Procedimento de exportação segura

Após obter acesso ao R2:

```bash
# Listar objetos do prefixo de um curso específico
npx wrangler r2 object list airtrust-storage \
  --prefix "lms/scorm/6/{curso_id}/" \
  --env production

# Baixar o .zip original (se ainda existir como objeto único)
# NOTA: o worker faz unzip e sobe arquivo a arquivo, então o .zip original
# pode não estar no R2 — apenas os arquivos extraídos.
```

Para exportar o pacote completo de um curso:

```bash
# Criar pasta local ignorada pelo Git
mkdir -p tmp/scorm-packages-audit/20260626/{curso_slug}

# Baixar todos os arquivos do curso
npx wrangler r2 object get airtrust-storage \
  "lms/scorm/6/{curso_id}/imsmanifest.xml" \
  --file tmp/scorm-packages-audit/20260626/{curso_slug}/imsmanifest.xml \
  --env production

# ... repetir para cada arquivo listado
```

Adicionar ao `.gitignore` antes de exportar:

```
tmp/scorm-packages-audit/
```

### Classificação atual

Como não há acesso ao R2 nesta fase:

```
REAL_PACKAGE_EXPORT_REQUIRED
```

Para todos os cursos de Manutenção listados no Block 1.

---

## Block 3 / Block 4 — Auditoria de pacotes reais

### Status

```
BLOCKED — REAL_PACKAGE_EXPORT_REQUIRED
```

Auditoria dos pacotes reais (verificação de `imsmanifest.xml`, launch file, sinais SCORM, slides vazios, etc.) está bloqueada até exportação do R2.

O script de auditoria local (`scripts/audit-scorm-maintenance-packages.mjs`) está pronto para executar contra os pacotes exportados após:

1. Exportar pacotes para `tmp/scorm-packages-audit/20260626/`
2. Apontar `packagesRoot` no script para essa pasta
3. Executar `node scripts/audit-scorm-maintenance-packages.mjs`

### AW139 — estado conhecido do harness (Block 4 parcial)

A partir do harness de teste local (`lms-matriculas-progress-integrity.test.ts`):

- Fixture de location usada: `380/380`
- Isso implica que o package real tem pelo menos 380 posições mapeadas
- Módulos 12, 13 e 14 com slides em branco: **não confirmados nem descartados** — exige pacote real
- Progressão até módulo 4, 6 e final: **não auditada** sem pacote real
- Quiz/finalização: **não auditada** sem pacote real

Classificação AW139 até que pacote seja exportado:

```
AW139_BLOCKED_REAL_PACKAGE_EXPORT_REQUIRED
```

---

## Block 6 — Recuperação de progresso dos alunos: plano técnico

### Mecanismo de auditoria persistente existente

A tabela `audit_logs` (migration `0332_create_audit_logs_compatible.sql`) já existe em produção com os campos:

```sql
user_id, action, entity_type, entity_id, old_values, new_values,
empresa_id, usuario_id, acao, detalhes, created_at
```

Este mecanismo é suficiente para registrar operações de restauração de progresso sem necessidade de nova migration, usando:

- `entity_type = 'LMS_PROGRESS_RESTORE'`
- `entity_id = matricula_id`
- `old_values = JSON com estado anterior`
- `new_values = JSON com estado proposto`
- `detalhes = JSON com { motivo, evidencia, operador, dry_run, aprovado_por }`

**Conclusão**: NENHUMA MIGRATION NOVA É NECESSÁRIA para a ferramenta de audit.

### Ferramenta de recuperação

Script criado: `scripts/restore-lms-progress-dry-run.mjs`

Este script:

- Lê os casos dos alunos afetados
- Classifica cada caso
- Produz um plano de restauração em formato JSON
- NÃO executa nenhuma escrita
- Requer revisão humana antes de qualquer ação real

### Classificação dos casos por aluno

#### Bruno Justino

| curso | status relatado | classificação | justificativa |
|---|---|---|---|
| HUMS-VXP | concluído | `MANUAL_COMPLETION_REQUIRES_APPROVAL` | Claim de conclusão; exige evidência SCORM (lesson_status=passed) ou aprovação explícita do gestor |
| MGM | concluído | `MANUAL_COMPLETION_REQUIRES_APPROVAL` | Idem |
| SGSO para Manutenção | concluído | `MANUAL_COMPLETION_REQUIRES_APPROVAL` | Idem |
| Integração Manutenção | concluído | `MANUAL_COMPLETION_REQUIRES_APPROVAL` | Idem |
| AW139 - Manutenção | até módulo 4 | `RESTORE_PROGRESS_ONLY` | Posição específica; restaurar `lesson_location` para módulo 4 sem concluir nem gerar qualificação |
| PT6C-67C | até módulo 2 | `RESTORE_PROGRESS_ONLY` | Idem, módulo 2 |

#### Alan Cortes

| curso | status relatado | classificação | justificativa |
|---|---|---|---|
| AW139 - Manutenção | passou módulo 6 e voltou (regressão) | `RESTORE_PROGRESS_ONLY` | Regressão confirmada; restaurar `lesson_location` para posição pós-módulo 6 sem concluir |

#### Francisco Altermir / Altemir

| curso | status relatado | classificação | justificativa |
|---|---|---|---|
| Inspeção IIO & APRS | concluído | `MANUAL_COMPLETION_REQUIRES_APPROVAL` | Claim de conclusão; exige evidência SCORM ou aprovação explícita |

#### Wagner Domas

| curso | status relatado | classificação | justificativa |
|---|---|---|---|
| AW139 - Manutenção | avançado / prova | `NEEDS_MORE_EVIDENCE` | "Avançado/prova" é vago; precisa de posição específica, número de tentativas ou score documentado |

### Regras de operação da ferramenta `RESTORE_PROGRESS_ONLY`

1. Repõe o aluno na posição informada/evidenciada
2. NÃO conclui o curso
3. NÃO gera qualificação
4. NÃO altera `score_raw` ou `score_final`
5. NÃO reduz progresso (usa `MAX` para `progresso_pct`)
6. Preserva estado anterior em `audit_logs.old_values`
7. Dry-run por padrão — exige flag `--apply` explícito para escrever
8. Registra operador, motivo e evidência em `audit_logs.detalhes`
9. Rollback: revertendo `audit_logs.old_values` para os campos afetados

### Campos afetados por tipo de operação

`RESTORE_PROGRESS_ONLY` (SCORM):

```sql
-- lms_progresso_scorm
UPDATE lms_progresso_scorm
SET lesson_status = 'incomplete',   -- nunca 'passed'/'completed'
    suspend_data  = ?,              -- posição serializada
    cmi_json      = ?               -- JSON CMI reconstruído
WHERE matricula_id = ? AND empresa_id = ?;

-- lms_matriculas
UPDATE lms_matriculas
SET progresso_pct = MAX(COALESCE(progresso_pct, 0), ?),  -- nunca regride
    status        = 'EM_ANDAMENTO'                        -- nunca 'CONCLUIDO'
WHERE id = ? AND empresa_id = ? AND status <> 'CONCLUIDO';

-- audit_logs
INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, empresa_id, detalhes)
VALUES (?, 'LMS_PROGRESS_RESTORE', 'lms_matriculas', ?, ?, ?, ?, ?);
```

`MANUAL_COMPLETION_REQUIRES_APPROVAL`:

Esta operação exige:
1. Aprovação explícita documentada do gestor/responsável pela empresa
2. Evidência anexada (print de tela, relato formal, certificado anterior)
3. Não implementada no dry-run automaticamente
4. Executar via `PATCH /api/lms/matriculas/:id/status` com `status=CONCLUIDO` e `observacoes` descritivas, após aprovação

---

## Block 7 — Decisões finais

| decisão | status |
|---|---|
| `REAL_PACKAGES LOCATED — AUDIT COMPLETE` | NÃO — pacotes não acessados diretamente |
| `REAL_PACKAGE_EXPORT_REQUIRED` | **SIM** — todos os cursos de Manutenção |
| `AW139_REPACKAGING_REQUIRED` | PENDENTE — bloqueado por exportação |
| `MAINTENANCE_PACKAGES_REPACKAGING_REQUIRED` | PENDENTE — bloqueado por exportação |
| `WRAPPER_CAN_COMPENSATE_FOR_SOME_PACKAGES` | PENDENTE — precisa de auditoria real |
| `PROGRESS_RECOVERY_TOOL_REQUIRES_MIGRATION` | NÃO — `audit_logs` existente é suficiente |
| `INCIDENT STILL OPEN` | **SIM** |

### Próximos passos obrigatórios

1. Executar SQL de descoberta (Block 1) em produção para preencher a matriz
2. Exportar pacotes SCORM reais do R2 para `tmp/scorm-packages-audit/20260626/`
3. Rodar `scripts/audit-scorm-maintenance-packages.mjs` contra os pacotes exportados
4. Revisar handoff para agente SCORM (`docs/scorm-agent-handoff/20260626/`)
5. Obter aprovação formal dos gestores para os casos `MANUAL_COMPLETION_REQUIRES_APPROVAL`
6. Executar `scripts/restore-lms-progress-dry-run.mjs` e revisar output antes de qualquer escrita
7. Não declarar incidente resolvido sem pacote real + teste real no player
