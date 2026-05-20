# 🎯 Fase 2 Quick Reference Guide

## 🔒 CSRF Protection - Frontend Integration

### Get Token

```javascript
// In app initialization or before form submission
const response = await fetch('/api/v2/auth/csrf-token', {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});
const { token: csrfToken } = await response.json();
```

### Use Token in Requests

```javascript
// Include in all POST/PUT/DELETE/PATCH requests
const response = await fetch('/api/v2/funcionarios', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken, // ← REQUIRED
  },
  body: JSON.stringify({ name: 'John' }),
});
```

### Error Handling

```javascript
if (response.status === 403) {
  const error = await response.json();
  if (error.code === 'CSRF_TOKEN_INVALID') {
    // Get new token and retry
    location.reload();
  }
}
```

---

## ⏱️ Rate Limit - What to Expect

### Response Headers

All requests include rate limit info:

```
X-RateLimit-Limit: 100         # Max requests per window
X-RateLimit-Remaining: 97      # Requests left
X-RateLimit-Reset: 1699689660  # Unix timestamp when window resets
```

### When Limited (429)

```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT_EXCEEDED",
  "data": {
    "limit": 100,
    "window": 60,
    "retryAfter": 45
  }
}

Headers:
Retry-After: 45   # Wait 45 seconds before retrying
```

### Limits Applied

| Endpoint                   | Limit            |
| -------------------------- | ---------------- |
| /api/v2/auth/login         | 5 requests/min   |
| /api/\* (general)          | 100 requests/min |
| /api/v2/system/export-data | 10 requests/min  |

---

## 🛡️ Query Changes

### What's Different

4 queries in `/export-data` now have LIMIT:

- `funcionarios`: Max 5000 rows
- `treinamentos`: Max 1000 rows
- `certificacoes`: Max 10000 rows
- `arquivos`: Max 5000 rows

### Why?

- Prevents timeout on large exports
- Protects against DoS via export endpoint
- Soft-delete validation prevents orphaned records

---

## 📊 Monitoring

### What to Watch For

**CSRF Rejections (403)**:

```bash
grep "CSRF_TOKEN_INVALID" worker-logs.txt
```

- Indicates frontend not including X-CSRF-Token header
- Check browser console for import errors

**Rate Limit Hits (429)**:

```bash
grep "RATE_LIMIT_EXCEEDED" worker-logs.txt
```

- Normal for heavy users
- Check for bot/scraper patterns

**Memory Usage**:

- CSRF tokens cleanup: Every 1 hour
- Rate limit entries cleanup: Every 5 minutes
- No manual cleanup needed

---

## 🔧 Troubleshooting

### Issue: All POST requests return 403

**Cause**: CSRF token not being sent
**Fix**:

1. Ensure GET `/api/v2/auth/csrf-token` is called first
2. Check X-CSRF-Token header is included
3. Verify token is not expired (1 hour max)

### Issue: Rate limit keeps triggering

**Cause**: Too many requests in time window
**Fix**:

1. Check X-RateLimit-Remaining header
2. Wait for Retry-After seconds
3. Review code for loops/polling

### Issue: Export-data endpoint is slow

**Cause**: Database still processing with new LIMIT
**Fix**:

1. LIMIT reduces row count, should be faster
2. Check database indexes (already optimized)
3. Review soft-delete queries on JOINs

---

## 📝 Endpoints Summary

| Method | Endpoint                   | CSRF | RateLimit | Changes       |
| ------ | -------------------------- | ---- | --------- | ------------- |
| GET    | /api/v2/auth/csrf-token    | ❌   | ✅ (100)  | NEW           |
| POST   | /api/v2/auth/login         | ✅   | ✅ (5)    | Login protect |
| POST   | /api/v2/funcionarios       | ✅   | ✅ (100)  | Protected     |
| PUT    | /api/v2/funcionarios/:id   | ✅   | ✅ (100)  | Protected     |
| DELETE | /api/v2/funcionarios/:id   | ✅   | ✅ (100)  | Protected     |
| GET    | /api/v2/system/export-data | ❌   | ✅ (10)   | Query limits  |

---

## 🚀 Deployment Checklist

- [x] Code tested
- [x] Build passing
- [x] Endpoints verified
- [x] Documentation complete
- [x] Git committed

Ready to deploy via:

```bash
npx wrangler deploy
```

Or use configured task in VS Code.
