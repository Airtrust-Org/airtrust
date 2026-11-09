# Release candidate 2026-11-09 — delta desde o Worker 21d1b31

Base publicada: Worker `21d1b31bd2392853c840e642ab9e687f7904ee6d` (Pages `1bd48d1c`).
Candidato: `main` em `eefc7dba` + este registro (sem código).

Delta de runtime: #2136 (histórico de notificações), `jose` 6.2.12→6.2.15 (JWT), `wrangler`/`@cloudflare/workers-types` (build/tipos), `react-router-dom` 7.18.3→7.18.5 (Pages), ferramentas de lint/build (`typescript-eslint`, `globals`, `esbuild`), e #2141 (scripts operacionais de vencimentos, sem efeito em runtime).

Validação exigida em staging antes de qualquer pedido de produção: login válido/inválido, chamada autenticada, refresh, logout com bloqueio de JTI, token expirado, assinatura adulterada, isolamento multi-tenant.
