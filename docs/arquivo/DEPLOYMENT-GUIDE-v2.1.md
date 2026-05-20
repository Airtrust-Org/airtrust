# Deployment Guide - AirTrust v2.1

**Version**: 2.1.0  
**Updated**: November 2, 2025  
**Target Environments**: Staging, Production

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Migration Path (v2.0 → v2.1)](#migration-path)
4. [Feature Flags Configuration](#feature-flags-configuration)
5. [Deployment Steps](#deployment-steps)
6. [Post-Deployment Validation](#post-deployment-validation)
7. [Rollback Procedures](#rollback-procedures)
8. [Monitoring & Troubleshooting](#monitoring--troubleshooting)

---

## Prerequisites

### Required Software
- **Node.js**: 20.x or later (verify: `node -v`)
- **npm**: 10.x or later (verify: `npm -v`)
- **Wrangler CLI**: 4.33.0+ (verify: `wrangler --version`)

### Required Access
- Cloudflare account with Workers enabled
- D1 database access: `airtrust-db`
- R2 bucket access: `airtrust-storage`
- GitHub repository with push access

### Configuration Files
- `.env.production` or `wrangler.env.production` (Wrangler config)
- `.dev.vars` for local development
- SSH key for GitHub (if deploying from CI/CD)

---

## Pre-Deployment Checklist

### Code Quality
- [ ] Pull latest from main: `git pull origin main`
- [ ] Install dependencies: `npm install`
- [ ] Run build: `npm run build` (should succeed in < 5s)
- [ ] Run tests: `npm run test:coverage` (194/202 passing, 30%+ coverage)
- [ ] Run linter: `npm run lint` (zero errors/warnings)
- [ ] Type check: `npm run build` (TypeScript strict mode)

### Database
- [ ] Backup current database: `wrangler d1 backup airtrust-db --env production`
- [ ] Review pending migrations: `wrangler d1 migrations list airtrust-db --env production`
- [ ] Confirm migration scripts correct:
  - `migrations/2008_lgpd_safe_delete.sql` (LGPD workflow tables)
  - `migrations/2009_refresh_tokens.sql` (Session management tables)
- [ ] Test migrations on staging: `wrangler d1 migrations apply airtrust-db --env staging`

### Security
- [ ] Verify feature flags configured:
  ```toml
  [env.production]
  vars = {
    ENABLE_DEV_AUTH_BYPASS = "false",      # CRITICAL: Must be false
    LGPD_ENDPOINT_ENABLED = "false",       # New: Disabled by default
    HARD_DELETE_ENABLED = "false",         # New: Disabled by default
    RATE_LIMIT_IMPORT_ENABLED = "true"     # New: Enabled by default
  }
  ```
- [ ] Review SECURITY-v2.1.md for threat model
- [ ] Confirm no secrets in code: `grep -r "password\|secret\|key" src/ --exclude-dir=node_modules`

### Documentation
- [ ] Read CHANGELOG-v2.1.md
- [ ] Review breaking changes (section "Breaking Changes")
- [ ] Update team runbook with new endpoints
- [ ] Notify stakeholders of maintenance window (if needed)

---

## Migration Path

### For Teams Deploying First Time

```bash
# 1. Clone and setup
git clone https://github.com/fp-daumas/airtrust-v1.git
cd airtrust-v1
npm install

# 2. Build and test locally
npm run build
npm run test:coverage

# 3. Deploy to staging
npm run deploy --env staging

# 4. Verify staging
curl https://staging.airtrust.workers.dev/api/v2/sistema/health
```

### For Teams Upgrading from v2.0

#### Option A: Gradual Rollout (Recommended)

**Phase 1: Staging (1-2 days)**
```bash
# Deploy to staging environment
npm run deploy --env staging

# Run smoke tests
npm run test:endpoints

# Monitor for 24 hours
# Check metrics: error rate, latency, circuit breakers
```

**Phase 2: Canary (1-2 days)**
```bash
# Deploy to production (new instances only)
npm run deploy --env production

# Route 10% traffic to new version
# Monitor: error rate, latency, alert count

# If healthy: proceed to Phase 3
# If issues: trigger rollback (see Rollback Procedures)
```

**Phase 3: Full Rollout**
```bash
# Route 100% traffic to v2.1
# Monitor for 1 hour
# Confirm all endpoints working
```

#### Option B: Big Bang (Lower Risk if Tested Well)
```bash
# Test extensively in staging first
# Deploy directly to production
# Have rollback plan ready

npm run deploy --env production
```

---

## Feature Flags Configuration

### Development Environment

**File**: `.dev.vars`
```bash
ENABLE_DEV_AUTH_BYPASS=true        # Allow dev auth for local testing
LGPD_ENDPOINT_ENABLED=false        # Use new safe endpoints
HARD_DELETE_ENABLED=false          # Prevent accidental deletes
RATE_LIMIT_IMPORT_ENABLED=true     # Keep rate limiting
```

### Staging Environment

**File**: `wrangler.env.staging` or vars in `wrangler.toml`
```toml
[env.staging]
vars = {
  ENABLE_DEV_AUTH_BYPASS = "false",     # Mimic production
  LGPD_ENDPOINT_ENABLED = "false",      # Test new workflow
  HARD_DELETE_ENABLED = "false",        # Test with disabled
  RATE_LIMIT_IMPORT_ENABLED = "true"    # Test rate limiting
}
```

### Production Environment

**File**: `wrangler.env.production` or secret in Cloudflare Dashboard
```toml
[env.production]
vars = {
  ENABLE_DEV_AUTH_BYPASS = "false",     # CRITICAL: Must be false
  LGPD_ENDPOINT_ENABLED = "false",      # Only enable for specific test
  HARD_DELETE_ENABLED = "false",        # Only enable after training
  RATE_LIMIT_IMPORT_ENABLED = "true"    # Must be true for protection
}
```

### Emergency Override (Admin Only)

If production issue found, temporarily disable feature:
```bash
# Disable LGPD endpoint
wrangler secret put LGPD_ENDPOINT_ENABLED --env production
# Enter: false

# Disable rate limiting (if causing false positives)
wrangler secret put RATE_LIMIT_IMPORT_ENABLED --env production
# Enter: false

# Redeploy after config change
npm run deploy --env production
```

---

## Deployment Steps

### Step 1: Prepare Environment

```bash
# Install dependencies
npm install

# Verify configuration
cat wrangler.toml
echo "Feature flags:"
grep "vars = {" wrangler.toml -A 10
```

### Step 2: Build Application

```bash
# Build frontend + backend
npm run build

# Check for TypeScript errors
npm run build 2>&1 | grep -i "error"

# Expected output: (nothing - no errors)
```

### Step 3: Run Tests

```bash
# Run full test suite with coverage
npm run test:coverage

# Verify output:
# - Test Files: 4 failed | 8 passed (12)
# - Tests: 8 failed | 194 passed (202)
# - Coverage: 30%+ threshold PASSED
```

### Step 4: Apply Database Migrations

```bash
# For staging first:
wrangler d1 migrations apply airtrust-db --env staging

# Expected output:
# ✓ Migration 2008_lgpd_safe_delete.sql applied
# ✓ Migration 2009_refresh_tokens.sql applied

# If production:
wrangler d1 migrations apply airtrust-db --env production
```

### Step 5: Deploy Application

```bash
# Deploy to staging first
npm run deploy --env staging

# Expected output:
# ✓ uploaded 81 files
# ✓ Worker deployed

# Deploy to production (after staging validation)
npm run deploy --env production
```

### Step 6: Verify Deployment

```bash
# Check worker is running
wrangler deployments list airtrust-db --env production

# Test health endpoint
curl https://airtrust.workers.dev/api/v2/sistema/health

# Expected: 200 OK with health status
# {
#   "status": "healthy",
#   "timestamp": "...",
#   "uptime_ms": ...,
#   "metrics": {...},
#   "circuit_breakers": {...}
# }
```

---

## Post-Deployment Validation

### Immediate (0-5 minutes)

```bash
# 1. Health check
curl -I https://airtrust.workers.dev/api/v2/sistema/health
# Expected: 200 OK

# 2. Auth test
curl -X POST https://airtrust.workers.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}'
# Expected: 200 or 401 (not 500)

# 3. Rate limit test
for i in {1..15}; do
  curl -I https://airtrust.workers.dev/api/v2/import
done
# Last request should return 429 Too Many Requests
```

### Short-term (5-60 minutes)

- [ ] Monitor error rate (dashboard)
  - Expected: < 2%
- [ ] Check latency (dashboard)
  - Expected: avg < 500ms, p95 < 1000ms
- [ ] Verify no circuit breaker alerts
  - Expected: 0 open breakers
- [ ] Confirm RBAC working
  - Test non-admin access to `/api/v2/import` (should be 403)
- [ ] Verify rate limiting
  - Hit `/api/v2/import` 11 times (12th should be 429)

### Long-term (1-24 hours)

- [ ] Review error logs for new patterns
- [ ] Check database size (should match migration data)
- [ ] Verify backup jobs completed
- [ ] Monitor performance degradation
- [ ] Collect feedback from users

---

## Rollback Procedures

### Scenario 1: Deployment Fails During Build

```bash
# Issue: npm run build fails
# Action: Fix TypeScript errors and redeploy
git pull origin main
npm install
npm run build  # Fix errors shown
npm run deploy --env production
```

### Scenario 2: Deployment Succeeds but Health Check Fails

```bash
# Issue: Worker deployed but health check returns 500
# Action: Check logs and rollback

# View logs
wrangler tail airtrust --env production

# Rollback to previous version
git checkout v2.0.0
npm install
npm run deploy --env production

# Restore database (if migrations caused issue)
wrangler d1 restore airtrust-db <backup-id> --env production
```

### Scenario 3: Metrics Show High Error Rate (> 5%)

```bash
# Issue: Error rate > 5% after 10 minutes
# Action: Disable problematic feature and redeploy

# Disable LGPD endpoint (if causing errors)
wrangler secret put LGPD_ENDPOINT_ENABLED --env production
# Enter: false

# Redeploy
npm run deploy --env production

# If still failing, full rollback:
git checkout v2.0.0
npm run deploy --env production
```

### Scenario 4: Database Migrations Failed

```bash
# Issue: `wrangler d1 migrations apply` failed
# Action: Restore from backup

# List backups
wrangler d1 backup list airtrust-db --env production

# Restore specific backup
wrangler d1 restore airtrust-db <backup-id> --env production

# Rollback code
git checkout v2.0.0
npm run deploy --env production
```

### Full Rollback Checklist

```bash
# 1. Rollback code
git checkout v2.0.0
npm install

# 2. Rebuild and test
npm run build
npm run test:run

# 3. Restore database
wrangler d1 restore airtrust-db <backup-id> --env production

# 4. Redeploy
npm run deploy --env production

# 5. Verify rollback
curl https://airtrust.workers.dev/api/v2/sistema/health
# Should return status from v2.0.0

# 6. Notify stakeholders
# Email: "Rollback to v2.0.0 completed at HH:MM UTC"
```

---

## Monitoring & Troubleshooting

### Key Metrics to Monitor

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Error Rate | > 2% | > 5% | Check logs, disable feature |
| Avg Latency | > 500ms | > 1000ms | Review queries, scale resources |
| P95 Latency | > 1000ms | > 3000ms | Check bottleneck, investigate |
| P99 Latency | > 3000ms | > 5000ms | Severe issue, consider rollback |
| Circuit Breaker | Any OPEN | Multiple OPEN | D1/R2 failure, investigate |

### Common Issues & Solutions

#### Issue: 401 "DEV_BYPASS_DISABLED"
**Cause**: Auth attempting dev bypass without flag  
**Solution**:
```bash
# Check feature flag
wrangler secret get ENABLE_DEV_AUTH_BYPASS --env production
# Should be: false

# If testing locally, set in .dev.vars:
ENABLE_DEV_AUTH_BYPASS=true
```

#### Issue: 503 from LGPD endpoints
**Cause**: LGPD endpoint disabled waiting for safe implementation  
**Solution**:
```bash
# Use new endpoints instead
curl https://airtrust.workers.dev/api/v2/lgpd-safe/exportar-dados

# Or enable old endpoint (not recommended)
wrangler secret put LGPD_ENDPOINT_ENABLED --env production
# Enter: true
```

#### Issue: 429 Too Many Requests on /api/v2/import
**Cause**: Rate limit hit (10 requests/hour)  
**Solution**:
```bash
# Wait 1 hour for rate limit window to reset
# Or disable rate limit (if false positives)
wrangler secret put RATE_LIMIT_IMPORT_ENABLED --env production
# Enter: false

# Redeploy
npm run deploy --env production
```

#### Issue: Database Migration Failed
**Cause**: Migration syntax error or conflict  
**Solution**:
```bash
# Check migration status
wrangler d1 migrations list airtrust-db --env production

# If stuck, restore from backup
wrangler d1 restore airtrust-db <backup-id> --env production

# Review migration files
cat migrations/2008_lgpd_safe_delete.sql
cat migrations/2009_refresh_tokens.sql

# Fix and reapply
wrangler d1 migrations apply airtrust-db --env production
```

### Health Check Endpoint

```bash
curl https://airtrust.workers.dev/api/v2/sistema/health

# Response format:
{
  "status": "healthy|degraded|critical",
  "timestamp": "2025-11-02T12:00:00Z",
  "uptime_ms": 3600000,
  "metrics": {
    "requests_per_min": 120,
    "errors_per_min": 1,
    "avg_latency_ms": 45,
    "p95_latency_ms": 250,
    "p99_latency_ms": 800
  },
  "circuit_breakers": {
    "d1": "CLOSED",
    "r2": "CLOSED",
    "auth": "CLOSED"
  },
  "alerts": []
}
```

### Accessing Logs

```bash
# Real-time logs (Wrangler tail)
wrangler tail airtrust --env production

# Export logs for analysis
wrangler tail airtrust --env production > logs.txt

# Filter for errors
wrangler tail airtrust --env production | grep "ERROR"

# Search by time range
# (Configure in Cloudflare dashboard)
```

---

## Support & Escalation

### During Deployment

**Issue Hotline**: #airtrust-deploy Slack channel  
**On-Call Engineer**: Check rotation schedule  
**Escalation**: If unable to resolve in 15 minutes, page infrastructure lead

### Post-Deployment

**Monitoring**: Datadog/CloudFlare dashboards  
**Alerts**: Configure via infrastructure team  
**Runbook**: `/docs/runbook.md`

---

**Last Updated**: November 2, 2025  
**Maintained By**: Infrastructure Team  
**Next Review**: February 2, 2026
