# Fix: Pasta Virtual - Tela em Branco e Erros React

**Data**: 29/11/2025  
**Status**: ✅ **CORRIGIDO E DEPLOYADO**  
**Version ID**: `2cb9c33a-4d86-4f27-8af1-90c1aaea0cac`

---

## 🐛 Problema Reportado

Ao clicar em "Pasta Virtual", a tela ficava em branco com múltiplos erros no console:

### Erros Identificados:

1. **404 nos Endpoints**:

   ```
   GET /api/certificados/funcionario/5 404 (Not Found)
   GET /api/pasta-virtual/5 404 (Not Found)
   ```

2. **Erro React de Componente Inválido**:

   ```
   PastaVirtualCompleta.tsx:123
   React.jsx: type is invalid -- expected a string or a class/function
   but got: undefined
   ```

3. **Erro de Import Tipo**:

   ```typescript
   Cannot find name 'Documento'. Did you mean 'DocumentoPV'?
   Property 'icone' does not exist on type 'CategoriaPV'
   ```

4. **Mutação Direta de State**:
   ```typescript
   (categorias as unknown as { splice: Function }).splice(...)
   ```

---

## 🔍 Diagnóstico

### Frontend Issues (PastaVirtualCompleta.tsx):

1. **Tipo `Documento` não existia** - referenciava tipo não importado
2. **Acesso a `categoria.icone`** - CategoriaPV não tem essa propriedade
3. **Mutação direta de state** - `splice()` direto no array do hook
4. **Imports não utilizados** - Award, Briefcase, Heart, Shield, etc.
5. **State mal gerenciado** - `categoria.expandido` não refletia UI

### Backend Issues:

1. **Endpoint `/api/certificados/funcionario/:id` não existia**
2. **Endpoint `/api/pasta-virtual/:id` não existia**
3. **Rota `/api/certificados/*` não estava registrada** no index.ts
4. **Hook `deleteDocumento`** assinatura incompatível (esperava 2 params)

---

## ✅ Soluções Aplicadas

### 1. Frontend - PastaVirtualCompleta.tsx

**Imports Corrigidos**:

```typescript
import { usePastaVirtual, TipoDocumento } from '@/react-app/hooks/usePastaVirtual';
import type { DocumentoPV } from '@/react-app/hooks/usePastaVirtual';
import { PASTA_VIRTUAL_CATEGORIAS } from '@/react-app/config/pastaVirtual';
```

**State Management Refatorado**:

```typescript
// ANTES (QUEBRADO):
const toggleCategoria = (tipo: TipoDocumento) => {
  const nova = categorias.map((c) => (c.tipo === tipo ? { ...c, expandido: !c.expandido } : c));
  (categorias as unknown as { splice: Function }).splice(0, categorias.length, ...nova);
};

// DEPOIS (CORRETO):
const [categoriasExpandidas, setCategoriasExpandidas] = useState<Set<TipoDocumento>>(
  new Set(['CERTIFICADO_QUALIFICACAO']),
);

const toggleCategoria = (tipo: TipoDocumento) => {
  setCategoriasExpandidas((prev) => {
    const nova = new Set(prev);
    if (nova.has(tipo)) {
      nova.delete(tipo);
    } else {
      nova.add(tipo);
    }
    return nova;
  });
};
```

**Correção Ícone da Categoria**:

```typescript
// ANTES:
const Icone = categoria.icone; // ❌ Propriedade não existe

// DEPOIS:
const config = PASTA_VIRTUAL_CATEGORIAS.find((c) => c.tipo === categoria.tipo);
const Icone = config?.icone || FileText; // ✅ Busca da config
```

**Tipo Corrigido**:

```typescript
// ANTES:
const handlePreview = (doc: Documento) => {
  /* ❌ Tipo inexistente */
};

// DEPOIS:
const handlePreview = (doc: DocumentoPV) => {
  /* ✅ Tipo correto */
};
```

**Delete Corrigido**:

```typescript
// ANTES:
await deleteDocumento(doc.id); // ❌ Faltava 2º param

// DEPOIS:
await deleteDocumento(doc.id, categoria.tipo); // ✅ Com categoria
```

### 2. Hook - usePastaVirtual.ts

**Assinatura Corrigida**:

