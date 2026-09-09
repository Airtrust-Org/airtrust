# A-02 Matrix: Natural Keys Tenant-Scoped

| Tabela | Chave | Contrato runtime atual | Proteção tenant-scoped proposta | Estado |
|---|---|---|---|---|
| `funcionarios` | `cpf` | CPF é normalizado para dígitos e comparado por igualdade exata dentro de `empresa_id` | `UNIQUE (empresa_id, cpf)` para registros ativos/não vazios | 0489 preparada; apply remoto exige preflight read-only |
| `funcionarios` | `matricula` | CRUD sanitiza whitespace e compara `matricula = ?`; não há contrato atual de case-folding | `UNIQUE (empresa_id, matricula)` para registros ativos/não vazios | 0489 preparada; case-sensitive deliberadamente preservado |
| `funcionarios` | `email` | CRUD grava lowercase; vínculo usuário↔funcionário usa `LOWER(TRIM(email))` | `UNIQUE (empresa_id, LOWER(TRIM(email)))` para registros ativos/não vazios | 0489 preparada; semântica alinhada ao vínculo canônico |
| `qualificacoes_tipos` | `codigo` | Já existe substituição tenant-scoped pela 0462 | `idx_qualificacoes_tipos_codigo_empresa_active` | Fechado; `DROP IF EXISTS ux_qualificacoes_tipos_codigo` é apenas hardening defensivo |

## Evidência e limites

- As antigas constraints globais de `funcionarios` existiam historicamente e foram perdidas em rebuilds posteriores.
- O runtime atual já trata CPF e matrícula no escopo do tenant; a 0489 move essa invariável para o banco sem restaurar unicidade global.
- O e-mail é a única chave em que a própria identidade canônica usa normalização case/trim.
- Nenhum apply remoto é autorizado por este artefato. O script `scripts/validation/0489_a02_natural_keys_tenant_scoped_preflight.sql` deve retornar zero conflitos nas três chaves antes de qualquer aplicação governada.
