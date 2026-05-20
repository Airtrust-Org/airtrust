# D1 Rollback Drill Report — AirTrust

## Data
- Data/hora: 2026-05-16
- Executado por: Claude Sonnet 4.6 (AirTrust System)
- Supervisionado por: Filipe Passaroni Daumas
- Produção alterada? **não**
- Dados commitados? **não**

---

## Objetivo

Verificar que o backup de produção D1 (76 MB, exportado em 2026-05-15) pode ser
restaurado com sucesso em um ambiente local isolado, garantindo que o procedimento
de rollback seria executável em caso de incidente.

---

## 1. Arquivo de Backup

| Campo | Valor |
|-------|-------|
| Caminho | `/Users/filipedaumas/AirTrust_Backups/production-d1/airtrust-db-production-20260515-1855.sql` |
| Localização | Fora do repositório (caminho externo ao repo) |
| Tamanho | 76 MB |
| Data de exportação | 2026-05-15 18:55 |
| Formato | SQL dump (DDL + dados) |

---

## 2. Verificação SHA256

| Campo | Valor |
|-------|-------|
| SHA256 esperado | `bb833c7f85d23f801cc69ee3f5db960271b0d99e0608b4b876f5e20fa243e6c5` |
| SHA256 calculado | `bb833c7f85d23f801cc69ee3f5db960271b0d99e0608b4b876f5e20fa243e6c5` |
| Resultado | **MATCH — backup verificado** |

---

## 3. SQLite3

| Campo | Valor |
|-------|-------|
| Versão | 3.51.0 (2025-06-12) |
| Disponível | sim |

---

## 4. Diretório temporário

| Campo | Valor |
|-------|-------|
| Caminho | `/tmp/airtrust-d1-rollback-drill/` |
| Dentro do repo? | **não** (temp filesystem externo) |

---

## 5. Restauração Local SQLite

| Campo | Valor |
|-------|-------|
| Comando | `sqlite3 /tmp/.../airtrust-restore-test.sqlite < backup.sql` |
| Exit code | **0** |
| Tamanho do DB restaurado | 56 MB |
| Tempo estimado | ~44 segundos |
| Temp DB removido após drill | **sim** |

---

## 6. Validação do Banco Restaurado

### Contagem total de tabelas

| Total de tabelas | 224 |
|-----------------|-----|

### Tabelas críticas

| Tabela | Status |
|--------|--------|
| usuarios | present |
| empresas | present |
| funcionarios | present |
| qualificacoes_historico | present |
| qualificacoes_tipos | present |
| simuladores | present |
| audit_logs | present |
| fichas_sessao | present |
| simulador_agendamentos | present |
| lms_cursos | present |

**Todas as tabelas críticas: PRESENTES**

### Contagens agregadas (sem PII)

| Tabela | Registros |
|--------|-----------|
| usuarios | 61 |
| empresas | 7 |
| funcionarios | 64 |
| qualificacoes_historico | 984 |
| qualificacoes_tipos | 95 |
| simuladores | 17 |
| audit_logs | 207 |
| fichas_sessao | 117 |
| simulador_agendamentos | 60 |
| lms_cursos | 14 |

### Integrity Check

```
ok
```

**Resultado: PASS**

---

## 7. D1 Remote Drill

Não executado. A restauração local em SQLite foi considerada suficiente para validar
a integridade e restaurabilidade do backup. Um drill remoto (criar D1 temporário via
`wrangler d1 create`) seria o próximo nível de validação, mas requer quota de D1 e
não foi necessário nesta iteração.

---

## 8. Verificação de segurança

- Nenhum arquivo `.sql`, `.sqlite`, `.db` ou `.dump` adicionado ao repositório neste drill
- Temp DB removido de `/tmp/` após validação
- Backup permanece em `/Users/filipedaumas/AirTrust_Backups/production-d1/` (fora do repo)
- Nenhum dado PII acessado individualmente (apenas contagens agregadas)

---

## 9. Conclusão

**ROLLBACK DRILL APROVADO**

O backup de produção de 76 MB (2026-05-15):
- SHA256 verificado: MATCH
- Restauração local: exit code 0
- 224 tabelas restauradas
- 10/10 tabelas críticas presentes
- Integrity check: ok

O procedimento de rollback D1 é **executável**. Em caso de incidente em produção,
o backup pode ser restaurado com sucesso.

---

## Evidências arquivadas

Todos os arquivos de evidência estão em `docs/d1-rollback-drill/`:

| Arquivo | Conteúdo |
|---------|----------|
| `backup-file-check.txt` | `ls -lh` do arquivo de backup |
| `backup-sha256-check.txt` | SHA256 calculado + resultado de verificação |
| `drill-temp-path.txt` | Caminho do diretório temporário |
| `sqlite-version.txt` | Versão do sqlite3 |
| `sqlite-restore-output.txt` | Output do comando de restauração |
| `sqlite-restore-exit-code.txt` | Exit code + tamanho do DB restaurado |
| `restored-table-count.txt` | Total de tabelas (224) |
| `restored-table-list.txt` | Lista completa de tabelas (sem dados) |
| `critical-tables-check.txt` | Verificação das 10 tabelas críticas |
| `critical-table-counts.txt` | Contagens agregadas (sem PII) |
| `sqlite-integrity-check.txt` | Resultado do PRAGMA integrity_check |
| `repo-db-dump-file-check.txt` | Scan de arquivos .sql/.sqlite/.db no repo |
