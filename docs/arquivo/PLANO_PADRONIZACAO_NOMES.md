# 📋 PLANO DE PADRONIZAÇÃO DE NOMENCLATURA

**Data:** 23/10/2025 03:15  
**Objetivo:** Padronizar nomes dos 14 componentes de importação

---

## 🎯 PADRÃO PROPOSTO

### **Regras de Nomenclatura:**

1. **Idioma:** Inglês (padrão do projeto)
2. **Formato:** `[Tipo][Entidade]Import[Sufixo].tsx`
3. **Tipos:**
   - `Base` - Componente base reutilizável
   - `Modal` - Modal de importação
   - `Page` - Página completa
   - `Utils` - Utilitários

4. **Sufixos:**
   - Sem sufixo - Modal genérico
   - `Advanced` - Funcionalidade avançada
   - `CSV` - Específico para CSV
   - `Validator` - Validador

---

## 📊 MAPEAMENTO: ANTES → DEPOIS

### **GRUPO 1: COMPONENTES BASE (2)**

#### 1. ImportacaoPadrao.tsx → **BaseImport.tsx**
- **Localização:** `src/react-app/components/common/`
- **Motivo:** Nome mais claro e em inglês
- **Usos:** 6 componentes
- **Prioridade:** ALTA

#### 2. ImportacaoUniversal.tsx → **UniversalImport.tsx**
- **Localização:** `src/react-app/components/common/`
- **Motivo:** Padronizar para inglês
- **Usos:** 1 componente
- **Prioridade:** MÉDIA

---

### **GRUPO 2: MODAIS GENÉRICOS (5)**

#### 3. ImportModal.tsx (root) → **GenericImportModal.tsx**
- **Localização:** `src/react-app/components/`
- **Motivo:** Evitar conflito de nomes
- **Usos:** 14 componentes ⭐
- **Prioridade:** ALTA

#### 4. ImportModal.tsx (modals) → **StandardImportModal.tsx**
- **Localização:** `src/react-app/components/modals/`
- **Motivo:** Evitar conflito de nomes
- **Usos:** Múltiplos
- **Prioridade:** ALTA

#### 5. ImportModal.tsx (ImportExport) → **ExportImportModal.tsx**
- **Localização:** `src/react-app/components/ImportExport/`
- **Motivo:** Evitar conflito + contexto claro
- **Usos:** Múltiplos
- **Prioridade:** ALTA

#### 6. UniversalImportModal.tsx → **MANTER**
- **Localização:** `src/react-app/components/modals/`
- **Motivo:** Nome já está bom
- **Usos:** 4 componentes
- **Prioridade:** N/A

#### 7. AdvancedImportModal.tsx → **MANTER**
- **Localização:** `src/react-app/components/shared/`
- **Motivo:** Nome já está bom
- **Usos:** 2 componentes
- **Prioridade:** N/A

#### 8. ImportCSVModal.tsx → **CSVImportModal.tsx**
- **Localização:** `src/react-app/components/`
- **Motivo:** Padronizar ordem (tipo antes de sufixo)
- **Usos:** 1 componente
- **Prioridade:** BAIXA

---

### **GRUPO 3: MODAIS ESPECÍFICOS (3)**

#### 9. ImportarManobrasPadrao.tsx → **ManeuversImportModal.tsx**
- **Localização:** `src/react-app/components/simuladores/`
- **Motivo:** Inglês + nome mais claro
- **Usos:** 1 componente
- **Prioridade:** MÉDIA

#### 10. CertificacoesImportModal.tsx → **CertificationsImportModal.tsx**
- **Localização:** `src/react-app/components/shared/`
- **Motivo:** Traduzir para inglês
- **Usos:** 3 componentes
- **Prioridade:** MÉDIA

#### 11. ImportadorCSVSimuladores.tsx → **SimulatorsCSVImport.tsx**
- **Localização:** `src/react-app/components/simuladores/`
- **Motivo:** Inglês + ordem padronizada
- **Usos:** 1 componente
- **Prioridade:** BAIXA

---

### **GRUPO 4: PÁGINAS (1)**

#### 12. ImportacaoExcel.tsx → **QualificationsImportPage.tsx**
- **Localização:** `src/react-app/pages/qualificacoes/`
- **Motivo:** Nome mais descritivo + inglês
- **Usos:** 2 componentes
- **Prioridade:** MÉDIA

---

### **GRUPO 5: UTILITÁRIOS (1)**

#### 13. ImportValidator.tsx → **MANTER**
- **Localização:** `src/react-app/components/shared/`
- **Motivo:** Nome já está perfeito
- **Usos:** 1 componente
- **Prioridade:** N/A

---

## 📋 RESUMO DAS MUDANÇAS

### **RENOMEAR (10 arquivos):**

1. ✅ `ImportacaoPadrao.tsx` → `BaseImport.tsx`
2. ✅ `ImportacaoUniversal.tsx` → `UniversalImport.tsx`
3. ✅ `ImportModal.tsx` (root) → `GenericImportModal.tsx`
4. ✅ `ImportModal.tsx` (modals) → `StandardImportModal.tsx`
5. ✅ `ImportModal.tsx` (ImportExport) → `ExportImportModal.tsx`
6. ✅ `ImportCSVModal.tsx` → `CSVImportModal.tsx`
7. ✅ `ImportarManobrasPadrao.tsx` → `ManeuversImportModal.tsx`
8. ✅ `CertificacoesImportModal.tsx` → `CertificationsImportModal.tsx`
9. ✅ `ImportadorCSVSimuladores.tsx` → `SimulatorsCSVImport.tsx`
10. ✅ `ImportacaoExcel.tsx` → `QualificationsImportPage.tsx`

