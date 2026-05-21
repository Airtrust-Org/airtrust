# AIRTRUST v0.4-B3-c — UI de publicação, histórico de revisões e export/print da Escala Diária

## 1) Objetivo
Implementar interface mínima da Escala Diária para:
- publicar a escala do dia inteiro;
- listar histórico de revisões por data;
- visualizar snapshot de uma revisão publicada;
- exportar via print view (sem nova dependência de PDF);
- manter privacidade FRMS (sem dados sensíveis de check-in).

## 2) Estado inicial
- Base: commit `4ae9e153060ec246cd64c6957f65e0f596966ac4`.
- Backend já disponível (B3-b):
  - `POST /api/evd/publicacoes`
  - `GET /api/evd/publicacoes?data=YYYY-MM-DD`
  - `GET /api/evd/publicacoes/:id`
- Snapshot canônico: `evd_daily_publicacao_v1`.
- `frms_resumo.included = false` no snapshot por segurança nesta fase.

## 3) Arquivos alterados
- `src/react-app/pages/escalas/EvdPage.tsx`
- `docs/AIRTRUST_ESCALA_DIARIA_V0_4_B3_C.md`

## 4) UI de publicação diária
Adicionado botão **Publicar escala do dia** em `EvdPage`:
- desabilita quando não há itens no dia;
- pede confirmação;
- aceita observação opcional de publicação;
- chama `POST /api/evd/publicacoes` com `data_ref` e `observacoes`;
- mostra retorno com revisão e checksum curto;
- mantém compatibilidade com publicação por item (`POST /api/evd/:id/publicar`).

## 5) Histórico de revisões
Adicionado painel de histórico por data em `EvdPage`:
- carrega via `GET /api/evd/publicacoes?data=YYYY-MM-DD`;
- exibe revisão, status, checksum curto, publicado em e publicado por;
- ações:
  - **Ver revisão**;
  - **Imprimir revisão**.

## 6) Visualização de snapshot
Ao clicar em **Ver revisão**:
- busca `GET /api/evd/publicacoes/:id`;
- abre painel com:
  - data, revisão, status, publicado em/por, checksum;
  - itens da escala (aeronave, modelo, PIC/SIC, horários, rota/missão, observações);
  - justificativas estruturadas vinculadas.
- quando `frms_resumo.included=false`, mostra nota explícita.

## 7) Estratégia PDF/print
Implementado **print view frontend** com `window.print()`:
- geração HTML de impressão a partir do snapshot publicado;
- inclui cabeçalho operacional (data, revisão, status, publicado em, checksum);
- inclui tabela de itens e seção de justificativas;
- sem dependência nova de PDF;
- sem endpoint PDF server-side nesta fase.

## 8) Privacidade FRMS
Mantido princípio de minimização:
- o snapshot/print não inclui dados sensíveis de check-in;
- não expõe KSS, sono detalhado, sintomas, meds/álcool, observações pessoais;
- somente dados operacionais da escala e justificativas estruturadas.

## 9) Compatibilidade com publicação por item
Permanece suporte à publicação por item existente.
A nova publicação diária versionada é camada complementar para operação por dia/revisão.

## 10) Limitações
- Não implementa endpoint PDF dedicado (`/api/evd/publicacoes/:id/pdf`).
- Não implementa diff entre revisões na UI.
- Não implementa envio por e-mail/WhatsApp.
- Não altera permissões finas nesta fase.

## 11) Próximos passos
1. Aplicação controlada das migrations locais em ambiente homologado (sem produção direta).
2. B3-d: diff entre revisões e trilha de mudanças por item.
3. B4: entrega por e-mail/WhatsApp com política de destinatários.
4. Revisão de permissões por perfil para publicar, visualizar histórico e exportar.
