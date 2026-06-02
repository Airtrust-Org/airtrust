# AirTrust Second Company Preflight v0.5

Data: 2026-06-02

## 1. Objetivo

Definir as evidencias obrigatorias antes de criar a segunda empresa real no AirTrust. Este checklist deve ser concluido antes de qualquer criacao de tenant, usuario real, importacao ou carga operacional.

## 2. Pre-condicoes Tecnicas

- `main` alinhada com `origin/main`.
- `npm run ops:guard` passando.
- `npx tsc --noEmit`, `npm run build`, `npm run test` e `npm run test:worker` passando.
- Worker/API em producao com versao que contem a correcao de assets: `2026-06-02T13:50:46Z-abf9002` ou posterior.
- Sem tracked changes locais.
- Sem secrets versionados.

## 3. Evidencia de Assets Protegidos

Antes de onboarding:

```bash
curl -sS -o /tmp/assets_fira_response.txt -w "%{http_code}" \
  https://api.airtrust.online/api/assets/fira/123/test.pdf
```

Aceite:

- status diferente de `200`;
- resposta nao e PDF/documento;
- resposta nao revela existencia de objeto privado.

## 4. Smoke Autenticado da Empresa Atual

Nao criar a segunda empresa antes de validar a empresa real atual com smoke autenticado read-only.

Evidencia de 2026-06-02: `docs/AIRTRUST_AUTHENTICATED_SMOKE_EVIDENCE_20260602.md`.

Status atual: public-only passou e o cenario sem credencial retornou `SKIPPED_AUTH_REQUIRED`. Smoke autenticado read-only e validacao da empresa esperada seguem pendentes porque nao havia `AIRTRUST_AUTH_TOKEN` nem `AIRTRUST_COOKIE` no ambiente.

Sem credencial:

```bash
AIRTRUST_PUBLIC_ONLY=YES bash scripts/smoke-authenticated-operational.sh
env -u AIRTRUST_AUTH_TOKEN -u AIRTRUST_COOKIE bash scripts/smoke-authenticated-operational.sh
```

Com credencial:

```bash
AIRTRUST_EXPECTED_EMPRESA_ID="<id-esperado>" AIRTRUST_AUTH_TOKEN="<redacted>" \
  bash scripts/smoke-authenticated-operational.sh
```

Aceite:

- public-only passa;
- sem credencial retorna `SKIPPED_AUTH_REQUIRED`;
- autenticado read-only passa, quando credencial existir;
- empresa esperada validada quando `AIRTRUST_EXPECTED_EMPRESA_ID` ou `AIRTRUST_EXPECTED_EMPRESA_CODIGO` for informado.

## 5. Modulos Liberados Para Novo Tenant

Liberar apenas em piloto controlado:

- Funcionarios.
- Qualificacoes.
- Simuladores.
- Dashboard executivo.
- Escalas/EVD com acompanhamento.
- FRMS/Fadiga com acompanhamento e cuidado LGPD.
- Exportacao/PDFs/certificados apos confirmacao de assets protegidos.

## 6. Modulos Beta/Ocultos/Bloqueados

- Nao ativar SIGVOOS.
- Nao ativar Hospedagem.
- Nao vender SGSO/LMS como produto pronto.
- Manter Treinamentos Planejados, SGSO, LMS/EAD, Hospedagem e configuracoes "em breve" ocultos em demo/cliente.
- Admin/manutencao e usuarios/empresas/permissoes ficam em uso interno operacional.
- Sprint 6 concluiu gating runtime conservador por `modulos_ativos`; antes de demo externa, novo tenant deve ter config explicita.

Preset recomendado para a segunda empresa:

```text
dashboard
funcionarios
qualificacoes
simuladores
escalas
evd
frms
```

Manter inativos/ocultos no preset inicial:

```text
lms
sgso
hospedagem
treinamentos_planejados
configuracoes_avancadas
sigvoos
```

## 6.1 Data Quality

Antes de criar a segunda empresa:

```bash
bash scripts/validation/validate-data-quality-sql.sh
npm run validate:data-quality-sql
```

Depois, operador autorizado deve executar `scripts/validation/data-quality-checks-readonly.sql` em ambiente aprovado, sem Codex, sem `wrangler d1 execute --remote` e sem versionar resultado com PII. Guia: `docs/AIRTRUST_DATA_QUALITY_EXECUTION_GUIDE_v0_5.md`.

## 7. Dados Minimos Para Onboarding

Solicitar apenas o minimo necessario:

- razao social/nome fantasia;
- codigo curto do tenant;
- dominio ou identificador operacional;
- timezone;
- primeiro admin indicado pelo cliente;
- modulos piloto liberados;
- volume inicial estimado de funcionarios e documentos;
- contato operacional e contato legal.

Nao coletar documentos pessoais antes de concluir smoke, contrato/DPA e runbook de seguranca.

## 8. Validacao Pos-Onboarding

Apos criar a empresa e o primeiro admin, executar:

- login do primeiro admin;
- `GET /api/auth/me`;
- `GET /api/auth/empresas`;
- confirmacao de `modulos_ativos` explicito no payload de `/api/auth/empresas`;
- smoke autenticado com empresa esperada;
- checagem de que tenant novo nao enxerga dados da empresa atual;
- checagem de que empresa atual nao enxerga dados do tenant novo;
- revisao visual de modulos ocultos.

## 9. Rollback/Offboarding

Ter definido antes de criar:

- responsavel por suspensao de acesso;
- criterio para congelar onboarding;
- procedimento de revogacao de usuario;
- procedimento de ocultacao de tenant;
- checklist de retencao/exclusao conforme contrato.

## 10. O Que E Proibido

- Criar segunda empresa antes do smoke autenticado da empresa atual.
- Criar usuario real sem aprovacao operacional.
- Rodar seed/import em producao.
- Executar migration ou criar schema durante onboarding.
- Usar scripts SQL remotos fora do wrapper seguro.
- Executar `wrangler d1 execute --remote`.
- Expor modulos "em breve" ou "dados de teste" em demo/cliente.
- Versionar token, cookie, credenciais, dumps ou logs com PII.

## 11. Evidencias Obrigatorias Antes de Criar a Segunda Empresa

- Link/commit da correcao de assets.
- Resultado do probe `/api/assets/fira/123/test.pdf`.
- Resultado do smoke public-only.
- Resultado do smoke sem credencial (`SKIPPED_AUTH_REQUIRED`) ou autenticado read-only.
- Registro da matriz de modulos aprovada.
- Registro GO/NO-GO atualizado: `docs/AIRTRUST_SECOND_COMPANY_GO_NO_GO_v0_5.md`.
- Data quality validado localmente e executado por operador autorizado.
- Runbook de onboarding revisado.
- Confirmacao de que nao havera seed/import/migration/DB remoto.
