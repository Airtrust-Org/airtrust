# F1 — cleanup governado do QA lifecycle de Compliance

Escopo: issue #1492 / coordenação #776; staging somente, tenant sintético
`qa_examiner_training`, banco `airtrust-db-staging-baseline-20260701`,
bucket `airtrust-storage-staging`. Não é autorização de dispatch.

## Propriedade e segurança

A fixture recebe `QA-COMP-LIFE-<github.run_id>` e
`QA_ONLY_TRAINING_COMPLIANCE_LIFECYCLE_<github.run_id>`.
O script `cleanup-qa-training-compliance-r2.mjs` seleciona **somente** PDF
que satisfaça, simultaneamente: tenant QA, funcionário E1/E2 desta execução,
matrícula e curso cujo `observacoes` seja o marker exato, histórico de
qualificação compatível, `documentos.certificado_arquivo_id` real e chave
R2 no padrão
`certificados/empresa-ID/funcionario-ID/historico-ID/UUID.pdf`.
Não aceita prefix listing, delete geral por tenant, chave arbitrária nem mais de
16 certificados. Primeiro valida **todos** os candidatos, depois executa
GET com `Range: bytes=0-0` (sem conservar o conteúdo) → DELETE → GET
para cada chave REST Cloudflare, abortando se existir objeto residual.
O script é dry-run por padrão; `--apply` só opera com confirmação literal
no ambiente oficial e token existente do GitHub Environment `staging`.

**Pré-condição administrativa da F0**: reutilizar somente
`CLOUDFLARE_WORKER_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` já existentes
no GitHub Environment `staging`; não copiar secrets de produção ou
emitir novas chaves S3 para esse fluxo. Esse token necessita permissão
R2 de leitura/escrita sobre `airtrust-storage-staging`, que deve ser
**comprovada** antes de semear D1: o workflow cria um pequeno objeto
descartável sob `__airtrust_qa_preflight__/compliance/<run-id>/capability.txt`,
lê, remove e exige readback 404. Se escrever ou excluir falhar, o workflow
para antes da fixture. A prova não altera PDFs reais. O canário é limitado
ao ID da execução, e qualquer falha em excluir seu objeto bloqueia o seed.

No cleanup, mesmo que o token possua escopo de conta mais amplo, o código
só aceita chaves de PDF cujo proprietário tenha sido comprovado pela
consulta D1 limitada aos identificadores validados da execução para o marcador/tenant/usuário dessa execução.
Não há listagem de prefixo nem exclusão por lote. Uma operação REST
negada bloqueia o QA, sem fallback para credencial de produção.
A disponibilidade do token **não dispensa** a autorização governada do
workflow, a proteção de staging, a confirmação e o mutex.

## Ordem de compensação / falhas

O workflow mantém o mutex `airtrust-staging-mutations-and-scorm-qa`
e, quando existe tentativa de fixture:

1. Guard SHA e oito gates; seed do tenant QA somente após preflight da
   capacidade de limpeza R2.
2. Browser autenticado (sem alteração de dados reais).
3. Job `d1_cleanup`, com `if: always()`: tentativa de apagar exclusivamente
   PDFs vinculados à fixture, seguida de **rollback D1 sempre**, mesmo
   se a limpeza R2 falhar; sucesso só se ambos comprovados.
4. O rollback D1 soft-deleta `pasta_virtual`, `documentos`, matrícula,
   ciclos, vínculos e cadastros sintéticos. Prova `active_count=0`.
   Reexecução do rollback é idempotente. R2 pode ser reexecutado usando
   a associação histórica mesmo se D1 foi soft-deletado.
5. Uma falha intermediária gera job vermelho e deve ser investigada;
   jamais transformar em sucesso por `continue-on-error`, que só permite
   prosseguir para limpar D1.

**Retenção imutável deliberada:** Schema V2 0557 proíbe por triggers o
`DELETE`/`UPDATE` de `lms_ciclo_evidencias` e de xAPI arquivado.
Esses registros QA antigos **não são resíduo operacional apagável**:
permanecem como evidência histórica auditável do tenant sintético com
ciclos soft-deletados; nenhuma limpeza tenta contornar os triggers.
Apagamento físico dessa evidência exigiria mudança de governança Schema
V2 e autorização independente; não declarar `0 D1 rows` nesse caso.

## Comprovação e aceite

Teste SQLite executa o SQL real do rollback com triggers de imutabilidade,
incluindo tenant real e segundo usuário QA não pertencente à execução;
exige zero documentos/pasta/ciclos *ativos* de fixture, enquanto registros
históricos e alheios continuam intactos. Mock R2 prova dry-run, ownership, leitura após delete, falha intermediária,
retry e idempotência. Teste REST adicional prova canário por run, escrita,
leitura parcial, DELETE, readback 404 e falha fechada no token sem permissão.

**Limite:** estes testes não comprovam emissão real de certificado
nem vencimento/renovação em staging. O workflow de lifecycle existente
comprova matrícula/opt-in/progresso/conclusão/validade inicial. O aceite
de renovação física, segundo ciclo, PDF real e tela do gestor exige
cenário sintético adicional, janela F0 separada ou aprovada e relatório
com SHA e run ID. Nunca inferir `%PDF-` de `certificate_state=PENDING`.
A F4 Native #1389 continua contratualmente separada do runtime SCORM.
