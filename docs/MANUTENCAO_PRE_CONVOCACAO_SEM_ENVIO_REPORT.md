# Relatório: Pré-Convocação de Manutenção sem Envio Real

**Data:** 2026-06-15
**Branch:** `codex/manutencao-pre-convocacao-sem-envio`
**PRs mergeados de referência:** #33, #34, #35
**Commit HEAD:** `2afc9403`
**Veredito:** `PRONTO COM RESSALVAS`

---

## Resumo Executivo

O sistema está estruturalmente pronto para convocar os funcionários de manutenção amanhã.
As ressalvas são exclusivamente **operacionais** (e-mail/CPF ausentes em 19 funcionários) e
**cadastrais** (nenhum curso LMS criado para Manutenção), não exigem alteração de código,
schema, migration ou RBAC. Nenhum e-mail real foi enviado nesta etapa.

---

## Estado de Prontidão

| Área | Estado | Detalhe |
|---|---|---|
| Filtro setor Manutenção em `/funcionarios` | ✅ PRONTO | Dropdown Setor = Manutenção funciona |
| Coluna Setor na lista de funcionários | ✅ PRONTO | Exibida após PR #33 |
| Coluna Função/Cargo (fallback `funcao \|\| cargo`) | ✅ PRONTO | Implantado em PR #33 |
| Ficha do funcionário — edição de e-mail/CPF | ✅ PRONTO | Campos editáveis na UI |
| 19 funcionários de manutenção com e-mail NULL | ⚠️ RESSALVA | Impede convocação sem ação cadastral prévia |
| Categorias de Manutenção (IDs 15–20) | ✅ PRONTO | Aplicadas em produção |
| 18 tipos MNT_* → setor Manutenção (setor_id=11) | ✅ PRONTO | Backfill aplicado |
| Filtro de setor em Qualificações (Histórico/Planejados/Modelos) | ✅ PRONTO | PR #33 |
| Copy `participantes` em turmas/convocações | ✅ PRONTO | PR #34 |
| Fluxo de turmas em Treinamentos Planejados | ✅ PRONTO | Criação, edição, seleção de participantes |
| Prévia de convocação (sem envio) | ✅ PRONTO | Botão "Convocar Turma" abre modal de prévia |
| Modal de confirmação antes do envio real | ✅ PRONTO | "Confirmar envio" é o gatilho real — 2 cliques de distância |
| LMS — filtro de setor no catálogo e admin | ✅ PRONTO | Filtro `setor_ids` implantado |
| LMS — cursos vinculados a Manutenção | ⚠️ RESSALVA | 0 cursos para setor_id=11; todos 13 são setor_id=10 (Tripulação) |
| Configuração de e-mail (Brevo) | ✅ PRONTO | `BREVO_API_KEY` configurado em produção |

---

## Checklist para Amanhã

### 1 — Antes de convocar: validar funcionários de manutenção

- [ ] Acessar `/funcionarios`
- [ ] Aplicar filtro **Setor = Manutenção**
- [ ] Para cada funcionário sem e-mail: abrir ficha → preencher campo E-mail → salvar
- [ ] Para cada funcionário sem CPF: abrir ficha → preencher CPF → salvar
- [ ] Verificar que a lista mostra "Setor" e "Função/Cargo" corretamente

> **Atenção:** Sem e-mail cadastrado, o sistema bloqueia o envio de convocação (retorna
> `CONVOCACAO_MISSING_EMAIL_CONFIRMATION_REQUIRED`). O preenchimento é pré-requisito.

### 2 — Antes de convocar: validar/criar turma em Treinamentos Planejados

- [ ] Acessar **Treinamentos Planejados** (menu lateral)
- [ ] Verificar se já existe turma de Manutenção cadastrada
- [ ] Se não existir: clicar em "Nova turma" → preencher qualificação (tipo MNT_*), data e participantes
- [ ] Confirmar que os participantes são os funcionários de manutenção com e-mail preenchido

### 3 — Antes de convocar: verificar tipos MNT_* em Qualificações → Modelos

- [ ] Acessar `/qualificacoes` → aba **Modelos**
- [ ] Aplicar filtro **Setor = Manutenção**
- [ ] Confirmar que os tipos esperados aparecem (ex: categorias 15–20)
- [ ] Confirmar que a qualificação que será usada na turma está presente

### 4 — Para criar curso LMS de Manutenção (se necessário amanhã)

- [ ] Acessar LMS → **Admin de Cursos**
- [ ] Clicar em "Novo curso"
- [ ] Vincular a um tipo de qualificação MNT_* (campo `qualificacao_tipo_id`)
- [ ] Associar ao setor **Manutenção** no campo Setor
- [ ] Publicar o curso

> LMS não é pré-requisito para a convocação por e-mail. É pré-requisito apenas se o
> operador quiser disponibilizar conteúdo EAD para os técnicos.

### 5 — Enviar convocação (amanhã, com e-mails preenchidos)

- [ ] Acessar **Treinamentos Planejados**
- [ ] Selecionar a turma de Manutenção
- [ ] Clicar em **"Convocar Turma"** (botão com ícone de envelope)
  - Um modal de prévia abrirá → *nenhum e-mail é enviado neste passo*
  - O modal exibe: destinatários válidos, ausências de e-mail, gestores em cópia
- [ ] Revisar a prévia com atenção
- [ ] Somente após revisar: clicar em **"Confirmar envio"** → e-mail real disparado

