# AirTrust Data Quality Checks v0.5

Data: 2026-06-02

## Objetivo

Catalogar checks read-only para detectar inconsistencias antes da segunda empresa real. Nenhum check deve alterar dados.

## Catalogo

| Check | Modulo/tabela | Risco detectado | Por que importa para segunda empresa | SQL/criterio conceitual | Frequencia recomendada | Bloqueia segunda empresa? |
| --- | --- | --- | --- | --- | --- | --- |
| Empresa sem admin | empresas, usuarios, usuarios_empresas | Tenant criado sem operador responsavel | Bloqueia suporte e onboarding | Empresa ativa sem usuario admin/manager vinculado | Antes de onboarding e semanal | sim |
| Usuario sem empresa | usuarios, usuarios_empresas | Usuario global indevido | Risco de acesso sem tenant claro | Usuario ativo sem vinculo ativo com empresa | Semanal | sim |
| Usuario com multiplas empresas sem selecao clara | usuarios_empresas | Ambiguidade de tenant | Pode operar tenant errado | Usuario com mais de uma empresa ativa e sem primaria/current | Antes do smoke autenticado | sim |
| Funcionario duplicado no tenant | funcionarios | Duplicidade operacional | Dashboard e qualificacoes ficam incorretos | Mesmo nome/matricula/documento no mesmo empresa_id | Antes de importacao | nao |
| Funcionario sem empresa | funcionarios | Registro global | Risco cross-tenant | funcionario ativo com empresa_id nulo/invalido | Semanal | sim |
| Qualificacao duplicada | qualificacoes_historico | Contagem e vencimento errados | Dashboard e certificados inconsistentes | Mesma qualificacao ativa para funcionario e ciclo | Semanal | nao |
| Qualificacao planejada orfa | qualificacoes_historico | Planejamento sem funcionario/tipo | Fluxo de renovacao quebra | Planejada sem funcionario ou tipo valido | Semanal | nao |
| Sessao de simulador sem participantes | simulador_sessoes, participantes | Sessao incompleta | Fichas/qualificacoes nao fecham | Sessao ativa/concluida sem participante | Semanal | nao |
| Sessao concluida sem qualificacao correspondente | simuladores, qualificacoes | Historico operacional incompleto | Cliente espera certificado/qualificacao | Sessao concluida sem qualificacao gerada quando aplicavel | Semanal | nao |
| Escala sem tenant valido | escalas_mensais | Escala global | Risco cross-tenant alto | Escala ativa sem empresa_id ou empresa inexistente | Antes de liberar EVD | sim |
| Alocacao sem escala valida | escala_alocacoes | Alocacao orfa | EVD e conflitos incorretos | Alocacao ativa sem escala pai ativa | Semanal | nao |
| Alocacao duplicada | escala_alocacoes | Tripulante duplicado | Risco operacional e dashboard errado | Mesmo funcionario/escala/janela duplicados | Semanal | nao |
| Status divergente | qualificacoes, sessoes, escalas | Filtros inconsistentes | Cancelado/concluido pode entrar em metricas | Variantes CONCLUIDA/CONCLUIDO/CANCELADA/CANCELADO fora da normalizacao | Semanal | nao |
| Documento/asset com prefixo invalido | documentos, assets/R2 | Arquivo fora do padrao privado | Pode burlar autorizacao | r2_key sem prefixo tenant/modulo esperado | Antes de liberar downloads | sim |
| Asset privado em prefixo publico | assets/R2 | Exposicao publica | Vazamento de documento | PDF/documento sensivel em prefixo publico | Antes de demo | sim |
| Registro ativo com deleted_at inconsistente | tabelas soft delete | Dados deletados contados | Dashboard errado | status ativo com deleted_at preenchido ou inverso | Semanal | nao |
| Dashboard contando cancelado/deletado | dashboard queries | Metricas infladas | Cliente perde confianca | Agregados incluem deleted_at/cancelados | Antes de apresentacao | sim |
| FRMS jornada sem dados minimos | frms/jornadas/checkins | Dado de fadiga invalido | Dado sensivel e operacional | Jornada/check-in sem campos minimos obrigatorios | Diario em piloto | sim |

## Arquivo SQL

O arquivo `scripts/validation/data-quality-checks-readonly.sql` contem consultas conceituais somente `SELECT`. Ele nao deve ser executado automaticamente nem contra producao por Codex.
