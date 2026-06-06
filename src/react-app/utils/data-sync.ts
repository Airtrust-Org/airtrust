// A5: sinal leve de "dados mudaram" entre páginas/abas, sem polling agressivo.
// Mutações (treinamentos, escala, etc.) chamam notifyDataChanged(); páginas que não
// usam React Query (ex.: Visão Mensal Integrada via useApi) assinam onDataChanged()
// para revalidar. Usa BroadcastChannel (entre abas) + CustomEvent (mesma aba).

export type DataChangeScope =
  | 'treinamentos'
  | 'escala'
  | 'qualificacoes'
  | 'simuladores'
  | 'all';

const EVENT_NAME = 'airtrust:data-changed';
const CHANNEL_NAME = 'airtrust-data-sync';

type Detail = { scope: DataChangeScope; at: number };

let channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!channel) {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      channel = null;
    }
  }
  return channel;
}

export function notifyDataChanged(scope: DataChangeScope = 'all'): void {
  if (typeof window === 'undefined') return;
  const detail: Detail = { scope, at: Date.now() };
  try {
    window.dispatchEvent(new CustomEvent<Detail>(EVENT_NAME, { detail }));
  } catch {
    /* no-op */
  }
  const ch = getChannel();
  if (ch) {
    try {
      ch.postMessage(detail);
    } catch {
      /* no-op */
    }
  }
}

/**
 * Assina mudanças de dados. Retorna função de cleanup.
 * `scopes` filtra quais escopos disparam o callback ('all' sempre dispara).
 */
export function onDataChanged(
  callback: (scope: DataChangeScope) => void,
  scopes: DataChangeScope[] = ['all'],
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const matches = (scope: DataChangeScope) =>
    scope === 'all' || scopes.includes('all') || scopes.includes(scope);

  const onLocal = (event: Event) => {
    const detail = (event as CustomEvent<Detail>).detail;
    if (detail && matches(detail.scope)) callback(detail.scope);
  };
  window.addEventListener(EVENT_NAME, onLocal as EventListener);

  const ch = getChannel();
  const onMessage = (event: MessageEvent<Detail>) => {
    if (event.data && matches(event.data.scope)) callback(event.data.scope);
  };
  ch?.addEventListener('message', onMessage as EventListener);

  return () => {
    window.removeEventListener(EVENT_NAME, onLocal as EventListener);
    ch?.removeEventListener('message', onMessage as EventListener);
  };
}