### **MANTER (4 arquivos):**

1. ✅ `UniversalImportModal.tsx` - Nome já padronizado
2. ✅ `AdvancedImportModal.tsx` - Nome já padronizado
3. ✅ `ImportValidator.tsx` - Nome já padronizado
4. ✅ (1 arquivo duplicado será resolvido)

---

## 🎯 ORDEM DE EXECUÇÃO

### **FASE 1: RESOLVER CONFLITOS (ALTA PRIORIDADE)**

Renomear os 3 arquivos com nome duplicado:

```bash
# 1. ImportModal.tsx (root) - 14 usos
git mv src/react-app/components/ImportModal.tsx \
       src/react-app/components/GenericImportModal.tsx

# 2. ImportModal.tsx (modals)
git mv src/react-app/components/modals/ImportModal.tsx \
       src/react-app/components/modals/StandardImportModal.tsx

# 3. ImportModal.tsx (ImportExport)
git mv src/react-app/components/ImportExport/ImportModal.tsx \
       src/react-app/components/ImportExport/ExportImportModal.tsx
```

### **FASE 2: COMPONENTE BASE (ALTA PRIORIDADE)**

```bash
# 4. ImportacaoPadrao.tsx - 6 usos
git mv src/react-app/components/common/ImportacaoPadrao.tsx \
       src/react-app/components/common/BaseImport.tsx
```

### **FASE 3: COMPONENTES ESPECÍFICOS (MÉDIA PRIORIDADE)**

```bash
# 5. ImportarManobrasPadrao.tsx - 1 uso
git mv src/react-app/components/simuladores/ImportarManobrasPadrao.tsx \
       src/react-app/components/simuladores/ManeuversImportModal.tsx

# 6. CertificacoesImportModal.tsx - 3 usos
git mv src/react-app/components/shared/CertificacoesImportModal.tsx \
       src/react-app/components/shared/CertificationsImportModal.tsx

# 7. ImportacaoExcel.tsx - 2 usos
git mv src/react-app/pages/qualificacoes/ImportacaoExcel.tsx \
       src/react-app/pages/qualificacoes/QualificationsImportPage.tsx

# 8. ImportacaoUniversal.tsx - 1 uso
git mv src/react-app/components/common/ImportacaoUniversal.tsx \
       src/react-app/components/common/UniversalImport.tsx
```

### **FASE 4: COMPONENTES AUXILIARES (BAIXA PRIORIDADE)**

```bash
# 9. ImportCSVModal.tsx - 1 uso
git mv src/react-app/components/ImportCSVModal.tsx \
       src/react-app/components/CSVImportModal.tsx

# 10. ImportadorCSVSimuladores.tsx - 1 uso
git mv src/react-app/components/simuladores/ImportadorCSVSimuladores.tsx \
       src/react-app/components/simuladores/SimulatorsCSVImport.tsx
```

---

## 🔄 ATUALIZAÇÃO DE IMPORTS

Após cada renomeação, atualizar todos os imports:

```bash
# Exemplo para BaseImport:
find src/react-app -type f \( -name "*.tsx" -o -name "*.ts" \) \
  -exec sed -i '' 's/ImportacaoPadrao/BaseImport/g' {} +
```

---

## ✅ CHECKLIST DE EXECUÇÃO

### **Para cada arquivo:**
- [ ] 1. Fazer backup (git stash)
- [ ] 2. Renomear arquivo com `git mv`
- [ ] 3. Atualizar imports em todos os arquivos
- [ ] 4. Atualizar exports
- [ ] 5. Testar build (`npm run build`)
- [ ] 6. Verificar TypeScript (`npx tsc --noEmit`)
- [ ] 7. Commit individual

---

## 📊 RESULTADO ESPERADO

### **ANTES:**
- ❌ 3 arquivos com nome duplicado
- ❌ Mistura português/inglês
- ❌ Nomenclatura inconsistente
- ❌ Difícil identificar função

### **DEPOIS:**
- ✅ 0 arquivos duplicados
- ✅ 100% inglês
- ✅ Nomenclatura padronizada
- ✅ Fácil identificar função

---

## 🎯 CONVENÇÃO FINAL

### **Padrão de Nomenclatura:**

**Componentes Base:**
- `BaseImport.tsx`
- `UniversalImport.tsx`

**Modais Genéricos:**
- `GenericImportModal.tsx`
- `StandardImportModal.tsx`
- `UniversalImportModal.tsx`
- `AdvancedImportModal.tsx`
- `CSVImportModal.tsx`
- `ExportImportModal.tsx`

**Modais Específicos:**
- `[Entidade]ImportModal.tsx`
- Exemplos:
  - `ManeuversImportModal.tsx`
  - `CertificationsImportModal.tsx`
  - `SimulatorsCSVImport.tsx`

**Páginas:**
- `[Entidade]ImportPage.tsx`
- Exemplo: `QualificationsImportPage.tsx`

**Utilitários:**
- `ImportValidator.tsx`
- `Import[Função].tsx`

---

**Última Atualização:** 23/10/2025 03:15  
**Status:** ✅ PLANO PRONTO PARA EXECUÇÃO
