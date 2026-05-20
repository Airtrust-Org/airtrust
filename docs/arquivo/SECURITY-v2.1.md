# Security Policy - AirTrust v2.1

## Security Contact

**Email**: security@airtrust.com  
**Response Time**: 24-48 hours for critical vulnerabilities  
**GPG Key**: Available in repository

## Vulnerability Reporting

Please report security vulnerabilities responsibly:

1. **Do NOT** create public GitHub issues for security vulnerabilities
2. Email security details to security@airtrust.com
3. Include: vulnerability description, impact, reproduction steps, affected versions
4. Allow 48 hours for initial response

## Security Architecture - v2.1

### Threat Model & Mitigations

#### 1. SQL Injection Prevention ✅

**Threat**: Attackers inject malicious SQL through user inputs

**Mitigations**:
- **Prepared Statements**: All queries use D1 parameterized queries
- **Input Sanitization** (`sql-sanitize.ts`):
  - `sanitizeLike()`: Escapes `%`, `_`, `\` for safe LIKE queries
  - `sanitizeQuery()`: Validates and trims input
  - `containsSuspiciousSQLPatterns()`: Detects DROP, DELETE, INSERT, UNION, OR 1=1 patterns
- **Validation Layer**: `validators.ts` enforces field types before DB operations

**Test Coverage**: 29 tests in `sql-sanitize.test.ts`  
**Status**: 🟢 MITIGATED

---

#### 2. Unauthorized Access Control ✅

**Threat**: Non-admin users accessing sensitive endpoints

**Mitigations**:
- **RBAC Middleware** (`rbac-containment.ts`):
  - `checkRole(['ADMIN', 'DPO'])` enforced on:
    - `/api/v2/lgpd/*` - LGPD endpoints
    - `/api/v2/auditoria/*` - Audit logs
    - `/api/admin/backup/*` - Backups
    - `/api/v2/import/*` - Data import
  
- **Auth Middleware** (`auth.ts`):
  - JWT verification required
  - Dev bypass requires explicit `ENABLE_DEV_AUTH_BYPASS=true` flag
  - Prevents accidental production use of dev credentials

**Test Coverage**: 17 tests in `rbac-containment.test.ts`  
**Status**: 🟢 MITIGATED

---

#### 3. Uncontrolled Data Deletion (LGPD Violations) ✅

**Threat**: Accidental or malicious hard deletion of user data without proper workflow

**Mitigations**:
- **Multi-Stage Approval Workflow** (`lgpd-safe.ts`):
  1. User/Admin requests deletion → `lgpd_exclusao_solicitacoes` (PENDENTE)
  2. DPO reviews & approves/rejects
  3. Only approved requests proceed to hard delete
  4. Backup created BEFORE deletion → `funcionarios_backup_exclusao`

- **Audit Trail** (`audit-log.ts`):
  - All deletion steps logged with user, timestamp, reason
  - `lgpd_hard_delete_log` tracks execution
  - Reversible: backups enable data recovery

- **Feature Flag Protection**:
  - `HARD_DELETE_ENABLED=false` (default)
  - Requires explicit enablement for production

**Database Schema**: 
- `lgpd_exclusao_solicitacoes`: Request workflow
- `funcionarios_backup_exclusao`: Pre-delete backups
- `lgpd_hard_delete_log`: Audit trail
- `lgpd_notificacoes`: Email notifications

**Test Coverage**: 5 endpoints with full audit logging  
**Status**: 🟢 MITIGATED

---

#### 4. Authentication Bypass ✅

**Threat**: Dev-mode authentication accidentally left enabled in production

**Mitigations**:
- **Feature Flag Requirement**: `ENABLE_DEV_AUTH_BYPASS=true` must be explicitly set
- **Default Secure**: Defaults to `false` in all environments
- **Environment Validation**: At startup, logs all active security flags
- **Error Response**: Returns 401 "DEV_BYPASS_DISABLED" without proper flag

**Configuration**:
```bash
# Production (.env.production)
ENABLE_DEV_AUTH_BYPASS=false

# Staging (with feature testing)
ENABLE_DEV_AUTH_BYPASS=false

# Local dev only (.dev.vars)
ENABLE_DEV_AUTH_BYPASS=true
```

**Test Coverage**: 20 tests in `feature-flags.test.ts`  
**Status**: 🟢 MITIGATED

---

#### 5. Rate Limiting & DoS Protection ✅

**Threat**: Attackers flood endpoints causing service degradation

**Mitigations**:
- **Sliding Window Rate Limiter** (`rate-limiter-advanced.ts`):
  - `/api/v2/import`: 10 requests/hour
  - `/api/v2/export`: 20 requests/hour
  - `/api/auth/login`: 5 attempts/5 minutes
  - General API: 60 requests/minute
  - Hard delete: 3 operations/24 hours

- **Response Headers**:
  - `X-RateLimit-Limit`: Max allowed
  - `X-RateLimit-Remaining`: Requests left
  - `X-RateLimit-Reset`: Unix timestamp
  - `Retry-After`: Seconds to wait (429 responses)

- **429 Status Code**: Clients should respect rate limit headers

**Status**: 🟢 IMPLEMENTED

---

#### 6. Cascading Failures (Dependency Failures) ✅

**Threat**: D1 or R2 failures cause system-wide outages

**Mitigations**:
- **Circuit Breaker Pattern** (`circuit-breaker.ts`):
  - States: CLOSED → OPEN → HALF_OPEN → CLOSED
  - Failure threshold: 5 consecutive failures
  - Timeout before half-open: 60 seconds
  - Success threshold (half-open): 3 consecutive successes

- **Fallback Support**:
  - Return cached data when dependencies unavailable
  - Graceful degradation instead of errors

- **Manager Pattern**:
  - Separate circuit breakers per service (D1, R2, auth)
  - Health check: `isSystemHealthy()` checks all breakers

**Status**: 🟢 IMPLEMENTED

---

#### 7. Performance Degradation (Hidden Failures) ✅

**Threat**: System degrades silently (high latency, high error rate)

**Mitigations**:
- **Metrics Collection** (`metrics-collector.ts`):
  - Real-time metrics: requests/min, errors/min, latency percentiles
  - Percentile tracking: P95, P99 latency for SLO monitoring
  - Error rate alerting: Triggers at >5% error rate

- **Automatic Alerts**:
  - 🔴 CRITICAL: P99 latency > 5s, error rate > 5%
  - 🟡 WARNING: Avg latency > 1s, P95 > 3s
  - Alert history maintained (last 100)

- **Health Check Endpoint** (`/api/v2/sistema/health`):
  - Returns system health status
  - Lists all active circuit breakers
  - Includes metrics snapshot

**Thresholds**:
```
Metric                 Warning    Critical
─────────────────────────────────────────
Avg Latency            1000ms     (hard limit)
P95 Latency            3000ms     5000ms
Error Rate             (soft)     5%
P99 Latency            (soft)     5000ms
```

**Status**: 🟢 IMPLEMENTED

---

## Secure Dependencies

### Critical Libraries

| Package | Version | Purpose | Security |
|---------|---------|---------|----------|
| `hono` | 4.10.1 | HTTP framework | Regular updates |
| `jsonwebtoken` | 9.0.2 | JWT auth | Cryptographic signing |
| `bcryptjs` | 2.4.3 | Password hashing | Slow hash (10 rounds) |
| `@cloudflare/workers-types` | 4.20250926 | Type definitions | First-party |

### Dependency Scanning

- Run `npm audit` regularly
- GitHub Dependabot enabled for auto-updates
- Security patches applied within 24 hours

---

## Data Protection

### LGPD Compliance (Brazilian Data Protection Law)

✅ **User Rights Implemented**:
- **Access**: `/api/v2/lgpd/exportar-dados` - Full data export
- **Deletion**: `/api/v2/lgpd/solicitar-exclusao` - Request hard deletion
- **Audit**: All deletions logged and reversible (backup available)

✅ **Privacy by Design**:
- Minimal data collection
- Purpose limitation (training data only)
- Data retention policies enforced
- Audit trail for accountability

---

## Infrastructure Security

### Cloudflare Workers

- **DDoS Protection**: Native Cloudflare DDoS mitigation
- **TLS/SSL**: Automatic HTTPS, TLS 1.2+
- **Rate Limiting**: Cloudflare global rate limiting + app layer
- **WAF**: Cloudflare Web Application Firewall enabled

### D1 Database (SQLite)

- **Encryption**: At-rest encryption by Cloudflare
- **Backups**: Automatic daily backups, 30-day retention
- **Access Control**: Service key authentication only
- **Audit**: Query logging available via Wrangler

### R2 Storage (Object Storage)

- **Permissions**: Bucket policies enforce least privilege
- **Ownership Validation** (`r2-upload-validator.ts`):
  - Before upload, verify user owns the resource
  - Prevents unauthorized file access
  - Logs all permission denials

- **Public/Private**: Certificates marked private by default

---

## Deployment Security Checklist

### Pre-Deployment

- [ ] Run `npm run build` - Full TypeScript compilation
- [ ] Run `npm run test:coverage` - Tests pass, 30%+ coverage
- [ ] Review CHANGELOG for breaking changes
- [ ] Test migrations on staging: `wrangler d1 migrations apply --env staging`
- [ ] Verify all feature flags set correctly
- [ ] Update security contact info if changed

### During Deployment

- [ ] Deploy to staging first: `npm run deploy --env staging`
- [ ] Verify health check: `curl https://staging.airtrust.com/api/v2/sistema/health`
- [ ] Monitor metrics for 15 minutes
- [ ] Test critical user flows (login, import, export)
- [ ] Deploy to production: `npm run deploy`

### Post-Deployment

- [ ] Verify production health check responding
- [ ] Monitor error rate for 1 hour (alert if > 2%)
- [ ] Check database size increased (migrations applied)
- [ ] Run smoke tests on critical endpoints
- [ ] Document any incidents in runbook

---

## Security Testing

### Automated

- Unit tests: 194/202 passing (96% pass rate)
- Coverage: 30%+ threshold enforced
- TypeScript strict mode: All type errors caught
- SQL injection tests: 29 test cases

### Manual Security Review Checklist

- [ ] No hardcoded secrets in code
- [ ] All user inputs validated
- [ ] All errors logged appropriately (no sensitive data)
- [ ] CORS headers correct
- [ ] CSRF tokens used for state-changing operations
- [ ] Session tokens invalidated on logout
- [ ] Admin functions protected by RBAC
- [ ] Deletion requests require multi-step approval
- [ ] Audit logs preserved for compliance

---

## Known Limitations & Future Work

### Current Scope (v2.1)

✅ Fixed:
- SQL injection via LIKE queries
- LGPD compliance (hard deletion workflow)
- Auth bypass (feature flag requirement)
- Rate limiting (sliding window)
- Cascading failures (circuit breaker)
- Performance monitoring (metrics + alerts)
- TypeScript strict mode (type safety)

### Future Enhancements

🔄 Planned:
- End-to-end encryption for sensitive data in transit
- Hardware security module (HSM) integration for key management
- Advanced threat detection (anomaly detection)
- Penetration testing program
- Security awareness training for team
- Zero-trust architecture migration
- SOC 2 Type II compliance audit

---

## Support & Updates

- Security updates released as patch versions (v2.1.x)
- Major changes described in CHANGELOG-v2.1.md
- Subscribe to security advisories: [GitHub Releases](https://github.com/fp-daumas/airtrust-v1/releases)

---

**Last Updated**: November 2, 2025  
**Next Review**: February 2, 2026  
**Status**: ✅ PRODUCTION READY
