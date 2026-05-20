# 📥 Guia de Importação: Tipos de Qualificações

## 🎯 Resumo Rápido

Para importar tipos de qualificações via Excel/CSV:

1. Abra o sistema AirTrust
2. Vá em **Qualificações** → **Dashboard**
3. Clique em **Importar Tipos de Qualificação**
4. Selecione um arquivo .xlsx, .xls ou .csv
5. Revise os dados e clique em **Confirmar Importação**

---

## 📋 Formato do Arquivo

### Colunas Obrigatórias

| Coluna        | Tipo  | Exemplo        | Descrição                              |
| ------------- | ----- | -------------- | -------------------------------------- |
| **nome**      | texto | "CMA Classe 1" | Nome da qualificação (2+ caracteres)   |
| **codigo**    | texto | "CMA1"         | Código único                           |
| **categoria** | texto | "CMA"          | Categoria (CMA, ICAO, ASO, CHECK, etc) |

### Colunas Opcionais

| Coluna         | Tipo    | Exemplo                       | Padrão          |
| -------------- | ------- | ----------------------------- | --------------- |
| descricao      | texto   | "Certificado Médico Classe 1" | (vazio)         |
| validade_meses | número  | 12                            | (vazio)         |
| obrigatoria    | sim/não | 1                             | 1 (obrigatória) |

---

## ✅ Exemplos Corretos

### Excel (.xlsx)

```
nome                           | codigo    | categoria | descricao                          | validade_meses | obrigatoria
CMA Classe 1                   | CMA1      | CMA       | Certificado Médico Aeronáutico    | 12             | 1
CMA Classe 2                   | CMA2      | CMA       | Certificado Médico Classe 2       | 12             | 1
ICAO Nível 3                   | ICAO3     | ICAO      | Proficiência em Idioma            | 36             | 1
ASO 2024                       | ASO2024   | ASO       | Avaliação de Saúde Ocupacional    | 12             | 1
CHECK-IN A320                  | CHECK-A   | CHECK     | Check da Aeronave A320            |                | 0
```

### CSV (.csv)

```csv
nome,codigo,categoria,descricao,validade_meses,obrigatoria
CMA Classe 1,CMA1,CMA,Certificado Médico Aeronáutico,12,1
CMA Classe 2,CMA2,CMA,Certificado Médico Classe 2,12,1
ICAO Nível 3,ICAO3,ICAO,Proficiência em Idioma,36,1
ASO 2024,ASO2024,ASO,Avaliação de Saúde Ocupacional,12,1
CHECK-IN A320,CHECK-A,CHECK,Check da Aeronave A320,,0
```

---

## ❌ Erros Comuns e Como Corrigi-los

### ❌ Erro: "Nome obrigatório"

**Problema:** O campo `nome` está vazio ou tem menos de 2 caracteres.
**Solução:** Preencha o nome com pelo menos 2 caracteres.

```
ERRADO: | (vazio)
CERTO:  | CMA Classe 1
```

### ❌ Erro: "Código obrigatório"

**Problema:** O campo `codigo` está vazio.
**Solução:** Adicione um código único para cada tipo.

```
ERRADO: codigo | (vazio)
CERTO:  codigo | CMA1
```

### ❌ Erro: "Categoria obrigatória"

**Problema:** O campo `categoria` está vazio.
**Solução:** Preencha a categoria (CMA, ICAO, ASO, CHECK, etc).

```
ERRADO: categoria | (vazio)
CERTO:  categoria | CMA
```

### ❌ Erro: "Encontradas X duplicatas"

**Problema:** Já existe um tipo com o mesmo `codigo` no banco.
**Solução:** Use um código único ou escolha "Atualizar Inteligente" para mesclar dados.

```
ERRADO: código duplicado CMA1 em 2 linhas
CERTO:  use CMA1, CMA2, CMA3, etc (todos únicos)
```

---

## 🔄 Modos de Importação

Após selecionar o arquivo, você escolhe como deseja importar:

### 1️⃣ **Preencher Vazios** (Completar)

- ✅ Adiciona dados apenas em campos vazios
- ✅ Preserva dados existentes
- ⚠️ Não atualiza campos preenchidos

### 2️⃣ **Atualizar Inteligente** (Recomendado)

- ✅ Compara dados automaticamente
- ✅ Atualiza se a nova informação é mais completa
- ✅ Ideal para atualizações periódicas

### 3️⃣ **Substituir Tudo** (Sobrescrever)

- ⚠️ Substitui completamente os registros
- ⚠️ Use com cuidado (pode perder dados)

---

## 💡 Dicas

1. **Baixe o template** - Clique no botão "Baixar Template" para obter um arquivo com a estrutura correta

2. **Valide antes de importar** - O sistema mostra um preview com:

   - ✅ Quantos registros serão criados
   - ⚠️ Quantos serão atualizados
   - ❌ Erros de validação

3. **Código único** - O campo `codigo` é a chave única, então não pode repetir

4. **Valores opcionais** - Deixe em branco se não quiser preencher:

   - descricao
   - validade_meses
   - obrigatoria (padrão: 1 = obrigatória)

5. **Booleanos** - Para `obrigatoria`, aceita:
   - `1`, `true`, `True`, `TRUE`, `sim`, `s`, `yes`
   - `0`, `false`, `False`, `FALSE`, `nao`, `não`, `n`, `no`

---

## 📊 Exemplo Completo

### Cenário

Você tem 3 novos tipos de qualificação para adicionar e quer atualizar a descrição de um existente.

### Arquivo Excel

```
nome              | codigo  | categoria | descricao              | validade_meses | obrigatoria
CMA Classe 1      | CMA1    | CMA       | Cert. Médico Aeron.   | 12             | 1
Inglês Técnico    | ENG-TEC | ICAO      | Proficiência em Idiom | 36             | 1
PSI Avaliação     | PSI     | PSI       | Avaliação Psicológica | 24             | 1
```

### Resultado

- ✅ 3 novos tipos criados
- ✅ Códigos únicos: CMA1, ENG-TEC, PSI
- ✅ Categorias definidas: CMA, ICAO, PSI
- ✅ Validades configuradas

---

## 🆘 Suporte

Se encontrar erros:

1. **Verifique o formato** - Use CSV ou XLSX, nunca PDF ou imagens
2. **Verifique os dados** - Nomes, códigos e categorias preenchidos
3. **Baixe um novo template** - Garanta que os cabeçalhos estão corretos
4. **Verifique duplicatas** - Códigos devem ser únicos

Para mais ajuda, consulte a documentação ou contate o administrador.
