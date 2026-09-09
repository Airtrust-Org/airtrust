# A-02 Matrix: Natural Keys Tenant-Scoped

| Tabela | Índice / Constraint Atual (Global) | Colunas | UNIQUE | Migration Origem | Substituição Tenant-Scoped | Risco Remoção | Situação |
|--------|------------------------------------|---------|--------|------------------|----------------------------|---------------|----------|
| `qualificacoes_tipos` | `ux_qualificacoes_tipos_codigo` | `codigo` | SIM | 0116 | `idx_qualificacoes_tipos_codigo_empresa_active` (0462) | Nulo | Não existe mais. DROP IF EXISTS apenas como hardening defensivo. |
| `funcionarios` | `ux_funcionarios_cpf` | `cpf` | SIM | 0095, 0116 | Ausente | Baixo | Requer recriação tenant-scoped (0489) |
| `funcionarios` | `idx_funcionarios_cpf` | `cpf` | SIM | 0105 | Ausente | Baixo | Requer recriação tenant-scoped (0489) |
| `funcionarios` | `ux_funcionarios_matricula` | `matricula` | SIM | 0095, 0105 | Ausente | Baixo | Requer recriação tenant-scoped (0489) |
| `funcionarios` | `ux_funcionarios_email` | `email` | SIM | 0095 | Ausente | Baixo | Requer recriação tenant-scoped (0489) |

## Detalhes

- O índice `ux_qualificacoes_tipos_codigo` **não sobreviveu** ao `DROP TABLE` da tabela na migration 0402. Ele não existe no schema final (conforme comprovado em `schema-local.sql`). O script preflight não apontará sua existência e o seu `DROP IF EXISTS` atua unicamente como hardening defensivo, caso algum banco fora do trilho canônico o tenha mantido de forma não-oficial.
- A tabela `funcionarios` perdeu suas constraints únicas nas chaves naturais (`cpf`, `matricula`, `email`) na wave 1 de hardening (`0396`) via `DROP TABLE`. Os índices `tenant-scoped` não foram reestabelecidos, deixando essas chaves sem proteção `UNIQUE` parcial (por tenant e ativo). A migration 0489 restaura essas proteções.
