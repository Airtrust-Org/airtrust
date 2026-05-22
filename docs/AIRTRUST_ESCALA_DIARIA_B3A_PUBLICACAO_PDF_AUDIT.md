# AIRTRUST v0.4-B3-a — Auditoria de Publicação Versionada e PDF da Escala Diária

## 1) Metadados Git
- Branch: `main`
- HEAD auditado: `71947424b6c280388cfbc87f1d04c1954f1cfa5b`
- `origin/main`: `95699e0b4de02bfda9ff1169e08e57c47dc4c36e`
- Ahead/behind (`origin/main...HEAD`): `0 5`
- Observação: auditoria realizada em working tree local com commits à frente de `origin/main`, sem `tracked modified` no início da fase.

## 2) Publicação atual no módulo Escalas (mensal)
### Achados
- O fluxo mensal já implementa máquina de estados de publicação em `worker-airtrust/src/routes/escalas-status.ts`.
- Transições suportadas: `rascunho -> em_revisao -> aprovada -> publicada`, com suporte a reabertura e republicação.
- Na publicação mensal, o sistema persiste snapshot estruturado em `escala_publicacao_snapshots`.
- Revisões já são tratadas por `numero_revisao` em `escalas_mensais` e campo `revisao` no snapshot.

### Endpoints existentes reutilizáveis como referência arquitetural
- `PATCH /api/escalas/:id/status`
- `GET /api/escalas/:id/snapshot-publicado`
- `GET /api/escalas/:id/revisoes`
- `GET /api/escalas/:id/revisoes/:rev`

### Regras úteis já consolidadas
- Primeira publicação mensal mantém revisão `0`.
- Republicação gera incremento de revisão.
- Snapshot preserva estado operacional para auditoria e comparação futura.

## 3) Export/PDF atual no projeto
### Escalas mensal
- Backend de exportação em `worker-airtrust/src/routes/escalas-exportacao.ts`:
  - `GET /api/escalas/:id/export?format=csv|html`
  - HTML já preparado para impressão/PDF (fluxo Ctrl+P).
- Frontend mensal possui fluxo robusto de exportação em:
  - `src/react-app/pages/escalas/views/EscalasDetalheView.tsx`
  - `src/react-app/pages/escalas/utils/exportarEscalaPDF.ts`
  - `src/react-app/pages/escalas/components/Modais/ModalExportarEscalaPdf.tsx`

### Padrão técnico de PDF no projeto
- Já existem bibliotecas e abordagens ativas no repositório:
  - Client-side: `jspdf`.
  - Server-side: `pdf-lib`.
  - HTML para print/PDF também é padrão em múltiplos módulos.
- Conclusão: não há necessidade de dependência nova para B3-b.

## 4) Publicação atual do EVD (Escala Diária)
### Contrato atual
- Rotas em `worker-airtrust/src/routes/escalas-evd.ts`.
- Publicação atual é por item (registro de voo), não por dia inteiro:
  - `POST /api/evd/:id/publicar`
- CRUD atual existe para item diário (`GET/POST/PUT/DELETE /api/evd...`).
- Justificativas estruturadas já existem por item:
  - `GET /api/evd/:id/justificativas`
  - `POST /api/evd/:id/justificativas`

### Dados atuais de publicação EVD
- `escala_voo_diaria` possui `status`, `aprovado_em`, `aprovado_por` (schema), `observacoes`, `created_at`, etc.
- Na implementação atual de publicar item, o update grava `status='PUBLICADA'` e `aprovado_em`.
- Não há objeto canônico de publicação por `empresa + data` com número de revisão.

## 5) Lacunas para publicação versionada diária
- Falta entidade de publicação agregada do dia (snapshot diário completo).
- Falta revisão diária explícita (`revisao`) independente do status por item.
- Falta histórico de publicações do dia com metadados (quem publicou, quando, checksum).
- Falta endpoint dedicado para listar revisões diárias.
- Falta endpoint dedicado para exportar PDF da revisão publicada diária.
- Falta garantia de congelamento do estado diário publicado (imutabilidade de revisão).

## 6) Modelo de dados recomendado para B3-b
## Tabela proposta: `escala_voo_diaria_publicacoes`
Campos recomendados:
- `id TEXT PRIMARY KEY`
- `empresa_id INTEGER NOT NULL`
- `data_ref TEXT NOT NULL` (`YYYY-MM-DD`)
- `revisao INTEGER NOT NULL` (0 para primeira publicação)
- `status TEXT NOT NULL` (`PUBLICADA`, `CANCELADA` opcional)
- `payload_json TEXT NOT NULL`
- `checksum TEXT NOT NULL`
- `publicado_por TEXT NULL`
- `publicado_em TEXT NOT NULL`
- `observacoes TEXT NULL`
- `created_at TEXT NOT NULL DEFAULT datetime('now')`
- `deleted_at TEXT NULL`

Índices recomendados:
- `(empresa_id, data_ref, revisao DESC)`
- `(empresa_id, data_ref, publicado_em DESC)`
- `(checksum)` opcional para rastreabilidade

### Chave de revisão
- Escopo de revisão recomendado: `empresa_id + data_ref`.
- Próxima revisão = `max(revisao)+1` para a mesma empresa/data.
- Primeira publicação do dia = revisão `0`.

### Conteúdo do `payload_json` (snapshot)
- Cabeçalho:
  - `empresa_id`, `data_ref`, `revisao`, `publicado_por`, `publicado_em`.
