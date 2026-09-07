# Alerting Setup - AirTrust Production Monitoring

**Data:** 10 de Novembro de 2025  
**Status:** ⚠️ NÃO COMPROVADO / REQUER CONFIGURAÇÃO EXTERNA

> Este arquivo é um **runbook de configuração desejada**, não evidência de que
> UptimeRobot, Slack, e-mail, SMS, PagerDuty, Logpush ou outro consumidor externo
> estejam ativos. Nenhum alerta deve ser declarado `CONFIGURED` sem prova
> runtime do monitor e do canal de entrega. A observabilidade do Worker é
> configurada separadamente em `worker-airtrust/wrangler.toml`.

---

## 📊 Alertas propostos (pendentes de prova externa)

### 1. 🔴 Uptime Alert (P1 - Critical)

**Ferramenta proposta:** Cloudflare Health Checks e/ou UptimeRobot

**Configuração:**

- **Endpoint:** `https://api.airtrust.online/api/health`
- **Método:** GET
- **Intervalo:** 60 segundos
- **Expected:** HTTP 200 com `"status":"healthy"`
- **Condição Trigger:** 3 falhas consecutivas
- **Timeout:** 30 segundos

**Ações de Resposta:**

```
Trigger:
  ├─ Slack: #airtrust-alerts (mention @on-call)
  ├─ Email: ops-team@example.com
  ├─ SMS: On-call phone (se P1)
  └─ PagerDuty: Create incident

SLA: Respond within 5 minutes
Target: Restore within 30 minutes
```

**Escalation:**

```
0-5 min   → On-call engineer
5-30 min  → Senior engineer + Manager
30+ min   → CTO escalation
```

---

### 2. 🟡 Error Rate Alert (P2 - High)

**Ferramenta proposta:** Cloudflare Workers Logs/OpenTelemetry/Logpush + consumidor externo

**Configuração:**

- **Trigger:** Error rate > 5% por 5 minutos
- **Error Codes:** 5xx (exceto 503 de manutenção)
- **Window:** 5 minutos
- **Threshold:** 5% de total requests

**Ações de Resposta:**

```
Trigger:
  ├─ Slack: #airtrust-alerts
  ├─ Dashboard: Auto-load error details
  └─ Email: tech-lead@example.com

Investigation:
  1. Check Cloudflare Analytics
  2. Review recent deployments
  3. Check database performance
  4. Review rate limit hits

SLA: Investigate within 15 minutes
Target: Remediate within 1 hour
```

**Remediation:**

- Se erro 502/503: Verificar Worker status
- Se erro 5xx: Revisar recent commits
- Se database error: Verificar D1 quota/performance

---

### 3. 🟠 Rate Limit Alert (P2 - High)

**Ferramenta proposta:** Workers Logs/OpenTelemetry/Logpush + consumidor externo

**Configuração:**

- **Trigger:** 429 responses > 100/min
- **Duration:** Sustentado por 2+ minutos
- **IP Check:** Detectar padrões suspeitos

**Ações de Resposta:**

```
Immediate:
  ├─ Slack notification
  ├─ Check IP source
  └─ Analyze request pattern

Investigation:
  1. Legitimate spike (marketing campaign)?
  2. Bot/crawler abuse?
  3. Possível DDoS?
  4. Recent API change?

Actions:
  - If legitimate: Increase limit temporarily
  - If abuse: Add IP to block list
  - If DDoS: Activate Cloudflare DDoS protection
  - If recent change: Rollback if needed

SLA: Response within 10 minutes
```

**Rate Limits Atual:**

```
- Login endpoint: 5 req/min per IP
- General API: 100 req/min per IP
- Critical ops: 10 req/min per IP
```

---

### 4. 🟢 Slow Query Alert (P3 - Medium)

**Ferramenta:** Wrangler Tail + Performance Monitor

**Configuração:**

- **Trigger:** Query execution > 1000ms
- **Database:** D1 queries
- **Frequency:** Log all slow queries

**Ações de Resposta:**

```
Investigation:
  1. Identify slow query
  2. Check EXPLAIN PLAN
  3. Verify indices applied
  4. Check query volume

Optimization:
  - Add missing INDEX
  - Add LIMIT clause
  - Optimize SELECT fields
  - Consider caching

SLA: Investigate within 1 hour
Target: Fix within 24 hours
```

**Current Slow Queries (Monitored):**

```
- funcionarios.get_all (sem LIMIT)
- habilitacoes.filter_by_date
- certificados.expiring_soon
- agendamentos.by_period
```

---

## 📈 Dashboard Metrics

### Cloudflare Analytics Dashboard

