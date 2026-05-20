# 🧪 GUIA DE TESTE - MODAL DE AGENDAMENTO

## ✅ PRÉ-REQUISITOS

### Sistema Rodando:
- ✅ Frontend: http://localhost:3000 (RODANDO)
- ✅ Backend: http://localhost:8787 (RODANDO)
- ✅ API Funcionários: 20 itens disponíveis

---

## 📋 PASSO A PASSO DO TESTE

### **PASSO 1: Abrir Página de Simuladores**

1. Abrir navegador
2. Ir para: `http://localhost:3000/simuladores`
3. Aguardar página carregar

**Resultado Esperado:**
- ✅ Página carrega sem erros
- ✅ Lista de simuladores aparece
- ✅ Botão "Agendar Sessão" visível

---

### **PASSO 2: Abrir Console F12**

1. Pressionar `F12` (ou `Cmd+Option+I` no Mac)
2. Clicar na aba **Console**
3. Limpar console (ícone 🚫 ou `Ctrl+L`)

**Resultado Esperado:**
- ✅ Console aberto e limpo
- ✅ Pronto para ver logs

---

### **PASSO 3: Clicar "Agendar Sessão"**

1. Clicar no botão **"Agendar Sessão de Simulador"**
2. Modal deve abrir
3. **OBSERVAR O CONSOLE IMEDIATAMENTE**

**Resultado Esperado:**
- ✅ Modal abre
- ✅ Console mostra logs de carregamento

---

### **PASSO 4: Verificar Logs no Console**

**Logs Esperados (na ordem):**

```javascript
🔍 Funcionários carregados: {success: true, data: Array(20), total: 20}
✅ Total funcionários: 20
👨‍✈️ Instrutores: X Tripulantes: 20
```

**Detalhes dos Logs:**

1. **🔍 Funcionários carregados:**
   - Deve mostrar objeto com `success: true`
   - Deve ter array `data` com 20 itens
   - Deve ter `total: 20`

2. **✅ Total funcionários:**
   - Deve mostrar número `20`

3. **👨‍✈️ Instrutores:**
   - Deve mostrar quantidade de instrutores
   - Deve mostrar `Tripulantes: 20`

---

### **PASSO 5: Verificar Dropdowns**

**Dropdown "Tripulante" (Participante 1):**
- ✅ Deve ter opção "Selecione"
- ✅ Deve ter 20 funcionários listados
- ✅ Formato: "Nome - Matrícula (Função)"
- ✅ Exemplo: "Adriana Brasil - 00300 (SIC)"

**Dropdown "Tripulante" (Participante 2):**
- ✅ Mesmas validações acima

---

## ❌ PROBLEMAS POSSÍVEIS

### **Problema 1: Console vazio**
**Sintoma:** Nenhum log aparece

**Solução:**
1. Verificar se console está na aba correta
2. Verificar se filtros do console estão limpos
3. Recarregar página com `Ctrl+Shift+R`

---

### **Problema 2: Erro CORS**
**Sintoma:** Console mostra erro de CORS

**Logs de Erro:**
```
Access to fetch at 'http://localhost:8787/api/v2/funcionarios' 
from origin 'http://localhost:3000' has been blocked by CORS
```

**Solução:**
```bash
# Parar backend (Ctrl+C)
# Reiniciar backend
npm run dev:worker
```

---

### **Problema 3: Dropdown vazio**
**Sintoma:** Dropdown mostra apenas "Selecione"

**Verificar:**
1. Console tem logs de sucesso?
2. Network tab mostra status 200?
3. Response tem dados?

**Solução:**
```bash
# Testar API diretamente
curl http://localhost:8787/api/v2/funcionarios | jq
```

---

### **Problema 4: Erro 404**
**Sintoma:** Console mostra "404 Not Found"

**Logs de Erro:**
```
GET http://localhost:8787/api/v2/funcionarios 404 (Not Found)
```

**Solução:**
1. Verificar se backend está rodando:
   ```bash
   lsof -ti:8787
   ```
2. Se não estiver, iniciar:
   ```bash
   npm run dev:worker
   ```

---

## ✅ CHECKLIST DE VALIDAÇÃO

### Console F12:
- [ ] Log: 🔍 Funcionários carregados
- [ ] Log: ✅ Total funcionários: 20
- [ ] Log: 👨‍✈️ Instrutores: X Tripulantes: 20
- [ ] Zero erros vermelhos
- [ ] Zero warnings amarelos

### Network F12:
- [ ] Request: GET /api/v2/funcionarios
- [ ] Status: 200 OK
- [ ] Response: {success: true, data: [...]}
- [ ] Tempo: < 500ms

### Modal:
- [ ] Modal abre
- [ ] Dropdown "Tripulante" tem 20 opções
- [ ] Consegue selecionar funcionário
- [ ] Nome + matrícula + função aparecem
- [ ] Dropdown "Instrutor" funciona
- [ ] Dropdown "Simulador" funciona

---

## 📸 EVIDÊNCIAS PARA REPORTAR

Se encontrar problemas, tire prints de:

1. **Console F12** (com logs ou erros)
2. **Network F12** (aba Headers + Response)
3. **Modal** (mostrando dropdown)
4. **URL** (barra de endereço)

---

## 🎯 RESULTADO ESPERADO FINAL

**Console:**
```
🔍 Funcionários carregados: {success: true, data: Array(20), total: 20}
✅ Total funcionários: 20
👨‍✈️ Instrutores: 5 Tripulantes: 20
```

**Dropdown:**
```
[Select com 20 opções]
Adriana Brasil - 00300 (SIC)
Ana Carolina Moura - 00301 (PIC)
...
```

**Status:**
✅ TUDO FUNCIONANDO!

---

## 🚀 PRÓXIMO PASSO

Após validar que funciona:
1. Testar criar agendamento completo
2. Testar importação de qualificações
3. Executar bateria completa (Prompt 2)

---

**Última Atualização:** 23/10/2025 01:05  
**Status:** ✅ Sistema pronto para teste
