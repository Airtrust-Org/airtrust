# 📥 COMO IMPORTAR QUALIFICAÇÕES

## 🎯 O BOTÃO NÃO ESTÁ INATIVO!

O botão "Importar Qualificações" fica **desabilitado propositalmente** até que você selecione um arquivo Excel. Isso é uma **validação de segurança** para evitar importações vazias.

---

## ✅ PASSO A PASSO PARA IMPORTAR

### **1. Acessar a Tela de Importação**
```
1. Abra o sistema AirTrust
2. Vá em "Qualificações" no menu lateral
3. Clique na aba "Dashboard"
4. Clique no botão verde "Importar Qualificações"
```

### **2. Baixar o Template (Opcional)**
```
1. Na seção de importação que apareceu
2. Clique em "Baixar Template"
3. Um arquivo Excel será baixado: template_qualificacoes_airtrust.xlsx
```

### **3. Preencher o Excel**

**Colunas Obrigatórias:**
```excel
| cpf             | tipo        | codigo    | data_validade |
|-----------------|-------------|-----------|---------------|
| 123.456.789-00  | TREINAMENTO | CRM-2025  | 2026-01-20    |
| 123.456.789-00  | CHECK       | PC-A320   | 2025-08-01    |
| 987.654.321-00  | EXAME       | ASO-2025  | 2026-03-10    |
```

**Colunas Opcionais:**
- categoria
- descricao
- instituicao
- instrutor
- carga_horaria
- numero
- data_emissao
- data_conclusao
- observacoes

### **4. Selecionar o Arquivo**
```
1. Clique na área de upload (ou arraste o arquivo)
2. Selecione seu arquivo Excel (.xlsx ou .xls)
3. ✅ O nome do arquivo aparecerá na tela
4. ✅ Um preview das primeiras 5 linhas será exibido
```

### **5. Importar** ✅
```
1. Após selecionar o arquivo, o botão "Importar Qualificações" ficará VERDE e ATIVO
2. Clique no botão
3. Aguarde o processamento
4. ✅ Resultado será exibido (sucesso/erros)
```

---

## 🔴 POR QUE O BOTÃO ESTÁ DESABILITADO?

### **Motivo 1: Nenhum Arquivo Selecionado** ❌
```
Status do Botão: CINZA (desabilitado)
Solução: Selecione um arquivo Excel
```

### **Motivo 2: Importação em Andamento** ⏳
```
Status do Botão: CINZA (desabilitado)
Texto: "Importando..."
Solução: Aguarde a conclusão
```

### **Motivo 3: Arquivo Selecionado** ✅
```
Status do Botão: VERDE (ativo)
Texto: "Importar Qualificações"
Ação: Clique para importar!
```

---

## 🎨 ESTADOS DO BOTÃO

### **Estado 1: Desabilitado (Sem Arquivo)**
```css
Cor: Cinza (#9CA3AF)
Cursor: not-allowed
Texto: "Importar Qualificações"
Ação: Nenhuma (botão inativo)
```

### **Estado 2: Ativo (Com Arquivo)**
```css
Cor: Verde (#16A34A)
Cursor: pointer
Texto: "Importar Qualificações"
Ação: Clique para importar
```

### **Estado 3: Carregando**
```css
Cor: Cinza (#9CA3AF)
Cursor: not-allowed
Texto: "Importando..."
Ícone: Spinner animado
```

---

## 📋 CHECKLIST DE IMPORTAÇÃO

### **Antes de Importar:**
- [ ] Funcionários cadastrados no sistema (com CPF)
- [ ] Excel preenchido corretamente
- [ ] Colunas obrigatórias presentes (cpf, tipo, codigo, data_validade)
- [ ] CPFs válidos e existentes no banco
- [ ] Datas no formato correto (YYYY-MM-DD ou DD/MM/YYYY)

### **Durante a Importação:**
- [ ] Arquivo selecionado ✅
- [ ] Preview verificado ✅
- [ ] Botão ficou VERDE ✅
- [ ] Cliquei no botão ✅

### **Após Importação:**
- [ ] Verificar resultado (sucesso/erros)
- [ ] Conferir qualificações importadas
- [ ] Corrigir erros se houver
- [ ] Reimportar linhas com erro (se necessário)

---

## 🐛 SOLUÇÃO DE PROBLEMAS

