# AirTrust Module Release Matrix v0.5

Data: 2026-06-02

## Objetivo

Classificar os modulos para entrada da segunda empresa real em piloto controlado, deixando claro o que pode ser liberado, o que deve ficar oculto, o que e uso interno e o que deve ser bloqueado.

## Status

- `LIBERAR PILOTO CONTROLADO`: pode ser usado por novo tenant com acompanhamento e smoke.
- `BETA/OCULTO`: nao vender como pronto; manter fora de demo/cliente salvo aprovacao especifica.
- `USO INTERNO`: operado pela equipe AirTrust, nao exposto como feature do cliente.
- `BLOQUEAR`: nao ativar para a segunda empresa.

## Matriz

| Modulo | Status | Motivo | Risco principal | Pre-condicao para liberar | Teste minimo antes de liberar | Smoke necessario | Observacao para demo |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Funcionarios | LIBERAR PILOTO CONTROLADO | Base operacional do tenant e ja possui isolamento por empresa | Exposicao cross-tenant de dados pessoais | Smoke autenticado com empresa esperada e data quality sem bloqueador | Listar `GET /api/funcionarios?limit=1` com tenant esperado | Smoke autenticado read-only com empresa esperada | Mostrar apenas dados reais autorizados ou dataset minimo aprovado |
| Qualificacoes | LIBERAR PILOTO CONTROLADO | Fluxo central do produto e rotas autenticadas existentes | Certificados/documentos sensiveis | Assets privados protegidos e downloads autenticados | `GET /api/qualificacoes/historico?limit=1` e download somente por rota autenticada | Smoke autenticado + probe de assets | Evitar documentos reais em demo aberta |
| Simuladores | LIBERAR PILOTO CONTROLADO | Modulo maduro para sessoes e fichas | Fichas/PDFs por tenant | Confirmar que sessoes/fichas nao cruzam tenant | `GET /api/simuladores/sessoes?limit=1` | Smoke autenticado | Demonstrar fluxo sem gerar dados novos em producao |
| Dashboard executivo | LIBERAR PILOTO CONTROLADO | Read-only consolidado | Dados agregados de tenant errado | Data quality de cancelados/deletados e tenant scope | `GET /api/dashboard/metrics` | Smoke autenticado | Usar como tela inicial do piloto |
| Escalas/EVD | LIBERAR PILOTO CONTROLADO | Valor operacional alto, mas requer acompanhamento | Publicacao ou alteracao indevida de escala | Checklist operacional de publicacao e smoke read-only | `GET /api/evd?data=<hoje>` | Smoke autenticado | Demo read-only ate confirmar processo do cliente |
| FRMS/Fadiga | LIBERAR PILOTO CONTROLADO | Diferencial do produto, com cuidado LGPD | Dados de saude/sono/fadiga | Base legal/consentimento, minimizacao e acesso restrito | `GET /api/frms/daily-fatigue`; writes so com aprovacao | Smoke autenticado read-only | Explicar limites LGPD e consentimento operacional |
| Exportacao/PDFs/certificados | LIBERAR PILOTO CONTROLADO | Assets privados foram corrigidos e publicados | URL publica de documento | Probe de asset privado PASS e erro seguro em rotas de PDF/export | Probe `/api/assets/fira/123/test.pdf` nao 200; downloads por rota autenticada | Smoke assets + smoke autenticado | Nao usar documentos reais sem aprovacao |
| Admin/manutencao | USO INTERNO | Ferramentas de operacao e suporte | Alteracao destrutiva ou global | Runbook interno e audit trail antes de uso por suporte | `ops:guard`; revisar permissao antes de qualquer uso | Nao expor ao cliente | Nao demonstrar em piloto |
| Usuarios/empresas/permissoes | USO INTERNO OPERACIONAL | Necessario para onboarding controlado | Vinculo incorreto entre tenants | Runbook de onboarding e validacao de empresa esperada | `GET /api/auth/empresas` e validacao de empresa esperada | Smoke autenticado com expected empresa | Operado pela equipe AirTrust |
| Treinamentos planejados | BETA/OCULTO | Funcionalidade ainda em estabilizacao | Fluxos incompletos ou confusos | Feature gating por tenant comprovado e testes dedicados | Teste dedicado antes de liberar | Fora do smoke minimo | Ocultar no menu/demo |
| SGSO | BETA/OCULTO | Modulo amplo, ainda nao produto pronto | Workflow incompleto e risco operacional | Testes tenant e revisao de permissoes por fluxo critico | Validacao dedicada de tenant e permissao | Fora do smoke minimo | Nao vender como pronto |
| LMS/EAD | BETA/OCULTO | Assets e conteudo demandam revisao propria | Exposicao de conteudo/arquivos e contratos de curso | Smoke LMS especifico, contrato de conteudo e assets autenticados | Smoke LMS especifico antes de liberar | Fora do smoke minimo | Mostrar apenas se explicitamente aprovado |
| Hospedagem | BETA/OCULTO | Fora do escopo do piloto inicial | Dados operacionais incompletos | Testes tenant e decisao de produto | Teste dedicado antes de liberar | Fora do smoke minimo | Nao ativar para segunda empresa |
| SIGVOOS | BLOQUEAR | Integracao externa e alto impacto operacional | Importacao/sincronizacao indevida | Projeto separado, migration explicita e aprovacao operacional | Nenhum para piloto; requer projeto separado | Nao executar | Nao ativar nem demonstrar |
| Configuracoes "em breve" | BETA/OCULTO | Pode sugerir promessa de produto nao entregue | Frustracao e uso de tela incompleta | Ocultacao visual comprovada por tenant ou revisao manual da demo | Revisao visual antes de demo | Fora do smoke minimo | Ocultar seco para cliente |

