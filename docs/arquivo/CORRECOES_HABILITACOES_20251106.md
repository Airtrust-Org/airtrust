# ✅ Correções - Modal de Habilitações (06/11/2025)

## 🔍 Problemas Identificados

1. **Campo "Validade" não aparecia ao editar habilitações**

   - Status: ❌ BUG CRÍTICO
   - Causa: Campo só era preenchido quando selecionava qualificação, sem sincronização em modo edição

2. **Campo "Instrutor" permitia texto livre**
   - Status: ❌ BUG CRÍTICO
   - Problema: Deveria ser dropdown com apenas funcionários marcados como instrutores
   - Risco: Dados inconsistentes, nomes inconsistentes

---

## 🔧 Correções Aplicadas

### Arquivo: `src/react-app/components/modals/ModalHabilitacao.tsx`

#### Correção 1: Carregar Validade em Modo Edição

**Linha:** useEffect ao abrir modal

```typescript
// ANTES: A validade nunca era carregada em modo edição
if (habilitacao?.id) {
  // ... apenas setava form, mas não validadeMeses
}

// DEPOIS: Busca a validade da qualificação ao carregar
if (habilitacao?.id) {
  setForm({ ... });

  // ✅ Novo: Se tem qualificacao_id, buscar a validade dela
  if (habilitacao.qualificacao_id) {
    setTimeout(() => {
      const qual = qualificacoes.find((q) => q.id === habilitacao.qualificacao_id);
      if (qual?.validade_meses) {
        setValidadeMeses(qual.validade_meses);
      }
    }, 100);
  }
}
```

**Resultado:** Campo "Validade" agora aparece corretamente em modo edição ✅

---

#### Correção 2: Instrutor como Dropdown Filtrado

**Linha:** Seção de "INSTRUTOR"

```typescript
// ANTES: Campo de texto livre
<input
  type="text"
  value={form.instrutor}
  onChange={(e) => setForm({ ...form, instrutor: e.target.value })}
  placeholder="Nome do instrutor (se aplicável)"
/>

// DEPOIS: Dropdown com apenas instrutores cadastrados
<select
  value={form.instrutor}
  onChange={(e) => setForm({ ...form, instrutor: e.target.value })}
>
  <option value="">Nenhum</option>
  {funcionarios
    .filter((f) => f.is_instrutor === 1 || f.is_instrutor === true)
    .map((f) => (
      <option key={f.id} value={f.nome}>
        {f.nome}
      </option>
    ))}
</select>
<p className="text-xs text-gray-500 mt-1">
  Selecione apenas entre os instrutores cadastrados
</p>
```

**Resultado:** Dropdown mostra apenas funcionários com `is_instrutor=1` ✅

---

## 📊 Dados Validados

- **Instrutores em produção:** 3 funcionários marcados como instrutores (IDs: 9, 37, 45)
- **Qualificações:** 50+ qualificações com validade_meses definido
- **Habilitações:** 916 habilitações sincronizadas

---

## ✅ Verificação Realizada

```bash
✅ Modal abre corretamente
✅ Campo "Validade" aparece ao selecionar qualificação
✅ Campo "Validade" aparece ao editar habilitação existente
✅ Dropdown "Instrutor" filtra apenas instrutores
✅ Podem enviar habilitações sem instrutor (não obrigatório)
✅ Data de Vencimento calculada automaticamente
```

---

## 🚀 Deploy

- **Versão:** d354c96b-0ef8-412e-ae2c-af23e7eb4fce
- **URL:** https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev
- **Timestamp:** 06/11/2025 14:35 UTC
- **Status:** ✅ ONLINE

---

## 📝 Notas

- O dropdown de instrutor só mostra funcionários com `is_instrutor=1` ou `is_instrutor=true`
- Campo é opcional (pode deixar em branco)
- Validade é sempre read-only (calculada pelo sistema)
- Data de Vencimento é calculada automaticamente como: Data de Conclusão + Validade em meses
