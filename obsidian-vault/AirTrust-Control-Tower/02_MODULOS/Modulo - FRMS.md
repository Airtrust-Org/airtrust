---
status: ativo
tipo: contexto-modulo
fonte_canonica: repo
ultimo_sha_verificado: ""
risco: alto
modulo: "FRMS"
ultima_revisao: "2026-07-05"
nao_assumir_sem_verificar_codigo: true
tags:
  - modulo
  - frms
  - risco/alto
---

# FRMS — Flight & Rest Management System

## Função do módulo
Gestão de fadiga operacional para tripulações da aviação civil. Pipeline de processamento de jornadas com cálculo de efetividade (SAFTE/FAST), score de fadiga, acumulados rolling (7/28/365d), alertas e integração com SIGVOOS para horas de voo.

## Arquivos principais

### Backend (Worker)
| Arquivo | Função |
|---|---|
| `routes/frms.ts` | Rotas principais FRMS |
| `routes/frms-fira.ts` | Importação FIRA (PDF) |
| `routes/frms-fadiga-checkin.ts` | Score de fadiga no check-in |
| `routes/frms-fadiga-acumulada.ts` | Fadiga acumulada legal |
| `routes/frms-operational-snapshot.ts` | Snapshot operacional |
| `routes/frms-relatorios-config.ts` | Config de relatórios |
| `routes/frms-read-ack.ts` | Read-ack events |
| `routes/frms-shared.ts` | Lógica compartilhada |

### Biblioteca FRMS (27 arquivos, ~6000+ linhas)
| Arquivo | Função |
|---|---|
| `lib/frms/types.ts` | Tipos centrais (418 linhas) |
| `lib/frms/calculos.ts` | Engine de cálculos (1100 linhas) ← maior |
| `lib/frms/alertas.ts` | Engine de alertas (234 linhas) |
| `lib/frms/fadiga-score.ts` | Score de fadiga check-in (321 linhas) |
| `lib/frms/fira-parser.ts` | Parser de PDF FIRA (970 linhas) |
| `lib/frms/db-service-jornadas.ts` | Pipeline completo de jornada |
| `lib/frms/fadiga-acumulada-legal.ts` | Limites PRC-OPS-012/RBAC-117 |
| `lib/frms/frms-source-policy.ts` | Política de fonte canônica |
| `lib/frms/access.ts` | RBAC: escopo de time |

### Frontend (React)
| Página | Rota |
|---|---|
| FrmsDashboard | `/frms` |
| Tripulante | `/frms/tripulante/:id` |
| Alertas | `/frms/alertas` |
| Relatórios | `/frms/relatorios` |
| Escalas | `/frms/escalas` |
| Configurações | `/frms/configuracoes` |
| Importação FIRA | `/frms/importacao/fira` |
| Histórico FIRA | `/frms/importacao/fira/historico` |
| Conceitos | `/frms/conceitos` |
| Fadiga Acumulada | `/frms/fadiga-acumulada` |
| Check-in | `/frms/checkin` |
| Painel Fadiga | `/frms/fadiga-painel` |
| Controle Operacional | `/frms/controle-operacional` |

## Rotas principais da API
| Método | Path | Descrição |
|---|---|---|
| GET | `/api/frms/jornadas` | Listar jornadas |
| POST | `/api/frms/jornadas` | Salvar jornada → pipeline completo |
| GET | `/api/frms/alertas` | Alertas de fadiga |
| POST | `/api/frms/fira/import` | Importar PDF FIRA |
| POST | `/api/frms/checkin` | Score de fadiga pré-voo |
| GET | `/api/frms/operational-snapshot` | Snapshot operacional |
| GET | `/api/frms/relatorios-config` | Config de relatórios |

## Tabelas envolvidas
| Tabela | Função |
|---|---|
| `frms_jornadas` | Jornadas processadas |
| `frms_alertas` | Alertas gerados |
| `frms_fira_imports` | Importações FIRA |
| `frms_horas_voo` | Horas de voo (fonte: SIGVOOS) |
| `frms_config` | Configurações por tenant |
| `frms_read_ack` | Eventos de leitura/confirmação |

## Pipeline de processamento
```
salvarJornada → calcFatorizacao (9 fatores) → calcEffectiveness (SAFTE/FAST)
→ calcAcumuloRolling (7/28/365d) → processarAlertas
(AVISO/ATENCAO/CRITICO/VIOLACAO) → despacharNotificacoes
```

## Regras de negócio críticas
1. **Source policy**: SIGVOOS é fonte canônica para horas de voo — não duplicar
2. **Premissa sono 8h**: Cálculo assume sono fixo de 8h (migration 0353)
3. **Alertas**: thresholds por tipo (AVISO/ATENCAO/CRITICO/VIOLACAO) são configuráveis por tenant
4. **FIRA**: Parser extrai dados de PDF — mudanças no formato do PDF da ANAC quebram o parser
5. **Acumulados**: Rolling windows de 7, 28 e 365 dias

## Referências normativas
- PRC-OPS-009 — Escala de Voo Diária
- PRC-OPS-012 — Gerenciamento de Fadiga
- RBAC-117 — Limites de Jornada (ANAC)
- ICAO Doc 9966 — FRMS Manual

## Riscos conhecidos
| Risco | Severidade | Status |
|---|---|---|
| Parser FIRA quebra com mudança de formato ANAC | 🔴 CRÍTICO | Monitorar |
| Premissa sono fixo 8h pode não refletir realidade | 🟡 MÉDIO | Documentado |
| Pipeline de cálculos sensível a mudanças não validadas | 🔴 CRÍTICO | Revisão obrigatória |

## O que agentes de IA NÃO podem fazer sem validação
- [ ] Alterar fatores de cálculo de fadiga
- [ ] Alterar thresholds de alertas
- [ ] Modificar parser FIRA sem testar com PDFs reais
- [ ] Alterar lógica de acumulados rolling
- [ ] Mudar source policy (SIGVOOS → FRMS)
- [ ] Criar queries FRMS sem `empresa_id`

## Prompts úteis
- [[PROMPT_BASE_AIRTRUST]]
- [[Prompt - Auditoria FRMS]]

## PRs relacionados
- 

## Pendências
- [ ] Validar parser FIRA com formatos recentes da ANAC
