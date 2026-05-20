import { API_BASE_URL } from '@/react-app/config/api';
import { SupportedLanguage } from './translations';

const CACHE_KEY = 'airtrust:i18n:runtime:en-cache';
const TRANSLATABLE_ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt'] as const;

const originalTextByNode = new WeakMap<Text, string>();
const originalAttrsByElement = new WeakMap<Element, Map<string, string>>();

let translationCache = new Map<string, string>();
let observer: MutationObserver | null = null;
let running = false;

const PT_HINTS_REGEX =
  /[ãõáàâéêíóôúç]|\b(não|para|com|sem|configurações|funcionários|qualificações|simuladores|sair|salvar|empresa|senha|usuário|carregando|erro|falha|sucesso)\b/i;
const WEEKDAY_ABBREVIATIONS_REGEX =
  /^(dom|seg|ter|qua|qui|sex|sáb|sab|sun|mon|tue|wed|thu|fri|sat)$/i;

function sanitizeCache(map: Map<string, string>) {
  const badPairs: Array<[string, string]> = [
    ['TER', 'TO HAVE'],
    ['Ter', 'To have'],
    ['ter', 'to have'],
    ['TO', 'TO THE'],
    ['To', 'To the'],
    ['to', 'to the'],
    ['TH', 'THE'],
    ['Th', 'The'],
    ['th', 'the'],
  ];

  for (const [key, value] of badPairs) {
    const current = map.get(key);
    if (current === value) {
      map.delete(key);
    }
  }
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string>;
    translationCache = new Map(Object.entries(parsed));
    sanitizeCache(translationCache);
  } catch {
    translationCache = new Map();
  }
}

function persistCache() {
  try {
    const entries = Object.fromEntries(translationCache.entries());
    localStorage.setItem(CACHE_KEY, JSON.stringify(entries));
  } catch {
    // ignore quota/private-mode errors
  }
}

function shouldSkipTextNode(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent) return true;
  if (
    parent.closest(
      'script, style, noscript, code, pre, textarea, [data-no-auto-i18n="true"], [contenteditable="true"], .material-symbols-outlined',
    )
  ) {
    return true;
  }

  const value = node.nodeValue || '';
  if (!value.trim()) return true;
  if (value.trim().length < 2) return true;

  return false;
}

function collectTextNodes(root: Node): Text[] {
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text && !shouldSkipTextNode(current)) {
      textNodes.push(current);
    }
    current = walker.nextNode();
  }

  return textNodes;
}

