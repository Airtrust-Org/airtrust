# 📋 REFATORAÇÃO GLOBAL DE LAYOUT - AIRTRUST v2
## Data: 2025-11-04 | Status: EM PROGRESSO

---

## 🎯 OBJETIVO GERAL
Padronizar todas as 9 páginas principais com layout profissional uniforme:
- Container com bg-slate-50
- Header com border e spacing consistente
- Dashboard stats com cards coloridos e hover effects
- Divisor visual (border-t-2)
- Tabelas com espaço adequado

---

## 📊 PÁGINAS A REFATORAR

### ✅ Página 1: Certificacoes.tsx
- **Status**: PARCIALMENTE PRONTA (já usa PageLayout)
- **Mudanças**: Melhorar cards stats com StatCard
- **Prioridade**: MÉDIA
- **Impacto**: ~50 linhas

### ✅ Página 2: Habilitacoes.tsx
- **Status**: PARCIALMENTE PRONTA (já usa PageLayout)
- **Mudanças**: Melhorar cards stats com StatCard
- **Prioridade**: MÉDIA
- **Impacto**: ~50 linhas

### 📌 Página 3: FuncionariosDashboard.tsx (Pessoas)
- **Status**: NÃO REFATORADA
- **Mudanças**: Aplicar PageLayout + StatCard completo
- **Prioridade**: ALTA
- **Impacto**: ~100 linhas

### 📌 Página 4: Simuladores.tsx
- **Status**: NÃO REFATORADA
- **Mudanças**: Converter header manual para PageLayout + melhorar estrutura
- **Prioridade**: ALTA
- **Impacto**: ~150 linhas

### 📌 Página 5: PastaVirtual.tsx
- **Status**: NÃO REFATORADA
- **Mudanças**: Aplicar PageLayout + melhorar cards
- **Prioridade**: MÉDIA
- **Impacto**: ~80 linhas

### 📌 Página 6: AuditoriaDatas.tsx
- **Status**: NÃO REFATORADA
- **Mudanças**: Aplicar PageLayout + StatCard
- **Prioridade**: MÉDIA
- **Impacto**: ~70 linhas

### ⚠️ Página 7: FRMS (não encontrada)
- **Status**: NÃO LOCALIZADA
- **Alternativa**: Pode ser módulo dentro de outra página

### ⚠️ Página 8: Hospedagem (não encontrada)
- **Status**: NÃO LOCALIZADA
- **Alternativa**: Pode ser Empresas.tsx

### ⚠️ Página 9: Compliance (diretório)
- **Status**: ENCONTRADA COMO DIRETÓRIO
- **Path**: /src/react-app/pages/compliance/
- **Mudanças**: Aplicar em subpáginas

---

## 🎨 COMPONENTE PRINCIPAL CRIADO

✅ **StatCard.tsx** - Componente para cards de estatísticas
- Cores: blue, green, orange, red, purple, amber, teal, indigo
- Hover effects: shadow + scale(105)
- Icons do Lucide
- Layout: Icon + Label + Value

---

## 🔧 CHECKLIST DE REFATORAÇÃO

### Fase 1: Páginas Simples
- [ ] Certificacoes.tsx - Melhorar cards stats
- [ ] Habilitacoes.tsx - Melhorar cards stats
- [ ] AuditoriaDatas.tsx - Aplicar PageLayout + StatCard

### Fase 2: Páginas Médias
- [ ] FuncionariosDashboard.tsx - Refatoração completa
- [ ] PastaVirtual.tsx - Refatoração com PageLayout

### Fase 3: Páginas Complexas
- [ ] Simuladores.tsx - Refatoração de header + estrutura

### Fase 4: Validação
- [ ] Executar npm run dev
- [ ] Verificar responsividade (mobile/tablet/desktop)
- [ ] Validar cores e spacing
- [ ] Teste de hover effects

---

## 📝 PADRÃO APLICADO

### Container Principal
```tsx
className="min-h-screen bg-slate-50"
```

### Content Wrapper
```tsx
className="max-w-7xl mx-auto px-8 py-12"
```

### Stats Grid
```tsx
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8"
```

### Divisor
```tsx
className="border-t-2 border-gray-200 my-8"
```

### StatCard
```tsx
<StatCard
  label="Total"
  value={stats.total}
  icon={Users}
  color="blue"
/>
```

---

## 🚀 PRÓXIMAS AÇÕES

1. ✅ Criar StatCard.tsx
2. Refatorar Certificacoes.tsx
3. Refatorar Habilitacoes.tsx
4. Refatorar AuditoriaDatas.tsx
5. Refatorar FuncionariosDashboard.tsx
6. Refatorar PastaVirtual.tsx
7. Refatorar Simuladores.tsx
8. Testar no dev server
9. Validar em diferentes resoluções
10. Commit com mudanças globais

---

**Nota**: As páginas já usando PageLayout receberão melhorias nos cards de stats.
Páginas manuais serão completamente refatoradas.
