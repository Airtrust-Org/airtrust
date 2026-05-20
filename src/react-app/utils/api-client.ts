/**
 * API CLIENT - Cliente centralizado para chamadas de API
 *
 * Benefícios:
 * - Validação automática de 404
 * - Tratamento de erros padronizado
 * - Retry automático com exponential backoff
 * - Logs consistentes
 * - Timeout configurável
 * - Circuit breaker para evitar cascata de falhas
 * - Retry-After header support
 */

import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

interface ApiOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  validateStatus?: boolean;
}

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
  };
}

// ===== CIRCUIT BREAKER STATE =====
interface CircuitBreakerState {
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

class ApiClient {
  private baseUrl: string;
  private defaultTimeout = 10000;
  private defaultRetries = 3;
  private circuitBreaker: CircuitBreakerState = {
    failureCount: 0,
    successCount: 0,
    lastFailureTime: 0,
    state: 'CLOSED',
  };
  private circuitBreakerThreshold = 5;
  private circuitBreakerResetTime = 60000; // 60 seconds

  constructor() {
    // Keep /api prefix as Worker routes expect it
    this.baseUrl = API_BASE_URL;
  }

  // ===== EXPONENTIAL BACKOFF CALCULATION =====
  private getBackoffDelay(attempt: number): number {
    // 1s, 2s, 4s, 8s (capped at 8s)
    return Math.min(1000 * Math.pow(2, attempt), 8000);
  }

  // ===== CIRCUIT BREAKER LOGIC =====
  private checkCircuitBreaker(): boolean {
    if (this.circuitBreaker.state === 'CLOSED') {
      return true; // OK, proceed
    }

    if (this.circuitBreaker.state === 'OPEN') {
      // Check if we should try half-open
      const timeSinceFailure = Date.now() - this.circuitBreaker.lastFailureTime;
      if (timeSinceFailure > this.circuitBreakerResetTime) {
        this.circuitBreaker.state = 'HALF_OPEN';
        this.circuitBreaker.successCount = 0;
        console.info('[API] Circuit breaker entering HALF_OPEN state');
        return true; // Try one request
      }

      console.warn('[API] Circuit breaker is OPEN, rejecting request');
      return false; // Don't even try
    }

    // HALF_OPEN state: allow request to proceed
    return true;
  }

  private recordSuccess(): void {
    if (this.circuitBreaker.state === 'HALF_OPEN') {
      this.circuitBreaker.successCount++;
      if (this.circuitBreaker.successCount >= 2) {
        this.circuitBreaker.state = 'CLOSED';
        this.circuitBreaker.failureCount = 0;
        console.info('[API] Circuit breaker CLOSED (recovered)');
      }
    } else if (this.circuitBreaker.state === 'CLOSED') {
      this.circuitBreaker.failureCount = Math.max(0, this.circuitBreaker.failureCount - 1);
    }
  }

  private recordFailure(): void {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.failureCount >= this.circuitBreakerThreshold) {
      this.circuitBreaker.state = 'OPEN';
      console.error(`[API] Circuit breaker OPEN (${this.circuitBreaker.failureCount} failures)`);
    } else if (this.circuitBreaker.state === 'HALF_OPEN') {
      this.circuitBreaker.state = 'OPEN';
      console.error('[API] Circuit breaker back to OPEN');
    }
  }

