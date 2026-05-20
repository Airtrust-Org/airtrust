# 🎯 SOLUÇÃO: IMPORTAÇÃO DE QUALIFICAÇÕES

**Data:** 21/10/2025 22:40  
**Problema:** Importação não dá erro mas também não importa (0/651 registros)

---

## 🚨 PROBLEMA IDENTIFICADO

### CPFs Não Correspondem!

**Banco de Produção tem:**
```
João Silva      - CPF: 12345678901
Maria Santos    - CPF: 12345678902
Pedro Oliveira  - CPF: 12345678903
Ana Costa       - CPF: 12345678904
Carlos Ferreira - CPF: 12345678905

Total: 5 funcionários (dados de teste)
```

**Sua Planilha tem:**
```
CPF: 134.651.428-37
CPF: 145.762.539-48
CPF: 156.873.640-59
... (651 registros)

Total: 651 qualificações
```

**Resultado:** Nenhum CPF da planilha corresponde aos CPFs do banco!

---

## ✅ SOLUÇÃO

### Opção 1: Importar Funcionários Primeiro (RECOMENDADO)

#### Passo 1: Preparar Planilha de Funcionários

Crie arquivo: `funcionarios.xlsx`

| cpf | nome | matricula | email | cargo |
|-----|------|-----------|-------|-------|
| 134.651.428-37 | Nome do Funcionário 1 | MAT001 | func1@empresa.com | Piloto |
| 145.762.539-48 | Nome do Funcionário 2 | MAT002 | func2@empresa.com | Comissário |
| ... | ... | ... | ... | ... |

**Importante:**
- Use os MESMOS CPFs da planilha de qualificações
- Preencha nome, matrícula, email e cargo
- Formato: Excel (.xlsx) ou CSV

#### Passo 2: Importar Funcionários

1. Acesse: `/funcionarios`
2. Clique: "Importar" (botão verde)
3. Selecione: `funcionarios.xlsx`
4. Aguarde: Importação concluir
5. Verifique: Quantos foram importados

#### Passo 3: Importar Qualificações

Agora sim, importe as qualificações:

1. Acesse: `/qualificacoes`
2. Clique: "Importar"
3. Selecione: sua planilha de qualificações
4. Aguarde: Importação concluir
5. Sucesso! ✅

---

### Opção 2: Usar Funcionários de Teste (RÁPIDO)

Se você só quer testar, pode criar qualificações para os 5 funcionários existentes:

Crie arquivo: `qualificacoes_teste.xlsx`

| cpf | tipo | codigo | descricao | data_validade |
|-----|------|--------|-----------|---------------|
| 12345678901 | TREINAMENTO | B | Conhecimentos Gerais | 04/01/2026 |
| 12345678902 | CHECK | C | Check Anual | 15/02/2026 |
| 12345678903 | EXAME | E | Exame Médico | 20/03/2026 |
| 12345678904 | TREINAMENTO | T | Treinamento Técnico | 10/04/2026 |
| 12345678905 | CHECK | A | Check de Proficiência | 25/05/2026 |

Importe e veja funcionar!

---

### Opção 3: Limpar Banco e Recomeçar (AVANÇADO)

Se os 5 funcionários atuais são apenas dados de teste:

```bash
# Limpar funcionários de teste
npx wrangler d1 execute airtrust-db --remote --command="
DELETE FROM funcionarios WHERE id IN (1,2,3,4,5);
"

# Verificar
npx wrangler d1 execute airtrust-db --remote --command="
SELECT COUNT(*) FROM funcionarios;
"
# Deve retornar: 0

# Agora importar seus funcionários reais
# Depois importar qualificações
```

---

## 🔍 COMO VERIFICAR

### Ver Logs Detalhados

1. Abra DevTools (F12)
2. Aba Console
3. Tente importar
4. Veja mensagens:

```
[IMPORT] Buscando funcionário - CPF original: "134.651.428-37"
[IMPORT] Funcionário NÃO encontrado para CPF: 134.651.428-37
```

### Verificar Funcionários Cadastrados

```bash
npx wrangler d1 execute airtrust-db --remote --command="
SELECT id, nome, cpf, matricula 
FROM funcionarios 
WHERE deleted_at IS NULL;
"
```

### Verificar Qualificações Importadas

```bash
npx wrangler d1 execute airtrust-db --remote --command="
SELECT COUNT(*) as total FROM qualificacoes;
"
```

---

## 📋 CHECKLIST

### Antes de Importar Qualificações

- [ ] Funcionários estão cadastrados?
  ```bash
  npx wrangler d1 execute airtrust-db --remote --command="
  SELECT COUNT(*) FROM funcionarios WHERE deleted_at IS NULL;
  "
  ```

- [ ] CPFs correspondem?
  ```bash
  # Verificar se CPF específico existe
  npx wrangler d1 execute airtrust-db --remote --command="
  SELECT * FROM funcionarios 
  WHERE cpf LIKE '%134.651.428-37%' OR cpf LIKE '%13465142837%';
  "
  ```

- [ ] Planilha está correta?
  - Colunas: cpf, tipo, codigo, descricao, data_validade
  - Tipo: TREINAMENTO, CHECK ou EXAME
  - Data: DD/MM/YYYY ou número serial

### Após Importar

- [ ] Ver resultado no console
- [ ] Verificar quantos foram importados
- [ ] Ver erros (se houver)
- [ ] Confirmar no banco

---

## 🎯 RECOMENDAÇÃO FINAL

**FAÇA NESTA ORDEM:**

```
1. ✅ Preparar planilha de funcionários
   └─ Com os CPFs da planilha de qualificações

2. ✅ Importar funcionários
   └─ Via interface: /funcionarios → Importar

3. ✅ Verificar importação
   └─ Ver quantos foram importados

4. ✅ Importar qualificações
   └─ Agora vai funcionar!

5. ✅ Verificar resultado
   └─ Ver quantas foram importadas
```

---

## 💡 DICA PRO

### Extrair CPFs da Planilha de Qualificações

Se você tem a planilha de qualificações mas não tem os dados completos dos funcionários:

```python
# Script Python para extrair CPFs únicos
import pandas as pd

# Ler planilha de qualificações
df = pd.read_excel('qualificacoes.xlsx')

# Extrair CPFs únicos
cpfs_unicos = df['cpf'].unique()

# Criar planilha de funcionários
funcionarios = pd.DataFrame({
    'cpf': cpfs_unicos,
    'nome': ['Funcionário ' + str(i) for i in range(len(cpfs_unicos))],
    'matricula': ['MAT' + str(i).zfill(4) for i in range(len(cpfs_unicos))],
    'email': ['func' + str(i) + '@empresa.com' for i in range(len(cpfs_unicos))],
    'cargo': ['A definir'] * len(cpfs_unicos)
})

# Salvar
funcionarios.to_excel('funcionarios_para_importar.xlsx', index=False)
print(f'Criado arquivo com {len(cpfs_unicos)} funcionários')
```

Depois você pode editar o arquivo e preencher os dados corretos.

---

## 📊 RESUMO

```
╔══════════════════════════════════════════════════╗
║                                                  ║
║   POR QUE NÃO IMPORTOU?                         ║
║                                                  ║
║   ❌ Problema:                                  ║
║   CPFs da planilha não existem no banco         ║
║                                                  ║
║   ✅ Solução:                                   ║
║   Importar funcionários primeiro                ║
║                                                  ║
║   🎯 Ordem:                                     ║
║   1. Funcionários                               ║
║   2. Qualificações                              ║
║                                                  ║
╚══════════════════════════════════════════════════╝
```

---

**Criado em:** 21/10/2025 22:40  
**Problema:** CPFs não correspondem  
**Solução:** Importar funcionários primeiro  
**Status:** ✅ Pronto para importar

🎯 **IMPORTE OS FUNCIONÁRIOS PRIMEIRO E DEPOIS AS QUALIFICAÇÕES!**
