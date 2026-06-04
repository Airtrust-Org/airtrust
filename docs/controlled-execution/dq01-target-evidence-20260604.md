# AirTrust — DQ01 Target Evidence 2026-06-04

**Data:** 2026-06-04  
**Branch:** `main`  
**HEAD base:** `6df87e5`  
**Modo:** `local-copy`, sem D1 remoto, sem deploy, sem mutation.

## 1. Target escolhido

- **Nome do target:** `local-copy`
- **Tipo de ambiente:** cópia local isolada do D1 em estado Miniflare
- **Confirmação anti-produção:** este target não é `production`, não usa `--remote`, não usa database id remoto e não aponta para path/ref com `prod`, `production` ou `live`
- **Finalidade:** preparar a futura janela controlada de `DQ-01` com evidência rastreável antes de qualquer backfill real

## 2. Approval e responsável

- **Approval id:** `DQ01-LOCALCOPY-20260604-FILIPE`
- **Responsável pela janela:** `Filipe / workspace owner`
- **Restrição operacional:** não expor PII, não expor secrets e não registrar payloads de linha em logs

## 3. Evidência do banco alvo

- **DB path:** `worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/a36f84ea60804f30bb0c7f7cad9f5336a6cca0165abdab8b9241d93dbf0b6006.sqlite`
- **Legível:** `YES`
- **Tamanho observado:** `18821120 bytes`
- **Sinal estrutural:** `198` tabelas em `sqlite_master`
- **Observação:** o arquivo permanece local e não será commitado nem exportado no repositório

## 4. Regras de logging

- Logar apenas status, paths controlados, hashes, presença/ausência de evidência e contagens agregadas aprovadas
- Não logar linhas reais, nomes pessoais, tokens, cookies, SQL parametrizado sensível ou dumps de dados
