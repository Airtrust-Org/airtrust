# AirTrust — Schema Audit Closeout A-02 / A-06 — 2026-09-09

Esta frente trata somente os residuais de schema A-02 e A-06. A frente `/pilot`, a issue #580 e a migration 0488 não foram alteradas.

A migration 0487 de `qualificacoes_renovacoes` está fora deste escopo: ela já foi aplicada pelo fluxo governado e está `APPLIED_VERIFIED` conforme a issue #494 e o production preflight run `34177475204`.

## A-02 — Natural Keys Tenant-Scoped

| Chave | Contrato runtime atual | Proteção tenant-scoped preparada |
|---|---|---|
| `cpf` | Normalizado para dígitos; igualdade exata dentro de `empresa_id` | `UNIQUE (empresa_id, cpf)` para registros ativos/não vazios |
| `matricula` | CRUD sanitiza whitespace; igualdade exata/case-sensitive | `UNIQUE (empresa_id, matricula)` para registros ativos/não vazios |
| `email` | CRUD grava lowercase; vínculo usuário↔funcionário usa `LOWER(TRIM(email))` | `UNIQUE (empresa_id, LOWER(TRIM(email)))` para registros ativos/não vazios |

### Evidência e segurança

- As constraints globais históricas de `funcionarios` foram perdidas em rebuilds posteriores.
- A migration 0489 cria primeiro as novas constraints tenant-scoped e só depois remove os nomes globais UNIQUE conhecidos, mantendo comportamento fail-closed mesmo se o executor não encapsular o arquivo inteiro em uma transação.
- Os nomes históricos ambíguos `idx_funcionarios_cpf` e `idx_funcionarios_matricula` não são removidos. Em diferentes estados históricos eles foram usados tanto para índices UNIQUE quanto non-UNIQUE. Se existirem no ambiente alvo, o preflight é NO-GO até inspeção de metadata.
- `qualificacoes_tipos.codigo` já possui substituição tenant-scoped pela migration 0462; o `DROP IF EXISTS ux_qualificacoes_tipos_codigo` é hardening defensivo.
- Nenhum remote D1 apply é autorizado por este documento.
- O preflight read-only `scripts/validation/0489_a02_natural_keys_tenant_scoped_preflight.sql` deve retornar zero conflitos nas três chaves e zero drift ambíguo antes de qualquer aplicação governada.

### Testes

A suíte da 0489 cobre:

- reutilização legítima de natural key entre tenants;
- bloqueio de duplicidade dentro do mesmo tenant;
- soft-delete;
- NULL/vazio;
- matrícula case-sensitive;
- identidade de e-mail por `LOWER(TRIM(email))`;
- ordenação fail-closed: CREATEs substitutos antes dos DROPs globais.

**Classificação após merge de código:** `GOVERNED-MIGRATION-PENDING` até eventual apply remoto autorizado e pós-condições.

## A-06 — Índices Redundantes

**Classificação final: `ACCEPTED-DEBT`.**

A reconciliação contra o bootstrap local canônico `scripts/schema-local.sql` reduziu a suspeita histórica a quatro pares candidatos:

| Tabela | Candidato redundante | Índice equivalente no bootstrap local |
|---|---|---|
| `fichas_sessao` | `idx_fichas_instrutor` | `idx_fichas_sessao_instrutor` |
| `fichas_sessao` | `idx_fichas_sessao_empresa_id` | `idx_fichas_sessao_empresa` |
| `modelos_sessao` | `idx_modelos_codigo` | `idx_modelos_sessao_codigo` |
| `modelos_sessao` | `idx_modelos_deleted` | `idx_modelos_sessao_deleted` |

Essa evidência é do schema/bootstrap **local**, não prova suficiente de coexistência no schema remoto atual. Como A-06 é uma otimização P3 sem defeito operacional demonstrado, a migration destrutiva 0490 foi retirada.

Qualquer cleanup futuro exige inventário read-only de `sqlite_master` no ambiente alvo e prova, para cada par, de:

- mesma tabela;
- mesmas colunas e ordem;
- mesma collation;
- mesma expressão;
- mesmo filtro parcial;
- mesma característica UNIQUE.

Até essa prova existir, manter os índices é a decisão de menor risco.

## Escopo e governança

- 0487 não foi reaberta nem reaplicada;
- 0488 e `/pilot` permanecem intactos;
- nenhum deploy ou remote D1 write foi executado por esta frente;
- scripts operacionais/preflight permanecem fora de `worker-airtrust/migrations`;
- a cadeia canônica é ratcheted até 0489 exclusivamente por A-02.

## Estado de closeout

- **A-02:** código preparado e testado; `GOVERNED-MIGRATION-PENDING`.
- **A-06:** `ACCEPTED-DEBT`.
- **0487:** `CLOSED / APPLIED_VERIFIED`.
