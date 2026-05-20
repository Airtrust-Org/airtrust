const IS_DEV = import.meta.env.DEV;

export const logger = {
  error: (...args: unknown[]) => {
    // Always log errors, but strip verbose debug objects in production
    if (IS_DEV) {
      console.error('[ERROR]', ...args);
    } else {
      // In production, only log the message string to avoid leaking internals
      const messages = args.map((a) => (a instanceof Error ? a.message : String(a)));
      console.error('[ERROR]', ...messages);
    }
  },

  warn: (...args: unknown[]) => {
    if (IS_DEV) console.warn('[WARN]', ...args);
  },

  info: (...args: unknown[]) => {
    if (IS_DEV) console.info('[INFO]', ...args);
  },

  debug: (...args: unknown[]) => {
    if (IS_DEV && localStorage.getItem('debug') === 'true') {
      console.log('[DEBUG]', ...args);
    }
  },
};
