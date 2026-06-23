# AIRTRUST HOTFIX — QUALIFICAÇÕES / CONCLUSÃO DE TURMA UX BATCH

Data: 2026-06-23

## 1. Problema observado

No fluxo `/qualificacoes > Planejados > Turmas`, ao editar a turma `SK76 — Currículo de Solo` no período de 20/06/2026 a 23/06/2026:

- alterar o status para `Concluído` não entregava uma UX coerente para fechamento da turma;
- a tela de conclusão exigia cliques individuais em `Presente` e `Aprovado` por participante;
- faltava uma ação explícita de fechamento operacional em lote;
- o comportamento deixava o usuário sem explicação clara sobre a regra real de conclusão.

## 2. Causa raiz

Classificação final: `COMPLETION_REQUIRES_PARTICIPANTS`

Diagnóstico:

- o frontend já invalidava/refetchava as queries de treinamentos planejados;
- a tabela usava o status retornado pelo backend para turmas reais;
- a regra do backend já exige resultado final por participante para a turma fechar de forma consistente;
- os testes do serviço `treinamentos-planejados-integration` confirmam:
  - todos com resultado final -> turma `CONCLUIDO`;
  - parte concluída e parte pendente -> turma `EM_ANDAMENTO`.

Conclusão:

- o problema principal não era cache stale;
- o problema era UX enganosa: o formulário permitia tentar `CONCLUIDO` sem usar o fluxo correto de conclusão por participantes.

## 3. Nova UX

Implementado no detalhe da turma:

- resumo no topo com:
  - total;
  - presentes;
  - aprovados;
  - pendentes;
  - já concluídos;
  - históricos gerados;
- ações em lote:
  - `Marcar todos como presentes`;
  - `Marcar todos como aprovados`;
  - `Marcar todos presentes e aprovados`;
  - `Limpar marcações`;
  - `Concluir turma e salvar`;
- edição local em draft antes do save final;
- confirmação explícita antes de persistir;
- mensagem clara de regra operacional: a turma só fecha como `Concluído` quando todos tiverem resultado final.

## 4. Regras de segurança

Mantido:

- sem SQL de produção;
- sem migration/schema;
- sem alteração em SIGVOOS/SegVoo;
- sem alteração em `frms-source-policy.ts`;
- sem afrouxar RBAC/tenant.

Aplicado:

- UI de conclusão restrita a perfis com escrita operacional;
- endpoint batch protegido com `requireRole('admin', 'manager')`;
- bloqueio explícito para turma futura;
- bloqueio explícito para turma sem participantes.

## 5. Backend e idempotência

Implementado:

- novo endpoint `PATCH /api/treinamentos/planejados/:id/conclusao-lote`;
- payload por participante com presença, resultado, data efetiva e campos auxiliares;
- resposta com resumo explícito:
  - `criados`;
  - `ja_existentes`;
  - `ignorados`;
  - `erros`;
  - `status_turma`;
- reaproveitamento da integração existente para:
  - concluir histórico elegível;
  - evitar duplicidade;
  - recalcular o status final da turma.

Também foi adicionado um guard no patch da turma:

- tentativa manual de `status=CONCLUIDO` sem todos os participantes finalizados agora retorna erro claro em vez de fingir sucesso operacional.

## 6. Testes

Frontend:

- contratos da nova UX batch;
- regressão do bloco de presença diária preservada;
- regressão da validação de datas preservada.

Backend:

- contrato do endpoint de conclusão em lote;
- testes de integração já existentes do serviço de treinamentos planejados permanecem verdes e continuam cobrindo a regra de fechamento da turma.

## 7. CI local

Executado com sucesso:

- testes frontend direcionados:
  - `TreinamentosPlanejadosPage.conclusao-lote.test.ts`
  - `TreinamentosPlanejadosPage.presenca-diaria.test.ts`
  - `TreinamentosPlanejadosPage.date-validation.test.ts`
- testes worker:
  - `treinamentos-planejados-integration.test.ts`
  - `treinamentos-planejados.conclusao-lote.contract.test.ts`
- `npm run lint`
- `npm run build`

## 8. Deploy

Não executado.

Motivo:

- este workspace já estava em um branch hotfix diferente de `origin/main`, com divergência local;
- a instrução operacional segura do projeto proíbe push/deploy automático sem autorização explícita de execução operacional.

## 9. Validação autenticada

Não executada em ambiente autenticado real.

Validação segura concluída localmente:

- fluxo visual batch implementado;
- confirmação antes do save implementada;
- atualização automática via invalidation/refetch preservada;
- regra de status alinhada com o backend.

## 10. Limitações

- PR não foi aberto;
- CI remota não foi executada;
- deploy controlado não foi realizado;
- validação final com sessão autenticada real ficou pendente por segurança operacional.

## 11. Decisão final

`QUALIFICACOES CONCLUSAO TURMA UX PRONTO — AGUARDANDO DEPLOY`
