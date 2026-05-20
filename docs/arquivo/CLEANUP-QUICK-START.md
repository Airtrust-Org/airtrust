# 🚀 QUICK START - 2-Step Cleanup Endpoint

**TL;DR**: The dangerous one-click delete button has been replaced with a safe 2-step confirmation endpoint.

---

## ⚡ Quick Test (2 minutes)

### Step 1: Preview (See what will be deleted)

```bash
curl -X POST \
  'https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/certificados/admin/cleanup-incorrect' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"confirma_limpeza": false}'
```

**You'll get**: List of affected funcionarios, total count - NO deletion yet

### Step 2: Confirm (Actually delete)

```bash
curl -X POST \
  'https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/certificados/admin/cleanup-incorrect' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"confirma_limpeza": true}'
```

**You'll get**: Success message with deleted count, audit trail recorded

---

## 📊 What Changed

| Aspect           | Before               | After                              |
| ---------------- | -------------------- | ---------------------------------- |
| **Button**       | Dangerous one-click  | Removed ✅                         |
| **Endpoint**     | DELETE /limpar-todos | POST /admin/cleanup-incorrect ✅   |
| **Confirmation** | Single dialog        | 2-step (preview + confirm) ✅      |
| **Preview**      | No                   | Yes - see affected funcionarios ✅ |
| **Recovery**     | Impossible           | Possible (soft delete) ✅          |
| **Audit**        | Minimal              | Full trail ✅                      |

---

## 🔐 Requirements

✅ Admin token required  
✅ HTTPS only (Cloudflare enforced)  
✅ All operations logged  
✅ Soft delete (30-day retention possible)

---

## 📚 Full Documentation

See: **CLEANUP-ENDPOINT-CORRECTION.md**

---

## 🧪 Automated Test

```bash
chmod +x test-cleanup-endpoint.sh
./test-cleanup-endpoint.sh
```

Follows the 2-step flow interactively with pretty output.

---

## ❓ FAQ

**Q: Will my data be deleted immediately?**  
A: No! Step 1 (preview) doesn't delete anything. Only Step 2 deletes.

**Q: Can I recover deleted certificates?**  
A: Yes! Soft deletes are used, so they can be recovered (within 30 days typically).

**Q: Is everything logged?**  
A: Yes! Every operation is recorded in the auditoria table with full details.

**Q: What if I only run Step 1?**  
A: Nothing happens - it's just a preview. You must run Step 2 to actually delete.

---

## ✅ Status

- ✅ Deployed to production
- ✅ Build successful (3.47s)
- ✅ Ready for use
- ✅ Fully tested

---

**Version**: 06065277-9897-4b64-8123-5414a41e2abe  
**Date**: November 2, 2025  
**Status**: ✅ LIVE

Start with Step 1 to preview what will be deleted! 🎯
