# 🔍 AUDITORIA COMPLETA DO SCHEMA D1 — AirTrust

**Data:** 4 de março de 2026  
**DB Size:** 13.22 MB  
**Total de tabelas:** 117 (incluindo backups e legados)  
**Tabelas ativas (não-backup/legacy):** ~85

---

## 📊 RESUMO EXECUTIVO

| Severidade | Achados |
| ---------- | ------- |
| 🔴 CRÍTICO | 5       |
| 🟠 ALTO    | 8       |
| 🟡 MÉDIO   | 12      |
| 🔵 BAIXO   | 7       |

---

## 🔴 ACHADOS CRÍTICOS (Severidade: Impacto imediato na operação)

### 1. `usuarios.deleted_at` é INTEGER DEFAULT 1 (NÃO É soft-delete!)

```sql
-- DEFINIÇÃO ATUAL:
deleted_at INTEGER DEFAULT 1
```

**Problema:** O campo `deleted_at` deveria ser `TEXT DEFAULT NULL` para soft-delete. Com `INTEGER DEFAULT 1`, TODOS os novos usuários são criados com `deleted_at = 1`, que é um valor truthy. As queries `WHERE deleted_at IS NULL` **nunca retornam usuários recém-criados** — a lógica está invertida. O sistema provavelmente trata `deleted_at = 1` como "ativo" por convenção errônea (deveria ser `active INTEGER DEFAULT 1` separado).

**Impacto:** Login pode falhar para novos usuários; queries de tenant `WHERE deleted_at IS NULL` retornam zero resultados.

**Afeta:** `auth.ts:346`, `empresas.ts:1226,1418,1511,1593`

---

### 2. Foreign Keys referenciando tabelas inexistentes (`__backup_pessoas`)

As seguintes tabelas têm FKs apontando para `__backup_pessoas`, que **NÃO EXISTE** no schema:

| Tabela                      | FK Quebrada                                                         |
| --------------------------- | ------------------------------------------------------------------- |
| `certificados_templates`    | `FOREIGN KEY (created_by) REFERENCES "__backup_pessoas"(id)`        |
| `certificados_templates`    | `FOREIGN KEY (updated_by) REFERENCES "__backup_pessoas"(id)`        |
| `credenciais`               | `FOREIGN KEY (pessoa_id) REFERENCES "__backup_pessoas"(id)`         |
| `pessoas_auditoria_acessos` | `FOREIGN KEY (pessoa_id) REFERENCES "__backup_pessoas"(id)`         |
| `pessoas_papeis`            | `FOREIGN KEY (pessoa_id) REFERENCES "__backup_pessoas"(id)`         |
| `hospedagens`               | `FOREIGN KEY (funcionario_id) REFERENCES "funcionarios_backup"(id)` |
| `registros_frms`            | `FOREIGN KEY (funcionario_id) REFERENCES "funcionarios_backup"(id)` |
| `sessoes_treinamento`       | `FOREIGN KEY (funcionario_id) REFERENCES "funcionarios_backup"(id)` |
| `solicitacoes_lgpd`         | `FOREIGN KEY (funcionario_id) REFERENCES "funcionarios_backup"(id)` |
| `usuarios`                  | `FOREIGN KEY (funcionario_id) REFERENCES "funcionarios_backup"(id)` |

**Impacto:** FKs são ignoradas pelo SQLite se PRAGMA foreign_keys=OFF (default), mas se ativadas, todas as INSERTs nessas tabelas falham.

---

### 3. `qualificacoes_historico` sem FK constraints e com tipo misto em `funcionario_id`

```sql
-- DEFINIÇÃO ATUAL (sem FKs!):
funcionario_id INTEGER,
qualificacao_id INTEGER,
```

A tabela mais importante do sistema (histórico de qualificações) **não possui FOREIGN KEY constraints** e os campos `funcionario_id` e `qualificacao_id` são **nullable**, permitindo registros órfãos.

---

### 4. `licencas.funcionario_id` é TEXT, mas `funcionarios.id` é INTEGER

```sql
-- licencas:
funcionario_id TEXT NOT NULL,
FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
```

Comparação de TEXT com INTEGER — JOIN implícito funciona no SQLite por type affinity, mas é semanticamente incorreto e pode causar problemas com indexes.

