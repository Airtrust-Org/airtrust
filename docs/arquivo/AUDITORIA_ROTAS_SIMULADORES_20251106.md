# 🔍 AUDITORIA CRÍTICA - Rotas de Simuladores/Fichas/Agendamentos

## ⚠️ PROBLEMAS IDENTIFICADOS

### 1. **DUPLICATAS DE ROTAS**

```
/api/v2/fichas-pdf (fichasPdfStorage)     ❌ Genérico
/api/v2/simulador/fichas-pdf              ❌ Outro PDF

/api/v2/fichas (fichasAvaliacao)          ✅ Fichas de avaliação
/api/v2/fichas (fichasPdf - REMOVIDO)     ❌ Obsoleto, não em uso
```

### 2. **IMPORTS NÃO UTILIZADOS**

```typescript
import fichasPdf from '../api/v2/fichas-pdf'; // ❌ NÃO USADO
import fichas from '../api/v2/fichas'; // ❌ NÃO USADO
import { simuladoresRoutes } from '../routes/simuladores'; // ❌ NÃO USADO
```

### 3. **ARQUIVOS OBSOLETOS OU CONFLITANTES**

```
src/worker/api/v2/fichas.ts              ← Não importado
src/worker/api/v2/fichas-pdf.ts          ← Comentários grandes, genérico
src/worker/routes/simuladores/index.ts   ← Importado mas não usado
```

### 4. **FALTA DE CLAREZA NA ORDEM**

```
/api/v2/agendamentos                     ← Agendamentos (base)
/api/v2/fichas                           ← Fichas de avaliação
/api/v2/fichas-pdf                       ← PDF armazenado
/api/v2/simulador/ficha                  ← Assinatura de ficha
/api/v2/simulador/fichas                 ← CRUD de fichas
/api/v2/simulador/fichas-pdf             ← PDF gerador
```

---

## 📋 ARQUIVOS REAIS E SEU PROPÓSITO

### **AGENDAMENTOS**

- `src/worker/api/v2/agendamentos.ts` ✅
  - GET /api/v2/agendamentos (list com filtros)
  - POST /api/v2/agendamentos (criar novo)
  - PUT /api/v2/agendamentos/:id (atualizar)
  - DELETE /api/v2/agendamentos/:id (soft delete)

### **FICHAS - AVALIAÇÃO**

- `src/worker/api/v2/fichas-avaliacao.ts` ✅
  - GET /api/v2/fichas (listar fichas de avaliação)
  - GET /api/v2/fichas/:uuid (detalhe de ficha com manobras)
  - Integra com avaliacoes_manobras para pontuação

### **FICHAS - ASSINATURA DIGITAL**

- `src/worker/api/v2/fichas-assinatura.ts` ✅
  - POST /api/v2/simulador/ficha/:uuid/assinar (assinar digitalmente)
  - GET /api/v2/simulador/ficha/:uuid/assinaturas (listar assinaturas)
  - Registra em fichas_sessao com timestamps

### **FICHAS - PDF (STORAGE)**

- `src/worker/api/v2/fichas-pdf-storage.ts` ✅
  - GET /api/v2/fichas-pdf/:id/pdf (retorna HTML/PDF armazenado)
  - Busca ficha completa com dados do funcionário

### **FICHAS - PDF (GERADOR)**

- `src/worker/api/v2/pdf-generator-fichas.ts` ✅
  - GET /api/v2/simulador/fichas-pdf/:uuid/pdf (gera PDF em tempo real)
  - Mais completo que storage, com cálculos

### **FICHAS - CRUD**

- `src/worker/api/v2/simulador-fichas-crud.ts` ✅
  - GET /api/v2/simulador/fichas (listar fichas do simulador)
  - GET /api/v2/simulador/fichas/:id (detalhe)
  - PUT /api/v2/simulador/fichas/:id (atualizar)
  - DELETE /api/v2/simulador/fichas/:id (deletar)

### **FICHAS - ARQUIVO SEM USO (OBSOLETO)**

- `src/worker/api/v2/fichas.ts` ❌
  - GET / (list)
  - GET /:id (detalhe)
  - **NÃO IMPORTADO** - REMOVER

### **FICHAS - GERADOR (COMENTÁRIOS GRANDES)**

- `src/worker/api/v2/fichas-pdf.ts` ❌
  - **NÃO IMPORTADO** - REMOVER (ou consolidar em fichas-pdf-storage)

### **SIMULADOR - AGENDAMENTO (ALTERNATIVO)**

- `src/worker/api/v2/simulador-agendamento-airtrust.ts` ⚠️
  - GET /api/v2/simulador (lista slots de agendamento)
  - Alternativa ao /api/v2/agendamentos
  - **CONFLITANTE** - Decidir qual usar

### **SIMULADOR - SLOTS**

- `src/worker/api/v2/simulador-slots.ts` ✅
  - GET /api/v2/simulador/slots (retorna agendamentos formatados)
  - Visualização para UI (calendário)

