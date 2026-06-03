# AirTrust Tenant Isolation Audit — Documents & Assets v0.5

**Date:** 2026-06-02
**Sprint:** J — Supabase Preparation
**Status:** Auditoria concluida; Sprint K corrigiu os 7 gaps criticos e parte dos altos

---

## 1. Escopo

Auditoria de todas as rotas que servem documentos, certificados e assets (R2) no AirTrust, verificando se a tenant isolation (`empresa_id`) é aplicada corretamente.

**Método:** Análise estática de todas as queries que acessam `documentos`, `pasta_virtual`, `certificados`, `arquivos`, e chamadas a `BUCKET.get()`, `BUCKET.put()`, `BUCKET.delete()`.

---

## 2. Rotas e endpoints auditados

### 2.1 Asset Gateway — `/api/assets/*`
**Arquivo:** `worker-airtrust/src/routes/assets.ts`

| Método | Path | Tenant Check | Risco |
|---|---|---|---|
| GET | `/api/assets/*` | ✅ Sim — `classifyAssetAccess()` classifica por prefixo, `authorizeTenantAsset()` verifica JWT empresa_id | Baixo |

**Classificação de acesso:**
- **Público:** `empresas/{id}/logo*.png|jpg|webp|gif|svg` — branding (sem auth)
- **Tenant-scoped:** `fira/{empresa_id}/*` — requer auth + empresa_id match
- **Bloqueado:** `certificados/`, `funcionarios/`, `qualificacoes/`, `EXAME-ASO-` — retorna 404

**Conclusão:** Bem isolado. Sem gaps.

---

### 2.2 Pasta Virtual (Documentos) — `/api/pasta-virtual/*`
**Arquivo:** `worker-airtrust/src/routes/pasta-virtual.ts`

| Método | Path | Tenant Check | Risco | Gap |
|---|---|---|---|---|
| GET | `/by-category/:funcionario_id` | ✅ JOIN `funcionarios f ON f.id = d.funcionario_id AND f.empresa_id = ?` | Baixo | — |
| GET | `/` (list) | ✅ JOIN `funcionarios f ON d.funcionario_id = f.id AND f.empresa_id = ?` | Baixo | — |
| **GET** | **`/:id` (por funcionario)** | ✅ Sprint K — JOIN `funcionarios.empresa_id` | **ALTO CORRIGIDO** | GAP-001 |
| **POST** | **`/upload`** | ✅ Sprint K — funcionario validado por `empresa_id` antes de R2 | **ALTO CORRIGIDO** | GAP-002 |
| **GET** | **`/download/:id`** | ✅ Sprint K — documento validado por tenant antes de R2 | **CRÍTICO CORRIGIDO** | GAP-003 |
| **GET** | **`/stream/:id`** | ✅ Sprint K — documento validado por tenant antes de R2 | **CRÍTICO CORRIGIDO** | GAP-004 |
| **DELETE** | **`/delete/:id`** | ✅ Sprint K — documento/pasta validado por tenant antes de cascata/R2 | **CRÍTICO CORRIGIDO** | GAP-005 |
| DELETE | `/:id` (admin) | ✅ Sprint K — documento validado por tenant antes de soft-delete/R2 | ALTO CORRIGIDO | GAP-006 |

**Gaps críticos:**
- **GAP-003 (`GET /download/:id`):** Qualquer usuário autenticado de qualquer empresa pode obter a URL de download de qualquer documento do sistema.
- **GAP-004 (`GET /stream/:id`):** Transmite o conteúdo real de qualquer arquivo por ID. Basta conhecer um ID de documento. É o gap mais perigoso.
- **GAP-005 (`DELETE /delete/:id`):** Permite deleção cross-tenant de documentos com cascading delete em 3 tabelas + R2.

---

### 2.3 Pasta Virtual Extra (Legado) — `/api/pasta-virtual-extra/*`
**Arquivo:** `worker-airtrust/src/routes/pasta-virtual-extra.ts`

| Método | Path | Tenant Check | Risco | Gap |
|---|---|---|---|---|
| **GET** | **`/download-certificados/:funcionario_id`** | ✅ Sprint K — funcionario/documentos filtrados por tenant antes de R2 | **CRÍTICO CORRIGIDO** | GAP-007 |
| GET | `/:id/documentos` (legacy) | ✅ Sprint K — JOIN `funcionarios.empresa_id` | ALTO CORRIGIDO | GAP-008 |
| POST | `/:id/upload` (legacy) | ✅ Sprint K — funcionario validado por tenant antes de R2 | ALTO CORRIGIDO | GAP-009 |

