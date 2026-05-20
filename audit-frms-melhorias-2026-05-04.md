# Auditoria FRMS - Melhorias e Hardening (2026-05-04)

Gerado em: 2026-05-04 (UTC)
Escopo: empresa 6 (producao), modulo FRMS + integracao SIGVOOS
Objetivo: enderecar itens CRITICO/PARCIAL e elevar robustez operacional/regulatoria

## 1) Resumo Executivo

Status geral apos intervencao: **APTO ROBUSTO COM RESSALVAS DOCUMENTAIS PONTUAIS**

Itens mandatarios concluidos:
- A1 (CRITICO): removido fluxo efetivo de senha SIGVOOS em texto puro no backend e migrado dado legado para armazenamento cifrado.
- A2 (PARCIAL): fallback de compliance alinhado para 80/90/95/101 na UI.
- A3 (PARCIAL): removida branch morta de cron `0 9` sem efeito funcional.
- B1 (coerencia cientifica): separacao explicita entre janela noturna operacional e WOCL fisiologica em codigo/comentarios/UI.

Itens de calibracao/evidencia:
- C1/C2: analise com dados reais de 3 meses executada e consolidada.
- D1: cruzamento FRMS x RBAC/manual parcialmente confirmado por evidencias internas; dependencias externas do Manual do Operador permanecem como pendencia documental controlada.
- E: propostas de alertas baseados em effectiveness formuladas como recomendacao (nao aplicadas silenciosamente).

---

## 2) Implementacoes Executadas

### A1 - Hardening SIGVOOS (CRITICO)

### Alteracoes tecnicas
- Backend passou a suportar `password_encrypted` com cifragem AES-GCM (modelo `enc:v1`).
- Chave de cifragem lida de segredo de ambiente dedicado (`SIGVOOS_CONFIG_ENCRYPTION_KEY`), com fallback controlado para segredo de autenticacao quando necessario.
- Chave legada `password` deixou de armazenar segredo legivel e passa a receber marcador tecnico `__WORKER_ENCRYPTED__`.
- Leitura de configuracao resolve senha de forma segura (decripta quando chave disponivel), sem reexposicao em payloads/logs.
- Eventos/erros de sync passaram a registrar `password` mascarado (`__REDACTED__`).

### Evidencia de migracao em producao
- Estado final validado no D1 (empresa 6):
  - `chave=password` -> `__WORKER_ENCRYPTED__`
  - `chave=password_encrypted` -> blob cifrado `enc:v1:...`
- Resultado: sem senha em texto puro remanescente na configuracao ativa auditada.

### Arquivos impactados
- `worker-airtrust/src/services/sigvoos-frms.ts`
- `worker-airtrust/src/routes/integracoes_sigvoos.ts`
- `worker-airtrust/src/cron/scheduled-handler.ts`
- `worker-airtrust/scripts/migrate-sigvoos-password-encryption.mjs`

---

### A2 - Compliance fallback 80/90/95/101 (PARCIAL -> RESOLVIDO)

### Alteracoes tecnicas
- Fallback de aviso ajustado de 85 para 80.
- Escala de compliance da UI agora coerente com a configuracao-alvo:
  - Alerta critico: `< 80`
  - Aviso: `80-89.9`
  - Bom: `90-94.9`
  - Excelente: `95-100` (limite superior operacional 101)

### Arquivo impactado
- `src/react-app/pages/frms/frmsUtils.ts`

---

### A3 - Limpeza de cron morto `0 9` (PARCIAL -> RESOLVIDO)

### Alteracoes tecnicas
- Branch diaria redundante sem efetividade removida do scheduler.
- Fluxo diario FRMS mantido no gatilho valido (`0 8`).

### Evidencia
- Busca no codigo sem ocorrencias funcionais remanescentes para branch `0 9` de FRMS.

### Arquivo impactado
- `worker-airtrust/src/cron/scheduled-handler.ts`

---

### B1 - Distincao WOCL fisiologica vs noturno operacional (coerencia cientifica)

### Alteracoes tecnicas
- Comentarios de calculo revisados para separar:
  - Janela noturna operacional (eventos de decolagem/pouso em horario noturno configurado)
  - WOCL fisiologica (janela circadiana de maior vulnerabilidade no despertar/sono)
- Textos de UI e ajuda atualizados para evitar sobreposicao conceitual.

### Arquivos impactados
- `worker-airtrust/src/lib/frms/calculos.ts`
- `src/react-app/pages/frms/FrmsConfiguracoes.tsx`
- `src/react-app/pages/frms/FrmsConceitos.tsx`

---

## 3) Calibracao C1/C2 com Dados Reais (3 meses)

Recorte analisado: ultimos 3 meses ate 2026-05-04, empresa 6, jornadas com fatorizacao valida.

