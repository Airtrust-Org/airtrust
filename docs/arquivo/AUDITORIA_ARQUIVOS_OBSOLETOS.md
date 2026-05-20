# 🔍 AUDITORIA - ARQUIVOS OBSOLETOS NO MÓDULO SIMULADORES

**Data:** 1 de dezembro de 2025, 13:32  
**Status:** ⚠️ ENCONTRADOS 5 ARQUIVOS NÃO UTILIZADOS

---

## ❌ ARQUIVOS OBSOLETOS (Não importados no App.tsx)

### 1. `/src/react-app/pages/AgendarSimulador.tsx`

- **Status:** Não usado
- **Motivo:** Funcionalidade movida para `/simuladores/NovaSessao.tsx`
- **Ação:** DELETAR

### 2. `/src/react-app/pages/AvaliarFichaSimulador.tsx`

- **Status:** Não usado
- **Motivo:** Funcionalidade em `/simuladores/FichaDetalhe.tsx`
- **Ação:** DELETAR

### 3. `/src/react-app/pages/EditarFichaSimulador.tsx`

- **Status:** Não usado
- **Motivo:** Funcionalidade em `/simuladores/FichaDetalhe.tsx`
- **Ação:** DELETAR

### 4. `/src/react-app/pages/FichaSimulador.tsx`

- **Status:** Não usado
- **Motivo:** Funcionalidade em `/simuladores/FichasSessao.tsx`
- **Ação:** DELETAR

### 5. `/src/react-app/pages/VisualizarFichaSimulador.tsx`

- **Status:** Não usado
- **Motivo:** Funcionalidade em `/simuladores/FichaDetalhe.tsx`
- **Ação:** DELETAR

---

## ✅ ARQUIVOS MANTIDOS (Em uso ou necessários)

### Arquivo Principal

- ✅ `/src/react-app/pages/Simuladores.tsx` - **PRINCIPAL** (921 linhas)
- ✅ `/src/react-app/pages/SimuladoresDashboard.tsx` - Dashboard separado

### Subpáginas Funcionais

- ✅ `/src/react-app/pages/simuladores/AgendaCalendario.tsx`
- ✅ `/src/react-app/pages/simuladores/FichasSessao.tsx`
- ✅ `/src/react-app/pages/simuladores/FichaDetalhe.tsx`
- ✅ `/src/react-app/pages/simuladores/NovaSessao.tsx`
- ✅ `/src/react-app/pages/simuladores/RelatoriosSimuladores.tsx`

### CRUDs

- ✅ `/src/react-app/pages/simuladores/CrudSimuladores.tsx`
- ✅ `/src/react-app/pages/simuladores/CrudManobras.tsx`
- ✅ `/src/react-app/pages/simuladores/CrudModelos.tsx`
- ✅ `/src/react-app/pages/simuladores/CrudCategorias.tsx`
- ✅ `/src/react-app/pages/simuladores/CrudTiposSessao.tsx`
- ✅ `/src/react-app/pages/simuladores/CrudInstrutores.tsx`
- ✅ `/src/react-app/pages/simuladores/CrudTemplates.tsx`

### Tabs

- ✅ `/src/react-app/pages/simuladores/tabs/SessoesTab.tsx`
- ✅ `/src/react-app/pages/simuladores/tabs/FichasTab.tsx`
- ✅ `/src/react-app/pages/simuladores/tabs/CadastrosTab.tsx`
- ✅ `/src/react-app/pages/simuladores/tabs/ManobrasTab.tsx`
- ✅ `/src/react-app/pages/simuladores/tabs/AgendaTab.tsx`
- ✅ `/src/react-app/pages/simuladores/tabs/CategoriasTab.tsx`

---

## 🎯 RECOMENDAÇÃO

**Comando para deletar arquivos obsoletos:**

```bash
rm -v \
  src/react-app/pages/AgendarSimulador.tsx \
  src/react-app/pages/AvaliarFichaSimulador.tsx \
  src/react-app/pages/EditarFichaSimulador.tsx \
  src/react-app/pages/FichaSimulador.tsx \
  src/react-app/pages/VisualizarFichaSimulador.tsx
```

**Benefícios:**

- 🗑️ Remove 5 arquivos não utilizados
- 📉 Reduz confusão sobre qual arquivo usar
- 🧹 Limpeza da estrutura de pastas
- 📦 Build potencialmente mais rápido (menos arquivos para parsear)

---

## 📊 IMPACTO

| Métrica                      | Antes | Depois | Melhoria |
| ---------------------------- | ----- | ------ | -------- |
| Arquivos simuladores na raiz | 7     | 2      | -71%     |
| Arquivos não utilizados      | 5     | 0      | -100%    |
| Clareza da estrutura         | Média | Alta   | +++      |

---

## ⚠️ ARQUIVOS SUSPEITOS (Verificar se são usados)

Esses arquivos existem em `/simuladores/` mas não tenho certeza se estão em uso:

- ❓ `/src/react-app/pages/simuladores/AgendaMensal.tsx`
- ❓ `/src/react-app/pages/simuladores/AgendaSemanal.tsx`
- ❓ `/src/react-app/pages/simuladores/AprovarSessao.tsx`
- ❓ `/src/react-app/pages/simuladores/ConfiguracoesCadastros.tsx`
- ❓ `/src/react-app/pages/simuladores/Dashboard.tsx`
- ❓ `/src/react-app/pages/simuladores/DetalhesSessao.tsx`
- ❓ `/src/react-app/pages/simuladores/EditarModeloSessao.tsx`
- ❓ `/src/react-app/pages/simuladores/Equipamentos.tsx`
- ❓ `/src/react-app/pages/simuladores/ExecutarSessao.tsx`
- ❓ `/src/react-app/pages/simuladores/FormSessao.tsx`
- ❓ `/src/react-app/pages/simuladores/FormSimulador.tsx`
- ❓ `/src/react-app/pages/simuladores/HistoricoFuncionario.tsx`
- ❓ `/src/react-app/pages/simuladores/ImportarRelacoesInteligente.tsx`
- ❓ `/src/react-app/pages/simuladores/Lista.tsx`
- ❓ `/src/react-app/pages/simuladores/NovoAgendamento.tsx`
- ❓ `/src/react-app/pages/simuladores/Templates.tsx`
- ❓ `/src/react-app/pages/simuladores/index.tsx`

**Recomendação:** Auditar cada um desses no App.tsx para confirmar se estão em rotas ativas.

---

**Próxima Ação:** Deletar os 5 arquivos obsoletos confirmados e fazer auditoria completa dos suspeitos.
