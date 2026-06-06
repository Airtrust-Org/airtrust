# AIRTRUST — Revisão UX (Escalas + Treinamentos + Integrações)
Data: 2026-06-06 · Código `274250c` · Auditoria read-only

> Avaliação baseada em leitura de código (estrutura de página, query keys, estados, freshness). Browser local não exercitado nesta passagem (limitação) — itens visuais marcados "verificar em tela".

## 1. Visão Mensal Integrada (`VisaoMensalIntegradaPage.tsx`)

### Pontos fortes
- Cabeçalho com `generatedAt` ("atualizado em …") dá noção de idade do dado.
- Navegação de mês (anterior/atual/próximo) e seletor `type=month` claros.
- Cards de resumo (Tripulantes/Compromissos/Avisos/Conflitos/Bloqueios) e ícones por severidade (`ShieldAlert`/`AlertTriangle`) na célula do dia.
- Filtros client-side responsivos (busca, fonte, severidade, só conflitos, só bloqueios).

### Fricções / problemas
- **UX-1 (ALTO):** sem atualização automática após mutações (A5). O usuário precisa lembrar de "Recarregar". Em fluxo real (alterou em outra aba/página → volta) verá dado velho sem perceber.
- **UX-2 (MÉDIO):** **parcialidade não exibida.** Se uma fonte cair, `diagnostics.partialSources/warnings` existe no payload mas não há render — "0 eventos" pode mascarar "fonte indisponível" (falso negativo silencioso). Adicionar banner de parcialidade.
- **UX-3 (MÉDIO):** célula limita a 4 eventos com "+N itens" **sem** clique para expandir/abrir detalhe (B3). Em dias cheios o planejador não consegue ver tudo.
- **UX-4 (MÉDIO):** acesso restrito a `admin`/`manager`. Como esta é a única tela que mostra conflito escala×treinamento, papéis operacionais (instructor/editor) que montam escala não a enxergam.
- **UX-5 (MÉDIO):** filtros não viram URL/deep-link nem preservam estado ao navegar para a origem (`sourceRoute`) e voltar.
- **UX-6 (BAIXO):** calendário com `min-w-[132px]` por dia → 28–31 colunas forçam scroll horizontal em notebook/tablet/mobile (verificar em tela; provável fricção em telas pequenas — relevante para a Jornada O mobile).
- **UX-7 (BAIXO):** filtragem 100% no cliente sobre payload do mês inteiro; com tenants grandes, a busca pode introduzir lag (ligado a M11).

## 2. Treinamentos (`TreinamentosPlanejadosPage.tsx`)

### Problemas de fluxo / clareza
- **UX-8 (ALTO):** **dois conceitos de "aprovação"** coexistem — o toggle legado de presença (`useAtualizarPresencaTreinamento` → `/presenca`, seta `aprovado`) **não** emite qualificação; só a ação "Concluir participante" (`/participantes/conclusao`) emite. Risco de o gestor marcar "aprovado" e crer que a qualificação foi gerada. Unificar terminologia/fluxo (liga A3).
- **UX-9 (MÉDIO):** **presença por dia inacessível** (M2) — a UI mostra contagem de presenças por dia mas não há ação para registrá-las. O recurso de turma multi-dia fica "meio implementado" da perspectiva do gestor.
- **UX-10 (MÉDIO):** **turma não "fecha"** (M3) — após concluir todos os participantes pelo fluxo novo, o status da turma não vira `CONCLUIDO`; o gestor não tem feedback de encerramento.
- **UX-11 (MÉDIO):** correção de data de conclusão pode falhar com erro técnico (A4) — mensagem genérica de erro, sem orientação.
- **UX-12 (BAIXO):** múltiplos instrutores existem no backend (`treinamentos_instrutores`); confirmar que a UI permite gerenciá-los (papel/principal) — caso contrário, recurso parcial.

