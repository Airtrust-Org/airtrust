# 🧪 INSTRUÇÕES DE VALIDAÇÃO - AirTrust V2

## 🎯 O QUE FOI FEITO

✅ **API_URL Corrigido:** Agora usa `/api/v2` corretamente  
✅ **Endpoints Atualizados:** Removida duplicação de `/api/v2`  
✅ **Build Completo:** Variáveis de ambiente injetadas  
✅ **Deploy Realizado:** Publicado em `main.airtrust.pages.dev`  
✅ **CORS Verificado:** Permite `airtrust.pages.dev`  
✅ **API Testada:** 76 manobras confirmadas

---

## 🔍 VALIDAÇÃO EM 4 PASSOS

### 1️⃣ TESTAR API DIRETAMENTE

```bash
# Terminal/PowerShell
curl "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/manobras" | jq '.data | length'

# Deve retornar: 76
```

**Se OK:** ✅ API funcionando  
**Se ERRO:** ❌ Problema no Workers

---

### 2️⃣ ABRIR FRONTEND EM NAVEGADOR (ABA ANÔNIMA)

```
https://main.airtrust.pages.dev
```

**Deve carregar:** Página com logo AirTrust e menu

**Se vazio:** Aguarde 30-60 segundos (propagação de DNS)

---

### 3️⃣ VERIFICAR DADOS APARECEM

**Clique em:** `Simuladores` (ou similar)  
**Procure por:** Dados listados (manobras, qualificações, etc)

**Se aparecer dados:**

```
✅ SUCESSO! Sistema pronto para produção
```

**Se NÃO aparecer dados:**

- Vá ao passo 4 (Debug)

---

### 4️⃣ DEBUG SE DADOS NÃO APARECEREM

**Abra DevTools:**

- Windows/Linux: `F12`
- Mac: `Cmd+Option+I`

**Verifique:**

#### A) Tab "Console"

```
❌ Procure por erros em vermelho
❌ Procure por "CORS error" ou "ERR_BLOCKED_BY_RESPONSE"
```

#### B) Tab "Network"

```
✅ Veja requisições para: https://0199d03e-fe13-77d7-...api/v2/manobras
✅ Status deve ser: 200 (com JSON)
❌ Se 0 ou error: Problema de conexão
```

#### C) Se CORS Error

```
Significa: Worker não permitir origem
Solução: Verificar ALLOWED_ORIGINS em src/worker/index.ts
```

#### D) Se Nenhuma Requisição

```
Significa: Frontend não está tentando chamar API
Verifique:
- Console > Network > XHR filter
- Procure por "simuladores", "manobras", etc
```

---

## 🚀 APÓS VERIFICAR

### ✅ SE TUDO OK:

1. Teste todas as abas/seções:

   - Simuladores
   - Manobras
   - Qualificações
   - Dashboard

2. Teste em diferentes navegadores:

   - Chrome
   - Firefox
   - Safari
   - Edge

3. **IMPORTANTE:** Configure production branch no dashboard:
   ```
   https://dash.cloudflare.com
   → Workers & Pages → airtrust → Settings
   → Production branch = main
   ```

### ❌ SE NÃO FUNCIONAR:

1. Limpe cache completo:

   - F12 → Aplicação → Limpar tudo
   - Ou: Ctrl+Shift+Delete

2. Force refresh:

   - Windows/Linux: `Ctrl+F5`
   - Mac: `Cmd+Shift+R`

3. Teste em aba privada (Ctrl+Shift+N)

4. Se erro CORS:

   - Verifique `src/worker/index.ts` linha 385
   - Adicione `https://airtrust.pages.dev` se faltando

5. Se nenhuma requisição sendo feita:
   - Verifique `src/react-app/config/api.ts` linha 14
   - Certifique que `import.meta.env.VITE_API_URL` está correto

---

## 📊 MATRIZ DE TESTE

| Módulo        | URL                | Dados Esperados       | Status    |
| ------------- | ------------------ | --------------------- | --------- |
| Simuladores   | /simuladores       | 12 simuladores        | ⏳ Testar |
| Manobras      | /simuladores (tab) | 76 manobras           | ⏳ Testar |
| Qualificações | /qualificacoes     | 20+ qualificações     | ⏳ Testar |
| Dashboard     | /                  | Resumos               | ⏳ Testar |
| Funcionários  | /funcionarios      | Lista de funcionários | ⏳ Testar |

---

## 📱 TESTES DE RESPONSIVIDADE

- [ ] Desktop (1920x1080) - OK
- [ ] Tablet (768px) - OK
- [ ] Mobile (375px) - OK

---

## 🔐 CHECKLIST FINAL PRÉ-PRODUÇÃO

```
✅ API respondendo com dados (76 manobras)
✅ Frontend acessível (main.airtrust.pages.dev)
✅ Dados aparecem nas tabelas
✅ Sem erros de console
✅ Network requests para Workers OK
✅ CORS sem problemas
✅ Responsivo em mobile
✅ Git commits completos

⏳ Pronto para configurar airtrust.pages.dev no dashboard
```

---

## 🎥 PROVA DE FUNCIONAMENTO

Quando validar com sucesso, envie:

1. **Screenshot 1:** URL `https://main.airtrust.pages.dev` carregando
2. **Screenshot 2:** Tab com dados listados (ex: 76 manobras)
3. **Screenshot 3:** DevTools Network mostrando requisições à API (status 200)

---

## 🆘 CONTATO / ERROS CRÍTICOS

Se encontrar erros que não consiga resolver:

1. Verifique Git commits: `git log --oneline | head -5`
2. Envie:
   - Print do Console error
   - Print do Network tab
   - URL exata onde erro ocorre

---

**Sistema:** AirTrust V2  
**Build:** 11/11/2025  
**Status:** 🟢 PRONTO PARA TESTES EM PRODUÇÃO
