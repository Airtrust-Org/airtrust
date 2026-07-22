#!/bin/bash
echo "Verificando artefatos operacionais e caminhos locais..."
EXIT_CODE=0

# Lista de padrões proibidos (case insensitive onde aplicável)
FORBIDDEN_PATTERNS=(
  "/Users/"
  "/home/"
  "backups_production"
  "backups_staging"
  "tmp_"
  "\.dump"
  "\.audit"
  "output/"
)

for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
  # Ignora este próprio script, os hooks e outros testes
  MATCHES=$(git grep -i -E "$pattern" -- ':(exclude).github/scripts/check_sanitization.sh' ':(exclude).github/workflows/ci.yml' ':(exclude)test*' ':(exclude)*.test.*')
  if [ ! -z "$MATCHES" ]; then
    echo "Falha: Padrão proibido encontrado: $pattern"
    echo "$MATCHES"
    EXIT_CODE=1
  fi
done

if [ $EXIT_CODE -eq 0 ]; then
  echo "Sanitização OK."
fi
exit $EXIT_CODE