### Pontos fortes
- Convocação por e-mail com **preview**, confirmação de reenvio (409 `CONVOCACAO_REENVIO_CONFIRMATION_REQUIRED`) e tratamento de ausentes de e-mail (409) — boa prevenção de erro e mensagens explícitas.
- Validação de período/dias/horários no create e patch com mensagens específicas ("Dia efetivo fora do período da turma", "horário final deve ser posterior ao inicial").

## 3. EVD / Escala diária

- **UX-13 (ALTO):** o planejador não recebe na EVD nenhuma informação de treinamento (A1). Para a Jornada A/D/G, a verdade operacional de disponibilidade está incompleta exatamente na tela onde a decisão é tomada.
- A EVD já distingue hard block (férias/habilitação) de soft conflict (escala mensal) e exige justificativa operacional para publicar com revisão — boa base para encaixar treinamento como nova fonte.

## 4. Mensagens / feedback (transversal)
- **UX-14 (MÉDIO):** "sucesso" sem parcialidade — garantir que conclusão/sync que tocam várias tabelas não reportem "Salvo com sucesso" quando a emissão de qualificação não ocorreu (caso A3) ou quando uma fonte falhou.
- Convocação por e-mail reporta `enviados_sucesso`/`enviados_falha` por item — bom modelo de feedback parcial; replicar esse padrão em conclusão/sync.

## 5. Acessibilidade (verificar em tela)
- Ícones de severidade têm `aria-label` ("Bloqueio operacional"/"Conflito") — bom.
- Inputs com `aria-label` ("Selecionar mês", "Filtrar por fonte/severidade") — bom.
- Verificar: foco visível, ordem de tab no calendário denso, contraste das "pills" de evento, dependência de cor para severidade (acrescentar texto/ícone além de cor), tamanho de alvo em mobile, navegação por teclado no grid.

## 6. Jornadas operacionais — avaliação rápida
| Jornada | Avaliação |
|---|---|
| A — dia comum | EVD funcional, mas cega a treinamento (A1). |
| B — qualif. vencida | Visão Mensal classifica BLOCKING; EVD não bloqueia por vencimento. |
| C — vencendo c/ renovação planejada | Distinção WARNING vs BLOCKING presente e correta na fonte de qualificação. |
| D — treino 5 dias | Criável; aparece na Visão Mensal; **não** na EVD (A1); presença por dia sem UI (M2). |
| E — treino cancelado | PLANEJADA cancela; **CONCLUIDA permanece** (M9). |
| F — simulador vinculado | Dedup OK p/ participante; **instrutor duplica** (M6). |
| G — conflito real | Aparece na Visão Mensal; **não** na EVD. |
| H — adjacente (12:00/12:00) | **Correto:** não gera conflito (overlap estrito). |
| I — mudança de última hora | Remoção/substituição: possível, mas reflexos cross-módulo e EVD incompletos. |
| J — conclusão individual | Aprovado/reprovado/incompleto suportados; só APROVADO emite. |
| K — retry/duplo clique | **Risco** de turma duplicada (M12); reconclusão pode falhar (A4). |
| L — múltiplas abas | Visão Mensal não sincroniza (A5). |
| M — falha parcial | Backend resiliente (`runSource`); **UI não mostra parcialidade** (UX-2). |
| N — cross-tenant | Mutações protegidas; leitura de qualificação acoplada (A2). |
| O — mobile | Calendário denso → provável scroll horizontal (UX-6, verificar em tela). |

## 7. Recomendações de UX prioritárias
1. Integrar treinamento como fonte de disponibilidade na EVD (A1/UX-13).
2. Unificar "aprovação" vs "conclusão" e deixar explícito quando a qualificação é emitida (UX-8/A3).
3. Sincronizar a Visão Mensal automaticamente (UX-1/A5) ou, no mínimo, exibir aviso de "dado pode estar desatualizado".
4. Exibir parcialidade (`diagnostics`) e tornar "+N itens" expansível (UX-2/UX-3).
5. Expor presença por dia e fechamento de turma (UX-9/UX-10).
