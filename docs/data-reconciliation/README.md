# Frente 10 — Diagnóstico e reconciliação de dados históricos

- **Branch:** `audit/data-reconciliation-readonly-20260804`
- **SHA-base:** `c3259a7967412c4a4219beba095f4b5515fb71b9`
- **Estado:** Fase 1 somente leitura; Fase 2 apenas plano; Fase 3 não autorizada.
- **Integração:** permitida como infraestrutura de diagnóstico local e read-only; qualquer reparo permanece bloqueado até a integração e a validação das regras finais.

## Limites operacionais

Esta frente não executa em produção, não abre conexão remota, não aplica migration, não faz deploy e não altera dados. O runner aceita somente um arquivo SQLite local e exige um salt local para pseudonimização.

O schema real pode divergir das migrations e fixtures. Por isso, cada query declara tabelas e colunas obrigatórias e resulta em `SKIPPED_SCHEMA_UNCONFIRMED` quando o contrato não está presente. Um skip não significa que o dado esteja íntegro.

## Cobertura da Fase 1

O catálogo inicial contém 56 classes executáveis e schema-aware:

- **Qualificações — `QUAL-001` a `QUAL-014`:** validade NULL/zero, renovação, múltiplos ativos, datas, tenant/tipo/categoria, G1/G1-SEM, certificado e status.
- **Usuários — `USR-001` a `USR-006`:** funcionário cross-tenant/excluído, memberships, duplicidade, perfil sem funcionário e ativação inconsistente.
- **LMS — `LMS-001` a `LMS-009`:** binding H5P, ambiguidades, múltiplos ativos, conteúdo ausente, progresso, rastreabilidade, certificado e candidatos 0456.
- **Simuladores — `SIM-001` a `SIM-007`:** sessão/check sem ficha, resultado órfão, duplicidade, matriz, ficha incompleta e ordens.
- **Treinamentos — `TRN-001` a `TRN-005`:** participantes ausentes/órfãos, efeitos faltantes, cancelamento e duplicidade.
- **RDV — `RDV-001` a `RDV-005`:** ordens/lacunas, tenant/etapa, estado e versão do workflow.
- **FRMS e escalas — `FRMS-001` a `FRMS-005`:** tenant, fatorização, alocação órfã, duplicidade e período impossível.
- **Certificados/documentos — `DOC-001` a `DOC-005`:** órfãos, tenant, publicidade e hash ausente.

## Itens que exigem fonte adicional

Os itens abaixo não podem ser concluídos apenas por um snapshot D1 local e permanecem explicitamente bloqueados.

### Manifesto externo obrigatório

- **Objeto R2 ausente ou hash incompatível:** exige manifesto local autorizado com key, tamanho e SHA-256; nunca leitura remota nesta fase. Dependência: política R2/documentos e PR #806.
- **Versão antiga LMS órfã no bucket:** exige inventário R2 sanitizado e vínculo D1. Dependência: PR #806.

### Contrato de auditoria obrigatório

- **Histórico criado depois de resposta de erro:** exige requestId/proveniência e contrato final da tabela de auditoria. Dependência: PR #805 e observabilidade.

### Contrato de schema ou versão obrigatório

- **Sessão de treinamento sem treinamento:** exige definição final do vínculo sessão/treinamento. Dependência: Frente 4.
- **Checks parcialmente substituídos:** exige versão/matriz oficial aplicável a cada ficha. Dependência: Frente 4.
- **Rolling FRMS sem jornada:** exige tabelas e colunas canônicas confirmadas na main integrada. Dependência: Frente 7.

### Regra de domínio obrigatória

- **Registro ativo e excluído incompatível:** exige regra final por entidade, pois soft delete não é uniforme. Dependências: Frentes 4, 5 e 7.
- **Categoria/domínio complexo por setor:** exige regra final de resolução e dados de setor. Dependência: PR #805.

Nenhum desses itens será tratado como “zero ocorrência” enquanto a fonte necessária não estiver disponível.

## Formato do relatório

Cada achado contém:

- `code`, `category`, `description` e `severity`;
- `status`, `count` e `companiesAffected`;
- `examples` pseudonimizados;
- `firstDate` e `lastDate`;
- `query` exata;
- `cause`, `futureRepair`, `reversibility`, `risk` e `dependency`;
- `missingSchema`, quando aplicável.

Não são selecionados nome, CPF, email, telefone, endereço, conteúdo pessoal ou certificado completo. IDs e tenant IDs são transformados em tokens SHA-256 locais truncados; o salt não integra o relatório.

## Fase 2 — plano preliminar, não executável

Para cada classe que permanecer válida após a integração das dependências:

1. **Condição prévia:** main atualizada; PRs proprietárias integradas; schema real e ledger confirmados; classificação de ambiguidade concluída.
2. **Regra final:** contrato versionado e aprovado pelo proprietário do domínio.
3. **Dry-run:** mesmo conjunto de seleção da Fase 1, manifesto com contagem por tenant, primeira/última data e hash da query.
4. **Backup:** backup ou ponto de recuperação pelo workflow oficial; nenhum dump em artifact.
5. **Quantidade esperada:** contagem exata por código e tenant, sem PII.
6. **Script forward:** separado da Fase 1, allowlisted, idempotente, com precondições no `WHERE` e limite de lote.
7. **Rollback:** reversão por manifesto ou restauração governada; nunca arquivo de rollback no diretório automático de migrations.
8. **Validação pós-reparo:** zero apenas para as classes autorizadas, invariantes de tenant/RBAC, contagens preservadas e amostra humana.
9. **Idempotência:** a segunda execução não altera linhas e produz o mesmo manifesto.
10. **Ambiguidade:** mais de uma interpretação implica `HUMAN_REVIEW_REQUIRED`; nenhuma escrita automática.

## Dependências e bloqueios

- **PR #805 / Frente 1:** validade NULL/zero, renovação, G1/G1-SEM, domínio e efeitos pós-commit.
- **Frente 4:** atomicidade de simuladores, treinamentos e RDV.
- **Frente 5:** vínculos usuário/funcionário e escritas tenant-safe.
- **PR #806 / migration 0456:** vínculo H5P e consistência D1/R2.
- **Frente 7:** contratos finais de jobs/FRMS quando aplicáveis.
- **Migrations relacionadas:** somente após integração, Schema V2, backup, staging e autorização.

A infraestrutura da Fase 1 pode ser integrada por ser exclusivamente local e somente leitura. A Fase 3 e qualquer reparo de dados requerem autorização explícita separada, revisão humana, backup, manifesto e staging ou cópia controlada.

## Testes

A suíte cobre:

1. base íntegra;
2. inconsistências representativas de cada contrato implementado;
3. múltiplas inconsistências no mesmo registro;
4. dois tenants;
5. associação ambígua;
6. repetição do dry-run;
7. guard contra statements de escrita, pragma destrutivo e execução remota;
8. anonimização;
9. relatório determinístico;
10. coerência entre contagens detalhadas e resumo.

## Confirmação de zero escrita

O código da Fase 1 não contém executor remoto ou shell, abre SQLite com `readOnly: true`, ativa `query_only`, valida cada query e compara o arquivo antes e depois. A única escrita opcional é a criação exclusiva de um novo arquivo JSON local de relatório, fora do banco analisado.
