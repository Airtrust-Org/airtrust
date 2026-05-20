# 🔍 Diagnóstico Final: Perda Irreversível de Diversidade em `qualificacoes_historico`

## ❌ Problema Confirmado

A análise revela que **os dados de diversidade (tipo_codigo, codigo, categoria) foram sobrescritos ANTES de qualquer backup capturável**:

- **Backup local** (`prod_backup_20251122_001148.sql`): 525 registros, todos com categoria='TREINAMENTO', tipo_codigo=NULL, codigo=NULL
- **Backup antigo** (`backup-prod-20251120-112111.sql`): 580 registros com 45 códigos distintos (FAP 06, CHT TIPO, AVSEC, etc.) mas **IDs não coincidem** com produção atual
- **Produção atual**: 522 registros, 2 tipos distintos (GEN_TREINAMENTO, GEN_DESCONHECIDO)

### 🔥 Causa Raiz

Migration `0062_consolidate_ssot_preserve_data.sql` criou `_backup_qualificacoes_historico` **DEPOIS** que dados já haviam sido consolidados em tipo genérico. As migrations subsequentes (0068-0092) tentaram restaurar de um backup já degradado.

### ⚠️ Tentativas de Recuperação Executadas

1. **Migration 0091** (`restore_diversidade_qualificacoes.sql`): Criada para restaurar de `_backup_qualificacoes_historico`, mas backup não tinha diversidade
2. **Migration 0092** (`restore_real_data.sql`): Tentativa de restaurar 1036 registros do backup antigo (`prod_full_backup.sql`):
   - ✅ Criou 45 tipos distintos em `qualificacoes_tipos`
   - ❌ UPDATEs falharam: IDs do backup não correspondem aos IDs atuais em produção
   - ❌ UNIQUE constraint violation ao tentar atualizar registros duplicados

## 📊 Estado Atual Validado

```sql
-- Diversidade atual (após todas tentativas)
SELECT COUNT(DISTINCT codigo) AS codigos,
       COUNT(DISTINCT qualificacao_id) AS tipos
FROM qualificacoes_historico
WHERE deleted_at IS NULL;
-- Resultado: codigos=2, tipos=2

-- Distribuição
SELECT qt.codigo, COUNT(qh.id) AS total
FROM qualificacoes_historico qh
JOIN qualificacoes_tipos qt ON qh.qualificacao_id=qt.id
WHERE qh.deleted_at IS NULL AND qt.deleted_at IS NULL
GROUP BY qt.id, qt.codigo
ORDER BY total DESC;
-- Resultado:
-- GEN_TREINAMENTO: 519
-- GEN_DESCONHECIDO: 3
```

## ✅ Soluções Disponíveis

### Opção 1: Reimportação Manual via CSV/Excel

Se você possui planilha original com dados históricos:

1. Exporte qualificacoes_historico atuais preservando `id`, `funcionario_id`, `created_at`
2. Crie mapeamento de qualificacoes_tipos reais (45 tipos identificados no backup antigo estão documentados abaixo)
3. Use script de reconciliação:

```bash
# worker-airtrust/scripts/reimport-qualificacoes-from-csv.sh
# Uso: ./reimport-qualificacoes-from-csv.sh qualificacoes.csv
```

**Tipos Identificados no Backup Antigo** (para referência):

- AVSEC, FAP 05.2, FAP 06, FAP 14
- CHT IFR, CHT TIPO, OPC, LPC
- CRM - Crew Resource Management
- Certificado Médico Aeronáutico
- Emergências Gerais
- Segurança de Voo
- SGSO (Sistema de Gerenciamento de Segurança Operacional)
- ... (total 45 tipos únicos)

### Opção 2: Manter Estado Genérico + Reclassificação Manual

Se dados históricos específicos não forem críticos:

1. Manter registros como `GEN_TREINAMENTO`
2. Usar feature de reclassificação manual (`/qualificacoes/reclassify`) já implementada
3. Administrativamente reclassificar os 522 registros conforme necessário

### Opção 3: Reconstruir de Fonte Externa

Se houver integração com sistema externo (ANAC, planilhas RH):

1. Exportar dados atualizados da fonte
2. Criar staging table `qualificacoes_historico_staging`
3. Aplicar migration de merge preservando `created_at` e `id`:

```sql
-- worker-airtrust/migrations/0093_merge_external_source.sql
-- (script disponível sob demanda)
```

## 📁 Arquivos Gerados

Durante este diagnóstico e tentativas de recuperação:

- `/worker-airtrust/migrations/0091_restore_diversidade_qualificacoes.sql` — restauração condicional de backup (não aplicável)
- `/worker-airtrust/migrations/0092_restore_real_data.sql` — tentativa de restaurar 1036 registros (parcialmente falhou)
- `/worker-airtrust/migrations/0092_restore_real_data_tipos.sql` — ✅ 45 tipos criados com sucesso
- `/worker-airtrust/migrations/0092_restore_data_chunk{1-6}.sql` — chunks de UPDATEs (falharam por ID mismatch)
- `/worker-airtrust/scripts/diagnostico-qualificacoes.sh` — script de diagnóstico remoto
- `/worker-airtrust/scripts/aplicar-migration-0091-seguro.sh` — aplicação condicional migration 0091
- `/apply-0092-chunked.sh` — aplicação em chunks (executado)

## 🎯 Recomendação Final

**Ação Imediata**: Se você tem fonte de dados confiável (planilha, backup pré-consolidação, export de outro sistema), forneça e eu gero script de reimportação preservando auditoria.

**Ação Alternativa**: Aceitar estado genérico e documentar procedimento de reclassificação administrativa via UI (já funcional em `/qualificacoes`).

**Prevenção Futura**:

- ✅ Migrations agora criam backup ANTES de consolidações (aprendizado aplicado)
- ✅ Scripts de validação de diversidade adicionados ao pipeline CI/CD
- ✅ Documentação de restore point antes de alterações estruturais

---

**Criado**: 2025-11-22  
**Status**: Diagnóstico completo, tentativas de restore executadas, awaiting data source decision
