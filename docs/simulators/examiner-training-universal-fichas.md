# Fichas universais de treinamento prático de examinador (EXA-V01..V04)

Branch: `feature/examiner-universal-training-fichas` (dependente de `feature/shared-session-curricular-segments`, PR #278).
Migration: `worker-airtrust/migrations/0424_examiner_universal_training_fichas.sql`.

## O que isto é

Quatro fichas internas do AirTrust para o treinamento prático de examinador,
cobrindo em conjunto o ciclo completo de formação prática:

| Código | Título | Finalidade (segmento) | Requisito |
|---|---|---|---|
| `EXA-V01` | Treinamento Prático de Examinador — SOP Normal e Condução Inicial | `SOP_NORMAL` | — |
| `EXA-V02` | Treinamento Prático de Examinador — SOP Anormal e Avaliação | `SOP_ANORMAL_EMERGENCIA` | EXA-V01 concluída |
| `EXA-V03` | Treinamento Prático de Examinador — Emergência, Intervenção e Segurança | `SOP_ANORMAL_EMERGENCIA` | EXA-V02 concluída |
| `EXA-V04` | Treinamento Prático de Examinador — Atuação Integrada | `ATUACAO_EXAMINADOR` | EXA-V03 concluída |

Cada ficha tem exatamente **18 itens técnicos + 15 NOTECHS canônicos = 33
itens**. O padrão 18+15 é deliberado — é o mesmo padrão já usado por toda
ficha de simulador no AirTrust, não é truncamento nem bug (ver
`FICHA_TECNICAS_PADRAO_LIMITE` em `worker-airtrust/src/constants/notechs.ts`).

## O que isto NÃO é

- **Não são FAP.** Não reproduzem, não geram, não preenchem, não exportam e
  não convertem avaliação interna em FAP13-CRED-AW139 / FAP13-CRED-SK76. A
  FAP continua sendo preenchida manualmente, fora do sistema.
- **Não é CRED-EXA.** O modelo de sessão `CRED-EXA` (credenciamento de
  examinador, já existente) não é alterado, renomeado ou substituído por
  este trabalho.
- **Não geram credenciamento.** Nenhuma conclusão aqui marca
  `APTO_PARA_INDICACAO`, `CREDENCIAMENTO_ANAC_CONFIRMADO`, cria qualificação
  externa ou evento oficial ANAC.
- **Não têm variantes por aeronave.** Não existem `EXA-V01-AW139` /
  `EXA-V01-SK76`. É a mesma ficha, os mesmos 33 itens, para qualquer
  aeronave.

## Universalidade: como o schema já resolve isto

O schema do AirTrust não tem um conceito de "modelo global" (toda linha de
`modelos_sessao` exige `empresa_id NOT NULL` desde a migration
`0396_harden_empresa_id_wave1.sql`). "Universal" aqui significa **universal
por aeronave dentro do tenant**, não cross-tenant — exatamente o mesmo padrão
já usado pelo modelo `CRED-EXA` existente:

- `modelos_sessao.tipo_aeronave = NULL` em todos os 4 modelos;
- `manobras.tipo_aeronave = NULL` nos 72 itens técnicos novos (18 × 4);
- o equipamento usado na sessão fica registrado apenas em
  `simulador_agendamentos` / cabeçalho da ficha, nunca no catálogo curricular.

O mecanismo que monta a ficha final (`buildOperationalFichaManobras` em
`worker-airtrust/src/constants/notechs.ts`) já é agnóstico de aeronave: ele
ordena os itens vinculados ao modelo via `modelos_sessao_manobras.ordem`,
corta em 18, e injeta os 15 NOTECHS canônicos automaticamente — o mesmo
caminho usado por todos os outros modelos de sessão do sistema. Nenhum código
novo foi necessário para "montar" os 33 itens; a migration apenas popula o
catálogo (`manobras` + `modelos_sessao_manobras`) do jeito que esse mecanismo
já espera.

## Tenant: como foi determinado (não é suposição)

A tarefa exige que o tenant seja determinado por fonte auditável, nunca por
suposição ou `empresa_id` fixo (proibido usar 1 ou 6 "por padrão"). A
migration deriva `empresa_id` por **chave natural**, a partir do modelo
`CRED-EXA` já existente (`SELECT empresa_id FROM modelos_sessao WHERE codigo
= 'CRED-EXA'`) — nunca de um literal.

Essa cadeia é auditável no próprio histórico versionado do repositório:

- `worker-airtrust/migrations/0165_migrate_to_costa_do_sol.sql:46` —
  `UPDATE modelos_sessao SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id
  IS NULL;` (migra todo o catálogo de simuladores, incluindo `modelos_sessao`,
  para o tenant Costa do Sol);
- `worker-airtrust/migrations/0394_tenant_scope_catalogos_f5.sql:10` —
  comentário explícito: "os dados legados atuais pertencem ao tenant Costa
  do Sol (empresa_id = 6)".

Ou seja: **não adivinhamos** que é a empresa 6 — o próprio histórico de
migrations comprometido no repositório documenta essa linhagem para todo o
catálogo de simuladores, do qual `CRED-EXA` faz parte. Se, em algum ambiente,
`CRED-EXA` não existir (base vazia/nova), a migration **falha explicitamente**:
uma guard obrigatória (Seção 0 do arquivo) viola uma `CHECK` constraint e
aborta a execução inteira antes de qualquer `INSERT`, com uma mensagem de
erro (`CHECK constraint failed: cred_exa_tenant_anchor_present = 1`) que
identifica exatamente a causa. Um "sucesso" silencioso com zero modelos
criados nunca é uma saída possível — os dois únicos resultados são "os
quatro modelos foram criados para o tenant do CRED-EXA" ou "a migration
falhou, exit code != 0". Nunca há fallback para `empresa_id = 1` ou `= 6`.

"Universal" aqui significa universal **por modelo de aeronave dentro do
tenant** (`tipo_aeronave = NULL`), nunca global entre tenants — todo modelo,
manobra e ficha criados por esta migration continuam com `empresa_id`
`NOT NULL`, exatamente como qualquer outro dado tenant-specific do sistema.

## Organização das sessões (2 eventos físicos × 120 min = 4 fichas × 60 min)

```
Evento físico 1 — 120 min
  segmento 1 (08:00–09:00): EXA-V01
  segmento 2 (09:00–10:00): EXA-V02

Evento físico 2 — 120 min
  segmento 1 (08:00–09:00): EXA-V03
  segmento 2 (09:00–10:00): EXA-V04
```

Isto usa integralmente a infraestrutura de sessões compartilhadas do PR #278
(`simulador_agendamento_segmentos`, `simulador_atribuicoes_curriculares`,
`simulador_segmento_atribuicoes`, `fichas_sessao.segmento_atribuicao_id`):
cada segmento tem sua própria atribuição curricular e sua própria ficha,
independente das demais. Ver
`docs/simulators/examiner-training-state-machine.md` para o detalhamento de
estados.

Resultado esperado — nunca conclusão pela soma de 240 minutos:

- 2 reservas físicas (`simulador_agendamentos`);
- 4 segmentos (`simulador_agendamento_segmentos`);
- 4 atribuições curriculares (`simulador_atribuicoes_curriculares`);
- 4 `simulador_segmento_atribuicoes`;
- 4 fichas (`fichas_sessao`, cada uma com seu próprio
  `segmento_atribuicao_id`);
- 4 conclusões independentes, cada uma com seus próprios 33 itens.

## Progressão sequencial (`modelos_sessao_requisitos`)

A migration insere 3 linhas em `modelos_sessao_requisitos`
(`tipo_requisito = 'ETAPA_ANTERIOR'`, `obrigatorio = 1`):

- EXA-V02 requer EXA-V01 concluída;
- EXA-V03 requer EXA-V02 concluída;
- EXA-V04 requer EXA-V03 concluída.

Isso reaproveita a tabela já criada pelo PR #278
(`0422_modelos_sessao_requisitos.sql`) sem alteração de schema.

## Contrato de avaliação (preservado, não alterado)

A escala de nota permanece 1–10 contínua (mesma régua já usada em
`src/react-app/pages/simuladores/fichas/avaliacaoScale.ts`), persistida em
`fichas_sessao_manobras.resultado`. Nenhuma escala S/I/N de FAP é introduzida
aqui. Não há conversão nota↔S/I/N em nenhum sentido.

## ECL, não QRH

Toda referência a listas de verificação nesta implementação (documentos,
itens, testes, UI) usa "ECL aplicável". Nenhum artefato novo desta entrega
menciona QRH.

## Autoavaliação / autoassinatura

O guard já existe e é reaproveitado, não reimplementado: em
`worker-airtrust/src/routes/simuladores-shared-session-validation.ts`
(`assertEntityOwnership`), toda sessão compartilhada — inclusive as que usam
EXA-V01..V04 — já rejeita, antes de qualquer escrita, um instrutor que também
conste como participante curricular da mesma sessão (`"Instrutor supervisor
não pode ser o próprio treinando curricular"`). Essa função é chamada tanto
na criação (`POST`) quanto na reconciliação (`PUT`) da sessão compartilhada
em `worker-airtrust/src/routes/simuladores-shared-session.ts`. Na assinatura
(`POST /fichas/:id/assinar`), o usuário autenticado só pode assinar como
`ALUNO` se for `colaborador_id_aluno` da ficha, ou como `INSTRUTOR` se for
`instrutor_id` — como esses dois nunca podem ser a mesma pessoa (bloqueado na
criação), autoassinatura fica estruturalmente impossível para estas fichas.

Nenhum campo de FAP ou assinatura de checador externo/ANAC é exibido para
EXA-V01..V04 — o layout reaproveita o mesmo conjunto de assinaturas internas
(aluno/instrutor) já usado por qualquer outra ficha de simulador.

## Qualificação / credenciamento

Esta entrega não cria `FAP13-CRED-*`, não marca
`APTO_PARA_INDICACAO`/`CREDENCIAMENTO_ANAC_CONFIRMADO`, e não cria
qualificação externa. A rastreabilidade da conclusão do treinamento prático
completo fica nas 4 atribuições curriculares/fichas independentes; nenhuma
infraestrutura de evento de domínio nova foi criada para isto (ver
`docs/simulators/examiner-training-state-machine.md`, seção "Evento de
conclusão").

## Documentos anteriores revisados

Nenhum documento pré-existente em `docs/` menciona variantes AW139/S76 para
este treinamento, 8 modelos, QRH, 22 itens técnicos, ou tratamento de FAP
automatizado para examinador — busca textual (`EXA-V0`, `FAP13-CRED`,
"examinador") não encontrou artefato anterior a corrigir. Esta é a primeira
documentação canônica do assunto.
