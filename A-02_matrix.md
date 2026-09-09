
# A-02 Matrix: Natural Keys Tenant-Scoped

| Tabela | Índice / Constraint Atual (Global) | Colunas | UNIQUE | Migration Origem | Substituição Tenant-Scoped | Risco Remoção | Situação |
|--------|------------------------------------|---------|--------|------------------|----------------------------|---------------|----------|
| `qualificacoes_tipos` | `ux_qualificacoes_tipos_codigo` | `codigo` | SIM | 0116 | `idx_qualificacoes_tipos_codigo_empresa_active` (0462) | Baixo (já substituído na 0462) | Criar DROP INDEX |
| `funcionarios` | `ux_funcionarios_cpf` | `cpf` | SIM | 0095, 0116 | Ausente (índices perdidos na refatoração da 0396) | Baixo | Requer preflight e recriação tenant-scoped |
| `funcionarios` | `ux_funcionarios_matricula` | `matricula` | SIM | 0095, 0105 | Ausente | Baixo | Requer recriação tenant-scoped |
| `funcionarios` | `ux_funcionarios_email` | `email` | SIM | 0095 | Ausente | Baixo | Requer recriação tenant-scoped |

## Detalhes
- A migration **0402** efetuou `DROP TABLE qualificacoes_tipos` e recriou com `idx_qualificacoes_tipos_codigo` (também global).
- A migration **0462** fez o drop de `idx_qualificacoes_tipos_codigo` e criou `idx_qualificacoes_tipos_codigo_empresa_active` (tenant-scoped).
- No entanto, a antiga `ux_qualificacoes_tipos_codigo` (da **0116**) pode ter sobrevivido caso o D1 não tenha executado o cascade de índices no `DROP TABLE` ou se foi recriada de forma anômala. A remoção explícita é segura.
- Para `funcionarios`, as restrições globais (`ux_funcionarios_cpf`, etc.) não possuem equivalentes tenant-scoped criadas explicitamente após a **0396**. Será necessário restaurar a proteção *by tenant*.