- Itens EVD do dia:
  - Campos operacionais necessários da `escala_voo_diaria`.
- Justificativas estruturadas relacionadas:
  - Registros de `escala_voo_diaria_justificativas` por item.
- Resumo FRMS permitido (sem dados sensíveis):
  - `status`, `status_label`, `requires_operational_review`, `data_source`, presença de alerta.
- Metadados de geração:
  - `snapshot_generated_at`, `schema_version`.

### Checksum
- Calcular hash estável do `payload_json` canônico (ordenação determinística) para trilha auditável e validação de integridade.

## 7) Endpoints recomendados para B3-b
- `POST /api/evd/publicacoes`
  - Publica o dia (`data_ref`) e cria nova revisão do snapshot diário.
- `GET /api/evd/publicacoes?data=YYYY-MM-DD`
  - Lista revisões da data.
- `GET /api/evd/publicacoes/:id`
  - Retorna snapshot completo da revisão.
- `GET /api/evd/publicacoes/:id/pdf`
  - Gera saída para PDF/print da revisão publicada.
- Opcional futuro:
  - `POST /api/evd/publicacoes/:id/cancelar`

### Organização de rotas
- Recomendação pragmática para B3-b: manter no `worker-airtrust/src/routes/escalas-evd.ts` inicialmente para reduzir risco.
- Se o arquivo crescer demais, extrair em seguida para `escalas-evd-publicacoes.ts`.

## 8) UX recomendada
Fluxo sugerido na Escala Diária:
- Botão principal: `Publicar escala do dia`.
- Pré-checagem:
  - Lista de bloqueios (hard blocks) retornados pelo backend.
  - Lista de alertas com justificativa já registrada.
- Confirmação de publicação:
  - Exibir número da próxima revisão.
- Histórico:
  - Painel de revisões do dia (R0, R1, R2...).
- Exportação:
  - Botão `Exportar PDF` por revisão.
- Marcação visual no documento:
  - Cabeçalho com data, revisão, publicado por, timestamp.

## 9) Dados no snapshot diário
Entram:
- Escala diária publicada por item (dados operacionais essenciais).
- Justificativas estruturadas por item.
- Resumo FRMS operacional por tripulante.
- Metadados de publicação/revisão.

Não entram:
- Dados clínicos/sensíveis do check-in de fadiga.
- Campos de relato pessoal detalhado.
- Conteúdo sensível não necessário para coordenação operacional ampla.

## 10) FRMS no snapshot/PDF: permitido vs proibido
### Permitido
- `status` resumido (`normal`, `attention`, `critical`, `unfit_for_duty`, `not_submitted`, `no_duty`).
- `status_label`.
- `requires_operational_review`.
- `data_source`.
- Presença/severidade de alerta diário.

### Proibido na visão ampla de escala/PDF
- `kss_score`.
- `horas_sono` / `horas_sono_48h` detalhadas.
- sintomas e texto livre (`symptoms_text`).
- dados de medicação/álcool (`meds_ult_12h`, `alcool_ult_12h`).
- observações pessoais de check-in.

## 11) Plano recomendado para B3-b
- Passo 1: criar migration de `escala_voo_diaria_publicacoes`.
- Passo 2: implementar `POST /api/evd/publicacoes` com revisão por data.
- Passo 3: implementar leitura de revisões (`GET list` e `GET detail`).
- Passo 4: implementar endpoint de exportação PDF por revisão.
- Passo 5: integrar botão de publicação diária e histórico na `EvdPage`.
- Passo 6: validar que publicação diária não expõe dados sensíveis FRMS.

## 12) Arquivos candidatos para B3-b
Backend:
- `worker-airtrust/migrations/XXXX_create_escala_voo_diaria_publicacoes.sql`
- `worker-airtrust/src/routes/escalas-evd.ts`
- Opcional: `worker-airtrust/src/routes/escalas-evd-publicacoes.ts`

Frontend:
- `src/react-app/pages/escalas/EvdPage.tsx`
- Opcional: novo componente modal/painel de revisões em `src/react-app/pages/escalas/components/...`

Reuso de referência:
- `worker-airtrust/src/routes/escalas-status.ts`
- `src/react-app/pages/escalas/views/EscalasDetalheView.tsx`
- `src/react-app/pages/escalas/utils/exportarEscalaPDF.ts`

## 13) Riscos
Riscos técnicos:
- Diferença semântica entre publicação mensal (escala inteira) e diária (empresa+data).
- Crescimento de payload se snapshot incluir campos desnecessários.
- Falta de canonicalização no hash pode quebrar comparabilidade entre revisões.

Riscos operacionais:
- Confusão de usuário se coexistirem publicação por item e publicação por dia sem UX clara.
- Risco de exposição indevida se FRMS detalhado for incluído no PDF.
- Republicações frequentes sem trilha visual podem dificultar rastreabilidade.

Mitigações:
- Definir publicação oficial do EVD no nível `empresa + data`.
- Congelar snapshot por revisão e exibir revisão em toda visualização/exportação.
- Aplicar whitelist explícita de campos FRMS no payload/PDF.

---

## Conclusão objetiva
- O projeto já tem padrão maduro de publicação versionada em Escalas mensais e padrão funcional de export/PDF.
- Para Escala Diária (EVD), B3-b deve reutilizar essa arquitetura, mas com escopo de revisão por `empresa + data`.
- B3-b exige migration local para nova tabela de publicações diárias; sem isso não há trilha versionada robusta/auditável.
