---
status: ativo
tipo: runbook
fonte_canonica: repo
ultimo_sha_verificado: ""
risco: critico
operacao: "Deploy em produção"
ultima_revisao: "2026-07-05"
ultimo_teste: ""
tempo_estimado: "15-20 min"
requer_autorizacao: true
tags:
  - runbook
  - deploy
  - risco/critico
---

# Runbook: Deploy Seguro

## Pré-condições
- [ ] Branch `main` atualizada e limpa (`git status --porcelain` vazio)
- [ ] `HEAD == origin/main`
- [ ] `npm run lint` passando
- [ ] `npx tsc --noEmit` sem erros
- [ ] `npm run test:all` passando
- [ ] Nenhuma migration pendente NÃO autorizada
- [ ] Autorização explícita do responsável técnico

## Gatilho
PR aprovada mergeada na `main` + decisão de deploy.

## ⚠️ NÃO EXECUTAR SE
- [ ] `npm run lint` falhou
- [ ] TypeScript com erros não documentados
- [ ] Testes quebrando
- [ ] Migration nova não revisada
- [ ] Sem autorização explícita

## Procedimento

### 1. Pre-flight
```bash
git fetch origin main
git checkout main
git merge --ff-only origin/main
npm run lint
npx tsc --noEmit
```

### 2. Deploy
```bash
npm run deploy
```

### 3. Verificação
```bash
# Health check
curl -fsSL https://airtrust-api-production.airtrust.workers.dev/api/health

# Pages check
curl -fsSL https://airtrust.online | head -200
```

## Rollback
```bash
# Worker é stateless — redeploy do commit anterior
git checkout <SHA_ANTERIOR>
npm run deploy:worker:only
git checkout main
```

## Evidências necessárias
- [ ] Log do `npm run lint`
- [ ] Log do `npm run deploy`
- [ ] Response do health check
- [ ] Response do Pages check

## Histórico de execuções
| Data | Executado por | Resultado | Observações |
|---|---|---|---|
| | | | |