### **Problema 1: Botão continua cinza após selecionar arquivo**
```
Causa: Arquivo não foi carregado corretamente
Solução:
1. Recarregue a página (F5)
2. Tente selecionar o arquivo novamente
3. Verifique se o arquivo é .xlsx ou .xls
4. Verifique se o arquivo não está corrompido
```

### **Problema 2: Preview não aparece**
```
Causa: Erro ao ler o arquivo Excel
Solução:
1. Verifique se o arquivo está no formato correto
2. Abra o arquivo no Excel e salve novamente
3. Tente com um arquivo menor (teste com 3 linhas)
```

### **Problema 3: Erro ao importar**
```
Causa: CPF não encontrado ou dados inválidos
Solução:
1. Verifique os erros exibidos na tela
2. Corrija o Excel conforme os erros
3. Reimporte apenas as linhas com erro
```

---

## 💡 DICAS

### **Dica 1: Teste com Poucos Registros**
```
Primeiro teste: 3-5 linhas
Se funcionar: Importe todos os registros
```

### **Dica 2: Use o Template**
```
Sempre baixe o template atualizado
Copie e cole seus dados no template
Não mude os nomes das colunas
```

### **Dica 3: Valide os CPFs**
```
Certifique-se que os CPFs existem no sistema
Vá em Funcionários → Buscar por CPF
Se não existir, cadastre primeiro
```

### **Dica 4: Use Códigos Padronizados**
```
Exemplos:
- Treinamentos: CRM-2025, DG-2025, SEG-2025
- Checks: PC-A320, OPC-B737, LPC-E190
- Exames: ASO-2025, CMA-2025, PSICO-2025
```

---

## 📊 EXEMPLO COMPLETO

### **Arquivo Excel:**
```excel
| cpf             | tipo        | codigo      | categoria  | descricao                    | instituicao | instrutor     | carga_horaria | data_validade |
|-----------------|-------------|-------------|------------|------------------------------|-------------|---------------|---------------|---------------|
| 123.456.789-00  | TREINAMENTO | CRM-2025    | CRM        | Crew Resource Management     | ANAC        | João Silva    | 40            | 2026-01-20    |
| 123.456.789-00  | CHECK       | PC-A320     | SIMULADOR  | Proficiency Check A320       | AirTrust    | Maria Santos  | 4             | 2025-08-01    |
| 987.654.321-00  | EXAME       | ASO-2025    | ASO        | Atestado Saúde Ocupacional   | Clínica     | Dr. Pedro     | 0             | 2026-03-10    |
```

### **Resultado Esperado:**
```
✅ 3 de 3 registros importados com sucesso!

Detalhes:
- 1 TREINAMENTO
- 1 CHECK
- 1 EXAME
- 2 funcionários atualizados
```

---

## ✅ RESUMO

**O botão NÃO está com problema!**

Ele funciona assim:
1. **CINZA** = Aguardando arquivo
2. **VERDE** = Pronto para importar
3. **CINZA + Spinner** = Importando

**Para ativar o botão:**
1. Clique em "Importar Qualificações" (botão verde no Dashboard)
2. Selecione um arquivo Excel
3. ✅ Botão ficará VERDE
4. Clique para importar!

---

## 🎯 CÓDIGO DO BOTÃO

```typescript
<button
  onClick={handleImport}
  disabled={!file || loading}  // Desabilitado se não tem arquivo OU está carregando
  className={`w-full py-3 rounded-lg text-white font-semibold flex items-center justify-center gap-2 ${
    loading || !file
      ? 'bg-gray-400 cursor-not-allowed'  // CINZA se desabilitado
      : 'bg-green-600 hover:bg-green-700'  // VERDE se ativo
  }`}
>
  {loading ? (
    <>
      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
      Importando...
    </>
  ) : (
    <>
      <Upload className="w-5 h-5" />
      Importar Qualificações
    </>
  )}
</button>
```

**Lógica:**
- `disabled={!file || loading}` → Desabilita se não tem arquivo OU está carregando
- `!file` → Sem arquivo = CINZA
- `file` → Com arquivo = VERDE ✅

---

**Status:** ✅ **BOTÃO FUNCIONANDO CORRETAMENTE**  
**Comportamento:** Desabilitado até selecionar arquivo (por design)  
**Solução:** Selecione um arquivo Excel para ativar o botão
