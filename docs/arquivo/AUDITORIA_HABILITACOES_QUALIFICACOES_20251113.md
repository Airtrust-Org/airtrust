# Auditoria: Módulos Funcionários e Qualificações – 13/11/2025

Escopo: mapear referências a `habilitacoes`, validar presença de `qualificacoes_historico`, checar endpoints de certificados e pasta virtual.

## Banco de Dados (D1)

- Tabelas/VIEWS detectadas:
  - qualificacoes_historico (table)
  - habilitacoes (VIEW) → criado para compatibilidade: SELECT ... FROM qualificacoes_historico
  - pasta_virtual (table) → criada (superset) para compatibilidade com APIs existentes e prompt

Comandos executados:

- CREATE VIEW IF NOT EXISTS habilitacoes AS SELECT ... FROM qualificacoes_historico
- CREATE TABLE IF NOT EXISTS pasta_virtual (...)

## Código – principais referências

- API v2 (novo):

  - src/worker/api/v2/historico.ts → usa historico_certificacoes_v2 e catálogo v2 (novo fluxo)
  - src/worker/api/v2/habilitacoes.ts → redirect 301 para /api/v2/historico (compat)
  - src/worker/api/v2/certificados.ts → lista e download simplificados
  - src/worker/routes/v2/certificados.ts → upload e geração completos (antiga V2)
  - src/worker/api/v2/pasta-virtual.ts → dashboard/listas/sincronização pasta virtual

- Rotas:

  - src/worker/routes/index.ts → registra:
    - /api/v2/historico (novo)
    - /api/v2/habilitacoes (deprecated → redirect)
    - /api/v2/certificados (simplificado) e /api/v2/certificados-v2-old (upload/gerar)
    - /api/v2/pasta-virtual

- Serviços:
  - src/worker/services/certificadosService.ts → geração via template e R2

Observação: ainda há múltiplas referências a `habilitacoes` no código (queries legadas). A VIEW `habilitacoes` garante compatibilidade com a tabela `qualificacoes_historico` no banco remoto atual.

## Endpoints – Status

- Habilitações (compat): /api/v2/habilitacoes → 301 para /api/v2/historico (OK)
- Histórico (novo): /api/v2/historico → lista/detalhe (OK)
- Certificados:
  - Upload: /api/v2/certificados-v2-old/upload (OK)
  - Gerar: /api/v2/certificados-v2-old/:habilitacao_id/gerar (OK)
  - Listar/Download: /api/v2/certificados (simplificado) (OK)
- Pasta Virtual: /api/v2/pasta-virtual (OK)

## Recomendação

- Se desejar endpoint unificado para upload em /api/v2/certificados/upload, podemos:

  1. Adicionar rota wrapper que delega para V2-old internamente (sem redirect), ou
  2. Replicar lógica de upload no módulo simplificado para alinhar contrato de resposta.

- Enquanto coexistirem módulos, manter a VIEW `habilitacoes` no D1 garante funcionamento sem refatorar todas as queries.
