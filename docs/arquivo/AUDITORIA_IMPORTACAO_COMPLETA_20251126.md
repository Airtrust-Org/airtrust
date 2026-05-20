# 🔍 AUDITORIA COMPLETA - SISTEMA DE IMPORTAÇÃO

**Data:** 26/11/2025
**Escopo:** Importação de Funcionários, Qualificações Tipos e Histórico

---

## 📊 RESUMO EXECUTIVO

### ✅ O QUE ESTÁ FUNCIONANDO

1. **DELETE `/api/qualificacoes/tipos/:id`** - ✅ CORRIGIDO (deploy --env production)
2. **Arquitetura geral** - Services, Routes, Validators bem estruturados
3. **remapRowHeaders()** - Fuzzy matching com Levenshtein implementado
4. **3 modos de importação** - INSERT, UPDATE, UPSERT implementados
5. **REPLACE_ALL** - Implementado (soft delete + reinsert)

### ❌ PROBLEMAS IDENTIFICADOS

#### 1. **CRÍTICO: Erros de validação em Funcionários**

- **Sintoma:** 121 erros de validação no import
- **Causa provável:** Alias `Nascimento` vs `Data_Nascimento` não mapeado
- **Localização:** `columnMappings.ts` linha 300+

#### 2. **CRÍTICO: Qualificações Tipos - "Não acha dado"**

- **Sintoma:** Validação passa mas importação não encontra dados
- **Causa provável:** Headers não mapeados corretamente após validação
- **Localização:** `QualificacaoTipoImportacaoRefactored.ts`

#### 3. **DELETE funcionários não funciona**

- **Endpoint:** `DELETE /api/funcionarios/:id` (linha 704, funcionarios.ts)
- **Status:** Código existe, precisa testar se está mounted corretamente
- **Provável causa:** Middleware auth() ou route não registrada

#### 4. **DELETE qualificações histórico não funciona**

- **Endpoint:** `DELETE /api/qualificacoes/historico/:id` (linha 1228, qualificacoes.ts)
- **Status:** Código existe, precisa testar se está mounted corretamente

---

## 🗂️ ARQUITETURA MAPEADA

### Backend (Worker)

#### **Routes:**

- `worker-airtrust/src/routes/importacao-refactored.ts` (Endpoints principais)

  - `GET /api/importacao/template/:entidade`
  - `POST /api/importacao/validar/:entidade`
  - `POST /api/importacao/executar/:entidade`
  - `POST /api/importacao-v2/validar-json/:entidade` ← Usado pelo frontend
  - `POST /api/importacao-v2/executar-json/:entidade` ← Usado pelo frontend

- `worker-airtrust/src/routes/funcionarios.ts`

  - `DELETE /api/funcionarios/:id` (linha 704)

- `worker-airtrust/src/routes/qualificacoes.ts`
  - `DELETE /api/qualificacoes/tipos/:id` (linha 148) ✅ FUNCIONA
  - `DELETE /api/qualificacoes/historico/:id` (linha 1228)

#### **Services:**

- `FuncionarioImportacaoRefactored.ts` - 358 linhas

  - `validate(rows)` - Valida sem inserir
  - `import(rows, mode)` - INSERT | UPDATE | UPSERT | REPLACE_ALL
  - Suporta conversão de datas: Excel serial, DD/MM/YYYY, YYYY-MM-DD

- `QualificacaoTipoImportacaoRefactored.ts` - 230 linhas

  - `validate(rows)` - Valida sem inserir
  - `import(rows, mode)` - INSERT | UPDATE | UPSERT | REPLACE_ALL
  - Normaliza código para UPPERCASE

- `QualificacaoHistoricoImportacaoRefactored.ts`
  - `validate(rows)` - Valida com FK checks (CPF funcionário + código tipo)
  - `import(rows, mode)` - INSERT | UPSERT (não permite UPDATE direto)

#### **Validators:**

- `validators.ts`
  - `validateFuncionarioRow()` - ✅ Validação FORMAT-only (sem DB checks)
  - `validateQualificacaoTipoRow()` - ✅ Validação FORMAT-only
  - `validateQualificacaoHistoricoRow()` - Validação com FK checks (requer DB)

