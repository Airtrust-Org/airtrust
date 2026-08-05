const TOKEN_KEY = 'airtrust_token';
const DATA_SCOPE_CHANNEL = 'airtrust:data-scope';
const DATA_SCOPE_STORAGE_KEY = 'airtrust:data-scope-reset';
const TOKEN_CHANGED_EVENT = 'airtrust:token-changed';

export type TenantDataResetReason = 'tenant-switch' | 'logout' | 'cross-tab' | 'manual';

export interface TenantDataScope {
  epoch: number;
  tenantId: number | null;
  signal: AbortSignal;
}

type CacheResetter = () => void;

const resetters = new Map<string, CacheResetter>();
let epoch = 0;
let requestController = new AbortController();
let activeTenantId: number | null = null;
let initialized = false;
let channel: BroadcastChannel | null = null;
let lastRemoteNonce: string | null = null;

function safeStorageToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(TOKEN_KEY) || window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function clearStoredToken(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage may be unavailable, but the in-memory tenant still resets below.
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function tenantIdFromToken(token: string | null | undefined): number | null {
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  const rawTenantId = payload?.empresa_id ?? payload?.empresaId;
  const parsed = Number(rawTenantId);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function getCurrentTenantId(): number | null {
  return tenantIdFromToken(safeStorageToken()) ?? activeTenantId;
}

function runResetters(): void {
  for (const [name, reset] of resetters) {
    try {
      reset();
    } catch (error) {
      console.warn(`[DataLayer] Falha ao limpar cache ${name}:`, error);
    }
  }
}

function applyReset(tenantId: number | null, reason: TenantDataResetReason): void {
  epoch += 1;
  activeTenantId = tenantId;
  requestController.abort(new DOMException(`Tenant data scope reset: ${reason}`, 'AbortError'));
  requestController = new AbortController();
  runResetters();
}

function broadcastReset(tenantId: number | null, reason: TenantDataResetReason): void {
  const payload = { tenantId, reason, nonce: `${Date.now()}:${Math.random()}` };
  channel?.postMessage(payload);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(DATA_SCOPE_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // BroadcastChannel remains the preferred path; storage can be blocked.
    }
  }
}

function initializeCrossTabReset(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  activeTenantId = tenantIdFromToken(safeStorageToken());

  const applyRemoteReset = (payload: { nonce?: string }): void => {
    if (payload.nonce && payload.nonce === lastRemoteNonce) return;
    lastRemoteNonce = payload.nonce ?? null;
    // A remote tab only invalidates this tab's data. It must never select the
    // other tab's tenant, because sessionStorage and active-company choices
    // are tab-local by design.
    applyReset(getCurrentTenantId(), 'cross-tab');
  };

  if (typeof window.BroadcastChannel === 'function') {
    channel = new window.BroadcastChannel(DATA_SCOPE_CHANNEL);
    channel.addEventListener('message', (event) => applyRemoteReset(event.data || {}));
  }

  window.addEventListener('storage', (event) => {
    if (event.key !== DATA_SCOPE_STORAGE_KEY || !event.newValue) return;
    try {
      applyRemoteReset(JSON.parse(event.newValue) as { nonce?: string });
    } catch {
      applyRemoteReset({});
    }
  });

  // Logout already emits this canonical event through clearTokens().
  window.addEventListener(TOKEN_CHANGED_EVENT, (event) => {
    const detail = (event as CustomEvent<{ token?: string | null }>).detail;
    if (detail?.token === null) {
      clearStoredToken();
      applyReset(null, 'logout');
      broadcastReset(null, 'logout');
    }
  });
}

initializeCrossTabReset();

export function registerTenantCacheReset(name: string, reset: CacheResetter): () => void {
  resetters.set(name, reset);
  return () => {
    if (resetters.get(name) === reset) resetters.delete(name);
  };
}

export function resetTenantDataLayer(options: {
  tenantId?: number | null;
  reason: TenantDataResetReason;
  broadcast?: boolean;
}): void {
  initializeCrossTabReset();
  const tenantId = options.tenantId === undefined ? getCurrentTenantId() : options.tenantId;
  applyReset(tenantId, options.reason);
  if (options.broadcast !== false) broadcastReset(tenantId, options.reason);
}

export function captureTenantDataScope(): TenantDataScope {
  initializeCrossTabReset();
  return {
    epoch,
    tenantId: getCurrentTenantId(),
    signal: requestController.signal,
  };
}

export class StaleTenantResponseError extends Error {
  constructor() {
    super('Resposta descartada porque a empresa ativa mudou durante a requisição.');
    this.name = 'StaleTenantResponseError';
  }
}

export function assertTenantDataScope(scope: Pick<TenantDataScope, 'epoch' | 'tenantId'>): void {
  if (scope.epoch !== epoch || scope.tenantId !== getCurrentTenantId()) {
    throw new StaleTenantResponseError();
  }
}

export function combineWithTenantAbortSignal(signal?: AbortSignal | null): AbortSignal {
  const tenantSignal = captureTenantDataScope().signal;
  if (!signal) return tenantSignal;
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
    return AbortSignal.any([signal, tenantSignal]);
  }
  if (signal.aborted) return signal;
  if (tenantSignal.aborted) return tenantSignal;

  const controller = new AbortController();
  const abort = (source: AbortSignal) => controller.abort(source.reason);
  signal.addEventListener('abort', () => abort(signal), { once: true });
  tenantSignal.addEventListener('abort', () => abort(tenantSignal), { once: true });
  return controller.signal;
}

export function getTenantDataEpoch(): number {
  return epoch;
}