### 3.1 Distribuicao geral de effectiveness (3 meses)
- Total jornadas: `109`
- Media effectiveness: `91.03`
- Minimo: `46.7`
- Maximo: `100`

Faixas:
- ALTA (`>=90`): `76`
- MODERADA (`77-89.9`): `12`
- DEGRADADA (`65-76.9`): `7`
- BAIXA (`<65`): `14`

Leitura tecnica:
- Existe massa relevante em zona alta, mas ha cauda de risco (14 jornadas <65) que justifica alertistica preditiva por tendencia e nao apenas por ponto unico.

### 3.2 Stressor (jornada longa) x effectiveness
- Sem madrugada + jornada longa: `n=3`, media `54.17`, minimo `46.7`
- Sem madrugada + jornada nao longa: `n=106`, media `92.07`, minimo `58.9`

Leitura tecnica:
- Com os dados atuais, jornada longa aparece como principal sinal de degradacao severa.
- O recorte nao mostrou linhas com `madrugada_flag=1` na definicao usada; recomenda-se revisar definicao de madrugada operacional x taxonomia de horarios para ampliar sensibilidade.

### 3.3 C2 - Coorte 15x15 e NNS

Resumo da coorte 15x15 detectada no periodo:
- Tripulantes 15x15 identificados: `1`
- Jornadas 15x15 no recorte: `15`
- Media effectiveness 15x15: `90.63`
- Minimo 15x15: `46.7`

NNS 30d (coorte 15x15):
- `NNS0-1`: total `15`, media `90.63`, minimo `46.7`
- Faixas `NNS2+`: sem ocorrencias no recorte

Dia de ciclo embarcado (coorte 15x15):
- `D1-5`: total `3`, media `69.67`, minimo `46.7`
- `OUTROS`: total `12`, media `95.88`, minimo `65.4`

Leitura tecnica:
- A amostra 15x15 e pequena no recorte (1 tripulante), insuficiente para conclusao estatistica forte sobre NNS.
- Mesmo assim, ha sinal operacional de degradacao concentrada no inicio de ciclo (D1-5), que merece monitoramento dirigido.

---

## 4) Cruzamento D1 - FRMS x RBAC x Manual

Base usada:
- Evidencias internas do projeto (auditorias FRMS/RBAC ja versionadas no repositorio, incluindo `audit-frms-sono-RBAC135.md`).

Status de confirmacao:
- Regras de repouso, acumulados e consistencia de fatorizacao: **confirmadas internamente**.
- Aderencia formal ao texto integral do Manual do Operador vigente: **parcialmente confirmada** (dependente de evidencia documental externa consolidada na trilha de auditoria).

Ressalva:
- Para fechar 100% de rastreabilidade regulatoria externa, recomenda-se anexar ao proximo ciclo de auditoria:
  - revisao cruzada item-a-item com secao equivalente do Manual do Operador em vigor,
  - assinatura de conformidade operacional/qualidade.

---

## 5) Propostas (E) - Alertas por Effectiveness (NAO aplicados automaticamente)

As mudancas abaixo sao recomendadas para proxima iteracao e **nao foram aplicadas silenciosamente**:

1. Alerta de tendencia (janela movel 7 dias)
- Disparar aviso se media 7d cair abaixo de 85, mesmo sem evento <80.

2. Alerta de degradacao recorrente por tripulante
- Disparar quando houver >=2 jornadas <77 em 14 dias para o mesmo tripulante.

3. Alerta de risco combinado
- Priorizar severidade quando coexistirem: jornada longa + dia de ciclo inicial + effectiveness <77.

4. Filtro de ruido
- Cooldown de notificacao por janela temporal para evitar spam operacional.

---

## 6) Conclusao Final

A missao de hardening solicitada foi executada com sucesso nos pontos criticos/parciais mandatarios (A1, A2, A3) e na coerencia cientifica (B1), com validacao de build e evidencias de producao.

O FRMS evolui de "apto com ressalvas" para **patamar robusto operacional**, mantendo apenas ressalva documental regulatoria externa (manual do operador) e ressalva estatistica de amostra para inferencia 15x15/NNS no recorte de 3 meses.

## 7) Pendencias Controladas
- Consolidar trilha formal FRMS x Manual do Operador (evidencia assinada).
- Expandir janela de analise 15x15/NNS (ideal >= 6-12 meses ou coorte maior) antes de alterar limites estruturais.
- Avaliar implementacao incremental dos alertas de tendencia propostos no bloco E.

## 8) Checklist de Aceite da Missao
- [x] Correcoes CRITICO/PARCIAL implementadas
- [x] Hardening de segredo com migracao em producao
- [x] Coerencia WOCL x noturno separada em codigo/UI
- [x] Analise C1/C2 com dados reais executada
- [x] Propostas E apresentadas sem aplicacao silenciosa
- [x] Relatorio final de melhorias gerado
