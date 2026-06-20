import path from 'path';
import { execSync } from 'child_process';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { assertDevProxyTargetIsSafe } from './src/react-app/config/devProxyGuard';

function getBuildVersion(): string {
  const explicitVersion = process.env.APP_VERSION?.trim();
  if (explicitVersion) return explicitVersion;

  try {
    const gitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const dirty =
      execSync('git status --porcelain --untracked-files=no', {
        encoding: 'utf8',
      }).trim().length > 0;
    return dirty ? `${gitHash}-dirty` : gitHash;
  } catch {
    return 'dev';
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const BUILD_VERSION = getBuildVersion();
  const apiUrl =
    env.VITE_API_URL || (mode === 'development' ? '' : 'https://api.airtrust.online/api');
  const devProxyTarget = env.VITE_DEV_PROXY_TARGET || 'http://localhost:8787';
  assertDevProxyTargetIsSafe(mode, devProxyTarget, env.AIRTRUST_ALLOW_PROD_DEV_PROXY);

  return {
    plugins: [
      react(),
      {
        name: 'inject-build-version',
        transformIndexHtml(html: string) {
          return html.replace('__BUILD_VERSION__', BUILD_VERSION);
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: 'localhost',
      port: 3000,
      strictPort: true, // ✅ Falha se 3000 estiver ocupada (forçar porta fixa)
      allowedHosts: true,
      open: false, // ✅ Não abre o browser automaticamente a cada restart
      // ✅ CRÍTICO: Headers anti-cache para desenvolvimento
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        'Surrogate-Control': 'no-store',
      },
      hmr: {
        overlay: false,
      },
      proxy: {
        '/api': {
          target: devProxyTarget,
          changeOrigin: true,
          secure: devProxyTarget.startsWith('https://'),
        },
      },
      watch: {
        ignored: [
          '**/node_modules/**',
          '**/.bun/**',
          '**/jsdom/**',
          '**/cache/**',
          '**/dist/**',
          '**/.git/**',
          '**/vite.config.ts.timestamp-*',
        ],
      },
    },
    esbuild: {
      drop: process.env.NODE_ENV === 'production' ? ['debugger'] : [],
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      __DEV_MODE__: JSON.stringify(process.env.NODE_ENV !== 'production'),
      __APP_BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
      'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl),
      // Apenas em desenvolvimento - remover em produção
      ...(process.env.NODE_ENV === 'development'
        ? {
            'process.env.DISABLE_TRACKING': JSON.stringify(true),
            'process.env.SKIP_SECRET_VALIDATION': JSON.stringify(true),
          }
        : {}),
    },
    build: {
      watch: null,
      chunkSizeWarningLimit: 600,
      sourcemap: process.env.NODE_ENV !== 'production',
      target: 'es2020',
      minify: process.env.NODE_ENV === 'production',
      outDir: 'dist/client',
      emptyOutDir: true,
      manifest: 'manifest.json',
      rollupOptions: {
        output: {
          // ✅ CACHE BUSTING: Hash determinístico (não adicionar timestamp aleatório)
          // Vite usa [hash] baseado no conteúdo do arquivo, garantindo que:
          // - Mesmos conteúdos = mesmo hash = reusam cache
          // - Conteúdos diferentes = hashes diferentes = cliente busca novo
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
          manualChunks: {
            vendor: ['react', 'react-dom'],
            router: ['react-router-dom'],
            query: ['@tanstack/react-query'],
            charts: ['recharts'],
            pdf: ['jspdf'],
            capture: ['html2canvas'],
            excel: ['xlsx'],
            forms: ['react-hook-form', 'zod'],
            dnd: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          },
        },
      },
    },
    optimizeDeps: {
      // ✅ Pre-bundling habilitado para evitar milhares de requests individuais
      // (lucide-react importado em 272+ arquivos gera 3000+ requests sem isso)
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react-router-dom',
        'lucide-react',
        '@tanstack/react-query',
        'zustand',
        'date-fns',
        'clsx',
        'tailwind-merge',
        'sonner',
        'recharts',
        'zod',
      ],
      exclude: [],
    },
  };
});
