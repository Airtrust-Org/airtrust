# AirTrust Data Quality Execution Guide v0.5

Data: 2026-06-02

## Objetivo

Orientar a execucao segura dos checks de data quality antes da segunda empresa real. Este guia nao autoriza execucao remota por Codex nem alteracao de dados.

## Artefatos

- Catalogo: `docs/AIRTRUST_DATA_QUALITY_CHECKS_v0_5.md`
- SQL read-only: `scripts/validation/data-quality-checks-readonly.sql`
- Validador local: `scripts/validation/validate-data-quality-sql.sh`

## Politica de Execucao

- Executar somente por operador autorizado.
- Executar somente em ambiente aprovado e com credencial apropriada.
- Nao executar contra producao a partir de Codex.
- Nao usar `wrangler d1 execute --remote`.
- Nao salvar dumps, tokens, cookies, PII ou resultados sensiveis no repositorio.
- Tratar resultado como evidencial operacional, nao como dado para commit.

## Validacao Local do SQL

Antes de qualquer execucao operacional, validar que o arquivo permanece read-only:

```bash
bash scripts/validation/validate-data-quality-sql.sh
npm run validate:data-quality-sql
```

Aceite:

- nenhum comando proibido encontrado;
- nenhum `wrangler`, `d1 execute` ou `--remote`;
- todas as instrucoes efetivas iniciam com `SELECT`;
- script encerra com status `0`.

## Fluxo Recomendado

1. Confirmar branch limpa e `main` alinhada.
2. Rodar `npm run ops:guard`.
3. Validar o SQL localmente com o validador.
4. Exportar uma copia do SQL para o operador autorizado, fora do repositorio, se necessario.
5. Executar em ambiente aprovado usando ferramenta read-only.
6. Classificar achados como:
   - `BLOCKER`: impede segunda empresa;
   - `WARN`: corrige antes de carga/import;
   - `INFO`: acompanhar.
7. Registrar apenas resumo sem PII no dossie GO/NO-GO.

## Checks Bloqueantes

Sao bloqueantes para criar a segunda empresa:

- empresa ativa sem admin/manager;
- usuario ativo sem empresa;
- funcionario ativo sem empresa;
- escala ativa sem tenant valido;
- asset/documento privado em prefixo publico;
- dashboard com agregados de tenant incorreto;
- FRMS sem dados minimos para uso operacional.

## Resultado Esperado Antes do Onboarding

GO somente se:

- checks bloqueantes retornarem zero ou tiverem mitigacao aprovada;
- smoke autenticado read-only validar empresa esperada;
- modulos beta permanecerem ocultos por controle operacional ou gating implementado;
- nenhum script de seed/import/migration for necessario para a liberacao.

## Modelo de Registro Sem PII

```text
Data:
Ambiente:
Executor:
Hash do SQL:
Validador local:
BLOCKER:
WARN:
INFO:
Decisao:
Mitigacoes aprovadas:
```
