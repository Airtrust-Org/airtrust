/**
 * API Service - Compatibilidade retroativa
 *
 * @deprecated Use httpClient diretamente para novos códigos
 * Este arquivo mantém compatibilidade com código existente
 */

export { default } from './http-client';
export { httpClient as apiClient } from './http-client';
export type { ApiResponse, HttpClientOptions as ApiClientOptions } from './http-client';
