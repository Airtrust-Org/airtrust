# 📱 GUIA PASSO-A-PASSO - Importar Qualificações

## ✅ Status do Sistema

- ✅ Backend: Deployed e funcionando
- ✅ Endpoint: `/api/qualificacoes/importar-json` ativo
- ✅ Frontend: Interface de importação disponível
- ✅ Banco: Tabela `qualificacoes_tipos` pronta

---

## 🚀 PASSO 1: Acessar o Sistema

### Pela web:

```
URL: https://seu-airtrust.app
Login: suas credenciais
```

### Pela tela do computador:

1. Abrir navegador (Chrome, Firefox, Safari)
2. Digitar URL do AirTrust
3. Fazer login

---

## 📋 PASSO 2: Ir para Importar Qualificações

**Opção A - Via Menu:**

```
Menu (☰)
  ↓
Qualificações
  ↓
Importar Tipos
```

**Opção B - Via Busca:**

```
Ctrl+K (ou Cmd+K no Mac)
Digitar: "importar qualificacoes"
Pressionar Enter
```

---

## 📁 PASSO 3: Selecionar Arquivo Excel

### A tela mostra:

```
┌─────────────────────────────────┐
│ Importar Qualificações          │
├─────────────────────────────────┤
│                                 │
│  [Selecionar arquivo Excel]     │
│  ou arrastar arquivo aqui       │
│                                 │
├─────────────────────────────────┤
│  ☐ Arquivo não selecionado     │
└─────────────────────────────────┘
```

### Ações:

1. Clicar no botão "Selecionar arquivo Excel"
2. Navegar para sua planilha
3. Selecionar arquivo `.xlsx` ou `.xls`
4. Clicar "Abrir"

---

## ⚙️ PASSO 4: Selecionar Modo de Importação

Após selecionar arquivo, aparece:

```
┌─────────────────────────────────┐
│ Modo de Importação              │
├─────────────────────────────────┤
│                                 │
│ ◉ Atualizar Inteligente         │
│   (Recomendado - INSERT + UPDATE) │
│                                 │
│ ◯ Preencher Vazios              │
│   (Só INSERT - ignora existentes)  │
│                                 │
│ ◯ Substituir Tudo               │
│   (Só UPDATE - erro se não existe) │
│                                 │
└─────────────────────────────────┘
```

### Recomendação:

**Deixar "Atualizar Inteligente" selecionado** ✅

Por que:

- ✅ Cria novos registros
- ✅ Atualiza registros existentes
- ✅ Sem erros com duplicatas
- ✅ Mais flexível e seguro

---

## 🔄 PASSO 5: Visualizar Prévia dos Dados

O sistema mostra:

```
┌─────────────────────────────────┐
│ Prévia dos Dados                │
├─────────────────────────────────┤
│                                 │
│ Linhas encontradas: 40          │
│                                 │
│ Primeiras 5 linhas:             │
│ • ASO - Atestado de Saúde...    │
│ • B - Conhecimentos Gerais...   │
│ • C - Emergências Gerais        │
│ • IFR - CHT IFR                 │
│ • TIPO - CHT TIPO               │
│                                 │
│ ... e mais 35 linhas            │
│                                 │
└─────────────────────────────────┘
```

**Verificar:**

- ✅ Número de linhas correto?
- ✅ Nomes dos campos aparecem?
- ✅ Dados parecem corretos?

Se sim → Continue ✅

---

## ▶️ PASSO 6: Clicar em "Importar"

```
┌─────────────────────────────────┐
│ Importar Qualificações          │
├─────────────────────────────────┤
│                                 │
│ Status: Pronto para importar    │
│ Linhas: 40                      │
│ Modo: Atualizar Inteligente     │
│                                 │
│         [🚀 Importar]           │
│                                 │
└─────────────────────────────────┘
```

Clicar no botão "Importar" e aguardar...

---

## ⏳ PASSO 7: Acompanhar Progresso

Aparece barra de progresso:

```
Importando... 25/40 ████████░░ 62%
```

**Tempo esperado:** 2-5 segundos

---

## ✅ PASSO 8: Resultado Final

### Se sucesso:

