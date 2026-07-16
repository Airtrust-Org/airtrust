import { describe, expect, it } from 'vitest';
import { HttpResponseError, InvalidJsonPayloadError, parseErrorPayload, parseJsonResponse } from '../parseJsonResponse';

interface TenantPayload {
  success: true;
  data: { empresaId: number; userId: number };
}

function isTenantPayload(data: unknown): data is TenantPayload {
  if (typeof data !== 'object' || data === null) return false;
  const body = data as Record<string, unknown>;
  if (body.success !== true || typeof body.data !== 'object' || body.data === null) return false;
  const inner = body.data as Record<string, unknown>;
  return typeof inner.empresaId === 'number' && typeof inner.userId === 'number';
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('parseJsonResponse', () => {
  it('JSON válido + schema aceito: retorna o payload tipado', async () => {
    const res = jsonResponse({ success: true, data: { empresaId: 7, userId: 42 } });
    const result = await parseJsonResponse(res, isTenantPayload);
    expect(result.data.empresaId).toBe(7);
    expect(result.data.userId).toBe(42);
  });

  it('JSON inválido (corpo não parseável): lança InvalidJsonPayloadError', async () => {
    const res = new Response('não é json', { status: 200 });
    await expect(parseJsonResponse(res, isTenantPayload)).rejects.toThrow(InvalidJsonPayloadError);
  });

  it('resposta vazia: lança InvalidJsonPayloadError em vez de silenciar', async () => {
    const res = new Response('', { status: 200 });
    await expect(parseJsonResponse(res, isTenantPayload)).rejects.toThrow(InvalidJsonPayloadError);
  });

  it('erro HTTP (status não-ok): lança HttpResponseError mesmo com corpo JSON válido', async () => {
    const res = jsonResponse({ error: 'empresa não encontrada' }, 404);
    await expect(parseJsonResponse(res, isTenantPayload)).rejects.toThrow(HttpResponseError);
    try {
      await parseJsonResponse(jsonResponse({ error: 'empresa não encontrada' }, 404), isTenantPayload);
      throw new Error('deveria ter lançado');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpResponseError);
      expect((err as HttpResponseError).status).toBe(404);
      expect((err as HttpResponseError).message).toBe('empresa não encontrada');
    }
  });

  it('payload inesperado (schema rejeita): lança InvalidJsonPayloadError mesmo com status 200', async () => {
    const res = jsonResponse({ success: true, data: { unrelatedField: 'x' } });
    await expect(parseJsonResponse(res, isTenantPayload)).rejects.toThrow(InvalidJsonPayloadError);
  });

  it('schema rejeitando tenant/usuário inválido: campos com tipo errado nunca são promovidos a T', async () => {
    const res = jsonResponse({ success: true, data: { empresaId: 'nao-numero', userId: 42 } });
    await expect(parseJsonResponse(res, isTenantPayload)).rejects.toThrow(InvalidJsonPayloadError);
  });

  it('nunca "promove" um valor não validado — o generic T não é atingível sem o guard aprovar', async () => {
    const res = jsonResponse({ success: false, data: null });
    await expect(parseJsonResponse(res, isTenantPayload)).rejects.toThrow(InvalidJsonPayloadError);
  });
});

describe('parseErrorPayload', () => {
  it('extrai `error` de um corpo JSON válido', async () => {
    const res = jsonResponse({ error: 'sem permissão' }, 403);
    const result = await parseErrorPayload(res);
    expect(result.error).toBe('sem permissão');
  });

  it('corpo vazio: nunca lança, devolve objeto sem `error`', async () => {
    const res = new Response('', { status: 500 });
    const result = await parseErrorPayload(res);
    expect(result.error).toBeUndefined();
  });

  it('corpo JSON malformado: nunca lança, devolve objeto sem `error`', async () => {
    const res = new Response('{not valid', { status: 500 });
    const result = await parseErrorPayload(res);
    expect(result.error).toBeUndefined();
  });

  it('campo `error` com tipo errado (não string): ignorado, não promovido', async () => {
    const res = jsonResponse({ error: { nested: true } }, 500);
    const result = await parseErrorPayload(res);
    expect(result.error).toBeUndefined();
  });
});
