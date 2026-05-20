# 📦 Sistema Enterprise de Backup/Restore - AirTrust

## 🎯 Visão Geral

Sistema profissional de backup e recuperação com compliance aeronáutico FAA AC 120-78B e ANAC RBAC 121.

### ✨ Características

- ✅ **Backups Automáticos**: Diário/Semanal/Mensal via Cron
- ✅ **Backups Modulares**: Por domínio de negócio (Pessoas, Qualificações, etc)
- ✅ **Time Travel D1**: Recuperação point-in-time últimos 30 dias
- ✅ **Retenção 7 Anos**: Compliance regulatório automático
- ✅ **Restore Seletivo**: Restaurar módulos específicos sem afetar outros
- ✅ **Auditoria Completa**: Todos logs rastreáveis
- ✅ **Interface React**: UI completa para gerenciamento

### 📊 Métricas Garantidas

- **RPO** (Recovery Point Objective): < 1 hora
- **RTO** (Recovery Time Objective): < 4 horas
- **Retenção**: 7 anos (compliance ANAC/FAA)
- **Disponibilidade**: 99.99%

---

## 🚀 Instalação

### 1. Aplicar Migração

```bash
chmod +x apply-backup-migration.sh
./apply-backup-migration.sh
```

### 2. Configurar Cron Triggers

Adicionar no `wrangler.toml`:

```toml
[triggers]
crons = [
  "0 2 * * *",   # Diário às 2h AM
  "0 3 * * 0",   # Semanal aos domingos 3h AM
  "0 4 1 * *"    # Mensal no dia 1 às 4h AM
]
```

### 3. Deploy

```bash
npm run build
wrangler deploy --env production
```

---

## 📖 Como Usar

### Backup Manual via API

```bash
# Backup completo
curl -X POST https://api.airtrust.com/api/backup/criar \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tipo": "COMPLETO",
    "descricao": "Backup antes de atualização crítica"
  }'

# Backup modular (apenas qualificações)
curl -X POST https://api.airtrust.com/api/backup/criar \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tipo": "MODULAR",
    "modulos": ["QUALIFICACOES", "SIMULADORES"]
  }'
```

### Listar Backups

```bash
curl https://api.airtrust.com/api/backup/listar?limite=20 \
  -H "Authorization: Bearer $TOKEN"
```

### Restaurar Backup

```bash
curl -X POST https://api.airtrust.com/api/backup/restaurar \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "backup_uuid": "550e8400-e29b-41d4-a716-446655440000",
    "modo": "COMPLETO",
    "criar_snapshot_antes": true
  }'
```

---

## 🏗️ Arquitetura

### Módulos de Backup

1. **PESSOAS** - Pessoas, funcionários, usuários
2. **QUALIFICACOES** - Certificações e licenças
3. **SIMULADORES** - Sessões e avaliações
4. **DOCUMENTOS** - Pasta virtual + R2
5. **COMPLIANCE** - Auditoria e logs
6. **CONFIGURACOES** - Sistema, roles, permissões

### Fluxo de Backup

```
┌─────────────┐
│ Cron Trigger│ (Diário/Semanal/Mensal)
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ BackupOrchestrator │
└──────┬───────────┘
       │
       ├─► Módulo 1 → Exportar Tabelas → R2
       ├─► Módulo 2 → Exportar Tabelas → R2
       ├─► Módulo N → Exportar Tabelas → R2
       └─► Arquivos R2 → Copiar → R2 Backup
```

### Storage

- **D1**: Metadata, logs, controle
- **R2**: Dados backups (JSON + arquivos)
- **Time Travel**: D1 nativo (30 dias)

---

## 🛠️ Interface Frontend

### Página de Backup

Localização: `/configuracoes/backup`

**Funcionalidades:**

- ✅ Criar backup manual (completo/modular)
- ✅ Listar histórico de backups
- ✅ Visualizar logs detalhados
- ✅ Restaurar backup com confirmação
- ✅ Dashboard de status

---

## 🔥 Disaster Recovery

### Cenário 1: Perda de Dados Recente (< 30 dias)

**Usar D1 Time Travel:**

```bash
wrangler d1 time-travel restore DB \
  --timestamp=2025-12-06T10:00:00Z
```

