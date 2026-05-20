# CONSOLIDAÇÃO: CERTIFICADOS (PARTE 2)

## 🎯 Contexto

Sucesso anterior: **qualificacoes.ts** refatorado de **1,284 → 681 linhas (-47%)**

Agora: Consolidar **16 arquivos de certificados** em **1 arquivo ÚNICO e LIMPO**

## 📋 Arquivos Encontrados para Consolidação

```
src/worker/api/v2/
├─ certificados.ts (827 linhas) ⚠️
├─ certificados-download.ts (150 linhas)
├─ certificados-upload.ts (475 linhas)
├─ certificados-upload-fixed.ts
├─ certificados-storage.ts
├─ certificados-download-historico.ts
├─ certificados-refactored.ts
├─ pasta-virtual-certificados-enhanced.ts
├─ historico-certificacoes.ts
├─ import-certificacoes.ts
├─ import-certificacoes-batch.ts
├─ debug-certificacao.ts
└─ [6 outros arquivos relacionados]

TOTAL: 16 ARQUIVOS (caos de duplicação)
```

## 🎯 Resultado Desejado

**1 arquivo ÚNICO**: `~/src/worker/api/v2/certificados.ts` (~350-400 linhas)

**Endpoints Consolidados** (10 essenciais):
```
✅ POST   /certificados/upload                   (Upload PDF via R2)
✅ GET    /certificados/download/:id             (Download PDF)
✅ POST   /certificados/:qualificacaoId/generate (Gerar certificado)
✅ GET    /certificados/:qualificacaoId/list     (Listar certificados)
✅ DELETE /certificados/:id                      (Soft delete)
✅ POST   /certificados/batch-generate           (Múltiplos certificados)
✅ GET    /certificados/funcionario/:id          (Por funcionário)
✅ GET    /certificados/dashboard-stats          (Estatísticas)
✅ GET    /certificados/historico                (Histórico de geração)
✅ GET    /certificados                          (Listar todos - legacy)
```

## 📌 O Que Manter

- ✅ **Template HTML certificado** (gerarTemplatoCertificado)
- ✅ **Integração R2** com nomenclatura padrão: `CERT-{MATRICULA}-{CODIGO}-{DATA}.pdf`
- ✅ **Integração GitHub** (fallback storage)
- ✅ **Magic bytes validation** (PDF/ZIP)
- ✅ **Caching de certificados**
- ✅ **Soft delete** (deleted_at não NULL)
- ✅ **Rate limiting** (read/write)
- ✅ **Security headers**

## ❌ O Que REMOVER

- ❌ **authMiddleware** (desabilitada para dev)
- ❌ **Permissões/RBAC** (permission checks)
- ❌ **Código duplicado** (múltiplas versões do mesmo endpoint)
- ❌ **Funções de debug** (debug-certificacao.ts)
- ❌ **Comentários extensos** (apenas TODOs)
- ❌ **Audit logging verboso** (manter apenas essencial)
- ❌ **Múltiplas importações** (consolidar imports)
- ❌ **Código morto/nunca usado**

## 🔧 Estrutura do Arquivo Consolidado

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import { Logger } from '../../utils/logger';
import { gerarTemplatoCertificado, sanitizeFileName } from '../../utils/...';
import { rateLimitRead, rateLimitWrite } from '../../middleware/...';
import { securityHeaders } from '../../middleware/...';

// Schemas (Zod)
const UploadSchema = z.object({ file: z.any(), ... });
const GenerateSchema = z.object({ qualificacaoId: z.number(), ... });
// ...

const certificados = new Hono<{ Bindings: Env }>();

// Middleware
certificados.use('*', securityHeaders());
certificados.use('/', rateLimitRead);

// ===== CRUD OPERATIONS =====
// GET list
// GET by ID
// POST create/generate
// PUT update
// DELETE soft-delete

// ===== BUSINESS LOGIC =====
// Upload to R2/GitHub
// Generate from template
// Batch operations

// ===== ANALYTICS =====
// Dashboard stats
// History queries