  /**
   * Faz uma requisição GET
   */
  async get<T = any>(endpoint: string, options: ApiOptions = {}): Promise<ApiResponse<T>> {
    const token = getAccessToken();
    return this.request<T>(endpoint, {
      ...options,
      method: 'GET',
      headers: {
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  }

  /**
   * Faz uma requisição POST
   */
  async post<T = any>(
    endpoint: string,
    data?: any,
    options: ApiOptions = {},
  ): Promise<ApiResponse<T>> {
    const token = getAccessToken();
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * Faz uma requisição PUT
   */
  async put<T = any>(
    endpoint: string,
    data?: any,
    options: ApiOptions = {},
  ): Promise<ApiResponse<T>> {
    const token = getAccessToken();
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * Faz uma requisição PATCH
   */
  async patch<T = any>(
    endpoint: string,
    data?: any,
    options: ApiOptions = {},
  ): Promise<ApiResponse<T>> {
    const token = getAccessToken();
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * Faz uma requisição DELETE
   */
  async delete<T = any>(endpoint: string, options: ApiOptions = {}): Promise<ApiResponse<T>> {
    const token = getAccessToken();
    return this.request<T>(endpoint, {
      ...options,
      method: 'DELETE',
      headers: {
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  }

  /**
   * Requisição genérica com retry e timeout
   */
  private async request<T>(endpoint: string, options: ApiOptions = {}): Promise<ApiResponse<T>> {
    const {
      timeout = this.defaultTimeout,
      retries,
      validateStatus = true,
      ...fetchOptions
    } = options;

    const method = String(fetchOptions.method || 'GET').toUpperCase();
    const resolvedRetries =
      typeof retries === 'number' ? retries : method === 'GET' ? this.defaultRetries : 0;

    // ===== CIRCUIT BREAKER CHECK =====
    if (!this.checkCircuitBreaker()) {
      return {
        success: false,
        error: 'Serviço temporariamente indisponível (circuit breaker)',
        code: 'SERVICE_UNAVAILABLE',
      };
    }

    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= resolvedRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          ...fetchOptions,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // ===== STATUS CODE HANDLING =====
        if (validateStatus && !response.ok) {
          // 401 Unauthorized - don't retry
          if (response.status === 401) {
            console.error(`[API] 401 Unauthorized: ${endpoint}`);
            this.recordFailure();
            return {
              success: false,
              error: 'Não autorizado',
              code: 'UNAUTHORIZED',
            };
          }

          // 403 Forbidden - don't retry
          if (response.status === 403) {
            console.error(`[API] 403 Forbidden: ${endpoint}`);
            this.recordFailure();
            return {
              success: false,
              error: 'Acesso negado',
              code: 'FORBIDDEN',
            };
          }

          // 422 Unprocessable Entity - don't retry
          if (response.status === 422) {
            console.error(`[API] 422 Unprocessable Entity: ${endpoint}`);
            const errorData = await response.json().catch(() => ({}));
            this.recordFailure();
            return {
              success: false,
              error: errorData.error || 'Dados inválidos',
              code: 'UNPROCESSABLE_ENTITY',
            };
          }

          // 404 Not Found - don't retry
          if (response.status === 404) {
            console.error(`[API] 404 Not Found: ${endpoint}`);
            this.recordFailure();
            return {
              success: false,
              error: 'Recurso não encontrado',
              code: 'NOT_FOUND',
            };
          }

          // 429 Too Many Requests - retry with Retry-After
          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('Retry-After') || '0', 10);
            const delay = retryAfter > 0 ? retryAfter * 1000 : this.getBackoffDelay(attempt);

            console.warn(`[API] 429 Rate Limited: ${endpoint}, waiting ${delay}ms`);

            if (attempt < resolvedRetries) {
              await new Promise((resolve) => setTimeout(resolve, delay));
              continue;
            }

            this.recordFailure();
            return {
              success: false,
              error: 'Muitas requisições, tente novamente mais tarde',
              code: 'RATE_LIMITED',
            };
          }

          // 5xx Server Error - retry
          if (response.status >= 500) {
            throw new Error(`Erro no servidor: ${response.status}`);
          }
        }

        const data = await response.json();
        this.recordSuccess();
        return data;
      } catch (error: any) {
        lastError = error;

        // ===== RETRY LOGIC =====
        const isRetryable =
          error.name === 'AbortError' ||
          error.message.includes('fetch') ||
          error.message.includes('Erro no servidor');

        if (attempt < resolvedRetries && isRetryable) {
          const delay = this.getBackoffDelay(attempt);
          console.warn(
            `[API] Tentativa ${attempt + 1}/${
              resolvedRetries + 1
            } falhou para ${endpoint}, aguardando ${delay}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        this.recordFailure();
        console.error(`[API] Erro em ${endpoint}:`, error);
        return {
          success: false,
          error: error.message || 'Erro na requisição',
          code: 'REQUEST_FAILED',
        };
      }
    }

    this.recordFailure();
    return {
      success: false,
      error: lastError?.message || 'Erro na requisição após múltiplas tentativas',
      code: 'MAX_RETRIES_EXCEEDED',
    };
  }

  /**
   * Upload de arquivo
   */
  async upload<T = any>(
    endpoint: string,
    formData: FormData,
    options: ApiOptions = {},
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: formData,
    });
  }

  /**
   * Get Blob for PDF/File download
   */
  async getBlob(endpoint: string): Promise<Blob> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const token = getAccessToken();

    const response = await fetch(url, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Erro ao baixar arquivo: ${response.status}`);
    }

    return await response.blob();
  }

  /**
   * Download de arquivo com retry
   */
  async download(endpoint: string, filename?: string): Promise<void> {
    try {
      const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= 2; attempt++) {
        try {
          const response = await fetch(url);

          if (!response.ok) {
            if (response.status >= 500 && attempt < 2) {
              await new Promise((resolve) => setTimeout(resolve, this.getBackoffDelay(attempt)));
              continue;
            }
            throw new Error(`Erro ao baixar arquivo: ${response.status}`);
          }

          const blob = await response.blob();
          const downloadUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = filename || 'download';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(downloadUrl);

          this.recordSuccess();
          return;
        } catch (error: any) {
          lastError = error;
          if (attempt < 2) {
            console.warn(`[API] Download attempt ${attempt + 1}/3 failed, retrying...`);
            continue;
          }
        }
      }

      this.recordFailure();
      throw lastError || new Error('Erro ao baixar arquivo após múltiplas tentativas');
    } catch (error: any) {
      console.error('[API] Erro ao baixar arquivo:', error);
      throw error;
    }
  }
}

export const api = new ApiClient();

export default ApiClient;
