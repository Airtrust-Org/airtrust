# AirTrust Audit Trail LGPD Hardening Plan v0.5

Data: 2026-06-02

## Estado Atual Presumido

O sistema ja possui eventos e logs em partes do produto, mas a cobertura nao e uniforme para suporte, downloads, exports, offboarding e operacoes administrativas. Este sprint nao cria migration nem schema.

## Estado Atual Confirmado no HEAD 13dd8280a55eebc91f3051f94974306bcba2a721

- Writers atuais identificados: `auditoria` via `registrarAuditoria`, `audit_logs` via `logAudit`, `auditoria_avancada_v2` via `logAuditoria` do FRMS e `admin_actions` para eventos administrativos destrutivos.
- `empresa_id` nao e persistido de forma canonica em `auditoria` nem em `audit_logs`; aparece em payloads FRMS e em alguns `metadata_json` de `admin_actions`.
- `requestId` existe no middleware global e no handler de erro, mas nao tinha propagacao canonica para os writers de banco.
- `dados_antes` e `dados_depois` ainda aceitam payload arbitrario em writers legados fora do perimetro deste sprint.
- `assets.ts` protegia prefixos privados por tenant, mas nao registrava acesso privado autorizado.

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
- Sanitizar payloads de auditoria em pontos centrais e rotas criticas de escopo controlado.
- Embutir `request_id` e `empresa_id` em metadata/payload sanitizado quando a tabela atual nao possui colunas dedicadas.
- Auditar acesso autorizado a assets privados tenant-scoped sem registrar nome de arquivo ou URL completa.

## Endurecimento Aplicado Nesta Fase

- Nova camada `worker-airtrust/src/lib/audit/` com sanitizacao conservadora, truncamento de tamanho e protecao contra payload circular/profundo.
- `auth.ts`: evento de `IMPERSONATE` deixou de carregar email/nome do alvo e passou a registrar apenas contexto minimizado e sanitizado.
- `admin.ts`: `metadata_json` e `error_message` passam por sanitizacao antes de persistir; `request_id` e `empresa_id` entram no metadata quando disponiveis.
- `assets.ts`: acesso autorizado a prefixo privado `fira/{empresaId}` passa a registrar evento em `audit_logs` com prefixo tenant-scoped e sem nome real do arquivo.
- `empresas.ts`: payloads de auditoria dos eventos `INSERT`, `UPDATE` e `DELETE` passam a ser envelopados com `_audit_context` sanitizado e sem campos sensiveis brutos.

## Lacunas Que Permanecem

- `auditoria`, `audit_logs` e `auditoria_avancada_v2` continuam sem contrato unico de colunas para `empresa_id`, `request_id`, motivo de suporte e correlacao assincroma.
- Call sites legados fora do escopo desta fase ainda podem gravar payload amplo se enviarem objetos brutos.
- `support` read-only por tenant ainda nao possui writer formal proprio nem matriz de justificativa operacional persistida.

## Ordem Recomendada

1. Fechar smoke autenticado da empresa atual.
2. Executar checks read-only de data quality.
3. Definir contrato juridico e retencao.
4. Criar migration de audit trail padronizada em sprint proprio.
5. Instrumentar downloads/exports/suporte/admin.
6. Testar cross-tenant e resposta a incidente.
