# 🎫 Certificados - Integração Segura (SEM QUEBRAS)

**Data:** November 2, 2025  
**Status:** ✅ SAFE INTEGRATION - Preserves existing functionality  
**Objetivo:** Adicionar menu com GERAR + IMPORTAR + DOWNLOAD

---

## ✅ ANÁLISE DO CÓDIGO EXISTENTE

### Componentes Já Implementados

- ✅ **CertificadoUpload.tsx** - Função de importar já existe e funciona
- ✅ **CertificadoLista.tsx** - Lista de certificados já existe
- ✅ **Qualificacoes.tsx** - Modal de certificados já integrado (linhas 2045-2100)

### Fluxo Atual (FUNCIONAL)

```
Qualificacoes.tsx (linha 2052)
  └─> CertificadoUpload (renderiza form de upload)
      └─> POST /api/v2/qualificacoes/{id}/upload-certificado
          └─> Salva em R2 e D1

Qualificacoes.tsx (linha 2069)
  └─> CertificadoLista (renderiza lista)
      └─> GET /api/v2/qualificacoes/{id}/certificados
          └─> Lista de R2
```

---

## 🔒 O QUE NÃO VAI FAZER

❌ Reescrever `CertificadoUpload.tsx`  
❌ Remover `CertificadoUpload.tsx`  
❌ Mexer na função de importar  
❌ Mexer nas rotas de upload  
❌ Mexer no schema do D1

---

## ✅ O QUE VAI FAZER

### 1. Adicionar Menu com Dropdown

**Local:** Acima do `CertificadoUpload` (linha 2051)

```tsx
// NOVO: Menu com opções
{
  /* Menu de Certificados */
}
<div className="flex gap-2 mb-6">
  <button
    onClick={() => setShowCertMenu(!showCertMenu)}
    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
  >
    📄 Certificados
  </button>

  {showCertMenu && (
    <div className="absolute bg-white border border-gray-300 rounded-lg shadow-lg z-10">
      <button
        onClick={handleGerarCertificado}
        className="block w-full text-left px-4 py-2 hover:bg-gray-100"
      >
        📄 Gerar Certificado
      </button>
      {/* CertificadoUpload já tem botão próprio, mas podemos adicionar */}
    </div>
  )}
</div>;
```

### 2. Adicionar Função GERAR

**Novo handler:**

```tsx
const handleGerarCertificado = async () => {
  // Validar
  if (!modalCertificado.data_conclusao || !modalCertificado.data_vencimento) {
    alert('Preencha datas de conclusão e vencimento');
    return;
  }

  // Confirmar
  if (!window.confirm('Confirmar geração do certificado?')) return;

  try {
    setLoading(true);
    const response = await fetch(`/api/v2/qualificacoes/${modalCertificado.id}/gerar-certificado`, {
      method: 'POST',
    });

    if (response.ok) {
      alert('Certificado gerado com sucesso!');
      carregarQualificacoes();
    } else {
      alert('Erro ao gerar certificado');
    }
  } catch (error) {
    console.error(error);
    alert('Erro ao gerar certificado');
  } finally {
    setLoading(false);
  }
};
```

### 3. Backend - Adicionar Endpoint GERAR

**Arquivo:** `src/worker/api/v2/qualificacoes.ts`

Endpoint novo:

```typescript
app.post('/:id/gerar-certificado', async (c) => {
  const id = c.req.param('id');

  try {
    // Buscar qualificação
    const qualif = await db
      .prepare(`SELECT * FROM qualificacoes WHERE id = ? AND deleted_at IS NULL`)
      .bind(id)
      .first();

    if (!qualif) return c.json({ error: 'Não encontrada' }, 404);

    // Validar datas
    if (!qualif.data_conclusao || !qualif.data_vencimento) {
      return c.json({ error: 'Datas obrigatórias' }, 400);
    }

    // Marcar como gerado (SIMPLES: apenas atualizar flag)
    await db
      .prepare(
        `UPDATE qualificacoes 
       SET certificado_status = 'GERADO',
           certificado_gerado_em = datetime('now')
       WHERE id = ?`,
      )
      .bind(id)
      .run();

    return c.json({ success: true });
  } catch (error) {
    Logger.error('Erro ao gerar cert:', error);
    return c.json({ error: 'Erro' }, 500);
  }
});
```

### 4. Frontend - Exibir Status

**No CertificadoLista ou nova seção:**

```tsx
{
  qualificacao.certificado_status === 'GERADO' && (
    <div className="text-green-600 text-sm">
      ✅ Certificado gerado em {qualificacao.certificado_gerado_em}
    </div>
  );
}
```

---

## 📋 CHECKLIST DE SEGURANÇA

- [ ] Não mexeu em CertificadoUpload.tsx
- [ ] Não mexeu em CertificadoLista.tsx
- [ ] Não mexeu em rotas de upload
- [ ] Não mexeu em validações existentes
- [ ] Menu novo não quebra UI
- [ ] Handler novo é simples e seguro
- [ ] Endpoint novo não mexe em dados existentes
- [ ] Build compila sem erros

---

## 🚀 IMPLANTAÇÃO

### Fase 1: Frontend (Menu + Handler)

1. Adicionar estado `showCertMenu`
2. Adicionar componente menu
3. Adicionar handler `handleGerarCertificado`

### Fase 2: Backend (Endpoint)

1. Adicionar endpoint POST `/qualificacoes/:id/gerar-certificado`
2. Testar com curl
3. Deploy

### Fase 3: Testes

- [ ] Abrir modal de certificados
- [ ] Clicar em "Certificados"
- [ ] Ver menu aparecer
- [ ] Clicar em "Gerar"
- [ ] Ver sucesso
- [ ] Importar ainda funciona?
- [ ] Listar ainda funciona?

---

## ⚠️ IMPORTANTE

**Esta é uma integração SEGURA porque:**

✅ Usa componentes existentes  
✅ Não modifica upload existente  
✅ Rota de importar não muda  
✅ Menu é simples dropdown  
✅ Gerar é apenas update de flag  
✅ Banco mantém dados antigos

**Se algo quebrar:**

1. Menu não aparecer? Checar estado `showCertMenu`
2. Upload parar de funcionar? Revert do código
3. Erro no backend? Ver logs de deploy

---

## 📝 NOTAS

- Gerar = Mark as generated (não gera PDF ainda, apenas flag)
- Import = Usar componente existente CertificadoUpload
- Download = Já existe em CertificadoLista
- Sem quebra de dados
- Sem quebra de tipos
- Sem rewrite de componentes

**STATUS: PRONTO PARA IMPLEMENTAR** ✅
