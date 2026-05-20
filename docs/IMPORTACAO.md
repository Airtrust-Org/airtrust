# 📥 Sistema de Importação Inteligente

Sistema completo para importação em massa de dados via CSV com validação, preview e merge inteligente.

## 🎯 Visão Geral

O módulo de importação permite importar grandes volumes de dados via arquivos CSV com:

- ✅ **Validação prévia** sem persistir no banco
- ✅ **Preview detalhado** com KPIs e detalhes linha a linha
- ✅ **4 modos de merge** configuráveis
- ✅ **Detecção inteligente de duplicatas**
- ✅ **Batch processing** (25 registros por lote)
- ✅ **Auditoria completa** de todas operações
- ✅ **Rollback** de importações via dados originais
- ✅ **Download de templates** CSV padronizados

---

## 📐 Arquitetura

### Frontend

```
src/react-app/
├── hooks/
│   └── useImportacao.ts          # Hook reutilizável (7 métodos públicos)
├── components/importacao/
│   └── ModalImportacao.tsx       # Modal universal (3 entidades)
└── pages/
    ├── Funcionarios.tsx          # Botão "Importar Funcionários"
    └── QualificacoesNew.tsx      # 2 botões (Tipos + Histórico)
```

### Backend

```
worker-airtrust/src/
├── routes/
│   └── importacao.ts             # 5 endpoints REST
└── services/importacao/
    ├── ImportacaoService.ts      # Classe abstrata base (596 linhas)
    ├── FuncionarioImportacao.ts  # Implementação específica
    ├── QualificacaoTipoImportacao.ts
    └── QualificacaoHistoricoImportacao.ts
```

### Banco de Dados

```sql
-- Migration 0101
CREATE TABLE importacoes_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entidade TEXT NOT NULL,
  usuario_id INTEGER NOT NULL,
  total_rows INTEGER NOT NULL,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  skipped INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  merge_mode TEXT NOT NULL,
  file_name TEXT,
  raw_data TEXT NOT NULL,     -- JSON para rollback
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reverted_at DATETIME,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);
```

---

## 🚀 Como Usar

### 1. Interface (Mais Fácil)

#### Passo a Passo:

1. **Acesse a tela desejada:**

   - `/funcionarios` → Botão "Importar Funcionários"
   - `/qualificacoes` → Botão "Importar Tipos" ou "Importar Histórico"

2. **Baixe o template:**

   - Clique em "Baixar Template de [Entidade]"
   - Abre arquivo CSV com colunas corretas

3. **Preencha os dados:**

   - Use Excel, Google Sheets ou editor de texto
   - **Mantenha os cabeçalhos** (primeira linha)
   - Formate datas como `YYYY-MM-DD`

4. **Faça upload:**

   - Arraste arquivo para área de upload OU
   - Clique e selecione arquivo OU
   - Cole texto CSV na caixa de texto

5. **Revise o preview:**

   - Veja KPIs: Total, Válidos, Avisos, Erros
   - Analise detalhes linha a linha
   - Escolha modo de importação

6. **Confirme:**
   - Clique "Confirmar Importação"
   - Aguarde processamento (barra de progresso)
   - Veja mensagem de sucesso

### 2. API (Programático)

#### Endpoints Disponíveis:

```typescript
// 1. Validar dados (sem persistir)
POST /api/importacao/validar
Body: {
  entidade: 'funcionarios' | 'qualificacoes_tipos' | 'qualificacoes_historico',
  rows: Array<Record<string, unknown>>,
  mergeMode: 'COMPLETAR' | 'MESCLAR_INTELIGENTE' | 'SOBRESCREVER' | 'PULAR'
}
Response: ResultadoValidacao

// 2. Executar importação (persiste no banco)
POST /api/importacao/executar
Body: {
  entidade: string,
  validationResult: ResultadoValidacao,
  mergeMode: MergeMode
}
Response: { success: boolean, data: { created, updated, skipped, failed } }

// 3. Baixar template CSV
GET /api/importacao/template/:entidade
Response: text/csv (download)

// 4. Listar histórico
GET /api/importacao/historico?entidade=funcionarios&limit=50&offset=0
Response: Array<ImportacaoLogEntry>

// 5. Reverter importação (rollback)
POST /api/importacao/:id/reverter
Body: { entidade: string }
Response: { success: boolean }
```

