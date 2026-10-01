import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('exportacao CORS contract', () => {
  it('does not override the shared allowlisted CORS policy with a wildcard', () => {
    const route = readFileSync('src/routes/exportacao.ts', 'utf8');
    const cors = readFileSync('src/middleware/cors.ts', 'utf8');

    expect(route).not.toContain("'Access-Control-Allow-Origin': '*'");
    expect(cors).toContain('isAllowedOrigin(origin, c.env.CORS_ORIGINS)');
    expect(cors).toContain("c.header('Access-Control-Allow-Credentials', 'true')");
  });
});
