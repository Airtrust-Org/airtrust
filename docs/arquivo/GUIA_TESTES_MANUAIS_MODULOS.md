# 📋 GUIA DE TESTES MANUAIS - MÓDULOS APÓS AUDITORIA

## ✅ Objetivo

Testar TODOS os módulos após auditoria completa dos 38+ modais para garantir que **TODOS os campos salvam corretamente** e **nenhum dado é perdido**.

---

## 🧪 MÓDULO 1: FUNCIONÁRIOS (40 CAMPOS)

### Teste 1: Criar funcionário com TODOS os 40 campos

**URL**: https://airtrust.airtrust.workers.dev  
**Página**: Funcionários → Novo Funcionário

**Campos a preencher**:

#### Dados Básicos

- ✅ CPF: `111.222.333-44`
- ✅ Nome: `TESTE AUDITORIA COMPLETA`
- ✅ Matrícula: `AUD-001`
- ✅ Nome de Guerra: `AUDITADO`
- ✅ Data de Nascimento: `15/01/1990`
- ✅ Data de Admissão: `10/06/2020`

#### Cargo e Função

- ✅ Cargo: `Piloto`
- ✅ Função: `Comandante`
- ✅ Modelo de Aeronave: Selecionar qualquer

#### Contato

- ✅ Email: `teste@auditoria.com`
- ✅ Telefone: `(11) 98765-4321`
- ✅ Celular: `(11) 91234-5678`

#### Endereço

- ✅ CEP: `01310-100`
- ✅ Logradouro: `Av Paulista`
- ✅ Número: `1000`
- ✅ Complemento: `Andar 10`
- ✅ Bairro: `Bela Vista`
- ✅ Cidade: `São Paulo`
- ✅ Estado: `SP`
- ✅ País: `Brasil`

#### Documentos

- ✅ RG: `123456789`
- ✅ Órgão Emissor: `SSP-SP`
- ✅ Data de Emissão RG: `01/01/2010`
- ✅ Título de Eleitor: `123456789012`
- ✅ PIS: `12345678901`
- ✅ CTPS: `1234567`
- ✅ Série CTPS: `0001`
- ✅ UF CTPS: `SP`
- ✅ Data Emissão CTPS: `10/05/2015`

#### Pessoais

- ✅ Estado Civil: `Solteiro`
- ✅ Nacionalidade: `Brasileira`
- ✅ Nome do Pai: `Pai do Teste`
- ✅ Nome da Mãe: `Mãe do Teste`
- ✅ Escolaridade: `Superior Completo`

#### Observações

- ✅ Observações: `Funcionário criado para teste de auditoria completa dos modais`

#### Flags

- ✅ Instrutor: Marcar
- ✅ Checador: Desmarcar
- ✅ Status: `ATIVO`

**Ação**: Clicar em **Salvar**

**Resultado Esperado**:

- ✅ Mensagem de sucesso
- ✅ Funcionário aparece na listagem
- ✅ Ao abrir novamente, TODOS os 40 campos devem estar preenchidos

---

### Teste 2: Editar funcionário (testar .trim())

**Ação**: Editar o funcionário criado

**Campos com espaços para testar .trim()**:

- Nome: `  TESTE ATUALIZADO  ` (com espaços antes e depois)
- Guerra: `  TRIMMED  `
- Cargo: `  Copiloto  `
- Email: `  ATUALIZADO@TEST.COM  `
- Observações: `  Teste de trim funcionando  `

**Ação**: Salvar

**Resultado Esperado**:

- ✅ Salva com sucesso
- ✅ Ao reabrir o modal, os espaços devem ter sido removidos:
  - Nome: `TESTE ATUALIZADO` (SEM espaços)
  - Guerra: `TRIMMED`
  - Cargo: `Copiloto`

---

### Teste 3: Criar funcionário com campos mínimos

**Campos obrigatórios apenas**:

- CPF: `999.888.777-66`
- Nome: `TESTE MINIMO`
- Matrícula: `MIN-999`
- Nascimento: `20/03/1995`
- Admissão: `15/01/2022`

**Resultado Esperado**:

- ✅ Salva com sucesso mesmo sem campos opcionais

---

## 🧪 MÓDULO 2: LICENÇAS (6 CAMPOS)

**URL**: https://airtrust.airtrust.workers.dev  
**Página**: Funcionários → Selecionar funcionário → Aba Licenças

### Teste 1: Criar licença completa

**Campos**:

- ✅ Funcionário: Selecionar o criado no Teste 1
- ✅ Tipo: `PPH`
- ✅ Número: `TEST-LIC-001`
- ✅ Data de Emissão: `10/01/2020`
- ✅ Data de Vencimento: `10/01/2025`
- ✅ Observações: `Licença de teste completa`

**Resultado Esperado**:

- ✅ Salva com sucesso
- ✅ Todos os 6 campos aparecem corretos ao reabrir

