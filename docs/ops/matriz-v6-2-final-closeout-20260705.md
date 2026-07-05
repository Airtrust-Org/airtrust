# Matriz V6.2 - Final Closeout - 2026-07-05

**Data:** 2026-07-05  
**Escopo:** fechamento final do hardening textual da Matriz V6.2, merge, deploy sem migration e apply controlado dos overrides finais de produção

## 1. Estado final

- PR de código: `#263` - `fix(simuladores): close matriz v6 final override hardening`
- Merge em `main`: `ccec3989e3ebc76843052a4c65f70ca65ec48497`
- Workflow de deploy: `Deploy AirTrust` run `28756116196`
- Resultado do deploy: `success`
- `Apply D1 migrations` no workflow: `skipped`
- APP_VERSION pública: `2026-07-05T21:52:52Z-ccec398`
- Worker Version ID (Cloudflare): `6fa7b4ae-fd8e-4939-8eae-bcbd151b1bf7`
- Pages deployment URL do workflow: `https://63c68805.airtrust.pages.dev`

## 2. Produção confirmada

Validações públicas pós-deploy:

- `https://api.airtrust.online/api/version` retorna `2026-07-05T21:52:52Z-ccec398`
- `https://airtrust.online/login` expõe `build-version="2026-07-05T21:52:52Z-ccec398"`
- `https://api.airtrust.online/api/health` retorna `healthy`
- endpoint protegido `GET /api/lms/cursos` permaneceu protegido no smoke do workflow

Validações read-only em D1 produção (`empresa_id = 6` quando aplicável):

- modelos ativos: `51`
- vínculos ativos modelo↔manobra: `918`
- catálogo NOTECHS canônico: `15` (`NOTECHS-01` ... `NOTECHS-15`)
- técnicas fora do padrão: `0`
- técnicas com metadata interna nos overrides críticos validados: `0`
- `fichas_sessao`: `224`
- `fichas_sessao_manobras`: `4706`
- `simulador_agendamentos`: `108`

Overrides finais aplicados e confirmados em produção:

| Modelo | Manobra | Relação | Texto final |
| --- | --- | ---: | --- |
| `A139-REQ-01` | `A139-CKL-01` | `3368` | `Normal checklist — preparação para reaquisição` |
| `A139-REQ-01` | `A139-EST-01` | `3381` | `Estacionamento e corte pós-voo` |
| `S76-REQ-01` | `S76-CKL-01` | `3447` | `Checklist e preparação para reaquisição` |
| `S76-REQ-01` | `S76-EST-01` | `3458` | `Encerramento pós-voo` |

## 3. Escopo explicitamente fora

- migration `0417` continua fora de `main`, fora do deploy e fora deste fechamento
- nenhuma migration rodou no workflow de deploy
- nenhum apply adicional foi feito fora do pacote controlado dos 4 overrides acima
- LMS, Qualificações, RBAC/auth, fichas históricas, sessões históricas, avaliações e trilhas não relacionadas não foram tocados

## 4. Revisão final

Checks e gates:

- PR `#263` mergeado com todos os checks verdes
- deploy de Worker e Pages concluído com smoke verde
- apply plan e backup produzidos antes do apply:
  - `artifacts/apply-plans/matriz-v6-2-final-overrides-20260705-184746-3c3f890e/`
  - `artifacts/db-backups/matriz-v6-2-final-overrides-pre-apply-20260705-184746-3c3f890e/`

Revisão visual:

- não foi possível executar navegação autenticada/visual nesta sessão porque nenhum backend de navegador estava disponível (`iab` e `extension` indisponíveis)
- em substituição, foi feita validação read-only por API pública, logs do deploy e consultas D1 linha a linha dos modelos críticos

Modelos críticos auditados read-only:

- `A139-REQ-01`
- `S76-REQ-01`
- `A139-S-02/02`
- `SK76-S-02/02`
- `S76-P-C1/VFR`
- `SK76-I-05/12`
- `TRE-INST`
- `CRED-EXA`

Resultado dessa auditoria final:

- todos os 8 modelos seguem com `18` técnicas
- nenhum deles embute NOTECHS dentro do modelo
- nenhum deles apresenta override suspeito com metadata interna
- os 4 overrides finais alvo estão corretos em produção

## 5. Ressalvas abertas

Nenhum risco `critical` ou `high` foi encontrado neste fechamento final. Permanecem ressalvas não bloqueantes para o release já implantado:

1. `A139-REQ-01` e `S76-REQ-01` ainda contêm outras técnicas com rótulo `noturna` no catálogo base, além dos 4 overrides finais aplicados. Isso não é vazamento técnico nem regressão de deploy, mas permanece como resíduo pedagógico/textual de baixa a média prioridade.
2. `A139-REQ-01` continua com pendência pedagógica de rebalanceamento do bloco final; o estado correto é `GO com ressalva`, não "rebalanceado".
3. A verificação visual autenticada da ficha real/PDF real continua pendente por indisponibilidade do backend de navegador nesta sessão.

## 6. GO / NO-GO final

- **GO:** merge em `main`, deploy de Worker/Pages e apply dos overrides finais de `A139-REQ-01` / `S76-REQ-01`
- **GO:** estado técnico de produção para o fechamento textual final da Matriz V6.2
- **GO com ressalva:** encerramento pedagógico pleno dos modelos de reaquisição, pelas ressalvas do item 5
- **NO-GO:** migration `0417` permanece fora deste release e não deve entrar sem fluxo próprio de revisão/staging/aprovação

## 7. Backlog imediato recomendado

1. Decidir se os resíduos `noturna` remanescentes em `A139-REQ-01` e `S76-REQ-01` serão mantidos por desenho instrucional ou removidos via novos overrides textuais.
2. Fazer revisão visual autenticada de pelo menos uma ficha real com override e uma ficha de `CRED-EXA`.
3. Tratar `0417` em trilha separada, com staging e autorização explícita.

## 8. Conclusão

O fechamento técnico final autorizado foi concluído: PR mergeado, deployado sem migration, produção saudável e os 4 overrides finais confirmados em D1 produção. O que resta aberto não invalida o release atual, mas deve ser preservado como ressalva documentada para a camada pedagógica e para eventual distribuição final de PDFs reais.
