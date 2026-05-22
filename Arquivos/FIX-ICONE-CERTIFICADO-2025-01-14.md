# FIX: Ícone de Certificado - Atualização Imediata ao Deletar

**Data:** 14/01/2025  
**Commit:** 886b8ea5  
**Deploy:** Worker d021f5ad-1442-4e2d-af54-29916048eb7a

## 🐛 Problema Reportado

**Sintoma:** Ao deletar o certificado de uma qualificação (ex: Ramon - OPC-139), o ícone permanecia verde (indicando certificado existente) mesmo após a exclusão.

**Criticidade:** ALTA - Coerência de dados e conformidade.

## 🔍 Diagnóstico

### Backend (✅ CORRETO)

1. **DELETE Endpoint** (`qualificacoes-certificados.ts:972`):

   - ✅ Faz soft delete em `documentos`
   - ✅ Remove de `pasta_virtual`
   - ✅ **Limpa `certificado_arquivo_id` em `qualificacoes_historico`** (linhas 1054-1060)

2. **Query `tem_certificado`** (`historico.ts:315`):
   ```sql
   CASE WHEN qh.certificado_arquivo_id IS NOT NULL
     THEN 1 ELSE 0
   END AS tem_certificado
   ```
   - ✅ Lógica correta

### Frontend (❌ BUG)

**Causa Raiz:** Update otimista ausente

1. Modal deletava certificado
2. Backend atualizava DB corretamente
3. Modal chamava `onUploadSuccess()` → `carregarHistorico()`
4. **MAS** o estado local não era atualizado IMEDIATAMENTE
5. Usuário via ícone verde até fechar modal e refetch completar

## ✅ Solução Implementada

### 1. Novo Callback `onDeleteSuccess` (ModalCertificado)

**Interface atualizada:**

```typescript
interface ModalCertificadoProps {
  // ... existentes
  onDeleteSuccess?: (temCertificados: boolean) => void;
}
```

**Implementação no DELETE:**

```typescript
setCertificados((prev) => {
  const novaLista = prev.filter((c) => c.id !== id);

  // Notificar IMEDIATAMENTE sobre mudança
  if (onDeleteSuccess) {
    const temCertificados = novaLista.length > 0;
    onDeleteSuccess(temCertificados);
  }

  return novaLista;
});
```

### 2. Update Otimista (Qualificacoes.tsx)

```typescript
onDeleteSuccess={(temCertificados: boolean) => {
  if (historicoSelecionado?.id) {
    setHistorico((prev) =>
      prev.map((item) =>
        item.id === historicoSelecionado.id
          ? { ...item, tem_certificado: temCertificados ? 1 : 0 }
          : item,
      ),
    );
  }
}}
```

## 📊 Fluxo Corrigido

1. Usuário clica **DELETE** no certificado
2. Backend executa DELETE (correto desde sempre)
3. `setCertificados()` remove da lista local
4. **NOVO:** `onDeleteSuccess(false)` chamado IMEDIATAMENTE
5. **NOVO:** Estado local atualizado: `tem_certificado: 0`
6. **RESULTADO:** Ícone muda de verde → azul INSTANTANEAMENTE
7. Modal fecha → `carregarHistorico()` confirma estado do backend

## 🎯 Resultado

- ✅ Ícone atualiza IMEDIATAMENTE ao deletar certificado
- ✅ Coerência entre UI e banco de dados
- ✅ Sem necessidade de fechar/abrir modal
- ✅ Experiência de usuário fluida (update otimista)

## 📝 Arquivos Modificados

1. `src/react-app/components/modals/ModalCertificado.tsx`:

   - Interface com `onDeleteSuccess`
   - Callback chamado ao deletar

2. `src/react-app/pages/Qualificacoes.tsx`:
   - Implementação do `onDeleteSuccess`
   - Update otimista do estado local

## 🚀 Deploy

- **Build:** ✅ Sem erros
- **Commit:** 886b8ea5
- **Worker:** d021f5ad-1442-4e2d-af54-29916048eb7a
- **Status:** Em produção

## 🧪 Teste de Validação

1. Abrir qualificação com certificado (ícone verde)
2. Clicar em "Gerenciar Certificados"
3. Deletar certificado
4. **VERIFICAR:** Ícone muda para azul IMEDIATAMENTE
5. Fechar modal
6. **VERIFICAR:** Ícone permanece azul (estado sincronizado)

---

**Padrão Aplicado:** Update Otimista + Confirmação Server-Side  
**Técnica:** Optimistic UI Update com callback de sincronização  
**Impacto:** Correção crítica de coerência de dados
