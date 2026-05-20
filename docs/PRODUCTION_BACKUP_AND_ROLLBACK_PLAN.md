# Production Backup and Rollback Plan — AirTrust

**Version:** 1.0  
**Date:** 2026-05-15  
**Status:** APPROVED FOR USE — commands are templates only; execution requires explicit human approval

---

## 1. Overview

This document defines the comprehensive backup strategy, rollback procedures, and abort criteria for AirTrust production deployments. No commands in this document are to be executed without explicit authorization.

**Production assets protected:**
- D1 database `airtrust-db` (ID `7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae`) — ~59 MiB, 230+ tables
- Cloudflare Worker `airtrust-api` — deployed on `api.airtrust.online`
- Cloudflare Pages `airtrust` — deployed on `airtrust.online`
- Secrets: `JWT_SECRET`, `SIGVOOS_CONFIG_ENCRYPTION_KEY` (production env)

---

## 2. Backup Strategy

### 2.1 When to Take Backups

| Trigger | Type | Priority |
|---------|------|----------|
| Before any production worker deploy | Schema + data | MANDATORY |
| Before any D1 migration | Schema + data | MANDATORY |
| Before any secret rotation | Secrets list only | MANDATORY |
| Weekly routine | Full data | RECOMMENDED |
| Before a new schema migration is merged | Schema snapshot | RECOMMENDED |

### 2.2 D1 Export Commands (Templates — Do Not Execute)

```bash
# Set timestamp
DATE_STAMP=$(date -u +%Y%m%d-%H%M%S)
echo "Backup timestamp: $DATE_STAMP"

# Full backup — schema + data (produces INSERT statements)
# WARNING: output file contains real user data. NEVER commit to git.
npx wrangler d1 export airtrust-db \
  --env production \
  --remote \
  --output /secure/backups/airtrust/production/full_${DATE_STAMP}.sql

# Schema-only backup (DDL without data — safe to inspect)
npx wrangler d1 export airtrust-db \
  --env production \
  --remote \
  --no-data \
  --output /secure/backups/airtrust/production/schema_only_${DATE_STAMP}.sql

# List secrets (names only — values never exposed)
npx wrangler secret list --env production \
  > /secure/backups/airtrust/production/secrets_list_${DATE_STAMP}.txt
```

### 2.3 Backup Verification Checklist

After taking a backup, verify:

```bash
# 1. File exists and is non-empty
ls -lh /secure/backups/airtrust/production/full_${DATE_STAMP}.sql

# 2. Contains CREATE TABLE statements (schema present)
grep -c "CREATE TABLE" /secure/backups/airtrust/production/full_${DATE_STAMP}.sql

# 3. Contains INSERT INTO statements (data present)
grep -c "INSERT INTO" /secure/backups/airtrust/production/full_${DATE_STAMP}.sql

# 4. Spot-check critical table
grep "INSERT INTO usuarios" /secure/backups/airtrust/production/full_${DATE_STAMP}.sql | head -3
```

- [ ] File size > 10 MiB (production DB is ~59 MiB)
- [ ] `grep -c "CREATE TABLE"` > 200
- [ ] `grep -c "INSERT INTO"` > 100
- [ ] Backup file is outside the git repository
- [ ] Timestamp logged in the ops log

### 2.4 Storage Rules

- Backups MUST be stored outside the git repository (e.g., `/secure/backups/airtrust/` or encrypted cloud storage)
- Retain at least the last 3 pre-deploy backups
- Backups older than 90 days may be archived (not deleted)
- The backups directory in the repo (`backups/`) is reserved for schema-only snapshots with no real data

---

## 3. Rollback Procedures

### 3.1 Rollback Decision Tree

```
Incident detected?
│
├── Worker 5xx > 1% of requests → Scenario A (Worker rollback)
├── Auth failing (login returns 5xx) → Scenario A immediately
├── D1 migration caused data corruption → Scenario B (DB restore)
├── Secrets misconfigured → Scenario C (Secret rollback)
└── Frontend broken → Scenario D (Pages rollback)
```

### 3.2 Scenario A — Worker Rollback (no DB changes)

Estimated time: **< 5 minutes**

```bash
# 1. Identify last stable worker deploy
npx wrangler deployments list --env production

# 2. Rollback to previous deployment (Cloudflare keeps deployment history)
npx wrangler rollback --env production

# OR: redeploy a specific git commit
git log --oneline -5
# Note the stable commit hash
git checkout <stable-commit>
cd worker-airtrust
npx wrangler deploy --env production
git checkout main
```

