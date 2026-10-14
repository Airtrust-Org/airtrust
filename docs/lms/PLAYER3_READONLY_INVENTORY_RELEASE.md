# Player 3 — Extração do inventário de matrículas (somente leitura)

**Finalidade:** produzir uma fotografia **cifrada** das matrículas em andamento e não iniciadas da empresa Costa do Sol (tenant 6), antes da troca do LMS. Isso preserva o direito de cada aluno de continuar de onde parou.

**Escopo de segurança:** o inventário inicial é estritamente `empresa_id=6`. Outras empresas exigem autorização, consulta e artefato segregados; não extrair matrículas de outros tenants por conveniência.\n\n**Este PR é um recorte seguro e independente da [PR #1389](https://github.com/Airtrust-Org/airtrust/pull/1389)**. A #1389 continua como frente exclusiva de reconstrução do player e possui conflitos com `main` e Schema V2 0550; esperar sua resolução para inventariar alunos seria desnecessário. Quando este recorte entrar na `main`, a #1389 deverá absorvê-lo por delta, sem duplicar a implementação.

## O que é extraído

Matrículas `EM_ANDAMENTO` e `NAO_INICIADO` da empresa autorizada (empresa_id=6), incluindo curso, usuário técnico, porcentagem, ciclo atual, `ultimo_slide`, última página, `suspend_data`, `cmi_json`, status/nota SCORM, quantidade de eventos xAPI, versão do curso e timestamps. Esse escopo cobre SCORM próprio/externo e também rastros em outros formatos; ausência de evidências deve ser classificada, não preenchida artificialmente.

**Dados individuais só existem no artefato cifrado.** Os outputs de CI exibem apenas totais agregados. Não revelar nomes, IDs individuais, estados CMI ou tokens nos logs.

## Segurança e governança

Workflow: `.github/workflows/production-player3-enrollment-inventory-readonly.yml`.

- Somente `workflow_dispatch` na `main` corrente; exige SHA imutável, confirmação `AIRTRUST_PLAYER3_READONLY_INVENTORY`, aprovação do environment `production` e oito gates canônicos.
- Usa `CLOUDFLARE_D1_READONLY_API_TOKEN` com acesso somente leitura, `CLOUDFLARE_ACCOUNT_ID` e chave de 32 bytes em `AIRTRUST_PLAYER3_SNAPSHOT_KEY_B64`. O status de provisionamento desses secrets precisa ser verificado pelo administrador do repositório; não criar chave em código/chat.
- A SQL fixa é exclusivamente `SELECT` e a resposta é encaminhada por pipe ao selador AES-256-GCM, sem arquivo plaintext no filesystem da Action.
- O artefato criptografado é temporariamente retido por 30 dias. O responsável deve salvá-lo em cofre corporativo seguro antes da expiração, junto com metadados de extração, hash e referência da chave.
- Não há update, seed, import, migration, marcação de presença, nota ou conclusão nesse fluxo.

## Uso no processo de migração

1. **T0**: execute em produção, após checks/approval, e confira a contagem real das matrículas do tenant 6. Não inferir de testes sintéticos.
2. **T1**: alunos continuam estudando. Repita a coleta perto do corte e compare inclusão/mudança de ciclo, progresso e timestamps.
3. **Cutover**: faça uma captura final consistente, evitando perda de commits concorrentes no mesmo curso, e reconcilie todas as matrículas 1:1.
4. **Restaurar**: o [mecanismo de continuidade da #1389](https://github.com/Airtrust-Org/airtrust/blob/feat/lms-native-course-contract-v1-20261010/worker-airtrust/src/lib/lms-player3/continuity.ts) gera proposta por matrícula e edição. Uma porcentagem de 80% permanece registrada, mas retomada por slide/módulo requer correspondência explícita. Crédito administrativo nunca falsifica prova/certificado.
5. **Validar**: conferir não regressão, curso/tenant/ciclo, retomada real do aluno e histórico de qualificação/certificado, com rollback disponível.

**Situação real na criação deste PR:** nenhum inventário de produção foi executado. O fluxo e seus testes são preparação técnica. `main` não deve executar esta nova Action até os secrets, proteção de ambiente, checks e revisão estarem aprovados.
