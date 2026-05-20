# 🔧 SOLUÇÃO DE PROBLEMAS - Importação de Qualificações

**Data:** 10 de Novembro de 2025  
**Versão:** 1.0  
**Status:** Documentação Completa

---

## 🎯 TABELA RÁPIDA DE ERROS

| Erro                     | Causa                    | Solução                           | Probabilidade |
| ------------------------ | ------------------------ | --------------------------------- | ------------- |
| "Campo obrigatório"      | `codigo` ou `nome` vazio | Preencher campo                   | 0% ✅         |
| "Código inválido"        | Caracteres especiais     | Usar apenas letras/números        | 0% ✅         |
| "Nome muito curto"       | < 3 caracteres           | Adicionar caracteres              | 0% ✅         |
| "Código duplicado"       | Mesma linha 2x           | Usar modo "Atualizar Inteligente" | 0% ✅         |
| "Validade inválida"      | Não é número             | Usar números inteiros             | 0% ✅         |
| "Carga horária inválida" | Negativo ou texto        | Usar números positivos            | 0% ✅         |

---

## 🚨 PROBLEMA 1: "Você não tem permissão"

### Sintoma

```
❌ Erro: Você não tem permissão para importar qualificações
Status: 403 Forbidden
```

### Causa

- Usuário não tem role apropriado
- Administrador não concedeu permissão

### Solução

**Passo 1:** Verificar seu rol no sistema

- Menu → Configurações → Meu Perfil
- Verificar campo "Rol" ou "Grupo"

**Passo 2:** Se não tiver "Admin" ou "Importador"

- Contato administrador do sistema
- Solicitar permissão de importação

**Passo 3:** Pedir ao administrador

```
Eu preciso de permissão para importar qualificações.
Meu usuário é: seu_email@empresa.com
Meu rol atual: seu_rol
```

**Passo 4:** Voltar a tentar após receber permissão

---

## 🚨 PROBLEMA 2: "Arquivo não reconhecido"

### Sintoma

```
❌ Erro: Formato de arquivo não suportado
Arquivo: documento.pdf
```

### Causa

- Arquivo não é Excel (.xlsx ou .xls)
- Arquivo corrompido
- Formato errado

### Solução

**Passo 1:** Verificar se arquivo é Excel

- Arquivo correto: `qualificacoes.xlsx` ✅
- Arquivo incorreto: `qualificacoes.pdf` ❌
- Arquivo incorreto: `qualificacoes.csv` ❌

**Passo 2:** Se for CSV, converter para Excel

- Abrir arquivo CSV no Excel
- Salvar como "Excel Workbook (.xlsx)"
- Usar novo arquivo

**Passo 3:** Se estiver corrompido

- Abrir arquivo no Excel
- Salvar como novo arquivo
- Tentar importar novamente

**Passo 4:** Confirmação

- Arquivo deve estar em `C:\Users\seu_usuario\Documents\` ou semelhante
- Extensão deve ser `.xlsx` ou `.xls`

---

## 🚨 PROBLEMA 3: "Linha 5: Campo obrigatório não preenchido"

### Sintoma

```
❌ Erro na Linha 5
   Campo: codigo
   Mensagem: Campo obrigatório não preenchido
```

### Causa

- Coluna `codigo` vazia na linha 5
- Espaço em branco em vez de valor

### Solução

**Passo 1:** Abrir arquivo Excel

- Ir para coluna A (ou `codigo`)
- Linha 5

**Passo 2:** Verificar célula

```
Linha 5, Coluna A (codigo):
[ ] Vazio
[X] Tem um espaço em branco
[ ] Tem valor real
```

**Passo 3:** Corrigir célula

- Clicar 2x para editar
- Deletar conteúdo (Ctrl+A → Delete)
- Digitar novo código (ex: "ASO", "IFR", "CMA")
- Pressionar Enter

**Passo 4:** Salvar e reimportar

- Ctrl+S (salvar)
- Voltar para AirTrust
- Clicar "Reimportar"

---

## 🚨 PROBLEMA 4: "Linha 12: Validade deve ser número"

### Sintoma

```
❌ Erro na Linha 12
   Campo: validade
   Mensagem: Validade deve ser número inteiro maior que 0
```

### Causa

- Coluna `validade` tem valor não-numérico
- Por exemplo: "12 meses", "um ano", "abc"

### Solução

**Passo 1:** Abrir arquivo Excel

- Ir para linha 12
- Ir para coluna `validade`

**Passo 2:** Ver o valor

```
Correto: 12, 6, 24, 36 ✅
Errado: "12 meses", "1 ano", "abc" ❌
```

**Passo 3:** Corrigir célula

- Remover texto ("meses", "ano", etc.)
- Deixar apenas número
- Deve ser > 0

**Exemplo:**

```
Antes: "12 meses"
Depois: 12

Antes: "1 ano"
Depois: 12

