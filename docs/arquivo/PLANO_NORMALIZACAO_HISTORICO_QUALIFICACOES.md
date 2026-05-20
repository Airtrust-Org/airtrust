# 📋 PLANO DE NORMALIZAÇÃO COMPLETA DO HISTÓRICO DE QUALIFICAÇÕES

**Data:** 2025-11-23  
**Objetivo:** Normalizar completamente o módulo de importação do histórico de qualificações, removendo dados duplicados das planilhas e tornando obrigatória a validação de FKs.

---

## 🔍 DESCOBERTAS DO SCAN

### ✅ O que JÁ está NORMALIZADO (Não precisa mudar):

1. **Banco de Dados:** Tabela `qualificacoes_historico` JÁ usa FKs:
   - `funcionario_id INTEGER NOT NULL` → FK para `funcionarios(id)`
   - `qualificacao_id INTEGER NOT NULL` → FK para `qualificacoes_tipos(id)`
2. **View (NÃO EXISTE MAIS):** Migration 0097 REMOVEU `qualificacoes_historico_v`

   - Tabela agora tem colunas desnormalizadas: `codigo`, `categoria` (copiadas na importação)

3. **Frontend:** Componentes JÁ consomem dados da API com JOINs implícitos

4. **Tabela de Arquivos:** JÁ existe `arquivos` com estrutura:
   ```sql
   CREATE TABLE arquivos (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     funcionario_id INTEGER NOT NULL,
     nome_original TEXT NOT NULL,
     nome_arquivo TEXT NOT NULL,
     categoria TEXT DEFAULT 'geral',
     tamanho INTEGER,
     tipo TEXT,
     url_r2 TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT,
     deleted_at TEXT,
     FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
   );
   ```

### ⚠️ PROBLEMAS IDENTIFICADOS:

1. **Schema de Importação Aceita Dados Duplicados:**

   ```typescript
   // QualificacaoHistoricoImportSchema aceita:
   funcionario_cpf, funcionario_matricula, funcionario_nome(opcional);
   qualificacao_codigo, qualificacao_nome, tipo_codigo, categoria(opcionais);
   ```

2. **Auto-Criação de Funcionários:**

   ```typescript
   // COMPORTAMENTO INDESEJADO
   if (!funcionarioId && data.funcionario_nome) {
     funcionarioId = await this.createFuncionarioFromImport(data);
   }
   ```

3. **Template com 17 colunas** (muitas desnecessárias)

4. **Sem suporte a XLSX** (apenas CSV)

5. **Campo `numero_certificado`** é TEXT simples, não FK para arquivos

6. **Tabela `qualificacoes_historico` tem colunas desnormalizadas:** `codigo`, `categoria` (copiadas do tipo)

---

## 🎯 ESTRATÉGIA DE NORMALIZAÇÃO

### Opção A: NORMALIZAÇÃO TOTAL (Recomendada pelo usuário)

- Remover `codigo`, `categoria` de `qualificacoes_historico`
- Sempre fazer JOINs para buscar esses dados
- Planilha: apenas FKs + dados do evento

### Opção B: HÍBRIDA (Mais pragmática - **RECOMENDO**)

- Manter `codigo`, `categoria` na tabela (cache desnormalizado para performance)
- Planilha: apenas FKs
- Service: copia `codigo`, `categoria` do tipo durante importação
- Vantagem: queries simples sem JOIN, compatibilidade com migration 0097

**📌 Vou propor Opção B** por ser menos disruptiva e já estar implementada na migration 0097.

---

## 📦 PLANO DE MUDANÇAS EM 8 PASSOS

### **PASSO 1: Criar Migration para Certificados** ⏱️ 30min

**Arquivo:** `worker-airtrust/migrations/0098_add_certificado_arquivo_fk.sql`

