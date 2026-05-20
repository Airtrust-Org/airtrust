# Cloudflare Token – Permissões para Deploy SSOT

Data: 21/11/2025

## Objetivo

Criar um API Token com permissões suficientes para: deploy de Workers, execução de migrations D1 e futuras operações de auditoria.

## Escopos Necessários

Selecione os seguintes permissões (scopes):

- Workers Scripts: Edit
- Workers KV Storage: Read (se usar KV futuramente)
- D1: Edit
- Account Settings: Read
- R2 Storage: Read/Write (se scripts usarem backups via R2)
- Pages: Edit (para deploy de frontend, se aplicável)

## Passo a Passo

1. Acesse Cloudflare Dashboard → Meu Perfil → API Tokens.
2. Clique em "Create Token" → "Custom Token".
3. Adicione os escopos listados acima.
4. Restrinja ao Account específico (ID da conta AirTrust).
5. (Opcional) Defina políticas de expiração e rotação (ex: 90 dias).
6. Crie o token e copie imediatamente (não será mostrado novamente).
7. Salve em `.env` (não commitar):
   ```bash
   CLOUDFLARE_API_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxx
   ```

## Uso no Deploy

Exportar o token antes de executar wrangler:

```bash
export CLOUDFLARE_API_TOKEN=xxxxxxxx
cd worker-airtrust
npx wrangler deploy
```

## Validação Rápida

```bash
wrangler whoami
wrangler d1 list --remote
```

Devem retornar conta e lista de DBs sem erro de permissão.

## Rotação Segura

1. Gere novo token.
2. Atualize segredo em repositório privado/gerenciador.
3. Invalide token anterior.
4. Execute deploy para confirmar.

## Erros Comuns

| Erro                          | Causa                       | Solução            |
| ----------------------------- | --------------------------- | ------------------ |
| 403 Forbidden (deploy)        | Falta Workers Scripts: Edit | Adicionar escopo   |
| Falha ao aplicar migration D1 | Falta D1: Edit              | Adicionar escopo   |
| Erro acesso R2 backup         | Falta R2 Storage            | Incluir Read/Write |
| Pages deploy falha            | Falta Pages: Edit           | Incluir escopo     |
| whoami não retorna account    | Token errado ou expirado    | Gerar novamente    |

## Segurança

- Nunca commitar token em repositório público.
- Usar variável de ambiente em CI/CD.
- Preferir rotação periódica e alertas para uso indevido.

## Próximos Passos

- Integrar token ao pipeline automatizado de deploy.
- Adicionar validação `wrangler whoami` em script de pre-deploy.
