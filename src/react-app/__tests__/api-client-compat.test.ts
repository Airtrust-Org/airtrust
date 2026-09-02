import { describe, expect, it } from 'vitest';
import apiClient, { apiClient as namedApiClient } from '@/react-app/services/apiClient';

describe('apiClient compatibility shim', () => {
  it('preserves the legacy callable contract and modern method API', () => {
    expect(apiClient).toBe(namedApiClient);
    expect(typeof apiClient).toBe('function');
    expect(typeof apiClient.get).toBe('function');
    expect(typeof apiClient.post).toBe('function');
    expect(typeof apiClient.put).toBe('function');
    expect(typeof apiClient.patch).toBe('function');
    expect(typeof apiClient.delete).toBe('function');
  });
});
