# AirTrust R2 Metadata Tenant Plan v0.5

**Date:** 2026-06-02
**Sprint:** J — Supabase Preparation
**Status:** Plano criado, sem alteração em objetos R2 reais.

---

## 1. Política atual de chaves/prefixos

O R2 armazena objetos com chaves organizadas por prefixo:

| Prefixo | Tipo | Acesso |
|---|---|---|
| `empresas/{id}/logo*.png` | Logos/branding | Público (CDN, sem auth) |
| `empresas/{id}/certificado-logo*` | Logo de certificado | Público |
| `empresas/{id}/sistema-logo*` | Logo do sistema | Público |
| `empresas/{id}/favicon*` | Favicon | Público |
| `fira/{empresa_id}/*` | Relatórios FIRA PDF | Tenant-scoped (auth + empresa_id match) |
| `certificados/*` | Certificados PDF | Bloqueado no gateway público. Servido via rotas autenticadas dedicadas. |
| `funcionarios/{id}/*` | Documentos de funcionários | Bloqueado no gateway público |
| `qualificacoes/*` | Documentos de qualificações | Bloqueado no gateway público |
| `lms/scorm/{empresa_id}/{curso_id}/*` | SCORM packages | Self-authenticating JWT |
| `lms/h5p/{prefix}/*` | H5P content | Self-authenticating JWT |
| `backups/{uuid}/*` | Database backups | Admin apenas |

**Problema:** Objetos R2 não carregam metadata de tenant. A tenant isolation é 100% dependente do código da aplicação (rotas que fazem JOIN em `funcionarios.empresa_id`). Se um bug ou bypass permitir acesso direto ao R2, não há defesa em profundidade.

---

## 2. Necessidade de metadata empresa_id

Adicionar `empresa_id` como custom metadata em cada objeto R2 traria:

1. **Defense-in-depth:** Se a aplicação falhar em verificar empresa_id, o metadata no objeto ainda permite auditoria e validação.
2. **Auditoria offline:** Possibilidade de escanear objetos R2 e verificar se todos os objetos de uma empresa têm o metadata correto.
3. **Validação sem download:** Verificar `empresa_id` de um objeto via `BUCKET.head(key)` (metadata apenas), sem baixar o conteúdo.
4. **Conformidade LGPD:** Facilita identificar e isolar dados de uma empresa específica para atender solicitações de titulares.

---

## 3. Como aplicar em novos uploads

### Em `BUCKET.put()` — adicionar `customMetadata`

```typescript
// Antes:
await bucket.put(r2Key, uint8Array, {
  httpMetadata: { contentType: mime },
});

// Depois:
await bucket.put(r2Key, uint8Array, {
  httpMetadata: { contentType: mime },
  customMetadata: {
    empresa_id: String(empresaId),
    uploaded_by: String(userId),
    uploaded_at: new Date().toISOString(),
  },
});
```

### Arquivos a modificar (estimativa: 8-12 call sites)

| Arquivo | Operações | Complexidade |
|---|---|---|
| `pasta-virtual.ts` | upload geral de documentos | Média |
| `pasta-virtual-extra.ts` | upload legacy | Baixa |
| `qualificacoes-certificados-write.ts` | upload/geração de certificados | Média |
| `lms-cursos.ts` | upload SCORM/thumbnail/PDF/PPTX | Baixa |
| `simuladores-fichas.ts` | logo + PDF de ficha | Baixa |
| Backup services | backup orchestrator, restore | N/A (backups não precisam de tenant metadata) |

---

## 4. Como backfill futuro deve ser feito

Para objetos existentes sem metadata, o backfill seria:

1. **Query D1** para mapear `r2_key → empresa_id`:
   ```sql
   SELECT d.r2_key, f.empresa_id
   FROM documentos d
   JOIN funcionarios f ON f.id = d.funcionario_id
   WHERE d.r2_key IS NOT NULL AND d.deleted_at IS NULL
   ```