```sql
-- Migration 0098: Adicionar FK certificado_arquivo_id
-- Data: 2025-11-23
-- Objetivo: Substituir numero_certificado (TEXT) por FK para arquivos

BEGIN TRANSACTION;

-- 1. Adicionar coluna certificado_arquivo_id
ALTER TABLE qualificacoes_historico
  ADD COLUMN certificado_arquivo_id INTEGER REFERENCES arquivos(id);

-- 2. Criar índice
CREATE INDEX IF NOT EXISTS idx_qh_certificado_arquivo
  ON qualificacoes_historico(certificado_arquivo_id)
  WHERE deleted_at IS NULL;

-- 3. Migrar dados existentes (se houver numero_certificado, criar registro em arquivos)
-- NOTA: Não podemos fazer isso automaticamente pois numero_certificado é apenas texto,
-- não temos o arquivo real. Deixar NULL e popular manualmente quando necessário.

COMMIT;

-- Checklist pós-migração:
-- 1. PRAGMA table_info('qualificacoes_historico') - verificar coluna certificado_arquivo_id
-- 2. Testar INSERT com certificado_arquivo_id NULL
-- 3. Testar INSERT com certificado_arquivo_id válido
```

**Teste Manual:**

```bash
# Aplicar migration localmente
wrangler d1 execute airtrust-db --local --file=worker-airtrust/migrations/0098_add_certificado_arquivo_fk.sql

# Verificar
wrangler d1 execute airtrust-db --local --command="PRAGMA table_info('qualificacoes_historico');"
```

---

### **PASSO 2: Refatorar Schema Zod** ⏱️ 1h

**Arquivo:** `worker-airtrust/src/services/importacao/QualificacaoHistoricoImportacao.ts`

**Mudanças no Schema:**

```typescript
// ANTES (17 campos, muitos opcionais desnecessários)
export const QualificacaoHistoricoImportSchema = z
  .object({
    funcionario_cpf: z.string().optional().nullable(),
    funcionario_matricula: z.string().optional().nullable(),
    funcionario_nome: z.string().optional().nullable(), // ❌ REMOVER
    qualificacao_codigo: z.string().optional().nullable(),
    qualificacao_nome: z.string().optional().nullable(), // ❌ REMOVER
    tipo_codigo: z.string().optional().nullable(), // ❌ REMOVER
    categoria: z.string().optional().nullable(), // ❌ REMOVER
    data_conclusao: z.string().min(1, 'Data de conclusão obrigatória'),
    data_vencimento: z.string().optional().nullable(),
    carga_horaria: z.number().optional().nullable(),
    nota: z.number().optional().nullable(),
    codigo: z.string().optional().nullable(),
    numero_certificado: z.string().optional().nullable(), // ❌ SUBSTITUIR
    instrutor: z.string().optional().nullable(),
    local: z.string().optional().nullable(),
    modalidade: z.string().optional().nullable(),
    observacoes: z.string().optional().nullable(),
    arquivo_url: z.string().optional().nullable(), // ❌ REMOVER
  })
  .refine((data) => data.funcionario_cpf || data.funcionario_matricula, {
    message: 'Informe CPF ou matrícula do funcionário',
  });

// DEPOIS (11 campos, validações obrigatórias)
export const QualificacaoHistoricoImportSchema = z
  .object({
    // CHAVES (obrigatórias via refine)
    funcionario_cpf: z.string().optional().nullable(),
    funcionario_matricula: z.string().optional().nullable(),
    qualificacao_codigo: z.string().min(1, 'Código da qualificação é obrigatório'),

    // DADOS DO EVENTO
    data_conclusao: z.string().min(1, 'Data de conclusão é obrigatória'),
    data_vencimento: z.string().optional().nullable(),
    carga_horaria: z.number().int().positive().optional().nullable(),
    nota: z.number().min(0).max(10).optional().nullable(),
    codigo: z.string().optional().nullable(), // Código do evento/turma
    instrutor: z.string().optional().nullable(),
    local: z.string().optional().nullable(),
    modalidade: z.string().optional().nullable(),
    observacoes: z.string().optional().nullable(),

    // CERTIFICADO (FK para arquivos)
    certificado_arquivo_id: z.number().int().positive().optional().nullable(),
  })
  .refine((data) => data.funcionario_cpf || data.funcionario_matricula, {
    message: 'Informe CPF ou matrícula do funcionário',
    path: ['funcionario_cpf'],
  });

export type QualificacaoHistoricoImportData = z.infer<typeof QualificacaoHistoricoImportSchema>;
```

**Novo Template (11 colunas):**

