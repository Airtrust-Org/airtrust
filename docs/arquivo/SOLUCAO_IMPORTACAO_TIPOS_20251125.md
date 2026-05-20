# ✅ Correção: Importação de Excel para Tipos de Qualificações

**Data:** 25 de novembro de 2025  
**Problema:** Validação falhando ao importar arquivo Excel para a tabela de tipos de qualificações  
**Status:** ✅ RESOLVIDO

---

## 🔍 Diagnóstico

O problema era que o componente de importação aceita arquivos `.xlsx` e `.xls` na UI, mas o hook `useImportacao` só tinha suporte para **CSV via Papa Parse**.

### Raízes do Problema:

1. **Falta de Parser XLSX no Frontend**

   - O `parsearCSV` usava apenas Papa Parse
   - Arquivos Excel iam para o backend sem parsing local
   - Causava erros de validação no servidor

2. **Schema Zod Muito Restritivo**

   - `nome` exigia mínimo **3 caracteres** (agora **2**)
   - Não tratava bem conversões de tipo para `obrigatoria`
   - Mensagens de erro genéricas

3. **Conversão de Dados Inadequada**
   - Valores do Excel não eram convertidos para string antes da validação
   - Números e booleanos causavam falhas no schema

---

## ✅ Solução Implementada

### 1. Adicionado Parser XLSX com Lazy Load (Hook)

**Arquivo:** `/src/react-app/hooks/useImportacao.ts`

```typescript
// Nova função assíncrona
const loadXLSX = async () => {
  const module = await import('xlsx');
  return module;
};

// Parser XLSX com conversão correta de tipos
const parsearXLSX = async (file: File): Promise<Record<string, unknown>[]> => {
  const XLSX = await loadXLSX();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  // ... processa com conversão de tipos
};

// Parser genérico que detecta extensão
const parsearArquivo = async (file: File): Promise<Record<string, unknown>[]> => {
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension === 'xlsx' || extension === 'xls') {
    return parsearXLSX(file);
  } else if (extension === 'csv') {
    return parsearCSV(file);
  }
  throw new Error(`Formato não suportado: .${extension}`);
};
```

**Benefícios:**

- ✅ Lazy loading: XLSX só carregado quando necessário
- ✅ Suporta .xlsx, .xls e .csv
- ✅ Conversão automática de tipos (número → string, booleano → "1"/"0")
- ✅ Trata valores nulos/vazios corretamente

### 2. Flexibilizado Schema Zod para Tipos de Qualificação

**Arquivo:** `/worker-airtrust/src/services/importacao/QualificacaoTipoImportacao.ts`

```typescript
export const QualificacaoTipoImportSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório').min(2, 'Nome deve ter no mínimo 2 caracteres'), // Era 3

  codigo: z.string().min(1, 'Código obrigatório'),

  categoria: z.string().min(1, 'Categoria obrigatória'),

  descricao: z.string().optional().nullable(),

  validade_meses: z
    .union([z.string(), z.number()])
    .transform((val) => {
      // Melhorado: trata strings de números
      if (typeof val === 'number') return val;
      const parsed = parseInt(String(val));
      return isNaN(parsed) ? null : parsed;
    })
    .nullable()
    .optional(),

  obrigatoria: z
    .union([z.boolean(), z.number(), z.string()])
    .transform((val) => {
      // Muito melhorado: aceita múltiplos formatos
      if (typeof val === 'boolean') return val ? 1 : 0;
      if (typeof val === 'number') return val;
      const str = String(val).toLowerCase().trim();
      // Aceita: true, sim, 1, yes, s = 1
      // Aceita: false, nao, não, 0, no, n, "" = 0
      if (['true', 'sim', '1', 'yes', 's'].includes(str)) return 1;
      if (['false', 'nao', 'não', '0', 'no', 'n', ''].includes(str)) return 0;
      return 1; // Default: obrigatória
    })
    .optional(),
});
```

### 3. Atualizado Componente ModalImportacao

**Arquivo:** `/src/react-app/components/importacao/ModalImportacao.tsx`

```typescript
// Agora usa parsearArquivo (detecta automaticamente)
const parsed = await parsearArquivo(file);

// Mensagens de erro melhoradas
toast.error('Erro ao processar arquivo', {
  description: msg, // Mensagem do erro real
});
```

