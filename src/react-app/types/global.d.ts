declare global {
  var apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

  interface Window {
    apiFetch: typeof globalThis.apiFetch;
  }
}

export {};
