# AirTrust Audit Trail LGPD Hardening Plan v0.5

Data: 2026-06-02

## Estado Atual Presumido

O sistema ja possui eventos e logs em partes do produto, mas a cobertura nao e uniforme para suporte, downloads, exports, offboarding e operacoes administrativas. Este sprint nao cria migration nem schema.

## Empresa ID

Todo evento auditavel deve conter `empresa_id` resolvido do tenant autenticado ou do recurso pai. Eventos sem empresa devem ser restritos a operacao interna claramente identificada.

## Request ID e Correlation ID

Cada request deve ter `requestId` propagado para logs e respostas de erro seguras. Fluxos assincronos ou cron devem carregar `correlationId` por lote/processo.

## Sanitizacao de Dados Antes/Depois

`dados_antes` e `dados_depois` nao devem gravar payload completo. Usar allowlist por entidade, redigir token/cookie/email quando nao necessario, truncar textos livres e nunca gravar dados FRMS sensiveis em claro sem necessidade juridica.

## Eventos Administrativos Criticos

Registrar criacao/desativacao de usuario, alteracao de papel, vinculo empresa-usuario, reset/backfill, alteracao de configuracao de empresa, alteracao de modulos ativos e operacoes de manutencao.

## Acesso de Suporte

Suporte interno deve registrar operador, motivo, empresa acessada, janela de tempo, acao consultada/alterada e requestId. Acesso de suporte nao deve usar usuario do cliente.

## Asset e Document Download

Downloads de certificado, documento, ASO, ficha, FIRA e export privado devem registrar empresa_id, recurso, ator, status autorizado/negado e requestId, sem gravar conteudo do arquivo.

## Export e PDF

Exports e PDFs devem registrar tipo, filtros principais, empresa_id, ator, quantidade aproximada e status. Nao registrar payload completo nem dados pessoais linha a linha.

## Offboarding e Desativacao

Registrar desativacao de usuario, revogacao de convite, suspensao de tenant, exportacao final, exclusao/anonimizacao quando aplicavel e responsavel pela decisao.

## O Que Exige Migration Futura

- Tabela audit trail padronizada se a atual nao cobrir todos os campos.
- Indices por empresa_id, ator, entidade, acao e requestId.
- Campos de suporte/justificativa se nao existirem.
- Tabela de politica de retencao por tenant/modulo, se produto exigir.

## O Que Pode Ser Feito Sem Migration

- Padronizar respostas de erro.
- Padronizar logs server-side sem PII.
- Criar runbooks e checks read-only.
- Adicionar testes arquiteturais.
- Definir allowlists de auditoria por entidade antes de schema.

## Ordem Recomendada

1. Fechar smoke autenticado da empresa atual.
2. Executar checks read-only de data quality.
3. Definir contrato juridico e retencao.
4. Criar migration de audit trail padronizada em sprint proprio.
5. Instrumentar downloads/exports/suporte/admin.
6. Testar cross-tenant e resposta a incidente.
