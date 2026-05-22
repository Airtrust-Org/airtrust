# 📥 Guia de Importação XLSX - AirTrust

## ✅ Implementação Completa (v4df5075c - 04/02/2026)

Sistema completo de importação de dados via planilhas Excel (.xlsx) para as 3 principais tabelas do sistema.

---

## 🎯 Funcionalidades

### **3 Tabelas Suportadas**

1. **Funcionários** (`/api/importacao-xlsx/funcionarios`)
2. **Histórico de Qualificações** (`/api/importacao-xlsx/historico`)
3. **Tipos de Qualificações** (`/api/importacao-xlsx/tipos`)

### **2 Modos de Importação**

#### 🟢 **Completar Dados** (Padrão)

- Adiciona novos registros
- Atualiza registros existentes (busca por CPF/Código)
- **Preserva dados atuais** que não estão na planilha
- Recomendado para: atualizações incrementais, adição de novos funcionários

#### 🔴 **Substituir Todos os Dados** (Crítico)

- **DELETA PERMANENTEMENTE** todos os registros existentes
- Insere apenas os dados da planilha
- **Confirmação obrigatória** com aviso destacado
- Recomendado para: reset completo do banco, migração inicial

---

## 📋 Template das Planilhas

### **IMPORTANTE:** Use o template da exportação!

Para garantir compatibilidade:

1. Clique em **"Exportar"** na tela desejada
2. Baixe a planilha XLSX atual
3. Edite os dados conforme necessário
4. Importe de volta

As colunas devem corresponder **EXATAMENTE** ao formato exportado.

---

## 📊 Estrutura das Planilhas

### **1. Funcionários** (18 colunas)

```
ID | Nome | Matrícula | CPF | Email | Telefone | Nascimento | Admissão |
Cargo | Função | Aeronave | Código ANAC | Licença | Instrutor |
Examinador | Ativo | Criado em | Atualizado em
```

**Campos Obrigatórios:**

- Nome
- CPF

**Campos Especiais:**

- `Instrutor`: "Sim" ou "Não"
- `Examinador`: "Sim" ou "Não"
- `Ativo`: "Sim" ou "Não"
- `Aeronave`: Busca automática em modelos_aeronave (por modelo, código ou nome)

**Identificação Única:** CPF (para detectar duplicatas)

---

### **2. Histórico de Qualificações** (18 colunas)

```
ID | Funcionário | Matrícula | Qualificação | Código | Categoria |
Data Conclusão | Data Vencimento | Instrutor | Examinador |
Observações | Modelo Aeronave | Status | Criado em | Atualizado em
```

**Campos Obrigatórios:**

- Funcionário (nome exato, deve existir em `funcionarios`)
- Qualificação (nome exato, deve existir em `tipos_qualificacoes`)

**Validações Automáticas:**

- Funcionário: busca por nome em `funcionarios`
- Qualificação: busca por nome em `tipos_qualificacoes`
- Status padrão: "CONCLUIDA"

**Identificação Única:** Combinação de funcionario_id + tipo_qualificacao_id + data_conclusao

---

### **3. Tipos de Qualificações** (12 colunas)

```
ID | Tipo | Código | Nome | Descrição | Categoria |
Carga Horária | Validade (meses) | Observações | Ativo |
Criado em | Atualizado em
```

**Campos Obrigatórios:**

- Nome
- Código

**Campos Especiais:**

- `Ativo`: "Sim" ou "Não"
- `Validade (meses)`: número inteiro

**Identificação Única:** Código

---

## 🔄 Fluxo de Importação

### **Passo a Passo**

1. **Exportar Template**
   - Acesse a tela desejada (Funcionários, Qualificações ou Tipos)
   - Clique em "Exportar"
   - Baixe a planilha XLSX

2. **Editar Planilha**
   - Abra no Excel/LibreOffice/Google Sheets
   - **NÃO altere os nomes das colunas**
   - Edite apenas os dados (linhas)
   - Mantenha o formato das colunas

3. **Importar**
   - Clique em "Importar" na mesma tela
   - Selecione o modo:
     - **Completar Dados**: Atualiza e adiciona
     - **Substituir Todos**: Deleta tudo e insere (⚠️ cuidado!)
   - Escolha o arquivo XLSX
   - Clique em "Importar"

4. **Resultado**
   - ✅ **Sucesso**: Mostra quantos registros foram inseridos/atualizados
   - ⚠️ **Erros**: Lista linhas com problemas e motivos
   - 📊 **Estatísticas**: Total processado, inseridos, atualizados, deletados

---

## ⚠️ Tratamento de Erros

### **Validações Implementadas**

1. **Campos Obrigatórios**
   - Sistema valida presença dos campos marcados como obrigatórios
   - Erro: "Nome e CPF são obrigatórios" (exemplo)

2. **Referências Cruzadas**
   - Funcionário não encontrado: "Funcionário não encontrado: João Silva"
   - Tipo não encontrado: "Tipo de qualificação não encontrado: CGA"

