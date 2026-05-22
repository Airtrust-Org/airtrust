# Máscaras de Formulário - Funcionários

## ✅ Implementado em: 05/02/2026

### 📋 Campos com Máscaras Automáticas

#### 1. **Matrícula**

- **Formato:** `XXXXX` (5 dígitos numéricos)
- **Exemplo:** `00353`, `12345`
- **Validação:** Aceita apenas números, máximo 5 dígitos
- **Auto-padding:** Ao sair do campo, completa com zeros à esquerda se necessário
- **Feedback visual:**
  - ⏳ Amarelo: Faltam dígitos
  - ✓ Verde: Matrícula válida (5 dígitos)

#### 2. **Telefone**

- **Formato:** `(XX) XXXXX-XXXX` ou `(XX) XXXX-XXXX`
- **Exemplo:** `(11) 99999-9999`, `(21) 3333-4444`
- **Validação:** 10 ou 11 dígitos
- **Aplicado em:**
  - Campo de Telefone
  - Campo de Telefone Emergência

#### 3. **Código ANAC**

- **Formato:** `XXXXX-X` (5 dígitos, hífen, 1 dígito)
- **Exemplo:** `12694-7`
- **Validação:** Exatamente 6 dígitos numéricos
- **maxLength:** 7 caracteres (incluindo hífen)
- **Placeholder:** `12694-7`
- **Dica visual:** "Formato: XXXXX-X"

### 🔧 Implementação Técnica

#### Arquivo de Máscaras

**Localização:** `src/react-app/utils/mascaras.ts`

**Funções disponíveis:**

```typescript
// Aplicar máscaras
aplicarMascaraMatricula(valor: string): string
aplicarMascaraTelefone(valor: string): string
aplicarMascaraCodigoANAC(valor: string): string

// Utilitários
removerMascara(valor: string): string
validarMatricula(valor: string): boolean
validarTelefone(valor: string): boolean
validarCodigoANAC(valor: string): boolean
```

#### Componente Atualizado

**Localização:** `src/react-app/pages/funcionarios/ModalFuncionario.tsx`

**Mudanças:**

1. Importação das funções de máscara
2. Atualização do `handleChange` para aplicar máscaras automaticamente
3. Remoção de máscaras antes de enviar ao backend (no `handleSalvar`)
4. Validações específicas para cada campo formatado

### 📊 Correções no Banco de Dados

#### Script: `scripts/fix-codigo-anac-formato.sql`

**Executado em:** 05/02/2026

**Resultados:**

- ✅ 21 códigos ANAC formatados para o padrão `XXXXX-X`
- Conversão de formatos como `126947` → `12694-7`
- Preservação de códigos já no formato correto

**Query de verificação:**

```sql
SELECT codigo_anac FROM funcionarios
WHERE codigo_anac IS NOT NULL
AND deleted_at IS NULL;
```

### 🎯 Comportamento Esperado

#### No Cadastro/Edição:

1. **Usuário digita:** Números são automaticamente formatados
2. **Máscara aplicada:** Em tempo real conforme digitação
3. **Ao salvar:** Máscaras removidas, dados enviados limpos ao backend
4. **Backend salva:** Formato padronizado no banco

#### Exemplo de Fluxo:

**Entrada do Usuário:**

- Matrícula: `246` → Display: `246` → Ao sair: `00246` → Salva: `00246`
- Telefone: `11999998888` → Display: `(11) 99999-8888` → Salva sem máscara
- Código ANAC: `126947` → Display: `12694-7` → Salva: `12694-7`

### ✨ Benefícios

1. **Consistência:** Todos os registros seguem o mesmo formato
2. **Validação:** Erros detectados antes do envio
3. **UX Melhorado:** Usuário vê feedback visual em tempo real
4. **Dados Limpos:** Backend recebe dados padronizados
5. **Menos Erros:** Validação automática previne inconsistências

### 🔄 Compatibilidade

- ✅ Formulários novos: Máscaras aplicadas automaticamente
- ✅ Registros existentes: Corrigidos via scripts SQL
- ✅ Backend: Recebe dados sem máscara (compatível)
- ✅ Display: Sempre mostra dados formatados

### 📝 Manutenção

Para adicionar novas máscaras:

1. Criar função em `mascaras.ts`
2. Adicionar no `handleChange` do componente
3. Remover máscara no `handleSalvar` antes de enviar
4. Testar validação

### 🚀 Deploy

- **Versão:** `fec8f569`
- **Data:** 05/02/2026
- **Status:** ✅ Em produção
- **URL:** https://airtrust.online
