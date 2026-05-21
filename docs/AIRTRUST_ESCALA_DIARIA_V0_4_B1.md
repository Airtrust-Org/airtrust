# AIRTRUST — Escala Diária v0.4-B1

## Objetivo da fase
Harmonizar o EVD existente como **Escala Diária de Voo** dentro do módulo Escalas, preservando compatibilidade com a rota legada e sem mudanças de backend estrutural nesta etapa.

## Estado inicial
- Branch: `main`
- HEAD: `ec9e20845e06c79b250807916383548a6d15a6d0`
- origin/main: `95699e0b4de02bfda9ff1169e08e57c47dc4c36e`
- Divergência: `HEAD` 1 commit local à frente (`origin/main...HEAD = 0 1`)
- Working tree: sem tracked modified; apenas docs untracked.

## Arquivos alterados
- `src/react-app/App.tsx`
- `src/react-app/navigation.config.ts`
- `src/react-app/pages/escalas/EvdPage.tsx`
- `docs/AIRTRUST_ESCALA_DIARIA_V0_4_B1.md`

## Decisões desta fase
- Mantido o EVD como base técnica existente da Escala Diária (`/api/evd` + `escala_voo_diaria`).
- Criada rota frontend nova `/escalas/diaria` apontando para o mesmo componente atual da EVD.
- Mantida rota `/escalas/evd` para compatibilidade legada.
- Atualizada nomenclatura do menu para **Escala Diária de Voo**.
- Atualizado título/copy da página para linguagem de produto alinhada à Escala Diária.
- Inserido placeholder visual não invasivo para status FRMS diário (sem contrato backend novo).

## Escopo explicitamente não feito
- Não foram criadas migrations.
- Não houve alteração de tabela `escala_voo_diaria`.
- Não foi implementada persistência de justificativas operacionais.
- Não foi implementada publicação versionada.
- Não foi implementado PDF.
- Não houve alteração de SIGVOOS/cron.
- Não houve alteração de cálculo de fadiga/FRMS.
- Não houve mudança de permissões finas.
- Não houve remoção de `/escalas/evd`.

## Próximas fases sugeridas
- **B2**: regras de bloqueio/alerta com justificativa operacional.
- **B3**: publicação versionada e PDF oficial da escala diária.
- **B4**: integração mais profunda com FRMS e painel de não alocados.
- **B5**: distribuição por e-mail/WhatsApp.
