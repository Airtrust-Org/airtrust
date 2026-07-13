# HISTORICAL_RUNTIME_BEHAVIOR

- Criacao de fichas futuras usa o modelo atual via `template_id` e leitura de `modelos_sessao_manobras`.
- Fichas historicas arquivadas leem snapshot em `fichas_sessao_manobras`.
- Titulos exibidos de ficha usam campos da propria ficha e fallbacks de template/sessao.
- Portanto, alterar o catalogo afeta geracao futura, mas nao deve reescrever snapshots historicos existentes.

## Evidencia local revisada
- `worker-airtrust/src/routes/simuladores-shared-session-fichas.ts`
- `worker-airtrust/src/routes/simuladores-shared-session-reconciliation.ts`
- `worker-airtrust/src/routes/simuladores-fichas-acoes.ts`
- `worker-airtrust/src/routes/simuladores-modelos.ts`