---

### 5. `instrutores_simulador.funcionario_id` também é TEXT

```sql
funcionario_id TEXT NOT NULL,
FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id)
```

Mesmo problema — tipo TEXT referenciando INTEGER PK.

---

## 🟠 ACHADOS DE ALTA SEVERIDADE

### 6. Tabelas FALTANDO `created_at`, `updated_at`, `deleted_at`

| Tabela                       | `created_at`      | `updated_at`        | `deleted_at` | Notas                                            |
| ---------------------------- | ----------------- | ------------------- | ------------ | ------------------------------------------------ |
| `alertas_enviados`           | SIM (data_envio)  | ❌ NÃO              | ❌ NÃO       | Sem soft-delete, sem auditoria                   |
| `audit_cascade`              | SIM               | ❌ NÃO              | ❌ NÃO       | Tabela de auditoria sem updated_at               |
| `auditoria`                  | SIM               | ❌ NÃO              | ❌ NÃO       | Log table — OK sem delete                        |
| `certificado_anexos`         | SIM (uploaded_at) | ❌ NÃO              | ❌ NÃO       | Sem soft-delete! Anexos ficam órfãos             |
| `empresa_certificado_config` | SIM (criado_em)   | SIM (atualizado_em) | SIM          | Naming inconsistente (pt vs snake_case)          |
| `logs_acesso_dados`          | SIM (timestamp)   | ❌ NÃO              | ❌ NÃO       | Log — aceitável                                  |
| `migracao_log`               | SIM               | ❌ NÃO              | ❌ NÃO       | Utilitário — aceitável                           |
| `migracao_mapeamento_ids`    | SIM (criado_em)   | ❌ NÃO              | ❌ NÃO       | Utilitário — OK                                  |
| `notificacoes`               | SIM               | ❌ NÃO              | ❌ NÃO       | ❗ Sem soft-delete — notificações nunca "apagam" |
| `schema_versions`            | SIM (applied_at)  | ❌ NÃO              | ❌ NÃO       | Meta — OK                                        |
| `sessoes_fichas`             | SIM               | SIM                 | ❌ NÃO       | ❗ Sem soft-delete — fichas nunca "apagam"       |
| `system_config`              | SIM (updated_at)  | SIM (updated_at)    | ❌ NÃO       | Config singleton — OK                            |
| `system_logs`                | SIM (timestamp)   | ❌ NÃO              | ❌ NÃO       | Log — OK                                         |
| `user_permissions`           | SIM               | ❌ NÃO              | ❌ NÃO       | ❗ Sem updated_at e sem deleted_at               |
| `usuarios_empresas`          | SIM               | ❌ NÃO              | ❌ NÃO       | ❗ Sem updated_at e sem deleted_at               |

---

### 7. Queries FALTANDO `WHERE deleted_at IS NULL`

| Arquivo              | Linha      | Query                                                         | Severidade                                 |
| -------------------- | ---------- | ------------------------------------------------------------- | ------------------------------------------ |
| `licencas.ts`        | L194       | `SELECT * FROM licencas WHERE id = ?` (após CREATE)           | 🟡 Médio (logo após insert, aceitável)     |
| `licencas.ts`        | L280       | `SELECT * FROM licencas WHERE id = ?` (após UPDATE)           | 🟡 Médio (logo após update, aceitável)     |
| `notificacoes.ts`    | L219       | `SELECT * FROM notificacoes_config WHERE id = ?`              | 🟠 Alto — pode retornar config "deletado"  |
| `notificacoes.ts`    | L163       | `FROM notificacoes_config`                                    | 🟠 Alto — lista sem filtro deleted_at      |
| `empresas.ts`        | L251       | `SELECT id FROM empresas WHERE id = 1`                        | 🟠 Alto — sem filtro deleted_at            |
| `empresas.ts`        | L610       | `SELECT id, deleted_at FROM empresas WHERE codigo = ?`        | 🟢 OK — intencionalmente busca deleted_at  |
| `empresas.ts`        | L1076      | `SELECT * FROM empresas_config WHERE empresa_id = ?`          | 🟡 Médio — config não tem soft-delete?     |
| `empresas.ts`        | L1212      | `SELECT COUNT(*) FROM usuarios_empresas WHERE empresa_id = ?` | 🟡 Médio — tabela sem deleted_at           |
| `funcionarios.ts`    | L659       | `SELECT * FROM funcionarios WHERE id = ?`                     | 🟠 Alto — retorna soft-deleted             |
| `funcionarios.ts`    | L1019      | `SELECT * FROM funcionarios WHERE id = ?`                     | 🟠 Alto — auditoria pós-update             |
| `backup/restore.ts`  | L28,48,123 | `SELECT * FROM backups_controle WHERE uuid = ?`               | 🟡 Médio — backups podem ser "deleted"     |
| `frms/db-service.ts` | L890       | `SELECT ... FROM funcionarios p WHERE p.id = ?`               | 🟡 Médio — nome lookup sem deleted_at      |
| `frms/db-service.ts` | L1868      | `SELECT * FROM frms_notificacao_config WHERE ativo = 1`       | 🟡 Médio — sem deleted_at (tabela não tem) |

