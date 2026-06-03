# AirTrust - RBAC + Audit Trail v2 Test Matrix

**Data:** 2026-06-02
**Branch:** `main`
**HEAD:** `32ca1f278a81a610fbc3c9821eddf0c5518dbb69`
**Modo:** Matriz conceitual de testes obrigatorios para implementacao futura.

| Caso | Tipo | Pre-condicao | Acao | Esperado | Audit obrigatorio | Bloqueia release? |
|---|---|---|---|---|---|---|
| `platform_admin` grant | Integracao | papel persistido habilitado | conceder `platform_admin` | grant persistido, sem impacto em tenant roles | `PLATFORM_ROLE_GRANTED` | Sim |
| `platform_admin` revoke | Integracao | grant existente | revogar papel | acesso removido e trilha registrada | `PLATFORM_ROLE_REVOKED` | Sim |
| `tenant_admin` != `platform_admin` | Autorizacao | usuario `tenant_admin` sem papel de plataforma | acessar rota de plataforma | negado fail-closed | negacao de `ROLE_PERMISSION` ou equivalente | Sim |
| `support_read_only` session start | Integracao | grant de suporte + tenant permitido | iniciar sessao de suporte | sessao inicia somente com `support_reason` | `SUPPORT_SESSION_STARTED` | Sim |
| suporte sem `support_reason` | Negativo | grant de suporte existente | iniciar sessao sem justificativa | negado | `SUPPORT_SENSITIVE_VIEW_DENIED` ou negacao equivalente | Sim |
| suporte fora do tenant aprovado | Negativo | grant de suporte para outro tenant | tentar acesso cross-tenant | negado | `TENANT_SWITCH`/`SUPPORT_SENSITIVE_VIEW_DENIED` | Sim |
| suporte sem mutacao | Negativo | sessao de suporte ativa | chamar rota write | negado | `SUPPORT_MUTATION_DENIED` | Sim |
| support sensitive read | Integracao | sessao de suporte valida | ler documento ou asset sensivel | permitido somente se politica permitir | `SUPPORT_TENANT_VIEW` + evento de dominio | Sim |
| break-glass denied by default | Negativo | nenhum fluxo de aprovacao | tentar caminho elevated | negado por padrao | `BREAK_GLASS_DENIED` | Sim |
| `userId===1` legacy fallback | Compatibilidade | operador legado ainda presente | acessar rota de plataforma durante dual-read | continua funcional na janela de compatibilidade | evento de divergencia/compatibilidade quando aplicavel | Sim |
| dual-read sem divergencia | Compatibilidade | caminho novo e legado habilitados | resolver papel de plataforma | mesma decisao nos dois caminhos | evento de shadow compare ou metrica equivalente | Sim |
| dual-read com divergencia | Compatibilidade | fixture com grant faltante ou conflito | resolver papel | divergencia registrada e sem enforcement destrutivo | evento de divergencia/alerta interno | Sim |
| audit event success | Integracao | writer v2 ativo | executar acao de plataforma/suporte | evento v2 gravado com `success=true` | evento da categoria correta | Sim |
| audit event failure | Integracao | writer v2 ativo | negar acao sensivel | evento v2 gravado com `success=false` e `failure_reason_code` | evento da categoria correta | Sim |
| `request_id`/`correlation_id` | Contrato | request HTTP ou job encadeado | executar fluxo auditado | ids presentes conforme o tipo do fluxo | evento v2 com campos preenchidos | Sim |
| tenant switch | Integracao | sessao suporte/plataforma valida | entrar e sair de tenant | entrada/saida auditadas | `TENANT_ENTER` e `TENANT_EXIT` ou equivalentes | Sim |
| cross-tenant denied | Negativo | usuario comum de tenant A | acessar recurso tenant B | negado | negacao auditada | Sim |
| empresa `airtrust` sem grant persistido | Negativo | usuario no tenant AirTrust, sem papel de plataforma | acessar funcao global | negado; tenant AirTrust nao vira plataforma implicita | negacao auditada | Sim |
| writer parity legado vs v2 | Regressao | dual-write ativo | executar mutacao auditada | contagem e campos minimos coerentes | writer legado + evento v2 | Sim |
| rollback compatibility | Regressao | dual-write/dual-read desligados | repetir fluxo core | comportamento antigo continua operacional | writer legado continua funcional | Sim |
| no sensitive payloads | Contrato | writer v2 ativo | auditar fluxo FRMS/documento | nenhum payload proibido persistido | evento sanitizado | Sim |
| `support_read_only` on tenant_user data | Integracao | sessao suporte valida | consultar dados de usuario final | somente metadata minima e auditada | `SUPPORT_TENANT_VIEW` + dominio | Sim |
| platform role change on support operator | Integracao | suporte promovido ou rebaixado | alterar grant | trilha critica registrada | `PLATFORM_ROLE_GRANTED`/`PLATFORM_ROLE_REVOKED` | Sim |
