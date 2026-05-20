# 🔍 TESTE DE MONITORAMENTO - Modal de Avaliação

## Instruções para Debug

### 1️⃣ ABRA A PÁGINA E O DEVTOOLS

- Acesse: `http://localhost:3000/simuladores/fichas/20`
- Pressione `F12` para abrir DevTools
- Clique em `Console`

### 2️⃣ EXECUTE ESTE SCRIPT NO CONSOLE

Cole exatamente isto e pressione ENTER:

```javascript
// Criar um objeto global para monitorar o estado
window.testData = {
  clicks: 0,
  handlers: [],
};

// Interceptar o botão de Avaliar
const avaliarBtn = document.querySelector('button:has-text("Avaliar")');
console.log('🔎 Botão Avaliar encontrado:', avaliarBtn ? '✅ SIM' : '❌ NÃO');

if (avaliarBtn) {
  const originalClick = avaliarBtn.onclick;
  console.log('📋 onClick original:', originalClick);

  avaliarBtn.addEventListener(
    'click',
    (e) => {
      window.testData.clicks++;
      console.log('🖱️ CLIQUE #' + window.testData.clicks, {
        timestamp: new Date().toISOString(),
        preventDefault: e.preventDefault,
        stopPropagation: e.stopPropagation,
        defaultPrevented: e.defaultPrevented,
        button: e.button,
      });
    },
    true,
  );

  console.log('✅ Monitoramento de cliques ativado para botão Avaliar');
}

// Monitorar todas as chamadas fetch
const originalFetch = window.fetch;
window.fetch = function (url, ...args) {
  if (url.includes('fichas')) {
    console.log('📡 FETCH:', {
      url: url,
      timestamp: new Date().toISOString(),
      stack: new Error().stack.split('\n')[2],
    });
  }
  return originalFetch.apply(this, arguments);
};

console.log('✅ Script de monitoramento ativado');
console.log('Agora clique no botão Avaliar e veja os logs aqui');
```

### 3️⃣ CLIQUE NO BOTÃO "Avaliar"

Você deve VER nos logs:

- ✅ Se vir `🖱️ CLIQUE #1` = o clique foi detectado
- ✅ Se vir `📡 FETCH` com a URL `/fichas` = o handler foi executado
- ❌ Se vir navegação imediata = há um problema

### 4️⃣ REPORTE PARA MIM

Copie e cole toda a saída do console aqui para que eu veja exatamente o que está acontecendo.

---

## CENÁRIOS ESPERADOS

### ✅ CORRETO (o que DEVERIA acontecer)

```
🔎 Botão Avaliar encontrado: ✅ SIM
🖱️ CLIQUE #1 ...
📡 FETCH: {url: '...fichas/20'...}
[Modal deve aparecer na tela sobrepondo tudo]
```

### ❌ ERRADO (o que está acontecendo agora?)

```
🔎 Botão Avaliar encontrado: ✅ SIM
🖱️ CLIQUE #1 ...
[Página inteira recarrega / navega para outra URL]
```

---

## DICA EXTRA

Se precisar, também pode ir em **Sources** > procurar por `handleAvaliar` para ver se a função existe no código compilado.