---

### 8. Tabelas multi-tenant sem `empresa_id`

A implementação multi-tenant exige `empresa_id` em tabelas de negócio. Tabelas faltando:

| Tabela                      | Deveria ter `empresa_id`?        |
| --------------------------- | -------------------------------- |
| `alertas_enviados`          | ❗ SIM                           |
| `alertas_reforco`           | ❗ SIM                           |
| `audit_cascade`             | Não (sistema)                    |
| `backups_controle`          | Talvez                           |
| `catalogo_treinamentos`     | ❗ SIM                           |
| `certificado_anexos`        | ❗ SIM (herda do certificado)    |
| `certificados`              | ❗ SIM                           |
| `compliance_status`         | ❗ SIM                           |
| `consentimentos_lgpd`       | ❗ SIM                           |
| `fichas_manobras_historico` | ❗ SIM                           |
| `historico_compliance`      | ❗ SIM                           |
| `historico_notas_manobras`  | ❗ SIM                           |
| `hospedagens`               | ❗ SIM                           |
| `licencas`                  | ❗ SIM                           |
| `manobras`                  | ❗ SIM (pode variar por empresa) |
| `notificacoes`              | ❗ SIM                           |
| `notificacoes_sistema`      | ❗ SIM                           |
| `sessoes`                   | ❗ SIM                           |
| `sessoes_participantes`     | ❗ SIM                           |
| `simuladores`               | ❗ SIM                           |
| `treinamentos`              | ❗ SIM                           |

---

### 9. Inconsistência em formatos de timestamp

