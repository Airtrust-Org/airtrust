# 🧪 INSTRUÇÕES PARA TESTAR OS MODAIS

## Status Atual

✅ Código corrigido e commitado (6373047b)
✅ Build completo realizado (2.31s)
✅ Cache limpo
✅ Servidor dev rodando em http://localhost:3000

## PROBLEMA: Cache do Navegador

O código está **CORRETO**, mas o navegador pode estar usando uma versão antiga em cache.

---

## 📋 TESTE MANUAL (Recomendado)

### 1. Abra o navegador com CACHE DESABILITADO

**Chrome/Edge:**

```
Cmd+Shift+I (DevTools) → Network tab → ✓ "Disable cache"
```

**Firefox:**

```
Cmd+Shift+E (Network) → ⚙️ → ✓ "Disable Cache"
```

### 2. Navegue para:

```
http://localhost:3000/simuladores
```

### 3. Clique na tab "Fichas de Sessão"

### 4. Clique em um botão "Avaliar"

- ✅ **CORRETO**: Modal de avaliação abre (fundo escuro, lista de manobras)
- ❌ **ERRADO**: Navega para /simuladores/fichas/XX

### 5. Feche o modal e clique em "Assinar (Instrutor)"

- ✅ **CORRETO**: Modal de assinatura abre (canvas, campo de nome)
- ❌ **ERRADO**: Navega para /simuladores/fichas/XX

---

## 🤖 TESTE AUTOMATIZADO

### Opção A: Console do Navegador

1. Abra http://localhost:3000/simuladores
2. Pressione F12 (DevTools)
3. Vá para a tab "Console"
4. Cole o conteúdo do arquivo `test-modals-console.js`
5. Pressione Enter
6. O teste executará automaticamente e mostrará o resultado

### Opção B: Ver o código-fonte carregado

1. Abra http://localhost:3000/simuladores
2. F12 → Sources → src/react-app/pages/simuladores/fichas/index.tsx
3. Procure pelos botões (linhas ~308-336)
4. Verifique se tem:
   ```tsx
   onClick={() => handleAvaliar(ficha.id)}  // ✅ CORRETO
   ```
   **NÃO**:
   ```tsx
   onClick={() => navigate(`/simuladores/fichas/${ficha.id}`)}  // ❌ ERRADO
   ```

---

## 🔧 Se continuar navegando (Cache persistente):

### Hard Refresh (Força o cache a recarregar):

```
Cmd+Shift+R (Mac)
Ctrl+Shift+R (Windows/Linux)
```

### Limpar Cache Completo:

```
Chrome: Cmd+Shift+Delete → "Cached images and files"
Firefox: Cmd+Shift+Delete → "Cache"
```

### Modo Anônimo (sem cache):

```
Cmd+Shift+N (Chrome)
Cmd+Shift+P (Firefox)
```

---

## 📊 Logs Esperados no Console

### Se estiver CORRETO:

```
[API Config] API_BASE_URL: https://airtrust-api-production...
[DEPLOY_MARKER] Build timestamp 2025-12-03T22:22:XX
[Auth] Token presente: true
```

### Se estiver ERRADO (cache):

```
[DEPLOY_MARKER] Build timestamp 2025-12-03T22:18:XX  // ← timestamp antigo!
```

O timestamp deve ser **22:22 ou mais recente**.

---

## 🐛 Debug: Verificar código carregado

### Via Network:

1. F12 → Network → Ctrl+R (recarregar)
2. Procure por `index-XXXXX.js` (arquivo da página fichas)
3. Clique → Response
4. Procure por `handleAvaliar` ou `handleAssinar`
5. Deve ter:
   ```javascript
   onClick: () => handleAvaliar(ficha.id); // ✅
   ```

---

## 💡 Próximos Passos

**Se os modais ABRIREM corretamente:**
→ Fazer commit, push e deploy

**Se os modais NÃO ABRIREM:**
→ Compartilhe:

1. Screenshot do console (F12 → Console)
2. Screenshot do erro (se houver)
3. URL que aparece na barra do navegador ao clicar no botão

---

## 📝 Arquivos Importantes

- **Código corrigido**: `src/react-app/pages/simuladores/fichas/index.tsx`
- **Teste console**: `test-modals-console.js`
- **Commit atual**: `6373047b`
- **Build timestamp**: `2025-12-03T22:22:24`

---

## ✅ Confirmação Visual

**MODAL DE AVALIAÇÃO** deve mostrar:

- Título: "Avaliar Ficha"
- Lista de ~22 manobras
- Botões de nota: 0, 1, 2, 3
- Campo "Observações Gerais"

**MODAL DE ASSINATURA** deve mostrar:

- Título: "Assinatura Digital"
- Canvas branco (para desenhar)
- Campo "Digite seu nome completo"
- Checkbox de confirmação
- Botão "Confirmar Assinatura"