```typescript
const deleteDocumento = useCallback(
  async (id: number, _categoria?: TipoDocumento) => {
    const res = await fetch(`/api/pasta-virtual/delete/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Falha ao excluir');
    await refetch();
  },
  [refetch],
);
```

### 3. Backend - pasta-virtual.ts

**Adicionado Endpoint GET /:id**:

```typescript
app.get('/:id', auth(), async (c) => {
  const funcionarioId = parseInt(c.req.param('id'));

  const query = `
    SELECT 
      d.id,
      d.nome_arquivo as nome,
      d.tipo,
      d.tamanho,
      d.r2_key as arquivo_url,
      d.created_at as dataUpload,
      'ATIVO' as status
    FROM documentos d
    WHERE d.funcionario_id = ? AND d.deleted_at IS NULL
    ORDER BY d.created_at DESC
  `;

  const { results } = await db.prepare(query).bind(funcionarioId).all();

  return c.json({
    success: true,
    data: { arquivos: results || [] },
  });
});
```

**Adicionado Endpoint DELETE /delete/:id**:

```typescript
app.delete('/delete/:id', auth(), requireRole('admin', 'manager'), async (c) => {
  const id = parseInt(c.req.param('id'));

  const documento = await db
    .prepare('SELECT * FROM documentos WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<Documento>();

  if (!documento) {
    notFound('Documento não encontrado');
  }

  await softDelete(db, 'documentos', id);
  await bucket.delete(documento.r2_key);

  return c.json({ success: true, message: 'Documento removido' });
});
```

### 4. Backend - qualificacoes-certificados.ts

**Adicionado Endpoint GET /funcionario/:id**:

```typescript
app.get('/funcionario/:id', auth(), async (c) => {
  const funcionarioId = parseInt(c.req.param('id'));

  const query = `
    SELECT 
      d.id,
      d.nome_arquivo,
      d.r2_key as arquivo_url,
      d.created_at as uploaded_at,
      qh.data_conclusao as data_documento,
      d.tamanho as arquivo_tamanho
    FROM documentos d
    LEFT JOIN qualificacoes_historico qh ON d.historico_id = qh.id
    WHERE qh.funcionario_id = ? 
      AND d.deleted_at IS NULL
      AND qh.deleted_at IS NULL
    ORDER BY d.created_at DESC
  `;

  const { results } = await db.prepare(query).bind(funcionarioId).all();

  return c.json({ success: true, data: results || [] });
});
```

### 5. Backend - index.ts

**Registrada Rota de Certificados**:

```typescript
/**
 * Rotas de Certificados de Qualificações
 * GET    /api/certificados/funcionario/:id
 * GET    /api/certificados/historico/:id/certificados
 * POST   /api/certificados/historico/:id/certificados
 * DELETE /api/certificados/historico/:id/certificados/:certId
 */
app.route('/api/certificados', qualificacoesCertificadosRoutes);
```

---

## ✅ Validação

### Build:

```bash
npm run build
✓ 2644 modules transformed
✓ built in 2.32s
```

### Deploy:

```bash
./deploy-full-automated.sh
✅ Deploy pipeline concluído
Version ID: 2cb9c33a-4d86-4f27-8af1-90c1aaea0cac
```

### Endpoints Funcionando:

- ✅ `GET /api/pasta-virtual/:id` - Lista documentos por funcionário
- ✅ `GET /api/certificados/funcionario/:id` - Lista certificados
- ✅ `DELETE /api/pasta-virtual/delete/:id` - Remove documento

---

## 📊 Resumo dos Arquivos Alterados

| Arquivo                         | Alterações                                | Status |
| ------------------------------- | ----------------------------------------- | ------ |
| `PastaVirtualCompleta.tsx`      | Imports, types, state management          | ✅     |
| `usePastaVirtual.ts`            | Assinatura de deleteDocumento             | ✅     |
| `pasta-virtual.ts`              | +2 endpoints (GET/:id, DELETE/delete/:id) | ✅     |
| `qualificacoes-certificados.ts` | +1 endpoint (GET/funcionario/:id)         | ✅     |
| `index.ts`                      | Registro rota /api/certificados           | ✅     |

**Total**: 5 arquivos, 442 insertions, 36 deletions

---

## 🎯 Resultado Final

✅ **Tela em branco corrigida**  
✅ **Todos os endpoints criados**  
✅ **React errors eliminados**  
✅ **State management correto**  
✅ **Build sem erros**  
✅ **Deploy em produção**

A Pasta Virtual agora carrega corretamente e exibe documentos organizados por categoria.

---

**Commit**: `74368781e` - fix: corrigir pasta virtual - imports, endpoints e state management  
**Deploy**: `2e2d3638` - deploy: auto build + publish 2025-11-29
