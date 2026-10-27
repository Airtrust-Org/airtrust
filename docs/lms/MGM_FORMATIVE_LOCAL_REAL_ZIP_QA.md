# MGM / SCORM — prova local completa e não certificadora

Esta é uma verificação de diagnóstico, **não** um produtor de certificação funcional. Executa um pacote SCORM privado, identificado pelo SHA-256 exato, em matrículas sintéticas do Worker/D1/R2 **locais** e reproduz duas jornadas independentes (Chromium e WebKit) sob política FORMATIVE configurada apenas no curso sintético.

## Condições obrigatórias

- Usar worktree descartável e `scripts/setup-local-lms-smoke-db.sh --reset`, sem credenciais de D1/R2 remoto; o script rejeita `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` e `AIRTRUST_REMOTE_DB`.
- Iniciar Worker com `--local` na porta loopback `127.0.0.1:8787`. Criar segredo JWT apenas em `.dev.vars` local temporário e apagá-lo após a execução.
- Gerar a fixture autenticada e temporária por `scripts/qa/prepare-local-scorm-browser.mjs` com `AIRTRUST_SCORM_QA_ZIP_PATH` apontando para o arquivo privado, e `AIRTRUST_SCORM_QA_DRIVER_PATH` apontando para um perfil `LOCAL_NAVIGATION_DIAGNOSTIC_ONLY`, `activationAuthorized=false` e SHA idêntico ao do ZIP.
- Nunca fazer upload do ZIP privado para GitHub ou incluir dados de alunos, segredos ou gabaritos em logs e comentários.

## Diagnóstico autorizado local

No diretório raiz do worktree, **depois** da fixture e com o Worker local ativo:

```sh
AIRTRUST_SCORM_QA_EXPECTED_SHA=<SHA256_EXATO_DO_ZIP> \
  node scripts/qa/scorm-formative-full-local-probe.cjs
```

O script confere o SHA da fixture e de seu token autenticado, verifica escopo `LOCAL_DISPOSABLE_REAL_ZIP`, troca **somente a política do curso sintético** para FORMATIVE e impede qualificação automática nesse teste. Abre o SCO, percorre todas as telas, preenche cenários formativos por meio da UI, persiste CMI via Worker e compara a matrícula antes e depois de uma confirmação explícita simulada do player React. Reabre e verifica conclusão, progresso de 100%, ausência de certificados/histórico indevidos e nenhum erro JavaScript, separadamente em Chromium e WebKit.

A confirmação de finalização é um **evento de teste simulado**, não o aceite físico de um aluno. Relatório em `.wrangler/scorm-browser-qa/mgm-formative-completion-local-report.json` (arquivo local ignorado e não confiável para o certificador).

## Limite e bloqueios separados

O resultado `LOCAL_FORMATIVE_COMPLETION_OBSERVED_NOT_CERTIFIED` **não satisfaz** a certificação funcional requerida para publicação. Permanecem necessários revisão pedagógica independente, política da edição/ciclo real em staging, autorização F5 vinculada a tenant/curso/SHA/bytes/operação, observações autenticadas governadas em dois browsers, duas evidências documentais PDF reais, atestação assinada independente e autorização específica de release. Sem esses requisitos, o ZIP deve permanecer candidato **inativo**, e nenhuma matrícula ou qualificação em produção pode ser alterada.

**Lembrar:** o testador aceita pacotes privados diferentes apenas quando o perfil local e o SHA correspondem byte a byte; não aprova automaticamente qualquer curso por nome ou metadados.