#### Exemplo de Uso:

```typescript
import { useImportacao } from '@/react-app/hooks/useImportacao';

function MeuComponente() {
  const { parsearCSV, validarDados, executarImportacao, baixarTemplate } =
    useImportacao('funcionarios');

  const handleImport = async (file: File) => {
    // 1. Parse CSV
    const rows = await parsearCSV(file);
    console.log(`${rows.length} linhas parseadas`);

    // 2. Validar (sem persistir)
    const resultado = await validarDados(rows, { modo: 'MESCLAR_INTELIGENTE' });
    if (!resultado) {
      console.error('Erro na validação');
      return;
    }

    console.log(`Válidos: ${resultado.criar + resultado.completar + resultado.mesclar}`);
    console.log(`Erros: ${resultado.erros}`);

    // 3. Executar (persiste no banco)
    if (resultado.erros === 0) {
      const sucesso = await executarImportacao(rows, { modo: 'MESCLAR_INTELIGENTE' });
      if (sucesso) {
        console.log('Importação concluída!');
      }
    }
  };

  return <button onClick={() => baixarTemplate()}>Baixar Template</button>;
}
```

---

## 🎨 Modos de Importação

### 1. **Preencher Vazios** (`COMPLETAR`)

**Quando usar:** Adicionar informações complementares sem alterar dados existentes.

**Comportamento:**

- ✅ Adiciona valores apenas em campos `NULL` ou vazios
- ✅ **Preserva todos os dados existentes**
- ❌ Não sobrescreve campos preenchidos

**Exemplo:**

```
Banco:    { nome: "João Silva", email: null }
CSV:      { nome: "João S.",    email: "joao@email.com" }
Resultado: { nome: "João Silva", email: "joao@email.com" }
                    ↑ mantido          ↑ adicionado
```

---

### 2. **Atualizar Inteligente** (`MESCLAR_INTELIGENTE`) ⭐ **RECOMENDADO**

**Quando usar:** Atualizar dados com informações mais completas ou recentes.

**Comportamento:**

- ✅ Compara campo por campo
- ✅ **Mantém o valor mais completo**
- ✅ Prioriza não-nulos sobre nulos
- ✅ Prioriza strings maiores

**Exemplo:**

```
Banco:    { nome: "João",        telefone: "999999999", cargo: null }
CSV:      { nome: "João Silva",  telefone: null,        cargo: "Piloto" }
Resultado: { nome: "João Silva",  telefone: "999999999", cargo: "Piloto" }
                    ↑ CSV maior        ↑ banco não-null    ↑ CSV não-null
```

**Lógica de priorização:**

1. Não-null > null
2. String maior > string menor
3. Valor banco se empate

---

### 3. **Substituir Tudo** (`SOBRESCREVER`)

**Quando usar:** Resetar completamente os dados de um registro.

**Comportamento:**

- ✅ **Substitui TODOS os campos**
- ⚠️ Pode apagar dados existentes
- ⚠️ Use com cuidado

**Exemplo:**

```
Banco:    { nome: "João Silva", email: "joao@old.com", telefone: "999999999" }
CSV:      { nome: "João S.",    email: "joao@new.com", telefone: null }
Resultado: { nome: "João S.",    email: "joao@new.com", telefone: null }
                    ↑ substituído      ↑ substituído        ↑ apagado!
```

---

### 4. **Pular Duplicatas** (`PULAR`)

**Quando usar:** Importar apenas registros novos, ignorando existentes.

