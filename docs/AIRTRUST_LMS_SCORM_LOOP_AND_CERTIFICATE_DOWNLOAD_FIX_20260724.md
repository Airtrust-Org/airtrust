# AirTrust LMS: correção do loop de conclusão SCORM e do download de certificado — 2026-07-24

## Escopo desta fase

Auditoria read-only de produção (D1, via `scripts/production/backup-production-d1-readonly.mjs`,
restaurado em SQLite descartável fora do Git) + correção de duas falhas
sistêmicas do LMS. Sem deploy, sem escrita em produção, sem alteração de
matrícula/qualificação/certificado real, sem migration.

## 1. Causa do download de certificado quebrado

`CardMeusEAD.tsx` listava certificados corretamente, mas baixava por
`GET /api/documentos/download/:r2_key` — um endpoint que não existe para esse
propósito e expunha a chave de armazenamento na URL. O fluxo canônico já usado
por `useCertificados` é `GET /api/pasta-virtual/stream/:documento_id`.

Correção: extraído um helper único (`src/react-app/utils/certificadoDownload.ts`)
usado por `CardMeusEAD` e `useCertificados`, que:

- sempre resolve `documento_id` (nunca usa `r2_key` na URL);
- não oferece o botão de download quando não há identificador de documento
  canônico;
- traduz 401/403/404 em mensagens reais e sanitizadas
  ("sessão expirada", "sem permissão", "certificado não encontrado ou arquivo
  ausente");
- preserva RBAC/isolamento por empresa (o backend já escopa por `empresa_id`
  em `pasta-virtual/stream/:id`).

## 2. Causa do loop de conclusão SCORM

Confirmado com dado real de produção (matrícula 402, empresa 6, curso
"Conhecimentos Gerais da Aeronave"): score 70/70 (100%), mastery 70,
`lesson_status` persistido como `incomplete`, diagnóstico
`SCORM_STATUS_INCONSISTENT` com `can_finalize=true` e `final_commit_observed=false`.

O backend (`lms-progress-guardrails.ts`, `lms-matriculas.ts`) já exige
`completion_diagnostic.explicit_completion === true` para SCORM — esse gate
não foi tocado e continua correto.

O bug estava inteiramente no cliente (`LmsPlayer.tsx`):

- exibia "Confirmar conclusão" para qualquer candidato SCORM com
  `can_finalize=true`, incluindo `SCORM_STATUS_INCONSISTENT` — clicar não
  aprovava o curso (o backend rejeita com 409), mas expunha uma ação que nunca
  deveria existir para SCORM;
- o efeito que reage ao diagnóstico "candidate" reexibia `toast.loading(...,
  {duration: Infinity})` indefinidamente a cada nova leitura da matrícula que
  ainda viesse candidata — sem nunca chegar a um estado final.

Correção aplicada em `src/react-app/pages/lms/LmsPlayer.tsx`:

- finalização manual (`/finalizar`) desativada por completo para conteúdo
  `tipo_conteudo === 'scorm'` (tanto no botão quanto na função que chama a
  API) — preservada apenas para tipos não-SCORM (ex.: vídeo);
- após um número limitado de observações "candidate" sem virar `accepted`, o
  player para de tentar e mostra um estado terminal único: "O conteúdo chegou
  ao fim, mas não enviou a confirmação SCORM. Seu progresso foi preservado.",
  com apenas duas ações (reabrir o curso ou voltar ao catálogo) — sem spinner,
  sem toast infinito, sem refetch em ciclo;
- progresso, localização (`70/70`) e nota continuam exibidos normalmente;
  nada é zerado;
- `completion_diagnostic` nunca é promovido a conclusão no cliente.

## 3. Causa raiz do pacote (CGA — curso "Conhecimentos Gerais da Aeronave")

O pacote fonte deste curso está versionado em `Arquivos - EAD/CGA -
Conhecimentos Gerais de Aeronaves/`. Investigação do bundle confirma que é um
export SCORM da plataforma EdApp/SafetyCulture (referências literais a
`engine.edapp.com`/`web.edapp.com` no bundle): o valor de `lesson_status` vem
de um dado (`lessonCompleted`) fornecido externamente ao pacote, não computado
localmente a partir da nota/localização do aluno dentro do bundle. Por isso o
pacote pode ficar preso em `incomplete` mesmo com nota máxima e última
localização atingida — a confirmação real de conclusão depende do motor
remoto do fornecedor, não de lógica local que possamos corrigir com segurança
sem suporte/documentação do fornecedor.

Decisão desta fase: **não** editar o bundle para inferir `passed`/`completed`
a partir de nota/progresso — isso enfraqueceria exatamente o gate que este
incidente pede para preservar. A mitigação segura e suficiente é a do host
(item 2 acima): nunca promover no cliente, e sair do estado de espera de forma
honesta e finita. Esta conclusão está alinhada com auditoria anterior do
mesmo pacote (`docs/AIRTRUST_SCORM_PACKAGE_AUDIT_20260625.md`, classificação
`PACKAGE_REPACKAGING_REQUIRED`).

## 4. Outros cursos afetados

A auditoria read-only encontrou outros 7 cursos/matrículas com diagnóstico
`SCORM_STATUS_INCONSISTENT` na mesma empresa. Dos cursos envolvidos, apenas o
pacote do item 3 está versionado neste workspace. Os demais (`FDM - Flight
Data Monitoring`, `PT6C-67C - Manutenção`, `EFB – Electronic Flight Bag`) não
têm pacote fonte disponível localmente — mesma conclusão de auditoria anterior
(`PACKAGE_BLOCKED_BY_MISSING_SOURCE`). Não foram alterados nesta fase por
falta de fonte auditável; a correção do item 2 (host nunca promove localmente,
sempre mostra estado finito) já neutraliza o sintoma operacional para
qualquer pacote SCORM, independentemente da causa interna de cada um.

## 5. Certificados sem arquivo (achado colateral, não modificado)

A auditoria confirmou que alguns históricos de qualificação concluídos têm
`numero_certificado` emitido mas nenhum `certificado_arquivo_id` vinculado
(certificado sem PDF gerado, não uma referência quebrada). O fluxo corrigido
no item 1 já cobre esse caso: sem identificador de documento, o botão de
download simplesmente não é oferecido / mostra mensagem "nenhum certificado
disponível", em vez de tentar buscar um arquivo inexistente.

## Testes

Frontend (vitest):

- `src/react-app/utils/__tests__/certificadoDownload.test.ts`
- `src/react-app/components/dashboard/__tests__/CardMeusEAD.certificado.test.tsx`
- `src/__tests__/LmsPlayer.scorm-inconsistent-402.test.tsx` (reproduz
  exatamente o caso da matrícula 402: 70/70, nota 100%,
  `SCORM_STATUS_INCONSISTENT`, sem botão de conclusão manual, sem loop,
  progresso preservado)
- `src/__tests__/LmsPlayer.completion-flow.test.tsx` (suíte pré-existente,
  sem regressão)

Backend: suíte de guardrails/diagnóstico SCORM pré-existente
(`lms-progress-guardrails`, `lms-matriculas`, `lms-relatorios-repository`) —
não alterada, gate mantido intacto.

## Zero escrita em produção

Toda a investigação foi feita sobre um backup read-only de D1, restaurado
localmente em SQLite descartável. Nenhuma matrícula, qualificação, certificado
ou registro de produção foi criado, alterado ou removido nesta fase.
