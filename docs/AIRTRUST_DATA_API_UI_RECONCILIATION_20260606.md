# AIRTRUST Data → API → UI Reconciliation — 2026-06-06

## Matriz de verdade
| Domínio | Fonte oficial | Endpoint principal | Tela | Evidência | Estado |
| --- | --- | --- | --- | --- | --- |
| Qualificações históricas | `qualificacoes_historico` | `/api/qualificacoes` | `Qualificações > Histórico` | regressão anterior de painel em branco já tratada; sem nova repro nesta sessão | Localmente estável |
| Qualificações planejadas avulsas | `qualificacoes_historico` com status planejado e sem turma real | `/api/treinamentos-planejados` | `Qualificações > Planejados > Lista/Calendário` | `id=4534`, `sessao_id=75`, `data=2026-06-25` existia na fonte e faltava na central antiga | Corrigido localmente |
| Turmas planejadas | `treinamentos_planejados` + `treinamentos_participantes` + `treinamentos_dias` | `/api/treinamentos-planejados` | `Planejados > Turmas` | Turmas mantidas como subvisão filtrada por `source='TURMA'` | Corrigido localmente |
| Sessões de simulador | `simulador_agendamentos` + `sessoes_participantes` | `/api/simuladores/sessoes` e `/api/treinamentos-planejados` | `Agenda`, `Planejados`, `Escala` | 25 sessões em junho/2026 confirmadas read-only em produção | Corrigido localmente |
| Modal de edição de sessão | `simulador_agendamentos` + joins de detalhe | `/api/simuladores/sessoes/:id` | `Agenda > editar sessão` | schema antigo sem `aeronave_id` derrubava hidratação completa | Corrigido localmente |
| Gestão de simuladores | `simuladores`, `manobras`, `categorias`, `tipos_sessao`, `modelos_sessao` | `/api/simuladores/*` | `Simuladores > Gestão` | snapshot local provou que dados existem e não são zero real | Corrigido localmente |
| Observabilidade de release | `index.html` servido + `/api/version` | `/` e `/api/version` | badge/versionamento | frontend `808bb11`, worker `managed-by-script` | Corrigido localmente |

## Perdas localizadas
1. Antes do fix, a central de planejados usava fonte incompleta e omitira sessões/planejadas.
2. O detalhe de sessão ainda assumia schema novo, embora o list endpoint já tolerasse schema antigo.
3. O frontend de Gestão e telas paralelas usavam fallback silencioso para `0`/vazio.
4. A observabilidade de release monitorava arquivo errado (`/manifest.json`).

## Contratos reforçados
- `ConsolidatedTrainingItem` agora aceita `source` canônico:
  - `TURMA`
  - `SIMULADOR`
  - `QUALIFICACAO_PLANEJADA`
- Status de treinamento normalizados por helper central.
- Itens read-only passaram a apontar a rota de origem, evitando edição falsa.

## Divergências ainda não reprovadas em browser autenticado
- Render final do modal com sessão real de produção
- Reconciliação visual em:
  - `Planejados > Calendário`
  - `Escala Mensal`
  - `Visão Integrada`
  - `EVD`

## Conclusão
No código local, os pontos onde os dados desapareciam entre banco, API e UI foram rastreados e corrigidos. A reconciliação autenticada de produção continua pendente porque não houve sessão autenticada nem deploy nesta execução.
