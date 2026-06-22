# AIRTRUST Emergency RBAC Maintenance Manager Hotfix — 2026-06-22

## 1. Resumo executivo

- Incidente: gestor voltou a conseguir acessar Manutenção/MRO por deep link e havia risco operacional de exibir o Painel Principal para perfis gestores.
- Risco: exposição indevida de telas de manutenção a perfis de tripulação/gestão comum e violação da regra temporária fail-closed do produto.
- Decisão: aplicar hotfix de contenção imediata no frontend, reforçando guardas de rota para MRO/Controle de Voos e bloqueando explicitamente o Painel Principal para qualquer usuário que não seja o admin principal allowlisted.
- Status: hotfix implementado localmente, em validação por testes/lint/build. Produção não foi alterada nesta etapa.

## 2. Causa raiz

- Frontend:
  - `ProtectedRoute` validava módulo ativo, mas não reaplicava a restrição especial de navegação para módulos internos/restritos (`mro`, `controle_voos`).
  - Resultado: mesmo com menu oculto, um `GESTOR` com módulo ativo podia abrir `/mro` ou `/controle-voos` por deep link.
  - O Painel Principal também não tinha guarda defensiva local, então a proteção dependia apenas do roteamento/home.
- Backend:
  - Não foi identificado endpoint operacional de MRO/manutenção de aeronaves servindo payload real para essas páginas. O conjunto `src/react-app/pages/mro/*` usa dados mockados locais.
  - As rotas `maintenance` encontradas no worker pertencem ao FRMS/SIGVOOS maintenance path e continuam protegidas por secret, fora do escopo do vazamento reportado.
- Classificação do incidente:
  - Nesta investigação local, o desvio confirmado foi de interface/roteamento frontend com dados mockados de MRO, não vazamento confirmado de payload real de API de manutenção.

## 3. Correções

- Arquivos alterados:
  - `src/react-app/components/ProtectedRoute.tsx`
  - `src/react-app/lib/module-access.ts`
  - `src/react-app/pages/DashboardPrincipal.tsx`
  - `src/react-app/App.tsx`
  - testes relacionados de `ProtectedRoute` e `DashboardPrincipal`
- Regras novas:
  - `mro` e `controle_voos` exigem a mesma política restrita usada no menu, inclusive para deep link.
  - `/dashboard` agora cai em `HomeRouter`, mantendo admin principal no painel e redirecionando os demais para rota segura.
  - `DashboardPrincipal` redireciona imediatamente para `/funcionarios` quando o usuário não é o admin principal allowlisted.
- Comportamento por perfil:
  - Admin principal allowlisted: mantém acesso ao Painel Principal e aos módulos restritos.
  - Gestor comum / gestor de tripulação: sem Painel Principal e sem acesso a MRO/Controle de Voos por menu ou deep link.
  - Admin comum não allowlisted: sem Painel Principal e sem módulos restritos.

## 4. Testes

- Comandos executados:
  - testes direcionados Vitest para `ProtectedRoute`, `DashboardPrincipal` e `HomeRouter`
  - `npm run lint`
  - `npm run build`
- Perfis cobertos:
  - gestor bloqueado em deep link MRO/Controle de Voos
  - admin principal allowlisted ainda liberado
  - gestor redirecionado para `/funcionarios` ao tentar renderizar o Painel Principal

## 5. Segurança operacional

- Produção não alterada até decisão explícita de deploy.
- Nenhum SQL de produção foi executado.
- Nenhuma migration/schema foi executada.
- `SIGVOOS` permaneceu intocado.
- Nenhum secret, token, cookie ou dado pessoal sensível foi exposto.

## 6. Decisão final

- Hotfix pronto para revisão e eventual deploy controlado, condicionado a testes locais/CI verdes.
- Como não houve confirmação local de payload real de manutenção por API, o incidente permanece tratado como regressão séria de RBAC/frontend, mas não como vazamento backend confirmado nesta investigação.
