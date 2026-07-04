# Backlog: hardening do apply de Matriz de Simuladores para execução remota

## Problema

`scripts/maintenance/apply-simuladores-matriz-v6-costa-do-sol.mjs` é **local-only por design**:
sua função de escrita (`sqliteExec`) grava apenas em um arquivo `.sqlite` local via CLI `sqlite3`,
e seu status final é literalmente `APPLY_OK_LOCAL_ONLY`. Não existe flag `--remote`.

Na execução de produção de 2026-07-04 (Matriz V6.1 Costa do Sol), isso exigiu um processo manual:

1. Instrumentação temporária e reversível do script (`export` na função interna `buildApplySql` +
   guard no `main()` para não autoexecutar ao ser importado) para extrair o SQL puro gerado.
2. Reversão da instrumentação via `git checkout --` logo após a extração.
3. Remoção manual de `BEGIN TRANSACTION;`/`COMMIT;` (D1/Durable Objects rejeita transação SQL
   explícita — cada arquivo `--file` já é atômico por padrão).
4. Reparticionamento manual do SQL em 36 statements menores após erro `SQLITE_TOOBIG` (statements
   de ~146KB excediam o limite do D1), cuidando para que o chunking agrupasse **modelos completos**
   (nunca fracionar as 18 linhas técnicas de um mesmo modelo), preservando a lógica de soft-delete
   de vínculos obsoletos.

Esse processo funcionou e foi validado (equivalência tupla-a-tupla confirmada, 0 diferenças), mas
é manual, propenso a erro humano, e não documentado como fluxo oficial do script.

## Proposta de hardening (não implementada — apenas backlog)

Adicionar ao script modos explícitos, sem alterar o comportamento padrão (que deve continuar
seguro/local por default):

- `--emit-sql <path>`: gera o SQL completo (equivalente ao `buildApplySql`) em um arquivo, sem
  executar nada, local ou remoto. Elimina a necessidade de instrumentação ad-hoc do script.
- `--chunked <max-bytes>`: quando combinado com `--emit-sql`, particiona automaticamente os
  statements que dependem do CTE `target_rows`/`catalog_rows` respeitando os limites de tamanho
  do D1, agrupando por modelo completo (nunca fracionando as linhas técnicas de um mesmo modelo).
  Deve emitir também um manifesto (`.manifest.json`) com contagem de statements, tamanho máximo,
  e checksum do SQL gerado.
- `--remote-plan`: gera o plano de execução (lista de arquivos/comandos `wrangler d1 execute`
  sugeridos), mas **nunca executa remoto por padrão** — apenas imprime/grava o plano para revisão
  humana antes de rodar manualmente.
- Sem novo modo de auto-apply remoto direto no script. A intenção é permanecer "local-only para
  escrita automática, remoto apenas via revisão humana explícita do SQL gerado" — não introduzir
  um caminho onde o script escreve em produção sem revisão.

## Por que isso não foi implementado agora

Regra da execução: "Não implementar agora, salvo se for trivial e docs-only." A adição de novos
modos ao script de apply não é trivial (requer testes, revisão do chunking automático, e não deve
arriscar alterar o comportamento validado do modo `--dry-run`/`--apply` local existente). Este
documento registra a necessidade para implementação futura, fora desta janela de execução
produtiva.

## Critério de aceite para implementação futura

- Modo `--emit-sql` produz SQL byte-idêntico (ou semanticamente equivalente, testável por
  comparação de tuplas) ao SQL hoje extraído manualmente.
- Modo `--chunked` nunca fraciona as linhas técnicas de um mesmo `modelo_codigo` entre chunks
  diferentes.
- Nenhum modo novo executa contra D1 remoto sem um passo de confirmação explícita adicional
  (equivalente ao `--confirm "APLICAR MATRIZ V6 COSTA DO SOL"` já exigido para o apply local).
- Testes cobrindo: geração de SQL idêntica ao modo atual, chunking preservando integridade por
  modelo, e ausência de `BEGIN TRANSACTION`/`COMMIT` no SQL emitido (incompatível com D1).
