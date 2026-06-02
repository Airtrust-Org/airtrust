# AirTrust LGPD Data Inventory v0.5

Data: 2026-06-02

## Objetivo e Escopo

Inventariar, sem dados reais, as principais classes de dados pessoais e operacionais tratadas pelo AirTrust antes da segunda empresa real. Este documento cobre aplicacao, worker/API, documentos, assets, logs e controles multi-tenant.

## Dados Pessoais Tratados

- Usuario: nome, email, papel, status, vinculo com empresa e preferencias.
- Funcionario/tripulante: nome, matricula, funcao, setor, contato, status, vinculos operacionais e historico profissional.
- Gestores/instrutores: identificadores, papeis, atribuicoes e associacao a eventos, treinamentos ou qualificacoes.

## Dados Operacionais Sensiveis

- Escalas, alocacoes, disponibilidade, ferias, afastamentos e confirmacoes.
- Simuladores, sessoes, participantes, fichas, avaliacoes e resultados.
- Dashboard e metricas agregadas por empresa.
- Integracoes operacionais, inclusive EdApp/LMS e SIGVOOS quando habilitadas.

## FRMS, Fadiga, Sono, KSS e Fit-for-Duty

FRMS inclui dados sensiveis de jornada, sono, qualidade de sono, KSS, fadiga, aptidao operacional e respostas de gestor. Esses dados exigem minimizacao, consentimento/base legal adequada, restricao de acesso, retencao definida e audit trail.

## Qualificacoes, Certificados e Treinamentos

Incluem historico de qualificacoes, validade, renovacoes, certificados, treinamentos planejados, presenca, instrutor, local, carga horaria, anexos e exports. Podem revelar perfil profissional e prontidao operacional do colaborador.

## Escalas e EVD

Escalas/EVD indicam rotina de trabalho, disponibilidade, publicacoes, voos, eventos, confirmacoes e alteracoes. Devem ser sempre tenant-scoped e nunca usados para demonstrar outro tenant.

## Documentos, ASO, Anexos, PDFs e Exports

Documentos e PDFs podem conter identificadores pessoais, dados de saude ocupacional, comprovantes e assinaturas. Downloads devem passar por rota autenticada e autorizada. URLs publicas de storage nao podem revelar documentos privados.

## Assets e Storage

Assets privados devem ficar em prefixos privados e ser servidos apenas por rota autenticada, com validacao de propriedade/tenant. O probe `/api/assets/fira/123/test.pdf` deve continuar nao retornando PDF publico.

## Logs e Audit Trail

Logs podem conter requestId, rota, status, erro interno e contexto tecnico. Nao devem conter token, cookie, documentos, payloads completos, emails desnecessarios, dados FRMS sensiveis ou stack em resposta client-facing. Audit trail deve registrar eventos criticos com empresa_id.

Estado confirmado no HEAD `13dd8280a55eebc91f3051f94974306bcba2a721`:

- `requestId` existe no runtime HTTP, mas ainda depende de metadata/payload sanitizado nos writers atuais.
- `audit_logs` e `auditoria` nao possuem colunas dedicadas para `empresa_id`/`request_id`; a trilha minima nesta fase usa metadata contextual sem migration.
- `assets` privados tenant-scoped agora podem ser auditados sem gravar URL completa ou nome real do arquivo.

## Dados por Empresa/Tenant

Todo dado operacional deve resolver `empresa_id` por contexto autenticado, relacionamento direto ou tabela pai tenant-scoped. Rotas sem contexto de tenant devem falhar fechadas.

## Riscos de Suporte Interno

- Admin interno visualizar dados de empresa errada.
- Suporte executar reset/backfill global.
- Logs de erro incluirem PII.
- Export ou PDF ser compartilhado com tenant errado.
- Modulo beta expor dados incompletos ou sem contrato.

## Controles Atuais

- Middleware de tenant e testes de tenant scope em modulos centrais.
- `ops:guard` bloqueando caminhos perigosos conhecidos.
- Smoke public-only e probe de assets privados.
- Handler global de erro sem stack em producao.
- Correcoes de rotas para reduzir `error.message` e stack em payload 500.

## Lacunas

- Smoke autenticado real ainda pendente por falta de credencial.
- Politica formal de retencao/exclusao ainda fora do repositorio.
- Audit trail ainda nao cobre todos os downloads, exports e acesso de suporte.
- `modulos_ativos` existe no modelo, mas a ocultacao visual por tenant nao esta comprovada end-to-end.
- Data quality ainda depende de execucao manual de checks read-only.
- Writers legados fora do perimetro desta fase ainda precisam migrar para a camada de sanitizacao antes de se considerar o contrato LGPD suficientemente uniforme.

## Acoes Antes da Segunda Empresa

- Executar smoke autenticado read-only com empresa esperada.
- Confirmar contrato/DPA, base legal, politica de privacidade e retencao.
- Executar checks de data quality read-only.
- Confirmar modulos piloto e ocultar beta/bloqueados para o tenant novo.
- Validar que nenhum seed/import/migration/DB remoto sera usado no onboarding.

## Acoes Antes da Quinta Empresa

- Implementar audit trail padronizado com empresa_id, requestId e sanitizacao.
- Automatizar data quality em job read-only controlado.
- Formalizar processo de suporte interno com justificativa e revisao.
- Ter feature gating por tenant coberto por testes.
- Ter politica de retencao e offboarding operacionalizada.

## Itens Juridicos Fora do Codex

- DPA.
- Termos de uso.
- Politica de privacidade.
- Base legal por categoria de dado.
- Politica de retencao, exclusao e portabilidade.
- Procedimento de atendimento ao titular.