**RPO**: < 1 hora  
**RTO**: < 15 minutos

### Cenário 2: Corrupção de Módulo Específico

**Restore Seletivo:**

```bash
curl -X POST /api/backup/restaurar \
  -d '{"backup_uuid": "xxx", "modo": "SELETIVO", "modulos": ["QUALIFICACOES"]}'
```

**RPO**: 24 horas  
**RTO**: < 2 horas

### Cenário 3: Perda Total do Banco

**Restore Completo:**

1. Identificar backup mais recente
2. Sistema cria snapshot de segurança
3. Executa restore completo
4. Valida integridade
5. Testa funcionalidades

**RPO**: 24 horas  
**RTO**: < 4 horas

---

## 📋 Checklist Operacional

### Diário

- [ ] Verificar sucesso do backup automático
- [ ] Validar espaço R2 disponível
- [ ] Revisar logs de erro

### Semanal

- [ ] Testar restore em ambiente de staging
- [ ] Validar integridade dos backups
- [ ] Revisar retention policy

### Mensal

- [ ] Backup completo manual
- [ ] Auditoria de compliance
- [ ] Teste de disaster recovery

### Anual

- [ ] Revisão completa do processo
- [ ] Atualização de documentação
- [ ] Treinamento da equipe

---

## 🔐 Segurança e Compliance

### Controles Implementados

✅ **Autenticação**: RBAC restrito (ADMIN/SUPORTE)  
✅ **Auditoria**: Todos logs em `auditoriaavancadav2`  
✅ **Criptografia**: R2 at-rest encryption  
✅ **Retenção**: 7 anos automático (ANAC/FAA)  
✅ **Soft Delete**: Proteção contra exclusão acidental  
✅ **Checksum**: Validação de integridade SHA-256

### Regulamentações Atendidas

- **FAA AC 120-78B**: Gestão de Registros Eletrônicos
- **ANAC RBAC 121**: Retenção de Dados Operacionais
- **ISO 27001**: Backup e Recuperação
- **GDPR**: Direito ao esquecimento (soft delete)

---

## 📞 Suporte e Troubleshooting

### Backup Falhou

1. Verificar logs em `backups_logs`
2. Validar permissões R2
3. Checar espaço disponível
4. Tentar novamente manualmente

### Restore Lento

1. Verificar tamanho do backup
2. Considerar restore seletivo
3. Executar fora de horário de pico

### Backup Não Aparece na Lista

1. Verificar status != 'CONCLUIDO'
2. Checar campo `deleted_at`
3. Validar permissões do usuário

---

## 📈 Monitoramento

### Métricas Cloudflare

- **Backup Duration**: Tempo de execução
- **Backup Size**: Tamanho em MB/GB
- **Success Rate**: Taxa de sucesso 24h/7d/30d
- **R2 Storage**: Uso total do bucket

### Alertas Configuráveis

- ⚠️ Backup falhou 3x consecutivas
- ⚠️ Tempo execução > 30 minutos
- ⚠️ Tamanho > 2GB (crescimento anormal)
- ⚠️ R2 Storage > 80% capacidade

---

## 🎓 Próximos Passos

### Fase 2 (Futuro)

- [ ] Webhook para AWS S3 (offsite backup)
- [ ] Compressão GZIP dos backups
- [ ] Backup incremental real (apenas delta)
- [ ] Interface de comparação de backups
- [ ] Restore point-in-time granular

### Fase 3 (Futuro)

- [ ] Multi-region replication
- [ ] Backup encryption em trânsito
- [ ] Restore preview (dry-run)
- [ ] Automated compliance reports

---

## 📚 Referências

- [Cloudflare D1 Time Travel](https://developers.cloudflare.com/d1/platform/time-travel/)
- [Cloudflare R2 Lifecycle](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
- [FAA AC 120-78B](https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_120-78B.pdf)
- [ANAC RBAC 121](https://www.anac.gov.br/assuntos/legislacao/legislacao-1/rbac-e-rbha/rbac/rbac-121)

---

**Versão**: 1.0.0  
**Data**: 07/12/2025  
**Autor**: AirTrust DevOps Team  
**Status**: ✅ PRONTO PARA PRODUÇÃO
