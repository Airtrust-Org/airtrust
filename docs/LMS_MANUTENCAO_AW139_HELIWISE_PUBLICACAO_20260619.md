# LMS Manutenção — AW139 e Heliwise

Data: 2026-06-19
Worktree: `/tmp/airtrust-escala-quinzena-clean`
Base: `origin/main`

## Escopo auditado

- Curso `AW139 - Manutenção` (`id=32`)
- Curso `Heliwise` (`id=33`)
- Fluxo de publicação do catálogo LMS

## Achados de código

- `publicado` é persistido no CRUD de `lms_cursos` e lido por `GET /api/lms/cursos`.
- O catálogo exige simultaneamente:
  - `empresa_id` do token;
  - `ativo = 1`;
  - `deleted_at IS NULL`;
  - escopo setorial via `lms_cursos_setores` ou fallback por `qualificacoes_tipos_setores`.
- O detalhe de curso (`GET /api/lms/cursos/:id`) não aplica o mesmo filtro setorial do catálogo.

## Hipótese mais provável

Se o detalhe mostra o curso como publicado, mas o catálogo não lista o mesmo item, o desvio mais provável não é persistência de `publicado`. O candidato principal é filtro de catálogo por setor, `ativo` ou tenant.

## Limitações desta execução

- Não havia sessão autenticada disponível para validar `/api/lms/cursos/32` e `/api/lms/cursos/33` no ambiente rodando.
- A tentativa de leitura remota em `staging` via Wrangler falhou por permissão insuficiente do token Cloudflare para `/memberships`.
- O snapshot SQLite local disponível estava sem dados em `lms_cursos`, então não serviu para confirmar os ids 32/33.

## Estado desta macro

- Nenhuma escrita em banco foi executada.
- Nenhuma publicação foi alterada.
- Nenhum curso de Operações foi tocado.
- Nenhuma matrícula foi resetada.

## Próxima validação necessária

Executar leitura autenticada de:

- `GET /api/lms/cursos/32`
- `GET /api/lms/cursos/33`
- `GET /api/lms/cursos?publicados=1&q=AW139`
- `GET /api/lms/cursos?publicados=1&q=Heliwise`
- `GET /api/lms/cursos?publicados=1&setor_ids=11&q=AW139`

Com o mesmo token/sessão, comparar:

- `publicado`
- `ativo`
- `empresa_id`
- `setores`
- presença dos ids 32/33 no catálogo publicado
