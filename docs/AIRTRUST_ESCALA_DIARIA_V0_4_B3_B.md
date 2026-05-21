# AIRTRUST v0.4-B3-b — Backend de Publicação Versionada da Escala Diária

## 1. Objetivo
Implementar publicação agregada por dia da Escala Diária (EVD), com revisão versionada, snapshot canônico e checksum determinístico, sem PDF nesta fase.

## 2. Estado inicial
- Branch: `main`
- HEAD de início: `71947424b6c280388cfbc87f1d04c1954f1cfa5b`
- `origin/main`: `95699e0b4de02bfda9ff1169e08e57c47dc4c36e`
- Ahead/behind no início: `0 5`
- Working tree sem alterações rastreadas antes da fase.

## 3. Migration criada
Arquivo:
- `worker-airtrust/migrations/0371_create_escala_voo_diaria_publicacoes.sql`

Tabela criada:
- `escala_voo_diaria_publicacoes`

Campos:
- `id TEXT PRIMARY KEY`
- `empresa_id TEXT NOT NULL`
- `data_ref TEXT NOT NULL`
- `revisao INTEGER NOT NULL`
- `status TEXT NOT NULL DEFAULT 'PUBLICADA'`
- `payload_json TEXT NOT NULL`
- `checksum TEXT NOT NULL`
- `observacoes TEXT NULL`
- `publicado_por TEXT NULL`
- `publicado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `deleted_at TEXT NULL`

Constraint:
- `UNIQUE (empresa_id, data_ref, revisao)`

Índices:
- `(empresa_id, data_ref, revisao)`
- `(empresa_id, data_ref, deleted_at)`
- `(checksum)`

## 4. Endpoints criados
No arquivo `worker-airtrust/src/routes/escalas-evd.ts`:

1. `POST /api/evd/publicacoes`
- Body:
  - `{ "data_ref": "YYYY-MM-DD", "observacoes": "opcional" }`
- Fluxo:
  - valida data;
  - busca itens EVD da data;
  - reaplica validações operacionais por item (PIC/SIC, duplicidade, repouso, bloqueios confiáveis);
  - calcula `revisao` = `MAX(revisao)+1` por `empresa_id + data_ref`;
  - monta snapshot canônico;
  - calcula checksum;
  - persiste publicação versionada;
  - marca itens do dia como `PUBLICADA` (compatibilidade);
  - retorna metadados da publicação e warnings operacionais.

2. `GET /api/evd/publicacoes?data=YYYY-MM-DD`
- Lista revisões da data (sem payload completo), ordenadas por revisão desc.

3. `GET /api/evd/publicacoes/:id`
- Retorna detalhe da publicação com `payload_json` parseado.

## 5. Formato do snapshot
Estrutura canônica (`schema_version: evd_daily_publicacao_v1`):
- `empresa_id`, `data_ref`, `revisao`, `status`, `publicado_por`, `publicado_em`, `observacoes`;
- `frms_resumo` (nesta fase: `included: false` com motivo explícito);
- `itens[]` contendo, por voo:
  - identidade e status;
  - aeronave (prefixo/modelo);
  - tripulação (PIC/SIC ids e nomes/guerra/função);
  - horários previstos/reais;
  - rota/missão;
  - observações gerais;
  - flags operacionais seguras (`repouso_minimo_ok`);
  - justificativas estruturadas vinculadas (`escala_voo_diaria_justificativas`).

## 6. Campos FRMS permitidos/proibidos
Permitido nesta fase no snapshot:
- não foi incluído resumo FRMS por item para evitar acoplamento/sensibilidade prematuros.

Proibido no snapshot (explicitamente não incluído):
- `kss_score`;
- horas de sono detalhadas;
- sintomas;
- meds/álcool;
- observações pessoais do check-in;
- qualquer dado clínico/comportamental sensível.

## 7. Checksum e canonicalização
Implementado no backend EVD:
- canonicalização JSON por ordenação estável de chaves recursiva;
- serialização determinística via `stableStringify`;
- hash SHA-256 (`crypto.subtle.digest`) em hexadecimal;
- checksum persistido em `escala_voo_diaria_publicacoes.checksum`.

## 8. Compatibilidade com publicação por item
- `POST /api/evd/:id/publicar` foi mantido sem remoção.
- Nova publicação oficial por revisão diária passa a existir em `POST /api/evd/publicacoes`.
- Compatibilidade preservada para fluxos legados que ainda publicam item individual.

## 9. Limitações desta fase
- Não há geração de PDF nesta fase (B3-c).
- Não há UI completa de histórico/revisões na tela diária.
- `frms_resumo` foi explicitamente mantido fora do snapshot por segurança nesta etapa.

## 10. Próximos passos
1. B3-c: UI de publicação diária e histórico de revisões na `EvdPage`.
2. B3-c: endpoint/fluxo oficial de PDF por revisão diária.
3. B3-c: export com cabeçalho de revisão, data e autor da publicação.
4. B4: preparação de distribuição por e-mail/WhatsApp.
