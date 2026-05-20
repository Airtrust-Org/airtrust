/**
 * Script de monitoramento para entender o que acontece quando clica nos botões
 * Cole isso no console do DevTools (F12 > Console)
 */

// 1. Interceptar navigate do React Router
const originalNavigate = window.location;

// 2. Monitorar cliques globais
document.addEventListener(
  'click',
  (e) => {
    const button = e.target.closest('button');
    if (!button) return;

    const text = button.textContent.trim();
    console.log('🖱️ CLIQUE DETECTADO:', {
      texto: text,
      onClick: button.onclick ? '✅ HÁ onClick' : '❌ SEM onClick',
      dataAttributes: Array.from(button.attributes).map((a) => a.name + '=' + a.value),
    });
  },
  true,
);

// 3. Monitorar chamadas de navegação
const proxiedFetch = window.fetch;
window.fetch = function (...args) {
  console.log('📡 FETCH DETECTADA:', args[0]);
  return proxiedFetch.apply(this, args);
};

// 4. Monitorar history.push
const originalPush = window.history.pushState;
window.history.pushState = function (...args) {
  console.log('🔀 NAVIGATE DETECTADO:', args[2]);
  return originalPush.apply(this, args);
};

console.log('✅ Monitoramento ativado! Clique nos botões e veja os logs aqui.');
