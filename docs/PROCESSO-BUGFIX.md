# Processo de Bugfix — AirTrust Escalas

## Regra
Um bug só pode ser considerado corrigido quando há:

1. causa raiz identificada;
2. validação automatizada ou checklist cobrindo o fluxo real;
3. build limpo;
4. verificação pós-deploy.

## Fluxo obrigatório

### 1. Reproduzir
- registrar tela, payload ou rota que falhou;
- identificar se o bug é de frontend, backend, contrato ou dados.

### 2. Corrigir a causa raiz
- não apenas tratar o sintoma;
- preferir validação cedo no frontend e coerção segura no backend.

### 3. Adicionar prevenção
- incluir o caso no smoke test de Escalas;
- atualizar o checklist QA visual;
- quando viável, adicionar tipagem/validação específica.

### 4. Validar
- `npm run typecheck:escalas`
- `npm run build`
- `npm run smoke:escalas:local` ou `npm run smoke:escalas:prod`

### 5. Só então declarar pronto
- anexar evidência do build;
- anexar evidência do smoke test;
- citar arquivos alterados.

## Severidade
- **P0**: impede uso do fluxo principal
- **P1**: fluxo principal parcialmente quebrado
- **P2**: UX ruim ou confusa, mas com workaround
- **P3**: cosmético

## Template resumido

### BUG-XX — título
- Severidade:
- Causa raiz:
- Arquivos:
- Prevenção adicionada:
- Validação executada:
