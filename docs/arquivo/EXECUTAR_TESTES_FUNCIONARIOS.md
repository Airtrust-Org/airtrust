# 🧪 EXECUTAR TESTES - MÓDULO FUNCIONÁRIOS

## 🎯 Objetivo

Testar os **40 campos** do módulo Funcionários após auditoria completa para garantir que **TODOS os dados salvam corretamente**.

---

## ✅ PRÉ-REQUISITOS

1. Acesse: https://airtrust.airtrust.workers.dev
2. Faça login no sistema
3. Vá para: **Funcionários** → **Novo Funcionário**

---

## 📋 TESTE 1: CRIAR FUNCIONÁRIO COMPLETO (40 CAMPOS)

### ✅ Dados Básicos

```
CPF: 111.222.333-44
Nome: TESTE AUDITORIA MODAIS 40 CAMPOS
Matrícula: TEST-40-001
Nome de Guerra: AUDITADO
Data de Nascimento: 15/01/1990
Data de Admissão: 10/06/2020
```

### ✅ Cargo e Função

```
Cargo: Piloto Comercial
Função: Comandante
Modelo de Aeronave: [Selecionar qualquer]
```

### ✅ Contato (3 campos)

```
Email: teste.auditoria@airtrust.com.br
Telefone: (11) 98765-4321
Celular: (11) 91234-5678
```

### ✅ Endereço Completo (8 campos)

```
CEP: 01310-100
Logradouro: Av Paulista
Número: 1000
Complemento: Conjunto 101
Bairro: Bela Vista
Cidade: São Paulo
Estado: SP
País: Brasil
```

### ✅ Documentos (9 campos)

```
RG: 12.345.678-9
Órgão Emissor: SSP-SP
Data de Emissão RG: 01/01/2010
Título de Eleitor: 1234 5678 9012
PIS/PASEP: 123.45678.90-1
CTPS: 1234567
Série CTPS: 0001
UF CTPS: SP
Data de Emissão CTPS: 10/05/2015
```

### ✅ Dados Pessoais (5 campos)

```
Estado Civil: Solteiro(a)
Nacionalidade: Brasileira
Nome do Pai: José da Silva Teste
Nome da Mãe: Maria da Silva Teste
Escolaridade: Superior Completo
```

### ✅ Observações

```
Funcionário criado para teste completo após auditoria dos 38+ modais.
Todos os 40 campos devem salvar corretamente sem perda de dados.
```

### ✅ Flags e Status (3 campos)

```
☑️ É Instrutor
☐ É Checador
Status: ATIVO
```

### 🔘 AÇÃO: Clicar em **SALVAR**

---

## ✅ VERIFICAÇÃO DO TESTE 1

Após salvar:

1. ✅ Mensagem de sucesso aparece
2. ✅ Funcionário aparece na listagem
3. ✅ Clique no funcionário para **editar**
4. ✅ **VERIFICAR**: Todos os 40 campos devem estar preenchidos exatamente como inseridos
5. ✅ **VERIFICAR**: Nenhum campo deve estar vazio
6. ✅ **VERIFICAR**: Nenhum campo deve ter espaços extras

**Resultado Esperado**: ✅ TODOS os 40 campos salvaram corretamente

---

## 📋 TESTE 2: EDITAR FUNCIONÁRIO (TESTAR .trim())

### Objetivo

Verificar se os espaços em branco são removidos automaticamente (função `.trim()`)

### ✅ Abra o funcionário criado para edição

### ✅ Altere os seguintes campos COM ESPAÇOS:

```
Nome:        "   TESTE ATUALIZADO COM ESPAÇOS   "
              ^^^                            ^^^
             (3 espaços antes e depois)

Guerra:      "   TRIMMED   "

Cargo:       "   Copiloto   "

Email:       "   atualizado@test.com   "

Observações: "   Teste de validação do trim funcionando   "
```

### 🔘 AÇÃO: Clicar em **SALVAR**

---

## ✅ VERIFICAÇÃO DO TESTE 2

