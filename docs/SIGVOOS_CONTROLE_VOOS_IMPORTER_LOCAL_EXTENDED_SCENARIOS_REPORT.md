# SIGVOOS -> Controle de Voos Importer Local Extended Scenarios Report

## Veredito

`CENARIOS LOCAIS AMPLIADOS OK`

## Base e escopo

- Branch de trabalho: `codex/controle-voos-sigvoos-importer-scenarios`
- Baseline remoto confirmado em `origin/main`: `190a270427963e181012f1ba6001b89c8547a051`
- Nenhum deploy executado.
- Nenhuma migration aplicada fora do SQLite descartavel dos testes locais.
- Nenhuma chamada a API real SIGVOOS.
- Nenhuma credencial SIGVOOS usada.
- Nenhuma acao em staging, producao, D1 remoto, Cloudflare, R2 ou secrets.
- `worker-airtrust/src/lib/frms/frms-source-policy.ts` permaneceu intocado.
- Nenhuma integracao CV -> FRMS foi adicionada.

## Fixtures sinteticas adicionadas

- `worker-airtrust/src/__tests__/fixtures/sigvoos/sigvoos-multileg-flight-report-id.json`
- `worker-airtrust/src/__tests__/fixtures/sigvoos/sigvoos-multileg-sem-flight-report-id.json`
- `worker-airtrust/src/__tests__/fixtures/sigvoos/sigvoos-leg-number-duplicado.json`
- `worker-airtrust/src/__tests__/fixtures/sigvoos/sigvoos-multiple-null-legs.json`
- `worker-airtrust/src/__tests__/fixtures/sigvoos/sigvoos-staff-normalization-variants.json`
- `worker-airtrust/src/__tests__/fixtures/sigvoos/sigvoos-staff-id-inscription-conflict.json`
- `worker-airtrust/src/__tests__/fixtures/sigvoos/sigvoos-tripulante-repetido-mesma-etapa.json`
- `worker-airtrust/src/__tests__/fixtures/sigvoos/sigvoos-optional-missing-extra-sensitive.json`

Todos os dados sao sinteticos e nao incluem nomes reais, CPF, email real, telefone real, token real, endpoint real ou credenciais reais.

## Edge cases cobertos

- multiplas etapas no mesmo voo com `flight_report.id`
- multiplas etapas no mesmo voo sem `flight_report.id`
- idempotencia com payload multietapa
- `leg.number` duplicado no mesmo voo
- multiplos `leg.number = NULL` ou ausentes no mesmo voo
- `staff.inscription` como numero, string com zeros, string com espacos e string invalida
- conflito explicito quando `staff.id` e `staff.inscription` resolvem funcionarios diferentes
- tripulante repetido na mesma etapa
- campos opcionais ausentes
- campos extras inesperados preservados em staging sanitizado
- sanitizacao de chaves sensiveis (`token`, `secret`, `password`, `credential`)
- isolamento cross-tenant
- ausencia de qualquer escrita em FRMS

## Bugs encontrados e correcoes

### 1. Agrupamento incorreto de voo multietapa sem `flight_report.id`

Problema:
- a identidade do voo incluia dados de etapa (`leg.number`, ICAOs e horarios), o que fragmentava um mesmo voo em multiplos `cv_voos` quando o payload tinha varias pernas sem `flight_report.id`.

Correcao:
- `flightIdentityHash` passou a usar apenas atributos de nivel de voo (`date`, `reportNumber`, `flightNumber`, `aircraftRegistration`, `clientName`, `contractName`);
- `etapaIdentityHash` permaneceu responsavel pela identidade de etapa.

Resultado:
- payload multietapa sem `flight_report.id` agora cria um unico `cv_voos` e multiplas `cv_voo_etapas`;
- reimportacao do mesmo payload continua idempotente por staging hash.

### 2. Resolucao silenciosa quando `staff.id` e `staff.inscription` divergiam

Problema:
- o importador priorizava `staff.id` sem registrar conflito quando `staff.inscription` apontava para outro funcionario.

Correcao:
- a resolucao de tripulante passou a detectar divergencia explicita entre o mapeamento previo por `staff.id` e a normalizacao por `staff.inscription`;
- nesses casos o importador grava `cv_conflitos_integracao`, preserva o staging com `import_status = 'CONFLICT'` e nao cria `cv_voo_tripulantes`.

Resultado:
- o importador nao escolhe silenciosamente entre funcionarios conflitantes;
- nao cria funcionario automaticamente;
- nao resolve por nome livre;
- nao assume CANAC.

## Validacoes executadas

- `npx vitest run src/__tests__/services/controle-voos-sigvoos-importer.test.ts`
  - `PASS`
  - 16 testes cobrindo os cenarios originais e os ampliados
- `npx vitest run src/__tests__/migrations/controle-voos-sigvoos-integration-0411-schema.test.ts`
  - `PASS`
- `npx tsc --noEmit --pretty false`
  - `PASS`
- `git diff --check`
  - `PASS`
- `bash scripts/check-tracked-secrets.sh`
  - `PASS`
- `bash scripts/validation/audit-deploy-scripts.sh`
  - `PASS` como inventario; listou referencias historicas ja existentes a `migrations apply`
- `bash scripts/audit-dangerous-ops.sh`
  - `PASS` com warning preexistente sobre scripts locais/remotos a revisar, sem impacto neste escopo

## Arquivos alterados nesta fase

- `worker-airtrust/src/services/controle-voos/sigvoos-importer.ts`
- `worker-airtrust/src/__tests__/services/controle-voos-sigvoos-importer.test.ts`
- `worker-airtrust/src/__tests__/fixtures/sigvoos/*.json` novos cenarios sinteticos
- `docs/SIGVOOS_CONTROLE_VOOS_IMPORTER_LOCAL_EXTENDED_SCENARIOS_REPORT.md`

## Proxima recomendacao

- Revisao humana focada em semantica de agrupamento de voo multietapa e regras de conflito de tripulante.
- Se aprovado, manter a proxima fase em runner local/shadow mode, ainda sem endpoint publico, sem API real e sem alterar a politica canonica do FRMS.
