import path from 'path';
import { execSync } from 'child_process';
import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { assertDevProxyTargetIsSafe } from './src/react-app/config/devProxyGuard';

type ManualChunkGroup = {
  name: string;
  packages: readonly string[];
};

const MANUAL_CHUNK_GROUPS: readonly ManualChunkGroup[] = [
  { name: 'vendor', packages: ['react', 'react-dom', 'scheduler'] },
  { name: 'router', packages: ['react-router', 'react-router-dom'] },
  { name: 'query', packages: ['@tanstack/query-core', '@tanstack/react-query'] },
  { name: 'charts', packages: ['recharts'] },
  { name: 'pdf', packages: ['jspdf'] },
  { name: 'capture', packages: ['html2canvas'] },
  { name: 'excel', packages: ['exceljs'] },
  { name: 'forms', packages: ['react-hook-form', 'zod'] },
  {
    name: 'dnd',
    packages: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
  },
];

function isPackageModule(id: string, packageName: string): boolean {
  const normalizedId = id.replace(/\\/g, '/');
  return normalizedId.includes(`/node_modules/${packageName}/`);
}

function manualChunkForModule(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;

  for (const group of MANUAL_CHUNK_GROUPS) {
    if (group.packages.some((packageName) => isPackageModule(id, packageName))) {
      return group.name;
    }
  }

  return undefined;
}

function verifyVendorChunkPlugin(): Plugin {
  return {
    name: 'verify-vendor-chunk',
    apply: 'build',
    generateBundle(_options, bundle) {
      const vendorChunk = Object.values(bundle).find(
        (output) => output.type === 'chunk' && output.name === 'vendor',
      );

      if (!vendorChunk || vendorChunk.type !== 'chunk') {
        this.error('Expected a non-empty vendor chunk containing React and ReactDOM.');
      }

      const moduleIds = Object.keys(vendorChunk.modules);
      const hasReact = moduleIds.some((id) => isPackageModule(id, 'react'));
      const hasReactDom = moduleIds.some((id) => isPackageModule(id, 'react-dom'));

      if (!hasReact || !hasReactDom || vendorChunk.code.trim().length < 1_024) {
        this.error(
          `Invalid vendor chunk: react=${hasReact}, react-dom=${hasReactDom}, bytes=${vendorChunk.code.length}.`,
        );
      }
    },
  };
}

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
      verifyVendorChunkPlugin(),
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
          // Function form catches React 19 CommonJS proxy/virtual modules that the
          // package-name object form can leave outside the intended vendor chunk.
          manualChunks: manualChunkForModule,
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