1. ✅ Salva sem erro
2. ✅ **REABRIR** o funcionário para edição
3. ✅ **VERIFICAR**: Os espaços devem ter sido **REMOVIDOS**

**Campos devem aparecer SEM espaços**:

```
Nome: "TESTE ATUALIZADO COM ESPAÇOS"  (SEM espaços nas pontas)
Guerra: "TRIMMED"
Cargo: "Copiloto"
Email: "atualizado@test.com"
```

**Resultado Esperado**: ✅ `.trim()` funcionou - espaços removidos

---

## 📋 TESTE 3: CAMPOS MÍNIMOS (OPCIONAIS NULL)

### Objetivo

Verificar se campos opcionais podem ficar vazios (aceitar `null`)

### ✅ Criar novo funcionário com APENAS campos obrigatórios:

```
CPF: 999.888.777-66
Nome: TESTE MINIMO CAMPOS OBRIGATORIOS
Matrícula: MIN-999
Data de Nascimento: 20/03/1995
Data de Admissão: 15/01/2022
```

**Deixar TODOS os outros campos vazios**

### 🔘 AÇÃO: Clicar em **SALVAR**

---

## ✅ VERIFICAÇÃO DO TESTE 3

1. ✅ Salva sem erro
2. ✅ Funcionário aparece na listagem
3. ✅ Campos opcionais aparecem como vazios/null

**Resultado Esperado**: ✅ Sistema aceita campos opcionais vazios

---

## 📋 TESTE 4: CAMPOS NUMÉRICOS

### Objetivo

Verificar se IDs e números são salvos corretamente (função `Number()`)

### ✅ Editar funcionário e verificar:

```
Modelo de Aeronave: [Selecionar] → Verificar se ID salva
Is Instrutor: 1 ou 0 (não texto)
Is Checador: 1 ou 0 (não texto)
```

### 🔘 AÇÃO: Salvar e verificar no banco/API

---

## 📊 CHECKLIST FINAL - MÓDULO FUNCIONÁRIOS

Marque cada item após testar:

- [ ] ✅ **TESTE 1**: 40 campos salvam corretamente
- [ ] ✅ **TESTE 2**: `.trim()` remove espaços
- [ ] ✅ **TESTE 3**: Campos opcionais aceitam null
- [ ] ✅ **TESTE 4**: Campos numéricos salvam como Number
- [ ] ✅ CPF é sanitizado (apenas números)
- [ ] ✅ CEP é sanitizado (apenas números)
- [ ] ✅ Email é convertido para minúsculas
- [ ] ✅ Booleanos salvam como 1/0
- [ ] ✅ Nenhum dado é perdido ao salvar
- [ ] ✅ Nenhum campo obrigatório permite vazio

---

## 🎯 RESULTADO ESPERADO FINAL

✅ **TODOS os 40 campos** salvam corretamente  
✅ **`.trim()`** funciona em todos os campos texto  
✅ **`Number()`** funciona em todos os campos numéricos  
✅ **Campos opcionais** aceitam `null`  
✅ **Nenhum dado** é perdido

---

## 🚨 SE ALGUM TESTE FALHAR

1. **Anote** qual campo não salvou
2. **Verifique** o modal: `/src/react-app/pages/funcionarios/ModalFuncionario.tsx`
3. **Procure** o campo no objeto `dadosParaBackend` (linha ~488)
4. **Verifique** se tem `.trim()` ou `Number()`
5. **Corrija** e teste novamente

---

## 📝 REGISTRAR RESULTADO

Após completar os testes, preencha:

```
Data: ___/___/2025
Testador: _________________

Resultado Teste 1 (40 campos): [ ] PASSOU  [ ] FALHOU
Resultado Teste 2 (.trim()):   [ ] PASSOU  [ ] FALHOU
Resultado Teste 3 (null):      [ ] PASSOU  [ ] FALHOU
Resultado Teste 4 (Number):    [ ] PASSOU  [ ] FALHOU

Observações:
_________________________________________________
_________________________________________________
```

---

**Script criado após**: Auditoria completa de 38+ modais  
**Data**: 28/11/2025  
**Status**: ✅ Pronto para execução
