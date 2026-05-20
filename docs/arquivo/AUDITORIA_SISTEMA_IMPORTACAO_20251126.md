# 🔍 AUDITORIA COMPLETA - SISTEMA DE IMPORTAÇÃO

**Data**: 26 de Novembro de 2025
**Status**: Auditoria em Andamento

---

## 1. ESTRUTURA IDENTIFICADA

### Arquivos Backend

```
worker-airtrust/src/
├── routes/
│   ├── importacao-refactored.ts (404 linhas) ✅ Existe
│   ├── funcionarios.ts (748 linhas) ✅ Existe
│   └── qualificacoes.ts (1847 linhas) ✅ Existe
└── services/importacao/
    ├── validators.ts (396 linhas) ✅ Existe
    ├── columnMappings.ts (365 linhas) ✅ Existe
    ├── FuncionarioImportacaoRefactored.ts (331 linhas) ✅ Existe
    ├── QualificacaoTipoImportacaoRefactored.ts ✅ Existe
    └── QualificacaoHistoricoImportacaoRefactored.ts ✅ Existe
```

### Arquivos Frontend

```
src/react-app/
├── components/importacao/
│   └── ModalImportacaoV2.tsx (459 linhas) ✅ Existe
├── components/common/
│   └── ImportacaoPadrao.tsx ✅ Existe
├── pages/
│   └── ImportacaoPageV2.tsx ✅ Existe
└── hooks/
    └── useImportacao.ts (presumido)
```

---

## 2. PROBLEMAS IDENTIFICADOS

### A. DELETE ENDPOINTS

#### ✅ DELETE /api/qualificacoes/tipos/:id

- **Status**: FUNCIONANDO ✅
- **Localização**: `qualificacoes.ts` linha 148
- **Motivo**: Refatorado para estar ANTES do GET /tipos
- **Deploy**: Corrigido com `--env production` no script
- **Teste**: ✅ `/tipos-test/:id` retorna 200

#### ❌ DELETE /api/funcionarios/:id

- **Status**: NÃO TESTADO (possível timeout)
- **Localização**: `funcionarios.ts` linha 704
- **Tipo**: Soft delete
- **Middlewares**: `auth()`, `requireRole('admin')`
- **Problema Potencial**: Timeout ou erro 500 com token inválido

#### ❌ DELETE /api/qualificacoes/historico/:id

- **Status**: NÃO TESTADO (possível timeout)
- **Localização**: `qualificacoes.ts` linha 1228
- **Tipo**: Soft delete
- **Middlewares**: `auth()`, `requireRole('admin')`
- **Problema Potencial**: Timeout ou erro 500 com token inválido

### B. VALIDAÇÃO FUNCIONÁRIOS

#### ❌ 121 Erros de Validação

- **Causa Desconhecida**: Logs não foram visualizados
- **Validators**: `validateFuncionarioRow()` - linhas 38-127
- **Checks Atuais**:
  - ✅ Campos obrigatórios (Nome, CPF, Matricula)
  - ✅ Nome: min 3 caracteres
  - ✅ CPF: validação de formato (11 dígitos)
  - ✅ Email: validação de formato (se fornecido)
  - ✅ Datas: aceita DD/MM/YYYY, YYYY-MM-DD, Excel serial
  - ❌ DB checks: removidos

#### Possível Causa: Header Mapping Incorreto

- **Arquivo**: `columnMappings.ts` linhas 70-180
- **Problema**: Headers da planilha do usuário não estão sendo mapeados corretamente
- **Esperado**: Nomes exatos da planilha → campos DB
- **Atual**: Lógica de `remapRowHeaders()` usa `normalizeKey()` com `toLowerCase()` + `replace(/\s+/g, '_')`

### C. IMPORTAÇÃO NÃO ACHA DADOS

#### ❌ Tipos (Qualificações)

- **Problema**: Validação passou mas não acha dados
- **Provável Causa**: Headers mapeados incorretamente
- **Esperado**: Deve mapear automaticamente variações do campo (tipo/Tipo/TIPO)

---

## 3. CASE-SENSITIVITY ISSUES

### Nomes de Colunas - Estado Atual

