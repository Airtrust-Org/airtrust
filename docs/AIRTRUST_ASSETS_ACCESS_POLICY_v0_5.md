# AirTrust Assets Access Policy v0.5

Data: 2026-06-02

## Objetivo

Esta política define o comportamento seguro de `GET /api/assets/*` para evitar vazamento de documentos, FIRA, certificados, fichas, ASO, PDFs ou qualquer asset privado entre tenants ou por URL pública.

A regra base é conservadora: todo asset é privado ou bloqueado, exceto padrões públicos explicitamente permitidos.

## Prefixos Públicos

Somente branding de empresa pode ser servido sem autenticação por `/api/assets/*`:

- `empresas/{empresaId}/logo.png`
- `empresas/{empresaId}/logo-{timestamp}.{png|jpg|jpeg|webp|gif|svg}`
- `empresas/{empresaId}/certificado-logo-{timestamp}.{png|jpg|jpeg|webp|gif|svg}`
- `empresas/{empresaId}/sistema-logo-{timestamp}.{png|jpg|jpeg|webp|gif|svg}`
- `empresas/{empresaId}/favicon-{timestamp}.{png|jpg|jpeg|webp|gif|svg}`

Cache permitido:

- `Cache-Control: public, max-age=86400`

O prefixo `empresas/{empresaId}/` inteiro nao e publico. Apenas os nomes acima sao permitidos.

## Prefixos Privados Tenant-Scoped

O prefixo abaixo pode ser servido por `/api/assets/*` somente depois de autenticar o usuario e confirmar que o tenant atual corresponde ao `empresaId` da chave:

- `fira/{empresaId}/...`

Cache obrigatório:

- `Cache-Control: private, no-store`

Cross-tenant deve retornar `404` ou `403`, preferencialmente sem confirmar existencia do objeto.

## Prefixos Bloqueados

Os prefixos abaixo nao devem ser servidos por `/api/assets/*`, mesmo com token, porque exigem ownership mais especifico ou fluxo autenticado proprio:

- `EXAME-ASO-*`
- `certificados/*`
- `funcionarios/*`
- `qualificacoes/*`
- qualquer prefixo desconhecido

Para esses casos, a rota retorna `404` sem chamar `BUCKET.get`.

## Rotas Autenticadas Recomendadas

Use rotas especificas que consultem o banco e validem ownership antes de ler o R2:

- Certificados: `/api/certificados/...` e stream centralizado via `/api/pasta-virtual/stream/:id`
- Pasta virtual/documentos pessoais: `/api/pasta-virtual/download/:id` ou `/api/pasta-virtual/stream/:id`
- ASO/documentos de saude: rota autenticada com lookup por documento e tenant
- Qualificacoes: rota autenticada com lookup por historico/documento e tenant

## Impacto LGPD Mitigado

A mudanca remove o passthrough publico do R2 por chave. Documentos de saude, certificados profissionais, documentos pessoais e prefixos desconhecidos deixam de ser acessiveis por bearer URL publica em `/api/assets/*`.

O endpoint tambem evita cache publico para assets privados e nao consulta o R2 antes de autorizar prefixos tenant-scoped ou bloquear prefixos sensiveis.

## Pendencias Reais

- Criar rotas autenticadas especificas para qualquer prefixo privado legado que ainda precise de download direto.
- Revisar registros antigos de `logo_url` caso existam formatos fora do allowlist publico.
- Avaliar separacao fisica futura entre bucket/prefixo publico de branding e bucket/prefixo privado de documentos.
- Revisar `scripts/smoke-assets-public.sh`, que usa `logos/__auth_smoke__.png` como probe legado e deve continuar aceitando `404` como resposta segura.