**Comportamento:**

- ✅ Cria novos registros
- ✅ **Ignora completamente duplicatas**
- ❌ Não atualiza nada

**Exemplo:**

```
Banco:    { id: 1, cpf: "111.111.111-11", nome: "João Silva" }
CSV:      { cpf: "111.111.111-11", nome: "João Santos" }  ← IGNORADO
CSV:      { cpf: "222.222.222-22", nome: "Maria Silva" }  ← CRIADO
```

---

## 🔍 Detecção de Duplicatas

### Funcionários

**3 níveis de prioridade:**

1. **CPF** (chave primária)
2. **Matrícula** (chave secundária)
3. **Email** (chave terciária)

**Lógica:** Busca primeiro por CPF. Se não encontrar, busca por matrícula. Se não encontrar, busca por email.

```typescript
// Exemplo
CSV: { cpf: "111.111.111-11", matricula: "1001", email: "joao@email.com" }

// Query 1: SELECT * FROM funcionarios WHERE cpf = '111.111.111-11'
// Se encontrar → UPDATE/SKIP/MESCLAR conforme modo
// Se não encontrar → Query 2

// Query 2: SELECT * FROM funcionarios WHERE matricula = '1001'
// Se encontrar → UPDATE/SKIP/MESCLAR conforme modo
// Se não encontrar → Query 3

// Query 3: SELECT * FROM funcionarios WHERE email = 'joao@email.com'
// Se encontrar → UPDATE/SKIP/MESCLAR conforme modo
// Se não encontrar → CREATE
```

### Qualificações (Tipos)

**Chave única:** `codigo`

### Qualificações (Histórico)

**Chave composta:** `(funcionario_id, qualificacao_tipo_id)`

---

## ✅ Validações Implementadas

### Funcionários

| Campo             | Validação                          | Exemplo Válido    |
| ----------------- | ---------------------------------- | ----------------- |
| **matricula**     | String, mín. 1 char                | "1001"            |
| **nome**          | String, mín. 3 chars               | "João Silva"      |
| **cpf**           | Formato + Mod 11                   | "111.111.111-11"  |
| **email**         | Formato RFC 5322                   | "joao@email.com"  |
| **telefone**      | Opcional                           | "(11) 99999-9999" |
| **cargo**         | Opcional                           | "Piloto"          |
| **setor**         | Opcional                           | "Operações"       |
| **funcao**        | Opcional                           | "Comandante"      |
| **codigo_anac**   | Opcional                           | "123456"          |
| **ativo**         | Boolean (0/1, true/false, sim/não) | "1" ou "sim"      |
| **is_instrutor**  | Boolean                            | "0" ou "não"      |
| **is_checador**   | Boolean                            | "1" ou "sim"      |
| **data_admissao** | ISO 8601 (YYYY-MM-DD)              | "2023-01-15"      |

### Qualificações - Tipos

| Campo              | Validação            | Exemplo Válido                                     |
| ------------------ | -------------------- | -------------------------------------------------- |
| **codigo**         | String única         | "CMA-2024"                                         |
| **nome**           | String, mín. 3 chars | "Certificado Médico Aeronáutico"                   |
| **categoria**      | Enum                 | "SAUDE", "COMPETENCIA", "TREINAMENTO", "SEGURANCA" |
| **validade_meses** | Inteiro positivo     | 12, 24, 36                                         |
| **descricao**      | Opcional             | "CMA Classe 1..."                                  |

### Qualificações - Histórico

| Campo                     | Validação                | Exemplo Válido                 |
| ------------------------- | ------------------------ | ------------------------------ |
| **matricula_funcionario** | FK → funcionarios        | "1001"                         |
| **codigo_qualificacao**   | FK → qualificacoes_tipos | "CMA-2024"                     |
| **data_obtencao**         | ISO 8601                 | "2024-01-15"                   |
| **data_validade**         | ISO 8601                 | "2025-01-15"                   |
| **status**                | Enum                     | "ATIVO", "VENCIDO", "PENDENTE" |
| **nota**                  | Inteiro 1-5              | 4                              |
| **observacoes**           | Opcional                 | "Renovado com sucesso"         |

