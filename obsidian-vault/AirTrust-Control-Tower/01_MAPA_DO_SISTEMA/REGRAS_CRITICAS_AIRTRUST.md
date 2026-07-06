---
status: ativo
tipo: regras
fonte_canonica: repo
ultimo_sha_verificado: ""
risco: critico
ultima_revisao: "2026-07-05"
tags:
  - regras
  - critico
  - risco/critico
---

# Regras Críticas AirTrust

> ⚠️ **LEITURA OBRIGATÓRIA** para qualquer agente de IA antes de qualquer tarefa no AirTrust.
> Estas regras não são negociáveis. Violá-las pode causar incidente em produção.

---

## 1. Produção é sagrada
Produção não pode ser alterada sem plano, evidência, rollback e validação.
Nenhum deploy, migration remota ou alteração de secrets acontece sem autorização explícita do responsável técnico.

## 2. Isolamento multi-tenant é inegociável
Toda query que toca dados de tenant DEVE incluir `WHERE empresa_id = ?`.
Usar `c.get('empresaId')` — NUNCA hardcodar `empresa_id = 1`.
Violar esta regra = vazamento de dados entre empresas. **Risco crítico.**

## 3. RBAC, auth e permissões exigem auditoria extra
Qualquer mudança em autenticação, roles, permissões ou middleware de tenant requer revisão adicional.
Rotas novas devem ter `requireRole` adequado. Rotas públicas devem ser explicitamente whitelisted.

## 4. Migrations em produção têm ritual obrigatório
Backup → dry-run → rollback planejado → confirmação explícita → apply.
NUNCA rodar `wrangler d1 execute --remote` sem esse ritual.

## 5. LMS/SCORM não pode expor bastidores ao aluno
Conteúdo EAD é a face pública do AirTrust para tripulantes e alunos.
NÃO pode conter: prompts internos, RBAC, dívida técnica, estratégia, informações de outros clientes, ou qualquer coisa que um aluno não deveria ver.

## 6. Termos técnicos operacionais são preservados
PLB, ELT, ADELT, EPIRB, PIC, SIC, ATC, CCO, ANAC — estes e outros termos técnicos NÃO devem ser simplificados ou substituídos em conteúdo EAD, NOTECHS ou documentação voltada para aviação.

## 7. "Homologado/aprovado pela ANAC" exige evidência formal
NUNCA declarar conformidade ou aprovação regulatória sem documento formal da autoridade competente.
A documentação do AirTrust descreve implementação técnica; a conformidade depende de validação externa.

## 8. Obsidian orienta — repo, testes e evidências decidem
O vault Obsidian (`AirTrust-Control-Tower`) é camada de contexto e navegação.
A fonte canônica é SEMPRE o código no repositório GitHub, os testes, as migrations e as evidências documentadas.
Se uma nota do vault divergir do código, **prevalece o código atual verificado.**

## 9. Divergência nota ↔ código = parar e reportar
Se um agente de IA encontrar divergência entre uma nota do vault e o código real:
1. Parar a tarefa
2. Reportar a divergência
3. Trabalhar com base no código (não na nota)
4. Sugerir atualização da nota

## 10. Fable 5 não deve ser usado para operação comum
Para tarefas operacionais no AirTrust (correções, features, auditorias, documentação), usar DeepSeek V4 Pro, Sonnet 5 ou GPT 5.4 Mini.
Fable 5 tem custo desproporcional para tarefas que modelos menores executam com qualidade equivalente.

---

## Checklist rápido para agentes de IA

Antes de qualquer alteração:
- [ ] Li `PROMPT_BASE_AIRTRUST.md`
- [ ] Li a nota do módulo em `02_MODULOS/`
- [ ] Li `Contexto - Seguranca RBAC MultiTenant.md`
- [ ] Confirmei que `empresa_id` está em todas as queries novas
- [ ] Confirmei que não há hard delete
- [ ] Confirmei que nenhum secret está exposto
- [ ] Se é conteúdo EAD: verifiquei que não expõe bastidores

Depois de qualquer alteração:
- [ ] `npx tsc --noEmit` — zero erros novos
- [ ] `npm run lint` — passando
- [ ] Migration nova não duplica número existente
- [ ] Nenhuma regra crítica foi violada
