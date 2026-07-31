# Plano de Classificação: `qualificacoes_tipos.dominio_codigo` para o tipo afetado

**Status: NÃO EXECUTADO.** Este documento é um plano revisado, pronto para
execução, aguardando autorização humana separada. Nenhum comando aqui foi
rodado contra qualquer banco remoto (local, staging ou produção). Nenhum
nome, matrícula, CPF ou e-mail de funcionário aparece neste arquivo —
apenas identificadores operacionais (empresa, tipo, categoria), do mesmo
tipo já usado publicamente em outros documentos deste repositório (ex.:
`docs/ops/EAD_CATEGORY_RECONCILIATION_MANIFEST.md`).

## Pré-requisito
Este plano só é executável **depois** que a migration/Schema V2 change 0454
(`qualificacoes_tipos.dominio_codigo`) já existir no ambiente-alvo — ver
`docs/ops/production-certificados-0454-schema-v2.md` (produção) e
`scripts/staging/apply-approved-migrations.sh` (staging). Sem a coluna, o
comando de classificação abaixo falha com `RESOURCE_TYPE_INVALID` ou erro
de coluna inexistente — nunca silenciosamente.

## Escopo
- **Tenant**: empresa 6 (única empresa afetada — o `CLASSIFIABLE_TABLES`
  do endpoint administrativo sempre escopa por `empresa_id`, então esta
  ação não pode afetar nenhum outro tenant mesmo que o `resource_id` fosse
  reutilizado em outra empresa).
