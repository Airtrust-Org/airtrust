/**
 * parseJsonResponse — fronteira segura entre `fetch`/`fetchWithAuth` (que
 * devolvem `Response` puro, sem generics) e o código de aplicação que
 * precisa de um tipo concreto.
 *
 * Por quê isto existe:
 *   O PR #336 tentou resolver o mesmo problema redefinindo globalmente
 *   `interface Response { json<T>(): Promise<T> }`, o que enfraquecia a
 *   checagem de tipos em TODA chamada `.json()` do app (incluindo as que
 *   nunca deveriam aceitar um tipo arbitrário sem validação). Foi revertido.
 *
 *   Este helper resolve o mesmo problema sem tocar no tipo global `Response`:
 *   o payload chega como `unknown` e só é promovido ao tipo `T` depois de
 *   passar por um type guard fornecido pelo chamador. Dados que controlam
 *   autenticação, tenant, RBAC, permissões, escrita, conclusão de LMS,
 *   qualificação ou score de FRMS devem sempre fornecer um guard real (não
 *   um `(): true` de fachada).
 */

export class HttpResponseError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpResponseError';
    this.status = status;
  }
}

export class InvalidJsonPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidJsonPayloadError';
  }
}

function extractErrorMessage(data: unknown, status: number): string {
  if (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as { error: unknown }).error === 'string'
  ) {
    return (data as { error: string }).error;
  }
  return `Erro HTTP ${status}`;
}

/**
 * Lê e valida o corpo JSON de uma `Response`.
 *
 * - Se o corpo não for JSON válido, lança `InvalidJsonPayloadError`.
 * - Se `response.ok` for falso, lança `HttpResponseError` (nunca silenciada
 *   como payload válido, mesmo que o corpo seja um JSON bem formado).
 * - Se o corpo for JSON válido e a resposta for `ok`, mas `isValid(data)`
 *   rejeitar o formato, lança `InvalidJsonPayloadError` — o chamador nunca
 *   recebe um valor "promovido" sem checagem real.
 */
export async function parseJsonResponse<T>(
  response: Response,
  isValid: (data: unknown) => data is T,
): Promise<T> {
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new InvalidJsonPayloadError(`Resposta não é um JSON válido (status ${response.status}).`);
  }

  if (!response.ok) {
    throw new HttpResponseError(response.status, extractErrorMessage(data, response.status));
  }

  if (!isValid(data)) {
    throw new InvalidJsonPayloadError('Payload da API não corresponde ao formato esperado.');
  }

  return data;
}

/**
 * Variante tolerante para respostas de erro cujo corpo pode estar ausente,
 * vazio ou malformado (ex.: `catch(() => ({}))` em código legado). Nunca
 * lança — sempre devolve um objeto com `error?: string`, promovendo apenas
 * o campo `error` quando ele é de fato uma string.
 */
export async function parseErrorPayload(response: Response): Promise<{ error?: string }> {
  try {
    const data: unknown = await response.json();
    if (
      typeof data === 'object' &&
      data !== null &&
      typeof (data as { error?: unknown }).error === 'string'
    ) {
      return { error: (data as { error: string }).error };
    }
    return {};
  } catch {
    return {};
  }
}
