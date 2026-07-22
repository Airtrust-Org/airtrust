# ADR-0440 — Versionamento seguro de modelos de sessão

## Decisão

Usar código físico e código canônico separados. `modelos_sessao.codigo` permanece globalmente único para não romper FKs e consultas legadas. `modelos_sessao_versionamento` associa esse registro físico ao tenant, código canônico, versão, vigência e predecessor.

## Consequências

Há somente uma versão corrente por `empresa_id + codigo_canonico`. Uma nova matriz cria um novo registro físico; fichas, sessões e agendamentos históricos continuam apontando para o ID anterior. A API de novos agendamentos consulta somente `is_current = 1`; a leitura histórica resolve pelo ID já persistido. Triggers impedem predecessor de outro tenant e ciclos.

## Alternativa descartada

Reconstruir `modelos_sessao` para remover `codigo UNIQUE` exigiria reapontar FKs, views, triggers e rotas antigas. O levantamento mostrou uso amplo de `modelo_sessao_id` e consultas legadas por `codigo`; portanto, o risco é maior que a tabela de versão aditiva.