---

## 📋 Formato Correto para Importação

### Colunas Obrigatórias:

- **nome** (2+ caracteres)
- **codigo** (texto único)
- **categoria** (texto)

### Colunas Opcionais:

- **descricao** (texto)
- **validade_meses** (número ou vazio)
- **obrigatoria** (1/0, sim/não, true/false, ou vazio = padrão 1)

### Exemplo CSV:

```csv
nome,codigo,categoria,descricao,validade_meses,obrigatoria
CMA Classe 1,CMA1,CMA,Certificado Médico Aeronáutico,12,1
ICAO Nível 3,ICAO3,ICAO,Proficiência em Idioma,36,sim
CHECK-IN A320,CHECK-A,CHECK,Check da Aeronave,,
```

---

## 🧪 Como Testar

### ✅ Opção 1: Usar o Exemplo Criado

```bash
# Arquivo criado em /tmp/exemplo-tipos-qualificacoes.csv
# Contém 5 tipos válidos prontos para importar
```

### ✅ Opção 2: Teste Manual

1. Abra AirTrust
2. Vá em Qualificações → Dashboard
3. Clique em "Importar Tipos de Qualificação"
4. Selecione um arquivo .xlsx, .xls ou .csv
5. Revise o preview de validação
6. Confirme a importação

---

## 📁 Arquivos Modificados

1. ✅ `/src/react-app/hooks/useImportacao.ts`

   - Adicionado `loadXLSX()` para lazy load
   - Adicionado `parsearXLSX()` com conversão de tipos
   - Adicionado `parsearArquivo()` para auto-detecção
   - Exportado no return do hook

2. ✅ `/src/react-app/components/importacao/ModalImportacao.tsx`

   - Atualizado para usar `parsearArquivo`
   - Melhoradas mensagens de erro

3. ✅ `/worker-airtrust/src/services/importacao/QualificacaoTipoImportacao.ts`

   - Flexibilizado schema: nome de 3 para 2 caracteres
   - Melhorado parse de `validade_meses` (agora trata strings)
   - Muito melhorado parse de `obrigatoria` (múltiplos formatos)

4. ✨ `/GUIA_IMPORTACAO_TIPOS_QUALIFICACOES.md` (NOVO)

   - Guia completo de importação
   - Exemplos corretos e erros comuns
   - Dicas e suporte

5. ✨ `/exemplo-tipos-qualificacoes.csv` (NOVO)
   - Arquivo de exemplo pronto para usar

---

## 🎯 Resultado Final

### Antes ❌

- Apenas CSV funcionava
- Mensagens de erro confusas
- Schema muito restritivo
- Sem conversão de tipos adequada

### Depois ✅

- ✅ CSV, XLSX e XLS funcionam
- ✅ Mensagens de erro claras
- ✅ Schema flexível mas validante
- ✅ Conversão automática de tipos
- ✅ Lazy loading do XLSX
- ✅ Documentação completa

---

## 🚀 Próximos Passos

1. **Teste a importação** com o arquivo de exemplo
2. **Reporte qualquer erro** que encontrar com print/logs
3. **Use o guia** `/GUIA_IMPORTACAO_TIPOS_QUALIFICACOES.md` como referência

---

## 🔧 Resumo Técnico

| Aspecto                 | Antes   | Depois             |
| ----------------------- | ------- | ------------------ |
| **Formatos**            | CSV     | CSV, XLSX, XLS     |
| **Parse XLSX**          | ❌ Não  | ✅ Sim (lazy load) |
| **Nome mínimo**         | 3 chars | 2 chars            |
| **Conversão Booleano**  | Ruim    | ✅ Excelente       |
| **Conversão Números**   | Ruim    | ✅ Segura          |
| **Detecção Automática** | ❌ Não  | ✅ Sim             |
| **Documentação**        | ❌ Não  | ✅ Completa        |

---

**Build:** ✅ Passou  
**Lint:** ✅ Clean (sem warnings não-ignoráveis)  
**Testado:** ✅ Sim, com arquivo de exemplo

Próximo: Commit, build e deploy automático.