## Observacao de Exposicao Atual

Sprint 6 conectou `empresas_config.modulos_ativos` ao contrato autenticado usado pelo frontend (`/api/auth/empresas`) e adicionou gating em menu/cards/rotas diretas. A regra de compatibilidade e conservadora: empresa sem `modulos_ativos` explicito permanece em modo legado para nao quebrar a empresa real existente; empresa com array explicito passa a respeitar a lista de modulos ativos.

`SIGVOOS` permanece bloqueado mesmo em modo legado, salvo regra interna futura explicitamente aprovada.

## Atualizacao Sprint 5

O mapeamento do Sprint 5 confirmou:

- `empresas_config.modulos_ativos` existe e `/api/empresas/minha` pode retornar esse campo.
- O contexto usado por `AppLayout` recebe empresas via `/api/auth/empresas`, que nao retorna `modulos_ativos`.
- `AppLayout` decide LMS/SGSO por permissoes/papel, nao por modulo ativo.
- `App.tsx` protege rotas por autenticacao, mas nao por modulo ativo.
- Gating por menu sem rota direta seria incompleto.

Decisao: **NO-GO parcial para gating runtime nesta sprint**. Plano detalhado em `docs/AIRTRUST_MODULE_GATING_PLAN_v0_5.md`.

## Atualizacao Sprint 6

O gating runtime passou a existir em duas camadas:

- `/api/auth/empresas` retorna `modulos_ativos` normalizado como array quando ha config explicita; config ausente/invalida retorna `null` para preservar modo legado.
- `src/react-app/lib/modules.ts` define o registro canonico de modulos e status (`pilot`, `beta`, `internal`, `blocked`).
- `src/react-app/lib/module-access.ts` centraliza compatibilidade legada, aliases e mapeamento de rotas.
- `AppLayout` oculta itens de menu conforme modulo ativo.
- `ProtectedRoute` bloqueia rota direta quando a empresa tem config explicita e o modulo nao esta ativo.
- Home operacional oculta cards/atalhos de FRMS/SGSO conforme o mesmo helper.

Preset recomendado para segunda empresa antes do primeiro acesso:

```text
dashboard
funcionarios
qualificacoes
simuladores
escalas
evd
frms
```

Manter fora do preset inicial: `lms`, `sgso`, `hospedagem`, `treinamentos_planejados`, `configuracoes_avancadas` e `sigvoos`.

## Regras Para Demo

- Nao expor telas com "em breve", "dados de teste" ou funcoes incompletas.
- Nao usar dados reais da empresa atual para demonstrar outro tenant.
- Nao ativar modulo beta durante reuniao sem aprovacao previa.
- Nao executar writes em producao para demonstracao.
- Para novo tenant, configurar `modulos_ativos` explicitamente antes do primeiro acesso.
- Mesmo com gating, roteiro de demo deve evitar LMS, SGSO, Hospedagem, SIGVOOS e configuracoes incompletas salvo aprovacao especifica.

## Smoke Minimo Para Piloto

Antes de liberar acesso:

```bash
AIRTRUST_EXPECTED_EMPRESA_ID="<tenant-id>" AIRTRUST_AUTH_TOKEN="<redacted>" \
  bash scripts/smoke-authenticated-operational.sh
```

Aceite:

- auth e empresa esperada OK;
- modulos liberados retornam `PASS` ou, se fora do contrato atual, `SKIPPED_ENDPOINT_NOT_AVAILABLE` documentado;
- probe de assets privados retorna nao `200`;
- nenhum write executado.
