# AirTrust Training Class Management v0.5

## 1. Objetivo

Evoluir `treinamentos_planejados` para representar turmas com vários dias, participantes,
instrutores, presença diária e conclusão individual, sem criar catálogo concorrente de cursos.

## 2. Arquitetura e estruturas reutilizadas

- `qualificacoes_tipos` permanece a fonte oficial de nome, código, categoria, validade e regra
  de vencimento.
- `treinamentos_planejados` permanece a raiz compatível da turma.
- `treinamentos_participantes` permanece o vínculo de matrícula.
- `qualificacoes_historico`, `calcularDataVencimento`, eventos e invalidação de estatísticas
  continuam sendo o fluxo oficial de qualificação.
- Sessões, equipamentos, fichas e qualificações do módulo de Simuladores não foram alterados.
- A visão mensal existente continua sendo o read model consolidado.

## 3. Schema e migration

Migration incremental: `0390_training_class_management.sql`.

Ela adiciona à turma identificação, modalidade, período, base, sala, equipamento e limite, além
de criar:

- `treinamentos_dias`;
- `treinamentos_instrutores`;
- `treinamentos_presencas`;
- `treinamentos_qualificacoes_geradas`.

A migration é aditiva e não faz retropreenchimento. A compatibilidade com turmas legadas sem dias
ou instrutores dedicados fica no runtime. O unique de qualificações geradas usa tenant, turma,
participante, modelo e conclusão.

## 4. Fluxo da turma

As rotas compatíveis sob `/api/treinamentos/planejados` foram ampliadas. A criação e edição
aceitam dias efetivos, instrutores, modalidade e recursos. Participantes podem ser enviados em
lote. Modelo, participantes e instrutores são validados contra o tenant autenticado.

O frontend em `/treinamentos` e `/treinamentos/planejados` oferece calendário, quadro, auditoria,
formulário com período, horários padrão, editor de dias, seleção de participantes e detalhe.

## 5. Dias efetivos

Cada dia possui data, início, término, local, instrutor, simulador, aeronave, sessão, status e
observação. A API rejeita duplicidade, horário invertido e dia fora do período. A UI permite
remover, adicionar e alterar data ou horário por dia.

## 6. Participantes, presença e resultado

O participante possui resultado, conceito, nota, conclusão efetiva, responsável e vínculo com
o histórico. Presença diária suporta `PENDENTE`, `PRESENTE`, `AUSENTE`, `PARCIAL` e `DISPENSADO`.

Presença não aprova nem conclui automaticamente. Somente `APROVADO` com data efetiva é elegível.

## 7. Instrutores e simuladores

O backend suporta vários instrutores, principal e instrutor por dia. Um dia pode apontar para
simulador, aeronave e sessão existente. Quando `sessao_id` está presente, a visão mensal suprime
o evento canônico de simulador correspondente para evitar dupla agenda. O domínio legado de
Simuladores permanece intacto.

## 8. Calendários e visão mensal

O calendário de Treinamentos expande cada turma pelos dias ativos. A visão mensal cria um evento
por pessoa e dia, incluindo participantes e instrutores, com rota de origem, modalidade, turma,
modelo e chave de deduplicação. Turmas canceladas são excluídas do read model ativo.

Os conflitos por sobreposição da visão mensal continuam distinguindo informação, conflito e
bloqueio conforme as fontes envolvidas. Sobreposições entre turmas também verificam sala/local,
simulador e aeronave, marcando conflito de recurso mesmo quando as pessoas são diferentes.

## 9. Conclusão e qualificação

`GET /planejados/:id/conclusao/preview` lista elegibilidade individual.
`PATCH /planejados/:id/participantes/conclusao` salva o resultado individual.

A data oficial é `data_conclusao_efetiva`. O vencimento usa `calcularDataVencimento` e os campos
oficiais de `qualificacoes_tipos`. A repetição retorna o mesmo histórico e `INSERT OR IGNORE`
preserva a idempotência. A observação registra:

```text
Origem: Turma <identificação>
Origem: Treinamento Planejado #<id>
```

## 10. Tenant, RBAC e auditoria

O tenant deriva de autenticação. Leituras e mutações filtram `empresa_id`; referências a modelo,
participante e instrutor de outro tenant são rejeitadas. Escritas usam `requireRole('admin',
'manager')`. As alterações continuam usando `registrarAuditoria`.

## 11. Compatibilidade

Rotas antigas, solicitações, convocações, sessões e históricos foram preservados. A integração
com solicitações agora detecta colunas legadas antes de utilizá-las, sem DDL em runtime.

## 12. Riscos e limitações

- A tela ainda seleciona um instrutor principal; múltiplos instrutores estão disponíveis pela API.
- O vínculo visual de sessão/simulador e a criação de sessões pela turma ainda não estão completos.
- A visão mensal sinaliza conflito de sala, aeronave e simulador, mas ainda não oferece uma matriz
  dedicada de ocupação por recurso.
- A rota histórica ultrapassou 2.000 linhas e foi registrada no guardrail arquitetural com teto
  explícito de 2.207 linhas.
- O typecheck global do worker mantém erros preexistentes em FRMS.

## 13. Rollback

O rollback recomendado é primeiro reverter aplicação e rotas. Como a migration é aditiva, as
colunas podem permanecer sem afetar o código anterior. Após backup e confirmação de ausência de
uso, as quatro tabelas novas podem ser removidas em migration posterior. Não executar `DROP
COLUMN` ou exclusão de vínculos automaticamente.