### **SIMULADOR - MODELOS**

- `src/worker/api/v2/simuladores-modelos.ts` ✅
  - GET /api/v2/simuladores/modelos (lista templates)
  - GET /api/v2/simuladores/modelos/:id (detalhe)

### **MANOBRAS**

- Multiple files em src/worker/api/v2/
  - GET /api/v2/manobras (lista)
  - GET /api/v2/manobras/avaliar (avaliar)
  - POST /api/v2/simulador/manobras/avaliar

### **RUTAS NÃO UTILIZADAS**

- `src/worker/routes/simuladores/index.ts` ❌
  - Importado mas não usado em index.ts
  - REMOVER ou consolidar

---

## ✅ CONSOLIDAÇÃO PROPOSTA

### **REMOVER** (Não estão em uso)

```typescript
// Em src/worker/routes/index.ts, REMOVER:
import fichasPdf from '../api/v2/fichas-pdf'; // Não usado
import fichas from '../api/v2/fichas'; // Não usado
import { simuladoresRoutes } from '../routes/simuladores'; // Não usado

// Remover rota:
// app.route('/api/v2/fichas', fichasPdf); // ❌ REMOVER
```

### **DELETAR** (Arquivos obsoletos)

```bash
rm src/worker/api/v2/fichas.ts
rm src/worker/api/v2/fichas-pdf.ts (consolidar em fichas-pdf-storage)
rm src/worker/routes/simuladores/index.ts
```

### **CONSOLIDADO** (Ordem clara)

```typescript
// AGENDAMENTOS
app.route('/api/v2/agendamentos', agendamentos);

// FICHAS - AVALIAÇÃO
app.route('/api/v2/fichas', fichasAvaliacao);

// FICHAS - ASSINATURA DIGITAL
app.route('/api/v2/simulador/ficha', fichasAssinatura);

// FICHAS - PDF
app.route('/api/v2/fichas-pdf', fichasPdfStorage); // Storage
app.route('/api/v2/simulador/fichas-pdf', pdfGeneratorFichas); // Generator

// FICHAS - CRUD
app.route('/api/v2/simulador/fichas', simuladorFichasCrud);

// SIMULADOR
app.route('/api/v2/simulador/slots', simuladorSlots);
app.route('/api/v2/simulador', simuladorAgendamentoAirtrust);

// MANOBRAS
app.route('/api/v2/manobras', manobrasV2);
app.route('/api/v2/manobras/avaliar', manobrasAvaliar);

// MODELOS
app.route('/api/v2/simuladores/modelos', simuladoresModelos);
```

---

## 🧪 TESTES NECESSÁRIOS

### Agendamentos

- [ ] POST /api/v2/agendamentos (criar)
- [ ] GET /api/v2/agendamentos (listar)
- [ ] PUT /api/v2/agendamentos/:id (atualizar)
- [ ] DELETE /api/v2/agendamentos/:id (soft delete)

### Fichas - Avaliação

- [ ] GET /api/v2/fichas (listar)
- [ ] GET /api/v2/fichas/:uuid (detalhe com manobras)

### Fichas - Assinatura

- [ ] POST /api/v2/simulador/ficha/:uuid/assinar
- [ ] GET /api/v2/simulador/ficha/:uuid/assinaturas

### Fichas - PDF

- [ ] GET /api/v2/fichas-pdf/:id/pdf (storage)
- [ ] GET /api/v2/simulador/fichas-pdf/:uuid/pdf (generator)

### Fichas - CRUD

- [ ] GET /api/v2/simulador/fichas
- [ ] GET /api/v2/simulador/fichas/:id
- [ ] PUT /api/v2/simulador/fichas/:id
- [ ] DELETE /api/v2/simulador/fichas/:id

### Simulador

- [ ] GET /api/v2/simulador/slots
- [ ] GET /api/v2/simulador (alternativa de agendamentos)

---

## ⚠️ DECISÃO NECESSÁRIA

**Conflito:** Duas formas de listar agendamentos

1. `GET /api/v2/agendamentos` (agendamentos.ts)
2. `GET /api/v2/simulador` (simulador-agendamento-airtrust.ts)

**Recomendação:**

- Manter `/api/v2/agendamentos` (padronizado)
- Deletar `/api/v2/simulador` ou deixar apenas para slots

---

## 📝 PRÓXIMAS AÇÕES

1. ✅ Revisar validação de instrutor (is_instrutor=1 OR funcao='INSTRUTOR')
2. ⚠️ Testar TODOS os 10+ endpoints de simuladores/fichas
3. 🗑️ Remover imports não utilizados
4. 🗑️ Deletar arquivos obsoletos
5. 📋 Consolidar roteamento
6. 🧪 Executar suite completa de testes

---

**Status:** Auditoria em progresso
**Data:** 06/11/2025 12:45 UTC
**Problemas Encontrados:** 8
**Arquivos Obsoletos:** 3
**Imports Não Utilizados:** 3
