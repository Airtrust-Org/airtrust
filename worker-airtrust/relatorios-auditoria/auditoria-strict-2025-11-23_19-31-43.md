# Auditoria Estrita Qualificacoes (2025-11-23_19-31-43)
\n**Status Geral:** OK
\n|Teste|Resultado|Detalhe|
|-----|---------|-------|
|Auth /tipos|PASS|Protegido (401)|
|Auth /historico|PASS|Protegido (401)|
|Listar Tipos - Status|PASS|HTTP 200|
|Listar Tipos - Performance|WARN|499ms|
|Listar Tipos - JSON|PASS|válido|
|Listar Tipos - Conteúdo|PASS|Limpo|
|Listar Historico - Status|PASS|HTTP 200|
|Listar Historico - Performance|PASS|315ms <= 500ms|
|Listar Historico - JSON|PASS|válido|
|Listar Historico - Conteúdo|PASS|Limpo|
|Categorias - Status|PASS|HTTP 200|
|Categorias - Performance|PASS|225ms <= 300ms|
|Categorias - JSON|PASS|válido|
|Categorias - Conteúdo|PASS|Limpo|
|Historico Pag 1 - Status|PASS|HTTP 200|
|Historico Pag 1 - Performance|PASS|230ms <= 600ms|
|Historico Pag 1 - JSON|PASS|válido|
|Historico Pag 1 - Conteúdo|PASS|Limpo|
|Historico Pag 2 - Status|PASS|HTTP 200|
|Historico Pag 2 - Performance|WARN|614ms|
|Historico Pag 2 - JSON|PASS|válido|
|Historico Pag 2 - Conteúdo|PASS|Limpo|
|Historico Pag 3 - Status|PASS|HTTP 200|
|Historico Pag 3 - Performance|WARN|694ms|
|Historico Pag 3 - JSON|PASS|válido|
|Historico Pag 3 - Conteúdo|PASS|Limpo|
|POST Criar|PASS|400|
|PUT Editar|PASS|400|
|DELETE Soft|PASS|Soft delete (404)|
|Tamanho arquivo|WARN|1795 linhas|
|Handlers|WARN|21|
|Histórico 50|PASS|234ms|
