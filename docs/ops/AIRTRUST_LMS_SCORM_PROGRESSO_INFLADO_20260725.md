# AirTrust LMS/SCORM — progresso inflado pela nota do quiz (2026-07-25)

Auditoria read-only de produção (export oficial do D1 restaurado em SQLite
descartável fora do Git) sobre as matrículas SCORM tidas como "inconsistentes".
Sem escrita em produção, sem alteração de matrícula/certificado/qualificação,
sem migration, sem deploy.

Este relatório **corrige conclusões de auditorias anteriores**. Nenhum dado
pessoal, identificador real de aluno ou conteúdo de pacote consta aqui.

## 1. Causa raiz confirmada

`POST /scorm/commit` inferia progresso de duas fontes e tomava o maior sinal:

```ts
progressoPct = Math.max(progressoAnterior, inferredFromLocation ?? 0, inferredFromScore ?? 0);
```

`inferredFromScore` deriva de `score.raw / score.max`. Os pacotes em uso aplicam
quiz **por capítulo** e publicam `score.raw` alto já no primeiro módulo. Como o
progresso é monotônico entre commits, uma nota alta no capítulo 1 fixava a
matrícula em 100% de forma permanente, enquanto a localização real do pacote
apontava o começo do curso e o `lesson_status` seguia `incomplete`.

Efeito: matrículas que aparentavam "100% concluídas" sem nunca concluir. O gate
de conclusão parecia quebrado quando estava correto — o pacote de fato não
deveria concluir.

Correção aplicada: a nota deixa de competir com a localização e passa a ser
usado apenas como último recurso, quando não há localização alguma (mantém a
proteção original contra progresso travado em zero).

## 2. O que a evidência mostrou (e refutou)

- **Nenhuma falha de persistência.** A consulta P3 (pacote reportou
  `passed`/`completed` e a matrícula não concluiu) retornou **vazio**. Quando o
  pacote confirma conclusão, o AirTrust registra.
- **Os pacotes não estão quebrados.** Todos os cursos investigados possuem
  matrículas com conclusão explícita registrada — inclusive os quatro cursos
  citados como bloqueados em auditorias anteriores. A afirmação de que o pacote
  CGA "nunca emite conclusão" **não se sustenta**: a decisão de conclusão é
  local ao pacote e depende de todos os quizzes de capítulo terem sido
  aprovados.
- **O pacote versionado no repositório não é o de produção.** O diretório
  `Arquivos - EAD/CGA - .../` contém um export EdApp/SafetyCulture com número de
  slides que não corresponde a nenhuma das variantes vistas em produção. O
  pacote ativo em produção é outro, servido pelo R2, com wrapper SCORM próprio.
  Conclusões tiradas do artefato do repositório não descrevem o comportamento
  real e não devem ser reaproveitadas.
- **O estado interno dos pacotes concorda com o `lesson_status`.** Em todas as
  matrículas da população "inconsistente", o próprio `suspend_data` traz o flag
  interno de conclusão do pacote em `false`. Os alunos realmente não
  concluíram — em geral por quiz de capítulo pendente ou por estarem longe do
  fim.
- **Sem duplicidade e sem corrupção de ciclo.** P8/P9/P10 vazias. A UNIQUE
  `(curso_id, funcionario_id, empresa_id)` torna matrícula duplicada ativa
  estruturalmente impossível.
- **Sem qualificação indevida no fluxo atual.** P7 vazia.

## 3. Passivo histórico (anterior ao endurecimento do gate)

P6 identifica matrículas SCORM marcadas como concluídas **sem** status SCORM
explícito, todas com data anterior ao endurecimento do gate — nenhuma posterior.
Uma delas tem inclusive `lesson_status = failed` com qualificação emitida.

Isso é passivo de dados conhecido, **não** regressão do fluxo atual. Não foi
tocado: qualquer correção aqui altera comprovação formal de conclusão e exige
remediação revisada, autorizada e reversível — nunca correção automática.

## 4. Remediação de dados pendente (fora deste escopo)

Como o progresso é monotônico, as matrículas já infladas **permanecem em 100%**
mesmo após esta correção; o patch impede novos casos, não reescreve o passado.

A consulta P11 em `docs/ops/lms-scorm-inconsistencias-auditoria.sql` dimensiona
o conjunto comparando `progresso_pct` com a localização real do pacote.

Recomendação: recalcular `progresso_pct` a partir da localização SCORM
registrada, em migration/executor revisado, com ensaio prévio contra cópia
forense e reversão preparada. **Nada de alterar status, data de conclusão,
certificado ou qualificação** — apenas o percentual de progresso.

## 5. Verificações executadas

`npx tsc --noEmit`; `npm run lint` (guards de secrets, sanitização, auth,
referências de pacote); `npm run build`; `wrangler deploy --dry-run --env
production`; suíte worker (330 arquivos / 2661 testes) e frontend (169 arquivos
/ 1530 testes), todas verdes, incluindo dois testes novos que reproduzem o caso
de produção e o fallback sem localização.
