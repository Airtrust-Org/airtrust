/**
 * API Client - Compatibilidade retroativa
 *
 * @deprecated Use httpClient diretamente para novos códigos
 * Este arquivo mantém compatibilidade com código existente
 */

export type { ApiResponse, HttpClientOptions as ApiClientOptions } from './http-client';

import { httpClient } from './http-client';

// Export named para compatibilidade
export const apiClient = httpClient;

// Export default
export default httpClient;