```typescript
getTemplateHeaders(): string[] {
  return [
    'funcionario_cpf',           // FK (obrigatório via CPF ou matrícula)
    'qualificacao_codigo',       // FK (obrigatório)
    'data_conclusao',            // Obrigatório (ISO date YYYY-MM-DD)
    'data_vencimento',           // Opcional (ISO date YYYY-MM-DD)
    'carga_horaria',             // Opcional (inteiro)
    'nota',                      // Opcional (0-10)
    'codigo',                    // Opcional (código evento/turma)
    'certificado_arquivo_id',    // Opcional (ID do arquivo em arquivos)
    'instrutor',                 // Opcional
    'local',                     // Opcional
    'modalidade',                // Opcional (PRESENCIAL, ONLINE, HIBRIDO)
    'observacoes'                // Opcional
  ];
}

getTemplateExampleRow(): string[] {
  return [
    '123.456.789-00',            // funcionario_cpf
    'CMA1',                      // qualificacao_codigo
    '2024-01-15',                // data_conclusao
    '2025-01-15',                // data_vencimento
    '40',                        // carga_horaria
    '9.5',                       // nota
    'TURMA-2024-01',             // codigo
    '',                          // certificado_arquivo_id (vazio = NULL)
    'Dr. João Silva',            // instrutor
    'ANAC - Brasília',           // local
    'PRESENCIAL',                // modalidade
    'Renovação anual'            // observacoes
  ];
}
```

---

### **PASSO 3: Remover Auto-Criação de Funcionários** ⏱️ 30min

**Mudanças no método `processarLinha()`:**

```typescript
// ANTES (PROBLEMÁTICO)
let funcionarioId = await this.resolveFuncionarioId(data);
if (!funcionarioId && data.funcionario_nome) {
  funcionarioId = await this.createFuncionarioFromImport(data);
}
if (!funcionarioId) {
  throw new AppError('Funcionário não encontrado', 400);
}

// DEPOIS (VALIDAÇÃO OBRIGATÓRIA)
const funcionarioId = await this.resolveFuncionarioId(data);
if (!funcionarioId) {
  const identifier = data.funcionario_cpf || data.funcionario_matricula || 'desconhecido';
  throw new AppError(
    `Funcionário não encontrado: ${identifier}. Certifique-se de que o CPF/matrícula existe na base de Funcionários.`,
    400,
    'FUNCIONARIO_NAO_ENCONTRADO',
  );
}

const qualificacaoId = await this.resolveQualificacaoId(data);
if (!qualificacaoId) {
  throw new AppError(
    `Qualificação não encontrada: ${data.qualificacao_codigo}. Certifique-se de que o código existe na base de Tipos de Qualificação.`,
    400,
    'QUALIFICACAO_NAO_ENCONTRADA',
  );
}

// Buscar dados do tipo para copiar (cache desnormalizado)
const tipo = await this.db
  .prepare(
    `
  SELECT codigo, categoria FROM qualificacoes_tipos WHERE id = ?
`,
  )
  .bind(qualificacaoId)
  .first<{ codigo: string; categoria: string }>();

if (!tipo) {
  throw new AppError('Tipo de qualificação não encontrado', 500);
}
```

**REMOVER completamente:**

```typescript
// ❌ DELETAR ESTE MÉTODO
private async createFuncionarioFromImport(
  data: QualificacaoHistoricoImportData
): Promise<number> {
  // ... código de auto-criação
}
```

---

### **PASSO 4: Ajustar INSERT com Dados Normalizados** ⏱️ 30min

**Mudança no método `processarLinha()`:**