```
┌─────────────────────────────────┐
│ ✅ Importação Concluída!        │
├─────────────────────────────────┤
│                                 │
│ Total processado: 40 linhas     │
│ ✅ Sucesso: 40 linhas           │
│                                 │
│ 📊 Resumo:                      │
│ • Inseridos: 25 registros       │
│ • Atualizados: 15 registros     │
│ • Ignorados: 0                  │
│ • Erros: 0                      │
│                                 │
│           [✓ Concluído]         │
│                                 │
└─────────────────────────────────┘
```

**Significado:**

- ✅ Todos os 40 registros foram válidos
- ✅ 25 são registros novos
- ✅ 15 foram atualizações de registros existentes
- ✅ Nenhum erro!

### Se houver erro:

```
┌─────────────────────────────────┐
│ ⚠️ Erro na Importação           │
├─────────────────────────────────┤
│                                 │
│ Total processado: 40            │
│ ✅ Sucesso: 38                  │
│ ❌ Erros: 2                     │
│                                 │
│ Erros encontrados:              │
│ • Linha 5: Nome muito curto     │
│ • Linha 12: Código vazio        │
│                                 │
│ 💡 Corrija as linhas acima      │
│    e reimporte.                 │
│                                 │
│         [← Voltar]              │
│                                 │
└─────────────────────────────────┘
```

**Se vir isso:**

1. Anotar as linhas com erro
2. Abrir arquivo Excel
3. Corrigir os dados
4. Salvar arquivo
5. Reimportar

---

## 🎯 CONFIRMAÇÃO DE SUCESSO

Após a importação bem-sucedida, você pode:

### 1. Verificar no Menu de Qualificações

```
Menu → Qualificações → Ver Tipos
```

Você verá todos os seus registros listados:

- ASO - Atestado de Saúde Ocupacional
- B - Conhecimentos Gerais de Aeronave
- C - Emergências Gerais
- IFR - CHT IFR
- TIPO - CHT TIPO
- ... (e mais)

### 2. Testar Associação em Funcionário

```
Menu → Funcionários → Selecionar Funcionário
Aba "Qualificações" → Adicionar
```

Você verá todos os tipos importados na lista!

### 3. Verificar Dados no Relatório

```
Menu → Relatórios → Qualificações por Tipo
```

Verá contagem e histórico de cada tipo.

---

## ❓ PERGUNTAS FREQUENTES

### P1: E se eu errar na importação?

**R:** Sem problema! Você pode:

- Reimportar a mesma planilha (será UPDATE)
- Editar registros individuais manualmente
- Soft-delete e reimportar (restaura)

### P2: E se houver duplicate na planilha?

**R:** Modo `Atualizar Inteligente` trata:

- 1ª ocorrência: INSERT ou UPDATE
- 2ª ocorrência: UPDATE (sem erro)
- Sem problema!

### P3: Pode importar novamente?

**R:** Sim! Modo `Atualizar Inteligente`:

- 1ª importação: INSERT novos
- 2ª importação: UPDATE todos (sem erro)
- 3ª importação: UPDATE todos (sem erro)
- Sem risco de duplicar!

### P4: Quanto tempo demora?

**R:** Muito rápido:

- 40 linhas: < 2 segundos
- 100 linhas: < 5 segundos
- 1000 linhas: ~20 segundos

### P5: Precisa fazer backup?

**R:** Sistema faz automaticamente:

- Backup D1 automático
- Histórico de todas as mudanças
- Pode fazer rollback se precisar

---

## 🔗 LINKS ÚTEIS

- **Documentação:** `/docs/importacao`
- **Suporte:** suporte@airtrust.com
- **Bug Report:** github.com/airtrust/issues

---

## ✨ PRÓXIMOS PASSOS

Após importar com sucesso:

1. ✅ Qualificações importadas
2. → Associar qualificações a funcionários
3. → Configurar validade de cada qualificação
4. → Gerar relatórios de qualificações
5. → Acompanhamento automático de validades

---

**Guia Criado:** 10 de Novembro de 2025  
**Versão:** 1.0  
**Status:** ✅ Atualizado e Testado