### Teste 2: Editar licença (testar .trim())

**Campos com espaços**:

- Tipo: `  PPA  `
- Número: `  TRIMMED-001  `
- Observações: `  Teste trim  `

**Resultado Esperado**:

- ✅ Espaços removidos ao salvar

---

## 🧪 MÓDULO 3: CATEGORIAS (4 CAMPOS)

**URL**: https://airtrust.airtrust.workers.dev  
**Página**: Qualificações → Categorias → Nova Categoria

### Teste 1: Criar categoria completa

**Campos**:

- ✅ Nome: `Categoria Teste Auditoria`
- ✅ Código: `CAT-AUD-001`
- ✅ Descrição: `Categoria para testes de auditoria`
- ✅ Cor: `#3B82F6` (azul)
- ✅ Ativo: Marcar

**Resultado Esperado**:

- ✅ Todos os campos salvam corretamente

### Teste 2: Editar categoria (testar .trim())

**Campos com espaços**:

- Nome: `  Categoria Atualizada  `
- Código: `  CAT-TRIM-001  `
- Descrição: `  Teste trim  `

**Resultado Esperado**:

- ✅ Espaços removidos

---

## 🧪 MÓDULO 4: QUALIFICAÇÕES - TIPOS

**Página**: Qualificações → Tipos → Novo Tipo

### Teste 1: Criar tipo completo

**Campos**:

- ✅ Código: `QUAL-TEST-001`
- ✅ Nome: `Qualificação Teste Auditoria`
- ✅ Categoria: Selecionar categoria criada
- ✅ Validade (meses): `12`
- ✅ Carga Horária: `40`
- ✅ Vencimento Fim de Mês: Desmarcar
- ✅ Descrição: `Qualificação para testes`

**Resultado Esperado**:

- ✅ Todos os campos salvam

---

## 🧪 MÓDULO 5: QUALIFICAÇÕES - HISTÓRICO

**Página**: Qualificações → Histórico → Nova Qualificação

### Teste 1: Atribuir qualificação

**Campos**:

- ✅ Funcionário: Selecionar funcionário teste
- ✅ Qualificação: Selecionar tipo criado
- ✅ Data de Conclusão: `15/01/2024`
- ✅ Data de Vencimento: (calculada automaticamente)
- ✅ Resultado: `APROVADO`
- ✅ Observações: `Teste de histórico completo`
- ✅ Instrutor: Selecionar instrutor

**Resultado Esperado**:

- ✅ Salva com sucesso
- ✅ Data de vencimento calculada automaticamente
- ✅ Todos os campos aparecem ao reabrir

---

## 🧪 MÓDULO 6: TEMPLATES DE SESSÕES

**Página**: Simuladores → Templates → Novo Template

### Teste 1: Criar template

**Campos**:

- ✅ Nome: `Template Teste Auditoria`
- ✅ Duração (horas): `2`
- ✅ Tipo: `BASICO`
- ✅ Descrição: `Template para testes`
- ✅ Ativo: Marcar
- ✅ Manobras: Selecionar algumas

**Resultado Esperado**:

- ✅ Todos os 5 campos salvam

---

## 📊 CHECKLIST DE VALIDAÇÃO

### Para CADA módulo testado, verificar:

- [ ] ✅ **Criação**: Todos os campos salvam corretamente
- [ ] ✅ **Edição**: Campos atualizam corretamente
- [ ] ✅ **`.trim()`**: Espaços em branco são removidos
- [ ] ✅ **`Number()`**: IDs numéricos são salvos corretamente
- [ ] ✅ **Campos opcionais**: Aceitam `null` sem erro
- [ ] ✅ **Campos obrigatórios**: Validam corretamente
- [ ] ✅ **Busca**: Dados aparecem corretos ao reabrir modal

---

## 🎯 RESULTADO ESPERADO FINAL

Após executar TODOS os testes:

✅ **40 campos** do módulo Funcionários salvam corretamente  
✅ **6 campos** do módulo Licenças salvam corretamente  
✅ **4 campos** do módulo Categorias salvam corretamente  
✅ **Todos os campos** de Qualificações salvam corretamente  
✅ **Todos os campos** de Templates salvam corretamente

✅ **NENHUM DADO É PERDIDO** ao salvar formulários  
✅ **`.trim()` FUNCIONA** em todos os campos texto  
✅ **`Number()` FUNCIONA** em todos os campos numéricos

---

## 🚀 PRÓXIMOS PASSOS SE ALGUM TESTE FALHAR

1. Identificar qual campo não salvou
2. Verificar o modal correspondente
3. Verificar se tem `.trim()` ou `Number()` aplicado
4. Corrigir e testar novamente
5. Fazer commit da correção

---

**Data**: 28/11/2025  
**Auditoria**: Completa - 38+ modais auditados  
**Status**: ✅ Pronto para testes manuais
