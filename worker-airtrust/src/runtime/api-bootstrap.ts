import type { Env } from '../types';
import { createStructuredConsole } from '../utils/logger';

/**
 * Bootstrap executado no startup de cada requisição API.
 * R04.6 (2026-06-03): ensureDocumentosTableExists removido — migration 0388
 * aplicada em produção, schema de documentos é canônico via D1 migrations.
 * R01 (ensureSigvoosTables) permanece documentado, pendente reconciliação 0354.
 */
export async function runApiBootstrap(env: Env): Promise<void> {
  const console = createStructuredConsole('ApiBootstrap', env.ENVIRONMENT);
  // Bootstrap hooks — add future initializers here.
  void console; // keep import used
}
