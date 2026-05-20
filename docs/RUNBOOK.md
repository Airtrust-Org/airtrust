# Runbook Operacional - AirTrust Production

**Última Atualização:** 10 de Novembro de 2025  
**Status:** ✅ ACTIVE  
**Environment:** Production  
**On-Call:** Available 24/7

---

## 📋 ÍNDICE

1. [Troubleshooting](#troubleshooting)
2. [Rollback Procedure](#rollback-procedure)
3. [SLOs & Metrics](#slos--metrics)
4. [Manutenção Regular](#manutenção-regular)
5. [Emergency Contacts](#emergency-contacts)

---

## 🚨 TROUBLESHOOTING

### 1. Sistema Fora do Ar (Status Check Failed)

**Sintoma:** `/health` retorna 5xx ou timeout (> 30s)

**Diagnóstico Imediato:**

```bash
# 1. Verificar status do Worker
wrangler tail --env production | head -20

# 2. Verificar status página Cloudflare
# https://www.cloudflarestatus.com/

# 3. Verificar se é problema local
curl -v https://airtrust.workers.dev/api/v2/system/health

# 4. Verificar D1 database
wrangler d1 execute airtrust-db-production --command "SELECT 1"

# 5. Verificar R2 bucket
wrangler r2 bucket list
```

**Checklist de Investigação:**

- [ ] Worker deployment status OK?
- [ ] D1 database responsive?
- [ ] R2 bucket accessible?
- [ ] Recent code changes?
- [ ] Error logs show what failed?

**Soluções Possíveis:**

**Opção A: Problema no Worker**

```bash
# 1. Verificar logs
wrangler tail --env production

# 2. Se erro no código recente
# → Fazer rollback (ver seção Rollback Procedure)

# 3. Se problema conhecido
# → Check Cloudflare status page
```

**Opção B: Problema no Database**

```bash
# 1. Verificar quota
wrangler d1 info airtrust-db-production

# 2. Se quota excedida
# → Aumentar quota no dashboard

# 3. Se database corrupto
# → Restaurar de backup (ver Rollback Procedure)
```

**Opção C: Problema no R2**

```bash
# 1. Verificar status
wrangler r2 bucket info airtrust-production

# 2. Se quota excedida
# → Aumentar quota ou deletar uploads antigos

# 3. Se problema de permissão
# → Verificar CORS no dashboard
```

**Escalation:**

- 0-5 min: On-call engineer
- 5-15 min: Senior engineer
- 15+ min: CTO + Management

---

### 2. Performance Degradada (P95 Latency > 500ms)

**Sintoma:** Requests lentos (> 500ms), usuários reclamam

**Diagnóstico:**

```bash
# 1. Verificar latência atual
wrangler tail --env production | grep "cpu_time"

# 2. Verificar query performance
wrangler d1 execute airtrust-db-production --command "
  SELECT name, time_taken
  FROM sqlite_stat
  WHERE time_taken > 1000
  ORDER BY time_taken DESC
"

# 3. Verificar CPU/Memory
# Dashboard → Workers → airtrust-production → Metrics
```

**Checklist de Investigação:**

- [ ] Query performance OK?
- [ ] Índices aplicados?
- [ ] N+1 queries?
- [ ] Cache funcionando?
- [ ] Recent code changes?

**Soluções Possíveis:**

**Opção A: Slow Queries**

```bash
# 1. Identificar slow query
wrangler tail --env production | grep "Query took"

# 2. Executar EXPLAIN
wrangler d1 execute airtrust-db-production \
  --command "EXPLAIN QUERY PLAN SELECT * FROM funcionarios"

# 3. Adicionar índice se necessário
wrangler d1 execute airtrust-db-production \
  --command "CREATE INDEX IF NOT EXISTS idx_status
            ON funcionarios(status)"

# 4. Verificar performance após índice
wrangler tail --env production | grep "Query took"
```

**Opção B: N+1 Queries**

```bash
# 1. Verificar logs para padrão
wrangler tail --env production | grep -c "SELECT"

# 2. Se muitos SELECTs
# → Refatorar para usar JOINs
# → Implementar query batching

# 3. Verificar após refatoração
wrangler tail --env production | grep "SELECT" | wc -l
```

**Opção C: Cache não funciona**

```bash
# 1. Verificar cache headers
curl -I https://airtrust.workers.dev/api/v2/funcionarios
# Deve ter: cache-control: public, max-age=300

# 2. Se não tiver, verificar código
# → Adicionar Cache-Control header

# 3. Revalidar após fix
curl -I https://airtrust.workers.dev/api/v2/funcionarios
```

**Tempo de Resolução:** 30-60 minutos

---

### 3. Rate Limiting Excessivo (429 Responses > 100/min)

**Sintoma:** Muitos clientes recebem HTTP 429, possível DDoS

**Diagnóstico Imediato:**

```bash
# 1. Verificar IPs com mais requests
wrangler tail --env production | grep "429" | head -20

# 2. Analisar padrão
wrangler tail --env production | grep "429" | \
  awk '{print $NF}' | sort | uniq -c | sort -rn

# 3. Verificar Cloudflare Analytics
# https://dash.cloudflare.com/ → Security → Events

# 4. Verificar se é ataque
# Analytics → Insights → Top IPs
```

**Checklist de Investigação:**

- [ ] Único IP ou múltiplos?
- [ ] Padrão de requests (bot/crawler)?
- [ ] Horário do ataque (offtime suspicious)?
- [ ] Correlação com eventos (marketing launch)?
- [ ] Conhecidos clientes doing bulk operations?

**Soluções Possíveis:**

**Opção A: Uso Legítimo (Spike esperado)**

```bash
# 1. Aumentar rate limit temporariamente
# Editar: src/worker/middleware/rate-limit.ts

# Alterar de:
export const apiRateLimit = rateLimit({
  max: 100,
  window: 60 * 1000,
});

# Para:
export const apiRateLimit = rateLimit({
  max: 200, // Aumentado temporariamente
  window: 60 * 1000,
});

# 2. Deploy com limite aumentado
npm run build && wrangler deploy --env production

# 3. Reverter após spike passar
# Cria novo commit com limite original

# 4. Notificar clientes afetados
```

**Opção B: Ataque DDoS ou Abuse**

```bash
# 1. Ativar Cloudflare DDoS protection
# Dashboard → Security → DDoS

# 2. Adicionar IP à block list
# Dashboard → Security → Blocked IPs
# Add: 192.0.2.123 (exemplo)

# 3. Aumentar challenge level
# Dashboard → Security Level → High/I'm Under Attack

# 4. Monitorar por 5-10 minutos
wrangler tail --env production

# 5. Reverter quando normalizar
```

**Opção C: Rate Limit Muito Restritivo**

```bash
# 1. Revisar limite configurado
# Arquivo: src/worker/middleware/rate-limit.ts

# 2. Avaliar se limite é apropriado
# Limite atual: 100 req/min = 1.67 req/s

# 3. Se necessário, aumentar permanentemente
# Alternar valor de 100 para 200 (ou calculado)

# 4. Documentar mudança
# Adicionar ao CHANGELOG.md
```

**Tempo de Resolução:** 15-30 minutos

---

### 4. Database Error (D1 não responde)

**Sintoma:** `Error: Database connection failed`

**Diagnóstico:**

```bash
# 1. Verificar status D1
wrangler d1 list

# 2. Tentar query simples
wrangler d1 execute airtrust-db-production --command "SELECT 1"

# 3. Verificar quota
wrangler d1 info airtrust-db-production | grep quota

# 4. Verificar recentes changes
git log --oneline -10 -- "src/db/"
```

**Soluções:**

**Opção A: Database Timeout**

```bash
# Aumentar timeout nos handlers
# Arquivo: src/worker/middleware/database.ts

const result = await db.execute(query, {
  timeout: 30 * 1000  // Aumentar de 10s para 30s
});
```

**Opção B: Quota Excedida**

```bash
# 1. Verificar quota
wrangler d1 info airtrust-db-production

# 2. Aumentar no dashboard
# Cloudflare > D1 > airtrust-db-production > Upgrade

# 3. Limpar dados antigos (se necessário)
wrangler d1 execute airtrust-db-production --command "
  DELETE FROM agendamentos
  WHERE created_at < datetime('now', '-1 year')
"
```

**Opção C: Connection Pool Esgotada**

```bash
# 1. Verificar concurrent connections
wrangler tail --env production | grep "pool" | head -10

# 2. Aumentar pool size
# Arquivo: src/worker/db/config.ts
// max_connections: 25 (aumentar se necessário)

# 3. Implementar connection timeout/cleanup
```

**Tempo de Resolução:** 20-45 minutos

---

## 🔄 ROLLBACK PROCEDURE

### Rollback Rápido (< 5 minutos)

**Quando Usar:**

- Erro crítico em produção
- Feature quebrada detectada imediatamente
- Dados corrompidos

**Procedimento:**

```bash
# 1. Identify last working version
git log --oneline -10 | head -5

# Output:
# 8fb2d1a (HEAD) fix: rate-limit middleware
# f3d1533 docs: Fase 4 Complete
# ec55348 feat(quality): Fase 4 Complete ← Última versão estável

# 2. Checkout previous version
git checkout ec55348

# 3. Deploy previous version
wrangler deploy --env production

# 4. Verify with smoke tests
./scripts/smoke-tests.sh https://airtrust.workers.dev

# 5. If OK, tag as emergency rollback
git tag -a emergency-rollback-$(date +%Y%m%d-%H%M%S) \
  -m "Emergency rollback due to issue in 8fb2d1a"

# 6. Notify team
# → Post in #airtrust-alerts
# → Email ops-team@example.com
# → Update incident in PagerDuty

# 7. Investigate root cause
# → Check diff between commits
git diff ec55348 8fb2d1a

# 8. Create fix
# → Fix issue in new branch
git checkout -b fix/issue-name

# 9. Test and deploy fix
npm run build && npm test
git commit -m "fix: resolve issue from rollback"
wrangler deploy --env production

# 10. Verify again
./scripts/smoke-tests.sh https://airtrust.workers.dev
```

---

### Rollback Completo (Com Database Restoration)

**Quando Usar:**

- Data corruption
- Bad migration applied
- Security incident

**Procedimento:**

```bash
# 1. Stop all writes (maintenance mode)
wrangler d1 execute airtrust-db-production \
  --command "UPDATE system_flags SET maintenance_mode = 1"

# 2. Backup current state
wrangler d1 execute airtrust-db-production \
  --command ".mode csv
            .output backup_before_rollback.csv
            .headers on
            SELECT * FROM funcionarios LIMIT 100"

mkdir -p backups/emergency/$(date +%Y%m%d)
mv backup_before_rollback.csv backups/emergency/$(date +%Y%m%d)/

# 3. Restore from backup
# Restaurar arquivo de backup:
wrangler d1 execute airtrust-db-production \
  --file backups/20251110/pre_deploy_backup.sql

# 4. Restore code
git checkout v1.0.0-pre-deploy
wrangler deploy --env production

# 5. Verify data integrity
./scripts/smoke-tests.sh https://airtrust.workers.dev

# 6. Exit maintenance mode
wrangler d1 execute airtrust-db-production \
  --command "UPDATE system_flags SET maintenance_mode = 0"

# 7. Notify team and investigate
```

---

## 📊 SLOs & METRICS

### Service Level Objectives

| Métrica           | Target  | Window     | Consequence             |
| ----------------- | ------- | ---------- | ----------------------- |
| **Uptime**        | 99.9%   | Monthly    | Max 43.2 min downtime   |
| **P95 Latency**   | < 500ms | Monthly    | Investigate if exceeded |
| **Error Rate**    | < 0.1%  | Hourly     | Alert at > 1%           |
| **Build Success** | 100%    | Per deploy | Block deploy if fails   |

### Monitoramento Diário

**Morning (08:00 UTC):**

```bash
# [ ] Verificar dashboard Cloudflare
# [ ] Checar erro rate from past 24h
# [ ] Revisar logs de security events
# [ ] Check uptime status page
```

**Afternoon (14:00 UTC):**

```bash
# [ ] Revisar performance trends
# [ ] Check database size growth
# [ ] Analyze API usage patterns
# [ ] Update on-call status
```

**Evening (20:00 UTC):**

```bash
# [ ] Fazer validação de backups
# [ ] Revisar security logs
# [ ] Check for scheduled tasks success
# [ ] Prepare next shift handoff
```

---

## 🔧 MANUTENÇÃO REGULAR

### Semanal

- [ ] Atualizar dependências minor/patch

  ```bash
  npm update
  npm audit
  npm run build && npm test
  ```

- [ ] Revisar performance trends

  - P95 latency trend
  - Error rate trend
  - Database size growth

- [ ] Backup manual do banco

  ```bash
  wrangler d1 execute airtrust-db-production \
    --command ".dump" > backup_weekly_$(date +%Y%m%d).sql
  ```

- [ ] Review security logs
  - Failed login attempts
  - Rate limit violations
  - CORS violations

### Mensal

- [ ] Atualizar dependências major (em staging first)

  ```bash
  npm install -g npm-check-updates
  ncu -u
  npm install
  npm run build && npm test
  # Deploy to staging first!
  wrangler deploy --env staging
  ./scripts/smoke-tests.sh https://airtrust-staging.workers.dev
  # Then production
  wrangler deploy --env production
  ```

- [ ] Revisar e otimizar queries lentas

  ```bash
  wrangler tail --env production | grep "took >" | head -20
  # For each slow query:
  # - Check EXPLAIN PLAN
  # - Verify indices
  # - Consider caching
  ```

- [ ] Análise de usage patterns

  - Top endpoints
  - Busiest hours
  - Unused endpoints
  - Geographic distribution

- [ ] Revisão de segurança
  - Audit logs review
  - Failed auth attempts
  - Permission changes
  - Secret rotation

### Trimestral

- [ ] Load testing

  ```bash
  # Usar ferramentas: k6, Apache JMeter
  npm install -g k6
  k6 run load-tests.js --vus 100 --duration 5m
  ```

- [ ] Disaster recovery drill

  ```bash
  # 1. Praticar rollback completo
  # 2. Praticar database restoration
  # 3. Time todos os passos
  # 4. Documento lessons learned
  ```

- [ ] Revisão completa de documentação

  - Update this runbook
  - Check checklist accuracy
  - Verify contact information
  - Test all procedures

- [ ] Backup audit
  - Verify backup integrity
  - Test restore procedure
  - Document size/timing

---

## 📞 EMERGENCY CONTACTS

### On-Call Escalation

| Level | Role             | Name        | Email                 | Slack        | Phone             |
| ----- | ---------------- | ----------- | --------------------- | ------------ | ----------------- |
| L1    | On-Call Engineer | DevOps Lead | ops@company.com       | @devops-lead | +55 11 9XXXX-XXXX |
| L2    | Senior Engineer  | Tech Lead   | tech-lead@company.com | @tech-lead   | +55 11 9YYYY-YYYY |
| L3    | CTO              | CTO Name    | cto@company.com       | @cto         | +55 11 9ZZZZ-ZZZZ |

### External Escalation

| Service            | Contact                | Phone           | Notes                       |
| ------------------ | ---------------------- | --------------- | --------------------------- |
| Cloudflare Support | support@cloudflare.com | +1-650-319-8930 | Enterprise account required |
| DNS Provider       | -                      | -               | Update as needed            |
| Domain Registrar   | -                      | -               | Update as needed            |

### Key Slack Channels

- `#airtrust-alerts` - Automated alerts
- `#airtrust-incidents` - Active incidents
- `#airtrust-deployments` - Deployment notifications
- `#airtrust-general` - General discussion

---

## 📝 CHANGE LOG

**v1.0.0 - 10 de Novembro de 2025**

- Initial production deployment
- All Fases 1-4 complete
- Monitoring configured
- Runbook created

---

**Last Updated:** 10 de Novembro de 2025  
**Next Review:** 24 de Novembro de 2025  
**Owner:** DevOps Team
