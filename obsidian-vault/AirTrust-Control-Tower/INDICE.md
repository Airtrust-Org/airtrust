---
status: ativo
tipo: indice
fonte_canonica: repo
ultimo_sha_verificado: ""
risco: baixo
ultima_revisao: "2026-07-05"
tags:
  - indice
  - mapa
---

# AirTrust Control Tower — Índice do Vault

> **Regra de ouro:** Este vault é MAPA e CAMADA DE CONTEXTO. O [repositório GitHub](https://github.com) é a FONTE CANÔNICA.
> Nenhuma nota aqui substitui a leitura do código. Toda nota técnica deve ter `ultimo_sha_verificado`.

## Estrutura

| Pasta | Função |
|---|---|
| `00_INBOX/` | Notas brutas, ideias, capturas rápidas — triar depois |
| `01_MAPA_DO_SISTEMA/` | Visão arquitetural: stack, topologia, fluxos, decisões de plataforma |
| `02_MODULOS/` | Uma nota por módulo funcional do AirTrust |
| `03_DECISOES_ADR/` | Architecture Decision Records |
| `04_PROMPTS_MESTRES/` | Prompts reutilizáveis para Codex, Cursor, Sonnet, DeepSeek, GPT |
| `05_RUNBOOKS_OPERACIONAIS/` | Procedimentos de deploy, backup, incident response |
| `06_PR_REVIEWS/` | Revisões de PR com checklist multi-tenant/RBAC |
| `07_RISCOS_E_DIVIDA_TECNICA/` | Inventário de dívida técnica com severidade e plano |
| `08_EAD_SCORM_CONTEUDO/` | Conteúdo EAD: SCORM, H5P, PDF, PPTX e regras de edição |
| `09_REGULATORIO_ANAC/` | Referências regulatórias (RBAC, PRC-OPS, ICAO) e pendências |
| `10_CONTEXTOS_PARA_IA/` | Blocos de contexto pré-empacotados para colar em prompts |
| `99_ARQUIVO/` | Notas obsoletas ou substituídas |
| `_TEMPLATES/` | Templates para novos documentos |

## Comece por aqui
1. ⚠️ **[[REGRAS_CRITICAS_AIRTRUST]]** — leitura obrigatória antes de qualquer tarefa
2. [[Mapa - Arquitetura Geral]] — visão 10.000 pés do sistema
3. [[Mapa - Stack Tecnológico]] — runtime, frameworks, dependências
4. [[Mapa - Convenções e Padrões]] — como o código é escrito
5. [[Guia - Tags e Convenções]] — sistema de tags do vault
6. [[Guia - Como Agentes de IA Devem Consumir Este Vault]]
7. [[Guia - Atualização por PR]]
8. [[PROMPT_BASE_AIRTRUST]]

## Módulos ativos (18+)
| Módulo | Nota | Status |
|---|---|---|
| FRMS | [[Modulo - FRMS]] | ✅ Ativo |
| LMS | [[Modulo - LMS]] | ✅ Ativo |
| Qualificações | [[Modulo - Qualificações]] | ✅ Ativo |
| Simuladores | [[Modulo - Simuladores]] | ✅ Ativo |
| Escalas Mensais | [[Modulo - Escalas]] | ✅ Ativo |
| EVD | [[Modulo - EVD]] | ✅ Ativo |
| SGSO | [[Modulo - SGSO]] | ✅ Ativo |
| Funcionários | [[Modulo - Funcionários]] | ✅ Ativo |
| Dashboard | [[Modulo - Dashboard]] | ✅ Ativo |
| Compliance | [[Modulo - Compliance]] | ✅ Ativo |
| Backup & Restore | [[Modulo - Backup Restore]] | ✅ Ativo |
| Pasta Virtual | [[Modulo - Pasta Virtual]] | ✅ Ativo |
| Hospedagem | [[Modulo - Hospedagem]] | ✅ Ativo |
| SIGVOOS | [[Modulo - SIGVOOS]] | ✅ Ativo |
| Matriz Treinamentos | [[Modulo - Matriz Treinamentos]] | ✅ Ativo |
| Ficha 360° | [[Modulo - Ficha 360]] | ✅ Ativo |
| RBAC & Multi-Tenant | [[Modulo - RBAC MultiTenant]] | ✅ Transversal |
| Deploy & DevOps | [[Modulo - Deploy DevOps]] | ✅ Transversal |
| Banco D1 | [[Modulo - Banco D1]] | ✅ Transversal |
| Frontend | [[Modulo - Frontend]] | ✅ Transversal |

## Templates disponíveis
- [[TEMPLATE_MODULO]]
- [[TEMPLATE_ADR]]
- [[TEMPLATE_RUNBOOK]]
- [[TEMPLATE_PR_REVIEW]]
- [[TEMPLATE_PROMPT]]
- [[TEMPLATE_DIVIDA_TECNICA]]
- [[TEMPLATE_CONTEUDO_EAD]]
- [[TEMPLATE_PENDENCIA_REGULATORIA]]