#### **Mappers:**

- `columnMappings.ts` - 600+ linhas
  - `remapRowHeaders()` - ✅ Fuzzy matching com Levenshtein
  - Aliases definidos para cada entidade
  - **PROBLEMA:** Alias `Nascimento` não inclui todas variações

### Frontend (React)

#### **Componentes:**

- `src/react-app/components/importacao/ModalImportacaoV2.tsx`

  - Único componente usado (ModalImportacao antiga não existe mais)
  - Parse XLSX com SheetJS
  - Validação antes de importação
  - 3 modos: Incluir (INSERT), Atualizar (UPDATE/UPSERT), Substituir (REPLACE_ALL)

- **Páginas que usam ModalImportacaoV2:**
  - `Funcionarios.tsx` (linha 168)
  - `QualificacoesNew.tsx` (linha 1388 para tipos, 1406 para histórico)
  - `QualificacoesWrapper.tsx` (linha 466)

---

## 🐛 DIAGNÓSTICO DETALHADO

### Problema 1: Validação Funcionários (121 erros)

**Análise do remapRowHeaders() para funcionários:**

```typescript
// Aliases atuais (linha 300+)
const expectedHeaders: Record<string, string[]> = {
  Nascimento: [
    'nascimento',
    'data_nascimento', // ✅ TEM
    'data_nasc',
    'date_of_birth',
    'dob',
    'birthdate',
    'birth_date',
  ],
  // ...
};
```

**✅ ALIAS CORRETO:** `data_nascimento` está incluído!

**Possíveis causas:**

1. Headers da planilha não são normalizados corretamente
2. Excel tem espaços extras ou caracteres invisíveis
3. Validação está rejeitando formato de data válido
4. CPF ou Matrícula com formato incorreto

**SOLUÇÃO:** Adicionar debug logs para ver:

- Headers originais da planilha
- Headers após normalização
- Valores que estão falhando

### Problema 2: Qualificações Tipos - "Não acha dado"

**Fluxo atual:**

1. Frontend: Parse XLSX → headers: `["codigo", "nome", ...]`
2. POST /validar-json → remapRowHeaders() → OK
3. POST /executar-json → remapRowHeaders() DE NOVO → OK
4. Service.import() → ❌ "dados não encontrados"

**HIPÓTESE:**

- Dados estão mapeados mas código do import() espera headers diferentes
- Normalização de código pode estar removendo caracteres importantes
- Query SQL esperando campos com nome diferente

**Exemplo problemático:**

```typescript
// QualificacaoTipoImportacaoRefactored.ts linha ~120
const codigo = normalizeCode(row.codigo); // ✅ Espera 'codigo'

// Mas row pode ter vindo com:
row = { Código: 'ABC-123' }; // Sem remapeamento!
```

**SOLUÇÃO:** Garantir que remapRowHeaders() é chamado ANTES de service.import()

### Problema 3 & 4: DELETE não funciona

**Código dos endpoints:**

```typescript
// funcionarios.ts linha 704
app.delete('/:id', auth(), requireRole('admin'), async (c) => {
  // ... softDelete(db, 'funcionarios', id)
});

// qualificacoes.ts linha 1228
app.delete('/historico/:id', auth(), requireRole('admin'), async (c) => {
  // ... softDelete(db, 'qualificacoes_historico', id)
});
```

**Status:**

- ✅ Código existe
- ❌ Não testado se funciona
- ⚠️ Requer role='admin' (pode estar bloqueando)

**TESTES NECESSÁRIOS:**

1. Verificar se rotas estão mounted corretamente
2. Testar com token admin válido
3. Verificar logs do worker para ver se chegam as requests

---

## 🔧 PLANO DE CORREÇÃO

### FASE 1: Diagnóstico (Imediato)

**1.1. Adicionar debug logs**

