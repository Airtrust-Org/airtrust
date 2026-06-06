# AIRTRUST - Reauditoria Final (Escalas + Treinamentos + Integracoes)
Data: 2026-06-06  
Escopo: reauditoria dos 21 achados Opus A1-A5, M1-M12, B1-B4 apos remediacao.

## Sumario executivo

- Achados altos: 5/5 corrigidos localmente.
- Achados medios: 11/12 corrigidos ou resolvidos por politica; M12 ficou com residuo baixo por ausencia de idempotencia persistida/constraint unica.
- Achados baixos: 4/4 corrigidos.
- Novos bloqueadores altos/medios: nenhum encontrado.
- Deploy: executado em `main` no commit `23f893e684f80f29a2789dd41542e36aa5964203`; evidencias detalhadas ficam no documento de deploy.

## Achados reavaliados

| ID | Resultado da reauditoria | Evidencia |
|---|---|---|
| A1 | Fechado | `findTrainingCommitment` consulta dias efetivos de treinamento por tripulante/instrutor e injeta conflito/aviso na EVD. Falha da fonte e fail-open com log para preservar o fluxo critico. |
| A2 | Fechado | Consulta de qualificacoes da visao mensal nao mistura historico de outro tenant. |
| A3 | Fechado | Fluxo de solicitacao concluida aciona emissao pela mesma integracao usada na conclusao manual. |
| A4 | Fechado | Reprocessamento de emissao e reconclusao usam vinculo idempotente em `treinamentos_qualificacoes_geradas`. |
| A5 | Fechado | Mutacoes bem-sucedidas em APIs relevantes emitem `airtrust:data-changed`; a visao mensal refaz consulta em evento/foco e mostra `diagnostics.partialSources`. |
| M1 | Fechado | `funcaoId` deixou de ser no-op. |
| M2 | Fechado | Modal de detalhes de turma agora tem secao "Presenca diaria", selector de dia, acoes em lote e botoes por participante; conclusao permanece separada. |
| M3 | Fechado | Status de turma acompanha conclusoes finais. |
| M4 | Fechado | Presencas por participante removido sao apagadas explicitamente. |
| M5 | Fechado | Conclusao retroativa nao renova registro posterior. |
| M6 | Fechado | Dedupe e conflito respeitam chave canonica turma/sessao. |
| M7 | Fechado | Eventos internos de escala nao viram conflito cruzado. |
| M8 | Fechado | Isolamento de historico corrigido por `empresa_id`; join adicional em tipos foi evitado intencionalmente. |
| M9 | Fechado por politica | Qualificacao ja emitida nao e revogada automaticamente por cancelamento de turma. Isso evita perda silenciosa de historico operacional; revogacao deve ser acao futura explicita e auditada. |
| M10 | Fechado | Fonte/data FRMS ficou explicita. |
| M11 | Fechado | Benchmark 25/100/300 funcionarios executado; 300 funcionarios fechou em 90,87 ms no nucleo de conflito/dedupe/resumo. |
| M12 | Mitigado, residuo baixo | Dedupe por chave natural em janela curta, retorno idempotente e rollback de parciais. Ainda nao ha protecao forte contra duas requisicoes simultaneas que passem antes da primeira gravar. |
| B1 | Fechado | Chave canonica usada. |
| B2 | Fechado | Recursos de dia sao validados no tenant. |
| B3 | Fechado | `+N itens` expansivel. |
| B4 | Fechado | Filtro de severidade preserva eventos envolvidos em conflitos. |

## Novos achados

| ID | Severidade | Status | Descricao | Tratamento |
|---|---|---|---|---|
| R1 | Baixo | Documentado | M12 nao tem idempotency key persistida nem constraint unica para concorrencia estrita entre criacoes identicas. | Risco operacional reduzido por dedupe/rollback. Proxima melhoria: coluna `idempotency_key` ou indice unico parcial/natural apos desenho de DDL reversivel. |
| R2 | Baixo | Documentado | Smoke autenticado nao foi executado por ausencia de token/cookie/credenciais de teste no ambiente. | Smokes publicos/read-only de producao passaram; classificacao final menciona limitacao autenticada. |
| R3 | Baixo | Documentado | `vite preview` em `127.0.0.1` nao tem proxy e retorna 500 em `/api/public/locale` e `/api/public/translate`. | Nao e regressao do escopo; usar dev server com proxy ou producao para smoke funcional. |

## Conclusao de reauditoria local

Nao ha achado alto ou medio bloqueante remanescente para publicar. O unico residuo tecnico real e R1/M12, classificado como baixo porque a duplicacao por duplo clique/retry comum foi mitigada e falhas parciais sao revertidas. Atomicidade forte exigiria DDL/idempotencia persistida, nao aplicada nesta remediacao para evitar migration sem janela propria.
