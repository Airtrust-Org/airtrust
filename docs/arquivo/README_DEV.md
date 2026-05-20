# AirTrust - Guia Rápido de Desenvolvimento

## Comandos do dia a dia

### 1. Só FRONTEND (usando API STAGING)

```bash
./scripts/dev-frontend.sh
# Acessar: http://localhost:5173
```

### 2. Atualizar BACKEND em STAGING

```bash
./scripts/dev-api-staging.sh
# Usa: wrangler deploy --env=staging
```

### 3. Tudo de uma vez (opcional)

```bash
./scripts/dev-all.sh
# Sobe backend staging (rápido) e frontend dev
```

### 4. Resetar ambiente travado

```bash
./scripts/reset-dev-env.sh
```

### 5. Deploy para PRODUÇÃO

```bash
./scripts/deploy-production.sh
# Vai pedir confirmação digitando: SIM
```

## Como TRABALHAR NO DIA A DIA

1. Abrir VS Code na raiz do projeto.
2. No terminal:

```bash
./scripts/dev-frontend.sh
```

3. Codar frontend e testar em `http://localhost:5173`  
   (Ele sempre fala com API STAGING, nunca com localhost.)

4. Se mudar o backend:

```bash
./scripts/dev-api-staging.sh
```

5. Quando estiver tudo OK em staging, rodar:

```bash
./scripts/deploy-production.sh
```

## Regras de Ouro

- NÃO usar `wrangler dev --remote` no dia a dia; só em debug pesado.
- NÃO tentar "espelhar" dados de produção localmente.
- SEMPRE testar com API STAGING, que é estável.
- Produção só é alterada quando rodar o script de deploy e confirmar.
