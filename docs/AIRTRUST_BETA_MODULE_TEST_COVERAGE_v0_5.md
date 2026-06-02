# AirTrust Beta Module Test Coverage v0.5

Data: 2026-06-02

## Objetivo

Registrar a cobertura mínima criada no Sprint E para módulos beta/ocultos, com foco em não exposição de menu, rota direta e superfície pública do worker.

## Inventário resumido

| Módulo | Status release | Rotas frontend | Endpoints worker | Testes existentes | Lacuna | Prioridade |
| --- | --- | --- | --- | --- | --- | --- |
| Hospedagem | BETA/OCULTO | `/hospedagem` via gating de menu e rota direta | `GET/POST /api/hospedagem*` | `module-access`, `navigation-module-gating`, `ProtectedRoute.module-gating`, `beta-module-public-surface` | Cobertura de fluxo funcional ainda leve | Alta |
| SGSO | BETA/OCULTO | `/sgso` via header/top nav e rota direta | `/api/sgso/*` | `module-access`, `Header.module-gating`, `ProtectedRoute.module-gating`, `beta-module-public-surface` | Cobertura funcional ainda leve | Alta |
| LMS/EAD | BETA/OCULTO | `/lms` via header/menu e rota direta | `/api/lms/*` | `module-access`, `navigation-module-gating`, `Header.module-gating`, `ProtectedRoute.module-gating`, `beta-module-public-surface` | Cobertura de contrato por rota ainda pode crescer | Alta |
| Treinamentos planejados | BETA/OCULTO | sem item dedicado no menu; rota direta `/treinamentos/planejados` | `/api/treinamentos/planejados*` | `module-access`, `ProtectedRoute.module-gating`, `beta-module-public-surface` | Foco em contrato e bloqueio direto | Média |
| SIGVOOS | BLOQUEADO | apenas referência de integração | `/api/configuracoes/integracoes/sigvoos*` | `module-access` | Permanece bloqueado e fora do piloto | Baixa |

## Cobertura adicionada no Sprint E

- `src/react-app/__tests__/module-access.test.ts`
- `src/react-app/__tests__/navigation-module-gating.test.ts`
- `src/react-app/components/__tests__/AppLayout.module-gating.test.tsx`
- `src/react-app/components/__tests__/ProtectedRoute.module-gating.test.tsx`
- `worker-airtrust/src/__tests__/architecture/beta-module-public-surface.test.ts`

## Contratos confirmados

1. Empresa sem `modulos_ativos` continua em modo legado.
2. Módulos beta/ocultos não aparecem no menu quando não liberados explicitamente.
3. Rota direta é bloqueada por `ProtectedRoute` quando o módulo não está ativo.
4. Worker não expõe as rotas beta sem `Authorization`.
5. SIGVOOS segue bloqueado.

## Lacunas restantes

- Cobertura funcional completa de Hospedagem, SGSO e LMS/EAD ainda depende de fluxos de negócio específicos.
- Treinamentos planejados ainda merece testes de contrato de escrita/leitura separados se a área crescer.
