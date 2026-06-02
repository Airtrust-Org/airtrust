# AirTrust Beta Module Test Coverage v0.5

Data: 2026-06-02

## Objetivo

Registrar a cobertura mínima criada nos Sprints E/F para módulos beta/ocultos, com foco em não exposição de menu, rota direta, superfície pública do worker e contratos funcionais mínimos.

## Inventário resumido

| Módulo | Status release | Rotas frontend | Endpoints worker | Testes existentes | Lacuna | Prioridade |
| --- | --- | --- | --- | --- | --- | --- |
| Hospedagem | BETA/OCULTO | `/hospedagem` via gating de menu e rota direta | `GET/POST /api/hospedagem*` | `module-access`, `navigation-module-gating`, `ProtectedRoute.module-gating`, `beta-module-public-surface`, `hospedagem-beta-contract` | Cobertura funcional mínima agora cobre listagem, criação e validação simples | Alta |
| SGSO | BETA/OCULTO | `/sgso` via header/top nav e rota direta | `/api/sgso/*` | `sgso-nextgen-relatos-acoes-guards`, `sgso-auditorias-ncs-guards`, `module-access`, `Header.module-gating`, `ProtectedRoute.module-gating`, `beta-module-public-surface`, `sgso-relatos-beta-contract` | Cobertura funcional mínima agora cobre relatos, auditorias e workflow tenant-scoped | Alta |
| LMS/EAD | BETA/OCULTO | `/lms` via header/menu e rota direta | `/api/lms/*` | `module-access`, `navigation-module-gating`, `Header.module-gating`, `ProtectedRoute.module-gating`, `beta-module-public-surface`, `lms-cursos-beta-contract` | Cobertura funcional mínima agora cobre listagem e criação simples de cursos | Alta |
| Treinamentos planejados | BETA/OCULTO | sem item dedicado no menu; rota direta `/treinamentos/planejados` | `/api/treinamentos/planejados*` | `module-access`, `ProtectedRoute.module-gating`, `beta-module-public-surface` | Foco em contrato e bloqueio direto | Média |
| SIGVOOS | BLOQUEADO | apenas referência de integração | `/api/configuracoes/integracoes/sigvoos*` | `module-access` | Permanece bloqueado e fora do piloto | Baixa |

## Cobertura adicionada nos Sprints E/F

- `src/react-app/__tests__/module-access.test.ts`
- `src/react-app/__tests__/navigation-module-gating.test.ts`
- `src/react-app/components/__tests__/AppLayout.module-gating.test.tsx`
- `src/react-app/components/__tests__/ProtectedRoute.module-gating.test.tsx`
- `worker-airtrust/src/__tests__/architecture/beta-module-public-surface.test.ts`
- `worker-airtrust/src/__tests__/routes/hospedagem-beta-contract.test.ts`
- `worker-airtrust/src/__tests__/routes/lms-cursos-beta-contract.test.ts`
- `worker-airtrust/src/__tests__/routes/sgso-relatos-beta-contract.test.ts`

## Contratos confirmados

1. Empresa sem `modulos_ativos` continua em modo legado.
2. Módulos beta/ocultos não aparecem no menu quando não liberados explicitamente.
3. Rota direta é bloqueada por `ProtectedRoute` quando o módulo não está ativo.
4. Worker não expõe as rotas beta sem `Authorization`.
5. Hospedagem passou a ter contrato funcional mínimo de listagem, criação e validação de datas.
6. LMS/EAD passou a ter contrato funcional mínimo de listagem e criação simples de curso.
7. SGSO mantém contrato funcional mínimo em relatos, auditorias e workflow tenant-scoped.
8. SIGVOOS segue bloqueado.

## Lacunas restantes

- Hospedagem ainda pode crescer em contratos de update/checkout e cross-tenant explícito.
- SGSO ainda pode crescer em casos de transição e auditoria detalhada no fluxo principal de relatos.
- LMS/EAD ainda pode crescer em upload real e sincronização EdApp/EAD.
- Treinamentos planejados ainda merece testes de contrato de escrita/leitura separados se a área crescer.