---

## Onde o E-mail Real é Disparado

| Localização | Detalhes |
|---|---|
| **Frontend** | `src/react-app/pages/TreinamentosPlanejadosPage.tsx:3114` — botão **"Confirmar envio"** dentro do modal `"Confirmar convocação da turma"` |
| **Backend (turma)** | `worker-airtrust/src/routes/treinamentos-planejados.ts:~2285` — `sendConvocacaoInBatches()` |
| **Backend (planejadas)** | `worker-airtrust/src/routes/notificacoes-convocacao.ts:169` — `POST /convocacoes/planejadas/enviar` (somente se `dry_run` não for `true`) |
| **Teste de config** | `POST /convocacoes/config/enviar-teste` — envia para o e-mail especificado no campo de teste |
| **Provider** | Brevo SMTP API (`api.brevo.com/v3/smtp/email`) via `BREVO_API_KEY` |

### Fluxo do botão "Convocar Turma" (2 passos)

```
Passo 1 — SEGURO, sem envio:
  "Convocar Turma" → abrirConvocacaoTurma() → GET preview → modal abre

Passo 2 — DISPARA E-MAIL REAL:
  "Confirmar envio" → confirmarConvocacaoTurma() → enviarConvocacao.mutateAsync() → e-mail enviado
```

---

## Ações Proibidas Hoje

| Ação | Por quê proibida |
|---|---|
| Clicar em **"Confirmar envio"** no modal de convocação | Dispara e-mail real |
| Clicar em **"Enviar teste"** nas configurações de convocação | Dispara e-mail real para o endereço informado |
| Clicar em **"Reenviar"** em convocação individual | Dispara e-mail real |
| Executar `POST /convocacoes/planejadas/enviar` sem `dry_run: true` | Dispara e-mail real |
| Aplicar migration | Fora do escopo desta etapa |
| Deploy para produção/staging | Fora do escopo desta etapa |

---

## Riscos Operacionais

| Risco | Severidade | Mitigação |
|---|---|---|
| 19 funcionários sem e-mail — convocação bloqueada | **Alto** | Preencher via UI antes de convocar |
| 0 cursos LMS para Manutenção | Médio | Criar via admin LMS antes de usar conteúdo EAD |
| Operador clica "Confirmar envio" por engano | **Alto** | Fluxo tem 2 passos; não clicar em "Confirmar envio" hoje |
| E-mail preenchido incorretamente para funcionário | Médio | Validar formato antes de salvar; sistema rejeita e-mail inválido |
| Turma sem data definida — botão "Convocar Turma" fica desabilitado | Baixo | Sistema bloqueia com mensagem explicativa |
| Tipo `PROFICIENCIA/TECNICO` sem categoria mapeada | Baixo | Cosmético; uso operacional não bloqueado |

---

## Bloqueios Identificados

Nenhum bloqueio técnico de código. Os pré-requisitos são operacionais:

1. **Pré-requisito P1** — E-mail de 19 funcionários de manutenção deve ser preenchido via UI antes de qualquer convocação.
2. **Pré-requisito P2** — Uma turma de Manutenção deve ser criada em Treinamentos Planejados.

Ambos são ações administrativas na UI existente, sem necessidade de código, migration ou acesso a produção por linha de comando.

---

## Confirmações de Guardrail

| Guardrail | Confirmado |
|---|---|
| Nenhum e-mail real enviado nesta etapa | ✅ |
| Nenhum deploy realizado | ✅ |
| Nenhuma migration aplicada | ✅ |
| Staging intocado | ✅ |
| Produção não acessada via script ou D1 remoto | ✅ |
| SIGVOOS / importador / runner / migration 0411 intocados | ✅ |
| FRMS e `frms-source-policy.ts` intocados | ✅ |
| RBAC backend / multi-tenant não alterados | ✅ |
| Schema não alterado | ✅ |
| Usuários reais não criados | ✅ |
| Dados sensíveis (e-mail, CPF, nomes reais) não expostos neste relatório | ✅ |

---

## Validações Executadas

| Check | Resultado |
|---|---|
| `git diff --check` | PASS — sem conflitos de whitespace |
| `bash scripts/check-tracked-secrets.sh` | PASS — `[tracked-secrets] OK` |
| `bash scripts/validation/audit-deploy-scripts.sh` | PASS — 1 aviso pré-existente em docs, não bloqueante |
| `bash scripts/audit-dangerous-ops.sh` | PASS — 1 aviso pré-existente em sync scripts, não bloqueante |
| `npx tsc --noEmit --pretty false` | PASS — sem erros de tipo |

---

## Recomendação para Amanhã

1. **Primeiro:** Preencher e-mail (e CPF) dos funcionários de manutenção em `/funcionarios`.
2. **Segundo:** Verificar/criar turma de Manutenção em Treinamentos Planejados com os participantes corretos.
3. **Terceiro:** Clicar em "Convocar Turma" → revisar a prévia → somente então clicar "Confirmar envio".
4. **Opcional:** Se precisar de conteúdo EAD, criar cursos LMS vinculados a tipos MNT_* antes de convocar.
5. **Após convocações:** Retornar ao desenvolvimento de SIGVOOS / Controle de Voos.

---

*Relatório gerado em 2026-06-15. Nenhum código alterado, nenhum e-mail enviado, nenhuma ação de produção executada.*
