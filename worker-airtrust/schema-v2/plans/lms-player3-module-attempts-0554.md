# lms-player3-module-attempts-0554 — Schema V2 aditivo, NÃO APLICADO

## Escopo
Adicionar armazenamento imutável para política de avaliações aprovada por edição
e tentativas oficiais independentes por módulo, preservando o legado SCORM.
**Não altera matrículas, progresso, certificados, qualificações nem o curso original.**
Depende do Schema V2 0553 (lms_native_edicoes e lms_native_matricula_edicoes)
já aplicado oficialmente no ambiente e da ativação governada do catálogo Native
(planejada separadamente). O versionamento deste arquivo não implica aplicação.

## Modelo
- `lms_player3_politicas`: apenas metadados imutáveis da política (source_sha256,
  policy_sha256, bank_sha256), presos à edição e ao tenant/curso. Inserção sempre
  DRAFT; aprovação administrativa explícita DRAFT→APPROVED com usuário e data.
  O Worker verifica o SHA dos bytes de `player3-approved-policy.json` e
  `player3-server-private-bank.json` no R2 privado sob prefixo da edição.
  O gabarito nunca é devolvido ao navegador.
- `lms_player3_tentativas_modulares`: idempotência por evento e par
  vínculo/etapa/número, respostas e hash, nota/resultado calculados apenas pelo
  Worker, sequências independentes por módulo. Sem UPDATE/DELETE; histórico e
  reprovações preservados, sem transformar aprovação modular em conclusão.
- Trigger de INSERT valida edição publicada, política aprovada, vínculo ativo,
  mesmo tenant/curso/funcionário/ciclo, antes de qualquer persistência.
  Autenticação do usuário e autorização do funcionário pertencem ao Worker.
- O mecanismo antigo `lms_native_tentativas` não é reciclado para provas
  modulares. A conclusão canônica precisará consumir as aprovações verificadas
  do novo ledger, antes de liberar o certificado.

## Aplicação governada — pré-requisitos
1. Confirmar SHA candidato, status dos oito gates, baseline e identidade do
   ambiente; não usar SQL remoto improvisado ou atualizar estado do aluno.
2. Verificar `lms_native_edicoes`, `lms_native_matricula_edicoes`,
   `lms_matriculas`, `lms_matricula_ciclos`, `lms_cursos` reais no destino,
   inclusive FKs, colunas e triggers de 0553. Conferir ledger Schema V2.
3. Verificar ausência de `lms_player3_politicas` e
   `lms_player3_tentativas_modulares` e seus triggers/índices. O SQL exige
   preflight; qualquer divergência aborta o processo.
4. Conferir o hash do SQL e deste plano no manifest
   `lms-player3-module-attempts-0554.json`; executar os testes sintéticos
   `scripts/__tests__/test_player3_module_attempts_0554.py` e smoke do
   Writer com staging. Criar recovery point antes do apply.
5. Aplicar **somente pelo Schema V2/workflow autorizado**. Em staging, depois
   de aplicar, confirmar objetos criados inicialmente vazios, matrícula e
   qualificações legadas intocadas, replay/falha/retomada e integridade.
   Fazer deploy Worker/Pages apenas como candidato autorizado e com proveniência.

## Recuperação e privacidade
Não usar DROP remoto como rollback após surgir qualquer tentativa. Um erro de
schema exige restauração pelo recovery point governado ou migration de
compensação revisada; nunca apagar histórico de aprendizagem. `answers_json`
contém seleções e deve permanecer protegido no D1. Não exportar gabaritos,
identificadores individuais ou recibos ao GitHub/chat/log.

## Gates de produto ainda pendentes
A existência dessas tabelas e da rota staging-only não libera a conclusão.
O Player3 precisa: bundle HTML5 sem chaves oficiais expostas, R2 privado,
políticas pedagógicas aprovadas, material de fixação, aprovação modular
persistida e reconciliada no gate canônico, equivalência dos alunos 80% e
teste real de histórico/qualificação/certificado em Chromium e WebKit.
**Produção somente com autorização específica por SHA/artefato/escopo.**