---

## 📊 Batch Processing

**Por que usar batches?**

- Evita timeout em importações grandes
- Controla uso de memória
- Permite progresso incremental

**Configuração atual:** 25 registros por lote

```typescript
// ImportacaoService.ts
const BATCH_SIZE = 25;

for (let i = 0; i < validationResult.detalhes.length; i += BATCH_SIZE) {
  const batch = validationResult.detalhes.slice(i, i + BATCH_SIZE);
  await this.processBatch(batch);
}
```

**Estimativas de tempo:**

| Registros | Batches | Tempo Estimado |
| --------- | ------- | -------------- |
| 10        | 1       | < 1s           |
| 100       | 4       | ~3s            |
| 500       | 20      | ~15s           |
| 1000      | 40      | ~30s           |
| 5000      | 200     | ~2min          |

---

## 🔐 Segurança

### Implementado ✅

- ✅ **Autenticação obrigatória:** Middleware `auth()` em todas rotas
- ✅ **SQL Injection protegido:** D1 prepared statements
- ✅ **Validação de entrada:** Zod schemas com refinements
- ✅ **Try-catch abrangente:** Errors não vazam stack trace em prod
- ✅ **Soft delete awareness:** Reativa registros deletados em vez de criar duplicatas

### Recomendações Futuras ⚠️

- ⚠️ **Rate limiting:** Limitar 10 importações/min por usuário
- ⚠️ **CSV injection:** Sanitizar cells começando com `=`, `@`, `+`, `-`
- ⚠️ **File size limit:** Máximo 5MB por arquivo
- ⚠️ **Audit log detalhado:** Registrar IP, user agent, timestamps

---

## 🐛 Troubleshooting

### Problema: "Arquivo CSV está vazio"

**Causa:** Arquivo sem dados ou apenas com cabeçalhos.

**Solução:**

1. Verifique se há pelo menos 1 linha de dados (além dos cabeçalhos)
2. Certifique-se de que não há linhas vazias no meio do arquivo
3. Salve com encoding UTF-8

---

### Problema: "Erro na validação dos dados"

**Causa:** Campos obrigatórios vazios ou formato inválido.

**Solução:**

1. Baixe o template novamente
2. Compare cabeçalhos: devem ser **exatamente iguais**
3. Verifique formatos:
   - Datas: `YYYY-MM-DD`
   - CPF: `XXX.XXX.XXX-XX` ou `XXXXXXXXXXX`
   - Email: formato válido com `@`

---

### Problema: "Nenhum registro foi importado" (todos SKIP)

**Causa:** Modo `PULAR` selecionado e todos os registros já existem.

**Solução:**

- Use modo **"Atualizar Inteligente"** para mesclar dados
- Ou use **"Substituir Tudo"** para forçar atualização

---

### Problema: "Caracteres estranhos nos nomes" (José → JosÃ©)

**Causa:** Encoding incorreto do arquivo CSV.

**Solução:**

1. Abra CSV em editor de texto (VS Code, Notepad++)
2. Salve com encoding **UTF-8**
3. Reimporte o arquivo

**Excel:** Salvar Como → CSV UTF-8 (delimitado por vírgula)

---

### Problema: "Importação travou em 90%"

**Causa:** Progresso atual é simulado (não reflete backend real).

**Solução:**

- Aguarde mais tempo (importações grandes demoram)
- Verifique console do navegador (F12) para erros
- Após completar, recarregue listagem

**Melhoria futura:** Progresso real via Server-Sent Events

---

### Problema: "CPF inválido" mas o CPF está correto

**Causa:** Validação Mod 11 falhou ou caracteres extras.

**Solução:**