- **columnMappings.ts**: Define FUNCIONARIOS_COLUMNS com PascalCase

  ```typescript
  Nome,
    Guerra,
    Funcao,
    Aeronave,
    CPF,
    Data_Nascimento,
    Licenca,
    CANAC,
    Sispat,
    Prestserv,
    Email,
    Telefone,
    Admissao,
    Matricula;
  ```

- **remapRowHeaders()**: Tenta normalizar mas pode falhar se:
  - Usuário envia "data_nascimento" (tudo minúsculo)
  - Esperado: "Data_Nascimento" (PascalCase)
  - Mapping busca "Nascimento" em expectedHeaders

### Problema: Mismatch de Headers

```typescript
// Esperado na planilha:
Row recebida: { "Data_Nascimento": "1990-01-15" }

// Esperado na function:
const expectedHeaders = { Nascimento: ['nascimento', 'data_nascimento', ...] }

// Resultado: NÃO ACHA porque busca "nascimento" mas linha 1 tem "Data_Nascimento"
```

---

## 4. 3 MODOS DE IMPORTAÇÃO

### Modo 1: INSERT

- **Lógica**: Inserir apenas se não existe
- **Status**: Implementado em `FuncionarioImportacao.import()`
- **Teste**: ❌ Não testado

### Modo 2: UPDATE (Inteligente/UPSERT)

- **Lógica**: Atualizar APENAS campos fornecidos (não sobrescrever com empty)
- **Status**: ✅ Implementado (linhas 153-200 do Funcionario service)
- **Teste**: ❌ Não testado

### Modo 3: SUBSTITUIR COMPLETO

- **Lógica**: Deletar tudo e reinsert
- **Status**: ❌ Não implementado
- **Necessário**: Adicionar ao FuncionarioImportacao.import()

---

## 5. ARQUIVO MORTO E DUPLICATAS

### Duplicatas Identificadas

```
✅ /Users/filipedaumas/Documents/airtrust v1/src/pages/ImportacaoPage.tsx
✅ /Users/filipedaumas/Documents/airtrust v1/src/pages/ImportacaoPageV2.tsx
✅ /Users/filipedaumas/Documents/airtrust v1/src/react-app/components/common/ImportacaoPadrao.tsx
✅ /Users/filipedaumas/Documents/airtrust v1/src/react-app/components/importacao/ModalImportacaoV2.tsx

PROBLEMA: ImportacaoPageV2 vs ImportacaoPage
- Qual está sendo usada?
- Há referências duplicadas no router?
```

---

## 6. PLANO DE AÇÃO

### PHASE 1: Testes de Verificação

- [ ] Testar DELETE /api/funcionarios/:id com token válido
- [ ] Testar DELETE /api/qualificacoes/historico/:id com token válido
- [ ] Executar POST /api/importacao/validar com Excel de teste
- [ ] Visualizar logs do worker: `wrangler tail`

### PHASE 2: Fixes Críticos

- [ ] Corrigir mapeamento de headers (case-insensitive, mais robusto)
- [ ] Verificar se todos os 3 modos de importação funcionam
- [ ] Validar DELETE endpoints funcionam

### PHASE 3: Cleanup

- [ ] Remover ImportacaoPage.tsx (manter V2)
- [ ] Unificar ModalImportacao (se houver duplicatas)
- [ ] Remover code morto

### PHASE 4: E2E Tests

- [ ] Import funcionários (3 modos)
- [ ] Import tipos (3 modos)
- [ ] Import histórico (3 modos)
- [ ] Delete em cada módulo
- [ ] Deploy e validação

---

## 7. PRÓXIMOS PASSOS

1. **Executa r auditoria detalhada de headers**

   - Print do que vem do Excel vs o que é esperado
   - Identificar mismatch exato

2. **Testar DELETE com token JWT válido**

   - Gerar novo token ou usar dev bypass
   - Validar endpoints funcionam

3. **Refatorar `columnMappings.remapRowHeaders()`**

   - Tornar completamente case-insensitive
   - Adicionar mais aliases para variações comuns

4. **Implementar REPLACE_ALL mode**

   - Lógica de deletar tudo e reinsert
   - Adicionar ao switch em FuncionarioImportacao.import()

5. **Deploy com fixes**
   - Build + deploy
   - Teste completo E2E