export default certificados;
```

## 📊 Métricas Esperadas

| Métrica | Antes | Depois | Meta |
|---------|-------|--------|------|
| Arquivos | 16 | 1 | ✅ |
| Linhas | ~2500 | 350-400 | ✅ |
| Endpoints | Duplicados | Consolidados | ✅ |
| Code duplication | 40%+ | <5% | ✅ |

## ✅ Próximos Passos (Após Consolidação)

1. **Build**: `npm run build` (target: <4s)
2. **Deploy**: `npx wrangler deploy`
3. **Test**: Validar todos os 10 endpoints
4. **Cleanup**: Remover os 16 arquivos antigos
5. **Backup**: Arquivar originals em `_backups/certificados/`

## 📝 Prompt para Copilot (Cmd+I)

```
CONSOLIDAÇÃO: CERTIFICADOS - Refatore 16 arquivos em 1 (LIMPO)

Você é especialista em refatoração Hono. Sucesso com qualificacoes.ts (1284→681 linhas).

Tarefa: Consolidar certificados em 1 arquivo ÚNICO, LIMPO (~350-400 linhas)

Arquivos a consolidar:
- certificados.ts (827 linhas - principal)
- certificados-download.ts (150 linhas)
- certificados-upload.ts (475 linhas)
- certificados-storage.ts, upload-fixed.ts, download-historico.ts
- pasta-virtual-certificados-enhanced.ts
- historico-certificacoes.ts
- import-certificacoes.ts, import-certificacoes-batch.ts
- debug-certificacao.ts
- E 6 outros arquivos relacionados

Endpoints finais NECESSÁRIOS (consolidar duplicatas):
1. POST   /certificados/upload              (R2/GitHub upload)
2. GET    /certificados/download/:id        (Download PDF)
3. POST   /certificados/:qualificacaoId/generate (Gerar)
4. GET    /certificados/:qualificacaoId/list    (Listar por qualificação)
5. DELETE /certificados/:id                 (Soft delete)
6. POST   /certificados/batch-generate      (Lote)
7. GET    /certificados/funcionario/:id     (Por funcionário)
8. GET    /certificados/dashboard-stats     (Stats)
9. GET    /certificados/historico           (Histórico)
10. GET   /certificados                     (Listar todos - legacy)

Manter (IMPORTANTE):
✅ Template HTML certificado (gerarTemplatoCertificado)
✅ Integração R2 (nomenclatura: CERT-{MATRICULA}-{CODIGO}-{DATA}.pdf)
✅ Magic bytes validation (PDF/ZIP)
✅ Soft delete com deleted_at
✅ Rate limiting & security headers
✅ Caching

Remover (CRÍTICO):
❌ authMiddleware (AUTH DESABILITADA EM DEV)
❌ Todas as permissões/RBAC
❌ Código duplicado de upload/download
❌ Funções de debug
❌ Comentários extensos (apenas TODOs)
❌ Múltiplas versões do mesmo endpoint

RESULTADO: 1 arquivo único ~/src/worker/api/v2/certificados.ts (~350 linhas)

Build & Deploy depois do código entregue.
```

---

## 🚀 Execução Final

```bash
cd ~/Documents/airtrust

# 1. Copiar refactored certificados.ts
cat > src/worker/api/v2/certificados.ts << 'EOF'
[CÓDIGO DO COPILOT AQUI]
EOF

# 2. Build
npm run build

# 3. Deploy
npx wrangler deploy --env production

# 4. Test endpoints
curl https://airtrust.workers.dev/api/v2/certificados?limit=5

# 5. Cleanup old files (optional, first backup)
mkdir -p _backups/certificados-old
mv src/worker/api/v2/certificados-*.ts _backups/certificados-old/
mv src/worker/api/v2/pasta-virtual-certificados-*.ts _backups/certificados-old/
mv src/worker/api/v2/historico-certificacoes.ts _backups/certificados-old/
mv src/worker/api/v2/import-certificacoes*.ts _backups/certificados-old/
mv src/worker/api/v2/debug-certificacao.ts _backups/certificados-old/
```

---

**Status**: 🟡 PRONTO PARA CONSOLIDAÇÃO  
**Próximo passo**: Abrir Cmd+I no VS Code e colar o prompt acima! 🚀
