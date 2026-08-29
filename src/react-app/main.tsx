import { createRoot } from 'react-dom/client';
import App from '@/react-app/App';
import { ErrorBoundary } from '@/react-app/components/common/ErrorBoundary';
// Enable Tailwind + Design System styles across the app
import '@/react-app/index.css';
import '@/react-app/styles/native-theme-controls.css';
// Material Symbols font — local bundle (removes CDN dependency)
import 'material-symbols/outlined.css';
// Service Worker descomissionado: mantemos apenas limpeza de runtime legado
import { registerServiceWorker } from '@/lib/sw-manager';
import { installGlobalApiFetch } from '@/react-app/lib/apiFetch';
import { installTableWheelScrollLock } from '@/react-app/lib/tableWheelScrollLock';
import { installChunkErrorListeners } from '@/react-app/utils/lazyWithRetry';
import GlobalConfirmDialogHost from '@/react-app/components/modals/GlobalConfirmDialogHost';
import GlobalAlertDialogHost from '@/react-app/components/modals/GlobalAlertDialogHost';
import { initializeThemePreference } from '@/react-app/theme/theme';

initializeThemePreference();

function safeSessionGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // ignore storage errors (privacy mode / blocked storage)
  }
}

function safeSessionRemove(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore storage errors (privacy mode / blocked storage)
  }
}

installChunkErrorListeners();
installGlobalApiFetch();

// ✅ Em produção, o app apenas remove service workers antigos e caches legados.
if (import.meta.env.PROD) {
  console.log('[SW] Executando limpeza de service worker legado (PRODUÇÃO)');
  registerServiceWorker().catch((error) => {
    console.warn('[SW] Falha na limpeza de runtime legado:', error);
  });
} else {
  console.log('[DEV] Service Worker DESABILITADO em desenvolvimento');
  // ✅ Limpar SW antigo se existir + recarregar para garantir cache limpo
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      if (registrations.length > 0) {
        console.warn('[DEV] Removendo Service Workers antigos...');
        Promise.all(registrations.map((r) => r.unregister())).then(() => {
          // Recarrega UMA vez para garantir que o SW não intercepte mais requests
          if (!safeSessionGet('__sw_cleared')) {
            safeSessionSet('__sw_cleared', '1');
            window.location.reload();
          }
        });
      } else {
        safeSessionRemove('__sw_cleared');
      }
    });
  }
}

// ✅ Scroll: quando o mouse estiver sobre uma tabela rolável, a rolagem fica presa na tabela
// e não propaga para a página.
if (typeof window !== 'undefined') {
  installTableWheelScrollLock();
}

// 🔒 BLOCKER: Disable DevTools hotkeys (F12, Ctrl+Shift+I/J, Cmd+Option+I/J)
// This prevents accidental keybindings from opening DevTools
if (typeof window !== 'undefined' && import.meta.env.MODE === 'development') {
  // Block F12 (keyCode 123)
  const blockDevtoolsKeys = (e: KeyboardEvent) => {
    // F12
    if (e.keyCode === 123) {
      e.preventDefault();
      return false;
    }
    // Ctrl+Shift+I (Windows/Linux inspect element)
    if (e.ctrlKey && e.shiftKey && e.keyCode === 73) {
      e.preventDefault();
      return false;
    }
    // Ctrl+Shift+J (Windows console)
    if (e.ctrlKey && e.shiftKey && e.keyCode === 74) {
      e.preventDefault();
      return false;
    }
    // Cmd+Option+I (macOS inspect)
    if ((e.metaKey || e.ctrlKey) && e.altKey && e.keyCode === 73) {
      e.preventDefault();
      return false;
    }
    // Cmd+Option+J (macOS console)
    if ((e.metaKey || e.ctrlKey) && e.altKey && e.keyCode === 74) {
      e.preventDefault();
      return false;
    }
    // Cmd+Option+U (macOS view source - alternative)
    if ((e.metaKey || e.ctrlKey) && e.altKey && e.keyCode === 85) {
      e.preventDefault();
      return false;
    }
  };

  window.addEventListener('keydown', blockDevtoolsKeys, true);
  console.log('🔒 [DEV] DevTools hotkey blocker activated');
}

// StrictMode removido — causa double-invoke de effects que quebra dedup guards em dev
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <>
      <App />
      <GlobalConfirmDialogHost />
      <GlobalAlertDialogHost />
    </>
  </ErrorBoundary>,
);