---

### 2.4 Certificados — `/api/certificados/*`
**Arquivos:** `worker-airtrust/src/routes/qualificacoes-certificados.ts`, `qualificacoes-certificados-write.ts`, `qualificacoes-certificados-admin.ts`, `qualificacoes-certificados-admin-ops.ts`

| Método | Path | Tenant Check | Risco | Gap |
|---|---|---|---|---|
| GET | `/historico/:id/certificados` | ✅ JOIN `funcionarios f ON f.id = qh.funcionario_id` com `f.empresa_id = ?` | Baixo | — |
| **DELETE** | **`/historico/:id/certificados/:certId`** | ✅ Sprint K — documento validado por tenant e historico compatível antes de R2/cascata | **CRÍTICO CORRIGIDO** | GAP-010 |
| GET | `/funcionario/:id` | ✅ Sprint K — JOIN `funcionarios.empresa_id` | ALTO CORRIGIDO | GAP-011 |
| **GET** | **`/download/:id`** | ✅ Sprint K — documento validado por tenant antes de retornar stream URL | **CRÍTICO CORRIGIDO** | GAP-012 |
| POST | `/historico/:id/certificados/gerar` | ✅ Usa `getEmpresaId(c)` + `AND f.empresa_id = ?` | Baixo | — |
| POST | `/historico/:id/certificados/upload` | ✅ Usa `getEmpresaId(c)` + armazena empresa_id | Baixo | — |
| **POST** | **`/historico/export-zip`** | ✅ Sprint K — `auth()` confirmado e query filtrada por `funcionarios.empresa_id` antes de R2 | **CRÍTICO CORRIGIDO** | GAP-013 |
| POST | `/recuperar-orfaos` | ❌ admin-only mas query cross-tenant sem boundary | ALTO | GAP-014 |

**Nota Sprint K sobre GAP-013:** a auditoria registrou ausência de auth, mas o código atual já tinha `auth()`. O gap real corrigido foi ausência de filtro `empresa_id`, que permitia export cross-empresa antes de ler objetos R2.

---

### 2.5 LMS Assets — `/api/lms/*`
**Arquivo:** `worker-airtrust/src/routes/lms-assets.ts`

| Método | Path | Tenant Check | Risco |
|---|---|---|---|
| GET | `/scorm/assets/:empresa_id/:curso_id/*` | ✅ `ensureCourseAssetAccess()` valida empresa_id do JWT | Baixo |
| GET | `/scorm/assets-by-curso/:cursoId/*` | ✅ Resolve curso, valida empresa_id | Baixo |
| GET | `/h5p/assets/:h5pId/*` | ✅ `ensureH5pAssetAccess()` valida empresa_id | Baixo |
| GET | `/pdf/asset/:cursoId` | ✅ `ensureCourseAssetAccess()` | Baixo |
| GET | `/pptx/asset/:cursoId` | ✅ `ensureCourseAssetAccess()` | Baixo |
| GET | `/course-assets/:cursoId/thumbnail` | ❌ Sem auth — thumbnail público | Baixo (thumbnail apenas) |

**Conclusão:** LMS assets são bem isolados. O endpoint de thumbnail público é intencional e de baixo risco.

---

### 2.6 Simuladores Fichas
**Arquivo:** `worker-airtrust/src/routes/simuladores-fichas.ts`

| Método | Path | Tenant Check | Risco |
|---|---|---|---|
| POST | (PDF generation) | ✅ Lê `funcionario.empresa_id`, usa logo da empresa correta | Baixo |

**Conclusão:** Bem isolado. Sem gaps.

---

## 3. Resumo de gaps

### Críticos (7) — exfiltração de dados ou destruição cross-tenant

| ID | Endpoint | Arquivo | Risco |
|---|---|---|---|
| GAP-003 | `GET /api/pasta-virtual/download/:id` | pasta-virtual.ts | URL de download sem tenant check |
| GAP-004 | `GET /api/pasta-virtual/stream/:id` | pasta-virtual.ts | Stream de arquivo sem tenant check |
| GAP-005 | `DELETE /api/pasta-virtual/delete/:id` | pasta-virtual.ts | Deleção cross-tenant + cascading |
| GAP-007 | `GET /api/pasta-virtual-extra/download-certificados/:funcionario_id` | pasta-virtual-extra.ts | ZIP de certificados sem tenant check |
| GAP-010 | `DELETE /api/certificados/historico/:id/certificados/:certId` | qualificacoes-certificados.ts | Deleção cross-tenant de certificado |
| GAP-012 | `GET /api/certificados/download/:id` | qualificacoes-certificados.ts | Download sem tenant check |
| GAP-013 | `POST /api/certificados/historico/export-zip` | qualificacoes-certificados-admin-ops.ts | Sem tenant, export cross-empresa |

