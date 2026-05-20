# 📚 INDEX: Refatoração Layout Simuladores

**Objetivo**: "termine tudo" - Refatoração completa do módulo Simuladores com Design System  
**Status**: ✅ Fundação Completa | 🚧 28 arquivos pendentes  
**Branch**: `fix/importacao-completa-limpeza`

---

## 🚀 COMECE AQUI

### 1. Para Entender o Progresso

👉 **[RESUMO_EXECUTIVO_REFATORACAO.md](./RESUMO_EXECUTIVO_REFATORACAO.md)**

- O que já foi feito (2 arquivos)
- Próximos passos (28 arquivos)
- Tempo estimado (5-6h)
- Como executar

### 2. Para Executar a Refatoração

👉 **[PROMPT_REFATORACAO_COMPLETA.md](./PROMPT_REFATORACAO_COMPLETA.md)** ⭐ **PRINCIPAL**

- Guia executável passo a passo
- 28 arquivos organizados em 6 grupos
- Padrões de substituição (antes/depois)
- Exemplos de código
- Checklist por arquivo

### 3. Para Acompanhar Status

👉 **[REFATORACAO_LAYOUT_PROGRESSO.md](./REFATORACAO_LAYOUT_PROGRESSO.md)**

- Dashboard de métricas
- Tracking detalhado (2/30 completo)
- Build performance
- Design System adoption

---

## 📂 ARQUIVOS DE CÓDIGO

### Componentes Criados (Referência)

- **`src/react-app/pages/simuladores/components/SimuladoresLayout.tsx`**
  - 5 componentes do Design System
  - 280 linhas
  - Commit: `e6919d29`

### Exemplo Refatorado (Template)

- **`src/react-app/pages/simuladores/index.tsx`**
  - Dashboard principal refatorado
  - 444 linhas (-38)
  - Commit: `1d59f5f1`
  - Use como referência para outros arquivos

---

## 🎯 WORKFLOW DE EXECUÇÃO

```
1. Ler PROMPT_REFATORACAO_COMPLETA.md → Escolher arquivo do Grupo 1
2. Abrir arquivo → Adicionar imports dos componentes
3. Aplicar padrões (consultar exemplos no prompt)
4. Build test → npm run build
5. Commit → git commit -m "refactor(simuladores): [arquivo] ✅"
6. Push → git push origin fix/importacao-completa-limpeza
7. Marcar checkbox em PROMPT_REFATORACAO_COMPLETA.md
8. Repetir para próximo arquivo
```

---

## 📊 PROGRESSO RÁPIDO

```
✅ Completo:  2/30 arquivos (6.7%)
🚧 Pendente: 28/30 arquivos (93.3%)

Grupos:
□ Grupo 1: Cadastros Simples (8 arquivos) - 56 min
□ Grupo 2: Dashboard (1 arquivo) - 10 min
□ Grupo 3: Sessões (3 arquivos) - 45 min
□ Grupo 4: Fichas (4 arquivos) - 60 min
□ Grupo 5: Agenda/Relatórios (4 arquivos) - 60 min
□ Grupo 6: Complexos (2 arquivos) - 60 min

Tempo Total: ~5-6 horas
```

---

## 🔧 COMPONENTES DISPONÍVEIS

```tsx
import {
  SimuladoresLayout, // Wrapper de página
  SimuladoresCard, // Card genérico
  StatCard, // Card de estatística
  Badge, // Badge de status
  EmptyState, // Estado vazio
} from './components/SimuladoresLayout';
```

**Ver detalhes e props**: [PROMPT_REFATORACAO_COMPLETA.md](./PROMPT_REFATORACAO_COMPLETA.md) seção "Componentes Disponíveis"

---

## 📝 COMMITS DA SESSÃO

```bash
e6919d29 - feat(simuladores): cria Design System components
990bf46d - docs(simuladores): relatório execução Fase 2
1d59f5f1 - refactor(simuladores): dashboard principal ✅
b688e8a9 - docs: documentação completa para refatoração
cea1174f - docs: resumo executivo completo
```

**Total**: 5 commits | **Status**: ✅ Todos pushed para GitHub

---

## 🎯 META FINAL

Quando completar os 28 arquivos pendentes:

- ✅ **30/30 arquivos** padronizados com Design System
- ✅ **~500 linhas** de código duplicado removidas
- ✅ **0 TypeScript errors**
- ✅ **Build < 3s**
- ✅ **Módulo Simuladores 100% consistente**

---

## 📚 DOCUMENTOS DISPONÍVEIS

| Arquivo                               | Propósito             | Quando Usar           |
| ------------------------------------- | --------------------- | --------------------- |
| **RESUMO_EXECUTIVO_REFATORACAO.md**   | Overview completo     | Primeira leitura      |
| **PROMPT_REFATORACAO_COMPLETA.md** ⭐ | Guia de execução      | Durante refatoração   |
| **REFATORACAO_LAYOUT_PROGRESSO.md**   | Status e métricas     | Tracking de progresso |
| **REFATORACAO_LAYOUT_SIMULADORES.md** | Specs dos componentes | Referência técnica    |
| **INDEX_REFATORACAO.md** (este)       | Navegação             | Ponto de entrada      |

---

## ⚡ QUICK START

```bash
# 1. Abrir guia principal
cat _migration/PROMPT_REFATORACAO_COMPLETA.md

# 2. Começar pelo Grupo 1 (cadastros simples)
# Arquivo 1: cadastros/equipamentos/index.tsx

# 3. Build test
npm run build

# 4. Commit
git add -A
git commit -m "refactor(simuladores): equipamentos com Design System ✅"
git push origin fix/importacao-completa-limpeza

# 5. Repetir para os próximos 27 arquivos
```

---

## 🏆 RESULTADO ESPERADO

**ANTES**: 30 arquivos inconsistentes, cores hardcoded, headers variados  
**DEPOIS**: 30 arquivos padronizados, 5 componentes reutilizáveis, Design System completo

---

**✅ Tudo pronto para executar!**

Comece por **[PROMPT_REFATORACAO_COMPLETA.md](./PROMPT_REFATORACAO_COMPLETA.md)** → Grupo 1 → Arquivo 1

Boa refatoração! 🚀