```typescript
// importacao-refactored.ts linha ~240
console.log('[DEBUG] Headers originais:', Object.keys(rows[0]));
console.log('[DEBUG] Primeira row original:', rows[0]);
console.log('[DEBUG] Primeira row remapeada:', remappedRows[0]);
```

**1.2. Testar DELETE endpoints**

```bash
# Funcionários
curl -X DELETE "https://airtrust-api-production.airtrust.workers.dev/api/funcionarios/1" \
  -H "Authorization: Bearer TOKEN"

# Histórico
curl -X DELETE "https://airtrust-api-production.airtrust.workers.dev/api/qualificacoes/historico/1" \
  -H "Authorization: Bearer TOKEN"
```

### FASE 2: Fixes (Prioridade)

**2.1. Corrigir aliases de headers** ✅ Já correto!

```typescript
// columnMappings.ts - VERIFICAR se data_nascimento está incluso
Nascimento: ['nascimento', 'data_nascimento', ...]
```

**2.2. Garantir remapeamento consistente**

```typescript
// importacao-refactored.ts
// ANTES: remapear UMA VEZ no início
// DEPOIS: Usar rows já remapeadas em validate() E import()
```

**2.3. Normalizar valores antes de validação**

```typescript
// validators.ts
// Garantir que CPF aceita máscaras: XXX.XXX.XXX-XX
// Garantir que datas aceitam: DD/MM/YYYY, Excel serial, YYYY-MM-DD
```

### FASE 3: Testes E2E

**3.1. Teste Funcionários**

1. Upload Excel com 42 funcionários
2. Modo: UPSERT
3. Verificar: 0 erros de validação
4. Verificar: Dados inseridos no D1

**3.2. Teste Qualificações Tipos**

1. Upload Excel com 10 tipos
2. Modo: UPSERT
3. Verificar: 0 erros de validação
4. Verificar: Dados inseridos com código UPPERCASE

**3.3. Teste Histórico**

1. Upload Excel com 20 registros
2. Modo: INSERT
3. Verificar: FK checks passam
4. Verificar: Dados vinculados corretamente

**3.4. Teste DELETE**

1. Deletar funcionário existente
2. Deletar tipo existente
3. Deletar histórico existente
4. Verificar soft delete (deleted_at preenchido)

### FASE 4: Limpeza

**4.1. Remover código morto**

- Verificar se há imports não usados
- Verificar se há componentes duplicados
- Remover console.logs desnecessários

**4.2. Documentação**

- Atualizar README com fluxo de importação
- Documentar formatos de data aceitos
- Documentar aliases de headers

---

## 📝 CHECKLIST DE VALIDAÇÃO

### Funcionários

- [ ] Headers case-insensitive funcionam
- [ ] CPF com máscara aceito
- [ ] Datas em 3 formatos aceitas
- [ ] Modo INSERT: só insere novos
- [ ] Modo UPDATE: atualiza existentes
- [ ] Modo UPSERT: insert ou update
- [ ] Modo REPLACE_ALL: deleta e reinsere
- [ ] DELETE funcionário funciona

### Qualificações Tipos

- [ ] Headers case-insensitive funcionam
- [ ] Código normalizado para UPPERCASE
- [ ] Modo INSERT: só insere novos
- [ ] Modo UPDATE: atualiza existentes
- [ ] Modo UPSERT: insert ou update
- [ ] Modo REPLACE_ALL: deleta e reinsere
- [ ] DELETE tipo funciona (✅ JÁ TESTADO)

### Qualificações Histórico

- [ ] Headers case-insensitive funcionam
- [ ] FK funcionario_cpf valida
- [ ] FK qualificacao_codigo valida
- [ ] Modo INSERT funciona
- [ ] Modo UPSERT funciona
- [ ] DELETE histórico funciona

---

## 🚀 PRÓXIMAS AÇÕES

1. ✅ **Adicionar debug logs detalhados**
2. **Testar DELETE funcionários e histórico**
3. **Fazer upload de Excel real e capturar erros**
4. **Corrigir problemas identificados**
5. **Deploy e testes E2E**

---

**Auditoria concluída. Aguardando execução dos fixes.**
