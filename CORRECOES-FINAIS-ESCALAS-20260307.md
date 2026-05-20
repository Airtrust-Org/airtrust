# Correções Finais Escalas - 2026-03-07

## Escopo executado

Correções executadas em sequência, com validação local e deploy ao final:

1. Modal de alocação com footer sempre visível e corpo rolável.
2. Filtro de aeronave visível e funcional também na visão Tripulantes.
3. Headers globais de segurança no Worker e no frontend Pages.
4. Mapeamento e validação das integrações cruzadas de Certificações, Eventos/Simuladores, Dashboard e Auditoria.

## Correções aplicadas

### 1. Modal de alocação

- O shell compartilhado em `src/components/ui/Modal.tsx` foi reestruturado para usar container com `maxHeight` baseado em `100dvh`, corpo com `overflow-y-auto` e footer separado do scroll.
- Foram adicionados marcadores estruturais para validação: `data-modal-container`, `data-modal-body` e `data-modal-footer`.
- `ModalAdicionarTripulacao.tsx` passou a usar colunas com `min-h-0` e a lista de tripulantes agora rola dentro do corpo do modal sem empurrar o footer para fora da viewport.
- `ModalNovaSituacao.tsx` recebeu o mesmo padrão para listas longas e footer fixo.

### 2. Filtro de aeronave na visão Tripulantes

- O seletor de aeronave deixou de ficar restrito à aba Aeronaves e permanece visível também em Tripulantes.
- O filtro agora é aplicado sobre `alocacao_q1` e `alocacao_q2` na cobertura de tripulantes.
- O resumo da cobertura em Tripulantes passou a refletir o conjunto filtrado, não o dataset bruto.
- `Limpar todos` reseta corretamente o filtro de aeronave e os demais filtros associados.

### 3. Headers de segurança HTTP

- O Worker passou a aplicar um único middleware global explícito em `worker-airtrust/src/index.ts`, sem duplicidade com outro middleware de segurança.
- Headers aplicados globalmente:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `Content-Security-Policy` consolidada
  - `Strict-Transport-Security` em produção
- `public/_headers` foi alinhado com a mesma política para Cloudflare Pages.

### 4. Integrações cross-módulo

Mapeamento confirmado no backend:

- Dashboard: `/api/dashboard/qualificacoes`
- Simuladores: `/api/simuladores`
- Eventos Escalas: `/api/escalas/:id/eventos`
- Cobertura Tripulantes: `/api/escalas/:id/cobertura/tripulantes`
- Certificados: `/api/certificados/funcionario/:id`
- Auditoria: `/api/qualificacoes-historico/auditoria`

Validação de integração confirmada:

- Simuladores e Funcionários já possuem sincronização com Escalas via `replaceManagedEscalaEvents` em rotas operacionais.
- Eventos externos em Escalas continuam protegidos contra edição direta quando a origem é `simuladores` ou `funcionario_ferias`.
- Dashboard local respondeu corretamente com métricas reais.
- Certificados local respondeu corretamente para funcionário válido.
- Escalas eventos e cobertura de tripulantes responderam corretamente com dados reais.

Correção adicional encontrada durante a validação:

- O endpoint de Auditoria falhava em runtime por depender da coluna legada `renovacao_de`, ausente no schema atual.
- Foi implementado fallback dinâmico por `PRAGMA table_info('qualificacoes_historico')`, usando `renovacao_de` quando existir e `renovada` quando o ambiente estiver no schema novo.
- A mesma compatibilidade foi aplicada em `worker-airtrust/src/routes/auditoria-detalhada.ts` para evitar a mesma falha latente.

## Validação executada

### Navegador local

- Escala aberta em `http://localhost:3000/escalas`.
- Filtro `PR-BGE` selecionado em Aeronaves e mantido ao trocar para Tripulantes.
- Na visão Tripulantes, a grade ficou filtrada apenas com alocações `PR-BGE`.
- Snapshot do modal confirmou diálogo aberto com footer acessível:
  - `Gerenciar alocações · PR-BGE SK76`
  - botões `Fechar` e `Salvar e continuar` presentes no footer.

### Endpoints locais validados

- `GET /api/dashboard/qualificacoes` -> `success: true`
- `GET /api/simuladores?limit=1` -> `success: true`
- `GET /api/certificados/funcionario/1` -> `success: true`
- `GET /api/escalas/9ad63f4d-940f-463b-a077-8c9553a4bd97/eventos` -> `success: true`
- `GET /api/escalas/9ad63f4d-940f-463b-a077-8c9553a4bd97/cobertura/tripulantes` -> `success: true`
- `GET /api/qualificacoes-historico/auditoria?cpfs=13465142837` -> corrigido para `success: true`

### Headers locais validados

- `curl -I http://localhost:8787/api/health` retornou:
  - `Content-Security-Policy`
  - `Permissions-Policy`
  - `Referrer-Policy`
  - `X-Content-Type-Options`
  - `X-Frame-Options`

### Build e typecheck

- `npm run build` -> OK
- `npx tsc --noEmit` -> OK

## Deploy

- Deploy executado com `./deploy-full-automated.sh`.
- Pages publicado com sucesso.
- Worker publicado com sucesso.
- Worker Version ID reportado no deploy: `2bd45d11-8e64-48ff-88b1-10dcdb9374b6`
- Build version publicado no Pages: `0c174d1e`
- Health de produção confirmou versão `0c174d1e`.

Observação importante:

- O script `./deploy-full-automated.sh` executou um commit automático pós-publish:
  - `8531e6f0 deploy: auto build + publish 2026-03-07 13:49:02`
- O deploy efetivo publicado segue com o build version `0c174d1e`, pois o commit automático ocorreu depois da publicação.

## Pós-deploy validado

### Pages

- `strict-transport-security: max-age=31536000; includeSubDomains; preload`
- `content-security-policy` presente
- `permissions-policy: camera=(), microphone=(), geolocation=()`
- `referrer-policy: strict-origin-when-cross-origin`
- `x-content-type-options: nosniff`
- `x-frame-options: DENY`
- `<meta name="build-version" content="0c174d1e" />`

### Worker

- `strict-transport-security: max-age=31536000; includeSubDomains; preload`
- `content-security-policy` presente
- `permissions-policy: camera=(), microphone=(), geolocation=()`
- `referrer-policy: strict-origin-when-cross-origin`
- `x-content-type-options: nosniff`
- `x-frame-options: DENY`
- `x-airtrust-version: GIG`

## Observações finais

- No D1 local de `wrangler`, a tabela `escala_auditoria` existe, mas estava vazia no banco local consultado.
- A tabela `auditoria_avancada_v2` não existe no banco local consultado por `wrangler d1 execute --local`.
- Isso indica diferença entre o banco local do Wrangler e o ambiente que estava respondendo em `localhost:8787`, não uma quebra adicional do código alterado nesta entrega.