**URL:** `https://dash.cloudflare.com/ → Workers → airtrust-production → Metrics`

**Métricas Monitoradas:**

1. **Requests**

   - Total requests/minute
   - Requests by status code
   - Requests by endpoint
   - Geographic distribution

2. **Performance**

   - P50 latency (target: < 200ms)
   - P95 latency (target: < 500ms)
   - P99 latency (target: < 1000ms)
   - CPU time
   - Memory usage

3. **Errors**

   - Error rate % (target: < 0.1%)
   - 5xx errors
   - 4xx errors
   - Error trend

4. **Security**
   - Rate limit hits (429s)
   - Blocked requests
   - Top IPs

---

## 🔧 Setup Instructions

### 1. Cloudflare Health Checks

```bash
# Via Cloudflare Dashboard:
1. Go to Workers > airtrust-production
2. Click "Health Checks"
3. Create new check:
   - URL: https://api.airtrust.online/api/health
   - Interval: 60 seconds
   - Expected: 200 OK, body contains "healthy"
4. Add alert notification
```

### 2. UptimeRobot (Opcional - Mais Features)

```bash
# Via uptimerobot.com:
1. Create account
2. Add Monitor:
   - Type: HTTP(s) GET
   - URL: https://api.airtrust.online/api/health
   - Interval: 5 minutes
   - Expected: Status 200, Keyword "healthy"
3. Add alert contacts:
   - Email: ops-team@example.com
   - SMS: +55 11 XXXXX-XXXX
4. Enable public status page
```

### 3. Slack Integration

```bash
# Via Cloudflare:
1. Workers > Alerts
2. Create notification rule:
   - Type: Slack webhook
   - URL: https://hooks.slack.com/services/YOUR/WEBHOOK/URL
   - Channel: #airtrust-alerts
   - Format: Include stack trace

# Custom alerts:
# Use Slack SDK or webhooks in Worker code
```

### 4. Custom Monitoring (Worker Code)

**Exemplo de Health Check com Alerting:**

```typescript
// src/worker/routes/system.ts
import { alertToSlack } from './utils/alerting';

export const systemHealthRoute = (app: Hono) => {
  app.get('/api/v2/system/health', async (c) => {
    try {
      // Check DB
      const dbHealth = await checkDatabase(c.env.DB);

      // Check R2
      const r2Health = await checkR2(c.env.AIRTRUST_STORAGE);

      const status = dbHealth && r2Health ? 'healthy' : 'degraded';

      // Alert if degraded
      if (status === 'degraded') {
        await alertToSlack(c, {
          level: 'warning',
          message: 'System degraded',
          details: { dbHealth, r2Health },
        });
      }

      return c.json({
        status,
        timestamp: new Date().toISOString(),
        environment: c.env.ENVIRONMENT,
        version: '1.0.0',
      });
    } catch (error) {
      await alertToSlack(c, {
        level: 'error',
        message: 'Health check failed',
        error: error.message,
      });

      return c.json({ status: 'unhealthy', error: 'Internal error' }, 500);
    }
  });
};
```

---

## 📋 Alert Response Checklist

### Para cada alerta recebido:

- [ ] Acknowledge no Slack/PagerDuty
- [ ] Determine severity (P1/P2/P3)
- [ ] Gather initial data (logs, metrics)
- [ ] Identify root cause
- [ ] Implement fix or workaround
- [ ] Verify resolution
- [ ] Post-mortem (if P1)
- [ ] Update runbook if needed

---

## 🎯 SLOs (Service Level Objectives)

| Métrica         | Target    | Alert Threshold |
| --------------- | --------- | --------------- |
| Uptime          | 99.9%     | < 99.5%         |
| Error Rate      | < 0.1%    | > 1%            |
| P95 Latency     | < 500ms   | > 1000ms        |
| P99 Latency     | < 1000ms  | > 2000ms        |
| Rate Limit Hits | < 10/hour | > 100/min       |
| Slow Queries    | < 5/hour  | > 10 in 5min    |

---

## 📞 Contatos On-Call

| Função       | Nome            | Email              | Slack        | Telefone          |
| ------------ | --------------- | ------------------ | ------------ | ----------------- |
| On-Call Lead | DevOps Engineer | ops@example.com    | @devops-lead | +55 11 XXXXX-XXXX |
| Backup       | Senior Engineer | senior@example.com | @senior-eng  | +55 11 YYYYY-YYYY |
| Escalation   | CTO             | cto@example.com    | @cto         | +55 11 ZZZZ-ZZZZ  |

---

**Última Atualização:** 10 de Novembro de 2025  
**Próxima Revisão:** 24 de Novembro de 2025