Post-rollback verification:
```bash
curl -sf https://api.airtrust.online/api/health
curl -sf https://api.airtrust.online/api/version
curl -s -o /dev/null -w "%{http_code}" https://api.airtrust.online/api/auth/me
# Expected: 401 (proves auth middleware is active)
```

### 3.3 Scenario B — D1 Migration Rollback (data restore required)

Estimated time: **15–45 minutes** depending on DB size

**CRITICAL: This requires the pre-deploy backup taken in Section 2.2.**

```bash
# 1. Stop ingress if possible (maintenance mode via MAINTENANCE_SECRET)
# Set MAINTENANCE_SECRET in environment if not already set

# 2. Verify backup integrity
ls -lh /secure/backups/airtrust/production/full_${DATE_STAMP}.sql
grep -c "CREATE TABLE" /secure/backups/airtrust/production/full_${DATE_STAMP}.sql

# 3. Restore from backup
# CAUTION: D1 does not support native restore from SQL dump via wrangler yet.
# You must execute the SQL dump statement-by-statement or use D1 import.
npx wrangler d1 execute airtrust-db \
  --env production \
  --remote \
  --file /secure/backups/airtrust/production/full_${DATE_STAMP}.sql

# 4. Roll back worker to version compatible with the backup schema
git checkout <stable-commit>
cd worker-airtrust
npx wrangler deploy --env production
git checkout main

# 5. Full smoke test
curl -sf https://api.airtrust.online/api/health
# Login with real user, verify data
```

### 3.4 Scenario C — Secret Rollback

```bash
# 1. List current secrets to confirm the problem
npx wrangler secret list --env production

# 2. Re-set the affected secret with the previous value
# (value must be retrieved from secure key management, NOT from git)
echo "<previous-value>" | npx wrangler secret put JWT_SECRET --env production

# 3. Redeploy worker to pick up the new secret value
cd worker-airtrust
npx wrangler deploy --env production
```

### 3.5 Scenario D — Frontend Rollback

```bash
# Cloudflare Pages stores deployment history.
# Option 1: Revert via Pages dashboard (preferred for speed)

# Option 2: Redeploy previous commit
git checkout <stable-frontend-commit>
npm run build
npx wrangler pages deploy dist --project-name=airtrust --branch=main
git checkout main
```

---

## 4. Abort Criteria

Deploy must be aborted or rollback triggered IMMEDIATELY if:

| Condition | Action |
|-----------|--------|
| `POST /api/auth/login` returns 5xx | ABORT/ROLLBACK immediately |
| `GET /api/health` returns 5xx | ABORT/ROLLBACK immediately |
| Any D1 query returns unexpected schema error | PAUSE, assess, ROLLBACK if data risk |
| Tenant data visible across company boundaries | ABORT/ROLLBACK immediately |
| JWT tokens rejected by production (401 on valid tokens) | ROLLBACK immediately |
| P95 latency > 5x pre-deploy baseline | PAUSE, investigate, ROLLBACK if sustained |
| Error rate (5xx) > 1% over 5 minutes | ROLLBACK |
| Worker deploy fails with error | DO NOT deploy; investigate |
| D1 migration reports unexpected row count | HALT migration, investigate |
| Test suite fails in CI before deploy | BLOCKED — do not deploy |

---

## 5. Post-Rollback Checklist

After any rollback, the following must be completed before next deploy attempt:

- [ ] Root cause identified and documented in `docs/`
- [ ] Test covering the regression added to the test suite
- [ ] Smoke test (staging) passes with the fix applied
- [ ] New backup taken from the current stable state
- [ ] Incident log updated (`docs/RUNBOOK.md` or new incident report)
- [ ] Team notified

---

## 6. Cloudflare D1 Backup Limitations (as of 2026-05)

Based on `wrangler d1 export --help`:

- `wrangler d1 export` supports `--no-data` (schema only), `--no-schema` (data only), or full export
- Exports are SQL dump format (CREATE TABLE + INSERT INTO)
- There is no native "point-in-time restore" in D1 (unlike RDS)
- **Recommendation:** Take backups before every significant schema change or data migration
- **Recommendation:** Store backups in Cloudflare R2 or another durable store outside the repo

The staging DB (`airtrust-db-staging`) can be used to test restore procedures without risk to production.

---

## 7. Backup Schedule Recommendation

| Frequency | Type | Retention |
|-----------|------|-----------|
| Pre-deploy (every deploy) | Full dump | Keep last 5 |
| Weekly (Sunday 00:00 UTC) | Full dump | Keep 4 weeks |
| Monthly | Full dump + schema | Keep 12 months |
| Before any migration | Schema + data | Keep indefinitely |