function getTrimmed(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function shouldTranslateText(text: string): boolean {
  const normalized = getTrimmed(text);
  if (!normalized) return false;

  if (WEEKDAY_ABBREVIATIONS_REGEX.test(normalized)) return false;

  // Evitar retraduzir textos já em inglês e siglas puras
  if (/^[A-Z0-9_\-\s]{2,}$/.test(normalized)) return false;
  if (/^[\w\s.,:;!?()[\]"'/%+-]+$/.test(normalized) && !PT_HINTS_REGEX.test(normalized)) {
    return false;
  }

  return PT_HINTS_REGEX.test(normalized);
}

async function translatePhraseToEnglish(text: string): Promise<string> {
  const normalized = getTrimmed(text);
  if (!normalized) return text;
  if (!shouldTranslateText(normalized)) return normalized;

  const cached = translationCache.get(normalized);
  if (cached) return cached;

  try {
    const response = await fetch(`${API_BASE_URL}/public/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ text: normalized, from: 'pt', to: 'en' }),
    });

    if (!response.ok) {
      translationCache.set(normalized, normalized);
      return normalized;
    }

    const json = (await response.json()) as {
      success?: boolean;
      data?: { translatedText?: string };
    };

    const translated = json?.data?.translatedText?.trim() || normalized;
    translationCache.set(normalized, translated);
    return translated;
  } catch {
    translationCache.set(normalized, normalized);
    return normalized;
  }
}

function applyTranslationWithSpacing(original: string, translatedTrimmed: string): string {
  const leading = original.match(/^\s*/)?.[0] || '';
  const trailing = original.match(/\s*$/)?.[0] || '';
  return `${leading}${translatedTrimmed}${trailing}`;
}

async function translateTextNodes(textNodes: Text[]) {
  const originals = new Set<string>();

  for (const node of textNodes) {
    const current = node.nodeValue || '';
    if (!originalTextByNode.has(node)) {
      originalTextByNode.set(node, current);
    }
    const original = originalTextByNode.get(node) || current;
    const normalized = getTrimmed(original);
    if (normalized) originals.add(normalized);
  }

  await Promise.all(
    Array.from(originals).map(async (phrase) => {
      await translatePhraseToEnglish(phrase);
    }),
  );

  for (const node of textNodes) {
    const original = originalTextByNode.get(node);
    if (!original) continue;

    const normalized = getTrimmed(original);
    const translated = translationCache.get(normalized) || normalized;
    node.nodeValue = applyTranslationWithSpacing(original, translated);
  }
}

async function translateAttributes(root: ParentNode) {
  const all = root.querySelectorAll('*');

  for (const el of all) {
    if (el.closest('[data-no-auto-i18n="true"]')) continue;

    let originalMap = originalAttrsByElement.get(el);
    if (!originalMap) {
      originalMap = new Map<string, string>();
      originalAttrsByElement.set(el, originalMap);
    }

    for (const attr of TRANSLATABLE_ATTRIBUTES) {
      const value = el.getAttribute(attr);
      if (!value || !value.trim()) continue;
      if (!shouldTranslateText(value)) continue;

      if (!originalMap.has(attr)) {
        originalMap.set(attr, value);
      }

      const original = originalMap.get(attr) || value;
      const translated = await translatePhraseToEnglish(original);
      el.setAttribute(attr, translated);
    }
  }
}

function restoreOriginalTexts(root: Node) {
  const textNodes = collectTextNodes(root);
  for (const node of textNodes) {
    const original = originalTextByNode.get(node);
    if (original !== undefined) {
      node.nodeValue = original;
    }
  }

  if (root instanceof Element || root instanceof Document || root instanceof DocumentFragment) {
    const all = root.querySelectorAll('*');
    for (const el of all) {
      const originalMap = originalAttrsByElement.get(el);
      if (!originalMap) continue;
      for (const [attr, original] of originalMap.entries()) {
        el.setAttribute(attr, original);
      }
    }
  }
}

async function translateCurrentDocument() {
  const textNodes = collectTextNodes(document.body);
  await translateTextNodes(textNodes);
  await translateAttributes(document.body);
  persistCache();
}

function stopObserverAndRestore() {
  observer?.disconnect();
  observer = null;
  running = false;
  restoreOriginalTexts(document.body);
}

function startObserver() {
  observer?.disconnect();
  observer = new MutationObserver(async (mutations) => {
    if (!running) return;

    const addedRoots: Node[] = [];
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement || node instanceof Text) {
            addedRoots.push(node);
          }
        });
      }

      if (mutation.type === 'characterData' && mutation.target instanceof Text) {
        const textNode = mutation.target;
        if (!originalTextByNode.has(textNode)) {
          originalTextByNode.set(textNode, textNode.nodeValue || '');
        }
      }
    }

    for (const root of addedRoots) {
      if (!running) return;

      if (root instanceof Text) {
        await translateTextNodes([root]);
      } else if (root instanceof HTMLElement) {
        await translateTextNodes(collectTextNodes(root));
        await translateAttributes(root);
      }
    }

    if (addedRoots.length > 0) {
      persistCache();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

export async function syncRuntimeTranslation(language: SupportedLanguage): Promise<() => void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => undefined;
  }

  if (language !== 'en-US') {
    stopObserverAndRestore();
    return () => undefined;
  }

  if (translationCache.size === 0) {
    loadCache();
  }

  running = true;
  await translateCurrentDocument();
  startObserver();

  return () => {
    if (language !== 'en-US') return;
    stopObserverAndRestore();
  };
}
