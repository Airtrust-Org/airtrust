# RBAC Instructor Audit — AirTrust

**Version:** 2.0  
**Date:** 2026-05-16  
**Status:** ASSESSED — Characterization tests added; runtime unchanged; Phase 3 fix planned

See also: `docs/RBAC_INSTRUCTOR_FIX_REPORT.md` for full access matrix, route count, and Phase 3 plan.

---

## 1. Current Role Mapping

The RBAC system uses three canonical roles: `admin`, `manager`, `user`.

The `normalizeRole()` function in `worker-airtrust/src/middleware/rbac.ts` maps database-stored role strings to canonical roles:

```typescript
// worker-airtrust/src/middleware/rbac.ts — lines 22–29
function normalizeRole(raw: string | undefined): UserRole | undefined {
  if (!raw) return undefined;
  const r = raw.toLowerCase().trim();
  if (r === 'admin' || r === 'administrador') return 'admin';
  if (r === 'gestor' || r === 'manager') return 'manager';
  if (r === 'instrutor' || r === 'instructor') return 'manager'; // instrutor has manager-level access
  if (r === 'usuario' || r === 'user' || r === 'aluno' || r === 'student') return 'user';
  return r as UserRole;
}
```

**Key finding:** `instrutor` (and `instructor`) maps to `manager`, not to a dedicated `instructor` role.

---

## 2. Role Normalization Table

| DB Value | Normalized Role | Notes |
|----------|-----------------|-------|
| `ADMIN`, `admin`, `administrador` | `admin` | Full access |
| `GESTOR`, `gestor`, `manager` | `manager` | Operational management |
| `instrutor`, `instructor` | `manager` | **Over-provisioning — see Section 4** |
| `USUARIO`, `usuario`, `user`, `aluno`, `student` | `user` | Read/self-service |
| Other raw values | returned as-is | Falls through; may cause unexpected behavior |

---

## 3. Second requireRole Implementation

There are two separate `requireRole` implementations in the codebase:

| File | Signature | Behavior |
|------|-----------|----------|
| `middleware/rbac.ts` | `requireRole(...roles: UserRole[])` | Variadic; normalizes role via `normalizeRole()`; throws 403 |
| `middleware/auth.ts` | `requireRole(requiredRole: string)` | Single role; compares raw `userRole`; returns 401 |

**Risk:** Routes importing from `middleware/auth.ts` do NOT benefit from role normalization. For example, `frms-fadiga-checkin.ts` and `fix-renovadas.ts` import from `auth.ts`. This means `instrutor` does NOT map to `manager` on those routes — the raw value must match exactly.

| Route File | Import Source | Role Normalization Applied? |
|-----------|---------------|----------------------------|
| `notificacoes-convocacao.ts` | `middleware/rbac.ts` | YES |
| `setores.ts` | `middleware/rbac.ts` | YES |
| `auditoria.ts` | `middleware/rbac.ts` | YES |
| `solicitacoes-treinamento.ts` | `middleware/rbac.ts` | YES |
| `escalas-core.ts` | `middleware/rbac.ts` | YES |
| `frms-fadiga-checkin.ts` | `middleware/auth.ts` | NO |
| `fix-renovadas.ts` | `middleware/auth.ts` | NO |

---

## 4. Routes Restricted to manager and above

Routes using `requireRole('admin', 'manager')` (from `rbac.ts`) — instrutor users gain access via normalization:

| Route | Method | Restriction |
|-------|--------|-------------|
| `POST /api/escalas/:id/notificar` | POST | admin, manager |
| `POST /api/setores/` | POST | admin, manager |
| `PUT /api/setores/:id` | PUT | admin, manager |
| `POST /api/solicitacoes-treinamento/*` (multiple) | POST/PATCH | admin, manager |
| `POST /api/notificacoes/convocacao/*` (multiple) | POST/DELETE | admin, manager |

Routes restricted to admin only:
| Route | Restriction |
|-------|-------------|
| `DELETE /api/setores/:id` | admin only |
| `/api/admin/*` (wildcard, index.ts) | admin only |
| `/api/migrations/*` (wildcard) | admin only |
| `/api/debug/*` (wildcard) | admin only |
| `POST /api/fix/populate-qualificacao-ids` | admin only |
| `/api/qualificacoes-historico/auditoria` | admin only (via auditoria.ts) |

---

## 5. Risk Assessment

### 5.1 Over-provisioning Risk

**Level: MEDIUM**

Instructors (`instrutor`) currently have the same API access as managers (`gestor`). This means an instructor can:
- Send scheduling notifications (`POST /api/escalas/:id/notificar`)
- Create and modify departments (`POST /api/setores/`)
- Approve and schedule training requests (`POST /api/solicitacoes-treinamento/*`)
- Send invitations and manage convocacoes emails

This is a deliberate architectural decision (line 27 comment: "instrutor has manager-level access for routes"), but it has not been formally reviewed with business requirements.

### 5.2 Dual Implementation Risk

**Level: MEDIUM**

The presence of two `requireRole` functions creates maintenance risk:
- A developer may import from the wrong module
- The `auth.ts` version does NOT normalize `instrutor` → `manager`
- The `auth.ts` version returns 401 (Unauthorized), while `rbac.ts` returns 403 (Forbidden), which is incorrect semantics for an authorization failure

### 5.3 Fall-through Risk

**Level: LOW**

If a user has a role value not covered by `normalizeRole()` (e.g., `supervisor`, `coordenador`), it falls through as-is. If such a value is checked against `requireRole('admin', 'manager', 'user')`, access is denied correctly. However, it could match an unexpected role string in edge cases.

---

## 6. Recommendations

### 6.1 Short Term (Before Production Hardening)

1. **Document the instrutor→manager decision formally** — confirm with Filipe that instructors should have manager-level access to scheduling, departments, and training requests.

2. **Consolidate requireRole to single implementation** — routes that import from `middleware/auth.ts` (`frms-fadiga-checkin.ts`, `fix-renovadas.ts`) should migrate to `middleware/rbac.ts` for consistent normalization. This is a low-risk refactor (same logic, consistent behavior).

3. **Add `instrutor` to the `UserRole` union type** — currently `UserRole = 'admin' | 'manager' | 'user'`. Adding `'instrutor'` as a first-class type would make the intent explicit and allow typed route definitions.

### 6.2 Medium Term (Post-Production)

4. **Introduce an `instructor` role** — if instructors should have more limited access than managers (e.g., can create sessions but not send notifications), introduce a distinct `instructor` canonical role with its own permission boundaries.

5. **Add integration test for RBAC** — test that `instrutor` users can and cannot access the correct endpoints.

6. **Audit `auth.ts` requireRole callers** — verify that `frms-fadiga-checkin.ts` routes (`/fadiga-checkin/painel-gestor`, `/fadiga-checkin/analytics`) intentionally require raw `manager` and not normalized `instrutor`.

---

## 7. Files Affected

| File | Notes |
|------|-------|
| `worker-airtrust/src/middleware/rbac.ts` | Primary RBAC implementation — contains `normalizeRole` and variadic `requireRole` |
| `worker-airtrust/src/middleware/auth.ts` | Secondary implementation — single-arg `requireRole`, no normalization |
| `worker-airtrust/src/routes/frms-fadiga-checkin.ts` | Imports from `auth.ts` — normalization gap |
| `worker-airtrust/src/routes/fix-renovadas.ts` | Imports from `auth.ts` — normalization gap |
| `worker-airtrust/src/index.ts` | Top-level route middleware (`/api/admin/*`, `/api/migrations/*`, `/api/debug/*`) |