### Altos (5) — acesso indevido ou modificação cross-tenant

| ID | Endpoint | Risco |
|---|---|---|
| GAP-001 | `GET /api/pasta-virtual/:id` | Listagem de documentos de qualquer funcionario |
| GAP-002 | `POST /api/pasta-virtual/upload` | Upload para funcionario de outra empresa |
| GAP-006 | `DELETE /api/pasta-virtual/:id` (admin) | Admin deleta docs de outra empresa |
| GAP-011 | `GET /api/certificados/funcionario/:id` | Lista certificados de qualquer funcionario |
| GAP-014 | `POST /api/certificados/recuperar-orfaos` | Cross-link de docs entre tenants |

### Status Sprint K (2026-06-02)

| Grupo | Status |
|---|---|
| 7 gaps criticos | Corrigidos em runtime e cobertos por teste de regressao cross-tenant |
| GAP-001, GAP-002, GAP-006, GAP-008, GAP-009, GAP-011 | Corrigidos junto com os criticos por serem locais e compartilharem o mesmo padrao |
| GAP-014 | Pendente; rota administrativa de recuperacao de orfaos exige fase propria |
| 2 medios citados no inventario Sprint J | Pendentes de classificacao explicita em documento separado |
| `lmsRelatoriosRepository` | Nao integrado neste sprint para manter foco em documentos/R2 |

Teste adicionado: `worker-airtrust/src/__tests__/routes/documentos-tenant-isolation.test.ts`.
Garantias cobertas: cross-tenant nao chama `BUCKET.get()`, `BUCKET.put()`, `BUCKET.delete()` nem executa mutations; tenant correto mantem acesso em stream/export.

---

## 4. Causa raiz

O padrão de falha é consistente: rotas que acessam a tabela `documentos` diretamente por `id` ou `funcionario_id`, sem JOIN em `funcionarios` para verificar `empresa_id`.

A tabela `documentos` não tem `empresa_id` garantido (o código verifica condicionalmente via `documentosHasEmpresaId`). Portanto, qualquer query em `documentos` sem JOIN em `funcionarios.empresa_id` está exposta.

---

## 5. Correção recomendada

Para cada gap, adicionar:

```sql
-- Em vez de:
SELECT * FROM documentos WHERE id = ?

-- Usar:
SELECT d.* FROM documentos d
JOIN funcionarios f ON f.id = d.funcionario_id AND f.empresa_id = ?
WHERE d.id = ? AND d.deleted_at IS NULL
```

**Estimativa de esforço:** 3-5 dias para todos os 12 gaps.

**Exige GPT-5.5:** Sim. As correções tocam `pasta-virtual.ts`, `pasta-virtual-extra.ts`, `qualificacoes-certificados.ts`, e `qualificacoes-certificados-admin-ops.ts` — arquivos sensíveis de runtime com acesso a R2 e cascading deletes.

**Exige migration:** Não. A correção é adicionar JOINs nas queries existentes, sem alterar schema.

**Exige metadata R2:** Não, mas complementaria (defense-in-depth).

---

## 6. Plano de correção (Sprint K, GPT-5.5)

1. **Fase 1:** Corrigir GAP-004 e GAP-013 — concluido no Sprint K.
2. **Fase 2:** Corrigir GAP-003, GAP-005, GAP-007, GAP-010, GAP-012 — concluido no Sprint K.
3. **Fase 3:** Corrigir GAP-001, GAP-002, GAP-006, GAP-008, GAP-009, GAP-011 — concluido no Sprint K.
4. **Pendente:** GAP-014 e gaps medios, para fase propria.
5. **Validação:** Testes de tenant isolation adicionados para stream/download/export/delete.

---

## 7. O que NÃO foi feito neste sprint

- **Foram aplicadas correções de runtime para os 7 gaps criticos e altos locais selecionados**
- **NÃO** foram alterados objetos R2
- **NÃO** foram alteradas políticas de assets
- **NÃO** foi modificada a middleware de auth/tenant

---

## 8. Riscos se não corrigido

- Cross-tenant data exfiltration via document streaming/download
- Cross-tenant document deletion
- Violação LGPD (dados pessoais em documentos acessíveis entre empresas)
- Perda de confiança do cliente em ambiente multi-empresa
