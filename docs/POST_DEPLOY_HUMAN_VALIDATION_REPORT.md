# Post-Deploy Human Validation Report — AirTrust

## Data
- Data/hora: 2026-05-16
- Branch: main
- Commit deployado: 20b6bb104
- Worker deploy ID: 13f22eb5-f2be-4952-bc43-3c4845b0427e
- Frontend production: https://airtrust.online (Cloudflare Pages — branch production)
- Produção alterada nesta fase? não

---

## Contexto do deploy

Deploy controlado executado na Fase 19 (2026-05-16):
- Worker: `npx wrangler deploy --env production` — nova versão `13f22eb5`
- Frontend: `npx wrangler pages deploy --branch=production` — 224 arquivos
- D1 produção: não alterado
- Migrations: não executadas
- Smoke automatizado pós-deploy: health=200, version=200, auth=401, maintenance=403

---

## Validação humana

| Item | Resultado | Observação |
|------|-----------|------------|
| Login em produção (airtrust.online) | **PASS** | Confirmado pelo proprietário |
| Dashboard carrega | **PASS** | Confirmado pelo proprietário |
| Simuladores → Agenda | **PASS** | Calendário carrega corretamente |
| Sessão AW139 abre edição (não criação) | **PASS** | Fix da Fase 17 — stopPropagation funcionando |
| Aeronave Real / AW139 / PS-CDV pré-preenchidos | **PASS** | Dados corretos no modal de edição |
| Dia vazio abre criação | **PASS** | Modal de criação abre corretamente |
| Logout | **PASS** | Logout funciona normalmente |
| Rotas core respondem normalmente | **PASS** (automatizado) | health=200, auth=401, maintenance=403 |

---

## Resultado final

**PRODUÇÃO VALIDADA**

Validação humana completa confirmada por: **Filipe Passaroni Daumas**
Data da confirmação: 2026-05-16

Todos os itens: **PASS**
Rollback necessário: **não**

---

## Smoke automatizado

| Rota | Status esperado | Resultado |
|------|----------------|-----------|
| GET /api/health | 200 | PASS |
| GET /api/version | 200 | PASS |
| POST /api/auth/login (sem token) | 401 | PASS |
| GET /api/maintenance/status | 403 | PASS |

---

## Observações

- As sessões AW139 (IDs 61–64) agendadas para 2026-05-16 (17:15–18:15) foram verificadas no modal
- 8 e-mails de notificação enviados via Brevo na Fase 17 confirmados
- D1 rollback drill executado em 2026-05-16 — ver `docs/D1_ROLLBACK_DRILL_REPORT.md`

---

## Próximos passos

1. **Monitoramento**: acompanhar Workers logs nas próximas horas/dias
2. **Fase futura — RBAC**: coletar dados de uso de produção para implementar role `instructor` separada
3. **Fase futura — Dual requireRole**: consolidar `rbac.ts` e `auth.ts` em implementação única
4. **Fase futura — Logo staging**: obter token `Pages:Write` para sincronizar logo com produção
