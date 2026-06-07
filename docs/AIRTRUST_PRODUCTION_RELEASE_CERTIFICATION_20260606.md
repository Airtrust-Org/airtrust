# AIRTRUST Production Release Certification — 2026-06-06

## Estado observado em produção antes de qualquer deploy
- Data da verificação: `2026-06-06`
- Frontend:
  - URL: `https://airtrust.online`
  - `meta build-version`: `808bb11`
  - assets: `index-BUKYSakV.js`, `index-RdVI0NCb.css`
- Worker:
  - URL: `https://api.airtrust.online/api/version`
  - resposta observada: `managed-by-script`
- Service worker:
  - `https://airtrust.online/sw.js`
  - `CACHE_VERSION = 'airtrust-v8'`

## Achados de release
| ID | Severidade | Achado |
| --- | --- | --- |
| R1 | Alto | frontend e worker não expõem a mesma versão observável |
| R2 | Alto | watcher de atualização monitorava `/manifest.json`, mas esse path em produção é o manifest de build do Vite |
| R3 | Médio | purge/validate scripts também apontavam para `/manifest.json` |

## Correções locais aplicadas
- Worker deixou de aceitar placeholder tracked como versão/build válidos.
- Frontend passou a observar a versão real servida em `index.html`.
- Web manifest foi movido para `/app.webmanifest`.
- Scripts de purge/validate foram alinhados ao novo path.

## Gates locais aprovados
- `npx tsc --noEmit`
- `cd worker-airtrust && npx tsc -p tsconfig.json --noEmit`
- `npm run lint`
- `npm run build`
- testes focados de worker e frontend relacionados ao incidente

## Deploy
- Não executado

## Reauditoria pós-deploy
- Não executada

## Rollback
- Não aplicável nesta sessão porque não houve publicação.
- Critério de rollback para próximo release:
  - qualquer tela crítica branca
  - qualquer zero falso em Gestão
  - qualquer modal de sessão abrindo sem hidratação
  - qualquer divergência visível entre `build-version` do frontend e `/api/version`

## Certificação
Esta sessão **não certifica produção publicada**. Ela certifica apenas que o pacote local corrigido passou gates locais relevantes e está pronto para uma janela controlada de deploy + smoke autenticado.
