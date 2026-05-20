import type { Env } from '../types';
import { ensureDocumentosTableExists } from '../utils/auto-migration-documentos';
import { createStructuredConsole } from '../utils/logger';

export async function runApiBootstrap(env: Env): Promise<void> {
  const console = createStructuredConsole('ApiBootstrap', env.ENVIRONMENT);

  try {
    await ensureDocumentosTableExists(env.DB);
  } catch (error) {
    console.error('[FETCH] Erro na auto-migration:', error);
  }
}