2. **Para cada objeto**, chamar `BUCKET.head(key)` para verificar se já tem metadata.
3. **Se não tiver**, fazer `BUCKET.get(key)` → `BUCKET.put(key, data, { customMetadata: { empresa_id } })` — operação de cópia com metadata adicionado.
4. **Validar** que `head` agora retorna o metadata esperado.

**Estimativa:** Script batch a ser executado em ambiente controlado. Depende do volume de objetos.

**Risco:** A operação de "copy with metadata" é na verdade um GET+PUT, o que significa que o objeto é baixado e reenviado. Para objetos grandes (SCORM, vídeos), isso é custoso. Alternativa: Cloudflare não oferece "update metadata only" em objetos existentes.

---

## 5. Como validar sem baixar documento

```typescript
// Verificação de metadata sem baixar conteúdo
const head = await bucket.head(r2Key);
const objectEmpresaId = head?.customMetadata?.empresa_id;

if (objectEmpresaId && String(objectEmpresaId) !== String(currentEmpresaId)) {
  // Possível violação de tenant isolation — alertar
  console.warn(`R2 tenant mismatch: key=${r2Key}, object_empresa=${objectEmpresaId}, request_empresa=${currentEmpresaId}`);
  return new Response('Not Found', { status: 404 });
}
```

Isso pode ser adicionado ao asset gateway (`assets.ts`) como camada adicional de verificação, sem custo significativo (HEAD é operação de metadata, não baixa o conteúdo).

---

## 6. Riscos LGPD

| Risco | Mitigação |
|---|---|
| Metadata contém PII (user_id) | Usar apenas `empresa_id` + `uploaded_at`. NÃO armazenar `user_id`, `user_email`, `funcionario_id` no metadata do objeto. |
| Metadata visível em URLs públicas | Logos públicos não precisam de metadata (são públicos por design). Aplicar metadata apenas em objetos privados. |
| Metadata em backups | Backups não devem conter metadata de tenant (são snapshots do sistema). Ok. |
| Exclusão LGPD — metadata residual | Ao excluir documento via solicitação LGPD, o objeto R2 é deletado completamente (metadata some junto). Sem risco residual. |

---

## 7. O que nunca registrar no metadata

- ❌ Nome do funcionário
- ❌ CPF
- ❌ Email
- ❌ Telefone
- ❌ Qualquer PII
- ❌ Conteúdo do documento
- ❌ Hash do conteúdo (pode ser sensível em conjunto)

**Permitido:**
- ✅ `empresa_id` (número)
- ✅ `uploaded_at` (timestamp)
- ✅ `content_type` (MIME, já existe no httpMetadata)

---

## 8. Plano de testes

1. **Unit test:** Verificar que `BUCKET.put()` é chamado com `customMetadata: { empresa_id }` nos call sites modificados.
2. **Integration test (local/dev):** Fazer upload, verificar com `BUCKET.head()` que metadata existe.
3. **Tenant isolation test:** Tentar acessar objeto da empresa B com token da empresa A. Verificar que `head()` retorna metadata diferente e a rota retorna 404.
4. **Backfill validation script:** Script read-only que lista objetos sem metadata de tenant.

---

## 9. Por que não alterar objetos reais agora

- **Risco de corrupção:** Operações GET+PUT em objetos de produção podem falhar parcialmente, deixando objetos em estado inconsistente.
- **Custo de egress:** Backfill de objetos existentes exigiria download e re-upload, gerando custo de egress e CPU.
- **Sem urgência:** A tenant isolation atual, embora com gaps identificados (ver auditoria), é funcional para o volume atual de 1 empresa.
- **Dependência de correções de código:** Antes de adicionar metadata, os gaps de tenant isolation nas rotas de documentos precisam ser corrigidos (Sprint K). Metadata é camada adicional, não substituta.

---

## 10. Sequência recomendada

1. **Sprint K (GPT-5.5):** Corrigir gaps de tenant isolation nas rotas de documentos
2. **Sprint L:** Adicionar `empresa_id` como metadata em novos uploads (alterar call sites de `BUCKET.put()`)
3. **Sprint M:** Criar script de validação de metadata (read-only)
4. **Sprint N:** Executar backfill de metadata em objetos existentes (se justificado pelo volume multi-empresa)