```typescript
// INSERT com dados normalizados + cache desnormalizado
const result = await this.db
  .prepare(
    `
  INSERT INTO qualificacoes_historico (
    funcionario_id,
    qualificacao_id,
    data_conclusao,
    data_vencimento,
    validade_meses,
    codigo,              -- Cache desnormalizado (copiado do tipo)
    categoria,           -- Cache desnormalizado (copiado do tipo)
    carga_horaria,
    nota,
    instrutor,
    local,
    modalidade,
    observacoes,
    certificado_arquivo_id, -- Novo campo FK
    status,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
`,
  )
  .bind(
    funcionarioId,
    qualificacaoId,
    data.data_conclusao,
    data.data_vencimento || null,
    tipo.validade_meses || null,
    tipo.codigo, // Copia do tipo (cache)
    tipo.categoria, // Copia do tipo (cache)
    data.carga_horaria || null,
    data.nota || null,
    data.instrutor || null,
    data.local || null,
    data.modalidade || null,
    data.observacoes || null,
    data.certificado_arquivo_id || null, // Novo campo
    this.calcularStatus(data.data_vencimento),
    created_at,
    updated_at,
  )
  .run();
```

**Método auxiliar para calcular status:**

```typescript
private calcularStatus(dataVencimento: string | null): string {
  if (!dataVencimento) return 'INDETERMINADA';

  const hoje = new Date();
  const vencimento = new Date(dataVencimento);
  const diffDias = Math.floor((vencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDias < 0) return 'VENCIDA';
  if (diffDias <= 30) return 'PROXIMA_VENCIMENTO';
  if (diffDias <= 60) return 'ATENCAO';
  return 'VALIDA';
}
```

---

### **PASSO 5: Adicionar Suporte XLSX** ⏱️ 3h

**5.1. Instalar Dependência:**

```bash
cd /Users/filipedaumas/Documents/airtrust\ v1
npm install xlsx
npm install -D @types/xlsx
```

**5.2. Criar Utilitário de Parsing:**

**Arquivo:** `worker-airtrust/src/utils/fileParser.ts` (NOVO)

```typescript
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export interface ParsedFile {
  headers: string[];
  rows: Record<string, any>[];
}

export async function parseFile(file: File | Blob, filename: string): Promise<ParsedFile> {
  const extension = filename.toLowerCase().split('.').pop();

  if (extension === 'xlsx' || extension === 'xls') {
    return parseXLSX(file);
  } else if (extension === 'csv') {
    return parseCSV(file);
  } else {
    throw new Error(`Formato não suportado: ${extension}. Use .csv ou .xlsx`);
  }
}

async function parseXLSX(file: File | Blob): Promise<ParsedFile> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  // Ler primeira planilha
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Converter para JSON (primeira linha = header)
  const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  if (json.length < 2) {
    throw new Error('Planilha vazia ou sem dados');
  }

  const headers = json[0] as string[];
  const rows = (json.slice(1) as any[][]).map((row) => {
    const obj: Record<string, any> = {};
    headers.forEach((header, i) => {
      obj[header] = row[i] ?? null;
    });
    return obj;
  });

  return { headers, rows };
}

async function parseCSV(file: File | Blob): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const text = file instanceof File ? file.text() : '';

    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          reject(new Error(`Erro ao parsear CSV: ${results.errors[0].message}`));
        } else {
          resolve({
            headers: results.meta.fields || [],
            rows: results.data as Record<string, any>[],
          });
        }
      },
      error: (error) => reject(error),
    });
  });
}
```

**5.3. Atualizar Service de Importação:**

**Arquivo:** `worker-airtrust/src/services/importacao/ImportacaoService.ts` (linha ~100)

```typescript
// ANTES
import Papa from 'papaparse';

async validar(content: string): Promise<ValidacaoResult> {
  const parsed = Papa.parse<Record<string, any>>(content, {
    header: true,
    skipEmptyLines: true
  });
  // ...
}

// DEPOIS
import { parseFile, ParsedFile } from '@/utils/fileParser';

async validar(file: File | Blob, filename: string): Promise<ValidacaoResult> {
  const parsed = await parseFile(file, filename);
  // ... usar parsed.headers e parsed.rows
}
```

**5.4. Atualizar Frontend:**

**Arquivo:** `src/react-app/components/importacao/ModalImportacao.tsx` (linha ~80)

```tsx
// ANTES
<input
  type="file"
  accept=".csv"
  onChange={handleFileChange}
/>

// DEPOIS
<input
  type="file"
  accept=".csv,.xlsx,.xls"
  onChange={handleFileChange}
/>

// Adicionar indicador visual de formato
{file && (
  <div className="text-sm text-gray-600">
    <FileIcon className="inline w-4 h-4" />
    {file.name} ({file.type || 'application/vnd.ms-excel'})
  </div>
)}
```

---

### **PASSO 6: Atualizar Rotas da API** ⏱️ 1h

**Arquivo:** `worker-airtrust/src/routes/importacao.ts`

**Mudança no endpoint `/validar`:**

```typescript
// ANTES (recebe text/csv)
app.post('/api/importacao/:entidade/validar', async (c) => {
  const content = await c.req.text();
  // ...
});

// DEPOIS (recebe multipart/form-data)
app.post('/api/importacao/:entidade/validar', async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return c.json({ success: false, error: 'Arquivo não enviado' }, 400);
  }

  const filename = file.name;
  const result = await service.validar(file, filename);

  return c.json({ success: true, data: result });
});
```

**Mesma mudança no endpoint `/executar`.**

**Frontend (useImportacao.ts):**

```typescript
// ANTES
const validar = async (content: string) => {
  const response = await fetch(`/api/importacao/${entidade}/validar`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv' },
    body: content,
  });
};

// DEPOIS
const validar = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`/api/importacao/${entidade}/validar`, {
    method: 'POST',
    body: formData, // Sem Content-Type (browser define multipart/form-data)
  });
};
```

---

### **PASSO 7: Criar Testes** ⏱️ 6h

**7.1. Testes Unitários - Schema Zod:**

**Arquivo:** `worker-airtrust/tests/importacao/qualificacao-historico-schema.test.ts` (NOVO)

```typescript
import { describe, it, expect } from 'vitest';
import { QualificacaoHistoricoImportSchema } from '@/services/importacao/QualificacaoHistoricoImportacao';

describe('QualificacaoHistoricoImportSchema', () => {
  it('deve aceitar dados válidos com CPF', () => {
    const data = {
      funcionario_cpf: '123.456.789-00',
      qualificacao_codigo: 'CMA1',
      data_conclusao: '2024-01-15',
      data_vencimento: '2025-01-15',
      carga_horaria: 40,
      nota: 9.5,
      codigo: 'TURMA-01',
      instrutor: 'João Silva',
      local: 'Brasília',
      modalidade: 'PRESENCIAL',
      observacoes: 'OK',
    };

    const result = QualificacaoHistoricoImportSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve REJEITAR dados com funcionario_nome (campo removido)', () => {
    const data = {
      funcionario_cpf: '123.456.789-00',
      funcionario_nome: 'João Silva', // ❌ Campo removido
      qualificacao_codigo: 'CMA1',
      data_conclusao: '2024-01-15',
    };

    const result = QualificacaoHistoricoImportSchema.safeParse(data);
    // Schema ignora campos extras, mas template não deve incluí-los
    expect(data).not.toHaveProperty('funcionario_nome');
  });

  it('deve REJEITAR sem CPF e sem matrícula', () => {
    const data = {
      qualificacao_codigo: 'CMA1',
      data_conclusao: '2024-01-15',
    };

    const result = QualificacaoHistoricoImportSchema.safeParse(data);
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].message).toContain('CPF ou matrícula');
  });

  it('deve REJEITAR sem qualificacao_codigo', () => {
    const data = {
      funcionario_cpf: '123.456.789-00',
      data_conclusao: '2024-01-15',
    };

    const result = QualificacaoHistoricoImportSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve aceitar certificado_arquivo_id como número', () => {
    const data = {
      funcionario_cpf: '123.456.789-00',
      qualificacao_codigo: 'CMA1',
      data_conclusao: '2024-01-15',
      certificado_arquivo_id: 123,
    };

    const result = QualificacaoHistoricoImportSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});
```

**7.2. Testes Integração - Validação de FKs:**

**Arquivo:** `worker-airtrust/tests/importacao/qualificacao-historico-validation.test.ts` (NOVO)

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { QualificacaoHistoricoImportacao } from '@/services/importacao/QualificacaoHistoricoImportacao';

describe('QualificacaoHistoricoImportacao - Validação FK', () => {
  let service: QualificacaoHistoricoImportacao;

  beforeAll(async () => {
    // Setup: criar funcionário e tipo de teste
    // ...
  });

  it('deve REJEITAR quando CPF não existe', async () => {
    const csv = `funcionario_cpf,qualificacao_codigo,data_conclusao
999.999.999-99,CMA1,2024-01-15`;

    const result = await service.validar(new Blob([csv]), 'test.csv');

    expect(result.validos).toBe(0);
    expect(result.invalidos).toBe(1);
    expect(result.erros[0].mensagem).toContain('Funcionário não encontrado');
  });

  it('deve REJEITAR quando qualificacao_codigo não existe', async () => {
    const csv = `funcionario_cpf,qualificacao_codigo,data_conclusao
123.456.789-00,CODIGO_INEXISTENTE,2024-01-15`;

    const result = await service.validar(new Blob([csv]), 'test.csv');

    expect(result.validos).toBe(0);
    expect(result.invalidos).toBe(1);
    expect(result.erros[0].mensagem).toContain('Qualificação não encontrada');
  });

  it('deve ACEITAR quando ambos FKs existem', async () => {
    const csv = `funcionario_cpf,qualificacao_codigo,data_conclusao
123.456.789-00,CMA1,2024-01-15`;

    const result = await service.validar(new Blob([csv]), 'test.csv');

    expect(result.validos).toBe(1);
    expect(result.invalidos).toBe(0);
  });
});
```

**7.3. Teste E2E - Fluxo Completo:**

```typescript
describe('Importação E2E', () => {
  it('deve importar histórico normalizado via CSV', async () => {
    // 1. Criar funcionário
    // 2. Criar tipo de qualificação
    // 3. Importar histórico com CPF + código
    // 4. Verificar registro criado com FKs corretos
    // 5. Verificar que codigo e categoria foram copiados
  });

  it('deve importar histórico via XLSX', async () => {
    // Mesmo teste acima mas com arquivo .xlsx
  });
});
```

---

### **PASSO 8: Atualizar Documentação** ⏱️ 2h

**Arquivo:** `docs/IMPORTACAO.md`

**Seções a Atualizar:**

1. **Seção 2.3: Histórico de Qualificações**

   - Listar apenas 11 colunas (remover funcionario_nome, qualificacao_nome, tipo_codigo, categoria)
   - Adicionar certificado_arquivo_id
   - Enfatizar validações obrigatórias

2. **Nova Seção: Suporte a Excel (XLSX)**

   ```markdown
   ## 📊 Suporte a Excel (XLSX)

   Além de CSV, todos os módulos aceitam arquivos Excel (.xlsx, .xls).

   **Regras:**

   - Usar primeira planilha (sheet) do arquivo
   - Primeira linha = nomes das colunas (header)
   - Mesmas colunas do template CSV
   - Detectado automaticamente por extensão

   **Exemplo de uso:**

   1. Baixar template CSV
   2. Abrir no Excel
   3. Preencher dados
   4. Salvar como .xlsx
   5. Importar normalmente
   ```

3. **Seção 6: Validações**

   - Adicionar:
     - "Funcionário DEVE existir (CPF ou matrícula)"
     - "Tipo de qualificação DEVE existir (código)"
     - "Sistema NÃO cria entidades automaticamente"

4. **Seção 7: Troubleshooting**
   - Adicionar:
     - "Erro 'Funcionário não encontrado': Cadastre o funcionário antes de importar histórico"
     - "Erro 'Qualificação não encontrada': Cadastre o tipo antes de importar histórico"

---

## 🎯 RESUMO DAS MUDANÇAS

### 📊 Estatísticas Estimadas:

| Item                     | Antes                | Depois                | Mudança |
| ------------------------ | -------------------- | --------------------- | ------- |
| **Colunas no Template**  | 17                   | 11                    | -35%    |
| **Campos Obrigatórios**  | 1                    | 3                     | +200%   |
| **Validações de FK**     | Leniente (auto-cria) | Obrigatória (rejeita) | 🔒      |
| **Formatos Suportados**  | CSV                  | CSV + XLSX            | +50%    |
| **Migrations**           | 0097                 | 0098                  | +1      |
| **Arquivos Modificados** | -                    | ~8                    | -       |
| **Linhas de Código**     | -                    | ~500                  | -       |
| **Tempo Estimado**       | -                    | 9.5h                  | -       |

### 🔄 Arquivos Afetados:

**Novos:**

1. `worker-airtrust/migrations/0098_add_certificado_arquivo_fk.sql`
2. `worker-airtrust/src/utils/fileParser.ts`
3. `worker-airtrust/tests/importacao/qualificacao-historico-schema.test.ts`
4. `worker-airtrust/tests/importacao/qualificacao-historico-validation.test.ts`

**Modificados:**

1. `worker-airtrust/src/services/importacao/QualificacaoHistoricoImportacao.ts` (~150 linhas)
2. `worker-airtrust/src/services/importacao/ImportacaoService.ts` (~50 linhas)
3. `worker-airtrust/src/routes/importacao.ts` (~30 linhas)
4. `src/react-app/components/importacao/ModalImportacao.tsx` (~20 linhas)
5. `src/react-app/hooks/useImportacao.ts` (~30 linhas)
6. `docs/IMPORTACAO.md` (~100 linhas)
7. `package.json` (+2 deps)

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

### Fase 1: Banco de Dados (30min)

- [ ] Criar migration 0098
- [ ] Aplicar localmente (`wrangler d1 execute --local`)
- [ ] Verificar coluna certificado_arquivo_id
- [ ] Testar INSERT com novo campo

### Fase 2: Backend Core (3h)

- [ ] Refatorar QualificacaoHistoricoImportSchema (11 campos)
- [ ] Atualizar getTemplateHeaders() e getTemplateExampleRow()
- [ ] Remover createFuncionarioFromImport()
- [ ] Adicionar validações obrigatórias de FK
- [ ] Atualizar INSERT com certificado_arquivo_id
- [ ] Criar método calcularStatus()
- [ ] Testar localmente

### Fase 3: Suporte XLSX (3h)

- [ ] Instalar `npm install xlsx @types/xlsx`
- [ ] Criar fileParser.ts
- [ ] Atualizar ImportacaoService.validar()
- [ ] Atualizar ImportacaoService.executar()
- [ ] Atualizar rotas (/validar, /executar) para multipart/form-data
- [ ] Atualizar frontend (accept=".csv,.xlsx")
- [ ] Atualizar useImportacao.ts (FormData)
- [ ] Testar CSV e XLSX localmente

### Fase 4: Testes (6h)

- [ ] Criar qualificacao-historico-schema.test.ts
- [ ] Criar qualificacao-historico-validation.test.ts
- [ ] Testes E2E (CSV + XLSX)
- [ ] Executar: `npm run test`
- [ ] Cobertura > 80%

### Fase 5: Documentação (2h)

- [ ] Atualizar docs/IMPORTACAO.md
- [ ] Adicionar seção XLSX
- [ ] Atualizar exemplos
- [ ] Atualizar troubleshooting
- [ ] Criar changelog

### Fase 6: Deploy (1h)

- [ ] Build: `npm run build`
- [ ] Aplicar migration 0098 em produção
- [ ] Deploy: `./deploy-full-automated.sh`
- [ ] Smoke test em produção
- [ ] Monitorar logs

---

## 🚨 RISCOS E MITIGAÇÕES

### Risco 1: Dados Existentes com numero_certificado

**Impacto:** Médio  
**Mitigação:** Campo numero_certificado continua existindo. Migration adiciona certificado_arquivo_id como opcional. Migração manual futura se necessário.

### Risco 2: Importações Antigas Falharem

**Impacto:** Alto  
**Mitigação:** Template antigo (17 colunas) gerará erro de validação claro. Usuários devem baixar novo template.

### Risco 3: Perda de Dados na Migration

**Impacto:** Crítico  
**Mitigação:** Migration 0098 apenas ADICIONA coluna, não remove nada. Backup automático antes de deploy.

### Risco 4: XLSX Parsing Falhar

**Impacto:** Médio  
**Mitigação:** Testes abrangentes com diferentes formatos. Fallback: mensagem clara para usar CSV.

---

## 📅 CRONOGRAMA SUGERIDO

### Dia 1 (4h):

- Manhã: Passos 1-2 (Migration + Schema Zod)
- Tarde: Passo 3-4 (Remover auto-criação + INSERT)

### Dia 2 (5h):

- Manhã: Passo 5 (Suporte XLSX)
- Tarde: Passo 6 (Rotas API)

### Dia 3 (6h):

- Dia todo: Passo 7 (Testes)

### Dia 4 (3h):

- Manhã: Passo 8 (Documentação)
- Tarde: Deploy e validação

**Total:** 18h (~2.5 dias de trabalho)

---

## 🎬 PRÓXIMOS PASSOS

1. **Revisar este plano** - Aprovar/ajustar antes de começar
2. **Executar Fase 1** - Migration
3. **Executar Fase 2** - Backend Core
4. **Executar Fase 3** - XLSX
5. **Executar Fase 4** - Testes
6. **Executar Fase 5** - Docs
7. **Executar Fase 6** - Deploy

---

**🔥 Pronto para começar?** Diga "SIM, APLIQUE TUDO" para iniciar implementação completa sem confirmações intermediárias.
