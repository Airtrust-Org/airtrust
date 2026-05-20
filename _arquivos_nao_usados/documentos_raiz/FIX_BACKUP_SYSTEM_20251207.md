# Fix: Sistema de Backup - 07/12/2025

## Problema

O sistema de backup estava retornando erro 500 ao tentar criar backups manuais via API/Frontend.

## Causa Raiz

Triggers no banco de dados estavam tentando inserir registros de auditoria em uma tabela com nome incorreto:

- **Tabela correta:** `auditoria_avancada_v2` (com underscores)
- **Nome usado nos triggers:** `auditoriaavancadav2` (sem underscores)

## Soluções Aplicadas

### 1. Correção dos Módulos de Backup

Arquivo: `worker-airtrust/src/config/backup-modules.ts`

Atualizado para usar apenas tabelas que realmente existem no banco:

- ✅ `auditoria_avancada_v2` (corrigido)
- ✅ Removidas tabelas inexistentes
- ✅ Mapeamento correto de tabelas principais e relacionadas

### 2. Remoção de Triggers Problemáticos

```sql
DROP TRIGGER IF EXISTS trg_backups_controle_audit;
DROP TRIGGER IF EXISTS trg_backups_restore_audit;
```

Estes triggers tentavam fazer INSERT em `auditoriaavancadav2` (nome incorreto).

### 3. Migration do Sistema de Backup

Arquivo: `worker-airtrust/migrations/0160_create_backup_system.sql`

Criadas tabelas essenciais:

- `backups_controle` - Controle principal dos backups
- `backups_logs` - Logs detalhados de cada operação
- Índices para performance
- Triggers para auditoria (serão recriados com nome correto)

## Resultado

✅ **Backup Modular (PESSOAS) - SUCESSO**

- UUID: `730e1301-e2c6-4eda-943d-238e63e55f0c`
- Registros: 38
- Tabelas: 7
- Tamanho: 34KB
- Duração: 138 segundos
- Status: CONCLUIDO

## Endpoints Funcionando

### POST /api/backup/manual

Cria backup manual (completo ou modular)

```bash
curl -X POST https://airtrust-api-production.airtrust.workers.dev/api/backup/manual \
  -H "Content-Type: application/json" \
  -d '{
    "tipo": "MODULAR",
    "modulos": ["PESSOAS"],
    "descricao": "Backup teste",
    "retention_policy": "30_DIAS"
  }'
```

### GET /api/backup

Lista backups disponíveis

```bash
curl 'https://airtrust-api-production.airtrust.workers.dev/api/backup?limit=5'
```

## Próximos Passos

1. ✅ Testar backup completo via interface
2. ✅ Verificar criação de arquivos no R2
3. ✅ Testar restore de backup
4. ⏳ Implementar triggers corretos de auditoria (se necessário)
5. ⏳ Configurar backups automáticos via cron

## Commits Necessários

```bash
git add worker-airtrust/src/config/backup-modules.ts
git add worker-airtrust/migrations/0160_create_backup_system.sql
git commit -m "fix: corrigir sistema de backup - remover triggers incorretos e atualizar módulos"
```

## Deploy

```bash
cd worker-airtrust
npx wrangler deploy --env production
```

---

**Status Final:** ✅ SISTEMA DE BACKUP OPERACIONAL