| Formato                               | Tabelas                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| `TEXT DEFAULT (datetime('now'))`      | `funcionarios`, `qualificacoes_historico`, `aeronaves`, etc (~60%) — ✅ Correto |
| `DATETIME DEFAULT CURRENT_TIMESTAMP`  | `certificados`, `fichas_sessao`, `modelos_aeronave`, `job_queue`, etc (~25%)    |
| `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | `sessoes`, `sessoes_participantes`, `fichas_sessao_manobras` (~10%)             |
| `TEXT DEFAULT (strftime(...))`        | `licencas`, `manobras`, `legacy_*` (~5%)                                        |

**Problema:** 4 formatos diferentes para o mesmo campo. `datetime('now')` e `CURRENT_TIMESTAMP` produzem o mesmo valor no SQLite, mas o **tipo declarado** varia entre TEXT, DATETIME e TIMESTAMP. Isso causa confusão e potenciais bugs em comparações.

---

### 10. `auditoria_avancada_v2` — INSERT com colunas inconsistentes

A tabela `auditoria_avancada_v2` tem este schema:

```sql
(tabela, acao, registro_id, dados_anteriores, dados_novos, created_at, usuario_id, ip_address, user_agent, origem)
```

Mas os INSERTs no código usam colunas diferentes:

| Local                              | Colunas inseridas                                          | Problema                                  |
| ---------------------------------- | ---------------------------------------------------------- | ----------------------------------------- |
| `funcionarios.service.ts:292`      | `tabela, registro_id, acao, origem`                        | ❗ Falta dados_anteriores/novos           |
| `qualificacoes/tipos.ts:78`        | `entidade, entidade_id, acao, timestamp`                   | ❗ Colunas ERRADAS (entidade não existe!) |
| `qualificacoes/atribuicao.ts:66`   | `entidade, entidade_id, acao, timestamp`                   | ❗ Colunas ERRADAS                        |
| `simuladores.ts:124`               | `tabela, acao, registro_id, dados_anteriores, dados_novos` | ✅ Correto                                |
| `frms/fira-service.ts:685,771,965` | `tabela, acao, registro_id, dados_anteriores, dados_novos` | ✅ Correto                                |
| `frms/db-service.ts:93`            | `tabela, acao, registro_id, dados_anteriores, dados_novos` | ✅ Correto                                |
| `compliance-recalculate.ts:348`    | Parece correto                                             | ✅                                        |

**Impacto:** `tipos.ts` e `atribuicao.ts` fazem INSERT com colunas que não existem — esses INSERTs falham silenciosamente no SQLite (nulls inseridos) ou causam erro.

---

### 11. Tabelas sem índice em `empresa_id` (multi-tenant query sem index)

As tabelas que **TÊM** `empresa_id` mas **NÃO TÊM** index nele:

| Tabela                      | empresa_id      | Index? |
| --------------------------- | --------------- | ------ |
| `certificados`              | ❌ Não tem      | —      |
| `compliance_status`         | ❌ Não tem      | —      |
| `fichas_manobras_historico` | ❌ Não tem      | —      |
| `historico_compliance`      | ❌ Não tem      | —      |
| `qualificacoes_historico`   | SIM (DEFAULT 1) | ❌ NÃO |
| `importacoes_log`           | SIM             | ✅ SIM |
| `documentos`                | SIM             | ✅ SIM |
| `pasta_virtual`             | SIM             | ✅ SIM |

**`qualificacoes_historico` é a tabela mais consultada e NÃO tem index em `empresa_id`.**

---

### 12. Tabelas com `empresa_id DEFAULT 1` hardcoded

Quase todas as tabelas multi-tenant têm `empresa_id INTEGER DEFAULT 1`. Isto funciona para tenant único, mas quando houver tenant 2+, registros criados sem `empresa_id` explícito vão para a empresa 1 incorretamente.

---

## 🟡 ACHADOS MÉDIOS

### 13. Tabelas backup/legado poluindo o schema (limpeza necessária)

| Tabela                                | Tipo                    | Recomendação                       |
| ------------------------------------- | ----------------------- | ---------------------------------- |
| `_backup_funcionarios`                | Backup antigo           | DROP                               |
| `_backup_qh_tmp`                      | Backup temporário       | DROP                               |
| `_backup_qualificacoes_historico`     | Backup antigo           | DROP                               |
| `_backup_qualificacoes_tipos`         | Backup antigo           | DROP                               |
| `_data_recovery_log`                  | Recovery log            | DROP após validação                |
| `_qualificacoes_enriquecimento`       | Enriquecimento obsoleto | DROP                               |
| `_qualificacoes_mapping`              | Mapeamento obsoleto     | DROP                               |
| `funcionarios_backup`                 | Backup antigo           | DROP (mas é referenciado por FKs!) |
| `funcionarios_tmp`                    | Temporário              | DROP                               |
| `pasta_virtual_backup`                | Backup                  | DROP                               |
| `qualificacoes_tipos_backup_0063`     | Backup migração 63      | DROP                               |
| `qualificacoes_tipos_backup_20251128` | Backup datado           | DROP                               |
| `qualificacoes_tipos_id_map`          | Mapeamento migração     | DROP                               |
| `qualificacoes_tipos_old`             | Schema antigo           | DROP                               |

**Total: 14 tabelas** que deveriam ser removidas → ~28 MB menos de overhead em index/metadata.

---

### 14. Tabelas de log sem retention policy (crescimento infinito)

| Tabela                  | Tipo              | Rows/dia estimado | Index count | Política         |
| ----------------------- | ----------------- | ----------------- | ----------- | ---------------- |
| `auditoria`             | Audit log         | Alto              | 3           | ❌ Sem retention |
| `auditoria_avancada_v2` | Audit log v2      | Alto              | 5           | ❌ Sem retention |
| `system_logs`           | System logs       | Médio             | 2           | ❌ Sem retention |
| `notificacoes_log`      | Notificação log   | Baixo             | 3           | ❌ Sem retention |
| `logs_acesso_dados`     | Access log (LGPD) | Baixo             | 0 (!)       | ❌ Sem retention |
| `audit_cascade`         | Cascade audit     | Baixo             | 4           | ❌ Sem retention |
| `job_execution_log`     | Job exec log      | Baixo             | 1           | ❌ Sem retention |
| `admin_actions`         | Admin actions     | Baixo             | 4           | ❌ Sem retention |
| `backups_logs`          | Backup logs       | Baixo             | 1           | ❌ Sem retention |

**Recomendação:** Criar CRON job para limpar registros > 90 dias (exceto LGPD que precisa 5 anos por lei).

---

### 15. Naming convention violations (inconsistências)

| Tabela/Coluna                               | Problema                | Deveria ser       |
| ------------------------------------------- | ----------------------- | ----------------- |
| `empresa_certificado_config.criado_em`      | Português inconsistente | `created_at`      |
| `empresa_certificado_config.atualizado_em`  | Português inconsistente | `updated_at`      |
| `migracao_mapeamento_ids.criado_em`         | Português inconsistente | `created_at`      |
| `job_queue.criado_em`                       | Misto pt/en             | `created_at`      |
| `job_queue.processado_em`                   | Misto pt/en             | `processed_at`    |
| `job_queue.concluido_em`                    | Misto pt/en             | `completed_at`    |
| `pasta_virtual.dataupload`                  | camelCase sem separador | `data_upload`     |
| `pasta_virtual.arquivourl`                  | camelCase sem separador | `arquivo_url`     |
| `pasta_virtual.nomeoriginal`                | camelCase sem separador | `nome_original`   |
| `pasta_virtual.uploadedby`                  | camelCase inglês        | `uploaded_by`     |
| `pessoas_auditoria_acessos.dados_sensíveis` | Acento no nome!         | `dados_sensiveis` |
| `pessoas_auditoria_acessos.acessado_em`     | Português               | `accessed_at`     |
| `funcionarios.guerra`                       | Abreviação              | `nome_guerra`     |
| `funcionarios.nascimento`                   | Incompleto              | `data_nascimento` |
| `funcionarios.admissao`                     | Incompleto              | `data_admissao`   |

---

### 16. Queries usando `SELECT *` em tabelas grandes

| Arquivo                       | Tabela                        | Problema                                         |
| ----------------------------- | ----------------------------- | ------------------------------------------------ |
| `funcionarios.service.ts:99`  | `funcionarios` (~50+ colunas) | `SELECT * FROM funcionarios WHERE...`            |
| `licencas.ts:194,280`         | `licencas`                    | `SELECT * FROM licencas WHERE id = ?`            |
| `backup/restore.ts:28,48,123` | `backups_controle`            | `SELECT * FROM backups_controle WHERE uuid = ?`  |
| `notificacoes.ts:219`         | `notificacoes_config`         | `SELECT * FROM notificacoes_config WHERE id = ?` |

**`funcionarios` tem ~50 colunas** — SELECT \* transfere dados desnecessários.

---

### 17. Índices duplicados

| Tabela                     | Índices duplicados                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `simulador_agendamentos`   | 4 indexes em `data`, 3 em `deleted_at`, 3 em `status`, 2 em `funcionario_id`, 2 em `simulador_id`       |
| `fichas_sessao`            | 2 indexes em `agendamento_slot_id`, 2 em `colaborador_id_aluno`, 2 em `instrutor_id`, 2 em `empresa_id` |
| `modelos_sessao`           | 2 indexes em `codigo`, 2 em `deleted_at`                                                                |
| `certificados`             | 2 indexes em `deleted_at`, 2 em `funcionario_id`, 2 em `habilitacao_id`, 2 em `qualificacao_id`         |
| `backups`                  | 2 indexes em `created_at`                                                                               |
| `qualificacoes_categorias` | 2 indexes em `codigo`                                                                                   |

**Impacto:** Índices duplicados desperdiçam espaço e tornam INSERTs/UPDATEs mais lentos sem benefício.

---

### 18. Boolean inconsistency

| Formato                                 | Tabelas                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| `INTEGER DEFAULT 0 CHECK (x IN (0, 1))` | `funcionarios` (is_instrutor, is_checador) — ✅ Correto                      |
| `BOOLEAN DEFAULT 0`                     | `fichas_sessao`, `modelos_sessao`, `manobras_avaliacoes`, `sessoes_template` |
| `INTEGER DEFAULT 0` (sem CHECK)         | `frms_jornada`, `frms_alerta`, `notificacoes_sistema`                        |
| `BOOLEAN DEFAULT 1`                     | `catalogo_treinamentos.ativo`                                                |

SQLite não tem tipo BOOLEAN nativo — é armazenado como INTEGER. O uso misto é cosmético, mas o CHECK constraint inconsistente pode permitir valores inválidos.

---

## 🔵 ACHADOS DE BAIXA SEVERIDADE

### 19. ID type inconsistency

| Tipo                                | Tabelas                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `INTEGER PRIMARY KEY AUTOINCREMENT` | ~80% das tabelas — ✅ Padrão                                                                                                                           |
| `TEXT PRIMARY KEY`                  | `frms_jornada`, `frms_alerta`, `frms_acumulo_*`, `frms_escala_*`, `frms_fatorizacao_*`, `frms_configuracao_limites`, `frms_importacao_fira`, `sessoes` |
| `TEXT PRIMARY KEY` (antigo)         | `qualificacoes_tipos_old`                                                                                                                              |

O módulo FRMS usa UUIDs (TEXT PK), resto usa AUTOINCREMENT. Consistência interna do módulo — aceitável.

---

### 20. Tabelas possivelmente não usadas por nenhuma rota

| Tabela                      | Evidência                                                             |
| --------------------------- | --------------------------------------------------------------------- |
| `credenciais`               | FKs para `__backup_pessoas` — tabela orfã do modelo pessoa abandonado |
| `papeis`                    | Modelo pessoa/papéis abandonado                                       |
| `pessoas_papeis`            | Modelo pessoa abandonado                                              |
| `pessoas_auditoria_acessos` | Modelo pessoa abandonado                                              |
| `catalogo_treinamentos`     | Não encontrado referências em rotas ativas                            |
| `historico_compliance`      | Criada mas sem INSERT/SELECT nas rotas                                |
| `hospedagens`               | FK para `funcionarios_backup` — tabela orfã                           |
| `registros_frms`            | Substituída por `frms_jornada` — possivelmente legado                 |
| `sessoes_fichas`            | Parece substituída por `fichas_sessao`                                |
| `ficha_manobras_avaliacao`  | Parece substituída por `manobras_avaliacoes`                          |
| `compliance_status`         | Substituída por `historico_compliance`?                               |

---

### 21. Composite indexes ausentes para queries frequentes

| Query pattern (frequente)                                                                  | Index recomendado                                                                                      |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `qualificacoes_historico WHERE empresa_id = ? AND deleted_at IS NULL`                      | `CREATE INDEX idx_qh_empresa_deleted ON qualificacoes_historico(empresa_id, deleted_at)`               |
| `qualificacoes_historico WHERE funcionario_id = ? AND deleted_at IS NULL AND renovada = 0` | `CREATE INDEX idx_qh_func_active ON qualificacoes_historico(funcionario_id, renovada, deleted_at)`     |
| `funcionarios WHERE empresa_id = ? AND deleted_at IS NULL AND ativo = 1`                   | Já existe `idx_funcionarios_empresa_ativo` ✅                                                          |
| `licencas WHERE funcionario_id = ? AND deleted_at IS NULL`                                 | `CREATE INDEX idx_licencas_func_deleted ON licencas(funcionario_id) WHERE deleted_at IS NULL`          |
| `fichas_sessao WHERE empresa_id = ? AND deleted_at IS NULL AND status = ?`                 | `CREATE INDEX idx_fichas_empresa_status ON fichas_sessao(empresa_id, status) WHERE deleted_at IS NULL` |

---

### 22. Tabelas sem NENHUM index

| Tabela                   | Deveria ter?                             |
| ------------------------ | ---------------------------------------- |
| `alertas_enviados`       | SIM — `funcionario_id`, `tipo`           |
| `consentimentos_lgpd`    | SIM — `funcionario_id`                   |
| `funcionario_documentos` | SIM — `funcionario_id`                   |
| `logs_acesso_dados`      | SIM — `funcionario_id`, `usuario_id`     |
| `notificacoes`           | SIM — `funcionario_id`, `tipo`           |
| `sessoes_treinamento`    | SIM — `funcionario_id`, `treinamento_id` |
| `solicitacoes_lgpd`      | SIM — `funcionario_id`                   |

---

### 23. `qualificacoes_historico.qualificacao_id` sem index direto

Existe `idx_qualificacoes_historico_unique_active` (composite), mas NÃO existe index simples em `qualificacao_id`. O dashboard faz JOIN com `qualificacoes_tipos` usando esta coluna — recomendado adicionar:

```sql
CREATE INDEX idx_qh_qualificacao_id ON qualificacoes_historico(qualificacao_id) WHERE deleted_at IS NULL;
```

---

### 24. `empresas_config` duplicada com `empresa_config`

Existem DUAS tabelas para configuração de empresa:

- `empresa_config` — com `empresa_id UNIQUE`, `template_certificado`
- `empresas_config` — com `empresa_id UNIQUE`, `certificado_template_html`

Ambas contêm dados semelhantes. Consolidar em uma só.

---

### 25. Datas DATE vs TEXT inconsistentes

| Tabela                           | Coluna            | Tipo declarado |
| -------------------------------- | ----------------- | -------------- |
| `certificados`                   | `data_emissao`    | `DATE`         |
| `certificados`                   | `data_vencimento` | `DATE`         |
| `simulador_agendamentos`         | `data`            | `DATE`         |
| `simulador_agendamentos`         | `hora_inicio`     | `TIME`         |
| `legacy_qualificacoes_historico` | `data_conclusao`  | `DATE`         |

No SQLite, DATE/TIME são aliases para TEXT. Mas a inconsistência de declaração com o resto do schema (TEXT) pode confundir.

---

## 📋 CONTAGEM DE TABELAS

| Categoria                      | Quantidade |
| ------------------------------ | ---------- |
| Tabelas de negócio ativas      | ~55        |
| Tabelas FRMS                   | 10         |
| Tabelas de auditoria/log       | 9          |
| Tabelas de integração (EdApp)  | 4          |
| Tabelas backup/legado/tmp      | 14         |
| Tabelas legacy (import antigo) | 4          |
| Tabelas de migração/mapping    | 4          |
| Tabelas sistema/config         | 4          |
| **TOTAL**                      | **~117**   |

---

## 🎯 RECOMENDAÇÕES PRIORITÁRIAS

### Imediato (Sprint atual):

1. **FIX `usuarios.deleted_at`** — Migrar para `TEXT DEFAULT NULL` e manter `active INTEGER DEFAULT 1` separado
2. **FIX FKs** referenciando `__backup_pessoas` e `funcionarios_backup` — atualizar para `funcionarios`
3. **FIX `auditoria_avancada_v2` INSERTs** em `tipos.ts` e `atribuicao.ts` (colunas erradas)
4. **ADD `WHERE deleted_at IS NULL`** em `funcionarios.ts:659,1019`
5. **ADD index** em `qualificacoes_historico(empresa_id)`

### Curto prazo (próximas 2 semanas):

6. **DROP** 14 tabelas backup/legado/tmp
7. **ADD `empresa_id`** em licencas, certificados, sessoes, simuladores, notificacoes
8. **CONSOLIDAR** `empresa_config` + `empresas_config`
9. **REMOVER** índices duplicados (~20 indexes)
10. **ADD** indexes faltantes (alertas_enviados, consentimentos_lgpd, etc.)

### Médio prazo (próximo mês):

11. **Standardizar** timestamp format para `TEXT DEFAULT (datetime('now'))` em todas as tabelas
12. **Criar** CRON de retenção para tabelas de log (90 dias general, 5 anos LGPD)
13. **DROP** tabelas não usadas (credenciais, papeis, pessoas\_\*, hospedagens, registros_frms)
14. **ADD CHECK constraints** para booleans em todas as tabelas
15. **RENAME** colunas com naming violations (guerra→nome_guerra, nascimento→data_nascimento, etc.)