- **Recurso**: `qualificacoes_tipos.id = 19` ("Conhecimentos Gerais da
  Aeronave", código `B`), atualmente vinculado a `categoria_id = 13`
  ("EAD" — categoria mista, sem `dominio_codigo`, propositalmente deixada
  sem classificação por ser uma modalidade de entrega, não um domínio
  funcional homogêneo; ver migration 0454 e
  `docs/rbac/gestor-operational-autonomy.md`).
- **Classificação proposta**: `dominio_codigo = 'OPERACOES'`.

## Base para a classificação proposta (não é inferência automática/heurística)
- O conteúdo do tipo ("Conhecimentos Gerais da Aeronave") é conhecimento
  geral de aeronave — tripulação/operações, análogo às categorias
  já classificadas como OPERACOES no catálogo desta empresa (`Exame`,
  `Check`, `Teórico`, `Prático`, `Licença`, `Voo` — todas OPERACOES).
- O funcionário cujo histórico originou o incidente pertence ao setor
  "Tripulação" (id do setor sanitizado neste texto — ver evidência
  read-only reportada separadamente, fora de conteúdo versionado), cujo
  `dominio_codigo` já é `OPERACOES`. Isto é **evidência de contexto**, não
  a regra de classificação em si — setor não substitui a classificação do
  tipo (ver `docs/rbac/gestor-operational-autonomy.md`: setor é o limite
  de escopo do gestor, não a fonte do domínio da qualificação).
- **Esta é uma decisão de produto/negócio, não uma inferência técnica.**
  A pessoa que autorizar a execução deve confirmar (ou corrigir) que
  "Conhecimentos Gerais da Aeronave" é de fato conteúdo operacional
  (OPERACOES) e não, por exemplo, um requisito corporativo/regulatório
  transversal. Este plano documenta a proposta; não a impõe.

## Idempotência
A chamada abaixo é idempotente: reenviá-la com o mesmo `dominio_codigo`
apenas reescreve o mesmo valor (o endpoint sempre faz
`UPDATE ... SET dominio_codigo = ?`, sem efeito colateral cumulativo) e
`registrarAuditoria` grava `dados_anteriores`/`dados_novos` a cada chamada
— reexecuções são seguras e auditáveis, nunca duplicam nem corrompem
estado.

## Pré-condições (verificar antes de autorizar a execução)
1. A coluna `qualificacoes_tipos.dominio_codigo` existe no ambiente-alvo
   (`PRAGMA table_info(qualificacoes_tipos)` inclui `dominio_codigo`).
2. `qualificacoes_tipos.id = 19` existe, pertence a `empresa_id = 6`, não
   está soft-deleted (`deleted_at IS NULL`), e seu `dominio_codigo` atual é
   `NULL` (senão, confirmar que a sobrescrita é intencional antes de
   prosseguir — o endpoint sobrescreve sem perguntar).
3. `dominios_operacionais` contém `OPERACOES` com `ativo = 1` (já
   confirmado pela migration 0452 aplicada).
4. O usuário que for autorizado a executar (via sessão autenticada, papel
   `admin`) tem RBAC compatível com a operação administrativa
   (`requireRole('admin')` no router `admin-operational-domain-rbac.ts` —
   isto é papel de sistema, não a guarda operacional por domínio/setor).

## Execução (NÃO executar sem autorização explícita — comando de referência)
```
POST /api/admin/operational-domain-rbac/classify
Authorization: Bearer <token de admin autenticado, empresa 6>
Content-Type: application/json

{
  "resource_type": "qualificacao_tipo",
  "resource_id": 19,
  "dominio_codigo": "OPERACOES"
}
```

## Pós-condições (verificar read-only após a execução)
1. `SELECT dominio_codigo FROM qualificacoes_tipos WHERE id = 19 AND empresa_id = 6` retorna `'OPERACOES'`.
2. `registrarAuditoria` tem uma nova linha para `tabela='qualificacoes_tipos'`, `registro_id=19`, com `dados_anteriores.dominio_codigo = null` e `dados_novos.dominio_codigo = 'OPERACOES'`.
3. Nenhum outro `qualificacoes_tipos.id` foi afetado (`SELECT COUNT(*) FROM qualificacoes_tipos WHERE dominio_codigo IS NOT NULL` aumenta em exatamente 1 em relação à contagem pré-execução).
4. A categoria 13 (EAD) **continua** com `dominio_codigo IS NULL` — esta ação nunca classifica a categoria como um todo, apenas o tipo 19.
5. Uma tentativa de `POST /historico/:id/certificados/gerar` para um histórico deste tipo, por um usuário com escopo OPERACOES compatível (ver a seção "RBAC do usuário real" abaixo), deixa de retornar `CERTIFICATE_RESOURCE_DOMAIN_UNCLASSIFIED` e prossegue para geração — validar em staging antes de considerar produção encerrada, nunca assumir por leitura de código isoladamente.

## Rollback
```
POST /api/admin/operational-domain-rbac/classify
{ "resource_type": "qualificacao_tipo", "resource_id": 19, "dominio_codigo": "<valor anterior ou reexecutar com o mesmo mecanismo>" }
```
Como o endpoint não aceita `NULL` diretamente (zod `min(1)`), reverter para
"não classificado" requer uma linha de banco direta e auditada
(`UPDATE qualificacoes_tipos SET dominio_codigo = NULL WHERE id = 19 AND empresa_id = 6`)
executada pelo mesmo caminho controlado (nunca uma UPDATE manual solta) —
**item de melhoria identificado, não implementado nesta PR**: o endpoint
`/classify` poderia aceitar `dominio_codigo: null` explicitamente para
permitir desclassificação sem fallback a SQL direto. Registrado aqui como
lacuna conhecida, não bloqueante para este plano (reverter classificação é
raro e, quando necessário, pode ser feito via migração adicional revisada,
como qualquer outra correção de dado).

## Escopo RBAC do usuário real que executa a ação original (certificado)
Ver relatório separado (fora de conteúdo versionado) com a consulta
read-only de `setores_gestores` para o usuário administrador que
efetivamente aciona "Gerar Certificado" nesta empresa. Este plano de
classificação do TIPO é necessário mas não suficiente por si só — a
autorização final também depende desse usuário ter (ou passar a ter, pelo
mecanismo canônico de atribuição de `setores_gestores`, nunca por bypass)
um vínculo de gestor compatível com o domínio resultante (`OPERACOES`, se
a proposta acima for aprovada).
