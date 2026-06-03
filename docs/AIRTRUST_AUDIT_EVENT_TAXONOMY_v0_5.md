# AirTrust — Audit Event Taxonomy v0.5

**Data:** 2026-06-02
**Branch:** `main`
**HEAD:** `e84c08d2c3979ed46026c171d3ca94f72b2e01fd`
**Modo:** Documento de desenho. Sem implementação runtime.

## Objetivo

Definir uma taxonomia mínima e consistente para o Audit Trail/LGPD v2. Cada categoria abaixo descreve o tipo de evento, severidade base, exigência de tenant, justificativa de suporte, retenção e limites de metadata.

## Convenções

- `empresa_id obrigatório?`: significa obrigatório para o evento canônico, salvo operação interna puramente técnica.
- `support_reason obrigatório?`: obrigatório quando o ator for suporte/plataforma ou quando houver acesso sensível em tenant de cliente.
- `metadata permitida`: apenas contexto mínimo.
- `metadata proibida`: dados pessoais/sensíveis ou payload bruto.

| Categoria | Evento | Severidade | Auditar sucesso? | Auditar falha? | `empresa_id` obrigatório? | `support_reason` obrigatório? | `retention_class` | Metadata permitida | Metadata proibida |
|---|---|---|---|---|---|---|---|---|---|
| `AUTH` | login, logout, refresh, impersonate, token_denied | High | Sim | Sim | Sim quando houver tenant; senão nullable | Sim em impersonação/suporte | `SECURITY_LONG` | método, origem, request_id, actor_role, resultado | token, cookie, senha, JWT, stack |
| `TENANT_SWITCH` | tenant_enter, tenant_leave, tenant_denied | High | Sim | Sim | Sim | Sim para suporte/plataforma | `SUPPORT_CONTROLLED` | tenant origem/alvo, actor_role, request_id | payload de sessão completo |
| `USER_MANAGEMENT` | user_create, user_disable, password_reset, invite_resend | High | Sim | Sim | Sim | Sim se suporte executar | `COMPLIANCE_LONG` | target_user_id, role destino, status | senha, hash, email bruto quando dispensável |
| `ROLE_PERMISSION` | role_change, permission_grant, permission_revoke | Critical | Sim | Sim | Sim | Sim se fora da empresa do ator | `SECURITY_LONG` | role anterior/nova, escopo, request_id | policy payload completo |
| `SUPPORT_ACCESS` | tenant_diagnostic_enter, sensitive_read, support_exit | Critical | Sim | Sim | Sim | Sim | `SUPPORT_CONTROLLED` | ticket, motivo, modo suporte, recurso lógico | conteúdo acessado, PII, notas livres extensas |
| `DOCUMENT_ACCESS` | list_private_docs, preview_private_doc | Medium | Sim | Sim | Sim | Sim para suporte | `BUSINESS_MEDIUM` | tipo de documento, entidade, autorização | arquivo, nome real do arquivo, URL assinada |
| `DOCUMENT_DOWNLOAD` | download_granted, download_denied | High | Sim | Sim | Sim | Sim para suporte | `COMPLIANCE_LONG` | tipo, entidade, tamanho aproximado, request_id | conteúdo do arquivo, link assinado |
| `CERTIFICATE_ACCESS` | certificate_view, certificate_download | High | Sim | Sim | Sim | Sim para suporte | `COMPLIANCE_LONG` | tipo certificado, target_user_id | PDF/certificado bruto |
| `QUALIFICATION_CHANGE` | qualification_create, update, renew, delete | High | Sim | Sim | Sim | Sim se suporte operar | `COMPLIANCE_LONG` | ids, status anterior/novo, validade | anexos, documentos pessoais |
| `SIMULATOR_SESSION_CHANGE` | session_create, reschedule, conclude, cancel | Medium | Sim | Sim | Sim | Sim se suporte operar | `BUSINESS_MEDIUM` | session_id, aeronave, data, status | payload completo de participantes |
| `FRMS_CHECKIN` | checkin_submit, fit_for_duty_decision, manager_review | Critical | Sim | Sim | Sim | Sim para suporte | `LGPD_SENSITIVE` | categoria do evento, resultado, request_id, actor_type | respostas FRMS completas, sono, KSS, relato clínico |
| `EVD_CHANGE` | evd_publish, evd_revision, justificativa_write | High | Sim | Sim | Sim | Sim se suporte operar | `COMPLIANCE_LONG` | revisao, checksum, decisão | `payload_json` completo, escala integral |
| `SCHEDULE_CHANGE` | escala_create, allocate, deallocate, publish | High | Sim | Sim | Sim | Sim se suporte operar | `BUSINESS_MEDIUM` | escala_id, status, alvo lógico | payload operacional completo |
| `ASSET_ACCESS` | private_asset_get, blocked_asset_get | Medium | Sim | Sim | Sim | Sim para suporte | `BUSINESS_MEDIUM` | prefixo lógico, categoria asset, cache_policy | nome do arquivo, URL, conteúdo |
| `ADMIN_OPERATION` | reset, backfill, purge_attempt_blocked | Critical | Sim | Sim | Sim quando houver tenant; interno se não houver | Sim se afetar tenant de cliente | `SECURITY_LONG` | módulo, contagem, request_id, motivo técnico | erro interno completo, SQL bruto |
| `DATA_EXPORT` | export_start, export_finish, export_denied | Critical | Sim | Sim | Sim | Sim para suporte | `LGPD_SENSITIVE` | tipo export, filtros resumidos, contagem aproximada | linhas exportadas, arquivo, PII por linha |
| `D1_OPERATION` | readonly_check, blocked_remote_write, maintenance_plan | High | Sim | Sim | Não necessariamente | Não | `SECURITY_LONG` | script logical name, modo, actor_type | SQL completo destrutivo, credenciais |
| `MODULE_GATING_CHANGE` | module_enable, module_disable, beta_gate_change | High | Sim | Sim | Sim | Sim se plataforma alterar tenant de cliente | `COMPLIANCE_LONG` | módulo, estado anterior/novo | payload de configuração completo |
| `SECURITY_GUARD` | guard_block, policy_violation, suspicious_access | Critical | Sim | Sim | Nullable | Não por padrão | `SECURITY_LONG` | regra acionada, request_id, path | payload original sensível |

## Observações

- `AUTH`, `ROLE_PERMISSION`, `SUPPORT_ACCESS`, `DATA_EXPORT` e `FRMS_CHECKIN` devem receber monitoramento reforçado.
- `FRMS_CHECKIN` e `DATA_EXPORT` exigem metadata extremamente restrita.
- `SUPPORT_ACCESS` não substitui eventos de domínio; ele complementa o evento de domínio com contexto de suporte.
