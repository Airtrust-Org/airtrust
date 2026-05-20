# 🗑️ Modal de Confirmação de Exclusão

## 📋 Visão Geral

Sistema moderno e consistente para confirmação de exclusões, substituindo os `confirm()` nativos do navegador por um modal bonito e profissional.

---

## 🎯 Componentes Criados

### 1. **ConfirmDeleteModal** (`src/react-app/components/modals/ConfirmDeleteModal.tsx`)
Modal visual com:
- ✅ Ícone de alerta
- ✅ Título personalizável
- ✅ Mensagem descritiva
- ✅ Nome do item destacado
- ✅ Aviso de ação irreversível
- ✅ Botões de cancelar e confirmar

### 2. **useConfirmDelete Hook** (`src/react-app/hooks/useConfirmDelete.tsx`)
Hook personalizado que facilita o uso do modal:
- ✅ Gerencia estado do modal
- ✅ Retorna função `confirm()` e componente `<ConfirmDialog />`
- ✅ Suporta async/await

---

## 📖 Como Usar

### **Passo 1: Importar o Hook**

```typescript
import { useConfirmDelete } from '../hooks/useConfirmDelete';
```

### **Passo 2: Usar no Componente**

```typescript
export default function MeuComponente() {
  const { confirm, ConfirmDialog } = useConfirmDelete();
  
  const handleExcluir = (id: number, nome: string) => {
    confirm({
      message: 'Tem certeza que deseja excluir este item?',
      itemName: nome,
      title: 'Confirmar Exclusão', // opcional
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/items/${id}`, {
            method: 'DELETE'
          });
          
          if (response.ok) {
            alert('Item excluído com sucesso!');
            recarregarLista();
          }
        } catch (error) {
          alert('Erro ao excluir item');
        }
      }
    });
  };
  
  return (
    <div>
      {/* Seu conteúdo */}
      <button onClick={() => handleExcluir(1, 'Item Teste')}>
        Excluir
      </button>
      
      {/* Adicionar no final do JSX */}
      <ConfirmDialog />
    </div>
  );
}
```

---

## 🔄 Migração de `confirm()` Nativo

### **Antes (confirm nativo):**

```typescript
const handleExcluir = async (id: number, nome: string) => {
  if (!confirm(`Tem certeza que deseja excluir "${nome}"?`)) {
    return;
  }
  
  try {
    const response = await fetch(`/api/items/${id}`, { method: 'DELETE' });
    if (response.ok) {
      alert('Excluído!');
    }
  } catch (error) {
    alert('Erro!');
  }
};
```

### **Depois (modal moderno):**

```typescript
const { confirm, ConfirmDialog } = useConfirmDelete();

const handleExcluir = (id: number, nome: string) => {
  confirm({
    message: 'Tem certeza que deseja excluir este item?',
    itemName: nome,
    onConfirm: async () => {
      try {
        const response = await fetch(`/api/items/${id}`, { method: 'DELETE' });
        if (response.ok) {
          alert('Excluído!');
        }
      } catch (error) {
        alert('Erro!');
      }
    }
  });
};

// No JSX, adicionar:
<ConfirmDialog />
```

---

## 🎨 Personalização

### **Opções Disponíveis:**

```typescript
confirm({
  title: 'Título Personalizado',           // Padrão: "Confirmar Exclusão"
  message: 'Mensagem descritiva',          // Obrigatório
  itemName: 'Nome do Item',                // Opcional
  confirmText: 'Sim, Excluir',             // Padrão: "Excluir"
  cancelText: 'Não, Cancelar',             // Padrão: "Cancelar"
  onConfirm: async () => { /* ... */ }     // Obrigatório
});
```

---

## ✅ Exemplo Completo (Manobras.tsx)

Arquivo já migrado: `src/react-app/pages/Manobras.tsx`

Veja este arquivo como referência de implementação completa.

---

## 📝 Arquivos que Precisam Migração

Execute este comando para ver todos os arquivos que ainda usam `confirm()`:

```bash
grep -rn "if.*confirm(" src/react-app --include="*.tsx" --include="*.ts"
```

### **Lista de Arquivos (30+):**
- ✅ `pages/Manobras.tsx` (MIGRADO)
- ⏳ `pages/Qualificacoes.tsx`
- ⏳ `pages/Aeronaves.tsx`
- ⏳ `pages/simuladores/Lista.tsx`
- ⏳ `pages/funcionarios/ListaFuncionarios.tsx`
- ⏳ `components/qualificacoes/ExamesTab.tsx`
- ⏳ `components/qualificacoes/ChecksTab.tsx`
- ⏳ E mais 20+ arquivos...

---

## 🚀 Próximos Passos

1. ✅ Componente criado
2. ✅ Hook criado
3. ✅ Exemplo implementado (Manobras.tsx)
4. ⏳ Migrar todos os outros arquivos
5. ⏳ Remover `confirm()` nativos
6. ⏳ Testar em produção

---

## 💡 Benefícios

✅ **Visual Moderno:** Modal bonito ao invés de alert feio  
✅ **Consistência:** Mesmo padrão em todo o sistema  
✅ **Acessibilidade:** Melhor UX e navegação por teclado  
✅ **Customizável:** Fácil de personalizar cores e textos  
✅ **Profissional:** Aparência mais profissional  

---

**Status:** ✅ Sistema criado e pronto para uso!  
**Próximo:** Migrar os 30+ arquivos restantes