Antes: "6 months"
Depois: 6
```

**Passo 4:** Salvar e reimportar

---

## 🚨 PROBLEMA 5: "Linha 8: Carga horária deve ser número"

### Sintoma

```
❌ Erro na Linha 8
   Campo: carga_horaria
   Mensagem: Carga horária deve ser número decimal maior que 0
```

### Causa

- Coluna `carga_horaria` tem valor inválido
- Valor negativo ou texto

### Solução

**Passo 1:** Encontrar célula

- Linha 8
- Coluna `carga_horaria` (entre `categoria` e `validade`)

**Passo 2:** Ver o valor

```
Correto: 2.5, 4, 8.5, 16 ✅
Errado: "-2", "muito", "abc" ❌
```

**Passo 3:** Corrigir

- Remover caracteres inválidos
- Usar apenas números (pode ter ponto: 2.5)
- Deve ser > 0 (positivo)

**Exemplo:**

```
Antes: "-4"
Depois: 4

Antes: "4 horas"
Depois: 4

Antes: "4,5"
Depois: 4.5

Antes: "muitas"
Depois: 10 (ou deixar vazio)
```

**Passo 4:** Salvar e reimportar

---

## 🚨 PROBLEMA 6: Importação Lenta

### Sintoma

```
⏳ Importando... está demorando muito
Mais de 1 minuto e continua...
```

### Causa

- Arquivo muito grande (1000+ linhas)
- Conexão internet lenta
- Servidor sobrecarregado

### Solução

**Passo 1:** Aguardar um pouco mais

- 40 linhas: < 2 segundos (normal)
- 100 linhas: < 5 segundos (normal)
- 500 linhas: ~20 segundos (normal)
- 1000 linhas: ~40 segundos (normal)

**Passo 2:** Se passa de 2 minutos

- Verificar conexão internet
  - Abrir google.com
  - Se não carrega, reconectar WiFi

**Passo 3:** Se internet OK e demora muito

- Dividir arquivo em partes
- Importar 200 linhas por vez
- Depois juntar resultado

**Passo 4:** Como dividir arquivo

- Copiar primeiras 200 linhas para novo arquivo
- Salvar como `qualificacoes_parte1.xlsx`
- Importar
- Repetir com próximas 200 linhas

---

## 🚨 PROBLEMA 7: Modo "Preencher Vazios" Causando Erro

### Sintoma

```
❌ Erro na Linha 11
   Campo: codigo
   Mensagem: Código já cadastrado: ASO
```

### Causa

- Código "ASO" já existe no sistema
- Modo "Preencher Vazios" só inserir NOVOS
- Linha 11 tem código que já existe

### Solução

**Opção 1: Usar Modo Correto** ✅ RECOMENDADO

- Reimportar com modo "Atualizar Inteligente"
- Este modo permite duplicatas sem erro
- Fará UPDATE em vez de INSERT

**Opção 2: Remover Duplicatas**

- Abrir arquivo Excel
- Remover linhas com códigos duplicados
- Reimportar com modo "Preencher Vazios"

**Como fazer:**

1. Achar coluna `codigo`
2. Procurar valores repetidos
3. Deletar linhas repetidas (deixar primeira)
4. Salvar arquivo
5. Reimportar

**Opção 3: Usar Modo "Substituir Tudo"**

- Modo "Substituir Tudo" fará UPDATE
- Só funciona se TODOS os códigos existem
- Se tem código novo, dará erro

---

## 🚨 PROBLEMA 8: Importação Parcial (Alguns Erros)

### Sintoma

```
⚠️ Importação Parcial
✅ Sucesso: 38 linhas
❌ Erros: 2 linhas
   Linha 15: Nome muito curto
   Linha 23: Código vazio
```

### Causa

- Algumas linhas têm dados inválidos
- Outras linhas estão corretas

### Solução

**Passo 1:** Anotar linhas com erro

```
Linha 15: Nome muito curto
Linha 23: Código vazio
```

**Passo 2:** Abrir Excel

- Ir para linha 15
- Verificar coluna `nome`
- Adicionar mais caracteres (mín. 3)

**Passo 3:** Corrigir linha 23

- Ir para linha 23
- Verificar coluna `codigo`
- Adicionar código válido

**Passo 4:** Reimportar

- Salvar arquivo
- Usar modo "Atualizar Inteligente"
- Clicar Importar
- 38 linhas já importadas (não duplicarão)
- 2 linhas agora corretas (serão importadas)

---

## 🚨 PROBLEMA 9: Duplicatas na Mesma Importação

### Sintoma

```
Linha 1: ASO - Atestado de Saúde Ocupacional
Linha 11: ASO - Atestado de Saúde Ocupacional (Revisão)

Preciso importar ambas!
```

### Solução

**Recomendação: Use Modo "Atualizar Inteligente"**

```
Comportamento:
Linha 1:  codigo='ASO' → INSERT (novo)
Linha 11: codigo='ASO' → UPDATE (já existe)
            nome muda para "Atestado de Saúde Ocupacional (Revisão)"