3. **Formato de Dados**
   - Datas: YYYY-MM-DD (ISO) ou formato Excel
   - Números: valores numéricos
   - Sim/Não: exatamente essas palavras

4. **Planilha Vazia**
   - Erro: "Planilha vazia"

5. **Arquivo Inválido**
   - Erro: "Apenas arquivos Excel (.xlsx ou .xls) são permitidos"

### **Exibição de Erros**

- Lista até 10 primeiros erros
- Mostra linha exata do erro
- Descreve o problema encontrado
- Opção de ver todos os erros (se mais de 10)

---

## 🛡️ Segurança e Validações

### **Autenticação**

- Todas as rotas protegidas por `auth()` middleware
- Token JWT obrigatório

### **Soft Delete**

- Modo "Substituir" usa soft delete (`deleted_at`)
- Dados não são removidos fisicamente do banco
- Possível recuperação via SQL direto

### **Transações**

- Cada linha processada individualmente
- Falha em uma linha não afeta as outras
- Relatório detalhado de sucessos e falhas

---

## 📁 Arquivos do Sistema

### **Backend**

- `worker-airtrust/src/routes/importacao-xlsx.ts` - Endpoints e lógica
- `worker-airtrust/src/index.ts` - Registro de rotas (linha ~565)

### **Frontend**

- `src/react-app/components/ImportarXLSX.tsx` - Modal de importação
- `src/react-app/pages/Funcionarios.tsx` - Integração na tela
- `src/react-app/pages/Qualificacoes.tsx` - Integração nas abas

---

## 🧪 Testando Localmente

### **1. Exportar Dados Atuais**

```bash
# Acesse cada tela e exporte:
# - http://localhost:3000/funcionarios → Exportar
# - http://localhost:3000/qualificacoes (aba Histórico) → Exportar
# - http://localhost:3000/qualificacoes (aba Tipos) → Exportar
```

### **2. Editar Planilha**

```excel
# Exemplo: adicionar novo funcionário
Nome: José da Silva
CPF: 123.456.789-00
Email: jose@exemplo.com
Função: Piloto
Ativo: Sim
```

### **3. Importar em Modo "Completar"**

- Upload da planilha editada
- Verificar resultado (inseridos: 1, atualizados: 0)

### **4. Testar Modo "Substituir" (⚠️)**

- Fazer backup primeiro!
- Upload da planilha
- Confirmar ação
- Verificar que TODOS os dados foram substituídos

---

## 🚀 Endpoints da API

### **POST /api/importacao-xlsx/funcionarios**

```typescript
// Request: FormData
file: File (XLSX)
mode: 'completar' | 'substituir'

// Response
{
  success: boolean;
  mode: string;
  totalRows: number;
  inserted: number;
  updated: number;
  deleted?: number;
  errors: Array<{
    linha: number;
    erro: string;
    dados?: Record<string, any>;
  }>;
}
```

### **POST /api/importacao-xlsx/historico**

Mesma estrutura acima.

### **POST /api/importacao-xlsx/tipos**

Mesma estrutura acima.

---

## 💡 Dicas e Boas Práticas

### ✅ **Recomendações**

1. **Sempre use o template exportado** - Garante compatibilidade de colunas
2. **Teste com poucos registros primeiro** - Valide o formato antes de importar tudo
3. **Modo "Completar" para atualizações** - Mais seguro para adições incrementais
4. **Backup antes de "Substituir"** - Use o script de backup do sistema
5. **Valide dados externos** - Se importar de outro sistema, revise manualmente primeiro

### ❌ **Evite**

1. **Alterar nomes de colunas** - Sistema não reconhecerá
2. **Usar "Substituir" sem backup** - Pode perder dados importantes
3. **Importar dados não validados** - Pode gerar muitos erros
4. **Misturar formatos de data** - Use sempre YYYY-MM-DD
5. **Deixar células vazias em campos obrigatórios** - Causará erro

---

## 🐛 Troubleshooting

### **Erro: "Planilha vazia"**

- Verifique se há dados nas linhas (além do cabeçalho)
- Certifique-se que a primeira aba tem dados

### **Erro: "Funcionário não encontrado"**

- Nome deve ser **exatamente** igual ao cadastrado
- Verifique espaços extras ou acentuação

### **Erro: "Apenas arquivos Excel (.xlsx ou .xls) são permitidos"**

- Não use CSV
- Use Excel 2007+ (.xlsx)

### **Importação muito lenta**

- Sistema processa linha por linha para segurança
- Considere dividir em lotes menores (< 1000 linhas)

### **Dados não aparecem após importação**

- Verifique se não houve erros (lista de erros no resultado)
- Atualize a página (F5)
- Verifique filtros ativos na tela

---

## 📞 Suporte

Para dúvidas ou problemas:

1. Verifique este guia primeiro
2. Consulte os logs do navegador (F12 → Console)
3. Tente com planilha menor para isolar o problema

---

**Versão:** 4df5075c  
**Data:** 04/02/2026  
**Status:** ✅ Produção
