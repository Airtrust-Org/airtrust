# AirTrust — Audit Trail/LGPD v2 Design

**Data:** 2026-06-02
**Branch:** `main`
**HEAD:** `e84c08d2c3979ed46026c171d3ca94f72b2e01fd`
**Modo:** Design/documentação. Nenhuma migration criada, nenhum schema alterado, nenhum código runtime alterado, nenhum banco real consultado.

## 1. Objetivo

Definir o modelo canônico do Audit Trail/LGPD v2 para o AirTrust com foco em:

- LGPD e minimização de dados.
- rastreabilidade por empresa e por request.
- suporte multiempresa com justificativa formal.
- redução de payload bruto persistido.
- retenção e descarte por classe.
- plano seguro de implementação futura sem executar migration neste sprint.

## 2. Problemas atuais

O HEAD atual mantém três writers distintos de auditoria:

- `registrarAuditoria()` grava em `auditoria` com `usuario_id`, `usuario_nome`, `dados_antes`, `dados_depois`, `ip_address`, `user_agent`, sem `empresa_id` ou `request_id` dedicados.
- `logAudit()` grava em `audit_logs` com `user_id`, `action`, `entity_type`, `entity_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, também sem contrato canônico completo.
- `logAuditoria()` e inserções diretas no FRMS gravam em `auditoria_avancada_v2`, mas sem padronização entre módulos.

Lacunas observadas no código e nos documentos atuais:

- `requestId` existe em middleware HTTP, mas não é persistido como coluna canônica de audit trail.
- `support_reason` não existe de forma persistida/canônica.
- `empresa_id`, `actor_role`, `target_empresa_id` e `correlation_id` não são universais.
- ainda há call sites legados capazes de empurrar payload amplo para writers antigos.
- eventos de suporte e mutações administrativas não seguem um único contrato de retenção/classificação.

## 3. Princípios

- Minimização: persistir contexto auditável, não payload bruto.
- Tenant-first: todo evento de negócio deve resolver `empresa_id`.
- Separação ator/alvo: distinguir empresa do ator da empresa afetada.
- Correlação: toda ação síncrona deve carregar `request_id`; ações assíncronas devem carregar `correlation_id`.
- Least privilege para suporte: leitura por padrão, justificativa obrigatória, mutação em fluxo separado.
- Best-effort sem silenciar desenho: a implementação futura pode continuar best-effort para não quebrar a operação, mas com métrica/alerta de falha de writer.
- Retenção por classe: o mesmo prazo não serve para acesso de asset, FRMS, suporte e erro operacional.

## 4. Modelo conceitual

O modelo v2 recomendado é um evento canônico de auditoria orientado a contexto, não uma cópia integral de payload de request/response. Cada evento deve representar:

- quem agiu.
- em nome de qual empresa.
- sobre qual empresa/recurso.
- em qual request/processo.
- qual ação tentou executar.
- se houve sucesso ou falha.
- qual metadado mínimo é necessário para rastreabilidade.
- qual classe de retenção e risco se aplica.

O writer canônico futuro deve absorver os três padrões existentes (`auditoria`, `audit_logs`, `auditoria_avancada_v2`) por compatibilidade gradual, com adapter temporário para rotas legadas.

## 5. Campos obrigatórios propostos

| Campo | Tipo conceitual | Obrigatório | Exemplo sanitizado | Motivo |
|---|---|---|---|---|
| `id` | UUID/string estável | Sim | `aud_01J...` | Identificador único do evento |
| `created_at` | timestamp UTC | Sim | `2026-06-02T15:20:00Z` | Ordenação e trilha temporal |
| `empresa_id` | inteiro | Sim na maioria dos eventos de negócio | `7` | Tenant principal do evento |
| `target_empresa_id` | inteiro nullable | Obrigatório quando ator e alvo divergem | `19` | Rastrear acesso cruzado de suporte/plataforma |
| `actor_user_id` | inteiro nullable | Sim quando houver usuário autenticado | `42` | Identificar o ator humano |
| `actor_empresa_id` | inteiro nullable | Sim quando resolvível | `7` | Diferenciar empresa do ator |
| `actor_role` | enum/string normalizada | Sim quando houver sessão | `admin` | Rastreabilidade de privilégio |
| `actor_type` | enum | Sim | `user`, `support`, `system`, `job` | Diferenciar usuário, suporte e job |
| `support_mode` | enum nullable | Obrigatório em acesso de suporte | `read_only` | Garantir política de suporte |
| `support_reason` | string curta/controlada | Obrigatório em acesso de suporte e leitura sensível | `ticket-ops-4832` | Justificativa operacional |
| `request_id` | string | Sim em fluxo HTTP | `req-123` | Correlação síncrona |
| `correlation_id` | string nullable | Obrigatório em job/lote/processo encadeado | `corr-frms-import-20260602-01` | Correlação assíncrona |
| `ip_hash` | hash/string | Obrigatório quando IP existir | `sha256:...` | Rastrear origem sem persistir IP bruto |
| `user_agent_hash` | hash/string | Obrigatório quando UA existir | `sha256:...` | Minimização de fingerprint |
| `event_category` | enum | Sim | `SUPPORT_ACCESS` | Taxonomia canônica |
| `event_action` | enum/string | Sim | `TENANT_ENTER`, `DOWNLOAD_GRANTED` | Ação específica |
| `entity_type` | enum/string | Sim | `asset`, `usuario`, `frms_report` | Tipo de recurso |
| `entity_id` | string nullable | Obrigatório quando houver recurso individual | `certificado:551` | Rastrear alvo |
| `risk_level` | enum | Sim | `low`, `medium`, `high`, `critical` | Retenção/monitoramento |
| `success` | boolean | Sim | `true` | Distinguir êxito e falha |
| `failure_reason_code` | string nullable | Obrigatório em falha auditável | `TENANT_SCOPE_DENIED` | Falhas agregáveis sem stack |
| `metadata_sanitized_json` | JSON sanitizado | Sim | `{"asset_scope":"fira","request_path":"/api/assets/..."}` | Contexto mínimo permitido |
| `retention_class` | enum | Sim | `SECURITY_LONG` | Aplicar política de retenção |

## 6. Campos proibidos

Nunca persistir no modelo v2:

- senha.
- token.
- cookie.
- CPF.
- documento pessoal bruto.
- ASO bruto.
- relato FRMS completo.
- conteúdo de arquivo.
- dados médicos.
- payload completo sem sanitização.
- stack trace client-facing.
- URL assinada, magic link, invite link ou reset link completos.
- e-mail/nome completo quando o identificador funcional não for estritamente necessário.

## 7. Payload sanitizado

Regras recomendadas para `metadata_sanitized_json`:

- allowlist por categoria de evento, não blacklist aberta.
- truncar strings longas.
- remover campos com nomes sensíveis como `password`, `token`, `cookie`, `authorization`, `cpf`, `documento`, `aso`, `medical`, `sleep`, `sono`, `kss`, `fadiga`.
- guardar hashes ou identificadores internos de IP/User-Agent, não os valores brutos.
- em downloads, guardar tipo de documento e prefixo lógico, não nome de arquivo completo nem URL.
- em FRMS, guardar categoria/resultado/escopo do evento, não respostas clínicas ou operacionais completas do tripulante.

## 8. Relação com tenant/empresa

- `empresa_id` representa o tenant principal do evento.
- `actor_empresa_id` representa a empresa à qual o ator está vinculado na sessão.
- `target_empresa_id` é obrigatório quando o ator está operando sobre outro tenant, especialmente em contexto de suporte/plataforma.
- eventos estritamente internos de plataforma podem omitir `empresa_id` apenas se `actor_type = system` ou `actor_type = support` e houver justificativa explícita.
- eventos sem tenant resolvível devem falhar fechados na implementação futura, salvo operações técnicas internas claramente classificadas.

## 9. Relação com suporte

- `support_mode` deve ser no mínimo `read_only`, `break_glass_read`, `approved_write`.
- `support_reason` deve ser obrigatório para:
  - entrada em tenant de cliente.
  - leitura de documento/certificado/asset privado.
  - consulta de dados FRMS/saúde operacional.
  - impersonação ou diagnóstico equivalente.
- mutações por suporte não devem reutilizar o mesmo caminho de leitura; precisam de evento próprio, aprovação separada e retenção longa.

## 10. Relação com request_id/correlation_id

- `request_id` é obrigatório em todas as rotas HTTP autenticadas e em eventos derivados diretamente de uma request.
- `correlation_id` é obrigatório em importações, cron jobs, jobs FRMS, backfills e fluxos multi-step.
- um mesmo `correlation_id` pode agregar múltiplos `request_id` quando um processo assíncrono nasce de uma request inicial.
- o evento v2 não deve depender apenas de logs de console para correlação.

## 11. Eventos críticos

Categorias consideradas críticas para o v2:

- AUTH e impersonação.
- TENANT_SWITCH e acesso cross-tenant.
- USER_MANAGEMENT e ROLE_PERMISSION.
- SUPPORT_ACCESS.
- DOCUMENT_ACCESS, DOCUMENT_DOWNLOAD e CERTIFICATE_ACCESS.
- FRMS_CHECKIN e acessos/exports FRMS.
- DATA_EXPORT.
- ADMIN_OPERATION.
- D1_OPERATION e SECURITY_GUARD.
- MODULE_GATING_CHANGE.

Para esses eventos, a implementação futura deve auditar sucesso e falha autorizada/negada com `failure_reason_code` padronizado.

## 12. Retenção

O evento v2 deve carregar `retention_class`, não um prazo hardcoded por writer. A classe remete à política draft técnica deste sprint:

- `OPS_SHORT`
- `BUSINESS_MEDIUM`
- `COMPLIANCE_LONG`
- `SECURITY_LONG`
- `LGPD_SENSITIVE`
- `SUPPORT_CONTROLLED`

Prazos exatos dependem de validação jurídica e operacional antes da migration real.

## 13. Observabilidade

Além de persistir o evento, a implementação futura deve permitir:

- busca por `empresa_id`, `target_empresa_id`, `actor_user_id`, `request_id`, `correlation_id`.
- agregação por `event_category`, `success`, `risk_level`, `retention_class`.
- alertas para `SUPPORT_ACCESS`, `IMPERSONATE`, `DATA_EXPORT`, falhas repetidas de autorização e auditoria de assets privados.
- detecção de falha do próprio writer de auditoria sem expor dados sensíveis.

## 14. Plano de implementação futura

Fase recomendada para sprint posterior:

1. Definir tabela/contrato canônico e adapters temporários.
2. Introduzir colunas dedicadas sem quebrar readers antigos.
3. Migrar call sites críticos primeiro: auth, admin, assets, suporte, exports, FRMS.
4. Padronizar `request_id` e `correlation_id`.
5. Introduzir hash de IP/User-Agent no writer central.
6. Adicionar índices e validações de data quality específicas de auditoria.
7. Só então descontinuar uso amplo de payload legado nos três writers antigos.

## 15. Fora do escopo desta fase

- criar migration real.
- alterar schema atual.
- alterar código runtime do worker ou frontend.
- tocar banco real ou R2 real.
- decidir obrigação legal definitiva de retenção.
- alterar RBAC/tenant de produção.
