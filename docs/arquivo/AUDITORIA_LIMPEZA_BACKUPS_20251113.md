# Auditoria de Limpeza de Tabelas de Backup – 13/11/2025

Data/hora: 13/11/2025
Ambiente: Cloudflare D1 (preview remoto)
Responsável: Automação Copilot

---

## Objetivo

Confirmar a remoção completa de tabelas com prefixo `__backup_` e a normalização de chaves estrangeiras para entidades canônicas.

## Ações executadas

1. Criação da tabela temporária `fichas_manobras_historico_new` com FKs corretas:
   - ficha_uuid → fichas_sessao(uuid)
   - participante_id → funcionarios(id)
   - manobra_id → manobras(id)
   - avaliador_id → funcionarios(id)
   - Defaults: `CURRENT_TIMESTAMP` para datas (evita problemas de quoting e mantém compatibilidade).
2. Migração de dados da tabela antiga `fichas_manobras_historico` para a nova tabela.
3. DROP da tabela antiga `fichas_manobras_historico` e RENAME da nova para o nome canônico.
4. DROP da última tabela de backup remanescente: `__backup_funcionarios_backup_20251111`.
5. Verificação de resíduos:
   - SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '\_\_backup%';
   - Resultado: 0 linhas.
6. Verificação de dependências por SQL:
   - SELECT name, type FROM sqlite_master WHERE sql LIKE '%\_\_backup%';
   - Resultado efetivo: nenhum objeto restante referenciando prefixo `__backup_`.

## Resultado

- Nenhuma tabela com prefixo `__backup_` permanece no banco.
- `fichas_manobras_historico` agora referencia apenas entidades canônicas (fichas_sessao, funcionarios, manobras).
- Operações de INSERT/UPDATE/DELETE nessas áreas mantêm integridade referencial sem dependências de artefatos de backup.

## Notas

- Alguns comandos foram ajustados para compatibilidade com shells macOS e quoting do wrangler.
- Recomendado manter este checklist para futuras limpezas pós-backup.