1. Remova pontos e traços: `11111111111` ou `111.111.111-11` (ambos válidos)
2. Certifique-se de que são 11 dígitos
3. CPFs de teste (111.111.111-11, 999.999.999-99) são **inválidos**

---

## 📝 Exemplos de CSV

### Funcionários

```csv
matricula,nome,cpf,email,telefone,cargo,setor,funcao,codigo_anac,ativo,is_instrutor,is_checador,data_admissao
1001,João Silva,111.111.111-11,joao@email.com,(11) 99999-9999,Piloto,Operações,Comandante,123456,1,1,0,2023-01-15
1002,Maria Santos,222.222.222-22,maria@email.com,,Mecânica,Manutenção,Técnica,,1,0,0,2023-02-01
```

### Qualificações - Tipos

```csv
codigo,nome,categoria,validade_meses,descricao
CMA-2024,Certificado Médico Aeronáutico,SAUDE,12,CMA Classe 1
ICAO-PROF,Proficiência ICAO,COMPETENCIA,24,Proficiência linguística
```

### Qualificações - Histórico

```csv
matricula_funcionario,codigo_qualificacao,data_obtencao,data_validade,status,nota,observacoes
1001,CMA-2024,2024-01-15,2025-01-15,ATIVO,5,Sem restrições
1001,ICAO-PROF,2023-06-01,2025-06-01,ATIVO,4,Nível 4
```

---

## 🧪 Testes

### Fixtures Disponíveis

Criados na auditoria, em `test-fixtures/`:

1. ✅ `funcionarios-validos.csv` - 3 registros OK
2. ✅ `funcionarios-email-duplicado.csv` - Teste duplicata
3. ✅ `funcionarios-erros-validacao.csv` - 6 erros diversos
4. ✅ `funcionarios-encoding-especial.csv` - UTF-8, unicode
5. ✅ `qualificacoes-tipos-validos.csv` - 5 tipos
6. ✅ `qualificacoes-historico-validos.csv` - 6 registros
7. ✅ `qualificacoes-historico-erros.csv` - FKs inexistentes

### Como Testar

```bash
# 1. Inicie ambiente local
npm run dev:all

# 2. Acesse http://localhost:3000/funcionarios

# 3. Clique "Importar Funcionários"

# 4. Selecione um fixture de test-fixtures/

# 5. Verifique resultados esperados (ver test-fixtures/README.md)
```

---

## 🚀 Roadmap (Melhorias Futuras)

### Alta Prioridade

- [ ] Substituir progresso simulado por SSE (Server-Sent Events)
- [ ] Adicionar paginação na tabela de preview (> 50 linhas)
- [ ] Implementar rate limiting (10 req/min por usuário)
- [ ] Melhorar mensagens de erro com sugestões específicas

### Média Prioridade

- [ ] Testes E2E automatizados (Playwright)
- [ ] Histórico de importações no frontend
- [ ] Rollback visual com botão
- [ ] Stress test com 1000+ linhas

### Baixa Prioridade

- [ ] Drag & drop explícito
- [ ] Exportar templates em Excel (.xlsx)
- [ ] Dark mode para modal
- [ ] Preview expandido com diff visual

---

## 📞 Suporte

**Documentação:**

- Este arquivo: `docs/IMPORTACAO.md`
- Relatório de auditoria: `RELATORIO_FINAL_AUDITORIA_IMPORTACAO.md`
- Checklist detalhado: `AUDITORIA_IMPORTACAO_SISTEMATICA.md`

**Código-fonte:**

- Frontend: `src/react-app/hooks/useImportacao.ts`
- Backend: `worker-airtrust/src/services/importacao/`
- Rotas: `worker-airtrust/src/routes/importacao.ts`

**Contato:**

- Issues: GitHub repo
- Email: dev@airtrust.com

---

**Última atualização:** 24/11/2025  
**Versão:** 1.0  
**Status:** ✅ Pronto para produção