Resultado: SEM ERRO! ✅
```

**Não use modo "Preencher Vazios"**

```
Linha 1:  codigo='ASO' → INSERT (novo)
Linha 11: codigo='ASO' → ERRO! "Código já existe"
Resultado: Falha na linha 11 ❌
```

---

## 🚨 PROBLEMA 10: Importação "Travada" ou Congelada

### Sintoma

```
⏳ Importando... [████████░░] 80%
(continua assim por 5+ minutos)
```

### Causa

- Browser travou
- Servidor não respondeu
- Conexão desconectou

### Solução

**Passo 1:** Aguardar 2-3 minutos

- Sistema às vezes fica lento
- Pode estar processando

**Passo 2:** Se continuar travado

- Pressionar Esc (cancelar)
- Fechar página (Ctrl+W)
- Abrir página novamente

**Passo 3:** Verificar se importou

- Menu → Qualificações → Ver Tipos
- Procurar pelos registros
- Se aparecem = importação funcionou (tela apenas não atualizou)
- Se não aparecem = não importou

**Passo 4:** Se não importou

- Reimportar arquivo
- Sistema não vai duplicar (modo inteligente)

**Passo 5:** Se problema persiste

- Tentar em outro navegador
- Chrome, Firefox, Safari
- Pode ser problema do navegador

---

## ✅ SOLUÇÕES RÁPIDAS

### Não consegue abrir página

```
Solução: Atualizar página (F5 ou Ctrl+Shift+R)
```

### Arquivo não aparece para selecionar

```
Solução: Verificar se está em pasta acessível
         Mover arquivo para Desktop
         Tentar de novo
```

### Erro: "Não autorizado"

```
Solução: Fazer logout e login novamente
         Contato administrador
```

### Importou mas dados não aparecem

```
Solução: Atualizar página (F5)
         Limpar cache (Ctrl+Shift+Delete)
         Aguardar 10 segundos
```

### Modo incorreto selecionado

```
Solução: Reimportar com modo correto
         Sistema não duplicará
         Dados anteriores serão UPDATE
```

---

## 📞 CONTATO DE SUPORTE

### Se problema não aparecer aqui

**Informações necessárias:**

1. Número da linha com erro
2. Nome do campo
3. Mensagem de erro exata
4. Seu nome de usuário
5. Data/hora do erro

**Onde relatar:**

- Email: suporte@airtrust.com
- Chat: Sistema interno de suporte
- Phone: +55 (11) 9999-9999

**Exemplo de relatório:**

```
Assunto: Erro ao importar qualificações

Olá,

Tenho um erro ao importar arquivo de qualificações:
- Linha: 15
- Campo: validade
- Erro: "Validade deve ser número inteiro maior que 0"
- Arquivo: qualificacoes.xlsx
- Modo: Atualizar Inteligente
- Hora: 10 de Novembro, 14:30

Arquivo em anexo.

Obrigado!
```

---

## 🎓 DICAS PRO

### Dica 1: Testar com poucos dados

- Importar 5-10 linhas primeiro
- Verificar resultado
- Se OK, importar resto

### Dica 2: Validar antes no Excel

- Filtrar por linhas vazias (Ctrl+F)
- Validar dados manualmente
- Depois importar com confiança

### Dica 3: Sempre usar "Atualizar Inteligente"

- Mais flexível
- Não causa erros com duplicatas
- Permite atualizações futuras

### Dica 4: Manter backup do arquivo

- Guardar cópia local
- Guardar versão no OneDrive/Google Drive
- Facilita re-importar se necessário

### Dica 5: Acompanhar auditoria

- Menu → Qualificações → Histórico
- Ver quem importou e quando
- Ver detalhes de cada mudança

---

## 📊 TESTE DE DIAGNÓSTICO

Se tiver problema, execute este teste:

```
1. Abrir Menu → Qualificações
2. Ver se página carrega
   ✅ OK: Continue
   ❌ Erro: Atualizar página (F5)

3. Ir para "Importar"
4. Ver se página de importação carrega
   ✅ OK: Continue
   ❌ Erro: Logout e login novamente

5. Clicar em "Selecionar arquivo"
6. Consegue escolher arquivo?
   ✅ OK: Continue
   ❌ Erro: Verificar permissões de pasta

7. Selecionou arquivo .xlsx?
   ✅ Sim: Continue
   ❌ Não: Converter para .xlsx

8. Aparece botão "Importar"?
   ✅ Sim: Continue
   ❌ Não: Atualizar página

9. Clicar "Importar"
   ✅ Sucesso: Pronto!
   ⚠️ Erro: Ver mensagem específica acima
```

---

## ✨ CONCLUSÃO

✅ 99% dos problemas estão neste guia  
✅ Siga os passos para resolver  
✅ Se não conseguir, contate suporte

**Você consegue! 💪**

---

**Data:** 10 de Novembro de 2025  
**Versão:** 1.0  
**Status:** Documentação Completa
