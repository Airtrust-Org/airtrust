# Diagnóstico histórico — Fase 1 somente leitura

Este diretório contém exclusivamente o catálogo e o executor local do diagnóstico da Frente 10. A integração desse código não autoriza reparação de dados nem execução remota.

## Execução permitida

Use apenas SQLite/D1 local ou dump anonimizado autorizado:

```bash
AIRTRUST_RECONCILIATION_SALT='segredo-local-com-12-ou-mais-caracteres' \
node scripts/data-reconciliation/phase1/run-readonly-diagnostics.mjs \
  --db /caminho/para/snapshot.sqlite \
  --max-examples 5
```

Para gravar o relatório localmente, acrescente `--output /caminho/novo/relatorio.json`. O arquivo de saída deve não existir; o executor usa criação exclusiva para evitar sobrescrita silenciosa.

## Garantias

- o banco é aberto com `readOnly: true`;
- a conexão ativa `query_only`;
- somente consultas `SELECT`/`WITH` e pragmas de inspeção são aceitos;
- caminhos remotos são recusados;
- não existe chamada a Wrangler, Cloudflare, D1 remoto, R2, rede ou shell;
- o arquivo SQLite é verificado antes e depois da execução;
- exemplos usam hashes locais derivados do salt informado;
- campos com aparência de PII causam falha;
- o relatório é ordenado e determinístico para o mesmo banco, catálogo, salt e limite.

## Resultado

Cada achado contém código, categoria, descrição, severidade, contagem, empresas afetadas, exemplos pseudonimizados, primeira/última data, query exata, causa possível, regra futura de reparação, reversibilidade, risco e dependência.

`SKIPPED_SCHEMA_UNCONFIRMED` significa que a tabela ou coluna exigida não existe no snapshot. Isso é evidência de schema drift ou fixture incompleta, não aprovação do dado.

## Proibições

Não executar contra produção sem autorização separada. Não aplicar migrations, não reparar dados, não usar dumps com PII, não publicar relatórios contendo o salt e não transformar candidatos em conclusões automáticas.
